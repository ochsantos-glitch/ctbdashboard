import { useState, useEffect } from 'react'
import emailjs from '@emailjs/browser'

const EMAILJS_SERVICE_ID  = 'service_gvib8r2'
const EMAILJS_TEMPLATE_ID = 'template_m2ws09m'
const EMAILJS_PUBLIC_KEY  = 'ORvGP0xa6uEimVFBu'

const STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Accepted', 'Rejected']

const STATUS_CLASS = {
  'Not Started': 'status-not-started',
  'In Progress': 'status-on-going',
  'Blocked':     'dt-status-blocked',
  'Completed':   'status-completed',
  'Accepted':    'status-completed',
  'Rejected':    'dt-status-blocked',
}

// Known column aliases — used only to normalize keys, NOT to limit which columns appear
const KNOWN_COLS = [
  { key: 'project',     aliases: ['project', 'project name', 'proj', 'program'] },
  { key: 'shipDate',    aliases: ['ship date', 'shipdate', 'ship', 'shipping date', 'date'] },
  { key: 'cmSite',      aliases: ['cm site', 'cmsite', 'cm', 'site', 'factory', 'manufacturer'] },
  { key: 'config',      aliases: ['config', 'configuration', 'sku', 'model', 'part'] },
  { key: 'sn',          aliases: ['sn', 'serial number', 'serial', 'serialnumber', 's/n'] },
  { key: 'imei',        aliases: ['imei', 'imei number', 'imei1'] },
  { key: 'email',       aliases: ['email', 'e-mail', 'email address', 'contact', 'mail'] },
  { key: 'destination', aliases: ['destination', 'dest', 'ship to', 'shipto', 'location', 'country', 'address'] },
  { key: 'status',      aliases: ['status', 'state', 'stage'] },
]

const DEFAULT_COLUMNS = KNOWN_COLS.map(({ key }) => ({
  key,
  label: key === 'shipDate' ? 'Ship Date' : key === 'cmSite' ? 'CM Site' :
         key.charAt(0).toUpperCase() + key.slice(1),
}))

function makeItem(fields) {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields }
}

function splitRow(line, sep) {
  const cells = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQuote = false
      else cur += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === sep) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function detectSeparator(lines) {
  const seps = [',', '\t', ';']
  let bestSep = ',', bestScore = 0
  for (const sep of seps) {
    const score = lines.slice(0, 5).reduce((n, l) => n + splitRow(l, sep).length, 0)
    if (score > bestScore) { bestScore = score; bestSep = sep }
  }
  return bestSep
}

