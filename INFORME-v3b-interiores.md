# Informe · v3b «interiores» (rama `claude/v3b-interiores`)

Noticias, hemiciclo, incidencias y lectura fácil. Parte de `origin/v3` (c8f265a, 135 de 135). Hecho de noche sin nadie a quien preguntar: las decisiones dudosas están en «Dudas y decisiones».

## Resultado

`node scripts/verificar.mjs` completo: **139 de 139 comprobaciones** (581 s). Antes de empezar, la v3 daba 135 de 135 en este entorno. Las 4 comprobaciones nuevas están en `v3bInteriores()`; también entran solas en las pruebas generales (axe en todas las páginas, desborde, consola, estructura…), porque `incidencia.html` y `facil.html` son páginas nuevas de la raíz.

**Entorno**: Playwright 1.63 pide Chromium 1243 y la red del entorno no deja descargarlo (`cdn.playwright.dev` bloqueado). Se ha usado el Chromium 141 preinstalado (`/opt/pw-browsers/chromium_headless_shell-1194`), enlazado a mano como si fuera el 1243. No toca el repo; en la máquina de Álvaro, con su Chromium, debería dar lo mismo, pero conviene pasarlo allí una vez.

## Lo hecho

### F9 · «Avisar de un problema» sin servidor (`incidencia.html`)
- Página nueva con migas en Trámites y el pictograma de una farola en el arco.
- Arriba, el aviso de urgencias: el **112** y la **Policía Local** (el teléfono sale del servicio de `servicios` cuyo nombre la contiene; si no hay, la frase no sale).
- Formulario por pasos:
  1. «¿Qué pasa?»: botones de opción con su ayuda. Las categorías salen de `incidencias.categorias`; si no hay, van las de siempre.
  2. «¿Dónde?»: calle y número o cómo llegar. Lleva «Usar mi ubicación» (Geolocation API, solo si existe), que **solo añade las coordenadas al texto**: ni mapas ni peticiones.
  3. «Cuéntelo»: la descripción, y una casilla «Tengo una foto y la adjuntaré al correo», que explica que el mailto no admite adjuntos.
  4. Datos de contacto opcionales.
- **Validación accesible** (`js/incidencia.js`):
  - un resumen arriba que recibe el foco, con un enlace por error que lleva al campo;
  - cada error en un párrafo enlazado con `aria-describedby` (ya en la plantilla) y `aria-invalid` en el campo;
  - el teléfono y el correo opcionales se validan solo si se rellenan.
- **El correo**: `mailto:<incidencias.correo>?subject=…&body=…`, codificado con `encodeURIComponent` y con saltos CRLF (RFC 6068).
  - Asunto: «Aviso de un problema: Alumbrado · Calle Mayor, 12».
  - Cuerpo: qué pasa, dónde, la descripción, la foto, los datos de contacto y de dónde sale el aviso.
- Se pasa a «Su aviso está listo», que recibe el foco y trae:
  - el botón «Abrir mi correo con el aviso»;
  - el texto con destinatario y asunto para «Copiar el texto» (Clipboard API; si no hay, lo selecciona);
  - el recordatorio de la foto;
  - «Cambiar algo del aviso».
- Si el mailto pasa de 1800 caracteres, lo avisa: algunos programas cortan los enlaces largos.
- No abre el correo solo, sin pulsar: así el vecino lo revisa antes de mandarlo, y en Chromium sin manejador de `mailto:` saltaba un error en la consola.
- **Sin JavaScript**: el mismo `<form action="mailto:…?subject=Aviso%20de%20un%20problema" method="post" enctype="text/plain">`, con `required` en los obligatorios. El navegador valida y manda `nombre=valor` por líneas. Un `<noscript>` lo explica y da el correo.
- Si el catálogo de la sede tiene un trámite de «incidencia», va al pie («¿Tiene certificado digital o Cl@ve?…»). En Ribera es «Aviso de Incidencia en la Vía Pública».
- Enlace desde `tramites.html` → «Por momentos» → «Ha pasado algo en mi calle»: el botón «Avisar de un problema» (y su «Explicado fácil»). Lo decide el campo nuevo `momentos[].incidencia: true`.
- **Sin `incidencias.correo` no hay página ni enlace.** `aplicar.mjs` además borra un `incidencia.html` viejo.
- Durante la verificación completa, la prueba de zonas táctiles (≥ 44 px) marcó los botones de opción y la casilla (22 px). No se ha tocado la prueba: ahora el control nativo cubre toda la tarjeta (`appearance: none`, con el foco alrededor) y el círculo o la casilla que se ven son un `<span>` decorativo.
- Al validar se cambió una cosa: los errores ya no se repintan al salir de un campo, solo al volver a pulsar «Preparar el correo». Al quitar el error del campo que se dejaba, la página subía bajo el dedo y el clic siguiente (la casilla de la foto) caía en otro sitio.

