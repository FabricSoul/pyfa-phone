import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SLOT_KINDS, type CalcResult, type FitDoc, type ModulePos, type ModuleSlotRow, type SlotKind } from '../engine/types'
import { _t } from '../i18n/t'
import { NavBar } from '../ui/NavBar'
import { ResourceBar } from '../ui/ResourceGauge'
import { Tabs } from '../ui/Tabs'
import { ModuleRow } from '../ui/ModuleRow'
import { Icon } from '../ui/icons'
import { ExpandItem } from '../ui/motion'
import { FitBodySkeleton } from '../ui/PageSkeletons'
import { priceTotal, totalPriceItems, usePriceQuotes } from '../price/fitPrices'
import { calcOptions, updateSettings, useSettings } from '../settings/settings'
import { ActionSheet } from '../ui/ActionSheet'
import { CharacterPicker } from '../ui/pickers/CharacterPicker'
import { DamagePatternPicker } from '../ui/pickers/DamagePatternPicker'
import { TargetProfilePicker } from '../ui/pickers/TargetProfilePicker'
import { getPatternData } from '../ui/pickers/patterns'
import { StatsPage } from '../ui/StatsPage'
import { fmt, lname, renderUrl, useNameLanguage } from '../ui/format'
import { FitExtras } from './FitExtras'
import { useFitServices, useFitSession, useRemoveModules, withModules } from './fitSession'
import { ModuleSheet } from './ModuleSheet'
import { FitMenu } from './FitMenu'
import { FitSection, slotName } from './shared'

type View = 'slots' | 'stats' | 'extras'
const VIEWS: readonly View[] = ['slots', 'stats', 'extras']
const HINT_KEY = 'pyfa.hint.swipe'
const scrollKey = (id: string) => `pyfa.scroll.${id}`

function swipeHintSeen() {
  try { return localStorage.getItem(HINT_KEY) === '1' } catch { return true }
}
function markSwipeHintSeen() {
  try { localStorage.setItem(HINT_KEY, '1') } catch { /* the hint may show again; harmless */ }
}

