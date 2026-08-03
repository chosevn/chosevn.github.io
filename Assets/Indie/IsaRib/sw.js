/*
  Cross-origin-isolation service worker for the SW-based gate launch mechanism.

  srcdoc iframes can never be cross-origin isolated: crossOriginIsolated is computed
  from a document's own delivered response headers, and srcdoc content is injected
  directly rather than fetched, so there's never a response to attach headers to.
  This works around that by giving the decrypted page a REAL (synthetic) URL that
  this worker intercepts and serves directly, with COOP/COEP set on the response
  from the start — no register-then-reload dance needed for the launched page itself.

  It also injects the same headers onto every other same-scope request (same
  technique as coi-serviceworker.js) so sub-resources, including cross-origin CDN
  fetches, stay compatible with an isolated document. And it does the same for the
  shell page's own reloads, since COEP has to hold for the whole ancestor chain,
  not just the launched iframe, for the iframe to actually end up isolated.
*/
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.indexOf('/__launch__/') !== -1) {
    event.respondWith(
      caches.open('coi-launch').then((cache) => cache.match(req)).then((resp) =>
        resp || new Response('launch payload not found', { status: 404 })
      )
    );
    return;
  }

  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(
    fetch(req).then((response) => {
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      const nullBodyStatus = [101, 204, 205, 304].includes(response.status);
      return new Response(nullBodyStatus ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }).catch((e) => { console.error('[coi-sw] fetch failed', e); return fetch(req); })
  );
});
