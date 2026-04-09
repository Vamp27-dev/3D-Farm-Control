from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from app.core.database import SessionLocal
from app.models.job_history import JobHistory
from app.models.printer import Printer

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/production")
def production_stats(db: Session = Depends(get_db)):

    today = datetime.utcnow().date()
    week_start = datetime.utcnow() - timedelta(days=7)

    # Prints completed today
    today_prints = db.query(JobHistory).filter(
        JobHistory.completed_at != None,
        func.date(JobHistory.completed_at) == today
    ).count()

    # Prints in last 7 days
    week_prints = db.query(JobHistory).filter(
        JobHistory.completed_at != None,
        JobHistory.completed_at >= week_start
    ).count()

    # Success / failure
    success = db.query(JobHistory).filter(
        JobHistory.status == "completed"
    ).count()

    failed = db.query(JobHistory).filter(
        JobHistory.status == "failed"
    ).count()

    total_jobs = success + failed

    success_rate = 0
    if total_jobs > 0:
        success_rate = round((success / total_jobs) * 100, 2)

    # Average print time (computed from timestamps)
    durations = db.query(
        func.extract('epoch', JobHistory.completed_at - JobHistory.started_at)
    ).filter(
        JobHistory.completed_at != None,
        JobHistory.started_at != None
    ).all()

    avg_print_time = None

    if durations:
        avg_seconds = sum([d[0] for d in durations]) / len(durations)
        avg_print_time = round(avg_seconds / 60, 2)  # minutes

    # Active printers
    active_printers = db.query(Printer).filter(
        Printer.status == "printing"
    ).count()

    return {
        "today_prints": today_prints,
        "week_prints": week_prints,
        "success_rate": success_rate,
        "avg_print_time_minutes": avg_print_time,
        "active_printers": active_printers
    }