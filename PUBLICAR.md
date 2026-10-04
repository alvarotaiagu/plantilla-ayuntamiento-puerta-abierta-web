# Publicar desde el móvil: Formulario de Google → Hoja → web

Para que la secretaría (o quien el Ayuntamiento diga) publique **un aviso, un acto de la agenda o una noticia desde el móvil**, sin entrar en ningún programa ni tocar la web. Se monta una vez y después publicar es rellenar un formulario. Lo que ve quien publica está en **`publicar.html`** («Publicar en la web», enlazada abajo en el pie: «Personal del Ayuntamiento: publicar»): los botones a los formularios, qué sale dónde, un simulador y cómo corregir. Impresa, es la hoja para la mesa.

```
 «Publicar un aviso»    ─┐                            ┌─ pestaña «Avisos»    (publicada) ─┐
 «Publicar un acto»     ─┼─► hoja «Web del Ayto.»  ───┼─ pestaña «Agenda»    (publicada) ─┼─► la web la lee al abrirse
 «Publicar una noticia» ─┘   (respuestas, privadas)   └─ pestaña «Noticias»  (publicada) ─┘   y al montarse
```

La web ya sabe leer la hoja (README, «La hoja de cálculo»; `js/main.js → leerHoja`): primero pinta lo que trae la página y luego **fusiona** lo de la hoja. Si la hoja no contesta en 7 segundos, se queda lo de la página. Lo que se publica sale en la portada (panel «Hoy», tablón, «Lo que viene», «Lo que pasó»), en la agenda y, si es un aviso urgente o programado con fecha de fin, en la franja de arriba de todas las páginas.

---

## El camino corto: `plantillas-hoja/crear-hoja.gs` (unos diez minutos)

Un Google Apps Script que lo crea todo de una vez: la hoja «Web del Ayuntamiento», los tres formularios con las preguntas que lee la web, la pestaña privada **«Personas autorizadas»**, las pestañas de respuestas (con «Estado» y «Autorizada») y las tres pestañas que se publican, con su `QUERY` (solo las filas autorizadas y solo las columnas de la web: ni la marca temporal ni el correo). Lo pone todo en una carpeta «Web del Ayuntamiento» de su Drive.

**Quién publica (v3c · F18 bis).** Solo las personas de «Personas autorizadas». Los formularios recogen el correo de la cuenta de Google con la que se entra; en cada pestaña de respuestas, la columna «Autorizada» dice «sí» si ese correo está en la lista, y las pestañas publicadas solo copian las filas con «sí». Lo que mande cualquier otra persona (aunque tenga el enlace del formulario) se queda en las respuestas, privado, y no llega nunca a la web. No hace falta Google Workspace: vale con cuentas de Gmail. El script crea la lista con el correo de quien lo ejecuta (la cuenta del Ayuntamiento); `OTRAS_PERSONAS`, arriba del script, añade más desde el principio.

> **No se ha podido ejecutar en Google al escribirlo** (no hay cuenta en este entorno). Está hecho con la API documentada de Apps Script y `verificar.mjs → v3cguia` lo ejecuta contra una imitación de esa API y comprueba que las preguntas se llaman como las columnas que lee la web. La primera vez de verdad, haga la comprobación del paso 3.

**1. Ejecutar el script** (con la cuenta de Google **del Ayuntamiento**: los formularios y la hoja quedan a su nombre).
1. Abra <https://script.google.com> → **Nuevo proyecto**. Borre lo que haya, pegue `plantillas-hoja/crear-hoja.gs` entero y guarde.
2. Arriba del todo puede cambiar `TEMAS` (los temas del tablón), `OTRAS_PERSONAS` (más correos de Google autorizados desde el principio, por ejemplo el de la secretaría) y `AVISAR_POR_CORREO` (de serie, `true`: un correo a la cuenta del Ayuntamiento con cada envío, con quién lo mandó).
3. En el desplegable de funciones elija **`crearHojaDeLaWeb`** → **Ejecutar**. Google pide permiso (Drive, Formularios, Hojas y, con el aviso por correo, enviar correo y activadores). Si sale «Google no ha verificado esta aplicación»: **Configuración avanzada → Ir a … (no seguro)**; el script es suyo.
4. Al acabar, el **Registro de ejecución** enseña el bloque para `municipio.json` (y queda escrito en la pestaña «Léame» de la hoja):
   ```json
   "hoja": { "id": "1AbC…xyz", "pestanas": { "avisos": "Avisos", "agenda": "Agenda", "noticias": "Noticias" },
             "formularios": { "avisos": "https://docs.google.com/forms/d/e/…/viewform", "agenda": "…", "noticias": "…" } }
   ```

