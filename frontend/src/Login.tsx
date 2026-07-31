import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"

// ✅ Relative URL — works from any IP/network
const API_BASE = import.meta.env.VITE_API_BASE || ""

// ✅ Background video lives as a static asset in frontend/public/, not an
// external URL — self-contained, no CDN dependency, works even if the
// printer-subnet PC has no general internet access.
const VIDEO_SRC = "/login-bg.mp4"

// ── Farm Pulse signature strip ──────────────────────────────────────────────
// Echoes the "Farm Pulse bar" already in the app's Sidebar — a row of tiny
// printer-status lights, each pulsing at its own offset. Before you've even
// logged in, it signals: this connects to a real, live, breathing farm.
const PULSE_COLORS = ["#10b981", "#10b981", "#2563eb", "#10b981", "#f59e0b", "#10b981", "#2563eb", "#10b981"]

function FarmPulseStrip({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div style={{ display: "flex", gap: 5, marginBottom: 18 }} aria-hidden="true">
      {PULSE_COLORS.map((c, i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: 2, background: c,
          boxShadow: `0 0 6px ${c}99`,
          animation: reduceMotion ? "none" : `pulseDot 2.6s ease-in-out ${i * 0.22}s infinite`,
          opacity: 0.55,
        }} />
      ))}
    </div>
  )
}

