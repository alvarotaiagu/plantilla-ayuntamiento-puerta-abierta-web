/* termino.mjs — el mapa del término municipal para «El pueblo», desde OpenStreetMap, EN BUILD.

     node scripts/termino.mjs                          busca el término en OSM y escribe
                                                       marca/termino.svg + marca/termino.json
     node scripts/termino.mjs --relacion 344567        la relación del término, si el nombre no basta
     node scripts/termino.mjs --lugar "Oppidum de Hornachuelos=way/123"
                                                       fija el elemento de OSM de un lugar (repetible)
     node scripts/termino.mjs --guardar copia.json     guarda lo que ha devuelto Overpass
     node scripts/termino.mjs --desde copia.json       sin red: dibuja desde una copia guardada
     node scripts/termino.mjs --raiz carpeta           el municipio.json y la marca/ de otra carpeta (v3c · alta)

   Lo que dibuja (todo de OSM, nada a mano):
     · el contorno del término: la relación boundary=administrative, admin_level=8, con el nombre
       del municipio (municipio.json → nombre);
     · el casco urbano: las áreas landuse=residential a menos de 2 km del nodo place=town/village
       del pueblo;
     · las carreteras (trunk, primary, secondary, tertiary) con su matrícula (ref);
     · v3c: las calles (residential, unclassified, living_street, pedestrian) a menos de 2 km, que
       solo salen en el recuadro del pueblo ampliado (ver 4 bis: cuando los puntos se pisan);
     · las rutas que existan en OSM como relaciones route=hiking/foot/bicycle dentro del término;
     · los lugares de municipio.json → pueblo.lugares y pueblo.patrimonio que estén en OSM DENTRO
       del término (así son los de este pueblo y no los de otro con el mismo nombre). Se buscan por
       nombre: tienen que estar en el nombre de OSM todas las palabras del nuestro (o todas las del
       de OSM en el nuestro), sin contar «de», «la», «san»… Si dos lugares quieren el mismo
       elemento, o uno encaja con varios, se avisa y no se pone: se fija con --lugar.

   marca/termino.svg lleva solo la geometría (path, text, g, rect: sin colores; los pone
   css/base.css). Los puntos numerados, sus enlaces a la ficha de cada lugar, la leyenda y la escala
   los pinta aplicar.mjs desde marca/termino.json (posición en el lienzo de cada lugar, ids de OSM,
   fecha y atribución). Lo usado se reutiliza la próxima vez (relación y --lugar fijados).

   Ni una petición en la web: esto se ejecuta una vez al montarla. User-Agent del proyecto, sin
   datos de nadie. ODbL: la página lleva «© colaboradores de OpenStreetMap». */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overpass, red, esc, simplificar, dDe, anillos, palabras, parecido, ATRIBUCION, ATRIBUCION_URL } from './lib/osm.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const todos = n => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
/* v3c · alta: --raiz <carpeta> lee el municipio.json de esa carpeta y escribe en su marca/ (lo usa nuevo-municipio.mjs) */
const BASE = arg('--raiz') ? path.resolve(arg('--raiz')) : RAIZ;
const M = JSON.parse(fs.readFileSync(path.join(BASE, 'municipio.json'), 'utf8'));
const rutaMeta = path.join(BASE, 'marca/termino.json');
const previa = fs.existsSync(rutaMeta) ? JSON.parse(fs.readFileSync(rutaMeta, 'utf8')) : {};
const slugDe = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const VW = 600, MARGEN = 18;                     /* el lienzo: 600 de ancho; el alto sale del término */
const CARRETERA = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;

/* los lugares a buscar: los de «Qué ver» y los del patrimonio, sin repetir */
const P = M.pueblo || {};
const buscados = [];
for (const l of [...(P.lugares || []), ...(P.patrimonio || [])]) if (l.nombre && !buscados.some(b => slugDe(b) === slugDe(l.nombre))) buscados.push(l.nombre);
/* fijados a mano: --lugar "Nombre=tipo/id" y los que ya trae termino.json */
const fijados = new Map((previa.lugares || []).filter(l => l.fijado).map(l => [l.nombre, l.osm]));
for (const s of todos('--lugar')) {
  const i = s.lastIndexOf('=');
  if (i < 0 || !/^(node|way|relation)\/\d+$/.test(s.slice(i + 1))) throw new Error('--lugar "Nombre=node/123"');
  fijados.set(s.slice(0, i).trim(), s.slice(i + 1));
}