**2. Dos pasos a mano (un script no puede).**

*A. El correo, «Verificado».* El script pide el correo con `setCollectEmail(true)`, que es lo único que deja fijar la API documentada de Apps Script (no hay forma de elegir el tipo de recogida, y `setRequireLogin` está obsoleto y solo vale dentro de un dominio de Workspace). En **cada uno de los tres formularios**: **Configuración → Respuestas → «Recopilar direcciones de correo electrónico» → «Verificado»**. Así hay que entrar con la cuenta de Google y el correo no se puede escribir a mano. **Si se queda en la opción en la que cada uno escribe su correo, cualquiera podría poner uno autorizado**: este paso no se puede saltar.

*B. Publicar las pestañas.* Abra la hoja (está en la carpeta «Web del Ayuntamiento»):
1. **Archivo → Compartir → Publicar en la web**.
2. Pestaña «Enlace». En el **primer desplegable** quite «Documento completo» y marque **solo** «Avisos», «Agenda» y «Noticias» (nunca «Léame», «Personas autorizadas» ni las «Respuestas …»).
3. En el segundo desplegable deje «Página web».
4. Despliegue **«Contenido publicado y configuración»** y marque **«Volver a publicar automáticamente cuando se hagan cambios»**.
5. **Publicar** → Aceptar. El enlace que sale no hace falta.
6. **No** toque «Compartir» (el botón verde): la hoja sigue en «Restringido».

**3. Comprobar** (dos minutos, en una ventana privada del navegador):
- `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?sheet=Avisos` **tiene que devolver datos** (un texto que empieza por `/*O_o*/`). Si pide entrar, falta el paso 2.
- `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?sheet=Respuestas%20avisos` **tiene que dar error o pedir acceso**. Si devuelve datos, se ha publicado de más (paso 2.2) o la hoja está compartida con «Cualquier persona con el enlace».
- Abra un formulario en la ventana privada: **tiene que pedir entrar con Google** (si no, falta el paso 2.A).
- Envíe un aviso de prueba con la cuenta del Ayuntamiento: sale en la pestaña «Avisos» («Autorizada» = sí en «Respuestas avisos»). Retírelo escribiendo `oculto` en su «Estado».
- Envíe otro con una cuenta de Google que **no** esté en la lista: se queda en «Respuestas avisos» con «Autorizada» = no y **no** aparece en «Avisos». Luego borre esa fila.

**4. Decírselo a la web:** pegue el bloque en `municipio.json → hoja` y `node scripts/aplicar.mjs`. Desde ese momento:
- la web lee la hoja cada vez que alguien la abre (lo nuevo sale en unos minutos);
- `publicar.html` enseña los tres botones a los formularios (sin `formularios`, cada botón dice «Se activa al montar la hoja (lo hace quien mantiene la web)»: no se inventan enlaces).

**5. Dárselo al Ayuntamiento:** la dirección de `publicar.html` (o el enlace del pie) a quien vaya a publicar, para que la guarde en la pantalla de inicio del móvil, y la página impresa para la mesa. En una demo sin hoja, el simulador «Pruébelo» de esa página enseña lo que pasaría (no envía nada).

**Añadir y quitar personas** (lo puede hacer el propio Ayuntamiento, o usted con su permiso): en la hoja, pestaña **«Personas autorizadas»**, un correo de Google por fila (columna A; la B es para apuntar quién es). Para añadir a alguien, su correo en una fila nueva: desde ese momento lo que mande sale en la web (y lo que ya hubiera mandado, también). Para quitarlo, se borra su fila: lo suyo deja de copiarse a las pestañas publicadas. Da igual mayúsculas o espacios de más. Tiene que ser la cuenta con la que esa persona entra en Google en el móvil (si usa dos, las dos).

