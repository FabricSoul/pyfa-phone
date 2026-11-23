import { proxy, wrap } from 'comlink'
import { calcOptions, getSettings } from '../settings/settings'
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
  marketTreeForSlot: NonNullable<EngineClient['marketTreeForSlot']>
  shipCatalog: NonNullable<EngineClient['shipCatalog']>
  itemsForExtra: NonNullable<EngineClient['itemsForExtra']>
  fillEmptySlots: NonNullable<EngineClient['fillEmptySlots']>
  itemInfo: NonNullable<EngineClient['itemInfo']>
  getDataVersion(): Promise<string>
  exportText(fit: FitDoc, format: ExportFormat, language?: 'en' | 'zh'): Promise<string>
}

export type EngineStage = 'runtime' | 'data' | 'initialize'
type ReportStage = (stage: EngineStage) => void

export interface EngineWorkerApi extends WorkerEngineClient {
  ready(report?: ReportStage): Promise<void>
}

export async function createEngine(report?: ReportStage): Promise<WorkerEngineClient> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const remote = wrap<EngineWorkerApi>(worker)
  let onError: (event: ErrorEvent) => void = () => {}
  const startupFailure = new Promise<never>((_, reject) => {
    onError = (event) => reject(event.error ?? new Error(event.message || 'Engine Worker failed to start'))
    worker.addEventListener('error', onError)
  })
  try {
    await Promise.race([remote.ready(report && proxy(report)), startupFailure])
  } catch (error) {
    worker.terminate()
    throw error
  } finally {
    worker.removeEventListener('error', onError)
  }

  return {
    async calc(fit, options) {
      const result: unknown = await remote.calc(fit, { ...calcOptions(), ...options })
      if (!isCalcResult(result)) throw new Error('Invalid CalcResult from engine Worker')
      return result
    },
    shipCatalog: (...args) => remote.shipCatalog(...args),
    itemsForExtra: (...args) => remote.itemsForExtra(...args),
    fillEmptySlots: (...args) => remote.fillEmptySlots(...args),
    itemInfo: (typeId, fit, pos, options) =>
      remote.itemInfo(typeId, fit, pos, fit && { ...calcOptions(), ...options }),
    getDataVersion: () => remote.getDataVersion(),
    marketTreeForSlot: (slot) => remote.marketTreeForSlot(slot),
    marketGroupsForSlot: (...args) => remote.marketGroupsForSlot(...args),
    itemsForSlot: (fit, slot, filters, options) =>
      remote.itemsForSlot(fit, slot, filters, { calcOptions: calcOptions(), ...options }),
    chargesFor: (fit, pos, metaGroup, options) =>
      remote.chargesFor(fit, pos, metaGroup, { ...calcOptions(), ...options }),
    variationsOf: (...args) => remote.variationsOf(...args),
    async importText(text) {
      const { defaultCharacter, defaultDamagePatternId } = getSettings()
      const parsed = await remote.importText(text)
      return {
        ...parsed,
        fits: parsed.fits.map((fit) => ({
          ...fit, character: defaultCharacter, damagePatternId: defaultDamagePatternId,
        })),
      }
    },
    exportText: (...args) => remote.exportText(...args),
    missingSkills: (...args) => remote.missingSkills(...args),
  }
}
