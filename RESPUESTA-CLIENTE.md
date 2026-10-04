# «¿Y cómo publicamos nosotros las cosas?» · la respuesta para el Ayuntamiento

Para Álvaro (v3c · guia). Lo de abajo es verdad con lo que hay en la plantilla tras la tanda v3c: los formularios y la hoja (`plantillas-hoja/crear-hoja.gs`, PUBLICAR.md), la página `publicar.html` y la actualización de la web dos veces al día (rama `automatico`, `.github/workflows/actualizar.yml`). Cambie `<la web>` por la dirección de la del pueblo.

Antes de mandarlo, mire las dos casillas del final.

---

## La respuesta corta (WhatsApp o correo)

> Publicar es rellenar un formulario desde el móvil. Tienen tres: uno para avisos, otro para los actos de la agenda y otro para noticias.
>
> Se pone la fecha, un título claro y, si hace falta, unas líneas, se pulsa «Enviar» y en unos minutos sale en la web. No hay que entrar en ningún programa: basta con la cuenta de Google del móvil. Solo publican las personas que el Ayuntamiento autorice.
>
> Si el aviso es urgente (una avería, una alerta), se marca así y sale en una franja roja arriba de todas las páginas hasta el día que ustedes digan.
>
> Para corregir o quitar algo, se cambia en una hoja de Google que es suya.
>
> Los formularios están en una página para su personal, con una guía que se imprime en una hoja para tener en la mesa. Puede probarlo ya, sin publicar nada: <la web>/publicar.html
>
> Los horarios, las personas, los trámites y las fotos me los mandan por WhatsApp o por correo y los cambio yo.

---

## La versión larga

### Lo que hacen ustedes solos, desde el móvil

- **Avisos.** Un corte de agua, una obra, una alerta, un plazo que se abre. Cada aviso es de una de tres clases:
  - **urgente** (una avería, una alerta): franja **roja** arriba en todas las páginas;
  - **programado** (un corte o una obra que se saben de antes): franja **ámbar**;
  - **informativo** (lo demás): en el tablón de avisos y en «Hoy» de la portada, sin franja.

  La franja se quita sola el último día que ustedes pongan.
- **Actos de la agenda.** Un concierto, una feria, una charla. Salen en la agenda con su día marcado, en «Lo que viene» y «Hoy» de la portada, y cualquiera se los puede añadir a su calendario. Un pleno se marca como pleno y sale como «Próximo pleno».
- **Noticias.** Lo que ha pasado, en unas líneas. Salen en «Lo que pasó» de la portada y en Noticias.
- **Corregir:** nada más enviar, el formulario ofrece «Editar su respuesta». Más tarde, se cambia la fila en la hoja de Google.
- **Retirar:** se escribe «oculto» en su fila de la hoja y deja de verse en unos minutos. No se borra nada.

**Cuánto tarda:** en la web, unos minutos (lo que tarda Google en pasar lo enviado a la hoja); se ve en cuanto alguien abre o recarga la página. En la lista de Noticias, en el calendario que los vecinos se llevan al móvil y en los avisos que reciben en su lector de noticias, en la siguiente actualización de la web, que se hace sola dos veces al día.

**Cómo se monta:** lo dejo yo montado con la cuenta de Google del Ayuntamiento, en un rato y con quien tenga su contraseña. Ustedes no instalan nada. Quien vaya a publicar guarda la página «Publicar en la web» en la pantalla de inicio del móvil.

### Lo que llega solo, sin que nadie haga nada

- Si el Ayuntamiento está **abierto ahora** o cerrado, con su horario.
- La **farmacia de guardia** de cada día, a partir del calendario de guardias que me pasen una vez al año.
- Las **fiestas de fecha fija**, cada año en la agenda.
- La fecha de hoy, el mes en curso y lo que viene, que se recalculan solos.
- El **tablón de anuncios de la sede electrónica**: la web lo enseña y, si el Ayuntamiento lo autoriza por escrito, lo copia solo cada día. Sin esa autorización, lo actualizo yo.

### Lo que se me pide a mí

Lo que no está en los formularios lo cambio yo. Mándenmelo por WhatsApp o por correo:
- los textos fijos: el horario, la presentación, las páginas del pueblo;
- los trámites nuevos o los que cambian en la sede;
- las personas: la corporación, quién se ocupa de qué, los teléfonos del listín;
- las fotos, con permiso de quien sale en ellas (las noticias de los formularios van sin foto);
- las fiestas, el calendario de farmacias o la recogida de enseres cuando cambien;
- cualquier cosa publicada que no sepan cómo arreglar.

### Lo que no va por aquí

- **Lo oficial, lo que tiene efectos** (edictos, bandos, convocatorias, licitaciones, listas de admitidos): al tablón de la sede electrónica, que es el que vale. En la web se puede contar con palabras sencillas en un aviso.
- **Datos personales**: ni nombres de vecinos, ni DNI, ni teléfonos particulares, ni listas de personas. Lo que se publica lo puede leer cualquiera.
- **En periodo electoral**, nada que presente logros del gobierno municipal (Ley Orgánica del Régimen Electoral General, artículo 50).

### Quién puede publicar

Solo publican las personas que el Ayuntamiento autorice. Para publicar hay que entrar en el formulario con una cuenta de Google que esté en la lista «Personas autorizadas» de su hoja; lo que mande cualquier otra persona, aunque tenga el enlace, se queda guardado en la hoja y no sale en la web. Vale con cuentas de Gmail normales.
- Para añadir a alguien, se escribe su correo de Google en esa lista; para quitarlo, se borra su línea. Lo pueden hacer ustedes mismos o pedírmelo.
- Además, cada envío manda un correo a la cuenta del Ayuntamiento con lo que se ha mandado y quién lo mandó.

---

## Antes de mandarlo, compruebe

- [ ] **La actualización de dos veces al día está encendida** en la web de ese pueblo (la tarea de GitHub de la rama `automatico`). Si no lo está, quite de «Cuánto tarda» la frase de la actualización y diga que eso lo hace usted al volver a montar la web.
- [ ] Si la hoja ya está montada: **los tres formularios piden entrar con Google** (correo «Verificado», PUBLICAR.md, paso 2.A). Sin eso, la frase «solo publican las personas que el Ayuntamiento autorice» no es verdad.
- [ ] **El simulador abre** en `<la web>/publicar.html`. Sin la hoja montada, los tres botones dicen «Se activa al montar la hoja»: es lo esperado en la demo.

Lo que no conviene prometer (no está hecho): que lo publicado vaya solo a Facebook, a Instagram o a una aplicación de avisos como Bandomóvil; fotos desde el formulario; que el tablón de la sede se copie solo sin su autorización por escrito.
