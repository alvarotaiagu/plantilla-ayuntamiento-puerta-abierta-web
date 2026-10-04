/* aplicar.mjs — escribe la web municipal a partir de los datos.

     municipio.json            el municipio: contacto, horario, sede, corporación,
                               servicios, trámites, el pueblo
     marca/marca.json          colores (de scripts/marca-desde-escudo.py), letra, densidad
     marca/escudo-*.png        el escudo ya rasterizado (scripts/escudo.mjs)
     contenido/*.json          avisos, agenda, noticias y tablón (lo que cambia)
     media/ + creditos.json    fotos con su autor y licencia

   Genera las páginas (desde fuente/), css/marca.css, js/tramites-datos.js,
   favicon, manifest, assets/og.jpg e ics/<id>.ics (un calendario por evento).

     node scripts/aplicar.mjs                  todo
     node scripts/aplicar.mjs --sin-og         sin la imagen para compartir
     node scripts/aplicar.mjs --sin-capturas   sin og.jpg ni propuesta-portada.jpg (se quedan las que hay;
                                               sin Chromium: lo usa la tarea diaria de GitHub Actions)
     node scripts/aplicar.mjs --sin-hoja       sin pedir la hoja de Google: solo contenido/hoja.json
     node scripts/aplicar.mjs --hoja-url <base>   otra dirección en vez de docs.google.com (pruebas)
     node scripts/aplicar.mjs --fecha 2026-10-06T10:00:00+02:00   «hoy» fijo (pruebas)
     node scripts/aplicar.mjs --fijar-paleta b   la paleta B del mando pasa a ser la real
     node scripts/aplicar.mjs --forzar         escribe aunque falle algo (no lo uses)

   Sin dependencias de npm salvo Playwright para la og:image. Se niega a
   escribir si falta un dato obligatorio, si queda un [PENDIENTE] o si algún
   color no llega a AA (memoria «acento del cliente y contraste»). */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderizar } from './lib/plantilla.mjs';
import { derivarTokens, paletaGirada, contraste, nombreMatiz, oscurecerHasta, hexARgb } from './lib/color.mjs';
import { feedAtom, agendaIcs, organizacion, eventoLd, noticiaLd, migasLd, jsonLd, swCodigo, recursosDe, desfase } from './lib/servicio.mjs';   /* v3b · servicio */
import { leerHojaAlMontar } from './lib/hoja.mjs';   /* v3c · automatico */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const SIN_OG = args.includes('--sin-og') || args.includes('--sin-capturas');   /* v3c: --sin-capturas, el de la tarea diaria */
const FORZAR = args.includes('--forzar');
const SILENCIO = args.includes('--silencio');

const r = (...p) => path.join(RAIZ, ...p);
const existe = p => fs.existsSync(r(p));
const leer = p => fs.readFileSync(r(p), 'utf8');
const leerJSON = (p, defecto) => { if (defecto !== undefined && !existe(p)) return defecto; return JSON.parse(leer(p)); };
const log = (...a) => { if (!SILENCIO) console.log(...a); };
const errores = [], avisos = [];

/* ───────────────────────── datos ───────────────────────── */
const M = leerJSON('municipio.json');
const marcaConf = leerJSON('marca/marca.json');
const cortinaTipo = marcaConf.cortina || 'puerta';
if (!['puerta', 'escudo'].includes(cortinaTipo)) errores.push('marca.json: "cortina" es "puerta" (por defecto) o "escudo"');
const C = {
  avisos: leerJSON('contenido/avisos.json', { avisos: [] }).avisos || [],
  agenda: leerJSON('contenido/agenda.json', { eventos: [] }).eventos || [],
  noticias: leerJSON('contenido/noticias.json', { noticias: [] }).noticias || [],
  tablon: leerJSON('contenido/tablon.json', { entradas: [], excluidas: 0 })
};
const creditosMedia = leerJSON('media/creditos.json', {});
const letra = leerJSON('marca/_letra.json', { ajuste_nombre: 1.2, interlineado_titulos: 1.15 });

const valor = (o, ruta) => ruta.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const OBLIGATORIOS = ['slug', 'nombre', 'nombre_corto', 'provincia', 'contacto.direccion', 'contacto.cp', 'contacto.telefono',
  'contacto.correo', 'horario.texto', 'sede.tipo', 'sede.base', 'sede.instancia_general', 'legal.titular', 'legal.nif', 'escudo_credito.autor'];
for (const c of OBLIGATORIOS) { const v = valor(M, c); if (v === undefined || v === null || v === '') errores.push('municipio.json: falta «' + c + '»'); }
for (const [n, d] of [['municipio.json', M], ['contenido/avisos.json', C.avisos], ['contenido/agenda.json', C.agenda], ['contenido/noticias.json', C.noticias]]) {
  if (/\[PENDIENTE/i.test(JSON.stringify(d))) errores.push(n + ': hay un [PENDIENTE]. Lo no confirmado no se enseña: quítalo o márcalo con "ejemplo": true');
}
for (const f of ['marca/escudo-160.png', 'marca/escudo-480.png', 'marca/favicon-64.png'])
  if (!existe(f)) errores.push('Falta ' + f + ': ejecuta node scripts/escudo.mjs ruta/al/escudo.svg');
if (!existe('css/fuentes.css')) errores.push('Falta css/fuentes.css: ejecuta node scripts/fuentes.mjs');
/* v3c · alta: un municipio.json a medias (el borrador de scripts/nuevo-municipio.mjs, con null en lo
   que no se encontró) se para AQUÍ, con la lista entera de lo que falta, antes de que lo de abajo
   tropiece con un null. Ni con --forzar: sin esto no hay web que escribir */
for (const [c, que] of [['servicios', 'el listín: [{nombre, telefono, grupo…}]'], ['tramites.todos', 'el catálogo de trámites de su sede']])
  if (!Array.isArray(valor(M, c))) errores.push(`municipio.json: falta «${c}» (${que}; RESKIN.md §3)`);
if (M._borrador) avisos.push(`municipio.json sigue marcado como borrador ("_borrador": true): repasa ALTA-${M.slug || '<slug>'}.md y quita la marca`);
/* con --forzar solo se sigue si lo que falta no es la estructura (listín y catálogo): un correo ausente, p. ej., sí */
const faltaEstructura = errores.some(e => /^municipio\.json: falta «(servicios|tramites\.todos)»/.test(e));
if (errores.some(e => e.startsWith('municipio.json: falta')) && (!FORZAR || faltaEstructura)) {
  console.error(`\n✗ No se escribe nada: faltan datos obligatorios de municipio.json${M._borrador ? ` (es un borrador de nuevo-municipio.mjs: en ALTA-${M.slug || '<slug>'}.md está cada uno, con sus pistas)` : ''}. Arregla esto:\n  - ` + errores.join('\n  - ') + '\n');
  process.exit(1);
}

const TEL = /^(\d{3} \d{3} \d{3}|\d{3})$/;
const telefonos = [M.contacto.telefono, ...(M.servicios || []).map(s => s.telefono), ...(M.urgencias || []).map(s => s.telefono),
  ...((M.pueblo && M.pueblo.visitas) || []).map(v => v.telefono),
  ...((M.pueblo && M.pueblo.establecimientos) || []).flatMap(g => (g.items || []).map(e => e.telefono)),
  ...(M.instalaciones || []).flatMap(g => (g.items || []).map(i => i.telefono))].filter(Boolean);
for (const t of telefonos) if (!TEL.test(t)) errores.push('Teléfono «' + t + '»: escríbelo como «924 536 011»');
const HORA = /^\d{2}:\d{2}$/;
const tramosOk = tr => (tr || []).every(t => Array.isArray(t.dias) && t.dias.every(d => d >= 1 && d <= 7) && HORA.test(t.de) && HORA.test(t.a));
if (!tramosOk(M.horario.tramos)) errores.push('horario.tramos: {dias:[1..7] (1 = lunes), de:"09:00", a:"14:00"}');
for (const s of M.servicios || []) if (s.tramos && !tramosOk(s.tramos)) errores.push('servicios «' + s.nombre + '»: tramos mal escritos');

/* ───────────────────────── sede electrónica ─────────────────────────
   Dos familias: Gestiona (X.sedelectronica.es) y la de la Diputación de
   Badajoz (sede.X.es/portal/noEstatica.do?opc_id=…&ent_id=N). */
const sedeBase = String(M.sede.base || '').replace(/\/$/, '');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let S;
if (M.sede.tipo === 'gestiona') {
  if (!/^https:\/\/[a-z0-9-]+\.sedelectronica\.es$/.test(sedeBase)) errores.push('sede.base de Gestiona: https://<municipio>.sedelectronica.es');
  S = {
    inicio: sedeBase, tablon: sedeBase + '/board', transparencia: sedeBase + '/transparency',
    perfil: M.sede.perfil_contratante || sedeBase + '/contractor-profile-list',
    tramite: t => (t.id ? sedeBase + '/catalog/t/' + t.id : t.url),
    patron: new RegExp('^' + escRe(sedeBase) + '(/(catalog/t/[0-9a-f-]{36}|board|transparency|contractor-profile-list|preview-document/[0-9a-f-]{36}))?$')
  };
} else if (M.sede.tipo === 'diputacion') {
  const ent = M.sede.ent_id, opc = M.sede.opc || {};
  if (!ent || !opc.tablon) errores.push('sede de la Diputación: hacen falta sede.ent_id y sede.opc.tablon (y transparencia/perfil si los tiene)');
  const noEst = o => `${sedeBase}/portal/noEstatica.do?opc_id=${o}&ent_id=${ent}`;
  S = {
    /* muchas sedes de la Diputación no tienen portal de transparencia (Monesterio, 03/10/2026):
       sin `transparencia` ni `opc.transparencia`, el enlace no sale; igual con el perfil */
    inicio: sedeBase, tablon: noEst(opc.tablon),
    transparencia: M.sede.transparencia || (opc.transparencia ? noEst(opc.transparencia) : null),
    perfil: M.sede.perfil_contratante || (opc.perfil ? noEst(opc.perfil) : null),
    tramite: t => (t.opc ? noEst(t.opc) : t.url || (/^https?:/.test(t.id) ? t.id : noEst(t.id))),
    /* además de noEstatica.do, la ficha de un trámite (/sede/fichaInformativa.do?…) y los
       documentos del tablón (/portal/tablonVirtual.do?aDoc=F…) son enlaces fijos de la sede */
    patron: new RegExp('^' + escRe(sedeBase) + '(/(portal|sede)/[A-Za-z]+\\.do\\?[\\w=&%.-]+)?$')
  };
} else {
  errores.push('sede.tipo: "gestiona" | "diputacion"');
  S = { inicio: '', tablon: '', transparencia: '', perfil: '', tramite: () => '', patron: /^$/ };
}
const enSede = href => S.patron.test(href);
/* impresos que se descargan: el vecino tiene que saber qué va a abrir antes de pulsar */
const FORMATOS = { pdf: { etiqueta: 'PDF', sr: ', documento en PDF' }, doc: { etiqueta: 'Word', sr: ', documento de Word' } };
const srDe = (href, tipo) => (FORMATOS[tipo] ? FORMATOS[tipo].sr : enSede(href) ? ', se abre la sede electrónica' : ', se abre otra web');
const sede = {
  inicio: S.inicio, tablon: S.tablon, transparencia: S.transparencia, perfil: S.perfil,
  instancia: S.tramite({ id: M.sede.instancia_general }),
  quejas: M.sede.quejas ? S.tramite({ id: M.sede.quejas }) : null
};

/* ───────────────────────── color ───────────────────────── */
const fijar = (arg('--fijar-paleta') || '').toLowerCase();
const giros = marcaConf.giros_paleta || [100, -100];
if (fijar) {
  if (!['b', 'c'].includes(fijar)) { console.error('--fijar-paleta b | c'); process.exit(1); }
  const girada = paletaGirada(marcaConf.colores, giros[fijar === 'b' ? 0 : 1]);
  marcaConf.colores.marca = girada.marca;
  marcaConf.paleta_fijada = fijar + ' (' + new Date().toISOString().slice(0, 10) + ')';
  fs.writeFileSync(r('marca/marca.json'), JSON.stringify(marcaConf, null, 2) + '\n');
  log('✓ marca.json: la paleta ' + fijar.toUpperCase() + ' (' + girada.marca + ') pasa a ser la real');
}
const paletas = [['a', 0], ['b', giros[0]], ['c', giros[1]]].map(([clave, g]) => {
  const col = g ? paletaGirada(marcaConf.colores, g) : marcaConf.colores;
  return { clave, col, ...derivarTokens(col) };
});
for (const p of paletas) for (const f of p.informe) if (f.ratio < f.min) errores.push(`paleta ${p.clave}: ${f.texto} sobre ${f.fondo} = ${f.ratio}:1 (mínimo ${f.min})`);
const T = paletas[0].tokens;

/* colores de los grupos del pleno: como gráfico, ≥ 3:1 sobre la cal */
const grupos = ((M.corporacion && M.corporacion.grupos) || []).map(g => {
  let color = g.color;
  if (contraste(color, T['--papel']) < 3 || contraste(color, T['--superficie']) < 3) {
    color = oscurecerHasta(color, [T['--papel'], T['--superficie']], 3.1);
    avisos.push(`grupo ${g.sigla}: ${g.color} no llega a 3:1 sobre la cal; se usa ${color}`);
  }
  return { ...g, color };
});

const hexAlfa = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
function cssMarca() {
  const bloque = (sel, tk) => sel + ' {\n' + Object.entries(tk).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}\n';
  const deMarca = tk => Object.fromEntries(Object.entries(tk).filter(([k]) => /marca|foco/.test(k)));
  const base = {
    ...T,
    '--sombra-alta': '0 .75rem 2.5rem ' + hexAlfa(T['--tinta'], 0.18),
    '--velo': hexAlfa(T['--tinta'], 0.6),
    '--muestra-a': paletas[0].tokens['--marca'], '--muestra-b': paletas[1].tokens['--marca'], '--muestra-c': paletas[2].tokens['--marca'],
    '--f-titulo': `'${marcaConf.letra.titulares}', Georgia, 'Times New Roman', serif`,
    '--f-texto': `'${marcaConf.letra.texto}', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif`,
    '--interlineado-titulos': String(letra.interlineado_titulos),
    '--ajuste-nombre': String(letra.ajuste_nombre)
  };
  return '/* GENERADO por scripts/aplicar.mjs desde marca/marca.json. No editar a mano.\n' +
    '   Es el ÚNICO archivo con colores y fuentes. Paletas B y C: el mando de la reunión. */\n' +
    bloque(':root', base) + bloque(':root[data-paleta="b"]', deMarca(paletas[1].tokens)) + bloque(':root[data-paleta="c"]', deMarca(paletas[2].tokens));
}

/* ───────────────────────── vivo.js en Node ───────────────────────── */
const ctx = { window: {}, Intl, Date };
vm.runInNewContext(leer('js/vivo.js'), ctx);
const Vivo = ctx.window.Vivo;
const fechaBuild = arg('--fecha') ? new Date(arg('--fecha')) : new Date();
const ahora = Vivo.ahoraEn('Europe/Madrid', fechaBuild);

/* ───────────────────────── v3c · automatico: la hoja de Google, también al montar (F15) ─────────────────────────
   Con municipio.json → hoja.id, lo publicado en la hoja se fusiona aquí con contenido/*.json (la hoja
   manda por id; lo oculto oculta) ANTES de pintar: así entra en feed.xml, agenda.ics, ics/<id>.ics, la
   lista de avisos.html, y cada noticia de la hoja tiene su noticia-<id>.html. Se lee y se sanea con el
   mismo código que en el navegador (js/vivo.js). Si la hoja no contesta, lo último bueno
   (contenido/hoja.json). Sin hoja.id, nada cambia. Lo raro de la hoja se avisa; nunca para el montaje */
const hojaLeida = await leerHojaAlMontar({ hoja: M.hoja, Vivo, raiz: RAIZ, base: arg('--hoja-url'), sinRed: args.includes('--sin-hoja') });
if (hojaLeida) {
  const fusion = (lista, filas, agenda) => JSON.parse(JSON.stringify(Vivo.fusionarHoja(lista, filas, agenda)));
  C.avisos = fusion(C.avisos, hojaLeida.avisos);
  C.agenda = fusion(C.agenda, hojaLeida.agenda, true);
  C.noticias = fusion(C.noticias, hojaLeida.noticias);
  avisos.push(...hojaLeida.avisos_montaje);
  log('✓ hoja: ' + Object.entries(hojaLeida.origen).filter(([, o]) => o).map(([t, o]) => `${t} ${hojaLeida[t].filter(f => !f.oculto).length} (${o === 'hoja' ? 'leída ahora' : 'copia'})`).join(', ') +
    (hojaLeida.escrita ? ' · contenido/hoja.json al día' : ''));
}

/* ───────────────────────── utilidades ───────────────────────── */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaTexto = iso => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const telHref = t => { const d = String(t).replace(/\D/g, ''); return 'tel:' + (d.length === 9 ? '+34' + d : d); };
const slugDe = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normal = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el']);
const iniciales = n => { const w = n.split(/\s+/).filter(p => !CONECTORES.has(p.toLowerCase())); return (w[0][0] + (w.length >= 3 ? w[w.length - 2][0] : (w[1] || ' ')[0])).toUpperCase(); };
const jsonEnScript = o => JSON.stringify(o).replace(/</g, '\\u003c');

