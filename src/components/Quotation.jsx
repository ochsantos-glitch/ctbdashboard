import { useState, useMemo, useCallback } from 'react'
import Papa from 'papaparse'

const COL_MAP = {
  // Part number
  'pn': 'pn', 'part_number': 'pn', 'part number': 'pn', 'part no': 'pn', 'partno': 'pn',
  'kpn': 'pn', 'key pn': 'pn', 'lab126pn': 'pn', 'lab126 pn': 'pn', 'item': 'pn',
  // Description
  'description': 'description', 'desc': 'description', 'part description': 'description', 'name': 'description',
  // CM / Site
  'cm': 'cm', 'site': 'cm', 'cm name': 'cm', 'contract manufacturer': 'cm',
  'factory': 'cm', 'vendor': 'cm', 'supplier': 'cm', 'manufacturer': 'cm',
  // Quantity
  'qty': 'qty', 'quantity': 'qty', 'build qty': 'qty', 'ordered qty': 'qty',
  'order qty': 'qty', 'total qty': 'qty', 'count': 'qty',
  // Unit price
  'unit_price': 'unitPrice', 'unit price': 'unitPrice', 'unit_cost': 'unitPrice',
  'unit cost': 'unitPrice', 'price': 'unitPrice', 'cost': 'unitPrice',
  'quoted price': 'unitPrice', 'quoted unit price': 'unitPrice',
  // Extended / total
  'extended_price': 'extPrice', 'extended price': 'extPrice', 'ext price': 'extPrice',
  'total price': 'extPrice', 'total': 'extPrice', 'amount': 'extPrice',
  'ext cost': 'extPrice', 'extended cost': 'extPrice', 'line total': 'extPrice',
  // Consigned flag
  'consigned': 'consigned', 'is_consigned': 'consigned', 'material_type': 'consigned',
  'material type': 'consigned', 'type': 'consigned', 'source': 'consigned',
  'ownership': 'consigned', 'supply type': 'consigned',
}

function isConsigned(val) {
  if (!val) return false
  const s = String(val).trim().toLowerCase()
  return s === 'y' || s === 'yes' || s === 'true' || s === '1' || s.includes('consign')
}

function stripCurrency(v) {
  return Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0
}

function parseRow(raw) {
  const out = {}
  Object.entries(raw).forEach(([k, v]) => {
    const mapped = COL_MAP[k.trim().toLowerCase()]
    if (mapped) out[mapped] = v
  })
  return {
    pn:          String(out.pn ?? '').trim(),
    description: String(out.description ?? '').trim(),
    cm:          String(out.cm ?? '').trim() || 'Unknown CM',
    qty:         Number(String(out.qty ?? '').replace(/[,\s]/g, '')) || 0,
    unitPrice:   stripCurrency(out.unitPrice),
    extPrice:    out.extPrice != null && out.extPrice !== '' ? stripCurrency(out.extPrice) : null,
    consigned:   isConsigned(out.consigned),
  }
}

