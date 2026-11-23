import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { exampleFitDocs, listFits, replaceAllFits, saveFit, resetDefaultFitStoreForTests } from './fits'

// 导入页和设置页用的函数式接口，背后必须是 T7 的同一个 IndexedDB 仓库。
describe('fit store adapter', () => {
  it('saveFit stores into the shared store and returns its id', async () => {
    resetDefaultFitStoreForTests('adapter-a')
    const fit = exampleFitDocs[0]!.fit
    const id = await saveFit(fit)
    const all = await listFits()
    expect(all.map(f => f.shipTypeId)).toContain(fit.shipTypeId)
    expect(typeof id).toBe('string')
  })
  it('replaceAllFits replaces every stored fit', async () => {
    resetDefaultFitStoreForTests('adapter-b')
    await saveFit(exampleFitDocs[0]!.fit)
    await replaceAllFits([exampleFitDocs[1]!.fit])
    const all = await listFits()
    expect(all).toHaveLength(1)
    expect(all[0]!.shipTypeId).toBe(exampleFitDocs[1]!.fit.shipTypeId)
  })
})
