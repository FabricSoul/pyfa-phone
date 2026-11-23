import './ui.css'
import { useState, type ReactNode } from 'react'
import type { CalcResult, DamageTypes } from '../engine/types'
import { _t } from '../i18n/t'
import { DamageRangeChart } from './DamageRangeChart'
import { Icon } from './icons'
import { Pill } from './Pill'
import { ResourceGauge } from './ResourceGauge'
import { fmt } from './format'

export interface PriceLine { label: string; value: number }
export interface Prices { ship?: number; fit?: number; /** Per-item breakdown, shown under the totals. */ lines?: PriceLine[] }
/** Labels for the setting pills; the page does not own these choices, the fit does. */
export interface StatsSettings {
  /** Name of the target profile, "None" when empty. */
  targetProfile?: string
  damagePattern?: string
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
      {open && <div className="pb">{children}</div>}
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

export function StatsPage({ result, prices, settings }: { result: CalcResult; prices?: Prices; settings?: StatsSettings }) {
  const { stats, resources } = result
  const rep = stats.repair
  const has: Record<PanelId, boolean> = {
    firepower: stats.firepower.dps > 0 || stats.firepower.volley > 0,
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
  const [reload, setReload] = useState(true)
  const [effective, setEffective] = useState(true)
  const [sustained, setSustained] = useState(false)
  const flip = (id: PanelId) => () => setSaved((o) => { const n = { ...o, [id]: !open[id] }; saveOpen(n); return n })
  const cap = stats.capacitor
  const nav = stats.navigation
  const layers = [
    ['shield', _t('Shield'), stats.defense.layers.shield],
    ['armor', _t('Armor'), stats.defense.layers.armor],
    ['hull', _t('Hull'), stats.defense.layers.hull],
  ] as const
  const tank = sustained ? rep.sustained : rep.reinforced

  return (
    <div>
      <Panel title={_t('Firepower')} empty={!has.firepower} open={open.firepower} onToggle={flip('firepower')}>
        <div className="tools">
          <Pill onClick={settings?.onTargetProfile}>{_t('Target Resists')}: {settings?.targetProfile ?? _t('None')} ▾</Pill>
          <Pill on={reload} onClick={() => setReload((v) => !v)}>{_t('Factor in Reload Time')}</Pill>
        </div>
        <div className="hero">
          <div><small>{_t('Total DPS')}</small><b className="num">{fmt(stats.firepower.dps)}</b></div>
          <div><small>{_t('Volley')}</small><b className="num">{fmt(stats.firepower.volley)}</b></div>
          <div><small>{_t('Drone DPS')}</small><b className="num">{fmt(stats.firepower.droneDps)}</b></div>
        </div>
      </Panel>

      <Panel title={_t('Damage over distance')} empty={!has.range} open={open.range} onToggle={flip('range')}>
        <DamageRangeChart curve={result.rangeCurve} />
        <div className="hint">{_t('Distance in km, DPS on the vertical axis; stationary target, tracking ignored. Press and hold the chart for per-km values.')}</div>
      </Panel>

      <Panel title={_t('Defense')} note={`${_t('EHP')} ${fmt(stats.defense.ehp, 0)}`} empty={!has.defense} open={open.defense} onToggle={flip('defense')}>
        <div className="tools">
          <Pill onClick={settings?.onDamagePattern}>{_t('Incoming damage pattern')}: {settings?.damagePattern ?? _t('None')} ▾</Pill>
          <Pill on={effective} onClick={() => setEffective(true)}>{_t('EHP')}</Pill>
          <Pill on={!effective} onClick={() => setEffective(false)}>{_t('HP')}</Pill>
        </div>
        <div className="rg">
          <div className="h"><span />{DMG.map(([k]) => <span key={k}>{dmgLabel(k)}</span>)}<span>{effective ? _t('EHP') : _t('HP')}</span></div>
          {layers.map(([id, label, l]) => (
            <div className="r" key={id}><span>{label}</span>
              {DMG.map(([k, v]) => (
                <span className="rc" key={k}>
                  <i style={{ width: `${l.resists[k] * 100}%`, background: `var(${v})` }} /><span>{fmt(l.resists[k] * 100, 0)}%</span>
                </span>
              ))}
              <b>{fmt(effective ? l.ehp : l.hp, 0)}</b></div>
          ))}
        </div>
      </Panel>

      <Panel title={_t('Recharge rates')} empty={!has.repair} open={open.repair} onToggle={flip('repair')}>
        <div className="tools">
          <Pill on={!sustained} onClick={() => setSustained(false)}>{_t('Reinforced')}</Pill>
          <Pill on={sustained} onClick={() => setSustained(true)}>{_t('Sustained')}</Pill>
        </div>
        <div className="kv">
          <KV k={_t('Shield')} v={<>{fmt(tank.shield)} <small>{_t('HP/s')}</small></>} />
          <KV k={_t('Armor')} v={<>{fmt(tank.armor)} <small>{_t('HP/s')}</small></>} />
          <KV k={_t('Hull')} v={<>{fmt(tank.hull)} <small>{_t('HP/s')}</small></>} />
          <KV k={_t('Passive shield')} v={<>{fmt(tank.passiveShield)} <small>{_t('HP/s')}</small></>} />
        </div>
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
          <KV k={_t('Delta')} v={<>{fmt(cap.delta)} <small>{_t('GJ/s')}</small></>} />
          <div><span>{_t('Status')}</span>
            {/* Stable is a normal state (plain colour); only running dry is a warning. */}
            <b data-testid="cap-status" data-warn={!cap.stable} className={`num${cap.stable ? '' : ' warn'}`}>
              {cap.stable ? `${_t('Stable: ')}${fmt(cap.stablePercent ?? 0)}%` : `${_t('Lasts ')}${fmt(cap.lastsSeconds ?? 0, 0)} ${_t('s')}`}
            </b></div>
        </div>
      </Panel>

      <Panel title={_t('Targeting')} open={open.nav} onToggle={flip('nav')}>
        <div className="kv">
          <KV k={_t('Max velocity')} v={<>{fmt(nav.maxVelocity)} <small>{_t('m/s')}</small></>} />
          <KV k={_t('Align time')} v={<>{fmt(nav.alignTime, 2)} <small>{_t('s')}</small></>} />
          <KV k={_t('Signature radius')} v={<>{fmt(nav.signatureRadius, 0)} <small>{_t('m')}</small></>} />
          <KV k={_t('Warp Speed')} v={<>{fmt(nav.warpSpeed)} <small>{_t('AU/s')}</small></>} />
          <KV k={_t('Max target range')} v={<>{fmt(nav.maxTargetRange / 1000)} <small>{_t('km')}</small></>} />
          <KV k={_t('Max targets')} v={fmt(nav.maxTargets, 0)} />
          <KV k={_t('Scan resolution')} v={<>{fmt(nav.scanResolution, 0)} <small>{_t('mm')}</small></>} />
          <KV k={_t('Sensor strength')} v={fmt(nav.sensorStrength)} />
          <KV k={_t('Drone control range')} v={<>{fmt(nav.droneControlRange / 1000)} <small>{_t('km')}</small></>} />
          <KV k={_t('Mass')} v={<>{fmt(nav.mass, 0)} <small>{_t('kg')}</small></>} />
        </div>
      </Panel>

      <Panel title={_t('Resources')} open={open.resources} onToggle={flip('resources')}>
        <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-1) var(--space-4) var(--space-3)' }}>
          <ResourceGauge tall label={_t('Cargo bay')} {...resources.cargo} />
          <ResourceGauge tall label={_t('Drone bay')} {...resources.droneBay} />
          <ResourceGauge tall label={_t('Drone bandwidth')} {...resources.droneBandwidth} />
          <ResourceGauge tall label={_t('Turret hardpoints')} {...resources.turretHardpoints} />
          <ResourceGauge tall label={_t('Launcher hardpoints')} {...resources.launcherHardpoints} />
        </div>
        {prices && (
          <div className="kv">
            {prices.ship != null && <KV k={_t('Ship')} v={<>{fmt(prices.ship, 0)} <small>{_t('ISK')}</small></>} />}
            {prices.fit != null && <KV k={_t('Fit')} v={<>{fmt(prices.fit, 0)} <small>{_t('ISK')}</small></>} />}
            {prices.lines?.map((l) => <KV key={l.label} k={l.label} v={<>{fmt(l.value, 0)} <small>{_t('ISK')}</small></>} />)}
          </div>
        )}
      </Panel>
    </div>
  )
}