**Lo que conviene saber de este camino:**
- **`publicar.html` no sale en buscadores ni en el menú y no es secreta**, pero ver los botones no basta para publicar: hace falta entrar con una cuenta de «Personas autorizadas». El correo de cada envío (`AVISAR_POR_CORREO`) dice además quién lo mandó.
- Lo publicado lo puede leer cualquiera en las pestañas publicadas, **también lo que se deja en `borrador`**: «borrador» no sale en la web, pero **no es privado**. Nada que no pueda ser público. (Lo de personas no autorizadas, en cambio, no pasa a las pestañas publicadas.)
- El correo de quien publica **no** se copia a las pestañas publicadas: solo está en las de respuestas y en «Personas autorizadas», que son privadas.
- No cambie los títulos de las preguntas ni su orden: son los nombres de las columnas y la `QUERY` los busca por su letra. Si hace falta, se borra todo y se vuelve a ejecutar el script.
- Tras enviar, el formulario ofrece «Editar su respuesta» (para una errata); un cambio de título hace que la web lo tome como otro aviso y quite el anterior.

---

## El camino manual (si no se puede usar el script)

Lo mismo, a mano: unos treinta minutos de clics. Al terminar, `hoja.formularios` (las direcciones de «Enviar → enlace» de cada formulario) va en `municipio.json` como en el paso 4 de arriba.

> **Para que solo publiquen las personas autorizadas (v3c · F18 bis), en el camino manual:**
> 1. Una pestaña **«Personas autorizadas»** con «Correo» en A1 y un correo de Google por fila desde A2. Nunca se publica.
> 2. En cada formulario, **«Recopilar direcciones de correo electrónico» → «Verificado»** (paso 2.4). En las respuestas aparece la columna «Dirección de correo electrónico» (normalmente la B: entonces las preguntas empiezan en la C).
> 3. En cada pestaña de respuestas, tras «Estado», una columna con esta fórmula en la fila 1 (cambie `B` por la letra de la columna del correo):
>    `={"Autorizada"; ARRAYFORMULA(IF(B2:B = ""; ""; IF(ISNUMBER(MATCH(LOWER(TRIM(B2:B)); LOWER(TRIM('Personas autorizadas'!A2:A)); 0)); "sí"; "no")))}`
>    (con la hoja en español, los argumentos de las funciones van separados con «;»).
> 4. En las `QUERY` del paso 4, sin la columna del correo y con el filtro: `… where <Título> is not null and <Autorizada> = 'sí'`.

## 1. La hoja

1. En Google Drive (con la cuenta del Ayuntamiento, no con una personal): **Nuevo → Hojas de cálculo**. Llámela «Web del Ayuntamiento».
2. Compartir: **Restringido** (solo las personas añadidas). *No* la comparta como «Cualquier persona con el enlace»: las respuestas originales no tienen que ser públicas.

## 2. El formulario de avisos

1. En la hoja: **Herramientas → Crear un formulario**. Se abre un formulario vinculado y aparece una pestaña «Respuestas de formulario 1». Renómbrela a **«Respuestas avisos»** (doble clic en la pestaña).
2. Título del formulario: «Publicar un aviso en la web».
3. Preguntas. **El título de cada pregunta es el nombre de la columna** y la web lo lee sin tildes ni mayúsculas, con «_» por los espacios («Título corto» → `titulo_corto`). Escríbalos así:

| Pregunta (título exacto) | Tipo en el formulario | Obligatoria | Qué es |
|---|---|---|---|
| `Fecha` | Fecha | sí | El día del aviso (el de publicación) |
| `Título` | Respuesta corta | sí | Lo que se lee en la portada. Claro y corto: «Corte de agua en la calle Mayor de 9:00 a 13:00» |
| `Tema` | Desplegable: Agua, Obras, Tráfico, Cultura, Deporte, Empleo, Salud, Otros | no | Para los filtros del tablón |
| `Texto` | Párrafo | no | Los detalles |
| `Gravedad` | Opción múltiple: `informativo`, `programado`, `urgente` | no | **urgente** = franja roja (una avería, una alerta); **programado** = franja ámbar (un corte anunciado); **informativo** = sin franja. Vacía = informativo |
| `Caduca` | Fecha | no | Último día que se enseña en la franja. **Sin esta fecha, un aviso urgente o programado no sale en la franja** |
| `Título corto` | Respuesta corta, validación «Longitud máxima: 70» | no | Solo si el título pasa de 70 caracteres: es lo que sale en la franja del móvil |

