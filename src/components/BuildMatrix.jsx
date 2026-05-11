import { useState, useMemo } from 'react'
import EditableCell from './EditableCell'
import { alertedConfigSet } from '../utils/alertEngine'
import { calcBOMCost } from '../utils/costEngine'

const TYPES  = ['DIAG', 'COMP', 'LBU', 'POR', 'SAT', 'TEST', 'DOE', 'Golden']
const BOARDS = ['MMAIN', 'MRF', 'MANT', 'MPWR', 'MPACK']
const PHASES = ['All', ...BOARDS]

function boardOf(configName) {
  // longest prefix first to avoid false matches (e.g. MPACK before MP)
  for (const b of ['MPACK', 'MMAIN', 'MPWR', 'MANT', 'MRF']) {
    if (configName.startsWith(b)) return b
  }
  return null
}

// ── Edit modal — appears when user clicks ✎ on a column ──────────────────────
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
      Config:   newName,
      Quantity: Number(fields.Quantity) || 0,
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
            <input
              className="edit-field-input"
              value={fields.Config}
              onChange={e => set('Config', e.target.value.toUpperCase())}
              autoFocus
            />
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
            <input
              className="edit-field-input"
              type="number" min={0}
              value={fields.Quantity}
              onChange={e => set('Quantity', e.target.value)}
            />
          </div>

          <div className="edit-field-row">
            <label>Build Date</label>
            <input
              className="edit-field-input"
              type="date"
              value={fields['Build Date']}
              onChange={e => set('Build Date', e.target.value)}
            />
          </div>

          <div className="edit-field-row">
            <label>BOM Cost Override</label>
            <input
              className="edit-field-input"
              type="number" min={0}
              placeholder={`Auto: $${Math.round(calcCost).toLocaleString()}`}
              value={fields.costOverride}
              onChange={e => set('costOverride', e.target.value)}
            />
          </div>
        </div>

        <div className="edit-config-actions">
          <button type="button" className="btn-primary-modal" onClick={handleSave}>
            ✓ Save Changes
          </button>
          <button type="button" className="btn-cancel-modal" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Transposed matrix section ─────────────────────────────────────────────────
