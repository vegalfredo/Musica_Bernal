// ═══════════════════════════════════════════════════════════════
//  SERVICE WORKER — Leyendas Bernal PWA
//  Cachea la app y todos los audios para uso sin conexión
// ═══════════════════════════════════════════════════════════════

const CACHE_VERSION = 'leyendas-v1';
const BASE_AUDIO = 'https://raw.githubusercontent.com/vegalfredo/Musica_Bernal/main/';

// Archivos de la app (shell)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

// Todos los archivos de audio del repositorio
const AUDIO_FILES = [
  '00 Musica de Sala.mp3',
  '01 primera llamada Las Leyendas.mp3',
  '02 Musica de Sala.mp3',
  '03 Segunda llamada Las Leyendas.mp3',
  '04 Musica de Sala.mp3',
  '05 Tercera llamada Las Leyendas.mp3',
  '06 Suspenso entrada Viejita.mp3',
  '07 CHAN CHAN CHAAAN.mp3',
  '07 MUSICA AMOR TELENOVELA.mp3',
  '08 MUSICA AMOR TELENOVELA.mp3',
  '09 MUSICA DRAMATIC OK.mp3',
  '09 audio musica funebre.mp3',
  '10 Risa Macabra.mp3',
  '11 Camino hacia el terror.mp3',
  '12 Efecto de Cuervos.mp3',
  '13 MUSICA DIVINA, TENSION Y AGUA.mp3',
  '14 Musica para AGRADECER.mp3',
  '15 Final Satisfactorio.mp3',
  '16 ENYA MUSICA FINAL EPICA.mp3',
  '17 Banda Sonora de miedo LEYENDAS BERNAL.mp3',
].map(f => BASE_AUDIO + encodeURIComponent(f));

// ── INSTALL: cachea el shell de la app ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      console.log('[SW] Instalando app shell...');
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: elimina cachés viejos ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      )
    ).then(() => {
      console.log('[SW] Activado. Versión:', CACHE_VERSION);
      // Cachea los audios en segundo plano tras activar
      cacheAudiosInBackground();
      return self.clients.claim();
    })
  );
});

// ── FETCH: sirve desde caché, si no hay va a red y guarda ───────
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Solo cachear respuestas válidas
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Sin red y sin caché: devuelve página offline para HTML
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── CARGA DE AUDIOS EN SEGUNDO PLANO ───────────────────────────
// Los audios se cachean uno a uno sin bloquear la UI
async function cacheAudiosInBackground() {
  const cache = await caches.open(CACHE_VERSION);
  let cached = 0;

  for (const url of AUDIO_FILES) {
    try {
      const already = await cache.match(url);
      if (already) { cached++; continue; }

      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        cached++;
        // Notifica el progreso a los clientes abiertos
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({
          type: 'CACHE_PROGRESS',
          cached,
          total: AUDIO_FILES.length
        }));
      }
    } catch (e) {
      console.warn('[SW] No se pudo cachear:', url);
    }
  }

  // Notifica que terminó
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({
    type: 'CACHE_COMPLETE',
    total: AUDIO_FILES.length
  }));
}
