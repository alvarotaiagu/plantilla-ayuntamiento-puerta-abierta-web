# Ayuntamiento de Ribera del Fresno: datos para la maqueta

Todo se comprobó el **2 de octubre de 2026**. Cada dato lleva su fuente. Lo que no se ha encontrado aparece como **[PENDIENTE]**. Los mismos datos, ordenados, están en `datos-ribera.json`.

Población: **3.130 habitantes** (INE 2025, dato del encargo). Otras fuentes dan cifras viejas: la ficha de la Diputación, 3.496 (censo de 2014), y todoslosayuntamientos.es, 3.193.

---

## 1. Identidad

| Dato | Valor | Fuente |
|---|---|---|
| Nombre | Ayuntamiento de Ribera del Fresno | sede electrónica, `/ownership` |
| INE / CP / NIF / DIR3 | 06113 / 06225 / P0611300E / L01061134 | sede; todoslosayuntamientos.es (NIF) |
| Gentilicio | ribereño, ribereña | Diputación (ficha) y Wikipedia |
| Comarca | Tierra de Barros | Diputación |
| Partido judicial | Villafranca de los Barros | Diputación |
| Mancomunidad | Mancomunidad Integral «Tierra de Barros – Río Matachel». La web escribe «Matrachel», con errata. Wikidata añade «Los Molinos», sin verificar | web, página «Programa Familia»; Wikidata Q1442520 |
| Altitud | 399 m | Diputación, Wikipedia |
| Superficie | 185,6 km² | Diputación, Wikidata |
| Distancia a Badajoz | 82 km según la Diputación, 83 km según Wikipedia y **107,6 km por carretera** según OSRM (85 min) | ver nota |
| Distancia a Mérida | **52,9 km por carretera** (OSRM, 49 min). No hay cifra oficial [PENDIENTE] | router.project-osrm.org |
| Pedanías | No consta ninguna. Wikidata solo registra el núcleo (06113000101). Falta comprobarlo en el Nomenclátor del INE [PENDIENTE] | Wikidata Q24009593 |
| Patrona / patrón | Virgen del Valle es la patrona. Como patrón, la web da el Stmo. Cristo de la Misericordia en «Historia» y llama «santo y patrón» a San Juan Macías en «Fiestas» | web: Historia y Fiestas; Diputación: Monumentos |

> Nota sobre las distancias: la Diputación y Wikipedia no dicen cómo miden. La ruta OSRM va desde el Ayuntamiento (38.5528, −6.2411) hasta el centro de cada ciudad.

