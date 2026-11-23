import './ui.css'
import { AnimatePresence, motion, useMotionValueEvent, useSpring } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { EngineStage } from '../engine/client'
import type { EngineProgress, StageProgress } from '../engine/progress'
import { _t } from '../i18n/t'
import { fmt } from './format'
import { Icon } from './icons'
import { motionSpec } from './motion'

const MB = 1024 * 1024
/** "17 MB", "17.7 MB". */
export const formatMb = (bytes: number) => `${fmt(bytes / MB)} MB`
const percent = ({ loaded, total }: StageProgress) => total > 0 ? Math.round(loaded / total * 100) : 0
const STAGES: EngineStage[] = ['runtime', 'data', 'initialize']

const COLS = 30
const RINGS = 3
/** Annular sector from angle a0 to a1 (degrees, 0 = up, clockwise) between radii r0 and r1, centred on (100, 100). */
function sector(a0: number, a1: number, r0: number, r1: number) {
  const p = (a: number, r: number) => {
    const t = (a - 90) * Math.PI / 180
    return `${(100 + r * Math.cos(t)).toFixed(2)} ${(100 + r * Math.sin(t)).toFixed(2)}`
  }
  return `M${p(a0, r1)}A${r1} ${r1} 0 0 1 ${p(a1, r1)}L${p(a1, r0)}A${r0} ${r0} 0 0 0 ${p(a0, r0)}Z`
}
const CELLS = Array.from({ length: COLS * RINGS }, (_, i) => {
  const col = Math.floor(i / RINGS)
  const ring = i % RINGS
  const step = 360 / COLS
  return { col, ring, d: sector(col * step + 1.6, (col + 1) * step - 1.6, 64 + ring * 11, 72 + ring * 11) }
})

/** EVE's capacitor: columns of short cells around a circle, lit column by column as the real download bytes arrive.
 *  The progress glides (a spring) so it never jumps; each cell glows briefly as it lights. */
function Capacitor({ fraction, complete, failed, children }: { fraction: number; complete?: boolean; failed?: boolean; children: ReactNode }) {
  const target = complete ? 1 : fraction
  const smooth = useSpring(0, { stiffness: 140, damping: 26, restDelta: 0.0005 })
  const [shown, setShown] = useState(0)
  useEffect(() => { smooth.set(target) }, [smooth, target])
  useMotionValueEvent(smooth, 'change', setShown)
  const value = Math.min(1, Math.max(0, complete ? 1 : shown))
  const lit = Math.floor(value * COLS + 1e-6)
  return <div className="cap" data-complete={complete || undefined} data-failed={failed || undefined}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      {CELLS.map((cell, i) => <path key={i} className="cap-cell" d={cell.d} data-on={cell.col < lit}
        style={{ animationDelay: `${cell.ring * 50}ms` }} />)}
    </svg>
    <div className="cap-core">
      <b className="num" data-testid="boot-percent">{Math.round(value * 100)}%</b>
      {children}
    </div>
  </div>
}

/** "28.0 / 34.7 MB". */
const bytesText = (loaded: number, total: number) => `${(loaded / MB).toFixed(1)} / ${(total / MB).toFixed(1)} MB`

/** Start page: the whole app waits here until the engine is ready. A capacitor ring fills with the real download, the steps
 *  tick off below it, faint stars drift behind; a failed start says so here and offers a retry. */
/** Where the engine files come from. PERF1 adds this to the progress report; missing means a download. */
type BootProgress = EngineProgress & { source?: 'cache' | 'network' }

