import './ui.css'
import { _t } from '../i18n/t'
import { Icon } from './icons'
import { ItemIcon } from './ItemIcon'

export function NavBar({ title, subtitle, shipSrc, onBack, onUndo, canUndo = true, onMore }: {
  title: string; subtitle?: string; shipSrc?: string; onBack?: () => void; onUndo?: () => void; canUndo?: boolean; onMore?: () => void
}) {
  return (
    <div className="nav">
      <button type="button" className="ib" aria-label={_t('Back')} onClick={onBack}><Icon name="chevron-left" size={22} /></button>
      <ItemIcon className="ship" size={36} src={shipSrc} />
      <div className="tt"><b>{title}</b>{subtitle && <small>{subtitle}</small>}</div>
      <button type="button" className="ib" aria-label={_t('Undo')} disabled={!canUndo} onClick={onUndo}><Icon name="undo" size={20} /></button>
      <button type="button" className="ib" aria-label={_t('More')} onClick={onMore}><Icon name="more" size={20} /></button>
    </div>
  )
}
