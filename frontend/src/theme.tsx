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

  // ✅ Telegram-style circular reveal — expands outward from the toggle button
  const toggle = (originX?: number, originY?: number) => {
    const next = theme === "dark" ? "light" : "dark"

    // Browsers without View Transitions API fall back to instant switch
    const supportsViewTransitions = "startViewTransition" in document

    if (!supportsViewTransitions) {
      setTheme(next)
      applyVars(next)
      return
    }

    // Set CSS vars for the reveal origin point (defaults to top-right where toggle usually sits)
    const x = originX ?? window.innerWidth - 40
    const y = originY ?? 40
    document.documentElement.style.setProperty("--reveal-x", `${x}px`)
    document.documentElement.style.setProperty("--reveal-y", `${y}px`)

    // @ts-ignore — View Transitions API, not yet in TS lib fully
    const transition = document.startViewTransition(() => {
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

// ✅ Dark theme — unchanged, already had good contrast
const DARK = {
  "--bg":            "#070e1a",
  "--card":          "#0a1525",
  "--card2":         "#0d1b2e",
  "--border":        "#1a3a5c",
  "--border-subtle": "#15273d",
  "--text":          "#f1f5f9",
  "--text-muted":    "#94a3b8",
  "--text-dim":      "#64748b",
  "--hover":         "#0d1b2e",
}

// ✅ Light theme — FIXED contrast. Old --text-dim (#94a3b8) was nearly
// invisible on white backgrounds. New values are darker, WCAG-friendly.
const LIGHT = {
  "--bg":            "#f8fafc",
  "--card":          "#ffffff",
  "--card2":         "#f1f5f9",
  "--border":        "#cbd5e1",
  "--border-subtle": "#e2e8f0",
  "--text":          "#0f172a",   // near-black, max contrast for primary text
  "--text-muted":    "#475569",   // dark slate — readable secondary text (was #64748b, too light)
  "--text-dim":      "#64748b",   // medium slate — readable tertiary text (was #94a3b8, too light)
  "--hover":         "#f1f5f9",
}

export function applyInitialTheme() {
  const theme = (localStorage.getItem("theme") ?? "dark") as Theme
  const vars = theme === "dark" ? DARK : LIGHT
  Object.entries(vars).forEach(([k, v]) =>
    document.documentElement.style.setProperty(k, v)
  )
}