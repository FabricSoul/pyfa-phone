import './ui.css'
import { useState, type ReactNode } from 'react'
import type { CalcResult, DamageTypes } from '../engine/types'
import { _t } from '../i18n/t'
import { DamageRangeChart } from './DamageRangeChart'
import { Icon } from './icons'
import { Pill } from './Pill'
import { PriceValue } from './PriceValue'
import { ResourceGauge } from './ResourceGauge'
import { fmt, fmtAlignTime, fmtDuration } from './format'
import { Expand, RollingNumber } from './motion'

export interface PriceLine { label: string; value: number | null }
export interface Prices { ship?: number | null; fit?: number | null; pending?: boolean; /** Per-item breakdown, shown under the totals. */ lines?: PriceLine[] }
/** Labels for the setting pills; the page does not own these choices, the fit does. */
export interface StatsSettings {
  /** Name of the target profile, "None" when empty. */
  targetProfile?: string
  damagePattern?: string
  damageRatios?: DamageTypes
  includeReload?: boolean
  onReloadChange?: (includeReload: boolean) => void
  onTargetProfile?: () => void
  onDamagePattern?: () => void
}

const STORAGE_KEY = 'pyfa-phone:stats-panels'
function loadOpen(): Partial<Record<string, boolean>> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<string, boolean>> } catch { return {} }
}
function saveOpen(v: Partial<Record<string, boolean>>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* storage unavailable: state stays in memory */ }
}

type PanelId = 'firepower' | 'range' | 'defense' | 'repair' | 'remote' | 'capacitor' | 'nav' | 'resources'

function Panel({ title, note, empty, open, onToggle, children }: {
  title: string; note?: string; empty?: boolean; open: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <section>
      <button type="button" className="ph" aria-expanded={open} onClick={onToggle}>
        <span className="cv"><Icon name="chevron-down" size={14} /></span>{title}{(empty || note) && <em className="num">{empty ? _t('None') : note}</em>}
      </button>
      <Expand open={open}><div className="pb">{children}</div></Expand>
    </section>
  )
}

const KV = ({ k, v, warn }: { k: string; v: ReactNode; warn?: boolean }) => (
  <div><span>{k}</span><b className={`num${warn ? ' warn' : ''}`}>{v}</b></div>
)

const DMG: [keyof DamageTypes, string][] = [
  ['em', '--dmg-em'], ['thermal', '--dmg-th'], ['kinetic', '--dmg-ki'], ['explosive', '--dmg-ex'],
]
const dmgLabel = (k: keyof DamageTypes) =>
  k === 'em' ? _t('EM') : k === 'thermal' ? _t('Thermal') : k === 'kinetic' ? _t('Kinetic') : _t('Explosive')

const sensors = () => ({
  radar: _t('Radar'), ladar: _t('Ladar'), magnetometric: _t('Magnetometric'),
  gravimetric: _t('Gravimetric'), multispectral: _t('Multispectral'),
})

const lockTargets = () => ({
  pod: _t('Pod'), interceptor: _t('Interceptor'), frigate: _t('Frigate'), destroyer: _t('Destroyer'),
  cruiser: _t('Cruiser'), battlecruiser: _t('Battlecruiser'), battleship: _t('Battleship'), carrier: _t('Carrier'),
})

const bayNames = (): Record<string, string> => ({
  fleetHangarCapacity: _t('Fleet hangar'), shipMaintenanceBayCapacity: _t('Ship maintenance bay'),
  specialColonyResourcesHoldCapacity: _t('Infrastructure hold'), specialAmmoHoldCapacity: _t('Ammo hold'),
  specialFuelBayCapacity: _t('Fuel bay'), specialShipHoldCapacity: _t('Ship hold'),
  specialSmallShipHoldCapacity: _t('Small ship hold'), specialMediumShipHoldCapacity: _t('Medium ship hold'),
  specialLargeShipHoldCapacity: _t('Large ship hold'), specialIndustrialShipHoldCapacity: _t('Industrial ship hold'),
  generalMiningHoldCapacity: _t('Mining hold'), specialIceHoldCapacity: _t('Ice hold'),
  specialGasHoldCapacity: _t('Gas hold'), specialMineralHoldCapacity: _t('Mineral hold'),
  specialMaterialBayCapacity: _t('Material bay'), specialSalvageHoldCapacity: _t('Salvage hold'),
  specialCommandCenterHoldCapacity: _t('Command center hold'), specialPlanetaryCommoditiesHoldCapacity: _t('Planetary goods hold'),
  specialQuafeHoldCapacity: _t('Quafe hold'), specialMobileDepotHoldCapacity: _t('Mobile depot hold'),
  specialExpeditionHoldCapacity: _t('Expedition hold'),
})

