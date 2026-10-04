# Plantilla municipal «Puerta abierta» · Ribera del Fresno

Es una plantilla de web municipal que se reskinea a cualquier ayuntamiento cambiando datos, escudo y colores, sin tocar HTML, CSS ni JS. El primer caso es real: el **Ayuntamiento de Ribera del Fresno** (Badajoz, 3.130 habitantes). Esta carpeta es la **maqueta que se le propone**.

- En local, con git y sin publicar.
- Lleva en todas las páginas la banda «Propuesta de diseño… no es la web oficial».
- Lleva `noindex, nofollow` en todas las páginas.

```bash
npm install                        # Playwright y axe-core (solo para los scripts)
node scripts/aplicar.mjs           # genera la web desde los datos
node scripts/servir.mjs            # http://127.0.0.1:4192/  ·  con ?revision, el mando
node scripts/verificar.mjs         # todas las comprobaciones (≈ 10 min; --rapido ≈ 4)
```

---

## El concepto: «la puerta del Ayuntamiento, abierta todo el día»

La web es una puerta de medio punto encalada que da paso a lo que pasa hoy en el pueblo. El arco es el motivo dibujado de la página, y el perfil del pueblo a línea firma el pie; todo lo demás es tipografía, datos y orden. Un solo arco, una puerta: nunca una arcada (eso es `restaurante-gabi-zafra-web`).

**Por qué esta versión:**
- **Responde sin hacer buscar.** El panel «Hoy en Ribera» dice si el Ayuntamiento está abierto (se calcula), qué farmacia está de guardia, qué es lo próximo de la agenda y cuál es el último aviso. Debajo, «Más hoy»: el tiempo (enlace a AEMET), el próximo pleno y la recogida de enseres. Si hay canal de avisos (Bandomóvil o similar), cierra el panel con el acceso y «Cómo apuntarse».
- **Aguanta sin fotos buenas.** El arco recorta cualquier foto y disimula su poca resolución. Ribera no tiene una foto decente de la iglesia ni de la plaza.
- **Es la más fácil de reskinear.** El arco y la cal valen para cualquier pueblo extremeño; el escudo solo aporta el color.
- **Nunca parece abandonada.** Las webs de la zona están feas porque **nadie publica**. Aquí lo vivo se mueve solo:
  - el tablón oficial entra por script;
  - las fiestas de fecha fija llenan la agenda;
  - el «abierto ahora», la marca de «hoy» y el mes en curso se calculan en el navegador con la hora real.

**Carácter:**
- Letra: Besley para los titulares y Libre Franklin para el texto. Se sirven desde la propia web.
- Cal `#FAF9F5` y tinta `#1A1E1B`. La cal lleva un grano muy fino y unas manchas suaves (SVG con `feTurbulence`, solo transparencia de negro y con tope: ningún píxel más oscuro que `--superficie-2`).
- Las cabeceras de las páginas interiores repiten la puerta: un arco de línea en la marca con su umbral de oro, de pie sobre el filete, o la foto en arco si `cabeceras` le da una. «El pueblo» la lleva grande.
- El sinople del escudo, oscurecido hasta AA (`#0A7940`), como marca.
- Oro `#EAC102` solo en filetes, en la marca de «hoy» y en el borde del mes actual. **Nunca como texto.**
- El gules, oscurecido (`#CF0317`), solo en la franja urgente y en el 112.
- Esquinas de 6 px, filetes de 1 px y casi ninguna sombra.
- **El pie (v3)** abre con el perfil del pueblo dibujado a línea en la marca, de pie sobre la franja de la sede: en Ribera, las dos torres de Nuestra Señora de Gracia con sus cúpulas y pináculos, el cimborrio, la torre del reloj, la Casa de la Cultura y la sierra del fondo, medidos sobre las fotos de `media/`. Se traza una vez al asomar (600 ms). Debajo, tres columnas: el Ayuntamiento, los enlaces útiles y «Cómo llegar» con un plano propio de las calles, sacado de OpenStreetMap al montar la web. Sin perfil propio sale uno genérico de pueblo extremeño (casas y una espadaña, nunca una arcada); sin plano, dos columnas.