### Escudo
- **Archivos**: `img/escudo.svg` es el SVG original de Commons; `img/escudo.png` es un render propio de 903×1600 con fondo transparente; `img/escudo-web-oficial.jpg` es la versión que usa la web municipal (1109×1524).
- **Commons**: <https://commons.wikimedia.org/wiki/File:Escudo_de_Ribera_del_Fresno.svg>. Autor: SanchoPanzaXXI. Licencia **CC BY-SA 4.0** (también GFDL).
- **Blasón** (según la ficha de Commons): *«En campo de plata, un árbol, fresno, de sinople, fustado; campaña de azur, cargada con dos patos enfrentados, de plata. Al timbre, Corona Real cerrada.»* No he encontrado publicación oficial en el DOE ni en el BOE [PENDIENTE].
- **Las dos versiones no coinciden.** La de la web es un óvalo dentro de una cartela barroca verde y amarilla, con corona de perlas azules y unas aves que parecen cisnes. La de Commons es un escudo español normalizado, con campaña azul y dos patos.
- **El escudo está en revisión.** El Pleno del 26/07/2024 abrió expediente para modificar el escudo y crear una bandera. El 24/10/2024 el heraldista Miguel Calvo Verdú presentó su propuesta. No consta que se haya aprobado. Fuentes: [Extremadura7dias, 30/07/2024](https://www.extremadura7dias.com/noticia/ribera-fresno-escudo-bandera-cambio-ayuntamiento-badajoz-pleno-municipal) e [Infoprovincia, 27/10/2024](https://infoprovincia.net/2024/10/27/miguel-calvo-verdu-presenta-su-propuesta-de-creacion-de-la-bandera-de-ribera-del-fresno-y-modificacion-del-escudo-municipal/).

**Colores sacados de las imágenes:**

| Elemento | Commons (SVG) | Versión de la web |
|---|---|---|
| Campo plata / fondo | `#e3e4e5` | `#ffffff` |
| Azur (agua) | `#0071bc` | `#0078bd` |
| Sinople (árbol) | `#008f4c` | `#01662a` (copa) |
| Tronco | `#784421` | `#622e21` |
| Oro (corona / marco) | `#eac102` | `#ffe401` |
| Gules (corona) | `#ed1c24` | `#e20a17` |
| Marco verde de la cartela | — | `#02802e` |
| Perlas de la corona | gris | `#0087e4` |

El rojo institucional de la web actual (CSS de la plantilla de la Diputación) es `#c60000`.

### Bandera
**No hay bandera oficial [PENDIENTE].** Wikipedia pone «bandera = no» y en 2024 el Ayuntamiento reconocía que el municipio no tenía. La propuesta de 2024 no se ha publicado con su descripción ni sus colores.

---

## 2. Corporación municipal (legislatura 2023-2027)

Constituida el 17/06/2023. Gobierna una **coalición de PP, Grupo Independiente de Ribera (GIR) e IU**; el **PSOE** está en la oposición.

| Nombre | Partido | Cargo | Delegación | Desde |
|---|---|---|---|---|
| **Miguel Ángel Araya Salguero** | PP | **Alcalde-Presidente** | — | 17/06/2023 |
| Tamara Ledesma Becerra | GIR | 1.ª Teniente de Alcalde (desde feb. 2025) | Cultura y Participación Ciudadana | 17/06/2023 |
| Andrés Bermejo Fernández | IU | 2.º Teniente de Alcalde | Deporte, Juventud, Mujer e Igualdad (dedicación parcial desde el Pleno del 24/09/2025) | 17/06/2023 |
| Teresa Hernández Gordillo | PP | 3.ª Teniente de Alcalde | Festejos, Sanidad y Agricultura | 17/06/2023 |
| Ángel Rebollo Silva | GIR | Concejal delegado | Urbanismo, Infraestructuras, Obras y Servicios | 07/02/2025 |
| María Teresa Rodríguez Rosa | IU | Concejala delegada | Turismo, Patrimonio Cultural y Natural, Comercio y Promoción Industrial | 17/06/2023 |
| Inmaculada Campillejo Carvajal | PP | Concejala delegada | Educación, Políticas Sociales y Universidad Popular | 17/06/2023 |
| Noelia Contreras Campillejo | PSOE | Concejala | — | 17/06/2023 |
| Antonio Domínguez Guerrero | PSOE | Concejal | — | 17/06/2023 |
| María del Rosario Campillejo Murillo | PSOE | Concejala (sustituye a M.ª Piedad Rodríguez Castrejón) | — | 02/07/2025 |
| Manuel Chacón Valverde | PSOE | Concejal (sustituye a Juan José Suárez Ortiz) | — | 02/07/2025 |

- Jordi González Santiago (GIR) era 1.er Teniente de Alcalde y concejal de Urbanismo. **Falleció el 30/12/2024** ([Infoprovincia](https://infoprovincia.net/2024/12/31/ribera-del-fresno-despide-al-primer-teniente-de-alcalde-jordi-gonzalez-santiago-a-los-58-anos-de-edad/)).
- La secretaria-interventora es María José Guillén Gerez, según las firmas de los BOP de 2023 y 2025.
- **Fotos oficiales: no hay.** La página de Corporación de la web solo trae la lista de nombres.
- Fuentes:
  - [BOP 03/07/2023, anuncios 3563 y 3571](https://www.dip-badajoz.es/toolsphp/descarga.php?fr=6&id=bop_2023-07-03000000_firmado.pdf): tenientes de alcalde y delegaciones.
  - [BOP 27/02/2025, anuncios 677 y 678](https://www.dip-badajoz.es/toolsphp/descarga.php?fr=6&id=bop_2025-02-27000000_firmado.pdf): Urbanismo pasa a Rebollo y Ledesma es 1.ª Teniente.
  - [BOP 19/06/2026](https://www.dip-badajoz.es/bop/ventana_anuncio.php?id_anuncio=163103&FechaSolicitada=202606190000): Ledesma sigue como 1.ª Teniente.
  - [BOP 07/10/2025](https://www.dip-badajoz.es/bop/ventana_anuncio.php?id_anuncio=159296&FechaSolicitada=202510070000): dedicación parcial de Bermejo.
  - [ayuntamiento.es](https://www.ayuntamiento.es/ribera-del-fresno/): fechas de toma de posesión.
  - [Onda Cero Sur, 12/07/2025](https://ondacerosur.es/el-ayuntamiento-de-ribera-del-fresno-incorpora-dos-nuevos-concejales-y-aprueba-las-fiestas-locales-de-2026/): entrada de los dos concejales del PSOE.
  - Web: [Corporación Municipal](https://riberadelfresno.es/plantilla.php?enlace=corporacionmunicipal).
- **Fuentes desfasadas:**
  - La [ficha de la Diputación](https://www.dip-badajoz.es/municipios/municipio_dinamico/corporacion/index_corporacion.php?codigo=128) aún lista a Jordi González, Piedad Rodríguez y Juan José Suárez.
  - Wikidata da como alcaldesa a Piedad Rodríguez Castrejón (PSOE, alcaldesa de 2011 a 2023).
  - todoslosayuntamientos.es da 2 concejales al PP; son 3.
- [PENDIENTE]: comprobar que siguen vigentes a fecha de hoy el orden del 2.º y 3.er teniente y la delegación de Urbanismo. El último BOP localizado es del 19/06/2026.

---

## 3. Datos prácticos

**Ayuntamiento**: C/ Ayuntamiento, 1 · 06225 Ribera del Fresno (Badajoz)
- Teléfono: **924 536 011**. Otras líneas de las oficinas: 924 53 65 11, 924 53 62 28 y 924 53 65 94.
- Fax: **924 536 428**.
- Correo: **ayuntamiento@riberadelfresno.es**. Secretaría: secretaria@riberadelfresno.es. Terceros también dan ribera@dip-badajoz.es.
- Horario de atención: **[PENDIENTE]** (no aparece en la web, la sede ni la Diputación).
- La oficina de registro figura en la sede (DIR3 O00009642) en **«Calle Ayuntamiento 2»**, lo que choca con el n.º 1.
- Fuentes: [web, Contacte](https://riberadelfresno.es/contacta.php), [sede, Titularidad](https://riberadelfresno.sedelectronica.es/ownership), [Diputación](https://www.dip-badajoz.es/municipios/municipio_dinamico/inicio/index_inicio.php?codigo=128) y [Teléfonos de interés](https://riberadelfresno.es/plantilla.php?enlace=telefonointeres).

**Redes**:
- Facebook: [AyuntamientodeRiberadelFresno](https://www.facebook.com/AyuntamientodeRiberadelFresno), 7.732 seguidores.
- X: [@aytoribera](https://twitter.com/aytoribera).
- Instagram: [@aytoriberadelfresno](https://www.instagram.com/aytoriberadelfresno/), unas 2.086 cuentas seguidoras. La web no la enlaza: su icono de Instagram apunta a plus.google.com.
- [Canal de YouTube](http://www.youtube.com/channel/UC6OMGwPGD_SNkhk9ew5Bc-A).

### Servicios

| Servicio | Dirección | Teléfono | Horario | Fuente |
|---|---|---|---|---|
| Policía Local | C/ Hospital (antigua Cámara Agraria) | 654 338 096 · fax 924 53 64 28 | [PENDIENTE] | web, Policía Local |
| Protección Civil | C/ Escuela | 638 763 187 / 924 53 67 07 | [PENDIENTE] | web |
| Guardería Rural / Policía Rural / Punto de Información Catastral | antiguo centro de salud | 924 536 011 · móvil 615 196 716 | 13:00-15:00 (cambia en campaña de uva y aceituna) | web |
| Guardia Civil (Puesto) | Avda. Cuartel s/n | **924 536 013** · ba-pto-riberadelfresno@guardiacivil.org | [PENDIENTE] | [guardiacivil.es](https://web.guardiacivil.es/es/colaboracion/atencionciudadano_1/directorio-de-telefonos-y-direcciones/PUESTO-DE-RIBERA-DEL-FRESNO/). La web municipal da 924 53 60 11, que es el del Ayuntamiento |
| Juzgado de Paz | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] | Consta que existe: BOP 04/07/2023, convocatoria de juez de paz sustituto |
| Consultorio médico | [PENDIENTE] | 924 53 65 51 | [PENDIENTE] | web. Páginas Amarillas da «C/ Fresno de la Ribera s/n», que parece confundido con el pueblo de Zamora |
| Farmacias | C/ Meléndez Valdés, 7 y n.º 37 (fuente secundaria, Tiendeo) | [PENDIENTE] | [PENDIENTE] | tiendeo.com |
| CEIP Meléndez Valdés | C/ Escuelas s/n (también «Avda. Cuartel s/n») | 924 028 770 · cp.melendezvaldes@educarex.es | [PENDIENTE] | [educarex](https://cpmelendezvaldes.educarex.es/index.php/informacion) |
| IESO Valdemedel | C/ Virgilio Gutiérrez s/n (fuente secundaria) | 924 281 470 | [PENDIENTE] | web, Teléfonos de interés |
| Guardería infantil municipal (CEI) «Garabatos» | C/ Virgilio Gutiérrez, 1 | [PENDIENTE] | [PENDIENTE] | web |
| Biblioteca «Virgilio Gutiérrez» | C/ San Juan Macías, 2 | 924 537 224 | L-V 9:30-14:00 | web (escribe «Vigilio», con errata) |
| Casa de la Cultura (Casa de Vargas-Zúñiga) | C/ San Juan Macías, 2 | 924 53 72 24 | [PENDIENTE] | web |
| C. I. «Cerro de Hornachuelos» | dentro de la Casa de la Cultura | 924 53 72 24 | L-V 10-14 y 16-21; S-D 10-14 y 17-21 (texto antiguo, sin fecha) | web, Oppidum |
| Escuela Municipal de Música | Casa de la Cultura | 924 53 72 24 | [PENDIENTE] | web |
| Piscina municipal | [PENDIENTE] | 924 53 68 04 | [PENDIENTE] | web |
| Polideportivo | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] | — (hay un campo de césped artificial en proyecto) |
| Punto limpio | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] | — |
| Centro de Día «La Ribera» | C/ Virgilio Gutiérrez s/n | 924 028 924 | 10:00-18:00 | web |
| Hogar del Pensionista | [PENDIENTE] | 924 53 68 19 | — | web |
| Residencia «San Juan Macías» | [PENDIENTE] | 924 53 72 80 | — | web |
| «La Providencia», Hogar de Nazaret (discapacidad) | [PENDIENTE] | 924 53 62 78 | — | web |
| Servicio Social de Base | Ayuntamiento | oficinas | lunes, martes y jueves | web |
| OMIC (consumo) | C/ Ayuntamiento, 1 | 924 536 011 | — | web. Su enlace a ww16.oficinadelconsumidor.org lleva a un dominio aparcado |
| Universidad Popular | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] | concejalía de Educación |
| Oficina de turismo | [PENDIENTE] | — | — | — |
| Cementerio | [PENDIENTE] | — | — | ordenanza y reglamento modificados en 2026 |
| OAR (recaudación) | oficina [PENDIENTE] | — | — | <http://cervantes.dip-badajoz.es/contenidos/> |
| Parroquia N.ª S.ª de Gracia | C/ Iglesia, 2 | 924 53 60 02 | — | web |
| Ermitas de la Aurora y del Cristo | — | 924 53 60 02 / 924 53 60 66 | — | web |

---

## 4. Enlaces institucionales

Estado comprobado el 02/10/2026.

| Enlace | URL | Estado |
|---|---|---|
| Sede electrónica | <https://riberadelfresno.sedelectronica.es> | carga (redirige a /info.0) |
| Tablón de anuncios | <https://riberadelfresno.sedelectronica.es/board> | 200 |
| Portal de transparencia | <https://riberadelfresno.sedelectronica.es/transparency> | 200 (los bloques 4, 5, 7 y 8 tienen 0 documentos) |
| Perfil del contratante (sede) | <https://riberadelfresno.sedelectronica.es/contractor-profile-list> | 200 (solo 2 expedientes, de 2023 y 2024) |
| Perfil en la Plataforma de Contratación | [Alcaldía del Ayto. de Ribera del Fresno](https://contrataciondelestado.es/wps/portal/!ut/p/b0/DcexDkAwEADQTzqLBImhmsYsBtx2ieKiTlPH4Ot52wOEEVDo4ZWUT6Hwf5q9j4Flr6JPCwd7iiZSEvUwAALy3ESYss5i6bY3uaK_10tN06bc1DXE4zAfE0Dcfg!!/) | 200 |
| «Histórico del perfil» que enlaza la sede | <http://www.riberadelfresno.es/perfil.php> | **ROTO** (página de error) |
| Registro / Instancia general | <https://riberadelfresno.sedelectronica.es/catalog/t/5161fa8d-970e-4b48-a506-b2ac34ceafe5> | 200 |
| Instancia en PDF | <http://riberadelfresno.es/repositorio/20210423104443.pdf> | 200 |
| Factura electrónica (FACe) | <https://proveedores.face.gob.es/inicio>. Códigos: oficina contable, órgano gestor y unidad tramitadora **L01061134** | 200 |
| FACe en la sede / en la web | <https://riberadelfresno.sedelectronica.es/e-invoice> · <https://riberadelfresno.es/plantilla.php?enlace=facturae> | 200 |
| Validación de documentos | <https://riberadelfresno.sedelectronica.es/document-validation> | — |
| Cita previa | No hay cita municipal. La web enlaza la cita de la ITV (citapreviaitv.gobex.es) | **ROTO** (no responde) |
| Bandomóvil / app de avisos | no consta [PENDIENTE] | — |
| RSS del BOP | **No existe.** El icono RSS del bloque «Anuncios en el BOP» lleva a `rss.php`, que solo tiene feeds de noticias, tablón y agenda. Listado de anuncios: <https://riberadelfresno.es/bop.php> | — |
| Ordenanzas (web actual) | <https://riberadelfresno.es/plantilla.php?enlace=ordenanzas> | 200 (04/10/2026). Lista de su web; no tiene las aprobadas en 2026. En `transparencia.html` (v3c) |
| Anuncios del Ayuntamiento en el BOP (web actual) | <https://riberadelfresno.es/bop.php> | 200 (04/10/2026). De ahí salen, con su título y su enlace, los anuncios que enlaza `transparencia.html`: presupuesto general de 2026, aprobación definitiva (344/2026, BOP 05/02/2026); exposición pública de la cuenta general de 2025 (3352/2026, BOP 24/08/2026); bases de las subvenciones a asociaciones de 2026 (2828/2026, BOP 16/07/2026). El `robots.txt` de dip-badajoz.es prohíbe `/bop` a los robots: los anuncios **no se han abierto**, solo se enlazan como los enlaza su web. Los títulos de empleo de `CASOS_EMPLEO` (`scripts/lib/tablon.mjs`) salen también de esta lista |
| Feeds de la web | <https://riberadelfresno.es/atomnoticias.php> · <https://riberadelfresno.es/atomtablon.php> · <https://riberadelfresno.es/atomagenda.php> | 200 |
| OAR | <http://cervantes.dip-badajoz.es/contenidos/> | 200 |
| Vida laboral | <https://sede.seg-social.gob.es/Sede_1/ServiciosenLinea/Ciudadanos/168694> | 200 |
| El tiempo (AEMET) | <http://www.aemet.es/es/eltiempo/prediccion/municipios/ribera-del-fresno-id06113> | 200. INE **06113** (`municipio.json → ine`), el mismo que el DIR3 L0106113**4**. Comprobado el 03/10/2026: AEMET decide el pueblo por el número (con otro nombre en la URL sigue saliendo Ribera) |
| Farmacias de guardia (Colegio Oficial de Farmacéuticos de Badajoz) | <https://cofbadajoz.com/farmacias-de-guardia/> | 200 (03/10/2026). Es un buscador provincial; `cofbadajoz.es` no responde. El calendario de guardias de Ribera no consta: la rotación de la web es de **ejemplo** |
| Observatorio socioeconómico | <https://portalestadistico.com/municipioencifras/?pn=dip-badajoz&pc=WRC03&id_territorio=06113> | 200 |
| Vídeo promocional | <https://youtu.be/DV9DXcXjrYY> | 200 |
| Web de Meléndez Valdés | <http://www.juanmelendezvaldes.es/> | 200 |
| Canal de denuncias | <https://riberadelfresno.sedelectronica.es/complaints-channel> | — |

---

## 5. Trámites frecuentes

La sede tiene **111 procedimientos** con enlace fijo; están todos en el JSON. Estos son los más habituales:

| Trámite | Enlace |
|---|---|
| Instancia general | <https://riberadelfresno.sedelectronica.es/catalog/t/5161fa8d-970e-4b48-a506-b2ac34ceafe5> |
| Alta o renovación en el padrón | <https://riberadelfresno.sedelectronica.es/catalog/t/d120f65c-c936-4a95-bd50-e7ae970ca149> |
| Certificado o volante de empadronamiento | <https://riberadelfresno.sedelectronica.es/catalog/t/1c74bc66-8b69-4f3c-8183-d3591f0504ed> |
| Modificación de datos del padrón | <https://riberadelfresno.sedelectronica.es/catalog/t/d74e17fb-69a1-4ef6-931a-d0381be7ffdc> |
| Licencia o autorización urbanística | <https://riberadelfresno.sedelectronica.es/catalog/t/15fabacb-83b1-47d1-b435-508245672051> |
| Declaración responsable o comunicación urbanística (obra menor) | <https://riberadelfresno.sedelectronica.es/catalog/t/5d383e20-32a5-4fcf-8725-e51c51e83e6a> |
| Domiciliación de tributos | <https://riberadelfresno.sedelectronica.es/catalog/t/a93cd417-195c-40c5-acf2-9a92b36c8809> |
| Alta de agua / cambio de titular | <https://riberadelfresno.sedelectronica.es/catalog/t/5697411e-7a60-4df6-9867-07258add24de> · <https://riberadelfresno.sedelectronica.es/catalog/t/a4806ac2-0236-4222-9c47-52bdaaa42c9e> |
| Quejas y sugerencias | <https://riberadelfresno.sedelectronica.es/catalog/t/ae05799c-df61-43d1-be43-31943561cea9> |
| Aviso de incidencia en la vía pública | <https://riberadelfresno.sedelectronica.es/catalog/t/d643e8cf-0824-4617-a997-c523799b4a93> |
| Solicitud de licencia de obras (PDF de la web, 01/10/2025) | <https://riberadelfresno.es/documentos/20251001084925.pdf> |
| Comunicación de fin de obra (PDF) | <https://riberadelfresno.es/documentos/20251001090738.pdf> |
| Comunicación previa de instalación fotovoltaica (PDF) | <https://riberadelfresno.es/documentos/20251001091143.pdf> |
| Modelo de instancia oficial (PDF) | <http://riberadelfresno.es/repositorio/20210423104443.pdf> |

---

## 6. Noticias y agenda

**Las 6 más recientes**:
1. **02/10/2026**: Reunión informativa sobre la «V Feria del Comercio», el viernes 2 de octubre a las 20:30 en la Casa de la Cultura. Fuente: [Facebook](https://www.facebook.com/AyuntamientodeRiberadelFresno).
2. **01/10/2026**: Se instala una nueva cruz metálica de 8 × 4 m en el Pozo de San Juan. El camino de peregrinación estará listo a finales de 2026 y se prepara un hermanamiento con Lima. Fuente: Facebook.
3. **01/10/2026**: Convocatoria 2026 de ayudas a la natalidad (exp. 182/2026). Fuente: [tablón de la sede](https://riberadelfresno.sedelectronica.es/board).
4. **01/10/2026**: El concejal Andrés Bermejo informa de cómo va el proyecto del campo de fútbol de césped artificial. Fuentes: Facebook y [La Gaceta Independiente](https://lagacetaindependiente.com/2026/10/01/el-campo-de-futbol-de-ribera-del-fresno-afronta-un-nuevo-capitulo-de-espera-tras-tres-anos-de-tramitacion).
5. **01/10/2026**: Grabación del pleno ordinario del 30/09/2026. El texto del post dice «20 septiembre» y el título del vídeo, «30». Fuente: Facebook.
6. **29/09/2026**: Anuncio previo a la construcción de las instalaciones eléctricas «Anillo Norte» (exp. 1526/2026). Fuente: tablón de la sede.

Las fechas de Facebook son aproximadas: el plugin muestra «hace 4 h», «hace 1 d»… y no da enlace a cada publicación. **La sección Noticias de la web lleva parada desde el 09/08/2023.**

**Agenda**:
- 02/10/2026, 20:30: reunión de la V Feria del Comercio en la Casa de la Cultura. Falta la fecha de la propia feria [PENDIENTE].
- Finales de 2026: apertura del Camino de Peregrinación Ribera – Pozo de San Juan.
- Segunda semana de noviembre: FEAVIR. Falta la fecha de 2026 [PENDIENTE].
- La «Agenda Alcaldía» de la web está **vacía**, y su feed termina en 2015.

---

## 7. El pueblo

**Historia breve.** El Oppidum de Hornachuelos, probablemente la *Fornacis* de Ptolomeo, estuvo habitado ya en la Edad del Cobre y vivió su mejor época entre el siglo II a. C. y el I d. C. La Orden de Santiago repobló la villa en el siglo XIII y llegó a ser cabeza de Encomienda; la primera referencia escrita es de 1257. Según la tradición, el nombre viene de un gran fresno a orillas del arroyo Valdemedel. El casco se rehízo en los siglos XVII y XVIII, con casas encaladas de rejas negras y casonas barrocas con blasones. Fuentes: web (Historia), Diputación (Historia) y Wikipedia.

**Patrimonio** (fuentes: web, páginas Monumentos e Historia; Diputación, Monumentos):
- **Iglesia de Nuestra Señora de Gracia** (C/ Iglesia, 2). Es del siglo XIII-XIV y se reedificó en 1745 y 1859. Tiene **dos torres gemelas** en una fachada que mira hacia el lado contrario del caserío. Dentro guarda un retablo barroco de Alonso Rodríguez Lucas y un púlpito de mármol de Estremoz. Es zona ZEPA del cernícalo primilla.
- **Ermita del Cristo de la Misericordia** (siglo XVIII). El Cristo es de Pedro Roldán, según la web.
- **Ermita de la Aurora**: conserva la sillería de los Trece de la Orden de Santiago y piedras visigodas.
- **Ermita del Cristo Viejo** (siglo XVI): en ruinas, con una torre de remate bulboso.
- **Ermita de San Juan Macías** (1985), levantada en la casa natal del santo. **Ermita de San Isidro** (1998).
- **Casa natal de Juan Meléndez Valdés**, en la C/ Larga, con una placa: «En esta casa que ves nació el poeta admirable Don Juan Meléndez Valdés». La web anuncia el **Bicentenario 1817-2017** y tiene su logo.
- **Monumento a Meléndez Valdés**: busto de bronce de 1985, obra de Luis Martínez Giraldo.
- **Casa de Vargas-Zúñiga**, hoy Casa de la Cultura. Otras casas nobles: Palacio de Quintanilla, Casa de Bazo y casas de los Olea y los Grajera. El Ayuntamiento ocupa el antiguo **convento de Jesús y María**, de clarisas, fundado en 1535.
- **Oppidum de Hornachuelos** y su Centro de Interpretación. **Pozo de San Juan Macías**. **Pilar del Caño**.
- Pozos rurales pintados de **rojo y blanco**, «los colores típicos de los pozos de Ribera» según Commons, y las ruinas del lavadero de lanas.

**Fiestas** (fuentes: web, [Fiestas](https://riberadelfresno.es/plantilla.php?enlace=fiestas); Diputación; Onda Cero):

| Fiesta | Fecha |
|---|---|
| Jueves de Compadres | dos jueves antes del Miércoles de Ceniza |
| Muestra Popular de Vinos de Pitarra y Matanza | febrero según la web; «puente de diciembre» según Wikipedia (no coinciden) |
| San Isidro | 15 de mayo (fiesta local en 2026) |
| Festival Folklórico Internacional de la Baja Extremadura | tercer fin de semana de julio y 13 de agosto (se celebra desde 1985) |
| Festival de Teatro «Meléndez Valdés» | en verano (desde 2004) |
| Jornadas Gastronómicas y Artesanales | primer fin de semana de agosto |
| Fiestas del Emigrante | 15 de agosto |
| Día de Extremadura | 8 de septiembre |
| **Ferias del Stmo. Cristo de la Misericordia** (fiesta mayor) | 14 de septiembre, 4 días (la Diputación dice del 13 al 16). Fiesta local en 2026 |
| Romería al Pozo de San Juan Macías | domingo siguiente a las fiestas del Cristo; Wikipedia dice el tercer domingo de septiembre |
| FEAVIR (feria avícola) | segunda semana de noviembre |

**Gastronomía.**
- Platos: gazpacho, bacalao en cantina, escabeche, caldereta de cordero, pescadilla, tapas de guarrino, migas (la Diputación las llama «migas canas»), garbanzos con romazas y repápalos de leche.
- Dulces: roscas de candil, flores, prestines, tirabuzones, perrunillas, bollos de Pascua, coquillos, hijuelas y torrijas.
- Bebidas: vino de pitarra, resóleo, vino y aceite de oliva virgen extra.
- Fuentes: web (Gastronomía y Jornadas) y Diputación.

**Rutas** (web, menú Rutas). Siete tienen descripción: Cerro de Hornachuelos, Pozo de San Juan Macías, Cortijo de Siete Iglesias, Cortijo de Quintana, Bodega y Cortijo de Peñaovejera, Punto de Mira de Las Cabezas y Cortijo Bonito, que pasa por Los Pilones. Las páginas de la **Ruta del Siglo XVIII y la Ruta del Agua están vacías** [PENDIENTE]. Además hay un camino de peregrinación en preparación.

**Personajes ilustres** (web, Personajes):
- **Juan Meléndez Valdés** (1754-1817): poeta y magistrado de la Ilustración.
- **San Juan Macías** (1585-1645): dominico en Lima, canonizado en 1975.
- **Alonso García Bravo** (c. 1490-1561): alarife de Hernán Cortés, trazó la primera planta de la Ciudad de México.
- **José María Chacón Pachón** (siglo XIX): diputado en la I República.

**Lema e identidad.**
- Lema: **«Ribera del Fresno. Vive la Historia»**. Es el logo turístico de la web, con dos torres sobre casas blancas (`img/web-logo-vive-la-historia.png`). Facebook lo usa como **#vivelahistoria** y **#turismoribera**.
- Otros rasgos propios:
  - las dos torres gemelas;
  - la colonia de cernícalo primilla;
  - el fresno y el arroyo Valdemedel;
  - los pozos rojos y blancos;
  - las casonas blasonadas;
  - una rareza que cita la Diputación: el pueblo «carece de plaza».

---

## 8. Fotos con licencia libre (Wikimedia Commons)

Commons tiene **muy pocas fotos del casco urbano**: solo dos, y pequeñas. **No hay ninguna de la iglesia ni de las fiestas.** Las elegidas están reducidas a 2.400 px de ancho cuando el original era mayor.

| Archivo | Autor | Licencia | Ficha |
|---|---|---|---|
| `img/commons-oppidum-hornachuelos-1.jpg` | Ángel M. Felicísimo | CC BY 2.0 | [ficha](https://commons.wikimedia.org/wiki/File:Oppidum_de_Hornachuelos_(33203384224).jpg) |
| `img/commons-oppidum-hornachuelos-2.jpg` | Ángel M. Felicísimo | CC BY 2.0 | [ficha](https://commons.wikimedia.org/wiki/File:Oppidum_de_Hornachuelos_(33904748411).jpg) |
| `img/commons-oppidum-hornachuelos-3.jpg` | Ángel M. Felicísimo | CC BY 2.0 | [ficha](https://commons.wikimedia.org/wiki/File:Oppidum_de_Hornachuelos_(33993657456).jpg) |
| `img/commons-lavadero-lanas-arcos.jpg` * | Diegui57 | CC BY-SA 4.0 | [ficha](https://commons.wikimedia.org/wiki/File:Ruinas_antiguo_lavadero_de_lanas_05.jpg) |
| `img/commons-lavadero-lanas-paisaje.jpg` * | Diegui57 | CC BY-SA 4.0 | [ficha](https://commons.wikimedia.org/wiki/File:Ruinas_antiguo_lavadero_de_lanas_01.jpg) |
| `img/commons-arroyo-valdemedel.jpg` * | Diegui57 | CC BY-SA 4.0 | [ficha](https://commons.wikimedia.org/wiki/File:Ruinas_antiguo_lavadero_de_lanas_08.jpg) |
| `img/commons-pozo-la-tinajona.jpg` * | Diegui57 | CC BY 4.0 | [ficha](https://commons.wikimedia.org/wiki/File:Pozo_Rural_de_%22La_Tinajona%22_05.jpg) |
| `img/commons-pozo-vega-tejares.jpg` | Diegui57 | CC BY 4.0 | [ficha](https://commons.wikimedia.org/wiki/File:Pozo_rural_%22Vega_Tejares%22_01.jpg) |
| `img/commons-monumento-melendez-valdes.jpg` (1024 px) | F. Enrique Suárez | CC BY-SA 3.0 | [ficha](https://commons.wikimedia.org/wiki/File:Casaamarilla.jpg) |
| `img/commons-palacio-vargas-zuniga.jpg` (550 px) | Tochoa | CC BY-SA 4.0 | [ficha](https://commons.wikimedia.org/wiki/File:Palacio_de_los_Vargas-Z%C3%BA%C3%B1iga_en_Ribera_del_Fresno.jpg) |

\* Llevan la **fecha impresa en naranja** en una esquina; hay que recortarlas o retocarlas.

## 9. Fotos de la web municipal

Todas proceden de riberadelfresno.es. Ojo: su aviso legal **prohíbe reproducirlas sin autorización**. Para una maqueta que se le enseña al propio Ayuntamiento no hay problema, pero no deben publicarse en abierto.

| Archivo | Origen | Nota |
|---|---|---|
| `img/web-cabecera-panoramica-iglesia.jpg` | `/imagenes/CABECERA.jpg` | Panorámica de la cabecera: las dos torres, cernícalos y la sierra. Solo **728×500**. Es un **cartel de DEMA y la Junta (2014)** y lleva una franja de texto abajo |
| `img/web-oppidum-hornachuelos.jpg` | `/galeria/20131205103348.jpg` | 1800×1200 |
| `img/web-calle-con-torre.jpg` | `/galeria/20131205104222.jpg` | Avenida con torre blanca, 1024×768 |
| `img/web-casa-cultura-fachada.jpg` | `/galeria/20230327131921.jpg` | Fachada blasonada, 1024×709 |
| `img/web-dulces-tipicos-1.jpg` y `-2.jpg` | `/galeria/20230327111317.jpg` y `/galeria/20230327111340.jpg` | 1842×1224 |
| `img/web-logo-vive-la-historia.png` | `/galeria/20220418101444.png` | Logo turístico |
| `img/web-logo-bicentenario-melendez-valdes.png` | `/galeria/20170608125109.png` | Logo del bicentenario |
| `img/escudo-web-oficial.jpg` | `/galeria/20131204101934.jpg` | Escudo tal como lo usa la web |
| `img/web-vista-aerea-baja.jpg` y `img/web-monumentos-1…5-baja.jpg` | `/galeria/2013120…` | Solo 360×240; sirven de referencia, no para la maqueta |

El resto de imágenes de la web de 2023 son carteles de eventos, no fotos.
