from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy.exc import IntegrityError

import httpx

from app.core.database import get_db
from app.models.printer import Printer
from app.models.tag import Tag
from app.models.batch_printer import BatchPrinter
from app.models.batch import Batch
from app.models.file import File

from app.schemas.printer import PrinterCreate, PrinterResponse

from app.services.printer_service import (
    upload_file_to_printer,
    start_print,
)

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
# LIST PRINTERS — returns DB state (poller keeps it fresh)
# ==============================

@router.get("/", response_model=list[PrinterResponse])
def list_printers(db: Session = Depends(get_db)):
    return db.query(Printer).all()


# ==============================
# ✅ PAUSE — proxied through backend to avoid browser CORS
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
# ✅ RESUME — proxied through backend
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
# ✅ CANCEL — proxied through backend
# ==============================

@router.post("/{printer_id}/cancel")
async def cancel_print(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(f"http://{printer.ip_address}/printer/print/cancel")
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Printer returned {res.status_code}")
        # Mark any active job as cancelled in DB
        job = db.query(BatchPrinter).filter(
            BatchPrinter.printer_id == printer_id,
            BatchPrinter.status == "printing"
        ).first()
        if job:
            job.status = "cancelled"
            job.completed_at = datetime.utcnow()
        printer.status = "idle"
        printer.progress = 0
        printer.current_file = None
        db.commit()
        return {"message": "Print cancelled"}
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot reach printer")


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
# COMPLETE PRINT JOB
# ==============================

@router.post("/{printer_id}/complete")
def complete_print(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status == "printing",
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="No active job")
    job.status = "completed"
    job.completed_at = datetime.utcnow()
    printer.status = "idle"
    printer.progress = 100
    printer.current_file = None
    db.commit()
    return {"message": "Print completed"}


# ==============================
# GET QUEUE
# ==============================

@router.get("/{printer_id}/queue")
def get_printer_queue(printer_id: int, db: Session = Depends(get_db)):
    return db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"]),
    ).all()


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