function fmtUSD(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Quotation() {
  const [rows,       setRows]       = useState(null)
  const [fileName,   setFileName]   = useState('')
  const [error,      setError]      = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [filterCM,   setFilterCM]   = useState('all')
  const [filterType, setFilterType] = useState('all') // 'all' | 'purchased' | 'consigned'
  const [search,     setSearch]     = useState('')

  function parseCSV(file) {
    setError(null)
    setFileName(file.name)
    setRows(null)
    setFilterCM('all')
    setFilterType('all')
    setSearch('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors.length && !data.length) {
          setError(`Parse error: ${errors[0].message}`)
          return
        }
        if (!data.length) { setError('File is empty.'); return }
        const parsed = data.map(parseRow)
        if (!parsed.length) { setError('No valid rows found.'); return }
        setRows(parsed)
      },
      error: err => setError(err.message),
    })
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseCSV(file)
  }, [])

  const onFileChange = e => {
    const file = e.target.files[0]
    if (file) parseCSV(file)
    e.target.value = ''
  }

  // Per-CM summary
  const byCM = useMemo(() => {
    if (!rows) return []
    const map = {}
    rows.forEach(r => {
      if (!map[r.cm]) map[r.cm] = { cm: r.cm, totalQty: 0, purchasedAmt: 0, consignedAmt: 0, parts: 0 }
      const g = map[r.cm]
      g.parts++
      g.totalQty += r.qty
      const line = r.extPrice ?? r.qty * r.unitPrice
      if (r.consigned) g.consignedAmt += line
      else             g.purchasedAmt += line
    })
    return Object.values(map).sort((a, b) =>
      (b.purchasedAmt + b.consignedAmt) - (a.purchasedAmt + a.consignedAmt)
    )
  }, [rows])

  const totals = useMemo(() => {
    if (!byCM.length) return null
    return {
      qty:       byCM.reduce((s, g) => s + g.totalQty, 0),
      purchased: byCM.reduce((s, g) => s + g.purchasedAmt, 0),
      consigned: byCM.reduce((s, g) => s + g.consignedAmt, 0),
    }
  }, [byCM])

  const cmOptions = useMemo(() => byCM.map(g => g.cm), [byCM])

  const hasConsignedCol = useMemo(() => rows?.some(r => r.consigned), [rows])

  const filteredRows = useMemo(() => {
    if (!rows) return []
    return rows.filter(r => {
      if (filterCM !== 'all' && r.cm !== filterCM) return false
      if (filterType === 'purchased' && r.consigned) return false
      if (filterType === 'consigned' && !r.consigned) return false
      if (search) {
        const q = search.toLowerCase()
        if (!r.pn.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q) && !r.cm.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rows, filterCM, filterType, search])

  const grandTotal = totals ? totals.purchased + totals.consigned : 0

  return (
    <div className="dashboard-page">
      <h1>Quotations</h1>
      <p className="upload-subtitle">
        Upload a CM quotation CSV to compare costs by site and separate consigned vs. purchased materials.
        Expected columns: <strong>PN, Description, CM, Qty, Unit Price</strong> and optionally <strong>Extended Price, Consigned (Y/N)</strong>.
      </p>

      {/* Drop zone */}
      <div
        className={`drop-zone${isDragging ? ' dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <div className="drop-icon">📋</div>
        <p className="drop-main">{isDragging ? 'Drop it!' : 'Drag & drop quotation CSV here'}</p>
        <p className="drop-sub">or</p>
        <label className="btn-upload-label">
          Browse File
          <input type="file" accept=".csv,.txt" onChange={onFileChange} style={{ display: 'none' }} />
        </label>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {rows && (
        <>
          <div className="upload-file-name" style={{ marginTop: 16 }}>
            File: <strong>{fileName}</strong> · {rows.length} line items
          </div>

          {/* Grand totals */}
          {totals && (
            <div className="stats-row" style={{ marginTop: 12 }}>
              <div className="stat-card">
                <div className="stat-value">{totals.qty.toLocaleString()}</div>
                <div className="stat-label">Total Qty</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">${fmtUSD(totals.purchased)}</div>
                <div className="stat-label">Purchased Total</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">${fmtUSD(totals.consigned)}</div>
                <div className="stat-label">Consigned Value</div>
              </div>
              <div className="stat-card stat-card-ok">
                <div className="stat-value">${fmtUSD(grandTotal)}</div>
                <div className="stat-label">Grand Total Quote</div>
              </div>
            </div>
          )}

          {/* Per-CM cards */}
          <h2 className="section-title">Quote by CM</h2>
          <div className="stats-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {byCM.map(g => {
              const cmTotal = g.purchasedAmt + g.consignedAmt
              const pct     = grandTotal > 0 ? (cmTotal / grandTotal) * 100 : 0
              return (
                <div key={g.cm} className="stat-card" style={{ minWidth: 220, flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#1e293b' }}>{g.cm}</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>${fmtUSD(cmTotal)}</div>
                  <div className="stat-label">Total Quote</div>
                  <div style={{ margin: '10px 0 4px' }}>
                    <div className="budget-bar-track">
                      <div className="budget-bar-fill fill-ok" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.8 }}>
                    <div>Purchased: <strong style={{ color: '#1d4ed8' }}>${fmtUSD(g.purchasedAmt)}</strong></div>
                    <div>Consigned: <strong style={{ color: '#065f46' }}>${fmtUSD(g.consignedAmt)}</strong></div>
                    <div>Parts: <strong>{g.parts}</strong> · Qty: <strong>{g.totalQty.toLocaleString()}</strong></div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Filters */}
          <h2 className="section-title">Line Items</h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="proj-search-input"
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 180 }}
              placeholder="Search PN or description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="proj-select"
              style={{ padding: '5px 10px', borderRadius: 6, fontSize: 13 }}
              value={filterCM}
              onChange={e => setFilterCM(e.target.value)}
            >
              <option value="all">All CMs</option>
              {cmOptions.map(cm => <option key={cm} value={cm}>{cm}</option>)}
            </select>
            {hasConsignedCol && (
              <select
                className="proj-select"
                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 13 }}
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="purchased">Purchased Only</option>
                <option value="consigned">Consigned Only</option>
              </select>
            )}
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
              {filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="matrix-container">
            <table className="build-table">
              <thead>
                <tr>
                  <th>Part #</th>
                  <th>Description</th>
                  <th>CM</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Price</th>
                  <th style={{ textAlign: 'right' }}>Extended</th>
                  <th style={{ textAlign: 'center' }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const ext = r.extPrice ?? r.qty * r.unitPrice
                  return (
                    <tr key={i} style={r.consigned ? { background: 'rgba(16,185,129,0.05)' } : {}}>
                      <td className="config-name">{r.pn || '—'}</td>
                      <td>{r.description || '—'}</td>
                      <td><span className="board-badge">{r.cm}</span></td>
                      <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
                      <td className="cost-cell">
                        {r.unitPrice > 0 ? `$${fmtUSD(r.unitPrice)}` : '—'}
                      </td>
                      <td className="cost-cell cost-total">${fmtUSD(ext)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.consigned
                          ? <span className="type-badge cat-fatp">Consigned</span>
                          : <span className="type-badge cat-smt">Purchased</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filteredRows.length > 0 && (() => {
                const subTotal = filteredRows.reduce((s, r) => s + (r.extPrice ?? r.qty * r.unitPrice), 0)
                const subQty   = filteredRows.reduce((s, r) => s + r.qty, 0)
                return (
                  <tfoot>
                    <tr className="bom-total-row">
                      <td colSpan={3}><strong>SUBTOTAL</strong></td>
                      <td style={{ textAlign: 'right' }}><strong>{subQty.toLocaleString()}</strong></td>
                      <td></td>
                      <td className="cost-cell cost-total"><strong>${fmtUSD(subTotal)}</strong></td>
                      <td></td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
            {filteredRows.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 14 }}>
                No rows match the current filters.
              </div>
            )}
          </div>
        </>
      )}

      {!rows && !error && (
        <div style={{ marginTop: 32, color: '#94a3b8', fontSize: 14 }}>
          <p><strong>CSV column tips:</strong></p>
          <ul style={{ marginTop: 8, lineHeight: 2 }}>
            <li><strong>CM / Site / Factory</strong> → groups rows by Contract Manufacturer</li>
            <li><strong>Qty / Quantity</strong> → summed per CM</li>
            <li><strong>Unit Price / Cost</strong> → used to compute extended if not provided</li>
            <li><strong>Extended Price / Total</strong> → line total (computed if missing)</li>
            <li><strong>Consigned / Type</strong> → Y/N or "Consigned"/"Purchased" to split materials</li>
          </ul>
        </div>
      )}
    </div>
  )
}
