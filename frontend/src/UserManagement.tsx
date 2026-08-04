import { useEffect, useState, useCallback } from "react"
import { apiFetch, useIsMobile } from "./App"


const API_BASE = import.meta.env.VITE_API_BASE || ""

interface UserItem { id: number; username: string; role: string }

const ROLE_CFG = {
  admin:  { color: "var(--warning)", bg: "#F5B04118", label: "Admin",  desc: "Full access — manage printers, users, files, batches" },
  viewer: { color: "var(--primary)", bg: "#4FA3FF18", label: "Viewer", desc: "Can view dashboard and create batches — no delete/settings" },
}

// ─── User Form Modal ──────────────────────────────────────────────────────────

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserItem | null   // null = create mode
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = user !== null
  const [username, setUsername] = useState(user?.username ?? "")
  const [password, setPassword] = useState("")
  const [role, setRole]         = useState<"admin"|"viewer">(
    (user?.role as "admin"|"viewer") ?? "viewer"
  )
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")

  const save = async () => {
    if (!username.trim()) { setError("Username required"); return }
    if (!isEdit && !password.trim()) { setError("Password required"); return }
    setError(""); setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const url   = isEdit ? `${API_BASE}/users/${user!.id}` : `${API_BASE}/users/`
      const method = isEdit ? "PATCH" : "POST"
      const body: any = { username: username.trim(), role }
      if (password.trim()) body.password = password.trim()

      const raw = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const res = await raw.json()
      if (!raw.ok) { setError(res?.detail ?? "Failed"); setLoading(false); return }
      onSaved(); onClose()
    } catch (e: any) { setError(e?.message ?? "Network error") }
    setLoading(false)
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 28, width: "min(400px, 92vw)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
            {isEdit ? "Edit User" : "Create User"}
          </h2>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"var(--text-muted)",fontSize:18,cursor:"pointer" }}>✕</button>
        </div>

        {/* Username */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display:"block",fontSize:10,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:1.5 }}>
            Username
          </label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="e.g. john_operator"
            style={{
              width:"100%",padding:"8px 12px",background:"var(--card2)",
              border:"1px solid var(--border)",borderRadius: 10,color:"var(--text)",
              fontSize:14,boxSizing:"border-box",outline:"none",
            }} />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display:"block",fontSize:10,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:1.5 }}>
            {isEdit ? "New Password (leave blank to keep)" : "Password"}
          </label>
          <input value={password} onChange={e => setPassword(e.target.value)}
            type="password" placeholder={isEdit ? "••••••••" : "Min 6 characters"}
            style={{
              width:"100%",padding:"8px 12px",background:"var(--card2)",
              border:"1px solid var(--border)",borderRadius: 10,color:"var(--text)",
              fontSize:14,boxSizing:"border-box",outline:"none",
            }} />
        </div>

        {/* Role picker */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display:"block",fontSize:10,color:"var(--text-muted)",marginBottom:8,textTransform:"uppercase",letterSpacing:1.5 }}>
            Role
          </label>
          <div style={{ display:"flex",gap:8 }}>
            {(["admin","viewer"] as const).map(r => {
              const cfg = ROLE_CFG[r]
              const sel = role === r
              return (
                <div key={r} onClick={() => setRole(r)} style={{
                  flex:1, padding:"12px 14px", borderRadius: 10, cursor:"pointer",
                  background: sel ? cfg.bg : "var(--card2)",
                  border:`1px solid ${sel ? cfg.color : "var(--border)"}`,
                  transition:"all 0.15s",
                }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                    <div style={{
                      width:14,height:14,borderRadius:"50%",flexShrink:0,
                      border:`2px solid ${sel ? cfg.color : "var(--text-dim)"}`,
                      background: sel ? cfg.color : "none",
                    }} />
                    <span style={{ fontSize:13,fontWeight:600,color: sel ? cfg.color : "var(--secondary)" }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11,color:"var(--text-muted)",lineHeight:1.4 }}>{cfg.desc}</div>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <div style={{
            background:"#E74C3C15",border:"1px solid var(--danger)",
            borderRadius: 10,padding:"8px 12px",marginBottom:14,
            fontSize:12,color:"var(--danger)",
          }}>{error}</div>
        )}

        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{
            flex:1,padding:"8px 0",background:"none",
            border:"1px solid var(--border)",borderRadius: 10,
            color:"var(--secondary)",cursor:"pointer",fontSize:13,
          }}>Cancel</button>
          <button onClick={save} disabled={loading} style={{
            flex:2,padding:"8px 0",
            background: loading ? "var(--card2)" : "var(--success)",
            border:"none",borderRadius: 10,
            color: loading ? "var(--text-dim)" : "#fff",
            cursor: loading ? "not-allowed":"pointer",
            fontWeight:600,fontSize:13,
          }}>
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CFG[role as keyof typeof ROLE_CFG] ?? { color:"var(--secondary)", bg:"#7F8C8D18", label: role }
  return (
    <span style={{
      background:cfg.bg, color:cfg.color,
      border:`1px solid ${cfg.color}44`,
      borderRadius:4, padding:"2px 10px",
      fontSize:11, fontWeight:600, textTransform:"capitalize",
    }}>{cfg.label}</span>
  )
}

