# Reskin: pasar la plantilla a otro ayuntamiento

Receta para «hazle la maqueta a X». Todo el cambio consiste en tres pasos:
1. rellenar `municipio.json`;
2. soltar el escudo y las fotos;
3. ejecutar los scripts.

No se toca HTML, CSS ni JS a mano. Si hace falta, ya no es un reskin (ver «Cuándo deja de ser reskin», al final).

Tiempo orientativo: 1–2 horas con los datos a mano. Lo que más tarda es **reunir los datos con su fuente**, no aplicarlos.

Prueba real: `pruebas/segura-de-leon/` es Segura de León completo (otro escudo, otra sede, 3 servicios). `scripts/verificar.mjs` lo aplica sobre una copia y falla si queda cualquier resto del municipio original.

## 0. El camino corto: alta desde datos abiertos (v3c)

```bash
node scripts/nuevo-municipio.mjs 06124 --salida ../alta-segura      # 1. el borrador (código INE de 5 cifras o "Nombre")
#                                                                   2. completar ALTA-<slug>.md en el municipio.json del borrador
node scripts/aplicar.mjs                                            # 3. en la copia de la plantilla (§1), con ese municipio.json y su marca/
node scripts/verificar.mjs                                          # 4.
```

1. **`nuevo-municipio.mjs`** escribe en `--salida` (nunca en la raíz de la plantilla ni encima de un `municipio.json` que no sea un borrador suyo):
   - `municipio.json`, un **borrador** (`"_borrador": true`) con lo que se saca de fuentes abiertas, y en `_fuentes` la fuente, la url y la fecha de cada dato. Lo que no se encuentra va `null`.
   - `ALTA-<slug>.md`: **lo que falta, por orden de importancia** (con pistas cuando las hay), las **contradicciones entre fuentes** (no elige: si el INE y Wikidata dan habitantes distintos del mismo año, no pone ninguno) y lo que está puesto pero hay que mirar con ojos.
   - `marca/escudo.svg` y sus PNG (el escudo de Commons, con `escudo.mjs`) y `marca/termino.*` (el mapa del término, con `termino.mjs --raiz`).
   - `_respuestas/`: todo lo traído, para repetirlo sin red con `--desde <carpeta>`. `--sin-red` usa las de `pruebas/alta/<ine>/` (lo usa `verificar.mjs`); `--sin-mapa`, sin Overpass.
2. **Completa** el borrador con `ALTA-<slug>.md` delante, apuntando cada dato nuevo con su fuente en `DATOS.md` (§2), y quita `"_borrador"`.
3. **`aplicar.mjs`**: con el borrador a medias **se niega y lista lo que falta** (los obligatorios de §3, el listín y el catálogo de trámites), sin romperse; mientras quede `"_borrador"`, lo avisa.
4. **`verificar.mjs`**, como siempre.

Qué da y de dónde (comprobado con Segura de León, Usagre y Fuentes de León el 4-10-2026):

| Dato | Fuente | Nota |
|---|---|---|
| Nombre, código INE, provincia, habitantes | INE (API JSON de INEbase: la tabla del padrón de la provincia) | El código se comprueba en el INE: **Segura de León es 06124** (06125 es Siruela) y Usagre 06136 |
| Superficie, altitud, gentilicio, código postal, web, escudo, comarca | Wikidata, por SPARQL en el espejo QLever (el robots.txt de wikidata.org no deja usar `/sparql` a los robots) | Cada dato enlaza a su elemento. Superficie y altitud van a `cifras` sin año: contrástalas con el IGN |
| Autor y licencia del escudo, y el archivo | Wikimedia Commons (la ficha y upload.wikimedia.org) | Si tiene varias licencias, la CC |
| Dirección, CP, teléfono, fax y correo | El pie de su web (las de la Diputación lo llevan) y la sede de Gestiona («¿Tienes algún problema?», en `/info.0`, lo único que deja su robots.txt) | Si no casan, a contradicciones |
| Sede | El enlace de su web o `<nombre>.sedelectronica.es` (que diga «Sede Electrónica de <nombre>») | En Gestiona, la instancia general y las quejas son los uuid comunes, **por comprobar** en el navegador |
| Trámites | En Gestiona, el catálogo común de la plantilla (solo los que van por uuid) | **Por comprobar**: cada ayuntamiento activa los suyos |
| DIR3 y titular | Calculados: `L01` + INE + dígito de control; «Ayuntamiento de …» | El NIF no se calcula: sale como pista (`P` + INE + `00` + letra suele valer, pero hay que copiarlo de la sede) |
| El término | OpenStreetMap, con `termino.mjs` (la relación, de Wikidata) | |

**Lo que queda a mano** (no hay fuente abierta fiable): el horario, el NIF, la corporación (BOP), el listín de teléfonos, las fotos, «El pueblo» (historia, lugares, fiestas…), los colores del escudo (`marca-desde-escudo.py`), el plano y el perfil del pie, el contenido (avisos, agenda, noticias) y repasar lo marcado «por comprobar». El alcalde que da Wikidata va solo como pista: en Segura estaba desfasado. Es lo que más tarda, igual que antes, pero ya no hay que buscar ni teclear lo de arriba.

---

## 1. Duplicar la carpeta

```bash
cp -r plantilla-ayuntamiento-puerta-abierta-web <municipio>-ayuntamiento-web
cd <municipio>-ayuntamiento-web
rm -rf .git screenshots _scratch && git init
rm -f marca/perfil.* marca/plano.* marca/termino.*    # perfil, plano y mapa del término son del pueblo de origen (§6 bis y §6 ter)
rm -f contenido/pueblo.*.json media/originales/*      # las traducciones de «El pueblo» y los originales de las fotos, también (§6 quater y §6)
npm install                      # Playwright y axe-core, solo para los scripts
```

La prueba de reskin de `verificar.mjs` aplica sobre una copia el primer municipio de `pruebas/` **distinto del tuyo**. Si tu municipio es justo el de `pruebas/` (le pasa a Segura de León), pon allí el de la plantilla (`municipio.json`, `marca/`, `media/` y `contenido/` del original) para que la prueba siga teniendo otro pueblo con el que comparar.

## 2. Reunir los datos (con fuente)

Guárdalos en un `DATOS.md` como el de Ribera: un dato por fila y su fuente. Las reglas del prompt común se aplican igual:
- **Lo no confirmado no se inventa.** O no aparece, o lleva `"ejemplo": true` y sale con la etiqueta «Ejemplo».
- **La corporación**, de los BOP, nunca de la ficha de la Diputación (suele estar desfasada).
- **Los teléfonos**, con el formato `924 536 011`. `aplicar.mjs` se niega si no.
- **Corrige las erratas** de su web y apúntalas en el README.

Fuentes que funcionaron en Ribera y Segura:

| Dato | Dónde |
|---|---|
| Habitantes | INE, serie de padrón del municipio |
| Corporación | BOP de Badajoz (nombramientos y delegaciones) |
| Sede, DIR3 y NIF | `<sede>/ownership` |
| Trámites | catálogo de la sede (`/catalog/t/<uuid>`) |
| Teléfonos | su web, guardiacivil.es, educarex, el directorio de bibliotecas y el catálogo del SES |
| Fiestas | su web, la ficha de la Diputación y Turismo de Extremadura |
| Fotos | Wikimedia Commons, con autor y licencia |
| Código INE | INE (nomenclátor) o el DIR3 de la sede: `L01` + **INE** + dígito de control. Abre el enlace de AEMET y mira que sale tu pueblo |
| Farmacias y guardias | El Ayuntamiento o las propias farmacias (el calendario de guardias lo reparte el Colegio cada año); el buscador del Colegio provincial como `farmacias.oficial` |
| Plenos | Convocatorias en el tablón de la sede; las grabaciones, en su Facebook o YouTube |

## 3. `municipio.json`

