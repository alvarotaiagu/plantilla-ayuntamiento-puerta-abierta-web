/* aplicar.mjs — escribe la web municipal a partir de los datos.

     municipio.json            el municipio: contacto, horario, sede, corporación,
                               servicios, trámites, el pueblo
     marca/marca.json          colores (de scripts/marca-desde-escudo.py), letra, densidad
     marca/escudo-*.png        el escudo ya rasterizado (scripts/escudo.mjs)
     contenido/*.json          avisos, agenda, noticias y tablón (lo que cambia)
     media/ + creditos.json    fotos con su autor y licencia

   Genera las páginas (desde fuente/), css/marca.css, js/tramites-datos.js,
   favicon, manifest y assets/og.jpg.

     node scripts/aplicar.mjs                  todo
     node scripts/aplicar.mjs --sin-og         sin la imagen para compartir
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

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const SIN_OG = args.includes('--sin-og');
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
const DESTINO = { pdf: 'Impreso en PDF', doc: 'Impreso en Word', documento: 'Documento en el tablón de la sede' };
const tramites = {
  atajos: (M.tramites.atajos || []).map(conHref).map(t => ({ ...t, destino: DESTINO[t.tipo] || (enSede(t.href) ? 'Se abre la sede electrónica' : 'Se abre otra web') })),
  temas: (M.tramites.temas || []).map(tm => ({ ...tm, tramites: tm.tramites.map(conHref) })),
  momentos: (M.tramites.momentos || []).map(m => ({ ...m, pasos: m.pasos.map(p => (p.id || p.url ? conHref(p) : { ...p, href: null, sr: '' })) })),
  lista, total: lista.length, en_sede: tramitesSede, impresos: lista.filter(t => t.formato).length
};
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
  const svg = `<svg class="hemiciclo" viewBox="28 28 244 140" role="img" aria-labelledby="hemiciclo-t hemiciclo-d"><title id="hemiciclo-t">Reparto del pleno</title><desc id="hemiciclo-d">${descripcion}</desc>` +
    `<defs>${grupos.map(trama).join('')}</defs>` +
    puntos.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${rAs}" fill="url(#trama-${slugDe(asientos[i].sigla)})" stroke="${asientos[i].color}" stroke-width="1.5"/>`).join('') +
    `<text class="hemiciclo__total" x="150" y="138" text-anchor="middle" font-size="40">${N}</text><text class="hemiciclo__rotulo" x="150" y="158" text-anchor="middle" font-size="12">concejales</text></svg>`;
  return {
    svg, descripcion,
    grupos: grupos.map(g => ({
      sigla: g.sigla, nombre: g.nombre, n: cuenta(g), concejales: cuenta(g) === 1 ? 'concejal' : 'concejales',
      papel: g.gobierno ? 'gobierno' : 'oposición',
      muestra: `<rect x="1" y="1" width="26" height="26" rx="13" fill="url(#trama-${slugDe(g.sigla)})" stroke="${g.color}" stroke-width="1.5"/>`,
      miembros: miembros.filter(m => m.grupo === g.sigla).map(m => ({ nombre: m.nombre, cargo: m.cargo }))
    }))
  };
}
const pleno = hemiciclo();
const concejalias = miembros.filter(m => m.delegacion).map(m => ({ ...m }));

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

/* ───────────────────────── contenido ───────────────────────── */
const avisosOrden = C.avisos.filter(a => !a.oculto).slice().sort((a, b) => b.fecha.localeCompare(a.fecha))
  .map(a => ({ ...a, fecha_texto: fechaTexto(a.fecha), urgente: !!a.urgente, ejemplo: !!a.ejemplo, enlace: a.enlace || null }));
