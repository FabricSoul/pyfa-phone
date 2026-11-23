import { describe, expect, it, vi } from 'vitest'
import { createProgress, countingFetch } from './progress'

describe('startup byte progress', () => {
  it('sums bytes per stage against the manifest totals and never reports more than the total', () => {
    const seen: unknown[] = []
    const progress = createProgress({ runtime: 100, data: 50 }, (snapshot) => seen.push(snapshot))
    progress.add('runtime', 60)
    progress.add('runtime', 70)
    progress.add('data', 10)
    expect(progress.snapshot()).toEqual({ runtime: { loaded: 100, total: 100 }, data: { loaded: 10, total: 50 } })
    expect(seen.length).toBe(3)
  })
  it('counts the bytes of a fetch response while the caller reads it normally', async () => {
    const onBytes = vi.fn()
    const inner = vi.fn(async () => new Response(new Uint8Array(10).fill(7), { status: 200, headers: { 'content-type': 'application/wasm' } }))
    const wrapped = countingFetch(inner as unknown as typeof fetch, (url) => url.startsWith('https://x/rt/'), onBytes)
    const hit = await wrapped('https://x/rt/a.wasm')
    expect(hit.headers.get('content-type')).toBe('application/wasm')
    expect((await hit.arrayBuffer()).byteLength).toBe(10)
    expect(onBytes).toHaveBeenCalledWith(10)
    const miss = await wrapped('https://x/other')
    await miss.arrayBuffer()
    expect(onBytes).toHaveBeenCalledTimes(1)
  })
})
