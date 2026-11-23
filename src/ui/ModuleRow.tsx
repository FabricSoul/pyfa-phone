import './ui.css'
import { useAnimate } from 'motion/react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { ModuleSlotRow, ModuleState, SlotRow } from '../engine/types'
import { _t } from '../i18n/t'
import { Icon, type IconName } from './icons'
import { fmt, iconUrl, lname, useNameLanguage } from './format'
import { PriceValue } from './PriceValue'
import { ItemIcon } from './ItemIcon'
import { motionSpec } from './motion'

export const MODULE_STATE_ICONS: Record<ModuleState, IconName> = { offline: 'power-off', online: 'power', active: 'zap', overheated: 'flame' }
const LONG_PRESS_MS = 500
const PRESS_SLOP = 24
const SWIPE_OPEN = -144

const ALL_STATES: ModuleState[] = ['offline', 'online', 'active', 'overheated']

/** Walk the available normal states in order. Overheat is a separate gesture. */
export function nextState(state: ModuleState, available: ModuleState[]): ModuleState {
  const cycle = available.filter((candidate) => candidate !== 'overheated')
  if (cycle.length === 0) return state
  if (state === 'overheated') return cycle.includes('online') ? 'online' : cycle[0]!
  return cycle[(cycle.indexOf(state) + 1) % cycle.length]!
}

export function OmegaMark() {
  return <span className="omega-mark" title={_t('Requires Omega')} aria-label={_t('Requires Omega')}>Ω</span>
}

export function ModuleMetrics({ row }: { row: ModuleSlotRow }) {
  const metrics = [
    row.dps === undefined ? '' : `${fmt(row.dps)} ${_t('DPS/module')}`,
    row.velocityBonus === undefined ? '' : `${_t('Speed bonus')} ${fmt(row.velocityBonus)}%`,
    row.repairPerSecond === undefined ? '' : `${_t('Repair')} ${fmt(row.repairPerSecond)} ${_t('HP/s')}`,
    row.rangeText ? `${_t('Range')} ${row.rangeText}` : '',
    row.miscText ? (row.miscTooltip === 'Tracking speed' ? `${_t('Tracking speed')} ${row.miscText}`
      : row.miscTooltip === 'Energy neutralization per second' ? `${_t('Neutralization')} ${row.miscText}`
      : row.miscText) : '',
    row.hullResistanceBonus === undefined ? '' : `${_t('Hull resist bonus')} ${fmt(row.hullResistanceBonus)}%`,
    row.calibration === undefined ? '' : `${_t('Calibration')} ${fmt(row.calibration)}`,
  ].filter(Boolean)
  const [first, ...rest] = metrics.length ? metrics : row.keyParts
  if (!first) return null
  return <span className="module-metrics num" title={[first, ...rest, row.miscTooltip].filter(Boolean).join(' · ')}>
    <b>{first}</b>{rest.map((metric, index) => <span key={index}> · {metric}</span>)}
  </span>
}

export function ChargeSummary({ charge }: { charge: NonNullable<ModuleSlotRow['charge']> }) {
  const lang = useNameLanguage()
  const rounds = charge.count > 0 ? _t('{n} round', '{n} rounds', charge.count).replace('{n}', fmt(charge.count)) : ''
  const cycles = charge.cycles ? _t('{n} cycle', '{n} cycles', charge.cycles).replace('{n}', fmt(charge.cycles)) : ''
  const load = charge.removed ? _t('Item removed') : [rounds, cycles].filter(Boolean).join(' · ')
  const name = lname(charge.name, lang)
  return <span className="module-charge" title={[name, load].filter(Boolean).join(' · ')}>
    <ItemIcon className="mini-ic" size={16} src={iconUrl(charge.iconId)} />
    <span className="module-charge-name">{name}</span>
    {charge.omega && <OmegaMark />}
    {load && <span className="num">{load}</span>}
  </span>
}

