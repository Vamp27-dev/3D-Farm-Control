from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy.exc import IntegrityError
import httpx

from app.core.database import SessionLocal
from app.models.printer import Printer
from app.models.tag import Tag
from app.models.batch_printer import BatchPrinter
from app.models.batch import Batch
from app.models.file import File

from app.schemas.printer import PrinterCreate, PrinterResponse

from app.services.printer_service import (
    get_klipper_status,
    get_bambu_status,
    upload_file_to_printer
)

router = APIRouter(prefix="/printers", tags=["Printers"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==============================
# CREATE PRINTER
# ==============================

@router.post("/", response_model=PrinterResponse)
def create_printer(printer: PrinterCreate, db: Session = Depends(get_db)):

    db_printer = Printer(
        name=printer.name,
        ip_address=printer.ip_address,
        brand=printer.brand,
        model=printer.model,
        location=printer.location,
        camera_url=printer.camera_url,
        status="offline",
        progress=0,
        current_file=None,
        last_seen=datetime.utcnow()
    )

    try:
        db.add(db_printer)
        db.commit()
        db.refresh(db_printer)
        return db_printer

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Printer with this name already exists"
        )


# ==============================
# LIST PRINTERS
# ==============================

@router.get("/", response_model=list[PrinterResponse])
async def list_printers(db: Session = Depends(get_db)):

    printers = db.query(Printer).all()
    updated = []

    for p in printers:
        try:
            status = await get_klipper_status(p.ip_address)

            raw_state = status.get("state", "offline")

            # 🔥 FIX STATE
            if raw_state == "standby":
                state = "idle"
            else:
                state = raw_state

            progress = status.get("progress", 0)
            filename = status.get("filename", None)

        except Exception as e:
            print("Printer fetch error:", e)

            state = "offline"
            progress = 0
            filename = None

        updated.append({
            "id": p.id,
            "name": p.name,
            "ip_address": p.ip_address,
            "brand": p.brand,
            "model": p.model,
            "location": p.location,
            "status": state,
            "progress": round(progress * 100, 2),
            "current_file": filename,
            "last_seen": datetime.utcnow(),
            "camera_url": p.camera_url
        })

    return updated


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
# START NEXT JOB (🔥 REAL PRINT)
# ==============================

@router.post("/{printer_id}/start_next")
async def start_next_job(printer_id: int, db: Session = Depends(get_db)):

    printer = db.query(Printer).filter(Printer.id == printer_id).first()

    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if printer.status == "printing":
        raise HTTPException(status_code=400, detail="Printer already printing")

    next_job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"])
    ).order_by(BatchPrinter.id.asc()).first()

    if not next_job:
        raise HTTPException(status_code=404, detail="No jobs in queue")

    batch = db.query(Batch).filter(Batch.id == next_job.batch_id).first()
    file = db.query(File).filter(File.id == batch.file_id).first()
    file_path = f"/app/storage/{file.stored_name}"
    print("FILE PATH:", file_path)

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # 🔥 STEP 1: Upload file to printer

    import os

async def upload_file_to_printer(printer_ip: str, file_path: str):
    try:
        url = f"http://{printer_ip}/server/files/upload"

        filename = os.path.basename(file_path)

        with open(file_path, "rb") as f:
            files = {
                "file": (filename, f, "application/octet-stream")
            }

            data = {
                "root": "gcodes"   # 🔥 VERY IMPORTANT (Moonraker requirement)
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, files=files, data=data)

        print("UPLOAD RESPONSE:", response.text)

        if response.status_code != 200:
            raise Exception("Upload failed")

        return filename

    except Exception as e:
        print("Upload error:", str(e))
        raise

    # 🔥 Update DB
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
        BatchPrinter.status == "printing"
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
        BatchPrinter.status.in_(["queued", "waiting_confirmation"])
    ).all()


# ==============================
# CLEAR QUEUE
# ==============================

@router.post("/{printer_id}/queue/clear")
def clear_printer_queue(printer_id: int, db: Session = Depends(get_db)):

    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"])
    ).all()

    for job in jobs:
        job.status = "cancelled"
        job.completed_at = datetime.utcnow()

    db.commit()

    return {"message": "Queue cleared"}