// ═══════════════════════════════════════════════════════════════
//  SERVICE WORKER — Música Bernal PWA  v2
//  Estrategia: los audios se sirven desde GitHub Pages (mismo
//  dominio), así no hay problemas de CORS ni de encoding de URLs.
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'musica-bernal-v2';

// Archivos del shell de la app
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

// Nombres exactos de los archivos de audio (mismo directorio que index.html)
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
];

// ── INSTALL ─────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Eliminando caché viejo:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => precargarAudios())
  );
});

// ── FETCH: Cache First para audios, Network First para el resto ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const esAudio = url.pathname.endsWith('.mp3');

  if (esAudio) {
    // AUDIO → Cache First: si está en caché lo devuelve SIN red
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) {
          console.log('[SW] Desde caché:', url.pathname);
          return cached;
        }
        // No está en caché, lo descarga y lo guarda
        console.log('[SW] Descargando y cacheando:', url.pathname);
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (e) {
          console.error('[SW] Sin red y sin caché para:', url.pathname);
          return new Response('Audio no disponible sin conexión', { status: 503 });
        }
      })
    );
  } else {
    // APP SHELL → Cache First también
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});

// ── PRE-CARGA DE AUDIOS EN SEGUNDO PLANO ───────────────────────
async function precargarAudios() {
  const cache = await caches.open(CACHE_NAME);
  const base = self.registration.scope; // ej: https://vegalfredo.github.io/Musica_Bernal/
  let cargados = 0;
  const total = AUDIO_FILES.length;

  console.log('[SW] Iniciando pre-carga de', total, 'audios desde:', base);

  for (const archivo of AUDIO_FILES) {
    const url = base + encodeURIComponent(archivo);
    try {
      // Verificar si ya está en caché
      const yaEnCache = await cache.match(url);
      if (yaEnCache) {
        cargados++;
        notificarProgreso(cargados, total);
        continue;
      }

      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        cargados++;
        console.log('[SW] Cacheado:', archivo, `(${cargados}/${total})`);
        notificarProgreso(cargados, total);
      } else {
        console.warn('[SW] Error HTTP', response.status, 'para:', archivo);
      }
    } catch (e) {
      console.warn('[SW] Fallo al cachear:', archivo, e.message);
    }
  }

  notificarCompleto(total);
}

function notificarProgreso(cargados, total) {
  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.postMessage({
      type: 'CACHE_PROGRESS', cargados, total
    }))
  );
}

function notificarCompleto(total) {
  console.log('[SW] Pre-carga completa:', total, 'audios');
  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.postMessage({
      type: 'CACHE_COMPLETE', total
    }))
  );
}
