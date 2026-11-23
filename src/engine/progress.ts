/** Byte progress of the engine's first start, so the boot page can show real downloaded sizes. */
export type DownloadStage = 'runtime' | 'data'
export interface StageProgress { loaded: number; total: number }
export type EngineProgress = Record<DownloadStage, StageProgress>

export function createProgress(totals: Record<DownloadStage, number>, onChange: (snapshot: EngineProgress) => void) {
  const loaded: Record<DownloadStage, number> = { runtime: 0, data: 0 }
  const snapshot = (): EngineProgress => ({
    runtime: { loaded: Math.min(loaded.runtime, totals.runtime), total: totals.runtime },
    data: { loaded: Math.min(loaded.data, totals.data), total: totals.data },
  })
  return {
    add(stage: DownloadStage, bytes: number) { loaded[stage] += bytes; onChange(snapshot()) },
    snapshot,
  }
}

const urlOf = (input: RequestInfo | URL) => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/** A fetch that reports the size of every chunk of the responses whose URL `match`es, and passes everything else through. */
export function countingFetch(inner: typeof fetch, match: (url: string) => boolean, onBytes: (bytes: number) => void): typeof fetch {
  return async (input, init) => {
    const response = await inner(input, init)
    if (!response.body || !match(new URL(urlOf(input), globalThis.location?.href).href)) return response
    return new Response(countBody(response.body, onBytes), { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}

/** Passes a stream through while reporting the size of each chunk. */
export function countBody(body: ReadableStream<Uint8Array>, onBytes: (bytes: number) => void): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else { onBytes(value.byteLength); controller.enqueue(value) }
    },
    cancel: (reason) => reader.cancel(reason),
  })
}
