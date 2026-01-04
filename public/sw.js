/* Minimal, dependency-free service worker for basic offline support.
   (Vite PWA plugins can replace this later if you want more robust caching.) */

const CACHE_NAME = 'creatine-tracker-static-v1'
const PRECACHE_URLS = ['/', '/index.html', '/manifest.webmanifest', '/creatine.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(req)
      if (cached) {
        // Refresh in the background.
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone())
            })
            .catch(() => {}),
        )
        return cached
      }

      try {
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      } catch {
        // If navigation, try to serve the app shell.
        if (req.mode === 'navigate') {
          const shell = await cache.match('/index.html')
          if (shell) return shell
        }
        throw new Error('Network error and no cache hit')
      }
    })(),
  )
})


