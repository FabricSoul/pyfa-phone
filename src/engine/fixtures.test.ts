import { describe, expect, it } from 'vitest'
import { isCalcResult, type CalcResult, type SlotRow } from './types'
import rifter from './fixtures/rifter.json'
import merlin from './fixtures/merlin.json'
import thrasher from './fixtures/thrasher.json'

const fixtures: Record<string, unknown> = { rifter, merlin, thrasher }

function load(name: string): CalcResult {
  const x = fixtures[name]
  if (!isCalcResult(x)) throw new Error(`${name} fixture is not a CalcResult`)
  return x
}

const moduleRows = (rows: SlotRow[]) => rows.filter((r) => r.kind === 'module')

describe('engine fixtures', () => {
  it.each(Object.keys(fixtures))('%s passes isCalcResult', (name) => {
    expect(isCalcResult(fixtures[name])).toBe(true)
  })

  it('isCalcResult rejects malformed data', () => {
    expect(isCalcResult(null)).toBe(false)
    expect(isCalcResult({})).toBe(false)
    expect(isCalcResult({ ...rifter, stats: undefined })).toBe(false)
  })

  it('rifter matches the all-V reference numbers', () => {
    const r = load('rifter')
    expect(r.stats.firepower.dps).toBeCloseTo(180.9, 1)
    expect(r.stats.firepower.volley).toBeCloseTo(249.5, 1)
    expect(r.stats.defense.ehp).toBeCloseTo(2955, 0)
    expect(r.stats.defense.layers.shield.ehp).toBeCloseTo(887, 0)
    expect(r.stats.defense.layers.armor.ehp).toBeCloseTo(980, 0)
    expect(r.stats.defense.layers.hull.ehp).toBeCloseTo(1088, 0)
    expect(r.resources.cpu.used).toBeCloseTo(162.2, 0)
    expect(r.resources.cpu.total).toBeCloseTo(162.5, 1)
    expect(r.resources.powergrid.used).toBeCloseTo(32.9, 1)
    expect(r.resources.calibration).toEqual({ used: 400, total: 400 })
    expect(r.stats.navigation.maxVelocity).toBeCloseTo(1193, 0)
    expect(r.stats.navigation.alignTime).toBeCloseTo(4.69, 2)
    expect(r.stats.capacitor.stable).toBe(false)
    expect(r.stats.capacitor.lastsSeconds).toBe(63)
    expect(r.warnings).toEqual([])
  })

  it('thrasher and merlin match their reference DPS and EHP', () => {
    const t = load('thrasher')
    expect(t.stats.firepower.dps).toBeCloseTo(382.0, 1)
    expect(t.stats.defense.ehp).toBeCloseTo(6064, 0)
    const m = load('merlin')
    expect(m.stats.firepower.dps).toBeCloseTo(162.9, 1)
    expect(m.stats.defense.ehp).toBeCloseTo(7845, 0)
  })

  it('rifter merges its three autocannons into one high-slot row', () => {
    const rows = moduleRows(load('rifter').slots.high)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.kind === 'module' && row.count).toBe(3)
    if (row.kind !== 'module') return
    expect(row.name.en).toBe('200mm AutoCannon II')
    expect(row.charge?.name.en).toBe('Republic Fleet EMP S')
    expect(row.keyLine).not.toBe('')
  })

  it('rifter keeps its empty low slot as a row', () => {
    const empty = load('rifter').slots.low.filter((r) => r.kind === 'empty')
    expect(empty.reduce((n, r) => n + r.count, 0)).toBe(1)
  })

  it('merlin warns about CPU, powergrid and calibration', () => {
    const m = load('merlin')
    const kinds = m.warnings.map((w) => w.kind).sort()
    expect(kinds).toEqual(['calibration', 'cpu', 'powergrid'])
    const cpu = m.warnings.find((w) => w.kind === 'cpu')!
    expect(cpu.used).toBeCloseTo(230.5, 1)
    expect(cpu.total).toBeCloseTo(225, 1)
  })

  it('range curve covers 0–30 km with the current ammo first', () => {
    const r = load('rifter')
    expect(r.rangeCurve.distancesKm).toHaveLength(31)
    const first = r.rangeCurve.series[0]!
    const guns = moduleRows(r.slots.high)[0]
    if (guns?.kind !== 'module') throw new Error('no guns')
    expect(first.chargeTypeId).toBe(guns.charge?.typeId)
    expect(first.dps).toHaveLength(31)
    expect(r.rangeCurve.series.length).toBeLessThanOrEqual(3)
  })
})
