import './ui.css'
import { useRef, useState } from 'react'
import type { RangeCurve } from '../engine/types'
import { _t } from '../i18n/t'
import { fmt, lname, useNameLanguage } from './format'

const W = 340, H = 160, PAD = { l: 28, r: 8, t: 8, b: 20 }
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)']

/** DPS against distance, up to 3 lines (current charge first). Press and hold for a crosshair. */
export function DamageRangeChart({ curve }: { curve: RangeCurve }) {
  const lang = useNameLanguage()
  const ref = useRef<SVGSVGElement>(null)
  const [at, setAt] = useState<number | null>(null)
  const series = curve.series.slice(0, 3)
  const xs = curve.distancesKm
  const n = xs.length
  if (n < 2 || series.length === 0) return null
  const maxY = Math.max(1, ...series.flatMap((s) => s.dps))
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b)

  const locate = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const px = ((e.clientX - r.left) / r.width) * W
    setAt(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))))
  }

  return (
    <div className="chart" data-testid="range-chart">
      <div className="lg">
        {series.map((s, i) => (
          <span key={i}><i style={{ background: COLORS[i] }} />{lname(s.name, lang)}{i === 0 && ` (${_t('Current')})`}</span>
        ))}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={_t('Damage over distance')}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); locate(e) }}
        onPointerMove={(e) => { if (at !== null) locate(e) }}
        onPointerUp={() => setAt(null)} onPointerCancel={() => setAt(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}><line className="axis" x1={PAD.l} x2={W - PAD.r} y1={y(maxY * f)} y2={y(maxY * f)} />
            <text className="tick" x={PAD.l - 4} y={y(maxY * f) + 3} textAnchor="end">{fmt(maxY * f, 0)}</text></g>
        ))}
        {xs.filter((_, i) => i % 5 === 0).map((d) => (
          <text key={d} className="tick" x={x(xs.indexOf(d))} y={H - 6} textAnchor="middle">{fmt(d)}</text>
        ))}
        {series.map((s, i) => (
          <polyline key={i} fill="none" stroke={COLORS[i]} strokeWidth={i === 0 ? 2.5 : 2} strokeLinejoin="round"
            points={s.dps.map((v, j) => `${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
        {at !== null && <line data-testid="crosshair" className="axis" x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} strokeDasharray="3 3" />}
      </svg>
      {at !== null && (
        <div className="tip num" data-testid="chart-tip">
          {fmt(xs[at] ?? 0)} {_t('km')}
          {series.map((s, i) => <div key={i} style={{ color: COLORS[i] }}>{fmt(s.dps[at] ?? 0)}</div>)}
        </div>
      )}
    </div>
  )
}
