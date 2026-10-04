# Informe · rama `claude/v3b-pueblo` (fotos, «El pueblo», mapas e idiomas)

Noche del 3 de octubre de 2026. La rama parte de `v3` y solo toca la zona «pueblo». Resultado de la verificación completa: **`node scripts/verificar.mjs` → ✓ 141 de 141 comprobaciones (las 135 de antes y las 6 nuevas), en 644 s**.

## Lo que hay que saber primero

1. **Overpass no responde desde esta nube.** El proxy de salida del entorno corta con un 403 la conexión a los tres servidores de Overpass (`overpass-api.de`, `overpass.private.coffee` y `overpass.kumi.systems`). Es una política de la red y no la he intentado esquivar. Por eso:
   - `scripts/termino.mjs` está **listo pero sin ejecutar contra OSM**. En Ribera, la sección del mapa del término **no sale** hasta que alguien lo ejecute con red: `node scripts/termino.mjs && node scripts/aplicar.mjs`, y suba `marca/termino.svg` y `marca/termino.json`.
   - **No hay ids de OSM reales** del término ni de los lugares: no los he podido consultar y no me los invento. Saldrán en `marca/termino.json` (`relacion`, `casco_osm`, `carreteras_osm`, `rutas[].osm`, `lugares[].osm`) cuando se ejecute.
   - Para probar el mapa, `pruebas/termino/muestra-overpass.json` es una **muestra sintética**: contorno inventado, carreteras «XX-1» y «XX-2» y ids falsos (90000xx). `verificar.mjs` solo la aplica en una copia, y allí sale con la etiqueta «Ejemplo». No es el término de Ribera.
   - Al ejecutarlo de verdad, **mira los avisos**. Casi seguro que «Ermita del Cristo» en OSM encaja con dos ermitas nuestras (la de la Misericordia y el Cristo Viejo); en ese caso el script no la pone y pide `--lugar "Nombre=node/…"`.
2. **Playwright 1.63 frente al Chromium de la imagen.** `npx playwright install` no puede descargar nada (`cdn.playwright.dev` también da 403). He verificado con el Chromium 141 que trae la imagen, enlazado desde una carpeta aparte (`PLAYWRIGHT_BROWSERS_PATH`) con los nombres que espera la 1.63. No he tocado nada del repo por esto. En local, con el navegador de la 1.63, debería dar lo mismo.
3. Las fotos «originales» de `media/originales/` son las de `media/` tal como estaban en `v3`, es decir, ya recortadas y graduadas por `scripts/fotos.py`. Los originales de cámara están en `plantilla-ayuntamiento-bocetos`, que no está en esta nube. El igualado parte de ahí y es repetible. Si se quiere partir de los de cámara: `fotos.py --lote`, luego `fotos-igualar.py --guardar-originales` sobre una `media/originales/` vacía.

## V15 · Igualar las fotos

`scripts/fotos-igualar.py` (Python con Pillow y numpy, como `fotos.py`) aplica **el mismo tratamiento de color a todas**. No recorta, no cambia fondos y no inventa nada. Trabaja siempre desde `media/originales/<nombre>.jpg`, que se conserva, y regenera `<nombre>.jpg` (1600 px como mucho, o el tamaño del original) y `<nombre>-800.jpg`. **Idempotente**: repetirlo da los mismos bytes (comprobado y probado en `verificar.mjs`).