function medidasImagen(rel) {
  const b = fs.readFileSync(r(rel));
  if (b[0] === 0x89 && b[1] === 0x50) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1], largo = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + largo;
  }
  throw new Error('No se pudo medir ' + rel);
}
const usadas = new Map();
function foto(archivo, alt, para) {
  if (!archivo) return null;
  const rel = 'media/' + archivo + '.jpg';
  if (!existe(rel)) { avisos.push('Falta ' + rel + ' (' + para + '): se deja el hueco diseñado'); return null; }
  if (!existe('media/' + archivo + '-800.jpg')) errores.push('Falta media/' + archivo + '-800.jpg: pásala por scripts/fotos.py');
  const cr = creditosMedia[archivo];
  if (!cr) errores.push('media/creditos.json: falta el crédito de «' + archivo + '»');
  const { ancho, alto } = medidasImagen(rel);
  if (cr && !usadas.has(archivo)) usadas.set(archivo, { titulo: cr.titulo || para, autor: cr.autor, licencia: cr.licencia || null, url: cr.url || null, nota: cr.nota || null });
  const credito = cr ? 'Foto: ' + cr.autor + (cr.licencia ? ' · ' + cr.licencia : '') : null;
  return { archivo, ancho, alto, alt: alt || '', credito };
}

/* ───────────────────────── trámites ───────────────────────── */
const todos = (M.tramites.todos || []).filter(t => t.vigente !== false);
for (const t of todos) {
  /* en la sede de la Diputación, un trámite puede ir solo con su `opc` (opc_id del menú) */
  if (!t.id && !t.url && !(t.opc && M.sede.tipo === 'diputacion')) errores.push('trámite «' + t.nombre + '» sin id ni url' + (M.sede.tipo === 'diputacion' ? ' ni opc' : ''));
  if (t.id && M.sede.tipo === 'gestiona' && !/^[0-9a-f-]{36}$/.test(t.id)) errores.push('trámite «' + t.nombre + '»: el id de Gestiona es un uuid');
}
const conHref = t => { const href = S.tramite(t); return { ...t, href, sr: srDe(href, t.tipo) }; };
const lista = todos.map(conHref).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  .map(t => ({ ...t, formato: FORMATOS[t.tipo] ? FORMATOS[t.tipo].etiqueta : null, texto_busqueda: normal(t.nombre) }));
const tramitesSede = lista.filter(t => enSede(t.href)).length;
/* v3 · «Todos los trámites» por iniciales, con el índice A–Z fijo: las letras sin trámites salen
   apagadas y sin enlace. La Ñ solo si algún trámite empieza por ella */
const inicial = n => { const c = (n.match(/\p{L}/u) || ['#'])[0].toUpperCase(); return c === 'Ñ' ? 'Ñ' : c.normalize('NFD').replace(/[̀-ͯ]/g, ''); };
const letrasTramites = [];
for (const t of lista) {
  const l = inicial(t.nombre);
  let g = letrasTramites.find(x => x.letra === l);
  if (!g) letrasTramites.push(g = { letra: l, id: 'letra-' + (l === 'Ñ' ? 'enie' : l.toLowerCase()), items: [] });
  g.items.push(t);
}
const ABC = 'ABCDEFGHIJKLMN' + (letrasTramites.some(g => g.letra === 'Ñ') ? 'Ñ' : '') + 'OPQRSTUVWXYZ';
const indiceAZ = [...ABC].map(l => { const g = letrasTramites.find(x => x.letra === l); return { letra: l, id: 'letra-' + (l === 'Ñ' ? 'enie' : l.toLowerCase()), activa: !!g }; });
/* lo que no empieza por una letra del abecedario (un número) va al final, sin letra en el índice */
letrasTramites.sort((a, b) => (ABC.indexOf(a.letra) < 0) - (ABC.indexOf(b.letra) < 0) || ABC.indexOf(a.letra) - ABC.indexOf(b.letra));
const DESTINO = { pdf: 'Impreso en PDF', doc: 'Impreso en Word', documento: 'Documento en el tablón de la sede' };
/* iconos del sprite (fuente/_iconos.html): un atajo con un icono que no existe sería un hueco */
const ICONOS = new Set([...leer('fuente/_iconos.html').matchAll(/id="i-([\w-]+)"/g)].map(m => m[1]));
/* pictogramas de las cabeceras interiores (fuente/_pictogramas.html): van EN LÍNEA dentro del arco,
   cada trazo con pathLength="1" para que css/movimiento.css lo dibuje (dentro de un <use> no se puede) */
const PICTOS = Object.fromEntries([...leer('fuente/_pictogramas.html').matchAll(/<symbol id="p-([\w-]+)" viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/g)]
  .map(([, id, dentro]) => [id, dentro.trim().replace(/\s*\n\s*/g, '').replace(/<path /g, '<path pathLength="1" ')]));
const temasDatos = (M.tramites.temas || []).map(tm => ({ ...tm, tramites: tm.tramites.map(conHref) }));
/* temas en dos columnas que se apilan (sin huecos al abrir un desplegable): la primera mitad a
   la izquierda, así el orden de lectura y de tabulación baja por cada columna */
/* v3: con un número impar, el último va debajo a todo el ancho (sin hueco al final de una columna) */
/* ── v3b · F9. «Avisar de un problema» (incidencia.html): un formulario que prepara un correo al
   Ayuntamiento, sin servidor. Opcional: municipio.json → incidencias {correo, categorias}. Sin
   `correo` no hay página (y el enlace de «Por momentos» no sale). Las categorías, en texto o
   {nombre, ayuda}; sin ellas, las de siempre. El teléfono de la Policía Local sale de `servicios` */
const CATEGORIAS_INCIDENCIA = [['Alumbrado', 'Una farola apagada o rota'], ['Agua', 'Una fuga o una tapa de alcantarilla movida'],
  ['Limpieza', 'Basura en la calle o un contenedor roto'], ['Vía pública', 'Un bache, una acera rota, una señal caída'],
  ['Ruidos', 'Ruidos que molestan de forma repetida'], ['Otro', null]].map(([nombre, ayuda]) => ({ nombre, ayuda }));
let incidencias = null;
if (M.incidencias && M.incidencias.correo) {
  const I = M.incidencias;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(I.correo)) errores.push('incidencias.correo: «' + I.correo + '» no es un correo');
  const cats = ((I.categorias || []).length ? I.categorias : CATEGORIAS_INCIDENCIA).map(c => (typeof c === 'string' ? { nombre: c, ayuda: null } : { nombre: c.nombre, ayuda: c.ayuda || null }));
  if (cats.some(c => !c.nombre)) errores.push('incidencias.categorias: cada categoría lleva «nombre»');
  const usadasCat = new Set();
  const policia = (M.servicios || []).find(x => /polic[ií]a local/i.test(x.nombre) && x.telefono);
  const enCatalogo = lista.find(t => /incidencia/i.test(t.nombre) && enSede(t.href));
  incidencias = {
    correo: I.correo, asunto_url: encodeURIComponent('Aviso de un problema'),
    categorias: cats.map(c => { let id = 'cat-' + slugDe(c.nombre), n = 2; while (usadasCat.has(id)) id = 'cat-' + slugDe(c.nombre) + '-' + n++; usadasCat.add(id); return { ...c, id }; }),
    policia: policia ? { nombre: policia.nombre, telefono: policia.telefono, tel_href: telHref(policia.telefono) } : null,
    sede: enCatalogo ? { href: enCatalogo.href, nombre: enCatalogo.nombre, sr: enCatalogo.sr } : null
  };
}
/* ── v3c · transparencia (F24). «Escríbanos» (escribanos.html): consultas, sugerencias y felicitaciones
   por correo, sin servidor, como «Avisar de un problema». Al correo de `escribanos.correo` o, si no, de
   `contacto.correo`; sin correo, o con `"escribanos": false`, no hay página ni enlace. Las quejas formales
   y las solicitudes, al registro de la sede (lo dice la página, con sus enlaces) ── */
const TIPOS_ESCRIBANOS = [['Consulta', 'Una pregunta sobre un servicio, un horario o un trámite'],
  ['Sugerencia', 'Una idea para mejorar el pueblo o el Ayuntamiento'], ['Felicitación', 'Algo que se ha hecho bien y quiere que se sepa']];
let escribanos = null;
{
  const correo = M.escribanos === false ? null : (M.escribanos && M.escribanos.correo) || M.contacto.correo || null;
  if (correo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errores.push('escribanos: «' + correo + '» no es un correo');
    escribanos = { correo, asunto_url: encodeURIComponent('Mensaje desde la web'),
      tipos: TIPOS_ESCRIBANOS.map(([nombre, ayuda]) => ({ nombre, ayuda, id: 'tipo-' + slugDe(nombre) })) };
  }
}
const mitadTemas = Math.floor(temasDatos.length / 2);
const temaAncho = temasDatos.length % 2 ? temasDatos[temasDatos.length - 1] : null;
const tramites = {
  /* atajos: icono (opcional, del sprite) y la flecha en la esquina. El destino solo se ve si no es
     la sede (un impreso, un documento); «se abre la sede» lo dice el texto oculto */
  atajos: (M.tramites.atajos || []).map(conHref).map(t => {
    const icono = t.icono || 'documento';
    if (!ICONOS.has(icono)) errores.push('tramites.atajos «' + t.nombre + '»: no hay icono «' + icono + '» en fuente/_iconos.html');
    return { ...t, icono, destino: DESTINO[t.tipo] || null, sr: DESTINO[t.tipo] ? '' : t.sr };
  }),
  /* v3: atajos en una rejilla de columnas iguales: 4 por fila como mucho, repartidos sin dejar
     una fila casi vacía (5 → 3 + 2, 6 → 3 + 3, 7 → 4 + 3) */
  atajos_columnas: (n => (n <= 4 ? Math.max(n, 1) : Math.ceil(n / Math.ceil(n / 4))))((M.tramites.atajos || []).length),
  temas: temasDatos,
  temas_columnas: [...[temasDatos.slice(0, mitadTemas), temasDatos.slice(mitadTemas, mitadTemas * 2)].filter(c => c.length).map(temas => ({ temas, ancha: false })),
    ...(temaAncho ? [{ temas: [temaAncho], ancha: true }] : [])],
  /* v3b · F9: el momento con `incidencia: true` enlaza «Avisar de un problema» (si hay página) */
  momentos: (M.tramites.momentos || []).map(m => ({ ...m, incidencia: !!(m.incidencia && incidencias), pasos: m.pasos.map(p => (p.id || p.url ? conHref(p) : { ...p, href: null, sr: '' })) })),
  lista, total: lista.length, en_sede: tramitesSede, impresos: lista.filter(t => t.formato).length,
  letras: letrasTramites, az: indiceAZ
};
/* ── v3b · F10. Lectura fácil (facil.html): los trámites más pedidos explicados fácil, desde
   contenido/facil.json (opcional; sin él no hay página). Cada uno va con un atajo (`atajo`, el nombre
   exacto) o con «Avisar de un problema» (`pagina: "incidencia"`, solo si hay incidencias). Los
   marcadores {telefono}, {direccion} y {nombre} salen de municipio.json; la dirección, sin
   abreviaturas («C/» → «la calle»), y el teléfono, enlazado. Un pictograma por paso, de
   fuente/_pictos_facil.html ── */
const FACIL = leerJSON('contenido/facil.json', null);
const PICTOS_FACIL = new Set([...leer('fuente/_pictos_facil.html').matchAll(/id="f-([\w-]+)"/g)].map(m => m[1]));
const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const direccionFacil = String(M.contacto.direccion).replace(/^C\/\s*/i, 'la calle ').replace(/^Avda?\.\s*/i, 'la avenida ').replace(/^Pza?\.\s*/i, 'la plaza ')
  .replace(/\s*n\.?\s*º\s*/gi, ' ').replace(/,\s*(\d+)\b/, ', número $1');