| Campo | Obligatorio | Notas |
|---|---|---|
| `slug` | sí | `a-z0-9-`. Se usa en las claves de localStorage |
| `nombre`, `nombre_corto` | sí | `nombre_corto` sale en «Hoy en …» y «El año en …» |
| `provincia`, `comarca`, `gentilicio`, `habitantes`, `lema` | no | El lema sale bajo el nombre, en la letra de titulares, en cursiva y en la marca, con una raya de oro delante; si es `null`, no sale. Corto (como «Vive la Historia»): tiene que caber en una línea |
| `propuesta` | — | `true` en la maqueta: banda «no es la web oficial» y título de compartir «Propuesta de web». `false` al venderla |
| `indexar` | — | `false` hasta que sea la web oficial |
| `url` | — | La dirección publicada. Sirve para la og:image y la 404 bajo prefijo |
| `web_actual` | no | Su web de ahora; el aviso legal de la propuesta la cita |
| `contacto.*` | sí | Dirección, CP, teléfono y correo. `fax` y `mapa_consulta` son opcionales |
| `horario` | sí | `texto` y `tramos: [{dias:[1..7], de:"09:00", a:"14:00"}]` (1 es lunes). Sin tramos no se calcula «abierto ahora». Si no está confirmado, `"ejemplo": true` |
| `sede` | sí | Ver §4 |
| `tablon_autorizado` | — | `false` hasta que el Ayuntamiento autorice por escrito leer su tablón (ver §7) |
| `tablon_max` | no | Cuántos anuncios del tablón enseña la web (40 si no se dice). Hace falta en las sedes que guardan años de tablón (Diputación) |
| `hoja` | no | `{id, pestanas: {avisos, agenda, noticias, farmacias}, formularios: {avisos, agenda, noticias}}` de la hoja de Google publicada (ver README y PUBLICAR.md). `farmacias` es opcional: la pestaña de guardias. **v3c · `formularios`** (opcional): las direcciones (https) de los tres Formularios de Google; salen como botones en `publicar.html` y en ningún otro sitio (no van en los datos de las demás páginas). `null` o sin el campo: el botón dice «Se activa al montar la hoja». Las escribe `plantillas-hoja/crear-hoja.gs` al montarlo todo. (v3c · automatico) La lee también `aplicar.mjs` al montar la web: §7 ter |
| `legal` | sí | `titular`, `nif` y `dir3` |
| `escudo_credito` | sí | Autor, licencia y URL de la ficha de Commons |
| `corporacion` | no | `grupos` (sigla, nombre, color, trama `liso`/`rayas`/`puntos`/`cuadros`, gobierno) y `miembros` (nombre, grupo, cargo, delegación y `alcalde: true`). Sin `grupos` no sale el hemiciclo; con 13 concejales o menos, sale de una sola fila |
| `alcaldia.saluda` | no | Con `saluda_ejemplo: true` mientras no lo escriban ellos |
| `quien` | no | Tema, persona y cargo. Las de `portada: true` salen en la portada (4). En «El Ayuntamiento», cada fila se completa con la delegación oficial y el grupo del miembro de `corporacion` con el mismo nombre, y las delegaciones que no estén en `quien` se añaden al final (ya no hay sección «Concejalías» aparte): **el nombre tiene que escribirse igual en los dos sitios** |
| `servicios` | sí | Nombre, teléfono, dirección, horario, `tramos`, `nota` y `grupo`. El grupo ordena el listín. Sin teléfono (la recogida de basura, por ejemplo) sale solo con su detalle, y entonces lleva al menos `nota` u `horario` |
| `urgencias` | no | El 112 va el primero, en rojo |
| `listin_corto` | no | 4 nombres de `servicios` o `urgencias` para la portada |
| `tramites.atajos`, `temas`, `momentos` | sí | Cada trámite con `id` (Gestiona), `url` u `opc` (Diputación). `tipo: "pdf"`, `"doc"` (impreso en Word) o `"documento"` cambia el aviso «se abre la sede». Los atajos llevan `icono` (opcional): el nombre de un símbolo de `fuente/_iconos.html` sin el `i-` (`padron`, `recibo`, `obra`, `carrito`, `volante`, `incidencia`, `casa`, `familia`…); sin él, `documento`. `aplicar.mjs` se niega si el icono no existe |
| `horizonte_agenda_dias` | no | Cuántos días por delante enseña «Lo que viene» en la portada (60 si no se dice). Si no hay nada en ese plazo, lo dice y nombra lo siguiente de la agenda. Si hay uno o dos, se completa hasta tres con «Más adelante» (lo que la agenda ya tiene después del plazo). En la página «Agenda», el calendario del mes deja pasar como poco hasta ese mes (y hasta el del último acto anunciado) |
| `incidencias` | no | «Avisar de un problema» (`incidencia.html`): un formulario que prepara un correo al Ayuntamiento, sin servidor. `{correo, categorias}`; `categorias` en texto o `{nombre, ayuda}` (sin ellas: alumbrado, agua, limpieza, vía pública, ruidos y otro). **Sin `correo` no se genera la página** ni su enlace. El teléfono de la Policía Local sale del servicio cuyo nombre la contiene; si el catálogo tiene un trámite de «incidencia», se enlaza al pie. En `tramites.momentos`, el momento con `"incidencia": true` lleva el botón al formulario |
| `escribanos` | no | v3c · **«Escríbanos»** (`escribanos.html`, enlazada desde «Contacto → Escribir al Ayuntamiento»): consulta, sugerencia o felicitación por correo, sin servidor y con el mismo enfoque que `incidencia.html` (la validación, el mailto y el «Su mensaje está listo» son comunes, en `js/formulario-correo.js`). Va al correo de `contacto.correo`; `{correo}` lo cambia y `false` la quita. Sin correo, ni página ni enlace. Dice arriba que una queja formal o una solicitud va por el registro de la sede (con `sede.quejas`, si existe, y la instancia general) |
| `transparencia` | no | v3c · **`transparencia.html`** («Transparencia», enlazada desde el pie y la franja de la sede, no desde el menú): lo que la ley obliga a publicar (Ley 19/2013, arts. 6, 7 y 8, y Ley 4/2013 de Extremadura), un apartado por cosa con una frase de qué es y **dónde está en este municipio**, y «Si no lo encuentra, pídalo» (derecho de acceso). `{revisada: "AAAA-MM-DD", portal: {url, nombre}, apartados: {<id>: {enlaces: [{texto, url, nota}], pendiente}}}`; los `<id>` son `organizacion`, `normativa`, `presupuestos`, `cuentas`, `contratos`, `convenios`, `subvenciones`, `retribuciones` y `acceso` (`aplicar.mjs` se niega con otro). Solos, sin datos, se enlazan el portal de la sede (o `portal`, si es el de la Diputación: **compruébalo**), el perfil del contratante, «El Ayuntamiento» y la solicitud de acceso del catálogo (o la instancia general). **Cada `url` tiene que ser del municipio y estar comprobada** (su web, el BOP, la sede, la Plataforma); lo que no conste va en `pendiente` y sale como hueco «Pendiente: …» **solo en la maqueta**: con `"propuesta": false`, el apartado se queda con su explicación y el enlace al portal (o a pedirlo). Sin el campo, la página explica lo general, manda al portal (si lo hay) o a pedirlo, y no inventa enlaces. Los artículos los pone la plantilla, leídos en el BOE |
| `tramites.todos` | sí | Todo el catálogo. `vigente: false` lo oculta sin borrarlo. Los impresos de su web van aquí con `url` y `tipo: "pdf"` o `"doc"`: salen con la etiqueta PDF o Word |
| `tramites.sinonimos` | no | Palabras del vecino que llevan al nombre oficial: `"boda": ["matrimonio"]`. v3b: el buscador (diálogo de la cabecera, portada y Trámites) es **global**: encuentra también avisos y anuncios del tablón, noticias, teléfonos del listín y lugares de `pueblo.lugares`, agrupados por tipo y con los trámites primero. No hay que tocar nada: avisos, tablón y noticias salen de los datos vivos de cada página; teléfonos y lugares, de `js/tramites-datos.js` (`window.BUSCAR`, generado). En la portada salen 5 resultados como mucho y «Ver los N resultados» lleva a Trámites con lo escrito |
| `pueblo.*` | no | Entradilla, historia, lugares (con foto), visitas (ver abajo), placa, patrimonio, fiestas (`mes`, `fecha_fija: "MM-DD"` y `mayor`), gastronomía, personajes y rutas. Cada bloque vacío desaparece |
| `cifras` | no | v3b · banda «{nombre_corto} en cifras» de la portada, entre «El año» y «Conocer»: `[{valor, unidad, etiqueta, fuente, fuente_url, anio}]`, de 4 a 5. `valor` es un número (sale a la española: 3.130, 185,6) o un texto (un año, «s. XIII»). **Cada cifra lleva su fuente**, que sale en pequeño debajo con su enlace y el año del dato; `aplicar.mjs` se niega sin `valor`, `etiqueta` o `fuente`. Fuentes buenas: INE (padrón), la ficha de la Diputación (superficie y altitud), el IGN. Si las fuentes no coinciden (las distancias de Ribera), no se pone. Sin el campo, la banda no sale |
| `pueblo.lugares` en la portada | — | La banda «Conocer …» de la portada enseña los 5 primeros lugares **con foto** (en el orden de `pueblo.lugares`), en arco y con su crédito; cada uno enlaza a su sitio en «El pueblo → Qué ver» (`pueblo.html#lugar-<nombre>`). Con menos de 3 lugares con foto, la banda no sale |
| `pueblo.portada_lugares` | no | Para elegir cuáles y en qué orden salen en «Conocer …»: lista de `nombre` de `pueblo.lugares` (con foto), 5 como mucho. El primero sale más grande: conviene la mejor foto. `aplicar.mjs` se niega si un nombre no es un lugar con foto |
| `pueblo.visitas` | no | Lo que se visita por dentro (museo, casa natal, centro de interpretación): `nombre`, `texto`, `direccion`, `horario`, `precio`, `telefono`, `nota`, `url` y `url_texto`. Sale en «El pueblo → Para visitar». Cada dato solo aparece si está: **si el horario no está confirmado, no se pone**; se dice en `nota` cómo preguntarlo |
| `documentos` | no | Lo que su web tenía colgado y no es un trámite: ordenanzas, actas, decretos. Lista de `{grupo, nota, items: [{titulo, url, tipo: "pdf"\|"doc", fecha}]}`. Sale en «El Ayuntamiento → Normativa y documentos», un desplegable por grupo |
| `pueblo.establecimientos` | no | Lo que su web tenía de bares, restaurantes, alojamientos o área de autocaravanas: `[{grupo, nota, items: [{nombre, direccion, telefono, nota}]}]`. Sale en «El pueblo → Dónde comer y dormir», con la forma del listín. Son negocios privados: **`pueblo.establecimientos_fuente` es obligatorio** («Datos de la web municipal, actualizados en 2022.») y sale debajo, con el aviso de que el Ayuntamiento no responde de ellos |
| `instalaciones` | no | Instalaciones municipales y alojamiento municipal: `[{grupo, items: [{nombre, texto, direccion, horario, precio, telefono, nota, url, url_texto}]}]`. Sale en «Teléfonos y servicios → Instalaciones municipales», un bloque de fichas por grupo (Deporte, Parques, Alojamiento municipal…). Cada dato solo aparece si está; con `url` va `url_texto`, que dice qué abre (por ejemplo, «Reservar en su sistema actual»). Lo privado (bares, casas rurales) va en `pueblo.establecimientos` |
| `canal_avisos` | no | Si el Ayuntamiento ya publica avisos en Bandomóvil, Telegram o WhatsApp: `{nombre, url, texto, pasos: ["Descargue…", "Busque…"], otros: [{nombre, url}]}`. Sale arriba de «Avisos» («Reciba los avisos en el móvil», con los `pasos` como «Cómo apuntarse»), al pie del panel «Hoy» de la portada, al lado del tablón de la portada (con los `pasos`), en el pie de todas las páginas y en «Contacto». Que lo sigan usando: la web no lo sustituye. **No se inventa**: sin canal confirmado, no se pone |
| `ine` | no | Código INE del municipio, **5 cifras** sin el dígito de control (`"06113"`). Es la **única** fuente del enlace «El tiempo» del panel «Hoy» (`aemet.es/…/municipios/<nombre>-id<ine>`; AEMET decide el pueblo por el número, no por el nombre). `aplicar.mjs` se niega si no casa con `legal.dir3` (L01 + INE + control): en otro reskin el INE estaba mal y AEMET enseñaba otro pueblo. Compruébalo abriendo el enlace |
| `farmacias` | no | Farmacia de guardia en el panel «Hoy»: `{lista: [{id, nombre, direccion, localidad, telefono}], cambio: "09:30", guardias: [{desde, hasta, farmacia}], rotacion: {inicio, dias, orden: [ids]}, oficial: {nombre, url}, ejemplo}`. Un día de guardia va de `cambio` (09:30 si no se dice) a la misma hora del día siguiente. Mandan las `guardias` por fechas (también desde la pestaña `Farmacias` de la hoja); si ninguna cubre el día, la `rotacion` (`inicio` es el primer día de la primera de `orden`; `dias`, 7 = semanal). `localidad` solo si la guardia cae en otro pueblo de la zona. `oficial` es el buscador del Colegio de Farmacéuticos (Badajoz: `https://cofbadajoz.com/farmacias-de-guardia/`): sin farmacia propia, la fila es solo ese enlace. Sin `lista` ni `oficial`, no sale |
| `plenos` | no | `[{fecha, hora, tipo, lugar, convocatoria, grabacion, ejemplo}]`. Entran en la agenda (chip «Pleno», con su .ics) y el próximo sale en «Más hoy» y al lado del tablón de la portada (con «Añadir a mi calendario»). Sin canal de avisos ni pleno próximo, el tablón ocupa todo el ancho. Mientras viene enlaza la `convocatoria`; cuando ya pasó, la `grabacion`. También vale una fila de la agenda con `"tipo": "pleno"` |
| `recogida` | no | `[{id, nombre, dias: [1..7], fechas: ["AAAA-MM-DD"], hora, como, telefono, tramite, tramite_texto, ejemplo}]` (enseres, poda, voluminosos). En «Más hoy» dice «toca hoy» o «la próxima, el …» y cómo pedirla. `tramite` es una URL o `{id}` del catálogo de la sede. Salen las 2 primeras |
| `fotos.hero` | no | `archivo`, `alt` y `posicion` (CSS). Sin foto, el arco queda como hueco diseñado con el escudo apagado |
| `fotos.hero_fotos` | no | Varias fotos para el arco de la portada, `[{archivo, alt, posicion}]`: en cada visita sale una al azar. Se elige en el `<head>` antes del primer pintado (con su precarga, su `srcset`, su `alt` y su encuadre), sin saltos de página. **La primera** es la que sale sin JavaScript y la de la imagen para compartir. Con `hero_fotos`, `hero` no hace falta; sin él, sale `hero` como siempre. Elige fotos que aguanten el arco en vertical (4:5 en escritorio) y en apaisado (5:3 en el móvil): el `posicion` horizontal decide qué queda dentro. Todas con crédito en `media/creditos.json`. **Pie de la foto** (v3b): si la foto es la de un lugar de `pueblo.lugares` (misma `foto`), sale sobre el pie del arco el nombre del lugar enlazado a su sitio en «El pueblo» (`pueblo.html#lugar-<nombre>`), elegido junto con la foto antes del primer pintado. `lugar` (un `nombre` de `pueblo.lugares`) lo fuerza, `pie` pone un texto sin enlace para una foto que no es un lugar, y `lugar: null` lo quita. Sin nada de eso, no hay pie |
| `cabeceras` | no | Foto de la cabecera de una página interior, por id de página (`tramites`, `ayuntamiento`, `avisos`, `noticias`, `agenda`, `telefonos`, `pueblo`, `contacto`, `legal`, `noticia`): `{archivo, alt, posicion}`, o solo el nombre del archivo si la foto es decorativa (sin `alt`). Sale recortada en arco, con su crédito debajo. **`pueblo` la pinta grande**, como un hero: es la página turística, así que conviene darle la mejor foto. Las páginas sin foto llevan el arco de línea en la marca con su umbral de oro y, dentro, el **pictograma** de la página (calendario, teléfono, documento con sello, megáfono, periódico, edificio, sobre, balanza, candado, galleta, accesibilidad, pueblo), que se traza al llegar (la 404, nada: ya tiene su arco). El pictograma lo elige la plantilla (`PICTO_DE` en `aplicar.mjs`, dibujos en `fuente/_pictogramas.html`), no los datos: no hay que tocar nada. En la versión sobria, la foto es un rectángulo y no hay arco de línea. Si la foto de `pueblo` es la del primer lugar del carril, ese lugar pasa al final. Solo fotos de `media/` con crédito |
| `propuesta_web` | no | Solo para `propuesta.html`, la página que se manda al alcalde (no sale en el menú ni en el pie, y con `"propuesta": false` no se escribe). `problemas`: lo que se puede **comprobar** en su web actual, `[{texto, fuente}]` (sin esto, la sección habla en general: nada inventado); `revisada` (AAAA-MM-DD); `captura_antes: {archivo, alt}` con una captura de su portada actual (sin ella, el «antes» del comparador es un hueco marcado «PENDIENTE: captura de la web actual»); `contacto: {nombre, correo, telefono}` de quien presenta (sin él, «responda al correo con el que le ha llegado»). El precio no va en los datos: es un bloque `[PRECIO: lo pone Álvaro]` que solo se ve con `?revision` y se va con el mando. El «después» lo captura `scripts/captura-portada.mjs` al aplicar (`assets/propuesta-portada.jpg`) |
| `pueblo.patrimonio[].grupo` | no | Agrupa el patrimonio en columnas con título («Iglesia y ermitas», «Casas y palacios», «Arqueología y campo»…), en el orden en que aparecen. Sin grupos, sale la lista de siempre en dos columnas; lo que no lleve grupo entre otros que sí, va a «Otros» |

