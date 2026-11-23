import { HashRouter, Route, Routes } from 'react-router-dom'
import TokensPage from './dev/TokensPage'
import { _t, useUiLanguage } from './i18n/t'

function Home() {
  useUiLanguage()
  return <main className="p-4"><h1 style={{ font: 'var(--type-page)' }}>{_t('pyfa')}</h1></main>
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dev/tokens" element={<TokensPage />} />
      </Routes>
    </HashRouter>
  )
}