### F10 · Lectura fácil (`facil.html`, datos en `contenido/facil.json`)
- Cinco trámites:
  - los **4 atajos** que tiene hoy `tramites.atajos`: Empadronarme, Domiciliar recibos, Licencia de obra y Ayudas a la natalidad;
  - y **«Avisar de un problema en la calle»**, que explica el formulario de F9.
  
  Ribera solo tiene 4 atajos, no 5: el quinto es el que se puede explicar entero sin inventar nada, porque su página es nuestra.
- Formato de Lectura Fácil:
  - frases cortas (la más larga, 15 palabras) y una idea por línea: cada frase de un paso va en su propia línea;
  - vocabulario común, con las palabras difíciles explicadas («padrón», «domiciliar», «bases», «convocatoria», «sede electrónica», «Cl@ve»);
  - pasos numerados con número grande y un **pictograma por paso**;
  - letra de 20 px (la base es de 18), alineado a la izquierda y sin colores en el texto. «Pulse el botón verde» se quitó: con la paleta Azur no sería verde;
  - sin abreviaturas: la dirección se reescribe, «C/ Ayuntamiento, 1» → «la calle Ayuntamiento, número 1»;
  - el teléfono va enlazado, y cada trámite lleva «Si no tiene internet».
- Al pie: «Texto adaptado a lectura fácil. Pendiente de validar con personas usuarias.»
- En `tramites.html`, sección nueva **«Los más pedidos»** (los atajos, con la misma tarjeta de la portada) y, bajo cada uno, «Explicado fácil». El enlace lleva al ancla del trámite en `facil.html`.
- Pictogramas propios en `fuente/_pictos_facil.html` (20, con el trazo de los iconos). **No son de ARASAAC**: su licencia CC BY-NC-SA no casa con una web que se vende. Se cambian ahí sin tocar nada más.
- `facil` va en `SIN_INDICE` de `aplicar.mjs`: la página trae su propia lista con pictogramas, y el índice lateral la repetía.

**Fuentes del contenido** (solo lo que ya dice la plantilla, y la ley general cuando es obvia):
| Trámite | Qué se ha usado |
|---|---|
| Empadronarse | Atajo («Alta o renovación en el padrón»), momento «Me vengo a vivir aquí», trámite de la sede «Alta o renovación en el padrón», «certificado digital o Cl@ve» y «a cualquier hora» (textos de la plantilla), dirección y teléfono de `contacto`. «Tiene que apuntarse cuando viene a vivir»: obligación general (art. 15 de la Ley 7/1985) |
| Domiciliar recibos | Atajo («Alta, baja o cambio de cuenta»), momento «Domiciliar para no olvidarme», trámite «Domiciliación de tributos». «Empieza por E y S»: el IBAN español |
| Licencia de obra | Atajo («Licencia o autorización urbanística») y momento «Voy a hacer obra» (obra pequeña: declaración responsable; obra mayor: licencia) |
| Ayudas a la natalidad | Atajo («Convocatoria 2026: bases y solicitud en el tablón») y `DATOS.md` (convocatoria de 2026, exp. 182/2026, en el tablón). El botón abre el documento de la convocatoria |
| Avisar de un problema | La página de F9 |

**Lo que no se ha puesto, por no constar**: los papeles que pide cada trámite, plazos, cuantías y requisitos de la ayuda, si la obra es «pequeña» o «grande», y el horario (es de ejemplo). En su lugar, el texto manda preguntar en el Ayuntamiento, así que no hace falta ningún «EJEMPLO». **La sede no se ha leído**: su `robots.txt` prohíbe a los robots todo salvo `/info` (README), y se ha respetado.

### M10 · Progreso y tiempo de lectura en las noticias
- Junto a la fecha: «N min de lectura». Se calcula en el build con las palabras del cuerpo ÷ 200, redondeado y 1 como poco; `data-palabras` lleva la cuenta. El cuerpo va ahora en `<div class="articulo__cuerpo">`.
- Bajo la cabecera, una línea de 3 px de oro (`.lectura-progreso`, `aria-hidden="true"`) que se queda pegada arriba (sticky) mientras se lee y avanza con `scaleX`.
  - **Va solo dentro de `@supports (animation-timeline: scroll())` y de `prefers-reduced-motion: no-preference`**; fuera, `display: none` en `base.css`.
  - Usa una línea de tiempo de **vista** del artículo (`view-timeline: --lectura`, rango `contain`), no `scroll(root)`. Así 0 % es cuando el principio del artículo llega arriba y 100 % cuando su final llega abajo. Con `scroll()` de la página, el pie (muy alto) hacía que al acabar de leer la línea se quedara en el 70 %.
