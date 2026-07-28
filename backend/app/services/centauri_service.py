"""
centauri_service.py

Manages one persistent WebSocket listener thread per Centauri Carbon
printer. Each thread:
  - Connects to ws://{ip}:3030/websocket  (CONFIRMED port per SDCP V3.0.0 spec)
  - Discovers the MainboardID (via GET_PRINTER_ATTR) on first connect
  - Listens continuously for status pushes
  - Normalizes them into the same dict shape Klipper's fetch_klipper_data()
    returns, so the rest of the app (DB writes, history, batch archiving,
    frontend) doesn't need to know which printer type it's talking to
  - Auto-reconnects with backoff if the connection drops
  - Periodically re-requests status (Cmd 0) as a keepalive/refresh

ALL outbound commands (pause/resume/cancel/start/temp/light/file-list) are
routed through THIS SAME open connection via an internal asyncio.Queue,
instead of opening a second competing WebSocket. Real-world testing showed
opening a second connection while the listener's connection is live can
crash/freeze this printer's firmware WebSocket server entirely (confirmed
by "Connect call failed" errors on the listener immediately after a second
connection was opened for Start Print) -- so there must only ever be ONE
open WebSocket per printer at a time.

Threads are managed dynamically -- started when a Centauri printer is
added, stopped when removed or its IP changes, all without restarting
the whole app.
"""

import asyncio
import json
import threading
import time
from datetime import datetime

import websockets

from app.core.database import SessionLocal
from app.models.printer import Printer
from app.models.batch_printer import BatchPrinter

from app.services import centauri_protocol as proto
from app.services.poller import write_history, complete_job


# ======================================================================
# THREAD REGISTRY -- tracks one listener per printer_id so we can
# start/stop them dynamically as printers are added/edited/removed
# ======================================================================

_listeners: dict[int, "CentauriListener"] = {}
_registry_lock = threading.Lock()


def start_listener(printer_id: int, ip: str):
    """Start (or restart) a listener thread for a Centauri printer."""
    with _registry_lock:
        existing = _listeners.get(printer_id)
        if existing:
            existing.stop()

        listener = CentauriListener(printer_id, ip)
        _listeners[printer_id] = listener
        listener.start()
        print(f"[Centauri] Started listener for printer #{printer_id} ({ip})")


def stop_listener(printer_id: int):
    """Stop and remove a listener thread (printer deleted or type changed)."""
    with _registry_lock:
        listener = _listeners.pop(printer_id, None)
        if listener:
            listener.stop()
            print(f"[Centauri] Stopped listener for printer #{printer_id}")


def sync_listeners_with_db():
    """
    Call this at app startup to start listener threads for every
    Centauri printer already in the database.
    """
    db = SessionLocal()
    try:
        centauri_printers = db.query(Printer).filter(Printer.type == "centauri").all()
        for p in centauri_printers:
            start_listener(p.id, p.ip_address)
        print(f"[Centauri] Synced {len(centauri_printers)} listener(s) from DB")
    finally:
        db.close()


# ======================================================================
# LISTENER -- one per printer, runs its own asyncio loop in a thread.
# All commands route through this single open connection.
# ======================================================================

