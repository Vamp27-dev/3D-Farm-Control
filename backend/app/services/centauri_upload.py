"""
centauri_upload.py

File upload for Centauri Carbon printers. Unlike Klipper (simple
multipart POST to Moonraker), Centauri requires specific form fields
including an MD5 checksum of the file, and uploads via plain HTTP
(not WebSocket).

Endpoint: POST http://{ip}/uploadFile/upload
Fields: TotalSize, Uuid, Offset, Check, S-File-MD5, File
"""

import hashlib
import uuid as uuid_lib
import httpx


def _file_md5(file_path: str) -> str:
    """Compute MD5 checksum of a file — required by the SDCP upload spec."""
    md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5.update(chunk)
    return md5.hexdigest()


async def upload_file_to_centauri(ip: str, file_path: str, remote_filename: str | None = None,
                                   timeout: float = 120.0) -> dict:
    """
    Upload a gcode file to a Centauri Carbon printer.
    Sanitizes filename (spaces → underscores) since Centauri firmware
    rejects file paths with spaces.
    """
    import os

    if remote_filename is None:
        remote_filename = os.path.basename(file_path)

    # ✅ Sanitize filename — Centauri rejects paths with spaces
    safe_filename = remote_filename.replace(" ", "_")

    total_size = os.path.getsize(file_path)
    file_md5   = _file_md5(file_path)
    upload_uuid = uuid_lib.uuid4().hex

    # FIX: correct port is 3030, not 80 — confirmed by the SDCP V3.0.0 spec's
    # "Send File Interface" section: http://${MainboardIP}:3030/uploadFile/upload
    url = f"http://{ip}:3030/uploadFile/upload"

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    form_data = {
        "TotalSize":  str(total_size),
        "Uuid":       upload_uuid,
        "Offset":     "0",
        "Check":      "1",
        "S-File-MD5": file_md5,
    }
    files = {
        "File": (safe_filename, file_bytes, "application/octet-stream"),
    }

    print(f"[Centauri Upload] ip={ip} file={safe_filename} size={total_size} md5={file_md5}")

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, data=form_data, files=files)
        response.raise_for_status()
        result = response.json()

    success = result.get("success", False) and result.get("code") == "000000"

    print(f"[Centauri Upload] response={result} success={success}")
    print(f"[Centauri Upload] remote_path=/local/{safe_filename}")

    return {
        "success":     success,
        "remote_path": f"/local/{safe_filename}",
        "raw":         result,
    }