## 4. La sede: dos familias

```json
"sede": { "tipo": "gestiona", "base": "https://X.sedelectronica.es",
          "instancia_general": "<uuid>", "quejas": "<uuid>", "perfil_contratante": "<url opcional>" }
```
- **Gestiona** (esPublico). El tablón está en `/board`, la transparencia en `/transparency` y cada trámite en `/catalog/t/<uuid>`.
  - Los uuid del catálogo son **comunes** a los ayuntamientos de Gestiona. Los de Ribera valen para Segura: basta con cambiar el subdominio.
  - Comprueba cada uno con un GET.
  - Si su perfil del contratante está «deshabilitado» en la sede (le pasa a Segura), pon en `perfil_contratante` el de la Plataforma de Contratación.

```json
"sede": { "tipo": "diputacion", "base": "https://sede.X.es", "ent_id": 123,
          "opc": { "tablon": 1, "transparencia": 2, "perfil": 3 }, "instancia_general": "<opc o url>" }
```
- **Diputación de Badajoz**: las rutas son `/portal/noEstatica.do?opc_id=…&ent_id=N`. Los `opc_id` se sacan del menú de su sede. En los trámites, pon `opc` o una `url` completa.
  - Primer caso real: Monesterio (`ent_id` 54). El catálogo está en `/sede/catalogoTramites.do?ent_id=N&idioma=1&pes_cod=-1` y es corto (22 trámites).
  - Los de **registro de entrada** tienen ficha con enlace fijo: `/sede/fichaInformativa.do?asu_cod=…&asu_mod_cod=…&codVerif=<hash>&tra_cod=`. El `codVerif` es estable, no de sesión. Ponla en `url`.
  - Los del **padrón** no tienen ficha pública. Usa su `opc`: `noEstatica.do?opc_id=49` abre una página que pide identificarse y lo explica. Las rutas internas (`/sede/pmhnet/…`) devuelven una página vacía sin sesión.
  - El patrón de la verificación admite cualquier `/portal/*.do?…` o `/sede/*.do?…` de su `base`.
  - **No suele haber transparencia ni quejas** en la sede. Sin `sede.transparencia` ni `sede.opc.transparencia`, el enlace a transparencia no sale en ninguna página (franja de la sede, «Normativa y documentos» y aviso legal); lo mismo con el perfil del contratante. Sin `sede.quejas`, «Quejas» lleva a la instancia general. Pon en `sede.instancia_general` la `url` de la ficha del registro general.

