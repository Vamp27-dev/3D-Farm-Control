from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional

import httpx

from app.core.database import get_db
from app.models.job_history import JobHistory
from app.models.printer import Printer
from app.models.tag import Tag
from app.models.batch_printer import BatchPrinter
from app.models.batch import Batch
from app.models.file import File

from app.schemas.printer import PrinterCreate, PrinterResponse
from app.services.printer_service import upload_file_to_printer, start_print
from app.services import centauri_service as centauri
from app.core.security import require_role

router = APIRouter(prefix="/printers", tags=["Printers"])


# ==============================
# CREATE PRINTER
# ==============================

@router.post("/", response_model=PrinterResponse)
def create_printer(printer: PrinterCreate, db: Session = Depends(get_db)):
    name = printer.name.strip()
    ip = printer.ip_address.strip()

    # ✅ Explicit, specific duplicate checks -- checked across ALL printers
    # regardless of type (Neptune + Centauri share one name/IP namespace,
    # since they're the same physical network and the same farm). Doing
    # this ourselves (instead of relying only on the DB's unique
    # constraint on name, which also doesn't cover ip_address at all)
    # lets us give the person the exact right message for each case.
    existing_name = db.query(Printer).filter(func.lower(Printer.name) == name.lower()).first()
    if existing_name:
        raise HTTPException(status_code=400, detail="Printer name already exists")

    existing_ip = db.query(Printer).filter(Printer.ip_address == ip).first()
    if existing_ip:
        raise HTTPException(status_code=400, detail="Printer already added")

    # ✅ Auto-set camera URL for Centauri — always at {ip}:3031/video
    camera_url = printer.camera_url
    if not camera_url and printer.type == "centauri":
        camera_url = f"http://{ip}:3031/video"

    db_printer = Printer(
        name=name,
        ip_address=ip,
        type=printer.type,
        brand=printer.brand,
        model=printer.model,
        location=printer.location,
        camera_url=camera_url,
        status="offline",
        progress=0,
        current_file=None,
        last_seen=datetime.utcnow(),
    )
    try:
        db.add(db_printer)
        db.commit()
        db.refresh(db_printer)

        # ✅ Start a persistent WebSocket listener if this is a Centauri printer
        if db_printer.type == "centauri":
            centauri.start_listener(db_printer.id, db_printer.ip_address)

        return db_printer
    except IntegrityError:
        # Fallback safety net in case of a race between the check above
        # and the insert (two requests at almost the same instant).
        db.rollback()
        raise HTTPException(status_code=400, detail="Printer name already exists")


# ==============================
# LIST PRINTERS
# ==============================

@router.get("/", response_model=list[PrinterResponse])
def list_printers(db: Session = Depends(get_db)):
    return db.query(Printer).all()


# ==============================
# UPDATE PRINTER (admin only)
# ==============================

class PrinterUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[str] = None
    camera_url: Optional[str] = None