| Paso | Parámetro | Por qué |
|---|---|---|
| Balance de blancos sobre los grises de la foto (croma < 0,10 y luz media o clara) | fuerza 0,6; ganancia por canal ±7 %; solo si hay ≥ 3 % de grises | Quita la dominante fría del oppidum y la del lavadero sin dejar las fotos muertas. Sin grises (los dulces) apenas se toca |
| Niveles sobre la luminancia: 0,5 % → 0,025 y 99,5 % → 0,965 | estiramiento ×1,3 como mucho | Es lo que levanta los **dulces** (la peor: oscura, con el blanco en 0,64). A las buenas casi no les cambia nada (×0,97–1,06) |
| Gamma hacia una mediana común de 0,52 | entre 0,8 y 1,1 | Probé primero con 0,50 y un tope de 1,15: oscurecía de más la Casa de la Cultura (fachada blanca). Con 1,10 las claras solo ganan cuerpo |
| Saturación hacia una croma media común de 0,115 | factor entre 0,85 y 1,12 | Baja el lavadero y los dulces (×0,85) y sube un poco el pozo y la avenida. La Casa de la Cultura, casi en blanco y negro, sigue casi en blanco y negro (no se inventa color) |
| Tono cálido común | +1,2 % de rojo y −1,2 % de azul, solo en medios tonos | Une la familia sin teñir los blancos de la cal |
| Nitidez | máscara de enfoque de radio 1, 35 % y umbral 3, después de reducir | Las de 728–1024 px ganan un poco al verse en el carril |

Lo medido y lo aplicado a cada foto queda en `media/_igualado.json`. La hoja de contacto, en `media/_comparativa-igualado.jpg` (antes arriba, después abajo; nada la enlaza). Croma media antes: de 0,022 a 0,179; después: de 0,032 a 0,165. Lo más visible: los dulces (más luz y menos naranja), el pozo (sin velo) y el oppidum (sin el azul).

## V16 · Mapa del término en «El pueblo»

- **`scripts/termino.mjs`**, con lo común en `scripts/lib/osm.mjs` (Overpass con tres servidores, Douglas-Peucker, coser anillos, comparar nombres). Busca la relación `boundary=administrative` + `admin_level=8` con el nombre de `municipio.json`. Dentro de esa área toma:
  - el nodo `place` del pueblo;
  - el casco (`landuse=residential` a menos de 2 km);
  - las carreteras (de `motorway` a `tertiary`, con su `ref`);
  - las rutas que haya como relaciones `route=hiking|foot|bicycle|mtb`;
  - los elementos con nombre parecido a los de `pueblo.lugares` y `pueblo.patrimonio`.

  Un lugar solo vale si está **dentro del término**: así es el de Ribera y no el de otro pueblo. Si hay ambigüedad, no se pone y el script avisa; se fija con `--lugar`. También tiene `--relacion`, `--guardar` y `--desde`. User-Agent genérico del proyecto, sin datos de nadie.
- **Salida**:
  - `marca/termino.svg`: solo geometría y rótulos, sin colores; lleva `data-termino="<slug>"`.
  - `marca/termino.json`: fuente, licencia, atribución, fecha, todos los ids de OSM, escala y la posición de cada lugar.
- **`aplicar.mjs`**: pinta en `fuente/pueblo.html` la sección «El término en un mapa», justo después de «Qué ver». Lleva:
  - los puntos numerados enlazados a `#lugar-<slug>` (los del carril o las **filas del patrimonio, que ahora llevan ancla** si no son ya un lugar);
  - la lista de lugares en texto;
  - la leyenda en palabras (discontinua, sombreada, gruesa, de puntos), no solo color;
  - la escala;
  - «© colaboradores de OpenStreetMap» con enlace.

  El SVG va `aria-hidden` con sus enlaces fuera del Tabulador (`tabindex="-1"`): el teclado y el lector de pantalla usan la lista. La escala es uniforme y el `max-width` va en la figura, no en el `<svg>`.

  `aplicar.mjs` se niega a escribir si el mapa es de otro municipio o le falta la atribución. **Sin los dos archivos, la sección no sale**, como ahora en Ribera.

## F12 · «El pueblo» en inglés y portugués

