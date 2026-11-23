import './ui.css'
import { useState, type ReactNode } from 'react'
import type { ItemGroup, ItemRow, MetaGroup } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { Icon } from './icons'
import { fmt, iconUrl, lname } from './format'
import { ItemIcon } from './ItemIcon'

export function metaLabel(meta: MetaGroup): string {
  switch (meta) {
    case 'tech2': return _t('Tech II')
    case 'tech1': return _t('Tech I')
    case 'faction': return _t('Faction')
    case 'storyline': return _t('Storyline')
    case 'deadspace': return _t('Deadspace')
    case 'officer': return _t('Officer')
  }
}

export function MetaTag({ meta }: { meta: MetaGroup }) {
  return <span className="tag" data-meta={meta}>{metaLabel(meta)}</span>
}

/** Which groups start expanded: the one holding the current item, else the first. */
export function defaultExpanded(groups: ItemGroup[], currentTypeId?: number): Set<MetaGroup> {
  const withCurrent = groups.find((g) => g.items.some((i) => i.typeId === currentTypeId))
  const pick = withCurrent ?? groups[0]
  return new Set(pick ? [pick.meta] : [])
}

/** Items grouped by tech level, collapsible. Collapsed headers show the count and the best value. */
export function MetaGroupList({ groups, currentTypeId, onPick, renderItem, renderGroup, valueUnit }: {
  groups: ItemGroup[]
  currentTypeId?: number
  onPick?: (item: ItemRow) => void
  /** Replaces the default row; `current` marks the selected item. */
  renderItem?: (item: ItemRow, current: boolean) => ReactNode
  /** Replaces the contents of an expanded group. */
  renderGroup?: (group: ItemGroup) => ReactNode
  /** Unit shown after the best value, e.g. "DPS". */
  valueUnit?: string
}) {
  const lang = useUiLanguage()
  // The default rule re-applies when the list first gets data or the current item changes (or moves to
  // another group); manual expand/collapse survives re-renders and refetches of the same object.
  const seed = `${currentTypeId ?? ''}|${defaultExpanded(groups, currentTypeId).values().next().value ?? ''}`
  const [state, setState] = useState(() => ({ seed, open: defaultExpanded(groups, currentTypeId) }))
  if (state.seed !== seed) setState({ seed, open: defaultExpanded(groups, currentTypeId) })
  const open = state.seed === seed ? state.open : defaultExpanded(groups, currentTypeId)
  const toggle = (m: MetaGroup) => setState((st) => {
    const n = new Set(st.open); if (!n.delete(m)) n.add(m)
    return { ...st, open: n }
  })
  return (
    <div>
      {groups.map((g) => {
        const expanded = open.has(g.meta)
        return (
          <div key={g.meta}>
            <button type="button" className="mh" aria-expanded={expanded} onClick={() => toggle(g.meta)}>
              <span className="cv"><Icon name="chevron-down" size={14} /></span>
              <MetaTag meta={g.meta} />
              <em className="num">
                {_t('{n} items').replace('{n}', String(g.items.length))}
                {!expanded && g.best != null && <> · {_t('best')} {fmt(g.best)}{valueUnit ? ` ${valueUnit}` : ''}</>}
              </em>
            </button>
            {expanded && (
              <div className="list">
                {renderGroup ? renderGroup(g) : g.items.map((it) => {
                  const current = it.typeId === currentTypeId
                  return renderItem ? <div key={it.typeId}>{renderItem(it, current)}</div> : (
                    <button key={it.typeId} type="button" className={`ar${current ? ' on' : ''}`} onClick={() => onPick?.(it)}>
                      <ItemIcon src={iconUrl(it.iconId)} />
                      <div className="mn"><span>{lname(it.name, lang)}</span><small className="num">{it.keyLine}</small></div>
                      {it.keyValue != null && <div className="v">{fmt(it.keyValue)}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
