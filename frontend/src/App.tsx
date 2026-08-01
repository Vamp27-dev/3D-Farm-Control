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
import AddPrinterModal from "./AddPrinterModal"
import PrinterIcon from "./PrinterIcon"
import CentauriPrintOptionsModal, { type CentauriPrintOptions } from "./CentauriPrintOptionsModal"
import Button from "./Button"
import {
  IconDashboard, IconFiles, IconBatch, IconPrinter, IconHistory, IconUsers,
  IconPlay, IconPause, IconPower, IconAlert, IconCheck,
  IconThermometer, IconBed, IconLightOn, IconLightOff, IconSnowflake,
  IconX, IconPin, IconSun, IconMoon, IconLogout, IconTrash, IconSpool,
  IconCamera, IconSearch, IconChart, IconChevronRight, IconPlus,
} from "./Icons"
import EngineeringBackground from "./EngineeringBackground"

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
  error_message?: string | null; filament_detected?: boolean | null
  light_on?: boolean | null
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
  bg:      "var(--bg,#11151B)",
  card:    "var(--card,#171B22)",
  card2:   "var(--card2,#20262F)",
  border:  "var(--border,rgba(255,255,255,0.07))",
  borderS: "var(--border-subtle,rgba(255,255,255,0.05))",
  text:    "var(--text,#E7E9EC)",
  muted:   "var(--text-muted,#9AA1AC)",
  dim:     "var(--text-dim,#767E8A)",
  hover:   "var(--hover,#1c212a)",

  // ✅ Status-only color discipline: these five map directly onto machine
  // state and are used ONLY for that purpose. #4FA3FF (primary/info) is
  // the sole neutral interactive accent (focus rings, links, active nav
  // marker) — everything else in the UI stays neutral gray.
  primary:      "var(--primary,#4FA3FF)",
  primaryHover: "var(--primary-hover,#3a8fe0)",
  secondary:    "var(--secondary,#9AA1AC)",
  accent:       "var(--accent,#4FA3FF)",
  info:         "var(--info,#4FA3FF)",
  running:      "var(--running,#2ECC71)",
  success:      "var(--success,#2ECC71)",
  printingCol:  "var(--printing,#4FA3FF)",
  paused:       "var(--paused,#F5B041)",
  warning:      "var(--warning,#FF8C42)",
  danger:       "var(--error,#E74C3C)",
  dangerHover:  "var(--danger-hover,#cf3a2e)",
  offline:      "var(--offline,#7F8C8D)",
  divider:      "var(--divider,rgba(255,255,255,0.05))",
  selected:     "var(--selected,#4FA3FF1a)",
  disabled:     "var(--disabled,#20262F)",
  disabledText: "var(--disabled-text,#5c6370)",

  // ✅ Sidebar — same neutral dark panel in both themes, no gradient.
  sidebar:      "var(--sidebar,#14181F)",
  sidebar2:     "var(--sidebar-2,#1b2028)",
  sidebarBorder:"var(--sidebar-border,rgba(255,255,255,0.06))",
  sidebarText:  "var(--sidebar-text,#8b93a0)",
  sidebarTextActive: "var(--sidebar-text-active,#F2F3F5)",
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const SB_COLLAPSED = 76
const SB_EXPANDED  = 220

