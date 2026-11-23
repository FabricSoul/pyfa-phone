import { getSettings, subscribeSettings, type Appearance } from './settings'

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

/** Writes the resolved theme to <html data-appearance>, as the tokens.css selectors expect. */
export function applyAppearance(appearance: Appearance = getSettings().appearance): void {
  if (typeof document === 'undefined') return
  const resolved = appearance === 'system' ? (mq?.matches ? 'dark' : 'light') : appearance
  document.documentElement.setAttribute('data-appearance', resolved)
}

let started = false

/** Call once at startup; keeps data-appearance in sync with the setting and the OS theme. */
export function initAppearance(): void {
  if (started || typeof document === 'undefined') return
  started = true
  applyAppearance()
  subscribeSettings(() => applyAppearance())
  mq?.addEventListener?.('change', () => applyAppearance())
}