La verificación comprueba que **todos** los enlaces de la sede siguen el patrón de su tipo.

## 5. Escudo y colores

```bash
node scripts/escudo.mjs ruta/al/escudo.svg            # o .png
python scripts/marca-desde-escudo.py --solo-ver       # mira qué propone
python scripts/marca-desde-escudo.py                  # lo escribe en marca/marca.json
```

`marca-desde-escudo.py` clasifica los esmaltes por área y elige el principal. Quita de la cuenta la plata, el sable, lo «natural» y el oro (que va siempre a decoración).

Si gana el **gules**, la marca pasa al siguiente esmalte, porque el gules es el de las alertas y un aviso urgente no puede parecer un botón. Le pasó a Segura: su campo es rojo y la marca quedó en el sinople de la punta.

Para forzar otro esmalte y dejar escrito el motivo:
```bash
python scripts/marca-desde-escudo.py --principal sinople --motivo "El fresno es la pieza que da nombre al pueblo"
```

Reglas que no se negocian:
- **El escudo no cambia de color nunca**: ni con la paleta, ni en el pie, ni en el favicon.
- **El color del escudo no se toca.** `aplicar.mjs` lo oscurece en OKLCH (el mismo matiz) hasta AA y se niega a escribir si algo no llega. La tabla queda en `marca/_contraste.txt`.
- **El escudo no es el motivo del diseño.** El motivo es el arco, que vale para cualquier pueblo.

`marca/marca.json` también tiene:
- `letra`: la pareja tipográfica. Si la cambias, ejecuta `node scripts/fuentes.mjs` y `node scripts/medir-letra.mjs`;
- `giros_paleta`: cuántos grados giran las paletas B y C del mando;
- `densidad`: `"puerta"` o `"sobria"`.
- `cortina`: la de la portada.
  - `"puerta"` (por defecto): un arco se traza, se abre y vuela al de la foto.
  - `"escudo"`: el escudo aparece en el centro, la cal se abre en círculo y el escudo aterriza en la cabecera. La pidió Monesterio. Úsala solo si el escudo está confirmado: es lo primero que se ve.
  
  Las dos duran 1,2 s como mucho y cumplen lo mismo (una vez por sesión, se saltan, nada con movimiento reducido). `verificar.mjs` prueba la que esté puesta.

## 6. Fotos

```bash
python scripts/fotos.py --lote media/_lote.json          # recorte + gradación común + 1600 y 800 px
```

- Una entrada por foto en `media/creditos.json`: `titulo`, `autor`, `licencia`, `url` y `nota`. **`aplicar.mjs` se niega a escribir si una foto no tiene crédito.**
- Las fotos de **su web** solo valen para la maqueta que se les enseña. Ponlo en la `nota`.
- Ni banco de imágenes ni IA. Si falta una foto, se deja el hueco diseñado y se apunta en el README.

### Igualar las fotos (v3b)

