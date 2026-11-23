import '../ui.css'
import { _t, useUiLanguage } from '../../i18n/t'
import { getPatternData, groupByCategory, hasCategory } from './patterns'
import { PatternGroupList, PatternRowButton } from './PatternGroupList'

/** Bottom-sheet body: built-in damage patterns grouped by pyfa category. */
export function DamagePatternPicker({ value, onPick }: { value: number; onPick: (id: number) => void }) {
  useUiLanguage()
  const data = getPatternData()
  const plain = data.damagePatterns.filter((row) => !hasCategory(row))
  const groups = groupByCategory(data.damagePatterns)

  return (
    <div>
      <div className="row" style={{ paddingTop: 0 }}>
        <div className="mn">
          <span>{_t('Damage pattern')}</span>
          <small>{_t('Affects effective HP · built into pyfa')}</small>
        </div>
      </div>
      <div className="list">
        {plain.map((row) => (
          <PatternRowButton key={row.id ?? row.name.en} row={row} currentId={value}
            onPick={(id) => { if (id !== null) onPick(id) }} kind="damage" />
        ))}
      </div>
      <PatternGroupList groups={groups} rows={data.damagePatterns} currentId={value}
        onPick={(id) => { if (id !== null) onPick(id) }} kind="damage" />
      <div className="hint">{_t('Custom patterns are not in the first version.')}</div>
    </div>
  )
}
