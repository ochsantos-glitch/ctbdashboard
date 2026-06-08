import { useState, useEffect, useRef } from 'react'

export default function MaterialRequest({ bom = [], inventoryItems = [], setInventoryItems }) {
  const [requests, setRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem('material-requests')) || [] } catch { return [] }
  })
  const [requester, setRequester] = useState('')
  const [material,  setMaterial]  = useState('')
  const [qty,       setQty]       = useState(1)
  const [badgeId,   setBadgeId]   = useState('')
  const badgeRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('material-requests', JSON.stringify(requests))
  }, [requests])

  const materialOptions = [
    ...bom.map(p => ({ id: p.id, label: p.description || p.kpn || p.lab126pn || p.id, source: 'bom' })),
    ...inventoryItems.map(i => ({ id: i.id, label: i.material, source: 'inventory' })),
  ].filter((m, idx, arr) => m.label && arr.findIndex(x => x.label === m.label) === idx)

  const canSubmit = requester.trim() && material && Number(qty) >= 1

  function handleSubmit() {
    if (!canSubmit) return
    setRequests(prev => [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      badgeId:   badgeId.trim(),
      requester: requester.trim(),
      material,
      qty:       Number(qty),
      status:    'Pending',
    }, ...prev])
    setRequester(''); setMaterial(''); setQty(1); setBadgeId('')
  }

  function approveRequest(id) {
    const req = requests.find(r => r.id === id)
    if (!req) return
    setInventoryItems(prev => prev.map(i =>
      i.material?.toLowerCase() === req.material?.toLowerCase()
        ? { ...i, qty: Math.max(0, (i.qty || 0) - req.qty) }
        : i
    ))
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Approved', approvedAt: new Date().toISOString() } : r))
  }

  function rejectRequest(id) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Rejected' } : r))
  }

  const statusChip = status => ({
    background: status === 'Approved' ? '#dcfce7' : status === 'Rejected' ? '#fee2e2' : '#fef9c3',
    color:      status === 'Approved' ? '#15803d' : status === 'Rejected' ? '#b91c1c' : '#a16207',
  })

  return (
    <div className="dashboard-page">
      <h1>Material Requests</h1>

      <div style={{ display:'flex', gap:24, marginBottom:24, alignItems:'flex-start' }}>

        {/* ── Request Form ── */}
        <div style={{ flex:1, background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:24 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
            ⊙ Request Material
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#475569', marginBottom:6 }}>Requester name</label>
              <input className="inv-form-input" style={{ width:'100%', fontSize:14 }}
                placeholder="e.g. Juan dela Cruz"
                value={requester} onChange={e => setRequester(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>

            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#475569', marginBottom:6 }}>Material / item</label>
              <select className="filter-select" style={{ width:'100%', fontSize:14, padding:'8px 12px', height:40 }}
                value={material} onChange={e => setMaterial(e.target.value)}>
                <option value="">— select material —</option>
                {materialOptions.map(m => <option key={m.id} value={m.label}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#475569', marginBottom:6 }}>Quantity</label>
              <input className="inv-form-input" style={{ width:'100%', fontSize:14 }}
                type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} />
            </div>

            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#475569', marginBottom:6 }}>Badge ID</label>
              <div style={{ display:'flex', gap:8 }}>
                <input ref={badgeRef} className="inv-form-input" style={{ flex:1, fontSize:14, fontFamily:'monospace' }}
                  placeholder="Scan or type badge ID"
                  value={badgeId} onChange={e => setBadgeId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                <button className="btn-export" style={{ padding:'8px 16px', fontSize:13 }}
                  onClick={() => badgeRef.current?.focus()} title="Focus badge field for scanner">
                  ⇄ Scan
                </button>
              </div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>Physical badge scanners can scan directly into this field</div>
            </div>

            <button
              style={{ width:'100%', padding:'12px', fontSize:14, marginTop:4, borderRadius:8, border:'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                background: canSubmit ? '#1e293b' : '#e2e8f0', color: canSubmit ? '#fff' : '#94a3b8', fontWeight:600 }}
              onClick={handleSubmit} disabled={!canSubmit}>
              ⊙ Submit request
            </button>
          </div>
        </div>

        {/* ── Recent Activity ── */}
        <div style={{ width:300, background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:24, flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
            ⏱ Recent Activity
          </div>
          {requests.length === 0 ? (
            <div style={{ color:'#94a3b8', fontSize:13, textAlign:'center', marginTop:40 }}>No requests yet</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {requests.slice(0, 5).map(r => (
                <div key={r.id} style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'#1e293b' }}>{r.requester}</span>
                    <span style={{ fontSize:10, padding:'1px 8px', borderRadius:10, fontWeight:600, ...statusChip(r.status) }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#475569' }}>{r.material} × {r.qty}</div>
                  {r.badgeId && <div style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace' }}>Badge: {r.badgeId}</div>}
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{new Date(r.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Request Log ── */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:24 }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
          ≡ Captured Request Log
          {requests.filter(r => r.status === 'Pending').length > 0 && (
            <span style={{ padding:'1px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:'#fef9c3', color:'#a16207' }}>
              {requests.filter(r => r.status === 'Pending').length} pending
            </span>
          )}
        </div>
        <div className="bom-table-wrap">
          <table className="build-table inv-table">
            <thead>
              <tr>
                <th style={{ width:40 }}>#</th>
                <th>Timestamp</th>
                <th>Badge ID</th>
                <th>Requester</th>
                <th>Material</th>
                <th style={{ textAlign:'right' }}>Qty</th>
                <th style={{ textAlign:'center' }}>Status</th>
                <th style={{ width:140 }}></th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={8} className="inv-empty">No records captured yet</td></tr>
              ) : requests.map((r, idx) => (
                <tr key={r.id} className="inv-data-row">
                  <td style={{ color:'#94a3b8', fontSize:12 }}>{requests.length - idx}</td>
                  <td style={{ fontSize:12, color:'#475569' }}>{new Date(r.timestamp).toLocaleString()}</td>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.badgeId || '—'}</td>
                  <td style={{ fontWeight:600 }}>{r.requester}</td>
                  <td style={{ fontSize:13 }}>{r.material}</td>
                  <td style={{ textAlign:'right', fontWeight:700 }}>{r.qty}</td>
                  <td style={{ textAlign:'center' }}>
                    <span style={{ padding:'2px 10px', borderRadius:10, fontSize:11, fontWeight:600, ...statusChip(r.status) }}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === 'Pending' && (
                      <div className="inv-row-actions">
                        <button className="inv-save-btn" style={{ background:'#059669', fontSize:11, padding:'3px 10px' }}
                          onClick={() => approveRequest(r.id)}>✓ Approve</button>
                        <button className="inv-delete-btn" style={{ fontSize:11 }}
                          onClick={() => rejectRequest(r.id)}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
