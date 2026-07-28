// firebase-messaging-sw.js
// Service worker DEDICADO ao Firebase Cloud Messaging.
// O FCM exige que esse arquivo tenha exatamente esse nome e fique na RAIZ do site
// (mesmo nível do index.html) — é ele que acorda e mostra a notificação de sistema
// quando o app está fechado ou em segundo plano.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Mesma config do index.html — precisa ser idêntica.
firebase.initializeApp({
  apiKey: "AIzaSyByoauTX_Pap5cSzTpP43yjJspE5uBx2-c",
  authDomain: "fintrack-7183d.firebaseapp.com",
  projectId: "fintrack-7183d",
  storageBucket: "fintrack-7183d.firebasestorage.app",
  messagingSenderId: "254350101059",
  appId: "1:254350101059:web:fd7f1a1bddb8433dfda2f6"
});

const messaging = firebase.messaging();

// Dispara quando chega um push e o app NÃO está em primeiro plano
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const title = n.title || 'FinTrack';
  const options = {
    body: n.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: payload.data?.tag || 'fintrack-bill',
  };
  self.registration.showNotification(title, options);
});

// Ao clicar na notificação, abre (ou foca) o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
