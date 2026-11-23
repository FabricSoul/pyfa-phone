import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { createEngine, type EngineStage } from './engine/client'
import type { EngineClient } from './engine/types'
import { _t, useUiLanguage } from './i18n/t'
import About from './pages/About'
import { AddModule } from './pages/AddModule'
import { Fit } from './pages/Fit'
import { FitServices, FitWorkspace } from './pages/fitSession'
import { Home } from './pages/Home'
import Import from './pages/Import'
import { ItemInfo } from './pages/ItemInfo'
import Settings from './pages/Settings'
import { NotFound } from './pages/shared'
import { Variations } from './pages/Variations'
import { ToastProvider } from './ui/Toast'
import { defaultFitStore, type FitStore } from './store/fits'
import './pages/pages.css'

// Dev pages exist only in `vite dev`: import.meta.env.DEV is a build-time constant, so the dynamic
// imports (and the pages) are dropped from production bundles. check-all.sh greps dist/ to prove it.
const Gallery = import.meta.env.DEV ? lazy(() => import('./dev/Gallery')) : null
const TokensPage = import.meta.env.DEV ? lazy(() => import('./dev/TokensPage')) : null

export interface Startup { ready: boolean; stage: EngineStage; failed: boolean; retry(): void }
const StartupContext = createContext<Startup | null>(null)

/** An EngineClient whose calls wait for the engine, so pages that do not calculate never block on it. */
export function deferredEngine(ready: Promise<EngineClient>): EngineClient {
  void ready.catch(() => {})
  return {
    calc: (...a) => ready.then((e) => e.calc(...a)),
    itemsForSlot: (...a) => ready.then((e) => e.itemsForSlot(...a)),
    marketGroupsForSlot: (...a) => ready.then((e) => e.marketGroupsForSlot?.(...a) ?? []),
    chargesFor: (...a) => ready.then((e) => e.chargesFor(...a)),
    variationsOf: (...a) => ready.then((e) => e.variationsOf(...a)),
    importText: (...a) => ready.then((e) => e.importText(...a)),
    exportText: (...a) => ready.then((e) => e.exportText(...a)),
    missingSkills: (...a) => ready.then((e) => e.missingSkills(...a)),
    getDataVersion: () => ready.then((e) => e.getDataVersion?.() ?? ''),
    itemInfo: (...a) => ready.then((e) => e.itemInfo?.(...a) ?? null),
  }
}

/** Pages that calculate show startup progress until the engine is ready. */
function NeedsEngine({ children }: { children: ReactNode }) {
  const startup = useContext(StartupContext)
  if (!startup || startup.ready) return <>{children}</>
  return <EngineProgress startup={startup} />
}

/** Shown on every page: the pages that need the engine cannot work, the rest still can. */
function EngineFailure() {
  const startup = useContext(StartupContext)
  if (!startup?.failed) return null
  return <div className="engine-failure" role="alert">
    <p>{_t('Could not start the fitting engine')}</p>
    <button type="button" className="fit-button primary" onClick={startup.retry}>{_t('Retry')}</button>
  </div>
}

function EngineProgress({ startup }: { startup: Startup }) {
  return <main className="fit-app engine-startup">
    <h1>{_t('Fittings')}</h1>
    {!startup.failed && <>
      <p role="status" id="engine-stage">{stageLabel(startup.stage)}</p>
      <progress aria-labelledby="engine-stage" max={stages.length} value={stages.indexOf(startup.stage)} />
    </>}
  </main>
}

export function FittingRoutes({ engine, store, startup }: { engine: EngineClient; store: FitStore; startup?: Startup }) {
  useUiLanguage()
  return <StartupContext.Provider value={startup ?? null}><FitServices engine={engine} store={store}>
    <ToastProvider>
    <div className="fit-app">
      <EngineFailure />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/import" element={<NeedsEngine><Import /></NeedsEngine>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/fit/:id" element={<NeedsEngine><FitWorkspace /></NeedsEngine>}>
          <Route index element={<Fit />} />
          <Route path="add/:slot" element={<AddModule />} />
          <Route path="variations/:pos" element={<Variations />} />
        </Route>
        <Route path="/item/:typeId" element={<NeedsEngine><ItemInfo /></NeedsEngine>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
    </ToastProvider>
  </FitServices></StartupContext.Provider>
}

const stages = ['runtime', 'data', 'initialize'] as const

function stageLabel(stage: EngineStage) {
  switch (stage) {
    case 'runtime': return _t('Downloading Python runtime…')
    case 'data': return _t('Downloading game data…')
    case 'initialize': return _t('Initializing fitting engine…')
  }
}

function EngineApp() {
  const [engine, setEngine] = useState<EngineClient>()
  const [stage, setStage] = useState<EngineStage>('runtime')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const resolvers = useMemo(() => {
    const r = {} as { resolve(e: EngineClient): void }
    const promise = new Promise<EngineClient>((resolve) => { r.resolve = resolve })
    return { promise, resolve: r.resolve, proxy: deferredEngine(promise) }
  }, [])

  useEffect(() => {
    let current = true
    // StrictMode tears down the first effect before this timer can create a Worker.
    const timer = setTimeout(() => {
      void createEngine((stage) => { if (current) setStage(stage) }).then(
        (client) => { resolvers.resolve(client); if (current) setEngine(client) },
        (error) => {
          if (!current) return
          console.error('Could not start fitting engine', error)
          setError(true)
        },
      )
    }, 0)
    return () => { current = false; clearTimeout(timer) }
  }, [attempt, resolvers])

  const startup: Startup = {
    ready: Boolean(engine), stage, failed: error,
    retry() { setStage('runtime'); setError(false); setAttempt((n) => n + 1) },
  }
  return <FittingRoutes engine={resolvers.proxy} store={defaultFitStore()} startup={startup} />
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Suspense fallback={null}>
          <Routes>
            {TokensPage && <Route path="/dev/tokens" element={<TokensPage />} />}
            {Gallery && <Route path="/dev/gallery" element={<Gallery />} />}
            <Route path="*" element={<EngineApp />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </MotionConfig>
  )
}
