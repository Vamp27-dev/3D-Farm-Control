import { forwardRef } from "react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

// ══════════════════════════════════════════════════════════════════════════
// Unified Button system — Linear/Stripe/Notion-grade.
// Every button in the app should migrate to this component over time so
// hover/pressed/focus/disabled/loading states and spacing stay perfectly
// consistent everywhere, instead of every page hand-rolling its own.
// ══════════════════════════════════════════════════════════════════════════

export type ButtonVariant =
  | "primary" | "secondary" | "outlined" | "ghost"
  | "success" | "warning" | "danger" | "info" | "neutral"
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl"

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
}

const SIZE_MAP: Record<ButtonSize, { pad: string; font: number; gap: number; iconOnly: number }> = {
  xs: { pad: "4px 10px",  font: 12, gap: 5, iconOnly: 26 },
  sm: { pad: "6px 12px",  font: 13, gap: 6, iconOnly: 30 },
  md: { pad: "9px 16px",  font: 14, gap: 7, iconOnly: 36 },
  lg: { pad: "11px 20px", font: 15, gap: 8, iconOnly: 42 },
  xl: { pad: "13px 26px", font: 16, gap: 9, iconOnly: 48 },
}

function variantStyle(variant: ButtonVariant, disabled: boolean) {
  if (disabled) {
    return {
      background: "var(--disabled,#334155)",
      color: "var(--disabled-text,#64748B)",
      border: "1px solid transparent",
    }
  }
  switch (variant) {
    case "primary":
      return { background: "var(--primary,#4FA3FF)", color: "#0d1117", border: "1px solid transparent" }
    case "secondary":
      return { background: "var(--card,#111827)", color: "var(--text,#F8FAFC)", border: "1px solid var(--border,#334155)" }
    case "outlined":
      return { background: "transparent", color: "var(--primary,#3B82F6)", border: "1px solid var(--primary,#3B82F6)" }
    case "ghost":
      return { background: "transparent", color: "var(--text-muted,#CBD5E1)", border: "1px solid transparent" }
    case "success":
      return { background: "var(--success,#22C55E)", color: "#fff", border: "1px solid transparent" }
    case "warning":
      return { background: "var(--warning,#FBBF24)", color: "#111827", border: "1px solid transparent" }
    case "danger":
      return { background: "var(--danger,#F87171)", color: "#fff", border: "1px solid transparent" }
    case "info":
      return { background: "var(--accent,#38BDF8)", color: "#111827", border: "1px solid transparent" }
    case "neutral":
      return { background: "var(--card2,#1E293B)", color: "var(--text,#F8FAFC)", border: "1px solid var(--border,#334155)" }
  }
}

function hoverFilter(variant: ButtonVariant): string {
  switch (variant) {
    case "ghost":     return "var(--hover,#1E293B)"
    case "outlined":  return "var(--primary,#3B82F6)11"
    case "secondary":
    case "neutral":   return "var(--hover,#1E293B)"
    default:          return ""  // filled variants use brightness filter instead
  }
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary", size = "md", loading = false, disabled,
    leadingIcon, trailingIcon, fullWidth, children, style, className,
    onMouseEnter, onMouseLeave, ...rest
  },
  ref
) {
  const isDisabled = !!disabled || loading
  const dims = SIZE_MAP[size]
  const vstyle = variantStyle(variant, isDisabled)
  const iconOnly = !children && (leadingIcon || trailingIcon)
  const isFilled = ["primary", "success", "warning", "danger", "info"].includes(variant)

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`ds-btn ds-btn-${variant} ${className ?? ""}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: dims.gap,
        padding: iconOnly ? 0 : dims.pad,
        width: iconOnly ? dims.iconOnly : (fullWidth ? "100%" : undefined),
        height: iconOnly ? dims.iconOnly : undefined,
        fontSize: dims.font, fontWeight: 600,
        fontFamily: "'Inter', system-ui, sans-serif",
        borderRadius: 10,
        cursor: isDisabled ? "not-allowed" : "pointer",
        transition: "background-color 180ms ease, border-color 180ms ease, filter 180ms ease, transform 150ms ease, box-shadow 180ms ease",
        outline: "none",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
        ...vstyle,
        ...style,
      }}
      onMouseEnter={e => {
        if (!isDisabled) {
          const hf = hoverFilter(variant)
          if (hf) (e.currentTarget as HTMLElement).style.background = hf
          else (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"
        }
        onMouseEnter?.(e)
      }}
      onMouseLeave={e => {
        if (!isDisabled) {
          (e.currentTarget as HTMLElement).style.filter = ""
          ;(e.currentTarget as HTMLElement).style.background = vstyle.background
        }
        onMouseLeave?.(e)
      }}
      onMouseDown={e => { if (!isDisabled) (e.currentTarget as HTMLElement).style.transform = "scale(0.97)" }}
      onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
      onFocus={e => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          isFilled ? `0 0 0 3px ${vstyle.background}55` : `0 0 0 3px var(--primary,#3B82F6)33`
      }}
      onBlur={e => { (e.currentTarget as HTMLElement).style.boxShadow = "" }}
      {...rest}
    >
      {loading ? (
        <span style={{
          width: dims.font, height: dims.font,
          border: `2px solid ${isFilled ? "#ffffff55" : "var(--border,#334155)"}`,
          borderTopColor: isFilled ? "#fff" : "var(--primary,#3B82F6)",
          borderRadius: "50%", animation: "ds-btn-spin 0.7s linear infinite",
          flexShrink: 0,
        }} />
      ) : leadingIcon}
      {children}
      {!loading && trailingIcon}

      <style>{`@keyframes ds-btn-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
})

export default Button