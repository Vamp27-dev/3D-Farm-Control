import { useEffect, useState, useCallback } from "react"
import { apiFetch } from "./App"
import { getUserRole } from "./utils/auth"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Batch {
  id: number
  name: string
  file_name: string
  status: string
  created_at: string
}

interface Printer {
  id: number
  name: string
  status: string
  ip_address: string
  type: string
}

interface PrintFile {
  id: number
  original_name: string
  file_size: number
  extension: string
}

interface Folder {
  id: number
  name: string
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  completed: { bg: "#10b98118", color: "#10b981" },
  printing:  { bg: "#3b82f618", color: "#3b82f6" },
  queued:    { bg: "#f59e0b18", color: "#f59e0b" },
  empty:     { bg: "#64748b18", color: "#64748b" },
  unknown:   { bg: "#64748b18", color: "#64748b" },
}

function StatusPill({ status }: { status: string }) {
  const { bg, color } = STATUS_COLOR[status] ?? STATUS_COLOR.unknown
  return (
    <span style={{
      background: bg, color,
      border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 10px",
      fontSize: 11, fontWeight: 600, textTransform: "capitalize",
    }}>{status}</span>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  })
}

// ─── Create Batch Modal ───────────────────────────────────────────────────────

function CreateBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [printers, setPrinters]           = useState<Printer[]>([])
  const [folders, setFolders]             = useState<Folder[]>([])
  const [files, setFiles]                 = useState<PrintFile[]>([])
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [selectedFile, setSelectedFile]   = useState<number | null>(null)
  const [selectedPrinters, setSelectedPrinters] = useState<number[]>([])
  const [loading, setLoading]             = useState(false)
  const [step, setStep]                   = useState<1 | 2>(1)  // 1=file, 2=printers

  useEffect(() => {
    // load printers + folders in parallel
    Promise.all([
      apiFetch("/printers/"),
      apiFetch("/files/folders"),
    ]).then(([p, f]) => {
      if (p) setPrinters(p)
      if (f) {
        setFolders(f)
        if (f.length > 0) setSelectedFolder(f[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedFolder) return
    apiFetch(`/files/folder/${selectedFolder}`).then(d => {
      if (d) setFiles(d)
      setSelectedFile(null)
    })
  }, [selectedFolder])

  const togglePrinter = (id: number) =>
    setSelectedPrinters(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )

  const selectAllIdle = () =>
    setSelectedPrinters(
      printers.filter(p => p.status === "idle").map(p => p.id)
    )

  const idlePrinters    = printers.filter(p => p.status === "idle")
  const nonIdlePrinters = printers.filter(p => p.status !== "idle")

  const canProceed = selectedFile !== null
  const canCreate  = selectedFile !== null && selectedPrinters.length > 0

  const createBatch = async () => {
    if (!canCreate) return
    setLoading(true)
    try {
      const token = localStorage.getItem("token")
      const raw = await fetch(
        `${import.meta.env.VITE_API_BASE ?? "http://localhost:8000"}/batches/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            file_id: selectedFile,
            printer_ids: selectedPrinters,
          }),
        }
      )

      const res = await raw.json()

      // ✅ Show exact error from backend
      if (!raw.ok) {
        const msg = typeof res?.detail === "string"
          ? res.detail
          : JSON.stringify(res?.detail ?? res)
        alert(`Error ${raw.status}: ${msg}`)
        setLoading(false)
        return
      }

      onCreated()
      onClose()
    } catch (e: any) {
      alert(`Network error: ${e?.message ?? e}`)
    }
    setLoading(false)
  }

  const selectedFileName = files.find(f => f.id === selectedFile)?.original_name

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
    }}>
      <div style={{
        background: "#0a1628", border: "1px solid #1e3a5f",
        borderRadius: 14, width: 520, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{ padding: "24px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>
                Create Batch
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
                Queue a file to multiple printers at once
              </p>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", color: "#475569",
              fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
            {[
              { n: 1, label: "Select File" },
              { n: 2, label: "Select Printers" },
            ].map(({ n, label }, i) => {
              const active  = step === n
              const done    = step > n
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: done ? "#10b981" : active ? "#3b82f6" : "#1e293b",
                      border: `2px solid ${done ? "#10b981" : active ? "#3b82f6" : "#334155"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      color: done || active ? "#fff" : "#475569",
                      flexShrink: 0,
                    }}>
                      {done ? "✓" : n}
                    </div>
                    <span style={{ fontSize: 12, color: active ? "#f1f5f9" : done ? "#10b981" : "#475569", fontWeight: active ? 600 : 400 }}>
                      {label}
                    </span>
                  </div>
                  {i === 0 && (
                    <div style={{ flex: 1, height: 1, background: step > 1 ? "#10b981" : "#1e293b", margin: "0 12px" }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 28px" }}>

          {/* ── STEP 1: File ── */}
          {step === 1 && (
            <div>
              {/* Folder tabs */}
              {folders.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {folders.map(f => (
                    <button key={f.id} onClick={() => setSelectedFolder(f.id)} style={{
                      padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", transition: "all 0.15s",
                      background: selectedFolder === f.id ? "#3b82f6" : "#0d1b2e",
                      border: `1px solid ${selectedFolder === f.id ? "#3b82f6" : "#1e293b"}`,
                      color: selectedFolder === f.id ? "#fff" : "#64748b",
                    }}>{f.name}</button>
                  ))}
                </div>
              )}

              {/* File list */}
              {files.length === 0 ? (
                <div style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                  No files in this folder. Upload files in the Files section.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {files.map(f => {
                    const sel = selectedFile === f.id
                    return (
                      <div key={f.id} onClick={() => setSelectedFile(f.id)} style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "12px 16px", borderRadius: 8,
                        background: sel ? "#10b98112" : "#0d1b2e",
                        border: `1px solid ${sel ? "#10b981" : "#1e293b"}`,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                        {/* Radio dot */}
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                          border: `2px solid ${sel ? "#10b981" : "#334155"}`,
                          background: sel ? "#10b981" : "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        {/* File icon + name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, color: "#e2e8f0", fontWeight: 500,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{f.original_name}</div>
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                            {f.extension.toUpperCase()} · {formatSize(f.file_size)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Printers ── */}
          {step === 2 && (
            <div>
              {/* Quick-select */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {idlePrinters.length} idle printer{idlePrinters.length !== 1 ? "s" : ""} available
                </div>
                {idlePrinters.length > 0 && (
                  <button onClick={selectAllIdle} style={{
                    fontSize: 12, color: "#3b82f6", background: "none",
                    border: "none", cursor: "pointer", padding: 0, fontWeight: 500,
                  }}>
                    Select all idle
                  </button>
                )}
              </div>

              {/* Selected file reminder */}
              <div style={{
                background: "#0d1b2e", border: "1px solid #1e293b",
                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 11, color: "#475569" }}>FILE</span>
                <span style={{
                  fontSize: 12, color: "#93c5fd", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{selectedFileName}</span>
              </div>

              {/* Idle printers */}
              {idlePrinters.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Available (Idle)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {idlePrinters.map(p => {
                      const sel = selectedPrinters.includes(p.id)
                      return (
                        <div key={p.id} onClick={() => togglePrinter(p.id)} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", borderRadius: 8,
                          background: sel ? "#10b98112" : "#0d1b2e",
                          border: `1px solid ${sel ? "#10b981" : "#1e293b"}`,
                          cursor: "pointer", transition: "all 0.15s",
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
                          <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>Idle</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Non-idle printers (greyed, not selectable) */}
              {nonIdlePrinters.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Unavailable
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {nonIdlePrinters.map(p => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", borderRadius: 8,
                        background: "#0a1422", border: "1px solid #0f1f35",
                        opacity: 0.4,
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: "2px solid #1e293b", flexShrink: 0,
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "#334155" }}>{p.ip_address}</div>
                        </div>
                        <span style={{ fontSize: 11, color: "#475569", textTransform: "capitalize" }}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {idlePrinters.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#334155" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🖨️</div>
                  <div>No idle printers available right now</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 28px", borderTop: "1px solid #0f1f35" }}>

          {/* Summary when on step 2 */}
          {step === 2 && selectedPrinters.length > 0 && (
            <div style={{
              background: "#0d1b2e", border: "1px solid #1e293b",
              borderRadius: 8, padding: "10px 14px", marginBottom: 14,
              fontSize: 13, color: "#64748b",
            }}>
              Will queue{" "}
              <strong style={{ color: "#10b981" }}>{selectedPrinters.length} printer{selectedPrinters.length !== 1 ? "s" : ""}</strong>
              {" "}— jobs start automatically when each printer finishes its current task
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            {step === 2 && (
              <button onClick={() => setStep(1)} style={{
                padding: "9px 18px", background: "none",
                border: "1px solid #1e293b", borderRadius: 6,
                color: "#64748b", cursor: "pointer", fontSize: 14,
              }}>← Back</button>
            )}
            <button onClick={onClose} style={{
              flex: step === 1 ? 1 : undefined,
              padding: "9px 18px", background: "none",
              border: "1px solid #1e293b", borderRadius: 6,
              color: "#64748b", cursor: "pointer", fontSize: 14,
            }}>Cancel</button>

            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!canProceed}
                style={{
                  flex: 2, padding: "9px 0",
                  background: canProceed ? "#3b82f6" : "#0d1b2e",
                  border: "none", borderRadius: 6,
                  color: canProceed ? "#fff" : "#334155",
                  cursor: canProceed ? "pointer" : "not-allowed",
                  fontWeight: 600, fontSize: 14,
                }}>
                Next: Select Printers →
              </button>
            )}

            {step === 2 && (
              <button
                onClick={createBatch}
                disabled={!canCreate || loading}
                style={{
                  flex: 2, padding: "9px 0",
                  background: canCreate && !loading ? "#10b981" : "#0d1b2e",
                  border: "none", borderRadius: 6,
                  color: canCreate && !loading ? "#fff" : "#334155",
                  cursor: canCreate && !loading ? "pointer" : "not-allowed",
                  fontWeight: 600, fontSize: 14,
                }}>
                {loading
                  ? "Creating…"
                  : `⚡ Start Batch (${selectedPrinters.length} printer${selectedPrinters.length !== 1 ? "s" : ""})`
                }
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Batches Page ─────────────────────────────────────────────────────────────

function Batches() {
  const role = getUserRole()
  const [batches, setBatches]           = useState<Batch[]>([])
  const [showCreate, setShowCreate]     = useState(false)
  const [expandedId, setExpandedId]     = useState<number | null>(null)
  const [summaries, setSummaries]       = useState<Record<number, any>>({})
  const [startingBatchId, setStartingBatchId] = useState<number | null>(null)

  const loadBatches = useCallback(async () => {
    const data = await apiFetch("/batches/")
    if (Array.isArray(data)) setBatches(data)
  }, [])

  useEffect(() => {
    loadBatches()
    const i = setInterval(loadBatches, 5000)
    return () => clearInterval(i)
  }, [loadBatches])

  const deleteBatch = async (id: number) => {
    if (!confirm("Delete this batch?")) return
    const res = await apiFetch(`/batches/${id}`, { method: "DELETE" })
    if (res?.detail) { alert(res.detail); return }
    loadBatches()
  }

  const startBatch = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (startingBatchId !== null) return  // prevent double-click
    setStartingBatchId(id)
    try {
      const token = localStorage.getItem("token")
      const raw = await fetch(
        `${import.meta.env.VITE_API_BASE ?? "http://localhost:8000"}/batches/${id}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )
      const res = await raw.json()
      if (!raw.ok) {
        alert(res?.detail ?? "Failed to start batch")
        return
      }
      const parts = [
        res.started > 0 ? `✅ ${res.started} printer(s) started` : null,
        res.queued  > 0 ? `⏳ ${res.queued} queued (busy printers will auto-start)` : null,
        res.errors?.length > 0 ? `⚠️ ${res.errors.join(", ")}` : null,
      ].filter(Boolean)
      alert(parts.length ? parts.join("\n") : "Batch started")
      loadBatches()
    } finally {
      setStartingBatchId(null)
    }
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!summaries[id]) {
      const s = await apiFetch(`/batches/${id}/summary`)
      if (s) setSummaries(prev => ({ ...prev, [id]: s }))
    }
  }

  const printing  = batches.filter(b => b.status === "printing").length
  const queued    = batches.filter(b => b.status === "queued").length
  const completed = batches.filter(b => b.status === "completed").length

  return (
    <div style={{
      minHeight: "100vh", background: "#070e1a",
      color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Nav */}
      <div style={{
        borderBottom: "1px solid #0f1f35", padding: "0 32px",
        display: "flex", alignItems: "center", height: 52, gap: 24,
      }}>
        <a href="/" style={{ fontSize: 13, fontWeight: 700, color: "#10b981", textDecoration: "none", letterSpacing: 0.5 }}>
          FARM CONTROL
        </a>
        {[["Dashboard", "/"], ["Files", "/files"], ["Batches", "/batches"], ["Printers", "/printers/manage"]].map(([label, path]) => (
          <a key={label} href={path} style={{
            fontSize: 13,
            color: label === "Batches" ? "#f1f5f9" : "#475569",
            textDecoration: "none", fontWeight: label === "Batches" ? 600 : 400,
          }}>{label}</a>
        ))}
        {role === "admin" && (
          <a href="/users/manage" style={{
            fontSize: 13, color: "#475569", textDecoration: "none", padding: "0 4px",
          }}>Users</a>
        )}
      </div>

      <div style={{ padding: "28px 32px" }}>

        {/* Page header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>
              Batch Management
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              Queue print jobs across multiple printers at once
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} style={{
            background: "#10b981", border: "none", color: "#fff",
            borderRadius: 8, padding: "9px 20px", fontSize: 14,
            fontWeight: 600, cursor: "pointer",
          }}>
            + Create Batch
          </button>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Total Batches", value: batches.length, accent: "#475569" },
            { label: "Printing",      value: printing,       accent: "#3b82f6"  },
            { label: "Queued",        value: queued,         accent: "#f59e0b"  },
            { label: "Completed",     value: completed,      accent: "#10b981"  },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: "#0a1525", border: `1px solid ${accent}22`,
              borderRadius: 10, padding: "14px 18px",
              borderLeft: `3px solid ${accent}`,
            }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: accent }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Batch list */}
        {batches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#1e293b" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <div style={{ fontSize: 18, marginBottom: 8, color: "#334155" }}>No batches yet</div>
            <div style={{ fontSize: 14, color: "#1e293b", marginBottom: 24 }}>
              Create a batch to queue a file across multiple printers
            </div>
            <button onClick={() => setShowCreate(true)} style={{
              background: "#10b981", border: "none", color: "#fff",
              borderRadius: 8, padding: "9px 24px", fontSize: 14,
              fontWeight: 600, cursor: "pointer",
            }}>+ Create your first batch</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {batches.map(batch => {
              const isExpanded = expandedId === batch.id
              const summary    = summaries[batch.id]

              return (
                <div key={batch.id} style={{
                  background: "#0a1525", border: "1px solid #0f1f35",
                  borderRadius: 10, overflow: "hidden",
                  transition: "border-color 0.15s",
                }}>
                  {/* Row */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "14px 20px", cursor: "pointer",
                  }} onClick={() => toggleExpand(batch.id)}>

                    {/* Expand arrow */}
                    <div style={{
                      color: "#334155", fontSize: 12, transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      flexShrink: 0,
                    }}>▶</div>

                    {/* Batch info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                          {batch.name}
                        </span>
                        <StatusPill status={batch.status} />
                      </div>
                      <div style={{
                        fontSize: 12, color: "#475569",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {batch.file_name}
                      </div>
                    </div>

                    {/* Date */}
                    <div style={{ fontSize: 12, color: "#334155", flexShrink: 0 }}>
                      {formatDate(batch.created_at)}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {/* Start button — only for queued/waiting batches */}
                      {(batch.status === "queued" || batch.status === "empty") && (
                        <button
                          onClick={e => startBatch(batch.id, e)}
                          disabled={startingBatchId === batch.id}
                          style={{
                            background: startingBatchId === batch.id ? "#0d1b2e" : "#10b98118",
                            border: `1px solid ${startingBatchId === batch.id ? "#1e293b" : "#10b981"}`,
                            color: startingBatchId === batch.id ? "#475569" : "#10b981",
                            borderRadius: 6, padding: "4px 12px",
                            fontSize: 12, fontWeight: 600,
                            cursor: startingBatchId === batch.id ? "not-allowed" : "pointer",
                            flexShrink: 0,
                            display: "flex", alignItems: "center", gap: 6,
                            minWidth: 90, justifyContent: "center",
                          }}
                        >
                          {startingBatchId === batch.id ? (
                            <>
                              <span style={{
                                display: "inline-block", width: 10, height: 10,
                                border: "2px solid #475569",
                                borderTopColor: "#10b981",
                                borderRadius: "50%",
                                animation: "spin 0.7s linear infinite",
                              }} />
                              Sending…
                            </>
                          ) : "▶ Start"}
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); deleteBatch(batch.id) }}
                        style={{
                          background: "none", border: "1px solid #1e293b",
                          color: "#475569", borderRadius: 6, padding: "4px 10px",
                          fontSize: 12, cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded summary */}
                  {isExpanded && summary && (
                    <div style={{
                      borderTop: "1px solid #0f1f35",
                      padding: "14px 20px 16px 48px",
                      background: "#080e1c",
                    }}>
                      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
                        Batch Summary
                      </div>
                      <div style={{ display: "flex", gap: 24 }}>
                        {[
                          { label: "Total",     value: summary.total,     color: "#64748b" },
                          { label: "Completed", value: summary.completed, color: "#10b981" },
                          { label: "Printing",  value: summary.printing ?? 0, color: "#3b82f6" },
                          { label: "Queued",    value: summary.queued,    color: "#f59e0b" },
                          { label: "Failed",    value: summary.failed,    color: "#ef4444" },
                          { label: "Skipped",   value: summary.skipped,   color: "#8b5cf6" },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
                              {label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={loadBatches}
        />
      )}
    </div>
  )
}

export default Batches