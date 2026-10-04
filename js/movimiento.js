/* movimiento.js — el movimiento que necesita JavaScript. Sin dependencias.
   Va después de main.js (defer, en orden), cuando lo vivo ya está pintado.

   Mejora progresiva estricta: nada empieza oculto. Cada animación se crea al
   vuelo y solo pone su «desde» mientras corre (WAAPI con fill: backwards o una
   clase que añade una animación CSS). Si esto no carga, falla o el navegador
   pide movimiento reducido, la página se queda exactamente como viene.
     · window.Movimiento.transicion(fn, caja): los filtros del tablón con
       document.startViewTransition (lo llama main.js; sin soporte, fn() a secas)
     · las fichas de la tira «Hoy» entran escalonadas cuando la tira asoma
       (y nunca mientras está la cortina)
     · (la entrada del hero sin cortina es CSS: html.entrada-hero, en
       css/movimiento.css; la pone el <head>)
     · los escaños del hemiciclo aparecen en orden al entrar en pantalla
     · el borde de oro del mes en curso se dibuja al entrar en pantalla (v3)

     · v3: el perfil del pueblo del pie se traza al asomar
     · v3b: el plano del pie se dibuja al asomar, del Ayuntamiento hacia fuera
     · la foto de la noticia que se abre desde la portada se transforma en la
       del artículo (pageswap / pagereveal de las View Transitions) */
