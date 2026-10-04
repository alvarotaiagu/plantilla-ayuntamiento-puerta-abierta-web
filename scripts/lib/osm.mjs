/* lib/osm.mjs — lo común de los scripts que leen OpenStreetMap EN BUILD (termino.mjs; plano.mjs
   tiene su propia copia de lo mismo). La web nunca pide nada a OSM: estos scripts se ejecutan al
   montarla y lo que escriben va incrustado. Datos © colaboradores de OpenStreetMap (ODbL). */

/* User-Agent genérico del proyecto, sin datos de nadie */
export const UA = 'plantilla-ayuntamiento-puerta-abierta/3 (datos del mapa en build; scripts/termino.mjs)';
export const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const ATRIBUCION = '© colaboradores de OpenStreetMap';
export const ATRIBUCION_URL = 'https://www.openstreetmap.org/copyright';

/* una consulta a Overpass: prueba los servidores dos vueltas y explica el último fallo */
export async function overpass(q, ua = UA) {
  let ultimo = '';
  for (let vuelta = 0; vuelta < 2; vuelta++) for (const url of SERVIDORES) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(120000) });
      const t = await r.text();
      if (r.ok && t.trim().startsWith('{')) return JSON.parse(t);
      ultimo = url + ' → ' + r.status + ' ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
    } catch (e) { ultimo = url + ' → ' + (e.cause ? e.cause.message || e.cause.code : e.message); }
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error('Overpass no responde: ' + ultimo);
}

export const red = v => Math.round(v * 10) / 10;
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* simplificación (Douglas-Peucker); un anillo cerrado se parte por el punto más lejano del primero */
export function simplificar(pts, tol = 0.6) {
  if (pts.length < 3) return pts;
  const [p0, pn] = [pts[0], pts[pts.length - 1]];
  if (Math.hypot(p0[0] - pn[0], p0[1] - pn[1]) < 1e-6) {
    if (pts.length < 5) return pts;
    let k = 1, max = 0;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]); if (d > max) { max = d; k = i; } });
    return [...simplificar(pts.slice(0, k + 1), tol).slice(0, -1), ...simplificar(pts.slice(k), tol)];
  }
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    const d = Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return [...simplificar(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplificar(pts.slice(idx), tol)];
}
export const dDe = (lineas, cerrar = false) => lineas.map(l => 'M' + l.map(p => red(p[0]) + ' ' + red(p[1])).join('L') + (cerrar ? 'Z' : '')).join('');

/* los miembros «outer» de una relación (out geom) cosidos en anillos cerrados de {lat, lon} */
export function anillos(rel, papel = 'outer') {
  const trozos = (rel.members || []).filter(m => m.type === 'way' && (m.role || 'outer') === papel && m.geometry && m.geometry.length > 1)
    .map(m => m.geometry.filter(Boolean).map(p => ({ lat: p.lat, lon: p.lon })));
  const igual = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
  const out = [];
  while (trozos.length) {
    let anillo = trozos.shift();
    let crece = true;
    while (crece && !igual(anillo[0], anillo[anillo.length - 1])) {
      crece = false;
      for (let i = 0; i < trozos.length; i++) {
        const t = trozos[i], fin = anillo[anillo.length - 1];
        if (igual(fin, t[0])) anillo = anillo.concat(t.slice(1));
        else if (igual(fin, t[t.length - 1])) anillo = anillo.concat(t.slice(0, -1).reverse());
        else if (igual(anillo[0], t[t.length - 1])) anillo = t.concat(anillo.slice(1));
        else if (igual(anillo[0], t[0])) anillo = t.slice(1).reverse().concat(anillo);
        else continue;
        trozos.splice(i, 1); crece = true; break;
      }
    }
    if (anillo.length > 3) out.push(anillo);
  }
  return out;
}

/* comparar nombres: sin tildes, sin artículos ni «de»; la puntuación es la parte de las palabras
   del nombre buscado que están en el de OSM */
const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en', 'san', 'santa', 'nuestra', 'senora', 'ntra', 'sra']);
export const palabras = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !VACIAS.has(w));
export function parecido(buscado, osm) {
  const a = palabras(buscado), b = new Set(palabras(osm));
  if (!a.length || !b.size) return 0;
  return a.filter(w => b.has(w)).length / a.length;
}
