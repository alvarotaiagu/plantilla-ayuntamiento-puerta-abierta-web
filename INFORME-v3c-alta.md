# Informe · rama `v3c-alta` (el mapa del término de verdad y el alta de un municipio desde datos abiertos)

4 de octubre de 2026, en la máquina de Álvaro (con red). La rama parte de `v3` (16c5409). Resultado de la verificación completa: **`node scripts/verificar.mjs` → ✓ 159 de 159 comprobaciones** (las 157 de antes, menos la condicional de v3b que ya no aplica, y las 3 nuevas), en 911 s.

## Lo que hay que saber primero

1. **Segura de León es el 06124, no el 06125.** Lo dicen el INE (la serie del padrón lleva el código 06124) y Wikidata, y casa con su DIR3 (`L01061247` = L01 + 06124 + dígito de control 7). El 06125 es **Siruela**. Usagre sí es el 06136 (el 06134 es Trasierra).
2. **Wikidata no se consulta en wikidata.org.** El `robots.txt` de `query.wikidata.org` prohíbe `/sparql` a todos los robots, y el de `www.wikidata.org` prohíbe `/w/` (la API) y `/wiki/Special:` (EntityData). Se usa el SPARQL del espejo **QLever** de la Universidad de Friburgo (`qlever.cs.uni-freiburg.de/api/wikidata`, sin `robots.txt`). Cada dato enlaza a su elemento en wikidata.org para comprobarlo. Ver «Dudas».
3. **Overpass** (`overpass-api.de`) tiene en su `robots.txt` `Disallow: /api/`. `termino.mjs` y `plano.mjs` (v3b) ya lo usaban como API y el encargo pedía ejecutarlo: lo he mantenido, solo a través de `termino.mjs`. No he añadido consultas a Overpass fuera de él. Ver «Dudas».
4. **Node no valida el certificado de las sedes de Gestiona** (les falta el intermedio: «unable to verify the first certificate»). `nuevo-municipio.mjs` se relanza a sí mismo con `--use-system-ca` (Node 22.15 o más), que usa el almacén de Windows, que sí tiene el intermedio. Sin red (`--sin-red`, `--desde`) no hace falta.
5. Las sedes de la **Diputación** (`sede.monesterio.es`, 195.57.11.108) no responden desde esta red (se agota el tiempo; curl igual). La rama de la Diputación de `nuevo-municipio.mjs` (sede por el enlace de su web, `ent_id` si aparece) **no la he podido probar contra una sede real**. Los tres municipios probados tienen Gestiona.

## F25 · El mapa del término de Ribera, de verdad

- `node scripts/termino.mjs` contra OSM: **relation/344111** «Ribera del Fresno» (`ine:municipio` 06113), nodo del pueblo `node/252463065`, 2 áreas de casco, 23 tramos de carretera (BA-013, BA-121, BA-122, BA-131, EX-212, EX-334, EX-342), 0 rutas.
- **Lugares: 7 de 19**, sin ningún aviso. **No hubo ambigüedades**: OSM no tiene ninguna «Ermita del Cristo» a secas (solo «Ermita del Cristo de la Misericordia»), así que no hizo falta `--lugar`. He comprobado uno por uno en los datos de OSM que son ese lugar y que están dentro del término:

| Lugar | OSM | Por qué es ese |
|---|---|---|
| Iglesia de Nuestra Señora de Gracia | way/566210276 | mismo nombre, `place_of_worship` |
| Casa de Vargas-Zúñiga | way/566195236 | en OSM, «Casa de la Cultura "José Mª Vargas-Zúñiga"»: nuestra ficha dice que hoy es la Casa de la Cultura |
| Ermita del Cristo de la Misericordia | way/566195241 | mismo nombre |
| Ermita de la Aurora | way/566205161 | mismo nombre |
| Ermita de San Juan Macías | way/566200526 | mismo nombre, en el casco (la casa natal) |
| Palacio de Quintanilla | way/566195238 | mismo nombre, `historic=monument` |
| Pozo de San Juan Macías | node/5904426027 | a unos 4 km al sur, junto a «Valle Garzón» (nuestra ficha: «en la finca del Valle Garzón, a unos 4 km») |

  - **No puestos, a propósito**: el Pilar del Caño (en OSM solo hay un `place=locality` «Pilar Caño», a 1,4 km al oeste: es el paraje, no el pilar); el Oppidum de Hornachuelos (solo la «Dehesa de Hornachuelos», un paraje); la Ermita del Cristo Viejo, la de San Isidro, el lavadero de lanas y el resto no están en OSM con nombre.