export function EngineBoot({ stage, progress, failed, complete, delayed, onRetry }: {
  stage: EngineStage; progress?: BootProgress; failed?: boolean; complete?: boolean
  /** Fade in only after 300 ms, so a fast (cached) start never flashes this page. */
  delayed?: boolean; onRetry?: () => void
}) {
  const current = complete ? STAGES.length : STAGES.indexOf(stage)
  const state = (index: number) => index < current ? 'done' : index === current ? 'now' : 'todo'
  const download = progress ? Math.round((progress.runtime.total + progress.data.total) / MB) : 35
  const loaded = progress ? progress.runtime.loaded + progress.data.loaded : 0
  const total = progress ? progress.runtime.total + progress.data.total : 0
  const fraction = stage === 'initialize' ? 1 : total > 0 ? loaded / total : 0
  const steps: { key: EngineStage; title: string; detail: string; bar?: StageProgress }[] = [
    { key: 'runtime', title: _t('Python runtime'), detail: stageDetail('runtime', state(0), progress), bar: progress?.runtime },
    { key: 'data', title: _t('Game data'), detail: stageDetail('data', state(1), progress), bar: progress?.data },
    { key: 'initialize', title: _t('Starting the pyfa engine'), detail: _t('About 2–5 seconds') },
  ]
  // A start from this device's cache loads, it does not download: no sizes, a different status line.
  const cached = progress?.source === 'cache'
  if (cached) for (const step of steps) if (step.key !== 'initialize') step.detail = ''
  const now = steps[Math.min(current, steps.length - 1)]!
  const status = cached && now.key !== 'initialize' ? { key: `cache-${now.key}`, title: _t('Loading from this device…') } : now
  const { reduce } = motionSpec()
  return <main className="boot" data-appearance="dark" data-delayed={delayed || undefined}>
    <div className="boot-stars" aria-hidden="true"><i /><i /></div>
    <Capacitor fraction={fraction} complete={complete} failed={failed}>
      {total > 0 && !cached && <small className="num" data-testid="boot-bytes">{bytesText(loaded, total)}</small>}
    </Capacitor>
    <h1>{_t('Preparing the fitting engine')}</h1>
    {failed
      ? <div className="boot-failure" role="alert">
        <p>{_t('Could not start the fitting engine')}</p>
        <button type="button" className="btn primary" onClick={onRetry}>{_t('Retry')}</button>
      </div>
      : <div className="boot-status">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={status.key} data-testid="boot-status" initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -12 }} transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}>{status.title}</motion.p>
        </AnimatePresence>
      </div>}
    {!cached && <p>{_t('The first launch downloads about {n} MB; after that it opens instantly, even offline').replace('{n}', String(download))}</p>}
    <ol className="boot-steps">
      {steps.map((step, index) => {
        const s = state(index)
        return <li key={step.key} className="boot-step" data-step={s}>
          <span className="boot-dot">{s === 'done' ? <Icon name="check" size={14} /> : index + 1}</span>
          <div>
            <b>{step.title}</b>
            <small>{step.detail}</small>
            {s === 'now' && step.bar && <div className="pbar" role="progressbar" aria-label={step.title} aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={percent(step.bar)}><i style={{ width: `${percent(step.bar)}%` }} /></div>}
          </div>
        </li>
      })}
    </ol>
  </main>
}

function stageDetail(stage: 'runtime' | 'data', state: string, progress?: EngineProgress) {
  const bar = progress?.[stage]
  if (!bar || bar.total === 0) return state === 'now' ? _t('Starting download…') : ''
  if (state === 'done') return formatMb(bar.total)
  if (state === 'now') return `${(bar.loaded / MB).toFixed(1)} / ${(bar.total / MB).toFixed(1)} MB`
  return formatMb(bar.total)
}

/** Floating bar at the bottom of a skeleton page (load.html ②). */
export function EngineBar({ stage, progress }: { stage: EngineStage; progress?: EngineProgress }) {
  const bar = stage === 'initialize' ? undefined : progress?.[stage]
  const label = stage === 'runtime' ? _t('Python runtime') : stage === 'data' ? _t('Game data') : _t('Initializing')
  return <div className="engine-bar" role="status">
    <span className="spinner" aria-hidden="true" />
    {`${_t('Starting engine')} · ${label}${bar ? ` ${percent(bar)}%` : ''}`}
  </div>
}
