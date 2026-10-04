# Informe · rama `v3c-automatico` (la web se mantiene viva sola)

4 de octubre de 2026. Parte de `v3` (16c5409, 157 de 157). Cuatro mejoras, en el orden del encargo; cada una en su commit. Los archivos generados por `aplicar.mjs` no se suben (al unir, `node scripts/aplicar.mjs`).

**Resultado: `node scripts/verificar.mjs` → ✓ 162 de 162 comprobaciones en 1058 s.** Las 157 de antes siguen pasando y se suman las 5 nuevas del bloque `v3cAutomatico`.

La promesa de «se mantiene viva sola» ahora es verdad: lo que la secretaría publica en el formulario sale en la web al abrirla (como antes) y, en la siguiente pasada de la tarea diaria, también en `feed.xml`, `agenda.ics`, el `.ics` de cada acto, la lista de `avisos.html` y la página propia de cada noticia. Nadie regenera nada a mano.

## Commits
1. `3a1ced3` v3c · F16: la lista de «Avisos» se pinta desde los datos vivos
2. `4899e8b` v3c · F15: la hoja de Google también al montar la web
3. `3283fc0` v3c · F17: «Web actualizada el …» en el pie
4. `e958855` v3c · F14: la web se actualiza sola dos veces al día (GitHub Actions), con la documentación de las cuatro (PUBLICAR, README, RESKIN)
5. las pruebas `v3cAutomatico` y este informe

(F16 va primero porque F15 se apoya en la lista viva; el orden de prioridad del encargo se respeta en el informe.)

## Qué se hizo

### F14 · La tarea diaria con GitHub Actions (`.github/workflows/actualizar.yml`)
- **Cuándo:** `cron: '23 5 * * *'` y `'23 13 * * *'` (UTC). En Madrid: 7:23 y 15:23 en verano, 6:23 y 14:23 en invierno: antes de abrir el Ayuntamiento y al cerrar. Minuto 23 para no caer en la hora en punto, cuando GitHub va cargado y retrasa. También a mano (`workflow_dispatch`). Explicado en el propio archivo.
- **Qué hace:** `actions/checkout` + `actions/setup-node` (Node 22) y nada más: **ni npm ni Chromium**. `node scripts/tablon.mjs` (sin `tablon_autorizado` no lee nada y sigue; si la sede cae, tampoco toca nada) → `node scripts/aplicar.mjs --sin-capturas` (lee la hoja, F15) → publicar.
- **Cuándo publica** (paso «Publicar si hay algo nuevo»): si cambió `contenido/` (tablón o hoja nuevos), si se lanzó a mano, si es la primera pasada del día (para que «Web actualizada el …», la agenda de hoy y lo que se ve sin JavaScript sean del día, y de paso GitHub no apague la tarea a los 60 días sin actividad) o si lo último del repositorio lo subió una persona (para que la web lo refleje). Si solo cambiaría la hora del pie y los sellos de los `.ics`, descarta lo regenerado y no sube nada. Commit de `github-actions[bot]`: «Web actualizada sola: <motivo>», con la hora y la lista de lo que cambió en `contenido/`.
- `permissions: contents: write` (y `pages: write`, ver dudas), `concurrency` con `cancel-in-progress: false` (si una tarda, la siguiente espera), `timeout-minutes: 15`, `TZ: Europe/Madrid`, sin secretos.
- **`aplicar.mjs --sin-capturas`**: no hace `assets/og.jpg` ni `assets/propuesta-portada.jpg` (se quedan las que hay). Es el `--sin-og` de siempre con un nombre que dice lo que hace; `--sin-og` sigue valiendo.
- **`tablon.mjs`** ya no reescribe `contenido/tablon.json` si el tablón no ha cambiado (comparado sin `actualizado`). Antes cada pasada autorizada cambiaba la hora y todo parecía «nuevo». Ahora `actualizado` dice cuándo cambió el tablón (el navegador lo sigue usando igual para refrescar).
- Documentado en **PUBLICAR.md, «La tarea diaria (para Álvaro)»**: cómo se activa en GitHub (Actions, permisos de escritura si da 403, Pages desde `master`, primera pasada a mano), cómo se ve si ha fallado (pestaña Actions, el correo de GitHub, qué suele fallar), cómo lanzarla a mano y cómo apagarla. Y en el README («Cómo se mantiene viva», el tablón) y RESKIN.md §7 ter.

