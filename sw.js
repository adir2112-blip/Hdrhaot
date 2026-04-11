self.addEventListener('push', e => {
  console.log('[SW] Push received!', e.data?.text());
  
  let title = 'תדריך חדש 📋';
  let body = '';
  let url = 'https://adir2112-blip.github.io/Hdrhaot/';

  try {
    const data = e.data?.json();
    title = data.title || title;
    body  = data.body  || body;
    url   = data.data?.url || url;
  } catch {
    body = e.data?.text() || '';
  }

  console.log('[SW] Showing notification:', title, body);

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/Hdrhaot/icon-192.png',
      badge: '/Hdrhaot/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      tag: 'briefing-new',
      renotify: true,
      data: { url }
    }).then(() => console.log('[SW] Notification shown!'))
      .catch(err => console.error('[SW] Notification error:', err))
  );
});

self.addEventListener('message', e => {
  console.log('[SW] Message received:', e.data);
  e.source?.postMessage({type: 'pong'});
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
