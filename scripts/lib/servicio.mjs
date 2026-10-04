/* servicio.mjs — lo que la web da «por debajo» para que se pueda seguir sin redes y sin cobertura
   (v3b · servicio). Lo usa scripts/aplicar.mjs; no sabe nada de un municipio concreto.

     feedAtom(...)      feed.xml: avisos y noticias en Atom (RFC 4287), para un lector de noticias
     agendaIcs(...)     agenda.ics: TODA la agenda en un solo calendario (RFC 5545), con el mismo
                        generador de js/vivo.js (Vivo.ics) que escribe ics/<id>.ics
     jsonLd(...)        datos estructurados (schema.org) de cada página: el Ayuntamiento, los actos,
                        las noticias y las migas. Solo campos que ya existen: nada inventado, y lo
                        marcado «ejemplo» no entra (un buscador lo daría por real)
     swCodigo(...)      sw.js: el listín de teléfonos sin cobertura (red primero; la caché, de respaldo)
     recursosDe(...)    lo que necesita una página para verse sin red (CSS, JS, letras, escudo) */

import crypto from 'node:crypto';

const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uuidDe = s => { const h = crypto.createHash('md5').update(s).digest('hex'); return `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

/* desfase de Madrid (+01:00 o +02:00) para una fecha y hora locales */
export function desfase(fecha, hora = '12:00', zona = 'Europe/Madrid') {
  const guess = new Date(fecha + 'T' + hora + ':00Z');
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(guess).find(p => p.type === 'timeZoneName').value;
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(nombre);
  return m ? m[1] + ':' + (m[2] || '00') : 'Z';
}
export const isoLocal = (fecha, hora, zona) => fecha + 'T' + (hora || '00:00') + ':00' + desfase(fecha, hora || '00:00', zona);
export const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

/* ── feed.xml (Atom) ──
   avisos: los de contenido/avisos.json (no ocultos); noticias: las publicadas. Lo marcado
   «ejemplo» entra con «EJEMPLO:» delante del título (en un lector no hay etiqueta que lo diga) */
export function feedAtom({ nombre, slug, base, avisos, noticias, rutas, ahoraIso, escudo }) {
  const ent = [
    ...avisos.map(a => ({ tipo: 'Aviso', id: 'aviso/' + a.id, titulo: a.titulo, fecha: a.fecha, resumen: a.texto || '', href: rutas.avisos + '#aviso-' + a.id, ejemplo: a.ejemplo })),
    ...noticias.map(n => ({ tipo: 'Noticia', id: 'noticia/' + n.id, titulo: n.titulo, fecha: n.fecha, resumen: n.resumen || '', href: rutas.noticia.replace('{id}', n.id), ejemplo: n.ejemplo }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id)).slice(0, 40);
  const actualizado = ent.length ? isoLocal(ent[0].fecha, '09:00') : isoLocal(ahoraIso, '09:00');
  const l = ['<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es">',
    `  <title>${xml('Avisos y noticias · Ayuntamiento de ' + nombre)}</title>`,
    `  <subtitle>${xml('Lo que publica el Ayuntamiento de ' + nombre + ': avisos (cortes, convocatorias, plazos) y noticias.')}</subtitle>`,
    `  <id>${uuidDe(slug + ':feed')}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(base + 'feed.xml')}"/>`,
    `  <link rel="alternate" type="text/html" href="${xml(base + rutas.avisos)}"/>`,
    `  <updated>${actualizado}</updated>`,
    `  <author><name>${xml('Ayuntamiento de ' + nombre)}</name></author>`,
    ...(escudo ? [`  <icon>${xml(base + escudo)}</icon>`] : []),
    ...ent.map(e => ['  <entry>',
      `    <title>${xml((e.ejemplo ? 'EJEMPLO: ' : '') + e.titulo)}</title>`,
      `    <id>${uuidDe(slug + ':' + e.id)}</id>`,
      `    <link rel="alternate" type="text/html" href="${xml(base + e.href)}"/>`,
      `    <published>${isoLocal(e.fecha, '09:00')}</published>`,
      `    <updated>${isoLocal(e.fecha, '09:00')}</updated>`,
      `    <category term="${e.tipo.toLowerCase()}" label="${e.tipo}"/>`,
      ...(e.resumen || e.ejemplo ? [`    <summary type="text">${xml((e.ejemplo ? 'Dato de ejemplo de la propuesta de diseño, no es un aviso real. ' : '') + e.resumen)}</summary>`] : []),
      '  </entry>'].join('\n')),
    '</feed>', ''];
  return l.join('\n');
}

