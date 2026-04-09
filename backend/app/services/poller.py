import os
import time
import threading
from datetime import datetime

from app.core.database import SessionLocal
from app.models.printer import Printer
from app.models.batch_printer import BatchPrinter
from app.models.job_history import JobHistory


DEV_MODE = os.getenv("DEV_MODE", "true") == "true"


def poller_loop():
    print("Poller loop running...")

    while True:
        db = SessionLocal()

        printers = db.query(Printer).all()

        for printer in printers:

            if printer.status == "printing":

                printer.progress += 5

                if printer.progress >= 100:

                    printer.progress = 100
                    printer.status = "idle"
                    printer.last_seen = datetime.utcnow()

                    # Find current batch job
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

                        # Save history
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

            # Simulation offline behavior
            if DEV_MODE:
                if printer.status != "printing":
                    if printer.progress < 25:
                        printer.status = "offline"
                    else:
                        printer.status = "idle"

        db.commit()
        db.close()

        time.sleep(5)


def start_poller():
    thread = threading.Thread(target=poller_loop)
    thread.daemon = True
    thread.start()