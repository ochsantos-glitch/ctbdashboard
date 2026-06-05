import { useState, useEffect } from 'react'
import emailjs from '@emailjs/browser'

const EMAILJS_SERVICE_ID  = 'service_gvib8r2'
const EMAILJS_TEMPLATE_ID = 'template_m2ws09m'
const EMAILJS_PUBLIC_KEY  = 'ORvGP0xa6uEimVFBu'

const STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Pending Transfer', 'Accepted', 'Rejected']

const DEFAULT_REQUEST_TYPES = ['Allocation', 'Materials']
function getCustomRequestTypes() {
  try { return JSON.parse(localStorage.getItem('dt-custom-request-types')) || [] } catch { return [] }
}
function addCustomRequestType(t) {
  const cur = getCustomRequestTypes()
  if (!cur.includes(t)) localStorage.setItem('dt-custom-request-types', JSON.stringify([...cur, t]))
}
function allRequestTypes() { return [...DEFAULT_REQUEST_TYPES, ...getCustomRequestTypes()] }
const REQUEST_TYPE_COLORS = {
  'Allocation': { bg: '#dbeafe', text: '#1d4ed8' },
  'Materials':  { bg: '#dcfce7', text: '#15803d' },
}
function requestTypeColor(t) { return REQUEST_TYPE_COLORS[t] ?? { bg: '#ede9fe', text: '#6d28d9' } }

function RequestTypeSelect({ value, onChange }) {
  const [types,  setTypes]  = useState(allRequestTypes)
  const [adding, setAdding] = useState(false)
  const [draft,  setDraft]  = useState('')

  function confirm() {
    const t = draft.trim()
    if (t && !types.includes(t)) { addCustomRequestType(t); setTypes(allRequestTypes()); onChange(t) }
    else if (t) onChange(t)
    setDraft(''); setAdding(false)
  }

  if (adding) return (
    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="New type…"
        className="inv-form-input" style={{ width:100 }}
        onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }} />
      <button className="inv-save-btn" onClick={confirm}>✓</button>
      <button className="inv-cancel-btn" onClick={() => { setAdding(false); setDraft('') }}>×</button>
    </div>
  )

  return (
    <select className="inv-form-input" value={value || ''}
      onChange={e => e.target.value === '__add__' ? setAdding(true) : onChange(e.target.value)}>
      <option value="">— None —</option>
      {types.map(t => <option key={t} value={t}>{t}</option>)}
      <option value="__add__">＋ Add type…</option>
    </select>
  )
}

function getCustomCompanies() {
  try { return JSON.parse(localStorage.getItem('dt-custom-companies')) || [] } catch { return [] }
}
function addCustomCompany(c) {
  const cur = getCustomCompanies()
  if (!cur.includes(c)) localStorage.setItem('dt-custom-companies', JSON.stringify([...cur, c]))
}
function allCompanies() { return getCustomCompanies() }

function CompanySelect({ value, onChange }) {
  const [companies, setCompanies] = useState(allCompanies)
  const [adding,    setAdding]    = useState(false)
  const [draft,     setDraft]     = useState('')

  function confirm() {
    const c = draft.trim()
    if (c && !companies.includes(c)) { addCustomCompany(c); setCompanies(allCompanies()); onChange(c) }
    else if (c) onChange(c)
    setDraft(''); setAdding(false)
  }

  if (adding) return (
    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="Company name…"
        className="inv-form-input" style={{ width:110 }}
        onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }} />
      <button className="inv-save-btn" onClick={confirm}>✓</button>
      <button className="inv-cancel-btn" onClick={() => { setAdding(false); setDraft('') }}>×</button>
    </div>
  )

  return (
    <select className="inv-form-input" value={value || ''}
      onChange={e => e.target.value === '__add__' ? setAdding(true) : onChange(e.target.value)}>
      <option value="">— None —</option>
      {companies.map(c => <option key={c} value={c}>{c}</option>)}
      <option value="__add__">＋ Add company…</option>
    </select>
  )
}

