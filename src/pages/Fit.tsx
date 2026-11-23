import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SLOT_KINDS, type ModulePos, type ModuleSlotRow, type SlotKind } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { NavBar } from '../ui/NavBar'
import { ResourceBar } from '../ui/ResourceGauge'
import { Segmented } from '../ui/Segmented'
import { ModuleRow } from '../ui/ModuleRow'
import { StatsPage } from '../ui/StatsPage'
import { fmt, lname, renderUrl } from '../ui/format'
import { FitExtras } from './FitExtras'
import { useFitSession, withModules } from './fitSession'
import { ModuleSheet } from './ModuleSheet'
import { FitMenu } from './FitMenu'
import { FitSection, slotName } from './shared'

type View = 'slots' | 'stats' | 'extras'

export function Fit() {
  const language = useUiLanguage()
  const navigate = useNavigate()
  const { record, fit, result, removed, canUndo, undo, edit } = useFitSession()
  const [view, setView] = useState<View>('slots')
  const [selected, setSelected] = useState<ModulePos>()
  const [menu, setMenu] = useState(false)
  const path = `/fit/${record.id}`
  const shipName = result?.ship.name ?? record.itemNames[fit.shipTypeId]
  const row = selected && result?.slots[selected.slot].find((candidate): candidate is ModuleSlotRow =>
    candidate.kind === 'module' && candidate.positions.includes(selected.index))
  const retired = new Map(removed.map((item) => [item.typeId, item]))

  function openAdd(slot: SlotKind, index: number) {
    navigate(`${path}/add/${slot}?index=${index}`)
  }

  return <main>
    <NavBar title={fit.name} subtitle={shipName && lname(shipName, language)} shipSrc={renderUrl(result?.ship.graphicId ?? null)}
      canUndo={canUndo} onBack={() => navigate('/')} onUndo={undo} onMore={() => setMenu(true)} />
    {result && <ResourceBar {...result.resources} />}
    <Segmented value={view} onChange={setView} options={[
      { value: 'slots', label: _t('Slots') }, { value: 'stats', label: _t('Stats') }, { value: 'extras', label: _t('Extras') },
    ]} />
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
                passive={entry.supportedStates ? !entry.supportedStates.includes('active') : slot === 'rig'}
                onTap={() => setSelected({ slot, index: activePositions[0]! })}
                onStateChange={(state) => edit((fit) => withModules(fit, slot, activePositions, (mod) => mod && { ...mod, state }))}
                onRemove={() => edit((fit) => withModules(fit, slot, activePositions, () => null))} />
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
              <button type="button" className="fit-button" onClick={() => edit((fit) => withModules(fit, slot, [index], () => null))}>{_t('Remove')}</button>
            </div>
          })}
        </div>
      </FitSection>
    })}
    {view === 'stats' && result && <StatsPage result={result} />}
    {view === 'extras' && <FitExtras />}
    <ModuleSheet selected={selected} row={row} onClose={() => setSelected(undefined)} />
    <FitMenu open={menu} onClose={() => setMenu(false)} />
    {!result && retired.has(fit.shipTypeId) && <Link className="fit-inset" to="/">{_t('Back to fittings')}</Link>}
  </main>
}
