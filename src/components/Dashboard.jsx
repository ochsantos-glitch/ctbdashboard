import { useState, useRef } from 'react'
import EditableCell from './EditableCell'

// ── Program Timeline data ─────────────────────────────────────────────────────
const MONTHS = [
  { name: 'June',   weeks: [1, 2, 3, 4] },
  { name: 'July',   weeks: [1, 2, 3, 4] },
  { name: 'August', weeks: [1, 2, 3, 4] },
]

const TIMELINE_PHASES = [
  { label: 'Supply Chain', cells: ['done','done','go','go', null, null, null, null, null, null, null, null] },
  { label: 'SMT',          cells: ['done','done','go','go', null, null, null, null, null, null, null, null] },
  { label: 'FATP',         cells: ['done','done','go','go','go', null, null, null, null, null, null, null] },
  { label: 'ECO',          cells: ['risk', null, null, null, null, null, null, null, null, null, null, null] },
]

const RISKS = [
  { owner: 'MPM',     concern: 'Nand 128G not enough material / Supplier 1', completion: 'Jun Wk2' },
  { owner: 'MLB SMT', concern: 'SW 15.0 pending release',                    completion: 'Jun Wk2' },
]

function getCurrentWeekCol() {
  const today = new Date()
  const todayMonth = today.toLocaleString('default', { month: 'long' })
  const weekOfMonth = Math.min(Math.ceil(today.getDate() / 7), 4)
  let col = 0
  for (const m of MONTHS) {
    if (m.name === todayMonth) return col + weekOfMonth - 1
    col += m.weeks.length
  }
  return -1
}

const DEFAULT_PLAN = {
  smt: [
    { site: 'CM1 China',   materialDrive: 4000, mih: '6/22/26', buildStart: '6/29/26' },
    { site: 'CM2 China',   materialDrive: 3992, mih: '6/29/26', buildStart: '7/6/26'  },
    { site: 'CM3 Vietnam', materialDrive: 1800, mih: '7/6/26',  buildStart: '7/12/26' },
  ],
  fatp: [
    { site: 'CM1 China',   materialDrive: 1600, mih: '7/6/26',  buildStart: '7/12/26' },
    { site: 'CM2 China',   materialDrive: 1450, mih: '7/12/26', buildStart: '7/19/26' },
    { site: 'CM3 Vietnam', materialDrive: 1300, mih: '7/19/26', buildStart: '7/26/26' },
  ],
}

const FIELD_LABELS = {
  materialDrive: 'Material Drive',
  mih:           'MIH',
  buildStart:    'Build Start',
}

function makeProject(name) {
  return {
    id:      crypto.randomUUID(),
    name,
    budget:  12000,
    plan:    JSON.parse(JSON.stringify(DEFAULT_PLAN)),
    history: [],
  }
}

