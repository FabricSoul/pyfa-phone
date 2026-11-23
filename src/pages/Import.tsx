import '../ui/ui.css'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockEngine } from '../engine/mockClient'
import type { CalcResult, FitDoc } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { saveFit } from '../store/fits'
import { fmt, lname } from '../ui/format'

interface Preview {
  fit: FitDoc
  calc: CalcResult
  itemCount: number
}

const bigButton: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 44, margin: '8px 16px', borderRadius: 10, border: 0,
  background: 'var(--color-accent)', color: 'var(--color-surface)',
  font: '600 15px/20px var(--font-body)', cursor: 'pointer',
}
const secondaryButton: CSSProperties = {
  ...bigButton, background: 'var(--color-fill)', color: 'var(--color-text)',
}
const mono: CSSProperties = {
  margin: '4px 16px 8px', padding: '10px 12px', borderRadius: 'var(--radius-m)',
  background: 'var(--color-fill)', font: '400 12px/16px ui-monospace, Menlo, monospace',
  whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)', maxHeight: 150,
  overflow: 'hidden', boxSizing: 'border-box',
}

/** Paste an EFT/DNA fit, preview it, then either save-and-open or just look. */
export default function Import() {
  const uiLang = useUiLanguage()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')

  const onText = useCallback(async (value: string) => {
    setText(value)
    setPreview(null)
    setWarnings([])
    setError('')
    if (!value.trim()) return
    try {
      const imported = await mockEngine.importText(value)
      setWarnings(imported.warnings)
      const fit = imported.fits[0]
      if (!fit) return
      const calc = await mockEngine.calc(fit)
      const itemCount = Object.values(fit.modules).flat().filter((m) => m !== null).length
        + fit.drones.length + fit.cargo.length + fit.implants.length + fit.boosters.length
      setPreview({ fit, calc, itemCount })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      navigator.clipboard.readText()
        .then((clip) => {
          if (clip && clip.trim()) void onText(clip)
        })
        .catch(() => {
          // Clipboard read failed or permission denied: user can use manual paste.
        })
    }
  }, [onText])

  const pasteClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const clip = await navigator.clipboard.readText()
        if (clip) void onText(clip)
      }
    } catch {
      // Ignored
    }
  }

  async function saveAndOpen() {
    if (!preview) return
    const id = await saveFit(preview.fit)
    navigate(`/fit/${id}`)
  }

  const r = preview?.calc.resources
  const fitLine = r
    ? `${_t('Fits')}: CPU ${fmt(r.cpu.used)}/${fmt(r.cpu.total)} · ${_t('powergrid')} ${fmt(r.powergrid.used)}/${fmt(r.powergrid.total)} · ${_t('calibration')} ${fmt(r.calibration.used)}/${fmt(r.calibration.total)}`
    : ''

  return (
    <main>
      <div className="nav"><div className="tt"><b>{_t('Import')}</b><small>{_t('Paste fit text to preview')}</small></div></div>

      <div style={{ margin: '0 16px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button type="button" onClick={() => void pasteClipboard()}
            style={{
              background: 'transparent', border: '1px solid var(--color-separator)',
              borderRadius: 'var(--radius-s)', padding: '4px 8px', fontSize: 12,
              color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}>
            {_t('Paste from clipboard')}
          </button>
        </div>
        <textarea
          aria-label={_t('Paste fit text')}
          value={text}
          onChange={(event) => void onText(event.target.value)}
          placeholder={_t('Paste fit text here')}
          rows={6}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 10,
            borderRadius: 'var(--radius-m)', border: '1px solid var(--color-separator)',
            background: 'var(--color-surface)', color: 'var(--color-text)',
            font: '400 12px/16px var(--font-num)',
          }}
        />
      </div>

      {error && <div className="hint warn">{error}</div>}
      {warnings.map((warning) => <div className="hint warn" key={warning}>{warning}</div>)}

      {preview && (
        <>
          <div className="row" style={{ paddingTop: 0 }}>
            <div className="mn">
              <span>{_t('Recognized as EFT fit')}</span>
              <small>{lname(preview.calc.ship.name, uiLang)} · {preview.itemCount} {_t('items recognized')}</small>
            </div>
          </div>
          <div style={mono}>{text.split('\n').slice(1).join('\n')}</div>
          <div className="hero">
            <div><small>{_t('DPS')}</small><b className="num">{fmt(preview.calc.stats.firepower.dps)}</b></div>
            <div><small>{_t('EHP')}</small><b className="num">{fmt(preview.calc.stats.defense.ehp, 0)}</b></div>
            <div><small>{_t('Speed m/s')}</small><b className="num">{fmt(preview.calc.stats.navigation.maxVelocity, 0)}</b></div>
          </div>
          <div className="hint">{fitLine}</div>
          <button type="button" style={bigButton} onClick={() => void saveAndOpen()}>{_t('Save and open')}</button>
          <button type="button" style={secondaryButton} onClick={() => navigate('/')}>{_t('View only without saving')}</button>
        </>
      )}
    </main>
  )
}
