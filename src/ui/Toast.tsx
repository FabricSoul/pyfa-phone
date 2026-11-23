import './ui.css'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { _t } from '../i18n/t'

export const TOAST_MS = 5000
interface ToastSpec { message: string; actionLabel?: string; onAction?: () => void }
interface Api { show(toast: ToastSpec): void; dismiss(): void }

const ToastContext = createContext<Api>({ show() {}, dismiss() {} })
export const useToast = () => useContext(ToastContext)

/** One bottom toast at a time: polite live region, 5 s, never steals focus. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastSpec & { id: number }>()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dismiss = useCallback(() => { clearTimeout(timer.current); setToast(undefined) }, [])
  const show = useCallback((spec: ToastSpec) => {
    clearTimeout(timer.current)
    setToast({ ...spec, id: Date.now() + Math.random() })
    timer.current = setTimeout(() => setToast(undefined), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])
  return <ToastContext.Provider value={api}>
    {children}
    <div className="toast-host" role="status" aria-live="polite" aria-atomic="true">
      {toast && <div className="toast" key={toast.id}>
        <span className="toast-text">{toast.message}</span>
        {toast.actionLabel && <button type="button" className="toast-action" onClick={() => { toast.onAction?.(); dismiss() }}>
          {toast.actionLabel}
        </button>}
      </div>}
    </div>
  </ToastContext.Provider>
}

/** Standard "Removed X · Undo" toast text. */
export const removedMessage = (name: string, count = 1) => `${_t('Removed')} ${name}${count > 1 ? ` ×${count}` : ''}`
