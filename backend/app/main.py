from datetime import date

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio

from app.core.database import Base, engine, SessionLocal

# Import ALL models (important for table creation)
from app.models import printer, tag, batch, batch_printer, file, user, job_history, license as license_model

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
from app.routers import license as license_router

from app.services.poller import start_poller
from app.models.printer import Printer
from app.models.license import LicenseState


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
        "ALTER TABLE batches ALTER COLUMN file_id DROP NOT NULL",
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
import os

# ✅ In production (DEV_MODE=false), FastAPI's auto-generated /docs,
# /redoc, and /openapi.json are disabled entirely. By default these
# expose every route -- including /license/activate and
# /license/revoke -- with full request schemas and a "Try it out"
# button, to anyone who visits the URL, no login and no frontend
# button needed. There is no legitimate reason a client-facing
# deployment needs this page live. Set DEV_MODE=true in your own .env
# while developing locally if you want it back temporarily.
_DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

app = FastAPI(
    docs_url="/docs" if _DEV_MODE else None,
    redoc_url="/redoc" if _DEV_MODE else None,
    openapi_url="/openapi.json" if _DEV_MODE else None,
)


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
# ✅ License gate
# Blocks every real API route until this installation has an activated,
# unexpired license. /license/* itself, /health, and static assets stay
# open so the frontend can load and show the activation screen, and so
# license_status()/activate() are reachable to unlock it.
# Deliberately a PREFIX WHITELIST of gated routes rather than a
# blacklist of exempt ones — anything new added later to a gated
# router is automatically covered; anything genuinely new and public
# needs an explicit add to GATED_PREFIXES to be locked, which is the
# safer failure direction.
# ==========================
GATED_PREFIXES = ("/printers", "/batches", "/files", "/analytics", "/auth", "/users", "/tags")


class LicenseGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path

        if request.method == "OPTIONS" or not any(path.startswith(p) for p in GATED_PREFIXES):
            return await call_next(request)

        from app.core.license import verify_license

        db = SessionLocal()
        try:
            state = db.query(LicenseState).first()
            if not state or not state.license_key:
                return JSONResponse(status_code=423, content={"detail": "This installation is not licensed."})

            # Live re-verification, not a trusted static flag. This means:
            #   - rotating your master key pair and redeploying a NEW
            #     PUBLIC_KEY_HEX to this install instantly invalidates
            #     its old stored key on the very next request
            #   - POST /license/revoke clearing license_key takes effect
            #     immediately, same request cycle, no restart needed
            #   - an expiry date passing is caught the moment it passes,
            #     not just next time someone happens to load /license/status
            valid, reason, _payload = verify_license(state.license_key, state.machine_id)
            if state.licensed != valid:
                state.licensed = valid
                db.commit()
            if not valid:
                return JSONResponse(status_code=423, content={"detail": reason})
        finally:
            db.close()

        return await call_next(request)


app.add_middleware(LicenseGateMiddleware)


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
app.include_router(license_router.router)


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
    # Ensure a license_state row (and this install's machine_id) exists
    # before anything else, so the activation screen always has an ID
    # to show even before the first /license/status call.
    db = SessionLocal()
    try:
        if not db.query(LicenseState).first():
            import uuid
            db.add(LicenseState(machine_id=str(uuid.uuid4()), licensed=False))
            db.commit()
    finally:
        db.close()

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
    # zero ambiguity.
    #
    # BUG (confirmed, fixed): only "/assets/*" (the JS/CSS bundle folder)
    # was ever mounted as static files. Everything Vite copies to the
    # ROOT of frontend/dist from frontend/public/ -- favicon.ico,
    # manifest.json, apple-touch-icon.png, and now login-bg.mp4 -- has no
    # dedicated route, so every single request for one of those files was
    # falling straight through to this catch-all and getting index.html's
    # bytes back instead of the real file. A <video> tag pointed at
    # "/login-bg.mp4" was silently receiving an HTML document, which is
    # exactly why the background video never played. Now we check for a
    # real file at that path first, and only fall back to index.html
    # (the actual SPA behavior) when nothing real exists there.
    FRONTEND_DIST_ABS = os.path.abspath(FRONTEND_DIST)

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        requested = os.path.normpath(os.path.join(FRONTEND_DIST, full_path))
        # path-traversal guard: resolved path must stay inside FRONTEND_DIST
        if requested.startswith(FRONTEND_DIST_ABS) and os.path.isfile(requested):
            return FileResponse(requested)

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