### F15 · La hoja también al montar la web
- **`scripts/lib/hoja.mjs` → `leerHojaAlMontar`**: con `municipio.json → hoja.id`, pide por `gviz` las pestañas `avisos`, `agenda` y `noticias` de `hoja.pestanas` (corte a 15 s, User-Agent genérico del proyecto como `tablon.mjs`, sin cookies) y `aplicar.mjs` las fusiona con `contenido/*.json` **antes de pintar**. Sin `hoja.id`, devuelve `null` y no cambia nada (Ribera hoy).
- **El mismo código que el navegador, no una copia.** He movido la lectura a `js/vivo.js` (que ya corre en los dos lados): `filasHoja(txt)` (la normalización de `leerHoja`: columnas sin tildes ni mayúsculas con «_», `Date(…)`, celdas de solo hora, `TRUE`/«sí», `estado` oculto/borrador, el `id`), `sanearHoja(tipo, filas)` y `fusionarHoja(lista, filas, agenda)`. `js/main.js → leerHoja/cargarHoja` las usa; su `fusionar` propio desaparece.
- **Saneado (nuevo, en los dos lados):** la hoja la rellena la secretaría y **nunca puede parar el montaje**. Sin título o con una fecha que no existe → fuera; gravedad mal escrita → informativo; una hora rara, una `caduca`/plazo que no es fecha o un enlace que no es `http(s)://` → se quita; sin tema → «Otros» (una de las opciones del formulario). Cada cosa, un aviso al montar («hoja avisos, fila 6 (…): …», con la fila de la hoja). Antes, en el navegador, un `javascript:` en `enlace` o `convocatoria` llegaba tal cual a un `href`.
- **Fusión:** la hoja manda por `id` (como antes); una fila oculta **solo oculta lo que ya había** y no añade nada; en la agenda, el `.ics` escrito se conserva si el acto no ha cambiado (fecha, hora, título, lugar, nota, convocatoria) y si cambió o es nuevo se genera al pulsar, como antes.
- **El `id`** escrito a mano en la hoja se pasa a forma de dirección («Feria 2026» → `feria-2026`): sale en `noticia-<id>.html` y en las anclas. El que se inventa con la fecha y el título no cambia (los ya publicados siguen igual).
- **Noticias de la hoja:** pestaña `Noticias` con `fecha`, `titulo`, `resumen` y `texto` (un párrafo por línea de la celda; vale también `cuerpo`). Cada una tiene su `noticia-<id>.html`, sale en `noticias.html`, en el feed y en el JSON-LD. La foto no viene de la hoja (cada foto lleva autor y licencia en `media/creditos.json`).
- **`contenido/hoja.json`** (generado, **se sube**: es lo último bueno). Si una pestaña no contesta, da error, devuelve otra cosa (la página de entrar de Google cuando la hoja no está publicada) o un 500, sale de la copia; si no hay copia, esa pestaña no aporta nada y el montaje sigue. Solo se reescribe cuando cambia lo leído (`cambiada` = cuándo), y se guarda **ya saneado**: solo las columnas que lee la web (ni marca temporal ni correos si alguien publicara la pestaña de respuestas) y lo oculto o en borrador solo como `{id, oculto}`. La copia de otra hoja (otro `id`) se ignora.
- `aplicar.mjs --sin-hoja` (solo la copia, sin red) y `--hoja-url <base>` (otra dirección; lo usan las pruebas, con un servidor local que hace de Google).
- La pestaña `farmacias` sigue leyéndose solo en el navegador (no entra en ningún archivo generado).

