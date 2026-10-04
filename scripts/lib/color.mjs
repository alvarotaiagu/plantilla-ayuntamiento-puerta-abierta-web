/* Color: parseo, mezcla, contraste WCAG y OKLCH.
   Todo se calcula aquí, en el script, y se escribe como hex en css/marca.css:
   así el contraste se audita contra el valor real y no contra un color-mix
   que la herramienta no sabe leer (memoria «acento del cliente y contraste»).
   Viene de plantilla-veterinaria-web; lo propio del ayuntamiento es
   derivarTokens() y paletaGirada(). */

export function hexARgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error('Color no válido: ' + hex);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

export function rgbAHex([r, g, b]) {
  const c = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

/* mezcla en sRGB: p = proporción de b (0 → a, 1 → b), igual que color-mix */
export function mezclar(a, b, p) {
  const A = hexARgb(a), B = hexARgb(b);
  return rgbAHex(A.map((v, i) => v + (B[i] - v) * p));
}

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const delin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ── OKLCH ── */
export function hexAOklch(hex) {
  const [r, g, b] = hexARgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(A, B);
  let H = Math.atan2(B, A) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

function oklchARgbLineal({ L, C, H }) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
}

/* fuera de gama se baja el croma, no se recorta canal a canal (cambiaría el matiz) */
export function oklchAHex({ L, C, H }) {
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = oklchARgbLineal({ L, C: c, H });
    if (rgb.every(v => v >= -0.0005 && v <= 1.0005)) return rgbAHex(rgb.map(v => delin(Math.min(1, Math.max(0, v)))));
    c *= 0.93;
  }
  return rgbAHex(oklchARgbLineal({ L, C: 0, H }).map(v => delin(Math.min(1, Math.max(0, v)))));
}

/* Oscurece en OKLCH (baja L, conserva matiz y, en lo posible, croma) hasta que
   el color dé `objetivo` contra TODOS los fondos. Es «el sinople del escudo,
   oscurecido hasta AA»: sigue siendo el mismo verde, no un verde cualquiera. */
export function oscurecerHasta(color, fondos, objetivo = 4.6) {
  const o = hexAOklch(color);
  for (let L = o.L; L > 0.05; L -= 0.005) {
    const c = oklchAHex({ L, C: o.C, H: o.H });
    if (fondos.every(f => contraste(c, f) >= objetivo)) return c;
  }
  return '#000000';
}

/* El más apagado posible de `tinta` hacia `fondo` que aún da `objetivo`. */
export function apagadoMaximo(tinta, fondos, objetivo = 4.6) {
  let mejor = tinta;
  for (let p = 0.02; p <= 0.8; p += 0.02) {
    const c = mezclar(tinta, fondos[0], p);
    if (fondos.every(f => contraste(c, f) >= objetivo)) mejor = c; else break;
  }
  return mejor;
}

/* Nombre de matiz para los botones del mando de paleta. */
export function nombreMatiz(hex) {
  const { L, H, C } = hexAOklch(hex);
  if (C < 0.03) return 'Gris';
  /* el púrpura heráldico se pinta apagado (el león de Segura de León, #90546E): por matiz caería
     en carmín. La misma regla que scripts/marca-desde-escudo.py */
  if (C < 0.12 && L < 0.62 && (H >= 320 || H < 15)) return 'Púrpura';
  if (H < 20 || H >= 350) return 'Carmín';
  if (H < 45) return 'Bermellón';
  if (H < 75) return 'Almagre';
  if (H < 110) return 'Ocre';
  if (H < 135) return 'Oliva';
  if (H < 175) return 'Sinople';
  if (H < 215) return 'Turquesa';
  if (H < 275) return 'Azur';
  if (H < 315) return 'Violeta';
  return 'Púrpura';
}

/* ─────────────────────────────────────────────────────────────────────────
   Tokens de la plantilla municipal a partir de marca.json → colores:
     papel, superficie, tinta   la cal, la hoja y la tinta (no cambian entre paletas)
     marca                      el esmalte principal del escudo, tal cual
     oro                        decoración: filetes, marca de «hoy», mes actual
     alerta                     gules: franja urgente y 112
   Devuelve { tokens, informe }.
   ───────────────────────────────────────────────────────────────────────── */
