import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSettings, updateSettings } from '../settings/settings'
import { detectInitialUiLanguage, initI18n } from './initial'
import { getUiLanguage, setUiLanguage } from './t'

function setBrowserLanguage(value: string) {
  Object.defineProperty(navigator, 'language', { configurable: true, value })
}

describe('initial UI language', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSettings()
    setBrowserLanguage('en-US')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    resetSettings()
    await setUiLanguage('en_US')
  })

  it('uses zh_CN when the browser language starts with zh', () => {
    setBrowserLanguage('zh-CN')
    expect(detectInitialUiLanguage()).toBe('zh_CN')
  })

  it('uses en_US for other browser languages', () => {
    setBrowserLanguage('fr-FR')
    expect(detectInitialUiLanguage()).toBe('en_US')
  })

  it('prefers a language the user chose in settings', () => {
    setBrowserLanguage('zh-CN')
    updateSettings({ uiLanguage: 'en_US' })
    expect(detectInitialUiLanguage()).toBe('en_US')
  })

  it('does not throw when localStorage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    setBrowserLanguage('zh-TW')
    expect(detectInitialUiLanguage()).toBe('zh_CN')
  })

  it('initI18n applies the detected language', async () => {
    setBrowserLanguage('zh-CN')
    await initI18n()
    expect(getUiLanguage()).toBe('zh_CN')
  })
})
