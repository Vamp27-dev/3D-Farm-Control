from pydantic import BaseModel
from typing import List
from datetime import datetime


class BatchCreate(BaseModel):
    name: str
    file_id: int
    printer_ids: List[int] = []
    tag_names: List[str] = [""]


class BatchCreateResponse(BaseModel):
    batch_id: int
    assigned_printers: List[int]
    skipped_printers: List[dict]
    created_at: datetime


class BatchListResponse(BaseModel):
    id: int
    name: str
    file_name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True   # ✅ FIXED (Pydantic v2)