- **Lo que se veía mal con datos reales**: seis de los siete puntos caen en medio kilómetro y, a la escala del término (26 m por unidad), los círculos quedaban uno encima de otro. Y en el móvil (320 px) los números y las matrículas salían a 5–7 px. Arreglo, en `termino.mjs` (sección «4 bis» y «5 bis»), sin tocar nada a mano:
  - **Recuadro del pueblo ampliado**: el grupo más grande de puntos que se pisan va a un recuadro (×5,5; 250 m de barra) con el término, el casco, las carreteras y **las calles** (consulta nueva: `highway=residential|unclassified|living_street|pedestrian` a menos de 2 km, solo para el recuadro). Va en el hueco del lienzo que menos término tapa (en Ribera, ninguno); en el mapa grande, un rectángulo marca la zona y una raya la une al recuadro.
  - **Círculos apartados**: si aún se pisan, el círculo se aparta lo justo, hacia fuera del grupo, y una raya fina lo une a un punto pequeño en su sitio exacto (`lugares[].sitio`).
  - **Móvil**: con la figura estrecha (`@container (max-width: 26rem)`) los círculos y las matrículas crecen ×1,6 sobre su centro y la escala sale a 22 unidades. El reparto ya se hace con ese tamaño, así que tampoco ahí se pisan (lo mide la prueba).
  - Leyenda nueva, en palabras: «Recuadro: el pueblo ampliado; su barra mide 250 m» y «Raya fina con un punto: el sitio exacto, cuando el número se ha apartado para que se lea» (también en inglés y portugués).
  - `aplicar.mjs` toma el radio de `termino.json → radio_punto` (antes lo deducía del `viewBox`; da lo mismo).
- Subidos: `marca/termino.svg` y `marca/termino.json` (datos, no generados por aplicar).
- Probado con datos reales de otro término (Segura, Usagre, Fuentes de León): sin puntos (sus borradores no tienen lugares), el mapa sale bien y sin recuadro.

## F26 · `scripts/nuevo-municipio.mjs`

```
node scripts/nuevo-municipio.mjs <código INE | "Nombre"> --salida <carpeta> [--sin-red | --desde <carpeta>] [--sin-mapa]
```

Escribe en `--salida` el borrador `municipio.json` (`"_borrador": true`, `_fuentes`: dato → fuente, url, fecha de consulta), `ALTA-<slug>.md`, el escudo (`marca/escudo.svg` y sus PNG con `escudo.mjs`), el mapa (`marca/termino.*` con `termino.mjs --raiz`) y `_respuestas/` (todo lo traído, para `--desde`). Se niega a escribir en la raíz de la plantilla o encima de un `municipio.json` que no sea un borrador suyo.

- **Fuentes y qué saca de cada una**:
  - INE (API JSON, tabla «<Provincia>: Población por municipios y sexo», que es la 2853 + código de provincia; se comprueba por el nombre): código, nombre oficial, provincia y padrón.
  - Wikidata (QLever): elemento por P772, altitud, superficie (con su unidad), gentilicio, CP, web, escudo, bandera, comarca (si P131 es una comarca), relación de OSM (P402), alcalde y redes (solo como pistas).
  - Commons: autor y licencia del escudo desde el marcado legible por máquina de su ficha (`fileinfotpl_aut` o, si no, `licensetpl_attr`); si hay varias licencias, la CC. El archivo, de upload.wikimedia.org.
  - Su web: el pie de las webs de la Diputación («Ayuntamiento de X · dirección · CP X (Badajoz) · Telf. · Fax · E-mail») y el enlace a su sede.
  - Su sede: en Gestiona, `/info.0` (lo único que deja su `robots.txt`; hace falta la cookie de la primera redirección): el título «Sede Electrónica de X» (un subdominio de nadie da «Indeterminada») y el correo y el teléfono de «¿Tienes algún problema?».
  - Calculado: slug, DIR3 (L01 + INE + dígito de control del INE; el algoritmo casa con los DIR3 comprobados de Ribera, Segura y Usagre), titular, `mapa_consulta`.
  - En Gestiona, `instancia_general` y `quejas` (uuid comunes) y los trámites del catálogo común de la plantilla (solo los que van por uuid: 111), **marcados por comprobar** en ALTA.
- **Contradicciones**: si dos fuentes dan cosas distintas del mismo dato (habitantes del mismo año, dirección o teléfono entre la web y la sede, CP entre la web y Wikidata), el dato queda `null` y las dos van a ALTA. Si Wikidata da habitantes de otro año, se pone la del INE y se dice.
- **ALTA-<slug>.md**: tabla de lo principal con su fuente; contradicciones; lo que falta por orden (contacto, horario, sede, NIF, escudo, colores, corporación, trámites, listín, fotos, pueblo, mapa, plano, lo opcional), con pistas; lo puesto que hay que mirar; las fuentes consultadas con su resultado; el siguiente paso.
- **Respeta `robots.txt`** (grupos por User-Agent, `*` y `$`, gana la regla más larga). Si el `robots.txt` no responde, no se lee nada de ese sitio, salvo `servicios.ine.es` (su `/robots.txt` corta la conexión; es la API pública del INE). User-Agent genérico del proyecto, sin datos de nadie.

