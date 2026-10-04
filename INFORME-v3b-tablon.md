# Informe · rama `claude/v3b-tablon` (plazos, tablón, portada y buscador)

Noche del 3 de octubre de 2026. Parte de `v3`; 6 mejoras, en el orden de prioridad del encargo. Cada mejora va en su commit; los archivos generados por `aplicar.mjs` no se suben (al unir, `node scripts/aplicar.mjs`).

**Resultado: `node scripts/verificar.mjs` → ✓ 142 de 142 comprobaciones** en 579 s: las 135 de antes siguen pasando (4 ajustadas al buscador por grupos y a los plazos de ejemplo) y se suman las 7 nuevas. Antes de empezar, 135 de 135 en este mismo entorno.

## Qué se hizo

### F4 · Plazos con cuenta atrás
- Un aviso (`contenido/avisos.json`) o un anuncio del tablón (`contenido/tablon.json`) puede llevar `plazo_inicio` y/o `plazo_fin` (`AAAA-MM-DD`) y `plazo_ejemplo`.
- `js/vivo.js → plazo(x, ahora)` calcula el estado con la **fecha de Madrid** (la de `ahoraEn`): «Abre mañana» / «Abre el martes 20 de octubre», «Quedan N días» / «Queda 1 día», «Último día» (el día de cierre entero) y, desde la medianoche siguiente, «Plazo cerrado». Con inicio y sin fin, ya abierto: «Plazo abierto».
- El chip: icono de reloj + la palabra; el lector de pantalla oye además la fecha («, hasta el sábado 31 de octubre incluido»). Cada estado tiene forma propia además del color (relleno tenue con borde, ámbar lleno en el último día, borde discontinuo si aún no abre, apagado si cerró). Todo con tokens ya medidos (`--marca` sobre `--marca-tenue` 4,9:1, `--sobre-aviso` sobre `--aviso` 4,84:1, `--apagado` sobre `--superficie-2` 4,63:1).
- Lo de plazo cerrado **baja de prioridad**: va detrás de todo en el tablón (también en el límite de 6 de la portada).
- **«Plazos abiertos»** en la portada, bajo la tira «Hoy»: fichas con el chip, el título enlazado a su aviso (o al anuncio en la sede) y «Hasta el … · Tablón oficial/Ayuntamiento»; lo que cierra antes, primero; 4 como mucho. Sin ninguno abierto la sección lleva `hidden` (al generar y al repintar en el navegador): no sale ni deja hueco.
- En «Avisos», cada aviso propio con plazo lleva el chip (`data-vivo="plazo"`, repintado con la fecha real).
- `scripts/lib/tablon.mjs → fusionar` conserva `plazo_inicio`, `plazo_fin` y `plazo_ejemplo` al refrescar el tablón (como `titulo_claro`): el plazo lo pone una persona leyendo el anuncio.
- `aplicar.mjs` se niega si las fechas están mal escritas, si el inicio va después del fin o si hay `plazo_ejemplo` sin plazo.

**Plazos de Ribera:** el texto de la convocatoria de ayudas a la natalidad 2026 (exp. 182/2026) y el del anuncio de cobranza del IAE 2026 (exp. 1101/2026) **no dicen la fecha** en lo que tenemos: la copia del tablón (`pruebas/tablon/board-ribera.html`) solo trae título, expediente y fecha de publicación, y la noticia de la natalidad remite a las bases. Los PDF del anuncio están en `/preview-document/…` de la sede, que su `robots.txt` no permite leer a un robot (y esta noche no había salida a internet). Así que los dos van **con `plazo_ejemplo: true`** (sale «Ejemplo»):
- natalidad: `plazo_fin` 2026-10-31 (EJEMPLO);
- IAE: `plazo_inicio` 2026-09-01 y `plazo_fin` 2026-11-02 (EJEMPLO; el periodo voluntario típico del OAR va de septiembre a noviembre, pero no está comprobado).

**Duda para Álvaro:** abrir los dos PDF en la sede y poner las fechas reales (quitando `plazo_ejemplo`). Si la natalidad no tiene plazo (convocatoria abierta todo el año), quitarle el plazo.