Las fotos de un pueblo vienen de cámaras y años distintos y, juntas en «Conocer» y «Qué ver», se nota. `scripts/fotos-igualar.py` les aplica **a todas el mismo tratamiento de color** (nada de recortes, fondos ni contenido):

1. balance de blancos sobre los grises de la propia foto, a medias y con tope (±7 % por canal); sin grises suficientes (un plato), no se toca;
2. niveles: el 0,5 % más oscuro y el 99,5 % más claro a un rango común (estiramiento como mucho ×1,3) y una gamma que acerca la mediana a 0,52 (entre 0,8 y 1,1);
3. saturación hacia una croma media común (factor entre 0,85 y 1,12: una foto casi en blanco y negro sigue casi en blanco y negro);
4. un punto cálido muy leve y común en los medios tonos (±1,2 % de rojo y azul);
5. nitidez suave después de reducir, en cada tamaño.

```bash
python scripts/fotos.py --lote media/_lote.json                 # 1. recorte y tamaño (como siempre)
python scripts/fotos-igualar.py --guardar-originales --comparativa
        # 2. la primera vez: copia media/<nombre>.jpg a media/originales/ y los iguala
python scripts/fotos-igualar.py --comparativa                   # las siguientes: siempre desde media/originales/
```

- **Repetible e idempotente**: parte siempre de `media/originales/<nombre>.jpg` (que no se toca) y regenera `media/<nombre>.jpg` y `media/<nombre>-800.jpg` con el mismo tamaño. Correrlo dos veces da los mismos bytes (`verificar.mjs → v3bpueblo` lo comprueba).
- **Una foto nueva**: déjala en `media/originales/` (o en `media/` y `--guardar-originales`), ponle su crédito y vuelve a correrlo.
- **Mírala antes de darla por buena**: `media/_comparativa-igualado.jpg` es la hoja de contacto (antes arriba, después abajo). Lo medido y lo aplicado a cada foto queda en `media/_igualado.json`. Si una foto buena empeora, baja la fuerza en las constantes de arriba del script (`FUERZA_BLANCOS`, `TOPE_NIVELES`, `SAT_MIN/SAT_MAX`), no la toques a mano: todas tienen que pasar por lo mismo.

## 6 bis. El pie: el perfil del pueblo y el plano

El pie abre con **el perfil del pueblo dibujado a línea** (de pie sobre la franja verde de la sede) y lleva, en su tercera columna, **un plano de las calles del Ayuntamiento**. Los dos son SVG propios que `aplicar.mjs` incrusta en cada página: ni una petición en tiempo de ejecución. Los dos son opcionales:

| Archivo | Si falta |
|---|---|
| `marca/perfil.svg` (lo dibuja `scripts/perfil.mjs` desde `marca/perfil.json`) | Sale el **perfil genérico** (`fuente/_perfil_generico.svg`): casas encaladas, tejados, chimeneas y una iglesia con espadaña de un solo vano. Vale para cualquier pueblo extremeño. **Nunca una arcada**: el concepto es una sola puerta |
| `marca/plano.svg` + `marca/plano.json` (los escribe `scripts/plano.mjs` desde OpenStreetMap) | El pie queda a dos columnas (el Ayuntamiento y los enlaces útiles), sin hueco |

### El perfil de otro pueblo

Un vecino tiene que reconocer su pueblo: se dibuja **desde fotos reales** (las de `media/` o las que se tengan), no de memoria.

1. Elige el edificio que todo el mundo reconoce (la torre de la iglesia, el castillo, el silo) y, si hay, uno o dos más (otra torre, una fachada con frontón, la sierra del fondo).
2. Copia `marca/perfil.json` de Ribera como punto de partida y cambia las `piezas`. El lienzo mide **1600 × 180**: `x` de izquierda a derecha y `alto` desde el suelo. **Lo principal va en el centro**: en un móvil de 320 px solo se ve de x = 475 a x = 1125.
3. Mide sobre la foto: abre la foto con una regla (en Ribera, la foto de las torres recortada y ampliada ×3 con marcas cada 10 px) y pasa las medidas con **una sola escala** (Ribera: 0,66 unidades por píxel de la foto). Proporciones que importan: alto de la torre frente a su ancho, dónde está el campanario, cómo remata (cúpula, chapitel, espadaña), pináculos, óculos y vanos. La base de las torres puede quedar escondida detrás de las casas, como en la foto.
4. `node scripts/perfil.mjs` escribe `marca/perfil.svg` (cuenta los trazos). Míralo a 320, 1440 y 1920 px (`verificar.mjs --capturas` deja `screenshots/v3-perfil-*.png`). Repite hasta que se reconozca.

Las piezas (ver los comentarios de `scripts/perfil.mjs`):

| Pieza | Para qué |
|---|---|
| `casas` | Filas de casas con semilla fija: `desde`, `hasta`, `alto: [min, max]`, `capa`, `ventanas`, `chimeneas`, `tejados` |
| `torre` | Fuste, cornisa volada, vano en arco, `oculo` o `reloj`, `pinaculos` y `remate`: `cupula` (tambor, cúpula, linterna, cruz) o `chapitel` (apuntado) |
| `cupula` | Una cúpula suelta sobre una nave |
| `cuerpo` | La fachada entre dos torres: remate, `balaustrada`, líneas de cornisa, `oculos`, `ventanas`; con `muros: true`, con sus muros (la fachada de una iglesia de espadaña) |
| `cimborrio`, `nave` | Tejado ochavado con linterna; nave a un faldón o a un agua |
| `fronton` | Casa grande con frontón mixtilíneo, balcones, portada y escudo |
| `espadana` | El muro de las campanas, con **un** vano y su campana |
| `sierra`, `pajaros` | La sierra del fondo (línea fina) y algún pájaro |

Cada pieza lleva su `capa` (más alta, más cerca): lo de detrás no se dibuja por debajo de la silueta de lo de delante, así que no hace falta resolver los cruces a mano. Sin colores: el SVG solo lleva `<path>` (`aplicar.mjs` rechaza cualquier otra cosa) y el color lo ponen los tokens. Al aplicar, cada trazo recibe `pathLength="1"` para que el pie lo trace al asomar.

Si prefieres dibujarlo a mano (Inkscape), vale cualquier `marca/perfil.svg` con `viewBox="0 0 1600 180"`, solo `<path>` con `d` (y `class="lejos"` para lo del fondo), sin `fill`, `stroke` ni `style`, rectas rectas, pocas curvas y nada importante fuera de x ∈ [475, 1125].

### El plano

```bash
node scripts/plano.mjs                       # busca amenity=townhall en OSM dentro del término
node scripts/plano.mjs --osm way/566195233   # o el elemento exacto (mira en openstreetmap.org)
node scripts/plano.mjs --radio 170           # metros del Ayuntamiento al borde (Ribera: 170)
```

- **El Ayuntamiento, por su elemento de OSM**, nunca por el pin de Facebook (memoria «ubicación real: nodo de OSM»). Si OSM tiene varios, el script avisa y usa el que se llama «Ayuntamiento…»; si no tiene ninguno, búscalo a mano y pásalo con `--osm`.
- Dibuja las calles (las principales más gruesas), las plazas, las iglesias, el edificio del Ayuntamiento en la marca y una escala de 100 m, y rotula hasta 3 calles (la de la dirección del Ayuntamiento primero, si cabe) sin que los rótulos choquen.
- Lo usado queda en `marca/plano.json`: elemento, centro, radio, fecha y calles rotuladas. El script lo reutiliza la próxima vez.
- **ODbL**: el pie dice siempre «Datos del plano: © colaboradores de OpenStreetMap» con enlace a su página de derechos. `aplicar.mjs` se niega si `plano.json` no trae la atribución.
- El User-Agent es el del proyecto, sin datos de nadie. Si Overpass está ocupado, prueba otros dos servidores. Con `--guardar copia.json` y `--desde copia.json` se redibuja sin red.
- Se ejecuta una vez al montar la web (o si cambian las calles). El plano enlaza a «Contacto», donde está el mapa de Google, que solo se carga si se pide.

