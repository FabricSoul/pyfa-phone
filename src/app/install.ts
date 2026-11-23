/**
 * beforeinstallprompt 的捕获必须发生在【React 挂载之前】。
 *
 * 这个事件在页面加载后很早就触发一次，而本应用要初始化 Pyodide 和数据，
 * 组件里再监听就错过了 —— 必须在模块顶层接住并 preventDefault，同时处理 appinstalled。
 */
export type BIP = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: BIP | null = null
const subs = new Set<(v: BIP | null) => void>()

const emit = () => subs.forEach((f) => f(deferred))

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BIP
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    markInstalled()
    emit()
  })
}

/** Set once the browser reports the app installed: only installing hides the install prompts for good. */
const INSTALLED = 'pyfa.installed'
/** The card's X: hidden for this session only (sessionStorage). The old permanent flag lived in localStorage. */
const DISMISSED = 'pyfa.installDismissed'

function markInstalled() {
  try { localStorage.setItem(INSTALLED, '1') } catch { /* storage blocked: the standalone check still applies */ }
}

/** True when this browser reported the app installed (appinstalled); combine with isStandalone(). */
export function installedFlag(): boolean {
  try { return localStorage.getItem(INSTALLED) === '1' } catch { return false }
}

/** Whether the install card was closed in this session. Also clears the old permanent dismissal. */
export function installDismissedThisSession(): boolean {
  try { localStorage.removeItem(DISMISSED) } catch { /* nothing to clear */ }
  try { return sessionStorage.getItem(DISMISSED) === '1' } catch { return false }
}

export function dismissInstallForSession(): void {
  try { sessionStorage.setItem(DISMISSED, '1') } catch { /* storage blocked: hidden until reload */ }
}

export const getInstallPrompt = () => deferred

export function onInstallPrompt(f: (v: BIP | null) => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}

export const isStandalone = () => {
  if (typeof window === 'undefined') return false
  return (
    (typeof matchMedia !== 'undefined' && (
      matchMedia('(display-mode: standalone)').matches ||
      matchMedia('(display-mode: window-controls-overlay)').matches
    )) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export const isIOS = () => {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** 粗略判断是不是手机/平板 —— 桌面不显示安装卡片 */
export const isMobile = () => {
  if (typeof navigator === 'undefined') return false
  return (
    isIOS() ||
    /Android|Mobile|Tablet|Silk/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
  )
}
