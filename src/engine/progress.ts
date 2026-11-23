/** Byte progress for the assets used to start the engine. */
export type DownloadStage = 'runtime' | 'data'
export type AssetSource = 'cache' | 'network'
export interface StageProgress { loaded: number; total: number; source?: AssetSource }
export type EngineProgress = Record<DownloadStage, StageProgress>

export function createProgress(totals: Record<DownloadStage, number>, onChange: (snapshot: EngineProgress) => void) {
  const loaded: Record<DownloadStage, number> = { runtime: 0, data: 0 }
  const sources: Partial<Record<DownloadStage, AssetSource>> = {}
  const stageProgress = (stage: DownloadStage): StageProgress => ({
    loaded: Math.min(loaded[stage], totals[stage]), total: totals[stage],
    ...(sources[stage] && { source: sources[stage] }),
  })
  const snapshot = (): EngineProgress => ({ runtime: stageProgress('runtime'), data: stageProgress('data') })
  return {
    add(stage: DownloadStage, bytes: number, source?: AssetSource) {
      loaded[stage] += bytes
      if (source && sources[stage] !== 'network') sources[stage] = source
      onChange(snapshot())
    },
    snapshot,
  }
}

const urlOf = (input: RequestInfo | URL) => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/** A fetch that reports the size of every chunk of the responses whose URL `match`es, and passes everything else through. */
export type ReportBytes = (bytes: number, source: AssetSource) => void

export function countingFetch(inner: typeof fetch, match: (url: string) => boolean, onBytes: ReportBytes): typeof fetch {
  return async (input, init) => {
    const response = await inner(input, init)
    return match(new URL(urlOf(input), globalThis.location?.href).href) ? countResponse(response, onBytes) : response
  }
}

export function countResponse(response: Response, onBytes: ReportBytes): Response {
  if (!response.ok || !response.body) return response
  const source = response.headers.get('X-Pyfa-Source') === 'cache' ? 'cache' : 'network'
  return new Response(countBody(response.body, (bytes) => onBytes(bytes, source)), response)
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
