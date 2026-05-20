import { useState, useMemo } from 'react'

function emptyMaterial() {
  return {
    id:          crypto.randomUUID(),
    name:        '',
    baseQty:     0,
    buffer:      { failures: 0, attrition: 0, yieldLoss: 0 },
    fatpConfigs: [],
    pos:         [],
  }
}

function emptyPO() {
  return { id: crypto.randomUUID(), poNumber: '', qty: 0, expectedDate: '', supplier: '' }
}

function shortage(mat, builds, allocations) {
  const fatpBuilds = (mat.fatpConfigs || [])
    .map(n => builds.find(b => b.Config === n))
    .filter(Boolean)

  const buildDate = fatpBuilds.map(b => b['Build Date']).filter(Boolean).sort()[0] ?? null

  const bufferTotal =
    (Number(mat.buffer?.failures)  || 0) +
    (Number(mat.buffer?.attrition) || 0) +
    (Number(mat.buffer?.yieldLoss) || 0)

  const poQty = (mat.pos || [])
    .filter(po => !buildDate || !po.expectedDate || po.expectedDate <= buildDate)
    .reduce((s, po) => s + (Number(po.qty) || 0), 0)

  const supply = (Number(mat.baseQty) || 0) + poQty - bufferTotal

  const fatpDemand   = fatpBuilds.reduce((s, b) => s + (Number(b.Quantity) || 0), 0)
  const directDemand = (allocations || [])
    .filter(a => a.configName === mat.name)
    .reduce((s, a) => s + (a.rows || []).reduce((rs, r) => rs + (Number(r.qty) || 0), 0), 0)

  const totalDemand = fatpDemand + directDemand

  return { supply, fatpDemand, directDemand, totalDemand, shortageQty: totalDemand - supply, buildDate, poQty, bufferTotal }
}

