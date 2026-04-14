from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.core.security import require_role

from app.models.batch import Batch
from app.models.batch_printer import BatchPrinter
from app.models.printer import Printer
from app.models.tag import Tag
from app.models.file import File
from app.models.job_history import JobHistory

from app.schemas.batch import BatchCreate

router = APIRouter(prefix="/batches", tags=["Batches"])


# ============================
# CREATE BATCH
# ============================

@router.post("/", dependencies=[Depends(require_role(["admin", "operator"]))])
def create_batch(batch: BatchCreate, db: Session = Depends(get_db)):

    db_file = db.query(File).filter(File.id == batch.file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    selected_printers = []

    if batch.printer_ids:
        printers = db.query(Printer).filter(
            Printer.id.in_(batch.printer_ids)
        ).all()
        selected_printers.extend(printers)

    if batch.tag_names:
        for tag_name in batch.tag_names:
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if tag:
                selected_printers.extend(tag.printers)

    selected_printers = list({p.id: p for p in selected_printers}.values())

    if not selected_printers:
        raise HTTPException(status_code=400, detail="No printers selected")

    new_batch = Batch(
        file_id=batch.file_id,
        created_at=datetime.utcnow()
    )

    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    assigned = 0
    skipped = 0

    for printer in selected_printers:

        if printer.status == "printing":
            status = "queued"
            skipped += 1
        else:
            status = "waiting_confirmation"
            assigned += 1

        record = BatchPrinter(
            batch_id=new_batch.id,
            printer_id=printer.id,
            status=status
        )

        db.add(record)

    db.commit()

    return {
        "batch_id": new_batch.id,
        "assigned_printers": assigned,
        "skipped_printers": skipped
    }


# ============================
# LIST BATCHES (🔥 UPDATED)
# ============================

@router.get("/", dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def list_batches(db: Session = Depends(get_db)):

    batches = db.query(Batch).all()

    result = []

    for batch in batches:

        # 🔥 get file name
        file = db.query(File).filter(File.id == batch.file_id).first()
        file_name = file.original_name if file else "Unknown"

        # 🔥 determine status
        jobs = db.query(BatchPrinter).filter(
            BatchPrinter.batch_id == batch.id
        ).all()

        if not jobs:
            status = "empty"
        else:
            statuses = [j.status for j in jobs]

            if all(s == "completed" for s in statuses):
                status = "completed"
            elif any(s == "printing" for s in statuses):
                status = "printing"
            elif any(s in ["queued", "waiting_confirmation"] for s in statuses):
                status = "queued"
            else:
                status = "unknown"

        result.append({
            "id": batch.id,
            "name": f"Batch {batch.id}",
            "file_name": file_name,
            "status": status,
            "created_at": batch.created_at
        })

    return result


# ============================
# DELETE BATCH
# ============================

@router.delete("/{batch_id}", dependencies=[Depends(require_role(["admin","operator"]))])
def delete_batch(batch_id: int, db: Session = Depends(get_db)):

    batch = db.query(Batch).filter(Batch.id == batch_id).first()

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    try:

        db.query(JobHistory).filter(
            JobHistory.batch_id == batch_id
        ).delete(synchronize_session=False)

        db.query(BatchPrinter).filter(
            BatchPrinter.batch_id == batch_id
        ).delete(synchronize_session=False)

        db.delete(batch)

        db.commit()

        return {"message": "Batch deleted successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ============================
# BATCH SUMMARY
# ============================

@router.get("/{batch_id}/summary",
            dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def batch_summary(batch_id: int, db: Session = Depends(get_db)):

    records = db.query(BatchPrinter).filter(
        BatchPrinter.batch_id == batch_id
    ).all()

    if not records:
        raise HTTPException(status_code=404, detail="Batch not found")

    total = len(records)
    completed = sum(1 for r in records if r.status == "completed")
    failed = sum(1 for r in records if r.status == "failed")
    skipped = sum(1 for r in records if r.status == "skipped")
    queued = sum(1 for r in records if r.status == "queued")

    return {
        "batch_id": batch_id,
        "total": total,
        "completed": completed,
        "failed": failed,
        "skipped": skipped,
        "queued": queued
    }


# ============================
# DEBUG BATCH
# ============================

@router.get("/{batch_id}/debug",
            dependencies=[Depends(require_role(["admin"]))])
def debug_batch(batch_id: int, db: Session = Depends(get_db)):

    records = db.query(BatchPrinter).filter(
        BatchPrinter.batch_id == batch_id
    ).all()

    return [
        {
            "printer_id": r.printer_id,
            "status": r.status,
            "started_at": r.started_at,
            "completed_at": r.completed_at
        }
        for r in records
    ]


# ============================
# GLOBAL QUEUE
# ============================

@router.get("/global/queue",
            dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def global_queue(db: Session = Depends(get_db)):

    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.status.in_(["queued", "waiting_confirmation"])
    ).order_by(BatchPrinter.id.asc()).all()

    return jobs


# ============================
# QUEUE SUMMARY
# ============================

@router.get("/queue/summary")
def queue_summary(db: Session = Depends(get_db)):

    total_queued = db.query(BatchPrinter).filter(
        BatchPrinter.status == "queued"
    ).count()

    waiting = db.query(BatchPrinter).filter(
        BatchPrinter.status == "waiting_confirmation"
    ).count()

    printing = db.query(BatchPrinter).filter(
        BatchPrinter.status == "printing"
    ).count()

    return {
        "queued": total_queued,
        "waiting_confirmation": waiting,
        "printing_jobs": printing
    }


# ============================
# SKIP JOB
# ============================

@router.post("/job/{job_id}/skip")
def skip_job(job_id: int, db: Session = Depends(get_db)):

    job = db.query(BatchPrinter).filter(
        BatchPrinter.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "skipped"
    job.completed_at = datetime.utcnow()

    db.commit()

    return {"message": "Job skipped"}


# ============================
# CANCEL JOB
# ============================

@router.post("/job/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db)):

    job = db.query(BatchPrinter).filter(
        BatchPrinter.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "cancelled"
    job.completed_at = datetime.utcnow()

    db.commit()

    return {"message": "Job cancelled"}