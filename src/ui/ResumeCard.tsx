import './ui.css'
import { Link } from 'react-router-dom'
import type { CalcResult } from '../engine/types'
import { _t } from '../i18n/t'
import { capacitorText, fmt, guiIcon, lname, renderUrl, useNameLanguage } from './format'
import { ItemIcon } from './ItemIcon'
import { Skeleton } from './Skeleton'

/** "Today 16:20" for the same day, otherwise the date. */
export function openedText(openedAt: number, now = Date.now()): string {
  const opened = new Date(openedAt)
  if (opened.toDateString() === new Date(now).toDateString())
    return `${_t('Today')} ${opened.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return opened.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** The last opened fit, as a dark card: render, name, hull type, four key numbers, shield / armor / structure bar (r2 home-a). */
export function ResumeCard({ id, name, openedAt, result }: { id: string; name: string; openedAt: number; result?: CalcResult }) {
  const lang = useNameLanguage()
  const layers = result?.stats.defense.layers
  const turrets = result?.resources.turretHardpoints.used ?? 0
  const keys = result && [
    { icon: 'turret_big', label: _t('DPS'), value: fmt(result.stats.firepower.dps) },
    { icon: 'shieldActive_big', label: _t('EHP'), value: fmt(result.stats.defense.ehp, 0) },
    { icon: 'maxVelocity_big', label: _t('m/s'), value: fmt(result.stats.navigation.maxVelocity, 0) },
    { icon: 'capacitorInfo_big', label: _t('Cap'), value: capacitorText(result.stats.capacitor) },
  ]
  return <Link className="resume hangar" data-appearance="dark" data-testid="resume-card" to={`/fit/${id}`}>
    <ItemIcon className="rimg" size={84} src={renderUrl(result?.ship.graphicId ?? null)} />
    <div className="lbl">{_t('Continue')} · {openedText(openedAt)}</div>
    <h2>{name}</h2>
    <p>{result
      ? [result.ship.group && lname(result.ship.group, lang), turrets > 0 && _t('{n} turrets').replace('{n}', String(turrets))].filter(Boolean).join(' · ')
      : <Skeleton width={120} height={12} />}</p>
    <div className="k">
      {keys
        ? keys.map((key) => <div key={key.icon}><b>{key.value}</b><small><img src={guiIcon(key.icon)} alt="" />{key.label}</small></div>)
        : [0, 1, 2, 3].map((i) => <div key={i} aria-hidden="true"><Skeleton width={44} height={17} /><Skeleton width={36} height={11} /></div>)}
    </div>
    {layers && <div className="tank" data-testid="tank" aria-hidden="true">
      <i style={{ flexGrow: layers.shield.hp }} /><i style={{ flexGrow: layers.armor.hp }} /><i style={{ flexGrow: layers.hull.hp }} />
    </div>}
  </Link>
}
