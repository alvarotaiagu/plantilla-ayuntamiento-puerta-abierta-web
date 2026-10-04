# Informe · rama `claude/v3b-servicio` («servicio»: lo que vende la maqueta y el mantenimiento)

Hecho de noche y sin nadie a quien preguntar: las decisiones dudosas están en «Dudas y decisiones».

**Verificación completa: 140 de 140 comprobaciones en 628 s (las 135 de antes y las 5 nuevas)** (`node scripts/verificar.mjs`, con el bloque nuevo `v3bServicio`).

> **Ojo con el entorno:** en esta máquina Playwright 1.63 pedía Chromium 1243, no se pudo descargar (la red lo bloquea) y había Chromium 1194 preinstalado. Las pruebas se han pasado con un `PLAYWRIGHT_BROWSERS_PATH` local que apunta a ese 1194 (sin tocar el repo ni `package.json`). En una máquina con su navegador normal no hace falta nada.

---

## Qué hice en cada punto

### F5 · «La propuesta» (`propuesta.html`)
- Página nueva desde `fuente/propuesta.html`, con la cabecera, la banda de propuesta, `noindex, nofollow` y el pictograma del Ayuntamiento en el arco. **No está en el menú ni en el pie** (se manda por correo). Con `"propuesta": false` no se escribe y, si existía, se borra: la página de venta no viaja a la web oficial.
- Secciones (con índice «En esta página», que sale solo):
  1. **La web de ahora**: lista de problemas comprobables sacados de `municipio.json → propuesta_web.problemas`, cada uno con su fuente. Para Ribera, de DATOS.md y README: el icono de Instagram que lleva a plus.google.com; el teléfono de la Guardia Civil que es el del Ayuntamiento; dos enlaces rotos («Histórico del perfil» y la cita de la ITV); las inscripciones deportivas de 2023; las erratas («Vigilio», «Matrachel», «Alcade»). Sin `propuesta_web`, frases generales sobre las webs municipales, sin afirmar nada de la suya.
  2. **Antes y después**: comparador con `input type="range"` (flechas, Inicio/Fin y Re/Av Pág del propio navegador; `aria-valuetext` que dice qué se ve; 44 px de alto; foco visible). El «después» es `assets/propuesta-portada.jpg`, que **captura `scripts/captura-portada.mjs` en el build** (1280 × 800, sin cortina, sin cookies, la primera foto del arco). El «antes»: **no hay ninguna captura de la web actual en el repo** (busqué `*actual*`, `*antes*`, `*captura*`, `media/`, `assets/`, `pruebas/`), así que sale el hueco marcado **«PENDIENTE: captura de la web actual»**; se rellena con `propuesta_web.captura_antes: {archivo, alt}`. Sin JavaScript, las dos imágenes salen una debajo de otra y el control no aparece. Sin animaciones.
  3. **Qué cambia con esta web**: siete fichas (viva sola, accesibilidad RD 1112/2018 con enlace a la declaración, la sede con sus N trámites contados de los datos, el tablón en lenguaje claro, el móvil, sin depender de las redes, sin rastrear). Solo capacidades, sin promesas comerciales; el tablón automático, «con la autorización del Ayuntamiento».
  4. **Publicar es rellenar un formulario**: el argumento del mantenimiento y lo que puede cubrir (lista del README).
  5. **Avisos y agenda, también sin redes**: enlace a `suscribirse.html`.
  6. **Presupuesto**: bloque `[PRECIO: lo pone Álvaro]` dentro de un `[MANDO DE MAQUETA]`, oculto salvo con `?revision` (`html.en-revision`); `quitar_mandos.py` lo borra.
  7. **El siguiente paso**: contacto de `propuesta_web.contacto` o, sin él, «responda al correo con el que le ha llegado esta página».
- Estilos en `css/propuesta.css` (solo tokens) y el comparador en `js/propuesta.js`; los cargan solo las páginas que los piden (`estilos`/`scripts` en `PAGINAS`, versionados con su huella).

