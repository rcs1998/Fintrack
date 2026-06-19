// Service Worker mínimo do FinTrack.
// Por enquanto, apenas habilita o critério de instalabilidade do PWA
// no Android (Chrome exige um SW registrado para oferecer "Instalar app").
// O cache para uso offline será implementado em uma etapa futura.

const SW_VERSION = 'fintrack-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Por ora, deixamos toda requisição passar direto para a rede,
// sem interceptar nem cachear nada — o app continua se comportando
// exatamente como antes, só ganha a capacidade de ser instalado.
self.addEventListener('fetch', (event) => {
  // Intencionalmente vazio: sem fetch.respondWith(), o navegador
  // trata a requisição normalmente.
});
