import { describe, expect, it } from 'vitest'
import { mockEngine } from '../engine/mockClient'
import type { StoredFit } from './fits'
import { calcCacheFor, calcKey } from './calcCache'

const record = async (): Promise<StoredFit> => {
  const { exampleFitDocs } = await import('./fits')
  const { id, fit } = exampleFitDocs[0]!
  return { id, fit, openedAt: null, itemNames: {} }
}

describe('calc cache', () => {
  it('keys by id, content and considerReload, ignoring remembered names and open time', async () => {
    const base = await record()
    const key = calcKey(base, false)
    expect(calcKey({ ...base, openedAt: 5, fit: { ...base.fit, itemNames: { 1: { en: 'a', zh: 'b' } } } }, false)).toBe(key)
    expect(calcKey(base, true)).not.toBe(key)
    expect(calcKey({ ...base, fit: { ...base.fit, name: 'other' } }, false)).not.toBe(key)
  })
  it('is per engine, and a changed fit drops the older entry of the same id', async () => {
    const base = await record()
    const cache = calcCacheFor(mockEngine)
    expect(calcCacheFor(mockEngine)).toBe(cache)
    expect(calcCacheFor({ ...mockEngine })).not.toBe(cache)
    const result = await mockEngine.calc(base.fit)
    cache.set(base, false, result)
    expect(cache.get(base, false)).toBe(result)
    const edited = { ...base, fit: { ...base.fit, name: 'edited' } }
    cache.set(edited, false, result)
    expect(cache.get(base, false)).toBeUndefined()
    expect(cache.get(edited, false)).toBe(result)
  })
})