- `pueblo-en.html` y `pueblo-pt.html` (en la raíz, como el resto de páginas que genera `aplicar.mjs`). Salen desde `contenido/pueblo.en.json` y `contenido/pueblo.pt.json`, una traducción completa y revisada de todos los textos de «El pueblo». Los nombres propios y los topónimos se quedan como están: Oppidum de Hornachuelos, Calle Larga, Cañada Real Leonesa, Casa de la Cultura. Los platos y las fiestas con nombre propio se dejan y se explican entre paréntesis. El portugués es el de Portugal, por vecindad («Câmara Municipal», «sítio», «percurso»).
- Las etiquetas de la plantilla («Qué ver», la leyenda del mapa…) salen ahora de `T_ES` en `aplicar.mjs`. Cada idioma las cambia con `ui`. La página en castellano sale **idéntica** (comparado con el HTML de `v3`), salvo las anclas nuevas del patrimonio.
- Cada página lleva:
  - `lang` correcto, `og:locale` y `hreflang` recíprocos entre las tres, más `x-default`;
  - un selector de idioma visible, con `aria-current`, **solo en estas tres páginas**;
  - el aviso «The rest of the site is in Spanish.» / «O resto do sítio está em espanhol.».

  La cabecera, el buscador, el pie, las cookies y el mando siguen en castellano y van marcados `lang="es"` (WCAG 3.1.2). Las migas y «En esta página» se traducen.
- Las fiestas se pintan traducidas en build, sin `data-vivo`, porque `vivo.js` las repintaría en castellano. Por eso no llevan la marca de «este mes». «Para visitar» y «Dónde comer y dormir» no salen en otros idiomas (Ribera no los usa).
- **Si falta una traducción, esa página no se genera** y `aplicar.mjs` dice qué falta. Sin ningún JSON, ni páginas, ni selector, ni `hreflang`.

## M9 · El plano del pie se dibuja

`aplicar.mjs` (`callesEnOrden`) parte los `<path>` de calles de `marca/plano.svg` en un trazo por tramo. Cada uno lleva `pathLength="1"`, empieza por su punta más cercana al Ayuntamiento (el centro del lienzo) y tiene `--plano-d` de 0 (el más cercano) a 1. `css/movimiento.css` lo traza en 300 ms con un retraso de `--plano-d × 300 ms`: **600 ms en total**. `js/movimiento.js` añade la clase con un IntersectionObserver de umbral 0. El reposo es el plano entero (`fill: backwards`), y todo va dentro de `prefers-reduced-motion: no-preference`. `marca/plano.svg` no cambia.

## Archivos y campos nuevos

- Scripts:
  - `scripts/fotos-igualar.py`;
  - `scripts/termino.mjs`;
  - `scripts/lib/osm.mjs`.
- Datos y fotos:
  - `media/originales/*.jpg`;
  - `media/_igualado.json`;
  - `media/_comparativa-igualado.jpg`;
  - `contenido/pueblo.en.json` y `contenido/pueblo.pt.json`;
  - `pruebas/termino/muestra-overpass.json`.
- Opcionales (sin ellos no sale nada nuevo): `marca/termino.svg` y `marca/termino.json`, por generar. **En `municipio.json` no hay campos nuevos.**
- Plantilla:
  - `fuente/pueblo.html`: etiquetas con `{{t.*}}`, la sección del mapa, el selector y el ancla en las filas del patrimonio;
  - `fuente/_cabeza.html`: `og:locale` por página y `hreflang`;
  - `fuente/_documento_arriba.html`: `lang="{{pagina.lang}}"`.
- `css/base.css`: un bloque nuevo tras la gastronomía (mapa, selector y `:target` del lugar).
- `css/movimiento.css` y `js/movimiento.js`: un bloque M9 cada uno.
- Documentación: RESKIN.md §6 (igualar), §6 bis (el plano se dibuja), §6 ter (mapa), §6 quater (idiomas) y §1 (qué borrar al copiar). README: la tabla de páginas y el árbol.
- **Generados, sin subir**: `pueblo-en.html` y `pueblo-pt.html`, igual que el resto de `*.html` de la raíz.

## Pruebas

