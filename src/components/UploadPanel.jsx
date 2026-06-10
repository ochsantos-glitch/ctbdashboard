import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export default function UploadPanel() {
  const [isDragging,    setIsDragging]    = useState(false)
  const [uploadedData,  setUploadedData]  = useState(null)
  const [fileName,      setFileName]      = useState(null)
  const [error,         setError]         = useState(null)

  function parseCSV(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors.length) { setError(`Parse error: ${errors[0].message}`); return }
        setUploadedData(data)
      },
      error: err => setError(err.message),
    })
  }

  function parseXLSX(file) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!data.length) { setError('No data found in file.'); return }
        setUploadedData(data)
      } catch (err) {
        setError(`Could not read file: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function parseFile(file) {
    setError(null)
    setFileName(file.name)
    setUploadedData(null)
    if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) parseXLSX(file)
    else parseCSV(file)
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [])

  const onFileChange = e => {
    const file = e.target.files[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  const columns     = uploadedData?.length ? Object.keys(uploadedData[0]) : []
  const costColumns = columns.filter(c => /cost|price|amount|total/i.test(c))

  return (
    <div className="upload-page">
      <h1>Upload BOM / Data</h1>
      <p className="upload-subtitle">Drag and drop or browse a CSV, XLS, or XLSX file.</p>

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <div className="drop-icon">📂</div>
        <p className="drop-main">{isDragging ? 'Drop it!' : 'Drag & drop file here'}</p>
        <p className="drop-sub">or</p>
        <label className="btn-upload-label">
          Browse File
          <input type="file" accept=".csv,.txt,.xlsx,.xls,.xlsm" onChange={onFileChange} style={{ display: 'none' }} />
        </label>
        <p className="drop-sub" style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Supports CSV, XLS, XLSX</p>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {uploadedData && (
        <div className="upload-results">
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value">{uploadedData.length}</div>
              <div className="stat-label">Rows</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{columns.length}</div>
              <div className="stat-label">Columns</div>
            </div>
            {costColumns.map(col => {
              const total = uploadedData.reduce((sum, row) => sum + (parseFloat(row[col]) || 0), 0)
              return (
                <div key={col} className="stat-card">
                  <div className="stat-value">
                    ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="stat-label">Total {col}</div>
                </div>
              )
            })}
          </div>

          <div className="upload-file-name">File: <strong>{fileName}</strong></div>

          <div className="matrix-container">
            <table className="build-table">
              <thead>
                <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {uploadedData.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {columns.map(c => <td key={c}>{row[c]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {uploadedData.length > 100 && (
              <div className="table-footer">Showing first 100 of {uploadedData.length} rows</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
