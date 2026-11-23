import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { getPrices } from '../price/price'
import { createFitStore } from '../store/fits'

vi.mock('../price/price', () => ({ getPrices: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it.each(['/', '/fit/rifter'])('shows pending and failed prices independently of fit data on %s', async (path) => {
  let fail: (reason: Error) => void = () => {}
  vi.mocked(getPrices).mockImplementation(() => new Promise((_, reject) => { fail = reject }))
  render(<MemoryRouter initialEntries={[path]}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  if (path !== '/') {
    fireEvent.click(await screen.findByRole('radio', { name: 'Stats' }))
    await screen.findByText('Total DPS')
  }
  expect((await screen.findAllByText('Updating prices…')).length).toBeGreaterThan(0)
  await waitFor(() => expect(getPrices).toHaveBeenCalledTimes(1))
  fail(new Error('Prices offline'))
  await waitFor(() => expect(screen.queryByText('Updating prices…')).toBeNull())
  expect(screen.getAllByText('—').length).toBeGreaterThan(0)
})