### V18 · Tablón más vivo
- **«Nuevo»**: lo publicado hoy o ayer (las fechas no llevan hora: 48 h = hoy y ayer) lleva en la meta un punto de oro con la palabra «Nuevo» y, para el lector, «, publicado en las últimas 48 horas». La palabra va a la vista (no solo el punto) para no depender del color ni de adivinar qué es el punto.
- **Franja de gravedad**: la fila de un aviso propio urgente lleva una franja roja a la izquierda (`--alerta`, `box-shadow inset`), y la programada, ámbar (`--aviso`); además su chip «Urgente»/«Programado» en la meta. El informativo, nada. En «Avisos», el aviso programado también lleva su chip y el borde ámbar (antes solo el urgente).
- El chip de plazo de F4.

### V14 · «{{nombre_corto}} en cifras»
- Campo opcional `cifras: [{valor, unidad, etiqueta, fuente, fuente_url, anio}]` en `municipio.json` (documentado en RESKIN.md §3). `valor` número (sale a la española: 3.130, 185,6) o texto (un año).
- Banda blanca (`banda--superficie`) **entre «El año» (oscura) y «Conocer»**: así el ritmo queda oscura → blanca → cal → tenue y no hay dos bandas de cal seguidas con números. Números en Besley (marca), unidad más pequeña, etiqueta en texto y la fuente en pequeño con su enlace y el año del dato. 2 por fila en el móvil.
- Sin el campo, la banda no sale; una cifra sin `valor`, `etiqueta` o `fuente` hace que `aplicar.mjs` se niegue.

**Datos de Ribera y fuentes** (sin salida a internet esta noche: no pude abrir INE, IGN ni Wikipedia; uso solo lo que `DATOS.md` ya tenía comprobado el 02/10/2026):
| Cifra | Fuente puesta | Nota |
|---|---|---|
| 3.130 habitantes (2025) | INE, padrón, enlazado al observatorio de la Diputación (`portalestadistico.com/municipioencifras/…id_territorio=06113`, en DATOS.md con 200) | Es el dato del encargo y el de `habitantes`. **Comprobar** contra la tabla del INE y, si se prefiere, enlazar al INE |
| 185,6 km² | Diputación de Badajoz, ficha del municipio | DATOS.md: Diputación y Wikidata |
| 399 m de altitud | Diputación de Badajoz, ficha del municipio | DATOS.md: Diputación y Wikipedia |
| 1257, primera referencia escrita de la villa | Diputación de Badajoz, historia | DATOS.md §Historia (web, Diputación y Wikipedia) |
| ~~Distancia a Badajoz~~ | — | **No se pone**: 82, 83 o 107,6 km según la fuente (README, «Datos que se contradicen») |

Ojo: el encargo cita «INE 06110»; el código INE de Ribera es **06113** (DIR3 L01061134, `municipio.json → ine`).

### V17 · Lema y crédito en el hero
- El lema pasa de línea gris pequeña a **Besley cursiva 600, en la marca** (`clamp(1.4rem…2.1rem)`; 1,375 rem en el móvil), con una raya de oro delante (decoración, `aria-hidden`). El hero sigue cabiendo: a 1280×720 acaba en 681 px (igual que antes: el texto sigue siendo más bajo que el arco) y a 375×667 el buscador y «Hacer un trámite» siguen a la vista.
- **Pie de la foto del arco**: el nombre del lugar que sale, enlazado a `pueblo.html#lugar-<slug>`, en una pastilla diminuta sobre el pie del arco. Va en **absoluto** dentro de `.puerta`, así que no mueve nada (sin CLS) y no cambia la altura del hero. Se elige junto con la foto: el `<head>` ya guardaba `window.__heroFoto`; un script en línea justo detrás del `<p>` lo reescribe antes del primer pintado. Sin JavaScript (o con el `<head>` roto), el de la primera foto, que es la del `<noscript>`.
- El lugar se encuentra solo (el de `pueblo.lugares` con la misma `foto`); `hero_fotos[].lugar` lo fuerza, `pie` pone un texto sin enlace y `lugar: null` lo quita (RESKIN.md, fila `fotos.hero_fotos`).
- En Ribera: `casa-cultura` → Casa de Vargas-Zúñiga, `monumento-melendez` → Monumento a Meléndez Valdés, `pozo-tinajona` → Los pozos rojos y blancos. **`calle-torre` no tiene pie**: no sé qué torre es (la web solo dice «Avenida con torre»). **Duda**: si es la torre del reloj o una ermita, ponerle `pie` (o `lugar`).

