import { useEffect, useState } from 'react'
import { mockEngine, sampleFits, type SampleName } from '../engine/mockClient'
import type { CalcResult, ItemGroup, ModuleSlotRow, ModuleState, SlotRow } from '../engine/types'
import { _t, useUiLanguage } from '../i18n/t'
import { ActionSheet, SheetAction } from '../ui/ActionSheet'
import { AmmoList } from '../ui/AmmoList'
import { FitRow } from '../ui/FitRow'
import { lname } from '../ui/format'
import { MetaGroupList } from '../ui/MetaGroupList'
import { ModuleRow } from '../ui/ModuleRow'
import { NavBar } from '../ui/NavBar'
import { Pill } from '../ui/Pill'
import { ResourceBar, ResourceGauge } from '../ui/ResourceGauge'
import { Segmented } from '../ui/Segmented'
import { StatsPage } from '../ui/StatsPage'

const NAMES: SampleName[] = ['rifter', 'merlin', 'thrasher']

const H = ({ children }: { children: string }) => (
  <h3 style={{ margin: 0, padding: 'var(--space-5) var(--space-4) var(--space-1)', font: 'var(--type-label)', color: 'var(--color-text-secondary)' }}>{children}</h3>
)

function overflowOf(r: CalcResult): string | undefined {
  const w = r.warnings[0]
  return w ? `${w.kind} +${Math.round((w.used - w.total) * 10) / 10}` : undefined
}

/** Dev-only: every component and state, for all three fixtures, to compare against the design board. */
export default function Gallery() {
  useUiLanguage()
  const [results, setResults] = useState<Record<SampleName, CalcResult> | null>(null)
  const [ammo, setAmmo] = useState<ItemGroup[]>([])
  const [which, setWhich] = useState<SampleName>('rifter')
  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>('system')
  const [sheet, setSheet] = useState(false)
  const [state, setState] = useState<ModuleState>('active')

  useEffect(() => {
    void Promise.all(NAMES.map((n) => mockEngine.calc(sampleFits[n]))).then((rs) =>
      setResults({ rifter: rs[0]!, merlin: rs[1]!, thrasher: rs[2]! }))
    void mockEngine.chargesFor(sampleFits.rifter, { slot: 'high', index: 0 }).then(setAmmo)
  }, [])
  useEffect(() => {
    if (appearance === 'system') return
    const root = document.documentElement
    const prev = root.getAttribute('data-appearance')
    root.setAttribute('data-appearance', appearance)
    return () => { if (prev) root.setAttribute('data-appearance', prev) }
  }, [appearance])

  if (!results) return null
  const r = results[which]
  const rows: SlotRow[] = [...r.slots.high, ...r.slots.mid, ...r.slots.low]
  const first = rows.find((x): x is ModuleSlotRow => x.kind === 'module')
  const currentCharge = r.slots.high.find((x): x is ModuleSlotRow => x.kind === 'module')?.charge?.typeId
  const demo = (patch: Partial<ModuleSlotRow>): SlotRow | null => (first ? { ...first, ...patch } : null)

  return (
    <main style={{ maxWidth: 402, margin: '0 auto', paddingBottom: 'var(--space-6)', background: 'var(--color-bg)' }}>
      <div style={{ display: 'flex', gap: 6, padding: 'var(--space-3) var(--space-4) 0', flexWrap: 'wrap' }}>
        {(['system', 'light', 'dark'] as const).map((a) => <Pill key={a} on={appearance === a} onClick={() => setAppearance(a)}>{a}</Pill>)}
      </div>
      <Segmented value={which} onChange={setWhich} options={NAMES.map((n) => ({ value: n, label: lname(results[n].ship.name, 'en_US') }))} />

      <H>NavBar</H>
      <NavBar title={r.ship.name.en} subtitle={_t('Fitting')} onBack={() => {}} onUndo={() => {}} onMore={() => {}} />

      <H>ResourceBar</H>
      <ResourceBar cpu={r.resources.cpu} powergrid={r.resources.powergrid} calibration={r.resources.calibration} />
      <H>ResourceGauge</H>
      <div style={{ display: 'grid', gap: 'var(--space-3)', padding: '0 var(--space-4)' }}>
        <ResourceGauge tall label={_t('CPU')} used={r.resources.cpu.used} total={r.resources.cpu.total} />
        <ResourceGauge tall label={_t('Calibration')} used={400} total={400} />
        <ResourceGauge tall label={_t('CPU')} used={230.5} total={225} />
        <ResourceGauge tall label={_t('Drone bay')} used={0} total={0} />
      </div>

      <H>Segmented / Pill</H>
      <Segmented small value="active" options={[
        { value: 'offline', label: _t('Offline') }, { value: 'online', label: _t('Online') },
        { value: 'active', label: _t('Active') }, { value: 'overheated', label: _t('Overheated') }]} />
      <div style={{ display: 'flex', gap: 6, padding: '0 var(--space-4)' }}><Pill on>{_t('EHP')}</Pill><Pill>{_t('HP')}</Pill></div>

      <H>FitRow</H>
      <div className="list">
        {NAMES.map((n) => (
          <FitRow key={n} name={sampleFits[n].name} shipName={results[n].ship.name.en} dps={results[n].stats.firepower.dps}
            ehp={results[n].stats.defense.ehp} overflow={overflowOf(results[n])} />
        ))}
      </div>

      <H>{`ModuleRow · ${r.ship.name.en}`}</H>
      <div className="list">{rows.map((row, i) => <ModuleRow key={i} row={row} />)}</div>

      <H>ModuleRow · states (tap, long press, swipe left)</H>
      <div className="list">
        {first && <ModuleRow row={{ ...first, state }} onStateChange={setState} />}
        {first && <ModuleRow availableStates={['offline', 'online']} row={{ ...first, count: 1, charge: null, keyParts: [], state: state === 'offline' ? 'offline' : 'online' }} onStateChange={(s) => setState(s)} />}
        {[demo({ state: 'offline' }), demo({ state: 'overheated' }), demo({ overSlots: true })].map((row, i) => row && <ModuleRow key={i} row={row} />)}
        <ModuleRow row={{ kind: 'empty', count: 1, positions: [5] }} />
      </div>

      <H>MetaGroupList / AmmoList</H>
      <AmmoList groups={ammo} currentTypeId={currentCharge}
        damageMix={(it) => (it.name.en.includes('EMP') ? { em: 77, thermal: 0, kinetic: 8, explosive: 15 } : { em: 0, thermal: 0, kinetic: 17, explosive: 83 })} />
      <H>MetaGroupList (no current item)</H>
      <MetaGroupList groups={ammo} />

      <H>ActionSheet</H>
      <div style={{ padding: '0 var(--space-4)' }}><Pill onClick={() => setSheet(true)}>{_t('Module actions')}</Pill></div>
      <ActionSheet open={sheet} title={_t('Module actions')} onClose={() => setSheet(false)}>
        {first && <ModuleRow row={first} />}
        <Segmented small value={state} onChange={setState} options={[
          { value: 'offline', label: _t('Offline') }, { value: 'online', label: _t('Online') },
          { value: 'active', label: _t('Active') }, { value: 'overheated', label: _t('Overheated') }]} />
        <SheetAction icon="plus" hint="10">{_t('Swap for a similar module')}</SheetAction>
        <SheetAction icon="x" warn onClick={() => setSheet(false)}>{_t('Remove')}</SheetAction>
      </ActionSheet>

      <H>StatsPage</H>
      <StatsPage key={which} result={r} prices={{ ship: 405_000, fit: 1_234_000 }} />
    </main>
  )
}
