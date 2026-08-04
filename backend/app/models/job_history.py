from sqlalchemy import Column, Integer, DateTime, String, ForeignKey
from datetime import datetime
from app.core.database import Base


class JobHistory(Base):
    __tablename__ = "job_history"

    id = Column(Integer, primary_key=True, index=True)

    printer_id = Column(Integer, ForeignKey("printers.id"))
    batch_id = Column(Integer, ForeignKey("batches.id"))
    file_id = Column(Integer, ForeignKey("files.id"))

    status = Column(String)  # success / failed

    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    duration_seconds = Column(Integer)

    created_at = Column(DateTime, default=datetime.utcnow)


# ✅ Auto-retention: keeps job_history bounded to the most recent N rows
# so it never grows unbounded and doesn't need a manual "delete range" UI
# for routine upkeep. Called right after every new history row is written
# (see poller.py complete_job() and routers/printer.py cancel_print()).
# Ordering by id (autoincrement PK) is used as the chronological proxy --
# simpler and more reliable than completed_at, which can theoretically be
# null on edge-case rows.
def trim_job_history(db, keep: int = 100):
    total = db.query(JobHistory).count()
    if total <= keep:
        return
    excess = total - keep
    old_ids = [
        row.id for row in
        db.query(JobHistory.id).order_by(JobHistory.id.asc()).limit(excess).all()
    ]
    if old_ids:
        db.query(JobHistory).filter(JobHistory.id.in_(old_ids)).delete(synchronize_session=False)