### F8 · Buscador global
- El mismo código de `js/main.js` para el diálogo de la cabecera, el hero y la página de trámites. Además de los trámites encuentra: **avisos y anuncios del tablón** (de los datos vivos: `Vivo.ultimos`, con lo que llegue de la hoja o del tablón), **noticias** (datos vivos), **teléfonos** y **lugares de «El pueblo»** (`window.BUSCAR` en `js/tramites-datos.js`, generado en build por `aplicar.mjs` desde el listín y `pueblo.lugares`).
- En los otros tipos se piden todas las palabras (con sus variantes y sinónimos), para que no salga ruido; en los trámites, la lógica de siempre.
- Resultados **agrupados por tipo con su título** (`h3` en el diálogo y en Trámites, `h2` en el hero, que está bajo el `h1`; `data-buscador-nivel`), cada lista con `aria-labelledby` a su título, **los trámites primero**, `<mark>` en todo.
- La cuenta (`role=status`) dice el total y el reparto: «6 resultados encontrados: 5 trámites y 1 teléfono.»; en el hero, «N resultados encontrados; aquí, los 5 primeros (…). «Buscar» los enseña todos.»
- En el hero, 5 como mucho entre todos los grupos (los trámites ceden un sitio a cada uno de los dos primeros grupos con algo) y **«Ver los N resultados»** a `tramites.html?q=…#buscar`.
- Textos: el diálogo pasa a «Buscar en la web» y las ayudas dicen qué se encuentra. El contenedor de resultados pasa de `<ul>` a `<div>` (dentro, una `<ul>` por grupo).

### M8 · Del hero a la página de trámites
- Al enviar el buscador del hero o pulsar «Ver los N resultados», Trámites llega con el campo relleno y filtrado (ya lo hacía `?q=`) y el campo **viaja** con la View Transition entre documentos de §15: el del hero y el de Trámites llevan `view-transition-name: campo-buscar` (400 ms, curva de salida). Solo dentro de `prefers-reduced-motion: no-preference`; el del diálogo no lleva nombre (sería duplicado). Sin soporte, navegación normal.

## Campos nuevos (todos opcionales, con respaldo; en RESKIN.md)
- `avisos[].plazo_inicio`, `plazo_fin`, `plazo_ejemplo` y lo mismo en `tablon.json → entradas[]`.
- `municipio.json → cifras`.
- `fotos.hero_fotos[].lugar` y `.pie`.
- Generado: `window.BUSCAR` en `js/tramites-datos.js`.

La prueba `reskin` (Segura de León, sin `cifras` ni plazos) sigue pasando: la banda no sale y nada de Ribera se cuela.

## Pruebas
**Nuevas** (`async function v3bTablon()`, un bloque, registrada como `['v3btablon', v3bTablon]`), 7 comprobaciones:
1. F4 en Node con fechas fijas: los 7 estados, la medianoche de Madrid (23:59 del último día y 23:30 UTC = 00:30 en Madrid), el HTML del chip (reloj, palabra, fecha para el lector, «Ejemplo»), lo cerrado al final y «Plazos abiertos» (solo lo abierto, en orden; vacío sin nada; anuncio del tablón con su clave).
2. V18 en Node: «Nuevo» hoy/ayer sí y anteayer no; franjas y palabras de urgente y programado; informativo sin franja.
3. F4/V18 en el navegador con `page.clock` y datos reescritos: chips «Abre mañana», «Último día», «Plazo cerrado»; «Plazos abiertos» sale y, sin nada abierto, `hidden` con 0 px; «Nuevo» con su texto; franja roja ≥ 3:1 y su palabra; axe 0; el chip en «Avisos».
4. V14: cifras en Besley con su fuente visible; en una copia sin `cifras`, la banda no sale; una cifra sin fuente para `aplicar.mjs`.
5. V17: con cada foto (semillas de `Math.random`) a 1280×720 y 1366×768, el hero cabe, el lema es grande y el pie dice (y enlaza) el lugar de la foto elegida, o nada.
6. F8: búsquedas sacadas de los datos (un lugar, un teléfono, una noticia, «padron») dan su grupo, en orden, con títulos que nombran su lista; la cuenta casa con los enlaces; el hero da 5 como mucho y «Ver los N resultados»; axe en el diálogo.
7. M8: `view-transition-name` en los dos campos solo con movimiento (y `none` con reducido, sin animaciones), el del diálogo sin nombre, y Trámites llega con lo escrito y filtrado.

