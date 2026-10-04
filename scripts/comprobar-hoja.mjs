/* comprobar-hoja.mjs — revisa una exportación en CSV de la hoja de avisos o de agenda antes de
   publicarla (v3b · servicio, ver PUBLICAR.md). Lee las columnas igual que la web (js/main.js →
   leerHoja): sin tildes, en minúsculas y con «_» en vez de espacios, así que «Título corto» es
   titulo_corto. Dice qué fila está mal y por qué, con el número de fila de la hoja.

     node scripts/comprobar-hoja.mjs plantillas-hoja/avisos.csv
     node scripts/comprobar-hoja.mjs agenda.csv --tipo agenda     (si no, lo deduce de las columnas)

   Sale con código 1 si hay errores (lo que la web no podría enseñar o enseñaría mal) y 0 si solo
   hay avisos (lo que conviene mirar). Sin dependencias. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COLUMNAS = {
  avisos: {
    obligatorias: ['fecha', 'titulo'],
    opcionales: ['id', 'tema', 'texto', 'gravedad', 'caduca', 'titulo_corto', 'urgente', 'enlace', 'estado']
  },
  agenda: {
    obligatorias: ['fecha', 'titulo'],
    opcionales: ['id', 'hora', 'hora_fin', 'lugar', 'nota', 'tipo', 'convocatoria', 'grabacion', 'estado']
  }
};
/* las columnas que añade Google Forms y la web no lee: no son un error */
const DE_FORMULARIO = ['marca_temporal', 'timestamp', 'direccion_de_correo_electronico', 'email_address', 'puntuacion'];
const GRAVEDADES = ['urgente', 'programado', 'informativo'];
const ESTADOS = ['', 'publicado', 'visible', 'oculto', 'borrador'];

export const normal = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const clave = s => normal(s).replace(/\s+/g, '_');

/* CSV de RFC 4180 (comillas, comas o saltos dentro de una celda). El separador se deduce de la
   cabecera: la exportación de Google usa «,»; un Excel en español, «;» */
export function leerCsv(txt) {
  txt = txt.replace(/^﻿/, '');
  const primera = txt.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"' && txt[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return { sep, filas, abierta: comillas };
}

/* una fecha como la deja la hoja: AAAA-MM-DD o, en una hoja en español, DD/MM/AAAA (es una celda de
   fecha y la web la recibe como fecha). Devuelve AAAA-MM-DD o null */
export function fecha(v) {
  v = String(v || '').trim();
  let a, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) [, a, m, d] = x;
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(v))) [, d, m, a] = x;
  else return null;
  const f = new Date(Date.UTC(+a, +m - 1, +d));
  if (f.getUTCFullYear() !== +a || f.getUTCMonth() !== +m - 1 || f.getUTCDate() !== +d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function hora(v) {
  const x = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v || '').trim());
  if (!x || +x[1] > 23 || +x[2] > 59) return null;
  return x[1].padStart(2, '0') + ':' + x[2];
}

