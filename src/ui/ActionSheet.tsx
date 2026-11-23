import './ui.css'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { motionSpec, sheetMotion } from './motion'
import { Icon } from './icons'

/** Bottom sheet: slides up with --dur/--ease, drag the handle down to dismiss, at most 90% of the screen.
 *  `title` is the dialog's accessible name; Escape closes; focus moves in on open and back to the trigger on close. */
export function ActionSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { standard, ease } = motionSpec()
  // Up with a slight overshoot, down in 1.5 × fast; reduced motion: no slide, only a short fade (motion.html).
  const sheet = sheetMotion()
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
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="dim" className="dim" data-testid="sheet-dim" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: standard, ease }} />
          <motion.div key="sheet" ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            data-testid="sheet"
            initial={sheet.from} animate={sheet.enter} exit={sheet.exit}
            drag="y" dragControls={controls} dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 100 || info.velocity.y > 500) onClose() }}>
            <div className="grab-zone" data-testid="sheet-grab" style={{ touchAction: 'none' }} onPointerDown={(e) => controls.start(e)}>
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
