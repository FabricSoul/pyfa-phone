import './ui.css'
import { Link } from 'react-router-dom'
import { _t } from '../i18n/t'
import { Icon } from './icons'
import { Skeleton, SkeletonGauges, SkeletonList } from './Skeleton'

/** Resource bars and two slot lists in outline; the body of the fit page while it has no numbers. */
export function FitBodySkeleton({ label }: { label: string }) {
  return <>
    <div role="status" aria-busy="true" aria-label={label}><SkeletonGauges /></div>
    <div className="sh-skel"><Skeleton width={64} height={12} /></div>
    <SkeletonList rows={3} />
    <div className="sh-skel"><Skeleton width={64} height={12} /></div>
    <SkeletonList rows={3} />
  </>
}

/** The fit page before the engine (or the stored fit) is ready: title, resource bars and two slot lists in outline (load.html ②). */
export function FitPageSkeleton({ label = _t('Loading fit…') }: { label?: string }) {
  return <main>
    <div className="nav">
      <Link className="ib" to="/" aria-label={_t('Back')}><Icon name="chevron-left" size={22} /></Link>
      <div className="tt skt" aria-hidden="true"><Skeleton width="60%" height={16} /><Skeleton width="30%" height={10} /></div>
    </div>
    <FitBodySkeleton label={label} />
  </main>
}