**El gesto grande: la cortina** (solo en la portada, una vez por sesión, 1,2 s):
1. Se traza un arco en sinople de abajo arriba, con su umbral de oro.
2. El hueco del arco se abre desde la base y deja ver la portada.
3. El hueco vuela hasta el arco de la foto del hero y aterriza al píxel; el arco se vuelve a medir en cada fotograma.

Se salta con un clic, una tecla o la rueda. Con movimiento reducido no existe, y sin GSAP se quita sola. Al irse, la foto del arco se asienta (de 1,06 a 1). Si la cortina ya se vio en la sesión, el hero entra solo: el nombre sube 8 px palabra a palabra y la foto se asienta igual (≤ 600 ms). Las fichas de «Hoy» suben escalonadas cuando la tira asoma.

**Movimiento pequeño** (v2), en `css/movimiento.css` y `js/movimiento.js`. Todo va dentro de `prefers-reduced-motion: no-preference`, el estado de reposo es el final y ningún texto se revela con opacity:
- **Transiciones entre páginas.** View Transitions: la cabecera se queda quieta y la foto de una noticia viaja del listado al artículo.
- **Revelados ligados al scroll** (`animation-timeline: view()`, dentro de `@supports`): la raya de oro de cada título se dibuja y la línea de tiempo se traza.
- **Atajos:** un arco de `--marca-tenue` sube al pasar el ratón o al llegar con el foco.
- **Paneles y desplegables:** el menú móvil baja como una persiana, el buscador entra con escala y los desplegables se abren con altura animada.
- **Detalles:**
  - el punto de «Abierto ahora» late 3 veces;
  - los filtros del tablón recolocan las filas;
  - las flechas se desplazan al pasar el ratón;
  - los escaños del hemiciclo aparecen en orden.

Firefox se queda sin las transiciones entre páginas ni los revelados por scroll, y se ve igual de completo. `verificar.mjs → movimiento` comprueba que con movimiento reducido no se anima nada, y que con movimiento no queda nada a medias al bajar hasta el final.

## Sector público: la accesibilidad manda

El RD 1112/2018 obliga a cumplir WCAG 2.1 AA. Por eso esta plantilla **rompe a propósito** el listón «motionsites» del PLIEGO:
- Sin cursor propio, sin Lenis, sin marquee, sin imanes y sin char-reveal. El scroll es el nativo.
- La cabecera **no es fija**: con el zoom al 200 % se comería media pantalla.
- Texto base de 18 px con interlineado de 1,6, como máximo 75 caracteres por línea (medido) y zonas táctiles de 44 px.
- Ningún texto se apaga con `opacity`: cada fondo tiene su token apagado, medido por script.
- Desplegables con `<details>` y buscador con `<dialog>` nativo, que resuelven el teclado y Esc.
- Menú móvil con `aria-expanded`; se cierra con Esc y el foco no se escapa del panel.
- Declaración de accesibilidad según el modelo del RD («parcialmente conforme» hasta la auditoría). Enlaza a los trámites reales de su sede: comunicaciones, solicitudes y reclamación.
- **Ni una petición a terceros**: letras, GSAP y escudo se sirven desde la propia web. El mapa de Google solo se carga si se pulsa.

## Mapa de páginas

