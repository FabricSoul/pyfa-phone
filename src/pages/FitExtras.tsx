import '../ui/extras.css'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FIGHTER_KINDS, type CalcResult, type ExtraCollection, type FighterKind, type FitDoc } from '../engine/types'
import { _t } from '../i18n/t'
import { useSettings } from '../settings/settings'
import { DroneStackSheet } from '../ui/DroneStackSheet'
import { ExtraQuantity } from '../ui/ExtraQuantity'
import { ImplantSetPicker } from '../ui/ImplantSetPicker'
import { ExtraItemIcon } from '../ui/ExtraItemIcon'
import { fmt, lname, useNameLanguage } from '../ui/format'
import { removedMessage, useToast } from '../ui/Toast'
import { ExtraItemPicker, extraAddLabel } from './ExtraItemPicker'
import { FitNotes } from './FitNotes'
import { useFitServices, useFitSession } from './fitSession'
import { EmptyMessage, FitSection } from './shared'

type Entry = NonNullable<FitDoc[ExtraCollection]>[number]
type Sheet = { kind: 'pick'; collection: ExtraCollection } | { kind: 'implantSet' }
  | { kind: 'split' | 'merge'; index: number }

export function FitExtras() {
  const language = useNameLanguage()
  const { engine } = useFitServices()
  const { fit, record, result, edit, removed } = useFitSession()
  const { useCharacterImplants } = useSettings()
  const toast = useToast()
  const [sheet, setSheet] = useState<Sheet>()
  const closeSheet = () => setSheet(undefined)
  const { cargo, droneBay, fighterBay, fighterTubes, droneBandwidth, activeDrones } = result?.resources ?? {}
  const details = result?.extras?.items ?? {}
  const cargoCapacity = result?.extras?.cargoCapacity ?? cargo?.total
  const retiredIds = new Set(removed.map((entry) => entry.typeId))
  const drones = droneActivation(fit, result)
  const droneStats = new Map(result?.squadrons?.drones.map((row) => [row.typeId, row]))
  const fighterStats = new Map(result?.squadrons?.fighters.map((row) => [row.typeId, row]))
  const fighterSlots = result?.squadrons?.fighterSlots
  let tubes = fighterTubes?.total ?? 0
  const fighters = (fit.fighters ?? []).map((entry) => {
    const stats = fighterStats.get(entry.typeId)
    if (!stats) return undefined
    const active = entry.active && entry.amount > 0 && tubes > 0
    if (active) tubes--
    return { ...stats, active }
  })
  const inactiveDrones = drones.length > 0 && drones.every(({ active }) => active === 0)
  const canActivateDrones = drones.some(({ maximum }) => maximum > 0)
  const usesFitImplants = fit.implantSource === undefined ? !useCharacterImplants : fit.implantSource === 'fit'
  const canApplySet = fit.implants.every((id) => details[id]?.slot !== undefined || retiredIds.has(id))
  const headings = {
    cargo: _t('Cargo'), drones: _t('Drones'), fighters: _t('Fighters'), implants: _t('Implants'), boosters: _t('Boosters'),
  }

  function itemName(typeId: number) {
    const item = record.itemNames[typeId]
    return item ? lname(item, language) : String(typeId)
  }

  function cargoRoom(current: FitDoc) {
    if (cargoCapacity === undefined) return 0
    let used = 0
    for (const entry of current.cargo) {
      if (retiredIds.has(entry.typeId)) continue
      const unit = details[entry.typeId]?.volume
      if (unit === undefined) return 0
      used += unit * Math.max(0, entry.amount)
    }
    // Dogma volumes include fractions such as 0.0025 m³. Allow rounding error at an exact boundary.
    const epsilon = Number.EPSILON * Math.max(used, cargoCapacity) * 4
    return Math.max(0, cargoCapacity - used + epsilon)
  }

  const freeCargo = cargoRoom(fit)

  function row(collection: ExtraCollection, entry: Entry, index: number) {
    const typeId = typeof entry === 'number' ? entry : entry.typeId
    const item = details[typeId]
    const label = itemName(typeId)
    const retired = retiredIds.has(typeId)
    const quantity = typeof entry === 'number' ? undefined : entry.amount
    const drone = collection === 'drones' ? drones.find((row) => row.index === index) : undefined
    const droneInfo = collection === 'drones' ? droneStats.get(typeId) : undefined
    const fighter = collection === 'fighters' ? fighters[index] : undefined
    const cargoStack = !retired && collection === 'cargo'
    const unit = cargoStack ? item?.volume : undefined
    const controlled = cargoStack || drone !== undefined || fighter !== undefined
    const enabledEffects = fit.boosterSideEffects?.[typeId] ?? []

    function description(): ReactNode {
      if (unit !== undefined && quantity !== undefined) {
        const total = unit * quantity
        return _t('{unit} m³ each · {total} m³ total')
          .replace('{unit}', fmt(unit, 4)).replace('{total}', fmt(total, 4))
      }
      const performance = droneInfo ?? fighter
      if (performance) {
        const range = droneInfo && (droneInfo.optimalRange > 0 || droneInfo.falloff > 0)
          ? `${_t('Range')} ${fmt(droneInfo.optimalRange)}${droneInfo.falloff > 0 ? ` + ${fmt(droneInfo.falloff)}` : ''} ${_t('m')} · `
          : ''
        return `${range}${_t('Speed')} ${fmt(performance.velocity)} ${_t('m/s')} · ${fmt(performance.hp)} ${_t('HP')}`
      }
      if (item?.slot !== undefined) return _t('Slot {n}').replace('{n}', fmt(item.slot))
      return null
    }

    function changeAmount(amount: number) {
      edit((current) => {
        if (collection === 'cargo') return {
          ...current, cargo: current.cargo.map((entry, i) => i === index ? { ...entry, amount } : entry),
        }
        if (collection === 'drones') return {
          ...current,
          drones: current.drones.map((entry, i) => i === index
            ? { ...entry, amount, active: Math.min(entry.active, amount) } : entry),
        }
        return {
          ...current, fighters: current.fighters?.map((entry, i) => i === index ? { ...entry, amount } : entry),
        }
      })
    }

    const stats = description()
    return <li className={controlled ? 'fit-squadron' : 'fit-squadron extra-plain'} key={`${typeId}-${index}`}>
      <div className="extra-title fit-squadron-title">
        <ExtraItemIcon collection={collection} details={item} />
        <div>
          {retired ? <span className="warn">{label} · {_t('Item removed')}</span> :
            <Link to={`/item/${typeId}?fit=${encodeURIComponent(record.id)}`}>{label}</Link>}
          {!controlled && quantity !== undefined && <span className="fit-caption num"> ×{fmt(quantity)}</span>}
          {stats && <p className="fit-caption num extra-description">{stats}</p>}
        </div>
      </div>
      {controlled && <ExtraQuantity label={_t('Quantity')} item={label}
        value={fighter ? Math.min(quantity ?? 1, fighter.maxAmount) : quantity ?? 1}
        min={1} max={fighter?.maxAmount} suffix={fighter && `/${fmt(fighter.maxAmount)}`}
        editable={cargoStack} onChange={changeAmount} />}
      {drone && <ExtraQuantity label={_t('Active')} item={label} value={drone.active}
        min={0} max={drone.maximum} onChange={(active) => edit((current) => ({
          ...current,
          drones: current.drones.map((entry, i) => i === index ? { ...entry, active } : entry),
        }))} />}
      {fighter && <button type="button" className="fit-button" role="switch" aria-checked={fighter.active}
        aria-label={_t('Activate {item}').replace('{item}', label)}
        disabled={!fighter.active && tubes <= 0}
        onClick={() => edit((current) => ({
          ...current,
          fighters: current.fighters?.map((entry, i) => i === index ? { ...entry, active: !fighter.active } : entry),
        }))}>{fighter.active ? _t('Active') : _t('Inactive')}</button>}
      {collection === 'boosters' && !retired && item?.sideEffects && item.sideEffects.length > 0 && (
        <div className="extra-side-effects">
          <h3 className="fit-caption">{_t('Side Effects')}</h3>
          {item.sideEffects.map((effect) => (
            <button key={effect.id} type="button" className="fit-button" role="switch"
              aria-checked={enabledEffects.includes(effect.id)}
              onClick={() => edit((current) => {
                const enabled = new Set(current.boosterSideEffects?.[typeId])
                if (!enabled.delete(effect.id)) enabled.add(effect.id)
                return withBoosterEffects(current, typeId, [...enabled])
              })}>
              {lname(effect.name, language)} <span className="num">{fmt(effect.percent)}%</span>
            </button>
          ))}
        </div>
      )}
      <div className="extra-actions">
        {unit !== undefined && unit > 0 && <button type="button" className="fit-button"
          disabled={freeCargo < unit}
          onClick={() => edit((current) => {
            const extra = Math.floor(cargoRoom(current) / unit)
            return extra > 0 ? {
              ...current, cargo: current.cargo.map((stack, i) => i === index ? { ...stack, amount: stack.amount + extra } : stack),
            } : current
          })}>{_t('Fill cargo')}</button>}
        {drone && <>
          {drone.amount > 1 && <button type="button" className="fit-button"
            onClick={() => setSheet({ kind: 'split', index })}>{_t('Split stack')}</button>}
          {fit.drones.some((stack, i) => i !== index && stack.typeId === typeId) && (
            <button type="button" className="fit-button" onClick={() => setSheet({ kind: 'merge', index })}>{_t('Merge stacks')}</button>
          )}
        </>}
        <button type="button" className="fit-button" onClick={() => {
          edit((current) => {
            const next = remove(current, collection, index)
            return collection === 'boosters' && !next.boosters.includes(typeId) ? withBoosterEffects(next, typeId, []) : next
          })
          toast.show({
            message: removedMessage(label, 1),
            actionLabel: _t('Undo'),
            onAction: () => edit((current) => {
              const next = restore(current, collection, index, entry)
              return collection === 'boosters' && !current.boosters.includes(typeId)
                ? withBoosterEffects(next, typeId, enabledEffects) : next
            }),
          })
        }}>{_t('Remove')}</button>
      </div>
    </li>
  }

  function items(collection: ExtraCollection) {
    const list = fit[collection] ?? []
    if (collection === 'fighters' && fighterSlots && (fighterBay?.total || list.length)) {
      const unclassified = list.flatMap((entry, index) => fighters[index]?.kind ? [] : [row(collection, entry, index)])
      return <>
        {FIGHTER_KINDS.map((kind) => {
          const { used, total } = fighterSlots[kind]
          const rows = list.flatMap((entry, index) => fighters[index]?.kind === kind ? [row(collection, entry, index)] : [])
          return <div key={kind}>
            <h3 className="extra-fighter-group">{fighterLabel(kind)}{' '}
              <span className={used > total ? 'num warn' : 'num'}>{fmt(used)}/{fmt(total)}</span>
            </h3>
            {rows.length > 0 && <ul className="list">{rows}</ul>}
          </div>
        })}
        {unclassified.length > 0 && <ul className="list">{unclassified}</ul>}
      </>
    }
    if (!list.length || collection === 'implants' && !usesFitImplants) {
      const ship = result?.ship.name
      const message = collection === 'drones' && droneBay?.total === 0 && ship
        ? _t('{ship} has no drone bay').replace('{ship}', lname(ship, language))
        : _t('None')
      return <EmptyMessage>{message}</EmptyMessage>
    }
    return <ul className="list">{list.map((entry, index) => row(collection, entry, index))}</ul>
  }

  const stackSheet = sheet?.kind === 'split' || sheet?.kind === 'merge' ? sheet : undefined
  const stack = stackSheet && fit.drones[stackSheet.index]

  return <>
    {(['cargo', 'drones', 'fighters', 'implants', 'boosters'] as const).map((collection) => {
      const resource = collection === 'cargo' ? cargo : collection === 'drones' ? droneBay
        : collection === 'fighters' ? fighterBay : undefined
      return <FitSection key={collection} title={headings[collection]}
        info={resource && resource.total > 0 && `${fmt(resource.used)}/${fmt(resource.total)} ${_t('m³')}`}>
        {collection === 'drones' && drones.length > 0 && <>
          <p className="page-message fit-caption num">
            {_t('Drone bandwidth')} {fmt(droneBandwidth?.used ?? 0)}/{fmt(droneBandwidth?.total ?? 0)} · {' '}
            {_t('Active drones')} {fmt(activeDrones?.used ?? 0)}/{fmt(activeDrones?.total ?? 0)}
          </p>
          {inactiveDrones && <p className="page-message" role="note">
            {canActivateDrones ? _t('Drones are inactive. Tap to activate.') : _t('No drones can be activated with the current fit.')}
          </p>}
          {canActivateDrones && <div className="fit-inset"><button type="button" className="fit-button"
            onClick={() => edit((current) => {
              const amounts = new Map(droneActivation(current, result, true).map(({ index, active }) => [index, active]))
              const drones = current.drones.map((entry, index) => {
                const active = amounts.get(index) ?? entry.active
                return entry.active === active ? entry : { ...entry, active }
              })
              return drones.some((entry, index) => entry !== current.drones[index]) ? { ...current, drones } : current
            })}>{_t('Activate all (within bandwidth)')}</button></div>}
        </>}
        {collection === 'implants' && <label className="fit-inset extra-implant-source">
          <span className="fit-caption">{_t('Implant source')}</span>
          <select className="fit-input" value={fit.implantSource ?? 'default'}
            onChange={(event) => {
              const value = event.currentTarget.value
              edit((current) => ({ ...current, implantSource: value === 'fit' || value === 'character' ? value : undefined }))
            }}>
            <option value="default">{useCharacterImplants ? _t('Use default (character)') : _t('Use default (fit)')}</option>
            <option value="fit">{_t('Fit implants')}</option>
            <option value="character">{_t('Character implants')}</option>
          </select>
        </label>}
        {items(collection)}
        {(collection !== 'implants' || usesFitImplants) && <div className="fit-inset extra-actions">
          <button type="button" className="fit-button" onClick={() => setSheet({ kind: 'pick', collection })}>{extraAddLabel(collection)}</button>
          {collection === 'implants' && <button type="button" className="fit-button" disabled={!canApplySet || !engine.implantSets}
            onClick={() => setSheet({ kind: 'implantSet' })}>{_t('Apply Implant Set')}</button>}
        </div>}
      </FitSection>
    })}
    <FitNotes key={record.id} />
    {sheet?.kind === 'pick' && <ExtraItemPicker key={sheet.collection} collection={sheet.collection} onClose={closeSheet} />}
    {sheet?.kind === 'implantSet' && <ImplantSetPicker engine={engine} onClose={closeSheet} onPick={(set) => {
      const slots = new Set(set.implants.map((implant) => implant.slot))
      edit((current) => ({
        ...current,
        implants: [
          ...current.implants.filter((id) => !slots.has(details[id]?.slot ?? 0)),
          ...set.implants.map((implant) => implant.typeId),
        ],
      }), Object.fromEntries(set.implants.map((implant) => [implant.typeId, implant.name])))
      closeSheet()
    }} />}
    {stackSheet && stack && <DroneStackSheet key={`${stackSheet.kind}-${stackSheet.index}`} label={itemName(stack.typeId)} amount={stack.amount}
      targets={fit.drones.flatMap((drone, index) => drone.typeId === stack.typeId && index !== stackSheet.index
        ? [{ index, amount: drone.amount, active: drones.find((row) => row.index === index)?.active ?? 0 }] : [])}
      onClose={closeSheet}
      onSplit={stackSheet.kind === 'split' ? (amount) => {
        edit((current) => {
          if (current.drones[stackSheet.index] !== stack || amount >= stack.amount) return current
          const totalActive = Math.max(0, Math.min(stack.amount, stack.active))
          const active = Math.min(amount, totalActive)
          const drones = [...current.drones]
          drones.splice(stackSheet.index, 1,
            { ...stack, amount: stack.amount - amount, active: totalActive - active },
            { ...stack, amount, active })
          return { ...current, drones }
        })
        closeSheet()
      } : undefined}
      onMerge={stackSheet.kind === 'merge' ? (target) => {
        edit((current) => {
          const destination = current.drones[target]
          if (current.drones[stackSheet.index] !== stack || destination?.typeId !== stack.typeId || target === stackSheet.index) return current
          const drones = [...current.drones]
          drones[target] = { ...destination, amount: destination.amount + stack.amount, active: destination.active + stack.active }
          drones.splice(stackSheet.index, 1)
          return { ...current, drones }
        })
        closeSheet()
      } : undefined} />}
  </>
}

