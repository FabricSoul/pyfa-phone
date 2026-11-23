import '../ui.css'
import { _t, useUiLanguage } from '../../i18n/t'
import { getPatternData, groupByCategory, hasCategory, type PatternRow } from './patterns'
import { PatternGroupList, PatternRowButton } from './PatternGroupList'

const NONE: PatternRow = {
  id: null,
  name: { en: 'None', zh: '无' },
  category: { en: '', zh: '' },
  em: 0, thermal: 0, kinetic: 0, explosive: 0,
}

/** Bottom-sheet body: built-in target resist profiles, with "None" always first. */
export function TargetProfilePicker({ value, onPick }: { value: number | null; onPick: (id: number | null) => void }) {
  useUiLanguage()
  const data = getPatternData()
  // The picker owns the "None" row; drop any null-id row from data so it appears once.
  const rows = [NONE, ...data.targetProfiles.filter((row) => row.id !== null)]
  const plain = rows.filter((row) => !hasCategory(row))

  return (
    <div>
      <div className="row" style={{ paddingTop: 0 }}>
        <div className="mn">
          <span>{_t('Target profile')}</span>
          <small>{_t('Shows effective DPS when selected · built into pyfa')}</small>
        </div>
      </div>
      <div className="list">
        {plain.map((row) => (
          <PatternRowButton key={row.id ?? row.name.en} row={row} currentId={value} onPick={onPick} kind="resist" />
        ))}
      </div>
      <PatternGroupList groups={groupByCategory(rows)} rows={rows} currentId={value} onPick={onPick} kind="resist" />
      <div className="hint">{_t('Custom profiles are not in the first version.')}</div>
    </div>
  )
}
