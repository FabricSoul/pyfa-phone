import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import merlin from '../engine/fixtures/merlin.json'
import rifter from '../engine/fixtures/rifter.json'
import { fmt } from './format'
import { CalcResultSchema } from '../engine/types'
import { StatsPage } from './StatsPage'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const stable = CalcResultSchema.parse(merlin)
const unstable = CalcResultSchema.parse(rifter)

describe('StatsPage capacitor', () => {
  it('uses the normal colour when stable', () => {
    const cap = { ...stable.stats.capacitor, stable: true, stablePercent: 49.2, lastsSeconds: null }
    render(<StatsPage result={{ ...stable, stats: { ...stable.stats, capacitor: cap } }} />)
    const status = screen.getByTestId('cap-status')
    expect(status.textContent).toContain('49.2')
    expect(status.className).not.toContain('warn')
    expect(status.dataset.warn).toBe('false')
  })

  it('uses the warning colour when it runs dry', () => {
    render(<StatsPage result={unstable} />)
    const status = screen.getByTestId('cap-status')
    expect(unstable.stats.capacitor.stable).toBe(false)
    expect(status.className).toContain('warn')
  })

  it('panels collapse on click', () => {
    render(<StatsPage result={unstable} />)
    const head = screen.getByRole('button', { name: /Capacitor/ })
    expect(head.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('StatsPage panels', () => {
  it('collapses panels without data by default and says "None"', () => {
    const noRemote = { ...unstable, stats: { ...unstable.stats, remoteRepair: { shield: 0, armor: 0, hull: 0, capacitor: 0 } } }
    render(<StatsPage result={noRemote} />)
    const head = screen.getByRole('button', { name: /Remote Repairs/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(head.textContent).toContain('None')
  })

  it('remembers collapsed panels in localStorage', () => {
    const first = render(<StatsPage result={unstable} />)
    fireEvent.click(screen.getByRole('button', { name: /Capacitor/ }))
    first.unmount()
    render(<StatsPage result={unstable} />)
    expect(screen.getByRole('button', { name: /Capacitor/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('does not break when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<StatsPage result={unstable} />)
    fireEvent.click(screen.getByRole('button', { name: /Capacitor/ }))
    expect(screen.getByRole('button', { name: /Capacitor/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the setting pills under the panel titles', () => {
    render(<StatsPage result={unstable} settings={{ targetProfile: 'Frigate', damagePattern: 'Uniform' }} />)
    expect(screen.getByRole('button', { name: /Target Resists/ }).textContent).toContain('Frigate')
    expect(screen.getByRole('button', { name: /Factor in Reload Time/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Incoming damage pattern/ }).textContent).toContain('Uniform')
    expect(screen.getByRole('button', { name: 'EHP' })).toBeTruthy()
  })

  it('lists the price breakdown from the prices prop', () => {
    render(<StatsPage result={unstable} prices={{ ship: 400000, fit: 1500000, lines: [{ label: 'Implants', value: 12000 }] }} />)
    expect(screen.getByText('Implants')).toBeTruthy()
    expect(screen.getByText(/12,000/)).toBeTruthy()
    expect(screen.getByText(/1,500,000/)).toBeTruthy()
  })
})

it('switches the defense summary and the repair units between EHP and HP', () => {
  render(<StatsPage result={unstable} />)
  const defense = screen.getByRole('button', { name: /^Defense/ })
  expect(defense.textContent).toContain(`EHP ${fmt(unstable.stats.defense.ehp, 0)}`)
  expect(screen.getAllByText('EHP/s').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'HP' }))
  expect(defense.textContent).toContain(`HP ${fmt(unstable.stats.defense.hp, 0)}`)
  expect(screen.getAllByText('HP/s').length).toBeGreaterThan(0)
})

describe('StatsPage motion', () => {
  it('rolls the headline numbers (DPS, EHP) instead of jumping', () => {
    render(<StatsPage result={unstable} />)
    const rolling = screen.getAllByTestId('rolling').map((el) => Number(el.getAttribute('data-value')))
    expect(rolling).toContain(unstable.stats.firepower.dps)
    expect(rolling).toContain(unstable.stats.defense.layers.shield.ehp)
  })
  it('lets a collapsed panel close by height: its body leaves after the animation, not at the click', async () => {
    render(<StatsPage result={unstable} />)
    expect(screen.getByTestId('cap-status')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Capacitor/ }))
    await waitFor(() => expect(screen.queryByTestId('cap-status')).toBeNull(), { timeout: 2000 })
  })
})
