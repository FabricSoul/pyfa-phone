import './ui.css'
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { SlidingPill } from './motion'

export interface TabOption<T extends string> { value: T; label: ReactNode }

/** Segmented tab strip with roving tabindex: arrow keys, Home and End move and select. */
export function Tabs<T extends string>({ options, value, onChange, label }: {
  options: TabOption<T>[]; value: T; onChange: (value: T) => void; label?: string
}) {
  const id = useId()
  const refs = useRef(new Map<T, HTMLButtonElement>())
  function onKeyDown(event: KeyboardEvent) {
    const at = options.findIndex((option) => option.value === value)
    const to = event.key === 'ArrowRight' ? (at + 1) % options.length
      : event.key === 'ArrowLeft' ? (at - 1 + options.length) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1
    if (to < 0) return
    event.preventDefault()
    const next = options[to]!.value
    onChange(next)
    refs.current.get(next)?.focus()
  }
  return <div className="seg" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
    {options.map((option) => <button key={option.value} type="button" role="tab" id={`${id}-${option.value}`}
      ref={(node) => { if (node) refs.current.set(option.value, node); else refs.current.delete(option.value) }}
      aria-selected={option.value === value} tabIndex={option.value === value ? 0 : -1}
      className={option.value === value ? 'on' : ''} onClick={() => onChange(option.value)}>
      {option.value === value && <SlidingPill group={id} />}{option.label}</button>)}
  </div>
}
