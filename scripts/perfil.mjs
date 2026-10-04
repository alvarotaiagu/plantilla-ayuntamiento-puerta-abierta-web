/* perfil.mjs — el perfil del pueblo dibujado a línea: el borde de arriba del pie.

     node scripts/perfil.mjs              marca/perfil.json  → marca/perfil.svg
     node scripts/perfil.mjs --generico   el de cualquier pueblo → fuente/_perfil_generico.svg

   El perfil se DESCRIBE con piezas (casas, torre, cuerpo, cimborrio, nave,
   frontón, espadaña, sierra, pájaros) medidas sobre fotos reales del pueblo, y
   este script lo dibuja: rectas rectas, pocas curvas (arcos de círculo) y las
   líneas de lo que queda detrás, recortadas por lo que tiene delante (cada pieza
   lleva su `capa`: más alta, más cerca). Así no hay que dibujar a mano las
   intersecciones y las líneas no se cruzan.

   Coordenadas: lienzo de 1600 × 180; x de izquierda a derecha y `alto` desde el
   suelo (0) hacia arriba. Lo que tiene que verse en el móvil (a 320 px se ve solo
   x ∈ [475, 1125]) va en el centro. Cómo medir un pueblo nuevo: RESKIN.md, §6 bis.

   Sale un SVG sin colores ni estilos (solo <path>): aplicar.mjs lo incrusta en el
   pie, le pone pathLength="1" a cada trazo para la animación y el color lo da
   css/base.css con los tokens. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ANCHO = 1600, ALTO = 180;
const G = ALTO;                                   /* el suelo, en coordenadas SVG */
const Y = a => G - a;                             /* alto → y */
const rad = g => g * Math.PI / 180;
const red = v => Math.round(v * 10) / 10;

/* ── generador pseudoaleatorio con semilla: el mismo json da siempre el mismo dibujo ── */
function azar(semilla) {
  let s = (semilla >>> 0) || 1;
  const f = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.entre = (a, b) => a + (b - a) * f();
  f.uno = lista => lista[Math.floor(f() * lista.length)];
  return f;
}

/* ── trazos ──
   Un trazo es una lista de pasos: ['M', x, y], ['L', x, y] o ['A', cx, cy, rx, ry, a0, a1]
   (arco de elipse desde el punto actual, ángulos en grados con la y hacia abajo:
   180 = izquierda, 270 = arriba, 360 = derecha). */
const pt = (cx, cy, rx, ry, a) => [cx + rx * Math.cos(rad(a)), cy + ry * Math.sin(rad(a))];
function polilinea(puntos, cerrar = false) {
  const p = puntos.map((q, i) => [i ? 'L' : 'M', q[0], q[1]]);
  if (cerrar) p.push(['L', puntos[0][0], puntos[0][1]]);
  return p;
}
function arcoSuelto(cx, cy, rx, ry, a0, a1) {
  const [x, y] = pt(cx, cy, rx, ry, a0);
  return [['M', x, y], ['A', cx, cy, rx, ry, a0, a1]];
}
const circulo = (cx, cy, r) => arcoSuelto(cx, cy, r, r, 0, 360);
/* ventana con arco de medio punto: base (alto), tope (alto de la clave), centrada en x */
function ventanaArco(x, ancho, base, tope) {
  const r = ancho / 2, arr = tope - r;
  return [['M', x - r, Y(base)], ['L', x - r, Y(arr)], ['A', x, Y(arr), r, r, 180, 360], ['L', x + r, Y(base)], ['L', x - r, Y(base)]];
}
const rect = (x0, a0, x1, a1) => polilinea([[x0, Y(a0)], [x0, Y(a1)], [x1, Y(a1)], [x1, Y(a0)]], true);