/* ── 1. los datos (Overpass o una copia) ── */
let datos;
if (arg('--desde')) datos = JSON.parse(fs.readFileSync(arg('--desde'), 'utf8'));
else {
  const nombre = M.nombre.replace(/"/g, '');
  const idRel = arg('--relacion') || (previa.relacion || '').replace(/^relation\//, '') || null;
  const sel = idRel ? `relation(id:${idRel})` : `relation["boundary"="administrative"]["admin_level"="8"]["name"="${nombre}"]`;
  const r1 = await overpass(`[out:json][timeout:120];${sel};out geom;`);
  const rels = r1.elements.filter(e => e.type === 'relation');
  if (!rels.length) throw new Error(`OSM no tiene el término «${M.nombre}» (admin_level=8). Búscalo en openstreetmap.org y pásalo con --relacion`);
  if (rels.length > 1) console.log(`! Hay ${rels.length} términos con ese nombre (${rels.map(r => r.id).join(', ')}); uso el primero. Si no es, --relacion`);
  const limite = rels[0];
  const area = 3600000000 + limite.id;
  const nombresRe = [...new Set(buscados.flatMap(palabras))].filter(w => w.length > 3).map(w => w.replace(/[^a-z0-9]/g, '')).join('|');
  await new Promise(r => setTimeout(r, 1000));
  const r2 = await overpass(`[out:json][timeout:180];area(${area})->.a;(` +
    `node(area.a)["place"~"^(town|village|city)$"]["name"="${nombre}"];` +
    `way(area.a)["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"];` +
    `relation(area.a)["route"~"^(hiking|foot|bicycle|mtb)$"];` +
    (nombresRe ? `nwr(area.a)["name"~"${nombresRe}",i];` : '') +
    `);out geom;`);
  const pueblo = r2.elements.find(e => e.type === 'node' && e.tags && e.tags.place);
  let casco = [], calles = [];
  if (pueblo) {
    await new Promise(r => setTimeout(r, 1000));
    /* v3c · F25: y las calles, que solo salen en el recuadro del pueblo ampliado */
    const r3 = await overpass(`[out:json][timeout:120];(way(around:2000,${pueblo.lat},${pueblo.lon})["landuse"="residential"];` +
      `way(around:2000,${pueblo.lat},${pueblo.lon})["highway"~"^(residential|unclassified|living_street|pedestrian)$"];);out geom;`);
    casco = r3.elements.filter(e => e.tags && e.tags.landuse);
    calles = r3.elements.filter(e => e.tags && e.tags.highway);
  }
  for (const [nombreL, osm] of fijados) {
    if (r2.elements.some(e => e.type + '/' + e.id === osm)) continue;
    const [t, id] = osm.split('/');
    await new Promise(r => setTimeout(r, 1000));
    const rx = await overpass(`[out:json][timeout:60];${t}(id:${id});out center tags;`);
    if (!rx.elements.length) console.log(`! --lugar «${nombreL}»: OSM no tiene ${osm}`);
    r2.elements.push(...rx.elements);
  }
  datos = { limite, pueblo: pueblo || null, casco, calles, elementos: r2.elements, fecha: new Date().toISOString().slice(0, 10) };
}
if (arg('--guardar')) fs.writeFileSync(arg('--guardar'), JSON.stringify(datos));

/* ── 2. proyección: uniforme (la misma escala en x y en y), centrada en el término ── */
const contorno = anillos(datos.limite);
if (!contorno.length) throw new Error('La relación ' + datos.limite.id + ' no trae un contorno cerrado');
const todosPts = contorno.flat();
const lat0 = (Math.min(...todosPts.map(p => p.lat)) + Math.max(...todosPts.map(p => p.lat))) / 2;
const kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110574;          /* metros por grado */
const mx = todosPts.map(p => p.lon * kx), my = todosPts.map(p => -p.lat * ky);
const [x0, x1, y0, y1] = [Math.min(...mx), Math.max(...mx), Math.min(...my), Math.max(...my)];
const escala = (VW - 2 * MARGEN) / (x1 - x0);                               /* unidades por metro */
const VH = Math.round((y1 - y0) * escala + 2 * MARGEN + 26);                /* abajo, sitio para la escala */
const proy = ({ lat, lon }) => [MARGEN + (lon * kx - x0) * escala, MARGEN + (-lat * ky - y0) * escala];
const centroDe = e => e.lat != null ? { lat: e.lat, lon: e.lon } : e.center ? e.center
  : e.geometry && e.geometry.length ? { lat: e.geometry.reduce((s, p) => s + p.lat, 0) / e.geometry.length, lon: e.geometry.reduce((s, p) => s + p.lon, 0) / e.geometry.length }
  : e.bounds ? { lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lon: (e.bounds.minlon + e.bounds.maxlon) / 2 } : null;
/* ¿dentro del término? (par-impar sobre los anillos) */
function dentro({ lat, lon }) {
  let c = false;
  for (const a of contorno) for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [pi, pj] = [a[i], a[j]];
    if ((pi.lat > lat) !== (pj.lat > lat) && lon < (pj.lon - pi.lon) * (lat - pi.lat) / (pj.lat - pi.lat) + pi.lon) c = !c;
  }
  return c;
}
/* recorte de una línea al lienzo, o a una caja [x0, y0, x1, y1] (Liang-Barsky por segmento) */
function recortar(pts, [cx0, cy0, cx1, cy1] = [0, 0, VW, VH]) {
  const out = []; let actual = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    let [ax, ay] = pts[i], [bx, by] = pts[i + 1], t0 = 0, t1 = 1, fuera = false;
    const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - cx0], [dx, cx1 - ax], [-dy, ay - cy0], [dy, cy1 - ay]]) {
      if (p === 0) { if (q < 0) fuera = true; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) fuera = true; else if (r > t0) t0 = r; } else { if (r < t0) fuera = true; else if (r < t1) t1 = r; }
    }
    if (fuera) { if (actual) out.push(actual); actual = null; continue; }
    const s = [[ax + t0 * dx, ay + t0 * dy], [ax + t1 * dx, ay + t1 * dy]];
    if (actual && Math.hypot(actual[actual.length - 1][0] - s[0][0], actual[actual.length - 1][1] - s[0][1]) < 0.01) actual.push(s[1]);
    else { if (actual) out.push(actual); actual = s; }
  }
  if (actual) out.push(actual);
  return out;
}