| Página | Qué tiene |
|---|---|
| `index.html` | Banda de propuesta y franja del aviso destacado en un solo bloque (rojo si es urgente, ámbar si es programado). Hero con el arco (la foto cambia en cada visita), el buscador de trámites y los botones, entero en 1280 × 720. Debajo, la tira «Hoy en Ribera»: cuatro fichas (Ayuntamiento, farmacia, agenda, último aviso) y «Más hoy». Los trámites más pedidos (4 atajos con icono) y por temas. Tablón con filtros y la fecha en bloque (los 6 últimos), en banda blanca. «Lo que viene y lo que pasó» (Hoy arriba; lo que viene en 60 días y las últimas noticias) con el listín corto. «El año en Ribera» en banda oscura. «¿Quién se ocupa de qué?» en banda tenue. Franja de sede y pie |
| `tramites.html` | Buscador, «Por momentos», por temas y «Todos los trámites (115)» con filtro |
| `ayuntamiento.html` | Alcaldía (retrato como hueco diseñado y saluda de ejemplo). Quién se ocupa de qué (asunto, persona, cargo, delegación oficial y grupo, en una sola lista). El pleno en hemiciclo (color, trama y rótulo): cada grupo de la leyenda es un botón que resalta sus escaños (ratón, foco o pulsado, con aria-pressed; Esc lo suelta). Horario y contacto. Enlace a las grabaciones de pleno |
| `avisos.html` | Avisos propios y el tablón completo con filtros |
| `noticias.html` y `noticia-*.html` | Lista y detalle de cada noticia |
| `agenda.html` | Lo que viene (con las fiestas de fecha fija y los plenos), lo que pasó y el año en fiestas. Cada evento que viene lleva «Añadir a mi calendario (archivo .ics)»; un pleno, su convocatoria o, ya celebrado, su grabación |
| `telefonos.html` | El listín completo, con el 112 el primero y el «abierto ahora» de la biblioteca y el centro de día. «Imprimir los teléfonos» (con JavaScript) da una hoja A4 para la nevera: escudo, urgencias en grande, los números en dos columnas, fechas y la web |
| `pueblo.html` | Cabecera grande con la foto de las dos torres en arco (y su crédito), carril de lugares con fotos en arco, la placa de la casa natal de Meléndez Valdés, historia, patrimonio en tres grupos, fiestas, gastronomía con foto, personajes, rutas y créditos de las fotos |
| `pueblo-en.html`, `pueblo-pt.html` (v3b) | «El pueblo» en inglés y en portugués, desde `contenido/pueblo.<lang>.json`: selector de idioma solo en estas tres páginas, `hreflang` entre ellas y el aviso «The rest of the site is in Spanish». Sin traducción completa, no se generan (RESKIN.md §6 quater) |
| `contacto.html` | Dirección, horario, mapa bajo clic, instancia general y quejas (en la sede), y datos de la entidad |
| `transparencia.html` (v3c) | «Transparencia»: lo que la ley obliga a publicar (Ley 19/2013 y Ley 4/2013 de Extremadura), un apartado por cosa con lo que es y **dónde está en el municipio** (o un hueco «Pendiente»), y cómo pedir lo que no esté. Desde el pie y la franja de la sede, no desde el menú |
| `escribanos.html` (v3c) | «Escríbanos»: consulta, sugerencia o felicitación por correo, como «Avisar de un problema»; lo legal, al registro de la sede. Desde «Contacto» |
| `aviso-legal.html`, `privacidad.html`, `cookies.html`, `accesibilidad.html`, `404.html` | Lo legal y la página de error |
| `propuesta.html` | **Solo en la maqueta, para el alcalde** (se manda por correo; ni en el menú ni en el pie). Qué falla en su web actual (comprobable, de `propuesta_web`), comparador antes/después con deslizador, qué cambia, «publicar es rellenar un formulario» y el siguiente paso. El precio, `[PRECIO: lo pone Álvaro]`, solo con `?revision` |
| `suscribirse.html` | «Avisos y agenda en su móvil»: la agenda con `webcal://` (`agenda.ics`), los avisos en un lector (`feed.xml`) y el listín sin cobertura |
| `publicar.html` (v3c) | **«Publicar en la web», para el personal del Ayuntamiento** (fuera del menú, `noindex` siempre; la enlaza el pie: «Personal del Ayuntamiento: publicar»). Botones a los formularios de Google (`hoja.formularios`; sin ellos, «Se activa al montar la hoja»), qué sale dónde con muestras hechas con las piezas reales, el simulador «Pruébelo» (no envía nada), corregir y retirar, el buen título, lo que no se publica y lo que se pide a quien mantiene la web. Impresa, una hoja A4 para la mesa |

## Cómo está hecho (y cómo se reskinea)

```
municipio.json          el municipio (fuentes en DATOS.md)
marca/marca.json        colores sacados del escudo, letra, densidad
marca/escudo*.png       el escudo rasterizado (escudo.svg es el original de Commons)
contenido/*.json        avisos, agenda, noticias y tablón: lo que cambia
media/ + creditos.json  fotos con gradación común y su crédito
fuente/*.html           plantillas (Mustache mínimo, como en plantilla-veterinaria-web)
js/vivo.js              lo que cambia solo; lo ejecutan aplicar.mjs (Node) y el navegador
scripts/                aplicar, escudo, marca-desde-escudo, fuentes, medir-letra,
                        fotos, tablon, verificar, quitar_mandos, servir, og, nuevo-municipio
pruebas/segura-de-leon/ el reskin de prueba (otro municipio real)
pruebas/alta/06124/     respuestas guardadas de nuevo-municipio.mjs para Segura (v3c · alta)
marca/perfil.*          el perfil del pueblo (perfil.json → scripts/perfil.mjs → perfil.svg)
marca/plano.*           el plano del pie (scripts/plano.mjs, desde OpenStreetMap)
marca/termino.*         el mapa del término en «El pueblo» (scripts/termino.mjs, desde OpenStreetMap; sin él, no sale)
media/originales/       las fotos antes de igualarlas (scripts/fotos-igualar.py, el mismo color para todas)
contenido/pueblo.*.json «El pueblo» traducido (en, pt)
css/imprimir.css        la web en papel y la hoja de teléfonos para la nevera
```

