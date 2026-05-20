import { useState, useMemo, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import EditableCell from './EditableCell'
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

// ── Transposed parser (Numbers export: configs are columns, fields are rows) ──
function parseTransposedCSV(rows, existingConfigs) {
  let configNames = []
  let configCols  = []

  for (const row of rows) {
    const idx = row.findIndex(c => /^config(s|.*name)?$/i.test(String(c).trim()))
    if (idx !== -1) {
      for (let ci = idx + 1; ci < row.length; ci++) {
        const name = String(row[ci]).trim().toUpperCase()
        if (!name || /^[A-Z]\s*=/.test(name)) break
        if (/^[A-Z0-9][A-Z0-9\-_]+$/.test(name)) {
          configNames.push(name)
          configCols.push(ci)
        }
      }
      if (configNames.length) break
    }
  }
  if (!configNames.length) return null

  const qtys    = new Array(configNames.length).fill(0)
  const types   = new Array(configNames.length).fill('POR')
  const dates   = new Array(configNames.length).fill('')
  const details = configNames.map(() => ({}))

  for (const row of rows) {
    const cells     = row.map(c => String(c ?? '').trim())
    const labelCell = cells.slice(0, configCols[0]).find(c => c !== '') ?? ''
    const labelLower = labelCell.toLowerCase()

    const hasMaterialDrive = cells.some(c => c.toLowerCase().includes('material drive'))
    const hasBalance       = cells.some(c => c.toLowerCase() === 'balance')
    if (hasMaterialDrive || hasBalance) {
      configCols.forEach((ci, i) => {
        const n = parseInt(cells[ci], 10)
        if (n > 0 && qtys[i] === 0) qtys[i] = n
      })
    }

    if (labelLower === 'purpose') {
      configCols.forEach((ci, i) => {
        types[i] = normalizeType(cells[ci])
        details[i].purpose = cells[ci]
      })
    }

    if (/build.?date/i.test(labelLower)) {
      configCols.forEach((ci, i) => {
        const m = cells[ci].match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/)
        if (m) dates[i] = normalizeDate(m[1])
      })
    }

    const fieldKey = DETAIL_LABEL_MAP[labelLower]
    if (fieldKey && fieldKey !== 'purpose') {
      configCols.forEach((ci, i) => {
        if (cells[ci] && !details[i][fieldKey]) details[i][fieldKey] = cells[ci]
      })
    }
  }

  const added = [], skipped = []
  configNames.forEach((name, i) => {
    if (!name) return
    if (existingConfigs.includes(name)) { skipped.push(name); return }
    added.push({
      Config:       name,
      Type:         types[i],
      Quantity:     qtys[i],
      Status:       'Not Started',
      'Build Date': dates[i],
      'SMT Modem': '✓', 'SMT Antenna': '✓', FATP: '✓',
      ...details[i],
    })
  })
  return { added, skipped, errors: [] }
}

// ── Standard row-per-config parser ────────────────────────────────────────────
const COL_MAP = {
  config: 'Config', 'config name': 'Config', name: 'Config',
  type: 'Type', status: 'Status',
  qty: 'Quantity', quantity: 'Quantity',
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
    headers.forEach((h, ci) => {
      const canon = COL_MAP[h]
      if (canon) mapped[canon] = String(row[ci] ?? '').trim()
    })

    const configName = (mapped['Config'] ?? '').trim().toUpperCase()
    if (!configName) { errors.push(`Row ${ri + 1}: no Config value`); return }
    if (existingConfigs.includes(configName)) { skipped.push(configName); return }

    added.push({
      Config:       configName,
      Type:         normalizeType(mapped['Type']),
      Status:       mapped['Status'] || 'Not Started',
      Quantity:     parseInt(mapped['Quantity'], 10) || 0,
      'Build Date': normalizeDate(mapped['Build Date']),
      'SMT Modem': '✓', 'SMT Antenna': '✓', FATP: '✓',
    })
  }
  return { added, skipped, errors }
}

function parseRows(rows, existingConfigs) {
  if (!rows || rows.length === 0) return { added: [], skipped: [], errors: [] }
  try {
    const transposed = parseTransposedCSV(rows, existingConfigs)
    if (transposed) return transposed
    return parseStandardCSV(rows, existingConfigs)
  } catch (e) {
    console.error('[BuildMatrix] parse error:', e)
    return { added: [], skipped: [], errors: [e.message] }
  }
}

function parseBuildsCSV(text, existingConfigs) {
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: false })
  return parseRows(data.map(r => r.map(c => String(c ?? ''))), existingConfigs)
}

