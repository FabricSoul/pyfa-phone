/**
 * Contract between the browser main thread and the engine Worker (Pyodide + pyfa eos).
 *
 * The zod schemas are the single source of truth: TypeScript types are inferred from
 * them, and `isCalcResult` validates whatever comes back from the Worker at runtime.
 * `etl/fixtures/make_fixtures.py` writes JSON in exactly this shape.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared pieces

/** Item names are shown in both languages; `zh` falls back to `en` when eve.db has no translation. */
export const LNameSchema = z.object({ en: z.string(), zh: z.string() })
export type LName = z.infer<typeof LNameSchema>

export const SLOT_KINDS = ['high', 'mid', 'low', 'rig', 'subsystem'] as const
export const SlotKindSchema = z.enum(SLOT_KINDS)
export type SlotKind = z.infer<typeof SlotKindSchema>

/** Matches eos FittingModuleState: offline -1, online 0, active 1, overheated 2. */
export const MODULE_STATES = ['offline', 'online', 'active', 'overheated'] as const
export const ModuleStateSchema = z.enum(MODULE_STATES)
export type ModuleState = z.infer<typeof ModuleStateSchema>

/** Tech-level groups in display order (DESIGN.md §5 物品列表). */
export const META_GROUPS = ['tech2', 'tech1', 'faction', 'storyline', 'deadspace', 'officer'] as const
export const MetaGroupSchema = z.enum(META_GROUPS)
export type MetaGroup = z.infer<typeof MetaGroupSchema>

const num = z.number().finite()
const UsedTotalSchema = z.object({ used: num, total: num })
export type UsedTotal = z.infer<typeof UsedTotalSchema>

const DamageTypesSchema = z.object({ em: num, thermal: num, kinetic: num, explosive: num })
export type DamageTypes = z.infer<typeof DamageTypesSchema>

// ---------------------------------------------------------------------------
// FitDoc — what we store in IndexedDB (design §4.5). Items are always typeIDs.

export const FitModuleSchema = z.object({
  typeId: z.number().int(),
  state: ModuleStateSchema,
  chargeTypeId: z.number().int().nullable(),
  spoolCycles: z.number().int().nonnegative().optional(),
})
export type FitModule = z.infer<typeof FitModuleSchema>

export const FitDocSchema = z.object({
  /** Format version of this JSON, bumped on breaking changes. */
  schema: z.literal(1),
  /** Asset version from the manifest. Legacy docs may still carry a client build here. */
  dataVersion: z.string(),
  clientBuild: z.string().optional(),
  /** Last known display name per typeID, including loaded charges and attachments. */
  itemNames: z.record(z.string(), LNameSchema).optional(),
  name: z.string(),
  shipTypeId: z.number().int(),
  modeTypeId: z.number().int().optional(),
  /** Positional: index = slot position; `null` = an empty slot the user kept. Slots past the end are empty too. */
  modules: z.object({
    high: z.array(FitModuleSchema.nullable()),
    mid: z.array(FitModuleSchema.nullable()),
    low: z.array(FitModuleSchema.nullable()),
    rig: z.array(FitModuleSchema.nullable()),
    subsystem: z.array(FitModuleSchema.nullable()),
  }),
  drones: z.array(z.object({ typeId: z.number().int(), amount: z.number().int(), active: z.number().int() })),
  fighters: z.array(z.object({ typeId: z.number().int(), amount: z.number().int(), active: z.boolean() })).optional(),
  cargo: z.array(z.object({ typeId: z.number().int(), amount: z.number().int() })),
  implants: z.array(z.number().int()),
  /** Older documents inherit the global default. */
  implantSource: z.enum(['fit', 'character']).optional(),
  boosters: z.array(z.number().int()),
  /** Enabled eos effect IDs keyed by booster type ID. Unlisted effects are off. */
  boosterSideEffects: z.record(z.string(), z.array(z.number().int())).optional(),
  notes: z.string(),
  character: z.enum(['all5', 'all0']),
  /** pyfa built-in damage pattern id (negative; -1 = Uniform). */
  damagePatternId: z.number().int(),
  /** pyfa built-in target profile id, or null for an ideal target. */
  targetProfileId: z.number().int().nullable(),
})
export type FitDoc = z.infer<typeof FitDocSchema>

/** Where a module sits in a FitDoc. */
export interface ModulePos {
  slot: SlotKind
  index: number
}

// ---------------------------------------------------------------------------
// CalcResult — everything one recalculation returns.

