// ══════════════════════════════════════════════════════════════════════════
// Icon system — outline SVG only, no emoji anywhere in the app.
// Consistent 1.6px stroke, 24x24 viewbox, currentColor (inherits text color).
// Matches "small, precise, minimal, engineering-focused" per design brief.
// ══════════════════════════════════════════════════════════════════════════

interface IconProps { size?: number; strokeWidth?: number; style?: React.CSSProperties }
import type React from "react"

const base = (size: number, strokeWidth: number) => ({
  width: size, height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
})

export const IconDashboard = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
)
export const IconFiles = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M4 4h6l2 2h8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg>
)
export const IconBatch = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><rect x="3" y="4" width="18" height="4"/><rect x="3" y="10" width="18" height="4"/><rect x="3" y="16" width="12" height="4"/></svg>
)
export const IconPrinter = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><rect x="4" y="9" width="16" height="7" rx="1"/><circle cx="17" cy="12" r="0.6" fill="currentColor"/></svg>
)
export const IconHistory = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>
)
export const IconUsers = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="9" cy="8" r="3"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.3"/><path d="M15.5 14.2c2.6.4 4.5 2.4 4.5 5.3"/></svg>
)
export const IconGauge = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M4.5 17a7.5 7.5 0 1 1 15 0"/><path d="M12 17l3.5-4.5"/><path d="M12 17h.01"/></svg>
)
export const IconPlay = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M6 4.5l13 7.5-13 7.5V4.5z"/></svg>
)
export const IconPause = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><rect x="6" y="4" width="4" height="16" rx="0.5"/><rect x="14" y="4" width="4" height="16" rx="0.5"/></svg>
)
export const IconStop = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>
)
export const IconPower = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>
)
export const IconAlert = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M12 3.5l9.5 16.5H2.5L12 3.5z"/><path d="M12 10v4"/><circle cx="12" cy="16.7" r="0.6" fill="currentColor"/></svg>
)
export const IconCheck = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M4 12.5l5.5 5.5L20 7"/></svg>
)
export const IconThermometer = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M12 14.5V5a2 2 0 1 0-4 0v9.5a4 4 0 1 0 4 0z"/></svg>
)
export const IconBed = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><rect x="3" y="11" width="18" height="8" rx="1"/><path d="M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/></svg>
)
export const IconLightOn = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="12" cy="10" r="5.5"/><path d="M10 19h4M11 21h2"/><path d="M12 2.5v1.3M20 10h-1.3M4 10H2.7M18 4.3l-.9.9M6.9 5.2l-.9-.9"/></svg>
)
export const IconLightOff = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="12" cy="10" r="5.5"/><path d="M10 19h4M11 21h2"/></svg>
)
export const IconSnowflake = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M12 2.5v19M4.5 6.75l15 10.5M19.5 6.75l-15 10.5"/></svg>
)
export const IconX = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M5 5l14 14M19 5L5 19"/></svg>
)
export const IconPin = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M12 2.5c-3 0-5.5 2.3-5.5 5.7 0 4.1 5.5 11.3 5.5 11.3s5.5-7.2 5.5-11.3C17.5 4.8 15 2.5 12 2.5z"/><circle cx="12" cy="8.2" r="2"/></svg>
)
export const IconSun = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>
)
export const IconMoon = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>
)
export const IconLogout = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
)
export const IconSpool = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/></svg>
)
export const IconTrash = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M18 7l-.8 12.5a1.5 1.5 0 0 1-1.5 1.5H8.3a1.5 1.5 0 0 1-1.5-1.5L6 7"/></svg>
)
export const IconCamera = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M4 8a1 1 0 0 1 1-1h2l1.2-1.8a1 1 0 0 1 .8-.4h6a1 1 0 0 1 .8.4L17 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z"/><circle cx="12" cy="13" r="3.2"/></svg>
)
export const IconSearch = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg>
)
export const IconChart = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12.5 16V8M17 16v-7"/></svg>
)
export const IconChevronRight = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M9 5l7 7-7 7"/></svg>
)
export const IconPlus = ({ size=16, strokeWidth=1.6, style }: IconProps) => (
  <svg {...base(size,strokeWidth)} style={style}><path d="M12 5v14M5 12h14"/></svg>
)