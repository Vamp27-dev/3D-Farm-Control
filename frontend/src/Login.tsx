import { useState } from "react"
import { useNavigate } from "react-router-dom"

// ✅ Relative URL — works from any IP/network
const API_BASE = import.meta.env.VITE_API_BASE || ""

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!username || !password) { setError("Enter username and password"); return }
    setError("")
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail ?? "Invalid credentials")
        setLoading(false)
        return
      }

      localStorage.setItem("token", data.access_token)
      localStorage.setItem("role", data.role ?? "viewer")
      navigate("/")

    } catch (e) {
      setError("Cannot reach server — check network connection")
    }

    setLoading(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin()
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        width: 380, padding: "40px 36px",
        background: "#0a1628",
        border: "1px solid #1a3a5c",
        borderRadius: 14,
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px #1a3a5c44",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, marginBottom: 14,
            boxShadow: "0 0 24px #2563eb44",
          }}>🖨️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
            Farm Controller
          </div>
          <div style={{ fontSize: 12, color: "#4a6080" }}>
            3D Production Platform
          </div>
        </div>

        {/* Fields */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block", fontSize: 10, color: "#4a6080",
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6,
          }}>Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Enter username"
            autoComplete="username"
            style={{
              width: "100%", padding: "10px 14px",
              background: "#0d1e35", border: "1px solid #1a3a5c",
              borderRadius: 8, color: "#f1f5f9", fontSize: 14,
              boxSizing: "border-box", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.target.style.borderColor = "#2563eb")}
            onBlur={e => (e.target.style.borderColor = "#1a3a5c")}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "block", fontSize: 10, color: "#4a6080",
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6,
          }}>Password</label>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKey}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            style={{
              width: "100%", padding: "10px 14px",
              background: "#0d1e35", border: "1px solid #1a3a5c",
              borderRadius: 8, color: "#f1f5f9", fontSize: 14,
              boxSizing: "border-box", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.target.style.borderColor = "#2563eb")}
            onBlur={e => (e.target.style.borderColor = "#1a3a5c")}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "#ef444415", border: "1px solid #ef444444",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            fontSize: 13, color: "#ef4444",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>⚠</span> {error}
          </div>
        )}

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%", padding: "11px 0",
            background: loading ? "#1a3a5c" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
            border: "none", borderRadius: 8,
            color: loading ? "#4a6080" : "#fff",
            fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? (
            <>
              <span style={{
                display: "inline-block", width: 14, height: 14,
                border: "2px solid #4a6080", borderTopColor: "#2563eb",
                borderRadius: "50%", animation: "spin 0.7s linear infinite",
              }} />
              Signing in…
            </>
          ) : "Sign In"}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#2a4060" }}>
          Made by Ashwit ❤️
        </div>
      </div>
    </div>
  )
}