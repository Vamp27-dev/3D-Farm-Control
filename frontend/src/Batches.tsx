import { useEffect, useState, useCallback } from "react"
import { toISTDate, timeAgo } from "./utils/date"
import { apiFetch } from "./App"
import CentauriPrintOptionsModal, { type CentauriPrintOptions } from "./CentauriPrintOptionsModal"

const API_BASE = import.meta.env.VITE_API_BASE || ""

// ─── Types ────────────────────────────────────────────────────────────────────

interface Batch {
  id: number
  serial: number
  name: string
  file_name: string
  status: string
  archived: boolean
  printer_type: string | null   // "centauri" | "klipper" | null (empty batch)
  created_at: string
}

interface BatchPrinterJob {
  job_id: number
  printer_id: number
  printer_name: string
  printer_status: string
  job_status: string
  progress: number | null
  started_at: string | null
  completed_at: string | null
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
  completed: { bg: "#2ECC7118", color: "var(--success)" },
  printing:  { bg: "#4FA3FF18", color: "var(--primary)" },
  queued:    { bg: "#F5B04118", color: "var(--warning)" },
  empty:     { bg: "#7F8C8D18", color: "var(--secondary)" },
  unknown:   { bg: "#7F8C8D18", color: "var(--secondary)" },
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

const JOB_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  printing:             { bg: "#2ECC7118", color: "var(--success)" },
  completed:            { bg: "#2ECC7118", color: "var(--success)" },
  queued:               { bg: "#F5B04118", color: "var(--warning)" },
  waiting_confirmation: { bg: "#F5B04118", color: "var(--warning)" },
  cancelled:            { bg: "#E74C3C18", color: "var(--danger)" },
  failed:               { bg: "#E74C3C18", color: "var(--danger)" },
  skipped:              { bg: "#4FA3FF18", color: "#4FA3FF" },
}

