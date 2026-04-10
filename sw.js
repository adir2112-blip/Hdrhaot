// Service Worker for Web Push Notifications
// Version: 1.0

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'מערכת תדריכים';
  const options = {
    body: data.body || 'יש תדריך חדש ממתין לך',
    icon: data.icon || '/Hdrhaot/icon-192.png',
    badge: '/Hdrhaot/icon-192.png',
    tag: data.tag || 'briefing',
    requireInteraction: true,
    dir: 'rtl',
    lang: 'he',
    data: { url: data.url || '/Hdrhaot/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/Hdrhaot/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/Hdrhaot/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
