import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExportFormat, ImportAddition, ImportAdditionsResult } from '../engine/types'
import { _t } from '../i18n/t'
import { updateSettings, useSettings } from '../settings/settings'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { Reveal } from '../ui/motion'
import { useFitServices, useFitSession } from './fitSession'
import { ImportWarnings } from './Import'

export function FitMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { engine, store, histories } = useFitServices()
  const { record, fit, edit, canRedo, redo } = useFitSession()
  const { eftExport } = useSettings()
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete' | 'export' | 'eftOptions' | ImportAddition>('menu')
  const [pasteText, setPasteText] = useState('')
  const [additions, setAdditions] = useState<ImportAdditionsResult>()
  const [pasting, setPasting] = useState(false)
  const [error, setError] = useState(false)

  const [exported, setExported] = useState('')
  const [copying, setCopying] = useState(false)
  const exportField = useRef<HTMLTextAreaElement>(null)
  const actionRequest = useRef(0)

  useEffect(() => {
    if (mode === 'export' && open) {
      exportField.current?.focus()
      exportField.current?.select()
    }
  }, [mode, open])

  function backToMenu() {
    actionRequest.current++
    setCopying(false)
    setPasting(false)
    setPasteText('')
    setAdditions(undefined)
    setMode('menu')
    setError(false)
  }

  function close() {
    backToMenu()
    onClose()
  }

  function changePaste(text: string) {
    actionRequest.current++
    setPasteText(text)
    setAdditions(undefined)
    setError(false)
  }

  async function readPaste() {
    const request = ++actionRequest.current
    try {
      const text = await navigator.clipboard.readText()
      if (request === actionRequest.current) changePaste(text)
    } catch {
      // Manual paste is available if clipboard permission was declined.
    }
  }

  function addItems(destination: ImportAddition, items: ImportAdditionsResult['items']) {
    edit((current) => {
      if (destination === 'drones') {
        return { ...current, drones: [...current.drones, ...items.map((item) => ({ ...item, active: 0 }))] }
      }
      const cargo = [...current.cargo]
      for (const item of items) {
        const index = cargo.findIndex(({ typeId }) => typeId === item.typeId)
        const stack = cargo[index]
        if (stack) cargo[index] = { ...stack, amount: stack.amount + item.amount }
        else cargo.push(item)
      }
      return { ...current, cargo }
    })
    close()
  }

  async function pasteAdditions(destination: ImportAddition) {
    if (pasting || !pasteText.trim() || !engine.importAdditions) return
    if (additions?.items.length) {
      addItems(destination, additions.items)
      return
    }
    const request = ++actionRequest.current
    setPasting(true)
    setError(false)
    try {
      const result = await engine.importAdditions(pasteText, destination)
      if (request !== actionRequest.current) return
      if (result.items.length && !result.warnings.length && !result.ambiguities?.length) {
        addItems(destination, result.items)
      } else {
        setAdditions(result)
      }
    } catch {
      if (request === actionRequest.current) setError(true)
    } finally {
      if (request === actionRequest.current) setPasting(false)
    }
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
    navigate('/', { state: { back: true } })
  }

  function run(work: () => Promise<void>) {
    setError(false)
    void work().catch(() => setError(true))
  }

  function copy(format: ExportFormat, language: 'en' | 'zh' = 'en') {
    const request = ++actionRequest.current
    setCopying(true)
    setError(false)
    const exportText = format === 'eft'
      ? engine.exportText(fit, format, language, eftExport)
      : engine.exportText(fit, format, language)
    void exportText.then(async (text) => {
      if (request !== actionRequest.current) return
      try {
        await navigator.clipboard.writeText(text)
        if (request === actionRequest.current) close()
      } catch {
        if (request !== actionRequest.current) return
        setCopying(false)
        setExported(text)
        setMode('export')
      }
    }, () => {
      if (request !== actionRequest.current) return
      setCopying(false)
      setError(true)
    })
  }

  const destination = mode === 'cargo' || mode === 'drones' ? mode : undefined
  const copyEft = <>
    <SheetAction onClick={() => copy('eft')}>{_t('Copy EFT (English)')}</SheetAction>
    <SheetAction onClick={() => copy('eft', 'zh')}>{_t('Copy EFT (Chinese)')}</SheetAction>
  </>

  return <ActionSheet open={open} title={_t('Fit actions')} onClose={close}>
    {error && <p className="page-message warn" role="alert">{_t('Could not complete action')}</p>}
    <Reveal key={mode}>
    {mode === 'menu' && <>
      <button type="button" className="act" disabled={!canRedo} onClick={() => { redo(); close() }}>{_t('Redo')}</button>
      <SheetAction onClick={() => setMode('rename')}>{_t('Rename fit')}</SheetAction>
      <SheetAction onClick={() => run(duplicate)}>{_t('Duplicate fit')}</SheetAction>
      {engine.importAdditions && <>
        <SheetAction onClick={() => setMode('drones')}>{_t('Paste drone list')}</SheetAction>
        <SheetAction onClick={() => setMode('cargo')}>{_t('Paste cargo list')}</SheetAction>
      </>}
      <fieldset className="fit-export-options" disabled={copying}>
        <SheetAction onClick={() => setMode('eftOptions')}>{_t('EFT export options')}</SheetAction>
        {copyEft}
        <SheetAction onClick={() => copy('dna')}>{_t('Copy DNA')}</SheetAction>
        <SheetAction onClick={() => copy('multibuy')}>{_t('Copy MultiBuy')}</SheetAction>
      </fieldset>
      <SheetAction warn onClick={() => setMode('delete')}>{_t('Delete fit')}</SheetAction>
    </>}
    {mode === 'eftOptions' && <fieldset className="fit-export-options" disabled={copying}>
      <legend className="fit-inset">{_t('EFT export options')}</legend>
      {([
        ['charges', _t('Loaded charges')], ['cargo', _t('Cargo')],
        ['implants', _t('Implants')], ['boosters', _t('Boosters')],
      ] as const).map(([key, label]) => <label className="act" key={key}>
        <input type="checkbox" checked={eftExport[key]}
          onChange={(event) => updateSettings({ eftExport: { ...eftExport, [key]: event.target.checked } })} />
        {label}
      </label>)}
      {copyEft}
      <SheetAction onClick={backToMenu}>{_t('Back')}</SheetAction>
    </fieldset>}
    {destination && <form onSubmit={(event) => { event.preventDefault(); void pasteAdditions(destination) }}>
      <div className="import-form fit-inset">
        <h3>{destination === 'drones' ? _t('Paste drone list') : _t('Paste cargo list')}</h3>
        <textarea className="fit-input num" aria-label={_t('Paste item list')} rows={5} disabled={pasting}
          value={pasteText} onChange={(event) => changePaste(event.target.value)} />
        {Boolean(navigator.clipboard) && <button type="button" className="fit-button" disabled={pasting}
          onClick={() => void readPaste()}>{_t('Paste from clipboard')}</button>}
      </div>
      {additions && <>
        {!additions.items.length && <p role="status" className="page-message warn">{_t('No items recognized')}</p>}
        <ImportWarnings warnings={additions.warnings} ambiguities={additions.ambiguities} />
      </>}
      <div className="fit-inset fit-controls">
        <button type="button" className="fit-button" onClick={backToMenu}>{_t('Back')}</button>
        <button type="submit" className="fit-button primary" disabled={pasting || !pasteText.trim() || additions?.items.length === 0}>
          {additions ? _t('Add recognized items') : _t('Add to fit')}
        </button>
      </div>
    </form>}
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
    </Reveal>
  </ActionSheet>
}