// ── Ambient telemetry HUD ────────────────────────────────────────────────────
// A small monospace readout, styled like the printer's own onboard display
// (the same kind of live coordinate/temp panel you'd see on the machine
// itself), overlaid in the corner of the video. Numbers describe THIS
// printer in the clip — not a claim about the real farm's live state,
// which isn't known before login.
function TelemetryHUD({ reduceMotion }: { reduceMotion: boolean }) {
  const [layer, setLayer] = useState(812)

  useEffect(() => {
    if (reduceMotion) return
    const i = setInterval(() => {
      setLayer(l => (l >= 1400 ? 812 : l + 1))
    }, 1400)
    return () => clearInterval(i)
  }, [reduceMotion])

  const rows = [
    { label: "LAYER",     value: `${layer} / 1400` },
    { label: "NOZZLE",    value: "214°C" },
    { label: "BED",       value: "60°C" },
    { label: "FEED RATE", value: "100%" },
  ]

  return (
    <div style={{
      position: "absolute", left: 40, bottom: 40,
      fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
      fontSize: 11, letterSpacing: 0.5, lineHeight: 1.9,
      color: "#8fb4d9", textShadow: "0 1px 8px rgba(0,0,0,0.8)",
      userSelect: "none", pointerEvents: "none",
      opacity: 0.85,
    }} aria-hidden="true">
      <div style={{ color: "#10b981", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: "#10b981",
          display: "inline-block", boxShadow: "0 0 6px #10b981",
          animation: reduceMotion ? "none" : "blink 1.6s ease-in-out infinite",
        }} />
        PRINTING
      </div>
      {rows.map(r => (
        <div key={r.label}>
          <span style={{ color: "#4a6080" }}>{r.label.padEnd(10, "\u00A0")}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [showError, setShowError] = useState(false)
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)

  // ✅ prefers-reduced-motion: pause the background video and skip every
  // decorative animation (entrance choreography, pulse strip, HUD blink)
  // for people who've asked their system for less motion.
  const [reduceMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  useEffect(() => {
    if (reduceMotion && videoRef.current) {
      videoRef.current.pause()
    }
  }, [reduceMotion])

  useEffect(() => {
    if (error) {
      setShowError(true)
    }
  }, [error])

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
      position: "relative",
      minHeight: "100vh", width: "100%",
      overflow: "hidden",
      background: "#050a14",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* ── Background video ── */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay={!reduceMotion}
        loop
        muted
        playsInline
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          filter: "brightness(0.62) saturate(1.05)",
        }}
      />

      {/* ── Scrim: darkens overall + extra gradient toward the card side so
          text stays readable regardless of what's happening in the footage ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          linear-gradient(90deg, rgba(5,10,20,0.35) 0%, rgba(5,10,20,0.55) 45%, rgba(5,10,20,0.88) 68%, rgba(5,10,20,0.96) 100%),
          radial-gradient(ellipse at 30% 40%, rgba(5,10,20,0) 0%, rgba(5,10,20,0.5) 75%)
        `,
      }} />

      {/* ── Ambient telemetry HUD (desktop only — keeps mobile uncluttered) ── */}
      <div className="hud-layer">
        <TelemetryHUD reduceMotion={reduceMotion} />
      </div>

      {/* ── Login card ── */}
      <div style={{
        position: "relative", zIndex: 2,
        minHeight: "100vh",
        display: "flex", alignItems: "center",
        justifyContent: "flex-end",
        padding: "24px 8vw",
        boxSizing: "border-box",
      }} className="login-layout">
        <div className="login-card" style={{
          width: 380, padding: "40px 36px",
          background: "rgba(10, 21, 37, 0.58)",
          backdropFilter: "blur(22px) saturate(1.4)",
          WebkitBackdropFilter: "blur(22px) saturate(1.4)",
          border: "1px solid rgba(26, 58, 92, 0.7)",
          borderRadius: 16,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(26,58,92,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
          animation: reduceMotion ? "none" : "cardIn 0.7s cubic-bezier(0.16,1,0.3,1) both",
        }}>
          {/* Signature: Farm Pulse strip */}
          <div style={{ animation: reduceMotion ? "none" : "fieldIn 0.5s ease both 0.05s" }}>
            <FarmPulseStrip reduceMotion={reduceMotion} />
          </div>

          {/* Logo / wordmark */}
          <div style={{
            textAlign: "center", marginBottom: 32,
            animation: reduceMotion ? "none" : "fieldIn 0.5s ease both 0.12s",
          }}>
            <div style={{
              fontSize: 9, fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              letterSpacing: 2.5, color: "#4a6080", marginBottom: 14,
              textTransform: "uppercase",
            }}>
              Print Farm // Access
            </div>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, marginBottom: 14,
              boxShadow: "0 0 24px #2563eb44",
            }}>🖨️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 4, letterSpacing: -0.3 }}>
              Farm Controller
            </div>
            <div style={{ fontSize: 12, color: "#4a6080" }}>
              3D Production Platform
            </div>
          </div>

          {/* Fields */}
          <div style={{ marginBottom: 16, animation: reduceMotion ? "none" : "fieldIn 0.5s ease both 0.19s" }}>
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
              className="login-input"
              style={{
                width: "100%", padding: "10px 14px",
                background: "rgba(13, 30, 53, 0.7)", border: "1px solid #1a3a5c",
                borderRadius: 8, color: "#f1f5f9", fontSize: 14,
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 24, animation: reduceMotion ? "none" : "fieldIn 0.5s ease both 0.26s" }}>
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
              className="login-input"
              style={{
                width: "100%", padding: "10px 14px",
                background: "rgba(13, 30, 53, 0.7)", border: "1px solid #1a3a5c",
                borderRadius: 8, color: "#f1f5f9", fontSize: 14,
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          {/* Error */}
          {showError && error && (
            <div style={{
              background: "#ef444415", border: "1px solid #ef444444",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 13, color: "#ef4444",
              display: "flex", alignItems: "center", gap: 8,
              animation: reduceMotion ? "none" : "shake 0.4s ease",
            }}>
              <span>⚠</span> {error}
            </div>
          )}

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="login-btn"
            style={{
              width: "100%", padding: "11px 0",
              background: loading ? "#1a3a5c" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none", borderRadius: 8,
              color: loading ? "#4a6080" : "#fff",
              fontSize: 14, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              animation: reduceMotion ? "none" : "fieldIn 0.5s ease both 0.33s",
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

          <div style={{
            textAlign: "center", marginTop: 20, fontSize: 11, color: "#2a4060",
            animation: reduceMotion ? "none" : "fieldIn 0.5s ease both 0.4s",
          }}>
            Made by Ashwit ❤️
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fieldIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.3); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.25; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-4px); }
          75%      { transform: translateX(4px); }
        }

        .login-input {
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .login-input:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px #2563eb22;
          background: rgba(13, 30, 53, 0.95) !important;
        }
        .login-btn {
          transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
        }
        .login-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px #2563eb55;
          filter: brightness(1.08);
        }
        .login-btn:not(:disabled):active {
          transform: translateY(0) scale(0.98);
        }

        .hud-layer { display: block; }

        @media (max-width: 900px) {
          .login-layout { justify-content: center !important; padding: 24px !important; }
          .hud-layer { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-input, .login-btn { transition: none !important; }
        }
      `}</style>
    </div>
  )
}