/* puntos de un trazo cada `paso` unidades (para el contorno y para recortar) */
function muestras(trazo, paso = 0.5) {
  const out = [];
  let cur = null;
  for (const s of trazo) {
    if (s[0] === 'M') { cur = [s[1], s[2]]; out.push({ p: cur, nuevo: true }); continue; }
    if (s[0] === 'L') {
      const [x, y] = [s[1], s[2]], n = Math.max(1, Math.ceil(Math.hypot(x - cur[0], y - cur[1]) / paso));
      for (let i = 1; i <= n; i++) out.push({ p: [cur[0] + (x - cur[0]) * i / n, cur[1] + (y - cur[1]) * i / n] });
      cur = [x, y];
    } else {
      const [, cx, cy, rx, ry, a0, a1] = s, n = Math.max(2, Math.ceil(Math.abs(rad(a1 - a0)) * Math.max(rx, ry) / paso));
      for (let i = 1; i <= n; i++) out.push({ p: pt(cx, cy, rx, ry, a0 + (a1 - a0) * i / n) });
      cur = pt(cx, cy, rx, ry, a1);
    }
  }
  return out;
}

/* ── piezas ──
   Cada función devuelve { capa, trazos, contorno }: `contorno` es la silueta de
   arriba (puntos [x, y]); lo que esté detrás y por debajo de ella no se dibuja. */
function pieza(capa, clase = null) { return { capa, clase, trazos: [], contorno: [] }; }
const contornoDe = trazo => muestras(trazo, 1).map(m => m.p);

/* casas encaladas en fila: tejado a un faldón (el más común visto desde la calle), a dos aguas,
   a un agua o azotea; ventanas, alguna puerta y chimeneas */
function casas(o) {
  const z = azar(o.semilla || 1), pz = pieza(o.capa ?? 3);
  const [hmin, hmax] = o.alto, [wmin, wmax] = o.ancho || [34, 74];
  const tipos = o.tejados || ['faldon', 'faldon', 'faldon', 'dos-aguas', 'una-agua', 'plano'];
  const fila = [];
  let x = o.desde;
  while (x < o.hasta - 0.5) {
    let w = Math.round(z.entre(wmin, wmax));
    if (o.hasta - x - w < wmin * 0.7) w = o.hasta - x;
    let h = Math.round(z.entre(hmin, hmax));
    if (fila.length && Math.abs(h - fila[fila.length - 1].h) < 4) h += h + 6 <= hmax ? 6 : -6;   /* que se distingan */
    fila.push({ x0: x, x1: x + w, h, tipo: z.uno(tipos) });
    x += w;
  }
  const C = [[fila[0].x0, G]];
  const detalles = [];
  for (const c of fila) {
    const { x0, x1, h } = c, w = x1 - x0, yW = Y(h), xm = (x0 + x1) / 2;
    const chimenea = (o.chimeneas ?? 0.3) > z() && w > 30 ? Math.round(z.entre(x0 + 0.2 * w, x1 - 0.2 * w - 6)) : null;
    const conChimenea = (yt, desde, hasta) => {
      if (chimenea == null) { C.push([desde, yt], [hasta, yt]); return; }
      const xc = chimenea;
      C.push([desde, yt], [xc, yt], [xc, yt - 7], [xc - 1.5, yt - 7], [xc - 1.5, yt - 9.5], [xc + 7.5, yt - 9.5], [xc + 7.5, yt - 7], [xc + 6, yt - 7], [xc + 6, yt], [hasta, yt]);
    };
    if (c.tipo === 'faldon') {
      const t = Math.round(z.entre(5, 8));
      C.push([x0, yW]); conChimenea(yW - t, x0 + 2.5, x1 - 2.5); C.push([x1, yW]);
      detalles.push(polilinea([[x0, yW], [x1, yW]]));
    } else if (c.tipo === 'dos-aguas') {
      const pk = Math.min(13, w * 0.26);
      C.push([x0, yW], [xm, yW - pk], [x1, yW]);
    } else if (c.tipo === 'una-agua') {
      const s = Math.min(10, w * 0.17), izq = z() < 0.5;
      C.push([x0, yW - (izq ? s : 0)], [x1, yW - (izq ? 0 : s)]);
    } else {
      C.push([x0, yW]); conChimenea(yW, x0, x1); C.push([x1, yW]);
      detalles.push(polilinea([[x0, yW + 3], [x1, yW + 3]]));   /* el pretil de la azotea */
    }
    /* ventanas y puertas (solo en las filas de delante) */
    if ((o.ventanas ?? 0.75) > z() && h >= 22) {
      const n = Math.max(1, Math.floor(w / 24)), plantas = h >= 40 ? 2 : 1;
      /* la puerta primero: en una casa de una planta, las ventanas se apartan de ella */
      const xp = plantas === 1 && (o.puertas ?? 0.5) > z() && w > 26 ? x0 + w * z.entre(0.25, 0.75) : null;
      if (xp != null) detalles.push(polilinea([[xp - 3.5, G], [xp - 3.5, Y(13)], [xp + 3.5, Y(13)], [xp + 3.5, G]]));
      for (let pl = 0; pl < plantas; pl++) {
        const tope = h - 6 - pl * 17;
        for (let i = 0; i < n; i++) {
          if (z() < 0.2) continue;
          const xv = x0 + (w / n) * (i + 0.5);
          if (xp != null && Math.abs(xv - xp) < 9) continue;
          if (pl === plantas - 1 && plantas === 2 && (o.puertas ?? 0.5) > z() && i === Math.floor(n / 2)) {
            detalles.push(polilinea([[xv - 3.5, G], [xv - 3.5, Y(14)], [xv + 3.5, Y(14)], [xv + 3.5, G]]));
          } else detalles.push(rect(xv - 2.5, tope - 9, xv + 2.5, tope));
        }
      }
    }
  }
  C.push([fila[fila.length - 1].x1, G]);
  pz.trazos.push(polilinea(C));
  /* medianeras: del suelo al alero de la casa más baja */
  for (let i = 0; i + 1 < fila.length; i++) pz.trazos.push(polilinea([[fila[i].x1, G], [fila[i].x1, Y(Math.min(fila[i].h, fila[i + 1].h))]]));
  pz.trazos.push(...detalles);
  pz.contorno = C;
  return pz;
}

