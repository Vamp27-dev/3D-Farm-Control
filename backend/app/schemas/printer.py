from pydantic import BaseModel, field_serializer
from typing import Optional
from datetime import datetime


class PrinterCreate(BaseModel):
    name:       str
    ip_address: str
    type:       str = "klipper"
    brand:      Optional[str] = None
    model:      Optional[str] = None
    location:   Optional[str] = None
    camera_url: Optional[str] = None


class PrinterResponse(BaseModel):
    id:           int
    name:         str
    ip_address:   str
    type:         str
    brand:        Optional[str] = None
    model:        Optional[str] = None
    location:     Optional[str] = None
    status:       str
    current_file: Optional[str] = None
    progress:     float
    last_seen:    datetime
    camera_url:   Optional[str] = None

    # Health fields
    bed_temp:        Optional[float] = None
    bed_target:      Optional[float] = None
    extruder_temp:   Optional[float] = None
    extruder_target: Optional[float] = None
    eta_seconds:     Optional[int]   = None

    # ✅ Error / pause reason from Moonraker
    error_message:     Optional[str]  = None
    filament_detected: Optional[bool] = None

    # ✅ Live chamber light state (Centauri only, None otherwise)
    light_on: Optional[bool] = None

    model_config = {"from_attributes": True}

    # ✅ Always serialize datetimes as UTC with Z suffix so the frontend
    # correctly converts to IST instead of misreading as local time
    @field_serializer("last_seen")
    def serialize_last_seen(self, dt: datetime) -> str:
        return dt.isoformat() + "Z" if dt else None