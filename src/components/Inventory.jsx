import { useState, useEffect, useRef } from 'react'
import UploadPanel from './UploadPanel'
import BOMExplorer from './BOMExplorer'

const EMPTY_FORM = { material: '', po: '', qty: '', receivedDate: '' }

function makeItem(fields) {
  return { id: crypto.randomUUID(), ...fields, qty: Number(fields.qty) || 0 }
}

// ── Inline editable row cell ──────────────────────────────────────────────────
function InlineCell({ value, type = 'text', onChange, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  if (!editing && draft !== value) setDraft(value)

  if (editing) {
    return (
      <input
        className="inv-inline-input"
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter')  { onChange(draft); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        autoFocus
      />
    )
  }
  return (
    <span
      className="inv-inline-display"
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Click to edit"
    >
      {value || <span className="inv-placeholder">{placeholder}</span>}
    </span>
  )
}

function boardOf(configName) {
  for (const b of ['MPACK', 'MMAIN', 'MPWR', 'MANT', 'MRF']) {
    if ((configName || '').startsWith(b)) return b
  }
  return null
}

export default function Inventory({ bom = [], setBom, builds = [], projects = [], activeProjectId = null, items: itemsProp, setItems: setItemsProp }) {
  const [localItems, setLocalItems] = useState(() => {
    try { const s = localStorage.getItem('inventory-items'); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  const items    = itemsProp    ?? localItems
  const setItems = setItemsProp ?? setLocalItems

  const [form,       setForm]       = useState(EMPTY_FORM)
  const [adding,     setAdding]     = useState(false)
  const [search,     setSearch]     = useState('')
  const [sortCol,    setSortCol]    = useState('receivedDate')
  const [sortDir,    setSortDir]    = useState('desc')
  const [errors,     setErrors]     = useState({})
  const [activeTab,  setActiveTab]  = useState('manual')
  const [bomSearch,  setBomSearch]  = useState('')
  const [filterStage, setFilterStage] = useState('All')
  const [filterProject, setFilterProject] = useState('All')
  const [filterBoard, setFilterBoard] = useState('All')
  const [filterNoStock, setFilterNoStock] = useState(false)
  const [bomPage,    setBomPage]    = useState(1)
  const BOM_PAGE_SIZE = 50

  // ── Resizable columns (BOM Materials tab) ────────────────────────────────
  const BOM_COL_DEFAULTS = [110, 200, 70, 130, 140, 90, 90, 80, 100, 90, 90, 110]
  const [bomColWidths, setBomColWidths] = useState(() => {
    try { const s = localStorage.getItem('inv-bom-col-widths'); return s ? JSON.parse(s) : BOM_COL_DEFAULTS } catch { return BOM_COL_DEFAULTS }
  })
  const bomResizeDrag = useRef(null)

  useEffect(() => {
    const onMove = e => {
      if (!bomResizeDrag.current) return
      const { ci, startX, startW } = bomResizeDrag.current
      setBomColWidths(prev => prev.map((w, i) => i === ci ? Math.max(40, startW + e.clientX - startX) : w))
    }
    const onUp = () => { bomResizeDrag.current = null; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  useEffect(() => { localStorage.setItem('inv-bom-col-widths', JSON.stringify(bomColWidths)) }, [bomColWidths])

  function startColResize(e, ci) {
    e.preventDefault()
    bomResizeDrag.current = { ci, startX: e.clientX, startW: bomColWidths[ci] }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    if (!itemsProp) localStorage.setItem('inventory-items', JSON.stringify(items))
  }, [items, itemsProp])

  // ── Sorting ────────────────────────────────────────────────────────────────
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortedItems = [...items]
    .filter(it =>
      it.material.toLowerCase().includes(search.toLowerCase()) ||
      it.po.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (sortCol === 'qty') { av = Number(av); bv = Number(bv) }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })

  function SortIcon({ col }) {
    if (sortCol !== col) return <span className="sort-icon">⇅</span>
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Add item ───────────────────────────────────────────────────────────────
  function validate(f) {
    const e = {}
    if (!f.material.trim()) e.material = true
    if (!f.po.trim())       e.po       = true
    if (!f.qty || isNaN(Number(f.qty)) || Number(f.qty) < 0) e.qty = true
    return e
  }

  function handleAdd() {
    const e = validate(form)
    setErrors(e)
    if (Object.keys(e).length) return
    setItems(prev => [makeItem(form), ...prev])
    setForm(EMPTY_FORM)
    setAdding(false)
    setErrors({})
  }

  function cancelAdd() {
    setForm(EMPTY_FORM)
    setErrors({})
    setAdding(false)
  }

  // ── Inline edit ────────────────────────────────────────────────────────────
  function updateItem(id, field, value) {
    setItems(prev => prev.map(it =>
      it.id === id
        ? { ...it, [field]: field === 'qty' ? (Number(value) || 0) : value }
        : it
    ))
  }

  function deleteItem(id) {
    if (window.confirm('Remove this inventory record?')) {
      setItems(prev => prev.filter(it => it.id !== id))
    }
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalQty       = items.reduce((s, it) => s + it.qty, 0)
  const uniqueMaterials = new Set(items.map(it => it.material.trim()).filter(Boolean)).size
  const uniquePOs       = new Set(items.map(it => it.po.trim()).filter(Boolean)).size

  // ── BOM Materials derived data ────────────────────────────────────────────
  const activeProject = projects.find(p => p.id === activeProjectId) ?? projects[0] ?? null
  const activeProjectName = activeProject?.name ?? null
  const stages    = ['All', ...new Set(builds.map(b => b.Stage).filter(Boolean))]
  const boards    = ['All', ...new Set(bom.map(p => p.appliesTo).filter(Boolean))]
  const projectNames = ['All', ...projects.map(p => p.name)]

  const filteredBuilds = builds.filter(b =>
    (filterStage   === 'All' || (b.Stage ?? '') === filterStage)
  )

  const filteredBOM = bom.filter(p => {
    if (filterBoard !== 'All' && p.appliesTo !== filterBoard) return false
    if (bomSearch && !(p.kpn||p.lab126pn||'').toLowerCase().includes(bomSearch.toLowerCase()) &&
      !(p.description||'').toLowerCase().includes(bomSearch.toLowerCase())) return false
    if (filterNoStock) {
      const inc = p.deliveryQty != null ? Number(p.deliveryQty) : (Number(p.materialQtyOrdered) || null)
      const need = filteredBuilds.filter(b => boardOf(b.Config) === p.appliesTo || boardOf(b.Config) === null)
        .reduce((s, b) => s + (p.qtyPerUnit || 1) * (Number(b.Quantity) || 0), 0)
      if (!((inc == null || inc === 0) && need > 0)) return false
    }
    return true
  })
  const totalBomPages = Math.ceil(filteredBOM.length / BOM_PAGE_SIZE)
  const pagedBOM      = filteredBOM.slice((bomPage - 1) * BOM_PAGE_SIZE, bomPage * BOM_PAGE_SIZE)

  return (
    <div className="dashboard-page">
      <h1>Inventory</h1>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="bm-subtab-bar" style={{ marginBottom: 16 }}>
        <div className="bm-subtabs">
          <button className={`bm-subtab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>Manual Records</button>
          <button className={`bm-subtab ${activeTab === 'bom' ? 'active' : ''}`} onClick={() => setActiveTab('bom')}>
            BOM Materials {bom.length > 0 && <span style={{ marginLeft:4, fontSize:11, opacity:0.7 }}>({bom.length})</span>}
          </button>
          <button className={`bm-subtab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Upload BOM / Data</button>
          <button className={`bm-subtab ${activeTab === 'explorer' ? 'active' : ''}`} onClick={() => setActiveTab('explorer')}>BOM Explorer</button>
        </div>
      </div>

      {/* ── BOM Materials tab ──────────────────────────────────────── */}
      {activeTab === 'bom' && (
        <div>
          {bom.length === 0 ? (
            <div className="inv-empty" style={{ padding: '40px 20px', textAlign:'center' }}>
              No BOM parts loaded — go to <strong>Build Matrix → BOM / Parts</strong> to upload parts.
            </div>
          ) : (
            <>
              {/* Alert summary */}
              {(() => {
                const noIncoming = filteredBOM.filter(p => {
                  const inc = p.deliveryQty != null ? Number(p.deliveryQty) : (Number(p.materialQtyOrdered) || null)
                  return inc == null
                }).length
                const noStock = filteredBOM.filter(p => {
                  const inc = p.deliveryQty != null ? Number(p.deliveryQty) : (Number(p.materialQtyOrdered) || null)
                  const need = filteredBuilds.filter(b => boardOf(b.Config) === p.appliesTo || boardOf(b.Config) === null)
                    .reduce((s, b) => s + (p.qtyPerUnit || 1) * (Number(b.Quantity) || 0), 0)
                  return (inc == null || inc === 0) && need > 0
                }).length
                if (noIncoming === 0 && noStock === 0) return null
                return (
                  <div style={{ display:'flex', gap:10, marginBottom:10, flexWrap:'wrap' }}>
                    {noIncoming > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:7, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'7px 14px' }}>
                        <span style={{ fontSize:18, lineHeight:1 }}>⚠️</span>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:'#c2410c' }}>{noIncoming.toLocaleString()} parts</div>
                          <div style={{ fontSize:11, color:'#9a3412' }}>No incoming qty set</div>
                        </div>
                      </div>
                    )}
                    {noStock > 0 && (
                      <div
                        onClick={() => { setFilterNoStock(f => !f); setBomPage(1) }}
                        style={{ display:'flex', alignItems:'center', gap:7, background: filterNoStock ? '#dc2626' : '#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'7px 14px', cursor:'pointer', userSelect:'none' }}>
                        <span style={{ fontSize:18, lineHeight:1 }}>🚨</span>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color: filterNoStock ? '#fff' : '#dc2626' }}>{noStock.toLocaleString()} parts</div>
                          <div style={{ fontSize:11, color: filterNoStock ? '#fecaca' : '#991b1b' }}>{filterNoStock ? 'Showing no-stock only — click to clear' : 'Have demand but no stock · click to filter'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Filters */}
              <div className="inv-toolbar" style={{ flexWrap:'wrap', gap:8, marginBottom:12 }}>
                <div className="proj-search-wrap">
                  <span className="proj-search-icon">⌕</span>
                  <input className="proj-search-input" placeholder="Search PN or description…"
                    value={bomSearch} onChange={e => { setBomSearch(e.target.value); setBomPage(1) }} style={{ width:200 }} />
                  {bomSearch && <button className="proj-search-clear" onClick={() => setBomSearch('')}>×</button>}
                </div>
                <select className="filter-select" value={filterBoard} onChange={e => { setFilterBoard(e.target.value); setBomPage(1) }}>
                  {boards.map(b => <option key={b} value={b}>{b === 'All' ? 'All Boards' : b}</option>)}
                </select>
                <select className="filter-select" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
                  {stages.map(s => <option key={s} value={s}>{s === 'All' ? 'All Revisions' : s}</option>)}
                </select>
                <span style={{ fontSize:12, color:'#64748b', alignSelf:'center' }}>
                  {filteredBOM.length} / {bom.length} parts · {filteredBuilds.length} builds
                </span>
              </div>

              {/* Table */}
              <div className="bom-table-wrap" style={{ overflowY: 'auto', height: 'calc(100vh - 235px)' }}>
                <table className="build-table inv-table" style={{ tableLayout: 'fixed', width: bomColWidths.reduce((s,w)=>s+w,0), borderCollapse: 'separate', borderSpacing: 0, overflow: 'visible' }}>
                  <colgroup>{bomColWidths.map((w,i) => <col key={i} style={{ width: w }} />)}</colgroup>
                  <thead>
                    <tr>
                      {[
                        { label:'PN',            ci:0  },
                        { label:'Description',   ci:1  },
                        { label:'Revision',      ci:2  },
                        { label:'MFR',           ci:3  },
                        { label:'MPN',           ci:4  },
                        { label:'Incoming',      ci:5,  right:true },
                        { label:'Qty Needed',    ci:6,  right:true },
                        { label:'Balance',       ci:7,  right:true },
                        { label:'Project',       ci:8  },
                        { label:'Category',      ci:9  },
                        { label:'PO #',          ci:10 },
                        { label:'Received Date', ci:11 },
                      ].map(({ label, ci, right }) => (
                        <th key={ci} style={{ padding: 0, overflow: 'hidden', textAlign: right ? 'right' : 'left', position: 'sticky', top: 0, zIndex: 10, background: '#1a1a2e' }}>
                          <div style={{ display:'flex', alignItems:'stretch', height:'100%' }}>
                            <span style={{ flex:1, padding:'10px 12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign: right ? 'right' : 'left' }}>
                              {label}
                            </span>
                            <div
                              onMouseDown={e => startColResize(e, ci)}
                              style={{ width:5, flexShrink:0, cursor:'col-resize', background:'rgba(255,255,255,0.2)', alignSelf:'stretch' }}
                              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.55)'}
                              onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBOM.length === 0 ? (
                      <tr><td colSpan={12} className="inv-empty">No parts match filters.</td></tr>
                    ) : pagedBOM.map(part => {
                      const relBuilds = filteredBuilds.filter(b => boardOf(b.Config) === part.appliesTo || boardOf(b.Config) === null)
                      const qtyNeeded = relBuilds.reduce((s, b) => s + (part.qtyPerUnit || 1) * (Number(b.Quantity) || 0), 0)
                      const incoming  = part.deliveryQty != null ? Number(part.deliveryQty) : (Number(part.materialQtyOrdered) || null)
                      const noStock   = (incoming == null || incoming === 0) && qtyNeeded > 0
                      const balance   = (incoming != null || qtyNeeded > 0) ? (incoming ?? 0) - qtyNeeded : null
                      const stageSet  = [...new Set(relBuilds.map(b => b.Stage).filter(Boolean))]
                      const projName  = activeProjectName
                      return (
                        <tr key={part.id} className="inv-data-row">
                          <td style={{ fontFamily:'monospace', fontSize:11 }}>{part.kpn || part.lab126pn || part.id || '—'}</td>
                          <td style={{ fontSize:12 }}>{part.description || '—'}</td>
                          <td style={{ fontSize:12, fontFamily:'monospace' }}>
                            {part.rev || <span style={{ color:'#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ fontSize:12, color:'#475569' }}>{part.supplier || <span style={{ color:'#94a3b8' }}>—</span>}</td>
                          <td style={{ fontSize:11, fontFamily:'monospace' }}>{part.mpn || <span style={{ color:'#94a3b8' }}>—</span>}</td>
                          <td style={{ textAlign:'right', fontWeight:600, color: noStock ? '#ef4444' : undefined }}>
                            {incoming != null ? incoming.toLocaleString() : (noStock ? '0' : '—')}
                          </td>
                          <td style={{ textAlign:'right', fontWeight:700 }}>{qtyNeeded > 0 ? qtyNeeded.toLocaleString() : '—'}</td>
                          <td style={{ textAlign:'right', fontWeight:700, color: balance == null ? '#94a3b8' : balance < 0 ? '#ef4444' : '#16a34a', lineHeight: 1.2 }}>
                            {balance == null ? '—' : (
                              <>
                                {`${balance >= 0 ? '+' : ''}${balance.toLocaleString()}`}
                                {noStock && <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', letterSpacing: '0.03em' }}>NO STOCK</div>}
                              </>
                            )}
                          </td>
                          <td>
                            {projName
                              ? <span style={{ padding:'1px 7px', borderRadius:10, fontSize:11, background:'#dcfce7', color:'#15803d' }}>{projName}</span>
                              : <span style={{ color:'#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ fontSize:11 }}>{part.category || '—'}</td>
                          <td style={{ fontSize:12 }}>{part.po || <span style={{ color:'#94a3b8' }}>—</span>}</td>
                          <td style={{ fontSize:12 }}>{part.receivedDate || <span style={{ color:'#94a3b8' }}>—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {filteredBOM.length > 0 && (
                    <tfoot>
                      <tr className="bom-total-row">
                        <td colSpan={5}><strong>Total Qty Needed</strong></td>

                        <td style={{ textAlign:'right' }}>
                          <strong>{filteredBOM.reduce((s, p) => {
                            const rb = filteredBuilds.filter(b => boardOf(b.Config) === p.appliesTo)
                            return s + rb.reduce((rs, b) => rs + (p.qtyPerUnit||1)*(Number(b.Quantity)||0), 0)
                          }, 0).toLocaleString()}</strong>
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {totalBomPages > 1 && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 0', justifyContent:'center' }}>
                  <button className="btn-cancel" style={{ padding:'4px 12px' }} onClick={() => setBomPage(1)} disabled={bomPage === 1}>«</button>
                  <button className="btn-cancel" style={{ padding:'4px 12px' }} onClick={() => setBomPage(p => Math.max(1, p - 1))} disabled={bomPage === 1}>‹</button>
                  <span style={{ fontSize:13, color:'#475569' }}>Page {bomPage} of {totalBomPages} &nbsp;·&nbsp; {filteredBOM.length} parts</span>
                  <button className="btn-cancel" style={{ padding:'4px 12px' }} onClick={() => setBomPage(p => Math.min(totalBomPages, p + 1))} disabled={bomPage === totalBomPages}>›</button>
                  <button className="btn-cancel" style={{ padding:'4px 12px' }} onClick={() => setBomPage(totalBomPages)} disabled={bomPage === totalBomPages}>»</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'upload' && <UploadPanel bom={bom} setBom={setBom} />}
      {activeTab === 'explorer' && <BOMExplorer setBom={setBom} />}

      {activeTab === 'manual' && <>
      {/* ── Summary cards ─────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">Total Records</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueMaterials}</div>
          <div className="stat-label">Unique Materials</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniquePOs}</div>
          <div className="stat-label">Unique PO #s</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalQty.toLocaleString()}</div>
          <div className="stat-label">Total Qty Received</div>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="inv-toolbar">
        <div className="proj-search-wrap">
          <span className="proj-search-icon">⌕</span>
          <input
            className="proj-search-input"
            placeholder="Search material or PO#…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          {search && <button className="proj-search-clear" onClick={() => setSearch('')}>×</button>}
        </div>

        <button className="proj-add-btn inv-add-btn" onClick={() => setAdding(true)} disabled={adding}>
          + Add Record
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bom-table-wrap">
        <table className="build-table inv-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('material')} className="sortable-th">
                Material <SortIcon col="material" />
              </th>
              <th onClick={() => toggleSort('po')} className="sortable-th">
                PO # <SortIcon col="po" />
              </th>
              <th onClick={() => toggleSort('qty')} className="sortable-th" style={{ textAlign: 'center' }}>
                Qty <SortIcon col="qty" />
              </th>
              <th onClick={() => toggleSort('receivedDate')} className="sortable-th">
                Received Date <SortIcon col="receivedDate" />
              </th>
              <th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {/* ── Add form row ── */}
            {adding && (
              <tr className="inv-add-row">
                <td>
                  <input
                    className={`inv-form-input ${errors.material ? 'inv-input-error' : ''}`}
                    placeholder="Material name *"
                    value={form.material}
                    onChange={e => setForm(f => ({ ...f, material: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                    autoFocus
                  />
                </td>
                <td>
                  <input
                    className={`inv-form-input ${errors.po ? 'inv-input-error' : ''}`}
                    placeholder="PO number *"
                    value={form.po}
                    onChange={e => setForm(f => ({ ...f, po: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                  />
                </td>
                <td>
                  <input
                    className={`inv-form-input inv-qty-input ${errors.qty ? 'inv-input-error' : ''}`}
                    placeholder="Qty *"
                    type="number"
                    min="0"
                    value={form.qty}
                    onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                  />
                </td>
                <td>
                  <input
                    className="inv-form-input"
                    type="date"
                    value={form.receivedDate}
                    onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
                  />
                </td>
                <td>
                  <div className="inv-row-actions">
                    <button className="inv-save-btn" onClick={handleAdd} title="Save">✓</button>
                    <button className="inv-cancel-btn" onClick={cancelAdd} title="Cancel">×</button>
                  </div>
                </td>
              </tr>
            )}

            {/* ── Data rows ── */}
            {sortedItems.length === 0 && !adding ? (
              <tr>
                <td colSpan={5} className="inv-empty">
                  {search ? `No records match "${search}"` : 'No inventory records yet — click "+ Add Record" to start.'}
                </td>
              </tr>
            ) : (
              sortedItems.map(it => (
                <tr key={it.id} className="inv-data-row">
                  <td>
                    <InlineCell value={it.material} onChange={v => updateItem(it.id, 'material', v)} placeholder="Material" />
                  </td>
                  <td className="config-name">
                    <InlineCell value={it.po} onChange={v => updateItem(it.id, 'po', v)} placeholder="PO #" />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <InlineCell value={String(it.qty)} type="number" onChange={v => updateItem(it.id, 'qty', v)} placeholder="0" />
                  </td>
                  <td>
                    <InlineCell value={it.receivedDate} type="date" onChange={v => updateItem(it.id, 'receivedDate', v)} placeholder="—" />
                  </td>
                  <td>
                    <button className="inv-delete-btn" onClick={() => deleteItem(it.id)} title="Delete">🗑</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sortedItems.length > 0 && (
            <tfoot>
              <tr className="bom-total-row">
                <td colSpan={2}><strong>TOTAL</strong></td>
                <td style={{ textAlign: 'center' }}><strong>{sortedItems.reduce((s, it) => s + it.qty, 0).toLocaleString()}</strong></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>}
    </div>
  )
}
