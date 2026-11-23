import type { LName } from '../engine/types'
import { useUiLanguage, type UiLanguage } from '../i18n/t'
import { useItemNameLanguage, type ItemNameLanguage } from '../settings/settings'

/** One decimal at most, integers without ".0", thousands separated (DESIGN.md §3). */
export function fmt(n: number, maxDigits = 1): string {
  if (!Number.isFinite(n)) return n === Infinity ? '∞' : n === -Infinity ? '−∞' : ''
  const absolute = Math.abs(n)
  const scale = 10 ** maxDigits
  const scaled = absolute * scale
  // Like Python round(), exact binary midpoints round to the even neighbour.
  const binaryMidpoint = (absolute * 2 ** (maxDigits + 1)) % 2 === 1
  const evenTie = binaryMidpoint && scaled % 2 === 0.5
  const rounded = evenTie ? Math.floor(scaled) / scale : Number(absolute.toFixed(maxDigits))
  return (rounded === 0 || n >= 0 ? rounded : -rounded).toLocaleString('en-US', { maximumFractionDigits: maxDigits })
}

/** Align time formatted to at most 1 decimal place (DESIGN.md §3). */
export function fmtAlignTime(n: number): string {
  return fmt(n, 1)
}

/** Item attribute formatted according to its unit/type (DESIGN.md §3). */
export function fmtAttribute(value: number, unit?: string): string {
  if (unit === 'x' || unit === 'multiplier') {
    return fmt(value, Math.abs(value) < 10 ? 2 : 1)
  }
  return fmt(value, 1)
}

export function lname(n: LName, lang: UiLanguage | ItemNameLanguage): string {
  return lang === 'zh_CN' || lang === 'zh' ? n.zh || n.en : n.en
}

export function useNameLanguage(): ItemNameLanguage {
  useUiLanguage()
  return useItemNameLanguage()
}

/** Icon files written by etl/20_assets.py. */
export const iconUrl = (id: number | null): string | undefined => (id == null ? undefined : `/img/icons/${id}.png`)
export const renderUrl = (id: number | null): string | undefined => (id == null ? undefined : `/img/renders/${id}.png`)

/** Duration/easing from --dur / --ease, so Motion and CSS agree. */
export function motionTokens(): { duration: number; ease: [number, number, number, number] } {
  const fallback = { duration: 0.18, ease: [0.2, 0, 0, 1] as [number, number, number, number] }
  if (typeof document === 'undefined') return fallback
  const cs = getComputedStyle(document.documentElement)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const ms = Math.min(parseFloat(cs.getPropertyValue('--dur')), reduced ? 100 : Infinity)
  const m = /cubic-bezier\(([^)]+)\)/.exec(cs.getPropertyValue('--ease'))
  const pts = m?.[1]?.split(',').map(Number)
  return {
    duration: Number.isFinite(ms) ? ms / 1000 : reduced ? 0.08 : fallback.duration,
    ease: pts && pts.length === 4 && pts.every(Number.isFinite) ? (pts as [number, number, number, number]) : fallback.ease,
  }
}
