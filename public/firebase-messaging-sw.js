// public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAM2V_YgVEpZgz-uDXwQ4jxEfwhOSsJQUA",
  authDomain: "kvintip-dfa19.firebaseapp.com",
  projectId: "kvintip-dfa19",
  storageBucket: "kvintip-dfa19.firebasestorage.app",
  messagingSenderId: "533176587446",
  appId: "1:533176587446:web:b030dc7abb3c44a2af4217"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Přišla notifikace na pozadí:', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/android-chrome-192x192.png', // Opraveno podle tvých reálných ikon
    badge: '/android-chrome-192x192.png', 
    data: {
      url: payload.data?.url || '/' 
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});