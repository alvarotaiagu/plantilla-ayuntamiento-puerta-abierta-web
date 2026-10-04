/* crear-hoja.gs — monta en un clic la hoja y los formularios para publicar en la web del Ayuntamiento
   (plantilla «Puerta abierta», v3c · guia). Ver PUBLICAR.md, «El camino corto».

   CÓMO SE USA (una sola vez, con la cuenta de Google DEL AYUNTAMIENTO, no con una personal):
     1. Abra https://script.google.com → «Nuevo proyecto».
     2. Borre lo que haya en el editor, pegue este archivo entero y guarde (icono del disquete).
     3. Arriba, en el desplegable de funciones, elija «crearHojaDeLaWeb» y pulse «Ejecutar».
     4. Google pide permiso («Revisar permisos» → la cuenta del Ayuntamiento → «Permitir»): el
        script crea archivos en su Drive (la hoja, los tres formularios y una carpeta).
        Si sale «Google no ha verificado esta aplicación», es normal: el script es suyo. Pulse
        «Configuración avanzada» → «Ir a … (no seguro)».
     5. Al terminar, abajo («Registro de ejecución») sale el bloque «hoja» para municipio.json, con
        el id de la hoja y las direcciones de los formularios. Lo mismo queda escrito en la pestaña
        «Léame» de la hoja. Páseselo a quien mantiene la web.
     6. Lo que un script no puede hacer (pestaña «Léame» o PUBLICAR.md, paso 2 del camino corto):
        publicar en la web las tres pestañas, y comprobar en cada formulario que el correo se recoge
        «Verificado» (con inicio de sesión de Google).

   Quién publica: SOLO las personas de la pestaña «Personas autorizadas» (una dirección de correo
   por fila). Los formularios recogen el correo de la cuenta de Google con la que se entra, y las
   pestañas publicadas solo copian las filas cuyo correo está en esa lista: lo que mande otra
   persona se queda en las respuestas, privado, y nunca llega a la web. El script la crea con el
   correo de quien lo ejecuta. Para añadir a alguien, se escribe su correo de Google en una fila
   nueva; para quitarlo, se borra su fila (lo que ya publicó deja de salir). No hace falta Google
   Workspace: vale con cuentas de Gmail.

   Qué crea:
     · la carpeta «Web del Ayuntamiento» en su Drive, con todo dentro;
     · la hoja «Web del Ayuntamiento», PRIVADA (solo la cuenta que ejecuta el script);
     · la pestaña privada «Personas autorizadas», con el correo de quien ejecuta el script;
     · tres formularios: «Publicar un aviso en la web», «Publicar un acto en la agenda» y «Publicar una
       noticia en la web», que recogen el correo (setCollectEmail). Cada pregunta se llama
       EXACTAMENTE como la columna que lee la web (js/main.js las lee sin tildes ni mayúsculas:
       «Título corto» → titulo_corto);
     · en la hoja, una pestaña de respuestas por formulario («Respuestas avisos»…), con dos columnas
       al final: «Estado» (oculto = retirar algo sin borrarlo) y «Autorizada» (sí / no: si el correo
       de esa fila está en «Personas autorizadas»; se calcula sola);
     · las pestañas que se publican («Avisos», «Agenda», «Noticias»): copian con QUERY solo las filas
       autorizadas y solo las columnas que lee la web, sin la marca temporal ni el correo;
     · opcional (AVISAR_POR_CORREO): un correo a la cuenta del Ayuntamiento con cada envío.

   No se ha podido ejecutar en Google al escribirlo (no hay cuenta en el entorno de la plantilla): está
   escrito con la API documentada de Apps Script (SpreadsheetApp, FormApp, DriveApp, ScriptApp,
   MailApp) y verificar.mjs → v3cguia lo ejecuta contra una imitación de esa API. La primera vez que
   se use de verdad, compruebe la hoja con el paso 3 de PUBLICAR.md. */

