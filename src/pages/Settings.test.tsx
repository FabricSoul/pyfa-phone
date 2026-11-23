import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSettings } from '../settings/settings'
import { getUiLanguage, setUiLanguage } from '../i18n/t'
import { ToastProvider } from '../ui/Toast'
import { sampleFits } from '../engine/mockClient'
import { listFits, resetDefaultFitStoreForTests } from '../store/fits'
import { defaultSettings } from '../settings/settings'
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
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('20261122-test')).toBeTruthy())
  })

  it('changes the theme and writes data-appearance on <html>', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-appearance')).toBe('dark')
  })

  it('switches the UI language and persists the choice', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Interface language' }))
    fireEvent.click(screen.getByRole('radio', { name: '简体中文' }))
    await waitFor(() => expect(getUiLanguage()).toBe('zh_CN'))
    expect(localStorage.getItem('pyfa.settings')).toContain('zh_CN')
  })

  it('shows the full legal notice, the source link and a way to /about', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /pyfa-phone/ }).getAttribute('href'))
      .toBe('https://github.com/FabricSoul/pyfa-phone')
    expect(screen.getByText(/unofficial/i)).toBeTruthy()
    expect(screen.getByText(/not affiliated with/i)).toBeTruthy()
    expect(screen.getByText(/belong to CCP hf|intellectual property of CCP hf/)).toBeTruthy()
    expect(screen.getByText(/GPLv3/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about')
  })

  it('matches pyfa: reload time is not considered by default', () => {
    // vendor/pyfa/service/fit.py serviceFittingOptions["useGlobalForceReload"] defaults to False
    expect(defaultSettings.considerReload).toBe(false)
  })
})

describe('backup restore', () => {
  let n = 0
  beforeEach(() => { resetDefaultFitStoreForTests(`settings-${n++}`) })
  const open = () => render(<MemoryRouter><ToastProvider><Settings /></ToastProvider></MemoryRouter>)
  const pick = (text: string) => {
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    const file = new File([text], 'b.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => text })
    fireEvent.change(input, { target: { files: [file] } })
  }

  it.each([['empty array', '[]'], ['null entry', '[null]'], ['empty object', '[{}]']])(
    'rejects a file with %s and keeps the stored fits', async (_n, text) => {
      const before = (await listFits()).length
      open()
      pick(text)
      await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/rejected/i))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(await listFits()).toHaveLength(before)
    })

  it('asks before replacing, naming how many fits will be replaced', async () => {
    const before = (await listFits()).length
    open()
    pick(JSON.stringify([{ ...sampleFits.rifter, name: 'Restored' }]))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(new RegExp(`will replace ${before} fits`, 'i'))).toBeTruthy()
    expect(await listFits()).toHaveLength(before)
    fireEvent.click(within(dialog).getByRole('button', { name: /^Replace/ }))
    await waitFor(async () => expect((await listFits()).map((f) => f.name)).toEqual(['Restored']))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/restored/i))
  })

  it('merge keeps the existing fits', async () => {
    const before = (await listFits()).length
    open()
    pick(JSON.stringify([{ ...sampleFits.rifter, name: 'Merged in' }]))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Merge/ }))
    await waitFor(async () => expect(await listFits()).toHaveLength(before + 1))
  })
})

describe('backup export', () => {
  const open = () => render(<MemoryRouter><ToastProvider><Settings /></ToastProvider></MemoryRouter>)
  it('shares the file with the Web Share API when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share, canShare: () => true }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Export all fits backup' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(share.mock.calls[0]![0].files[0].name).toBe('pyfa-fits.json')
  })
  it('shows copyable JSON when neither sharing nor downloading is possible', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: undefined, canShare: undefined }))
    Object.defineProperty(HTMLAnchorElement.prototype, 'download', { value: undefined, configurable: true })
    delete (HTMLAnchorElement.prototype as unknown as Record<string, unknown>).download
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Export all fits backup' }))
    const box = await screen.findByRole('textbox', { name: /backup/i })
    expect(() => JSON.parse((box as HTMLTextAreaElement).value)).not.toThrow()
  })
})
