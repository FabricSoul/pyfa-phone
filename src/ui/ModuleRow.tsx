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

/** Tap order for modules with an active state: offline → online → active → online. */
export function nextState(state: ModuleState, passive: boolean): ModuleState {
  if (passive) return state === 'offline' ? 'online' : 'offline'
  if (state === 'offline') return 'online'
  if (state === 'online') return 'active'
  return 'online'
}

export function ModuleRow({ row, passive = false, selected, pressed, onStateChange, onTap, onRemove, onAdd }: {
  row: SlotRow
  /** No active state: only online/offline. */
  passive?: boolean
  selected?: boolean
  pressed?: boolean
  onStateChange?: (state: ModuleState) => void
  onTap?: () => void
  onRemove?: () => void
  onAdd?: () => void
}) {
  const lang = useUiLanguage()
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

  const startPress = () => {
    longPressed.current = false
    if (passive) return
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
  const Label = onTap ? 'button' : 'div'
  const cls = ['row']
  if (row.state === 'offline') cls.push('off')
  if (row.overSlots) cls.push('warn')
  if (selected) cls.push('sel')
  if (pressed) cls.push('pressed')
  if (dragging) cls.push('dragging')
  const label = row.state === 'offline' ? _t('Offline') : row.state === 'online' ? _t('Online') : row.state === 'active' ? _t('Active') : _t('Overheated')

  return (
    <div className="swipe">
      <div className="acts" aria-hidden={dx === 0}>
        <button type="button" tabIndex={dx === 0 ? -1 : 0} onClick={() => { onStateChange?.('offline'); setDx(0) }}>{_t('Offline')}</button>
        <button type="button" className="rm" tabIndex={dx === 0 ? -1 : 0} onClick={() => { onRemove?.(); setDx(0) }}>{_t('Remove')}</button>
      </div>
      <div data-testid="module-row" className={cls.join(' ')} style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClick={() => { if (!dragging && dx === 0) onTap?.() }}>
        <ItemIcon src={iconUrl(row.iconId)} />
        <Label className="mn" type={onTap ? 'button' : undefined}>
          <span>{lname(row.name, lang)}</span>
          {row.charge && (
            <small><ItemIcon className="mini-ic" size={16} src={iconUrl(row.charge.iconId)} />{lname(row.charge.name, lang)} · {row.charge.count}</small>
          )}
          {row.keyParts.length > 0 && (
            <small className="num">{first && <b>{first}</b>}{rest.map((p) => <span key={p}> · {p}</span>)}</small>
          )}
        </Label>
        {row.count > 1 && <span className="cnt num">×{row.count}</span>}
        <button type="button" data-testid="state-button" data-state={row.state} className="sb" aria-label={label}
          onPointerDown={(e) => { e.stopPropagation(); startPress() }} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
          onClick={(e) => {
            e.stopPropagation()
            if (longPressed.current) { longPressed.current = false; return }
            onStateChange?.(nextState(row.state, passive))
          }}>
          <Icon name={ICON[row.state]} />
        </button>
      </div>
    </div>
  )
}
