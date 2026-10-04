/* nuevo-municipio.mjs — v3c · F26. El alta de un municipio nuevo desde datos abiertos: escribe un
   BORRADOR de municipio.json con lo que se puede sacar de fuentes abiertas y comprobables, cada dato
   con su fuente y su fecha, y ALTA-<slug>.md con lo que falta rellenar a mano, en orden de
   importancia, y las contradicciones entre fuentes (sin elegir: se dice y se deja a quien lo monta).

     node scripts/nuevo-municipio.mjs 06124 --salida ../alta-segura          por código INE (5 cifras)
     node scripts/nuevo-municipio.mjs "Segura de León" --salida ../alta-segura
                                                         por nombre (si hay dos, dice sus códigos)
     node scripts/nuevo-municipio.mjs 06124 --salida x --sin-red
                                                         sin red, con las respuestas de pruebas/alta/<ine>/
     node scripts/nuevo-municipio.mjs 06124 --salida x --desde carpeta
                                                         sin red, con las respuestas guardadas en otra carpeta
     node scripts/nuevo-municipio.mjs 06124 --salida x --sin-mapa
                                                         sin el mapa del término (no llama a Overpass)

   Escribe en --salida (nunca en la raíz de la plantilla ni encima de un municipio.json que no sea
   un borrador):
     municipio.json            el borrador: "_borrador": true y "_fuentes" (dato → fuente, url, fecha)
     ALTA-<slug>.md            lo que falta, por orden; contradicciones; lo que hay que comprobar
     marca/escudo.svg (+ PNG)  el escudo de Commons, si su ficha deja descargarlo (y escudo.mjs)
     marca/termino.svg|json    el mapa del término, con scripts/termino.mjs (OpenStreetMap)
     _respuestas/              todo lo que ha traído, para repetirlo con --desde sin red

   Fuentes (solo abiertas y comprobables; ninguna con datos de nadie):
     · INE (API JSON de INEbase, servicios.ine.es): el código y el nombre oficiales, la provincia y el
       padrón (cifras oficiales, tabla «<Provincia>: Población por municipios y sexo»).
     · Wikidata, consultado por SPARQL en el espejo QLever de la Universidad de Friburgo: el
       robots.txt de query.wikidata.org y de www.wikidata.org prohíbe /sparql y /w/ a los robots, y
       el de QLever no. Cada dato lleva la url de su elemento en wikidata.org para comprobarlo.
     · Wikimedia Commons: la ficha del escudo y de la bandera (autor y licencia, de su marcado legible
       por máquina) y el archivo, de upload.wikimedia.org.
     · Su web (la oficial de Wikidata): el pie de las webs de la Diputación de Badajoz (dirección, CP,
       teléfono, fax y correo) y el enlace a su sede.
     · Su sede: en Gestiona, /info.0 (lo único que su robots.txt deja leer): el nombre de la sede y el
       correo y el teléfono de «¿Tienes algún problema?». En la de la Diputación, solo la dirección.
     · OpenStreetMap: el término, con scripts/termino.mjs.
   Se respeta el robots.txt de cada sitio (con * y $). User-Agent genérico del proyecto, sin datos de
   nadie. Lo que no se encuentra queda null y sale en ALTA. Calculado (no consultado): el slug, el
   DIR3 (L01 + INE + dígito de control del INE) y el titular («Ayuntamiento de …»). */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const OPCIONES_CON_VALOR = ['--salida', '--desde'];
const entrada = args.find((a, i) => !a.startsWith('--') && !OPCIONES_CON_VALOR.includes(args[i - 1]));
const UA = 'plantilla-ayuntamiento-puerta-abierta/3 (alta de municipio en build; scripts/nuevo-municipio.mjs)';
const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const INE_API = 'https://servicios.ine.es/wstempus/js/ES/';
/* hosts de datos abiertos cuyo robots.txt no responde (el de servicios.ine.es corta la conexión):
   sin él no se lee nada de nadie más, pero la API JSON del INE es pública y para esto */
const ABIERTOS = new Set(['servicios.ine.es']);
/* el catálogo de Gestiona es común (RESKIN.md §4): estos dos uuid valen en Ribera y en Segura */
const GESTIONA_COMUN = { instancia_general: '5161fa8d-970e-4b48-a506-b2ac34ceafe5', quejas: 'ae05799c-df61-43d1-be43-31943561cea9' };

/* Las sedes de Gestiona (y otras) sirven el certificado sin el intermedio: el fetch de Node falla
   («unable to verify the first certificate») donde el navegador y curl no. Con --use-system-ca, Node
   usa también el almacén del sistema, que ya tiene los intermedios: si no se ha arrancado así, el
   script se vuelve a lanzar a sí mismo con él (sin red no hace falta) */
