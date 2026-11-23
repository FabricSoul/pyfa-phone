import { initAppearance } from '../settings/appearance'
import { getSettings } from '../settings/settings'
import { setUiLanguage, type UiLanguage } from './t'

/**
 * First launch follows the browser language (zh* → zh_CN, everything else → en_US).
 * Once the user has chosen a language in Settings, that stored value wins.
 */
export function detectInitialUiLanguage(): UiLanguage {
  const chosen = getSettings().uiLanguage
  if (chosen === 'zh_CN' || chosen === 'en_US') return chosen
  let browser = ''
  try {
    browser = typeof navigator !== 'undefined' ? navigator.language ?? '' : ''
  } catch {
    browser = ''
  }
  return /^zh\b/i.test(browser) ? 'zh_CN' : 'en_US'
}

export async function initI18n(): Promise<void> {
  await setUiLanguage(detectInitialUiLanguage())
}

/** Startup glue: theme and UI language, before the first page renders its text. */
export function initApp(): Promise<void> {
  initAppearance()
  return initI18n()
}
