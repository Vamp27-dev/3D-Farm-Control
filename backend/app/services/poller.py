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
# FETCH KLIPPER DATA (REAL PRINTER)
# ==============================

def fetch_klipper_data(ip):
    try:
        url = f"http://{ip}:7125/printer/objects/query?print_stats"

        response = requests.get(url, timeout=3)

        if response.status_code != 200:
            return None

        data = response.json()

        stats = data.get("result", {}).get("status", {}).get("print_stats", {})

        return {
            "state": stats.get("state", "offline"),
            "progress": stats.get("progress", 0.0),
            "filename": stats.get("filename")
        }

    except Exception:
        return None


# ==============================
# POLLER LOOP
# ==============================

def poller_loop():
    print("Poller loop running...")

    while True:
        db = SessionLocal()

        printers = db.query(Printer).all()

        for printer in printers:

            # ==========================
            # 🔥 REAL PRINTER (KLIPPER)
            # ==========================
            if printer.brand and printer.brand.lower() in ["elegoo", "klipper"]:

                data = fetch_klipper_data(printer.ip_address)

                if data:
                    printer.status = data["state"]
                    printer.progress = float(data["progress"]) * 100
                    printer.current_file = data["filename"]
                    printer.last_seen = datetime.utcnow()

                    # Handle completion detection
                    if printer.status == "standby" and printer.progress >= 99:

                        job = db.query(BatchPrinter).filter(
                            BatchPrinter.printer_id == printer.id,
                            BatchPrinter.status == "printing"
                        ).first()

                        if job:
                            job.status = "completed"
                            job.completed_at = datetime.utcnow()

                            duration = int(
                                (job.completed_at - job.started_at).total_seconds()
                            ) if job.started_at else 0

                            history = JobHistory(
                                printer_id=printer.id,
                                batch_id=job.batch_id,
                                file_id=job.batch.file_id,
                                status="success",
                                started_at=job.started_at,
                                completed_at=job.completed_at,
                                duration_seconds=duration
                            )

                            db.add(history)

                            printer.current_file = None

                else:
                    printer.status = "offline"
                    printer.progress = 0

            # ==========================
            # 🧪 SIMULATION MODE
            # ==========================
            else:
                if printer.status == "printing":

                    printer.progress += 5

                    if printer.progress >= 100:

                        printer.progress = 100
                        printer.status = "idle"
                        printer.last_seen = datetime.utcnow()

                        job = db.query(BatchPrinter).filter(
                            BatchPrinter.printer_id == printer.id,
                            BatchPrinter.status == "printing"
                        ).first()

                        if job:
                            job.status = "completed"
                            job.completed_at = datetime.utcnow()

                            duration = int(
                                (job.completed_at - job.started_at).total_seconds()
                            ) if job.started_at else 0

                            history = JobHistory(
                                printer_id=printer.id,
                                batch_id=job.batch_id,
                                file_id=job.batch.file_id,
                                status="success",
                                started_at=job.started_at,
                                completed_at=job.completed_at,
                                duration_seconds=duration
                            )

                            db.add(history)

                        printer.current_file = None

                    printer.last_seen = datetime.utcnow()

                if DEV_MODE:
                    if printer.status != "printing":
                        if printer.progress < 25:
                            printer.status = "offline"
                        else:
                            printer.status = "idle"

        db.commit()
        db.close()

        time.sleep(5)


# ==============================
# START THREAD
# ==============================

def start_poller():
    thread = threading.Thread(target=poller_loop)
    thread.daemon = True
    thread.start()