export function derivarTokens(col) {
  const BLANCO = '#FFFFFF';
  const { papel, superficie, tinta } = col;
  const t = {};
  t['--papel'] = papel;
  t['--superficie'] = superficie;
  t['--tinta'] = tinta;
  t['--marca-escudo'] = col.marca;
  t['--marca-tenue'] = mezclar(superficie, col.marca, 0.09);
  t['--superficie-2'] = mezclar(papel, tinta, 0.035);
  const clarosTexto = [papel, superficie, t['--superficie-2'], t['--marca-tenue']];
  t['--apagado'] = apagadoMaximo(tinta, clarosTexto);
  /* la marca como texto, botón y contorno del arco: oscurecida hasta AA sobre
     todos los fondos claros (y, por tanto, con texto blanco encima) */
  t['--marca'] = oscurecerHasta(col.marca, [...clarosTexto, BLANCO], 4.8);
  t['--marca-fuerte'] = oscurecerHasta(t['--marca'], [BLANCO], 7.5);
  t['--sobre-marca'] = BLANCO;
  t['--sobre-marca-apagado'] = mezclar(BLANCO, t['--marca'], 0.1);
  t['--linea'] = mezclar(papel, tinta, 0.14);
  t['--linea-fuerte'] = apagadoMaximo(tinta, [papel, superficie], 3.2);
  t['--oro'] = col.oro;
  t['--alerta'] = oscurecerHasta(col.alerta, [BLANCO], 5.6);
  t['--sobre-alerta'] = BLANCO;
  /* avisos programados o informativos (un corte de agua anunciado): el oro del escudo llevado al
     ámbar (matiz 70 en OKLCH, con su luminosidad y su croma) y oscurecido hasta AA con texto
     blanco. El rojo queda solo para lo urgente: un corte anunciado no puede parecer una alarma */
  const oroOk = hexAOklch(col.oro);
  t['--aviso'] = oscurecerHasta(oklchAHex({ L: oroOk.L, C: oroOk.C, H: 70 }), [BLANCO], 4.8);
  t['--sobre-aviso'] = BLANCO;
  t['--foco'] = t['--marca'];
  t['--foco-claro'] = BLANCO;
  t['--cortina'] = mezclar(papel, tinta, 0.05);           /* cal en sombra: nunca el color de lo que destapa */
  /* banda oscura de la portada («El año»): la tinta de fondo, la cal como texto,
     un apagado medido y las tarjetas un punto más claras. El oro, solo de acento */
  t['--oscuro'] = tinta;
  t['--superficie-oscura'] = mezclar(tinta, papel, 0.07);
  t['--sobre-oscuro'] = papel;
  t['--sobre-oscuro-apagado'] = apagadoMaximo(papel, [t['--superficie-oscura'], tinta], 4.6);
  t['--linea-oscura'] = mezclar(tinta, papel, 0.24);

  const informe = [
    ['texto', '--tinta', '--papel', 4.5],
    ['texto', '--tinta', '--superficie', 4.5],
    ['texto', '--tinta', '--superficie-2', 4.5],
    ['texto', '--apagado', '--papel', 4.5],
    ['texto', '--apagado', '--superficie', 4.5],
    ['texto', '--apagado', '--superficie-2', 4.5],
    ['texto', '--apagado', '--marca-tenue', 4.5],
    ['texto', '--marca', '--papel', 4.5],
    ['texto', '--marca', '--superficie', 4.5],
    ['texto', '--marca', '--marca-tenue', 4.5],
    ['botón', '--sobre-marca', '--marca', 4.5],
    ['botón', '--sobre-marca', '--marca-fuerte', 4.5],
    ['banda', '--sobre-marca-apagado', '--marca', 4.5],
    ['alerta', '--sobre-alerta', '--alerta', 4.5],
    ['aviso', '--sobre-aviso', '--aviso', 4.5],
    ['aviso', '--aviso', '--papel', 3],
    ['foco', '--foco-claro', '--aviso', 3],
    ['borde', '--linea-fuerte', '--papel', 3],
    ['borde', '--linea-fuerte', '--superficie', 3],
    ['foco', '--foco', '--papel', 3],
    ['foco', '--foco', '--superficie', 3],
    ['foco', '--foco-claro', '--marca', 3],
    ['foco', '--foco-claro', '--alerta', 3],
    ['cortina', '--marca', '--cortina', 3],
    ['oscura', '--sobre-oscuro', '--oscuro', 4.5],
    ['oscura', '--sobre-oscuro', '--superficie-oscura', 4.5],
    ['oscura', '--sobre-oscuro-apagado', '--oscuro', 4.5],
    ['oscura', '--sobre-oscuro-apagado', '--superficie-oscura', 4.5],
    ['oscura', '--tinta', '--oro', 4.5],
    ['foco', '--foco-claro', '--oscuro', 3],
    ['foco', '--foco-claro', '--superficie-oscura', 3]
  ].map(([uso, a, b, min]) => ({ uso, texto: a, fondo: b, ratio: +contraste(t[a], t[b]).toFixed(2), min }));

  return { tokens: t, informe };
}

/* Paletas B y C del mando: se gira el matiz del esmalte principal conservando
   luminosidad y croma; luego se oscurece con la misma regla, así que la
   estructura de contraste es la misma. Papel, tinta, oro y alerta no cambian. */
export function paletaGirada(col, grados) {
  const o = hexAOklch(col.marca);
  return { ...col, marca: oklchAHex({ L: o.L, C: o.C, H: (o.H + grados + 360) % 360 }) };
}