### F16 · La lista de `avisos.html` desde los datos vivos
- `D.avisos` lleva ahora `texto` y `enlace`.
- Bloque nuevo `avisos` en `js/vivo.js` (`avisosLista`): pinta «Avisos del Ayuntamiento» igual que la plantilla de antes (mismas clases, `id="aviso-<id>"`, chips de gravedad, plazo, «Ejemplo», texto y «Más información»). Lo pinta `aplicar.mjs` al montar (el respaldo sin JavaScript, como hoy) y `main.js` lo repinta con lo que llegue de la hoja. El chip del plazo conserva su `data-vivo="plazo"`.
- `fuente/avisos.html`: la sección es siempre la misma y lleva `hidden` si no hay ningún aviso; `main.js` la enseña si llega uno de la hoja (como «Plazos abiertos»).
- **El ancla:** `avisos.html#aviso-<id>` de un aviso que llega de la hoja no existe al abrir la página. Cuando la hoja lo pinta, `main.js` baja a él una vez (`irAlAncla`).
- El `<p class="aviso__texto">` ya no sale vacío si el aviso no tiene texto.

### F17 · «Web actualizada el …» en el pie
- En `fuente/_abajo.html` (todas las páginas), bajo los créditos: «Web actualizada el `<time datetime="2026-10-04T07:23+02:00">`4 de octubre de 2026 a las 7:23`</time>`.», con la fecha y hora del montaje en hora peninsular (`--fecha` la fija en las pruebas). Sin JavaScript. Estilo de los créditos (`--apagado`, 15 px), en un bloque `v3c · automatico` de `css/base.css`.
- La línea no cuenta para la huella de `sw.js` (si no, el service worker se renovaría en cada pasada de la tarea).

## Campos y archivos nuevos
- **En `municipio.json`, nada nuevo**: se usa `hoja` (ya existía).
- `contenido/hoja.json`: generado, se sube, documentado en RESKIN.md §7 ter (y qué hacer al copiar la plantilla: borrarlo).
- `.github/workflows/actualizar.yml`, `scripts/lib/hoja.mjs`, `pruebas/hoja/gviz-avisos.txt`, `gviz-agenda.txt` y `gviz-noticias.txt` (respuestas `gviz` de muestra: todo lo visible lleva `Ejemplo = TRUE` y textos «de muestra»; el enlace es de `example.org`).
- Opciones de `aplicar.mjs`: `--sin-capturas`, `--sin-hoja`, `--hoja-url`.
- Documentación: PUBLICAR.md (sección nueva y el final de «Lo que hay que saber»), README.md («Cómo se mantiene viva», «La hoja de cálculo», el tablón), RESKIN.md (fila `hoja` de §3, «Añadir a mi calendario» de §7 y §7 ter nuevo).