La receta completa está en **[RESKIN.md](RESKIN.md)**. En resumen:
1. rellenar `municipio.json` (v3c: `node scripts/nuevo-municipio.mjs <código INE>` escribe un borrador desde datos abiertos y la lista de lo que falta, RESKIN.md §0);
2. `node scripts/escudo.mjs escudo.svg`;
3. `python scripts/marca-desde-escudo.py`;
4. `python scripts/fotos.py --lote …`;
5. `node scripts/aplicar.mjs`;
6. `node scripts/verificar.mjs`.

Cada paso funciona igual que en la veterinaria:
- los colores se calculan como hex en el script (`scripts/lib/color.mjs`);
- `css/marca.css` es el único archivo con colores y letras;
- `aplicar.mjs` se niega a escribir si:
  - un color no llega a AA;
  - falta un dato obligatorio;
  - queda un `[PENDIENTE]`;
  - una foto no tiene crédito.

**Prueba de reskin.** `verificar.mjs` aplica `pruebas/segura-de-leon/` sobre una copia: otro escudo, otra sede de Gestiona, tres servicios y sin pleno, noticias ni placa. Falla si queda cualquier resto de Ribera (nombre, sede, correo, teléfono, comarca, concejales) en lo que se publica. Además, pasa axe y comprueba el desborde a 320 px en la copia.

## Cómo se mantiene viva

| Qué | Cómo | Quién |
|---|---|---|
| **Avisos, agenda y noticias** | `contenido/*.json` o una **hoja de Google** publicada (ver abajo). La web pinta primero lo que trae y luego fusiona lo de la hoja; la tarea diaria la mete también en el feed, los calendarios y las páginas de noticia (v3c) | El Ayuntamiento, desde la hoja |
| **La tarea diaria** (v3c) | `.github/workflows/actualizar.yml` (GitHub Actions), dos veces al día: tablón (si está autorizado), hoja y `aplicar.mjs --sin-capturas`; sube la web si hay algo nuevo y una vez al día aunque no lo haya. El pie dice «Web actualizada el …». Cómo se activa y cómo se ve si falla: [PUBLICAR.md](PUBLICAR.md), «La tarea diaria» | Nadie |
| **Aviso destacado** | Un aviso con `"gravedad": "urgente"` (franja roja) o `"programado"` (franja ámbar) y `"caduca": "AAAA-MM-DD"`. Sale arriba en todas las páginas y se quita solo al caducar | El Ayuntamiento |
| **Tablón oficial** | `node scripts/tablon.mjs` lee `/board` de la sede, quita lo que lleva datos personales y conserva el `titulo_claro` que haya puesto una persona. La web refresca `contenido/tablon.json` al cargar | Una tarea diaria (ver abajo) + una persona para el lenguaje claro |
| **Fiestas** | `municipio.json → pueblo.fiestas`. Las de `fecha_fija` entran solas en la agenda | Una vez al año |
| **Abierto ahora, «hoy», mes actual** | Se calculan en el navegador con la hora de Madrid | Nadie |
| **Farmacia de guardia** | `municipio.json → farmacias`: rotación (semanal, por ejemplo) y/o fechas sueltas, también desde la pestaña `Farmacias` de la hoja. Cambia sola a la hora del relevo (`cambio`, 09:30) | El Ayuntamiento, una vez al año con el calendario del Colegio |
| **Próximo pleno y recogida** | `municipio.json → plenos` (o la agenda con `tipo` «pleno») y `recogida` (días de la semana o fechas) | El Ayuntamiento |
| **Calendarios (.ics)** | `aplicar.mjs` escribe `ics/<id>.ics` para cada evento, también los de la hoja (v3c); uno que llegue de la hoja entre dos pasadas de la tarea diaria se genera en el navegador al pulsar | Nadie |
| **Suscribirse sin redes** | `aplicar.mjs` escribe `feed.xml` (avisos y noticias, Atom) y `agenda.ics` (toda la agenda), con lo de la hoja (v3c); `suscribirse.html` lo explica al vecino | Nadie |
| **Teléfonos sin cobertura** | `sw.js` guarda `telefonos.html` y lo que necesita; se renueva con cada build | Nadie |
| **Publicar desde el móvil** | Formulario de Google → hoja → web: **[PUBLICAR.md](PUBLICAR.md)**. Se monta de un clic con `plantillas-hoja/crear-hoja.gs`; quien publica usa `publicar.html`; `scripts/comprobar-hoja.mjs` revisa una exportación | La secretaría |

