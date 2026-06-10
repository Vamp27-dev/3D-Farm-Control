import httpx
import os


# ==============================
# KLIPPER (Moonraker) — port 80
# ✅ Confirmed: this farm's printers run Moonraker on port 80
# ==============================
async def get_klipper_status(ip: str):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(
                f"http://{ip}/printer/objects/query?print_stats&virtual_sdcard"
            )

        data = res.json()["result"]["status"]

        raw_state = data["print_stats"]["state"]
        state = "idle" if raw_state == "standby" else raw_state

        filename = data["print_stats"].get("filename") or None
        progress = data["virtual_sdcard"]["progress"]

        return {"state": state, "filename": filename, "progress": progress}

    except Exception as e:
        print(f"Klipper error ({ip}):", e)
        return {"state": "offline", "filename": None, "progress": 0}


# ==============================
# BAMBU (placeholder — MQTT later)
# ==============================
async def get_bambu_status(ip: str):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"http://{ip}/status")
        data = res.json()
        return {
            "state": data.get("state", "idle"),
            "filename": data.get("file", None),
            "progress": data.get("progress", 0),
        }
    except Exception as e:
        print(f"Bambu error ({ip}):", e)
        return {"state": "offline", "filename": None, "progress": 0}


# ==============================
# File Upload to Moonraker — port 80
# ==============================
async def upload_file_to_printer(printer_ip: str, file_path: str) -> str:
    url = f"http://{printer_ip}/server/files/upload"
    filename = os.path.basename(file_path)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(file_path, "rb") as f:
                response = await client.post(
                    url,
                    files={"file": (filename, f, "application/octet-stream")},
                    data={"root": "gcodes"},
                )

        print("UPLOAD STATUS:", response.status_code)
        print("UPLOAD RESPONSE:", response.text)

        if response.status_code not in [200, 201]:
            raise Exception(f"Upload failed: {response.text}")

        try:
            server_filename = response.json().get("item", {}).get("path", filename)
            return server_filename
        except Exception:
            return filename

    except Exception as e:
        print("UPLOAD ERROR:", str(e))
        raise Exception(f"Upload failed: {str(e)}")


# ==============================
# Start Print with Moonraker — port 80
# ==============================
async def start_print(printer_ip: str, filename: str) -> None:
    url = f"http://{printer_ip}/printer/print/start"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json={"filename": filename})

        print("PRINT STATUS:", response.status_code)
        print("PRINT RESPONSE:", response.text)

        if response.status_code != 200:
            raise Exception(f"Moonraker rejected print: {response.text}")

    except Exception as e:
        print("START PRINT ERROR:", str(e))
        raise Exception(f"Start print failed: {str(e)}")