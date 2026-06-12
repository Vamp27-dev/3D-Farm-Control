import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { apiFetch } from "./App"
import { getUserRole } from "./utils/auth"

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

interface HistoryItem {
  id: number
  printer_name: string
  batch_id: number
  status: string
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
}

function toIST(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  })
}

function fmtDuration(sec: number | null) {
  if (!sec) return "—"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  success:   { bg: "#10b98118", color: "#10b981" },
  failed:    { bg: "#ef444418", color: "#ef4444" },
  cancelled: { bg: "#64748b18", color: "#64748b" },
}

export default function PrintHistory() {
  const role = getUserRole()
  const [items, setItems]       = useState<HistoryItem[]>([])
  const [total, setTotal]       = useState(0)
  const [offset, setOffset]     = useState(0)
  const [loading, setLoading]   = useState(false)
  const [filter, setFilter]     = useState<"all"|"success"|"failed"|"cancelled">("all")
  const [search, setSearch]     = useState("")
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    const data = await apiFetch(`/analytics/history?limit=${LIMIT}&offset=${offset}`)
    if (data) { setItems(data.items); setTotal(data.total) }
    setLoading(false)
  }, [offset])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    const token = localStorage.getItem("token")
    window.open(`${API_BASE}/analytics/export/csv`, "_blank")
  }

  const filtered = items.filter(i => {
    const matchStatus = filter === "all" || i.status === filter
    const matchSearch = i.printer_name.toLowerCase().includes(search.toLowerCase()) ||
                        String(i.batch_id).includes(search)
    return matchStatus && matchSearch
  })

  const successCount   = items.filter(i => i.status === "success").length
  const failedCount    = items.filter(i => i.status === "failed").length
  const cancelledCount = items.filter(i => i.status === "cancelled").length

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", fontFamily:"'Inter',system-ui,sans-serif" }}>
      {/* Nav */}
      <div style={{ borderBottom:"1px solid var(--border)", padding:"0 32px", display:"flex", alignItems:"center", height:52, gap:0 }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#10b981", marginRight:32, letterSpacing:0.5 }}>FARM CONTROL</span>
        {[["Dashboard","/"],["Files","/files"],["Batches","/batches"],["Printers","/printers/manage"],["History","/history"]].map(([label,path]) => (
          <Link key={label} to={path} style={{
            fontSize:13, color: label==="History" ? "var(--text)" : "var(--text-muted)",
            textDecoration:"none", padding:"0 16px", height:"100%",
            display:"flex", alignItems:"center", fontWeight: label==="History" ? 600 : 400,
            borderBottom: label==="History" ? "2px solid #3b82f6" : "2px solid transparent",
          }}>{label}</Link>
        ))}
        {role === "admin" && (
          <Link to="/users/manage" style={{ fontSize:13, color:"var(--text-muted)", textDecoration:"none", padding:"0 16px", height:"100%", display:"flex", alignItems:"center" }}>Users</Link>
        )}
      </div>

      <div style={{ padding:"28px 32px" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <h1 style={{ margin:"0 0 4px", fontSize:24, fontWeight:700 }}>Print History</h1>
            <p style={{ margin:0, fontSize:13, color:"var(--text-muted)" }}>
              {total} total jobs recorded
            </p>
          </div>
          <button onClick={exportCSV} style={{
            background:"#3b82f618", border:"1px solid #3b82f6",
            color:"#3b82f6", borderRadius:8, padding:"9px 20px",
            fontSize:14, fontWeight:600, cursor:"pointer",
          }}>↓ Export CSV</button>
        </div>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
          {[
            { label:"Total Jobs",  value:total,         accent:"#475569" },
            { label:"Successful",  value:successCount,  accent:"#10b981" },
            { label:"Failed",      value:failedCount,   accent:"#ef4444" },
            { label:"Cancelled",   value:cancelledCount,accent:"#64748b" },
          ].map(({ label,value,accent }) => (
            <div key={label} style={{
              background:"var(--card)", borderRadius:10, padding:"14px 20px",
              border:`1px solid ${accent}22`, borderLeft:`3px solid ${accent}`,
            }}>
              <div style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:26, fontWeight:700, color:accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          {(["all","success","failed","cancelled"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:500, cursor:"pointer",
              background: filter===f ? "#3b82f6" : "var(--card)",
              border: `1px solid ${filter===f ? "#3b82f6" : "var(--border)"}`,
              color: filter===f ? "#fff" : "var(--text-muted)",
            }}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search printer or batch ID…"
            style={{
              padding:"5px 14px", borderRadius:20, fontSize:12,
              background:"var(--card)", border:"1px solid var(--border)",
              color:"var(--text)", outline:"none", width:220,
            }}
          />
        </div>

        {/* Table */}
        <div style={{ background:"var(--card)", borderRadius:12, border:"1px solid var(--border)", overflow:"hidden" }}>
          <div style={{
            display:"grid", gridTemplateColumns:"60px 1.5fr 80px 1.2fr 1.2fr 1fr 80px",
            padding:"10px 20px", borderBottom:"1px solid var(--border)",
            fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:1.5,
          }}>
            <div>#</div><div>Printer</div><div>Batch</div>
            <div>Started</div><div>Completed</div><div>Duration</div><div>Status</div>
          </div>

          {loading ? (
            <div style={{ padding:"48px 0", textAlign:"center", color:"var(--text-muted)" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:"48px 0", textAlign:"center", color:"var(--text-muted)" }}>
              {items.length === 0 ? "No print history yet — complete a batch to see records here" : "No results match your filter"}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const sc = STATUS_COLOR[item.status] ?? STATUS_COLOR.cancelled
              return (
                <div key={item.id} style={{
                  display:"grid", gridTemplateColumns:"60px 1.5fr 80px 1.2fr 1.2fr 1fr 80px",
                  padding:"12px 20px", alignItems:"center",
                  borderBottom: idx < filtered.length-1 ? "1px solid var(--border-subtle)" : "none",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background="var(--hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                >
                  <div style={{ fontSize:12, color:"var(--text-muted)" }}>#{item.id}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{item.printer_name}</div>
                  <div style={{ fontSize:12, color:"var(--text-muted)" }}>#{item.batch_id}</div>
                  <div style={{ fontSize:12, color:"var(--text-muted)" }}>{toIST(item.started_at)}</div>
                  <div style={{ fontSize:12, color:"var(--text-muted)" }}>{toIST(item.completed_at)}</div>
                  <div style={{ fontSize:12, color:"var(--text)" }}>{fmtDuration(item.duration_seconds)}</div>
                  <div>
                    <span style={{
                      background:sc.bg, color:sc.color,
                      border:`1px solid ${sc.color}44`,
                      borderRadius:4, padding:"2px 8px",
                      fontSize:11, fontWeight:600, textTransform:"capitalize",
                    }}>{item.status}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ display:"flex", justifyContent:"center", gap:10, marginTop:16 }}>
            <button disabled={offset===0} onClick={() => setOffset(Math.max(0,offset-LIMIT))}
              style={{
                padding:"6px 16px", borderRadius:6, fontSize:13,
                background:"var(--card)", border:"1px solid var(--border)",
                color: offset===0 ? "var(--text-muted)" : "var(--text)",
                cursor: offset===0 ? "not-allowed" : "pointer",
              }}>← Prev</button>
            <span style={{ fontSize:13, color:"var(--text-muted)", display:"flex", alignItems:"center" }}>
              {offset+1}–{Math.min(offset+LIMIT,total)} of {total}
            </span>
            <button disabled={offset+LIMIT>=total} onClick={() => setOffset(offset+LIMIT)}
              style={{
                padding:"6px 16px", borderRadius:6, fontSize:13,
                background:"var(--card)", border:"1px solid var(--border)",
                color: offset+LIMIT>=total ? "var(--text-muted)" : "var(--text)",
                cursor: offset+LIMIT>=total ? "not-allowed" : "pointer",
              }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}