4. Configuración del formulario: **recopilar direcciones de correo electrónico: «Verificado»** (v3c · F18 bis: con eso se sabe si quien envía está autorizado; el correo no pasa a la pestaña publicada, ver el recuadro de arriba). Mensaje de confirmación: «Enviado. Si su cuenta está autorizada, saldrá en la web en unos minutos». Active **«Permitir editar después de enviar»** (para corregir una errata al momento).

*Captura descrita:* el formulario en el móvil tiene, de arriba abajo, un calendario para «Fecha», una línea para «Título», un desplegable «Tema», una caja grande «Texto», tres botones redondos «informativo / programado / urgente», otro calendario «Caduca» y una línea «Título corto». Abajo, el botón «Enviar».

## 3. El formulario de la agenda

Igual, desde la misma hoja (**Herramientas → Crear un formulario** otra vez). Renombre su pestaña a **«Respuestas agenda»**.

| Pregunta (título exacto) | Tipo | Obligatoria | Qué es |
|---|---|---|---|
| `Fecha` | Fecha | sí | El día del acto |
| `Hora` | Hora | no | Sin hora, el acto es de día entero |
| `Hora fin` | Hora | no | Para el calendario; sin ella, dura una hora |
| `Título` | Respuesta corta | sí | «Concierto de la banda municipal» |
| `Lugar` | Respuesta corta | no | «Plaza de España» |
| `Nota` | Párrafo | no | Entrada libre, cómo apuntarse… |
| `Tipo` | Desplegable: (vacío), `pleno` | no | Con «pleno» sale como «Próximo pleno» en la portada |
| `Convocatoria` | Respuesta corta (validación: URL) | no | Solo plenos: enlace a la convocatoria en la sede |
| `Grabación` | Respuesta corta (validación: URL) | no | Solo plenos: enlace al vídeo cuando ya se ha celebrado |

## 3 bis. El formulario de noticias (v3c)

Igual, otra vez desde la misma hoja. Renombre su pestaña a **«Respuestas noticias»**. Las fotos no van por el formulario (cada foto de la web lleva su autor y su licencia): se mandan a quien mantiene la web.

| Pregunta (título exacto) | Tipo | Obligatoria | Qué es |
|---|---|---|---|
| `Fecha` | Fecha | sí | El día de la noticia |
| `Título` | Respuesta corta | sí | Lo que ha pasado, en una línea |
| `Resumen` | Respuesta corta | no | Una frase que sale debajo del título en la portada |
| `Texto` | Párrafo | no | La noticia entera, un párrafo por línea |

Plantilla con las columnas: [`plantillas-hoja/noticias.csv`](plantillas-hoja/noticias.csv).

## 4. Las pestañas que se publican

Las respuestas tienen la «Marca temporal» y lo que se haya escrito tal cual. Se publica **otra** pestaña que copia solo las columnas que lee la web:

1. Pestaña nueva **«Avisos»**. En la celda A1:
   ```
   =QUERY('Respuestas avisos'!A:Z; "select C, D, E, F, G, H, I, J where D is not null and K = 'sí'"; 1)
   ```
   (A es la marca temporal y B el correo: no se copian. C…I son Fecha, Título, Tema, Texto, Gravedad, Caduca y Título corto, en el orden del formulario; J es «Estado», ver abajo, y K «Autorizada», la del recuadro de arriba. Si cambia el orden de las preguntas, cambie las letras.)
2. Pestaña nueva **«Agenda»**, igual con `'Respuestas agenda'!A:Z` y sus columnas; y **«Noticias»** con `'Respuestas noticias'!A:Z` (C…F y la de «Estado», con el mismo filtro de «Autorizada»).
3. **Estado (para retirar algo sin borrarlo):** en cada pestaña de respuestas, escriba a mano «Estado» en la primera celda libre de la fila 1. Para quitar un aviso de la web, ponga `oculto` en su fila; para guardarlo sin publicar, `borrador` (que no sale en la web, pero **no es privado**: se lee en la pestaña publicada).
4. **Archivo → Compartir → Publicar en la web** → en «Enlace», elija **solo** las pestañas «Avisos», «Agenda» y «Noticias» (no «Documento entero», ni «Personas autorizadas») → Publicar. Marque «Volver a publicar automáticamente cuando se hagan cambios».
5. Copie el identificador de la hoja: es lo que hay entre `/d/` y `/edit` en la dirección (`https://docs.google.com/spreadsheets/d/`**`1AbC…xyz`**`/edit`).

