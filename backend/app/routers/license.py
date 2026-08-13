import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.license import verify_license
from app.core.security import require_role
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


def refresh_licensed_flag(db: Session, state: LicenseState) -> bool:
    """
    Re-verifies the STORED key against the CURRENT PUBLIC_KEY_HEX and
    today's date, every time this is called -- rather than trusting the
    `licensed` boolean as a static fact set once at activation time.

    This is what makes key rotation double as a revocation mechanism:
    if you ever regenerate your master key pair and redeploy a NEW
    PUBLIC_KEY_HEX to a specific client's install, their old stored key
    (signed by the OLD private key) stops verifying against the new
    public key -- so the very next check flips `licensed` back to
    False automatically. No manual revoke call needed for that case.

    Also naturally re-catches an expiry date that's since passed, even
    if nothing else about the install has changed.
    """
    if not state.license_key:
        if state.licensed:
            state.licensed = False
            db.commit()
        return False

    valid, _reason, _payload = verify_license(state.license_key, state.machine_id)
    if state.licensed != valid:
        state.licensed = valid
        db.commit()
    return valid


@router.get("/status")
def license_status(db: Session = Depends(get_db)):
    """
    Deliberately unauthenticated and always accessible — the frontend
    needs to call this before login even works, to know whether to show
    the activation screen or the normal app.
    """
    state = get_or_create_state(db)
    refresh_licensed_flag(db, state)
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

    Always overwrites whatever's currently stored -- this doubles as
    the RENEWAL flow. To extend a client from a 1-month key to a
    1-year key, just generate a new key for the same machine_id with a
    later expiry and activate it the same way, any time, even while
    the old key is still valid. No need to revoke the old one first.
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


@router.post("/revoke", dependencies=[Depends(require_role(["admin"]))])
def revoke(db: Session = Depends(get_db)):
    """
    Manual, immediate revocation -- for when you want to lock an
    install NOW without waiting for its key to expire, and without
    needing to rotate your master key pair at all (e.g. a client
    stopped paying, or a machine ID was compromised).

    Admin-only: call this while logged into THAT install as an admin
    (during a remote session), or point a request at it directly with
    a valid admin token for that install. Clears the stored key
    entirely -- the app immediately falls back to the activation
    screen on the next request, same as a fresh unlicensed install.
    """
    state = get_or_create_state(db)
    state.license_key = None
    state.licensed = False
    db.commit()
    return {"message": "License revoked. This installation is now locked."}