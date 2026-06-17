import { useEffect, useState, useCallback, useRef } from "react"
import { Routes, Route, Link, useLocation } from "react-router-dom"
import Files from "./Files"
import AddPrinter from "./AddPrinter"
import Login from "./Login"
import ProtectedRoute from "./ProtectedRoute"
import { getUserRole } from "./utils/auth"
import Batches from "./Batches"
import PrinterManagement from "./PrinterManagement"
import UserManagement from "./UserManagement"
import PrintHistory from "./PrintHistory"
import { useTheme } from "./theme"

// ✅ Relative URL: works from any IP/network automatically
// When served via Docker (production), frontend and backend are on the same host+port
// When running dev (npm run dev), set VITE_API_BASE=http://192.168.11.XXX:8000 in .env
const API_BASE = import.meta.env.VITE_API_BASE || ""

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Printer {
  id: number; name: string; status: string; progress: number
  current_file: string | null; camera_url?: string
  ip_address?: string; type?: string
  bed_temp?: number | null; bed_target?: number | null
  extruder_temp?: number | null; extruder_target?: number | null
  eta_seconds?: number | null
}
interface QueueItem { id: number; printer_id: number; batch_id: number; batch_name: string; status: string; position: number }
interface Analytics {
  today_prints: number; week_prints: number; success_rate: number
  avg_print_time_minutes: number | null; active_printers: number
}

function fmtETA(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return ""
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `~${h}h ${m}m left`
  if (m > 0) return `~${m}m left`
  return "< 1m left"
}

// ─── CSS Variables (defined in theme.tsx, applied here as inline fallbacks) ──

