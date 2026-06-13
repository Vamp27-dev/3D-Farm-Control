import { createContext, useContext, useState, useEffect } from "react"
import type { ReactNode } from "react"

type Theme = "dark" | "light"

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem("theme") as Theme) ?? "dark"
  )

  useEffect(() => {
    localStorage.setItem("theme", theme)
    const vars = theme === "dark" ? DARK : LIGHT
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty(k, v)
    )
  }, [theme])

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark")

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

const DARK = {
  "--bg":           "#070e1a",
  "--card":         "#0a1525",
  "--card2":        "#0d1b2e",
  "--border":       "#0f1f35",
  "--border-subtle":"#0a1422",
  "--text":         "#f1f5f9",
  "--text-muted":   "#475569",
  "--text-dim":     "#334155",
  "--hover":        "#0d1b2e",
}

const LIGHT = {
  "--bg":           "#f1f5f9",
  "--card":         "#ffffff",
  "--card2":        "#f8fafc",
  "--border":       "#e2e8f0",
  "--border-subtle":"#f1f5f9",
  "--text":         "#0f172a",
  "--text-muted":   "#64748b",
  "--text-dim":     "#94a3b8",
  "--hover":        "#f8fafc",
}

// ── Apply initial theme on load (paste in index.css or index.html <head>) ────
// Or just call this once at app startup:
export function applyInitialTheme() {
  const theme = (localStorage.getItem("theme") ?? "dark") as Theme
  const vars = theme === "dark" ? DARK : LIGHT
  Object.entries(vars).forEach(([k, v]) =>
    document.documentElement.style.setProperty(k, v)
  )
}