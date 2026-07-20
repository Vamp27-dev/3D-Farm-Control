"""
centauri_protocol.py

Low-level SDCP protocol client for Elegoo Centauri Carbon printers.

Verified against:
  - Official cbd-tech SDCP V3.0.0 spec
  - Real captured packets (sdcp-centauri-carbon, elegoo-homeassistant logs)
  - WebSocket endpoint: ws://{ip}:3030/websocket
  - No authentication required

This module is protocol-only — it knows nothing about your database,
your farm, or your other printer types. Higher-level code
(centauri_service.py) wraps this and normalizes results into your
app's standard printer status shape.
"""

import json
import time
import uuid as uuid_lib
import asyncio

import websockets


# ══════════════════════════════════════════════════════════════════
# COMMAND CONSTANTS
# ══════════════════════════════════════════════════════════════════

class Cmd:
    GET_PRINTER_STATUS          = 0
    GET_PRINTER_ATTR            = 1

    SEND_PRINTER_DISCONNECT     = 64

    SEND_PRINTER_START_PRINT    = 128
    SEND_PRINTER_SUSPEND_PRINT  = 129   # pause
    SEND_PRINTER_STOP_PRINT     = 130   # cancel
    SEND_PRINTER_RESTORE_PRINT  = 131   # resume

    GET_BLACKOUT_STATUS         = 134
    SEND_BLACKOUT_ACTION        = 135

    GET_PRINTER_EDIT_NAME       = 192

    EDIT_PRINTER_FILE_NAME      = 257
    GET_PRINTER_FILE_LIST       = 258
    DELETE_PRINTER_FILE_LIST    = 259
    GET_PRINTER_FILE_DETAIL     = 260

    GET_PRINTER_HISTORY_ID      = 320
    GET_PRINTER_TASK_DETAIL     = 321
    DELETE_PRINTER_HISTORY      = 322
    GET_PRINTER_HISTORY_VIDEO   = 323

    GET_MATERIAL_DATA           = 324

    EDIT_PRINTER_VIDEO_STREAMING    = 386
    EDIT_PRINTER_TIME_LAPSE_STATUS  = 387

    EDIT_PRINTER_AXIS_NUMBER    = 401
    EDIT_PRINTER_AXIS_ZERO      = 402
    EDIT_PRINTER_STATUS_DATA    = 403   # light control

    GET_FILE_COLOR_DATA         = 503

    SEND_PRINTER_SEND_FILE_END  = 255


# ══════════════════════════════════════════════════════════════════
# STATUS ENUMS — verified against official cbd-tech SDCP V3.0.0 spec
# ══════════════════════════════════════════════════════════════════

# PrintInfo.Status — the sub-status of an active/recent print job
class PrintSubStatus:
    IDLE          = 0
    HOMING        = 1
    DROPPING      = 2
    EXPOSURING    = 3   # actively printing/extruding
    LIFTING       = 4
    PAUSING       = 5   # pause in progress
    PAUSED        = 6   # fully paused
    STOPPING      = 7   # cancel in progress
    STOPPED       = 8   # cancelled
    COMPLETE      = 9   # finished successfully
    FILE_CHECKING = 10


# PrintInfo.ErrorNumber — file-level errors that prevent a print from starting
class FileErrorNumber:
    NORMAL                  = 0
    MD5_CHECK_FAILED        = 1
    FILE_READ_FAILED        = 2
    RESOLUTION_MISMATCH     = 3
    FORMAT_MISMATCH         = 4
    MACHINE_MODEL_MISMATCH  = 5


# Broader runtime failure causes (seen in some firmware as a separate
# "cause" code surfaced alongside ErrorNumber during an active print)
PRINT_CAUSE_MESSAGES = {
    0:  None,                                  # OK / normal
    1:  "Over-temperature (nozzle/bed)",
    3:  "Filament runout detected",
    6:  "Filament jam or clog detected",
    7:  "Auto bed leveling failed",
    13: "X-axis motor/endstop failure",
    14: "Z-axis motor/endstop failure",
    17: "Homing failure",
    18: "Print detached from bed",
    19: "Printing exception",
    20: "Motor movement abnormality",
    23: "Y-axis motor/endstop failure",
    24: "G-code file error",
    25: "Camera connection error",
    26: "Network connection error",
    27: "Server connection failed",
}


def build_packet(cmd: int, data: dict, mainboard_id: str = "") -> str:
    """
    Build an SDCP-compliant JSON packet.

    FIX (root cause of printer freeze on Start Print): every single request
    example in the official SDCP V3.0.0 spec includes a top-level "Topic"
    field — "sdcp/request/${MainboardID}" — alongside "Id" and "Data". This
    was missing entirely from the packet we were sending. Read-only/idempotent
    commands (status polls) appear tolerant of its absence, but a
    state-changing command like Start Printing (Cmd 128) sent without the
    expected topic envelope can land in an unhandled code path on lean
    embedded firmware — consistent with the observed symptom: screen freezes
    on, no Ack, connection eventually dies with no close frame.

    Also corrected "From" to 0, matching every documented request example
    (we were sending 1, which has no defined meaning in the spec).
    """
    packet = {
        "Id": "",
        "Data": {
            "Cmd": cmd,
            "Data": data,
            "RequestID": uuid_lib.uuid4().hex,
            "MainboardID": mainboard_id,
            "TimeStamp": int(time.time() * 1000),
            "From": 0,
        },
        # Topic uses the broadcast placeholder "ffffffff" when MainboardID
        # isn't known yet (e.g. the very first GET_PRINTER_ATTR discovery
        # call) — matches the spec's own placeholder convention and what
        # working SDCP clients (e.g. Home Assistant's elegoo integration) do.
        "Topic": f"sdcp/request/{mainboard_id or 'ffffffff'}",
    }
    return json.dumps(packet)


async def open_connection(ip: str, timeout: float = 5.0):
    """Open a WebSocket connection to a Centauri printer."""
    uri = f"ws://{ip}:3030/websocket"
    return await websockets.connect(uri, open_timeout=timeout, close_timeout=timeout)


async def send_command(ip: str, cmd: int, data: dict, mainboard_id: str = "",
                        wait_for_response: bool = True, timeout: float = 5.0) -> dict | None:
    """
    Open a short-lived connection, send one command, optionally wait for
    a reply, close. Used for one-shot actions: pause, resume, cancel, start.
    """
    packet = build_packet(cmd, data, mainboard_id)

    ws = await open_connection(ip, timeout=timeout)
    try:
        await ws.send(packet)

        if not wait_for_response:
            return None

        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            return json.loads(raw)
        except Exception:
            return None
    finally:
        await ws.close()


async def get_status_once(ip: str, mainboard_id: str = "", timeout: float = 5.0) -> dict | None:
    """One-shot status fetch — opens, requests, waits for status push, closes."""
    return await send_command(ip, Cmd.GET_PRINTER_STATUS, {}, mainboard_id, timeout=timeout)


def extract_temp(value):
    """
    Temperature fields are sometimes a plain float, sometimes a
    [current, target] pair depending on firmware version. Normalize
    to a plain float (current reading only).
    """
    if isinstance(value, (list, tuple)):
        return float(value[0]) if value else None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def extract_current_status(value):
    """
    CurrentStatus is sometimes an int, sometimes a list like [1].
    Normalize to a single int (first element if list).
    """
    if isinstance(value, list):
        return value[0] if value else 0
    return value if value is not None else 0