### El plano se dibuja (v3b)

Al asomar, el plano del pie se traza una vez **desde el Ayuntamiento hacia fuera** (600 ms en total). No hay que hacer nada: `aplicar.mjs` parte cada tramo de calle de `marca/plano.svg` en su propio trazo con `pathLength="1"`, empezando por su punta más cercana al centro del lienzo (que `plano.mjs` pone en el Ayuntamiento), y le da su distancia en `--plano-d` (0 el más cercano, 1 el más lejano). Con movimiento reducido, sin JavaScript o sin soporte, el plano está entero desde el principio. Un `plano.svg` dibujado a mano vale si el Ayuntamiento está en el centro del `viewBox`.

## 6 ter. El mapa del término en «El pueblo» (v3b)

Un mapa propio del término municipal, con los lugares de «Qué ver» y del patrimonio que estén en OpenStreetMap. Como el plano, se baja **al montar la web**: la página no pide nada a nadie.

```bash
node scripts/termino.mjs                                    # busca el término (admin_level=8) por el nombre de municipio.json
node scripts/termino.mjs --relacion 344567                  # si hay dos con el mismo nombre, el id de la relación
node scripts/termino.mjs --lugar "Ermita del Cristo Viejo=node/123"   # fija un lugar a mano (repetible)
node scripts/termino.mjs --guardar copia.json               # guarda lo que devuelve Overpass
node scripts/termino.mjs --desde copia.json                 # sin red: redibuja desde la copia
node scripts/aplicar.mjs
```

- Escribe `marca/termino.svg` (el contorno, el casco, las carreteras con su matrícula, las rutas que haya como relaciones `route=hiking/foot/bicycle` y una escala; sin colores, como el plano) y `marca/termino.json` (la fuente, la fecha, los ids de OSM de todo lo usado y, por cada lugar encontrado, su elemento y su posición).
- **Los lugares se buscan por nombre** entre los de `pueblo.lugares` y `pueblo.patrimonio`, y **solo dentro del término** (así son los de este pueblo, no los de otro con el mismo nombre). Vale si todas las palabras de nuestro nombre están en el de OSM (sin contar «de», «la», «san»…), o al revés si el de OSM no es solo genérico («Ermita», «Pozo»). Si un elemento encaja con dos lugares («Ermita del Cristo» en OSM, con dos ermitas del Cristo en el pueblo) o un lugar con dos elementos, **no se pone** y el script lo dice: búscalo en openstreetmap.org y fíjalo con `--lugar`. Los fijados quedan en `termino.json` (`"fijado": true`) y se respetan la próxima vez.
- En la página: un punto numerado por lugar que enlaza a su ficha (`#lugar-<nombre>`: la del carril «Qué ver» o la fila del patrimonio, que ahora llevan ancla), la misma lista en texto debajo (para el teclado y el lector de pantalla: el dibujo es `aria-hidden`), la leyenda en palabras (límite discontinuo, casco sombreado, carreteras gruesas, rutas de puntos; no solo color), la escala y «© colaboradores de OpenStreetMap» con su enlace. **ODbL**: `aplicar.mjs` se niega si `termino.json` no trae la atribución, y si el mapa es de otro municipio.
- **Sin los dos archivos, la sección no sale.** Un lugar que ya no está en `municipio.json` pierde su punto (con aviso).
- **Los puntos que se pisan** (v3c): con datos reales casi todo está en el pueblo (en Ribera, seis de siete lugares en medio kilómetro). `termino.mjs` lleva el grupo más grande de puntos que se pisan a un **recuadro**: el pueblo ampliado, con sus calles y su propia barra de escala, en el hueco del lienzo que menos término tapa; en el mapa grande, un rectángulo marca la zona y una raya la une al recuadro. Si dentro aún se pisan, el círculo se aparta lo justo y una raya fina lo une a un punto en su sitio exacto. La leyenda lo explica en palabras. Se reparte con los círculos y los rótulos ya agrandados como en el móvil (`css/base.css` los escala ×1,6 cuando la figura es estrecha), así que tampoco ahí se pisan. No hay que hacer nada: sale solo si hace falta; lo usado queda en `termino.json` (`recuadro`, `lugares[].sitio`).
- `--raiz <carpeta>` lee el `municipio.json` de otra carpeta y escribe en su `marca/` (lo usa `nuevo-municipio.mjs`).
- `pruebas/termino/muestra-overpass.json` es una muestra **sintética** (contorno, carreteras «XX-1» y posiciones inventados, ids falsos) solo para `verificar.mjs`, que la aplica en una copia. Nunca la pases a `marca/` del pueblo de verdad: sale con la etiqueta «Ejemplo».
- User-Agent del proyecto, sin datos de nadie; si Overpass está ocupado, prueba otros dos servidores. Si en tu red no se llega a Overpass, ejecuta el script en otra máquina y sube `marca/termino.*`.

## 6 quater. «El pueblo» en otros idiomas (v3b)

Solo la página turística. Por cada `contenido/pueblo.<lang>.json` completo sale `pueblo-<lang>.html` (Ribera: `en` y `pt`), con su `lang`, los `hreflang` entre todas (y `x-default` a la de castellano) y un selector de idioma visible **solo en esas páginas**. La cabecera, el menú y el pie siguen en castellano (marcados `lang="es"`), con el aviso corto del idioma («The rest of the site is in Spanish.»).

Copia `contenido/pueblo.en.json` de Ribera y cambia los textos. Lo que lleva:

| Clave | Qué |
|---|---|
| `nombre_idioma`, `og_locale` | «English», «en_GB» |
| `pagina` | `titulo`, `titulo_doc`, `entradilla` (si hay) y `descripcion` |
| `cabecera_alt` | el `alt` de la foto grande, si la tiene |
| `ui` | las etiquetas de la página (los títulos de sección, la leyenda del mapa, «Inicio», «En esta página»…). La lista completa, con su texto en castellano, está en `T_ES` de `aplicar.mjs`; `idiomas` y `aviso_idioma` son obligatorias |
| `pueblo.historia`, `platos`, `dulces`, `bebidas` | listas **con el mismo número de elementos** que en `municipio.json` |
| `pueblo.lugares`, `patrimonio`, `fiestas`, `personajes`, `rutas` | objetos **por el nombre en castellano** de `municipio.json`: `{ "texto"/"detalle"/"cuando"/"resumen": …, "nombre": … (solo si cambia), "alt": … (los lugares con foto) }` |
| `pueblo.grupos`, `placa`, `gastronomia_alt` | los títulos de los grupos del patrimonio, la placa (`titulo`, `pie`, `texto`; las líneas de la placa se quedan en castellano, con `lang="es"`) y el `alt` de la foto de la gastronomía |
| `creditos` | por foto: `titulo` y, si hace falta, `autor` y `nota` traducidos |

- **No se traducen** los nombres propios ni los topónimos (Oppidum de Hornachuelos, Calle Larga, Cañada Real Leonesa); un plato o una fiesta con nombre propio se deja y se explica entre paréntesis.
- **Si falta una traducción** de algo que sale en la página, esa página no se genera y `aplicar.mjs` dice qué falta. Un lugar nuevo en castellano deja la traducción fuera hasta que se traduzca: no rompe la web.
- «Para visitar» y «Dónde comer y dormir» (horarios, precios y negocios) no salen en otros idiomas.
- Sin ningún `contenido/pueblo.<lang>.json`, ni páginas traducidas, ni selector, ni `hreflang`.

### La hoja de teléfonos

`telefonos.html` tiene «Imprimir los teléfonos» (solo con JavaScript) y `css/imprimir.css` la deja en **una hoja A4**: escudo y «Teléfonos útiles de …», urgencias arriba y en grande, el resto en dos columnas, la fecha de los datos (`municipio.json → fecha_datos`), la de impresión y la web (`url`). `verificar.mjs` imprime el PDF y falla si pasa de una hoja: con un listín mucho más largo que el de Ribera (17 números), reduce los tamaños de `css/imprimir.css` o quita detalles del listín.

