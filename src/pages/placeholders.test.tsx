import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import type { EngineClient } from '../engine/types'
import { setUiLanguage } from '../i18n/t'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

const never = () => new Promise<never>(() => {})
beforeEach(async () => { localStorage.clear(); resetSettings(); await setUiLanguage('en_US') })
afterEach(cleanup)

function open(path: string, engine: Partial<EngineClient>) {
  return render(<MemoryRouter initialEntries={[path]}><FittingRoutes engine={{ ...mockEngine, ...engine }} store={createFitStore(new IDBFactory())} /></MemoryRouter>)
}
/** A skeleton page announces itself once as busy, draws blocks, and shows no plain "Loading…" paragraph. */
async function expectSkeleton(label: string, container: HTMLElement) {
  const status = await screen.findByRole('status', { name: label })
  expect(status.getAttribute('aria-busy')).toBe('true')
  expect(container.querySelectorAll('.sk').length).toBeGreaterThan(0)
  expect(container.querySelector('p.page-message[role="status"]')).toBeNull()
}

describe('loading placeholders are skeletons, not text', () => {
  it('home before the fit list arrives', async () => {
    const store = createFitStore(new IDBFactory())
    const never = new Promise<never>(() => {})
    const { container } = render(<MemoryRouter><FittingRoutes engine={mockEngine} store={{ ...store, list: () => never }} /></MemoryRouter>)
    await expectSkeleton('Loading fits…', container)
  })
  it('ship browser', async () => {
    const { container } = open('/?new', { shipCatalog: never })
    await expectSkeleton('Loading ships…', container)
  })
  it('item info', async () => {
    const { container } = open('/item/587', { itemInfo: never })
    await expectSkeleton('Loading item…', container)
  })
  it('the fit page while the fit itself loads', async () => {
    const { container } = open('/fit/rifter', { itemInfo: never })
    await expectSkeleton('Loading fit…', container)
  })
  it('the fit page while the calculation runs', async () => {
    const { container } = open('/fit/rifter', { calc: never })
    await expectSkeleton('Calculating fit…', container)
  })
  it('add module', async () => {
    const { container } = open('/fit/rifter/add/low?index=0', { marketGroupsForSlot: never, itemsForSlot: never })
    await expectSkeleton('Loading modules…', container)
  })
  it('variations', async () => {
    const { container } = open('/fit/rifter/variations/high-0', { variationsOf: never })
    await expectSkeleton('Loading variations…', container)
  })
})
