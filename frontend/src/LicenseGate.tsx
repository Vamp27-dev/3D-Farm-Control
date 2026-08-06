import { useEffect, useState } from "react"

const API_BASE = import.meta.env.VITE_API_BASE || ""

type Status = {
  machine_id: string
  licensed: boolean
  client_name: string | null
  expires_at: string | null
}

// Tiny non-cryptographic checksum of the pasted key, shown ONLY as a short
// code — never the key itself. Lets you silently confirm the paste landed
// correctly (by reading it back over a call, or comparing to what you
// expect) without ever displaying the actual key on screen during a
// remote session.
function fingerprint(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 8)
}

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [key, setKey] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const fetchStatus = () => {
    fetch(`${API_BASE}/license/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setMessage({ text: "Could not reach the backend to check license status.", ok: false }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStatus() }, [])

  const activate = async () => {
    if (!key.trim()) return
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/license/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ text: `Activated for ${data.client_name} — valid until ${data.expires_at}.`, ok: true })
        setKey("")
        fetchStatus()
      } else {
        setMessage({ text: data.reason || "Activation failed.", ok: false })
      }
    } catch {
      setMessage({ text: "Could not reach the backend.", ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null
  if (status?.licensed) return <>{children}</>

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", color: "var(--text)", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 440, background: "var(--card)",
        border: "1px solid var(--border)", borderRadius: 12, padding: 32,
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>Activation required</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>
          This installation needs a license key before it can run.
        </p>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Machine ID</div>
          <div style={{
            fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: 13, background: "var(--card2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px", userSelect: "all", wordBreak: "break-all",
          }}>
            {status?.machine_id}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>License key</div>
          {/*
            Deliberately a plain password-type field — no show/hide toggle,
            no icon, autoComplete off. Nothing renders the raw value on
            screen at any point, which matters when this is entered over
            a screen-share/remote-control session.
          */}
          <input
            type="password"
            name="license-activation-field-do-not-save"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") activate() }}
            placeholder="Paste license key"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 14,
              background: "var(--card2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "10px 12px", color: "var(--text)",
            }}
          />
        </div>

        {key && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 16 }}>
            Checksum: <span style={{ fontFamily: "ui-monospace, monospace" }}>{fingerprint(key)}</span>
            {" "}— use this to confirm the paste landed correctly, without displaying the key itself.
          </div>
        )}

        <button
          onClick={activate}
          disabled={submitting || !key.trim()}
          style={{
            width: "100%", padding: "10px 0", fontSize: 14, fontWeight: 600,
            background: "#2563eb", color: "#fff", border: "none", borderRadius: 8,
            cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Activating…" : "Activate"}
        </button>

        {message && (
          <div style={{
            marginTop: 16, fontSize: 13, padding: "10px 12px", borderRadius: 8,
            background: message.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: message.ok ? "#10b981" : "#ef4444",
          }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}