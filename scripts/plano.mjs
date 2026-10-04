/* plano.mjs — plano esquemático de las calles alrededor del Ayuntamiento, para el pie.

     node scripts/plano.mjs                       busca el Ayuntamiento en OpenStreetMap y dibuja
                                                  marca/plano.svg (+ marca/plano.json con los datos)
     node scripts/plano.mjs --osm way/566195233   un elemento de OSM concreto (nodo, vía o relación)
     node scripts/plano.mjs --radio 200           metros del Ayuntamiento al borde izquierdo/derecho
     node scripts/plano.mjs --guardar copia.json  guarda la respuesta de Overpass
     node scripts/plano.mjs --desde copia.json    sin red: dibuja desde una respuesta guardada

   Se ejecuta UNA vez, al montar la web (o si cambian las calles): la web no pide
   nada a nadie, el plano va incrustado en cada página. Los datos son de
   OpenStreetMap (ODbL): el pie lleva siempre «© colaboradores de OpenStreetMap».

   El Ayuntamiento se busca como amenity=townhall dentro del término municipal
   (memoria «ubicación real: nodo de OSM»: el pin de Facebook miente). Si sale
   otro edificio o ninguno, se pasa con --osm. Lo usado (elemento, centro, fecha y
   calles rotuladas) queda en marca/plano.json; si ese archivo ya dice `osm` o
   `radio_m`, se reutilizan.

   Sin colores: clases que css/base.css pinta con los tokens. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const M = JSON.parse(fs.readFileSync(path.join(RAIZ, 'municipio.json'), 'utf8'));
const metaPrevia = fs.existsSync(path.join(RAIZ, 'marca/plano.json')) ? JSON.parse(fs.readFileSync(path.join(RAIZ, 'marca/plano.json'), 'utf8')) : {};

/* User-Agent del proyecto, sin datos de nadie (memoria «subagente y User-Agent») */
const UA = 'plantilla-ayuntamiento-puerta-abierta/3 (plano esquematico del pie; scripts/plano.mjs)';
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const VW = 320, VH = 240;                      /* el lienzo: 4:3 */
const RADIO = Number(arg('--radio') || metaPrevia.radio_m || 200);
const ESCALA = (VW / 2) / RADIO;               /* unidades por metro */
const red = v => Math.round(v * 10) / 10;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function overpass(q) {
  let ultimo = '';
  for (let vuelta = 0; vuelta < 2; vuelta++) for (const url of SERVIDORES) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(90000) });
      const t = await r.text();
      if (r.ok && t.trim().startsWith('{')) return JSON.parse(t);
      ultimo = url + ' → ' + r.status + ' ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
    } catch (e) { ultimo = url + ' → ' + e.message; }
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error('Overpass no responde: ' + ultimo);
}

/* ── 1. el Ayuntamiento ── */
async function buscarAyuntamiento() {
  const fijo = arg('--osm') || metaPrevia.osm;
  if (fijo) {
    const [tipo, id] = fijo.split('/');
    if (!/^(node|way|relation)$/.test(tipo) || !/^\d+$/.test(id)) throw new Error('--osm: node/123, way/123 o relation/123');
    return { tipo, id };
  }
  const j = await overpass(`[out:json][timeout:60];area["name"="${M.nombre.replace(/"/g, '')}"]["boundary"="administrative"]["admin_level"="8"]->.a;nwr(area.a)["amenity"="townhall"];out center tags;`);
  const c = j.elements.sort((a, b) => (/ayuntamiento/i.test((b.tags || {}).name || '') ? 1 : 0) - (/ayuntamiento/i.test((a.tags || {}).name || '') ? 1 : 0));
  if (!c.length) throw new Error('No hay amenity=townhall en OSM dentro de «' + M.nombre + '». Búscalo en openstreetmap.org y pásalo con --osm way/123');
  if (c.length > 1) console.log('! Hay ' + c.length + ' ayuntamientos en OSM; uso ' + c[0].type + '/' + c[0].id + ' («' + ((c[0].tags || {}).name || '') + '»). Si no es, --osm');
  return { tipo: c[0].type, id: String(c[0].id) };
}