/* ── 3. capas ── */
const limiteD = dDe(contorno.map(a => simplificar(a.map(proy), 0.5)), true);
const cascoD = dDe((datos.casco || []).filter(w => w.geometry && w.geometry.length > 3).map(w => simplificar(w.geometry.filter(Boolean).map(proy), 0.4)), true);
const carreteras = [], refs = new Map();
for (const e of datos.elementos.filter(e => e.type === 'way' && e.tags && CARRETERA.test(e.tags.highway || '') && e.geometry)) {
  const lineas = recortar(e.geometry.filter(Boolean).map(proy)).map(l => simplificar(l, 0.5));
  carreteras.push(...lineas);
  const ref = (e.tags.ref || '').split(';')[0].trim();
  if (ref) for (const l of lineas) {
    const largo = l.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0);
    if (!refs.has(ref) || refs.get(ref).largo < largo) refs.set(ref, { largo, l });
  }
}
const rutas = datos.elementos.filter(e => e.type === 'relation' && e.tags && /^(hiking|foot|bicycle|mtb)$/.test(e.tags.route || ''));
const rutasD = rutas.map(r => ({ r, d: dDe((r.members || []).filter(m => m.type === 'way' && m.geometry).flatMap(m => recortar(m.geometry.filter(Boolean).map(proy))).map(l => simplificar(l, 0.5))) })).filter(x => x.d);

/* ── 4. los lugares: por nombre, dentro del término, sin ambigüedades ── */
const conNombre = datos.elementos.filter(e => e.tags && e.tags.name && !(e.tags.highway) && !(e.tags.route) && !(e.tags.boundary) && !(e.tags.place));
/* 2: todas nuestras palabras están en el nombre de OSM; 1: todas las de OSM (alguna que no sea
   genérica) están en el nuestro, y entonces solo vale si ningún otro lugar encaja igual
   («Ermita del Cristo» en OSM no se sabe si es la de la Misericordia o la Vieja) */
const GENERICAS = /^(ermita|iglesia|pozo|casa|casas|palacio|monumento|pilar|fuente|lavadero|convento|ruinas|antiguo|antigua|cerro|ruta)$/;
const encaja = (nuestro, e) => parecido(nuestro, e.tags.name) === 1 ? 2
  : parecido(e.tags.name, nuestro) === 1 && palabras(e.tags.name).some(w => !GENERICAS.test(w)) ? 1 : 0;