**La hoja de cálculo** (memoria «hoja de cálculo como CMS»):
1. Crea una hoja de Google con tres pestañas: `Avisos`, `Agenda` y `Noticias`.
   - En la primera fila van los nombres de columna (`id`, `fecha`, `tema`, `titulo`, `texto`, `urgente`, `caduca`, `hora`, `lugar`, `resumen`, `estado`).
   - Un `estado` «oculto» o «borrador» la oculta.
   - En `Agenda` también valen `hora_fin`, `tipo` («pleno»: sale como «Próximo pleno» en el panel), `convocatoria` y `grabacion`. Una celda de solo hora se lee bien («20:30»).
   - **Opcional, pestaña `Farmacias`** (las guardias): columnas `desde`, `hasta` y `farmacia` (el `id` o el nombre exacto de `municipio.json → farmacias.lista`). Mandan sobre la rotación. Se activa con `"farmacias": "Farmacias"` en `hoja.pestanas`.
2. Archivo → Compartir → Publicar en la web.
3. Pon su id en `municipio.json → hoja.id`.

La web lee la hoja por el endpoint `gviz`, con `credentials: "omit"` (sin cookies) y un corte a 7 segundos. Si la hoja no contesta, se queda lo que venía en la página. Está probado en los dos sentidos.

**También al montar (v3c):** `aplicar.mjs` lee la misma hoja (`scripts/lib/hoja.mjs`, con el mismo código de `js/vivo.js` que el navegador) y la fusiona con `contenido/*.json` antes de pintar: así sale en `feed.xml`, `agenda.ics`, los `ics/<id>.ics`, la lista de `avisos.html`, y cada noticia de la hoja tiene su página. Lo último bueno se guarda en `contenido/hoja.json`: si la hoja no contesta, se usa eso. Lo que no se puede enseñar (sin título, una fecha imposible) se queda fuera con un aviso; nunca para el montaje. RESKIN.md §7 ter.

**El tablón y el robots.txt.** La sede de Gestiona **no tiene RSS, JSON ni CORS**, y su `robots.txt` prohíbe a los robots todo salvo `/info` (comprobado el 02/10/2026). Por eso:
- **en la maqueta** el tablón sale de una copia del 2 de octubre (`pruebas/tablon/board-ribera.html`, con el nombre del causante de una declaración de herederos sustituido), con `node scripts/tablon.mjs --desde …`;
- **en producción** la lectura automática solo se activa con `"tablon_autorizado": true`, cuando el Ayuntamiento (titular de la sede) lo autorice por escrito. Entonces la tarea diaria (`.github/workflows/actualizar.yml`, ya incluida; en otro hosting, un cron con lo mismo) ejecuta `node scripts/tablon.mjs` y `node scripts/aplicar.mjs --sin-capturas`, y publica. Sin la autorización, la tarea corre igual y no toca el tablón.
- Si la sede no responde o cambia el marcado, **no se toca** el último `tablon.json`.

Datos personales: se excluyen por patrón y hay pruebas con 17 títulos reales de sedes de la zona. Entran:
- declaraciones de herederos;
- listas de admitidos y excluidos;
- actas de selección o de tribunal;
- baremaciones;
- nombramientos;
- bolsas de trabajo;
- jurados;
- notificaciones;
- cualquier DNI o NIE.

En el tablón del 2 de octubre había 10 anuncios; salen 8 y 2 se quedan fuera.