function findHeaderRowIndex(lines, sep) {
  let bestIdx = 0, bestScore = -1
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cells = splitRow(lines[i], sep).map(h => h.toLowerCase().trim())
    const matches = KNOWN_COLS.reduce((n, { aliases }) => n + (cells.some(h => aliases.includes(h)) ? 1 : 0), 0)
    const score = matches * 10 + cells.length * 0.1
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

function buildColumns(rawHeaders) {
  const usedKeys = new Set()
  return rawHeaders.map((h, i) => {
    const lower = h.toLowerCase().trim()
    // match against known aliases
    let key = null
    for (const { key: k, aliases } of KNOWN_COLS) {
      if (aliases.includes(lower)) { key = k; break }
    }
    // blank header in column A → treat as project
    if (!key && !lower && i === 0 && !usedKeys.has('project')) key = 'project'
    // fallback: normalize to safe key
    if (!key) key = (lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `col${i}`)
    // ensure unique
    let finalKey = key, n = 2
    while (usedKeys.has(finalKey)) finalKey = `${key}_${n++}`
    usedKeys.add(finalKey)
    return { key: finalKey, label: h || (i === 0 ? 'Project' : `Column ${i + 1}`) }
  })
}

function repairSplitNumbers(raw, columns) {
  // Numbers exports large integers with thousands-separator commas (e.g. IMEI: 358,535,130,366,351)
  // which creates extra cells and shifts all subsequent columns. Detect and fix.
  const emailPos = columns.findIndex(c => c.key === 'email')
  if (emailPos < 0) return raw

  // If email cell already contains '@', row is fine
  if (raw[emailPos]?.includes('@')) return raw

  // Find the actual email cell (contains '@')
  const actualEmailPos = raw.findIndex(c => c.includes('@'))
  if (actualEmailPos < 0 || actualEmailPos <= emailPos) return raw

  // Recombine everything between the imei column and the actual email cell
  const imeiPos = columns.findIndex(c => c.key === 'imei')
  const start   = imeiPos >= 0 ? imeiPos : emailPos
  const combined = raw.slice(start, actualEmailPos).join('').replace(/\s/g, '')

  return [...raw.slice(0, start), combined, ...raw.slice(actualEmailPos)]
}

function parseCSV(text) {
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { error: 'File must have a header row and at least one data row.' }

  const sep        = detectSeparator(lines)
  const headerIdx  = findHeaderRowIndex(lines, sep)
  const rawHeaders = splitRow(lines[headerIdx], sep)
  const columns    = buildColumns(rawHeaders)

  const dataLines = lines.slice(headerIdx + 1)
  const items = dataLines.map(line => {
    const raw = splitRow(line, sep)
    if (raw.every(c => !c)) return null
    const repaired = repairSplitNumbers(raw, columns)
    const row = [...repaired, ...Array(Math.max(0, columns.length - repaired.length)).fill('')]
    const fields = Object.fromEntries(columns.map(({ key }, i) => [key, row[i] ?? '']))
    return makeItem(fields)
  }).filter(Boolean)

  if (!items.length) return { error: `No data rows found. Headers: ${rawHeaders.join(', ')}` }
  return { columns, items }
}

export default function DevTrack({ pendingAction = {} }) {
  const [columns, setColumns] = useState(() => {
    try { return JSON.parse(localStorage.getItem('devtrack-cols')) || DEFAULT_COLUMNS } catch { return DEFAULT_COLUMNS }
  })
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('devtrack-items')) || [] } catch { return [] }
  })

  const [form,          setForm]          = useState({})
  const [adding,        setAdding]        = useState(false)
  const [search,        setSearch]        = useState('')
  const [filterProject, setFilterProject] = useState('All')
  const [filterSite,    setFilterSite]    = useState('All')
  const [filterStatus,  setFilterStatus]  = useState('All')
  const [sortCol,       setSortCol]       = useState('createdAt')
  const [sortDir,       setSortDir]       = useState('desc')
  const [editId,        setEditId]        = useState(null)
  const [editDraft,     setEditDraft]     = useState({})
  const [toast,         setToast]         = useState(null)
  const [importHistory, setImportHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('devtrack-history')) || [] } catch { return [] }
  })
  const [showHistory,      setShowHistory]      = useState(false)
  const [transferModal,    setTransferModal]    = useState(null)
  const [transferEmail,    setTransferEmail]    = useState('')
  const [transferSending,  setTransferSending]  = useState(false)
  const [historyModal,     setHistoryModal]     = useState(null)
  const [reviewModal,      setReviewModal]      = useState(null)
  const [rejectReason,     setRejectReason]     = useState('')

  useEffect(() => { localStorage.setItem('devtrack-cols',    JSON.stringify(columns))       }, [columns])
  useEffect(() => { localStorage.setItem('devtrack-items',   JSON.stringify(items))         }, [items])
  useEffect(() => { localStorage.setItem('devtrack-history', JSON.stringify(importHistory)) }, [importHistory])

  useEffect(() => {
    const { action, id } = pendingAction
    if (!action || !id) return
    if (action === 'accept') {
      setItems(prev => prev.map(it => {
        if (it.id !== id) return it
        const outcomeEntry = { date: new Date().toISOString(), type: 'Accepted', byEmail: it.email, reason: '' }
        return { ...it, status: 'Accepted', transferHistory: [...(it.transferHistory || []), outcomeEntry] }
      }))
      showToast('Device Accepted successfully.')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (action === 'reject') {
      // Show rejection reason modal before finalizing
      setItems(prev => {
        const item = prev.find(it => it.id === id)
        if (item) setReviewModal({ ...item, _pendingReject: true })
        return prev
      })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const projects  = ['All', ...Array.from(new Set(items.map(i => i.project).filter(Boolean))).sort()]
  const sites     = ['All', ...Array.from(new Set(items.map(i => i.cmSite).filter(Boolean))).sort()]
  const statuses  = ['All', ...Array.from(new Set(items.map(i => i.status).filter(Boolean))).sort()]

  const visible = [...items]
    .filter(it =>
      (filterProject === 'All' || (it.project ?? '').toLowerCase() === filterProject.toLowerCase()) &&
      (filterSite    === 'All' || (it.cmSite  ?? '').toLowerCase() === filterSite.toLowerCase()) &&
      (filterStatus  === 'All' || it.status === filterStatus) &&
      (search === '' || columns.some(({ key }) => (it[key] ?? '').toLowerCase().includes(search.toLowerCase())))
    )
    .sort((a, b) => {
      const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  function SortIcon({ col }) {
    if (sortCol !== col) return <span className="sort-icon">⇅</span>
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function emptyForm() { return Object.fromEntries(columns.map(({ key }) => [key, key === 'status' ? 'Not Started' : ''])) }

  function handleAdd() {
    if (Object.values(form).every(v => !String(v).trim())) return
    setItems(prev => [makeItem(form), ...prev])
    setForm(emptyForm())
    setAdding(false)
  }

  function startEdit(it)  { setEditId(it.id); setEditDraft({ ...it }) }
  function saveEdit() {
    setItems(prev => prev.map(it => it.id === editId ? { ...it, ...editDraft } : it))
    setEditId(null); setEditDraft({})
  }
  function cancelEdit()   { setEditId(null); setEditDraft({}) }
  function deleteItem(id) {
    if (window.confirm('Remove this item?')) setItems(prev => prev.filter(it => it.id !== id))
  }

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const REQUIRED_FIELDS = [
    { key: 'project', label: 'Project' },
    { key: 'email',   label: 'Email' },
    { key: 'sn',      label: 'SN' },
    { key: 'imei',    label: 'IMEI' },
  ]

  function warnMissingFields(importedItems) {
    const warnings = []
    importedItems.forEach((item, idx) => {
      const missing = REQUIRED_FIELDS.filter(f => !String(item[f.key] ?? '').trim()).map(f => f.label)
      if (missing.length) warnings.push(`Row ${idx + 1} (${item.sn || item.imei || '?'}): missing ${missing.join(', ')}`)
    })
    if (warnings.length) {
      setTimeout(() => showToast(
        `⚠ ${warnings.length} row${warnings.length !== 1 ? 's' : ''} with missing fields — ${warnings.slice(0, 2).join(' · ')}${warnings.length > 2 ? ` · +${warnings.length - 2} more` : ''}`,
        'error'
      ), 200)
    }
  }

  function handleImportCSV(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const result = parseCSV(evt.target.result)
      if (result.error) { showToast(result.error, 'error'); return }

      const append = items.length > 0 && window.confirm(
        `You already have ${items.length} item(s).\n\nClick OK to ADD new rows to existing data.\nClick Cancel to REPLACE all existing data.`
      )

      if (append) {
        const normSN   = v => (v ?? '').replace(/[\s,]/g, '').toLowerCase()
        const normIMEI = v => (v ?? '').replace(/[\s,]/g, '').toLowerCase()

        const existingSNs   = new Set(items.map(i => normSN(i.sn)).filter(Boolean))
        const existingIMEIs = new Set(items.map(i => normIMEI(i.imei)).filter(Boolean))

        const unique = []
        const dupes  = []
        for (const item of result.items) {
          const snKey   = normSN(item.sn)
          const imeiKey = normIMEI(item.imei)
          const snDupe   = snKey   && existingSNs.has(snKey)
          const imeiDupe = imeiKey && existingIMEIs.has(imeiKey)

          if (snDupe || imeiDupe) {
            const reasons = []
            if (snDupe)   reasons.push(`SN ${item.sn} already in use`)
            if (imeiDupe) reasons.push(`IMEI ${item.imei} already in use`)
            dupes.push(reasons.join(' & '))
          } else {
            unique.push(item)
          }
        }

        if (dupes.length > 0 && unique.length === 0) {
          showToast(`Nothing added — ${dupes.slice(0, 3).join(' · ')}${dupes.length > 3 ? ` · +${dupes.length - 3} more` : ''}`, 'error')
          e.target.value = ''
          return
        }

        setColumns(prev => {
          const existingKeys = new Set(prev.map(c => c.key))
          return [...prev, ...result.columns.filter(c => !existingKeys.has(c.key))]
        })
        setItems(prev => [...prev, ...unique])

        if (dupes.length > 0) {
          showToast(`✓ ${unique.length} added — skipped: ${dupes.slice(0, 2).join(' · ')}${dupes.length > 2 ? ` · +${dupes.length - 2} more` : ''}`, 'error')
        } else {
          showToast(`✓ ${unique.length} row${unique.length !== 1 ? 's' : ''} imported — ${result.columns.length} columns captured.`)
        }
        warnMissingFields(unique)
      } else {
        setColumns(result.columns)
        setItems(result.items)
        showToast(`✓ ${result.items.length} row${result.items.length !== 1 ? 's' : ''} imported — ${result.columns.length} columns captured.`)
        warnMissingFields(result.items)
      }
      setFilterProject('All'); setFilterSite('All'); setFilterStatus('All'); setSearch('')
      setImportHistory(prev => [{
        id:        crypto.randomUUID(),
        date:      new Date().toISOString(),
        filename:  file.name,
        rowCount:  result.items.length,
        columns:   result.columns.map(c => c.label || c.key),
      }, ...prev])
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleClearFilters() {
    setFilterProject('All')
    setFilterSite('All')
    setFilterStatus('All')
    setSearch('')
  }

  async function sendTransferNotification(item, toEmail) {
    const historyEntry = {
      date:      new Date().toISOString(),
      type:      'Transfer',
      fromEmail: item.email || '—',
      toEmail:   toEmail,
      status:    item.status,
      reason:    '',
    }
    const updatedItem = {
      ...item,
      email:           toEmail,
      status:          'Not Started',
      transferHistory: [...(item.transferHistory || []), historyEntry],
    }
    setItems(prev => prev.map(it => it.id === item.id ? updatedItem : it))

    const baseUrl    = window.location.origin
    const acceptUrl  = `${baseUrl}?page=devtrack&action=accept&id=${item.id}`
    const rejectUrl  = `${baseUrl}?page=devtrack&action=reject&id=${item.id}`
    const detailCols = columns.filter(c => c.key !== 'email')
    const details    = detailCols.map(c => `${c.label}: ${updatedItem[c.key] || '—'}`).join('\n')

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
        { to_email: toEmail, subject: 'Device Assignment Notification',
          message: details, dashboard_url: window.location.href,
          accept_url: acceptUrl, reject_url: rejectUrl },
        { publicKey: EMAILJS_PUBLIC_KEY }
      )
      showToast(`✓ Notification sent to ${toEmail}.`)
    } catch {
      showToast('Transferred — email notification failed. Check EmailJS config.', 'error')
    }
  }

  async function handleTransfer() {
    if (!transferEmail.trim()) return
    setTransferSending(true)
    await sendTransferNotification(transferModal, transferEmail.trim())
    setTransferSending(false)
    setTransferModal(null)
    setTransferEmail('')
  }

  async function handleAutoTransfer(item) {
    if (!item.email) {
      setTransferModal(item)
      setTransferEmail('')
      return
    }
    setTransferSending(true)
    await sendTransferNotification(item, item.email)
    setTransferSending(false)
  }

  function confirmReject() {
    const item = reviewModal
    if (!item) return
    const outcomeEntry = { date: new Date().toISOString(), type: 'Rejected', byEmail: item.email, reason: rejectReason.trim() }
    setItems(prev => prev.map(it => {
      if (it.id !== item.id) return it
      return { ...it, status: 'Rejected', transferHistory: [...(it.transferHistory || []), outcomeEntry] }
    }))
    showToast('Device Rejected.')
    setReviewModal(null)
    setRejectReason('')
  }

  async function handleNotify() {
    const detailCols = columns.filter(c => c.key !== 'email')
    const withEmail  = items.filter(i => i.email)
    if (!withEmail.length) { showToast('No email addresses found in the data.', 'error'); return }

    if (EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID') {
      showToast('EmailJS not configured yet — please add your Service ID, Template ID, and Public Key.', 'error')
      return
    }

    const dashboardUrl = window.location.href
    showToast(`Sending ${withEmail.length} notification${withEmail.length !== 1 ? 's' : ''}…`)

    let sent = 0, failed = 0

    const baseUrl = window.location.origin

    for (const item of withEmail) {
      const details = detailCols
        .map(c => `${c.label}: ${item[c.key] || '—'}`)
        .join('\n')

      const acceptUrl = `${baseUrl}?page=devtrack&action=accept&id=${item.id}`
      const rejectUrl = `${baseUrl}?page=devtrack&action=reject&id=${item.id}`

      try {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            to_email:      item.email,
            subject:       'Device Assignment Notification',
            message:       details,
            dashboard_url: dashboardUrl,
            accept_url:    acceptUrl,
            reject_url:    rejectUrl,
          },
          { publicKey: EMAILJS_PUBLIC_KEY }
        )
        sent++
        // log notification in item history
        setItems(prev => prev.map(it => it.id !== item.id ? it : {
          ...it,
          notifiedAt: new Date().toISOString(),
        }))
      } catch (err) {
        console.error('EmailJS error:', err)
        failed++
      }
    }

    if (failed === 0) showToast(`✓ ${sent} notification${sent !== 1 ? 's' : ''} sent successfully.`)
    else showToast(`Sent ${sent}, failed ${failed}. Check console for details.`, 'error')
  }

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: items.filter(i => i.status === s).length }), {})
  const uniqueProjects = Array.from(new Set(items.map(i => i.project).filter(Boolean))).length

  const hasStatus = columns.some(c => c.key === 'status')

  return (
    <div className="dashboard-page">
      <h1>DevTrack</h1>

      {/* ── Toast ────────────────────────────────────────────────── */}
      {toast && (
        <div className={`dt-toast dt-toast-${toast.type}`}>
          {toast.message}
          <button className="dt-toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* ── Transfer Modal ───────────────────────────────────────── */}
      {transferModal && (
        <div className="dt-modal-overlay" onClick={() => setTransferModal(null)}>
          <div className="dt-modal" onClick={e => e.stopPropagation()}>
            <h3 className="dt-modal-title">Transfer Device</h3>
            <p className="dt-modal-sub">
              Current recipient: <strong>{transferModal.email || '—'}</strong>
            </p>
            <label className="dt-modal-label">New recipient email</label>
            <input className="inv-form-input" style={{ width: '100%', marginBottom: 16 }}
              type="email" placeholder="newrecipient@email.com"
              value={transferEmail} onChange={e => setTransferEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTransfer(); if (e.key === 'Escape') setTransferModal(null) }}
              autoFocus />
            <div className="dt-modal-actions">
              <button className="inv-save-btn" onClick={handleTransfer} disabled={transferSending}>
                {transferSending ? 'Sending…' : '↗ Transfer & Notify'}
              </button>
              <button className="inv-cancel-btn" onClick={() => setTransferModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Modal ─────────────────────────────────────────── */}
      {historyModal && (
        <div className="dt-modal-overlay" onClick={() => setHistoryModal(null)}>
          <div className="dt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <h3 className="dt-modal-title">Transfer History</h3>
            <p className="dt-modal-sub">SN: <strong>{historyModal.sn || '—'}</strong> &nbsp;|&nbsp; IMEI: <strong>{historyModal.imei || '—'}</strong></p>
            <table className="build-table inv-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>From</th>
                  <th>To / By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {(historyModal.transferHistory || []).length === 0 ? (
                  <tr><td colSpan={5} className="inv-empty">No history yet.</td></tr>
                ) : (historyModal.transferHistory || []).map((h, i) => (
                  <tr key={i} className="inv-data-row">
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(h.date).toLocaleString()}</td>
                    <td>
                      <span className={`status-badge ${h.type === 'Accepted' ? 'status-completed' : h.type === 'Rejected' ? 'dt-status-blocked' : 'status-on-going'}`}>
                        {h.type || 'Transfer'}
                      </span>
                    </td>
                    <td>{h.fromEmail || '—'}</td>
                    <td>{h.toEmail || h.byEmail || '—'}</td>
                    <td style={{ color: '#64748b', fontStyle: h.reason ? 'normal' : 'italic' }}>{h.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dt-modal-actions" style={{ marginTop: 16 }}>
              <button className="inv-cancel-btn" onClick={() => setHistoryModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection Reason Modal ────────────────────────────────── */}
      {reviewModal?._pendingReject && (
        <div className="dt-modal-overlay">
          <div className="dt-modal" onClick={e => e.stopPropagation()}>
            <h3 className="dt-modal-title">Reject Device Transfer</h3>
            <p className="dt-modal-sub">SN: <strong>{reviewModal.sn || '—'}</strong> &nbsp;|&nbsp; IMEI: <strong>{reviewModal.imei || '—'}</strong></p>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              {columns.filter(c => ['project','config','cmSite','destination'].includes(c.key)).map(c => (
                <div key={c.key} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#94a3b8', minWidth: 100 }}>{c.label}:</span>
                  <strong>{reviewModal[c.key] || '—'}</strong>
                </div>
              ))}
            </div>
            <label className="dt-modal-label">Reason for rejection <span style={{ color: '#94a3b8' }}>(optional)</span></label>
            <textarea
              className="inv-form-input"
              style={{ width: '100%', minHeight: 80, resize: 'vertical', marginBottom: 16 }}
              placeholder="e.g. Device not received, wrong IMEI, duplicate shipment…"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="dt-modal-actions">
              <button className="inv-save-btn" style={{ background: '#ef4444' }} onClick={confirmReject}>
                ✕ Confirm Rejection
              </button>
              <button className="inv-cancel-btn" onClick={() => { setReviewModal(null); setRejectReason('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">Total Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueProjects}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sites.length - 1}</div>
          <div className="stat-label">CM Sites</div>
        </div>
        {hasStatus && <>
          <div className={`stat-card ${counts['Blocked'] > 0 ? 'stat-card-danger' : ''}`}>
            <div className="stat-value">{counts['Blocked'] ?? 0}</div>
            <div className="stat-label">Blocked</div>
          </div>
          <div className="stat-card stat-card-ok">
            <div className="stat-value">{counts['Completed'] ?? 0}</div>
            <div className="stat-label">Completed</div>
          </div>
        </>}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="proj-search-wrap">
          <span className="proj-search-icon">⌕</span>
          <input className="proj-search-input" placeholder="Search all fields…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
          {search && <button className="proj-search-clear" onClick={() => setSearch('')}>×</button>}
        </div>

        <select className="filter-select" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          {projects.map(p => <option key={p} value={p}>{p === 'All' ? 'All Projects' : p}</option>)}
        </select>

        <select className="filter-select" value={filterSite} onChange={e => setFilterSite(e.target.value)}>
          {sites.map(s => <option key={s} value={s}>{s === 'All' ? 'All CM Sites' : s}</option>)}
        </select>

        {hasStatus && statuses.length > 1 && (
          <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            {statuses.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
          </select>
        )}

        <button className="proj-add-btn inv-add-btn" onClick={() => { setForm(emptyForm()); setAdding(true) }} disabled={adding}>
          + Add Item
        </button>

        <label className="dt-import-btn" title="Import from CSV">
          ⬆ Import CSV
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportCSV} />
        </label>

        {items.some(i => i.email) && (
          <button className="dt-notify-btn" onClick={handleNotify} title="Send email notification to each recipient">
            ✉ Notify All
          </button>
        )}

        {(search || filterProject !== 'All' || filterSite !== 'All' || filterStatus !== 'All') && (
          <button className="inv-cancel-btn" style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={handleClearFilters} title="Clear all filters">
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bom-table-wrap">
        <table className="build-table inv-table">
          <thead>
            <tr>
              {columns.map(({ key, label }) => (
                <th key={key} onClick={() => toggleSort(key)} className="sortable-th"
                    style={key === 'status' ? { textAlign: 'center' } : {}}>
                  {label} <SortIcon col={key} />
                </th>
              ))}
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="inv-add-row">
                {columns.map(({ key, label }) => (
                  <td key={key}>
                    {key === 'status'
                      ? <select className="inv-form-input" value={form[key] ?? 'Not Started'}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      : <input className="inv-form-input"
                          type={key === 'shipDate' ? 'date' : 'text'}
                          placeholder={label}
                          value={form[key] ?? ''}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
                          autoFocus={key === columns[0]?.key}
                        />
                    }
                  </td>
                ))}
                <td>
                  <div className="inv-row-actions">
                    <button className="inv-save-btn" onClick={handleAdd} title="Save">✓</button>
                    <button className="inv-cancel-btn" onClick={() => setAdding(false)} title="Cancel">×</button>
                  </div>
                </td>
              </tr>
            )}

            {visible.length === 0 && !adding ? (
              <tr>
                <td colSpan={columns.length + 1} className="inv-empty">
                  {search || filterProject !== 'All' || filterSite !== 'All' || filterStatus !== 'All'
                    ? 'No items match the current filters.'
                    : 'No items yet — click "+ Add Item" or "Import CSV" to start.'}
                </td>
              </tr>
            ) : (
              visible.map(it => {
                const isEditing = editId === it.id
                return (
                  <tr key={it.id} className="inv-data-row">
                    {columns.map(({ key }) => (
                      <td key={key} style={key === 'status' ? { textAlign: 'center' } : {}}>
                        {isEditing
                          ? key === 'status'
                            ? <select className="inv-form-input" value={editDraft[key] ?? 'Not Started'}
                                onChange={e => setEditDraft(d => ({ ...d, [key]: e.target.value }))}>
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            : <input className="inv-form-input"
                                type={key === 'shipDate' ? 'date' : 'text'}
                                value={editDraft[key] ?? ''}
                                onChange={e => setEditDraft(d => ({ ...d, [key]: e.target.value }))}
                              />
                          : key === 'status'
                            ? <span className={`status-badge ${STATUS_CLASS[it.status] ?? 'status-not-started'}`}>
                                {it.status || '—'}
                              </span>
                            : <span>{it[key] || '—'}</span>
                        }
                      </td>
                    ))}
                    <td>
                      {isEditing ? (
                        <div className="inv-row-actions">
                          <button className="inv-save-btn" onClick={saveEdit} title="Save">✓</button>
                          <button className="inv-cancel-btn" onClick={cancelEdit} title="Cancel">×</button>
                        </div>
                      ) : (
                        <div className="inv-row-actions">
                          <button className="inv-save-btn" style={{ background: '#3b82f6' }}
                            onClick={() => startEdit(it)} title="Edit">✎</button>
                          <button className="inv-save-btn" style={{ background: '#8b5cf6' }}
                            onClick={() => handleAutoTransfer(it)}
                            disabled={transferSending}
                            title={it.email ? `Notify ${it.email}` : 'Set recipient & notify'}>↗</button>
                          <button className="inv-save-btn" style={{ background: '#64748b' }}
                            onClick={() => setHistoryModal(it)} title="Transfer History">📋</button>
                          {it.status !== 'Accepted' && (
                            <button className="inv-delete-btn" onClick={() => deleteItem(it.id)} title="Delete">🗑</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr className="bom-total-row">
                <td colSpan={columns.length + 1}>
                  <strong>{visible.length}</strong> of {items.length} items shown
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {/* ── Import History ────────────────────────────────────────── */}
      {importHistory.length > 0 && (
        <div className="dt-history-wrap">
          <button className="dt-history-toggle" onClick={() => setShowHistory(h => !h)}>
            {showHistory ? '▲' : '▼'} Import History ({importHistory.length})
          </button>
          {showHistory && (
            <table className="build-table inv-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>File</th>
                  <th style={{ textAlign: 'center' }}>Rows</th>
                  <th>Columns Captured</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map(h => (
                  <tr key={h.id} className="inv-data-row">
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(h.date).toLocaleString()}</td>
                    <td>{h.filename}</td>
                    <td style={{ textAlign: 'center' }}>{h.rowCount}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{h.columns.join(', ')}</td>
                    <td>
                      <button className="inv-delete-btn"
                        onClick={() => setImportHistory(prev => prev.filter(x => x.id !== h.id))}
                        title="Remove this history entry">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
