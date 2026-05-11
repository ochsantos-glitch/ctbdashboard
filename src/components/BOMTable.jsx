import { useState, useMemo } from 'react'
import { getBestSupplier, calcBOMCost } from '../utils/costEngine'
import { alertedPartSet } from '../utils/alertEngine'
import EditableCell from './EditableCell'

export default function BOMTable({ bom, setBom, alerts }) {
  const [boardFilter, setBoardFilter] = useState('all')
  const [qty, setQty] = useState(100)

  const alertedParts = useMemo(() => alertedPartSet(alerts ?? []), [alerts])
  const boards   = ['all', ...new Set(bom.map(p => p.appliesTo))]
  const filtered = boardFilter === 'all' ? bom : bom.filter(p => p.appliesTo === boardFilter)
  const unitCost  = useMemo(() => calcBOMCost(filtered, 1),   [filtered])
  const totalCost = useMemo(() => calcBOMCost(filtered, qty),  [filtered, qty])

  function updateUnitCost(partId, supplierName, newCost) {
    setBom(prev => prev.map(p => {
      if (p.id !== partId) return p
      return {
        ...p,
        suppliers: p.suppliers.map(s =>
          s.name === supplierName ? { ...s, unitCost: newCost } : s
        ),
      }
    }))
  }

  function updateQtyPerUnit(partId, newQty) {
    setBom(prev => prev.map(p =>
      p.id === partId ? { ...p, qtyPerUnit: Math.max(1, Math.round(newQty)) } : p
    ))
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV() {
    const rows = [
      ['Part #', 'Description', 'Category', 'Board', 'Qty/Unit', 'Best Supplier', 'Unit Cost', `Line Total (${qty} units)`],
      ...filtered.map(p => {
        const best = getBestSupplier(p)
        const line = best.unitCost * p.qtyPerUnit * qty
        return [p.id, p.description, p.category, p.appliesTo, p.qtyPerUnit, best.name, best.unitCost.toFixed(2), line.toFixed(2)]
      }),
    ]
    download(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), 'bom-export.csv')
  }

  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      buildQty: qty,
      boardFilter,
      totalUnitCost: unitCost,
      totalCostAtQty: totalCost,
      lineItems: filtered.map(p => {
        const b = getBestSupplier(p)
        return {
          partNumber: p.id,
          description: p.description,
          category: p.category,
          board: p.appliesTo,
          uom: p.uom,
          qtyPerUnit: p.qtyPerUnit,
          bestSupplier: b.name,
          unitCost: b.unitCost,
          lineTotal: parseFloat((b.unitCost * p.qtyPerUnit * qty).toFixed(2)),
          allSuppliers: p.suppliers,
        }
      }),
    }
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'bom-export.json')
  }

  const partAlertCount = (alerts ?? []).filter(a => a.partId && filtered.some(p => p.id === a.partId)).length

  return (
    <div className="bom-page">
      <h1>Bill of Materials</h1>

      {partAlertCount > 0 && (
        <div className="alert-banner banner-warning">
          <strong>{partAlertCount} part{partAlertCount !== 1 ? 's' : ''} have MOQ issues</strong>
          {' '}— edit unit cost or Qty/Unit below and alerts update instantly.
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-label">Line Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${unitCost.toFixed(2)}</div>
          <div className="stat-label">Unit Cost (Best)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-label">Total at {qty} units</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{new Set(filtered.map(p => p.category)).size}</div>
          <div className="stat-label">Categories</div>
        </div>
      </div>

      <div className="filters">
        <select value={boardFilter} onChange={e => setBoardFilter(e.target.value)} className="filter-select">
          {boards.map(b => (
            <option key={b} value={b}>{b === 'all' ? 'All Boards' : b}</option>
          ))}
        </select>
        <div className="qty-input-group">
          <label>Build Qty:</label>
          <input
            type="number"
            value={qty}
            min={1}
            onChange={e => setQty(Number(e.target.value))}
            className="search-input"
            style={{ width: 100 }}
          />
        </div>
        <button onClick={exportCSV} className="btn-export">Export CSV</button>
        <button onClick={exportJSON} className="btn-export btn-export-json">Export JSON</button>
      </div>

      <div className="bom-table-wrap">
        <table className="build-table">
          <thead>
            <tr>
              <th>Part #</th>
              <th>Description</th>
              <th>Category</th>
              <th>Board</th>
              <th style={{ textAlign: 'center' }}>Qty/Unit ✎</th>
              <th>Best Supplier</th>
              <th>Unit Cost ✎</th>
              <th>Line Total ({qty} units)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(part => {
              const best = getBestSupplier(part)
              const lineTotal = best.unitCost * part.qtyPerUnit * qty
              const hasAlert = alertedParts.has(part.id)
              return (
                <tr key={part.id} className={hasAlert ? 'row-alert-warning' : ''}>
                  <td className="config-name">
                    {part.id}
                    {hasAlert && (
                      <span className="row-alert-icon alert-icon-warning" title="MOQ issue on this part"> 🟡</span>
                    )}
                  </td>
                  <td>{part.description}</td>
                  <td>
                    <span className={`type-badge cat-${part.category.toLowerCase()}`}>{part.category}</span>
                  </td>
                  <td><span className="board-badge">{part.appliesTo}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <EditableCell
                      value={part.qtyPerUnit}
                      onChange={val => updateQtyPerUnit(part.id, val)}
                      min={1}
                    />
                  </td>
                  <td>{best.name}</td>
                  <td className="cost-cell">
                    <EditableCell
                      value={best.unitCost}
                      onChange={val => updateUnitCost(part.id, best.name, val)}
                      min={0}
                      prefix="$"
                      decimals={2}
                    />
                  </td>
                  <td className="cost-cell cost-total">
                    ${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bom-total-row">
              <td colSpan={7}><strong>TOTAL ({qty} units)</strong></td>
              <td className="cost-cell cost-total">
                <strong>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="table-footer">✎ = click any value to edit • changes reflect instantly across all pages</div>
    </div>
  )
}