**La cuota de mantenimiento** cubriría:
- poner en marcha la tarea diaria del tablón;
- revisar cada semana los títulos en lenguaje claro;
- publicar en la hoja lo que el Ayuntamiento mande por WhatsApp o correo;
- actualizar la corporación, los horarios y las fiestas;
- revisar la accesibilidad una vez al año (y la declaración);
- vigilar que la sede no cambie las rutas.

## El mando de la reunión (`?revision`)

Abajo a la izquierda. Solo aparece con `?revision` y se aparta mientras está el aviso de cookies.
- **Versión:**
  - **«Puerta abierta»** (la cargada): el arco enmarca también las fotos del carril, de las noticias y el retrato vacío, y la marca de «hoy» lleva un arquito.
  - **«Sobria»**: el arco solo en el hero. A cambio, el panel «Hoy» **añade** «111 trámites en la sede, las 24 horas» (contados de los datos) y los tres próximos eventos.
- **Color:** Sinople (el real), Azur y Almagre. Se derivan girando el matiz ±100° con la misma estructura de contraste. El escudo no cambia.

**Antes de entregar** (comprobado por script contra una copia, en cada verificación):
```bash
# 1. fijar lo elegido en la reunión
#    versión sobria → "densidad": "sobria" en marca/marca.json
node scripts/aplicar.mjs --fijar-paleta b      # solo si eligen otro color (b = Azur, c = Almagre)
# 2. quitar el mando
python scripts/quitar_mandos.py --comprobar     # lo prueba en una copia
python scripts/quitar_mandos.py                 # borra los bloques [MANDO DE MAQUETA] y regenera
# 3. cuando sea la web oficial: "propuesta": false e "indexar": true en municipio.json
node scripts/aplicar.mjs && node scripts/verificar.mjs
```

## Decisiones que conviene saber

- **El color de marca es el sinople, elegido a mano.** Por área ganaría el azur de la campaña del escudo (y el oro de la corona, que nunca puede ser marca). El sinople es el fresno que da nombre al pueblo, y el prompt lo pedía; el motivo queda escrito en `marca/marca.json`. En el reskin, si gana el gules, la marca pasa al siguiente esmalte: el rojo es el de las alertas. Le pasó a Segura de León.
- **Trámites: 115 en la lista, 111 en la sede.** `datos-ribera.json` trae 117:
  - 111 son del catálogo de la sede;
  - 4 son impresos en PDF de su web;
  - 2 son formularios de Google de la temporada deportiva **2023**, que no se enseñan (`vigente: false`) porque llevarían a una inscripción caducada.
  
  Las cifras se cuentan de los datos, no se escriben a mano.
- **«Ayudas a la natalidad»** no tiene trámite propio en el catálogo. El atajo lleva al anuncio de la convocatoria 2026 en el tablón de la sede, y lo dice («Documento en el tablón de la sede»).
- **Letras y GSAP alojados en la propia web** (`scripts/fuentes.mjs`, `js/vendor/gsap.min.js`). Una web municipal no debería mandar la IP de cada vecino a Google para pintar una letra.
- **Medidas tipográficas** (`scripts/medir-letra.mjs`, con las letras de verdad):
  - altura de x de 0,52 en Besley y 0,53 en Libre Franklin;
  - el nombre de la cabecera va a ×1,274 del menú, para que su altura de x sea exactamente 1,25 la del menú (verificado en el navegador);
  - interlineado de titulares de 1,12, porque la tilde de la ñ (0,76) más la bajada de la g (0,27) más un respiro piden 1,07.
- **La cortina, sin `clip-path: path()`.** El muro es un trazado SVG con `fill-rule: evenodd`. Durante las pruebas, el Chromium sin cabeza se colgaba al pausar, capturar y mover la animación. No llegó a pasar en una ejecución normal, pero no se arriesga.
- **Gradación común de las fotos** (`scripts/fotos.py`): cielos neutros, cal limpia y saturación contenida. Las fechas naranjas de las fotos de Diegui57 se recortan.

### Erratas de su web, corregidas al usar sus textos
- «Vigilio» → **Virgilio** (biblioteca «Virgilio Gutiérrez»).
- «Matrachel» → **Matachel** (Mancomunidad Tierra de Barros – Río Matachel).
- «Alcade» → **Alcalde**.
- El teléfono de la Guardia Civil que da su web (924 53 60 11) es el del Ayuntamiento. Se usa el de guardiacivil.es: **924 536 013**.

