import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
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
        background: "#0a1628", border: "1px solid #1e3a5f",
        borderRadius: 12, padding: 28, width: 380,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>
            Edit Printer
          </h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#475569",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>✕</button>
        </div>

        {fields.map(({ label, value, set, placeholder }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <label style={{
              display: "block", fontSize: 10, color: "#475569",
              marginBottom: 5, textTransform: "uppercase", letterSpacing: 1.5,
            }}>{label}</label>
            <input
              value={value}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              style={{
                width: "100%", padding: "8px 12px",
                background: "#0d1b2e", border: "1px solid #1e293b",
                borderRadius: 6, color: "#f1f5f9", fontSize: 14,
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
            background: loading || !hasChanges ? "#0d1b2e" : "#3b82f6",
            border: "none", borderRadius: 6,
            color: loading || !hasChanges ? "#334155" : "#fff",
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
    <div style={{
      minHeight: "100vh", background: "#070e1a",
      color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Nav */}
      <div style={{
        borderBottom: "1px solid #0f1f35", padding: "0 32px",
        display: "flex", alignItems: "center", height: 52, gap: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginRight: 32, letterSpacing: 0.5 }}>
          FARM CONTROL
        </span>
        {[["Dashboard", "/"], ["Files", "/files"], ["Batches", "/batches"], ["Printers", "/printers/manage"]].map(([label, path]) => (
          <Link key={label} to={path} style={{
            fontSize: 13,
            color: label === "Printers" ? "#f1f5f9" : "#475569",
            textDecoration: "none",
            padding: "0 16px", height: "100%",
            display: "flex", alignItems: "center",
            fontWeight: label === "Printers" ? 600 : 400,
            borderBottom: label === "Printers" ? "2px solid #3b82f6" : "2px solid transparent",
          }}>{label}</Link>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => { localStorage.removeItem("token"); window.location.href = "/login" }}
            style={{
              background: "none", border: "1px solid #1e293b",
              color: "#475569", borderRadius: 6, padding: "6px 12px",
              fontSize: 13, cursor: "pointer",
            }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700 }}>Printer Management</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              View, rename, and update IP addresses for all printers
            </p>
          </div>
          <Link to="/add-printer" style={{
            background: "#10b981", color: "#fff", textDecoration: "none",
            borderRadius: 8, padding: "9px 20px", fontSize: 14, fontWeight: 600,
          }}>+ Add Printer</Link>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Printers", value: total,    accent: "#475569" },
            { label: "Online",         value: online,   accent: "#10b981" },
            { label: "Printing Now",   value: printing, accent: "#3b82f6" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: "#0a1525", borderRadius: 10, padding: "14px 20px",
              border: `1px solid ${accent}22`, borderLeft: `3px solid ${accent}`,
            }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or IP…"
            style={{
              width: 280, padding: "8px 14px",
              background: "#0a1525", border: "1px solid #1e293b",
              borderRadius: 8, color: "#f1f5f9", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Printer table */}
        <div style={{
          background: "#0a1525", borderRadius: 12,
          border: "1px solid #0f1f35", overflow: "hidden",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.8fr 1fr 1fr 120px",
            padding: "10px 20px",
            borderBottom: "1px solid #0f1f35",
            fontSize: 10, color: "#334155",
            textTransform: "uppercase", letterSpacing: 1.5,
          }}>
            <div>Printer Name</div>
            <div>IP Address</div>
            <div>Type</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#334155" }}>
              {search ? "No printers match your search" : "No printers added yet"}
            </div>
          ) : (
            filtered.map((printer, idx) => (
              <div key={printer.id} style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.8fr 1fr 1fr 120px",
                padding: "14px 20px",
                alignItems: "center",
                borderBottom: idx < filtered.length - 1 ? "1px solid #0a1422" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "#0d1b2e")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Name */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                    {printer.name}
                  </div>
                  {printer.location && (
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
                      📍 {printer.location}
                    </div>
                  )}
                </div>

                {/* IP */}
                <div>
                  <code style={{
                    fontSize: 13, color: "#93c5fd",
                    background: "#0d1b2e", padding: "2px 8px",
                    borderRadius: 4, border: "1px solid #1e293b",
                    fontFamily: "monospace",
                  }}>
                    {printer.ip_address}
                  </code>
                </div>

                {/* Type */}
                <div style={{ fontSize: 12, color: "#475569", textTransform: "capitalize" }}>
                  {printer.type}
                </div>

                {/* Status */}
                <div>
                  <StatusDot status={printer.status} />
                  {printer.status === "printing" && (
                    <div style={{ fontSize: 11, color: "#10b981", marginTop: 3 }}>
                      {printer.progress.toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setEditing(printer)}
                    style={{
                      background: "#3b82f618", border: "1px solid #3b82f6",
                      color: "#3b82f6", borderRadius: 6,
                      padding: "4px 10px", fontSize: 12,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >Edit</button>
                  <button
                    onClick={() => deletePrinter(printer)}
                    disabled={deletingId === printer.id || printer.status === "printing"}
                    title={printer.status === "printing" ? "Cannot delete while printing" : "Delete printer"}
                    style={{
                      background: "none",
                      border: `1px solid ${printer.status === "printing" ? "#1e293b" : "#ef4444"}`,
                      color: printer.status === "printing" ? "#334155" : "#ef4444",
                      borderRadius: 6, padding: "4px 10px", fontSize: 12,
                      fontWeight: 600,
                      cursor: printer.status === "printing" ? "not-allowed" : "pointer",
                      opacity: deletingId === printer.id ? 0.5 : 1,
                    }}
                  >
                    {deletingId === printer.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p style={{ marginTop: 12, fontSize: 11, color: "#1e293b" }}>
          Changes to IP address take effect immediately — the poller will use the new IP on the next cycle (within 5 seconds).
        </p>
      </div>

      {editing && (
        <EditPrinterModal
          printer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { load(); setEditing(null) }}
        />
      )}
    </div>
  )
}