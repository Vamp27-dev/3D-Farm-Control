import os
import time
import threading
from datetime import datetime

import requests

from app.core.database import SessionLocal
from app.models.printer import Printer
from app.models.batch_printer import BatchPrinter
from app.models.job_history import JobHistory


DEV_MODE = os.getenv("DEV_MODE", "true") == "true"


# ==============================
# FETCH KLIPPER DATA
# ✅ FIX: Moonraker on port 80 (not 7125) for Elegoo Neptune / Fluidd
# ==============================

def fetch_klipper_data(ip: str):
    try:
        # Port 80 — confirmed working on this farm's printers
        url = f"http://{ip}/printer/objects/query?print_stats&virtual_sdcard"
        response = requests.get(url, timeout=3)

        if response.status_code != 200:
            print(f"[Poller] {ip} returned HTTP {response.status_code}")
            return None

        data = response.json()["result"]["status"]

        raw_state = data["print_stats"]["state"]
        state = "idle" if raw_state == "standby" else raw_state

        filename = data["print_stats"].get("filename") or None
        progress = data["virtual_sdcard"]["progress"]

        return {
            "state": state,
            "progress": progress,
            "filename": filename,
        }

    except requests.exceptions.ConnectionError:
        print(f"[Poller] Cannot reach {ip} — offline")
        return None
    except Exception as e:
        print(f"[Poller] Error ({ip}): {e}")
        return None


# ==============================
# COMPLETE JOB HELPER
# ==============================

def complete_job(db, printer):
    job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer.id,
        BatchPrinter.status == "printing",
    ).first()

    if not job:
        return

    job.status = "completed"
    job.completed_at = datetime.utcnow()

    duration = (
        int((job.completed_at - job.started_at).total_seconds())
        if job.started_at else 0
    )

    history = JobHistory(
        printer_id=printer.id,
        batch_id=job.batch_id,
        file_id=job.batch.file_id,
        status="success",
        started_at=job.started_at,
        completed_at=job.completed_at,
        duration_seconds=duration,
    )
    db.add(history)
    printer.current_file = None


# ==============================
# POLLER LOOP
# ==============================

def poller_loop():
    print("[Poller] Loop started")

    while True:
        db = SessionLocal()

        try:
            printers = db.query(Printer).all()

            for printer in printers:

                # ── KLIPPER / MOONRAKER (port 80) ────────────────
                if printer.type == "klipper":
                    data = fetch_klipper_data(printer.ip_address)

                    if data:
                        printer.status = data["state"]
                        printer.progress = round(float(data["progress"]) * 100, 2)
                        printer.current_file = data["filename"]
                        printer.last_seen = datetime.utcnow()

                        print(f"[Poller] {printer.name} → {printer.status} {printer.progress}%")

                        # Completion detection
                        if data["state"] == "idle" and printer.progress >= 99:
                            complete_job(db, printer)
                            printer.progress = 0
                    else:
                        printer.status = "offline"
                        printer.progress = 0

                # ── CENTAURI — handled by centauri_ws.py ─────────
                elif printer.type == "centauri":
                    pass

                # ── SIMULATION ────────────────────────────────────
                else:
                    if printer.status == "printing":
                        printer.progress = min(printer.progress + 5, 100)
                        printer.last_seen = datetime.utcnow()

                        print(f"[Poller][SIM] {printer.name} → {printer.progress}%")

                        if printer.progress >= 100:
                            complete_job(db, printer)
                            printer.status = "idle"
                            printer.progress = 0

                    elif DEV_MODE and printer.status != "printing":
                        printer.status = "offline" if printer.progress < 25 else "idle"

            db.commit()

        except Exception as e:
            print(f"[Poller] ERROR: {e}")
            db.rollback()

        finally:
            db.close()

        time.sleep(5)


# ==============================
# START THREAD
# ==============================

def start_poller():
    thread = threading.Thread(target=poller_loop, daemon=True)
    thread.start()
    print("[Poller] Thread started")