/* remates: pináculo (pedestal y llama) */
function pinaculo(x, base, alto = 11) {
  return [rect(x - 2, base, x + 2, base + 3), polilinea([[x - 1.8, Y(base + 3)], [x - 1.8, Y(base + 5.5)], [x, Y(base + alto)], [x + 1.8, Y(base + 5.5)], [x + 1.8, Y(base + 3)]])];
}
function cruz(x, base, alto = 8) {
  return [polilinea([[x, Y(base)], [x, Y(base + alto)]]), polilinea([[x - 2.6, Y(base + alto * 0.68)], [x + 2.6, Y(base + alto * 0.68)]])];
}

/* cúpula sobre tambor con linterna y cruz, apoyada en `base` (alto): remate de torre o pieza suelta */
function remateCupula(x, base, R) {
  const trazos = [];
  const t = R.tambor, cu = R.cupula, li = R.linterna;
  const tx0 = x - t.ancho / 2, tx1 = x + t.ancho / 2, tt = base + t.alto;
  const dome = [['M', tx0, Y(base)], ['L', tx0, Y(tt)]];
  if (t.ancho / 2 > cu.rx) dome.push(['L', x - cu.rx, Y(tt)]);
  dome.push(['A', x, Y(tt), cu.rx, cu.ry, 180, 360]);
  if (t.ancho / 2 > cu.rx) dome.push(['L', tx1, Y(tt)]);
  dome.push(['L', tx1, Y(base)]);
  trazos.push(dome, polilinea([[tx0, Y(tt)], [tx1, Y(tt)]]));          /* el anillo del tambor */
  const lb = tt + cu.ry - 1, lt = lb + li.alto, lw = li.ancho / 2, cap = li.cupula || 3;
  trazos.push([['M', x - lw, Y(lb)], ['L', x - lw, Y(lt)], ['L', x - lw - 0.8, Y(lt)], ['A', x, Y(lt), lw + 0.8, cap, 180, 360], ['L', x + lw, Y(lt)], ['L', x + lw, Y(lb)]]);
  if (li.vano) trazos.push(ventanaArco(x, li.vano.ancho, lb + li.vano.base, lb + li.vano.tope));
  const top = lt + cap;
  if (R.cruz) trazos.push(...cruz(x, top, R.cruz));
  /* la cúpula hasta la linterna, la linterna y otra vez la cúpula */
  const cup = contornoDe(dome);
  return { trazos, contorno: [...cup.filter(p => p[0] < x - lw), [x - lw - 0.8, Y(lt)], [x, Y(top)], [x + lw + 0.8, Y(lt)], ...cup.filter(p => p[0] > x + lw)] };
}
function cupula(o) {
  const pz = pieza(o.capa ?? 2), r = remateCupula(o.x, o.base, o);
  pz.trazos.push(...r.trazos);
  pz.contorno = r.contorno;
  return pz;
}

