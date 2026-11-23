import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULE_STATES, type FitDoc, type ChargeGroup, type ModulePos, type ModuleSlotRow, type ModuleState, type CalcResult } from '../engine/types'
import { _t } from '../i18n/t'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { AmmoList } from '../ui/AmmoList'
import { fmt, iconUrl, lname, useNameLanguage } from '../ui/format'
import { ItemIcon } from '../ui/ItemIcon'
import { Segmented } from '../ui/Segmented'
import { Icon } from '../ui/icons'
import { MODULE_STATE_ICONS } from '../ui/ModuleRow'
import { positionKey, useFitServices, useFitSession, useRemoveModules, withModules } from './fitSession'

function stateName(state: ModuleState) {
  switch (state) {
    case 'offline': return _t('Offline')
    case 'online': return _t('Online')
    case 'active': return _t('Active')
    case 'overheated': return _t('Overheated')
  }
}

function stateMetrics({ stats }: CalcResult) {
  return [
    { label: _t('DPS'), value: stats.firepower.dps },
    { label: _t('Volley'), value: stats.firepower.volley },
    { label: _t('Max velocity'), value: stats.navigation.maxVelocity },
    { label: _t('EHP'), value: stats.defense.ehp },
    { label: _t('Shield'), value: stats.repair.raw.reinforced.passiveShield + stats.repair.raw.reinforced.shield + stats.remoteRepair.shield },
    { label: _t('Armor'), value: stats.repair.raw.reinforced.armor + stats.remoteRepair.armor },
    { label: _t('Hull'), value: stats.repair.raw.reinforced.hull + stats.remoteRepair.hull },
    { label: _t('Capacitor'), value: stats.capacitor.delta },
  ]
}

export function ModuleSheet({ selected, row, onClose }: { selected?: ModulePos; row?: ModuleSlotRow; onClose: () => void }) {
  return <ActionSheet open={Boolean(selected && row)} title={_t('Module actions')} onClose={onClose}>
    {selected && row && <ModuleControls key={positionKey(selected)} selected={selected} row={row} onClose={onClose} />}
  </ActionSheet>
}

