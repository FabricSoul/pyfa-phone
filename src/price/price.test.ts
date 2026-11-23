import { describe, expect, it, vi } from 'vitest'
import { createPriceService, type FetchLike, type StorageLike } from './price'

// fuzzwork aggregates 响应：值是字符串，和线上一致
const fuzzworkBody = (entries: Record<number, string>) =>
  Object.fromEntries(
    Object.entries(entries).map(([id, min]) => [
      id,
      {
        buy: { max: '0.01', min: '0.01', percentile: '0.01', weightedAverage: '0.01' },
        sell: { max: min, min, percentile: min, weightedAverage: min },
      },
    ]),
  )

const esiBody = (rows: { type_id: number; average_price?: number; adjusted_price?: number }[]) => rows

function makeFetch(handler: (url: string) => { status?: number; body?: unknown } | Error) {
  const calls: string[] = []
  const fetchFn: FetchLike = async (url) => {
    calls.push(url)
    const r = handler(url)
    if (r instanceof Error) throw r
    const status = r.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => r.body }
  }
  return { fetchFn, calls }
}

function makeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
  }
}

describe('price service', () => {
  it('takes sell.min from fuzzwork', async () => {
    const { fetchFn, calls } = makeFetch((url) => {
      expect(url).toContain('market.fuzzwork.co.uk/aggregates/')
      expect(url).toContain('region=10000002')
      return { body: fuzzworkBody({ 34: '12.50', 35: '3.25' }) }
    })
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    await expect(svc.getPrices([34, 35])).resolves.toEqual({ 34: 12.5, 35: 3.25 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('types=34,35')
  })

  it('falls back to ESI average_price when fuzzwork returns 500', async () => {
    const { fetchFn, calls } = makeFetch((url) => {
      if (url.includes('fuzzwork')) return { status: 500 }
      return { body: esiBody([{ type_id: 34, average_price: 11.75, adjusted_price: 10.5 }]) }
    })
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    await expect(svc.getPrices([34])).resolves.toEqual({ 34: 11.75 })
    expect(calls.some((u) => u.includes('esi.evetech.net/latest/markets/prices/'))).toBe(true)
  })

  it('uses adjusted_price when ESI has no average_price, and ESI for ids fuzzwork misses', async () => {
    const { fetchFn } = makeFetch((url) => {
      if (url.includes('fuzzwork')) return { body: fuzzworkBody({ 34: '12.50' }) }
      return { body: esiBody([{ type_id: 35, adjusted_price: 9.5 }]) }
    })
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    await expect(svc.getPrices([34, 35])).resolves.toEqual({ 34: 12.5, 35: 9.5 })
  })

  it('serves a second call within 6 hours without any network request', async () => {
    const { fetchFn, calls } = makeFetch(() => ({ body: fuzzworkBody({ 34: '12.50' }) }))
    let now = 1_000_000
    const svc = createPriceService({ fetch: fetchFn, now: () => now, storage: makeStorage() })
    await expect(svc.getPrices([34])).resolves.toEqual({ 34: 12.5 })
    expect(calls).toHaveLength(1)
    now += 5 * 60 * 60 * 1000 // 5 小时后，仍在 6 小时有效期内
    await expect(svc.getPrices([34])).resolves.toEqual({ 34: 12.5 })
    expect(calls).toHaveLength(1)
  })

  it('persists to storage so a fresh service instance reuses the cache within 6 hours', async () => {
    const storage = makeStorage()
    const first = makeFetch(() => ({ body: fuzzworkBody({ 34: '12.50' }) }))
    const svc1 = createPriceService({ fetch: first.fetchFn, now: () => 1_000_000, storage })
    await svc1.getPrices([34])
    expect([...storage.map.keys()].some((k) => k.startsWith('pyfa.price.'))).toBe(true)

    const second = makeFetch(() => {
      throw new Error('must not be called')
    })
    const svc2 = createPriceService({ fetch: second.fetchFn, now: () => 1_000_000 + 60_000, storage })
    await expect(svc2.getPrices([34])).resolves.toEqual({ 34: 12.5 })
    expect(second.calls).toHaveLength(0)
  })

  it('refetches after the 6 hour cache expires', async () => {
    const { fetchFn, calls } = makeFetch(() => ({ body: fuzzworkBody({ 34: '12.50' }) }))
    let now = 1_000_000
    const svc = createPriceService({ fetch: fetchFn, now: () => now, storage: makeStorage() })
    await svc.getPrices([34])
    now += 6 * 60 * 60 * 1000 + 1
    await svc.getPrices([34])
    expect(calls).toHaveLength(2)
  })

  it('returns null for a typeId neither source has, without throwing', async () => {
    const { fetchFn } = makeFetch((url) => {
      if (url.includes('fuzzwork')) return { body: fuzzworkBody({ 34: '12.50' }) }
      return { body: esiBody([{ type_id: 34, average_price: 12 }]) }
    })
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    await expect(svc.getPrices([34, 99999])).resolves.toEqual({ 34: 12.5, 99999: null })
  })

  it('returns null when both sources fail outright', async () => {
    const { fetchFn } = makeFetch(() => new Error('network down'))
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    await expect(svc.getPrices([34])).resolves.toEqual({ 34: null })
  })

  it('batches fuzzwork requests at 100 typeIds per call', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => 1000 + i)
    const { fetchFn, calls } = makeFetch((url) => {
      const types = new URL(url).searchParams.get('types')?.split(',').map(Number) ?? []
      return { body: fuzzworkBody(Object.fromEntries(types.map((id) => [id, '1.00']))) }
    })
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    const prices = await svc.getPrices(ids)
    expect(Object.keys(prices)).toHaveLength(250)
    expect(prices[1000]).toBe(1)
    expect(prices[1249]).toBe(1)
    const fuzzCalls = calls.filter((u) => u.includes('fuzzwork'))
    expect(fuzzCalls).toHaveLength(3)
    for (const u of fuzzCalls) {
      const n = new URL(u).searchParams.get('types')?.split(',').length ?? 0
      expect(n).toBeLessThanOrEqual(100)
      expect(n).toBeGreaterThan(0)
    }
  })

  it('does not throw when storage reads and writes fail (private mode)', async () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    const { fetchFn } = makeFetch(() => ({ body: fuzzworkBody({ 34: '12.50' }) }))
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: broken })
    await expect(svc.getPrices([34])).resolves.toEqual({ 34: 12.5 })
  })

  it('caches the ESI price list for an hour across calls', async () => {
    const { fetchFn, calls } = makeFetch((url) => {
      if (url.includes('fuzzwork')) return { status: 500 }
      return { body: esiBody([{ type_id: 34, average_price: 11 }, { type_id: 35, average_price: 22 }]) }
    })
    let now = 1_000_000
    const svc = createPriceService({ fetch: fetchFn, now: () => now, storage: makeStorage() })
    await expect(svc.getPrices([34])).resolves.toEqual({ 34: 11 })
    now += 30 * 60 * 1000 // 半小时后，ESI 缓存仍有效，但 fuzzwork 仍要先试
    await expect(svc.getPrices([35])).resolves.toEqual({ 35: 22 })
    expect(calls.filter((u) => u.includes('esi.evetech.net'))).toHaveLength(1)
  })

  it('returns an empty record for no typeIds and makes no requests', async () => {
    const { fetchFn, calls } = makeFetch(() => ({ body: {} }))
    const svc = createPriceService({ fetch: fetchFn, now: () => 1_000_000, storage: makeStorage() })
    await expect(svc.getPrices([])).resolves.toEqual({})
    expect(calls).toHaveLength(0)
  })

  it('aborts a fuzzwork request that never answers (8s timeout)', async () => {
    vi.useFakeTimers()
    try {
      const hanging: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      const { fetchFn: esiFetch, calls } = makeFetch(() => ({
        body: esiBody([{ type_id: 34, average_price: 7.5 }]),
      }))
      const combined: FetchLike = (url, init) => (url.includes('fuzzwork') ? hanging(url, init) : esiFetch(url, init))
      const svc = createPriceService({ fetch: combined, now: () => 1_000_000, storage: makeStorage() })
      const pending = svc.getPrices([34])
      await vi.advanceTimersByTimeAsync(8000)
      await expect(pending).resolves.toEqual({ 34: 7.5 })
      expect(calls.some((u) => u.includes('esi.evetech.net'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