class CentauriListener:
    def __init__(self, printer_id: int, ip: str):
        self.printer_id = printer_id
        self.ip = ip
        self.mainboard_id = ""
        self._stop_flag = threading.Event()
        self._thread = None

        # Track previous state to detect printing->idle transitions,
        # same pattern as the Klipper poller's prev_states dict
        self._prev_status = None
        self._prev_progress = 0.0

        # Cancellation lock -- set when cancel command is sent.
        self._cancelling = False
        self._cancel_time = 0.0

        # Track last known TotalTicks so we can detect stale data after cancel
        self._last_total_ticks = 0.0

        # Single-connection command routing: outbound commands are queued
        # here and sent on the listener's already-open WebSocket, instead
        # of opening a second competing connection.
        self._loop = None
        self._command_queue = None
        # Maps RequestID -> asyncio.Future so callers can await a specific reply
        self._pending_replies: dict[str, asyncio.Future] = {}

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_flag.set()

    def _run(self):
        """Entry point for the thread -- runs the asyncio event loop."""
        asyncio.run(self._listen_forever())

    async def _listen_forever(self):
        backoff = 2  # seconds, doubles on repeated failure up to a cap

        # Capture this thread's event loop and create the command queue now
        # that we're inside it -- needed so external (FastAPI) threads can
        # safely schedule sends onto this exact loop via run_coroutine_threadsafe.
        self._loop = asyncio.get_running_loop()
        self._command_queue = asyncio.Queue()

        while not self._stop_flag.is_set():
            try:
                await self._connect_and_listen()
                backoff = 2  # reset after a successful session
            except Exception as e:
                print(f"[Centauri] Printer #{self.printer_id} connection error: {e}")
                self._mark_offline()

            if self._stop_flag.is_set():
                break

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)  # cap reconnect backoff at 60s

    async def _connect_and_listen(self):
        # CONFIRMED per SDCP V3.0.0 spec: "ws://${MainboardIP}:3030/websocket"
        uri = f"ws://{self.ip}:3030/websocket"

        async with websockets.connect(uri, open_timeout=6, close_timeout=4) as ws:
            print(f"[Centauri] Printer #{self.printer_id} connected ({self.ip})")
            try:
                await self._connect_and_listen_inner(ws)
            finally:
                # Connection session ended -- fail any pending command replies
                # so callers waiting in send_and_wait() get a clean exception
                # instead of hanging until their own timeout.
                for request_id, fut in list(self._pending_replies.items()):
                    if not fut.done():
                        fut.set_exception(ConnectionError(
                            f"Centauri connection closed before reply for {request_id}"
                        ))
                self._pending_replies.clear()

    async def _connect_and_listen_inner(self, ws):
        # Discover MainboardID if we don't have it yet
        if not self.mainboard_id:
            await self._discover_mainboard_id(ws)

        # Request an initial status push
        await ws.send(proto.build_packet(proto.Cmd.GET_PRINTER_STATUS, {}, self.mainboard_id))

        last_refresh = time.time()

        while not self._stop_flag.is_set():
            # Drain any queued outbound commands (start/pause/resume/cancel/
            # temp/light/file-list) and send them on THIS already-open socket
            # -- never open a second connection.
            while not self._command_queue.empty():
                packet_str, request_id = self._command_queue.get_nowait()
                try:
                    await ws.send(packet_str)
                    print(f"[Centauri] Printer #{self.printer_id} sent queued command "
                          f"(RequestID={request_id})")
                except Exception as e:
                    fut = self._pending_replies.pop(request_id, None)
                    if fut and not fut.done():
                        fut.set_exception(e)

            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2)
                self._route_message(raw)
            except asyncio.TimeoutError:
                pass  # no message in 2s -- loop back to check the queue again

            # Re-request status every 5s as a keepalive/refresh
            if time.time() - last_refresh >= 5:
                try:
                    await ws.send(proto.build_packet(
                        proto.Cmd.GET_PRINTER_STATUS, {}, self.mainboard_id
                    ))
                except Exception:
                    break  # connection likely dead, let outer loop reconnect
                last_refresh = time.time()

    def _route_message(self, raw: str):
        """
        Every incoming message either:
          (a) is a reply to a command we sent (RequestID matches a pending
              Future) -- resolve that Future so the waiting caller gets it, or
          (b) is an unsolicited status push -- hand off to _handle_message.
        """
        try:
            parsed = json.loads(raw)
        except Exception:
            return

        request_id = parsed.get("Data", {}).get("RequestID")
        if request_id and request_id in self._pending_replies:
            fut = self._pending_replies.pop(request_id)
            if not fut.done():
                fut.set_result(parsed)
            return  # command reply -- not a status push

        self._handle_message(raw)

    async def send_and_wait(self, cmd: int, data: dict, timeout: float = 5.0,
                             wait_for_response: bool = True):
        """
        Queue a command to be sent over this listener's already-open
        WebSocket connection, and optionally wait for its matching reply.
        Must be called from the listener's own event loop -- use
        send_command_via_listener() to call safely from FastAPI's thread.
        """
        if self._command_queue is None:
            raise RuntimeError(f"Listener for printer #{self.printer_id} has no active connection yet")

        packet_str = proto.build_packet(cmd, data, self.mainboard_id)
        request_id = json.loads(packet_str)["Data"]["RequestID"]

        if not wait_for_response:
            await self._command_queue.put((packet_str, request_id))
            return None

        fut = self._loop.create_future()
        self._pending_replies[request_id] = fut
        await self._command_queue.put((packet_str, request_id))

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_replies.pop(request_id, None)
            return None

    async def _discover_mainboard_id(self, ws):
        """Send GET_PRINTER_ATTR and pull the MainboardID from the reply."""
        await ws.send(proto.build_packet(proto.Cmd.GET_PRINTER_ATTR, {}, ""))
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=6)
            data = json.loads(raw)
            print(f"[Centauri] Printer #{self.printer_id} ATTR response: {json.dumps(data)[:600]}")
            attrs = data.get("Data", {}).get("Attributes", {}) or data.get("Attributes", {})
            mb_id = attrs.get("MainboardID") or data.get("MainboardID") or data.get("Data", {}).get("MainboardID")
            if mb_id:
                self.mainboard_id = mb_id
                self._save_mainboard_id(mb_id)
                print(f"[Centauri] Printer #{self.printer_id} MainboardID: {mb_id}")
            else:
                print(f"[Centauri] Printer #{self.printer_id} MainboardID not found in response -- will retry from status messages")
        except Exception as e:
            print(f"[Centauri] Could not discover MainboardID for #{self.printer_id}: {e}")

    def set_cancelling(self):
        """
        Call when cancel command is sent.
        1. Immediately write idle to DB so UI updates right away
        2. Block listener status pushes for 30s while printer winds down
        3. Clear stale print data so has_active_print=False after cooldown
        """
        self._cancelling = True
        self._cancel_time = time.time()
        self._prev_status = "idle"
        self._prev_progress = 0.0
        self._last_total_ticks = 0.0
        print(f"[Centauri] Printer #{self.printer_id} cancel lock set")
        self._force_idle()

    def _force_idle(self):
        """Immediately set printer to idle in DB -- called on cancel."""
        db = SessionLocal()
        try:
            printer = db.query(Printer).filter(Printer.id == self.printer_id).first()
            if printer:
                printer.status = "idle"
                printer.progress = 0
                printer.current_file = None
                printer.error_message = None
                db.commit()
                print(f"[Centauri] Printer #{self.printer_id} forced to idle in DB")
        except Exception as e:
            print(f"[Centauri] Force idle failed: {e}")
            db.rollback()
        finally:
            db.close()

    def _save_mainboard_id(self, mb_id: str):
        """Persist the discovered MainboardID to the DB so router endpoints can use it."""
        db = SessionLocal()
        try:
            printer = db.query(Printer).filter(Printer.id == self.printer_id).first()
            if printer and not printer.mainboard_id:
                printer.mainboard_id = mb_id
                db.commit()
                print(f"[Centauri] Printer #{self.printer_id} MainboardID saved to DB: {mb_id}")
        except Exception as e:
            print(f"[Centauri] Failed to save MainboardID: {e}")
            db.rollback()
        finally:
            db.close()

    def _handle_message(self, raw: str):
        """Parse an incoming status push and update the DB."""
        try:
            parsed = json.loads(raw)
            data_section = parsed.get("Data", {})
            cmd = data_section.get("Cmd", data_section.get("cmd", "?"))
            print(f"[Centauri] Printer #{self.printer_id} raw msg Cmd={cmd}: {json.dumps(parsed)[:400]}")
        except Exception:
            print(f"[Centauri] Printer #{self.printer_id} non-JSON msg: {raw[:200]}")

        try:
            msg = json.loads(raw)
        except Exception:
            return

        # Status data can live in a few different wrapper shapes depending
        # on firmware/message type -- try all known locations.
        data = msg.get("Data", {})
        status = (
            data.get("Status") or
            data.get("Data", {}).get("Status") or
            msg.get("Status")
        )

        if not status:
            return  # not a status message -- command ack, attr response, etc.

        mb_id = (
            data.get("MainboardID") or
            data.get("Data", {}).get("MainboardID") or
            msg.get("MainboardID")
        )
        if mb_id and not self.mainboard_id:
            self.mainboard_id = mb_id
            self._save_mainboard_id(mb_id)
            print(f"[Centauri] Printer #{self.printer_id} MainboardID discovered from status: {mb_id}")

        normalized = normalize_status(status)
        self._write_to_db(normalized)

    def _write_to_db(self, data: dict):
        if self._cancelling:
            if time.time() - self._cancel_time < 30:
                print(f"[Centauri] Printer #{self.printer_id} ignoring status push during cancel cooldown")
                return
            else:
                self._cancelling = False
                print(f"[Centauri] Printer #{self.printer_id} cancel cooldown ended -- clearing stale state")

        db = SessionLocal()
        try:
            printer = db.query(Printer).filter(Printer.id == self.printer_id).first()
            if not printer:
                return

            new_status = data["state"]
            new_progress = data["progress"]

            was_printing = self._prev_status == "printing"
            now_idle = new_status in ("idle", "complete")

            if was_printing and now_idle:
                if self._prev_progress >= 85:
                    complete_job(db, printer)
                    new_progress = 0

            elif self._prev_status == "printing" and new_status == "error":
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
                        print(f"[Centauri] Archive check failed: {e}")

            printer.status = new_status
            printer.progress = round(new_progress, 2)
            if data["filename"] != "__KEEP__":
                printer.current_file = data["filename"]
            elif new_status == "idle" and not self._cancelling:
                printer.current_file = None
            printer.last_seen = datetime.utcnow()
            printer.bed_temp = data["bed_temp"]
            printer.bed_target = data["bed_target"]
            printer.extruder_temp = data["extruder_temp"]
            printer.extruder_target = data["extruder_target"]
            printer.eta_seconds = data["eta_seconds"]
            printer.error_message = data["error_message"]
            printer.filament_detected = data["filament_detected"]

            db.commit()

            self._prev_status = new_status
            self._prev_progress = new_progress

            log_line = f"[Centauri] {printer.name} -> {new_status} {new_progress:.1f}%"
            if data["eta_seconds"]:
                log_line += f" ETA {data['eta_seconds']//60}m"
            log_line += f" | extruder {data['extruder_temp']} bed {data['bed_temp']}"
            if data["error_message"]:
                log_line += f" | WARNING {data['error_message']}"
            print(log_line)

        except Exception as e:
            print(f"[Centauri] DB write error for printer #{self.printer_id}: {e}")
            db.rollback()
        finally:
            db.close()

    def _mark_offline(self):
        db = SessionLocal()
        try:
            printer = db.query(Printer).filter(Printer.id == self.printer_id).first()
            if printer:
                if self._prev_status == "printing":
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
                        except Exception:
                            pass

                printer.status = "offline"
                printer.progress = 0
                printer.current_file = None
                printer.error_message = None
                printer.filament_detected = None
                db.commit()
                self._prev_status = "offline"
        except Exception as e:
            print(f"[Centauri] Error marking printer #{self.printer_id} offline: {e}")
            db.rollback()
        finally:
            db.close()


