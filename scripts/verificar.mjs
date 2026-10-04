/* verificar.mjs — todo lo que tiene que pasar antes de dar la web por buena
   (prompt común «Verificación», PLIEGO §7 y checklist de web desde cero).
   No sabe nada del municipio concreto: lee municipio.json y contenido/ para
   saber qué esperar, así que sirve igual después de un reskin.

     node scripts/verificar.mjs              todo
     node scripts/verificar.mjs --capturas   además guarda screenshots/
     node scripts/verificar.mjs --rapido     axe solo en la paleta real y sin el reskin */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';   /* v3b · servicio: la huella de los archivos de sw.js */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';   /* v3c · transparencia: pathToFileURL para importar lib/tablon.mjs */
import { cargarPlaywright } from './og.mjs';
import { crearServidor } from './servir.mjs';
import { derivarTokens, paletaGirada, contraste } from './lib/color.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CAPTURAS = args.includes('--capturas');
const RAPIDO = args.includes('--rapido');
const leer = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const M = JSON.parse(leer(RAIZ, 'municipio.json'));
const marca = JSON.parse(leer(RAIZ, 'marca', 'marca.json'));
const contenido = n => JSON.parse(leer(RAIZ, 'contenido', n + '.json'));
const SLUG = marca.slug;
const espera = ms => new Promise(r => setTimeout(r, ms));
if (CAPTURAS) fs.mkdirSync(path.join(RAIZ, 'screenshots'), { recursive: true });
const captura = n => path.join(RAIZ, 'screenshots', n);

const fallos = [], notas = [];
function comprobar(ok, mensaje) { (ok ? notas : fallos).push((ok ? 'OK   ' : 'FALLA') + ' · ' + mensaje); if (!ok) console.log('FALLA · ' + mensaje); }
const PAGINAS = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
const INTERIORES = PAGINAS.filter(p => p !== 'index.html');
const sedeBase = M.sede.base.replace(/\/$/, '');
const patronSede = M.sede.tipo === 'gestiona'
  ? new RegExp('^' + sedeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/(catalog/t/[0-9a-f-]{36}|board|transparency|contractor-profile-list|preview-document/[0-9a-f-]{36}))?$')
  : new RegExp('^' + sedeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/(portal|sede)/[A-Za-z]+\\.do\\?[\\w=&%.-]+)?$');

/* ═════════════ 1. comprobaciones sin navegador ═════════════ */
function estaticas() {
  for (const p of PAGINAS) {
    const h = leer(RAIZ, p);
    if (!/^<!DOCTYPE html>/.test(h)) comprobar(false, p + ': empieza por <!DOCTYPE html>');
  }
  const conNoindex = PAGINAS.filter(p => /<head>\s*<meta charset="utf-8">\s*<meta name="robots" content="noindex, nofollow">/.test(leer(RAIZ, p)));
  if (!M.indexar) comprobar(conNoindex.length === PAGINAS.length, `noindex, nofollow justo tras el charset en las ${PAGINAS.length} páginas` + (conNoindex.length < PAGINAS.length ? ' → falta en ' + PAGINAS.filter(p => !conNoindex.includes(p)).join(', ') : ''));
  if (M.propuesta !== false) {
    const sinBanda = PAGINAS.filter(p => { const h = leer(RAIZ, p); return !(h.includes('class="propuesta" data-propuesta') && h.includes('no es la web oficial')); });
    comprobar(!sinBanda.length, 'banda «Propuesta de diseño… no es la web oficial» en todas las páginas' + (sinBanda.length ? ' → falta en ' + sinBanda.join(', ') : ''));
    const og = PAGINAS.filter(p => leer(RAIZ, p).includes(`<meta property="og:title" content="Propuesta de web · ${M.nombre}">`));
    comprobar(og.length === PAGINAS.length, 'og:title «Propuesta de web · ' + M.nombre + '» en todas las páginas');
  }
  /* colores y letras solo en css/marca.css y css/fuentes.css */
  const colorLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
  const revisar = ['css/base.css', 'css/movimiento.css', 'js/main.js', 'js/vivo.js', 'js/cortina.js', 'js/movimiento.js', ...fs.readdirSync(path.join(RAIZ, 'fuente')).map(n => 'fuente/' + n)];
  const conColor = [], conLetra = [];
  for (const rel of revisar) leer(RAIZ, rel).split(/\r?\n/).forEach((l, i) => {
    const sinIds = l.replace(/url\(#[^)]*\)|href="#[^"]*"|'#[a-z][\w-]*'|"#[a-z][\w-]*"|#[a-z][\w-]*/gi, '');
    if (colorLiteral.test(sinIds)) conColor.push(rel + ':' + (i + 1));
    for (const f of [marca.letra.titulares, marca.letra.texto]) if (l.includes(f)) conLetra.push(rel + ':' + (i + 1));
  });
  comprobar(!conColor.length, 'ningún color escrito fuera de css/marca.css' + (conColor.length ? ' → ' + conColor.slice(0, 6).join(', ') : ''));
  comprobar(!conLetra.length, 'ninguna letra nombrada fuera de css/marca.css' + (conLetra.length ? ' → ' + conLetra.join(', ') : ''));
  /* contraste de cada pareja de tokens, en las tres paletas */
  for (const [clave, g] of [['A', 0], ['B', (marca.giros_paleta || [100, -100])[0]], ['C', (marca.giros_paleta || [100, -100])[1]]]) {
    const todas = derivarTokens(g ? paletaGirada(marca.colores, g) : marca.colores).informe, inf = todas.filter(f => f.ratio < f.min);
    comprobar(!inf.length, `paleta ${clave}: las ${todas.length} parejas de tokens llegan a su mínimo (4,5 texto, también en la banda oscura; 3 bordes y foco)` + (inf.length ? ' → ' + inf.map(f => f.texto + '/' + f.fondo + ' ' + f.ratio).join(', ') : ''));
  }
  /* enlaces de la sede con el patrón de su tipo */
  const malos = [];
  let total = 0;
  for (const p of PAGINAS) for (const [, href] of leer(RAIZ, p).matchAll(/href="([^"]+)"/g)) {
    const h = href.replace(/&amp;/g, '&');
    if (h.startsWith(sedeBase)) { total++; if (!patronSede.test(h)) malos.push(p + ': ' + h); }
  }
  /* como mínimo, cada trámite vigente enlazado una vez (Ribera tiene 111 en la sede; Monesterio, 25) */
  const minimo = Math.min(100, (M.tramites.todos || []).filter(t => t.vigente !== false && !/^(pdf|doc)$/.test(t.tipo || '')).length);
  comprobar(total >= minimo && !malos.length, `${total} enlaces a la sede, todos con el patrón de «${M.sede.tipo}»` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  /* textos de relleno */
  const relleno = PAGINAS.filter(p => /\[PENDIENTE|\bTODO\b|lorem ipsum|undefined|\bnull\b|NaN/.test(leer(RAIZ, p).replace(/<script[\s\S]*?<\/script>/g, '')));
  comprobar(!relleno.length, 'sin [PENDIENTE], TODO, «undefined», «null» ni relleno en el HTML' + (relleno.length ? ' → ' + relleno.join(', ') : ''));
  const base = leer(RAIZ, 'css', 'base.css');
  comprobar(/\.cookies:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex/.test(base) && !/\.cookies\s*\{[^}]*display:\s*flex/.test(base), 'cookies: display:flex solo en .cookies:not([hidden]) (memoria «cookie banner display:flex»)');
  const reglaMenu = (base.match(/html\.con-js \.menu \{[^}]+\}/) || [''])[0];
  comprobar(/height:\s*100dvh/.test(reglaMenu) && !/inset:\s*0/.test(reglaMenu), 'menú móvil con height:100dvh y sin inset:0 (memoria «backdrop-filter atrapa los fixed»)');
  const index = leer(RAIZ, 'index.html');
  const vers = [...index.matchAll(/\?v=[0-9a-f]{8}/g)].length, enAttr = [...index.matchAll(/(?:href|src)="[^"]+\?v=[0-9a-f]{8}"/g)].length;
  comprobar(vers >= 5 && vers === enAttr, `CSS y JS versionados con ?v=<huella> (${vers}), solo en href/src`);
  for (const f of ['favicon.svg', 'favicon.png', 'manifest.json', '.nojekyll', 'assets/og.jpg', '404.html', 'js/tramites-datos.js', 'css/fuentes.css'])
    comprobar(fs.existsSync(path.join(RAIZ, f)), 'existe ' + f);
  comprobar(!/gsap/.test(leer(RAIZ, 'tramites.html')) && /js\/vendor\/gsap\.min\.js[^"]*" defer/.test(index), 'GSAP solo en la portada y con defer');
  const ext = PAGINAS.filter(p => /(src|href)="https?:\/\/(?!www\.google\.com\/maps|policies\.google|www\.aepd)[^"]+\.(js|css|woff2?)/.test(leer(RAIZ, p)));
  comprobar(!ext.length, 'ni letras ni scripts de terceros: todo se sirve desde la propia web' + (ext.length ? ' → ' + ext.join(', ') : ''));
  try {
    const salida = execFileSync('python', [path.join(RAIZ, 'scripts/quitar_mandos.py'), '--comprobar'], { encoding: 'utf8' });
    comprobar(/✓ La receta de borrado funciona/.test(salida), 'quitar_mandos.py --comprobar: la receta de borrado funciona en una copia');
  } catch (e) { comprobar(false, 'quitar_mandos.py --comprobar → ' + (e.stdout || e.message).slice(-300)); }
  /* tablón: patrones de datos personales y fallo silencioso */
  const prueba = spawnSync('node', [path.join(RAIZ, 'scripts/tablon.mjs'), '--probar'], { encoding: 'utf8' });
  comprobar(prueba.status === 0, 'tablón: exclusiones por datos personales con entradas de prueba → ' + prueba.stdout.trim().split('\n').pop());
  const tmp = path.join(os.tmpdir(), 'tablon-prueba-' + process.pid + '.json');
  fs.copyFileSync(path.join(RAIZ, 'contenido/tablon.json'), tmp);
  const antes = fs.readFileSync(tmp, 'utf8');
  const caida = spawnSync('node', [path.join(RAIZ, 'scripts/tablon.mjs'), '--url', 'http://127.0.0.1:9/board', '--salida', tmp], { encoding: 'utf8' });
  comprobar(caida.status === 0 && fs.readFileSync(tmp, 'utf8') === antes && /Se queda/.test(caida.stdout), 'tablón: si la sede no responde, sale sin error y se queda el último tablon.json');
  fs.rmSync(tmp, { force: true });
}

/* ═════════════ 2. navegador ═════════════ */
const { chromium } = await cargarPlaywright();
const { AxeBuilder } = await import('@axe-core/playwright');
const navegador = await chromium.launch();
const servidor = crearServidor(RAIZ, M.url ? new URL(M.url).pathname : null);   /* la 404 lleva <base> con el prefijo de Pages */
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + servidor.address().port + '/';

async function nueva(op = {}) {
  const ctx = await navegador.newContext({
    viewport: op.viewport || { width: 1440, height: 900 }, deviceScaleFactor: op.escala || 1,
    reducedMotion: op.reducido === false ? 'no-preference' : 'reduce', locale: 'es-ES', timezoneId: 'Europe/Madrid'
  });
  await ctx.addInitScript(({ slug, o }) => {
    try {
      if (!o.conCookies) localStorage.setItem(slug + '-cookies', 'ok');
      if (o.densidad) localStorage.setItem(slug + '-densidad', o.densidad);
      if (o.paleta) localStorage.setItem(slug + '-paleta', o.paleta);
      if (!o.conCortina) sessionStorage.setItem(slug + '-cortina', '1');
    } catch (e) {}
  }, { slug: SLUG, o: op });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400 && !/google/.test(r.url())) errores.push(r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => { if (!/google|127\.0\.0\.1:9/.test(r.url())) errores.push('caída ' + r.url()); });
  return { ctx, page, errores };
}
const ir = async (page, p, extra = '') => { await page.goto(BASE + p + extra, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready); };

/* ── axe: 0 violaciones en todas las páginas, densidades y paletas ── */
async function axe() {
  const combinaciones = RAPIDO ? [['puerta', 'a'], ['sobria', 'a']] : [['puerta', 'a'], ['puerta', 'b'], ['puerta', 'c'], ['sobria', 'a'], ['sobria', 'b'], ['sobria', 'c']];
  for (const [densidad, paleta] of combinaciones) {
    const { ctx, page, errores } = await nueva({ densidad, paleta });
    const viol = [];
    for (const p of PAGINAS) {
      await ir(page, p, '?revision');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of r.violations) viol.push(`${p}: ${v.id} (${v.nodes.length}) ${v.nodes[0].target.join(' ')}`);
    }
    comprobar(!viol.length, `axe-core WCAG 2.1 A+AA: 0 violaciones en las ${PAGINAS.length} páginas · versión «${densidad}», paleta ${paleta.toUpperCase()}` + (viol.length ? '\n        ' + viol.slice(0, 10).join('\n        ') : ''));
    if (densidad === 'puerta' && paleta === 'a') comprobar(!errores.length, 'consola limpia y sin 404 en todas las páginas' + (errores.length ? ' → ' + [...new Set(errores)].slice(0, 5).join(' | ') : ''));
    await ctx.close();
  }
  /* estados que solo existen al usarse: móvil, menú abierto, buscador, cookies */
  const { ctx, page } = await nueva({ viewport: { width: 390, height: 844 }, conCookies: true });
  const viol = [];
  const pasar = async nombre => { const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); r.violations.forEach(v => viol.push(nombre + ': ' + v.id + ' ' + v.nodes[0].target.join(' '))); };
  await ir(page, 'index.html'); await pasar('móvil con el aviso de cookies');
  await page.click('[data-aceptar-cookies]');
  await page.click('[data-boton-menu]'); await pasar('menú móvil abierto');
  await page.keyboard.press('Escape');
  await page.click('[data-abrir-buscador]'); await page.fill('#buscador [data-buscador-campo]', 'empadronarme'); await espera(500); await pasar('buscador con resultados');
  await ctx.close();
  comprobar(!viol.length, 'axe-core: 0 violaciones en móvil con cookies, con el menú abierto y con el buscador' + (viol.length ? ' → ' + viol.join(' | ') : ''));
}

/* ── sin scroll horizontal en ningún ancho ni con zoom al 200 % ── */
async function desborde() {
  const tamanos = [[320, 640], [360, 640], [390, 844], [768, 1024], [1024, 768], [1440, 900], [640, 400, 2]];
  for (const [w, h, escala] of tamanos) {
    const { ctx, page } = await nueva({ viewport: { width: w, height: h }, escala });
    const malos = [];
    for (const p of PAGINAS) {
      await ir(page, p);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, fuera = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('.carril, [data-desborda], .tabla-envoltorio, .sprite, dialog, .sr, .cortina, .az__lista')) continue;   /* lo de dentro de un carril con scroll propio (v3: «Conocer», la tira del año y la fila A–Z del móvil) */
          /* lo de dentro de un SVG que recorta (el perfil del pie a 320 px, slice) no puede desbordar: se mide el SVG */
          if (el.ownerSVGElement && getComputedStyle(el.ownerSVGElement).overflow !== 'visible') continue;
          const b = el.getBoundingClientRect();
          if (b.width && b.right > W + 0.5) fuera.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
        }
        return { sobra: document.documentElement.scrollWidth - W, fuera };
      });
      if (r.sobra > 0 || r.fuera.length) malos.push(`${p} (+${r.sobra}px: ${r.fuera.slice(0, 3).join(', ')})`);
      if (p === 'index.html') {
        /* que no se pisen: el nombre de la cabecera y los botones (un nombre largo se monta sin salirse) */
        const pisa = await page.evaluate(() => {
          const n = document.querySelector('.cabecera__nombre').getBoundingClientRect(), a = document.querySelector('.cabecera__acciones').getBoundingClientRect();
          return n.right > a.left + 0.5 && n.bottom > a.top && n.top < a.bottom;
        });
        if (pisa) malos.push('index.html: el nombre de la cabecera pisa los botones');
      }
    }
    comprobar(!malos.length, `sin scroll horizontal a ${escala ? w * escala + ' px con zoom al 200 %' : w + ' px'} en las ${PAGINAS.length} páginas` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
    await ctx.close();
  }
}

/* ── teclado: se recorre todo y el foco siempre se ve (estilo medido) ── */
async function teclado() {
  for (const [w, h, paginas] of [[1440, 900, ['index.html', 'tramites.html', 'contacto.html']], [390, 844, ['index.html']]]) {
    const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
    for (const p of paginas) {
      await ir(page, p);
      const malos = [], vistos = new Set();
      let paradas = 0;
      for (let i = 0; i < 400; i++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el), b = el.getBoundingClientRect();
          let fondo = null;
          for (let n = el.parentElement; n; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { fondo = bg; break; } }
          return { id: el.outerHTML.slice(0, 90), w: b.width, h: b.height, visible: el.checkVisibility ? el.checkVisibility() : true,
            estilo: cs.outlineStyle, ancho: parseFloat(cs.outlineWidth), color: cs.outlineColor, fondo: fondo || getComputedStyle(document.body).backgroundColor, sombra: cs.boxShadow };
        });
        if (!f) break;
        if (vistos.has(f.id) && paradas > 5) break;
        vistos.add(f.id); paradas++;
        const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
        const hex = c => '#' + rgb(c).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
        const ok = f.visible && f.w > 0 && f.h > 0 && f.estilo !== 'none' && f.ancho >= 2 && contraste(hex(f.color), hex(f.fondo)) >= 3;
        if (!ok) malos.push(f.id.replace(/\s+/g, ' ') + ` (${f.estilo} ${f.ancho}px)`);
      }
      comprobar(paradas > 10 && !malos.length, `teclado en ${p} a ${w} px: ${paradas} paradas, foco visible con ≥ 2 px y ≥ 3:1 en todas` + (malos.length ? ' → ' + malos.slice(0, 3).join(' | ') : ''));
    }
    await ctx.close();
  }
  /* menú móvil: se abre, se recorre sin escaparse y se cierra con Esc (con la página bajada) */
  const { ctx, page } = await nueva({ viewport: { width: 390, height: 844 } });
  await ir(page, 'tramites.html');
  await page.mouse.wheel(0, 600); await espera(300);
  await page.click('[data-boton-menu]');
  const abierto = await page.evaluate(() => {
    const m = document.getElementById('menu'), b = m.getBoundingClientRect();
    return { exp: document.querySelector('[data-boton-menu]').getAttribute('aria-expanded'), top: b.top, alto: b.height, vh: innerHeight, foco: document.activeElement.className };
  });
  comprobar(abierto.exp === 'true' && Math.abs(abierto.top) < 1 && abierto.alto >= abierto.vh - 1 && /menu__enlace/.test(abierto.foco),
    `menú móvil: abre (aria-expanded=true), cubre la pantalla con la página bajada (top ${Math.round(abierto.top)}, alto ${Math.round(abierto.alto)}/${abierto.vh}) y lleva el foco dentro`);
  let fuera = 0;
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#menu')))) fuera++; }
  await page.keyboard.press('Escape');
  const cerrado = await page.evaluate(() => ({ exp: document.querySelector('[data-boton-menu]').getAttribute('aria-expanded'), visible: getComputedStyle(document.getElementById('menu')).display !== 'none', foco: document.activeElement.hasAttribute('data-boton-menu') }));
  comprobar(!fuera && cerrado.exp === 'false' && !cerrado.visible && cerrado.foco, 'menú móvil: el Tabulador no se escapa del panel y Esc lo cierra devolviendo el foco al botón');
  await ctx.close();
}

/* ── la cortina ── */
async function cortina() {
  /* a. sale, se traza poco a poco, se abre, aterriza en el arco y se va.
     Se mira como la vería un vecino: corriendo sola, muestreando mientras corre
     (pausar + capturar + saltar cuelga el headless de Chromium en este equipo). */
  /* el muestreo se engancha ANTES de que corra: en frío, la cortina acaba
     antes de que Playwright vuelva del goto */
  const enganche = pausaEn => {
    let tl;
    Object.defineProperty(window, '__cortinaTl', { configurable: true, get() { return tl; }, set(v) {
      tl = v; window.__muestras = [];
      const lado = document.querySelector('.cortina__lado'), anillo = document.querySelector('.cortina__anillo'), muro = document.querySelector('.cortina__muro');
      /* «puerta»: lo que falta por trazar del arco; «escudo»: lo que falta por abrir del círculo */
      const falta = () => lado ? parseFloat(getComputedStyle(lado).strokeDashoffset) : 1 - parseFloat(anillo.getAttribute('r')) / (Math.hypot(innerWidth, innerHeight) / 2 + 4);
      (function paso() {
        window.__muestras.push({ t: v.time(), dash: falta(), hueco: (muro.getAttribute('d').split('Z')[1] || '').length, duracion: v.duration() });
        if (document.documentElement.classList.contains('con-cortina') && window.__muestras.length < 600) requestAnimationFrame(paso);
      })();
      if (pausaEn) v.call(() => { v.pause(); window.__pausada = true; }, null, pausaEn);
    } });
  };
  let { ctx, page } = await nueva({ reducido: false, conCortina: true });
  await ctx.addInitScript(enganche, 0);
  await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('con-cortina'), null, { timeout: 5000 }).catch(() => {});
  const muestras = await page.evaluate(() => window.__muestras || []);
  const sale = muestras.length > 0;
  const intermedios = new Set(muestras.filter(m => m.dash > 0.02 && m.dash < 0.98).map(m => m.dash.toFixed(2))).size;
  const duracion = muestras[0] ? muestras[0].duracion : 99;
  const ESCUDO = marca.cortina === 'escudo';
  comprobar(sale && intermedios >= 3 && duracion <= 1.2001,
    `cortina «${ESCUDO ? 'escudo' : 'puerta'}»: sale en la portada, dura ${duracion.toFixed(2)} s (≤ 1,2) y ` +
    (ESCUDO ? `la cal se abre de verdad (${intermedios} radios intermedios del círculo` : `el arco se traza de verdad (${intermedios} valores intermedios de stroke-dashoffset`) +
    ` en ${muestras.length} fotogramas, no salta de 1 a 0)`);
  /* un fotograma a mitad: la propia línea de tiempo se para a 0,75 s */
  {
    const v = await nueva({ reducido: false, conCortina: true });
    await v.ctx.addInitScript(enganche, 0.75);
    await v.page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
    const parada = await v.page.waitForFunction(() => window.__pausada, null, { timeout: 5000 }).then(() => true, () => false);
    let ok = false, detalle = 'no llegó a 0,75 s';
    if (parada) {
      /* un punto que ya tiene que verse: dentro del hueco del arco, o bajo el centro del círculo
         (el escudo vuela hacia arriba, no tapa ese punto) */
      const geo = await v.page.evaluate(() => {
        const c = getComputedStyle(document.documentElement).getPropertyValue('--cortina').trim();
        const anillo = document.querySelector('.cortina__anillo');
        if (anillo) { const r = parseFloat(anillo.getAttribute('r')); return { x: parseFloat(anillo.getAttribute('cx')) - 20, base: parseFloat(anillo.getAttribute('cy')) + Math.min(r * 0.6, innerHeight * 0.3) + 12, cortina: c }; }
        const n = (document.querySelector('.cortina__muro').getAttribute('d').split('Z')[1] || '').match(/-?\d+(\.\d+)?/g).map(Number);
        return { x: n[0], base: n[1], arriba: n[3], ancho: (n[6] || n[2]) - n[0], cortina: c };
      });
      const foto = await v.page.screenshot({ path: CAPTURAS ? captura('cortina-mitad.png') : undefined });
      const lector = await v.ctx.newPage();
      const px = await lector.evaluate(async ({ b64, puntos }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return puntos.map(([x, y]) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
      }, { b64: foto.toString('base64'), puntos: [[6, 6], [geo.x + 20, geo.base - 12]] });
      const rgbHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const cort = rgbHex(geo.cortina);
      ok = dist(px[0], cort) < 8 && dist(px[1], cort) > 4;
      detalle = `esquina ${px[0]} (cortina ${cort}), dentro del hueco ${px[1]}`;
      await lector.close();
      await v.page.evaluate(() => window.__cortinaTl.play());
    }
    comprobar(ok, 'cortina: un fotograma a mitad (0,75 s) demuestra que se abre: la esquina es cortina y por el hueco ' + (ESCUDO ? 'del círculo' : 'del arco') + ' ya se ve la página → ' + detalle);
    await v.ctx.close();
  }
  await page.waitForFunction(() => !document.documentElement.classList.contains('con-cortina'), null, { timeout: 3000 }).catch(() => {});
  if (ESCUDO) {
    const at = await page.evaluate(() => {
      const f = window.__cortinaFinal || {}, b = document.querySelector('.cabecera__escudo').getBoundingClientRect();
      return { x: f.x, y: f.y, w: f.w, h: f.h, ex: b.left, ey: b.top, ew: b.width, eh: b.height };
    });
    comprobar(['x', 'y', 'w', 'h'].every(k => Math.abs(at[k] - at['e' + k]) < 2),
      `cortina: el escudo aterriza exactamente sobre el de la cabecera (x ${(+at.x).toFixed(1)}/${at.ex.toFixed(1)}, y ${(+at.y).toFixed(1)}/${at.ey.toFixed(1)}, ancho ${(+at.w).toFixed(1)}/${at.ew.toFixed(1)}, alto ${(+at.h).toFixed(1)}/${at.eh.toFixed(1)})`);
  } else {
    const aterriza = await page.evaluate(() => {
      const f = window.__cortinaFinal || {};
      const a = document.getElementById('arco-hero'), b = a.getBoundingClientRect(), borde = parseFloat(getComputedStyle(a).borderTopWidth);
      return { x: f.x, base: f.base, r: f.r, ex: b.left + borde / 2, ebase: b.bottom, er: (b.width - borde) / 2 };
    });
    comprobar(Math.abs(aterriza.x - aterriza.ex) < 2 && Math.abs(aterriza.base - aterriza.ebase) < 2 && Math.abs(aterriza.r - aterriza.er) < 2,
      `cortina: el hueco termina exactamente sobre el arco del hero (x ${(+aterriza.x).toFixed(1)}/${aterriza.ex.toFixed(1)}, base ${(+aterriza.base).toFixed(1)}/${aterriza.ebase.toFixed(1)}, radio ${(+aterriza.r).toFixed(1)}/${aterriza.er.toFixed(1)})`);
  }
  const fin = await page.evaluate(() => ({ clase: document.documentElement.classList.contains('con-cortina'), display: getComputedStyle(document.querySelector('.cortina')).display }));
  comprobar(!fin.clase && fin.display === 'none', 'cortina: al terminar desaparece (display:none) y la página queda libre');
  await page.reload({ waitUntil: 'networkidle' });
  comprobar(!(await page.evaluate(() => document.documentElement.classList.contains('con-cortina'))), 'cortina: una vez por sesión (al recargar no vuelve a salir)');
  await ctx.close();

  /* b. no sale en interiores, con movimiento reducido, sin sessionStorage */
  ({ ctx, page } = await nueva({ reducido: false, conCortina: true }));
  await page.goto(BASE + 'tramites.html', { waitUntil: 'domcontentloaded' });
  comprobar(!(await page.evaluate(() => document.documentElement.classList.contains('con-cortina') || !!document.querySelector('.cortina'))), 'cortina: no sale en las páginas interiores');
  await ctx.close();
  ({ ctx, page } = await nueva({ reducido: true, conCortina: true }));
  await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
  comprobar(!(await page.evaluate(() => document.documentElement.classList.contains('con-cortina'))) && (await page.evaluate(() => getComputedStyle(document.querySelector('.cortina')).display)) === 'none', 'cortina: con movimiento reducido no existe');
  await ctx.close();
  ({ ctx, page } = await nueva({ reducido: false, conCortina: true }));
  await ctx.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('bloqueado'); } }); });
  await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
  comprobar(!(await page.evaluate(() => document.documentElement.classList.contains('con-cortina'))), 'cortina: si sessionStorage falla, no se enseña');
  await ctx.close();

  /* c. retirada garantizada: sin GSAP y sin cortina.js */
  for (const [que, patron] of [['GSAP', '**/js/vendor/gsap.min.js*'], ['js/cortina.js', '**/js/cortina.js*']]) {
    ({ ctx, page } = await nueva({ reducido: false, conCortina: true }));
    await page.route(patron, r => r.abort());
    const t0 = Date.now();
    await page.goto(BASE + 'index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('con-cortina'), null, { timeout: 3000 }).catch(() => {});
    const quitada = !(await page.evaluate(() => document.documentElement.classList.contains('con-cortina')));
    comprobar(quitada && Date.now() - t0 < 2500, `cortina: sin ${que} (petición bloqueada) se retira sola y la página se lee`);
    if (CAPTURAS && que === 'GSAP') await page.screenshot({ path: captura('sin-gsap.png') });
    await ctx.close();
  }
  /* d. se salta con la rueda */
  ({ ctx, page } = await nueva({ reducido: false, conCortina: true }));
  await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cortinaTl, null, { timeout: 4000 });
  await page.mouse.move(700, 450); await page.mouse.wheel(0, 200);
  await espera(150);
  comprobar(!(await page.evaluate(() => document.documentElement.classList.contains('con-cortina'))), 'cortina: la rueda (o un clic o una tecla) la salta');
  await ctx.close();
}

/* ── movimiento (css/movimiento.css y js/movimiento.js) ──
   Con movimiento reducido no hay nada que se mueva y todo se ve; con
   movimiento, nada se queda a medias: tras bajar hasta el final ningún texto
   queda apagado ni desplazado, y el menú, el buscador, el tablón y las
   transiciones de página siguen respondiendo igual. */
async function movimiento() {
  /* solo las animaciones de reloj (las ligadas al scroll no «corren»: valen lo que dice el scroll) */
  const deReloj = () => document.getAnimations().filter(a => a.timeline === document.timeline && a.playState !== 'finished')
    .map(a => (a.animationName || a.transitionProperty || 'waapi') + (a.effect && a.effect.pseudoElement ? a.effect.pseudoElement : ''));
  /* a. reducido: quieto, completo y sin animaciones ni al usarse */
  {
    const { ctx, page } = await nueva({ viewport: { width: 390, height: 844 } });
    const malos = [];
    for (const p of ['index.html', 'ayuntamiento.html', 'tramites.html']) {
      await ir(page, p);
      await espera(200);
      const r = await page.evaluate(deReloj);
      if (r.length) malos.push(p + ' al cargar: ' + r.join(', '));
      const quietos = await page.evaluate(() => {
        const mal = [];
        for (const h of document.querySelectorAll('.seccion__titulo')) { if (getComputedStyle(h).translate !== 'none') mal.push('h2 desplazado'); if (!/^(none|1)$/.test(getComputedStyle(h, '::before').scale)) mal.push('raya sin dibujar'); }
        for (const c of document.querySelectorAll('.pleno__figura circle')) if (getComputedStyle(c).scale !== 'none') mal.push('escaño');
        for (const f of document.querySelectorAll('.hoy__fila')) if (getComputedStyle(f).transform !== 'none') mal.push('fila de «Hoy»');
        if (document.querySelector('.mov-escanos, .mov-tablon')) mal.push('clase de movimiento puesta');
        return [...new Set(mal)];
      });
      if (quietos.length) malos.push(p + ': ' + quietos.join(', '));
    }
    await ir(page, 'index.html');
    await page.hover('.atajo'); await page.focus('.ver-todo');
    let r = await page.evaluate(deReloj);
    if (r.length) malos.push('hover/foco: ' + r.join(', '));
    await page.click('[data-boton-menu]');
    r = await page.evaluate(deReloj);
    if (r.length) malos.push('menú: ' + r.join(', '));
    await page.keyboard.press('Escape');
    await page.click('[data-abrir-buscador]');
    r = await page.evaluate(deReloj);
    if (r.length) malos.push('buscador: ' + r.join(', '));
    await page.keyboard.press('Escape');
    await ir(page, 'tramites.html');
    /* el desplegable se abre entero en el mismo fotograma */
    r = await page.evaluate(() => {
      const d = document.querySelector('details.tema:not([open])');
      if (!d) return [];
      d.querySelector('summary').click();
      const ul = d.querySelector('.tema__lista'), cont = getComputedStyle(d, '::details-content').blockSize;
      return ul && d.getBoundingClientRect().bottom >= ul.getBoundingClientRect().bottom - 1 && cont !== '0px' ? [] : ['se abre a medias (' + cont + ')'];
    });
    if (r.length) malos.push('desplegable: ' + r.join(', '));
    await ctx.close();
    comprobar(!malos.length, 'movimiento reducido: ninguna animación ni transición al cargar ni al usar menú, buscador, hover y foco; títulos, rayas, escaños y filas de «Hoy» en su sitio' + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }
  /* b. con movimiento: bajar hasta el final con la rueda y que nada se quede a medias */
  {
    const { ctx, page } = await nueva({ reducido: false });
    const malos = [], bucles = [];
    for (const p of ['index.html', 'ayuntamiento.html', 'agenda.html', 'noticias.html', 'tramites.html', 'pueblo.html', 'telefonos.html']) {
      await ir(page, p);
      await page.mouse.move(720, 450);
      for (let i = 0; i < 80; i++) {
        await page.mouse.wheel(0, 500); await espera(40);
        if (await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)) break;
      }
      await espera(1500);
      const r = await page.evaluate(() => {
        const mal = [];
        const desplazado = el => {   /* opacidad acumulada y desplazamiento vertical de los antepasados */
          let op = 1, dy = 0;
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            op *= parseFloat(cs.opacity);
            const t = cs.translate.split(' ');
            if (t[1]) dy += parseFloat(t[1]);
            const m = cs.transform.match(/matrix\(([^)]+)\)/);
            if (m) dy += parseFloat(m[1].split(',')[5]);
          }
          return { op, dy };
        };
        for (const el of document.querySelectorAll('main *, footer *')) {
          if (el.closest('.sr, svg, script, dialog')) continue;
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          if (!el.checkVisibility()) continue;
          const { op, dy } = desplazado(el);
          if (op < 0.99 || Math.abs(dy) > 0.5) mal.push(el.tagName.toLowerCase() + '.' + (el.className || '') + ` (opacidad ${op.toFixed(2)}, ${dy.toFixed(1)} px): «${el.textContent.trim().slice(0, 30)}»`);
        }
        for (const h of document.querySelectorAll('.seccion__titulo')) if (!/^(none|1|1 1)$/.test(getComputedStyle(h, '::before').scale) && getComputedStyle(h, '::before').display !== 'none') mal.push('raya a medias: ' + h.textContent.trim().slice(0, 30));
        for (const c of document.querySelectorAll('.pleno__figura circle')) if (getComputedStyle(c).scale !== 'none') { mal.push('escaño a medias'); break; }
        const l = document.querySelector('.linea');
        if (l && !/^(none|1|1 1)$/.test(getComputedStyle(l, '::before').scale)) mal.push('línea de tiempo a medias: ' + getComputedStyle(l, '::before').scale);
        const infinitas = document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations > 3).map(a => a.animationName || 'waapi');
        return { mal, infinitas };
      });
      r.mal.forEach(m => malos.push(p + ': ' + m));
      r.infinitas.forEach(m => bucles.push(p + ': ' + m));
    }
    await ctx.close();
    comprobar(!malos.length, 'con movimiento, tras bajar hasta el final con la rueda: ningún texto apagado (opacity < 1) ni desplazado, y rayas, línea de tiempo y escaños dibujados del todo' + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
    comprobar(!bucles.length, 'con movimiento: ninguna animación de más de 3 repeticiones (WCAG 2.2.2)' + (bucles.length ? ' → ' + bucles.slice(0, 4).join(' | ') : ''));
  }
  /* c. con movimiento: menú móvil y buscador abren y cierran con el foco donde toca */
  {
    const { ctx, page } = await nueva({ reducido: false, viewport: { width: 390, height: 844 } });
    await ir(page, 'tramites.html');
    await page.mouse.wheel(0, 600); await espera(300);
    await page.click('[data-boton-menu]');
    const a0 = await page.evaluate(() => ({ exp: document.querySelector('[data-boton-menu]').getAttribute('aria-expanded'), foco: !!document.activeElement.closest('#menu') }));
    await espera(500);
    const a1 = await page.evaluate(() => { const b = document.getElementById('menu').getBoundingClientRect(); return { top: b.top, alto: b.height, vh: innerHeight, clip: getComputedStyle(document.getElementById('menu')).clipPath }; });
    let fuera = 0;
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#menu')))) fuera++; }
    await page.keyboard.press('Escape');
    const c0 = await page.evaluate(() => ({ exp: document.querySelector('[data-boton-menu]').getAttribute('aria-expanded'), foco: document.activeElement.hasAttribute('data-boton-menu') }));
    await espera(500);
    const c1 = await page.evaluate(() => getComputedStyle(document.getElementById('menu')).display);
    comprobar(a0.exp === 'true' && a0.foco && Math.abs(a1.top) < 1 && a1.alto >= a1.vh - 1 && /inset\(0px\)|none/.test(a1.clip) && !fuera && c0.exp === 'false' && c0.foco && c1 === 'none',
      `con movimiento, menú móvil: abre con el foco dentro, termina cubriendo la pantalla (clip ${a1.clip}), el Tabulador no se escapa y Esc lo cierra devolviendo el foco (display ${c1} al acabar)`);
    await ir(page, 'index.html');
    await page.click('[data-abrir-buscador]');
    const b0 = await page.evaluate(() => ({ open: document.getElementById('buscador').open, foco: document.activeElement.matches('[data-buscador-campo]') }));
    await espera(400);
    const b1 = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('buscador')); return { scale: cs.scale, op: cs.opacity }; });
    await page.keyboard.press('Escape');
    const b2 = await page.evaluate(() => ({ open: document.getElementById('buscador').open, foco: document.activeElement.hasAttribute('data-abrir-buscador') }));
    await espera(400);
    const b3 = await page.evaluate(() => getComputedStyle(document.getElementById('buscador')).display);
    comprobar(b0.open && b0.foco && /^(1|none)$/.test(b1.scale) && b1.op === '1' && !b2.open && b2.foco && b3 === 'none',
      `con movimiento, buscador: abre con el foco en el campo, llega a escala ${b1.scale} y opacidad ${b1.op}, Esc lo cierra y devuelve el foco a la lupa (display ${b3} al acabar)`);
    await ctx.close();
  }
  /* d. con movimiento: el tablón filtra con View Transition y sigue contando bien */
  {
    const { ctx, page } = await nueva({ reducido: false });
    await ir(page, 'avisos.html');
    const r = await page.evaluate(async () => {
      const caja = document.querySelector('[data-vivo="tablon"]');
      const lim = Number(caja.getAttribute('data-limite')) || Infinity, out = [];
      for (const b of caja.querySelectorAll('.filtro')) {
        b.click();
        await new Promise(r => setTimeout(r, 500));
        const tema = b.getAttribute('data-tema'), filas = [...caja.querySelectorAll('.tablon__fila')];
        const vis = filas.filter(f => f.getBoundingClientRect().height > 0).length;
        const esperadas = Math.min(lim, filas.filter(f => !tema || f.getAttribute('data-tema') === tema).length);
        out.push({ ok: vis === esperadas && b.getAttribute('aria-pressed') === 'true' && caja.querySelector('.tablon__cuenta').textContent.includes(String(vis)) && !filas.some(f => f.style.viewTransitionName) && !document.documentElement.classList.contains('mov-tablon'), tema: tema || 'Todos', vis });
      }
      return { out, vt: typeof document.startViewTransition === 'function' };
    });
    const malos = r.out.filter(x => !x.ok);
    comprobar(r.out.length > 2 && !malos.length, `con movimiento, tablón: ${r.out.length} filtros${r.vt ? ' con View Transition' : ''}, cada uno enseña y cuenta lo suyo y no deja nombres de transición puestos` + (malos.length ? ' → ' + JSON.stringify(malos[0]) : ''));
    await ctx.close();
  }
  /* e. transiciones entre páginas: la foto viaja del listado al artículo; con cortina, se salta */
  {
    const vigilar = () => {
      window.__vt = 'sin evento';
      addEventListener('pagereveal', e => {
        if (!e.viewTransition) { window.__vt = 'sin transición'; return; }
        e.viewTransition.ready.then(() => { window.__vt = 'lista'; window.__grupos = [...new Set(document.getAnimations().map(a => a.effect && a.effect.pseudoElement).filter(Boolean))]; }, () => { window.__vt = 'saltada'; });
      });
    };
    let { ctx, page } = await nueva({ reducido: false });
    await ctx.addInitScript(vigilar);
    await ir(page, 'noticias.html');
    const conFoto = page.locator('.noticia:has(.noticia__foto) .noticia__titulo a').first();
    if (await conFoto.count()) {
      const id = (await conFoto.getAttribute('href')).replace(/^noticia-|\.html$/g, '');
      await conFoto.click();
      await page.waitForLoadState('networkidle'); await espera(200);
      const r = await page.evaluate(() => ({ vt: window.__vt, grupos: window.__grupos || [] }));
      comprobar(r.vt === 'lista' && r.grupos.includes('::view-transition-group(noticia-' + id + ')'),
        `transición entre páginas: del listado al artículo la foto «${id}» tiene su propio grupo y viaja (${r.vt})`);
    } else notas.push('NOTA  · transición entre páginas: ninguna noticia lleva foto, no se prueba el viaje de la foto');
    await ctx.close();
    ({ ctx, page } = await nueva({ reducido: false, conCortina: true }));
    await ctx.addInitScript(vigilar);
    await ir(page, 'tramites.html');
    await page.click('.cabecera__marca');
    await page.waitForFunction(() => window.__cortinaFinal, null, { timeout: 5000 }).catch(() => {});
    await espera(1200);
    const r = await page.evaluate(() => {
      const img = document.querySelector('#arco-hero img');
      return { vt: window.__vt, final: !!window.__cortinaFinal, clase: document.documentElement.classList.contains('con-cortina'),
        img: img ? getComputedStyle(img).transform : 'none', filas: [...document.querySelectorAll('.hoy__fila')].map(f => getComputedStyle(f).transform).filter(t => t !== 'none').length };
    });
    comprobar(r.vt === 'saltada' && r.final && !r.clase && r.img === 'none' && !r.filas,
      `transición entre páginas: al llegar a la portada con cortina, la transición se salta (${r.vt}), la cortina aterriza y después la foto queda asentada (transform ${r.img}) y las filas de «Hoy» en su sitio`);
    await ctx.close();
  }
}

/* ── «Abierto ahora» con la fecha simulada ── */
async function abierto() {
  const casos = [['2026-10-06T10:00:00+02:00', 'martes 10:00'], ['2026-10-04T12:00:00+02:00', 'domingo 12:00']];
  const textos = [];
  for (const [fecha] of casos) {
    const { ctx, page } = await nueva();
    await page.clock.setFixedTime(new Date(fecha));
    await ir(page, 'index.html');
    textos.push(await page.evaluate(() => { const e = document.querySelector('.hoy__estado'); return { clase: e.className, texto: e.textContent.trim() }; }));
    await ctx.close();
  }
  comprobar(/esta-abierto/.test(textos[0].clase) && /^Abierto ahora/.test(textos[0].texto), `«Abierto ahora» un martes a las 10:00 → «${textos[0].texto}»`);
  comprobar(/esta-cerrado/.test(textos[1].clase) && /^Cerrado ahora/.test(textos[1].texto) && textos[0].texto !== textos[1].texto, `un domingo sale cerrado y el texto cambia → «${textos[1].texto}»`);
}

/* ── tablón: filtros que cuentan filas VISIBLES, respaldo y hoja ── */
async function tablon() {
  const { ctx, page } = await nueva();
  for (const p of ['index.html', 'avisos.html']) {
    await ir(page, p);
    const r = await page.evaluate(async () => {
      const caja = document.querySelector('[data-vivo="tablon"]');
      const lim = Number(caja.getAttribute('data-limite')) || Infinity;
      const out = [];
      for (const b of caja.querySelectorAll('.filtro')) {
        b.click();
        await new Promise(r => setTimeout(r, 30));
        const tema = b.getAttribute('data-tema');
        const filas = [...caja.querySelectorAll('.tablon__fila')];
        const visibles = filas.filter(f => f.getBoundingClientRect().height > 0);
        const esperadas = Math.min(lim, filas.filter(f => !tema || f.getAttribute('data-tema') === tema).length);
        out.push({ tema: tema || 'Todos', visibles: visibles.length, esperadas, buenas: visibles.every(f => !tema || f.getAttribute('data-tema') === tema), pulsado: b.getAttribute('aria-pressed'), cuenta: caja.querySelector('.tablon__cuenta').textContent });
      }
      return out;
    });
    const malos = r.filter(x => x.visibles !== x.esperadas || !x.buenas || x.pulsado !== 'true' || !x.cuenta.includes(String(x.visibles)));
    comprobar(r.length > 2 && !malos.length, `tablón de ${p}: ${r.length} filtros, cada uno enseña las filas visibles que tocan y lo cuenta (${r.map(x => x.tema + ' ' + x.visibles).join(', ')})` + (malos.length ? ' → ' + JSON.stringify(malos[0]) : ''));
  }
  await ctx.close();

  /* respaldo si el tablón no se puede refrescar; y si llega uno nuevo, se pinta */
  let x = await nueva();
  let pedido = false;
  await x.page.route('**/contenido/tablon.json*', r => { pedido = true; r.abort(); });
  await ir(x.page, 'index.html');
  const filasCaida = await x.page.evaluate(() => [...document.querySelectorAll('[data-vivo="tablon"] .tablon__fila')].filter(f => f.getBoundingClientRect().height > 0).length);
  comprobar(pedido && filasCaida > 0, `tablón: si el refresco falla (route.abort), se queda el respaldo pintado (${filasCaida} filas)`);
  await x.ctx.close();
  x = await nueva();
  const t = contenido('tablon');
  const nuevo = { ...t, actualizado: '2999-01-01T00:00:00Z', entradas: [{ fecha: '2026-10-02', tema: 'Prueba', titulo: 'ANUNCIO DE PRUEBA', titulo_claro: 'Anuncio que llega al refrescar', url: sedeBase + (M.sede.tipo === 'gestiona' ? '/board' : ''), oculto: false }, ...t.entradas] };
  await x.page.route('**/contenido/tablon.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(nuevo) }));
  await ir(x.page, 'index.html');
  comprobar(await x.page.evaluate(() => document.querySelector('[data-vivo="tablon"]').textContent.includes('Anuncio que llega al refrescar')), 'tablón: un tablon.json más nuevo se pinta sin regenerar la página');
  await x.ctx.close();

  /* hoja de cálculo: se fusiona si contesta; si no, el respaldo */
  for (const modo of ['contesta', 'cae']) {
    x = await nueva();
    let pidio = false;
    await x.page.route('**/index.html', async r => {
      const resp = await r.fetch(); let cuerpo = await resp.text();
      cuerpo = cuerpo.replace('"hoja":null', '"hoja":{"id":"HOJA-DE-PRUEBA","pestanas":{"avisos":"Avisos"}}');
      r.fulfill({ response: resp, body: cuerpo });
    });
    await x.page.route('https://docs.google.com/**', r => {
      pidio = true;
      if (modo === 'cae') return r.abort();
      const datos = { table: { cols: [{ label: 'id' }, { label: 'fecha' }, { label: 'tema' }, { label: 'titulo' }, { label: 'texto' }],
        rows: [{ c: [{ v: 'desde-la-hoja' }, { v: 'Date(2026,9,2)' }, { v: 'Prueba' }, { v: 'Aviso publicado desde la hoja' }, { v: 'Texto' }] }] } };
      r.fulfill({ contentType: 'text/plain', body: '/*O_o*/\ngoogle.visualization.Query.setResponse(' + JSON.stringify(datos) + ');' });
    });
    await ir(x.page, 'index.html');
    await espera(300);
    const r = await x.page.evaluate(() => ({ hay: document.querySelector('[data-vivo="tablon"]').textContent.includes('Aviso publicado desde la hoja'), filas: document.querySelectorAll('[data-vivo="tablon"] .tablon__fila').length }));
    if (modo === 'contesta') comprobar(pidio && r.hay, 'hoja de cálculo: si la hoja contesta, su aviso se fusiona con el respaldo');
    else comprobar(pidio && !r.hay && r.filas > 0, 'hoja de cálculo: si la hoja cae (route.abort), se queda el respaldo sin errores a la vista');
    await x.ctx.close();
  }
}

/* ── panel «Hoy»: farmacia de guardia, el tiempo, pleno, recogida, canal y .ics ──
   La lógica se prueba con vivo.js en Node (como lo ejecuta aplicar.mjs), con fechas
   simuladas; luego, en el navegador, con el reloj de Playwright. */
const cargarVivo = () => { const c = { window: {}, Intl, Date }; vm.runInNewContext(leer(RAIZ, 'js', 'vivo.js'), c); return c.window.Vivo; };
/* un .ics válido según RFC 5545: CRLF y nada más, líneas de ≤ 75 octetos, bloques cerrados, UID, DTSTAMP y DTSTART */
function icsValido(txt) {
  const mal = [];
  if (!txt.endsWith('\r\n') || /[^\r]\n|\r(?!\n)/.test(txt)) mal.push('saltos que no son CRLF');
  const lineas = txt.slice(0, -2).split('\r\n');
  const largas = lineas.filter(l => Buffer.byteLength(l, 'utf8') > 75);
  if (largas.length) mal.push(largas.length + ' líneas de más de 75 octetos');
  const desplegado = txt.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
  const pila = [];
  for (const l of desplegado) {
    const b = /^BEGIN:(\w+)$/.exec(l), e = /^END:(\w+)$/.exec(l);
    if (b) pila.push(b[1]); else if (e && pila.pop() !== e[1]) mal.push('END:' + e[1] + ' sin su BEGIN');
  }
  if (pila.length) mal.push('sin cerrar: ' + pila.join(', '));
  if (desplegado[0] !== 'BEGIN:VCALENDAR' || !desplegado.includes('VERSION:2.0') || !desplegado.some(l => /^PRODID:/.test(l))) mal.push('cabecera VCALENDAR');
  const uid = desplegado.find(l => /^UID:\S+@\S+$/.test(l)), sello = desplegado.find(l => /^DTSTAMP:\d{8}T\d{6}Z$/.test(l));
  const ini = desplegado.find(l => /^DTSTART(;TZID=Europe\/Madrid:\d{8}T\d{6}|;VALUE=DATE:\d{8})$/.test(l));
  if (!uid) mal.push('UID'); if (!sello) mal.push('DTSTAMP'); if (!ini) mal.push('DTSTART');
  if (ini && /TZID/.test(ini) && !desplegado.includes('BEGIN:VTIMEZONE')) mal.push('TZID sin VTIMEZONE');
  if (!desplegado.some(l => /^SUMMARY:/.test(l))) mal.push('SUMMARY');
  return { ok: !mal.length, mal, uid, desplegado };
}
async function panelHoy() {
  const V = cargarVivo();
  const en = iso => V.ahoraEn('Europe/Madrid', new Date(iso));
  const rutas = { tramites: 'tramites.html', avisos: 'avisos.html', agenda: 'agenda.html', noticia: 'noticia-{id}.html', media: 'media/' };
  const base = { slug: 'prueba', nombre: 'Pueblo de Prueba', nombre_corto: 'Prueba', zona: 'Europe/Madrid', horario: { texto: 'L-V', tramos: [] }, avisos: [], agenda: [], noticias: [], tablon: { entradas: [] }, rutas, tramites_sede: 1 };
  const hoyDe = (extra, iso) => V.pintar('hoy', { ...base, ...extra }, en(iso || '2026-10-14T10:00:00+02:00'));

  /* 1. sin datos no sale nada nuevo, ni un hueco */
  const vacio = hoyDe({});
  comprobar(!/Farmacia de guardia|Más hoy|hoy__canal|hoy__breve/.test(vacio), 'panel «Hoy»: sin datos no salen la farmacia, «Más hoy» ni el canal de avisos (ningún hueco)');

  /* 2. farmacia de guardia y la frontera del cambio (09:30): rotación semanal y una fecha suelta que manda */
  const F = { lista: [{ id: 'a', nombre: 'Farmacia A' }, { id: 'b', nombre: 'Farmacia B', telefono: '900 000 001' }, { id: 'c', nombre: 'Farmacia C', localidad: 'Pueblo vecino' }],
    cambio: '09:30', rotacion: { inicio: '2026-10-05', dias: 7, orden: ['a', 'b'] }, guardias: [{ desde: '2026-10-20', hasta: '2026-10-20', farmacia: 'c' }] };
  const casos = [['2026-10-12T09:29:00+02:00', 'a', '2026-10-12'], ['2026-10-12T09:30:00+02:00', 'b', '2026-10-19'], ['2026-10-05T09:29:00+02:00', 'b', '2026-10-05'],
    ['2026-10-20T09:29:00+02:00', 'a', '2026-10-26'], ['2026-10-20T09:30:00+02:00', 'c', '2026-10-21'], ['2026-10-21T09:29:00+02:00', 'c', '2026-10-21'], ['2026-10-21T09:30:00+02:00', 'a', '2026-10-26'],
    ['2026-03-29T09:45:00+02:00', 'a', '2026-03-30']];      /* el día del cambio de hora, y antes del inicio de la rotación */
  const malF = casos.map(([iso, id, hasta]) => { const g = V.farmaciaDeGuardia(F, en(iso)); return g && g.farmacia.id === id && g.hasta === hasta ? null : `${iso}: ${g ? g.farmacia.id + ' hasta ' + g.hasta : 'nada'} (esperaba ${id} hasta ${hasta})`; }).filter(Boolean);
  const h1 = hoyDe({ farmacias: F }, '2026-10-12T09:29:00+02:00'), h2 = hoyDe({ farmacias: F }, '2026-10-12T09:30:00+02:00');
  const h3 = hoyDe({ farmacias: F }, '2026-10-20T12:00:00+02:00');
  if (!/Farmacia A/.test(h1) || !/hasta hoy a las 9:30/.test(h1)) malF.push('09:29 pinta: ' + (h1.match(/Farmacia de guardia.*?<\/li>/) || [''])[0].replace(/<[^>]+>/g, ' '));
  if (!/Farmacia B/.test(h2) || !/href="tel:\+34900000001"/.test(h2) || !/hasta el lunes 19 de octubre a las 9:30/.test(h2)) malF.push('09:30 pinta: ' + (h2.match(/Farmacia de guardia.*?<\/li>/) || [''])[0].replace(/<[^>]+>/g, ' '));
  if (!/Farmacia C/.test(h3) || !/Pueblo vecino/.test(h3) || !/hasta mañana a las 9:30/.test(h3)) malF.push('fecha suelta pinta: ' + (h3.match(/Farmacia de guardia.*?<\/li>/) || [''])[0].replace(/<[^>]+>/g, ' '));
  const soloOficial = hoyDe({ farmacias: { lista: [], oficial: { nombre: 'Colegio de prueba', url: 'https://example.org/g' } } });
  if (!/Consulte la de hoy en la web del Colegio de prueba/.test(soloOficial)) malF.push('sin farmacia propia no sale el enlace oficial');
  if (/Farmacia de guardia/.test(hoyDe({ farmacias: { lista: [{ id: 'a', nombre: 'A' }], rotacion: null, guardias: [] } }))) malF.push('sin guardia que cubra el día ni fuente oficial, la fila sale igual');
  comprobar(!malF.length, `farmacia de guardia: la de hoy según fecha y hora, con el cambio a las 9:30 (a las 9:29 sigue la de ayer), una fecha suelta manda sobre la rotación, teléfono con tel: y, sin farmacia propia, el enlace a la fuente oficial (${casos.length} fechas simuladas)` + (malF.length ? ' → ' + malF.join(' | ') : ''));

  /* 3. el tiempo, el próximo pleno, la recogida y el canal */
  const R = [{ id: 'enseres', nombre: 'Recogida de enseres', dias: [3], como: 'Pídala antes', telefono: '900 000 002' }];
  const extra = { tiempo: { url: 'https://www.aemet.es/es/eltiempo/prediccion/municipios/pueblo-de-prueba-id06999', lugar: 'Pueblo de Prueba' }, recogida: R, canal: { nombre: 'Canal de prueba', url: 'https://example.org/c' },
    agenda: [{ id: 'pleno-2026-10-29', fecha: '2026-10-29', hora: '20:00', titulo: 'Pleno ordinario', tipo: 'pleno', ics: 'ics/pleno-2026-10-29.ics' }, { id: 'feria', fecha: '2026-11-02', titulo: 'Feria' }] };
  const miercoles = hoyDe(extra, '2026-10-14T10:00:00+02:00'), martes = hoyDe(extra, '2026-10-13T10:00:00+02:00');
  const lineaAg = (miercoles.match(/Lo próximo en la agenda.*?<\/li><\/ul>/) || [''])[0];
  const malM = [];
  if (!/Más hoy/.test(miercoles) || !/id06999/.test(miercoles)) malM.push('el tiempo');
  /* v3: el próximo pleno y el canal, con su detalle, van en el lado del tablón; en «Hoy», el pleno solo el mismo día */
  const ladoDe = (x, iso) => V.pintar('lado', { ...base, ...x }, en(iso || '2026-10-14T10:00:00+02:00'));
  const ladoMie = ladoDe(extra), elDia = hoyDe(extra, '2026-10-29T10:00:00+02:00');
  if (/Próximo pleno/.test(miercoles) || !/Próximo pleno:/.test(elDia) || !/Próximo pleno.*Jueves 29 de octubre, 20:00/.test(ladoMie) || !/href="ics\/pleno-2026-10-29\.ics"/.test(ladoMie) || /Pleno ordinario/.test(lineaAg)) malM.push('pleno (en el lado con su .ics; en «Más hoy» solo el mismo día; no repetido en la agenda)');
  if (!/Recogida de enseres:<\/b> toca hoy/.test(miercoles) || !/Recogida de enseres:<\/b> la próxima, mañana/.test(martes)) malM.push('recogida: «toca hoy» el miércoles y «la próxima, mañana» el martes');
  if (/hoy__canal/.test(miercoles) || !/lado__bloque--canal.*Canal de prueba.*avisos\.html#t-canal/.test(ladoMie)) malM.push('canal de avisos en el lado (y no repetido en el panel)');
  const pasado = { ...extra, agenda: [{ ...extra.agenda[0], fecha: '2026-10-01' }] };
  if (/Próximo pleno/.test(hoyDe(pasado)) || /Próximo pleno/.test(ladoDe(pasado))) malM.push('un pleno ya celebrado sale como próximo');
  comprobar(!malM.length, 'panel «Hoy» → «Más hoy»: el enlace de AEMET, la recogida («toca hoy» / «la próxima, mañana») y el pleno solo el mismo día; el próximo pleno (con «Añadir a mi calendario» y sin repetirse en la agenda) y el canal de avisos con «Cómo apuntarse», en el lado del tablón' + (malM.length ? ' → ' + malM.join(' | ') : ''));

  /* 4. .ics: el generador con un título que hay que escapar y doblar, y todos los archivos escritos */
  const largo = { id: 'feria, de; prueba', fecha: '2026-12-31', hora: '23:30', titulo: 'Feria, mercado; y baile \\ con tildes: «Ñandú» áéíóú '.repeat(3).trim(), lugar: 'Plaza, 1', nota: 'Línea uno\nLínea dos' };
  const t1 = icsValido(V.ics(largo, base, new Date('2026-10-03T10:00:00Z'))), t2 = icsValido(V.ics({ id: 'dia', fecha: '2026-11-12', titulo: 'Todo el día' }, base));
  const malI = [...t1.mal, ...t2.mal.map(m => 'día entero: ' + m)];
  if (!t1.desplegado.some(l => l.startsWith('SUMMARY:Feria\\, mercado\\; y baile \\\\ con tildes'))) malI.push('escapado de , ; \\');
  if (!t1.desplegado.includes('DESCRIPTION:Línea uno\\nLínea dos')) malI.push('salto de línea en DESCRIPTION');
  if (!t1.desplegado.includes('DTEND;TZID=Europe/Madrid:20270101T003000')) malI.push('DTEND que pasa de medianoche');
  if (!t2.desplegado.includes('DTSTART;VALUE=DATE:20261112') || !t2.desplegado.includes('DTEND;VALUE=DATE:20261113')) malI.push('día entero con VALUE=DATE');
  if (V.ics(largo, base, new Date(0)).split('\r\n').find(l => l.startsWith('UID')) !== V.ics(largo, base, new Date()).split('\r\n').find(l => l.startsWith('UID'))) malI.push('el UID cambia entre generaciones');
  /* los archivos que escribió aplicar.mjs y los enlaces de la agenda */
  const dirIcs = path.join(RAIZ, 'ics'), archivos = fs.existsSync(dirIcs) ? fs.readdirSync(dirIcs).filter(f => f.endsWith('.ics')) : [];
  const uids = new Set();
  for (const f of archivos) { const t = icsValido(fs.readFileSync(path.join(dirIcs, f), 'utf8')); if (!t.ok) malI.push(f + ': ' + t.mal.join(', ')); if (uids.has(t.uid)) malI.push(f + ': UID repetido'); uids.add(t.uid); }
  const agendaHtml = leer(RAIZ, 'agenda.html'), enlaces = [...agendaHtml.matchAll(/href="(ics\/[^"]+\.ics)"/g)].map(m => m[1]);
  const pendientes = (agendaHtml.match(/<h2[^>]*id="t-proximo"[\s\S]*?(<h2|<\/section>)/) || [''])[0].match(/class="evento"/g) || [];
  if (enlaces.some(e => !fs.existsSync(path.join(RAIZ, e)))) malI.push('enlace a un .ics que no existe');
  if (enlaces.length !== pendientes.length) malI.push(`${enlaces.length} enlaces .ics para ${pendientes.length} eventos que vienen`);
  if (!/Añadir a mi calendario <span class="evento__ics-tipo">\(archivo \.ics\)<\/span><span class="sr">: «/.test(agendaHtml)) malI.push('texto accesible del enlace');
  comprobar(!malI.length && archivos.length > 0, `.ics (RFC 5545): CRLF, líneas de ≤ 75 octetos sin partir tildes, UID estable y único, DTSTAMP, DTSTART con Europe/Madrid (y VTIMEZONE) o VALUE=DATE el día entero, escapado de , ; \\ y saltos; ${archivos.length} archivos en ics/ y un enlace por cada evento que viene en la agenda` + (malI.length ? ' → ' + malI.slice(0, 6).join(' | ') : ''));

  /* 5. en esta web: cada bloque solo con sus datos, y el INE manda en el enlace de AEMET */
  const index = leer(RAIZ, 'index.html');
  const tieneCanal = !!(M.canal_avisos && M.canal_avisos.url);
  const malW = [];
  if (/lado__bloque--canal/.test(index) !== tieneCanal || /class="pie__canal"/.test(index) !== tieneCanal || /class="hoy__canal"/.test(index)) malW.push('canal de avisos ' + (tieneCanal ? 'falta' : 'sobra') + ' en el lado del tablón o en el pie (o se repite en el panel)');
  if (M.ine && !index.includes('-id' + M.ine + '"')) malW.push('el enlace de AEMET no lleva el INE ' + M.ine);
  if (!M.ine && /aemet\.es/.test(index)) malW.push('sale AEMET sin INE');
  const dir3 = /^L01(\d{5})\d$/.exec((M.legal && M.legal.dir3) || '');
  if (M.ine && dir3 && dir3[1] !== String(M.ine)) malW.push('ine y legal.dir3 no casan');
  if (!(M.farmacias && ((M.farmacias.lista || []).length || M.farmacias.oficial)) && /Farmacia de guardia/.test(index)) malW.push('sale la farmacia sin datos');
  if (!(M.recogida || []).length && /hoy__breve[^>]*data-dato-ejemplo="recogida/.test(index)) malW.push('sale la recogida sin datos');
  comprobar(!malW.length, `panel «Hoy» de ${M.nombre}: ${[M.farmacias ? 'farmacia' : null, M.ine ? 'AEMET (INE ' + M.ine + ', casa con el DIR3)' : null, (M.plenos || []).length ? 'plenos' : null, (M.recogida || []).length ? 'recogida' : null, tieneCanal ? 'canal' : 'sin canal'].filter(Boolean).join(', ')}, cada cosa solo con sus datos` + (malW.length ? ' → ' + malW.join(' | ') : ''));

  /* 6. en el navegador: la farmacia cambia a la hora del cambio con el reloj real */
  if (M.farmacias && (M.farmacias.lista || []).length) {
    const cambio = M.farmacias.cambio || '09:30', [hh, mm] = cambio.split(':').map(Number);
    const antes = `2026-10-05T${String(mm ? hh : hh - 1).padStart(2, '0')}:${String(mm ? mm - 1 : 59).padStart(2, '0')}:00+02:00`, despues = `2026-10-05T${cambio}:00+02:00`;
    const vistos = [];
    for (const iso of [antes, despues]) {
      const { ctx, page } = await nueva();
      await page.clock.setFixedTime(new Date(iso));
      await ir(page, 'index.html');
      vistos.push(await page.evaluate(() => { const f = document.querySelector('.hoy__fila--farmacia b'); return f ? f.textContent : ''; }));
      await ctx.close();
    }
    const Dpag = JSON.parse(index.match(/<script type="application\/json" id="datos-vivos">([\s\S]*?)<\/script>/)[1]);
    const esperados = [antes, despues].map(iso => { const g = V.farmaciaDeGuardia(Dpag.farmacias, en(iso)); return g ? g.farmacia.nombre : ''; });
    comprobar(vistos[0] === esperados[0] && vistos[1] === esperados[1], `farmacia de guardia en el navegador (reloj simulado): a las ${antes.slice(11, 16)} «${vistos[0]}», a las ${cambio} «${vistos[1]}»` + (vistos.join() !== esperados.join() ? ` → esperaba «${esperados.join('» y «')}»` : ''));
  }

  /* 7. un evento que llega de la hoja: «Añadir a mi calendario» genera el .ics con un Blob */
  const { ctx, page } = await nueva();
  await page.route('**/agenda.html', async r => {
    const resp = await r.fetch(); let cuerpo = await resp.text();
    cuerpo = cuerpo.replace(/"hoja":(null|\{[^}]*\}\})/, '"hoja":{"id":"HOJA-DE-PRUEBA","pestanas":{"agenda":"Agenda"}}');
    r.fulfill({ response: resp, body: cuerpo });
  });
  const manana = new Date(Date.now() + 5 * 864e5), f = manana.toISOString().slice(0, 10).split('-').map(Number);
  await page.route('https://docs.google.com/**', r => {
    const datos = { table: { cols: [{ label: 'id' }, { label: 'fecha' }, { label: 'hora' }, { label: 'titulo' }, { label: 'lugar' }],
      rows: [{ c: [{ v: 'desde-la-hoja' }, { v: `Date(${f[0]},${f[1] - 1},${f[2]})` }, { v: 'Date(1899,11,30,19,0,0)' }, { v: 'Concierto, desde la hoja; prueba' }, { v: 'Plaza' }] }] } };
    r.fulfill({ contentType: 'text/plain', body: 'google.visualization.Query.setResponse(' + JSON.stringify(datos) + ');' });
  });
  await ir(page, 'agenda.html');
  await page.waitForSelector('#evento-desde-la-hoja button[data-ics]', { timeout: 4000 }).catch(() => {});
  let blob = null;
  if (await page.$('#evento-desde-la-hoja button[data-ics]')) {
    const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }), page.click('#evento-desde-la-hoja button[data-ics]')]);
    blob = { nombre: descarga.suggestedFilename(), txt: fs.readFileSync(await descarga.path(), 'utf8') };
  }
  await ctx.close();
  const tb = blob ? icsValido(blob.txt) : { ok: false, mal: ['no salió el botón o no descargó'], desplegado: [] };
  comprobar(tb.ok && /\.ics$/.test(blob.nombre) && tb.desplegado.includes('SUMMARY:Concierto\\, desde la hoja\\; prueba') && tb.desplegado.some(l => /^DTSTART;TZID=Europe\/Madrid:\d{8}T190000$/.test(l)),
    'un evento de la hoja de cálculo (sin .ics escrito) se descarga como .ics válido generado con un Blob al pulsar, con la hora de la celda (19:00)' + (tb.ok ? '' : ' → ' + tb.mal.join(', ')));
}

/* ── contenido: «Ejemplo» exactamente en lo marcado ── */
async function contenidoEjemplo() {
  const esperados = new Set();
  if (M.horario.ejemplo) esperados.add('horario');
  if (M.alcaldia && M.alcaldia.saluda_ejemplo) esperados.add('saluda');
  contenido('avisos').avisos.filter(a => a.ejemplo).forEach(a => esperados.add('aviso:' + a.id));
  contenido('agenda').eventos.filter(a => a.ejemplo).forEach(a => esperados.add('evento:' + a.id));
  contenido('noticias').noticias.filter(a => a.ejemplo).forEach(a => esperados.add('noticia:' + a.id));
  /* lo nuevo del panel «Hoy» (con la rotación de muestra siempre hay una farmacia de guardia) */
  if (M.farmacias && M.farmacias.ejemplo && (M.farmacias.rotacion || (M.farmacias.guardias || []).length)) esperados.add('farmacia');
  (M.recogida || []).filter(x => x.ejemplo).forEach(x => esperados.add('recogida:' + x.id));
  (M.plenos || []).filter(p => p.ejemplo).forEach(p => esperados.add('evento:pleno-' + p.fecha + (p.id ? '-' + p.id : '')));
  /* v3b: los plazos que no constan en la fuente (avisos y anuncios del tablón con plazo_ejemplo) */
  contenido('avisos').avisos.filter(a => !a.oculto && a.plazo_ejemplo && (a.plazo_fin || a.plazo_inicio)).forEach(a => esperados.add('plazo:' + a.id));
  (contenido('tablon').entradas || []).filter(t => !t.oculto).forEach((t, i) => { if (t.plazo_ejemplo && (t.plazo_fin || t.plazo_inicio)) esperados.add('plazo:tablon-' + (t.expediente || i)); });
  const { ctx, page } = await nueva({ densidad: 'sobria' });
  const vistos = new Set(), malos = [];
  for (const p of PAGINAS) {
    await ir(page, p, '?revision');
    const r = await page.evaluate(() => {
      const vis = el => el.checkVisibility();
      const sueltas = [...document.querySelectorAll('.ejemplo')].filter(vis).map(e => { const d = e.closest('[data-dato-ejemplo]'); return d ? d.getAttribute('data-dato-ejemplo') : '(sin dato: ' + e.parentElement.textContent.trim().slice(0, 40) + ')'; });
      const sinEtiqueta = [...document.querySelectorAll('[data-dato-ejemplo]')].filter(vis).filter(d => ![...d.querySelectorAll('.ejemplo')].some(vis)).map(d => d.getAttribute('data-dato-ejemplo'));
      return { sueltas, sinEtiqueta };
    });
    r.sueltas.forEach(v => { vistos.add(v); });
    r.sueltas.filter(v => !esperados.has(v)).forEach(v => malos.push(p + ': etiqueta en ' + v));
    r.sinEtiqueta.forEach(v => malos.push(p + ': ' + v + ' sin etiqueta'));
  }
  const faltan = [...esperados].filter(e => !vistos.has(e));
  comprobar(!malos.length && !faltan.length, `«Ejemplo» justo en los ${esperados.size} datos marcados (${[...esperados].join(', ')}) y en ninguno más` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (faltan.length ? ' → no aparece: ' + faltan.join(', ') : ''));
  await ctx.close();
}

/* ── cookies, mando de densidad y paleta, mapa, buscador, filtro ── */
async function interaccion() {
  /* cookies */
  let { ctx, page } = await nueva({ conCookies: true });
  await ir(page, 'index.html');
  const antes = await page.evaluate(() => getComputedStyle(document.getElementById('cookies')).display);
  await page.click('[data-aceptar-cookies]');
  const despues = await page.evaluate(k => ({ d: getComputedStyle(document.getElementById('cookies')).display, ls: localStorage.getItem(k) }), SLUG + '-cookies');
  await page.reload({ waitUntil: 'networkidle' });
  const recarga = await page.evaluate(() => getComputedStyle(document.getElementById('cookies')).display);
  comprobar(antes === 'flex' && despues.d === 'none' && despues.ls === 'ok' && recarga === 'none', 'cookies: el aviso sale, «Entendido» lo cierra de verdad (display:none), se guarda y no vuelve');
  await ctx.close();

  /* mando: oculto sin ?revision; con él, cambia densidad y paleta de verdad */
  ({ ctx, page } = await nueva());
  await ir(page, 'index.html');
  comprobar(await page.evaluate(() => { const m = document.getElementById('mando'); return m.hidden && getComputedStyle(m).display === 'none'; }), 'mando: sin ?revision no se ve (hidden y display:none)');
  await ir(page, 'index.html', '?revision');
  /* radio del arco opcional: el de una foto de la línea o, si ninguna noticia reciente lleva foto,
     el de una sonda con las mismas clases que se quita al medir */
  await page.evaluate(() => { window.__radioArco = () => {
    let e = document.querySelector('.linea__foto'), sonda = null;
    if (!e) { sonda = e = document.createElement('figure'); e.className = 'linea__foto arco-opcional'; (document.querySelector('.linea') || document.body).append(e); }
    const r = getComputedStyle(e).borderTopLeftRadius;
    if (sonda) sonda.remove();
    return r;
  }; });
  const m0 = await page.evaluate(() => ({ vis: getComputedStyle(document.getElementById('mando')).display, radio: window.__radioArco(), mas: [...document.querySelectorAll('.hoy__mas, .hoy .solo-sobria')].filter(e => e.checkVisibility()).length, color: getComputedStyle(document.querySelector('.cabecera__sede')).backgroundColor }));
  await page.click('[data-densidad="sobria"]');
  const m1 = await page.evaluate(() => ({ clase: document.documentElement.classList.contains('densidad-sobria'), radio: window.__radioArco(), mas: [...document.querySelectorAll('.hoy__mas, .hoy .solo-sobria')].filter(e => e.checkVisibility()).length, sobria: (document.querySelector('.hoy .solo-sobria') || {}).textContent || '', arquito: [...document.querySelectorAll('.linea__arquito')].some(e => e.checkVisibility()),
    diag: document.documentElement.className + ' | ' + [...document.querySelectorAll('.arco-opcional')].map(e => e.className + ':' + getComputedStyle(e).borderTopLeftRadius).join(', ') }));
  const tramitesSede = (fs.readFileSync(path.join(RAIZ, 'js/tramites-datos.js'), 'utf8').match(new RegExp(sedeBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  comprobar(m0.vis === 'flex' && m0.mas === 0 && m1.clase && m1.radio !== m0.radio && m1.mas >= 2 && !m1.arquito && m1.sobria.includes(String(tramitesSede)),
    `mando «Sobria»: el arco sale de las fotos (radio ${m0.radio} → ${m1.radio}), el «hoy» pierde el arquito y el panel gana ${m1.mas} datos («${m1.sobria.trim().replace(/\s+/g, ' ').slice(0, 60)}»)` + (m1.radio === m0.radio ? ' [' + m1.diag + ']' : ''));
  await page.click('[data-paleta="b"]');
  const p1 = await page.evaluate(k => ({ color: getComputedStyle(document.querySelector('.cabecera__sede')).backgroundColor, attr: document.documentElement.getAttribute('data-paleta'), ls: localStorage.getItem(k), pulsado: document.querySelector('.mando [data-paleta="b"]').getAttribute('aria-pressed') }), SLUG + '-paleta');
  await page.goto(BASE + 'index.html?revision', { waitUntil: 'domcontentloaded' });
  const p2 = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-paleta'), sobria: document.documentElement.classList.contains('densidad-sobria') }));
  comprobar(p1.color !== m0.color && p1.attr === 'b' && p1.ls === 'b' && p1.pulsado === 'true' && p2.attr === 'b' && p2.sobria,
    `mando de paleta: el color computado cambia (${m0.color} → ${p1.color}), aria-pressed y localStorage bien, y al recargar se aplica antes de pintar`);
  if (CAPTURAS) { await page.waitForLoadState('networkidle'); await page.screenshot({ path: captura('mando-sobria-paleta-b.png'), fullPage: true }); }
  await ctx.close();
  ({ ctx, page } = await nueva({ conCookies: true }));
  await ir(page, 'index.html', '?revision');
  const conAviso = await page.evaluate(() => getComputedStyle(document.getElementById('mando')).display);
  await page.click('[data-aceptar-cookies]');
  const sinAviso = await page.evaluate(() => getComputedStyle(document.getElementById('mando')).display);
  comprobar(conAviso === 'none' && sinAviso === 'flex', 'mando: se aparta mientras está el aviso de cookies y aparece al cerrarlo');
  await ctx.close();

  /* mapa solo bajo clic */
  ({ ctx, page } = await nueva());
  await page.route('https://www.google.com/**', r => r.abort());
  await ir(page, 'contacto.html');
  const sinIframe = await page.evaluate(() => !document.querySelector('iframe'));
  await page.click('[data-cargar-mapa]');
  const conIframe = await page.evaluate(() => { const f = document.querySelector('.mapa iframe'); return f && /maps\?q=.*output=embed/.test(f.src) && !!f.title; });
  comprobar(sinIframe && conIframe, 'mapa: el iframe de Google no existe hasta pulsar el botón (maps?q=…&output=embed, sin clave, con title)');
  await ctx.close();

  /* buscador de trámites, con sinónimos y sin tildes */
  ({ ctx, page } = await nueva());
  await ir(page, 'index.html');
  await page.click('[data-abrir-buscador]');
  const abierto = await page.evaluate(() => document.getElementById('buscador').open && document.activeElement.matches('[data-buscador-campo]'));
  /* los casos de Ribera, si el municipio tiene esos trámites; si no (Monesterio no tiene ni agua ni
     boda ni quejas en su sede), los que salen de sus propios sinónimos */
  const sinTilde = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nombresTram = (M.tramites.todos || []).filter(t => t.vigente !== false).map(t => sinTilde(t.nombre));
  const hayTram = re => nombresTram.some(n => re.test(n));
  const casos = [['empadronarme', /padr[oó]n/i], ['obra', /urban[ií]stica/i], ['agua', /agua/i], ['boda', /matrimonio/i], ['tramite padron', /padr[oó]n/i], ['quejas', /quejas/i]]
    .map(([q, re]) => [q, new RegExp(sinTilde(re.source), 'i')]).filter(([, re]) => hayTram(re))
    /* «lo suyo» incluye lo que el municipio dice en sus sinónimos («obra» → obra menor, en Monesterio) */
    .map(([q, re]) => [q, new RegExp([re.source, ...((M.tramites.sinonimos || {})[q] || []).map(d => sinTilde(d).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))].join('|'), 'i')]);
  for (const [q, destinos] of Object.entries(M.tramites.sinonimos || {})) {
    if (casos.length >= 5) break;
    const hay = destinos.map(sinTilde).filter(d => nombresTram.some(n => n.includes(d)));
    if (hay.length && !casos.some(c => c[0] === q)) casos.push([q, new RegExp(hay.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')]);
  }
  const malos = [];
  if (casos.length < 4) malos.push('solo ' + casos.length + ' casos de prueba: faltan sinónimos que lleven a trámites');
  for (const [q, re] of casos) {
    await page.fill('#buscador [data-buscador-campo]', q);
    await page.waitForFunction(() => document.querySelector('#buscador [data-buscador-cuenta]').textContent.length > 0, null, { timeout: 3000 }).catch(() => {});
    await espera(250);
    /* v3b: el buscador es global (grupos por tipo); los trámites van primero y son los que tienen
       que llevar a la sede o a un impreso. Los demás grupos enlazan a páginas de la web */
    const r = await page.evaluate(() => [...document.querySelectorAll('#buscador [data-buscador-resultados] a')].map(a => ({ t: a.textContent, h: a.getAttribute('href'), g: (a.closest('ul') || { getAttribute: () => '' }).getAttribute('aria-labelledby') || '' })));
    if (!r.length || !re.test(sinTilde(r[0].t)) || !/-tramites$/.test(r[0].g)) malos.push(`«${q}» → ${r.length} resultados, el primero «${r[0] ? r[0].t.slice(0, 40) : '-'}»`);
    if (r.filter(x => /-tramites$/.test(x.g)).some(x => !patronSede.test(x.h) && !/\.(pdf|docx?)$/.test(x.h) && !/^https:\/\//.test(x.h))) malos.push(`«${q}»: enlace raro`);
  }
  await page.keyboard.press('Escape');
  const cerrado = await page.evaluate(() => !document.getElementById('buscador').open);
  if (!abierto || !cerrado) malos.push('abierto ' + abierto + ', cerrado ' + cerrado);
  comprobar(abierto && !malos.length && cerrado, 'buscador: la lupa abre el diálogo con el foco en el campo; ' + casos.map(c => '«' + c[0] + '»').join(', ') + ' (sin tildes) encuentran lo suyo; Esc lo cierra' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  await ir(page, 'tramites.html');
  /* una palabra que esté en algunos trámites y no en todos */
  const palabra = ['agua', 'obra', 'padron', 'licencia', 'certificado'].find(w => { const n = nombresTram.filter(x => x.includes(w)).length; return n > 0 && n < nombresTram.length; }) || 'agua';
  await page.fill('#filtrar-tramites', palabra);
  const f = await page.evaluate(w => ({ vis: [...document.querySelectorAll('#todos-lista li')].filter(l => l.getBoundingClientRect().height > 0).length, esperado: [...document.querySelectorAll('#todos-lista li')].filter(l => l.dataset.texto.includes(w)).length, cuenta: document.querySelector('[data-filtro-cuenta]').textContent }), palabra);
  comprobar(f.vis > 0 && f.vis === f.esperado && f.cuenta.includes(String(f.vis)), `filtro de «Todos los trámites»: «${palabra}» deja ${f.vis} visibles y lo dice`);
  const total = await page.evaluate(() => document.querySelectorAll('#todos-lista li').length);
  const cabecera = await page.evaluate(() => document.getElementById('todos').textContent);
  comprobar(cabecera.includes('(' + total + ')'), `«Todos los trámites (${total})» cuenta lo que lista`);
  await ctx.close();
}

/* ── estructura, textos y zonas táctiles ── */
async function estructura() {
  const { ctx, page } = await nueva({ viewport: { width: 390, height: 844 } });
  const malos = [], pequenos = [], medida = [];
  for (const p of PAGINAS) {
    await ir(page, p);
    const r = await page.evaluate(() => {
      const vis = el => el.checkVisibility();
      const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(e => vis(e) || e.classList.contains('sr') || e.closest('.sr'));
      const niveles = h.map(e => Number(e.tagName[1]));
      let salto = null;
      niveles.forEach((n, i) => { if (i && n > niveles[i - 1] + 1) salto = h[i].textContent.trim().slice(0, 30); });
      const cs = getComputedStyle(document.body);
      const toques = [...document.querySelectorAll('a, button, summary, input')].filter(e => vis(e) && !e.closest('.sr, .saltar, .sprite') && getComputedStyle(e).display !== 'inline')
        .map(e => ({ e: e.outerHTML.slice(0, 60), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })).filter(x => x.h < 43.5 || x.w < 43.5);
      const parrafos = [...document.querySelectorAll('main p')].filter(vis).map(pp => {
        const lh = parseFloat(getComputedStyle(pp).lineHeight), lineas = Math.round(pp.getBoundingClientRect().height / lh);
        const copia = pp.cloneNode(true); copia.querySelectorAll('.sr').forEach(s => s.remove());
        return lineas > 1 ? copia.textContent.trim().length / lineas : 0;
      });
      return {
        h1: document.querySelectorAll('h1').length, primero: niveles[0], salto, lang: document.documentElement.lang,
        marcas: ['header', 'nav', 'main', 'footer'].every(t => document.querySelector(t)), saltar: !!document.querySelector('a.saltar[href="#contenido"]') && !!document.getElementById('contenido'),
        actual: document.querySelectorAll('[aria-current="page"]').length,
        letra: cs.fontSize, interlineado: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), toques, maxCar: Math.max(0, ...parrafos)
      };
    });
    if (r.h1 !== 1 || r.primero !== 1 || r.salto || r.lang !== ((/^pueblo-([a-z]{2})\.html$/.exec(p) || [])[1] || 'es') || !r.marcas || !r.saltar || r.letra !== '18px' || r.interlineado < 1.5)
      malos.push(`${p}: h1=${r.h1}, salto=${r.salto}, lang=${r.lang}, landmarks=${r.marcas}, saltar=${r.saltar}, letra=${r.letra}, interlineado=${r.interlineado.toFixed(2)}`);
    r.toques.forEach(t => pequenos.push(`${p}: ${Math.round(t.w)}×${Math.round(t.h)} ${t.e}`));
    if (r.maxCar > 75) medida.push(`${p}: ${Math.round(r.maxCar)}`);
  }
  comprobar(!malos.length, 'estructura: lang="es" (en «El pueblo» traducido, el de su idioma), saltar al contenido, header/nav/main/footer, un solo h1 y títulos sin saltos; texto de 18 px con interlineado ≥ 1,5' + (malos.length ? ' → ' + malos.slice(0, 3).join(' | ') : ''));
  comprobar(!pequenos.length, 'zonas táctiles de al menos 44 × 44 px a 390 px (los enlaces dentro de una frase se rigen por la frase)' + (pequenos.length ? ' → ' + pequenos.slice(0, 5).join(' | ') : ''));
  await ctx.close();
  const e = await nueva();
  await ir(e.page, 'tramites.html');
  const actual = await e.page.evaluate(() => [...document.querySelectorAll('.menu [aria-current="page"]')].map(a => a.textContent.trim()));
  comprobar(actual.length === 1 && actual[0] === 'Trámites', 'aria-current="page" en el menú de la página en la que se está');
  const anchos = [];
  for (const p of PAGINAS) {
    await ir(e.page, p);
    anchos.push(await e.page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('main p')].filter(pp => pp.checkVisibility()).map(pp => {
      const lh = parseFloat(getComputedStyle(pp).lineHeight), lineas = Math.round(pp.getBoundingClientRect().height / lh);
      const copia = pp.cloneNode(true); copia.querySelectorAll('.sr').forEach(s => s.remove());
        return lineas > 1 ? copia.textContent.trim().length / lineas : 0;
    }))));
  }
  const max = Math.max(...anchos);
  comprobar(max <= 75, `medida del texto ≤ 75 caracteres por línea en escritorio (la más larga, ${Math.round(max)})`);
  /* la pareja tipográfica: la altura de x del nombre es 1,25 la del menú */
  const x = await e.page.evaluate(() => {
    const nom = document.querySelector('.cabecera__nombre'), men = document.querySelector('.menu__enlace');
    const c = document.createElement('canvas').getContext('2d');
    /* a ×10: el canvas redondea la altura de x a píxeles enteros */
    const alto = el => { const cs = getComputedStyle(el); c.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * 10}px ${cs.fontFamily}`; return c.measureText('x').actualBoundingBoxAscent; };
    return alto(nom) / alto(men);
  });
  comprobar(Math.abs(x - 1.25) < 0.04, `pareja tipográfica medida: la altura de x del nombre es ${x.toFixed(3)} veces la del menú (objetivo 1,25)`);
  await e.ctx.close();
}

/* ── cabecera de las páginas interiores: la puerta no pisa el título ni las migas, cabe en la
   pantalla, es de medio punto y, sin foto, está de pie sobre el filete. Sirve también para las copias ── */
const medirCabecera = (page, densidad) => page.evaluate(d => {
  const fallos = [], caja = e => e.getBoundingClientRect();
  const cab = document.querySelector('main > .cabeza-pagina');
  if (!cab) return ['sin .cabeza-pagina'];
  const h1 = cab.querySelector('h1#titulo-pagina'), migas = cab.querySelector('nav.migas'), entr = cab.querySelector('.entradilla');
  if (!h1 || !migas || !migas.querySelector('[aria-current="page"]')) fallos.push('h1 o migas');
  const puerta = cab.querySelector('.cabeza-pagina__puerta'), linea = cab.classList.contains('cabeza-pagina--arco'), foto = cab.classList.contains('cabeza-pagina--foto');
  if (!puerta) return fallos;
  const arco = puerta.querySelector('.cabeza-pagina__arco'), umbral = puerta.querySelector('.cabeza-pagina__umbral');
  const W = document.documentElement.clientWidth;
  if (d === 'sobria' && linea) { if (puerta.checkVisibility()) fallos.push('en la sobria sale el arco de línea'); return fallos; }
  const a = caja(arco);
  if (!a.width || !a.height) return [...fallos, 'la puerta no se ve'];
  const pisa = (r, s) => r.left < s.right - 0.5 && s.left < r.right - 0.5 && r.top < s.bottom - 0.5 && s.top < r.bottom - 0.5;
  for (const [n, e] of [['el título', h1], ['las migas', migas], ['la entradilla', entr]]) if (e && pisa(a, caja(e))) fallos.push('el arco pisa ' + n);
  for (const e of [arco, umbral]) { const r = caja(e); if (r.width && (r.left < -0.5 || r.right > W + 0.5)) fallos.push('se sale de la pantalla'); }
  const radio = parseFloat(getComputedStyle(arco).borderTopLeftRadius);
  if (d === 'puerta' && (a.height < a.width / 2 - 1 || radio < a.width / 2 - 1)) fallos.push(`no es de medio punto (${Math.round(a.width)}×${Math.round(a.height)}, radio ${radio})`);
  if (d === 'sobria' && radio > 20) fallos.push('en la sobria la foto sigue en arco');
  if (linea && Math.abs(caja(umbral).bottom - caja(cab).bottom) > 2) fallos.push(`el arco de línea no está de pie sobre el filete (${Math.round(caja(umbral).bottom)} / ${Math.round(caja(cab).bottom)})`);
  if (foto) {
    const img = arco.querySelector('img');
    if (!img || !img.complete || !img.naturalWidth) fallos.push('la foto no carga');
    const cr = puerta.querySelector('.credito');
    if (cr && !cr.checkVisibility()) fallos.push('el crédito no se ve');
  }
  return fallos;
}, densidad);

/* ── páginas interiores: cabeceras, «El pueblo», patrimonio, «¿Quién se ocupa de qué?» y la cal ── */
async function interiores() {
  const conf = M.cabeceras || {};
  const muestra = ['tramites.html', 'ayuntamiento.html', 'pueblo.html', 'telefonos.html', 'contacto.html', 'aviso-legal.html', PAGINAS.find(p => p.startsWith('noticia-')), '404.html'].filter(p => p && PAGINAS.includes(p));
  const malos = [];
  for (const [w, h, escala, densidades] of [[320, 640, 0, ['puerta']], [390, 844, 0, ['puerta', 'sobria']], [1024, 768, 0, ['puerta']], [1440, 900, 0, ['puerta', 'sobria']], [640, 400, 2, ['puerta']]]) {
    for (const densidad of densidades) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h }, escala, densidad });
      for (const p of muestra) {
        await ir(page, p, '?revision');
        await page.evaluate(() => document.querySelectorAll('.cabeza-pagina img').forEach(i => { i.loading = 'eager'; }));
        await page.waitForLoadState('networkidle');
        (await medirCabecera(page, densidad)).forEach(f => malos.push(`${p} a ${escala ? w * escala + ' px con zoom' : w + ' px'} (${densidad}): ${f}`));
      }
      await ctx.close();
    }
  }
  /* qué lleva cada cabecera: foto donde se configura, arco de línea en el resto, nada en la 404 */
  const tipos = INTERIORES.map(p => { const h = leer(RAIZ, p); const c = (h.match(/class="cabeza-pagina( [^"]*)?"/) || [])[1] || ''; return { p, foto: /--foto/.test(c), grande: /--grande/.test(c), linea: /--arco/.test(c) }; });
  const idDe = p => ({ 'aviso-legal.html': 'legal', 'privacidad.html': 'legal', 'cookies.html': 'legal', 'accesibilidad.html': 'legal', '404.html': 'error' })[p] || (p.startsWith('noticia-') ? 'noticia' : /^pueblo-[a-z]{2}\.html$/.test(p) ? 'pueblo' : p.replace('.html', ''));   /* v3b: «El pueblo» traducido es «El pueblo» */
  const malTipo = tipos.filter(t => { const id = idDe(t.p), c = conf[id]; const debeFoto = !!(c && fs.existsSync(path.join(RAIZ, 'media', (typeof c === 'string' ? c : c.archivo) + '.jpg')));
    return t.foto !== debeFoto || t.grande !== (debeFoto && id === 'pueblo') || t.linea !== (!debeFoto && id !== 'error'); }).map(t => t.p);
  comprobar(!malos.length && !malTipo.length, `cabeceras interiores: foto en arco donde municipio.json → cabeceras la pone (${Object.keys(conf).filter(k => !k.startsWith('_')).join(', ') || 'ninguna'}), arco de línea de pie sobre el filete en el resto y nada en la 404; ni pisa el título ni las migas, cabe y es de medio punto a 320, 390, 1024, 1440 px y con zoom; en la sobria, sin arco` +
    (malTipo.length ? ' → tipo mal en ' + malTipo.join(', ') : '') + (malos.length ? ' → ' + malos.slice(0, 5).join(' | ') : ''));

  const { ctx, page } = await nueva();
  /* «El pueblo»: la foto grande con crédito, y no repetida en la primera tarjeta del carril */
  const P = M.pueblo || {};
  if (PAGINAS.includes('pueblo.html')) {
    await ir(page, 'pueblo.html');
    const r = await page.evaluate(() => {
      document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; });
      const hero = document.querySelector('.cabeza-pagina__arco img'), primera = document.querySelector('.carril .lugar img');
      return { hero: hero ? hero.getAttribute('src') : null, credito: (document.querySelector('.cabeza-pagina .credito') || {}).textContent || '', primera: primera ? primera.getAttribute('src') : null,
        filas: document.querySelectorAll('.patrimonio__fila').length, grupos: [...document.querySelectorAll('.patrimonio-grupo__titulo')].map(h => h.textContent.trim()),
        gastro: !!document.querySelector('.gastronomia--con-foto'), gastroFoto: !!document.querySelector('.gastronomia__foto img') };
    });
    const cp = conf.pueblo ? (typeof conf.pueblo === 'string' ? conf.pueblo : conf.pueblo.archivo) : null;
    const cred = cp ? (JSON.parse(leer(RAIZ, 'media', 'creditos.json'))[cp] || {}).autor : null;
    const grupos = [...new Set((P.patrimonio || []).map(x => x.grupo || null))];
    const grEsperados = grupos.length > 1 ? grupos.map(g => g || 'Otros').sort((a, b) => (a === 'Otros') - (b === 'Otros')) : [];
    const malP = [];
    if (cp && (!r.hero || !r.hero.includes(cp) || !r.credito.includes(cred))) malP.push('foto grande ' + JSON.stringify({ hero: r.hero, credito: r.credito }));
    if (cp && r.hero && r.primera && r.primera === r.hero.replace('.jpg', '-800.jpg')) malP.push('la primera tarjeta repite la foto grande');
    if (r.filas !== (P.patrimonio || []).length) malP.push(`patrimonio: ${r.filas} de ${(P.patrimonio || []).length}`);
    if (JSON.stringify(r.grupos) !== JSON.stringify(grEsperados)) malP.push('grupos del patrimonio ' + JSON.stringify(r.grupos));
    if (P.gastronomia && r.gastro !== !!P.gastronomia.foto) malP.push('gastronomía: la rejilla de dos columnas no sigue a la foto');
    comprobar(!malP.length, `«El pueblo»: ${cp ? 'foto grande en arco con su crédito visible y no repetida en la primera tarjeta; ' : ''}patrimonio completo (${r.filas}) ${grEsperados.length ? 'en ' + grEsperados.length + ' grupos' : 'en un bloque'}; gastronomía ${P.gastronomia && P.gastronomia.foto ? 'con foto' : 'sin hueco de foto'}` + (malP.length ? ' → ' + malP.join(' | ') : ''));
  }
  /* «¿Quién se ocupa de qué?» del Ayuntamiento: una sola sección, sin perder a nadie */
  const miembros = (M.corporacion && M.corporacion.miembros) || [];
  const delegados = miembros.filter(m => m.delegacion);
  if ((M.quien || []).length || delegados.length) {
    await ir(page, 'ayuntamiento.html');
    const r = await page.evaluate(() => ({
      concejalias: !!document.getElementById('t-concejalias'),
      filas: [...document.querySelectorAll('#quien .quien__fila')].map(f => f.textContent.replace(/\s+/g, ' ')),
      hemiciclo: document.querySelectorAll('svg.hemiciclo > circle').length,
      retrato: (document.querySelector('.retrato__pie') || {}).textContent || '', discontinuo: document.querySelector('.retrato__hueco') ? getComputedStyle(document.querySelector('.retrato__hueco')).borderTopStyle === 'dashed' : false
    }));
    const malQ = [];
    if (r.concejalias) malQ.push('sigue la sección «Concejalías»');
    for (const q of M.quien || []) { const m = miembros.find(x => x.nombre === q.nombre); if (!r.filas.some(f => f.includes(q.tema) && f.includes(q.nombre) && (!m || !m.grupo || f.includes(m.grupo)))) malQ.push('falta ' + q.tema + ' / ' + q.nombre); }
    for (const m of delegados) if (!r.filas.some(f => f.includes(m.nombre) && f.includes(m.delegacion) && f.includes(m.grupo))) malQ.push('falta la delegación de ' + m.nombre);
    const esperadas = (M.quien || []).length + delegados.filter(m => !(M.quien || []).some(q => q.nombre === m.nombre)).length;
    if (r.filas.length !== esperadas) malQ.push(`${r.filas.length} filas de ${esperadas}`);
    if ((M.corporacion || {}).grupos && r.hemiciclo !== miembros.length) malQ.push(`hemiciclo con ${r.hemiciclo} asientos de ${miembros.length}`);
    if (!/retrato oficial/i.test(r.retrato) || r.discontinuo) malQ.push('retrato: ' + r.retrato);
    comprobar(!malQ.length, `Ayuntamiento: «¿Quién se ocupa de qué?» une asunto, persona, cargo, delegación y grupo (${r.filas.length} filas, sin «Concejalías» aparte), el hemiciclo sigue entero y el retrato vacío es un hueco diseñado que lo dice` + (malQ.length ? ' → ' + malQ.slice(0, 4).join(' | ') : ''));
  }
  /* la cal: dos capas de SVG que se desplazan con la página, sin filtros ni fixed */
  await ir(page, 'tramites.html');
  const cal = await page.evaluate(() => { const b = getComputedStyle(document.body); return { capas: (b.backgroundImage.match(/url\("data:/g) || []).length, turb: (b.backgroundImage.match(/feTurbulence/g) || []).length, fijo: b.backgroundAttachment, filtro: b.filter + ' ' + getComputedStyle(document.documentElement).filter, color: b.backgroundColor, papel: getComputedStyle(document.documentElement).getPropertyValue('--papel').trim() }; });
  const hexRgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
  comprobar(cal.capas === 2 && cal.turb === 2 && !/fixed/.test(cal.fijo) && cal.filtro === 'none none' && cal.color === hexRgb(cal.papel),
    `textura de cal: ${cal.capas} capas de grano sobre --papel, que se desplazan con la página (${cal.fijo}) y sin filtros por fotograma` + (cal.capas === 2 && cal.turb === 2 ? '' : ' → ' + JSON.stringify(cal).slice(0, 200)));
  await ctx.close();
}

/* ── reskin a otro municipio y la banda de propuesta apagada ── */
function copiar() {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'reskin-'));
  fs.cpSync(RAIZ, destino, { recursive: true, filter: s => !/[\\/](node_modules|screenshots|_scratch|\.git)([\\/]|$)/.test(path.relative(RAIZ, s) ? '/' + path.relative(RAIZ, s) : '') });
  return destino;
}
async function reskin() {
  const pruebas = path.join(RAIZ, 'pruebas');
  /* otro municipio de verdad: en la copia de un pueblo que ya estaba en pruebas/, ese no sirve
     (sería reskinearlo sobre sí mismo y todo serían «restos») */
  const otro = fs.existsSync(pruebas) ? fs.readdirSync(pruebas).find(d => {
    const f = path.join(pruebas, d, 'municipio.json');
    return fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).nombre !== M.nombre;
  }) : null;
  if (!otro) { comprobar(false, 'reskin: falta pruebas/<otro municipio>/municipio.json (uno distinto de ' + M.nombre + ')'); return; }
  const dest = copiar();
  try {
    for (const d of ['marca', 'media', 'contenido']) { fs.rmSync(path.join(dest, d), { recursive: true, force: true }); fs.cpSync(path.join(pruebas, otro, d), path.join(dest, d), { recursive: true }); }
    fs.copyFileSync(path.join(pruebas, otro, 'municipio.json'), path.join(dest, 'municipio.json'));
    if (!fs.existsSync(path.join(dest, 'marca/_letra.json'))) fs.copyFileSync(path.join(RAIZ, 'marca/_letra.json'), path.join(dest, 'marca/_letra.json'));
    const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
    if (ap.status !== 0) { comprobar(false, 'reskin: aplicar.mjs falla con ' + otro + ' → ' + (ap.stderr || ap.stdout).slice(-400)); return; }
    const otroM = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
    /* lo que el otro municipio también tiene no es un resto: Segura y Fuente de Cantos son los dos de Tentudía */
    const delOtro = JSON.stringify(otroM).toLowerCase();
    const restos = new RegExp([M.nombre, M.nombre_corto + ' ', M.sede.base.replace(/^https:\/\//, ''), M.contacto.correo, M.contacto.telefono, M.comarca, ...((M.corporacion && M.corporacion.miembros) || []).map(m => m.nombre)]
      .filter(s => s && !delOtro.includes(s.trim().toLowerCase())).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const publicados = [...fs.readdirSync(dest).filter(f => /\.(html|json)$/.test(f) && f !== 'municipio.json' && f !== 'package.json' && f !== 'package-lock.json'),
      ...['css/marca.css', 'css/base.css', 'js/main.js', 'js/vivo.js', 'js/cortina.js', 'js/tramites-datos.js'], ...fs.readdirSync(path.join(dest, 'contenido')).map(f => 'contenido/' + f)];
    const conRestos = publicados.filter(f => restos.test(fs.readFileSync(path.join(dest, f), 'utf8'))).map(f => f + ' («' + fs.readFileSync(path.join(dest, f), 'utf8').match(restos)[0] + '»)');
    comprobar(!conRestos.length && fs.readFileSync(path.join(dest, 'index.html'), 'utf8').includes(otroM.nombre),
      `reskin a ${otroM.nombre}: ${publicados.length} archivos publicados sin ningún resto de ${M.nombre}` + (conRestos.length ? ' → ' + conRestos.slice(0, 5).join(', ') : ''));
    /* la copia también pasa axe y no desborda */
    const srv = crearServidor(dest, null);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const b = 'http://127.0.0.1:' + srv.address().port + '/';
    const ctx = await navegador.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, JSON.parse(fs.readFileSync(path.join(dest, 'marca/marca.json'), 'utf8')).slug);
    const page = await ctx.newPage();
    const viol = [], desb = [];
    for (const p of ['index.html', 'tramites.html', 'ayuntamiento.html', 'telefonos.html', 'pueblo.html', 'avisos.html', 'noticias.html']) {
      await page.goto(b + p, { waitUntil: 'networkidle' });
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      r.violations.forEach(v => viol.push(p + ': ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(p);
      if (await page.evaluate(() => { const n = document.querySelector('.cabecera__nombre').getBoundingClientRect(), a = document.querySelector('.cabecera__acciones').getBoundingClientRect(); return n.right > a.left + 0.5; })) desb.push(p + ' (el nombre pisa los botones)');
      if (CAPTURAS && ['index.html', 'pueblo.html'].includes(p)) await page.screenshot({ path: captura('reskin-' + otro + '-' + p.replace('.html', '') + '-m.png'), fullPage: true });
    }
    await ctx.close(); srv.close();
    comprobar(!viol.length && !desb.length, `reskin a ${otroM.nombre}: 0 violaciones de axe y sin scroll horizontal a 320 px (con menos datos: sin pleno, sin noticias, sin placa)` + (viol.length ? ' → ' + viol.join(', ') : '') + (desb.length ? ' → desborda ' + desb.join(', ') : ''));
  } finally { fs.rmSync(dest, { recursive: true, force: true }); }

  /* "propuesta": false quita la banda y el título de compartir */
  const dest2 = copiar();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dest2, 'municipio.json'), 'utf8'));
    m.propuesta = false;
    fs.writeFileSync(path.join(dest2, 'municipio.json'), JSON.stringify(m, null, 2));
    spawnSync('node', [path.join(dest2, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest2 });
    const conBanda = fs.readdirSync(dest2).filter(f => f.endsWith('.html')).filter(f => /data-propuesta|no es la web oficial|Propuesta de web/.test(fs.readFileSync(path.join(dest2, f), 'utf8')));
    comprobar(!conBanda.length, '"propuesta": false quita la banda, la nota del pie y el «Propuesta de web» del título de compartir' + (conBanda.length ? ' → queda en ' + conBanda.join(', ') : ''));
  } finally { fs.rmSync(dest2, { recursive: true, force: true }); }
}

/* ── secciones opcionales que este municipio no usa: se prueban con datos de muestra ──
   Sin esto, «Para visitar», «Normativa y documentos» y los impresos en Word solo se verían
   en el municipio que los necesitó, y un cambio de la plantilla podría romperlos sin avisar. */
async function opcionales() {
  const muestra = path.join(RAIZ, 'pruebas', 'opcionales.json');
  if (!fs.existsSync(muestra)) { comprobar(false, 'opcionales: falta pruebas/opcionales.json'); return; }
  const O = JSON.parse(fs.readFileSync(muestra, 'utf8'));
  const propio = { visitas: ((M.pueblo || {}).visitas || []).length, documentos: (M.documentos || []).length,
    establecimientos: ((M.pueblo || {}).establecimientos || []).length, canal: !!(M.canal_avisos && M.canal_avisos.url), instalaciones: (M.instalaciones || []).length };
  /* en la web real: cada sección sale solo si el municipio tiene datos */
  const ayto = leer(RAIZ, 'ayuntamiento.html'), pue = leer(RAIZ, 'pueblo.html'), tel = leer(RAIZ, 'telefonos.html');
  comprobar(/id="t-documentos"/.test(ayto) === propio.documentos > 0 && /id="t-visitas"/.test(pue) === propio.visitas > 0 && /id="t-instalaciones"/.test(tel) === propio.instalaciones > 0,
    `opcionales: «Normativa y documentos», «Para visitar» e «Instalaciones municipales» salen solo con datos (aquí ${propio.documentos} grupos de documentos, ${propio.visitas} visitas y ${propio.instalaciones} grupos de instalaciones)`);
  comprobar(/id="t-establecimientos"/.test(pue) === propio.establecimientos > 0 && /id="t-canal"/.test(leer(RAIZ, 'avisos.html')) === propio.canal,
    `opcionales: «Dónde comer y dormir» y «Reciba los avisos en el móvil» salen solo con datos (aquí ${propio.establecimientos} grupos y ${propio.canal ? 'con' : 'sin'} canal de avisos)`);
  const dest = copiar();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
    m.pueblo = { ...(m.pueblo || {}), visitas: O.pueblo.visitas, establecimientos: O.pueblo.establecimientos, establecimientos_fuente: O.pueblo.establecimientos_fuente };
    m.canal_avisos = O.canal_avisos;
    m.documentos = O.documentos;
    m.instalaciones = O.instalaciones;
    m.tramites.todos = [...m.tramites.todos, ...O.tramites_extra];
    m.servicios = [...m.servicios, ...O.servicios_extra];
    /* lo nuevo del panel «Hoy»: farmacias con teléfono, dos recogidas y un pleno siempre a 10 días */
    if (O.farmacias) m.farmacias = O.farmacias;
    if (O.recogida) m.recogida = O.recogida;
    const enDias = n => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    if (O.plenos_dentro_de_dias) m.plenos = O.plenos_dentro_de_dias.map(({ dias, ...p }) => ({ ...p, fecha: enDias(dias) }));
    /* cabeceras: una página corriente con foto (la primera de media/ con crédito) y «El pueblo» sin
       ella, para probar las dos variantes que el municipio no usa */
    const fotoCab = Object.keys(JSON.parse(fs.readFileSync(path.join(dest, 'media', 'creditos.json'), 'utf8'))).find(k => !k.startsWith('_') && fs.existsSync(path.join(dest, 'media', k + '.jpg')));
    m.cabeceras = fotoCab ? { ayuntamiento: { archivo: fotoCab, alt: 'Foto de prueba de la cabecera' } } : {};
    fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(m, null, 2));
    const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
    if (ap.status !== 0) { comprobar(false, 'opcionales: aplicar.mjs falla con los datos de muestra → ' + (ap.stderr || ap.stdout).slice(-400)); return; }
    const srv = crearServidor(dest, null);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const b = 'http://127.0.0.1:' + srv.address().port + '/';
    const malos = [], viol = [], desb = [];
    for (const [w, h] of [[320, 640], [1440, 900]]) {
      const ctx = await navegador.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, SLUG);
      const page = await ctx.newPage();
      await page.goto(b + 'ayuntamiento.html', { waitUntil: 'networkidle' });
      const doc = await page.evaluate(() => {
        const s = document.getElementById('documentos');
        if (!s) return null;
        s.querySelectorAll('details').forEach(d => { d.open = true; });
        return { grupos: s.querySelectorAll('details').length, enlaces: [...s.querySelectorAll('.tema__lista a')].map(a => ({ h: a.getAttribute('href'), sr: a.querySelector('.sr').textContent, vis: a.getBoundingClientRect().height > 0 })) };
      });
      const total = O.documentos.reduce((n, g) => n + g.items.length, 0);
      if (!doc || doc.grupos !== O.documentos.length || doc.enlaces.length !== total || doc.enlaces.some(e => !e.vis)) malos.push(`${w} px: documentos ${JSON.stringify(doc && { grupos: doc.grupos, enlaces: doc.enlaces.length })}`);
      else if (!doc.enlaces.filter(e => /\.pdf$/.test(e.h)).every(e => /PDF/.test(e.sr)) || !doc.enlaces.filter(e => !/\.pdf$/.test(e.h)).every(e => /otra web/.test(e.sr))) malos.push('documentos: el texto oculto no dice qué se abre');
      viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => 'ayuntamiento.html: ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(w + ' ayuntamiento.html');
      if (fotoCab) {
        const tipo = await page.evaluate(() => document.querySelector('.cabeza-pagina').className);
        if (!/--foto/.test(tipo) || /--grande/.test(tipo)) malos.push('cabecera con foto en una página corriente: ' + tipo);
        (await medirCabecera(page, 'puerta')).forEach(f => malos.push(`${w} px ayuntamiento.html (cabecera con foto): ${f}`));
      }
      await page.goto(b + 'pueblo.html', { waitUntil: 'networkidle' });
      if (!/--arco/.test(await page.evaluate(() => document.querySelector('.cabeza-pagina').className))) malos.push('«El pueblo» sin foto no lleva el arco de línea');
      (await medirCabecera(page, 'puerta')).forEach(f => malos.push(`${w} px pueblo.html (sin foto): ${f}`));
      const vis = await page.evaluate(() => [...document.querySelectorAll('.visita')].map(v => ({ titulo: v.querySelector('h3').textContent, datos: v.querySelectorAll('dt').length, tel: !!v.querySelector('a[href^="tel:"]') })));
      const esperadas = O.pueblo.visitas.map(v => ({ titulo: v.nombre, datos: ['direccion', 'horario', 'precio'].filter(k => v[k]).length, tel: !!v.telefono }));
      if (JSON.stringify(vis) !== JSON.stringify(esperadas)) malos.push(`${w} px: visitas ${JSON.stringify(vis)}`);
      const est = await page.evaluate(() => { const s = document.querySelector('[aria-labelledby="t-establecimientos"]'); return s ? { grupos: s.querySelectorAll('.listin-grupo').length, filas: [...s.querySelectorAll('.listin__fila')].filter(f => f.getBoundingClientRect().height > 0).length, tel: s.querySelectorAll('a[href^="tel:"]').length, fuente: s.querySelector(':scope > .contenedor > .nota-fuente').textContent } : null; });
      const filasEst = O.pueblo.establecimientos.reduce((n, g) => n + g.items.length, 0), telEst = O.pueblo.establecimientos.reduce((n, g) => n + g.items.filter(e => e.telefono).length, 0);
      if (!est || est.grupos !== O.pueblo.establecimientos.length || est.filas !== filasEst || est.tel !== telEst || !est.fuente.includes(O.pueblo.establecimientos_fuente)) malos.push(`${w} px: establecimientos ${JSON.stringify(est)}`);
      viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => 'pueblo.html: ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(w + ' pueblo.html');
      if (CAPTURAS && w === 320) await page.screenshot({ path: captura('opcionales-visitas-m.png'), fullPage: true });
      await page.goto(b + 'avisos.html', { waitUntil: 'networkidle' });
      const canal = await page.evaluate(() => { const s = document.querySelector('.canal-avisos'); return s ? [...s.querySelectorAll('a')].map(a => ({ h: a.getAttribute('href'), sr: a.querySelector('.sr').textContent })) : null; });
      if (!canal || canal.length !== 1 + (O.canal_avisos.otros || []).length || canal[0].h !== O.canal_avisos.url || !canal.every(a => /otra web/.test(a.sr))) malos.push('canal de avisos: ' + JSON.stringify(canal));
      const pasos = await page.evaluate(() => document.querySelectorAll('.canal-avisos__pasos li').length);
      if (pasos !== (O.canal_avisos.pasos || []).length) malos.push('canal de avisos: ' + pasos + ' pasos para apuntarse');
      viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => 'avisos.html: ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(w + ' avisos.html');
      await page.goto(b + 'tramites.html', { waitUntil: 'networkidle' });
      const word = await page.evaluate(() => { const a = [...document.querySelectorAll('#todos-lista a')].find(x => /\.doc$/.test(x.getAttribute('href'))); return a ? { etiqueta: a.querySelector('.etiqueta-pdf').textContent, sr: a.querySelector('.sr').textContent } : null; });
      if (!word || word.etiqueta !== 'Word' || !/Word/.test(word.sr)) malos.push('impreso en Word: ' + JSON.stringify(word));
      await page.goto(b + 'telefonos.html', { waitUntil: 'networkidle' });
      const sinTel = await page.evaluate(n => { const f = [...document.querySelectorAll('.listin__fila')].find(x => x.querySelector('.listin__nombre').textContent.startsWith(n)); return f ? { enlace: !!f.querySelector('a'), detalle: (f.querySelector('small') || {}).textContent || '' } : null; }, O.servicios_extra[0].nombre);
      if (!sinTel || sinTel.enlace || !sinTel.detalle.includes(O.servicios_extra[0].horario)) malos.push('servicio sin teléfono: ' + JSON.stringify(sinTel));
      const ins = await page.evaluate(() => [...document.querySelectorAll('#instalaciones .instalaciones-grupo')].map(g => ({ grupo: g.querySelector('h3').textContent,
        items: [...g.querySelectorAll('.instalacion')].map(i => ({ titulo: i.querySelector('h4').textContent, datos: i.querySelectorAll('dt').length, tel: !!i.querySelector('a[href^="tel:"]'),
          web: (i.querySelector('a:not([href^="tel:"]) .sr') || {}).textContent || null })) })));
      const insEsperadas = O.instalaciones.map(g => ({ grupo: g.grupo, items: g.items.map(i => ({ titulo: i.nombre, datos: ['direccion', 'horario', 'precio'].filter(k => i[k]).length, tel: !!i.telefono,
        web: i.url ? ': ' + i.nombre + ', se abre otra web' : null })) }));
      if (JSON.stringify(ins) !== JSON.stringify(insEsperadas)) malos.push(`${w} px: instalaciones ${JSON.stringify(ins)}`);
      if (CAPTURAS && w === 320) await page.screenshot({ path: captura('opcionales-instalaciones-m.png'), fullPage: true });
      viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => 'telefonos.html: ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(w + ' telefonos.html');
      /* portada: farmacia con teléfono, «Más hoy» (tiempo, pleno y recogidas) y el canal en el panel y en el pie */
      await page.goto(b + 'index.html', { waitUntil: 'networkidle' });
      const hoyO = await page.evaluate(() => { const h = document.querySelector('.hoy'); return { farmacia: !!h.querySelector('.hoy__fila--farmacia a[href^="tel:"]'), breves: h.querySelectorAll('.hoy__breve').length,
        enPanel: !!h.querySelector('.hoy__canal'), canal: [...document.querySelectorAll('.lado__bloque--canal a')].map(a => a.getAttribute('href')), pasos: document.querySelectorAll('.lado__bloque--canal .lado__pasos li').length,
        pie: [...document.querySelectorAll('.pie__canal a')].map(a => a.getAttribute('href')), ics: !!document.querySelector('.lado__bloque--pleno [href$=".ics"], .lado__bloque--pleno [data-ics]') }; });
      /* v3: en «Más hoy», el tiempo y las recogidas (el pleno solo el mismo día); el pleno y el canal, en el lado del tablón */
      const brevesEsperados = (m.ine ? 1 : 0) + Math.min(2, O.recogida.length);
      if (!hoyO.farmacia || hoyO.breves < brevesEsperados || hoyO.breves > brevesEsperados + 1 || !hoyO.ics || hoyO.enPanel || hoyO.canal[0] !== O.canal_avisos.url || hoyO.pasos !== O.canal_avisos.pasos.length || hoyO.pie[0] !== O.canal_avisos.url)
        malos.push(`${w} px: panel «Hoy» ${JSON.stringify(hoyO)} (esperaba ${brevesEsperados} líneas en «Más hoy»)`);
      viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => 'index.html: ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(w + ' index.html');
      if (CAPTURAS) await page.locator('.hoy').screenshot({ path: captura(`opcionales-hoy-${w}.png`) });
      /* agenda: el pleno con su convocatoria y su .ics */
      await page.goto(b + 'agenda.html', { waitUntil: 'networkidle' });
      const pl = await page.evaluate(() => { const e = [...document.querySelectorAll('.evento')].find(x => x.querySelector('.chip') && x.querySelector('.chip').textContent === 'Pleno'); return e ? { conv: !!e.querySelector('a.evento__enlace[href*="convocatoria"]'), ics: !!e.querySelector('a.evento__ics[href$=".ics"]') } : null; });
      if (!pl || !pl.conv || !pl.ics) malos.push('agenda: pleno ' + JSON.stringify(pl));
      viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => 'agenda.html: ' + v.id));
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) desb.push(w + ' agenda.html');
      await ctx.close();
    }
    srv.close();
    /* un INE que no casa con el DIR3: aplicar.mjs se niega (AEMET enseñaría otro pueblo) */
    if (m.legal && /^L01\d{6}$/.test(m.legal.dir3 || '')) {
      fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify({ ...m, ine: String((Number(m.legal.dir3.slice(3, 8)) + 2) % 100000).padStart(5, '0') }, null, 2));
      const mal = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      if (mal.status === 0 || !/ine «\d{5}» no casa con legal\.dir3/.test(mal.stderr)) malos.push('aplicar.mjs acepta un INE que no casa con el DIR3');
    }
    comprobar(!malos.length && !viol.length && !desb.length,
      'opcionales con datos de muestra: «Normativa y documentos» (desplegables, cada enlace dice qué abre), «Para visitar» (dirección, horario, entrada y teléfono solo si constan), «Dónde comer y dormir» (grupos, teléfonos y fuente), el canal de avisos, impresos en Word, un servicio del listín sin teléfono e «Instalaciones municipales» (grupos de fichas, cada dato solo si consta, el enlace dice qué abre), el panel «Hoy» completo (farmacia con teléfono, tiempo, pleno con .ics, dos recogidas, canal en el panel y en el pie, pasos para apuntarse), el pleno en la agenda con convocatoria y .ics, un INE que no casa con el DIR3 rechazado, una cabecera corriente con foto y «El pueblo» sin foto; 0 violaciones de axe y sin scroll horizontal a 320 y 1440 px' +
      (malos.length ? ' → ' + malos.join(' | ') : '') + (viol.length ? ' → axe: ' + [...new Set(viol)].join(', ') : '') + (desb.length ? ' → desborda ' + desb.join(', ') : ''));
  } finally { fs.rmSync(dest, { recursive: true, force: true }); }
}

/* ── capturas para mirarlas ── */
async function capturas() {
  for (const [w, h, suf] of [[1440, 900, 'escritorio'], [390, 844, 'movil']]) {
    const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
    for (const p of PAGINAS.filter(p => !p.startsWith('noticia-') || p === PAGINAS.find(x => x.startsWith('noticia-')))) {
      await ir(page, p);
      await page.screenshot({ path: captura(p.replace('.html', '') + '-' + suf + '.png'), fullPage: true });
    }
    await ir(page, 'index.html', '?revision');
    await page.click('[data-densidad="sobria"]');
    await page.screenshot({ path: captura('index-sobria-' + suf + '.png'), fullPage: true });
    await page.click('[data-densidad="puerta"]');
    for (const pal of ['b', 'c']) { await page.click(`[data-paleta="${pal}"]`); await page.screenshot({ path: captura(`index-paleta-${pal}-${suf}.png`) }); }
    await page.click('[data-paleta="a"]');
    if (suf === 'movil') {
      await page.click('[data-boton-menu]'); await page.screenshot({ path: captura('menu-abierto-movil.png') }); await page.keyboard.press('Escape');
    }
    await page.click('[data-abrir-buscador]'); await page.fill('#buscador [data-buscador-campo]', 'obra'); await espera(500);
    await page.screenshot({ path: captura('buscador-' + suf + '.png') });
    await ctx.close();
  }
  const { ctx, page } = await nueva({ viewport: { width: 375, height: 667 }, conCookies: true });
  await ir(page, 'index.html');
  await page.screenshot({ path: captura('primera-pantalla-375x667.png') });
  await ctx.close();
}

/* ── primera pantalla: lo que se viene a hacer, sin bajar ──
   El buscador de trámites (campo y botón) y «Hacer un trámite» caben en la primera pantalla del
   móvil pequeño y del escritorio; la franja urgente va en una línea en móvil con «Ver aviso» a la
   vista. (v3: la franja va en dos líneas como mucho, sin recortar; v3pliegue lo mide.) Sustituye a «el panel Hoy asoma», que ahora va debajo de los botones a propósito. */
async function primeraPantalla() {
  const malos = [];
  for (const [w, h] of [[375, 667], [390, 844], [1440, 900]]) {
    const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
    await ir(page, 'index.html');
    const r = await page.evaluate(() => {
      const caja = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const campo = caja('.hero__buscador [data-buscador-campo]'), boton = caja('.hero__buscador [type="submit"]'), tramite = caja('.hero__botones .boton--marca');
      const franja = document.querySelector('.franja-urgente:not([hidden])');
      const ver = franja && franja.querySelector('.franja-urgente__ver');
      return { campo: campo && campo.bottom, boton: boton && boton.bottom, tramite: tramite && tramite.bottom, ancho: innerWidth,
        franja: franja ? { alto: franja.getBoundingClientRect().height, ver: ver ? ver.getBoundingClientRect().right : 9999 } : null };
    });
    const tope = Math.max(r.campo || 9999, r.boton || 9999, r.tramite || 9999);
    if (tope > h) malos.push(`${w}×${h}: buscador o «Hacer un trámite» acaban a ${Math.round(tope)} px`);
    if (w < 768 && r.franja && (r.franja.alto > 64 || r.franja.ver > r.ancho)) malos.push(`${w}×${h}: la franja del aviso mide ${Math.round(r.franja.alto)} px (más de dos líneas) o su flecha se sale`);
    await ctx.close();
  }
  comprobar(!malos.length, 'primera pantalla (375×667, 390×844 y 1440×900): el buscador de trámites y «Hacer un trámite» se ven sin bajar; en móvil la franja del aviso va en dos líneas como mucho con la flecha a la vista' + (malos.length ? ' → ' + malos.join(' | ') : ''));

  /* el buscador de la portada: resultados aquí mismo, cuenta en role=status, como mucho 5; y sin
     JavaScript el formulario lleva a tramites.html con lo escrito, donde se busca solo */
  const { ctx, page } = await nueva();
  await ir(page, 'index.html');
  const q = (M.tramites.atajos || [])[0] ? M.tramites.atajos[0].nombre : 'certificado';
  await page.fill('.hero__buscador [data-buscador-campo]', q);
  await page.waitForFunction(() => document.querySelector('.hero__buscador [data-buscador-cuenta]').textContent.length > 0, null, { timeout: 3000 }).catch(() => {});
  const b = await page.evaluate(() => {
    const f = document.querySelector('.hero__buscador');
    return { estado: f.querySelector('[data-buscador-cuenta]').getAttribute('role'), cuenta: f.querySelector('[data-buscador-cuenta]').textContent,
      n: f.querySelectorAll('[data-buscador-resultados] .resultados__lista a').length, accion: f.getAttribute('action'), metodo: f.getAttribute('method'), nombre: f.querySelector('[data-buscador-campo]').name,
      etiqueta: (f.querySelector('label[for="' + f.querySelector('[data-buscador-campo]').id + '"]') || {}).textContent || '' };
  });
  await page.click('.hero__buscador [type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelectorAll('[data-buscador-pagina] [data-buscador-resultados] a').length > 0, null, { timeout: 3000 }).catch(() => {});
  const destino = await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, q: new URLSearchParams(location.search).get('q'), valor: (document.querySelector('[data-buscador-pagina] [data-buscador-campo]') || {}).value, n: document.querySelectorAll('[data-buscador-pagina] [data-buscador-resultados] a').length }));
  await ctx.close();
  comprobar(b.estado === 'status' && b.n > 0 && b.n <= 5 && /encontrado/.test(b.cuenta) && b.accion === 'tramites.html#buscar' && b.metodo === 'get' && b.nombre === 'q' && b.etiqueta.trim().length > 3 &&
    /tramites\.html\?q=[^#]+#buscar$/.test(destino.url) && destino.q === q && destino.valor === q && destino.n > 0,
    `buscador de la portada: «${q}» → ${b.n} resultados aquí (≤ 5) con la cuenta en role=status («${b.cuenta.slice(0, 60)}»); «Buscar» (o sin JavaScript) lleva a ${destino.url} y allí busca solo (${destino.n} resultados)`);

  /* temas: todos cerrados de entrada */
  const t = await nueva();
  await ir(t.page, 'index.html');
  const temas = await t.page.evaluate(() => ({ total: document.querySelectorAll('.temas .tema').length, abiertos: document.querySelectorAll('.temas .tema[open]').length }));
  await t.ctx.close();
  comprobar(temas.total > 0 && temas.abiertos === 0, `temas de trámites: los ${temas.total} desplegables, cerrados de entrada`);
}

/* ═════════════ v3 · PLIEGUE: la primera pantalla ═════════════
   Hero entero en 1280 × 720 y 1366 × 768 con las columnas equilibradas; a 375 × 667 con el aviso
   de cookies, el campo del buscador entero y su placeholder sin cortar; las bandas de arriba
   compactas (propuesta + aviso en una fila en escritorio, el aviso en ≤ 2 líneas sin puntos
   suspensivos en móvil); la tira «Hoy» con sus fichas como tablero (y sin huecos si falta un dato);
   la foto del arco al azar sin CLS (y sin hero_fotos, la de siempre); el aviso programado en ámbar
   y el urgente en rojo, los dos AA; y con movimiento reducido, nada se mueve. */
async function v3Pliegue() {
  const rgbHex = s => '#' + (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
  const datosDe = html => JSON.parse(html.match(/<script type="application\/json" id="datos-vivos">([\s\S]*?)<\/script>/)[1]);
  /* reescribe los datos vivos de la portada antes de que main.js los pinte */
  const conDatos = async (page, cambiar) => {
    await page.route('**/index.html', async r => {
      const resp = await r.fetch(); const cuerpo = await resp.text();
      const D = datosDe(cuerpo); cambiar(D);
      r.fulfill({ response: resp, body: cuerpo.replace(/(<script type="application\/json" id="datos-vivos">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(D).replace(/</g, '\\u003c') + b) });
    });
  };

  /* 1. el hero cabe entero y está equilibrado (escritorio, sin el aviso de cookies) */
  {
    const malos = [];
    for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ir(page, 'index.html');
      const r = await page.evaluate(() => {
        const c = s => document.querySelector(s).getBoundingClientRect();
        const hero = c('.hero'), puerta = c('.puerta'), arco = c('#arco-hero'), texto = c('.hero__texto'), tira = c('.hoy-tira');
        return { hero: [hero.top, hero.bottom], vh: innerHeight, cp: (puerta.top + puerta.bottom) / 2, ct: (texto.top + texto.bottom) / 2,
          hueco: hero.bottom - Math.max(puerta.bottom, texto.bottom), arco: [arco.width, arco.height], tira: tira.top, dentro: !!document.querySelector('.hero [data-vivo="hoy"]') };
      });
      if (r.hero[0] < 0 || r.hero[1] > r.vh + 0.5) malos.push(`${w}×${h}: el hero va de ${Math.round(r.hero[0])} a ${Math.round(r.hero[1])} px`);
      if (Math.abs(r.cp - r.ct) > 24) malos.push(`${w}×${h}: arco y texto descentrados (${Math.round(r.cp - r.ct)} px)`);
      if (r.hueco > 64) malos.push(`${w}×${h}: ${Math.round(r.hueco)} px vacíos bajo el arco o el texto`);
      if (r.arco[1] < r.arco[0] / 2 - 1) malos.push(`${w}×${h}: el arco no es de medio punto`);
      if (r.dentro || r.tira < r.hero[1] - 1) malos.push(`${w}×${h}: «Hoy» sigue dentro del hero`);
      await ctx.close();
    }
    comprobar(!malos.length, 'v3 pliegue · hero: entero en 1280×720, 1366×768 y 1440×900, con el arco (de medio punto) y el texto centrados el uno con el otro, sin hueco debajo y «Hoy» fuera, en su tira' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 2. móvil con el aviso de cookies: el buscador entero, el placeholder sin cortar, el aviso de
     cookies en ≤ 2 líneas con el botón al lado; en escritorio tampoco tapa el buscador */
  {
    const malos = [];
    for (const [w, h] of [[375, 667], [360, 640], [1366, 768]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h }, conCookies: true });
      await ir(page, 'index.html');
      const r = await page.evaluate(() => {
        const campo = document.querySelector('.hero__buscador [data-buscador-campo]'), boton = document.querySelector('.hero__buscador [type="submit"]');
        const cookies = document.getElementById('cookies'), texto = cookies.querySelector('.cookies__texto p'), acepta = cookies.querySelector('[data-aceptar-cookies]');
        const c = campo.getBoundingClientRect(), b = boton.getBoundingClientRect(), k = cookies.getBoundingClientRect(), t = texto.getBoundingClientRect(), a = acepta.getBoundingClientRect();
        const cs = getComputedStyle(campo), lienzo = document.createElement('canvas').getContext('2d');
        lienzo.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const libre = campo.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const tapa = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest('#cookies'); };
        return { campo: [c.top, c.bottom], boton: b.bottom, cookies: k.top, visible: cookies.checkVisibility(), placeholder: lienzo.measureText(campo.placeholder).width, libre,
          lineas: Math.round(t.height / parseFloat(getComputedStyle(texto).lineHeight)), alLado: a.top < t.bottom && a.left > t.left,
          tapado: tapa(c.left + 4, c.top + 4) || tapa(c.right - 4, c.bottom - 4) || tapa(b.right - 4, b.bottom - 4) };
      });
      if (!r.visible) malos.push(`${w}×${h}: no sale el aviso de cookies`);
      if (r.campo[0] < 0 || Math.max(r.campo[1], r.boton) > Math.min(r.cookies, h) || r.tapado) malos.push(`${w}×${h}: el buscador (${Math.round(r.campo[0])}–${Math.round(Math.max(r.campo[1], r.boton))} px) no se ve entero con el aviso de cookies (desde ${Math.round(r.cookies)} px)`);
      if (r.placeholder > r.libre) malos.push(`${w}×${h}: el placeholder se corta (${Math.round(r.placeholder)} de ${Math.round(r.libre)} px)`);
      if (r.lineas > 2 || !r.alLado) malos.push(`${w}×${h}: el aviso de cookies ocupa ${r.lineas} líneas o el botón no va al lado`);
      if (CAPTURAS && w === 375) await page.screenshot({ path: captura('v3-primera-375x667-cookies.png') });
      await ctx.close();
    }
    comprobar(!malos.length, 'v3 pliegue · móvil (375×667 y 360×640) con el aviso de cookies: el campo del buscador y su botón se ven enteros sin bajar y sin nada encima, el placeholder cabe, y el aviso va en ≤ 2 líneas con el botón al lado (también a 1366×768, sin tapar el buscador)' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 3. bandas de arriba: la propuesta en todas las páginas y a la vista; en escritorio, propuesta y
     aviso en UNA fila; en móvil, el aviso en ≤ 2 líneas, sin puntos suspensivos */
  {
    const malos = [];
    const destacado = (contenido('avisos').avisos || []).some(a => a.caduca && a.caduca >= new Date().toISOString().slice(0, 10) && (a.urgente || /urgente|programado/.test(a.gravedad || '')));
    for (const [w, h] of [[375, 667], [1366, 768]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      for (const p of ['index.html', 'tramites.html', 'pueblo.html']) {
        await ir(page, p);
        const r = await page.evaluate(() => {
          const pr = document.querySelector('.propuesta'), fr = document.querySelector('.franja-urgente:not([hidden]) .franja-urgente__enlace');
          const res = { propuesta: pr ? pr.checkVisibility() && pr.getBoundingClientRect().height > 0 : null };
          if (fr) {
            const t = fr.querySelector('.franja-urgente__texto'), cs = getComputedStyle(t), pb = pr.getBoundingClientRect(), fb = fr.getBoundingClientRect();
            res.franja = { lineas: Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight)), recorte: cs.textOverflow === 'ellipsis' || t.scrollWidth > t.clientWidth + 1,
              misma: Math.abs(pb.top - fb.top) < 1, alto: pb.height + fb.height, juntas: Math.abs(pb.bottom - fb.top) < 1 };
          }
          return res;
        });
        if (M.propuesta !== false && !r.propuesta) malos.push(`${w} px ${p}: la banda de propuesta no se ve`);
        if (destacado && !r.franja) malos.push(`${w} px ${p}: no sale la franja del aviso`);
        if (r.franja) {
          if (r.franja.recorte || r.franja.lineas > 2) malos.push(`${w} px ${p}: el aviso se recorta o pasa de 2 líneas (${r.franja.lineas})`);
          if (w >= 1024 && M.propuesta !== false && !r.franja.misma) malos.push(`${w} px ${p}: propuesta y aviso no comparten fila`);
          if (w < 1024 && (!r.franja.juntas || r.franja.alto > 96)) malos.push(`${w} px ${p}: propuesta + aviso miden ${Math.round(r.franja.alto)} px`);
        }
      }
      if (CAPTURAS) await page.locator('.cabecera').screenshot({ path: captura(`v3-bandas-${w}.png`) });
      await ctx.close();
    }
    comprobar(!malos.length, 'v3 pliegue · bandas: la propuesta a la vista en todas las páginas; en escritorio, propuesta y aviso en una sola fila; en móvil, apiladas en ≤ 96 px con el aviso en ≤ 2 líneas y sin puntos suspensivos' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 4. la tira «Hoy»: sus fichas como tablero (en fila en escritorio, 2 × 2 en móvil) y, si falta un
     dato, la ficha no sale y no queda hueco; se sigue repintando en vivo (data-vivo="hoy") */
  {
    const malos = [];
    const fichas = () => [...document.querySelectorAll('.hoy-tira [data-vivo="hoy"] .hoy__lista > .hoy__fila')].map(f => {
      const b = f.getBoundingClientRect(); return { clase: f.className, x: Math.round(b.left), y: Math.round(b.top), w: b.width, r: Math.round(b.right) };
    });
    const lista = () => { const b = document.querySelector('.hoy__lista').getBoundingClientRect(); return { x: Math.round(b.left), r: Math.round(b.right) }; };
    const tieneFarmacia = !!(M.farmacias && ((M.farmacias.lista || []).length || M.farmacias.oficial));
    /* v3c · transparencia: más la ficha «Empleo» si hoy hay alguna oferta con el plazo abierto */
    const Vh = cargarVivo(), Dh = JSON.parse(leer(RAIZ, 'index.html').match(/<script type="application\/json" id="datos-vivos">([\s\S]*?)<\/script>/)[1]);
    const conEmpleo = Vh.empleosAbiertos(Dh, Vh.ahoraEn('Europe/Madrid', new Date())).length > 0;
    const esperadas = 3 + (tieneFarmacia ? 1 : 0) + (conEmpleo ? 1 : 0);
    for (const [w, h, cols] of [[1366, 768, esperadas], [375, 667, 2]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ir(page, 'index.html');
      const f = await page.evaluate(fichas), l = await page.evaluate(lista);
      const filas = new Set(f.map(x => x.y)).size, columnas = new Set(f.map(x => x.x)).size;
      const titulo = await page.evaluate(() => { const h2 = document.getElementById('hoy-titulo'); return h2 && h2.closest('.hoy-tira') ? h2.textContent : null; });
      if (f.length !== esperadas) malos.push(`${w} px: ${f.length} fichas (esperaba ${esperadas})`);
      if (!['ayto', 'agenda', 'aviso'].every(k => f.some(x => x.clase.includes('hoy__fila--' + k))) || (tieneFarmacia && !f.some(x => x.clase.includes('hoy__fila--farmacia')))) malos.push(`${w} px: faltan fichas (${f.map(x => x.clase).join(', ')})`);
      if (columnas !== cols || filas !== Math.ceil(f.length / cols)) malos.push(`${w} px: ${columnas} columnas y ${filas} filas`);
      if (!titulo) malos.push(`${w} px: la tira no lleva su h2 «Hoy en …»`);
      const iconos = await page.evaluate(() => [...document.querySelectorAll('.hoy__lista > .hoy__fila')].every(x => x.querySelector(':scope > .hoy__etiqueta .hoy__icono svg') && x.querySelector('.hoy__valor, .hoy__nota')));
      if (!iconos) malos.push(`${w} px: una ficha sin icono, etiqueta o dato`);
      if (w === 375 && f.some(x => x.w < 140)) malos.push('375 px: fichas de menos de 140 px');
      if (CAPTURAS) await page.locator('.hoy-tira').screenshot({ path: captura(`v3-hoy-${w}.png`) });
      await ctx.close();
    }
    /* sin farmacia, sin avisos ni tablón: quedan dos o tres fichas que llenan su fila, sin huecos */
    for (const [w, h] of [[1366, 768], [375, 667]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await conDatos(page, D => { D.farmacias = null; });
      await ir(page, 'index.html');
      const f = await page.evaluate(fichas), l = await page.evaluate(lista);
      const html = await page.evaluate(() => document.querySelector('[data-vivo="hoy"]').innerHTML);
      if (/Farmacia de guardia/.test(html)) malos.push(`${w} px sin farmacia: sale la ficha`);
      const n = f.length, ultima = f[n - 1], resto = f.slice(0, -1);
      if (n !== esperadas - (tieneFarmacia ? 1 : 0)) malos.push(`${w} px sin farmacia: ${n} fichas`);
      if (w >= 1024 && (new Set(f.map(x => x.y)).size !== 1 || Math.abs(f[0].x - l.x) > 1 || Math.abs(ultima.r - l.r) > 1)) malos.push(`${w} px sin farmacia: las ${n} fichas no llenan la fila`);
      if (w < 1024 && n % 2 === 1 && (Math.abs(ultima.x - l.x) > 1 || Math.abs(ultima.r - l.r) > 1)) malos.push(`${w} px sin farmacia: la última ficha, sola, no ocupa el ancho (hueco)`);
      if (!resto.length && n < 2) malos.push('sin farmacia: menos de dos fichas');
      await ctx.close();
    }
    {
      const { ctx, page } = await nueva({ viewport: { width: 1366, height: 768 } });
      await conDatos(page, D => { D.farmacias = null; D.avisos = []; D.tablon = { actualizado: '1999-01-01', entradas: [] }; D.tiempo = null; D.recogida = []; D.canal = null; D.agenda = D.agenda.filter(e => e.tipo !== 'pleno'); });
      await page.route('**/contenido/tablon.json*', r => r.abort());
      await ir(page, 'index.html');
      const f = await page.evaluate(fichas), l = await page.evaluate(lista);
      const pie = await page.evaluate(() => { const p = document.querySelector('.hoy__pie'); return p ? p.checkVisibility() : false; });
      if (f.length !== 2 || Math.abs(f[0].x - l.x) > 1 || Math.abs(f[1].r - l.r) > 1 || Math.abs(f[0].w - f[1].w) > 1) malos.push(`solo Ayuntamiento y agenda: ${f.length} fichas que no llenan la fila`);
      if (pie) malos.push('sin «Más hoy» ni canal, el pie de la tira sigue a la vista (vacío)');
      await ctx.close();
    }
    comprobar(!malos.length, `v3 pliegue · tira «Hoy»: ${esperadas} fichas con icono, etiqueta y dato, en una fila a 1366 px y 2 × 2 a 375 px; sin farmacia (o sin avisos ni «Más hoy») las que quedan llenan la fila, la impar ocupa el ancho en móvil y no queda ningún hueco ni pie vacío` + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 5. la foto del arco cambia entre cargas (varias semillas de Math.random), con su alt y su
     encuadre, precargada, sin CLS; sin JavaScript, la primera; y sin hero_fotos, la de fotos.hero */
  {
    const malos = [];
    const lista = (M.fotos && M.fotos.hero_fotos) || [];
    if (lista.length > 1) {
      const vistas = [];
      for (const s of [0, 0.26, 0.51, 0.76, 0.999]) {
        const { ctx, page } = await nueva({ viewport: { width: 1366, height: 768 } });
        await ctx.addInitScript(s => {
          Math.random = () => s;
          window.__cls = 0;
          /* solo lo que mueve el arco (el cambio de letra al cargar las webfonts es otra cosa y ya estaba) */
          try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput && e.sources.some(s => s.node && s.node.nodeType === 1 && s.node.closest('.puerta'))) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
        }, s);
        await ir(page, 'index.html');
        await espera(300);
        const r = await page.evaluate(() => {
          const imgs = document.querySelectorAll('#arco-hero img'), img = imgs[0], a = document.getElementById('arco-hero').getBoundingClientRect();
          const pre = document.querySelector('link[rel="preload"][as="image"]');
          return { n: imgs.length, src: img && img.getAttribute('src'), alt: img && img.alt, pos: img && img.style.objectPosition, carga: img && img.complete && img.naturalWidth > 0,
            pre: pre && pre.getAttribute('href'), arco: [Math.round(a.width), Math.round(a.height), Math.round(a.top)], cls: window.__cls };
        });
        const i = Math.min(lista.length - 1, Math.floor(s * lista.length)), f = lista[i];
        vistas.push(r.src);
        if (r.n !== 1 || r.src !== 'media/' + f.archivo + '.jpg' || r.alt !== f.alt || !r.carga) malos.push(`semilla ${s}: ${r.n} img, ${r.src} «${r.alt}» (esperaba ${f.archivo})`);
        if (r.pre !== r.src) malos.push(`semilla ${s}: la precarga (${r.pre}) no es la foto pintada`);
        if (r.cls > 0.001) malos.push(`semilla ${s}: CLS ${r.cls.toFixed(4)}`);
        if (vistas.length > 1 && JSON.stringify(r.arco) !== JSON.stringify(vistas.arco0)) malos.push(`semilla ${s}: el arco mide ${r.arco} (antes ${vistas.arco0})`);
        if (vistas.length === 1) vistas.arco0 = r.arco;
        await ctx.close();
      }
      if (new Set(vistas).size !== Math.min(lista.length, 5)) malos.push(`solo ${new Set(vistas).size} fotos distintas en ${vistas.length} cargas`);
      /* sin JavaScript: la primera, del noscript */
      const ctx = await navegador.newContext({ viewport: { width: 1366, height: 768 }, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
      const sinJs = await page.evaluate(() => [...document.querySelectorAll('#arco-hero img')].map(i => i.getAttribute('src')));
      if (sinJs.length !== 1 || sinJs[0] !== 'media/' + lista[0].archivo + '.jpg') malos.push('sin JavaScript: ' + JSON.stringify(sinJs));
      await ctx.close();
      /* si el <head> falla (sin la lista), el figure pinta la del noscript */
      const x = await nueva({ viewport: { width: 1366, height: 768 } });
      await x.ctx.addInitScript(() => { Object.defineProperty(window, '__heroFotos', { get() { return undefined; }, set() { throw new Error('roto'); } }); });
      await ir(x.page, 'index.html');
      const roto = await x.page.evaluate(() => [...document.querySelectorAll('#arco-hero img')].map(i => i.complete && i.naturalWidth > 0 && i.getAttribute('src')));
      if (roto.length !== 1 || roto[0] !== 'media/' + lista[0].archivo + '.jpg') malos.push('con el <head> roto: ' + JSON.stringify(roto));
      await x.ctx.close();
    } else notas.push('NOTA  · v3 pliegue: el municipio no tiene fotos.hero_fotos; se prueba solo la copia');
    /* una copia sin hero_fotos: la de fotos.hero, en un <img> de siempre, sin script ni precarga */
    const dest = copiar();
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
      const primera = (m.fotos && (m.fotos.hero_fotos || [])[0]) || (m.fotos && m.fotos.hero);
      m.fotos = primera ? { hero: { archivo: primera.archivo, alt: 'Foto única de prueba', posicion: '50% 50%' } } : {};
      fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(m, null, 2));
      const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      const idx = ap.status === 0 ? fs.readFileSync(path.join(dest, 'index.html'), 'utf8') : '';
      const fig = (idx.match(/<figure class="arco puerta__arco" id="arco-hero">([\s\S]*?)<\/figure>/) || [, ''])[1];
      if (ap.status !== 0) malos.push('sin hero_fotos, aplicar.mjs falla → ' + (ap.stderr || ap.stdout).slice(-200));
      else if (!primera) malos.push('sin foto que probar');
      else if (/<script|<noscript/.test(fig) || /__heroFotos/.test(idx.slice(0, idx.indexOf('</head>'))) || !fig.includes(`src="media/${primera.archivo}.jpg"`) || !fig.includes('alt="Foto única de prueba"')) malos.push('sin hero_fotos no sale fotos.hero en un <img> normal');
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
    comprobar(!malos.length, `v3 pliegue · foto del arco: con ${lista.length} fotos en hero_fotos cambia según Math.random (5 semillas), cada una con su alt, precargada, sin CLS y con el arco del mismo tamaño; sin JavaScript (o con el <head> roto) sale la primera; sin hero_fotos, la de fotos.hero en un <img> de siempre` + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 6. avisos por gravedad: el programado en ámbar, el urgente en rojo, distintos y los dos AA, en la
     franja y en la ficha «Último aviso»; el informativo no va a la franja */
  {
    const malos = [];
    const V = cargarVivo(), ahora = V.ahoraEn('Europe/Madrid', new Date('2026-10-14T10:00:00+02:00'));
    const rutas = { tramites: 't.html', avisos: 'avisos.html', agenda: 'a.html', noticia: 'n-{id}.html', media: 'media/' };
    const base = { nombre_corto: 'P', horario: { texto: 'x', tramos: [] }, agenda: [], noticias: [], tablon: { entradas: [] }, rutas, tramites_sede: 1 };
    const av = (o) => ({ id: 'x', fecha: '2026-10-13', tema: 'Agua', titulo: 'Corte', caduca: '2026-10-20', ...o });
    const franjaDe = a => V.pintar('franja', { ...base, avisos: [a] }, ahora);
    if (!/es-programado/.test(franjaDe(av({ gravedad: 'programado' }))) || !/<b>Programado:<\/b>/.test(franjaDe(av({ gravedad: 'programado' })))) malos.push('programado en la franja');
    if (!/es-urgente/.test(franjaDe(av({ gravedad: 'urgente' }))) || !/es-urgente/.test(franjaDe(av({ urgente: true })))) malos.push('urgente (también el «urgente: true» de antes)');
    if (franjaDe(av({}))) malos.push('un informativo sale en la franja');
    const dos = V.pintar('franja', { ...base, avisos: [av({ id: 'p', gravedad: 'programado', fecha: '2026-10-13' }), av({ id: 'u', gravedad: 'urgente', fecha: '2026-10-01' })] }, ahora);
    if (!/es-urgente/.test(dos)) malos.push('con uno urgente y otro programado, la franja no da el urgente');
    if (!/titulo corto/.test(franjaDe(av({ gravedad: 'programado', titulo_corto: 'titulo corto' })))) malos.push('titulo_corto');
    const ficha = V.pintar('hoy', { ...base, avisos: [av({ gravedad: 'urgente' })] }, ahora);
    if (!/hoy__fila--aviso es-urgente[\s\S]*chip chip--urgente">Urgente/.test(ficha) || !/chip--informativo">Informativo/.test(V.pintar('hoy', { ...base, avisos: [av({})] }, ahora))) malos.push('la gravedad en la ficha «Último aviso»');
    /* en el navegador: los colores de verdad */
    const colores = {};
    for (const g of ['programado', 'urgente']) {
      const { ctx, page } = await nueva({ viewport: { width: 1366, height: 768 } });
      await conDatos(page, D => { D.avisos = [{ id: 'prueba-' + g, fecha: new Date().toISOString().slice(0, 10), tema: 'Agua', titulo: 'Aviso de prueba ' + g, gravedad: g, caduca: '2999-01-01', ejemplo: false, oculto: false }]; });
      await ir(page, 'index.html');
      colores[g] = await page.evaluate(() => {
        const f = document.querySelector('.franja-urgente__fondo'), ch = document.querySelector('.hoy__fila--aviso .chip');
        const cs = e => e ? [getComputedStyle(e).backgroundColor, getComputedStyle(e).color] : null;
        return { franja: cs(f), chip: cs(ch) };
      });
      await ctx.close();
    }
    for (const g of ['programado', 'urgente']) for (const k of ['franja', 'chip']) {
      const c = colores[g][k];
      if (!c) { malos.push(`${g}: no sale ${k}`); continue; }
      const r = contraste(rgbHex(c[0]), rgbHex(c[1]));
      if (r < 4.5) malos.push(`${g} ${k}: ${rgbHex(c[1])} sobre ${rgbHex(c[0])} = ${r.toFixed(2)}:1`);
    }
    if (colores.programado.franja && colores.urgente.franja && rgbHex(colores.programado.franja[0]) === rgbHex(colores.urgente.franja[0])) malos.push('programado y urgente del mismo color');
    if (colores.programado.chip && colores.urgente.chip && rgbHex(colores.programado.chip[0]) === rgbHex(colores.urgente.chip[0])) malos.push('los chips de gravedad del mismo color');
    comprobar(!malos.length, `v3 pliegue · avisos por gravedad: programado en ámbar (${colores.programado.franja ? rgbHex(colores.programado.franja[0]) : '?'}) y urgente en rojo (${colores.urgente.franja ? rgbHex(colores.urgente.franja[0]) : '?'}), distintos y ≥ 4,5:1 con su texto en la franja y en la ficha «Último aviso»; lo urgente gana la franja, «urgente: true» sigue valiendo, el informativo no sale arriba y titulo_corto la resume` + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 7. movimiento: reducido, nada (ni la entrada del hero ni las fichas); con movimiento y sin
     cortina, la entrada del hero dura ≤ 600 ms y solo mueve; las fichas esperan a asomar */
  {
    const malos = [];
    let { ctx, page } = await nueva({ viewport: { width: 1366, height: 768 } });
    await ir(page, 'index.html');
    await page.mouse.move(600, 400); await page.mouse.wheel(0, 500); await espera(400);
    let r = await page.evaluate(() => ({ anims: document.getAnimations().map(a => a.animationName || 'waapi'), clase: document.documentElement.classList.contains('entrada-hero'),
      quietos: [...document.querySelectorAll('.hero__palabra, #arco-hero img, .hoy__fila')].every(e => { const cs = getComputedStyle(e); return cs.translate === 'none' && cs.scale === 'none' && cs.transform === 'none'; }) }));
    if (r.anims.length || r.clase || !r.quietos) malos.push('reducido: ' + JSON.stringify(r));
    await ctx.close();
    ({ ctx, page } = await nueva({ viewport: { width: 375, height: 600 }, reducido: false }));
    await ctx.addInitScript(() => { window.__entrada = []; addEventListener('DOMContentLoaded', () => { window.__entrada = document.getAnimations().filter(a => /^mov-(palabra|asienta)$/.test(a.animationName)).map(a => ({ n: a.animationName, fin: a.effect.getComputedTiming().endTime })); }); });
    await ir(page, 'index.html');
    const e = await page.evaluate(() => ({ clase: document.documentElement.classList.contains('entrada-hero'), anims: window.__entrada, fuera: document.querySelector('.hoy-tira').getBoundingClientRect().top > innerHeight - 40,
      fichasAnim: document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('hoy__fila')).length }));
    const palabras = e.anims.filter(a => a.n === 'mov-palabra'), foto = e.anims.filter(a => a.n === 'mov-asienta');
    if (!e.clase || palabras.length !== M.nombre.trim().split(/\s+/).length || foto.length !== 1) malos.push(`entrada del hero: clase ${e.clase}, ${palabras.length} palabras y ${foto.length} foto animadas`);
    if (e.anims.some(a => a.fin > 600)) malos.push('la entrada del hero pasa de 600 ms: ' + Math.max(...e.anims.map(a => a.fin)));
    if (!e.fuera) malos.push('la prueba necesita la tira fuera de la pantalla al cargar (375×600)');
    if (e.fichasAnim) malos.push('las fichas de «Hoy» se animan sin haber asomado');
    await espera(700);
    r = await page.evaluate(() => [...document.querySelectorAll('.hero__palabra, #arco-hero img')].every(x => { const cs = getComputedStyle(x); return cs.translate === 'none' && cs.scale === 'none'; }));
    if (!r) malos.push('tras la entrada, el nombre o la foto no están en su sitio');
    await page.mouse.move(180, 300); await page.mouse.wheel(0, 400); await espera(150);
    const vivas = await page.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('hoy__fila')).length);
    if (!vivas) malos.push('las fichas de «Hoy» no entran al asomar');
    await espera(900);
    r = await page.evaluate(() => [...document.querySelectorAll('.hoy__fila')].every(x => getComputedStyle(x).transform === 'none'));
    if (!r) malos.push('las fichas de «Hoy» se quedan a medias');
    await ctx.close();
    /* con cortina: sin entrada del hero (la cortina ya es la entrada) */
    ({ ctx, page } = await nueva({ viewport: { width: 1366, height: 768 }, reducido: false, conCortina: true }));
    await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
    if (await page.evaluate(() => document.documentElement.classList.contains('entrada-hero'))) malos.push('con cortina también sale la entrada del hero');
    await ctx.close();
    comprobar(!malos.length, 'v3 pliegue · movimiento: con movimiento reducido no se anima nada (ni el hero ni las fichas, ni al bajar); sin cortina, el nombre sube palabra a palabra y la foto se asienta en ≤ 600 ms y acaban en su sitio; las fichas de «Hoy» esperan a asomar y no se quedan a medias; con cortina no hay entrada doble' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }
}

/* ═════════════ v3 · cuerpo de la portada (de los trámites al final del <main>) ═════════════
   Banda «Conocer …» (V2) con paralaje dentro del arco (M3), tablón con su lado y «Quién» en
   cuadrícula (V4), «Más adelante» en «Lo que viene», atajos compactos y temas sin huecos (V5),
   «El año» con «Lo siguiente» y su tira móvil colocada en el mes en curso (V6), el borde de oro que
   se dibuja (M6) y el arco que sube por el borde de las bandas (M7). Con el municipio real y con
   dos copias con otros datos (menos fotos, sin pleno ni canal, 4 temas; y canal, pleno, 7 temas y
   6 atajos), como hace opcionales(). */
async function v3Cuerpo() {
  const V = cargarVivo();
  const enV = iso => V.ahoraEn('Europe/Madrid', new Date(iso));
  const conFoto = ((M.pueblo || {}).lugares || []).filter(l => l.foto && fs.existsSync(path.join(RAIZ, 'media', l.foto + '.jpg')));
  const esperadosConocer = conFoto.length >= 3 ? Math.min(5, ((M.pueblo || {}).portada_lugares || conFoto).length) : 0;

  /* ── lo que se mide en una portada (la real o una copia) a 1440 px ── */
  const medirPortada = page => page.evaluate(() => {
    const caja = e => e.getBoundingClientRect();
    const banda = document.querySelector('section[aria-labelledby="t-conocer"]');
    const lugares = banda ? [...banda.querySelectorAll('.conocer__lugar')].map(li => {
      const a = li.querySelector('a'), m = li.querySelector('.conocer__marco'), r = caja(m);
      return { href: a.getAttribute('href'), nombre: li.querySelector('.conocer__nombre').textContent.trim(), credito: !!li.querySelector('.credito'), w: r.width, h: r.height, bottom: r.bottom,
        radio: parseFloat(getComputedStyle(m).borderTopLeftRadius) };
    }) : null;
    const lado = document.querySelector('.tablon-lado'), tablon = document.querySelector('.tablon-rejilla > .tablon');
    const temas = document.querySelector('.temas');
    const cols = temas ? [...temas.querySelectorAll(':scope > .temas__columna')].map(c => ({ ancha: c.classList.contains('temas__columna--ancha'), n: c.querySelectorAll('.tema').length, w: caja(c).width, bottom: caja(c).bottom })) : [];
    const atajos = [...document.querySelectorAll('.atajo')].map(a => { const r = caja(a); return { h: Math.round(r.height), top: Math.round(r.top), w: Math.round(r.width), corta: [...a.querySelectorAll('.atajo__nombre, .atajo__nota')].some(t => t.scrollWidth > t.clientWidth + 1) }; });
    const quien = [...document.querySelectorAll('.quien--portada > .quien__fila')].map(f => ({ w: caja(f).width, left: caja(f).left }));
    const cont = document.querySelector('.seccion .contenedor'), cc = getComputedStyle(cont);
    return {
      lugares, contenedor: caja(cont).width - parseFloat(cc.paddingLeft) - parseFloat(cc.paddingRight),
      lado: lado ? { visible: lado.checkVisibility(), w: caja(lado).width, canal: !!lado.querySelector('.lado__bloque--canal'), pasos: lado.querySelectorAll('.lado__pasos li').length,
        pleno: !!lado.querySelector('.lado__bloque--pleno'), ics: (lado.querySelector('.lado__bloque--pleno .evento__ics') || {}).getAttribute ? lado.querySelector('.lado__bloque--pleno .evento__ics').getAttribute('href') || 'boton' : null } : null,
      tablonW: tablon ? caja(tablon).width : 0, temasW: temas ? caja(temas).width : 0, cols, atajos,
      quien, quienW: document.querySelector('.quien--portada') ? caja(document.querySelector('.quien--portada')).width : 0
    };
  });
  const juzgar = (r, nombre, op) => {
    const mal = [];
    /* V2: la banda sale con 3 a 5 fotos y no sale con menos de 3; cada una enlaza a su sitio en pueblo.html */
    if (op.conocer) {
      if (!r.lugares || r.lugares.length !== op.conocer) mal.push(`«Conocer»: ${r.lugares ? r.lugares.length : 'sin banda'} lugares (esperaba ${op.conocer})`);
      else {
        const pueblo = op.pueblo;
        r.lugares.forEach(l => { const id = (l.href.match(/^pueblo\.html#(lugar-[a-z0-9-]+)$/) || [])[1]; if (!id || !pueblo.includes(`id="${id}"`)) mal.push('«Conocer»: ' + l.nombre + ' enlaza a ' + l.href + ', que no existe'); });
        if (r.lugares.some(l => !l.credito)) mal.push('«Conocer»: una foto sin crédito');
        if (r.lugares.some(l => l.h < l.w / 2 - 1 || l.radio < l.w / 2 - 1)) mal.push('«Conocer»: un arco que no es de medio punto');
        if (!(r.lugares[0].w > r.lugares[1].w * 1.2)) mal.push('«Conocer»: el primero no es más grande');
        if (Math.max(...r.lugares.map(l => l.bottom)) - Math.min(...r.lugares.map(l => l.bottom)) > 1.5) mal.push('«Conocer»: los arcos no están de pie sobre la misma línea');
      }
    } else if (r.lugares) mal.push('«Conocer» sale con menos de 3 fotos');
    /* V4: el lado del tablón según los datos */
    if (op.lado) {
      if (!r.lado || !r.lado.visible || r.lado.canal !== op.lado.canal || r.lado.pleno !== op.lado.pleno || (op.lado.pasos != null && r.lado.pasos !== op.lado.pasos) || (op.lado.pleno && !r.lado.ics)) mal.push('lado del tablón ' + JSON.stringify(r.lado));
      else if (Math.abs(r.tablonW / r.contenedor - 2 / 3) > .06) mal.push(`el tablón no va a dos tercios (${Math.round(r.tablonW)} de ${Math.round(r.contenedor)})`);
      if (r.lado && r.lado.ics && r.lado.ics !== 'boton' && !fs.existsSync(path.join(op.raiz, r.lado.ics))) mal.push('el .ics del próximo pleno no existe: ' + r.lado.ics);
    } else {
      if (r.lado && r.lado.visible) mal.push('sale el lado del tablón sin canal ni pleno');
      if (r.tablonW < r.contenedor - 2) mal.push(`sin lado, el tablón no ocupa el ancho (${Math.round(r.tablonW)} de ${Math.round(r.contenedor)})`);
    }
    /* V5: atajos iguales, compactos y en filas llenas; temas sin huecos */
    const altos = [...new Set(r.atajos.map(a => a.h))];
    if (altos.length !== 1 || altos[0] > 120) mal.push('atajos de ' + altos.join(', ') + ' px de alto (iguales y ≤ 120)');
    const filas = [...new Set(r.atajos.map(a => a.top))].map(t => r.atajos.filter(a => a.top === t).length);
    if (op.columnasAtajos && filas[0] !== op.columnasAtajos) mal.push(`atajos: ${filas.join(' + ')} por fila (esperaba ${op.columnasAtajos} en la primera)`);
    if (filas.length > 1 && filas[filas.length - 1] < filas[0] - 1) mal.push('atajos: la última fila queda casi vacía (' + filas.join(' + ') + ')');
    if (r.atajos.some(a => a.corta)) mal.push('atajos: texto cortado');
    const norm = r.cols.filter(c => !c.ancha), ancha = r.cols.find(c => c.ancha);
    if (r.cols.reduce((n, c) => n + c.n, 0) !== op.temas) mal.push(`temas: ${r.cols.reduce((n, c) => n + c.n, 0)} de ${op.temas}`);
    if (norm.length === 2 && norm[0].n !== norm[1].n) mal.push('temas: columnas desiguales ' + norm.map(c => c.n).join(' y '));
    if (!!ancha !== (op.temas % 2 === 1) || (ancha && (ancha.n !== 1 || ancha.w < r.temasW - 1))) mal.push('temas: el último de un número impar no ocupa el ancho ' + JSON.stringify(r.cols));
    if (norm.length === 2 && Math.abs(norm[0].bottom - norm[1].bottom) > 40) mal.push(`temas: hueco al pie de una columna (${Math.round(Math.abs(norm[0].bottom - norm[1].bottom))} px)`);
    /* V4: «Quién» llena el ancho (2 × 2, y la última sola a todo el ancho si son impares) */
    if (r.quien.length) {
      const ok = r.quien.every((q, i) => (r.quien.length % 2 && i === r.quien.length - 1) ? q.w >= r.quienW - 1 : Math.abs(q.w - (r.quienW - 16) / 2) < 2);
      if (!ok) mal.push('«Quién» no llena el ancho en dos columnas ' + JSON.stringify(r.quien.map(q => Math.round(q.w))));
    }
    return mal.map(m => nombre + ': ' + m);
  };

  /* 1. la web real, a 1440 px */
  const malos = [];
  let { ctx, page } = await nueva();
  await ir(page, 'index.html');
  const real = await medirPortada(page);
  const plenoProx = V.proximoPleno(JSON.parse(leer(RAIZ, 'index.html').match(/id="datos-vivos">([\s\S]*?)<\/script>/)[1]), V.ahoraEn('Europe/Madrid', new Date()));
  const canalReal = !!(M.canal_avisos && M.canal_avisos.url);
  malos.push(...juzgar(real, M.nombre, { conocer: esperadosConocer, pueblo: leer(RAIZ, 'pueblo.html'), raiz: RAIZ,
    lado: canalReal || plenoProx ? { canal: canalReal, pleno: !!plenoProx, pasos: canalReal ? (M.canal_avisos.pasos || []).length || 0 : null } : null,
    temas: (M.tramites.temas || []).length }));
  /* los temas de trámites.html (el mismo parcial) tampoco dejan hueco */
  await ir(page, 'tramites.html');
  const tt = await page.evaluate(() => [...document.querySelectorAll('.temas > .temas__columna')].map(c => ({ ancha: c.classList.contains('temas__columna--ancha'), n: c.querySelectorAll('.tema').length, w: c.getBoundingClientRect().width, tw: c.parentElement.getBoundingClientRect().width })));
  if (tt.filter(c => !c.ancha).some((c, i, a) => c.n !== a[0].n) || tt.some(c => c.ancha && c.w < c.tw - 1)) malos.push('tramites.html: temas con hueco ' + JSON.stringify(tt));
  await ctx.close();

  /* 2. dos copias con otros datos */
  const O = JSON.parse(leer(RAIZ, 'pruebas', 'opcionales.json'));
  const enDias = n => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const variantes = [
    ['A (2 fotos, sin pleno ni canal, 4 temas)', m => {
      m.pueblo.lugares = m.pueblo.lugares.filter(l => l.foto).slice(0, 2);
      delete m.pueblo.portada_lugares;
      m.plenos = []; delete m.canal_avisos;
      m.tramites.temas = m.tramites.temas.slice(0, 4);
    }, dest => {
      const f = path.join(dest, 'contenido', 'agenda.json'), a = JSON.parse(fs.readFileSync(f, 'utf8'));
      a.eventos = a.eventos.filter(e => String(e.tipo || '').toLowerCase() !== 'pleno');
      fs.writeFileSync(f, JSON.stringify(a, null, 2));
    }, { conocer: 0, lado: null, temas: 4 }],
    ['B (canal, pleno en 10 días, 7 temas y 6 atajos)', m => {
      m.canal_avisos = O.canal_avisos;
      m.plenos = [{ fecha: enDias(10), hora: '20:00', tipo: 'ordinario', lugar: 'Salón de plenos de prueba' }];
      const t = m.tramites.temas;
      m.tramites.temas = [...t, ...t.slice(0, 7 - t.length).map((x, i) => ({ ...x, nombre: 'Tema de prueba ' + (i + 1) }))].slice(0, 7);
      const a = m.tramites.atajos;
      m.tramites.atajos = [...a, ...a.slice(0, 6 - a.length).map((x, i) => ({ ...x, nombre: 'Atajo de prueba ' + (i + 1) }))].slice(0, 6);
    }, null, { conocer: esperadosConocer, lado: { canal: true, pleno: true, pasos: O.canal_avisos.pasos.length }, temas: 7, columnasAtajos: 3 }]
  ];
  for (const [nombre, cambiar, extra, op] of variantes) {
    const dest = copiar();
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
      cambiar(m);
      fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(m, null, 2));
      if (extra) extra(dest);
      const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      if (ap.status !== 0) { malos.push(nombre + ': aplicar.mjs falla → ' + (ap.stderr || ap.stdout).slice(-300)); continue; }
      const srv = crearServidor(dest, null);
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const b = 'http://127.0.0.1:' + srv.address().port + '/';
      const c = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await c.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, SLUG);
      const p = await c.newPage();
      await p.goto(b + 'index.html', { waitUntil: 'networkidle' });
      malos.push(...juzgar(await medirPortada(p), 'copia ' + nombre, { ...op, pueblo: fs.readFileSync(path.join(dest, 'pueblo.html'), 'utf8'), raiz: dest }));
      const viol = (await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
      if (viol.length) malos.push('copia ' + nombre + ': axe ' + viol.join(', '));
      await p.setViewportSize({ width: 320, height: 640 });
      if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) malos.push('copia ' + nombre + ': desborda a 320 px');
      if (CAPTURAS) await p.screenshot({ path: captura('v3-copia-' + nombre[0] + '-320.png'), fullPage: true });
      await c.close(); srv.close();
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
  }
  comprobar(!malos.length, `v3 portada a 1440 px, en ${M.nombre} y en dos copias: «Conocer» con ${esperadosConocer} arcos de medio punto (el primero más grande, de pie en la misma línea, con crédito y enlace a su ancla de pueblo.html) y sin banda con 2 fotos; el lado del tablón solo con canal o pleno (a dos tercios; sin él, el tablón a todo el ancho); atajos iguales de ≤ 120 px en filas llenas; temas sin huecos con 4, 5 y 7 (también en tramites.html); «Quién» en dos columnas que llenan el ancho` + (malos.length ? ' → ' + malos.slice(0, 6).join(' | ') : ''));

  /* 3. móvil: carril de «Conocer», atajos a 320 px y zoom, tira de meses colocada */
  const malM = [];
  ({ ctx, page } = await nueva({ viewport: { width: 390, height: 844 } }));
  await ir(page, 'index.html');
  if (esperadosConocer) {
    const c0 = await page.evaluate(() => {
      const c = document.querySelector('.conocer__carril'), lis = [...c.querySelectorAll('.conocer__lugar')];
      return { desborda: c.scrollWidth > c.clientWidth, tab: c.getAttribute('tabindex'), scroll: getComputedStyle(c).overflowX, n: lis.length, anchos: lis.map(l => l.getBoundingClientRect().width),
        asoma: lis[1] ? lis[1].getBoundingClientRect().left < innerWidth : false };
    });
    if (!c0.desborda || c0.tab !== '0' || c0.scroll !== 'auto' || !c0.asoma || c0.anchos.some(w => w < 100)) malM.push('carril de «Conocer» ' + JSON.stringify(c0));
    /* con el Tabulador, cada lugar llega entero a la pantalla (nada recortado ni inalcanzable) */
    await page.focus('.conocer__carril');
    const vistos = [];
    for (let i = 0; i < c0.n; i++) {
      await page.keyboard.press('Tab'); await espera(120);
      vistos.push(await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), c = a.closest('.conocer__carril'); return c ? { l: r.left, r: r.right, w: innerWidth } : null; }));
    }
    if (vistos.some(v => !v || v.l < -1 || v.r > v.w + 1)) malM.push('con el Tabulador, un lugar del carril queda fuera ' + JSON.stringify(vistos));
    await page.focus('.conocer__carril');
    await page.evaluate(() => { document.querySelector('.conocer__carril').scrollLeft = 0; });
    await page.keyboard.press('ArrowRight'); await espera(400);
    if (!(await page.evaluate(() => document.querySelector('.conocer__carril').scrollLeft > 0))) malM.push('el carril de «Conocer» no se mueve con las flechas');
  }
  await ctx.close();
  for (const [w, h, escala] of [[320, 640, 1], [640, 400, 2]]) {
    const x = await nueva({ viewport: { width: w, height: h }, escala });
    await ir(x.page, 'index.html');
    const at = await x.page.evaluate(() => [...document.querySelectorAll('.atajo')].map(a => { const r = a.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), r: r.right, corta: [...a.querySelectorAll('.atajo__nombre, .atajo__nota')].some(t => t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > r.right + 0.5) }; }));
    const porFila = {};
    at.forEach(a => { (porFila[a.top] = porFila[a.top] || []).push(a.h); });
    if (at.some(a => a.corta || a.r > w + 0.5) || Object.values(porFila).some(f => new Set(f).size > 1) || Object.values(porFila)[0].length !== Math.min(2, at.length)) malM.push(`atajos a ${w * escala} px${escala > 1 ? ' con zoom' : ''}: ` + JSON.stringify(at));
    await x.ctx.close();
  }
  /* «El año»: la tira llega colocada en el mes en curso, sin moverse después (sin salto ni animación) */
  const fiestas = (M.pueblo || {}).fiestas || [];
  if (fiestas.length) {
    const fecha = '2026-09-20T12:00:00+02:00';
    const x = await nueva({ viewport: { width: 390, height: 844 } });
    await x.page.clock.setFixedTime(new Date(fecha));
    await x.ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const o = document.querySelector('.anio--tira'); window.__tiraInicial = o ? o.scrollLeft : null; }); });
    await ir(x.page, 'index.html');
    await espera(300);
    const t = await x.page.evaluate(() => {
      const o = document.querySelector('.anio--tira'), lis = [...o.children], act = o.querySelector('.es-mes-actual');
      return { inicial: window.__tiraInicial, final: o.scrollLeft, desborda: o.scrollWidth > o.clientWidth, tab: o.getAttribute('tabindex'), n: lis.length, actual: lis.indexOf(act) + 1,
        izq: act.getBoundingClientRect().left - o.getBoundingClientRect().left, pad: parseFloat(getComputedStyle(o).paddingLeft),
        orden: lis.map(l => l.querySelector('.mes__largo').textContent).join(','), dentro: act.getBoundingClientRect().right <= innerWidth + 1 };
    });
    await x.page.focus('.anio--tira');
    await x.page.keyboard.press('ArrowRight'); await espera(400);
    const tras = await x.page.evaluate(() => document.querySelector('.anio--tira').scrollLeft);
    await x.ctx.close();
    const orden = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].join(',');
    if (!t.desborda || t.tab !== '0' || t.n !== 12 || t.orden !== orden || t.actual !== 9 || t.inicial == null || Math.abs(t.inicial - t.final) > 1 || Math.abs(t.izq - t.pad) > 2 || !t.dentro || !(tras > t.final))
      malM.push('tira de meses (reloj en septiembre) ' + JSON.stringify({ ...t, tras }));
  }
  comprobar(!malM.length, 'v3 en móvil: el carril de «Conocer» se desliza con el siguiente asomando, tiene tabindex y cada lugar llega entero con el Tabulador (y se mueve con las flechas); atajos de dos en dos sin texto cortado a 320 px ni con zoom al 200 %; la tira de «El año» son los 12 meses en orden, llega colocada en el mes en curso desde DOMContentLoaded (sin salto) y se recorre con el teclado' + (malM.length ? ' → ' + malM.join(' | ') : ''));

  /* 4. lógica en Node: «Lo siguiente» en un mes vacío y «Más adelante» en «Lo que viene» */
  const malL = [];
  const Dpag = JSON.parse(leer(RAIZ, 'index.html').match(/id="datos-vivos">([\s\S]*?)<\/script>/)[1]);
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  for (let mes = 1; mes <= 12; mes++) {
    const html = V.pintar('anio', Dpag, enV(`2026-${String(mes).padStart(2, '0')}-10T12:00:00+02:00`));
    const actual = html.split('<li class="mes').find(x => / es-mes-actual"/.test(x)) || '';
    const tiene = fiestas.some(f => f.mes === mes), sig = V.siguienteFiesta(Dpag, mes);
    if (tiene && /Lo siguiente/.test(actual)) malL.push(meses[mes - 1] + ' tiene fiestas y dice «Lo siguiente»');
    if (!tiene && sig && !actual.includes('Lo siguiente: <b>' + sig.fiesta.nombre.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') + '</b>, ' + meses[sig.mes - 1])) malL.push(meses[mes - 1] + ' vacío sin «Lo siguiente» bien: ' + actual.replace(/<[^>]+>/g, ' ').slice(0, 120));
  }
  const prueba = { ...Dpag, fiestas: [{ mes: 2, nombre: 'Fiesta de febrero', cuando: 'x' }, { mes: 6, nombre: 'Fiesta de junio', cuando: 'y' }] };
  if (V.siguienteFiesta(prueba, 12).mes !== 2 || V.siguienteFiesta(prueba, 3).mes !== 6 || V.siguienteFiesta({ ...prueba, fiestas: [{ mes: 5, nombre: 'Sola', cuando: 'z' }] }, 5) !== null) malL.push('siguienteFiesta no da la vuelta al año o no se salta el propio mes');
  const ag = (id, fecha) => ({ id, fecha, titulo: 'Evento ' + id });
  const lineaDe = agenda => V.pintar('linea', { ...Dpag, agenda, noticias: [], horizonte_dias: 60 }, enV('2026-10-10T10:00:00+02:00'));
  const l1 = lineaDe([ag('a', '2026-10-20'), ag('b', '2027-01-15'), ag('c', '2027-02-01'), ag('d', '2027-03-01')]);
  const l3 = lineaDe([ag('a', '2026-10-20'), ag('b', '2026-10-25'), ag('c', '2026-11-01'), ag('d', '2027-03-01')]);
  const l0 = lineaDe([ag('d', '2027-03-01')]);
  const cuenta = (h, cl) => (h.match(new RegExp('class="linea linea--' + cl + '"[\\s\\S]*?</ol>')) || [''])[0].split('linea__item--evento').length - 1;
  if (cuenta(l1, 'viene') !== 1 || cuenta(l1, 'despues') !== 2 || !/Más adelante/.test(l1) || /Evento d/.test(l1)) malL.push('«Más adelante» con 1 en el plazo: ' + cuenta(l1, 'viene') + ' + ' + cuenta(l1, 'despues'));
  if (cuenta(l3, 'viene') !== 3 || /Más adelante/.test(l3)) malL.push('con 3 en el plazo sale «Más adelante»');
  if (!/No hay nada anunciado/.test(l0) || /Más adelante/.test(l0)) malL.push('sin nada en el plazo no se dice');
  comprobar(!malL.length, 'v3, «El año» y «Lo que viene» (vivo.js en Node, los 12 meses): el mes en curso sin fiestas dice «Lo siguiente: <fiesta>, <mes>» (dando la vuelta al año) y uno con fiestas no; con 1 o 2 eventos en el plazo, «Más adelante» completa hasta 3 con lo que ya tiene la agenda' + (malL.length ? ' → ' + malL.join(' | ') : ''));

  /* 5. en el navegador: un mes vacío dice «Lo siguiente» en su celda resaltada */
  const vacio = [...Array(12).keys()].map(i => i + 1).find(m => !fiestas.some(f => f.mes === m) && V.siguienteFiesta(Dpag, m));
  if (vacio) {
    const x = await nueva();
    await x.page.clock.setFixedTime(new Date(`2027-${String(vacio).padStart(2, '0')}-10T12:00:00+01:00`));
    await ir(x.page, 'index.html');
    const r = await x.page.evaluate(() => { const a = document.querySelector('.anio .es-mes-actual'); const s = a && a.querySelector('.mes__siguiente'); return { mes: a ? a.querySelector('.mes__largo').textContent : null, texto: s && s.checkVisibility() ? s.textContent : null, borde: a ? getComputedStyle(a).borderTopColor : null }; });
    await x.ctx.close();
    const sig = V.siguienteFiesta(Dpag, vacio);
    comprobar(r.mes && r.mes.toLowerCase() === meses[vacio - 1] && r.texto === `Lo siguiente: ${sig.fiesta.nombre}, ${meses[sig.mes - 1]}`,
      `v3, «El año» en el navegador con el reloj en ${meses[vacio - 1]} (sin fiestas): su celda resaltada dice «${r.texto}»`);
  }

  /* 6. movimiento: reducido, nada se mueve; con movimiento, bajar hasta el final y que todo acabe */
  const malMov = [];
  let x = await nueva({ viewport: { width: 390, height: 844 } });
  for (const p of ['index.html', 'pueblo.html']) {
    await ir(x.page, p);
    await x.page.mouse.wheel(0, 2500); await espera(300);
    const r = await x.page.evaluate(() => {
      const mal = [];
      for (const i of document.querySelectorAll('.paralaje img')) { const cs = getComputedStyle(i); if (cs.translate !== 'none' || parseFloat(cs.marginTop) !== 0 || cs.animationName !== 'none') mal.push('foto con paralaje'); }
      for (const b of document.querySelectorAll('.banda--puerta')) { const cs = getComputedStyle(b, '::before'); if (cs.translate !== 'none' || cs.animationName !== 'none') mal.push('arco de banda'); }
      if (document.querySelector('.anio.mov-mes')) mal.push('borde del mes animado');
      if (document.getAnimations().length) mal.push(document.getAnimations().length + ' animaciones');
      return [...new Set(mal)];
    });
    r.forEach(m => malMov.push('reducido, ' + p + ': ' + m));
  }
  await x.ctx.close();
  x = await nueva({ reducido: false });
  await ir(x.page, 'index.html');
  await x.page.mouse.move(720, 450);
  const pasos = [];
  if (esperadosConocer) {
    /* a media banda la foto está desplazada y el marco no se mueve; al final, nada a medias */
    await x.page.evaluate(() => { const s = document.querySelector('section[aria-labelledby="t-conocer"]'); scrollTo(0, s.getBoundingClientRect().top + scrollY - innerHeight * .9); });
    await espera(200);
    pasos.push(await x.page.evaluate(() => { const i = document.querySelector('.conocer .paralaje img'), m = i.parentElement; return { t: getComputedStyle(i).translate, alto: i.getBoundingClientRect().height - m.clientHeight, marco: getComputedStyle(m).translate + ' ' + getComputedStyle(m).transform }; }));
    await x.page.evaluate(() => { const s = document.querySelector('section[aria-labelledby="t-conocer"]'); scrollTo(0, s.getBoundingClientRect().top + scrollY + s.offsetHeight * .5 - innerHeight * .5); });
    await espera(200);
    pasos.push(await x.page.evaluate(() => { const i = document.querySelector('.conocer .paralaje img'); return { t: getComputedStyle(i).translate }; }));
    const dy = s => parseFloat((s.t.split(' ')[1]) || 0);
    if (!(Math.abs(dy(pasos[0])) > 5 && Math.abs(dy(pasos[0])) <= 20.5 && Math.abs(dy(pasos[1])) < Math.abs(dy(pasos[0])) && Math.abs(pasos[0].alto - 40) < 1.5 && pasos[0].marco === 'none none'))
      malMov.push('paralaje ' + JSON.stringify(pasos));
  }
  await x.page.evaluate(() => scrollTo(0, 0)); await espera(100);
  for (let i = 0; i < 80; i++) {
    await x.page.mouse.wheel(0, 500); await espera(40);
    if (await x.page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)) break;
  }
  await espera(1200);
  const fin = await x.page.evaluate(() => ({
    bandas: [...document.querySelectorAll('.banda--puerta')].map(b => getComputedStyle(b, '::before').translate),
    mes: document.querySelector('.anio .es-mes-actual') ? { clase: !!document.querySelector('.anio.mov-mes'), giro: getComputedStyle(document.querySelector('.anio .es-mes-actual'), '::after').getPropertyValue('--mov-giro').trim(),
      corriendo: document.getAnimations().filter(a => a.animationName === 'mov-borde' && a.playState !== 'finished').length } : null,
    infinitas: document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations > 3).length
  }));
  await x.ctx.close();
  if (fin.bandas.some(t => !/^(none|0px 0(px|%)?)$/.test(t))) malMov.push('arco de banda a medias al final: ' + fin.bandas.join(', '));
  if (fin.mes && (!fin.mes.clase || fin.mes.giro !== '360deg' || fin.mes.corriendo)) malMov.push('borde del mes en curso ' + JSON.stringify(fin.mes));
  if (fin.infinitas) malMov.push('bucles');
  comprobar(!malMov.length, `v3, movimiento: con movimiento reducido, las fotos del paralaje centradas, el arco de las bandas arriba y el borde del mes sin animar (portada y pueblo.html); con movimiento, la foto se desplaza dentro de su marco quieto (${pasos.map(p => p.t).join(' → ') || 'sin banda'}) y, tras bajar hasta el final, los ${fin.bandas.length} arcos de banda arriba del todo y el borde de oro del mes dibujado entero (una vez)` + (malMov.length ? ' → ' + malMov.join(' | ') : ''));
}

/* ═════════════ v3 · interiores ═════════════
   Pictograma dentro del arco de cada cabecera (o la foto) y su trazado; la puerta que se queda
   entre páginas; noticias sin huecos con 0, 1 y todas las fotos; el calendario de la agenda; el
   índice A–Z de los trámites; el índice «En esta página» de las páginas largas; y el buscador con
   lo encontrado marcado. Sirve también tras un reskin: lo espera todo de municipio.json. */
async function v3Interiores() {
  const sinTildes = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /* ── 1. cada cabecera interior: pictograma dentro del arco, o la foto de `cabeceras`; nunca vacía ── */
  {
    const conf = M.cabeceras || {}, malos = [];
    const idDe = p => ({ 'aviso-legal.html': 'legal', 'privacidad.html': 'legal', 'cookies.html': 'legal', 'accesibilidad.html': 'legal' })[p] || (p.startsWith('noticia-') ? 'noticia' : /^pueblo-[a-z]{2}\.html$/.test(p) ? 'pueblo' : p.replace('.html', ''));   /* v3b: «El pueblo» traducido es «El pueblo» */
    const pictos = new Set();
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      for (const p of INTERIORES.filter(x => x !== '404.html')) {
        await ir(page, p);
        const c = conf[idDe(p)], debeFoto = !!(c && fs.existsSync(path.join(RAIZ, 'media', (typeof c === 'string' ? c : c.archivo) + '.jpg')));
        const r = await page.evaluate(() => {
          const puerta = document.querySelector('main > .cabeza-pagina .cabeza-pagina__puerta');
          if (!puerta) return { puerta: false };
          const arco = puerta.querySelector('.cabeza-pagina__arco'), a = arco.getBoundingClientRect();
          const svg = arco.querySelector('svg.cabeza-pagina__picto'), img = arco.querySelector('img');
          const res = { puerta: true, foto: !!img && img.complete && img.naturalWidth > 0, picto: svg ? svg.getAttribute('data-picto') : null };
          if (svg) {
            const s = svg.getBoundingClientRect(), trazos = [...svg.children];
            res.trazos = trazos.length;
            res.dentro = s.width > a.width * 0.4 && s.left >= a.left && s.right <= a.right && s.top >= a.top && s.bottom <= a.bottom + 1;
            res.centrado = Math.abs((s.left + s.right) / 2 - (a.left + a.right) / 2) < 2;
            res.pathLength = trazos.every(t => t.tagName === 'path' && t.getAttribute('pathLength') === '1');
            res.visibles = trazos.every(t => { const b = t.getBoundingClientRect(); return b.width + b.height > 1; });
            res.color = getComputedStyle(svg).stroke === getComputedStyle(arco).borderTopColor;
            res.grosor = parseFloat(getComputedStyle(svg).strokeWidth) * s.width / 24;
            res.reposo = trazos.every(t => getComputedStyle(t).strokeDasharray === 'none');
          }
          return res;
        });
        if (!r.puerta) { malos.push(`${p} a ${w}: sin puerta`); continue; }
        if (debeFoto) { if (!r.foto || r.picto) malos.push(`${p} a ${w}: tenía que llevar la foto de «cabeceras»`); continue; }
        if (!r.picto) { malos.push(`${p} a ${w}: arco vacío`); continue; }
        pictos.add(p + ':' + r.picto);
        if (!(r.trazos >= 2 && r.dentro && r.centrado && r.pathLength && r.visibles && r.color && r.reposo)) malos.push(`${p} a ${w}: pictograma ${JSON.stringify(r)}`);
        if (r.grosor < 1.2 || r.grosor > 2.6) malos.push(`${p} a ${w}: trazo de ${r.grosor.toFixed(2)} px (los iconos van a ≈ 1,7)`);
      }
      await ctx.close();
    }
    const porPagina = [...pictos].map(x => x.split(':')[1]);
    const distintos = new Set(INTERIORES.filter(p => !p.startsWith('noticia-') && p !== '404.html').map(p => [...pictos].find(x => x.startsWith(p + ':'))).filter(Boolean).map(x => x.split(':')[1]));
    comprobar(!malos.length && porPagina.length > 0, `v3 · cabeceras interiores: cada una lleva su pictograma de línea dentro del arco (${distintos.size} distintos: ${[...distintos].join(', ')}), centrado, en la marca, con trazo de iconos y entero en reposo, o la foto si «cabeceras» la da; ningún arco vacío, a 1440 y 390 px` + (malos.length ? ' → ' + malos.slice(0, 5).join(' | ') : ''));
  }

  /* ── 2. el pictograma se traza al cargar (≤ 600 ms, de verdad poco a poco) y acaba entero; con
     movimiento reducido, quieto. La puerta tiene su grupo de View Transition y se queda ── */
  {
    const muestreo = () => {
      window.__trazo = []; window.__finTrazo = 0;
      document.addEventListener('DOMContentLoaded', () => {
        const ps = [...document.querySelectorAll('.cabeza-pagina__picto path')];
        if (!ps.length) return;
        window.__finTrazo = Math.max(0, ...ps.flatMap(p => p.getAnimations()).map(a => { const t = a.effect.getComputedTiming(); return (t.delay || 0) + t.duration; }));
        const ultimo = ps[ps.length - 1], t0 = performance.now();
        const paso = () => { window.__trazo.push(parseFloat(getComputedStyle(ultimo).strokeDashoffset) || 0); if (performance.now() - t0 < 1200) requestAnimationFrame(paso); };
        requestAnimationFrame(paso);
      });
    };
    const malos = [];
    let { ctx, page } = await nueva({ reducido: false });
    await ctx.addInitScript(muestreo);
    let vt = null;
    for (const p of ['agenda.html', 'cookies.html']) {
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await espera(1400);
      const r = await page.evaluate(() => {
        const ps = [...document.querySelectorAll('.cabeza-pagina__picto path')];
        return { trazo: window.__trazo, fin: window.__finTrazo, final: ps.map(x => getComputedStyle(x).strokeDashoffset + '/' + getComputedStyle(x).strokeDasharray),
          nombre: getComputedStyle(document.querySelector('.cabeza-pagina__puerta')).viewTransitionName, quedan: ps.flatMap(x => x.getAnimations()).length };
      });
      const medios = r.trazo.filter(v => v > 0.05 && v < 0.95).length;
      if (!(r.fin > 0 && r.fin <= 600)) malos.push(`${p}: el trazado dura ${r.fin} ms`);
      if (medios < 2) malos.push(`${p}: no se ve trazarse (${r.trazo.slice(0, 12).map(v => v.toFixed(2)).join(' ')})`);
      if (r.quedan || !r.final.every(f => /^0(px)?\/none$/.test(f))) malos.push(`${p}: no acaba entero (${r.final[0]})`);
      if (r.nombre !== 'puerta-cabecera') malos.push(`${p}: la puerta no tiene su view-transition-name (${r.nombre})`);
    }
    /* entre páginas interiores: la transición corre y la puerta tiene su propio grupo */
    await ctx.addInitScript(() => {
      window.__vt = 'sin evento';
      addEventListener('pagereveal', e => {
        if (!e.viewTransition) { window.__vt = 'sin transición'; return; }
        e.viewTransition.ready.then(() => { window.__vt = 'lista';
          window.__grupoPuerta = getComputedStyle(document.documentElement, '::view-transition-group(puerta-cabecera)').animationName; }, () => { window.__vt = 'saltada'; });
      });
    });
    await ir(page, 'agenda.html');
    await page.click('.menu a[href$="tramites.html"]');
    await page.waitForLoadState('domcontentloaded'); await espera(900);
    vt = await page.evaluate(() => ({ vt: window.__vt, grupo: window.__grupoPuerta, trazo: (window.__trazo || []).filter(v => v > 0.05 && v < 0.95).length }));
    if (vt.vt === 'lista' && vt.grupo && vt.grupo !== 'none') malos.push('la puerta se anima en la transición (' + vt.grupo + ')');
    if (vt.trazo < 2) malos.push('tras navegar, el pictograma nuevo no se traza');
    await ctx.close();
    ({ ctx, page } = await nueva());
    await ir(page, 'agenda.html');
    const q = await page.evaluate(() => { const ps = [...document.querySelectorAll('.cabeza-pagina__picto path')]; return { anim: ps.flatMap(x => x.getAnimations()).length, entero: ps.every(x => getComputedStyle(x).strokeDasharray === 'none'), nombre: getComputedStyle(document.querySelector('.cabeza-pagina__puerta')).viewTransitionName }; });
    if (q.anim || !q.entero || q.nombre !== 'none') malos.push('reducido: ' + JSON.stringify(q));
    await ctx.close();
    comprobar(!malos.length, `v3 · el pictograma se traza al llegar (dashoffset de 1 a 0 poco a poco, ≤ 600 ms) y acaba entero y sin dasharray; la puerta tiene su grupo de View Transition sin animar (${vt && vt.vt}); con movimiento reducido, quieto y completo` + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* ── 3. noticias: la cuadrícula sin huecos con las fotos de verdad, con todas, con ninguna y con
     una sola noticia (en una copia) ── */
  {
    const malos = [], viol = [];
    const medirNoticias = page => page.evaluate(() => {
      const lista = document.querySelector('.noticias'), cartas = [...document.querySelectorAll('.noticias > .noticia')];
      return { ancho: lista ? lista.getBoundingClientRect().width : 0, cartas: cartas.map(c => {
        const m = c.querySelector(':scope > .noticia__foto, :scope > .noticia__fecha'), b = c.getBoundingClientRect(), mb = m ? m.getBoundingClientRect() : null;
        return { top: Math.round(b.top), alto: Math.round(b.height), ancho: Math.round(b.width), medio: mb ? { top: Math.round(mb.top - b.top), alto: Math.round(mb.height), ancho: Math.round(mb.width), fecha: m.classList.contains('noticia__fecha'), texto: m.textContent.trim() } : null,
          time: (c.querySelector('time') || {}).textContent || '' };
      }) };
    });
    const revisar = (r, nombre, w, n) => {
      if (r.cartas.length !== n) { malos.push(`${nombre} ${w}: ${r.cartas.length} de ${n} tarjetas`); return; }
      if (r.cartas.some(c => !c.medio || c.medio.alto < 40)) malos.push(`${nombre} ${w}: tarjeta sin foto ni fecha`);
      for (const c of r.cartas.filter(x => x.medio && x.medio.fecha)) if (!/^\d{1,2}\s*\D{3}\s*\d{4}$/.test(c.medio.texto.replace(/\s+/g, ' ')) || !c.time) malos.push(`${nombre} ${w}: fecha del arco «${c.medio.texto}»`);
      const filas = {};
      r.cartas.forEach(c => (filas[c.top] = filas[c.top] || []).push(c));
      for (const fila of Object.values(filas)) {
        if (new Set(fila.map(c => c.medio && c.medio.alto)).size > 1 || new Set(fila.map(c => c.medio && c.medio.top)).size > 1 || new Set(fila.map(c => c.alto)).size > 1) malos.push(`${nombre} ${w}: fila coja ${JSON.stringify(fila.map(c => c.medio))}`);
      }
      if (n === 1 && w >= 1024 && r.cartas[0].ancho < r.ancho * 0.95) malos.push(`${nombre} ${w}: una sola noticia ocupa ${r.cartas[0].ancho} de ${Math.round(r.ancho)} px`);
    };
    const reales = (contenido('noticias').noticias || []).filter(n => !n.oculto);
    if (reales.length) for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ir(page, 'noticias.html');
      revisar(await medirNoticias(page), 'reales', w, reales.length);
      await ctx.close();
    }
    const conFoto = reales.find(n => n.imagen && fs.existsSync(path.join(RAIZ, 'media', n.imagen + '.jpg')));
    const base = reales.length ? reales : [{ id: 'prueba', fecha: '2026-10-01', titulo: 'Noticia de prueba', resumen: 'Resumen de prueba.', cuerpo: ['Texto.'] }];
    const variantes = [
      ['ninguna foto', base.map(({ imagen, imagen_alt, ...n }) => n)],
      ['una noticia', base.slice(0, 1).map(({ imagen, imagen_alt, ...n }) => n)],
      ...(conFoto ? [['todas con foto', base.map(n => ({ ...n, imagen: conFoto.imagen, imagen_alt: conFoto.imagen_alt || 'Foto de prueba' }))]] : [])
    ];
    const dest = copiar();
    try {
      for (const [nombre, lista] of variantes) {
        fs.writeFileSync(path.join(dest, 'contenido', 'noticias.json'), JSON.stringify({ noticias: lista }, null, 2));
        const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
        if (ap.status !== 0) { malos.push(nombre + ': aplicar.mjs falla → ' + (ap.stderr || ap.stdout).slice(-200)); continue; }
        const srv = crearServidor(dest, null);
        await new Promise(r => srv.listen(0, '127.0.0.1', r));
        for (const [w, h] of [[1440, 900], [390, 844]]) {
          const ctx = await navegador.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
          await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); } catch (e) {} }, SLUG);
          const page = await ctx.newPage();
          await page.goto('http://127.0.0.1:' + srv.address().port + '/noticias.html', { waitUntil: 'networkidle' });
          await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
          await page.waitForLoadState('networkidle');
          revisar(await medirNoticias(page), nombre, w, lista.length);
          if (w === 1440) viol.push(...(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => nombre + ': ' + v.id));
          if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) malos.push(`${nombre} ${w}: scroll horizontal`);
          await ctx.close();
        }
        srv.close();
      }
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
    comprobar(!malos.length && !viol.length, `v3 · noticias: cada tarjeta lleva su foto o la fecha grande en un arco y ninguna fila queda coja (mismas alturas y arranques) con las reales, ${variantes.map(v => v[0]).join(', ')}, a 1440 y 390 px; una sola noticia, a todo el ancho; axe sin violaciones` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.join(', ') : ''));
  }

  /* ── 4. el calendario de la agenda: tabla con caption, hoy marcado, días con actos enlazados a
     actos que existen, paso de mes dentro del horizonte; dos columnas en escritorio ── */
  {
    const malos = [];
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ir(page, 'agenda.html');
      const r = await page.evaluate(() => {
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const cal = document.querySelector('.calendario'), vis = cal ? [...cal.querySelectorAll('.calendario__mes')].filter(m => !m.hidden) : [];
        const t = vis[0] && vis[0].querySelector('table');
        const lista = document.querySelector('.agenda__lista'), cb = cal && cal.getBoundingClientRect(), lb = lista && lista.getBoundingClientRect();
        const eventosMes = [...document.querySelectorAll('.agenda__lista .evento time')].map(x => x.getAttribute('datetime')).filter(d => vis[0] && d.startsWith(vis[0].getAttribute('data-mes')));
        const celdaHoy = t && t.querySelector('td[aria-current="date"]');
        return {
          hoy, mes: vis.length === 1 ? vis[0].getAttribute('data-mes') : vis.length + ' meses', caption: t && t.caption ? t.caption.textContent.trim() : '',
          th: t ? [...t.querySelectorAll('thead th[scope="col"]')].length : 0,
          celdaHoy: celdaHoy ? celdaHoy.textContent.match(/\d+/)[0] : null, oro: celdaHoy ? getComputedStyle(celdaHoy.querySelector('.calendario__dia')).boxShadow : '',
          oroToken: getComputedStyle(document.documentElement).getPropertyValue('--oro').trim(),
          enlaces: t ? [...t.querySelectorAll('a')].map(a => ({ href: a.getAttribute('href'), ok: !!document.getElementById(a.getAttribute('href').slice(1)) && !!document.getElementById(a.getAttribute('href').slice(1)).closest('.agenda__lista'), dia: a.textContent.match(/\d+/)[0], nombre: a.textContent })) : [],
          diasConActo: new Set(eventosMes.map(d => String(Number(d.slice(8, 10))))).size,
          columnas: cb && lb ? (cb.right <= lb.left + 1 ? 'lado' : cb.bottom <= lb.top + 1 ? 'arriba' : 'pisa') : 'falta',
          meses: cal ? cal.querySelectorAll('.calendario__mes').length : 0,
          desdeHoy: cal ? (k => k.length - k.indexOf(cal.getAttribute('data-mes-hoy')))([...cal.querySelectorAll('.calendario__mes')].map(m => m.getAttribute('data-mes'))) : 0, nav: cal ? !cal.querySelector('.calendario__nav').hidden : false
        };
      });
      const rgb = r.oroToken ? 'rgb(' + [1, 3, 5].map(i => parseInt(r.oroToken.slice(i, i + 2), 16)).join(', ') + ')' : '#';
      if (r.mes !== r.hoy.slice(0, 7)) malos.push(`${w}: el mes a la vista es ${r.mes}, no el de hoy`);
      if (!/\d{4}$/.test(r.caption) || r.th !== 7) malos.push(`${w}: tabla sin caption o sin cabeceras (${r.caption}, ${r.th})`);
      if (r.celdaHoy !== String(Number(r.hoy.slice(8)))) malos.push(`${w}: hoy (${r.hoy}) no está marcado (${r.celdaHoy})`);
      if (!r.oro.includes(rgb)) malos.push(`${w}: hoy sin el oro (${r.oro})`);
      if (!r.enlaces.length && r.diasConActo) malos.push(`${w}: hay actos este mes y ningún día enlazado`);
      if (r.enlaces.some(e => !e.ok || !/: /.test(e.nombre))) malos.push(`${w}: enlace del calendario a un acto que no está en la lista`);
      if (r.enlaces.length !== r.diasConActo) malos.push(`${w}: ${r.enlaces.length} días enlazados para ${r.diasConActo} días con actos en la lista`);
      if (w === 1440 && r.columnas !== 'lado') malos.push(`1440: el calendario no va al lado de la lista (${r.columnas})`);
      if (w === 390 && r.columnas !== 'arriba') malos.push(`390: el calendario no va arriba (${r.columnas})`);
      /* paso de mes: hasta el final del horizonte y vuelta; el foco se queda en el botón */
      if (r.meses > 1) {
        if (!r.nav) malos.push(`${w}: sin botones de mes`);
        const sig = page.locator('[data-cal-paso="1"]'), ant = page.locator('[data-cal-paso="-1"]');
        const vistos = [r.mes];
        for (let i = 0; i < r.meses + 1 && (await sig.getAttribute('aria-disabled')) !== 'true'; i++) { await sig.click(); vistos.push(await page.evaluate(() => [...document.querySelectorAll('.calendario__mes')].filter(m => !m.hidden).map(m => m.getAttribute('data-mes')).join(','))); }
        const fin = await page.evaluate(() => ({ dis: document.querySelector('[data-cal-paso="1"]').getAttribute('aria-disabled'), estado: document.querySelector('[data-cal-estado]').textContent, foco: document.activeElement.getAttribute('data-cal-paso') }));
        if (fin.dis !== 'true' || !fin.estado || fin.foco !== '1' || vistos.some(v => !v || v.includes(',')) || new Set(vistos).size !== r.desdeHoy) malos.push(`${w}: paso de mes ${JSON.stringify({ vistos, fin })}`);
        const ultimo = vistos[vistos.length - 1];
        await ant.click();
        const atras = await page.evaluate(() => [...document.querySelectorAll('.calendario__mes')].filter(m => !m.hidden).map(m => m.getAttribute('data-mes')).join(','));
        if (!(atras < ultimo)) malos.push(`${w}: «mes anterior» no vuelve (${atras})`);
      }
      if (w === 1440) {
        const viol = (await new AxeBuilder({ page }).include('.calendario').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
        if (viol.length) malos.push('axe en el calendario: ' + viol.join(', '));
      }
      await ctx.close();
    }
    comprobar(!malos.length, 'v3 · agenda: calendario del mes en una tabla con caption y cabeceras, hoy con aria-current="date" y el oro, cada día con actos enlaza a su acto de la lista, paso de mes hasta el final del horizonte (aria-disabled al final, anunciado y con el foco en su sitio); al lado de la lista en escritorio y arriba en el móvil' + (malos.length ? ' → ' + malos.slice(0, 5).join(' | ') : ''));
  }

  /* ── 5. índice A–Z de los trámites: letras activas = iniciales reales, salto con foco, fijo
     al bajar, refleja el filtro; en el móvil, una fila ── */
  {
    const malos = [];
    const inicial = n => { const c = (n.match(/\p{L}/u) || ['#'])[0].toUpperCase(); return c === 'Ñ' ? 'Ñ' : c.normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    const vigentes = (M.tramites.todos || []).filter(t => t.vigente !== false);
    const reales = [...new Set(vigentes.map(t => inicial(t.nombre)))].sort().join('');
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ir(page, 'tramites.html');
      const r = await page.evaluate(() => {
        const nav = document.querySelector('nav.az'), letras = [...nav.querySelectorAll('.az__letra')];
        const l = nav.querySelector('.az__lista');
        return { activas: letras.filter(a => a.hasAttribute('href')).map(a => a.textContent).sort().join(''),
          apagadas: letras.filter(a => !a.hasAttribute('href')).every(a => { a.focus(); return a.parentNode.getAttribute('aria-hidden') === 'true' && document.activeElement !== a; }),
          destinos: letras.filter(a => a.hasAttribute('href')).every(a => { const d = document.querySelector(a.getAttribute('href')); return d && d.closest('#todos-lista') && d.textContent.trim() === a.textContent; }),
          fila: l.scrollWidth > l.clientWidth + 1, alto: nav.getBoundingClientRect().height, total: letras.length };
      });
      if (r.activas !== reales) malos.push(`${w}: letras activas ${r.activas}, iniciales reales ${reales}`);
      if (!r.apagadas || !r.destinos || r.total < 26) malos.push(`${w}: letras apagadas o destinos mal`);
      if (w === 390 && (!r.fila || r.alto > 64)) malos.push(`390: no es una fila compacta (${Math.round(r.alto)} px, desplaza ${r.fila})`);
      /* salto con el teclado: el foco va a la letra de la lista y no queda debajo del índice */
      const letra = reales[Math.floor(reales.length / 2)];
      await page.focus(`.az__letra[href]:text-is("${letra}")`);
      await page.keyboard.press('Enter');
      await espera(400);
      const s = await page.evaluate(() => { const a = document.activeElement, b = a.getBoundingClientRect(), az = document.querySelector('nav.az').getBoundingClientRect();
        return { foco: a.tagName + '#' + a.id + ':' + a.textContent.trim(), top: b.top, bajo: az.bottom, vh: innerHeight, hash: location.hash }; });
      if (!s.foco.endsWith(':' + letra) || !/^H3#/.test(s.foco) || s.top < s.bajo - 1 || s.top > s.vh * 0.6) malos.push(`${w}: salto a «${letra}» ${JSON.stringify(s)}`);
      /* fijo: en tres puntos de la lista el índice sigue arriba y nada lo tapa */
      const fijo = [];
      for (const sel of ['#todos-lista .todos__grupo:nth-child(2)', '#todos-lista .todos__grupo:nth-child(5)', '#todos-lista .todos__grupo:last-child']) {
        await page.evaluate(q => { const e = document.querySelector(q); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 200); }, sel);
        fijo.push(await page.evaluate(() => { const az = document.querySelector('nav.az'), b = az.getBoundingClientRect(), e = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return { top: Math.round(b.top), mio: !!(e && e.closest('nav.az')) }; }));
      }
      if (!fijo.every(f => f.top === 0 && f.mio)) malos.push(`${w}: el índice no se queda arriba ${JSON.stringify(fijo)}`);
      /* el filtro: las letras activas son las iniciales de lo que queda */
      const palabra = ['agua', 'licencia', 'padron', 'certificado'].find(x => vigentes.some(t => sinTildes(t.nombre).includes(x))) || 'a';
      await page.fill('#filtrar-tramites', palabra);
      const f = await page.evaluate(() => ({ activas: [...document.querySelectorAll('nav.az .az__letra[href]')].map(a => a.textContent).sort().join(''),
        grupos: [...document.querySelectorAll('#todos-lista .todos__grupo')].filter(g => !g.hidden).map(g => g.querySelector('h3').textContent).sort().join('') }));
      const esperadas = [...new Set(vigentes.filter(t => sinTildes(t.nombre).includes(palabra)).map(t => inicial(t.nombre)))].sort().join('');
      if (f.activas !== esperadas || f.grupos !== esperadas) malos.push(`${w}: con «${palabra}» las letras son ${f.activas} (grupos ${f.grupos}), esperaba ${esperadas}`);
      await page.fill('#filtrar-tramites', '');
      const vuelta = await page.evaluate(() => [...document.querySelectorAll('nav.az .az__letra[href]')].map(a => a.textContent).sort().join(''));
      if (vuelta !== reales) malos.push(`${w}: al vaciar el filtro no vuelven todas las letras`);
      await ctx.close();
    }
    comprobar(!malos.length, `v3 · índice A–Z de «Todos los trámites»: activas justo las iniciales reales (${reales}), las demás apagadas y fuera del tabulador; el salto lleva el foco a la letra sin quedar bajo el índice; fijo arriba al bajar y sin nada encima; refleja el filtro; en el móvil, una fila` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* ── 6. índice «En esta página» de las páginas largas ── */
  {
    const malos = [], conIndice = [];
    for (const p of INTERIORES) {
      const htmlP = leer(RAIZ, p);
      if (/class="indice indice--lateral"/.test(htmlP)) conIndice.push(p);
    }
    for (const p of ['accesibilidad.html', 'aviso-legal.html', 'privacidad.html', 'cookies.html', 'pueblo.html']) if (PAGINAS.includes(p) && !conIndice.includes(p)) {
      const n = (leer(RAIZ, p).match(/<main[\s\S]*<\/main>/) || [''])[0].match(/<h2(?![^>]*class="[^"]*\bsr\b)/g) || [];
      if (n.length >= 4) malos.push(p + ': sin índice con ' + n.length + ' h2');
    }
    for (const p of conIndice) {
      const { ctx, page } = await nueva();
      await ir(page, p);
      const r = await page.evaluate(() => {
        const nav = document.querySelector('.indice--lateral'), b = nav.getBoundingClientRect();
        const h2 = [...document.querySelectorAll('.con-indice__cuerpo h2')].filter(x => !x.closest('.sr') && !x.classList.contains('sr'));
        const a = [...nav.querySelectorAll('a')];
        return { vis: nav.checkVisibility() && b.width > 100, movil: document.querySelector('.indice--movil').checkVisibility(), n: a.length, h2: h2.length,
          bien: a.every((x, i) => h2[i] && x.getAttribute('href') === '#' + h2[i].id), lado: b.right <= document.querySelector('.con-indice__cuerpo').getBoundingClientRect().left + 1,
          actual: a.findIndex(x => x.getAttribute('aria-current')) };
      });
      if (!r.vis || r.movil || r.n !== r.h2 || !r.bien || !r.lado || r.n < 4) malos.push(`${p}: índice lateral ${JSON.stringify(r)}`);
      /* bajando con la rueda, aria-current avanza y acaba en la última sección */
      const seq = [r.actual], tops = [];
      await page.mouse.move(900, 450);
      for (let i = 0; i < 200; i++) {
        await page.mouse.wheel(0, 200); await espera(50);
        const s = await page.evaluate(() => { const n = document.querySelector('.indice--lateral').getBoundingClientRect(), c = document.querySelector('.con-indice').getBoundingClientRect();
          return { a: [...document.querySelectorAll('.indice--lateral a')].findIndex(x => x.getAttribute('aria-current')), top: Math.round(n.top), pegado: c.top + 60 < 0 && c.bottom > n.height + 60, fin: innerHeight + scrollY >= document.documentElement.scrollHeight - 2 }; });
        if (s.a !== seq[seq.length - 1]) seq.push(s.a);
        if (s.pegado) tops.push(s.top);   /* mientras la rejilla tiene recorrido, el índice no se mueve */
        if (s.fin) break;
      }
      await espera(300);
      const ultimo = await page.evaluate(() => [...document.querySelectorAll('.indice--lateral a')].findIndex(x => x.getAttribute('aria-current')));
      if (ultimo !== seq[seq.length - 1]) seq.push(ultimo);
      if (seq[0] !== 0 || seq.length < 2 || seq.some((x, i) => i && x < seq[i - 1]) || ultimo !== r.n - 1) malos.push(`${p}: aria-current al bajar ${seq.join('→')} (de ${r.n})`);
      if (tops.length < 2 || new Set(tops).size > 1) malos.push(`${p}: el índice no se queda fijo (${tops.join(', ')})`);
      await ctx.close();
      /* móvil: desplegable plegado arriba, sin columna */
      const m = await nueva({ viewport: { width: 390, height: 844 } });
      await ir(m.page, p);
      const mv = await m.page.evaluate(() => { const d = document.querySelector('.indice--movil details'); return { vis: d.checkVisibility(), abierto: d.open, lateral: document.querySelector('.indice--lateral').checkVisibility(), arriba: d.getBoundingClientRect().top < document.querySelector('.con-indice__cuerpo').getBoundingClientRect().top }; });
      if (!mv.vis || mv.abierto || mv.lateral || !mv.arriba) malos.push(`${p} a 390: ${JSON.stringify(mv)}`);
      await m.page.click('.indice--movil summary');
      if (!(await m.page.evaluate(() => document.querySelector('.indice--movil details').open && document.querySelector('.indice--movil a').checkVisibility()))) malos.push(`${p} a 390: el desplegable no abre`);
      await m.ctx.close();
    }
    /* sin JavaScript, la lista se ve (en el móvil, el desplegable viene abierto) */
    if (conIndice.length) {
      for (const w of [390, 1440]) {
        const ctx = await navegador.newContext({ viewport: { width: w, height: 844 }, javaScriptEnabled: false });
        const page = await ctx.newPage();
        await page.goto(BASE + conIndice[0], { waitUntil: 'networkidle' });
        const n = await page.evaluate(() => [...document.querySelectorAll('.indice a')].filter(a => a.checkVisibility()).length);
        if (!n) malos.push(`sin JavaScript a ${w}: la lista del índice no se ve`);
        await ctx.close();
      }
    }
    comprobar(!malos.length && conIndice.length > 0, `v3 · índice «En esta página» en las páginas largas (${conIndice.join(', ')}): sale de sus h2, columna lateral fija en escritorio con aria-current que avanza al bajar hasta la última sección, desplegable plegado arriba en el móvil y la lista a la vista sin JavaScript` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* ── 7. buscador: lo encontrado con <mark> (sin tildes ni mayúsculas), cuenta en role=status,
     entrada escalonada ≤ 300 ms solo con transform y nada con movimiento reducido; axe ── */
  {
    const malos = [];
    const casos = [['empadronarme', ['empad', 'padron']], ['PADRON', ['padron']], ['licencia', ['licencia']]]
      .filter(([q]) => (M.tramites.todos || []).some(t => sinTildes(t.nombre).includes(sinTildes(q).slice(0, 5))));
    for (const reducido of [true, false]) {
      const { ctx, page } = await nueva({ reducido: reducido ? undefined : false, viewport: { width: 1440, height: 900 } });
      await ir(page, 'noticias.html');
      for (const [q, raices] of casos) {
        await page.click('[data-abrir-buscador]');
        /* la entrada se mide en cuanto se pintan los resultados (dura menos que la espera) */
        await page.evaluate(() => {
          window.__entrada = null;
          const ul = document.querySelector('#buscador .resultados');
          const mo = new MutationObserver(() => {
            if (!ul.children.length) return;   /* al vaciar el campo se vacía la lista: esa no cuenta */
            /* v3b: los resultados van en grupos (título y lista por tipo): cuentan los <li> */
            const anims = [...ul.querySelectorAll('li')].flatMap(li => li.getAnimations());
            window.__entrada = { fin: Math.max(0, ...anims.map(a => { const t = a.effect.getComputedTiming(); return (t.delay || 0) + t.duration; })),
              props: [...new Set(anims.flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)))))] };
            mo.disconnect();
          });
          mo.observe(ul, { childList: true });
        });
        await page.fill('#buscador [data-buscador-campo]', q);
        /* la cuenta ya tenía texto de la búsqueda anterior: se espera a que se pinte esta */
        await page.waitForFunction(() => window.__entrada !== null, null, { timeout: 3000 }).catch(() => {});
        const r = await page.evaluate(() => {
          window.__entrada = window.__entrada || { fin: 0, props: [] };
          const lis = [...document.querySelectorAll('#buscador .resultados li')];
          return { n: lis.length, marcas: [...document.querySelectorAll('#buscador .resultados mark')].map(m => m.textContent), primero: lis[0] ? lis[0].querySelectorAll('mark').length : 0,
            cuenta: document.querySelector('#buscador [data-buscador-cuenta]').textContent, rol: document.querySelector('#buscador [data-buscador-cuenta]').getAttribute('role'),
            fin: window.__entrada.fin, props: window.__entrada.props };
        });
        if (!r.n || !r.primero || r.marcas.some(mk => !raices.some(x => sinTildes(mk).includes(x)) && !Object.values(M.tramites.sinonimos || {}).flat().some(s => sinTildes(s).includes(sinTildes(mk)) || sinTildes(mk).includes(sinTildes(s))))) malos.push(`«${q}»: marcas ${JSON.stringify(r.marcas.slice(0, 5))} en ${r.n} resultados`);
        if (r.rol !== 'status' || !r.cuenta.includes(String(r.n))) malos.push(`«${q}»: cuenta «${r.cuenta}»`);
        if (reducido && r.fin) malos.push(`reducido: los resultados se animan (${r.fin} ms)`);
        if (!reducido && (!r.fin || r.fin > 300 || r.props.some(x => x !== 'translate' && x !== 'transform'))) malos.push(`con movimiento: entrada de ${r.fin} ms con ${r.props.join(', ')}`);
        if (!reducido && q === casos[0][0]) {
          await espera(400);
          const viol = (await new AxeBuilder({ page }).include('#buscador').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
          if (viol.length) malos.push('axe con marcas: ' + viol.join(', '));
        }
        await page.keyboard.press('Escape');
      }
      await ctx.close();
    }
    comprobar(casos.length > 0 && !malos.length, `v3 · buscador: ${casos.map(c => '«' + c[0] + '»').join(', ')} marcan con <mark> la palabra encontrada (sin tildes ni mayúsculas), la cuenta sigue en role=status, la entrada es escalonada solo con transform y ≤ 300 ms, quieta con movimiento reducido, y axe pasa con las marcas` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }
}

/* ═════════════ v3 · identidad: el perfil del pueblo, el pie, el plano, la impresión y el hemiciclo ═════════════
   - V7. El perfil del pueblo a línea (marca/perfil.svg o el genérico): en el pie, aria-hidden, a todo el
     ancho sin desbordar (320, 1440, 1920), sin estirar (slice), trazado al asomar y en reposo dibujado.
   - V8. El pie a tres columnas con el plano propio de OSM (atribución, sin peticiones) y a dos sin él.
   - F1. La hoja de teléfonos cabe en UNA A4 (PDF de Playwright) y la impresión quita navegación y cookies.
   - M4. El hemiciclo resalta los escaños de un grupo con el ratón y con el teclado (aria-pressed, Esc).
   - axe 0 en los estados nuevos y en la copia sin perfil ni plano. */
async function v3Identidad() {
  const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  const conPerfil = fs.existsSync(path.join(RAIZ, 'marca/perfil.svg')), conPlano = fs.existsSync(path.join(RAIZ, 'marca/plano.svg'));

  /* 0. sin navegador: recursos limpios y la hoja de impresión enlazada con media="print" */
  {
    const malos = [];
    const colorLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
    for (const rel of ['css/imprimir.css', 'js/identidad.js', 'fuente/_perfil_generico.svg', ...(conPerfil ? ['marca/perfil.svg'] : []), ...(conPlano ? ['marca/plano.svg'] : [])]) {
      if (!fs.existsSync(path.join(RAIZ, rel))) { malos.push('falta ' + rel); continue; }
      const t = leer(RAIZ, rel).replace(/url\(#[^)]*\)|href="#[^"]*"/g, '');
      if (colorLiteral.test(t)) malos.push(rel + ' lleva un color escrito');
    }
    for (const p of PAGINAS) if (!/<link rel="stylesheet" href="css\/imprimir\.css\?v=[0-9a-f]{8}" media="print">/.test(leer(RAIZ, p))) malos.push(p + ' sin css/imprimir.css (media="print")');
    if (conPlano) {
      const meta = JSON.parse(leer(RAIZ, 'marca', 'plano.json'));
      if (!/OpenStreetMap/.test(meta.atribucion || '') || !/openstreetmap\.org\/copyright/.test(meta.atribucion_url || '') || !/^(node|way|relation)\/\d+$/.test(meta.osm || '')) malos.push('marca/plano.json sin atribución u origen: ' + JSON.stringify(meta).slice(0, 120));
    }
    comprobar(!malos.length, 'v3 identidad: imprimir.css, identidad.js y los SVG del perfil y del plano sin colores escritos; la hoja de impresión en todas las páginas con media="print"; el plano dice de qué elemento de OSM sale' + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* 1. V7. el perfil: en el pie, decorativo, a todo el ancho y sin desbordar */
  {
    const malos = [];
    for (const [w, h] of [[320, 640], [390, 844], [1440, 900], [1920, 1080]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ir(page, 'index.html');
      const r = await page.evaluate(() => {
        const p = document.querySelector('footer.pie > .pie__perfil'), svg = p && p.querySelector('svg');
        if (!svg) return null;
        const b = svg.getBoundingClientRect(), W = document.querySelector('footer.pie').getBoundingClientRect().width, paths = [...svg.querySelectorAll('path')];
        return { nombre: p.getAttribute('data-perfil'), oculto: svg.getAttribute('aria-hidden'), par: svg.getAttribute('preserveAspectRatio'), izq: b.left, der: b.right, ancho: b.width, alto: b.height, W,
          sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth, trazos: paths.length, sinLargo: paths.filter(x => x.getAttribute('pathLength') !== '1').length,
          vb: svg.viewBox.baseVal.width / svg.viewBox.baseVal.height, primero: p === document.querySelector('footer.pie').firstElementChild };
      });
      if (!r) { malos.push(w + ' px: no hay perfil en el pie'); await ctx.close(); continue; }
      if (r.oculto !== 'true' || r.par !== 'xMidYMax slice' || r.trazos < 40 || r.sinLargo || !r.primero) malos.push(`${w} px: ${JSON.stringify(r)}`);
      if (Math.abs(r.izq) > 0.5 || Math.abs(r.der - r.W) > 0.5 || r.sobra > 0) malos.push(`${w} px: no va de borde a borde o desborda (${Math.round(r.izq)}–${Math.round(r.der)} de ${r.W}, +${r.sobra})`);
      /* sin estirar: a partir de ~780 px la caja tiene la proporción del lienzo; por debajo, 88 px de alto y se recorta */
      if (w >= 800 && Math.abs(r.ancho / r.alto - r.vb) > 0.15) malos.push(`${w} px: la caja (${Math.round(r.ancho)}×${Math.round(r.alto)}) no sigue la proporción del dibujo (${r.vb.toFixed(2)})`);
      if (w < 780 && Math.abs(r.alto - 88) > 1) malos.push(`${w} px: en móvil mide ${Math.round(r.alto)} px de alto (88)`);
      if (CAPTURAS) await page.locator('.pie__perfil').screenshot({ path: captura(`v3-perfil-${w}.png`) });
      if (w === 1440 && r.nombre !== (conPerfil ? JSON.parse(leer(RAIZ, 'marca', 'perfil.json')).nombre : 'generico')) malos.push('data-perfil «' + r.nombre + '»');
      await ctx.close();
    }
    comprobar(!malos.length, `v3 V7: el perfil del pueblo («${conPerfil ? 'propio' : 'genérico'}») abre el pie, es aria-hidden, va de borde a borde a 320, 390, 1440 y 1920 px sin desbordar, sin estirarse (slice) y cada trazo lleva pathLength=1` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* 2. V7. se traza al asomar (≤ 600 ms) y acaba dibujado; con movimiento reducido, quieto y entero */
  {
    const { ctx, page } = await nueva({ reducido: false });
    await ir(page, 'index.html');
    const antes = await page.evaluate(() => ({ clase: document.querySelector('.pie__perfil').classList.contains('mov-perfil'), dash: getComputedStyle(document.querySelector('.pie__perfil path')).strokeDasharray }));
    const durante = await page.evaluate(async () => {
      document.querySelector('.pie__perfil').scrollIntoView({ block: 'center' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
      const paths = [...document.querySelectorAll('.pie__perfil path')];
      const an = paths.flatMap(p => p.getAnimations()).filter(a => a.animationName === 'mov-perfil');
      const offs = paths.slice(0, 30).map(p => parseFloat(getComputedStyle(p).strokeDashoffset));
      return { n: an.length, dur: Math.max(0, ...an.map(a => a.effect.getComputedTiming().duration)), medio: offs.some(o => o > 0.05 && o < 0.99) };
    });
    await espera(900);
    const despues = await page.evaluate(() => {
      const paths = [...document.querySelectorAll('.pie__perfil path')];
      return { vivas: paths.flatMap(p => p.getAnimations()).filter(a => a.playState === 'running').length,
        sinDibujar: paths.filter(p => { const cs = getComputedStyle(p); return cs.strokeDasharray !== 'none' || parseFloat(cs.strokeDashoffset) !== 0; }).length, clase: document.querySelector('.pie__perfil').classList.contains('mov-perfil') };
    });
    await ctx.close();
    const q = await nueva();
    await ir(q.page, 'index.html');
    const quieto = await q.page.evaluate(async () => {
      document.querySelector('.pie__perfil').scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 300));
      const paths = [...document.querySelectorAll('.pie__perfil path')];
      return { clase: document.querySelector('.pie__perfil').classList.contains('mov-perfil'), an: paths.flatMap(p => p.getAnimations()).length, dash: paths.filter(p => getComputedStyle(p).strokeDasharray !== 'none').length };
    });
    await q.ctx.close();
    const ok = !antes.clase && antes.dash === 'none' && durante.n > 40 && durante.dur > 0 && durante.dur <= 600 && durante.medio && !despues.vivas && !despues.sinDibujar && despues.clase && !quieto.clase && !quieto.an && !quieto.dash;
    comprobar(ok, `v3 V7: el perfil está dibujado en reposo, se traza al asomar (${durante.n} trazos, ${durante.dur} ms, a medias a los 120 ms) y acaba entero; con movimiento reducido no se anima nada` +
      (ok ? '' : ' → ' + JSON.stringify({ antes, durante, despues, quieto })));
  }

  /* 3. V8. el pie a tres columnas con el plano; en móvil, una; el plano sin peticiones y con su atribución */
  if (conPlano) {
    const malos = [];
    const { ctx, page } = await nueva();
    const fuera = [];
    page.on('request', r => { if (!r.url().startsWith(BASE)) fuera.push(r.url()); });
    for (const p of ['index.html', 'telefonos.html', 'ayuntamiento.html']) {
      await ir(page, p);
      await page.evaluate(() => document.querySelector('.pie__plano').scrollIntoView());
      await espera(150);
    }
    if (fuera.length) malos.push('peticiones fuera de la web: ' + fuera.slice(0, 3).join(', '));
    const r = await page.evaluate(() => {
      const rej = document.querySelector('.pie__rejilla'), cols = [...rej.children].filter(c => c.classList.contains('pie__col'));
      const plano = document.querySelector('.pie__plano'), svg = plano.querySelector('svg'), osm = [...plano.querySelectorAll('a')].find(a => /openstreetmap\.org\/copyright/.test(a.href));
      return { pistas: getComputedStyle(rej).gridTemplateColumns.split(' ').length, cols: cols.length, tops: cols.map(c => Math.round(c.getBoundingClientRect().top)),
        oculto: svg.getAttribute('aria-hidden'), enlace: svg.closest('a') ? svg.closest('a').getAttribute('href') : null, nombre: svg.closest('a') ? svg.closest('a').textContent.trim() : '',
        osm: osm ? osm.textContent : null, imagenes: svg.querySelectorAll('image, use, foreignObject').length, rotulos: svg.querySelectorAll('text').length,
        legal: [...document.querySelectorAll('.pie__legal a')].map(a => a.getAttribute('href')), utiles: [...document.querySelectorAll('.pie__lista a')].map(a => a.getAttribute('href')) };
    });
    if (r.pistas !== 3 || r.cols !== 3 || Math.max(...r.tops) - Math.min(...r.tops) > 2) malos.push('a 1440 px: ' + JSON.stringify({ pistas: r.pistas, cols: r.cols, tops: r.tops }));
    if (r.oculto !== 'true' || !/contacto\.html#t-donde$/.test(r.enlace || '') || r.nombre.length < 10) malos.push('el plano: ' + JSON.stringify({ oculto: r.oculto, enlace: r.enlace, nombre: r.nombre }));
    if (!/© colaboradores de OpenStreetMap/.test(r.osm || '') || r.imagenes || r.rotulos < 2) malos.push('atribución u origen del plano: ' + JSON.stringify({ osm: r.osm, imagenes: r.imagenes, rotulos: r.rotulos }));
    for (const h of ['aviso-legal.html', 'privacidad.html', 'cookies.html', 'accesibilidad.html']) if (!r.legal.includes(h)) malos.push('falta ' + h + ' en la fila legal');
    for (const h of ['tramites.html', 'telefonos.html', 'agenda.html', 'accesibilidad.html']) if (!r.utiles.includes(h)) malos.push('falta ' + h + ' en enlaces útiles');
    if (!r.utiles.some(h => h.startsWith(sedeBase))) malos.push('enlaces útiles sin la sede');
    if (CAPTURAS) await page.locator('footer.pie').screenshot({ path: captura('v3-pie-1440.png') });
    await ctx.close();
    const m = await nueva({ viewport: { width: 390, height: 844 } });
    await ir(m.page, 'index.html');
    const mov = await m.page.evaluate(() => { const rej = document.querySelector('.pie__rejilla'); return { pistas: getComputedStyle(rej).gridTemplateColumns.split(' ').length, ancho: Math.round(document.querySelector('.pie__plano svg').getBoundingClientRect().width) }; });
    if (mov.pistas !== 1 || mov.ancho < 300) malos.push('a 390 px: ' + JSON.stringify(mov));
    if (CAPTURAS) await m.page.locator('footer.pie').screenshot({ path: captura('v3-pie-390.png') });
    await m.ctx.close();
    comprobar(!malos.length, 'v3 V8: el pie va a tres columnas alineadas (el Ayuntamiento, enlaces útiles con la sede y el plano) y a una en móvil; legales en su fila; el plano es un dibujo propio aria-hidden que lleva a «Contacto», con «© colaboradores de OpenStreetMap» y sin una sola petición fuera de la web' + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  } else notas.push('NOTA  · v3 V8: este municipio no tiene marca/plano.svg; el pie va a dos columnas (se prueba abajo)');

  /* 4. sin perfil propio ni plano (copia): el perfil genérico y el pie a dos columnas sin hueco */
  {
    const dest = copiar();
    try {
      for (const f of ['marca/perfil.svg', 'marca/plano.svg', 'marca/plano.json']) fs.rmSync(path.join(dest, f), { force: true });
      const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      if (ap.status !== 0) { comprobar(false, 'v3: aplicar.mjs falla sin perfil ni plano → ' + (ap.stderr || ap.stdout).slice(-300)); return; }
      const srv = crearServidor(dest, null);
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const b = 'http://127.0.0.1:' + srv.address().port + '/';
      const malos = [], viol = [];
      for (const [w, h] of [[320, 640], [1440, 900]]) {
        const ctx = await navegador.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
        await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, SLUG);
        const page = await ctx.newPage();
        await page.goto(b + 'index.html', { waitUntil: 'networkidle' });
        const r = await page.evaluate(() => {
          const rej = document.querySelector('.pie__rejilla'), cs = getComputedStyle(rej), cols = [...rej.children].filter(c => c.classList.contains('pie__col'));
          const dentro = rej.getBoundingClientRect().right - parseFloat(cs.paddingRight);
          return { perfil: document.querySelector('.pie__perfil') ? document.querySelector('.pie__perfil').getAttribute('data-perfil') : null, trazos: document.querySelectorAll('.pie__perfil path').length,
            plano: !!document.querySelector('.pie__plano'), pistas: cs.gridTemplateColumns.split(' ').length, cols: cols.length,
            hueco: Math.round(dentro - Math.max(...cols.map(c => c.getBoundingClientRect().right))), sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        if (r.perfil !== 'generico' || r.trazos < 40 || r.plano || r.cols !== 2 || r.sobra > 0) malos.push(`${w} px: ${JSON.stringify(r)}`);
        if (w === 1440 && (r.pistas !== 2 || r.hueco > 1)) malos.push(`1440 px: ${r.pistas} columnas, ${r.hueco} px de hueco a la derecha`);
        viol.push(...(await new AxeBuilder({ page }).withTags(AXE).analyze()).violations.map(v => w + ' ' + v.id));
        if (CAPTURAS && w === 1440) await page.locator('footer.pie').screenshot({ path: captura('v3-pie-generico-1440.png') });
        await ctx.close();
      }
      srv.close();
      comprobar(!malos.length && !viol.length, 'v3 V7/V8: sin marca/perfil.svg sale el perfil genérico (casas y espadaña, ninguna arcada) y sin marca/plano.svg el pie queda a dos columnas que llenan el ancho; sin desborde a 320 px y 0 violaciones de axe' + (malos.length ? ' → ' + malos.join(' | ') : '') + (viol.length ? ' → axe: ' + viol.join(', ') : ''));
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
  }

  /* 5. F1. la hoja de teléfonos cabe en UNA A4; la impresión quita navegación, cookies y botones */
  {
    const malos = [];
    const { ctx, page } = await nueva({ conCookies: true });
    await ir(page, 'telefonos.html');
    const pantalla = await page.evaluate(() => ({ boton: !!document.querySelector('[data-imprimir]') && document.querySelector('[data-imprimir]').checkVisibility(),
      cabeza: document.querySelector('.nevera-cabeza').checkVisibility(), pie: document.querySelector('.nevera-pie').checkVisibility(), cookies: document.getElementById('cookies').checkVisibility() }));
    if (!pantalla.boton || pantalla.cabeza || pantalla.pie || !pantalla.cookies) malos.push('en pantalla: ' + JSON.stringify(pantalla));
    await page.emulateMedia({ media: 'print' });
    const papel = await page.evaluate(() => {
      const ve = s => [...document.querySelectorAll(s)].some(e => e.checkVisibility());
      const urg = document.querySelector('.listin__fila--urgente .listin__numero'), otro = document.querySelector('.listin-grupo:not(:first-child) .listin__numero');
      return { nav: ve('.menu, .cabecera, .saltar, .propuesta'), cookies: ve('#cookies'), botones: ve('button, .boton'), pieLargo: ve('.sede-franja, .pie__rejilla, .pie__perfil'),
        cabeza: ve('.nevera-cabeza'), titulo: (document.querySelector('.nevera-cabeza__titulo') || {}).textContent || '', fecha: (document.querySelector('.nevera-pie') || {}).textContent || '',
        urgente: urg ? parseFloat(getComputedStyle(urg).fontSize) : 0, numero: otro ? parseFloat(getComputedStyle(otro).fontSize) : 0, fondo: getComputedStyle(document.body).backgroundImage };
    });
    if (papel.nav || papel.cookies || papel.botones || papel.pieLargo) malos.push('en papel se ve: ' + JSON.stringify({ nav: papel.nav, cookies: papel.cookies, botones: papel.botones, pie: papel.pieLargo }));
    if (!papel.cabeza || papel.titulo !== 'Teléfonos útiles de ' + M.nombre || !/actualizados el .*Impreso el/.test(papel.fecha) || papel.urgente < 32 || papel.numero < 17 || papel.fondo !== 'none') malos.push('la hoja: ' + JSON.stringify(papel));
    const pdf = await page.pdf({ format: 'A4' });
    const hojas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (hojas !== 1) malos.push(`el PDF A4 tiene ${hojas} hojas`);
    if (CAPTURAS) fs.writeFileSync(captura('v3-telefonos-impresion.pdf'), pdf);
    /* otra página cualquiera en papel: sin navegación ni cookies, con el escudo y la dirección de los enlaces externos */
    await page.emulateMedia({ media: 'screen' });
    await ir(page, 'contacto.html');
    await page.emulateMedia({ media: 'print' });
    const otra = await page.evaluate(() => {
      const ve = s => [...document.querySelectorAll(s)].some(e => e.checkVisibility());
      const ext = [...document.querySelectorAll('main a[href^="http"]')][0];
      return { nav: ve('.menu, .cabecera__acciones, .propuesta'), cookies: ve('#cookies'), escudo: ve('.cabecera__escudo'), url: ext ? getComputedStyle(ext, '::after').content : 'sin enlace' };
    });
    if (otra.nav || otra.cookies || !otra.escudo || !/attr\(href\)|http/.test(otra.url)) malos.push('contacto en papel: ' + JSON.stringify(otra));
    await ctx.close();
    /* sin JavaScript, el botón no sale */
    const sj = await navegador.newContext({ javaScriptEnabled: false });
    const pj = await sj.newPage();
    await pj.goto(BASE + 'telefonos.html', { waitUntil: 'networkidle' });
    if (await pj.evaluate(() => document.querySelector('[data-imprimir]').checkVisibility())) malos.push('sin JS se ve el botón de imprimir');
    await sj.close();
    comprobar(!malos.length, `v3 F1: «Imprimir los teléfonos» solo con JS; en papel, la hoja de la nevera (escudo, «Teléfonos útiles de ${M.nombre}», urgencias a ${Math.round(papel.urgente)} px y el resto a ${Math.round(papel.numero)} px, fechas y web) cabe en UNA A4 (${hojas}); y cualquier página se imprime sin navegación, cookies, botones ni pie largo, con la dirección de los enlaces externos` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* 6. M4. el hemiciclo resalta los escaños de un grupo con el ratón y con el teclado */
  const grupos = (M.corporacion && M.corporacion.grupos) || [];
  if (grupos.length && PAGINAS.includes('ayuntamiento.html')) {
    const malos = [];
    const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const cuenta = sig => M.corporacion.miembros.filter(m => m.grupo === sig).length;
    const estado = page => page.evaluate(() => {
      const cs = [...document.querySelectorAll('svg.hemiciclo circle[data-grupo]')];
      return { claros: [...new Set(cs.filter(c => parseFloat(getComputedStyle(c).opacity) > 0.9).map(c => c.getAttribute('data-grupo')))], apagados: cs.filter(c => parseFloat(getComputedStyle(c).opacity) < 0.5).length,
        total: cs.length, centro: document.querySelector('.hemiciclo__total').textContent + ' ' + document.querySelector('.hemiciclo__rotulo').textContent,
        pulsados: [...document.querySelectorAll('.pleno__boton[aria-pressed="true"]')].map(b => b.closest('li').getAttribute('data-grupo')), botones: document.querySelectorAll('.pleno__boton').length };
    });
    const { ctx, page } = await nueva();
    await ir(page, 'ayuntamiento.html');
    const e0 = await estado(page);
    if (e0.botones !== grupos.length || e0.apagados || e0.pulsados.length) malos.push('en reposo: ' + JSON.stringify(e0));
    /* ratón: cada grupo de la leyenda */
    for (const g of grupos) {
      await page.hover(`.pleno__leyenda li[data-grupo="${slug(g.sigla)}"]`);
      const e = await estado(page);
      if (e.claros.length !== 1 || e.claros[0] !== slug(g.sigla) || e.apagados !== e.total - cuenta(g.sigla) || e.centro !== cuenta(g.sigla) + ' de ' + g.sigla) malos.push('ratón en ' + g.sigla + ': ' + JSON.stringify(e));
    }
    await page.mouse.move(5, 5);
    if ((await estado(page)).apagados) malos.push('al salir el ratón quedan escaños apagados');
    /* la tarjeta de concejales también */
    await page.hover(`.grupo[data-grupo="${slug(grupos[0].sigla)}"]`);
    if ((await estado(page)).claros.join() !== slug(grupos[0].sigla)) malos.push('la tarjeta del grupo no resalta');
    await page.mouse.move(5, 5);
    /* teclado: el Tabulador llega a la leyenda, el foco resalta, Intro lo deja pulsado y Esc lo suelta */
    await page.focus('.pleno__boton');
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    const f = await page.evaluate(() => document.activeElement.classList.contains('pleno__boton'));
    const ef = await estado(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const eT = await estado(page);
    if (CAPTURAS) await page.locator('.pleno').screenshot({ path: captura('v3-hemiciclo-resaltado.png') });
    const violP = (await new AxeBuilder({ page }).include('.pleno').withTags(AXE).analyze()).violations.map(v => v.id);
    await page.keyboard.press('Escape');
    const eE = await estado(page);
    if (!f || ef.claros.join() !== slug(grupos[0].sigla)) malos.push('foco: ' + JSON.stringify({ f, ef }));
    if (eT.pulsados.join() !== slug(grupos[0].sigla) || (grupos[1] && eT.claros.join() !== slug(grupos[1].sigla))) malos.push('Intro y Tab: ' + JSON.stringify(eT));
    if (eE.pulsados.length || eE.apagados) malos.push('Esc: ' + JSON.stringify(eE));
    if (violP.length) malos.push('axe con un grupo pulsado: ' + violP.join(', '));
    await ctx.close();
    /* con movimiento, la transición es de opacidad y ≤ 200 ms; con reducido (lo de arriba) no hay */
    const mv = await nueva({ reducido: false });
    await ir(mv.page, 'ayuntamiento.html');
    const tr = await mv.page.evaluate(() => { const cs = getComputedStyle(document.querySelector('svg.hemiciclo circle')); return { p: cs.transitionProperty, d: cs.transitionDuration }; });
    await mv.ctx.close();
    /* v3b · M11: además de la opacidad (≤ 200 ms), el salto de los escaños pulsados (translate, ≤ 300 ms) */
    const durDe = (prop, tr) => { const ps = tr.p.split(',').map(x => x.trim()), ds = tr.d.split(',').map(parseFloat); const i = ps.indexOf(prop); return i < 0 ? null : ds[i % ds.length]; };
    if (durDe('opacity', tr) == null || durDe('opacity', tr) > 0.2 || Math.max(...tr.d.split(',').map(parseFloat)) > 0.3) malos.push('transición: ' + JSON.stringify(tr));
    comprobar(!malos.length, `v3 M4: el hemiciclo resalta los escaños de cada uno de los ${grupos.length} grupos al pasar el ratón por la leyenda o por su tarjeta (el centro dice «N de SIGLA»), con el teclado (foco, Intro deja el botón pulsado con aria-pressed, Esc lo suelta), transición de opacidad ≤ 200 ms (y ninguna de más de 300 ms) solo con movimiento y 0 violaciones de axe` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }
}

/* ═════════════ v3b · interiores: incidencias, lectura fácil, progreso de lectura y hemiciclo ═════════════
   F9. «Avisar de un problema» (incidencia.html): respaldo sin JS (form mailto text/plain), validación
       accesible (resumen con foco, errores enlazados con aria-describedby, aria-invalid), el mailto
       (destinatario, asunto y cuerpo con todos los campos, codificado, CRLF), axe en cada estado, el
       enlace desde «Por momentos» y, en una copia sin incidencias.correo, que no se genera.
   F10. Lectura fácil (facil.html): un trámite por entrada de contenido/facil.json, cada uno enlazado
       desde su atajo de Trámites (y el de la incidencia desde su momento), frases de 20 palabras como
       mucho, sin abreviaturas, un pictograma por paso, letra grande, la nota de validación y axe.
   M10. Noticias: la línea de progreso existe solo con soporte y con movimiento, es aria-hidden y al
       final llega al 100 %; el tiempo de lectura casa con las palabras del cuerpo (200 por minuto).
   M11. Hemiciclo: los escaños del grupo pulsado saltan hacia el centro (≤ 300 ms) sin mover el texto,
       vuelven al soltar y, con movimiento reducido, se quedan quietos (solo el atenuado). */
async function v3bInteriores() {
  const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  const axeEn = async (page, nombre, viol) => (await new AxeBuilder({ page }).withTags(AXE).analyze()).violations.forEach(v => viol.push(nombre + ': ' + v.id + ' ' + v.nodes[0].target.join(' ')));

  /* ── F9. incidencias ── */
  const inc = M.incidencias && M.incidencias.correo ? M.incidencias : null;
  if (inc) {
    const malos = [], viol = [];
    const h = fs.existsSync(path.join(RAIZ, 'incidencia.html')) ? leer(RAIZ, 'incidencia.html') : '';
    if (!h) malos.push('con incidencias.correo no hay incidencia.html');
    /* respaldo sin JavaScript: el formulario se envía solo como mailto en texto */
    const formHtml = (h.match(/<form\b[^>]*data-incidencia[^>]*>/) || [''])[0];
    const mailtoAction = 'mailto:' + inc.correo + '?subject=';
    if (!formHtml.includes('action="' + mailtoAction) || !/method="post"/.test(formHtml) || !/enctype="text\/plain"/.test(formHtml) || /novalidate/.test(formHtml)) malos.push('respaldo: ' + formHtml);
    for (const n of ['categoria', 'donde', 'descripcion']) if (!new RegExp('name="' + n + '"[^>]*required').test(h)) malos.push('sin JS, «' + n + '» no es obligatorio');
    const tram = leer(RAIZ, 'tramites.html');
    if ((M.tramites.momentos || []).some(m => m.incidencia) && !/class="momento__accion"><a [^>]*href="incidencia\.html"/.test(tram)) malos.push('«Por momentos» no enlaza incidencia.html');
    const sj = await navegador.newContext({ javaScriptEnabled: false });
    const pj = await sj.newPage();
    await pj.goto(BASE + 'incidencia.html', { waitUntil: 'networkidle' });
    const sinJs = await pj.evaluate(() => ({ form: document.querySelector('[data-incidencia]').checkVisibility(), enviar: document.querySelector('[data-incidencia] [type="submit"]').checkVisibility(),
      listo: document.querySelector('[data-incidencia-listo]').checkVisibility(), ubicacion: document.querySelector('[data-ubicacion]').checkVisibility() }));
    await sj.close();
    if (!sinJs.form || !sinJs.enviar || sinJs.listo || sinJs.ubicacion) malos.push('sin JS: ' + JSON.stringify(sinJs));

    const { ctx, page, errores } = await nueva({ viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
    await ctx.setGeolocation({ latitude: 38.5512, longitude: -6.2389 });
    await ir(page, 'incidencia.html');
    /* 1. vacío: resumen con el foco y un error por campo obligatorio, enlazado al campo */
    await page.click('[data-incidencia] [type="submit"]');
    const errs = await page.evaluate(() => {
      const r = document.querySelector('[data-incidencia-errores]');
      const enlaces = [...r.querySelectorAll('a')].map(a => a.getAttribute('href'));
      const campos = ['#cat-' + (document.querySelector('input[name="categoria"]').id.replace(/^cat-/, '')), '#campo-donde', '#campo-descripcion'];
      const enlazado = sel => {
        const el = sel.startsWith('#cat-') ? document.getElementById('campo-categoria') : document.querySelector(sel);
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/);
        const err = ids.map(i => document.getElementById(i)).find(x => x && x.classList.contains('campo__error'));
        return el.getAttribute('aria-invalid') === 'true' && !!err && err.checkVisibility() && err.textContent.trim().length > 10;
      };
      return { visible: r.checkVisibility(), foco: document.activeElement === r, enlaces, campos, enlazados: campos.map(enlazado), opcional: document.getElementById('campo-correo').hasAttribute('aria-invalid') };
    });
    if (!errs.visible || !errs.foco || errs.enlaces.join() !== errs.campos.join() || errs.enlazados.includes(false) || errs.opcional) malos.push('validación vacía: ' + JSON.stringify(errs));
    await axeEn(page, 'incidencia con errores', viol);
    /* el enlace del resumen lleva el foco al campo */
    await page.click('[data-incidencia-errores] a[href="#campo-donde"]');
    if (!(await page.evaluate(() => document.activeElement.id === 'campo-donde'))) malos.push('el enlace del resumen no lleva el foco al campo');
    /* 2. un correo opcional mal escrito también se avisa */
    await page.check('input[name="categoria"] >> nth=0');
    await page.fill('#campo-donde', 'Calle Mayor, 12');
    await page.fill('#campo-descripcion', 'La farola está apagada desde el lunes.');
    await page.fill('#campo-correo', 'esto-no-es-un-correo');
    await page.click('[data-incidencia] [type="submit"]');
    const e2 = await page.evaluate(() => ({ enlaces: [...document.querySelectorAll('[data-incidencia-errores] a')].map(a => a.getAttribute('href')), inv: document.getElementById('campo-correo').getAttribute('aria-invalid') }));
    if (e2.enlaces.join() !== '#campo-correo' || e2.inv !== 'true') malos.push('correo mal escrito: ' + JSON.stringify(e2));
    /* 3. todo bien: «Usar mi ubicación» y el mailto con todos los campos */
    await page.click('[data-usar-ubicacion]');
    await page.waitForFunction(() => /Coordenadas: 38\.55120, -6\.23890/.test(document.getElementById('campo-donde').value), null, { timeout: 5000 }).catch(() => malos.push('«Usar mi ubicación» no añade las coordenadas'));
    const datos = { descripcion: 'La farola está apagada desde el lunes.\nDe noche no se ve nada & da miedo; ¿pueden mirarla?', nombre: 'Vecina de Prueba', telefono: '600 123 456', correo: 'vecina@ejemplo.es' };
    await page.fill('#campo-descripcion', datos.descripcion);
    await page.fill('#campo-nombre', datos.nombre); await page.fill('#campo-telefono', datos.telefono); await page.fill('#campo-correo', datos.correo);
    await page.check('#campo-foto');
    await page.click('[data-incidencia] [type="submit"]');
    const ok = await page.evaluate(() => {
      const l = document.querySelector('[data-incidencia-listo]');
      const cat = document.querySelector('input[name="categoria"]:checked').value;
      return { visible: l.checkVisibility(), foco: document.activeElement === l, formOculto: !document.querySelector('[data-incidencia]').checkVisibility(), cat,
        donde: document.getElementById('campo-donde').value, href: document.querySelector('[data-incidencia-mailto]').getAttribute('href'),
        foto: document.querySelector('[data-recordar-foto]').checkVisibility(), texto: document.querySelector('[data-incidencia-texto]').value };
    });
    const q = ok.href.indexOf('?'), dest = ok.href.slice(7, q), params = {};
    for (const par of ok.href.slice(q + 1).split('&')) { const [k, v] = par.split('='); params[k] = decodeURIComponent(v); }
    const cuerpo = params.body || '';
    const esperado = [ok.cat, ok.donde, ...datos.descripcion.split('\n'), datos.nombre, datos.telefono, datos.correo, 'adjunto'];
    if (!ok.visible || !ok.foco || !ok.formOculto || !ok.foto) malos.push('listo: ' + JSON.stringify({ ...ok, href: undefined, texto: undefined }));
    if (dest !== inc.correo || !/^mailto:[^?]+\?subject=[^&]+&body=[^&]+$/.test(ok.href) || /[\s<>"]/.test(ok.href)) malos.push('mailto mal formado: ' + ok.href.slice(0, 120));
    if (!params.subject || !params.subject.includes(ok.cat) || !params.subject.includes('Calle Mayor')) malos.push('asunto: ' + params.subject);
    const faltan = esperado.filter(x => !cuerpo.includes(x));
    if (faltan.length) malos.push('al cuerpo le falta: ' + faltan.join(' | '));
    if (/[^\r]\n/.test(cuerpo) || !cuerpo.includes('\r\n')) malos.push('el cuerpo no usa CRLF');
    if (!ok.texto.includes(params.subject) || !ok.texto.includes(inc.correo)) malos.push('el texto para copiar no lleva el asunto y el destinatario');
    await axeEn(page, 'incidencia lista', viol);
    /* 4. el texto se copia */
    await page.click('[data-copiar-texto]');
    await page.waitForFunction(() => document.querySelector('[data-copiar-estado]').textContent.length > 5, null, { timeout: 3000 }).catch(() => malos.push('«Copiar el texto» no dice nada'));
    /* 5. muy largo: lo avisa (algunos programas cortan los mailto largos) */
    await page.click('[data-incidencia-volver]');
    await page.fill('#campo-descripcion', 'Una farola rota. '.repeat(140));
    await page.click('[data-incidencia] [type="submit"]');
    const largo = await page.evaluate(() => ({ aviso: document.querySelector('[data-aviso-largo]').checkVisibility(), copiar: document.querySelector('[data-copiar-texto]').checkVisibility(), n: document.querySelector('[data-incidencia-mailto]').href.length, max: window.Incidencia.LARGO_MAX }));
    if (!(largo.n > largo.max) || !largo.aviso || !largo.copiar) malos.push('texto largo: ' + JSON.stringify(largo));
    if (errores.length) malos.push('consola: ' + errores.slice(0, 2).join(' | '));
    await ctx.close();

    /* 6. sin incidencias.correo no se genera (en una copia) */
    const dest2 = copiar();
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dest2, 'municipio.json'), 'utf8'));
      m.incidencias = { categorias: (m.incidencias || {}).categorias || [] };
      fs.writeFileSync(path.join(dest2, 'municipio.json'), JSON.stringify(m, null, 2));
      const ap = spawnSync('node', [path.join(dest2, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest2 });
      const restos = fs.readdirSync(dest2).filter(f => f.endsWith('.html')).filter(f => /href="incidencia\.html/.test(fs.readFileSync(path.join(dest2, f), 'utf8')));
      if (ap.status !== 0 || fs.existsSync(path.join(dest2, 'incidencia.html')) || restos.length) malos.push('sin correo: ' + JSON.stringify({ status: ap.status, existe: fs.existsSync(path.join(dest2, 'incidencia.html')), restos, err: (ap.stderr || '').slice(-200) }));
    } finally { fs.rmSync(dest2, { recursive: true, force: true }); }
    comprobar(!malos.length && !viol.length, `v3b F9: «Avisar de un problema» con respaldo sin JS (form mailto text/plain con los obligatorios), validación accesible (resumen con el foco y un enlace por error, aria-invalid y error enlazado con aria-describedby), «Usar mi ubicación» que solo rellena coordenadas, un mailto a ${inc.correo} con asunto y cuerpo codificados (todos los campos, CRLF), «Copiar el texto» y aviso si es largo, enlazada desde «Por momentos», 0 violaciones de axe con errores y lista, y sin incidencias.correo no se genera` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 3).join(' | ') : ''));
  }

  /* ── F10. lectura fácil ── */
  const rutaFacil = path.join(RAIZ, 'contenido', 'facil.json');
  if (fs.existsSync(rutaFacil)) {
    const F = JSON.parse(fs.readFileSync(rutaFacil, 'utf8'));
    const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const nombresAtajos = (M.tramites.atajos || []).map(a => a.nombre);
    const esperados = (F.tramites || []).filter(t => (t.atajo && nombresAtajos.includes(t.atajo)) || (t.pagina === 'incidencia' && inc));
    const malos = [], viol = [];
    const tram = leer(RAIZ, 'tramites.html');
    for (const t of esperados) {
      const id = 'facil-' + slug(t.atajo || t.pagina);
      if (t.atajo) {
        /* el enlace va en el mismo <li> que el atajo con ese nombre */
        const li = [...tram.matchAll(/<li><a class="atajo"[\s\S]*?<\/li>/g)].map(m => m[0]).find(x => x.includes('<span class="atajo__nombre">' + t.atajo.replace(/&/g, '&amp;') + '<'));
        if (!li || !li.includes('href="facil.html#' + id + '"')) malos.push('el atajo «' + t.atajo + '» no enlaza su «Explicado fácil»');
      } else if (!tram.includes('href="facil.html#' + id + '"')) malos.push('«' + t.titulo + '» no está enlazado en Trámites');
    }
    const { ctx, page } = await nueva({ viewport: { width: 1280, height: 900 } });
    await ir(page, 'facil.html');
    const r = await page.evaluate(() => {
      const sprite = new Set([...document.querySelectorAll('symbol[id^="f-"]')].map(s => s.id));
      const secciones = [...document.querySelectorAll('.facil-tramite')].map(s => ({ id: s.id, titulo: s.querySelector('h2').textContent.trim(), pasos: s.querySelectorAll('.facil__pasos:not(.facil__pasos--sin) > li').length,
        sinPicto: [...s.querySelectorAll('.facil__paso')].filter(p => { const u = p.querySelector('svg.facil__picto use'); return !u || !sprite.has(u.getAttribute('href').slice(1)); }).length,
        boton: (s.querySelector('.facil__boton') || {}).href || null }));
      const textos = [...document.querySelectorAll('main .facil__frase, main .facil-lista__enlace, main .facil__titulo, main .facil__boton')].map(e => { const c = e.cloneNode(true); c.querySelectorAll('.sr').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
      const frases = textos.flatMap(t => t.split(/(?<=[.!?])\s+/)).filter(Boolean);
      const larga = frases.map(f => ({ f, n: f.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length })).sort((a, b) => b.n - a.n)[0];
      return { secciones, larga, frases: frases.length, todo: textos.join(' '), letra: parseFloat(getComputedStyle(document.querySelector('.facil-tramite .facil__frase')).fontSize),
        base: parseFloat(getComputedStyle(document.body).fontSize), nota: (document.querySelector('.facil__nota') || {}).textContent || '', ids: [...document.querySelectorAll('[id]')].map(e => e.id) };
    });
    if (r.secciones.length !== esperados.length || esperados.length < 1) malos.push(`${r.secciones.length} trámites en la página y ${esperados.length} en los datos`);
    for (const t of esperados) {
      const s = r.secciones.find(x => x.id === 'facil-' + slug(t.atajo || t.pagina));
      if (!s) { malos.push('falta «' + t.titulo + '»'); continue; }
      if (s.pasos !== t.pasos.length || s.pasos < 2 || s.sinPicto || !s.boton) malos.push('«' + t.titulo + '»: ' + JSON.stringify(s));
    }
    if (!r.larga || r.larga.n > 20) malos.push('frase de ' + (r.larga && r.larga.n) + ' palabras: «' + (r.larga && r.larga.f) + '»');
    const abrev = r.todo.match(/(^|\s)(C\/|Avda?\.|Pza?\.|n\.?\s?º|etc\.|Sr\.|Sra\.|Tfno\.?|tel\.|D\.|Dña\.)(?=\s|$)/i);
    if (abrev) malos.push('abreviatura: «' + abrev[2] + '»');
    if (/\b(verde|azul|rojo)\b/i.test(r.todo)) malos.push('el texto nombra un color (cambia con la paleta)');
    if (!(r.letra >= 20 && r.letra > r.base)) malos.push('letra de ' + r.letra + ' px (base ' + r.base + ')');
    if (!/Texto adaptado a lectura fácil\. Pendiente de validar con personas usuarias\./.test(r.nota)) malos.push('falta la nota de validación');
    await axeEn(page, 'facil.html', viol);
    await page.setViewportSize({ width: 320, height: 640 });
    await axeEn(page, 'facil.html a 320 px', viol);
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) malos.push('facil.html desborda a 320 px');
    await ctx.close();
    comprobar(!malos.length && !viol.length, `v3b F10: «Trámites explicados fácil» con ${r.secciones.length} trámites (${r.secciones.map(s => s.titulo).join(', ')}), cada uno enlazado desde su atajo de Trámites, ${r.frases} frases de ${r.larga ? r.larga.n : 0} palabras como mucho, sin abreviaturas ni colores, un pictograma por paso, letra de ${r.letra} px, la nota «Pendiente de validar con personas usuarias» y 0 violaciones de axe (también a 320 px)` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 3).join(' | ') : ''));
  }

  /* ── M10. noticias: tiempo de lectura y línea de progreso ── */
  const noticiasVivas = contenido('noticias').noticias.filter(n => !n.oculto);
  if (noticiasVivas.length) {
    const malos = [];
    const palabras = t => String(t).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
    const base = leer(RAIZ, 'css', 'base.css'), mov = leer(RAIZ, 'css', 'movimiento.css');
    const bloqueSupports = (mov.match(/@supports \(animation-timeline: scroll\(\)\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    if (!/\.lectura-progreso \{ display: none; \}/.test(base) || !/\.lectura-progreso \{[^}]*display: block/.test(bloqueSupports) || (mov.replace(bloqueSupports, '').match(/\.lectura-progreso/g) || []).length) malos.push('la barra no está solo dentro de @supports (animation-timeline: scroll())');
    for (const n of noticiasVivas) {
      const h = leer(RAIZ, 'noticia-' + n.id + '.html');
      const p = palabras((n.cuerpo || []).join(' ')), min = Math.max(1, Math.round(p / 200));
      if (!h.includes(`data-palabras="${p}">${min} min de lectura</span>`)) malos.push(n.id + ': se esperaba «' + min + ' min de lectura» (' + p + ' palabras)');
      if (!/<div class="lectura-progreso" aria-hidden="true"><\/div>/.test(h)) malos.push(n.id + ': la barra no es aria-hidden');
    }
    /* en el navegador: el cuerpo pintado tiene esas palabras; con movimiento la barra va de menos a 100 %; con reducido no sale */
    const larga = noticiasVivas.slice().sort((a, b) => palabras((b.cuerpo || []).join(' ')) - palabras((a.cuerpo || []).join(' ')))[0];
    const medir = page => page.evaluate(() => { const e = document.querySelector('.lectura-progreso'), cs = getComputedStyle(e), m = cs.transform.match(/matrix\(([-\d.e]+)/); return { d: cs.display, x: m ? parseFloat(m[1]) : null, soporte: CSS.supports('animation-timeline: scroll()') }; });
    const mv = await nueva({ reducido: false, viewport: { width: 1280, height: 700 } });
    await ir(mv.page, 'noticia-' + larga.id + '.html');
    const dom = await mv.page.evaluate(() => [document.querySelector('.articulo__cuerpo').innerText, document.querySelector('.articulo__lectura').getAttribute('data-palabras')]);
    if (palabras(dom[0]) !== Number(dom[1])) malos.push('el cuerpo pintado tiene ' + palabras(dom[0]) + ' palabras y el cálculo ' + dom[1]);
    const arriba = await medir(mv.page);
    for (let i = 0; i < 30; i++) { await mv.page.mouse.wheel(0, 500); await espera(40); }
    await espera(300);
    const abajo = await medir(mv.page);
    await mv.ctx.close();
    if (arriba.soporte && (arriba.d !== 'block' || !(arriba.x < 0.5) || abajo.x == null || Math.abs(abajo.x - 1) > 0.01)) malos.push('con movimiento: ' + JSON.stringify({ arriba, abajo }));
    if (!arriba.soporte && arriba.d !== 'none') malos.push('sin soporte se ve la barra');
    const rd = await nueva({ viewport: { width: 1280, height: 700 } });
    await ir(rd.page, 'noticia-' + larga.id + '.html');
    if ((await medir(rd.page)).d !== 'none') malos.push('con movimiento reducido se ve la barra');
    await rd.ctx.close();
    comprobar(!malos.length, `v3b M10: cada una de las ${noticiasVivas.length} noticias dice su tiempo de lectura (palabras del cuerpo ÷ 200, 1 min como poco) y lleva la línea de progreso aria-hidden, que solo existe con soporte de animation-timeline y con movimiento, empieza por debajo de la mitad y al final llega al 100 % (${arriba.soporte ? 'medido: ' + Math.round(arriba.x * 100) + ' % → ' + Math.round(abajo.x * 100) + ' %' : 'sin soporte en este navegador'})` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* ── M11. el hemiciclo se ordena al pulsar un partido ── */
  const grupos = (M.corporacion && M.corporacion.grupos) || [];
  if (grupos.length && PAGINAS.includes('ayuntamiento.html')) {
    const malos = [];
    const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const foto = page => page.evaluate(() => {
      const svg = document.querySelector('svg.hemiciclo'), c0 = (svg.getAttribute('data-centro') || '150 150').split(' ').map(Number);
      const pt = svg.createSVGPoint(); pt.x = c0[0]; pt.y = c0[1];
      const m = svg.getScreenCTM(), cen = pt.matrixTransform(m);
      /* el texto cambia («12 concejales» → «3 de PP»), así que su caja también: se compara dónde está
         anclado y que nada lo traslade (ni él ni su grupo) */
      const txt = [...svg.querySelectorAll('text')].map(t => { const cs = getComputedStyle(t), mt = t.getCTM(); return [t.getAttribute('x'), t.getAttribute('y'), cs.translate, cs.transform, mt.e.toFixed(1), mt.f.toFixed(1)].join(','); }).join(' ');
      return { txt, escanos: [...svg.querySelectorAll('circle[data-grupo]')].map(c => { const b = c.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; return { g: c.getAttribute('data-grupo'), x, y, d: Math.hypot(x - cen.x, y - cen.y), op: parseFloat(getComputedStyle(c).opacity) }; }) };
    });
    for (const reducido of [false, true]) {
      const { ctx, page } = await nueva({ reducido });
      await ir(page, 'ayuntamiento.html');
      await page.locator('.pleno').scrollIntoViewIfNeeded();
      await espera(reducido ? 100 : 1400);   /* que acabe la entrada de los escaños */
      const reposo = await foto(page);
      for (const g of grupos) {
        const clave = slug(g.sigla);
        const boton = page.locator(`.pleno__leyenda li[data-grupo="${clave}"] .pleno__boton`);
        await boton.click(); await page.mouse.move(2, 2);
        const durs = await page.evaluate(() => [...document.querySelectorAll('svg.hemiciclo circle')].flatMap(c => c.getAnimations().map(a => a.effect.getTiming().duration)));
        await espera(400);
        const pulsado = await foto(page);
        const suyos = pulsado.escanos.map((e, i) => ({ e, r: reposo.escanos[i] })).filter(x => x.e.g === clave), otros = pulsado.escanos.map((e, i) => ({ e, r: reposo.escanos[i] })).filter(x => x.e.g !== clave);
        const movidos = suyos.filter(x => x.r.d - x.e.d > 2).length, quietosOtros = otros.every(x => Math.hypot(x.e.x - x.r.x, x.e.y - x.r.y) < 0.5);
        const apagados = otros.every(x => x.e.op < 0.5);
        if (reducido) {
          if (suyos.some(x => Math.hypot(x.e.x - x.r.x, x.e.y - x.r.y) > 0.5) || !apagados || durs.length) malos.push(`reducido, ${g.sigla}: se mueve o no se atenúa`);
        } else if (movidos !== suyos.length || !quietosOtros || !apagados || pulsado.txt !== reposo.txt || !durs.length || Math.max(...durs) > 300) {
          malos.push(`${g.sigla}: ${JSON.stringify({ movidos, de: suyos.length, quietosOtros, apagados, texto: pulsado.txt === reposo.txt, durs: [...new Set(durs)] })}`);
        }
        await boton.click(); await page.mouse.move(2, 2); await espera(400);
        const suelto = await foto(page);
        if (suelto.escanos.some((e, i) => Math.hypot(e.x - reposo.escanos[i].x, e.y - reposo.escanos[i].y) > 0.5 || e.op < 0.9)) malos.push(`${g.sigla}${reducido ? ' (reducido)' : ''}: no vuelve a su sitio al soltar`);
      }
      await ctx.close();
    }
    comprobar(!malos.length, `v3b M11: al pulsar cada uno de los ${grupos.length} grupos, sus escaños saltan hacia el centro del hemiciclo en ≤ 300 ms (los demás se quedan y se atenúan, el texto no se mueve) y vuelven al soltarlo; con movimiento reducido no se mueve nada y solo se atenúa` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }
}

/* ═════════════ v3b · tablón: plazos, «Nuevo», portada y buscador global ═════════════
   F4. Chip de plazo con cuenta atrás en vivo.js (Node con fechas fijas, la frontera de medianoche
       de Madrid incluida, y el navegador con el reloj de Playwright); «Plazos abiertos» sale o no
       según los datos, sin dejar hueco.
   V18. Punto «Nuevo» (48 h) con su texto para el lector de pantalla; franja de gravedad con su chip;
       lo de plazo cerrado baja al final.
   V14. «… en cifras»: cada cifra con su fuente; sin el campo, la banda no sale (copia).
   V17. El hero cabe con el lema grande; el pie de la foto casa con la foto elegida.
   F8. El buscador global: grupos con su título y los trámites primero, cuenta correcta, axe.
   M8. El campo del hero y el de Trámites comparten view-transition-name solo con movimiento. */
async function v3bTablon() {
  const V = cargarVivo();
  const enV = iso => V.ahoraEn('Europe/Madrid', new Date(iso));
  const rgbHexDe = s => '#' + (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
  const rutas = { tramites: 't.html', avisos: 'avisos.html', agenda: 'a.html', noticia: 'n-{id}.html', media: 'media/' };
  const base = { nombre_corto: 'P', horario: { texto: 'x', tramos: [] }, agenda: [], noticias: [], avisos: [], tablon: { entradas: [] }, rutas, tramites_sede: 1 };
  const aviso = o => ({ id: 'a', fecha: '2026-10-01', tema: 'Ayudas', titulo: 'Aviso', ...o });

  /* 1. F4 en Node: los casos límite con fechas fijas (hoy = miércoles 14 de octubre de 2026) */
  {
    const malos = [];
    const hoy = enV('2026-10-14T10:00:00+02:00');
    const casos = [
      [{ plazo_inicio: '2026-10-15', plazo_fin: '2026-10-30' }, 'abre', /^Abre mañana$/],
      [{ plazo_inicio: '2026-10-20' }, 'abre', /^Abre el martes 20 de octubre$/],
      [{ plazo_inicio: '2026-10-14', plazo_fin: '2026-10-14' }, 'ultimo', /^Último día$/],
      [{ plazo_fin: '2026-10-15' }, 'abierto', /^Queda 1 día$/],
      [{ plazo_fin: '2026-10-24' }, 'abierto', /^Quedan 10 días$/],
      [{ plazo_fin: '2026-10-13' }, 'cerrado', /^Plazo cerrado$/],
      [{ plazo_inicio: '2026-10-01' }, 'abierto', /^Plazo abierto$/],
      [{}, null, null]
    ];
    for (const [o, estado, texto] of casos) {
      const p = V.plazo(o, hoy);
      if ((p && p.estado) !== estado || (texto && !texto.test(p.texto))) malos.push(JSON.stringify(o) + ' → ' + JSON.stringify(p));
    }
    /* la frontera es la medianoche de Madrid, no la del ordenador ni la UTC */
    const fin = { plazo_fin: '2026-10-31' };
    if (V.plazo(fin, enV('2026-10-31T23:59:00+01:00')).estado !== 'ultimo') malos.push('a las 23:59 del último día (Madrid) ya no es «Último día»');
    if (V.plazo(fin, enV('2026-10-31T23:30:00Z')).estado !== 'cerrado') malos.push('a las 00:30 de Madrid del día siguiente (23:30 UTC) no está cerrado');
    /* el chip: la palabra, el reloj, la fecha para el lector de pantalla y su «Ejemplo» si lo es */
    const tab = V.pintar('tablon', { ...base, avisos: [aviso({ id: 'u', plazo_fin: '2026-10-14', plazo_ejemplo: true }), aviso({ id: 'c', fecha: '2026-10-10', plazo_fin: '2026-10-12' }), aviso({ id: 'n', fecha: '2026-10-02' })] }, hoy);
    if (!/class="plazo plazo--ultimo" data-plazo="ultimo" data-dato-ejemplo="plazo:u"><svg[^>]*><use href="#i-reloj"\/><\/svg><span class="plazo__texto">Último día<span class="sr">, hasta el miércoles 14 de octubre incluido<\/span><\/span><span class="ejemplo">Ejemplo<\/span>/.test(tab)) malos.push('el chip del último día');
    if (!/plazo--cerrado[\s\S]*Plazo cerrado<span class="sr">: terminó el lunes 12 de octubre/.test(tab)) malos.push('el chip de plazo cerrado');
    /* lo cerrado, al final (aunque sea más nuevo que «n») */
    const orden = [...tab.matchAll(/#aviso-(\w)"/g)].map(m => m[1]).join('');
    if (orden !== 'nuc') malos.push('orden del tablón ' + orden + ' (lo cerrado tiene que ir al final)');
    /* «Plazos abiertos»: solo lo abierto, lo que cierra antes primero; sin nada abierto, '' */
    const pz = V.pintar('plazos', { ...base, avisos: [aviso({ id: 'x', plazo_fin: '2026-10-30' }), aviso({ id: 'y', plazo_fin: '2026-10-16' }), aviso({ id: 'z', plazo_fin: '2026-10-01' }), aviso({ id: 'w', plazo_inicio: '2026-11-01' })] }, hoy);
    const enPz = [...pz.matchAll(/aviso-(\w)/g)].map(m => m[1]).join('');
    if (!/<h2 class="plazos__titulo" id="t-plazos">Plazos abiertos<\/h2>/.test(pz) || enPz !== 'yx') malos.push('«Plazos abiertos» da ' + enPz + ' (esperaba yx)');
    if (V.pintar('plazos', { ...base, avisos: [aviso({ plazo_fin: '2026-10-01' }), aviso({ id: 'b' })] }, hoy) !== '') malos.push('sin plazos abiertos, «Plazos abiertos» no está vacío');
    /* los del tablón oficial también, con su clave por expediente */
    const ofi = V.pintar('plazos', { ...base, tablon: { entradas: [{ fecha: '2026-10-01', tema: 'Ayudas', titulo: 'T', titulo_claro: 'Convocatoria', url: 'https://x/', expediente: '7/2026', plazo_fin: '2026-10-20', plazo_ejemplo: true }] } }, hoy);
    if (!/data-dato-ejemplo="plazo:tablon-7\/2026"[\s\S]*Quedan 6 días[\s\S]*Tablón oficial/.test(ofi)) malos.push('plazo de un anuncio del tablón');
    comprobar(!malos.length, 'v3b F4 · plazos en vivo.js (Node, fechas fijas): «Abre mañana», «Abre el …», «Último día», «Queda 1 día», «Quedan N días», «Plazo cerrado» y «Plazo abierto»; la frontera es la medianoche de Madrid; el chip lleva reloj, palabra, fecha para el lector y su «Ejemplo»; lo cerrado baja al final del tablón; «Plazos abiertos» solo con lo abierto, lo que cierra antes primero, y vacío si no hay' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 2. V18 en Node: «Nuevo» (hoy y ayer sí; hace 2 días no) y la franja de gravedad con su chip */
  {
    const malos = [];
    const hoy = enV('2026-10-14T10:00:00+02:00');
    const fila = (o, a = hoy) => V.pintar('tablon', { ...base, avisos: [aviso(o)] }, a);
    if (!/<span class="nuevo"><span class="nuevo__punto" aria-hidden="true"><\/span>Nuevo<span class="sr">, publicado en las últimas 48 horas<\/span><\/span>/.test(fila({ fecha: '2026-10-14' }))) malos.push('lo de hoy sin «Nuevo»');
    if (!/class="nuevo"/.test(fila({ fecha: '2026-10-13' }))) malos.push('lo de ayer sin «Nuevo»');
    if (/class="nuevo"/.test(fila({ fecha: '2026-10-12' }))) malos.push('lo de hace dos días con «Nuevo»');
    if (!/class="tablon__fila es-urgente"[\s\S]*chip chip--urgente">Urgente/.test(fila({ gravedad: 'urgente' }))) malos.push('urgente sin franja o sin su palabra');
    if (!/class="tablon__fila es-programado"[\s\S]*chip chip--programado">Programado/.test(fila({ gravedad: 'programado' }))) malos.push('programado sin franja o sin su palabra');
    if (/es-informativo|chip--informativo/.test(fila({}))) malos.push('el informativo lleva franja');
    comprobar(!malos.length, 'v3b V18 · tablón (Node): punto «Nuevo» con su texto para el lector de pantalla en lo de hoy y ayer (48 h) y no en lo de antes; urgente y programado con su franja y su palabra; el informativo, sin franja' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* reescribe los datos vivos de una página antes de que main.js los pinte */
  const datosDe = html => JSON.parse(html.match(/<script type="application\/json" id="datos-vivos">([\s\S]*?)<\/script>/)[1]);
  const conDatos = async (page, pag, cambiar) => {
    await page.route('**/' + pag, async r => {
      const resp = await r.fetch(); const cuerpo = await resp.text();
      const D = datosDe(cuerpo); cambiar(D);
      r.fulfill({ response: resp, body: cuerpo.replace(/(<script type="application\/json" id="datos-vivos">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(D).replace(/</g, '\\u003c') + b) });
    });
  };

  /* 3. F4 y V18 en el navegador con el reloj fijo: chips, «Plazos abiertos» que sale o no sin hueco,
     «Nuevo», la franja roja (≥ 3:1 con la hoja) y axe */
  {
    const malos = [];
    const propios = [
      { id: 'p-manana', fecha: '2026-10-10', tema: 'Ayudas', titulo: 'Abre mañana', plazo_inicio: '2026-10-15', plazo_fin: '2026-10-30', ejemplo: false, oculto: false },
      { id: 'p-ultimo', fecha: '2026-10-09', tema: 'Ayudas', titulo: 'Último día hoy', plazo_fin: '2026-10-14', ejemplo: false, oculto: false },
      { id: 'p-cerrado', fecha: '2026-10-13', tema: 'Ayudas', titulo: 'Plazo vencido', plazo_fin: '2026-10-13', ejemplo: false, oculto: false },
      { id: 'p-urgente', fecha: '2026-10-14', tema: 'Agua', titulo: 'Avería urgente', gravedad: 'urgente', ejemplo: false, oculto: false }
    ];
    for (const caso of ['con', 'sin']) {
      const { ctx, page } = await nueva({ viewport: { width: 1366, height: 900 } });
      await page.clock.setFixedTime(new Date('2026-10-14T10:00:00+02:00'));
      await conDatos(page, 'index.html', D => {
        D.avisos = caso === 'con' ? propios : propios.filter(a => a.id === 'p-cerrado' || a.id === 'p-manana');
        D.tablon = { actualizado: '2999-01-01', entradas: D.tablon.entradas.map(e => ({ ...e, plazo_inicio: null, plazo_fin: null, plazo_ejemplo: false })) };
      });
      await page.route('**/contenido/tablon.json*', r => r.abort());
      await ir(page, 'index.html');
      const r = await page.evaluate(() => {
        const sec = document.querySelector('.plazos-tira'), sig = sec && sec.nextElementSibling;
        const chip = id => { const f = document.querySelector('[data-vivo="tablon"] a[href$="#aviso-' + id + '"]'); const c = f && f.querySelector('.plazo'); return c ? c.getAttribute('data-plazo') + ':' + c.querySelector('.plazo__texto').firstChild.textContent : null; };
        const urg = document.querySelector('[data-vivo="tablon"] .tablon__fila.es-urgente');
        const filas = [...document.querySelectorAll('[data-vivo="tablon"] .tablon__fila')].map(f => (f.querySelector('a').getAttribute('href').match(/aviso-(.+)$/) || [, 'tablon'])[1]);
        return { visible: sec && !sec.hidden && sec.getBoundingClientRect().height > 0, alto: sec ? sec.getBoundingClientRect().height : -1,
          hueco: sec && sig ? Math.round(sig.getBoundingClientRect().top - sec.previousElementSibling.getBoundingClientRect().bottom) : null,
          items: [...document.querySelectorAll('.plazos__item')].map(i => i.querySelector('.plazo').getAttribute('data-plazo')),
          manana: chip('p-manana'), ultimo: chip('p-ultimo'), cerrado: chip('p-cerrado'), filas,
          nuevo: [...document.querySelectorAll('[data-vivo="tablon"] .nuevo')].map(n => n.closest('a').getAttribute('href')),
          nuevoSr: (document.querySelector('[data-vivo="tablon"] .nuevo .sr') || {}).textContent || '',
          franja: urg ? getComputedStyle(urg).boxShadow : null, urgPalabra: urg ? urg.querySelector('.chip--urgente') && urg.querySelector('.chip--urgente').textContent : null };
      });
      if (caso === 'con') {
        if (!r.visible || r.items.join() !== 'ultimo') malos.push('con plazos: «Plazos abiertos» ' + (r.visible ? 'da ' + r.items.join() : 'no sale'));
        if (r.manana !== 'abre:Abre mañana' || r.ultimo !== 'ultimo:Último día' || r.cerrado !== 'cerrado:Plazo cerrado') malos.push('chips: ' + [r.manana, r.ultimo, r.cerrado].join(' | '));
        if (r.filas[r.filas.length - 1] !== 'p-cerrado' && r.filas.indexOf('p-cerrado') >= 0) malos.push('lo cerrado no va al final: ' + r.filas.join(','));
        if (r.nuevo.sort().join() !== ['avisos.html#aviso-p-cerrado', 'avisos.html#aviso-p-urgente'].join() || !/48 horas/.test(r.nuevoSr)) malos.push('«Nuevo» en ' + r.nuevo.join(','));
        const rojo = r.franja && (r.franja.match(/rgb\([^)]+\)/) || [''])[0];
        if (!rojo || r.urgPalabra !== 'Urgente' || contraste(rgbHexDe(rojo), (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim()))) < 3) malos.push('franja urgente: ' + r.franja + ' / ' + r.urgPalabra);
        const viol = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id + ' ' + v.nodes[0].target.join(' '));
        if (viol.length) malos.push('axe con plazos y «Nuevo»: ' + viol.join(', '));
      } else if (r.visible || r.alto !== 0) malos.push('sin plazos abiertos, «Plazos abiertos» sale o deja ' + r.alto + ' px');
      await ctx.close();
    }
    /* en «Avisos», el chip del aviso propio se repinta con la fecha real */
    const { ctx, page } = await nueva();
    await page.clock.setFixedTime(new Date('2026-10-14T10:00:00+02:00'));
    await conDatos(page, 'avisos.html', D => { D.avisos = D.avisos.map((a, i) => i ? a : { ...a, plazo_fin: '2026-10-14', plazo_ejemplo: false }); });
    await ir(page, 'avisos.html');
    const enAvisos = await page.evaluate(() => [...document.querySelectorAll('[data-vivo="tablon"] .plazo, .avisos [data-vivo="plazo"] .plazo')].map(c => c.getAttribute('data-plazo')));
    await ctx.close();
    /* en el tablón completo siempre; en la lista de avisos propios, si el aviso traía plazo al generar */
    if (!enAvisos.includes('ultimo')) malos.push('«Avisos» sin el chip «Último día» (' + enAvisos.join(',') + ')');
    comprobar(!malos.length, 'v3b F4/V18 · en el navegador (reloj en el 14/10/2026): chips «Abre mañana», «Último día» y «Plazo cerrado»; «Plazos abiertos» sale con lo abierto y, sin nada abierto, no sale ni deja hueco; «Nuevo» en lo de hoy y ayer con su texto para el lector; la fila urgente con su franja roja (≥ 3:1) y su palabra; lo cerrado al final; axe 0' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 4. V14: cada cifra con su fuente visible; sin el campo, la banda no sale; sin fuente, aplicar.mjs se niega */
  {
    const malos = [];
    const esperadas = (M.cifras || []).length;
    const { ctx, page } = await nueva({ viewport: { width: 1366, height: 900 } });
    await ir(page, 'index.html');
    const r = await page.evaluate(() => [...document.querySelectorAll('.cifras .cifra')].map(c => ({ valor: c.querySelector('.cifra__valor').textContent, fuente: c.querySelector('.cifra__fuente') && c.querySelector('.cifra__fuente').checkVisibility() ? c.querySelector('.cifra__fuente').textContent : '',
      letra: getComputedStyle(c.querySelector('.cifra__valor')).fontFamily, titulo: (document.getElementById('t-cifras') || {}).textContent })));
    await ctx.close();
    if (r.length !== esperadas) malos.push(r.length + ' cifras de ' + esperadas);
    r.forEach(c => { if (!/^Fuente: \S/.test(c.fuente)) malos.push('«' + c.valor + '» sin fuente visible'); if (!c.letra.includes(marca.letra.titulares)) malos.push('«' + c.valor + '» no va en ' + marca.letra.titulares); });
    if (esperadas && r[0] && r[0].titulo !== M.nombre_corto + ' en cifras') malos.push('título «' + r[0].titulo + '»');
    const dest = copiar();
    try {
      const mj = path.join(dest, 'municipio.json'), m = JSON.parse(fs.readFileSync(mj, 'utf8'));
      delete m.cifras;
      fs.writeFileSync(mj, JSON.stringify(m, null, 2));
      let ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      if (ap.status !== 0) malos.push('sin cifras, aplicar.mjs falla → ' + (ap.stderr || ap.stdout).slice(-200));
      else if (/t-cifras|class="cifra/.test(fs.readFileSync(path.join(dest, 'index.html'), 'utf8'))) malos.push('sin el campo, la banda sale');
      m.cifras = [{ valor: 12, etiqueta: 'sin fuente' }];
      fs.writeFileSync(mj, JSON.stringify(m, null, 2));
      ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      if (ap.status === 0 || !/cifras\[0\]/.test(ap.stderr)) malos.push('una cifra sin fuente no para aplicar.mjs');
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
    comprobar(!malos.length, `v3b V14 · «${M.nombre_corto} en cifras»: ${r.length} cifras en ${marca.letra.titulares}, cada una con su fuente a la vista (${r.map(c => c.valor).join(', ') || 'ninguna'}); sin municipio.json → cifras la banda no sale y una cifra sin fuente para aplicar.mjs` + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 5. V17: el hero cabe con el lema grande y el pie de la foto casa con la foto elegida (cada semilla) */
  {
    const malos = [];
    const lista = ((M.fotos && M.fotos.hero_fotos) || []).length ? M.fotos.hero_fotos : (M.fotos && M.fotos.hero ? [M.fotos.hero] : []);
    const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const lugarDe = h => h.lugar === null ? null : ((M.pueblo && M.pueblo.lugares) || []).find(l => (h.lugar ? l.nombre === h.lugar : l.foto === h.archivo)) || null;
    for (const [w, h] of [[1280, 720], [1366, 768]]) for (let i = 0; i < lista.length; i++) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: h } });
      await ctx.addInitScript(s => { Math.random = () => s; }, (i + 0.5) / lista.length);
      await ir(page, 'index.html');
      const r = await page.evaluate(() => {
        const hero = document.querySelector('.hero').getBoundingClientRect(), pie = document.getElementById('pie-hero'), a = pie && pie.querySelector('a');
        const lema = document.querySelector('.hero__lema'), arco = document.getElementById('arco-hero').getBoundingClientRect();
        return { src: (document.querySelector('#arco-hero img') || {}).getAttribute ? document.querySelector('#arco-hero img').getAttribute('src') : null, abajo: hero.bottom, pie: pie && pie.checkVisibility() ? pie.textContent : '', href: a ? a.getAttribute('href') : null,
          dentro: pie && pie.checkVisibility() ? (() => { const p = pie.getBoundingClientRect(); return p.left >= arco.left - 1 && p.right <= arco.right + 1 && p.bottom <= arco.bottom + 1; })() : true,
          lema: lema ? parseFloat(getComputedStyle(lema).fontSize) / parseFloat(getComputedStyle(document.body).fontSize) : null };
      });
      await ctx.close();
      const f = lista[i], l = lugarDe(f), esperado = l ? l.nombre : (f.pie || '');
      if (r.src !== 'media/' + f.archivo + '.jpg') malos.push(`${w}×${h} foto ${i}: sale ${r.src}`);
      if (r.abajo > h + 0.5) malos.push(`${w}×${h} foto ${i}: el hero acaba a ${Math.round(r.abajo)} px`);
      if (r.pie.replace(/^Foto: /, '') !== esperado) malos.push(`${w}×${h} foto ${f.archivo}: pie «${r.pie}» (esperaba «${esperado}»)`);
      if (l && r.href !== 'pueblo.html#lugar-' + slug(l.nombre)) malos.push(`foto ${f.archivo}: el pie enlaza a ${r.href}`);
      if (!r.dentro) malos.push(`foto ${f.archivo}: el pie se sale del arco`);
      if (M.lema && !(r.lema >= 1.3)) malos.push('el lema sigue pequeño (×' + r.lema + ' del texto)');
    }
    comprobar(lista.length > 0 && !malos.length, `v3b V17 · hero: con el lema grande (letra de titulares) cabe en 1280×720 y 1366×768 con cada una de las ${lista.length} fotos, y el pie del arco dice el lugar de la foto elegida, enlazado a su sitio en «El pueblo» (o nada si la foto no es un lugar)` + (malos.length ? ' → ' + malos.slice(0, 5).join(' | ') : ''));
  }

  /* 6. F8: el buscador global agrupa por tipo con su título, trámites primero, cuenta para el lector
     de pantalla que casa con lo que se ve, la portada con 5 como mucho y «Ver los N», y axe */
  {
    const malos = [];
    const sinT = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const larga = s => sinT(s).split(/[^a-z0-9ñ]+/).filter(p => p.length > 4).sort((a, b) => b.length - a.length)[0];
    const lugar = ((M.pueblo && M.pueblo.lugares) || [])[0];
    const tel = [...(M.urgencias || []), ...(M.servicios || [])].find(s => s.telefono && larga(s.nombre));
    const noticia = contenido('noticias').noticias.find(n => !n.oculto && larga(n.titulo));
    const casos = [lugar && [larga(lugar.nombre), 'El pueblo'], tel && [larga(tel.nombre), 'Teléfonos'], noticia && [larga(noticia.titulo), 'Noticias'], ['padron', 'Trámites']].filter(Boolean);
    const ORDEN = ['Trámites', 'Avisos y anuncios', 'Noticias', 'Teléfonos', 'El pueblo'];
    const { ctx, page } = await nueva();
    await ir(page, 'index.html');
    for (const [q, grupo] of casos) {
      await page.click('[data-abrir-buscador]');
      await page.fill('#buscador [data-buscador-campo]', q);
      await page.waitForFunction(() => document.querySelector('#buscador [data-buscador-cuenta]').textContent.length > 0, null, { timeout: 3000 }).catch(() => {});
      await espera(250);
      const r = await page.evaluate(() => {
        const caja = document.querySelector('#buscador [data-buscador-resultados]');
        return { titulos: [...caja.querySelectorAll('.resultados__titulo')].map(t => ({ t: t.textContent, tag: t.tagName, id: t.id, lista: t.nextElementSibling && t.nextElementSibling.getAttribute('aria-labelledby') })),
          n: caja.querySelectorAll('a').length, cuenta: document.querySelector('#buscador [data-buscador-cuenta]').textContent, rol: document.querySelector('#buscador [data-buscador-cuenta]').getAttribute('role') };
      });
      const ts = r.titulos.map(t => t.t);
      if (!ts.includes(grupo)) malos.push(`«${q}»: sin el grupo «${grupo}» (${ts.join(', ')})`);
      if (ts.join() !== ORDEN.filter(o => ts.includes(o)).join()) malos.push(`«${q}»: grupos en otro orden (${ts.join(', ')})`);
      if (r.titulos.some(t => t.tag !== 'H3' || t.lista !== t.id)) malos.push(`«${q}»: títulos de grupo sin h3 o sin nombrar su lista`);
      if (r.rol !== 'status' || !r.cuenta.startsWith(r.n + (r.n === 1 ? ' resultado' : ' resultados'))) malos.push(`«${q}»: cuenta «${r.cuenta}» con ${r.n} enlaces`);
      if (q === casos[0][0]) {
        const viol = (await new AxeBuilder({ page }).include('#buscador').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(v => v.id);
        if (viol.length) malos.push('axe en el buscador con grupos: ' + viol.join(', '));
      }
      await page.keyboard.press('Escape');
    }
    /* la portada: 5 como mucho entre todos los grupos y «Ver los N resultados» a Trámites con lo escrito */
    await page.fill('.hero__buscador [data-buscador-campo]', 'solicitud');
    await page.waitForFunction(() => document.querySelector('.hero__buscador [data-buscador-cuenta]').textContent.length > 0, null, { timeout: 3000 }).catch(() => {});
    await espera(250);
    const h = await page.evaluate(() => { const c = document.querySelector('.hero__buscador [data-buscador-resultados]'); const t = c.querySelector('.resultados__todos a');
      return { n: c.querySelectorAll('.resultados__lista a').length, titulo: (c.querySelector('.resultados__titulo') || {}).tagName, todos: t ? t.getAttribute('href') : null }; });
    if (h.n > 5 || h.titulo !== 'H2' || !/^tramites\.html\?q=solicitud#buscar$/.test(h.todos || '')) malos.push('portada: ' + JSON.stringify(h));
    await ctx.close();
    comprobar(casos.length >= 3 && !malos.length, `v3b F8 · buscador global: ${casos.map(c => '«' + c[0] + '» → ' + c[1]).join(', ')}; grupos con su título (h3 en el diálogo, h2 en la portada) que nombra su lista, los trámites primero, la cuenta en role=status casa con los enlaces que se ven, la portada enseña 5 como mucho con «Ver los N resultados» y axe pasa` + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* 7. M8: el campo viaja entre la portada y Trámites (mismo view-transition-name) solo con movimiento;
     con movimiento reducido, nada. Y llega relleno y filtrado */
  {
    const malos = [];
    for (const reducido of [true, false]) {
      const { ctx, page } = await nueva({ reducido: reducido ? undefined : false });
      const nombres = {};
      await ir(page, 'index.html');
      nombres.hero = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__buscador [data-buscador-campo]')).viewTransitionName);
      nombres.dialogo = await page.evaluate(() => getComputedStyle(document.querySelector('#buscador [data-buscador-campo]')).viewTransitionName);
      await page.fill('.hero__buscador [data-buscador-campo]', 'padron');
      await page.click('.hero__buscador [type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => document.querySelectorAll('[data-buscador-pagina] [data-buscador-resultados] a').length > 0, null, { timeout: 3000 }).catch(() => {});
      const t = await page.evaluate(() => ({ nombre: getComputedStyle(document.querySelector('.buscador-pagina [data-buscador-campo]')).viewTransitionName, valor: document.querySelector('.buscador-pagina [data-buscador-campo]').value,
        n: document.querySelectorAll('.buscador-pagina [data-buscador-resultados] a').length, anims: document.getAnimations().length }));
      await ctx.close();
      const esperado = reducido ? 'none' : 'campo-buscar';
      if (nombres.hero !== esperado || t.nombre !== esperado) malos.push((reducido ? 'reducido' : 'con movimiento') + `: hero «${nombres.hero}», trámites «${t.nombre}»`);
      if (nombres.dialogo !== 'none') malos.push('el campo del diálogo también tiene nombre (se repetiría)');
      if (t.valor !== 'padron' || !t.n) malos.push(`Trámites llega con «${t.valor}» y ${t.n} resultados`);
      if (reducido && t.anims) malos.push('reducido: ' + t.anims + ' animaciones al llegar');
    }
    comprobar(!malos.length, 'v3b M8 · del hero a Trámites: el campo de la portada y el de Trámites comparten view-transition-name «campo-buscar» solo con movimiento (con movimiento reducido, ninguno y nada animado); Trámites llega con lo escrito y filtrado' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }
}

/* ═════════════ v3b · servicio: lo que vende la maqueta y el mantenimiento ═════════════
   «La propuesta» (para el alcalde: noindex, fuera del menú y del pie, comparador con teclado, el
   precio solo con ?revision), suscribirse sin redes (feed.xml y agenda.ics), el listín sin
   cobertura (sw.js), los datos estructurados (JSON-LD) y el comprobador de la hoja de cálculo */
async function v3bServicio() {
  const malos = [];
  /* 1. «La propuesta» */
  if (M.propuesta !== false) {
    const html = leer(RAIZ, 'propuesta.html');
    if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) malos.push('propuesta.html sin noindex');
    const enlazan = PAGINAS.filter(p => p !== 'propuesta.html' && /href="(\.\/)?propuesta\.html/.test(leer(RAIZ, p)));
    if (enlazan.length) malos.push('enlazan a propuesta.html: ' + enlazan.join(', '));
    if (/class="menu__lista"[\s\S]*?propuesta\.html[\s\S]*?<\/ul>/.test(html) || /<footer[\s\S]*propuesta\.html[\s\S]*<\/footer>/.test(html)) malos.push('propuesta.html sale en su propio menú o pie');
    if (!/PENDIENTE: captura de la web actual|<img src="[^"]+" [^>]*alt="[^"]+"[^>]*>\s*<\/div>\s*<div class="comparador__lado comparador__despues/.test(html)) malos.push('el «antes» no es ni una captura ni el hueco PENDIENTE');
    if (!fs.existsSync(path.join(RAIZ, 'assets/propuesta-portada.jpg')) || !html.includes('assets/propuesta-portada.jpg?v=')) malos.push('falta la captura de la portada nueva (assets/propuesta-portada.jpg)');
    const { ctx, page, errores } = await nueva();
    await ir(page, 'propuesta.html');
    /* el comparador con el teclado: flechas, Inicio y Fin mueven la línea y el recorte */
    await page.focus('#comparador-rango');
    const leerC = () => page.evaluate(() => {
      const r = document.querySelector('#comparador-rango'), d = document.querySelector('.comparador__despues');
      return { v: r.value, txt: r.getAttribute('aria-valuetext'), corte: document.querySelector('.comparador__marco').style.getPropertyValue('--corte'), clip: getComputedStyle(d).clipPath,
        foco: document.activeElement === r && getComputedStyle(r).outlineStyle !== 'none', visible: !r.closest('[hidden]') && r.getBoundingClientRect().height >= 44 };
    });
    const c0 = await leerC();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    const c1 = await leerC();
    await page.keyboard.press('End'); const c2 = await leerC();
    await page.keyboard.press('Home'); const c3 = await leerC();
    if (!(c0.v === '50' && c0.visible && c0.foco)) malos.push('comparador al llegar: ' + JSON.stringify(c0));
    if (!(c1.v === '55' && c1.corte === '55%' && /55%/.test(c1.clip) && c1.txt !== c0.txt)) malos.push('flechas: ' + JSON.stringify(c1));
    if (!(c2.v === '100' && c2.txt === 'Solo la web actual' && c3.v === '0' && c3.txt === 'Solo la propuesta')) malos.push('Inicio/Fin: ' + JSON.stringify([c2, c3]));
    /* el precio, solo con ?revision */
    const precio = async () => page.evaluate(() => { const b = document.querySelector('[data-solo-revision]'); return b ? { vis: b.checkVisibility(), txt: b.textContent } : null; });
    const p0 = await precio();
    await ir(page, 'propuesta.html', '?revision');
    const p1 = await precio();
    if (!p0 || p0.vis || !p1 || !p1.vis || !/\[PRECIO: lo pone Álvaro\]/.test(p1.txt)) malos.push('precio: sin ?revision ' + JSON.stringify(p0) + ', con ?revision ' + JSON.stringify(p1));
    if (/\d+\s*(€|euros)/i.test(html.replace(/<!-- \[MANDO DE MAQUETA\] inicio -->[\s\S]*?<!-- \[MANDO DE MAQUETA\] fin -->/, ''))) malos.push('propuesta.html enseña una cifra de precio');
    /* axe, con y sin ?revision, en las dos páginas nuevas */
    for (const [pg, extra] of [['propuesta.html', ''], ['propuesta.html', '?revision'], ['suscribirse.html', '']]) {
      await ir(page, pg, extra);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      r.violations.forEach(v => malos.push(`axe ${pg}${extra}: ${v.id} ${v.nodes[0].target.join(' ')}`));
    }
    if (errores.length) malos.push('consola: ' + [...new Set(errores)].slice(0, 3).join(' | '));
    await ctx.close();
    /* sin JavaScript: las dos capturas una debajo de otra y sin control */
    const sj = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const ps = await sj.newPage();
    await ps.goto(BASE + 'propuesta.html', { waitUntil: 'networkidle' });
    const s = await ps.evaluate(() => { const a = document.querySelector('.comparador__antes').getBoundingClientRect(), d = document.querySelector('.comparador__despues').getBoundingClientRect(); return { control: document.querySelector('#comparador-rango').checkVisibility(), apiladas: d.top >= a.bottom - 1 }; });
    await sj.close();
    if (s.control || !s.apiladas) malos.push('sin JS: ' + JSON.stringify(s));
  }
  comprobar(!malos.length, '«La propuesta»: noindex, sin enlaces desde menú, pie ni otras páginas, comparador antes/después con input range (flechas, Inicio y Fin; aria-valuetext; 44 px; foco visible), apilado sin JavaScript, el precio solo con ?revision y 0 violaciones de axe' + (malos.length ? ' → ' + malos.slice(0, 5).join(' | ') : ''));

  /* 2. feed.xml y agenda.ics, con su <link rel="alternate"> en todas las páginas */
  const malF = [];
  const sinAlt = PAGINAS.filter(p => { const h = leer(RAIZ, p).split('</head>')[0]; return !/<link rel="alternate" type="application\/atom\+xml"[^>]+href="feed\.xml">/.test(h) || !/<link rel="alternate" type="text\/calendar"[^>]+href="agenda\.ics">/.test(h); });
  if (sinAlt.length) malF.push('sin <link rel="alternate">: ' + sinAlt.join(', '));
  const feed = leer(RAIZ, 'feed.xml');
  const avisosJ = contenido('avisos').avisos.filter(a => !a.oculto), noticiasJ = contenido('noticias').noticias.filter(n => !n.oculto);
  {
    const { ctx, page } = await nueva();
    await ir(page, 'index.html');
    const f = await page.evaluate(txt => {
      const d = new DOMParser().parseFromString(txt, 'application/xml'), NS = 'http://www.w3.org/2005/Atom';
      if (d.getElementsByTagName('parsererror').length) return { error: d.getElementsByTagName('parsererror')[0].textContent.slice(0, 120) };
      const raiz = d.documentElement, hijo = (el, n) => [...el.children].find(x => x.localName === n && x.namespaceURI === NS);
      const iso = s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(s || '');
      const entradas = [...raiz.children].filter(x => x.localName === 'entry');
      return { raiz: raiz.localName, ns: raiz.namespaceURI, cab: ['id', 'title', 'updated', 'author'].every(n => hijo(raiz, n)) && iso(hijo(raiz, 'updated').textContent),
        n: entradas.length, bien: entradas.filter(e => hijo(e, 'id') && hijo(e, 'title') && iso((hijo(e, 'updated') || {}).textContent) && hijo(e, 'link')).length,
        ids: new Set(entradas.map(e => hijo(e, 'id').textContent)).size, ejemplo: entradas.filter(e => /^EJEMPLO: /.test(hijo(e, 'title').textContent)).length };
    }, feed);
    await ctx.close();
    const esperadas = Math.min(40, avisosJ.length + noticiasJ.length), ejemplos = [...avisosJ, ...noticiasJ].filter(x => x.ejemplo).length;
    if (f.error || f.raiz !== 'feed' || f.ns !== 'http://www.w3.org/2005/Atom' || !f.cab || f.n !== esperadas || f.bien !== f.n || f.ids !== f.n || f.ejemplo !== ejemplos)
      malF.push('feed.xml: ' + JSON.stringify(f) + ` (esperadas ${esperadas}, de ejemplo ${ejemplos})`);
  }
  const ics = fs.readFileSync(path.join(RAIZ, 'agenda.ics'), 'utf8');
  const t = icsValido(ics);
  const eventos = t.desplegado.filter(l => l === 'BEGIN:VEVENT').length, uids = t.desplegado.filter(l => /^UID:/.test(l));
  const enVevent = [];
  let dentro = null;
  for (const l of t.desplegado) { if (l === 'BEGIN:VEVENT') dentro = []; else if (l === 'END:VEVENT') { enVevent.push(dentro); dentro = null; } else if (dentro) dentro.push(l); }
  const incompletos = enVevent.filter(ev => !['UID:', 'DTSTAMP:', 'DTSTART', 'SUMMARY:'].every(k => ev.some(l => l.startsWith(k))));
  const esperados = new Set((await (async () => { const h = leer(RAIZ, 'agenda.html'); return [...h.matchAll(/href="ics\/([^"]+\.ics)"/g)].map(m => m[1]); })()));
  const sueltos = fs.readdirSync(path.join(RAIZ, 'ics')).filter(f => f.endsWith('.ics')).length;
  if (!t.ok || eventos !== sueltos || new Set(uids).size !== uids.length || incompletos.length || t.desplegado.filter(l => l === 'BEGIN:VTIMEZONE').length !== 1 || !t.desplegado.some(l => /^X-WR-CALNAME:/.test(l)))
    malF.push(`agenda.ics: ${t.mal.join(', ')} · ${eventos} VEVENT (ics/ tiene ${sueltos}), ${uids.length} UID, ${incompletos.length} incompletos`);
  if (esperados.size === 0) malF.push('agenda.html no enlaza ningún .ics');
  /* el mismo UID que el .ics suelto de cada evento: el calendario no duplica el acto */
  const uidSuelto = fs.readdirSync(path.join(RAIZ, 'ics')).filter(f => f.endsWith('.ics')).map(f => icsValido(fs.readFileSync(path.join(RAIZ, 'ics', f), 'utf8')).uid);
  if (uidSuelto.some(u => !uids.includes(u))) malF.push('agenda.ics no lleva los UID de ics/');
  const sus = leer(RAIZ, 'suscribirse.html');
  if (M.url && !sus.includes('href="' + M.url.replace(/^https?:\/\//, 'webcal://').replace(/\/?$/, '/') + 'agenda.ics"')) malF.push('suscribirse.html sin el enlace webcal://');
  comprobar(!malF.length, `suscribirse sin redes: feed.xml es Atom bien formado (parseo XML; ${Math.min(40, avisosJ.length + noticiasJ.length)} entradas con id, título, fecha ISO y enlace; lo de ejemplo, con «EJEMPLO:»), agenda.ics válido (RFC 5545: CRLF, ≤ 75 octetos, un VTIMEZONE, un VEVENT por acto con el UID de su .ics suelto), <link rel="alternate"> en las ${PAGINAS.length} páginas y webcal:// en «Avisos y agenda en su móvil»` + (malF.length ? ' → ' + malF.join(' | ') : ''));

  /* 3. sw.js: el listín sin cobertura */
  const malS = [];
  const sw = leer(RAIZ, 'sw.js');
  const rutas = JSON.parse((sw.match(/var RUTAS = (\[[^\n]*\]);/) || [, '[]'])[1]);
  const huellaDe = rel => createHash('md5').update(fs.readFileSync(path.join(RAIZ, rel))).digest('hex').slice(0, 8);
  if (!rutas.includes('telefonos.html') || !rutas.some(u => /^css\/base\.css\?v=/.test(u)) || !rutas.some(u => /^fonts\/.+\.woff2$/.test(u)) || !rutas.some(u => /^marca\/escudo/.test(u))) malS.push('RUTAS incompletas: ' + rutas.join(', '));
  for (const u of rutas) {
    const [rel, q] = u.split('?');
    if (!fs.existsSync(path.join(RAIZ, rel))) malS.push('no existe ' + rel);
    else if (q && q !== 'v=' + huellaDe(rel)) malS.push(u + ' no es la huella actual');
  }
  if (!/register\('sw\.js'\)/.test(leer(RAIZ, 'index.html'))) malS.push('la portada no registra sw.js');
  {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'allow' });
    await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, SLUG);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text() + ' ' + ((m.location() || {}).url || '')); });
    page.on('requestfailed', r => errores.push('caída ' + r.url()));
    /* la primera visita, a la portada: el listín se precarga sin haberlo abierto */
    await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
    const listo = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
    await page.evaluate(() => new Promise(r => { const sw = navigator.serviceWorker.controller; if (sw) return r(); const t = setTimeout(r, 3000); navigator.serviceWorker.ready.then(reg => { const a = reg.active; if (a.state === 'activated') { clearTimeout(t); r(); } else a.addEventListener('statechange', () => { if (a.state === 'activated') { clearTimeout(t); r(); } }); }); }));
    /* online, el resto de páginas, igual que siempre (con el service worker activo) */
    for (const p of ['avisos.html', 'agenda.html', 'tramites.html']) await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await ctx.setOffline(true);
    let off = null;
    try {
      await page.goto(BASE + 'telefonos.html', { waitUntil: 'load', timeout: 8000 });
      off = await page.evaluate(() => {
        const urg = document.querySelector('.listin__fila--urgente .listin__numero');
        return { urg: urg ? urg.textContent.replace(/\s+/g, ' ').trim() : null, vis: urg ? urg.checkVisibility() : false, css: getComputedStyle(document.querySelector('.listin')).listStyleType === 'none',
          letra: document.fonts.check('16px ' + getComputedStyle(document.body).fontFamily.split(',')[0]) };
      });
    } catch (e) { off = { error: e.message.split('\n')[0] }; }
    await ctx.setOffline(false);
    await ctx.close();
    if (!listo) malS.push('el service worker no se activa');
    if (!off || off.error || !/112/.test(off.urg || '') || !off.vis || !off.css) malS.push('sin red, telefonos.html: ' + JSON.stringify(off));
    /* sin red, la recarga del tablón (contenido/tablon.json) falla y se queda el de la página: es lo previsto */
    const errSw = errores.filter(e => !/contenido\/tablon\.json/.test(e));
    if (errSw.length) malS.push('consola: ' + [...new Set(errSw)].slice(0, 3).join(' | '));
    /* sin service worker (bloqueado), el listín carga igual */
    const sb = await navegador.newContext({ serviceWorkers: 'block' });
    const pb = await sb.newPage();
    await pb.goto(BASE + 'telefonos.html', { waitUntil: 'networkidle' });
    if (!(await pb.evaluate(() => /112/.test(document.body.textContent)))) malS.push('sin service worker, telefonos.html no carga');
    await sb.close();
  }
  comprobar(!malS.length, `sw.js: precarga telefonos.html y sus ${rutas.length - 1} recursos (CSS, JS, letras y escudo con la huella de este build); registrado desde la portada, sin red el listín carga con estilos y el 112 a la vista, online el resto de páginas va igual, y sin service worker todo sigue` + (malS.length ? ' → ' + malS.join(' | ') : ''));

  /* 4. JSON-LD: JSON estricto, tipos de schema.org y fechas ISO */
  const malJ = [];
  const ISOD = /^\d{4}-\d{2}-\d{2}$/, ISODT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
  const TIPOS = new Set(['GovernmentOrganization', 'Event', 'NewsArticle', 'BreadcrumbList']);
  /* lo de ejemplo, por fecha y título (un pleno real y uno de ejemplo pueden llamarse igual) */
  const ejemplos = new Set([...contenido('agenda').eventos.filter(e => e.ejemplo).map(e => e.fecha + '|' + e.titulo), ...(M.plenos || []).filter(p => p.ejemplo).map(p => p.fecha + '|' + (p.titulo || 'Pleno' + (p.tipo ? ' ' + p.tipo.toLowerCase() : '')))]);
  const noticiaReal = noticiasJ.find(n => !n.ejemplo);
  const vistos = {};
  for (const p of PAGINAS) {
    const bloques = [...leer(RAIZ, p).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
    if (bloques.length > 1) malJ.push(p + ': más de un bloque');
    for (const b of bloques) {
      let j;
      try { j = JSON.parse(b); } catch (e) { malJ.push(p + ': JSON roto (' + e.message + ')'); continue; }
      if (j['@context'] !== 'https://schema.org' || !Array.isArray(j['@graph'])) { malJ.push(p + ': sin @context o @graph'); continue; }
      for (const n of j['@graph']) {
        if (!TIPOS.has(n['@type'])) malJ.push(p + ': tipo ' + n['@type']);
        (vistos[p] = vistos[p] || new Set()).add(n['@type']);
        if (n['@type'] === 'GovernmentOrganization' && (!n.name || !n.address || n.address['@type'] !== 'PostalAddress' || !/^\+\d{9,12}$/.test(n.telephone || '') || (M.horario.ejemplo && n.location))) malJ.push(p + ': organización ' + JSON.stringify(n).slice(0, 120));
        if (n['@type'] === 'Event') {
          if (!n.name || !(ISOD.test(n.startDate) || ISODT.test(n.startDate)) || (n.endDate && !ISODT.test(n.endDate)) || !n.location) malJ.push(p + ': evento ' + JSON.stringify(n).slice(0, 120));
          if (ejemplos.has(String(n.startDate).slice(0, 10) + '|' + n.name)) malJ.push(p + ': un evento de ejemplo como dato estructurado («' + n.name + '»)');
        }
        if (n['@type'] === 'NewsArticle' && (!n.headline || !ISOD.test(n.datePublished))) malJ.push(p + ': noticia ' + JSON.stringify(n).slice(0, 120));
        if (n['@type'] === 'BreadcrumbList' && (!n.itemListElement.length || n.itemListElement.some((it, i) => it.position !== i + 1 || !it.name || !it.item))) malJ.push(p + ': migas');
      }
    }
  }
  const tiene = (p, tp) => vistos[p] && vistos[p].has(tp);
  if (!tiene('index.html', 'GovernmentOrganization')) malJ.push('la portada sin GovernmentOrganization');
  if (!tiene('agenda.html', 'Event')) malJ.push('agenda.html sin Event');
  if (noticiaReal && !tiene('noticia-' + noticiaReal.id + '.html', 'NewsArticle')) malJ.push('noticia-' + noticiaReal.id + '.html sin NewsArticle');
  const sinMigas = INTERIORES.filter(p => p !== '404.html' && !tiene(p, 'BreadcrumbList'));
  if (sinMigas.length) malJ.push('sin BreadcrumbList: ' + sinMigas.join(', '));
  comprobar(!malJ.length, `JSON-LD: JSON estricto con @context de schema.org; GovernmentOrganization en la portada (dirección, teléfono E.164 y, mientras el horario sea de ejemplo, sin horario), un Event por acto real de la agenda (fechas ISO), NewsArticle en las noticias y BreadcrumbList en las ${INTERIORES.length - 1} interiores; nada de lo marcado «ejemplo»` + (malJ.length ? ' → ' + malJ.slice(0, 5).join(' | ') : ''));

  /* 5. el comprobador de la hoja: acepta las plantillas y rechaza una rota diciendo qué fila */
  const malH = [];
  for (const f of ['plantillas-hoja/avisos.csv', 'plantillas-hoja/agenda.csv']) {
    const r = spawnSync('node', [path.join(RAIZ, 'scripts/comprobar-hoja.mjs'), path.join(RAIZ, f)], { encoding: 'utf8' });
    if (r.status !== 0) malH.push(f + ' rechazada: ' + r.stdout.slice(-200));
  }
  const roto = spawnSync('node', [path.join(RAIZ, 'scripts/comprobar-hoja.mjs'), path.join(RAIZ, 'pruebas/hoja/avisos-roto.csv')], { encoding: 'utf8' });
  for (const esperado of [/Fila 2 .*31\/09\/2026/, /Fila 3: falta el título/, /Fila 4 .*gravedad/, /Fila 5 .*caduca/, /Fila 7 .*fila 6/]) if (!esperado.test(roto.stdout)) malH.push('no dice ' + esperado);
  if (roto.status !== 1) malH.push('la hoja rota sale con ' + roto.status);
  comprobar(!malH.length, 'comprobar-hoja.mjs: acepta las plantillas de avisos y agenda y rechaza una exportación rota diciendo la fila y el porqué (fecha imposible, sin título, gravedad mal escrita, caduca antes de empezar, fila repetida)' + (malH.length ? ' → ' + malH.join(' | ') : ''));
}

/* ═════════════ v3b · pueblo: fotos igualadas, mapa del término, «El pueblo» en otros idiomas y el plano que se dibuja ═════════════
   - V15. Las fotos de media/ salen de media/originales/ con scripts/fotos-igualar.py: existen las dos medidas, mantienen
     el tamaño del original (1600 px como mucho), tienen crédito y «alt», y el igualado es idempotente (repetirlo da los
     mismos bytes que lo que hay en media/).
   - V16. Sin marca/termino.*, la sección del mapa no sale. En una copia con la muestra SINTÉTICA de
     pruebas/termino/: atribución de OSM, cada punto y cada fila de la leyenda enlazan a una ficha que existe, ni una
     petición fuera, sin desborde a 320 px y 0 violaciones de axe (también en inglés).
   - F12. Con contenido/pueblo.<lang>.json, pueblo-<lang>.html con su lang, hreflang recíprocos (y x-default), el selector
     solo en «El pueblo», lo común marcado lang="es", 0 violaciones de axe y sin desborde a 320 px. Sin traducción (o
     con una incompleta), esa página no se genera.
   - M9. El plano del pie se dibuja al asomar, del Ayuntamiento hacia fuera, en 600 ms como mucho, y acaba entero; con
     movimiento reducido, quieto y entero. */
async function v3bPueblo() {
  const axeDe = async (page, nombre, viol) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.forEach(v => viol.push(nombre + ': ' + v.id + ' ' + v.nodes[0].target.join(' ')));
  const medidas = rel => { const b = fs.readFileSync(path.join(RAIZ, rel)); for (let i = 2; i < b.length;) { const m = b[i + 1], l = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + l; } return null; };

  /* 1. V15. fotos igualadas */
  {
    const malos = [];
    const orig = fs.existsSync(path.join(RAIZ, 'media/originales')) ? fs.readdirSync(path.join(RAIZ, 'media/originales')).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)) : [];
    const creditos = JSON.parse(leer(RAIZ, 'media', 'creditos.json'));
    for (const n of orig) {
      const [w, h] = medidas('media/originales/' + n + '.jpg'), esc = Math.min(1, 1600 / Math.max(w, h)), esc8 = Math.min(1, 800 / Math.max(w, h));
      for (const [rel, e] of [['media/' + n + '.jpg', esc], ['media/' + n + '-800.jpg', esc8]]) {
        if (!fs.existsSync(path.join(RAIZ, rel))) { malos.push('falta ' + rel); continue; }
        const [a, b] = medidas(rel);
        if (Math.abs(a - Math.round(w * e)) > 1 || Math.abs(b - Math.round(h * e)) > 1) malos.push(`${rel}: ${a}×${b} (el original es ${w}×${h})`);
      }
      if (!creditos[n] || !creditos[n].autor) malos.push(n + ': sin crédito');
    }
    /* el «alt» de las fotos de lugares, en castellano y en las traducciones */
    for (const p of PAGINAS.filter(f => /^pueblo(-[a-z]{2})?\.html$/.test(f)))
      for (const [, src, alt] of leer(RAIZ, p).matchAll(/<img src="media\/([\w-]+)-800\.jpg"[^>]*\balt="([^"]*)"/g)) if (!alt.trim()) malos.push(p + ': ' + src + ' sin alt');
    /* idempotente: otra pasada en una carpeta aparte da los mismos bytes */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'igualar-'));
    const r = spawnSync('python', [path.join(RAIZ, 'scripts/fotos-igualar.py'), '--salida', tmp], { encoding: 'utf8' });
    if (r.status !== 0) malos.push('fotos-igualar.py falla → ' + (r.stderr || r.stdout).slice(-200));
    else for (const f of fs.readdirSync(tmp)) if (!fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(RAIZ, 'media', f)))) malos.push('media/' + f + ' no es lo que da el igualado (vuelve a ejecutar scripts/fotos-igualar.py)');
    fs.rmSync(tmp, { recursive: true, force: true });
    comprobar(orig.length >= 3 && !malos.length, `v3b V15: ${orig.length} fotos igualadas desde media/originales/, en sus dos medidas con el tamaño del original, con crédito y alt; repetir el igualado da los mismos bytes` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* 2. V16 y F12 en una copia: el mapa con la muestra sintética y las traducciones */
  const conTermino = fs.existsSync(path.join(RAIZ, 'marca/termino.svg'));
  if (!conTermino) comprobar(!/id="t-termino"/.test(leer(RAIZ, 'pueblo.html')), 'v3b V16: sin marca/termino.svg (Overpass no se ha ejecutado aquí), «El pueblo» no lleva la sección del mapa');
  const trads = fs.readdirSync(path.join(RAIZ, 'contenido')).map(f => (/^pueblo\.([a-z]{2})\.json$/.exec(f) || [])[1]).filter(Boolean);
  {
    const dest = copiar();
    let srv = null;
    try {
      for (const f of ['marca/termino.svg', 'marca/termino.json']) fs.rmSync(path.join(dest, f), { force: true });
      const tm = spawnSync('node', [path.join(dest, 'scripts/termino.mjs'), '--desde', path.join(dest, 'pruebas/termino/muestra-overpass.json')], { encoding: 'utf8', cwd: dest });
      const ap = tm.status === 0 ? spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest }) : tm;
      if (ap.status !== 0) { comprobar(false, 'v3b V16: termino.mjs o aplicar.mjs fallan con la muestra → ' + (ap.stderr || ap.stdout).slice(-300)); return; }
      srv = crearServidor(dest, null);
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const b = 'http://127.0.0.1:' + srv.address().port + '/';
      const meta = JSON.parse(fs.readFileSync(path.join(dest, 'marca/termino.json'), 'utf8'));
      const malos = [], viol = [], fuera = [];
      for (const [pag, w, h] of [['pueblo.html', 1440, 900], ['pueblo.html', 320, 640], ...trads.map(l => ['pueblo-' + l + '.html', 320, 640])]) {
        const ctx = await navegador.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
        await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, SLUG);
        const page = await ctx.newPage();
        page.on('request', q => { if (!q.url().startsWith(b) && !/^(data|blob):/.test(q.url())) fuera.push(pag + ': ' + q.url()); });
        await page.goto(b + pag, { waitUntil: 'networkidle' });
        await page.locator('#t-termino').scrollIntoViewIfNeeded();
        const r = await page.evaluate(() => {
          const sec = document.getElementById('t-termino'), fig = document.querySelector('.termino__figura'), svg = document.querySelector('.termino__mapa');
          if (!sec || !svg) return null;
          const puntos = [...svg.querySelectorAll('a.termino-punto')].map(a => a.getAttribute('href'));
          const ley = [...document.querySelectorAll('.termino__lugares a')].map(a => a.getAttribute('href'));
          const pie = document.querySelector('.termino__pie'), atr = pie && [...pie.querySelectorAll('a')].find(a => /openstreetmap\.org\/copyright/.test(a.href));
          const rb = svg.getBoundingClientRect();
          return { puntos, ley, sinFicha: [...puntos, ...ley].filter(h => !document.getElementById(h.slice(1))),
            atr: atr ? atr.textContent : null, oculto: svg.getAttribute('aria-hidden'), tabulables: [...svg.querySelectorAll('a')].filter(a => a.tabIndex >= 0).length,
            claves: document.querySelectorAll('.termino__claves li').length, escala: !!svg.querySelector('.termino-escala'), ejemplo: !!pie.querySelector('.ejemplo'),
            ancho: document.documentElement.scrollWidth, vw: innerWidth, svgDer: rb.right, svgAncho: rb.width };
        });
        if (!r) { malos.push(pag + ' ' + w + ': no sale el mapa'); await ctx.close(); continue; }
        if (r.puntos.length !== meta.lugares.length || r.ley.join() !== r.puntos.join() || r.sinFicha.length) malos.push(`${pag} ${w}: puntos ${JSON.stringify(r.puntos)} / leyenda ${r.ley.length} / sin ficha ${r.sinFicha.join(',')}`);
        if (!/© colaboradores de OpenStreetMap/.test(r.atr || '') || r.oculto !== 'true' || r.tabulables || r.claves < 4 || !r.escala || !r.ejemplo) malos.push(`${pag} ${w}: ${JSON.stringify(r)}`);
        if (r.ancho > r.vw || r.svgDer > r.vw + 0.5 || r.svgAncho < Math.min(260, w - 40)) malos.push(`${pag} ${w}: desborda o encoge (${r.ancho} / ${r.svgDer} / ${r.svgAncho})`);
        /* un punto lleva a su ficha */
        if (w === 1440) {
          const primero = r.puntos[0];
          await page.locator(`a.termino-punto[href="${primero}"]`).click();
          const llega = await page.evaluate(h => location.hash === h && !!document.querySelector(h + ':target'), primero);
          if (!llega) malos.push('pulsar el punto 1 no lleva a ' + primero);
        }
        await axeDe(page, pag + ' ' + w, viol);
        await ctx.close();
      }
      comprobar(!malos.length && !viol.length && !fuera.length, `v3b V16: con la muestra sintética, el mapa del término sale en «El pueblo»${trads.length ? ' y en ' + trads.join(', ') : ''}: ${meta.lugares.length} puntos numerados que enlazan (ratón) a su ficha, la misma lista en texto (teclado), leyenda, escala y «© colaboradores de OpenStreetMap»; sin peticiones fuera, sin desborde a 320 px y 0 violaciones de axe` +
        (malos.length ? ' → ' + malos.slice(0, 3).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 4).join(', ') : '') + (fuera.length ? ' → fuera: ' + fuera.slice(0, 3).join(', ') : ''));

      /* sin traducción completa, esa página no se genera; sin ninguna, tampoco el selector */
      if (trads.length) {
        const f0 = path.join(dest, 'contenido', 'pueblo.' + trads[0] + '.json'), tr = JSON.parse(fs.readFileSync(f0, 'utf8'));
        delete tr.pueblo.historia;
        fs.writeFileSync(f0, JSON.stringify(tr));
        const a1 = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og'], { encoding: 'utf8', cwd: dest });
        const incompleta = a1.status === 0 && !fs.existsSync(path.join(dest, 'pueblo-' + trads[0] + '.html')) && /no se genera/.test(a1.stdout + a1.stderr);
        for (const l of trads) fs.rmSync(path.join(dest, 'contenido', 'pueblo.' + l + '.json'));
        const a2 = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
        const sin = a2.status === 0 && !fs.readdirSync(dest).some(f => /^pueblo-[a-z]{2}\.html$/.test(f)) && !/class="contenedor idiomas"|hreflang=/.test(fs.readFileSync(path.join(dest, 'pueblo.html'), 'utf8'));
        comprobar(incompleta && sin, 'v3b F12: con una traducción incompleta, esa página no se genera (y aplicar.mjs lo dice); sin traducciones, ni páginas en otros idiomas, ni selector, ni hreflang' + (incompleta && sin ? '' : ' → ' + JSON.stringify({ incompleta, sin })));
      }
    } finally {
      if (srv) srv.close();
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }

  /* 3. F12 en la web: lang, hreflang recíprocos, el selector solo en «El pueblo», lo común en castellano y axe */
  if (trads.length) {
    const malos = [], viol = [];
    const paginas = ['pueblo.html', ...trads.map(l => 'pueblo-' + l + '.html')];
    for (const p of paginas) {
      if (!fs.existsSync(path.join(RAIZ, p))) { malos.push('falta ' + p); continue; }
      const h = leer(RAIZ, p), lang = p === 'pueblo.html' ? 'es' : p.slice(7, 9);
      if (!new RegExp(`<html lang="${lang}"`).test(h)) malos.push(p + ': lang');
      const alt = [...h.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)">/g)].map(m => m[1] + '=' + m[2].split('/').pop());
      const esperado = [...paginas.map(x => (x === 'pueblo.html' ? 'es' : x.slice(7, 9)) + '=' + x), 'x-default=pueblo.html'];
      if (alt.sort().join() !== esperado.sort().join()) malos.push(p + ': hreflang ' + alt.join(','));
      if (lang !== 'es' && !['<a class="saltar" lang="es"', '<header class="cabecera" lang="es"', '<footer class="pie" lang="es"'].every(x => h.includes(x))) malos.push(p + ': lo común sin lang="es"');
    }
    for (const p of PAGINAS.filter(x => !paginas.includes(x))) if (/class="contenedor idiomas"|hreflang="(en|pt|x-default)"/.test(leer(RAIZ, p))) malos.push(p + ': lleva selector o hreflang');
    for (const p of paginas) for (const [w, hh] of [[1440, 900], [320, 640]]) {
      const { ctx, page } = await nueva({ viewport: { width: w, height: hh } });
      await ir(page, p);
      const r = await page.evaluate(() => {
        const n = document.querySelector('.idiomas'), act = n && n.querySelector('[aria-current="page"]'), rb = n && n.getBoundingClientRect();
        return { visible: !!n && rb.width > 0 && rb.height > 0, enlaces: n ? [...n.querySelectorAll('a')].map(a => a.getAttribute('hreflang') + ':' + a.getAttribute('lang')) : [], actual: act ? act.getAttribute('href') : null,
          ancho: document.documentElement.scrollWidth, vw: innerWidth };
      });
      if (!r.visible || r.enlaces.length !== paginas.length || r.actual !== p || r.enlaces.some(e => e.split(':')[0] !== e.split(':')[1])) malos.push(`${p} ${w}: selector ${JSON.stringify(r)}`);
      if (r.ancho > r.vw) malos.push(`${p} ${w}: desborda (${r.ancho})`);
      if (p !== 'pueblo.html') await axeDe(page, p + ' ' + w, viol);
      await ctx.close();
    }
    comprobar(!malos.length && !viol.length, `v3b F12: «El pueblo» en ${trads.join(' y ')} con su lang, hreflang recíprocos entre las ${paginas.length} (y x-default), el selector visible solo ahí (con aria-current), la cabecera y el pie marcados lang="es", sin desborde a 320 px y 0 violaciones de axe` +
      (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 4).join(', ') : ''));
  } else notas.push('NOTA  · v3b F12: no hay contenido/pueblo.<lang>.json; «El pueblo» solo en castellano');

  /* 4. M9. el plano del pie se dibuja al asomar, desde el Ayuntamiento, y acaba entero; quieto con movimiento reducido */
  if (fs.existsSync(path.join(RAIZ, 'marca/plano.svg'))) {
    const { ctx, page } = await nueva({ reducido: false });
    await ir(page, 'telefonos.html');
    const antes = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('.pie__plano .plano-calle')];
      const [x0, y0, w, h] = document.querySelector('.pie__plano-dibujo').getAttribute('viewBox').split(/\s+/).map(Number), cx = x0 + w / 2, cy = y0 + h / 2;
      /* cada tramo empieza por su punta más cercana al Ayuntamiento (el centro) y --plano-d crece con la distancia */
      const desde = ps.filter(p => { const a = p.getPointAtLength(0), z = p.getPointAtLength(p.getTotalLength()); return Math.hypot(a.x - cx, a.y - cy) > Math.hypot(z.x - cx, z.y - cy) + 0.5; }).length;
      return { n: ps.length, conLongitud: ps.filter(p => p.getAttribute('pathLength') === '1').length, desde, clase: document.querySelector('.pie__plano').classList.contains('mov-plano'),
        dash: ps.filter(p => getComputedStyle(p).strokeDasharray !== 'none').length };
    });
    await page.mouse.wheel(0, 40000);
    /* en cuanto asoma (la clase), a los 60 ms: a medias */
    const durante = await page.evaluate(async () => {
      const pl = document.querySelector('.pie__plano'), t0 = performance.now();
      while (!pl.classList.contains('mov-plano') && performance.now() - t0 < 3000) await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 60));
      const ps = [...document.querySelectorAll('.pie__plano .plano-calle')];
      const an = ps.map(p => ({ d: parseFloat(p.style.getPropertyValue('--plano-d')), a: p.getAnimations().find(x => x.animationName === 'mov-plano') })).filter(x => x.a);
      const t = an.map(x => ({ d: x.d, ini: x.a.effect.getComputedTiming().delay, fin: x.a.effect.getComputedTiming().endTime }));
      const orden = t.slice().sort((a, b) => a.d - b.d).every((x, i, arr) => !i || x.ini >= arr[i - 1].ini - 0.5);
      return { n: an.length, total: Math.max(0, ...t.map(x => x.fin)), primero: Math.min(...t.map(x => x.ini)), orden };
    });
    await espera(800);
    const despues = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('.pie__plano .plano-calle')];
      return { vivas: ps.flatMap(p => p.getAnimations()).filter(a => a.playState === 'running').length, sinDibujar: ps.filter(p => { const cs = getComputedStyle(p); return cs.strokeDasharray !== 'none' || parseFloat(cs.strokeDashoffset) !== 0; }).length };
    });
    await ctx.close();
    const q = await nueva();
    await ir(q.page, 'telefonos.html');
    await q.page.mouse.wheel(0, 40000);
    await espera(400);
    const quieto = await q.page.evaluate(() => {
      const ps = [...document.querySelectorAll('.pie__plano .plano-calle')];
      return { clase: document.querySelector('.pie__plano').classList.contains('mov-plano'), an: ps.flatMap(p => p.getAnimations()).length, dash: ps.filter(p => getComputedStyle(p).strokeDasharray !== 'none').length };
    });
    await q.ctx.close();
    const ok = antes.n > 5 && antes.conLongitud === antes.n && !antes.desde && !antes.clase && !antes.dash && durante.n === antes.n && durante.primero === 0 && durante.total > 0 && durante.total <= 600 && durante.orden &&
      !despues.vivas && !despues.sinDibujar && !quieto.clase && !quieto.an && !quieto.dash;
    comprobar(ok, `v3b M9: el plano del pie está entero en reposo; al asomar, sus ${antes.n} tramos (pathLength=1, cada uno desde su punta más cercana al Ayuntamiento) se trazan de dentro afuera en ${Math.round(durante.total)} ms y acaba dibujado; con movimiento reducido no se anima` +
      (ok ? '' : ' → ' + JSON.stringify({ antes, durante, despues, quieto })));
  }
}

/* ═════════════ v3c · automatico: la tarea diaria, la hoja al montar, la lista viva de avisos y «Actualizada» ═════════════
   F14 el workflow de GitHub Actions (comprobación textual, sin librerías, y el paso de publicar
   ejecutado con bash en un repositorio de prueba); F15 el lector de la hoja en Node con las respuestas
   gviz de pruebas/hoja/ (un servidor local hace de Google) y el montaje en una copia; F16 la lista de
   avisos.html en el navegador con la hoja simulada; F17 la línea «Web actualizada el …» del pie. */
async function v3cAutomatico() {
  const http = await import('node:http');
  const { spawn } = await import('node:child_process');
  const { leerHojaAlMontar, CACHE } = await import('./lib/hoja.mjs');
  const MUESTRA = n => leer(RAIZ, 'pruebas', 'hoja', 'gviz-' + n + '.txt');
  /* el servidor que hace de Google: ?sheet=<pestaña> → pruebas/hoja/gviz-<pestaña>.txt; `modo` cambia lo que contesta */
  let modo = 'contesta';
  const google = http.createServer((q, r) => {
    const hoja = (new URL(q.url, 'http://x').searchParams.get('sheet') || '').toLowerCase();
    const f = path.join(RAIZ, 'pruebas', 'hoja', 'gviz-' + hoja + '.txt');
    if (modo === 'html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>Iniciar sesión: Cuentas de Google</title>'); }
    if (modo === '500' || !fs.existsSync(f)) { r.writeHead(modo === '500' ? 500 : 404); return r.end(); }
    r.writeHead(200, { 'content-type': 'text/plain' }); r.end(fs.readFileSync(f));
  });
  await new Promise(r => google.listen(0, '127.0.0.1', r));
  const GOOGLE = 'http://127.0.0.1:' + google.address().port + '/', CAIDA = 'http://127.0.0.1:9/';
  const correr = (cmd, argv, op = {}) => new Promise(res => {
    const p = spawn(cmd, argv, { ...op, env: { ...process.env, ...(op.env || {}) } });
    let salida = ''; p.stdout.on('data', d => { salida += d; }); p.stderr.on('data', d => { salida += d; });
    p.on('close', c => res({ c, salida }));
  });
  const ID_AVISO = '2026-10-05-aviso-de-muestra-publicado-desde-la-hoja', ID_NOTICIA = '2026-10-05-noticia-de-muestra-publicada-desde-la-hoja';
  try {
    /* ── 1. F14 · el workflow ── */
    {
      const malos = [];
      const rel = '.github/workflows/actualizar.yml';
      const yml = fs.existsSync(path.join(RAIZ, rel)) ? leer(RAIZ, rel) : '';
      if (!yml) malos.push('falta ' + rel);
      const lineas = yml.split(/\r?\n/);
      /* YAML mínimo: sin tabuladores, sangría de 2 en 2 y las claves de primer nivel que hacen falta */
      if (/\t/.test(yml)) malos.push('lleva tabuladores');
      const malSangria = lineas.filter(l => l.trim() && !/^\s*#/.test(l) && (l.match(/^ */)[0].length % 2));
      if (malSangria.length) malos.push('sangría impar: ' + malSangria[0].trim());
      const raices = lineas.filter(l => /^[a-z][\w-]*:/.test(l)).map(l => l.split(':')[0]);
      for (const k of ['name', 'on', 'permissions', 'concurrency', 'jobs']) if (!raices.includes(k)) malos.push('sin «' + k + ':» de primer nivel');
      /* bloque de primer nivel → sus líneas */
      const bloque = k => { const i = lineas.findIndex(l => l.startsWith(k + ':')); if (i < 0) return []; const out = []; for (let j = i + 1; j < lineas.length && (!lineas[j].trim() || /^\s/.test(lineas[j])); j++) out.push(lineas[j]); return out; };
      const on = bloque('on').join('\n'), perm = bloque('permissions').join('\n'), conc = bloque('concurrency').join('\n');
      const crons = [...on.matchAll(/^\s+- cron: '([^']+)'/gm)].map(m => m[1]);
      const horas = [];
      for (const c of crons) {
        const f = c.split(' ');
        if (f.length !== 5 || !/^\d{1,2}$/.test(f[0]) || !/^\d{1,2}$/.test(f[1]) || f.slice(2).join(' ') !== '* * *' || Number(f[0]) > 59) { malos.push('cron raro: ' + c); continue; }
        /* hora de Madrid en invierno (UTC+1) y en verano (UTC+2): las dos, de 6 a 21 */
        const h = Number(f[1]);
        if (h + 1 < 6 || h + 2 > 21) malos.push(`cron ${c}: a las ${h + 1}/${h + 2} en Madrid no es una hora razonable`);
        horas.push(h);
      }
      if (crons.length < 2 || new Set(horas).size < 2) malos.push('hacen falta dos horas al día (hay ' + crons.length + ' cron)');
      if (!/^\s+workflow_dispatch:/m.test(on)) malos.push('sin workflow_dispatch (lanzarla a mano)');
      if (!/^\s+contents: write\s*(#.*)?$/m.test(perm)) malos.push('sin permissions → contents: write');
      if (!/^\s+group: \S+/m.test(conc) || !/^\s+cancel-in-progress: false\s*(#.*)?$/m.test(conc)) malos.push('concurrency sin group o cancelando la que está en marcha');
      if (/secrets\./.test(yml)) malos.push('usa secretos');
      if (/npm (install|ci)|playwright install|npx /.test(yml)) malos.push('instala paquetes (no hace falta)');
      const scripts = [...yml.matchAll(/node (scripts\/[\w./-]+\.mjs)([^\n]*)/g)].map(m => ({ rel: m[1], args: m[2].trim(), at: m.index }));
      for (const s of scripts) if (!fs.existsSync(path.join(RAIZ, s.rel))) malos.push('llama a ' + s.rel + ', que no existe');
      const tab = scripts.find(s => s.rel === 'scripts/tablon.mjs'), apl = scripts.find(s => s.rel === 'scripts/aplicar.mjs'), push = yml.indexOf('git push');
      if (!tab || !apl || push < 0 || !(tab.at < apl.at && apl.at < push)) malos.push('el orden tiene que ser tablon.mjs → aplicar.mjs → git push');
      if (apl && !/--sin-capturas/.test(apl.args)) malos.push('aplicar.mjs sin --sin-capturas (pediría Chromium)');
      if (!/--sin-capturas/.test(leer(RAIZ, 'scripts/aplicar.mjs'))) malos.push('aplicar.mjs no conoce --sin-capturas');
      if (!/tablon_autorizado/.test(leer(RAIZ, 'scripts/tablon.mjs'))) malos.push('tablon.mjs ya no mira tablon_autorizado');
      if (!/git status --porcelain -- contenido/.test(yml)) malos.push('no mira si cambió contenido/ antes de publicar');
      comprobar(!malos.length, `v3c F14 · workflow: YAML bien sangrado, ${crons.length} horas al día (${crons.map(c => c.split(' ').slice(0, 2).reverse().join(':') + ' UTC').join(', ')}), a mano, contents: write, concurrency sin cancelar, sin secretos ni npm; tablon.mjs → aplicar.mjs --sin-capturas → git push, y los scripts existen` + (malos.length ? ' → ' + malos.join(' | ') : ''));

      /* el paso «Publicar si hay algo nuevo», ejecutado con bash en un repositorio de prueba con su remoto */
      const malosP = [];
      const iniPaso = lineas.findIndex(l => /- name: Publicar si hay algo nuevo/.test(l));
      const iniRun = lineas.findIndex((l, i) => i > iniPaso && /^\s+run: \|\s*$/.test(l));
      const cuerpo = [];
      if (iniPaso >= 0 && iniRun > 0) {
        const sang = lineas[iniRun + 1].match(/^ */)[0].length;
        for (let j = iniRun + 1; j < lineas.length && (!lineas[j].trim() || lineas[j].match(/^ */)[0].length >= sang); j++) cuerpo.push(lineas[j].slice(sang));
      }
      let bash = 'bash';
      if (process.platform === 'win32') {
        try { const b = path.join(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '..', '..', '..', 'bin', 'bash.exe'); bash = fs.existsSync(b) ? b : null; } catch (e) { bash = null; }
      }
      if (!cuerpo.length) malosP.push('no encuentro el run del paso «Publicar si hay algo nuevo»');
      else if (!bash) malosP.push('no hay bash para probar el paso (Git for Windows)');
      else {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3c-publicar-'));
        const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
        let gitEnv = {};
        try {
          const remoto = path.join(dir, 'remoto.git'), repo = path.join(dir, 'repo');
          execFileSync('git', ['init', '-q', '--bare', remoto]);
          execFileSync('git', ['clone', '-q', remoto, repo]);
          git(repo, 'config', 'user.name', 'Alguien'); git(repo, 'config', 'user.email', 'alguien@example.org'); git(repo, 'config', 'core.autocrlf', 'false');
          fs.mkdirSync(path.join(repo, 'contenido'));
          const escribirR = (rel, t) => fs.writeFileSync(path.join(repo, rel), t);
          const commitComo = (autor, haceDias) => {
            const fecha = new Date(Date.now() - haceDias * 864e5).toISOString();
            gitEnv = { GIT_AUTHOR_NAME: autor, GIT_COMMITTER_NAME: autor, GIT_AUTHOR_DATE: fecha, GIT_COMMITTER_DATE: fecha };
            git(repo, 'add', '-A'); git(repo, 'commit', '-q', '--allow-empty', '-m', 'base'); git(repo, 'push', '-q', 'origin', 'HEAD'); gitEnv = {};
          };
          const script = path.join(dir, 'paso.sh'), salidaGH = path.join(dir, 'salida.txt');
          const paso = async (evento) => {
            fs.writeFileSync(script, cuerpo.join('\n').replace(/\$\{\{\s*github\.event_name\s*\}\}/g, evento) + '\n');
            fs.writeFileSync(salidaGH, '');
            const r = await correr(bash, [script], { cwd: repo, env: { TZ: 'Europe/Madrid', RUNNER_TEMP: dir.replace(/\\/g, '/'), GITHUB_OUTPUT: salidaGH.replace(/\\/g, '/') } });
            return { ...r, publicado: /publicado=si/.test(fs.readFileSync(salidaGH, 'utf8')), remotos: Number(git(remoto, 'rev-list', '--count', 'HEAD')), mensaje: git(remoto, 'log', '-1', '--format=%B'), limpio: !git(repo, 'status', '--porcelain') };
          };
          escribirR('index.html', 'actualizada 7:23\n'); escribirR('contenido/hoja.json', '{}\n');
          commitComo('github-actions[bot]', 0);
          const casos = [];
          /* a) solo cambia la hora del pie y ya se publicó hoy: nada */
          escribirR('index.html', 'actualizada 15:23\n');
          let r = await paso('schedule'); casos.push(['solo la hora', r]);
          if (r.c !== 0 || r.publicado || r.remotos !== 1 || !r.limpio) malosP.push('con solo la hora del pie y ya publicada hoy, publica o deja sucio (' + r.salida.trim().split('\n').pop() + ')');
          /* b) cambia contenido/: publica, con el motivo y lo que cambió */
          escribirR('index.html', 'actualizada 15:23\n'); escribirR('contenido/hoja.json', '{"nuevo":1}\n');
          r = await paso('schedule');
          if (r.c !== 0 || !r.publicado || r.remotos !== 2 || !/^Web actualizada sola: avisos, agenda, noticias o tablón nuevos/.test(r.mensaje) || !/contenido\/hoja\.json/.test(r.mensaje)) malosP.push('con contenido/ nuevo no publica bien (' + r.c + ', ' + r.mensaje.split('\n')[0] + ')');
          /* c) primera vez del día (lo último es de ayer): repaso del día */
          commitComo('github-actions[bot]', 2);
          escribirR('index.html', 'actualizada 7:23 de hoy\n');
          r = await paso('schedule');
          if (!r.publicado || !/repaso del día/.test(r.mensaje)) malosP.push('el primer montaje del día no publica el repaso (' + r.mensaje.split('\n')[0] + ')');
          /* d) alguien subió algo a mano hoy: se publica lo regenerado */
          commitComo('Alguien', 0);
          escribirR('index.html', 'regenerada\n');
          r = await paso('schedule');
          if (!r.publicado || !/cambios subidos a mano/.test(r.mensaje)) malosP.push('tras un cambio a mano no publica (' + r.mensaje.split('\n')[0] + ')');
          /* e) a mano (workflow_dispatch), aunque ya se publicó hoy */
          escribirR('index.html', 'otra vez\n');
          r = await paso('workflow_dispatch');
          if (!r.publicado || !/lanzada a mano/.test(r.mensaje)) malosP.push('lanzada a mano no publica (' + r.mensaje.split('\n')[0] + ')');
          /* f) sin ningún cambio: nada */
          r = await paso('schedule');
          if (r.c !== 0 || r.publicado) malosP.push('sin cambios, publica');
        } catch (e) { malosP.push('el paso se rompió: ' + String(e.message).split('\n')[0]); }
        fs.rmSync(dir, { recursive: true, force: true });
      }
      comprobar(!malosP.length, 'v3c F14 · el paso «Publicar» (bash, repo de prueba con remoto): solo la hora del pie → no sube nada y deja limpio; contenido/ nuevo → commit «Web actualizada sola: …» con lo que cambió y push; primer montaje del día → «repaso del día»; tras un cambio a mano → lo publica; a mano → publica; sin cambios → nada' + (malosP.length ? ' → ' + malosP.join(' | ') : ''));
    }

    /* ── 2. F15 · el lector de la hoja en Node ── */
    {
      const malos = [];
      const ctxV = { window: {}, Intl, Date }; vm.runInNewContext(leer(RAIZ, 'js', 'vivo.js'), ctxV); const V = ctxV.window.Vivo;
      const plano = x => JSON.parse(JSON.stringify(x));
      /* normalización (la misma que el navegador: js/vivo.js → filasHoja) */
      const filasA = plano(V.filasHoja(MUESTRA('avisos'))), filasG = plano(V.filasHoja(MUESTRA('agenda')));
      const a0 = filasA[0];
      if (!a0 || a0.fecha !== '2026-10-05' || a0.titulo_corto !== 'Aviso de muestra desde la hoja' || a0.ejemplo !== true || a0.caduca !== '2026-10-20' || a0.id !== ID_AVISO) malos.push('columnas o valores mal normalizados: ' + JSON.stringify(a0));
      if (!filasA[2].oculto || !filasA[3].oculto || filasA[1].id !== 'muestra-enlace-raro') malos.push('estado oculto/borrador o id escrito a mano mal leídos');
      if (filasG[0].hora !== '19:00' || filasG[0].hora_fin !== '21.30') malos.push('la celda de solo hora no da «19:00»');
      /* saneado: lo que no se puede enseñar fuera, lo dudoso corregido, con un aviso por cosa */
      const sA = plano(V.sanearHoja('avisos', filasA)), sG = plano(V.sanearHoja('agenda', filasG)), sN = plano(V.sanearHoja('noticias', V.filasHoja(MUESTRA('noticias'))));
      const vis = sA.filas.filter(f => !f.oculto);
      if (vis.length !== 2 || sA.filas.filter(f => f.oculto).length !== 2 || sA.avisos.length !== 4) malos.push(`avisos saneados: ${vis.length} visibles, ${sA.filas.length - vis.length} ocultos, ${sA.avisos.length} avisos (esperados 2, 2 y 4)`);
      const raro = vis.find(f => f.id === 'muestra-enlace-raro') || {};
      if (raro.enlace !== null || raro.gravedad !== null || raro.tema !== 'Otros') malos.push('el aviso raro no se corrige: ' + JSON.stringify(raro));
      if (sA.filas.some(f => f.oculto && Object.keys(f).join() !== 'id,oculto')) malos.push('un oculto guarda más que su id');
      if (sG.filas[0].hora_fin !== '21:30' || sG.filas[2].hora !== null || sG.filas[2].convocatoria !== null || sG.filas[2].tipo !== 'pleno' || sG.avisos.length !== 2) malos.push('agenda saneada: ' + JSON.stringify(sG));
      if (sN.filas[0].cuerpo.length !== 2 || sN.filas[0].id !== ID_NOTICIA) malos.push('noticia: un párrafo por línea y su id');
      /* fusión: la hoja manda por id, lo oculto oculta lo que había y no añade nada; el .ics se queda si el acto no cambia */
      const base = [{ id: 'reunion-feria-comercio', titulo: 'Viejo', fecha: '2026-10-02' }, { id: 'otro', titulo: 'Sigue', fecha: '2026-10-01' }];
      const f1 = plano(V.fusionarHoja(base, sA.filas));
      if (!f1.find(x => x.id === 'reunion-feria-comercio').oculto || f1.length !== 4 || f1.some(x => /borrador/.test(x.id))) malos.push('fusión de avisos: ' + f1.map(x => x.id + (x.oculto ? '(oculto)' : '')).join(', '));
      const ag = [{ id: 'feavir-2026', fecha: '2026-11-12', titulo: 'FEAVIR, Feria Avícola', lugar: 'Segunda semana de noviembre', nota: 'Fecha exacta por confirmar.', ics: 'ics/feavir-2026.ics' }];
      const f2 = plano(V.fusionarHoja(ag, sG.filas, true));
      if (f2[0].ics !== 'ics/feavir-2026.ics' || f2.find(x => x.id === 'acto-muestra-hoja').ics !== null) malos.push('ics tras la fusión: ' + f2.map(x => x.id + '=' + x.ics).join(', '));
      const f3 = plano(V.fusionarHoja(ag, [{ ...sG.filas[1], fecha: '2026-11-13' }], true));
      if (f3[0].ics !== null) malos.push('un acto que cambia de fecha conserva su .ics viejo');

      /* leerHojaAlMontar: sin hoja.id nada; contesta; no cambia; cae; contesta HTML; sin copia */
      const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'v3c-hoja-'));
      const hoja = { id: 'HOJA-DE-PRUEBA', pestanas: { avisos: 'Avisos', agenda: 'Agenda', noticias: 'Noticias' } };
      const cache = path.join(raiz, CACHE);
      try {
        if ((await leerHojaAlMontar({ hoja: { id: '', pestanas: hoja.pestanas }, Vivo: V, raiz, base: GOOGLE })) !== null || fs.existsSync(cache)) malos.push('sin hoja.id hace algo');
        modo = 'contesta';
        const r1 = await leerHojaAlMontar({ hoja, Vivo: V, raiz, base: GOOGLE });
        if (!r1.escrita || Object.values(r1.origen).some(o => o !== 'hoja') || r1.avisos.filter(f => !f.oculto).length !== 2 || r1.agenda.length !== 3 || r1.noticias.length !== 1) malos.push('contesta: ' + JSON.stringify(r1.origen));
        const guardada = fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : '';
        if (/Borrador de muestra|Un borrador no sale|31\/02/.test(guardada)) malos.push('la copia guarda borradores o filas que no se publican');
        const r2 = await leerHojaAlMontar({ hoja, Vivo: V, raiz, base: GOOGLE });
        if (r2.escrita || fs.readFileSync(cache, 'utf8') !== guardada) malos.push('sin cambios en la hoja, reescribe la copia');
        for (const [m, b] of [['cae', CAIDA], ['html', GOOGLE], ['500', GOOGLE]]) {
          modo = m;
          const r = await leerHojaAlMontar({ hoja, Vivo: V, raiz, base: b, ms: 4000 });
          if (Object.values(r.origen).some(o => o !== 'copia') || JSON.stringify(r.avisos) !== JSON.stringify(r1.avisos) || r.escrita || fs.readFileSync(cache, 'utf8') !== guardada || r.avisos_montaje.filter(a => /no contesta/.test(a)).length !== 3)
            malos.push(`si la hoja ${m}, no usa la copia: ` + JSON.stringify(r.origen));
        }
        modo = 'contesta';
        fs.rmSync(cache);
        const r3 = await leerHojaAlMontar({ hoja, Vivo: V, raiz, base: CAIDA, ms: 4000 });
        if (r3.avisos.length || r3.agenda.length || Object.values(r3.origen).some(Boolean) || fs.existsSync(cache)) malos.push('sin copia y con la hoja caída no sale vacío');
        fs.writeFileSync(cache, guardada.replace('HOJA-DE-PRUEBA', 'OTRA-HOJA'));
        const r4 = await leerHojaAlMontar({ hoja, Vivo: V, raiz, base: CAIDA, ms: 4000 });
        if (r4.avisos.length) malos.push('usa la copia de otra hoja');
        const r5 = await leerHojaAlMontar({ hoja, Vivo: V, raiz, base: GOOGLE, sinRed: true });
        if (r5.avisos.length) malos.push('--sin-hoja pide la hoja');
      } finally { fs.rmSync(raiz, { recursive: true, force: true }); modo = 'contesta'; }
      comprobar(!malos.length, 'v3c F15 · la hoja en Node (pruebas/hoja/gviz-*.txt): columnas normalizadas como en el navegador, oculto y borrador fuera, lo malo quitado con su aviso, la hoja manda por id, el .ics se queda si el acto no cambia; copia en contenido/hoja.json solo si cambia; si la hoja cae, da un 500 o contesta HTML, sale la copia; sin copia, nada; sin hoja.id, nada' + (malos.length ? ' → ' + malos.join(' | ') : ''));
    }

    /* ── 3. F15/F17 · montar una copia con la hoja de muestra: avisos.html, feed.xml, agenda.ics, ics/ y la página de la noticia ── */
    {
      const malos = [];
      const dest = copiar();
      try {
        const Mc = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
        Mc.hoja = { id: 'HOJA-DE-PRUEBA', pestanas: { avisos: 'Avisos', agenda: 'Agenda', noticias: 'Noticias' } };
        fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(Mc, null, 2));
        fs.rmSync(path.join(dest, CACHE), { force: true });
        const montar = base => correr('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-capturas', '--silencio', '--fecha', '2026-10-06T10:00:00+02:00', '--hoja-url', base], { cwd: dest });
        const revisar = (cuando) => {
          const lee = rel => fs.readFileSync(path.join(dest, rel), 'utf8');
          const av = lee('avisos.html'), feed = lee('feed.xml'), agenda = lee('agenda.ics');
          const li = (av.match(new RegExp('<li class="aviso[^"]*" id="aviso-' + ID_AVISO + '"[\\s\\S]*?</li>')) || [''])[0];
          if (!li || !/<span class="ejemplo">Ejemplo<\/span>/.test(li) || !/Texto de muestra/.test(li) || !/href="https:\/\/example\.org\/aviso-de-muestra"/.test(li)) malos.push(cuando + ': el aviso de la hoja no sale entero en avisos.html (con «Ejemplo», texto y enlace)');
          if (/id="aviso-reunion-feria-comercio"/.test(av)) malos.push(cuando + ': el aviso ocultado en la hoja sigue en avisos.html');
          if (/javascript:|Borrador de muestra|31\/02\/2026/.test(av + feed + agenda + lee('index.html'))) malos.push(cuando + ': sale un borrador, una fila mala o un enlace javascript:');
          if (!feed.includes('<title>EJEMPLO: Aviso de muestra publicado desde la hoja</title>') || !feed.includes('<title>EJEMPLO: Noticia de muestra publicada desde la hoja</title>') || !feed.includes('avisos.html#aviso-' + ID_AVISO)) malos.push(cuando + ': el aviso o la noticia de la hoja no están en feed.xml');
          const uid = 'UID:acto-muestra-hoja@' + SLUG + '.agenda';
          if (!agenda.replace(/\r\n /g, '').includes(uid) || !/SUMMARY:EJEMPLO: Acto de muestra publicado desde la hoja/.test(agenda.replace(/\r\n /g, ''))) malos.push(cuando + ': el acto de la hoja no está en agenda.ics');
          const suelto = path.join(dest, 'ics', 'acto-muestra-hoja.ics');
          const v = fs.existsSync(suelto) ? icsValido(fs.readFileSync(suelto, 'utf8')) : { ok: false, mal: ['no existe'] };
          if (!v.ok || v.uid !== uid || !v.desplegado.includes('DTSTART;TZID=Europe/Madrid:20261024T190000') || !v.desplegado.includes('DTEND;TZID=Europe/Madrid:20261024T213000')) malos.push(cuando + ': ics/acto-muestra-hoja.ics → ' + (v.mal || []).join(', '));
          const pag = path.join(dest, 'noticia-' + ID_NOTICIA + '.html');
          const np = fs.existsSync(pag) ? fs.readFileSync(pag, 'utf8') : '';
          if (!/<h1[^>]*>[\s\S]*?Noticia de muestra publicada desde la hoja/.test(np) || (np.match(/<div class="articulo__cuerpo">[\s\S]*?<\/div>/) || [''])[0].split('<p>').length - 1 !== 2 || !/<span class="ejemplo">Ejemplo<\/span>/.test(np)) malos.push(cuando + ': la noticia de la hoja no tiene su página (h1, dos párrafos y «Ejemplo»)');
          if (!lee('noticias.html').includes('href="noticia-' + ID_NOTICIA + '.html"')) malos.push(cuando + ': noticias.html no enlaza la noticia de la hoja');
          if (!/<p class="pie__actualizada">Web actualizada el <time datetime="2026-10-06T10:00\+02:00">6 de octubre de 2026 a las 10:00<\/time>\.<\/p>/.test(np)) malos.push(cuando + ': «Web actualizada el …» no dice la fecha y hora del montaje');
        };
        modo = 'contesta';
        let r = await montar(GOOGLE);
        if (r.c !== 0) malos.push('aplicar.mjs con la hoja falla → ' + r.salida.slice(-300));
        else revisar('con la hoja');
        const copiaHoja = fs.existsSync(path.join(dest, CACHE)) ? fs.readFileSync(path.join(dest, CACHE), 'utf8') : '';
        if (!copiaHoja) malos.push('no guarda contenido/hoja.json');
        r = await montar(CAIDA);
        if (r.c !== 0) malos.push('aplicar.mjs con la hoja caída falla → ' + r.salida.slice(-300));
        else revisar('con la hoja caída (copia)');
        if (copiaHoja && fs.readFileSync(path.join(dest, CACHE), 'utf8') !== copiaHoja) malos.push('con la hoja caída, cambia la copia');
        /* tablon.mjs: si el tablón no cambia, no se toca (ni la hora): así un cambio en contenido/ es «algo nuevo» */
        const salida = path.join(dest, 'tablon-prueba.json');
        const desde = ['scripts/tablon.mjs', '--desde', path.join(RAIZ, 'pruebas/tablon/board-ribera.html'), '--salida', salida];
        if (M.sede.tipo === 'gestiona') {
          await correr('node', [path.join(dest, desde[0]), ...desde.slice(1)], { cwd: dest });
          const t1 = fs.existsSync(salida) ? fs.readFileSync(salida, 'utf8') : '';
          await espera(1100);
          const r2 = await correr('node', [path.join(dest, desde[0]), ...desde.slice(1)], { cwd: dest });
          if (!t1 || fs.readFileSync(salida, 'utf8') !== t1 || !/sin cambios/.test(r2.salida)) malos.push('tablon.mjs reescribe tablon.json sin cambios');
        }
      } finally { fs.rmSync(dest, { recursive: true, force: true }); }
      /* sin hoja.id (Ribera, hoy), nada de la hoja */
      if (!(M.hoja && M.hoja.id) && fs.existsSync(path.join(RAIZ, CACHE))) malos.push('hay contenido/hoja.json sin hoja.id');
      comprobar(!malos.length, 'v3c F15 · montaje con la hoja de muestra: el aviso (con «Ejemplo», texto y enlace) en avisos.html y feed.xml, el oculto fuera, el acto en agenda.ics y en ics/acto-muestra-hoja.ics (válido, 19:00–21:30), la noticia con su noticia-<id>.html y en noticias.html; con la hoja caída, igual desde contenido/hoja.json; tablon.mjs no reescribe sin cambios' + (malos.length ? ' → ' + malos.join(' | ') : ''));
    }

    /* ── 4. F16 · la lista de avisos.html, viva en el navegador (con la hoja simulada) y sin JavaScript ── */
    {
      const malos = [];
      const propios = contenido('avisos').avisos.filter(a => !a.oculto);
      /* sin JavaScript: la lista pintada al montar (el respaldo de siempre) */
      const ctxSin = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
      const pSin = await ctxSin.newPage();
      await pSin.goto(BASE + 'avisos.html');
      const sinJs = await pSin.evaluate(() => [...document.querySelectorAll('[data-vivo="avisos"] .aviso')].map(li => li.id));
      const pie = await pSin.evaluate(() => { const p = document.querySelector('.pie__actualizada'); return p ? { texto: p.textContent, alto: p.getBoundingClientRect().height, dt: p.querySelector('time').getAttribute('datetime') } : null; });
      await ctxSin.close();
      if (sinJs.join() !== propios.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(a => 'aviso-' + a.id).join()) malos.push('sin JavaScript, la lista no es la de contenido/avisos.json: ' + sinJs.join(', '));
      /* con la hoja: se repinta, sale el de la hoja con su texto y «Ejemplo», el ocultado se va y #aviso-<id> baja a él */
      const conHoja = async (pag, cambiar) => {
        const x = await nueva({ viewport: { width: 1280, height: 800 } });
        await x.page.route('**/' + pag, async r => {
          const resp = await r.fetch(); let cuerpo = await resp.text();
          cuerpo = cuerpo.replace(/(<script type="application\/json" id="datos-vivos">)([\s\S]*?)(<\/script>)/, (m, a, j, b) => {
            const D = JSON.parse(j); D.hoja = { id: 'HOJA-DE-PRUEBA', pestanas: { avisos: 'Avisos' } }; if (cambiar) cambiar(D);
            return a + JSON.stringify(D).replace(/</g, '\\u003c') + b;
          });
          r.fulfill({ response: resp, body: cuerpo });
        });
        await x.page.route('https://docs.google.com/**', r => r.fulfill({ contentType: 'text/plain', body: MUESTRA('avisos') }));
        return x;
      };
      {
        const x = await conHoja('avisos.html');
        await x.page.goto(BASE + 'avisos.html#aviso-' + ID_AVISO, { waitUntil: 'networkidle' });
        await espera(400);
        const r = await x.page.evaluate(id => {
          const li = document.getElementById('aviso-' + id), caja = li && li.getBoundingClientRect();
          return { hay: !!li && !!li.closest('[data-vivo="avisos"]'), texto: li ? li.textContent : '', ejemplo: !!(li && li.querySelector('.ejemplo')), arriba: caja ? Math.round(caja.top) : null,
            oculto: !!document.getElementById('aviso-reunion-feria-comercio'), raros: document.querySelectorAll('a[href^="javascript:"]').length, seccion: !document.querySelector('[data-vivo="avisos"]').closest('section').hidden };
        }, ID_AVISO);
        const ax = await new AxeBuilder({ page: x.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        if (!r.hay || !/Texto de muestra/.test(r.texto) || !r.ejemplo) malos.push('el aviso de la hoja no sale en la lista con su texto y «Ejemplo»');
        if (r.arriba === null || r.arriba < -2 || r.arriba > 200) malos.push('avisos.html#aviso-<id> no baja al aviso que llega de la hoja (top ' + r.arriba + ')');
        if (r.oculto) malos.push('el aviso ocultado en la hoja sigue en la lista');
        if (r.raros) malos.push('hay enlaces javascript:');
        if (ax.violations.length) malos.push('axe: ' + ax.violations.map(v => v.id).join(', '));
        if (x.errores.length) malos.push('consola: ' + x.errores.slice(0, 2).join(' | '));
        await x.ctx.close();
      }
      {
        /* sin ningún aviso propio, la sección no sale; si la hoja trae uno, aparece */
        const sin = await nueva();
        await conDatosV3c(sin.page, 'avisos.html', D => { D.avisos = []; });
        await ir(sin.page, 'avisos.html');
        const oculta = await sin.page.evaluate(() => { const s = document.querySelector('[data-vivo="avisos"]').closest('section'); return s.hidden && s.getBoundingClientRect().height === 0; });
        await sin.ctx.close();
        const x = await conHoja('avisos.html', D => { D.avisos = []; });
        await ir(x.page, 'avisos.html');
        await espera(300);
        const sale = await x.page.evaluate(() => { const s = document.querySelector('[data-vivo="avisos"]').closest('section'); return !s.hidden && s.querySelectorAll('.aviso').length; });
        await x.ctx.close();
        if (!oculta) malos.push('sin avisos, la sección «Avisos del Ayuntamiento» sale vacía');
        if (sale !== 2) malos.push('sin avisos propios, los 2 de la hoja no hacen salir la sección (' + sale + ')');
      }
      /* F17 · «Web actualizada el …»: en todas las páginas, igual en todas, sin JavaScript y a la vista */
      const sellos = new Set(), sinSello = [];
      for (const p of PAGINAS) { const m = leer(RAIZ, p).match(/<p class="pie__actualizada">Web actualizada el <time datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[+-]\d{2}:\d{2})">(\d{1,2} de [a-z]+ de \d{4} a las \d{1,2}:\d{2})<\/time>\.<\/p>/); if (m) sellos.add(m[1] + ' ' + m[2]); else sinSello.push(p); }
      if (sinSello.length) malos.push('sin «Web actualizada el …»: ' + sinSello.join(', '));
      if (sellos.size !== 1) malos.push('el sello no es el mismo en todas las páginas');
      const [dt] = [...sellos][0] ? [...sellos][0].split(' ') : [];
      if (dt && !(new Date(dt) <= new Date())) malos.push('el sello es del futuro: ' + dt);
      if (!pie || !pie.alto || !/Web actualizada el \d/.test(pie.texto)) malos.push('el sello no se ve sin JavaScript');
      comprobar(!malos.length, `v3c F16/F17 · «Avisos del Ayuntamiento»: sin JavaScript, los ${propios.length} de contenido/avisos.json; con la hoja simulada, el de la hoja con su texto y «Ejemplo», el ocultado fuera, sin javascript:, #aviso-<id> baja a él, axe 0; sin avisos la sección no sale y con la hoja aparece · «Web actualizada el ${[...sellos][0] ? [...sellos][0].split(' ').slice(1).join(' ') : '?'}» en las ${PAGINAS.length} páginas, sin JavaScript` + (malos.length ? ' → ' + malos.join(' | ') : ''));
    }
  } finally { google.close(); }
}
/* reescribe los datos vivos de una página antes de que main.js los pinte (v3c · automatico) */
async function conDatosV3c(page, pag, cambiar) {
  await page.route('**/' + pag, async r => {
    const resp = await r.fetch(); const cuerpo = await resp.text();
    r.fulfill({ response: resp, body: cuerpo.replace(/(<script type="application\/json" id="datos-vivos">)([\s\S]*?)(<\/script>)/, (m, a, j, b) => { const D = JSON.parse(j); cambiar(D); return a + JSON.stringify(D).replace(/</g, '\\u003c') + b; }) });
  });
}

/* ═════════════ v3c · alta: el mapa del término de Ribera de verdad y el alta de un municipio nuevo ═════════════
   - F25. marca/termino.json es de Ribera: su relación de OSM, la atribución, ni rastro de la muestra, y cada lugar con
     el id de OSM comprobado a mano (la lista de abajo) y dentro del contorno del término (el del propio SVG). En
     «El pueblo», a 1440 y a 320 px: los 7 puntos enlazan a su ficha, el recuadro del pueblo ampliado y su leyenda
     salen, y ningún círculo pisa a otro ni a un rótulo de carretera (medido en pantalla, con el ×1,6 del móvil).
   - F26. nuevo-municipio.mjs --sin-red con las respuestas guardadas de Segura de León (pruebas/alta/06124/): los
     datos que da casan con los del reskin de pruebas/segura-de-leon/, cada uno con su fuente y su fecha; lo que no
     se encuentra queda null; ALTA-<slug>.md lista lo que falta en orden; por nombre da el mismo municipio; si dos
     fuentes no casan (habitantes del mismo año), no elige y lo dice. Nunca pisa municipio.json (ni el de la raíz
     ni uno que no sea un borrador). aplicar.mjs, con el borrador tal cual, se niega diciendo qué falta (sin
     romperse); completado lo obligatorio, escribe la web. */
async function v3cAlta() {
  /* 1. F25: el término de Ribera */
  {
    const malos = [];
    const meta = JSON.parse(leer(RAIZ, 'marca', 'termino.json')), svg = leer(RAIZ, 'marca', 'termino.svg');
    /* los ids comprobados a mano el 4-10-2026 en openstreetmap.org (nombre, etiquetas y sitio dentro del término) */
    const COMPROBADOS = {
      'Iglesia de Nuestra Señora de Gracia': 'way/566210276', 'Casa de Vargas-Zúñiga': 'way/566195236',
      'Ermita del Cristo de la Misericordia': 'way/566195241', 'Ermita de la Aurora': 'way/566205161', 'Ermita de San Juan Macías': 'way/566200526',
      'Palacio de Quintanilla': 'way/566195238', 'Pozo de San Juan Macías': 'node/5904426027'
    };
    if (meta.relacion !== 'relation/344111' || meta.nombre_osm !== M.nombre || !svg.includes(`data-termino="${M.slug}"`)) malos.push(`no es el de ${M.nombre}: ${meta.relacion} «${meta.nombre_osm}»`);
    if (meta.atribucion !== '© colaboradores de OpenStreetMap' || meta.atribucion_url !== 'https://www.openstreetmap.org/copyright' || meta.licencia !== 'ODbL 1.0') malos.push('sin la atribución de OSM');
    if (meta.muestra || /90000\d\d/.test(JSON.stringify(meta)) || /XX-\d/.test(svg)) malos.push('trae restos de la muestra sintética');
    const lugares = meta.lugares || [];
    const raros = lugares.filter(l => COMPROBADOS[l.nombre] !== l.osm).map(l => l.nombre + ' → ' + l.osm);
    if (raros.length || lugares.length !== Object.keys(COMPROBADOS).length) malos.push('lugares sin comprobar: ' + (raros.join(', ') || lugares.length + ' de ' + Object.keys(COMPROBADOS).length));
    /* dentro del término: su sitio exacto (llevado al mapa grande si está en el recuadro) dentro del contorno del SVG */
    const area = (/<path class="termino-area" d="([^"]+)"/.exec(svg) || [])[1] || '';
    const anillos = area.split('M').filter(Boolean).map(a => a.replace(/Z$/, '').split('L').map(p => p.trim().split(/\s+/).map(Number)));
    const dentro = ([x, y]) => { let c = false; for (const a of anillos) for (let i = 0, j = a.length - 1; i < a.length; j = i++) if ((a[i][1] > y) !== (a[j][1] > y) && x < (a[j][0] - a[i][0]) * (y - a[i][1]) / (a[j][1] - a[i][1]) + a[i][0]) c = !c; return c; };
    for (const l of lugares) {
      let p = l.sitio || [l.x, l.y];
      if (l.recuadro) {
        if (!meta.recuadro) { malos.push(l.nombre + ': en un recuadro que no existe'); continue; }
        const [c0, c1, c2, c3] = meta.recuadro.caja, [z0, z1, z2, z3] = meta.recuadro.zona;
        p = [z0 + (p[0] - c0) * (z2 - z0) / (c2 - c0), z1 + (p[1] - c1) * (z3 - z1) / (c3 - c1)];
      }
      if (!dentro(p)) malos.push(l.nombre + ' fuera del término');
    }
    /* en «El pueblo»: puntos, recuadro y leyenda, sin pisarse */
    const srv = crearServidor(RAIZ, null);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    try {
      for (const w of [1440, 320]) {
        const ctx = await navegador.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript(s => { try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {} }, SLUG);
        const page = await ctx.newPage();
        await page.goto('http://127.0.0.1:' + srv.address().port + '/pueblo.html', { waitUntil: 'networkidle' });
        await page.locator('#t-termino').scrollIntoViewIfNeeded();
        const r = await page.evaluate(() => {
          const svg = document.querySelector('.termino__mapa');
          if (!svg) return null;
          const caja = e => { const b = e.getBoundingClientRect(); return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom }; };
          const circulos = [...svg.querySelectorAll('a.termino-punto circle')].map(caja), rotulos = [...svg.querySelectorAll('.termino-ref rect')].map(caja);
          const cortan = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
          const pisan = [];
          circulos.forEach((a, i) => { circulos.forEach((b, j) => { if (j > i && cortan(a, b)) pisan.push(`${i + 1} y ${j + 1}`); }); rotulos.forEach((b, j) => { if (cortan(a, b)) pisan.push(`${i + 1} y el rótulo ${j + 1}`); }); });
          const enlaces = [...svg.querySelectorAll('a.termino-punto')].map(a => a.getAttribute('href'));
          return { n: enlaces.length, sinFicha: enlaces.filter(h => !document.getElementById(h.slice(1))), pisan, radio: circulos.length ? circulos[0].x1 - circulos[0].x0 : 0,
            recuadro: !!svg.querySelector('.termino-recuadro .termino-marco') && !!svg.querySelector('.termino-zona'), claves: [...document.querySelectorAll('.termino__claves li')].map(li => li.textContent.trim()),
            ancho: document.documentElement.scrollWidth, vw: innerWidth };
        });
        await ctx.close();
        if (!r) { malos.push(w + ' px: no sale el mapa'); continue; }
        if (r.n !== lugares.length || r.sinFicha.length) malos.push(`${w} px: ${r.n} puntos, sin ficha ${r.sinFicha.join(', ')}`);
        if (r.pisan.length) malos.push(`${w} px: se pisan ${r.pisan.slice(0, 4).join(', ')}`);
        if (!r.recuadro || !r.claves.some(c => /^Recuadro: el pueblo ampliado; su barra mide \d+ m$/.test(c)) || !r.claves.some(c => /^Raya fina con un punto/.test(c))) malos.push(`${w} px: sin el recuadro o su leyenda (${r.claves.join(' | ')})`);
        if (r.ancho > r.vw) malos.push(`${w} px: desborda (${r.ancho})`);
        if (w === 320 && r.radio < 18) malos.push(`320 px: los círculos miden ${r.radio.toFixed(1)} px (con el ×1,6 deberían pasar de 18)`);
      }
    } finally { srv.close(); }
    comprobar(!malos.length, `v3c F25: el mapa del término es el de ${M.nombre} (${meta.relacion}, © OpenStreetMap, sin restos de la muestra): ${lugares.length} lugares con su id de OSM comprobado y dentro del término; en «El pueblo» (1440 y 320 px) los puntos llevan a su ficha, sale el recuadro del pueblo ampliado con su leyenda y ningún círculo pisa a otro ni a un rótulo` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* 2. F26: nuevo-municipio.mjs sin red */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alta-'));
  const nm = (...a) => spawnSync('node', [path.join(RAIZ, 'scripts/nuevo-municipio.mjs'), ...a], { encoding: 'utf8', cwd: RAIZ });
  const huella = f => createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  const antes = huella(path.join(RAIZ, 'municipio.json'));
  try {
    const malos = [];
    const sal = path.join(tmp, 'segura');
    const r = nm('06124', '--salida', sal, '--sin-red');
    if (r.status !== 0) { comprobar(false, 'v3c F26: nuevo-municipio.mjs --sin-red falla → ' + (r.stderr || r.stdout).slice(-300)); return; }
    const B = JSON.parse(fs.readFileSync(path.join(sal, 'municipio.json'), 'utf8')), S = JSON.parse(leer(RAIZ, 'pruebas', 'segura-de-leon', 'municipio.json'));
    const de = (o, ruta) => ruta.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
    /* lo que casa con el reskin hecho a mano (los datos comprobados de pruebas/segura-de-leon/) */
    for (const c of ['slug', 'nombre', 'provincia', 'gentilicio', 'habitantes.valor', 'contacto.direccion', 'contacto.cp', 'contacto.telefono', 'contacto.fax', 'contacto.correo', 'sede.tipo', 'sede.base', 'sede.instancia_general', 'sede.quejas', 'legal.titular', 'legal.dir3', 'escudo_credito.licencia', 'escudo_credito.url'])
      if (de(B, c) !== de(S, c)) malos.push(`${c}: «${de(B, c)}» y en el reskin «${de(S, c)}»`);
    if (B.ine !== '06124' || B._borrador !== true || !/^Mfarinias/.test((B.escudo_credito || {}).autor || '')) malos.push('ine, _borrador o autor del escudo');
    /* cada dato con su fuente y su fecha; lo no encontrado, null */
    const F = B._fuentes || {};
    const sinFuente = ['nombre', 'ine', 'provincia', 'habitantes', 'gentilicio', 'web_actual', 'contacto.direccion', 'contacto.cp', 'contacto.telefono', 'contacto.correo', 'sede.base', 'legal.dir3', 'escudo_credito', 'cifras']
      .filter(c => de(B, c) != null && !(F[c] && F[c].fuente && /^\d{4}-\d{2}-\d{2}$/.test(F[c].consultado || '')));
    if (sinFuente.length) malos.push('sin fuente: ' + sinFuente.join(', '));
    const noNulos = ['horario', 'legal.nif', 'corporacion', 'servicios', 'pueblo', 'fotos', 'comarca'].filter(c => de(B, c) !== null);
    if (noNulos.length) malos.push('tendrían que ser null: ' + noNulos.join(', '));
    if ((B.cifras || []).some(c => !c.fuente || c.valor == null)) malos.push('una cifra sin fuente');
    /* ALTA: lo que falta, por orden de importancia, y el mapa pendiente (no hay copia de Overpass) */
    const alta = fs.existsSync(path.join(sal, 'ALTA-segura-de-leon.md')) ? fs.readFileSync(path.join(sal, 'ALTA-segura-de-leon.md'), 'utf8') : '';
    const pos = ['**horario**', '**legal.nif**', '**corporacion**', '**servicios**', '**fotos**', '**pueblo**', '**mapa del término**'].map(x => alta.indexOf(x));
    if (!alta || pos.some(p => p < 0) || pos.some((p, i) => i && p < pos[i - 1])) malos.push('ALTA-segura-de-leon.md sin la lista en orden (' + pos.join(',') + ')');
    if (!/## Contradicciones entre fuentes/.test(alta) || !/Pista: Wikidata da como alcalde/.test(alta)) malos.push('el alcalde de Wikidata tiene que ir a ALTA como pista, no al borrador');
    /* por nombre, lo mismo */
    const rn = nm('Segura de León', '--salida', path.join(tmp, 'nombre'), '--sin-red');
    if (rn.status !== 0 || JSON.parse(fs.readFileSync(path.join(tmp, 'nombre', 'municipio.json'), 'utf8')).ine !== '06124') malos.push('por nombre no da el 06124 → ' + (rn.stderr || rn.stdout).slice(-160));
    /* dos fuentes que no casan (los habitantes del mismo año): no se elige */
    const otra = path.join(tmp, 'respuestas');
    fs.cpSync(path.join(RAIZ, 'pruebas/alta/06124'), otra, { recursive: true });
    const fd = path.join(otra, 'wikidata-Q1354528-declaraciones.json'), j = JSON.parse(fs.readFileSync(fd, 'utf8'));
    const anio = Math.max(...JSON.parse(fs.readFileSync(path.join(otra, 'ine-tabla-2859-06124.json'), 'utf8')).flatMap(s => s.Data.map(d => d.Anyo)));
    const st = j.results.bindings.find(b => /qualifier\/P585$/.test(b.p.value)).st.value;
    for (const b of j.results.bindings) if (b.st.value === st) { if (/qualifier\/P585$/.test(b.p.value)) b.o.value = anio + '-01-01T00:00:00Z'; if (/statement\/P1082$/.test(b.p.value)) b.o.value = '1234'; }
    fs.writeFileSync(fd, JSON.stringify(j));
    const rc = nm('06124', '--salida', path.join(tmp, 'contradiccion'), '--desde', otra);
    const Bc = rc.status === 0 ? JSON.parse(fs.readFileSync(path.join(tmp, 'contradiccion', 'municipio.json'), 'utf8')) : {};
    const altaC = rc.status === 0 ? fs.readFileSync(path.join(tmp, 'contradiccion', 'ALTA-segura-de-leon.md'), 'utf8') : '';
    if (Bc.habitantes !== null || !/\*\*habitantes\*\*: 1758 [^\n]*· 1234 /.test(altaC)) malos.push('con los habitantes en contra, elige o no lo dice → ' + JSON.stringify(Bc.habitantes));
    /* nunca pisa: ni la raíz ni un municipio.json que no sea un borrador */
    const enRaiz = nm('06124', '--salida', RAIZ, '--sin-red');
    const ajeno = path.join(tmp, 'ajeno'); fs.mkdirSync(ajeno); fs.copyFileSync(path.join(RAIZ, 'pruebas/segura-de-leon/municipio.json'), path.join(ajeno, 'municipio.json'));
    const sobreAjeno = nm('06124', '--salida', ajeno, '--sin-red');
    if (enRaiz.status === 0 || sobreAjeno.status === 0 || huella(path.join(RAIZ, 'municipio.json')) !== antes || huella(path.join(ajeno, 'municipio.json')) !== huella(path.join(RAIZ, 'pruebas/segura-de-leon/municipio.json'))) malos.push('pisa un municipio.json que no es suyo');
    comprobar(!malos.length, 'v3c F26: nuevo-municipio.mjs --sin-red con Segura de León (06124, también por nombre): los datos casan con el reskin hecho a mano, cada uno con su fuente y su fecha; horario, NIF, corporación y servicios quedan null; ALTA-segura-de-leon.md los pide en orden; si dos fuentes no casan, no elige; nunca pisa un municipio.json ajeno' + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));

    /* aplicar.mjs con el borrador: se niega diciendo qué falta; completado lo obligatorio, escribe */
    const dest = copiar();
    try {
      for (const d of ['contenido', 'media']) { fs.rmSync(path.join(dest, d), { recursive: true, force: true }); fs.cpSync(path.join(RAIZ, 'pruebas/segura-de-leon', d), path.join(dest, d), { recursive: true }); }
      for (const f of fs.readdirSync(path.join(dest, 'marca')).filter(f => /^(perfil|plano|termino)\./.test(f))) fs.rmSync(path.join(dest, 'marca', f));
      for (const f of fs.readdirSync(path.join(RAIZ, 'pruebas/segura-de-leon/marca'))) fs.copyFileSync(path.join(RAIZ, 'pruebas/segura-de-leon/marca', f), path.join(dest, 'marca', f));
      fs.copyFileSync(path.join(sal, 'municipio.json'), path.join(dest, 'municipio.json'));
      const a1 = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      const dice = a1.stderr + a1.stdout;
      const niega = a1.status === 1 && ['«horario.texto»', '«legal.nif»', '«servicios»'].every(x => dice.includes(x)) && /ALTA-segura-de-leon\.md/.test(dice) && !/TypeError|at file:/.test(dice);
      const C = JSON.parse(fs.readFileSync(path.join(sal, 'municipio.json'), 'utf8'));
      Object.assign(C, { horario: { texto: 'Lunes a viernes, de 9:00 a 14:00', tramos: [{ dias: [1, 2, 3, 4, 5], de: '09:00', a: '14:00' }], ejemplo: true }, servicios: S.servicios });
      C.legal.nif = S.legal.nif;
      fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(C, null, 2));
      const a2 = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
      const escribe = a2.status === 0 && fs.readFileSync(path.join(dest, 'index.html'), 'utf8').includes('Segura de León');
      comprobar(niega && escribe, 'v3c F26: aplicar.mjs con el borrador tal cual se niega y dice qué falta (horario, NIF, servicios; y dónde está la lista), sin romperse; con eso completado, escribe la web de Segura de León' +
        (niega && escribe ? '' : ' → ' + JSON.stringify({ niega, s1: a1.status, d1: dice.slice(-300), s2: a2.status, d2: (a2.stderr || a2.stdout).slice(-300) })));
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/* ═════════════ v3c · transparencia: transparencia.html (F22), empleo público (F23) y «Escríbanos» (F24) ═════════════ */
async function v3cTransparencia() {
  const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  const axeEn = async (page, nombre, viol) => (await new AxeBuilder({ page }).withTags(AXE).analyze()).violations.forEach(v => viol.push(nombre + ': ' + v.id + ' ' + v.nodes[0].target.join(' ')));
  const APARTADOS = ['organizacion', 'normativa', 'presupuestos', 'cuentas', 'contratos', 'convenios', 'subvenciones', 'retribuciones', 'acceso'];
  /* las anclas de los artículos que cita la página, leídos en el BOE (04/10/2026) */
  const LEYES = /^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-2013-(12887(#a(5|6|7|8|12|17|20|24))?|6050(#a(5|1-6|1-7))?)$/;
  /* lo que la página puede enlazar en un apartado: lo de la sede (con su patrón), su perfil del contratante,
     una página de esta web y lo que diga municipio.json → transparencia (comprobado a mano). Nada más */
  const permitidos = (m, raiz) => {
    const urls = new Set();
    if (m.sede.perfil_contratante) urls.add(m.sede.perfil_contratante);
    const t = m.transparencia || {};
    if (t.portal && t.portal.url) urls.add(t.portal.url);
    for (const a of Object.values(t.apartados || {})) for (const e of a.enlaces || []) urls.add(e.url);
    const base = m.sede.base.replace(/\/$/, '');
    const patron = m.sede.tipo === 'gestiona'
      ? new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/(catalog/t/[0-9a-f-]{36}|board|transparency|contractor-profile-list))?$')
      : new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/(portal|sede)/[A-Za-z]+\\.do\\?[\\w=&%.-]+)?$');
    return href => urls.has(href) || patron.test(href) || href.startsWith('#') || (/^[a-z0-9-]+\.html(#[\w-]+)?$/.test(href) && fs.existsSync(path.join(raiz, href.split('#')[0])));
  };
  /* los enlaces de cada apartado de una transparencia.html (texto), sin los de las leyes */
  const leerApartados = html => [...html.matchAll(/data-apartado="([a-z]+)"[\s\S]*?(?=data-apartado="|<section class="seccion" aria-labelledby="t-transparencia-leyes")/g)].map(([bloque, id]) => ({
    id, enlaces: [...bloque.matchAll(/<a [^>]*href="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&')).filter(h => !/boe\.es/.test(h)),
    leyes: [...bloque.matchAll(/<a [^>]*href="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&')).filter(h => /boe\.es/.test(h)),
    pendiente: (bloque.match(/<p class="pendiente" data-pendiente="[a-z]+"><b class="pendiente__marca">Pendiente:<\/b> ([^<]+)/) || [])[1] || null,
    sin: /class="transparencia__sin"/.test(bloque) }));

  /* ── F22 · 1. la página de Ribera: cada apartado, cada enlace real o un hueco «Pendiente», las leyes ── */
  {
    const malos = [], viol = [];
    const h = fs.existsSync(path.join(RAIZ, 'transparencia.html')) ? leer(RAIZ, 'transparencia.html') : '';
    if (!h) malos.push('no hay transparencia.html');
    const aps = leerApartados(h), ok = permitidos(M, RAIZ), datos = (M.transparencia && M.transparencia.apartados) || {};
    if (aps.map(a => a.id).join() !== APARTADOS.join()) malos.push('apartados: ' + aps.map(a => a.id).join());
    for (const a of aps) {
      const raros = a.enlaces.filter(x => !ok(x));
      if (raros.length) malos.push(a.id + ': enlace que no es del municipio ni de los datos: ' + raros.join(' '));
      if (!a.leyes.length || a.leyes.some(x => !LEYES.test(x))) malos.push(a.id + ': las leyes ' + JSON.stringify(a.leyes));
      const quiere = M.propuesta !== false && datos[a.id] && datos[a.id].pendiente;
      if ((quiere || null) !== (a.pendiente ? a.pendiente.replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null)) malos.push(a.id + ': pendiente ' + JSON.stringify(a.pendiente) + ' (en los datos: ' + JSON.stringify(quiere) + ')');
      /* nunca un apartado mudo: o un enlace, o el portal, o pedirlo (y el hueco si no consta) */
      if (!a.enlaces.length && !a.sin && !a.pendiente) malos.push(a.id + ': ni enlace ni hueco');
    }
    for (const [id, d] of Object.entries(datos)) for (const e of d.enlaces || []) if (!h.includes('href="' + e.url.replace(/&/g, '&amp;') + '"')) malos.push(id + ': falta el enlace de los datos ' + e.url);
    const acceso = aps.find(a => a.id === 'acceso');
    const solicitud = (M.tramites.todos || []).find(t => /acceso a la informaci[oó]n p[uú]blica/i.test(t.nombre) && t.vigente !== false);
    if (solicitud && !(acceso && acceso.enlaces.some(x => x.endsWith('/catalog/t/' + solicitud.id)))) malos.push('«Pedir información» no lleva a la solicitud de acceso del catálogo');
    /* enlazada desde el pie y la franja de la sede de todas las páginas; en el menú, no */
    const sinEnlace = PAGINAS.filter(p => { const x = leer(RAIZ, p); return !/<ul class="pie__lista">[\s\S]*?href="transparencia\.html"/.test(x) || !/<ul class="sede-franja__lista">[\s\S]*?href="transparencia\.html"/.test(x); });
    if (sinEnlace.length) malos.push('sin enlace en el pie o en la franja: ' + sinEnlace.slice(0, 4).join(', '));
    if (/class="menu[\s\S]*?href="transparencia\.html"[\s\S]*?<\/nav>/.test((leer(RAIZ, 'index.html').match(/<nav class="menu[\s\S]*?<\/nav>/) || [''])[0])) malos.push('está en el menú');
    for (const ancho of [1280, 390]) {
      const { ctx, page, errores } = await nueva({ viewport: { width: ancho, height: 900 } });
      await ir(page, 'transparencia.html');
      const r = await page.evaluate(() => ({ pendientes: [...document.querySelectorAll('.pendiente')].filter(e => e.checkVisibility()).length, desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        indice: !!document.querySelector('.indice') }));
      if (r.desborda) malos.push('desborda a ' + ancho);
      if (r.pendientes !== (M.propuesta !== false ? Object.values(datos).filter(d => d.pendiente).length : 0)) malos.push('huecos «Pendiente» visibles: ' + r.pendientes);
      await axeEn(page, 'transparencia a ' + ancho, viol);
      if (errores.length) malos.push('consola: ' + errores.slice(0, 2).join(' | '));
      if (CAPTURAS) await page.screenshot({ path: captura('v3c-transparencia-' + ancho + '.png'), fullPage: true });
      await ctx.close();
    }
    comprobar(!malos.length && !viol.length, `v3c F22 · transparencia.html: los ${APARTADOS.length} apartados de la ley en su orden, cada enlace es del municipio (sede, perfil del contratante, esta web o los ${Object.values(datos).reduce((n, d) => n + (d.enlaces || []).length, 0)} comprobados en municipio.json), lo que no consta es un hueco «Pendiente» (${Object.values(datos).filter(d => d.pendiente).length}), cada apartado cita sus artículos del BOE, «Pedir información» lleva a la solicitud de acceso del catálogo, enlazada desde el pie y la franja de la sede de las ${PAGINAS.length} páginas y no desde el menú, sin desborde y 0 violaciones de axe a 1280 y 390 px` + (malos.length ? ' → ' + malos.slice(0, 5).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 3).join(' | ') : ''));
  }

  /* ── F22 · 2. sin `transparencia` en municipio.json (y sin portal en la sede): lo general, sin inventar.
     Y la web oficial ("propuesta": false): ningún hueco «Pendiente», cada apartado con su explicación y su enlace ── */
  {
    const malos = [];
    for (const caso of ['sin datos', 'sin portal', 'web oficial']) {
      const dest = copiar();
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
        if (caso === 'web oficial') m.propuesta = false; else delete m.transparencia;
        /* una sede de la Diputación sin portal de transparencia (como Monesterio) */
        if (caso === 'sin portal') m.sede = { tipo: 'diputacion', base: 'https://sede.ejemplo.es', ent_id: 1, opc: { tablon: 175 }, instancia_general: 'https://sede.ejemplo.es/sede/fichaInformativa.do?asu_cod=1&codVerif=x' };
        fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(m, null, 2));
        if (caso === 'sin portal') fs.writeFileSync(path.join(dest, 'contenido', 'tablon.json'), JSON.stringify({ entradas: [], excluidas: 0 }));
        const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio'], { encoding: 'utf8', cwd: dest });
        if (ap.status !== 0) { malos.push(caso + ': aplicar.mjs falla → ' + (ap.stderr || ap.stdout).slice(-300)); continue; }
        const h = fs.readFileSync(path.join(dest, 'transparencia.html'), 'utf8'), ok = permitidos(m, dest);
        const aps = leerApartados(h);
        const raros = aps.flatMap(a => a.enlaces.filter(x => !ok(x)).map(x => a.id + ': ' + x));
        if (raros.length) malos.push(caso + ': enlaces inventados ' + raros.slice(0, 3).join(' '));
        if (caso === 'web oficial') {
          const srv = crearServidor(dest, null);
          await new Promise(r => srv.listen(0, '127.0.0.1', r));
          const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
          const pg = await ctx.newPage();
          await pg.goto('http://127.0.0.1:' + srv.address().port + '/transparencia.html', { waitUntil: 'networkidle' });
          const vis = await pg.evaluate(() => ({ pendientes: [...document.querySelectorAll('.pendiente, .pendiente__marca')].filter(e => e.checkVisibility()).length,
            texto: /Pendiente:/.test(document.body.innerText) }));
          await ctx.close(); srv.close();
          if (vis.pendientes || vis.texto || /Pendiente:/.test(h)) malos.push('web oficial: se ve un «Pendiente»');
          if (aps.some(a => a.id !== 'acceso' && !a.enlaces.length && !a.sin)) malos.push('web oficial: algún apartado sin explicación ni enlace');
          continue;
        }
        const deRibera = Object.values((M.transparencia && M.transparencia.apartados) || {}).flatMap(d => (d.enlaces || []).map(e => e.url)).filter(u => h.includes(u.replace(/&/g, '&amp;')));
        if (deRibera.length) malos.push(caso + ': quedan enlaces de los datos de ' + M.nombre);
        if (/class="pendiente"/.test(h)) malos.push(caso + ': sale un hueco «Pendiente» sin datos');
        if (aps.length !== APARTADOS.length || aps.some(a => a.id !== 'acceso' && !a.enlaces.length && !a.sin)) malos.push(caso + ': algún apartado mudo');
        if (caso === 'sin portal' && (!/no tiene, de momento, un portal de transparencia/.test(h) || !aps.some(a => a.sin && /href="#t-transparencia-pedir"/.test(h)))) malos.push('sin portal: no lo dice o no manda a pedirlo');
        if (caso === 'sin datos' && !/class="boton boton--marca" href="[^"]*\/transparency"/.test(h)) malos.push('sin datos: no lleva al portal de la sede');
      } finally { fs.rmSync(dest, { recursive: true, force: true }); }
    }
    comprobar(!malos.length, 'v3c F22 · sin «transparencia» en municipio.json, transparencia.html explica lo general, enlaza solo la sede, el perfil del contratante y esta web, sin huecos «Pendiente» ni enlaces de otro municipio; con una sede de la Diputación sin portal, lo dice y manda a pedirlo; en la web oficial ("propuesta": false), ni un «Pendiente» visible y cada apartado con su explicación y su enlace' + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* ── F23 · 1. la detección del empleo en Node: títulos reales y trampas ── */
  {
    const T = await import(pathToFileURL(path.join(RAIZ, 'scripts/lib/tablon.mjs')).href);
    const malos = [];
    for (const [e, es, fuente] of T.CASOS_EMPLEO) {
      const x = { descripcion: '', procedimiento: '', categoria: '', ...e };
      if (!!T.motivoEmpleo(x) !== es || (T.temaDe(x) === 'Empleo') !== es) malos.push((es ? 'no ve: ' : 've de más: ') + e.titulo.slice(0, 50) + ' (' + fuente + ')');
    }
    /* lo que lleva nombres sigue fuera antes de ponerle tema (las listas de una bolsa no llegan a «Empleo») */
    if (!T.motivoPersonal({ titulo: 'Lista provisional de aspirantes admitidos y excluidos de la bolsa de trabajo', descripcion: '', procedimiento: '', categoria: '' })) malos.push('una lista de admitidos de una bolsa no se excluye');
    /* una persona lo corrige con `tema` y `tema_manual` (se conserva al refrescar) */
    const f = T.fusionar([{ url: 'u', titulo: 'Anuncio', descripcion: '', procedimiento: '', categoria: '' }], [{ url: 'u', tema: 'Empleo', tema_manual: true }]);
    if (f[0].tema !== 'Empleo') malos.push('el tema manual no se conserva');
    const reales = T.CASOS_EMPLEO.filter(c => !/trampa|inventado/.test(c[2])).length;
    comprobar(!malos.length, `v3c F23 · empleo en el tablón (Node): ${T.CASOS_EMPLEO.length} títulos (${reales} reales del BOP y de los tablones, el resto trampas) se clasifican bien, las listas con nombres siguen fuera y un tema puesto a mano se conserva` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));
  }

  /* ── F23 · 2. la ficha «Empleo» de «Hoy» (Node, fechas fijas) ── */
  {
    const V = cargarVivo(), malos = [];
    const hoy = V.ahoraEn('Europe/Madrid', new Date('2026-10-14T10:00:00+02:00'));
    const rutas = { tramites: 't.html', avisos: 'avisos.html', agenda: 'a.html', noticia: 'n-{id}.html', media: 'media/' };
    const base = { nombre_corto: 'P', horario: { texto: 'x', tramos: [] }, agenda: [], noticias: [], avisos: [], tablon: { entradas: [] }, rutas, tramites_sede: 1 };
    const oferta = o => ({ fecha: '2026-10-05', tema: 'Empleo', titulo: 'T', titulo_claro: 'Bolsa de socorristas', url: 'https://sede/x', expediente: '9/2026', ...o });
    const ficha = D => (V.pintar('hoy', { ...base, ...D }, hoy).match(/<li class="hoy__fila hoy__fila--empleo"[\s\S]*?<\/li>/) || [null])[0];
    const abierta = ficha({ tablon: { entradas: [oferta({ plazo_fin: '2026-10-20' }), oferta({ titulo_claro: 'Otra', url: 'https://sede/y', plazo_fin: '2026-10-30' })] } });
    if (!abierta || !/Empleo/.test(abierta) || !/href="https:\/\/sede\/x"/.test(abierta) || !/Quedan 6 días/.test(abierta) || !/href="avisos\.html\?tema=Empleo#t-tablon-todo">Las 2 ofertas/.test(abierta)) malos.push('con dos ofertas abiertas: ' + abierta);
    if (ficha({ tablon: { entradas: [oferta({ plazo_fin: '2026-10-10' })] } })) malos.push('sale con el plazo cerrado');
    if (ficha({ tablon: { entradas: [oferta({ plazo_inicio: '2026-10-20' })] } })) malos.push('sale con el plazo sin abrir');
    if (ficha({ tablon: { entradas: [oferta({})] } })) malos.push('sale sin plazo');
    if (ficha({ tablon: { entradas: [oferta({ tema: 'Ayudas', plazo_fin: '2026-10-20' })] } })) malos.push('sale con algo que no es empleo');
    const propio = ficha({ avisos: [{ id: 'e', fecha: '2026-10-05', tema: 'Empleo público', titulo: 'Oferta', plazo_fin: '2026-10-20', ejemplo: true }] });
    if (!propio || !/data-dato-ejemplo="aviso:e"/.test(propio) || !/class="ejemplo">Ejemplo/.test(propio) || !/href="avisos\.html#aviso-e"/.test(propio)) malos.push('aviso propio de ejemplo: ' + propio);
    const tab = V.pintar('tablon', { ...base, avisos: [{ id: 'e', fecha: '2026-10-05', tema: 'empleo', titulo: 'Oferta' }] }, hoy);
    if (!/data-tema="Empleo"[\s\S]*<span class="chip chip--empleo"><svg[^>]*><use href="#i-empleo"\/><\/svg>Empleo<\/span>/.test(tab)) malos.push('el chip de empleo (o el tema que se junta) en el tablón');
    comprobar(!malos.length, 'v3c F23 · la ficha «Empleo» de «Hoy» (Node): sale con una oferta de plazo abierto (la que cierra antes, con su chip, su enlace y «Las N ofertas…» a avisos.html?tema=Empleo) y no sale con el plazo cerrado, sin abrir, sin plazo ni con otro tema; «Ejemplo» si lo es; el chip con maletín y «Empleo público» junto a «Empleo»' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* ── F23 · 3. en el navegador: la muestra de Ribera, la ficha, el filtro desde «?tema=Empleo» ── */
  {
    const malos = [], viol = [];
    const muestra = contenido('avisos').avisos.find(a => !a.oculto && /^empleo/i.test(a.tema || '') && a.plazo_fin);
    const realEmpleo = (contenido('tablon').entradas || []).some(t => !t.oculto && /^empleo/i.test(t.tema || ''));
    if (muestra && !muestra.ejemplo && !realEmpleo) malos.push('el empleo de muestra no lleva «ejemplo»');
    if (muestra) {
      const antes = new Date(muestra.plazo_fin + 'T10:00:00+01:00'); antes.setUTCDate(antes.getUTCDate() - 3);
      const despues = new Date(muestra.plazo_fin + 'T10:00:00+01:00'); despues.setUTCDate(despues.getUTCDate() + 2);
      for (const [cuando, debe] of [[antes, true], [despues, false]]) {
        const { ctx, page, errores } = await nueva({ viewport: { width: 1280, height: 900 } });
        await page.clock.setFixedTime(cuando);
        await ir(page, 'index.html');
        const r = await page.evaluate(() => { const f = document.querySelector('.hoy__fila--empleo'); return f ? { visible: f.checkVisibility(), ejemplo: !!f.querySelector('.ejemplo'), enlace: f.querySelector('.hoy__valor a').getAttribute('href'), todo: f.querySelector('.hoy__nota a').getAttribute('href') } : null; });
        if (debe && (!r || !r.visible || !r.ejemplo || r.enlace !== 'avisos.html#aviso-' + muestra.id)) malos.push('con el plazo abierto: ' + JSON.stringify(r));
        if (!debe && r) malos.push('con el plazo cerrado sigue la ficha');
        if (debe) {
          await axeEn(page, 'portada con la ficha', viol);
          await Promise.all([page.waitForURL(/avisos\.html/), page.click('.hoy__fila--empleo .hoy__nota a')]);
          await page.waitForLoadState('networkidle');
          const f = await page.evaluate(() => { const c = document.querySelector('#t-tablon-todo').closest('section').querySelector('.tablon');
            const filas = [...c.querySelectorAll('.tablon__fila')].filter(x => !x.hidden);
            return { pulsado: (c.querySelector('.filtro[aria-pressed="true"]') || {}).textContent, filas: filas.length, temas: [...new Set(filas.map(x => x.getAttribute('data-tema')))], url: location.pathname + location.search,
              chip: !!c.querySelector('.tablon__fila:not([hidden]) .chip--empleo svg') }; });
          if (f.pulsado !== 'Empleo' || !f.filas || f.temas.join() !== 'Empleo' || !f.chip || !/avisos\.html\?tema=Empleo/.test(f.url)) malos.push('«Todo el empleo» → ' + JSON.stringify(f));
          /* y el filtro, a mano: «Todos» vuelve a enseñarlo todo */
          await page.click('.filtro[data-tema=""]');
          if (await page.evaluate(() => [...document.querySelectorAll('#t-tablon-todo ~ .tablon .tablon__fila')].filter(x => !x.hidden).length) <= f.filas) malos.push('«Todos» no enseña más que «Empleo»');
          await axeEn(page, 'avisos con el filtro de empleo', viol);
        }
        if (errores.length) malos.push('consola: ' + errores.slice(0, 2).join(' | '));
        await ctx.close();
      }
    }
    comprobar(!malos.length && !viol.length, muestra ? `v3c F23 · empleo en la web: «${muestra.titulo}» (${muestra.ejemplo ? 'de muestra, con «Ejemplo»' : 'real'}) sale en la ficha «Empleo» de «Hoy» mientras su plazo está abierto y no después; «Todo el empleo» abre Avisos con el filtro «Empleo» puesto, solo filas de empleo y su chip con maletín; 0 violaciones de axe` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 3).join(' | ') : '')
      : 'v3c F23 · empleo en la web: no hay ningún aviso de empleo con plazo (ni real ni de muestra)' + (malos.length ? ' → ' + malos.join(' | ') : ''));
  }

  /* ── F24 · «Escríbanos»: sin JS, validación, el mailto, copiar, axe y sin correo no sale ── */
  {
    const correo = M.escribanos === false ? null : (M.escribanos && M.escribanos.correo) || M.contacto.correo;
    const malos = [], viol = [];
    const h = fs.existsSync(path.join(RAIZ, 'escribanos.html')) ? leer(RAIZ, 'escribanos.html') : '';
    if (correo && !h) malos.push('con correo no hay escribanos.html');
    const formHtml = (h.match(/<form\b[^>]*data-escribanos[^>]*>/) || [''])[0];
    if (!formHtml.includes('action="mailto:' + correo + '?subject=') || !/method="post"/.test(formHtml) || !/enctype="text\/plain"/.test(formHtml) || /novalidate/.test(formHtml)) malos.push('respaldo: ' + formHtml);
    for (const n of ['tipo', 'asunto', 'mensaje']) if (!new RegExp('name="' + n + '"[^>]*required').test(h)) malos.push('sin JS, «' + n + '» no es obligatorio');
    if (!/href="escribanos\.html"/.test(leer(RAIZ, 'contacto.html'))) malos.push('Contacto no enlaza «Escríbanos»');
    /* lo que tiene efectos legales, al registro de la sede, con su enlace */
    const registro = (h.match(/<div class="escribanos-registro">[\s\S]*?<\/ul>/) || [''])[0];
    const instancia = M.sede.tipo === 'gestiona' ? sedeBase + '/catalog/t/' + M.sede.instancia_general : M.sede.instancia_general;
    if (!/no es un registro/.test(registro) || !registro.includes('href="' + instancia.replace(/&/g, '&amp;') + '"')) malos.push('no dice que lo legal va por el registro de la sede');
    const sj = await navegador.newContext({ javaScriptEnabled: false });
    const pj = await sj.newPage();
    await pj.goto(BASE + 'escribanos.html', { waitUntil: 'networkidle' });
    const sinJs = await pj.evaluate(() => ({ form: document.querySelector('[data-escribanos]').checkVisibility(), listo: document.querySelector('[data-escribanos-listo]').checkVisibility() }));
    await sj.close();
    if (!sinJs.form || sinJs.listo) malos.push('sin JS: ' + JSON.stringify(sinJs));

    const { ctx, page, errores } = await nueva({ viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
    await ir(page, 'escribanos.html');
    await page.click('[data-escribanos] [type="submit"]');
    const errs = await page.evaluate(() => {
      const r = document.querySelector('[data-escribanos-errores]');
      const enlazado = el => { const err = (el.getAttribute('aria-describedby') || '').split(/\s+/).map(i => document.getElementById(i)).find(x => x && x.classList.contains('campo__error'));
        return el.getAttribute('aria-invalid') === 'true' && !!err && err.checkVisibility() && err.textContent.trim().length > 10; };
      return { visible: r.checkVisibility(), foco: document.activeElement === r, enlaces: [...r.querySelectorAll('a')].map(a => a.getAttribute('href')), primero: '#' + document.querySelector('input[name="tipo"]').id,
        enlazados: [document.getElementById('campo-tipo'), document.getElementById('campo-asunto'), document.getElementById('campo-mensaje')].map(enlazado), opcional: document.getElementById('campo-correo').hasAttribute('aria-invalid') };
    });
    if (!errs.visible || !errs.foco || errs.enlaces.join() !== [errs.primero, '#campo-asunto', '#campo-mensaje'].join() || errs.enlazados.includes(false) || errs.opcional) malos.push('validación vacía: ' + JSON.stringify(errs));
    await axeEn(page, 'escríbanos con errores', viol);
    await page.click('[data-escribanos-errores] a[href="#campo-mensaje"]');
    if (!(await page.evaluate(() => document.activeElement.id === 'campo-mensaje'))) malos.push('el enlace del resumen no lleva el foco al campo');
    /* un teléfono opcional mal escrito también se avisa */
    await page.check('input[name="tipo"][value="Sugerencia"]');
    await page.fill('#campo-asunto', 'Bancos en la plaza');
    await page.fill('#campo-mensaje', 'Estaría bien poner más bancos.');
    await page.fill('#campo-telefono', '12ab');
    await page.click('[data-escribanos] [type="submit"]');
    const e2 = await page.evaluate(() => [...document.querySelectorAll('[data-escribanos-errores] a')].map(a => a.getAttribute('href')).join());
    if (e2 !== '#campo-telefono') malos.push('teléfono mal escrito: ' + e2);
    const datos = { asunto: 'Bancos & sombra; ¿en la plaza?', mensaje: 'Estaría bien poner más bancos.\nY algo de sombra & agua; ¿se puede?', nombre: 'Vecino de Prueba', telefono: '600 123 456', correo: 'vecino@ejemplo.es' };
    await page.fill('#campo-asunto', datos.asunto); await page.fill('#campo-mensaje', datos.mensaje);
    await page.fill('#campo-nombre', datos.nombre); await page.fill('#campo-telefono', datos.telefono); await page.fill('#campo-correo', datos.correo);
    await page.click('[data-escribanos] [type="submit"]');
    const ok = await page.evaluate(() => { const l = document.querySelector('[data-escribanos-listo]');
      return { visible: l.checkVisibility(), foco: document.activeElement === l, titulo: l.querySelector('h3').textContent, formOculto: !document.querySelector('[data-escribanos]').checkVisibility(),
        href: document.querySelector('[data-escribanos-mailto]').getAttribute('href'), texto: document.querySelector('[data-escribanos-texto]').value }; });
    const q = ok.href.indexOf('?'), dest = ok.href.slice(7, q), params = {};
    for (const par of ok.href.slice(q + 1).split('&')) { const [k, v] = par.split('='); params[k] = decodeURIComponent(v); }
    const cuerpo = params.body || '';
    if (!ok.visible || !ok.foco || !ok.formOculto || ok.titulo !== 'Su mensaje está listo') malos.push('listo: ' + JSON.stringify({ ...ok, href: undefined, texto: undefined }));
    if (dest !== correo || !/^mailto:[^?]+\?subject=[^&]+&body=[^&]+$/.test(ok.href) || /[\s<>"]/.test(ok.href)) malos.push('mailto mal formado: ' + ok.href.slice(0, 120));
    if (params.subject !== 'Sugerencia: ' + datos.asunto) malos.push('asunto: ' + params.subject);
    const faltan = ['Sugerencia', datos.asunto, ...datos.mensaje.split('\n'), datos.nombre, datos.telefono, datos.correo].filter(x => !cuerpo.includes(x));
    if (faltan.length) malos.push('al cuerpo le falta: ' + faltan.join(' | '));
    if (/[^\r]\n/.test(cuerpo) || !cuerpo.includes('\r\n')) malos.push('el cuerpo no usa CRLF');
    if (!ok.texto.includes(params.subject) || !ok.texto.includes(correo)) malos.push('el texto para copiar no lleva el asunto y el destinatario');
    await axeEn(page, 'escríbanos listo', viol);
    await page.click('[data-escribanos-copiar]');
    await page.waitForFunction(() => document.querySelector('[data-escribanos-copiar-estado]').textContent.length > 5, null, { timeout: 3000 }).catch(() => malos.push('«Copiar el texto» no dice nada'));
    /* largo: lo avisa; y «Cambiar algo» vuelve al formulario con lo escrito */
    await page.click('[data-escribanos-volver]');
    if (await page.inputValue('#campo-asunto') !== datos.asunto) malos.push('al volver se pierde lo escrito');
    await page.fill('#campo-mensaje', 'Más bancos en la plaza. '.repeat(90));
    await page.click('[data-escribanos] [type="submit"]');
    const largo = await page.evaluate(() => ({ aviso: document.querySelector('[data-escribanos-largo]').checkVisibility(), n: document.querySelector('[data-escribanos-mailto]').href.length, max: window.Escribanos.LARGO_MAX }));
    if (!(largo.n > largo.max) || !largo.aviso) malos.push('texto largo: ' + JSON.stringify(largo));
    if (errores.length) malos.push('consola: ' + errores.slice(0, 2).join(' | '));
    await ctx.close();

    /* sin correo («escribanos»: false, o sin contacto.correo con --forzar) no se genera ni se enlaza */
    for (const caso of ['escribanos: false', 'sin contacto.correo']) {
      const d2 = copiar();
      try {
        const m = JSON.parse(fs.readFileSync(path.join(d2, 'municipio.json'), 'utf8'));
        if (caso === 'escribanos: false') m.escribanos = false; else { delete m.escribanos; m.contacto.correo = ''; }
        fs.writeFileSync(path.join(d2, 'municipio.json'), JSON.stringify(m, null, 2));
        const ap = spawnSync('node', [path.join(d2, 'scripts/aplicar.mjs'), '--sin-og', '--silencio', ...(caso === 'sin contacto.correo' ? ['--forzar'] : [])], { encoding: 'utf8', cwd: d2 });
        const restos = fs.readdirSync(d2).filter(f => f.endsWith('.html')).filter(f => /href="escribanos\.html/.test(fs.readFileSync(path.join(d2, f), 'utf8')));
        if (ap.status !== 0 || fs.existsSync(path.join(d2, 'escribanos.html')) || restos.length) malos.push(caso + ': ' + JSON.stringify({ status: ap.status, existe: fs.existsSync(path.join(d2, 'escribanos.html')), restos, err: (ap.stderr || '').slice(-200) }));
      } finally { fs.rmSync(d2, { recursive: true, force: true }); }
    }
    comprobar(!malos.length && !viol.length, `v3c F24 · «Escríbanos»: respaldo sin JS (form mailto text/plain con tipo, asunto y mensaje obligatorios), dice que lo legal va por el registro de la sede, validación accesible (resumen con el foco y un enlace por error, aria-invalid y error enlazado), un mailto a ${correo} con «Tipo: asunto» y el cuerpo codificado (todos los campos, CRLF), «Su mensaje está listo» con el foco, «Copiar el texto», aviso si es largo, enlazada desde Contacto, 0 violaciones de axe con errores y lista, y sin correo no se genera` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 3).join(' | ') : ''));
  }
}

/* ═════════════ v3c · guia: «Publicar en la web», crear-hoja.gs y la propuesta ═════════════
   F19. publicar.html: noindex (también con indexar: true), fuera del menú y enlazada en el pie de todas
        las páginas; sin hoja.formularios no hay botones falsos (sale «Se activa al montar la hoja…») y,
        en una copia con las URLs, los botones van a ellas y las URLs no salen en ninguna otra página;
        una URL sin https hace que aplicar.mjs se niegue. Las muestras pintadas con las piezas reales y
        sin enlaces; el simulador (título urgente → franja roja con ese título y el resumen para el
        lector de pantalla; programado → ámbar; informativo o sin «Caduca» → sin franja y la nota), sin
        ninguna petición de red, con teclado y axe 0. Impresa: una A4 y sin lo interactivo.
   F18. crear-hoja.gs: compila y, ejecutado contra una imitación de la API de Apps Script, crea los tres
        formularios con los títulos de pregunta que lee la web (los de plantillas-hoja/*.csv y
        comprobar-hoja.mjs), las pestañas publicables con QUERY sin la marca temporal y el bloque «hoja».
   F21. La propuesta enlaza al simulador. */
async function v3cGuia() {
  const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  const AVISO_SIN = 'Se activa al montar la hoja (lo hace quien mantiene la web)';
  const clave = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '_');   /* como js/main.js */

  /* ── 1. la página, en el HTML ── */
  const malos = [];
  const html = fs.existsSync(path.join(RAIZ, 'publicar.html')) ? leer(RAIZ, 'publicar.html') : '';
  if (!html) malos.push('no existe publicar.html');
  if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) malos.push('publicar.html sin noindex');
  /* v3c · F18 bis: dice que hace falta una cuenta autorizada y nada de que cualquiera con el enlace publica */
  if (!html.includes('Para publicar hay que entrar con una cuenta de Google autorizada por el Ayuntamiento.') || /cualquiera con el enlace|quien tenga el enlace/i.test(html)) malos.push('publicar.html no explica las cuentas autorizadas');
  for (const p of PAGINAS) {
    const h = leer(RAIZ, p);
    const menu = (h.match(/<ul class="menu__lista">[\s\S]*?<\/ul>/) || [''])[0], pie = (h.match(/<footer[\s\S]*<\/footer>/) || [''])[0];
    if (/publicar\.html/.test(menu)) malos.push(p + ': publicar.html en el menú');
    if (!/<p class="pie__personal"><a href="publicar\.html">Personal del Ayuntamiento: publicar<\/a><\/p>/.test(pie)) malos.push(p + ': sin el enlace del pie');
  }
  const forms = (M.hoja && M.hoja.formularios) || {};
  const conUrl = ['avisos', 'agenda', 'noticias'].filter(k => forms[k]);
  const botones = [...html.matchAll(/<a class="publicar-boton" href="([^"]+)" data-formulario="(\w+)"/g)].map(m => m[2] + '=' + m[1].replace(/&amp;/g, '&'));
  const inactivos = [...html.matchAll(/<div class="publicar-boton publicar-boton--inactivo" data-formulario="(\w+)">[\s\S]*?<\/div>/g)];
  if (botones.join() !== conUrl.map(k => k + '=' + forms[k]).join()) malos.push('botones ' + JSON.stringify(botones) + ' ≠ hoja.formularios');
  if (inactivos.length !== 3 - conUrl.length || inactivos.some(m => !m[0].includes(AVISO_SIN))) malos.push(`${inactivos.length} botones sin formulario con «${AVISO_SIN}»`);

  /* ── 2. una copia con las tres URLs (e indexar: true) y otra con una URL mala ── */
  const URLS = { avisos: 'https://docs.google.com/forms/d/e/1FAIpQLSe-prueba-avisos/viewform', agenda: 'https://forms.gle/PruebaAgenda123', noticias: 'https://docs.google.com/forms/d/e/1FAIpQLSe-prueba-noticias/viewform' };
  const dest = copiar();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dest, 'municipio.json'), 'utf8'));
    m.hoja = { ...(m.hoja || {}), id: '1PruebaDeHojaDeLaWeb', formularios: URLS };
    m.indexar = true;
    fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(m, null, 2));
    /* --sin-hoja: que el montaje no salga a buscar la hoja de prueba a Google (si aplicar.mjs lo entiende) */
    const ap = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio', '--sin-hoja'], { encoding: 'utf8', cwd: dest });
    if (ap.status !== 0) malos.push('copia con formularios: aplicar.mjs falla → ' + (ap.stderr || ap.stdout).slice(-300));
    else {
      const h = fs.readFileSync(path.join(dest, 'publicar.html'), 'utf8');
      const b = Object.fromEntries([...h.matchAll(/<a class="publicar-boton" href="([^"]+)" data-formulario="(\w+)"/g)].map(x => [x[2], x[1].replace(/&amp;/g, '&')]));
      if (JSON.stringify(b) !== JSON.stringify(URLS) || h.includes(AVISO_SIN)) malos.push('copia: los botones no van a hoja.formularios → ' + JSON.stringify(b));
      if (!/<meta name="robots" content="noindex, nofollow">/.test(h)) malos.push('copia con indexar: publicar.html pierde el noindex');
      if (/<meta name="robots"/.test(fs.readFileSync(path.join(dest, 'index.html'), 'utf8'))) malos.push('copia con indexar: la portada sigue con noindex (la prueba no prueba nada)');
      const fuga = fs.readdirSync(dest).filter(f => f.endsWith('.html') && f !== 'publicar.html').filter(f => { const x = fs.readFileSync(path.join(dest, f), 'utf8'); return Object.values(URLS).some(u => x.includes(u)); });
      if (fuga.length) malos.push('las URLs de los formularios salen en ' + fuga.join(', '));
    }
    m.hoja.formularios = { ...URLS, agenda: 'http://forms.gle/sin-https' };
    fs.writeFileSync(path.join(dest, 'municipio.json'), JSON.stringify(m, null, 2));
    const mal = spawnSync('node', [path.join(dest, 'scripts/aplicar.mjs'), '--sin-og', '--silencio', '--sin-hoja'], { encoding: 'utf8', cwd: dest });
    if (mal.status === 0 || !/hoja\.formularios\.agenda/.test(mal.stderr + mal.stdout)) malos.push('una URL sin https no para aplicar.mjs');
  } finally { fs.rmSync(dest, { recursive: true, force: true }); }
  comprobar(!malos.length, `v3c F19: publicar.html con noindex (también con indexar: true), fuera del menú y con «Personal del Ayuntamiento: publicar» en el pie de las ${PAGINAS.length} páginas; ${conUrl.length ? conUrl.length + ' botones a hoja.formularios' : 'sin hoja.formularios, ningún botón falso y los 3 con «Se activa al montar la hoja»'}; en una copia con las URLs, los botones van a ellas y no salen en otra página; una URL sin https para aplicar.mjs` + (malos.length ? ' → ' + malos.slice(0, 4).join(' | ') : ''));

  /* ── 3. las muestras y el simulador, en el navegador ── */
  const mS = [], viol = [];
  const { ctx, page, errores } = await nueva({ viewport: { width: 390, height: 844 } });
  await ir(page, 'publicar.html');
  const peticiones = [];
  page.on('request', r => peticiones.push(r.url()));
  const muestras = await page.evaluate(() => {
    const c = document.querySelector('[data-muestras]');
    const n = s => c.querySelectorAll(s).length;
    return { visible: c.checkVisibility(), franjas: n('.franja-urgente__fondo.es-urgente') + '+' + n('.franja-urgente__fondo.es-programado'), hoy: n('.hoy__fila--aviso.es-urgente') + n('.hoy__fila--agenda'),
      tablon: n('.tablon__fila'), evento: n('.evento'), noticia: n('.linea__item--noticia'), enlaces: n(['a', 'button', '[id]', 'h3', 'h4', 'h5', 'h6'].map(x => '.publicar-muestra ' + x).join(', ')),
      sinJs: [...document.querySelectorAll('[data-sin-js]')].some(e => e.checkVisibility()) };
  });
  if (!muestras.visible || muestras.franjas !== '1+1' || muestras.hoy !== 2 || muestras.tablon !== 1 || muestras.evento !== 1 || muestras.noticia !== 1 || muestras.enlaces || muestras.sinJs) mS.push('muestras: ' + JSON.stringify(muestras));
  await axeEn(page, 'publicar al llegar', viol, AXE);
  /* con el teclado: el título, Tab a la gravedad (la marcada) y flechas */
  const TIT = 'Avería: sin agua en la calle Real hasta las 15:00';
  await page.focus('#sim-titulo');
  await page.keyboard.type(TIT);
  await espera(1000);
  const leerSim = () => page.evaluate(() => {
    const f = document.querySelector('[data-sim-franja] .franja-urgente__fondo'), s = document.querySelector('[data-simulador]');
    const nota = s.querySelector('[data-sim-nota]');
    return { franja: f ? f.className.replace('franja-urgente__fondo ', '') : null, texto: f ? f.textContent : '', fondo: f ? getComputedStyle(f).backgroundColor : null,
      hoy: (s.querySelector('[data-sim-hoy] .hoy__fila--aviso') || {}).textContent || '', tablon: (s.querySelector('[data-sim-tablon] .tablon__fila') || {}).textContent || '',
      estado: s.querySelector('[data-sim-estado]').textContent, rol: s.querySelector('[data-sim-estado]').getAttribute('role'),
      nota: nota.checkVisibility() ? nota.textContent : '', marca: s.querySelector('.simulador__marca').checkVisibility() && /Simulación: no se publica nada/.test(s.querySelector('.simulador__marca').textContent),
      enlaces: s.querySelectorAll('.simulador__resultado a, .simulador__resultado button').length,
      alerta: getComputedStyle(document.documentElement).getPropertyValue('--alerta').trim() };
  });
  const rgb = h => { const x = h.replace('#', ''); return 'rgb(' + [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)).join(', ') + ')'; };
  const u = await leerSim();
  if (u.franja !== 'es-urgente' || !u.texto.includes(TIT) || u.fondo !== rgb(u.alerta) || !u.hoy.includes(TIT) || !u.tablon.includes(TIT) || !u.marca || u.enlaces) mS.push('urgente: ' + JSON.stringify(u));
  if (u.rol !== 'status' || !u.estado.includes('«' + TIT + '»') || !/franja roja/.test(u.estado) || !/no se publica nada/.test(u.estado)) mS.push('lector de pantalla (urgente): ' + u.estado);
  await axeEn(page, 'simulador urgente', viol, AXE);
  await page.keyboard.press('Tab');
  const enRadio = await page.evaluate(() => ({ id: document.activeElement.id, contorno: getComputedStyle(document.activeElement).outlineStyle }));
  if (enRadio.id !== 'sim-urgente' || enRadio.contorno === 'none') mS.push('Tab no lleva a la gravedad marcada con foco visible: ' + JSON.stringify(enRadio));
  await page.keyboard.press('ArrowDown');
  await espera(1000);
  const p = await leerSim();
  if (p.franja !== 'es-programado' || !p.texto.includes(TIT) || !/franja ámbar/.test(p.estado)) mS.push('programado: ' + JSON.stringify({ franja: p.franja, estado: p.estado }));
  await page.fill('#sim-caduca', '');
  await espera(900);
  const sc = await leerSim();
  if (sc.franja || !/Sin «Caduca»/.test(sc.nota) || !sc.tablon.includes(TIT)) mS.push('programado sin «Caduca»: ' + JSON.stringify({ franja: sc.franja, nota: sc.nota }));
  await page.focus('#sim-programado');
  await page.keyboard.press('ArrowDown');
  await espera(900);
  const inf = await leerSim();
  if (inf.franja || !/informativo no sale en la franja/.test(inf.nota) || !inf.hoy.includes(TIT)) mS.push('informativo: ' + JSON.stringify({ franja: inf.franja, nota: inf.nota }));
  await axeEn(page, 'simulador informativo', viol, AXE);
  /* «Empezar de nuevo» vacía y vuelve a lo de serie */
  await page.click('[data-simulador] button[type="reset"]');
  await espera(300);
  const r0 = await page.evaluate(() => ({ vista: document.querySelector('[data-sim-vista]').checkVisibility(), vacio: document.querySelector('[data-sim-vacio]').checkVisibility(), urgente: document.getElementById('sim-urgente').checked, caduca: document.getElementById('sim-caduca').value }));
  if (r0.vista || !r0.vacio || !r0.urgente || !r0.caduca) mS.push('reset: ' + JSON.stringify(r0));
  /* Intro en el título no envía nada */
  await page.focus('#sim-titulo'); await page.keyboard.type('Prueba'); await page.keyboard.press('Enter'); await espera(300);
  if (!page.url().endsWith('publicar.html')) mS.push('Intro navega a ' + page.url());
  if (peticiones.length) mS.push('peticiones al usarlo: ' + peticiones.slice(0, 3).join(' | '));
  if (errores.length) mS.push('consola: ' + [...new Set(errores)].slice(0, 2).join(' | '));
  await ctx.close();
  /* sin JavaScript: ni simulador ni muestras, y el aviso de que hace falta */
  const sj = await navegador.newContext({ javaScriptEnabled: false });
  const pj = await sj.newPage();
  await pj.goto(BASE + 'publicar.html', { waitUntil: 'networkidle' });
  const sinJs = await pj.evaluate(() => ({ sim: document.querySelector('[data-simulador]').checkVisibility(), muestras: document.querySelector('[data-muestras]').checkVisibility(), aviso: document.querySelector('[data-sin-js]').checkVisibility() }));
  await sj.close();
  if (sinJs.sim || sinJs.muestras || !sinJs.aviso) mS.push('sin JS: ' + JSON.stringify(sinJs));
  comprobar(!mS.length && !viol.length, 'v3c F19: muestras de «Así se ve» con las piezas reales (2 franjas, 2 fichas de «Hoy», tablón, agenda y noticia) y sin enlaces; simulador «Pruébelo» con teclado: un título urgente pinta la franja roja (--alerta) con ese título, la ficha de «Hoy» y el tablón, y el lector de pantalla oye el resumen (role=status); programado → ámbar; sin «Caduca» o informativo → sin franja y la nota; «Empezar de nuevo»; Intro no envía; 0 peticiones de red al usarlo; sin JS, el aviso; axe 0 en tres estados' + (mS.length ? ' → ' + mS.slice(0, 4).join(' | ') : '') + (viol.length ? ' → axe: ' + viol.slice(0, 3).join(' | ') : ''));

  /* ── 4. impresa: una A4, sin lo interactivo y con dónde están los formularios ── */
  const mP = [];
  const q = await nueva({ conCookies: true });
  await ir(q.page, 'publicar.html');
  await q.page.emulateMedia({ media: 'print' });
  const papel = await q.page.evaluate(() => {
    const ve = s => [...document.querySelectorAll(s)].filter(e => e.checkVisibility()).length;
    return { interactivo: ve('main button, main input, main form, main .publicar-boton, [data-simulador], [data-muestras], .indice, #cookies, .menu, .propuesta, .pie__personal'),
      papel: [...document.querySelectorAll('.publicar-solo-papel')].filter(e => e.checkVisibility()).map(e => e.textContent.trim()),
      secciones: ['t-publicar', 't-donde', 't-corregir', 't-titulo', 't-no', 't-mantenimiento'].filter(id => document.getElementById(id) && document.getElementById(id).checkVisibility()).length };
  });
  if (papel.interactivo || papel.secciones !== 6 || !papel.papel.some(t => /publicar/.test(t)) || !papel.papel.some(t => /^Impreso el/.test(t))) mP.push('en papel: ' + JSON.stringify(papel));
  const pdf = await q.page.pdf({ format: 'A4' });
  const hojas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (hojas !== 1) mP.push(`el PDF A4 tiene ${hojas} hojas`);
  if (CAPTURAS) fs.writeFileSync(captura('v3c-publicar-impresion.pdf'), pdf);
  await q.ctx.close();
  comprobar(!mP.length, 'v3c F19: «Publicar en la web» impresa es UNA hoja A4 para la mesa: las seis secciones de texto, dónde están los formularios y la fecha de impresión, sin botones, simulador, muestras, índice ni cookies' + (mP.length ? ' → ' + mP.join(' | ') : ''));

  /* ── 5. crear-hoja.gs contra una imitación de la API de Apps Script ── */
  const mG = [];
  const gs = leer(RAIZ, 'plantillas-hoja', 'crear-hoja.gs');
  try { new vm.Script(gs, { filename: 'crear-hoja.gs' }); } catch (e) { mG.push('no compila: ' + e.message); }
  const apps = imitarAppsScript();
  const res = {};
  try { vm.runInNewContext(gs + '\n;__r.bloque = crearHojaDeLaWeb();', { ...apps.globales, __r: res }); } catch (e) { mG.push('al ejecutarlo: ' + e.message); }
  const bloque = res.bloque ? JSON.parse(JSON.stringify(res.bloque)) : null;
  const { COLUMNAS } = await import('./comprobar-hoja.mjs');
  const csv = n => fs.readFileSync(path.join(RAIZ, 'plantillas-hoja', n + '.csv'), 'utf8').split(/\r?\n/)[0].split(',').map(clave).filter(c => c !== 'marca_temporal' && c !== 'estado');
  const LEE = { avisos: [...COLUMNAS.avisos.obligatorias, ...COLUMNAS.avisos.opcionales], agenda: [...COLUMNAS.agenda.obligatorias, ...COLUMNAS.agenda.opcionales],
    noticias: ['id', 'fecha', 'titulo', 'resumen', 'texto', 'estado'] };   /* noticias: lo que pinta vivo.js (fecha, título, resumen) y el cuerpo */
  const pest = (M.hoja && M.hoja.pestanas) || {};
  if (bloque) {
    for (const k of ['avisos', 'agenda', 'noticias']) {
      const f = apps.formularios.find(x => x.clave === k);
      if (!f) { mG.push('no crea el formulario de ' + k); continue; }
      const t = f.items.map(i => clave(i.titulo));
      if (t.join() !== csv(k).join()) mG.push(`${k}: preguntas ${t.join(',')} ≠ plantillas-hoja/${k}.csv ${csv(k).join(',')}`);
      if (t.some(c => !LEE[k].includes(c)) || ['fecha', 'titulo'].some(c => !t.includes(c))) mG.push(`${k}: preguntas que la web no lee o faltan fecha/título: ${t.join(',')}`);
      if (f.items.filter(i => i.requerida).map(i => clave(i.titulo)).join() !== 'fecha,titulo') mG.push(k + ': obligatorias ≠ fecha y título');
      if (f.correo !== true || !f.destino) mG.push(k + ': no recoge el correo de quien responde o no manda a la hoja');
      const resp = apps.hojas.find(h => h.formulario === f), pub = apps.hojas.find(h => h.nombre === pest[k]);
      if (!resp || !pub || !pub.formula) { mG.push(k + ': falta la pestaña de respuestas o la publicable «' + pest[k] + '»'); continue; }
      /* la QUERY: de la pestaña de respuestas, las columnas de las preguntas y «Estado», sin la A (marca temporal) */
      /* v3c · F18 bis: solo las filas con «Autorizada» = sí, y ni el correo ni «Autorizada» en lo publicado */
      const mq = /^=QUERY\('([^']+)'!A:([A-Z]+), "select ([A-Z, ]+) where ([A-Z]+) is not null and ([A-Z]+) = 'sí'", 1\)$/.exec(pub.formula);
      const num = l => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      const elegidas = mq ? mq[3].split(', ').map(l => resp.cabecera[num(l) - 1]) : [];
      const iCorreo = resp.cabecera.findIndex(t => /correo/i.test(t)), iAut = resp.cabecera.indexOf('Autorizada');
      if (!mq || mq[1] !== resp.nombre || elegidas.join('|') !== [...f.items.map(i => i.titulo), 'Estado'].join('|') || resp.cabecera[num(mq[4]) - 1] !== 'Título' || mq[3].split(', ').includes('A') ||
        num(mq[5]) - 1 !== iAut || iCorreo < 0 || elegidas.some(t => /correo|autorizada/i.test(t)) || num(mq[2]) < iAut + 1)
        mG.push(k + ': QUERY ' + pub.formula + ' sobre ' + JSON.stringify(resp.cabecera));
      /* «Autorizada»: compara el correo de la fila con la pestaña de autorizados */
      const L = n => String.fromCharCode(65 + n);
      const fAut = (resp.formulas || {})[iAut + 1] || '';
      if (iCorreo < 0 || !fAut.startsWith('={"Autorizada"; ARRAYFORMULA(') || !fAut.includes('TRIM(' + L(iCorreo) + '2:' + L(iCorreo) + ')') || !fAut.includes("'Personas autorizadas'!A2:A") || !/"sí", "no"/.test(fAut))
        mG.push(k + ': la columna «Autorizada» → ' + fAut);
    }
    const h = bloque.hoja || {};
    if (!h.id || JSON.stringify(h.pestanas) !== JSON.stringify({ avisos: pest.avisos, agenda: pest.agenda, noticias: pest.noticias }) || Object.keys(h.formularios || {}).join() !== 'avisos,agenda,noticias' || Object.values(h.formularios).some(x => !/^https:\/\//.test(x)))
      mG.push('el bloque para municipio.json: ' + JSON.stringify(h));
    if (!apps.registro.some(l => l.includes('"formularios"') && l.includes(h.id))) mG.push('el registro no enseña el bloque «hoja»');
    const leame = apps.hojas.find(x => x.nombre === 'Léame');
    if (!leame || !leame.texto.includes(h.id) || !/Publicar en la web/.test(leame.texto)) mG.push('la pestaña «Léame» no lleva el id y el paso de publicar');
    if (apps.hojas.map(x => x.nombre).slice(0, 4).join() !== ['Léame', pest.avisos, pest.agenda, pest.noticias].join()) mG.push('orden de las pestañas: ' + apps.hojas.map(x => x.nombre).join(', '));
    /* la pestaña privada de autorizados, con el correo de quien ejecuta el script; el «Léame» dice cómo añadir y que no se publique */
    const aut = apps.hojas.find(x => x.nombre === 'Personas autorizadas');
    if (!aut || !aut.valores || !aut.valores.some((fila, i) => i > 0 && fila[0] === 'ayuntamiento@ejemplo.es') || Object.values(pest).includes('Personas autorizadas'))
      mG.push('«Personas autorizadas»: ' + JSON.stringify(aut && aut.valores));
    if (!leame || !/Personas autorizadas/.test(leame.texto) || !/Verificado/.test(leame.texto)) mG.push('el «Léame» no explica los autorizados y el correo «Verificado»');
  }
  comprobar(!mG.length, 'v3c F18: plantillas-hoja/crear-hoja.gs compila y, contra una imitación de la API de Apps Script, crea los 3 formularios (recogen el correo de quien responde y envían a la hoja) con las preguntas que lee la web (= plantillas-hoja/*.csv y comprobar-hoja.mjs; obligatorias fecha y título), las pestañas «Avisos», «Agenda» y «Noticias» con una QUERY que copia esas columnas y «Estado» solo de las filas con «Autorizada» = sí (el correo comparado con la pestaña privada «Personas autorizadas», creada con el correo de quien ejecuta el script) y sin la marca temporal ni el correo, el «Léame» y el bloque «hoja» (id, pestañas y formularios) en el registro' + (mG.length ? ' → ' + mG.slice(0, 4).join(' | ') : ''));

  /* ── 6. la propuesta enlaza al simulador ── */
  if (M.propuesta !== false) {
    const pr = leer(RAIZ, 'propuesta.html');
    const sec = (pr.match(/<section[^>]*aria-labelledby="t-publicar"[\s\S]*?<\/section>/) || [''])[0];
    const pasos = (sec.match(/<ol class="propuesta-pasos">([\s\S]*?)<\/ol>/) || ['', ''])[1].match(/<li>/g) || [];
    comprobar(/href="publicar\.html#t-pruebelo"/.test(sec) && pasos.length === 3, 'v3c F21: «Publicar es rellenar un formulario» de la propuesta, en 3 pasos y con el enlace al simulador de publicar.html' + (pasos.length === 3 ? '' : ` → ${pasos.length} pasos`));
  }
}
async function axeEn(page, nombre, viol, tags) {
  (await new AxeBuilder({ page }).withTags(tags).analyze()).violations.forEach(v => viol.push(nombre + ': ' + v.id + ' ' + v.nodes[0].target.join(' ')));
}
/* lo justo de SpreadsheetApp, FormApp, DriveApp, ScriptApp, MailApp, Session y Logger (con los nombres
   de la API documentada) para ejecutar crear-hoja.gs en Node y ver qué haría */
function imitarAppsScript() {
  const a = { formularios: [], hojas: [], registro: [] };
  let nHoja = 0, nForm = 0;
  const encadena = (o, nombres) => { for (const n of nombres) o[n] = () => o; return o; };
  const rango = (h, fila, col, nf = 1, nc = 1) => encadena({
    getValues: () => [Array.from({ length: nc }, (_, i) => (fila === 1 ? h.cabecera[col - 1 + i] : '') || '')],
    setValues: v => { if (fila === 1 && col === 1 && h.nombre !== 'Léame') h.cabecera = v[0].slice(); h.valores = v.map(x => x.slice()); h.texto += v.map(x => x.join(' ')).join('\n'); return rango(h, fila, col, nf, nc); },
    setValue: v => { if (fila === 1) h.cabecera[col - 1] = v; return rango(h, fila, col); },
    /* en la cabecera, una fórmula ={"Título"; …} se ve como su primer valor */
    setFormula: f => { h.formula = f; (h.formulas = h.formulas || {})[col] = f; const t = /^=\{"([^"]+)"/.exec(f); if (fila === 1 && t) h.cabecera[col - 1] = t[1]; return rango(h, fila, col); }
  }, ['setNote', 'setFontWeight', 'setFontSize', 'setWrap']);
  const nuevaHoja = nombre => {
    const h = { id: ++nHoja, nombre, cabecera: [], texto: '', formula: null, formulario: null };
    Object.assign(h, encadena({
      getSheetId: () => h.id, getName: () => h.nombre, setName: n => { h.nombre = n; return h; }, getLastColumn: () => h.cabecera.length,
      getRange: (x, c, nf, nc) => (typeof x === 'string' ? rango(h, 1, 1) : rango(h, x, c, nf, nc)), getFormUrl: () => (h.formulario ? h.formulario.url : null),
      protect: () => encadena({}, ['setDescription', 'setWarningOnly'])
    }, ['setFrozenRows', 'setColumnWidth']));
    a.hojas.push(h);
    return h;
  };
  const libro = encadena({ getId: () => 'HOJA-PRUEBA-1', getUrl: () => 'https://docs.google.com/spreadsheets/d/HOJA-PRUEBA-1/edit', getSheets: () => a.hojas.slice(),
    getSheetByName: n => a.hojas.find(h => h.nombre === n) || null, insertSheet: n => nuevaHoja(n), setActiveSheet: h => { libro.activa = h; return h; },
    moveActiveSheet: i => { a.hojas.splice(a.hojas.indexOf(libro.activa), 1); a.hojas.splice(i - 1, 0, libro.activa); } }, ['setSpreadsheetLocale', 'setSpreadsheetTimeZone']);
  const item = (f, tipo) => {
    const it = { tipo, titulo: '', requerida: false };
    f.items.push(it);
    return encadena(Object.assign(it, { setTitle: t => { it.titulo = t; return it; }, setRequired: r => { it.requerida = r; return it; } }), ['setHelpText', 'setChoiceValues', 'setIncludesYear', 'setValidation']);
  };
  const validacion = () => encadena({ build: () => ({}) }, ['setHelpText', 'requireTextLengthLessThanOrEqualTo', 'requireTextIsUrl']);
  const globales = {
    SpreadsheetApp: { create: () => { nuevaHoja('Hoja 1'); return libro; }, openById: () => libro, flush: () => {} },
    FormApp: {
      DestinationType: { SPREADSHEET: 'SPREADSHEET' }, createTextValidation: validacion,
      create: titulo => {
        const id = 'FORM' + ++nForm;
        const f = { id, titulo, items: [], correo: null, destino: null, url: 'https://docs.google.com/forms/d/e/' + id + '/viewform',
          clave: /aviso/i.test(titulo) ? 'avisos' : /acto|agenda/i.test(titulo) ? 'agenda' : /noticia/i.test(titulo) ? 'noticias' : null };
        a.formularios.push(f);
        return encadena(Object.assign(f, {
          getId: () => id, getTitle: () => titulo, getPublishedUrl: () => f.url, setCollectEmail: v => { f.correo = v; return f; },
          setDestination: (tipo, libroId) => { f.destino = libroId; const h = nuevaHoja('Respuestas de formulario ' + nForm); h.formulario = f; h.cabecera = ['Marca temporal', ...(f.correo ? ['Dirección de correo electrónico'] : []), ...f.items.map(i => i.titulo)]; return f; },
          addDateItem: () => item(f, 'fecha'), addTimeItem: () => item(f, 'hora'), addTextItem: () => item(f, 'corta'), addParagraphTextItem: () => item(f, 'parrafo'),
          addListItem: () => item(f, 'lista'), addMultipleChoiceItem: () => item(f, 'opcion'), addCheckboxItem: () => item(f, 'casilla')
        }), ['setDescription', 'setConfirmationMessage', 'setAllowResponseEdits', 'setShowLinkToRespondAgain', 'setProgressBar', 'setRequireLogin']);
      }
    },
    DriveApp: { createFolder: () => ({}), getFileById: () => ({ moveTo: () => {} }) },
    ScriptApp: { newTrigger: () => encadena({}, ['forForm', 'onFormSubmit', 'create']) },
    MailApp: { sendEmail: () => {} }, Session: { getEffectiveUser: () => ({ getEmail: () => 'ayuntamiento@ejemplo.es' }) },
    Logger: { log: x => { a.registro.push(String(x)); } }
  };
  return Object.assign(a, { globales });
}

/* ═════════════ orden ═════════════ */
const t0 = Date.now();
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1].split(',') : null;
if (!SOLO || SOLO.includes('estaticas')) estaticas();
for (const [nombre, fn] of [['tablon', tablon], ['abierto', abierto], ['hoy', panelHoy], ['cortina', cortina], ['movimiento', movimiento], ['contenido', contenidoEjemplo], ['interaccion', interaccion],
  ['estructura', estructura], ['interiores', interiores], ['teclado', teclado], ['desborde', desborde], ['axe', axe], ['opcionales', opcionales], ['primera', primeraPantalla],
  ['v3pliegue', v3Pliegue],
  ['v3cuerpo', v3Cuerpo],
  ['v3interiores', v3Interiores],
  ['v3identidad', v3Identidad],
  ['v3btablon', v3bTablon],
  ['v3bservicio', v3bServicio],
  ['v3bpueblo', v3bPueblo],
  ['v3binteriores', v3bInteriores],
  ['v3cautomatico', v3cAutomatico],
  ['v3calta', v3cAlta],
  ['v3ctransparencia', v3cTransparencia],
  ['v3cguia', v3cGuia],
  ...(RAPIDO ? [] : [['reskin', reskin]]), ...(CAPTURAS ? [['capturas', capturas]] : [])]) {
  if (SOLO && !SOLO.includes(nombre)) continue;
  const t = Date.now();
  try { await fn(); } catch (e) { comprobar(false, nombre + ': la prueba se rompió → ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  console.log(`· ${nombre}: ${Math.round((Date.now() - t) / 1000)} s`);
}
await navegador.close();
servidor.close();

console.log('\n' + notas.join('\n'));
if (fallos.length) console.log('\n' + fallos.join('\n'));
console.log(`\n${fallos.length ? '✗' : '✓'} ${notas.length} de ${notas.length + fallos.length} comprobaciones en ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fallos.length ? 1 : 0);
