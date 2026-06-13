// utils/auth.ts
export function getUserRole(): string | null {
  return localStorage.getItem("role")
}

export function getToken(): string | null {
  return localStorage.getItem("token")
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token")
}

export function logout(): void {
  localStorage.removeItem("token")
  localStorage.removeItem("role")
  window.location.href = "/login"
}