## Pruebas
**Nuevas** (`async function v3cAutomatico()`, registrada como `['v3cautomatico', v3cAutomatico]`), 5 comprobaciones, ≈ 15 s:
1. **F14 · el YAML**, con un lector mínimo (sin librerías): sin tabuladores y sangría par; `name`, `on`, `permissions`, `concurrency` y `jobs` de primer nivel; dos `cron` válidos a dos horas distintas que caen entre las 6 y las 21 en Madrid en invierno y en verano; `workflow_dispatch`; `contents: write`; `concurrency` con `group` y sin cancelar; sin `secrets.` ni npm/Playwright; los `node scripts/*.mjs` existen y van en orden `tablon.mjs` → `aplicar.mjs --sin-capturas` → `git push`; `aplicar.mjs` conoce `--sin-capturas`.
2. **F14 · el paso «Publicar» de verdad:** se saca su `run:` del YAML y se ejecuta con bash (el de Git for Windows en Windows) en un repositorio de prueba con su remoto: solo cambia la hora del pie y ya se publicó hoy → no sube nada y deja el árbol limpio; cambia `contenido/` → commit «Web actualizada sola: avisos, agenda, noticias o tablón nuevos» con la lista y push; lo último es de hace dos días → «repaso del día»; lo último lo subió una persona → «cambios subidos a mano»; `workflow_dispatch` → «lanzada a mano»; sin cambios → nada.
3. **F15 · el lector en Node** con `pruebas/hoja/`: la normalización (columnas con tilde y espacios, `Date(…)`, la celda de solo hora, `estado`, el `id`); el saneado (2 visibles, 2 ocultos, 4 avisos; el enlace `javascript:`, la gravedad «urgentísimo» y la hora «8 de la tarde» fuera; fecha imposible y fila sin título fuera; lo oculto guarda solo su id); la fusión (oculta lo que había, no añade ocultos, el `.ics` se queda si el acto no cambia y se va si cambia la fecha); y `leerHojaAlMontar` contra un servidor local: sin `hoja.id` nada; contesta → copia escrita; otra vez igual → no la reescribe; cae, da 500 o contesta HTML → sale la copia, sin tocarla; sin copia y caída → vacío sin error; copia de otra hoja → se ignora; `--sin-hoja` no pide nada.
4. **F15 · montaje en una copia** con la hoja de muestra (`--fecha 2026-10-06T10:00`): el aviso con «Ejemplo», texto y enlace en `avisos.html` y en `feed.xml`; el ocultado fuera; ni borradores, ni filas malas, ni `javascript:` en nada; el acto en `agenda.ics` (su UID) y en `ics/acto-muestra-hoja.ics` (válido con `icsValido`, 19:00–21:30 de Madrid); la noticia con su `noticia-<id>.html` (h1, dos párrafos, «Ejemplo») y enlazada desde `noticias.html`; el sello «6 de octubre de 2026 a las 10:00». Otra vez con la hoja caída: todo igual desde `contenido/hoja.json`, sin tocarlo. Y `tablon.mjs --desde` dos veces: la segunda dice «sin cambios» y no toca el archivo.
5. **F16/F17 en el navegador:** sin JavaScript, la lista es la de `contenido/avisos.json` y el sello se ve; con la hoja simulada (`page.route` a `docs.google.com` con la muestra), abriendo `avisos.html#aviso-<id>`: el aviso de la hoja sale con su texto y «Ejemplo», la página baja a él, el ocultado se va, ningún `javascript:`, axe 0 y consola limpia; sin avisos propios la sección no sale (`hidden`, 0 px) y con la hoja aparece con los 2; el sello está en todas las páginas, igual en todas, con `datetime` válido y no del futuro.

Comprobé que fallan cuando deben: quitando la llamada a `irAlAncla`, la 5 falla.

**Cambiadas:** ninguna. La prueba de `v3bTablon` que busca el chip del plazo en «Avisos» (`.avisos [data-vivo="plazo"]`) sigue valiendo porque el chip conserva su `data-vivo`; y la de la hoja en `tablon()` pasa igual con el saneado.

## Lo que no se pudo (o no se probó)
- **GitHub de verdad.** El workflow no se ha ejecutado en GitHub (no hay que hacer `push` y no hay repositorio de prueba). Lo probado: la estructura y, ejecutado con bash, el paso que decide y publica. Sin probar: `actions/checkout`/`setup-node`, el permiso del token y que Pages publique tras el commit del bot.
- **Que Pages publique con el commit del token.** Hay documentación vieja que dice que un push con `GITHUB_TOKEN` no dispara la publicación de Pages (desde rama) y otra más nueva que dice que sí. Por si acaso, tras publicar se pide la publicación por la API (`POST /repos/{repo}/pages/builds`, permiso `pages: write`); si no la acepta, se escribe una línea y sigue. **Mirarlo en la primera pasada:** si la web no cambia tras un commit «Web actualizada sola», decírmelo.
- **Una hoja de Google real**: no la hay (Ribera tiene `hoja.id` vacío). Las respuestas `gviz` de muestra siguen el formato de Google (prefijo `/*O_o*/`, `setResponse`, `Date(…)`, columnas `timeofday`), pero el formato exacto de una hoja con formulario conviene mirarlo el día que haya una.

