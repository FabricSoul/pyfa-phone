import '../ui/ui.css'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { _t, setUiLanguage, useUiLanguage, type UiLanguage } from '../i18n/t'
import {
  getItemNameLanguage, updateSettings, useSettings,
  type Appearance, type CharacterId, type ItemNameLanguage, type PriceItem,
} from '../settings/settings'
import { applyAppearance } from '../settings/appearance'
import { Link } from 'react-router-dom'
import { listFits, parseBackup, restoreFits, type BackupProblem } from '../store/fits'
import type { FitDoc } from '../engine/types'
import { useToast } from '../ui/Toast'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { Segmented } from '../ui/Segmented'
import { PageHeading } from './shared'
import { CharacterPicker } from '../ui/pickers/CharacterPicker'
import { DamagePatternPicker } from '../ui/pickers/DamagePatternPicker'
import { getPatternData, labelOf } from '../ui/pickers/patterns'

type Sheet = 'restore' | 'exportText' | 'theme' | 'uiLanguage' | 'itemName' | 'character' | 'damage' | 'priceIncluded' | null

// 弹窗的可访问名称，和对应设置行的标签一致。
function sheetTitle(sheet: Sheet): string {
  switch (sheet) {
    case 'theme': return _t('Theme')
    case 'uiLanguage': return _t('Interface language')
    case 'itemName': return _t('Item names')
    case 'character': return _t('Character')
    case 'damage': return _t('Damage pattern')
    case 'priceIncluded': return _t('Total price includes')
    case 'restore': return _t('Restore from backup')
    case 'exportText': return _t('Export all fits backup')
    default: return _t('Settings')
  }
}

const sectionStyle: CSSProperties = {
  padding: '18px 16px 6px', font: '600 12px/16px var(--font-body)',
  color: 'var(--color-text-secondary)',
}
const Section = ({ children }: { children: string }) => (
  <div className="sh" role="presentation" style={sectionStyle}>{children}</div>
)

/** Static msgids so `pnpm i18n` can extract them. */
function priceLabel(item: PriceItem): string {
  if (item === 'drones') return _t('Drones')
  if (item === 'cargo') return _t('Cargo')
  return _t('Implants')
}

function Row({ label, value, name, onClick }: {
  label: string; value?: string; name?: string; onClick?: () => void
}) {
  return (
    <button type="button" className="row" aria-label={name ?? label} onClick={onClick}
      style={{ width: '100%', border: 0, textAlign: 'left' }}>
      <div className="mn"><span style={{ fontSize: 15 }}>{label}</span></div>
      {value !== undefined && <span className="settings-value">{value}</span>}
      <span style={{ color: 'var(--color-text-secondary)' }}>›</span>
    </button>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="row" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)} style={{ width: '100%', border: 0, textAlign: 'left' }}>
      <div className="mn"><span style={{ fontSize: 15 }}>{label}</span></div>
      <span aria-hidden="true" style={{
        width: 44, height: 26, borderRadius: 13, flex: 'none',
        background: checked ? 'var(--color-accent)' : 'var(--color-fill)', position: 'relative',
      }}>
        <i style={{
          position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 10,
          background: 'var(--color-surface)', [checked ? 'right' : 'left']: 3,
        } as CSSProperties} />
      </span>
    </button>
  )
}

const valueOf = (sheet: Sheet, s: ReturnType<typeof useSettings>): string | undefined => {
  switch (sheet) {
    case 'theme':
      return s.appearance === 'system' ? _t('Follow system') : s.appearance === 'dark' ? _t('Dark') : _t('Light')
    case 'uiLanguage':
      return s.uiLanguage === 'zh_CN' ? '简体中文' : s.uiLanguage === 'en_US' ? 'English' : _t('Follow system')
    case 'itemName':
      return getItemNameLanguage() === 'zh' ? _t('中文') : 'English'
    case 'character':
      return s.defaultCharacter === 'all5' ? _t('All V') : _t('All 0')
    case 'damage': {
      const row = getPatternData().damagePatterns.find((p) => p.id === s.defaultDamagePatternId)
      return row ? labelOf(row.name, s.itemNameLanguage) : undefined
    }
    default:
      return undefined
  }
}

