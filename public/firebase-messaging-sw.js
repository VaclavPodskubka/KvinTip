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

// Správné ošetření pozadí: Necháme systém vyrenderovat notifikaci z payloadu.
// Service worker ji už nesmí duplikovat!
messaging.onBackgroundMessage((payload) => {
  console.log('🔔 Firebase doručil notifikaci na pozadí systému:', payload);
  // Už zde nevoláme self.registration.showNotification! 
  // Firebase Admin SDK posílá objekt "notification", takže OS ji ukáže automaticky sám.
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Načtení URL adresy z dat notifikace, která přišla ze serveru
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