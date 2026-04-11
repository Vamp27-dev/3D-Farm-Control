import httpx


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
async def upload_file_to_printer(ip: str, file_path: str):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.split("/")[-1], f)}
                res = await client.post(
                    f"http://{ip}/server/files/upload",
                    files=files
                )

        data = res.json()

        return data["result"]["item"]["path"]

    except Exception as e:
        print("Upload error:", e)
        return None