function Sidebar({ printers, pinned, setPinned }: {
  printers: Printer[]; pinned: boolean; setPinned: (v: boolean) => void
}) {
  const role     = getUserRole()
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const [hovering, setHovering] = useState(false)
  const expanded = pinned || hovering

  const printing = printers.filter(p => p.status === "printing").length
  const idle     = printers.filter(p => p.status === "idle").length
  const offline  = printers.filter(p => p.status === "offline").length
  const total    = printers.length

  const navItems = [
    { path: "/",                icon: <IconDashboard size={15} strokeWidth={1.6} />, label: "Dashboard" },
    { path: "/files",           icon: <IconFiles size={15} strokeWidth={1.6} />,     label: "Files" },
    { path: "/batches",         icon: <IconBatch size={15} strokeWidth={1.6} />,     label: "Batches" },
    { path: "/manage/printers", icon: <IconPrinter size={15} strokeWidth={1.6} />,   label: "Printers" },
    { path: "/history",         icon: <IconHistory size={15} strokeWidth={1.6} />,   label: "History" },
    ...(role === "admin" ? [{ path: "/manage/users", icon: <IconUsers size={15} strokeWidth={1.6} />, label: "Users" }] : []),
  ]

  // ✅ Label wrapper: fades + collapses smoothly instead of just vanishing,
  // so the expand/collapse reads as one continuous motion rather than text
  // popping in/out.
  const label = (text: string, extraStyle: React.CSSProperties = {}) => (
    <span style={{
      opacity: expanded ? 1 : 0,
      maxWidth: expanded ? 160 : 0,
      overflow: "hidden", whiteSpace: "nowrap",
      transition: "opacity 180ms ease, max-width 260ms cubic-bezier(0.4,0,0.2,1)",
      ...extraStyle,
    }}>{text}</span>
  )

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        width: expanded ? SB_EXPANDED : SB_COLLAPSED,
        minHeight: "100vh", background: S.sidebar,
        borderRight: `1px solid ${S.sidebarBorder}`,
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: "hidden",
        transition: "width 260ms cubic-bezier(0.4,0,0.2,1), box-shadow 260ms ease",
        boxShadow: (hovering && !pinned) ? "8px 0 32px rgba(0,0,0,0.35)" : "none",
      }}
    >
      {/* Logo + pin toggle */}
      <div style={{
        padding: "20px 0 16px", borderBottom: `1px solid ${S.sidebarBorder}`,
        display: "flex", alignItems: "center", gap: 10,
        paddingLeft: expanded ? 20 : 23, paddingRight: expanded ? 16 : 0,
        transition: "padding 260ms cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: S.card2, border: `1px solid ${S.sidebarBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: S.primary,
        }}><IconPrinter size={15} strokeWidth={1.7} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {label("Farm Control", { display: "block", fontSize: 12.5, color: "#fff", fontWeight: 700, letterSpacing: 0.3 })}
          {label("3D Production Platform", { display: "block", fontSize: 9.5, color: S.sidebarText, marginTop: 1, letterSpacing: 0.2 })}
        </div>
        {/* ✅ Pin toggle — flat neutral, no glow. Filled when pinned. */}
        {expanded && (
          <button
            onClick={() => setPinned(!pinned)}
            title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            style={{
              width: 22, height: 22, borderRadius: 5, flexShrink: 0,
              border: `1px solid ${pinned ? S.primary : S.sidebarBorder}`,
              background: pinned ? S.primary : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              color: pinned ? "#0d1117" : S.sidebarText,
              transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
            }}
          >
            <IconPin size={11} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* Farm Pulse — signature element */}
      {total > 0 && (
        <div style={{
          padding: "12px 20px", borderBottom: `1px solid ${S.sidebarBorder}`,
          maxHeight: expanded ? 90 : 0, opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 260ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease, padding 260ms ease",
          paddingTop: expanded ? 12 : 0, paddingBottom: expanded ? 12 : 0,
        }}>
          <div style={{ fontSize: 9, color: S.sidebarText, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, whiteSpace: "nowrap" }}>
            Farm Pulse
          </div>
          <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", height: 5, gap: 1 }}>
            {printing > 0 && (
              <div style={{ flex: printing, background: S.printingCol }} />
            )}
            {idle > 0 && (
              <div style={{ flex: idle, background: S.running }} />
            )}
            {offline > 0 && (
              <div style={{ flex: offline, background: S.sidebarText }} />
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {[
              { label: "printing", count: printing, color: S.printingCol },
              { label: "idle",     count: idle,     color: S.running },
              { label: "offline",  count: offline,  color: S.sidebarText },
            ].map(({ label: l, count, color }) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: S.sidebarText }}>{count} {l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto", overflowX: "hidden" }}>
        {navItems.map(({ path, icon, label: navLabel }) => {
          const active = location.pathname === path
          return (
            <Link key={path} to={path} className="sb-nav-item" title={expanded ? undefined : navLabel} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: expanded ? "8px 12px 8px 10px" : "8px 0", borderRadius: 6, marginBottom: 2,
              justifyContent: expanded ? "flex-start" : "center",
              textDecoration: "none",
              transition: "background 180ms ease, border-color 180ms ease, padding 260ms cubic-bezier(0.4,0,0.2,1), justify-content 260ms ease",
              background: active ? S.sidebar2 : "transparent",
              borderLeft: `2px solid ${active ? S.primary : "transparent"}`,
            }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = S.sidebar2
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"
              }}
            >
              <span style={{ color: active ? S.sidebarTextActive : S.sidebarText, width: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {icon}
              </span>
              {label(navLabel, { fontSize: 12.5, fontWeight: active ? 600 : 500, color: active ? S.sidebarTextActive : S.sidebarText })}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: theme + user */}
      <div style={{ padding: expanded ? "12px 20px" : "12px 10px", borderTop: `1px solid ${S.sidebarBorder}`, transition: "padding 260ms ease" }}>
        <div style={{
          display: "flex", justifyContent: expanded ? "space-between" : "center",
          alignItems: "center", marginBottom: 10,
        }}>
          {label("Theme", { fontSize: 11, color: S.sidebarText })}
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              toggle(rect.left + rect.width / 2, rect.top + rect.height / 2)
            }}
            style={{
              background: S.sidebar2, border: `1px solid ${S.sidebarBorder}`,
              color: S.sidebarText, borderRadius: 6, padding: "5px 8px",
              cursor: "pointer", lineHeight: 1, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 180ms ease, color 180ms ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = S.sidebarTextActive }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = S.sidebarText }}
          >
            {theme === "dark" ? <IconSun size={13} strokeWidth={1.7} /> : <IconMoon size={13} strokeWidth={1.7} />}
          </button>
        </div>
        <button
          onClick={() => { localStorage.removeItem("token"); window.location.href = "/login" }}
          title={expanded ? undefined : "Sign Out"}
          style={{
            width: "100%", padding: "7px 0", background: "transparent",
            border: `1px solid ${S.sidebarBorder}`, borderRadius: 6,
            color: S.sidebarText, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
            transition: "border-color 180ms ease, color 180ms ease, background 180ms ease",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = S.danger
            ;(e.currentTarget as HTMLElement).style.color = "#fff"
            ;(e.currentTarget as HTMLElement).style.background = S.danger
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = S.sidebarBorder
            ;(e.currentTarget as HTMLElement).style.color = S.sidebarText
            ;(e.currentTarget as HTMLElement).style.background = "transparent"
          }}
        >
          <IconLogout size={13} strokeWidth={1.7} />
          {label("Sign Out")}
        </button>
      </div>
    </div>
  )
}

// ─── Camera Feed Section ──────────────────────────────────────────────────────

function CameraSection({ url }: { url: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div style={{ borderBottom: `1px solid ${S.border}` }}>
      <button
        onClick={() => { setOpen(o => !o); setError(false) }}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", background: "none", border: "none",
          cursor: "pointer", transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = S.hover)}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: S.muted, display: "flex" }}><IconCamera size={14} strokeWidth={1.6} /></span>
          <span style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Live Camera
          </span>
        </div>
        <span style={{
          color: S.muted, display: "flex",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}><IconChevronRight size={11} strokeWidth={1.8} /></span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 14px" }}>
          {error ? (
            <div style={{
              background: S.card2, borderRadius: 8, padding: "20px",
              textAlign: "center", fontSize: 12, color: S.muted,
              border: `1px solid ${S.border}`,
            }}>
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", color: S.dim }}><IconCamera size={22} strokeWidth={1.5} /></div>
              Camera not reachable<br />
              <span style={{ fontSize: 10, color: S.dim }}>{url}</span>
            </div>
          ) : (
            <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#000" }}>
              <img
                src={url}
                alt="Printer camera feed"
                onError={() => setError(true)}
                style={{ width: "100%", display: "block", borderRadius: 8, maxHeight: 220, objectFit: "cover" }}
              />
              <div style={{
                position: "absolute", bottom: 6, right: 8,
                fontSize: 9, color: "rgba(255,255,255,0.5)",
                background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: "2px 6px",
              }}>LIVE</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Printer Tray ─────────────────────────────────────────────────────────────

function PrinterTray({ printer, onClose, onRefresh }: {
  printer: Printer; onClose: () => void; onRefresh: () => void
}) {
  const [queue, setQueue]       = useState<QueueItem[]>([])
  const [loading, setLoading]   = useState(false)

  // ✅ Temperature control state
  const [extruderTarget, setExtruderTarget] = useState("")
  const [bedTarget, setBedTarget]           = useState("")
  const [tempLoading, setTempLoading]       = useState(false)
  const [tempMsg, setTempMsg]               = useState("")

  // ✅ Light toggle state (Centauri only) -- initialized from, and kept in
  // sync with, the printer's own live status pushes (printer.light_on),
  // so a change made on the printer's physical panel/touchscreen shows up
  // here too, instead of just reflecting the last button clicked in-app.
  const [lightOn, setLightOn]     = useState(printer.light_on ?? false)
  const [lightLoading, setLightLoading] = useState(false)

  useEffect(() => {
    if (printer.light_on !== undefined && printer.light_on !== null) {
      setLightOn(printer.light_on)
    }
  }, [printer.light_on])

  // ✅ Centauri-only Start Next options (plate/leveling/time-lapse)
  const [showCentauriOptions, setShowCentauriOptions] = useState(false)

  const loadQueue = useCallback(async () => {
    const data = await apiFetch(`/printers/${printer.id}/queue`)
    if (data) setQueue(data)
  }, [printer.id])

  useEffect(() => {
    loadQueue()
    const i = setInterval(loadQueue, 3000)
    return () => clearInterval(i)
  }, [loadQueue])

  const setTemp = async () => {
    if (!extruderTarget && !bedTarget) return
    setTempLoading(true); setTempMsg("")
    const body: any = {}
    if (extruderTarget) body.extruder = parseFloat(extruderTarget)
    if (bedTarget)      body.bed      = parseFloat(bedTarget)
    const res = await apiFetch(`/printers/${printer.id}/set_temp`, { method: "POST", body: JSON.stringify(body) })
    if (res?.detail) setTempMsg(`Error: ${res.detail}`)
    else { setTempMsg("Set"); onRefresh(); setTimeout(() => setTempMsg(""), 2000) }
    setTempLoading(false)
  }

  const toggleLight = async (on: boolean) => {
    setLightLoading(true)
    await apiFetch(`/printers/${printer.id}/light`, { method: "POST", body: JSON.stringify({ on }) })
    setLightOn(on)
    onRefresh()
    setLightLoading(false)
  }

  const printerCmd = async (cmd: "pause" | "resume" | "cancel") => {
    setLoading(true)
    const res = await apiFetch(`/printers/${printer.id}/${cmd}`, { method: "POST" })
    if (res?.detail) alert(res.detail)
    else onRefresh()
    setLoading(false)
  }

  // Klipper/Neptune: starts immediately, unchanged.
  // Centauri: opens the plate/leveling/time-lapse options modal first.
  const startNextClick = () => {
    if (printer.type === "centauri") { setShowCentauriOptions(true); return }
    doStartNext({})
  }

  const doStartNext = async (opts: Partial<CentauriPrintOptions>) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (opts.bedLeveling !== undefined) params.set("bed_leveling", String(opts.bedLeveling))
    if (opts.plateType   !== undefined) params.set("plate_type",   String(opts.plateType))
    if (opts.timeLapse   !== undefined) params.set("time_lapse",   String(opts.timeLapse))
    const qs = params.toString()
    const res = await apiFetch(`/printers/${printer.id}/start_next${qs ? `?${qs}` : ""}`, { method: "POST" })
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
    printing: S.printingCol, paused: S.paused, idle: S.running, offline: S.offline
  }
  const dotColor = statusColor[printer.status] ?? S.muted

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 360, height: "100vh",
      background: S.card, borderLeft: `1px solid ${S.border}`,
      zIndex: 50, display: "flex", flexDirection: "column",
      boxShadow: "-12px 0 40px rgba(0,0,0,0.5)",
      fontFamily: "'Inter', system-ui, sans-serif",
      animation: "tray-slide-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <style>{`
        @keyframes tray-slide-in {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1;   }
        }
      `}</style>
      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* ✅ Printer visual — Neptune or Centauri illustration based on type */}
            <div style={{
              width: 56, height: 56, borderRadius: 10, flexShrink: 0,
              background: S.card2, border: `1px solid ${S.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PrinterIcon type={printer.type ?? "klipper"} size={40} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                {printer.type === "centauri" ? "Centauri Carbon" : "Neptune"}
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: S.text }}>{printer.name}</h2>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: S.muted,
            cursor: "pointer", padding: 4, lineHeight: 1, display: "flex",
          }}><IconX size={16} strokeWidth={1.8} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: dotColor, fontWeight: 600, textTransform: "capitalize" }}>{printer.status}</span>
          {isActive && <span style={{ fontSize: 12, color: S.muted }}>— {printer.progress.toFixed(1)}%</span>}
        </div>
        {isActive && (
          <div style={{ marginTop: 10 }}>
            <div style={{ background: S.card2, borderRadius: 3, height: 4, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${printer.progress}%`, height: "100%",
                background: isPaused ? S.paused : S.printingCol,
                transition: "width 1s ease", borderRadius: 3,
              }} />
            </div>
            {printer.current_file && (
              <div style={{ fontSize: 11, color: S.muted, marginTop: 5, wordBreak: "break-all" }}>{printer.current_file}</div>
            )}
          </div>
        )}
      </div>

      {/* ✅ Scrollable body — everything below the header scrolls together */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

      {/* ✅ Alert banner — surfaces WHY a printer paused/errored, pulled from Moonraker */}
      {printer.error_message && (
        <div style={{
          margin: "14px 20px 0", padding: "12px 14px",
          background: isPaused ? "#F5B04114" : "#E74C3C14",
          border: `1px solid ${isPaused ? "#F5B04144" : "#E74C3C44"}`,
          borderRadius: 8,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: isPaused ? S.warning : S.danger }}>
            {printer.filament_detected === false ? <IconSpool size={16} strokeWidth={1.6} /> : <IconAlert size={16} strokeWidth={1.6} />}
          </span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: isPaused ? S.warning : S.danger, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
              {isPaused ? "Paused — needs attention" : "Printer alert"}
            </div>
            <div style={{ fontSize: 13, color: S.text, lineHeight: 1.4 }}>{printer.error_message}</div>
          </div>
        </div>
      )}
      {(printer.extruder_temp || printer.bed_temp) && (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Temperatures</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Extruder", temp: printer.extruder_temp, target: printer.extruder_target, color: S.warning },
              { label: "Bed",      temp: printer.bed_temp,      target: printer.bed_target,      color: S.primary },
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
              marginTop: 10, background: `${S.success}10`, border: `1px solid ${S.success}30`,
              borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ color: S.success, display: "flex" }}><IconHistory size={14} strokeWidth={1.6} /></span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: S.success }}>{fmtETA(printer.eta_seconds)}</div>
                <div style={{ fontSize: 10, color: S.muted }}>estimated remaining</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Job Controls */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}` }}>
        <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Controls</div>
        {printer.status === "offline" && <div style={{ fontSize: 12, color: S.danger }}>Printer is offline</div>}
        {isPaused && (
          <div style={{ display: "flex", gap: 8 }}>
            <TBtn onClick={() => printerCmd("resume")} color={S.success} disabled={loading}><IconPlay size={11} strokeWidth={1.8} /> Resume</TBtn>
            <TBtn onClick={() => printerCmd("cancel")} color={S.danger} disabled={loading}><IconX size={11} strokeWidth={1.8} /> Cancel</TBtn>
          </div>
        )}
        {isPrinting && (
          <div style={{ display: "flex", gap: 8 }}>
            <TBtn onClick={() => printerCmd("pause")}  color={S.warning} disabled={loading}><IconPause size={11} strokeWidth={1.8} /> Pause</TBtn>
            <TBtn onClick={() => printerCmd("cancel")} color={S.danger} disabled={loading}><IconX size={11} strokeWidth={1.8} /> Cancel</TBtn>
          </div>
        )}
        {isIdle && (
          <TBtn onClick={startNextClick} color={S.primary} disabled={loading || queue.length === 0}>
            {queue.length === 0 ? "Queue empty" : <><IconPlay size={11} strokeWidth={1.8} /> Start Next Job</>}
          </TBtn>
        )}
      </div>

      {/* ✅ Temperature Control */}
      {printer.status !== "offline" && (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
            Set Temperature
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {([
              { label: "Extruder °C", val: extruderTarget, set: setExtruderTarget, ph: "220", color: S.warning },
              { label: "Bed °C",      val: bedTarget,      set: setBedTarget,      ph: "60",  color: S.primary },
            ] as const).map(({ label, val, set, ph, color }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>{label}</div>
                <input
                  type="number" value={val} onChange={e => set(e.target.value)}
                  placeholder={String(ph)}
                  min="0" max="350" step="5"
                  style={{
                    width: "100%", padding: "7px 10px", borderRadius: 6,
                    background: S.card2, border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 14, boxSizing: "border-box",
                    outline: "none", fontVariantNumeric: "tabular-nums",
                  }}
                  onFocus={e => (e.target.style.borderColor = color)}
                  onBlur={e => (e.target.style.borderColor = S.border)}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TBtn onClick={setTemp} color={S.primary} disabled={tempLoading || (!extruderTarget && !bedTarget)}>
              <IconThermometer size={11} strokeWidth={1.8} /> {tempLoading ? "Setting…" : "Set Temps"}
            </TBtn>
            <TBtn onClick={() => {
              setExtruderTarget("0"); setBedTarget("0")
              apiFetch(`/printers/${printer.id}/set_temp`, {
                method: "POST", body: JSON.stringify({ extruder: 0, bed: 0 })
              }).then(onRefresh)
            }} color={S.secondary} disabled={tempLoading}>
              <IconSnowflake size={11} strokeWidth={1.8} /> Cool Down
            </TBtn>
            {tempMsg && <span style={{ fontSize: 12, color: S.success }}>{tempMsg}</span>}
          </div>
        </div>
      )}

      {/* ✅ Light Toggle — Centauri Carbon only */}
      {printer.type === "centauri" && printer.status !== "offline" && (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
            Chamber Light
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TBtn onClick={() => toggleLight(true)} color={S.warning} disabled={lightLoading || lightOn}>
              <IconLightOn size={11} strokeWidth={1.8} /> On
            </TBtn>
            <TBtn onClick={() => toggleLight(false)} color={S.secondary} disabled={lightLoading || !lightOn}>
              <IconLightOff size={11} strokeWidth={1.8} /> Off
            </TBtn>
          </div>
        </div>
      )}

      {/* ✅ Camera feed — Centauri: auto-discovered at {ip}:3031/video
          Other printers: shown if camera_url was set manually.
          Collapsed by default, click to expand. */}
      {printer.camera_url && <CameraSection url={printer.camera_url} />}

      {/* Queue */}
      <div style={{ padding: "14px 20px" }}>
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
                  <div style={{ fontSize: 10, marginTop: 2, color: job.status === "waiting_confirmation" ? S.warning : S.muted }}>
                    {job.status}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {isPrinting && idx === 0 && <TBtn onClick={() => skipJob(job.id)} color={S.warning} small>Skip</TBtn>}
                  <TBtn onClick={() => cancelJob(job.id)} color={S.danger} small><IconX size={10} strokeWidth={1.8} /></TBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      </div>{/* end scrollable body */}

      {showCentauriOptions && (
        <CentauriPrintOptionsModal
          fileName={queue[0]?.batch_name ?? "Next job"}
          printerLabel={printer.name}
          loading={loading}
          onCancel={() => setShowCentauriOptions(false)}
          onConfirm={opts => { setShowCentauriOptions(false); doStartNext(opts) }}
        />
      )}
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
      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6,
    }}>{children}</button>
  )
}

// ─── Add Printer Modal ────────────────────────────────────────────────────────

// AddPrinterModal moved to its own file: ./AddPrinterModal.tsx
// (shared between Dashboard and Printers Management page)

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string,{bg:string;color:string}> = {
    printing: {bg:`${S.printingCol}1f`,color:S.printingCol},
    paused:   {bg:`${S.paused}1f`,color:S.paused},
    idle:     {bg:`${S.running}1f`,color:S.running},
    offline:  {bg:`${S.offline}1f`, color:S.offline},
  }
  const {bg,color} = cfg[status] ?? {bg:`${S.muted}1f`,color:S.muted}
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      background:bg, color, border:`1px solid ${color}30`,
      borderRadius:4, padding:"3px 8px 3px 6px",
      fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:"uppercase",
    }}>
      <span style={{
        width:5, height:5, borderRadius:"50%", background:color, flexShrink:0,
        animation: status === "printing" ? "statusDotPulse 1.8s ease-in-out infinite" : "none",
      }} />
      {status}
    </span>
  )
}

