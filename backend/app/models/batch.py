from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=True)   # ✅ custom name, optional
    file_id    = Column(Integer, ForeignKey("files.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ✅ archived = True once every printer job reaches a terminal state
    # (completed / cancelled / failed). Keeps the batch out of the active
    # Batches list but preserves it for History / auditing.
    archived = Column(Boolean, default=False)

    file = relationship("File")

    printer_jobs = relationship(
        "BatchPrinter",
        back_populates="batch",
        cascade="all, delete",
        overlaps="batch"
    )