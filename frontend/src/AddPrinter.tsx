import { useState } from "react"

const API_BASE = "http://localhost:8000"

function AddPrinter() {
  const [name, setName] = useState("")
  const [ip, setIp] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const handleSubmit = async () => {
    if (!name) {
      setMessage("Printer name required")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("token")

      const res = await fetch(`${API_BASE}/printers/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          ip_address: ip
        })
      })

      if (!res.ok) {
        throw new Error("Failed to add printer")
      }

      setMessage("Printer added successfully")
      setName("")
      setIp("")
    } catch (err: any) {
      setMessage(err.message)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      <h1 className="text-2xl font-bold mb-6">Add Printer</h1>

      <div className="bg-slate-800 p-6 rounded-xl w-96">

        {message && (
          <p className="mb-4 text-sm text-yellow-400">{message}</p>
        )}

        <input
          type="text"
          placeholder="Printer Name"
          className="w-full mb-3 p-2 rounded bg-slate-700"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <input
          type="text"
          placeholder="IP Address (optional)"
          className="w-full mb-4 p-2 rounded bg-slate-700"
          value={ip}
          onChange={e => setIp(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-green-600 py-2 rounded"
        >
          {loading ? "Adding..." : "Add Printer"}
        </button>
      </div>
    </div>
  )
}

export default AddPrinter