// ─── User Management Page ─────────────────────────────────────────────────────

export default function UserManagement() {
  const isMobile = useIsMobile()
  const [users, setUsers]         = useState<UserItem[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<UserItem | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const data = await apiFetch("/users/")
    if (Array.isArray(data)) setUsers(data)
  }, [])

  useEffect(() => { load() }, [load])

  const deleteUser = async (u: UserItem) => {
    if (!confirm(`Delete user "${u.username}"?`)) return
    setDeletingId(u.id)
    try {
      const token = localStorage.getItem("token")
      const raw = await fetch(`${API_BASE}/users/${u.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const res = await raw.json()
      if (!raw.ok) { alert(res?.detail ?? "Delete failed"); return }
      load()
    } catch { alert("Delete failed") }
    setDeletingId(null)
  }

  const admins  = users.filter(u => u.role === "admin").length
  const viewers = users.filter(u => u.role === "viewer").length

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
          <span style={{ fontSize: isMobile?13.5:15, fontWeight: 700 }}>User Management</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 12 }}>{users.length} users</span>
        </div>
        <button onClick={() => { setEditTarget(null); setShowModal(true) }} style={{
          background: "var(--success)", border: "none", color: "#0d1117",
          borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          width: isMobile ? "100%" : undefined,
        }}>+ Create User</button>
      </div>

      <div style={{ padding: isMobile ? "16px" : "24px 28px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10, marginBottom: isMobile?16:24 }}>
          {[
            { label: "Total Users", value: users.length, accent: "var(--text-dim)" },
            { label: "Admins",      value: admins,        accent: "var(--warning)" },
            { label: "Viewers",     value: viewers,       accent: "var(--primary)" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ background: "var(--card)", borderRadius: 10, padding: "14px 18px", border: "1px solid var(--border)", borderTop: `2px solid ${accent}` }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Role legend */}
        <div style={{ background: "var(--card)", borderRadius: 10, padding: "14px 20px", border: "1px solid var(--border)", marginBottom: 20, display: "flex", gap: isMobile?16:32, flexWrap: "wrap" }}>
          {Object.entries(ROLE_CFG).map(([r, cfg]) => (
            <div key={r} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <RoleBadge role={r} />
              <div style={{ fontSize: 12, color: "var(--text-muted)", paddingTop: 1 }}>{cfg.desc}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 130px",
            padding: "10px 20px", borderBottom: "1px solid var(--border)",
            fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5,
            minWidth: isMobile ? 480 : undefined,
          }}>
            <div>Username</div><div>Role</div><div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {users.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-dim)" }}>No users found</div>
          ) : (
            users.map((u, idx) => (
              <div key={u.id} style={{
                minWidth: isMobile ? 480 : undefined,
                display: "grid", gridTemplateColumns: "1fr 1fr 130px",
                padding: "14px 20px", alignItems: "center",
                borderBottom: idx < users.length - 1 ? "1px solid var(--border-subtle)" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: ROLE_CFG[u.role as keyof typeof ROLE_CFG]?.bg ?? "var(--card2)",
                    border: `1px solid ${ROLE_CFG[u.role as keyof typeof ROLE_CFG]?.color ?? "var(--border)"}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                    color: ROLE_CFG[u.role as keyof typeof ROLE_CFG]?.color ?? "var(--text-muted)",
                  }}>{u.username.charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>ID #{u.id}</div>
                  </div>
                </div>
                <div><RoleBadge role={u.role} /></div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button onClick={() => { setEditTarget(u); setShowModal(true) }} style={{
                    background: "#4FA3FF18", border: "1px solid var(--primary)", color: "var(--primary)",
                    borderRadius: 10, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>Edit</button>
                  <button onClick={() => deleteUser(u)} disabled={deletingId === u.id} style={{
                    background: "none", border: "1px solid var(--danger)", color: "var(--danger)",
                    borderRadius: 10, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                    cursor: deletingId === u.id ? "not-allowed" : "pointer",
                    opacity: deletingId === u.id ? 0.5 : 1,
                  }}>{deletingId === u.id ? "…" : "Delete"}</button>
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      </div>

      {showModal && (
        <UserModal user={editTarget} onClose={() => { setShowModal(false); setEditTarget(null) }} onSaved={() => { load(); setShowModal(false); setEditTarget(null) }} />
      )}
    </div>
  )
}