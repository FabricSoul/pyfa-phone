import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'
import { registerServiceWorker } from './sw-register'

// 跟随系统深浅色；设置页以后可以手动覆盖 data-appearance。
const mq = matchMedia('(prefers-color-scheme: dark)')
const apply = () => document.documentElement.setAttribute('data-appearance', mq.matches ? 'dark' : 'light')
apply(); mq.addEventListener('change', apply)

registerServiceWorker()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
