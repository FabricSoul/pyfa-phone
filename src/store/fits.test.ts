import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { sampleFits } from '../engine/mockClient'
import { createFitStore, resolveStoredItems } from './fits'

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