/* una idea por línea: las frases de un mismo paso van cada una en su línea */
const lineasFacil = h => h.split(/(?<=[.!?:])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map(f => '<span class="facil__linea">' + f + '</span>').join(' ');
const textoFacil = t => escHtml(String(t).replace(/\{direccion\}/g, direccionFacil).replace(/\{nombre\}/g, M.nombre))
  .replace(/\{telefono\}/g, `<a href="${telHref(M.contacto.telefono)}">${M.contacto.telefono}</a>`);
let facil = null;
if (FACIL && (FACIL.tramites || []).length) {
  const pictoOk = (pk, donde) => { if (!PICTOS_FACIL.has(pk)) errores.push('contenido/facil.json «' + donde + '»: no hay pictograma «' + pk + '» en fuente/_pictos_facil.html'); return pk; };
  const items = FACIL.tramites.map(t => {
    let href = null, sr = '', clave = t.atajo || t.pagina;
    if (t.atajo) {
      const a = tramites.atajos.find(x => x.nombre === t.atajo);
      if (!a) { errores.push('contenido/facil.json: «' + t.atajo + '» no es un atajo de tramites.atajos'); return null; }
      href = a.href; sr = (a.sr || '') + (a.destino ? '. ' + a.destino : '');
    } else if (t.pagina === 'incidencia') {
      if (!incidencias) return null;
      href = 'incidencia.html';
    } else { errores.push('contenido/facil.json: cada trámite lleva «atajo» o «pagina»: "incidencia"'); return null; }
    if (!t.titulo || !(t.pasos || []).length) errores.push('contenido/facil.json «' + clave + '»: lleva «titulo» y «pasos»');
    return {
      id: 'facil-' + slugDe(clave), clave, titulo: t.titulo, picto: pictoOk(t.picto || 'documento', clave), href, sr, boton: t.boton || 'Ir al trámite',
      que_es: (t.que_es || []).map(x => ({ html: textoFacil(x) })),
      pasos: (t.pasos || []).map((x, i) => ({ n: i + 1, html: lineasFacil(textoFacil(x.texto)), picto: pictoOk(x.picto || 'documento', clave) })),
      sin_internet: (t.sin_internet || []).map(x => ({ html: lineasFacil(textoFacil(x.texto)), picto: pictoOk(x.picto || 'documento', clave) }))
    };
  }).filter(Boolean);
  if (items.length) facil = { items, n: items.length, nota: FACIL.nota || 'Texto adaptado a lectura fácil. Pendiente de validar con personas usuarias.' };
}
/* cada atajo (y el momento de la incidencia) enlaza su «Explicado fácil»; null explícito si no hay */
const facilDe = clave => { const it = facil && facil.items.find(x => x.clave === clave); return it ? 'facil.html#' + it.id : null; };
tramites.atajos.forEach(a => { a.facil = facilDe(a.nombre); });
tramites.momentos.forEach(m => { m.facil = m.incidencia ? facilDe('incidencia') : null; });

/* nombres en lenguaje claro para el buscador: los de atajos, temas y momentos */
const claros = new Map();
const anotar = (href, n) => { if (!href) return; if (!claros.has(href)) claros.set(href, new Set()); claros.get(href).add(n); };
tramites.atajos.forEach(t => anotar(t.href, t.nombre));
tramites.temas.forEach(tm => tm.tramites.forEach(t => anotar(t.href, t.nombre)));   /* sin el tema: «Casa, obras y campo» hacía que «obra» encontrara el agua */
tramites.momentos.forEach(m => m.pasos.forEach(p => anotar(p.href, p.texto)));
const buscarTramite = re => lista.find(t => re.test(t.nombre));

/* ───────────────────────── servicios y teléfonos ───────────────────────── */
const urgencias = (M.urgencias || []).map(u => ({ ...u, urgente: true }));
const serviciosVivos = { ayuntamiento: M.horario.tramos || [] };
const gruposListin = [];
for (const s of [...urgencias.map(u => ({ ...u, grupo: (M.servicios.find(x => /urgencia|seguridad/i.test(x.grupo)) || M.servicios[0] || {}).grupo || 'Urgencias' })), ...(M.servicios || [])]) {
  let g = gruposListin.find(x => x.grupo === s.grupo);
  if (!g) { g = { grupo: s.grupo || 'Otros', items: [] }; gruposListin.push(g); }
  const clave = s.tramos ? slugDe(s.nombre) : null;
  if (clave) serviciosVivos[clave] = s.tramos;
  /* un servicio sin teléfono (la recogida de basura, por ejemplo) sale con su detalle y sin enlace */
  if (!s.telefono && !(s.nota || s.horario)) errores.push('servicios «' + s.nombre + '»: sin teléfono tiene que llevar al menos nota u horario');
  g.items.push({ nombre: s.nombre, telefono: s.telefono || null, tel_href: s.telefono ? telHref(s.telefono) : null, urgente: !!s.urgente, clave,
    detalle: [s.nota, s.direccion, s.horario].filter(Boolean).join(' · ') || null, estado: '' });
}
/* el grupo de urgencias, primero, con el 112 arriba */
gruposListin.sort((a, b) => (b.items.some(i => i.urgente) ? 1 : 0) - (a.items.some(i => i.urgente) ? 1 : 0));
const todosTel = [...urgencias, ...(M.servicios || [])];
const listinCorto = (M.listin_corto || []).map(n => {
  const s = todosTel.find(x => x.nombre === n);
  if (!s) { errores.push('listin_corto: «' + n + '» no está en servicios ni en urgencias'); return null; }
  if (!s.telefono) { errores.push('listin_corto: «' + n + '» no tiene teléfono'); return null; }
  return { nombre: s.nombre, telefono: s.telefono, tel_href: telHref(s.telefono), urgente: !!s.urgente };
}).filter(Boolean);

/* ───────────────────────── corporación ───────────────────────── */
const miembros = (M.corporacion && M.corporacion.miembros) || [];
const alcaldeM = miembros.find(m => m.alcalde);
const alcalde = alcaldeM ? { nombre: alcaldeM.nombre, cargo: alcaldeM.cargo, grupo: alcaldeM.grupo } : null;
function hemiciclo() {
  if (!grupos.length || !miembros.length) return null;
  const asientos = [];
  grupos.forEach(g => miembros.filter(m => m.grupo === g.sigla).forEach(() => asientos.push(g)));
  const N = asientos.length;
  if (N !== miembros.length) errores.push('corporación: hay miembros de un grupo que no está en «grupos»');
  const filas = N <= 13 ? 1 : (N > 25 ? 3 : 2), R0 = filas === 1 ? 100 : 72, dR = 30, puntos = [];
  const radios = Array.from({ length: filas }, (_, f) => R0 + f * dR), suma = radios.reduce((a, b) => a + b, 0);
  let resto = N;
  radios.forEach((rad, f) => {
    const n = f === filas - 1 ? resto : Math.round(N * rad / suma); resto -= n;
    for (let i = 0; i < n; i++) { const a = Math.PI * (1 - (i + 0.5) / n); puntos.push({ x: 150 + rad * Math.cos(a), y: 150 - rad * Math.sin(a), a }); }
  });
  puntos.sort((p, q) => q.a - p.a);
  const rAs = filas === 1 ? 13 : 10;
  const trama = g => {
    const fondo = `<rect width="8" height="8" fill="${g.color}"/>`;
    const marca = { liso: '', rayas: '<path d="M-1 1l2-2M0 8l8-8M7 9l2-2" stroke="#fff" stroke-width="1.6"/>',
      puntos: '<circle cx="4" cy="4" r="1.5" fill="#fff"/>', cuadros: '<path d="M0 4h8M4 0v8" stroke="#fff" stroke-width="1.3"/>' }[g.trama || 'liso'] || '';
    return `<pattern id="trama-${slugDe(g.sigla)}" width="8" height="8" patternUnits="userSpaceOnUse">${fondo}${marca}</pattern>`;
  };
  const gob = grupos.filter(g => g.gobierno), opo = grupos.filter(g => !g.gobierno);
  const cuenta = g => miembros.filter(m => m.grupo === g.sigla).length;
  const enumerar = gs => gs.map(g => `${g.sigla} (${cuenta(g)})`).join(', ').replace(/, ([^,]*)$/, ' y $1');
  const descripcion = `Pleno de ${N} concejales. ` + (gob.length ? `Gobierno: ${enumerar(gob)}. ` : '') + (opo.length ? `Oposición: ${enumerar(opo)}.` : '');
  const svg = `<svg class="hemiciclo" viewBox="28 28 244 140" data-centro="150 150" role="img" aria-labelledby="hemiciclo-t hemiciclo-d"><title id="hemiciclo-t">Reparto del pleno</title><desc id="hemiciclo-d">${descripcion}</desc>` +
    `<defs>${grupos.map(trama).join('')}</defs>` +
    /* data-grupo: js/identidad.js resalta los escaños de un grupo al pasar por su leyenda */
    puntos.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${rAs}" fill="url(#trama-${slugDe(asientos[i].sigla)})" stroke="${asientos[i].color}" stroke-width="1.5" data-grupo="${slugDe(asientos[i].sigla)}"/>`).join('') +
    `<text class="hemiciclo__total" x="150" y="138" text-anchor="middle" font-size="40">${N}</text><text class="hemiciclo__rotulo" x="150" y="158" text-anchor="middle" font-size="12">concejales</text></svg>`;
  return {
    svg, descripcion,
    grupos: grupos.map(g => ({
      sigla: g.sigla, clave: slugDe(g.sigla), nombre: g.nombre, n: cuenta(g), concejales: cuenta(g) === 1 ? 'concejal' : 'concejales',
      papel: g.gobierno ? 'gobierno' : 'oposición',
      muestra: `<rect x="1" y="1" width="26" height="26" rx="13" fill="url(#trama-${slugDe(g.sigla)})" stroke="${g.color}" stroke-width="1.5"/>`,
      miembros: miembros.filter(m => m.grupo === g.sigla).map(m => ({ nombre: m.nombre, cargo: m.cargo }))
    }))
  };
}
const pleno = hemiciclo();

/* normativa y documentos: lo que su web vieja tenía colgado (ordenanzas, actas, decretos) y no
   es un trámite. Cada grupo es un desplegable; vacío, la sección no sale */
const documentos = (M.documentos || []).map(g => {
  if (!g.grupo || !(g.items || []).length) errores.push('documentos: cada grupo lleva «grupo» e «items»');
  const items = (g.items || []).map(d => {
    if (!d.titulo || !d.url) errores.push('documentos «' + g.grupo + '»: cada documento lleva «titulo» y «url»');
    return { titulo: d.titulo, href: d.url, fecha: d.fecha || null, formato: FORMATOS[d.tipo] ? FORMATOS[d.tipo].etiqueta : null, sr: srDe(d.url, d.tipo) };
  });
  return { grupo: g.grupo, nota: g.nota || null, items, cuenta: items.length + (items.length === 1 ? ' documento' : ' documentos') };
});

/* instalaciones municipales: polideportivo, piscina, parques, mercado, alojamiento municipal…
   En grupos; cada dato solo sale si consta. Vacío, la sección no sale */
const instalaciones = (M.instalaciones || []).map(g => {
  if (!g.grupo || !(g.items || []).length) errores.push('instalaciones: cada grupo lleva «grupo» e «items»');
  const items = (g.items || []).map(i => {
    if (!i.nombre) errores.push('instalaciones «' + g.grupo + '»: cada instalación lleva «nombre»');
    if (i.url && !i.url_texto) errores.push('instalaciones «' + i.nombre + '»: con «url» va «url_texto» (qué abre el enlace)');
    const datos = [['Dirección', i.direccion], ['Horario', i.horario], ['Precio', i.precio]].filter(([, x]) => x).map(([dt, dd]) => ({ dt, dd }));
    return { nombre: i.nombre, texto: i.texto || null, datos, telefono: i.telefono || null, tel_href: i.telefono ? telHref(i.telefono) : null,
      nota: i.nota || null, url: i.url || null, url_texto: i.url_texto || null, sr: i.url ? srDe(i.url) : '' };
  });
  return { grupo: g.grupo, id: 'instalaciones-' + slugDe(g.grupo), items };
});
const quien = (M.quien || []).map(q => ({ ...q, iniciales: iniciales(q.nombre) }));
/* «¿Quién se ocupa de qué?» del Ayuntamiento: el asunto en lenguaje claro (quien) con la delegación
   oficial y el grupo de la corporación. Antes eran dos secciones («Concejalías» repetía a las mismas
   personas); las delegaciones que no estén en `quien` entran al final, con la delegación como asunto.
   Los campos opcionales van a null: si faltan, el Mustache los busca hacia fuera */
const muestraDe = sigla => ((pleno && pleno.grupos.find(g => g.sigla === sigla)) || {}).muestra || null;
const quienAyto = [
  ...(M.quien || []).map(q => {
    const m = miembros.find(x => x.nombre === q.nombre);
    return { tema: q.tema, nombre: q.nombre, iniciales: iniciales(q.nombre), cargo: q.cargo || (m && m.cargo) || '',
      delegacion: (m && m.delegacion) || null, grupo: (m && m.grupo) || null, muestra: m ? muestraDe(m.grupo) : null };
  }),
  ...miembros.filter(m => m.delegacion && !(M.quien || []).some(q => q.nombre === m.nombre)).map(m => ({
    tema: m.delegacion, nombre: m.nombre, iniciales: iniciales(m.nombre), cargo: m.cargo || '', delegacion: null, grupo: m.grupo || null, muestra: muestraDe(m.grupo)
  }))
];

/* ───────────────────────── contenido ───────────────────────── */
const avisosOrden = C.avisos.filter(a => !a.oculto).slice().sort((a, b) => b.fecha.localeCompare(a.fecha))
  .map(a => ({ ...a, fecha_texto: fechaTexto(a.fecha), urgente: Vivo.gravedad(a) === 'urgente', gravedad: Vivo.gravedad(a), programado: Vivo.gravedad(a) === 'programado', ejemplo: !!a.ejemplo, enlace: a.enlace || null,
    plazo_inicio: a.plazo_inicio || null, plazo_fin: a.plazo_fin || null, plazo_html: null,
    es_empleo: Vivo.esEmpleo(a.tema), ...(Vivo.esEmpleo(a.tema) ? { tema: 'Empleo' } : {}) }));   /* v3c · transparencia: el chip con el maletín */
/* gravedad de los avisos: «urgente» (rojo), «programado» o «informativo» (ámbar; el de por defecto).
   En la franja de arriba, en móvil, el título tiene que caber en dos líneas: si es largo, `titulo_corto` */
for (const a of C.avisos) {
  if (a.gravedad != null && !['urgente', 'programado', 'informativo'].includes(String(a.gravedad).toLowerCase().trim())) errores.push('avisos «' + a.id + '»: «gravedad» es "urgente", "programado" o "informativo"');
  if (a.caduca && Vivo.gravedad(a) !== 'informativo' && !a.titulo_corto && String(a.titulo).length > 70) avisos.push('aviso «' + a.id + '»: el título pasa de 70 caracteres; en la franja del móvil no cabe en dos líneas. Ponle «titulo_corto»');
}
const PALABRAS_MINUTO = 200;
const contarPalabras = t => String(t).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
const noticias = C.noticias.filter(n => !n.oculto).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(n => {
  const f = n.imagen ? foto(n.imagen, n.imagen_alt, 'noticia: ' + n.titulo) : null;
  /* v3 · sin foto, la tarjeta lleva la fecha grande en un arco (dibujo: la fecha la lee el <time>) */
  const [fa, fm, fd] = n.fecha.split('-').map(Number);
  /* v3b · M10: el tiempo de lectura del cuerpo, a 200 palabras por minuto (1 min como poco) */
  const palabras = contarPalabras((n.cuerpo || []).join(' '));
  return { ...n, fecha_texto: fechaTexto(n.fecha), palabras, lectura_min: Math.max(1, Math.round(palabras / PALABRAS_MINUTO)), fecha_dia: fd, fecha_mes: MESES[fm - 1].slice(0, 3), fecha_anio: fa,
    imagen: f ? n.imagen : null, imagen_ancho: f ? f.ancho : null, imagen_alto: f ? f.alto : null,
    imagen_alt: n.imagen_alt || '', resumen: n.resumen || null, ejemplo: !!n.ejemplo, fecha_aproximada: !!n.fecha_aproximada, fuente: n.fuente || null, relacionado: n.relacionado || null };
});
const fiestas = ((M.pueblo && M.pueblo.fiestas) || []).map(f => ({ mes: f.mes, nombre: f.nombre, cuando: f.cuando, mayor: !!f.mayor, fecha_fija: f.fecha_fija || null }));
/* la agenda sale también de las fiestas de fecha fija: no hay que repetirlas */
const agendaFiestas = [];
for (const f of fiestas.filter(x => x.fecha_fija)) for (const anio of [ahora.anio, ahora.anio + 1]) {
  /* «15 de mayo» como lugar repetiría la fecha: solo se enseña si dice algo más */
  const soloFecha = /^\d{1,2}( y \d{1,2})? de [a-záéíóú]+$/i.test(f.cuando.trim());
  agendaFiestas.push({ id: 'fiesta-' + slugDe(f.nombre) + '-' + anio, fecha: anio + '-' + f.fecha_fija, titulo: f.nombre, lugar: soloFecha ? null : f.cuando, origen: 'fiesta' });
}
/* ── lo nuevo del panel «Hoy»: farmacia de guardia, el tiempo, plenos, recogida y canal ── */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/* plenos: entran en la agenda como eventos de tipo «pleno» (y con su .ics) */
const plenosAgenda = (M.plenos || []).map(p => {
  if (!p.fecha || !ISO.test(p.fecha)) errores.push('plenos: cada pleno lleva «fecha» AAAA-MM-DD');
  if (p.hora && !HORA.test(p.hora)) errores.push('plenos ' + p.fecha + ': «hora» como "20:00"');
  const tipo = p.tipo ? String(p.tipo).toLowerCase() : null;
  return { id: 'pleno-' + p.fecha + (p.id ? '-' + slugDe(p.id) : ''), fecha: p.fecha, hora: p.hora || null, titulo: p.titulo || ('Pleno' + (tipo ? ' ' + tipo : '')),
    lugar: p.lugar || null, nota: p.nota || null, ejemplo: !!p.ejemplo, oculto: !!p.oculto, tipo: 'pleno',
    convocatoria: p.convocatoria || null, convocatoria_sr: p.convocatoria ? srDe(p.convocatoria) : null,
    grabacion: p.grabacion || null, grabacion_sr: p.grabacion ? srDe(p.grabacion) : null };
});
/* farmacias: lista + guardias por fechas y/o rotación + fuente oficial */
let farmacias = null;
if (M.farmacias && ((M.farmacias.lista || []).length || (M.farmacias.oficial && M.farmacias.oficial.url))) {
  const F = M.farmacias, ids = new Set((F.lista || []).map(f => f.id));
  for (const f of F.lista || []) {
    if (!f.id || !f.nombre) errores.push('farmacias.lista: cada farmacia lleva «id» y «nombre»');
    if (f.telefono && !TEL.test(f.telefono)) errores.push('Teléfono «' + f.telefono + '» (farmacia ' + f.nombre + '): escríbelo como «924 536 011»');
  }
  if (F.cambio && !HORA.test(F.cambio)) errores.push('farmacias.cambio: la hora del cambio de guardia como "09:30"');
  for (const g of F.guardias || []) {
    if (!ISO.test(g.desde || '') || (g.hasta && !ISO.test(g.hasta))) errores.push('farmacias.guardias: «desde» (y «hasta») como AAAA-MM-DD');
    if (!ids.has(g.farmacia) && !(F.lista || []).some(f => normal(f.nombre) === normal(String(g.farmacia || '')))) errores.push('farmacias.guardias: «' + g.farmacia + '» no está en farmacias.lista');
  }
  if (F.rotacion) {
    if (!ISO.test(F.rotacion.inicio || '') || !(F.rotacion.orden || []).length) errores.push('farmacias.rotacion: {inicio: "AAAA-MM-DD", dias: 7, orden: [ids]}');
    for (const id of F.rotacion.orden || []) if (!ids.has(id)) errores.push('farmacias.rotacion: «' + id + '» no está en farmacias.lista');
  }
  if (F.oficial && F.oficial.url && !F.oficial.nombre) errores.push('farmacias.oficial: con «url» va «nombre» (de quién es la web)');
  farmacias = {
    lista: (F.lista || []).map(f => ({ id: f.id, nombre: f.nombre, direccion: f.direccion || null, localidad: f.localidad || null, telefono: f.telefono || null })),
    cambio: F.cambio || '09:30', guardias: (F.guardias || []).map(g => ({ desde: g.desde, hasta: g.hasta || null, farmacia: g.farmacia })),
    rotacion: F.rotacion || null, oficial: F.oficial && F.oficial.url ? { nombre: F.oficial.nombre, url: F.oficial.url } : null, ejemplo: !!F.ejemplo
  };
}
/* el tiempo: el enlace de AEMET sale del código INE, y de ningún otro sitio. El código de
   municipio del DIR3 (L01 + INE + dígito de control) lo confirma: en otro reskin el INE
   estaba mal y AEMET enseñaba otro pueblo */
let tiempo = null;
if (M.ine != null && M.ine !== '') {
  const ine = String(M.ine);
  if (!/^\d{5}$/.test(ine)) errores.push('ine: el código INE del municipio, 5 cifras («06113»), sin el dígito de control');
  const dir3 = /^L01(\d{5})\d$/.exec((M.legal && M.legal.dir3) || '');
  if (dir3 && dir3[1] !== ine) errores.push(`ine «${ine}» no casa con legal.dir3 «${M.legal.dir3}» (que dice ${dir3[1]}): AEMET enseñaría otro pueblo`);
  tiempo = { url: `https://www.aemet.es/es/eltiempo/prediccion/municipios/${slugDe(M.nombre)}-id${ine}`, lugar: M.nombre };
}
/* recogida de enseres, basura, poda…: días de la semana (1 = lunes) o fechas sueltas */
const recogida = (M.recogida || []).map(x => {
  if (!x.id || !x.nombre) errores.push('recogida: cada una lleva «id» y «nombre»');
  if (!(x.dias || []).length && !(x.fechas || []).length && !x.como) errores.push('recogida «' + x.nombre + '»: hace falta «dias», «fechas» o al menos «como»');
  if ((x.dias || []).some(d => d < 1 || d > 7)) errores.push('recogida «' + x.nombre + '»: «dias» del 1 (lunes) al 7');
  if ((x.fechas || []).some(f => !ISO.test(f))) errores.push('recogida «' + x.nombre + '»: «fechas» como AAAA-MM-DD');
  if (x.telefono && !TEL.test(x.telefono)) errores.push('Teléfono «' + x.telefono + '» (recogida ' + x.nombre + '): escríbelo como «924 536 011»');
  const tramite = x.tramite ? (typeof x.tramite === 'object' ? S.tramite(x.tramite) : x.tramite) : null;
  return { id: x.id, nombre: x.nombre, dias: x.dias || [], fechas: x.fechas || [], hora: x.hora || null, como: x.como || null, telefono: x.telefono || null,
    tramite, tramite_texto: x.tramite_texto || null, tramite_sr: tramite ? srDe(tramite) : null, ejemplo: !!x.ejemplo };
});
const canalAvisos = M.canal_avisos && M.canal_avisos.url ? { nombre: M.canal_avisos.nombre, url: M.canal_avisos.url, texto: M.canal_avisos.texto || null,
  pasos: (M.canal_avisos.pasos || []).length ? M.canal_avisos.pasos : null, otros: M.canal_avisos.otros || [] } : null;
if (canalAvisos && !canalAvisos.nombre) errores.push('canal_avisos: con «url» va «nombre»');
/* v3b · plazos (avisos y anuncios del tablón): `plazo_inicio` y `plazo_fin` opcionales, AAAA-MM-DD.
   Solo se ponen si la fuente da la fecha; si no consta, con `plazo_ejemplo: true` (sale «Ejemplo»).
   Van a null explícito si faltan: el Mustache y vivo.js no los buscan fuera */
const conPlazo = x => {
  const ini = x.plazo_inicio || null, fin = x.plazo_fin || null, quien = x.id || x.expediente || x.titulo;
  if ((ini && !ISO.test(ini)) || (fin && !ISO.test(fin))) errores.push('plazo de «' + quien + '»: «plazo_inicio» y «plazo_fin» como AAAA-MM-DD');
  if (ini && fin && ini > fin) errores.push('plazo de «' + quien + '»: «plazo_inicio» va antes que «plazo_fin»');
  if (x.plazo_ejemplo && !ini && !fin) errores.push('plazo de «' + quien + '»: «plazo_ejemplo» sin plazo');
  return { plazo_inicio: ini, plazo_fin: fin, plazo_ejemplo: !!(x.plazo_ejemplo && (ini || fin)) };
};
/* cada evento con su .ics (lo escribe más abajo; los de la hoja los genera el navegador) */
const conIcs = e => ({ ...e, ics: 'ics/' + Vivo.archivoIcs(e) });

const D = {
  slug: marcaConf.slug, nombre: M.nombre, nombre_corto: M.nombre_corto, zona: 'Europe/Madrid',
  horario: { texto: M.horario.texto, tramos: M.horario.tramos || [], ejemplo: !!M.horario.ejemplo },
  /* v3c · F16: con texto y enlace, la lista de avisos.html se pinta desde aquí (también lo que llega de la hoja) */
  avisos: C.avisos.map(a => ({ id: a.id, fecha: a.fecha, tema: a.tema, titulo: a.titulo, texto: a.texto || null, enlace: a.enlace || null, titulo_corto: a.titulo_corto || null, urgente: !!a.urgente, gravedad: a.gravedad ? String(a.gravedad).toLowerCase().trim() : null, caduca: a.caduca || null, ejemplo: !!a.ejemplo, oculto: !!a.oculto, ...conPlazo(a) })),
  agenda: [...C.agenda.map(e => ({ id: e.id, fecha: e.fecha, hora: e.hora || null, hora_fin: e.hora_fin || null, titulo: e.titulo, lugar: e.lugar || null, nota: e.nota || null, ejemplo: !!e.ejemplo, oculto: !!e.oculto,
    tipo: e.tipo ? String(e.tipo).toLowerCase() : null, convocatoria: e.convocatoria || null, convocatoria_sr: e.convocatoria ? srDe(e.convocatoria) : null,
    grabacion: e.grabacion || null, grabacion_sr: e.grabacion ? srDe(e.grabacion) : null })), ...agendaFiestas, ...plenosAgenda].map(conIcs),
  farmacias, tiempo, recogida, canal: canalAvisos ? { nombre: canalAvisos.nombre, url: canalAvisos.url, pasos: canalAvisos.pasos } : null, web: M.url ? M.url.replace(/\/?$/, '/') : null,
  noticias: noticias.map(n => ({ id: n.id, fecha: n.fecha, titulo: n.titulo, resumen: n.resumen, imagen: n.imagen, imagen_alt: n.imagen_alt, ejemplo: n.ejemplo })),
  tablon: { actualizado: C.tablon.actualizado || null, entradas: (C.tablon.entradas || []).map(e => ({ fecha: e.fecha, tema: e.tema, titulo: e.titulo, titulo_claro: e.titulo_claro || '', url: e.url, oculto: !!e.oculto, expediente: e.expediente || null, ...conPlazo(e) })) },
  fiestas, servicios: serviciosVivos, tramites_sede: tramitesSede,
  rutas: { tramites: 'tramites.html', avisos: 'avisos.html', agenda: 'agenda.html', noticia: 'noticia-{id}.html', media: 'media/' },
  hoja: M.hoja && M.hoja.id ? M.hoja : null,
  tablon_json: 'contenido/tablon.json'
};
/* «Lo que viene» en la portada: cuántos días por delante (60 si no se dice) */
D.horizonte_dias = Number(M.horizonte_agenda_dias) > 0 ? Number(M.horizonte_agenda_dias) : 60;
for (const e of D.tablon.entradas) if (!enSede(e.url)) errores.push('tablon.json: enlace fuera de la sede: ' + e.url);
const pintar = (b, op) => Vivo.pintar(b, D, ahora, op);
const vivo = {
  franja: pintar('franja'), hoy: pintar('hoy'), tablon_portada: pintar('tablon', { limite: 6 }), tablon_todo: pintar('tablon'),
  linea: pintar('linea'), anio: pintar('anio'), lado: pintar('lado'), agenda: pintar('agenda'), estado_ayto: pintar('servicio', { clave: 'ayuntamiento' }),
  plazos: pintar('plazos'),
  avisos: pintar('avisos')   /* v3c · F16 */
};
/* v3b · el chip del plazo de cada aviso en «Avisos» (lo repinta vivo.js con la fecha real) */
for (const a of avisosOrden) a.plazo_html = a.plazo_inicio || a.plazo_fin ? pintar('plazo', { clave: a.id }) : null;
gruposListin.forEach(g => g.items.forEach(i => { if (i.clave) i.estado = pintar('servicio', { clave: i.clave }); }));

/* ───────────────────────── v3c · guia: «Publicar en la web» (publicar.html) ─────────────────────────
   La página del personal del Ayuntamiento. Los botones van a los formularios de Google de
   municipio.json → hoja.formularios {avisos, agenda, noticias} (los crea plantillas-hoja/crear-hoja.gs).
   Sin URL, el botón no se inventa: la página dice que se activa al montar la hoja. Las URLs de los
   formularios solo van a publicar.html: se quitan de los datos vivos que lleva cada página */
const FORMS = (M.hoja && M.hoja.formularios) || {};
const FORMULARIOS = [
  ['avisos', 'Publicar un aviso', 'Un corte de agua, una obra, una alerta, un plazo que se abre'],
  ['agenda', 'Publicar un acto en la agenda', 'Un concierto, una feria, una charla, un pleno'],
  ['noticias', 'Publicar una noticia', 'Lo que ha pasado en el pueblo, contado en unas líneas']
].map(([clave, titulo, texto]) => {
  const u = FORMS[clave] || null;
  if (u && !/^https:\/\/\S+$/.test(u)) errores.push(`hoja.formularios.${clave}: la dirección del formulario, entera y con https://`);
  else if (u && !/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(u)) avisos.push(`hoja.formularios.${clave}: no parece un formulario de Google (${u})`);
  return { clave, titulo, texto, url: u };
});
for (const k of Object.keys(FORMS)) if (!FORMULARIOS.some(f => f.clave === k)) errores.push(`hoja.formularios: «${k}» no es un formulario (avisos, agenda, noticias)`);
const hojaMontada = !!(M.hoja && M.hoja.id);
if (FORMULARIOS.some(f => f.url) && !hojaMontada) avisos.push('hoja.formularios sin hoja.id: lo que se mande por los formularios no saldrá en la web');
if (D.hoja && D.hoja.formularios) D.hoja = { ...D.hoja, formularios: undefined };
const publicar = {
  formularios: FORMULARIOS, hay_formularios: FORMULARIOS.some(f => f.url), hoja_montada: hojaMontada,
  /* lo que llega solo a la web: el tablón de la sede solo con la autorización (README, «El tablón y el robots.txt») */
  tablon_solo: !!M.tablon_autorizado
};

/* ───────────────────────── el pueblo y las fotos ───────────────────────── */
const P = M.pueblo || {};
/* la foto del arco: una (fotos.hero) o varias (fotos.hero_fotos) que se turnan al azar en cada
   visita. La primera de la lista es la que sale sin JavaScript y la de la imagen para compartir */
const P0 = M.pueblo || {};
const listaHero = ((M.fotos && Array.isArray(M.fotos.hero_fotos) && M.fotos.hero_fotos.length) ? M.fotos.hero_fotos : (M.fotos && M.fotos.hero ? [M.fotos.hero] : []))
  .map((h, i) => {
    if (!h || !h.archivo) { errores.push('fotos.hero_fotos: cada foto lleva «archivo», «alt» y «posicion»'); return null; }
    if (!h.alt) avisos.push('fotos.hero' + (M.fotos.hero_fotos ? '_fotos[' + i + ']' : '') + ' «' + h.archivo + '»: falta «alt» (la foto de la portada no es decorativa)');
    const f = foto(h.archivo, h.alt, 'portada');
    /* v3b · el pie de la foto: el lugar de «El pueblo» que sale en ella (el que tiene la misma foto,
       o el que diga `lugar`), enlazado a su sitio en pueblo.html; si no es un lugar, `pie` en texto;
       `lugar: null` lo quita. Sin nada, no hay pie */
    const lugar = h.lugar === null ? null : ((P0.lugares || []).find(l => (h.lugar ? l.nombre === h.lugar : l.foto === h.archivo)) || null);
    if (h.lugar && !lugar) errores.push('fotos.hero_fotos «' + h.archivo + '»: «lugar» «' + h.lugar + '» no está en pueblo.lugares');
    const pie = lugar ? lugar.nombre : (h.pie || null), pie_href = lugar ? 'pueblo.html#lugar-' + slugDe(lugar.nombre) : null;
    return f ? { ...f, posicion: h.posicion || '50% 50%', pie, pie_href } : null;
  }).filter(Boolean);
const heroFoto = listaHero[0] || null;
const HERO_SIZES = '(min-width: 56em) 30vw, 92vw';
/* para el <head> (se elige y se precarga antes del primer pintado) y el <figure> (la pinta) */
const heroVarias = listaHero.length > 1 ? jsonEnScript(listaHero.map(f => ({ src: 'media/' + f.archivo + '.jpg', srcset: 'media/' + f.archivo + '-800.jpg 800w, media/' + f.archivo + '.jpg ' + f.ancho + 'w',
  ancho: f.ancho, alto: f.alto, alt: f.alt, pos: f.posicion, pie: f.pie, pie_href: f.pie_href }))) : null;
if (heroFoto) { heroFoto.sizes = HERO_SIZES; heroFoto.varias = !!heroVarias; }
const pueblo = {
  ...P,
  /* ancla: cada lugar tiene su sitio en «Qué ver» (la banda «Conocer …» de la portada enlaza ahí) */
  lugares: (P.lugares || []).map(l => { const f = foto(l.foto, l.alt, l.nombre); return { nombre: l.nombre, texto: l.texto, foto: f ? l.foto : null, ancho: f ? f.ancho : null, alto: f ? f.alto : null, alt: l.alt || '', credito: f ? f.credito : null, ancla: 'lugar-' + slugDe(l.nombre) }; }),
  placa: P.placa ? { titulo: P.placa.titulo || 'Un lugar con nombre propio', lineas: P.placa.lineas, pie: P.placa.pie, texto: P.placa.texto || null } : null,
  gastronomia: P.gastronomia ? { ...P.gastronomia, foto_datos: P.gastronomia.foto ? foto(P.gastronomia.foto, P.gastronomia.alt, 'gastronomía') : null } : null,
  historia: P.historia || [], patrimonio: P.patrimonio || [], personajes: P.personajes || [],
  /* patrimonio por grupos (campo opcional `grupo` de cada elemento), en el orden en que aparecen.
     Sin grupos, un solo bloque sin título; lo que no lleve grupo entre otros que sí, va a «Otros» */
  patrimonio_grupos: (() => {
    const gs = [];
    for (const it of P.patrimonio || []) {
      const t = it.grupo || null;
      let g = gs.find(x => x.clave === t);
      if (!g) gs.push(g = { clave: t, titulo: t, items: [] });
      /* v3b: cada fila tiene su ancla (el mapa del término enlaza ahí), salvo si ya es un lugar de «Qué ver» */
      const ancla = 'lugar-' + slugDe(it.nombre);
      g.items.push({ nombre: it.nombre, detalle: it.detalle || null, ancla: (P.lugares || []).some(l => slugDe(l.nombre) === slugDe(it.nombre)) || gs.some(x => x.items.some(y => y.ancla === ancla)) ? null : ancla });
    }
    if (gs.length > 1) gs.forEach(g => { if (!g.titulo) g.titulo = 'Otros'; });
    gs.sort((a, b) => (a.clave === null) - (b.clave === null));
    return gs.map(g => ({ titulo: g.titulo, items: g.items, cuenta: g.items.length }));
  })(),
  /* url: null explícito: si falta, el Mustache la busca hacia fuera y encuentra la `url` de la web
     (una ruta sin enlace salía con «Ver la ruta» a la portada; Monesterio, Camino de Santiago) */
  rutas: (P.rutas || []).map(r => ({ ...r, url: r.url || null })),
  /* lo que se puede visitar por dentro: con horario y entrada solo si constan; si no, cómo preguntarlo */
  visitas: (P.visitas || []).map(v => {
    if (!v.nombre) errores.push('pueblo.visitas: cada visita lleva «nombre»');
    const datos = [['Dirección', v.direccion], ['Horario', v.horario], ['Entrada', v.precio]].filter(([, x]) => x).map(([dt, dd]) => ({ dt, dd }));
    return { nombre: v.nombre, texto: v.texto || null, datos, telefono: v.telefono || null, tel_href: v.telefono ? telHref(v.telefono) : null,
      nota: v.nota || null, url: v.url || null, url_texto: v.url_texto || 'Más información' };
  }),
  /* dónde comer y dormir: negocios privados, así que cada grupo lleva de dónde salen los datos */
  establecimientos: (P.establecimientos || []).map(g => {
    if (!g.grupo || !(g.items || []).length) errores.push('pueblo.establecimientos: cada grupo lleva «grupo» e «items»');
    return { grupo: g.grupo, nota: g.nota || null, items: (g.items || []).map(e => {
      if (!e.nombre) errores.push('pueblo.establecimientos «' + g.grupo + '»: cada uno lleva «nombre»');
      return { nombre: e.nombre, telefono: e.telefono || null, tel_href: e.telefono ? telHref(e.telefono) : null,
        detalle: [e.direccion, e.nota].filter(Boolean).join(' · ') || null };
    }) };
  })
};
if (P.establecimientos && P.establecimientos.length && !P.establecimientos_fuente) errores.push('pueblo.establecimientos_fuente: di de dónde salen los datos y de cuándo (son negocios privados)');
pueblo.establecimientos_fuente = P.establecimientos_fuente || null;
/* cabeceras de las páginas interiores: foto opcional por id de página, recortada en arco como la
   del hero. "cabeceras": { "pueblo": { "archivo", "alt", "posicion" } } o solo "archivo" (sin alt:
   la foto es decorativa). Sin foto, la cabecera lleva el arco de línea. «El pueblo» la pinta grande */
const ID_PAGINAS = ['tramites', 'ayuntamiento', 'avisos', 'noticias', 'agenda', 'telefonos', 'pueblo', 'contacto', 'legal', 'noticia'];
const cabeceras = {};
for (const [id, c] of Object.entries(M.cabeceras || {})) {
  if (id.startsWith('_') || c == null) continue;
  if (!ID_PAGINAS.includes(id)) { errores.push('cabeceras: «' + id + '» no es una página (' + ID_PAGINAS.join(', ') + ')'); continue; }
  const conf = typeof c === 'string' ? { archivo: c } : c;
  if (!conf.archivo) { errores.push('cabeceras «' + id + '»: falta «archivo»'); continue; }
  const f = foto(conf.archivo, conf.alt, 'cabecera de ' + id);
  if (f) cabeceras[id] = { ...f, alt: conf.alt || '', posicion: conf.posicion || '50% 50%', credito: f.credito || null };
}
/* si la foto grande de «El pueblo» es la del primer lugar del carril, ese lugar pasa al final:
   la misma foto dos veces seguidas parece un error */
/* v3: «Conocer …» en la portada: de 3 a 5 lugares con foto, en el orden de municipio.json (antes de
   mover el de la cabecera) o el que diga pueblo.portada_lugares (nombres). Con menos de 3, no sale */
const conPortada = pueblo.lugares.filter(l => l.foto);
if (P.portada_lugares) for (const n of P.portada_lugares) if (!conPortada.some(l => l.nombre === n)) errores.push('pueblo.portada_lugares: «' + n + '» no es un lugar con foto de pueblo.lugares');
const conocerSel = (P.portada_lugares ? P.portada_lugares.map(n => conPortada.find(l => l.nombre === n)).filter(Boolean) : conPortada).slice(0, 5);
const conocer = conocerSel.length >= 3 ? conocerSel.map(l => ({ nombre: l.nombre, foto: l.foto, ancho: l.ancho, alto: l.alto, ancla: l.ancla, credito: l.credito || null })) : [];
if (cabeceras.pueblo && pueblo.lugares.length > 1 && pueblo.lugares[0].foto === cabeceras.pueblo.archivo) pueblo.lugares.push(pueblo.lugares.shift());
const creditos = [...usadas.values()];

/* ───────────────────────── v3b · «… en cifras» (portada) ─────────────────────────
   municipio.json → cifras: [{valor, unidad, etiqueta, fuente, fuente_url, anio}]. Cada cifra lleva
   su fuente (sale en pequeño debajo). Un número se escribe a la española (3.130; 185,6); un texto
   (un año, «s. XIII») tal cual. Sin el campo, la banda no sale. Los opcionales, a null explícito */
const numeroEs = n => { const [e, d] = String(Math.abs(n)).split('.'); return (n < 0 ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : ''); };
const cifras = (M.cifras || []).map((c, i) => {
  if (c == null || c.valor == null || c.valor === '' || !c.etiqueta || !c.fuente) { errores.push('cifras[' + i + ']: cada cifra lleva «valor», «etiqueta» y «fuente» (sin fuente no se enseña)'); return null; }
  if (typeof c.valor === 'number' && !Number.isFinite(c.valor)) errores.push('cifras[' + i + ']: «valor» no es un número');
  if (c.fuente_url && !/^https:\/\//.test(c.fuente_url)) errores.push('cifras[' + i + ']: «fuente_url» empieza por https://');
  return { valor: typeof c.valor === 'number' ? numeroEs(c.valor) : String(c.valor), unidad: c.unidad || null, etiqueta: c.etiqueta,
    fuente: c.fuente, fuente_url: c.fuente_url || null, fuente_sr: c.fuente_url ? srDe(c.fuente_url) : null, anio: c.anio || null };
}).filter(Boolean);
if (cifras.length > 5) errores.push('cifras: 5 como mucho (hay ' + cifras.length + ')');

/* ───────────────────────── identidad (v3): el perfil del pueblo y el plano del pie ─────────────────────────
   marca/perfil.svg (scripts/perfil.mjs) es el perfil del pueblo a línea; sin él, el genérico de
   fuente/_perfil_generico.svg. marca/plano.svg (scripts/plano.mjs, desde OpenStreetMap) es el plano
   de las calles del Ayuntamiento; sin él, el pie va a dos columnas. Se incrustan: ni una petición.
   Solo se aceptan sus elementos de dibujo, sin colores ni estilos (los pone css/base.css) */
function svgLimpio(rel, permitidos) {
  const src = leer(rel).replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, '');
  const vb = (/<svg\b[^>]*\bviewBox="([-\d.\s]+)"/.exec(src) || [])[1];
  if (!vb) { errores.push(rel + ': falta el viewBox'); return null; }
  const etiquetas = [...src.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map(m => m[1]).filter(t => t !== 'svg');
  const raras = [...new Set(etiquetas.filter(t => !permitidos.includes(t)))];
  if (raras.length) errores.push(rel + ': solo puede llevar ' + permitidos.join(', ') + ' (lleva ' + raras.join(', ') + ')');
  if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch)\(|\bstyle=|\bfill=|\bstroke=|\bon[a-z]+=|<script|href=/i.test(src.replace(/viewBox="[^"]*"/, ''))) errores.push(rel + ': sin colores, estilos, enlaces ni scripts (los colores salen de los tokens)');
  const cuerpo = src.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return { vb, cuerpo, nombre: (/<svg\b[^>]*\bdata-(?:perfil|plano)="([^"]*)"/.exec(src) || [])[1] || null };
}
const perfilRel = existe('marca/perfil.svg') ? 'marca/perfil.svg' : 'fuente/_perfil_generico.svg';
const perfilSvg = svgLimpio(perfilRel, ['path']);
/* el perfil y el plano son de UN pueblo: al copiar la plantilla para otro, se borran (RESKIN.md §1) */
if (perfilSvg && perfilRel.startsWith('marca/') && perfilSvg.nombre && perfilSvg.nombre !== marcaConf.slug) errores.push(`marca/perfil.svg es de «${perfilSvg.nombre}», no de «${marcaConf.slug}»: bórralo (sale el genérico) o dibuja el de este pueblo (RESKIN.md §6 bis)`);
/* cada trazo con pathLength="1": la animación lo dibuja de 1 a 0 (css/movimiento.css) */
const perfil = perfilSvg ? {
  propio: perfilRel.startsWith('marca/'), nombre: perfilSvg.nombre || (perfilRel.startsWith('marca/') ? 'propio' : 'generico'),
  svg: `<svg class="pie__perfil-dibujo" viewBox="${perfilSvg.vb}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">` +
    perfilSvg.cuerpo.replace(/<path\b/g, '<path pathLength="1"').replace(/\s*\n\s*/g, '') + '</svg>'
} : null;
/* v3b · M9: el plano del pie se dibuja una vez al asomar, desde el Ayuntamiento hacia fuera.
   plano.mjs centra el lienzo en el Ayuntamiento: cada tramo de calle (cada «M…» de los <path>
   de calles) pasa a ser su propio <path pathLength="1">, empezando por su punta más cercana al
   centro, con --plano-d = su distancia al centro (0 el más cercano, 1 el más lejano). css/movimiento.css lo traza con un
   retraso proporcional (600 ms en total). En reposo, sin JS o con movimiento reducido, entero */
function callesEnOrden(cuerpo, vb) {
  const [x0, y0, w, h] = vb.trim().split(/\s+/).map(Number), cx = x0 + w / 2, cy = y0 + h / 2;
  const tramos = [];
  const sinCalles = cuerpo.replace(/<path class="(plano-calle[^"]*)" d="([^"]*)"\s*\/>/g, (m, clase, d) => {
    for (const sub of d.split(/(?=M)/).filter(x => x.trim())) {
      let pts = sub.replace(/^M/, '').split('L').map(p => p.trim().split(/[\s,]+/).map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
      if (pts.length < 2) continue;
      const dist = p => Math.hypot(p[0] - cx, p[1] - cy);
      if (dist(pts[pts.length - 1]) < dist(pts[0])) pts = pts.reverse();
      tramos.push({ clase, pts, cerca: Math.min(...pts.map(dist)) });
    }
    return '<!--calles-->';
  });
  if (!tramos.length) return cuerpo;
  const cerca = Math.min(...tramos.map(t => t.cerca)), lejos = (Math.max(...tramos.map(t => t.cerca)) - cerca) || 1;   /* el primero, en 0; el último, en 1 */
  /* las principales encima (como en plano.svg); dentro de cada capa, de dentro afuera */
  tramos.sort((a, b) => (a.clase.length - b.clase.length) || (a.cerca - b.cerca));
  const paths = tramos.map(t => `<path class="${t.clase}" pathLength="1" style="--plano-d: ${((t.cerca - cerca) / lejos).toFixed(3)}" d="M${t.pts.map(p => p.join(' ')).join('L')}"/>`).join('');
  let puesto = false;
  return sinCalles.replace(/<!--calles-->/g, () => (puesto ? '' : (puesto = true, paths)));
}
let plano = null;
if (existe('marca/plano.svg')) {
  const s = svgLimpio('marca/plano.svg', ['rect', 'path', 'circle', 'text', 'g']);
  const meta = leerJSON('marca/plano.json', {});
  if (meta.nombre_osm && !normal(meta.nombre_osm).includes(normal(M.nombre))) errores.push(`marca/plano.svg es de «${meta.nombre_osm}», no de ${M.nombre}: bórralo o ejecuta node scripts/plano.mjs (RESKIN.md §6 bis)`);
  if (!meta.atribucion || !meta.atribucion_url) errores.push('marca/plano.json: falta la atribución de OpenStreetMap (atribucion y atribucion_url). Vuelve a ejecutar node scripts/plano.mjs');
  if (s) plano = {
    svg: `<svg class="pie__plano-dibujo" viewBox="${s.vb}" aria-hidden="true" focusable="false">${callesEnOrden(s.cuerpo, s.vb).replace(/\s*\n\s*/g, '')}</svg>`,
    atribucion: meta.atribucion || '© colaboradores de OpenStreetMap', atribucion_url: meta.atribucion_url || 'https://www.openstreetmap.org/copyright',
    fecha_texto: meta.fecha && ISO.test(meta.fecha) ? fechaTexto(meta.fecha) : null,
    calles: (meta.calles_rotuladas || []).length ? meta.calles_rotuladas.join(', ').replace(/, ([^,]*)$/, ' y $1') : null
  };
}
/* v3b · V16. El mapa del término en «El pueblo»: marca/termino.svg (la geometría) y marca/termino.json
   (los lugares encontrados en OSM, la escala, la fecha y la atribución), de scripts/termino.mjs. Los
   puntos numerados enlazan a la ficha del lugar (#lugar-<slug>, en «Qué ver» o en «Patrimonio»): un
   punto cuyo lugar ya no está en municipio.json no sale. Sin los dos archivos, la sección no sale */
let termino = null;
if (existe('marca/termino.svg') && existe('marca/termino.json')) {
  const s = svgLimpio('marca/termino.svg', ['rect', 'path', 'text', 'g']);
  const meta = leerJSON('marca/termino.json', {});
  const deQuien = (/<svg\b[^>]*\bdata-termino="([^"]*)"/.exec(leer('marca/termino.svg')) || [])[1];
  if (deQuien !== slugDe(M.nombre))
    errores.push(`marca/termino.svg no es de ${M.nombre}: bórralo o ejecuta node scripts/termino.mjs (RESKIN.md §6 ter)`);
  if (meta.nombre_osm && normal(meta.nombre_osm) !== normal(M.nombre)) errores.push(`marca/termino.json es de «${meta.nombre_osm}», no de ${M.nombre}: bórralo o ejecuta node scripts/termino.mjs`);
  if (!meta.atribucion || !meta.atribucion_url) errores.push('marca/termino.json: falta la atribución de OpenStreetMap (atribucion y atribucion_url). Vuelve a ejecutar node scripts/termino.mjs');
  const anclas = new Set([...pueblo.lugares.map(l => l.ancla), ...pueblo.patrimonio_grupos.flatMap(g => g.items.map(i => i.ancla)).filter(Boolean)]);
  const puntos = (meta.lugares || []).filter(l => anclas.has('lugar-' + slugDe(l.nombre)))
    .map((l, i) => ({ n: i + 1, nombre: l.nombre, ancla: 'lugar-' + slugDe(l.nombre), x: l.x, y: l.y, osm: l.osm, ty: (l.y + 0.5).toFixed(1) }));
  for (const l of meta.lugares || []) if (!anclas.has('lugar-' + slugDe(l.nombre))) avisos.push(`marca/termino.json: «${l.nombre}» ya no está en pueblo.lugares ni en pueblo.patrimonio; su punto no sale`);
  if (s) termino = {
    svg_cuerpo: s.cuerpo.replace(/\s*\n\s*/g, ''), viewbox: s.vb, puntos, radio: meta.radio_punto || Math.round(Number(s.vb.split(/\s+/)[2]) / 40), letra: meta.radio_punto || Math.round(Number(s.vb.split(/\s+/)[2]) / 40), hay_puntos: puntos.length > 0,
    /* v3c · F25: el pueblo ampliado y las rayas de los círculos apartados (termino.mjs), en la leyenda */
    recuadro_texto: meta.recuadro && meta.recuadro.escala_m ? (meta.recuadro.escala_m >= 1000 ? String(meta.recuadro.escala_m / 1000).replace('.', ',') + ' km' : meta.recuadro.escala_m + ' m') : null,
    hay_guias: (meta.lugares || []).some(l => l.sitio),
    rutas_texto: (meta.rutas || []).length ? meta.rutas.map(r => r.nombre).join(', ').replace(/, ([^,]*)$/, ' y $1') : null, carreteras: (meta.carreteras || []).length ? (meta.carreteras || []).join(', ').replace(/, ([^,]*)$/, ' y $1') : null,
    atribucion: meta.atribucion || '© colaboradores de OpenStreetMap', atribucion_url: meta.atribucion_url || 'https://www.openstreetmap.org/copyright',
    fecha_texto: meta.fecha && ISO.test(meta.fecha) ? fechaTexto(meta.fecha) : null, fecha_iso: meta.fecha && ISO.test(meta.fecha) ? meta.fecha : null, muestra: meta.muestra || null,
    escala_texto: meta.escala_m ? (meta.escala_m >= 1000 ? String(meta.escala_m / 1000).replace('.', ',') + ' km' : meta.escala_m + ' m') : null
  };
}
/* v3b · F12. «El pueblo» en otros idiomas. Las etiquetas de la página (los títulos de sección,
   la leyenda del mapa) salen de T_ES; cada idioma las cambia con contenido/pueblo.<lang>.json → ui, y
   trae traducidos los textos de municipio.json → pueblo, emparejados por el nombre en castellano.
   Si falta una traducción de algo que sale en la página, esa página no se genera (y se avisa). Solo se
   traduce «El pueblo»: la cabecera, el menú y el pie siguen en castellano (marcados lang="es") */
const T_ES = {
  lang: 'es', idiomas: 'Idiomas de esta página', aviso_idioma: null, que_ver: 'Qué ver', para_visitar: 'Para visitar', historia: 'Historia',
  patrimonio: 'Patrimonio', fiestas: 'Fiestas', gastronomia: 'Gastronomía', platos: 'Platos', dulces: 'Dulces', para_beber: 'Para beber',
  personajes: 'Personajes', rutas: 'Rutas', ver_la_ruta: 'Ver la ruta', comer_dormir: 'Dónde comer y dormir', llamar_a: 'Llamar a',
  otra_web: ', se abre otra web', negocios_privados: 'Son negocios privados: el Ayuntamiento no responde de sus datos.',
  creditos: 'Créditos de las fotos', ficha_foto: 'ficha de la foto', foto: 'Foto:', lang_placa: null,
  termino_titulo: 'El término en un mapa', termino_pie: 'Mapa del término municipal de {nombre}, dibujado con datos de OpenStreetMap{fecha}.', termino_fecha: ' a {fecha}',
  termino_lugares: 'Lugares del mapa', termino_leer: 'Cómo leerlo', clave_limite: 'Límite del término municipal (línea discontinua)',
  clave_casco: 'El pueblo (área sombreada)', clave_carreteras: 'Carreteras (línea gruesa)', clave_rutas: 'Rutas (línea de puntos)',
  clave_puntos: 'Círculo con número: un lugar de la lista', clave_escala: 'Escala: la barra de abajo mide',
  clave_recuadro: 'Recuadro: el pueblo ampliado; su barra mide', clave_guia: 'Raya fina con un punto: el sitio exacto, cuando el número se ha apartado para que se lea',
  fiesta_mayor: 'Fiesta mayor', sin_fiestas: 'Sin fiestas señaladas',
  /* lo de fuera de «El pueblo» que hay que traducir en su cabecera */
  migas: 'Usted está aquí', inicio: 'Inicio', en_esta_pagina: 'En esta página'
};
const NOMBRE_IDIOMA = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano', ca: 'Català', eu: 'Euskara', gl: 'Galego' };
const conT = (t, nombre, fecha) => ({ ...t, termino_pie: t.termino_pie.replace('{nombre}', nombre).replace('{fecha}', fecha ? t.termino_fecha.replace('{fecha}', fecha) : '') });
const traducciones = [];
for (const f of (existe('contenido') ? fs.readdirSync(r('contenido')) : []).sort()) {
  const m = /^pueblo\.([a-z]{2})\.json$/.exec(f);
  if (!m || m[1] === 'es') continue;
  const tr = leerJSON('contenido/' + f);
  const lang = m[1], tp = tr.pueblo || {}, faltan = [];
  const de = (grupo, clave, campo) => { const x = (tp[grupo] || {})[clave]; if (!x || (campo && !x[campo])) faltan.push(grupo + ' «' + clave + '»' + (campo ? ' → ' + campo : '')); return x || {}; };
  const lista = (clave, base) => { if (!base || !base.length) return []; const x = tp[clave]; if (!Array.isArray(x) || x.length !== base.length) { faltan.push(clave + ' (' + base.length + ' elementos)'); return base; } return x; };
  const t = { ...T_ES, ...(tr.ui || {}), lang, lang_placa: 'es' };
  /* el pie de cada foto («Foto: autor · licencia»), con el autor traducido si lo trae (la web del Ayuntamiento) */
  const creditoT = archivo => { const c = creditosMedia[archivo]; if (!c) return null; const y = (tr.creditos || {})[archivo] || {}; return t.foto + ' ' + (y.autor || c.autor) + (c.licencia ? ' · ' + c.licencia : ''); };
  const lugares = pueblo.lugares.map(l => { const x = de('lugares', l.nombre, 'texto'); if (l.foto && !x.alt) faltan.push('lugares «' + l.nombre + '» → alt'); return { ...l, nombre: x.nombre || l.nombre, texto: x.texto, alt: x.alt || l.alt, credito: l.credito ? creditoT(l.foto) : null }; });
  const g = pueblo.gastronomia;
  const pt = {
    ...pueblo, lugares,
    historia: lista('historia', pueblo.historia),
    placa: pueblo.placa ? (() => { const x = tp.placa || {}; if (!x.titulo || !x.pie) faltan.push('placa (titulo, pie y texto)'); return { ...pueblo.placa, titulo: x.titulo, pie: x.pie, texto: x.texto || null }; })() : null,
    patrimonio_grupos: pueblo.patrimonio_grupos.map(gr => ({ ...gr, titulo: gr.titulo ? ((tp.grupos || {})[gr.titulo] || (faltan.push('grupos «' + gr.titulo + '»'), gr.titulo)) : null,
      items: gr.items.map(i => { const x = de('patrimonio', i.nombre, i.detalle ? 'detalle' : null); return { ...i, nombre: x.nombre || i.nombre, detalle: i.detalle ? x.detalle : null }; }) })),
    gastronomia: g ? { ...g, platos: lista('platos', g.platos), dulces: lista('dulces', g.dulces), bebidas: lista('bebidas', g.bebidas),
      foto_datos: g.foto_datos ? { ...g.foto_datos, alt: tp.gastronomia_alt || (faltan.push('gastronomia_alt'), ''), credito: g.foto_datos.credito ? creditoT(g.foto_datos.archivo) : null } : null } : null,
    personajes: pueblo.personajes.map(x => { const y = de('personajes', x.nombre, 'texto'); return { ...x, texto: y.texto, fechas: y.fechas || x.fechas }; }),
    rutas: pueblo.rutas.map(x => { const y = de('rutas', x.nombre, 'resumen'); return { ...x, nombre: y.nombre || x.nombre, resumen: y.resumen }; }),
    /* lo que se visita y dónde comer: horarios, precios y negocios, sin traducir; no sale en otros idiomas */
    visitas: [], establecimientos: []
  };
  const fiestasT = fiestas.map(x => { const y = de('fiestas', x.nombre, 'cuando'); return { ...x, nombre: y.nombre || x.nombre, cuando: y.cuando }; });
  const mesesT = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 15))));
  const escH = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* el año en fiestas, pintado aquí (vivo.js lo repinta en castellano: en otro idioma no lleva data-vivo) */
  const anioT = mesesT.map((nm, i) => {
    const fs_ = fiestasT.filter(x => x.mes === i + 1), nombreMes = nm.charAt(0).toUpperCase() + nm.slice(1);
    return `<li class="mes${fs_.length ? ' con-fiesta' : ' es-vacio'}"><p class="mes__nombre"><span class="mes__largo">${escH(nombreMes)}</span><span class="mes__corto" aria-hidden="true">${escH(nombreMes.slice(0, 3))}</span></p>` +
      (fs_.length ? '<ul class="mes__fiestas">' + fs_.map(x => `<li><b>${escH(x.nombre)}</b>${x.mayor ? ` <span class="chip chip--mayor">${escH(t.fiesta_mayor)}</span>` : ''}<span>${escH(x.cuando)}</span></li>`).join('') + '</ul>'
        : `<p class="mes__vacio"><span class="mes__raya" aria-hidden="true"></span><span class="mes__vacio-texto">${escH(t.sin_fiestas)}</span></p>`) + '</li>';
  }).join('');
  const creditosT = [...usadas.entries()].map(([archivo, c]) => { const y = (tr.creditos || {})[archivo] || {}; if (!y.titulo) faltan.push('creditos «' + archivo + '» → titulo'); return { ...c, titulo: y.titulo || c.titulo, autor: y.autor || c.autor, nota: c.nota ? (y.nota || (faltan.push('creditos «' + archivo + '» → nota'), c.nota)) : null }; });
  const pag = tr.pagina || {};
  if (!pag.titulo || !pag.descripcion) faltan.push('pagina (titulo y descripcion)');
  if (P.entradilla && !pag.entradilla) faltan.push('pagina → entradilla');
  if (cabeceras.pueblo && cabeceras.pueblo.alt && !tr.cabecera_alt) faltan.push('cabecera_alt');
  for (const k of ['aviso_idioma', 'idiomas']) if (!(tr.ui || {})[k]) faltan.push('ui → ' + k);
  if (faltan.length) { avisos.push(`contenido/${f}: «El pueblo» en ${lang} no se genera; faltan ${faltan.length} traducciones: ${faltan.slice(0, 6).join(', ')}${faltan.length > 6 ? '…' : ''}`); continue; }
  traducciones.push({ lang, nombre: tr.nombre_idioma || NOMBRE_IDIOMA[lang] || lang, og_locale: tr.og_locale || null, archivo: `pueblo-${lang}.html`, t, pagina: pag, pueblo: pt, anio: anioT, creditos: creditosT,
    cabecera: cabeceras.pueblo ? { ...cabeceras.pueblo, alt: tr.cabecera_alt || cabeceras.pueblo.alt, credito: cabeceras.pueblo.credito ? creditoT(cabeceras.pueblo.archivo) : null } : null,
    termino: termino ? { ...termino, puntos: termino.puntos.map(x => ({ ...x, nombre: (pt.lugares.find(l => l.ancla === x.ancla) || pt.patrimonio_grupos.flatMap(gr => gr.items).find(i => i.ancla === x.ancla) || x).nombre })) } : null,
    fecha_termino: termino && termino.fecha_iso ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(termino.fecha_iso + 'T12:00:00Z')) : null });
}
/* las de un idioma que ya no se genera, fuera */
for (const f of fs.readdirSync(RAIZ)) if (/^pueblo-[a-z]{2}\.html$/.test(f) && !traducciones.some(x => x.archivo === f)) fs.rmSync(r(f));
const IDIOMAS_PUEBLO = traducciones.length ? [{ lang: 'es', nombre: NOMBRE_IDIOMA.es, archivo: 'pueblo.html' }, ...traducciones.map(x => ({ lang: x.lang, nombre: x.nombre, archivo: x.archivo }))] : [];

