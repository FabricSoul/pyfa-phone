import './ui.css'
import type { ReactNode } from 'react'

export function Pill({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button type="button" className={`pill${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>
}
