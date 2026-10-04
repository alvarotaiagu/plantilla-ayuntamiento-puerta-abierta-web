/* tablon.mjs — trae el tablón de anuncios de la sede y escribe contenido/tablon.json.

     node scripts/tablon.mjs                    lee la sede (si está autorizado)
     node scripts/tablon.mjs --desde f.html     lee una copia guardada del tablón (o una carpeta de copias)
     node scripts/tablon.mjs --probar           pruebas sin red (patrones y copia)
     node scripts/tablon.mjs --url <url>        otra dirección (lo usan las pruebas)

   Qué hace:
   - Gestiona no tiene RSS ni JSON ni CORS (comprobado el 02/10/2026): se lee el
     HTML de /board, que viene pintado desde el servidor. Son los 10 últimos;
     el resto se consulta en la sede.
   - La sede de la Diputación de Badajoz (sede.X.es) tampoco tiene RSS ni JSON
     público (03/10/2026): se lee la vista antigua del tablón, subsección a
     subsección. --desde admite una copia en HTML (vista antigua) o en JSON (la
     respuesta AJAX de la vista nueva), o una carpeta con varias.
   - Excluye lo que lleva datos personales (lib/tablon.mjs → motivoPersonal).
   - Conserva lo que haya puesto una persona: titulo_claro, tema, oculto y el plazo
     (plazo_inicio, plazo_fin, plazo_ejemplo).
   - Fallo silencioso: si la sede no responde o cambia el marcado, NO toca el
     tablon.json que hay y sale con código 0. La web sigue con lo último bueno.

   robots.txt: la sede de Ribera prohíbe a los robots todo salvo /info. Por eso
   la lectura automática solo se hace con `"tablon_autorizado": true` en
   municipio.json, que se pone cuando el Ayuntamiento (titular de la sede) lo
   autoriza por escrito. Mientras tanto, se trabaja con --desde. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearGestiona, parsearDiputacion, parsearDiputacionJSON, subseccionesDiputacion, motivoPersonal, fusionar, CASOS_PRUEBA } from './lib/tablon.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const destino = path.resolve(RAIZ, arg('--salida') || 'contenido/tablon.json');
const municipio = JSON.parse(fs.readFileSync(path.resolve(RAIZ, arg('--municipio') || 'municipio.json'), 'utf8'));
const sede = municipio.sede;

function leerPrevio() {
  try { return JSON.parse(fs.readFileSync(destino, 'utf8')); } catch (e) { return { entradas: [], excluidas: 0 }; }
}

/* La sede de la Diputación guarda el tablón entero (en Monesterio, 474 anuncios desde 2018):
   la web enseña los `tablon_max` más recientes (40 si no se dice) y cuenta las exclusiones
   de ese mismo periodo. Gestiona ya da solo los 10 últimos. */
const MAX = Number(municipio.tablon_max) || 40;
function procesar(crudas, origen) {
  const previo = leerPrevio();
  const vistas = new Set();
  const orden = crudas.filter(e => !vistas.has(e.url) && vistas.add(e.url))
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const excluidas = [];
  const validas = [];
  for (const e of orden) {
    const m = motivoPersonal(e);
    if (m) excluidas.push({ fecha: e.fecha, motivo: m }); else validas.push(e);
  }
  const quedan = validas.slice(0, MAX);
  const desde = quedan.length === validas.length ? '' : String(quedan[quedan.length - 1].fecha || '');
  const fuera = excluidas.filter(x => String(x.fecha || '') >= desde);
  excluidas.length = 0; excluidas.push(...fuera);
  const entradas = fusionar(quedan, previo.entradas);
  return {
    _leeme: 'GENERADO por scripts/tablon.mjs. Se puede editar a mano titulo_claro (título en lenguaje claro), tema (+ "tema_manual": true), oculto y el plazo (plazo_inicio, plazo_fin: AAAA-MM-DD; plazo_ejemplo: true si la fecha no consta en el anuncio). Lo demás se pisa al refrescar.',
    fuente: origen,
    actualizado: new Date().toISOString(),
    excluidas: excluidas.length,
    motivos_exclusion: [...new Set(excluidas.map(x => x.motivo))],
    entradas
  };
}

