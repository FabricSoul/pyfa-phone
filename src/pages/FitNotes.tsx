import { useEffect, useRef, useState } from 'react'
import { _t } from '../i18n/t'
import { useFitSession } from './fitSession'
import { FitSection } from './shared'

export function FitNotes() {
  const { fit, edit } = useFitSession()
  const [draft, setDraft] = useState<string>()
  const pending = useRef<string>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const editRef = useRef(edit)
  editRef.current = edit

  function flush() {
    clearTimeout(timer.current)
    const notes = pending.current
    if (notes === undefined) return
    pending.current = undefined
    editRef.current((current) => current.notes === notes ? current : { ...current, notes })
    setDraft(undefined)
  }

  useEffect(() => {
    function flushWhenHidden() {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      flush()
    }
  }, [])

  return <FitSection title={_t('Notes')}>
    <div className="fit-inset">
      <textarea className="fit-input" value={draft ?? fit.notes} rows={4} aria-label={_t('Notes')}
        placeholder={_t('Add notes')}
        onChange={(event) => {
          const notes = event.target.value
          pending.current = notes
          setDraft(notes)
          clearTimeout(timer.current)
          timer.current = setTimeout(flush, 350)
        }}
        onBlur={flush} />
    </div>
  </FitSection>
}