/* enlaces útiles del pie: los de la sede solo si existen (como la franja de la sede) */
/* v3c · transparencia: «Transparencia» lleva a transparencia.html (siempre existe), que explica y lleva al portal */
const pieEnlaces = [['Sede electrónica', sede.inicio], ['Tablón de anuncios', sede.tablon], ['Transparencia', 'transparencia.html'], ['Perfil del contratante', sede.perfil],
  ['Trámites', 'tramites.html'], ['Teléfonos', 'telefonos.html'], ['Agenda', 'agenda.html'], ['Accesibilidad', 'accesibilidad.html']]
  .filter(([, href]) => href).map(([texto, href]) => ({ texto, href, interno: !/^https?:/.test(href), sr: /^https?:/.test(href) ? srDe(href) : null }));

/* ───────────────────────── legal ───────────────────────── */
const instancia = { href: sede.instancia, nombre: 'Instancia general' };
const deCatalogo = (re) => { const t = buscarTramite(re); return t ? { href: t.href, nombre: t.nombre } : instancia; };
const acc = {
  com: deCatalogo(/^Comunicaciones sobre Requisitos de Accesibilidad/i),
  sol: deCatalogo(/^Solicitudes de Información Accesible y Quejas/i),
  rec: deCatalogo(/^Reclamación contra la Solicitud de Información Accesible/i)
};
const accesibilidad = {
  fecha_texto: fechaTexto(M.fecha_datos || ahora.iso),
  comunicaciones: acc.com.href, comunicaciones_nombre: acc.com.nombre,
  solicitudes: acc.sol.href, solicitudes_nombre: acc.sol.nombre,
  reclamacion: acc.rec.href, reclamacion_nombre: acc.rec.nombre
};
const privacidad = {
  tramites: [/^Ejercicio del Derecho de Acceso/i, /^Ejercicio de los Derechos de Rectificación/i, /Delegado de Protección de Datos/i]
    .map(buscarTramite).filter(Boolean).map(t => ({ href: t.href, nombre: t.nombre }))
};
if (!privacidad.tramites.length) privacidad.tramites.push(instancia);

