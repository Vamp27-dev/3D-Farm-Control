from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from app.core.database import Base, engine, SessionLocal

# Import ALL models (important for table creation)
from app.models import printer, tag, batch, batch_printer, file, user, job_history

from app.services.centauri_ws import start_centauri_listener
import threading

# Import routers
from app.routers import printer as printer_router
from app.routers import tag as tag_router
from app.routers import batch as batch_router
from app.routers import file as file_router
from app.routers import analytics as analytics_router
from app.routers import auth as auth_router
from app.routers import users as users_router

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
# ✅ FIX: Explicit CORS origins
# "*" fails when the backend crashes before sending headers.
# Listing origins explicitly also fixes preflight requests.
# ==========================
# ✅ CORS: wildcard origin, internal network only
# allow_credentials=False + allow_origins=["*"] is correct for token-based auth
# The JWT is sent in Authorization header (not a cookie), so credentials=False is fine
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
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
app.include_router(users_router.router)


# ==========================
# START SERVICES
# ==========================
@app.on_event("startup")
def startup_event():
    print("Starting background poller...")
    start_poller()

    print("Starting Centauri listener...")
    threading.Thread(
        target=start_centauri_listener,
        daemon=True,
    ).start()


# ==========================
# Root test
# ==========================
@app.get("/health")
def health():
    return {"status": "ok", "message": "Farm Backend Running 🚀"}

# ✅ Serve built frontend — works from ANY IP the server has
# Both 192.168.11.x and 192.168.68.x users get the same app
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

FRONTEND_DIST = "/app/frontend_dist"  # mounted via docker-compose volume

if os.path.exists(FRONTEND_DIST):
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    # Catch-all: serve index.html for any non-API route (React Router needs this)
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith(("printers", "batches", "files", "auth", "users", "analytics")):
            return {"detail": "Not found"}
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    def root():
        return {"message": "Farm Backend Running 🚀 — serve frontend by mounting dist/"}


# ==========================
# WebSocket Endpoint (Frontend live updates)
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
                        "current_file": p.current_file,
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