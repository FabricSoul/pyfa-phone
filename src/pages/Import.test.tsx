import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { resetSettings, updateSettings } from '../settings/settings'
import { setUiLanguage } from '../i18n/t'
import { mockEngine } from '../engine/mockClient'
import { createFitStore } from '../store/fits'

const eft = `[Thrasher, Test thrasher]
200mm AutoCannon II, Republic Fleet EMP S
200mm AutoCannon II, Republic Fleet EMP S

1MN Afterburner II

Damage Control II

Small Projectile Burst Aerator I`

beforeEach(async () => {
  resetSettings()
  updateSettings({ itemNameLanguage: 'en' })
  await setUiLanguage('en_US')
})
afterEach(cleanup)

async function paste() {
  const store = createFitStore(new IDBFactory())
  const save = vi.spyOn(store, 'save')
  render(<MemoryRouter initialEntries={['/import']}><FittingRoutes engine={mockEngine} store={store} /></MemoryRouter>)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: eft } })
  await screen.findByText(/Thrasher · 15 items recognized/)
  return { store, save }
}

describe('Import page', () => {
  it('previews the ship name and item count after EFT text is pasted', async () => {
    await paste()
    expect(screen.getByText(/382/)).toBeTruthy()
  })

  it('opens an editable temporary fit without writing it to the fit store', async () => {
    const { store, save } = await paste()
    fireEvent.click(screen.getByRole('button', { name: 'View only without saving' }))
    await screen.findByText('Test thrasher', { exact: true })
    const first = (await screen.findAllByTestId('state-button'))[0]!
    fireEvent.click(first)
    await waitFor(() => expect(first.dataset.state).not.toBe('active'))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'Fittings' })
    expect(save).not.toHaveBeenCalled()
    expect((await store.list()).map(({ fit }) => fit.name)).not.toContain('Test thrasher')
  })

  it('saves and opens the recognized fit', async () => {
    const { store, save } = await paste()
    fireEvent.click(screen.getByRole('button', { name: 'Save and open' }))
    await screen.findByText('Test thrasher', { exact: true })
    expect(save).toHaveBeenCalledTimes(1)
    expect((await store.list()).map(({ fit }) => fit.name)).toContain('Test thrasher')
  })
})
