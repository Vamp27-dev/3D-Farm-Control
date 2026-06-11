import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { apiFetch } from "./App"

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

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
  const [folders, setFolders]               = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [files, setFiles]                   = useState<FileItem[]>([])
  const [uploading, setUploading]           = useState(false)
  const [deletingId, setDeletingId]         = useState<number | null>(null)

  // ── Folders ──────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/files/folders").then(data => {
      if (Array.isArray(data)) {
        setFolders(data)
        if (data.length > 0) setSelectedFolder(data[0].id)
      }
    })
  }, [])

  // ── Files ─────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!selectedFolder) return
    const data = await apiFetch(`/files/folder/${selectedFolder}`)
    if (Array.isArray(data)) setFiles(data)
    else setFiles([])
  }, [selectedFolder])

  useEffect(() => { loadFiles() }, [loadFiles])

  // ── Upload ────────────────────────────────────────────────────────
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

  // ── Delete ────────────────────────────────────────────────────────
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
    <div style={{
      minHeight: "100vh", background: "#070e1a",
      color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Nav */}
      <div style={{
        borderBottom: "1px solid #0f1f35", padding: "0 32px",
        display: "flex", alignItems: "center", height: 52, gap: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginRight: 32, letterSpacing: 0.5 }}>
          FARM CONTROL
        </span>
        {[["Dashboard", "/"], ["Files", "/files"], ["Batches", "/batches"], ["Printers", "/printers/manage"]].map(([label, path]) => (
          <Link key={label} to={path} style={{
            fontSize: 13,
            color: label === "Files" ? "#f1f5f9" : "#475569",
            textDecoration: "none", padding: "0 16px",
            height: "100%", display: "flex", alignItems: "center",
            fontWeight: label === "Files" ? 600 : 400,
            borderBottom: label === "Files" ? "2px solid #3b82f6" : "2px solid transparent",
          }}>{label}</Link>
        ))}
      </div>

      <div style={{ padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700 }}>File Library</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              Upload and manage your G-code files
            </p>
          </div>
          <label style={{
            background: uploading ? "#0d1b2e" : "#10b981",
            border: "none", color: uploading ? "#475569" : "#fff",
            borderRadius: 8, padding: "9px 20px", fontSize: 14,
            fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {uploading ? (
              <>
                <span style={{
                  display: "inline-block", width: 12, height: 12,
                  border: "2px solid #334155", borderTopColor: "#10b981",
                  borderRadius: "50%", animation: "spin 0.7s linear infinite",
                }} />
                Uploading…
              </>
            ) : "↑ Upload File"}
            <input type="file" accept=".gcode,.3mf,.g,.gco" hidden onChange={uploadFile} disabled={uploading} />
          </label>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>

          {/* Folders */}
          <div style={{ background: "#0a1525", borderRadius: 12, border: "1px solid #0f1f35", padding: 16 }}>
            <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
              Folders
            </div>
            {folders.map(f => (
              <div key={f.id} onClick={() => setSelectedFolder(f.id)} style={{
                padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                marginBottom: 4, fontSize: 13, fontWeight: 500,
                background: selectedFolder === f.id ? "#3b82f6" : "none",
                color: selectedFolder === f.id ? "#fff" : "#64748b",
                transition: "all 0.15s",
              }}>{f.name}</div>
            ))}
            {folders.length === 0 && (
              <div style={{ fontSize: 12, color: "#334155" }}>No folders yet</div>
            )}
          </div>

          {/* Files */}
          <div style={{ background: "#0a1525", borderRadius: 12, border: "1px solid #0f1f35", overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 80px 80px",
              padding: "10px 20px", borderBottom: "1px solid #0f1f35",
              fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5,
            }}>
              <div>Filename</div>
              <div>Size</div>
              <div style={{ textAlign: "right" }}>Action</div>
            </div>

            {files.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: "#334155" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
                <div>No files in this folder</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Upload a .gcode or .3mf file to get started</div>
              </div>
            ) : (
              files.map((file, idx) => (
                <div key={file.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 80px",
                  padding: "13px 20px", alignItems: "center",
                  borderBottom: idx < files.length - 1 ? "1px solid #0a1422" : "none",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#0d1b2e")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div>
                    <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>
                      {file.original_name}
                    </div>
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
                      {file.extension.toUpperCase()}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {formatSize(file.file_size)}
                  </div>

                  {/* ✅ Print button REMOVED — use Batches page to print */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => deleteFile(file.id, file.original_name)}
                      disabled={deletingId === file.id}
                      style={{
                        background: "none",
                        border: "1px solid #ef4444",
                        color: "#ef4444", borderRadius: 6,
                        padding: "4px 10px", fontSize: 12,
                        fontWeight: 600, cursor: deletingId === file.id ? "not-allowed" : "pointer",
                        opacity: deletingId === file.id ? 0.5 : 1,
                      }}
                    >
                      {deletingId === file.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}