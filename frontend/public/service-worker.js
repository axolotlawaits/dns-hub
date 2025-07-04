// public/service-worker.js
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