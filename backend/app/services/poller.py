import os
import time
import threading
from datetime import datetime

import requests

from app.core.database import SessionLocal
from app.models.printer import Printer
from app.models.batch_printer import BatchPrinter
from app.models.job_history import JobHistory
from app.models.batch import Batch


DEV_MODE = os.getenv("DEV_MODE", "true") == "true"


# ══════════════════════════════════════════════════════════════════
# FETCH KLIPPER DATA
# Queries: print_stats, virtual_sdcard, heater_bed, extruder
# Plus: error/pause message + filament sensor status (if configured)
# ══════════════════════════════════════════════════════════════════

# Cache which printers have a filament sensor + its object name,
# so we don't re-discover objects on every single poll cycle (5s)
_filament_sensor_cache: dict = {}


def _discover_filament_sensor(ip: str):
    """
    Look up the printer's available Klipper objects once and find any
    configured filament_switch_sensor. Returns the full object key
    (e.g. 'filament_switch_sensor extruder_sensor') or None if the
    printer has no such sensor configured.
    """
    try:
        res = requests.get(f"http://{ip}/printer/objects/list", timeout=3)
        if res.status_code != 200:
            return None
        objects = res.json().get("result", {}).get("objects", [])
        for obj in objects:
            if obj.startswith("filament_switch_sensor"):
                return obj
        return None
    except Exception:
        return None


