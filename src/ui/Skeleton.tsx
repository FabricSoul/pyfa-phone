import './ui.css'

/** One shimmering placeholder block. Decorative: pages announce loading once, not per block. */
export function Skeleton({ width = '100%', height = 14, radius = 4, className = '' }: {
  width?: number | string; height?: number | string; radius?: number | string; className?: string
}) {
  return <i className={`sk ${className}`.trim()} aria-hidden="true" style={{ width, height, borderRadius: radius }} />
}

/** A list row: icon, two text lines, trailing block (load.html ②). */
export function SkeletonRow({ lead = 70 }: { lead?: number }) {
  return <div className="skrow" aria-hidden="true">
    <Skeleton width={32} height={32} radius={6} />
    <div className="skrow-text"><Skeleton width={`${lead}%`} height={14} /><Skeleton width="40%" height={10} /></div>
    <Skeleton width={32} height={32} radius={8} />
  </div>
}

/** A busy list region with one polite announcement. */
export function SkeletonList({ rows = 3, label }: { rows?: number; label?: string }) {
  const announce = label ? { role: 'status', 'aria-busy': true, 'aria-label': label } : { 'aria-hidden': true }
  return <div className="list" {...announce}>
    {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} lead={i % 2 ? 55 : 70} />)}
  </div>
}

/** Resource bars at the top of the fit page: label line over a bar. */
export function SkeletonGauges() {
  return <div className="sktiles" aria-hidden="true">
    {[0, 1, 2].map((i) => <div className="sktile" key={i}><Skeleton width="50%" height={10} /><Skeleton height={6} radius={2} /></div>)}
  </div>
}

/** Stat blocks: a small label over a big number. */
export function SkeletonStats() {
  return <div className="sktiles" aria-hidden="true">
    {[0, 1, 2].map((i) => <div className="sktile" key={i}><Skeleton width="45%" height={10} /><Skeleton width="70%" height={22} /></div>)}
  </div>
}
