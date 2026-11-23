import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { SLOT_KINDS, type CalcResult, type EngineClient, type FitDoc, type FitModule, type LName, type ModulePos, type SlotKind } from '../engine/types'
import { _t } from '../i18n/t'
import { useSettings } from '../settings/settings'
import { fitTypeIds, resolveStoredItems, withTemporaryFits, type FitStore, type StoredFit } from '../store/fits'
import { commit, createHistory, redo, undo, type History } from '../store/history'
import { removedMessage, useToast } from '../ui/Toast'
import { NotFound } from './shared'

interface Services {
  engine: EngineClient
  store: ReturnType<typeof withTemporaryFits>
  histories: Map<string, History<FitDoc>>
}

const ServicesContext = createContext<Services | null>(null)

export function FitServices({ engine, store, children }: { engine: EngineClient; store: FitStore; children: ReactNode }) {
  const histories = useMemo(() => new Map<string, History<FitDoc>>(), [engine, store])
  const sessionStore = useMemo(() => withTemporaryFits(store), [store])
  return <ServicesContext.Provider value={{ engine, store: sessionStore, histories }}>{children}</ServicesContext.Provider>
}

export function useFitServices() {
  return useContext(ServicesContext)!
}

type RemovedItem = { typeId: number; name?: LName }

interface Session {
  record: StoredFit
  fit: FitDoc
  result?: CalcResult
  removed: RemovedItem[]
  canUndo: boolean
  canRedo: boolean
  edit(update: (fit: FitDoc) => FitDoc, itemNames?: Record<number, LName>): void
  undo(): void
  redo(): void
}

const FitContext = createContext<Session | null>(null)

export function useFitSession() {
  return useContext(FitContext)!
}

export function withModules(fit: FitDoc, slot: SlotKind, positions: number[], update: (mod: FitModule | null, index: number) => FitModule | null): FitDoc {
  const modules = [...fit.modules[slot]]
  for (const index of positions) {
    while (modules.length <= index) modules.push(null)
    modules[index] = update(modules[index] ?? null, index)
  }
  return { ...fit, modules: { ...fit.modules, [slot]: modules } }
}

export function parsePosition(pos?: string): ModulePos | undefined {
  const match = /^(high|mid|low|rig|subsystem)-(\d+)$/.exec(pos ?? '')
  if (!match) return undefined
  const index = Number(match[2])
  return Number.isSafeInteger(index) ? { slot: match[1] as SlotKind, index } : undefined
}

export const positionKey = (pos: ModulePos) => `${pos.slot}-${pos.index}`

function withoutRetiredItems(fit: FitDoc, removed: RemovedItem[]): FitDoc {
  if (!removed.length) return fit
  const absent = new Set(removed.map((item) => item.typeId))
  return {
    ...fit,
    modules: {
      high: slots('high'), mid: slots('mid'), low: slots('low'), rig: slots('rig'), subsystem: slots('subsystem'),
    },
    drones: fit.drones.filter((item) => !absent.has(item.typeId)),
    cargo: fit.cargo.filter((item) => !absent.has(item.typeId)),
    implants: fit.implants.filter((id) => !absent.has(id)),
    boosters: fit.boosters.filter((id) => !absent.has(id)),
  }
  function slots(slot: SlotKind) {
    return fit.modules[slot].map((mod) => {
      if (!mod || absent.has(mod.typeId)) return null
      return mod.chargeTypeId !== null && absent.has(mod.chargeTypeId) ? { ...mod, chargeTypeId: null } : mod
    })
  }
}

export function resultNames(result: CalcResult): Record<number, LName> {
  const names: Record<number, LName> = { ...result.itemNames, [result.ship.typeId]: result.ship.name }
  for (const slot of SLOT_KINDS) {
    for (const row of result.slots[slot]) {
      if (row.kind === 'empty') continue
      names[row.typeId] = row.name
      if (row.kind === 'module' && row.charge) names[row.charge.typeId] = row.charge.name
    }
  }
  return names
}

export function FitWorkspace() {
  const { id } = useParams()
  return <Workspace key={id} id={id ?? ''} />
}