*Captura descrita:* el diálogo «Publicar en la web» tiene dos desplegables: el de la izquierda dice «Avisos, Agenda, Noticias» (marcadas con una casilla) y el de la derecha «Página web»; debajo, el botón verde «Publicar» y la casilla «Volver a publicar automáticamente».

## 5. Decírselo a la web

En `municipio.json`:

```json
"hoja": { "id": "1AbC…xyz", "pestanas": { "avisos": "Avisos", "agenda": "Agenda", "noticias": "Noticias" },
          "formularios": { "avisos": "https://docs.google.com/forms/d/e/…/viewform", "agenda": "…", "noticias": "…" } }
```

y `node scripts/aplicar.mjs`. Ya está: la web lee la hoja cada vez que alguien la abre, y la tarea diaria (ver «La tarea diaria», abajo) la mete también en el feed, la agenda para el móvil y las páginas de noticia.

**Compruebe que las respuestas no se ven:** abra en una ventana privada `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?sheet=Respuestas%20avisos`. Tiene que dar error o pedir acceso. Si devuelve datos, la hoja está compartida de más (paso 1.2).

## 6. Antes de dar por buena la hoja (y cuando algo no salga)

Descargue cada pestaña publicada: **Archivo → Descargar → Valores separados por comas (.csv)**, y:

```bash
node scripts/comprobar-hoja.mjs Avisos.csv
node scripts/comprobar-hoja.mjs Agenda.csv
```

Dice qué fila está mal y por qué (con el número de fila de la hoja): una fecha que no existe, un aviso sin título, una gravedad mal escrita, un aviso que caduca antes de empezar, dos filas iguales (la web enseñaría solo una), una hora mal escrita, un enlace que no empieza por `https://`… Sale con error (código 1) si hay algo que la web no enseñaría o enseñaría mal, y con avisos si solo hay cosas que conviene mirar (un urgente sin fecha de fin, un título largo sin «Título corto»).

Plantillas de ejemplo, con las columnas exactas: [`plantillas-hoja/avisos.csv`](plantillas-hoja/avisos.csv) y [`plantillas-hoja/agenda.csv`](plantillas-hoja/agenda.csv). Se pueden importar en una hoja (**Archivo → Importar**) para ver cómo queda.

### Las columnas que lee la web

| Pestaña | Obligatorias | Opcionales |
|---|---|---|
| Avisos | `fecha`, `titulo` | `id`, `tema`, `texto`, `gravedad` (urgente / programado / informativo), `caduca`, `titulo_corto`, `urgente` (de antes: sí/no), `enlace`, `estado` (oculto / borrador) |
| Agenda | `fecha`, `titulo` | `id`, `hora`, `hora_fin`, `lugar`, `nota`, `tipo` (pleno), `convocatoria`, `grabacion`, `estado` |
| Noticias (v3c) | `fecha`, `titulo` | `id`, `resumen`, `texto` (un párrafo por línea), `estado` |

Sin `id`, la web se lo inventa con la fecha y el título: si se corrige el título de un aviso ya publicado, es otro aviso (el viejo desaparece de la hoja, así que también de la web). La «Marca temporal» del formulario no se lee.

## Lo que hay que saber

- **Tarda unos minutos.** Google vuelve a publicar la hoja cada pocos minutos; la web la lee al abrirse.
- **Solo publican las personas autorizadas** (v3c · F18 bis): hay que entrar en el formulario con una cuenta de Google de la pestaña «Personas autorizadas». Lo que mande cualquier otra persona, aunque tenga el enlace, se queda en las respuestas y no sale en la web.
- **La hoja manda sobre lo que viene en la página** cuando un aviso tiene el mismo `id`.
- Lo publicado desde la hoja sale **al momento** en la portada, la franja, la agenda y la lista de «Avisos» (la web la lee al abrirse), y **en la siguiente pasada de la tarea diaria** (por la mañana o por la tarde) en `feed.xml`, `agenda.ics`, el `.ics` de cada acto y la página propia de cada noticia. Nadie tiene que regenerar nada.
- **Noticias desde la hoja:** pestaña `Noticias` con `fecha`, `titulo`, `resumen` y `texto` (un párrafo por línea de la celda); `estado` y `id` como en las otras. Cada noticia tiene su página (`noticia-<id>.html`) desde la siguiente pasada. La foto no se pone desde la hoja: cada foto de la web lleva autor y licencia.