function fighterLabel(kind: FighterKind) {
  switch (kind) {
    case 'light': return _t('Light fighters')
    case 'heavy': return _t('Heavy fighters')
    case 'support': return _t('Support fighters')
  }
}

function withBoosterEffects(fit: FitDoc, typeId: number, enabled: number[]): FitDoc {
  const boosterSideEffects = { ...fit.boosterSideEffects }
  if (enabled.length > 0) boosterSideEffects[typeId] = enabled
  else delete boosterSideEffects[typeId]
  return { ...fit, boosterSideEffects: Object.keys(boosterSideEffects).length ? boosterSideEffects : undefined }
}

function remove(fit: FitDoc, collection: ExtraCollection, index: number): FitDoc {
  return { ...fit, [collection]: (fit[collection] ?? []).filter((_, current) => current !== index) }
}

/** Puts a removed entry back at its old position (or the end if the list is shorter now). */
function restore(fit: FitDoc, collection: ExtraCollection, index: number, entry: Entry): FitDoc {
  const list: unknown[] = [...fit[collection] ?? []]
  list.splice(Math.min(index, list.length), 0, entry)
  return { ...fit, [collection]: list }
}


function droneActivation(fit: FitDoc, result: CalcResult | undefined, all = false) {
  if (!result?.squadrons) return []
  const bandwidth = result.resources.droneBandwidth.total
  const limit = result.resources.activeDrones.total
  let availableBandwidth = bandwidth
  let availableDrones = limit
  const costs = new Map(result.squadrons.drones.map(({ typeId, bandwidth }) => [typeId, bandwidth]))
  const rows = fit.drones.flatMap((drone, index) => {
    const cost = costs.get(drone.typeId)
    if (cost === undefined) return []
    const maxByBandwidth = cost > 0 ? Math.floor(availableBandwidth / cost) : availableDrones
    const active = Math.min(all ? drone.amount : Math.max(0, drone.active), drone.amount, availableDrones, maxByBandwidth)
    availableDrones -= active
    availableBandwidth -= active * cost
    return [{ index, active, cost, amount: drone.amount }]
  })
  return rows.map((row) => ({
    ...row,
    maximum: Math.min(row.amount, row.active + availableDrones,
      row.cost > 0 ? row.active + Math.floor(availableBandwidth / row.cost) : row.amount),
  }))
}
