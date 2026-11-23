import { useEffect, useState } from 'react'
import type { EngineClient, ImplantSet } from '../engine/types'
import { _t } from '../i18n/t'
import { ActionSheet, SheetAction } from './ActionSheet'
import { lname, useNameLanguage } from './format'

export function ImplantSetPicker({ engine, onClose, onPick }: {
  engine: EngineClient
  onClose: () => void
  onPick: (set: ImplantSet) => void
}) {
  const language = useNameLanguage()
  const [sets, setSets] = useState<ImplantSet[] | null>()
  useEffect(() => {
    let current = true
    void engine.implantSets?.().then((value) => {
      if (current) setSets(value)
    }, () => { if (current) setSets(null) })
    return () => { current = false }
  }, [engine])

  const title = _t('Apply Implant Set')
  return <ActionSheet open title={title} onClose={onClose}>
    <div className="fit-section-title" aria-hidden="true"><h3>{title}</h3></div>
    {sets === null || !engine.implantSets
      ? <p className="page-message" role="alert">{_t('Could not load implant sets')}</p>
      : sets === undefined
        ? <p className="page-message" role="status">{_t('Loading items…')}</p>
        : sets.length
          ? sets.map((set) => <SheetAction key={set.id} onClick={() => onPick(set)}>{lname(set.name, language)}</SheetAction>)
          : <p className="page-message">{_t('None')}</p>}
  </ActionSheet>
}