const STATUS_CLASS = {
  'Not Started':      'status-not-started',
  'In Progress':      'status-on-going',
  'Blocked':          'dt-status-blocked',
  'Completed':        'status-completed',
  'Pending Transfer': 'status-on-going',
  'Accepted':         'status-completed',
  'Rejected':         'dt-status-blocked',
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
  const [filterProject, setFilterProject] = useState('')
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
  const [transferReason,   setTransferReason]   = useState('')
  const [transferSending,  setTransferSending]  = useState(false)
  const [historyModal,     setHistoryModal]     = useState(null)
  const [reviewModal,        setReviewModal]        = useState(null)
  const [rejectReason,       setRejectReason]       = useState('')
  const [confirmAcceptModal, setConfirmAcceptModal] = useState(null)
  const [myEmail,          setMyEmail]          = useState(() => localStorage.getItem('devtrack-my-email') || 'devicetracker53@gmail.com')
  const [editMyEmail,      setEditMyEmail]      = useState(false)
  const [myEmailDraft,     setMyEmailDraft]     = useState('')
  const [importResult,     setImportResult]     = useState(null)

  useEffect(() => { localStorage.setItem('devtrack-cols',    JSON.stringify(columns))       }, [columns])
  useEffect(() => { localStorage.setItem('devtrack-items',   JSON.stringify(items))         }, [items])
  useEffect(() => { localStorage.setItem('devtrack-history', JSON.stringify(importHistory)) }, [importHistory])
  useEffect(() => { localStorage.setItem('devtrack-my-email', myEmail)                      }, [myEmail])

  // ── 2-day reminder check on load ─────────────────────────────────────────────
  useEffect(() => {
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const pending = items.filter(it =>
      it.email &&
      it.status !== 'Accepted' &&
      it.status !== 'Rejected' &&
      it.notifiedAt &&
      now - new Date(it.notifiedAt).getTime() >= TWO_DAYS_MS &&
      (!it.lastReminderSentAt || now - new Date(it.lastReminderSentAt).getTime() >= TWO_DAYS_MS)
    )
    if (!pending.length) return

    const baseUrl    = window.location.origin
    const detailCols = columns.filter(c => c.key !== 'email')
    const originatorEmail = localStorage.getItem('devtrack-my-email') || ''

    async function sendReminders() {
      let sent = 0
      for (const item of pending) {
        const details   = detailCols.map(c => `${c.label}: ${item[c.key] || '—'}`).join('\n')
        const acceptUrl = `${baseUrl}?page=msdevtrack&action=accept&id=${item.id}`
        const rejectUrl = `${baseUrl}?page=msdevtrack&action=reject&id=${item.id}`
        const subject   = `Reminder: Device Assignment Pending — ${item.sn || item.imei || 'Device'}`
        const message   = `This is a 2-day reminder. The following device is still awaiting your response:\n\n${details}`
        try {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
            { to_email: item.email, subject, message, dashboard_url: `${window.location.origin}?page=msdevtrack`, accept_url: acceptUrl, reject_url: rejectUrl },
            { publicKey: EMAILJS_PUBLIC_KEY })
          if (originatorEmail && originatorEmail !== item.email) {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
              { to_email: originatorEmail, subject: `[Originator Copy] ${subject}`,
                message: `Recipient ${item.email} has not yet responded.\n\n${details}`,
                dashboard_url: `${window.location.origin}?page=msdevtrack`, accept_url: acceptUrl, reject_url: rejectUrl },
              { publicKey: EMAILJS_PUBLIC_KEY })
          }
          sent++
        } catch {}
      }
      if (sent > 0) {
        setItems(prev => prev.map(it =>
          pending.some(p => p.id === it.id)
            ? { ...it, lastReminderSentAt: new Date().toISOString() }
            : it
        ))
        showToast(`⏰ ${sent} reminder${sent !== 1 ? 's' : ''} sent for pending devices (2-day follow-up).`)
      }
    }
    sendReminders()
  }, [])

