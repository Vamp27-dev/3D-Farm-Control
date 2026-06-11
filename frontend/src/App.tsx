import { useEffect, useState, useCallback, useRef } from "react"
import { Routes, Route, Link } from "react-router-dom"
import Files from "./Files"
import AddPrinter from "./AddPrinter"
import Login from "./Login"
import ProtectedRoute from "./ProtectedRoute"
import { getUserRole } from "./utils/auth"
import Batches from "./Batches"
import PrinterManagement from "./PrinterManagement"
import UserManagement from "./UserManagement"

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

export const apiFetch = async (url: string, options: any = {}) => {
  const token = localStorage.getItem("token")
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    localStorage.removeItem("token")
    window.location.href = "/login"
    return null
  }
  return res.json()
}

interface Printer {
  id: number
  name: string
  status: string
  progress: number
  current_file: string | null
  camera_url?: string
  ip_address?: string
  type?: string
}

interface QueueItem {
  id: number
  printer_id: number
  batch_id: number
  status: string
  position: number
}

interface Analytics {
  today_prints: number
  week_prints: number
  success_rate: number
  avg_print_time_minutes: number | null
  active_printers: number
}

// ─── Printer Tray ────────────────────────────────────────────────────────────

function PrinterTray({
  printer,
  onClose,
  onRefresh,
}: {
  printer: Printer
  onClose: () => void
  onRefresh: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadQueue = useCallback(async () => {
    const data = await apiFetch(`/printers/${printer.id}/queue`)
    if (data) setQueue(data)
  }, [printer.id])

  useEffect(() => {
    loadQueue()
    const i = setInterval(loadQueue, 3000)
    return () => clearInterval(i)
  }, [loadQueue])

  // ✅ FIX: all commands go through backend (no direct browser→printer calls)
  const printerCmd = async (cmd: "pause" | "resume" | "cancel") => {
    setLoading(true)
    try {
      const res = await apiFetch(`/printers/${printer.id}/${cmd}`, { method: "POST" })
      if (res?.detail) alert(res.detail)
      else onRefresh()
    } catch {
      alert("Command failed")
    }
    setLoading(false)
  }

  const startNext = async () => {
    setLoading(true)
    const res = await apiFetch(`/printers/${printer.id}/start_next`, { method: "POST" })
    if (res?.detail) alert(res.detail)
    else { onRefresh(); loadQueue() }
    setLoading(false)
  }

  const skipJob = async (jobId: number) => {
    await apiFetch(`/batches/job/${jobId}/skip`, { method: "POST" })
    loadQueue()
  }

  const cancelJob = async (jobId: number) => {
    await apiFetch(`/batches/job/${jobId}/cancel`, { method: "POST" })
    loadQueue()
  }

  // ✅ FIX: handle "paused" as its own status
  const isPrinting = printer.status === "printing"
  const isPaused   = printer.status === "paused"
  const isIdle     = printer.status === "idle"
  const isOffline  = printer.status === "offline"
  const isActive   = isPrinting || isPaused

  const statusColor: Record<string, string> = {
    printing: "#10b981",
    paused:   "#f59e0b",
    idle:     "#3b82f6",
    offline:  "#ef4444",
  }
  const dotColor = statusColor[printer.status] ?? "#64748b"

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 380, height: "100vh",
      background: "#0a1628", borderLeft: "1px solid #1e3a5f",
      zIndex: 50, display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              PRINTER
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>
              {printer.name}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#475569",
            fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Status row */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: dotColor, boxShadow: `0 0 8px ${dotColor}`,
          }} />
          <span style={{ fontSize: 13, color: dotColor, fontWeight: 600, textTransform: "capitalize" }}>
            {printer.status}
          </span>
          {isActive && (
            <span style={{ fontSize: 13, color: "#64748b" }}>
              — {printer.progress.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isActive && (
          <div style={{ marginTop: 10 }}>
            <div style={{ background: "#1e293b", borderRadius: 4, height: 5, overflow: "hidden" }}>
              <div style={{
                width: `${printer.progress}%`, height: "100%",
                background: isPaused
                  ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                  : "linear-gradient(90deg, #10b981, #34d399)",
                transition: "width 1s ease",
              }} />
            </div>
            {printer.current_file && (
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6, wordBreak: "break-all" }}>
                {printer.current_file}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Job Controls */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
          JOB CONTROLS
        </div>

        {isOffline && (
          <div style={{ color: "#ef4444", fontSize: 13 }}>Printer is offline</div>
        )}

        {/* ✅ FIX: Paused state shows Resume + Cancel */}
        {isPaused && (
          <div style={{ display: "flex", gap: 8 }}>
            <TrayBtn onClick={() => printerCmd("resume")} color="#10b981" disabled={loading}>
              ▶ Resume
            </TrayBtn>
            <TrayBtn onClick={() => printerCmd("cancel")} color="#ef4444" disabled={loading}>
              ✕ Cancel
            </TrayBtn>
          </div>
        )}

        {/* Printing state shows Pause + Cancel */}
        {isPrinting && (
          <div style={{ display: "flex", gap: 8 }}>
            <TrayBtn onClick={() => printerCmd("pause")} color="#f59e0b" disabled={loading}>
              ⏸ Pause
            </TrayBtn>
            <TrayBtn onClick={() => printerCmd("cancel")} color="#ef4444" disabled={loading}>
              ✕ Cancel
            </TrayBtn>
          </div>
        )}

        {/* Idle state shows Start Next */}
        {isIdle && (
          <TrayBtn
            onClick={startNext}
            color="#10b981"
            disabled={loading || queue.length === 0}
          >
            {queue.length === 0 ? "Queue is empty" : "▶ Start Next Job"}
          </TrayBtn>
        )}
      </div>

      {/* Queue */}
      <div style={{ padding: "16px 24px", flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
          QUEUE ({queue.length})
        </div>

        {queue.length === 0 ? (
          <div style={{ color: "#334155", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            No jobs queued
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {queue.map((job, idx) => (
              <div key={job.id} style={{
                background: "#0d1b2e", borderRadius: 8, padding: "10px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                border: "1px solid #1e293b",
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "#475569" }}>Position {idx + 1}</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>Job #{job.id}</div>
                  <div style={{
                    fontSize: 11, marginTop: 2,
                    color: job.status === "waiting_confirmation" ? "#f59e0b" : "#64748b",
                  }}>
                    {job.status}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {isPrinting && idx === 0 && (
                    <TrayBtn onClick={() => skipJob(job.id)} color="#f59e0b" small>Skip</TrayBtn>
                  )}
                  <TrayBtn onClick={() => cancelJob(job.id)} color="#ef4444" small>✕</TrayBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TrayBtn({ onClick, color, disabled, children, small }: {
  onClick: () => void
  color: string
  disabled?: boolean
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? "#0d1b2e" : `${color}18`,
      border: `1px solid ${disabled ? "#1e293b" : color}`,
      color: disabled ? "#334155" : color,
      borderRadius: 6,
      padding: small ? "4px 10px" : "7px 14px",
      fontSize: small ? 11 : 13,
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  )
}

// ─── Add Printer Modal ────────────────────────────────────────────────────────

function AddPrinterModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("")
  const [ip, setIp] = useState("")
  const [type, setType] = useState("klipper")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name || !ip) { alert("Fill all fields"); return }
    setLoading(true)
    try {
      const res = await apiFetch("/printers/", {
        method: "POST",
        body: JSON.stringify({ name, ip_address: ip, type }),
      })
      if (res?.detail) { alert(res.detail); setLoading(false); return }
      onAdded()
      onClose()
    } catch { alert("Failed to add printer") }
    setLoading(false)
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
    }}>
      <div style={{
        background: "#0a1628", border: "1px solid #1e3a5f",
        borderRadius: 12, padding: 32, width: 360,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <h2 style={{ margin: "0 0 24px", fontSize: 18, color: "#f1f5f9" }}>Add Printer</h2>
        {[
          { label: "Printer Name", val: name, set: setName, ph: "e.g. Neptune-7" },
          { label: "IP Address", val: ip, set: setIp, ph: "e.g. 192.168.68.70" },
        ].map(({ label, val, set, ph }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1.5 }}>
              {label}
            </label>
            <input
              value={val} onChange={e => set(e.target.value)} placeholder={ph}
              style={{
                width: "100%", padding: "9px 12px", background: "#0d1b2e",
                border: "1px solid #1e293b", borderRadius: 6, color: "#f1f5f9",
                fontSize: 14, boxSizing: "border-box", outline: "none",
              }}
            />
          </div>
        ))}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 10, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Type
          </label>
          <select value={type} onChange={e => setType(e.target.value)} style={{
            width: "100%", padding: "9px 12px", background: "#0d1b2e",
            border: "1px solid #1e293b", borderRadius: 6, color: "#f1f5f9", fontSize: 14,
          }}>
            <option value="klipper">Neptune (Klipper/Moonraker)</option>
            <option value="centauri">Centauri Carbon</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "9px 0", background: "none",
            border: "1px solid #1e293b", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 14,
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} style={{
            flex: 2, padding: "9px 0", background: loading ? "#1e293b" : "#10b981",
            border: "none", borderRadius: 6, color: loading ? "#475569" : "#fff",
            cursor: loading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14,
          }}>
            {loading ? "Adding…" : "Add Printer"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Batch Print Modal ────────────────────────────────────────────────────────

function BatchModal({ printers, onClose, onDone }: {
  printers: Printer[]
  onClose: () => void
  onDone: () => void
}) {
  const [files, setFiles] = useState<any[]>([])
  const [selectedFile, setSelectedFile] = useState<number | null>(null)
  const [selectedPrinters, setSelectedPrinters] = useState<number[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch("/files/").then(d => { if (d) setFiles(d) })
  }, [])

  const togglePrinter = (id: number) =>
    setSelectedPrinters(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])

  const selectAllNeptune = () =>
    setSelectedPrinters(
      printers.filter(p => p.type === "klipper" && p.status !== "offline").map(p => p.id)
    )

  const startBatch = async () => {
    if (!selectedFile) { alert("Select a file"); return }
    if (selectedPrinters.length === 0) { alert("Select at least one printer"); return }
    setLoading(true)
    try {
      const res = await apiFetch("/batches/", {
        method: "POST",
        body: JSON.stringify({ file_id: selectedFile, printer_ids: selectedPrinters }),
      })
      if (res?.detail) { alert(res.detail); setLoading(false); return }
      alert(`Batch created — ${selectedPrinters.length} printer(s) queued ✅`)
      onDone()
      onClose()
    } catch { alert("Failed to create batch") }
    setLoading(false)
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
    }}>
      <div style={{
        background: "#0a1628", border: "1px solid #1e3a5f",
        borderRadius: 12, padding: 32, width: 480,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#f1f5f9" }}>Batch Print</h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "#475569" }}>
          Send the same file to multiple printers at once
        </p>

        {/* File */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 10, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Select File
          </label>
          <select value={selectedFile ?? ""} onChange={e => setSelectedFile(Number(e.target.value))}
            style={{
              width: "100%", padding: "9px 12px", background: "#0d1b2e",
              border: "1px solid #1e293b", borderRadius: 6, color: "#f1f5f9", fontSize: 14,
            }}>
            <option value="">— choose a file —</option>
            {files.map((f: any) => (
              <option key={f.id} value={f.id}>{f.original_name}</option>
            ))}
          </select>
        </div>

        {/* Printer list */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5 }}>
              Select Printers
            </label>
            <button onClick={selectAllNeptune} style={{
              fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0,
            }}>
              Select all online Neptune
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {printers.map(p => {
              const sel = selectedPrinters.includes(p.id)
              const off = p.status === "offline"
              return (
                <div key={p.id} onClick={() => !off && togglePrinter(p.id)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 8,
                  background: sel ? "#10b98115" : "#0d1b2e",
                  border: `1px solid ${sel ? "#10b981" : "#1e293b"}`,
                  cursor: off ? "not-allowed" : "pointer",
                  opacity: off ? 0.35 : 1, transition: "all 0.15s",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${sel ? "#10b981" : "#334155"}`,
                    background: sel ? "#10b981" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {sel && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{p.ip_address}</div>
                  </div>
                  <StatusPill status={p.status} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Summary */}
        {selectedPrinters.length > 0 && selectedFile && (
          <div style={{
            background: "#0d1b2e", border: "1px solid #1e293b",
            borderRadius: 8, padding: "12px 16px", marginBottom: 20,
            fontSize: 13, color: "#64748b",
          }}>
            Queue <strong style={{ color: "#10b981" }}>{selectedPrinters.length} printer(s)</strong> with{" "}
            <strong style={{ color: "#93c5fd" }}>
              {files.find(f => f.id === selectedFile)?.original_name}
            </strong>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "9px 0", background: "none",
            border: "1px solid #1e293b", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 14,
          }}>Cancel</button>
          <button onClick={startBatch}
            disabled={loading || !selectedFile || selectedPrinters.length === 0}
            style={{
              flex: 2, padding: "9px 0",
              background: loading || !selectedFile || selectedPrinters.length === 0 ? "#0d1b2e" : "#10b981",
              border: "none", borderRadius: 6,
              color: loading || !selectedFile || selectedPrinters.length === 0 ? "#334155" : "#fff",
              cursor: loading || !selectedFile || selectedPrinters.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: 14,
            }}>
            {loading ? "Starting…" : `Queue ${selectedPrinters.length || ""} Printer(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    printing: { bg: "#10b98118", color: "#10b981" },
    paused:   { bg: "#f59e0b18", color: "#f59e0b" },
    idle:     { bg: "#3b82f618", color: "#3b82f6" },
    offline:  { bg: "#ef444418", color: "#ef4444" },
  }
  const { bg, color } = cfg[status] ?? { bg: "#64748b18", color: "#64748b" }
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
      textTransform: "capitalize",
    }}>{status}</span>
  )
}

// ─── App & Routes ─────────────────────────────────────────────────────────────

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/files" element={<ProtectedRoute><Files /></ProtectedRoute>} />
      <Route path="/add-printer" element={<ProtectedRoute><AddPrinter /></ProtectedRoute>} />
      <Route path="/batches" element={<ProtectedRoute><Batches /></ProtectedRoute>} />
      <Route path="/printers/manage" element={<ProtectedRoute><PrinterManagement /></ProtectedRoute>} />
      <Route path="/users/manage" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
    </Routes>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const role = getUserRole()
  const [printers, setPrinters] = useState<Printer[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const selectedPrinterRef = useRef<Printer | null>(null)
  selectedPrinterRef.current = selectedPrinter

  const loadPrinters = useCallback(async () => {
    const data = await apiFetch("/printers/")
    if (data) {
      setPrinters(data)
      // ✅ FIX: use ref so this never goes stale, no re-renders caused by dependency
      const cur = selectedPrinterRef.current
      if (cur) {
        const updated = data.find((p: Printer) => p.id === cur.id)
        if (updated) setSelectedPrinter(updated)
      }
    }
  }, [])  // ✅ empty deps — stable function reference

  useEffect(() => {
    loadPrinters()
    const i = setInterval(loadPrinters, 4000)
    return () => clearInterval(i)
  }, [loadPrinters])

  useEffect(() => {
    const load = async () => {
      const data = await apiFetch("/analytics")
      if (data) setAnalytics(data)
    }
    load()
    const i = setInterval(load, 10000)
    return () => clearInterval(i)
  }, [])

  const deletePrinter = async (id: number) => {
    if (!confirm("Delete this printer?")) return
    const token = localStorage.getItem("token")
    const res = await fetch(`${API_BASE}/printers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json()
      alert(d.detail || "Delete failed")
      return
    }
    if (selectedPrinter?.id === id) setSelectedPrinter(null)
    loadPrinters()
  }

  const total    = printers.length
  const printing = printers.filter(p => p.status === "printing").length
  const paused   = printers.filter(p => p.status === "paused").length
  const idle     = printers.filter(p => p.status === "idle").length
  const offline  = printers.filter(p => p.status === "offline").length

  return (
    <div style={{ minHeight: "100vh", background: "#070e1a", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Nav */}
      <div style={{
        borderBottom: "1px solid #0f1f35", padding: "0 32px",
        display: "flex", alignItems: "center", height: 52,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginRight: 32, letterSpacing: 0.5 }}>
          FARM CONTROL
        </span>
        {[["Dashboard", "/"], ["Files", "/files"], ["Batches", "/batches"], ["Printers", "/printers/manage"], ["Users", "/users/manage"]].map(([label, path]) => (
          <Link key={label} to={path} style={{
            fontSize: 13, color: "#475569", textDecoration: "none",
            padding: "0 16px", height: "100%", display: "flex", alignItems: "center",
          }}>{label}</Link>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>

          {role === "admin" && (
            <button onClick={() => setShowAddModal(true)} style={{
              background: "#10b981", border: "none", color: "#fff",
              borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>+ Add Printer</button>
          )}
          <button onClick={() => { localStorage.removeItem("token"); window.location.href = "/login" }} style={{
            background: "none", border: "1px solid #1e293b",
            color: "#475569", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer",
          }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: "28px 32px" }}>
        <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 700, color: "#f1f5f9" }}>
          Production Control Center
        </h1>

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Total",        value: total,    accent: "#475569" },
            { label: "Printing",     value: printing, accent: "#10b981" },
            { label: "Paused",       value: paused,   accent: "#f59e0b" },
            { label: "Idle",         value: idle,     accent: "#3b82f6" },
            { label: "Offline",      value: offline,  accent: "#ef4444" },
            { label: "Success Rate", value: analytics ? `${analytics.success_rate}%` : "—", accent: "#8b5cf6" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: "#0a1525", border: `1px solid ${accent}22`,
              borderRadius: 10, padding: "14px 18px",
              borderLeft: `3px solid ${accent}`,
            }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Printer Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
          gap: 12,
          marginRight: selectedPrinter ? 396 : 0,
          transition: "margin-right 0.2s ease",
        }}>
          {printers.map(printer => {
            const isSel = selectedPrinter?.id === printer.id
            const accent: Record<string, string> = {
              printing: "#10b981", paused: "#f59e0b", idle: "#3b82f6", offline: "#334155"
            }
            const col = accent[printer.status] ?? "#334155"

            return (
              <div key={printer.id} onClick={() => setSelectedPrinter(isSel ? null : printer)}
                style={{
                  background: isSel ? "#0d1f35" : "#0a1525",
                  border: `1px solid ${isSel ? col : "#0f1f35"}`,
                  borderRadius: 10, padding: "14px 16px",
                  cursor: "pointer", transition: "all 0.15s",
                  position: "relative",
                  boxShadow: isSel ? `0 0 0 1px ${col}33` : "none",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{printer.name}</div>
                  <StatusPill status={printer.status} />
                </div>
                <div style={{ fontSize: 11, color: "#334155", marginBottom: 10, minHeight: 14, wordBreak: "break-all" }}>
                  {printer.current_file || "Ready"}
                </div>
                {(printer.status === "printing" || printer.status === "paused") && (
                  <>
                    <div style={{ background: "#0d1b2e", borderRadius: 3, height: 4, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{
                        width: `${printer.progress}%`, height: "100%",
                        background: printer.status === "paused"
                          ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                          : "linear-gradient(90deg, #10b981, #34d399)",
                        transition: "width 1s ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 12, color: printer.status === "paused" ? "#f59e0b" : "#10b981", fontWeight: 600 }}>
                      {printer.progress.toFixed(1)}%
                    </div>
                  </>
                )}
                {role === "admin" && (
                  <button onClick={e => { e.stopPropagation(); deletePrinter(printer.id) }}
                    style={{
                      position: "absolute", bottom: 8, right: 10,
                      background: "none", border: "none",
                      color: "#1e293b", fontSize: 13, cursor: "pointer", padding: 2,
                    }} title="Delete printer">🗑</button>
                )}
              </div>
            )
          })}

          {printers.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 0", color: "#1e293b" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🖨️</div>
              <div style={{ fontSize: 16, marginBottom: 8 }}>No printers added yet</div>
              {role === "admin" && (
                <button onClick={() => setShowAddModal(true)} style={{
                  background: "#10b981", border: "none", color: "#fff",
                  borderRadius: 6, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>+ Add your first printer</button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedPrinter && (
        <PrinterTray printer={selectedPrinter} onClose={() => setSelectedPrinter(null)} onRefresh={loadPrinters} />
      )}
      {showAddModal && <AddPrinterModal onClose={() => setShowAddModal(false)} onAdded={loadPrinters} />}
    </div>
  )
}

export default App