const noticias = C.noticias.filter(n => !n.oculto).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(n => {
  const f = n.imagen ? foto(n.imagen, n.imagen_alt, 'noticia: ' + n.titulo) : null;
  return { ...n, fecha_texto: fechaTexto(n.fecha), imagen: f ? n.imagen : null, imagen_ancho: f ? f.ancho : null, imagen_alto: f ? f.alto : null,
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
const D = {
  slug: marcaConf.slug, nombre: M.nombre, nombre_corto: M.nombre_corto, zona: 'Europe/Madrid',
  horario: { texto: M.horario.texto, tramos: M.horario.tramos || [], ejemplo: !!M.horario.ejemplo },
  avisos: C.avisos.map(a => ({ id: a.id, fecha: a.fecha, tema: a.tema, titulo: a.titulo, urgente: !!a.urgente, caduca: a.caduca || null, ejemplo: !!a.ejemplo, oculto: !!a.oculto })),
  agenda: [...C.agenda.map(e => ({ id: e.id, fecha: e.fecha, hora: e.hora || null, titulo: e.titulo, lugar: e.lugar || null, nota: e.nota || null, ejemplo: !!e.ejemplo, oculto: !!e.oculto })), ...agendaFiestas],
  noticias: noticias.map(n => ({ id: n.id, fecha: n.fecha, titulo: n.titulo, resumen: n.resumen, imagen: n.imagen, imagen_alt: n.imagen_alt, ejemplo: n.ejemplo })),
  tablon: { actualizado: C.tablon.actualizado || null, entradas: (C.tablon.entradas || []).map(e => ({ fecha: e.fecha, tema: e.tema, titulo: e.titulo, titulo_claro: e.titulo_claro || '', url: e.url, oculto: !!e.oculto })) },
  fiestas, servicios: serviciosVivos, tramites_sede: tramitesSede,
  rutas: { tramites: 'tramites.html', avisos: 'avisos.html', agenda: 'agenda.html', noticia: 'noticia-{id}.html', media: 'media/' },
  hoja: M.hoja && M.hoja.id ? M.hoja : null,
  tablon_json: 'contenido/tablon.json'
};
for (const e of D.tablon.entradas) if (!enSede(e.url)) errores.push('tablon.json: enlace fuera de la sede: ' + e.url);
const pintar = (b, op) => Vivo.pintar(b, D, ahora, op);
const vivo = {
  franja: pintar('franja'), hoy: pintar('hoy'), tablon_portada: pintar('tablon', { limite: 6 }), tablon_todo: pintar('tablon'),
  linea: pintar('linea'), anio: pintar('anio'), agenda: pintar('agenda'), estado_ayto: pintar('servicio', { clave: 'ayuntamiento' })
};
gruposListin.forEach(g => g.items.forEach(i => { if (i.clave) i.estado = pintar('servicio', { clave: i.clave }); }));

/* ───────────────────────── el pueblo y las fotos ───────────────────────── */
const P = M.pueblo || {};
const heroFoto = M.fotos && M.fotos.hero ? foto(M.fotos.hero.archivo, M.fotos.hero.alt, 'portada') : null;
if (heroFoto) heroFoto.posicion = M.fotos.hero.posicion || '50% 50%';
const pueblo = {
  ...P,
  lugares: (P.lugares || []).map(l => { const f = foto(l.foto, l.alt, l.nombre); return { nombre: l.nombre, texto: l.texto, foto: f ? l.foto : null, ancho: f ? f.ancho : null, alto: f ? f.alto : null, alt: l.alt || '', credito: f ? f.credito : null }; }),
  placa: P.placa ? { titulo: P.placa.titulo || 'Un lugar con nombre propio', lineas: P.placa.lineas, pie: P.placa.pie, texto: P.placa.texto || null } : null,
  gastronomia: P.gastronomia ? { ...P.gastronomia, foto_datos: P.gastronomia.foto ? foto(P.gastronomia.foto, P.gastronomia.alt, 'gastronomía') : null } : null,
  historia: P.historia || [], patrimonio: P.patrimonio || [], personajes: P.personajes || [],
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
const creditos = [...usadas.values()];

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
  ...noticias.map(n => ({ archivo: `noticia-${n.id}.html`, fuente: '_noticia.html', id: 'noticia', nav: 'noticias', titulo: n.titulo,
    migas: [{ href: 'noticias.html', texto: 'Noticias' }], descripcion: n.resumen || n.titulo, noticia: n }))
];
for (const n of noticias) if (!/^[a-z0-9-]+$/.test(n.id)) errores.push('noticias.json: id «' + n.id + '» solo con a-z, 0-9 y guiones');

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

escribir('css/marca.css', cssMarca());
escribir('js/tramites-datos.js', '/* GENERADO por scripts/aplicar.mjs desde municipio.json → tramites. Lo carga el buscador. */\n' +
  'window.TRAMITES = ' + jsonEnScript(lista.map(t => ({ n: t.nombre, h: t.href, s: t.sr, c: [...(claros.get(t.href) || [])] }))) + ';\n' +
  'window.SINONIMOS = ' + jsonEnScript(M.tramites.sinonimos || {}) + ';\n');

const huella = rel => existe(rel) ? crypto.createHash('md5').update(fs.readFileSync(r(rel))).digest('hex').slice(0, 8) : '0';
const v = { fuentes: huella('css/fuentes.css'), marca: huella('css/marca.css'), base: huella('css/base.css'), main: huella('js/main.js'), vivo: huella('js/vivo.js'), cortina: huella('js/cortina.js'), datos: huella('js/tramites-datos.js') };
const fuentesDir = existe('fonts') ? fs.readdirSync(r('fonts')) : [];
const pre = (fam, peso) => fuentesDir.find(f => f.startsWith(slugDe(fam) + '-' + peso + '-latin.'));
const precargar = [pre(marcaConf.letra.titulares, '700'), pre(marcaConf.letra.texto, '400')].filter(Boolean).map(f => 'fonts/' + f);
const e160 = medidasImagen('marca/escudo-160.png'), e480 = medidasImagen('marca/escudo-480.png');
const url = (M.url || '').replace(/\/?$/, M.url ? '/' : '');
const webActual = M.web_actual || null;

const comun = {
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
  canal_avisos: M.canal_avisos && M.canal_avisos.url ? { nombre: M.canal_avisos.nombre, url: M.canal_avisos.url, texto: M.canal_avisos.texto || null, otros: M.canal_avisos.otros || [] } : null,
  escudo: { ancho160: e160.ancho, ancho480: e480.ancho },
  vivo, datos_vivos: jsonEnScript({ ...D, v_datos: v.datos }),
  paletas: paletas.map((p, i) => ({ clave: p.clave, nombre: nombreMatiz(p.col.marca), pulsado: i === 0 ? 'true' : 'false' })),
  tramites, listin_corto: listinCorto, listin_grupos: gruposListin,
  quien, quien_portada: quien.filter(q => q.portada), fiestas,
  pleno, concejalias, alcalde, alcaldia: M.alcaldia || {}, documentos, instalaciones,
  corporacion: M.corporacion || {},
  avisos: avisosOrden, noticias, tablon: { excluidas: C.tablon.excluidas || 0 },
  pueblo, creditos, hay_creditos_fotos: creditos.length > 0, hero_foto: heroFoto,
  mapa_embed_url: 'https://www.google.com/maps?q=' + encodeURIComponent(M.contacto.mapa_consulta || `Ayuntamiento de ${N}, ${M.contacto.direccion}, ${M.contacto.cp} ${N}`) + '&output=embed',
  como_llegar_url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(M.contacto.mapa_consulta || `Ayuntamiento de ${N}`),
  web_actual: webActual, web_actual_texto: webActual ? webActual.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
  accesibilidad, privacidad
};

const conParciales = (src, n = 0) => {
  if (n > 6) throw new Error('Parciales anidados demasiado hondo');
  return src.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (m, nombre) => conParciales(leer('fuente/_' + nombre + '.html'), n + 1));
};
for (const p of PAGINAS) {
  const pagina = { ...p, titulo_doc: p.titulo_doc || `${p.titulo} · Ayuntamiento de ${N}`, entradilla: p.entradilla || null, migas: p.migas || [], cortina: !!p.cortina, es_inicio: !!p.es_inicio };
  const datos = {
    ...comun, pagina, noticia: p.noticia || null,
    nav: NAV.map(([id, texto]) => ({ id, texto, href: id + '.html', actual: id === p.id })),
    base_404: p.archivo === '404.html' && M.url ? new URL(M.url).pathname.replace(/\/?$/, '/') : null
  };
  let html = renderizar(conParciales(leer('fuente/' + (p.fuente || p.archivo))), datos);
  html = html.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
  escribir(p.archivo, html);
}

/* favicon: el escudo en PNG, envuelto en un SVG para los navegadores que lo prefieren */
fs.copyFileSync(r('marca/favicon-64.png'), r('favicon.png')); escritos.push('favicon.png');
escribir('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${fs.readFileSync(r('marca/favicon-64.png')).toString('base64')}"/></svg>\n`);
escribir('manifest.json', JSON.stringify({
  name: `Ayuntamiento de ${N}`, short_name: M.nombre_corto, start_url: './', display: 'browser',
  background_color: T['--papel'], theme_color: T['--papel'], lang: 'es',
  icons: [{ src: 'favicon.png', sizes: '64x64', type: 'image/png' }]
}, null, 2) + '\n');
if (!existe('.nojekyll')) escribir('.nojekyll', '');

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
}
