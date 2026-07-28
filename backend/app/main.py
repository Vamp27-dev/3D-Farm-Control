from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from app.core.database import Base, engine, SessionLocal

# Import ALL models (important for table creation)
from app.models import printer, tag, batch, batch_printer, file, user, job_history

from app.services import centauri_service
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
# Create tables + safe migrations
# ==========================
Base.metadata.create_all(bind=engine)

# Safe column additions — runs every startup, skips if columns already exist
def run_migrations():
    migrations = [
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS bed_temp FLOAT",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS bed_target FLOAT",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS extruder_temp FLOAT",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS extruder_target FLOAT",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS eta_seconds INTEGER",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS error_message VARCHAR",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS filament_detected BOOLEAN",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS mainboard_id VARCHAR",
        "ALTER TABLE printers ADD COLUMN IF NOT EXISTS light_on BOOLEAN",
        "ALTER TABLE batches ADD COLUMN IF NOT EXISTS name VARCHAR",
        "ALTER TABLE batches ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE",
        # Clear stale filenames on offline printers at startup
        "UPDATE printers SET current_file = NULL, progress = 0 WHERE status = 'offline'",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception as e:
                print(f"Migration skipped: {e}")
        conn.commit()

from sqlalchemy import text
run_migrations()


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
# ✅ SPA passthrough routes
# FastAPI's wildcard /{printer_id} in the printer router catches
# /printers/manage, /printers/5/debug_moonraker etc. before the
# catch-all SPA route can serve index.html.
# Register these explicit GET routes AFTER the routers so they
# still lose to real API endpoints, but the catch-all below
# handles everything else.
# The REAL fix is to ensure the catch-all at the bottom correctly
# serves index.html for ALL non-API GET requests.
# ==========================


# ==========================
# START SERVICES
# ==========================
@app.on_event("startup")
def startup_event():
    print("Starting background poller...")
    start_poller()

    print("Starting Centauri Carbon listeners...")
    # ✅ Starts one persistent WebSocket listener thread per Centauri
    # printer already in the DB. New Centauri printers added later get
    # their listener started automatically by the create_printer endpoint.
    centauri_service.sync_listeners_with_db()


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

    # ✅ Bulletproof SPA catch-all
    # FastAPI matches registered routes FIRST (all API routes).
    # This catch-all only fires for paths that no API route matched.
    # Frontend routes (/manage/printers, /manage/users, /batches, /history etc.)
    # are deliberately chosen to NOT start with any API prefix so there's
    # zero ambiguity. Just serve index.html for everything that gets here.
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        index = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        return {"detail": "Frontend not built — run npm run build"}
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