### F6 · Suscribirse sin redes
- `feed.xml` (Atom, RFC 4287): avisos y noticias no ocultos, los 40 más recientes, con id `urn:uuid` estable, fecha con zona de Madrid, enlace a su sitio en la web. Lo de ejemplo sale con «EJEMPLO:» delante y una frase que lo dice en el resumen (en un lector no hay etiqueta).
- `agenda.ics`: **toda** la agenda (actos, fiestas de los dos años y plenos) en un solo VCALENDAR, juntando los VEVENT de `Vivo.ics` (el mismo generador de `ics/<id>.ics`, sin tocar `vivo.js`): mismo UID que el .ics suelto, un solo VTIMEZONE, `X-WR-CALNAME` y `REFRESH-INTERVAL` de 12 h. Los actos de ejemplo, con «EJEMPLO:» en el título.
- `<link rel="alternate">` de los dos en el `<head>` de todas las páginas.
- La explicación para el vecino es una página nueva, **`suscribirse.html` («Avisos y agenda en su móvil»)**: botón `webcal://` (sale de `url`), descarga del .ics, pasos para iPhone / Google Calendar / Outlook con la dirección para pegar, el canal Atom con la suya y una nota del listín sin cobertura. Tampoco está en el menú: ver «Dónde enlazar».

### F7 · Teléfonos sin cobertura (`sw.js`)
- `aplicar.mjs` escribe `sw.js` en la raíz: la lista se saca **del propio `telefonos.html` generado** (CSS, JS, imágenes y `srcset`) y de las letras que cargan sus CSS (`url()` de `fuentes.css`), así vale para cualquier reskin. Caché `<slug>-telefonos-<huella>` con la huella de todos esos archivos: si cambia uno, cambia `sw.js`, el navegador instala el nuevo y `activate` borra la caché vieja.
- Red primero y caché de respaldo **solo** para esas rutas; todo lo demás ni pasa por el service worker (sin `respondWith`), así que las pruebas con `page.route` y el resto de la web van igual. Rutas relativas a `sw.js` (el `scope` es la carpeta de la web, también bajo el subdirectorio de Pages).
- Se registra en `_cabeza.html` al evento `load`, en todas las páginas (así el listín queda guardado aunque el vecino no lo haya abierto nunca); sin service worker o si falla el registro, no pasa nada.

### F11 · Datos estructurados (JSON-LD)
- Un `<script type="application/ld+json">` con `@graph` por página: `GovernmentOrganization` (nombre, url, escudo, teléfono E.164, correo, fax, NIF, dirección y `sameAs` de `redes`) en portada, El Ayuntamiento, contacto, agenda y noticias; un `Event` por acto de la agenda; `NewsArticle` en cada noticia; `BreadcrumbList` en todas las interiores.
- Nada inventado: el horario **no** entra mientras sea `ejemplo` (en Ribera lo es); los eventos, noticias y plenos de ejemplo no entran; en las fiestas, el «lugar» (que es el «cuándo») va a la descripción. `LocalGovernment` no existe en schema.org, por eso `GovernmentOrganization`.

### F13 · Publicar desde el móvil
- **`PUBLICAR.md`**: el circuito Formulario de Google → hoja → web, paso a paso y con las pantallas descritas: dos formularios vinculados a una hoja privada, pestañas «Avisos» y «Agenda» con `QUERY` que copian solo las columnas de la web (sin la marca temporal ni correos), se publican solo esas dos pestañas, `hoja.id` en `municipio.json`, cómo retirar algo con `Estado = oculto`, la comprobación de que las respuestas no se ven por `gviz`, y las columnas exactas que lee `js/main.js`.
- **`plantillas-hoja/avisos.csv` y `agenda.csv`**: plantillas con las cabeceras tal como las deja el formulario (con «Marca temporal») y filas «EJEMPLO ·».
- **`node scripts/comprobar-hoja.mjs <csv> [--tipo avisos|agenda]`**: lee el CSV (comillas, `,` o `;`), normaliza las columnas igual que la web y dice fila a fila qué falla: columnas que faltan o sobran, fecha imposible o mal escrita, sin título, gravedad desconocida, caduca antes de empezar, urgente/programado sin `caduca` (no saldría en la franja), título largo sin `titulo_corto`, filas duplicadas (misma id), hora mal escrita, `hora_fin` sin hora, enlaces que no son https, `tipo` desconocido, `estado` raro. Código 1 con errores, 0 con avisos.

---

## Archivos y campos nuevos

| Archivo | Qué |
|---|---|
| `fuente/propuesta.html`, `fuente/suscribirse.html` | Las dos páginas nuevas |
| `css/propuesta.css`, `js/propuesta.js` | Estilos y comparador (solo en esas páginas) |
| `scripts/lib/servicio.mjs` | feed Atom, agenda.ics, JSON-LD, código de `sw.js` y la lista de recursos de una página |
| `scripts/captura-portada.mjs` | Captura de la portada para el comparador (lo llama `aplicar.mjs`; también a mano) |
| `scripts/comprobar-hoja.mjs` | Comprobador de la hoja |
| `plantillas-hoja/*.csv`, `pruebas/hoja/avisos-roto.csv` | Plantillas y la hoja rota de la prueba |
| `PUBLICAR.md`, este informe | Documentación |
| **Generados** (no subidos): `feed.xml`, `agenda.ics`, `sw.js`, `propuesta.html`, `suscribirse.html`, `assets/propuesta-portada.jpg` | Mañana salen al regenerar |

