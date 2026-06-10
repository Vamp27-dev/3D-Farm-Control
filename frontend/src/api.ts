// ✅ FIX: Set VITE_API_BASE in your .env file — only one place to change
// Create frontend/.env with: VITE_API_BASE=http://192.168.68.151:8000
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

export { API_BASE }

export const apiFetch = async (url: string, options: any = {}) => {
  const token = localStorage.getItem("token")

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem("token")
    window.location.href = "/login"
    return null
  }

  return res.json()
}