import './ui.css'
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { motionSpec, sheetMotion } from './motion'
import { Icon } from './icons'

/** Bottom sheet: rises on a spring while the dim fades in; pull it down (by the handle, or by its body when it is not scrolled)
 *  and it follows the finger, the dim lightening with it, closing past 100 px or on a flick. At most 90% of the screen.
 *  `title` is the dialog's accessible name; Escape closes; focus moves in on open and back to the trigger on close. */
export function ActionSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { standard, ease } = motionSpec()
  // Up on a spring, down on the iOS curve; reduced motion: no slide, only a short fade.
  const sheet = sheetMotion()
  const dim = useMotionValue(0)
  const pull = useRef<{ x: number; y: number; id: number } | null>(null)
  const titleId = useId()
  const controls = useDragControls()
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current() } }
    document.addEventListener('keydown', onKey)
    // The panel mounts in the same commit as `open`, so it exists by now (it is inside AnimatePresence).
    panel.current?.focus({ preventScroll: true })
    void animate(dim, 1, { duration: standard * 1.5, ease })
    // While the sheet is being pulled down by its body, the page must not scroll (iOS would cancel the pointer otherwise).
    const node = panel.current
    const onTouchMove = (e: TouchEvent) => { if (pull.current === null && node?.dataset.pulling === 'true') e.preventDefault() }
    node?.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      node?.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('keydown', onKey)
      if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="dim" className="dim" data-testid="sheet-dim" onClick={onClose}
            style={{ opacity: dim }} exit={{ opacity: 0, transition: { duration: standard, ease } }} />
          <motion.div key="sheet" ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            data-testid="sheet" data-drag-body="true"
            initial={sheet.from} animate={sheet.enter} exit={sheet.exit}
            drag="y" dragControls={controls} dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }}
            onPointerDown={(e) => { pull.current = { x: e.clientX, y: e.clientY, id: e.pointerId } }}
            onPointerMove={(e) => {
              const start = pull.current
              const node = panel.current
              if (!start || start.id !== e.pointerId || !node) return
              const dy = e.clientY - start.y
              if (Math.abs(dy) < 6 && Math.abs(e.clientX - start.x) < 6) return
              pull.current = null
              // Pulling down a sheet that is scrolled to its top drags the sheet; anything else is a scroll or a tap.
              if (dy > 0 && dy > Math.abs(e.clientX - start.x) && node.scrollTop <= 0 && !(e.target as Element).closest('input, textarea, [data-no-pull]')) {
                node.dataset.pulling = 'true'
                controls.start(e)
              }
            }}
            onPointerUp={() => { pull.current = null }}
            onDrag={(_, info) => { const h = panel.current?.offsetHeight || 400; dim.set(Math.max(0, 1 - Math.max(0, info.offset.y) / h)) }}
            onDragEnd={(_, info) => {
              if (panel.current) delete panel.current.dataset.pulling
              if (info.offset.y > 100 || info.velocity.y > 500) onClose()
              else void animate(dim, 1, { duration: standard, ease })
            }}>
            <div className="grab-zone" data-testid="sheet-grab" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); controls.start(e) }}>
              <div className="grab" />
            </div>
            <h2 id={titleId} className="sr-only">{title}</h2>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function SheetAction({ icon, children, hint, warn, onClick }: {
  icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode; hint?: string; warn?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" className={`act${warn ? ' warn' : ''}`} onClick={onClick}>
      {icon && <Icon name={icon} size={20} />}<span>{children}</span>
      {hint && <em style={{ marginLeft: 'auto', fontStyle: 'normal', fontSize: 13, color: 'var(--color-text-secondary)' }}>{hint}</em>}
    </button>
  )
}
