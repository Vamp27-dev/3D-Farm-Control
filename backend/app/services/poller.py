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
# FETCH KLIPPER DATA
# Queries: print_stats, virtual_sdcard, heater_bed, extruder
# ══════════════════════════════════════════════════════════════════

def fetch_klipper_data(ip: str):
    try:
        url = (
            f"http://{ip}/printer/objects/query"
            "?print_stats&virtual_sdcard&heater_bed&extruder"
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

        # ✅ FIX ETA: Use Moonraker's own estimated_time field from print_stats
        # estimated_time = total estimated seconds for the print
        # print_duration  = seconds elapsed so far (excludes heat-up)
        # remaining       = estimated_time - print_duration
        eta_seconds = None
        try:
            estimated_time = ps.get("estimated_time", 0)   # total job estimate
            print_duration = ps.get("print_duration", 0)   # time elapsed printing
            progress       = vsd.get("progress", 0)

            if state == "printing" and estimated_time > 0 and print_duration >= 0:
                # Method 1: use Moonraker's own estimate (most accurate)
                remaining = estimated_time - print_duration
                eta_seconds = max(0, int(remaining))
            elif state == "printing" and progress > 0 and print_duration > 0:
                # Method 2: fallback — extrapolate from elapsed time + progress
                total_estimated = print_duration / progress
                remaining = total_estimated - print_duration
                eta_seconds = max(0, int(remaining))
        except Exception:
            eta_seconds = None

        return {
            "state":           state,
            "progress":        vsd.get("progress", 0),
            "filename":        ps.get("filename") or None,
            "print_duration":  ps.get("print_duration", 0),
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
# WRITE JOB HISTORY (success or cancelled/failed)
# ══════════════════════════════════════════════════════════════════

def write_history(db, printer, job, status: str):
    """Write a record to job_history. status = 'success' | 'failed' | 'cancelled'"""
    try:
        completed_at = datetime.utcnow()
        duration = (
            int((completed_at - job.started_at).total_seconds())
            if job.started_at else 0
        )

        # Get file_id safely
        file_id = None
        try:
            file_id = job.batch.file_id
        except Exception:
            pass

        history = JobHistory(
            printer_id=printer.id,
            batch_id=job.batch_id,
            file_id=file_id,
            status=status,
            started_at=job.started_at,
            completed_at=completed_at,
            duration_seconds=duration,
        )
        db.add(history)
        job.completed_at = completed_at
        printer.current_file = None
        print(f"[History] {printer.name} → {status} ({duration}s)")
    except Exception as e:
        print(f"[History] Failed to write history: {e}")


# ══════════════════════════════════════════════════════════════════
# COMPLETE JOB HELPER
# ══════════════════════════════════════════════════════════════════

def complete_job(db, printer):
    """Mark active printing job as completed and write success to history."""
    job = db.query(BatchPrinter).filter(
        BatchPrinter.printer_id == printer.id,
        BatchPrinter.status == "printing",
    ).first()

    if not job:
        return

    job.status = "completed"
    write_history(db, printer, job, "success")


# ══════════════════════════════════════════════════════════════════
# POLLER LOOP
# ══════════════════════════════════════════════════════════════════

def poller_loop():
    print("[Poller] Loop started")

    # Track previous states to detect transitions
    prev_states: dict = {}

    while True:
        db = SessionLocal()
        try:
            printers = db.query(Printer).all()

            for printer in printers:

                prev_state = prev_states.get(printer.id, {})

                # ── KLIPPER / MOONRAKER ───────────────────────────
                if printer.type == "klipper":
                    data = fetch_klipper_data(printer.ip_address)

                    if data:
                        new_state = data["state"]

                        # ✅ Detect completion: was printing, now idle/standby
                        was_printing = prev_state.get("status") == "printing"
                        now_idle     = new_state in ("idle", "standby", "complete")

                        if was_printing and now_idle:
                            # Check if progress was high enough = real completion
                            prev_progress = prev_state.get("progress", 0)
                            if prev_progress >= 0.9:  # 90%+ = success
                                complete_job(db, printer)
                                printer.progress = 0
                            # If < 90% and now idle = something went wrong (cancelled/failed)
                            # The cancel endpoint handles explicit cancels
                            # This covers unexpected stops

                        printer.status       = new_state
                        printer.progress     = round(float(data["progress"]) * 100, 2)
                        printer.current_file = data["filename"]
                        printer.last_seen    = datetime.utcnow()

                        # Health fields
                        try:
                            printer.bed_temp        = data["bed_temp"]
                            printer.bed_target      = data["bed_target"]
                            printer.extruder_temp   = data["extruder_temp"]
                            printer.extruder_target = data["extruder_target"]
                            printer.eta_seconds     = data["eta_seconds"]
                        except Exception:
                            pass

                        print(
                            f"[Poller] {printer.name} → {printer.status} "
                            f"{printer.progress:.1f}%"
                            + (f" ETA {data['eta_seconds']//60}m" if data.get('eta_seconds') else "")
                            + f" | 🔥{data['extruder_temp']}° 🛏{data['bed_temp']}°"
                        )

                    else:
                        # Went offline — if was printing, mark as failed
                        if prev_state.get("status") == "printing":
                            job = db.query(BatchPrinter).filter(
                                BatchPrinter.printer_id == printer.id,
                                BatchPrinter.status == "printing",
                            ).first()
                            if job:
                                job.status = "failed"
                                write_history(db, printer, job, "failed")

                        printer.status       = "offline"
                        printer.progress     = 0
                        printer.current_file = None

                    # Track state for next cycle
                    prev_states[printer.id] = {
                        "status":   printer.status,
                        "progress": data["progress"] if data else 0,
                    }

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