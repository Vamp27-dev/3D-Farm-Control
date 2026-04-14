import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

interface Folder {
id: number
name: string
}

interface FileItem {
id: number
original_name: string
stored_name: string
extension: string
folder_id: number
file_size: number
uploaded_at: string
}

interface Printer {
id: number
name: string
}

function Files() {

const [folders, setFolders] = useState<Folder[]>([])
const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
const [files, setFiles] = useState<FileItem[]>([])
const [printers, setPrinters] = useState<Printer[]>([])

const token = localStorage.getItem("token")

// ========================
// Load Folders
// ========================

useEffect(() => {


const loadFolders = async () => {

  try {

    const res = await fetch("http://localhost:8000/files/folders")
    const data = await res.json()

    setFolders(data)

    if (data.length > 0) {
      setSelectedFolder(data[0].id)
    }

  } catch (err) {

    console.log("Folder load error", err)

  }

}

loadFolders()


}, [])

// ========================
// Load Printers
// ========================

useEffect(() => {


const loadPrinters = async () => {

  try {

    const res = await fetch("http://localhost:8000/printers")
    const data = await res.json()

    setPrinters(data)

  } catch (err) {

    console.log("Printer load error", err)

  }

}

loadPrinters()


}, [])

// ========================
// Load Files
// ========================

useEffect(() => {


if (!selectedFolder) return

const loadFiles = async () => {

  try {

    const res = await fetch(
      `http://localhost:8000/files/folder/${selectedFolder}`
    )

    const data = await res.json()

    if (Array.isArray(data)) {
      setFiles(data)
    } else if (Array.isArray(data.files)) {
      setFiles(data.files)
    } else {
      setFiles([])
    }

  } catch (err) {

    console.log("File load error", err)
    setFiles([])

  }

}

loadFiles()


}, [selectedFolder])

// ========================
// Upload File
// ========================

const uploadFile = async (e: any) => {


const file = e.target.files[0]

if (!file || !selectedFolder) return

const formData = new FormData()
formData.append("upload", file)

try {

  const res = await fetch(
    `http://localhost:8000/files/upload/${selectedFolder}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    }
  )

  if (!res.ok) {
    console.log("Upload failed")
    return
  }

  const newFile = await res.json()

  setFiles(prev => [...prev, newFile])

} catch (err) {

  console.log("Upload error", err)

}

}

// ========================
// Delete File
// ========================

const deleteFile = async (fileId: number) => {


try {

  const res = await fetch(
    `http://localhost:8000/files/${fileId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  if (!res.ok) {
    console.error("Delete failed")
    return
  }

  setFiles(prev => prev.filter(f => f.id !== fileId))

} catch (err) {

  console.error("Delete error", err)

}


}

// ========================
// PRINT FILE → CREATE BATCH
// ========================

const printFile = async (fileId: number) => {

  const token = localStorage.getItem("token")

  if (!token) {
    alert("You are not logged in")
    return
  }

  if (printers.length === 0) {
    alert("No printers available")
    return
  }

  const printerIds = printers.map(p => p.id)

  try {

    const res = await fetch(
      "http://localhost:8000/batches/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: `Batch-${Date.now()}`,
          file_id: fileId,
          printer_ids: printerIds
        })
      }
    )

    if (!res.ok) {

      const err = await res.text()
      console.log(err)

      alert("Batch creation failed")
      return

    }

    const data = await res.json()

    alert("Batch created successfully ID: " + data.batch_id)

  } catch (err) {

    console.log("Batch creation error", err)

  }

}

return (


<div className="min-h-screen bg-[#0f172a] text-white p-6">

  <Link to="/" className="text-blue-400">
    ← Back to Dashboard
  </Link>

  <h1 className="text-3xl font-bold mt-4 mb-6">
    File Library
  </h1>

  <div className="grid grid-cols-4 gap-6">

    {/* Folder List */}

    <div className="bg-slate-800 p-4 rounded-xl">

      <h2 className="text-lg mb-4">Folders</h2>

      {folders.map(folder => (

        <div
          key={folder.id}
          onClick={() => setSelectedFolder(folder.id)}
          className={`p-2 rounded cursor-pointer mb-2 ${
            selectedFolder === folder.id
              ? "bg-blue-600"
              : "bg-slate-700"
          }`}
        >
          {folder.name}
        </div>

      ))}

    </div>

    {/* File List */}

    <div className="col-span-3 bg-slate-800 p-4 rounded-xl">

      <div className="flex justify-between mb-4">

        <h2 className="text-lg">Files</h2>

        <label className="bg-green-600 px-4 py-1 rounded cursor-pointer">

          Upload

          <input
            type="file"
            accept=".gcode,.3mf"
            hidden
            onChange={uploadFile}
          />

        </label>

      </div>

      {files.length === 0 && (
        <p className="text-gray-400">
          No files in this folder
        </p>
      )}

      <div className="space-y-2">

        {files.map(file => (

          <div
            key={file.id}
            className="bg-slate-700 p-3 rounded flex justify-between items-center"
          >

            <span className="text-sm">
              {file.original_name}
            </span>

            <div className="flex gap-2">

              <button
                onClick={() => printFile(file.id)}
                className="bg-green-600 px-3 py-1 rounded text-xs"
              >
                Print
              </button>

              <button
                onClick={async () => {
                  const confirmDelete = confirm("Delete this file?")
                  if (!confirmDelete) return

                  try {
                    const token = localStorage.getItem("token")

                    const res = await fetch(`http://192.168.68.151:8000/files/${file.id}`, {
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

                  alert("File deleted 🗑️")

                  // 🔥 IMPORTANT: refresh list
                  window.location.reload()

                } catch (err) {
                  console.error(err)
                  alert("Delete failed")
                }
              }}
              className="bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-500"
            >
              Delete
            </button>

            </div>

          </div>

        ))}

      </div>

    </div>

  </div>

</div>


)

}

export default Files
