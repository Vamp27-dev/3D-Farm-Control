from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import SessionLocal
from app.models.printer import Printer
from app.models.tag import Tag
from app.models.batch_printer import BatchPrinter
from app.models.batch import Batch
from app.models.file import File
from app.schemas.printer import PrinterCreate, PrinterResponse

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

    db_printer = Printer(**printer.dict())

    db.add(db_printer)
    db.commit()
    db.refresh(db_printer)

    return db_printer


# ==============================
# LIST PRINTERS
# ==============================

@router.get("/", response_model=list[PrinterResponse])
def list_printers(db: Session = Depends(get_db)):

    return db.query(Printer).all()


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
def start_next_job(printer_id: int, db: Session = Depends(get_db)):

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

    next_job.status = "printing"
    next_job.started_at = datetime.utcnow()

    printer.status = "printing"
    printer.progress = 0
    printer.current_file = file.original_name if file else f"Batch {batch.id}"
    printer.last_seen = datetime.utcnow()

    db.commit()

    return {"message": "Job started"}


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

    # ==============================
    # AUTO CLEANUP BATCH
    # ==============================

    remaining = db.query(BatchPrinter).filter(
        BatchPrinter.batch_id == job.batch_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation", "printing"])
    ).count()

    if remaining == 0:

        db.query(BatchPrinter).filter(
            BatchPrinter.batch_id == job.batch_id
        ).delete(synchronize_session=False)

        batch = db.query(Batch).filter(
            Batch.id == job.batch_id
        ).first()

        if batch:
            db.delete(batch)

    db.commit()

    return {"message": "Print completed"}


# ==============================
# GET PRINTER QUEUE
# ==============================

@router.get("/{printer_id}/queue")
def get_printer_queue(printer_id: int, db: Session = Depends(get_db)):

    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer_id,
        BatchPrinter.status.in_(["queued", "waiting_confirmation"])
    ).order_by(BatchPrinter.id.asc()).all()

    return jobs


# ==============================
# CLEAR PRINTER QUEUE
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