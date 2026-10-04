/* captura-portada.mjs — la captura de la portada nueva para el comparador de «La propuesta»
   (v3b · servicio). La llama aplicar.mjs después de escribir las páginas (salvo con --sin-og):
   sirve la carpeta, abre index.html a 1280 × 800 sin cortina, sin aviso de cookies, con movimiento
   reducido y con la primera foto del arco (siempre la misma), y guarda assets/propuesta-portada.jpg.

     node scripts/captura-portada.mjs        a mano, con la web ya generada */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarPlaywright } from './og.mjs';
import { crearServidor } from './servir.mjs';

export const CAPTURA = 'assets/propuesta-portada.jpg';
export const MEDIDA = { ancho: 1280, alto: 800 };

export async function capturarPortada(raiz, slug) {
  const { chromium } = await cargarPlaywright();
  const srv = crearServidor(raiz, null);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: MEDIDA.ancho, height: MEDIDA.alto }, reducedMotion: 'reduce', locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
    await ctx.addInitScript(s => {
      try { localStorage.setItem(s + '-cookies', 'ok'); sessionStorage.setItem(s + '-cortina', '1'); } catch (e) {}
      Math.random = () => 0;      /* la primera foto de fotos.hero_fotos: la misma en cada build */
    }, slug);
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:' + srv.address().port + '/index.html', { waitUntil: 'networkidle', timeout: 30000 });
    await p.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.join(raiz, 'assets'), { recursive: true });
    await p.screenshot({ path: path.join(raiz, CAPTURA), type: 'jpeg', quality: 80 });
  } finally {
    await nav.close();
    srv.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const slug = JSON.parse(fs.readFileSync(path.join(raiz, 'marca/marca.json'), 'utf8')).slug;
  await capturarPortada(raiz, slug);
  console.log('✓ ' + CAPTURA);
}