/* ── agenda.ics: un solo VCALENDAR con todos los actos ──
   Se reutiliza Vivo.ics (el de cada evento) y se juntan sus VEVENT: mismo UID que el .ics suelto
   (el calendario no duplica el acto si alguien añadió los dos), un solo VTIMEZONE */
export function agendaIcs({ Vivo, D, sello }) {
  const eventos = (D.agenda || []).filter(e => !e.oculto).slice().sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  let cabeza = null, zona = null;
  const cuerpos = [];
  for (const e of eventos) {
    const txt = Vivo.ics(e.ejemplo ? { ...e, titulo: 'EJEMPLO: ' + e.titulo, nota: ['Dato de ejemplo de la propuesta de diseño, no es un acto confirmado.', e.nota].filter(Boolean).join('\n') } : e, D, sello);
    const lineas = txt.replace(/\r\n$/, '').split('\r\n');
    const iniZ = lineas.indexOf('BEGIN:VTIMEZONE'), finZ = lineas.indexOf('END:VTIMEZONE');
    if (iniZ >= 0 && !zona) zona = lineas.slice(iniZ, finZ + 1);
    const iniE = lineas.indexOf('BEGIN:VEVENT'), finE = lineas.indexOf('END:VEVENT');
    if (!cabeza) cabeza = lineas.slice(0, iniZ >= 0 ? iniZ : iniE);
    cuerpos.push(...lineas.slice(iniE, finE + 1));
  }
  if (!cabeza) cabeza = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ayuntamiento de ' + D.nombre + '//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  /* nombre del calendario al suscribirse (Apple, Google, Thunderbird y Outlook lo leen) */
  const nombreCal = 'Agenda de ' + D.nombre;
  const extra = ['X-WR-CALNAME:' + nombreCal, 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'];
  return [...cabeza, ...extra, ...(zona || []), ...cuerpos, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

/* ── JSON-LD ── */
const absoluta = (base, rel) => (base ? base + rel : rel);
export function organizacion({ M, base, telE164, escudo }) {
  const o = {
    '@type': 'GovernmentOrganization', '@id': absoluta(base, '#ayuntamiento'),
    name: 'Ayuntamiento de ' + M.nombre,
    url: base || undefined,
    logo: escudo ? absoluta(base, escudo) : undefined,
    telephone: telE164(M.contacto.telefono),
    email: M.contacto.correo || undefined,
    faxNumber: M.contacto.fax ? telE164(M.contacto.fax) : undefined,
    taxID: (M.legal && M.legal.nif) || undefined,
    address: { '@type': 'PostalAddress', streetAddress: M.contacto.direccion, postalCode: M.contacto.cp, addressLocality: M.nombre, addressRegion: M.provincia, addressCountry: 'ES' },
    sameAs: (M.redes || []).map(r => r.url).filter(u => /^https:\/\//.test(u))
  };
  /* el horario solo si está confirmado (con «ejemplo», un buscador lo daría por bueno) */
  if (!M.horario.ejemplo && (M.horario.tramos || []).length) {
    const DIAS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    o.location = { '@type': 'CityHall', name: 'Ayuntamiento de ' + M.nombre, address: o.address,
      openingHoursSpecification: M.horario.tramos.map(t => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: t.dias.map(d => 'https://schema.org/' + DIAS[d - 1]), opens: t.de, closes: t.a })) };
  }
  if (!o.sameAs.length) delete o.sameAs;
  return JSON.parse(JSON.stringify(o));
}
export function eventoLd(e, { M, base, rutas }) {
  const o = {
    '@type': 'Event', name: e.titulo,
    startDate: e.hora ? isoLocal(e.fecha, e.hora) : e.fecha,
    endDate: e.hora && e.hora_fin && e.hora_fin > e.hora ? isoLocal(e.fecha, e.hora_fin) : undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    /* en las fiestas, «lugar» es cuándo («del 14 de septiembre, cuatro días»): va a la descripción */
    location: { '@type': 'Place', name: e.lugar && e.origen !== 'fiesta' ? e.lugar + ', ' + M.nombre : M.nombre,
      address: { '@type': 'PostalAddress', addressLocality: M.nombre, addressRegion: M.provincia, addressCountry: 'ES' } },
    description: [e.origen === 'fiesta' ? e.lugar : null, e.nota].filter(Boolean).join('. ') || undefined,
    organizer: { '@id': absoluta(base, '#ayuntamiento') },
    url: absoluta(base, rutas.agenda + '#evento-' + encodeURIComponent(e.id))
  };
  return JSON.parse(JSON.stringify(o));
}
export function noticiaLd(n, { base, rutas, archivo }) {
  return JSON.parse(JSON.stringify({
    '@type': 'NewsArticle', headline: n.titulo, datePublished: n.fecha, description: n.resumen || undefined,
    image: n.imagen ? [absoluta(base, 'media/' + n.imagen + '.jpg')] : undefined,
    inLanguage: 'es', mainEntityOfPage: absoluta(base, archivo || rutas.noticia.replace('{id}', n.id)),
    author: { '@id': absoluta(base, '#ayuntamiento') }, publisher: { '@id': absoluta(base, '#ayuntamiento') }
  }));
}
export function migasLd(pasos, base) {
  return { '@type': 'BreadcrumbList', itemListElement: pasos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.texto, item: absoluta(base, p.href) })) };
}
export const jsonLd = grafo => grafo.length ? JSON.stringify({ '@context': 'https://schema.org', '@graph': grafo }).replace(/</g, '\\u003c') : null;

