import './ui.css'
import { Link } from 'react-router-dom'
import type { EngineStage } from '../engine/client'
import type { EngineProgress, StageProgress } from '../engine/progress'
import { _t } from '../i18n/t'
import { fmt } from './format'
import { Icon } from './icons'

const MB = 1024 * 1024
/** "17 MB", "17.7 MB". */
export const formatMb = (bytes: number) => `${fmt(bytes / MB)} MB`
const percent = ({ loaded, total }: StageProgress) => total > 0 ? Math.round(loaded / total * 100) : 0
const STAGES: EngineStage[] = ['runtime', 'data', 'initialize']

/** First start page (load.html ①): the engine is not ready, so say what is being fetched and what already works. */
export function EngineBoot({ stage, progress, failed }: { stage: EngineStage; progress?: EngineProgress; failed?: boolean }) {
  if (failed) return <main className="boot">
    <h1>{_t('Fittings')}</h1>
    <Link className="btn" to="/">{_t('Browse fittings first')}</Link>
  </main>
  const current = STAGES.indexOf(stage)
  const state = (index: number) => index < current ? 'done' : index === current ? 'now' : 'todo'
  const download = progress ? Math.round((progress.runtime.total + progress.data.total) / MB) : 35
  const steps: { key: EngineStage; title: string; detail: string; bar?: StageProgress }[] = [
    { key: 'runtime', title: _t('Python runtime'), detail: stageDetail('runtime', state(0), progress), bar: progress?.runtime },
    { key: 'data', title: _t('Game data'), detail: stageDetail('data', state(1), progress), bar: progress?.data },
    { key: 'initialize', title: _t('Starting the pyfa engine'), detail: _t('About 2–5 seconds') },
  ]
  return <main className="boot">
    <div className="boot-logo hangar" data-appearance="dark"><span className="boot-ring" /><img src="/img/gui/pyfa.png" alt="" /></div>
    <h1>{_t('Preparing the fitting engine')}</h1>
    <p>{_t('The first launch downloads about {n} MB; after that it opens instantly, even offline').replace('{n}', String(download))}</p>
    <ol className="boot-steps">
      {steps.map((step, index) => {
        const s = state(index)
        return <li key={step.key} className="boot-step" data-step={s}>
          <span className="boot-dot">{s === 'done' ? <Icon name="check" size={14} /> : s === 'now' && index < 2 ? <Icon name="download" size={14} /> : index + 1}</span>
          <div>
            <b>{step.title}</b>
            <small>{step.detail}</small>
            {s === 'now' && step.bar && <div className="pbar" role="progressbar" aria-label={step.title} aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={percent(step.bar)}><i style={{ width: `${percent(step.bar)}%` }} /></div>}
          </div>
        </li>
      })}
    </ol>
    <p className="boot-tip">{_t('Fittings list, settings and backups work right now')}</p>
    <Link className="btn" to="/">{_t('Browse fittings first')}</Link>
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
