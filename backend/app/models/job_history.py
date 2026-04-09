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