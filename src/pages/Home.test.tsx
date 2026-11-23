import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FittingRoutes } from '../App'
import { mockEngine } from '../engine/mockClient'
import type { CalcResult, EngineClient } from '../engine/types'
import { setUiLanguage } from '../i18n/t'
import { resetSettings } from '../settings/settings'
import { createFitStore, type FitStore } from '../store/fits'

beforeEach(async () => { localStorage.clear(); resetSettings(); await setUiLanguage('en_US') })
afterEach(cleanup)

function home(store: FitStore = createFitStore(new IDBFactory()), engine: Partial<EngineClient> = {}) {
  return render(<MemoryRouter><FittingRoutes engine={{ ...mockEngine, ...engine }} store={store} /></MemoryRouter>)
}

describe('home A: quick entries and top bar', () => {
  it('has three quick entries: New fit (primary, to the ship browser), Paste to import, Browse ships', async () => {
    home()
    const quick = within(await screen.findByRole('navigation', { name: 'Quick actions' }))
    const links = quick.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['New fit', 'Paste to import', 'Browse ships'])
    expect(links[0]!.className).toContain('primary')
    expect(links[0]!.getAttribute('href')).toBe('/?new')
    expect(links[1]!.getAttribute('href')).toBe('/import')
    expect(links[2]!.getAttribute('href')).toBe('/?new')
  })
  it('puts search behind a top icon and settings next to it', async () => {
    home()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    fireEvent.click(await screen.findByRole('button', { name: 'Search fits or ships' }))
    const box = screen.getByRole('searchbox', { name: 'Search fits or ships' })
    fireEvent.change(box, { target: { value: 'zzz-nothing' } })
    expect(await screen.findByText('No matching fits')).toBeTruthy()
  })
  it('keeps About in the footer', async () => {
    home()
    expect((await screen.findByRole('link', { name: 'About' })).closest('footer')).toBeTruthy()
  })
})

describe('home A: continue where you left off', () => {
  it('is not shown without a recently opened fit', async () => {
    home()
    await screen.findAllByTestId('fit-row')
    expect(screen.queryByTestId('resume-card')).toBeNull()
  })
  it('shows the last opened fit as a dark card with render, ship type, four key numbers with pyfa icons and the tank bar', async () => {
    const store = createFitStore(new IDBFactory())
    await store.touch('merlin', 1)
    await store.touch('rifter', Date.now())
    home(store)
    const card = await screen.findByTestId('resume-card')
    await waitFor(() => expect(within(card).getByText('DPS')).toBeTruthy())
    expect(card.getAttribute('href')).toBe('/fit/rifter')
    expect(card.getAttribute('data-appearance')).toBe('dark')
    expect(within(card).getByText(/Continue/)).toBeTruthy()
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe('裂谷级 · 示例')
    expect(card.querySelector('img.rimg')?.getAttribute('src')).toBe('/img/renders/46.png')
    expect(within(card).getByText('Frigate', { exact: false })).toBeTruthy()
    const numbers = [...card.querySelectorAll('.k > div')]
    expect(numbers.map((n) => n.querySelector('b')?.textContent)).toEqual(['180.9', '2,955', '1,193', '1:03'])
    expect(numbers.map((n) => n.querySelector('img')?.getAttribute('src'))).toEqual([
      '/img/gui/turret_big.png', '/img/gui/shieldActive_big.png', '/img/gui/maxVelocity_big.png', '/img/gui/capacitorInfo_big.png'])
    const tank = [...card.querySelectorAll('[data-testid="tank"] i')] as HTMLElement[]
    expect(tank.map((i) => Number(i.style.flexGrow))).toEqual([562.5, 562.5, 437.5])
  })
  it('shows the most recent fit only once: not repeated as a "recently opened" strip', async () => {
    const store = createFitStore(new IDBFactory())
    await store.touch('rifter', Date.now())
    home(store)
    await screen.findByTestId('resume-card')
    expect(screen.queryByText('Recently opened')).toBeNull()
  })
})