(function () {
  'use strict';
  var html = document.documentElement;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var quieto = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function hayMovimiento() { return !quieto.matches; }
  var SALIDA = 'cubic-bezier(.22, 1, .36, 1)';

  /* ═══ 22. filtros del tablón: las filas se recolocan en vez de saltar ═══ */
  var enCurso = 0;
  function transicion(fn, caja) {
    if (!hayMovimiento() || typeof document.startViewTransition !== 'function') { fn(); return; }
    var n = ++enCurso;
    var filas = caja ? $$('.tablon__fila', caja) : [];
    /* nombres únicos solo mientras dura: fuera de la transición no pintan nada */
    filas.forEach(function (f, i) { f.style.viewTransitionName = 'mov-tablon-' + i; });
    html.classList.add('mov-tablon');
    var limpiar = function () {
      if (n !== enCurso) return;
      html.classList.remove('mov-tablon');
      filas.forEach(function (f) { f.style.viewTransitionName = ''; });
    };
    try {
      var t = document.startViewTransition(fn);
      t.finished.then(limpiar, limpiar);
    } catch (e) { limpiar(); fn(); }
  }
  window.Movimiento = { transicion: transicion };

  if (!hayMovimiento()) return;

  /* ═══ 21. las fichas de «Hoy» entran escalonadas ═══
     La tira va bajo el hero: las fichas suben 12 px una tras otra cuando la tira
     asoma, y nunca mientras está la cortina (esperan a que se vaya, venga de
     cortina.js, de main.js o de la red de seguridad del <head>). Las animaciones
     se crean al vuelo en ese momento: hasta entonces no hay nada puesto, así que
     si la tira se pasa de largo con la rueda o el observador no llega a avisar,
     las fichas siguen en su sitio. Total: 90 + 3 × 70 + 480 = 780 ms como mucho */
  function animarFichas() {
    $$('.hoy__fila').forEach(function (f, i) {
      if (typeof f.animate !== 'function') return;
      f.animate([{ transform: 'translateY(12px)' }, { transform: 'none' }],
        { duration: 480, delay: 90 + Math.min(i, 3) * 70, easing: SALIDA, fill: 'backwards' });
    });
  }
  var tira = document.querySelector('.hoy-tira');
  if (tira && 'IntersectionObserver' in window) {
    var asoma = false, hecho = false;
    var probar = function () {
      if (hecho || !asoma || html.classList.contains('con-cortina')) return;
      hecho = true;
      vigia.disconnect(); obsCortina.disconnect();
      animarFichas();
    };
    /* umbral 0 y 40 px de margen por abajo: en cuanto asoma de verdad (memoria
       «IntersectionObserver en sección alta») */
    var vigia = new IntersectionObserver(function (e) { asoma = e.some(function (x) { return x.isIntersecting; }); probar(); },
      { rootMargin: '0px 0px -40px 0px', threshold: 0 });
    vigia.observe(tira);
    var obsCortina = new MutationObserver(probar);
    obsCortina.observe(html, { attributes: true, attributeFilter: ['class'] });
  }

  /* ═══ 23. escaños del hemiciclo, en orden, una vez ═══ */
  var figuras = $$('.pleno__figura').filter(function (f) { return f.querySelector('circle'); });
  if (figuras.length && 'IntersectionObserver' in window) {
    figuras.forEach(function (f) { $$('circle', f).forEach(function (c, i) { c.style.setProperty('--i', i); }); });
    /* umbral 0 y 40 px de margen: arranca justo antes de asomar (memoria
       «IntersectionObserver en sección alta») */
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('mov-escanos');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px 40px 0px', threshold: 0 });
    figuras.forEach(function (f) { io.observe(f); });
  }

  /* ═══ v3 · M6. el borde de oro del mes en curso se dibuja al asomar, una vez ═══
     La clase va en la lista (vivo.js repinta los meses con innerHTML y se perdería en el mes).
     Se observa el mes, no la sección (memoria «IntersectionObserver en sección alta»). */
  var meses = $$('.anio').filter(function (l) { return l.querySelector('.es-mes-actual'); });
  if (meses.length && 'IntersectionObserver' in window) {
    var ioMes = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var lista = e.target.closest('.anio');
        if (lista) lista.classList.add('mov-mes');
        ioMes.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });
    meses.forEach(function (l) { ioMes.observe(l.querySelector('.es-mes-actual')); });
  }

  /* ═══ v3. el perfil del pueblo del pie se traza una vez, al asomar ═══
     Margen 0: arranca con el primer píxel a la vista (arriba del perfil solo hay cielo) */
  var perfiles = $$('.pie__perfil').filter(function (p) { return p.querySelector('path'); });
  if (perfiles.length && 'IntersectionObserver' in window) {
    var ioPerfil = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('mov-perfil');
        ioPerfil.unobserve(e.target);
      });
    }, { rootMargin: '0px', threshold: 0 });
    perfiles.forEach(function (p) { ioPerfil.observe(p); });
  }

  /* ═══ v3b · M9. el plano del pie se dibuja una vez al asomar, desde el Ayuntamiento ═══
     Umbral 0 y 40 px de margen por abajo: arranca cuando el plano ya asoma de verdad */
  var planos = $$('.pie__plano').filter(function (p) { return p.querySelector('path[pathLength]'); });
  if (planos.length && 'IntersectionObserver' in window) {
    var ioPlano = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('mov-plano');
        ioPlano.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0 });
    planos.forEach(function (p) { ioPlano.observe(p); });
  }

  /* ═══ 15. la foto de la noticia viaja de la portada al artículo ═══
     En el listado y en el artículo el nombre viene en la plantilla. En la
     portada, la línea de tiempo la repinta main.js cada minuto: el nombre se
     pone al salir, solo a la foto de la noticia pulsada. */
  function idNoticia(url) { var m = String(url || '').match(/noticia-([a-z0-9-]+)\.html/i); return m ? m[1] : null; }
  function nombrarFoto(id) {
    if (!id) return;
    var nombre = 'noticia-' + id;
    if ($$('.noticia__foto, .linea__foto, .articulo__foto').some(function (f) { return f.style.viewTransitionName === nombre; })) return;
    $$('a[href$="noticia-' + id + '.html"]').some(function (a) {
      var item = a.closest('.linea__item, .noticia, li');
      var foto = item && item.querySelector('.linea__foto, .noticia__foto');
      if (!foto || foto.style.viewTransitionName) return false;
      foto.style.viewTransitionName = nombre;
      return true;
    });
  }
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    nombrarFoto(idNoticia(e.activation.entry.url));
  });
  /* de vuelta a la portada (atrás): solo si este script llega antes del primer
     pintado; si no, la página entra con el fundido normal */
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition || !window.navigation || !navigation.activation || !navigation.activation.from) return;
    nombrarFoto(idNoticia(navigation.activation.from.url));
  });
})();