// ── Inline editable text cell ─────────────────────────────────────────────────
function EditableText({ value, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  if (!editing && draft !== value) setDraft(value)

  if (editing) {
    return (
      <input
        className="bp-date-input"
        value={draft}
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
    <span className="bp-date-display" onClick={() => { setDraft(value); setEditing(true) }} title="Click to edit">
      {value}
    </span>
  )
}

// ── Confirm-change modal ──────────────────────────────────────────────────────
function ChangeModal({ pending, onSave, onCancel }) {
  const [comment, setComment] = useState('')

  function handleSave() {
    if (!comment.trim()) return
    onSave(comment.trim())
    setComment('')
  }

  return (
    <div className="change-modal-overlay">
      <div className="change-modal">
        <div className="change-modal-header">
          <h3 className="change-modal-title">Confirm Change</h3>
          <button className="change-modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="change-modal-summary">
          <div className="change-summary-row">
            <span className="change-summary-key">Build</span>
            <span className={`type-badge ${pending.build === 'SMT' ? 'cat-smt' : 'cat-fatp'}`}>{pending.build}</span>
          </div>
          <div className="change-summary-row">
            <span className="change-summary-key">Site</span>
            <span className="change-summary-val">{pending.site}</span>
          </div>
          <div className="change-summary-row">
            <span className="change-summary-key">Field</span>
            <span className="change-summary-val">{FIELD_LABELS[pending.field]}</span>
          </div>
          <div className="change-summary-row">
            <span className="change-summary-key">From</span>
            <span className="change-summary-val history-old">{String(pending.oldVal)}</span>
          </div>
          <div className="change-summary-row">
            <span className="change-summary-key">To</span>
            <span className="change-summary-val history-new">{String(pending.newVal)}</span>
          </div>
        </div>

        <label className="change-modal-label">
          Comment <span className="change-required">*required</span>
        </label>
        <textarea
          className="change-modal-textarea"
          placeholder="Reason for this change…"
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave() }}
          rows={3}
          autoFocus
        />
        <div className="change-modal-hint">Ctrl+Enter to save</div>

        <div className="change-modal-actions">
          <button className="btn-primary-modal" disabled={!comment.trim()} onClick={handleSave}>
            Save Change
          </button>
          <button className="btn-cancel-modal" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ projects, setProjects, activeProjectId, setActiveProjectId }) {
  const [search,  setSearch]  = useState('')
  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [pending, setPending] = useState(null)
  const addInputRef = useRef(null)

  const resolvedId = activeProjectId ?? null
  const active     = resolvedId ? projects.find(p => p.id === resolvedId) ?? null : null
  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  // ── Add project ───────────────────────────────────────────────────────────────
  function addProject() {
    const name = newName.trim() || `Project ${String.fromCharCode(65 + projects.length)}`
    const proj  = makeProject(name)
    setProjects(prev => [...prev, proj])
    setActiveProjectId(proj.id)
    setNewName('')
    setAdding(false)
  }

  // ── Request a change — opens comment modal ────────────────────────────────────
  function requestChange(type, idx, field, newVal) {
    if (!active) return
    const row    = active.plan[type][idx]
    const oldVal = row[field]
    if (String(oldVal) === String(newVal)) return
    setPending({ type, idx, field, oldVal, newVal, site: row.site, build: type.toUpperCase() })
  }

  // ── Commit after comment entered ──────────────────────────────────────────────
  function commitChange(comment) {
    if (!pending) return
    const { type, idx, field, oldVal, newVal, site, build } = pending
    const entry = {
      id:      Date.now(),
      ts:      new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
      build, site,
      field:   FIELD_LABELS[field],
      from:    String(oldVal),
      to:      String(newVal),
      comment,
    }
    setProjects(prev => prev.map(p => {
      if (p.id !== resolvedId) return p
      return {
        ...p,
        plan: { ...p.plan, [type]: p.plan[type].map((r, i) => i === idx ? { ...r, [field]: newVal } : r) },
        history: [entry, ...p.history],
      }
    }))
    setPending(null)
  }

  function clearHistory() {
    setProjects(prev => prev.map(p => p.id === resolvedId ? { ...p, history: [] } : p))
  }

  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>

      {/* ── Project selector bar ─────────────────────────────────────── */}
      <div className="proj-bar">
        <div className="proj-selector-group">
          <label className="proj-selector-label">Project</label>
          <div className="proj-dropdown-wrap">
            <div className="proj-search-wrap">
              <span className="proj-search-icon">⌕</span>
              <input
                className="proj-search-input"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className="proj-search-clear" onClick={() => setSearch('')}>×</button>}
            </div>
            <select
              className="proj-select"
              value={resolvedId ?? ''}
              onChange={e => { setActiveProjectId(e.target.value || null); setSearch('') }}
            >
              <option value=''>— Select a project —</option>
              {filteredProjects.length > 0
                ? filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                : <option disabled>No matches</option>
              }
            </select>
          </div>
        </div>

        <div className="proj-add-wrap">
          {adding ? (
            <div className="proj-add-inline">
              <input
                ref={addInputRef}
                className="proj-add-input"
                placeholder="Project name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addProject(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
                autoFocus
              />
              <button className="btn-export" onClick={addProject}>Add</button>
              <button className="btn-export" onClick={() => { setAdding(false); setNewName('') }}>Cancel</button>
            </div>
          ) : (
            <button className="proj-add-btn" onClick={() => setAdding(true)}>+ Add Project</button>
          )}
        </div>

        {active && (
          <div className="proj-active-badge">
            Viewing: <strong>{active.name}</strong>
            {active.history.length > 0 && (
              <span className="proj-change-count">{active.history.length} change{active.history.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>

      {!active && (
        <p style={{ color: '#94a3b8', marginTop: 32, fontSize: 15 }}>Select a project to view its dashboard.</p>
      )}

      {active && (
        <>
          {/* ── Program Timeline ────────────────────────────────────── */}
          <h2 className="section-title">Program Timeline</h2>
          <div className="bom-table-wrap">
            <table className="timeline-table">
              <thead>
                <tr>
                  <th className="tl-label-col">Task (week)</th>
                  {MONTHS.map(m => (
                    <th key={m.name} colSpan={m.weeks.length} className="tl-month-header">{m.name}</th>
                  ))}
                </tr>
                <tr>
                  <th className="tl-label-col" />
                  {MONTHS.flatMap((m, mi) => m.weeks.map((w, wi) => {
                    const col = MONTHS.slice(0, mi).reduce((s, pm) => s + pm.weeks.length, 0) + wi
                    return (
                      <th key={`${m.name}-${w}`} className={`tl-week-header${col === getCurrentWeekCol() ? ' tl-current-week' : ''}`}>{w}</th>
                    )
                  }))}
                </tr>
              </thead>
              <tbody>
                {TIMELINE_PHASES.map(phase => (
                  <tr key={phase.label}>
                    <td className="tl-label">{phase.label}</td>
                    {phase.cells.map((status, i) => (
                      <td key={i} className={`tl-cell${status ? ` tl-${status}` : ''}${i === getCurrentWeekCol() ? ' tl-current-week-col' : ''}`} />
                    ))}
                  </tr>
                ))}
                <tr><td colSpan={13} className="tl-spacer" /></tr>
                <tr className="tl-risk-header-row">
                  <td className="tl-label tl-dri-label">DRI</td>
                  <td colSpan={4} className="tl-risk-col-label">Concern</td>
                  <td colSpan={4} className="tl-risk-col-label">Completion Date</td>
                  <td colSpan={4} />
                </tr>
                {RISKS.map(r => (
                  <tr key={r.owner} className="tl-risk-row">
                    <td className="tl-label tl-owner">{r.owner}</td>
                    <td colSpan={4} className="tl-concern">{r.concern}</td>
                    <td colSpan={4} className="tl-completion">{r.completion}</td>
                    <td colSpan={4} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tl-legend">
            <div className="tl-legend-item"><div className="tl-legend-swatch tl-done" /><span>Completed</span></div>
            <div className="tl-legend-item"><div className="tl-legend-swatch tl-go" /><span>On-going</span></div>
            <div className="tl-legend-item"><div className="tl-legend-swatch tl-risk" /><span>Impact</span></div>
          </div>

          {/* ── Build Plan ───────────────────────────────────────────── */}
          <h2 className="section-title" style={{ marginTop: 32 }}>
            Build Plan
            <span className="edit-hint-label" style={{ marginLeft: 10 }}>click any cell to edit — a comment is required to save</span>
          </h2>
          <div className="bom-table-wrap">
            <table className="build-plan-table">
              <thead>
                <tr>
                  <th className="build-plan-row-label">Build</th>
                  <th colSpan={3} className="build-plan-group build-plan-smt">SMT</th>
                  <th colSpan={3} className="build-plan-group build-plan-fatp">FATP</th>
                </tr>
                <tr>
                  <th className="build-plan-row-label">Site</th>
                  {active.plan.smt.map(s  => <th key={s.site} className="build-plan-site">{s.site}</th>)}
                  {active.plan.fatp.map(s => <th key={s.site} className="build-plan-site">{s.site}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="build-plan-row-label">Material Drive</td>
                  {active.plan.smt.map((s, i) => (
                    <td key={s.site} className="build-plan-cell build-plan-num">
                      <EditableCell value={s.materialDrive} onChange={v => requestChange('smt', i, 'materialDrive', v)} min={0} decimals={0} />
                    </td>
                  ))}
                  {active.plan.fatp.map((s, i) => (
                    <td key={s.site} className="build-plan-cell build-plan-num">
                      <EditableCell value={s.materialDrive} onChange={v => requestChange('fatp', i, 'materialDrive', v)} min={0} decimals={0} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="build-plan-row-label">MIH (Material In House)</td>
                  {active.plan.smt.map((s, i) => (
                    <td key={s.site} className="build-plan-cell build-plan-date">
                      <EditableText value={s.mih} onChange={v => requestChange('smt', i, 'mih', v)} />
                    </td>
                  ))}
                  {active.plan.fatp.map((s, i) => (
                    <td key={s.site} className="build-plan-cell build-plan-date build-plan-fatp-cell">
                      <EditableText value={s.mih} onChange={v => requestChange('fatp', i, 'mih', v)} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="build-plan-row-label">Build Start</td>
                  {active.plan.smt.map((s, i) => (
                    <td key={s.site} className="build-plan-cell build-plan-date">
                      <EditableText value={s.buildStart} onChange={v => requestChange('smt', i, 'buildStart', v)} />
                    </td>
                  ))}
                  {active.plan.fatp.map((s, i) => (
                    <td key={s.site} className="build-plan-cell build-plan-date build-plan-fatp-cell">
                      <EditableText value={s.buildStart} onChange={v => requestChange('fatp', i, 'buildStart', v)} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Change History ───────────────────────────────────────── */}
          {active.history.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 32 }}>
                <h2 className="section-title" style={{ margin: 0 }}>Change History — {active.name}</h2>
                <button className="btn-export" style={{ fontSize: 11, padding: '3px 10px' }} onClick={clearHistory}>Clear</button>
              </div>
              <div className="bom-table-wrap" style={{ marginTop: 10 }}>
                <table className="build-table history-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th><th>Build</th><th>Site</th><th>Field</th><th>Previous</th><th>New Value</th><th>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.history.map(h => (
                      <tr key={h.id}>
                        <td className="history-ts">{h.ts}</td>
                        <td><span className={`type-badge ${h.build === 'SMT' ? 'cat-smt' : 'cat-fatp'}`}>{h.build}</span></td>
                        <td>{h.site}</td>
                        <td>{h.field}</td>
                        <td className="history-old">{h.from}</td>
                        <td className="history-new">{h.to}</td>
                        <td className="history-comment">{h.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {pending && <ChangeModal pending={pending} onSave={commitChange} onCancel={() => setPending(null)} />}
    </div>
  )
}
