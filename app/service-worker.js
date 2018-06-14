// Web push notifications

// Portions Copyright 2016 Peter Beverloo. All rights reserved.
// Use of those portions of this source code is governed by the MIT license.

// Distributes a message to all window clients controlled by the current Service Worker.
function sendMessageToAllClients(command, message) {
  clients.matchAll({type: 'window'}).then(function (windowClients) {
    windowClients.forEach(function (windowClient) {
      windowClient.postMessage({command: command, message: message || ''});
    });
  });
}

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('message', function (event) {
  switch (event.data.command) {
    case 'subscribe':
      const subscriptionOptions = event.data.subscriptionOptions;
      if (subscriptionOptions.hasOwnProperty('applicationServerKey')) {
        subscriptionOptions.applicationServerKey = new Uint8Array(subscriptionOptions.applicationServerKey);
      }

      registration.pushManager.subscribe(subscriptionOptions).then(function (subscription) {
        sendMessageToAllClients('subscribe-success');
      }).catch(function (error) {
        sendMessageToAllClients('subscribe-failure', '' + error);
      });

      break;

    case 'unsubscribe':
      registration.pushManager.getSubscription().then(function (subscription) {
        if (subscription) {
          return subscription.unsubscribe();
        }
      }).then(function () {
        sendMessageToAllClients('unsubscribe-success');
      }).catch(function (error) {
        sendMessageToAllClients('unsubscribe-failure', '' + error);
      });
  }
});

self.addEventListener('push', function (event) {
  console.log({pushEvent: event});

  if (!(self.Notification && self.Notification.permission === 'granted')) {
    return;
  }

  let message = 'New message.';
  if (event.data) {
    message = event.data.text();
  }
  const promiseChain = isClientFocused().then(function (clientIsFocused) {
    if (clientIsFocused) {
      // No need to show a notification.
      return;
    }
    return sendNotification(message);
  })
  event.waitUntil(promiseChain);
});


// Offline copy of pages service worker

// Install stage sets up the index page (home page) in the cache and opens a new cache
self.addEventListener('install', function (event) {
  var indexPage = new Request('/index.html');
  event.waitUntil(fetch(indexPage).then(function (response) {
    return caches.open('offline-cache').then(function (cache) {
      console.log('[Content Cache] Cached index page during Install '+ response.url);
      return cache.put(indexPage, response);
    });
  }).then(function () {
    return skipWaiting();
  }));
});

// If any fetch fails, it will look for the request in the cache and serve it from there first
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') {
    return;
  }

  var updateCache = function (request){
    return caches.open('offline-cache').then(function (cache) {
      return fetch(request).then(function (response) {
        console.log('[Content Cache] add page to offline '+response.url)
        return cache.put(request, response);
      });
    });
  };

  event.waitUntil(updateCache(event.request));

  event.respondWith(fetch(event.request).catch(function (error) {
    console.log('[Content Cache] Network request Failed. Serving content from cache: ' + error);

    // Check to see if you have it in the cache
    // Return response
    // If not in the cache, then return error page
    return caches.open('offline-cache').then(function (cache) {
      return cache.match(event.request).then(function (matching) {
        var report = !matching || matching.status == 404 ? Promise.reject('no-match') : matching;
        return report;
      });
    });
  }));
});


// Utility functions

function isClientFocused () {
  return clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then(function (windowClients) {
    let clientIsFocused = false;

    for (let i = 0; i < windowClients.length; i++) {
      const windowClient = windowClients[i];
      if (windowClient.focused) {
        clientIsFocused = true;
        break;
      }
    }

    return clientIsFocused;
  });
}

function sendNotification (body) {
  const title = 'Tunnelgram';

  return self.registration.showNotification(title, {
    body,
    badge: '/images/badge-96x96.png',
    icon: '/images/web-192x192.png',
    vibrate: [120, 240, 120, 240, 360]
  });
};