export const ChargeInfoSchema = z.object({
  typeId: z.number().int(),
  name: LNameSchema,
  iconId: z.number().int().nullable(),
  /** Charges loaded per module. */
  count: z.number().int(),
  cycles: z.number().int().nonnegative().optional(),
  omega: z.boolean().optional(),
  removed: z.literal(true).optional(),
})
export type ChargeInfo = z.infer<typeof ChargeInfoSchema>

export const ModuleSlotRowSchema = z.object({
  kind: z.literal('module'),
  typeId: z.number().int(),
  name: LNameSchema,
  iconId: z.number().int().nullable(),
  meta: MetaGroupSchema,
  /** Modules merged into this row (same type, state and charge). */
  count: z.number().int().positive(),
  /** FitDoc indices of the merged modules, in order. */
  positions: z.array(z.number().int()),
  state: ModuleStateSchema,
  charge: ChargeInfoSchema.nullable(),
  /** pyfa range column and Misc column joined with " · "; may be empty (pyfa shows nothing either). */
  keyLine: z.string(),
  /** The non-empty parts of keyLine, most important first (UI bolds the first). */
  keyParts: z.array(z.string()),
  omega: z.boolean().optional(),
  dps: num.optional(),
  rangeText: z.string().optional(),
  miscText: z.string().optional(),
  miscTooltip: z.string().optional(),
  capacitor: z.string().optional(),
  velocityBonus: num.optional(),
  repairPerSecond: num.optional(),
  missileRange: z.object({ low: num, high: num, highChance: num }).optional(),
  calibration: num.optional(),
  hullResistanceBonus: num.optional(),
  /** Per module, not multiplied by count. */
  cpu: num,
  powergrid: num,
  /** True when a merged module sits beyond the ship's slot count. */
  overSlots: z.boolean(),
  supportedStates: z.array(ModuleStateSchema).optional(),
  adjustment: z.literal('state').optional(),
  maxSpoolCycles: z.number().int().positive().optional(),
})
export const EmptySlotRowSchema = z.object({
  kind: z.literal('empty'),
  count: z.number().int().positive(),
  positions: z.array(z.number().int()),
})
export const RemovedSlotRowSchema = EmptySlotRowSchema.extend({
  kind: z.literal('removed'),
  adjustment: z.literal('slot').optional(),
  typeId: z.number().int(),
  name: LNameSchema,
})
export const SlotRowSchema = z.discriminatedUnion('kind', [ModuleSlotRowSchema, EmptySlotRowSchema, RemovedSlotRowSchema])
export type ModuleSlotRow = z.infer<typeof ModuleSlotRowSchema>
export type EmptySlotRow = z.infer<typeof EmptySlotRowSchema>
export type SlotRow = z.infer<typeof SlotRowSchema>

export const WARNING_KINDS = [
  'cpu', 'powergrid', 'calibration', 'turretHardpoints', 'launcherHardpoints',
  'cargo', 'droneBay', 'droneBandwidth', 'activeDrones', 'fighterBay', 'fighterTubes',
  'highSlots', 'midSlots', 'lowSlots', 'rigSlots', 'subsystemSlots',
] as const
export const WarningSchema = z.object({ kind: z.enum(WARNING_KINDS), used: num, total: num })
export type Warning = z.infer<typeof WarningSchema>

const LayerSchema = z.object({ hp: num, ehp: num, resists: DamageTypesSchema })
const TankSchema = z.object({ passiveShield: num, shield: num, armor: num, hull: num })

