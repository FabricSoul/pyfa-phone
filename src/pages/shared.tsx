import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { SlotKind, Warning } from '../engine/types'
import { _t } from '../i18n/t'
import { Icon } from '../ui/icons'
import { fmt } from '../ui/format'

export function slotName(slot: SlotKind) {
  switch (slot) {
    case 'high': return _t('High slots')
    case 'mid': return _t('Mid slots')
    case 'low': return _t('Low slots')
    case 'rig': return _t('Rigs')
    case 'subsystem': return _t('Subsystems')
  }
}

export function warningName(kind: Warning['kind']) {
  switch (kind) {
    case 'cpu': return _t('CPU')
    case 'powergrid': return _t('Powergrid')
    case 'calibration': return _t('Calibration')
    case 'turretHardpoints': return _t('Turret hardpoints')
    case 'launcherHardpoints': return _t('Launcher hardpoints')
    case 'cargo': return _t('Cargo')
    case 'droneBay': return _t('Drone bay')
    case 'droneBandwidth': return _t('Drone bandwidth')
    case 'highSlots': return slotName('high')
    case 'midSlots': return slotName('mid')
    case 'lowSlots': return slotName('low')
    case 'rigSlots': return slotName('rig')
    case 'subsystemSlots': return slotName('subsystem')
  }
}

export const warningText = (warning: Warning) => `${warningName(warning.kind)} ${_t('Over')} ${fmt(warning.used - warning.total)}`

/** Back to the previous in-app page; straight to `fallback` when the app was opened on this page (PWA launch, bookmark). */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true, state: { back: true } })
}

export function PageHeading({ back, title, subtitle, image, historyBack }: {
  back: string
  title: string
  subtitle?: ReactNode
  image?: ReactNode
  /** Use browser history when there is some, `back` otherwise. */
  historyBack?: boolean
}) {
  const goBack = useGoBack(back)
  return <header className="fit-heading">
    {historyBack
      ? <button type="button" className="ib" aria-label={_t('Back')} onClick={goBack}><Icon name="chevron-left" size={22} /></button>
      : <Link className="ib" to={back} state={{ back: true }} aria-label={_t('Back')}><Icon name="chevron-left" size={22} /></Link>}
    {image}
    <div>
      <h1>{title}</h1>
      {subtitle && <div className="fit-caption">{subtitle}</div>}
    </div>
  </header>
}

export function FitSection({ title, info, children }: { title: string; info?: ReactNode; children: ReactNode }) {
  return <section>
    <div className="fit-section-title"><h2>{title}</h2>{info && <span className="fit-caption num">{info}</span>}</div>
    {children}
  </section>
}

export function EmptyMessage({ children }: { children: ReactNode }) {
  return <p className="fit-caption fit-inset">{children}</p>
}

/** Dead-end replacement: says what is missing and always offers the way home. */
export function NotFound({ title = _t('Page not found'), message = _t('Check the link or go back to the fittings list.') }: { title?: string; message?: string }) {
  return <main>
    <header className="fit-heading"><div><h1>{title}</h1></div></header>
    <p className="page-message fit-caption">{message}</p>
    <div className="fit-inset"><Link className="fit-button primary" to="/">{_t('Back to fittings')}</Link></div>
  </main>
}
