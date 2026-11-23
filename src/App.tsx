import { lazy, Suspense, useEffect, useState } from 'react'
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

export function FittingRoutes({ engine, store }: { engine: EngineClient; store: FitStore }) {
  useUiLanguage()
  return <FitServices engine={engine} store={store}>
    <ToastProvider>
    <div className="fit-app">
      <Routes>
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
    </div>
    </ToastProvider>
  </FitServices>
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

  useEffect(() => {
    let current = true
    // StrictMode tears down the first effect before this timer can create a Worker.
    const timer = setTimeout(() => {
      void createEngine((stage) => { if (current) setStage(stage) }).then(
        (client) => { if (current) setEngine(client) },
        (error) => {
          if (!current) return
          console.error('Could not start fitting engine', error)
          setError(true)
        },
      )
    }, 0)
    return () => { current = false; clearTimeout(timer) }
  }, [attempt])

  if (engine) return <FittingRoutes engine={engine} store={defaultFitStore()} />

  return <main className="fit-app engine-startup">
    <h1>{_t('Fittings')}</h1>
    {error ? <>
      <p role="alert">{_t('Could not start the fitting engine')}</p>
      <button type="button" className="fit-button primary" onClick={() => {
        setStage('runtime')
        setError(false)
        setAttempt((attempt) => attempt + 1)
      }}>{_t('Retry')}</button>
    </> : <>
      <p role="status" id="engine-stage">{stageLabel(stage)}</p>
      <progress aria-labelledby="engine-stage" max={stages.length} value={stages.indexOf(stage)} />
    </>}
  </main>
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