### Comprobación real

**Segura de León (06124)** frente al reskin hecho a mano (`pruebas/segura-de-leon/`):
- **Acertó, igual que el reskin**: nombre, slug, provincia, gentilicio (segureños), habitantes (1.758, INE 1-1-2025), dirección (Plaza de España, 1), CP, teléfono, fax, correo, sede (Gestiona, base, instancia general y quejas), titular, DIR3, escudo (Mfarinias, CC BY-SA 4.0, misma ficha). La web y la sede dan el mismo teléfono y correo.
- **Distinto**: altitud 700 m (Wikidata) frente a 698 en el reskin; `nombre_corto` sale entero («Segura de León»; el reskin dice «Segura»); comarca `null` (Wikidata no la tiene; el reskin, Tentudía); 111 trámites comunes frente a los 12 comprobados del reskin.
- **Faltó**: horario, NIF, corporación, listín, perfil del contratante (en Segura está deshabilitado en la sede), fotos, «El pueblo».
- **Pista que habría engañado**: Wikidata da como alcalde a Lorenzo Molina Medina, sin fecha de fin; según los BOP (el reskin), la alcaldesa es Isabel María Garduño Carmona. Por eso va solo como pista.
- 0 contradicciones entre fuentes.

**Usagre (06136)** frente a su web hecha (`ayuntamiento-usagre-web/municipio.json`):
- **Acertó**: nombre, habitantes (1.698), altitud (566), CP, teléfono (924 585 011) y correo (de la sede), sede y sus uuid, DIR3 (`L01061361`), escudo (Erlenmeyer, CC BY-SA 4.0: su ficha no tiene autor legible y sale de la atribución de la licencia).
- **Faltó**: dirección y fax (su web no respondió), NIF (la pista `P0613600` + letra casa con el real, P0613600F), comarca (la de verdad: Campiña Sur), perfil del contratante.
- **Wikidata desfasado**: da `usagre.es` como web (no responde); la del Ayuntamiento es `ayuntamientodeusagre.com`. ALTA lo marca («puede que Wikidata tenga una dirección vieja»). Gentilicio «Usagreño» (singular y en mayúscula): ALTA pide pasarlo a «usagreños».
- 0 contradicciones (con una sola fuente para el contacto no puede haberlas).

**Fuentes de León (06055)**, que no teníamos, buscado **por nombre**: nombre, habitantes (2.118), altitud (741), gentilicio (fonteños), dirección (Plaza de España, 1), CP 06280, teléfono 924 724 311, fax 924 724 161, correo (la web y la sede coinciden), sede Gestiona, DIR3 `L01060554`, escudo (SanchoPanzaXXI, CC BY-SA 4.0), mapa del término (2 rutas). Faltó lo mismo que en Segura. 0 contradicciones. Su mapa del término pesa 61 kB: en OSM el casco está en 1.319 áreas `landuse=residential` pequeñas.

En los tres, ALTA pide 10–11 cosas por rellenar y 3–6 por comprobar. Los borradores no se suben: solo `pruebas/alta/06124/`, las respuestas de Segura recortadas a lo que lee el script (22 kB; sin Overpass). Con ellas, `--sin-red` da el mismo borrador que con red.

### `aplicar.mjs` y el borrador

- Con un `municipio.json` a medias, se para **antes** de tropezar con un `null`, y lista todos los obligatorios que faltan (los de siempre, y además `servicios` y `tramites.todos`, que RESKIN.md ya daba por obligatorios y sin los que se rompía con un `TypeError`). Si es un borrador, dice que la lista con pistas está en `ALTA-<slug>.md`. Ni con `--forzar`: sin eso no hay web que escribir.
- Mientras quede `"_borrador": true`, lo avisa (aviso, no error).
- Con el borrador de Segura completado solo en lo obligatorio (horario, NIF y listín), escribe la web entera; `corporacion`, `pueblo`, `fotos` y `cifras` a `null` no rompen nada.

## F27 · RESKIN.md

§0 nuevo al principio: «1. `nuevo-municipio.mjs` → 2. completar `ALTA-<slug>.md` → 3. `aplicar.mjs` → 4. `verificar.mjs`», qué da cada fuente y **lo que queda a mano** (horario, NIF, corporación, listín, fotos, «El pueblo», colores, plano, perfil, contenido y repasar lo marcado). §6 ter: el recuadro y `--raiz`. README: el resumen y el árbol.

## Archivos y campos nuevos