// ─── Printer Card ─────────────────────────────────────────────────────────────

function PrinterCard({ printer, selected, onClick, onDelete, role }: {
  printer: Printer; selected: boolean; onClick: () => void
  onDelete: () => void; role: string | null
}) {
  const [hov, setHov] = useState(false)
  const accent: Record<string,string> = { printing:S.printingCol, paused:S.paused, idle:S.running, offline:S.offline }
  const col = accent[printer.status] ?? S.border
  const isPrinting = printer.status === "printing"
  const isPaused   = printer.status === "paused"

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? S.card2 : S.card,
        border: `1px solid ${printer.error_message ? S.danger : selected ? col : S.border}`,
        borderRadius: 8, padding: "14px 16px",
        cursor: "pointer",
        transition: "border-color 150ms ease, background-color 150ms ease",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
        <div style={{ fontSize:13.5,fontWeight:600,color:S.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8,letterSpacing:-0.1 }}>
          {printer.name}
        </div>
        <StatusPill status={printer.status} />
      </div>

      {/* File / alert */}
      {printer.error_message ? (
        <div style={{
          fontSize:11, color:S.danger, minHeight:14, marginBottom:10,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          display:"flex", alignItems:"center", gap:5, fontWeight:600,
        }}>
          <span style={{ display:"flex", flexShrink:0 }}>
            {printer.filament_detected === false ? <IconSpool size={11} strokeWidth={1.8} /> : <IconAlert size={11} strokeWidth={1.8} />}
          </span>
          {printer.error_message}
        </div>
      ) : (
        <div style={{ fontSize:11,color:S.muted,minHeight:14,marginBottom:10,overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {(isPrinting || isPaused) && printer.current_file ? printer.current_file : printer.status === "offline" ? "" : "Ready"}
        </div>
      )}

      {/* Progress */}
      {(isPrinting || isPaused) && (
        <>
          <div style={{ background:S.card2,borderRadius:2,height:4,overflow:"hidden",marginBottom:8 }}>
            <div style={{
              width:`${printer.progress}%`,height:"100%",borderRadius:2,
              background: isPaused ? S.paused : S.printingCol,
              transition:"width 1s ease",
            }} />
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:12,color:isPaused?S.paused:S.printingCol,fontWeight:600,fontVariantNumeric:"tabular-nums" }}>
              {printer.progress.toFixed(1)}%
            </span>
            {printer.eta_seconds && printer.eta_seconds > 0 && (
              <span style={{ fontSize:11,color:S.muted }}>{fmtETA(printer.eta_seconds)}</span>
            )}
          </div>
        </>
      )}

      {/* Inline temps when printing */}
      {isPrinting && printer.extruder_temp && (
        <div style={{ display:"flex",gap:14,marginTop:10,paddingTop:10,borderTop:`1px solid ${S.divider}` }}>
          <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11,color:S.warning,fontVariantNumeric:"tabular-nums" }}>
            <IconThermometer size={11} strokeWidth={1.8} /> {printer.extruder_temp.toFixed(0)}°
          </span>
          <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11,color:S.primary,fontVariantNumeric:"tabular-nums" }}>
            <IconBed size={11} strokeWidth={1.8} /> {printer.bed_temp?.toFixed(0) ?? "—"}°
          </span>
        </div>
      )}

      {/* Delete — admin only, subtle */}
      {role === "admin" && (hov || selected) && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position:"absolute",bottom:10,right:10,background:"none",border:"none",
            color:S.dim,cursor:"pointer",padding:3,lineHeight:1,
            borderRadius:4, display:"flex",
            transition:"color 150ms ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.color=S.danger)}
          onMouseLeave={e => (e.currentTarget.style.color=S.dim)}
          title="Delete printer"
        ><IconTrash size={13} strokeWidth={1.7} /></button>
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
        @keyframes statusDotPulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border,#1a3a5c); border-radius: 2px; }
        body { margin: 0; background: var(--bg,#050d1a); }

        /* ✅ Smooth color transitions for elements still using CSS vars directly
           (covers any element that doesn't re-render on theme change) */
        body, button, input, select {
          transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
        }

        /* ✅ Telegram-style circular reveal — expands outward from the toggle button.
           Uses the View Transitions API (Chrome/Edge 111+). Safari/Firefox fall back
           to an instant switch automatically (handled in theme.tsx). */
        ::view-transition-old(root) {
          animation: none;
        }
        ::view-transition-new(root) {
          animation: reveal-circle 0.5s ease-out;
        }
        @keyframes reveal-circle {
          from {
            clip-path: circle(0% at var(--reveal-x, 100%) var(--reveal-y, 0%));
          }
          to {
            clip-path: circle(150% at var(--reveal-x, 100%) var(--reveal-y, 0%));
          }
        }
      `}</style>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/"                element={<ProtectedRoute><AppShell printers={printers}><Dashboard printers={printers} loadPrinters={loadPrinters} /></AppShell></ProtectedRoute>} />
        <Route path="/files"           element={<ProtectedRoute><AppShell printers={printers}><Files /></AppShell></ProtectedRoute>} />
        <Route path="/add-printer"     element={<ProtectedRoute><AppShell printers={printers}><AddPrinter /></AppShell></ProtectedRoute>} />
        <Route path="/batches"         element={<ProtectedRoute><AppShell printers={printers}><Batches /></AppShell></ProtectedRoute>} />
        <Route path="/manage/printers" element={<ProtectedRoute><AppShell printers={printers}><PrinterManagement /></AppShell></ProtectedRoute>} />
        <Route path="/manage/users"    element={<ProtectedRoute><AppShell printers={printers}><UserManagement /></AppShell></ProtectedRoute>} />
        <Route path="/history"         element={<ProtectedRoute><AppShell printers={printers}><PrintHistory /></AppShell></ProtectedRoute>} />
      </Routes>
    </>
  )
}

// ─── AppShell — sidebar + content layout ─────────────────────────────────────

function AppShell({ children, printers }: {
  children: React.ReactNode; printers: Printer[]
}) {
  const [pinned, setPinned] = useState(() => localStorage.getItem("sidebarPinned") === "1")

  useEffect(() => {
    localStorage.setItem("sidebarPinned", pinned ? "1" : "0")
  }, [pinned])

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:S.bg, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <Sidebar printers={printers} pinned={pinned} setPinned={setPinned} />
      <div style={{ marginLeft: pinned ? 220 : 76, flex:1, minWidth:0, transition:"margin-left 260ms cubic-bezier(0.4,0,0.2,1)" }}>
        {children}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ printers, loadPrinters }: { printers: Printer[]; loadPrinters: () => void }) {
  const role = getUserRole()
  const [analytics, setAnalytics]             = useState<Analytics | null>(null)
  const [selectedPrinter, setSelectedPrinter]   = useState<Printer | null>(null)
  const [showAddModal, setShowAddModal]         = useState(false)
  const [statusFilter, setStatusFilter]         = useState<string>("all") // ✅ filter state

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

  // ✅ Stable sort — highest print progress first, then idle, then offline
  // This prevents the random shuffle every 5 seconds since DB returns arbitrary order
  const STATUS_RANK: Record<string, number> = { printing: 0, paused: 1, idle: 2, offline: 3 }
  const sortedPrinters = [...printers].sort((a, b) => {
    const rankDiff = (STATUS_RANK[a.status] ?? 4) - (STATUS_RANK[b.status] ?? 4)
    if (rankDiff !== 0) return rankDiff
    // Within same status, sort by progress descending (highest first)
    return (b.progress ?? 0) - (a.progress ?? 0)
  })

  // ✅ Apply status filter
  const visiblePrinters = statusFilter === "all"
    ? sortedPrinters
    : sortedPrinters.filter(p => p.status === statusFilter)

  return (
    <div style={{ position:"relative", minHeight:"100vh", background:S.bg, color:S.text }}>
      <EngineeringBackground variant="dashboard" />
      {/* Top bar */}
      <div style={{
        height:56, borderBottom:`1px solid ${S.divider}`,
        display:"flex",alignItems:"center",padding:"0 24px",
        justifyContent:"space-between", background:S.card,
        position:"sticky",top:0,zIndex:30,
      }}>
        <div>
          <div style={{ fontSize:15,fontWeight:700,color:S.text,letterSpacing:-0.1 }}>Production Overview</div>
          <div style={{ fontSize:11.5,color:S.muted,marginTop:1 }}>
            {printing > 0 ? `${printing} printer${printing>1?"s":""} active` : "All printers idle"}
          </div>
        </div>
        {role === "admin" && (
          <Button variant="primary" onClick={()=>setShowAddModal(true)} leadingIcon={<IconPlus size={13} strokeWidth={2}/>}>
            Add Printer
          </Button>
        )}
      </div>

      <div style={{ position:"relative", zIndex:1, padding:"24px" }}>
        {/* KPI row — dense control-panel style. Color appears ONLY on the
            metrics that represent actual machine status (thin left
            border); Fleet count and Success Rate stay fully neutral. */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(6,1fr)",
          gap:10, marginBottom:24,
        }}>
          {[
            {label:"Fleet",         value:total,    accent:null,       icon:<IconDashboard size={13} strokeWidth={1.6}/>, sub:"printers"},
            {label:"Printing",      value:printing, accent:S.printingCol, icon:<IconPlay size={13} strokeWidth={1.6}/>,   sub:"active now"},
            {label:"Paused",        value:paused,   accent:S.paused,   icon:<IconPause size={13} strokeWidth={1.6}/>,    sub:"on hold"},
            {label:"Idle",          value:idle,     accent:S.running,  icon:<IconCheck size={13} strokeWidth={1.6}/>,    sub:"ready"},
            {label:"Offline",       value:offline,  accent:S.offline,  icon:<IconPower size={13} strokeWidth={1.6}/>,    sub:"unreachable"},
            {label:"Success Rate",  value:analytics?`${analytics.success_rate}%`:"—", accent:null, icon:<IconChart size={13} strokeWidth={1.6}/>, sub:"all time"},
          ].map(({label,value,accent,icon,sub})=>(
            <div key={label} style={{
              background:S.card, borderRadius:8, padding:"12px 14px",
              border:`1px solid ${S.border}`,
              borderLeft: accent ? `2px solid ${accent}` : `1px solid ${S.border}`,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:10,color:S.muted,textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>{label}</div>
                <span style={{color:S.dim,display:"flex"}}>{icon}</span>
              </div>
              <div style={{fontSize:21,fontWeight:700,color:S.text,fontVariantNumeric:"tabular-nums",letterSpacing:-0.3}}>{value}</div>
              <div style={{fontSize:10.5,color:S.dim,marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Analytics row — general stats, kept fully neutral (not machine status) */}
        {analytics && (
          <div style={{
            display:"grid",gridTemplateColumns:"repeat(3,1fr)",
            gap:10,marginBottom:24,
          }}>
            {[
              {label:"Today's Prints",  value:analytics.today_prints, icon:<IconChart size={15} strokeWidth={1.6}/>},
              {label:"This Week",       value:analytics.week_prints,  icon:<IconBatch size={15} strokeWidth={1.6}/>},
              {label:"Avg Print Time",  value:analytics.avg_print_time_minutes?`${analytics.avg_print_time_minutes}m`:"—", icon:<IconHistory size={15} strokeWidth={1.6}/>},
            ].map(({label,value,icon})=>(
              <div key={label} style={{
                background:S.card,borderRadius:8,padding:"12px 14px",
                border:`1px solid ${S.border}`,
                display:"flex",alignItems:"center",gap:12,
              }}>
                <div style={{
                  width:32,height:32,borderRadius:6,
                  background:S.card2,border:`1px solid ${S.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:S.dim,flexShrink:0,
                }}>{icon}</div>
                <div>
                  <div style={{fontSize:10,color:S.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:3,fontWeight:600}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:700,color:S.text,fontVariantNumeric:"tabular-nums",letterSpacing:-0.2}}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ✅ Status filter pills */}
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:S.muted, textTransform:"uppercase", letterSpacing:1.2, marginRight:4, fontWeight:600 }}>Filter</span>
          {[
            { label:"All",      value:"all",      count:total,    color:S.muted   },
            { label:"Printing", value:"printing",  count:printing, color:S.printingCol },
            { label:"Paused",   value:"paused",   count:paused,   color:S.paused },
            { label:"Idle",     value:"idle",     count:idle,     color:S.running },
            { label:"Offline",  value:"offline",  count:offline,  color:S.offline },
          ].map(({ label, value, count, color }) => {
            const active = statusFilter === value
            return (
              <button key={value} onClick={() => {
                setStatusFilter(value)
                setSelectedPrinter(null) // close tray when filter changes
              }} style={{
                padding:"5px 12px", borderRadius:6, fontSize:11.5, fontWeight:600,
                cursor:"pointer", transition:"all 0.15s",
                background: active ? `${color}22` : S.card,
                border: `1px solid ${active ? color : S.border}`,
                color: active ? color : S.muted,
                display:"flex", alignItems:"center", gap:6,
              }}>
                {active && <span style={{
                  width:6, height:6, borderRadius:"50%",
                  background:color, display:"inline-block",
                }} />}
                {label}
                <span style={{
                  fontSize:10, fontWeight:700,
                  background: active ? `${color}33` : S.card2,
                  border:`1px solid ${active ? color+"44" : S.border}`,
                  borderRadius:10, padding:"1px 6px",
                  color: active ? color : S.muted,
                }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Printer grid */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",
          gap:10,
          marginRight: selectedPrinter ? 376 : 0,
          transition:"margin-right 0.2s ease",
        }}>
          {visiblePrinters.map(printer => (
            <PrinterCard
              key={printer.id}
              printer={printer}
              selected={selectedPrinter?.id === printer.id}
              onClick={() => setSelectedPrinter(selectedPrinter?.id===printer.id ? null : printer)}
              onDelete={() => deletePrinter(printer.id)}
              role={role}
            />
          ))}
          {visiblePrinters.length === 0 && printers.length > 0 && (
            <div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:S.dim}}>
              <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><IconSearch size={28} strokeWidth={1.4} /></div>
              <div style={{fontSize:15,color:S.muted}}>
                No {statusFilter} printers
              </div>
              <Button variant="secondary" size="sm" style={{ marginTop:12 }} onClick={()=>setStatusFilter("all")}>
                Clear filter
              </Button>
            </div>
          )}
          {printers.length === 0 && (
            <div style={{gridColumn:"1/-1",textAlign:"center",padding:"80px 0",color:S.dim}}>
              <div style={{marginBottom:16,display:"flex",justifyContent:"center"}}><IconPrinter size={36} strokeWidth={1.3} /></div>
              <div style={{fontSize:16,marginBottom:6,color:S.muted}}>No printers yet</div>
              {role==="admin" && (
                <Button variant="primary" leadingIcon={<IconPlus size={13} strokeWidth={2}/>} style={{ marginTop:8 }} onClick={()=>setShowAddModal(true)}>
                  Add first printer
                </Button>
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