/* ───────────────────────── v3c · transparencia (F22) ─────────────────────────
   transparencia.html ordena lo que la ley obliga a publicar y lleva a DÓNDE está en este municipio.
   Los apartados, su frase y sus artículos son de la plantilla (leídos en el BOE el 04/10/2026: Ley
   19/2013, arts. 5–8, 12, 17, 20 y 24; Ley 4/2013 de Gobierno Abierto de Extremadura, arts. 2, 5, 14
   y 15). Los enlaces, de los datos: municipio.json → transparencia {portal, revisada, apartados:
   {<id>: {enlaces: [{texto, url, nota}], pendiente}}}. Sin datos solo se enlaza lo que es real en
   cualquier municipio: el portal de la sede, el perfil del contratante, «El Ayuntamiento» y la
   solicitud de acceso del catálogo (o la instancia general). Sin el campo, la página explica lo
   general y no inventa nada; con él, lo que no consta sale como hueco «Pendiente: …», solo en la maqueta
   (fuente/transparencia.html lo envuelve en {{#propuesta}}, como la banda: en la web oficial no sale) */
const BOE_LEY19 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-12887', BOE_LEY4 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-6050';
const ley19 = (art, ancla) => ({ texto: 'art. ' + art + ' de la Ley 19/2013', url: BOE_LEY19 + '#' + ancla });
const ley4 = (art, ancla) => ({ texto: 'art. ' + art + ' de la Ley 4/2013 de Extremadura', url: BOE_LEY4 + '#' + ancla });
const GRUPOS_TRANSPARENCIA = [
  { id: 'institucional', titulo: 'Información institucional y organizativa', entradilla: 'Quién gobierna el Ayuntamiento, cómo se organiza y quién responde de cada cosa.' },
  { id: 'juridica', titulo: 'Información de relevancia jurídica', entradilla: 'Las normas del municipio y las que se están preparando, para que se puedan conocer antes de aprobarse.' },
  { id: 'economica', titulo: 'Información económica y presupuestaria', entradilla: 'De dónde sale y en qué se gasta el dinero del Ayuntamiento.' }
];
const APARTADOS_TRANSPARENCIA = [
  { id: 'organizacion', grupo: 'institucional', titulo: 'Quién es quién y qué hace', normas: [ley19('6', 'a6'), ley4('5', 'a5')],
    que_es: 'Las funciones del Ayuntamiento, cómo se organiza y quién es responsable de cada área, con un organigrama al día.' },
  { id: 'normativa', grupo: 'juridica', titulo: 'Ordenanzas y normas', normas: [ley19('7', 'a7')],
    que_es: 'Las ordenanzas y reglamentos del municipio, los que se están preparando y los documentos que se someten a información pública.' },
  { id: 'presupuestos', grupo: 'economica', titulo: 'Presupuestos', normas: [ley19('8.1.d', 'a8'), ley4('14', 'a1-6')],
    que_es: 'En qué piensa gastar el dinero el Ayuntamiento cada año, partida a partida, y cómo va su ejecución.' },
  { id: 'cuentas', grupo: 'economica', titulo: 'Cuentas del año', normas: [ley19('8.1.e', 'a8')],
    que_es: 'Las cuentas del año cerrado, para comparar lo previsto con lo gastado, y los informes de los órganos de control.' },
  { id: 'contratos', grupo: 'economica', titulo: 'Contratos', normas: [ley19('8.1.a', 'a8')],
    que_es: 'Los contratos del Ayuntamiento: qué se contrata, por cuánto, cómo se adjudica y con qué empresa.' },
  { id: 'convenios', grupo: 'economica', titulo: 'Convenios', normas: [ley19('8.1.b', 'a8')],
    que_es: 'Los acuerdos con otras administraciones o entidades: quién los firma, para qué, cuánto duran y qué se paga.' },
  { id: 'subvenciones', grupo: 'economica', titulo: 'Subvenciones y ayudas', normas: [ley19('8.1.c', 'a8')],
    que_es: 'Las subvenciones y ayudas que da el Ayuntamiento, con su importe, su finalidad y quién las recibe.' },
  { id: 'retribuciones', grupo: 'economica', titulo: 'Sueldos de los cargos y bienes de los concejales', normas: [ley19('8.1.f y h', 'a8')],
    que_es: 'Lo que cobran al año los cargos y máximos responsables del Ayuntamiento, y las declaraciones de bienes y actividades de los concejales.' },
  { id: 'acceso', grupo: 'acceso', titulo: 'Pedir información', normas: [ley19('12', 'a12'), ley19('17', 'a17'), ley19('20', 'a20'), ley19('24', 'a24'), ley4('15', 'a1-7')],
    que_es: 'Cualquier persona puede pedir la información que tenga el Ayuntamiento, sin explicar para qué.' }
];
const conSeparadores = xs => xs.map((x, i) => ({ ...x, sep: i === 0 ? '' : i === xs.length - 1 ? ' y ' : ', ' }));
const TR = M.transparencia || null;
const enlaceTransparencia = (e, donde) => {
  if (!e || !e.texto || !e.url) { errores.push('transparencia «' + donde + '»: cada enlace lleva «texto» y «url»'); return null; }
  const interno = /^[a-z0-9-]+\.html(#[\w-]+)?$/.test(e.url);
  if (!interno && !/^https:\/\//.test(e.url)) errores.push('transparencia «' + donde + '»: «' + e.url + '» tiene que empezar por https:// (o ser una página de esta web)');
  return { texto: e.texto, href: e.url, sr: interno ? null : srDe(e.url), nota: e.nota || null };
};
let transparencia;
{
  const ids = new Set(APARTADOS_TRANSPARENCIA.map(a => a.id));
  for (const id of Object.keys((TR && TR.apartados) || {})) if (!ids.has(id)) errores.push('transparencia.apartados: «' + id + '» no es un apartado (' + [...ids].join(', ') + ')');
  if (TR && TR.revisada && !/^\d{4}-\d{2}-\d{2}$/.test(TR.revisada)) errores.push('transparencia.revisada: la fecha de la revisión como AAAA-MM-DD');
  if (TR && TR.portal && TR.portal.url && !TR.portal.nombre) errores.push('transparencia.portal: con «url» va «nombre» (de quién es el portal)');
  /* el portal: el de los datos (el de la Diputación, por ejemplo) o el de la sede, si la sede lo tiene */
  const portal = TR && TR.portal && TR.portal.url ? { url: TR.portal.url, nombre: TR.portal.nombre, sr: srDe(TR.portal.url) }
    : sede.transparencia ? { url: sede.transparencia, nombre: 'Portal de transparencia de la sede electrónica', sr: srDe(sede.transparencia) } : null;
  const accesoTramite = buscarTramite(/acceso a la informaci[oó]n p[uú]blica/i);
  const automaticos = {
    organizacion: [{ texto: 'El Ayuntamiento: la corporación y quién se ocupa de cada asunto', url: 'ayuntamiento.html' }],
    normativa: documentos.length ? [{ texto: 'Normativa y documentos, en «El Ayuntamiento»', url: 'ayuntamiento.html#documentos' }] : [],
    contratos: sede.perfil ? [{ texto: 'Perfil del contratante', url: sede.perfil }] : [],
    acceso: [accesoTramite ? { texto: accesoTramite.nombre, url: accesoTramite.href } : { texto: 'Instancia general', url: sede.instancia }]
  };
  const apartados = APARTADOS_TRANSPARENCIA.map(a => {
    const d = (TR && TR.apartados && TR.apartados[a.id]) || {};
    const vistos = new Set();
    const enlaces = [...(d.enlaces || []), ...(automaticos[a.id] || [])].map(e => enlaceTransparencia(e, a.id)).filter(e => e && !vistos.has(e.href) && vistos.add(e.href));
    /* sin enlace propio: el portal, si lo hay; si no, pedirlo (el derecho de acceso) */
    const sin_enlace = enlaces.length || a.id === 'acceso' ? null : portal ? 'portal' : 'pedir';
    return { ...a, ancla: 'transparencia-' + a.id, enlaces, pendiente: TR && d.pendiente ? d.pendiente : null, normas: conSeparadores(a.normas),
      sin_portal: sin_enlace === 'portal', sin_pedir: sin_enlace === 'pedir' };
  });
  transparencia = {
    portal, art5: BOE_LEY19 + '#a5', con_datos: !!TR, revisada_texto: TR && TR.revisada ? fechaTexto(TR.revisada) : null,
    grupos: GRUPOS_TRANSPARENCIA.map(g => ({ ...g, apartados: apartados.filter(a => a.grupo === g.id) })),
    acceso: apartados.find(a => a.id === 'acceso'),
    leyes: [{ texto: 'Ley 19/2013, de 9 de diciembre, de transparencia, acceso a la información pública y buen gobierno', url: BOE_LEY19 },
      { texto: 'Ley 4/2013, de 21 de mayo, de Gobierno Abierto de Extremadura', url: BOE_LEY4 }]
  };
}

/* ───────────────────────── páginas ───────────────────────── */
const NAV = [['ayuntamiento', 'El Ayuntamiento'], ['tramites', 'Trámites'], ['avisos', 'Avisos'], ['noticias', 'Noticias'],
  ['agenda', 'Agenda'], ['pueblo', 'El pueblo'], ['telefonos', 'Teléfonos'], ['contacto', 'Contacto']];
const N = M.nombre;
const PAGINAS = [
  { archivo: 'index.html', id: 'inicio', titulo: N, titulo_doc: `Ayuntamiento de ${N}`, es_inicio: true, cortina: true,
    descripcion: `Trámites, avisos, agenda y teléfonos del Ayuntamiento de ${N} (${M.provincia}). Lo que pasa hoy en el pueblo.` },
  { archivo: 'tramites.html', id: 'tramites', titulo: 'Trámites', entradilla: 'Todos los trámites se hacen en la sede electrónica, a cualquier hora. Aquí le ayudamos a encontrar el suyo.',
    descripcion: `Trámites del Ayuntamiento de ${N}: padrón, obras, recibos, ayudas. Buscador y lista completa.` },
  { archivo: 'ayuntamiento.html', id: 'ayuntamiento', titulo: 'El Ayuntamiento', entradilla: `Quién gobierna, quién se ocupa de cada asunto y cómo contactar con el Ayuntamiento de ${N}.`,
    descripcion: `Corporación municipal, pleno y concejalías del Ayuntamiento de ${N}.` },
  { archivo: 'avisos.html', id: 'avisos', titulo: 'Avisos y tablón', entradilla: 'Cortes, convocatorias, plenos y anuncios oficiales, del más nuevo al más antiguo.',
    descripcion: `Avisos del Ayuntamiento de ${N} y anuncios del tablón oficial.` },
  { archivo: 'noticias.html', id: 'noticias', titulo: 'Noticias', entradilla: `Lo que ha pasado en ${N}.`, descripcion: `Noticias del Ayuntamiento de ${N}.` },
  { archivo: 'agenda.html', id: 'agenda', titulo: 'Agenda', entradilla: 'Lo que viene en el pueblo: actos, ferias y fiestas.', descripcion: `Agenda y fiestas de ${N}.` },
  { archivo: 'telefonos.html', id: 'telefonos', titulo: 'Teléfonos y servicios', entradilla: 'El listín del pueblo, con las urgencias primero.',
    descripcion: `Teléfonos útiles y servicios municipales de ${N}.` },
  { archivo: 'pueblo.html', id: 'pueblo', titulo: 'El pueblo', entradilla: P.entradilla || null, descripcion: `Historia, patrimonio, fiestas y gastronomía de ${N}.` },
  { archivo: 'contacto.html', id: 'contacto', titulo: 'Contacto', entradilla: 'Dónde está el Ayuntamiento, cuándo atiende y cómo presentar una solicitud.',
    descripcion: `Dirección, horario, teléfono y correo del Ayuntamiento de ${N}.` },
  { archivo: 'aviso-legal.html', id: 'legal', titulo: 'Aviso legal', descripcion: `Aviso legal de la web del Ayuntamiento de ${N}.` },
  { archivo: 'privacidad.html', id: 'legal', titulo: 'Privacidad', descripcion: `Política de privacidad de la web del Ayuntamiento de ${N}.` },
  { archivo: 'cookies.html', id: 'legal', titulo: 'Cookies', descripcion: `Esta web no usa cookies.` },
  { archivo: 'accesibilidad.html', id: 'legal', titulo: 'Declaración de accesibilidad', descripcion: `Declaración de accesibilidad de la web del Ayuntamiento de ${N}.` },
  { archivo: '404.html', id: 'error', titulo: 'No encontramos esa página', descripcion: 'Página no encontrada.' },
  /* v3b · servicio: «La propuesta» es para el alcalde (se manda por correo: ni en el menú ni en el pie) y
     solo existe mientras la web es maqueta; «Avisos y agenda en su móvil», la agenda y los avisos sin redes */
  ...(M.propuesta !== false ? [{ archivo: 'propuesta.html', id: 'propuesta', titulo: 'La propuesta', estilos: ['propuesta.css'], scripts: ['propuesta.js'],
    entradilla: `Una web para el Ayuntamiento de ${N} que se mantiene viva sola, cumple la ley de accesibilidad y se usa bien desde el móvil.`,
    descripcion: `Qué cambia con la propuesta de web para el Ayuntamiento de ${N}.` }] : []),
  { archivo: 'suscribirse.html', id: 'suscribirse', titulo: 'Avisos y agenda en su móvil', estilos: ['propuesta.css'],
    entradilla: 'La agenda del Ayuntamiento en el calendario de su móvil y los avisos en un lector de noticias, sin redes sociales.',
    descripcion: `Cómo recibir la agenda y los avisos del Ayuntamiento de ${N} sin redes sociales.` },
  /* v3c · guia: «Publicar en la web», para el personal del Ayuntamiento. Fuera del menú (un enlace
     discreto en el pie) y con noindex siempre, también cuando la web ya se indexe */
  { archivo: 'publicar.html', id: 'publicar', titulo: 'Publicar en la web', noindex: true, estilos: ['publicar.css'], scripts: ['publicar.js'],
    entradilla: 'Para el personal del Ayuntamiento: cómo publicar un aviso, un acto o una noticia desde el móvil, dónde sale cada cosa y cómo corregirla.',
    descripcion: `Cómo publica el personal del Ayuntamiento de ${N} avisos, actos y noticias en la web.` },
  /* v3b · F9: solo con municipio.json → incidencias.correo */
  ...(incidencias ? [{ archivo: 'incidencia.html', id: 'incidencia', titulo: 'Avisar de un problema', migas: [{ href: 'tramites.html', texto: 'Trámites' }],
    entradilla: 'Una farola apagada, una fuga de agua, un bache… Cuéntenos qué pasa y le preparamos el correo para el Ayuntamiento.',
    descripcion: `Avise al Ayuntamiento de ${N} de un problema en la calle: alumbrado, agua, limpieza, baches o ruidos.` }] : []),
  /* v3b · F10: solo con contenido/facil.json */
  ...(facil ? [{ archivo: 'facil.html', id: 'facil', titulo: 'Trámites explicados fácil', migas: [{ href: 'tramites.html', texto: 'Trámites' }],
    entradilla: 'Los trámites que más se piden, explicados con palabras fáciles y paso a paso.',
    descripcion: `Trámites del Ayuntamiento de ${N} explicados en lectura fácil.` }] : []),
  /* v3c · transparencia (F24): solo con un correo (escribanos.correo o contacto.correo) */
  ...(escribanos ? [{ archivo: 'escribanos.html', id: 'escribanos', titulo: 'Escríbanos', migas: [{ href: 'contacto.html', texto: 'Contacto' }],
    entradilla: 'Una consulta, una sugerencia o una felicitación para el Ayuntamiento: le preparamos el correo y usted lo envía.',
    descripcion: `Escriba al Ayuntamiento de ${N}: consultas, sugerencias y felicitaciones.` }] : []),
  /* v3c · transparencia (F22): siempre (sin portal propio, explica lo general y cómo pedirlo); desde el pie y la franja de la sede */
  { archivo: 'transparencia.html', id: 'transparencia', titulo: 'Transparencia',
    entradilla: 'Lo que el Ayuntamiento tiene que publicar por ley, dónde encontrarlo y cómo pedir lo que no esté.',
    descripcion: `Presupuestos, cuentas, contratos, subvenciones y normas del Ayuntamiento de ${N}, y cómo pedir información pública.` },
  ...noticias.map(n => ({ archivo: `noticia-${n.id}.html`, fuente: '_noticia.html', id: 'noticia', nav: 'noticias', titulo: n.titulo,
    migas: [{ href: 'noticias.html', texto: 'Noticias' }], descripcion: n.resumen || n.titulo, noticia: n }))
];
for (const n of noticias) if (!/^[a-z0-9-]+$/.test(n.id)) errores.push('noticias.json: id «' + n.id + '» solo con a-z, 0-9 y guiones');
/* v3b · F12: «El pueblo» en cada idioma con traducción completa (contenido/pueblo.<lang>.json) */
for (const x of traducciones) PAGINAS.push({ archivo: x.archivo, fuente: 'pueblo.html', id: 'pueblo', nav: 'pueblo', titulo: x.pagina.titulo, titulo_doc: x.pagina.titulo_doc || null,
  entradilla: x.pagina.entradilla || null, descripcion: x.pagina.descripcion, traduccion: x });
/* v3 · el pictograma de cada cabecera sin foto: lo elige la plantilla por página, no los datos.
   Una página interior nueva sin pictograma es un error (sería otra vez el arco vacío) */
const PICTO_DE = { 'tramites.html': 'tramites', 'ayuntamiento.html': 'ayuntamiento', 'avisos.html': 'megafono', 'noticias.html': 'periodico',
  'agenda.html': 'calendario', 'telefonos.html': 'telefono', 'pueblo.html': 'pueblo', 'contacto.html': 'sobre',
  'aviso-legal.html': 'balanza', 'privacidad.html': 'candado', 'cookies.html': 'galleta', 'accesibilidad.html': 'accesibilidad',
  'propuesta.html': 'ayuntamiento', 'suscribirse.html': 'megafono',   /* v3b · servicio */
  'incidencia.html': 'farola', 'facil.html': 'facil',
  'transparencia.html': 'transparencia', 'escribanos.html': 'mensaje' };   /* v3c · transparencia */
PICTO_DE['publicar.html'] = 'publicar';   /* v3c · guia: un móvil con el formulario */
const pictoDe = p => PICTO_DE[p.archivo] || (p.id === 'noticia' ? 'periodico' : null) || (p.traduccion ? PICTO_DE[p.fuente] : null);
for (const p of PAGINAS) {
  if (p.id === 'inicio' || p.id === 'error') continue;
  if (!pictoDe(p)) errores.push(p.archivo + ': sin pictograma para la cabecera (PICTO_DE en aplicar.mjs)');
  else if (!PICTOS[pictoDe(p)]) errores.push(p.archivo + ': no hay pictograma «' + pictoDe(p) + '» en fuente/_pictogramas.html');
}

if (errores.length && !FORZAR) {
  console.error('\n✗ No se escribe nada. Arregla esto:\n  - ' + errores.join('\n  - ') + '\n');
  process.exit(1);
}

const escritos = [];
function escribir(rel, contenido) {
  fs.mkdirSync(path.dirname(r(rel)), { recursive: true });
  fs.writeFileSync(r(rel), contenido);
  escritos.push(rel);
}
/* limpia las noticias generadas que ya no existen */
for (const f of fs.readdirSync(RAIZ)) if (/^noticia-.*\.html$/.test(f) && !PAGINAS.some(p => p.archivo === f)) fs.rmSync(r(f));
if (M.propuesta === false && existe('propuesta.html')) fs.rmSync(r('propuesta.html'));   /* v3b: la página de venta no viaja a la web oficial */
/* v3b: las páginas opcionales (incidencias, lectura fácil) se borran si sus datos ya no están */
for (const f of ['incidencia.html', 'facil.html', 'escribanos.html']) if (existe(f) && !PAGINAS.some(p => p.archivo === f)) fs.rmSync(r(f));

escribir('css/marca.css', cssMarca());
/* «Añadir a mi calendario»: un .ics por evento de la agenda (también fiestas y plenos).
   Se borran los de eventos que ya no están */
{
  const icsVivos = new Set(D.agenda.filter(e => !e.oculto).map(e => e.ics));
  fs.mkdirSync(r('ics'), { recursive: true });
  for (const f of fs.readdirSync(r('ics'))) if (f.endsWith('.ics') && !icsVivos.has('ics/' + f)) fs.rmSync(r('ics', f));
  for (const e of D.agenda.filter(x => !x.oculto)) escribir(e.ics, Vivo.ics(e, D, fechaBuild));
}
escribir('js/tramites-datos.js', '/* GENERADO por scripts/aplicar.mjs desde municipio.json → tramites. Lo carga el buscador. */\n' +
  'window.TRAMITES = ' + jsonEnScript(lista.map(t => ({ n: t.nombre, h: t.href, s: t.sr, c: [...(claros.get(t.href) || [])] }))) + ';\n' +
  'window.SINONIMOS = ' + jsonEnScript(M.tramites.sinonimos || {}) + ';\n' +
  /* v3b · F8: lo demás que encuentra el buscador global y no va en los datos vivos de cada página:
     el listín (nombre, número, grupo y detalle) y los lugares de «El pueblo» con su ancla */
  'window.BUSCAR = ' + jsonEnScript({
    telefonos: gruposListin.flatMap(g => g.items.filter(i => i.telefono).map(i => ({ n: i.nombre, t: i.telefono, g: g.grupo, d: i.detalle || '', h: 'telefonos.html' }))),
    lugares: pueblo.lugares.map(l => ({ n: l.nombre, x: l.texto || '', h: 'pueblo.html#' + l.ancla }))
  }) + ';\n');

const huella = rel => existe(rel) ? crypto.createHash('md5').update(fs.readFileSync(r(rel))).digest('hex').slice(0, 8) : '0';
const v = { fuentes: huella('css/fuentes.css'), marca: huella('css/marca.css'), base: huella('css/base.css'), main: huella('js/main.js'), vivo: huella('js/vivo.js'), cortina: huella('js/cortina.js'), datos: huella('js/tramites-datos.js') };
v.movimiento = huella('css/movimiento.css'); v.movimiento_js = huella('js/movimiento.js');   /* animaciones (todo bajo prefers-reduced-motion: no-preference) */
v.imprimir = huella('css/imprimir.css'); v.identidad = huella('js/identidad.js');
v.incidencia = huella('js/incidencia.js');
v.formulario_correo = huella('js/formulario-correo.js'); v.escribanos = huella('js/escribanos.js');   /* v3c · transparencia: lo común de los formularios de correo y «Escríbanos» */                                                     /* v3b · F9: el formulario de incidencias */                /* v3: hoja de impresión; hemiciclo y botón de imprimir */
const fuentesDir = existe('fonts') ? fs.readdirSync(r('fonts')) : [];
const pre = (fam, peso) => fuentesDir.find(f => f.startsWith(slugDe(fam) + '-' + peso + '-latin.'));
const precargar = [pre(marcaConf.letra.titulares, '700'), pre(marcaConf.letra.texto, '400')].filter(Boolean).map(f => 'fonts/' + f);
const e160 = medidasImagen('marca/escudo-160.png'), e480 = medidasImagen('marca/escudo-480.png');
const url = (M.url || '').replace(/\/?$/, M.url ? '/' : '');
const webActual = M.web_actual || null;

/* ───────────────────────── v3b · servicio: la propuesta, suscribirse sin redes y datos estructurados ─────────────────────────
   municipio.json → propuesta_web (opcional): problemas de la web actual (comprobables), captura de la
   web actual y contacto. Sin él, «La propuesta» habla en general y el «antes» queda como hueco marcado */
const PW = M.propuesta_web || {};
const CAPTURA = 'assets/propuesta-portada.jpg';   /* la escribe scripts/captura-portada.mjs, más abajo */
const capturaAntes = PW.captura_antes && PW.captura_antes.archivo && existe(PW.captura_antes.archivo)
  ? { archivo: PW.captura_antes.archivo, ...medidasImagen(PW.captura_antes.archivo), alt: PW.captura_antes.alt || 'Portada de la web actual del Ayuntamiento' } : null;
if (PW.captura_antes && PW.captura_antes.archivo && !capturaAntes) avisos.push('propuesta_web.captura_antes: no existe ' + PW.captura_antes.archivo + ' (sale el hueco «PENDIENTE»)');
if (PW.contacto && PW.contacto.telefono && !TEL.test(PW.contacto.telefono)) errores.push('propuesta_web.contacto.telefono: escríbelo como «924 536 011»');
if (PW.revisada && !ISO.test(PW.revisada)) errores.push('propuesta_web.revisada: la fecha de la revisión como AAAA-MM-DD');
const despuesDatos = () => (existe(CAPTURA) ? { archivo: CAPTURA, ancho: 1280, alto: 800, huella: huella(CAPTURA) } : null);
const servicio = {
  eventos: D.agenda.filter(e => !e.oculto).length, hay_plenos: D.agenda.some(e => !e.oculto && e.tipo === 'pleno'),
  webcal: url ? url.replace(/^https?:\/\//, 'webcal://') + 'agenda.ics' : null, ics_abs: url ? url + 'agenda.ics' : null, feed_abs: url ? url + 'feed.xml' : null,
  /* los campos opcionales, a null: el Mustache busca hacia fuera (contacto, nombre…) */
  propuesta: M.propuesta !== false ? {
    problemas: (PW.problemas || []).map(x => (typeof x === 'string' ? { texto: x, fuente: null } : { texto: x.texto, fuente: x.fuente || null })),
    revisada_texto: PW.revisada ? 'revisión del ' + fechaTexto(PW.revisada) : null,
    antes: capturaAntes, despues: despuesDatos(), farmacias: !!farmacias, tramites_sede: tramitesSede,
    contacto: PW.contacto && (PW.contacto.correo || PW.contacto.telefono) ? { nombre: PW.contacto.nombre || null, correo: PW.contacto.correo || null,
      telefono: PW.contacto.telefono || null, tel_href: PW.contacto.telefono ? telHref(PW.contacto.telefono) : null } : null
  } : null
};
/* JSON-LD: el Ayuntamiento (portada, El Ayuntamiento, contacto, agenda y noticias), un Event por acto
   de la agenda, un NewsArticle por noticia y las migas en cada página interior. Lo de «ejemplo», fuera */
const ldBase = url || '';
const ldOrg = organizacion({ M, base: ldBase, telE164: t => telHref(t).replace(/^tel:/, ''), escudo: 'marca/escudo-480.png' });
const ldEventos = D.agenda.filter(e => !e.oculto && !e.ejemplo).map(e => eventoLd(e, { M, base: ldBase, rutas: D.rutas }));
function jsonLdDe(p) {
  const g = [];
  if (['inicio', 'ayuntamiento', 'contacto', 'agenda', 'noticia'].includes(p.id)) g.push(ldOrg);
  if (p.id === 'agenda') g.push(...ldEventos);
  if (p.id === 'noticia' && p.noticia && !p.noticia.ejemplo) g.push(noticiaLd(p.noticia, { base: ldBase, rutas: D.rutas, archivo: p.archivo }));
  if (p.id !== 'inicio' && p.id !== 'error') g.push(migasLd([{ texto: 'Inicio', href: 'index.html' }, ...(p.migas || []), { texto: p.titulo, href: p.archivo }], ldBase));
  return jsonLd(g);
}

/* v3c · F17: «Web actualizada el …» en el pie de todas las páginas: la fecha y la hora de este montaje,
   en hora peninsular (Madrid). Va pintado (sin JavaScript): la tarea diaria lo renueva cada mañana */
const actualizada = (() => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(fechaBuild).map(x => [x.type, x.value]));
  const dia = `${p.year}-${p.month}-${p.day}`, hm = `${p.hour}:${p.minute}`;
  return { iso: `${dia}T${hm}${desfase(dia, hm)}`, texto: `${fechaTexto(dia)} a las ${Number(p.hour)}:${p.minute}` };
})();

const comun = {
  actualizada,   /* v3c · F17 */
  ...M, aviso_generado: 'GENERADO por scripts/aplicar.mjs desde fuente/ y los datos. No editar a mano.',
  raiz: '', base_404: null, url: M.url || null, robots_no: !M.indexar, propuesta: M.propuesta !== false,
  /* la cortina de la portada: «puerta» (el arco que vuela al de la foto) o «escudo» (el escudo aterriza en la cabecera) */
  marca: { slug: marcaConf.slug, densidad: marcaConf.densidad === 'sobria' ? 'sobria' : 'puerta',
    cortina: cortinaTipo, cortina_puerta: cortinaTipo === 'puerta', cortina_escudo: cortinaTipo === 'escudo' },
  og: {
    titulo: M.propuesta !== false ? `Propuesta de web · ${N}` : `Ayuntamiento de ${N}`,
    descripcion: M.propuesta !== false ? `Propuesta de diseño para la web del Ayuntamiento de ${N}. No es la web oficial.` : `Trámites, avisos, agenda y teléfonos del Ayuntamiento de ${N}.`,
    imagen: url + 'assets/og.jpg'
  },
  color_tema: T['--papel'], precargar, v, sede,
  contacto: { ...M.contacto, tel_href: telHref(M.contacto.telefono), fax: M.contacto.fax || null },
  horario: { ...M.horario, ejemplo: !!M.horario.ejemplo },
  redes: M.redes || [], plenos_video: M.plenos_video || null, lema: M.lema || null,
  canal_avisos: canalAvisos,
  escudo: { ancho160: e160.ancho, ancho480: e480.ancho },
  vivo, datos_vivos: jsonEnScript({ ...D, v_datos: v.datos }),
  paletas: paletas.map((p, i) => ({ clave: p.clave, nombre: nombreMatiz(p.col.marca), pulsado: i === 0 ? 'true' : 'false' })),
  tramites, listin_corto: listinCorto, listin_grupos: gruposListin,
  quien, quien_portada: quien.filter(q => q.portada), fiestas,
  incidencias, facil,
  transparencia, escribanos,   /* v3c · transparencia */
  pleno, quien_ayto: quienAyto, alcalde, alcaldia: M.alcaldia || {}, documentos, instalaciones,
  corporacion: M.corporacion || {},
  avisos: avisosOrden, noticias, tablon: { excluidas: C.tablon.excluidas || 0 },
  pueblo, conocer, cifras, creditos, hay_creditos_fotos: creditos.length > 0, hero_foto: heroFoto, hero_varias: heroVarias,
  /* el nombre del pueblo, palabra a palabra (cada una en inline-block y sin partir: la entrada del hero) */
  nombre_palabras: M.nombre.trim().split(/\s+/).map((p, i) => ({ palabra: p, n: i })),
  mapa_embed_url: 'https://www.google.com/maps?q=' + encodeURIComponent(M.contacto.mapa_consulta || `Ayuntamiento de ${N}, ${M.contacto.direccion}, ${M.contacto.cp} ${N}`) + '&output=embed',
  como_llegar_url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(M.contacto.mapa_consulta || `Ayuntamiento de ${N}`),
  web_actual: webActual, web_actual_texto: webActual ? webActual.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
  accesibilidad, privacidad,
  servicio,   /* v3b */
  publicar,   /* v3c · guia: publicar.html */
  t: conT(T_ES, N, termino ? termino.fecha_texto : null), anio_traducido: null,
  perfil, plano, termino, pie_enlaces: pieEnlaces, fecha_datos_texto: fechaTexto(M.fecha_datos || ahora.iso), web_texto: url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null
};

const conParciales = (src, n = 0) => {
  if (n > 6) throw new Error('Parciales anidados demasiado hondo');
  return src.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (m, nombre) => conParciales(leer('fuente/_' + nombre + '.html'), n + 1));
};
/* v3 · índice lateral de las páginas largas. Fuera: la portada, la 404, Trámites (tiene su índice
   A–Z y su buscador), Noticias (sus h2 son las tarjetas) y las páginas de otras zonas de la v3
   (El Ayuntamiento y Teléfonos): para dárselo, quitarlas de aquí */