function Workspace({ id }: { id: string }) {
  const { engine, store, histories } = useFitServices()
  const { considerReload } = useSettings()
  const [record, setRecord] = useState<StoredFit>()
  const [history, setHistory] = useState<History<FitDoc>>()
  const historyRef = useRef<History<FitDoc> | undefined>(undefined)
  const [result, setResult] = useState<CalcResult>()
  const [removed, setRemoved] = useState<RemovedItem[]>([])
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [calcError, setCalcError] = useState(false)
  const [missing, setMissing] = useState(false)
  const toast = useToast()
  // An undo offer belongs to this fit's session; it must not outlive it.
  useEffect(() => toast.dismiss, [toast])

  useEffect(() => {
    let current = true
    void (async () => {
      const saved = await store.get(id)
      if (!saved) {
        if (current) setMissing(true)
        return
      }
      const openedAt = Date.now()
      await store.touch(id, openedAt)
      if (!current) return
      const loaded = histories.get(id) ?? createHistory(saved.fit)
      const initial = { ...saved, fit: loaded.present, openedAt }
      const itemInfo = engine.itemInfo?.bind(engine)
      if (itemInfo) {
        const dataVersion = await engine.getDataVersion?.() ?? initial.fit.dataVersion
        const resolution = await resolveStoredItems(initial, dataVersion, async (typeId) => (await itemInfo(typeId))?.name ?? null)
        if (!current) return
        setRemoved(resolution.removed)
        initial.itemNames = resolution.itemNames
        if (Object.keys(resolution.itemNames).length) await store.rememberNames(id, resolution.itemNames)
      }
      if (!current) return
      historyRef.current = loaded
      setHistory(loaded)
      setRecord(initial)
    })().catch((error: unknown) => { console.error('Could not load fit', error); if (current) setLoadError(true) })
    return () => { current = false }
  }, [id, store, histories, engine])

  const fit = history?.present
  useEffect(() => {
    if (!fit || removed.some((item) => item.typeId === fit.shipTypeId)) return
    let current = true
    void engine.calc(withoutRetiredItems(fit, removed), { includeReload: considerReload }).then((calc) => {
      if (!current) return
      setResult(calc)
      setCalcError(false)
      void store.rememberNames(id, resultNames(calc)).catch(() => { if (current) setSaveError(true) })
    }, (error: unknown) => { console.error('Could not calculate fit', error); if (current) setCalcError(true) })
    return () => { current = false }
  }, [considerReload, engine, fit, id, removed, store])

  if (missing) return <NotFound title={_t('Fit not found')} />
  if (loadError || calcError && !result) return <>
    <p role="alert" className="page-message">{_t('Could not load fit')}</p>
    <div className="fit-inset"><button type="button" className="fit-button" onClick={() => window.location.reload()}>{_t('Retry')}</button></div>
    <NotFoundLink />
  </>
  if (!record || !history) return <p role="status" className="page-message">{_t('Loading fit…')}</p>

  function apply(change: (value: History<FitDoc>) => History<FitDoc>, itemNames: Record<number, LName> = {}) {
    if (!record || !historyRef.current) return
    const next = change(historyRef.current)
    if (next === historyRef.current) return
    historyRef.current = next
    histories.set(id, next)
    setHistory(next)
    setSaveError(false)
    void store.save({ ...record, fit: next.present, itemNames }).catch(() => setSaveError(true))
  }

  const names = result ? { ...record.itemNames, ...resultNames(result) } : record.itemNames
  const presentIds = new Set(fitTypeIds(history.present))
  return <FitContext.Provider value={{
    record: { ...record, itemNames: names },
    fit: history.present,
    result,
    removed: removed.filter((item) => presentIds.has(item.typeId)),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    edit: (update, itemNames) => apply((value) => commit(value, update(value.present)), itemNames),
    undo: () => apply(undo),
    redo: () => apply(redo),
  }}>
    {saveError && <p role="alert" className="page-message warn">{_t('Could not save fit')}</p>}
    {calcError && <p role="alert" className="page-message warn">{_t('Could not recalculate fit')}</p>}
    <Outlet />
  </FitContext.Provider>
}

function NotFoundLink() {
  return <div className="fit-inset"><Link className="fit-button primary" to="/">{_t('Back to fittings')}</Link></div>
}

/** Remove modules and offer "Removed X · Undo": undo puts each module (state, charge) back in its own slot position. */
export function useRemoveModules() {
  const { edit } = useFitSession()
  const toast = useToast()
  return (slot: SlotKind, positions: number[], name: string) => {
    const saved = (current: FitDoc) => positions.flatMap((index) => {
      const mod = current.modules[slot][index]
      return mod ? [[index, mod] as const] : []
    })
    let removedModules: (readonly [number, FitModule])[] = []
    edit((current) => {
      removedModules = saved(current)
      return withModules(current, slot, positions, () => null)
    })
    if (!removedModules.length) return
    toast.show({
      message: removedMessage(name, removedModules.length),
      actionLabel: _t('Undo'),
      onAction: () => edit((current) => {
        const modules = [...current.modules[slot]]
        for (const [index, mod] of removedModules) {
          while (modules.length <= index) modules.push(null)
          modules[index] ??= mod
        }
        return { ...current, modules: { ...current.modules, [slot]: modules } }
      }),
    })
  }
}