export const StatsSchema = z.object({
  firepower: z.object({ dps: num, weaponDps: num, droneDps: num, volley: num, includesReload: z.boolean(), effective: z.boolean().optional() }),
  mining: z.object({ miner: num, drone: num, total: num, unit: z.literal('m³/s') }),
  defense: z.object({
    hp: num,
    ehp: num,
    /** Resists are fractions 0–1; EHP uses the fit's damage pattern. */
    layers: z.object({ shield: LayerSchema, armor: LayerSchema, hull: LayerSchema }),
  }),
  repair: z.object({
    unit: z.literal('EHP/s'),
    reinforced: TankSchema,
    sustained: TankSchema,
    raw: z.object({ unit: z.literal('HP/s'), reinforced: TankSchema, sustained: TankSchema }),
  }),
  remoteRepair: z.object({ shield: num, armor: num, hull: num, capacitor: num }),
  capacitor: z.object({
    capacity: num,
    /** Fraction resisted, 0–1. */
    neutralizerResistance: num,
    rechargeTime: num,
    stable: z.boolean(),
    /** Set when stable, 0–100. */
    stablePercent: num.nullable(),
    /** Set when unstable: seconds until empty (eos capState). */
    lastsSeconds: num.nullable(),
    /** GJ/s: recharge − usage. */
    delta: num,
    recharge: num,
    usage: num,
  }),
  navigation: z.object({
    maxVelocity: num,
    alignTime: num,
    signatureRadius: num,
    /** AU/s */
    warpSpeed: num,
    /** metres */
    maxTargetRange: num,
    maxTargets: num,
    scanResolution: num,
    sensorType: z.enum(['radar', 'ladar', 'magnetometric', 'gravimetric', 'multispectral']).nullable(),
    jamChance: num.optional(),
    agility: num.optional(),
    maxWarpDistance: num.optional(),
    warpCoreStrength: num.optional(),
    lockTimes: z.array(z.object({
      target: z.enum(['pod', 'interceptor', 'frigate', 'destroyer', 'cruiser', 'battlecruiser', 'battleship', 'carrier']),
      seconds: num,
    })).optional(),
    sensorStrength: num,
    /** metres */
    droneControlRange: num,
    /** kg */
    mass: num,
  }),
})
export type Stats = z.infer<typeof StatsSchema>

export const RangeCurveSchema = z.object({
  /** Kilometres, evenly sampled through the fitted weapons’ effective range. */
  distancesKm: z.array(num),
  /** Current charge first; at most 3 series. Stationary target, tracking ignored. */
  series: z.array(z.object({
    chargeTypeId: z.number().int().nullable(),
    name: LNameSchema,
    dps: z.array(num),
  })).max(3),
})
export type RangeCurve = z.infer<typeof RangeCurveSchema>

const PriceStackSchema = z.array(z.object({ typeId: z.number().int(), quantity: z.number().int().positive() }))

const MissingSkillSchema = z.object({
  typeId: z.number().int(),
  name: LNameSchema,
  requiredLevel: z.number().int(),
  currentLevel: z.number().int(),
})

export const FIGHTER_KINDS = ['light', 'heavy', 'support'] as const
export type FighterKind = typeof FIGHTER_KINDS[number]
const ExtraItemDetailsSchema = z.object({
  iconId: z.number().int().nullable(),
  graphicId: z.number().int().nullable(),
  volume: num.optional(),
  slot: z.number().int().optional(),
  sideEffects: z.array(z.object({ id: z.number().int(), name: LNameSchema, percent: num })).optional(),
})
export type ExtraItemDetails = z.infer<typeof ExtraItemDetailsSchema>

export const CalcResultSchema = z.object({
  dataVersion: z.string(),
  clientBuild: z.string(),
  /** Merge into FitDoc.itemNames when persisting an edited fit. */
  itemNames: z.record(z.string(), LNameSchema),
  ship: z.object({ typeId: z.number().int(), name: LNameSchema, graphicId: z.number().int().nullable(), group: LNameSchema.optional() }),
  resources: z.object({
    cpu: UsedTotalSchema,
    powergrid: UsedTotalSchema,
    calibration: UsedTotalSchema,
    turretHardpoints: UsedTotalSchema,
    launcherHardpoints: UsedTotalSchema,
    /** m³ */
    cargo: UsedTotalSchema,
    /** m³ */
    droneBay: UsedTotalSchema,
    activeDrones: UsedTotalSchema,
    fighterBay: UsedTotalSchema,
    fighterTubes: UsedTotalSchema,
    /** Nonzero specialized cargo capacities keyed by dogma attribute name, in m³. */
    specializedBays: z.record(z.string(), num),
    /** Mbit/s */
    droneBandwidth: UsedTotalSchema,
    slots: z.object({
      high: UsedTotalSchema,
      mid: UsedTotalSchema,
      low: UsedTotalSchema,
      rig: UsedTotalSchema,
      subsystem: UsedTotalSchema,
    }),
  }),
  slots: z.object({
    high: z.array(SlotRowSchema),
    mid: z.array(SlotRowSchema),
    low: z.array(SlotRowSchema),
    rig: z.array(SlotRowSchema),
    subsystem: z.array(SlotRowSchema),
  }),
  stats: StatsSchema,
  missingSkills: z.array(MissingSkillSchema).optional(),
  modes: z.object({
    selected: z.number().int(),
    options: z.array(z.object({ typeId: z.number().int(), name: LNameSchema })),
  }).optional(),
  squadrons: z.object({
    drones: z.array(z.object({
      index: z.number().int(), typeId: z.number().int(), active: z.number().int(), bandwidth: num,
      optimalRange: num, falloff: num, velocity: num, hp: num,
    })),
    fighters: z.array(z.object({
      index: z.number().int(), typeId: z.number().int(), active: z.boolean(), maxAmount: z.number().int(),
      kind: z.enum(FIGHTER_KINDS).nullable(), velocity: num, hp: num,
    })),
    fighterSlots: z.record(z.enum(FIGHTER_KINDS), UsedTotalSchema),
  }).optional(),
  extras: z.object({
    items: z.record(z.string(), ExtraItemDetailsSchema),
    /** Unrounded m³ capacity for filling cargo with small items. */
    cargoCapacity: num.optional(),
  }).optional(),
  priceItems: z.object({
    ship: PriceStackSchema,
    modules: PriceStackSchema,
    loadedCharges: PriceStackSchema,
    drones: PriceStackSchema,
    fighters: PriceStackSchema,
    cargo: PriceStackSchema,
    implants: PriceStackSchema,
    boosters: PriceStackSchema,
  }),
  rangeCurve: RangeCurveSchema,
  /** Only real overages (used > total); 400/400 is not a warning. */
  warnings: z.array(WarningSchema),
})
export type CalcResult = z.infer<typeof CalcResultSchema>