/* ── 2. geometría ── */
function proyectar(lat0, lon0) {
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320 * ESCALA, ky = 110574 * ESCALA;
  return ({ lat, lon }) => [VW / 2 + (lon - lon0) * kx, VH / 2 - (lat - lat0) * ky];
}
/* recorte de un segmento al rectángulo (Liang-Barsky) */
function recorteSegmento([x0, y0], [x1, y1], m = 0) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 + m], [dx, VW + m - x0], [-dy, y0 + m], [dy, VH + m - y0]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[x0 + t0 * dx, y0 + t0 * dy], [x0 + t1 * dx, y0 + t1 * dy]];
}
function recortarLinea(pts, m = 2) {
  const out = [];
  let actual = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const s = recorteSegmento(pts[i], pts[i + 1], m);
    if (!s) { if (actual) out.push(actual); actual = null; continue; }
    if (actual && Math.hypot(actual[actual.length - 1][0] - s[0][0], actual[actual.length - 1][1] - s[0][1]) < 0.01) actual.push(s[1]);
    else { if (actual) out.push(actual); actual = [s[0], s[1]]; }
  }
  if (actual) out.push(actual);
  return out;
}
/* simplificación (Douglas-Peucker) */
function simplificar(pts, tol = 0.6) {
  if (pts.length < 3) return pts;
  /* un anillo cerrado se parte por el punto más lejano del primero: si no, se queda en nada */
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
const dDe = (lineas, cerrar = false) => lineas.map(l => 'M' + l.map(p => red(p[0]) + ' ' + red(p[1])).join('L') + (cerrar ? 'Z' : '')).join('');
const centroide = pts => { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; };

/* ── 3. rótulos ── */
const CORTOS = [[/^Calle /i, 'C/ '], [/^Avenida /i, 'Av. '], [/^Carretera /i, 'Ctra. '], [/^Travesía /i, 'Trav. '], [/^Plaza /i, 'Pl. ']];
const corto = n => CORTOS.reduce((s, [re, r]) => s.replace(re, r), n);
const normal = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(c\/|calle|av\.?|avda\.?|avenida|pl\.?|pza\.?|plaza)\s*/, '').replace(/,.*$/, '').replace(/\s+\d.*$/, '').trim();
const TAM = 11.5;                                            /* cuerpo de los rótulos, en unidades del lienzo */
const anchoTexto = (t, tam = TAM) => t.length * tam * 0.56;
/* la caja de un rótulo girado, como polígono */
function caja(cx, cy, w, h, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
/* choque de dos polígonos convexos (ejes separadores) */
function chocan(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], nx = y0 - y1, ny = x1 - x0;
    const pa = A.map(([x, y]) => x * nx + y * ny), pb = B.map(([x, y]) => x * nx + y * ny);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
const dentro = (P, m = 3) => P.every(([x, y]) => x >= m && x <= VW - m && y >= m && y <= VH - m);

/* ── principal ── */
const objetivo = await buscarAyuntamiento();
let datos;
if (arg('--desde')) datos = JSON.parse(fs.readFileSync(arg('--desde'), 'utf8'));
else {
  /* primero el Ayuntamiento (para el centro) y después todo lo de alrededor */
  const a = await overpass(`[out:json][timeout:60];${objetivo.tipo}(id:${objetivo.id});out geom;`);
  const e = a.elements[0];
  if (!e) throw new Error('OSM no tiene ' + objetivo.tipo + '/' + objetivo.id);
  /* el centro: el nodo, o la media de los vértices del edificio (sin repetir el de cierre) */
  const g = (e.geometry || []).filter(Boolean), gv = g.length > 2 ? g.slice(0, -1) : g;
  const c = e.lat ? { lat: e.lat, lon: e.lon } : gv.length ? { lat: gv.reduce((s, p) => s + p.lat, 0) / gv.length, lon: gv.reduce((s, p) => s + p.lon, 0) / gv.length } : e.center;
  if (!c) throw new Error(objetivo.tipo + '/' + objetivo.id + ' no trae geometría');
  const r = Math.ceil(RADIO * 1.35);
  const alrededor = `(around:${r},${c.lat},${c.lon})`;
  const b = await overpass(`[out:json][timeout:90];(way${alrededor}["highway"]["highway"!~"^(footway|path|cycleway|steps|track|service|proposed|construction|bridleway|corridor|elevator|platform)$"];` +
    `way${alrededor}["place"="square"];nwr${alrededor}["amenity"="place_of_worship"];);out geom;`);
  datos = { ayuntamiento: e, centro: c, elementos: b.elements, fecha: new Date().toISOString().slice(0, 10) };
  await new Promise(r => setTimeout(r, 1000));
}
if (arg('--guardar')) fs.writeFileSync(arg('--guardar'), JSON.stringify(datos));

const { lat: lat0, lon: lon0 } = datos.centro;
const P = proyectar(lat0, lon0);
const geo = e => (e.geometry || []).filter(Boolean).map(P);
const PRINCIPAL = /^(trunk|primary|secondary|tertiary)(_link)?$/;

const calles = [], principales = [], plazas = [], hitos = [], nombres = new Map();
for (const e of datos.elementos) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry) continue;
  const pts = geo(e);
  if (t.amenity === 'place_of_worship' && t.building) { hitos.push(pts); continue; }
  if (t.place === 'square' || (t.area === 'yes' && t.highway)) { plazas.push(pts); if (t.name) nombres.set(t.name, { ...(nombres.get(t.name) || { lineas: [], principal: false }), plaza: centroide(pts) }); continue; }
  if (!t.highway) continue;
  const lineas = recortarLinea(pts).map(l => simplificar(l));
  if (!lineas.length) continue;
  (PRINCIPAL.test(t.highway) ? principales : calles).push(...lineas);
  if (t.name) {
    const n = nombres.get(t.name) || { lineas: [], principal: false };
    n.lineas.push(...lineas); n.principal = n.principal || PRINCIPAL.test(t.highway);
    nombres.set(t.name, n);
  }
}
const aytoPts = datos.ayuntamiento.geometry ? geo(datos.ayuntamiento) : [P(datos.centro)];
const [ax, ay] = aytoPts.length > 2 ? centroide(aytoPts.slice(0, -1)) : aytoPts[0];

