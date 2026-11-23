/**
 * `mockEngine`: an EngineClient backed by the fixtures from etl/fixtures/make_fixtures.py,
 * so the UI can be built before the Pyodide worker exists.
 *
 * Ship statistics are fixture values. Editable rows and fitting resource deltas are
 * projected from sample modules so UI interactions work without Pyodide.
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
  SLOT_KINDS,
  SlotKindSchema,
  type CalcResult,
  type EngineClient,
  type ExportFormat,
  type FitDoc,
  type FitModule,
  type ItemGroup,
  type ItemDetails,
  type LName,
  type ModuleSlotRow,
  type ModuleState,
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

const modules = new Map(catalog.modules.map((m) => [m.typeId, m]))
const charges = new Map(Object.values(catalog.charges).flat().map((item) => [item.typeId, item]))
const templates = new Map<number, ModuleSlotRow>()
for (const result of results) {
  for (const row of Object.values(result.slots).flat()) {
    if (row.kind === 'module') templates.set(row.typeId, row)
  }
}

const familyTemplates = new Map<number, ModuleSlotRow>()
for (const [typeId, row] of templates) {
  const family = modules.get(typeId)?.family
  if (family !== undefined) familyTemplates.set(family, row)
}

// Market tree for the fixture's variation families from the same eve.db build.
const marketLeaves: Record<number, number> = {
  439: 542,
  447: 1936,
  486: 574,
  520: 646,
  523: 1049,
  526: 683,
  564: 561,
  578: 1696,
  2046: 615,
  3829: 606,
  9944: 648,
  31358: 1222,
  31526: 1228,
  31668: 1237,
  31704: 1237,
}
const marketNodes: Record<number, [parent: number | null, en: string, zh: string]> = {
  9: [null, "Ship Equipment", "舰船装备"],
  10: [9, "Turrets & Launchers", "炮台和发射器"],
  14: [9, "Hull & Armor", "船体和装甲"],
  52: [9, "Propulsion", "推进器"],
  86: [10, "Hybrid Turrets", "混合炮台"],
  87: [10, "Projectile Turrets", "射弹炮台"],
  134: [14, "Armor Repairers", "装甲维修器"],
  143: [10, "Weapon Upgrades", "武器升级"],
  542: [52, "Afterburners", "加力燃烧器"],
  551: [554, "Shield Extenders", "护盾扩展装置"],
  553: [554, "Shield Hardeners", "护盾增强系统"],
  554: [9, "Shield", "护盾"],
  556: [86, "Blasters", "疾速炮"],
  559: [87, "Autocannons", "自动加农炮"],
  561: [556, "Small", "小型"],
  574: [559, "Small", "小型"],
  606: [551, "Medium", "中型"],
  615: [14, "Damage Controls", "损伤控制"],
  646: [143, "Gyrostabilizers", "回转稳定器"],
  648: [143, "Magnetic Field Stabilizers", "磁性力场稳定器"],
  657: [9, "Electronic Warfare", "电子战"],
  683: [657, "Stasis Webifiers", "停滞缠绕光束"],
  955: [null, "Ship and Module Modifications", "舰船和装备改装件"],
  961: [1111, "Engineering Rigs", "工程改装件"],
  963: [1111, "Hybrid Weapon Rigs", "混合武器改装件"],
  979: [1111, "Projectile Weapon Rigs", "射弹武器改装件"],
  1049: [134, "Small", "小型"],
  1111: [955, "Rigs", "改装件"],
  1222: [961, "Small Engineering Rigs", "小型工程改装件"],
  1228: [963, "Small Hybrid Weapon Rigs", "小型混合武器改装件"],
  1237: [979, "Small Projectile Weapon Rigs", "小型射弹武器改装件"],
  1696: [553, "Multispectrum Shield Hardeners", "多谱式护盾增强器"],
  1936: [657, "Warp Scramblers", "跃迁扰频器"],
}

function marketGroupFor(family: number): ItemRow['marketGroup'] {
  const leaf = marketLeaves[family]
  if (leaf === undefined) return undefined
  const path = []
  let id: number | null = leaf
  while (id !== null) {
    const node: (typeof marketNodes)[number] | undefined = marketNodes[id]
    if (!node) break
    const [parent, en, zh]: [number | null, string, string] = node
    path.unshift({ id, name: { en, zh } })
    id = parent
  }
  const group = path.pop()
  return group && { ...group, ancestors: path }
}

const templateFor = (id: number) => templates.get(id) ?? familyTemplates.get(modules.get(id)?.family ?? -1)
const statesFor = (item?: ModuleSlotRow): ModuleState[] =>
  item?.state === 'active' || item?.state === 'overheated'
    ? ['offline', 'online', 'active', 'overheated']
    : ['offline', 'online']

const shipGroups: Record<number, LName> = {
  587: { en: 'Frigate', zh: '护卫舰' },
  603: { en: 'Frigate', zh: '护卫舰' },
  16242: { en: 'Destroyer', zh: '驱逐舰' },
}

const toRow = (row: ItemRow): ItemRow => ItemRowSchema.parse(row)

function browseRow(item: typeof catalog.modules[number]): ItemRow {
  const template = templateFor(item.typeId)
  return {
    ...toRow(item),
    fitting: template && { cpu: template.cpu, powergrid: template.powergrid },
    marketGroup: marketGroupFor(item.family),
    supportedStates: statesFor(template),
  }
}

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

function projectSlots(fit: FitDoc, result: CalcResult) {
  for (const slot of SLOT_KINDS) {
    const total = result.resources.slots[slot].total
    const original = result.slots[slot].filter((row) => row.kind === 'module')
    const rows = new Map<string, ModuleSlotRow>()
    const empty: number[] = []
    for (let index = 0; index < Math.max(total, fit.modules[slot].length); index++) {
      const mod = fit.modules[slot][index]
      if (!mod) {
        if (index < total) empty.push(index)
        continue
      }
      const item = modules.get(mod.typeId)
      const base = original.find((row) => row.typeId === mod.typeId) ?? templateFor(mod.typeId)
      const overSlots = index >= total
      const key = JSON.stringify([mod.typeId, mod.state, mod.chargeTypeId, overSlots])
      const merged = rows.get(key)
      if (merged) {
        merged.positions.push(index)
        merged.count++
        continue
      }
      const charge = mod.chargeTypeId === null ? undefined : charges.get(mod.chargeTypeId)
      rows.set(key, {
        kind: 'module', typeId: mod.typeId, state: mod.state,
        name: item?.name ?? base?.name ?? { en: String(mod.typeId), zh: String(mod.typeId) },
        iconId: item?.iconId ?? null, meta: item?.meta ?? 'tech1',
        count: 1, positions: [index], overSlots,
        charge: charge ? { ...charge, count: base?.charge?.count ?? 1 } : null,
        keyLine: base?.keyLine ?? '', keyParts: base?.keyParts ?? [],
        cpu: base?.cpu ?? 0, powergrid: base?.powergrid ?? 0,
        supportedStates: statesFor(base),
      })
    }
    result.slots[slot] = [...rows.values()]
    if (empty.length) result.slots[slot].push({ kind: 'empty', count: empty.length, positions: empty })
    result.resources.slots[slot].used = [...rows.values()].reduce((n, row) => n + row.count, 0)
    for (const resource of ['cpu', 'powergrid'] as const) {
      const used = (mods: ModuleSlotRow[]) => mods.reduce((n, row) => n + (row.state === 'offline' ? 0 : row[resource] * row.count), 0)
      result.resources[resource].used += used([...rows.values()]) - used(original)
    }
  }
  for (const kind of ['cpu', 'powergrid'] as const) {
    const resource = result.resources[kind]
    resource.used = Math.max(0, Math.round(resource.used * 100) / 100)
    result.warnings = result.warnings.filter((warning) => warning.kind !== kind)
    if (resource.used > resource.total) result.warnings.push({ kind, ...resource })
  }
  for (const slot of SLOT_KINDS) {
    const kind = `${slot}Slots` as const
    const resource = result.resources.slots[slot]
    result.warnings = result.warnings.filter((warning) => warning.kind !== kind)
    if (resource.used > resource.total) result.warnings.push({ kind, ...resource })
  }
}

export const mockEngine: EngineClient = {
  async calc(fit) {
    const result = resultByShip.get(fit.shipTypeId)
    if (!result) throw new Error(`mockEngine has no fixture for ship typeID ${fit.shipTypeId}`)
    const projected = clone(result)
    projected.ship.group = shipGroups[fit.shipTypeId]
    projectSlots(fit, projected)
    return projected
  },

  async getDataVersion() {
    return catalog.dataVersion
  },

  async itemInfo(typeId, fit, pos) {
    const item = modules.get(typeId) ?? charges.get(typeId)
    const ship = resultByShip.get(typeId)?.ship
    const name = item?.name ?? ship?.name
    if (!name) return null
    const base = templateFor(typeId)
    const installed = fit && pos && fit.modules[pos.slot][pos.index]?.typeId === typeId
    const details: ItemDetails = {
      typeId, name, iconId: item?.iconId ?? null, meta: item?.meta,
      group: ship ? shipGroups[ship.typeId] : undefined,
      attributes: base ? [
        { id: 50, name: { en: 'CPU usage', zh: 'CPU使用量' }, base: typeId === 2889 ? 9 : base.cpu, current: installed ? base.cpu : undefined },
        { id: 30, name: { en: 'Powergrid usage', zh: '能量栅格占用' }, base: typeId === 2889 ? 4 : base.powergrid, current: installed ? base.powergrid : undefined },
      ] : [],
      skills: [],
    }
    if (typeId === 2889) {
      details.group = { en: 'Small Projectile Turret', zh: '小型射弹炮台' }
      details.description = {
        en: "The 200mm is a powerful autocannon that can smash apart most lightly armored frigates with ease. \n\nMust be loaded with any of the following regular and advanced projectile ammo types: Carbonized Lead, Depleted Uranium, EMP, Fusion, Nuclear, Phased Plasma, Proton, Titanium Sabot, Barrage, Hail.",
        zh: "这种200mm自动加农炮威力强大，可以轻松击毁大部分装甲薄弱的护卫舰。必须装填以下类型的常规和高级射弹弹药：碳铅弹、贫铀弹、电磁脉冲弹、聚变弹、核芯弹、定相离子弹、质子弹、钛合金萨博弹、“雷暴”、“冰雹”。",
      }
      const sampleContext = installed && fit?.shipTypeId === 587 && fit.character === 'all5' &&
        pos && fit.modules[pos.slot][pos.index]?.chargeTypeId === 21898
      details.attributes.unshift(
        { id: 64, name: { en: 'Damage multiplier', zh: '伤害量调整' }, base: 3.465, current: sampleContext ? 6.03 : undefined },
        { id: 51, name: { en: 'Rate of fire', zh: '射击速度' }, base: 3.75, current: sampleContext ? 1.38 : undefined, unit: 's' },
        { id: 54, name: { en: 'Optimal range', zh: '最佳射程' }, base: 1.2, current: sampleContext ? 0.75 : undefined, unit: 'km' },
        { id: 158, name: { en: 'Falloff', zh: '失准范围' }, base: 5.16, current: sampleContext ? 9.68 : undefined, unit: 'km' },
        { id: 160, name: { en: 'Tracking', zh: '炮台跟踪速度' }, base: 315, current: sampleContext ? 452.8 : undefined },
      )
      details.skills = [
        { typeId: 3302, name: { en: 'Small Projectile Turret', zh: '小型射弹炮台研究' }, requiredLevel: 5, currentLevel: fit?.character === 'all0' ? 0 : 5 },
        { typeId: 3300, name: { en: 'Gunnery', zh: '射击学' }, requiredLevel: 2, currentLevel: fit?.character === 'all0' ? 0 : 5 },
        { typeId: 11084, name: { en: 'Small Autocannon Specialization', zh: '小型自动加农炮专业研究' }, requiredLevel: 1, currentLevel: fit?.character === 'all0' ? 0 : 5 },
      ]
    }
    return details
  },

  async marketGroupsForSlot(_fit, slot) {
    const groups = catalog.modules.filter((item) => item.slot === slot).flatMap((item) => marketGroupFor(item.family) ?? [])
    return [...new Map(groups.map((group) => [group.id, group])).values()]
  },

  async itemsForSlot(fit, slot, query, options) {
    const source = catalog.modules.filter((item) => item.slot === slot && matches(item, query))
      .filter((item) => options?.marketGroupId === undefined || marketLeaves[item.family] === options.marketGroupId)
      .filter((item) => options?.meta === undefined || item.meta === options.meta)
    const rows = source.map(browseRow)
    if (!options?.preview) return groupItems(rows)
    const result = await mockEngine.calc(fit)
    for (const row of rows) {
      const fitting = row.fitting
      if (!fitting) continue
      row.resourceOverages = (['cpu', 'powergrid'] as const).flatMap((kind) => {
        const { used, total } = result.resources[kind]
        const projected = Math.round((used + fitting[kind]) * 100) / 100
        return projected > total ? [{ kind, used: projected, total, overBy: Math.round((projected - total) * 100) / 100 }] : []
      })
    }
    return groupItems(rows)
  },

  async chargesFor(fit, pos) {
    const mod = fit.modules[pos.slot][pos.index]
    if (!mod) return []
    return groupItems(catalog.charges[String(mod.typeId)] ?? catalog.charges[String(templateFor(mod.typeId)?.typeId)] ?? [])
  },

  async variationsOf(typeId) {
    const self = catalog.modules.find((m) => m.typeId === typeId)
    if (!self) return []
    return groupItems(catalog.modules.filter((m) => m.family === self.family).map(browseRow))
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
