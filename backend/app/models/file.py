from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.core.database import Base


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    original_name = Column(String)
    stored_name = Column(String)
    extension = Column(String)
    file_size = Column(Integer)
    folder_id = Column(Integer, ForeignKey("folders.id"))
    uploaded_at = Column(DateTime, default=datetime.utcnow)