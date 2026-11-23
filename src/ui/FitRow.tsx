import './ui.css'
import { _t } from '../i18n/t'
import { fmt } from './format'
import { ItemIcon } from './ItemIcon'
import { PriceValue } from './PriceValue'

/** A saved fit on the home page; `overflow` (e.g. "CPU +5.5") turns it red because it does not fit. */
export function FitRow({ name, shipName, shipSrc, dps, ehp, velocity, overflow, showPrice, price, onClick }: {
  name: string; shipName?: string; shipSrc?: string; dps?: number; ehp?: number; velocity?: number; overflow?: string; showPrice?: boolean; price?: number | null; onClick?: () => void
}) {
  const over = !!overflow
  return (
    <button type="button" className="fit" data-testid="fit-row" data-over={over} onClick={onClick}>
      <ItemIcon className="ship" size={36} src={shipSrc} />
      <div className="mn">
        <span>{name}</span>
        <small className={over ? 'warn' : undefined}>{over ? `${_t('Does not fit')} · ${overflow}` : shipName}</small>
      </div>
      {(dps != null || ehp != null || velocity != null || showPrice) && <div className="stats">
        {dps != null && <span>{fmt(dps)} <small style={{ display: 'inline' }}>{_t('DPS')}</small></span>}
        {ehp != null && <small>{_t('EHP')} {fmt(ehp, 0)}</small>}
        {showPrice && <small><PriceValue value={price} /></small>}
        {velocity != null && <small>{fmt(velocity, 0)} {_t('m/s')}</small>}
      </div>}
    </button>
  )
}
