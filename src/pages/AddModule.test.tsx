import { StrictMode } from 'react'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import type { ItemGroup } from '../engine/types'
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
}, 12_000)

it('loads one default market group and only previews the expanded technology group', async () => {
  localStorage.removeItem('pyfa.recentModuleIds')
  const itemsForSlot = vi.fn(mockEngine.itemsForSlot)
  const marketGroupsForSlot = vi.fn(mockEngine.marketGroupsForSlot!)
  render(<StrictMode><MemoryRouter initialEntries={['/fit/rifter/add/low']}><FittingRoutes
    engine={{ ...mockEngine, itemsForSlot, marketGroupsForSlot }} store={createFitStore(new IDBFactory())}
  /></MemoryRouter></StrictMode>)
  await screen.findByRole('button', { name: /^Tech II.*items/ }, { timeout: 4000 })
  expect(marketGroupsForSlot).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(itemsForSlot).toHaveBeenCalledTimes(2))
  const first = itemsForSlot.mock.calls[0]?.[3]
  expect(first).toEqual({ marketGroupId: expect.any(Number), preview: false })
  const candidates: ItemGroup[] | undefined = await itemsForSlot.mock.results[0]?.value
  expect(candidates?.map(({ items }) => items.length)).toEqual([1, 3, 3, 2, 8])
  expect(itemsForSlot.mock.calls[1]?.[3]).toEqual({
    marketGroupId: first?.marketGroupId, meta: 'tech2', preview: true,
  })
  expect(await screen.findByText(/^After fitting:/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /^Tech I\b.*items/ }))
  await waitFor(() => expect(itemsForSlot).toHaveBeenCalledTimes(3))
  expect(itemsForSlot.mock.calls[2]?.[3]).toEqual({
    marketGroupId: first?.marketGroupId, meta: 'tech1', preview: true,
  })
  const trial: ItemGroup[] | undefined = await itemsForSlot.mock.results[2]?.value
  expect(trial?.map(({ items }) => items.length)).toEqual([3])
}, 12_000)