## La tarea diaria (para Álvaro): la web se actualiza sola

`.github/workflows/actualizar.yml` es una tarea de **GitHub Actions** que mantiene la web al día sin que nadie ejecute nada. Dos veces al día (a las 7:23 y a las 15:23 en verano; a las 6:23 y a las 14:23 en invierno, porque GitHub cuenta en hora UTC):

1. `node scripts/tablon.mjs`: el tablón de la sede, **solo** con `"tablon_autorizado": true` en `municipio.json` (si la sede no responde, se queda el que había);
2. `node scripts/aplicar.mjs --sin-capturas`: lee la hoja (si no contesta, usa la última copia buena, `contenido/hoja.json`) y vuelve a montar la web. Sin Chromium: la imagen para compartir y la captura de «La propuesta» se quedan como están;
3. si hay algo que publicar, hace un commit en la rama de Pages («Web actualizada sola: …», con lo que ha cambiado) y lo sube. GitHub Pages lo publica en uno o dos minutos.

Publica cuando cambia algo en `contenido/` (anuncios del tablón o algo nuevo en la hoja), la primera vez de cada día aunque no haya nada nuevo (para que «Web actualizada el …» del pie y la agenda de hoy sean del día), después de que alguien suba cambios a mano y siempre que se lance a mano. Si solo cambiaría la hora del pie, no sube nada.

**Activarla** (una vez por repositorio; el de cada Ayuntamiento lleva ya el archivo):
1. En GitHub, el repositorio → **Settings → Actions → General**: «Allow all actions and reusable workflows» (o al menos las de GitHub: `actions/checkout` y `actions/setup-node`).
2. En la misma página, **Workflow permissions**: si la tarea falla al subir con un error 403, marque «Read and write permissions» y guarde. (El archivo ya pide `contents: write`, que normalmente basta.)
3. **Settings → Pages**: «Deploy from a branch», la rama `master` y la carpeta `/ (root)`, como hasta ahora.
4. Pestaña **Actions** → «Actualizar la web» → **Run workflow** para la primera pasada. Las siguientes van solas.

No hay secretos que configurar: usa el permiso que GitHub da a cada ejecución.

**Ver si ha fallado:** pestaña **Actions** del repositorio. Cada pasada sale con un círculo verde (bien) o una cruz roja (falló); al pulsarla se ve en qué paso y por qué. Si falla una pasada programada, GitHub manda un correo a la cuenta que hizo el último cambio en el archivo de la tarea. Lo normal cuando falla:
- `aplicar.mjs` se niega (un dato mal en `municipio.json` o en `contenido/*.json`, un `[PENDIENTE]`…): el mensaje dice qué. No se publica nada a medias; se arregla, se sube y se lanza a mano.
- Un problema de la hoja **no** hace fallar la tarea: lo que no se puede enseñar se queda fuera y se avisa en el paso «Montar la web» (abra el paso y busque «hoja»). Para revisar la hoja con calma, `node scripts/comprobar-hoja.mjs` (arriba, §6).
- Error 403 al subir: el permiso de escritura (paso 2 de «Activarla»).

**Lanzarla a mano** (por ejemplo, justo después de publicar algo importante en la hoja): **Actions → Actualizar la web → Run workflow → Run workflow**. Tarda un par de minutos.

**Apagarla:** **Actions → Actualizar la web → «⋯» → Disable workflow**. Ojo: en un repositorio público, si no hay ningún cambio en 60 días GitHub la apaga solo; como publica una vez al día, no debería pasar, pero si un día está apagada, se enciende ahí mismo («Enable workflow»).

Si alguien trabaja a mano en el mismo repositorio, la tarea puede haber subido algo entre medias: antes de subir, `git pull --rebase`. Si hay conflicto solo en archivos generados, se quedan los de cualquiera de los dos y se vuelve a montar.