export function comprobar(txt, tipoPedido) {
  const errores = [], avisos = [];
  const { filas, abierta } = leerCsv(txt);
  if (abierta) errores.push('El archivo acaba con unas comillas sin cerrar: alguna celda está cortada.');
  if (!filas.length || !filas[0].some(c => c.trim())) return { tipo: tipoPedido || null, errores: ['El archivo está vacío: falta la fila de los nombres de columna.'], avisos, filas: 0 };
  const cab = filas[0].map(clave);
  const tipo = tipoPedido || (cab.some(c => ['hora', 'lugar', 'hora_fin', 'tipo'].includes(c)) ? 'agenda' : 'avisos');
  const C = COLUMNAS[tipo];
  if (!C) return { tipo, errores: ['--tipo es «avisos» o «agenda»'], avisos, filas: 0 };
  for (const o of C.obligatorias) if (!cab.includes(o)) errores.push(`Falta la columna «${o}» (la primera fila tiene: ${filas[0].join(', ')}).`);
  cab.forEach((c, i) => {
    if (!c) return;
    if (cab.indexOf(c) !== i) errores.push(`La columna «${filas[0][i]}» está repetida: la web solo leería la última.`);
    else if (!C.obligatorias.includes(c) && !C.opcionales.includes(c) && !DE_FORMULARIO.includes(c))
      avisos.push(`La columna «${filas[0][i]}» no la lee la web (se lee como «${c}»). Las que lee: ${[...C.obligatorias, ...C.opcionales].join(', ')}.`);
  });
  if (errores.length) return { tipo, errores, avisos, filas: filas.length - 1 };

  const ids = new Map();
  let n = 0;
  filas.slice(1).forEach((celdas, i) => {
    const nf = i + 2;                                    /* la fila 1 de la hoja son los nombres */
    if (!celdas.some(c => c.trim())) return;
    n++;
    const o = {};
    cab.forEach((c, j) => { if (c) o[c] = (celdas[j] || '').trim(); });
    if (celdas.length > cab.length && celdas.slice(cab.length).some(c => c.trim())) errores.push(`Fila ${nf}: tiene más celdas que columnas (¿una coma sin comillas dentro de un texto?).`);
    const mal = m => errores.push(`Fila ${nf}${o.titulo ? ' («' + o.titulo.slice(0, 50) + '»)' : ''}: ${m}`);
    const ojo = m => avisos.push(`Fila ${nf}${o.titulo ? ' («' + o.titulo.slice(0, 50) + '»)' : ''}: ${m}`);
    const est = normal(o.estado);
    if (!ESTADOS.includes(est)) ojo(`«estado» es «${o.estado}»: la web solo entiende «oculto» o «borrador» (para no publicarla); cualquier otra cosa se publica.`);
    const oculta = /oculto|borrador/.test(est);
    if (!o.titulo) mal('falta el título: la web no enseña una fila sin título.');
    const f = fecha(o.fecha);
    if (!o.fecha) mal('falta la fecha: la web no enseña una fila sin fecha.');
    else if (!f) mal(`la fecha «${o.fecha}» no vale. Escríbala como 12/11/2026 (o 2026-11-12) y que sea un día que exista.`);
    const id = o.id ? o.id : f && o.titulo ? normal(f + '-' + o.titulo).replace(/[^a-z0-9]+/g, '-').slice(0, 60) : null;
    if (id && !oculta) {
      if (ids.has(id)) mal(`es la misma que la fila ${ids.get(id)} (${o.id ? 'mismo «id»' : 'misma fecha y mismo título'}): la web enseñaría solo una.`);
      else ids.set(id, nf);
    }
    if (tipo === 'avisos') {
      const g = normal(o.gravedad);
      if (g && !GRAVEDADES.includes(g)) mal(`«gravedad» es «${o.gravedad}»: tiene que ser urgente, programado o informativo (o quedar vacía).`);
      const urg = g === 'urgente' || ['true', 'si', 'sí', 'verdadero', 'x'].includes(normal(o.urgente));
      if (o.caduca) {
        const c = fecha(o.caduca);
        if (!c) mal(`«caduca» es «${o.caduca}»: escríbala como 12/11/2026 (o 2026-11-12).`);
        else if (f && c < f) mal(`caduca (${c}) antes de su fecha (${f}): no se vería nunca en la franja.`);
      } else if (urg || g === 'programado') ojo('es ' + (urg ? 'urgente' : 'programado') + ' pero no tiene «caduca»: no saldrá en la franja de arriba (sin fecha de fin se quedaría para siempre).');
      if (o.caduca && (urg || g === 'programado') && o.titulo.length > 70 && !o.titulo_corto) ojo(`el título tiene ${o.titulo.length} caracteres; en la franja del móvil no cabe en dos líneas. Rellene «titulo_corto» (70 como mucho).`);
      if (o.titulo_corto && o.titulo_corto.length > 70) ojo(`«titulo_corto» tiene ${o.titulo_corto.length} caracteres (70 como mucho).`);
      if (o.enlace && !/^https:\/\/\S+$/.test(o.enlace)) mal(`«enlace» es «${o.enlace}»: tiene que ser una dirección completa que empiece por https://`);
    } else {
      if (o.hora && !hora(o.hora)) mal(`la hora «${o.hora}» no vale: escríbala como 20:30.`);
      if (o.hora_fin) {
        if (!hora(o.hora_fin)) mal(`«hora_fin» es «${o.hora_fin}»: escríbala como 22:00.`);
        else if (!o.hora) mal('tiene «hora_fin» pero no «hora».');
        else if (hora(o.hora) && hora(o.hora_fin) <= hora(o.hora)) ojo(`termina (${hora(o.hora_fin)}) antes de empezar (${hora(o.hora)}): en el calendario durará una hora.`);
      }
      const t = normal(o.tipo);
      if (t && t !== 'pleno') ojo(`«tipo» es «${o.tipo}»: la web solo distingue «pleno» (los demás salen como un acto normal).`);
      for (const k of ['convocatoria', 'grabacion']) if (o[k] && !/^https:\/\/\S+$/.test(o[k])) mal(`«${k}» es «${o[k]}»: tiene que ser una dirección completa que empiece por https://`);
      if ((o.convocatoria || o.grabacion) && t !== 'pleno') ojo('tiene convocatoria o grabación pero «tipo» no es «pleno»: el enlace no saldrá.');
    }
  });
  if (!n) avisos.push('No hay ninguna fila con datos debajo de los nombres de columna.');
  return { tipo, errores, avisos, filas: n };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const archivo = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--tipo');
  const tipo = args.includes('--tipo') ? args[args.indexOf('--tipo') + 1] : null;
  if (!archivo) { console.error('Uso: node scripts/comprobar-hoja.mjs <exportación.csv> [--tipo avisos|agenda]'); process.exit(2); }
  let txt;
  try { txt = fs.readFileSync(archivo, 'utf8'); } catch (e) { console.error('✗ No puedo leer ' + archivo + ': ' + e.message); process.exit(2); }
  const r = comprobar(txt, tipo);
  console.log(`${archivo}: hoja de ${r.tipo}, ${r.filas} fila(s) con datos.`);
  if (r.errores.length) console.log('\n✗ Errores (la web no lo enseñaría o lo enseñaría mal):\n  - ' + r.errores.join('\n  - '));
  if (r.avisos.length) console.log('\n! Conviene mirar:\n  - ' + r.avisos.join('\n  - '));
  if (!r.errores.length) console.log('\n✓ La hoja se puede publicar.' + (r.avisos.length ? ' (Mire los avisos de arriba.)' : ''));
  process.exit(r.errores.length ? 1 : 0);
}
