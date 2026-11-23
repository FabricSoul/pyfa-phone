import { IDBFactory } from 'fake-indexeddb'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import type { EngineClient } from '../engine/types'
import { mockEngine } from '../engine/mockClient'
import { createFitStore } from '../store/fits'
import { resetSettings, updateSettings } from '../settings/settings'

configure({ asyncUtilTimeout: 5000 })

afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetSettings() })

function setup(path = '/fit/rifter', engine = mockEngine) {
  const store = createFitStore(new IDBFactory())
  function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
  render(<MemoryRouter initialEntries={[path]}><FittingRoutes engine={engine} store={store} /><Location /></MemoryRouter>)
  return store
}

it('browses and creates an empty non-example hull following the item name language', async () => {
  updateSettings({ itemNameLanguage: 'zh' })
  const ship = { typeId: 626, name: { en: 'Vexor', zh: '狂怒者级' }, graphicId: null }
  const store = setup('/', Object.assign({}, mockEngine, {
    shipCatalog: async () => ({
      dataVersion: 'catalog-version',
      groups: [{ id: 26, name: { en: 'Cruiser', zh: '巡洋舰' }, ships: [ship] }],
    }),
    calc: vi.fn((fit) => mockEngine.calc(fit.shipTypeId === 626 ? { ...fit, shipTypeId: 587 } : fit)),
  }))
  fireEvent.click(await screen.findByRole('button', { name: 'New' }))
  fireEvent.click(await screen.findByRole('button', { name: /巡洋舰/ }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search ships' }), { target: { value: 'Vexor' } })
  fireEvent.click(await screen.findByRole('button', { name: '狂怒者级' }))
  await waitFor(() => expect(screen.getByTestId('location').textContent).toMatch(/^\/fit\//))
  const created = (await store.list()).find(({ fit }) => fit.shipTypeId === 626)?.fit
  expect(created).toMatchObject({ name: '狂怒者级', dataVersion: 'catalog-version',
    modules: { high: [], mid: [], low: [], rig: [], subsystem: [] }, cargo: [], drones: [], implants: [], boosters: [] })
}, 20_000)

it('copies the four export formats and exposes selectable text when clipboard writing fails', async () => {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }))
  const exportText = vi.fn().mockResolvedValue('exported fit')
  setup(undefined, { ...mockEngine, exportText })
  const more = await screen.findByRole('button', { name: 'More' })
  for (const [label, format, language] of [
    ['Copy EFT (English)', 'eft', 'en'], ['Copy EFT (Chinese)', 'eft', 'zh'],
    ['Copy DNA', 'dna', 'en'], ['Copy MultiBuy', 'multibuy', 'en'],
  ]) {
    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('button', { name: label }))
    await waitFor(() => expect(exportText).toHaveBeenLastCalledWith(expect.objectContaining({ shipTypeId: 587 }), format, language))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }
  expect(writeText).toHaveBeenCalledTimes(4)
  writeText.mockRejectedValueOnce(new Error('denied'))
  fireEvent.click(more)
  fireEvent.click(await screen.findByRole('button', { name: 'Copy DNA' }))
  const field = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Exported fit' })
  expect(field.value).toBe('exported fit')
  expect(field.readOnly).toBe(true)
  expect(field.selectionEnd - field.selectionStart).toBe(field.value.length)
}, 20_000)

it('adds a cargo selection and saves notes while they are still focused', async () => {
  const itemsForExtra = vi.fn().mockResolvedValue([{ meta: 'tech1', best: null, items: [
    { typeId: 123, name: { en: 'Spare charges', zh: '弹药' }, meta: 'tech1',
      iconId: null, metaLevel: null, keyValue: null, keyLine: '' },
  ] }])
  const store = setup('/fit/rifter?view=extras', Object.assign({}, mockEngine, { itemsForExtra }))
  const notes = await screen.findByRole('textbox', { name: 'Notes' })
  notes.focus()
  fireEvent.change(notes, { target: { value: 'Saved before blur' } })
  await waitFor(async () => expect((await store.get('rifter'))?.fit.notes).toBe('Saved before blur'))
  expect(document.activeElement).toBe(notes)
  fireEvent.click(screen.getByRole('button', { name: 'Add cargo' }))
  const search = await screen.findByRole('searchbox', { name: 'Search items' })
  fireEvent.change(search, { target: { value: 'Spare' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Spare charges' }))
  await waitFor(async () => expect((await store.get('rifter'))?.fit.cargo).toContainEqual({ typeId: 123, amount: 1 }))
  expect(itemsForExtra).toHaveBeenLastCalledWith(expect.anything(), 'cargo', 'Spare')
}, 20_000)

it('fills same-slot gaps with a single undoable edit and keeps existing modules', async () => {
  const fillEmptySlots = vi.fn<NonNullable<EngineClient['fillEmptySlots']>>(
    async (fit, pos) => {
      const module = fit.modules[pos.slot][pos.index]
      return module ? [{ index: 3, module }] : []
    },
  )
  const store = setup(undefined, Object.assign({}, mockEngine, { fillEmptySlots }))
  fireEvent.click(await screen.findByText('Gyrostabilizer II', { exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Fill empty slots of this type' }))
  const [before, pos] = fillEmptySlots.mock.calls[0]!
  await waitFor(async () => {
    const rack = (await store.get('rifter'))?.fit.modules.low
    expect(rack?.[3]).toEqual(before.modules.low[pos.index])
    expect(rack?.slice(0, 3)).toEqual(before.modules.low.slice(0, 3))
  })
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(async () => expect((await store.get('rifter'))?.fit.modules.low[3]).toBeNull())
}, 20_000)