export function Fit() {
  const language = useNameLanguage()
  const navigate = useNavigate()
  const { record, fit, result: calculated, removed, canUndo, undo, edit, includeReload } = useFitSession()
  const { engine, store } = useFitServices()
  const { preheatPercent } = useSettings()
  const [spoolPreview, setSpoolPreview] = useState<{
    fit: FitDoc; percent: number; includeReload: boolean; result: CalcResult; base?: CalcResult
  }>()
  const [spoolError, setSpoolError] = useState(false)
  const spoolRequest = useRef(0)
  const result = spoolPreview?.fit === fit && spoolPreview.percent === preheatPercent && spoolPreview.base === calculated && spoolPreview.includeReload === includeReload
    ? spoolPreview.result : calculated

  function changeSpoolDefault(percent: number) {
    if (percent === preheatPercent) return
    const request = ++spoolRequest.current
    updateSettings({ preheatPercent: percent })
    void engine.calc(fit, { ...calcOptions(), includeReload }).then((result) => {
      if (spoolRequest.current === request) {
        setSpoolPreview({ fit, percent, includeReload, result, base: calculated })
        setSpoolError(false)
      }
    }, () => { if (spoolRequest.current === request) setSpoolError(true) })
  }
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const view: View = VIEWS.find((candidate) => candidate === requested) ?? 'slots'
  const setView = (next: View) => setParams((previous) => {
    const updated = new URLSearchParams(previous)
    if (next === 'slots') updated.delete('view'); else updated.set('view', next)
    return updated
  }, { replace: true })
  const removeModules = useRemoveModules()
  const [showHint] = useState(() => !swipeHintSeen())
  const [selected, setSelected] = useState<ModulePos>()
  const [menu, setMenu] = useState(false)
  const path = `/fit/${record.id}`
  const quotes = usePriceQuotes(Object.values(result?.priceItems ?? {}).flat())
  const unitPrice = (typeId: number) => quotes ? quotes[typeId] ?? null : undefined
  const shipName = result?.ship.name ?? record.itemNames[fit.shipTypeId]
  const row = selected && result?.slots[selected.slot].find((candidate): candidate is ModuleSlotRow =>
    candidate.kind === 'module' && candidate.positions.includes(selected.index))
  const retired = new Map(removed.map((item) => [item.typeId, item]))

  // The swipe hint is shown once: it is remembered as soon as a fit with modules is on screen.
  const hasModules = Boolean(result && SLOT_KINDS.some((slot) => result.slots[slot].some((entry) => entry.kind === 'module')))
  useEffect(() => { if (showHint && hasModules) markSwipeHintSeen() }, [showHint, hasModules])

  // Coming back from "add module" / "variations" / item info: put the page back where it was.
  const scrollY = useRef(0)
  const restored = useRef(false)
  useEffect(() => {
    const onScroll = () => { scrollY.current = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    const id = record.id
    return () => {
      window.removeEventListener('scroll', onScroll)
      try { sessionStorage.setItem(scrollKey(id), String(scrollY.current)) } catch { /* optional */ }
    }
  }, [record.id])
  useEffect(() => {
    if (!result || restored.current) return
    restored.current = true
    try {
      const saved = Number(sessionStorage.getItem(scrollKey(record.id)))
      sessionStorage.removeItem(scrollKey(record.id))
      if (saved > 0) window.scrollTo(0, saved)
    } catch { /* optional */ }
  }, [record.id, result])

  function openAdd(slot: SlotKind, index: number) {
    navigate(`${path}/add/${slot}?index=${index}`)
  }

  const hotSlots = SLOT_KINDS.filter((slot) =>
    result?.slots[slot].some((entry) => entry.kind === 'module' && entry.state === 'overheated'))
  const heatedDps = result && hotSlots.length > 0 ? `${_t('DPS')} ${fmt(result.stats.firepower.dps)}` : undefined
  const subtitle = [shipName && lname(shipName, language), characterName(fit.character), heatedDps,
    ...hotSlots.map((slot) => _t('{slot} overheated').replace('{slot}', slotName(slot))),
  ].filter(Boolean).join(' · ')

  return <main>
    <NavBar title={fit.name} subtitle={subtitle} shipSrc={renderUrl(result?.ship.graphicId ?? null)}
      onShipClick={() => navigate(`/item/${fit.shipTypeId}?fit=${encodeURIComponent(record.id)}`)}
      canUndo={canUndo} onBack={() => { try { sessionStorage.removeItem(scrollKey(record.id)) } catch { /* optional */ } scrollY.current = 0; navigate('/') }} onUndo={undo} onMore={() => setMenu(true)} />
    {store.isTemporary(record.id) && <p className="page-message">{_t('Unsaved preview')}</p>}
    {result && <ResourceBar {...result.resources} />}
    <Tabs value={view} onChange={setView} label={_t('Fit view')} options={[
      { value: 'slots', label: _t('Slots') }, { value: 'stats', label: _t('Stats') }, { value: 'extras', label: _t('Extras') },
    ]} />
    {view === 'slots' && showHint && hasModules && <p className="hint swipe-hint" role="note">{_t('Swipe a module row left for offline and remove.')}</p>}
    {removed.length > 0 && <ul className="fit-retired">
      {removed.map((item) => <li key={item.typeId}>
        {_t('Item removed')} · {item.name ? lname(item.name, language) : item.typeId}
      </li>)}
    </ul>}
    {!result && !retired.has(fit.shipTypeId) && <FitBodySkeleton label={_t('Calculating fit…')} />}
    {view === 'slots' && result && <FitSetup result={result} />}
    {view === 'slots' && result && SLOT_KINDS.map((slot) => {
      const { total, used } = result.resources.slots[slot]
      const slotItems = fit.modules[slot]
      if (!total && !used && !slotItems.some(Boolean)) return null
      const heatable = result.slots[slot].flatMap((entry) => entry.kind === 'module' && entry.supportedStates?.includes('overheated')
        ? entry.positions.filter((index) => slotItems[index]?.typeId === entry.typeId) : [])
      const heated = heatable.length > 0 && heatable.every((index) => slotItems[index]?.state === 'overheated')
      const extra = slot === 'high' ? <>
        {_t('Turrets')} {fmt(result.resources.turretHardpoints.used)}/{fmt(result.resources.turretHardpoints.total)} · {' '}
        {_t('Launchers')} {fmt(result.resources.launcherHardpoints.used)}/{fmt(result.resources.launcherHardpoints.total)}
      </> : undefined
      return <FitSection key={slot} title={slotName(slot)} info={<span className="fit-rack-info">
        <span>
          {extra && <span className="fit-slot-detail">{extra} · </span>}
          <span className={used > total || slot === 'rig' && result.resources.calibration.used > result.resources.calibration.total ? 'warn' : undefined}>
            {fmt(used)}/{fmt(total)}
          </span>
        </span>
        <button className="rack-heat" type="button" role="switch" aria-checked={heated} disabled={!heatable.length}
          onClick={() => edit((fit) => withModules(fit, slot, heatable, (module) =>
            module && { ...module, state: heated ? 'active' : 'overheated' }))}>
          <Icon name="flame" /> {_t('Overheat rack')}
        </button>
      </span>}>
        <div className="list">
          {/* A module put in opens its row from zero height; one taken out closes it before it leaves. */}
          <AnimatePresence initial={false}>
          {result.slots[slot].map((entry) => {
            if (entry.kind === 'module') {
              const activePositions = entry.positions.filter((index) => slotItems[index]?.typeId === entry.typeId)
              if (!activePositions.length) return null
              return <ExpandItem key={`module-${entry.positions[0]}`}><ModuleRow row={entry} price={unitPrice(entry.typeId)}
                selected={selected?.slot === slot && activePositions.includes(selected.index)}
                availableStates={entry.supportedStates ?? (slot === 'rig' ? ['offline', 'online'] : undefined)}
                onTap={() => setSelected({ slot, index: activePositions[0]! })}
                onStateChange={(state) => edit((fit) => withModules(fit, slot, activePositions, (mod) => mod && { ...mod, state }))}
                onRemove={() => removeModules(slot, activePositions, lname(entry.name, language))} /></ExpandItem>
            }
            if (entry.kind === 'removed') {
              const positions = entry.positions.filter((index) => slotItems[index]?.typeId === entry.typeId)
              if (!positions.length) return null
              return <ExpandItem key={`removed-${positions[0]}`}><ModuleRow row={{ ...entry, positions, count: positions.length }}
                onRemove={() => removeModules(slot, positions, lname(entry.name, language))} /></ExpandItem>
            }
            const positions = entry.positions.filter((index) => !slotItems[index])
            if (!positions.length) return null
            return <ExpandItem key="empty"><ModuleRow row={{ ...entry, positions, count: positions.length }}
              onAdd={() => openAdd(slot, positions[0]!)} /></ExpandItem>
          })}
          </AnimatePresence>
          {slotItems.map((item, index) => {
            const removed = item && retired.get(item.typeId)
            if (!removed) return null
            return <div className="row warn" key={`retired-${index}`}>
              <span className="mn">{removed.name ? lname(removed.name, language) : removed.typeId}</span>
              <button type="button" className="fit-button" onClick={() => removeModules(slot, [index], removed.name ? lname(removed.name, language) : String(removed.typeId))}>{_t('Remove')}</button>
            </div>
          })}
        </div>
      </FitSection>
    })}
    {view === 'stats' && spoolError && <p role="alert" className="page-message warn">{_t('Could not recalculate fit')}</p>}
    {view === 'stats' && result && <FitStats result={result} quotes={quotes} onSpoolDefaultChange={changeSpoolDefault} />}
    {view === 'extras' && <FitExtras />}
    <ModuleSheet selected={selected} row={row} price={row && unitPrice(row.typeId)} onClose={() => setSelected(undefined)} />
    <FitMenu open={menu} onClose={() => setMenu(false)} />
    {!result && retired.has(fit.shipTypeId) && <Link className="fit-inset" to="/">{_t('Back to fittings')}</Link>}
  </main>
}

function characterName(character: FitDoc['character']) {
  return character === 'all5' ? _t('All V') : _t('All 0')
}

function FitSetup({ result }: { result: CalcResult }) {
  const language = useNameLanguage()
  const { fit, edit } = useFitSession()
  const [characterOpen, setCharacterOpen] = useState(false)
  const skills = result.missingSkills
  const modes = result.modes

  return <>
    <div className="fit-inset fit-setup">
      {modes && <label>
        <span className="fit-caption">{_t('Tactical mode')}</span>
        <select className="fit-input" value={modes.selected}
          onChange={(event) => {
            const modeTypeId = Number(event.currentTarget.value)
            const mode = modes.options.find((entry) => entry.typeId === modeTypeId)
            if (mode) edit((fit) => ({ ...fit, modeTypeId }), { [modeTypeId]: mode.name })
          }}>
          {modes.options.map((mode) => <option key={mode.typeId} value={mode.typeId}>{lname(mode.name, language)}</option>)}
        </select>
      </label>}
      <button type="button" className="fit-button" onClick={() => setCharacterOpen(true)}>
        {_t('Character')} · {characterName(fit.character)}
      </button>
      {skills && (skills.length > 0 ? <details>
        <summary className="fit-skill-summary warn">{_t('Missing skills')} <span className="num">{skills.length}</span></summary>
        <ul className="fit-skill-list">
          {skills.map((skill) => <li key={skill.typeId}>
            {lname(skill.name, language)} <span className="num">{skill.currentLevel}/{skill.requiredLevel}</span>
          </li>)}
        </ul>
      </details> : <span className="fit-caption fit-skill-good">{_t('Skill requirements met')}</span>)}
    </div>
    <ActionSheet open={characterOpen} title={_t('Character')} onClose={() => setCharacterOpen(false)}>
      <CharacterPicker value={fit.character} onPick={(character) => {
        if (character !== fit.character) edit((fit) => ({ ...fit, character }))
        setCharacterOpen(false)
      }} />
    </ActionSheet>
  </>
}

function FitStats({ result, quotes, onSpoolDefaultChange }: {
  result: CalcResult
  quotes: ReturnType<typeof usePriceQuotes>
  onSpoolDefaultChange: (percent: number) => void
}) {
  const language = useNameLanguage()
  const { fit, edit, includeReload, setIncludeReload } = useFitSession()
  const { preheatPercent, priceIncluded } = useSettings()
  const [picker, setPicker] = useState<'damage' | 'target'>()
  const { damagePatterns, targetProfiles } = getPatternData()
  const damage = damagePatterns.find(({ id }) => id === fit.damagePatternId)
  const target = targetProfiles.find(({ id }) => id === fit.targetProfileId)
  const items = result.priceItems
  const prices = quotes ? {
    ship: priceTotal(items.ship, quotes),
    fit: priceTotal(totalPriceItems(items, priceIncluded), quotes),
    lines: [
      { label: _t('Modules'), items: items.modules },
      { label: _t('Loaded charges'), items: items.loadedCharges },
      { label: _t('Drones'), items: items.drones },
      { label: _t('Fighters'), items: items.fighters },
      { label: _t('Cargo'), items: items.cargo },
      { label: _t('Implants'), items: items.implants },
      { label: _t('Boosters'), items: items.boosters },
    ].flatMap(({ label, items }) => items.length ? [{ label, value: priceTotal(items, quotes) ?? null }] : []),
  } : { pending: true }

  return <>
    {SLOT_KINDS.some((slot) => result.slots[slot].some((row) => row.kind === 'module' && row.maxSpoolCycles)) &&
      <label className="fit-inset fit-preheat">
        <span>{_t('Default preheat')} (%)</span>
        <input className="fit-input num" type="number" min={0} max={100} step={1}
          key={preheatPercent} defaultValue={preheatPercent}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber
            const percent = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : preheatPercent
            event.currentTarget.value = String(percent)
            onSpoolDefaultChange(percent)
          }} />
      </label>}
    <StatsPage result={result} prices={prices} settings={{
      damagePattern: damage && lname(damage.name, language),
      targetProfile: target && lname(target.name, language),
      damageRatios: damage,
      includeReload,
      onReloadChange: setIncludeReload,
      onDamagePattern: () => setPicker('damage'),
      onTargetProfile: () => setPicker('target'),
    }} />
    <ActionSheet open={picker !== undefined} title={picker === 'damage' ? _t('Damage pattern') : _t('Target profile')}
      onClose={() => setPicker(undefined)}>
      {picker === 'damage' && <DamagePatternPicker value={fit.damagePatternId} onPick={(damagePatternId) => {
        edit((fit) => ({ ...fit, damagePatternId }))
        setPicker(undefined)
      }} />}
      {picker === 'target' && <TargetProfilePicker value={fit.targetProfileId} onPick={(targetProfileId) => {
        edit((fit) => ({ ...fit, targetProfileId }))
        setPicker(undefined)
      }} />}
    </ActionSheet>
  </>
}