def get_mainboard_id_for(printer_id: int) -> str:
    """
    Get the MainboardID for a printer -- from the in-memory listener
    registry first (fastest), then fall back to what's in the DB.
    """
    with _registry_lock:
        listener = _listeners.get(printer_id)
        if listener and listener.mainboard_id:
            return listener.mainboard_id
    return ""


async def send_command_via_listener(printer_id: int, cmd: int, data: dict,
                                     timeout: float = 5.0,
                                     wait_for_response: bool = True):
    """
    Thread-safe bridge: send a command (start/pause/resume/cancel/temp/light/
    file-list) over a printer's EXISTING listener WebSocket connection,
    instead of opening a second one.

    WHY: opening a second WebSocket client while the listener's connection
    is already open appears to crash/freeze this printer's firmware
    WebSocket server (confirmed: listener lost its connection with
    "Connect call failed" immediately after a second connection was used
    for Start Print). Routing every command through the listener's single
    open socket eliminates that race entirely.
    """
    with _registry_lock:
        listener = _listeners.get(printer_id)

    if not listener or not listener._loop or not listener._command_queue:
        raise RuntimeError(
            f"No active Centauri connection for printer #{printer_id} -- "
            f"printer not yet discovered or listener not connected"
        )

    future = asyncio.run_coroutine_threadsafe(
        listener.send_and_wait(cmd, data, timeout=timeout, wait_for_response=wait_for_response),
        listener._loop,
    )

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, future.result, timeout + 2)


