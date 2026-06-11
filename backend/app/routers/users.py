from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from passlib.context import CryptContext

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User

router = APIRouter(prefix="/users", tags=["Users"])

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class UserUpdate(BaseModel):
    username:  Optional[str] = None
    password:  Optional[str] = None
    role:      Optional[str] = None


class UserResponse(BaseModel):
    id:       int
    username: str
    role:     str
    model_config = {"from_attributes": True}


VALID_ROLES = {"admin", "viewer"}


# ── List all users (admin only) ───────────────────────────────────────────────

@router.get("/", dependencies=[Depends(require_role(["admin"]))])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]


# ── Create user (admin only) ──────────────────────────────────────────────────

@router.post("/", dependencies=[Depends(require_role(["admin"]))])
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_ROLES)}")

    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=data.username,
        password_hash=pwd_context.hash(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role}


# ── Update user (admin only) ──────────────────────────────────────────────────

@router.patch("/{user_id}", dependencies=[Depends(require_role(["admin"]))])
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.role and data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_ROLES)}")

    if data.username:
        clash = db.query(User).filter(User.username == data.username, User.id != user_id).first()
        if clash:
            raise HTTPException(status_code=400, detail="Username already in use")
        user.username = data.username

    if data.password:
        user.password_hash = pwd_context.hash(data.password)

    if data.role:
        user.role = data.role

    db.commit()
    return {"id": user.id, "username": user.username, "role": user.role}


# ── Delete user (admin only) ──────────────────────────────────────────────────

@router.delete("/{user_id}", dependencies=[Depends(require_role(["admin"]))])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting yourself
    # (we don't have current user id here easily, so we protect by checking
    #  if this is the last admin)
    if user.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin account")

    db.delete(user)
    db.commit()
    return {"message": "User deleted"}