import httpx
import os 


# ==========================
# KLIPPER (Moonraker)
# ==========================
async def get_klipper_status(ip: str):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(
                f"http://{ip}/printer/objects/query?print_stats&virtual_sdcard"
            )
            print("Connecting to:", ip)

        data = res.json()["result"]["status"]

        raw_state = data["print_stats"]["state"]

        if raw_state == "standby":
            state = "idle"
        else:
            state = raw_state

        filename = data["print_stats"]["filename"]
        progress = data["virtual_sdcard"]["progress"]

        return {
            "state": state,
            "filename": filename,
            "progress": progress
        }

    except Exception as e:
        print("Klipper error:", e)
        return {
            "state": "offline",
            "filename": None,
            "progress": 0
        }


# ==========================
# BAMBU (placeholder)
# ==========================
async def get_bambu_status(ip: str):
    try:
        # TEMP: replace later with MQTT
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"http://{ip}/status")

        data = res.json()

        return {
            "state": data.get("state", "idle"),
            "filename": data.get("file", None),
            "progress": data.get("progress", 0)
        }

    except Exception as e:
        print("Bambu error:", e)
        return {
            "state": "offline",
            "filename": None,
            "progress": 0
        }
    
# ==========================
# File Upload To Moonraker
#    
async def upload_file_to_printer(printer_ip: str, file_path: str):
    url = f"http://{printer_ip}/server/files/upload"

    filename = os.path.basename(file_path)

    try:
        with open(file_path, "rb") as f:
            files = {
                "file": (filename, f, "application/octet-stream")
            }

            data = {
                "root": "gcodes"   # 🔥 VERY IMPORTANT
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, files=files, data=data)

        print("UPLOAD STATUS:", response.status_code)
        print("UPLOAD RESPONSE:", response.text)

        if response.status_code not in [200, 201]:
            raise Exception("Upload failed")

        return filename

    except Exception as e:
        print("UPLOAD ERROR REAL:", str(e))
        raise Exception("Upload failed")


# ==========================
# Start Print with Moonraker
#     

async def start_print(printer_ip: str, filename: str):
    url = f"http://{printer_ip}/printer/print/start"

    try:
        payload = {
            "filename": filename   # ❗ NO gcodes/ here
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)

        print("PRINT STATUS:", response.status_code)
        print("PRINT RESPONSE:", response.text)

        if response.status_code != 200:
            raise Exception(response.text)

    except Exception as e:
        print("START PRINT ERROR:", str(e))
        raise Exception("Start print failed")