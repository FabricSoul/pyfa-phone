import { describe, expect, it } from 'vitest'
import { deferredEngine } from './App'
import type { EngineClient } from './engine/types'

// FX2 给 EngineClient 加了新方法，FX3 的延迟代理是手写清单，漏掉了它们，导致舰船浏览、附加物品、填满空槽在真引擎下全部失效。
describe('deferredEngine', () => {
  it('forwards every method the real client has, including ones added later', async () => {
    const real = {
      shipCatalog: async () => ({ groups: [], ships: [] }),
      itemsForExtra: async () => [{ meta: 'tech1', items: [] }],
      fillEmptySlots: async () => [{ slot: 'high', positions: [1] }],
      calc: async () => 'calc-result',
    } as unknown as EngineClient
    const engine = deferredEngine(Promise.resolve(real))
    expect(typeof engine.shipCatalog).toBe('function')
    await expect(engine.shipCatalog!()).resolves.toEqual({ groups: [], ships: [] })
    await expect(engine.itemsForExtra!({} as never, 'cargo' as never, '')).resolves.toHaveLength(1)
    await expect(engine.fillEmptySlots!({} as never, {} as never)).resolves.toHaveLength(1)
    await expect(engine.calc({} as never)).resolves.toBe('calc-result')
  })
  it('rejects clearly when the real client lacks an optional method', async () => {
    const engine = deferredEngine(Promise.resolve({} as EngineClient))
    await expect(engine.shipCatalog!()).rejects.toThrow(/shipCatalog/)
  })
})
