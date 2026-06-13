import { useEffect, useState, useCallback } from "react"
import { getUserRole } from "./utils/auth"
import { apiFetch } from "./App"

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

interface Printer {
  id: number
  name: string
  ip_address: string
  type: string
  status: string
  progress: number
  location?: string
  camera_url?: string
  last_seen?: string
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditPrinterModal({
  printer,
  onClose,
  onSaved,
}: {
  printer: Printer
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName]           = useState(printer.name)
  const [ip, setIp]               = useState(printer.ip_address)
  const [location, setLocation]   = useState(printer.location ?? "")
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState("")

  const hasChanges =
    name !== printer.name ||
    ip !== printer.ip_address ||
    location !== (printer.location ?? "")

  const save = async () => {
    if (!name.trim()) { setError("Name cannot be empty"); return }
    if (!ip.trim())   { setError("IP cannot be empty");   return }
    setError("")
    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const raw = await fetch(`${API_BASE}/printers/${printer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          ip_address: ip.trim(),
          location: location.trim() || null,
        }),
      })
      const res = await raw.json()
      if (!raw.ok) {
        setError(res?.detail ?? "Update failed")
        return
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? "Network error")
    }
    setLoading(false)
  }

  const fields = [
    { label: "Printer Name", value: name, set: setName, placeholder: "e.g. Neptune-7" },
    { label: "IP Address",   value: ip,   set: setIp,   placeholder: "e.g. 192.168.68.70" },
    { label: "Location",     value: location, set: setLocation, placeholder: "e.g. Shelf A, Bay 3 (optional)" },
  ]

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid #1e3a5f",
        borderRadius: 12, padding: 28, width: 380,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
            Edit Printer
          </h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>✕</button>
        </div>

        {fields.map(({ label, value, set, placeholder }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <label style={{
              display: "block", fontSize: 10, color: "var(--text-muted)",
              marginBottom: 5, textTransform: "uppercase", letterSpacing: 1.5,
            }}>{label}</label>
            <input
              value={value}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              style={{
                width: "100%", padding: "8px 12px",
                background: "var(--card2)", border: "1px solid #1e293b",
                borderRadius: 6, color: "var(--text)", fontSize: 14,
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>
        ))}

        {error && (
          <div style={{
            background: "#ef444415", border: "1px solid #ef4444",
            borderRadius: 6, padding: "8px 12px", marginBottom: 14,
            fontSize: 12, color: "#ef4444",
          }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "8px 0", background: "none",
            border: "1px solid #1e293b", borderRadius: 6,
            color: "#64748b", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button onClick={save} disabled={loading || !hasChanges} style={{
            flex: 2, padding: "8px 0",
            background: loading || !hasChanges ? "var(--card2)" : "#3b82f6",
            border: "none", borderRadius: 6,
            color: loading || !hasChanges ? "var(--text-dim)" : "#fff",
            cursor: loading || !hasChanges ? "not-allowed" : "pointer",
            fontWeight: 600, fontSize: 13,
          }}>
            {loading ? "Saving…" : hasChanges ? "Save Changes" : "No Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status dot ──────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color: Record<string, string> = {
    printing: "#10b981", paused: "#f59e0b",
    idle: "#3b82f6", offline: "#ef4444",
  }
  const c = color[status] ?? "#64748b"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: c, boxShadow: `0 0 6px ${c}`,
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 12, color: c, fontWeight: 600, textTransform: "capitalize" }}>
        {status}
      </span>
    </div>
  )
}

// ─── Printer Management Page ──────────────────────────────────────────────────

export default function PrinterManagement() {
  const role = getUserRole()
  const [printers, setPrinters]     = useState<Printer[]>([])
  const [editing, setEditing]       = useState<Printer | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [search, setSearch]         = useState("")

  const load = useCallback(async () => {
    const data = await apiFetch("/printers/")
    if (data) setPrinters(data)
  }, [])

  useEffect(() => {
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [load])

  const deletePrinter = async (printer: Printer) => {
    if (!confirm(`Delete "${printer.name}"? This cannot be undone.`)) return
    setDeletingId(printer.id)
    try {
      const token = localStorage.getItem("token")
      const raw = await fetch(`${API_BASE}/printers/${printer.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const res = await raw.json()
      if (!raw.ok) { alert(res?.detail ?? "Delete failed"); return }
      load()
    } catch { alert("Delete failed") }
    setDeletingId(null)
  }

  const filtered = printers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.ip_address.includes(search)
  )

  const total    = printers.length
  const online   = printers.filter(p => p.status !== "offline").length
  const printing = printers.filter(p => p.status === "printing").length

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Top bar */}
      <div style={{
        height: 52, borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 28px",
        justifyContent: "space-between", background: "var(--card)",
        position: "sticky", top: 0, zIndex: 30,
      }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Printer Management</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 12 }}>{printers.length} printers</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or IP…"
            style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, background: "var(--card2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none", width: 200 }} />
        </div>
      </div>

      <div style={{ padding: "24px 28px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Total Printers", value: total,    accent: "#4a6080" },
            { label: "Online",         value: online,   accent: "#10b981" },
            { label: "Printing Now",   value: printing, accent: "#2563eb" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ background: "var(--card)", borderRadius: 10, padding: "14px 18px", border: "1px solid var(--border)", borderTop: `2px solid ${accent}` }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.8fr 1fr 1fr 130px",
            padding: "10px 20px", borderBottom: "1px solid var(--border)",
            fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5,
          }}>
            <div>Printer Name</div><div>IP Address</div><div>Type</div><div>Status</div><div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-dim)" }}>
              {search ? "No printers match your search" : "No printers added yet"}
            </div>
          ) : (
            filtered.map((printer, idx) => (
              <div key={printer.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1.8fr 1fr 1fr 130px",
                padding: "14px 20px", alignItems: "center",
                borderBottom: idx < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{printer.name}</div>
                  {printer.location && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>📍 {printer.location}</div>}
                </div>
                <div>
                  <code style={{ fontSize: 12, color: "#93c5fd", background: "var(--card2)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", fontFamily: "monospace" }}>
                    {printer.ip_address}
                  </code>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>{printer.type}</div>
                <div>
                  <StatusDot status={printer.status} />
                  {printer.status === "printing" && (
                    <div style={{ fontSize: 10, color: "#10b981", marginTop: 2 }}>{printer.progress.toFixed(1)}%</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button onClick={() => setEditing(printer)} style={{
                    background: "#2563eb18", border: "1px solid #2563eb", color: "#2563eb",
                    borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>Edit</button>
                  <button
                    onClick={() => deletePrinter(printer)}
                    disabled={deletingId === printer.id || printer.status === "printing"}
                    title={printer.status === "printing" ? "Cannot delete while printing" : ""}
                    style={{
                      background: "none",
                      border: `1px solid ${printer.status === "printing" ? "var(--border)" : "#ef4444"}`,
                      color: printer.status === "printing" ? "var(--text-dim)" : "#ef4444",
                      borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                      cursor: printer.status === "printing" ? "not-allowed" : "pointer",
                      opacity: deletingId === printer.id ? 0.5 : 1,
                    }}
                  >{deletingId === printer.id ? "…" : "Delete"}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {editing && (
        <EditPrinterModal printer={editing} onClose={() => setEditing(null)} onSaved={() => { load(); setEditing(null) }} />
      )}
    </div>
  )
}