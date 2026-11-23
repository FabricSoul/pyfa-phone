import './ui.css'
import { _t, useUiLanguage } from '../i18n/t'
import { fmt } from './format'
import { RollingNumber } from './motion'

const CELLS = 20

/** 20-cell resource bar. Over the limit → whole bar and the numbers use the warning colour.
 *  Exactly full is not an error; ≥ 95% only makes the numbers bold. */
export function ResourceGauge({ label, used, total, tall }: { label: string; used: number; total: number; tall?: boolean }) {
  useUiLanguage()
  if (total <= 0 && used <= 0) {
    return (
      <div className={`gauge${tall ? ' tall' : ''}`} data-testid="gauge" data-over="false">
        <div className="gl"><span>{label}</span><span className="num">{_t('None')}</span></div>
      </div>
    )
  }
  const over = used > total
  const ratio = total > 0 ? used / total : 1
  const filled = over ? CELLS : Math.min(CELLS, Math.max(used > 0 ? 1 : 0, Math.round(ratio * CELLS)))
  return (
    <div className={`gauge${tall ? ' tall' : ''}`} data-testid="gauge" data-over={over}>
      <div className="gl">
        <span>{label}{over && <b className="warn">{_t('Over')} {fmt(used - total)}</b>}</span>
        <RollingNumber className={`num${over ? ' warn' : ratio >= 0.95 ? ' strong' : ''}`} value={used} format={(n) => `${fmt(n)}/${fmt(total)}`} />
      </div>
      <div className="cells" aria-hidden="true">
        {Array.from({ length: CELLS }, (_, i) => <i key={i} className={i < filled ? (over ? 'over' : 'on') : ''} />)}
      </div>
    </div>
  )
}

/** CPU / powergrid / calibration side by side at the top of the fit page. */
export function ResourceBar({ cpu, powergrid, calibration }: {
  cpu: { used: number; total: number }; powergrid: { used: number; total: number }; calibration: { used: number; total: number }
}) {
  useUiLanguage()
  return (
    <div className="res">
      <ResourceGauge label={_t('CPU')} {...cpu} />
      <ResourceGauge label={_t('PowerGrid')} {...powergrid} />
      <ResourceGauge label={_t('Calibration')} {...calibration} />
    </div>
  )
}
