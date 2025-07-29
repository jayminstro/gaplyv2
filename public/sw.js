// Service Worker for Gaply Mobile App
const CACHE_NAME = 'gaply-v1';
const STATIC_CACHE_NAME = 'gaply-static-v1';
const DYNAMIC_CACHE_NAME = 'gaply-dynamic-v1';

// Files to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon-192x192.png',
  '/icons/maskable-icon-512x512.png'
];

// Dynamic assets (API responses, user data)
const DYNAMIC_CACHE_URLS = [
  '/api/',
  'https://*.supabase.co/rest/v1/',
  'https://*.supabase.co/functions/v1/'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
        console.log('Dynamic cache created');
        return Promise.resolve();
      })
    ]).then(() => {
      console.log('Service Worker installation complete');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activation complete');
      return self.clients.claim();
    })
  );
});

// Fetch event - implement caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  event.respondWith(
    handleFetch(request)
  );
});

async function handleFetch(request) {
  const url = new URL(request.url);
  
  // Strategy for static assets: Cache First
  if (isStaticAsset(request)) {
    return cacheFirst(request, STATIC_CACHE_NAME);
  }
  
  // Strategy for API calls: Network First with cache fallback
  if (isAPIRequest(request)) {
    return networkFirstWithCache(request, DYNAMIC_CACHE_NAME);
  }
  
  // Strategy for app shell: Cache First with network fallback
  if (isAppShellRequest(request)) {
    return cacheFirstWithNetworkFallback(request, STATIC_CACHE_NAME);
  }
  
  // Default: Network First
  return networkFirst(request);
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
}

function isAPIRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || 
         url.hostname.includes('supabase.co') ||
         url.pathname.includes('/functions/v1/');
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return url.pathname === '/' || url.pathname.startsWith('/?');
}

async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Serving from cache:', request.url);
      return cachedResponse;
    }
    
    console.log('Fetching and caching:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Cache first failed:', error);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirstWithCache(request, cacheName) {
  try {
    console.log('Network first for API:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      console.log('Cached API response:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', request.url);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Serving stale API data from cache:', request.url);
      return cachedResponse;
    }
    
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirstWithNetworkFallback(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Serving app shell from cache:', request.url);
      return cachedResponse;
    }
    
    console.log('App shell not in cache, fetching:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('App shell fetch failed:', error);
    // Return a basic offline page or cached index
    const cache = await caches.open(cacheName);
    const offlineResponse = await cache.match('/');
    return offlineResponse || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('Network request failed:', error);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks());
  } else if (event.tag === 'sync-preferences') {
    event.waitUntil(syncPreferences());
  }
});

async function syncTasks() {
  try {
    console.log('Syncing tasks in background...');
    // Implement task synchronization logic here
    // This would typically involve sending queued offline actions to the server
  } catch (error) {
    console.error('Background task sync failed:', error);
  }
}

async function syncPreferences() {
  try {
    console.log('Syncing preferences in background...');
    // Implement preferences synchronization logic here
  } catch (error) {
    console.error('Background preferences sync failed:', error);
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Push message received:', event);
  
  const options = {
    body: event.data ? event.data.text() : 'New notification from Gaply',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icons/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Dismiss',
        icon: '/icons/icon-192x192.png'
      }
    ],
    requireInteraction: true,
    silent: false
  };
  
  event.waitUntil(
    self.registration.showNotification('Gaply', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default click action
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling for communication with the main app
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CACHE_URLS') {
    // Cache specific URLs requested by the app
    const urls = event.data.urls;
    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
      return cache.addAll(urls);
    });
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    // Clear all caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    });
  }
});

console.log('Gaply Service Worker loaded successfully');