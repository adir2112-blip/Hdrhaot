self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'תדריך חדש 📋', {
      body: data.body || '',
      icon: '/Hdrhaot/icon-192.png',
      badge: '/Hdrhaot/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      tag: 'briefing-new',
      renotify: true,
      data: { url: 'https://adir2112-blip.github.io/Hdrhaot/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