function parseBuildsXLSX(buffer, existingConfigs) {
  let wb
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch (e) {
    return { added: [], skipped: [], errors: [`Could not read file: ${e.message}`] }
  }

  const allAdded = [], allSkipped = [], allErrors = []
  const seen = new Set(existingConfigs)

  console.log('[BuildMatrix] Sheets found:', wb.SheetNames)

  wb.SheetNames.forEach(sheetName => {
    try {
      const ws = wb.Sheets[sheetName]
      if (!ws) return

      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const rows = raw.map(r => (Array.isArray(r) ? r : []).map(c => String(c ?? '').trim()))

      console.log(`[BuildMatrix] Sheet "${sheetName}": ${rows.length} rows`)
      rows.slice(0, 20).forEach((r, i) => {
        const nonEmpty = r.filter(c => c !== '')
        if (nonEmpty.length) console.log(`  row ${i}:`, nonEmpty.slice(0, 10))
      })

      const result = parseRows(rows, [...seen])
      if (!result || !Array.isArray(result.added)) {
        console.warn(`  → no result for sheet "${sheetName}"`)
        return
      }

      console.log(`  → found ${result.added.length} configs:`, result.added.map(b => b.Config))

      result.added.forEach(b => {
        if (!seen.has(b.Config)) { seen.add(b.Config); allAdded.push(b) }
      })
      allSkipped.push(...(result.skipped || []))
      allErrors.push(...(result.errors || []).map(e => `[${sheetName}] ${e}`))
    } catch (err) {
      console.error(`[BuildMatrix] Error in sheet "${sheetName}":`, err)
      allErrors.push(`[${sheetName}] ${err.message}`)
    }
  })

  return { added: allAdded, skipped: allSkipped, errors: allErrors }
}

