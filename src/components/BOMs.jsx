import { useState } from 'react'

const CAT_COLORS = {
  IC:         { bg: '#ede9fe', color: '#6d28d9' },
  ASIC:       { bg: '#ede9fe', color: '#6d28d9' },
  CPU:        { bg: '#dbeafe', color: '#1d4ed8' },
  Memory:     { bg: '#dcfce7', color: '#15803d' },
  PCB:        { bg: '#fef9c3', color: '#a16207' },
  RF:         { bg: '#fee2e2', color: '#dc2626' },
  Connector:  { bg: '#e0f2fe', color: '#0369a1' },
  Mechanical: { bg: '#f1f5f9', color: '#475569' },
  Thermal:    { bg: '#fff7ed', color: '#c2410c' },
  Packaging:  { bg: '#f0fdf4', color: '#166534' },
  Passive:    { bg: '#fdf4ff', color: '#7e22ce' },
  Power:      { bg: '#fef3c7', color: '#92400e' },
  Optics:     { bg: '#ecfeff', color: '#0e7490' },
  Assembly:   { bg: '#f8fafc', color: '#334155' },
  Cable:      { bg: '#fce7f3', color: '#9d174d' },
}
function catChip(cat) {
  const s = CAT_COLORS[cat] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span key={cat} style={{
      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>{cat}</span>
  )
}

export default function BOMs({ bom = [], setBom }) {
  const [selected, setSelected] = useState(null)
  const [search,   setSearch]   = useState('')

  // Group parts by appliesTo
  const assemblies = {}
  for (const part of bom) {
    const key = part.appliesTo || 'Unassigned'
    if (!assemblies[key]) assemblies[key] = []
    assemblies[key].push(part)
  }
  const assemblyList = Object.entries(assemblies).sort(([a], [b]) => a.localeCompare(b))

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    const parts = assemblies[selected] || []
    const filtered = parts.filter(p => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (p.kpn || p.lab126pn || p.id || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      )
    })

    return (
      <div className="dashboard-page">
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18, flexWrap:'wrap' }}>
          <button
            onClick={() => { setSelected(null); setSearch('') }}
            style={{ background:'#1e293b', border:'1px solid #334155', color:'#94a3b8', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:13 }}
          >
            ← All BOMs
          </button>
          <h1 style={{ margin:0, fontSize:22 }}>{selected}</h1>
          <span style={{ fontSize:12, color:'#64748b', alignSelf:'center' }}>{parts.length} parts</span>
        </div>

        {/* Search */}
        <div className="proj-search-wrap" style={{ marginBottom:14 }}>
          <span className="proj-search-icon">⌕</span>
          <input
            className="proj-search-input"
            placeholder="Search PN or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          {search && <button className="proj-search-clear" onClick={() => setSearch('')}>×</button>}
        </div>

        {/* Table */}
        <div className="bom-table-wrap">
          <table className="build-table inv-table" style={{ tableLayout:'fixed', width:'100%' }}>
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 100 }} />
              <col style={{ width:  70 }} />
              <col style={{ width: 170 }} />
              <col style={{ width:  90 }} />
              <col style={{ width:  90 }} />
            </colgroup>
            <thead>
              <tr>
                {['PN', 'Description', 'Category', 'Qty/Unit', 'Primary Supplier', 'Unit Cost', 'Lead Time'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign: ['Qty/Unit','Unit Cost','Lead Time'].includes(h) ? 'right' : 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="inv-empty">No parts match.</td></tr>
              ) : filtered.map(part => {
                const pn  = part.kpn || part.lab126pn || part.id || '—'
                const sup = part.suppliers?.[0]
                return (
                  <tr key={part.id} className="inv-data-row">
                    <td style={{ fontFamily:'monospace', fontSize:11 }}>{pn}</td>
                    <td style={{ fontSize:12 }}>{part.description || '—'}</td>
                    <td>{part.category ? catChip(part.category) : <span style={{ color:'#94a3b8' }}>—</span>}</td>
                    <td style={{ textAlign:'right', fontWeight:600 }}>{part.qtyPerUnit ?? 1}</td>
                    <td style={{ fontSize:12, color:'#475569' }}>{sup?.name || <span style={{ color:'#94a3b8' }}>—</span>}</td>
                    <td style={{ textAlign:'right', fontWeight:600, color:'#0f766e' }}>
                      {sup?.unitCost != null
                        ? `$${Number(sup.unitCost).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}`
                        : <span style={{ color:'#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'right', color:'#64748b', fontSize:12 }}>
                      {sup?.leadTimeDays != null ? `${sup.leadTimeDays}d` : <span style={{ color:'#94a3b8' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bom-total-row">
                  <td colSpan={3}><strong>{filtered.length} parts</strong></td>
                  <td style={{ textAlign:'right' }}>
                    <strong>{filtered.reduce((s, p) => s + (p.qtyPerUnit ?? 1), 0).toLocaleString()}</strong>
                  </td>
                  <td />
                  <td style={{ textAlign:'right' }}>
                    {(() => {
                      const total = filtered.reduce((s, p) => s + (p.suppliers?.[0]?.unitCost ?? 0) * (p.qtyPerUnit ?? 1), 0)
                      return <strong>${total.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}</strong>
                    })()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  // ── Card list view ─────────────────────────────────────────────────────────
  return (
    <div className="dashboard-page">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:8 }}>
        <h1 style={{ margin:0 }}>BOMs</h1>
        <span style={{ fontSize:13, color:'#64748b' }}>
          {assemblyList.length} assemblies · {bom.length} total parts
        </span>
      </div>

      {bom.length === 0 ? (
        <div className="inv-empty" style={{ padding:'40px 20px', textAlign:'center' }}>
          No BOM parts loaded — go to <strong>Build Matrix → BOM / Parts</strong> to upload parts.
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(250px, 1fr))', gap:16 }}>
          {assemblyList.map(([name, parts]) => {
            const cats  = [...new Set(parts.map(p => p.category).filter(Boolean))]
            const topSup = parts.flatMap(p => p.suppliers || [])
            const hasCost = topSup.some(s => s.unitCost != null)
            const estCost = parts.reduce((s, p) => s + (p.suppliers?.[0]?.unitCost ?? 0) * (p.qtyPerUnit ?? 1), 0)
            return (
              <div
                key={name}
                onClick={() => setSelected(name)}
                style={{
                  background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                  padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#00d9ff'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
              >
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4, color:'#f1f5f9' }}>{name}</div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>
                  {parts.length} part{parts.length !== 1 ? 's' : ''}
                  {hasCost && ` · est. $${estCost.toLocaleString(undefined, { maximumFractionDigits:0 })}`}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {cats.map(c => catChip(c))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
