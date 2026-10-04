/* incidencia.js — v3b · F9. «Avisar de un problema» sin servidor. Solo lo carga incidencia.html, detrás
   de js/formulario-correo.js (v3c: la validación accesible, el mailto y el «listo» son comunes con
   «Escríbanos»). Sin JavaScript, el formulario se envía tal cual como mailto (enctype text/plain) y el
   navegador valida los campos obligatorios.
     · Lo propio de este formulario: qué se pregunta (categoría, dónde, descripción, foto, contacto),
       cómo se escribe el correo (asunto «Aviso de un problema: categoría · dónde») y el recordatorio
       de adjuntar la foto.
     · «Usar mi ubicación» (Geolocation API, solo si existe): añade las coordenadas al texto de
       «¿Dónde?». Ni mapas ni peticiones a nadie.
   window.Incidencia.componer(datos) devuelve { asunto, cuerpo, href, largo } (lo usa verificar.mjs). */
(function () {
  'use strict';
  var form = document.querySelector('[data-incidencia]');
  if (!form || !window.FormularioCorreo) return;
  var FC = window.FormularioCorreo, limpio = FC.limpio;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var correo = form.getAttribute('data-correo');
  var municipio = form.getAttribute('data-municipio');

  var caja = $('[data-ubicacion]');
  if (caja && navigator.geolocation) caja.hidden = false;

  function componer(d) {
    var donde = limpio(d.donde).replace(/\s+/g, ' ');
    var corto = donde.length > 60 ? donde.slice(0, 57).replace(/\s+\S*$/, '') + '…' : donde;
    var asunto = 'Aviso de un problema: ' + d.categoria + (corto ? ' · ' + corto : '');
    var lineas = [
      'Aviso de un problema en la calle', '',
      'Qué pasa: ' + d.categoria,
      'Dónde: ' + limpio(d.donde), '',
      'Descripción:', limpio(d.descripcion), '',
      'Foto: ' + (d.foto ? 'la adjunto a este correo.' : 'no adjunto foto.')
    ];
    var datos = [['Nombre', d.nombre], ['Teléfono', d.telefono], ['Correo', d.correo]].filter(function (x) { return limpio(x[1]); });
    if (datos.length) { lineas.push('', 'Mis datos de contacto:'); datos.forEach(function (x) { lineas.push(x[0] + ': ' + limpio(x[1])); }); }
    lineas.push('', '--', 'Enviado desde «Avisar de un problema» de la web del Ayuntamiento de ' + municipio + '.');
    return FC.mailto(correo, asunto, lineas);
  }
  window.Incidencia = { componer: componer, LARGO_MAX: FC.LARGO_MAX };

  function leer() {
    var cat = form.querySelector('input[name="categoria"]:checked');
    return { categoria: cat ? cat.value : '', donde: form.donde.value, descripcion: form.descripcion.value, foto: form.foto.checked,
      nombre: form.nombre.value, telefono: form.telefono.value, correo: form.correo.value };
  }

  FC.montar({
    form: form, correo: correo, leer: leer, componer: componer,
    sel: { errores: '[data-incidencia-errores]', lista: '[data-incidencia-errores-lista]', listo: '[data-incidencia-listo]', mailto: '[data-incidencia-mailto]',
      texto: '[data-incidencia-texto]', volver: '[data-incidencia-volver]', copiar: '[data-copiar-texto]', copiarEstado: '[data-copiar-estado]', avisoLargo: '[data-aviso-largo]' },
    /* cada regla: [nombre, elemento al que lleva el resumen, mensaje o null] */
    reglas: function (d) {
      return [
        ['categoria', form.querySelector('input[name="categoria"]'), d.categoria ? null : 'Elija qué pasa: alumbrado, agua, limpieza…'],
        ['donde', form.donde, limpio(d.donde).length >= 3 ? null : 'Diga dónde está el problema: la calle y el número, o cómo llegar.'],
        ['descripcion', form.descripcion, limpio(d.descripcion).length >= 10 ? null : 'Cuente qué pasa, con al menos unas palabras (10 letras o más).'],
        ['telefono', form.telefono, FC.telefonoMal(d.telefono) ? 'El teléfono no parece correcto: escriba solo números, por ejemplo 600 123 456.' : null],
        ['correo', form.correo, FC.correoMal(d.correo) ? 'El correo no parece correcto: tiene que ser como nombre@ejemplo.es.' : null]
      ];
    },
    marcar: { categoria: $('#campo-categoria') },
    alListo: function (d) { $('[data-recordar-foto]').hidden = !d.foto; },
    primero: function () { return form.querySelector('input[name="categoria"]:checked, input[name="categoria"]'); }
  });

  var boton = $('[data-usar-ubicacion]'), estadoUb = $('[data-ubicacion-estado]');
  if (boton) boton.addEventListener('click', function () {
    estadoUb.textContent = 'Buscando su ubicación…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude.toFixed(5), lon = pos.coords.longitude.toFixed(5);
      var txt = 'Coordenadas: ' + lat + ', ' + lon;
      var v = form.donde.value.replace(/\s*\(?Coordenadas: [-\d.]+, [-\d.]+\)?/, '').trim();
      form.donde.value = v ? v + ' (' + txt + ')' : txt;
      estadoUb.textContent = 'Añadidas al texto de «¿Dónde?»: ' + lat + ', ' + lon + '. Si puede, escriba también la calle.';
    }, function () {
      estadoUb.textContent = 'No se pudo saber su ubicación (quizá no dio permiso). Escriba la calle a mano.';
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
})();