/** Settings screen: appearance/language, defaults, calculation toggles, data and legal notice. */
export default function Settings() {
  const uiLang = useUiLanguage()
  const settings = useSettings()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [dataVersion, setDataVersion] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [pending, setPending] = useState<{ fits: FitDoc[]; existing: number }>()
  const [exportJson, setExportJson] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/data/manifest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest: { dataVersion?: string } | null) => {
        if (alive && manifest?.dataVersion) setDataVersion(manifest.dataVersion)
      })
      .catch(() => { /* offline: leave the version blank */ })
    return () => { alive = false }
  }, [])

  function pickAppearance(value: Appearance) {
    updateSettings({ appearance: value })
    applyAppearance(value)
    setSheet(null)
  }

  function pickUiLanguage(value: UiLanguage) {
    updateSettings({ uiLanguage: value })
    void setUiLanguage(value)
    setSheet(null)
  }

  async function backup() {
    const json = JSON.stringify(await listFits(), null, 2)
    const file = new File([json], 'pyfa-fits.json', { type: 'application/json' })
    // 1. Web Share API with a file (the only reliable route on iOS Safari).
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'pyfa-fits.json' })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return // user cancelled
      }
    }
    // 2. A download link.
    if ('download' in HTMLAnchorElement.prototype) {
      try {
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        link.download = 'pyfa-fits.json'
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
      } catch { /* fall through */ }
    }
    // 3. Copyable text.
    setExportJson(json)
    setSheet('exportText')
  }

  function problemText(problem: BackupProblem, index?: number): string {
    switch (problem) {
      case 'json': return _t('The file is not valid JSON.')
      case 'notArray': return _t('The file is not a list of fits.')
      case 'empty': return _t('The file contains no fits.')
      default: return `${_t('A fit in the file is invalid:')} #${(index ?? 0) + 1}`
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return
    let text: string
    try { text = await file.text() } catch {
      toast.show({ message: `${_t('Backup rejected')}: ${_t('The file could not be read.')}` })
      return
    }
    const parsed = parseBackup(text)
    if (!parsed.ok) {
      toast.show({ message: `${_t('Backup rejected')}: ${problemText(parsed.problem, parsed.index)}` })
      return
    }
    setPending({ fits: parsed.fits, existing: (await listFits()).length })
    setSheet('restore')
  }

  async function confirmRestore(mode: 'replace' | 'merge') {
    const fits = pending?.fits
    setSheet(null)
    setPending(undefined)
    if (!fits) return
    try {
      await restoreFits(fits, mode)
      toast.show({ message: _t('Backup restored: {n} fits').replace('{n}', String(fits.length)) })
    } catch {
      toast.show({ message: _t('Restore failed. Your existing fits were not changed.') })
    }
  }

  const title = _t('Settings')

  return (
    <main>
      <PageHeading back="/" historyBack title={title} />

      <Section>{_t('Appearance & language')}</Section>
      <div className="list">
        <Row label={_t('Theme')} name={_t('Theme')} value={valueOf('theme', settings)} onClick={() => setSheet('theme')} />
        <Row label={_t('Interface language')} name={_t('Interface language')}
          value={valueOf('uiLanguage', settings)} onClick={() => setSheet('uiLanguage')} />
        <Row label={_t('Item names')} name={_t('Item names')} value={valueOf('itemName', settings)}
          onClick={() => setSheet('itemName')} />
      </div>

      <Section>{_t('New fit defaults')}</Section>
      <div className="list">
        <Row label={_t('Character')} name={_t('Character')} value={valueOf('character', settings)}
          onClick={() => setSheet('character')} />
        <Row label={_t('Damage pattern')} name={_t('Damage pattern')} value={valueOf('damage', settings)}
          onClick={() => setSheet('damage')} />
        <Toggle label={_t('Use character implants')} checked={settings.useCharacterImplants}
          onChange={(v) => updateSettings({ useCharacterImplants: v })} />
      </div>

      <Section>{_t('Calculation')}</Section>
      <div className="list">
        <Toggle label={_t('Consider reload')} checked={settings.considerReload}
          onChange={(v) => updateSettings({ considerReload: v })} />
        <Toggle label={_t('Consider reboot')} checked={settings.considerReboot}
          onChange={(v) => updateSettings({ considerReboot: v })} />
        <Toggle label={_t('Strict skill requirements')} checked={settings.strictSkills}
          onChange={(v) => updateSettings({ strictSkills: v })} />
        <Row label={_t('Default preheat')} name={_t('Default preheat')} value={`${settings.preheatPercent}%`} />
      </div>

      <Section>{_t('Price')}</Section>
      <div className="list">
        <Row label={_t('Source')} name={_t('Source')} value={_t('fuzzwork · Jita')} />
        <Row label={_t('Total price includes')} name={_t('Total price includes')}
          value={settings.priceIncluded.map(priceLabel).join(', ') || '—'}
          onClick={() => setSheet('priceIncluded')} />
      </div>

      <Section>{_t('Data')}</Section>
      <div className="list">
        <Row label={_t('Export all fits backup')} name={_t('Export all fits backup')} onClick={backup} />
        <Row label={_t('Restore from backup')} name={_t('Restore from backup')} onClick={() => fileRef.current?.click()} />
        <Row label={_t('Game data version')} name={_t('Game data version')} value={dataVersion || undefined} />
      </div>
      <input ref={fileRef} type="file" accept="application/json" hidden
        onChange={(event) => { void restore(event.target.files?.[0]); event.target.value = '' }} />

      <div className="hint" style={{ paddingTop: 12 }}>
        <p>{_t('pyfa-phone is an unofficial EVE Online fitting tool.')}</p>
        <p>{_t('This application is not affiliated with, endorsed by, or associated with CCP hf.')}</p>
        <p>{_t('EVE Online, the EVE logo, and all associated logos and designs are the intellectual property of CCP hf.')}</p>
        <p>{_t('Based on pyfa under the GPLv3 license. Non-commercial fan project.')}</p>
        <p>
          <a href="https://github.com/FabricSoul/pyfa-phone">{_t('pyfa-phone')}</a>{' · '}
          <Link to="/about">{_t('About')}</Link>
        </p>
      </div>

      <ActionSheet open={sheet !== null} title={sheetTitle(sheet)} onClose={() => setSheet(null)}>
        {sheet === 'restore' && pending && (
          <>
            <div className="row" style={{ paddingTop: 0 }}><div className="mn">
              <span>{_t('This will replace {n} fits with the {m} fits in the file.')
                .replace('{n}', String(pending.existing)).replace('{m}', String(pending.fits.length))}</span>
            </div></div>
            <SheetAction onClick={() => void confirmRestore('replace')}>
              {_t('Replace {n} fits').replace('{n}', String(pending.existing))}
            </SheetAction>
            <SheetAction onClick={() => void confirmRestore('merge')}>{_t('Merge (keep existing)')}</SheetAction>
            <SheetAction onClick={() => { setSheet(null); setPending(undefined) }}>{_t('Cancel')}</SheetAction>
          </>
        )}
        {sheet === 'exportText' && (
          <textarea className="fit-input" readOnly rows={10} value={exportJson} aria-label={_t('Backup JSON, copy it and save it')}
            onFocus={(event) => event.currentTarget.select()} style={{ width: '100%', fontSize: 16 }} />
        )}
        {sheet === 'theme' && (
          <>
            <div className="row" style={{ paddingTop: 0 }}><div className="mn"><span>{_t('Theme')}</span></div></div>
            <Segmented<Appearance>
              options={[
                { value: 'system', label: _t('Follow system') },
                { value: 'light', label: _t('Light') },
                { value: 'dark', label: _t('Dark') },
              ]}
              value={settings.appearance} onChange={pickAppearance}
            />
          </>
        )}
        {sheet === 'uiLanguage' && (
          <>
            <div className="row" style={{ paddingTop: 0 }}><div className="mn"><span>{_t('Interface language')}</span></div></div>
            <Segmented<UiLanguage>
              options={[{ value: 'en_US', label: 'English' }, { value: 'zh_CN', label: '简体中文' }]}
              value={uiLang} onChange={pickUiLanguage}
            />
          </>
        )}
        {sheet === 'itemName' && (
          <>
            <div className="row" style={{ paddingTop: 0 }}><div className="mn"><span>{_t('Item names')}</span></div></div>
            <Segmented<ItemNameLanguage>
              options={[{ value: 'zh', label: _t('中文') }, { value: 'en', label: 'English' }]}
              value={getItemNameLanguage()} onChange={(v) => { updateSettings({ itemNameLanguage: v }); setSheet(null) }}
            />
          </>
        )}
        {sheet === 'character' && (
          <CharacterPicker value={settings.defaultCharacter}
            onPick={(id: CharacterId) => { updateSettings({ defaultCharacter: id }); setSheet(null) }} />
        )}
        {sheet === 'damage' && (
          <DamagePatternPicker value={settings.defaultDamagePatternId}
            onPick={(id) => { updateSettings({ defaultDamagePatternId: id }); setSheet(null) }} />
        )}
        {sheet === 'priceIncluded' && (
          <>
            <div className="row" style={{ paddingTop: 0 }}><div className="mn"><span>{_t('Total price includes')}</span></div></div>
            {(['drones', 'cargo', 'implants'] as const).map((item) => (
              <Toggle key={item} label={priceLabel(item)}
                checked={settings.priceIncluded.includes(item)}
                onChange={(on) => updateSettings({
                  priceIncluded: on
                    ? [...settings.priceIncluded, item]
                    : settings.priceIncluded.filter((p) => p !== item),
                })} />
            ))}
          </>
        )}
      </ActionSheet>
    </main>
  )
}
