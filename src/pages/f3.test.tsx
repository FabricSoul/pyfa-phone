import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { setUiLanguage } from '../i18n/t'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output> }
function app(entries: string[], index?: number) {
  return render(<MemoryRouter initialEntries={entries} initialIndex={index}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())} /><Where /></MemoryRouter>)
}
const where = () => screen.getByTestId('where').textContent

beforeEach(async () => { localStorage.clear(); resetSettings(); await setUiLanguage('en_US') })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('C1 back entrance on settings, import and about', () => {
  it.each(['/settings', '/about', '/import'])('%s goes to home when opened directly', async (path) => {
    app([path])
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Fittings' })).toBeTruthy()
    expect(where()).toBe('/')
  })
  it.each(['/settings', '/about', '/import'])('%s goes back in history when there is some', async (path) => {
    const other = path === '/about' ? '/settings' : '/about'
    app([other, path], 1)
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => expect(where()).toBe(other))
  })
})

describe('I7 not found pages', () => {
  it('shows a 404 with a way home for unknown routes', async () => {
    app(['/nonsense/route'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Back to fittings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Fittings' })).toBeTruthy()
  })
  it('shows a 404 with a way home for a fit that does not exist', async () => {
    app(['/fit/does-not-exist'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Fit not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to fittings' })).toBeTruthy()
  })
  it('offers a way back from an unknown slot and unknown module', async () => {
    app(['/fit/rifter/add/zzz'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Slot not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to fittings' })).toBeTruthy()
    cleanup()
    app(['/fit/rifter/variations/high-9'])
    expect(await screen.findByText('Module not found', {}, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back' })).toBeTruthy()
  })
})

describe('I9 one h1 per page', () => {
  it.each([['/', 'Fittings'], ['/settings', 'Settings'], ['/about', 'About'], ['/import', 'Import'], ['/fit/rifter', 'Rifter'], ['/nope', 'Page not found']])(
    '%s has exactly one h1', async (path) => {
      app([path])
      await screen.findByRole('heading', { level: 1 }, { timeout: 4000 })
      await waitFor(() => expect(document.querySelectorAll('h1')).toHaveLength(1))
      void within
    })
})

describe('I6 / M5 fit view lives in the URL and uses tabs', () => {
  it('uses tablist semantics with arrow keys and writes ?view=', async () => {
    app(['/fit/rifter'])
    const tablist = await screen.findByRole('tablist', {}, { timeout: 4000 })
    const slots = within(tablist).getByRole('tab', { name: 'Slots' })
    expect(slots.getAttribute('aria-selected')).toBe('true')
    slots.focus()
    fireEvent.keyDown(slots, { key: 'ArrowRight' })
    await waitFor(() => expect(where()).toBe('/fit/rifter?view=stats'))
    expect(within(tablist).getByRole('tab', { name: 'Stats' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(within(tablist).getByRole('tab', { name: 'Stats' }), { key: 'ArrowRight' })
    await waitFor(() => expect(where()).toBe('/fit/rifter?view=extras'))
    fireEvent.keyDown(within(tablist).getByRole('tab', { name: 'Extras' }), { key: 'Home' })
    await waitFor(() => expect(where()).toBe('/fit/rifter'))
  })
  it('restores the view from a deep link', async () => {
    app(['/fit/rifter?view=extras'])
    const tab = await screen.findByRole('tab', { name: 'Extras' }, { timeout: 4000 })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByText('Notes')).toBeTruthy()
  })
})

describe('C4 removing is undoable', () => {
  async function openSheet() {
    app(['/fit/rifter'])
    await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
    fireEvent.click(screen.getAllByTestId('module-row')[0]!)
    return screen.findByRole('dialog', { name: 'Module actions' })
  }
  it('shows a polite toast with undo for 5 seconds and restores the merged group', async () => {
    const sheet = await openSheet()
    const before = screen.getAllByTestId('module-row').length
    fireEvent.click(within(sheet).getByRole('button', { name: /Remove 3 modules/ }))
    const toast = (await screen.findByText(/^Removed /)).closest('[role="status"]') as HTMLElement
    expect(toast.getAttribute('aria-live')).toBe('polite')
    expect(toast.textContent).toMatch(/Removed .*×3/)
    await waitFor(() => expect(screen.getAllByTestId('module-row').length).toBeLessThan(before))
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getAllByTestId('module-row').length).toBe(before))
    expect(screen.queryByText(/Removed /)).toBeNull()
  })
  it('keeps the warning colour on the sheet action and removes the toast after 5 s', async () => {
    const sheet = await openSheet()
    expect(within(sheet).getByRole('button', { name: /Remove 3 modules/ }).className).toContain('warn')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fireEvent.click(within(sheet).getByRole('button', { name: /Remove 3 modules/ }))
    expect(await screen.findByText(/Removed /)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(4900) })
    expect(screen.queryByText(/Removed /)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.queryByText(/Removed /)).toBeNull()
  })
})

describe('I4 / I5 swipe hint and state button label', () => {
  it('shows the swipe hint once, then never again', async () => {
    const first = app(['/fit/rifter'])
    expect(await screen.findByText('Swipe a module row left for offline and remove.', {}, { timeout: 4000 })).toBeTruthy()
    first.unmount()
    app(['/fit/rifter'])
    await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
    expect(screen.queryByText('Swipe a module row left for offline and remove.')).toBeNull()
  })
  it('names the current state and the long press in the state button', async () => {
    app(['/fit/rifter'])
    await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
    const label = screen.getAllByTestId('state-button')[0]!.getAttribute('aria-label')!
    expect(label).toMatch(/^Active/)
    expect(label).toMatch(/long press.*overheat/i)
  })
  it('lets the module sheet pick overheated, offline and remove with icons', async () => {
    app(['/fit/rifter'])
    await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
    fireEvent.click(screen.getAllByTestId('module-row')[0]!)
    const sheet = await screen.findByRole('dialog', { name: 'Module actions' })
    expect(within(sheet).getByRole('radio', { name: 'Overheated' })).toBeTruthy()
    expect(within(sheet).getByRole('radio', { name: 'Offline' })).toBeTruthy()
    for (const name of [/Replace with a variation/, /Item information/, /Remove 3 modules/])
      expect(within(sheet).getByRole('button', { name }).querySelector('svg')).toBeTruthy()
  })
})

describe('M9 scroll position comes back', () => {
  it('saves the scroll position on leaving the fit and restores it on return', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    sessionStorage.setItem('pyfa.scroll.rifter', '480')
    const first = app(['/fit/rifter'])
    await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 480))
    expect(sessionStorage.getItem('pyfa.scroll.rifter')).toBeNull()
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    fireEvent.scroll(window)
    first.unmount()
    expect(sessionStorage.getItem('pyfa.scroll.rifter')).toBe('300')
    vi.unstubAllGlobals()
  })
})
