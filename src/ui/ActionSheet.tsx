import './ui.css'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { motionTokens } from './format'
import { Icon } from './icons'

/** Bottom sheet: slides up with --dur/--ease, drag down to dismiss, at most 90% of the screen. */
export function ActionSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { duration, ease } = motionTokens()
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="dim" className="dim" data-testid="sheet-dim" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration, ease }} />
          <motion.div key="sheet" className="sheet" role="dialog" aria-modal="true" data-testid="sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration, ease }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 100 || info.velocity.y > 500) onClose() }}>
            <div className="grab" />
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
