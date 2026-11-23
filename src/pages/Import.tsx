import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CalcResult, FitDoc } from '../engine/types'
import { _t } from '../i18n/t'
import { useItemNameLanguage, useSettings } from '../settings/settings'
import { fmt, lname } from '../ui/format'
import { resultNames, useFitServices } from './fitSession'
import { FitSection, PageHeading } from './shared'

interface Preview {
  fit: FitDoc
  calc: CalcResult
  itemCount: number
}

export default function Import() {
  const language = useItemNameLanguage()
  const { considerReload } = useSettings()
  const { engine, store } = useFitServices()
  const navigate = useNavigate()
  const request = useRef(0)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview>()
  const [warnings, setWarnings] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const onText = useCallback(async (value: string) => {
    const version = ++request.current
    setText(value)
    setPreview(undefined)
    setWarnings([])
    setFailed(false)
    setSaveError(false)
    if (!value.trim()) return
    try {
      const imported = await engine.importText(value)
      if (version !== request.current) return
      setWarnings(imported.warnings)
      const fit = imported.fits[0]
      if (!fit) {
        setFailed(true)
        return
      }
      const calc = await engine.calc(fit, { includeReload: considerReload })
      if (version !== request.current) return
      const itemCount = Object.values(fit.modules).flat().filter((mod) => mod !== null).length
        + fit.drones.length + (fit.fighters?.length ?? 0) + fit.cargo.length + fit.implants.length + fit.boosters.length
      setPreview({ fit, calc, itemCount })
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
  return <main>
    <PageHeading back="/" title={_t('Import')} subtitle={_t('Paste an EFT fit or a DNA fitting link.')} />

    <div className="import-form fit-inset">
      <textarea className="fit-input num" aria-label={_t('Paste fit text')}
        value={text} onChange={(event) => void onText(event.target.value)} disabled={saving}
        placeholder={_t('Paste fit text here')} rows={6} />
      {Boolean(navigator.clipboard) && <button type="button" className="fit-button" disabled={saving}
        onClick={() => void pasteClipboard()}>{_t('Paste from clipboard')}</button>}
    </div>

    {failed && <p className="page-message warn" role="alert">{_t('Could not read this fit text')}</p>}
    {saveError && <p className="page-message warn" role="alert">{_t('Could not save fit')}</p>}
    {warnings.length > 0 && <ul className="fit-inset import-warnings">
      {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
    </ul>}

    {preview && resources && <FitSection title={_t('Recognized fit')}>
      <p className="fit-inset fit-caption">
        {lname(preview.calc.ship.name, language)} · {preview.itemCount} {_t('items recognized')}
      </p>
      <div className="hero">
        <div><small>{_t('DPS')}</small><b className="num">{fmt(preview.calc.stats.firepower.dps)}</b></div>
        <div><small>{_t('EHP')}</small><b className="num">{fmt(preview.calc.stats.defense.ehp, 0)}</b></div>
        <div><small>{_t('Speed m/s')}</small><b className="num">{fmt(preview.calc.stats.navigation.maxVelocity, 0)}</b></div>
      </div>
      <p className="fit-inset fit-caption num">
        {_t('CPU')} {fmt(resources.cpu.used)}/{fmt(resources.cpu.total)} ·{' '}
        {_t('Powergrid')} {fmt(resources.powergrid.used)}/{fmt(resources.powergrid.total)} ·{' '}
        {_t('Calibration')} {fmt(resources.calibration.used)}/{fmt(resources.calibration.total)}
      </p>
      <div className="import-actions fit-inset">
        <button type="button" className="fit-button primary" disabled={saving} onClick={() => void saveAndOpen()}>
          {_t('Save and open')}
        </button>
        <button type="button" className="fit-button" disabled={saving} onClick={openPreview}>
          {_t('View only without saving')}
        </button>
      </div>
    </FitSection>}
  </main>
}
