import { Link } from 'react-router-dom'
import type { FitDoc } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { fmt, lname } from '../ui/format'
import { useFitSession } from './fitSession'
import { EmptyMessage, FitSection } from './shared'

type Collection = 'cargo' | 'drones' | 'implants' | 'boosters'

export function FitExtras() {
  const language = useUiLanguage()
  const { fit, record, result, edit, removed } = useFitSession()
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
          <button type="button" className="fit-button" onClick={() => edit((fit) => remove(fit, collection, index))}>{_t('Remove')}</button>
        </li>
      })}
    </ul>
  }

  return <>
    {(['cargo', 'drones', 'implants', 'boosters'] as const).map((collection) => {
      const resource = collection === 'cargo' ? cargo : collection === 'drones' ? droneBay : undefined
      return <FitSection key={collection} title={headings[collection]}
        info={resource && resource.total > 0 && `${fmt(resource.used)}/${fmt(resource.total)} ${_t('m³')}`}>
        {items(collection)}
      </FitSection>
    })}
    <FitSection title={_t('Notes')}>
      <div className="fit-inset">
        <textarea className="fit-input" key={fit.notes} defaultValue={fit.notes} rows={4} aria-label={_t('Notes')}
          placeholder={_t('Add notes')}
          onBlur={(event) => {
            const notes = event.currentTarget.value
            if (notes !== fit.notes) edit((fit) => ({ ...fit, notes }))
          }} />
      </div>
    </FitSection>
  </>
}

function remove(fit: FitDoc, collection: Collection, index: number): FitDoc {
  return { ...fit, [collection]: fit[collection].filter((_, current) => current !== index) }
}
