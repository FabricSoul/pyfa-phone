import { HashRouter, Route, Routes } from 'react-router-dom'
import Gallery from './dev/Gallery'
import TokensPage from './dev/TokensPage'
import { mockEngine } from './engine/mockClient'
import type { EngineClient } from './engine/types'
import { AddModule } from './pages/AddModule'
import { Fit } from './pages/Fit'
import { FitServices, FitWorkspace } from './pages/fitSession'
import { Home } from './pages/Home'
import { ItemInfo } from './pages/ItemInfo'
import { Variations } from './pages/Variations'
import { createFitStore, type FitStore } from './store/fits'
import './pages/pages.css'

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

let store: FitStore | undefined

export default function App() {
  store ??= createFitStore(indexedDB)
  return (
    <HashRouter>
      <Routes>
        <Route path="/dev/tokens" element={<TokensPage />} />
        <Route path="/dev/gallery" element={<Gallery />} />
        <Route path="*" element={<FittingRoutes engine={mockEngine} store={store} />} />
      </Routes>
    </HashRouter>
  )
}
