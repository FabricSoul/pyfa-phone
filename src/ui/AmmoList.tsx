import './ui.css'
import type { ChargeGroup, ChargeOption, DamageTypes } from '../engine/types'
import { _t } from '../i18n/t'
import { fmt, iconUrl, lname, useNameLanguage } from './format'
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
export function AmmoList({ groups, currentTypeId, onPick }: {
  groups: ChargeGroup[]
  currentTypeId?: number
  onPick?: (item: ChargeOption) => void
}) {
  const lang = useNameLanguage()
  return (
    <MetaGroupList groups={groups} currentTypeId={currentTypeId} valueUnit={_t('DPS')}
      renderItem={(it, current) => {
        const range = it.optimalRange || it.falloff
          ? `${fmt(it.optimalRange / 1000)}${it.falloff ? ` + ${fmt(it.falloff / 1000)}` : ''} ${_t('km')}`
          : null
        return (
          <button type="button" className={`ar${current ? ' on' : ''}`} aria-pressed={current} onClick={() => onPick?.(it)}>
            <ItemIcon src={iconUrl(it.iconId)} />
            <div className="mn">
              <span>{lname(it.name, lang)}</span>
              <small><MetaTag meta={it.meta} /><DamageBar mix={it.damageMix} /></small>
            </div>
            <div className="v">{fmt(it.dps)}{range && <small>{range}</small>}</div>
          </button>
        )
      }} />
  )
}