// ── PO table for one material ─────────────────────────────────────────────────
function POTable({ pos, buildDate, onAdd, onUpdate, onDelete }) {
  function poStatus(po) {
    if (!po.expectedDate || !buildDate) return 'unknown'
    return po.expectedDate <= buildDate ? 'on-time' : 'late'
  }

  return (
    <div className="mat-po-section">
      <div className="mat-po-header">
        <span className="mat-sub-label">Purchase Orders</span>
        <button className="btn-add-po" onClick={onAdd}>+ Add PO</button>
      </div>
      {pos.length === 0 ? (
        <p className="mat-empty-pos">No POs — add one to cover a shortage.</p>
      ) : (
        <table className="mat-po-table">
          <thead>
            <tr>
              <th>PO #</th>
              <th>Qty</th>
              <th>Delivery Date</th>
              <th>Supplier</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pos.map(po => {
              const st = poStatus(po)
              return (
                <tr key={po.id}>
                  <td>
                    <input className="mat-cell-input" value={po.poNumber}
                      placeholder="PO-1234"
                      onChange={e => onUpdate(po.id, 'poNumber', e.target.value)} />
                  </td>
                  <td>
                    <input className="mat-cell-input mat-cell-num" type="number" min={0} value={po.qty}
                      onChange={e => onUpdate(po.id, 'qty', Number(e.target.value))} />
                  </td>
                  <td>
                    <input className="mat-cell-input" type="date" value={po.expectedDate}
                      onChange={e => onUpdate(po.id, 'expectedDate', e.target.value)} />
                  </td>
                  <td>
                    <input className="mat-cell-input" value={po.supplier}
                      placeholder="Supplier"
                      onChange={e => onUpdate(po.id, 'supplier', e.target.value)} />
                  </td>
                  <td>
                    {po.expectedDate
                      ? <span className={`po-status-badge po-${st}`}>
                          {st === 'on-time' ? '✓ Available' : st === 'late' ? '⚠ Late' : '—'}
                        </span>
                      : <span className="po-status-badge po-unknown">No date</span>}
                  </td>
                  <td>
                    <button className="btn-del-po" onClick={() => onDelete(po.id)} title="Remove PO">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {buildDate && (
        <p className="mat-po-note">
          ℹ POs with delivery date on or before build date ({buildDate}) count toward supply. Late POs are excluded.
        </p>
      )}
    </div>
  )
}

// ── Single material card ──────────────────────────────────────────────────────
function MaterialCard({ mat, builds, allocations, expanded, onToggle, onUpdate, onDelete }) {
  const allConfigs = useMemo(() => builds.map(b => b.Config).sort(), [builds])
  const stats = shortage(mat, builds, allocations)

  function updateField(field, value) {
    onUpdate(mat.id, field, value)
  }

  function updateBuffer(key, value) {
    onUpdate(mat.id, 'buffer', { ...mat.buffer, [key]: Number(value) || 0 })
  }

  function toggleFatp(configName) {
    const next = mat.fatpConfigs.includes(configName)
      ? mat.fatpConfigs.filter(c => c !== configName)
      : [...mat.fatpConfigs, configName]
    onUpdate(mat.id, 'fatpConfigs', next)
  }

  function addPO() {
    onUpdate(mat.id, 'pos', [...mat.pos, emptyPO()])
  }

  function updatePO(poId, field, value) {
    onUpdate(mat.id, 'pos', mat.pos.map(p => p.id === poId ? { ...p, [field]: value } : p))
  }

  function deletePO(poId) {
    onUpdate(mat.id, 'pos', mat.pos.filter(p => p.id !== poId))
  }

  const hasShortage = stats.shortageQty > 0

  return (
    <div className={`mat-card ${hasShortage ? 'mat-card-shortage' : ''}`}>
      {/* Card header */}
      <div className="mat-card-header" onClick={onToggle}>
        <div className="mat-card-title">
          <span className="mat-card-name">{mat.name || <em>Unnamed material</em>}</span>
          {mat.fatpConfigs.length > 0 && (
            <span className="mat-fatp-count">→ {mat.fatpConfigs.length} FATP config{mat.fatpConfigs.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="mat-card-summary">
          <span className="mat-stat">Supply <strong>{stats.supply.toLocaleString()}</strong></span>
          <span className="mat-stat">Demand <strong>{stats.totalDemand.toLocaleString()}</strong></span>
          {hasShortage
            ? <span className="mat-badge-short">⚠ Short {stats.shortageQty.toLocaleString()}</span>
            : stats.totalDemand > 0
              ? <span className="mat-badge-ok">✓ Surplus {(stats.supply - stats.totalDemand).toLocaleString()}</span>
              : null}
          {mat.pos.length > 0 && <span className="mat-po-count">{mat.pos.length} PO{mat.pos.length !== 1 ? 's' : ''}</span>}
        </div>
        <span className="mat-chevron">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="mat-card-body">
          {/* Name */}
          <div className="mat-field-row">
            <label className="mat-field-label">Material Name (MLB)</label>
            <input className="mat-field-input" value={mat.name} placeholder="e.g. E2CF-LBU1-MLB"
              onChange={e => updateField('name', e.target.value)} />
          </div>

          {/* Qty + buffer */}
          <div className="mat-field-row">
            <label className="mat-field-label">Base Qty (SMT output)</label>
            <input className="mat-field-input mat-num" type="number" min={0} value={mat.baseQty}
              onChange={e => updateField('baseQty', Number(e.target.value))} />
          </div>

          <div className="mat-buffer-row">
            <label className="mat-field-label">Buffer</label>
            <div className="mat-buffer-inputs">
              <div className="mat-buf-group">
                <span>Failures</span>
                <input className="mat-cell-input mat-cell-num" type="number" min={0} value={mat.buffer.failures}
                  onChange={e => updateBuffer('failures', e.target.value)} />
              </div>
              <div className="mat-buf-group">
                <span>Attrition</span>
                <input className="mat-cell-input mat-cell-num" type="number" min={0} value={mat.buffer.attrition}
                  onChange={e => updateBuffer('attrition', e.target.value)} />
              </div>
              <div className="mat-buf-group">
                <span>Yield Loss</span>
                <input className="mat-cell-input mat-cell-num" type="number" min={0} value={mat.buffer.yieldLoss}
                  onChange={e => updateBuffer('yieldLoss', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Availability breakdown */}
          <div className="mat-avail-box">
            <div className="mat-avail-row">
              <span>Base Qty</span><span>{Number(mat.baseQty).toLocaleString()}</span>
            </div>
            <div className="mat-avail-row mat-avail-deduct">
              <span>− Buffer (failures {mat.buffer.failures} + attrition {mat.buffer.attrition} + yield {mat.buffer.yieldLoss})</span>
              <span>−{stats.bufferTotal.toLocaleString()}</span>
            </div>
            {stats.poQty > 0 && (
              <div className="mat-avail-row mat-avail-add">
                <span>+ POs arriving before build date</span>
                <span>+{stats.poQty.toLocaleString()}</span>
              </div>
            )}
            <div className="mat-avail-row mat-avail-total">
              <span>Available Supply</span><span>{stats.supply.toLocaleString()}</span>
            </div>
            <div className="mat-avail-row mat-avail-deduct">
              <span>− FATP Demand ({mat.fatpConfigs.join(', ') || 'none'})</span>
              <span>−{stats.fatpDemand.toLocaleString()}</span>
            </div>
            {stats.directDemand > 0 && (
              <div className="mat-avail-row mat-avail-deduct">
                <span>− Direct MLB Allocation</span>
                <span>−{stats.directDemand.toLocaleString()}</span>
              </div>
            )}
            <div className={`mat-avail-row mat-avail-result ${hasShortage ? 'mat-result-short' : 'mat-result-ok'}`}>
              <span>{hasShortage ? '⚠ Shortage' : '✓ Surplus'}</span>
              <span>{hasShortage ? `-${stats.shortageQty.toLocaleString()}` : `+${(stats.supply - stats.totalDemand).toLocaleString()}`}</span>
            </div>
          </div>

          {/* FATP config mapping */}
          <div className="mat-field-row" style={{ alignItems: 'flex-start' }}>
            <label className="mat-field-label" style={{ paddingTop: 6 }}>FATP Configs</label>
            <div className="mat-fatp-grid">
              {allConfigs.length === 0
                ? <span style={{ color: '#94a3b8', fontSize: 12 }}>No configs in Build Matrix yet</span>
                : allConfigs.map(cfg => (
                    <label key={cfg} className="mat-fatp-check">
                      <input type="checkbox" checked={mat.fatpConfigs.includes(cfg)}
                        onChange={() => toggleFatp(cfg)} />
                      {cfg}
                    </label>
                  ))}
            </div>
          </div>

          {/* PO table */}
          <POTable
            pos={mat.pos}
            buildDate={stats.buildDate}
            onAdd={addPO}
            onUpdate={updatePO}
            onDelete={deletePO}
          />

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button className="btn-del-mat" onClick={() => onDelete(mat.id)}>🗑 Remove Material</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Materials (main export) ───────────────────────────────────────────────────
export default function Materials({ materials, setMaterials, builds = [], allocations = [] }) {
  const [expanded, setExpanded] = useState(null)

  function addMaterial() {
    const m = emptyMaterial()
    setMaterials(prev => [...prev, m])
    setExpanded(m.id)
  }

  function updateMaterial(id, field, value) {
    setMaterials(prev => prev.map(m => m.id !== id ? m : { ...m, [field]: value }))
  }

  function deleteMaterial(id) {
    if (!window.confirm('Remove this material?')) return
    setMaterials(prev => prev.filter(m => m.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const shortageCount = materials.filter(m => shortage(m, builds, allocations).shortageQty > 0).length

  return (
    <div className="materials-page">
      <h1>Materials</h1>
      <p className="upload-subtitle">Track MLB/PCBA supply, buffers, and purchase orders. Shortages appear in Alerts.</p>

      {shortageCount > 0 && (
        <div className="mat-shortage-banner">
          ⚠ {shortageCount} material{shortageCount !== 1 ? 's' : ''} below demand — add POs below or reduce FATP qty.
        </div>
      )}

      <div className="mat-list">
        {materials.length === 0 ? (
          <div className="mat-empty">
            No materials tracked yet. Add an MLB to start monitoring supply vs demand.
          </div>
        ) : (
          materials.map(mat => (
            <MaterialCard
              key={mat.id}
              mat={mat}
              builds={builds}
              allocations={allocations}
              expanded={expanded === mat.id}
              onToggle={() => setExpanded(v => v === mat.id ? null : mat.id)}
              onUpdate={updateMaterial}
              onDelete={deleteMaterial}
            />
          ))
        )}
      </div>

      <button className="btn-add-mat" onClick={addMaterial}>+ Add Material</button>
    </div>
  )
}
