import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULE_STATES, type FitDoc, type ItemGroup, type ModulePos, type ModuleSlotRow, type ModuleState } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { AmmoList } from '../ui/AmmoList'
import { fmt, iconUrl, lname } from '../ui/format'
import { ItemIcon } from '../ui/ItemIcon'
import { Segmented } from '../ui/Segmented'
import { positionKey, useFitServices, useFitSession, withModules } from './fitSession'

function stateName(state: ModuleState) {
  switch (state) {
    case 'offline': return _t('Offline')
    case 'online': return _t('Online')
    case 'active': return _t('Active')
    case 'overheated': return _t('Overheated')
  }
}

export function ModuleSheet({ selected, row, onClose }: { selected?: ModulePos; row?: ModuleSlotRow; onClose: () => void }) {
  return <ActionSheet open={Boolean(selected && row)} title={_t('Module actions')} onClose={onClose}>
    {selected && row && <ModuleControls key={positionKey(selected)} selected={selected} row={row} onClose={onClose} />}
  </ActionSheet>
}

function ModuleControls({ selected, row, onClose }: { selected: ModulePos; row: ModuleSlotRow; onClose: () => void }) {
  const language = useUiLanguage()
  const navigate = useNavigate()
  const { engine } = useFitServices()
  const { edit, fit, record } = useFitSession()
  const [ammo, setAmmo] = useState<{ fit: FitDoc; index: number; groups: ItemGroup[] }>()
  const [error, setError] = useState(false)
  const [individual, setIndividual] = useState<{ positions: number[]; index: number }>()
  const { slot, index } = selected
  const positions = individual ? [individual.index] : row.positions
  const source = positions[0] ?? index
  const current = fit.modules[slot][source]
  const typeId = current?.typeId
  const chargeTypeId = current?.chargeTypeId
  const path = `/fit/${record.id}`
  const states = row.supportedStates ?? (slot === 'rig' ? ['offline', 'online'] as const : MODULE_STATES)

  useEffect(() => {
    let live = true
    if (typeId !== undefined) {
      void engine.chargesFor(fit, { slot, index: source }).then((groups) => {
        if (live) { setAmmo({ fit, index: source, groups }); setError(false) }
      }, () => { if (live) setError(true) })
    }
    return () => { live = false }
  }, [engine, fit, slot, source, typeId])

  return <>
    <header className="module-sheet-heading">
      <ItemIcon src={iconUrl(row.iconId)} />
      <div>
        <h2>{lname(row.name, language)} {positions.length > 1 && <span className="num">×{positions.length}</span>}</h2>
        <p className="fit-caption num">
          {row.keyLine && `${row.keyLine} · `}{_t('CPU')} {fmt(row.cpu)} · {_t('Powergrid')} {fmt(row.powergrid)}
        </p>
      </div>
    </header>
    {individual && <div className="fit-chips">
      {individual.positions.map((position) => <button type="button" key={position} className="fit-chip" aria-pressed={source === position}
        onClick={() => setIndividual({ ...individual, index: position })}>
        {_t('Slot {n}').replace('{n}', String(position + 1))}
      </button>)}
    </div>}
    {current && <Segmented small value={current.state} options={states.map((value) => ({ value, label: stateName(value) }))}
      onChange={(state) => edit((fit) => withModules(fit, slot, positions, (mod) => mod && { ...mod, state }))} />}
    {error && <p role="alert" className="page-message">{_t('Could not load charges')}</p>}
    {ammo?.fit === fit && ammo.index === source && ammo.groups.length > 0 && <>
      <div className="fit-section-title"><h3>{_t('Charges')}</h3><span className="fit-caption">
        {_t('Applies to {n} module', 'Applies to {n} modules', positions.length).replace('{n}', String(positions.length))}
      </span></div>
      <div className="module-ammo-list">
        <AmmoList key={`${source}-${chargeTypeId}`} groups={ammo.groups} currentTypeId={chargeTypeId ?? undefined}
          valueUnit={_t('Damage')} onPick={(item) => edit((fit) => withModules(fit, slot, positions,
            (mod) => mod && { ...mod, chargeTypeId: item.typeId }), { [item.typeId]: item.name })} />
      </div>
    </>}
    {(row.count > 1 || individual) && <SheetAction onClick={() => setIndividual(individual ? undefined : { positions: row.positions, index: source })}>
      {individual ? _t('Set together') : _t('Set {n} modules individually').replace('{n}', String(row.count))}
    </SheetAction>}
    <SheetAction onClick={() => navigate(`${path}/variations/${positionKey({ slot, index: source })}${individual ? '?single=1' : ''}`)}>
      {_t('Replace with a variation')}
    </SheetAction>
    <SheetAction onClick={() => navigate(`/item/${row.typeId}?fit=${encodeURIComponent(record.id)}&pos=${positionKey({ slot, index: source })}`)}>
      {_t('Item information')}
    </SheetAction>
    <SheetAction warn onClick={() => {
      edit((fit) => withModules(fit, slot, positions, () => null))
      onClose()
    }}>
      {individual || positions.length === 1 ? _t('Remove module') : _t('Remove {n} modules').replace('{n}', String(positions.length))}
    </SheetAction>
  </>
}