/* ═══ lo que se puede cambiar antes de ejecutar ═══ */
var NOMBRE = 'Web del Ayuntamiento';
var TEMAS = ['Agua', 'Obras', 'Tráfico', 'Cultura', 'Deporte', 'Empleo', 'Salud', 'Seguridad', 'Otros'];
/* true: cada envío manda un correo a la cuenta del Ayuntamiento con lo que se ha mandado y quién.
   Pide un permiso más */
var AVISAR_POR_CORREO = true;
/* más correos autorizados desde el principio (además del de quien ejecuta el script), por ejemplo
   ['secretaria.ayto@gmail.com']. Se pueden añadir después en la pestaña «Personas autorizadas» */
var OTRAS_PERSONAS = [];

/* los nombres de la pestaña de autorizados y de las columnas propias (no los cambie) */
var AUTORIZADAS = 'Personas autorizadas';
var COL_CORREO = 'Dirección de correo electrónico';   /* la que pone Google en una hoja en español */
var COL_ESTADO = 'Estado';
var COL_AUTORIZADA = 'Autorizada';

/* ═══ las preguntas: el título es el nombre de la columna que lee la web ═══
   (las mismas que plantillas-hoja/*.csv; no cambie los títulos ni el orden) */
var PREGUNTAS = {
  avisos: [
    { titulo: 'Fecha', tipo: 'fecha', obligatoria: true, ayuda: 'El día del aviso (normalmente, hoy).' },
    { titulo: 'Título', tipo: 'corta', obligatoria: true, ayuda: 'Qué pasa, dónde y cuándo, con día y hora. Por ejemplo: «Corte de agua en la calle Mayor el martes, de 9:00 a 13:00».' },
    { titulo: 'Tema', tipo: 'lista', opciones: TEMAS, ayuda: 'Para los filtros del tablón.' },
    { titulo: 'Texto', tipo: 'parrafo', ayuda: 'Los detalles, si hacen falta. Sin datos personales.' },
    { titulo: 'Gravedad', tipo: 'opcion', opciones: ['informativo', 'programado', 'urgente'],
      ayuda: 'urgente = franja roja arriba en todas las páginas (una avería, una alerta). programado = franja ámbar (un corte o una obra anunciados). informativo = solo tablón y «Hoy». Si no marca nada, informativo.' },
    { titulo: 'Caduca', tipo: 'fecha', ayuda: 'Último día que sale en la franja. Sin esta fecha, un aviso urgente o programado NO sale en la franja.' },
    { titulo: 'Título corto', tipo: 'corta', maximo: 70, ayuda: 'Solo si el título pasa de 70 letras: es lo que se lee en la franja del móvil.' }
  ],
  agenda: [
    { titulo: 'Fecha', tipo: 'fecha', obligatoria: true, ayuda: 'El día del acto.' },
    { titulo: 'Hora', tipo: 'hora', ayuda: 'Sin hora, el acto es de día entero.' },
    { titulo: 'Hora fin', tipo: 'hora', ayuda: 'Para el calendario del móvil. Sin ella, dura una hora.' },
    { titulo: 'Título', tipo: 'corta', obligatoria: true, ayuda: 'Por ejemplo: «Concierto de la banda municipal».' },
    { titulo: 'Lugar', tipo: 'corta', ayuda: 'Por ejemplo: «Plaza de España».' },
    { titulo: 'Nota', tipo: 'parrafo', ayuda: 'Entrada libre, cómo apuntarse…' },
    { titulo: 'Tipo', tipo: 'casilla', opciones: ['pleno'], ayuda: 'Márquelo solo si es un pleno: sale como «Próximo pleno» en la portada.' },
    { titulo: 'Convocatoria', tipo: 'url', ayuda: 'Solo plenos: el enlace a la convocatoria en la sede electrónica (https://…).' },
    { titulo: 'Grabación', tipo: 'url', ayuda: 'Solo plenos ya celebrados: el enlace al vídeo (https://…).' }
  ],
  noticias: [
    { titulo: 'Fecha', tipo: 'fecha', obligatoria: true, ayuda: 'El día de la noticia.' },
    { titulo: 'Título', tipo: 'corta', obligatoria: true, ayuda: 'Lo que ha pasado, en una línea.' },
    { titulo: 'Resumen', tipo: 'corta', maximo: 160, ayuda: 'Una frase que se lee debajo del título en la portada.' },
    { titulo: 'Texto', tipo: 'parrafo', ayuda: 'La noticia entera, un párrafo por línea. Sin datos personales; las fotos, a quien mantiene la web (con permiso de quien sale).' }
  ]
};
var FORMULARIOS = {
  avisos: { titulo: 'Publicar un aviso en la web', pestana: 'Avisos', respuestas: 'Respuestas avisos',
    descripcion: 'Lo que envíe sale en la web en unos minutos. Para retirarlo, escriba «oculto» en la columna Estado de su fila en la hoja.' },
  agenda: { titulo: 'Publicar un acto en la agenda', pestana: 'Agenda', respuestas: 'Respuestas agenda',
    descripcion: 'Sale en la agenda, en «Lo que viene» y en «Hoy». Para retirarlo, escriba «oculto» en la columna Estado de su fila en la hoja.' },
  noticias: { titulo: 'Publicar una noticia en la web', pestana: 'Noticias', respuestas: 'Respuestas noticias',
    descripcion: 'Sale en «Lo que pasó» de la portada y en Noticias. Para retirarla, escriba «oculto» en la columna Estado de su fila en la hoja.' }
};
var CONFIRMACION = 'Enviado. Si su cuenta está autorizada, saldrá en la web en unos minutos. Si ve una errata, pulse «Editar su respuesta».';

