# 3D Farm Control

**Internal fleet management for a multi-protocol 3D printer farm.**

Farm Control is a full-stack web app for monitoring and operating a farm of Elegoo 3D printers — Centauri Carbon (SDCP WebSocket protocol) and Neptune/Klipper machines (Moonraker REST API) — from a single dashboard. It handles live status, batch print queuing, file management, print history/analytics, camera feeds, and role-based access, across two office/workshop network subnets.

> Built and maintained by Ashwit for internal production use. See [License](#license) before using this outside personal/non-commercial contexts.

---

## Table of Contents

- [Features](#features)
- [Supported Printers & Protocols](#supported-printers--protocols)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Configuration Reference](#configuration-reference)
- [Using the App](#using-the-app)
- [Deployment & Updates](#deployment--updates)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- **Unified dashboard** for every printer regardless of type — status pills, live progress, temps, ETA, and errors, sorted by status without shuffling on refresh.
- **Batch printing** — queue one file across many printers at once; per-printer job tracking (waiting → printing → completed/failed/cancelled); auto-archiving when a batch finishes.
- **Live control** — pause, resume, cancel, start-next-in-queue, temperature set points, and chamber light toggle (Centauri), branched per printer protocol.
- **File library** — upload/organize G-code and CTB files into folders, admin-only write access.
- **Print history & analytics** — success-rate tracking, CSV export, all timestamps stored in UTC and displayed in IST.
- **Live camera feeds** — MJPEG (Neptune) and native SDCP video (Centauri) inline in the printer tray.
- **Role-based access** — `admin` (full control) vs `viewer` (read-only).
- **Industrial-grade UI** — 6-color status-only palette, outline icon set, no gradients/emoji, dark/light theme with animated View Transitions.
- **Runs on a single container** — FastAPI serves the built React frontend directly; one port (`8000`) reachable from both network subnets.

## Supported Printers & Protocols

| Printer type | Protocol | Notes |
|---|---|---|
| **Elegoo Centauri Carbon** | SDCP V3.0.0 over WebSocket (`ws://{ip}:3030/websocket`) | Persistent listener thread per printer; commands use short-lived connections; upload goes to port 80, not 3030; filenames must be sent as full `/local/{filename}` path. |
| **Elegoo Neptune 4 Max (Klipper)** | Moonraker REST API on port 80 | Polled every 5s; ETA sourced from slicer metadata since Moonraker's own `estimated_time` field isn't reliable. |

Both protocol layers are strictly isolated in code — Neptune/Klipper logic is treated as a stable baseline and is never touched when working on Centauri, and vice versa.

## Tech Stack

**Backend:** FastAPI (Python), SQLAlchemy + PostgreSQL, JWT auth (python-jose + argon2), `websockets` (Centauri), `httpx` (Klipper), Docker Compose.

**Frontend:** React + TypeScript + Vite, React Router v6, plain inline CSS with CSS variables (no Tailwind/MUI), Framer Motion, View Transitions API.

**Infra:** Docker Compose on Windows (Docker Desktop), FastAPI `StaticFiles` serving the built frontend, named Postgres volume for data persistence.

## Architecture

```
                       ┌─────────────────────────────┐
                       │        Browser (React)       │
                       └──────────────┬───────────────┘
                                      │ HTTPS/JWT
                       ┌──────────────▼───────────────┐
                       │   FastAPI (port 8000, single  │
                       │   container, serves API + SPA)│
                       └───────┬───────────────┬───────┘
                               │               │
                 ┌─────────────▼───┐   ┌───────▼──────────┐
                 │ Klipper poller   │   │ Centauri listener │
                 │ (5s HTTP poll,   │   │ (persistent WS per │
                 │ background thread)│  │ printer, 5s status) │
                 └─────────┬────────┘   └────────┬──────────┘
                           │                      │
                 ┌─────────▼──────────────────────▼─────────┐
                 │        PostgreSQL (named volume)          │
                 └─────────────────────────────────────────┘
```

Both printer subnets (`192.168.11.x` office, `192.168.68.x` printer network) reach the same container because Docker binds `0.0.0.0:8000`.

## Repository Structure

```
3D-Farm-Control/
├── docker-compose.yml
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # FastAPI entry, startup, migrations, SPA serve
│       ├── core/                    # database.py, security.py
│       ├── models/                  # printer, batch, batch_printer, job_history, file, folder, tag, user
│       ├── schemas/                 # Pydantic request/response models
│       ├── routers/                 # printer, batch, file, analytics, auth, users
│       └── services/
│           ├── poller.py            # Klipper/Moonraker poll loop
│           ├── printer_service.py   # Klipper upload/start
│           ├── centauri_protocol.py # SDCP packet building, command IDs
│           ├── centauri_service.py  # Persistent WS listener per Centauri printer
│           └── centauri_upload.py   # HTTP multipart upload (MD5 required)
└── frontend/
    ├── index.html
    ├── public/                      # icons, manifest
    └── src/
        ├── App.tsx                  # routes, Sidebar, Dashboard, PrinterCard/Tray
        ├── theme.tsx                # dark/light theme, View Transitions
        ├── Login.tsx / Batches.tsx / Files.tsx / PrinterManagement.tsx
        ├── UserManagement.tsx / PrintHistory.tsx / ProtectedRoute.tsx
        ├── PrinterIcon.tsx          # NeptuneIcon / CentauriIcon SVGs
        └── utils/                   # auth.ts, date.ts (IST formatting)
```

## Prerequisites

- Windows machine (or any Docker host) with **Docker Desktop** installed and running
- Node.js + npm (for building the frontend before deploy)
- Network access to both printer subnets from the host
- Elegoo printers already on the network with known IPs
- Administrator access to open a firewall port (once)

## Setup Guide

### 1. Clone the repository

```powershell
git clone https://github.com/Vamp27-dev/3D-Farm-Control.git
cd 3D-Farm-Control
```

### 2. Configure environment

Open `docker-compose.yml` and set:

```yaml
environment:
  SECRET_KEY: "<generate a long random string>"   # used to sign JWTs — change from any default!
  DEV_MODE: "false"                                 # false in production
```

Generate a strong secret, for example:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Build the frontend

```powershell
cd frontend
npm install
npm run build
cd ..
```

This produces `frontend/dist/`, which the backend container mounts and serves directly — there's no separate frontend server or port.

### 4. Start the stack

```powershell
docker-compose up --build -d
```

This builds the backend image, starts PostgreSQL with a **named volume** (`postgres_data`) so data survives restarts, and runs any pending DB migrations automatically on startup.

> ⚠️ **Never run `docker-compose down -v`** — the `-v` flag deletes the named volume and wipes your entire database (printers, batches, history, users). Use `docker-compose down` (no `-v`) or `docker-compose restart` for normal operations.

### 5. Open the firewall (one-time, as Administrator)

```powershell
New-NetFirewallRule -DisplayName "Farm Controller" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

### 6. Access the app

```
http://192.168.11.X:8000    ← office network
http://192.168.68.X:8000    ← printer network
```

Both resolve to the same container since it binds all interfaces.

### 7. Create your first admin user

Register through the `/auth/register` endpoint (or the sign-up flow if exposed in the UI) to create the first `admin` account. Additional users can then be managed from **Manage → Users** in the app.

### 8. Add your printers

Go to **Manage → Printers → Add Printer** and enter:

- **Name** and **Location** (freeform)
- **Type** — `klipper` or `centauri`
- **IP address** on either subnet
- **Camera URL** — auto-filled for Centauri (`http://{ip}:3031/video`); enter manually for Neptune if you have an MJPEG source

On first connect, Centauri printers auto-discover their `MainboardID` via the SDCP attribute command and save it to the printer record.

## Configuration Reference

| Setting | Location | Notes |
|---|---|---|
| `SECRET_KEY` | `docker-compose.yml` | JWT signing key — must be unique per deployment, never reuse the repo default |
| `DEV_MODE` | `docker-compose.yml` | `true` enables extra debug logging/endpoints; keep `false` in production |
| `postgres_data` volume | `docker-compose.yml` | Persistent DB storage — do not delete |
| `file_storage` volume | `docker-compose.yml` | Uploaded G-code/CTB files |
| Port `8000` | `docker-compose.yml` | Single port for API + SPA, bound to `0.0.0.0` |
| JWT expiry | `backend/app/core/security.py` | Default 8h token lifetime |

## Using the App

- **Dashboard** — grid of all printers with live status, KPI strip, and filter pills (All/Printing/Paused/Idle/Offline). Click a card to open the tray for temps, camera, queue, and job controls.
- **Batches** — create a batch by picking a file and a set of printers of the same type; track per-printer progress; completed batches collapse into an archive dropdown.
- **Files** — upload and organize print files into folders (admin only).
- **History** — paginated job history with IST timestamps and CSV export.
- **Manage → Printers** — edit name/IP/location/camera URL, or remove a printer (blocked while it's actively printing).
- **Manage → Users** — admin-only user CRUD; the last remaining admin can't be deleted.

**Roles:**
- `admin` — full access: add/edit/delete printers, upload/delete files, manage users, start/control batches.
- `viewer` — read-only: dashboard, history, and file list visible; no uploads, deletes, or print control.

## Deployment & Updates

After making code changes:

```powershell
# Rebuild the frontend if you touched anything in frontend/src
cd frontend && npm run build && cd ..

# Redeploy without losing data
docker-compose up --build -d
```

This is safe to run any time — it rebuilds images and restarts containers but keeps the named `postgres_data` and `file_storage` volumes intact.

## Backups

Since all state lives in the `postgres_data` Docker volume, back it up periodically:

```powershell
docker exec farm_backend_db pg_dump -U <user> <database> > backup_$(Get-Date -Format yyyyMMdd).sql
```

Store backups off the host machine (network share or cloud) — a Docker Desktop reinstall or disk failure would otherwise take the volume with it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Refreshing a frontend route (e.g. `/batches`) returns raw JSON | Frontend/API path clash | App already avoids this by using `/manage/printers` instead of `/printers/manage` — if you add new routes, keep them out of API-prefixed paths |
| Centauri Start Print returns Ack 2 (File Not Found) | Filename sent without full path | Must send `/local/{filename}`, not the bare filename |
| Centauri print stuck "printing" after cancel | Stale `PrintInfo` from the completed job | Cancel flow does an immediate DB idle write plus a ~30s push-block; if you see this, check `cur_layer` guard logic in `centauri_service.py` |
| Centauri ETA wildly wrong | `TotalTicks` mistaken for milliseconds | It's in **seconds** — confirmed against real hardware |
| Klipper ETA missing/zero | Relying on Moonraker's `estimated_time` field | That field doesn't exist on real responses — ETA is sourced from the slicer's file metadata instead |
| All history entries show "failed" after a restart | `prev_states` cache empty on cold start | Falls back to `printer.progress/100`; offline at ≥85% progress counts as success, not failure |
| Data disappeared after a restart | `docker-compose down -v` was run | Don't use `-v` — it deletes the named volume. Restore from backup if this already happened |
| Login works on one subnet but not the other | Firewall rule not applied, or container not bound to `0.0.0.0` | Re-check the `New-NetFirewallRule` step and the `ports: "0.0.0.0:8000:8000"` line in `docker-compose.yml` |

## Roadmap

- **Read-only Bambu Lab monitoring** — surfacing status, progress, current file, and camera feed for a separate 100+ printer Bambu farm (managed/dispatched by Bambu's own farm software) inside this same dashboard, with no print-control capability for that printer type.
- Printer maintenance/uptime tracking (nozzle hours, service reminders).
- Spool/material inventory tracking tied to batches.
- Alerting (Slack/Telegram/email) on print failures or printer-offline events.
- Prometheus/Grafana metrics export for long-term trend dashboards.

See [Suggestions for Next Steps](#) below for more.

## License

This project is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

In short: you're free to view, use, modify, and share this code for **noncommercial purposes** (personal use, learning, internal use by non-profits/educational/government bodies), but **no one may use it for commercial purposes without express written permission from the copyright holder**. See [`LICENSE`](LICENSE) for the full legal text.

If you'd like a commercial license, open an issue or contact the repository owner directly.

---

*Made by Ashwit ❤️ — internal production tool for a real printer farm, built and hardened against actual hardware, not just spec docs.*