### Datos que se contradicen
- **Distancias a Badajoz**: 82, 83 o 107,6 km según la fuente. No se enseñan.
- **Muestra de Vinos de Pitarra**: «finales de febrero» según su web y «puente de diciembre» según Wikipedia. Se usa febrero.
- **Fiestas del Cristo**: su web dice desde el 14 de septiembre, cuatro días; la Diputación, del 13 al 16. Se usa la de su web.

## Créditos de las fotos

| Foto | Autor | Licencia |
|---|---|---|
| Avenida con torre (portada), Casa de la Cultura, dulces | web del Ayuntamiento | **Solo para la propuesta**: su aviso legal prohíbe reproducirlas sin autorización |
| Las dos torres de la iglesia | cartel de DEMA y la Junta de Extremadura (2014), web del Ayuntamiento | Ídem. Es una foto pequeña (728 px) |
| Monumento a Meléndez Valdés | F. Enrique Suárez | CC BY-SA 3.0 |
| Oppidum de Hornachuelos | Ángel M. Felicísimo | CC BY 2.0 |
| Pozo de «La Tinajona», lavadero de lanas | Diegui57 | CC BY 4.0 y CC BY-SA 4.0 |
| Escudo | SanchoPanzaXXI (Wikimedia Commons) | CC BY-SA 4.0 |

Todas tienen enlace a su ficha en `media/creditos.json` y en la página «El pueblo».

## Pendientes para el Ayuntamiento

- [ ] **Horario de atención** al público. Ahora sale el de ejemplo, «Lunes a viernes, de 9:00 a 14:00», con la etiqueta.
- [ ] **Fotos propias**: la iglesia, la plaza y las fiestas, y **autorización** para usar las de su web.
- [ ] **El escudo**: el Pleno abrió en 2024 un expediente para cambiarlo y crear bandera. Si se aprueba, se rehace con `scripts/escudo.mjs` y los colores salen solos.
- [ ] **Fechas de FEAVIR 2026 y de la V Feria del Comercio.** FEAVIR sale como ejemplo (12 de noviembre); también la apertura del camino al Pozo de San Juan.
- [ ] Si usan **Bandomóvil** u otra app de avisos (para enlazarla o no duplicar). Con el canal y los pasos para apuntarse, sale en la portada, en el pie y en «Avisos».
- [ ] **Farmacias y calendario de guardias** (nombre, dirección, teléfono, si la guardia se comparte con otros pueblos y a qué hora cambia). Ahora salen las dos de la C/ Meléndez Valdés (fuente secundaria) con una rotación semanal **de ejemplo** y sin teléfono. El enlace al buscador del Colegio de Farmacéuticos de Badajoz sí es real.
- [ ] **Plenos**: la fecha del próximo (sale uno de ejemplo, el 29 de diciembre a las 20:00) y dónde se cuelga la convocatoria.
- [ ] **Recogida de enseres**: qué día pasa y cómo se pide. Ahora sale de ejemplo «los miércoles, pídala el día antes en el Ayuntamiento».
- [ ] Enlazar su **Instagram** (`@aytoriberadelfresno`): su web actual apunta a plus.google.com. Esta propuesta ya lo enlaza en el pie y en contacto.
- [ ] **Dirección del registro**: C/ Ayuntamiento n.º 1 (web) o n.º 2 (directorio DIR3 de la sede).
- [ ] El **saluda** de la alcaldía: el texto actual es de ejemplo.
- [ ] **Autorización para leer su tablón** de la sede (`robots.txt` lo prohíbe a los robots).
- [ ] Confirmar las delegaciones vigentes de Urbanismo y el orden de los tenientes de alcalde. El último BOP localizado es del 19/06/2026.

Los datos de cada página tienen su fuente en **[DATOS.md](DATOS.md)**.

## Verificación

