import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import { resetSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

describe('ExtraItemPicker sticky query', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetSettings()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    resetSettings()
  })

  it('restores and persists search query across open/close and page reloads', async () => {
    sessionStorage.setItem('pyfa.extraPicker.query', JSON.stringify('Warrior'))

    render(
      <MemoryRouter initialEntries={['/fit/rifter']}>
        <FittingRoutes
          engine={mockEngine}
          store={createFitStore(new IDBFactory())}
        />
      </MemoryRouter>
    )

    // Switch to Extras tab
    const extrasTab = await screen.findByRole('tab', { name: 'Extras' }, { timeout: 4000 })
    fireEvent.click(extrasTab)

    // Click Add drone
    const addDroneBtn = await screen.findByRole('button', { name: 'Add drone' }, { timeout: 4000 })
    fireEvent.click(addDroneBtn)

    // The search box should have restored 'Warrior'
    const searchInput = (await screen.findByRole('searchbox', { name: 'Search items' })) as HTMLInputElement
    expect(searchInput.value).toBe('Warrior')

    // Change search query
    fireEvent.change(searchInput, { target: { value: 'Hobgoblin' } })
    expect(JSON.parse(sessionStorage.getItem('pyfa.extraPicker.query')!)).toBe('Hobgoblin')
  }, 10_000)
})