- Las noticias de Ribera son muy cortas (de 18 a 42 palabras): todas dicen «1 min» y la línea se llena enseguida.

### M11 · El hemiciclo se ordena al pulsar un partido
- Con un grupo **pulsado** (aria-pressed), sus escaños llevan `.es-saltado` y se desplazan 7 unidades del dibujo hacia el centro del hemiciclo.
  - Es `translate`, con una transición de 240 ms y `--curva-salida`, y vuelven al soltarlo.
  - El vector lo calcula `js/identidad.js` para cada escaño, desde su centro y el del hemiciclo (`data-centro="150 150"`, que pone `aplicar.mjs` en el SVG). Vale para cualquier número de grupos y de filas.
- Al pasar el ratón o el foco solo se atenúa, como antes. Mientras otro grupo está a la vista, los escaños del grupo pulsado vuelven a su sitio.
- El texto del centro («3 de PP») no se mueve nunca.
- Con movimiento reducido, ni salto ni transición: solo el atenuado, que es información.

## Archivos y campos nuevos
- **Nuevos**:
  - `fuente/incidencia.html`, `js/incidencia.js`;
  - `fuente/facil.html`, `fuente/_pictos_facil.html`, `contenido/facil.json`;
  - este informe.
- **Cambiados**:
  - `fuente/_noticia.html`, `fuente/tramites.html` (momentos y «Los más pedidos»; el buscador no se ha tocado), `fuente/_pictogramas.html` (`p-farola`, `p-facil`);
  - `css/base.css` (tres bloques «v3b · INTERIORES», justo antes de la CORTINA, y dos reglas junto a `.articulo__meta`), `css/movimiento.css` (M10 y M11), `js/identidad.js` (M11);
  - `scripts/aplicar.mjs`, `scripts/verificar.mjs`, `municipio.json`, `RESKIN.md`.
- **Campos opcionales** (documentados en RESKIN.md):
  - `municipio.json → incidencias: {correo, categorias}`;
  - `municipio.json → tramites.momentos[].incidencia: true`;
  - `contenido/facil.json` (§7 de RESKIN).
  
  En Ribera, `incidencias.correo` es el correo general del Ayuntamiento (`contacto.correo`, de su web). Si tienen uno para incidencias, se cambia ahí.
- `aplicar.mjs`:
  - `PICTO_DE` gana `incidencia.html` y `facil.html`;
  - `v.incidencia` es la huella del JS;
  - borra `incidencia.html` y `facil.html` si sus datos desaparecen;
  - a cada atajo y momento le pone `facil` (o `null` explícito, por el Mustache que busca hacia fuera);
  - se niega si un pictograma de `facil.json` no existe o si un `atajo` no está en `tramites.atajos`.

## Pruebas
- **Nueva** `v3bInteriores()` (4 comprobaciones, registrada como `['v3binteriores', v3bInteriores]`):
  - **F9**:
    - respaldo sin JS (action mailto, post, text/plain, sin `novalidate`, obligatorios con `required`; con JS apagado se ve el formulario y no el «listo» ni la ubicación);
    - validación vacía (resumen visible y con el foco, un enlace por obligatorio y en orden, `aria-invalid`, error visible enlazado por `aria-describedby`, los opcionales sin marcar), el enlace del resumen lleva el foco y un correo opcional mal escrito se avisa;
    - ubicación simulada;
    - el mailto: destinatario, forma `?subject=…&body=…`, sin espacios ni saltos crudos, asunto con la categoría y la calle, cuerpo con **todos** los campos (también `&`, `;` y `¿`), CRLF, y el texto para copiar con asunto y destinatario;
    - «Copiar el texto», el aviso de largo, axe con errores y con el «listo» (a 390 px) y la consola limpia;
    - en una copia sin `incidencias.correo`: ni página ni enlaces.
  - **F10**:
    - tantos trámites como entradas válidas de `facil.json` (5), cada atajo con su «Explicado fácil» en su propio `<li>`;
    - pasos con pictograma del sprite y con su botón;
    - la frase más larga ≤ 20 palabras (medida en el DOM, sin el texto oculto);
    - sin abreviaturas (C/, Avda., n.º, etc., Sr., tel…) ni colores;
    - letra ≥ 20 px y mayor que la base, la nota de validación, axe a 1280 y a 320 px y sin desborde.
  - **M10**:
    - el texto «N min de lectura» por noticia con su `data-palabras`, y las palabras del cuerpo pintado iguales a las calculadas;
    - la barra `aria-hidden` en todas;
    - en el CSS, la barra visible solo dentro del `@supports`;
    - con movimiento, arriba < 50 % y al final 100 % (bajando con `page.mouse.wheel`); con reducido, no sale.
  - **M11**: para cada grupo, con movimiento:
    - todos sus escaños más cerca del centro;
    - los demás quietos y atenuados;
    - el texto anclado igual y sin traslación;
    - las animaciones en curso ≤ 300 ms;
    - al soltar, todo vuelve al píxel.
    
    Con reducido: nada se mueve, sin transiciones, y se atenúa.
