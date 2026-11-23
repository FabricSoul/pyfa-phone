import type { ReactNode } from 'react'

export type IconName = 'power-off' | 'power' | 'zap' | 'flame' | 'chevron-down' | 'chevron-left' | 'undo' | 'more' | 'plus' | 'x' | 'swap' | 'info' | 'trash' | 'list'

const PATHS: Record<IconName, ReactNode> = {
  'power-off': <><path d="M12 3v8" /><path d="M7.5 6.5a7 7 0 1 0 9 0" /></>,
  power: <><path d="M12 3v8" /><path d="M7.5 6.5a7 7 0 1 0 9 0" /><circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" /></>,
  zap: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  flame: <path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.4 1 2 1.8 2C10.5 8 11 5.5 12 3z" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  more: <><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.8" fill="currentColor" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  )
}
