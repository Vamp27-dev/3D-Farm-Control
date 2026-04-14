import { useEffect, useState } from "react"

const API_BASE = "http://192.168.68.151:8000"

interface Batch {
  id: number
  name: string
  file_name: string
  status: string
  created_at: string
}

function Batches() {
  const [batches, setBatches] = useState<Batch[]>([])

  const loadBatches = async () => {
    try {
      const token = localStorage.getItem("token")

      const res = await fetch(`${API_BASE}/batches/`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const data = await res.json()

      if (Array.isArray(data)) {
        setBatches(data)
      } else {
        console.error("Invalid response:", data)
        setBatches([])
      }

    } catch (err) {
      console.error("Failed to load batches", err)
      setBatches([])
    }
  }

  useEffect(() => {
    loadBatches()
  }, [])

  const deleteBatch = async (id: number) => {
    const confirmDelete = window.confirm("Delete this batch?")
    if (!confirmDelete) return

    try {
      const token = localStorage.getItem("token")

      const res = await fetch(`${API_BASE}/batches/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.detail || "Delete failed")
        return
      }

      alert("Batch deleted ✅")
      loadBatches()

    } catch (err) {
      console.error(err)
      alert("Delete failed")
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      <h1 className="text-2xl mb-6">Batch Management</h1>

      <div className="space-y-3">
        {batches.length === 0 ? (
          <p className="text-gray-400">No batches found</p>
        ) : (
          batches.map((batch) => (
            <div
              key={batch.id}
              className="bg-slate-800 p-4 rounded flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{batch.name}</p>
                <p className="text-sm">File: {batch.file_name}</p>
                <p className="text-sm">Status: {batch.status}</p>
              </div>

              <button
                onClick={() => deleteBatch(batch.id)}
                className="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Batches