describe('home A: grouped list', () => {
  it('gives each row a 48px render, three icon stats and CPU / grid margin bars', async () => {
    home()
    const row = (await screen.findAllByTestId('fit-row')).find((r) => r.textContent?.includes('裂谷级'))!
    await waitFor(() => expect(row.querySelectorAll('.stat img').length).toBe(3))
    expect(row.querySelector('.rd img')?.getAttribute('src')).toBe('/img/renders/46.png')
    expect([...row.querySelectorAll('.stat img')].map((i) => i.getAttribute('src'))).toEqual([
      '/img/gui/turret_big.png', '/img/gui/shieldActive_big.png', '/img/gui/maxVelocity_big.png'])
    const cpu = within(row).getByTestId('cpu-bar')
    const grid = within(row).getByTestId('grid-bar')
    expect(cpu.getAttribute('data-over')).toBe('false')
    expect((cpu.firstElementChild as HTMLElement).style.width).toBe('99.8%')
    expect((grid.firstElementChild as HTMLElement).style.width).toBe('58.4%')
  })
  it('turns an overflowing row red: the bar, and the text that says by how much', async () => {
    const engine: Partial<EngineClient> = {
      async calc(fit, options) {
        const result: CalcResult = structuredClone(await mockEngine.calc(fit, options))
        result.resources.cpu = { used: 168, total: 162.5 }
        result.warnings = [{ kind: 'cpu', used: 168, total: 162.5 }]
        return result
      },
    }
    home(undefined, engine)
    const over = await waitFor(() => {
      const found = screen.getAllByTestId('fit-row').find((r) => r.getAttribute('data-over') === 'true')
      if (!found) throw new Error('no over row yet')
      return found
    })
    expect(within(over).getByTestId('cpu-bar').getAttribute('data-over')).toBe('true')
    expect(over.textContent).toContain('CPU Over 5.5')
  })
  it('groups rows by ship type with a count', async () => {
    home()
    await screen.findAllByTestId('fit-row')
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Frigate' })).toBeTruthy())
  })
  it('holds stat places with skeletons until the engine answers, then shows the numbers', async () => {
    let answer: (result: CalcResult) => void = () => {}
    const waiting = new Promise<CalcResult>((resolve) => { answer = resolve })
    const { container } = home(undefined, { calc: () => waiting })
    const rows = await screen.findAllByTestId('fit-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.querySelectorAll('.sk').length).toBeGreaterThan(0)
    expect(container.querySelector('.stat img')).toBeNull()
    answer(await mockEngine.calc((await createFitStore(new IDBFactory()).get('rifter'))!.fit))
    await waitFor(() => expect(screen.getAllByTestId('fit-row')[0]!.querySelectorAll('.sk').length).toBe(0))
  })
})

describe('UX3: the library is not recalculated on every visit', () => {
  const counted = () => {
    const calls: string[] = []
    const engine: Partial<EngineClient> = { calc: (fit, options) => { calls.push(fit.name); return mockEngine.calc(fit, options) } }
    return { calls, engine: { ...mockEngine, ...engine } as EngineClient }
  }
  it('shows cached numbers at once when the page is mounted again, without calling the engine', async () => {
    const store = createFitStore(new IDBFactory())
    const { calls, engine } = counted()
    const first = render(<MemoryRouter><FittingRoutes engine={engine} store={store} /></MemoryRouter>)
    await waitFor(() => expect(first.container.querySelectorAll('.sk').length).toBe(0))
    await waitFor(() => expect(screen.getAllByTestId('fit-row').length).toBeGreaterThan(0))
    const firstCount = calls.length
    expect(firstCount).toBeGreaterThan(0)
    first.unmount()
    const second = render(<MemoryRouter><FittingRoutes engine={engine} store={store} /></MemoryRouter>)
    // The first paint already has the numbers: no skeleton, no pending row.
    expect(second.container.querySelectorAll('.sk').length).toBe(0)
    expect(screen.getAllByTestId('fit-row').length).toBeGreaterThan(0)
    expect(second.container.querySelector('.stat img')).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls.length).toBe(firstCount)
  })
  it('recalculates only the fit that was edited', async () => {
    const store = createFitStore(new IDBFactory())
    const { calls, engine } = counted()
    const first = render(<MemoryRouter><FittingRoutes engine={engine} store={store} /></MemoryRouter>)
    await waitFor(() => expect(first.container.querySelectorAll('.sk').length).toBe(0))
    await waitFor(() => expect(screen.getAllByTestId('fit-row').length).toBeGreaterThan(1))
    first.unmount()
    calls.length = 0
    const record = (await store.get('rifter'))!
    await store.save({ ...record, fit: { ...record.fit, name: 'Edited rifter' } })
    render(<MemoryRouter><FittingRoutes engine={engine} store={store} /></MemoryRouter>)
    await screen.findByText('Edited rifter')
    await waitFor(() => expect(screen.getAllByTestId('fit-row').every((row) => row.querySelector('.sk') === null)).toBe(true))
    expect(calls).toEqual(['Edited rifter'])
  })
})
