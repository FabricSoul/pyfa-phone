import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import type { EngineClient, ItemDetails } from '../engine/types'
import { setUiLanguage } from '../i18n/t'
import { resetSettings, updateSettings } from '../settings/settings'
import { createFitStore } from '../store/fits'

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output> }
function app(entries: string[], engine: EngineClient = mockEngine) {
  return render(<MemoryRouter initialEntries={entries}><FittingRoutes
    engine={engine} store={createFitStore(new IDBFactory())} /><Where /></MemoryRouter>)
}

beforeEach(async () => { localStorage.clear(); sessionStorage.clear(); resetSettings(); await setUiLanguage('en_US') })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('M03 wildcard market search', () => {
  it.each([['Gyro*', 'Gyrostabilizer II'], ['gyro stab*', 'Gyrostabilizer II'], ['*stabilizer II', 'Gyrostabilizer II']])(
    'the add page finds %s', async (term, name) => {
      app(['/fit/rifter/add/low'])
      fireEvent.change(await screen.findByRole('searchbox', { name: 'Search modules' }), { target: { value: term } })
      expect(await screen.findByRole('button', { name: new RegExp(name) }, { timeout: 4000 })).toBeTruthy()
    }, 12_000)
  it('finds Chinese names with a wildcard', async () => {
    updateSettings({ itemNameLanguage: 'zh' })
    app(['/fit/rifter/add/low'])
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: '回转*' } })
    expect(await screen.findByRole('button', { name: /回转稳定器 II/ }, { timeout: 4000 })).toBeTruthy()
  }, 12_000)
})

describe('M04 view the module in the market', () => {
  it('opens the add page with the module group expanded and the module highlighted', async () => {
    app(['/fit/rifter'])
    await screen.findByText('162.2/162.5', {}, { timeout: 4000 })
    fireEvent.click(screen.getAllByTestId('module-row')[0]!)
    const sheet = await screen.findByRole('dialog', { name: 'Module actions' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'View in market' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/fit/rifter/add/high?market=2889'))
    const row = await screen.findByRole('button', { name: /200mm AutoCannon II/ }, { timeout: 4000 })
    expect(row.getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: /Turrets & Launchers/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('button', { name: /200mm AutoCannon/ }).filter((b) => b.getAttribute('aria-current') === 'true')).toHaveLength(1)
  }, 12_000)

  it('drops a stored search so the tree is visible', async () => {
    sessionStorage.setItem('pyfa.addModule.query.high', JSON.stringify('Gyro'))
    app(['/fit/rifter/add/high?market=2889'])
    expect(await screen.findByRole('button', { name: /200mm AutoCannon II/ }, { timeout: 4000 })).toBeTruthy()
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
  }, 12_000)
})

describe('P04 best value before opening a group', () => {
  it('shows the best value on collapsed headers on first entry', async () => {
    const itemsForSlot: EngineClient['itemsForSlot'] = async (...args) => (await mockEngine.itemsForSlot(...args)).map((group) => ({
      ...group, best: 42.5, items: group.items.map((item) => ({ ...item, keyValue: 42.5, keyLine: '42.5 dmg' })),
    }))
    sessionStorage.setItem('pyfa.addModule.market.low', JSON.stringify({ branch: [14, 615] }))
    app(['/fit/rifter/add/low'], { ...mockEngine, itemsForSlot })
    expect((await screen.findAllByText(/best 42\.5/, {}, { timeout: 4000 })).length).toBeGreaterThan(0)
  }, 12_000)
})

describe('D01 variations compare with the fitted module', () => {
  const withCompare: EngineClient = {
    ...mockEngine,
    variationsOf: async (typeId, ...rest) => (await mockEngine.variationsOf(typeId, ...rest)).map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, compare: { damage: -0.041, cpu: -2, cpuLeft: 0.3 + 3 * 2 } })),
    })),
  }
  it('shows the current module apart from the candidates, with damage, CPU and remaining CPU deltas', async () => {
    const variationsOf = vi.fn(withCompare.variationsOf)
    app(['/fit/rifter/variations/high-0'], { ...withCompare, variationsOf })
    const current = await screen.findByRole('region', { name: 'Current module' }, { timeout: 4000 })
    expect(within(current).getByText(/200mm AutoCannon II/)).toBeTruthy()
    expect(within(current).queryByRole('button')).toBeNull()
    await waitFor(() => expect(variationsOf).toHaveBeenCalledWith(2889, expect.anything(), { slot: 'high', index: 0 }, 3))
    const candidates = await screen.findAllByRole('button', { name: /AutoCannon/ })
    expect(candidates.some((button) => /^200mm AutoCannon II/.test(button.textContent ?? ''))).toBe(false)
    expect(candidates[0]!.textContent).toMatch(/Damage −4\.1% · CPU −2 · CPU left 6\.3/)
    expect(screen.getByText(/Current: 200mm AutoCannon II ×3 · CPU left 0\.25/)).toBeTruthy()
  }, 12_000)
  it('writes ±0 for an unchanged damage multiplier and omits damage when there is none', async () => {
    let count = 0
    const engine: EngineClient = {
      ...mockEngine,
      variationsOf: async (typeId, ...rest) => (await mockEngine.variationsOf(typeId, ...rest)).map((group) => ({
        ...group, items: group.items.map((item) => ({ ...item, compare: { damage: count++ % 2 ? null : 0, cpu: 0, cpuLeft: 0.3 } })),
      })),
    }
    app(['/fit/rifter/variations/high-0'], engine)
    await screen.findAllByRole('button', { name: /AutoCannon/ })
    for (const header of screen.getAllByRole('button', { expanded: false })) fireEvent.click(header)
    const buttons = screen.getAllByRole('button', { name: /AutoCannon/ })
    expect(buttons.some((b) => /Damage ±0 · CPU 0 · CPU left 0\.3/.test(b.textContent ?? ''))).toBe(true)
    expect(buttons.some((b) => /^[^·]*CPU 0 · CPU left/.test(b.textContent ?? '') && !/Damage/.test(b.textContent ?? ''))).toBe(true)
  }, 12_000)
})

