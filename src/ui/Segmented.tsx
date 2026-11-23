import './ui.css'
import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> { value: T; label: ReactNode }

export function Segmented<T extends string>({ options, value, onChange, small }: {
  options: SegmentedOption<T>[]; value: T; onChange?: (v: T) => void; small?: boolean
}) {
  return (
    <div className={`seg${small ? ' small' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''} onClick={() => onChange?.(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}