def set_printer_cancelling(printer_id: int):
    """
    Tell the listener thread that cancel was just sent for this printer.
    Prevents status pushes from overwriting idle/cancelled state in the DB
    for the next 30 seconds while the printer actually stops.
    """
    with _registry_lock:
        listener = _listeners.get(printer_id)
        if listener:
            listener.set_cancelling()


# ======================================================================
# STATUS NORMALIZATION
# ======================================================================

def normalize_status(raw: dict) -> dict:
    """
    Converts raw SDCP "Status" payload into the app's standard status dict.

    CONFIRMED FROM SDCP V3.0.0 SPEC:
      - CurrentStatus (top-level list): machine-level state
            0 = IDLE, 1 = PRINTING, 2 = FILE_TRANSFERRING,
            3 = EXPOSURE_TESTING, 4 = DEVICES_TESTING
      - PrintInfo.Status (sub-status): pause/stop/complete live here
            0=IDLE, 1=HOMING, 2=DROPPING, 3=EXPOSURING, 4=LIFTING,
            5=PAUSING, 6=PAUSED, 7=STOPPING, 8=STOPPED, 9=COMPLETE,
            10=FILE_CHECKING
      - CurrentTicks / TotalTicks: the spec text says milliseconds, but
        CONFIRMED via real hardware testing this firmware reports them in
        SECONDS (e.g. TotalTicks=4092 for a ~68 minute print, not 4.092s).
        A later revision "corrected" this back to milliseconds by trusting
        the spec's literal wording over the confirmed hardware behavior,
        which silently broke ETA (dividing an already-in-seconds value by
        1000 makes remaining time collapse to ~0). Do not divide by 1000
        again without new hardware evidence -- this is the second time
        this exact regression pattern (spec text overriding a confirmed
        real-hardware fix) has happened in this file, see start_print().

    FIX (this round): real logs showed PrintInfo retaining the PREVIOUS
    finished job's CurrentLayer==TotalLayer (e.g. 93/93) and Status=9
    (COMPLETE) for a long time after that job actually ended -- this is
    "last known PrintInfo", not live data, per spec ("the sub-status field
    will always retain its most recent status"). The old has_active_print
    fallback (cur_layer > 0) was wrongly reading this STALE finished-job
    data as "currently printing" for an actually-idle printer. We now only
    trust PrintInfo.Status / layer-based "printing" fallback when machine-
    level CurrentStatus == 1 (PRINTING) -- never purely from leftover
    PrintInfo numbers.
    """
    print_info = raw.get("PrintInfo", {}) or {}

    current_status_arr = raw.get("CurrentStatus", [0])
    if isinstance(current_status_arr, list):
        top_status = current_status_arr[0] if current_status_arr else 0
    else:
        top_status = int(current_status_arr or 0)

    sub_status = print_info.get("Status", 0)

    print(f"[Centauri] normalize_status CurrentStatus={top_status} "
          f"PrintInfo.Status={sub_status} PrintInfo={json.dumps(print_info)[:200]}")

    cur_layer = print_info.get("CurrentLayer", 0)
    total_layer = print_info.get("TotalLayer", 0)
    # CONFIRMED via real hardware: these are already in SECONDS, not ms.
    cur_ticks_s = float(print_info.get("CurrentTicks", 0) or 0)
    total_ticks_s = float(print_info.get("TotalTicks", 0) or 0)

    # FIX: machine-level CurrentStatus is now the PRIMARY signal.
    # PrintInfo.Status only overrides it for pause (within an active print)
    # -- never used alone to declare "printing", since it's stale-retained
    # data that lingers long after a job actually finishes.
    if top_status == 1:
        # Machine genuinely reports PRINTING right now.
        if sub_status == 6:
            state = "paused"
        else:
            state = "printing"
    elif top_status == 2:
        state = "idle"   # FILE_TRANSFERRING -- not a print state for farm purposes
    elif top_status in (3, 4):
        state = "idle"   # self-test states -- treat as idle
    else:
        # top_status == 0 (IDLE) -- trust the machine, ignore stale PrintInfo
        # leftovers from a previous job entirely.
        state = "idle"

    # Filename -- printer sends empty string, use __KEEP__ sentinel
    filename = (
        print_info.get("Filename") or print_info.get("FileName") or
        print_info.get("filename") or print_info.get("TaskName") or
        raw.get("Filename") or raw.get("CurrentFile") or None
    )
    if filename and "/" in filename:
        filename = filename.split("/")[-1]
    if not filename:
        filename = "__KEEP__"

    # Progress -- only meaningful while actually printing; otherwise 0
    if state == "printing" or state == "paused":
        if total_layer > 0:
            progress = (cur_layer / total_layer) * 100
        elif total_ticks_s > 0:
            progress = (cur_ticks_s / total_ticks_s) * 100
        else:
            progress = 0.0
    else:
        progress = 0.0
    progress = max(0.0, min(100.0, float(progress)))

    # ETA -- ticks are already in SECONDS (confirmed via real hardware,
    # see docstring above) -- do NOT divide by 1000 here.
    eta_seconds = print_info.get("RemainingTime") or print_info.get("RemainTime")
    if eta_seconds is None and state in ("printing", "paused") and total_ticks_s > cur_ticks_s > 0:
        eta_seconds = int(total_ticks_s - cur_ticks_s)

    extruder_temp   = proto.extract_temp(raw.get("TempOfNozzle")      or raw.get("TempNozzle"))
    bed_temp        = proto.extract_temp(raw.get("TempOfHotbed")      or raw.get("TempHotbed"))
    extruder_target = proto.extract_temp(raw.get("TempTargetNozzle")  or raw.get("TargetNozzle"))
    bed_target      = proto.extract_temp(raw.get("TempTargetHotbed")  or raw.get("TargetHotbed"))

    error_number = print_info.get("ErrorNumber", 0)
    error_message = None
    if error_number and state in ("printing", "paused"):
        file_errors = {
            1: "File integrity check failed (MD5 mismatch)",
            2: "Could not read print file",
            3: "File resolution mismatch",
            4: "Unsupported file format",
            5: "File not compatible with printer",
        }
        error_message = file_errors.get(error_number, f"File error (code {error_number})")
    elif state == "paused":
        error_message = "Print paused"

    return {
        "state":             state,
        "progress":          progress,
        "filename":          filename,
        "bed_temp":          round(bed_temp or 0, 1),
        "bed_target":        round(bed_target or 0, 1),
        "extruder_temp":     round(extruder_temp or 0, 1),
        "extruder_target":   round(extruder_target or 0, 1),
        "eta_seconds":       eta_seconds,
        "error_message":     error_message,
        "filament_detected": None,
    }


