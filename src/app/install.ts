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
    emit()
  })
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