- **Nuevas**: el bloque `v3bPueblo()` (`['v3bpueblo', v3bPueblo]`), con 6 comprobaciones:
  1. Fotos: tamaño frente al original, crédito, `alt` (también en las traducciones) e idempotencia: otra pasada en una carpeta aparte da los mismos bytes que `media/`.
  2. Sin `marca/termino.svg`, no hay sección de mapa.
  3. En una copia con la muestra sintética, en castellano a 1440 y 320 px y en en/pt a 320 px:
     - cada punto y cada fila de la leyenda llevan a una ficha que existe, y pulsar el punto 1 llega a ella;
     - atribución, leyenda, escala y la etiqueta «Ejemplo»;
     - el SVG es `aria-hidden` y no tiene nada tabulable;
     - ni una petición fuera, sin desborde y 0 violaciones de axe.
  4. Traducción incompleta: no se genera esa página. Sin traducciones: ni páginas, ni selector, ni `hreflang`.
  5. Las páginas en/pt: `lang`, `hreflang` recíprocos y `x-default`; selector visible solo ahí y con `aria-current`; lo común con `lang="es"`; sin desborde a 320 px; 0 violaciones de axe.
  6. El plano del pie:
     - en reposo, entero;
     - al asomar (`page.mouse.wheel`), todos los tramos se animan; el primero empieza en 0 ms, el orden va por distancia y todo acaba en 600 ms;
     - cada tramo empieza por su punta más cercana al Ayuntamiento;
     - acaba dibujado y, con movimiento reducido, no se anima.
- **Cambiadas**: en `verificar.mjs`, sin ablandar ninguna:
  - `estructura`: antes exigía `lang="es"` en todas las páginas. Ahora exige `lang="es"` en todas salvo `pueblo-<lang>.html`, que tiene que llevar exactamente el de su idioma.
  - `interiores` y `v3interiores` (las dos funciones `idDe`): `pueblo-<lang>.html` se trata como la página «pueblo» (con su foto grande de `cabeceras`). Sin esto, la daban por una página sin pictograma.
- Las páginas nuevas entran solas en las pruebas generales (axe, desborde, teclado…), porque `verificar.mjs` recorre todos los `*.html` de la raíz.

## Posibles choques con las otras ramas

- **`scripts/aplicar.mjs`**: tres zonas.
  - En el bloque del pueblo: la `ancla` del patrimonio, `T_ES` y las traducciones, `termino`.
  - En el plano: `callesEnOrden`.
  - En el bucle de páginas: `pagina.lang`, `idiomas`, `alternativas`, el paso `t`/`pueblo`/`creditos` de la traducción y `enOtroIdioma`. Además, `PAGINAS.push` de las traducciones, `pictoDe` y `t`/`anio_traducido` en `comun`.

  Si otra rama toca el objeto `pagina` o `comun`, el choque es de líneas vecinas, fácil de resolver a mano.
- **`fuente/_cabeza.html`** (línea de `og:locale`) y **`fuente/_documento_arriba.html`** (`<html lang>`): una línea cada uno. «Interiores» podría tocar `_documento_arriba`/`_cabeza_pagina`. `_cabeza_pagina.html` no lo he tocado: las migas y el índice se traducen por posproceso en `enOtroIdioma`, que busca los textos «Usted está aquí», «Inicio» y «En esta página». **Si otra rama cambia esos textos, hay que actualizar `enOtroIdioma`.**
- **`css/base.css`**: un bloque nuevo, después de `.gastronomia__marco img`.
- **`css/movimiento.css`** y **`js/movimiento.js`**: un bloque M9 cada uno, antes del hemiciclo y de la foto de la noticia.
- **`scripts/verificar.mjs`**: un bloque antes de «orden» y una línea en la lista.
- **`RESKIN.md`**: §1, final de §6, §6 bis, §6 ter y §6 quater nuevos, y la última viñeta de «Cuándo deja de ser reskin».
- **README.md**: una fila en la tabla de páginas y tres líneas en el árbol.
- Si «interiores» cambia la cabecera grande de «El pueblo» (`cabeza_grande`), en las traducciones se usa `p.traduccion.cabecera` (la misma foto con el `alt` traducido).

## Dudas que dejo anotadas

- La placa de la casa natal se queda en castellano (`lang="es"`) y la traducción va en el texto de debajo. Me pareció lo honesto con una inscripción.
- ¿Selector de idioma dentro de la cabecera de la página, junto al título? Lo he dejado al principio del cuerpo, encima de «Qué ver», para no tocar `_cabeza_pagina.html`, que es de interiores.
- Los nombres de los platos llevan una glosa entre paréntesis. Si se prefiere solo el nombre, basta con cambiar las listas del JSON.
