import { useEffect, useState, useCallback } from "react"
import { apiFetch } from "./App"
import { getUserRole } from "./utils/auth"

const API_BASE = import.meta.env.VITE_API_BASE || ""

interface Folder  { id: number; name: string }
interface FileItem {
  id: number; original_name: string; stored_name: string
  extension: string; folder_id: number; file_size: number
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function Files() {
  const role = getUserRole()
  const isAdmin = role === "admin"
  const [folders, setFolders]               = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [files, setFiles]                   = useState<FileItem[]>([])
  const [uploading, setUploading]           = useState(false)
  const [deletingId, setDeletingId]         = useState<number | null>(null)

  useEffect(() => {
    apiFetch("/files/folders").then(data => {
      if (Array.isArray(data)) {
        setFolders(data)
        if (data.length > 0) setSelectedFolder(data[0].id)
      }
    })
  }, [])

  const loadFiles = useCallback(async () => {
    if (!selectedFolder) return
    const data = await apiFetch(`/files/folder/${selectedFolder}`)
    if (Array.isArray(data)) setFiles(data)
    else setFiles([])
  }, [selectedFolder])

  useEffect(() => { loadFiles() }, [loadFiles])

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedFolder) return
    setUploading(true)
    const formData = new FormData()
    formData.append("upload", file)
    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${API_BASE}/files/upload/${selectedFolder}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) { const d = await res.json(); alert(d.detail ?? "Upload failed"); return }
      await loadFiles()
    } catch { alert("Upload failed") }
    setUploading(false)
    e.target.value = ""
  }

  const deleteFile = async (fileId: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    setDeletingId(fileId)
    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${API_BASE}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { const d = await res.json(); alert(d.detail ?? "Delete failed"); return }
      setFiles(prev => prev.filter(f => f.id !== fileId))
    } catch { alert("Delete failed") }
    setDeletingId(null)
  }

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
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>File Library</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 12 }}>{files.length} files</span>
        </div>
        {isAdmin && (
          <label style={{
            background: uploading ? "var(--card2)" : "var(--primary)",
            border: "none", color: uploading ? "var(--text-muted)" : "#fff",
            borderRadius: 10, padding: "7px 16px", fontSize: 13,
            fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {uploading ? (
              <>
                <span style={{ display:"inline-block",width:12,height:12,border:"2px solid var(--border)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite" }} />
                Uploading…
              </>
            ) : "↑ Upload File"}
            <input type="file" accept=".gcode,.3mf,.g,.gco" hidden onChange={uploadFile} disabled={uploading} />
          </label>
        )}
      </div>

      <div style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
        {/* Folders */}
        <div style={{ background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", padding: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Folders</div>
          {folders.map(f => (
            <div key={f.id} onClick={() => setSelectedFolder(f.id)} style={{
              padding: "8px 10px", borderRadius: 10, cursor: "pointer", marginBottom: 3,
              fontSize: 13, fontWeight: selectedFolder === f.id ? 600 : 400,
              background: selectedFolder === f.id ? "#2563eb18" : "none",
              border: `1px solid ${selectedFolder === f.id ? "#2563eb44" : "transparent"}`,
              color: selectedFolder === f.id ? "var(--primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}>{f.name}</div>
          ))}
          {folders.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No folders</div>}
        </div>

        {/* Files table */}
        <div style={{ background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 80px 80px",
            padding: "10px 20px", borderBottom: "1px solid var(--border)",
            fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5,
          }}>
            <div>Filename</div><div>Size</div><div style={{ textAlign: "right" }}>Action</div>
          </div>

          {files.length === 0 ? (
            <div style={{ padding: "64px 0", textAlign: "center", color: "var(--text-dim)" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
              <div style={{ fontSize: 14, marginBottom: 6, color: "var(--text-muted)" }}>No files here</div>
              <div style={{ fontSize: 12 }}>Upload a .gcode or .3mf file to get started</div>
            </div>
          ) : (
            files.map((file, idx) => (
              <div key={file.id} style={{
                display: "grid", gridTemplateColumns: "1fr 80px 80px",
                padding: "13px 20px", alignItems: "center",
                borderBottom: idx < files.length - 1 ? "1px solid var(--border-subtle)" : "none",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.original_name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{file.extension.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatSize(file.file_size)}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {isAdmin && (
                    <button
                      onClick={() => deleteFile(file.id, file.original_name)}
                      disabled={deletingId === file.id}
                      style={{
                        background: "none", border: "1px solid var(--danger)", color: "var(--danger)",
                        borderRadius: 10, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                        cursor: deletingId === file.id ? "not-allowed" : "pointer",
                        opacity: deletingId === file.id ? 0.5 : 1,
                      }}
                    >{deletingId === file.id ? "…" : "Delete"}</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}