export function ModuleRow({ row, availableStates: provided, selected, pressed, price, onStateChange, onTap, onRemove, onAdd, onPressStart }: {
  row: SlotRow
  /** States the engine allows for this module (passive modules: offline and online only). */
  availableStates?: ModuleState[]
  selected?: boolean
  pressed?: boolean
  price?: number | null
  onStateChange?: (state: ModuleState) => void
  onTap?: () => void
  onRemove?: () => void
  onAdd?: () => void
  /** A finger went down on the row: the sheet it may open can start loading (its charges). */
  onPressStart?: () => void
}) {
  const lang = useNameLanguage()
  // The engine reports which states a module supports; an explicit prop wins, ALL_STATES is the fallback.
  const availableStates = provided ?? (row.kind === 'module' ? row.supportedStates : undefined) ?? ALL_STATES
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const press = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const drag = useRef<{ x: number; base: number } | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  // The state key bounces once when its state changes (not when the row first appears) and recolours by CSS.
  const [bounce, animateBounce] = useAnimate<HTMLSpanElement>()
  const state = row.kind === 'module' ? row.state : undefined
  const previous = useRef(state)
  useEffect(() => {
    if (previous.current === state) return
    previous.current = state
    const { reduce } = motionSpec()
    // A visible pop (UX4): squeeze, overshoot to 1.25, settle on a spring-like curve.
    if (!reduce && bounce.current) void animateBounce(bounce.current, { scale: [1, 0.72, 1.25, 0.96, 1] }, { duration: 0.46, times: [0, 0.18, 0.5, 0.78, 1], ease: 'easeOut' })
  }, [state, bounce, animateBounce])

  if (row.kind === 'empty') {
    return (
      <button type="button" data-testid="empty-row" className="row empty" style={{ width: '100%', border: 0, textAlign: 'left', font: 'var(--type-name)' }} onClick={onAdd}>
        <span className="ph"><Icon name="plus" size={16} /></span>
        <span>{row.count > 1 ? `${_t('Empty slot')} ×${row.count}` : _t('Empty slot')}<br />
          <small style={{ font: 'var(--type-caption)' }}>{_t('Tap to add a module')}</small></span>
      </button>
    )
  }

  if (row.kind === 'removed') {
    return (
      <div className="row warn">
        <ItemIcon />
        <div className="mn"><span>{lname(row.name, lang)}</span><small>{row.adjustment ? _t('Needs adjustment: wrong slot') : _t('Item removed')}</small></div>
        {row.count > 1 && <span className="cnt num">×{row.count}</span>}
        {onRemove && <button type="button" className="sb" aria-label={_t('Remove')} onClick={onRemove}><Icon name="x" /></button>}
      </div>
    )
  }

  const canOverheat = availableStates.includes('overheated')
  const endPress = () => {
    clearTimeout(timer.current)
    press.current = null
  }
  const startPress = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (event.button > 0 || event.isPrimary === false) return
    suppressClick.current = false
    if (!canOverheat) return
    endPress()
    press.current = { x: event.clientX, y: event.clientY }
    timer.current = setTimeout(() => {
      suppressClick.current = true
      onStateChange?.('overheated')
    }, LONG_PRESS_MS)
  }
  const movePress = (event: PointerEvent<HTMLButtonElement>) => {
    if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > PRESS_SLOP) {
      suppressClick.current = true
      endPress()
    }
  }

  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, base: dx }; setDragging(false); onPressStart?.() }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const d = e.clientX - drag.current.x
    if (Math.abs(d) > 6) { setDragging(true); clearTimeout(timer.current) }
    if (Math.abs(d) > 6) setDx(Math.max(SWIPE_OPEN, Math.min(0, drag.current.base + d)))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    setDx((v) => (v < SWIPE_OPEN / 2 ? SWIPE_OPEN : 0))
    setTimeout(() => setDragging(false), 0)
  }

  const cls = ['row']
  if (row.state === 'offline') cls.push('off')
  if (row.overSlots) cls.push('warn')
  if (selected) cls.push('sel')
  if (pressed) cls.push('pressed')
  if (dragging) cls.push('dragging')
  const stateLabel = row.state === 'offline' ? _t('Offline') : row.state === 'online' ? _t('Online') : row.state === 'active' ? _t('Active') : _t('Overheated')

  const label = canOverheat ? `${stateLabel} · ${_t('Long press to overheat')}` : stateLabel
  const open = dx !== 0
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setDx(SWIPE_OPEN)
    else if (e.key === 'ArrowRight' || e.key === 'Escape') setDx(0)
  }

  return (
    <div className="swipe">
      {/* Hidden (not focusable, not announced) until the row is swiped open. */}
      <div className="acts" aria-hidden={!open} style={{ visibility: open ? 'visible' : 'hidden' }}>
        <button type="button" tabIndex={open ? 0 : -1} onClick={() => { onStateChange?.('offline'); setDx(0) }}>{_t('Offline')}</button>
        <button type="button" tabIndex={open ? 0 : -1} className="rm" onClick={() => { onRemove?.(); setDx(0) }}>{_t('Remove')}</button>
      </div>
      <div data-testid="module-row" className={cls.join(' ')} style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        // Padding around the native body button is tappable too (the button itself is the keyboard/AT target).
        onClick={(e) => { if (e.target === e.currentTarget && !dragging && !open) onTap?.() }}>
        <button type="button" className="body" onKeyDown={onKeyDown}
          onClick={() => { if (dragging) return; if (open) setDx(0); else onTap?.() }}>
          <ItemIcon src={iconUrl(row.iconId)} />
          <span className="mn module-copy">
            <span className="module-primary">
              <span className="module-name" title={lname(row.name, lang)}>{lname(row.name, lang)}</span>
              {row.omega && <OmegaMark />}
              <ModuleMetrics row={row} />
            </span>
            {row.adjustment && <small className="warn">{_t('Needs adjustment: state changed')}</small>}
            {row.charge && <small><ChargeSummary charge={row.charge} /></small>}
            {price != null && <small className="num"><PriceValue value={price} /> <span>{_t('each')}</span></small>}
          </span>
        </button>
        {row.count > 1 && <span className="cnt num">×{row.count}</span>}
        <button type="button" data-testid="state-button" data-state={row.state} className="sb" aria-label={label} data-long-press={canOverheat || undefined}
          onPointerDown={startPress} onPointerMove={movePress} onPointerUp={endPress}
          onPointerLeave={endPress} onPointerCancel={endPress}
          onContextMenu={canOverheat ? (event) => event.preventDefault() : undefined}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false }}
          onClick={(e) => {
            e.stopPropagation()
            if (suppressClick.current) { suppressClick.current = false; return }
            onStateChange?.(nextState(row.state, availableStates))
          }}>
          <span className="sbi" ref={bounce}><Icon name={MODULE_STATE_ICONS[row.state]} /></span>
        </button>
      </div>
    </div>
  )
}
