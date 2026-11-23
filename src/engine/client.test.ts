import { afterEach, expect, it, vi } from 'vitest'
import { expose } from 'comlink'
import { sampleFits } from './mockClient'
import { createEngine } from './client'

class EngineWorker extends EventTarget {
  private readonly endpoint = new EventTarget()

  constructor() {
    super()
    expose({
      async ready() {},
      async calc() {
        return { dataVersion: '3724492', stats: 'malformed' }
      },
    }, Object.assign(this.endpoint, {
      postMessage: (data: unknown) => this.dispatchEvent(new MessageEvent('message', { data })),
    }))
  }

  postMessage(data: unknown) {
    this.endpoint.dispatchEvent(new MessageEvent('message', { data }))
  }

  terminate() {}
}

afterEach(() => vi.unstubAllGlobals())

it('rejects a malformed CalcResult returned by the engine worker', async () => {
  vi.stubGlobal('Worker', EngineWorker)
  const engine = await createEngine()
  await expect(engine.calc(sampleFits.rifter)).rejects.toThrow('Invalid CalcResult')
})
