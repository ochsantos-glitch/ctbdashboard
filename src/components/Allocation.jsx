import { useState, useMemo } from 'react'

const ALLOC_COLS = [
  { key: 'shippingPriority', label: 'Shipping Priority', width: 110 },
  { key: 'functionalGroup',  label: 'Functional Group',  width: 120 },
  { key: 'dept',             label: 'Dept',              width: 80  },
  { key: 'requesterName',    label: 'Requester Name',    width: 140 },
  { key: 'alias',            label: 'Alias',             width: 90  },
  { key: 'justification',    label: 'Justification',     width: 160 },
  { key: 'destination',      label: 'Destination',       width: 100 },
  { key: 'qty',              label: 'Qty',               width: 70, type: 'number' },
]

function emptyRow() {
  return {
    id:               crypto.randomUUID(),
    shippingPriority: '',
    functionalGroup:  '',
    dept:             '',
    requesterName:    '',
    alias:            '',
    justification:    '',
    destination:      '',
    qty:              0,
  }
}

function getAllocForConfig(allocations, configName) {
  return allocations.find(a => a.configName === configName) ?? { configName, rows: [] }
}

function setAllocForConfig(allocations, configName, rows) {
  const exists = allocations.some(a => a.configName === configName)
  if (exists) return allocations.map(a => a.configName === configName ? { ...a, rows } : a)
  return [...allocations, { id: crypto.randomUUID(), configName, rows }]
}

// ── Destination summary ───────────────────────────────────────────────────────
function DestSummary({ rows }) {
  const byDest = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const d = r.destination?.trim() || '(no destination)'
      map[d] = (map[d] || 0) + (Number(r.qty) || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [rows])

  if (byDest.length === 0) return null

  return (
    <div className="alloc-dest-summary">
      <div className="mat-sub-label" style={{ marginBottom: 6 }}>Shipping Summary by Location</div>
      <div className="alloc-dest-grid">
        {byDest.map(([dest, qty]) => (
          <div key={dest} className="alloc-dest-chip">
            <span className="alloc-dest-name">{dest}</span>
            <span className="alloc-dest-qty">{qty.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Allocation({ allocations, setAllocations, builds = [] }) {
  const allConfigs = useMemo(() => builds.map(b => b.Config).sort(), [builds])
  const [selectedConfig, setSelectedConfig] = useState(() => allConfigs[0] ?? '')
  const [editingCell,    setEditingCell]    = useState(null)
  const [draft,          setDraft]          = useState('')

  const currentAlloc = getAllocForConfig(allocations, selectedConfig)
  const rows         = currentAlloc.rows

  const totalAllocated = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0)
  const configBuild    = builds.find(b => b.Config === selectedConfig)
  const configQty      = configBuild?.Quantity ?? 0
  const unallocated    = configQty - totalAllocated

  function updateRows(newRows) {
    setAllocations(prev => setAllocForConfig(prev, selectedConfig, newRows))
  }

  function addRow() {
    updateRows([...rows, emptyRow()])
  }

  function deleteRow(id) {
    updateRows(rows.filter(r => r.id !== id))
  }

  function startEdit(rowId, colKey, value) {
    setEditingCell({ rowId, colKey })
    setDraft(String(value ?? ''))
  }

  function saveEdit() {
    if (!editingCell) return
    const { rowId, colKey } = editingCell
    updateRows(rows.map(r => {
      if (r.id !== rowId) return r
      const v = colKey === 'qty' ? (Number(draft) || 0) : draft
      return { ...r, [colKey]: v }
    }))
    setEditingCell(null)
  }

  function exportCSV() {
    if (rows.length === 0) return
    const headers = ALLOC_COLS.map(c => c.label).join(',')
    const lines   = rows.map(r =>
      ALLOC_COLS.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
    )
    const csv = [headers, ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), {
      href: url,
      download: `allocation-${selectedConfig}-${new Date().toISOString().slice(0,10)}.csv`,
    }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="allocation-page">
      <h1>Allocation</h1>
      <p className="upload-subtitle">
        Assign units per requester for each build config. Reflected in Build Matrix and shortage calculations.
      </p>

      {/* Config tabs — auto-populated from Build Matrix */}
      {allConfigs.length === 0 ? (
        <div className="mat-empty">Add configs in Build Matrix first.</div>
      ) : (
        <div className="alloc-config-tabs">
          {allConfigs.map(c => (
            <button
              key={c}
              className={`alloc-config-tab ${selectedConfig === c ? 'active' : ''}`}
              onClick={() => { setSelectedConfig(c); setEditingCell(null) }}
            >{c}</button>
          ))}
        </div>
      )}

      {selectedConfig && configBuild && (
        <div className="alloc-toolbar">
          <div className="alloc-config-stats">
            <span className="mat-stat">Build Qty <strong>{configQty.toLocaleString()}</strong></span>
            <span className="mat-stat">Allocated <strong>{totalAllocated.toLocaleString()}</strong></span>
            <span className={`mat-stat ${unallocated < 0 ? 'mat-result-short' : 'mat-result-ok'}`}>
              Remaining <strong>{unallocated.toLocaleString()}</strong>
            </span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-export" onClick={addRow}>+ Add Row</button>
            {rows.length > 0 && (
              <button className="btn-export" onClick={exportCSV}>↓ Export CSV</button>
            )}
          </div>
        </div>
      )}

      {selectedConfig && allConfigs.length > 0 && (
        <>
          {unallocated < 0 && (
            <div className="mat-shortage-banner">
              ⚠ Over-allocated by {Math.abs(unallocated).toLocaleString()} units — total requests exceed build qty.
            </div>
          )}

          <div className="alloc-table-wrap">
            <table className="alloc-table">
              <thead>
                <tr>
                  {ALLOC_COLS.map(col => (
                    <th key={col.key} style={{ minWidth: col.width }}>{col.label}</th>
                  ))}
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={ALLOC_COLS.length + 1} className="alloc-empty-row">
                      No allocation rows — click "+ Add Row"
                    </td>
                  </tr>
                ) : (
                  rows.map(row => (
                    <tr key={row.id}>
                      {ALLOC_COLS.map(col => {
                        const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key
                        return (
                          <td key={col.key} className="alloc-cell"
                            onClick={() => !isEditing && startEdit(row.id, col.key, row[col.key])}>
                            {isEditing ? (
                              <input
                                className="alloc-cell-input"
                                type={col.type === 'number' ? 'number' : 'text'}
                                min={0}
                                value={draft}
                                autoFocus
                                onChange={e => setDraft(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingCell(null) }}
                              />
                            ) : (
                              <span className={row[col.key] === '' || row[col.key] === 0 ? 'tm-na-dash' : ''}>
                                {row[col.key] || (col.type === 'number' ? 0 : '—')}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td>
                        <button className="btn-del-po" onClick={() => deleteRow(row.id)} title="Remove row">✕</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="alloc-total-row">
                    <td colSpan={ALLOC_COLS.length - 1} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td>
                    <td style={{ fontWeight: 700 }}>{totalAllocated.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <DestSummary rows={rows} />
        </>
      )}
    </div>
  )
}
