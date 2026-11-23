import type { ItemNameLanguage } from '../../settings/settings'
import { _t } from '../../i18n/t'

/** Shape shared by src/data/patterns.json (built by ETL) and patterns.sample.json (dev fallback). */
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

type Raw = Record<string, unknown>
const isObj = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x)
const asArr = (x: unknown): Raw[] => (Array.isArray(x) ? x.filter(isObj) : [])
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined)
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)

function local(value: unknown, fallbackZh?: unknown): LocalizedText {
  if (typeof value === 'string') return { en: value, zh: str(fallbackZh) ?? value }
  if (!isObj(value)) return { en: '', zh: '' }
  const en = str(value.en) ?? str(value.en_US) ?? str(value.name) ?? ''
  return { en, zh: str(value.zh) ?? str(value.zh_CN) ?? str(fallbackZh) ?? en }
}

/** pyfa encodes categories as a leading "[Group]" in the name; ETL may split them out instead. */
function splitCategory(name: LocalizedText, explicit: unknown): { name: LocalizedText; category: LocalizedText } {
  const re = /^\s*\[([^\]]+)\]\s*/
  const enMatch = explicit === undefined ? re.exec(name.en) : null
  const zhMatch = explicit === undefined ? re.exec(name.zh) : null
  const category = explicit !== undefined
    ? local(explicit)
    : { en: enMatch?.[1] ?? '', zh: zhMatch?.[1] ?? enMatch?.[1] ?? '' }
  return {
    name: {
      en: enMatch ? name.en.slice(enMatch[0].length) : name.en,
      zh: zhMatch ? name.zh.slice(zhMatch[0].length) : name.zh,
    },
    category,
  }
}

function amount(row: Raw, key: string): number {
  const direct = num(row[key]) ?? num(row[key.toUpperCase()])
  if (direct !== undefined) return direct
  for (const nest of ['damage', 'amounts', 'resists', 'values']) {
    const inner = row[nest]
    if (isObj(inner)) {
      const value = num(inner[key]) ?? num(inner[key.toUpperCase()])
      if (value !== undefined) return value
    }
  }
  return 0
}

function toRow(raw: Raw): PatternRow {
  const name = local(raw['name'] ?? raw['title'], raw['nameZh'])
  const split = splitCategory(name, raw['category'] ?? raw['group'])
  const rawId = num(raw['id'] ?? raw['patternId'] ?? raw['profileId'])
  return {
    id: rawId === 0 ? null : rawId ?? null,
    name: split.name,
    category: split.category,
    em: amount(raw, 'em'),
    thermal: amount(raw, 'thermal'),
    kinetic: amount(raw, 'kinetic'),
    explosive: amount(raw, 'explosive'),
  }
}

// Prefer the ETL output when it lands; the sample keeps development and tests working until then.
const files = import.meta.glob<unknown>('../../data/patterns*.json', { eager: true, import: 'default' })
const source = files['../../data/patterns.json'] ?? files['../../data/patterns.sample.json'] ?? {}
const rawFile: Raw = isObj(source) ? source : {}

export function getPatternData(): PatternData {
  return {
    damagePatterns: asArr(rawFile['damagePatterns'] ?? rawFile['damage_patterns'] ?? rawFile['damage']).map(toRow),
    targetProfiles: asArr(rawFile['targetProfiles'] ?? rawFile['target_profiles'] ?? rawFile['targets']).map(toRow),
  }
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
