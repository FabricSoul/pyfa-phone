import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initApp } from './i18n/initial'
import './styles/app.css'
import { registerServiceWorker } from './sw-register'

registerServiceWorker()
void initApp().catch((error) => console.error('Could not load interface translations', error)).then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
})