**Cambiadas** (sin ablandarlas):
- `contenidoEjemplo`: espera también las etiquetas `plazo:<id>` de los plazos marcados con `plazo_ejemplo` (los dos del tablón). Sigue fallando si sale una etiqueta de más o falta una.
- `interaccion` (buscador): el primer resultado tiene que ser un trámite (ahora lo comprueba por su grupo) y la regla «enlaza a la sede o a un impreso» se aplica a los enlaces del grupo Trámites (los demás grupos enlazan a páginas de la web).
- `primeraPantalla` (buscador de la portada): los ≤ 5 resultados se cuentan en las listas de resultados; «Ver los N resultados» no es un resultado.
- `v3Interiores` §7 (marcas y entrada escalonada): cuenta los `<li>` de los grupos (`.resultados li` en vez de `.resultados > li`) y mide sus animaciones.
- `css/movimiento.css` M5: `.resultados li` en vez de `.resultados > li` (el escalón se cuenta dentro de cada grupo).

## Lo que no pude hacer
- **Confirmar en la red** los datos de las cifras y las fechas de los plazos: el entorno no tenía salida a internet (INE, IGN, Wikipedia, Diputación bloqueados por el proxy). Las cifras salen solo de lo ya comprobado en `DATOS.md`; los plazos, como EJEMPLO.
- Chromium: el Playwright del repo pedía la versión 1243 y solo estaba la 1194 en `/opt/pw-browsers` (sin descarga posible); se enlazó la 1194 en la ruta que espera. No se tocó ningún archivo del repo por eso.

## Posibles choques al unir con las otras ramas
- **`js/vivo.js`**: bloque nuevo antes de `ultimos()` (≈ l. 335–400: `plazo`, `chipPlazo`, `esNuevo`, `plazosAbiertos`, `plazos`, `plazoAviso`), `ultimos()` reescrita (añade campos y el orden de lo cerrado), la fila de `tablon()` (≈ l. 405–415) y `BLOQUES`/`raiz.Vivo` al final (≈ l. 615–625). Si otra rama toca `tablon()`, `ultimos()` o la lista `BLOQUES`, unir a mano.
- **`js/main.js`**: una línea en `pintarVivo` (≈ l. 31) y `montarBuscador` entero sustituido por el buscador global (≈ l. 300–400), más la línea que lo monta.
- **`css/base.css`**: todo en un bloque nuevo `v3b · TABLÓN, PLAZOS, PORTADA Y BUSCADOR` justo antes de `[MANDO DE MAQUETA] inicio` (≈ l. 1454). No se tocaron reglas existentes: el lema se redefine en el bloque (gana por orden).
- **`css/movimiento.css`**: M5 (`.resultados li`, ≈ l. 254–261) y un bloque M8 al final del `@media`, antes de la llave de cierre.
- **`scripts/aplicar.mjs`**: `avisosOrden` (≈ l. 389), `conPlazo` antes de `conIcs` (≈ l. 472), `D.avisos`/`D.tablon` (≈ l. 485–497), `vivo.plazos` y `plazo_html` (≈ l. 504), `listaHero` (pie de la foto, ≈ l. 510–530), el bloque `cifras` antes de «identidad (v3)» (≈ l. 584), `window.BUSCAR` en `tramites-datos.js` (≈ l. 715) y `cifras` en `comun`.
- **`scripts/verificar.mjs`**: `v3bTablon` antes del comentario de «orden» y su línea en la lista; cambios puntuales en `contenidoEjemplo` (≈ l. 797), `interaccion` (≈ l. 902), `primeraPantalla` (≈ l. 1347) y `v3Interiores` §7 (≈ l. 2322 y 2334).
- **`RESKIN.md`**: filas `lema` (§3), `cifras` (§3, nueva), `tramites.sinonimos` (buscador global), `fotos.hero_fotos` (pie) y dos viñetas en §7 (plazos y «Nuevo»).
- **`fuente/index.html`**: hero (lema, pie de la foto, textos y contenedor del buscador), sección «Plazos abiertos» tras la tira «Hoy» y banda de cifras antes de «Conocer». **`fuente/_arriba.html`** (no es el pie): solo el diálogo del buscador (título, ayuda y contenedor). **`fuente/tramites.html`**: la ayuda y el contenedor del buscador.
- **`municipio.json`**: `_cifras_leeme` y `cifras` tras `altitud_m` (7 líneas añadidas, nada más tocado).
- **`contenido/tablon.json`**: `_leeme` y los plazos de dos entradas. Si otra rama regenera el tablón con `tablon.mjs` de `v3`, se pierden los plazos (con el de esta rama se conservan).
