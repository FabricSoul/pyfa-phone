import { useEffect, useState } from 'react'
import type { ExtraCollection, FitDoc, ItemGroup, ItemRow } from '../engine/types'
import { _t } from '../i18n/t'
import { ActionSheet } from '../ui/ActionSheet'
import { MetaGroupList } from '../ui/MetaGroupList'
import { useFitServices, useFitSession } from './fitSession'
import { EmptyMessage } from './shared'

export function extraAddLabel(collection: ExtraCollection) {
  switch (collection) {
    case 'cargo': return _t('Add cargo')
    case 'drones': return _t('Add drone')
    case 'fighters': return _t('Add fighter')
    case 'implants': return _t('Add implant')
    case 'boosters': return _t('Add booster')
  }
}

export function ExtraItemPicker({ collection, onClose }: { collection: ExtraCollection; onClose: () => void }) {
  const { engine } = useFitServices()
  const { fit, edit } = useFitSession()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ fit: FitDoc; term: string; groups: ItemGroup[] | null }>()
  const term = query.trim()
  const needsSearch = collection === 'cargo' && !term
  const groups = result?.fit === fit && result.term === term ? result.groups : undefined

  useEffect(() => {
    if (needsSearch || !engine.itemsForExtra) return
    let live = true
    const timer = setTimeout(() => {
      void engine.itemsForExtra?.(fit, collection, term).then((groups) => {
        if (live) setResult({ fit, term, groups })
      }, () => { if (live) setResult({ fit, term, groups: null }) })
    }, term ? 120 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [collection, engine, fit, needsSearch, term])

  function pick(item: ItemRow) {
    edit((current) => current === fit ? addExtra(current, collection, item.typeId) : current, { [item.typeId]: item.name })
    onClose()
  }

  return <ActionSheet open title={extraAddLabel(collection)} onClose={onClose}>
    <div className="fit-search-row">
      <input className="fit-input" type="search" aria-label={_t('Search items')} placeholder={_t('Search items')}
        value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {!engine.itemsForExtra || groups === null
      ? <p role="alert" className="page-message">{_t('Could not load items')}</p>
      : needsSearch
        ? <EmptyMessage>{_t('Search for an item to add to cargo')}</EmptyMessage>
        : !groups
          ? <p role="status" className="page-message">{_t('Loading items…')}</p>
          : groups.length
            ? <MetaGroupList key={term} groups={groups} onPick={pick} />
            : <EmptyMessage>{_t('No compatible items found')}</EmptyMessage>}
  </ActionSheet>
}

function addExtra(fit: FitDoc, collection: ExtraCollection, typeId: number): FitDoc {
  switch (collection) {
    case 'cargo': {
      const index = fit.cargo.findIndex((item) => item.typeId === typeId)
      const cargo = index < 0
        ? [...fit.cargo, { typeId, amount: 1 }]
        : fit.cargo.map((item, i) => i === index ? { ...item, amount: item.amount + 1 } : item)
      return { ...fit, cargo }
    }
    case 'drones': {
      const index = fit.drones.findIndex((item) => item.typeId === typeId)
      const drones = index < 0
        ? [...fit.drones, { typeId, amount: 1, active: 0 }]
        : fit.drones.map((item, i) => i === index ? { ...item, amount: item.amount + 1 } : item)
      return { ...fit, drones }
    }
    case 'fighters':
      return { ...fit, fighters: [...fit.fighters ?? [], { typeId, amount: 1, active: false }] }
    case 'implants':
    case 'boosters':
      return { ...fit, [collection]: [...fit[collection], typeId] }
  }
}
