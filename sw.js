/* FlowForce · Service Worker v1.2.0
   Cache + Notificaciones locales + Shortcuts */

const CACHE = 'flowforce-v1.2.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './screenshot-wide.png',
  './screenshot-narrow.png',
  './splash-iphone-15-pro-max-1290x2796.png',
  './splash-iphone-15-pro-1179x2556.png',
  './splash-iphone-14-1170x2532.png',
  './splash-iphone-x-1125x2436.png',
  './splash-iphone-xr-828x1792.png',
  './splash-iphone-8-750x1334.png',
  './splash-ipad-pro-12-2048x2732.png',
  './splash-ipad-pro-11-1668x2388.png',
  './splash-ipad-mini-1536x2048.png',
];

/* ============ INSTALL ============ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ============ ACTIVATE ============ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ============ FETCH ============ */
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

/* ============ MENSAJES ============ */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'SCHEDULE_REMINDER') {
    scheduleReminder(event.data.hour, event.data.minute);
  }
  if (event.data?.type === 'CANCEL_REMINDER') {
    cancelReminder();
  }
  if (event.data?.type === 'TEST_NOTIFICATION') {
    showReminderNotification(true);
  }
});

/* ============ RECORDATORIOS ============ */
let reminderTimeout = null;

function scheduleReminder(hour, minute) {
  cancelReminder();
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  console.log(`[SW] Recordatorio programado en ${Math.round(delay / 1000 / 60)} min`);
  reminderTimeout = setTimeout(() => {
    showReminderNotification();
    scheduleReminder(hour, minute);
  }, delay);
}

function cancelReminder() {
  if (reminderTimeout) {
    clearTimeout(reminderTimeout);
    reminderTimeout = null;
    console.log('[SW] Recordatorio cancelado');
  }
}

async function showReminderNotification(isTest = false) {
  const title = isTest ? '🔔 Recordatorio de prueba' : '🌅 Es hora de tu práctica';
  const body = isTest
    ? 'Así se verá tu recordatorio diario.'
    : 'Unos minutos de FlowForce para empezar el día con fuerza y calma.';

  const options = {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    image: './screenshot-wide.png',
    vibrate: [200, 100, 200],
    tag: 'flowforce-daily',
    renotify: true,
    requireInteraction: false,
    data: { url: './?action=quick', timestamp: Date.now() },
    actions: [
      { action: 'start', title: '▶ Empezar rutina' },
      { action: 'snooze', title: '⏰ En 30 min' },
    ],
  };

  await self.registration.showNotification(title, options);
}

/* ============ CLICK EN NOTIFICACIÓN ============ */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};

  if (action === 'snooze') {
    reminderTimeout = setTimeout(() => {
      showReminderNotification();
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'GET_REMINDER_TIME' }));
      });
    }, 30 * 60 * 1000);
    return;
  }

  const url = data.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if ('focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICKED', action });
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});

/* ============ PUSH (opcional) ============ */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '🌅 FlowForce';
  const options = {
    body: data.body || 'Es hora de tu práctica',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'flowforce-push',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ============ PERIODIC SYNC ============ */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(showReminderNotification());
  }
});