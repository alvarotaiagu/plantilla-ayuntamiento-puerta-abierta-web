/* hoja.mjs — la hoja de Google publicada, leída al MONTAR la web (v3c · automatico, F15).

   La web ya la leía en el navegador (js/main.js → leerHoja): lo de la hoja salía en la portada, la
   franja y la agenda, pero no en feed.xml, ni en agenda.ics, ni en los ics/<id>.ics, ni en la lista
   de avisos.html, y una noticia de la hoja no tenía página. aplicar.mjs llama aquí ANTES de pintar y
   fusiona lo de la hoja con contenido/*.json; así todo eso sale de los mismos datos.

   Leer, sanear y fusionar es el MISMO código que en el navegador: js/vivo.js → filasHoja,
   sanearHoja y fusionarHoja (aplicar.mjs ya ejecuta vivo.js en Node y nos pasa su `Vivo`).

     municipio.json → hoja: { id, pestanas: { avisos, agenda, noticias } }   sin `id`, no se hace nada

   Lo último bueno se guarda en contenido/hoja.json (lo escribe esto, no se edita a mano): si la hoja
   no contesta, contesta un error o devuelve otra cosa (la página de entrar de Google cuando la hoja no
   está publicada), esa pestaña sale de la copia y el montaje sigue. Solo se reescribe cuando lo de la
   hoja cambia, así que un cambio en ese archivo quiere decir «hay algo nuevo» (lo usa la tarea diaria,
   .github/workflows/actualizar.yml). Se guarda ya saneado: solo las columnas que lee la web (ni la
   marca temporal ni un correo, si alguien publicara la pestaña de respuestas), y lo oculto o en
   borrador como {id, oculto}: los borradores no viajan al repositorio. */

import fs from 'node:fs';
import path from 'node:path';

export const GVIZ = 'https://docs.google.com/spreadsheets/d/';
export const CACHE = 'contenido/hoja.json';
export const TIPOS = ['avisos', 'agenda', 'noticias'];
/* el mismo que tablon.mjs y lib/osm.mjs: genérico, sin datos de nadie */
const UA = 'WebMunicipal-Hoja/1.0 (lee la hoja publicada del Ayuntamiento al montar su web)';

export const urlPestana = (id, pestana, base = GVIZ) => base + encodeURIComponent(id) + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(pestana);

/* la respuesta de gviz de una pestaña, o un error (sin red, código ≠ 200, tiempo agotado, no es gviz) */
export async function traerPestana(url, ms = 15000) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = await r.text();
  if (!/google\.visualization\.Query\.setResponse|"table"\s*:/.test(txt)) throw new Error('no contesta como una hoja publicada (¿«Publicar en la web»?)');
  return txt;
}

function leerCache(raiz) {
  try { return JSON.parse(fs.readFileSync(path.join(raiz, CACHE), 'utf8')); } catch (e) { return null; }
}
/**
 * Lee las pestañas de la hoja y devuelve lo que hay que fusionar, ya saneado.
 * @param {object} op
 *   hoja     municipio.json → hoja
 *   Vivo     el de js/vivo.js (filasHoja, sanearHoja)
 *   raiz     carpeta de la web (para contenido/hoja.json)
 *   base     otra dirección en vez de docs.google.com (las pruebas)
 *   sinRed   no pedir nada: solo la copia (node scripts/aplicar.mjs --sin-hoja)
 *   ahora    Date (para «cambiada»)
 *   ms       corte por pestaña (15 s)
 * @returns null sin hoja.id; si no, { avisos, agenda, noticias, origen: {tipo: 'hoja'|'copia'|null}, avisos_montaje: [..] }
 */
export async function leerHojaAlMontar({ hoja, Vivo, raiz, base, sinRed = false, ahora = new Date(), ms = 15000 }) {
  if (!hoja || !hoja.id) return null;
  const pestanas = hoja.pestanas || {};
  const cache = leerCache(raiz);
  const copia = cache && cache.id === hoja.id ? cache.pestanas || {} : {};
  const res = { avisos: [], agenda: [], noticias: [], origen: {}, avisos_montaje: [] };
  const leidas = {};
  for (const tipo of TIPOS) {
    const nombre = pestanas[tipo];
    if (!nombre) { res.origen[tipo] = null; continue; }
    let filas = null;
    if (!sinRed) {
      try {
        const txt = await traerPestana(urlPestana(hoja.id, nombre, base), ms);
        /* JSON de ida y vuelta: lo que sale de vivo.js vive en otro contexto de vm (otros prototipos) */
        const s = JSON.parse(JSON.stringify(Vivo.sanearHoja(tipo, Vivo.filasHoja(txt))));
        filas = leidas[tipo] = s.filas;
        res.avisos_montaje.push(...s.avisos.map(a => 'hoja ' + a));
        res.origen[tipo] = 'hoja';
      } catch (e) {
        res.avisos_montaje.push(`hoja «${nombre}»: no contesta (${String(e.message).split('\n')[0]}); ` +
          (copia[tipo] ? `se usa la copia de ${CACHE} (${cache.cambiada || 'sin fecha'})` : 'no hay copia: esta vez no entra nada de esa pestaña'));
      }
    }
    if (!filas && copia[tipo]) { filas = copia[tipo]; res.origen[tipo] = 'copia'; }
    if (!filas) { res.origen[tipo] = null; continue; }
    res[tipo] = filas;
  }
  /* la copia: solo si algo leído ahora es distinto de lo guardado (las pestañas que fallaron, como estaban) */
  const nuevas = { ...copia, ...leidas };
  const cambia = Object.keys(leidas).length && JSON.stringify(nuevas) !== JSON.stringify(copia);
  if (cambia) {
    fs.mkdirSync(path.join(raiz, 'contenido'), { recursive: true });
    fs.writeFileSync(path.join(raiz, CACHE), JSON.stringify({
      _leeme: 'GENERADO por scripts/aplicar.mjs (scripts/lib/hoja.mjs): lo último bueno de la hoja de Google de municipio.json → hoja, ' +
        'por si un día no contesta. No se edita a mano: se cambia en la hoja. Lo oculto o en borrador solo guarda su id. ' +
        '«cambiada» es cuándo cambió por última vez lo de la hoja.',
      id: hoja.id, cambiada: ahora.toISOString(), pestanas: nuevas
    }, null, 2) + '\n');
    res.escrita = true;
  }
  return res;
}
