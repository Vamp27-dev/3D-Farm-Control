import base64
import json
from datetime import date

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

# ─────────────────────────────────────────────────────────────────────────
# Paste the public key hex printed by license_tools/keygen.py here.
# This value is NOT secret — it can only verify signatures, never create
# them, so it's safe to commit to the repo.
# ─────────────────────────────────────────────────────────────────────────
PUBLIC_KEY_HEX = "a86345e6728bb992efc3e0052c3089f3ecde88145d53d644e8050cd98527fdb2"

_public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY_HEX))


def _b64u_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def verify_license(license_key: str, expected_machine_id: str):
    """
    Verifies a license key against this installation's machine ID.
    Returns (valid: bool, reason: str, payload: dict | None)
    """
    try:
        payload_b64, sig_b64 = license_key.strip().split(".")
        payload_bytes = _b64u_decode(payload_b64)
        signature = _b64u_decode(sig_b64)
    except Exception:
        return False, "Malformed license key", None

    try:
        _public_key.verify(signature, payload_bytes)
    except InvalidSignature:
        return False, "Invalid key — not issued for this software, or corrupted in transit", None

    try:
        payload = json.loads(payload_bytes)
    except Exception:
        return False, "Malformed license payload", None

    if payload.get("machine_id") != expected_machine_id:
        return False, "This key was issued for a different installation", payload

    try:
        expires = date.fromisoformat(payload["expires"])
    except Exception:
        return False, "Malformed expiry date in license", payload

    if date.today() > expires:
        return False, f"License expired on {expires.isoformat()}", payload

    return True, "Valid", payload