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
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
  const revisar = ['css/base.css', 'js/main.js', 'js/vivo.js', 'js/cortina.js', ...fs.readdirSync(path.join(RAIZ, 'fuente')).map(n => 'fuente/' + n)];
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
    const inf = derivarTokens(g ? paletaGirada(marca.colores, g) : marca.colores).informe.filter(f => f.ratio < f.min);
    comprobar(!inf.length, `paleta ${clave}: las 21 parejas de tokens llegan a su mínimo (4,5 texto, 3 bordes y foco)` + (inf.length ? ' → ' + inf.map(f => f.texto + '/' + f.fondo + ' ' + f.ratio).join(', ') : ''));
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
          if (el.closest('.carril, .tabla-envoltorio, .sprite, dialog, .sr, .cortina')) continue;
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

/* ── contenido: «Ejemplo» exactamente en lo marcado ── */
async function contenidoEjemplo() {
  const esperados = new Set();
  if (M.horario.ejemplo) esperados.add('horario');
  if (M.alcaldia && M.alcaldia.saluda_ejemplo) esperados.add('saluda');
  contenido('avisos').avisos.filter(a => a.ejemplo).forEach(a => esperados.add('aviso:' + a.id));
  contenido('agenda').eventos.filter(a => a.ejemplo).forEach(a => esperados.add('evento:' + a.id));
  contenido('noticias').noticias.filter(a => a.ejemplo).forEach(a => esperados.add('noticia:' + a.id));
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
    const r = await page.evaluate(() => [...document.querySelectorAll('#buscador [data-buscador-resultados] a')].map(a => ({ t: a.textContent, h: a.getAttribute('href') })));
    if (!r.length || !re.test(sinTilde(r[0].t))) malos.push(`«${q}» → ${r.length} resultados, el primero «${r[0] ? r[0].t.slice(0, 40) : '-'}»`);
    if (r.some(x => !patronSede.test(x.h) && !/\.(pdf|docx?)$/.test(x.h) && !/^https:\/\//.test(x.h))) malos.push(`«${q}»: enlace raro`);
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
    if (r.h1 !== 1 || r.primero !== 1 || r.salto || r.lang !== 'es' || !r.marcas || !r.saltar || r.letra !== '18px' || r.interlineado < 1.5)
      malos.push(`${p}: h1=${r.h1}, salto=${r.salto}, lang=${r.lang}, landmarks=${r.marcas}, saltar=${r.saltar}, letra=${r.letra}, interlineado=${r.interlineado.toFixed(2)}`);
    r.toques.forEach(t => pequenos.push(`${p}: ${Math.round(t.w)}×${Math.round(t.h)} ${t.e}`));
    if (r.maxCar > 75) medida.push(`${p}: ${Math.round(r.maxCar)}`);
  }
  comprobar(!malos.length, 'estructura: lang="es", saltar al contenido, header/nav/main/footer, un solo h1 y títulos sin saltos; texto de 18 px con interlineado ≥ 1,5' + (malos.length ? ' → ' + malos.slice(0, 3).join(' | ') : ''));
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
      await page.goto(b + 'pueblo.html', { waitUntil: 'networkidle' });
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
      await ctx.close();
    }
    srv.close();
    comprobar(!malos.length && !viol.length && !desb.length,
      'opcionales con datos de muestra: «Normativa y documentos» (desplegables, cada enlace dice qué abre), «Para visitar» (dirección, horario, entrada y teléfono solo si constan), «Dónde comer y dormir» (grupos, teléfonos y fuente), el canal de avisos, impresos en Word, un servicio del listín sin teléfono e «Instalaciones municipales» (grupos de fichas, cada dato solo si consta, el enlace dice qué abre); 0 violaciones de axe y sin scroll horizontal a 320 y 1440 px' +
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
  const asoma = await page.evaluate(() => document.querySelector('.hoy').getBoundingClientRect().top);
  comprobar(asoma < 667 - 24, `a 375 × 667 el panel «Hoy» asoma en la primera pantalla (empieza a ${Math.round(asoma)} px)`);
  await ctx.close();
}

/* ═════════════ orden ═════════════ */
const t0 = Date.now();
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1].split(',') : null;
if (!SOLO || SOLO.includes('estaticas')) estaticas();
for (const [nombre, fn] of [['tablon', tablon], ['abierto', abierto], ['cortina', cortina], ['contenido', contenidoEjemplo], ['interaccion', interaccion],
  ['estructura', estructura], ['teclado', teclado], ['desborde', desborde], ['axe', axe], ['opcionales', opcionales], ...(RAPIDO ? [] : [['reskin', reskin]]), ...(CAPTURAS ? [['capturas', capturas]] : [])]) {
  if (SOLO && !SOLO.includes(nombre)) continue;
  const t = Date.now();
  try { await fn(); } catch (e) { comprobar(false, nombre + ': la prueba se rompió → ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  console.log(`· ${nombre}: ${Math.round((Date.now() - t) / 1000)} s`);
}
if (!CAPTURAS && !SOLO) {
  /* aunque no se pidan capturas, la de 375 × 667 se mide siempre */
  const { ctx, page } = await nueva({ viewport: { width: 375, height: 667 } });
  await ir(page, 'index.html');
  const asoma = await page.evaluate(() => document.querySelector('.hoy').getBoundingClientRect().top);
  comprobar(asoma < 667 - 24, `a 375 × 667 el panel «Hoy» asoma en la primera pantalla (empieza a ${Math.round(asoma)} px)`);
  await ctx.close();
}
await navegador.close();
servidor.close();

console.log('\n' + notas.join('\n'));
if (fallos.length) console.log('\n' + fallos.join('\n'));
console.log(`\n${fallos.length ? '✗' : '✓'} ${notas.length} de ${notas.length + fallos.length} comprobaciones en ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fallos.length ? 1 : 0);