const lugares = [], avisos = [];
const reclamados = new Map();
for (const nombre of buscados) {
  let el = null, fijado = false;
  if (fijados.has(nombre)) {
    const osm = fijados.get(nombre);
    el = datos.elementos.find(e => e.type + '/' + e.id === osm) || null;
    fijado = true;
    if (!el) { avisos.push(`«${nombre}»: el elemento fijado ${osm} no está en los datos`); continue; }
  } else {
    const cands = conNombre.filter(e => encaja(nombre, e) === 2 || (encaja(nombre, e) === 1 && buscados.filter(b => encaja(b, e)).length === 1))
      .filter(e => { const c = centroDe(e); return c && dentro(c); });
    /* el mismo sitio puede estar como nodo y como área: si están a menos de 150 m, es uno */
    const unicos = [];
    for (const e of cands) {
      const c = centroDe(e);
      if (!unicos.some(u => { const d = centroDe(u); return Math.hypot((c.lat - d.lat) * ky, (c.lon - d.lon) * kx) < 150; })) unicos.push(e);
    }
    if (unicos.length > 1) { avisos.push(`«${nombre}» encaja con ${unicos.length} elementos (${unicos.map(e => e.type + '/' + e.id + ' «' + e.tags.name + '»').join(', ')}): fíjalo con --lugar`); continue; }
    el = unicos[0] || null;
  }
  if (!el) continue;
  const c = centroDe(el);
  if (!c) continue;
  if (!fijado && !dentro(c)) continue;
  const id = el.type + '/' + el.id;
  if (reclamados.has(id)) {
    avisos.push(`${id} «${(el.tags || {}).name}» lo quieren «${reclamados.get(id)}» y «${nombre}»: se queda el primero; fija el otro con --lugar`);
    continue;
  }
  reclamados.set(id, nombre);
  const [x, y] = proy(c);
  lugares.push({ nombre, osm: id, nombre_osm: (el.tags || {}).name || null, lat: Number(c.lat.toFixed(6)), lon: Number(c.lon.toFixed(6)), x: red(x), y: red(y), ...(fijado ? { fijado: true } : {}) });
}

/* ── 4 bis. v3c · F25. Lugares que se pisan. Con datos reales casi todo está en el pueblo (en
   Ribera, seis de siete puntos en medio kilómetro): a la escala del término, sus círculos caen
   uno encima de otro. Entonces:
     · el grupo más grande de puntos que se pisan va a un RECUADRO: el pueblo ampliado, en el
       hueco del lienzo que menos término tapa, con su propia barra de escala; en el mapa grande,
       un rectángulo marca la zona ampliada y una raya la une al recuadro;
     · dentro del recuadro (o en el mapa, si sueltos aún se pisan), el círculo se aparta lo justo,
       hacia fuera del grupo, y una raya fina lo une a un punto pequeño en su sitio exacto.
   Se reparte con los círculos ya agrandados como en pantallas estrechas (css/base.css los escala
   ×AMPL cuando la figura es estrecha), para que tampoco allí se pisen. aplicar.mjs pinta cada
   círculo en lugares[].x/y (donde quedó) y no sabe nada de esto; el sitio exacto va en «sitio». */
