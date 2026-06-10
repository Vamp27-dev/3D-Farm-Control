from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to File
    file = relationship("File")

    # ✅ FIX: Only ONE relationship to BatchPrinter — removed duplicate `printer_jobs`
    # Both `printers` and `printer_jobs` were pointing to the same thing, causing
    # SQLAlchemy's "overlapping relationship" warning
    printer_jobs = relationship(
        "BatchPrinter",
        back_populates="batch",
        cascade="all, delete",
        overlaps="batch"
    )