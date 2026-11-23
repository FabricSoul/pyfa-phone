import type { ItemNameLanguage } from '../../settings/settings'
import source from '../../data/patterns.json'
import { _t } from '../../i18n/t'

/** Localized ratios consumed by the selectors. */
export interface LocalizedText { en: string; zh: string }
export interface PatternRow {
  id: number | null
  name: LocalizedText
  category: LocalizedText
  em: number
  thermal: number
  kinetic: number
  explosive: number
}
export interface PatternGroup { key: string; name: LocalizedText; items: PatternRow[] }
export interface PatternData { damagePatterns: PatternRow[]; targetProfiles: PatternRow[] }

const patternData: PatternData = {
  damagePatterns: source.damagePatterns.map(normalize),
  targetProfiles: source.targetProfiles.map(normalize),
}

function normalize(row: Omit<PatternRow, 'category' | 'id'> & { category: LocalizedText | null; id: number }): PatternRow {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? { en: '', zh: '' },
    em: row.em,
    thermal: row.thermal,
    kinetic: row.kinetic,
    explosive: row.explosive,
  }
}

export function getPatternData(): PatternData {
  return patternData
}

export function groupByCategory(rows: PatternRow[]): PatternGroup[] {
  const groups = new Map<string, PatternGroup>()
  for (const row of rows) {
    const key = row.category.en || row.category.zh
    if (!key) continue
    let group = groups.get(key)
    if (!group) {
      group = { key, name: row.category, items: [] }
      groups.set(key, group)
    }
    group.items.push(row)
  }
  return [...groups.values()]
}

export const hasCategory = (row: PatternRow): boolean => Boolean(row.category.en || row.category.zh)
export const labelOf = (text: LocalizedText, lang: ItemNameLanguage): string =>
  (lang === 'zh' ? text.zh || text.en : text.en) || text.zh

/** Four ratios, as the artboard shows them: "EM 25 · Thermal 25 · Kinetic 25 · Explosive 25". */
export function ratioLine(row: PatternRow, kind: 'damage' | 'resist'): string {
  const values = [row.em, row.thermal, row.kinetic, row.explosive]
  let parts: number[]
  if (kind === 'damage') {
    const sum = values.reduce((a, b) => a + b, 0)
    parts = sum > 0 ? values.map((v) => Math.round((v / sum) * 100)) : [0, 0, 0, 0]
  } else {
    // pyfa stores target resistances as fractions; ETL may already have percentages.
    parts = values.map((v) => Math.round(v > 0 && v <= 1 ? v * 100 : v))
  }
  return `${_t('EM')} ${parts[0] ?? 0} · ${_t('Thermal')} ${parts[1] ?? 0} · ${_t('Kinetic')} ${parts[2] ?? 0} · ${_t('Explosive')} ${parts[3] ?? 0}`
}
