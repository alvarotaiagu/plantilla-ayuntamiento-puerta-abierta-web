/* identidad.js — v3: el hemiciclo que resalta un grupo y la hoja de teléfonos para imprimir.
   Sin dependencias. No es movimiento: funciona igual con movimiento reducido (la única
   transición, la de la opacidad de los escaños, está en css/movimiento.css y solo con
   movimiento). Sin JavaScript, el hemiciclo se ve entero y quieto, y el botón de imprimir no
   sale (la hoja de impresión sigue funcionando con Ctrl+P).
     · M4. Hemiciclo: al pasar el ratón o llevar el foco a un grupo de la leyenda (o el ratón
       por su tarjeta de concejales), se atenúan los escaños de los demás y el centro dice
       cuántos son de ese grupo. Cada grupo de la leyenda es un botón con aria-pressed: pulsado,
       el resaltado se queda (para el móvil, que no tiene «pasar el ratón», y para comparar).
       Esc lo suelta. Vale para cualquier número de grupos: los escaños llevan data-grupo.
     · v3b · M11. Los escaños del grupo PULSADO llevan .es-saltado: con movimiento, dan un salto
       pequeño hacia el centro del hemiciclo (css/movimiento.css, translate ≤ 300 ms) y vuelven a su
       sitio al soltarlo. Cada escaño sabe hacia dónde: --salto-x/--salto-y, calculados aquí desde su
       centro y el del hemiciclo (data-centro). El texto del centro no se mueve nunca.
     · F1. Teléfonos: el botón «Imprimir los teléfonos» (window.print) y la fecha de impresión
       de la hoja. Al imprimir cualquier página se abren los desplegables y luego se cierran. */
(function () {
  'use strict';
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ═══ M4. hemiciclo ═══ */
  $$('.pleno').forEach(function (pleno) {
    var svg = pleno.querySelector('svg.hemiciclo');
    var items = $$('.pleno__leyenda li[data-grupo]', pleno);
    if (!svg || !items.length) return;
    var escanos = $$('circle[data-grupo]', svg);
    var seccion = pleno.parentElement;
    var tarjetas = $$('.grupo[data-grupo]', seccion);
    var total = svg.querySelector('.hemiciclo__total'), rotulo = svg.querySelector('.hemiciclo__rotulo');
    var original = total && rotulo ? [total.textContent, rotulo.textContent] : null;
    var fijo = null, vista = null;
    /* M11: el vector de cada escaño hacia el centro, de SALTO unidades del dibujo */
    var SALTO = 7, centro = (svg.getAttribute('data-centro') || '150 150').split(' ').map(Number);
    escanos.forEach(function (c) {
      var dx = centro[0] - Number(c.getAttribute('cx')), dy = centro[1] - Number(c.getAttribute('cy')), d = Math.sqrt(dx * dx + dy * dy) || 1;
      c.style.setProperty('--salto-x', (dx / d * SALTO).toFixed(2) + 'px');
      c.style.setProperty('--salto-y', (dy / d * SALTO).toFixed(2) + 'px');
    });
    var ayuda = seccion.querySelector('[data-pleno-ayuda]');
    if (ayuda) ayuda.hidden = false;

    function pintar() {
      var g = vista || fijo;
      if (g) pleno.setAttribute('data-resalta', g); else pleno.removeAttribute('data-resalta');
      var n = 0;
      escanos.forEach(function (c) {
        var si = c.getAttribute('data-grupo') === g; c.classList.toggle('es-resaltado', si); if (si) n++;
        c.classList.toggle('es-saltado', !!fijo && g === fijo && si);
      });
      items.forEach(function (li) {
        var clave = li.getAttribute('data-grupo');
        li.classList.toggle('es-resaltado', clave === g);
        li.querySelector('.pleno__boton').setAttribute('aria-pressed', clave === fijo ? 'true' : 'false');
      });
      tarjetas.forEach(function (t) { t.classList.toggle('es-resaltado', t.getAttribute('data-grupo') === g); });
      /* el centro del hemiciclo lo dice también con cifras: la información no depende del color */
      if (original) {
        var li = g && items.filter(function (x) { return x.getAttribute('data-grupo') === g; })[0];
        total.textContent = g ? String(n) : original[0];
        rotulo.textContent = g && li ? 'de ' + li.getAttribute('data-sigla') : original[1];
      }
    }

    items.forEach(function (li) {
      var clave = li.getAttribute('data-grupo');
      /* el contenido de la leyenda pasa a un botón: mismo tamaño, sin salto */
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pleno__boton';
      b.setAttribute('aria-pressed', 'false');
      if (ayuda && ayuda.id) b.setAttribute('aria-describedby', ayuda.id);
      while (li.firstChild) b.appendChild(li.firstChild);
      li.appendChild(b);
      b.addEventListener('click', function () { fijo = fijo === clave ? null : clave; pintar(); });
      b.addEventListener('focus', function () { vista = clave; pintar(); });
      b.addEventListener('blur', function () { if (vista === clave) { vista = null; pintar(); } });
      li.addEventListener('mouseenter', function () { vista = clave; pintar(); });
      li.addEventListener('mouseleave', function () { if (vista === clave) { vista = null; pintar(); } });
      b.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (fijo || vista)) { fijo = null; vista = null; pintar(); } });
    });
    tarjetas.forEach(function (t) {
      var clave = t.getAttribute('data-grupo');
      t.addEventListener('mouseenter', function () { vista = clave; pintar(); });
      t.addEventListener('mouseleave', function () { if (vista === clave) { vista = null; pintar(); } });
    });
  });

  /* ═══ F1. teléfonos para la nevera ═══ */
  var caja = document.querySelector('[data-imprimir-caja]');
  if (caja && typeof window.print === 'function') {
    caja.hidden = false;
    caja.querySelector('[data-imprimir]').addEventListener('click', function () { window.print(); });
  }
  var cuando = $$('[data-fecha-impresion]');
  function fechar() {
    var hoy;
    try { hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }); } catch (e) { hoy = new Date().toLocaleDateString(); }
    cuando.forEach(function (el) { el.textContent = 'Impreso el ' + hoy + '.'; });
  }
  if (cuando.length) fechar();
  /* al imprimir, los desplegables se abren (lo cerrado no saldría en el papel) y luego vuelven */
  var abiertos = [];
  window.addEventListener('beforeprint', function () {
    if (cuando.length) fechar();
    abiertos = $$('details:not([open])');
    abiertos.forEach(function (d) { d.open = true; });
  });
  window.addEventListener('afterprint', function () { abiertos.forEach(function (d) { d.open = false; }); abiertos = []; });
})();