function escribir(datos) {
  /* v3c · automatico: si no ha cambiado nada más que la hora, no se toca. Así `actualizado` dice cuándo
     cambió el tablón y un cambio en tablon.json es «hay anuncios nuevos» para la tarea diaria */
  const sinHora = d => JSON.stringify({ ...d, actualizado: null });
  if (fs.existsSync(destino) && sinHora(leerPrevio()) === sinHora(datos)) {
    console.log(`· ${path.relative(RAIZ, destino)}: sin cambios (${datos.entradas.length} anuncios)`);
    return;
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(datos, null, 2) + '\n');
  console.log(`✓ ${path.relative(RAIZ, destino)}: ${datos.entradas.length} anuncios, ${datos.excluidas} fuera por datos personales`);
}

async function robotsPermite(base, ruta) {
  try {
    const r = await fetch(new URL('/robots.txt', base), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return true;
    const lineas = (await r.text()).split(/\r?\n/).map(l => l.replace(/#.*/, '').trim());
    let aplica = false; const reglas = [];
    for (const l of lineas) {
      const [k, ...v] = l.split(':'); const val = v.join(':').trim();
      if (/^user-agent$/i.test(k)) aplica = val === '*';
      else if (aplica && /^(dis)?allow$/i.test(k) && val) reglas.push([/^allow$/i.test(k), val]);
    }
    const casa = reglas.filter(([, p]) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')).test(ruta))
      .sort((a, b) => b[1].length - a[1].length);
    return casa.length ? casa[0][0] : true;
  } catch (e) { return true; }
}

/* Gestiona sirve UTF-8; la sede de la Diputación, ISO-8859-1 */
function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('latin1').decode(buf); }
}
const UA = 'WebMunicipal-Tablon/1.0 (lectura autorizada por el Ayuntamiento; una vez al día)';
const pausa = ms => new Promise(r => setTimeout(r, ms));
async function traer(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'es' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return decodificar(new Uint8Array(await r.arrayBuffer()));
}

/* Diputación: la portada del tablón y, desde ella, cada subsección (como mucho 40 páginas, una por segundo) */
const vistaDiputacion = (base, sub) => `${base}/portal/tablonVirtual.do?subseccion=${sub}&opc_id=175&pes_cod=9&ent_id=${sede.ent_id}&idioma=1`;
async function leerDiputacion(raiz) {
  const base = sede.base.replace(/\/$/, '');
  const pendientes = [raiz], vistas = new Set([raiz]), crudas = [];
  while (pendientes.length && vistas.size <= 40) {
    const url = pendientes.shift();
    const html = await traer(url);
    if (!/tablonVirtual|Lista2/.test(html)) throw new Error('no parece el tablón de la sede');
    crudas.push(...parsearDiputacion(html, base));
    for (const sub of subseccionesDiputacion(html)) {
      const u = vistaDiputacion(base, sub);
      if (!vistas.has(u)) { vistas.add(u); pendientes.push(u); }
    }
    await pausa(1100);
  }
  return crudas;
}

function deCopias(ruta) {
  const base = sede.base.replace(/\/$/, '');
  const archivos = fs.statSync(ruta).isDirectory()
    ? fs.readdirSync(ruta).filter(f => /\.(html?|json)$/i.test(f)).map(f => path.join(ruta, f)) : [ruta];
  const crudas = [];
  for (const f of archivos) {
    const texto = decodificar(new Uint8Array(fs.readFileSync(f)));
    if (sede.tipo === 'gestiona') crudas.push(...parsearGestiona(texto, base + '/board'));
    else if (/\.json$/i.test(f)) crudas.push(...parsearDiputacionJSON(JSON.parse(texto), base, sede.ent_id));
    else crudas.push(...parsearDiputacion(texto, base));
  }
  return crudas;
}

async function deLaSede() {
  if (!['gestiona', 'diputacion'].includes(sede.tipo)) {
    console.log('· Sede de tipo «' + sede.tipo + '»: no hay lector automático. Se queda el tablon.json actual.');
    return;
  }
  const dip = sede.tipo === 'diputacion';
  const ruta = dip ? '/portal/tablonVirtual.do' : '/board';
  const url = arg('--url') || (dip ? vistaDiputacion(sede.base.replace(/\/$/, ''), 'TABLONVIRTUAL') : sede.base.replace(/\/$/, '') + '/board');
  if (!arg('--url')) {
    if (!municipio.tablon_autorizado) {
      console.log('· Lectura automática sin autorizar («tablon_autorizado» en municipio.json). Se queda el tablon.json actual.');
      return;
    }
    if (!(await robotsPermite(sede.base, ruta))) console.log('· robots.txt no lo permite, pero el Ayuntamiento lo ha autorizado: se lee con identificación.');
  }
  try {
    const crudas = dip ? await leerDiputacion(url) : parsearGestiona(await traer(url), url);
    if (!crudas.length) throw new Error('el tablón vino vacío');
    escribir(procesar(crudas, url));
  } catch (e) {
    console.log('· La sede no responde o ha cambiado (' + e.message + '). Se queda el tablon.json actual.');
  }
}

function probar() {
  let fallos = 0;
  for (const [entrada, esperado] of CASOS_PRUEBA) {
    const m = motivoPersonal({ descripcion: '', procedimiento: '', categoria: '', ...entrada });
    const ok = esperado === null ? m === null : m !== null;
    if (!ok) { fallos++; console.log('✗ «' + entrada.titulo + '» → ' + m + ' (esperado: ' + esperado + ')'); }
  }
  const copia = path.join(RAIZ, 'pruebas/tablon/board-ribera.html');
  const crudas = parsearGestiona(fs.readFileSync(copia, 'utf8'), 'https://riberadelfresno.sedelectronica.es/board');
  const fuera = crudas.filter(e => motivoPersonal(e));
  if (crudas.length !== 10 || fuera.length !== 2) { fallos++; console.log(`✗ copia de Ribera: ${crudas.length} filas, ${fuera.length} fuera (esperado 10 y 2)`); }
  if (crudas.some(e => !e.fecha || !/preview-document/.test(e.url))) { fallos++; console.log('✗ copia de Ribera: filas sin fecha o sin enlace'); }
  /* sede de la Diputación: 8 filas reales de «Empleo Público» (Monesterio, 03/10/2026); solo la oferta entra */
  const dip = parsearDiputacion(fs.readFileSync(path.join(RAIZ, 'pruebas/tablon/board-diputacion-empleo.html'), 'latin1'), 'https://sede.ejemplo.es');
  const dipFuera = dip.filter(e => motivoPersonal(e));
  if (dip.length !== 8 || dipFuera.length !== 7) { fallos++; console.log(`✗ copia de la Diputación: ${dip.length} filas, ${dipFuera.length} fuera (esperado 8 y 7)`); }
  if (dip.some(e => !e.fecha || !/aDoc=F&documento=\d+&codVerif=/.test(e.url) || e.categoria !== 'Empleo Público')) { fallos++; console.log('✗ copia de la Diputación: filas sin fecha, enlace o subsección'); }
  console.log(fallos ? `✗ ${fallos} pruebas del tablón fallan` : `✓ tablón: ${CASOS_PRUEBA.length} patrones y las copias de Gestiona (10 filas, 2 fuera) y de la Diputación (8 filas, 7 fuera)`);
  process.exitCode = fallos ? 1 : 0;
}

if (args.includes('--probar')) probar();
else if (arg('--desde')) {
  const origen = sede.tipo === 'gestiona' ? sede.base.replace(/\/$/, '') + '/board' : sede.base.replace(/\/$/, '') + ' (tablón)';
  escribir(procesar(deCopias(path.resolve(arg('--desde'))), origen + ' (copia del ' + (arg('--fecha') || 'día') + ')'));
} else await deLaSede();
