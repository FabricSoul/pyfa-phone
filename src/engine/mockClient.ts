/**
 * `mockEngine`: an EngineClient backed by the fixtures from etl/fixtures/make_fixtures.py,
 * so the UI can be built before the Pyodide worker exists.
 *
 * It does not calculate. `calc` returns the precomputed result for the fit's ship, whatever
 * modules the FitDoc holds; item lists come from catalog.json (the variations of every
 * module in the sample fits, and the valid charges of their weapons).
 */
import fitsJson from '../../etl/fixtures/fits.json'
import catalogJson from './fixtures/catalog.json'
import merlin from './fixtures/merlin.json'
import rifter from './fixtures/rifter.json'
import thrasher from './fixtures/thrasher.json'
import {
  CalcResultSchema,
  FitDocSchema,
  ItemRowSchema,
  META_GROUPS,
  SlotKindSchema,
  type CalcResult,
  type EngineClient,
  type ExportFormat,
  type FitDoc,
  type FitModule,
  type ItemGroup,
  type ItemRow,
  type SlotKind,
} from './types'
import { z } from 'zod'

export type SampleName = 'rifter' | 'merlin' | 'thrasher'

export const sampleFits: Record<SampleName, FitDoc> = z
  .object({ rifter: FitDocSchema, merlin: FitDocSchema, thrasher: FitDocSchema })
  .parse(fitsJson)

const results: CalcResult[] = [rifter, merlin, thrasher].map((r) => CalcResultSchema.parse(r))
const resultByShip = new Map(results.map((r) => [r.ship.typeId, r]))

const CatalogSchema = z.object({
  dataVersion: z.string(),
  modules: z.array(ItemRowSchema.extend({ slot: SlotKindSchema, family: z.number().int() })),
  charges: z.record(z.string(), z.array(ItemRowSchema)),
})
const catalog = CatalogSchema.parse(catalogJson)

/** typeID → English name, for export. */
const names = new Map<number, string>()
for (const r of results) names.set(r.ship.typeId, r.ship.name.en)
for (const m of catalog.modules) names.set(m.typeId, m.name.en)
for (const list of Object.values(catalog.charges)) for (const c of list) names.set(c.typeId, c.name.en)

const toRow = ({ typeId, name, iconId, meta, metaLevel, keyValue, keyLine }: ItemRow): ItemRow => ({
  typeId, name, iconId, meta, metaLevel, keyValue, keyLine,
})

/** Group rows in META_GROUPS order, each sorted by keyValue (high first), then meta level. */
export function groupItems(rows: ItemRow[]): ItemGroup[] {
  const out: ItemGroup[] = []
  for (const meta of META_GROUPS) {
    const items = rows
      .filter((r) => r.meta === meta)
      .map(toRow)
      .sort((a, b) =>
        (b.keyValue ?? -Infinity) - (a.keyValue ?? -Infinity) ||
        (b.metaLevel ?? 0) - (a.metaLevel ?? 0) ||
        a.name.en.localeCompare(b.name.en))
    if (items.length === 0) continue
    const values = items.flatMap((i) => (i.keyValue === null ? [] : [i.keyValue]))
    out.push({ meta, items, best: values.length ? Math.max(...values) : null })
  }
  return out
}

const matches = (row: ItemRow, query?: string) => {
  const q = query?.trim().toLowerCase()
  return !q || row.name.en.toLowerCase().includes(q) || row.name.zh.includes(q)
}

const SLOT_EFT: [SlotKind, string][] = [['low', 'Low'], ['mid', 'Med'], ['high', 'High'], ['rig', 'Rig'], ['subsystem', 'Subsystem']]

function slotTotal(fit: FitDoc, slot: SlotKind) {
  return resultByShip.get(fit.shipTypeId)?.resources.slots[slot].total ?? fit.modules[slot].length
}

