import asyncio
import websockets
import json

from app.core.database import SessionLocal
from app.models.printer import Printer


async def listen_to_printer(printer_id, ip):
    url = f"ws://{ip}/websocket"

    print(f"[Centauri] Connecting to {url}")

    try:
        async with websockets.connect(url) as ws:
            print(f"[Centauri] Connected to printer {printer_id}")

            while True:
                message = await ws.recv()

                try:
                    data = json.loads(message)
                except:
                    print("Invalid JSON:", message)
                    continue

                handle_message(printer_id, data)

    except Exception as e:
        print(f"[Centauri ERROR] {e}")


def handle_message(printer_id, data):
    db = SessionLocal()

    printer = db.query(Printer).filter(Printer.id == printer_id).first()

    if not printer:
        db.close()
        return

    try:
        topic = data.get("Topic", "")

        # Example parsing (we refine later)
        if "attributes" in topic:
            payload = data.get("Data", {})

            printer.status = "printing" if payload.get("printing") else "idle"
            printer.progress = payload.get("progress", 0)

    except Exception as e:
        print("Parse error:", e)

    db.commit()
    db.close()


def start_centauri_listener():
    db = SessionLocal()
    printers = db.query(Printer).filter(Printer.type == "centauri").all()
    db.close()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    tasks = [
        listen_to_printer(p.id, p.ip_address)
        for p in printers
    ]

    loop.run_until_complete(asyncio.gather(*tasks))