function TransposedMatrix({ title, configs, bom, alerts, setBuilds, onDelete }) {
  const [showMaterials, setShowMaterials] = useState(true)
  const [editingConfig, setEditingConfig] = useState(null) // config object being edited

  function handleSave(origName, newFields) {
    setBuilds(prev => prev.map(b => b.Config !== origName ? b : { ...b, ...newFields }))
    setEditingConfig(null)
  }

  const boardType  = configs[0] ? boardOf(configs[0].Config) : null
  const boardParts = useMemo(() => bom.filter(p => p.appliesTo === boardType), [bom, boardType])

  if (configs.length === 0) {
    return (
      <div className="matrix-section">
        <h3>{title} <span className="row-count">(0)</span></h3>
        <p className="empty-row" style={{ padding: '16px 0', color: '#94a3b8' }}>
          No configs — use "+ Add Config" above
        </p>
      </div>
    )
  }

  const statusClass = s => `status-badge status-${(s ?? 'not-started').toLowerCase().replace(/\s+/g,'-')}`

  return (
    <div className="matrix-section">
      {editingConfig && (
        <EditModal
          config={editingConfig}
          bom={bom}
          onSave={handleSave}
          onClose={() => setEditingConfig(null)}
        />
      )}

      <h3>{title} <span className="row-count">({configs.length})</span></h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="matrix-table transposed-matrix">
          <thead>
            <tr>
              <th className="tm-field-col">Field / Material</th>
              {configs.map(c => {
                const rowAlerts = alerts.filter(a => a.config === c.Config)
                const worstType = rowAlerts.some(a => a.type === 'danger')  ? 'danger'
                                : rowAlerts.some(a => a.type === 'warning') ? 'warning'
                                : rowAlerts.length ? 'info' : null
                return (
                  <th key={c.Config} className={`tm-config-header ${worstType ? `col-alert-${worstType}` : ''}`}>
                    <div className="tm-config-name">{c.Config}</div>
                    <div className="tm-header-actions">
                      <button type="button" className="tm-edit-btn" onClick={() => setEditingConfig(c)}>
                        ✎ Edit
                      </button>
                      <button type="button" className="btn-delete-row tm-delete-btn"
                        onClick={() => onDelete(c.Config)} title={`Remove ${c.Config}`}>✕</button>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>

            <tr className="tm-section-header-row">
              <td className="tm-section-label" colSpan={configs.length + 1}>Build Info</td>
            </tr>

            <tr>
              <td className="tm-field-label">Type</td>
              {configs.map(c => (
                <td key={c.Config}>
                  <span className={`type-badge type-${c.Type.toLowerCase()}`}>{c.Type}</span>
                </td>
              ))}
            </tr>

            <tr>
              <td className="tm-field-label">Status</td>
              {configs.map(c => (
                <td key={c.Config}>
                  <span className={statusClass(c.Status)}>{c.Status ?? 'Not Started'}</span>
                </td>
              ))}
            </tr>

            <tr>
              <td className="tm-field-label">Qty</td>
              {configs.map(c => (
                <td key={c.Config} style={{ textAlign: 'center' }}>{c.Quantity.toLocaleString()}</td>
              ))}
            </tr>

            <tr>
              <td className="tm-field-label">BOM Cost</td>
              {configs.map(c => {
                const board    = boardOf(c.Config)
                const calcCost = calcBOMCost(board ? bom.filter(p => p.appliesTo === board) : [], c.Quantity)
                const display  = c.costOverride != null ? c.costOverride : calcCost
                return (
                  <td key={c.Config} className="cost-cell">
                    ${Math.round(display).toLocaleString()}
                    {c.costOverride != null && <span className="tm-overridden" title="Manually overridden">*</span>}
                  </td>
                )
              })}
            </tr>

            <tr>
              <td className="tm-field-label">Build Date</td>
              {configs.map(c => (
                <td key={c.Config}>{c['Build Date'] || '—'}</td>
              ))}
            </tr>

            <tr>
              <td className="tm-field-label">Alerts</td>
              {configs.map(c => {
                const rowAlerts = alerts.filter(a => a.config === c.Config)
                const worstType = rowAlerts.some(a => a.type === 'danger')  ? 'danger'
                                : rowAlerts.some(a => a.type === 'warning') ? 'warning'
                                : rowAlerts.length ? 'info' : null
                return (
                  <td key={c.Config} className="alert-col" style={{ textAlign: 'center' }}>
                    {worstType
                      ? <span title={rowAlerts.map(a => a.message).join('\n')}>
                          {worstType === 'danger' ? '🔴' : worstType === 'warning' ? '🟡' : 'ℹ️'}
                          {rowAlerts.length > 1 && ` ×${rowAlerts.length}`}
                        </span>
                      : <span style={{ color: '#86efac' }}>✓</span>}
                  </td>
                )
              })}
            </tr>

            <tr className="tm-section-header-row">
              <td colSpan={configs.length + 1} className="tm-section-label">
                <button className="tm-toggle-btn" onClick={() => setShowMaterials(v => !v)}>
                  {showMaterials ? '▾' : '▸'} Materials ({boardParts.length} parts)
                </button>
              </td>
            </tr>

            {showMaterials && boardParts.map(part => (
              <tr key={part.id} className="tm-material-row">
                <td className="tm-material-label">
                  <span className="tm-part-id">{part.id}</span>
                  <span className="tm-part-desc">{part.description}</span>
                  <span className={`type-badge cat-${part.category.toLowerCase()} tm-part-cat`}>{part.category}</span>
                </td>
                {configs.map(c => {
                  const match = boardOf(c.Config) === part.appliesTo
                  const qty   = match ? part.qtyPerUnit * c.Quantity : null
                  return (
                    <td key={c.Config} className={`tm-material-cell ${match ? '' : 'tm-na'}`}
                      style={{ textAlign: 'center' }}>
                      {qty != null ? qty.toLocaleString() : <span className="tm-na-dash">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}

          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Add config form ───────────────────────────────────────────────────────────
function AddConfigForm({ onAdd, onCancel, existingConfigs }) {
  const [board,     setBoard]     = useState(BOARDS[0])
  const [suffix,    setSuffix]    = useState('')
  const [type,      setType]      = useState('POR')
  const [status,    setStatus]    = useState('Not Started')
  const [quantity,  setQuantity]  = useState(0)
  const [buildDate, setBuildDate] = useState('')

  const configName = suffix.trim() ? `${board}-${suffix.trim().toUpperCase()}` : ''
  const duplicate  = existingConfigs.includes(configName)
  const valid      = !!configName && !duplicate

  function handleAdd() {
    if (!valid) return
    onAdd({
      Config: configName,
      Type: type,
      'SMT Modem': '✓', 'SMT Antenna': '✓', FATP: '✓',
      Status: status,
      Quantity: quantity,
      'Build Date': buildDate,
    })
    setSuffix('')
    setQuantity(0)
    setBuildDate('')
  }

  return (
    <div className="add-config-form">
      <h3>New Configuration</h3>
      <div className="add-form-row">
        <div className="add-form-group">
          <label>Board</label>
          <select value={board} onChange={e => setBoard(e.target.value)} className="filter-select">
            {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="add-form-group">
          <label>Suffix</label>
          <input
            type="text"
            placeholder="e.g. DIAG4"
            value={suffix}
            onChange={e => setSuffix(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            className="search-input"
            style={{ width: 110 }}
          />
        </div>
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
          <input
            type="number"
            value={quantity}
            min={0}
            onChange={e => setQuantity(Number(e.target.value))}
            className="search-input"
            style={{ width: 80 }}
          />
        </div>
        <div className="add-form-group">
          <label>Build Date</label>
          <input
            type="date"
            value={buildDate}
            onChange={e => setBuildDate(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="add-form-actions">
          <button onClick={handleAdd} className="btn-export" disabled={!valid}>Add</button>
          <button onClick={onCancel} className="btn-cancel">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── BuildMatrix (main export) ─────────────────────────────────────────────────
export default function BuildMatrix({ builds, setBuilds, bom, alerts, budget, setBudget, projects = [], activeProjectId, setActiveProjectId }) {
  const [filter,      setFilter]      = useState('all')
  const [search,      setSearch]      = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [phase,       setPhase]       = useState('All')
  const [projSearch,  setProjSearch]  = useState('')

  const activeProject    = projects.find(p => p.id === activeProjectId) ?? projects[0]
  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(projSearch.toLowerCase()))

  const alertSet = useMemo(() => alertedConfigSet(alerts), [alerts])
  const types    = ['all', ...new Set(builds.map(b => b.Type))]

  const filtered = builds.filter(b =>
    (filter === 'all' || b.Type === filter) &&
    b.Config.toLowerCase().includes(search.toLowerCase()) &&
    (phase === 'All' || boardOf(b.Config) === phase)
  )
  // group filtered configs by board; configs with no matching board go to "Other"
  const boardGroups = BOARDS.reduce((acc, b) => ({ ...acc, [b]: [] }), { Other: [] })
  filtered.forEach(c => {
    const b = boardOf(c.Config)
    if (b && boardGroups[b]) boardGroups[b].push(c)
    else boardGroups['Other'].push(c)
  })

  const totalQty      = builds.reduce((sum, b) => sum + b.Quantity, 0)
  const completeCount = builds.filter(b => b.Status === 'Completed').length
  const alertCount    = alerts.length
  const hasDanger     = alerts.some(a => a.type === 'danger')

  function deleteConfig(config) {
    if (!window.confirm(`Remove ${config}?`)) return
    setBuilds(prev => prev.filter(b => b.Config !== config))
  }

  function addConfig(newBuild) {
    setBuilds(prev => [...prev, newBuild])
    setShowAddForm(false)
  }

  const shared = { bom, alerts, alertSet, setBuilds, onDelete: deleteConfig }

  return (
    <div className="build-matrix">
      <h1>Build Matrix</h1>

      {/* ── Project + Phase selectors ──────────────────────────────── */}
      <div className="proj-bar" style={{ marginBottom: 20 }}>
        <div className="proj-selector-group">
          <label className="proj-selector-label">Project</label>
          <div className="proj-dropdown-wrap">
            <div className="proj-search-wrap">
              <span className="proj-search-icon">⌕</span>
              <input
                className="proj-search-input"
                placeholder="Search…"
                value={projSearch}
                onChange={e => setProjSearch(e.target.value)}
              />
              {projSearch && <button className="proj-search-clear" onClick={() => setProjSearch('')}>×</button>}
            </div>
            <select
              className="proj-select"
              value={activeProjectId ?? ''}
              onChange={e => { setActiveProjectId?.(e.target.value); setProjSearch('') }}
            >
              {filteredProjects.length > 0
                ? filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                : <option disabled>No matches</option>
              }
            </select>
          </div>
        </div>

        <div className="proj-selector-group" style={{ marginLeft: 24 }}>
          <label className="proj-selector-label">Board</label>
          <select className="proj-select" value={phase} onChange={e => setPhase(e.target.value)}>
            {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {activeProject && (
          <div className="proj-active-badge">
            <strong>{activeProject.name}</strong>
            {phase !== 'All' && (
              <span className="proj-change-count" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                {phase}
              </span>
            )}
          </div>
        )}

      </div>

      {/* ── Banner ────────────────────────────────────────────────── */}
      <div className={`alert-banner ${alertCount > 0 ? (hasDanger ? 'banner-danger' : 'banner-warning') : 'banner-ok'}`}>
        {alertCount > 0
          ? <><strong>{alertCount} alert{alertCount !== 1 ? 's' : ''}</strong> — edit values or adjust budget.</>
          : <>All configurations look healthy.</>}
        &nbsp;&nbsp;Budget per run:&nbsp;
        <EditableCell value={budget} onChange={setBudget} min={0} prefix="$" decimals={0} />
      </div>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{builds.length}</div>
          <div className="stat-label">Total Configs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalQty.toLocaleString()}</div>
          <div className="stat-label">Total Units</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completeCount}</div>
          <div className="stat-label">Complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{builds.length - completeCount}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className={`stat-card ${alertCount > 0 ? (hasDanger ? 'stat-card-danger' : 'stat-card-warn') : 'stat-card-ok'}`}>
          <div className="stat-value">{alertCount}</div>
          <div className="stat-label">Alerts</div>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search configs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} className="filter-select">
          {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
        </select>
        <button className="btn-export" onClick={() => setShowAddForm(v => !v)}>
          {showAddForm ? '✕ Cancel' : '+ Add Config'}
        </button>
      </div>

      {showAddForm && (
        <AddConfigForm
          onAdd={addConfig}
          onCancel={() => setShowAddForm(false)}
          existingConfigs={builds.map(b => b.Config)}
        />
      )}

      {/* ── Transposed matrix tables ───────────────────────────────── */}
      <div className="matrix-container">
        <h2>Config Matrix <span className="edit-hint-label">— click ✎ Edit on any column to edit</span></h2>

        {BOARDS.map(board => (
          <TransposedMatrix
            key={board}
            title={board}
            configs={boardGroups[board]}
            {...shared}
          />
        ))}
        {boardGroups['Other'].length > 0 && (
          <TransposedMatrix key="other" title="Other Configs" configs={boardGroups['Other']} {...shared} />
        )}
      </div>

      <div className="table-footer">
        Showing {filtered.length} of {builds.length} configs &nbsp;•&nbsp; ✎ Edit to modify a config
      </div>
    </div>
  )
}
