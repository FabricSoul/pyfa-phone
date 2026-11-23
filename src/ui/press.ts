/** Controls that dip and darken while pressed (UX4 #7). Kept in step with the press rules in ui.css. */
export const PRESSABLE = '.fit, .qa, .ib, .act, .fit-button, .toast-action, .seg button, .pill, .mh, button.row, .rack-heat, .resume, .row .body, .ar'
/** A finger that slides this far is scrolling or swiping, not pressing. */
const SLOP = 10

/** Marks the pressed control with `data-pressed` while a finger or button is down on it. CSS `:active` alone is not enough:
 *  iOS Safari does not apply it to touches unless the page listens for them, and it stays on while the finger scrolls away. */
export function installPressFeedback(root: Document = document): () => void {
  let pressed: { el: HTMLElement; x: number; y: number; id: number } | null = null
  const release = () => { if (pressed) delete pressed.el.dataset.pressed; pressed = null }
  const down = (e: PointerEvent) => {
    release()
    if (e.isPrimary === false || e.button > 0) return
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(PRESSABLE)
    if (!el || (el as HTMLButtonElement).disabled) return
    pressed = { el, x: e.clientX, y: e.clientY, id: e.pointerId }
    el.dataset.pressed = 'true'
  }
  const move = (e: PointerEvent) => {
    if (pressed && e.pointerId === pressed.id && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > SLOP) release()
  }
  const touch = () => {}
  root.addEventListener('pointerdown', down, true)
  root.addEventListener('pointermove', move, true)
  root.addEventListener('pointerup', release, true)
  root.addEventListener('pointercancel', release, true)
  // An empty touch listener also makes iOS Safari apply :active.
  root.addEventListener('touchstart', touch, { passive: true })
  return () => {
    release()
    root.removeEventListener('pointerdown', down, true)
    root.removeEventListener('pointermove', move, true)
    root.removeEventListener('pointerup', release, true)
    root.removeEventListener('pointercancel', release, true)
    root.removeEventListener('touchstart', touch)
  }
}
