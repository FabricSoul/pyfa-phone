import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { createFitStore } from '../store/fits'

afterEach(cleanup)

it('opens only the first technology group with results', async () => {
  render(<MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={mockEngine} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  const first = await screen.findByRole('button', { name: /^Tech II.*items/ }, { timeout: 4000 })
  const second = screen.getByRole('button', { name: /^Tech I\b.*items/ })
  expect(first.getAttribute('aria-expanded')).toBe('true')
  expect(second.getAttribute('aria-expanded')).toBe('false')
})

it('loads one default market group and only previews the expanded technology group', async () => {
  localStorage.removeItem('pyfa.recentModuleIds')
  const itemsForSlot = vi.fn(mockEngine.itemsForSlot)
  render(<MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={{ ...mockEngine, itemsForSlot }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter>)
  await screen.findByRole('button', { name: /^Tech II.*items/ }, { timeout: 4000 })
  await waitFor(() => expect(itemsForSlot).toHaveBeenCalledTimes(2), { timeout: 4000 })
  const first = itemsForSlot.mock.calls[0]?.[3]
  expect(first).toEqual({ marketGroupId: expect.any(Number), preview: false })
  expect(itemsForSlot.mock.calls[1]?.[3]).toEqual({
    marketGroupId: first?.marketGroupId, meta: 'tech2', preview: true,
  })
})
