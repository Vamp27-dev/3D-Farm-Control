import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.license import verify_license
from app.models.license import LicenseState

router = APIRouter(prefix="/license", tags=["license"])


def get_or_create_state(db: Session) -> LicenseState:
    state = db.query(LicenseState).first()
    if not state:
        state = LicenseState(machine_id=str(uuid.uuid4()), licensed=False)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


@router.get("/status")
def license_status(db: Session = Depends(get_db)):
    """
    Deliberately unauthenticated and always accessible — the frontend
    needs to call this before login even works, to know whether to show
    the activation screen or the normal app.
    """
    state = get_or_create_state(db)
    return {
        "machine_id": state.machine_id,
        "licensed": state.licensed,
        "client_name": state.client_name,
        "expires_at": state.expires_at,
    }


class ActivateBody(BaseModel):
    key: str


@router.post("/activate")
def activate(body: ActivateBody, db: Session = Depends(get_db)):
    """
    Also deliberately unauthenticated: the only way to produce a key
    that passes verify_license() is to hold the private key, which
    never leaves your machine. Anyone without it can submit all day
    and never get a "success": true response.
    """
    state = get_or_create_state(db)

    valid, reason, payload = verify_license(body.key, state.machine_id)
    if not valid:
        return {"success": False, "reason": reason}

    state.license_key = body.key
    state.client_name = payload.get("client")
    state.expires_at = payload.get("expires")
    state.licensed = True
    db.commit()

    return {"success": True, "client_name": state.client_name, "expires_at": state.expires_at}