/* torre: fuste hasta el campanario, cornisa volada, vano de campanas en arco, óculo o reloj,
   y el remate: cúpula con tambor y linterna, o chapitel apuntado; pináculos en las esquinas */
function torre(o) {
  const pz = pieza(o.capa ?? 2);
  const xl = o.x - o.ancho / 2, xr = o.x + o.ancho / 2, v = o.vuelo ?? 2.5;
  const c1 = o.cornisa, c0 = c1 - (o.grueso ?? 4);          /* cornisa de arriba del campanario: de c0 a c1 */
  const cuerpo = [[xl, G], [xl, Y(c0)], [xl - v, Y(c0)], [xl - v, Y(c1)], [xr + v, Y(c1)], [xr + v, Y(c0)], [xr, Y(c0)], [xr, G]];
  pz.trazos.push(polilinea(cuerpo));
  const C = [];                                             /* la silueta por encima de la cornisa */
  for (const a of o.lineas || []) pz.trazos.push(polilinea([[xl, Y(a)], [xr, Y(a)]]));
  if (o.vano) pz.trazos.push(ventanaArco(o.x, o.vano.ancho, o.vano.base, o.vano.tope));
  if (o.oculo) pz.trazos.push(circulo(o.x, Y(o.oculo.alto), o.oculo.r));
  if (o.reloj) { pz.trazos.push(circulo(o.x, Y(o.reloj.alto), o.reloj.r)); pz.trazos.push(polilinea([[o.x, Y(o.reloj.alto + o.reloj.r * 0.6)], [o.x, Y(o.reloj.alto)], [o.x + o.reloj.r * 0.45, Y(o.reloj.alto)]])); }
  const R = o.remate || {};
  if (R.tipo === 'cupula') {
    const r = remateCupula(o.x, c1, R);
    pz.trazos.push(...r.trazos);
    C.push(...r.contorno);
  } else if (R.tipo === 'chapitel') {
    const s = R.ancho, a0 = c1, xa = o.x - s / 2, xb = o.x + s / 2, top = a0 + Math.sqrt(3) / 2 * s;
    const ch = [['M', xa, Y(a0)], ['A', xa + s, Y(a0), s, s, 180, 240], ['A', xb - s, Y(a0), s, s, 300, 360]];
    pz.trazos.push(ch);
    pz.trazos.push(circulo(o.x, Y(top + 1.6), 1.6));
    if (R.cruz) pz.trazos.push(...cruz(o.x, top + 3.2, R.cruz));
    C.push(...contornoDe(ch));
  }
  const pin = [];
  if (o.pinaculos) for (const xp of [xl - v + 2, xr + v - 2]) {
    pz.trazos.push(...pinaculo(xp, c1, o.pinaculos));
    pin.push([[xp - 2, Y(c1)], [xp - 2, Y(c1 + 3)], [xp, Y(c1 + o.pinaculos)], [xp + 2, Y(c1 + 3)], [xp + 2, Y(c1)]]);
  }
  pz.contorno = [[xl, G], [xl, Y(c0)], [xl - v, Y(c0)], [xl - v, Y(c1)], ...(pin[0] || []), ...C, ...(pin[1] || []), [xr + v, Y(c1)], [xr + v, Y(c0)], [xr, Y(c0)], [xr, G]];
  return pz;
}

