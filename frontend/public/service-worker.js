// public/service-worker.js
const CACHE_NAME = 'dns-radio-v1';
const OFFLINE_URL = '/';

// Кэширование ресурсов для офлайн-режима
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        OFFLINE_URL,
        '/index.html',
      ]);
    })
  );
  self.skipWaiting();
});

// Обработка запросов для офлайн-режима
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const requestUrl = new URL(url);
  const isMedia = url.includes('/public/retail/radio/music/') || url.includes('/radio/stream/');
  const isRangeRequest = event.request.headers && event.request.headers.get('range');

  // Проверяем, является ли запрос внешним (к другому домену)
  // Используем проверку по домену, так как self.location может быть недоступен
  const hostname = requestUrl.hostname;
  
  // Список известных внешних доменов, которые не должны обрабатываться Service Worker
  const externalDomains = ['api.weatherapi.com', 'weatherapi.com'];
  const isKnownExternal = externalDomains.some(domain => hostname.includes(domain));
  
  // Проверяем, является ли запрос внутренним (к нашему серверу)
  const isInternalRequest = hostname.includes('localhost') || 
                            hostname.includes('10.0.150.57') || 
                            hostname.includes('dns-zs.partner.ru') ||
                            hostname.includes('127.0.0.1');
  
  // Для внешних API - не перехватываем запросы вообще, пропускаем их напрямую
  if (isKnownExternal || !isInternalRequest) {
    // Не обрабатываем внешние запросы через Service Worker
    return;
  }

  // Для музыкальных файлов - не кэшируем частичные ответы (206) и RANGE-запросы
  if (isMedia) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request).then((response) => {
          // Кэшируем только полноценные успешные ответы (200) без Content-Range
          const isFullOk = response && response.ok && response.status === 200 && !response.headers.has('Content-Range');
          const isCacheableType = response && (response.type === 'basic' || response.type === 'cors');
          if (!isRangeRequest && isFullOk && isCacheableType) {
            try { cache.put(event.request, response.clone()); } catch (e) { /* skip */ }
          }
          return response;
        }).catch(() => {
          return cache.match(event.request).then((cached) => {
            return cached || new Response('No connection', { status: 503 });
          });
        });
      })
    );
    return;
  }
  
  // Для остальных внутренних запросов - используем стратегию Network First
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((cached) => {
        return cached || new Response('Offline', { status: 503 });
      });
    })
  );
});

// Очистка старых кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Push notifications
self.addEventListener('push', function(event) {
  const data = event.data?.json() || { title: 'Notification', message: 'New notification' };
  const options = {
    body: data.message,
    icon: '/notification-icon.png'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow('/')
  );
});