from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class BatchCreate(BaseModel):
    name:        Optional[str] = None   # ✅ optional — auto-generated if blank
    file_id:     int
    printer_ids: List[int] = []
    tag_names:   List[str] = []


class BatchCreateResponse(BaseModel):
    batch_id:          int
    assigned_printers:  int
    skipped_printers:   int


class BatchListResponse(BaseModel):
    id:         int
    serial:     int            # ✅ display number (1,2,3...) — not the raw DB id
    name:       str
    file_name:  str
    status:     str
    archived:   bool
    created_at: datetime

    model_config = {"from_attributes": True}