@router.patch("/{printer_id}", dependencies=[Depends(require_role(["admin"]))])
def update_printer(printer_id: int, data: PrinterUpdate, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if data.name is not None:
        name = data.name.strip()
        # ✅ case-insensitive check, across all printer types
        existing = db.query(Printer).filter(
            func.lower(Printer.name) == name.lower(),
            Printer.id != printer_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Printer name already exists")
        printer.name = name

    if data.ip_address is not None:
        ip = data.ip_address.strip()
        # ✅ IP uniqueness wasn't checked at all before -- across all
        # printer types, since two printers can't share one network address.
        existing_ip = db.query(Printer).filter(
            Printer.ip_address == ip,
            Printer.id != printer_id
        ).first()
        if existing_ip:
            raise HTTPException(status_code=400, detail="Printer already added")
        ip_changed = ip != printer.ip_address
        printer.ip_address = ip
    else:
        ip_changed = False

    if data.location is not None:
        printer.location = data.location
    if data.camera_url is not None:
        printer.camera_url = data.camera_url

    try:
        db.commit()
        db.refresh(printer)

        # ✅ If the IP changed on a Centauri printer, restart its listener
        # thread so it reconnects to the new address
        if ip_changed and printer.type == "centauri":
            centauri.start_listener(printer.id, printer.ip_address)

        return {"message": "Printer updated", "id": printer.id, "name": printer.name, "ip_address": printer.ip_address}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Printer name already exists")


# ==============================
# PAUSE
# ==============================

@router.post("/{printer_id}/pause")
async def pause_print(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if printer.type == "centauri":
        # ✅ Try in-memory listener registry first (handles race condition
        # where DB hasn't been written yet but listener already knows the ID)
        mainboard_id = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
        if not mainboard_id:
            raise HTTPException(status_code=502, detail="Printer not yet discovered — try again in a few seconds")
        resp = await centauri.pause_print(printer.id, mainboard_id)
        if resp is None:
            raise HTTPException(status_code=502, detail="Cannot reach printer")
        return {"message": "Print paused"}

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(f"http://{printer.ip_address}/printer/print/pause")
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Printer returned {res.status_code}")
        return {"message": "Print paused"}
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot reach printer")


# ==============================
# RESUME
# ==============================

@router.post("/{printer_id}/resume")
async def resume_print(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if printer.type == "centauri":
        # ✅ Try in-memory listener registry first (handles race condition
        # where DB hasn't been written yet but listener already knows the ID)
        mainboard_id = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
        if not mainboard_id:
            raise HTTPException(status_code=502, detail="Printer not yet discovered — try again in a few seconds")
        resp = await centauri.resume_print(printer.id, mainboard_id)
        if resp is None:
            raise HTTPException(status_code=502, detail="Cannot reach printer")
        return {"message": "Print resumed"}

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(f"http://{printer.ip_address}/printer/print/resume")
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Printer returned {res.status_code}")
        return {"message": "Print resumed"}
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot reach printer")


# ==============================
# ✅ FIXED CANCEL
# ==============================

@router.post("/{printer_id}/cancel")
async def cancel_print(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    printer_error = None

    # ✅ FIX: always update DB regardless of printer response
    # Moonraker cancel can return non-200 but still cancel successfully
    if printer.type == "centauri":
        cancel_mb_id = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
        if not cancel_mb_id:
            printer_error = "Printer not yet discovered — DB updated anyway"
        else:
            try:
                # ✅ Set cancellation lock BEFORE sending command so status
                # pushes arriving during shutdown don't overwrite the idle state
                centauri.set_printer_cancelling(printer.id)
                resp = await centauri.cancel_print(printer.id, cancel_mb_id)
                if resp is None:
                    printer_error = "Could not reach printer — DB updated anyway"
            except Exception as e:
                printer_error = str(e)
    else:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.post(f"http://{printer.ip_address}/printer/print/cancel")
            if res.status_code not in (200, 201, 204):
                printer_error = f"Printer returned {res.status_code} but job was cancelled"
        except httpx.ConnectError:
            printer_error = "Could not reach printer — DB updated anyway"
        except Exception as e:
            printer_error = str(e)

    # Always clean up DB and write history
    job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status == "printing"
    ).first()

    if job:
        job.status       = "cancelled"
        job.completed_at = datetime.utcnow()

        # ✅ Write to history so cancelled jobs appear in Print History
        duration = (
            int((job.completed_at - job.started_at).total_seconds())
            if job.started_at else 0
        )
        file_id = None
        try:
            file_id = job.batch.file_id
        except Exception:
            pass

        history = JobHistory(
            printer_id=printer_id,
            batch_id=job.batch_id,
            file_id=file_id,
            status="cancelled",
            started_at=job.started_at,
            completed_at=job.completed_at,
            duration_seconds=duration,
        )
        db.add(history)

    printer.status       = "idle"
    printer.progress     = 0
    printer.current_file = None
    db.commit()

    # ✅ Check if batch should auto-archive (all jobs terminal)
    if job:
        from app.routers.batch import check_and_archive_batch
        check_and_archive_batch(db, job.batch_id)

    return {
        "message": "Print cancelled",
        "warning": printer_error,
    }


# ==============================
# ASSIGN TAG
# ==============================

@router.post("/{printer_id}/assign-tag/{tag_id}")
def assign_tag_to_printer(printer_id: int, tag_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    printer.tags.append(tag)
    db.commit()
    return {"message": "Tag assigned successfully"}


# ==============================
# START NEXT JOB
# ==============================

@router.post("/{printer_id}/start_next")
async def start_next_job(
    printer_id: int,
    db: Session = Depends(get_db),
    bed_leveling: bool = True,
    plate_type: int = 0,
    time_lapse: bool = False,
):
    """
    bed_leveling / plate_type / time_lapse are Centauri-only options
    (ignored for Klipper/Neptune printers -- ✅ Neptune code path below
    is untouched and never receives them).
      plate_type: 0 = Textured (Side A), 1 = Smooth (Side B)
    """
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    if printer.status in ("printing", "paused"):
        raise HTTPException(status_code=400, detail="Printer already has an active job")

    next_job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"]),
    ).order_by(BatchPrinter.id.asc()).first()

    if not next_job:
        raise HTTPException(status_code=404, detail="No jobs in queue")

    batch = db.query(Batch).filter(Batch.id == next_job.batch_id).first()
    file = db.query(File).filter(File.id == batch.file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = f"/app/storage/{file.stored_name}"

    if printer.type == "centauri":
        # ✅ Try in-memory listener registry first (handles race condition
        # where DB hasn't been written yet but listener already knows the ID)
        mainboard_id = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
        if not mainboard_id:
            raise HTTPException(status_code=502, detail="Printer not yet discovered — try again in a few seconds")
        try:
            from app.services.centauri_upload import upload_file_to_centauri
            upload_result = await upload_file_to_centauri(printer.ip_address, file_path, file.original_name)
            if not upload_result["success"]:
                raise HTTPException(status_code=500, detail="Upload to Centauri printer failed")
            mainboard_id_for_start = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
            await centauri.start_print(
                printer.id, mainboard_id_for_start, upload_result["remote_path"],
                bed_leveling=bed_leveling, plate_type=plate_type, time_lapse=time_lapse,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        try:
            uploaded_filename = await upload_file_to_printer(printer.ip_address, file_path)
            await start_print(printer.ip_address, uploaded_filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    next_job.status = "printing"
    next_job.started_at = datetime.utcnow()
    printer.status = "printing"
    printer.progress = 0
    printer.current_file = file.original_name
    printer.last_seen = datetime.utcnow()
    db.commit()
    return {"message": "Print started successfully"}


# ==============================
# GET QUEUE
# ==============================

@router.get("/{printer_id}/queue")
def get_printer_queue(printer_id: int, db: Session = Depends(get_db)):
    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"]),
    ).all()

    # ✅ Include batch name so frontend can show "Batch — {name}" instead of raw IDs
    result = []
    for job in jobs:
        batch = db.query(Batch).filter(Batch.id == job.batch_id).first()
        result.append({
            "id": job.id,
            "printer_id": job.printer_id,
            "batch_id": job.batch_id,
            "batch_name": batch.name if batch else f"Batch {job.batch_id}",
            "status": job.status,
            "position": job.position,
        })
    return result


# ==============================
# CLEAR QUEUE
# ==============================

@router.post("/{printer_id}/queue/clear")
def clear_printer_queue(printer_id: int, db: Session = Depends(get_db)):
    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"]),
    ).all()
    for job in jobs:
        job.status = "cancelled"
        job.completed_at = datetime.utcnow()
    db.commit()
    return {"message": "Queue cleared"}


# ==============================
# DELETE PRINTER (admin only)
# ==============================

@router.delete("/{printer_id}", dependencies=[Depends(require_role(["admin"]))])
def delete_printer(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    # Only block delete if printer is ACTIVELY printing right now
    if printer.status == "printing":
        raise HTTPException(status_code=400, detail="Cannot delete a printer while it is actively printing")

    # FIX: Delete ALL batch_printer records for this printer regardless of
    # status. Old printers that ran batches have completed/failed/cancelled
    # records still referencing them via FK -- those block db.delete(printer)
    # with an integrity error. Must remove every batch_printer row first.
    all_jobs = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
    ).all()
    for job in all_jobs:
        db.delete(job)

    # Also remove job_history records referencing this printer (FK constraint)
    history_records = db.query(JobHistory).filter(
        JobHistory.printer_id == printer_id,
    ).all()
    for record in history_records:
        db.delete(record)

    # Stop the Centauri listener thread before removing the DB record
    if printer.type == "centauri":
        centauri.stop_listener(printer.id)

    db.delete(printer)
    db.commit()
    return {"message": "Printer deleted successfully"}




# ══════════════════════════════════════════════════════════════════
# SET TEMPERATURE — works for both Klipper and Centauri
# ══════════════════════════════════════════════════════════════════

class TempTarget(BaseModel):
    extruder: Optional[float] = None   # None = don't change
    bed:      Optional[float] = None   # None = don't change


@router.post("/{printer_id}/set_temp")
async def set_temperature(printer_id: int, body: TempTarget, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if printer.type == "centauri":
        from app.services import centauri_protocol as proto

        mb_id = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
        if not mb_id:
            raise HTTPException(status_code=502, detail="Printer not yet discovered — wait a few seconds and retry")

        payload: dict = {}
        if body.extruder is not None:
            payload["TempTargetNozzle"] = int(body.extruder)
        if body.bed is not None:
            payload["TempTargetHotbed"] = int(body.bed)

        if not payload:
            return {"message": "No temperature targets specified"}

        # FIX: route through the listener's single open connection
        # (send_command_via_listener) instead of opening a standalone one
        # via proto.send_command. Opening a second WebSocket while the
        # listener's connection is live is what crashed the firmware.
        try:
            await centauri.send_command_via_listener(
                printer.id, proto.Cmd.EDIT_PRINTER_STATUS_DATA, payload,
                wait_for_response=False,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to send temp command: {e}")

        return {"message": "Temperature targets set"}

    else:
        # Klipper — use SET_HEATER_TEMPERATURE gcode
        gcodes = []
        if body.extruder is not None:
            gcodes.append(f"SET_HEATER_TEMPERATURE HEATER=extruder TARGET={int(body.extruder)}")
        if body.bed is not None:
            gcodes.append(f"SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET={int(body.bed)}")

        if not gcodes:
            return {"message": "No temperature targets specified"}

        script = "\n".join(gcodes)
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.post(
                    f"http://{printer.ip_address}/printer/gcode/script",
                    json={"script": script}
                )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=502, detail=f"Klipper returned {res.status_code}")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot reach printer")

        return {"message": "Temperature targets set"}


# ══════════════════════════════════════════════════════════════════
# TOGGLE LIGHT — Centauri only (Klipper printers have no unified light API)
# ══════════════════════════════════════════════════════════════════

class LightBody(BaseModel):
    on: bool


@router.post("/{printer_id}/light")
async def toggle_light(printer_id: int, body: LightBody, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if printer.type != "centauri":
        raise HTTPException(status_code=400, detail="Light control only supported on Centauri printers")

    from app.services import centauri_protocol as proto

    mb_id = centauri.get_mainboard_id_for(printer.id) or printer.mainboard_id or ""
    if not mb_id:
        raise HTTPException(status_code=502, detail="Printer not yet discovered — wait a few seconds and retry")

    # FIX: route through the listener's single open connection instead of
    # opening a standalone one — same freeze risk as set_temp above.
    try:
        await centauri.send_command_via_listener(
            printer.id,
            proto.Cmd.EDIT_PRINTER_STATUS_DATA,
            {"LightStatus": {"SecondLight": body.on, "RgbLight": [0, 0, 0]}},
            wait_for_response=False,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send light command: {e}")

    # ✅ Optimistic update -- reflects instantly in the UI. The next status
    # push from the printer (normalize_status -> light_on) will correct
    # this automatically if it doesn't match reality, e.g. if the command
    # silently failed, or if someone changes it from the printer's own
    # panel a moment later.
    printer.light_on = body.on
    db.commit()

    return {"message": f"Light turned {'on' if body.on else 'off'}"}

# ══════════════════════════════════════════════════════════════════
# DEBUG — inspect raw Moonraker response for a printer
# Usage: GET /printers/{id}/debug_moonraker
# ══════════════════════════════════════════════════════════════════

@router.get("/{printer_id}/debug_moonraker")
async def debug_moonraker(printer_id: int, db: Session = Depends(get_db)):
    """
    Returns raw data from Moonraker for debugging.
    Open in browser: http://<server>:8000/printers/<id>/debug_moonraker
    """
    import httpx

    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    ip = printer.ip_address

    try:
        # 1. List all available Klipper objects
        async with httpx.AsyncClient(timeout=5) as client:
            obj_res  = await client.get(f"http://{ip}/printer/objects/list")
            objects  = obj_res.json().get("result", {}).get("objects", [])

            # 2. Query the key objects we care about
            sensor_key = next((o for o in objects if o.startswith("filament")), None)
            query = "print_stats&virtual_sdcard&pause_resume"
            if sensor_key:
                query += f"&{sensor_key}"

            data_res = await client.get(f"http://{ip}/printer/objects/query?{query}")
            data     = data_res.json().get("result", {}).get("status", {})

        return {
            "printer_name": printer.name,
            "printer_ip":   ip,
            "filament_sensor_found": sensor_key,
            "all_objects": objects,
            "print_stats": data.get("print_stats"),
            "pause_resume": data.get("pause_resume"),
            "filament_sensor": data.get(sensor_key) if sensor_key else None,
            "db_error_message": printer.error_message,
        }

    except Exception as e:
        return {"error": str(e), "printer_ip": ip}