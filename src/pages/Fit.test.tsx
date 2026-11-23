import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { createFitStore } from '../store/fits'

afterEach(cleanup)

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
