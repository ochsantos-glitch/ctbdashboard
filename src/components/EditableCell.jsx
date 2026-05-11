import { useState } from 'react'

export default function EditableCell({ value, onChange, min = 0, prefix = '', decimals = 0 }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function open() {
    setDraft(String(value))
    setEditing(true)
  }

  function commit() {
    const n = parseFloat(draft)
    if (!isNaN(n) && n >= min) onChange(n)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        value={draft}
        min={min}
        step={decimals > 0 ? 0.01 : 1}
        autoFocus
        className="inline-edit-input"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  const display = decimals > 0 ? Number(value).toFixed(decimals) : value
  return (
    <span className="editable-val" onClick={open} title="Click to edit">
      {prefix}{display} <span className="edit-hint">✎</span>
    </span>
  )
}
