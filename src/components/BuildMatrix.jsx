import { useState, useMemo, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import EditableCell from './EditableCell'
import Allocation from './Allocation'
import { alertedConfigSet } from '../utils/alertEngine'
import { calcBOMCost } from '../utils/costEngine'

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES  = ['DIAG', 'COMP', 'LBU', 'POR', 'SAT', 'TEST', 'DOE', 'Golden']
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
          <div className="edit-field-row"><label>Type</label><select className="edit-field-select" value={fields.Type} onChange={e => set('Type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
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
        <div className="add-form-group"><label>Type</label><select value={type} onChange={e => setType(e.target.value)} className="filter-select">{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
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
function ConfigSummary({ builds, setBuilds, bom, alerts, allocations, customRows, setCustomRows }) {
  const [configSearch,  setConfigSearch]  = useState('')
  const [showDetails,   setShowDetails]   = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [editingCell,   setEditingCell]   = useState(null)
  const [draft,         setDraft]         = useState('')

  const filtered = builds.filter(b => b.Config.toLowerCase().includes(configSearch.toLowerCase()))

  const totalInput = builds.reduce((s, b) => s + (Number(b.Quantity) || 0), 0)
  const totalAlloc = allocations.reduce((s, a) => s + (a.rows || []).reduce((rs, r) => rs + (Number(r.qty) || 0), 0), 0)

  function saveCell(configName, field, value) {
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
          onSave={(orig, newF) => { setBuilds(prev => prev.map(b => b.Config !== orig ? b : { ...b, ...newF })); setEditingConfig(null) }}
          onClose={() => setEditingConfig(null)} />
      )}

      <div className="bm-summary-layout">
        {/* Totals */}
        <div className="bm-totals-panel">
          <div className="bm-totals-title">Totals</div>
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
            <div className="bm-table-scroll">
              <table className="bm-transposed-table">
                <thead>
                  <tr>
                    <th className="bm-field-col">Fields</th>
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
                      const cost  = calcBOMCost(board ? bom.filter(p => p.appliesTo === board) : [], c.Quantity)
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
function BOMPartsTable({ bom, builds }) {
  const [partSearch,   setPartSearch]   = useState('')
  const [filterBoard,  setFilterBoard]  = useState('all')
  const [filterCat,    setFilterCat]    = useState('all')

  const boards = useMemo(() => ['all', ...new Set(bom.map(p => p.appliesTo).filter(Boolean))], [bom])
  const cats   = useMemo(() => ['all', ...new Set(bom.map(p => p.category).filter(Boolean))], [bom])

  const filtered = useMemo(() => bom.filter(p =>
    (filterBoard === 'all' || p.appliesTo === filterBoard) &&
    (filterCat   === 'all' || p.category  === filterCat) &&
    (!partSearch || p.id?.toLowerCase().includes(partSearch.toLowerCase()) || p.description?.toLowerCase().includes(partSearch.toLowerCase()))
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

      <div className="bm-bom-parts-scroll">
        <table className="bm-flat-table">
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>#</th>
              <th style={{ minWidth: 130 }}>Part ID</th>
              <th style={{ minWidth: 220 }}>Description</th>
              <th style={{ minWidth: 90 }}>Category</th>
              <th style={{ minWidth: 80 }}>Board</th>
              <th style={{ minWidth: 60, textAlign: 'right' }}>Qty/U</th>
              {builds.map(c => {
                const col = typeColor(c.Type)
                return <th key={c.Config} style={{ minWidth: 90, textAlign: 'right', background: col.header, color: col.text }}>{c.Config}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6 + builds.length} className="bm-empty-row">No parts match your filters.</td></tr>
            ) : (
              filtered.map((part, idx) => (
                <tr key={part.id} className="bm-bom-part-row">
                  <td className="bm-flat-cell" style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{idx + 1}</td>
                  <td className="bm-flat-cell" style={{ fontFamily: 'monospace', fontSize: 12 }}>{part.id}</td>
                  <td className="bm-flat-cell">{part.description}</td>
                  <td className="bm-flat-cell"><span className={`type-badge cat-${(part.category ?? '').toLowerCase()}`}>{part.category}</span></td>
                  <td className="bm-flat-cell">{part.appliesTo}</td>
                  <td className="bm-flat-cell" style={{ textAlign: 'right' }}>{part.qtyPerUnit ?? 1}</td>
                  {builds.map(c => {
                    const board = boardOf(c.Config)
                    const match = board && board === part.appliesTo
                    const qty   = match ? (part.qtyPerUnit || 1) * c.Quantity : null
                    return (
                      <td key={c.Config} className={`bm-flat-cell ${match ? 'bm-cell-num' : 'tm-na'}`} style={{ textAlign: 'right' }}>
                        {qty != null ? qty.toLocaleString() : <span className="tm-na-dash">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && builds.length > 0 && (
            <tfoot>
              <tr className="bm-flat-footer">
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>Total per config</td>
                {builds.map(c => {
                  const board = boardOf(c.Config)
                  const total = filtered
                    .filter(p => board && p.appliesTo === board)
                    .reduce((s, p) => s + (p.qtyPerUnit || 1) * c.Quantity, 0)
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

function ConfigsView({ builds, setBuilds, bom, stages = [] }) {
  const [editingConfig, setEditingConfig] = useState(null)
  const [editingCell,   setEditingCell]   = useState(null)
  const [draft,         setDraft]         = useState('')
  const [colFilter,     setColFilter]     = useState({})

  const FLAT_COLS = FLAT_COLS_BASE.map(c =>
    c.key === 'Stage' ? { ...c, options: ['', ...stages] } : c
  )

  function saveCell(configName, col, value) {
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
          onSave={(orig, nf) => { setBuilds(prev => prev.map(b => b.Config !== orig ? b : { ...b, ...nf })); setEditingConfig(null) }}
          onClose={() => setEditingConfig(null)} />
      )}
    </div>
  )
}

// ── BOM Upload + Search view ──────────────────────────────────────────────────
function BOMView({ bom, setBom }) {
  const [search, setSearch] = useState('')
  const [filterBoard, setFilterBoard] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const [importMsg, setImportMsg] = useState(null)

  const boards = useMemo(() => ['all', ...new Set(bom.map(p => p.appliesTo).filter(Boolean))], [bom])
  const cats   = useMemo(() => ['all', ...new Set(bom.map(p => p.category).filter(Boolean))], [bom])
  const filtered = useMemo(() => bom.filter(p =>
    (filterBoard === 'all' || p.appliesTo === filterBoard) &&
    (filterCat   === 'all' || p.category  === filterCat) &&
    (!search || p.id?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))
  ), [bom, search, filterBoard, filterCat])

  function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const { data } = Papa.parse(evt.target.result.trim(), { header: true, skipEmptyLines: true })
        const KEY_MAP = { 'part_id':'id','part id':'id','part':'id','id':'id','description':'description','desc':'description','category':'category','cat':'category','board':'appliesTo','applies_to':'appliesTo','module':'appliesTo','qty_per_unit':'qtyPerUnit','qty/unit':'qtyPerUnit','qty per unit':'qtyPerUnit','unit_cost':'unitCost','unit cost':'unitCost','cost':'unitCost' }
        const parts = data.map(row => {
          const out = {}
          Object.entries(row).forEach(([k, v]) => { const c = KEY_MAP[k.trim().toLowerCase()]; if (c) out[c] = c === 'qtyPerUnit' || c === 'unitCost' ? (Number(v)||0) : String(v).trim() })
          if (!out.id) out.id = crypto.randomUUID()
          return out
        }).filter(p => p.description || p.appliesTo)
        if (!parts.length) { setImportMsg({ ok: false, text: 'No parts found — check columns: id, description, category, board, qty_per_unit, unit_cost' }); return }
        const replace = bom.length > 0 && window.confirm(`Replace all ${bom.length} existing parts?\nOK = Replace, Cancel = Add`)
        setBom(replace ? parts : prev => { const ids = new Set(prev.map(p => p.id)); return [...prev, ...parts.filter(p => !ids.has(p.id))] })
        setImportMsg({ ok: true, text: `${replace ? 'Replaced' : 'Added'} ${parts.length} parts` })
      } catch (err) { setImportMsg({ ok: false, text: `Error: ${err.message}` }) }
      setTimeout(() => setImportMsg(null), 6000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="bm-bom-view">
      <div className="bm-bom-toolbar">
        <input className="bm-search-input" placeholder="Search part ID or description…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>{boards.map(b => <option key={b} value={b}>{b === 'all' ? 'All Boards' : b}</option>)}</select>
        <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>{cats.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}</select>
        <span className="bm-bom-count">{filtered.length} / {bom.length} parts</span>
        <label className="bm-csv-upload-btn">⬆ Upload BOM CSV<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleUpload} /></label>
        {bom.length > 0 && <button className="bm-clear-btn" onClick={() => { if (window.confirm(`Clear all ${bom.length} BOM parts?`)) setBom([]) }}>🗑 Clear BOM</button>}
      </div>
      {importMsg && <div className={`bm-import-msg ${importMsg.ok ? 'bm-import-ok' : 'bm-import-warn'}`}><strong>{importMsg.text}</strong></div>}
      <p className="bm-bom-hint">CSV columns: <code>id</code>, <code>description</code>, <code>category</code>, <code>board</code>, <code>qty_per_unit</code>, <code>unit_cost</code>. BOM parts also editable in the <strong>Cost BOM</strong> nav tab.</p>
      <div className="bm-flat-scroll">
        <table className="bm-flat-table">
          <thead><tr><th style={{ minWidth: 130 }}>Part ID</th><th style={{ minWidth: 200 }}>Description</th><th style={{ minWidth: 100 }}>Category</th><th style={{ minWidth: 80 }}>Board</th><th style={{ minWidth: 80, textAlign:'right' }}>Qty/Unit</th><th style={{ minWidth: 90, textAlign:'right' }}>Unit Cost</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="bm-empty-row">{bom.length === 0 ? 'No BOM parts — upload a CSV above.' : 'No parts match your search.'}</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td className="bm-flat-cell" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id}</td>
                <td className="bm-flat-cell">{p.description}</td>
                <td className="bm-flat-cell"><span className={`type-badge cat-${(p.category ?? '').toLowerCase()}`}>{p.category}</span></td>
                <td className="bm-flat-cell">{p.appliesTo}</td>
                <td className="bm-flat-cell" style={{ textAlign:'right' }}>{p.qtyPerUnit ?? 1}</td>
                <td className="bm-flat-cell" style={{ textAlign:'right' }}>{p.unitCost != null ? `$${Number(p.unitCost).toFixed(2)}` : '—'}</td>
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
  const csvInputRef = useRef(null)

  const [customRows, setCustomRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bm-custom-rows')) || [] } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('bm-custom-rows', JSON.stringify(customRows)) }, [customRows])

  const activeProject  = projects.find(p => p.id === activeProjectId) ?? projects[0]
  const projectStages  = activeProject?.stages ?? DEFAULT_STAGES
  const [renamingProject, setRenamingProject] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(activeProject?.name ?? '')

  function saveProjectName() {
    if (projectNameDraft.trim()) {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, name: projectNameDraft.trim() } : p))
    }
    setRenamingProject(false)
  }
  const phaseBuilds   = (phase === 'All' ? builds : builds.filter(b => boardOf(b.Config) === phase))
    .filter(b => stageFilter === 'All' || (b.Stage ?? '') === stageFilter)
  const totalQty    = builds.reduce((s, b) => s + (Number(b.Quantity)||0), 0)
  const alertCount  = alerts.length
  const hasDanger   = alerts.some(a => a.type === 'danger')

  function addConfig(nb) { setBuilds(prev => [...prev, nb]); setShowAddForm(false) }

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
    { id: 'current',     label: 'Current' },
    { id: 'configs',     label: 'Configs' },
    { id: 'bom',         label: 'BOM / Parts' },
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
      {topTab === 'buildMatrix' && (<>
        {/* Stage filter tabs */}
        <div className="bm-stage-filter-bar">
          <button className={`bm-stage-filter-btn ${stageFilter === 'All' ? 'active' : ''}`} onClick={() => setStageFilter('All')}>All</button>
          {projectStages.map(s => (
            <button key={s} className={`bm-stage-filter-btn ${stageFilter === s ? 'active' : ''}`} onClick={() => setStageFilter(s)}>{s}</button>
          ))}
        </div>
        <div className="bm-subtab-bar">
          <div className="bm-subtabs">
            {SUBTABS.map(t => (
              <button key={t.id} className={`bm-subtab ${subTab === t.id ? 'active' : ''}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="bm-subtab-actions">
            <button className="btn-export" onClick={() => setShowAddForm(v => !v)}>{showAddForm ? '✕ Cancel' : '+ Add Config'}</button>
            <label className="bm-csv-upload-btn">⬆ Upload CSV / XLSX<input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv" style={{ display: 'none' }} onChange={handleCSVImport} /></label>
            {builds.length > 0 && <button className="bm-clear-btn" onClick={() => { if (window.confirm(`Remove all ${builds.length} configs?`)) setBuilds([]) }}>🗑 Clear All</button>}
          </div>
        </div>

        {importMsg && (
          <div className={`bm-import-msg ${importMsg.ok ? 'bm-import-ok' : 'bm-import-warn'}`}>
            <strong>{importMsg.text}</strong>
            {importMsg.detail && <span className="bm-import-detail"> — {importMsg.detail}</span>}
          </div>
        )}

        {showAddForm && (
          <div style={{ padding: '0 0 12px' }}>
            <AddConfigForm onAdd={addConfig} onCancel={() => setShowAddForm(false)} existingConfigs={builds.map(b => b.Config)} />
          </div>
        )}

        {subTab === 'current' && (
          <div className="bm-current-tab">
            <ConfigSummary builds={phaseBuilds} setBuilds={setBuilds} bom={bom} alerts={alerts} allocations={allocations} customRows={customRows} setCustomRows={setCustomRows} />
            <BOMPartsTable bom={bom} builds={phaseBuilds} />
          </div>
        )}

        {subTab === 'configs' && (
          <ConfigsView builds={phaseBuilds} setBuilds={setBuilds} bom={bom} stages={projectStages} />
        )}

        {subTab === 'bom' && (
          <BOMView bom={bom} setBom={setBom ?? (() => {})} />
        )}
      </>)}
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
