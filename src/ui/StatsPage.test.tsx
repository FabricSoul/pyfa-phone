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

it('P08 labels weapon, drone, and total DPS and marks a target profile as effective', () => {
  const settings = { targetProfile: 'Uniform (25%)' }
  const base = { ...unstable, stats: { ...unstable.stats, firepower: { ...unstable.stats.firepower, effective: false } } }
  const page = render(<StatsPage result={base} settings={settings} />)
  for (const label of ['Weapon DPS', 'Drone DPS', 'Total DPS', 'Volley']) expect(screen.getByText(label)).toBeTruthy()
  const calculated = { ...base, stats: { ...base.stats, firepower: { ...base.stats.firepower, effective: true } } }
  page.rerender(<StatsPage result={calculated} settings={settings} />)
  expect(screen.getByText('Effective DPS')).toBeTruthy()
})

it('M08 opens firepower for a mining-only fit and lets the pilot switch views', () => {
  const result = { ...unstable, stats: { ...unstable.stats,
    firepower: { dps: 0, weaponDps: 0, droneDps: 0, volley: 0, includesReload: false },
    mining: { miner: 2.5, drone: 0, total: 2.5, unit: 'm³/s' as const },
  } }
  render(<StatsPage result={result} />)
  expect(screen.getByRole('button', { name: 'Firepower' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('Total mining yield')).toBeTruthy()
  expect(screen.getAllByText('m³/s')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Mining yield' }))
  expect(screen.getByText('Weapon DPS')).toBeTruthy()
})

it('P09 shows the selected incoming damage distribution without opening the picker', () => {
  render(<StatsPage result={unstable} settings={{ damagePattern: 'EM', damageRatios: { em: 10, thermal: 0, kinetic: 0, explosive: 0 } }} />)
  expect(screen.getByText('EM 100%')).toBeTruthy()
})

it('P10 shows reinforced and sustained repairs together', () => {
  render(<StatsPage result={unstable} />)
  expect(screen.getByText('Reinforced').tagName).not.toBe('BUTTON')
  expect(screen.getByText('Sustained').tagName).not.toBe('BUTTON')
})

it('P11 formats capacitor duration and neutralizer resistance', () => {
  const capacitor = { ...unstable.stats.capacitor, lastsSeconds: 63.1, neutralizerResistance: 0.24 }
  render(<StatsPage result={{ ...unstable, stats: { ...unstable.stats, capacitor } }} />)
  expect(screen.getByTestId('cap-status').textContent).toContain('1 min 3 s')
  expect(screen.getByText('Neutralizer resistance').parentElement?.textContent).toContain('24%')
})

it('P12/P13 shows navigation details, specialized bays, and squadron resources', () => {
  const navigation = { ...unstable.stats.navigation, alignTime: 4.25, sensorType: 'ladar' as const, jamChance: 15,
    agility: 2, maxWarpDistance: 45, warpCoreStrength: 1, lockTimes: [{ target: 'frigate' as const, seconds: 4.67 }] }
  const resources = { ...unstable.resources, specializedBays: { generalMiningHoldCapacity: 5000 },
    activeDrones: { used: 2, total: 5 }, fighterBay: { used: 100, total: 300 }, fighterTubes: { used: 1, total: 3 } }
  render(<StatsPage result={{ ...unstable, stats: { ...unstable.stats, navigation }, resources }} />)
  expect(screen.getByText('Align time').parentElement?.textContent).toBe('Align time4.2 s')
  for (const label of ['Ladar', 'Jam chance', 'Agility', 'Max warp distance', 'Warp core strength', 'Mining hold', 'Active drones', 'Fighter bay', 'Fighter tubes']) {
    expect(screen.getByText(label)).toBeTruthy()
  }
  fireEvent.click(screen.getByText('Lock Times'))
  expect(screen.getByText('Frigate').parentElement?.textContent).toContain('4.7')
})
