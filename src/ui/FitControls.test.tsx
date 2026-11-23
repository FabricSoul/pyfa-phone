import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import docs from '../../etl/fixtures/advanced-fits.json'
import calculations from '../../etl/fixtures/advanced-expected.json'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { CalcResultSchema, FitDocSchema, type FitDoc } from '../engine/types'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

afterEach(() => { cleanup(); resetSettings() })

async function openFit(name: 'vexor' | 'thanatos' | 'confessor', view = 'slots', change?: (doc: FitDoc) => FitDoc) {
  const fit = FitDocSchema.parse(docs[name])
  const result = CalcResultSchema.parse(calculations[name])
  const calc = vi.fn(async (_fit: FitDoc) => result)
  const store = createFitStore(new IDBFactory())
  await store.save({ id: name, fit: change?.(fit) ?? fit, itemNames: result.itemNames ?? {}, openedAt: null })
  render(<MemoryRouter initialEntries={[`/fit/${name}?view=${view}`]}>
    <FittingRoutes engine={{ ...mockEngine, calc, getDataVersion: async () => fit.dataVersion }} store={store} />
  </MemoryRouter>)
  return calc
}

it('activates imported drones within the pilot and bandwidth limits and reduces active count with quantity', async () => {
  const calc = await openFit('vexor', 'extras', (fit) => ({
    ...fit, drones: [{ typeId: 2185, amount: 5, active: 0 }],
  }))
  expect((await screen.findByRole('note')).textContent).toContain('Drones are inactive')
  fireEvent.click(screen.getByRole('button', { name: 'Activate all (within bandwidth)' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].drones[0]?.active).toBe(5))
  expect((screen.getByRole('button', { name: 'Increase Active for Hammerhead II' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Quantity for Hammerhead II' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].drones).toEqual([{ typeId: 2185, amount: 4, active: 4 }]))
})

it('toggles a fighter squadron and sends its new size to the engine', async () => {
  const calc = await openFit('thanatos', 'extras')
  const toggle = await screen.findByRole('switch', { name: 'Activate Dragonfly I' })
  fireEvent.click(toggle)
  await waitFor(() => expect(calc.mock.lastCall?.[0].fighters?.[0]?.active).toBe(false))
  const increase = screen.getByRole<HTMLButtonElement>('button', { name: 'Increase Quantity for Dragonfly I' })
  expect(increase.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Quantity for Dragonfly I' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].fighters?.[0]?.amount).toBe(5))
})

it('changes the tactical mode and opens the fit-specific character picker', async () => {
  const calc = await openFit('confessor')
  fireEvent.change(await screen.findByRole('combobox', { name: 'Tactical mode' }), { target: { value: '34323' } })
  await waitFor(() => expect(calc.mock.lastCall?.[0].modeTypeId).toBe(34323))
  fireEvent.click(screen.getByRole('button', { name: 'Character · All V' }))
  const dialog = await screen.findByRole('dialog', { name: 'Character' })
  fireEvent.click(within(dialog).getByRole('button', { name: /All 0/ }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].character).toBe('all0'))
})
