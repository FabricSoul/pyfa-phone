import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

afterEach(() => { cleanup(); resetSettings() })

const app = (path: string, calc = vi.fn(mockEngine.calc)) => render(<MemoryRouter initialEntries={[path]}><FittingRoutes
  engine={{ ...mockEngine, calc }} store={createFitStore(new IDBFactory())} /></MemoryRouter>)

it('keeps the fit workspace mounted while its add page enters and leaves: no skeleton, no second load', async () => {
  const calc = vi.fn(mockEngine.calc)
  app('/fit/rifter', calc)
  await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
  const callsBefore = calc.mock.calls.length
  fireEvent.click(screen.getAllByTestId('empty-row')[0]!)
  await screen.findByRole('heading', { name: 'Add low slot module' }, { timeout: 4000 })
  expect(screen.queryByRole('status', { name: /Loading fit|Calculating fit/ })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Back' }))
  await screen.findByRole('tab', { name: 'Stats' })
  expect(calc.mock.calls.length).toBe(callsBefore)
  expect(screen.queryByRole('status', { name: /Loading fit|Calculating fit/ })).toBeNull()
}, 12_000)

it('the in-app back button of the fit page returns to the library entering from the left, and the fit page leaves inert', async () => {
  app('/fit/rifter')
  await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  const pages = await screen.findAllByTestId('page')
  const home = pages.find((page) => page.textContent?.includes('Fittings'))!
  expect(home.getAttribute('data-motion')).toBe('back')
  const leaving = pages.find((page) => page !== home)
  if (leaving) expect(leaving.hasAttribute('inert')).toBe(true)
}, 12_000)

it('the selected tab backdrop is one element that moves to the new tab', async () => {
  const { container } = app('/fit/rifter')
  const stats = await screen.findByRole('tab', { name: 'Stats' })
  expect(container.querySelectorAll('.seg-pill')).toHaveLength(1)
  fireEvent.click(stats)
  await waitFor(() => expect(stats.querySelector('.seg-pill')).toBeTruthy())
  expect(container.querySelectorAll('.seg-pill')).toHaveLength(1)
}, 12_000)
