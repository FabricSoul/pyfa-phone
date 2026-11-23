import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { resetSettings } from '../settings/settings'
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
  await waitFor(() => expect(calc.mock.lastCall?.[0].modules.high[0]?.state).toBe('online'), { timeout: 4000 })
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
  expect(reload.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(reload)
  await waitFor(() => expect(calc.mock.lastCall?.[1]).toEqual({ includeReload: false }))
  expect(reload.getAttribute('aria-pressed')).toBe('false')
})