export function isCalcResult(x: unknown): x is CalcResult {
  return CalcResultSchema.safeParse(x).success
}

// ---------------------------------------------------------------------------
// Item lists (add module, charges, variations)

export const MarketGroupSchema = z.object({
  id: z.number().int(), name: LNameSchema,
  /** Root through immediate parent. */
  ancestors: z.array(z.object({ id: z.number().int(), name: LNameSchema })).optional(),
})
export type MarketGroup = z.infer<typeof MarketGroupSchema>

export interface MarketTreeNode {
  id: number
  name: LName
  iconId: number | null
  displayIconId?: number
  count: number
  directCount: number
  children: MarketTreeNode[]
}

export interface SlotMarketTree {
  rootId: number
  total: number
  groups: MarketTreeNode[]
}

export interface SlotItemsOptions {
  marketGroupId?: number
  exactMarketGroup?: boolean
  typeIds?: number[]
  meta?: MetaGroup
  /** Skip eos insertion/recalculation during the initial list request. */
  preview?: boolean
  calcOptions?: CalcOptions
}

export const FitRestrictionSchema = z.enum([
  'typeLimit', 'groupLimit', 'hull', 'rigSize', 'subsystemSlot', 'capitalSize', 'slotLimit', 'hardpointLimit',
])

export const ItemRowSchema = z.object({
  typeId: z.number().int(),
  name: LNameSchema,
  iconId: z.number().int().nullable(),
  meta: MetaGroupSchema,
  metaLevel: z.number().int().nullable(),
  /** The number the group is sorted by (descending); null when there is none. */
  keyValue: num.nullable(),
  keyLine: z.string(),
  marketGroup: MarketGroupSchema.optional(),
  initialState: ModuleStateSchema.optional(),
  fitRestriction: FitRestrictionSchema.optional(),
  resourceOverages: z.array(WarningSchema.extend({ overBy: num })).optional(),
  supportedStates: z.array(ModuleStateSchema).optional(),
  fitting: z.object({ cpu: num, powergrid: num }).optional(),
  /** Variations only: how this module differs from the fitted one, with the fit's CPU after replacing them. */
  compare: z.object({
    /** Relative change of the base damage multiplier (-0.04 = 4% lower); null when it has none. */
    damage: num.nullable(),
    /** Fitted CPU difference in teraflops. */
    cpu: num,
    /** CPU left over once every replaced module is this one. */
    cpuLeft: num,
  }).optional(),
  canAddToCargo: z.boolean().optional(),
  canAddToDroneBay: z.boolean().optional(),
})
export type ItemRow = z.infer<typeof ItemRowSchema>

export const ItemGroupSchema = z.object({
  meta: MetaGroupSchema,
  items: z.array(ItemRowSchema),
  /** Best keyValue in the group, shown when the group is collapsed. */
  best: num.nullable(),
})
export type ItemGroup<T extends ItemRow = ItemRow> = Omit<z.infer<typeof ItemGroupSchema>, 'items'> & { items: T[] }

export const ChargeOptionSchema = ItemRowSchema.extend({
  dps: num,
  /** Metres. */
  optimalRange: num,
  /** Metres. */
  falloff: num,
  /** DPS by damage type after the fitted weapon's modifiers. */
  damageMix: DamageTypesSchema,
})
export type ChargeOption = z.infer<typeof ChargeOptionSchema>
export type ChargeGroup = ItemGroup<ChargeOption>

