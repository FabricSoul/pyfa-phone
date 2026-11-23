import { HashRouter, Route, Routes } from 'react-router-dom'
import TokensPage from './dev/TokensPage'

function Home() {
  return <main className="p-4"><h1 style={{ font: 'var(--type-page)' }}>pyfa</h1></main>
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