function JobStatusPill({ status }: { status: string }) {
  const { bg, color } = JOB_STATUS_COLOR[status] ?? { bg: "#7F8C8D18", color: "var(--secondary)" }
  return (
    <span style={{
      background: bg, color,
      border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px",
      fontSize: 10, fontWeight: 600, textTransform: "capitalize", whiteSpace: "nowrap",
    }}>{status.replace("_", " ")}</span>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// date formatting via shared utils/date

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
  const [batchName, setBatchName]         = useState("")
  const [printerTypeFilter, setPrinterTypeFilter] = useState<string>("all")  // ✅ type filter
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

  // ✅ Filter by selected type so you can't mix Neptune + Centauri in one batch
  const idlePrinters    = printers.filter(p =>
    p.status === "idle" &&
    (printerTypeFilter === "all" || p.type === printerTypeFilter)
  )
  const nonIdlePrinters = printers.filter(p =>
    p.status !== "idle" &&
    (printerTypeFilter === "all" || p.type === printerTypeFilter)
  )
  // Detect available types to show filter pills
  const availableTypes = [...new Set(printers.map(p => p.type))]

  const canProceed = selectedFile !== null
  const canCreate  = selectedFile !== null && selectedPrinters.length > 0

  const createBatch = async () => {
    if (!canCreate) return
    setLoading(true)
    try {
      const token = localStorage.getItem("token")
      const raw = await fetch(
        `${API_BASE}/batches/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: batchName.trim() || null,
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
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 14, width: 520, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{ padding: "24px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                Create Batch
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                Queue a file to multiple printers at once
              </p>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", color: "var(--text-muted)",
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
                      background: done ? "var(--success)" : active ? "var(--primary)" : "var(--border)",
                      border: `2px solid ${done ? "var(--success)" : active ? "var(--primary)" : "var(--text-dim)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      color: done || active ? "#fff" : "var(--text-muted)",
                      flexShrink: 0,
                    }}>
                      {done ? "✓" : n}
                    </div>
                    <span style={{ fontSize: 12, color: active ? "var(--text)" : done ? "var(--success)" : "var(--text-muted)", fontWeight: active ? 600 : 400 }}>
                      {label}
                    </span>
                  </div>
                  {i === 0 && (
                    <div style={{ flex: 1, height: 1, background: step > 1 ? "var(--success)" : "var(--border)", margin: "0 12px" }} />
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
              {/* ✅ Batch name field — optional, helps identify which job runs where */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1.5 }}>
                  Batch Name <span style={{ color: "var(--text-dim)", textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  value={batchName}
                  onChange={e => setBatchName(e.target.value)}
                  placeholder="e.g. Phone Cases — Order #4521"
                  style={{
                    width: "100%", padding: "9px 12px",
                    background: "var(--card2)", border: "1px solid var(--border)",
                    borderRadius: 10, color: "var(--text)", fontSize: 14,
                    boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>

              {/* Folder tabs */}
              {folders.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {folders.map(f => (
                    <button key={f.id} onClick={() => setSelectedFolder(f.id)} style={{
                      padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", transition: "all 0.15s",
                      background: selectedFolder === f.id ? "var(--primary)" : "var(--card2)",
                      border: `1px solid ${selectedFolder === f.id ? "var(--primary)" : "var(--border)"}`,
                      color: selectedFolder === f.id ? "#fff" : "var(--secondary)",
                    }}>{f.name}</button>
                  ))}
                </div>
              )}

              {/* File list */}
              {files.length === 0 ? (
                <div style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                  No files in this folder. Upload files in the Files section.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {files.map(f => {
                    const sel = selectedFile === f.id
                    return (
                      <div key={f.id} onClick={() => setSelectedFile(f.id)} style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "12px 16px", borderRadius: 10,
                        background: sel ? "#2ECC7112" : "var(--card2)",
                        border: `1px solid ${sel ? "var(--success)" : "var(--border)"}`,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                        {/* Radio dot */}
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                          border: `2px solid ${sel ? "var(--success)" : "var(--text-dim)"}`,
                          background: sel ? "var(--success)" : "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        {/* File icon + name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, color: "var(--text)", fontWeight: 500,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{f.original_name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
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
              {/* ✅ Printer type filter — prevents mixing incompatible slicing profiles */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                  Filter by Printer Type
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["all", ...availableTypes].map(type => {
                    const active = printerTypeFilter === type
                    const label = type === "all" ? "All Types" : type === "centauri" ? "Centauri Carbon" : "Neptune (Klipper)"
                    const color = type === "centauri" ? "var(--warning)" : type === "klipper" ? "var(--primary)" : "var(--text-muted)"
                    return (
                      <button key={type} onClick={() => {
                        setPrinterTypeFilter(type)
                        setSelectedPrinters([]) // clear selection when type changes
                      }} style={{
                        padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        cursor: "pointer", transition: "all 0.15s",
                        background: active ? `${color}22` : "var(--card2)",
                        border: `1px solid ${active ? color : "var(--border)"}`,
                        color: active ? color : "var(--text-muted)",
                      }}>{label}</button>
                    )
                  })}
                </div>
                {printerTypeFilter !== "all" && (
                  <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>⚠️</span>
                    Make sure your gcode file was sliced for <strong>{printerTypeFilter === "centauri" ? "Centauri Carbon" : "Neptune"}</strong> printers
                  </div>
                )}
              </div>

              {/* Quick-select */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {idlePrinters.length} idle printer{idlePrinters.length !== 1 ? "s" : ""} available
                </div>
                {idlePrinters.length > 0 && (
                  <button onClick={selectAllIdle} style={{
                    fontSize: 12, color: "var(--primary)", background: "none",
                    border: "none", cursor: "pointer", padding: 0, fontWeight: 500,
                  }}>
                    Select all idle
                  </button>
                )}
              </div>

              {/* Selected file reminder */}
              <div style={{
                background: "var(--card2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>FILE</span>
                <span style={{
                  fontSize: 12, color: "var(--primary)", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{selectedFileName}</span>
              </div>

              {/* Idle printers */}
              {idlePrinters.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Available (Idle)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {idlePrinters.map(p => {
                      const sel = selectedPrinters.includes(p.id)
                      const typeColor = p.type === "centauri" ? "var(--warning)" : "var(--primary)"
                      const typeLabel = p.type === "centauri" ? "Centauri" : "Neptune"
                      return (
                        <div key={p.id} onClick={() => togglePrinter(p.id)} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", borderRadius: 10,
                          background: sel ? "#2ECC7112" : "var(--card2)",
                          border: `1px solid ${sel ? "var(--success)" : "var(--border)"}`,
                          cursor: "pointer", transition: "all 0.15s",
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${sel ? "var(--success)" : "var(--text-dim)"}`,
                            background: sel ? "var(--success)" : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {sel && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.ip_address}</div>
                          </div>
                          {/* ✅ Type badge on each printer row */}
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            background: `${typeColor}18`, color: typeColor,
                            border: `1px solid ${typeColor}44`,
                          }}>{typeLabel}</span>
                          <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>Idle</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Non-idle printers (greyed, not selectable) */}
              {nonIdlePrinters.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Unavailable
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {nonIdlePrinters.map(p => {
                      const typeColor = p.type === "centauri" ? "var(--warning)" : "var(--primary)"
                      const typeLabel = p.type === "centauri" ? "Centauri" : "Neptune"
                      return (
                        <div key={p.id} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", borderRadius: 10,
                          background: "var(--border-subtle)", border: "1px solid var(--border-subtle)",
                          opacity: 0.4,
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: 4,
                            border: "2px solid var(--border)", flexShrink: 0,
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 500 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{p.ip_address}</div>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            background: `${typeColor}18`, color: typeColor,
                            border: `1px solid ${typeColor}44`,
                          }}>{typeLabel}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{p.status}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {idlePrinters.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-dim)" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🖨️</div>
                  <div>No idle {printerTypeFilter !== "all" ? `${printerTypeFilter === "centauri" ? "Centauri" : "Neptune"} ` : ""}printers available right now</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 28px", borderTop: "1px solid var(--border-subtle)" }}>

          {/* Summary when on step 2 */}
          {step === 2 && selectedPrinters.length > 0 && (
            <div style={{
              background: "var(--card2)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              fontSize: 13, color: "var(--secondary)",
            }}>
              Will queue{" "}
              <strong style={{ color: "var(--success)" }}>{selectedPrinters.length} printer{selectedPrinters.length !== 1 ? "s" : ""}</strong>
              {" "}— jobs start automatically when each printer finishes its current task
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            {step === 2 && (
              <button onClick={() => setStep(1)} style={{
                padding: "9px 18px", background: "none",
                border: "1px solid var(--border)", borderRadius: 10,
                color: "var(--secondary)", cursor: "pointer", fontSize: 14,
              }}>← Back</button>
            )}
            <button onClick={onClose} style={{
              flex: step === 1 ? 1 : undefined,
              padding: "9px 18px", background: "none",
              border: "1px solid var(--border)", borderRadius: 10,
              color: "var(--secondary)", cursor: "pointer", fontSize: 14,
            }}>Cancel</button>

            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!canProceed}
                style={{
                  flex: 2, padding: "9px 0",
                  background: canProceed ? "var(--primary)" : "var(--card2)",
                  border: "none", borderRadius: 10,
                  color: canProceed ? "#fff" : "var(--text-dim)",
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
                  background: canCreate && !loading ? "var(--success)" : "var(--card2)",
                  border: "none", borderRadius: 10,
                  color: canCreate && !loading ? "#fff" : "var(--text-dim)",
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
  const [batches, setBatches]           = useState<Batch[]>([])
  const [showCreate, setShowCreate]     = useState(false)
  const [expandedId, setExpandedId]     = useState<number | null>(null)
  const [summaries, setSummaries]       = useState<Record<number, any>>({})
  const [batchPrinters, setBatchPrinters] = useState<Record<number, BatchPrinterJob[]>>({})
  const [startingBatchId, setStartingBatchId] = useState<number | null>(null)
  const [centauriStartBatch, setCentauriStartBatch] = useState<Batch | null>(null)  // batch pending plate/leveling/timelapse choice

  // ✅ Completed batches — separate collapsible section, fetched on demand
  const [showCompleted, setShowCompleted]       = useState(false)
  const [completedBatches, setCompletedBatches] = useState<Batch[]>([])
  const [loadingCompleted, setLoadingCompleted] = useState(false)

  const loadBatches = useCallback(async () => {
    const data = await apiFetch("/batches/")
    if (Array.isArray(data)) setBatches(data)
  }, [])

  const loadCompletedBatches = useCallback(async () => {
    setLoadingCompleted(true)
    const data = await apiFetch("/batches/?include_archived=true")
    if (Array.isArray(data)) {
      // Only the archived ones — active ones are already shown above
      setCompletedBatches(data.filter((b: Batch) => b.archived))
    }
    setLoadingCompleted(false)
  }, [])

  const toggleCompleted = () => {
    const next = !showCompleted
    setShowCompleted(next)
    if (next && completedBatches.length === 0) loadCompletedBatches()
  }

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

  const markComplete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Mark this batch as completed? Any still-printing jobs will be marked done.")) return
    const res = await apiFetch(`/batches/${id}/complete`, { method: "POST" })
    if (res?.detail) { alert(res.detail); return }
    loadBatches()
  }

  // Klipper/Neptune batches start immediately (unchanged behavior).
  // Centauri batches open the options modal first -- doStartBatch() below
  // is the actual request, reused by both paths.
  const startBatchClick = (batch: Batch, e: React.MouseEvent) => {
    e.stopPropagation()
    if (startingBatchId !== null) return
    if (batch.printer_type === "centauri") {
      setCentauriStartBatch(batch)
      return
    }
    doStartBatch(batch.id, {})
  }

  const confirmCentauriStart = (opts: CentauriPrintOptions) => {
    if (!centauriStartBatch) return
    const id = centauriStartBatch.id
    setCentauriStartBatch(null)
    doStartBatch(id, opts)
  }

  const doStartBatch = async (id: number, opts: Partial<CentauriPrintOptions>) => {
    setStartingBatchId(id)
    try {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams()
      if (opts.bedLeveling !== undefined) params.set("bed_leveling", String(opts.bedLeveling))
      if (opts.plateType   !== undefined) params.set("plate_type",   String(opts.plateType))
      if (opts.timeLapse   !== undefined) params.set("time_lapse",   String(opts.timeLapse))
      const qs = params.toString()
      const raw = await fetch(
        `${API_BASE}/batches/${id}/start${qs ? `?${qs}` : ""}`,
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
    if (!batchPrinters[id]) {
      const p = await apiFetch(`/batches/${id}/printers`)
      if (p) setBatchPrinters(prev => ({ ...prev, [id]: p }))
    }
  }

  const printing  = batches.filter(b => b.status === "printing").length
  const queued    = batches.filter(b => b.status === "queued").length
  const completed = batches.filter(b => b.status === "completed").length

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div style={{
        height: 52, borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 28px",
        justifyContent: "space-between", background: "var(--card)",
        position: "sticky", top: 0, zIndex: 30,
      }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Batch Management</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 12 }}>Queue files to multiple printers</span>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          background: "var(--success)", border: "none", color: "#fff",
          borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>+ Create Batch</button>
      </div>

      <div style={{ padding: "24px 28px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Total Batches", value: batches.length, accent: "var(--text-dim)" },
            { label: "Printing",      value: printing,       accent: "var(--success)" },
            { label: "Queued",        value: queued,         accent: "var(--warning)" },
            { label: "Completed",     value: completed,      accent: "var(--primary)" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: "var(--card)", borderRadius: 10, padding: "14px 18px",
              border: "1px solid var(--border)", borderTop: `2px solid ${accent}`,
            }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Batch list */}
        {batches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-dim)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <div style={{ fontSize: 18, marginBottom: 8, color: "var(--text-muted)" }}>No batches yet</div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>Create a batch to queue a file across multiple printers</div>
            <button onClick={() => setShowCreate(true)} style={{
              background: "var(--success)", border: "none", color: "#fff",
              borderRadius: 10, padding: "9px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>+ Create your first batch</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {batches.map(batch => {
              const isExpanded = expandedId === batch.id
              const summary    = summaries[batch.id]
              return (
                <div key={batch.id} style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 10, overflow: "hidden",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px", cursor: "pointer",
                  }} onClick={() => toggleExpand(batch.id)}>
                    <div style={{
                      color: "var(--text-dim)", fontSize: 11,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s", flexShrink: 0,
                    }}>▶</div>
                    {/* ✅ Serial number badge instead of raw DB id */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 10, flexShrink: 0,
                      background: "var(--card2)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "var(--text-muted)",
                    }}>#{batch.serial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{batch.name}</span>
                        <StatusPill status={batch.status} />
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {batch.file_name}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(batch.created_at)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{toISTDate(batch.created_at)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {(batch.status === "queued" || batch.status === "empty") && (
                        <button
                          onClick={e => startBatchClick(batch, e)}
                          disabled={startingBatchId === batch.id}
                          style={{
                            background: startingBatchId === batch.id ? "var(--card2)" : "#2ECC7118",
                            border: `1px solid ${startingBatchId === batch.id ? "var(--border)" : "var(--success)"}`,
                            color: startingBatchId === batch.id ? "var(--text-muted)" : "var(--success)",
                            borderRadius: 10, padding: "4px 12px", fontSize: 12, fontWeight: 600,
                            cursor: startingBatchId === batch.id ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", gap: 6, minWidth: 90, justifyContent: "center",
                          }}
                        >
                          {startingBatchId === batch.id ? (
                            <>
                              <span style={{
                                display: "inline-block", width: 10, height: 10,
                                border: "2px solid var(--text-muted)", borderTopColor: "var(--success)",
                                borderRadius: "50%", animation: "spin 0.7s linear infinite",
                              }} />
                              Sending…
                            </>
                          ) : "▶ Start"}
                        </button>
                      )}
                      {/* ✅ Manual complete — visible for printing/queued batches that got stuck */}
                      {(batch.status === "printing" || batch.status === "queued") && (
                        <button
                          onClick={e => markComplete(batch.id, e)}
                          style={{
                            background: "#4FA3FF18", border: "1px solid var(--primary)",
                            color: "var(--primary)", borderRadius: 10, padding: "4px 10px",
                            fontSize: 12, fontWeight: 600, cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          title="Manually mark this batch as completed"
                        >✓ Done</button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); deleteBatch(batch.id) }}
                        style={{
                          background: "none", border: "1px solid var(--border)",
                          color: "var(--text-muted)", borderRadius: 10, padding: "4px 10px",
                          fontSize: 12, cursor: "pointer",
                        }}
                      >Delete</button>
                    </div>
                  </div>

                  {isExpanded && summary && (
                    <div style={{
                      borderTop: "1px solid var(--border)", padding: "12px 20px 14px 48px",
                      background: "var(--card2)",
                    }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Summary</div>
                      <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                        {[
                          { label: "Total",     value: summary.total,     color: "var(--secondary)" },
                          { label: "Completed", value: summary.completed, color: "var(--success)" },
                          { label: "Queued",    value: summary.queued,    color: "var(--warning)" },
                          { label: "Failed",    value: summary.failed,    color: "var(--danger)" },
                          { label: "Skipped",   value: summary.skipped,   color: "#4FA3FF" },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* ✅ Printer breakdown — which printers got this batch + their status */}
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                        Printers in this Batch
                      </div>
                      {!batchPrinters[batch.id] ? (
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading…</div>
                      ) : batchPrinters[batch.id].length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No printers found</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {batchPrinters[batch.id].map(p => (
                            <div key={p.job_id} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              background: "var(--card)", border: "1px solid var(--border)",
                              borderRadius: 10, padding: "8px 14px",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{p.printer_name}</span>
                                {p.progress !== null && (
                                  <span style={{ fontSize: 11, color: "var(--success)" }}>{p.progress.toFixed(1)}%</span>
                                )}
                              </div>
                              <JobStatusPill status={p.job_status} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ✅ Completed Batches — collapsible, fetched only when opened */}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={toggleCompleted}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "12px 18px", cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--card)")}
          >
            <span style={{
              fontSize: 11, color: "var(--text-dim)",
              transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}>▶</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              Completed Batches
            </span>
            {completedBatches.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
                background: "var(--card2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "1px 8px",
              }}>{completedBatches.length}</span>
            )}
          </button>

          {showCompleted && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {loadingCompleted ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)", fontSize: 13 }}>
                  Loading…
                </div>
              ) : completedBatches.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)", fontSize: 13 }}>
                  No completed batches yet
                </div>
              ) : (
                completedBatches.map(batch => (
                  <div key={batch.id} style={{
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 10, padding: "12px 18px",
                    display: "flex", alignItems: "center", gap: 14, opacity: 0.75,
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 10, flexShrink: 0,
                      background: "var(--card2)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "var(--text-dim)",
                    }}>#{batch.serial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>{batch.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {batch.file_name}
                      </div>
                    </div>
                    <StatusPill status="completed" />
                    <div style={{ fontSize: 11, color: "var(--text-dim)", flexShrink: 0 }}>{toISTDate(batch.created_at)}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateBatchModal onClose={() => setShowCreate(false)} onCreated={loadBatches} />
      )}

      {centauriStartBatch && (
        <CentauriPrintOptionsModal
          fileName={centauriStartBatch.file_name}
          printerLabel={centauriStartBatch.name}
          loading={startingBatchId === centauriStartBatch.id}
          onCancel={() => setCentauriStartBatch(null)}
          onConfirm={confirmCentauriStart}
        />
      )}
    </div>
  )
}

export default Batches