/* cuerpo de fachada entre dos torres: remate (con balaustrada), líneas de cornisa, óculos y ventanas */
function cuerpo(o) {
  const pz = pieza(o.capa ?? 2);
  pz.trazos.push(o.muros ? polilinea([[o.desde, G], [o.desde, Y(o.alto)], [o.hasta, Y(o.alto)], [o.hasta, G]]) : polilinea([[o.desde, Y(o.alto)], [o.hasta, Y(o.alto)]]));
  for (const a of o.lineas || []) pz.trazos.push(polilinea([[o.desde, Y(a)], [o.hasta, Y(a)]]));
  const B = o.balaustrada;
  if (B) {
    pz.trazos.push(polilinea([[o.desde, Y(B.base)], [o.hasta, Y(B.base)]]));
    const pilares = [o.desde + 2.5, (o.desde + o.hasta) / 2, o.hasta - 2.5];
    for (const xp of pilares.slice(1, -1)) pz.trazos.push(rect(xp - 2, B.base, xp + 2, o.alto));
    const n = B.balaustres || 12, tramo = (pilares[1] - pilares[0] - 4) / (n / 2);
    for (let k = 0; k < 2; k++) for (let i = 0; i < n / 2; i++) {
      const xb = pilares[k] + (k ? 2 : 0) + tramo * (i + 0.5);
      pz.trazos.push(polilinea([[xb, Y(B.base + 1.5)], [xb, Y(o.alto - 1.5)]]));
    }
  }
  for (const oc of o.oculos || []) pz.trazos.push(circulo(oc.x, Y(oc.alto), oc.r));
  for (const v of o.ventanas || []) pz.trazos.push(ventanaArco(v.x, v.ancho, v.base, v.tope));
  pz.contorno = [[o.desde, G], [o.desde, Y(o.alto)], [o.hasta, Y(o.alto)], [o.hasta, G]];
  return pz;
}

/* cimborrio: tejado ochavado sobre el crucero, con su linterna */
function cimborrio(o) {
  const pz = pieza(o.capa ?? 1);
  const xc = (o.desde + o.hasta) / 2, p = o.plano / 2;
  const tejado = [[o.desde, Y(o.base)], [xc - p, Y(o.tope)], [xc + p, Y(o.tope)], [o.hasta, Y(o.base)]];
  pz.trazos.push(polilinea(tejado), polilinea([[o.desde, Y(o.base)], [o.hasta, Y(o.base)]]));
  pz.trazos.push(polilinea([[o.desde + 2, Y(o.base)], [o.desde + 2, G]]), polilinea([[o.hasta - 2, Y(o.base)], [o.hasta - 2, G]]));
  const C = [[o.desde, G], ...tejado, [o.hasta, G]];
  const L = o.linterna;
  if (L) {
    const lx0 = xc - L.ancho / 2, lx1 = xc + L.ancho / 2, lt = o.tope + L.alto, v = 2.2, rt = lt + L.tejado;
    pz.trazos.push(polilinea([[lx0, Y(o.tope)], [lx0, Y(lt)], [lx1, Y(lt)], [lx1, Y(o.tope)]]));
    const tej = [[lx0 - v, Y(lt)], [xc, Y(rt)], [lx1 + v, Y(lt)]];
    pz.trazos.push(polilinea([[lx0 - v, Y(lt)], [lx1 + v, Y(lt)]]), polilinea(tej));
    if (L.vano) pz.trazos.push(ventanaArco(xc, L.vano.ancho, o.tope + L.vano.base, o.tope + L.vano.tope));
    if (L.cruz) pz.trazos.push(polilinea([[xc, Y(rt)], [xc, Y(rt + 3)]]), ...cruz(xc, rt + 3, L.cruz));
    C.splice(3, 0, [lx0, Y(o.tope)], [lx0, Y(lt)], [lx0 - v, Y(lt)], [xc, Y(rt)], [lx1 + v, Y(lt)], [lx1, Y(lt)], [lx1, Y(o.tope)]);
  }
  pz.contorno = C;
  return pz;
}

/* nave: muros y tejado a un faldón (forma "faldon") o a un agua ("una-agua") */
function nave(o) {
  const pz = pieza(o.capa ?? 1);
  const T = o.forma === 'una-agua'
    ? [[o.desde, Y(o.izquierda)], [o.hasta, Y(o.derecha)]]
    : [[o.desde, Y(o.alero)], [o.desde + (o.cumbrera - o.alero) * 1.6, Y(o.cumbrera)], [o.hasta - (o.cumbrera - o.alero) * 1.6, Y(o.cumbrera)], [o.hasta, Y(o.alero)]];
  const C = [[o.desde, G], ...T, [o.hasta, G]];
  pz.trazos.push(polilinea(C));
  if (o.forma !== 'una-agua') pz.trazos.push(polilinea([[o.desde, Y(o.alero)], [o.hasta, Y(o.alero)]]));
  for (const x of o.contrafuertes || []) pz.trazos.push(polilinea([[x - 2, G], [x - 2, Y(o.alero - 6)], [x + 2, Y(o.alero - 12)], [x + 2, G]]));
  pz.contorno = C;
  return pz;
}

