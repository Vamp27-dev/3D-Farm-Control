import { useState } from "react"

const API_BASE = "http://localhost:8000" // change later in office

function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      })

      if (!res.ok) {
        throw new Error("Invalid credentials")
      }

      const data = await res.json()

      localStorage.setItem("token", data.access_token)

      // redirect to dashboard
      window.location.href = "/"

    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f172a] text-white">
      <div className="bg-slate-800 p-8 rounded-xl w-80">
        <h2 className="text-2xl font-bold mb-6 text-center">
          Login
        </h2>

        {error && (
          <p className="text-red-400 text-sm mb-3">
            {error}
          </p>
        )}

        <input
          type="text"
          placeholder="Username"
          className="w-full mb-3 p-2 rounded bg-slate-700"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full mb-4 p-2 rounded bg-slate-700"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 py-2 rounded"
        >
          Login
        </button>
      </div>
    </div>
  )
}

export default Login