/* ═══ la función que se ejecuta ═══ */
function crearHojaDeLaWeb() {
  var ss = SpreadsheetApp.create(NOMBRE);
  ss.setSpreadsheetLocale('es_ES');
  ss.setSpreadsheetTimeZone('Europe/Madrid');
  var leame = ss.getSheets()[0];
  leame.setName('Léame');
  var yo = crearAutorizadas(ss);

  var urls = {}, archivos = [ss.getId()];
  ['avisos', 'agenda', 'noticias'].forEach(function (clave) {
    var form = crearFormulario(clave);
    archivos.push(form.getId());
    var respuestas = vincular(ss, form, FORMULARIOS[clave].respuestas);
    var cabecera = escribirColumnasPropias(respuestas, clave);
    crearPestanaPublicable(ss, clave, cabecera);
    urls[clave] = form.getPublishedUrl();
    if (AVISAR_POR_CORREO) ScriptApp.newTrigger('avisarDeLoPublicado').forForm(form).onFormSubmit().create();
  });

  /* el orden de las pestañas: Léame, las tres que se publican, los autorizados y las respuestas */
  ss = SpreadsheetApp.openById(ss.getId());
  ['Léame', 'Avisos', 'Agenda', 'Noticias', AUTORIZADAS, 'Respuestas avisos', 'Respuestas agenda', 'Respuestas noticias'].forEach(function (nombre, i) {
    var h = ss.getSheetByName(nombre);
    if (!h) return;
    ss.setActiveSheet(h);
    ss.moveActiveSheet(i + 1);
  });

  /* todo en una carpeta, para encontrarlo */
  var carpeta = DriveApp.createFolder(NOMBRE);
  archivos.forEach(function (id) { DriveApp.getFileById(id).moveTo(carpeta); });

  var bloque = {
    hoja: {
      id: ss.getId(),
      pestanas: { avisos: 'Avisos', agenda: 'Agenda', noticias: 'Noticias' },
      formularios: urls
    }
  };
  var json = JSON.stringify(bloque, null, 2);
  escribirLeame(ss.getSheetByName('Léame'), json, ss.getUrl());
  ss.setActiveSheet(ss.getSheetByName('Léame'));
  Logger.log('Hoja creada: ' + ss.getUrl());
  Logger.log('Para municipio.json (páseselo a quien mantiene la web):\n' + json);
  Logger.log('Pueden publicar: ' + (yo ? yo : '(nadie todavía: escriba su correo en la pestaña «' + AUTORIZADAS + '»)') + (OTRAS_PERSONAS.length ? ', ' + OTRAS_PERSONAS.join(', ') : '') + '.');
  Logger.log('FALTAN DOS PASOS A MANO (pestaña «Léame»): publicar en la web las pestañas Avisos, Agenda y Noticias, ' +
    'y comprobar en cada formulario (Configuración → Respuestas) que «Recopilar direcciones de correo electrónico» está en «Verificado».');
  return bloque;
}

