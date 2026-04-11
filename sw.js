self.addEventListener('push', e => {
  let title = 'תדריך חדש 📋';
  let body = '';
  let url = 'https://adir2112-blip.github.io/Hdrhaot/';

  try {
    const data = e.data?.json();
    title = data.title || title;
    body  = data.body  || body;
    url   = data.data?.url || url;
  } catch {
    // אם לא JSON — השתמש בטקסט כ-body
    body = e.data?.text() || '';
  }

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
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