## Posibles choques al unir
- **`js/vivo.js`**: un bloque `v3c · automatico` justo antes de `var BLOQUES` (lista de avisos y las funciones de la hoja), `avisos: avisosLista` en `BLOQUES` y una línea en `raiz.Vivo`. Si otra rama añade bloques a `BLOQUES` o exporta algo, juntar las dos listas.
- **`js/main.js`**: dos líneas en `pintarVivo` (tras la de `plazos`), `leerHoja` reescrita (usa `Vivo.filasHoja`), `fusionar` borrada, el cuerpo de `cargarHoja` para `avisos/agenda/noticias` (la parte de `farmacias` sin tocar) y el bloque `irAlAncla` antes de «Añadir a mi calendario». **Si «guia» cambia la lectura de la hoja (nombres de columnas del formulario, por ejemplo), el sitio es ahora `filasHoja`/`sanearHoja` de `vivo.js`**, y vale para el navegador y para el montaje a la vez.
- **`scripts/aplicar.mjs`**: cabecera (3 opciones), un `import` y `desfase` en el de `servicio.mjs`, `SIN_OG`, el bloque de la hoja tras `const ahora`, `texto`/`enlace` en `D.avisos`, `avisos` en `vivo`, `actualizada` antes de `comun` (y su línea dentro) y la huella de `sw.js`.
- **`fuente/avisos.html`**: la sección «Avisos del Ayuntamiento» entera. **`fuente/_abajo.html`**: una línea tras `pie__creditos`. **`css/base.css`**: un bloque antes de `[MANDO DE MAQUETA] inicio`.
- **`scripts/tablon.mjs`**: el principio de `escribir`.
- **`scripts/verificar.mjs`**: el bloque antes de «orden» (con su ayudante `conDatosV3c`) y una línea en la lista.
- **`PUBLICAR.md`** (de «guia» también): el final de §5 (una frase) y el final de «Lo que hay que saber» (la viñeta del feed, una de noticias y la sección nueva «La tarea diaria»). **`README.md`**: «Cómo se mantiene viva» (dos filas cambiadas, una nueva), «La hoja de cálculo» (un párrafo) y el tablón. **`RESKIN.md`**: la fila `hoja`, una frase de §7 y §7 ter nuevo.
- `pruebas/hoja/`: tres archivos nuevos junto al `avisos-roto.csv` de antes.
- Si «guia» añade `hoja.formularios` a `municipio.json`, no choca: `leerHojaAlMontar` solo mira `id` y `pestanas`.

## Dudas para Álvaro
- **La plantilla también tiene la tarea.** Al unir, el repositorio de la plantilla (`plantilla-ayuntamiento-puerta-abierta-v3`) llevará el workflow y, si Actions está activo, hará un commit «repaso del día» cada mañana (Ribera no tiene hoja ni tablón autorizado). Es bueno para la demo («Web actualizada el …» siempre de hoy), pero si trabajas a mano en ese repo tendrás que hacer `git pull --rebase` antes de subir. Si no lo quieres ahí: Actions → «Actualizar la web» → Disable workflow.
- **Las horas**: 7:23 y 15:23 (verano). Si el Ayuntamiento publica mucho por la tarde, se puede añadir una tercera (`23 18 * * *`, 20:23).
- **«Sin tema» → «Otros»**: en el navegador, antes, un aviso sin tema salía con el chip vacío y un filtro sin nombre. «Otros» es una de las opciones del formulario de PUBLICAR.md; si «guia» la cambia, cambiar también `sanearHoja`.
- **El commit diario**: publica cada mañana aunque no haya nada nuevo (para el sello y la agenda del día). Si prefieres que solo publique cuando hay datos nuevos, basta quitar la condición del «repaso del día» del YAML; entonces el sello diría la fecha del último cambio real (y en 60 días sin cambios GitHub apagaría la tarea).