def fetch_klipper_data(ip: str):
    try:
        # Discover filament sensor name once per printer, cache it
        if ip not in _filament_sensor_cache:
            _filament_sensor_cache[ip] = _discover_filament_sensor(ip)
        sensor_key = _filament_sensor_cache[ip]

        # ✅ Always query pause_resume — this is the reliable paused signal
        query_objects = "print_stats&virtual_sdcard&heater_bed&extruder&pause_resume"
        if sensor_key:
            query_objects += f"&{sensor_key}"

        url = f"http://{ip}/printer/objects/query?{query_objects}"
        response = requests.get(url, timeout=3)

        if response.status_code != 200:
            return None

        status = response.json()["result"]["status"]

        ps  = status.get("print_stats", {})
        vsd = status.get("virtual_sdcard", {})
        bed = status.get("heater_bed", {})
        ext = status.get("extruder", {})
        pr  = status.get("pause_resume", {})

        raw_state = ps.get("state", "offline")
        state = "idle" if raw_state == "standby" else raw_state

        # ✅ Filament sensor status — most reliable signal for runout
        filament_detected = None
        if sensor_key:
            sensor_data = status.get(sensor_key, {})
            filament_detected = sensor_data.get("filament_detected")

        # ✅ Synthesize pause/error reason from multiple signals
        # Klipper does NOT reliably write print_stats.message on filament runout.
        # We detect the reason ourselves by combining state + sensor + pause_resume.
        klipper_message = (ps.get("message") or "").strip()

        error_message = None

        if state == "paused":
            if filament_detected is False:
                # Filament sensor says no filament — this is a runout pause
                error_message = "Filament runout detected — please reload filament and resume"
            elif klipper_message:
                # Klipper wrote a message — use it
                error_message = klipper_message
            else:
                # Paused but we don't know why — generic message
                error_message = "Print paused"

        elif state == "error":
            error_message = klipper_message or "Printer error — check Fluidd for details"

        elif state == "printing" and filament_detected is False:
            # Sensor tripped but Klipper hasn't paused yet (brief window)
            error_message = "⚠ Filament runout detected"

        # ✅ ETA: use Moonraker's own estimated_time field
        eta_seconds = None
        try:
            estimated_time = ps.get("estimated_time", 0)
            print_duration = ps.get("print_duration", 0)
            progress       = vsd.get("progress", 0)

            if state == "printing" and estimated_time > 0 and print_duration >= 0:
                remaining   = estimated_time - print_duration
                eta_seconds = max(0, int(remaining))
            elif state == "printing" and progress > 0 and print_duration > 0:
                total_estimated = print_duration / progress
                remaining       = total_estimated - print_duration
                eta_seconds     = max(0, int(remaining))
        except Exception:
            eta_seconds = None

        return {
            "state":             state,
            "progress":          vsd.get("progress", 0),
            "filename":          ps.get("filename") or None,
            "print_duration":    ps.get("print_duration", 0),
            "bed_temp":          round(bed.get("temperature", 0), 1),
            "bed_target":        round(bed.get("target", 0), 1),
            "extruder_temp":     round(ext.get("temperature", 0), 1),
            "extruder_target":   round(ext.get("target", 0), 1),
            "eta_seconds":       eta_seconds,
            "error_message":     error_message,
            "filament_detected": filament_detected,
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

    batch_id   = job.batch_id
    job.status = "completed"
    write_history(db, printer, job, "success")

    # ✅ Archive the batch (not delete) once every job in it is terminal —
    # keeps it visible in History for production tracking
    try:
        from app.routers.batch import check_and_archive_batch
        check_and_archive_batch(db, batch_id)
    except Exception as e:
        print(f"[Poller] Archive check failed: {e}")


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

                        # ✅ Map "complete" → "idle" so it's treated consistently
                        # Klipper briefly reports "complete" before going to standby
                        if new_state == "complete":
                            new_state = "idle"

                        # ✅ Detect completion: was printing, now idle/standby
                        was_printing = prev_state.get("status") == "printing"
                        now_idle     = new_state in ("idle", "standby")

                        if was_printing and now_idle:
                            # Use prev_state progress, fall back to current printer.progress
                            # (covers server restart where prev_states was empty)
                            prev_progress = prev_state.get("progress", 0)
                            if prev_progress == 0:
                                # Fallback: use what's stored in DB from last poll
                                prev_progress = (printer.progress or 0) / 100.0

                            if prev_progress >= 0.85:  # ✅ lowered from 0.9 → more forgiving
                                complete_job(db, printer)
                                printer.progress = 0
                            # If < 85%: unexpected stop — cancel endpoint handles explicit
                            # cancels, this path covers power loss / network drop mid-print

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

                        # ✅ Error / pause reason + filament sensor status
                        # Cleared automatically once the printer goes back to idle/printing normally
                        try:
                            printer.error_message = data["error_message"]
                            printer.filament_detected = data["filament_detected"]
                        except Exception:
                            pass

                        log_line = (
                            f"[Poller] {printer.name} → {printer.status} "
                            f"{printer.progress:.1f}%"
                            + (f" ETA {data['eta_seconds']//60}m" if data.get('eta_seconds') else "")
                            + f" | 🔥{data['extruder_temp']}° 🛏{data['bed_temp']}°"
                        )
                        if data.get("error_message"):
                            log_line += f" | ⚠️ {data['error_message']}"
                        print(log_line)

                    else:
                        # Went offline — check if it was near completion before going offline
                        if prev_state.get("status") == "printing":
                            prev_progress = prev_state.get("progress", 0)
                            if prev_progress == 0:
                                prev_progress = (printer.progress or 0) / 100.0

                            if prev_progress >= 0.85:
                                # ✅ Was at 85%+ when connection dropped = almost certainly
                                # completed. Write success rather than failed.
                                complete_job(db, printer)
                                print(f"[Poller] {printer.name} went offline at {prev_progress*100:.0f}% — marking as success")
                            else:
                                job = db.query(BatchPrinter).filter(
                                    BatchPrinter.printer_id == printer.id,
                                    BatchPrinter.status == "printing",
                                ).first()
                                if job:
                                    job.status = "failed"
                                    write_history(db, printer, job, "failed")
                                    try:
                                        from app.routers.batch import check_and_archive_batch
                                        check_and_archive_batch(db, job.batch_id)
                                    except Exception as e:
                                        print(f"[Poller] Archive check failed: {e}")

                        printer.status        = "offline"
                        printer.progress      = 0
                        printer.current_file  = None
                        printer.error_message = None      # stale once unreachable
                        printer.filament_detected = None

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