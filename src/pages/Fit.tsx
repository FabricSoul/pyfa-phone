import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SLOT_KINDS, type CalcResult, type ModulePos, type ModuleSlotRow, type SlotKind } from '../engine/types'
import { _t } from '../i18n/t'
import { NavBar } from '../ui/NavBar'
import { ResourceBar } from '../ui/ResourceGauge'
import { Tabs } from '../ui/Tabs'
import { ModuleRow } from '../ui/ModuleRow'
import { priceTotal, totalPriceItems, usePriceQuotes } from '../price/fitPrices'
import { updateSettings, useSettings } from '../settings/settings'
import { ActionSheet } from '../ui/ActionSheet'
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
  const { record, fit, result, removed, canUndo, undo, edit } = useFitSession()
  const { store } = useFitServices()
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

  return <main>
    <NavBar title={fit.name} subtitle={shipName && lname(shipName, language)} shipSrc={renderUrl(result?.ship.graphicId ?? null)}
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
    {!result && !retired.has(fit.shipTypeId) && <p role="status" className="page-message">{_t('Calculating fit…')}</p>}
    {view === 'slots' && result && SLOT_KINDS.map((slot) => {
      const { total, used } = result.resources.slots[slot]
      const slotItems = fit.modules[slot]
      if (!total && !used && !slotItems.some(Boolean)) return null
      const extra = slot === 'high' ? <>
        {_t('Turrets')} {fmt(result.resources.turretHardpoints.used)}/{fmt(result.resources.turretHardpoints.total)} · {' '}
        {_t('Launchers')} {fmt(result.resources.launcherHardpoints.used)}/{fmt(result.resources.launcherHardpoints.total)}
      </> : undefined
      return <FitSection key={slot} title={slotName(slot)} info={<>
        {extra && <span className="fit-slot-detail">{extra} · </span>}
        <span className={used > total || slot === 'rig' && result.resources.calibration.used > result.resources.calibration.total ? 'warn' : undefined}>
          {fmt(used)}/{fmt(total)}
        </span>
      </>}>
        <div className="list">
          {result.slots[slot].map((entry) => {
            if (entry.kind === 'module') {
              const activePositions = entry.positions.filter((index) => slotItems[index]?.typeId === entry.typeId)
              if (!activePositions.length) return null
              return <ModuleRow key={`module-${entry.positions[0]}`} row={entry}
                availableStates={entry.supportedStates ?? (slot === 'rig' ? ['offline', 'online'] : undefined)}
                onTap={() => setSelected({ slot, index: activePositions[0]! })}
                onStateChange={(state) => edit((fit) => withModules(fit, slot, activePositions, (mod) => mod && { ...mod, state }))}
                onRemove={() => removeModules(slot, activePositions, lname(entry.name, language))} />
            }
            if (entry.kind === 'removed') {
              const positions = entry.positions.filter((index) => slotItems[index]?.typeId === entry.typeId)
              if (!positions.length) return null
              return <ModuleRow key={`removed-${positions[0]}`} row={{ ...entry, positions, count: positions.length }}
                onRemove={() => removeModules(slot, positions, lname(entry.name, language))} />
            }
            const positions = entry.positions.filter((index) => !slotItems[index])
            if (!positions.length) return null
            return <ModuleRow key="empty" row={{ ...entry, positions, count: positions.length }}
              onAdd={() => openAdd(slot, positions[0]!)} />
          })}
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
    {view === 'stats' && result && <FitStats result={result} />}
    {view === 'extras' && <FitExtras />}
    <ModuleSheet selected={selected} row={row} onClose={() => setSelected(undefined)} />
    <FitMenu open={menu} onClose={() => setMenu(false)} />
    {!result && retired.has(fit.shipTypeId) && <Link className="fit-inset" to="/">{_t('Back to fittings')}</Link>}
  </main>
}

function FitStats({ result }: { result: CalcResult }) {
  const language = useNameLanguage()
  const { fit, edit } = useFitSession()
  const { considerReload, priceIncluded } = useSettings()
  const [picker, setPicker] = useState<'damage' | 'target'>()
  const { damagePatterns, targetProfiles } = getPatternData()
  const damage = damagePatterns.find(({ id }) => id === fit.damagePatternId)
  const target = targetProfiles.find(({ id }) => id === fit.targetProfileId)
  const items = result.priceItems
  const quotes = usePriceQuotes(Object.values(items).flat())
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
    <StatsPage result={result} prices={prices} settings={{
      damagePattern: damage && lname(damage.name, language),
      targetProfile: target && lname(target.name, language),
      includeReload: considerReload,
      onReloadChange: (includeReload) => updateSettings({ considerReload: includeReload }),
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