function eftLine(m: FitModule) {
  let line = names.get(m.typeId) ?? `typeID ${m.typeId}`
  if (m.chargeTypeId !== null) line += `, ${names.get(m.chargeTypeId) ?? `typeID ${m.chargeTypeId}`}`
  if (m.state === 'offline') line += ' /OFFLINE'
  return line
}

function exportEft(fit: FitDoc) {
  const blocks: string[] = []
  for (const [slot, label] of SLOT_EFT) {
    const total = Math.max(slotTotal(fit, slot), fit.modules[slot].length)
    if (total === 0) continue
    const lines: string[] = []
    for (let i = 0; i < total; i++) {
      const m = fit.modules[slot][i]
      lines.push(m ? eftLine(m) : `[Empty ${label} slot]`)
    }
    blocks.push(lines.join('\n'))
  }
  const drones = fit.drones.map((d) => `${names.get(d.typeId) ?? d.typeId} x${d.amount}`)
  const cargo = fit.cargo.map((c) => `${names.get(c.typeId) ?? c.typeId} x${c.amount}`)
  for (const extra of [drones, cargo]) if (extra.length) blocks.push(extra.join('\n'))
  return `[${names.get(fit.shipTypeId)}, ${fit.name}]\n${blocks.join('\n\n')}\n`
}

function allModules(fit: FitDoc) {
  return Object.values(fit.modules).flat().filter((m): m is FitModule => m !== null)
}

function countTypes(ids: number[]) {
  const counts = new Map<number, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

function exportDna(fit: FitDoc) {
  const mods = countTypes(allModules(fit).map((m) => m.typeId))
  const charges = countTypes(allModules(fit).flatMap((m) => (m.chargeTypeId === null ? [] : [m.chargeTypeId])))
  const parts = [String(fit.shipTypeId)]
  for (const [id, n] of mods) parts.push(`${id};${n}`)
  for (const [id, n] of charges) parts.push(`${id};${n}`)
  return `${parts.join(':')}::`
}

function exportMultibuy(fit: FitDoc) {
  const counts = countTypes([fit.shipTypeId, ...allModules(fit).map((m) => m.typeId)])
  return [...counts].map(([id, n]) => `${names.get(id) ?? id} x${n}`).join('\n') + '\n'
}

const clone = <T>(x: T): T => structuredClone(x)

export const mockEngine: EngineClient = {
  async calc(fit) {
    const result = resultByShip.get(fit.shipTypeId)
    if (!result) throw new Error(`mockEngine has no fixture for ship typeID ${fit.shipTypeId}`)
    return clone(result)
  },

  async itemsForSlot(_fit, slot, query) {
    return groupItems(catalog.modules.filter((m) => m.slot === slot && matches(m, query)))
  },

  async chargesFor(fit, pos) {
    const mod = fit.modules[pos.slot][pos.index]
    if (!mod) return []
    return groupItems(catalog.charges[String(mod.typeId)] ?? [])
  },

  async variationsOf(typeId) {
    const self = catalog.modules.find((m) => m.typeId === typeId)
    if (!self) return []
    return groupItems(catalog.modules.filter((m) => m.family === self.family))
  },

  async importText(text) {
    const header = /^\s*\[([^,\]]+),\s*([^\]]*)\]/.exec(text)
    const sample = header && Object.values(sampleFits).find((f) => names.get(f.shipTypeId) === header[1]?.trim())
    if (!header || !sample) {
      return { fits: [], warnings: ['mockEngine only imports EFT text for the sample ships (Rifter, Merlin, Thrasher)'] }
    }
    return { fits: [{ ...clone(sample), name: header[2]?.trim() || sample.name }], warnings: [] }
  },

  async exportText(fit, format: ExportFormat) {
    if (format === 'eft') return exportEft(fit)
    if (format === 'dna') return exportDna(fit)
    return exportMultibuy(fit)
  },

  async missingSkills() {
    return []
  },
}
