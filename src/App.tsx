import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useIsPresent, type TargetAndTransition } from 'motion/react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { createEngine, type EngineStage } from './engine/client'
import type { EngineProgress } from './engine/progress'
import type { EngineClient } from './engine/types'
import { useUiLanguage } from './i18n/t'
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
import { EngineBoot } from './ui/EngineBoot'
import { Stage, motionSpec } from './ui/motion'
import { ToastProvider } from './ui/Toast'
import { installPressFeedback } from './ui/press'
import { defaultFitStore, type FitStore } from './store/fits'
import './pages/pages.css'

// Dev pages exist only in `vite dev`: import.meta.env.DEV is a build-time constant, so the dynamic
// imports (and the pages) are dropped from production bundles. check-all.sh greps dist/ to prove it.
const Gallery = import.meta.env.DEV ? lazy(() => import('./dev/Gallery')) : null
const TokensPage = import.meta.env.DEV ? lazy(() => import('./dev/TokensPage')) : null

export interface Startup { ready: boolean; stage: EngineStage; progress?: EngineProgress; failed: boolean; retry(): void }

/** An EngineClient whose calls wait for the engine, so pages that do not calculate never block on it. */
export function deferredEngine(ready: Promise<EngineClient>): EngineClient {
  void ready.catch(() => {})
  // 现有的可选方法缺失时的兜底值，保持原来的行为。
  const fallbacks: Record<string, unknown> = { marketGroupsForSlot: [], getDataVersion: '', itemInfo: null }
  // 用 Proxy 转发任意方法名：EngineClient 以后新增的方法不会再被漏掉。
  return new Proxy({} as EngineClient, {
    get(_target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined
      return (...args: unknown[]) => ready.then((engine) => {
        const method = (engine as unknown as Record<string, unknown>)[prop]
        if (typeof method === 'function') return (method as (...a: unknown[]) => unknown).apply(engine, args)
        if (prop in fallbacks) return fallbacks[prop]
        throw new Error(`Engine does not implement ${prop}`)
      })
    },
  })
}

/** The whole app waits on the start page until the engine (Pyodide, eos and the game database) is ready, whatever the route,
 *  so no page appears half-working (UX4, at the user's request; this replaces FX3's non-blocking start). An engine ready within
 *  300 ms (a cached start) goes straight to the page; otherwise the capacitor flashes once full, the start page shrinks away and
 *  the page asked for (deep links included) rises 20 px into place. A failed start shows its error and a retry on the start page. */
function BootGate({ startup, children }: { startup?: Startup; children: ReactNode }) {
  const [mountedAt] = useState(() => performance.now())
  const [phase, setPhase] = useState<'boot' | 'complete' | 'done' | 'instant'>(() => !startup || startup.ready ? 'instant' : 'boot')
  if (startup?.ready && phase === 'boot') setPhase(performance.now() - mountedAt < FAST_START_MS ? 'instant' : 'complete')
  const { reduce, ios, standard } = motionSpec()
  useEffect(() => {
    if (phase !== 'complete') return
    const timer = setTimeout(() => setPhase('done'), reduce ? 120 : 650)
    return () => clearTimeout(timer)
  }, [phase, reduce])
  if (phase === 'instant' || !startup) return <>{children}</>
  return <>
    <AnimatePresence initial={false}>
      {phase !== 'done' && <BootLayer key="boot"
        exit={reduce ? { opacity: 0, transition: { duration: standard } } : { opacity: 0, scale: 0.92, transition: { duration: 0.34, ease: ios } }}>
        <EngineBoot stage={startup.stage} progress={startup.progress} failed={startup.failed} complete={phase === 'complete'}
          delayed onRetry={startup.retry} />
      </BootLayer>}
    </AnimatePresence>
    {phase === 'done' && <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? standard : 0.42, ease: ios, delay: reduce ? 0 : 0.08 }}>{children}</motion.div>}
  </>
}
const FAST_START_MS = 300

/** The start page layer; while it shrinks away it cannot be tapped and is hidden from assistive tech. */
function BootLayer({ exit, children }: { exit: TargetAndTransition; children: ReactNode }) {
  const present = useIsPresent()
  return <motion.div className="boot-layer" inert={!present} aria-hidden={present ? undefined : true} exit={exit}>{children}</motion.div>
}

/** Pages that share a key share one stage item: the fit workspace stays mounted while its pages change inside it. */
function stageKey({ pathname, search }: { pathname: string; search: string }) {
  const fit = /^\/fit\/[^/]+/.exec(pathname)
  if (fit) return fit[0]
  return pathname === '/' && new URLSearchParams(search).has('new') ? '/?new' : pathname
}

export function FittingRoutes({ engine, store, startup }: { engine: EngineClient; store: FitStore; startup?: Startup }) {
  useUiLanguage()
  const location = useLocation()
  return <FitServices engine={engine} store={store}>
    <ToastProvider>
    <div className="fit-app">
      <BootGate startup={startup}>
      <Stage pageKey={stageKey(location)}>
      {/* The location is frozen into the element, so the page that is leaving keeps showing itself. */}
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/fit/:id" element={<FitWorkspace />}>
          <Route index element={<Fit />} />
          <Route path="add/:slot" element={<AddModule />} />
          <Route path="variations/:pos" element={<Variations />} />
        </Route>
        <Route path="/item/:typeId" element={<ItemInfo />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Stage>
      </BootGate>
    </div>
    </ToastProvider>
  </FitServices>
}

function EngineApp() {
  const [engine, setEngine] = useState<EngineClient>()
  const [stage, setStage] = useState<EngineStage>('runtime')
  const [progress, setProgress] = useState<EngineProgress>()
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
      void createEngine((stage) => { if (current) setStage(stage) }, (progress) => { if (current) setProgress(progress) }).then(
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
    ready: Boolean(engine), stage, progress, failed: error,
    retry() { setStage('runtime'); setProgress(undefined); setError(false); setAttempt((n) => n + 1) },
  }
  return <FittingRoutes engine={resolvers.proxy} store={defaultFitStore()} startup={startup} />
}

export default function App() {
  useEffect(() => installPressFeedback(), [])
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
