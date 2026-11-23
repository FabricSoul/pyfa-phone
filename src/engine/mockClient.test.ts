import { describe, expect, it } from 'vitest'
import { mockEngine, sampleFits } from './mockClient'
import { META_GROUPS, isCalcResult } from './types'

describe('mockEngine', () => {
  it('has the three sample fits', () => {
    expect(Object.keys(sampleFits).sort()).toEqual(['merlin', 'rifter', 'thrasher'])
  })

  it('calc returns the fixture for the ship, as a copy', async () => {
    const a = await mockEngine.calc(sampleFits.rifter)
    expect(isCalcResult(a)).toBe(true)
    expect(a.ship.name.en).toBe('Rifter')
    a.stats.firepower.dps = 0
    const b = await mockEngine.calc(sampleFits.rifter)
    expect(b.stats.firepower.dps).toBeCloseTo(180.9, 1)
  })

  it('calc rejects ships it has no fixture for', async () => {
    await expect(mockEngine.calc({ ...sampleFits.rifter, shipTypeId: 1 })).rejects.toThrow()
  })

  it('itemsForSlot groups by tech level in display order and filters by query', async () => {
    const groups = await mockEngine.itemsForSlot(sampleFits.rifter, 'high')
    const order = groups.map((g) => META_GROUPS.indexOf(g.meta))
    expect(order).toEqual([...order].sort((x, y) => x - y))
    expect(groups.flatMap((g) => g.items).some((i) => i.name.en === '200mm AutoCannon II')).toBe(true)
    const zh = await mockEngine.itemsForSlot(sampleFits.rifter, 'high', '自动加农炮')
    expect(zh.flatMap((g) => g.items).every((i) => i.name.zh.includes('自动加农炮'))).toBe(true)
  })

  it('chargesFor lists charges with the best value per group', async () => {
    const groups = await mockEngine.chargesFor(sampleFits.rifter, { slot: 'high', index: 0 })
    expect(groups[0]?.meta).toBe('tech2')
    const names = groups.flatMap((g) => g.items.map((i) => i.name.en))
    expect(names).toContain('Republic Fleet EMP S')
    for (const g of groups) {
      expect(g.best).toBe(Math.max(...g.items.map((i) => i.keyValue ?? -Infinity)))
    }
  })

  it('variationsOf returns the meta family', async () => {
    const groups = await mockEngine.variationsOf(2889)
    const names = groups.flatMap((g) => g.items.map((i) => i.name.en))
    expect(names).toContain('200mm AutoCannon I')
    expect(await mockEngine.variationsOf(-5)).toEqual([])
  })

  it('demo EFT import substitutes the sample fit and reports that limitation', async () => {
    const eft = await mockEngine.exportText(sampleFits.rifter, 'eft')
    expect(eft.split('\n')[0]).toBe('[Rifter, 裂谷级 · 示例]')
    expect(eft).toContain('200mm AutoCannon II, Republic Fleet EMP S')
    expect(eft).toContain('[Empty Low slot]')
    const back = await mockEngine.importText(eft.replaceAll('200mm AutoCannon II', 'Unknown module'))
    expect(back.fits[0]?.modules).toEqual(sampleFits.rifter.modules)
    expect(back.warnings).toEqual(['Demo import loads the sample fitting for this ship'])
  })
})
