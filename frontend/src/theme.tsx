import { createContext, useContext, useState, useEffect } from "react"
import type { ReactNode } from "react"

type Theme = "dark" | "light"

const ThemeContext = createContext<{
  theme: Theme
  toggle: (originX?: number, originY?: number) => void
}>({
  theme: "dark",
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem("theme") as Theme) ?? "dark"
  )

  const applyVars = (t: Theme) => {
    const vars = t === "dark" ? DARK : LIGHT
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty(k, v)
    )
  }

  useEffect(() => {
    localStorage.setItem("theme", theme)
  }, [theme])

  // ✅ UNCHANGED across every retheme in this project — Telegram-style
  // circular reveal, expands outward from the toggle button.
  const toggle = (originX?: number, originY?: number) => {
    const next = theme === "dark" ? "light" : "dark"
    const supportsViewTransitions = "startViewTransition" in document

    if (!supportsViewTransitions) {
      setTheme(next)
      applyVars(next)
      return
    }

    const x = originX ?? window.innerWidth - 40
    const y = originY ?? 40
    document.documentElement.style.setProperty("--reveal-x", `${x}px`)
    document.documentElement.style.setProperty("--reveal-y", `${y}px`)

    // @ts-ignore — View Transitions API
    document.startViewTransition(() => {
      setTheme(next)
      applyVars(next)
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

// ══════════════════════════════════════════════════════════════════════════
// INDUSTRIAL DESIGN TOKENS
// Dark palette is exact per spec (#11151B / #171B22 / #20262F, status
// colors below). Color is reserved for machine status ONLY — everything
// else (buttons, active nav, borders) is neutral. No gradients, no glow.
//
// Status mapping onto this app's 4 printer states + alert levels:
//   printing  -> Printing  #4FA3FF (blue)
//   idle      -> Running   #2ECC71 (green)  — machine healthy, ready
//   paused    -> Paused    #F5B041 (amber)
//   offline   -> Offline   #7F8C8D (neutral gray, deliberately desaturated)
//   error     -> Error     #E74C3C (red)    — hard fault
//   warning   -> Warning   #FF8C42 (orange) — soft/non-fatal alert
//
// #4FA3FF also serves as the one neutral interactive accent (focus rings,
// active nav indicator, links) since it reads as technical/desaturated
// rather than "brand blue" — no separate purple/violet accent exists
// anywhere in this system anymore.
// ══════════════════════════════════════════════════════════════════════════

const STATUS = {
  "--running":   "#2ECC71",
  "--printing":  "#4FA3FF",
  "--paused":    "#F5B041",
  "--warning":   "#FF8C42",
  "--error":     "#E74C3C",
  "--offline":   "#7F8C8D",

  // Back-compat aliases used throughout the existing codebase
  "--success":   "#2ECC71",
  "--primary":   "#4FA3FF",
  "--info":      "#4FA3FF",
  "--danger":    "#E74C3C",
  "--danger-hover": "#cf3a2e",
  "--primary-hover": "#3a8fe0",
  "--primary-2": "#4FA3FF",   // no second gradient stop anymore — flat
  "--gradient-primary": "#4FA3FF",  // flat, NOT a gradient — kept as a
                                     // token name only so nothing that
                                     // still reads it breaks; every
                                     // component was updated to stop
                                     // treating it as a gradient string.
  "--accent":    "#4FA3FF",
}

const DARK = {
  ...STATUS,
  "--bg":              "#11151B",
  "--card":            "#171B22",
  "--card2":           "#20262F",
  "--border":          "rgba(255,255,255,0.07)",
  "--border-subtle":   "rgba(255,255,255,0.05)",
  "--text":            "#E7E9EC",
  "--text-muted":      "#9AA1AC",
  "--text-dim":        "#767E8A",
  "--hover":           "#1c212a",

  "--background":      "#11151B",
  "--surface":          "#171B22",
  "--surface-secondary":"#20262F",
  "--header":           "#171B22",
  "--secondary":        "#9AA1AC",
  "--divider":          "rgba(255,255,255,0.05)",
  "--text-primary":     "#E7E9EC",
  "--text-secondary":   "#9AA1AC",
  "--text-muted-2":     "#767E8A",
  "--selected":         "#4FA3FF1a",
  "--disabled":         "#20262F",
  "--disabled-text":    "#5c6370",

  // Sidebar stays a touch deeper than the base surface — same neutral
  // family, not a separate colorful panel.
  "--sidebar":          "#14181F",
  "--sidebar-2":        "#1b2028",
  "--sidebar-border":   "rgba(255,255,255,0.06)",
  "--sidebar-text":     "#8b93a0",
  "--sidebar-text-active": "#F2F3F5",
}

const LIGHT = {
  ...STATUS,
  "--bg":              "#F4F5F7",
  "--card":            "#FFFFFF",
  "--card2":           "#EDEFF2",
  "--border":          "rgba(0,0,0,0.08)",
  "--border-subtle":   "rgba(0,0,0,0.05)",
  "--text":            "#181B20",
  "--text-muted":      "#5B6270",
  "--text-dim":        "#848B97",
  "--hover":           "#EDEFF2",

  "--background":      "#F4F5F7",
  "--surface":          "#FFFFFF",
  "--surface-secondary":"#EDEFF2",
  "--header":           "#FFFFFF",
  "--secondary":        "#5B6270",
  "--divider":          "rgba(0,0,0,0.05)",
  "--text-primary":     "#181B20",
  "--text-secondary":   "#5B6270",
  "--text-muted-2":     "#848B97",
  "--selected":         "#4FA3FF14",
  "--disabled":         "#EDEFF2",
  "--disabled-text":    "#9aa1ac",

  // Sidebar stays dark-neutral even in light mode — same panel, same
  // status colors, only the content area brightens (matches the "same
  // palette in both themes" requirement carried over from before).
  "--sidebar":          "#181C24",
  "--sidebar-2":        "#20262F",
  "--sidebar-border":   "rgba(255,255,255,0.06)",
  "--sidebar-text":     "#8b93a0",
  "--sidebar-text-active": "#F2F3F5",
}

export function applyInitialTheme() {
  const theme = (localStorage.getItem("theme") ?? "dark") as Theme
  const vars = theme === "dark" ? DARK : LIGHT
  Object.entries(vars).forEach(([k, v]) =>
    document.documentElement.style.setProperty(k, v)
  )
}