from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class BatchPrinter(Base):
    __tablename__ = "batch_printers"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"))
    printer_id = Column(Integer, ForeignKey("printers.id"))

    status = Column(String, default="waiting_confirmation")
    position = Column(Integer, default=0)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # ✅ FIX: overlaps= added to silence SQLAlchemy V2 warning
    printer = relationship("Printer", back_populates="batch_jobs", overlaps="batch_jobs")
    batch = relationship("Batch", back_populates="printer_jobs", overlaps="printer_jobs")