Campo nuevo, opcional: **`municipio.json → propuesta_web`** `{problemas: [{texto, fuente}], revisada, captura_antes: {archivo, alt}, contacto: {nombre, correo, telefono}}`, documentado en RESKIN.md §3 (y lo generado en §7 bis). Rellenado para Ribera con `problemas` (de DATOS.md); `captura_antes` y `contacto` a `null`.

## Pruebas

- **Nuevas**, en el bloque `v3bServicio()` (registrado como `['v3bservicio', v3bServicio]`), 5 comprobaciones:
  1. «La propuesta»: noindex, ninguna otra página la enlaza (ni menú ni pie), el comparador con teclado (→ ×5 = 55 % en valor, `--corte` y `clip-path`; Fin/Inicio; `aria-valuetext`; 44 px; foco visible), apilado sin JavaScript, el precio solo con `?revision`, ninguna cifra con € fuera del mando y axe 0 en propuesta (con y sin `?revision`) y suscribirse.
  2. feed.xml bien formado (DOMParser en el navegador, espacio de nombres Atom, una entrada por aviso/noticia con id único, título, fecha ISO y enlace; las de ejemplo con «EJEMPLO:») y agenda.ics válido (el `icsValido` que ya había, más: un VEVENT por cada .ics suelto con su mismo UID, UID únicos, un VTIMEZONE, X-WR-CALNAME); `<link rel="alternate">` en todas las páginas; `webcal://` en suscribirse.
  3. sw.js: la lista tiene el listín, CSS con su huella actual, letras y escudo; visita a la portada, el SW se activa, se recorren otras páginas online sin errores, **sin red** `telefonos.html` carga con estilos y el 112 a la vista; con los service workers bloqueados, el listín carga igual.
  4. JSON-LD en todas las páginas: `JSON.parse` estricto, `@context`, solo los 4 tipos, organización con dirección y teléfono E.164 (y sin horario si es de ejemplo), eventos y noticias con fechas ISO, migas con posiciones 1..n, ningún evento de ejemplo (por fecha + título).
  5. `comprobar-hoja.mjs` acepta las dos plantillas y rechaza la rota diciendo las 5 filas malas y el porqué.
- **Cambiadas:** ninguna de las existentes. Las páginas nuevas entran solas en las pruebas generales (axe en las 6 combinaciones, desborde a 320–1440 y zoom, estructura, teclado, cabeceras interiores, «Ejemplo», banda y noindex), porque esas pruebas recorren todos los `*.html` de la raíz.

## Lo que no pude hacer (y por qué)

- **La captura de la web actual** para el «antes»: no hay ninguna en el repo y sacarla de riberadelfresno.es en el build sería una petición a terceros (y su aviso legal limita la reproducción). Queda el hueco «PENDIENTE»: hacer la captura a mano a 1280 × 800, guardarla en `assets/` y ponerla en `propuesta_web.captura_antes`.
- **El contacto de Álvaro** en el cierre: no está en ningún sitio del repo; no lo invento. `propuesta_web.contacto`.
- **Lo publicado desde la hoja no entra en `feed.xml` ni en `agenda.ics`** (se escriben al montar la web). Cambio propuesto: un paso opcional en `aplicar.mjs` que, con `hoja.id`, lea las pestañas por `gviz` en Node (como `tablon.mjs`, con el último bueno si falla) antes de escribir los feeds, y una tarea diaria (la misma del tablón) que regenere.
- **Límites del lector actual de la hoja** (no he tocado `js/main.js` ni `vivo.js`, como pedía el encargo):
  1. La lista «Avisos del Ayuntamiento» de `avisos.html` es estática (`fuente/avisos.html`, `{{#avisos}}`): un aviso de la hoja sale en la franja, en «Hoy» y en el tablón, pero **no** con su `texto` en esa lista, y su enlace `avisos.html#aviso-<id>` apunta a un ancla que no existe. Cambio exacto: pintar esa lista también desde `D.avisos` (un `data-vivo="avisos"` con un `Vivo.pintar('avisos')` que use `texto`, que habría que añadir a `D.avisos` en `aplicar.mjs`), o al menos que `ultimos()` enlace a la portada si el aviso no tiene ancla.
  2. `D.avisos` no lleva `texto` ni `enlace` (`aplicar.mjs`, línea `avisos: C.avisos.map(...)`), así que lo mismo pasa al fusionar.
  3. La gravedad y el plazo **sí** funcionan desde la hoja (`gravedad`, `caduca`, `titulo_corto` llegan a `Vivo.gravedad`/`destacados`, que ya pasan a minúsculas).

