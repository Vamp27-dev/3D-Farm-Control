from pydantic import BaseModel

class TagCreate(BaseModel):
    name: str

class TagResponse(BaseModel):
    id: int
    name: str

    class Config:
        orm_mode = True