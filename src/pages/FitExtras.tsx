import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CalcResult, ExtraCollection, FitDoc } from '../engine/types'
import { _t } from '../i18n/t'
import { ExtraItemPicker, extraAddLabel } from './ExtraItemPicker'
import { FitNotes } from './FitNotes'
import { fmt, lname, useNameLanguage } from '../ui/format'
import { removedMessage, useToast } from '../ui/Toast'
import { useFitSession } from './fitSession'
import { EmptyMessage, FitSection } from './shared'

type Entry = NonNullable<FitDoc[ExtraCollection]>[number]

export function FitExtras() {
  const language = useNameLanguage()
  const { fit, record, result, edit, removed } = useFitSession()
  const toast = useToast()
  const [picker, setPicker] = useState<ExtraCollection>()
  const { cargo, droneBay, fighterBay, fighterTubes, droneBandwidth, activeDrones } = result?.resources ?? {}
  const drones = droneActivation(fit, result)
  const fighterSizes = new Map(result?.squadrons?.fighters.map(({ typeId, maxAmount }) => [typeId, maxAmount]))
  let tubes = fighterTubes?.total ?? 0
  const fighters = (fit.fighters ?? []).map((entry) => {
    const maxAmount = fighterSizes.get(entry.typeId)
    if (maxAmount === undefined) return undefined
    const active = entry.active && entry.amount > 0 && tubes > 0
    if (active) tubes--
    return { maxAmount, active }
  })
  const inactiveDrones = drones.length > 0 && drones.every(({ active }) => active === 0)
  const canActivateDrones = drones.some(({ maximum }) => maximum > 0)
  const headings = {
    cargo: _t('Cargo'), drones: _t('Drones'), fighters: _t('Fighters'), implants: _t('Implants'), boosters: _t('Boosters'),
  }

  function items(collection: ExtraCollection) {
    const list = fit[collection] ?? []
    if (!list.length) {
      const ship = result?.ship.name
      const message = collection === 'drones' && droneBay?.total === 0 && ship
        ? _t('{ship} has no drone bay').replace('{ship}', lname(ship, language))
        : _t('None')
      return <EmptyMessage>{message}</EmptyMessage>
    }
    return <ul className="list">
      {list.map((entry, index) => {
        const typeId = typeof entry === 'number' ? entry : entry.typeId
        const item = record.itemNames[typeId]
        const retired = removed.some((entry) => entry.typeId === typeId)
        const label = item ? lname(item, language) : String(typeId)
        const quantity = typeof entry === 'number' ? undefined : entry.amount
        const drone = collection === 'drones' ? drones.find((row) => row.index === index) : undefined
        const fighter = collection === 'fighters' ? fighters[index] : undefined
        const hasControls = !retired && (drone !== undefined || fighter !== undefined)
        return <li className={hasControls ? 'fit-squadron' : 'fit-data-row'} key={`${typeId}-${index}`}>
          <div className={hasControls ? 'fit-squadron-title' : undefined}>
            {retired ? <span className="warn">{label} · {_t('Item removed')}</span> :
              <Link to={`/item/${typeId}?fit=${encodeURIComponent(record.id)}`}>{label}</Link>}
            {!hasControls && quantity !== undefined && <span className="fit-caption num"> ×{fmt(quantity)}</span>}
          </div>
          {hasControls && <>
            <Stepper label={_t('Quantity')} item={label} value={fighter ? Math.min(quantity ?? 1, fighter.maxAmount) : quantity ?? 1}
              min={1} max={fighter?.maxAmount} onChange={(amount) => edit((current) => {
                if (drone) return {
                  ...current,
                  drones: current.drones.map((entry, i) => i === index
                    ? { ...entry, amount, active: Math.min(entry.active, amount) } : entry),
                }
                return {
                  ...current,
                  fighters: current.fighters?.map((entry, i) => i === index ? { ...entry, amount } : entry),
                }
              })} />
            {drone && <Stepper label={_t('Active')} item={label} value={drone.active}
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
          </>}
          <button type="button" className="fit-button" onClick={() => {
            edit((fit) => remove(fit, collection, index))
            toast.show({
              message: removedMessage(label, 1),
              actionLabel: _t('Undo'),
              onAction: () => edit((fit) => restore(fit, collection, index, entry)),
            })
          }}>{_t('Remove')}</button>
        </li>
      })}
    </ul>
  }

  function addButton(collection: ExtraCollection) {
    return <div className="fit-inset">
      <button type="button" className="fit-button" onClick={() => setPicker(collection)}>{extraAddLabel(collection)}</button>
    </div>
  }

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
        {items(collection)}
        {addButton(collection)}
      </FitSection>
    })}
    <FitNotes key={record.id} />
    {picker && <ExtraItemPicker key={picker} collection={picker} onClose={() => setPicker(undefined)} />}
  </>
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

function Stepper({ label, item, value, min, max = Number.MAX_SAFE_INTEGER, onChange }: {
  label: string
  item: string
  value: number
  min: number
  max?: number
  onChange: (value: number) => void
}) {
  return <div className="fit-stepper">
    <span className="fit-caption">{label}</span>
    <div className="fit-stepper-controls">
      <button type="button" className="fit-button" disabled={value <= min}
        aria-label={_t('Decrease {label} for {item}').replace('{label}', label).replace('{item}', item)}
        onClick={() => onChange(value - 1)}>−</button>
      <output className="num" aria-label={label}>{fmt(value)}</output>
      <button type="button" className="fit-button" disabled={value >= max}
        aria-label={_t('Increase {label} for {item}').replace('{label}', label).replace('{item}', item)}
        onClick={() => onChange(value + 1)}>+</button>
    </div>
  </div>
}
