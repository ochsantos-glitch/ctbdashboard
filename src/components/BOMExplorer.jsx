import { useState, useMemo } from 'react'
import { bomSkuData, bomPartsOnly, BOM_LEVELS } from '../data/bomSkuData'

const PAGE_SIZE = 50

// Level badge colours matching the sample spreadsheet shading
const LEVEL_COLOR = {
  0: { bg: '#1a1a2e', color: '#fff' },
  1: { bg: '#1565c0', color: '#fff' },
  2: { bg: '#00838f', color: '#fff' },
  3: { bg: '#f5f5f5', color: '#444' },
}

// PN prefix → Part Type label
function partType(pn) {
  if (!pn) return ''
  if (pn.startsWith('SKU'))  return 'SKU'
  if (pn.startsWith('41-'))  return 'Assembly'
  if (pn.startsWith('21-'))  return 'Sub-Assembly'
  if (pn.startsWith('30-'))  return 'Purchased'
  if (pn.startsWith('20-'))  return 'PCB'
  if (pn.startsWith('12-'))  return 'Component'
  return 'Other'
}

const PART_TYPES = ['All', 'SKU', 'Assembly', 'Sub-Assembly', 'Purchased', 'PCB', 'Component']

export default function BOMExplorer({ setBom }) {
  const [search,   setSearch]   = useState('')
  const [level,    setLevel]    = useState('all')
  const [type,     setType]     = useState('All')
  const [page,     setPage]     = useState(1)

  // Build a set of primaryPNs that match the filter, then include their alt rows
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase()

    // First find matching primary rows
    const matchedPNs = new Set(
      bomPartsOnly.filter(r => {
        const levelOk = level === 'all' || r.level === Number(level)
        const typeOk  = type  === 'All' || partType(r.pn) === type
        const searchOk = !q ||
          (r.pn          && r.pn.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (r.mfr         && r.mfr.toLowerCase().includes(q)) ||
          (r.mpn         && r.mpn.toLowerCase().includes(q))
        return levelOk && typeOk && searchOk
      }).map(r => r._primaryPN)
    )

    // Also match alt rows by mfr/mpn
    if (q) {
      bomSkuData.filter(r => r.rowType === 'alt' &&
        ((r.mfr && r.mfr.toLowerCase().includes(q)) ||
         (r.mpn && r.mpn.toLowerCase().includes(q)))
      ).forEach(r => matchedPNs.add(r._primaryPN))
    }

    // Return all rows (primary + alt) for matched parts, in original order
    return bomSkuData.filter(r => matchedPNs.has(r._primaryPN))
  }, [search, level, type])

  const totalRows  = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function onFilter(setter) {
    return e => { setter(e.target.value); setPage(1) }
  }

  // Stats — count unique parts by level
  const byLevel = BOM_LEVELS.map(l => ({
    l,
    n: bomPartsOnly.filter(r => r.level === l).length,
  }))
  const totalParts = bomPartsOnly.length
  const totalWithAlt = bomSkuData.length

  function exportCSV() {
    const header = ['Level','PN','REV','Description','Usage','MFR','MPN']
    const csvRows = bomSkuData.map(r => [
      r.level ?? '',
      r.pn    ?? '',
      r.rev   ?? '',
      r.description ? `"${r.description}"` : '',
      r.usage ?? '',
      r.mfr,
      r.mpn,
    ])
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: 'bom-export.csv' }).click()
    URL.revokeObjectURL(url)
  }

  function exportJSON() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filteredRows, null, 2)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: 'bom-export.json' }).click()
    URL.revokeObjectURL(url)
  }

  const [importMsg, setImportMsg] = useState(null)

  function importToBOM() {
    if (!setBom) return
    const parts = bomPartsOnly.map(r => ({
      id:          r.id || crypto.randomUUID(),
      kpn:         r.pn || '',
      description: r.description || '',
      rev:         r.rev || '',
      supplier:    r.mfr || '',
      mpn:         r.mpn || '',
      qtyPerUnit:  Number(r.usage) || 1,
      category:    r.level === 0 ? 'SKU' : r.level === 1 ? 'Assembly' : r.level === 2 ? 'Sub-Assembly' : 'Component',
    }))
    const replace = window.confirm(`Import all ${parts.length} BOM Explorer parts to BOM Materials?\nOK = Replace existing  |  Cancel = Add to existing`)
    setBom(replace ? parts : prev => {
      const existing = new Set(prev.map(p => p.kpn).filter(Boolean))
      return [...prev, ...parts.filter(p => !existing.has(p.kpn))]
    })
    setImportMsg(`✓ ${replace ? 'Replaced with' : 'Added'} ${parts.length} parts to BOM Materials`)
    setTimeout(() => setImportMsg(null), 5000)
  }

  return (
    <div className="bom-explorer">
      <h1>
        BOM Explorer{' '}
        <span className="edit-hint-label">
          {totalParts.toLocaleString()} parts · {totalWithAlt.toLocaleString()} rows (incl. alt suppliers)
        </span>
      </h1>

      {/* Level summary pills */}
      <div className="bom-level-pills">
        {byLevel.map(({ l, n }) => (
          <div key={l} className="level-pill"
            style={{ background: LEVEL_COLOR[l].bg, color: LEVEL_COLOR[l].color }}>
            <span className="pill-num">L{l}</span>
            <span className="pill-label">
              {l === 0 ? 'SKU' : l === 1 ? 'Assembly' : l === 2 ? 'Sub-Assy/Purchased' : 'Component'}
            </span>
            <span className="pill-count">{n.toLocaleString()}</span>
          </div>
        ))}
        <div className="level-pill" style={{ background: '#eee', color: '#333' }}>
          <span className="pill-label">Total</span>
          <span className="pill-count">{totalParts.toLocaleString()}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input
          type="text"
          placeholder="Search PN, description, MFR, MPN…"
          value={search}
          onChange={onFilter(setSearch)}
          className="search-input"
          style={{ flex: '1 1 260px' }}
        />
        <select value={level} onChange={onFilter(setLevel)} className="filter-select">
          <option value="all">All Levels</option>
          {BOM_LEVELS.map(l => (
            <option key={l} value={l}>Level {l}</option>
          ))}
        </select>
        <select value={type} onChange={onFilter(setType)} className="filter-select">
          {PART_TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
        </select>
        <button onClick={exportCSV}  className="btn-export">Export CSV</button>
        <button onClick={exportJSON} className="btn-export btn-export-json">Export JSON</button>
        {setBom && <button onClick={importToBOM} className="btn-export" style={{ background:'#059669' }}>⬆ Import All to BOM Materials</button>}
      </div>
      {importMsg && <div className="bm-import-msg bm-import-ok" style={{ margin:'8px 0' }}><strong>{importMsg}</strong></div>}

      {/* Table — matches the sample spreadsheet format */}
      <div className="bom-table-wrap">
        <table className="build-table bom-sku-table bom-new-format">
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Level</th>
              <th style={{ width: 130 }}>PN</th>
              <th style={{ width: 50, textAlign: 'center' }}>REV</th>
              <th>Description</th>
              <th style={{ width: 70, textAlign: 'center' }}>Usage</th>
              <th style={{ width: 180 }}>MFR</th>
              <th style={{ width: 180 }}>MPN</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => {
              const isPart = r.rowType === 'part'
              const lc     = LEVEL_COLOR[r.level] ?? LEVEL_COLOR[3]
              const indent = isPart ? (r.level ?? 0) * 16 : 0

              return (
                <tr key={r.id}
                  className={isPart ? (r.level <= 1 ? 'row-hierarchy' : '') : 'row-alt-supplier'}>

                  {/* Level */}
                  <td style={{ textAlign: 'center' }}>
                    {isPart && r.level !== null && (
                      <span className="level-badge"
                        style={{ background: lc.bg, color: lc.color, fontSize: 11 }}>
                        {r.level}
                      </span>
                    )}
                  </td>

                  {/* PN — indented by level */}
                  <td className="config-name"
                    style={{ paddingLeft: indent + 8 }}>
                    {isPart ? r.pn : ''}
                  </td>

                  {/* REV */}
                  <td style={{ textAlign: 'center', color: '#666', fontSize: 12 }}>
                    {isPart ? r.rev : ''}
                  </td>

                  {/* Description */}
                  <td style={{ maxWidth: 300 }}>{isPart ? r.description : ''}</td>

                  {/* Usage */}
                  <td style={{ textAlign: 'center' }}>
                    {isPart && r.usage != null ? r.usage : ''}
                  </td>

                  {/* MFR */}
                  <td style={{ color: isPart ? 'inherit' : '#666', fontSize: isPart ? 'inherit' : 12 }}>
                    {r.mfr}
                  </td>

                  {/* MPN */}
                  <td className="mpn-cell"
                    style={{ color: isPart ? 'inherit' : '#666', fontSize: isPart ? 'inherit' : 12 }}>
                    {r.mpn}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <span className="page-info">
          Showing rows {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, totalRows)} of {totalRows.toLocaleString()}
          {' '}({filteredRows.filter(r => r.rowType === 'part').length.toLocaleString()} unique parts)
        </span>
        <div className="page-btns">
          <button onClick={() => setPage(1)}          disabled={safePage === 1}>«</button>
          <button onClick={() => setPage(p => p - 1)} disabled={safePage === 1}>‹</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = safePage <= 4 ? i + 1
                    : safePage >= totalPages - 3 ? totalPages - 6 + i
                    : safePage - 3 + i
            if (p < 1 || p > totalPages) return null
            return (
              <button key={p} onClick={() => setPage(p)}
                className={safePage === p ? 'page-active' : ''}>{p}</button>
            )
          })}
          <button onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</button>
        </div>
      </div>
    </div>
  )
}
