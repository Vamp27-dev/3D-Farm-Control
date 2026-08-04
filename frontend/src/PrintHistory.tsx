import { useEffect, useState, useCallback } from "react"
import { toIST } from "./utils/date"
import { apiFetch, useIsMobile } from "./App"

const API_BASE = import.meta.env.VITE_API_BASE || ""

interface HistoryItem {
  id: number; printer_name: string; batch_id: number; status: string
  started_at: string | null; completed_at: string | null; duration_seconds: number | null
}

// toIST imported from shared utils

function fmtDuration(sec: number | null) {
  if (!sec) return "—"
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  success:   { bg: "#2ECC7118", color: "var(--success)" },
  failed:    { bg: "#E74C3C18", color: "var(--danger)" },
  cancelled: { bg: "#7F8C8D18", color: "var(--secondary)" },
}

const LIMIT = 50

export default function PrintHistory() {
  const isMobile = useIsMobile()
  const [items, setItems]     = useState<HistoryItem[]>([])
  const [total, setTotal]     = useState(0)
  const [offset, setOffset]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState<"all"|"success"|"failed"|"cancelled">("all")
  const [search, setSearch]   = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const data = await apiFetch(`/analytics/history?limit=${LIMIT}&offset=${offset}`)
    if (data) { setItems(data.items); setTotal(data.total) }
    setLoading(false)
  }, [offset])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    window.open(`${API_BASE}/analytics/export/csv`, "_blank")
  }

  const filtered = items.filter(i => {
    const matchStatus = filter === "all" || i.status === filter
    const matchSearch = i.printer_name.toLowerCase().includes(search.toLowerCase()) || String(i.batch_id).includes(search)
    return matchStatus && matchSearch
  })

  const successCount   = items.filter(i => i.status === "success").length
  const failedCount    = items.filter(i => i.status === "failed").length
  const cancelledCount = items.filter(i => i.status === "cancelled").length

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Top bar */}
      <div style={{
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: isMobile ? "10px 16px" : "0 28px",
        justifyContent: "space-between", background: "var(--card)",
        position: "sticky", top: isMobile ? 52 : 0, zIndex: 30,
        height: isMobile ? undefined : 52, flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 10 : 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: isMobile?13.5:15, fontWeight: 700, color: "var(--text)" }}>Print History</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 12 }}>{total} total jobs</span>
        </div>
        <div style={{ display: "flex", gap: 8, width: isMobile ? "100%" : undefined }}>
          <button onClick={exportCSV} style={{
            background: "#4FA3FF18", border: "1px solid var(--primary)", color: "var(--primary)",
            borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            flex: isMobile ? 1 : undefined,
          }}>{isMobile ? "↓ Export" : "↓ Export CSV"}</button>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "24px 28px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: isMobile?16:24 }}>
          {[
            { label: "Total Jobs",  value: total,         accent: "var(--text-dim)" },
            { label: "Successful",  value: successCount,  accent: "var(--success)" },
            { label: "Failed",      value: failedCount,   accent: "var(--danger)" },
            { label: "Cancelled",   value: cancelledCount,accent: "var(--secondary)" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: "var(--card)", borderRadius: 10, padding: "14px 18px",
              border: `1px solid var(--border)`, borderTop: `2px solid ${accent}`,
            }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {(["all","success","failed","cancelled"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: filter === f ? "var(--primary)" : "var(--card)",
              border: `1px solid ${filter === f ? "var(--primary)" : "var(--border)"}`,
              color: filter === f ? "#0d1117" : "var(--text-muted)",
            }}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search printer or batch ID…"
            style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12,
              background: "var(--card)", border: "1px solid var(--border)",
              color: "var(--text)", outline: "none", width: isMobile ? "100%" : 220,
            }}
          />
        </div>

        {/* Table */}
        <div style={{ background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "50px 1.5fr 70px 1.3fr 1.3fr 90px 80px",
            padding: "10px 20px", borderBottom: "1px solid var(--border)",
            fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5,
            minWidth: isMobile ? 760 : undefined,
          }}>
            <div>#</div><div>Printer</div><div>Batch</div>
            <div>Started (IST)</div><div>Completed (IST)</div><div>Duration</div><div>Status</div>
          </div>

          {loading ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "64px 0", textAlign: "center", color: "var(--text-dim)" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                {items.length === 0 ? "No print history yet" : "No results match your filter"}
              </div>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const sc = STATUS_COLOR[item.status] ?? STATUS_COLOR.cancelled
              return (
                <div key={item.id} style={{
                  display: "grid", gridTemplateColumns: "50px 1.5fr 70px 1.3fr 1.3fr 90px 80px",
                  padding: "12px 20px", alignItems: "center",
                  borderBottom: idx < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  transition: "background 0.1s",
                  minWidth: isMobile ? 760 : undefined,
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>#{item.id}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.printer_name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>#{item.batch_id}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{toIST(item.started_at)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{toIST(item.completed_at)}</div>
                  <div style={{ fontSize: 12, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fmtDuration(item.duration_seconds)}</div>
                  <div>
                    <span style={{
                      background: sc.bg, color: sc.color, border: `1px solid ${sc.color}44`,
                      borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, textTransform: "capitalize",
                    }}>{item.status}</span>
                  </div>
                </div>
              )
            })
          )}
          </div>
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
            <button disabled={offset===0} onClick={() => setOffset(Math.max(0,offset-LIMIT))} style={{
              padding: "6px 16px", borderRadius: 10, fontSize: 13,
              background: "var(--card)", border: "1px solid var(--border)",
              color: offset===0 ? "var(--text-muted)" : "var(--text)",
              cursor: offset===0 ? "not-allowed" : "pointer",
            }}>← Prev</button>
            <span style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
              {offset+1}–{Math.min(offset+LIMIT,total)} of {total}
            </span>
            <button disabled={offset+LIMIT>=total} onClick={() => setOffset(offset+LIMIT)} style={{
              padding: "6px 16px", borderRadius: 10, fontSize: 13,
              background: "var(--card)", border: "1px solid var(--border)",
              color: offset+LIMIT>=total ? "var(--text-muted)" : "var(--text)",
              cursor: offset+LIMIT>=total ? "not-allowed" : "pointer",
            }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}