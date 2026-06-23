// utils/date.ts — shared IST date formatting for all pages

/**
 * Format a UTC ISO string to Indian Standard Time (IST = UTC+5:30)
 * Input: "2024-01-15T08:30:00Z" or "2024-01-15T08:30:00"
 * Output: "15 Jan 2024, 02:00 PM"
 */
export function toIST(iso: string | null | undefined): string {
  if (!iso) return "—"

  // Ensure the string is parsed as UTC by appending Z if missing
  const utcString = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z"
  const date = new Date(utcString)

  if (isNaN(date.getTime())) return "—"

  return date.toLocaleString("en-IN", {
    timeZone:  "Asia/Kolkata",
    day:       "2-digit",
    month:     "short",
    year:      "numeric",
    hour:      "2-digit",
    minute:    "2-digit",
    hour12:    true,
  })
}

/**
 * Short date only — for batch created_at timestamps
 * Output: "15 Jan 2024"
 */
export function toISTDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const utcString = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z"
  const date = new Date(utcString)
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day:      "2-digit",
    month:    "short",
    year:     "numeric",
  })
}

/**
 * Relative time — "2 hours ago", "just now" etc.
 * Useful for showing when a batch was created
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const utcString = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z"
  const date = new Date(utcString)
  if (isNaN(date.getTime())) return "—"

  const now = Date.now()
  const diff = Math.floor((now - date.getTime()) / 1000)

  if (diff < 60)   return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}