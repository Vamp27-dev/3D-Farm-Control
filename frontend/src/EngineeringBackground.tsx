import { useState, useEffect } from "react"

// ══════════════════════════════════════════════════════════════════════════
// Procedural engineering background — NOT a static image. Pure SVG pattern
// tiles + CSS animation, kept under ~5% opacity throughout. Content stays
// the visual focus; this is texture, not decoration.
// ══════════════════════════════════════════════════════════════════════════

type Variant = "dashboard" | "files" | "batch" | "history" | "users" | "default"

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const listener = () => setReduced(mq.matches)
    mq.addEventListener("change", listener)
    return () => mq.removeEventListener("change", listener)
  }, [])
  return reduced
}

// Per-page overlay content — sits on top of the shared blueprint grid.
function VariantOverlay({ variant, reduced }: { variant: Variant; reduced: boolean }) {
  switch (variant) {
    case "dashboard":
      // Faint printer-network topology — nodes + connecting routes
      return (
        <g>
          {[[120,140],[380,90],[640,180],[900,110],[1150,220],[300,320],[700,380],[1000,340]].map(([x,y],i)=>(
            <g key={i}>
              <circle cx={x} cy={y} r="2.2" fill="none" stroke="currentColor" strokeWidth="1">
                {!reduced && <animate attributeName="r" values="2.2;3.4;2.2" dur={`${4+i*0.4}s`} repeatCount="indefinite" />}
              </circle>
              <circle cx={x} cy={y} r="6" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </g>
          ))}
          <path d="M120,140 L380,90 M380,90 L640,180 M640,180 L900,110 M900,110 L1150,220 M120,140 L300,320 M300,320 L700,380 M700,380 L1000,340 M640,180 L700,380"
                fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1 5" />
        </g>
      )
    case "files":
      // CAD wireframe mesh + layer slices
      return (
        <g>
          <g transform="translate(150,120)">
            <polygon points="0,80 90,30 180,80 90,130" fill="none" stroke="currentColor" strokeWidth="0.7" />
            <polygon points="0,80 0,20 90,-30 90,30" fill="none" stroke="currentColor" strokeWidth="0.7" />
            <polygon points="90,30 90,-30 180,20 180,80" fill="none" stroke="currentColor" strokeWidth="0.7" />
            <line x1="0" y1="20" x2="90" y2="70" stroke="currentColor" strokeWidth="0.5" />
          </g>
          {[0,1,2,3,4].map(i => (
            <line key={i} x1={700} y1={80+i*26} x2={1050} y2={80+i*26} stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 4" />
          ))}
        </g>
      )
    case "batch":
      // Production queue / routing lanes
      return (
        <g>
          {[0,1,2,3].map(i => (
            <g key={i}>
              <line x1="100" y1={100+i*70} x2="1100" y2={100+i*70} stroke="currentColor" strokeWidth="0.6" />
              {[0,1,2,3,4,5].map(j => (
                <rect key={j} x={140+j*160} y={100+i*70-8} width="14" height="16" fill="none" stroke="currentColor" strokeWidth="0.6" />
              ))}
            </g>
          ))}
        </g>
      )
    case "history":
      // Timeline + inspection ticks
      return (
        <g>
          <line x1="80" y1="240" x2="1120" y2="240" stroke="currentColor" strokeWidth="0.7" />
          {Array.from({length:18}).map((_,i)=>(
            <line key={i} x1={80+i*58} y1="232" x2={80+i*58} y2="248" stroke="currentColor" strokeWidth="0.6" />
          ))}
          <circle cx="450" cy="240" r="5" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <circle cx="750" cy="240" r="5" fill="none" stroke="currentColor" strokeWidth="0.8" />
        </g>
      )
    case "users":
      // Minimal hierarchy / org network
      return (
        <g>
          <circle cx="600" cy="100" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
          {[400,500,700,800].map((x,i)=>(
            <g key={i}>
              <line x1="600" y1="100" x2={x} y2="220" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1 5" />
              <circle cx={x} cy="220" r="2.4" fill="none" stroke="currentColor" strokeWidth="1" />
            </g>
          ))}
        </g>
      )
    default:
      return null
  }
}

export default function EngineeringBackground({ variant = "default" }: { variant?: Variant }) {
  const reduced = usePrefersReducedMotion()

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: 0,
      overflow: "hidden", pointerEvents: "none",
      color: "var(--text)",
    }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          {/* Base blueprint grid — fine + coarse lines */}
          <pattern id="bp-grid-fine" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
          <pattern id="bp-grid-coarse" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M120 0H0V120" fill="none" stroke="currentColor" strokeWidth="0.9" />
          </pattern>
        </defs>

        <g opacity="0.09" className={reduced ? "" : "bp-drift"}>
          <rect width="100%" height="100%" fill="url(#bp-grid-fine)" />
          <rect width="100%" height="100%" fill="url(#bp-grid-coarse)" />
        </g>

        <g opacity="0.13" transform="translate(0,0)" color="var(--primary)">
          <VariantOverlay variant={variant} reduced={reduced} />
        </g>
      </svg>

      {/* Soft scan line — sweeps down once every 20s, barely visible */}
      {!reduced && <div className="bp-scanline" />}

      <style>{`
        @keyframes bp-drift-anim {
          0%   { transform: translate(0,0); }
          100% { transform: translate(-24px,-24px); }
        }
        .bp-drift { animation: bp-drift-anim 40s linear infinite; }

        @keyframes bp-scan {
          0%, 92%, 100% { transform: translateY(-10%); opacity: 0; }
          94% { opacity: 0.4; }
          98% { opacity: 0; }
          96% { transform: translateY(110%); }
        }
        .bp-scanline {
          position: absolute; left: 0; right: 0; height: 120px;
          background: linear-gradient(180deg, transparent, var(--primary), transparent);
          opacity: 0.04;
          animation: bp-scan 20s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}