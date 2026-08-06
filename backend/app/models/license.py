from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base


class LicenseState(Base):
    """
    Single-row table. The machine_id is generated once, the first time
    the app ever boots, and persists for the life of this deployment
    (it lives in the postgres_data volume — never destroy it with
    `docker-compose down -v` or you'll invalidate every issued license
    for this install and need a fresh one).
    """
    __tablename__ = "license_state"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(String, unique=True, index=True)
    license_key = Column(String, nullable=True)
    client_name = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)
    licensed = Column(Boolean, default=False)