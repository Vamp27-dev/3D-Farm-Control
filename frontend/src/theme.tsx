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

  // ✅ UNCHANGED — Telegram-style circular reveal, expands outward from the
  // toggle button. Kept exactly as-is across every retheme in this project;
  // only the token values underneath it change.
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

    // @ts-ignore — View Transitions API, not yet in TS lib fully
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
// DESIGN TOKENS — matching the reference (Jidox admin template) frame-by-
// frame color extraction, not eyeballed:
//   sidebar dark surface   #323945 / #2d323c
//   primary indigo         #434db5
//   primary gradient       #434db5 → #7d4dbf  (indigo -> violet, sampled
//                           directly off the active sidebar nav pill)
//   success (teal)         #22b196
//   warning (amber)        #f7c613
//   danger (red)           #e7343a
//   info (sky blue)        #32a0ef
//
// KEY DECISION (per explicit request — "same accent, same gradient, same
// colour palette... for both dark and light theme"): the sidebar and the
// five accent colors (primary/success/warning/danger/info) are IDENTICAL
// between themes — only backgrounds/surfaces/borders/text shift. This
// matches the reference exactly: every screenshot in the video has the
// same dark indigo-slate sidebar regardless of whether the page content
// itself is light or dark.
// ══════════════════════════════════════════════════════════════════════════

const ACCENTS = {
  "--primary":          "#434db5",
  "--primary-2":        "#7d4dbf",   // gradient endpoint (indigo -> violet)
  "--primary-hover":    "#3a4399",
  "--success":          "#22b196",
  "--warning":          "#f7c613",
  "--danger":           "#e7343a",
  "--danger-hover":     "#d42832",
  "--info":             "#32a0ef",
  "--accent":           "#32a0ef",
  "--gradient-primary": "linear-gradient(135deg, #434db5 0%, #7d4dbf 100%)",

  // ✅ Sidebar is permanently dark indigo-slate in BOTH themes (matches
  // reference exactly — this is what "same styling for both themes" means
  // in practice: the shell stays constant, the content area adapts).
  "--sidebar":          "#2b303c",
  "--sidebar-2":        "#323945",   // hover / nested surface within sidebar
  "--sidebar-border":   "#3a4150",
  "--sidebar-text":     "#a7adba",
  "--sidebar-text-active": "#ffffff",
}

const DARK = {
  ...ACCENTS,
  "--bg":              "#1a1d27",
  "--card":            "#232733",
  "--card2":           "#2b303c",
  "--border":          "#383e4c",
  "--border-subtle":   "#2b303c",
  "--text":            "#f1f1f5",
  "--text-muted":      "#b0b4c2",
  "--text-dim":        "#949bac",
  "--hover":           "#2b303c",

  "--background":      "#1a1d27",
  "--surface":          "#232733",
  "--surface-secondary":"#2b303c",
  "--header":           "#232733",
  "--secondary":        "#94A3B8",
  "--divider":          "#2b303c",
  "--text-primary":     "#f1f1f5",
  "--text-secondary":   "#b0b4c2",
  "--text-muted-2":     "#949bac",
  "--selected":         "#434db522",
  "--disabled":         "#383e4c",
  "--disabled-text":    "#6b7280",
}

const LIGHT = {
  ...ACCENTS,
  "--bg":              "#f3f2f8",
  "--card":            "#ffffff",
  "--card2":           "#f7f6fa",
  "--border":          "#e7e5ee",
  "--border-subtle":   "#f0eff5",
  "--text":            "#242424",
  "--text-muted":      "#6b7280",
  "--text-dim":        "#9a9aa5",
  "--hover":           "#f5f4fa",

  "--background":      "#f3f2f8",
  "--surface":          "#ffffff",
  "--surface-secondary":"#f7f6fa",
  "--header":           "#ffffff",
  "--secondary":        "#64748B",
  "--divider":          "#f0eff5",
  "--text-primary":     "#242424",
  "--text-secondary":   "#6b7280",
  "--text-muted-2":     "#9a9aa5",
  "--selected":         "#434db514",
  "--disabled":         "#e7e5ee",
  "--disabled-text":    "#9a9aa5",
}

export function applyInitialTheme() {
  const theme = (localStorage.getItem("theme") ?? "dark") as Theme
  const vars = theme === "dark" ? DARK : LIGHT
  Object.entries(vars).forEach(([k, v]) =>
    document.documentElement.style.setProperty(k, v)
  )
}