const SIN_INDICE = new Set(['inicio', 'error', 'tramites', 'noticias', 'ayuntamiento', 'telefonos', 'facil']);   /* v3b: «Explicado fácil» lleva su propia lista con pictogramas */
const textoPlano = h => h.replace(/<span class="sr">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const cuerpoMain = html => { const i = html.indexOf('<main'), f = html.lastIndexOf('</main>'); return i < 0 || f < 0 ? null : [i, f]; };
/* los h2 del cuerpo sin id (los textos legales) reciben uno a partir de su texto */
function conIdsEnH2(html) {
  const c = cuerpoMain(html);
  if (!c) return html;
  const usados = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const dentro = html.slice(c[0], c[1]).replace(/<h2((?:(?!\bid=)[^>])*)>([\s\S]*?)<\/h2>/g, (m, attrs, txt) => {
    let id = 's-' + slugDe(textoPlano(txt)).slice(0, 48), n = 2;
    while (usados.has(id)) id = id.replace(/-\d+$/, '') + '-' + n++;
    usados.add(id);
    return `<h2${attrs} id="${id}">${txt}</h2>`;
  });
  return html.slice(0, c[0]) + dentro + html.slice(c[1]);
}
function h2sDelCuerpo(html) {
  const c = cuerpoMain(html);
  if (!c) return [];
  return [...html.slice(c[0], c[1]).matchAll(/<h2([^>]*)>([\s\S]*?)<\/h2>/g)]
    .filter(([, attrs]) => !/class="[^"]*\bsr\b/.test(attrs))
    .map(([, attrs, txt]) => ({ id: (attrs.match(/\bid="([^"]+)"/) || [])[1], texto: textoPlano(txt) })).filter(x => x.id && x.texto);
}
/* v3b · F12: en una página traducida, lo común de la web sigue en castellano y se marca con lang="es"
   (WCAG 3.1.2): el salto, la cabecera, el buscador, el pie, las cookies y el mando. Lo de la cabecera
   de la página (migas e índice) se traduce con las etiquetas del idioma */
function enOtroIdioma(html, t) {
  for (const re of [/<a class="saltar"/, /<header class="cabecera"/, /<dialog class="buscador"/, /<footer class="pie"/, /<div class="cookies"/, /<div class="mando"/])
    html = html.replace(re, m => m + ' lang="es"');
  const i = html.indexOf('<div class="cabeza-pagina'), f = html.indexOf('<section', i);
  if (i < 0) return html;
  const fin = f < 0 ? html.length : f;
  const cab = html.slice(i, fin).replace('aria-label="Usted está aquí"', `aria-label="${t.migas}"`).replace(/(<li><a href="[^"]*index\.html")>Inicio</, `$1 hreflang="es">${t.inicio}<`)
    .replace(/En esta página/g, t.en_esta_pagina);
  return html.slice(0, i) + cab + html.slice(fin);
}
function pintarPagina(p) {
  const pagina = { ...p, titulo_doc: p.titulo_doc || `${p.titulo} · Ayuntamiento de ${N}`, entradilla: p.entradilla || null, migas: p.migas || [], cortina: !!p.cortina, es_inicio: !!p.es_inicio,
    /* la 404 ya lleva su propio arco en el cuerpo: una puerta por página */
    cabecera: (p.traduccion ? p.traduccion.cabecera : cabeceras[p.id]) || null, cabeza_grande: p.id === 'pueblo' && !!cabeceras[p.id], cabeza_arco: p.id !== 'error' && !cabeceras[p.id],
    /* v3b · F12: idioma de la página y, en «El pueblo» con traducciones, el selector y los hreflang */
    lang: p.traduccion ? p.traduccion.lang : 'es', og_locale: p.traduccion ? (p.traduccion.og_locale || null) : 'es_ES',
    idiomas: p.id === 'pueblo' && IDIOMAS_PUEBLO.length ? IDIOMAS_PUEBLO.map(x => ({ ...x, href: x.archivo, actual: x.archivo === p.archivo })) : [],
    alternativas: p.id === 'pueblo' && IDIOMAS_PUEBLO.length ? [...IDIOMAS_PUEBLO.map(x => ({ lang: x.lang, href: url + x.archivo })), { lang: 'x-default', href: url + 'pueblo.html' }] : [] };
  /* v3 · dentro del arco de línea, el pictograma de la página (con foto, manda la foto) */
  pagina.picto = pagina.cabeza_arco && pictoDe(p) ? pictoDe(p) : null;
  pagina.pictograma = pagina.picto ? PICTOS[pagina.picto] : null;
  /* v3b · servicio: datos estructurados y las hojas y scripts propios de una página (versionados) */
  pagina.jsonld = jsonLdDe(p);
  pagina.estilos = (p.estilos || []).map(f => ({ href: 'css/' + f + '?v=' + huella('css/' + f) }));
  pagina.scripts = (p.scripts || []).map(f => ({ href: 'js/' + f + '?v=' + huella('js/' + f) }));
  const datos = {
    ...comun, pagina, noticia: p.noticia || null,
    nav: NAV.map(([id, texto]) => ({ id, texto, href: id + '.html', actual: id === p.id })),
    ...(p.traduccion ? { t: conT(p.traduccion.t, N, p.traduccion.fecha_termino), pueblo: p.traduccion.pueblo, creditos: p.traduccion.creditos, anio_traducido: p.traduccion.anio,
      termino: p.traduccion.termino } : {}),
    base_404: p.archivo === '404.html' && M.url ? new URL(M.url).pathname.replace(/\/?$/, '/') : null
  };
  pagina.indice = null;
  const plantilla = conParciales(leer('fuente/' + (p.fuente || p.archivo)));
  let html = renderizar(plantilla, datos);
  /* v3 · índice lateral «En esta página» en las páginas largas (≥ 4 h2 en el cuerpo): se pinta una
     vez, se leen sus h2 y, si salen, se vuelve a pintar con el índice */
  if (!SIN_INDICE.has(p.id)) {
    html = conIdsEnH2(html);
    const h2s = h2sDelCuerpo(html);
    if (h2s.length >= 4) { pagina.indice = h2s; html = conIdsEnH2(renderizar(plantilla, datos)); }
  }
  html = html.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
  if (p.traduccion) html = enOtroIdioma(html, p.traduccion.t);
  escribir(p.archivo, html);
}
for (const p of PAGINAS) pintarPagina(p);

/* favicon: el escudo en PNG, envuelto en un SVG para los navegadores que lo prefieren */
fs.copyFileSync(r('marca/favicon-64.png'), r('favicon.png')); escritos.push('favicon.png');
escribir('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${fs.readFileSync(r('marca/favicon-64.png')).toString('base64')}"/></svg>\n`);
escribir('manifest.json', JSON.stringify({
  name: `Ayuntamiento de ${N}`, short_name: M.nombre_corto, start_url: './', display: 'browser',
  background_color: T['--papel'], theme_color: T['--papel'], lang: 'es',
  icons: [{ src: 'favicon.png', sizes: '64x64', type: 'image/png' }]
}, null, 2) + '\n');
if (!existe('.nojekyll')) escribir('.nojekyll', '');

/* v3b · servicio: suscribirse sin redes (feed.xml con avisos y noticias; agenda.ics con toda la agenda)
   y el listín sin cobertura (sw.js: telefonos.html y lo que necesita, versionado con su huella) */
escribir('feed.xml', feedAtom({ nombre: N, slug: marcaConf.slug, base: url, avisos: avisosOrden, noticias, rutas: D.rutas, ahoraIso: ahora.iso, escudo: 'marca/escudo-160.png' }));
escribir('agenda.ics', agendaIcs({ Vivo, D, sello: fechaBuild }));
{
  const recursos = ['telefonos.html', ...recursosDe(leer('telefonos.html'), rel => (existe(rel) ? leer(rel) : null)).filter(u => !/\.xml(\?|$)/.test(u))];
  const faltan = recursos.filter(u => !existe(u.split('?')[0]));
  if (faltan.length) avisos.push('sw.js: no existen ' + faltan.join(', ') + ' (no se precargan)');
  const lista = recursos.filter(u => existe(u.split('?')[0]));
  /* v3c: la línea «Web actualizada el …» del pie no cuenta (si no, sw.js cambiaría en cada montaje) */
  const huellaSw = rel => (/\.html$/.test(rel) ? crypto.createHash('md5').update(leer(rel).replace(/<p class="pie__actualizada">.*?<\/p>/, '')).digest('hex').slice(0, 8) : huella(rel));
  const version = crypto.createHash('md5').update(lista.map(u => u + ':' + huellaSw(u.split('?')[0])).join('|')).digest('hex').slice(0, 10);
  escribir('sw.js', swCodigo({ slug: marcaConf.slug, version, rutas: lista }));
}

const informe = paletas.map(p => `paleta ${p.clave} (${nombreMatiz(p.col.marca)}, marca ${p.tokens['--marca']})\n` +
  p.informe.map(f => `  ${f.ratio >= f.min ? '✓' : '✗'} ${f.uso.padEnd(8)} ${f.texto.padEnd(22)} sobre ${f.fondo.padEnd(14)} ${String(f.ratio).padStart(5)}:1  (mín. ${f.min})`).join('\n')).join('\n\n');
escribir('marca/_contraste.txt', informe + '\n');

log(`✓ ${escritos.length} archivos (${PAGINAS.length} páginas). Hoy = ${ahora.iso}. Trámites: ${lista.length} (${tramitesSede} en la sede).`);
if (avisos.length) log('! Avisos:\n  - ' + avisos.join('\n  - '));
if (errores.length) log('✗ Errores ignorados por --forzar:\n  - ' + errores.join('\n  - '));

if (!SIN_OG) {
  try {
    const { generarOg } = await import(pathToFileURL(r('scripts/og.mjs')).href);
    await generarOg(RAIZ, {
      fuentes: '../css/fuentes.css', escudo: 'marca/escudo-480.png', foto: heroFoto ? heroFoto.archivo : null, posicion: heroFoto ? heroFoto.posicion : null,
      antetitulo: M.propuesta !== false ? 'Propuesta de web · Ayuntamiento de' : 'Ayuntamiento de', nombre: N,
      nota: M.propuesta !== false ? 'Diseño propuesto. No es la web oficial.' : 'Trámites, avisos, agenda y teléfonos.'
    });
    log('✓ assets/og.jpg');
  } catch (e) {
    log('! og:image no generada (' + e.message.split('\n')[0] + ')');
  }
  /* v3b · servicio: la portada recién escrita, para el «después» del comparador de «La propuesta» */
  if (servicio.propuesta) {
    try {
      const { capturarPortada } = await import(pathToFileURL(r('scripts/captura-portada.mjs')).href);
      await capturarPortada(RAIZ, marcaConf.slug);
      servicio.propuesta.despues = despuesDatos();
      pintarPagina(PAGINAS.find(p => p.id === 'propuesta'));
      log('✓ ' + CAPTURA);
    } catch (e) {
      log('! ' + CAPTURA + ' no generada (' + e.message.split('\n')[0] + ')');
    }
  }
}