if (!args.includes('--sin-red') && !args.includes('--desde') && !process.execArgv.includes('--use-system-ca') && process.allowedNodeEnvironmentFlags.has('--use-system-ca')) {
  const r = spawnSync(process.execPath, ['--use-system-ca', ...process.execArgv, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}

const uso = 'Uso: node scripts/nuevo-municipio.mjs <código INE de 5 cifras | "Nombre"> --salida <carpeta> [--sin-red | --desde <carpeta>] [--sin-mapa]';
if (!entrada || !arg('--salida')) { console.error(uso); process.exit(2); }
const SALIDA = path.resolve(arg('--salida'));
if (SALIDA === RAIZ || path.resolve(SALIDA, 'municipio.json') === path.resolve(RAIZ, 'municipio.json')) {
  console.error('✗ --salida no puede ser la raíz de la plantilla: el borrador nunca va encima de su municipio.json'); process.exit(2);
}
if (fs.existsSync(path.join(SALIDA, 'municipio.json'))) {
  let previo = null; try { previo = JSON.parse(fs.readFileSync(path.join(SALIDA, 'municipio.json'), 'utf8')); } catch (e) { /* ilegible: tampoco se pisa */ }
  if (!previo || previo._borrador !== true) { console.error(`✗ ${path.join(SALIDA, 'municipio.json')} ya existe y no es un borrador de este script: no se pisa. Elige otra --salida`); process.exit(2); }
}

const slugDe = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esINE = /^\d{5}$/.test(entrada);

/* ── de dónde salen las respuestas: la red o una carpeta ── */
let DESDE = arg('--desde') ? path.resolve(arg('--desde')) : null;
if (args.includes('--sin-red')) {
  const base = path.join(RAIZ, 'pruebas/alta');
  DESDE = esINE ? path.join(base, entrada)
    : (fs.existsSync(base) ? fs.readdirSync(base).map(d => path.join(base, d)).find(d => fs.existsSync(path.join(d, `wikidata-nombre-${slugDe(entrada)}.json`))) : null);
  if (!DESDE || !fs.existsSync(DESDE)) { console.error(`✗ --sin-red: no hay respuestas guardadas para «${entrada}» en pruebas/alta/`); process.exit(2); }
}
const RESP = path.join(SALIDA, '_respuestas');
fs.mkdirSync(RESP, { recursive: true });
const consulta = DESDE && fs.existsSync(path.join(DESDE, '_consulta.json')) ? JSON.parse(fs.readFileSync(path.join(DESDE, '_consulta.json'), 'utf8')) : null;
const HOY = (consulta && consulta.fecha) || new Date().toISOString().slice(0, 10);
const traido = [];                                         /* lo pedido, para el informe: clave, url, bien o el fallo */

/* robots.txt: grupos por User-Agent (el nuestro o *), Allow/Disallow con * y $, gana la regla más larga */
const robots = new Map();
async function leerRobots(origen) {
  const host = new URL(origen).host;
  try {
    const r = await fetch(origen + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (r.status >= 400 && r.status < 500) return [];
    if (!r.ok) return ABIERTOS.has(host) ? [] : null;
    const grupos = []; let g = null, enReglas = false;
    for (const linea of (await r.text()).split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean)) {
      const i = linea.indexOf(':'); if (i < 0) continue;
      const k = linea.slice(0, i).trim().toLowerCase(), v = linea.slice(i + 1).trim();
      if (k === 'user-agent') { if (!g || enReglas) { g = { agentes: [], reglas: [] }; grupos.push(g); enReglas = false; } g.agentes.push(v.toLowerCase()); }
      else if ((k === 'allow' || k === 'disallow') && g) { enReglas = true; if (v) g.reglas.push([k === 'allow', v]); }
    }
    const nuestro = grupos.filter(x => x.agentes.some(a => a !== '*' && 'plantilla-ayuntamiento-puerta-abierta'.includes(a)));
    return (nuestro.length ? nuestro : grupos.filter(x => x.agentes.includes('*'))).flatMap(x => x.reglas);
  } catch (e) { return ABIERTOS.has(host) ? [] : null; }
}
async function robotsPermite(url) {
  const u = new URL(url);
  if (!robots.has(u.origin)) robots.set(u.origin, await leerRobots(u.origin));
  const reglas = robots.get(u.origin);
  if (reglas === null) return false;                     /* robots.txt caído (5xx o sin conexión): no se lee */
  const ruta = u.pathname + u.search;
  let mejor = null;
  for (const [permite, patron] of reglas) {
    const fin = patron.endsWith('$');
    const re = new RegExp('^' + (fin ? patron.slice(0, -1) : patron).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + (fin ? '$' : ''));
    if (re.test(ruta) && (!mejor || patron.length > mejor[1].length || (patron.length === mejor[1].length && permite))) mejor = [permite, patron];
  }
  return mejor ? mejor[0] : true;
}
/* una petición: con su cookie entre redirecciones (Gestiona la pone en la primera) y el robots.txt
   de cada salto */
async function traer(url, { metodo = 'GET', cuerpo = null, cabeceras = {} } = {}) {
  const tarro = new Map();
  let actual = url;
  for (let salto = 0; salto < 6; salto++) {
    if (!(await robotsPermite(actual))) throw new Error(robots.get(new URL(actual).origin) === null ? 'su robots.txt no responde: no se lee nada de ese sitio' : 'su robots.txt no deja leer ' + new URL(actual).pathname);
    const r = await fetch(actual, { method: metodo, body: cuerpo, redirect: 'manual', signal: AbortSignal.timeout(60000),
      headers: { 'User-Agent': UA, 'Accept-Language': 'es', ...cabeceras, ...(tarro.size ? { Cookie: [...tarro].map(([k, v]) => k + '=' + v).join('; ') } : {}) } });
    for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const kv = c.split(';')[0], i = kv.indexOf('='); if (i > 0) tarro.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      actual = new URL(r.headers.get('location'), actual).href;
      if (r.status !== 307 && r.status !== 308) { metodo = 'GET'; cuerpo = null; }
      continue;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { url: actual, buf: Buffer.from(await r.arrayBuffer()) };
  }
  throw new Error('demasiadas redirecciones');
}
/* Gestiona sirve UTF-8; las webs de la Diputación, ISO-8859-1 */
const texto = buf => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('latin1').decode(buf); } };
/* pedir(clave, url): de la red (y se guarda en _respuestas/<clave>) o de la carpeta de --desde */
async function pedir(clave, url, opciones = {}, binario = false) {
  if (DESDE) {
    const f = path.join(DESDE, clave);
    if (!fs.existsSync(f)) { traido.push({ clave, url, error: 'sin copia guardada' }); return null; }
    const b = fs.readFileSync(f);
    traido.push({ clave, url, ok: true });
    return binario ? b : b.toString('utf8');
  }
  try {
    const { buf } = await traer(url, opciones);
    const t = binario ? buf : texto(buf);
    fs.writeFileSync(path.join(RESP, clave), t);
    traido.push({ clave, url, ok: true });
    await new Promise(r => setTimeout(r, 400));            /* sin prisas con nadie */
    return t;
  } catch (e) { traido.push({ clave, url, error: e.message }); return null; }
}
const PREFIJOS = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX schema: <http://schema.org/>
`;
async function sparql(clave, q) {
  const t = await pedir(clave, QLEVER, { metodo: 'POST', cuerpo: 'query=' + encodeURIComponent(PREFIJOS + q),
    cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' } });
  if (!t) return null;
  try { return JSON.parse(t).results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))); }
  catch (e) { traido.push({ clave, url: QLEVER, error: 'respuesta que no es JSON' }); return null; }
}
const Q = iri => String(iri).replace('http://www.wikidata.org/entity/', '');

/* ── lo que se va escribiendo ── */
const F = {};                    /* _fuentes: ruta del dato → { fuente, url, consultado, nota } */
const contradicciones = [];      /* { dato, valores: [{ valor, fuente, url }], nota } */
const pistas = [];               /* { dato, texto }: lo encontrado que NO va al borrador */
const comprobar = [];            /* lo que va al borrador pero hay que mirar con ojos */
const fuente = (ruta, nombre, url, nota) => { F[ruta] = { fuente: nombre, url: url || null, consultado: HOY, ...(nota ? { nota } : {}) }; };
const telefonoBonito = t => { const d = String(t || '').replace(/\D/g, '').replace(/^34(?=\d{9}$)/, ''); return /^\d{9}$/.test(d) ? d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : null; };

/* el dígito de control del INE (el mismo que cierra el DIR3: L01 + INE + control). Comprobado con
   Ribera (06113 → 4) y Segura (06124 → 7) */
const controlINE = c => { const t = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 3, 8, 2, 7, 4, 1, 5, 9, 6], [0, 2, 4, 6, 8, 1, 3, 5, 7, 9]]; const s = [...c].reduce((a, d, i) => a + t[(5 - i) % 3][+d], 0); return (10 - s % 10) % 10; };

/* ═════════════ 1. ¿Qué municipio? El código del INE ═════════════ */
let ine = esINE ? entrada : null, item = null;
if (!esINE) {
  const nombre = entrada.replace(/["\\]/g, '');
  const filas = await sparql(`wikidata-nombre-${slugDe(nombre)}.json`, `SELECT ?item ?code WHERE { ?item rdfs:label "${nombre}"@es . ?item wdt:P772 ?code . }`);
  const cands = (filas || []).filter(f => /^\d{5}$/.test(f.code));
  if (!filas) { console.error(`✗ No se ha podido buscar «${entrada}» (Wikidata no responde): pásale el código INE de 5 cifras`); process.exit(1); }
  if (!cands.length) { console.error(`✗ Wikidata no tiene un municipio llamado «${entrada}» con código INE: pásale el código INE de 5 cifras`); process.exit(1); }
  if (new Set(cands.map(c => c.code)).size > 1) { console.error(`✗ Hay ${cands.length} municipios llamados «${entrada}»: ${cands.map(c => c.code + ' (' + Q(c.item) + ')').join(', ')}. Pásale el código INE`); process.exit(1); }
  ine = cands[0].code; item = Q(cands[0].item);
}
const cp2 = ine.slice(0, 2);

/* ── INE: la tabla del padrón de su provincia (la 2853 + código de provincia: Badajoz, 06 → 2859;
   se comprueba por el nombre de la tabla) y en ella su serie, por el código ── */
let ineMun = null, provincia = null, tablaId = null;
const tablas = await pedir('ine-tablas-22.json', INE_API + 'TABLAS_OPERACION/22');
try {
  const lista = JSON.parse(tablas || '[]');
  const t = lista.find(x => x.Id === 2853 + Number(cp2) && /: Población por municipios y sexo/.test(x.Nombre));
  if (t) { tablaId = t.Id; provincia = t.Nombre.split(':')[0].trim().replace(/^(.*), (A|As|O|Os|La|Las|El|Los|Les|Illes)$/, '$2 $1'); }
} catch (e) { /* sin tabla, sin padrón */ }
if (tablaId) {
  const datos = await pedir(`ine-tabla-${tablaId}-${ine}.json`, INE_API + `DATOS_TABLA/${tablaId}?nult=3&tip=M`);
  try {
    const series = JSON.parse(datos || '[]');
    const s = series.find(x => (x.MetaData || []).some(m => m.FK_Variable === 19 && m.Codigo === ine) && (x.MetaData || []).some(m => m.FK_Variable === 18 && m.Codigo === '0'));
    if (s) ineMun = { nombre: s.MetaData.find(m => m.FK_Variable === 19).Nombre, serie: s.COD, datos: (s.Data || []).filter(d => d.Valor != null).sort((a, b) => b.Anyo - a.Anyo) };
  } catch (e) { /* queda null */ }
}
const URL_INE = tablaId ? `https://www.ine.es/jaxiT3/Tabla.htm?t=${tablaId}` : 'https://www.ine.es';

