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
    brand: str | None = None
    model: str | None = None
    location: Optional[str]
    status: str
    current_file: Optional[str]
    progress: float
    last_seen: datetime
    camera_url: str | None = None

    class Config:
        orm_mode = True