## 7. Contenido y tablón

- `contenido/avisos.json`, `agenda.json` y `noticias.json`: lo real de su Facebook o de su web, con fecha.
  - En `avisos.json`, `gravedad` (opcional): `"urgente"` (en rojo: una avería, una alerta), `"programado"` (en ámbar: un corte anunciado) o `"informativo"` (en ámbar; es el de por defecto). Un aviso urgente o programado con `caduca` sale en la franja de arriba de todas las páginas hasta ese día; lo urgente gana. `"urgente": true` (de antes) vale como `"gravedad": "urgente"`. La ficha «Último aviso» de la portada lleva su gravedad. En el móvil la franja va en dos líneas como mucho: si el título pasa de 70 caracteres, pon `titulo_corto` (`aplicar.mjs` avisa). Desde la hoja de cálculo valen las mismas columnas. Las fiestas con `fecha_fija` entran solas en la agenda, y los `plenos` también.
  - **Plazos** (v3b, opcional): un aviso de `avisos.json` o un anuncio de `tablon.json` puede llevar `plazo_fin` y/o `plazo_inicio` (`AAAA-MM-DD`). Sale un chip con la cuenta atrás, calculada con la fecha de Madrid en el navegador: «Abre mañana» / «Abre el …», «Quedan N días», «Último día» (el día de cierre entero) y, al día siguiente, «Plazo cerrado» (la fila baja al final del tablón). Con algún plazo abierto, la portada enseña «Plazos abiertos» bajo la tira «Hoy» (los que cierran antes, 4 como mucho); sin ninguno, no sale. **Pon solo la fecha que diga el anuncio**; si no consta, `"plazo_ejemplo": true` (sale «Ejemplo»). En `tablon.json` el plazo lo pone una persona y `scripts/tablon.mjs` lo conserva al refrescar (como `titulo_claro`). `aplicar.mjs` se niega si las fechas están mal escritas o el inicio va después del fin.
  - **Empleo** (v3c): el tema «Empleo» (o «Empleo público»: se juntan en uno) sale con su chip con un maletín, en el filtro del tablón y, si tiene el plazo abierto, en la ficha «Empleo» de la tira «Hoy» de la portada (la oferta que cierra antes, con su cuenta atrás y «Todo el empleo», que abre `avisos.html?tema=Empleo` con el filtro puesto); sin ninguna abierta, la ficha no sale. En el tablón lo detecta `scripts/lib/tablon.mjs → motivoEmpleo` al refrescar (bolsa de trabajo, proceso selectivo, oposiciones, provisión de una plaza o puesto, contratación de personal, plan u oferta de empleo, la subsección «Empleo Público»; la lista y sus trampas, documentadas allí). Si no acierta, `tema` y `"tema_manual": true`. En un aviso propio, `"tema": "Empleo"`. Si el pueblo no tiene ninguna oferta, la maqueta lleva una de muestra con `"ejemplo": true` (en Ribera, `empleo-ejemplo` de `avisos.json`): quítala al pasar a la web oficial.
  - **«Nuevo»**: lo publicado hoy o ayer (las últimas 48 horas; la fecha no lleva hora) lleva en el tablón un punto de oro con la palabra «Nuevo». Lo urgente y lo programado llevan además una franja a la izquierda (roja o ámbar) y su chip. No hay que hacer nada.
  - En `agenda.json`, además de `id, fecha, hora, titulo, lugar, nota`: `hora_fin` (para el .ics; si no, dura una hora), `tipo: "pleno"`, `convocatoria` y `grabacion`.
  - **«Añadir a mi calendario»**: `aplicar.mjs` escribe un `ics/<id>.ics` por evento (RFC 5545: UID estable `<id>@<slug>.agenda`, Europe/Madrid con su VTIMEZONE, o día entero con `VALUE=DATE`) y borra los que sobran. `ics/` es **generado**: se publica con las páginas. Un evento que llega de la hoja tiene su archivo desde el siguiente montaje (la tarea diaria, §7 ter); entre medias, el navegador lo genera al pulsar.
- `contenido/facil.json` (opcional): **«Trámites explicados fácil»** (`facil.html`), los trámites más pedidos en lectura fácil. Uno por atajo (`"atajo"` con el nombre exacto de `tramites.atajos`) o la página de incidencias (`"pagina": "incidencia"`, si hay `incidencias`). Cada uno: `titulo`, `picto`, `que_es` (frases), `pasos` (`{texto, picto}`), `boton` y `sin_internet`. Los pictogramas son los de `fuente/_pictos_facil.html` (sin el `f-`); `aplicar.mjs` se niega si uno no existe o si un `atajo` no está. Marcadores: `{telefono}` (sale enlazado), `{direccion}` (sin abreviaturas: «C/» → «la calle») y `{nombre}`. Reglas: frases de 20 palabras como mucho (lo mide `verificar.mjs`), una idea por frase, sin abreviaturas ni colores («el botón verde» no vale con otra paleta) y **solo lo que conste**: si no se sabe qué papeles pide un trámite, se manda preguntar. Cada atajo de «Trámites → Los más pedidos» enlaza su «Explicado fácil». El pie dice «Pendiente de validar con personas usuarias» hasta que se valide (UNE 153101 EX); cámbialo en `nota`. Sin el archivo, no hay página ni enlaces.
- `contenido/tablon.json`:
  - con autorización: `node scripts/tablon.mjs`;
  - para la maqueta: guarda su `/board` una vez a mano y ejecuta `node scripts/tablon.mjs --desde copia.html`.
  - Después, rellena `titulo_claro` en cada anuncio.
  - Las sedes de Gestiona tienen `robots.txt` que prohíbe `/board` a los robots, así que **la lectura automática solo se activa con la autorización del Ayuntamiento** (`"tablon_autorizado": true`).
  - Algunas sedes (Zafra) tienen el certificado sin el intermedio y el `fetch` de Node falla. Apúntalo.
  - **Sede de la Diputación:** el tablón va por subsecciones y no tiene RSS ni JSON público.
    - El lector usa la vista antigua, `/portal/tablonVirtual.do?subseccion=<COD>&opc_id=175&pes_cod=9&ent_id=N`, que llega pintada desde el servidor, y la recorre subsección a subsección (una página por segundo).
    - Para la maqueta, `--desde` admite una carpeta con las copias: HTML de la vista antigua o el JSON de la nueva (`POST /sede/tablonElectronico.do`).
    - Guarda **todo desde 2018**. La web enseña los `tablon_max` más recientes (40 por defecto, en `municipio.json`) y cuenta las exclusiones de ese periodo.
    - La categoría es la subsección. En «Empleo Público» caen las listas y las actas de selección, y las actas de Junta de Gobierno o de Pleno que no digan «disociado» se quedan fuera.

## 7 bis. Lo que la web da sin que nadie haga nada (v3b · servicio)

`aplicar.mjs` escribe además, sin datos nuevos (todo sale de lo que ya hay):

| Archivo | Qué es |
|---|---|
| `feed.xml` | Avisos y noticias en Atom, para un lector de noticias. Lo de `ejemplo` lleva «EJEMPLO:» delante |
| `agenda.ics` | **Toda** la agenda (también fiestas y plenos) en un solo calendario, con el mismo generador que los `ics/<id>.ics` (mismos UID). Con `url`, la página `suscribirse.html` («Avisos y agenda en su móvil») da el enlace `webcal://` para suscribirse |
| `sw.js` | El listín sin cobertura: precarga `telefonos.html` con su CSS, JS, letras y escudo y lo sirve red primero, con lo guardado de respaldo, solo en esas rutas. La caché lleva la huella del build. Se registra desde todas las páginas; si el navegador no tiene service worker, nada cambia |
| JSON-LD | En el `<head>`: `GovernmentOrganization` (portada, El Ayuntamiento, contacto, agenda y noticias; el horario solo si no es de ejemplo), un `Event` por acto, `NewsArticle` en cada noticia y `BreadcrumbList` en las interiores. Lo marcado `ejemplo` no entra |
| `assets/propuesta-portada.jpg` | La portada nueva para el comparador de `propuesta.html` (no se escribe con `--sin-og`) |