/* ── Wikidata ── */
if (!item) {
  const filas = await sparql(`wikidata-ine-${ine}.json`, `SELECT ?item WHERE { ?item wdt:P772 "${ine}" . }`);
  if (filas && filas.length === 1) item = Q(filas[0].item);
  else if (filas && filas.length > 1) pistas.push({ dato: 'Wikidata', texto: `${filas.length} elementos con el código INE ${ine} (${filas.map(f => Q(f.item)).join(', ')}): no se ha usado ninguno` });
}
const W = {};                    /* propiedad → [valores] (directas, rango preferente) */
let etiquetas = {}, declaraciones = [], unidades = {}, wdModificado = null;
if (item) {
  const directas = await sparql(`wikidata-${item}.json`, `SELECT ?p ?o WHERE { wd:${item} ?p ?o . FILTER(!isLiteral(?o) || LANG(?o) = "" || LANG(?o) = "es") }`);
  for (const f of directas || []) {
    const k = f.p.replace('http://www.wikidata.org/prop/direct/', 'wdt:').replace('http://www.w3.org/2000/01/rdf-schema#label', 'label').replace('http://schema.org/dateModified', 'modificado');
    (W[k] = W[k] || []).push(f.o);
  }
  wdModificado = (W.modificado || [])[0] || null;
  declaraciones = (await sparql(`wikidata-${item}-declaraciones.json`, `SELECT ?prop ?st ?p ?o WHERE { VALUES ?prop { p:P1082 p:P6 } wd:${item} ?prop ?st . ?st ?p ?o . }`)) || [];
  for (const f of (await sparql(`wikidata-${item}-unidades.json`, `SELECT ?prop ?u WHERE { VALUES (?prop ?pv) { (p:P2046 psv:P2046) (p:P2044 psv:P2044) } wd:${item} ?prop ?st . ?st ?pv ?v . ?v wikibase:quantityUnit ?u . }`)) || [])
    unidades[f.prop.split('/').pop()] = Q(f.u);
  const enlazados = [...new Set([...(W['wdt:P131'] || []), ...declaraciones.filter(d => /statement\/P6$/.test(d.p)).map(d => d.o)].map(Q))];
  if (enlazados.length) for (const f of (await sparql(`wikidata-${item}-etiquetas.json`, `SELECT ?e ?l ?tl WHERE { VALUES ?e { ${enlazados.map(e => 'wd:' + e).join(' ')} } ?e rdfs:label ?l . FILTER(LANG(?l) = "es") OPTIONAL { ?e wdt:P31 ?t . ?t rdfs:label ?tl . FILTER(LANG(?tl) = "es") } }`)) || [])
    etiquetas[Q(f.e)] = { nombre: f.l, tipos: [...((etiquetas[Q(f.e)] || {}).tipos || []), ...(f.tl ? [f.tl] : [])] };
}
const URL_WD = item ? `https://www.wikidata.org/wiki/${item}` : null;
const w1 = k => (W[k] || [])[0] ?? null;
const archivoCommons = iri => iri ? decodeURIComponent(String(iri).replace(/^.*Special:FilePath\//, '')).replace(/_/g, ' ') : null;

/* ═════════════ 2. El borrador ═════════════ */
const nombreINE = ineMun ? ineMun.nombre.replace(/^(.*), (La|Las|El|Los)$/, '$2 $1') : null;
const nombreWD = w1('label');
const nombre = nombreINE || nombreWD || (esINE ? null : entrada);
if (!nombre) { console.error(`✗ Ni el INE ni Wikidata responden para el código ${ine}: sin nombre no hay borrador. Prueba más tarde o con --desde`); process.exit(1); }
if (nombreINE && nombreWD && normal(nombreINE) !== normal(nombreWD))
  contradicciones.push({ dato: 'nombre', valores: [{ valor: nombreINE, fuente: 'INE', url: URL_INE }, { valor: nombreWD, fuente: 'Wikidata', url: URL_WD }], nota: 'Se usa el del INE, que es el oficial; mira cómo lo escribe el Ayuntamiento' });
const slug = slugDe(nombre);
const B = {
  _leeme: `BORRADOR de scripts/nuevo-municipio.mjs (${HOY}). Cada dato encontrado lleva su fuente en _fuentes; lo que no se ha encontrado va null y está en ALTA-${slug}.md, por orden. aplicar.mjs no escribe hasta que esté lo obligatorio. Quita "_borrador" cuando lo hayas repasado.`,
  _borrador: true,
  slug, nombre, nombre_corto: nombre, provincia: provincia || null, comarca: null, gentilicio: null, habitantes: null, altitud_m: null, cifras: null,
  lema: null, propuesta: true, indexar: false, url: '', fecha_datos: HOY, web_actual: null,
  contacto: { direccion: null, cp: null, telefono: null, fax: null, correo: null, mapa_consulta: null },
  horario: null, redes: [], ine,
  sede: null, tablon_autorizado: false,
  legal: { titular: 'Ayuntamiento de ' + nombre, nif: null, dir3: 'L01' + ine + controlINE(ine), direccion_registro: null },
  escudo_credito: null, corporacion: null, alcaldia: {}, quien: [], servicios: null,
  urgencias: [{ nombre: 'Emergencias', telefono: '112' }], listin_corto: null, tramites: null, pueblo: null, fotos: null,
  _fuentes: F
};
fuente('slug', 'calculado del nombre');
fuente('nombre', nombreINE ? 'INE, relación de municipios (tabla del padrón)' : 'Wikidata', nombreINE ? URL_INE : URL_WD);
fuente('nombre_corto', 'por defecto, el nombre entero', null, 'Acórtalo si en el pueblo se dice de otra forma (sale en «Hoy en …» y «El año en …»)');
if (provincia) fuente('provincia', 'INE (la tabla del padrón de la provincia)', URL_INE);
fuente('ine', ineMun ? 'INE (código de la serie del padrón)' : item ? 'Wikidata (P772, código INE)' : 'dado al llamar al script', ineMun ? URL_INE : URL_WD);
fuente('legal.dir3', 'calculado: L01 + código INE + dígito de control del INE', null, 'Es como se forma el código DIR3 de un ayuntamiento; míralo en <sede>/ownership o en el directorio DIR3');
fuente('legal.titular', 'calculado del nombre');
fuente('urgencias', '112, el teléfono de emergencias de toda la UE');
if (!ineMun && esINE) pistas.push({ dato: 'código INE', texto: `El INE no ha devuelto el municipio ${ine}${tablaId ? ` en la tabla ${tablaId}` : ''}: comprueba el código en ${URL_INE}` });
if (ineMun && item && w1('wdt:P772') && w1('wdt:P772') !== ine)
  contradicciones.push({ dato: 'código INE', valores: [{ valor: ine, fuente: 'INE', url: URL_INE }, { valor: w1('wdt:P772'), fuente: 'Wikidata', url: URL_WD }] });

/* habitantes: el padrón del INE, y Wikidata para contrastar. Si dicen cosas distintas del MISMO año,
   no se elige: null y a ALTA. Si Wikidata va atrasado, vale el más reciente y se dice */
const popWD = (() => {
  const por = {};
  for (const d of declaraciones.filter(d => /prop\/P1082$/.test(d.prop))) {
    const s = por[d.st] = por[d.st] || {};
    if (/statement\/P1082$/.test(d.p)) s.valor = Number(d.o);
    if (/qualifier\/P585$/.test(d.p)) s.anio = Number(d.o.slice(0, 4));
    if (/ontology#rank$/.test(d.p)) s.rango = d.o.split('#')[1];
  }
  return Object.values(por).filter(s => Number.isFinite(s.valor) && s.rango !== 'DeprecatedRank').sort((a, b) => (b.anio || 0) - (a.anio || 0))[0] || null;
})();
const popINE = ineMun && ineMun.datos[0] ? { valor: ineMun.datos[0].Valor, anio: ineMun.datos[0].Anyo } : null;
if (popINE && popWD && popWD.anio === popINE.anio && popWD.valor !== popINE.valor) {
  contradicciones.push({ dato: 'habitantes', valores: [{ valor: popINE.valor + ' (' + popINE.anio + ')', fuente: 'INE, padrón', url: URL_INE }, { valor: popWD.valor + ' (' + popWD.anio + ')', fuente: 'Wikidata', url: URL_WD }], nota: 'Mismo año y distinta cifra: no se pone ninguna' });
} else if (popINE) {
  B.habitantes = { valor: popINE.valor, fuente: `INE, padrón a 1-1-${popINE.anio}` };
  fuente('habitantes', 'INE, cifras oficiales del padrón', URL_INE);
  if (popWD && popWD.valor !== popINE.valor) contradicciones.push({ dato: 'habitantes (de años distintos)', valores: [{ valor: popINE.valor + ' (' + popINE.anio + ')', fuente: 'INE, padrón', url: URL_INE }, { valor: popWD.valor + ' (' + (popWD.anio || 'sin año') + ')', fuente: 'Wikidata', url: URL_WD }], nota: (popWD.anio || 0) < popINE.anio ? 'Wikidata va atrasado: se ha puesto la del INE, la más reciente' : 'Wikidata trae un año más reciente que el INE: mira cuál es la cifra oficial' });
} else if (popWD) {
  B.habitantes = { valor: popWD.valor, fuente: `Wikidata${popWD.anio ? ', ' + popWD.anio : ''}` };
  fuente('habitantes', 'Wikidata (P1082); el INE no ha respondido', URL_WD, 'Cámbialo por la cifra del padrón del INE');
  comprobar.push('habitantes: viene de Wikidata porque el INE no respondió; pon la cifra oficial del padrón');
}

/* lo demás de Wikidata */
const unidad = (prop, esperada) => !unidades[prop] || unidades[prop] === esperada;
if (w1('wdt:P2044') != null && unidad('P2044', 'Q11573')) { B.altitud_m = Math.round(Number(w1('wdt:P2044'))); fuente('altitud_m', 'Wikidata (P2044, altitud)', URL_WD, 'Contrasta con el IGN o la ficha de la Diputación'); }
const superficie = w1('wdt:P2046') != null && unidad('P2046', 'Q712226') ? Number(w1('wdt:P2046')) : null;
const gentilicios = [...new Set(W['wdt:P1549'] || [])];
if (gentilicios.length === 1) {
  B.gentilicio = gentilicios[0]; fuente('gentilicio', 'Wikidata (P1549, gentilicio)', URL_WD);
  if (!/s$/.test(B.gentilicio) || /^[A-ZÁÉÍÓÚÑ]/.test(B.gentilicio)) comprobar.push(`gentilicio: Wikidata dice «${B.gentilicio}»; la plantilla lo usa en plural y en minúscula («ribereños»)`);
}
else if (gentilicios.length > 1) contradicciones.push({ dato: 'gentilicio', valores: gentilicios.map(g => ({ valor: g, fuente: 'Wikidata', url: URL_WD })), nota: 'Wikidata trae varios: elige el que use el Ayuntamiento (en plural, como «ribereños»)' });
const comarcas = (W['wdt:P131'] || []).map(Q).filter(e => etiquetas[e] && etiquetas[e].tipos.some(t => /comarca|mancomunidad/i.test(t)));
if (comarcas.length === 1) { B.comarca = etiquetas[comarcas[0]].nombre.replace(/^comarca de /i, ''); fuente('comarca', 'Wikidata (P131, en la comarca)', URL_WD); }
const web = w1('wdt:P856');
if (web) { B.web_actual = web.replace(/^http:\/\//, 'https://').replace(/\/\/www\./, '//').replace(/\/$/, ''); fuente('web_actual', 'Wikidata (P856, web oficial)', URL_WD, 'Ábrela: que sea la del Ayuntamiento y no la de turismo'); }
const cps = [...new Set(W['wdt:P281'] || [])].filter(c => /^\d{5}$/.test(c));
if (cps.length === 1) { B.contacto.cp = cps[0]; fuente('contacto.cp', 'Wikidata (P281, código postal)', URL_WD); }
else if (cps.length > 1) pistas.push({ dato: 'contacto.cp', texto: `Wikidata trae varios códigos postales (${cps.join(', ')}): el del Ayuntamiento es el de su dirección` });
const alcaldes = (() => {
  const por = {};
  for (const d of declaraciones.filter(d => /prop\/P6$/.test(d.prop))) {
    const s = por[d.st] = por[d.st] || {};
    if (/statement\/P6$/.test(d.p)) s.quien = Q(d.o);
    if (/qualifier\/P580$/.test(d.p)) s.desde = d.o.slice(0, 10);
    if (/qualifier\/P582$/.test(d.p)) s.hasta = d.o.slice(0, 10);
  }
  return Object.values(por).filter(s => s.quien && !s.hasta);
})();
for (const a of alcaldes) pistas.push({ dato: 'corporacion', texto: `Wikidata da como alcalde/sa a ${(etiquetas[a.quien] || {}).nombre || a.quien}${a.desde ? ' desde ' + a.desde : ''} (${URL_WD}). No va al borrador: la corporación sale de los BOP (RESKIN.md §2)` });
for (const [p, red, url] of [['P2013', 'Facebook', 'https://www.facebook.com/'], ['P2003', 'Instagram', 'https://www.instagram.com/'], ['P2002', 'X (Twitter)', 'https://x.com/'], ['P2397', 'YouTube', 'https://www.youtube.com/channel/']])
  for (const v of W['wdt:' + p] || []) pistas.push({ dato: 'redes', texto: `${red} según Wikidata: ${url}${v} (mira que sea del Ayuntamiento y no del pueblo o de una asociación)` });
const foto = archivoCommons(w1('wdt:P18'));
if (foto) pistas.push({ dato: 'fotos', texto: `Foto principal en Wikidata: https://commons.wikimedia.org/wiki/File:${encodeURIComponent(foto.replace(/ /g, '_'))} (mira autor y licencia en su ficha)` });

/* cifras para la portada: solo las que tienen fuente y año */
const cifras = [];
if (B.habitantes && popINE) cifras.push({ valor: popINE.valor, unidad: 'habitantes', etiqueta: 'en el padrón municipal', fuente: 'INE, padrón', fuente_url: URL_INE, anio: popINE.anio });
if (superficie) cifras.push({ valor: Math.round(superficie * 10) / 10, unidad: 'km²', etiqueta: 'de término municipal', fuente: 'Wikidata', fuente_url: URL_WD, anio: null });
if (B.altitud_m != null) cifras.push({ valor: B.altitud_m, unidad: 'metros', etiqueta: 'de altitud', fuente: 'Wikidata', fuente_url: URL_WD, anio: null });
if (cifras.length) { B.cifras = cifras; fuente('cifras', 'INE y Wikidata (cada cifra lleva la suya)', null, 'Superficie y altitud de Wikidata, sin año (Wikidata no lo da): contrástalas con el IGN o la Diputación'); }

/* ── Commons: el escudo (y la bandera, solo como pista) ── */
async function fichaCommons(archivo, clave) {
  const url = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(archivo.replace(/ /g, '_'));
  const h = await pedir(clave, url);
  if (!h) return { url, ok: false };
  const des = s => s.replace(/&#95;/g, '_');
  const hh = des(h);
  const cortos = [...hh.matchAll(/class="licensetpl_short"[^>]*>([^<]*)</g)].map(m => m[1].trim()).filter(Boolean);
  const enlaces = [...hh.matchAll(/class="licensetpl_link"[^>]*>([^<]*)</g)].map(m => m[1].trim());
  /* el autor: el campo «Author» de la ficha o, si no lo tiene legible, la atribución que pide la licencia */
  const autor = (/id="fileinfotpl_aut"[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(hh) || /class="licensetpl_attr"[^>]*>([\s\S]*?)<\/div>/.exec(hh) || [])[1];
  const limpio = s => s ? s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim() : null;
  const i = Math.max(0, cortos.findIndex(c => /^(CC|Public domain|PD)/i.test(c)));
  return { url, ok: true, autor: limpio(autor), licencia: cortos[i] || null, licencias: cortos, licencia_url: enlaces[i] || null };
}
const escudo = archivoCommons(w1('wdt:P94'));
if (escudo) {
  const f = await fichaCommons(escudo, `commons-escudo-${slug}.html`);
  if (f.ok && f.autor && f.licencia) {
    B.escudo_credito = { autor: f.autor, licencia: f.licencia, url: f.url };
    fuente('escudo_credito', 'Wikimedia Commons, ficha del archivo (marcado de autor y licencia)', f.url, f.licencias.length > 1 ? 'Tiene varias licencias (' + f.licencias.join(', ') + '): se ha puesto la CC' : null);
    comprobar.push(`escudo: es el de Wikidata (${escudo}); mira que sea el que usa el Ayuntamiento (su web, su sede) y el autor tal como pide la ficha`);
  } else pistas.push({ dato: 'escudo_credito', texto: `Wikidata da el escudo ${f.url}, pero no se ha podido leer su autor y licencia` });
  /* el archivo, de upload.wikimedia.org (la ruta de Commons: md5 del nombre) */
  /* el archivo va directo a marca/ (con el nombre que usa escudo.mjs), no a _respuestas/: sin red no se baja */
  if (!DESDE) {
    const n = escudo.replace(/ /g, '_'), md5 = crypto.createHash('md5').update(n).digest('hex'), ext = path.extname(n).toLowerCase();
    const url = `https://upload.wikimedia.org/wikipedia/commons/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(n)}`;
    try {
      const { buf } = await traer(url);
      fs.mkdirSync(path.join(SALIDA, 'marca'), { recursive: true });
      const destino = path.join(SALIDA, 'marca', ext === '.svg' ? 'escudo.svg' : 'escudo-original' + ext);
      fs.writeFileSync(destino, buf);
      traido.push({ clave: 'marca/' + path.basename(destino), url, ok: true });
      const e = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/escudo.mjs'), destino, '--dir', path.join(SALIDA, 'marca')], { encoding: 'utf8' });
      if (e.status !== 0) pistas.push({ dato: 'escudo', texto: 'escudo.mjs no ha podido rasterizarlo: ' + (e.stderr || e.stdout).trim().split('\n').pop() });
    } catch (e) { traido.push({ clave: 'marca/escudo', url, error: e.message }); }
  }
}
const bandera = archivoCommons(w1('wdt:P41'));
if (bandera) pistas.push({ dato: 'bandera', texto: `Bandera en Commons: https://commons.wikimedia.org/wiki/File:${encodeURIComponent(bandera.replace(/ /g, '_'))} (no la usa la plantilla)` });

/* ── su web: el pie de las webs de la Diputación y el enlace a la sede ── */
let sedeGestiona = null, sedeDiputacion = null, entId = null;
const deWeb = {};
if (B.web_actual) {
  const h = await pedir(`web-portada-${slug}.html`, B.web_actual + '/');
  const fallo = !h && (traido[traido.length - 1] || {}).error;
  if (fallo && !DESDE) comprobar.push(`web_actual: ${B.web_actual} no ha respondido (${fallo}); puede que Wikidata tenga una dirección vieja: busca la web del Ayuntamiento`);
  if (h) {
    const plano = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
    /* «Ayuntamiento de X  Plaza de España, 1 \n 06270 X (Badajoz) Ver mapa Telf.: 924703011 Fax: 924703109 E-mail: ayuntamiento[@]x.es» */
    const pie = new RegExp('Ayuntamiento de ' + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+([^\\n]{3,80}?)\\s*\\n?\\s*(\\d{5})\\s+[^()\\n]{2,60}\\(([^)]+)\\)[\\s\\S]{0,40}?Tel[éef]*\\.?:?\\s*([\\d .]{9,13})(?:[\\s\\S]{0,10}?Fax:?\\s*([\\d .]{9,13}))?[\\s\\S]{0,20}?E-?mail:?\\s*([\\w.+-]+)\\s*\\[?@\\]?\\s*([\\w.-]+\\.[a-z]{2,})', 'i').exec(plano);
    if (pie) Object.assign(deWeb, { direccion: pie[1].trim().replace(/\s+/g, ' ').replace(/[\s,;-]+$/, ''), cp: pie[2], telefono: telefonoBonito(pie[4]), fax: telefonoBonito(pie[5]), correo: (pie[6] + '@' + pie[7]).toLowerCase() });
    const g = /https?:\/\/([a-z0-9-]+)\.sedelectronica\.es/i.exec(h);
    if (g) sedeGestiona = `https://${g[1].toLowerCase()}.sedelectronica.es`;
    const d = /https?:\/\/(sede\.[a-z0-9.-]+\.[a-z]{2,})/i.exec(h);
    if (d && !g) { sedeDiputacion = 'https://' + d[1].toLowerCase(); entId = (new RegExp(d[1].replace(/\./g, '\\.') + '[^"\'\\s]*ent_id=(\\d+)', 'i').exec(h) || [])[1] || null; }
  }
}
/* ── la sede de Gestiona: la de su web o, si no la enlaza, <nombre sin espacios>.sedelectronica.es.
   Solo /info.0 (lo que deja su robots.txt). Un subdominio que no es de nadie da «Sede Electrónica
   Indeterminada» */
const candidatas = [...new Set([sedeGestiona, sedeDiputacion ? null : `https://${slug.replace(/-/g, '')}.sedelectronica.es`].filter(Boolean))];
let deSede = null;
for (const base of candidatas) {
  const h = await pedir(`sede-info-${new URL(base).host.split('.')[0]}.html`, base + '/info.0');
  if (!h) continue;
  const titulo = ((/<title>([^<]*)<\/title>/i.exec(h) || [])[1] || '').trim();
  const de = (/Sede Electr[oó]nica de (.+?)(?:\s+-\s+.*)?$/i.exec(titulo) || [])[1];
  if (!de || normal(de) !== normal(nombre)) { if (base === sedeGestiona) pistas.push({ dato: 'sede', texto: `Su web enlaza ${base}, pero su página dice «${titulo}»` }); continue; }
  const bloque = (/Tienes alg[uú]n problema[\s\S]{0,1500}/i.exec(h) || [''])[0];
  deSede = { base, titulo, correo: ((/mailto:([^"?]+)/i.exec(bloque) || [])[1] || '').toLowerCase() || null, telefono: telefonoBonito((/tel:([+\d]+)/i.exec(bloque) || [])[1]) };
  break;
}
if (deSede) {
  B.sede = { tipo: 'gestiona', base: deSede.base, instancia_general: GESTIONA_COMUN.instancia_general, quejas: GESTIONA_COMUN.quejas, perfil_contratante: null };
  fuente('sede.base', `su sede (Gestiona): «${deSede.titulo}»`, deSede.base + '/info.0');
  fuente('sede.instancia_general', 'uuid común del catálogo de Gestiona (RESKIN.md §4: el mismo en Ribera y Segura)', `${deSede.base}/catalog/t/${GESTIONA_COMUN.instancia_general}`, 'Sin comprobar en esta sede: su robots.txt no deja leer el catálogo');
  fuente('sede.quejas', 'uuid común del catálogo de Gestiona', `${deSede.base}/catalog/t/${GESTIONA_COMUN.quejas}`, 'Sin comprobar en esta sede');
  comprobar.push(`sede: abre ${deSede.base}/catalog/t/${GESTIONA_COMUN.instancia_general} y ${deSede.base}/catalog/t/${GESTIONA_COMUN.quejas} en el navegador: el título tiene que ser «Instancia General» y «Quejas y Sugerencias» (un uuid que no existe también da 200)`);
} else if (sedeDiputacion) {
  B.sede = { tipo: 'diputacion', base: sedeDiputacion, ent_id: entId ? Number(entId) : null, opc: { tablon: null, transparencia: null, perfil: null }, instancia_general: null };
  fuente('sede.base', 'el enlace a la sede de su web (plataforma de la Diputación de Badajoz)', B.web_actual, 'Sin comprobar: las sedes de la Diputación no siempre responden desde fuera');
  if (entId) fuente('sede.ent_id', 'el enlace a la sede de su web', B.web_actual);
}

/* ── contacto: el pie de su web y la sede; si no casan, no se elige ── */
const deDonde = { web: ['su web (pie de página)', B.web_actual], sede: ['su sede («¿Tienes algún problema?»)', deSede && deSede.base + '/info.0'] };
for (const campo of ['direccion', 'cp', 'telefono', 'fax', 'correo']) {
  const vals = [['web', deWeb[campo]], ['sede', deSede && deSede[campo]]].filter(([, v]) => v);
  const previo = B.contacto[campo];
  if (previo && vals.length && vals.every(([, v]) => normal(v) !== normal(previo))) vals.push(['wikidata', previo]);
  const distintos = [...new Set(vals.map(([, v]) => normal(v)))];
  if (distintos.length > 1) {
    contradicciones.push({ dato: 'contacto.' + campo, valores: vals.map(([d, v]) => ({ valor: v, fuente: d === 'wikidata' ? 'Wikidata' : deDonde[d][0], url: d === 'wikidata' ? URL_WD : deDonde[d][1] })), nota: 'No se ha puesto ninguno' });
    B.contacto[campo] = null; delete F['contacto.' + campo];
  } else if (vals.length) {
    B.contacto[campo] = vals[0][1];
    fuente('contacto.' + campo, vals.map(([d]) => deDonde[d][0]).join(' y '), deDonde[vals[0][0]][1]);
  }
}
if (deSede && (deSede.telefono || deSede.correo) && !deWeb.telefono) comprobar.push('contacto: el teléfono y el correo salen de la sede («¿Tienes algún problema?»): mira que sean los del Ayuntamiento y no los de un servicio');
if (B.contacto.direccion) { B.legal.direccion_registro = B.contacto.direccion; fuente('legal.direccion_registro', 'la misma que la del contacto', F['contacto.direccion'].url); }
if (B.contacto.direccion && B.contacto.cp) { B.contacto.mapa_consulta = `Ayuntamiento de ${nombre}, ${B.contacto.direccion}, ${B.contacto.cp} ${nombre}, ${provincia || ''}`.replace(/, $/, ''); fuente('contacto.mapa_consulta', 'calculado de la dirección'); }
pistas.push({ dato: 'legal.nif', texto: `Los ayuntamientos suelen tener NIF P${ine}00 + letra (Ribera: P0611300E; Segura: P0612400B), pero no siempre: cópialo de ${B.sede ? B.sede.base + '/ownership (en el navegador)' : 'su sede (titularidad)'} o de una factura` });

/* ── trámites: en Gestiona, el catálogo común de la plantilla (solo los que van por uuid; los
   impresos de la web de Ribera, fuera) ── */
if (B.sede && B.sede.tipo === 'gestiona') {
  try {
    const T = JSON.parse(fs.readFileSync(path.join(RAIZ, 'municipio.json'), 'utf8'));
    const origen = new RegExp([T.nombre, T.nombre_corto].filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const limpio = x => x && x.id && !x.url && !origen.test(JSON.stringify(x));
    const t = T.tramites || {};
    B.tramites = {
      atajos: (t.atajos || []).filter(limpio),
      temas: (t.temas || []).map(tm => ({ ...tm, tramites: (tm.tramites || []).filter(limpio) })).filter(tm => tm.tramites.length && !origen.test(tm.nombre + (tm.nota || ''))),
      momentos: (t.momentos || []).filter(m => (m.pasos || []).every(p => !p.url) && !origen.test(JSON.stringify(m))),
      sinonimos: t.sinonimos || {},
      todos: (t.todos || []).filter(limpio)
    };
    fuente('tramites', 'catálogo común de Gestiona, copiado de la plantilla (solo los trámites por uuid)', null, 'Cada ayuntamiento activa los suyos: compruébalos en su sede');
    comprobar.push(`trámites: ${B.tramites.todos.length} del catálogo común de Gestiona. Abre unos cuantos en ${B.sede.base}/catalog/t/<uuid>: el título tiene que ser el del trámite. Quita los que no tenga y añade los suyos (y sus impresos en PDF, con url)`);
  } catch (e) { /* sin plantilla legible, sin trámites */ }
}

/* ═════════════ 3. El mapa del término (OpenStreetMap, con termino.mjs) ═════════════ */
fs.mkdirSync(SALIDA, { recursive: true });
const escribirBorrador = () => fs.writeFileSync(path.join(SALIDA, 'municipio.json'), JSON.stringify(B, null, 2) + '\n');
escribirBorrador();
let mapa = null;
const relacion = w1('wdt:P402');
if (!args.includes('--sin-mapa')) {
  const copia = DESDE ? path.join(DESDE, 'termino-overpass.json') : path.join(RESP, 'termino-overpass.json');
  if (DESDE && !fs.existsSync(copia)) mapa = { error: 'sin copia guardada de Overpass' };
  else {
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/termino.mjs'), '--raiz', SALIDA, ...(relacion ? ['--relacion', relacion] : []), ...(DESDE ? ['--desde', copia] : ['--guardar', copia])], { encoding: 'utf8' });
    mapa = r.status === 0 ? { ok: true, salida: r.stdout.trim().split('\n')[0] } : { error: (r.stderr || r.stdout).trim().split('\n').filter(Boolean).slice(-1)[0] };
    traido.push({ clave: 'termino-overpass.json', url: 'Overpass (scripts/termino.mjs)' + (relacion ? ', relation/' + relacion : ''), ...(mapa.ok ? { ok: true } : { error: mapa.error }) });
  }
}
if (relacion) fuente('_osm_relacion', 'Wikidata (P402, relación de OpenStreetMap)', `https://www.openstreetmap.org/relation/${relacion}`);

/* ═════════════ 4. ALTA-<slug>.md ═════════════ */
const nada = v => v == null || v === '' || (Array.isArray(v) && !v.length);
const contadas = new Set();
const pistasDe = dato => pistas.filter(p => p.dato === dato || p.dato.startsWith(dato + '.')).map(p => (contadas.add(p), `  - Pista: ${p.texto}`));
const rel = f => path.relative(RAIZ, f).split(path.sep).join('/');
const faltan = [];
const falta = (dato, texto, ...mas) => faltan.push([`- [ ] **${dato}**: ${texto}`, ...mas].join('\n'));
/* 1. lo que aplicar.mjs exige: contacto, horario, sede, legal, escudo */
for (const c of ['direccion', 'cp', 'telefono', 'correo']) if (nada(B.contacto[c]))
  falta('contacto.' + c, { direccion: 'la del Ayuntamiento («Plaza de España, 1»)', cp: 'el de la dirección del Ayuntamiento', telefono: 'el de la centralita, como «924 536 011»', correo: 'el general del Ayuntamiento' }[c] + ' (obligatorio)', ...pistasDe('contacto.' + c));
falta('horario', 'el de atención al público: `texto` y `tramos` (obligatorio). Ninguna fuente abierta lo da con garantía: pregúntalo o míralo en su web; mientras, con `"ejemplo": true`');
if (!B.sede) falta('sede', 'no se ha encontrado su sede electrónica (obligatoria: `tipo`, `base` e `instancia_general`). Mira el enlace «Sede electrónica» de su web (RESKIN.md §4)', ...pistasDe('sede'));
else if (B.sede.tipo === 'diputacion') falta('sede (Diputación)', `\`ent_id\`${B.sede.ent_id ? ' (puesto: ' + B.sede.ent_id + ')' : ''}, los \`opc\` de tablón, transparencia y perfil, e \`instancia_general\` (la url de la ficha del registro general). Salen del menú de ${B.sede.base} (RESKIN.md §4)`);
falta('legal.nif', 'el NIF del Ayuntamiento (obligatorio)', ...pistasDe('legal.nif'));
if (!B.escudo_credito) falta('escudo', 'el escudo y su crédito (`escudo_credito`: autor, licencia y url de la ficha de Commons; obligatorio)', ...pistasDe('escudo'));
falta('escudo y colores', fs.existsSync(path.join(SALIDA, 'marca/escudo-480.png')) ? `el escudo ya está en ${rel(path.join(SALIDA, 'marca'))}/; saca los colores con \`python scripts/marca-desde-escudo.py\` (RESKIN.md §5)` : `\`node scripts/escudo.mjs <escudo.svg>\` y \`python scripts/marca-desde-escudo.py\` (RESKIN.md §5)`);
/* 2. lo que hace que la web sirva */
falta('corporacion', 'los grupos y los concejales, de los BOP de Badajoz (nombramientos y delegaciones), nunca de la ficha de la Diputación', ...pistasDe('corporacion'));
if (!B.tramites) falta('tramites', 'el catálogo de su sede: `atajos`, `temas`, `momentos` y `todos` (obligatorio)');
falta('servicios', 'el listín: Guardia Civil, centro de salud, colegio, biblioteca… con su teléfono y su fuente (su web, guardiacivil.es, educarex, el SES); y `listin_corto` (4 nombres)');
falta('fotos', 'el arco de la portada y las cabeceras: fotos de Commons con autor y licencia en `media/creditos.json` (RESKIN.md §6)', ...pistasDe('fotos'));
falta('pueblo', 'entradilla, historia, lugares, patrimonio, fiestas, gastronomía… Cada bloque vacío desaparece');
if (!mapa || !mapa.ok) falta('mapa del término', mapa && mapa.error ? `no ha salido (${mapa.error}). Repite \`node scripts/termino.mjs --raiz <carpeta>${relacion ? ' --relacion ' + relacion : ''}\` cuando Overpass responda` : `\`node scripts/termino.mjs${relacion ? ' --relacion ' + relacion : ''}\` (RESKIN.md §6 ter)`);
falta('plano del pie', '`node scripts/plano.mjs` (el Ayuntamiento por su elemento de OSM; RESKIN.md §6 bis)');
for (const c of ['gentilicio', 'comarca']) if (nada(B[c])) falta(c, 'no consta en Wikidata (opcional)', ...pistasDe(c));
falta('lo opcional', '`lema`, `redes`, `plenos`, `farmacias`, `canal_avisos`, `incidencias`, `recogida`, contenido (avisos, agenda, noticias)… Solo lo que conste', ...pistasDe('redes'));

const tabla = filas => filas.map(f => `| ${f.join(' | ')} |`).join('\n');
const md = `# Alta de ${nombre} (INE ${ine})

Borrador escrito por \`scripts/nuevo-municipio.mjs\` el ${HOY}${DESDE ? ' (desde respuestas guardadas)' : ''}. El borrador es \`municipio.json\` de esta carpeta: cada dato lleva su fuente en \`_fuentes\`; lo que no se ha encontrado está en \`null\` y aquí abajo, por orden de importancia.

${tabla([['Dato', 'Valor', 'Fuente'], ['---', '---', '---'],
  ...['nombre', 'ine', 'provincia', 'habitantes', 'legal.dir3', 'web_actual', 'sede.base', 'contacto.telefono', 'contacto.correo', 'escudo_credito'].map(k => {
    const v = k.split('.').reduce((o, x) => (o == null ? null : o[x]), B);
    const f = F[k];
    return [k, v == null ? '—' : '`' + (typeof v === 'object' ? (v.valor != null ? v.valor : v.autor || JSON.stringify(v)) : v) + '`', f ? (f.url ? `[${f.fuente}](${f.url})` : f.fuente) : '—'];
  })])}

## Contradicciones entre fuentes

${contradicciones.length ? contradicciones.map(c => `- **${c.dato}**: ${c.valores.map(v => `${v.valor} (${v.url ? `[${v.fuente}](${v.url})` : v.fuente})`).join(' · ')}${c.nota ? `. ${c.nota}.` : ''}`).join('\n') : 'Ninguna entre las fuentes consultadas.'}

## Lo que falta, por orden

${faltan.join('\n')}

${pistas.some(p => !contadas.has(p)) ? `## Otras pistas

${pistas.filter(p => !contadas.has(p)).map(p => `- ${p.dato}: ${p.texto}`).join('\n')}

` : ''}## Lo que está en el borrador pero hay que mirar

${comprobar.length ? comprobar.map(c => `- [ ] ${c}`).join('\n') : '- [ ] Nada señalado.'}
- [ ] El DIR3 (\`${B.legal.dir3}\`) está calculado: míralo en la titularidad de su sede.
- [ ] \`nombre_corto\` es el nombre entero: acórtalo si en el pueblo se dice de otra forma.

## Fuentes consultadas

${tabla([['Qué', 'Dónde', 'Resultado'], ['---', '---', '---'], ...traido.map(t => [t.clave, t.url.length > 90 ? t.url.slice(0, 90) + '…' : t.url, t.ok ? 'bien' : 'no: ' + t.error])])}

Wikidata se consulta por SPARQL en el espejo QLever (Universidad de Friburgo), porque el robots.txt de query.wikidata.org no deja a los robots usar /sparql; cada dato enlaza a su elemento en wikidata.org.${wdModificado ? ` El elemento ${item} se editó por última vez el ${wdModificado.slice(0, 10)}.` : ''}

## Siguiente paso

1. Completa lo de arriba en \`municipio.json\` (con su fuente en \`DATOS.md\`, como Ribera) y quita \`"_borrador": true\`.
2. Copia la plantilla (RESKIN.md §1) y pon este \`municipio.json\`${fs.existsSync(path.join(SALIDA, 'marca')) ? ' y la carpeta `marca/`' : ''}.
3. \`node scripts/aplicar.mjs\`: si falta algo obligatorio, se niega y dice qué.
4. \`node scripts/verificar.mjs\`.
`;
fs.writeFileSync(path.join(SALIDA, `ALTA-${slug}.md`), md);
if (!DESDE) fs.writeFileSync(path.join(RESP, '_consulta.json'), JSON.stringify({ fecha: HOY, entrada, ine, item, urls: traido.map(t => t.url) }, null, 2) + '\n');
escribirBorrador();

const encontrados = Object.keys(F).filter(k => !k.startsWith('_')).length;
console.log(`✓ ${path.relative(process.cwd(), path.join(SALIDA, 'municipio.json'))}: ${nombre} (INE ${ine}${item ? ', ' + item : ''}), ${encontrados} datos con fuente` +
  `\n✓ ${path.relative(process.cwd(), path.join(SALIDA, `ALTA-${slug}.md`))}: ${faltan.length} cosas por rellenar, ${comprobar.length} por comprobar, ${contradicciones.length} contradicciones` +
  (mapa ? `\n${mapa.ok ? '✓ mapa del término: ' + mapa.salida.replace(/^✓\s*/, '') : '! mapa del término: ' + mapa.error}` : '') +
  (traido.some(t => t.error) ? `\n! sin respuesta: ${traido.filter(t => t.error).map(t => t.clave + ' (' + t.error + ')').join(', ')}` : ''));
