import './ui.css'
import { useRef, useState } from 'react'
import type { ModuleState, SlotRow } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { Icon, type IconName } from './icons'
import { iconUrl, lname } from './format'
import { ItemIcon } from './ItemIcon'

const ICON: Record<ModuleState, IconName> = { offline: 'power-off', online: 'power', active: 'zap', overheated: 'flame' }
const LONG_PRESS_MS = 500
const SWIPE_OPEN = -144

const ALL_STATES: ModuleState[] = ['offline', 'online', 'active', 'overheated']

/** Tap order over the states the engine offers for this module (overheated is long-press only):
 *  forward through them; after the last one go back to online when there are three or more
 *  (offline stays reachable by swipe), else to the first. */
export function nextState(state: ModuleState, available: ModuleState[]): ModuleState {
  const cycle: ModuleState[] = available.filter((s) => s !== 'overheated')
  if (cycle.length === 0) return state
  const i = cycle.indexOf(state)
  if (i === -1) return cycle.includes('online') ? 'online' : cycle[0]!
  if (i < cycle.length - 1) return cycle[i + 1]!
  return cycle.length >= 3 ? cycle[1]! : cycle[0]!
}

export function ModuleRow({ row, availableStates: provided, selected, pressed, onStateChange, onTap, onRemove, onAdd }: {
  row: SlotRow
  /** States the engine allows for this module (passive modules: offline and online only). */
  availableStates?: ModuleState[]
  selected?: boolean
  pressed?: boolean
  onStateChange?: (state: ModuleState) => void
  onTap?: () => void
  onRemove?: () => void
  onAdd?: () => void
}) {
  const lang = useUiLanguage()
  // The engine reports which states a module supports; an explicit prop wins, ALL_STATES is the fallback.
  const availableStates = provided ?? (row.kind === 'module' ? row.supportedStates : undefined) ?? ALL_STATES
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longPressed = useRef(false)
  const drag = useRef<{ x: number; base: number } | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)

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
        <div className="mn"><span>{lname(row.name, lang)}</span><small>{_t('Item removed')}</small></div>
        {row.count > 1 && <span className="cnt num">×{row.count}</span>}
        {onRemove && <button type="button" className="sb" aria-label={_t('Remove')} onClick={onRemove}><Icon name="x" /></button>}
      </div>
    )
  }

  const startPress = () => {
    longPressed.current = false
    if (!availableStates.includes('overheated')) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { longPressed.current = true; onStateChange?.('overheated') }, LONG_PRESS_MS)
  }
  const endPress = () => clearTimeout(timer.current)

  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, base: dx }; setDragging(false) }
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

  const [first, ...rest] = row.keyParts
  const cls = ['row']
  if (row.state === 'offline') cls.push('off')
  if (row.overSlots) cls.push('warn')
  if (selected) cls.push('sel')
  if (pressed) cls.push('pressed')
  if (dragging) cls.push('dragging')
  const label = row.state === 'offline' ? _t('Offline') : row.state === 'online' ? _t('Online') : row.state === 'active' ? _t('Active') : _t('Overheated')

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
          <span className="mn">
            <span>{lname(row.name, lang)}</span>
            {row.charge && (
              <small><ItemIcon className="mini-ic" size={16} src={iconUrl(row.charge.iconId)} />{lname(row.charge.name, lang)} · {row.charge.removed ? _t('Item removed') : row.charge.count}</small>
            )}
            {row.keyParts.length > 0 && (
              <small className="num">{first && <b>{first}</b>}{rest.map((p) => <span key={p}> · {p}</span>)}</small>
            )}
          </span>
        </button>
        {row.count > 1 && <span className="cnt num">×{row.count}</span>}
        <button type="button" data-testid="state-button" data-state={row.state} className="sb" aria-label={label}
          onPointerDown={(e) => { e.stopPropagation(); startPress() }} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
          onClick={(e) => {
            e.stopPropagation()
            if (longPressed.current) { longPressed.current = false; return }
            onStateChange?.(nextState(row.state, availableStates))
          }}>
          <span className="sbi"><Icon name={ICON[row.state]} /></span>
        </button>
      </div>
    </div>
  )
}
