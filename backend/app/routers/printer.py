from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
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
from app.core.security import require_role

router = APIRouter(prefix="/printers", tags=["Printers"])


# ==============================
# CREATE PRINTER
# ==============================

@router.post("/", response_model=PrinterResponse)
def create_printer(printer: PrinterCreate, db: Session = Depends(get_db)):
    db_printer = Printer(
        name=printer.name,
        ip_address=printer.ip_address,
        type=printer.type,
        brand=printer.brand,
        model=printer.model,
        location=printer.location,
        camera_url=printer.camera_url,
        status="offline",
        progress=0,
        current_file=None,
        last_seen=datetime.utcnow(),
    )
    try:
        db.add(db_printer)
        db.commit()
        db.refresh(db_printer)
        return db_printer
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Printer with this name already exists")


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
        # check name uniqueness
        existing = db.query(Printer).filter(
            Printer.name == data.name,
            Printer.id != printer_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Printer name already in use")
        printer.name = data.name

    if data.ip_address is not None:
        printer.ip_address = data.ip_address
    if data.location is not None:
        printer.location = data.location
    if data.camera_url is not None:
        printer.camera_url = data.camera_url

    try:
        db.commit()
        db.refresh(printer)
        return {"message": "Printer updated", "id": printer.id, "name": printer.name, "ip_address": printer.ip_address}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Printer name already in use")


# ==============================
# PAUSE
# ==============================

@router.post("/{printer_id}/pause")
async def pause_print(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
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
async def start_next_job(printer_id: int, db: Session = Depends(get_db)):
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
    active_job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation", "printing"]),
    ).first()
    if active_job:
        raise HTTPException(status_code=400, detail="Cannot delete printer with active jobs")
    db.delete(printer)
    db.commit()
    return {"message": "Printer deleted successfully"}