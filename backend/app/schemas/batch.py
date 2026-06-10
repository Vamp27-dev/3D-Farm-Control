from pydantic import BaseModel
from typing import Optional, List


class BatchCreate(BaseModel):
    file_id: int
    printer_ids: Optional[List[int]] = []   # ✅ optional, defaults to empty list
    tag_names: Optional[List[str]] = []     # ✅ optional, defaults to empty list

    model_config = {"from_attributes": True}  # Pydantic V2