export interface SlotItemFilters extends SlotItemsOptions {
  /** EVE inventory group ID. */
  group?: number
  metaGroup?: MetaGroup
  query?: string
}

export interface CalcOptions {
  includeReload?: boolean
  includeReactivation?: boolean
  strictSkills?: boolean
  useCharacterImplants?: boolean
  defaultSpoolPercent?: number
}

export type ImportFormat = 'EFT' | 'DNA' | 'XML' | 'ESI'

export interface ImportAmbiguity {
  name: string
  candidates: { typeId: number; name: string }[]
}

export interface ImportResult {
  fits: FitDoc[]
  format?: ImportFormat
  ambiguities?: ImportAmbiguity[]
  /** Lines pyfa could not parse, kept for the user to see. */
  warnings: string[]
}

export type MissingSkill = z.infer<typeof MissingSkillSchema>

export type ExportFormat = 'eft' | 'dna' | 'multibuy'
export type EftExportOptions = Record<'charges' | 'cargo' | 'implants' | 'boosters', boolean>

export type ImportAddition = 'cargo' | 'drones'

export interface ImportAdditionsResult {
  items: { typeId: number; amount: number }[]
  warnings: string[]
  ambiguities?: ImportAmbiguity[]
}

export interface CatalogShip {
  typeId: number
  name: LName
  graphicId: number | null
  raceId: number | null
}

export interface ShipCatalog {
  dataVersion: string
  groups: { id: number; name: LName; ships: CatalogShip[] }[]
}

export type ExtraCollection = 'cargo' | 'drones' | 'fighters' | 'implants' | 'boosters'

export interface ImplantSet {
  id: number
  name: LName
  implants: { typeId: number; name: LName; slot: number }[]
}

export interface SlotFill {
  index: number
  module: FitModule
}

/** What the UI calls; implemented by the Worker client and by `mockEngine`. */
export interface EngineClient {
  calc(fit: FitDoc, options?: CalcOptions): Promise<CalcResult>
  /** Groups in META_GROUPS order, empty groups omitted. */
  itemsForSlot(fit: FitDoc, slot: SlotKind, filters?: SlotItemFilters | string, options?: SlotItemsOptions): Promise<ItemGroup[]>
  /** Lightweight market navigation for eligible modules, with no insertion previews. */
  marketGroupsForSlot?(fit: FitDoc, slot: SlotKind): Promise<MarketGroup[]>
  marketTreeForSlot?(slot: SlotKind): Promise<SlotMarketTree>
  chargesFor(fit: FitDoc, pos: ModulePos, metaGroup?: MetaGroup, options?: CalcOptions): Promise<ChargeGroup[]>
  /** With the fitted module's position, rows carry `compare` and the fitted type itself is left out. */
  variationsOf(typeId: number, fit?: FitDoc, pos?: ModulePos, count?: number): Promise<ItemGroup[]>
  importText(text: string): Promise<ImportResult>
  importAdditions?(text: string, destination: ImportAddition): Promise<ImportAdditionsResult>
  exportText(fit: FitDoc, format: ExportFormat, language?: 'en' | 'zh', options?: Partial<EftExportOptions>): Promise<string>
  shipCatalog?(): Promise<ShipCatalog>
  itemsForExtra?(fit: FitDoc, collection: ExtraCollection, query: string, options?: CalcOptions): Promise<ItemGroup[]>
  implantSets?(): Promise<ImplantSet[]>
  fillEmptySlots?(fit: FitDoc, source: ModulePos): Promise<SlotFill[]>
  missingSkills(fit: FitDoc): Promise<MissingSkill[]>
  /** Current asset version, used to detect retired IDs before calculating an old fit. */
  getDataVersion?(): Promise<string>
  /** An absent type resolves to null. Attributes reflect fit context when supplied. */
  itemInfo?(typeId: number, fit?: FitDoc, pos?: ModulePos, options?: CalcOptions): Promise<ItemDetails | null>
}

export interface ItemDetails {
  typeId: number
  name: LName
  iconId: number | null
  meta?: MetaGroup
  group?: LName
  description?: LName
  omega?: boolean
  attributes: { id: number; name: LName; base: number; current?: number; unit?: string }[]
  skills: MissingSkill[]
  /** Ships only: the bonuses each skill or role grants. */
  traits?: { header: LName; bonuses: LName[] }[]
  /** Requirements with the skills they need in turn. */
  skillTree?: SkillNode[]
}

export interface SkillNode extends MissingSkill {
  requires: SkillNode[]
}
