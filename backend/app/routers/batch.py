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

TERMINAL_STATUSES = {"completed", "cancelled", "failed", "skipped"}


# ════════════════════════════════════════════════════════════════════
# HELPER: check if a batch is fully done, and archive it if so
# ════════════════════════════════════════════════════════════════════

def check_and_archive_batch(db: Session, batch_id: int):
    """
    If every BatchPrinter job under this batch has reached a terminal
    status (completed / cancelled / failed / skipped), mark the batch
    as archived so it disappears from the active Batches list.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch or batch.archived:
        return

    jobs = db.query(BatchPrinter).filter(BatchPrinter.batch_id == batch_id).all()
    if not jobs:
        return

    all_done = all(j.status in TERMINAL_STATUSES for j in jobs)
    if all_done:
        batch.archived = True
        db.commit()
        print(f"[Batch] #{batch_id} archived — all {len(jobs)} jobs finished")


# ════════════════════════════════════════════════════════════════════
# CREATE BATCH
# ════════════════════════════════════════════════════════════════════

@router.post("/", dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def create_batch(batch: BatchCreate, db: Session = Depends(get_db)):

    db_file = db.query(File).filter(File.id == batch.file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    selected_printers = []

    if batch.printer_ids:
        printers = db.query(Printer).filter(Printer.id.in_(batch.printer_ids)).all()
        selected_printers.extend(printers)

    if batch.tag_names:
        for tag_name in batch.tag_names:
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if tag:
                selected_printers.extend(tag.printers)

    selected_printers = list({p.id: p for p in selected_printers}.values())

    if not selected_printers:
        raise HTTPException(status_code=400, detail="No printers selected")

    # ✅ Auto-generate name if blank: "Batch <next serial>"
    name = batch.name.strip() if batch.name and batch.name.strip() else None

    new_batch = Batch(
        name=name,
        file_id=batch.file_id,
        created_at=datetime.utcnow(),
        archived=False,
    )
    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    # If no name was given, default to "Batch {serial}" using the new id context
    if not new_batch.name:
        new_batch.name = f"Batch {new_batch.id}"
        db.commit()

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
        "name": new_batch.name,
        "assigned_printers": assigned,
        "skipped_printers": skipped
    }


# ════════════════════════════════════════════════════════════════════
# LIST BATCHES — only active (non-archived) by default, with serial #s
# ════════════════════════════════════════════════════════════════════

@router.get("/", dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def list_batches(include_archived: bool = False, db: Session = Depends(get_db)):

    query = db.query(Batch)
    if not include_archived:
        query = query.filter(Batch.archived == False)

    batches = query.order_by(Batch.id.asc()).all()

    result = []
    for serial, batch in enumerate(batches, start=1):

        file = db.query(File).filter(File.id == batch.file_id).first()
        file_name = file.original_name if file else "Unknown"

        jobs = db.query(BatchPrinter).filter(BatchPrinter.batch_id == batch.id).all()

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
            "id": batch.id,                                   # real ID (internal use)
            "serial": serial,                                 # ✅ display number
            "name": batch.name or f"Batch {batch.id}",
            "file_name": file_name,
            "status": status,
            "archived": batch.archived,
            "created_at": batch.created_at,
        })

    return result


# ════════════════════════════════════════════════════════════════════
# BATCH PRINTERS — which printers got this batch + their status
# (powers the dropdown in the frontend)
# ════════════════════════════════════════════════════════════════════

@router.get("/{batch_id}/printers",
            dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def batch_printers(batch_id: int, db: Session = Depends(get_db)):

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    jobs = db.query(BatchPrinter).filter(BatchPrinter.batch_id == batch_id).all()

    result = []
    for job in jobs:
        printer = db.query(Printer).filter(Printer.id == job.printer_id).first()
        result.append({
            "job_id": job.id,
            "printer_id": job.printer_id,
            "printer_name": printer.name if printer else f"Printer #{job.printer_id}",
            "printer_status": printer.status if printer else "unknown",
            "job_status": job.status,
            "progress": printer.progress if printer and job.status == "printing" else None,
            "started_at": job.started_at,
            "completed_at": job.completed_at,
        })

    return result


# ════════════════════════════════════════════════════════════════════
# DELETE BATCH
# ════════════════════════════════════════════════════════════════════

@router.delete("/{batch_id}", dependencies=[Depends(require_role(["admin","operator"]))])
def delete_batch(batch_id: int, db: Session = Depends(get_db)):

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    try:
        db.query(JobHistory).filter(JobHistory.batch_id == batch_id).delete(synchronize_session=False)
        db.query(BatchPrinter).filter(BatchPrinter.batch_id == batch_id).delete(synchronize_session=False)
        db.delete(batch)
        db.commit()
        return {"message": "Batch deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════
# START BATCH
# ════════════════════════════════════════════════════════════════════

@router.post("/{batch_id}/start",
             dependencies=[Depends(require_role(["admin", "operator"]))])
async def start_batch(batch_id: int, db: Session = Depends(get_db)):
    from app.services.printer_service import upload_file_to_printer, start_print

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    file = db.query(File).filter(File.id == batch.file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found for batch")

    file_path = f"/app/storage/{file.stored_name}"

    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.batch_id == batch_id,
        BatchPrinter.status == "waiting_confirmation",
    ).all()

    if not jobs:
        raise HTTPException(status_code=400, detail="No jobs waiting to start")

    started, queued, errors = 0, 0, []

    for job in jobs:
        printer = db.query(Printer).filter(Printer.id == job.printer_id).first()
        if not printer:
            continue

        if printer.status == "idle":
            try:
                uploaded_name = await upload_file_to_printer(printer.ip_address, file_path)
                await start_print(printer.ip_address, uploaded_name)

                job.status            = "printing"
                job.started_at        = datetime.utcnow()
                printer.status         = "printing"
                printer.progress       = 0
                printer.current_file   = file.original_name
                printer.last_seen      = datetime.utcnow()
                started += 1
            except Exception as e:
                errors.append(f"{printer.name}: {str(e)}")

        elif printer.status in ("printing", "paused"):
            job.status = "queued"
            queued += 1
        else:
            job.status = "queued"
            queued += 1

    db.commit()

    return {"message": "Batch started", "started": started, "queued": queued, "errors": errors}


# ════════════════════════════════════════════════════════════════════
# BATCH SUMMARY
# ════════════════════════════════════════════════════════════════════

@router.get("/{batch_id}/summary",
            dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def batch_summary(batch_id: int, db: Session = Depends(get_db)):
    records = db.query(BatchPrinter).filter(BatchPrinter.batch_id == batch_id).all()
    if not records:
        raise HTTPException(status_code=404, detail="Batch not found")

    total     = len(records)
    completed = sum(1 for r in records if r.status == "completed")
    printing  = sum(1 for r in records if r.status == "printing")
    failed    = sum(1 for r in records if r.status == "failed")
    skipped   = sum(1 for r in records if r.status == "skipped")
    queued    = sum(1 for r in records if r.status in ("queued", "waiting_confirmation"))

    return {
        "batch_id": batch_id, "total": total, "completed": completed,
        "printing": printing, "failed": failed, "skipped": skipped, "queued": queued,
    }


# ════════════════════════════════════════════════════════════════════
# DEBUG BATCH
# ════════════════════════════════════════════════════════════════════

@router.get("/{batch_id}/debug", dependencies=[Depends(require_role(["admin"]))])
def debug_batch(batch_id: int, db: Session = Depends(get_db)):
    records = db.query(BatchPrinter).filter(BatchPrinter.batch_id == batch_id).all()
    return [
        {"printer_id": r.printer_id, "status": r.status,
         "started_at": r.started_at, "completed_at": r.completed_at}
        for r in records
    ]


# ════════════════════════════════════════════════════════════════════
# GLOBAL QUEUE
# ════════════════════════════════════════════════════════════════════

@router.get("/global/queue", dependencies=[Depends(require_role(["admin", "operator", "viewer"]))])
def global_queue(db: Session = Depends(get_db)):
    jobs = db.query(BatchPrinter).filter(
        BatchPrinter.status.in_(["queued", "waiting_confirmation"])
    ).order_by(BatchPrinter.id.asc()).all()
    return jobs


# ════════════════════════════════════════════════════════════════════
# QUEUE SUMMARY
# ════════════════════════════════════════════════════════════════════

@router.get("/queue/summary")
def queue_summary(db: Session = Depends(get_db)):
    return {
        "queued": db.query(BatchPrinter).filter(BatchPrinter.status == "queued").count(),
        "waiting_confirmation": db.query(BatchPrinter).filter(BatchPrinter.status == "waiting_confirmation").count(),
        "printing_jobs": db.query(BatchPrinter).filter(BatchPrinter.status == "printing").count(),
    }


# ════════════════════════════════════════════════════════════════════
# SKIP JOB  — now triggers auto-archive check
# ════════════════════════════════════════════════════════════════════

@router.post("/job/{job_id}/skip")
def skip_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BatchPrinter).filter(BatchPrinter.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status       = "skipped"
    job.completed_at = datetime.utcnow()
    db.commit()

    check_and_archive_batch(db, job.batch_id)   # ✅ auto-archive check

    return {"message": "Job skipped"}


# ════════════════════════════════════════════════════════════════════
# CANCEL JOB  — now triggers auto-archive check
# ════════════════════════════════════════════════════════════════════

@router.post("/job/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BatchPrinter).filter(BatchPrinter.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status       = "cancelled"
    job.completed_at = datetime.utcnow()
    db.commit()

    check_and_archive_batch(db, job.batch_id)   # ✅ auto-archive check

    return {"message": "Job cancelled"}