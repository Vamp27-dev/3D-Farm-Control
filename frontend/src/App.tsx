import { useEffect, useState } from "react"
import { Routes, Route, Link } from "react-router-dom"
import Files from "./Files"
import AddPrinter from "./AddPrinter"
import Login from "./Login"
import ProtectedRoute from "./ProtectedRoute"
// 🔥 NEW: API + WS BASE
const API_BASE = "http://localhost:5173/"
const WS_BASE = "ws://localhost:5173/"

// 🔥 NEW: API HELPER

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

  // 🔥 HANDLE TOKEN EXPIRY / INVALID TOKEN
  if (res.status === 401) {
    console.warn("Token expired or invalid. Logging out...")

    localStorage.removeItem("token")

    // Redirect cleanly
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

import { getUserRole } from "./utils/auth"
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
  // WebSocket Printers
  // ======================

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/printers`)

    ws.onopen = () => {
      console.log("WS connected")
    }

    ws.onmessage = event => {
      const data = JSON.parse(event.data)
      setPrinters(data.printers)
    }

    ws.onerror = err => {
      console.log("WS error", err)
    }

    return () => ws.close()
  }, [])

  // ======================
  // Analytics Loader
  // ======================

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const data = await apiFetch("/analytics/production")
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
  // Load Queue
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
  // Queue Counter
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

  const total = printers.length
  const printing = printers.filter(p => p.status === "printing").length
  const idle = printers.filter(p => p.status === "idle").length
  const offline = printers.filter(p => p.status === "offline").length
  const deletePrinter = async (id: number) => {
  const confirmDelete = confirm("Delete this printer?")

  if (!confirmDelete) return

  await apiFetch(`/printers/${id}`, {
    method: "DELETE"
  })
}

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      {/* Navigation */}
      <div className="flex gap-6 mb-6 text-sm items-center">

  <Link to="/" className="text-blue-400">
    Dashboard
  </Link>

  <Link to="/files" className="text-blue-400">
    Files
  </Link>

  {role === "admin" && (
  <Link to="/add-printer" className="bg-green-600 px-4 py-2 rounded">
    Add Printer
  </Link>
)}

  {/* 🔥 Logout Button */}
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

      <h1 className="text-3xl font-bold mb-6">
        Production Control Center
      </h1>

      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <StatCard
            label="Today's Prints"
            value={analytics.today_prints}
            color="bg-purple-600"
          />
          <StatCard
            label="Week Production"
            value={analytics.week_prints}
            color="bg-indigo-600"
          />
          <StatCard
            label="Success Rate"
            value={`${analytics.success_rate}%`}
            color="bg-green-600"
          />
          <StatCard
            label="Avg Print Time"
            value={analytics.avg_print_time_minutes ?? "-"}
            color="bg-orange-600"
          />
          <StatCard
            label="Active Printers"
            value={analytics.active_printers}
            color="bg-teal-600"
          />
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Printers" value={total} color="bg-slate-700" />
        <StatCard label="Printing" value={printing} color="bg-emerald-600" />
        <StatCard label="Idle" value={idle} color="bg-blue-600" />
        <StatCard label="Offline" value={offline} color="bg-red-600" />
        <StatCard label="Queued Jobs" value={queuedCount} color="bg-yellow-600" />
      </div>

      {/* Printer Grid */}
      <div className="grid grid-cols-4 gap-5">
        {printers.map(printer => (
          <div
            key={printer.id}
            onClick={() => setSelectedPrinterId(printer.id)}
            className="bg-slate-800 rounded-xl p-5 cursor-pointer hover:bg-slate-700 transition"
          >
            <div className="flex justify-between mb-3 items-center">
  <h2 className="font-semibold">{printer.name}</h2>

  <div className="flex gap-2 items-center">
    <StatusBadge status={printer.status} />

    {/* 🔥 DELETE BUTTON (ADMIN ONLY) */}
    {role === "admin" && (
      <button
        onClick={(e) => {
          e.stopPropagation()
          deletePrinter(printer.id)
        }}
        className="bg-red-600 px-2 py-1 text-xs rounded"
      >
        X
      </button>
    )}
  </div>
</div>

            {printer.status === "printing" ? (
              <>
                <p className="text-xs text-gray-400 mb-2">
                  {printer.current_file}
                </p>

                <div className="w-full bg-slate-600 h-2 rounded">
                  <div
                    className="bg-emerald-500 h-2 rounded"
                    style={{ width: `${printer.progress}%` }}
                  />
                </div>

                <p className="text-right text-xs mt-1">
                  {printer.progress.toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">Ready</p>
            )}
          </div>
        ))}
      </div>

      {/* Drawer */}
      {selectedPrinter && (
        <div className="fixed right-0 top-0 w-96 h-full bg-slate-900 p-6 shadow-2xl z-50">
          <button
            onClick={() => setSelectedPrinterId(null)}
            className="text-gray-400 mb-4"
          >
            Close
          </button>

          <h2 className="text-xl font-bold mb-2">
            {selectedPrinter.name}
          </h2>

          <StatusBadge status={selectedPrinter.status} />

          <h3 className="mt-6 text-sm text-gray-400">Queue</h3>

          <div className="mt-3 space-y-2">
            {queue.length === 0 && (
              <p className="text-xs text-gray-500">
                No jobs in queue
              </p>
            )}

            {queue.map(job => (
              <div
                key={job.id}
                className="bg-slate-800 p-3 rounded flex justify-between items-center text-xs"
              >
                <div>
                  <p>Batch #{job.batch_id}</p>
                  <p className="text-yellow-400">{job.status}</p>
                </div>

                <div className="flex gap-2">
                  {role !== "viewer" && (
  <>
    <button
      onClick={() => skipJob(job.id)}
      className="bg-yellow-600 px-2 py-1 rounded"
    >
      Skip
    </button>

    <button
      onClick={() => cancelJob(job.id)}
      className="bg-red-600 px-2 py-1 rounded"
    >
      Cancel
    </button>
  </>
)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-6">
            {role !== "viewer" &&selectedPrinter.status !== "printing" && queue.length > 0 && (
              <button
                onClick={startNext}
                className="flex-1 bg-emerald-600 py-2 rounded"
              >
                Start
              </button>
            )}

            {role === "admin" && queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="flex-1 bg-red-700 py-2 rounded"
              >
                Clear Queue
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: any
  color: string
}) {
  return (
    <div className={`${color} p-4 rounded-xl`}>
      <p className="text-xs text-gray-200">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    printing: "bg-emerald-500",
    idle: "bg-blue-500",
    offline: "bg-red-500"
  }

  return (
    <span
      className={`px-2 py-1 text-xs rounded ${
        colors[status] || "bg-gray-500"
      }`}
    >
      {status}
    </span>
  )
}

export default App