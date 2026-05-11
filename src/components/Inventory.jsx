import { useState, useEffect } from 'react'

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

export default function Inventory() {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem('inventory-items')
      if (saved) return JSON.parse(saved)
    } catch {}
    return []
  })

  const [form,    setForm]    = useState(EMPTY_FORM)
  const [adding,  setAdding]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState('receivedDate')
  const [sortDir, setSortDir] = useState('desc')
  const [errors,  setErrors]  = useState({})

  useEffect(() => {
    localStorage.setItem('inventory-items', JSON.stringify(items))
  }, [items])

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

  return (
    <div className="dashboard-page">
      <h1>Inventory</h1>

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
    </div>
  )
}
