import os
import shutil
from fastapi import APIRouter, Depends, UploadFile, File as FastAPIFile, HTTPException
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.folder import Folder
from app.models.file import File
from app.schemas.file import FolderCreate, FolderResponse, FileResponse
from app.core.security import require_role
from app.core.config import STORAGE_PATH
from app.models.batch import Batch

router = APIRouter(prefix="/files", tags=["Files"])

STORAGE_PATH = "/app/storage"
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/folders", response_model=FolderResponse)
def create_folder(folder: FolderCreate, db: Session = Depends(get_db)):
    db_folder = Folder(name=folder.name)
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    return db_folder


@router.get("/folders", response_model=list[FolderResponse])
def list_folders(db: Session = Depends(get_db)):
    return db.query(Folder).all()


@router.post("/upload/{folder_id}", response_model=FileResponse)
def upload_file(folder_id: int, upload: UploadFile = FastAPIFile(...), db: Session = Depends(get_db)):

    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    contents = upload.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 200MB limit")

    extension = upload.filename.split(".")[-1].lower()
    ALLOWED_EXTENSIONS = ["gcode", "3mf", "g", "gco", "amf", "idea"]

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
        status_code=400,
        detail=f"File type .{extension} not supported"
    )

    stored_name = f"{folder_id}_{upload.filename}"

    file_path = os.path.join(STORAGE_PATH, stored_name)

    os.makedirs(STORAGE_PATH, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(contents)

    db_file = File(
        original_name=upload.filename,
        stored_name=stored_name,
        extension=extension,
        file_size=len(contents),
        folder_id=folder_id
    )

    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    return db_file


@router.delete("/{file_id}", dependencies=[Depends(require_role(["admin"]))])
def delete_file(file_id: int, db: Session = Depends(get_db)):

    db_file = db.query(File).filter(File.id == file_id).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    batch_using_file = db.query(Batch).filter(Batch.file_id == file_id).first()

    if batch_using_file:
        raise HTTPException(
            status_code=400,
            detail="File cannot be deleted because it is used in a batch"
        )

    file_path = os.path.join(STORAGE_PATH, db_file.stored_name)

    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(db_file)
    db.commit()

    return {"message": "File deleted successfully"}

#List Files
@router.get("/folder/{folder_id}", response_model=list[FileResponse])
def list_files(folder_id: int, db: Session = Depends(get_db)):

    files = db.query(File).filter(File.folder_id == folder_id).all()

    return files