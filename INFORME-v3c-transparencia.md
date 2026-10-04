# Informe · rama `v3c-transparencia` (transparencia, empleo público y «Escríbanos»)

4 de octubre de 2026. Parte de `v3` (16c5409, 157 de 157). Tres mejoras, cada una en su commit, y un cuarto con las pruebas y la documentación. Los archivos generados por `aplicar.mjs` (también `transparencia.html` y `escribanos.html`) no se suben: al unir, `node scripts/aplicar.mjs`.

**Resultado: `node scripts/verificar.mjs` → ✓ 163 de 163 comprobaciones** en 828 s (tras los ajustes de la revisión; antes, también 163 de 163 en 1015 s): las 157 de antes (una ajustada, ver «Cambiadas») y las 6 nuevas de `v3cTransparencia`. Una primera pasada completa dio 161 de 163: la de la tira «Hoy» (ver abajo) y la de los filtros del tablón con View Transition («Agua» con la transición aún en curso a los 500 ms), que pasó 4 veces seguidas sola y en la segunda pasada completa; la achaco a la carga de la máquina con las otras ramas verificando a la vez. Si vuelve a fallar al unir, mírala.

## Qué se hizo

### F22 · `transparencia.html` «Transparencia»
- Página nueva, **siempre generada** (también sin portal propio), con el pictograma de un documento con lupa. Enlazada desde el **pie** («Enlaces útiles → Transparencia», que antes iba directo al portal de la sede) y desde la **franja de la sede** de todas las páginas (antes solo salía si la sede tenía portal). En el menú, no.
- Ordenada como la ley, con un `h2` por bloque (sale sola el índice «En esta página»):
  1. «Qué tiene que publicar el Ayuntamiento» (art. 5 de la Ley 19/2013) y el botón al portal de transparencia; sin portal, lo dice y manda a pedirlo.
  2. **Información institucional y organizativa**: «Quién es quién y qué hace» (art. 6 Ley 19/2013; art. 5 Ley 4/2013).
  3. **Información de relevancia jurídica**: «Ordenanzas y normas» (art. 7).
  4. **Información económica y presupuestaria**: presupuestos (8.1.d; art. 14 Ley 4/2013), cuentas del año (8.1.e), contratos (8.1.a), convenios (8.1.b), subvenciones y ayudas (8.1.c) y sueldos de los cargos y bienes de los concejales (8.1.f y h).
  5. **«Si no lo encuentra, pídalo»** (derecho de acceso): quién puede, qué poner, que no hay que explicar para qué, un mes para contestar (ampliable otro), silencio = denegada, reclamar en un mes (arts. 12, 17, 20 y 24 Ley 19/2013; art. 15 Ley 4/2013). Botón a la **solicitud de acceso del catálogo de la sede** («Solicitud de Acceso a la Información Pública por los Ciudadanos»; si un municipio no la tiene, la instancia general).
  6. «Las leyes»: las dos, con su enlace al texto consolidado del BOE.
- Cada apartado: una frase de qué es, **dónde está** (enlaces), el hueco «Pendiente: …» si lo dice el dato, y al pie el artículo que lo pide, enlazado al BOE con su ancla.
- **Artículos leídos en el BOE el 04/10/2026** (BOE-A-2013-12887 y BOE-A-2013-6050, User-Agent genérico del proyecto, `robots.txt` respetado). No se cita nada que no se haya leído. Dejé fuera a propósito los artículos 8, 10 y 11 de la Ley 4/2013 (contratos, convenios y subvenciones): hablan del portal y de la Administración autonómica y no está claro que obliguen a un ayuntamiento. Tampoco nombro el órgano de reclamación en Extremadura (no lo he comprobado): la página dice «puede reclamar».
- Lo que se enlaza **solo, sin datos** (real en cualquier municipio): el portal de la sede (Gestiona `/transparency`, o el de los datos), el perfil del contratante, «El Ayuntamiento» (y «Normativa y documentos» si hay `documentos`) y la solicitud de acceso. Un apartado sin enlace propio dice «Búsquelo en el portal…» o, sin portal, «puede pedirlo».

