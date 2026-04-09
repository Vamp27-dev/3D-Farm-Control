from sqlalchemy import Column, Integer, String, Table, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

# Association table (many-to-many)
printer_tags = Table(
    "printer_tags",
    Base.metadata,
    Column("printer_id", Integer, ForeignKey("printers.id")),
    Column("tag_id", Integer, ForeignKey("tags.id"))
)

class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

    printers = relationship(
        "Printer",
        secondary=printer_tags,
        back_populates="tags"
    )