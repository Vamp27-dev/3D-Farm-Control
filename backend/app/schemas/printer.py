from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PrinterCreate(BaseModel):
    name: str
    ip_address: str
    type: str = "klipper"
    brand: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    camera_url: Optional[str] = None


class PrinterResponse(BaseModel):
    id: int
    name: str
    ip_address: str
    type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    status: str
    current_file: Optional[str] = None
    progress: float
    last_seen: datetime
    camera_url: Optional[str] = None

    model_config = {"from_attributes": True}  # ✅ Pydantic V2 fix