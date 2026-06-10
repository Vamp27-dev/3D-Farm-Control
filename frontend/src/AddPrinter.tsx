import { useState } from "react"
import { apiFetch } from "./api"  // ✅ FIX: use shared apiFetch (no hardcoded IP)

function AddPrinter() {
  const [name, setName] = useState("")
  const [ip, setIp] = useState("")
  const [type, setType] = useState("klipper")

  const handleSubmit = async () => {
    if (!name || !ip) {
      alert("Fill all fields")
      return
    }

    try {
      const res = await apiFetch("/printers/", {
        method: "POST",
        body: JSON.stringify({ name, ip_address: ip, type }),
      })

      if (!res) return // 401 handled by apiFetch

      if (res.detail) {
        alert(res.detail)
        return
      }

      alert("Printer added ✅")
      setName("")
      setIp("")
      setType("klipper")
    } catch (err) {
      console.error(err)
      alert("Failed to add printer")
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      <h1 className="text-2xl mb-6">Add Printer</h1>

      <div className="space-y-4 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Printer Name"
          className="w-full p-2 rounded bg-slate-800"
        />

        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="IP Address"
          className="w-full p-2 rounded bg-slate-800"
        />

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full p-2 rounded bg-slate-800"
        >
          <option value="klipper">Neptune (Klipper)</option>
          <option value="centauri">Centauri Carbon</option>
        </select>

        <button
          onClick={handleSubmit}
          className="bg-green-600 px-4 py-2 rounded hover:bg-green-500"
        >
          Add Printer
        </button>
      </div>
    </div>
  )
}

export default AddPrinter