/* pyfa-phone Service Worker */

const BUILD_HASH = 'dev'
const DATA_VERSION = 'dev'
const CACHE_NAME = 'pyfa-dev-dev'
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[sw] Precache failed:', err)
      })
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith('pyfa-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // 价格接口（fuzzwork、esi.evetech.net）只走网络，不缓存
  if (url.hostname.includes('fuzzwork.co.uk') || url.hostname.includes('esi.evetech.net')) {
    return
  }

  // 跨域资源不走本地缓存处理（走默认网络行为）
  if (url.origin !== location.origin) {
    return
  }

  // 导航请求：缓存优先、后台更新
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const hit =
          (await cache.match(request)) ??
          (await cache.match('/index.html')) ??
          (await cache.match('./index.html'))

        const bgFetch = fetch(request)
          .then(async (res) => {
            if (res.ok) {
              const c = await caches.open(CACHE_NAME)
              await c.put(request, res.clone())
            }
            return res
          })
          .catch(() => null)

        if (hit) return hit

        const netRes = await bgFetch
        if (netRes) return netRes

        return (
          (await cache.match('/index.html')) ??
          (await cache.match('./index.html')) ??
          Response.error()
        )
      })()
    )
    return
  }

  // /data/* 走缓存优先
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const hit = await cache.match(request)
        if (hit) return hit
        try {
          const res = await fetch(request)
          if (res.ok) {
            cache.put(request, res.clone())
          }
          return res
        } catch (err) {
          throw err
        }
      })()
    )
    return
  }

  // 其余同源静态资源（JS/CSS/图标等）：缓存优先，回落网络
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(request)
      if (hit) return hit
      try {
        const res = await fetch(request)
        if (res.ok) {
          cache.put(request, res.clone())
        }
        return res
      } catch (err) {
        if (request.destination === 'document') {
          return (
            (await cache.match('/index.html')) ??
            (await cache.match('./index.html')) ??
            Response.error()
          )
        }
        throw err
      }
    })()
  )
})
