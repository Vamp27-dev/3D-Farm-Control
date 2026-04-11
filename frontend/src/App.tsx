import { useEffect, useState } from "react"
import { Routes, Route, Link } from "react-router-dom"
import Files from "./Files"
import AddPrinter from "./AddPrinter"
import Login from "./Login"
import ProtectedRoute from "./ProtectedRoute"
import { getUserRole } from "./utils/auth"

const API_BASE = "http://192.168.68.151:8000"
const WS_BASE = "ws://192.168.68.151:8000"

const apiFetch = async (url: string, options: any = {}) => {
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
    return null
  }

  return res.json()
}

interface Printer {
  id: number
  name: string
  status: string
  progress: number
  current_file: string | null
  camera_url?: string
}

interface QueueItem {
  id: number
  printer_id: number
  batch_id: number
  status: string
}

interface Analytics {
  today_prints: number
  week_prints: number
  success_rate: number
  avg_print_time_minutes: number | null
  active_printers: number
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/files"
        element={
          <ProtectedRoute>
            <Files />
          </ProtectedRoute>
        }
      />

      <Route
        path="/add-printer"
        element={
          <ProtectedRoute>
            <AddPrinter />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function Dashboard() {
  const role = getUserRole()
  const [printers, setPrinters] = useState<Printer[]>([])
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queuedCount, setQueuedCount] = useState<number>(0)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)

  const selectedPrinter =
    printers.find(p => p.id === selectedPrinterId) || null

  // ======================
  // 🔥 LOAD PRINTERS (IMPORTANT FIX)
  // ======================
  useEffect(() => {
    const loadPrinters = async () => {
      try {
        const data = await apiFetch("/printers/")
        if (data) setPrinters(data)
      } catch (err) {
        console.log("Printer load failed", err)
      }
    }

    loadPrinters()
    const interval = setInterval(loadPrinters, 5000)

    return () => clearInterval(interval)
  }, [])

  // ======================
  // Analytics
  // ======================
  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const data = await apiFetch("/analytics")
        setAnalytics(data)
      } catch (err) {
        console.log("Analytics error", err)
      }
    }

    loadAnalytics()
    const interval = setInterval(loadAnalytics, 10000)

    return () => clearInterval(interval)
  }, [])

  // ======================
  // Queue
  // ======================
  useEffect(() => {
    if (!selectedPrinter) return

    const loadQueue = async () => {
      try {
        const data = await apiFetch(
          `/printers/${selectedPrinter.id}/queue`
        )
        setQueue(data)
      } catch (err) {
        console.log("Queue load failed", err)
      }
    }

    loadQueue()
    const interval = setInterval(loadQueue, 3000)

    return () => clearInterval(interval)
  }, [selectedPrinter])

  // ======================
  // Queue Count
  // ======================
  useEffect(() => {
    const loadQueuedCount = async () => {
      let total = 0

      for (const printer of printers) {
        try {
          const data = await apiFetch(
            `/printers/${printer.id}/queue`
          )
          total += data.length
        } catch {
          continue
        }
      }

      setQueuedCount(total)
    }

    if (printers.length > 0) {
      loadQueuedCount()
    }
  }, [printers])

  // ======================
  // Actions
  // ======================
  const startNext = async () => {
    if (!selectedPrinter) return
    await apiFetch(`/printers/${selectedPrinter.id}/start_next`, {
      method: "POST"
    })
  }

  const cancelJob = async (jobId: number) => {
    await apiFetch(`/batches/job/${jobId}/cancel`, {
      method: "POST"
    })
  }

  const skipJob = async (jobId: number) => {
    await apiFetch(`/batches/job/${jobId}/skip`, {
      method: "POST"
    })
  }

  const clearQueue = async () => {
    if (!selectedPrinter) return
    await apiFetch(`/printers/${selectedPrinter.id}/queue/clear`, {
      method: "POST"
    })
  }

  const deletePrinter = async (id: number) => {
    const confirmDelete = confirm("Delete this printer?")
    if (!confirmDelete) return

    await apiFetch(`/printers/${id}`, {
      method: "DELETE"
    })
  }

  const total = printers.length
  const printing = printers.filter(p => p.status === "printing").length
  const idle = printers.filter(p => p.status === "idle").length
  const offline = printers.filter(p => p.status === "offline").length

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      <div className="flex gap-6 mb-6 text-sm items-center">
        <Link to="/" className="text-blue-400">Dashboard</Link>
        <Link to="/files" className="text-blue-400">Files</Link>

        {role === "admin" && (
          <Link to="/add-printer" className="bg-green-600 px-4 py-2 rounded">
            Add Printer
          </Link>
        )}

        <button
          onClick={() => {
            localStorage.removeItem("token")
            window.location.href = "/login"
          }}
          className="ml-auto bg-red-600 px-3 py-1 rounded"
        >
          Logout
        </button>
      </div>

      <h1 className="text-3xl font-bold mb-6">Production Control Center</h1>

      {/* KPI */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Total" value={total} color="bg-slate-700" />
        <StatCard label="Printing" value={printing} color="bg-emerald-600" />
        <StatCard label="Idle" value={idle} color="bg-blue-600" />
        <StatCard label="Offline" value={offline} color="bg-red-600" />
        <StatCard label="Queued" value={queuedCount} color="bg-yellow-600" />
      </div>

      {/* Printer Grid */}
      <div className="grid grid-cols-4 gap-5">
        {printers.map(printer => (
          <div
            key={printer.id}
            onClick={() => setSelectedPrinterId(printer.id)}
            className="bg-slate-800 rounded-xl p-5 cursor-pointer hover:bg-slate-700"
          >
            <div className="flex justify-between mb-3">
              <h2>{printer.name}</h2>
              <StatusBadge status={printer.status} />
            </div>

            <p className="text-sm">{printer.current_file || "Ready"}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: any) {
  return (
    <div className={`${color} p-4 rounded-xl`}>
      <p className="text-xs">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: any = {
    printing: "bg-emerald-500",
    idle: "bg-blue-500",
    offline: "bg-red-500"
  }

  return (
    <span className={`px-2 py-1 text-xs rounded ${colors[status]}`}>
      {status}
    </span>
  )
}

export default App