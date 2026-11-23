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
  /** Delete (replace mode) and write in ONE readwrite transaction: any failure keeps every old fit. */
  restore(fits: FitDoc[], mode: 'replace' | 'merge'): Promise<void>
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

/** Examples are written in development, or when `localStorage['pyfa.examples'] === '1'`, or the page is opened with `?examples=1`. */
export function examplesEnabled(source?: { dev: boolean; flag: string | null; search: string }): boolean {
  const { dev, flag, search } = source ?? {
    dev: import.meta.env.DEV,
    flag: (() => { try { return localStorage.getItem('pyfa.examples') } catch { return null } })(),
    search: typeof location === 'undefined' ? '' : location.search,
  }
  return dev || flag === '1' || new URLSearchParams(search).get('examples') === '1'
}

const sameContent = (a: FitDoc, b: FitDoc) => {
  const strip = ({ itemNames: _names, ...rest }: FitDoc) => JSON.stringify(rest)
  return strip(a) === strip(b)
}

export function createFitStore(factory: IDBFactory, databaseName = 'pyfa-phone', options: { examples?: boolean } = {}): FitStore {
  let connection: Promise<IDBDatabase> | undefined

  function open(): Promise<IDBDatabase> {
    if (connection) return connection
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 2)
      request.onupgradeneeded = (event) => {
        const examples = options.examples ?? examplesEnabled()
        if (event.oldVersion < 1) {
          const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
          if (examples) for (const { id, fit } of exampleFitDocs) store.add(withItemNames({ id, fit, openedAt: null, itemNames: {} }))
        } else if (event.oldVersion < 2 && !examples) {
          // Version 1 wrote the examples into every database: drop the ones nobody has changed, keep the edited ones.
          const store = request.transaction!.objectStore(STORE)
          for (const { id, fit } of exampleFitDocs) {
            const get = store.get(id)
            get.onsuccess = () => {
              const saved = get.result as StoredFit | undefined
              if (saved && sameContent(saved.fit, fit)) store.delete(id)
            }
          }
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
    async restore(fits, mode) {
      const database = await open()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error ?? new Error('Restore aborted'))
        try {
          const store = transaction.objectStore(STORE)
          if (mode === 'replace') store.clear()
          for (const fit of fits) {
            store.put(withItemNames({ id: newFitId(), fit, openedAt: null, itemNames: {} }))
          }
        } catch (error) {
          try { transaction.abort() } catch { /* already finished */ }
          reject(error)
        }
      })
    },
  }
}

export type BackupProblem = 'json' | 'notArray' | 'empty' | 'invalid'
export type ParsedBackup = { ok: true; fits: FitDoc[] } | { ok: false; problem: BackupProblem; index?: number }

/** Validate a whole backup file; one bad entry rejects everything. */
export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return { ok: false, problem: 'json' } }
  if (!Array.isArray(parsed)) return { ok: false, problem: 'notArray' }
  if (parsed.length === 0) return { ok: false, problem: 'empty' }
  const fits: FitDoc[] = []
  for (const [index, entry] of parsed.entries()) {
    const checked = FitDocSchema.safeParse(entry)
    if (!checked.success) return { ok: false, problem: 'invalid', index }
    fits.push(checked.data)
  }
  return { ok: true, fits }
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

export async function restoreFits(fits: FitDoc[], mode: 'replace' | 'merge'): Promise<void> {
  await defaultFitStore().restore(fits, mode)
}

export const replaceAllFits = (fits: FitDoc[]) => restoreFits(fits, 'replace')
