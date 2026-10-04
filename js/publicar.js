/* publicar.js — «Publicar en la web» (publicar.html, v3c · guia). Sin dependencias y sin red.
   · Las muestras de «Así se ve»: un aviso urgente, uno programado, uno informativo, un acto y una
     noticia, pintados con las piezas de verdad (js/vivo.js → franja, hoy, tablon, agenda, linea), con
     los datos de esta web (horario, farmacia…) y la fecha real.
   · El simulador «Pruébelo»: lo que se escribe en el formulario de prueba se pinta al momento en la
     franja, en la ficha «Último aviso» de «Hoy» y en el tablón, igual que lo haría la web. No se
     envía nada (el formulario no tiene acción ni botón de enviar, y el envío se anula), y el lector
     de pantalla oye un resumen cuando se deja de escribir.
   Lo pintado es una muestra: los enlaces y botones se vuelven texto (no llevan a ningún sitio), los
   títulos de las piezas pasan a párrafos (no rompen el orden de títulos de la página) y no quedan id.
   Sin JavaScript, la página se lee entera; solo faltan las muestras y el simulador. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  function arrancar() {
    var V = window.Vivo, D = null;
    try { D = JSON.parse(document.getElementById('datos-vivos').textContent); } catch (e) {}
    if (!V || !D) return;
    var ahora = V.ahoraEn(D.zona, new Date());
    function dia(n) {
      var p = ahora.iso.split('-').map(Number);
      return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
    }
    /* los datos de la web con solo lo que se enseña: nada de lo publicado de verdad se mezcla */
    function datos(extra) {
      var x = {};
      Object.keys(D).forEach(function (k) { x[k] = D[k]; });
      x.avisos = []; x.agenda = []; x.noticias = []; x.tablon = { actualizado: null, entradas: [] };
      Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
      return x;
    }
    /* de lo que pinta vivo.js, la pieza que se quiere, ya «quieta» */
    function pieza(html, sel) {
      var t = document.createElement('template');
      t.innerHTML = html;
      var el = t.content.querySelector(sel);
      return el ? quieta(el) : null;
    }
    function quieta(el) {
      $$('a, button', el).forEach(function (a) {
        var s = document.createElement('span');
        s.className = ((a.getAttribute('class') || '') + ' publicar-muestra__enlace').trim();
        s.innerHTML = a.innerHTML;
        a.parentNode.replaceChild(s, a);
      });
      $$('h1, h2, h3, h4, h5, h6', el).forEach(function (h) {
        var p = document.createElement('p');
        p.className = h.getAttribute('class') || '';
        p.innerHTML = h.innerHTML;
        h.parentNode.replaceChild(p, h);
      });
      [el].concat($$('[id]', el)).forEach(function (x) { x.removeAttribute('id'); });
      return el;
    }
    function poner(caja, el) {
      if (!caja) return;
      caja.textContent = '';
      if (el) caja.appendChild(el);
    }
    function franja(aviso) {
      var t = document.createElement('template');
      t.innerHTML = V.pintar('franja', datos({ avisos: [aviso] }), ahora);
      var f = t.content.firstElementChild;
      return f ? quieta(f) : null;
    }

    /* ═══ las muestras de «Así se ve» ═══ */
    var muestras = $('[data-muestras]');
    if (muestras) {
      var urgente = { id: 'muestra-urgente', fecha: ahora.iso, tema: 'Agua', gravedad: 'urgente', caduca: ahora.iso,
        titulo: 'Avería: sin agua en la calle Mayor hasta las 14:00' };
      var programado = { id: 'muestra-programado', fecha: ahora.iso, tema: 'Obras', gravedad: 'programado', caduca: dia(2),
        titulo: 'Corte de luz en el polígono el ' + V.fechaLarga(dia(2)) + ', de 8:00 a 10:00' };
      var informativo = { id: 'muestra-informativo', fecha: ahora.iso, tema: 'Cultura', gravedad: 'informativo',
        titulo: 'Abierto el plazo para apuntarse a la escuela de música' };
      var acto = { id: 'muestra-acto', fecha: dia(5), hora: '20:30', titulo: 'Concierto de la banda municipal', lugar: 'Plaza del Ayuntamiento', nota: 'Entrada libre.' };
      var noticia = { id: 'muestra-noticia', fecha: dia(-1), titulo: 'Así fue la jornada de puertas abiertas del colegio', resumen: 'Familias y vecinos recorrieron las aulas nuevas.' };
      poner($('[data-muestra="franja-urgente"]'), franja(urgente));
      poner($('[data-muestra="franja-programado"]'), franja(programado));
      var hoy = V.pintar('hoy', datos({ avisos: [urgente], agenda: [acto] }), ahora), cajaHoy = $('[data-muestra="hoy"]');
      if (cajaHoy) {
        cajaHoy.textContent = '';
        [pieza(hoy, '.hoy__fila--aviso'), pieza(hoy, '.hoy__fila--agenda')].forEach(function (x) { if (x) cajaHoy.appendChild(x); });
      }
      poner($('[data-muestra="tablon"]'), pieza(V.pintar('tablon', datos({ avisos: [informativo] }), ahora), '.tablon__fila'));
      poner($('[data-muestra="evento"]'), pieza(V.pintar('agenda', datos({ agenda: [acto] }), ahora), '.evento'));
      poner($('[data-muestra="noticia"]'), pieza(V.pintar('linea', datos({ noticias: [noticia] }), ahora), '.linea__item--noticia'));
      muestras.hidden = false;
    }

    /* ═══ el simulador «Pruébelo» ═══ */
    var sim = $('[data-simulador]');
    if (!sim) return;
    var form = $('[data-simulador-form]', sim);
    var campo = function (n) { return form.elements[n]; };
    var estado = $('[data-sim-estado]', sim), vacio = $('[data-sim-vacio]', sim), vista = $('[data-sim-vista]', sim), nota = $('[data-sim-nota]', sim);
    var NOMBRE = { urgente: 'urgente', programado: 'programado', informativo: 'informativo' };
    function porDefecto() { campo('fecha').value = ahora.iso; campo('caduca').value = ahora.iso; }
    /* por qué no sale en la franja (lo mismo que mira vivo.js → destacados) */
    function sinFranja(a) {
      if (a.gravedad === 'informativo') return 'Un aviso informativo no sale en la franja: va al tablón y a «Hoy».';
      if (!a.caduca) return 'Sin «Caduca» (el último día), un aviso ' + a.gravedad + ' no sale en la franja: solo en el tablón y en «Hoy».';
      if (a.caduca < ahora.iso) return 'El último día de la franja ya ha pasado: no saldría en la franja, ni en el tablón.';
      return '';
    }
    var hablar = null;
    function pintar() {
      var titulo = campo('titulo').value.trim();
      var a = {
        id: 'simulacion', tema: 'Aviso', titulo: titulo, titulo_corto: campo('titulo_corto').value.trim() || null,
        gravedad: (form.querySelector('input[name="gravedad"]:checked') || {}).value || 'informativo',
        fecha: campo('fecha').value || ahora.iso, caduca: campo('caduca').value || null
      };
      vacio.hidden = !!titulo;
      vista.hidden = !titulo;
      clearTimeout(hablar);
      if (!titulo) { estado.textContent = ''; return; }
      var f = franja(a), porque = sinFranja(a);
      var notas = [];
      if (porque) notas.push(porque);
      if (titulo.length > 70 && !a.titulo_corto && f) notas.push('El título pasa de 70 letras: en el móvil la franja lo enseña entero, en varias líneas. Rellene «Título corto».');
      if (a.caduca && a.caduca < a.fecha) notas.push('«Caduca» es anterior a la fecha del aviso: revise las fechas.');
      poner($('[data-sim-franja]', sim), f);
      nota.textContent = notas.join(' ');
      nota.hidden = !notas.length;
      var hoy = V.pintar('hoy', datos({ avisos: [a] }), ahora);
      poner($('[data-sim-hoy]', sim), pieza(hoy, '.hoy__fila--aviso'));
      poner($('[data-sim-tablon]', sim), pieza(V.pintar('tablon', datos({ avisos: [a] }), ahora), '.tablon__fila'));
      /* donde no saldría, ni el rótulo: lo explica la nota */
      $$('[data-sim-bloque]', sim).forEach(function (b) { b.hidden = !$('[data-sim-franja], [data-sim-hoy], [data-sim-tablon]', b).firstChild; });
      /* el resumen para el lector de pantalla, cuando se deja de escribir (no letra a letra) */
      var dicho = 'Simulación, no se publica nada. Aviso ' + NOMBRE[a.gravedad] + ': «' + titulo + '». ' +
        (f ? 'Saldría arriba en todas las páginas, en la franja ' + (a.gravedad === 'urgente' ? 'roja' : 'ámbar') + '. ' : (porque ? porque + ' ' : '')) +
        (a.caduca && a.caduca < ahora.iso ? '' : 'En la portada, como último aviso de «Hoy», y en el tablón.');
      hablar = setTimeout(function () { estado.textContent = dicho; }, 700);
    }
    form.addEventListener('submit', function (ev) { ev.preventDefault(); pintar(); });
    form.addEventListener('input', pintar);
    form.addEventListener('change', pintar);
    form.addEventListener('reset', function () { setTimeout(function () { porDefecto(); pintar(); }, 0); });
    porDefecto();
    $$('[data-sin-js]').forEach(function (p) { p.hidden = true; });
    sim.hidden = false;
    pintar();
  }
  /* este archivo va en el <head> con defer: vivo.js (al final del <body>) aún no ha llegado */
  if (window.Vivo) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
