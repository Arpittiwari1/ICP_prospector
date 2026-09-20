import { useState, useRef, useEffect } from 'react'

export function ChipsInput({
  name,
  values,
  onChange,
  placeholder,
  suggestData,
  getSuggestLabel,
  getSuggestValue,
  resolveToken
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [unmatched, setUnmatched] = useState([])
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const splitMulti = (raw) => String(raw || '').split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean)

  const add = (v) => {
    v = v.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
  }

  const remove = (v) => onChange(values.filter(x => x !== v))

  const addToken = (raw) => {
    const resolved = resolveToken ? resolveToken(raw) : raw.trim()
    if (resolved === null || resolved === undefined) return false
    add(resolved)
    return true
  }

  const addMany = (tokens) => {
    const failed = []
    tokens.forEach(t => { if (!addToken(t)) failed.push(t) })
    if (failed.length) setUnmatched(failed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // If dropdown is open and has suggestions, Enter picks the first one
      if (showSuggest && filtered.length > 0) {
        add(getSuggestValue(filtered[0]))
        setSearchTerm('')
        setShowSuggest(false)
        return
      }
      const parts = splitMulti(e.target.value)
      if (parts.length > 1) addMany(parts)
      else if (parts.length === 1) {
        if (!addToken(parts[0]) && suggestData) setUnmatched([parts[0]])
      }
      e.target.value = ''
      setSearchTerm('')
      setShowSuggest(false)
    } else if (e.key === 'Backspace' && !e.target.value && values.length) {
      remove(values[values.length - 1])
    }
  }

  const handlePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text')
    if (text && /[,;\n\t]/.test(text)) {
      e.preventDefault()
      addMany(splitMulti(text))
      e.target.value = ''
    }
  }

  const filtered = suggestData
    ? suggestData.filter(item => getSuggestLabel(item).toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10)
    : []

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowSuggest(false)
        setUnmatched([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="field" ref={wrapRef}>
      <span className="field-label">
        {name}{values.length > 0 && <> · <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--primary)' }}>{values.length}</span></>}
      </span>
      <div className="chips-input-wrap">
        <div className="chips-input" onClick={() => inputRef.current?.focus()}>
          {values.map((v, i) => (
            <span key={i} className="chip">
              {v}
              <button type="button" className="chip-x" onClick={() => remove(v)}>×</button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            placeholder={values.length ? '' : placeholder}
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setShowSuggest(true) }}
            onFocus={() => setShowSuggest(true)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
          {values.length > 0 && (
            <button type="button" className="chips-clear" title="Clear all" onClick={() => { onChange([]); setUnmatched([]) }}>✕</button>
          )}
        </div>

        {showSuggest && filtered.length > 0 && (
          <div className="suggest">
            {filtered.map(item => (
              <div
                key={getSuggestValue(item)}
                className="suggest-item"
                onMouseDown={e => {
                  e.preventDefault()
                  add(getSuggestValue(item))
                  setSearchTerm('')
                  setShowSuggest(false)
                }}
              >
                {getSuggestLabel(item)}
              </div>
            ))}
          </div>
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="unmatched-panel">
          <div className="unmatched-head">
            <span>⚠ {unmatched.length} unmatched — pick from dropdown</span>
            <button type="button" className="unmatched-dismiss" onClick={() => setUnmatched([])}>✕</button>
          </div>
          <ul className="unmatched-list">
            {unmatched.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}