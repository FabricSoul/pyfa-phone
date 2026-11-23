import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import advanced from '../../etl/fixtures/advanced-fits.json'
import expected from '../../etl/fixtures/advanced-expected.json'
import { mockEngine } from '../engine/mockClient'
import { CalcResultSchema, FitDocSchema, type EngineClient, type FitDoc, type ItemRow } from '../engine/types'
import { getSettings, resetSettings, updateSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

const EMP = { en: 'Republic Fleet EMP S', zh: '共和舰队电磁脉冲弹 S' }
const EXILE = { en: 'Standard Exile Booster', zh: '标准型游离感增效体' }
const IMPLANT = { en: 'Ocular Filter - Standard', zh: '视觉滤镜—标准级' }
const HAMMERHEAD = { en: 'Hammerhead II', zh: '战锤 II' }
const autocannon = { en: '200mm AutoCannon II', zh: '200mm自动加农炮 II' }

function item(typeId: number, name: ItemRow['name']): ItemRow {
  return { typeId, name, iconId: null, meta: 'tech2', metaLevel: null, keyValue: null, keyLine: '' }
}

async function open(name: 'vexor' | 'thanatos', options: {
  patch?: Partial<FitDoc>
  engine?: Partial<EngineClient>
  result?: Record<string, unknown>
  path?: string
} = {}) {
  const fit = { ...FitDocSchema.parse(advanced[name]), ...options.patch }
  const result = CalcResultSchema.parse({ ...expected[name], ...options.result })
  const calc = vi.fn(async (_fit: FitDoc) => result)
  const store = createFitStore(new IDBFactory())
  await store.save({ id: name, fit, itemNames: { ...result.itemNames, 21898: EMP, 10216: IMPLANT, 15479: EXILE }, openedAt: null })
  render(<MemoryRouter initialEntries={[`/fit/${name}${options.path ?? '?view=extras'}`]}>
    <FittingRoutes engine={{ ...mockEngine, calc, getDataVersion: async () => fit.dataVersion, ...options.engine }} store={store} />
  </MemoryRouter>)
  return { calc, store }
}

afterEach(() => {
  cleanup()
  resetSettings()
  sessionStorage.clear()
})

it('M06 edits cargo quantities, shows both volumes, and fills the remaining hold', async () => {
  const { calc } = await open('vexor', {
    patch: { cargo: [{ typeId: 21898, amount: 1000 }] },
    result: { extras: { items: { 21898: { iconId: 1286, graphicId: null, volume: 0.0025 } } } },
  })
  const row = (await screen.findByRole('link', { name: EMP.en })).closest('li')!
  expect(await within(row).findByText('0.0025 m³ each · 2.5 m³ total')).toBeTruthy()
  const quantity = within(row).getByRole('spinbutton', { name: /Quantity/ })
  fireEvent.change(quantity, { target: { value: '2000' } })
  fireEvent.blur(quantity)
  await waitFor(() => expect(calc.mock.lastCall?.[0].cargo[0]?.amount).toBe(2000))
  fireEvent.click(within(row).getByRole('button', { name: /Increase Quantity/ }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].cargo[0]?.amount).toBe(2001))
  fireEvent.click(within(row).getByRole('button', { name: 'Fill cargo' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].cargo[0]?.amount).toBe(expected.vexor.resources.cargo.total / 0.0025))
  expect(within(row).getByRole<HTMLButtonElement>('button', { name: 'Fill cargo' }).disabled).toBe(true)
})

