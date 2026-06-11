import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { apiFetch } from "./App"

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

interface UserItem { id: number; username: string; role: string }

const ROLE_CFG = {
  admin:  { color: "#f59e0b", bg: "#f59e0b18", label: "Admin",  desc: "Full access — manage printers, users, files, batches" },
  viewer: { color: "#3b82f6", bg: "#3b82f618", label: "Viewer", desc: "Can view dashboard and create batches — no delete/settings" },
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
        background: "#0a1628", border: "1px solid #1e3a5f",
        borderRadius: 12, padding: 28, width: 400,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>
            {isEdit ? "Edit User" : "Create User"}
          </h2>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#475569",fontSize:18,cursor:"pointer" }}>✕</button>
        </div>

        {/* Username */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display:"block",fontSize:10,color:"#475569",marginBottom:5,textTransform:"uppercase",letterSpacing:1.5 }}>
            Username
          </label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="e.g. john_operator"
            style={{
              width:"100%",padding:"8px 12px",background:"#0d1b2e",
              border:"1px solid #1e293b",borderRadius:6,color:"#f1f5f9",
              fontSize:14,boxSizing:"border-box",outline:"none",
            }} />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display:"block",fontSize:10,color:"#475569",marginBottom:5,textTransform:"uppercase",letterSpacing:1.5 }}>
            {isEdit ? "New Password (leave blank to keep)" : "Password"}
          </label>
          <input value={password} onChange={e => setPassword(e.target.value)}
            type="password" placeholder={isEdit ? "••••••••" : "Min 6 characters"}
            style={{
              width:"100%",padding:"8px 12px",background:"#0d1b2e",
              border:"1px solid #1e293b",borderRadius:6,color:"#f1f5f9",
              fontSize:14,boxSizing:"border-box",outline:"none",
            }} />
        </div>

        {/* Role picker */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display:"block",fontSize:10,color:"#475569",marginBottom:8,textTransform:"uppercase",letterSpacing:1.5 }}>
            Role
          </label>
          <div style={{ display:"flex",gap:8 }}>
            {(["admin","viewer"] as const).map(r => {
              const cfg = ROLE_CFG[r]
              const sel = role === r
              return (
                <div key={r} onClick={() => setRole(r)} style={{
                  flex:1, padding:"12px 14px", borderRadius:8, cursor:"pointer",
                  background: sel ? cfg.bg : "#0d1b2e",
                  border:`1px solid ${sel ? cfg.color : "#1e293b"}`,
                  transition:"all 0.15s",
                }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                    <div style={{
                      width:14,height:14,borderRadius:"50%",flexShrink:0,
                      border:`2px solid ${sel ? cfg.color : "#334155"}`,
                      background: sel ? cfg.color : "none",
                    }} />
                    <span style={{ fontSize:13,fontWeight:600,color: sel ? cfg.color : "#64748b" }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11,color:"#475569",lineHeight:1.4 }}>{cfg.desc}</div>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <div style={{
            background:"#ef444415",border:"1px solid #ef4444",
            borderRadius:6,padding:"8px 12px",marginBottom:14,
            fontSize:12,color:"#ef4444",
          }}>{error}</div>
        )}

        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{
            flex:1,padding:"8px 0",background:"none",
            border:"1px solid #1e293b",borderRadius:6,
            color:"#64748b",cursor:"pointer",fontSize:13,
          }}>Cancel</button>
          <button onClick={save} disabled={loading} style={{
            flex:2,padding:"8px 0",
            background: loading ? "#0d1b2e" : "#10b981",
            border:"none",borderRadius:6,
            color: loading ? "#334155" : "#fff",
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
  const cfg = ROLE_CFG[role as keyof typeof ROLE_CFG] ?? { color:"#64748b", bg:"#64748b18", label: role }
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
  const [users, setUsers]         = useState<UserItem[]>([])
  const [modal, setModal]         = useState<UserItem | null | "new">(undefined as any)
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
    <div style={{
      minHeight:"100vh", background:"#070e1a",
      color:"#f1f5f9", fontFamily:"'Inter', system-ui, sans-serif",
    }}>
      {/* Nav */}
      <div style={{
        borderBottom:"1px solid #0f1f35", padding:"0 32px",
        display:"flex", alignItems:"center", height:52, gap:0,
      }}>
        <span style={{ fontSize:13,fontWeight:700,color:"#10b981",marginRight:32,letterSpacing:0.5 }}>
          FARM CONTROL
        </span>
        {[["Dashboard","/"],["Files","/files"],["Batches","/batches"],["Printers","/printers/manage"],["Users","/users/manage"]].map(([label,path]) => (
          <Link key={label} to={path} style={{
            fontSize:13,
            color: label==="Users" ? "#f1f5f9" : "#475569",
            textDecoration:"none", padding:"0 16px",
            height:"100%", display:"flex", alignItems:"center",
            fontWeight: label==="Users" ? 600 : 400,
            borderBottom: label==="Users" ? "2px solid #3b82f6" : "2px solid transparent",
          }}>{label}</Link>
        ))}
        <div style={{ marginLeft:"auto" }}>
          <button onClick={() => { localStorage.removeItem("token"); window.location.href="/login" }}
            style={{
              background:"none",border:"1px solid #1e293b",
              color:"#475569",borderRadius:6,padding:"6px 12px",fontSize:13,cursor:"pointer",
            }}>Logout</button>
        </div>
      </div>

      <div style={{ padding:"28px 32px" }}>

        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24 }}>
          <div>
            <h1 style={{ margin:"0 0 4px",fontSize:24,fontWeight:700 }}>User Management</h1>
            <p style={{ margin:0,fontSize:13,color:"#475569" }}>
              Create, edit, and manage access for all farm users
            </p>
          </div>
          <button onClick={() => { setEditTarget(null); setShowModal(true) }} style={{
            background:"#10b981",border:"none",color:"#fff",
            borderRadius:8,padding:"9px 20px",fontSize:14,fontWeight:600,cursor:"pointer",
          }}>+ Create User</button>
        </div>

        {/* KPIs */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24 }}>
          {[
            { label:"Total Users", value:users.length, accent:"#475569" },
            { label:"Admins",      value:admins,        accent:"#f59e0b" },
            { label:"Viewers",     value:viewers,       accent:"#3b82f6" },
          ].map(({ label,value,accent }) => (
            <div key={label} style={{
              background:"#0a1525",borderRadius:10,padding:"14px 20px",
              border:`1px solid ${accent}22`,borderLeft:`3px solid ${accent}`,
            }}>
              <div style={{ fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:1.5,marginBottom:6 }}>
                {label}
              </div>
              <div style={{ fontSize:26,fontWeight:700,color:accent }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Role legend */}
        <div style={{
          background:"#0a1525",borderRadius:10,padding:"14px 20px",
          border:"1px solid #0f1f35",marginBottom:20,
          display:"flex",gap:32,
        }}>
          {Object.entries(ROLE_CFG).map(([r, cfg]) => (
            <div key={r} style={{ display:"flex",alignItems:"flex-start",gap:10 }}>
              <RoleBadge role={r} />
              <div style={{ fontSize:12,color:"#475569",paddingTop:1 }}>{cfg.desc}</div>
            </div>
          ))}
        </div>

        {/* User table */}
        <div style={{
          background:"#0a1525",borderRadius:12,
          border:"1px solid #0f1f35",overflow:"hidden",
        }}>
          {/* Header */}
          <div style={{
            display:"grid",gridTemplateColumns:"1fr 1fr 120px",
            padding:"10px 20px",borderBottom:"1px solid #0f1f35",
            fontSize:10,color:"#334155",textTransform:"uppercase",letterSpacing:1.5,
          }}>
            <div>Username</div>
            <div>Role</div>
            <div style={{ textAlign:"right" }}>Actions</div>
          </div>

          {users.length === 0 ? (
            <div style={{ padding:"48px 0",textAlign:"center",color:"#334155" }}>No users found</div>
          ) : (
            users.map((u, idx) => (
              <div key={u.id} style={{
                display:"grid",gridTemplateColumns:"1fr 1fr 120px",
                padding:"14px 20px",alignItems:"center",
                borderBottom: idx < users.length-1 ? "1px solid #0a1422" : "none",
                transition:"background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background="#0d1b2e")}
                onMouseLeave={e => (e.currentTarget.style.background="transparent")}
              >
                {/* Username */}
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{
                    width:32,height:32,borderRadius:"50%",
                    background: ROLE_CFG[u.role as keyof typeof ROLE_CFG]?.bg ?? "#1e293b",
                    border:`1px solid ${ROLE_CFG[u.role as keyof typeof ROLE_CFG]?.color ?? "#334155"}44`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:13,fontWeight:700,
                    color: ROLE_CFG[u.role as keyof typeof ROLE_CFG]?.color ?? "#64748b",
                    flexShrink:0,
                  }}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0" }}>{u.username}</div>
                    <div style={{ fontSize:11,color:"#334155" }}>ID #{u.id}</div>
                  </div>
                </div>

                {/* Role */}
                <div><RoleBadge role={u.role} /></div>

                {/* Actions */}
                <div style={{ display:"flex",gap:6,justifyContent:"flex-end" }}>
                  <button onClick={() => { setEditTarget(u); setShowModal(true) }} style={{
                    background:"#3b82f618",border:"1px solid #3b82f6",
                    color:"#3b82f6",borderRadius:6,padding:"4px 10px",
                    fontSize:12,fontWeight:600,cursor:"pointer",
                  }}>Edit</button>
                  <button
                    onClick={() => deleteUser(u)}
                    disabled={deletingId === u.id}
                    style={{
                      background:"none",border:"1px solid #ef4444",
                      color:"#ef4444",borderRadius:6,padding:"4px 10px",
                      fontSize:12,fontWeight:600,
                      cursor: deletingId===u.id ? "not-allowed":"pointer",
                      opacity: deletingId===u.id ? 0.5 : 1,
                    }}
                  >
                    {deletingId===u.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <UserModal
          user={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSaved={() => { load(); setShowModal(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}