## Dónde convendría enlazar cada cosa nueva (zonas de otros agentes)

- **`suscribirse.html`**: desde `agenda.html` (junto a «Añadir a mi calendario»: «Toda la agenda en su móvil»), desde `avisos.html` (arriba, junto al canal de avisos o en su lugar si no hay canal) y en el pie (`_abajo.html`, enlaces útiles: «Avisos y agenda en su móvil»).
- **`feed.xml` / `agenda.ics`**: ya están en el `<head>`; un enlace visible en el pie si se quiere.
- **El listín sin cobertura**: una línea en `telefonos.html` («Esta página se abre también sin cobertura si ya ha visitado la web»).
- **`propuesta.html`**: en ningún sitio, a propósito. Se manda por correo: `<url>/propuesta.html`.
- **`PUBLICAR.md`**: desde el README (ya enlazado en «Cómo se mantiene viva»).

## Posibles choques al unir las ramas

- **`fuente/_cabeza.html`**: solo líneas añadidas, justo después de la hoja `imprimir.css`: estilos propios de página, los dos `<link rel="alternate">`, el JSON-LD, los scripts propios y el registro de `sw.js`. Si otra rama añade en el mismo sitio, es juntar las dos listas.
- **`scripts/aplicar.mjs`** (marcado `v3b · servicio`): un `import`; dos entradas en `PAGINAS` (antes de las noticias) y dos en `PICTO_DE`; borrar `propuesta.html` con `"propuesta": false`; un bloque de datos tras `const webActual`; `servicio` en `comun`; **el bucle de páginas pasa a ser `function pintarPagina(p) {…}` + `for (const p of PAGINAS) pintarPagina(p);`** (para volver a pintar la propuesta tras la captura; el cuerpo no cambia salvo 3 líneas: `pagina.jsonld`, `pagina.estilos`, `pagina.scripts`); la escritura de `feed.xml`, `agenda.ics` y `sw.js` tras el manifiesto; la captura tras la og:image. Si otra rama toca el cuerpo del bucle, el conflicto es solo de la primera línea.
- **Mustache estricto:** `_cabeza.html` usa `pagina.estilos`, `pagina.scripts` y `pagina.jsonld`. Si otra rama pinta páginas por otro camino que no sea `pintarPagina`, tiene que poner esas tres claves (aunque sea vacías) o el render falla.
- **`scripts/verificar.mjs`**: un `import { createHash }`, el bloque `v3bServicio()` antes de «orden» y una línea en la lista.
- **`RESKIN.md`**: una fila (`propuesta_web`) en la tabla de §3, antes de `pueblo.patrimonio[].grupo`, y la sección nueva «7 bis». **`README.md`**: dos filas en «Mapa de páginas» y tres en «Cómo se mantiene viva».
- **`municipio.json`**: el bloque `propuesta_web` justo después de `web_actual`.
- **Pictogramas**: uso los que había (`ayuntamiento`, `megafono`); si `claude/v3b-interiores` renombra alguno, ajustar `PICTO_DE`.
- **El service worker** intercepta (red primero) los CSS y JS comunes del listín en todas las páginas. Si otra rama prueba esos archivos con `page.route`, conviene crear su contexto con `serviceWorkers: 'block'`.

## Dudas y decisiones

- El texto de la explicación para el vecino va en una página propia (`suscribirse.html`) y no en `propuesta.html`, porque `propuesta.html` es para el alcalde y desaparece al entregar.
- En el feed y en `agenda.ics` los datos de ejemplo **entran** marcados «EJEMPLO:» (para que la maqueta enseñe cómo se ve); en el JSON-LD **no** entran (un buscador los daría por reales).
- El SW se registra en todas las páginas, no solo en teléfonos: si no, el listín solo funcionaría sin cobertura para quien ya lo hubiera abierto antes.
- Los problemas de la web actual son todos de DATOS.md/README; la comprobación de los enlaces rotos es de octubre de 2026 (la fecha de DATOS.md). Conviene repasarlos justo antes de mandar la página.
