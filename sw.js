// ═══════════════════════════════════════════════════════════════
//  SERVICE WORKER — Música Bernal PWA  v3
//
//  PROBLEMA RESUELTO: los navegadores móviles usan "Range Requests"
//  para audio (piden el archivo por fragmentos). El SW debe responder
//  a esas peticiones parciales desde el caché, de lo contrario
//  el audio no se reproduce sin conexión.
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'musica-bernal-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

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
  console.log('[SW v3] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW v3] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => precargarAudios())
  );
});

// ── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const esAudio = url.includes('.mp3');

  if (esAudio) {
    // Los audios necesitan manejo especial para Range Requests
    event.respondWith(handleAudioRequest(event.request));
  } else {
    // App shell: cache first
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});

// ── MANEJO ESPECIAL DE AUDIO CON RANGE REQUESTS ──────────────────
// Esta es la clave: cuando el navegador pide un rango del audio
// (ej: bytes 0-65535), servimos ese rango desde el archivo completo
// que tenemos en caché.
async function handleAudioRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  // Buscar el archivo completo en caché (ignorando el header Range)
  const cacheKey = new Request(request.url);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    // Tenemos el archivo completo en caché
    const rangeHeader = request.headers.get('Range');

    if (!rangeHeader) {
      // Petición normal (no range) — devolver directo
      return cachedResponse;
    }

    // Es una Range Request — extraer el rango pedido
    const arrayBuffer = await cachedResponse.clone().arrayBuffer();
    const totalBytes = arrayBuffer.byteLength;

    // Parsear "bytes=start-end"
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!rangeMatch) return cachedResponse;

    const start = rangeMatch[1] ? parseInt(rangeMatch[1]) : 0;
    const end   = rangeMatch[2] ? parseInt(rangeMatch[2]) : totalBytes - 1;
    const chunkEnd = Math.min(end, totalBytes - 1);
    const chunk = arrayBuffer.slice(start, chunkEnd + 1);

    // Detectar tipo MIME
    const contentType = cachedResponse.headers.get('Content-Type') || 'audio/mpeg';

    // Responder con el fragmento solicitado (HTTP 206 Partial Content)
    return new Response(chunk, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${chunkEnd}/${totalBytes}`,
        'Content-Length': String(chunk.byteLength),
        'Accept-Ranges': 'bytes',
      }
    });
  }

  // No está en caché — descargar, guardar, y devolver
  console.log('[SW v3] Descargando:', request.url);
  try {
    // Descargar SIN el header Range para obtener el archivo completo
    const fullRequest = new Request(request.url, {
      method: 'GET',
      headers: { 'Accept': 'audio/mpeg, audio/*, */*' },
      mode: 'cors',
      credentials: 'omit',
    });

    const response = await fetch(fullRequest);
    if (response.ok) {
      await cache.put(cacheKey, response.clone());
      console.log('[SW v3] Guardado en caché:', request.url);

      // Si la petición original era Range, servir el rango desde la respuesta completa
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        const arrayBuffer = await response.clone().arrayBuffer();
        const totalBytes = arrayBuffer.byteLength;
        const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (rangeMatch) {
          const start = rangeMatch[1] ? parseInt(rangeMatch[1]) : 0;
          const end   = rangeMatch[2] ? parseInt(rangeMatch[2]) : totalBytes - 1;
          const chunkEnd = Math.min(end, totalBytes - 1);
          const chunk = arrayBuffer.slice(start, chunkEnd + 1);
          const contentType = response.headers.get('Content-Type') || 'audio/mpeg';
          return new Response(chunk, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
              'Content-Type': contentType,
              'Content-Range': `bytes ${start}-${chunkEnd}/${totalBytes}`,
              'Content-Length': String(chunk.byteLength),
              'Accept-Ranges': 'bytes',
            }
          });
        }
      }
    }
    return response;
  } catch (e) {
    console.error('[SW v3] Sin red y sin caché:', request.url);
    return new Response(null, { status: 503, statusText: 'Sin conexión' });
  }
}

// ── PRE-CARGA DE AUDIOS EN SEGUNDO PLANO ────────────────────────
async function precargarAudios() {
  const cache = await caches.open(CACHE_NAME);
  const base  = self.registration.scope;
  let cargados = 0;
  const total  = AUDIO_FILES.length;

  console.log('[SW v3] Pre-cargando', total, 'audios...');

  for (const archivo of AUDIO_FILES) {
    const url = base + encodeURIComponent(archivo);
    try {
      const yaEnCache = await cache.match(new Request(url));
      if (yaEnCache) {
        cargados++;
        notificar(cargados, total);
        continue;
      }

      // Descargar el archivo COMPLETO (sin Range header)
      const response = await fetch(new Request(url, {
        method: 'GET',
        headers: { 'Accept': 'audio/mpeg, audio/*, */*' },
        mode: 'cors',
        credentials: 'omit',
      }));

      if (response.ok) {
        await cache.put(new Request(url), response);
        cargados++;
        console.log('[SW v3] Cacheado:', archivo, `(${cargados}/${total})`);
        notificar(cargados, total);
      }
    } catch (e) {
      console.warn('[SW v3] Error al cachear:', archivo, e.message);
    }
  }

  notificarCompleto(total);
}

function notificar(cargados, total) {
  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.postMessage({ type: 'CACHE_PROGRESS', cargados, total }))
  );
}
function notificarCompleto(total) {
  console.log('[SW v3] ¡Pre-carga completa!');
  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.postMessage({ type: 'CACHE_COMPLETE', total }))
  );
}