function ModuleControls({ selected, row, onClose }: { selected: ModulePos; row: ModuleSlotRow; onClose: () => void }) {
  const language = useNameLanguage()
  const navigate = useNavigate()
  const { engine } = useFitServices()
  const { edit, fit, record, result } = useFitSession()
  const isMounted = useRef(false)
  const [filling, setFilling] = useState(false)
  const [fillMessage, setFillMessage] = useState<'error' | 'none'>()
  const removeModules = useRemoveModules()
  const [ammo, setAmmo] = useState<{ fit: FitDoc; index: number; groups: ChargeGroup[] }>()
  const [error, setError] = useState(false)
  const [stateChange, setStateChange] = useState<{
    before: CalcResult; fit: FitDoc; source: number; typeId: number; state: ModuleState; keyLine: string
  }>()
  const [individual, setIndividual] = useState<{ positions: number[]; index: number }>()
  const { slot, index } = selected
  const positions = individual ? [individual.index] : row.positions
  const source = positions[0] ?? index
  const current = fit.modules[slot][source]
  const typeId = current?.typeId
  const chargeTypeId = current?.chargeTypeId
  const path = `/fit/${record.id}`
  const spoolCycles = current?.spoolCycles
  const maxSpoolCycles = row.maxSpoolCycles
  const states = MODULE_STATES.filter((state) => row.supportedStates?.includes(state) ?? (
    state === 'offline' || state === 'online' || state === row.state))
  const showDelta = stateChange && stateChange.fit === fit && stateChange.source === source &&
    stateChange.typeId === typeId && current?.state === stateChange.state &&
    result && result !== stateChange.before && row.state === stateChange.state
  const priorMetrics = showDelta ? stateMetrics(stateChange.before) : []
  const delta = showDelta ? stateMetrics(result).flatMap(({ label, value }, index) => {
    const before = fmt(priorMetrics[index]!.value)
    const after = fmt(value)
    return before === after ? [] : [{ label, before, after }]
  }).slice(0, 2) : []

  const slotCount = result?.resources.slots[slot].total ?? 0
  const hasRoom = Array.from({ length: slotCount }, (_, index) => index).some((index) => !fit.modules[slot][index])

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  async function fill() {
    if (!engine.fillEmptySlots || filling) return
    setFilling(true)
    setFillMessage(undefined)
    try {
      const slots = await engine.fillEmptySlots(fit, { slot, index: source })
      if (!isMounted.current) return
      if (!slots.length) { setFillMessage('none'); return }
      let edited = false
      edit((current) => {
        if (current !== fit) return current
        edited = true
        return withModules(current, slot, slots.map(({ index }) => index),
          (_, index) => slots.find((entry) => entry.index === index)?.module ?? null)
      })
      if (edited) onClose()
      else setFillMessage('error')
    } catch {
      if (isMounted.current) setFillMessage('error')
    } finally {
      if (isMounted.current) setFilling(false)
    }
  }

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
    {current && <div className="module-states">
      <Segmented small value={row.adjustment ? row.state : current.state}
        options={states.map((value) => ({ value, label: <span data-state={value}>
          <Icon name={MODULE_STATE_ICONS[value]} /> {stateName(value)}
        </span> }))}
        onChange={(state) => {
          if (state === current.state) return
          const next = withModules(fit, slot, positions, (mod) => mod && { ...mod, state })
          if (result) setStateChange({ before: result, fit: next, typeId: current.typeId, source, state, keyLine: row.keyLine })
          edit((currentFit) => currentFit === fit ? next : currentFit)
        }} />
      {showDelta && <div className="module-state-delta" aria-live="polite">
        {delta.map(({ label, before, after }) => <span key={label}>{label} <b className="num">{before} → {after}</b></span>)}
        {delta.length === 0 && row.keyLine !== stateChange.keyLine && row.keyLine &&
          <span className="num">{stateChange.keyLine ? `${stateChange.keyLine} → ` : ''}{row.keyLine}</span>}
      </div>}
    </div>}
    {maxSpoolCycles !== undefined && current && <label className="fit-preheat">
      <span>{_t('Preheat cycles')}</span>
      <input className="fit-input num" type="number" min={0} max={maxSpoolCycles} step={1}
        key={`${source}-${spoolCycles}`} defaultValue={spoolCycles ?? ''} placeholder={_t('Default')}
        onBlur={(event) => {
          const input = event.currentTarget
          const cycles = input.value === '' ? undefined : Math.min(maxSpoolCycles, Math.max(0, Math.round(input.valueAsNumber)))
          if (cycles !== undefined && !Number.isFinite(cycles)) return
          input.value = cycles === undefined ? '' : String(cycles)
          if (cycles !== spoolCycles) edit((fit) => withModules(fit, slot, positions, (mod) => mod && { ...mod, spoolCycles: cycles }))
        }} />
    </label>}
    {error && <p role="alert" className="page-message">{_t('Could not load charges')}</p>}
    {ammo?.fit === fit && ammo.index === source && ammo.groups.length > 0 && <>
      <div className="fit-section-title"><h3>{_t('Charges')}</h3><span className="fit-caption">
        {_t('Applies to {n} module', 'Applies to {n} modules', positions.length).replace('{n}', String(positions.length))}
      </span></div>
      <div className="module-ammo-list">
        <AmmoList key={`${source}-${chargeTypeId}`} groups={ammo.groups} currentTypeId={chargeTypeId ?? undefined}
          onPick={(item) => edit((fit) => withModules(fit, slot, positions,
            (mod) => mod && { ...mod, chargeTypeId: item.typeId }), { [item.typeId]: item.name })} />
      </div>
    </>}
    {(row.count > 1 || individual) && <SheetAction icon="list" onClick={() => setIndividual(individual ? undefined : { positions: row.positions, index: source })}>
      {individual ? _t('Set together') : _t('Set {n} modules individually').replace('{n}', String(row.count))}
    </SheetAction>}
    <SheetAction icon="swap" onClick={() => navigate(`${path}/variations/${positionKey({ slot, index: source })}${individual ? '?single=1' : ''}`)}>
      {_t('Replace with a variation')}
    </SheetAction>
    <SheetAction icon="info" onClick={() => navigate(`/item/${row.typeId}?fit=${encodeURIComponent(record.id)}&pos=${positionKey({ slot, index: source })}`)}>
      {_t('Item information')}
    </SheetAction>
    {current && hasRoom && engine.fillEmptySlots && <>
      <button type="button" className="act" disabled={filling} onClick={() => void fill()}>
        {_t('Fill empty slots of this type')}
      </button>
      {fillMessage && <p role="status" className="page-message">
        {fillMessage === 'none' ? _t('No compatible empty slots') : _t('Could not fill empty slots')}
      </p>}
    </>}
    <SheetAction warn icon="trash" onClick={() => {
      removeModules(slot, positions, lname(row.name, language))
      onClose()
    }}>
      {individual || positions.length === 1 ? _t('Remove module') : _t('Remove {n} modules').replace('{n}', String(positions.length))}
    </SheetAction>
  </>
}