/* casa grande de dos plantas con frontón mixtilíneo (curva cóncava y voluta), balcones y portada */
function fronton(o) {
  const pz = pieza(o.capa ?? 3);
  const a = o.ancho, cx = o.centro, r1 = o.curva, r2 = o.voluta, e = o.alero;
  const xl = cx - a / 2, xr = cx + a / 2, top = e + r1 + r2;
  const perfil = [['M', o.desde, G], ['L', o.desde, Y(e)], ['L', xl, Y(e)],
    ['A', xl, Y(e + r1), r1, r1, 90, 0], ['A', xl + r1 + r2, Y(e + r1), r2, r2, 180, 270],
    ['L', xr - r1 - r2, Y(top)], ['A', xr - r1 - r2, Y(e + r1), r2, r2, 270, 360], ['A', xr, Y(e + r1), r1, r1, 180, 90],
    ['L', o.hasta, Y(e)], ['L', o.hasta, G]];
  pz.trazos.push(perfil);
  pz.trazos.push(polilinea([[o.desde, Y(e - 2.5)], [o.hasta, Y(e - 2.5)]]));      /* la cornisa */
  if (o.escudo) pz.trazos.push([['M', cx, Y(top)], ['A', cx, Y(top + o.escudo), o.escudo * 0.7, o.escudo, 90, 450]]);
  /* balcones arriba (ventana en arco y repisa), rejas abajo y la portada en el eje */
  const n = o.huecos || 4, paso = (o.hasta - o.desde) / n;
  for (let i = 0; i < n; i++) {
    const xv = o.desde + paso * (i + 0.5);
    pz.trazos.push(ventanaArco(xv, 7, e - 21, e - 9), polilinea([[xv - 6, Y(e - 21)], [xv + 6, Y(e - 21)]]));
    if (Math.abs(xv - cx) > paso * 0.6) pz.trazos.push(rect(xv - 4, 9, xv + 4, 22));
  }
  pz.trazos.push(polilinea([[cx - 5, G], [cx - 5, Y(17)], [cx + 5, Y(17)], [cx + 5, G]]), polilinea([[cx - 7.5, Y(19.5)], [cx + 7.5, Y(19.5)]]));
  pz.contorno = [[o.desde, G], ...contornoDe(perfil.slice(1, -1).map((s, i) => (i === 0 ? ['M', s[1], s[2]] : s))), [o.hasta, G]];
  if (o.escudo) pz.contorno.push([cx - o.escudo * 0.7, Y(top + o.escudo)], [cx, Y(top + 2 * o.escudo)], [cx + o.escudo * 0.7, Y(top + o.escudo)]);
  return pz;
}

/* espadaña: el muro de las campanas sobre la fachada, con UN vano (una sola puerta, nunca una arcada) */
function espadana(o) {
  const pz = pieza(o.capa ?? 2);
  const xl = o.x - o.ancho / 2, xr = o.x + o.ancho / 2;
  const C = [[xl, Y(o.base)], [xl, Y(o.hombro)], [xl - 1.5, Y(o.hombro)], [o.x, Y(o.tope)], [xr + 1.5, Y(o.hombro)], [xr, Y(o.hombro)], [xr, Y(o.base)]];
  pz.trazos.push(polilinea(C));
  const v = o.vano;
  pz.trazos.push(ventanaArco(o.x, v.ancho, v.base, v.tope));
  /* la campana */
  const cb = v.base + 1.5, ca = v.tope - v.ancho / 2 - 1;
  pz.trazos.push([['M', o.x - 3.4, Y(cb)], ['L', o.x - 2.4, Y(ca - 2.2)], ['A', o.x, Y(ca - 2.2), 2.4, 2.4, 180, 360], ['L', o.x + 3.4, Y(cb)], ['L', o.x - 3.4, Y(cb)]]);
  if (o.cruz) pz.trazos.push(...cruz(o.x, o.tope, o.cruz));
  pz.contorno = C;
  return pz;
}

