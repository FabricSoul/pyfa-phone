/**
 * 在安全上下文注册 Service Worker。首次接管时保留当前页面，
 * 后续新版本接管时刷新一次，以便加载同版本的应用和数据。
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      let controlled = navigator.serviceWorker.controller !== null
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!navigator.serviceWorker.controller || refreshing) return
        if (!controlled) {
          controlled = true
          return
        }
        refreshing = true
        window.location.reload()
      })
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => { void registration.update().catch(() => {}) })
        .catch((error) => { console.warn('[sw]', error) })
    }, { once: true })
  }
}
