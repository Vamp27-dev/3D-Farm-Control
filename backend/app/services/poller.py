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


# ══════════════════════════════════════════════════════════════════
# FETCH KLIPPER DATA  (Moonraker port 80)
# Fetches: print_stats, virtual_sdcard, heater_bed,
#          extruder, print_time_left
# ══════════════════════════════════════════════════════════════════

def fetch_klipper_data(ip: str):
    try:
        url = (
            f"http://{ip}/printer/objects/query"
            "?print_stats&virtual_sdcard&heater_bed&extruder"
            "&estimated_print_time&print_time_left"
        )
        response = requests.get(url, timeout=3)

        if response.status_code != 200:
            return None

        status = response.json()["result"]["status"]

        ps  = status.get("print_stats", {})
        vsd = status.get("virtual_sdcard", {})
        bed = status.get("heater_bed", {})
        ext = status.get("extruder", {})

        raw_state = ps.get("state", "offline")
        state = "idle" if raw_state == "standby" else raw_state

        # ETA — Moonraker gives print_duration and total_duration
        eta_seconds = None
        try:
            total    = vsd.get("file_size", 0)
            position = vsd.get("file_position", 0)
            speed    = ps.get("print_speed", 0)
            duration = ps.get("print_duration", 0)
            progress = vsd.get("progress", 0)

            if progress > 0 and duration > 0 and state == "printing":
                remaining = (duration / progress) - duration
                eta_seconds = max(0, int(remaining))
        except Exception:
            eta_seconds = None

        return {
            "state":           state,
            "progress":        vsd.get("progress", 0),
            "filename":        ps.get("filename") or None,
            "bed_temp":        round(bed.get("temperature", 0), 1),
            "bed_target":      round(bed.get("target", 0), 1),
            "extruder_temp":   round(ext.get("temperature", 0), 1),
            "extruder_target": round(ext.get("target", 0), 1),
            "eta_seconds":     eta_seconds,
        }

    except requests.exceptions.ConnectionError:
        return None
    except Exception as e:
        print(f"[Poller] Error ({ip}): {e}")
        return None


# ══════════════════════════════════════════════════════════════════
# COMPLETE JOB HELPER
# ══════════════════════════════════════════════════════════════════

def complete_job(db, printer):
    job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer.id,
        BatchPrinter.status == "printing",
    ).first()

    if not job:
        return

    job.status       = "completed"
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


# ══════════════════════════════════════════════════════════════════
# POLLER LOOP
# ══════════════════════════════════════════════════════════════════

def poller_loop():
    print("[Poller] Loop started")

    while True:
        db = SessionLocal()
        try:
            printers = db.query(Printer).all()

            for printer in printers:

                # ── KLIPPER (Neptune / Moonraker port 80) ─────────
                if printer.type == "klipper":
                    data = fetch_klipper_data(printer.ip_address)

                    if data:
                        printer.status       = data["state"]
                        printer.progress     = round(float(data["progress"]) * 100, 2)
                        printer.current_file = data["filename"]
                        printer.last_seen    = datetime.utcnow()

                        # ✅ Health fields (store as JSON-like in extra columns if they exist,
                        #    otherwise we pass them via WebSocket only)
                        # Store in DB if columns exist — graceful fallback
                        try:
                            printer.bed_temp        = data["bed_temp"]
                            printer.bed_target      = data["bed_target"]
                            printer.extruder_temp   = data["extruder_temp"]
                            printer.extruder_target = data["extruder_target"]
                            printer.eta_seconds     = data["eta_seconds"]
                        except Exception:
                            pass  # columns don't exist yet — ok

                        print(
                            f"[Poller] {printer.name} → {printer.status} "
                            f"{printer.progress}% "
                            f"| bed {data['bed_temp']}°/{data['bed_target']}° "
                            f"| ext {data['extruder_temp']}°/{data['extruder_target']}°"
                        )

                        if data["state"] == "idle" and printer.progress >= 99:
                            complete_job(db, printer)
                            printer.progress = 0

                    else:
                        printer.status   = "offline"
                        printer.progress = 0

                # ── CENTAURI — handled by centauri_ws.py ──────────
                elif printer.type == "centauri":
                    pass

                # ── SIMULATION ────────────────────────────────────
                else:
                    if printer.status == "printing":
                        printer.progress  = min(printer.progress + 5, 100)
                        printer.last_seen = datetime.utcnow()
                        if printer.progress >= 100:
                            complete_job(db, printer)
                            printer.status   = "idle"
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


# ══════════════════════════════════════════════════════════════════
# START THREAD
# ══════════════════════════════════════════════════════════════════

def start_poller():
    thread = threading.Thread(target=poller_loop, daemon=True)
    thread.start()
    print("[Poller] Thread started")