/* ═══ «Personas autorizadas»: quién puede publicar (privada; NUNCA se publica) ═══ */
function crearAutorizadas(ss) {
  var yo = '';
  try { yo = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  var h = ss.insertSheet(AUTORIZADAS);
  var filas = [['Correo', 'Quién es (opcional)']];
  if (yo) filas.push([yo, 'Cuenta del Ayuntamiento (la que creó esta hoja)']);
  OTRAS_PERSONAS.forEach(function (c) { filas.push([c, '']); });
  h.getRange(1, 1, filas.length, 2).setValues(filas);
  h.getRange(1, 1).setNote('Una dirección de correo de Google por fila: solo lo que manden estas personas sale en la web. Para quitar a alguien, borre su fila.');
  h.setFrozenRows(1);
  return yo;
}

/* ═══ un formulario con sus preguntas ═══ */
function crearFormulario(clave) {
  var F = FORMULARIOS[clave];
  var form = FormApp.create(F.titulo);
  form.setDescription(F.descripcion + ' Para publicar hay que entrar con una cuenta de Google autorizada por el Ayuntamiento.');
  form.setConfirmationMessage(CONFIRMACION);
  /* el correo de quien responde: con él se decide si sale en la web («Personas autorizadas»). En el
     formulario tiene que quedar como «Verificado» (con inicio de sesión de Google): la API no deja
     elegirlo, se comprueba a mano (Léame, PUBLICAR.md). El correo NO pasa a las pestañas publicadas */
  form.setCollectEmail(true);
  form.setAllowResponseEdits(true);       /* «Editar su respuesta» tras enviar: corregir una errata al momento */
  form.setShowLinkToRespondAgain(true);
  form.setProgressBar(false);
  PREGUNTAS[clave].forEach(function (p) {
    var item;
    if (p.tipo === 'fecha') item = form.addDateItem().setIncludesYear(true);
    else if (p.tipo === 'hora') item = form.addTimeItem();
    else if (p.tipo === 'parrafo') item = form.addParagraphTextItem();
    else if (p.tipo === 'lista') item = form.addListItem().setChoiceValues(p.opciones);
    else if (p.tipo === 'opcion') item = form.addMultipleChoiceItem().setChoiceValues(p.opciones);
    else if (p.tipo === 'casilla') item = form.addCheckboxItem().setChoiceValues(p.opciones);
    else {
      item = form.addTextItem();
      if (p.maximo) item.setValidation(FormApp.createTextValidation().setHelpText('Como mucho ' + p.maximo + ' letras.').requireTextLengthLessThanOrEqualTo(p.maximo).build());
      if (p.tipo === 'url') item.setValidation(FormApp.createTextValidation().setHelpText('Pegue el enlace entero, empezando por https://').requireTextIsUrl().build());
    }
    item.setTitle(p.titulo).setHelpText(p.ayuda || '').setRequired(!!p.obligatoria);
  });
  return form;
}

/* ═══ el formulario manda sus respuestas a una pestaña nueva de la hoja: se busca y se renombra ═══ */
function vincular(ss, form, nombre) {
  var antes = SpreadsheetApp.openById(ss.getId()).getSheets().map(function (h) { return h.getSheetId(); });
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  /* la hoja se vuelve a abrir: el objeto de antes no ve la pestaña nueva */
  var hojas = SpreadsheetApp.openById(ss.getId()).getSheets();
  var nueva = hojas.filter(function (h) { return antes.indexOf(h.getSheetId()) < 0; })[0];
  if (!nueva) {
    var id = form.getId();
    nueva = hojas.filter(function (h) { var u = h.getFormUrl(); return u && u.indexOf(id) >= 0; })[0];
  }
  if (!nueva) throw new Error('No encuentro la pestaña de respuestas de «' + form.getTitle() + '». Mire la hoja: si existe «Respuestas de formulario…», siga a mano con PUBLICAR.md.');
  nueva.setName(nombre);
  return nueva;
}

/* ═══ «Estado» y «Autorizada» en las primeras columnas libres, y la cabecera completa ═══
   «Autorizada» es una sola fórmula en la cabecera que se extiende hacia abajo (ARRAYFORMULA): «sí» si
   el correo de la fila está en «Personas autorizadas» (sin mayúsculas ni espacios de más), «no» si no */
function escribirColumnasPropias(hoja, clave) {
  var esperadas = ['Marca temporal', COL_CORREO].concat(PREGUNTAS[clave].map(function (p) { return p.titulo; }));
  var ultima = Math.max(hoja.getLastColumn(), esperadas.length);
  var leidas = hoja.getRange(1, 1, 1, ultima).getValues()[0].map(String);
  /* si Google aún no ha escrito la cabecera, se escribe (con los mismos títulos que pondría él) */
  if (!leidas.some(function (x) { return x; })) {
    hoja.getRange(1, 1, 1, esperadas.length).setValues([esperadas]);
    leidas = esperadas.slice();
  }
  var cabecera = leidas.filter(function (x) { return x; });
  var iCorreo = -1;
  cabecera.forEach(function (t, i) { if (iCorreo < 0 && /correo|e-?mail/i.test(t)) iCorreo = i; });
  if (iCorreo < 0) throw new Error('«' + hoja.getName() + '» no tiene la columna del correo: el formulario no lo está recogiendo.');
  var c = letra(iCorreo + 1);
  hoja.getRange(1, cabecera.length + 1).setValue(COL_ESTADO).setNote('Escriba «oculto» para quitar esta fila de la web sin borrarla. Vacía = publicada.');
  hoja.getRange(1, cabecera.length + 2).setFormula('={"' + COL_AUTORIZADA + '"; ARRAYFORMULA(IF(' + c + '2:' + c + ' = "", "", IF(ISNUMBER(MATCH(LOWER(TRIM(' + c + '2:' + c + ')), ' +
    "LOWER(TRIM('" + AUTORIZADAS + "'!A2:A)), 0)), \"sí\", \"no\")))}")
    .setNote('Se calcula sola: «sí» si el correo de la fila está en «' + AUTORIZADAS + '». Solo las filas con «sí» salen en la web.');
  hoja.setFrozenRows(1);
  return cabecera.concat([COL_ESTADO, COL_AUTORIZADA]);
}

/* ═══ la pestaña que se publica: QUERY con las filas autorizadas y las columnas de la web
   (ni la marca temporal, ni el correo, ni «Autorizada») ═══ */
function crearPestanaPublicable(ss, clave, cabecera) {
  var F = FORMULARIOS[clave];
  var col = function (t) {
    var i = cabecera.indexOf(t);
    if (i < 0) throw new Error('En «' + F.respuestas + '» no está la columna «' + t + '»');
    return letra(i + 1);
  };
  var cols = PREGUNTAS[clave].map(function (p) { return p.titulo; }).concat([COL_ESTADO]).map(col);
  var formula = "=QUERY('" + F.respuestas + "'!A:" + letra(cabecera.length) + ', "select ' + cols.join(', ') +
    ' where ' + col('Título') + ' is not null and ' + col(COL_AUTORIZADA) + " = 'sí'\", 1)";
  var h = ss.insertSheet(F.pestana);
  h.getRange('A1').setFormula(formula);
  h.setFrozenRows(1);
  /* se rellena sola: un aviso antes de tocarla a mano */
  h.protect().setDescription('Se rellena sola desde «' + F.respuestas + '». Corrija allí.').setWarningOnly(true);
  return formula;
}
function letra(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ═══ la pestaña «Léame»: quién publica, los pasos a mano y el bloque para municipio.json ═══ */
function escribirLeame(hoja, json, url) {
  var filas = [
    ['Web del Ayuntamiento: lo que hay aquí'],
    ['Solo sale en la web lo que mandan las personas de la pestaña «' + AUTORIZADAS + '» (entrando en el formulario con esa cuenta de Google). Para añadir a alguien, escriba su correo de Google en una fila nueva; para quitarlo, borre su fila.'],
    ['Las pestañas «Respuestas …» guardan lo que llega de los formularios. Corrija ahí. Para quitar algo de la web, escriba «oculto» en su columna Estado. «borrador» tampoco sale en la web, pero no es privado: se puede leer en la pestaña publicada.'],
    ['Las pestañas «Avisos», «Agenda» y «Noticias» se rellenan solas (solo las filas autorizadas y las columnas que lee la web, sin el correo): no las toque.'],
    ['FALTAN DOS PASOS, A MANO (un script no puede hacerlos):'],
    ['A. En cada uno de los tres formularios: Configuración → Respuestas → «Recopilar direcciones de correo electrónico» → «Verificado» (pide entrar con Google). Si estuviera en la opción en la que cada uno escribe su correo a mano, cualquiera podría escribir uno autorizado.'],
    ['B1. En esta hoja: menú Archivo → Compartir → Publicar en la web.'],
    ['B2. En «Enlace», en el primer desplegable, quite «Documento completo» y marque SOLO «Avisos», «Agenda» y «Noticias» (nunca «' + AUTORIZADAS + '» ni las «Respuestas …»).'],
    ['B3. En el segundo desplegable deje «Página web». Despliegue «Contenido publicado y configuración» y marque «Volver a publicar automáticamente cuando se hagan cambios».'],
    ['B4. Pulse «Publicar» y acepte. (No hace falta copiar el enlace que sale.) NO comparta la hoja con «Cualquier persona con el enlace»: debe seguir como «Restringido».'],
    ['Para municipio.json (páselo a quien mantiene la web):'],
    [json],
    ['Esta hoja: ' + url]
  ];
  hoja.getRange(1, 1, filas.length, 1).setValues(filas);
  hoja.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  hoja.getRange(5, 1).setFontWeight('bold');
  hoja.getRange(11, 1).setFontWeight('bold');
  hoja.setColumnWidth(1, 900);
  hoja.getRange(1, 1, filas.length, 1).setWrap(true);
}

/* ═══ opcional: un correo a la cuenta del Ayuntamiento con cada envío ═══ */
function avisarDeLoPublicado(e) {
  var r = e.response, form = e.source;
  var lineas = r.getItemResponses().map(function (x) { return x.getItem().getTitle() + ': ' + x.getResponse(); });
  var titulo = r.getItemResponses().filter(function (x) { return x.getItem().getTitle() === 'Título'; }).map(function (x) { return x.getResponse(); })[0] || '';
  var quien = '';
  try { quien = r.getRespondentEmail(); } catch (err) {}
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Enviado para la web: ' + titulo,
    'Ha llegado por «' + form.getTitle() + '»' + (quien ? ', de ' + quien : '') + '. Si esa persona está en «' + AUTORIZADAS + '», sale en la web en unos minutos; si no, se queda en la hoja sin publicar.\n\n' +
    lineas.join('\n') + '\n\nPara quitarlo de la web, escriba «oculto» en la columna Estado de su fila en la hoja «' + NOMBRE + '».');
}