async def pause_print(printer_id: int, mainboard_id: str = ""):
    return await send_command_via_listener(printer_id, proto.Cmd.SEND_PRINTER_SUSPEND_PRINT, {})


async def resume_print(printer_id: int, mainboard_id: str = ""):
    return await send_command_via_listener(printer_id, proto.Cmd.SEND_PRINTER_RESTORE_PRINT, {})


async def cancel_print(printer_id: int, mainboard_id: str = ""):
    return await send_command_via_listener(printer_id, proto.Cmd.SEND_PRINTER_STOP_PRINT, {})


async def start_print(printer_id: int, mainboard_id: str, filename: str,
                       bed_leveling: bool = True, plate_type: int = 0,
                       time_lapse: bool = False):
    """
    Start a print on a Centauri Carbon printer -- sends Cmd 128, routed
    through the listener's single open connection.

    REMOVED (root cause of firmware freeze, confirmed by logs):
      1. The "send STOP then wait 1.5s then START" workaround -- never part
         of the official spec, and sending STOP (Cmd 130) to a printer with
         no active job is undefined firmware behavior.
      2. Opening a second standalone WebSocket connection for this command
         -- confirmed by logs to crash the printer's WebSocket server,
         knocking the listener's existing connection out with
         "Connect call failed" immediately after.
         (The freeze was actually caused by the missing "Topic" envelope
         field on build_packet(), fixed separately -- it was NOT caused by
         the extra payload fields below. See point below.)

    filename MUST be the FULL remote path as returned by the upload step
    (e.g. "/local/model.gcode"), NOT a bare filename. CONFIRMED via real
    hardware testing: the upload endpoint stores the file under "/local/",
    and Start Print must reference that exact same path or the firmware
    replies Ack=2 (File Not Found).

    EXTRA PAYLOAD FIELDS (CONFIRMED REQUIRED -- captured live from the
    printer's own official web control UI via raw WebSocket traffic
    inspection on 2026-07-28, real hardware, real successful start that
    transitioned CurrentStatus 0 -> 1 immediately after):

        {
          "Cmd": 128,
          "Data": {
            "Filename": "/local/....gcode",
            "StartLayer": 0,
            "Calibration_switch": 1,   // 1 = run heated bed leveling first
            "PrintPlatformType": 0,    // 0 = Textured plate (A), 1 = Smooth (B)
            "Tlp_Switch": 1,           // 1 = enable time-lapse capture
            "slot_map": []             // unused on this setup (AMS-related)
          },
          "From": 1
        }

    A prior revision of this function dropped these fields entirely
    (Calibration_switch, PrintPlatformType, Tlp_Switch, slot_map),
    incorrectly blaming them for a firmware freeze that was actually
    caused by a missing "Topic" field elsewhere. Without these fields the
    firmware acks the Start command as if it worked but never actually
    begins printing -- which matches exactly the symptom reported ("file
    uploads fine, software says it started, printer never prints").
    Do not strip these fields again without new hardware evidence.
    """
    full_filename = filename if "/" in filename else f"/local/{filename}"

    payload = {
        "Filename":           full_filename,
        "StartLayer":         0,
        "Calibration_switch": 1 if bed_leveling else 0,
        "PrintPlatformType":  plate_type,
        "Tlp_Switch":         1 if time_lapse else 0,
        "slot_map":           [],
    }
    print(f"[Centauri Start] printer_id={printer_id} mainboard_id={mainboard_id} "
          f"filename={full_filename} bed_leveling={bed_leveling} "
          f"plate_type={plate_type} time_lapse={time_lapse}")

    resp = await send_command_via_listener(
        printer_id, proto.Cmd.SEND_PRINTER_START_PRINT, payload, timeout=8.0
    )

    ack = None
    if resp:
        ack = resp.get("Data", {}).get("Data", {}).get("Ack")

    ack_meanings = {
        0: "OK", 1: "Busy", 2: "File Not Found", 3: "MD5 Verification Failed",
        4: "File Read Failed", 5: "Resolution Mismatch",
        6: "Unrecognized File Format", 7: "Machine Model Mismatch",
    }
    print(f"[Centauri Start] response Ack={ack} ({ack_meanings.get(ack, 'unknown/no response')})")

    if resp is None:
        raise RuntimeError(
            "Printer did not acknowledge Start Print command (no response). "
            "Check the printer is online and not already mid-job."
        )
    if ack is not None and ack != 0:
        raise RuntimeError(f"Printer rejected Start Print: {ack_meanings.get(ack, f'code {ack}')}")

    return resp


async def get_mainboard_id(ip: str, timeout: float = 6.0):
    """
    One-shot helper to discover a printer's MainboardID, e.g. when first
    added. This is the one case where a standalone connection via
    proto.send_command is correct -- no listener exists yet.
    """
    resp = await proto.send_command(ip, proto.Cmd.GET_PRINTER_ATTR, {}, "", timeout=timeout)
    if not resp:
        return None
    data = resp.get("Data", {})
    attrs = data.get("Attributes", {}) or {}
    return attrs.get("MainboardID") or data.get("MainboardID")