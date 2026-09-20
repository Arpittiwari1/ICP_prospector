export function CheckboxGrid({ label, options, selected, onChange, getLabel, getValue }) {
  return (
    <div className="field">
      <span className="field-label">{label}{selected.length > 0 && ` (${selected.length})`}</span>
      <div className="check-pills">
        {options.map(opt => {
          const val = getValue(opt)
          const checked = selected.includes(val)
          return (
            <label key={val} className={`check-pill${checked ? ' selected' : ''}`}>
              <input
                type="checkbox"
                value={val}
                checked={checked}
                onChange={e => onChange(e.target.checked ? [...selected, val] : selected.filter(v => v !== val))}
              />
              {getLabel(opt)}
            </label>
          )
        })}
      </div>
    </div>
  )
}

export function RangeRow({ fields }) {
  return (
    <div className="field-row">
      {fields.map(f => (
        <input
          key={f.id}
          type={f.type || 'number'}
          placeholder={f.placeholder}
          value={f.value || ''}
          onChange={f.onChange}
        />
      ))}
    </div>
  )
}