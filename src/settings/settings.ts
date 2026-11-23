import { useSyncExternalStore } from 'react'
import type { CalcOptions, EftExportOptions } from '../engine/types'
import type { UiLanguage } from '../i18n/t'
import { readJson, removeKey, writeJson } from './storage'

export const SETTINGS_KEY = 'pyfa.settings'

export type Appearance = 'system' | 'light' | 'dark'
export type ItemNameLanguage = 'zh' | 'en'
export type CharacterId = 'all5' | 'all0'
export type PriceItem = 'drones' | 'cargo' | 'implants'

export interface Settings {
  appearance: Appearance
  /** Undefined until the user makes a choice; the browser language decides the first launch. */
  uiLanguage?: UiLanguage
  itemNameLanguage: ItemNameLanguage
  defaultCharacter: CharacterId
  defaultDamagePatternId: number
  useCharacterImplants: boolean
  considerReload: boolean
  considerReboot: boolean
  strictSkills: boolean
  preheatPercent: number
  priceIncluded: PriceItem[]
  eftExport: EftExportOptions
}

const defaultItemLang: ItemNameLanguage =
  typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language ?? '') ? 'zh' : 'en'

export const defaultSettings: Settings = {
  appearance: 'system',
  itemNameLanguage: defaultItemLang,
  defaultCharacter: 'all5',
  defaultDamagePatternId: -1,
  useCharacterImplants: false,
  // pyfa: vendor/pyfa/service/fit.py serviceFittingOptions["useGlobalForceReload"] defaults to False.
  considerReload: false,
  considerReboot: false,
  strictSkills: true,
  preheatPercent: 100,
  priceIncluded: ['drones', 'cargo', 'implants'],
  eftExport: { charges: true, cargo: true, implants: true, boosters: true },
}

let state: Settings = { ...defaultSettings, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) }
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Stable snapshot: the same object is returned until updateSettings() replaces it. */
export function getSettings(): Settings {
  return state
}

export function calcOptions(settings: Settings = getSettings()): Required<CalcOptions> {
  return {
    includeReload: settings.considerReload,
    includeReactivation: settings.considerReboot,
    strictSkills: settings.strictSkills,
    useCharacterImplants: settings.useCharacterImplants,
    defaultSpoolPercent: settings.preheatPercent,
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  state = { ...state, ...patch }
  writeJson(SETTINGS_KEY, state)
  notify()
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function resetSettings(): void {
  removeKey(SETTINGS_KEY)
  state = { ...defaultSettings }
  notify()
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings)
}

export function getItemNameLanguage(): ItemNameLanguage {
  return state.itemNameLanguage
}

/** Which language of item / category names other pages should display. */
export function useItemNameLanguage(): ItemNameLanguage {
  return useSyncExternalStore(subscribeSettings, getItemNameLanguage, getItemNameLanguage)
}
