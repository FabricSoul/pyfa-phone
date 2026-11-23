import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSettings } from '../settings/settings'
import { getUiLanguage, setUiLanguage } from '../i18n/t'
import Settings from './Settings'

beforeEach(async () => {
  resetSettings()
  await setUiLanguage('en_US')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ dataVersion: '20261122-test' }),
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Settings page', () => {
  it('renders the data version from the manifest', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByText('20261122-test')).toBeTruthy())
  })

  it('changes the theme and writes data-appearance on <html>', () => {
    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-appearance')).toBe('dark')
  })

  it('switches the UI language and persists the choice', async () => {
    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Interface language' }))
    fireEvent.click(screen.getByRole('radio', { name: '简体中文' }))
    await waitFor(() => expect(getUiLanguage()).toBe('zh_CN'))
    expect(localStorage.getItem('pyfa.settings')).toContain('zh_CN')
  })

  it('shows the legal notice and the source link', () => {
    render(<Settings />)
    expect(screen.getByRole('link', { name: /pyfa-phone/ }).getAttribute('href'))
      .toBe('https://github.com/FabricSoul/pyfa-phone')
    expect(screen.getByText(/CCP hf\./)).toBeTruthy()
  })
})
