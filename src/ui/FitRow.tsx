import './ui.css'
import type { ReactNode } from 'react'
import { _t } from '../i18n/t'
import { fmt, guiIcon, usedPercent } from './format'
import { Icon } from './icons'
import { ItemIcon } from './ItemIcon'
import { PriceValue } from './PriceValue'
import { Skeleton } from './Skeleton'

type UsedTotal = { used: number; total: number }

/** A saved fit on the home page (r2 home-a): 48px render, key numbers with pyfa icons, CPU / grid margin bars.
 *  `overflow` (e.g. "CPU Over 5.5") turns it red because it does not fit; `pending` holds the numbers' places with skeletons. */
export function FitRow({ name, shipName, shipSrc, dps, ehp, velocity, cpu, grid, overflow, pending, showPrice, price, onClick }: {
  name: string; shipName?: string; shipSrc?: string; dps?: number; ehp?: number; velocity?: number
  cpu?: UsedTotal; grid?: UsedTotal; overflow?: string; pending?: boolean; showPrice?: boolean; price?: number | null; onClick?: () => void
}) {
  const over = !!overflow
  const stat = (icon: string, label: string, value: ReactNode) =>
    <span className="stat"><img src={guiIcon(icon)} alt="" /><span className="sr-only">{label} </span>{value}</span>
  return (
    <button type="button" className="fit" data-testid="fit-row" data-over={over} onClick={onClick}>
      <span className="rd"><ItemIcon className="rimg" size={56} src={shipSrc} /></span>
      <div className="mn">
        <span>{name}{shipName && !name.includes(shipName) && <small className="ship-name"> · {shipName}</small>}</span>
        {pending
          ? <div className="stats" aria-hidden="true"><Skeleton width={44} height={12} /><Skeleton width={44} height={12} /><Skeleton width={44} height={12} /></div>
          : (dps != null || ehp != null || velocity != null || showPrice) && <div className="stats">
            {dps != null && stat('turret_big', _t('DPS'), fmt(dps))}
            {ehp != null && stat('shieldActive_big', _t('EHP'), fmt(ehp, 0))}
            {velocity != null && stat('maxVelocity_big', _t('m/s'), fmt(velocity, 0))}
            {showPrice && <small><PriceValue value={price} /></small>}
          </div>}
        {over && <small className="warn">{_t('Does not fit')} · {overflow}</small>}
        {pending
          ? <div className="bars" aria-hidden="true"><Skeleton height={3} radius={2} /><Skeleton height={3} radius={2} /></div>
          : cpu && grid && <div className="bars">
            <Bar testId="cpu-bar" label={_t('CPU')} {...cpu} />
            <Bar testId="grid-bar" label={_t('Powergrid')} {...grid} />
          </div>}
      </div>
      <span className="chev" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
    </button>
  )
}

function Bar({ testId, label, used, total }: UsedTotal & { testId: string; label: string }) {
  const over = used > total
  return <div className={`mb${over ? ' over' : ''}`} data-testid={testId} data-over={over} role="img"
    aria-label={`${label} ${fmt(used)}/${fmt(total)}`}><i style={{ width: usedPercent({ used, total }) }} /></div>
}
