from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Printer(Base):
    __tablename__ = "printers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    ip_address = Column(String)

    brand = Column(String)
    model = Column(String)
    location = Column(String)

    status = Column(String, default="offline")
    progress = Column(Float, default=0)
    current_file = Column(String, nullable=True)
    
    camera_url = Column(String, nullable=True)

    # 👇 NEW FIELD (VERY IMPORTANT)
    type = Column(String, default="klipper")

    last_seen = Column(DateTime, default=datetime.utcnow)

    # Relationships (IMPORTANT: use string names)
    batch_jobs = relationship("BatchPrinter", back_populates="printer")
    tags = relationship("Tag", secondary="printer_tags", back_populates="printers")