`node scripts/verificar.mjs` hace, con Playwright:
- **axe-core** (WCAG 2.1 A y AA) en las 20 páginas, con las dos densidades y las tres paletas. También en móvil, con el aviso de cookies, el menú abierto y el buscador con resultados.
- **Contraste** de las 21 parejas de tokens en las tres paletas.
- **Sin scroll horizontal** a 320, 360, 390, 768, 1024 y 1440 px, y con el zoom al 200 %.
- **Teclado**: el foco se recorre entero y se ve siempre, con estilo y contraste medidos. Menú móvil con Esc.
- **Cortina**:
  - se traza de verdad (muestreada fotograma a fotograma);
  - un fotograma a mitad se comprueba por píxel;
  - aterriza al píxel sobre el arco;
  - sale una vez por sesión, no sale en interiores ni con movimiento reducido;
  - se retira sin GSAP y sin `cortina.js`;
  - se salta con la rueda.
- **«Abierto ahora»** con la fecha simulada: un martes a las 10:00 y un domingo.
- **Panel «Hoy»** (vivo.js en Node con fechas simuladas, y el navegador con el reloj de Playwright):
  - sin datos no sale ni la farmacia, ni «Más hoy», ni el canal;
  - la farmacia de guardia en 8 fechas, con la frontera del relevo (a las 9:29 sigue la de ayer, a las 9:30 la nueva), una fecha suelta que manda sobre la rotación y, sin farmacia propia, el enlace oficial;
  - el tiempo (el INE manda y casa con el DIR3; si no, `aplicar.mjs` se niega), el próximo pleno (no repetido en la agenda), «toca hoy» / «la próxima, mañana» en la recogida y el canal con «Cómo apuntarse»;
  - los `.ics`: CRLF, líneas de ≤ 75 octetos sin partir tildes, UID estable y único, DTSTAMP, DTSTART con zona o de día entero, escapado de `,` `;` `\` y saltos, un enlace por evento; y un evento de la hoja que se descarga como `.ics` generado con un Blob.
- **Tablón**:
  - los filtros cuentan filas visibles;
  - las exclusiones se prueban con entradas de prueba;
  - con `route.abort` se pinta el respaldo y un tablón nuevo se pinta solo;
  - la hoja de cálculo se prueba en los dos sentidos;
  - la sede caída no rompe nada.
- **Reskin** a Segura de León sin restos de Ribera, y la banda de propuesta que se apaga con `"propuesta": false`.
- **Secciones opcionales** que Ribera no usa («Para visitar», «Normativa y documentos» e impresos en Word, añadidas para Fuente de Cantos; el canal de avisos con sus pasos, farmacias con teléfono, dos recogidas y un pleno a 10 días): se prueban en una copia con los datos de muestra de `pruebas/opcionales.json`, con axe y a 320 px.
- **Páginas interiores**: la puerta de la cabecera no pisa el título ni las migas, cabe en la pantalla y es de medio punto a 320, 390, 1024 y 1440 px y con zoom; sin foto, de pie sobre el filete; en la sobria, sin arco. «El pueblo» con su foto grande y su crédito, el patrimonio entero en sus grupos, «¿Quién se ocupa de qué?» sin perder a nadie (asunto, persona, delegación y grupo), el hemiciclo entero y la textura de cal sin `fixed` ni filtros.
- **Contenido**:
  - «Ejemplo» exactamente en los 8 datos marcados;
  - banda y `noindex` en todas las páginas;
  - los 302 enlaces de la sede con el patrón de Gestiona.
- **Checklist**: cookies con `:not([hidden])`, menú con `height: 100dvh`, la receta de borrado del mando, la medida de la letra, las zonas táctiles y la estructura (un `h1`, títulos sin saltos, landmarks).

### Última pasada: 2 de octubre de 2026

`node scripts/verificar.mjs --capturas` → **85 de 85 comprobaciones**, en 8 minutos y medio. Las capturas quedan en `screenshots/`, sin versionar.

Lo que costó y conviene saber al tocarla:
- **El reloj de la cortina.** En una carga en frío termina antes de que Playwright devuelva el control, así que se muestrea con un enganche en `addInitScript`. Pausar, capturar y mover la animación colgaba el Chromium sin cabeza.
- **El movimiento reducido** quita las transiciones (`transition: none`), no las acorta a 0,01 ms. Acortadas, el estilo computado llegaba un fotograma tarde y las pruebas del mando fallaban de vez en cuando.
- **El nombre largo de un municipio** («Segura de León») se montaba sobre los botones a 320 px sin provocar scroll horizontal. Ahora hay una prueba específica de que no se pisan.