/* sierra o lomas al fondo: una línea fina (clase «lejos») */
function sierra(o) {
  const pz = pieza(o.capa ?? 0, 'lejos');
  const C = o.puntos.map(([x, a]) => [x, Y(a)]);
  pz.trazos.push(polilinea(C));
  pz.contorno = C;
  return pz;
}

/* pájaros (los cernícalos de las torres): dos alas en arco */
function pajaros(o) {
  const pz = pieza(o.capa ?? 9);
  for (const [x, a, s] of o.puntos) {
    const y = Y(a), r = Math.hypot(s / 2, s * 0.35), ang = Math.atan2(-0.35 * s, s / 2) * 180 / Math.PI;
    pz.trazos.push([['M', x - s, y], ['A', x - s / 2, y + s * 0.35, r, r, 180 - ang, 360 + ang], ['A', x + s / 2, y + s * 0.35, r, r, 180 - ang, 360 + ang]]);
  }
  return pz;
}

const PIEZAS = { casas, torre, cupula, cuerpo, cimborrio, nave, fronton, espadana, sierra, pajaros };

/* ── ocultación: lo de detrás no se dibuja por debajo de la silueta de lo de delante ── */
function alturaEn(contorno, x) {
  let y = Infinity;
  for (let i = 0; i + 1 < contorno.length; i++) {
    const [x0, y0] = contorno[i], [x1, y1] = contorno[i + 1];
    if (x < Math.min(x0, x1) - 1e-9 || x > Math.max(x0, x1) + 1e-9) continue;
    const yy = x1 === x0 ? Math.min(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    if (yy < y) y = yy;
  }
  return y;
}
function recortar(trazo, delante) {
  if (!delante.length) return [trazo];
  const oculto = ([x, y]) => delante.some(c => y > alturaEn(c, x) + 0.35);
  /* se recorre paso a paso; un tramo recto que se ve entero se queda recto, un arco entero se
     queda arco; lo que se corta se aproxima con los puntos muestreados (cada media unidad) */
  const out = [];
  let actual = null, cur = null;
  const cerrar = () => { if (actual && actual.length > 1) out.push(actual); actual = null; };
  for (const s of trazo) {
    if (s[0] === 'M') { cerrar(); cur = [s[1], s[2]]; continue; }
    const ms = muestras([['M', cur[0], cur[1]], s], 0.5).map(m => m.p);
    const vis = ms.map(p => !oculto(p));
    if (vis.every(Boolean)) {
      if (!actual) actual = [['M', cur[0], cur[1]]];
      actual.push(s);
    } else {
      for (let i = 0; i < ms.length; i++) {
        if (vis[i]) {
          if (!actual) actual = [['M', ms[i][0], ms[i][1]]];
          else if (s[0] === 'A' || i === ms.length - 1 || !vis[i + 1]) actual.push(['L', ms[i][0], ms[i][1]]);
        } else cerrar();
      }
    }
    cur = s[0] === 'L' ? [s[1], s[2]] : pt(s[1], s[2], s[3], s[4], s[6]);
  }
  cerrar();
  return out.filter(t => { const m = muestras(t, 1); return m.length > 2; });
}

/* ── a SVG ── */
function dDe(trazo) {
  let d = '', cur = null;
  for (const s of trazo) {
    if (s[0] === 'M' || s[0] === 'L') { d += s[0] + red(s[1]) + ' ' + red(s[2]); cur = [s[1], s[2]]; continue; }
    const [, cx, cy, rx, ry, a0, a1] = s;
    /* un arco de más de 180° se parte en dos (en SVG un arco no puede volver a su origen) */
    const tramos = Math.abs(a1 - a0) > 180 ? [[a0, (a0 + a1) / 2], [(a0 + a1) / 2, a1]] : [[a0, a1]];
    for (const [b0, b1] of tramos) {
      const [x, y] = pt(cx, cy, rx, ry, b1);
      d += `A${red(rx)} ${red(ry)} 0 ${Math.abs(b1 - b0) > 180 ? 1 : 0} ${b1 > b0 ? 1 : 0} ${red(x)} ${red(y)}`;
      cur = [x, y];
    }
  }
  return d;
}

export function dibujar(desc) {
  const piezas = (desc.piezas || []).map(p => {
    const f = PIEZAS[p.tipo];
    if (!f) throw new Error('perfil: no hay pieza «' + p.tipo + '» (' + Object.keys(PIEZAS).join(', ') + ')');
    return f(p);
  });
  const caminos = [];
  for (const pz of piezas) {
    const delante = piezas.filter(q => q.capa > pz.capa && q.contorno.length).map(q => q.contorno);
    for (const t of pz.trazos) for (const r of recortar(t, delante)) caminos.push({ d: dDe(r), clase: pz.clase });
  }
  const nombre = String(desc.nombre || 'perfil').replace(/[^\w-]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" data-perfil="${nombre}">\n` +
    caminos.map(c => `<path${c.clase ? ` class="${c.clase}"` : ''} d="${c.d}"/>`).join('\n') + '\n</svg>\n';
}

/* el perfil genérico: un pueblo extremeño cualquiera (casas encaladas, tejados, chimeneas y una
   iglesia con espadaña de un solo vano). Lo usa aplicar.mjs si marca/perfil.svg no existe */
export const GENERICO = {
  nombre: 'generico',
  _leeme: 'Perfil de respaldo para cualquier pueblo: no representa ninguno.',
  piezas: [
    { tipo: 'sierra', puntos: [[-4, 64], [120, 70], [260, 79], [380, 74], [520, 84], [640, 90], [760, 86], [900, 92], [1040, 84], [1180, 88], [1320, 78], [1460, 72], [1604, 66]] },
    { tipo: 'casas', capa: 1, desde: -4, hasta: 690, alto: [40, 58], semilla: 11, ventanas: 0, chimeneas: 0.4 },
    { tipo: 'casas', capa: 1, desde: 930, hasta: 1604, alto: [40, 58], semilla: 12, ventanas: 0, chimeneas: 0.4 },
    { tipo: 'nave', capa: 2, desde: 782, hasta: 930, alero: 54, cumbrera: 66 },
    { tipo: 'cuerpo', capa: 2, muros: true, desde: 706, hasta: 782, alto: 74, lineas: [70], oculos: [{ x: 744, alto: 50, r: 6 }], ventanas: [{ x: 744, ancho: 15, base: 0, tope: 30 }] },
    { tipo: 'espadana', capa: 2, x: 744, ancho: 40, base: 74, hombro: 112, tope: 130, vano: { ancho: 13, base: 86, tope: 106 }, cruz: 11 },
    { tipo: 'casas', capa: 3, desde: -4, hasta: 690, alto: [24, 46], semilla: 21, chimeneas: 0.35 },
    { tipo: 'casas', capa: 3, desde: 800, hasta: 960, alto: [16, 30], semilla: 22, chimeneas: 0.25 },
    { tipo: 'casas', capa: 3, desde: 960, hasta: 1604, alto: [24, 46], semilla: 23, chimeneas: 0.35 }
  ]
};

/* ── línea de órdenes ── */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generico = process.argv.includes('--generico');
  const origen = generico ? null : path.join(RAIZ, 'marca', 'perfil.json');
  if (origen && !fs.existsSync(origen)) { console.error('Falta marca/perfil.json (ver RESKIN.md, «El perfil del pueblo»). Sin él, la web usa el perfil genérico.'); process.exit(1); }
  const desc = generico ? GENERICO : JSON.parse(fs.readFileSync(origen, 'utf8'));
  const svg = dibujar(desc);
  const destino = generico ? path.join(RAIZ, 'fuente', '_perfil_generico.svg') : path.join(RAIZ, 'marca', 'perfil.svg');
  fs.writeFileSync(destino, svg);
  console.log(`✓ ${path.relative(RAIZ, destino)}: ${(svg.match(/<path/g) || []).length} trazos, ${(svg.length / 1024).toFixed(1)} kB`);
}
