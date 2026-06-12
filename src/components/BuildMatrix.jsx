import { useState, useMemo, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import EditableCell from './EditableCell'
import Allocation from './Allocation'
import { alertedConfigSet } from '../utils/alertEngine'
import { calcBOMCost } from '../utils/costEngine'

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES  = ['DIAG', 'COMP', 'LBU', 'POR', 'SAT', 'TEST', 'DOE', 'Golden']

function colorInfo(cssColor) {
  if (!cssColor) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(1,2,3,0.99)'
    ctx.fillStyle = cssColor
    if (ctx.fillStyle === 'rgba(1, 2, 3, 0.99)') return null // invalid color — fillStyle unchanged
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return { isDark: (0.299*r + 0.587*g + 0.114*b) < 128, rgba: a => `rgba(${r},${g},${b},${a})` }
  } catch { return null }
}

function getCustomTypes() {
  try { return JSON.parse(localStorage.getItem('bm-custom-types')) || [] } catch { return [] }
}
function addCustomType(t) {
  const cur = getCustomTypes()
  if (!cur.includes(t)) localStorage.setItem('bm-custom-types', JSON.stringify([...cur, t]))
}
function allTypes() { return [...TYPES, ...getCustomTypes()] }
const BOARDS = ['MMAIN', 'MRF', 'MANT', 'MPWR', 'MPACK']

const CONFIG_DETAIL_FIELDS = [
  { key: 'purpose',       label: 'Purpose' },
  { key: 'rc',            label: 'RC' },
  { key: 'notes',         label: 'Notes' },
  { key: 'pcbaLpn',       label: 'PCBA LPN' },
  { key: 'pcbLpn',        label: 'PCB LPN' },
  { key: 'pcbSupplier',   label: 'PCB Supplier' },
  { key: 'asicMakalu',    label: 'ASIC Makalu' },
  { key: 'asicPluto',     label: 'ASIC Pluto' },
  { key: 'ic',            label: 'IC' },
  { key: 'pmic',          label: 'PMIC' },
  { key: 'bomControlled', label: 'BOM Controlled' },
  { key: 'underfill',     label: 'Underfill Controlled' },
  { key: 'secondSource',  label: '2nd Source' },
]

const DETAIL_LABEL_MAP = {
  'purpose':              'purpose',
  'rc0':                  'rc',        'rc':             'rc',
  'notes':                'notes',
  'pcba lpn':             'pcbaLpn',
  'pcb lpn':              'pcbLpn',
  'pcb supplier':         'pcbSupplier',
  'asic makalu':          'asicMakalu', 'makalu':         'asicMakalu',
  'asic pluto':           'asicPluto',  'pluto':          'asicPluto',
  'ic':                   'ic',
  'pmic':                 'pmic',
  'bom controlled':       'bomControlled',
  'underfill controlled': 'underfill',  'underfill':      'underfill',
  '2nd source':           'secondSource',
}

const TYPE_COLORS = {
  DIAG:   { header: '#e2e8f0', text: '#475569' },
  COMP:   { header: '#dbeafe', text: '#1d4ed8' },
  LBU:    { header: '#ede9fe', text: '#6d28d9' },
  POR:    { header: '#dcfce7', text: '#15803d' },
  SAT:    { header: '#ffedd5', text: '#c2410c' },
  TEST:   { header: '#ccfbf1', text: '#0f766e' },
  DOE:    { header: '#fef9c3', text: '#a16207' },
  Golden: { header: '#fdf4ff', text: '#9333ea' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function boardOf(configName) {
  for (const b of ['MPACK', 'MMAIN', 'MPWR', 'MANT', 'MRF']) {
    if (configName.startsWith(b)) return b
  }
  return null
}

function typeColor(type) {
  return TYPE_COLORS[type] ?? { header: '#f1f5f9', text: '#475569' }
}

function normalizeType(raw) {
  const v = (raw ?? '').trim().toUpperCase()
  for (const t of TYPES) { if (v.includes(t)) return t }
  return 'POR'
}

function normalizeDate(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    let yr = parseInt(slash[3], 10)
    if (yr < 100) yr += yr < 50 ? 2000 : 1900
    return `${yr}-${String(slash[1]).padStart(2,'0')}-${String(slash[2]).padStart(2,'0')}`
  }
  return s
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseTransposedCSV(rows, existingConfigs) {
  let configNames = [], configCols = []
  for (const row of rows) {
    const idx = row.findIndex(c => /^config(s|.*name)?$/i.test(String(c).trim()))
    if (idx !== -1) {
      for (let ci = idx + 1; ci < row.length; ci++) {
        const name = String(row[ci]).trim().toUpperCase()
        if (!name || /^[A-Z]\s*=/.test(name)) break
        if (/^[A-Z0-9][A-Z0-9\-_]+$/.test(name)) { configNames.push(name); configCols.push(ci) }
      }
      if (configNames.length) break
    }
  }
  if (!configNames.length) return null

  const qtys = new Array(configNames.length).fill(0)
  const types = new Array(configNames.length).fill('POR')
  const dates = new Array(configNames.length).fill('')
  const details = configNames.map(() => ({}))

  for (const row of rows) {
    const cells = row.map(c => String(c ?? '').trim())
    const labelCell = cells.slice(0, configCols[0]).find(c => c !== '') ?? ''
    const labelLower = labelCell.toLowerCase()
    if (cells.some(c => c.toLowerCase().includes('material drive')) || cells.some(c => c.toLowerCase() === 'balance')) {
      configCols.forEach((ci, i) => { const n = parseInt(cells[ci], 10); if (n > 0 && qtys[i] === 0) qtys[i] = n })
    }
    if (labelLower === 'purpose') {
      configCols.forEach((ci, i) => { types[i] = normalizeType(cells[ci]); details[i].purpose = cells[ci] })
    }
    if (/build.?date/i.test(labelLower)) {
      configCols.forEach((ci, i) => { const m = cells[ci].match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/); if (m) dates[i] = normalizeDate(m[1]) })
    }
    const fieldKey = DETAIL_LABEL_MAP[labelLower]
    if (fieldKey && fieldKey !== 'purpose') {
      configCols.forEach((ci, i) => { if (cells[ci] && !details[i][fieldKey]) details[i][fieldKey] = cells[ci] })
    }
  }
  const added = [], skipped = []
  configNames.forEach((name, i) => {
    if (!name) return
    if (existingConfigs.includes(name)) { skipped.push(name); return }
    added.push({ Config: name, Type: types[i], Quantity: qtys[i], Status: 'Not Started', 'Build Date': dates[i], 'SMT Modem': '✓', 'SMT Antenna': '✓', FATP: '✓', ...details[i] })
  })
  return { added, skipped, errors: [] }
}

const COL_MAP = {
  config: 'Config', 'config name': 'Config', name: 'Config',
  type: 'Type', status: 'Status', qty: 'Quantity', quantity: 'Quantity',
  'build date': 'Build Date', date: 'Build Date', builddate: 'Build Date',
}

function parseStandardCSV(rows, existingConfigs) {
  if (!rows.length) return { added: [], skipped: [], errors: [] }
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i] && rows[i].some(c => COL_MAP[String(c).trim().toLowerCase()])) { headerIdx = i; break }
  }
  if (!rows[headerIdx]) return { added: [], skipped: [], errors: [] }
  const headers = rows[headerIdx].map(c => String(c).trim().toLowerCase())
  const added = [], skipped = [], errors = []
  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (row.every(c => !String(c).trim())) break
    const mapped = {}
    headers.forEach((h, ci) => { const canon = COL_MAP[h]; if (canon) mapped[canon] = String(row[ci] ?? '').trim() })
    const configName = (mapped['Config'] ?? '').trim().toUpperCase()
    if (!configName) { errors.push(`Row ${ri + 1}: no Config value`); continue }
    if (existingConfigs.includes(configName)) { skipped.push(configName); continue }
    added.push({ Config: configName, Type: normalizeType(mapped['Type']), Status: mapped['Status'] || 'Not Started', Quantity: parseInt(mapped['Quantity'], 10) || 0, 'Build Date': normalizeDate(mapped['Build Date']), 'SMT Modem': '✓', 'SMT Antenna': '✓', FATP: '✓' })
  }
  return { added, skipped, errors }
}

function parseRows(rows, existingConfigs) {
  if (!rows || rows.length === 0) return { added: [], skipped: [], errors: [] }
  try {
    const t = parseTransposedCSV(rows, existingConfigs)
    if (t) return t
    return parseStandardCSV(rows, existingConfigs)
  } catch (e) {
    return { added: [], skipped: [], errors: [e.message] }
  }
}

function parseBuildsCSV(text, existingConfigs) {
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: false })
  return parseRows(data.map(r => r.map(c => String(c ?? ''))), existingConfigs)
}

