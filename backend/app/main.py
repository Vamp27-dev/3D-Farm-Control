from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from app.core.database import Base, engine, SessionLocal

# Import ALL models (important for table creation)
from app.models import printer, tag, batch, batch_printer, file, user, job_history

# Import routers
from app.routers import printer as printer_router
from app.routers import tag as tag_router
from app.routers import batch as batch_router
from app.routers import file as file_router
from app.routers import analytics as analytics_router
from app.routers import auth as auth_router

# Import poller starter
from app.services.poller import start_poller

from app.models.printer import Printer


# ==========================
# Create tables
# ==========================
Base.metadata.create_all(bind=engine)


# ==========================
# Create FastAPI app
# ==========================
app = FastAPI()


# ==========================
# ✅ CORS (FIXED PROPERLY)
# ==========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later restrict to your frontend IP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================
# Include routers
# ==========================
app.include_router(printer_router.router)
app.include_router(tag_router.router)
app.include_router(batch_router.router)
app.include_router(file_router.router)
app.include_router(analytics_router.router)
app.include_router(auth_router.router)


# ==========================
# ✅ START POLLER SAFELY
# ==========================
@app.on_event("startup")
def startup_event():
    print("Starting background poller...")
    start_poller()


# ==========================
# Root test
# ==========================
@app.get("/")
def root():
    return {"message": "Farm Backend Running 🚀"}


# ==========================
# WebSocket Endpoint
# ==========================
@app.websocket("/ws/printers")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected")

    try:
        while True:
            await asyncio.sleep(3)

            db = SessionLocal()

            try:
                printers = db.query(Printer).all()

                data = [
                    {
                        "id": p.id,
                        "name": p.name,
                        "status": p.status,
                        "progress": round(p.progress or 0, 2),
                        "current_file": p.current_file
                    }
                    for p in printers
                ]

                await websocket.send_json({"printers": data})

            except Exception as e:
                print("WebSocket DB Error:", e)

            finally:
                db.close()

    except Exception as e:
        print("WebSocket connection closed:", e)