// PrinterIcon.tsx — visual representation of printer type in the tray header
// Neptune: open-frame cartesian gantry (matches Elegoo Neptune silhouette)
// Centauri: enclosed CoreXY cube (matches Elegoo Centauri Carbon silhouette)

export default function PrinterIcon({ type, size = 56 }: { type: string; size?: number }) {
  if (type === "centauri") return <CentauriIcon size={size} />
  return <NeptuneIcon size={size} />
}

function NeptuneIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base frame */}
      <rect x="8" y="44" width="48" height="6" rx="1.5" fill="#1a3a5c" />
      <rect x="10" y="50" width="44" height="4" rx="1" fill="#15273d" />

      {/* Vertical gantry posts */}
      <rect x="10" y="10" width="3" height="34" rx="1.5" fill="#4FA3FF" />
      <rect x="51" y="10" width="3" height="34" rx="1.5" fill="#4FA3FF" />

      {/* Top frame bar */}
      <rect x="8" y="8" width="48" height="3" rx="1.5" fill="#4FA3FF" />

      {/* X-axis gantry (horizontal bar that holds extruder) */}
      <rect x="10" y="22" width="44" height="2.5" rx="1.25" fill="#4FA3FF" />

      {/* Extruder carriage */}
      <rect x="27" y="18" width="10" height="10" rx="2" fill="#F5B041" />
      <rect x="30" y="26" width="4" height="5" rx="1" fill="#fbbf24" />

      {/* Print bed */}
      <rect x="16" y="40" width="32" height="4" rx="1" fill="#2ECC71" opacity="0.85" />

      {/* Build plate accent line */}
      <rect x="18" y="41.5" width="28" height="1" rx="0.5" fill="#ffffff" opacity="0.3" />
    </svg>
  )
}

function CentauriIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Enclosure outer shell */}
      <rect x="6" y="6" width="52" height="52" rx="4" stroke="#4FA3FF" strokeWidth="2.5" fill="#0d1e35" />

      {/* Front window panel */}
      <rect x="11" y="11" width="42" height="36" rx="2" fill="#15273d" stroke="#1a3a5c" strokeWidth="1" />

      {/* Internal CoreXY gantry hint — top rail */}
      <rect x="14" y="15" width="36" height="2" rx="1" fill="#4FA3FF" />

      {/* Extruder carriage inside */}
      <rect x="27" y="20" width="10" height="9" rx="2" fill="#F5B041" />
      <rect x="30" y="27" width="4" height="4" rx="1" fill="#fbbf24" />

      {/* Print bed inside enclosure */}
      <rect x="16" y="38" width="32" height="4" rx="1" fill="#2ECC71" opacity="0.85" />

      {/* Bottom control panel / base */}
      <rect x="8" y="50" width="48" height="6" rx="1.5" fill="#1a3a5c" />
      <circle cx="14" cy="53" r="1.5" fill="#2ECC71" />
      <rect x="20" y="52" width="14" height="2" rx="1" fill="#475569" />
    </svg>
  )
}