describe('P14 item information', () => {
  const info: ItemDetails = {
    typeId: 587, name: { en: 'Rifter', zh: '裂谷级' }, iconId: null, attributes: [], skills: [],
    traits: [
      { header: { en: 'Minmatar Frigate bonuses (per skill level):', zh: '米玛塔尔护卫舰操作每升一级：' },
        bonuses: [{ en: '7.5% bonus to Small Projectile Turret rate of fire', zh: '7.5% 小型射弹炮台射速加成' }] },
      { header: { en: 'Role Bonus:', zh: '舰船职能加成：' }, bonuses: [{ en: '99% reduction in heat damage', zh: '热损伤降低99%' }] },
    ],
    skillTree: [{ typeId: 3319, name: { en: 'Small Projectile Turret', zh: '小型射弹炮台' }, requiredLevel: 5, currentLevel: 3, requires: [
      { typeId: 3300, name: { en: 'Gunnery', zh: '炮术' }, requiredLevel: 1, currentLevel: 5, requires: [] },
    ] }],
  }
  const engine: EngineClient = { ...mockEngine, itemInfo: async () => info }

  it('has its own ship traits section grouped by skill', async () => {
    app(['/item/587'], engine)
    fireEvent.click(await screen.findByRole('radio', { name: 'Traits' }, { timeout: 4000 }))
    expect(screen.getByRole('heading', { name: 'Ship traits' })).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Minmatar Frigate bonuses (per skill level):' })
    expect(within(group).getByText(/Small Projectile Turret rate of fire/)).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Role Bonus:' })).toBeTruthy()
  })
  it('hides the traits tab for items without traits', async () => {
    app(['/item/2889'], { ...mockEngine, itemInfo: async () => ({ ...info, traits: undefined }) })
    await screen.findByRole('radio', { name: 'Requirements' }, { timeout: 4000 })
    expect(screen.queryByRole('radio', { name: 'Traits' })).toBeNull()
  })
  it('shows requirements as a tree whose skills link to their own information', async () => {
    app(['/item/2889'], engine)
    fireEvent.click(await screen.findByRole('radio', { name: 'Requirements' }, { timeout: 4000 }))
    const top = screen.getByRole('link', { name: /Small Projectile Turret/ })
    expect(top.textContent).toContain('3/5')
    const nested = within(top.closest('li')!).getByRole('link', { name: /Gunnery/ })
    expect(nested.textContent).toContain('5/1')
    expect(nested.closest('ul')).not.toBe(top.closest('ul'))
    fireEvent.click(nested)
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/item/3300'))
  })
})
