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
  fireEvent.change(screen.getByRole('textbox', { name: 'Paste fit text' }), { target: { value: eft } })
  await screen.findByText('Recognized as EFT fit')
  expect(screen.getByRole('dialog').textContent).toContain('Thrasher · Test thrasher · 15 items recognized')
  return { store, save }
}

describe('Import page', () => {
  it('previews the ship name and item count after EFT text is pasted', async () => {
    await paste()
    expect(screen.getByText(/382/)).toBeTruthy()
  })

  it('shows the source format and CPU excess in a bottom sheet over the fittings list', async () => {
    const store = createFitStore(new IDBFactory())
    const engine = {
      ...mockEngine,
      async importText() {
        return { ...await mockEngine.importText(eft), format: 'XML' as const }
      },
      async calc(...args: Parameters<typeof mockEngine.calc>) {
        const result = await mockEngine.calc(...args)
        return { ...result, warnings: [{ kind: 'cpu' as const, used: 218, total: 212.5 }] }
      },
    }
    render(<MemoryRouter initialEntries={['/import']}><FittingRoutes engine={engine} store={store} /></MemoryRouter>)
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste fit text' }), { target: { value: '<fittings/>' } })
    expect(await screen.findByText('Recognized as XML fit')).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('CPU over by 5.5')
    expect(screen.getByRole('heading', { name: 'Fittings' })).toBeTruthy()
  })

  it('translates a structured Python ambiguity without changing the type IDs', async () => {
    await setUiLanguage('zh_CN')
    const store = createFitStore(new IDBFactory())
    const engine = {
      ...mockEngine,
      async importText() {
        return { fits: [], warnings: [], ambiguities: [{ name: '示例', candidates: [{ typeId: 15054, name: 'Candidate' }] }] }
      },
    }
    render(<MemoryRouter initialEntries={['/import']}><FittingRoutes engine={engine} store={store} /></MemoryRouter>)
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴装配文本' }), { target: { value: '示例' } })
    expect(await screen.findByText(/物品名称有歧义.*15054/)).toBeTruthy()
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
