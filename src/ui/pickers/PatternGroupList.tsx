import '../ui.css'
import { useState } from 'react'
import { useItemNameLanguage } from '../../settings/settings'
import { Icon } from '../icons'
import { hasCategory, labelOf, ratioLine, type PatternGroup, type PatternRow } from './patterns'

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)', flex: 'none' }} aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export function PatternRowButton({ row, currentId, onPick, kind }: {
  row: PatternRow
  currentId: number | null
  onPick: (id: number | null) => void
  kind: 'damage' | 'resist'
}) {
  const lang = useItemNameLanguage()
  const current = row.id === currentId
  return (
    <button type="button" className={`ar${current ? ' on' : ''}`} aria-pressed={current} onClick={() => onPick(row.id)}>
      <div className="mn">
        <span>{labelOf(row.name, lang)}</span>
        <small className="num">{ratioLine(row, kind)}</small>
      </div>
      {current && <Check />}
    </button>
  )
}

/** Collapsible category groups; the selected item's group (else the first) starts open. */
export function PatternGroupList({ groups, rows, currentId, onPick, kind }: {
  groups: PatternGroup[]
  rows: PatternRow[]
  currentId: number | null
  onPick: (id: number | null) => void
  kind: 'damage' | 'resist'
}) {
  const lang = useItemNameLanguage()
  const current = rows.find((r) => r.id === currentId)
  const currentKey = current && hasCategory(current) ? (current.category.en || current.category.zh) : undefined
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(currentKey ? [currentKey] : groups[0] ? [groups[0].key] : []),
  )
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  })

  return (
    <div>
      {groups.map((group) => {
        const expanded = open.has(group.key)
        return (
          <div key={group.key}>
            <button type="button" className="mh" aria-expanded={expanded} onClick={() => toggle(group.key)}>
              <span className="cv"><Icon name="chevron-down" size={14} /></span>
              <span>{labelOf(group.name, lang)}</span>
              <em className="num">{group.items.length}</em>
            </button>
            {expanded && (
              <div className="list">
                {group.items.map((row) => (
                  <PatternRowButton key={row.id ?? row.name.en} row={row} currentId={currentId} onPick={onPick} kind={kind} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
