import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('UX4: every route waits on the start page until the engine is ready (replaces #13 non-blocking start)', () => {
  for (const path of ['/', '/settings', '/about', '/fit/rifter', '/item/587', '/import']) {
    it(`${path} shows only the start page, no list, no skeleton`, async () => {
      const { container } = app(path)
      expect(await screen.findByRole('heading', { level: 1, name: 'Preparing the fitting engine' })).toBeTruthy()
      expect(screen.queryAllByTestId('fit-row')).toHaveLength(0)
      expect(container.querySelectorAll('[data-testid="page"]')).toHaveLength(0)
      expect(container.querySelector('.boot .sk')).toBeNull()
    })
  }
  it('enters the deep-linked page once the engine is ready', async () => {
    const { rerender } = app('/about')
    await screen.findByRole('heading', { level: 1, name: 'Preparing the fitting engine' })
    rerender(<MemoryRouter initialEntries={['/about']}><FittingRoutes engine={deferredEngine(new Promise(() => {}))} store={createFitStore(new IDBFactory())}
      startup={{ ...waiting, ready: true }} /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'About' })).toBeTruthy()
  })
  it('a failed start shows its error and a retry on the start page', async () => {
    const retry = vi.fn()
    render(<MemoryRouter initialEntries={['/']}><FittingRoutes engine={deferredEngine(new Promise(() => {}))} store={createFitStore(new IDBFactory())}
      startup={{ ...waiting, failed: true, retry }} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/Could not start the fitting engine/)
  })
})

describe('UX4 boot page timing', () => {
  it('does not flash the boot page when the engine is ready within 300 ms: the page that needed it is shown directly', async () => {
    const { rerender } = app('/import')
    const boot = await screen.findByRole('heading', { level: 1, name: 'Preparing the fitting engine' })
    expect(boot.closest('.boot')?.getAttribute('data-delayed')).toBe('true')
    const engine = deferredEngine(new Promise(() => {}))
    rerender(<MemoryRouter initialEntries={['/import']}><FittingRoutes engine={engine} store={createFitStore(new IDBFactory())}
      startup={{ ...waiting, ready: true }} /></MemoryRouter>)
    expect(document.querySelector('.boot')).toBeNull()
  })
  it('a boot page that was on screen flashes its ring, then shrinks away while the page rises in', async () => {
    const { rerender } = app('/import')
    await screen.findByRole('heading', { level: 1, name: 'Preparing the fitting engine' })
    await new Promise((r) => setTimeout(r, 350))
    const engine = deferredEngine(new Promise(() => {}))
    rerender(<MemoryRouter initialEntries={['/import']}><FittingRoutes engine={engine} store={createFitStore(new IDBFactory())}
      startup={{ ...waiting, ready: true }} /></MemoryRouter>)
    expect(document.querySelector('.cap')?.getAttribute('data-complete')).toBe('true')
    await waitFor(() => expect(document.querySelector('.boot')).toBeNull(), { timeout: 3000 })
  })
})

it('the start page that shrinks away is inert and hidden from assistive tech', async () => {
  const { rerender } = app('/about')
  await screen.findByRole('heading', { level: 1, name: 'Preparing the fitting engine' })
  await new Promise((r) => setTimeout(r, 350))
  rerender(<MemoryRouter initialEntries={['/about']}><FittingRoutes engine={deferredEngine(new Promise(() => {}))} store={createFitStore(new IDBFactory())}
    startup={{ ...waiting, ready: true }} /></MemoryRouter>)
  await screen.findByRole('heading', { level: 1, name: 'About' }, { timeout: 3000 })
  const layer = document.querySelector('.boot-layer')
  if (layer) {
    expect(layer.hasAttribute('inert')).toBe(true)
    expect(layer.getAttribute('aria-hidden')).toBe('true')
  }
})