const R = Math.round(VW / 40), AMPL = 1.6, RR = R * AMPL;
const xyM = ({ lat, lon }) => [lon * kx, -lat * ky];                      /* metros, para el recuadro */
const pisan = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 2 * RR + 2;
const contornoXY = contorno.map(a => a.map(proy));
const dentroXY = (x, y) => { let c = false; for (const a of contornoXY) for (let i = 0, j = a.length - 1; i < a.length; j = i++) if ((a[i][1] > y) !== (a[j][1] > y) && x < (a[j][0] - a[i][0]) * (y - a[i][1]) / (a[j][1] - a[i][1]) + a[i][0]) c = !c; return c; };
const cortan = (a, b) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
/* el grupo: componentes de «se pisan»; el más grande, si tiene dos o más */
const grupos = [];
for (const l of lugares) {
  const suyos = grupos.filter(g => g.some(o => pisan(o, l)));
  const nuevo = [l, ...suyos.flat()];
  for (const g of suyos) grupos.splice(grupos.indexOf(g), 1);
  grupos.push(nuevo);
}
const grupo = grupos.filter(g => g.length > 1).sort((a, b) => b.length - a.length)[0] || [];
let recuadro = null;
if (grupo.length) {
  const ms = grupo.map(l => xyM(l));
  const [gx0, gx1, gy0, gy1] = [Math.min(...ms.map(m => m[0])), Math.max(...ms.map(m => m[0])), Math.min(...ms.map(m => m[1])), Math.max(...ms.map(m => m[1]))];
  const medio = Math.max(gx1 - gx0, gy1 - gy0) / 2 * 1.35 + 150;          /* metros del centro al borde */
  const [cxm, cym] = [(gx0 + gx1) / 2, (gy0 + gy1) / 2];
  const S = Math.round(VW * 0.35), es2 = S / (2 * medio);
  if (es2 / escala >= 2) {                                                 /* si amplía menos del doble, no vale la pena */
    const zona = { x0: MARGEN + (cxm - medio - x0) * escala, y0: MARGEN + (cym - medio - y0) * escala };
    zona.x1 = zona.x0 + 2 * medio * escala; zona.y1 = zona.y0 + 2 * medio * escala;
    const zc = [(zona.x0 + zona.x1) / 2, (zona.y0 + zona.y1) / 2];
    const fuera = lugares.filter(l => !grupo.includes(l));
    let mejor = null;
    for (let ix = 6; ix <= VW - S - 6; ix += 12) for (let iy = 6; iy <= VH - S - 32; iy += 12) {
      const c = { x0: ix, y0: iy, x1: ix + S, y1: iy + S };
      if (cortan(c, { x0: zona.x0 - 12, y0: zona.y0 - 12, x1: zona.x1 + 12, y1: zona.y1 + 12 })) continue;
      if (fuera.some(l => cortan(c, { x0: l.x - RR - 4, x1: l.x + RR + 4, y0: l.y - RR - 4, y1: l.y + RR + 4 }))) continue;
      let tapa = 0;
      for (let i = 0; i <= 14; i++) for (let j = 0; j <= 14; j++) if (dentroXY(ix + S * i / 14, iy + S * j / 14)) tapa++;
      const nota = tapa / 225 + Math.hypot(ix + S / 2 - zc[0], iy + S / 2 - zc[1]) / VW * 0.15;
      if (!mejor || nota < mejor.nota) mejor = { ...c, nota, tapa: tapa / 225 };
    }
    if (mejor) {
      const p2 = ({ lat, lon }) => [mejor.x0 + (lon * kx - (cxm - medio)) * es2, mejor.y0 + (-lat * ky - (cym - medio)) * es2];
      const caja = [mejor.x0, mejor.y0, mejor.x1, mejor.y1];
      const objetivo2 = (S / 3) / es2;
      const metros2 = [50, 100, 200, 250, 500, 1000, 2000].reduce((m, v) => Math.abs(v - objetivo2) < Math.abs(m - objetivo2) ? v : m);
      recuadro = { ...mejor, S, es2, p2, caja, zona, metros: metros2 };
      for (const l of grupo) { const [x, y] = p2(l); Object.assign(l, { x: red(x), y: red(y), recuadro: true }); }
    }
  }
}
/* repartir: cada círculo en su sitio si no pisa a nadie; si no, el primer hueco en anillos
   alrededor, empezando por la dirección que se aleja del grupo, y siempre sin tapar el sitio
   exacto de los demás */
function repartir(pts, [bx0, by0, bx1, by1], ocupadas) {
  const puestos = [];
  for (const l of pts) {
    const otros = pts.filter(o => o !== l);
    const solo = !otros.some(o => pisan(o, l));
    const cg = otros.length ? [otros.reduce((s, o) => s + o.x, 0) / otros.length, otros.reduce((s, o) => s + o.y, 0) / otros.length] : [l.x, l.y - 1];
    const hacia = Math.atan2(l.y - cg[1], l.x - cg[0]) || -Math.PI / 2;
    let sitio = null;
    for (let k = solo ? 0 : 1; k <= 8 && !sitio; k++) {
      const d = k === 0 ? 0 : RR + 6 + (k - 1) * RR * 0.8, n = k === 0 ? 1 : 12 + 4 * k;
      const angs = Array.from({ length: n }, (_, i) => hacia + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2 * Math.PI / n);
      for (const a of angs) {
        const q = { x: l.x + d * Math.cos(a), y: l.y + d * Math.sin(a) };
        if (q.x - RR < bx0 + 2 || q.x + RR > bx1 - 2 || q.y - RR < by0 + 2 || q.y + RR > by1 - 2) continue;
        if (puestos.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 2 * RR + 2)) continue;
        if (k > 0 && pts.some(o => Math.hypot(o.x - q.x, o.y - q.y) < RR + 4)) continue;
        if (ocupadas.some(c => cortan(c, { x0: q.x - RR, x1: q.x + RR, y0: q.y - RR, y1: q.y + RR }))) continue;
        sitio = q; break;
      }
    }
    if (!sitio) { avisos.push(`«${l.nombre}»: no hay hueco para su círculo sin pisar otro; sale en su sitio`); sitio = { x: l.x, y: l.y }; }
    puestos.push(sitio);
  }
  pts.forEach((l, i) => {
    const q = puestos[i];
    if (Math.hypot(q.x - l.x, q.y - l.y) > 0.5) Object.assign(l, { sitio: [l.x, l.y], x: red(q.x), y: red(q.y) });
  });
}
const barra = { x0: 0, y0: VH - 30, x1: VW * 0.5, y1: VH };               /* la escala, abajo a la izquierda */
const enRecuadro = lugares.filter(l => l.recuadro), enMapa = lugares.filter(l => !l.recuadro);
if (recuadro) repartir(enRecuadro, recuadro.caja, [{ x0: recuadro.x0, y0: recuadro.y1 - 30, x1: recuadro.x0 + recuadro.S * 0.72, y1: recuadro.y1 }]);
repartir(enMapa, [0, 0, VW, VH], [barra, ...(recuadro ? [{ x0: recuadro.x0 - 4, y0: recuadro.y0 - 4, x1: recuadro.x1 + 4, y1: recuadro.y1 + 4 }] : [])]);

