import type { CalcResult, EngineClient } from '../engine/types'
import type { StoredFit } from './fits'

/** Key of one calculation: fit id, the fit's content (not its remembered names or open time) and the reload setting. */
export function calcKey(record: StoredFit, includeReload: boolean): string {
  const { itemNames: _names, ...content } = record.fit
  return `${record.id}|${includeReload ? 1 : 0}|${JSON.stringify(content)}`
}

export interface CalcCache {
  get(record: StoredFit, includeReload: boolean): CalcResult | undefined
  /** Stores a result and drops older results of the same fit (they can never match again). */
  set(record: StoredFit, includeReload: boolean, result: CalcResult): void
  /** One shared calculation per key, so a page mounted again while it runs does not ask the engine twice. */
  run(record: StoredFit, includeReload: boolean, calc: () => Promise<CalcResult>): Promise<CalcResult>
  /** The last library listing of this session, so the home page can paint before the store answers. */
  records: StoredFit[] | undefined
}

const caches = new WeakMap<object, CalcCache>()

/** The session cache of one engine. Filled the first time, never cleared; an edited fit simply gets a new key. */
export function calcCacheFor(engine: EngineClient): CalcCache {
  let cache = caches.get(engine)
  if (cache) return cache
  const results = new Map<string, CalcResult>()
  const running = new Map<string, Promise<CalcResult>>()
  const owners = new Map<string, string>()
  const created: CalcCache = {
    records: undefined,
    get: (record, reload) => results.get(calcKey(record, reload)),
    set(record, reload, result) {
      const key = calcKey(record, reload)
      const slot = `${record.id}|${reload ? 1 : 0}`
      const previous = owners.get(slot)
      if (previous && previous !== key) results.delete(previous)
      owners.set(slot, key)
      results.set(key, result)
    },
    run(record, reload, calc) {
      const key = calcKey(record, reload)
      const pending = running.get(key)
      if (pending) return pending
      const promise = calc().then((result) => { created.set(record, reload, result); return result })
      running.set(key, promise)
      const clear = () => { running.delete(key) }
      promise.then(clear, clear)
      return promise
    },
  }
  caches.set(engine, created)
  return created
}
