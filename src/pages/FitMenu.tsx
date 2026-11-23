import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { _t } from '../i18n/t'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { useFitServices, useFitSession } from './fitSession'

export function FitMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { engine, store, histories } = useFitServices()
  const { record, fit, edit, canRedo, redo } = useFitSession()
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu')
  const [error, setError] = useState(false)

  function close() {
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

  return <ActionSheet open={open} onClose={close}>
    {error && <p className="page-message warn" role="alert">{_t('Could not complete action')}</p>}
    {mode === 'menu' && <>
      <button type="button" className="act" disabled={!canRedo} onClick={() => { redo(); close() }}>{_t('Redo')}</button>
      <SheetAction onClick={() => setMode('rename')}>{_t('Rename fit')}</SheetAction>
      <SheetAction onClick={() => run(duplicate)}>{_t('Duplicate fit')}</SheetAction>
      <SheetAction onClick={() => run(async () => {
        await navigator.clipboard.writeText(await engine.exportText(fit, 'eft'))
        close()
      })}>{_t('Copy EFT')}</SheetAction>
      <SheetAction warn onClick={() => setMode('delete')}>{_t('Delete fit')}</SheetAction>
    </>}
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
