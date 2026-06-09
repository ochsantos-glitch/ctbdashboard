import { useState, useEffect, useRef } from 'react'

// ── Camera Scanner component ──────────────────────────────────────────────────
function CameraScanner({ onScan, onClose }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const animRef   = useRef(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window

  useEffect(() => {
    let detector
    let cancelled = false

    async function start() {
      try {
        if (hasBarcodeDetector) {
          detector = new window.BarcodeDetector({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'codabar', 'itf']
          })
        }

        // Try back camera first (mobile), fall back to any camera (desktop)
        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true })
        }

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
        if (detector) {
          const scan = async () => {
            if (cancelled || !videoRef.current) return
            if (videoRef.current.readyState >= 2) {
              try {
                const codes = await detector.detect(videoRef.current)
                if (codes.length > 0) { onScan(codes[0].rawValue); return }
              } catch {}
            }
            animRef.current = requestAnimationFrame(scan)
          }
          animRef.current = requestAnimationFrame(scan)
        }
      } catch (err) {
        if (!cancelled) {
          if (err.name === 'NotAllowedError') {
            setError('Camera permission denied. Click the camera icon in your browser address bar to allow access.')
          } else if (err.name === 'NotFoundError') {
            setError('No camera found on this device.')
          } else {
            setError(`Camera error: ${err.message}`)
          }
        }
      }
    }

    start()
    return () => {
      cancelled = true
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [hasBarcodeDetector, onScan])

  return (
    <div style={{ padding: '0 0 8px' }}>
      {error ? (
        <div style={{ color: '#ef4444', fontSize: 13, padding: '12px 0' }}>{error}</div>
      ) : (
        <>
          <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block' }}
            muted playsInline />
          {ready && !hasBarcodeDetector && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, textAlign: 'center' }}>
              Auto-detection not supported in this browser — use a physical scanner or type the badge ID manually.
            </div>
          )}
          {ready && hasBarcodeDetector && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
              Hold the badge barcode or QR code up to the camera
            </div>
          )}
          {!ready && !error && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 12 }}>Starting camera…</div>
          )}
        </>
      )}
    </div>
  )
}

export default function MaterialRequest({ bom = [], inventoryItems = [], setInventoryItems }) {
  const [requests, setRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem('material-requests')) || [] } catch { return [] }
  })
  const [requester, setRequester] = useState('')
  const [material,  setMaterial]  = useState('')
  const [qty,       setQty]       = useState(1)
  const [badgeId,   setBadgeId]   = useState('')
  const [scanning,  setScanning]  = useState(false)
  const [scanError, setScanError] = useState('')
  const badgeRef = useRef(null)

  function stopScanner() { setScanning(false) }
  function startScanner() { setScanError(''); setScanning(true) }
  function handleScan(code) { setBadgeId(code); setScanning(false) }

  useEffect(() => {
    localStorage.setItem('material-requests', JSON.stringify(requests))
  }, [requests])

  const materialOptions = [
    ...bom.map(p => ({ id: p.id, pn: p.kpn || p.lab126pn || p.id, description: p.description || '', source: 'bom' })),
    ...inventoryItems.map(i => ({ id: i.id, pn: i.material, description: '', source: 'inventory' })),
  ].filter((m, idx, arr) => m.pn && arr.findIndex(x => x.pn === m.pn) === idx)

  const selectedPart = materialOptions.find(m => m.pn === material) ?? null

  const canSubmit = requester.trim() && material && Number(qty) >= 1

  function handleSubmit() {
    if (!canSubmit) return
    setRequests(prev => [{
      id:          crypto.randomUUID(),
      timestamp:   new Date().toISOString(),
      badgeId:     badgeId.trim(),
      requester:   requester.trim(),
      material:    material,
      description: selectedPart?.description || '',
      qty:         Number(qty),
      status:      'Pending',
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
                <option value="">— select PN —</option>
                {materialOptions.map(m => <option key={m.id} value={m.pn}>{m.pn}</option>)}
              </select>
            </div>

            {selectedPart && (
              <div>
                <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#475569', marginBottom:6 }}>Description</label>
                <div style={{ padding:'8px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, fontSize:14, color: selectedPart.description ? '#1e293b' : '#94a3b8' }}>
                  {selectedPart.description || '—'}
                </div>
              </div>
            )}

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
                  onClick={startScanner} title="Open camera to scan badge">
                  📷 Scan
                </button>
              </div>
              {scanError && <div style={{ fontSize:11, color:'#ef4444', marginTop:4 }}>{scanError}</div>}
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>Camera scan or use a physical badge scanner</div>
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
                <th>PN</th>
                <th>Description</th>
                <th style={{ textAlign:'right' }}>Qty</th>
                <th style={{ textAlign:'center' }}>Status</th>
                <th style={{ width:140 }}></th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={9} className="inv-empty">No records captured yet</td></tr>
              ) : requests.map((r, idx) => (
                <tr key={r.id} className="inv-data-row">
                  <td style={{ color:'#94a3b8', fontSize:12 }}>{requests.length - idx}</td>
                  <td style={{ fontSize:12, color:'#475569' }}>{new Date(r.timestamp).toLocaleString()}</td>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.badgeId || '—'}</td>
                  <td style={{ fontWeight:600 }}>{r.requester}</td>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.material}</td>
                  <td style={{ fontSize:12, color:'#475569' }}>{r.description || '—'}</td>
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

      {/* ── Camera Scanner Modal ── */}
      {scanning && (
        <div className="modal-overlay" onClick={stopScanner}>
          <div className="edit-config-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="edit-config-header">
              <h3>Scan Badge</h3>
              <button className="modal-close-btn" onClick={stopScanner}>✕</button>
            </div>
            <div style={{ padding: '12px 0 4px' }}>
              <CameraScanner onScan={handleScan} onClose={stopScanner} />
            </div>
            <div className="edit-config-actions">
              <button className="btn-cancel-modal" onClick={stopScanner}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
