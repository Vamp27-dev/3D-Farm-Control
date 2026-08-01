import { useState } from "react"

// ✅ Shared "Start Print" options modal for Centauri Carbon printers only.
// Mirrors the printer's own web control "Send Print Task" dialog: build
// plate side, heated bed leveling, and time-lapse. Neptune/Klipper never
// renders this — callers only show it when printer.type === "centauri".
//
// Used by:
//   - Batches.tsx  -> Start Batch button (all printers in the batch)
//   - App.tsx      -> PrinterTray "Start Next Job" button (single printer)

export interface CentauriPrintOptions {
  bedLeveling: boolean
  plateType: 0 | 1   // 0 = Textured (Side A), 1 = Smooth (Side B)
  timeLapse: boolean
}

function Toggle({ checked, onChange, label, sub }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: "var(--card2)",
        border: "1px solid var(--border)", borderRadius: 10,
        cursor: "pointer", marginBottom: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{
        width: 38, height: 22, borderRadius: 11, position: "relative",
        background: checked ? "var(--primary)" : "var(--border)",
        transition: "background 0.15s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }} />
      </div>
    </div>
  )
}

export default function CentauriPrintOptionsModal({
  fileName, printerLabel, onCancel, onConfirm, loading,
}: {
  fileName: string
  printerLabel: string          // e.g. "3 printers" or a single printer name
  onCancel: () => void
  onConfirm: (opts: CentauriPrintOptions) => void
  loading?: boolean
}) {
  const [plateType, setPlateType]     = useState<0 | 1>(0)
  const [bedLeveling, setBedLeveling] = useState(true)
  const [timeLapse, setTimeLapse]     = useState(false)

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 70, backdropFilter: "blur(2px)",
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 28, width: 400,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        fontFamily: "'Inter',system-ui,sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Send Print Task</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20, wordBreak: "break-word" }}>
          {fileName} → {printerLabel}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Build Plate
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { val: 0 as const, label: "Textured", sub: "Side A" },
              { val: 1 as const, label: "Smooth",   sub: "Side B" },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setPlateType(opt.val)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10,
                  border: `1px solid ${plateType === opt.val ? "var(--primary)" : "var(--border)"}`,
                  background: plateType === opt.val ? "#4FA3FF18" : "var(--card2)",
                  color: plateType === opt.val ? "var(--primary)" : "var(--text)",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                {opt.label}
                <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, marginTop: 2 }}>{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Options
          </label>
          <Toggle
            checked={bedLeveling}
            onChange={setBedLeveling}
            label="Heated Bed Leveling"
            sub="Recommended before every print"
          />
          <Toggle
            checked={timeLapse}
            onChange={setTimeLapse}
            label="Time-lapse"
            sub="Records a video of the print"
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={loading} style={{
            flex: 1, padding: "9px 0", background: "none",
            border: "1px solid var(--border)", borderRadius: 10,
            color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>Cancel</button>
          <button
            onClick={() => onConfirm({ bedLeveling, plateType, timeLapse })}
            disabled={loading}
            style={{
              flex: 2, padding: "9px 0",
              background: loading ? "var(--card2)" : "var(--primary)",
              border: "none", borderRadius: 10,
              color: loading ? "var(--text-muted)" : "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: 13,
            }}
          >
            {loading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}