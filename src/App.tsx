import { HashRouter, Route, Routes } from 'react-router-dom'
import Gallery from './dev/Gallery'
import TokensPage from './dev/TokensPage'
import { mockEngine } from './engine/mockClient'
import type { EngineClient } from './engine/types'
import { initApp } from './i18n/initial'
import About from './pages/About'
import { AddModule } from './pages/AddModule'
import { Fit } from './pages/Fit'
import { FitServices, FitWorkspace } from './pages/fitSession'
import { Home } from './pages/Home'
import Import from './pages/Import'
import { ItemInfo } from './pages/ItemInfo'
import Settings from './pages/Settings'
import { Variations } from './pages/Variations'
import { defaultFitStore, type FitStore } from './store/fits'
import './pages/pages.css'

// Apply the stored theme / browser-derived UI language before the first page renders.
initApp()

export function FittingRoutes({ engine, store }: { engine: EngineClient; store: FitStore }) {
  return <FitServices engine={engine} store={store}>
    <div className="fit-app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fit/:id" element={<FitWorkspace />}>
          <Route index element={<Fit />} />
          <Route path="add/:slot" element={<AddModule />} />
          <Route path="variations/:pos" element={<Variations />} />
        </Route>
        <Route path="/item/:typeId" element={<ItemInfo />} />
      </Routes>
    </div>
  </FitServices>
}

export default function App() {
  const store = defaultFitStore()
  return (
    <HashRouter>
      <Routes>
        <Route path="/about" element={<About />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/dev/tokens" element={<TokensPage />} />
        <Route path="/dev/gallery" element={<Gallery />} />
        <Route path="*" element={<FittingRoutes engine={mockEngine} store={store} />} />
      </Routes>
    </HashRouter>
  )
}
