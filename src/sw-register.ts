/**
 * Service Worker 注册模块。
 *
 * 只在安全上下文（window.isSecureContext）以及支持 serviceWorker 的环境中注册。
 * 新版本安装并激活接管（controllerchange）后自动刷新一次页面。
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          let refreshing = false
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return
            refreshing = true
            window.location.reload()
          })
          reg.update().catch(() => {})
        })
        .catch((e) => {
          console.warn('[sw]', e)
        })
    })
  }
}
