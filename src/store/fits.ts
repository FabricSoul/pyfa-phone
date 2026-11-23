import fixtures from '../../etl/fixtures/fits.json'
import { FitDocSchema, type FitDoc, type LName } from '../engine/types'

export interface StoredFit {
  id: string
  fit: FitDoc
  openedAt: number | null
  /** Last known labels, keyed by type ID, so a data update cannot erase them. */
  itemNames: Record<number, LName>
}

export interface FitStore {
  list(): Promise<StoredFit[]>
  get(id: string): Promise<StoredFit | undefined>
  save(record: StoredFit): Promise<void>
  remove(id: string): Promise<void>
  touch(id: string, openedAt: number): Promise<void>
  rememberNames(id: string, names: Record<number, LName>): Promise<void>
}

function withItemNames(record: StoredFit, names: Record<number, LName> = {}): StoredFit {
  const itemNames = { ...record.fit.itemNames, ...record.itemNames, ...names }
  return { ...record, itemNames, fit: { ...record.fit, itemNames } }
}

/** Temporary imports use the normal fitting routes without making any IndexedDB writes. */
export function withTemporaryFits(persistent: FitStore) {
  const records = new Map<string, StoredFit>()
  const isTemporary = (id: string) => id.startsWith('preview-')

  return {
    ...persistent,
    isTemporary,
    openTemporary(fit: FitDoc, itemNames: Record<number, LName>) {
      const id = `preview-${crypto.randomUUID()}`
      records.set(id, withItemNames({ id, fit, itemNames, openedAt: null }))
      return id
    },
    async get(id: string) {
      return isTemporary(id) ? records.get(id) : persistent.get(id)
    },
    async save(record: StoredFit) {
      if (!isTemporary(record.id)) return persistent.save(record)
      const previous = records.get(record.id)
      if (previous) records.set(record.id, withItemNames(record, { ...previous.itemNames, ...record.itemNames }))
    },
    async remove(id: string) {
      if (!isTemporary(id)) return persistent.remove(id)
      records.delete(id)
    },
    async touch(id: string, openedAt: number) {
      if (!isTemporary(id)) return persistent.touch(id, openedAt)
      const record = records.get(id)
      if (record) records.set(id, { ...record, openedAt })
    },
    async rememberNames(id: string, names: Record<number, LName>) {
      if (!isTemporary(id)) return persistent.rememberNames(id, names)
      const record = records.get(id)
      if (record) records.set(id, withItemNames(record, names))
    },
  } satisfies FitStore & {
    isTemporary(id: string): boolean
    openTemporary(fit: FitDoc, itemNames: Record<number, LName>): string
  }
}

const STORE = 'fits'
export const exampleFitDocs = Object.entries(fixtures)
  .map(([id, sample]) => ({ id, fit: FitDocSchema.parse(sample) }))

export function createFitStore(factory: IDBFactory, databaseName = 'pyfa-phone'): FitStore {
  let connection: Promise<IDBDatabase> | undefined

  function open(): Promise<IDBDatabase> {
    if (connection) return connection
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
        for (const { id, fit } of exampleFitDocs) {
          const record: StoredFit = { id, fit, openedAt: null, itemNames: {} }
          store.add(withItemNames(record))
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          connection = undefined
        }
        resolve(database)
      }
    }).catch((error: unknown) => {
      connection = undefined
      throw error
    })
    return connection
  }

  async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error)
    })
  }

  async function update(id: string, fn: (record: StoredFit) => StoredFit): Promise<void> {
    await transact('readwrite', (store) => {
      const request: IDBRequest<StoredFit | undefined> = store.get(id)
      request.onsuccess = () => {
        if (request.result) store.put(fn(request.result))
      }
      return request
    })
  }

  return {
    async list() {
      const records: StoredFit[] = await transact('readonly', (store) => store.getAll())
      return records.map((record) => withItemNames(record))
    },
    async get(id) {
      const record: StoredFit | undefined = await transact('readonly', (store) => store.get(id))
      return record && withItemNames(record)
    },
    async save(record) {
      await transact('readwrite', (store) => {
        const request: IDBRequest<StoredFit | undefined> = store.get(record.id)
        request.onsuccess = () => {
          const previous = request.result
          store.put(withItemNames({
            ...record,
            openedAt: Math.max(record.openedAt ?? 0, previous?.openedAt ?? 0) || null,
            itemNames: { ...previous?.fit.itemNames, ...previous?.itemNames, ...record.fit.itemNames, ...record.itemNames },
          }))
        }
        return request
      })
    },
    async remove(id) { await transact('readwrite', (store) => store.delete(id)) },
    touch: (id, openedAt) => update(id, (record) => ({ ...record, openedAt })),
    rememberNames: (id, names) => update(id, (record) => withItemNames(record, names)),
  }
}

export function fitTypeIds(fit: FitDoc): number[] {
  return [...new Set([
    fit.shipTypeId,
    ...Object.values(fit.modules).flatMap((slots) => slots.flatMap((item) =>
      item ? [item.typeId, ...(item.chargeTypeId === null ? [] : [item.chargeTypeId])] : [])),
    ...fit.drones.map((d) => d.typeId),
    ...(fit.fighters ?? []).map((f) => f.typeId),
    ...fit.cargo.map((c) => c.typeId),
    ...fit.implants,
    ...fit.boosters,
  ])]
}

export async function resolveStoredItems(record: StoredFit, dataVersion: string, lookup: (id: number) => Promise<LName | null>) {
  const itemNames: Record<number, LName> = { ...record.fit.itemNames, ...record.itemNames }
  const removed: { typeId: number; name?: LName }[] = []
  const changed = record.fit.dataVersion !== dataVersion
  await Promise.all(fitTypeIds(record.fit).map(async (typeId) => {
    if (!changed && itemNames[typeId]) return
    const name = await lookup(typeId)
    if (name) itemNames[typeId] = name
    else if (changed) removed.push({ typeId, name: itemNames[typeId] })
  }))
  removed.sort((a, b) => a.typeId - b.typeId)
  return { itemNames, removed }
}

// ── 共享仓库和函数式接口（导入页、设置页使用）──────────────────────
let sharedStore: FitStore | undefined
let sharedName = 'pyfa-phone'

/** 整个应用共用的 IndexedDB 装配仓库。 */
export function defaultFitStore(): FitStore {
  sharedStore ??= createFitStore(indexedDB, sharedName)
  return sharedStore
}

/** 仅供测试：换一个独立的数据库名，避免用例互相影响。 */
export function resetDefaultFitStoreForTests(databaseName: string) {
  sharedName = databaseName
  sharedStore = undefined
}

function newFitId() {
  return globalThis.crypto?.randomUUID?.() ?? `fit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function saveFit(fit: FitDoc): Promise<string> {
  const id = newFitId()
  await defaultFitStore().save({ id, fit, openedAt: Date.now(), itemNames: {} })
  return id
}

export async function listFits(): Promise<FitDoc[]> {
  return (await defaultFitStore().list()).map(record => record.fit)
}

export async function replaceAllFits(fits: FitDoc[]): Promise<void> {
  const store = defaultFitStore()
  for (const record of await store.list()) await store.remove(record.id)
  for (const fit of fits) await store.save({ id: newFitId(), fit, openedAt: null, itemNames: {} })
}
