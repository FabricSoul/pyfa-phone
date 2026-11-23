import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExportFormat } from '../engine/types'
import { _t } from '../i18n/t'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { useFitServices, useFitSession } from './fitSession'

export function FitMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { engine, store, histories } = useFitServices()
  const { record, fit, edit, canRedo, redo } = useFitSession()
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete' | 'export'>('menu')
  const [error, setError] = useState(false)

  const [exported, setExported] = useState('')
  const [copying, setCopying] = useState(false)
  const exportField = useRef<HTMLTextAreaElement>(null)
  const exportRequest = useRef(0)

  useEffect(() => {
    if (mode === 'export' && open) {
      exportField.current?.focus()
      exportField.current?.select()
    }
  }, [mode, open])

  function close() {
    exportRequest.current++
    setCopying(false)
    setMode('menu')
    setError(false)
    onClose()
  }

  async function duplicate() {
    const id = crypto.randomUUID()
    const name = _t('Copy of {name}').replace('{name}', fit.name)
    await store.save({ ...record, id, openedAt: null, fit: { ...fit, name } })
    close()
    navigate(`/fit/${id}`)
  }

  async function remove() {
    await store.remove(record.id)
    histories.delete(record.id)
    close()
    navigate('/')
  }

  function run(work: () => Promise<void>) {
    setError(false)
    void work().catch(() => setError(true))
  }

  function copy(format: ExportFormat, language: 'en' | 'zh' = 'en') {
    const request = ++exportRequest.current
    setCopying(true)
    setError(false)
    void engine.exportText(fit, format, language).then(async (text) => {
      if (request !== exportRequest.current) return
      try {
        await navigator.clipboard.writeText(text)
        if (request === exportRequest.current) close()
      } catch {
        if (request !== exportRequest.current) return
        setCopying(false)
        setExported(text)
        setMode('export')
      }
    }, () => {
      if (request !== exportRequest.current) return
      setCopying(false)
      setError(true)
    })
  }

  return <ActionSheet open={open} title={_t('Fit actions')} onClose={close}>
    {error && <p className="page-message warn" role="alert">{_t('Could not complete action')}</p>}
    {mode === 'menu' && <>
      <button type="button" className="act" disabled={!canRedo} onClick={() => { redo(); close() }}>{_t('Redo')}</button>
      <SheetAction onClick={() => setMode('rename')}>{_t('Rename fit')}</SheetAction>
      <SheetAction onClick={() => run(duplicate)}>{_t('Duplicate fit')}</SheetAction>
      <fieldset className="fit-export-options" disabled={copying}>
        <SheetAction onClick={() => copy('eft')}>{_t('Copy EFT (English)')}</SheetAction>
        <SheetAction onClick={() => copy('eft', 'zh')}>{_t('Copy EFT (Chinese)')}</SheetAction>
        <SheetAction onClick={() => copy('dna')}>{_t('Copy DNA')}</SheetAction>
        <SheetAction onClick={() => copy('multibuy')}>{_t('Copy MultiBuy')}</SheetAction>
      </fieldset>
      <SheetAction warn onClick={() => setMode('delete')}>{_t('Delete fit')}</SheetAction>
    </>}
    {mode === 'export' && <div className="fit-inset">
      <label>{_t('Exported fit')}
        <textarea className="fit-input" rows={6} readOnly ref={exportField} value={exported}
          onFocus={(event) => event.currentTarget.select()} />
      </label>
      <div className="fit-controls">
        <button type="button" className="fit-button" onClick={() => setMode('menu')}>{_t('Back')}</button>
      </div>
    </div>}
    {mode === 'rename' && <form className="fit-inset" onSubmit={(event) => {
      event.preventDefault()
      const value = new FormData(event.currentTarget).get('name')
      const name = typeof value === 'string' ? value.trim() : ''
      if (name && name !== fit.name) edit((fit) => ({ ...fit, name }))
      close()
    }}>
      <label>{_t('Fit name')}<input className="fit-input" name="name" defaultValue={fit.name} required /></label>
      <div className="fit-controls">
        <button type="button" className="fit-button" onClick={() => setMode('menu')}>{_t('Cancel')}</button>
        <button type="submit" className="fit-button primary">{_t('Save')}</button>
      </div>
    </form>}
    {mode === 'delete' && <div className="fit-inset">
      <p>{_t('Delete {name}?').replace('{name}', fit.name)}</p>
      <div className="fit-controls">
        <button type="button" className="fit-button" onClick={() => setMode('menu')}>{_t('Cancel')}</button>
        <button type="button" className="fit-button warn" onClick={() => run(remove)}>{_t('Delete fit')}</button>
      </div>
    </div>}
  </ActionSheet>
}
