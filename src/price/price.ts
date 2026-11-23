// 物品价格服务：取吉他（The Forge / Jita）卖价，单位 ISK。
//
// 主来源 fuzzwork aggregates 的 sell.min；请求失败、超时或缺某个物品时，
// 用 ESI 全量价格表兜底（average_price，没有则 adjusted_price）。
// 结果缓存 6 小时（内存 + localStorage），两个来源都拿不到返回 null，不抛异常。

export interface FetchResponseLike {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<FetchResponseLike>

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface PriceServiceDeps {
  fetch?: FetchLike
  now?: () => number
  storage?: StorageLike | null
}

export interface PriceService {
  getPrices: (typeIds: number[]) => Promise<Record<number, number | null>>
}

const JITA_REGION = 10000002
const FUZZWORK_URL = 'https://market.fuzzwork.co.uk/aggregates/'
const ESI_PRICES_URL = 'https://esi.evetech.net/latest/markets/prices/?datasource=tranquility'
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const ESI_CACHE_TTL_MS = 60 * 60 * 1000
const STORAGE_PREFIX = 'pyfa.price.'

interface CacheEntry {
  price: number
  at: number
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function parseFuzzwork(body: unknown): Map<number, number> {
  const out = new Map<number, number>()
  if (typeof body !== 'object' || body === null) return out
  for (const [key, value] of Object.entries(body)) {
    const id = Number(key)
    if (!Number.isInteger(id)) continue
    const sell = (value as { sell?: { min?: unknown } } | null)?.sell
    const min = Number(sell?.min)
    if (Number.isFinite(min) && min > 0) out.set(id, min)
  }
  return out
}

function parseEsi(body: unknown): Map<number, number> {
  const out = new Map<number, number>()
  if (!Array.isArray(body)) return out
  for (const row of body) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as { type_id?: unknown; average_price?: unknown; adjusted_price?: unknown }
    const id = Number(r.type_id)
    if (!Number.isInteger(id)) continue
    const avg = Number(r.average_price)
    const adj = Number(r.adjusted_price)
    if (Number.isFinite(avg) && avg > 0) out.set(id, avg)
    else if (Number.isFinite(adj) && adj > 0) out.set(id, adj)
  }
  return out
}

export function createPriceService(deps: PriceServiceDeps = {}): PriceService {
  const fetchFn: FetchLike = deps.fetch ?? ((url, init) => globalThis.fetch(url, init))
  const now = deps.now ?? Date.now
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage

  const memory = new Map<number, CacheEntry>()
  let esiCache: { at: number; prices: Map<number, number> } | null = null

  function readCache(id: number): number | undefined {
    const hit = memory.get(id)
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.price
    if (hit) memory.delete(id)
    if (!storage) return undefined
    try {
      const raw = storage.getItem(STORAGE_PREFIX + id)
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as Partial<CacheEntry>
      if (typeof parsed.price !== 'number' || typeof parsed.at !== 'number') return undefined
      if (now() - parsed.at >= CACHE_TTL_MS) return undefined
      memory.set(id, { price: parsed.price, at: parsed.at })
      return parsed.price
    } catch {
      return undefined // 隐私模式等场景读失败就当没缓存
    }
  }

  function writeCache(id: number, price: number) {
    const entry: CacheEntry = { price, at: now() }
    memory.set(id, entry)
    if (!storage) return
    try {
      storage.setItem(STORAGE_PREFIX + id, JSON.stringify(entry))
    } catch {
      // 写失败（隐私模式/配额）不影响本次结果
    }
  }

  async function fetchJson(url: string): Promise<unknown> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetchFn(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  async function fuzzworkPrices(ids: number[]): Promise<Map<number, number>> {
    const found = new Map<number, number>()
    const batches: number[][] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE))
    await Promise.all(
      batches.map(async (batch) => {
        try {
          const body = await fetchJson(`${FUZZWORK_URL}?region=${JITA_REGION}&types=${batch.join(',')}`)
          for (const [id, price] of parseFuzzwork(body)) {
            if (batch.includes(id)) found.set(id, price)
          }
        } catch {
          // 这一批失败，交给 ESI 兜底
        }
      }),
    )
    return found
  }

  async function esiPrices(): Promise<Map<number, number>> {
    if (esiCache && now() - esiCache.at < ESI_CACHE_TTL_MS) return esiCache.prices
    const prices = parseEsi(await fetchJson(ESI_PRICES_URL))
    esiCache = { at: now(), prices }
    return prices
  }

  async function getPrices(typeIds: number[]): Promise<Record<number, number | null>> {
    const result: Record<number, number | null> = {}
    const missing: number[] = []
    for (const id of new Set(typeIds)) {
      const cached = readCache(id)
      if (cached !== undefined) result[id] = cached
      else missing.push(id)
    }
    if (missing.length > 0) {
      const found = await fuzzworkPrices(missing)
      const stillMissing = missing.filter((id) => !found.has(id))
      if (stillMissing.length > 0) {
        try {
          const esi = await esiPrices()
          for (const id of stillMissing) {
            const price = esi.get(id)
            if (price !== undefined) found.set(id, price)
          }
        } catch {
          // ESI 也失败，剩余物品返回 null
        }
      }
      for (const id of missing) {
        const price = found.get(id)
        if (price !== undefined) {
          writeCache(id, price)
          result[id] = price
        } else {
          result[id] = null
        }
      }
    }
    return result
  }

  return { getPrices }
}

const defaultService = createPriceService()

/** 默认实现（全局 fetch + localStorage）的快捷导出。 */
export const getPrices = defaultService.getPrices
