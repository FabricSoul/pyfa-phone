import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createFitStore, exampleFitDocs, examplesEnabled, type StoredFit } from './fits'

/** A database exactly as version 1 left it: every example written, some of them opened or edited since. */
async function legacyDatabase(edit: (records: StoredFit[]) => StoredFit[]) {
  const factory = new IDBFactory()
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('pyfa-phone', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('fits', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const records = edit(exampleFitDocs.map(({ id, fit }) => ({ id, fit, openedAt: null, itemNames: {} })))
  await new Promise<void>((resolve) => {
    const transaction = database.transaction('fits', 'readwrite')
    for (const record of records) transaction.objectStore('fits').put({ ...record, fit: { ...record.fit, itemNames: record.itemNames } })
    transaction.oncomplete = () => resolve()
  })
  database.close()
  return factory
}

describe('example fits', () => {
  it('a new database holds no examples unless they are switched on', async () => {
    expect(await createFitStore(new IDBFactory(), 'pyfa-phone', { examples: false }).list()).toEqual([])
    expect(await createFitStore(new IDBFactory(), 'pyfa-phone', { examples: true }).list()).toHaveLength(exampleFitDocs.length)
  })
  it('is on in development and with the localStorage flag or ?examples=1, off otherwise', () => {
    expect(examplesEnabled({ dev: false, flag: null, search: '' })).toBe(false)
    expect(examplesEnabled({ dev: true, flag: null, search: '' })).toBe(true)
    expect(examplesEnabled({ dev: false, flag: '1', search: '' })).toBe(true)
    expect(examplesEnabled({ dev: false, flag: null, search: '?examples=1' })).toBe(true)
    expect(examplesEnabled({ dev: false, flag: '0', search: '?examples=0' })).toBe(false)
  })
  it('upgrading removes examples the user never changed and keeps the ones they did', async () => {
    const factory = await legacyDatabase((records) => records.map((record) => {
      if (record.id === 'rifter') return { ...record, fit: { ...record.fit, notes: 'my notes' } }
      if (record.id === 'merlin') return { ...record, openedAt: 5, itemNames: { 1: { en: 'a', zh: 'b' } } }
      return record
    }).concat({ id: 'mine', fit: { ...exampleFitDocs[0]!.fit, name: 'Mine' }, openedAt: null, itemNames: {} }))
    const store = createFitStore(factory, 'pyfa-phone', { examples: false })
    const ids = (await store.list()).map((record) => record.id).sort()
    // merlin was only opened (its content is the example's), so it goes; rifter's notes and 'mine' stay.
    expect(ids).toEqual(['mine', 'rifter'])
    expect((await store.get('rifter'))?.fit.notes).toBe('my notes')
  })
  it('upgrading with examples switched on keeps everything', async () => {
    const factory = await legacyDatabase((records) => records)
    expect(await createFitStore(factory, 'pyfa-phone', { examples: true }).list()).toHaveLength(exampleFitDocs.length)
  })
})