/* ── sw.js ──
   Solo para las rutas de la lista (el listín y lo que necesita para verse): red primero y, si no hay
   red, lo guardado. El resto de la web no pasa por aquí (sin respondWith: el navegador hace lo de
   siempre). La caché lleva la huella del build: un cambio en cualquiera de esos archivos la renueva */
export function swCodigo({ slug, version, rutas }) {
  return `/* sw.js — GENERADO por scripts/aplicar.mjs (scripts/lib/servicio.mjs). No editar a mano.
   El listín de teléfonos sin cobertura: precarga telefonos.html y lo que necesita para verse
   (CSS, JS, letras y escudo) y lo sirve red primero, con lo guardado de respaldo, SOLO en esas
   rutas. Nada más pasa por aquí. Versión = huella de esos archivos. */
var CACHE = ${JSON.stringify(slug + '-telefonos-' + version)};
var PREFIJO = ${JSON.stringify(slug + '-telefonos-')};
var RUTAS = ${JSON.stringify(rutas)};
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
`;
}

/* lo que pide una página generada para pintarse: hojas de estilo y scripts propios, imágenes
   (también los srcset), iconos y manifiesto; y las letras que cargan las hojas de estilo */
export function recursosDe(html, leerCss) {
  const fuera = u => /^(https?:|mailto:|tel:|data:|#|webcal:)/.test(u) || /\.ics(\?|$)/.test(u) || /\.html(\?|#|$)/.test(u);
  const set = new Set();
  for (const m of html.matchAll(/<(?:link|script|img)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) if (!fuera(m[1])) set.add(m[1].replace(/&amp;/g, '&'));
  for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) for (const parte of m[1].split(',')) { const u = parte.trim().split(/\s+/)[0]; if (u && !fuera(u)) set.add(u); }
  for (const u of [...set]) if (/\.css(\?|$)/.test(u)) {
    /* sin los data: (un SVG en línea lleva sus propios url(#…) dentro) */
    const css = (leerCss(u.split('?')[0]) || '').replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/g, '');
    if (!css) continue;
    const dir = u.split('?')[0].replace(/[^/]*$/, '');
    for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) if (!fuera(m[1])) set.add(new URL(m[1], 'http://x/' + dir).pathname.slice(1));
  }
  /* sin el manifiesto (no hace falta para leer) ni las precargas de imagen que añade la portada */
  return [...set].filter(u => !/manifest\.json/.test(u)).sort();
}
