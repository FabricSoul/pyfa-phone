import { useState } from 'react'
import { _t } from '../i18n/t'
import { fmt } from './format'

export function ExtraQuantity({ label, item, value, min, max = Number.MAX_SAFE_INTEGER, editable, suffix, onChange }: {
  label: string
  item: string
  value: number
  min: number
  max?: number
  editable?: boolean
  suffix?: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string>()
  return <div className="fit-stepper">
    <span className="fit-caption">{label}</span>
    <div className="fit-stepper-controls">
      <button type="button" className="fit-button" disabled={value <= min}
        aria-label={_t('Decrease {label} for {item}').replace('{label}', label).replace('{item}', item)}
        onClick={() => onChange(value - 1)}>−</button>
      {editable ? <input className="fit-input num extra-quantity" type="number" min={min} max={max}
        aria-label={_t('{label} for {item}').replace('{label}', label).replace('{item}', item)}
        value={draft ?? value} onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        onBlur={(event) => {
          const next = event.currentTarget.valueAsNumber
          setDraft(undefined)
          if (Number.isSafeInteger(next) && next >= min && next <= max && next !== value) onChange(next)
        }} />
        : <output className="num" aria-label={label}>{fmt(value)}{suffix}</output>}
      <button type="button" className="fit-button" disabled={value >= max}
        aria-label={_t('Increase {label} for {item}').replace('{label}', label).replace('{item}', item)}
        onClick={() => onChange(value + 1)}>+</button>
    </div>
  </div>
}
