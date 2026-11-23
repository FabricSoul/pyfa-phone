import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CalcResult, FitDoc, ImportAmbiguity, ImportFormat, Warning } from '../engine/types'
import { _t } from '../i18n/t'
import { useItemNameLanguage, useSettings } from '../settings/settings'
import { ActionSheet } from '../ui/ActionSheet'
import { fmt, lname, renderUrl } from '../ui/format'
import { ItemIcon } from '../ui/ItemIcon'
import { Home } from './Home'
import { resultNames, useFitServices } from './fitSession'
import { useGoBack, warningName } from './shared'

interface Preview {
  fit: FitDoc
  calc: CalcResult
  format?: ImportFormat
  itemCount: number
}

export function ImportWarnings({ warnings, ambiguities = [] }: { warnings: string[]; ambiguities?: ImportAmbiguity[] }) {
  if (!warnings.length && !ambiguities.length) return null
  return <ul className="fit-inset import-warnings">
    {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
    {ambiguities.map(({ name, candidates }) => <li key={name}>
      {_t('Ambiguous item name: {name}. Candidates: {candidates}').replace(/\{name\}|\{candidates\}/g, (part) =>
        part === '{name}' ? name : candidates.map((item) => `${item.name} (${item.typeId})`).join(', '))}
    </li>)}
  </ul>
}

function overageName(kind: Warning['kind']) {
  switch (kind) {
    case 'activeDrones': return _t('Active drones')
    case 'fighterBay': return _t('Fighter bay')
    case 'fighterTubes': return _t('Fighter tubes')
    default: return warningName(kind)
  }
}

export default function Import() {
  const language = useItemNameLanguage()
  const { considerReload } = useSettings()
  const { engine, store } = useFitServices()
  const navigate = useNavigate()
  const close = useGoBack()
  const request = useRef(0)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview>()
  const [warnings, setWarnings] = useState<string[]>([])
  const [ambiguities, setAmbiguities] = useState<ImportAmbiguity[]>([])
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const onText = useCallback(async (value: string) => {
    const version = ++request.current
    setText(value)
    setPreview(undefined)
    setWarnings([])
    setAmbiguities([])
    setFailed(false)
    setSaveError(false)
    if (!value.trim()) return
    try {
      const imported = await engine.importText(value)
      if (version !== request.current) return
      setWarnings(imported.warnings)
      setAmbiguities(imported.ambiguities ?? [])
      const fit = imported.fits[0]
      if (!fit) {
        setFailed(true)
        return
      }
      const calc = await engine.calc(fit, { includeReload: considerReload })
      if (version !== request.current) return
      const itemCount = Object.values(fit.modules).flat().filter((mod) => mod !== null).length
        + fit.drones.length + (fit.fighters?.length ?? 0) + fit.cargo.length + fit.implants.length + fit.boosters.length
      setPreview({ fit, calc, itemCount, format: imported.format })
    } catch {
      if (version === request.current) setFailed(true)
    }
  }, [considerReload, engine])

  useEffect(() => {
    let current = true
    void navigator.clipboard?.readText().then((clip) => {
      if (current && request.current === 0 && clip.trim()) void onText(clip)
    }).catch(() => {})
    return () => { current = false }
  }, [onText])

  async function pasteClipboard() {
    const version = request.current
    try {
      const clip = await navigator.clipboard?.readText()
      if (version === request.current && clip?.trim()) void onText(clip)
    } catch {
      // The text box also accepts a manual paste.
    }
  }

  async function saveAndOpen() {
    if (!preview || saving) return
    setSaving(true)
    setSaveError(false)
    const id = crypto.randomUUID()
    try {
      await store.save({ id, fit: preview.fit, openedAt: Date.now(), itemNames: resultNames(preview.calc) })
      navigate(`/fit/${id}`)
    } catch {
      setSaveError(true)
      setSaving(false)
    }
  }

  function openPreview() {
    if (!preview || saving) return
    const id = store.openTemporary(preview.fit, resultNames(preview.calc))
    navigate(`/fit/${id}`)
  }

  const resources = preview?.calc.resources
  return <>
    <div inert><Home /></div>
    <ActionSheet open title={_t('Import')} onClose={() => { if (!saving) close() }}>
      <header className="fit-heading">
        {preview && <ItemIcon className="ship" size={32} src={renderUrl(preview.calc.ship.graphicId)} />}
        <div>
          <h2 style={{ font: 'var(--type-title)', overflowWrap: 'anywhere' }}>{preview?.format
            ? _t('Recognized as {format} fit').replace('{format}', preview.format)
            : preview ? _t('Recognized fit') : _t('Import')}</h2>
          <p className="fit-caption">{preview
            ? <>{lname(preview.calc.ship.name, language)} · {preview.fit.name} ·{' '}
              <span className="num">{preview.itemCount}</span> {_t('items recognized')}</>
            : _t('Paste an EFT, DNA, XML or ESI fit.')}</p>
        </div>
      </header>

      <div className="import-form fit-inset">
        <textarea className="fit-input num" aria-label={_t('Paste fit text')}
          value={text} onChange={(event) => void onText(event.target.value)} disabled={saving}
          placeholder={_t('Paste fit text here')} rows={preview ? 4 : 6} />
        {Boolean(navigator.clipboard) && <button type="button" className="fit-button" disabled={saving}
          onClick={() => void pasteClipboard()}>{_t('Paste from clipboard')}</button>}
      </div>

      {failed && <p className="page-message warn" role="alert">{_t('Could not read this fit text')}</p>}
      {saveError && <p className="page-message warn" role="alert">{_t('Could not save fit')}</p>}
      <ImportWarnings warnings={warnings} ambiguities={ambiguities} />

      {preview && resources && <>
        <div className="hero">
          <div><small>{_t('DPS')}</small><b className="num">{fmt(preview.calc.stats.firepower.dps)}</b></div>
          <div><small>{_t('EHP')}</small><b className="num">{fmt(preview.calc.stats.defense.ehp, 0)}</b></div>
          <div><small>{_t('Speed m/s')}</small><b className="num">{fmt(preview.calc.stats.navigation.maxVelocity, 0)}</b></div>
        </div>
        <div className="fit-inset fit-caption">
          {preview.calc.warnings.length ? <p className="warn" role="status">
            <strong>{_t('Fitting limits exceeded')}</strong>
            {preview.calc.warnings.map((warning) => <span className="num" key={warning.kind} style={{ display: 'block' }}>
              {_t('{resource} over by {amount}')
                .replace('{resource}', overageName(warning.kind) ?? warning.kind)
                .replace('{amount}', fmt(warning.used - warning.total))}
            </span>)}
          </p> : <strong>{_t('Fits within limits')}</strong>}
          <p className="num">
            {_t('CPU')} {fmt(resources.cpu.used)}/{fmt(resources.cpu.total)} ·{' '}
            {_t('Powergrid')} {fmt(resources.powergrid.used)}/{fmt(resources.powergrid.total)} ·{' '}
            {_t('Calibration')} {fmt(resources.calibration.used)}/{fmt(resources.calibration.total)}
          </p>
        </div>
      </>}
      <div className="import-actions fit-inset" style={{ paddingBlock: 'var(--space-2) var(--space-4)' }}>
        {preview && <>
          <button type="button" className="fit-button primary" disabled={saving} onClick={() => void saveAndOpen()}>
            {_t('Save and open')}
          </button>
          <button type="button" className="fit-button" disabled={saving} onClick={openPreview}>
            {_t('View only without saving')}
          </button>
        </>}
        <button type="button" className="fit-button" disabled={saving} onClick={close}>{_t('Back')}</button>
      </div>
    </ActionSheet>
  </>
}
