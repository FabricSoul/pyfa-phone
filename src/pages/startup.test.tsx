import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FittingRoutes, deferredEngine } from '../App'
import { setUiLanguage } from '../i18n/t'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

// An engine that never becomes ready: everything that does not calculate must still work.
const waiting = { ready: false, stage: 'runtime' as const, failed: false, retry() {} }
function app(path: string) {
  const engine = deferredEngine(new Promise(() => {}))
  return render(<MemoryRouter initialEntries={[path]}><FittingRoutes engine={engine} store={createFitStore(new IDBFactory())}
    startup={waiting} /></MemoryRouter>)
}
beforeEach(async () => { localStorage.clear(); resetSettings(); await setUiLanguage('en_US') })
afterEach(cleanup)

describe('#13 pages that do not calculate work before the engine is ready', () => {
  it('lists the saved fits on the home page', async () => {
    app('/')
    expect((await screen.findAllByTestId('fit-row')).length).toBeGreaterThan(0)
  })
  it('opens settings', async () => {
    app('/settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export all fits backup' })).toBeTruthy()
  })
  it('opens about', async () => {
    app('/about')
    expect(await screen.findByRole('heading', { level: 1, name: 'About' })).toBeTruthy()
  })
  it('home links to about', async () => {
    app('/')
    expect((await screen.findByRole('link', { name: 'About' })).getAttribute('href')).toBe('/about')
  })
  it('a fit page waits for the engine behind a skeleton and a floating progress bar, with a way back', async () => {
    const { container } = app('/fit/rifter')
    expect(await screen.findByText(/Starting engine · Python runtime/)).toBeTruthy()
    expect(container.querySelectorAll('.sk').length).toBeGreaterThan(5)
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/')
  })
  it('pages that only need the engine for a lookup show the boot page', async () => {
    app('/import')
    expect(await screen.findByRole('heading', { level: 1, name: 'Preparing the fitting engine' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse fittings first' })).toBeTruthy()
  })
})