/* el rótulo del Ayuntamiento: a la derecha, a la izquierda, arriba o abajo; el primero que quepa */
const ocupados = [];
/* con edificio, el edificio en la marca; si en OSM es solo un nodo, un punto con su aro */
const conEdificio = aytoPts.length > 2;
const ARO = 9;
const xs = conEdificio ? aytoPts.map(p => p[0]) : [ax - ARO, ax + ARO], ys = conEdificio ? aytoPts.map(p => p[1]) : [ay - ARO, ay + ARO];
const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
ocupados.push(caja((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, bb.x1 - bb.x0 + 2, bb.y1 - bb.y0 + 2, 0));
const textoAyto = 'Ayuntamiento', wA = anchoTexto(textoAyto, 12.5) * 1.04;
let rotAyto = null;
for (const [x, y, anchor] of [[bb.x1 + 4, ay, 'start'], [bb.x0 - 4, ay, 'end'], [ax, bb.y0 - 10, 'middle'], [ax, bb.y1 + 11, 'middle']]) {
  const cx = anchor === 'start' ? x + wA / 2 : anchor === 'end' ? x - wA / 2 : x;
  const bx = caja(cx, y, wA + 4, 16, 0);
  if (dentro(bx)) { rotAyto = { x, y, anchor, caja: bx }; break; }
}
if (rotAyto) ocupados.push(rotAyto.caja);

/* las calles a rotular: la de la dirección del Ayuntamiento primero, luego las más largas y cercanas */
const calleDireccion = normal(M.contacto.direccion || '');
const candidatas = [...nombres.entries()].filter(([, n]) => n.lineas.length).map(([nombre, n]) => {
  const largo = n.lineas.reduce((s, l) => s + l.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0);
  const cerca = Math.min(...n.lineas.flat().map(p => Math.hypot(p[0] - ax, p[1] - ay)));
  const suya = normal(nombre) === calleDireccion;
  return { nombre, n, puntos: largo * (n.principal ? 1.6 : 1) / (1 + cerca / 60) * (suya ? 4 : 1), suya };
}).sort((a, b) => b.puntos - a.puntos);
const rotulos = [];
const MAX = Number(arg('--rotulos') || metaPrevia.rotulos || 3);
for (const c of candidatas) {
  if (rotulos.length >= MAX) break;
  const texto = corto(c.nombre), w = anchoTexto(texto);
  /* tramos casi rectos (giro < 14°) lo bastante largos para el texto */
  const tramos = [];
  for (const l of c.n.lineas) {
    let ini = 0;
    for (let i = 1; i <= l.length; i++) {
      const giro = i < l.length - 1 ? Math.abs(Math.atan2(l[i + 1][1] - l[i][1], l[i + 1][0] - l[i][0]) - Math.atan2(l[i][1] - l[i - 1][1], l[i][0] - l[i - 1][0])) : 0;
      if (i === l.length || (i < l.length - 1 && Math.min(giro, 2 * Math.PI - giro) > 14 * Math.PI / 180)) {
        const tr = l.slice(ini, Math.min(i + 1, l.length));
        const largo = tr.slice(1).reduce((t, p, k) => t + Math.hypot(p[0] - tr[k][0], p[1] - tr[k][1]), 0);
        if (tr.length > 1) tramos.push({ tr, largo });
        ini = i;
      }
    }
  }
  tramos.sort((a, b) => b.largo - a.largo);
  let puesto = null;
  for (const { tr, largo } of tramos) {
    if (largo < w + 10) break;
    const [p0, p1] = [tr[0], tr[tr.length - 1]];
    let ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI;
    /* a lo largo del tramo: el centro, y si choca, a un tercio y a dos tercios */
    for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      const cx = p0[0] + (p1[0] - p0[0]) * f, cy = p0[1] + (p1[1] - p0[1]) * f;
      if (largo * Math.min(f, 1 - f) * 2 < w + 6) continue;
      const bx = caja(cx, cy, w + 6, TAM + 4, ang);
      if (!dentro(bx) || ocupados.some(o => chocan(o, bx))) continue;
      puesto = { texto, nombre: c.nombre, x: cx, y: cy, ang: ang * 180 / Math.PI, caja: bx };
      break;
    }
    if (puesto) break;
  }
  if (puesto) { rotulos.push(puesto); ocupados.push(puesto.caja); }
}

