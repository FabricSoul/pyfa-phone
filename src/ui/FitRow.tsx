import './ui.css'
import { _t } from '../i18n/t'
import { fmt } from './format'
import { ItemIcon } from './ItemIcon'

/** A saved fit on the home page; `overflow` (e.g. "CPU +5.5") turns it red because it does not fit. */
export function FitRow({ name, shipName, shipSrc, dps, ehp, overflow, onClick }: {
  name: string; shipName: string; shipSrc?: string; dps: number; ehp: number; overflow?: string; onClick?: () => void
}) {
  const over = !!overflow
  return (
    <button type="button" className="fit" data-testid="fit-row" data-over={over} onClick={onClick}>
      <ItemIcon className="ship" size={36} src={shipSrc} />
      <div className="mn">
        <span>{name}</span>
        <small className={over ? 'warn' : undefined}>{over ? `${_t('Does not fit')} · ${overflow}` : shipName}</small>
      </div>
      <div className="stats"><span>{fmt(dps)} <small style={{ display: 'inline' }}>{_t('DPS')}</small></span><small>{_t('EHP')} {fmt(ehp, 0)}</small></div>
    </button>
  )
}