/* rótulos de las carreteras: en el punto medio de su tramo más largo, sin chocar entre ellos */
const rotulos = [], cajas = [];
/* que no tapen los puntos de los lugares (ya agrandados como en pantalla estrecha), el pueblo ni el recuadro */
for (const l of lugares) cajas.push({ x0: l.x - RR - 3, x1: l.x + RR + 3, y0: l.y - RR - 3, y1: l.y + RR + 3 });
if (datos.pueblo) { const [px, py] = proy(datos.pueblo); cajas.push({ x0: px - 22, x1: px + 22, y0: py - 22, y1: py + 22 }); }
if (recuadro) cajas.push({ x0: recuadro.x0 - 6, x1: recuadro.x1 + 6, y0: recuadro.y0 - 6, y1: recuadro.y1 + 6 }, recuadro.zona);
for (const [ref, { l, largo }] of [...refs.entries()].sort((a, b) => b[1].largo - a[1].largo)) {
  if (largo < 60) continue;
  const total = largo; let acc = 0, punto = l[0];
  for (let i = 1; i < l.length; i++) {
    const s = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    if (acc + s >= total / 2) { const f = (total / 2 - acc) / (s || 1); punto = [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * f, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * f]; break; }
    acc += s;
  }
  const w = ref.length * 6.6 + 8, h = 15;
  /* la caja, ya agrandada como en pantalla estrecha (×AMPL alrededor de su centro) */
  const c = { x0: punto[0] - w * AMPL / 2, x1: punto[0] + w * AMPL / 2, y0: punto[1] - h * AMPL / 2, y1: punto[1] + h * AMPL / 2 };
  if (c.x0 < 2 || c.x1 > VW - 2 || c.y0 < 2 || c.y1 > VH - 30) continue;
  if (cajas.some(o => !(c.x1 < o.x0 || c.x0 > o.x1 || c.y1 < o.y0 || c.y0 > o.y1))) continue;
  cajas.push(c); rotulos.push({ ref, x: punto[0], y: punto[1], w, h });
}

/* ── 5. la escala: una barra redonda de en torno a un cuarto del ancho ── */
const objetivo = (VW / 4) / escala;
const metros = [500, 1000, 2000, 2500, 5000, 10000, 20000].reduce((m, v) => Math.abs(v - objetivo) < Math.abs(m - objetivo) ? v : m);
const largoEscala = metros * escala;

/* ── 5 bis. v3c · F25. El recuadro: lo mismo que el mapa (término, casco, carreteras), recortado a
   su caja; su barra de escala; la zona ampliada en el mapa grande y la raya que las une. Y las
   rayas de los círculos apartados, con un punto pequeño en el sitio exacto ── */
