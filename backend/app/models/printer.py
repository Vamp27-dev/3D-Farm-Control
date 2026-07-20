from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Printer(Base):
    __tablename__ = "printers"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String, unique=True, index=True)
    ip_address   = Column(String)
    brand        = Column(String)
    model        = Column(String)
    location     = Column(String)
    status       = Column(String, default="offline")
    progress     = Column(Float, default=0)
    current_file = Column(String, nullable=True)
    camera_url   = Column(String, nullable=True)
    type         = Column(String, default="klipper")
    last_seen    = Column(DateTime, default=datetime.utcnow)

    # ✅ Health fields — added for temperature and ETA display
    bed_temp        = Column(Float, nullable=True)
    bed_target      = Column(Float, nullable=True)
    extruder_temp   = Column(Float, nullable=True)
    extruder_target = Column(Float, nullable=True)
    eta_seconds     = Column(Integer, nullable=True)

    # ✅ Error / pause reason — pulled from Moonraker's print_stats.message
    # and filament_switch_sensor, surfaced in the Printer Tray as an alert
    error_message     = Column(String, nullable=True)
    filament_detected = Column(Boolean, nullable=True)   # None = no sensor configured

    # ✅ Centauri Carbon (SDCP protocol) — required for sending commands
    # once discovered, cached here so we don't re-discover on every action
    mainboard_id = Column(String, nullable=True)

    batch_jobs = relationship("BatchPrinter", back_populates="printer")
    tags       = relationship("Tag", secondary="printer_tags", back_populates="printers")