const S = {
  bg:      "var(--bg,#050d1a)",
  card:    "var(--card,#0a1628)",
  card2:   "var(--card2,#0d1e35)",
  border:  "var(--border,#1a3a5c)",
  borderS: "var(--border-subtle,#0f1f35)",
  text:    "var(--text,#f1f5f9)",
  muted:   "var(--text-muted,#4a6080)",
  dim:     "var(--text-dim,#2a4060)",
  hover:   "var(--hover,#0d1e35)",
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ printers }: { printers: Printer[] }) {
  const role     = getUserRole()
  const location = useLocation()
  const { theme, toggle } = useTheme()

  const printing = printers.filter(p => p.status === "printing").length
  const idle     = printers.filter(p => p.status === "idle").length
  const offline  = printers.filter(p => p.status === "offline").length
  const total    = printers.length

  const navItems = [
    { path: "/",                icon: "⬡",  label: "Dashboard" },
    { path: "/files",           icon: "⊞",  label: "Files" },
    { path: "/batches",         icon: "▤",  label: "Batches" },
    { path: "/printers/manage", icon: "⊟",  label: "Printers" },
    { path: "/history",         icon: "◷",  label: "History" },
    ...(role === "admin" ? [{ path: "/users/manage", icon: "⊙", label: "Users" }] : []),
  ]

  return (
    <div style={{
      width: 220, minHeight: "100vh", background: S.card,
      borderRight: `1px solid ${S.border}`,
      display: "flex", flexDirection: "column",
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${S.border}` }}>
        <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
          Farm Control
        </div>
        <div style={{ fontSize: 10, color: S.muted, marginTop: 2, letterSpacing: 0.5 }}>
          3D Production Platform
        </div>
      </div>

      {/* Farm Pulse — signature element */}
      {total > 0 && (
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.borderS}` }}>
          <div style={{ fontSize: 9, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            Farm Pulse
          </div>
          <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 6, gap: 1 }}>
            {printing > 0 && (
              <div style={{
                flex: printing, background: "#10b981",
                boxShadow: "0 0 6px #10b98166",
              }} />
            )}
            {idle > 0 && (
              <div style={{ flex: idle, background: "#2563eb" }} />
            )}
            {offline > 0 && (
              <div style={{ flex: offline, background: S.dim }} />
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {[
              { label: "printing", count: printing, color: "#10b981" },
              { label: "idle",     count: idle,     color: "#2563eb" },
              { label: "offline",  count: offline,  color: S.muted  },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: S.muted }}>{count} {label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
        {navItems.map(({ path, icon, label }) => {
          const active = location.pathname === path
          return (
            <Link key={path} to={path} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 7, marginBottom: 2,
              textDecoration: "none", transition: "all 0.15s",
              background: active ? "#2563eb18" : "none",
              border: `1px solid ${active ? "#2563eb44" : "transparent"}`,
            }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = S.hover }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "none" }}
            >
              <span style={{ fontSize: 14, color: active ? "#2563eb" : S.muted, width: 18, textAlign: "center" }}>
                {icon}
              </span>
              <span style={{
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? S.text : S.muted,
              }}>{label}</span>
              {active && (
                <div style={{
                  marginLeft: "auto", width: 4, height: 4, borderRadius: "50%",
                  background: "#2563eb", boxShadow: "0 0 6px #2563eb",
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: theme + user */}
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${S.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: S.muted }}>Theme</span>
          <button onClick={toggle} style={{
            background: S.card2, border: `1px solid ${S.border}`,
            color: S.muted, borderRadius: 6, padding: "3px 8px",
            fontSize: 13, cursor: "pointer", lineHeight: 1,
          }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <button onClick={() => { localStorage.removeItem("token"); window.location.href = "/login" }}
          style={{
            width: "100%", padding: "7px 0", background: "none",
            border: `1px solid ${S.border}`, borderRadius: 6,
            color: S.muted, fontSize: 12, cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "#ef4444"
            ;(e.currentTarget as HTMLElement).style.color = "#ef4444"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = S.border
            ;(e.currentTarget as HTMLElement).style.color = S.muted
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

// ─── Printer Tray ─────────────────────────────────────────────────────────────

function PrinterTray({ printer, onClose, onRefresh }: {
  printer: Printer; onClose: () => void; onRefresh: () => void
}) {
  const [queue, setQueue]   = useState<QueueItem[]>([])
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

  const printerCmd = async (cmd: "pause" | "resume" | "cancel") => {
    setLoading(true)
    const res = await apiFetch(`/printers/${printer.id}/${cmd}`, { method: "POST" })
    if (res?.detail) alert(res.detail)
    else onRefresh()
    setLoading(false)
  }

  const startNext = async () => {
    setLoading(true)
    const res = await apiFetch(`/printers/${printer.id}/start_next`, { method: "POST" })
    if (res?.detail) alert(res.detail)
    else { onRefresh(); loadQueue() }
    setLoading(false)
  }

  const skipJob   = async (id: number) => { await apiFetch(`/batches/job/${id}/skip`,   { method: "POST" }); loadQueue() }
  const cancelJob = async (id: number) => { await apiFetch(`/batches/job/${id}/cancel`, { method: "POST" }); loadQueue() }

  const isPrinting = printer.status === "printing"
  const isPaused   = printer.status === "paused"
  const isIdle     = printer.status === "idle"
  const isActive   = isPrinting || isPaused

  const statusColor: Record<string, string> = {
    printing: "#10b981", paused: "#f59e0b", idle: "#2563eb", offline: "#ef4444"
  }
  const dotColor = statusColor[printer.status] ?? S.muted

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 360, height: "100vh",
      background: S.card, borderLeft: `1px solid ${S.border}`,
      zIndex: 50, display: "flex", flexDirection: "column",
      boxShadow: "-12px 0 40px rgba(0,0,0,0.5)",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Printer</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: S.text }}>{printer.name}</h2>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: S.muted,
            fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1,
          }}>✕</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 8px ${dotColor}`, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: dotColor, fontWeight: 600, textTransform: "capitalize" }}>{printer.status}</span>
          {isActive && <span style={{ fontSize: 12, color: S.muted }}>— {printer.progress.toFixed(1)}%</span>}
        </div>
        {isActive && (
          <div style={{ marginTop: 10 }}>
            <div style={{ background: S.card2, borderRadius: 3, height: 4, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${printer.progress}%`, height: "100%",
                background: isPaused ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#10b981,#34d399)",
                transition: "width 1s ease", borderRadius: 3,
              }} />
            </div>
            {printer.current_file && (
              <div style={{ fontSize: 11, color: S.muted, marginTop: 5, wordBreak: "break-all" }}>{printer.current_file}</div>
            )}
          </div>
        )}
      </div>

      {/* Temps + ETA */}
      {(printer.extruder_temp || printer.bed_temp) && (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Temperatures</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Extruder", temp: printer.extruder_temp, target: printer.extruder_target, color: "#f59e0b" },
              { label: "Bed",      temp: printer.bed_temp,      target: printer.bed_target,      color: "#2563eb" },
            ].map(({ label, temp, target, color }) => (
              <div key={label} style={{
                background: S.card2, borderRadius: 8, padding: "10px 12px",
                border: `1px solid ${S.border}`,
              }}>
                <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
                  {temp?.toFixed(0) ?? "—"}°
                </div>
                <div style={{ fontSize: 10, color: S.muted }}>target {target?.toFixed(0) ?? "—"}°</div>
                {temp && target && target > 0 && (
                  <div style={{ marginTop: 6, background: S.border, borderRadius: 2, height: 2 }}>
                    <div style={{
                      width: `${Math.min(100,(temp/target)*100)}%`, height: "100%",
                      background: color, borderRadius: 2, transition: "width 1s ease",
                    }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {printer.eta_seconds && printer.eta_seconds > 0 && (
            <div style={{
              marginTop: 10, background: "#10b98110", border: "1px solid #10b98130",
              borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>⏱</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{fmtETA(printer.eta_seconds)}</div>
                <div style={{ fontSize: 10, color: S.muted }}>estimated remaining</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Job Controls */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}` }}>
        <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Controls</div>
        {printer.status === "offline" && <div style={{ fontSize: 12, color: "#ef4444" }}>Printer is offline</div>}
        {isPaused && (
          <div style={{ display: "flex", gap: 8 }}>
            <TBtn onClick={() => printerCmd("resume")} color="#10b981" disabled={loading}>▶ Resume</TBtn>
            <TBtn onClick={() => printerCmd("cancel")} color="#ef4444" disabled={loading}>✕ Cancel</TBtn>
          </div>
        )}
        {isPrinting && (
          <div style={{ display: "flex", gap: 8 }}>
            <TBtn onClick={() => printerCmd("pause")}  color="#f59e0b" disabled={loading}>⏸ Pause</TBtn>
            <TBtn onClick={() => printerCmd("cancel")} color="#ef4444" disabled={loading}>✕ Cancel</TBtn>
          </div>
        )}
        {isIdle && (
          <TBtn onClick={startNext} color="#2563eb" disabled={loading || queue.length === 0}>
            {queue.length === 0 ? "Queue empty" : "▶ Start Next Job"}
          </TBtn>
        )}
      </div>

      {/* Queue */}
      <div style={{ padding: "14px 20px", flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
          Queue ({queue.length})
        </div>
        {queue.length === 0 ? (
          <div style={{ fontSize: 12, color: S.dim, textAlign: "center", marginTop: 24 }}>No jobs queued</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {queue.map((job, idx) => (
              <div key={job.id} style={{
                background: S.card2, borderRadius: 8, padding: "10px 12px",
                border: `1px solid ${S.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 11, color: S.muted }}>Position {idx+1}</div>
                  <div style={{ fontSize: 13, color: S.text, fontWeight: 500 }}>Batch — {job.batch_name}</div>
                  <div style={{ fontSize: 10, marginTop: 2, color: job.status === "waiting_confirmation" ? "#f59e0b" : S.muted }}>
                    {job.status}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {isPrinting && idx === 0 && <TBtn onClick={() => skipJob(job.id)} color="#f59e0b" small>Skip</TBtn>}
                  <TBtn onClick={() => cancelJob(job.id)} color="#ef4444" small>✕</TBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TBtn({ onClick, color, disabled, children, small }: {
  onClick: () => void; color: string; disabled?: boolean; children: React.ReactNode; small?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? S.card2 : `${color}18`,
      border: `1px solid ${disabled ? S.border : color}`,
      color: disabled ? S.muted : color,
      borderRadius: 6, padding: small ? "3px 10px" : "6px 14px",
      fontSize: small ? 11 : 12, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}>{children}</button>
  )
}

// ─── Add Printer Modal ────────────────────────────────────────────────────────

function AddPrinterModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState(""); const [ip, setIp] = useState("")
  const [type, setType] = useState("klipper"); const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name || !ip) { alert("Fill all fields"); return }
    setLoading(true)
    try {
      const res = await apiFetch("/printers/", { method: "POST", body: JSON.stringify({ name, ip_address: ip, type }) })
      if (res?.detail) { alert(res.detail); setLoading(false); return }
      onAdded(); onClose()
    } catch { alert("Failed") }
    setLoading(false)
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:60 }}>
      <div style={{ background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:28,width:360,boxShadow:"0 24px 64px rgba(0,0,0,0.7)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:S.text }}>Add Printer</h2>
          <button onClick={onClose} style={{ background:"none",border:"none",color:S.muted,fontSize:18,cursor:"pointer" }}>✕</button>
        </div>
        {[{label:"Name",val:name,set:setName,ph:"Neptune-7"},{label:"IP Address",val:ip,set:setIp,ph:"192.168.68.70"}].map(({label,val,set,ph})=>(
          <div key={label} style={{ marginBottom:14 }}>
            <label style={{ display:"block",fontSize:10,color:S.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:1.5 }}>{label}</label>
            <input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{
              width:"100%",padding:"8px 12px",background:S.card2,border:`1px solid ${S.border}`,
              borderRadius:6,color:S.text,fontSize:14,boxSizing:"border-box",outline:"none",
            }} />
          </div>
        ))}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block",fontSize:10,color:S.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:1.5 }}>Type</label>
          <select value={type} onChange={e=>setType(e.target.value)} style={{
            width:"100%",padding:"8px 12px",background:S.card2,border:`1px solid ${S.border}`,
            borderRadius:6,color:S.text,fontSize:14,
          }}>
            <option value="klipper">Neptune (Klipper/Moonraker)</option>
            <option value="centauri">Centauri Carbon</option>
          </select>
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:"8px 0",background:"none",border:`1px solid ${S.border}`,borderRadius:6,color:S.muted,cursor:"pointer",fontSize:13 }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex:2,padding:"8px 0",background:loading?"#1e293b":"#2563eb",border:"none",borderRadius:6,color:"#fff",cursor:loading?"not-allowed":"pointer",fontWeight:600,fontSize:13 }}>
            {loading?"Adding…":"Add Printer"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string,{bg:string;color:string}> = {
    printing: {bg:"#10b98118",color:"#10b981"},
    paused:   {bg:"#f59e0b18",color:"#f59e0b"},
    idle:     {bg:"#2563eb18",color:"#2563eb"},
    offline:  {bg:"#ef444418",color:"#ef4444"},
  }
  const {bg,color} = cfg[status] ?? {bg:"#64748b18",color:"#64748b"}
  return (
    <span style={{
      background:bg,color,border:`1px solid ${color}33`,
      borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,
    }}>{status}</span>
  )
}

// ─── Printer Card ─────────────────────────────────────────────────────────────

function PrinterCard({ printer, selected, onClick, onDelete, role }: {
  printer: Printer; selected: boolean; onClick: () => void
  onDelete: () => void; role: string | null
}) {
  const [hov, setHov] = useState(false)
  const accent: Record<string,string> = { printing:"#10b981",paused:"#f59e0b",idle:"#2563eb",offline:"#1a3a5c" }
  const col = accent[printer.status] ?? "#1a3a5c"
  const isPrinting = printer.status === "printing"
  const isPaused   = printer.status === "paused"

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? S.card2 : hov ? S.hover : S.card,
        border: `1px solid ${selected ? col : hov ? S.border : S.borderS}`,
        borderRadius: 10, padding: "14px 16px",
        cursor: "pointer", transition: "all 0.15s",
        boxShadow: selected ? `0 0 0 1px ${col}33, 0 4px 20px rgba(0,0,0,0.3)` : "none",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Active print shimmer */}
      {isPrinting && (
        <div style={{
          position:"absolute",top:0,left:0,right:0,height:2,
          background:"linear-gradient(90deg,transparent,#10b981,transparent)",
          animation:"shimmer 2s infinite",
        }} />
      )}

      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
        <div style={{ fontSize:13,fontWeight:600,color:S.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8 }}>
          {printer.name}
        </div>
        <StatusPill status={printer.status} />
      </div>

      {/* File */}
      <div style={{ fontSize:10,color:S.muted,minHeight:13,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
        {(isPrinting || isPaused) && printer.current_file ? printer.current_file : printer.status === "offline" ? "" : "Ready"}
      </div>

      {/* Progress */}
      {(isPrinting || isPaused) && (
        <>
          <div style={{ background:S.card2,borderRadius:2,height:3,overflow:"hidden",marginBottom:4 }}>
            <div style={{
              width:`${printer.progress}%`,height:"100%",
              background: isPaused ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#10b981,#34d399)",
              transition:"width 1s ease",
            }} />
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:11,color:isPaused?"#f59e0b":"#10b981",fontWeight:600,fontVariantNumeric:"tabular-nums" }}>
              {printer.progress.toFixed(1)}%
            </span>
            {printer.eta_seconds && printer.eta_seconds > 0 && (
              <span style={{ fontSize:10,color:S.muted }}>{fmtETA(printer.eta_seconds)}</span>
            )}
          </div>
        </>
      )}

      {/* Inline temps when printing */}
      {isPrinting && printer.extruder_temp && (
        <div style={{ display:"flex",gap:10,marginTop:8,paddingTop:8,borderTop:`1px solid ${S.borderS}` }}>
          <span style={{ fontSize:10,color:"#f59e0b",fontVariantNumeric:"tabular-nums" }}>
            🔥 {printer.extruder_temp.toFixed(0)}°
          </span>
          <span style={{ fontSize:10,color:"#2563eb",fontVariantNumeric:"tabular-nums" }}>
            ☐ {printer.bed_temp?.toFixed(0) ?? "—"}°
          </span>
        </div>
      )}

      {/* Delete — admin only, subtle */}
      {role === "admin" && (hov || selected) && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position:"absolute",bottom:8,right:8,background:"none",border:"none",
            color:S.dim,fontSize:12,cursor:"pointer",padding:2,lineHeight:1,
            transition:"color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color="#ef4444")}
          onMouseLeave={e => (e.currentTarget.style.color=S.dim)}
          title="Delete printer"
        >🗑</button>
      )}
    </div>
  )
}

// ─── App & Routes ─────────────────────────────────────────────────────────────

function App() {
  const [printers, setPrinters] = useState<Printer[]>([])

  const loadPrinters = useCallback(async () => {
    const data = await apiFetch("/printers/")
    if (data) setPrinters(data)
  }, [])

  useEffect(() => {
    loadPrinters()
    const i = setInterval(loadPrinters, 4000)
    return () => clearInterval(i)
  }, [loadPrinters])

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border,#1a3a5c); border-radius: 2px; }
        body { margin: 0; background: var(--bg,#050d1a); }
      `}</style>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/"                element={<ProtectedRoute><AppShell printers={printers}><Dashboard printers={printers} loadPrinters={loadPrinters} /></AppShell></ProtectedRoute>} />
        <Route path="/files"           element={<ProtectedRoute><AppShell printers={printers}><Files /></AppShell></ProtectedRoute>} />
        <Route path="/add-printer"     element={<ProtectedRoute><AppShell printers={printers}><AddPrinter /></AppShell></ProtectedRoute>} />
        <Route path="/batches"         element={<ProtectedRoute><AppShell printers={printers}><Batches /></AppShell></ProtectedRoute>} />
        <Route path="/printers/manage" element={<ProtectedRoute><AppShell printers={printers}><PrinterManagement /></AppShell></ProtectedRoute>} />
        <Route path="/users/manage"    element={<ProtectedRoute><AppShell printers={printers}><UserManagement /></AppShell></ProtectedRoute>} />
        <Route path="/history"         element={<ProtectedRoute><AppShell printers={printers}><PrintHistory /></AppShell></ProtectedRoute>} />
      </Routes>
    </>
  )
}

// ─── AppShell — sidebar + content layout ─────────────────────────────────────

function AppShell({ children, printers }: {
  children: React.ReactNode; printers: Printer[]
}) {
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:S.bg, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <Sidebar printers={printers} />
      <div style={{ marginLeft:220, flex:1, minWidth:0 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ printers, loadPrinters }: { printers: Printer[]; loadPrinters: () => void }) {
  const role = getUserRole()
  const [analytics, setAnalytics]           = useState<Analytics | null>(null)
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null)
  const [showAddModal, setShowAddModal]       = useState(false)

  const selectedPrinterRef = useRef<Printer | null>(null)
  selectedPrinterRef.current = selectedPrinter

  // Keep tray in sync with live data
  useEffect(() => {
    const cur = selectedPrinterRef.current
    if (cur) {
      const updated = printers.find(p => p.id === cur.id)
      if (updated) setSelectedPrinter(updated)
    }
  }, [printers])

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
      method:"DELETE", headers:{ Authorization:`Bearer ${token}` }
    })
    if (!res.ok) { const d = await res.json(); alert(d.detail || "Delete failed"); return }
    if (selectedPrinter?.id === id) setSelectedPrinter(null)
    loadPrinters()
  }

  const total    = printers.length
  const printing = printers.filter(p=>p.status==="printing").length
  const paused   = printers.filter(p=>p.status==="paused").length
  const idle     = printers.filter(p=>p.status==="idle").length
  const offline  = printers.filter(p=>p.status==="offline").length

  return (
    <div style={{ minHeight:"100vh", background:S.bg, color:S.text }}>
      {/* Top bar */}
      <div style={{
        height:52, borderBottom:`1px solid ${S.border}`,
        display:"flex",alignItems:"center",padding:"0 28px",
        justifyContent:"space-between", background:S.card,
        position:"sticky",top:0,zIndex:30,
      }}>
        <div>
          <span style={{ fontSize:15,fontWeight:700,color:S.text }}>Production Overview</span>
          <span style={{ fontSize:12,color:S.muted,marginLeft:12 }}>
            {printing > 0 ? `${printing} printer${printing>1?"s":""} active` : "All printers idle"}
          </span>
        </div>
        {role === "admin" && (
          <button onClick={()=>setShowAddModal(true)} style={{
            background:"#2563eb",border:"none",color:"#fff",
            borderRadius:7,padding:"7px 16px",fontSize:13,fontWeight:600,cursor:"pointer",
            display:"flex",alignItems:"center",gap:6,
          }}>
            <span style={{fontSize:16,lineHeight:1}}>+</span> Add Printer
          </button>
        )}
      </div>

      <div style={{ padding:"24px 28px" }}>
        {/* KPI row */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(6,1fr)",
          gap:10, marginBottom:24,
        }}>
          {[
            {label:"Fleet",         value:total,    accent:"#4a6080",  sub:"printers"},
            {label:"Printing",      value:printing, accent:"#10b981",  sub:"active now"},
            {label:"Paused",        value:paused,   accent:"#f59e0b",  sub:"on hold"},
            {label:"Idle",          value:idle,     accent:"#2563eb",  sub:"ready"},
            {label:"Offline",       value:offline,  accent:"#ef4444",  sub:"unreachable"},
            {label:"Success Rate",  value:analytics?`${analytics.success_rate}%`:"—", accent:"#8b5cf6", sub:"all time"},
          ].map(({label,value,accent,sub})=>(
            <div key={label} style={{
              background:S.card, borderRadius:10, padding:"14px 16px",
              border:`1px solid ${S.border}`,
              borderTop:`2px solid ${accent}`,
            }}>
              <div style={{fontSize:10,color:S.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>{label}</div>
              <div style={{fontSize:24,fontWeight:700,color:accent,fontVariantNumeric:"tabular-nums"}}>{value}</div>
              <div style={{fontSize:10,color:S.dim,marginTop:3}}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Analytics row */}
        {analytics && (
          <div style={{
            display:"grid",gridTemplateColumns:"repeat(3,1fr)",
            gap:10,marginBottom:24,
          }}>
            {[
              {label:"Today's Prints",  value:analytics.today_prints,  unit:"jobs",    color:"#10b981"},
              {label:"This Week",       value:analytics.week_prints,   unit:"jobs",    color:"#2563eb"},
              {label:"Avg Print Time",  value:analytics.avg_print_time_minutes?`${analytics.avg_print_time_minutes}m`:"—", unit:"minutes", color:"#8b5cf6"},
            ].map(({label,value,color})=>(
              <div key={label} style={{
                background:S.card,borderRadius:10,padding:"14px 20px",
                border:`1px solid ${S.border}`,
                display:"flex",alignItems:"center",gap:16,
              }}>
                <div style={{
                  width:36,height:36,borderRadius:8,
                  background:`${color}18`,border:`1px solid ${color}33`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:16,flexShrink:0,
                }}>📊</div>
                <div>
                  <div style={{fontSize:10,color:S.muted,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>{label}</div>
                  <div style={{fontSize:20,fontWeight:700,color,fontVariantNumeric:"tabular-nums"}}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Printer grid */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",
          gap:10,
          marginRight: selectedPrinter ? 376 : 0,
          transition:"margin-right 0.2s ease",
        }}>
          {printers.map(printer => (
            <PrinterCard
              key={printer.id}
              printer={printer}
              selected={selectedPrinter?.id === printer.id}
              onClick={() => setSelectedPrinter(selectedPrinter?.id===printer.id ? null : printer)}
              onDelete={() => deletePrinter(printer.id)}
              role={role}
            />
          ))}
          {printers.length === 0 && (
            <div style={{gridColumn:"1/-1",textAlign:"center",padding:"80px 0",color:S.dim}}>
              <div style={{fontSize:40,marginBottom:16}}>🖨️</div>
              <div style={{fontSize:16,marginBottom:6,color:S.muted}}>No printers yet</div>
              {role==="admin" && (
                <button onClick={()=>setShowAddModal(true)} style={{
                  background:"#2563eb",border:"none",color:"#fff",
                  borderRadius:7,padding:"8px 20px",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8,
                }}>+ Add first printer</button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedPrinter && (
        <PrinterTray printer={selectedPrinter} onClose={()=>setSelectedPrinter(null)} onRefresh={loadPrinters} />
      )}
      {showAddModal && (
        <AddPrinterModal onClose={()=>setShowAddModal(false)} onAdded={loadPrinters} />
      )}

      {/* Watermark */}
      <div style={{
        position: "fixed", bottom: 14, right: 16,
        fontSize: 11, color: "var(--text-dim,#2a4060)",
        fontFamily: "'Inter',system-ui,sans-serif",
        letterSpacing: 0.3, userSelect: "none",
        pointerEvents: "none", zIndex: 100,
      }}>
        Made by Ashwit ❤️
      </div>
    </div>
  )
}

export default App