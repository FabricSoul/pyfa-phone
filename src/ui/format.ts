import type { LName } from '../engine/types'
import type { UiLanguage } from '../i18n/t'

/** One decimal at most, integers without ".0", thousands separated (DESIGN.md §3). */
export function fmt(n: number, maxDigits = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDigits })
}

export function lname(n: LName, lang: UiLanguage): string {
  return lang === 'zh_CN' ? n.zh || n.en : n.en
}

/** Icon files written by etl/20_assets.py. */
export const iconUrl = (id: number | null): string | undefined => (id == null ? undefined : `/img/icons/${id}.png`)
export const renderUrl = (id: number | null): string | undefined => (id == null ? undefined : `/img/renders/${id}.png`)

/** Duration/easing from --dur / --ease, so Motion and CSS agree. */
export function motionTokens(): { duration: number; ease: [number, number, number, number] } {
  const fallback = { duration: 0.18, ease: [0.2, 0, 0, 1] as [number, number, number, number] }
  if (typeof document === 'undefined') return fallback
  const cs = getComputedStyle(document.documentElement)
  const ms = parseFloat(cs.getPropertyValue('--dur'))
  const m = /cubic-bezier\(([^)]+)\)/.exec(cs.getPropertyValue('--ease'))
  const pts = m?.[1]?.split(',').map(Number)
  return {
    duration: Number.isFinite(ms) ? ms / 1000 : fallback.duration,
    ease: pts && pts.length === 4 && pts.every(Number.isFinite) ? (pts as [number, number, number, number]) : fallback.ease,
  }
}
