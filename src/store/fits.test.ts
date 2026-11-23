import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { sampleFits } from '../engine/mockClient'
import { createFitStore, parseBackup, resolveStoredItems } from './fits'

describe('stored fits', () => {
  it('seeds once and preserves saved content across connections', async () => {
    const db = new IDBFactory()
    const store = createFitStore(db)
    const initial = await store.list()
    expect(initial).toHaveLength(3)
    const rifter = initial.find((record) => record.id === 'rifter')!
    await store.save({ ...rifter, fit: { ...rifter.fit, notes: 'Keep at range' } })
    await store.remove('merlin')
    const reopened = createFitStore(db)
    expect(await reopened.list()).toHaveLength(2)
    expect((await reopened.get('rifter'))?.fit.notes).toBe('Keep at range')
  })

  it('embeds legacy and newly remembered names in the saved FitDoc', async () => {
    const store = createFitStore(new IDBFactory())
    const name = { en: 'Retired charge', zh: '旧弹药' }
    const fit = { ...sampleFits.rifter, cargo: [{ typeId: 987, amount: 1 }] }
    await store.save({ id: 'legacy', fit, openedAt: null, itemNames: { 987: name } })
    expect((await store.get('legacy'))?.fit.itemNames?.[987]).toEqual(name)
    await store.rememberNames('legacy', { 988: name })
    expect((await store.get('legacy'))?.fit.itemNames?.[988]).toEqual(name)
  })

  it('retains the original name and type ID for items absent after a data update', async () => {
    const fit = structuredClone(sampleFits.rifter)
    fit.cargo = [{ typeId: 987, amount: 4 }]
    const record = {
      id: 'custom', fit, openedAt: null,
      itemNames: { 987: { en: 'Retired charge', zh: '旧弹药' } },
    }
    const resolved = await resolveStoredItems(record, 'new', async (id) => id === 987 ? null : { en: 'Live', zh: '有效' })
    expect(resolved.removed).toEqual([{ typeId: 987, name: { en: 'Retired charge', zh: '旧弹药' } }])
    expect(record.fit.cargo).toEqual([{ typeId: 987, amount: 4 }])
    expect(record.fit.dataVersion).toBe(fit.dataVersion)
  })
})

describe('backup restore', () => {
  const valid = () => structuredClone(sampleFits.rifter)

  it('rejects empty arrays, null entries, empty objects and non-arrays as a whole', () => {
    for (const text of ['[]', '[null]', '[{}]', JSON.stringify([valid(), null]), JSON.stringify([valid(), {}]), '{"a":1}', 'not json']) {
      expect(parseBackup(text).ok, text).toBe(false)
    }
  })

  it('accepts a valid file', () => {
    const parsed = parseBackup(JSON.stringify([valid(), valid()]))
    expect(parsed.ok && parsed.fits).toHaveLength(2)
  })

  it('replaces every stored fit in one transaction', async () => {
    const store = createFitStore(new IDBFactory())
    expect((await store.list()).length).toBeGreaterThan(0)
    await store.restore([{ ...valid(), name: 'Restored' }], 'replace')
    expect((await store.list()).map((r) => r.fit.name)).toEqual(['Restored'])
  })

  it('merge keeps the existing fits and adds the new ones', async () => {
    const store = createFitStore(new IDBFactory())
    const before = (await store.list()).length
    await store.restore([{ ...valid(), name: 'Added' }], 'merge')
    const names = (await store.list()).map((r) => r.fit.name)
    expect(names).toHaveLength(before + 1)
    expect(names).toContain('Added')
  })

  it('leaves the old fits intact when a write fails halfway', async () => {
    const store = createFitStore(new IDBFactory())
    const before = (await store.list()).map((r) => r.id).sort()
    const bad = { ...valid(), name: (() => 1) as unknown as string }
    await expect(store.restore([valid(), bad], 'replace')).rejects.toBeTruthy()
    expect((await store.list()).map((r) => r.id).sort()).toEqual(before)
  })
})