// ── BOM CSV parser ────────────────────────────────────────────────────────────
function parseBOMCSV(text) {
  const { data } = Papa.parse(text.trim(), { header: true, skipEmptyLines: true })
  const BOM_KEY_MAP = {
    'part_id': 'id', 'part id': 'id', 'part': 'id', 'id': 'id',
    'description': 'description', 'desc': 'description',
    'category': 'category', 'cat': 'category', 'type': 'category',
    'board': 'appliesTo', 'applies_to': 'appliesTo', 'appliesto': 'appliesTo', 'module': 'appliesTo',
    'qty_per_unit': 'qtyPerUnit', 'qty per unit': 'qtyPerUnit', 'qty/unit': 'qtyPerUnit', 'qty': 'qtyPerUnit',
    'unit_cost': 'unitCost', 'unit cost': 'unitCost', 'cost': 'unitCost', 'price': 'unitCost',
  }
  return data.map(row => {
    const out = { id: crypto.randomUUID() }
    Object.entries(row).forEach(([k, v]) => {
      const canon = BOM_KEY_MAP[k.trim().toLowerCase()]
      if (canon) out[canon] = canon === 'qtyPerUnit' || canon === 'unitCost' ? (Number(v) || 0) : String(v).trim()
    })
    if (!out.id || out.id === out.id) out.id = out.id  // keep randomUUID only if no part id found
    return out
  }).filter(p => p.description || p.appliesTo)
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ config, bom, onSave, onClose }) {
  const [fields, setFields] = useState({
    Config:       config.Config,
    Type:         config.Type        ?? 'POR',
    Status:       config.Status      ?? 'Not Started',
    Quantity:     config.Quantity    ?? 0,
    'Build Date': config['Build Date'] ?? '',
    costOverride: config.costOverride ?? '',
  })

  const board    = boardOf(config.Config)
  const calcCost = calcBOMCost(board ? bom.filter(p => p.appliesTo === board) : [], fields.Quantity)

  function set(field, value) {
    setFields(prev => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    const newName = fields.Config.trim().toUpperCase() || config.Config
    onSave(config.Config, {
      ...fields,
      Config:       newName,
      Quantity:     Number(fields.Quantity) || 0,
      costOverride: fields.costOverride === '' ? null : Number(fields.costOverride),
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-config-modal" onClick={e => e.stopPropagation()}>
        <div className="edit-config-header">
          <h3>Edit Config</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="edit-config-fields">
          <div className="edit-field-row">
            <label>Config Name</label>
            <input className="edit-field-input" value={fields.Config}
              onChange={e => set('Config', e.target.value.toUpperCase())} autoFocus />
          </div>
          <div className="edit-field-row">
            <label>Type</label>
            <select className="edit-field-select" value={fields.Type} onChange={e => set('Type', e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="edit-field-row">
            <label>Status</label>
            <select className="edit-field-select" value={fields.Status} onChange={e => set('Status', e.target.value)}>
              <option value="Not Started">Not Started</option>
              <option value="On-going">On-going</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div className="edit-field-row">
            <label>Quantity</label>
            <input className="edit-field-input" type="number" min={0} value={fields.Quantity}
              onChange={e => set('Quantity', e.target.value)} />
          </div>
          <div className="edit-field-row">
            <label>Build Date</label>
            <input className="edit-field-input" type="date" value={fields['Build Date']}
              onChange={e => set('Build Date', e.target.value)} />
          </div>
          <div className="edit-field-row">
            <label>BOM Cost Override</label>
            <input className="edit-field-input" type="number" min={0}
              placeholder={`Auto: $${Math.round(calcCost).toLocaleString()}`}
              value={fields.costOverride}
              onChange={e => set('costOverride', e.target.value)} />
          </div>
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
  const [useCustom,  setUseCustom]  = useState(false)
  const [board,      setBoard]      = useState(BOARDS[0])
  const [suffix,     setSuffix]     = useState('')
  const [customName, setCustomName] = useState('')
  const [type,       setType]       = useState('POR')
  const [status,     setStatus]     = useState('Not Started')
  const [quantity,   setQuantity]   = useState(0)
  const [buildDate,  setBuildDate]  = useState('')

  const configName = useCustom
    ? customName.trim().toUpperCase()
    : (suffix.trim() ? `${board}-${suffix.trim().toUpperCase()}` : '')
  const duplicate  = existingConfigs.includes(configName)
  const valid      = !!configName && !duplicate

  function handleAdd() {
    if (!valid) return
    onAdd({
      Config: configName, Type: type,
      'SMT Modem': '✓', 'SMT Antenna': '✓', FATP: '✓',
      Status: status, Quantity: quantity, 'Build Date': buildDate,
    })
    setSuffix(''); setCustomName(''); setQuantity(0); setBuildDate('')
  }

  return (
    <div className="add-config-form">
      <h3>New Configuration</h3>
      <div className="add-form-row">
        <div className="add-form-group" style={{ alignSelf: 'flex-end', marginBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} />
            Custom name
          </label>
        </div>
        {useCustom ? (
          <div className="add-form-group">
            <label>Config Name</label>
            <input type="text" placeholder="e.g. E2CMB-LBU1" value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              className="search-input" style={{ width: 180 }} autoFocus />
          </div>
        ) : (
          <>
            <div className="add-form-group">
              <label>Board</label>
              <select value={board} onChange={e => setBoard(e.target.value)} className="filter-select">
                {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="add-form-group">
              <label>Suffix</label>
              <input type="text" placeholder="e.g. DIAG4" value={suffix}
                onChange={e => setSuffix(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                className="search-input" style={{ width: 110 }} />
            </div>
          </>
        )}
        <div className="add-form-preview">
          <strong>{configName || '…'}</strong>
          {duplicate && <span className="form-error"> already exists</span>}
        </div>
        <div className="add-form-group">
          <label>Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className="filter-select">
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="add-form-group">
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="filter-select">
            <option value="Not Started">Not Started</option>
            <option value="On-going">On-going</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div className="add-form-group">
          <label>Qty</label>
          <input type="number" value={quantity} min={0}
            onChange={e => setQuantity(Number(e.target.value))}
            className="search-input" style={{ width: 80 }} />
        </div>
        <div className="add-form-group">
          <label>Build Date</label>
          <input type="date" value={buildDate}
            onChange={e => setBuildDate(e.target.value)}
            className="search-input" />
        </div>
        <div className="add-form-actions">
          <button onClick={handleAdd} className="btn-export" disabled={!valid}>Add</button>
          <button onClick={onCancel} className="btn-cancel">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Current View: STRATUS-style transposed matrix ─────────────────────────────
function CurrentView({ builds, setBuilds, bom, alerts, allocations, customRows, setCustomRows }) {
  const [configSearch,  setConfigSearch]  = useState('')
  const [showDetails,   setShowDetails]   = useState(true)
  const [showMaterials, setShowMaterials] = useState(true)
  const [editingConfig, setEditingConfig] = useState(null)
  const [editingCell,   setEditingCell]   = useState(null)
  const [draft,         setDraft]         = useState('')
  const [addingRow,     setAddingRow]     = useState(false)
  const [newRowLabel,   setNewRowLabel]   = useState('')

  const filtered = builds.filter(b =>
    b.Config.toLowerCase().includes(configSearch.toLowerCase())
  )

  const totalInput     = builds.reduce((s, b) => s + (Number(b.Quantity) || 0), 0)
  const totalAllocated = allocations.reduce((s, a) =>
    s + (a.rows || []).reduce((rs, r) => rs + (Number(r.qty) || 0), 0), 0)
  const completeCount  = builds.filter(b => b.Status === 'Completed').length
  const alertCount     = alerts.filter(a => filtered.some(c => c.Config === a.config)).length

  function saveCell(configName, field, value) {
    const isFixed = CONFIG_DETAIL_FIELDS.some(f => f.key === field)
    setBuilds(prev => prev.map(b => b.Config !== configName ? b : isFixed
      ? { ...b, [field]: value }
      : { ...b, customRows: { ...(b.customRows || {}), [field]: value } }
    ))
    setEditingCell(null)
  }

  function startEdit(configName, field, currentValue) {
    setEditingCell({ configName, field })
    setDraft(String(currentValue ?? ''))
  }

  function addCustomRow() {
    if (!newRowLabel.trim()) return
    setCustomRows(prev => [...prev, { id: crypto.randomUUID(), label: newRowLabel.trim() }])
    setNewRowLabel('')
    setAddingRow(false)
  }

  function CellEditor({ configName, field, isFixed }) {
    const isEditing = editingCell?.configName === configName && editingCell?.field === field
    const config    = filtered.find(c => c.Config === configName)
    const value     = isFixed ? (config?.[field] ?? '') : (config?.customRows?.[field] ?? '')
    return (
      <td className="bm-cell bm-editable-cell"
        onClick={() => !isEditing && startEdit(configName, field, value)}>
        {isEditing ? (
          <input className="bm-inline-input" value={draft} autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={() => saveCell(configName, field, draft)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveCell(configName, field, draft)
              if (e.key === 'Escape') setEditingCell(null)
            }} />
        ) : (
          <span className={value ? '' : 'tm-na-dash'}>{value || '—'}</span>
        )}
      </td>
    )
  }

  return (
    <div className="bm-current-view">
      {editingConfig && (
        <EditModal config={editingConfig} bom={bom}
          onSave={(origName, newFields) => {
            setBuilds(prev => prev.map(b => b.Config !== origName ? b : { ...b, ...newFields }))
            setEditingConfig(null)
          }}
          onClose={() => setEditingConfig(null)} />
      )}

      <div className="bm-current-layout">
        {/* Left totals panel */}
        <div className="bm-totals-panel">
          <div className="bm-totals-title">Totals</div>
          <div className="bm-total-item">
            <span>Total Input</span>
            <strong>{totalInput.toLocaleString()}</strong>
          </div>
          <div className="bm-total-item">
            <span>Allocated</span>
            <strong>{totalAllocated.toLocaleString()}</strong>
          </div>
          <div className="bm-total-item">
            <span>Remaining</span>
            <strong style={{ color: totalInput - totalAllocated < 0 ? '#ef4444' : '#22c55e' }}>
              {(totalInput - totalAllocated).toLocaleString()}
            </strong>
          </div>
          <div className="bm-total-divider" />
          <div className="bm-total-item">
            <span>Configs</span>
            <strong>{builds.length}</strong>
          </div>
          <div className="bm-total-item">
            <span>Completed</span>
            <strong>{completeCount}</strong>
          </div>
          <div className="bm-total-item">
            <span>Pending</span>
            <strong>{builds.length - completeCount}</strong>
          </div>
          {alertCount > 0 && (
            <>
              <div className="bm-total-divider" />
              <div className="bm-total-item bm-total-alerts">
                <span>Alerts</span>
                <strong>{alertCount}</strong>
              </div>
            </>
          )}
        </div>

        {/* Transposed table */}
        <div className="bm-matrix-wrap">
          <div className="bm-matrix-toolbar">
            <input className="bm-config-search" placeholder="Filter configs…"
              value={configSearch} onChange={e => setConfigSearch(e.target.value)} />
            <span className="bm-matrix-count">{filtered.length} config{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="bm-empty">
              {builds.length === 0
                ? 'No configs yet — upload a file or use "+ Add Config" above.'
                : 'No configs match the filter.'}
            </div>
          ) : (
            <div className="bm-table-scroll">
              <table className="bm-transposed-table">
                <thead>
                  <tr>
                    <th className="bm-field-col">Fields</th>
                    {filtered.map(c => {
                      const colors   = typeColor(c.Type)
                      const rowAlerts = alerts.filter(a => a.config === c.Config)
                      const hasDanger = rowAlerts.some(a => a.type === 'danger')
                      return (
                        <th key={c.Config} className="bm-config-col"
                          style={{ background: hasDanger ? '#fee2e2' : colors.header }}>
                          <div className="bm-config-header-inner">
                            <span className="bm-config-name" style={{ color: hasDanger ? '#b91c1c' : colors.text }}>
                              {c.Config}
                            </span>
                            <div className="bm-config-header-actions">
                              <button className="bm-hdr-btn" onClick={() => setEditingConfig(c)} title="Edit">✎</button>
                              <button className="bm-hdr-btn bm-hdr-del"
                                onClick={() => { if (window.confirm(`Remove ${c.Config}?`)) setBuilds(prev => prev.filter(b => b.Config !== c.Config)) }}
                                title="Remove">✕</button>
                            </div>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>

                  {/* ── Build Info section ────────────────────────── */}
                  <tr className="bm-section-row">
                    <td colSpan={filtered.length + 1}>Build Info</td>
                  </tr>

                  <tr>
                    <td className="bm-row-label">Build Date</td>
                    {filtered.map(c => (
                      <td key={c.Config} className="bm-cell">{c['Build Date'] || '—'}</td>
                    ))}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Type</td>
                    {filtered.map(c => {
                      const colors = typeColor(c.Type)
                      return (
                        <td key={c.Config} className="bm-cell">
                          <span className="bm-type-chip" style={{ background: colors.header, color: colors.text }}>
                            {c.Type}
                          </span>
                        </td>
                      )
                    })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Status</td>
                    {filtered.map(c => (
                      <td key={c.Config} className="bm-cell">
                        <span className={`status-badge status-${(c.Status ?? 'not-started').toLowerCase().replace(/\s+/g,'-')}`}>
                          {c.Status ?? 'Not Started'}
                        </span>
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Input Qty</td>
                    {filtered.map(c => (
                      <td key={c.Config} className="bm-cell bm-cell-num">
                        {(Number(c.Quantity) || 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Allocated</td>
                    {filtered.map(c => {
                      const alloc     = allocations.find(a => a.configName === c.Config)
                      const allocQty  = alloc ? alloc.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0) : null
                      const remaining = allocQty != null ? c.Quantity - allocQty : null
                      return (
                        <td key={c.Config} className="bm-cell bm-cell-num">
                          {allocQty != null ? (
                            <>
                              {allocQty.toLocaleString()}
                              <span style={{ color: remaining < 0 ? '#ef4444' : '#86efac', fontSize: 11, marginLeft: 3 }}>
                                ({remaining >= 0 ? '+' : ''}{remaining.toLocaleString()})
                              </span>
                            </>
                          ) : <span className="tm-na-dash">—</span>}
                        </td>
                      )
                    })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">BOM Cost</td>
                    {filtered.map(c => {
                      const board    = boardOf(c.Config)
                      const calcCost = calcBOMCost(board ? bom.filter(p => p.appliesTo === board) : [], c.Quantity)
                      const display  = c.costOverride != null ? c.costOverride : calcCost
                      return (
                        <td key={c.Config} className="bm-cell bm-cell-num">
                          ${Math.round(display).toLocaleString()}
                          {c.costOverride != null && <span className="tm-overridden" title="Manually overridden">*</span>}
                        </td>
                      )
                    })}
                  </tr>

                  <tr>
                    <td className="bm-row-label">Alerts</td>
                    {filtered.map(c => {
                      const rowAlerts = alerts.filter(a => a.config === c.Config)
                      const worstType = rowAlerts.some(a => a.type === 'danger')  ? 'danger'
                                      : rowAlerts.some(a => a.type === 'warning') ? 'warning'
                                      : rowAlerts.length ? 'info' : null
                      return (
                        <td key={c.Config} className="bm-cell" style={{ textAlign: 'center' }}>
                          {worstType
                            ? <span title={rowAlerts.map(a => a.message).join('\n')}>
                                {worstType === 'danger' ? '🔴' : worstType === 'warning' ? '🟡' : 'ℹ️'}
                                {rowAlerts.length > 1 && ` ×${rowAlerts.length}`}
                              </span>
                            : <span style={{ color: '#22c55e' }}>✓</span>}
                        </td>
                      )
                    })}
                  </tr>

                  {/* ── Configuration Details section ─────────────── */}
                  <tr className="bm-section-row bm-section-toggle"
                    onClick={() => setShowDetails(v => !v)}>
                    <td colSpan={filtered.length + 1}>
                      {showDetails ? '▾' : '▸'} Configuration Details
                      <span className="bm-section-hint"> — click any cell to edit</span>
                    </td>
                  </tr>

                  {showDetails && CONFIG_DETAIL_FIELDS.map(({ key, label }) => (
                    <tr key={key}>
                      <td className="bm-row-label">{label}</td>
                      {filtered.map(c => (
                        <CellEditor key={c.Config} configName={c.Config} field={key} isFixed={true} />
                      ))}
                    </tr>
                  ))}

                  {showDetails && customRows.map(row => (
                    <tr key={row.id}>
                      <td className="bm-row-label bm-custom-row-label">
                        {row.label}
                        <button className="bm-del-custom-row"
                          onClick={() => setCustomRows(prev => prev.filter(r => r.id !== row.id))}
                          title="Remove row">✕</button>
                      </td>
                      {filtered.map(c => (
                        <CellEditor key={c.Config} configName={c.Config} field={row.id} isFixed={false} />
                      ))}
                    </tr>
                  ))}

                  {showDetails && (
                    <tr>
                      <td colSpan={filtered.length + 1} style={{ paddingTop: 6, paddingBottom: 6 }}>
                        {addingRow ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0 8px' }}>
                            <input className="bm-inline-input" style={{ width: 180 }} placeholder="Row label…"
                              value={newRowLabel} autoFocus
                              onChange={e => setNewRowLabel(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') addCustomRow(); if (e.key === 'Escape') setAddingRow(false) }} />
                            <button className="btn-export" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addCustomRow}>Add</button>
                            <button className="btn-cancel" onClick={() => setAddingRow(false)}>Cancel</button>
                          </div>
                        ) : (
                          <button className="bm-add-row-btn" onClick={() => setAddingRow(true)}>
                            + Add Row
                          </button>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* ── Material Usage section ────────────────────── */}
                  <tr className="bm-section-row bm-section-toggle"
                    onClick={() => setShowMaterials(v => !v)}>
                    <td colSpan={filtered.length + 1}>
                      {showMaterials ? '▾' : '▸'} Material Usage
                      <span className="bm-section-hint"> ({bom.length} parts from BOM)</span>
                    </td>
                  </tr>

                  {showMaterials && bom.length === 0 && (
                    <tr>
                      <td colSpan={filtered.length + 1} className="bm-empty" style={{ padding: '12px 16px' }}>
                        No BOM data — upload parts in the BOM / Parts tab.
                      </td>
                    </tr>
                  )}

                  {showMaterials && bom.map(part => (
                    <tr key={part.id} className="bm-material-row">
                      <td className="bm-row-label bm-material-label">
                        <span className="tm-part-id">{part.id}</span>
                        <span className="tm-part-desc">{part.description}</span>
                        <span className={`type-badge cat-${(part.category ?? '').toLowerCase()} tm-part-cat`}>{part.category}</span>
                      </td>
                      {filtered.map(c => {
                        const board = boardOf(c.Config)
                        const match = board && board === part.appliesTo
                        const qty   = match ? (part.qtyPerUnit || 1) * c.Quantity : null
                        return (
                          <td key={c.Config} className={`bm-cell bm-cell-num ${match ? '' : 'tm-na'}`}>
                            {qty != null ? qty.toLocaleString() : <span className="tm-na-dash">—</span>}
                          </td>
                        )
                      })}
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

// ── Configs View: flat editable table with per-column filters ─────────────────
const FLAT_COLS = [
  { key: 'Config',     label: 'Config',     width: 150, type: 'text' },
  { key: 'Type',       label: 'Type',       width: 90,  type: 'select', options: TYPES },
  { key: 'Quantity',   label: 'Qty',        width: 80,  type: 'number' },
  { key: 'Status',     label: 'Status',     width: 120, type: 'select', options: ['Not Started','On-going','Completed'] },
  { key: 'Build Date', label: 'Build Date', width: 120, type: 'date' },
  ...CONFIG_DETAIL_FIELDS.map(f => ({ key: f.key, label: f.label, width: 120, type: 'text' })),
]

function ConfigsView({ builds, setBuilds, bom }) {
  const [editingConfig, setEditingConfig] = useState(null)
  const [editingCell,   setEditingCell]   = useState(null)
  const [draft,         setDraft]         = useState('')
  const [colFilter,     setColFilter]     = useState({})

  function saveCell(configName, col, value) {
    const v = col.type === 'number' ? (Number(value) || 0) : value
    setBuilds(prev => prev.map(b => b.Config !== configName ? b : { ...b, [col.key]: v }))
    setEditingCell(null)
  }

  const filtered = builds.filter(b =>
    Object.entries(colFilter).every(([key, val]) =>
      !val || String(b[key] ?? '').toLowerCase().includes(val.toLowerCase())
    )
  )

  return (
    <div className="bm-configs-view">
      <div className="bm-flat-scroll">
        <table className="bm-flat-table">
          <thead>
            <tr>
              {FLAT_COLS.map(col => (
                <th key={col.key} style={{ minWidth: col.width }}>{col.label}</th>
              ))}
              <th style={{ width: 72 }}>Actions</th>
            </tr>
            <tr className="bm-filter-row">
              {FLAT_COLS.map(col => (
                <td key={col.key}>
                  <input className="bm-col-filter" placeholder="Filter…"
                    value={colFilter[col.key] ?? ''}
                    onChange={e => setColFilter(prev => ({ ...prev, [col.key]: e.target.value }))} />
                </td>
              ))}
              <td>
                {Object.values(colFilter).some(Boolean) && (
                  <button className="bm-clear-filter" onClick={() => setColFilter({})}>Clear</button>
                )}
              </td>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={FLAT_COLS.length + 1} className="bm-empty-row">
                  {builds.length === 0 ? 'No configs — add one or upload a file.' : 'No configs match the filters.'}
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr key={c.Config}>
                  {FLAT_COLS.map(col => {
                    const isEditing = editingCell?.configName === c.Config && editingCell?.key === col.key
                    const value     = c[col.key] ?? ''
                    const colors    = typeColor(c.Type)
                    return (
                      <td key={col.key} className="bm-flat-cell"
                        onClick={() => !isEditing && (setEditingCell({ configName: c.Config, key: col.key }), setDraft(String(value)))}>
                        {isEditing ? (
                          col.type === 'select' ? (
                            <select className="bm-inline-select" value={draft} autoFocus
                              onChange={e => setDraft(e.target.value)}
                              onBlur={() => saveCell(c.Config, col, draft)}
                              onKeyDown={e => e.key === 'Escape' && setEditingCell(null)}>
                              {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className="bm-inline-input"
                              type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                              value={draft} autoFocus
                              onChange={e => setDraft(e.target.value)}
                              onBlur={() => saveCell(c.Config, col, draft)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveCell(c.Config, col, draft)
                                if (e.key === 'Escape') setEditingCell(null)
                              }} />
                          )
                        ) : col.key === 'Type' ? (
                          <span className="bm-type-chip" style={{ background: colors.header, color: colors.text }}>
                            {value}
                          </span>
                        ) : col.key === 'Status' ? (
                          <span className={`status-badge status-${(value || 'not-started').toLowerCase().replace(/\s+/g,'-')}`}>
                            {value || 'Not Started'}
                          </span>
                        ) : (
                          <span className={value ? '' : 'tm-na-dash'}>
                            {value || (col.type === 'number' ? '0' : '—')}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="bm-flat-actions">
                    <button className="bm-hdr-btn" onClick={() => setEditingConfig(c)} title="Edit in modal">✎</button>
                    <button className="bm-hdr-btn bm-hdr-del"
                      onClick={() => { if (window.confirm(`Remove ${c.Config}?`)) setBuilds(prev => prev.filter(b => b.Config !== c.Config)) }}
                      title="Remove">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bm-flat-footer">
                <td><strong>Total</strong></td>
                <td></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {filtered.reduce((s, b) => s + (Number(b.Quantity) || 0), 0).toLocaleString()}
                </td>
                <td colSpan={FLAT_COLS.length - 2}></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editingConfig && (
        <EditModal config={editingConfig} bom={bom}
          onSave={(origName, newFields) => {
            setBuilds(prev => prev.map(b => b.Config !== origName ? b : { ...b, ...newFields }))
            setEditingConfig(null)
          }}
          onClose={() => setEditingConfig(null)} />
      )}
    </div>
  )
}

// ── BOM / Parts View ──────────────────────────────────────────────────────────
function BOMView({ bom, setBom }) {
  const [search,      setSearch]      = useState('')
  const [filterBoard, setFilterBoard] = useState('all')
  const [filterCat,   setFilterCat]   = useState('all')
  const [importMsg,   setImportMsg]   = useState(null)

  const boards     = useMemo(() => ['all', ...new Set(bom.map(p => p.appliesTo).filter(Boolean)).values()], [bom])
  const categories = useMemo(() => ['all', ...new Set(bom.map(p => p.category).filter(Boolean)).values()], [bom])

  const filtered = useMemo(() => bom.filter(p =>
    (filterBoard === 'all' || p.appliesTo === filterBoard) &&
    (filterCat   === 'all' || p.category  === filterCat) &&
    (!search ||
      p.id?.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()))
  ), [bom, search, filterBoard, filterCat])

  function handleBOMUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const parts = parseBOMCSV(evt.target.result)
        if (!parts.length) {
          setImportMsg({ ok: false, text: 'No parts found — check CSV format (columns: id, description, category, board, qty_per_unit, unit_cost)' })
        } else {
          const replace = bom.length > 0 &&
            window.confirm(`Replace all ${bom.length} existing parts?\n\nOK = Replace\nCancel = Merge (add new parts)`)
          setBom(replace ? parts : prev => {
            const existIds = new Set(prev.map(p => p.id))
            return [...prev, ...parts.filter(p => !existIds.has(p.id))]
          })
          setImportMsg({ ok: true, text: `${replace ? 'Replaced' : 'Added'} ${parts.length} parts` })
        }
      } catch (err) {
        setImportMsg({ ok: false, text: `Parse error: ${err.message}` })
      }
      setTimeout(() => setImportMsg(null), 6000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="bm-bom-view">
      <div className="bm-bom-toolbar">
        <input className="bm-search-input" placeholder="Search part ID or description…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>
          {boards.map(b => <option key={b} value={b}>{b === 'all' ? 'All Boards' : b}</option>)}
        </select>
        <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <span className="bm-bom-count">{filtered.length} / {bom.length} parts</span>
        <label className="bm-csv-upload-btn" title="Upload CSV: columns id, description, category, board, qty_per_unit, unit_cost">
          ⬆ Upload BOM CSV
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleBOMUpload} />
        </label>
        {bom.length > 0 && (
          <button className="bm-clear-btn"
            onClick={() => { if (window.confirm(`Clear all ${bom.length} BOM parts?`)) setBom([]) }}>
            🗑 Clear BOM
          </button>
        )}
      </div>

      {importMsg && (
        <div className={`bm-import-msg ${importMsg.ok ? 'bm-import-ok' : 'bm-import-warn'}`}>
          <strong>{importMsg.text}</strong>
        </div>
      )}

      <p className="bm-bom-hint">
        Expected CSV columns: <code>id</code>, <code>description</code>, <code>category</code>,{' '}
        <code>board</code> (e.g. MMAIN), <code>qty_per_unit</code>, <code>unit_cost</code>.
        BOM parts are also editable in the <strong>Cost BOM</strong> nav tab.
      </p>

      <div className="bm-flat-scroll">
        <table className="bm-flat-table">
          <thead>
            <tr>
              <th style={{ minWidth: 130 }}>Part ID</th>
              <th style={{ minWidth: 200 }}>Description</th>
              <th style={{ minWidth: 100 }}>Category</th>
              <th style={{ minWidth: 80 }}>Board</th>
              <th style={{ minWidth: 80, textAlign: 'right' }}>Qty/Unit</th>
              <th style={{ minWidth: 90, textAlign: 'right' }}>Unit Cost</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="bm-empty-row">
                  {bom.length === 0
                    ? 'No BOM parts loaded — upload a CSV above.'
                    : 'No parts match your search / filters.'}
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id}>
                  <td className="bm-flat-cell" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id}</td>
                  <td className="bm-flat-cell">{p.description}</td>
                  <td className="bm-flat-cell">
                    <span className={`type-badge cat-${(p.category ?? '').toLowerCase()}`}>{p.category}</span>
                  </td>
                  <td className="bm-flat-cell">{p.appliesTo}</td>
                  <td className="bm-flat-cell" style={{ textAlign: 'right' }}>{p.qtyPerUnit ?? 1}</td>
                  <td className="bm-flat-cell" style={{ textAlign: 'right' }}>
                    {p.unitCost != null ? `$${Number(p.unitCost).toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── BuildMatrix (main export) ─────────────────────────────────────────────────
export default function BuildMatrix({
  builds, setBuilds, bom, setBom, alerts, budget, setBudget,
  projects = [], activeProjectId, setActiveProjectId, allocations = [],
}) {
  const [subTab,      setSubTab]      = useState('current')
  const [phase,       setPhase]       = useState('All')
  const [showAddForm, setShowAddForm] = useState(false)
  const [importMsg,   setImportMsg]   = useState(null)
  const csvInputRef = useRef(null)

  const [customRows, setCustomRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bm-custom-rows')) || [] } catch { return [] }
  })
  useEffect(() => {
    localStorage.setItem('bm-custom-rows', JSON.stringify(customRows))
  }, [customRows])

  const activeProject = projects.find(p => p.id === activeProjectId) ?? projects[0]

  const phaseBuilds = phase === 'All' ? builds
    : builds.filter(b => boardOf(b.Config) === phase)

  const totalQty   = builds.reduce((s, b) => s + (Number(b.Quantity) || 0), 0)
  const alertCount = alerts.length
  const hasDanger  = alerts.some(a => a.type === 'danger')

  function addConfig(newBuild) {
    setBuilds(prev => [...prev, newBuild])
    setShowAddForm(false)
  }

  function handleCSVImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const isXLSX = /\.(xlsx|xls|xlsm)$/i.test(file.name)
    const replace = builds.length > 0 &&
      window.confirm('Replace all existing configs with this file?\n\nOK = Replace all\nCancel = Add to existing')

    const reader = new FileReader()
    reader.onload = evt => {
      const existing = replace ? [] : builds.map(b => b.Config)
      const { added, skipped, errors } = isXLSX
        ? parseBuildsXLSX(new Uint8Array(evt.target.result), existing)
        : parseBuildsCSV(evt.target.result, existing)

      if (added.length > 0) setBuilds(replace ? added : prev => [...prev, ...added])

      const parts = []
      if (replace && added.length) parts.push(`Replaced with ${added.length} configs`)
      else if (added.length)       parts.push(`${added.length} added`)
      if (skipped.length)          parts.push(`${skipped.length} skipped (duplicate)`)
      if (errors.length)           parts.push(`${errors.length} error${errors.length !== 1 ? 's' : ''}`)
      setImportMsg({
        ok:     added.length > 0,
        text:   parts.join(' · ') || 'Nothing imported — open browser console (F12) for details',
        detail: errors.length ? errors.slice(0,3).join('; ') : skipped.length ? `Skipped: ${skipped.slice(0,5).join(', ')}` : '',
      })
      setTimeout(() => setImportMsg(null), 8000)
    }
    if (isXLSX) reader.readAsArrayBuffer(file)
    else         reader.readAsText(file)
    e.target.value = ''
  }

  function handleClearAll() {
    if (!window.confirm(`Remove all ${builds.length} configs? This cannot be undone.`)) return
    setBuilds([])
  }

  const SUBTABS = [
    { id: 'current', label: 'Current' },
    { id: 'configs', label: 'Configs' },
    { id: 'bom',     label: 'BOM / Parts' },
  ]

  return (
    <div className="bm-root">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="bm-topbar">
        <div className="bm-topbar-left">
          {activeProject && (
            <span className="bm-project-label">{activeProject.name}</span>
          )}
          {projects.length > 1 && (
            <select className="bm-project-select" value={activeProjectId ?? ''}
              onChange={e => setActiveProjectId?.(e.target.value)}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="bm-phase-tabs">
            <button className={`bm-phase-btn ${phase === 'All' ? 'active' : ''}`}
              onClick={() => setPhase('All')}>All</button>
            {BOARDS.map(b => (
              <button key={b} className={`bm-phase-btn ${phase === b ? 'active' : ''}`}
                onClick={() => setPhase(b)}>{b}</button>
            ))}
          </div>
        </div>

        <div className="bm-topbar-right">
          <span className="bm-stat-chip">
            {totalQty.toLocaleString()} units
          </span>
          <span className="bm-stat-chip">
            {builds.length} config{builds.length !== 1 ? 's' : ''}
          </span>
          {alertCount > 0 && (
            <span className={`bm-stat-chip bm-alert-chip ${hasDanger ? 'danger' : 'warn'}`}>
              {alertCount} alert{alertCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="bm-budget-row">
            Budget: <EditableCell value={budget} onChange={setBudget} min={0} prefix="$" decimals={0} />
          </span>
        </div>
      </div>

      {/* ── Sub-tab bar ─────────────────────────────────────────────── */}
      <div className="bm-subtab-bar">
        <div className="bm-subtabs">
          {SUBTABS.map(t => (
            <button key={t.id} className={`bm-subtab ${subTab === t.id ? 'active' : ''}`}
              onClick={() => setSubTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="bm-subtab-actions">
          <button className="btn-export" onClick={() => setShowAddForm(v => !v)}>
            {showAddForm ? '✕ Cancel' : '+ Add Config'}
          </button>
          <label className="bm-csv-upload-btn" title="Upload CSV or XLSX to import configs">
            ⬆ Upload CSV / XLSX
            <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv"
              style={{ display: 'none' }} onChange={handleCSVImport} />
          </label>
          {builds.length > 0 && (
            <button className="bm-clear-btn" onClick={handleClearAll} title="Remove all configs">
              🗑 Clear All
            </button>
          )}
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
          <AddConfigForm onAdd={addConfig} onCancel={() => setShowAddForm(false)}
            existingConfigs={builds.map(b => b.Config)} />
        </div>
      )}

      {/* ── Tab content ─────────────────────────────────────────────── */}
      {subTab === 'current' && (
        <CurrentView
          builds={phaseBuilds}
          setBuilds={setBuilds}
          bom={bom}
          alerts={alerts}
          allocations={allocations}
          customRows={customRows}
          setCustomRows={setCustomRows}
        />
      )}

      {subTab === 'configs' && (
        <ConfigsView
          builds={phaseBuilds}
          setBuilds={setBuilds}
          bom={bom}
        />
      )}

      {subTab === 'bom' && (
        <BOMView bom={bom} setBom={setBom ?? (() => {})} />
      )}

    </div>
  )
}