- `scripts/nuevo-municipio.mjs` (nuevo); `pruebas/alta/06124/` (respuestas recortadas).
- `scripts/termino.mjs`: recuadro, reparto de círculos, calles, `--raiz`. `marca/termino.json` gana `radio_punto`, `recuadro` y `lugares[].recuadro/sitio` (opcionales: la muestra sintética sale sin recuadro igual que antes).
- `scripts/aplicar.mjs`: `radio_punto`, `recuadro_texto`, `hay_guias` y dos claves de `T_ES` (`clave_recuadro`, `clave_guia`) en el bloque del término; el bloque `v3c · alta` tras los obligatorios.
- `fuente/pueblo.html`: dos filas de leyenda. `contenido/pueblo.en.json` y `.pt.json`: sus dos traducciones. `css/base.css`: bloque `v3c · F25` tras `.termino-punto:hover`.
- **En `municipio.json` no hay campos nuevos.** El borrador lleva `_borrador` y `_fuentes`, que `aplicar.mjs` ignora (salvo el aviso).

## Pruebas

- **Nuevas**: `v3cAlta()` (`['v3calta', v3cAlta]`), 3 comprobaciones:
  1. F25: `termino.json` es de Ribera (relation/344111, nombre, `data-termino`, atribución ODbL, sin restos de la muestra); los 7 lugares con el id comprobado a mano (lista fija en la prueba) y su sitio exacto dentro del contorno del propio SVG (llevado al mapa grande si está en el recuadro); en «El pueblo» a 1440 y 320 px, cada punto lleva a su ficha, salen el recuadro y su leyenda, ningún círculo pisa a otro ni a una matrícula (medido en pantalla), sin desborde, y a 320 px los círculos pasan de 18 px.
  2. F26: `--sin-red` con Segura (también por nombre): 18 campos iguales que el reskin hecho a mano, cada dato con fuente y fecha, `null` en horario/NIF/corporación/servicios/pueblo/fotos/comarca, ALTA en orden, el alcalde como pista; con los habitantes del mismo año en contra (respuesta alterada en una copia), no elige y lo dice; no escribe en la raíz ni encima de un `municipio.json` ajeno.
  3. F26: `aplicar.mjs` con el borrador tal cual sale con 1, lista horario, NIF y servicios y nombra ALTA, sin `TypeError`; completado, escribe la web de Segura.
- **Cambiadas**: ninguna. Una nota: con `marca/termino.*` de verdad, la comprobación condicional de v3b «sin `termino.svg` no sale la sección» ya no se ejecuta (era para cuando faltaba el mapa), así que `v3bpueblo` cuenta 5 en vez de 6. La de la muestra sintética sigue igual y pasa.
- `reskin` sigue pasando: `pruebas/alta/` no tiene `municipio.json` en su raíz, así que no la toma por otro municipio.

## Posibles choques al unir

- **`scripts/aplicar.mjs`**: (1) el bloque `v3c · alta` justo después de `if (!existe('css/fuentes.css'))…` (antes de `const TEL`); (2) en el bloque del término (`termino = {…}`), `radio`, `letra`, `recuadro_texto` y `hay_guias`; (3) `T_ES`, una línea tras `clave_puntos`. Si «automatico» o «transparencia» añaden obligatorios, que queden antes de mi bloque para que salgan en la misma lista.
- **`scripts/verificar.mjs`**: bloque antes de «orden» y una línea tras `v3binteriores`.
- **`RESKIN.md`**: §0 entero tras «Prueba real…» y dos viñetas al final de la lista de §6 ter. **`README.md`**: tres líneas (árbol y paso 1 del resumen).
- **`css/base.css`**: bloque tras `.termino-punto:hover circle`.
- **`fuente/pueblo.html`**, `contenido/pueblo.*.json`: solo la leyenda del mapa.
- Generados: al regenerar salen el mapa con recuadro en `pueblo*.html`.

## Dudas para Álvaro

1. **Wikidata por QLever**: es un espejo académico de Wikidata (se actualiza cada pocos días) y no tiene `robots.txt`; wikidata.org prohíbe a los robots `/sparql` y la API. ¿Te vale así, o prefieres que use la API de Wikidata (lo que Wikimedia recomienda para scripts, con su User-Agent) aunque el `robots.txt` diga que no?
2. **Overpass** tiene `Disallow: /api/` en su `robots.txt`, como ya pasaba con `termino.mjs` y `plano.mjs`. ¿Lo dejamos como API (que es para lo que está), o lo cambiamos?
3. **Trámites en Gestiona**: el borrador copia los 111 del catálogo común de la plantilla, marcados «por comprobar». Si prefieres que salga vacío y se rellene a mano, es una línea.
4. Las sedes de la Diputación no responden desde aquí: la rama de la Diputación está sin probar contra una sede real.
5. El alcalde de Wikidata estaba desfasado en Segura: lo he dejado como pista. ¿Lo quitamos del todo?
