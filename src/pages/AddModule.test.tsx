import { StrictMode } from 'react'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine, sampleFits } from '../engine/mockClient'
import { createFitStore } from '../store/fits'

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear() })

it('starts with a collapsed market tree and previews only the open technology group', async () => {
  const itemsForSlot = vi.fn(mockEngine.itemsForSlot)
  render(<StrictMode><MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={{ ...mockEngine, itemsForSlot }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter></StrictMode>)
  const turrets = await screen.findByRole('button', { name: /Turrets & Launchers/ })
  expect(turrets.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByLabelText('Module groups')).toBeNull()
  expect(screen.getByRole('searchbox').getAttribute('placeholder')).toMatch(/^Search all \d+ low slot modules$/)
  expect(itemsForSlot).not.toHaveBeenCalled()

  fireEvent.click(turrets)
  fireEvent.click(screen.getByRole('button', { name: /Weapon Upgrades/ }))
  expect(screen.queryByRole('button', { name: /Gyrostabilizers/ })).toBeNull()
  const first = await screen.findByRole('button', { name: /^Tech II.*items/ })
  expect(first.getAttribute('aria-expanded')).toBe('false')
  expect(itemsForSlot.mock.calls.map((call) => call[3])).toEqual([{ marketGroupId: 143, preview: false }])
  fireEvent.click(first)
  await waitFor(() => expect(itemsForSlot.mock.calls[1]?.[3]).toEqual({
    marketGroupId: 143, meta: 'tech2', preview: true,
  }))
  expect((await screen.findAllByText(/^After fitting:/)).length).toBeGreaterThan(0)
}, 12_000)

it('restores and persists the search query independently of the market branch', async () => {
  sessionStorage.setItem('pyfa.addModule.query.low', JSON.stringify('Gyrostabilizer'))
  render(<MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  const input = await screen.findByRole<HTMLInputElement>('searchbox', { name: 'Search modules' })
  expect(input.value).toBe('Gyrostabilizer')
  expect(await screen.findByRole('button', { name: /^Gyrostabilizer II/ })).toBeTruthy()
  fireEvent.change(input, { target: { value: 'Damage Control' } })
  expect(JSON.parse(sessionStorage.getItem('pyfa.addModule.query.low')!)).toBe('Damage Control')
  expect(sessionStorage.getItem('pyfa.addModule.query.high')).toBeNull()
}, 12_000)

it('restores only the saved market branch down to its technology group', async () => {
  sessionStorage.setItem('pyfa.addModule.market.low', JSON.stringify({ branch: [14, 615], meta: 'tech2' }))
  render(<MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  const tech = await screen.findByRole('button', { name: /^Tech II.*item/ })
  expect(tech.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('button', { name: /Turrets & Launchers/ }).getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: /Hull & Armor/ }))
  expect(screen.queryByRole('button', { name: /Damage Controls/ })).toBeNull()
  expect(JSON.parse(sessionStorage.getItem('pyfa.addModule.market.low')!)).toEqual({ branch: [] })
}, 12_000)

it('shows at most six recently added modules from the requested slot', async () => {
  const groups = await mockEngine.itemsForSlot(sampleFits.rifter, 'low', undefined, { preview: false })
  const ids = groups.flatMap((group) => group.items).slice(0, 7).map((item) => ({ typeId: item.typeId, slot: 'low' }))
  localStorage.setItem('pyfa.recentModuleIds', JSON.stringify([{ typeId: 2889, slot: 'high' }, ...ids]))
  render(<MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  const recent = await screen.findByRole('region', { name: 'Recent modules' })
  expect(recent.querySelectorAll('button')).toHaveLength(6)
  expect(recent.querySelector('img')).toBeTruthy()
}, 12_000)

it('remembers the market path when a candidate is added from search', async () => {
  const store = createFitStore(new IDBFactory())
  render(<MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes engine={mockEngine} store={store} /></MemoryRouter>)
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Damage Control II' } })
  fireEvent.click(await screen.findByRole('button', { name: /^Damage Control II/ }))
  await screen.findByRole('tab', { name: 'Slots' })
  expect(JSON.parse(sessionStorage.getItem('pyfa.addModule.market.low')!)).toEqual({
    branch: [14, 615], meta: 'tech2',
  })
}, 12_000)