function parseBuildsXLSX(buffer, existingConfigs) {
  let wb
  try { wb = XLSX.read(buffer, { type: 'array', cellDates: true }) }
  catch (e) { return { added: [], skipped: [], errors: [`Could not read file: ${e.message}`] } }
  const allAdded = [], allSkipped = [], allErrors = []
  const seen = new Set(existingConfigs)
  wb.SheetNames.forEach(sheetName => {
    try {
      const ws = wb.Sheets[sheetName]
      if (!ws) return
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const rows = raw.map(r => (Array.isArray(r) ? r : []).map(c => String(c ?? '').trim()))
      const result = parseRows(rows, [...seen])
      if (!result || !Array.isArray(result.added)) return
      result.added.forEach(b => { if (!seen.has(b.Config)) { seen.add(b.Config); allAdded.push(b) } })
      allSkipped.push(...(result.skipped || []))
      allErrors.push(...(result.errors || []).map(e => `[${sheetName}] ${e}`))
    } catch (err) { allErrors.push(`[${sheetName}] ${err.message}`) }
  })
  return { added: allAdded, skipped: allSkipped, errors: allErrors }
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ config, bom, onSave, onClose }) {
  const [fields, setFields] = useState({
    Config: config.Config, Type: config.Type ?? 'POR', Status: config.Status ?? 'Not Started',
    Quantity: config.Quantity ?? 0, 'Build Date': config['Build Date'] ?? '', costOverride: config.costOverride ?? '',
  })
  const board = boardOf(config.Config)
  const calcCost = calcBOMCost(board ? bom.filter(p => p.appliesTo === board) : [], fields.Quantity)
  const set = (f, v) => setFields(prev => ({ ...prev, [f]: v }))
  function handleSave() {
    onSave(config.Config, { ...fields, Config: fields.Config.trim().toUpperCase() || config.Config, Quantity: Number(fields.Quantity) || 0, costOverride: fields.costOverride === '' ? null : Number(fields.costOverride) })
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-config-modal" onClick={e => e.stopPropagation()}>
        <div className="edit-config-header"><h3>Edit Config</h3><button type="button" className="modal-close-btn" onClick={onClose}>✕</button></div>
        <div className="edit-config-fields">
          <div className="edit-field-row"><label>Config Name</label><input className="edit-field-input" value={fields.Config} onChange={e => set('Config', e.target.value.toUpperCase())} autoFocus /></div>
          <div className="edit-field-row"><label>Type</label><TypeSelect value={fields.Type} onChange={v => set('Type', v)} className="edit-field-select" /></div>
          <div className="edit-field-row"><label>Status</label><select className="edit-field-select" value={fields.Status} onChange={e => set('Status', e.target.value)}><option>Not Started</option><option>On-going</option><option>Completed</option></select></div>
          <div className="edit-field-row"><label>Quantity</label><input className="edit-field-input" type="number" min={0} value={fields.Quantity} onChange={e => set('Quantity', e.target.value)} /></div>
          <div className="edit-field-row"><label>Build Date</label><input className="edit-field-input" type="date" value={fields['Build Date']} onChange={e => set('Build Date', e.target.value)} /></div>
          <div className="edit-field-row"><label>BOM Cost Override</label><input className="edit-field-input" type="number" min={0} placeholder={`Auto: $${Math.round(calcCost).toLocaleString()}`} value={fields.costOverride} onChange={e => set('costOverride', e.target.value)} /></div>
        </div>
        <div className="edit-config-actions">
          <button type="button" className="btn-primary-modal" onClick={handleSave}>✓ Save Changes</button>
          <button type="button" className="btn-cancel-modal" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Type selector with inline "add" ──────────────────────────────────────────
function TypeSelect({ value, onChange, className }) {
  const [types,    setTypes]    = useState(allTypes)
  const [adding,   setAdding]   = useState(false)
  const [draft,    setDraft]    = useState('')

  function confirm() {
    const t = draft.trim().toUpperCase()
    if (t && !types.includes(t)) { addCustomType(t); setTypes(allTypes()); onChange(t) }
    else if (t && types.includes(t)) onChange(t)
    setDraft(''); setAdding(false)
  }

  if (adding) return (
    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="New type…"
        onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
        className="search-input" style={{ width:90 }} />
      <button onClick={confirm} className="btn-export" style={{ padding:'2px 8px' }}>✓</button>
      <button onClick={() => { setAdding(false); setDraft('') }} className="btn-cancel" style={{ padding:'2px 8px' }}>✕</button>
    </div>
  )

  return (
    <select className={className} value={value}
      onChange={e => e.target.value === '__add__' ? setAdding(true) : onChange(e.target.value)}>
      {types.map(t => <option key={t}>{t}</option>)}
      <option value="__add__">＋ Add type…</option>
    </select>
  )
}

// ── Add Config Form ───────────────────────────────────────────────────────────
function AddConfigForm({ onAdd, onCancel, existingConfigs }) {
  const [configName, setConfigName] = useState('')
  const [type,       setType]       = useState('POR')
  const [status,     setStatus]     = useState('Not Started')
  const [quantity,   setQuantity]   = useState(0)
  const [buildDate,  setBuildDate]  = useState('')

  const name      = configName.trim().toUpperCase()
  const duplicate = existingConfigs.includes(name)
  const valid     = !!name && !duplicate

  function handleAdd() {
    if (!valid) return
    onAdd({ Config: name, Type: type, Status: status, Quantity: quantity, 'Build Date': buildDate })
    setConfigName(''); setQuantity(0); setBuildDate('')
  }

  return (
    <div className="add-config-form">
      <h3>New Configuration</h3>
      <div className="add-form-row">
        <div className="add-form-group">
          <label>Config Name</label>
          <input type="text" placeholder="e.g. E2CF-LBU1" value={configName}
            onChange={e => setConfigName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="search-input" style={{ width: 180 }} autoFocus />
          {duplicate && <span className="form-error"> already exists</span>}
        </div>
        <div className="add-form-group"><label>Type</label><TypeSelect value={type} onChange={setType} className="filter-select" /></div>
        <div className="add-form-group"><label>Status</label><select value={status} onChange={e => setStatus(e.target.value)} className="filter-select"><option>Not Started</option><option>On-going</option><option>Completed</option></select></div>
        <div className="add-form-group"><label>Qty</label><input type="number" value={quantity} min={0} onChange={e => setQuantity(Number(e.target.value))} className="search-input" style={{ width: 80 }} /></div>
        <div className="add-form-group"><label>Build Date</label><input type="date" value={buildDate} onChange={e => setBuildDate(e.target.value)} className="search-input" /></div>
        <div className="add-form-actions"><button onClick={handleAdd} className="btn-export" disabled={!valid}>Add</button><button onClick={onCancel} className="btn-cancel">Cancel</button></div>
      </div>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────
const DEFAULT_STAGES = ['FATP', 'MLB (SMT1)', 'MLB (SMT2)']

function ProjectCard({ project, builds, alerts, onEditBuilds, onDelete, onRename, onUpdateStages }) {
  const [renaming,       setRenaming]       = useState(false)
  const [nameDraft,      setNameDraft]      = useState(project.name)
  const [showMenu,       setShowMenu]       = useState(false)
  const [editing,        setEditing]        = useState(false)
  const [editingIdx,     setEditingIdx]     = useState(null)
  const [stageDraft,     setStageDraft]     = useState('')
  const [selectedStage,  setSelectedStage]  = useState(null)

  const stages = project.stages ?? DEFAULT_STAGES

  function saveName() {
    if (nameDraft.trim()) onRename(nameDraft.trim())
    setRenaming(false)
  }

  function startEditStage(idx) {
    setEditingIdx(idx)
    setStageDraft(stages[idx])
  }

  function saveStage() {
    if (editingIdx === null) return
    onUpdateStages(stages.map((s, i) => i === editingIdx ? (stageDraft.trim() || s) : s))
    setEditingIdx(null)
  }

  function deleteStage(idx) {
    onUpdateStages(stages.filter((_, i) => i !== idx))
  }

  function addStage() {
    const next = [...stages, 'New Stage']
    onUpdateStages(next)
    setEditingIdx(next.length - 1)
    setStageDraft('New Stage')
  }

  return (
    <div className="bm-pcard">
      <div className="bm-pcard-header">
        {renaming ? (
          <input className="bm-pcard-name-input" value={nameDraft} autoFocus
            onChange={e => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(false) }} />
        ) : (
          <h3 className="bm-pcard-name">{project.name}</h3>
        )}
        <div className="bm-pcard-actions">
          <button className="bm-pcard-icon-btn bm-pcard-refresh-btn" title="Refresh" onClick={() => window.location.reload()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.65 2.35A8 8 0 1 0 15 8h-2a6 6 0 1 1-1.06-3.4L9.5 7H14V2.5l-1.35-.15z" fill="currentColor"/>
            </svg>
          </button>
          <button className="bm-pcard-icon-btn" title="Favorite">★</button>
          <button className="bm-pcard-icon-btn" title="Message">✉</button>
          <div className="bm-pcard-divider" />
          {editing ? (
            <button className="bm-pcard-done-btn" onClick={() => { setEditing(false); setEditingIdx(null) }}>✓ Done</button>
          ) : (
            <>
              <button className="bm-pcard-edit-btn" onClick={() => onEditBuilds(selectedStage)}>
                {selectedStage ? `✎ Edit ${selectedStage}` : '✎ Edit Builds'}
              </button>
              <div className="bm-pcard-options-wrap" style={{ position: 'relative' }}>
                <button className="bm-pcard-options-btn" onClick={() => setShowMenu(v => !v)}>Project Options ▾</button>
                {showMenu && (
                  <div className="bm-pcard-dropdown" onMouseLeave={() => setShowMenu(false)}>
                    <div className="bm-pcard-menu-item" onClick={() => { setRenaming(true); setShowMenu(false) }}>✎ Rename</div>
                    <div className="bm-pcard-menu-item" onClick={() => { setEditing(true); setShowMenu(false) }}>⚙ Edit Stages</div>
                    <div className="bm-pcard-menu-item bm-pcard-menu-danger" onClick={() => { setShowMenu(false); onDelete() }}>🗑 Delete</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bm-pcard-body">
        <div className="bm-pcard-stages">
          {stages.map((stage, idx) => (
            <div key={idx} className={`bm-pcard-stage-row ${!editing && selectedStage === stage ? 'selected' : ''}`}
              onClick={() => !editing && setSelectedStage(s => s === stage ? null : stage)}>
              {editing && editingIdx === idx ? (
                <input className="bm-pcard-stage-input" value={stageDraft} autoFocus
                  onChange={e => setStageDraft(e.target.value)}
                  onBlur={saveStage}
                  onKeyDown={e => { if (e.key === 'Enter') saveStage(); if (e.key === 'Escape') setEditingIdx(null) }} />
              ) : (
                <>
                  <span className="bm-pcard-stage">{stage}</span>
                  {editing && (
                    <>
                      <button className="bm-pcard-stage-pencil" onClick={e => { e.stopPropagation(); startEditStage(idx) }} title="Rename">✎</button>
                      <button className="bm-pcard-stage-del" onClick={e => { e.stopPropagation(); deleteStage(idx) }} title="Remove">✕</button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          {editing && (
            <button className="bm-pcard-add-build" onClick={addStage}>+ Add Build...</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Project Landing ───────────────────────────────────────────────────────────
function ProjectLanding({ projects, setProjects, builds, alerts, activeProjectId, setActiveProjectId, onEditBuilds }) {
  const [search,   setSearch]   = useState('')
  const [showNew,  setShowNew]  = useState(false)
  const [newName,  setNewName]  = useState('')

  function addProject() {
    if (!newName.trim()) return
    const p = { id: crypto.randomUUID(), name: newName.trim(), budget: 12000, plan: { smt: [], fatp: [] }, history: [] }
    setProjects(prev => [...prev, p])
    setActiveProjectId(p.id)
    setNewName('')
    setShowNew(false)
  }

  function deleteProject(id) {
    if (projects.length <= 1) { alert('Cannot delete the only project.'); return }
    if (!window.confirm('Delete this project?')) return
    setProjects(prev => prev.filter(p => p.id !== id))
    if (activeProjectId === id) setActiveProjectId(projects.find(p => p.id !== id)?.id ?? null)
  }

  function renameProject(id, name) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }

  function updateProjectStages(id, stages) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, stages } : p))
  }

  const filtered = projects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="bm-landing">
      <div className="bm-landing-topbar">
        <div className="bm-landing-tabs-row">
          <button className="bm-landing-tab active">All Projects</button>
          <button className="bm-landing-tab">★ Favorites</button>
          <button className="bm-landing-tab">Archive Requests</button>
        </div>
        <input className="bm-landing-search" placeholder="Search projects…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bm-landing-toolbar">
        <button className="bm-landing-add-btn" onClick={() => setShowNew(v => !v)}>
          + Add Project…
        </button>
        <select className="filter-select" style={{ fontSize: 13 }}>
          <option>Sort: Most Recent</option>
          <option>Sort: Name A–Z</option>
        </select>
      </div>

      {showNew && (
        <div className="bm-new-project-row">
          <input className="bm-inline-input" placeholder="Project name…" value={newName} autoFocus
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addProject(); if (e.key === 'Escape') setShowNew(false) }} />
          <button className="btn-export" onClick={addProject}>Add</button>
          <button className="btn-cancel" onClick={() => setShowNew(false)}>Cancel</button>
        </div>
      )}

      <div className="bm-project-list">
        {filtered.length === 0 && (
          <div className="bm-empty" style={{ padding: '40px 20px' }}>
            {projects.length === 0 ? 'No projects yet — click "+ Add Project…" to start.' : 'No projects match your search.'}
          </div>
        )}
        {filtered.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            builds={builds}
            alerts={alerts}
            onEditBuilds={stage => { setActiveProjectId(p.id); onEditBuilds(stage) }}
            onDelete={() => deleteProject(p.id)}
            onRename={name => renameProject(p.id, name)}
            onUpdateStages={stages => updateProjectStages(p.id, stages)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Config Summary Panel (transposed) ─────────────────────────────────────────
function ConfigSummary({ builds, setBuilds, bom, alerts, allocations, customRows, setCustomRows, logChange, stageLabel, allBuilds, scrollRef, onTableScroll }) {
  const [configSearch,  setConfigSearch]  = useState('')
  const [showDetails,   setShowDetails]   = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [editingCell,   setEditingCell]   = useState(null)
  const [draft,         setDraft]         = useState('')

  const filtered = builds.filter(b => b.Config.toLowerCase().includes(configSearch.toLowerCase()))

  const totalInput = builds.reduce((s, b) => s + (Number(b.Quantity) || 0), 0)
  const totalAlloc = allocations.reduce((s, a) => s + (a.rows || []).reduce((rs, r) => rs + (Number(r.qty) || 0), 0), 0)

  function saveCell(configName, field, value) {
    const oldVal = filtered.find(c => c.Config === configName)?.[field] ?? ''
    if (logChange) logChange(configName, field, oldVal, value)
    setBuilds(prev => prev.map(b => b.Config !== configName ? b : { ...b, [field]: value }))
    setEditingCell(null)
  }

  function Cell({ configName, field }) {
    const isEditing = editingCell?.configName === configName && editingCell?.field === field
    const config    = filtered.find(c => c.Config === configName)
    const value     = config?.[field] ?? ''
    return (
      <td className="bm-cell bm-editable-cell"
        onClick={() => !isEditing && (setEditingCell({ configName, field }), setDraft(String(value)))}>
        {isEditing ? (
          <input className="bm-inline-input" value={draft} autoFocus style={{ width: 90 }}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => saveCell(configName, field, draft)}
            onKeyDown={e => { if (e.key === 'Enter') saveCell(configName, field, draft); if (e.key === 'Escape') setEditingCell(null) }} />
        ) : <span className={value ? '' : 'tm-na-dash'}>{value || '—'}</span>}
      </td>
    )
  }

  return (
    <div className="bm-summary-panel">
      {editingConfig && (
        <EditModal config={editingConfig} bom={bom}
          onSave={(orig, newF) => {
            if (logChange && editingConfig) {
              Object.keys(newF).forEach(k => {
                if (String(editingConfig[k] ?? '') !== String(newF[k] ?? '')) {
                  logChange(orig, k, editingConfig[k] ?? '', newF[k] ?? '')
                }
              })
            }
            setBuilds(prev => prev.map(b => b.Config !== orig ? b : { ...b, ...newF }))
            setEditingConfig(null)
          }}
          onClose={() => setEditingConfig(null)} />
      )}

      <div className="bm-summary-layout">
        {/* Totals */}
        <div className="bm-totals-panel">
          <div className="bm-totals-title">{stageLabel ? `${stageLabel} Totals` : 'Totals'}</div>
          <div className="bm-total-item"><span>Total Input</span><strong>{totalInput.toLocaleString()}</strong></div>
          <div className="bm-total-item"><span>Target Total</span><strong>{totalInput.toLocaleString()}</strong></div>
          <div className="bm-total-item"><span>Actual Total</span><strong style={{ color: '#94a3b8' }}>0</strong></div>
          <div className="bm-total-divider" />
          <div className="bm-total-item"><span>Allocated</span><strong>{totalAlloc.toLocaleString()}</strong></div>
          <div className="bm-total-item">
            <span>Remaining</span>
            <strong style={{ color: totalInput - totalAlloc < 0 ? '#ef4444' : '#22c55e' }}>
              {(totalInput - totalAlloc).toLocaleString()}
            </strong>
          </div>
          {allBuilds && !stageLabel && (() => {
            const stages = [...new Set(allBuilds.map(b => b.Stage).filter(Boolean))]
            if (!stages.length) return null
            return <>
              <div className="bm-total-divider" />
              {stages.map(s => {
                const sq = allBuilds.filter(b => b.Stage === s).reduce((n, b) => n + (Number(b.Quantity)||0), 0)
                return <div key={s} className="bm-total-item" style={{ fontSize: 11 }}>
                  <span style={{ color: '#64748b' }}>{s}</span>
                  <strong style={{ fontSize: 12 }}>{sq.toLocaleString()}</strong>
                </div>
              })}
            </>
          })()}
        </div>

        {/* Config matrix */}
        <div className="bm-matrix-wrap">
          <div className="bm-matrix-toolbar">
            <input className="bm-config-search" placeholder="Filter Configs…"
              value={configSearch} onChange={e => setConfigSearch(e.target.value)} />
            <span className="bm-matrix-count">{filtered.length} configs</span>
          </div>

          {filtered.length === 0 ? (
            <div className="bm-empty">No configs yet — use "+ Add Config" above.</div>
          ) : (
            <div className="bm-table-scroll" ref={scrollRef} onScroll={onTableScroll}>
              <table className="bm-transposed-table">
                <thead>
                  <tr>
                    <th className="bm-field-col" style={{ position: 'sticky', left: 0, zIndex: 3, background: '#f8fafc' }}>Fields</th>
                    {filtered.map(c => {
                      const colors    = typeColor(c.Type)
                      const rowAlerts = alerts.filter(a => a.config === c.Config)
                      const danger    = rowAlerts.some(a => a.type === 'danger')
                      return (
                        <th key={c.Config} className="bm-config-col"
                          style={{ background: danger ? '#fee2e2' : colors.header }}>
                          <div className="bm-config-header-inner">
                            <span className="bm-config-name" style={{ color: danger ? '#b91c1c' : colors.text }}>
                              {c.Config}
                            </span>
                            <div className="bm-config-header-actions">
                              <button className="bm-hdr-btn" onClick={() => setEditingConfig(c)}>✎</button>
                              <button className="bm-hdr-btn bm-hdr-del"
                                onClick={() => { if (window.confirm(`Remove ${c.Config}?`)) setBuilds(prev => prev.filter(b => b.Config !== c.Config)) }}>✕</button>
                            </div>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bm-section-row"><td colSpan={filtered.length + 1}>Build Info</td></tr>

                  <tr><td className="bm-row-label">Build Date</td>{filtered.map(c => <td key={c.Config} className="bm-cell">{c['Build Date'] || '—'}</td>)}</tr>

                  <tr>
                    <td className="bm-row-label">Type</td>
                    {filtered.map(c => { const col = typeColor(c.Type); return <td key={c.Config} className="bm-cell"><span className="bm-type-chip" style={{ background: col.header, color: col.text }}>{c.Type}</span></td> })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Status</td>
                    {filtered.map(c => <td key={c.Config} className="bm-cell"><span className={`status-badge status-${(c.Status ?? 'not-started').toLowerCase().replace(/\s+/g,'-')}`}>{c.Status ?? 'Not Started'}</span></td>)}
                  </tr>

                  <tr><td className="bm-row-label">Input Qty</td>{filtered.map(c => <td key={c.Config} className="bm-cell bm-cell-num">{(Number(c.Quantity)||0).toLocaleString()}</td>)}</tr>

                  <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                    <td className="bm-row-label" style={{ fontWeight: 700, color: '#1e293b' }}>Build Total <span style={{ fontWeight: 400, color: '#64748b', fontSize: 10 }}>({filtered.reduce((s,c)=>s+(Number(c.Quantity)||0),0).toLocaleString()})</span></td>
                    {filtered.map(c => <td key={c.Config} className="bm-cell bm-cell-num" style={{ fontWeight: 700, fontSize: 13 }}>{(Number(c.Quantity)||0).toLocaleString()}</td>)}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Allocated</td>
                    {filtered.map(c => {
                      const alloc = allocations.find(a => a.configName === c.Config)
                      const aq    = alloc ? alloc.rows.reduce((s, r) => s + (Number(r.qty)||0), 0) : null
                      const rem   = aq != null ? c.Quantity - aq : null
                      return (
                        <td key={c.Config} className="bm-cell bm-cell-num">
                          {aq != null ? <>{aq.toLocaleString()} <span style={{ color: rem < 0 ? '#ef4444' : '#86efac', fontSize: 11 }}>({rem >= 0 ? '+' : ''}{rem.toLocaleString()})</span></> : <span className="tm-na-dash">—</span>}
                        </td>
                      )
                    })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">BOM Cost</td>
                    {filtered.map(c => {
                      const board = boardOf(c.Config)
                      const cost  = calcBOMCost(board ? bom.filter(p => p.appliesTo === board) : bom, c.Quantity)
                      const disp  = c.costOverride != null ? c.costOverride : cost
                      return <td key={c.Config} className="bm-cell bm-cell-num">${Math.round(disp).toLocaleString()}{c.costOverride != null && <span className="tm-overridden">*</span>}</td>
                    })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Alerts</td>
                    {filtered.map(c => {
                      const ra = alerts.filter(a => a.config === c.Config)
                      const wt = ra.some(a => a.type === 'danger') ? 'danger' : ra.some(a => a.type === 'warning') ? 'warning' : ra.length ? 'info' : null
                      return <td key={c.Config} className="bm-cell" style={{ textAlign: 'center' }}>
                        {wt ? <span title={ra.map(a => a.message).join('\n')}>{wt === 'danger' ? '🔴' : wt === 'warning' ? '🟡' : 'ℹ️'}{ra.length > 1 && ` ×${ra.length}`}</span> : <span style={{ color: '#22c55e' }}>✓</span>}
                      </td>
                    })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Mat. Shortage</td>
                    {filtered.map(c => {
                      const board = boardOf(c.Config)
                      const boardParts = board ? bom.filter(p => p.appliesTo === board) : bom
                      const shortages = boardParts.filter(p => {
                        const usage = builds.reduce((s, b) => s + (p.qtyPerUnit || 1) * (Number(b.Quantity)||0), 0)
                        const ord = Number(p.materialQtyOrdered) || 0
                        return ord > 0 && ord < usage
                      })
                      return (
                        <td key={c.Config} className="bm-cell" style={{ textAlign: 'center' }}>
                          {shortages.length > 0
                            ? <span title={`${shortages.length} part(s) below material drive`} style={{ color: '#ef4444', fontWeight: 700 }}>⚠ {shortages.length}</span>
                            : <span style={{ color: bom.length ? '#22c55e' : '#94a3b8' }}>{bom.length ? '✓' : '—'}</span>
                          }
                        </td>
                      )
                    })}
                  </tr>

                  <tr className="bm-section-row bm-section-toggle" onClick={() => setShowDetails(v => !v)}>
                    <td colSpan={filtered.length + 1}>{showDetails ? '▾' : '▸'} Configuration Details <span className="bm-section-hint">— click to expand · click any cell to edit</span></td>
                  </tr>

                  {showDetails && CONFIG_DETAIL_FIELDS.map(({ key, label }) => (
                    <tr key={key}>
                      <td className="bm-row-label">{label}</td>
                      {filtered.map(c => <Cell key={c.Config} configName={c.Config} field={key} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── BOM Parts Table (rows = parts, cols = configs) ────────────────────────────
function BOMPartsTable({ bom, builds, scrollRef, onTableScroll }) {
  const [partSearch,   setPartSearch]   = useState('')
  const [filterBoard,  setFilterBoard]  = useState('all')
  const [filterCat,    setFilterCat]    = useState('all')

  const boards = useMemo(() => ['all', ...new Set(bom.map(p => p.appliesTo).filter(Boolean))], [bom])
  const cats   = useMemo(() => ['all', ...new Set(bom.map(p => p.category).filter(Boolean))], [bom])

  const filtered = useMemo(() => bom.filter(p =>
    (filterBoard === 'all' || p.appliesTo === filterBoard) &&
    (filterCat   === 'all' || p.category  === filterCat) &&
    (!partSearch || p.kpn?.toLowerCase().includes(partSearch.toLowerCase()) || p.lab126pn?.toLowerCase().includes(partSearch.toLowerCase()) || p.description?.toLowerCase().includes(partSearch.toLowerCase()))
  ), [bom, partSearch, filterBoard, filterCat])

  if (bom.length === 0) return (
    <div className="bm-bom-parts-empty">
      No BOM parts loaded — go to the <strong>BOM / Parts</strong> tab to upload parts.
    </div>
  )

  return (
    <div className="bm-bom-parts-section">
      <div className="bm-bom-parts-toolbar">
        <span className="bm-bom-parts-title">BOM Parts</span>
        <input className="bm-search-input" style={{ width: 220 }} placeholder="Search part ID or description…"
          value={partSearch} onChange={e => setPartSearch(e.target.value)} />
        <select className="filter-select" value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>
          {boards.map(b => <option key={b} value={b}>{b === 'all' ? 'All Boards' : b}</option>)}
        </select>
        <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          {cats.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <span className="bm-bom-count">{filtered.length} / {bom.length} parts</span>
      </div>

      <div className="bm-bom-parts-scroll" ref={scrollRef} onScroll={onTableScroll}>
        <table className="bm-flat-table">
          <thead>
            <tr>
              <th style={{ minWidth: 130, position: 'sticky', left: 0,   zIndex: 3, background: '#f8fafc' }}>PN</th>
              <th style={{ minWidth: 180, position: 'sticky', left: 130, zIndex: 3, background: '#f8fafc' }}>Description</th>
              <th style={{ minWidth: 80,  position: 'sticky', left: 310, zIndex: 3, background: '#f8fafc' }}>Category</th>
              <th style={{ minWidth: 130, position: 'sticky', left: 390, zIndex: 3, background: '#f8fafc' }}>MFR</th>
              <th style={{ minWidth: 130, position: 'sticky', left: 520, zIndex: 3, background: '#f8fafc' }}>MPN</th>
              <th style={{ minWidth: 55, textAlign: 'right', position: 'sticky', left: 650, zIndex: 3, background: '#f8fafc' }}>QTY/Device</th>
              <th style={{ minWidth: 90, textAlign: 'right', position: 'sticky', left: 705, zIndex: 3, background: '#f8fafc' }}>Material Drive</th>
              <th style={{ minWidth: 80, textAlign: 'right', position: 'sticky', left: 795, zIndex: 3, background: '#f0fdf4', color: '#15803d', borderRight: '2px solid #94a3b8' }}>Balance/Notes</th>
              {builds.map(c => {
                const col = typeColor(c.Type)
                return <th key={c.Config} style={{ minWidth: 80, textAlign: 'right', background: col.header, color: col.text, fontSize: 11 }}>{c.Config}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8 + builds.length} className="bm-empty-row">No parts match your filters.</td></tr>
            ) : (
              filtered.map((part) => {
                const totalUsage = builds.reduce((s, c) => {
                  const board = boardOf(c.Config)
                  return board && board === part.appliesTo ? s + (part.qtyPerUnit || 1) * (Number(c.Quantity)||0) : s
                }, 0)
                const matOrdered = Number(part.materialQtyOrdered) || 0
                const balance    = matOrdered > 0 ? matOrdered - totalUsage : null
                return (
                  <tr key={part.id} className="bm-bom-part-row">
                    <td className="bm-flat-cell" style={{ fontFamily: 'monospace', fontSize: 11, position: 'sticky', left: 0,   zIndex: 1, background: '#fff' }}>{part.kpn || part.lab126pn || part.id || '—'}</td>
                    <td className="bm-flat-cell" style={{ fontSize: 12, position: 'sticky', left: 130, zIndex: 1, background: '#fff' }}>{part.description}</td>
                    <td className="bm-flat-cell" style={{ position: 'sticky', left: 310, zIndex: 1, background: '#fff' }}><span className={`type-badge cat-${(part.category ?? '').toLowerCase()}`}>{part.category}</span></td>
                    <td className="bm-flat-cell" style={{ fontSize: 11, color: '#475569', position: 'sticky', left: 390, zIndex: 1, background: '#fff' }}>{part.supplier || <span className="tm-na-dash">—</span>}</td>
                    <td className="bm-flat-cell" style={{ fontFamily: 'monospace', fontSize: 11, position: 'sticky', left: 520, zIndex: 1, background: '#fff' }}>{part.mpn || <span className="tm-na-dash">—</span>}</td>
                    <td className="bm-flat-cell" style={{ textAlign: 'right', position: 'sticky', left: 650, zIndex: 1, background: '#fff' }}>{part.qtyPerUnit ?? 1}</td>
                    <td className="bm-flat-cell bm-cell-num" style={{ position: 'sticky', left: 705, zIndex: 1, background: '#fff' }}>{matOrdered > 0 ? matOrdered.toLocaleString() : <span className="tm-na-dash">—</span>}</td>
                    <td className="bm-flat-cell bm-cell-num" style={{ fontWeight: 700, color: balance == null ? '#94a3b8' : balance < 0 ? '#ef4444' : '#16a34a', fontSize: 12, background: '#f0fdf4', position: 'sticky', left: 795, zIndex: 1, borderRight: '2px solid #94a3b8' }}>
                      {balance == null ? '—' : balance < 0 ? `${balance.toLocaleString()} ⚠` : balance.toLocaleString()}
                    </td>
                    {builds.map(c => {
                      const board = boardOf(c.Config)
                      const match = board && board === part.appliesTo
                      const qty   = match ? (part.qtyPerUnit || 1) * (Number(c.Quantity)||0) : null
                      return (
                        <td key={c.Config} className={`bm-flat-cell ${match ? 'bm-cell-num' : 'tm-na'}`} style={{ textAlign: 'right', fontSize: 12 }}>
                          {qty != null ? qty.toLocaleString() : <span className="tm-na-dash">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
          {filtered.length > 0 && builds.length > 0 && (
            <tfoot>
              <tr className="bm-flat-footer">
                <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700, fontSize: 11, position: 'sticky', left: 0, zIndex: 1, background: '#f8fafc' }}>Total usage per config →</td>
                <td style={{ position: 'sticky', left: 795, zIndex: 1, background: '#f8fafc', borderRight: '2px solid #94a3b8' }}></td>
                {builds.map(c => {
                  const board = boardOf(c.Config)
                  const total = filtered.filter(p => board && p.appliesTo === board).reduce((s, p) => s + (p.qtyPerUnit || 1) * (Number(c.Quantity)||0), 0)
                  return <td key={c.Config} className="bm-flat-cell bm-cell-num" style={{ fontWeight: 700 }}>{total > 0 ? total.toLocaleString() : '—'}</td>
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Unified Current View (config summary + BOM in one aligned table) ─────────
function UnifiedCurrentView({ builds, setBuilds, bom, setBom, alerts, allocations, logChange, stageLabel, allBuilds }) {
  const NUM_FX = 7
  const BM_COL_DEFAULTS = [120, 180, 60, 130, 140, 80, 70]
  const [colWidths, setColWidths] = useState(() => {
    try {
      const s = localStorage.getItem('bm-col-widths')
      if (s) {
        const parsed = JSON.parse(s)
        const trimmed = parsed.slice(0, 7)
        return BM_COL_DEFAULTS.map((def, i) => (trimmed[i] != null && !isNaN(trimmed[i])) ? trimmed[i] : def)
      }
    } catch {}
    return BM_COL_DEFAULTS
  })
  const SL = colWidths.map((_, i) => colWidths.slice(0, i).reduce((s, w) => s + w, 0))
  const [cfgColWidths, setCfgColWidths] = useState(() => {
    try { const s = localStorage.getItem('bm-cfg-col-widths'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const getCfgW  = name => cfgColWidths[name] ?? 90
  const cfgStyle = (name, extra = {}) => ({ width: getCfgW(name), maxWidth: getCfgW(name), overflow: 'hidden', ...extra })

  const resizeDrag = useRef(null)

  useEffect(() => {
    const onMove = e => {
      if (!resizeDrag.current) return
      const { ci, cfgName, type, startX, startW } = resizeDrag.current
      const newW = Math.max(40, startW + e.clientX - startX)
      if (type === 'total')    setTotalW(newW)
      else if (type === 'bal') setBalW(newW)
      else if (cfgName)        setCfgColWidths(prev => ({ ...prev, [cfgName]: newW }))
      else                     setColWidths(prev => prev.map((w, i) => i === ci ? newW : w))
    }
    const onUp = () => {
      resizeDrag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  useEffect(() => {
    localStorage.setItem('bm-col-widths', JSON.stringify(colWidths))
  }, [colWidths])

  useEffect(() => {
    localStorage.setItem('bm-cfg-col-widths', JSON.stringify(cfgColWidths))
  }, [cfgColWidths])
  const BAL_BG    = '#f0fdf4'
  const TH_BG     = '#f8fafc'
  const FRZ       = { borderRight: '2px solid #94a3b8' }

  const [cfgSearch,   setCfgSearch]   = useState('')
  const [filterBoard, setFilterBoard] = useState('all')
  const [filterCat,   setFilterCat]   = useState('all')
  const [showDetails, setShowDetails] = useState(false)
  const [editingCfg,  setEditingCfg]  = useState(null)
  const [editCell,    setEditCell]    = useState(null)
  const [draft,       setDraft]       = useState('')
  const [editingPart, setEditingPart] = useState(null)
  const [partDraft,   setPartDraft]   = useState('')
  const [filterPN,    setFilterPN]    = useState('')
  const [filterDesc,  setFilterDesc]  = useState('')
  const [filterMFR,   setFilterMFR]   = useState('')
  const [filterMPN,   setFilterMPN]   = useState('')
  const [addingPart,  setAddingPart]  = useState(false)
  const [newPartData, setNewPartData] = useState({})

  const filteredCfgs = builds.filter(c => c.Config.toLowerCase().includes(cfgSearch.toLowerCase()))
  const filteredBOM  = useMemo(() => bom.filter(p =>
    (filterBoard === 'all' || p.appliesTo === filterBoard) &&
    (filterCat   === 'all' || p.category  === filterCat)  &&
    (!filterPN   || (p.kpn||p.lab126pn||'').toLowerCase().includes(filterPN.toLowerCase())) &&
    (!filterDesc || (p.description||'').toLowerCase().includes(filterDesc.toLowerCase())) &&
    (!filterMFR  || (p.supplier||'').toLowerCase().includes(filterMFR.toLowerCase())) &&
    (!filterMPN  || (p.mpn||'').toLowerCase().includes(filterMPN.toLowerCase()))
  ), [bom, filterBoard, filterCat, filterPN, filterDesc, filterMFR, filterMPN])

  const boards     = useMemo(() => ['all', ...new Set(bom.map(p => p.appliesTo).filter(Boolean))], [bom])
  const cats       = useMemo(() => ['all', ...new Set(bom.map(p => p.category).filter(Boolean))],  [bom])
  const totalInput = builds.reduce((s, b) => s + (Number(b.Quantity)||0), 0)
  const totalAlloc = allocations.reduce((s, a) => s + (a.rows||[]).reduce((rs,r) => rs+(Number(r.qty)||0),0), 0)

  function saveConfigCell(configName, field, value) {
    const oldVal = builds.find(c => c.Config === configName)?.[field] ?? ''
    if (logChange) logChange(configName, field, oldVal, value)
    setBuilds(prev => prev.map(b => b.Config !== configName ? b : { ...b, [field]: value }))
    setEditCell(null)
  }

  const [totalW, setTotalW] = useState(() => { try { const v = Number(localStorage.getItem('bm-total-w')); return (v >= 60 && v <= 400) ? v : 130 } catch { return 130 } })
  const [balW,   setBalW]   = useState(() => { try { const v = Number(localStorage.getItem('bm-bal-w'));   return (v >= 60 && v <= 400) ? v : 110 } catch { return 110 } })
  useEffect(() => { localStorage.setItem('bm-total-w', totalW) }, [totalW])
  useEffect(() => { localStorage.setItem('bm-bal-w',   balW)   }, [balW])
  function hdrStyle(ci, extra = {}) {
    return { width: colWidths[ci], maxWidth: colWidths[ci], overflow:'hidden',
      position: 'sticky', left: SL[ci], top: 0, zIndex: 4,
      background: ci === 5 ? BAL_BG : TH_BG, ...(ci === 6 ? FRZ : {}), ...extra }
  }
  function cellStyle(ci, bg = '#fff', extra = {}) {
    return { width: colWidths[ci], maxWidth: colWidths[ci], overflow:'hidden',
      position: 'sticky', left: SL[ci], zIndex: 1,
      background: ci === 5 ? BAL_BG : bg, ...(ci === 6 ? FRZ : {}), ...extra }
  }
  function cw(name) { const w = getCfgW(name); return { width: w, maxWidth: w, overflow:'hidden' } }
  function cfgLabelCell(label, style = {}) {
    return (
      <td colSpan={NUM_FX} style={{
        position: 'sticky', left: 0, zIndex: 2,
        background: style.background ?? TH_BG,
        borderBottom: '1px solid #f1f5f9',
        borderRight: '2px solid #94a3b8',
        padding: '3px 8px',
        fontSize: 11, fontWeight: 600, color: style.color ?? '#475569',
        whiteSpace: 'nowrap',
        ...style,
      }}>
        {label}
      </td>
    )
  }
  function savePart(partId, field, value) {
    const numFields = ['qtyPerUnit', 'deliveryQty']
    const coerced = numFields.includes(field) ? (value === '' ? null : Number(value)||0) : value
    setBom(prev => prev.map(p => p.id !== partId ? p : { ...p, [field]: coerced }))
    setEditingPart(null)
  }

  function commitNewPart() {
    if (!newPartData.description && !newPartData.kpn) return
    setBom(prev => [...prev, { id: crypto.randomUUID(), qtyPerUnit: 1, ...newPartData }])
    setNewPartData({})
    setAddingPart(false)
  }

  function startResize(e, ci) {
    e.preventDefault()
    resizeDrag.current = { ci, cfgName: null, startX: e.clientX, startW: colWidths[ci] }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  function startCfgResize(e, name) {
    e.preventDefault()
    resizeDrag.current = { ci: null, cfgName: name, startX: e.clientX, startW: getCfgW(name) }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  function startTotalResize(e, type) {
    e.preventDefault()
    resizeDrag.current = { type, startX: e.clientX, startW: type === 'total' ? totalW : balW }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="bm-unified-current">
      <div className="bm-unified-toolbar">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className="bm-bom-parts-title">BOM Parts</span>
          <select className="filter-select" value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>
            {boards.map(b => <option key={b} value={b}>{b === 'all' ? 'All Boards' : b}</option>)}
          </select>
          <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            {cats.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
          <span className="bm-bom-count">{filteredBOM.length} / {bom.length} parts</span>
          {(filterPN||filterDesc||filterMFR||filterMPN) && (
            <button className="bm-clear-btn" onClick={() => { setFilterPN(''); setFilterDesc(''); setFilterMFR(''); setFilterMPN('') }}>✕ Clear filters</button>
          )}
          <button className="btn-export" onClick={() => setAddingPart(v => !v)}>{addingPart ? '✕ Cancel' : '+ Add Part'}</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input className="bm-config-search" placeholder="Filter Configs…" value={cfgSearch} onChange={e => setCfgSearch(e.target.value)} />
          <span className="bm-matrix-count">{filteredCfgs.length} configs</span>
          {stageLabel && <span style={{ padding:'2px 10px', borderRadius:12, background:'#dbeafe', color:'#1d4ed8', fontSize:12, fontWeight:700 }}>{stageLabel}</span>}
          <span style={{ fontSize:11, color:'#64748b' }}>Input: <strong>{totalInput.toLocaleString()}</strong> · Remaining: <strong style={{ color: totalInput-totalAlloc < 0 ? '#ef4444':'#22c55e' }}>{(totalInput-totalAlloc).toLocaleString()}</strong></span>
        </div>
      </div>

      {addingPart && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'10px 16px', background:'#f0f9ff', borderBottom:'2px solid #bae6fd', alignItems:'center' }}>
          {[
            { field:'kpn',         ph:'PN *',         w:110 },
            { field:'description', ph:'Description',  w:180 },
            { field:'supplier',    ph:'MFR Name',     w:120 },
            { field:'mpn',         ph:'MPN',          w:120 },
            { field:'qtyPerUnit',  ph:'Qty/Unit',     w:70,  num:true },
            { field:'uom',         ph:'UOM',          w:60  },
          ].map(({ field, ph, w, num }) => (
            <input key={field} className="bm-inline-input" style={{ width:w, fontSize:12 }}
              type={num ? 'number' : 'text'} placeholder={ph}
              value={newPartData[field] ?? ''}
              onChange={e => setNewPartData(p => ({ ...p, [field]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') commitNewPart(); if (e.key === 'Escape') { setAddingPart(false); setNewPartData({}) } }} />
          ))}
          <select className="filter-select" style={{ fontSize:12 }}
            value={newPartData.appliesTo ?? ''}
            onChange={e => setNewPartData(p => ({ ...p, appliesTo: e.target.value }))}>
            <option value="">Board…</option>
            {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button className="btn-export" style={{ padding:'4px 14px' }} onClick={commitNewPart}>✓ Save Part</button>
          <button className="btn-cancel" style={{ padding:'4px 10px' }} onClick={() => { setAddingPart(false); setNewPartData({}) }}>Cancel</button>
        </div>
      )}

      <div className="bm-unified-scroll">
        <table style={{ tableLayout:'fixed', width: colWidths.reduce((s,w)=>s+w,0) + filteredCfgs.reduce((s,c)=>s+getCfgW(c.Config),0) + totalW + balW + 36, borderCollapse:'collapse', fontSize:11, background:'#fff' }}>
          <colgroup>
            {colWidths.map((w,i) => <col key={i} style={{ width:w }} />)}
            {filteredCfgs.map(c => <col key={c.Config} style={{ width: getCfgW(c.Config) }} />)}
            <col style={{ width: totalW }} />
            <col style={{ width: balW }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead />
          <tbody>
            {/* ── Config section ── */}
            <tr className="bm-section-row">
              <td colSpan={NUM_FX + filteredCfgs.length} style={{ position:'sticky', left:0 }}>
                Config Summary
              </td>
            </tr>

            {/* Config attribute rows — all click-to-edit */}
            {[
              { label:'🔒 Clear to Build', field:'clearToBuild', kind:'text' },
              { label:'Fill Color',  field:'fillColor',   kind:'text',
                render: c => c.fillColor
                  ? <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
                      <span style={{width:10,height:10,borderRadius:2,background:c.fillColor,display:'inline-block',border:'1px solid #cbd5e1'}} />
                      {c.fillColor}
                    </span>
                  : <span className="tm-na-dash">—</span>
              },
              { label:'Category',     field:'cfgCategory', kind:'text' },
              { label:'Build Date',   field:'Build Date',  kind:'date' },
              { label:'CTB Priority', field:'ctbPriority', kind:'number', num:true },
              { label:'Input Qty',    field:'Quantity',    kind:'number', num:true,
                render: c => (Number(c.Quantity)||0).toLocaleString() },
              { label:'Yield',        field:'yield',       kind:'number', num:true,
                render: c => c.yield ?? 1 },
              { label:'CM',           field:'cm',          kind:'text' },
              { label:'Address',      field:'address',     kind:'text' },
              { label:'DRI',          field:'dri',         kind:'text' },
              { label:'Target Output',field:'targetOutput',kind:'number', num:true,
                render: c => (c.targetOutput ?? (Number(c.Quantity)||0)).toLocaleString() },
              { label:'Actual Output',field:'actualOutput',kind:'number', num:true,
                render: c => (Number(c.actualOutput)||0).toLocaleString() },
              { label:'Notes',        field:'notes',       kind:'text' },
              { label:'Status',       field:'Status',      kind:'status',
                render: c => <span className={`status-badge status-${(c.Status??'not-started').toLowerCase().replace(/\s+/g,'-')}`}>{c.Status??'Not Started'}</span> },
              { label:'Type',         field:'Type',        kind:'type',
                render: c => { const col=typeColor(c.Type); return <span className="bm-type-chip" style={{background:col.header,color:col.text}}>{c.Type}</span> } },
            ].map(({ label, field, kind, render, num }) => (
              <tr key={label}>
                {cfgLabelCell(label)}
                {filteredCfgs.map(c => {
                  const isEd = editCell?.configName === c.Config && editCell?.field === field
                  const raw  = c[field] ?? ''
                  return (
                    <td key={c.Config}
                      className={`bm-cell${num?' bm-cell-num':''} bm-editable-cell`}
                      style={cw(c.Config)}
                      onClick={() => { if (!isEd) { setEditCell({ configName: c.Config, field }); setDraft(String(raw)) } }}>
                      {isEd
                        ? kind === 'status'
                          ? <select className="bm-inline-input" value={draft} autoFocus
                              onChange={e => setDraft(e.target.value)}
                              onBlur={() => saveConfigCell(c.Config, field, draft)}
                              onKeyDown={e => { if (e.key==='Enter') saveConfigCell(c.Config,field,draft); if(e.key==='Escape') setEditCell(null) }}>
                              <option>Not Started</option><option>On-going</option><option>Completed</option>
                            </select>
                          : kind === 'type'
                          ? <TypeSelect value={draft} onChange={v => { setDraft(v); saveConfigCell(c.Config,field,v) }} className="bm-inline-input" />
                          : <input className="bm-inline-input" value={draft} autoFocus
                              type={kind==='number'?'number':kind==='date'?'date':'text'}
                              onChange={e => setDraft(e.target.value)}
                              onBlur={() => saveConfigCell(c.Config,field,kind==='number'?Number(draft)||0:draft)}
                              onKeyDown={e => { if(e.key==='Enter') saveConfigCell(c.Config,field,kind==='number'?Number(draft)||0:draft); if(e.key==='Escape') setEditCell(null) }}
                              style={{width:'90%'}} />
                        : (render ? render(c) : (raw || <span className="tm-na-dash">—</span>))
                      }
                    </td>
                  )
                })}
              </tr>
            ))}

            <tr>
              {cfgLabelCell('Alerts')}
              {filteredCfgs.map(c => {
                const ra = alerts.filter(a => a.config === c.Config)
                const wt = ra.some(a => a.type==='danger') ? 'danger' : ra.some(a => a.type==='warning') ? 'warning' : ra.length ? 'info' : null
                return <td key={c.Config} className="bm-cell" style={{...cw(c.Config), textAlign:'center'}}>
                  {wt ? <span title={ra.map(a=>a.message).join('\n')}>{wt==='danger'?'🔴':wt==='warning'?'🟡':'ℹ️'}{ra.length>1&&` ×${ra.length}`}</span> : <span style={{ color:'#22c55e' }}>✓</span>}
                </td>
              })}
            </tr>

            {/* ── BOM section ── */}
            {(bom.length > 0 || addingPart) && <>
              {/* BOM column headers — sticky at top of scroll area while in BOM section */}
              <tr>
                {[
                  {ci:0, label:'PN'},
                  {ci:1, label:'Description'},
                  {ci:2, label:'Rev'},
                  {ci:3, label:'MFR Name'},
                  {ci:4, label:'MPN'},
                  {ci:5, label:'Usage', extra:{ color:'#15803d' }, suffix: <span style={{fontWeight:400,fontSize:10,color:'#94a3b8',marginLeft:4}}>({filteredBOM.length}{filteredBOM.length!==bom.length?`/${bom.length}`:''} parts)</span>},
                  {ci:6, label:'UOM'},
                ].map(({ci, label, extra={}, suffix}) => (
                  <td key={ci} style={{ ...hdrStyle(ci, extra), padding:0 }}>
                    <div style={{ display:'flex', height:28 }}>
                      <span style={{ flex:1, padding:'0 6px', display:'flex', alignItems:'center', overflow:'hidden', whiteSpace:'nowrap' }}>
                        {label}{suffix}
                      </span>
                      <div
                        onMouseDown={e => startResize(e, ci)}
                        style={{ width:6, flexShrink:0, cursor:'col-resize', background:'#d1d5db', alignSelf:'stretch' }}
                        onMouseEnter={e => e.currentTarget.style.background='#6b7280'}
                        onMouseLeave={e => e.currentTarget.style.background='#d1d5db'}
                      />
                    </div>
                  </td>
                ))}
                {filteredCfgs.map(c => {
                  const col  = typeColor(c.Type)
                  const fill = colorInfo(c.fillColor)
                  const ra   = alerts.filter(a => a.config === c.Config)
                  const dng  = ra.some(a => a.type === 'danger')
                  const bg   = dng ? '#fee2e2' : fill ? c.fillColor : col.header
                  const fg   = dng ? '#b91c1c' : fill ? (fill.isDark ? '#fff' : '#1e293b') : col.text
                  return (
                    <td key={c.Config} style={{ position:'sticky', top:0,
                      fontSize:10, padding:0, overflow:'hidden',
                      background: bg, color: fg,
                      border:'1px solid #e2e8f0', zIndex:3, verticalAlign:'top' }}>
                      <div style={{ display:'flex', alignItems:'stretch' }}>
                        <div style={{ flex:1, padding:'4px 6px', display:'flex', flexDirection:'column', gap:3, alignItems:'flex-start', overflow:'hidden' }}>
                          <span style={{ fontWeight:800, letterSpacing:'0.03em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{c.Config}</span>
                          <div className="bm-config-header-actions" style={{ display:'flex', gap:2 }}>
                            <button className="bm-hdr-btn" onClick={() => setEditingCfg(c)}>✎</button>
                            <button className="bm-hdr-btn bm-hdr-del" onClick={() => { if (window.confirm(`Remove ${c.Config}?`)) setBuilds(prev => prev.filter(b => b.Config !== c.Config)) }}>✕</button>
                          </div>
                        </div>
                        <div onMouseDown={e => startCfgResize(e, c.Config)}
                          style={{ width:6, flexShrink:0, cursor:'col-resize', background: fill ? (fill.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)') : '#d1d5db', alignSelf:'stretch' }}
                          onMouseEnter={e => e.currentTarget.style.background= fill ? (fill.isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)') : '#6b7280'}
                          onMouseLeave={e => e.currentTarget.style.background= fill ? (fill.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)') : '#d1d5db'} />
                      </div>
                    </td>
                  )
                })}
                <td style={{ fontSize:10, fontWeight:700, padding:0,
                  background:'#eff6ff', color:'#1d4ed8', border:'1px solid #e2e8f0',
                  borderLeft:'2px solid #94a3b8', verticalAlign:'middle', overflow:'hidden',
                  width:totalW, minWidth:totalW, maxWidth:totalW }}>
                  <div style={{ display:'flex', alignItems:'stretch', height:'100%', minHeight:28 }}>
                    <span style={{ flex:1, padding:'4px 6px', display:'flex', alignItems:'center', justifyContent:'flex-start', flexWrap:'wrap', overflow:'hidden' }}>
                      Total Shipment Qty
                    </span>
                    <div
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); startTotalResize(e, 'total') }}
                      style={{ width:6, flexShrink:0, cursor:'col-resize', background:'rgba(29,78,216,0.2)', alignSelf:'stretch' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(29,78,216,0.6)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(29,78,216,0.2)'} />
                  </div>
                </td>
                <td style={{ fontSize:10, fontWeight:700, padding:0,
                  background:'#f0fdf4', color:'#15803d', border:'1px solid #e2e8f0',
                  verticalAlign:'middle', overflow:'hidden',
                  width:balW, minWidth:balW, maxWidth:balW }}>
                  <div style={{ display:'flex', alignItems:'stretch', height:'100%', minHeight:28 }}>
                    <span style={{ flex:1, padding:'4px 6px', display:'flex', alignItems:'center', justifyContent:'flex-start', flexWrap:'wrap', overflow:'hidden' }}>
                      Balance Qty
                    </span>
                    <div
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); startTotalResize(e, 'bal') }}
                      style={{ width:6, flexShrink:0, cursor:'col-resize', background:'rgba(21,128,61,0.2)', alignSelf:'stretch' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(21,128,61,0.6)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(21,128,61,0.2)'} />
                  </div>
                </td>
                <td style={{ position:'sticky', top:0, width:36, minWidth:36,
                  background:'#f8fafc', border:'1px solid #e2e8f0', zIndex:3 }} />
              </tr>
              {/* Per-column BOM filter row — sticky just below column headers */}
              <tr style={{ background:'#f1f5f9' }}>
                {[
                  { ci:0, val:filterPN,   set:setFilterPN,   ph:'Filter PN…' },
                  { ci:1, val:filterDesc, set:setFilterDesc, ph:'Filter description…' },
                  { ci:3, val:filterMFR,  set:setFilterMFR,  ph:'Filter MFR…' },
                  { ci:4, val:filterMPN,  set:setFilterMPN,  ph:'Filter MPN…' },
                ].map(({ ci, val, set, ph }) => (
                  <td key={ci} style={{ position:'sticky', left:SL[ci], top:32, zIndex:5, background:'#f1f5f9', padding:'2px 3px', borderBottom:'2px solid #cbd5e1' }}>
                    <input className="bm-col-filter" placeholder={ph} value={val} onChange={e=>set(e.target.value)}
                      style={{ width:'100%', fontSize:10, padding:'2px 4px', border:'1px solid #e2e8f0', borderRadius:3, background:'#fff' }} />
                  </td>
                ))}
                <td style={{ position:'sticky', left:SL[2], top:32, zIndex:5, background:'#f1f5f9', borderBottom:'2px solid #cbd5e1' }} />
                <td style={{ position:'sticky', left:SL[5], top:32, zIndex:5, background:'#f1f5f9', borderBottom:'2px solid #cbd5e1' }} />
                <td style={{ position:'sticky', left:SL[6], top:32, zIndex:5, background:'#f1f5f9', borderBottom:'2px solid #cbd5e1', ...FRZ }} />
                {filteredCfgs.map(c => <td key={c.Config} style={{...cw(c.Config), background:'#f1f5f9', borderBottom:'2px solid #cbd5e1', padding:0}} />)}
                <td style={{ width:totalW, minWidth:totalW, background:'#eff6ff', borderBottom:'2px solid #cbd5e1', borderLeft:'2px solid #94a3b8' }} />
                <td style={{ width:balW, minWidth:balW, background:'#f0fdf4', borderBottom:'2px solid #cbd5e1' }} />
                <td style={{ width:36, minWidth:36, background:'#f8fafc', borderBottom:'2px solid #cbd5e1' }} />
              </tr>
              {filteredBOM.length === 0 ? (
                <tr><td colSpan={NUM_FX+filteredCfgs.length} className="bm-empty-row">No parts match filters.</td></tr>
              ) : filteredBOM.map(part => {
                const totalUsage = builds.reduce((s,c) => s + (part.qtyPerUnit||1)*(Number(c.Quantity)||0), 0)
                const remaining  = part.deliveryQty != null ? part.deliveryQty - totalUsage : null
                const isEdPart = (field) => editingPart?.partId === part.id && editingPart?.field === field
                return (
                  <tr key={part.id} className="bm-bom-part-row">
                    <td className="bm-flat-cell bm-editable-cell" style={cellStyle(0)}
                      onClick={()=>{if(!isEdPart('kpn')){setEditingPart({partId:part.id,field:'kpn'});setPartDraft(part.kpn||part.lab126pn||'')}}}>
                      {isEdPart('kpn') ? (
                        <input className="bm-inline-input" value={partDraft} autoFocus style={{width:110}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'kpn',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'kpn',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : <span className={part.kpn||part.lab126pn?'':'tm-na-dash'}>{part.kpn||part.lab126pn||part.id||'—'}</span>}
                    </td>
                    <td className="bm-flat-cell bm-editable-cell" style={{...cellStyle(1),fontSize:12,overflow:'hidden',textOverflow:'ellipsis'}} title={part.description}
                      onClick={()=>{if(!isEdPart('description')){setEditingPart({partId:part.id,field:'description'});setPartDraft(part.description||'')}}}>
                      {isEdPart('description') ? (
                        <input className="bm-inline-input" value={partDraft} autoFocus style={{width:170}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'description',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'description',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : <span className={part.description?'':'tm-na-dash'}>{part.description||'—'}</span>}
                    </td>
                    <td className="bm-flat-cell bm-editable-cell" style={{...cellStyle(2),fontSize:11,overflow:'hidden',textOverflow:'ellipsis'}}
                      onClick={()=>{if(!isEdPart('rev')){setEditingPart({partId:part.id,field:'rev'});setPartDraft(part.rev||'')}}}>
                      {isEdPart('rev') ? (
                        <input className="bm-inline-input" value={partDraft} autoFocus style={{width:50}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'rev',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'rev',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : <span className={part.rev?'':'tm-na-dash'}>{part.rev||'—'}</span>}
                    </td>
                    <td className="bm-flat-cell bm-editable-cell" style={{...cellStyle(3),fontSize:11,color:'#475569',overflow:'hidden',textOverflow:'ellipsis'}}
                      onClick={()=>{if(!isEdPart('supplier')){setEditingPart({partId:part.id,field:'supplier'});setPartDraft(part.supplier||'')}}}>
                      {isEdPart('supplier') ? (
                        <input className="bm-inline-input" value={partDraft} autoFocus style={{width:120}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'supplier',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'supplier',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : <span className={part.supplier?'':'tm-na-dash'}>{part.supplier||'—'}</span>}
                    </td>
                    <td className="bm-flat-cell bm-editable-cell" style={{...cellStyle(4),fontFamily:'monospace',fontSize:11,overflow:'hidden',textOverflow:'ellipsis'}}
                      onClick={()=>{if(!isEdPart('mpn')){setEditingPart({partId:part.id,field:'mpn'});setPartDraft(part.mpn||'')}}}>
                      {isEdPart('mpn') ? (
                        <input className="bm-inline-input" value={partDraft} autoFocus style={{width:130}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'mpn',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'mpn',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : <span className={part.mpn?'':'tm-na-dash'}>{part.mpn||'—'}</span>}
                    </td>
                    <td className="bm-flat-cell bm-editable-cell bm-cell-num" style={{...cellStyle(5),fontSize:12}} title="Click to edit qty/unit">
                      {isEdPart('qtyPerUnit') ? (
                        <input className="bm-inline-input" type="number" value={partDraft} autoFocus style={{width:60,textAlign:'right'}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'qtyPerUnit',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'qtyPerUnit',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : (
                        <div style={{cursor:'pointer'}} onClick={()=>{if(!isEdPart('qtyPerUnit')){setEditingPart({partId:part.id,field:'qtyPerUnit'});setPartDraft(String(part.qtyPerUnit??1))}}}>
                          <div style={{fontWeight:700,color:'#16a34a'}}>{part.qtyPerUnit ?? 1}</div>
                        </div>
                      )}
                    </td>
                    <td className="bm-flat-cell bm-editable-cell" style={cellStyle(6)}
                      onClick={()=>{if(!isEdPart('uom')){setEditingPart({partId:part.id,field:'uom'});setPartDraft(part.uom||'')}}}>
                      {isEdPart('uom') ? (
                        <input className="bm-inline-input" value={partDraft} autoFocus style={{width:60}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'uom',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'uom',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : <span className={part.uom?'':'tm-na-dash'}>{part.uom||'—'}</span>}
                    </td>
                    {filteredCfgs.map(c => {
                      const qty = (part.qtyPerUnit||1)*(Number(c.Quantity)||0)
                      const col = typeColor(c.Type)
                      return (
                        <td key={c.Config} className="bm-flat-cell" style={{
                          ...cw(c.Config), textAlign:'right', fontSize:12,
                          background: col.header, color: col.text, fontWeight: 700,
                        }}>
                          {qty.toLocaleString()}
                        </td>
                      )
                    })}
                    {/* Total shipment qty — editable */}
                    <td className="bm-flat-cell bm-editable-cell bm-cell-num"
                      style={{ width:totalW, minWidth:totalW, fontSize:12, background:'#eff6ff', borderLeft:'2px solid #94a3b8' }}
                      title="Click to set total shipment qty">
                      {isEdPart('deliveryQty') ? (
                        <input className="bm-inline-input" type="number" value={partDraft} autoFocus style={{width:80,textAlign:'right'}}
                          onChange={e=>setPartDraft(e.target.value)}
                          onBlur={()=>savePart(part.id,'deliveryQty',partDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')savePart(part.id,'deliveryQty',partDraft);if(e.key==='Escape')setEditingPart(null)}} />
                      ) : (
                        <div style={{cursor:'pointer',padding:'2px 6px'}} onClick={()=>{setEditingPart({partId:part.id,field:'deliveryQty'});setPartDraft(String(part.deliveryQty??''))}}>
                          {part.deliveryQty != null
                            ? <div style={{fontWeight:700,color:'#1d4ed8'}}>{Number(part.deliveryQty).toLocaleString()}</div>
                            : <span className="tm-na-dash">—</span>}
                        </div>
                      )}
                    </td>
                    {/* Balance qty — auto-calculated */}
                    <td className="bm-flat-cell bm-cell-num"
                      style={{ width:balW, minWidth:balW, fontSize:12, background:'#f0fdf4' }}>
                      {remaining != null
                        ? <div style={{fontWeight:700, padding:'2px 6px', color:remaining>=0?'#16a34a':'#dc2626'}}>
                            {remaining>=0?'+':''}{remaining.toLocaleString()}
                          </div>
                        : <span className="tm-na-dash">—</span>}
                    </td>
                    {/* Delete row */}
                    <td style={{ width:36, minWidth:36, textAlign:'center', verticalAlign:'middle', background:'#fff', padding:'0 2px' }}>
                      <button className="bm-hdr-btn bm-hdr-del"
                        style={{ fontSize:13, padding:'2px 5px' }}
                        title="Remove part"
                        onClick={() => {
                          const pn = part.kpn || part.lab126pn || part.id
                          if (window.confirm(`Remove "${pn}" from BOM?\n\nThis cannot be undone.`)) {
                            setBom(prev => prev.filter(p => p.id !== part.id))
                          }
                        }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredBOM.length > 0 && filteredCfgs.length > 0 && (
                <tr className="bm-flat-footer">
                  <td colSpan={6} style={{ textAlign:'right', fontWeight:700, fontSize:11, position:'sticky', left:0, zIndex:1, background:'#f8fafc' }}>Total usage per config →</td>
                  <td style={{ position:'sticky', left:SL[6], zIndex:1, background:'#f8fafc', ...FRZ }}></td>
                  {filteredCfgs.map(c => {
                    const total = filteredBOM.reduce((s,p) => s+(p.qtyPerUnit||1)*(Number(c.Quantity)||0), 0)
                    return <td key={c.Config} className="bm-flat-cell bm-cell-num" style={{...cw(c.Config), fontWeight:700}}>{total>0?total.toLocaleString():'—'}</td>
                  })}
                  <td style={{ width:totalW, background:'#eff6ff', borderLeft:'2px solid #94a3b8' }} />
                  <td style={{ width:balW, background:'#f0fdf4' }} />
                  <td style={{ width:36, background:'#f8fafc' }} />
                </tr>
              )}
            </>}
          </tbody>
        </table>
      </div>

      {editingCfg && (
        <EditModal config={editingCfg} bom={bom}
          onSave={(orig, nf) => {
            if (logChange && editingCfg) Object.keys(nf).forEach(k => { if (String(editingCfg[k]??'') !== String(nf[k]??'')) logChange(orig, k, editingCfg[k]??'', nf[k]??'') })
            setBuilds(prev => prev.map(b => b.Config !== orig ? b : { ...b, ...nf }))
            setEditingCfg(null)
          }}
          onClose={() => setEditingCfg(null)} />
      )}
    </div>
  )
}

// ── Configs flat table ────────────────────────────────────────────────────────
const FLAT_COLS_BASE = [
  { key: 'Stage',      label: 'Stage',      width: 130, type: 'stage' },
  { key: 'Config',     label: 'Config',     width: 150, type: 'text' },
  { key: 'Type',       label: 'Type',       width: 90,  type: 'select', options: TYPES },
  { key: 'Quantity',   label: 'Qty',        width: 80,  type: 'number' },
  { key: 'Status',     label: 'Status',     width: 120, type: 'select', options: ['Not Started','On-going','Completed'] },
  { key: 'Build Date', label: 'Build Date', width: 120, type: 'date' },
  ...CONFIG_DETAIL_FIELDS.map(f => ({ key: f.key, label: f.label, width: 120, type: 'text' })),
]

function ConfigsView({ builds, setBuilds, bom, stages = [], logChange }) {
  const [editingConfig, setEditingConfig] = useState(null)
  const [editingCell,   setEditingCell]   = useState(null)
  const [draft,         setDraft]         = useState('')
  const [colFilter,     setColFilter]     = useState({})

  const FLAT_COLS = FLAT_COLS_BASE.map(c =>
    c.key === 'Stage' ? { ...c, options: ['', ...stages] } : c
  )

  function saveCell(configName, col, value) {
    const oldVal = filtered.find(b => b.Config === configName)?.[col.key] ?? ''
    if (logChange) logChange(configName, col.key, oldVal, value)
    setBuilds(prev => prev.map(b => b.Config !== configName ? b : { ...b, [col.key]: col.type === 'number' ? (Number(value) || 0) : value }))
    setEditingCell(null)
  }

  const filtered = builds.filter(b => Object.entries(colFilter).every(([k, v]) => !v || String(b[k] ?? '').toLowerCase().includes(v.toLowerCase())))

  return (
    <div className="bm-configs-view">
      <div className="bm-flat-scroll">
        <table className="bm-flat-table">
          <thead>
            <tr>{FLAT_COLS.map(col => <th key={col.key} style={{ minWidth: col.width }}>{col.label}</th>)}<th style={{ width: 72 }}>Actions</th></tr>
            <tr className="bm-filter-row">
              {FLAT_COLS.map(col => <td key={col.key}><input className="bm-col-filter" placeholder="Filter…" value={colFilter[col.key] ?? ''} onChange={e => setColFilter(p => ({ ...p, [col.key]: e.target.value }))} /></td>)}
              <td>{Object.values(colFilter).some(Boolean) && <button className="bm-clear-filter" onClick={() => setColFilter({})}>Clear</button>}</td>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={FLAT_COLS.length + 1} className="bm-empty-row">{builds.length === 0 ? 'No configs — add one or upload a file.' : 'No configs match the filters.'}</td></tr>
            ) : filtered.map(c => (
              <tr key={c.Config}>
                {FLAT_COLS.map(col => {
                  const isEditing = editingCell?.configName === c.Config && editingCell?.key === col.key
                  const value = c[col.key] ?? ''
                  const colors = typeColor(c.Type)
                  return (
                    <td key={col.key} className="bm-flat-cell"
                      onClick={() => !isEditing && (setEditingCell({ configName: c.Config, key: col.key }), setDraft(String(value)))}>
                      {isEditing ? (
                        (col.type === 'select' || col.type === 'stage') ? (
                          <select className="bm-inline-select" value={draft} autoFocus
                            onChange={e => setDraft(e.target.value)}
                            onBlur={() => saveCell(c.Config, col, draft)}
                            onKeyDown={e => e.key === 'Escape' && setEditingCell(null)}>
                            {col.options.map(o => <option key={o} value={o}>{o || '— unassigned —'}</option>)}
                          </select>
                        ) : (
                          <input className="bm-inline-input" type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                            value={draft} autoFocus
                            onChange={e => setDraft(e.target.value)}
                            onBlur={() => saveCell(c.Config, col, draft)}
                            onKeyDown={e => { if (e.key === 'Enter') saveCell(c.Config, col, draft); if (e.key === 'Escape') setEditingCell(null) }} />
                        )
                      ) : col.key === 'Stage' ? (
                        <span className={value ? 'bm-stage-chip' : 'tm-na-dash'}>{value || '—'}</span>
                      ) : col.key === 'Type' ? (
                        <span className="bm-type-chip" style={{ background: colors.header, color: colors.text }}>{value}</span>
                      ) : col.key === 'Status' ? (
                        <span className={`status-badge status-${(value||'not-started').toLowerCase().replace(/\s+/g,'-')}`}>{value||'Not Started'}</span>
                      ) : (
                        <span className={value ? '' : 'tm-na-dash'}>{value || (col.type === 'number' ? '0' : '—')}</span>
                      )}
                    </td>
                  )
                })}
                <td className="bm-flat-actions">
                  <button className="bm-hdr-btn" onClick={() => setEditingConfig(c)}>✎</button>
                  <button className="bm-hdr-btn bm-hdr-del" onClick={() => { if (window.confirm(`Remove ${c.Config}?`)) setBuilds(prev => prev.filter(b => b.Config !== c.Config)) }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot><tr className="bm-flat-footer"><td><strong>Total</strong></td><td></td><td style={{ textAlign: 'right', fontWeight: 700 }}>{filtered.reduce((s, b) => s + (Number(b.Quantity)||0), 0).toLocaleString()}</td><td colSpan={FLAT_COLS.length - 2}></td><td></td></tr></tfoot>
          )}
        </table>
      </div>
      {editingConfig && (
        <EditModal config={editingConfig} bom={bom}
          onSave={(orig, nf) => {
            if (logChange && editingConfig) {
              Object.keys(nf).forEach(k => {
                if (String(editingConfig[k] ?? '') !== String(nf[k] ?? '')) {
                  logChange(orig, k, editingConfig[k] ?? '', nf[k] ?? '')
                }
              })
            }
            setBuilds(prev => prev.map(b => b.Config !== orig ? b : { ...b, ...nf }))
            setEditingConfig(null)
          }}
          onClose={() => setEditingConfig(null)} />
      )}
    </div>
  )
}

// ── BOM Upload + Search view ──────────────────────────────────────────────────
const BOM_COLS = [
  { key: 'category',           label: 'Category',         width: 90  },
  { key: 'kpn',                label: 'KPN',              width: 110, mono: true },
  { key: 'lab126pn',           label: 'Lab126 PN',        width: 110, mono: true },
  { key: 'description',        label: 'Description',      width: 200 },
  { key: 'rev',                label: 'Rev',              width: 70  },
  { key: 'supplier',           label: 'MFR',              width: 160 },
  { key: 'mpn',                label: 'MPN',              width: 160 },
  { key: 'qtyPerUnit',         label: 'QTY Per Device',   width: 90,  num: true },
  { key: 'materialQtyOrdered', label: 'Material Drive',   width: 110, num: true },
  { key: 'unitCost',           label: 'Unit Cost',        width: 85,  num: true, currency: true },
]

const BOM_KEY_MAP = {
  'part_id':'lab126pn','part id':'lab126pn','part':'lab126pn','id':'lab126pn',
  'kpn':'kpn','key pn':'kpn','key part number':'kpn',
  'lab126 pn':'lab126pn','lab126pn':'lab126pn','lab126':'lab126pn',
  'description':'description','desc':'description',
  'category':'category','cat':'category',
  'board':'appliesTo','applies_to':'appliesTo','module':'appliesTo',
  'supplier':'supplier','mfr':'supplier','manufacturer':'supplier','pcb supplier':'supplier',
  'mpn':'mpn','mfr pn':'mpn','manufacturer part number':'mpn','mfr part':'mpn',
  'qty_per_unit':'qtyPerUnit','qty/unit':'qtyPerUnit','qty per unit':'qtyPerUnit','qty per device':'qtyPerUnit',
  'material_qty_ordered':'materialQtyOrdered','material qty ordered':'materialQtyOrdered',
  'material drive':'materialQtyOrdered','qty ordered':'materialQtyOrdered',
  'material drive / notes':'materialQtyOrdered','material drive/notes':'materialQtyOrdered',
  'unit_cost':'unitCost','unit cost':'unitCost','cost':'unitCost',
}

function BOMView({ bom, setBom }) {
  const [search,      setSearch]      = useState('')
  const [filterBoard, setFilterBoard] = useState('all')
  const [filterCat,   setFilterCat]   = useState('all')
  const [importMsg,   setImportMsg]   = useState(null)
  const [editCell,    setEditCell]    = useState(null)
  const [draft,       setDraft]       = useState('')
  const [addingRow,   setAddingRow]   = useState(false)
  const [newPart,     setNewPart]     = useState({})

  const boards   = useMemo(() => ['all', ...new Set(bom.map(p => p.appliesTo).filter(Boolean))], [bom])
  const cats     = useMemo(() => ['all', ...new Set(bom.map(p => p.category).filter(Boolean))],  [bom])
  const filtered = useMemo(() => bom.filter(p =>
    (filterBoard === 'all' || p.appliesTo === filterBoard) &&
    (filterCat   === 'all' || p.category  === filterCat) &&
    (!search || BOM_COLS.some(c => String(p[c.key] ?? '').toLowerCase().includes(search.toLowerCase())))
  ), [bom, search, filterBoard, filterCat])

  function saveCell(partId, key, value) {
    setBom(prev => prev.map(p => p.id !== partId ? p : { ...p, [key]: (key === 'qtyPerUnit' || key === 'unitCost' || key === 'materialQtyOrdered') ? (Number(value) || 0) : value }))
    setEditCell(null)
  }

  function deletePart(partId) {
    if (window.confirm('Remove this part?')) setBom(prev => prev.filter(p => p.id !== partId))
  }

  function addPart() {
    if (!newPart.description && !newPart.id) return
    setBom(prev => [...prev, { id: crypto.randomUUID(), qtyPerUnit: 1, ...newPart }])
    setNewPart({})
    setAddingRow(false)
  }

  function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const { data } = Papa.parse(evt.target.result.trim(), { header: true, skipEmptyLines: true })
        const parts = data.map(row => {
          const out = {}
          Object.entries(row).forEach(([k, v]) => {
            const c = BOM_KEY_MAP[k.trim().toLowerCase()]
            if (c) out[c] = (c === 'qtyPerUnit' || c === 'unitCost' || c === 'materialQtyOrdered') ? (Number(v)||0) : String(v).trim()
          })
          if (!out.id) out.id = crypto.randomUUID()
          return out
        }).filter(p => p.description || p.appliesTo)
        if (!parts.length) { setImportMsg({ ok: false, text: 'No parts found. Supported columns: id/kpn, description, category, board, supplier/mfr, mpn, qty_per_unit, material_qty_ordered, unit_cost' }); return }
        const replace = bom.length > 0 && window.confirm(`Replace all ${bom.length} existing parts?\nOK = Replace, Cancel = Add`)
        setBom(replace ? parts : prev => { const ids = new Set(prev.map(p => p.id)); return [...prev, ...parts.filter(p => !ids.has(p.id))] })
        setImportMsg({ ok: true, text: `${replace ? 'Replaced' : 'Added'} ${parts.length} parts` })
      } catch (err) { setImportMsg({ ok: false, text: `Error: ${err.message}` }) }
      setTimeout(() => setImportMsg(null), 6000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const NCOLS = BOM_COLS.length + 1

  return (
    <div className="bm-bom-view">
      <div className="bm-bom-toolbar">
        <input className="bm-search-input" placeholder="Search any field…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>{boards.map(b => <option key={b} value={b}>{b === 'all' ? 'All Boards' : b}</option>)}</select>
        <select className="filter-select" value={filterCat}   onChange={e => setFilterCat(e.target.value)}>{cats.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}</select>
        <span className="bm-bom-count">{filtered.length} / {bom.length} parts</span>
        <button className="btn-export" onClick={() => setAddingRow(v => !v)}>+ Add Part</button>
        <label className="bm-csv-upload-btn">⬆ Upload CSV<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleUpload} /></label>
        {bom.length > 0 && <button className="bm-clear-btn" onClick={() => { if (window.confirm(`Clear all ${bom.length} BOM parts?`)) setBom([]) }}>🗑 Clear BOM</button>}
      </div>
      {importMsg && <div className={`bm-import-msg ${importMsg.ok ? 'bm-import-ok' : 'bm-import-warn'}`}><strong>{importMsg.text}</strong></div>}
      <div className="bm-flat-scroll">
        <table className="bm-flat-table">
          <thead>
            <tr>
              {BOM_COLS.map(c => <th key={c.key} style={{ minWidth: c.width, textAlign: c.num ? 'right' : 'left' }}>{c.label}</th>)}
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {addingRow && (
              <tr className="inv-add-row">
                {BOM_COLS.map(c => (
                  <td key={c.key}>
                    <input className="bm-inline-input" style={{ width: c.width - 8 }}
                      type={c.num ? 'number' : 'text'} placeholder={c.label}
                      value={newPart[c.key] ?? ''}
                      onChange={e => setNewPart(p => ({ ...p, [c.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addPart(); if (e.key === 'Escape') setAddingRow(false) }} />
                  </td>
                ))}
                <td><div className="inv-row-actions">
                  <button className="inv-save-btn" onClick={addPart}>✓</button>
                  <button className="inv-cancel-btn" onClick={() => { setAddingRow(false); setNewPart({}) }}>×</button>
                </div></td>
              </tr>
            )}
            {filtered.length === 0 && !addingRow ? (
              <tr><td colSpan={NCOLS} className="bm-empty-row">{bom.length === 0 ? 'No BOM parts — upload a CSV or click "+ Add Part".' : 'No parts match.'}</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                {BOM_COLS.map(c => {
                  const isEditing = editCell?.id === p.id && editCell?.key === c.key
                  const val = p[c.key] ?? ''
                  return (
                    <td key={c.key} className="bm-flat-cell bm-editable-cell"
                      style={{ textAlign: c.num ? 'right' : 'left' }}
                      onClick={() => !isEditing && (setEditCell({ id: p.id, key: c.key }), setDraft(String(val)))}>
                      {isEditing ? (
                        <input className="bm-inline-input" autoFocus
                          type={c.num ? 'number' : 'text'} value={draft}
                          style={{ width: c.width - 8, textAlign: c.num ? 'right' : 'left' }}
                          onChange={e => setDraft(e.target.value)}
                          onBlur={() => saveCell(p.id, c.key, draft)}
                          onKeyDown={e => { if (e.key === 'Enter') saveCell(p.id, c.key, draft); if (e.key === 'Escape') setEditCell(null) }} />
                      ) : c.key === 'category' ? (
                        <span className={`type-badge cat-${(val).toLowerCase()}`}>{val || '—'}</span>
                      ) : c.currency ? (
                        <span className={val ? '' : 'tm-na-dash'}>{val ? `$${Number(val).toFixed(2)}` : '—'}</span>
                      ) : (
                        <span className={val ? '' : 'tm-na-dash'} style={{ fontFamily: c.mono ? 'monospace' : undefined, fontSize: c.mono ? 11 : undefined }}>{val || '—'}</span>
                      )}
                    </td>
                  )
                })}
                <td>
                  <button className="bm-hdr-btn bm-hdr-del" onClick={() => deletePart(p.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Build Detail (shown after "Edit Builds") ──────────────────────────────────
function BuildDetail({ builds, setBuilds, bom, setBom, alerts, budget, setBudget, allocations, setAllocations, projects, activeProjectId, setActiveProjectId, setProjects, selectedStage, onBack }) {
  const [subTab,      setSubTab]      = useState('current') // current | configs | bom | allocations
  const [topTab,      setTopTab]      = useState('buildMatrix') // drp | buildMatrix | allocations
  const [phase,       setPhase]       = useState('All')
  const [stageFilter, setStageFilter] = useState(selectedStage ?? 'All')
  const [showAddForm, setShowAddForm] = useState(false)
  const [importMsg,   setImportMsg]   = useState(null)
  const csvInputRef     = useRef(null)
  const configScrollRef = useRef(null)
  const bomScrollRef    = useRef(null)

  function handleConfigScroll(e) {
    if (bomScrollRef.current) bomScrollRef.current.scrollLeft = e.target.scrollLeft
  }
  function handleBomScroll(e) {
    if (configScrollRef.current) configScrollRef.current.scrollLeft = e.target.scrollLeft
  }

  const [customRows, setCustomRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bm-custom-rows')) || [] } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('bm-custom-rows', JSON.stringify(customRows)) }, [customRows])

  const [bmCurrentUser, setBmCurrentUser] = useState(() => localStorage.getItem('bm-current-user-name') || 'devicetracker53@gmail.com')
  const [editingUserName, setEditingUserName] = useState(false)
  const [userNameDraft, setUserNameDraft] = useState('')
  const [changeLog, setChangeLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bm-change-log')) || [] } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('bm-current-user-name', bmCurrentUser) }, [bmCurrentUser])
  useEffect(() => { localStorage.setItem('bm-change-log', JSON.stringify(changeLog)) }, [changeLog])

  const activeProject  = projects.find(p => p.id === activeProjectId) ?? projects[0]
  const projectStages  = activeProject?.stages ?? DEFAULT_STAGES
  const [renamingProject, setRenamingProject] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(activeProject?.name ?? '')

  function logChange(configName, field, oldVal, newVal) {
    if (String(oldVal ?? '') === String(newVal ?? '')) return
    setChangeLog(prev => [{
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      changedBy: bmCurrentUser || '—',
      config: configName,
      field,
      from: String(oldVal ?? ''),
      to: String(newVal ?? ''),
    }, ...prev.slice(0, 499)])
  }

  function saveProjectName() {
    if (projectNameDraft.trim()) {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, name: projectNameDraft.trim() } : p))
    }
    setRenamingProject(false)
  }
  // #1 — filter by stage first, then by board phase
  const stageBuilds = (stageFilter && stageFilter !== 'All')
    ? builds.filter(b => (b.Stage ?? '') === stageFilter)
    : builds
  const phaseBuilds = phase === 'All' ? stageBuilds : stageBuilds.filter(b => boardOf(b.Config) === phase)
  const totalQty    = stageBuilds.reduce((s, b) => s + (Number(b.Quantity)||0), 0)
  const alertCount  = alerts.length
  const hasDanger   = alerts.some(a => a.type === 'danger')

  function addConfig(nb) {
    const withStage = stageFilter !== 'All' ? { ...nb, Stage: stageFilter } : nb
    setBuilds(prev => [...prev, withStage])
    setShowAddForm(false)
  }

  function handleCSVImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const isXLSX = /\.(xlsx|xls|xlsm)$/i.test(file.name)
    const replace = builds.length > 0 && window.confirm('Replace all existing configs?\n\nOK = Replace\nCancel = Add to existing')
    const reader = new FileReader()
    reader.onload = evt => {
      const existing = replace ? [] : builds.map(b => b.Config)
      const { added, skipped, errors } = isXLSX ? parseBuildsXLSX(new Uint8Array(evt.target.result), existing) : parseBuildsCSV(evt.target.result, existing)
      if (added.length > 0) setBuilds(replace ? added : prev => [...prev, ...added])
      const parts = []
      if (replace && added.length) parts.push(`Replaced with ${added.length} configs`)
      else if (added.length) parts.push(`${added.length} added`)
      if (skipped.length) parts.push(`${skipped.length} skipped`)
      if (errors.length) parts.push(`${errors.length} error${errors.length > 1 ? 's' : ''}`)
      setImportMsg({ ok: added.length > 0, text: parts.join(' · ') || 'Nothing imported', detail: errors.slice(0,2).join('; ') })
      setTimeout(() => setImportMsg(null), 7000)
    }
    if (isXLSX) reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
    e.target.value = ''
  }

  const SUBTABS = [
    { id: 'current',   label: 'Current' },
    { id: 'configs',   label: 'Configs' },
    { id: 'bom',       label: 'BOM / Parts' },
    { id: 'changelog', label: `Change Log${changeLog.length ? ` (${changeLog.length})` : ''}` },
  ]

  return (
    <div className="bm-detail-root">

      {/* ── Top breadcrumb nav ─────────────────────────────────── */}
      <div className="bm-detail-topbar">
        <div className="bm-detail-topbar-left">
          <button className="bm-back-btn" onClick={onBack} title="Back to projects">←</button>
          <div className="bm-detail-breadcrumb">
            {renamingProject ? (
              <input className="bm-project-name-input" value={projectNameDraft} autoFocus
                onChange={e => setProjectNameDraft(e.target.value)}
                onBlur={saveProjectName}
                onKeyDown={e => { if (e.key === 'Enter') saveProjectName(); if (e.key === 'Escape') setRenamingProject(false) }} />
            ) : (
              <span className="bm-detail-project-name" onClick={() => { setRenamingProject(true); setProjectNameDraft(activeProject?.name ?? '') }}>
                {activeProject?.name ?? 'Project'}
                <span className="bm-detail-edit-hint"> ✎</span>
              </span>
            )}
            {stageFilter && stageFilter !== 'All' && (
              <span style={{ marginLeft: 10, padding: '2px 10px', borderRadius: 12, background: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
                {stageFilter}
              </span>
            )}
          </div>
        </div>
        <div className="bm-detail-topnav">
          <button className={`bm-topnav-btn ${topTab === 'drp' ? 'active' : ''}`} onClick={() => setTopTab('drp')}>DRP</button>
          <button className={`bm-topnav-btn ${topTab === 'buildMatrix' ? 'active' : ''}`} onClick={() => setTopTab('buildMatrix')}>Build Matrix</button>
          <button className={`bm-topnav-btn ${topTab === 'allocations' ? 'active' : ''}`} onClick={() => setTopTab('allocations')}>Allocations</button>
        </div>
        <div className="bm-detail-topbar-right">
          {alertCount > 0 && <span className={`bm-stat-chip bm-alert-chip ${hasDanger ? 'danger' : 'warn'}`}>{alertCount} alert{alertCount > 1 ? 's' : ''}</span>}
          <span className="bm-budget-row">Budget: <EditableCell value={budget} onChange={setBudget} min={0} prefix="$" decimals={0} /></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
            Editing as:&nbsp;
            {editingUserName ? (
              <input
                style={{ fontSize: 13, padding: '2px 6px', border: '1px solid #94a3b8', borderRadius: 4, width: 130 }}
                value={userNameDraft}
                autoFocus
                onChange={e => setUserNameDraft(e.target.value)}
                onBlur={() => { setBmCurrentUser(userNameDraft.trim()); setEditingUserName(false) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setBmCurrentUser(userNameDraft.trim()); setEditingUserName(false) }
                  if (e.key === 'Escape') setEditingUserName(false)
                }}
              />
            ) : (
              <span
                style={{ cursor: 'pointer', color: bmCurrentUser ? '#1e293b' : '#94a3b8', fontWeight: bmCurrentUser ? 600 : 400, padding: '2px 6px', borderRadius: 4, border: '1px dashed #cbd5e1' }}
                title="Click to set your name"
                onClick={() => { setUserNameDraft(bmCurrentUser); setEditingUserName(true) }}
              >
                {bmCurrentUser || 'Set your name ✎'}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── Allocations top tab ────────────────────────────────── */}
      {topTab === 'allocations' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <Allocation allocations={allocations} setAllocations={setAllocations} builds={builds} />
        </div>
      )}

      {/* ── DRP placeholder ───────────────────────────────────── */}
      {topTab === 'drp' && (
        <div style={{ padding: '40px 24px', color: '#94a3b8', textAlign: 'center' }}>
          <h2 style={{ color: '#1e293b' }}>DRP</h2>
          <p>Demand Requirements Planning — coming soon.</p>
        </div>
      )}

      {/* ── Build Matrix sub-tabs ─────────────────────────────── */}
      {topTab === 'buildMatrix' && (
      <div className="bm-bm-wrap">
        <div className="bm-subtab-bar">
          <div className="bm-subtabs">
            {SUBTABS.map(t => (
              <button key={t.id} className={`bm-subtab ${subTab === t.id ? 'active' : ''}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="bm-subtab-actions">
            {subTab !== 'current' && <button className="btn-export" onClick={() => setShowAddForm(v => !v)}>{showAddForm ? '✕ Cancel' : '+ Add Config'}</button>}
            <label className="bm-csv-upload-btn">⬆ Upload CSV / XLSX<input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv" style={{ display: 'none' }} onChange={handleCSVImport} /></label>
            {builds.length > 0 && <button className="bm-clear-btn" onClick={() => { if (window.confirm(`Remove all ${builds.length} configs?`)) { logChange('ALL CONFIGS', 'bulk clear', `${builds.length} config${builds.length !== 1 ? 's' : ''} removed`, '—'); setBuilds([]) } }}>🗑 Clear All</button>}
          </div>
        </div>

        {importMsg && (
          <div className={`bm-import-msg ${importMsg.ok ? 'bm-import-ok' : 'bm-import-warn'}`} style={{ flexShrink: 0 }}>
            <strong>{importMsg.text}</strong>
            {importMsg.detail && <span className="bm-import-detail"> — {importMsg.detail}</span>}
          </div>
        )}

        {showAddForm && (
          <div style={{ flexShrink: 0, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
            <AddConfigForm onAdd={addConfig} onCancel={() => setShowAddForm(false)} existingConfigs={builds.map(b => b.Config)} />
          </div>
        )}

        {subTab === 'current' && (
          <UnifiedCurrentView
            builds={phaseBuilds} setBuilds={setBuilds}
            bom={bom} setBom={setBom}
            alerts={alerts}
            allocations={allocations}
            logChange={logChange}
            stageLabel={stageFilter && stageFilter !== 'All' ? stageFilter : null}
            allBuilds={builds}
          />
        )}

        {subTab === 'configs' && (
          <ConfigsView builds={phaseBuilds} setBuilds={setBuilds} bom={bom} stages={projectStages} logChange={logChange} />
        )}

        {subTab === 'bom' && (
          <BOMView bom={bom} setBom={setBom ?? (() => {})} />
        )}

        {subTab === 'changelog' && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Change Log</span>
              {changeLog.length > 0 && (
                <button className="bm-clear-btn" onClick={() => { if (window.confirm('Clear all change history?')) setChangeLog([]) }}>🗑 Clear Log</button>
              )}
            </div>
            {changeLog.length === 0 ? (
              <div className="bm-empty" style={{ padding: '40px 20px' }}>
                No changes logged yet. Set your name in the top bar, then start editing configs.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 540 }}>
                {changeLog.map(entry => (
                  <div key={entry.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, background: '#ede9fe', color: '#6d28d9', fontSize: 12, fontWeight: 600 }}>
                        {entry.changedBy}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(entry.date).toLocaleString()}</span>
                    </div>
                    <div className="dt-import-result-details">
                      <div className="dt-import-detail-row">
                        <span className="dt-import-detail-icon">🔧</span>
                        <span><strong>Config:</strong> {entry.config}</span>
                      </div>
                      <div className="dt-import-detail-row">
                        <span className="dt-import-detail-icon">📋</span>
                        <span><strong>Field:</strong> {entry.field}</span>
                      </div>
                      <div className="dt-import-detail-row" style={{ color: '#ef4444' }}>
                        <span className="dt-import-detail-icon">↩</span>
                        <span><strong>From:</strong> {entry.from || '—'}</span>
                      </div>
                      <div className="dt-import-detail-row" style={{ color: '#16a34a' }}>
                        <span className="dt-import-detail-icon">↪</span>
                        <span><strong>To:</strong> {entry.to || '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// ── BuildMatrix main export ───────────────────────────────────────────────────
export default function BuildMatrix({ builds, setBuilds, bom, setBom, alerts, budget, setBudget, projects = [], setProjects, activeProjectId, setActiveProjectId, allocations = [], setAllocations }) {
  const [view,          setView]          = useState('landing')
  const [selectedStage, setSelectedStage] = useState(null)

  return view === 'landing' ? (
    <ProjectLanding
      projects={projects}
      setProjects={setProjects}
      builds={builds}
      alerts={alerts}
      activeProjectId={activeProjectId}
      setActiveProjectId={setActiveProjectId}
      onEditBuilds={stage => { setSelectedStage(stage); setView('detail') }}
    />
  ) : (
    <BuildDetail
      builds={builds} setBuilds={setBuilds}
      bom={bom} setBom={setBom}
      alerts={alerts}
      budget={budget} setBudget={setBudget}
      allocations={allocations} setAllocations={setAllocations}
      projects={projects} setProjects={setProjects}
      activeProjectId={activeProjectId} setActiveProjectId={setActiveProjectId}
      selectedStage={selectedStage}
      onBack={() => { setView('landing'); setSelectedStage(null) }}
    />
  )
}
