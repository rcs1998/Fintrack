const CACHE = 'fintrack-v5';

// Só cacheia fontes — nunca o app em si
const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
  'https://fonts.gstatic.com/s/sora/v12/xMQOuFFYT72X5wkB_18qmnndmSfSnCSud4Rvzd1K_A.woff2',
];

self.addEventListener('install', e => {
  self.skipWaiting(); // assume controle imediatamente
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(STATIC_ASSETS.map(url => c.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // NUNCA intercepta o index.html — deixa o browser buscar sempre da rede
  if (
    url.endsWith('/') ||
    url.endsWith('/index.html') ||
    url.includes('index.html') ||
    url === self.location.origin + '/'
  ) return;

  // NUNCA intercepta Firebase
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('/__/auth/')
  ) return;

  // Fontes: Cache First
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => cached || fetch(e.request).then(res => {
          cache.put(e.request, res.clone());
          return res;
        }))
      )
    );
  }
  // Todo o resto: sem interceptação, vai direto para a rede
});