/* recorte de un polígono a una caja (Sutherland-Hodgman) */
function recortarPoligono(pts, [cx0, cy0, cx1, cy1]) {
  let out = pts;
  for (const [dentroDe, corte] of [
    [p => p[0] >= cx0, (a, b) => [cx0, a[1] + (b[1] - a[1]) * (cx0 - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= cx1, (a, b) => [cx1, a[1] + (b[1] - a[1]) * (cx1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= cy0, (a, b) => [a[0] + (b[0] - a[0]) * (cy0 - a[1]) / (b[1] - a[1]), cy0]],
    [p => p[1] <= cy1, (a, b) => [a[0] + (b[0] - a[0]) * (cy1 - a[1]) / (b[1] - a[1]), cy1]]]) {
    const ent = out; out = [];
    for (let i = 0; i < ent.length; i++) {
      const p = ent[i], q = ent[(i + 1) % ent.length];
      if (dentroDe(p)) { out.push(p); if (!dentroDe(q)) out.push(corte(p, q)); }
      else if (dentroDe(q)) out.push(corte(p, q));
    }
    if (!out.length) break;
  }
  return out;
}
const punto = ([x, y], r = 2.6) => `M${red(x - r)} ${red(y)}a${r} ${r} 0 1 0 ${red(2 * r)} 0a${r} ${r} 0 1 0 ${red(-2 * r)} 0Z`;
const guias = l => l.sitio ? `<path class="termino-guia" d="M${l.sitio[0]} ${l.sitio[1]}L${l.x} ${l.y}"/><path class="termino-sitio" d="${punto(l.sitio)}"/>` : '';
let recuadroSvg = '';
if (recuadro) {
  const { caja, p2, x0: rx, y0: ry, x1: rx1, y1: ry1, zona, metros: m2, es2, S } = recuadro;
  const dentroCaja = [rx + 1, ry + 1, rx1 - 1, ry1 - 1];
  const pol = anillosLL => dDe(anillosLL.map(a => recortarPoligono(a.map(p2), dentroCaja)).filter(a => a.length > 2).map(a => simplificar([...a, a[0]], 0.4)), true);
  const area2 = pol(contorno), casco2 = pol((datos.casco || []).filter(w => w.geometry && w.geometry.length > 3).map(w => w.geometry.filter(Boolean)));
  const lim2 = dDe(contorno.flatMap(a => recortar(a.map(p2), dentroCaja)).map(l => simplificar(l, 0.4)));
  const calles2 = dDe((datos.calles || []).filter(e => e.geometry).flatMap(e => recortar(e.geometry.filter(Boolean).map(p2), dentroCaja)).map(l => simplificar(l, 0.4)));
  const carr2 = dDe(datos.elementos.filter(e => e.type === 'way' && e.tags && CARRETERA.test(e.tags.highway || '') && e.geometry)
    .flatMap(e => recortar(e.geometry.filter(Boolean).map(p2), dentroCaja)).map(l => simplificar(l, 0.4)));
  const lb = m2 * es2, bx = rx + 8, by = ry1 - 12;
  /* la raya entre la zona y el recuadro: de la esquina de la zona más cercana al recuadro a la del recuadro más cercana a la zona */
  const esq = c => [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]];
  const cerca = (cs, [tx, ty]) => cs.reduce((m, p) => Math.hypot(p[0] - tx, p[1] - ty) < Math.hypot(m[0] - tx, m[1] - ty) ? p : m);
  const a1 = cerca(esq(zona), [(rx + rx1) / 2, (ry + ry1) / 2]), a2 = cerca(esq(recuadro), a1);
  recuadroSvg = `<path class="termino-zona" d="M${red(zona.x0)} ${red(zona.y0)}H${red(zona.x1)}V${red(zona.y1)}H${red(zona.x0)}Z"/>
<path class="termino-guia" d="M${red(a1[0])} ${red(a1[1])}L${red(a2[0])} ${red(a2[1])}"/>
<g class="termino-recuadro">
<rect class="termino-fondo" x="${red(rx)}" y="${red(ry)}" width="${S}" height="${S}"/>
${area2 ? `<path class="termino-area" d="${area2}"/>` : ''}
${casco2 ? `<path class="termino-casco" d="${casco2}"/>` : ''}
${calles2 ? `<path class="termino-calle" d="${calles2}"/>` : ''}
${carr2 ? `<path class="termino-carretera" d="${carr2}"/>` : ''}
${lim2 ? `<path class="termino-limite" d="${lim2}"/>` : ''}
${lugares.filter(l => l.recuadro).map(guias).join('')}
<path class="termino-escala" d="M${red(bx)} ${red(by)}h${red(lb)}M${red(bx)} ${red(by - 4)}v8M${red(bx + lb)} ${red(by - 4)}v8"/>
<text class="termino-escala-texto" x="${red(bx + lb + 6)}" y="${red(by)}" dy=".35em">${m2 >= 1000 ? String(m2 / 1000).replace('.', ',') + ' km' : m2 + ' m'}</text>
<rect class="termino-marco" x="${red(rx)}" y="${red(ry)}" width="${S}" height="${S}"/>
</g>`;
}

/* ── 6. el SVG (solo geometría y rótulos; sin colores) ── */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" data-termino="${esc(slugDe(M.nombre))}">
<rect class="termino-fondo" width="${VW}" height="${VH}"/>
<path class="termino-area" d="${limiteD}"/>
${cascoD ? `<path class="termino-casco" d="${cascoD}"/>` : ''}
${rutasD.map(x => `<path class="termino-ruta" d="${x.d}"/>`).join('\n')}
${carreteras.length ? `<path class="termino-carretera" d="${dDe(carreteras)}"/>` : ''}
<path class="termino-limite" d="${limiteD}"/>
${lugares.filter(l => !l.recuadro).map(guias).join('')}
${recuadroSvg}
${rotulos.map(r => `<g class="termino-ref"><rect x="${red(r.x - r.w / 2)}" y="${red(r.y - r.h / 2)}" width="${red(r.w)}" height="${r.h}" rx="3"/><text x="${red(r.x)}" y="${red(r.y)}" text-anchor="middle" dy=".35em">${esc(r.ref)}</text></g>`).join('\n')}
<path class="termino-escala" d="M${MARGEN} ${VH - 12}h${red(largoEscala)}M${MARGEN} ${VH - 16}v8M${red(MARGEN + largoEscala)} ${VH - 16}v8"/>
<text class="termino-escala-texto" x="${red(MARGEN + largoEscala + 6)}" y="${VH - 12}" dy=".35em">${metros >= 1000 ? String(metros / 1000).replace('.', ',') + ' km' : metros + ' m'}</text>
</svg>
`.replace(/\n{2,}/g, '\n');
fs.mkdirSync(path.join(BASE, 'marca'), { recursive: true });
fs.writeFileSync(path.join(BASE, 'marca/termino.svg'), svg);

const meta = {
  _leeme: 'Lo genera scripts/termino.mjs (no editar a mano salvo «fijado» en lugares, que el script respeta). aplicar.mjs pinta con esto el mapa del término en «El pueblo»: sin este archivo o sin marca/termino.svg, la sección no sale.',
  fuente: 'OpenStreetMap, por la API de Overpass', licencia: 'ODbL 1.0', atribucion: ATRIBUCION, atribucion_url: ATRIBUCION_URL,
  ...(datos._muestra ? { muestra: datos._muestra } : {}),
  nombre_osm: (datos.limite.tags || {}).name || null, relacion: 'relation/' + datos.limite.id,
  pueblo_osm: datos.pueblo ? 'node/' + datos.pueblo.id : null,
  casco_osm: (datos.casco || []).map(w => 'way/' + w.id),
  carreteras: [...refs.keys()].sort(), carreteras_osm: datos.elementos.filter(e => e.type === 'way' && e.tags && CARRETERA.test(e.tags.highway || '')).map(e => 'way/' + e.id),
  rutas: rutasD.map(x => ({ nombre: x.r.tags.name || x.r.tags.ref || 'Ruta sin nombre', osm: 'relation/' + x.r.id })),
  viewBox: `0 0 ${VW} ${VH}`, metros_por_unidad: Number((1 / escala).toFixed(3)), escala_m: metros, radio_punto: R,
  /* v3c · F25: el pueblo ampliado, si hacía falta (caja en el lienzo, zona que amplía y su escala) */
  recuadro: recuadro ? { caja: recuadro.caja.map(red), zona: [recuadro.zona.x0, recuadro.zona.y0, recuadro.zona.x1, recuadro.zona.y1].map(red),
    metros_por_unidad: Number((1 / recuadro.es2).toFixed(3)), escala_m: recuadro.metros, tapa_termino: Number(recuadro.tapa.toFixed(2)) } : null,
  fecha: datos.fecha, lugares
};
fs.writeFileSync(rutaMeta, JSON.stringify(meta, null, 2) + '\n');
console.log(`✓ marca/termino.svg (${(svg.length / 1024).toFixed(1)} kB): relation/${datos.limite.id} «${meta.nombre_osm}», ${carreteras.length} tramos de carretera (${meta.carreteras.join(', ') || 'sin matrícula'}), ${rutasD.length} rutas, casco: ${meta.casco_osm.length} áreas` +
  `\n  lugares en OSM (${lugares.length} de ${buscados.length}): ${lugares.map(l => l.nombre + ' → ' + l.osm).join(' · ') || 'ninguno'}`);
if (avisos.length) console.log('! ' + avisos.join('\n! '));
