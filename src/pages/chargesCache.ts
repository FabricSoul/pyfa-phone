import type { ChargeGroup, EngineClient, FitDoc, ModulePos } from '../engine/types'

/** Charge lists for the module sheet, kept for the session so the sheet never waits twice (UX4 follow-up 4).
 *  Exact results are kept per fit document and position; the last list seen for a module type stands in while a
 *  changed fit is recalculated (the same charges, only the numbers move). */
const exact = new WeakMap<FitDoc, Map<string, ChargeGroup[]>>()
const pending = new WeakMap<FitDoc, Map<string, Promise<ChargeGroup[]>>>()
const byType = new Map<string, ChargeGroup[]>()

const slotKey = (pos: ModulePos, includeReload: boolean) => `${pos.slot}:${pos.index}|${includeReload}`
const typeKey = (typeId: number, includeReload: boolean) => `${typeId}|${includeReload}`
function table<T>(map: WeakMap<FitDoc, Map<string, T>>, fit: FitDoc) {
  let entries = map.get(fit)
  if (!entries) { entries = new Map(); map.set(fit, entries) }
  return entries
}

/** Starts (or joins) loading the charges of the module at `pos`; safe to call on every press. */
export function loadCharges(engine: EngineClient, fit: FitDoc, pos: ModulePos, includeReload: boolean): Promise<ChargeGroup[]> {
  const key = slotKey(pos, includeReload)
  const done = exact.get(fit)?.get(key)
  if (done) return Promise.resolve(done)
  const waiting = table(pending, fit)
  let promise = waiting.get(key)
  if (!promise) {
    const typeId = fit.modules[pos.slot][pos.index]?.typeId
    promise = engine.chargesFor(fit, pos, undefined, { includeReload }).then((groups) => {
      table(exact, fit).set(key, groups)
      if (typeId !== undefined) byType.set(typeKey(typeId, includeReload), groups)
      return groups
    })
    promise.catch(() => {}).finally(() => waiting.delete(key))
    waiting.set(key, promise)
  }
  return promise
}

/** What can be shown right now: the exact list, else the last list for this module type, else nothing. */
export function knownCharges(fit: FitDoc, pos: ModulePos, includeReload: boolean): { groups: ChargeGroup[]; exact: boolean } | undefined {
  const done = exact.get(fit)?.get(slotKey(pos, includeReload))
  if (done) return { groups: done, exact: true }
  const typeId = fit.modules[pos.slot][pos.index]?.typeId
  const similar = typeId === undefined ? undefined : byType.get(typeKey(typeId, includeReload))
  return similar ? { groups: similar, exact: false } : undefined
}
