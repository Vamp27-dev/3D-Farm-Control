import { useState } from "react"

// ✅ Self-contained API call — avoids circular import with App.tsx
const API_BASE = import.meta.env.VITE_API_BASE || ""

async function postPrinter(body: object) {
  const token = localStorage.getItem("token")
  const res = await fetch(`${API_BASE}/printers/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ✅ Shared Add Printer modal — used on Dashboard AND Printers Management page
// Uses CSS variables so it adapts to both dark/light theme automatically

export default function AddPrinterModal({ onClose, onAdded }: {
  onClose: () => void; onAdded: () => void
}) {
  const [name, setName]         = useState("")
  const [ip, setIp]             = useState("")
  const [type, setType]         = useState("klipper")
  const [location, setLocation] = useState("")
  const [loading, setLoading]   = useState(false)

  const submit = async () => {
    if (!name || !ip) { alert("Fill in printer name and IP address"); return }
    setLoading(true)
    try {
      const res = await postPrinter({
        name,
        ip_address: ip,
        type,
        location: location.trim() || null,
      })
      if (res?.detail) { alert(res.detail); setLoading(false); return }
      onAdded()
      onClose()
    } catch {
      alert("Failed to add printer")
    }
    setLoading(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit()
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 60, backdropFilter: "blur(2px)",
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 28, width: 380,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        fontFamily: "'Inter',system-ui,sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Add Printer</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {[
          { label: "Printer Name", val: name, set: setName, ph: "Neptune-7" },
          { label: "IP Address",   val: ip,   set: setIp,   ph: "192.168.XX.XX" },
        ].map(({ label, val, set, ph }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1.5 }}>
              {label}
            </label>
            <input
              value={val}
              onChange={e => set(e.target.value)}
              onKeyDown={handleKey}
              placeholder={ph}
              style={{
                width: "100%", padding: "9px 12px",
                background: "var(--card2)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text)", fontSize: 14,
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Location <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>(optional)</span>
          </label>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Rack A, Shelf 2"
            style={{
              width: "100%", padding: "9px 12px",
              background: "var(--card2)", border: "1px solid var(--border)",
              borderRadius: 6, color: "var(--text)", fontSize: 14,
              boxSizing: "border-box", outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Printer Type
          </label>
          <select value={type} onChange={e => setType(e.target.value)} style={{
            width: "100%", padding: "9px 12px",
            background: "var(--card2)", border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--text)", fontSize: 14, cursor: "pointer",
          }}>
            <option value="klipper">Neptune (Klipper / Moonraker)</option>
            <option value="centauri">Centauri Carbon</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "9px 0", background: "none",
            border: "1px solid var(--border)", borderRadius: 6,
            color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{
            flex: 2, padding: "9px 0",
            background: loading ? "var(--card2)" : "#2563eb",
            border: "none", borderRadius: 6,
            color: loading ? "var(--text-muted)" : "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600, fontSize: 13,
          }}>
            {loading ? "Adding…" : "Add Printer"}
          </button>
        </div>
      </div>
    </div>
  )
}