export function StatsPage({ result, prices, settings }: { result: CalcResult; prices?: Prices; settings?: StatsSettings }) {
  const { stats, resources } = result
  const rep = stats.repair
  const mining = stats.mining
  const hasWeapons = stats.firepower.dps > 0 || stats.firepower.volley > 0
  const [miningChoice, setMiningChoice] = useState<boolean>()
  const showMining = mining.total > 0 && (miningChoice ?? !hasWeapons)
  const has: Record<PanelId, boolean> = {
    firepower: hasWeapons || mining.total > 0,
    range: result.rangeCurve.series.length > 0,
    defense: stats.defense.hp > 0,
    repair: [rep.reinforced, rep.sustained].some((t) => t.shield + t.armor + t.hull + t.passiveShield > 0),
    remote: Object.values(stats.remoteRepair).some((v) => v > 0),
    capacitor: stats.capacitor.capacity > 0,
    nav: true,
    resources: true,
  }
  // Panels without data start collapsed; what the user toggled is remembered in localStorage.
  const [saved, setSaved] = useState(loadOpen)
  const open = Object.fromEntries((Object.keys(has) as PanelId[]).map((id) => [id, saved[id] ?? has[id]])) as Record<PanelId, boolean>
  const reload = settings?.includeReload ?? stats.firepower.includesReload
  const [effective, setEffective] = useState(true)
  const flip = (id: PanelId) => () => setSaved((o) => { const n = { ...o, [id]: !open[id] }; saveOpen(n); return n })
  const cap = stats.capacitor
  const nav = stats.navigation
  const layers = [
    ['shield', _t('Shield'), stats.defense.layers.shield],
    ['armor', _t('Armor'), stats.defense.layers.armor],
    ['hull', _t('Hull'), stats.defense.layers.hull],
  ] as const
  const repair = effective ? rep : rep.raw
  const repairUnit = repair.unit === 'EHP/s' ? _t('EHP/s') : _t('HP/s')

  const repairLayers = [
    ['passiveShield', _t('Passive shield')], ['shield', _t('Shield')],
    ['armor', _t('Armor')], ['hull', _t('Hull')],
  ] as const
  const target = settings?.targetProfile
  const targetLabels = lockTargets()
  const bays = bayNames()
  const damage = settings?.damageRatios
  const damageTotal = damage ? DMG.reduce((sum, [type]) => sum + damage[type], 0) : 0
  const effectiveDps = stats.firepower.effective ?? Boolean(target)
  const firepower = [
    { label: effectiveDps ? _t('Effective DPS') : _t('Total DPS'), value: stats.firepower.dps },
    { label: _t('Volley'), value: stats.firepower.volley },
    { label: _t('Weapon DPS'), value: stats.firepower.weaponDps },
    { label: _t('Drone DPS'), value: stats.firepower.droneDps },
  ]
  const miningRates = [
    { label: _t('Total mining yield'), value: mining.total },
    { label: _t('Mining modules'), value: mining.miner },
    { label: _t('Mining drones'), value: mining.drone },
  ]

  return (
    <div>
      <Panel title={_t('Firepower')} empty={!has.firepower} open={open.firepower} onToggle={flip('firepower')}>
        <div className="tools">
          {mining.total > 0 && <Pill on={showMining} onClick={() => setMiningChoice(!showMining)}>{_t('Mining yield')}</Pill>}
          {!showMining && <>
            <Pill onClick={settings?.onTargetProfile}>{_t('Target Resists')}: {target ?? _t('None')} ▾</Pill>
            <Pill on={reload} onClick={settings?.onReloadChange && (() => settings.onReloadChange?.(!reload))}>{_t('Factor in Reload Time')}</Pill>
          </>}
        </div>
        <div className={`hero stats-output${showMining ? ' stats-mining' : ''}`}>
          {(showMining ? miningRates : firepower).map(({ label, value }) => <div key={label}>
            <small>{label}</small>
            <b className="num"><RollingNumber value={value} format={fmt} /></b>
            {showMining && <> <span className="stats-unit">{mining.unit}</span></>}
          </div>)}
        </div>
      </Panel>

      <Panel title={_t('Damage over distance')} empty={!has.range} open={open.range} onToggle={flip('range')}>
        <DamageRangeChart curve={result.rangeCurve} />
        <div className="hint">{_t('Distance in km, DPS on the vertical axis; stationary target, tracking ignored. Press and hold the chart for per-km values.')}</div>
      </Panel>

      <Panel title={_t('Defense')} note={effective ? `${_t('EHP')} ${fmt(stats.defense.ehp, 0)}` : `${_t('HP')} ${fmt(stats.defense.hp, 0)}`} empty={!has.defense} open={open.defense} onToggle={flip('defense')}>
        <div className="tools">
          <Pill onClick={settings?.onDamagePattern}>{_t('Incoming damage pattern')}: {settings?.damagePattern ?? _t('None')} ▾</Pill>
          <Pill on={effective} onClick={() => setEffective(true)}>{_t('EHP')}</Pill>
          <Pill on={!effective} onClick={() => setEffective(false)}>{_t('HP')}</Pill>
        </div>
        {damage && damageTotal > 0 && <div className="stats-damage num">
          {DMG.map(([type, color]) => {
            const share = damage[type] / damageTotal * 100
            return <span key={type}>
              <i style={{ background: `var(${color})` }} />{dmgLabel(type)} {fmt(share)}%
            </span>
          })}
        </div>}
        <div className="rg">
          <div className="h"><span />{DMG.map(([k]) => <span key={k}>{dmgLabel(k)}</span>)}<span>{effective ? _t('EHP') : _t('HP')}</span></div>
          {layers.map(([id, label, l]) => (
            <div className="r" key={id}><span>{label}</span>
              {DMG.map(([k, v]) => (
                <span className="rc num" key={k}>
                  <i style={{ width: `${l.resists[k] * 100}%`, background: `var(${v})` }} /><span>{fmt(l.resists[k] * 100, 0)}%</span>
                </span>
              ))}
              <b className="num"><RollingNumber value={effective ? l.ehp : l.hp} format={(n) => fmt(n, 0)} /></b></div>
          ))}
        </div>
      </Panel>

      <Panel title={_t('Recharge rates')} empty={!has.repair} open={open.repair} onToggle={flip('repair')}>
        <table className="stats-repairs">
          <thead><tr><td>{repairUnit}</td><th scope="col">{_t('Reinforced')}</th><th scope="col">{_t('Sustained')}</th></tr></thead>
          <tbody>{repairLayers.map(([key, label]) => <tr key={key}>
            <th scope="row">{label}</th>
            <td className="num">{fmt(repair.reinforced[key])}</td>
            <td className="num">{fmt(repair.sustained[key])}</td>
          </tr>)}</tbody>
        </table>
      </Panel>

      <Panel title={_t('Remote Repairs')} empty={!has.remote} open={open.remote} onToggle={flip('remote')}>
        <div className="kv">
          <KV k={_t('Shield')} v={fmt(stats.remoteRepair.shield)} />
          <KV k={_t('Armor')} v={fmt(stats.remoteRepair.armor)} />
          <KV k={_t('Hull')} v={fmt(stats.remoteRepair.hull)} />
          <KV k={_t('Capacitor')} v={fmt(stats.remoteRepair.capacitor)} />
        </div>
      </Panel>

      <Panel title={_t('Capacitor')} empty={!has.capacitor} open={open.capacitor} onToggle={flip('capacitor')}>
        <div className="kv">
          <KV k={_t('Capacity')} v={<>{fmt(cap.capacity)} <small>{_t('GJ')}</small></>} />
          <KV k={_t('Recharge time')} v={<>{fmt(cap.rechargeTime)} <small>{_t('s')}</small></>} />
          <KV k={_t('Recharge')} v={<>{fmt(cap.recharge)} <small>{_t('GJ/s')}</small></>} />
          <KV k={_t('Usage')} v={<>{fmt(cap.usage)} <small>{_t('GJ/s')}</small></>} />
          <KV k={_t('Neutralizer resistance')} v={`${fmt(cap.neutralizerResistance * 100)}%`} />
          <KV k={_t('Delta')} v={<>{fmt(cap.delta)} <small>{_t('GJ/s')}</small></>} />
          <div><span>{_t('Status')}</span>
            {/* Stable is a normal state (plain colour); only running dry is a warning. */}
            <b data-testid="cap-status" data-warn={!cap.stable} className={`num${cap.stable ? '' : ' warn'}`}>
              {cap.stable ? `${_t('Stable: ')}${fmt(cap.stablePercent ?? 0)}%` : `${_t('Lasts ')}${fmtDuration(cap.lastsSeconds ?? 0)}`}
            </b></div>
        </div>
      </Panel>

      <Panel title={_t('Targeting and navigation')} open={open.nav} onToggle={flip('nav')}>
        <div className="kv">
          <KV k={_t('Max velocity')} v={<>{fmt(nav.maxVelocity)} <small>{_t('m/s')}</small></>} />
          <KV k={_t('Align time')} v={<>{fmtAlignTime(nav.alignTime)} <small>{_t('s')}</small></>} />
          <KV k={_t('Signature radius')} v={<>{fmt(nav.signatureRadius, 0)} <small>{_t('m')}</small></>} />
          <KV k={_t('Warp Speed')} v={<>{fmt(nav.warpSpeed)} <small>{_t('AU/s')}</small></>} />
          <KV k={_t('Max target range')} v={<>{fmt(nav.maxTargetRange / 1000)} <small>{_t('km')}</small></>} />
          <KV k={_t('Max targets')} v={fmt(nav.maxTargets, 0)} />
          <KV k={_t('Scan resolution')} v={<>{fmt(nav.scanResolution, 0)} <small>{_t('mm')}</small></>} />
          <KV k={_t('Sensor strength')} v={fmt(nav.sensorStrength)} />
          {nav.sensorType && <KV k={_t('Sensor type')} v={sensors()[nav.sensorType]} />}
          {nav.jamChance !== undefined && <KV k={_t('Jam chance')} v={`${fmt(nav.jamChance)}%`} />}
          {nav.agility !== undefined && <KV k={_t('Agility')} v={fmt(nav.agility)} />}
          {nav.maxWarpDistance !== undefined && <KV k={_t('Max warp distance')} v={<>{fmt(nav.maxWarpDistance)} <small>{_t('AU')}</small></>} />}
          {nav.warpCoreStrength !== undefined && <KV k={_t('Warp core strength')} v={fmt(nav.warpCoreStrength)} />}
          <KV k={_t('Drone control range')} v={<>{fmt(nav.droneControlRange / 1000)} <small>{_t('km')}</small></>} />
          <KV k={_t('Mass')} v={<>{fmt(nav.mass, 0)} <small>{_t('kg')}</small></>} />
        </div>
        {Boolean(nav.lockTimes?.length) && <details className="stats-lock">
          <summary>{_t('Lock Times')}</summary>
          <div className="kv">
            {nav.lockTimes?.map(({ target, seconds }) => <KV key={target} k={targetLabels[target]} v={<>{fmt(seconds)} <small>{_t('s')}</small></>} />)}
          </div>
        </details>}
      </Panel>

      <Panel title={_t('Resources and prices')} open={open.resources} onToggle={flip('resources')}>
        <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-1) var(--space-4) var(--space-3)' }}>
          <ResourceGauge tall label={_t('Cargo bay')} {...resources.cargo} />
          <ResourceGauge tall label={_t('Drone bay')} {...resources.droneBay} />
          {Object.entries(resources.specializedBays).map(([id, capacity]) => bays[id] && <div className="stats-bay" key={id}>
            <KV k={bays[id]} v={<>{fmt(capacity)} <small>{_t('m³')}</small></>} />
          </div>)}
          <ResourceGauge tall label={_t('Active drones')} {...resources.activeDrones} />
          {(resources.fighterBay.total > 0 || resources.fighterBay.used > 0) && <ResourceGauge tall label={_t('Fighter bay')} {...resources.fighterBay} />}
          {(resources.fighterTubes.total > 0 || resources.fighterTubes.used > 0) && <ResourceGauge tall label={_t('Fighter tubes')} {...resources.fighterTubes} />}
          <ResourceGauge tall label={_t('Drone bandwidth')} {...resources.droneBandwidth} />
          <ResourceGauge tall label={_t('Calibration')} {...resources.calibration} />
          <ResourceGauge tall label={_t('Turret hardpoints')} {...resources.turretHardpoints} />
          <ResourceGauge tall label={_t('Launcher hardpoints')} {...resources.launcherHardpoints} />
        </div>
        {prices?.pending ? <p className="hint" role="status"><PriceValue value={undefined} /></p> : prices && (
          <div className="kv">
            {prices.ship !== undefined && <KV k={_t('Ship')} v={<PriceValue value={prices.ship} />} />}
            {prices.fit !== undefined && <KV k={_t('Fit')} v={<PriceValue value={prices.fit} />} />}
            {prices.lines?.map(({ label, value }) => <KV key={label} k={label} v={<PriceValue value={value} />} />)}
          </div>
        )}
      </Panel>
    </div>
  )
}
