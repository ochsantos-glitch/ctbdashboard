import { useState } from 'react'
import { getBestSupplier, getAllSupplierNames, calcSupplierTotals } from '../utils/costEngine'

export default function SupplierMatrix({ bom }) {
  const [qty, setQty] = useState(100)
  const [boardFilter, setBoardFilter] = useState('all')

  const filtered = boardFilter === 'all' ? bom : bom.filter(p => p.appliesTo === boardFilter)
  const suppliers = getAllSupplierNames(bom)
  const totals = calcSupplierTotals(filtered, qty)

  const fullCoverage = totals.filter(t => t.covered === filtered.length)
  const bestTotal = fullCoverage.length ? Math.min(...fullCoverage.map(t => t.total)) : null

  return (
    <div className="supplier-page">
      <h1>Supplier Comparison Matrix</h1>

      <div className="stats-row">
        {totals.map(t => (
          <div
            key={t.name}
            className={`stat-card ${t.total === bestTotal ? 'stat-card-best' : ''}`}
          >
            <div className="stat-value">
              {t.covered > 0
                ? `$${Math.round(t.total).toLocaleString()}`
                : 'N/A'}
            </div>
            <div className="stat-label">{t.name}</div>
            <div className="stat-sublabel">{t.covered}/{t.partsCount} parts</div>
          </div>
        ))}
      </div>

      <div className="filters">
        <select value={boardFilter} onChange={e => setBoardFilter(e.target.value)} className="filter-select">
          <option value="all">All Boards</option>
          {[...new Set(bom.map(p => p.appliesTo))].map(b => (
            <option key={b} value={b}>{b}</option>
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
      </div>

      <div className="matrix-container">
        <table className="matrix-table supplier-matrix-table">
          <thead>
            <tr>
              <th className="row-header" style={{ textAlign: 'left', minWidth: 80 }}>Part #</th>
              <th className="row-header" style={{ textAlign: 'left', minWidth: 220 }}>Description</th>
              <th className="row-header" style={{ textAlign: 'center' }}>Qty/Unit</th>
              {suppliers.map(s => (
                <th key={s} className="config-col">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(part => {
              const best = getBestSupplier(part)
              return (
                <tr key={part.id}>
                  <td className="config-name">{part.id}</td>
                  <td>{part.description}</td>
                  <td style={{ textAlign: 'center' }}>{part.qtyPerUnit}</td>
                  {suppliers.map(sName => {
                    const s = part.suppliers.find(sup => sup.name === sName)
                    const isBest = s && s.name === best.name
                    return (
                      <td key={sName} className={`supplier-cell ${isBest ? 'cell-best' : ''} ${!s ? 'cell-na' : ''}`}>
                        {s ? (
                          <>
                            <div className="cell-price">${s.unitCost.toFixed(2)}</div>
                            <div className="cell-lead">{s.leadTimeDays}d · MOQ {s.moq}</div>
                          </>
                        ) : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bom-total-row">
              <td colSpan={3}><strong>Total at {qty} units</strong></td>
              {totals.map(t => (
                <td key={t.name} className={`supplier-cell ${t.total === bestTotal ? 'cell-best' : ''}`}>
                  <div className="cell-price">
                    <strong>{t.covered > 0 ? `$${Math.round(t.total).toLocaleString()}` : '—'}</strong>
                  </div>
                  <div className="cell-lead">{t.covered}/{filtered.length} parts</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
