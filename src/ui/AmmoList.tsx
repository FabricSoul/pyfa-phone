import './ui.css'
import type { DamageTypes, ItemGroup, ItemRow } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { fmt, iconUrl, lname } from './format'
import { ItemIcon } from './ItemIcon'
import { MetaGroupList, MetaTag } from './MetaGroupList'

const DMG_VAR: [keyof DamageTypes, string][] = [
  ['em', '--dmg-em'], ['thermal', '--dmg-th'], ['kinetic', '--dmg-ki'], ['explosive', '--dmg-ex'],
]

/** Damage-type proportion bar (EM blue, thermal red, kinetic grey, explosive orange). */
export function DamageBar({ mix }: { mix: DamageTypes }) {
  const total = DMG_VAR.reduce((s, [k]) => s + mix[k], 0)
  if (total <= 0) return null
  return (
    <span className="dmg" data-testid="dmg-bar">
      {DMG_VAR.filter(([k]) => mix[k] > 0).map(([k, v]) => (
        <i key={k} style={{ width: `${(mix[k] / total) * 100}%`, background: `var(${v})` }} />
      ))}
    </span>
  )
}

/** Charge picker: MetaGroupList whose rows show the damage mix and the DPS / range. */
export function AmmoList({ groups, currentTypeId, damageMix, rangeText, valueUnit, onPick }: {
  groups: ItemGroup[]
  currentTypeId?: number
  damageMix?: (item: ItemRow) => DamageTypes | undefined
  valueUnit?: string
  rangeText?: (item: ItemRow) => string | undefined
  onPick?: (item: ItemRow) => void
}) {
  const lang = useUiLanguage()
  return (
    <MetaGroupList groups={groups} currentTypeId={currentTypeId} valueUnit={valueUnit ?? _t('DPS')}
      renderItem={(it, current) => {
        const mix = damageMix?.(it)
        const range = rangeText?.(it)
        return (
          <button type="button" className={`ar${current ? ' on' : ''}`} aria-pressed={current} onClick={() => onPick?.(it)}>
            <ItemIcon src={iconUrl(it.iconId)} />
            <div className="mn">
              <span>{lname(it.name, lang)}</span>
              <small><MetaTag meta={it.meta} />{mix && <DamageBar mix={mix} />}</small>
            </div>
            {it.keyValue != null && <div className="v">{fmt(it.keyValue)}{range && <small>{range}</small>}</div>}
          </button>
        )
      }} />
  )
}