function doAccept(item) {
    const outcomeEntry = { date: new Date().toISOString(), type: 'Accepted', byEmail: item.email, reason: '' }
    setItems(prev => prev.map(it =>
      it.id === item.id ? { ...it, status: 'Accepted', transferHistory: [...(it.transferHistory || []), outcomeEntry] } : it
    ))
    showToast('Device Accepted successfully.')
    setConfirmAcceptModal(null)
  }

  useEffect(() => {
    const { action, id } = pendingAction
    if (!action || !id) return
    if (action === 'accept') {
      setItems(prev => {
        const item = prev.find(it => it.id === id)
        if (item) setConfirmAcceptModal(item)
        return prev
      })
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

  const projects  = Array.from(new Set(items.map(i => i.project).filter(Boolean))).sort()
  const sites     = ['All', ...Array.from(new Set(items.map(i => i.cmSite).filter(Boolean))).sort()]
  const statuses  = ['All', ...Array.from(new Set(items.map(i => i.status).filter(Boolean))).sort()]

  const visible = !filterProject ? [] : [...items]
    .filter(it =>
      (it.project ?? '').toLowerCase() === filterProject.toLowerCase() &&
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
    setItems(prev => prev.map(it => {
      if (it.id !== editId) return it
      const updated = { ...it, ...editDraft }
      const entries = []
      if (editDraft.status && editDraft.status !== it.status) {
        entries.push({
          date:      new Date().toISOString(),
          type:      'Status Change',
          fromEmail: it.email || '—',
          toEmail:   '',
          reason:    `${it.status || '—'} → ${editDraft.status}`,
        })
      }
      if (editDraft.email && editDraft.email !== it.email) {
        entries.push({
          date:      new Date().toISOString(),
          type:      'Recipient Change',
          fromEmail: it.email || '—',
          toEmail:   editDraft.email,
          reason:    '',
        })
      }
      if (entries.length) updated.transferHistory = [...(it.transferHistory || []), ...entries]
      return updated
    }))
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
    const t0 = Date.now()
    const reader = new FileReader()
    reader.onload = evt => {
      const result = parseCSV(evt.target.result)
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

      if (result.error) {
        setImportResult({ ok: false, filename: file.name, error: result.error, elapsed })
        e.target.value = ''
        return
      }

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
          if (snDupe)   reasons.push(`SN ${item.sn}`)
          if (imeiDupe) reasons.push(`IMEI ${item.imei}`)
          dupes.push(reasons.join(' & '))
        } else {
          unique.push(item)
        }
      }

      if (unique.length > 0) {
        setColumns(prev => {
          const existingKeys = new Set(prev.map(c => c.key))
          return [...prev, ...result.columns.filter(c => !existingKeys.has(c.key))]
        })
        setItems(prev => [...prev, ...unique])
        warnMissingFields(unique)
        autoNotifyImported(unique, result.columns)
      }

      setFilterProject(''); setFilterSite('All'); setFilterStatus('All'); setSearch('')
      setImportHistory(prev => [{
        id:       crypto.randomUUID(),
        date:     new Date().toISOString(),
        filename: file.name,
        rowCount: unique.length,
        columns:  result.columns.map(c => c.label || c.key),
      }, ...prev])

      const recipients = [...new Set(unique.map(i => i.email).filter(Boolean))]
      setImportResult({
        ok:         unique.length > 0,
        filename:   file.name,
        added:      unique.length,
        dupes,
        elapsed,
        timestamp:  new Date().toISOString(),
        byEmail:    myEmail,
        recipients,
        snCount:    unique.filter(i => i.sn).length,
        imeiCount:  unique.filter(i => i.imei).length,
      })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleClearFilters() {
    setFilterProject('')
    setFilterSite('All')
    setFilterStatus('All')
    setSearch('')
  }

  async function sendTransferNotification(item, toEmail, reason = '') {
    const baseUrl    = window.location.origin
    const acceptUrl  = `${baseUrl}?page=msdevtrack&action=accept&id=${item.id}`
    const rejectUrl  = `${baseUrl}?page=msdevtrack&action=reject&id=${item.id}`
    const detailCols = columns.filter(c => c.key !== 'email')

    const historyEntry = {
      date:      new Date().toISOString(),
      type:      'Transfer',
      fromEmail: myEmail || item.email || '—',
      toEmail:   toEmail,
      status:    item.status,
      reason:    reason.trim(),
    }
    const updatedItem = {
      ...item,
      email:           toEmail,
      status:          'Pending Transfer',
      notifiedAt:      new Date().toISOString(),
      lastReminderSentAt: null,
      transferHistory: [...(item.transferHistory || []), historyEntry],
    }
    const details = detailCols.map(c => `${c.label}: ${updatedItem[c.key] || '—'}`).join('\n')

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
        { to_email: toEmail, subject: 'Device Assignment Notification',
          message: details, dashboard_url: `${window.location.origin}?page=msdevtrack`,
          accept_url: acceptUrl, reject_url: rejectUrl },
        { publicKey: EMAILJS_PUBLIC_KEY }
      )
      setItems(prev => prev.map(it => it.id === item.id ? updatedItem : it))
      showToast(`✓ Notification sent to ${toEmail}.`)
    } catch {
      showToast('Email failed — status not changed. Check EmailJS quota or config.', 'error')
    }
  }

  async function handleTransfer() {
    if (!transferEmail.trim()) return
    if (!transferReason.trim()) { showToast('Please enter a reason for the transfer.', 'error'); return }
    setTransferSending(true)
    await sendTransferNotification(transferModal, transferEmail.trim(), transferReason)
    setTransferSending(false)
    setTransferModal(null)
    setTransferEmail('')
    setTransferReason('')
  }

  function handleAutoTransfer(item) {
    setTransferModal(item)
    setTransferEmail(item.email || '')
    setTransferReason('')
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

  async function autoNotifyImported(importedItems, importedCols) {
    const withEmail = importedItems.filter(i => i.email)
    if (!withEmail.length) return
    const detailCols = importedCols.filter(c => c.key !== 'email')
    const baseUrl = window.location.origin
    let sent = 0
    for (const item of withEmail) {
      const details    = detailCols.map(c => `${c.label}: ${item[c.key] || '—'}`).join('\n')
      const acceptUrl  = `${baseUrl}?page=msdevtrack&action=accept&id=${item.id}`
      const rejectUrl  = `${baseUrl}?page=msdevtrack&action=reject&id=${item.id}`
      try {
        await emailjs.send(
          EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
          { to_email: item.email, subject: 'Device Assignment Notification',
            message: details, dashboard_url: `${window.location.origin}?page=msdevtrack`,
            accept_url: acceptUrl, reject_url: rejectUrl },
          { publicKey: EMAILJS_PUBLIC_KEY }
        )
        setItems(prev => prev.map(it => it.id === item.id
          ? { ...it, status: 'Pending Transfer', notifiedAt: new Date().toISOString(), lastReminderSentAt: null }
          : it))
        sent++
      } catch {}
    }
    if (sent > 0) showToast(`✓ ${sent} notification${sent !== 1 ? 's' : ''} auto-sent to recipients.`)
  }

  async function handleNotify() {
    const detailCols = columns.filter(c => c.key !== 'email')
    const withEmail  = items.filter(i => i.email && i.status?.toLowerCase() === 'pending transfer')
    if (!withEmail.length) { showToast('No "Pending Transfer" items to notify.', 'error'); return }

    if (EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID') {
      showToast('EmailJS not configured yet — please add your Service ID, Template ID, and Public Key.', 'error')
      return
    }

    const dashboardUrl = `${window.location.origin}?page=msdevtrack`
    showToast(`Sending ${withEmail.length} notification${withEmail.length !== 1 ? 's' : ''}…`)

    let sent = 0, failed = 0, lastErr = ''

    const baseUrl = window.location.origin

    for (const item of withEmail) {
      const details = detailCols
        .map(c => `${c.label}: ${item[c.key] || '—'}`)
        .join('\n')

      const acceptUrl = `${baseUrl}?page=msdevtrack&action=accept&id=${item.id}`
      const rejectUrl = `${baseUrl}?page=msdevtrack&action=reject&id=${item.id}`

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
        lastErr = err?.text || err?.message || JSON.stringify(err) || 'Unknown error'
        failed++
      }
    }

    if (failed === 0) showToast(`✓ ${sent} notification${sent !== 1 ? 's' : ''} sent successfully.`)
    else showToast(`Sent ${sent}, failed ${failed}: ${lastErr}`, 'error')
  }

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: items.filter(i => i.status === s).length }), {})
  const uniqueProjects = Array.from(new Set(items.map(i => i.project).filter(Boolean))).length

  const hasStatus = columns.some(c => c.key === 'status')

  return (
    <div className="dashboard-page">
      <h1>MSDevTrack</h1>

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
            <input className="inv-form-input" style={{ width: '100%', marginBottom: 12 }}
              type="email" placeholder="newrecipient@email.com"
              value={transferEmail} onChange={e => setTransferEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setTransferModal(null) }}
              autoFocus />
            <label className="dt-modal-label">Reason for transfer request <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea className="inv-form-input"
              style={{ width: '100%', minHeight: 70, resize: 'vertical', marginBottom: 16 }}
              placeholder="e.g. Device reassigned, wrong recipient, project change…"
              value={transferReason} onChange={e => setTransferReason(e.target.value)} />
            <div className="dt-modal-actions">
              <button className="inv-save-btn" onClick={handleTransfer} disabled={transferSending || !transferReason.trim()}>
                {transferSending ? 'Sending…' : '↗ Transfer & Notify'}
              </button>
              <button className="inv-cancel-btn" onClick={() => { setTransferModal(null); setTransferReason('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Result Modal ───────────────────────────────────── */}
      {importResult && (
        <div className="dt-modal-overlay" onClick={() => setImportResult(null)}>
          <div className="dt-import-result-modal" onClick={e => e.stopPropagation()}>
            <div className={`dt-import-result-icon-wrap ${importResult.ok ? 'ok' : 'err'}`}>
              <span>{importResult.ok ? '✓' : '✕'}</span>
            </div>
            <div className={`dt-import-result-badge ${importResult.ok ? 'ok' : 'err'}`}>
              {importResult.ok ? 'Import successful' : 'Import failed'}
            </div>
            <h3 className="dt-import-result-title">
              {importResult.ok ? 'File imported' : 'Import error'}
            </h3>
            <p className="dt-import-result-desc">
              {importResult.ok
                ? importResult.dupes?.length > 0
                  ? `${importResult.added} row${importResult.added !== 1 ? 's' : ''} added. ${importResult.dupes.length} duplicate${importResult.dupes.length !== 1 ? 's' : ''} skipped — SN or IMEI already exists.`
                  : 'Your file was processed and imported without any issues.'
                : importResult.error || 'Something went wrong. The file could not be imported.'}
            </p>
            <div className="dt-import-result-divider" />
            <div className="dt-import-result-details">
              <div className="dt-import-detail-row">
                <span className="dt-import-detail-icon">📄</span>
                <span>{importResult.filename}</span>
              </div>
              {importResult.ok && (
                <div className="dt-import-detail-row">
                  <span className="dt-import-detail-icon">🗄</span>
                  <span>{importResult.added.toLocaleString()} row{importResult.added !== 1 ? 's' : ''} imported</span>
                </div>
              )}
              {importResult.dupes?.length > 0 && (
                <div className="dt-import-detail-row" style={{ color: '#d97706' }}>
                  <span className="dt-import-detail-icon">⚠</span>
                  <span>{importResult.dupes.length} duplicate{importResult.dupes.length !== 1 ? 's' : ''} skipped</span>
                </div>
              )}
              <div className="dt-import-detail-row">
                <span className="dt-import-detail-icon">⏱</span>
                <span>Completed in {importResult.elapsed}s</span>
              </div>
            </div>
            <button className="inv-save-btn" style={{ marginTop: 20, width: '100%' }} onClick={() => setImportResult(null)}>Done</button>
          </div>
        </div>
      )}

      {/* ── History Modal ─────────────────────────────────────────── */}
      {historyModal && (
        <div className="dt-modal-overlay" onClick={() => setHistoryModal(null)}>
          <div className="dt-import-result-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '92vw', maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="dt-import-result-icon-wrap" style={{ background: '#ede9fe', color: '#7c3aed', margin: '0 auto 12px' }}>⏱</div>
            <div className="dt-import-result-badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>History</div>
            <h3 className="dt-import-result-title" style={{ fontSize: 15, marginTop: 10 }}>
              SN: {historyModal.sn || '—'} &nbsp;|&nbsp; IMEI: {historyModal.imei || '—'}
            </h3>
            <div className="dt-import-result-divider" />

            {(() => {
              const history = historyModal.transferHistory || []
              const hasTransfer = history.some(h => h.type === 'Transfer')

              if (!hasTransfer) {
                const acceptedEntry = history.find(h => h.type === 'Accepted')
                const isAccepted    = historyModal.status === 'Accepted'
                const isPending     = historyModal.status === 'Pending Transfer'
                return (
                  <div className="dt-import-result-details">
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">📅</span>
                      <span><strong>Date Loaded:</strong> {historyModal.createdAt ? new Date(historyModal.createdAt).toLocaleString() : '—'}</span>
                    </div>
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">📤</span>
                      <span><strong>From:</strong> {myEmail || '—'}</span>
                    </div>
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">📥</span>
                      <span><strong>To:</strong> {isAccepted ? (historyModal.email || '—') : 'N/A'}</span>
                    </div>
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">🔖</span>
                      <span>
                        <strong>Status:</strong>{' '}
                        <span style={{ color: isPending ? '#dc2626' : isAccepted ? '#16a34a' : '#475569', fontWeight: 600 }}>
                          {historyModal.status || '—'}
                        </span>
                      </span>
                    </div>
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">✅</span>
                      <span><strong>Date Accepted:</strong> {acceptedEntry ? new Date(acceptedEntry.date).toLocaleString() : '—'}</span>
                    </div>
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">🔄</span>
                      <span><strong>Transfer to:</strong> N/A — no transfer requested</span>
                    </div>
                    <div className="dt-import-detail-row">
                      <span className="dt-import-detail-icon">📝</span>
                      <span><strong>Reason for transfer:</strong> —</span>
                    </div>
                  </div>
                )
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {history.map((h, i) => (
                    <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span className={`status-badge ${h.type === 'Accepted' ? 'status-completed' : h.type === 'Rejected' ? 'dt-status-blocked' : 'status-on-going'}`} style={{ fontSize: 11 }}>
                          {h.type || 'Transfer'}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(h.date).toLocaleString()}</span>
                      </div>
                      <div className="dt-import-result-details">
                        <div className="dt-import-detail-row">
                          <span className="dt-import-detail-icon">📤</span>
                          <span><strong>From:</strong> {h.fromEmail || '—'}</span>
                        </div>
                        <div className="dt-import-detail-row">
                          <span className="dt-import-detail-icon">📥</span>
                          <span><strong>To:</strong> {h.toEmail || h.byEmail || '—'}</span>
                        </div>
                        <div className="dt-import-detail-row">
                          <span className="dt-import-detail-icon">🔖</span>
                          <span>
                            <strong>Status:</strong>{' '}
                            <span style={{ color: h.type === 'Transfer' ? '#dc2626' : h.type === 'Accepted' ? '#16a34a' : '#475569', fontWeight: 600 }}>
                              {h.type === 'Transfer' ? 'Pending Transfer' : h.type}
                            </span>
                          </span>
                        </div>
                        {h.type === 'Accepted' && (
                          <div className="dt-import-detail-row">
                            <span className="dt-import-detail-icon">✅</span>
                            <span><strong>Date Accepted:</strong> {new Date(h.date).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="dt-import-detail-row">
                          <span className="dt-import-detail-icon">🔄</span>
                          <span><strong>Transfer to:</strong> {h.toEmail || 'N/A'}</span>
                        </div>
                        <div className="dt-import-detail-row">
                          <span className="dt-import-detail-icon">📝</span>
                          <span style={{ color: h.reason ? '#1e293b' : '#94a3b8', fontStyle: h.reason ? 'normal' : 'italic' }}>
                            <strong>Reason for transfer:</strong> {h.reason || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            <button className="inv-cancel-btn" style={{ marginTop: 20, width: '100%' }} onClick={() => setHistoryModal(null)}>Close</button>
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

      {/* ── Confirm Accept Modal ─────────────────────────────────── */}
      {confirmAcceptModal && (
        <div className="dt-modal-overlay">
          <div className="dt-modal" onClick={e => e.stopPropagation()}>
            <h3 className="dt-modal-title">Confirm Acceptance</h3>
            <p className="dt-modal-sub">SN: <strong>{confirmAcceptModal.sn || '—'}</strong> &nbsp;|&nbsp; IMEI: <strong>{confirmAcceptModal.imei || '—'}</strong></p>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              {columns.filter(c => ['project','config','cmSite','destination'].includes(c.key)).map(c => (
                <div key={c.key} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#94a3b8', minWidth: 100 }}>{c.label}:</span>
                  <strong>{confirmAcceptModal[c.key] || '—'}</strong>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>Are you sure you would like to accept this device?</p>
            <div className="dt-modal-actions">
              <button className="inv-save-btn" style={{ background: '#22c55e' }} onClick={() => doAccept(confirmAcceptModal)}>
                ✓ Yes, Accept
              </button>
              <button className="inv-cancel-btn" onClick={() => setConfirmAcceptModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}


      {/* ── Originator email (for reminders) ─────────────────────── */}
      <div className="dt-my-email-bar">
        <span className="dt-my-email-label">⏰ Reminder originator email:</span>
        {editMyEmail ? (
          <>
            <input className="inv-form-input" type="email" placeholder="your@email.com"
              value={myEmailDraft} onChange={e => setMyEmailDraft(e.target.value)}
              autoFocus style={{ width: 220 }}
              onKeyDown={e => {
                if (e.key === 'Enter') { setMyEmail(myEmailDraft.trim()); setEditMyEmail(false) }
                if (e.key === 'Escape') setEditMyEmail(false)
              }} />
            <button className="inv-save-btn" onClick={() => { setMyEmail(myEmailDraft.trim()); setEditMyEmail(false) }}>✓</button>
            <button className="inv-cancel-btn" onClick={() => setEditMyEmail(false)}>×</button>
          </>
        ) : (
          <>
            <span className="dt-my-email-val">{myEmail || <em style={{ color: '#94a3b8' }}>not set</em>}</span>
            <button className="bm-pcard-stage-pencil" style={{ fontSize: 13 }}
              onClick={() => { setMyEmailDraft(myEmail); setEditMyEmail(true) }}>✎</button>
          </>
        )}
        <span className="dt-my-email-hint">— you'll receive a copy when a 2-day reminder fires</span>
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
          <option value=''>— Select a project —</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
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

        {items.some(i => i.email && i.status?.toLowerCase() === 'pending transfer') && (
          <button className="dt-notify-btn" onClick={handleNotify} title="Send email notification to all Pending Transfer recipients">
            ✉ Notify Pending
          </button>
        )}

        {(search || filterProject || filterSite !== 'All' || filterStatus !== 'All') && (
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
              <th style={{ minWidth: 120, textAlign: 'center' }} onClick={() => toggleSort('requestType')} className="sortable-th">
                Request Type <SortIcon col="requestType" />
              </th>
              <th style={{ minWidth: 120, textAlign: 'center' }} onClick={() => toggleSort('company')} className="sortable-th">
                Company <SortIcon col="company" />
              </th>
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
                  <RequestTypeSelect value={form.requestType ?? ''} onChange={v => setForm(f => ({ ...f, requestType: v }))} />
                </td>
                <td>
                  <CompanySelect value={form.company ?? ''} onChange={v => setForm(f => ({ ...f, company: v }))} />
                </td>
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
                  {!filterProject
                    ? 'Select a project to view its devices.'
                    : 'No items match the current filters.'}
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
                            ? <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span className={`status-badge ${STATUS_CLASS[it.status] ?? 'status-not-started'}`}>
                                  {it.status || '—'}
                                </span>
                                {it.status === 'Accepted' && (() => {
                                  const entry = [...(it.transferHistory || [])].reverse().find(h => h.type === 'Accepted')
                                  return entry
                                    ? <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {new Date(entry.date).toLocaleString()}
                                      </span>
                                    : null
                                })()}
                              </span>
                            : <span>{it[key] || '—'}</span>
                        }
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      {isEditing
                        ? <RequestTypeSelect value={editDraft.requestType ?? ''} onChange={v => setEditDraft(d => ({ ...d, requestType: v }))} />
                        : it.requestType
                          ? <span style={{ padding:'2px 10px', borderRadius:12, fontSize:11, fontWeight:600, whiteSpace:'nowrap', background: requestTypeColor(it.requestType).bg, color: requestTypeColor(it.requestType).text }}>{it.requestType}</span>
                          : <span style={{ color:'#94a3b8' }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditing
                        ? <CompanySelect value={editDraft.company ?? ''} onChange={v => setEditDraft(d => ({ ...d, company: v }))} />
                        : it.company
                          ? <span style={{ padding:'2px 10px', borderRadius:12, fontSize:11, fontWeight:600, whiteSpace:'nowrap', background:'#fff7ed', color:'#c2410c' }}>{it.company}</span>
                          : <span style={{ color:'#94a3b8' }}>—</span>
                      }
                    </td>
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
                            onClick={() => setHistoryModal(it)} title="History">📋</button>
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
