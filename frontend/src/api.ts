const API_BASE = "http://YOUR_SERVER_IP:8000" // change later

export const apiFetch = async (url: string, options: any = {}) => {
  const token = localStorage.getItem("token")

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  })

  if (res.status === 401) {
    localStorage.removeItem("token")
    window.location.href = "/login"
  }

  return res.json()
}