**Ribera** (`municipio.json → transparencia`, revisado el 04/10/2026; fuentes nuevas en DATOS.md §4):
| Apartado | Enlaces | Pendiente |
|---|---|---|
| Quién es quién | «El Ayuntamiento» (solo) | organigrama con perfil y trayectoria |
| Ordenanzas | la página de ordenanzas de su web actual; la lista de anuncios en el BOP de su web | — |
| Presupuestos | aprobación definitiva del presupuesto de 2026 (BOP 05/02/2026, 344/2026) | la ejecución |
| Cuentas | exposición pública de la cuenta general de 2025 (BOP 24/08/2026, 3352/2026) | las cuentas aprobadas y los informes de control |
| Contratos | perfil en la sede (2 expedientes) y en la Plataforma (solo) | los contratos menores |
| Convenios | — (portal) | dónde se publican |
| Subvenciones | bases de 2026 a asociaciones (BOP 16/07/2026, 2828/2026) | las concedidas, con importe y beneficiario |
| Sueldos y bienes | — (portal) | lo que cobra cada cargo y las declaraciones de bienes |
| Pedir información | la solicitud de acceso del catálogo (solo) | — |

**Pista para «Sueldos y bienes»**: el anuncio del BOP del 07/10/2025 sobre la dedicación parcial del 2.º teniente de alcalde (<https://www.dip-badajoz.es/bop/ventana_anuncio.php?id_anuncio=159296&FechaSolicitada=202510070000>, ya en DATOS.md). No lo he podido abrir, así que no sé si trae la cuantía: no se enlaza; si la trae, va en `transparencia.apartados.retribuciones.enlaces`.

Los huecos «Pendiente» **solo salen en la maqueta** (dentro de la sección `propuesta`, como la banda): con `"propuesta": false`, cada apartado se queda con su explicación y el enlace al portal (o a pedirlo).

Los anuncios del BOP **no se han abierto**: el `robots.txt` de dip-badajoz.es prohíbe `/bop`. Se enlazan tal como los enlaza la web del Ayuntamiento (`riberadelfresno.es/bop.php`, que sí se leyó), con su número y su título. Dentro del portal de la sede no he entrado (su `robots.txt` solo deja `/info`), así que no enlazo sus bloques uno a uno.

### F23 · Empleo público
- **Detección en el tablón** (`scripts/lib/tablon.mjs → motivoEmpleo`, lista documentada en el comentario): bolsa de trabajo/empleo; proceso selectivo, pruebas selectivas, selección de personal; concurso-oposición, oposiciones, turno libre, promoción interna; provisión o convocatoria de una plaza o puesto, puesto vacante; contratación laboral/temporal/de personal; plan o programa de empleo, empleo social, oferta de empleo; la subsección «Empleo Público» de la Diputación. Antes se quita lo que lo parece y no lo es: Centro Especial de Empleo, «empleados públicos», plazas de escuela infantil/aparcamiento/cursos, puestos del mercado. «Plaza», «oposición» o «contratación» sueltas no cuentan. El tema «Empleo» va ahora justo detrás de «Pleno». Lo corrige una persona con `tema` + `tema_manual` (como antes).
- `CASOS_EMPLEO`: 20 títulos, **13 reales** (BOP de Ribera, tablones de Ribera y Monesterio) y 7 trampas inventadas, marcadas como tales. La versión anterior del patrón (`/empleo|plaza|…/`) metía en «Empleo» el Centro Especial de Empleo y cualquier «Plaza de España».
- **Chip** «Empleo» con un maletín (`i-empleo`) y borde, en el tablón y en «Avisos». «Empleo público», «empleo»… se juntan en un solo filtro «Empleo».
- **Ficha «Empleo» en la tira «Hoy»**, al final, solo si hay alguna oferta con el **plazo abierto** (reutiliza `plazosAbiertos` y el chip de plazo de v3b): la que cierra antes, su enlace, «Hasta el …» y «Todo el empleo» / «Las N ofertas con plazo abierto», que abre `avisos.html?tema=Empleo#t-tablon-todo` con el filtro puesto (`js/main.js` lee `?tema=`). Sin ninguna, no sale.
- **Ribera no tiene nada de empleo** en sus datos (las dos entradas de empleo del tablón llevan nombres y están excluidas). Va un aviso de muestra en `contenido/avisos.json` (`empleo-ejemplo`, «Bolsa de trabajo de auxiliar de ayuda a domicilio…»), con `ejemplo` y `plazo_ejemplo` (hasta el 13/11/2026): sale con «Ejemplo» en todas partes. Es un aviso propio y no un anuncio del tablón porque un anuncio necesita un enlace a un documento de la sede y no hay ninguno real que poner (y `tablon.mjs` lo borraría al refrescar).

### F24 · «Escríbanos»
- **Página propia** `escribanos.html`, con migas en «Contacto» y enlazada desde «Contacto → Escribir al Ayuntamiento» (una ficha nueva «Una consulta o una sugerencia»). La elegí en vez de una sección de `contacto.html` porque el formulario cambia la página entera a «Su mensaje está listo», mueve el foco y necesita su sitio para el aviso del registro; así Contacto sigue siendo corta (dónde, cuándo, el mapa) y la URL se puede dar sola, igual que `incidencia.html`.
- Tipo (consulta, sugerencia, felicitación), asunto, mensaje y contacto opcional (nombre, teléfono, correo). Validación accesible, respaldo sin JavaScript (`form` mailto `text/plain` con `required`), «Su mensaje está listo» con el foco, «Copiar el texto», aviso si el mailto es largo y «Cambiar algo del mensaje». Asunto: «Sugerencia: <asunto>».
- Arriba, **«¿Una queja formal o una solicitud?»**: el correo no es un registro (sin justificante, fecha ni expediente); eso va por la sede o el registro del Ayuntamiento, con los enlaces a «Quejas y sugerencias» de la sede (si existe) y a la instancia general.
- **Reutilizado, no copiado**: lo común de los dos formularios (validación con resumen y `aria-invalid`, el mailto con CRLF, el paso a «listo», copiar) pasa a `js/formulario-correo.js`; `js/incidencia.js` lo usa y se queda solo con lo suyo, sin cambiar lo que hace (sus 4 pruebas siguen pasando). El marcado y el CSS son los de incidencias (`.incidencia__…`); solo es nuevo el aviso del registro.
- Va al correo de `contacto.correo`; `escribanos: {correo}` lo cambia y `escribanos: false` la quita. Sin correo, ni página ni enlace.
- En «Contacto», la entradilla decía que las sugerencias van por la sede; ahora: «Las solicitudes y las quejas formales se presentan en la sede… Para una consulta o una sugerencia basta un correo.»

## Campos nuevos (opcionales, en RESKIN.md §3 y §7)
- `municipio.json → transparencia {revisada, portal: {url, nombre}, apartados: {<id>: {enlaces: [{texto, url, nota}], pendiente}}}` (y `_transparencia_leeme`). `aplicar.mjs` se niega con un apartado que no existe, un enlace sin texto o url, una url que no es https ni una página de la web, o un `portal` sin `nombre`.
- `municipio.json → escribanos` (`{correo}` o `false`).
- `contenido/avisos.json`: el aviso `empleo-ejemplo`.
- Generados: `transparencia.html`, `escribanos.html`.

## Pruebas
**Nuevas** (`async function v3cTransparencia()`, registrada como `['v3ctransparencia', v3cTransparencia]`), 6 comprobaciones:
1. F22, Ribera: los 9 apartados en orden; cada enlace es de la sede (con su patrón), su perfil del contratante, una página de esta web o uno de los enlaces de `municipio.json → transparencia`; los huecos «Pendiente» son exactamente los de los datos; cada apartado cita artículos del BOE con anclas conocidas; «Pedir información» lleva a la solicitud de acceso del catálogo; enlazada desde el pie y la franja de las 28 páginas y no desde el menú; sin desborde y axe 0 a 1280 y 390 px.
2. F22 en tres copias: sin `transparencia`, solo enlaces de la sede, el perfil y la web, sin «Pendiente» ni enlaces de Ribera, y el botón al portal; con una sede de la Diputación sin portal, lo dice y manda a pedirlo; y la web oficial (`"propuesta": false`), ni un «Pendiente» en el HTML ni visible en el navegador, y cada apartado con su explicación y su enlace.
3. F23 en Node: los 20 títulos de `CASOS_EMPLEO` (reales y trampas), una lista de admitidos de una bolsa sigue excluida antes del tema, y el tema manual se conserva al refrescar.
4. F23, la ficha «Empleo» en Node con fechas fijas: sale con oferta abierta (la que cierra antes, chip, enlace, «Las 2 ofertas…») y no sale con plazo cerrado, sin abrir, sin plazo ni con otro tema; «Ejemplo» si lo es; chip con maletín; «Empleo público» se junta con «Empleo».
5. F23 en el navegador con el reloj de Playwright: la muestra sale en «Hoy» con «Ejemplo» mientras su plazo está abierto y no después; «Todo el empleo» abre Avisos con el filtro puesto y solo filas de empleo; «Todos» vuelve; axe 0.
6. F24, como las de incidencias: respaldo sin JS, el aviso del registro con el enlace a la instancia, validación vacía (resumen con el foco, enlaces en orden, `aria-invalid`, error enlazado), teléfono mal escrito, mailto (destinatario, «Sugerencia: …» con `&`, `;` y `¿`, cuerpo con todos los campos, CRLF), «listo» con el foco, copiar, volver sin perder lo escrito, aviso de largo, axe 0, enlazada desde Contacto, y en copias con `escribanos: false` o sin `contacto.correo` (`--forzar`) no se genera ni se enlaza.

**Cambiadas**: `v3Pliegue` §4 (la tira «Hoy») esperaba exactamente 3 fichas más la farmacia; ahora espera además la ficha «Empleo» cuando hoy hay alguna oferta con el plazo abierto (lo calcula con `vivo.js` y los datos de la portada). No se ablanda: siguen las mismas comprobaciones de fila única en escritorio, 2 columnas en móvil con la impar a todo el ancho, iconos y sin huecos, ahora con 5 fichas. Las generales cuentan solas las dos páginas nuevas (axe, desborde, teclado, estructura, noindex, banda, «Ejemplo»: `contenidoEjemplo` ya espera `aviso:empleo-ejemplo` y `plazo:empleo-ejemplo` porque los lee de `avisos.json`). La de reskin a Segura de León pasa (Segura no tiene `transparencia`: sale la página general).

## Lo que no se pudo, y por qué
- **Abrir los anuncios del BOP y los bloques del portal de la sede**: los dos `robots.txt` lo prohíben. Se enlazan los anuncios como los enlaza la web del Ayuntamiento, y del portal solo la entrada.
- **Portal de la Diputación para pueblos sin portal**: no he comprobado que exista uno de la Diputación de Badajoz que publique la transparencia de los municipios; el campo `transparencia.portal` lo admite cuando se compruebe.
- **Ejecución del presupuesto, convenios, subvenciones concedidas, retribuciones, organigrama**: no he encontrado dónde los publica Ribera → huecos «Pendiente».
- La lista de ordenanzas de su web es de su web vieja: si la web nueva la sustituye, ese enlace morirá. Habría que pasar las ordenanzas a `documentos` (que ya sale en «El Ayuntamiento → Normativa y documentos» y se enlazaría solo).

## Posibles choques al unir
- **`js/vivo.js`** (bloques `v3c · transparencia`): el bloque de empleo justo antes de `ultimos()`; la llamada `filaEmpleo` al final de `hoy()`, tras «Último aviso»; `temaDe(...)` en las dos líneas de `ultimos()` que construyen el tema; `chipTema(f.tema)` en la fila de `tablon()`; una línea en `raiz.Vivo`.
- **`js/main.js`**: una línea en `montarTablon` (`?tema=`).
- **`js/incidencia.js`** reescrito sobre el nuevo **`js/formulario-correo.js`**; `fuente/incidencia.html` carga los dos. Si otra rama toca `incidencia.js`, unir a mano.
- **`scripts/aplicar.mjs`**: bloque «Escríbanos» antes de `mitadTemas`; bloque «transparencia» tras `privacidad`; `avisosOrden` (`es_empleo`); `pieEnlaces` (Transparencia → `transparencia.html`); dos entradas de `PAGINAS` antes de las noticias; `PICTO_DE`; la lista de páginas opcionales que se borran; `v.formulario_correo` y `v.escribanos`; `transparencia, escribanos` en `comun`.
- **`scripts/lib/tablon.mjs`**: la tabla `TEMAS` y `temaDe` sustituidas (con `motivoEmpleo` delante) y `CASOS_EMPLEO` al final. Si «automatico» toca `tablon.mjs`, mi cambio está solo en esas zonas.
- **`scripts/verificar.mjs`**: la importación de `node:url` (añade `pathToFileURL`), el bloque `v3cTransparencia` antes de «orden» y su línea detrás de `v3binteriores`.
- **`css/base.css`**: un bloque `v3c · transparencia` justo detrás de «fin v3b».
- **`fuente/_abajo.html`** (franja de la sede: Transparencia siempre y la nota), **`fuente/contacto.html`**, **`fuente/avisos.html`** (el chip), **`fuente/_iconos.html`** (`i-empleo`), **`fuente/_pictogramas.html`** (`p-transparencia`, `p-mensaje`).
- **`municipio.json`**: `_transparencia_leeme` y `transparencia` entre `incidencias` y `horizonte_agenda_dias`. **`contenido/avisos.json`**: el aviso de muestra. **`RESKIN.md`**: filas `escribanos` y `transparencia` antes de `tramites.todos` y un punto «Empleo» en §7. **`README.md`**: dos filas en el mapa de páginas. **`DATOS.md`**: dos filas en §4.

## Dudas para Álvaro
- ¿Vale que «Transparencia» del pie y de la franja lleve a nuestra página y no directamente al portal de la sede? La página tiene el botón al portal arriba del todo, pero es un clic más para quien ya sabe lo que busca.
- (Resuelto tras la revisión) Los huecos «Pendiente» solo en la maqueta; «Sueldos de los cargos» sin el BOP de la dedicación parcial (queda como pista, arriba); el aviso `empleo-ejemplo` se quita al pasar a la web oficial (RESKIN.md §9).
