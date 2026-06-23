from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import io
import csv

from app.core.database import get_db
from app.models.job_history import JobHistory
from app.models.printer import Printer

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _base_stats(db: Session):
    today      = datetime.utcnow().date()
    week_start = datetime.utcnow() - timedelta(days=7)

    today_prints = db.query(JobHistory).filter(
        JobHistory.completed_at != None,
        func.date(JobHistory.completed_at) == today
    ).count()

    week_prints = db.query(JobHistory).filter(
        JobHistory.completed_at != None,
        JobHistory.completed_at >= week_start
    ).count()

    # ✅ Count all terminal statuses
    success   = db.query(JobHistory).filter(JobHistory.status == "success").count()
    failed    = db.query(JobHistory).filter(JobHistory.status == "failed").count()
    cancelled = db.query(JobHistory).filter(JobHistory.status == "cancelled").count()

    # Success rate = success / (success + failed) — exclude cancelled
    countable = success + failed
    success_rate = round((success / countable) * 100, 1) if countable > 0 else 0

    # Average print time from successful jobs only
    durations = db.query(JobHistory.duration_seconds).filter(
        JobHistory.status == "success",
        JobHistory.duration_seconds != None,
        JobHistory.duration_seconds > 0
    ).all()
    avg_print_time = None
    if durations:
        avg_print_time = round(sum(d[0] for d in durations) / len(durations) / 60, 1)

    active_printers = db.query(Printer).filter(Printer.status == "printing").count()

    return {
        "today_prints":           today_prints,
        "week_prints":            week_prints,
        "success_rate":           success_rate,
        "avg_print_time_minutes": avg_print_time,
        "active_printers":        active_printers,
        "total_success":          success,
        "total_failed":           failed,
        "total_cancelled":        cancelled,
    }


# ── main analytics endpoint ───────────────────────────────────────────────────

@router.get("")
@router.get("/")
@router.get("/production")
def production_stats(db: Session = Depends(get_db)):
    return _base_stats(db)


# ── print history ─────────────────────────────────────────────────────────────

@router.get("/history")
def print_history(limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    total = db.query(JobHistory).count()

    rows = (
        db.query(JobHistory)
        .order_by(JobHistory.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for r in rows:
        printer = db.query(Printer).filter(Printer.id == r.printer_id).first()
        result.append({
            "id":               r.id,
            "printer_id":       r.printer_id,
            "printer_name":     printer.name if printer else f"Printer #{r.printer_id}",
            "batch_id":         r.batch_id,
            "status":           r.status,
            # ✅ Append Z so browsers parse as UTC, frontend converts to IST
            "started_at":       r.started_at.isoformat() + "Z" if r.started_at else None,
            "completed_at":     r.completed_at.isoformat() + "Z" if r.completed_at else None,
            "duration_seconds": r.duration_seconds,
        })

    return {"total": total, "items": result}


# ── CSV export ────────────────────────────────────────────────────────────────

@router.get("/export/csv")
def export_csv(db: Session = Depends(get_db)):
    rows = (
        db.query(JobHistory)
        .order_by(JobHistory.id.desc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Job ID", "Printer Name", "Batch ID",
        "Status", "Started At (IST)", "Completed At (IST)",
        "Duration (min)"
    ])

    for r in rows:
        printer = db.query(Printer).filter(Printer.id == r.printer_id).first()

        def to_ist(dt):
            if not dt: return ""
            ist = dt + timedelta(hours=5, minutes=30)
            return ist.strftime("%d %b %Y %I:%M %p")

        duration_min = round(r.duration_seconds / 60, 1) if r.duration_seconds else ""

        writer.writerow([
            r.id,
            printer.name if printer else f"Printer #{r.printer_id}",
            r.batch_id,
            r.status,
            to_ist(r.started_at),
            to_ist(r.completed_at),
            duration_min,
        ])

    output.seek(0)
    filename = f"farm_history_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )