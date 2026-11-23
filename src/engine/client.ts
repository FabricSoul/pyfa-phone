import { wrap } from 'comlink'
import {
  isCalcResult,
  type EngineClient,
  type ExportFormat,
  type FitDoc,
  type MarketGroup,
  type SlotKind,
} from './types'

export interface WorkerEngineClient extends EngineClient {
  marketGroupsForSlot(fit: FitDoc, slot: SlotKind): Promise<MarketGroup[]>
  getDataVersion(): Promise<string>
  exportText(fit: FitDoc, format: ExportFormat, language?: 'en' | 'zh'): Promise<string>
}

export interface EngineWorkerApi extends WorkerEngineClient {
  ready(): Promise<void>
}

export async function createEngine(): Promise<WorkerEngineClient> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const remote = wrap<EngineWorkerApi>(worker)
  let onError: (event: ErrorEvent) => void = () => {}
  const startupFailure = new Promise<never>((_, reject) => {
    onError = (event) => reject(event.error ?? new Error(event.message || 'Engine Worker failed to start'))
    worker.addEventListener('error', onError)
  })
  try {
    await Promise.race([remote.ready(), startupFailure])
  } catch (error) {
    worker.terminate()
    throw error
  } finally {
    worker.removeEventListener('error', onError)
  }

  return {
    async calc(...args) {
      const result: unknown = await remote.calc(...args)
      if (!isCalcResult(result)) throw new Error('Invalid CalcResult from engine Worker')
      return result
    },
    getDataVersion: () => remote.getDataVersion(),
    marketGroupsForSlot: (...args) => remote.marketGroupsForSlot(...args),
    itemsForSlot: (...args) => remote.itemsForSlot(...args),
    chargesFor: (...args) => remote.chargesFor(...args),
    variationsOf: (...args) => remote.variationsOf(...args),
    importText: (...args) => remote.importText(...args),
    exportText: (...args) => remote.exportText(...args),
    missingSkills: (...args) => remote.missingSkills(...args),
  }
}