- **Cambiada** la de **v3 M4** (`v3Identidad`): pedía que la duración máxima de las transiciones de los escaños fuera ≤ 200 ms. Ahora pide **opacidad ≤ 200 ms** (igual que antes) **y ninguna de más de 300 ms**, porque el salto (`translate`, 240 ms) es lo que pedía M11. No se ablanda lo que ya medía: la opacidad se mide aparte, con su mismo tope.

## Lo que no se pudo hacer, o se hizo distinto
- **Cinco atajos**: Ribera tiene 4. El quinto trámite fácil es «Avisar de un problema» (ver F10). Si otra rama añade un quinto atajo, sale sin «Explicado fácil» hasta que alguien escriba su entrada en `facil.json` (la prueba solo pide el enlace a los que la tienen).
- **Requisitos reales de cada trámite** en lectura fácil: no constan y la sede no se puede leer con robots. Conviene pedírselos al Ayuntamiento y completar `facil.json`.
- **Validación con personas usuarias** (UNE 153101 EX): pendiente, y así lo dice la página.
- **Probar sin soporte de `animation-timeline`** en un navegador de verdad: Chromium lo soporta. Se comprueba en el CSS que la barra solo se enciende dentro del `@supports`.

## Posibles choques al unir con las otras ramas
- **`fuente/tramites.html`**: «Los más pedidos» va entre el buscador y «Por momentos», y en el momento hay un botón nuevo. Si la rama del buscador (`v3b-servicio`) cambia la primera sección, el choque será en las líneas de alrededor; las dos cosas se conservan. Si otra rama pone también los atajos en Trámites, quedaría duplicado: quedarse con una y llevarle el enlace «Explicado fácil» (`{{#facil}}…{{/facil}}`).
- **`css/base.css`**: mis bloques van justo antes de `/* ═══ CORTINA`, y dos reglas tras `.articulo__meta`. Si otras ramas añaden también ahí, basta con dejar los bloques uno tras otro.
- **`css/movimiento.css`**: un bloque M10 antes del comentario «v3. Hemiciclo», y la línea `.hemiciclo circle { transition: … }` cambiada (ahora lleva también `translate`).
- **`js/identidad.js`**: solo el bloque del hemiciclo (comentario, el cálculo del vector y `es-saltado` en `pintar`). Lo de la impresión no se ha tocado.
- **`scripts/aplicar.mjs`**: los cambios están en estos sitios (otra rama que toque las mismas líneas chocará):
  - bloques nuevos antes de `mitadTemas` (incidencias) y antes de «nombres en lenguaje claro» (lectura fácil);
  - la línea de `momentos:`;
  - las entradas de `PAGINAS` tras el 404;
  - `PICTO_DE`, `SIN_INDICE` y la limpieza de páginas;
  - `v.incidencia`, `incidencias, facil` en `comun` y `data-centro` en el SVG del hemiciclo;
  - y en `noticias`: `contarPalabras` y `lectura_min`.
- **`scripts/verificar.mjs`**: el bloque `v3bInteriores()` justo antes de «orden», la línea `['v3binteriores', v3bInteriores],` y el cambio en la comprobación M4 de `v3Identidad`. Los otros agentes ponen sus bloques en el mismo sitio: al unir, uno detrás de otro.
- **`RESKIN.md`**: una fila `incidencias` justo antes de `tramites.todos` en la tabla del §3, y un punto `contenido/facil.json` en el §7.
- **`municipio.json`**: `incidencias` antes de `horizonte_agenda_dias`, e `"incidencia": true` en el momento «Ha pasado algo en mi calle».
- **Páginas nuevas en la raíz**: cualquier prueba que cuente páginas (las 20 del README) contará 22. Las pruebas actuales leen la lista del disco, así que no se rompen.

## Dudas y decisiones
- El correo de incidencias es el general del Ayuntamiento: confirmarlo con ellos (y si quieren que estos avisos lleguen a otra persona).
- El formulario no manda nada por su cuenta ni guarda datos. Se dice en la propia página, que enlaza a Privacidad. Como es el vecino quien envía el correo desde su cuenta, no hace falta añadir nada nuevo a la política.
- El «Explicado fácil» no está en los atajos de la portada: es zona de otro agente. Si se quiere, basta copiar el `{{#facil}}…{{/facil}}` de `tramites.html`.