/* ── 4. el SVG ── */
const etiqueta = t => `<text class="${t.clase}" x="${red(t.x)}" y="${red(t.y)}"${t.ang ? ` transform="rotate(${red(t.ang)} ${red(t.x)} ${red(t.y)})"` : ''}${t.anchor && t.anchor !== 'middle' ? ` text-anchor="${t.anchor}"` : ' text-anchor="middle"'} dy=".35em">${esc(t.texto)}</text>`;
const mPorUnidad = 1 / ESCALA, barra = 100 * ESCALA;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" data-plano="${esc(objetivo.tipo + '/' + objetivo.id)}">
<rect class="plano-fondo" width="${VW}" height="${VH}"/>
${plazas.length ? `<path class="plano-plaza" d="${dDe(plazas.map(p => simplificar(p, 0.4)), true)}"/>` : ''}
<path class="plano-calle" d="${dDe(calles)}"/>
${principales.length ? `<path class="plano-calle plano-calle--principal" d="${dDe(principales)}"/>` : ''}
${hitos.length ? `<path class="plano-hito" d="${dDe(hitos.map(p => simplificar(p, 0.3)), true)}"/>` : ''}
${conEdificio ? `<path class="plano-ayto" d="${dDe([simplificar(aytoPts, 0.3)], true)}"/>` : `<circle class="plano-aro" cx="${red(ax)}" cy="${red(ay)}" r="${ARO}"/><circle class="plano-punto" cx="${red(ax)}" cy="${red(ay)}" r="3.2"/>`}
<path class="plano-escala" d="M10 ${VH - 12}h${red(barra)}M10 ${VH - 15}v6M${red(10 + barra)} ${VH - 15}v6"/>
<text class="plano-rotulo plano-rotulo--escala" x="${red(14 + barra)}" y="${VH - 12}" dy=".35em">100 m</text>
${rotulos.map(r => etiqueta({ ...r, clase: 'plano-rotulo' })).join('\n')}
${rotAyto ? etiqueta({ texto: textoAyto, x: rotAyto.x, y: rotAyto.y, anchor: rotAyto.anchor, clase: 'plano-rotulo plano-rotulo--ayto' }) : ''}
</svg>
`.replace(/\n{2,}/g, '\n');
fs.writeFileSync(path.join(RAIZ, 'marca/plano.svg'), svg);
const meta = {
  _leeme: 'Lo genera scripts/plano.mjs (no editar a mano salvo osm, radio_m y rotulos, que el script reutiliza). aplicar.mjs incrusta marca/plano.svg en el pie; sin él, el pie va a dos columnas.',
  fuente: 'OpenStreetMap, por la API de Overpass', licencia: 'ODbL 1.0', atribucion: '© colaboradores de OpenStreetMap', atribucion_url: 'https://www.openstreetmap.org/copyright',
  osm: objetivo.tipo + '/' + objetivo.id, nombre_osm: (datos.ayuntamiento.tags || {}).name || null,
  centro: [Number(lat0.toFixed(7)), Number(lon0.toFixed(7))], radio_m: RADIO, rotulos: MAX, metros_por_unidad: Number(mPorUnidad.toFixed(4)),
  fecha: datos.fecha, calles_rotuladas: rotulos.map(r => r.nombre)
};
fs.writeFileSync(path.join(RAIZ, 'marca/plano.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`✓ marca/plano.svg (${(svg.length / 1024).toFixed(1)} kB): ${objetivo.tipo}/${objetivo.id} «${meta.nombre_osm || ''}», ${calles.length + principales.length} tramos de calle, ${plazas.length} plazas` +
  `\n  rótulos: ${rotulos.map(r => r.texto).join(' · ') || 'ninguno'}${rotAyto ? '' : ' (el del Ayuntamiento no cabe)'}`);