Para publicar desde el móvil con un Formulario de Google, ver **[PUBLICAR.md](PUBLICAR.md)** y `node scripts/comprobar-hoja.mjs <exportación.csv>`.

## 7 ter. La web se actualiza sola (v3c · automatico)

Nadie tiene que ejecutar `aplicar.mjs` a mano para que lo publicado salga en todas partes:

- **La tarea diaria** (`.github/workflows/actualizar.yml`, GitHub Actions): a las 7:23 y a las 15:23 en verano (6:23 y 14:23 en invierno) ejecuta `node scripts/tablon.mjs` (solo lee la sede con `tablon_autorizado`), lee la hoja y `node scripts/aplicar.mjs --sin-capturas`, y sube la web si hay algo nuevo, una vez al día aunque no lo haya y siempre que se lance a mano. Sin secretos ni paquetes. Cómo se activa en el repositorio del Ayuntamiento, cómo se ve si ha fallado y cómo se lanza a mano: **PUBLICAR.md, «La tarea diaria»**. En un reskin no hay que tocarla: va en la carpeta y vale para cualquier municipio.
- **La hoja también al montar** (`scripts/lib/hoja.mjs`): con `hoja.id`, `aplicar.mjs` lee las pestañas `avisos`, `agenda` y `noticias` de `hoja.pestanas` (por `gviz`, como el navegador) y las fusiona con `contenido/*.json` antes de pintar (la hoja manda por `id`; `estado` oculto o borrador oculta). Así lo de la hoja sale también en `feed.xml`, `agenda.ics`, los `ics/<id>.ics`, la lista de `avisos.html`, y cada noticia de la hoja tiene su `noticia-<id>.html` (el cuerpo es la columna `texto`, un párrafo por línea; la foto no viene de la hoja). Leer, sanear y fusionar es el mismo código en los dos lados (`js/vivo.js → filasHoja, sanearHoja, fusionarHoja`). Lo que no se puede enseñar (sin título, una fecha que no existe) se queda fuera y lo dudoso se corrige (una gravedad mal escrita pasa a informativo; una hora o un enlace raros se quitan), con un aviso al montar: **la hoja nunca para el montaje**. La pestaña `farmacias` sigue leyéndose solo en el navegador.
- **`contenido/hoja.json`** (generado, se sube): lo último bueno de la hoja, ya saneado (solo las columnas que lee la web; lo oculto o en borrador, solo su `id`). Si la hoja no contesta, da error o no está publicada, esa pestaña sale de aquí. Solo se reescribe cuando lo de la hoja cambia (`cambiada` dice cuándo). Es de **una** hoja (`id`): al copiar la plantilla para otro pueblo, bórralo (con otro `hoja.id` se ignora igualmente). Sin `hoja.id`, no se lee nada ni se escribe este archivo.
- `scripts/tablon.mjs` ya no reescribe `contenido/tablon.json` si el tablón no ha cambiado (ni la hora de `actualizado`): un cambio en `contenido/` quiere decir «hay algo nuevo».
- **«Web actualizada el …»** en el pie de todas las páginas (sin JavaScript): la fecha y la hora del montaje, en hora peninsular. No cuenta para la huella de `sw.js`.
- **«Avisos del Ayuntamiento»** (`avisos.html`) la pinta `js/vivo.js` (bloque `avisos`): al montar, y en el navegador con lo que llegue de la hoja, con su texto, su enlace y su ancla `#aviso-<id>`. Sin ningún aviso, la sección no sale.

Opciones de `aplicar.mjs` para esto: `--sin-capturas` (no hace `assets/og.jpg` ni `assets/propuesta-portada.jpg`, se quedan las que hay: no pide Chromium), `--sin-hoja` (no pide la hoja: solo `contenido/hoja.json`) y `--hoja-url <base>` (otra dirección en vez de `docs.google.com`, para las pruebas).

### «Publicar en la web» (v3c · guia)

- `publicar.html` es la página del personal del Ayuntamiento: los botones a los formularios (`hoja.formularios`), qué sale dónde con muestras pintadas por `js/publicar.js` con las piezas de `vivo.js`, el simulador «Pruébelo» (no envía nada), cómo corregir y retirar, el buen título, lo que no se publica y lo que se le pide a quien mantiene la web. Impresa (`css/imprimir.css`) es una hoja A4 para la mesa.
- Se genera siempre (también sin hoja y con `"propuesta": false`), lleva `noindex` **siempre** (`noindex: true` en `PAGINAS`, aunque `indexar` sea `true`), no está en el menú y la enlaza el pie: «Personal del Ayuntamiento: publicar».
- Para montar la hoja y los formularios de un clic: `plantillas-hoja/crear-hoja.gs` (PUBLICAR.md, «El camino corto»). Lo que se le dice al Ayuntamiento: `RESPUESTA-CLIENTE.md`.

## 8. Aplicar y verificar

```bash
node scripts/aplicar.mjs                    # se niega si falta algo, si hay un [PENDIENTE] o si falla un contraste
node scripts/verificar.mjs --capturas       # todo, y mira screenshots/
node scripts/servir.mjs                     # http://127.0.0.1:4192/?revision
```

Mira las capturas, sobre todo estas:
- `primera-pantalla-375x667.png`: el buscador de trámites y «Hacer un trámite» se ven sin bajar (lo mide también la verificación);
- la portada en las dos densidades;
- el listín;
- el pie.

## 9. Antes de entregar

1. En la reunión, con `?revision`, eligen versión y color.
2. Fija lo elegido:
   - `"densidad": "sobria"` en `marca/marca.json` si es la sobria;
   - `node scripts/aplicar.mjs --fijar-paleta b` (o `c`) si es otro color.
3. Quita el mando: `python scripts/quitar_mandos.py --comprobar` y después `python scripts/quitar_mandos.py`.
4. Pon `"propuesta": false` y `"indexar": true` en `municipio.json` **solo** cuando sea la web oficial en su dominio.
   - Quita lo que es solo de muestra en `contenido/`: los avisos con `"ejemplo": true` que no sean del Ayuntamiento (en Ribera, `empleo-ejemplo` de `avisos.json`, la oferta de empleo de muestra). Los huecos «Pendiente» de `transparencia.html` ya no salen solos con `"propuesta": false`; rellénalos cuando se sepa.
5. Ejecuta `node scripts/aplicar.mjs` y `node scripts/verificar.mjs`.

---

## Qué NO se cambia en un reskin

- La estructura de páginas y secciones.
- El arco, la cortina y la densidad.
- La accesibilidad, el aviso de cookies, el mapa bajo clic, el menú y la 404.
- Los textos fijos («¿Qué necesita hacer?», «Lo que viene y lo que pasó»…).
- Lo que sale solo de los datos: el índice A–Z de «Todos los trámites» (las letras sin trámites, apagadas), el índice «En esta página» de las páginas con 4 o más secciones (`SIN_INDICE` en `aplicar.mjs` dice cuáles no lo llevan), el calendario del mes de la agenda y la fecha en arco de las noticias sin foto.

## Cuándo deja de ser reskin

Avisa antes, porque son horas y no minutos:
- Quieren otra estructura: sede propia, cita previa con agenda, área de usuario o blog.
- El municipio tiene **pedanías** con servicios propios.
- Necesitan otro idioma, aparte del castellano, en algo más que «El pueblo» (§6 quater).
- El escudo solo existe en una foto mala: hay que redibujarlo (o pedirles el vectorial) antes de sacar colores.
