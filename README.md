# 3D Farm Control

**Internal fleet management for a multi-protocol 3D printer farm.**

Farm Control is a full-stack web app for monitoring and operating a farm of Elegoo 3D printers — Centauri Carbon (SDCP WebSocket protocol) and Neptune/Klipper machines (Moonraker REST API) — from a single dashboard. It handles live status, batch print queuing, file management, print history/analytics, camera feeds, and role-based access, and is reachable from every IP range on the local network the host is connected to.

> Built and maintained by Ashwit for internal production use.  
> Commercial use requires a license — see [License](#license) before deploying this outside your own non-commercial context.

---

## Table of Contents

- [Features](#features)
- [Supported Printers & Protocols](#supported-printers--protocols)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Activation](#activation)
- [Configuration Reference](#configuration-reference)
- [Using the App](#using-the-app)
- [Deployment & Updates](#deployment--updates)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- **Unified dashboard** — live grid of every printer regardless of type, with status pills, progress bars, temps, ETA, and inline errors. Sorted by status, stable — no shuffling on refresh.
- **Batch printing** — queue one file across many printers at once; per-printer job tracking (waiting → printing → completed/failed/cancelled); auto-archiving when a batch finishes.
- **Live print control** — pause, resume, cancel, start-next-in-queue, temperature set points, and chamber light toggle (Centauri only), all branched per printer protocol.
- **File library** — upload and organize G-code/CTB files into folders; admin-only write access.
- **Print history & analytics** — success-rate tracking, paginated job history, CSV export; all timestamps stored in UTC and displayed in IST.
- **Live camera feeds** — MJPEG (Neptune) and native SDCP stream (Centauri) inline in the printer tray.
- **Role-based access** — `admin` (full control) vs `viewer` (read-only dashboard and history).
- **Offline license lock** — every deployment requires a signed activation key before the app works; keys are machine-bound so they can't be shared across installs.
- **Industrial UI** — 6-color status-only palette, SVG outline icon set, no gradients or emoji, dark/light theme with animated View Transitions reveal.
- **Single-container deploy** — FastAPI serves the built React frontend directly on one port (`8000`), reachable across every IP range on the local network.

---

## Supported Printers & Protocols

| Printer type | Protocol | Notes |
|---|---|---|
| **Elegoo Centauri Carbon** | SDCP V3.0.0 over WebSocket `ws://{ip}:3030/websocket` | Persistent listener thread per printer; commands use short-lived connections; file upload goes to port 80 not 3030; filenames must be sent as full `/local/{filename}` path |
| **Elegoo Neptune 4 Max (Klipper)** | Moonraker REST API on port 80 | Polled every 5 seconds; ETA sourced from slicer metadata — Moonraker's own `estimated_time` field is unreliable on real hardware |

Both protocol layers are strictly isolated in code — Neptune/Klipper logic is treated as a stable baseline and is never touched when working on Centauri features, and vice versa.

---

## Tech Stack

**Backend:** FastAPI (Python), SQLAlchemy + PostgreSQL, JWT auth (python-jose + argon2), `websockets` (Centauri), `httpx` (Klipper), `cryptography` (license verification), Docker Compose.

**Frontend:** React + TypeScript + Vite, React Router v6, plain inline CSS with CSS variables (no Tailwind/MUI), Framer Motion, View Transitions API.

**Infra:** Docker Compose on Windows (Docker Desktop), FastAPI `StaticFiles` serving the built frontend, named Postgres volume for data persistence.

---

## Architecture

```
                    ┌──────────────────────────────┐
                    │        Browser (React)        │
                    └─────────────┬────────────────┘
                                  │ HTTP / JWT
                    ┌─────────────▼────────────────┐
                    │  FastAPI  (port 8000)          │
                    │  API + SPA + License gate      │
                    └──────┬──────────────┬─────────┘
                           │              │
             ┌─────────────▼──┐  ┌────────▼──────────┐
             │ Klipper poller  │  │ Centauri listener  │
             │ (5s HTTP poll,  │  │ (persistent WS per │
             │ background      │  │ printer, 5s status)│
             │ thread)         │  │                    │
             └────────┬────────┘  └────────┬───────────┘
                      │                    │
             ┌────────▼────────────────────▼───────────┐
             │       PostgreSQL  (named volume)         │
             └─────────────────────────────────────────┘
```

Every IP range on the host's LAN reaches the same container because Docker binds `0.0.0.0:8000` — useful if your network is split across multiple router segments or address ranges.

---

## Repository Structure

```
3D-Farm-Control/
├── .env.example                     ← environment template (commit this)
├── .gitignore
├── docker-compose.yml
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  ← FastAPI entry, startup, migrations,
│       │                               license gate middleware, SPA serve
│       ├── core/
│       │   ├── database.py
│       │   ├── security.py          ← JWT decode, require_role()
│       │   └── license.py           ← Ed25519 signature verification,
│       │                               PUBLIC_KEY_HEX lives here
│       ├── models/
│       │   ├── printer.py
│       │   ├── batch.py
│       │   ├── batch_printer.py
│       │   ├── job_history.py
│       │   ├── file.py
│       │   ├── folder.py
│       │   ├── tag.py
│       │   ├── user.py
│       │   └── license.py           ← LicenseState table (machine_id, key,
│       │                               client_name, expires_at, licensed)
│       ├── schemas/
│       │   ├── printer.py
│       │   ├── batch.py
│       │   └── auth.py
│       ├── routers/
│       │   ├── printer.py
│       │   ├── batch.py
│       │   ├── file.py
│       │   ├── analytics.py
│       │   ├── auth.py
│       │   ├── users.py
│       │   └── license.py           ← /license/status, /license/activate
│       └── services/
│           ├── poller.py            ← Klipper/Moonraker 5s poll loop
│           ├── printer_service.py   ← Klipper upload/start
│           ├── centauri_protocol.py ← SDCP packet building, command IDs
│           ├── centauri_service.py  ← Persistent WS listener per printer
│           └── centauri_upload.py   ← HTTP multipart upload (MD5 required)
└── frontend/
    ├── index.html
    ├── public/                      ← icons, manifest, favicon
    └── src/
        ├── main.tsx                 ← BrowserRouter + ThemeProvider +
        │                               LicenseGate + App
        ├── App.tsx                  ← routes, Sidebar, Dashboard,
        │                               PrinterCard, PrinterTray
        ├── theme.tsx                ← dark/light CSS vars, View Transitions
        ├── LicenseGate.tsx          ← activation screen (shown before login
        │                               if this install is not yet licensed)
        ├── Login.tsx
        ├── Batches.tsx
        ├── Files.tsx
        ├── PrinterManagement.tsx
        ├── UserManagement.tsx
        ├── PrintHistory.tsx
        ├── ProtectedRoute.tsx
        ├── PrinterIcon.tsx          ← NeptuneIcon / CentauriIcon SVGs
        └── utils/
            ├── auth.ts              ← getUserRole(), getToken(), logout()
            └── date.ts              ← toIST(), toISTDate(), timeAgo()
```

---

## Prerequisites

- Windows machine (or any Docker host) with **Docker Desktop** installed and running
- **Node.js + npm** for building the frontend before deploy
- Network access to every IP range your printers sit on from the host machine
- Elegoo printers already connected to the network with known static IPs
- Administrator access to open a firewall port (once only)
- **Python 3.x** on the machine you use to generate license keys (not needed on deploy machines)

---

## Setup Guide

### 1. Clone the repository

```powershell
git clone https://github.com/Vamp27-dev/3D-Farm-Control.git
cd 3D-Farm-Control
```

### 2. Configure environment

Secrets live in a root-level `.env` file that is git-ignored and never committed. Copy the template and fill in your values:

```powershell
copy .env.example .env
notepad .env
```

Fill in the four values:

```env
POSTGRES_USER=farmadmin
POSTGRES_PASSWORD=<a strong password>
POSTGRES_DB=elegoo_farm
SECRET_KEY=<a long random hex string>
DEV_MODE=false
```

Generate a strong `SECRET_KEY`:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

`docker-compose.yml` reads `.env` automatically — nothing else to configure. Only `.env.example` (the placeholder template) is ever committed; `.env` itself is blocked by `.gitignore`.

### 3. Build the frontend

```powershell
cd frontend
npm install
npm run build
cd ..
```

This produces `frontend/dist/`, which the backend container mounts and serves directly — there is no separate frontend port.

### 4. Start the stack

```powershell
docker-compose up --build -d
```

This builds the backend image, starts PostgreSQL with a named volume (`postgres_data`) so data survives restarts, and runs any pending DB migrations automatically on startup.

> ⚠️ **Never run `docker-compose down -v`** — the `-v` flag deletes the named volume and wipes your entire database (printers, batches, history, users, activation state). Use `docker-compose down` or `docker-compose restart` for all normal operations.

### 5. Open the firewall (once, as Administrator)

```powershell
New-NetFirewallRule -DisplayName "Farm Controller" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

### 6. Access the app

```
http://<host-machine-ip>:8000
```

Since the container binds `0.0.0.0:8000`, it is reachable on every network interface the host has — no extra configuration needed for multiple IP ranges.

On first access, the **activation screen** appears before login. See [Activation](#activation) below.

### 7. Add your printers

After activating and logging in, go to **Manage → Printers → Add Printer**:

- **Name** and **Location** — freeform labels
- **Type** — `klipper` or `centauri`
- **IP address** of the printer on your network
- **Camera URL** — auto-filled for Centauri (`http://{ip}:3031/video`); enter manually for Neptune if you have an MJPEG source

On first connect, Centauri printers auto-discover their `MainboardID` via SDCP and save it to the printer record.

---

## Activation

Every deployment of Farm Control requires a **signed license key** before it works. This is enforced at the API level — every route returns HTTP 423 until the install is activated, so the app is genuinely unusable, not just visually blocked.

### What you see on first open

Instead of the login page, the browser shows the **Activation screen** with:
- This installation's unique **Machine ID** (a UUID generated on first boot, stored in Postgres)
- A masked key entry field (no show/hide toggle — the key is never visible on screen)
- An **Activate** button

### How activation works

1. The person deploying the app reads the Machine ID off the screen.
2. The license holder (Ashwit) generates a key for that specific Machine ID using the private key generation tools kept offline.
3. The key is pasted into the masked field and submitted.
4. The backend verifies the Ed25519 signature and checks that the key's embedded Machine ID matches this installation's ID.
5. On success, the app unlocks immediately with no restart needed.

Keys are machine-bound — a key issued for one Machine ID will not activate on any other installation. Copying a valid key to a different machine fails the machine check even though the signature is correct.

**If you are self-hosting this software**, contact the repository owner to obtain a license key for your deployment.

---

## Configuration Reference

| Setting | File | Notes |
|---|---|---|
| `POSTGRES_USER` | `.env` | Postgres login username |
| `POSTGRES_PASSWORD` | `.env` | Postgres password — make it strong |
| `POSTGRES_DB` | `.env` | Database name |
| `SECRET_KEY` | `.env` | JWT signing key — unique per deployment, 32+ random bytes |
| `DEV_MODE` | `.env` | `true` enables debug logging; always `false` in production |
| `PUBLIC_KEY_HEX` | `backend/app/core/license.py` | Ed25519 public key for license verification — set once during setup |
| `postgres_data` volume | `docker-compose.yml` | Persistent DB storage — do not delete |
| `file_storage` volume | `docker-compose.yml` | Uploaded G-code/CTB files |
| Port `8000` | `docker-compose.yml` | Single port for API + SPA, bound to `0.0.0.0` |
| JWT expiry | `backend/app/core/security.py` | Default 8h token lifetime |

---

## Using the App

**Dashboard** — live grid of all printers with status pills, a KPI strip, analytics, and filter pills (All / Printing / Paused / Idle / Offline). Click any printer card to open the tray for temps, ETA, camera feed, job queue, and controls.

**Batches** — create a batch by picking a file and a set of printers of the same type; track per-printer progress live; completed batches collapse into an archive dropdown automatically.

**Files** — upload and organize print files into folders (admin only for upload and delete).

**History** — paginated job history with IST timestamps and one-click CSV export.

**Manage → Printers** — add, edit (name/IP/location/camera URL), or remove printers. Deletion is blocked while a printer is actively printing.

**Manage → Users** — admin-only user management. The last admin account cannot be deleted.

### Roles

| Role | Access |
|---|---|
| `admin` | Full access — add/edit/delete printers, upload/delete files, manage users, start/control/cancel batches |
| `viewer` | Read-only — dashboard, history, and file list visible; no uploads, deletes, or print control |

---

## Deployment & Updates

After any code change:

```powershell
# If you changed anything in frontend/src:
cd frontend && npm run build && cd ..

# Redeploy — safe, keeps all data
docker-compose up --build -d
```

This rebuilds images and restarts containers while leaving the `postgres_data` and `file_storage` volumes untouched. Activation state survives a redeploy — you do not need to re-enter license keys after an update.

---

## Backups

All persistent state lives in the `postgres_data` Docker volume. Back it up periodically:

```powershell
docker exec <postgres-container-name> pg_dump -U farmadmin elegoo_farm > backup_$(Get-Date -Format yyyyMMdd).sql
```

Store backups off the host machine (network share, external drive, or cloud). A Docker Desktop reinstall or disk failure would otherwise take the volume with it, and with it your printer list, all job history, batch records, and activation state.

> If activation state is lost (e.g. from `docker-compose down -v`), the app generates a new Machine ID on next boot and will need to be re-activated with a new key for that new ID.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App shows activation screen instead of login | Install not yet activated | See [Activation](#activation) |
| Activation error: "This key was issued for a different installation" | Key was generated for a different Machine ID | Generate a new key for the correct Machine ID |
| Activation error: "License expired" | Key expiry date has passed | Generate and activate a renewal key |
| App shows activation screen after a redeploy | `docker-compose down -v` was run, wiping the volume | Activation state is stored in Postgres — never use `-v`; generate a new key for the new Machine ID and re-activate |
| Refreshing a frontend route returns raw JSON | API/frontend path naming clash | Use `/manage/printers` not `/printers/manage` — keep all frontend routes out of API-prefixed paths |
| Centauri Start Print returns Ack 2 (File Not Found) | Filename sent without the full path prefix | Must send `/local/{filename}`, not the bare filename |
| Centauri print shows "printing" forever after cancel | Stale `PrintInfo` from a completed job | Cancel flow does an immediate DB idle write + 30s push-block; check `cur_layer` guard logic in `centauri_service.py` |
| Centauri ETA is wildly wrong | `TotalTicks` mistaken for milliseconds | Confirmed on real hardware: `TotalTicks` is in **seconds** |
| Klipper ETA is zero or missing | Relying on Moonraker `estimated_time` | That field does not exist on real Moonraker responses — ETA is read from slicer file metadata instead |
| All history shows "failed" after a backend restart | `prev_states` cache is empty on cold start | Falls back to `printer.progress / 100`; a printer going offline at ≥85% progress is recorded as success not failure |
| All data is gone | `docker-compose down -v` was run | Named volume was deleted. Restore from your latest backup |
| App unreachable from some machines on the network | Firewall rule missing or Docker not bound correctly | Re-run the `New-NetFirewallRule` command; confirm `ports: "0.0.0.0:8000:8000"` in `docker-compose.yml` |

---

## Roadmap

- **Read-only Bambu Lab monitoring** — surfacing print status, progress, current file, and camera feed for a separate Bambu printer farm (dispatched by Bambu's own software) alongside Elegoo printers in the same dashboard, with no print-control capability added for that type.
- Printer maintenance tracking — nozzle hours, belt/rail service intervals, per-printer failure rates.
- Spool and filament inventory tied to batches.
- Alerting via Slack or Telegram on print failures or printers going offline mid-job.
- Prometheus/Grafana metrics export for long-term trend dashboards.

---

## License

This project is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

You are free to view, use, modify, and share this code for **noncommercial purposes** (personal use, learning, research, internal use by educational institutions, non-profits, or government bodies). **Commercial use of any kind requires express written permission from the copyright holder.**

If you would like to use this commercially, open an issue or contact the repository owner directly to discuss a commercial license.

---

*Made by Ashwit ❤️ — built and hardened against real hardware in a live production printer farm.*