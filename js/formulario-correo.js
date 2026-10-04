/* formulario-correo.js — v3c · transparencia. Lo común de los formularios que preparan un correo al
   Ayuntamiento sin servidor: «Avisar de un problema» (js/incidencia.js) y «Escríbanos» (js/escribanos.js).
   Sin dependencias. Lo cargan solo esas páginas, antes de su script. Sin JavaScript, cada formulario se
   envía tal cual como mailto (enctype text/plain) y el navegador valida los obligatorios.
     · FormularioCorreo.mailto(correo, asunto, lineas): el correo compuesto, con asunto y cuerpo
       codificados para mailto: con encodeURIComponent y saltos de línea CRLF (RFC 6068), y `largo` si la
       dirección pasa de LARGO_MAX caracteres (hay programas de correo que cortan los enlaces largos).
     · FormularioCorreo.montar(op): validación accesible y el paso a «listo». Cada error va en un párrafo
       enlazado al campo con aria-describedby (ya puesto en la plantilla) y el campo lleva aria-invalid;
       arriba, un resumen con un enlace a cada campo recibe el foco. Si todo está bien, enseña el bloque
       «listo» (con el foco) con el enlace mailto y el texto para copiar. Los errores se repintan solo al
       volver a enviar: quitarlos al salir de un campo movía la página bajo el dedo. */
(function () {
  'use strict';
  var LARGO_MAX = 1800;
  function limpio(s) { return String(s || '').replace(/\r\n?/g, '\n').trim(); }
  function mailto(correo, asunto, lineas) {
    var cuerpo = lineas.join('\n').replace(/\n/g, '\r\n');
    var href = 'mailto:' + correo + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
    return { asunto: asunto, cuerpo: cuerpo, href: href, largo: href.length > LARGO_MAX };
  }
  function telefonoMal(s) { var t = limpio(s).replace(/[\s.\-()]/g, ''); return !!t && !/^\+?\d{9,15}$/.test(t); }
  function correoMal(s) { return !!limpio(s) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio(s)); }

  /* op: { form, correo, sel: {errores, lista, listo, mailto, texto, volver, copiar, copiarEstado, avisoLargo},
           leer() → datos, reglas(datos) → [[nombre, elemento al que lleva el resumen, mensaje o null]],
           marcar: {nombre: elemento que recibe aria-invalid (un fieldset)}, componer(datos) → mailto(…),
           alListo(datos, compuesto) (opcional), primero() → elemento que recibe el foco al volver } */
  function montar(op) {
    var $ = function (s) { return document.querySelector(s); };
    var form = op.form, S = op.sel;
    var resumen = $(S.errores), lista = $(S.lista), listo = $(S.listo);
    form.setAttribute('novalidate', '');

    function pintarErrores(reglas) {
      var malas = reglas.filter(function (r) { return r[2]; });
      reglas.forEach(function (r) {
        var p = form.querySelector('[data-error-de="' + r[0] + '"]');
        if (p) { p.textContent = r[2] || ''; p.hidden = !r[2]; }
        var c = (op.marcar && op.marcar[r[0]]) || r[1];
        if (!c) return;
        if (r[2]) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid');
      });
      while (lista.firstChild) lista.removeChild(lista.firstChild);
      malas.forEach(function (r) {
        var li = document.createElement('li'), a = document.createElement('a');
        a.href = '#' + r[1].id;
        a.textContent = r[2];
        a.addEventListener('click', function (e) { e.preventDefault(); r[1].focus(); });
        li.appendChild(a); lista.appendChild(li);
      });
      resumen.hidden = !malas.length;
      return malas.length;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = op.leer();
      if (pintarErrores(op.reglas(d))) { resumen.focus(); return; }
      var c = op.componer(d);
      $(S.mailto).href = c.href;
      $(S.texto).value = 'Para: ' + op.correo + '\nAsunto: ' + c.asunto + '\n\n' + c.cuerpo.replace(/\r\n/g, '\n');
      $(S.avisoLargo).hidden = !c.largo;
      $(S.copiarEstado).textContent = '';
      if (op.alListo) op.alListo(d, c);
      form.hidden = true;
      listo.hidden = false;
      listo.focus();
    });

    $(S.volver).addEventListener('click', function () {
      listo.hidden = true; form.hidden = false;
      op.primero().focus();
    });

    $(S.copiar).addEventListener('click', function () {
      var t = $(S.texto), estado = $(S.copiarEstado);
      var hecho = function () { estado.textContent = 'Texto copiado. Péguelo en un correo nuevo.'; };
      var aMano = function () { t.focus(); t.select(); estado.textContent = 'Texto seleccionado: cópielo con Ctrl+C (o mantenga pulsado en el móvil).'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(hecho, aMano);
      else aMano();
    });
  }

  window.FormularioCorreo = { limpio: limpio, mailto: mailto, telefonoMal: telefonoMal, correoMal: correoMal, montar: montar, LARGO_MAX: LARGO_MAX };
})();
