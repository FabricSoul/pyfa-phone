import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { getSettings, resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

afterEach(() => { cleanup(); resetSettings() })

it('recalculates the Rifter resources when a module state changes and navigates from an empty slot', async () => {
  const calc = vi.fn(mockEngine.calc)
  render(<MemoryRouter initialEntries={['/fit/rifter']}><FittingRoutes
    engine={{ ...mockEngine, calc }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  expect(await screen.findByText('162.2/162.5', {}, { timeout: 4000 })).toBeTruthy()
  const first = screen.getAllByTestId('state-button')[0]!
  expect(first.getAttribute('data-state')).toBe('active')
  fireEvent.click(first)
  await waitFor(() => expect(calc.mock.lastCall?.[0].modules.high[0]?.state).toBe('offline'), { timeout: 4000 })
  await waitFor(() => expect(screen.getAllByTestId('state-button')[0]?.getAttribute('data-state')).toBe('offline'))
  fireEvent.click(screen.getAllByTestId('state-button')[0]!)
  await waitFor(() => expect(calc.mock.lastCall?.[0].modules.high[0]?.state).toBe('online'))
  fireEvent.click(screen.getAllByTestId('module-row')[0]!)
  fireEvent.click(await screen.findByRole('radio', { name: 'Offline' }))
  expect(await screen.findByText('142/162.5', {}, { timeout: 4000 })).toBeTruthy()
  fireEvent.click(screen.getByTestId('sheet-dim'))
  fireEvent.click(screen.getAllByTestId('empty-row')[0]!)
  expect(await screen.findByRole('heading', { name: 'Add low slot module' }, { timeout: 4000 })).toBeTruthy()
}, 10_000)

it('recalculates with the selected target, incoming damage and reload option', async () => {
  resetSettings()
  const calc = vi.fn(mockEngine.calc)
  render(<MemoryRouter initialEntries={['/fit/rifter']}><FittingRoutes
    engine={{ ...mockEngine, calc }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('tab', { name: 'Stats' }))
  fireEvent.click(await screen.findByRole('button', { name: /Target Resists/ }))
  const target = await screen.findByRole('dialog', { name: 'Target profile' })
  fireEvent.click(within(target).getByRole('button', { name: /Uniform \(25%\)/ }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].targetProfileId).toBe(-1))

  fireEvent.click(screen.getByRole('button', { name: /Incoming damage pattern/ }))
  const damage = await screen.findByRole('dialog', { name: 'Damage pattern' })
  fireEvent.click(within(damage).getByRole('button', { name: /^EM EM 100/ }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].damagePatternId).toBe(-2))

  const reload = screen.getByRole('button', { name: 'Factor in Reload Time' })
  expect(reload.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(reload)
  await waitFor(() => expect(calc.mock.lastCall?.[1]).toEqual({ includeReload: true }))
  expect(reload.getAttribute('aria-pressed')).toBe('true')
})

it('switches all supported high slot modules together and clears heat back to active', async () => {
  const calc = vi.fn<typeof mockEngine.calc>(async (fit, options) => {
    const result = await mockEngine.calc(fit, options)
    if (fit.modules.high.filter(Boolean).every((mod) => mod?.state === 'overheated')) {
      result.stats.firepower = { ...result.stats.firepower, dps: 208.1 }
    }
    return result
  })
  render(<MemoryRouter initialEntries={['/fit/rifter']}><FittingRoutes
    engine={{ ...mockEngine, calc }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  const high = (await screen.findByRole('heading', { name: 'High slots' })).closest('section')!
  const rackSwitch = within(high).getByRole('switch', { name: 'Overheat rack' })
  expect(rackSwitch.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(rackSwitch)
  await waitFor(() => expect(calc.mock.lastCall?.[0].modules.high.filter(Boolean).map((mod) => mod?.state))
    .toEqual(['overheated', 'overheated', 'overheated']))
  expect(rackSwitch.getAttribute('aria-checked')).toBe('true')
  expect(await screen.findByText(/DPS 208\.1.*High slots overheated/)).toBeTruthy()
  fireEvent.click(rackSwitch)
  await waitFor(() => expect(calc.mock.lastCall?.[0].modules.high.filter(Boolean).map((mod) => mod?.state))
    .toEqual(['active', 'active', 'active']))
}, 10_000)

it('shows calculated DPS and volley changes when selecting overheat in the module sheet', async () => {
  const calc = vi.fn<typeof mockEngine.calc>(async (fit, options) => {
    const result = await mockEngine.calc(fit, options)
    if (fit.modules.high[0]?.state === 'overheated') {
      result.stats.firepower = { ...result.stats.firepower, dps: 208.1, volley: 286.9 }
    }
    return result
  })
  render(<MemoryRouter initialEntries={['/fit/rifter']}><FittingRoutes
    engine={{ ...mockEngine, calc }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  fireEvent.click((await screen.findAllByTestId('module-row'))[0]!)
  const sheet = await screen.findByRole('dialog')
  fireEvent.click(within(sheet).getByRole('radio', { name: 'Overheated' }))
  expect(await within(sheet).findByText(/180\.9 → 208\.1/)).toBeTruthy()
  expect(await within(sheet).findByText(/249\.5 → 286\.9/)).toBeTruthy()
}, 10_000)

it('D05 highlights the open module, shows the current character, and opens ship info', async () => {
  render(<MemoryRouter initialEntries={['/fit/rifter']}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  expect(await screen.findByText(/^Rifter · All V$/)).toBeTruthy()
  const row = (await screen.findAllByTestId('module-row'))[0]!
  fireEvent.click(row)
  await screen.findByRole('dialog')
  expect(row.classList.contains('sel')).toBe(true)
  fireEvent.click(screen.getByTestId('sheet-dim'))
  expect(row.classList.contains('sel')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Ship information' }))
  expect(await screen.findByRole('heading', { name: 'Rifter' })).toBeTruthy()
})

it('D06 keeps reload local across fit tabs, without changing the global default', async () => {
  const calc = vi.fn(mockEngine.calc)
  render(<MemoryRouter initialEntries={['/fit/rifter?view=stats']}><FittingRoutes
    engine={{ ...mockEngine, calc }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Factor in Reload Time' }))
  await waitFor(() => expect(calc.mock.lastCall?.[1]?.includeReload).toBe(true))
  expect(getSettings().considerReload).toBe(false)
  fireEvent.click(screen.getByRole('tab', { name: 'Slots' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Stats' }))
  expect(screen.getByRole('button', { name: 'Factor in Reload Time' }).getAttribute('aria-pressed')).toBe('true')
})