it('M06 floors the number of units using the unrounded cargo capacity', async () => {
  const { calc } = await open('vexor', {
    patch: { cargo: [{ typeId: 21898, amount: 1 }] },
    result: { extras: { cargoCapacity: 479.99997, items: { 21898: { iconId: 1286, graphicId: null, volume: 0.0025 } } } },
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Fill cargo' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].cargo[0]?.amount).toBe(191999))
})

it('P05 splits and merges Hammerhead II stacks while preserving the active count and showing fitted performance', async () => {
  const { calc } = await open('vexor')
  const row = (await screen.findByRole('link', { name: 'Hammerhead II' })).closest('li')!
  expect(await within(row).findByText(/Range.*Speed.*HP/)).toBeTruthy()
  fireEvent.click(within(row).getByRole('button', { name: 'Split stack' }))
  const split = await screen.findByRole('dialog', { name: 'Split stack' })
  const amount = within(split).getByRole('spinbutton')
  fireEvent.change(amount, { target: { value: '1' } })
  fireEvent.click(within(split).getByRole('button', { name: 'Split stack' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].drones).toEqual([
    { typeId: 2185, amount: 4, active: 4 }, { typeId: 2185, amount: 1, active: 1 },
  ]))
  fireEvent.click(screen.getAllByRole('button', { name: 'Merge stacks' })[1]!)
  const merge = await screen.findByRole('dialog', { name: 'Merge stacks' })
  fireEvent.click(within(merge).getByRole('button', { name: /Hammerhead II.*×4/ }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].drones).toEqual(advanced.vexor.drones))
})

it('P06 groups fighters by squadron class and exposes engine limits, speed and HP', async () => {
  await open('thanatos')
  expect((await screen.findByRole('heading', { name: /Light fighters/ })).textContent).toMatch(/1\/3/)
  expect(screen.getByRole('heading', { name: /Heavy fighters/ }).textContent).toMatch(/0\/0/)
  expect(screen.getByRole('heading', { name: /Support fighters/ }).textContent).toMatch(/0\/2/)
  const row = screen.getByRole('link', { name: 'Dragonfly I' }).closest('li')!
  expect(within(row).getByText('6/6')).toBeTruthy()
  expect(within(row).getByText(/Speed.*HP/)).toBeTruthy()
})

it('P07 saves the fit implant source separately and applies a pyfa implant set by slot', async () => {
  updateSettings({ useCharacterImplants: true })
  const { calc, store } = await open('vexor', {
    patch: { implants: [10216] },
    result: { extras: { items: { 10216: { iconId: 2053, graphicId: null, slot: 1 } } } },
    engine: {
      implantSets: async () => [{ id: 3, name: { en: 'High-grade Snake', zh: '高级蝰蛇' },
        implants: [{ typeId: 19540, name: { en: 'High-grade Snake Alpha', zh: '高级蝰蛇—阿尔法型' }, slot: 1 }] }],
    },
  })
  const source = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Implant source' })
  expect(source.value).toBe('default')
  fireEvent.change(source, { target: { value: 'fit' } })
  await waitFor(async () => expect((await store.get('vexor'))?.fit).toMatchObject({ implantSource: 'fit' }))
  expect(getSettings().useCharacterImplants).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Apply Implant Set' }))
  const picker = await screen.findByRole('dialog', { name: 'Apply Implant Set' })
  fireEvent.click(await within(picker).findByRole('button', { name: 'High-grade Snake' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].implants).toEqual([19540]))
})

it('M07 shows the booster slot and independently persists side effect switches', async () => {
  const { calc, store } = await open('vexor', {
    patch: { boosters: [15479] },
    result: { extras: { items: { 15479: { iconId: 26613, graphicId: null, slot: 1, sideEffects: [
      { id: 2735, name: { en: 'Armor Capacity', zh: '装甲值惩罚' }, percent: -20 },
      { id: 2745, name: { en: 'Cap Capacity', zh: '电容容量惩罚' }, percent: -20 },
    ] } } } },
  })
  expect(await screen.findByText('Slot 1')).toBeTruthy()
  const armor = screen.getByRole('switch', { name: /Armor Capacity/ })
  const capacitor = screen.getByRole('switch', { name: /Cap Capacity/ })
  expect(armor.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(armor)
  fireEvent.click(capacitor)
  fireEvent.click(armor)
  await waitFor(() => expect(calc.mock.lastCall?.[0]).toMatchObject({ boosterSideEffects: { '15479': [2745] } }))
  await waitFor(async () => expect((await store.get('vexor'))?.fit).toMatchObject({ boosterSideEffects: { '15479': [2745] } }))
})

it('P18 shows available pyfa icons for all five kinds of extras', async () => {
  await open('vexor', {
    patch: { cargo: [{ typeId: 21898, amount: 1000 }], fighters: [{ typeId: 23057, amount: 6, active: false }],
      implants: [10216], boosters: [15479] },
    result: { itemNames: { ...expected.vexor.itemNames, ...expected.thanatos.itemNames }, extras: { items: {
      21898: { iconId: 1286, graphicId: null, volume: 0.0025 },
      2185: { iconId: 1084, graphicId: 1095 },
      23057: { iconId: 1084, graphicId: 2975 },
      10216: { iconId: 2053, graphicId: null, slot: 1 },
      15479: { iconId: 26613, graphicId: null, slot: 1 },
    } } },
  })
  for (const [name, url] of [
    [EMP.en, '/img/icons/1286.png'], [HAMMERHEAD.en, '/img/icons/1084.png'], ['Dragonfly I', '/img/icons/1084.png'],
    [IMPLANT.en, '/img/icons/2053.png'], [EXILE.en, '/img/icons/26613.png'],
  ] as const) {
    const row = (await screen.findByRole('link', { name })).closest('li')!
    await waitFor(() => expect(row.querySelector('img')?.getAttribute('src')).toBe(url))
  }
})

it('P18 keeps a cargo icon when the item image is unavailable', async () => {
  await open('vexor', {
    patch: { cargo: [{ typeId: 21898, amount: 1 }] },
    result: { extras: { items: { 21898: { iconId: 987654321, graphicId: null, volume: 0.0025 } } } },
  })
  const row = (await screen.findByRole('link', { name: EMP.en })).closest('li')!
  await waitFor(() => expect(row.querySelector('img')?.getAttribute('src')).toBe('/img/icons/987654321.png'))
  fireEvent.error(row.querySelector('img')!)
  expect(row.querySelector('img')?.getAttribute('src')).toBe('/img/icons/16.png')
})

it('M05 adds a market candidate to cargo without fitting it', async () => {
  sessionStorage.setItem('pyfa.addModule.query.high', JSON.stringify('autocannon'))
  const { calc } = await open('vexor', {
    path: '/add/high',
    engine: {
      marketTreeForSlot: undefined,
      itemsForSlot: async () => [{ meta: 'tech2', items: [item(2889, autocannon)], best: null }],
    },
  })
  expect(await screen.findByRole('button', { name: autocannon.en })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${autocannon.en}` }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add to cargo' }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].cargo).toEqual([{ typeId: 2889, amount: 1 }]))
  expect(calc.mock.lastCall?.[0].modules.high).toEqual([])
})

it('M05 sends a drone market candidate directly to the drone bay from cargo search', async () => {
  sessionStorage.setItem('pyfa.extraPicker.query', JSON.stringify('Hammerhead'))
  const drone = { ...item(2185, HAMMERHEAD), canAddToDroneBay: true }
  const { calc } = await open('vexor', {
    engine: { itemsForExtra: async () => [{ meta: 'tech2', items: [drone], best: null }] },
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Add cargo' }))
  fireEvent.click(await screen.findByRole('button', { name: `Add ${HAMMERHEAD.en} to drone bay` }))
  await waitFor(() => expect(calc.mock.lastCall?.[0].drones[0]?.amount).toBe(6))
  expect(calc.mock.lastCall?.[0].cargo).toEqual([])
})
