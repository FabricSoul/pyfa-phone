import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FitServices } from './fitSession'
import { ShipBrowser } from './ShipBrowser'
import type { EngineClient, ShipCatalog } from '../engine/types'
import type { FitStore } from '../store/fits'

describe('ShipBrowser sticky state', () => {
  const mockCatalog: ShipCatalog = {
    dataVersion: '1.0',
    groups: [
      {
        id: 101,
        name: { en: 'Frigate', zh: '护卫舰' },
        ships: [
          {
            typeId: 582,
            graphicId: 100,
            name: { en: 'Rifter', zh: '裂谷级' },
            raceId: 2,
          },
        ],
      },
      {
        id: 102,
        name: { en: 'Cruiser', zh: '巡洋舰' },
        ships: [
          {
            typeId: 626,
            graphicId: 200,
            name: { en: 'Vexor', zh: '狂怒者级' },
            raceId: 8,
          },
        ],
      },
    ],
  }

  const mockEngine = {
    shipCatalog: vi.fn().mockResolvedValue(mockCatalog),
  } as unknown as EngineClient

  const mockStore = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as FitStore

  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(cleanup)

  it('restores search query from sessionStorage', async () => {
    sessionStorage.setItem('pyfa.shipBrowser.query', JSON.stringify('Rifter'))

    render(
      <MemoryRouter>
        <FitServices engine={mockEngine} store={mockStore}>
          <ShipBrowser />
        </FitServices>
      </MemoryRouter>
    )

    const searchInput = screen.getByRole('searchbox', { name: 'Search ships' }) as HTMLInputElement
    expect(searchInput.value).toBe('Rifter')
    await waitFor(() => {
      expect(screen.getByText('Rifter')).toBeTruthy()
    })
  })

  it('persists search query to sessionStorage when typing', async () => {
    render(
      <MemoryRouter>
        <FitServices engine={mockEngine} store={mockStore}>
          <ShipBrowser />
        </FitServices>
      </MemoryRouter>
    )

    const searchInput = screen.getByRole('searchbox', { name: 'Search ships' })
    fireEvent.change(searchInput, { target: { value: 'Vexor' } })

    expect(JSON.parse(sessionStorage.getItem('pyfa.shipBrowser.query')!)).toBe('Vexor')
  })

  it('restores expanded group from sessionStorage and persists on select', async () => {
    sessionStorage.setItem('pyfa.shipBrowser.groupId', JSON.stringify(101))

    render(
      <MemoryRouter>
        <FitServices engine={mockEngine} store={mockStore}>
          <ShipBrowser />
        </FitServices>
      </MemoryRouter>
    )

    await waitFor(() => {
      // In group 101, Rifter is shown and "All ship groups" button is present
      expect(screen.getByText('All ship groups')).toBeTruthy()
      expect(screen.getByText('Rifter')).toBeTruthy()
    })

    // Back to all groups
    fireEvent.click(screen.getByText('All ship groups'))
    expect(sessionStorage.getItem('pyfa.shipBrowser.groupId')).toBeNull()
  })

  it('clears sticky query and groupId upon creating a ship fit', async () => {
    sessionStorage.setItem('pyfa.shipBrowser.query', JSON.stringify('Rifter'))
    sessionStorage.setItem('pyfa.shipBrowser.groupId', JSON.stringify(101))

    render(
      <MemoryRouter>
        <FitServices engine={mockEngine} store={mockStore}>
          <ShipBrowser />
        </FitServices>
      </MemoryRouter>
    )

    const rifterBtn = await screen.findByRole('button', { name: 'Rifter' })
    fireEvent.click(rifterBtn)

    await waitFor(() => {
      expect(mockStore.save).toHaveBeenCalled()
      expect(JSON.parse(sessionStorage.getItem('pyfa.shipBrowser.query')!)).toBe('')
      expect(sessionStorage.getItem('pyfa.shipBrowser.groupId')).toBeNull()
    })
  })
})
