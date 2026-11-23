import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ExtraCollection, FitDoc } from '../engine/types'
import { _t } from '../i18n/t'
import { ExtraItemPicker, extraAddLabel } from './ExtraItemPicker'
import { FitNotes } from './FitNotes'
import { fmt, lname, useNameLanguage } from '../ui/format'
import { removedMessage, useToast } from '../ui/Toast'
import { useFitSession } from './fitSession'
import { EmptyMessage, FitSection } from './shared'

type Collection = 'cargo' | 'drones' | 'implants' | 'boosters'

export function FitExtras() {
  const language = useNameLanguage()
  const { fit, record, result, edit, removed } = useFitSession()
  const toast = useToast()
  const [picker, setPicker] = useState<ExtraCollection>()
  const { cargo, droneBay } = result?.resources ?? {}
  const headings = {
    cargo: _t('Cargo'), drones: _t('Drones'), implants: _t('Implants'), boosters: _t('Boosters'),
  }

  function items(collection: Collection) {
    const list = fit[collection]
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
        const active = typeof entry === 'object' && 'active' in entry ? entry.active : undefined
        return <li className="fit-data-row" key={`${typeId}-${index}`}>
          {retired ? <span className="warn">{label} · {_t('Item removed')}</span> :
            <Link to={`/item/${typeId}?fit=${encodeURIComponent(record.id)}`}>{label}</Link>}
          {quantity !== undefined && <span className="fit-caption num">×{fmt(quantity)}</span>}
          {active !== undefined && <span className="fit-caption num">{_t('Active')} {fmt(active)}</span>}
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
    {(['cargo', 'drones', 'implants', 'boosters'] as const).map((collection) => {
      const resource = collection === 'cargo' ? cargo : collection === 'drones' ? droneBay : undefined
      return <FitSection key={collection} title={headings[collection]}
        info={resource && resource.total > 0 && `${fmt(resource.used)}/${fmt(resource.total)} ${_t('m³')}`}>
        {items(collection)}
        {addButton(collection)}
      </FitSection>
    })}
    <FitSection title={_t('Fighters')}>
      {addButton('fighters')}
    </FitSection>
    <FitNotes key={record.id} />
    {picker && <ExtraItemPicker key={picker} collection={picker} onClose={() => setPicker(undefined)} />}
  </>
}

function remove(fit: FitDoc, collection: Collection, index: number): FitDoc {
  return { ...fit, [collection]: fit[collection].filter((_, current) => current !== index) }
}

/** Puts a removed entry back at its old position (or the end if the list is shorter now). */
function restore(fit: FitDoc, collection: Collection, index: number, entry: FitDoc[Collection][number]): FitDoc {
  const list: unknown[] = [...fit[collection]]
  list.splice(Math.min(index, list.length), 0, entry)
  return { ...fit, [collection]: list }
}
