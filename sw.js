/* sw.js — GENERADO por scripts/aplicar.mjs (scripts/lib/servicio.mjs). No editar a mano.
   El listín de teléfonos sin cobertura: precarga telefonos.html y lo que necesita para verse
   (CSS, JS, letras y escudo) y lo sirve red primero, con lo guardado de respaldo, SOLO en esas
   rutas. Nada más pasa por aquí. Versión = huella de esos archivos. */
var CACHE = "ribera-del-fresno-telefonos-4eff3ca57f";
var PREFIJO = "ribera-del-fresno-telefonos-";
var RUTAS = ["telefonos.html","css/base.css?v=e6e45b5b","css/fuentes.css?v=03f84dac","css/imprimir.css?v=81f92fc4","css/marca.css?v=5abdee72","css/movimiento.css?v=6f3573ca","favicon.png","favicon.svg","fonts/besley-600-latin-ext.woff2","fonts/besley-600-latin.woff2","fonts/besley-600i-latin-ext.woff2","fonts/besley-600i-latin.woff2","fonts/besley-700-latin-ext.woff2","fonts/besley-700-latin.woff2","fonts/libre-franklin-400-latin-ext.woff2","fonts/libre-franklin-400-latin.woff2","fonts/libre-franklin-600-latin-ext.woff2","fonts/libre-franklin-600-latin.woff2","js/identidad.js?v=fcdf24c0","js/main.js?v=4737b8db","js/movimiento.js?v=f5805715","js/vivo.js?v=11a1482f","marca/escudo-160.png"];
var BASE = new URL('./', self.location).href;
var URLS = RUTAS.map(function (r) { return new URL(r, BASE).href; });
var SIN_Q = URLS.map(function (u) { return u.split('?')[0]; });

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(URLS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(PREFIJO) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});
self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var u = req.url.split('#')[0], sinQ = u.split('?')[0];
  var nuestra = URLS.indexOf(u) >= 0 || SIN_Q.indexOf(sinQ) >= 0;
  if (!nuestra) return;
  ev.respondWith(fetch(req).then(function (r) {
    if (r && r.ok && URLS.indexOf(u) >= 0) { var copia = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
    return r;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (m) { return m || c.match(sinQ, { ignoreSearch: true }); });
    }).then(function (m) { return m || Response.error(); });
  }));
});
