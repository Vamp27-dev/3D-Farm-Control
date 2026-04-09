from pydantic import BaseModel
from datetime import datetime


class FolderCreate(BaseModel):
    name: str


class FolderResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        orm_mode = True


class FileResponse(BaseModel):
    id: int
    original_name: str
    extension: str
    file_size: int
    folder_id: int
    uploaded_at: datetime

    class Config:
        orm_mode = True