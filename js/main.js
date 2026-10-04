/* main.js — lo que hace la web en el navegador. Sin dependencias.
   Todo es mejora progresiva: sin JavaScript la página se lee entera (lo vivo
   viene pintado por scripts/aplicar.mjs con la fecha en que se generó). */
(function () {
  'use strict';
  var html = document.documentElement;
  var D = {};
  try { D = JSON.parse(document.getElementById('datos-vivos').textContent); } catch (e) {}
  var SLUG = D.slug || 'ayto';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var normal = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var guardar = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var leer = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* ═══ lo vivo: se vuelve a pintar con la hora real ═══ */
  function ahora() { return window.Vivo.ahoraEn(D.zona, new Date()); }
  function pintarVivo() {
    if (!window.Vivo || !D.horario) return;
    var a = ahora();
    $$('[data-vivo]').forEach(function (el) {
      var bloque = el.getAttribute('data-vivo');
      var op = {};
      if (el.hasAttribute('data-limite')) op.limite = Number(el.getAttribute('data-limite'));
      if (el.hasAttribute('data-clave')) op.clave = el.getAttribute('data-clave');
      var nuevo = window.Vivo.pintar(bloque, D, a, op);
      /* se compara con lo último que se pintó, no con el DOM (los filtros y el calendario lo tocan):
         así el repintado de cada minuto no se lleva el foco si no ha cambiado nada */
      if ((el.__pintado != null ? el.__pintado : el.innerHTML) !== nuevo) el.innerHTML = nuevo;
      el.__pintado = nuevo;
      if (bloque === 'franja') el.hidden = !nuevo;
      /* v3b · «Plazos abiertos»: sin ninguno abierto, la sección entera fuera (sin hueco) */
      if (bloque === 'plazos' && el.closest('section')) el.closest('section').hidden = !nuevo;
      /* v3c · la lista de avisos propios: sin ninguno, su sección fuera (y sale si llega uno de la hoja) */
      if (bloque === 'avisos' && el.closest('section')) el.closest('section').hidden = !nuevo;
      if (bloque === 'tablon') montarTablon(el);
      if (bloque === 'agenda') montarCalendario(el);
    });
  }

  /* ═══ tablón con filtros: se cuentan filas VISIBLES (memoria «clase de estado
     choca con un bloque»: el estado va en hidden y aria-pressed, no en clases) ═══ */
  function montarTablon(caja) {
    var grupo = $('.filtros', caja);
    if (!grupo) return;
    grupo.hidden = false;
    var limite = Number(caja.getAttribute('data-limite')) || Infinity;
    var activo = caja.getAttribute('data-tema-actual') || '';
    /* v3c · transparencia: «?tema=Empleo» (la ficha «Empleo» de «Hoy») llega con ese filtro puesto */
    if (!caja.hasAttribute('data-tema-actual')) { var q = /[?&]tema=([^&#]*)/.exec(location.search); if (q) activo = decodeURIComponent(q[1].replace(/\+/g, ' ')); }
    function aplicar(tema) {
      caja.setAttribute('data-tema-actual', tema);
      $$('.filtro', grupo).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tema') === tema)); });
      var filas = $$('.tablon__fila', caja), vistas = 0, total = 0;
      filas.forEach(function (f) {
        var casa = !tema || f.getAttribute('data-tema') === tema;
        if (casa) total++;
        f.hidden = !(casa && vistas < limite);
        if (!f.hidden) vistas++;
      });
      var cuenta = $('.tablon__cuenta', caja);
      if (cuenta) {
        cuenta.textContent = tema
          ? (vistas === total ? vistas + (vistas === 1 ? ' aviso' : ' avisos') + ' de «' + tema + '».' : 'Los ' + vistas + ' más recientes de «' + tema + '», de ' + total + '.')
          : (vistas === total ? total + ' avisos y anuncios.' : 'Los ' + vistas + ' más recientes de ' + total + '.');
      }
    }
    if (!grupo.__montado) {
      grupo.__montado = true;
      grupo.addEventListener('click', function (ev) {
        var b = ev.target.closest('.filtro');
        if (!b) return;
        var tema = b.getAttribute('data-tema');
        /* con js/movimiento.js, las filas se recolocan con una View Transition; sin él, igual que siempre */
        if (window.Movimiento && window.Movimiento.transicion) window.Movimiento.transicion(function () { aplicar(tema); }, caja);
        else aplicar(tema);
      });
    }
    var existe = !activo || $$('.filtro', grupo).some(function (b) { return b.getAttribute('data-tema') === activo; });
    aplicar(existe ? activo : '');
  }

  /* ═══ v3 · calendario de la agenda: un mes a la vista y paso al anterior y al siguiente.
     El mes elegido se guarda en la caja, así un repintado (la hoja, el minuto) no lo pierde ═══ */
  function montarCalendario(caja) {
    var cal = $('.calendario', caja);
    if (!cal) return;
    var meses = $$('.calendario__mes', cal);
    if (meses.length < 2) return;
    $('.calendario__nav', cal).hidden = false;
    var claves = meses.map(function (m) { return m.getAttribute('data-mes'); });
    var hoy = cal.getAttribute('data-mes-hoy');
    function mostrar(clave) {
      var i = Math.max(0, claves.indexOf(clave));
      caja.setAttribute('data-mes-actual', claves[i]);
      meses.forEach(function (m, j) { m.hidden = j !== i; });
      $$('[data-cal-paso]', cal).forEach(function (b) {
        var paso = Number(b.getAttribute('data-cal-paso')), destino = claves[i + paso];
        b.setAttribute('aria-disabled', String(!destino));
        $('.sr', b).textContent = (paso < 0 ? 'Mes anterior' : 'Mes siguiente') + (destino ? ': ' + $('caption', meses[i + paso]).textContent : '');
      });
    }
    var guardado = caja.getAttribute('data-mes-actual');
    mostrar(guardado && claves.indexOf(guardado) >= 0 ? guardado : hoy);
    if (!caja.__calendario) {
      caja.__calendario = true;
      caja.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-cal-paso]');
        if (!b || b.getAttribute('aria-disabled') === 'true') return;
        var lista = $$('.calendario__mes', caja).map(function (m) { return m.getAttribute('data-mes'); });
        var i = lista.indexOf(caja.getAttribute('data-mes-actual'));
        var destino = lista[i + Number(b.getAttribute('data-cal-paso'))];
        if (!destino) return;
        caja.setAttribute('data-mes-actual', destino);
        montarCalendario(caja);
        var cal2 = $('.calendario', caja), act = $('.calendario__mes:not([hidden]) caption', cal2);
        $('[data-cal-estado]', cal2).textContent = act ? act.textContent : '';
      });
    }
  }

  /* ═══ el tablón más fresco (lo refresca una tarea diaria en el servidor) ═══ */
  function conTiempo(url, opciones, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 7000);
    if (ctl) opciones.signal = ctl.signal;
    return fetch(url, opciones).finally(function () { clearTimeout(t); });
  }
  function refrescarTablon() {
    if (!D.tablon_json || location.protocol === 'file:') return;
    conTiempo(D.tablon_json, { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (t) {
        if (!t || !t.entradas || !t.actualizado || (D.tablon.actualizado && t.actualizado <= D.tablon.actualizado)) return;
        D.tablon = { actualizado: t.actualizado, entradas: t.entradas };
        pintarVivo();
      })
      .catch(function (e) { if (window.console) console.warn('Tablón: se queda el que venía en la página', e && e.message); });
  }

  /* ═══ hoja de cálculo publicada (memoria «hoja de cálculo como CMS»):
     primero se ve el respaldo, luego se fusiona lo de la hoja. ═══ */
  /* v3c · automatico: leer, sanear y fusionar es el mismo código que usa aplicar.mjs al montar la web
     (js/vivo.js → filasHoja, sanearHoja y fusionarHoja; en Node, scripts/lib/hoja.mjs) */
  function leerHoja(pestana, valida) {
    var u = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(D.hoja.id) + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(pestana);
    return conTiempo(u, { credentials: 'omit' }).then(function (r) { return r.text(); }).then(function (txt) {
      var filas = window.Vivo.filasHoja(txt);
      return valida ? filas.filter(valida) : filas;
    });
  }
  function cargarHoja() {
    if (!D.hoja || !D.hoja.id) return;
    var p = D.hoja.pestanas || {};
    var pares = [['avisos', p.avisos], ['agenda', p.agenda], ['noticias', p.noticias]].filter(function (x) { return x[1]; });
    pares.forEach(function (par) {
      leerHoja(par[1]).then(function (filas) {
        /* un evento nuevo o cambiado de la hoja no tiene .ics escrito: se genera al pulsar (fusionarHoja) */
        var s = window.Vivo.sanearHoja(par[0], filas);
        if (s.avisos.length && window.console) console.warn('Hoja «' + par[1] + '»:\n  ' + s.avisos.join('\n  '));
        D[par[0]] = window.Vivo.fusionarHoja(D[par[0]], s.filas, par[0] === 'agenda'); pintarVivo(); irAlAncla();
      }).catch(function (e) { if (window.console) console.warn('Hoja «' + par[1] + '»: se queda el respaldo', e && e.message); });
    });
    /* pestaña de guardias de farmacia (desde, hasta, farmacia): manda sobre la rotación */
    if (p.farmacias && D.farmacias) {
      leerHoja(p.farmacias, function (o) { return o.desde && o.farmacia; }).then(function (filas) {
        D.farmacias.guardias = filas.filter(function (o) { return !o.oculto; }).map(function (o) { return { desde: o.desde, hasta: o.hasta || null, farmacia: String(o.farmacia) }; })
          .concat(D.farmacias.guardias || []);
        pintarVivo();
      }).catch(function (e) { if (window.console) console.warn('Hoja «' + p.farmacias + '»: se quedan las guardias de la página', e && e.message); });
    }
  }

  /* ═══ v3c · el ancla de un aviso o un acto que llega de la hoja (avisos.html#aviso-<id>): al abrir la
     página aún no existe y el navegador no baja; cuando la hoja lo pinta, se baja una vez ═══ */
  var anclaPendiente = (function () {
    try { var id = decodeURIComponent(location.hash.slice(1)); return id && !document.getElementById(id) ? id : null; } catch (e) { return null; }
  })();
  function irAlAncla() {
    var el = anclaPendiente && document.getElementById(anclaPendiente);
    if (!el) return;
    anclaPendiente = null;
    el.scrollIntoView({ block: 'start' });
  }

  /* ═══ «Añadir a mi calendario» de un evento que llegó de la hoja: el .ics se hace aquí ═══ */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button[data-ics]');
    if (!b || !window.Vivo || !window.Blob || !window.URL) return;
    var id = b.getAttribute('data-ics');
    var e = (D.agenda || []).filter(function (x) { return String(x.id) === id; })[0];
    if (!e) return;
    var url = URL.createObjectURL(new Blob([window.Vivo.ics(e, D, new Date())], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = window.Vivo.archivoIcs(e); a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });

  /* ═══ menú móvil ═══ */
  var menu = $('#menu'), botonMenu = $('[data-boton-menu]');
  function cerrarMenu(devolverFoco) {
    if (!menu.classList.contains('esta-abierto')) return;
    menu.classList.remove('esta-abierto');
    html.classList.remove('menu-abierto');
    botonMenu.setAttribute('aria-expanded', 'false');
    if (devolverFoco) botonMenu.focus();
  }
  if (menu && botonMenu) {
    botonMenu.hidden = false;
    botonMenu.addEventListener('click', function () {
      var abrir = !menu.classList.contains('esta-abierto');
      if (!abrir) return cerrarMenu(true);
      menu.classList.add('esta-abierto');
      html.classList.add('menu-abierto');
      botonMenu.setAttribute('aria-expanded', 'true');
      var primero = $('.menu__enlace', menu);
      if (primero) primero.focus();
    });
    $('[data-cerrar-menu]', menu).addEventListener('click', function () { cerrarMenu(true); });
    document.addEventListener('keydown', function (ev) {
      if (!menu.classList.contains('esta-abierto')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarMenu(true); return; }
      if (ev.key === 'Tab') {     /* el foco no se escapa por detrás del panel */
        var f = $$('a, button', menu).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
        else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
      }
    });
    window.matchMedia('(min-width: 64em)').addEventListener('change', function (m) { if (m.matches) cerrarMenu(false); });
  }

  /* ═══ buscador de trámites ═══ */
  var VACIAS = ' de del la las el los un una unos unas mi mis me que para en y a al por con quiero hacer como pedir solicitar tramite tramites ';
  function cargarDatosTramites(listo) {
    if (window.TRAMITES) return listo();
    var s = document.createElement('script');
    s.src = 'js/tramites-datos.js' + (D.v_datos ? '?v=' + D.v_datos : '');
    s.onload = listo;
    s.onerror = function () { if (window.console) console.warn('No se pudo cargar la lista de trámites'); };
    document.head.appendChild(s);
  }
  function variantes(p) {
    var v = [p];
    var sin = (window.SINONIMOS || {});
    Object.keys(sin).forEach(function (k) { if (normal(k) === p) sin[k].forEach(function (x) { v.push(normal(x)); }); });
    if (p.length > 4 && /s$/.test(p)) v.push(p.slice(0, -1));
    if (p.length >= 7) v.push(p.slice(0, 5));      /* «empadronarme» → «empad», casa con «empadronamiento» */
    return v;
  }
  function buscar(q) {
    var palabras = normal(q).split(/[^a-z0-9ñ@]+/).filter(function (p) { return p.length > 1 && VACIAS.indexOf(' ' + p + ' ') < 0; });
    if (!palabras.length) return [];
    var res = (window.TRAMITES || []).map(function (t) {
      var oficial = normal(t.n), claro = normal((t.c || []).join(' | '));
      var tocadas = 0, puntos = 0;
      palabras.forEach(function (p) {
        var vs = variantes(p);
        var enClaro = vs.some(function (x) { return claro.indexOf(x) >= 0; });
        var enOficial = vs.some(function (x) { return oficial.indexOf(x) >= 0; });
        if (enClaro || enOficial) { tocadas++; puntos += 10 + (enClaro ? 4 : 0) + (oficial.indexOf(p) === 0 ? 1 : 0); }
      });
      return { t: t, tocadas: tocadas, puntos: puntos };
    }).filter(function (x) { return x.tocadas; });
    var max = res.reduce(function (m, x) { return Math.max(m, x.tocadas); }, 0);
    return res.filter(function (x) { return x.tocadas === max; })
      .sort(function (a, b) { return b.puntos - a.puntos || a.t.n.localeCompare(b.t.n, 'es'); })
      .slice(0, 10).map(function (x) { return x.t; });
  }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* v3 · lo encontrado va marcado con <mark>. Se compara igual que busca el buscador (sin tildes ni
     mayúsculas, con sus variantes y sinónimos) y se marca la palabra entera del texto original:
     «empad» marca «Empadronamiento», «boda» marca «Matrimonio» */
  function terminos(q) {
    var t = [];
    normal(q).split(/[^a-z0-9ñ@]+/).filter(function (p) { return p.length > 1 && VACIAS.indexOf(' ' + p + ' ') < 0; })
      .forEach(function (p) { variantes(p).forEach(function (v) { if (v.length > 1 && t.indexOf(v) < 0) t.push(v); }); });
    return t;
  }
  var LETRA = /[\p{L}\p{N}]/u;
  function conMarcas(texto, ts) {
    var plano = '', mapa = [], rangos = [];
    for (var i = 0; i < texto.length; i++) { var n = normal(texto[i]); for (var j = 0; j < n.length; j++) { plano += n[j]; mapa.push(i); } }
    ts.forEach(function (t) {
      for (var k = plano.indexOf(t); k >= 0; k = plano.indexOf(t, k + t.length)) {
        var a = mapa[k], b = mapa[k + t.length - 1] + 1;
        while (a > 0 && LETRA.test(texto[a - 1])) a--;
        while (b < texto.length && LETRA.test(texto[b])) b++;
        rangos.push([a, b]);
      }
    });
    if (!rangos.length) return escHtml(texto);
    rangos.sort(function (x, y) { return x[0] - y[0]; });
    var out = '', pos = 0, unidos = [];
    rangos.forEach(function (r) { var u = unidos[unidos.length - 1]; if (u && r[0] <= u[1]) u[1] = Math.max(u[1], r[1]); else unidos.push(r.slice()); });
    unidos.forEach(function (r) { out += escHtml(texto.slice(pos, r[0])) + '<mark>' + escHtml(texto.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
    return out + escHtml(texto.slice(pos));
  }
  /* ═══ v3b · F8. Buscador global: además de los trámites, los avisos y anuncios del tablón, las
     noticias, los teléfonos y los lugares de «El pueblo». Avisos, tablón y noticias salen de los
     datos vivos de la página (los mismos que pinta vivo.js, con lo que llegue de la hoja o del
     tablón); teléfonos y lugares, de js/tramites-datos.js (window.BUSCAR, generado por aplicar.mjs).
     Con los otros tipos se piden TODAS las palabras (con sus variantes): menos ruido que en los
     trámites, donde gana el que más toca. Resultados agrupados por tipo, los trámites primero ═══ */
  var GRUPOS = [['tramites', 'Trámites'], ['avisos', 'Avisos y anuncios'], ['noticias', 'Noticias'], ['telefonos', 'Teléfonos'], ['lugares', 'El pueblo']];
  var NOMBRES = { tramites: ['trámite', 'trámites'], avisos: ['aviso', 'avisos'], noticias: ['noticia', 'noticias'], telefonos: ['teléfono', 'teléfonos'], lugares: ['lugar', 'lugares'] };
  function palabrasDe(q) { return normal(q).split(/[^a-z0-9ñ@]+/).filter(function (p) { return p.length > 1 && VACIAS.indexOf(' ' + p + ' ') < 0; }); }
  function puntuar(palabras, titulo, resto) {
    var t = normal(titulo), r = normal(resto || ''), puntos = 0;
    for (var i = 0; i < palabras.length; i++) {
      var vs = variantes(palabras[i]);
      var enT = vs.some(function (x) { return t.indexOf(x) >= 0; }), enR = vs.some(function (x) { return r.indexOf(x) >= 0; });
      if (!enT && !enR) return 0;
      puntos += enT ? 3 : 1;
    }
    return puntos;
  }
  function fechaCortaDe(iso) { return window.Vivo && iso ? window.Vivo.fechaCorta(iso) : (iso || ''); }
  function candidatos() {
    var B = window.BUSCAR || {}, c = { avisos: [], noticias: [], telefonos: [], lugares: [] };
    if (window.Vivo && D.horario) {
      window.Vivo.ultimos(D, ahora()).forEach(function (f) {
        c.avisos.push({ titulo: f.titulo, resto: f.tema, sub: fechaCortaDe(f.fecha) + ' · ' + (f.oficial ? 'Tablón oficial' : 'Ayuntamiento'), href: f.href,
          sr: f.oficial ? ', se abre la sede electrónica' : '', icono: f.oficial ? 'i-salida' : 'i-flecha' });
      });
    }
    (D.noticias || []).filter(function (n) { return !n.oculto; }).forEach(function (n) {
      c.noticias.push({ titulo: n.titulo, resto: n.resumen, sub: fechaCortaDe(n.fecha) + (n.resumen ? ' · ' + n.resumen : ''), href: (D.rutas && D.rutas.noticia || 'noticia-{id}.html').replace('{id}', n.id), sr: '', icono: 'i-flecha' });
    });
    (B.telefonos || []).forEach(function (t) { c.telefonos.push({ titulo: t.n, resto: [t.g, t.d].join(' '), sub: [t.t, t.g].filter(Boolean).join(' · '), href: t.h, sr: '', icono: 'i-telefono' }); });
    (B.lugares || []).forEach(function (l) { c.lugares.push({ titulo: l.n, resto: l.x, sub: l.x, href: l.h, sr: '', icono: 'i-flecha' }); });
    return c;
  }
  function buscarTodo(q) {
    var palabras = palabrasDe(q), r = { tramites: buscar(q) };
    var c = candidatos();
    Object.keys(c).forEach(function (k) {
      r[k] = palabras.length ? c[k].map(function (x) { return { x: x, p: puntuar(palabras, x.titulo, x.resto) }; }).filter(function (y) { return y.p; })
        .sort(function (a, b) { return b.p - a.p; }).map(function (y) { return y.x; }) : [];
    });
    return r;
  }
  function cuantos(n, k) { return n + ' ' + NOMBRES[k][n === 1 ? 0 : 1]; }
  function enumerar(xs) { return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : xs[0] || ''; }
  function montarBuscador(caja, n) {
    var campo = $('[data-buscador-campo]', caja), lista = $('[data-buscador-resultados]', caja), cuenta = $('[data-buscador-cuenta]', caja);
    if (!campo) return;
    /* el de la portada enseña pocos (data-buscador-max, contando todos los grupos) y manda el resto
       a la página de trámites; el nivel de los títulos de grupo depende de dónde está el buscador */
    var max = Number(caja.getAttribute('data-buscador-max')) || 0;
    var nivel = Math.min(6, Math.max(2, Number(lista.getAttribute('data-buscador-nivel')) || 3));
    var pref = 'bg' + n;
    var espera;
    campo.addEventListener('input', function () {
      clearTimeout(espera);
      espera = setTimeout(function () {
        var q = campo.value.trim();
        if (!q) { lista.innerHTML = ''; cuenta.textContent = ''; return; }
        cargarDatosTramites(function () {
          var todo = buscarTodo(q), ts = terminos(q);
          var otros = GRUPOS.slice(1).filter(function (g) { return todo[g[0]].length; });
          /* tope por grupo: con max (portada), los trámites ceden un sitio a cada uno de los dos
             primeros grupos con algo; sin max, 10 trámites y 5 de cada lo demás */
          var tope = {};
          if (max) {
            var reserva = Math.min(2, otros.length);
            tope.tramites = Math.min(todo.tramites.length, max - reserva);
            var libres = max - tope.tramites;
            otros.forEach(function (g) { tope[g[0]] = libres > 0 ? 1 : 0; libres -= tope[g[0]]; });
            otros.forEach(function (g) { var mas = Math.min(todo[g[0]].length - tope[g[0]], libres); tope[g[0]] += mas; libres -= mas; });
          } else {
            tope.tramites = 10;
            otros.forEach(function (g) { tope[g[0]] = 5; });
          }
          var vistos = 0, hallados = 0, partes = [], html_ = '';
          GRUPOS.forEach(function (g) {
            var k = g[0], todos = todo[k] || [], r = todos.slice(0, tope[k] || 0);
            hallados += todos.length;
            if (!r.length) return;
            vistos += r.length;
            partes.push(cuantos(r.length, k));
            var id = pref + '-' + k;
            html_ += '<h' + nivel + ' class="resultados__titulo" id="' + id + '">' + g[1] + '</h' + nivel + '><ul class="resultados__lista" aria-labelledby="' + id + '">' + r.map(function (x) {
              if (k === 'tramites') {
                var claro = (x.c && x.c[0]) ? x.c[0].split(' · ')[0] : '';
                return '<li><a href="' + escHtml(x.h) + '"><span class="resultado__nombre">' + conMarcas(claro || x.n, ts) + '</span>' +
                  (claro && normal(claro) !== normal(x.n) ? '<span class="resultado__oficial">' + conMarcas(x.n, ts) + '</span>' : '') +
                  '<span class="sr">' + escHtml(x.s) + '</span><svg class="icono" aria-hidden="true"><use href="#i-salida"/></svg></a></li>';
              }
              return '<li><a href="' + escHtml(x.href) + '"><span class="resultado__nombre">' + conMarcas(x.titulo, ts) + '</span>' +
                (x.sub ? '<span class="resultado__oficial">' + conMarcas(String(x.sub), ts) + '</span>' : '') +
                (x.sr ? '<span class="sr">' + escHtml(x.sr) + '</span>' : '') + '<svg class="icono" aria-hidden="true"><use href="#' + x.icono + '"/></svg></a></li>';
            }).join('') + '</ul>';
          });
          /* M8 · «Ver todos»: a la página de trámites con lo escrito (allí se busca solo) */
          var accion = caja.getAttribute('action');
          if (max && hallados > vistos && accion) html_ += '<p class="resultados__todos"><a href="' + escHtml(accion.replace(/#.*$/, '') + '?q=' + encodeURIComponent(q) + (accion.indexOf('#') >= 0 ? accion.slice(accion.indexOf('#')) : '')) + '">Ver los ' + hallados + ' resultados</a></p>';
          lista.innerHTML = html_;
          cuenta.textContent = !vistos ? 'No hay ningún resultado con esas palabras. Pruebe con otras o mire la lista completa de trámites.'
            : hallados > vistos ? hallados + ' resultados encontrados; aquí, los ' + vistos + ' primeros (' + enumerar(partes) + '). «Buscar» los enseña todos.'
            : (vistos === 1 ? '1 resultado encontrado: ' : vistos + ' resultados encontrados: ') + enumerar(partes) + '.';
        });
      }, 160);
    });
  }
  $$('[data-buscador-pagina], #buscador').forEach(function (caja, i) { montarBuscador(caja, i); });
  /* llega del buscador de la portada (?q=…): se escribe en el de la página y se busca */
  (function () {
    var q = null;
    try { q = new URLSearchParams(location.search).get('q'); } catch (e) {}
    var campo = q && $('[data-buscador-pagina] [data-buscador-campo]');
    if (!campo || campo.closest('form[action]')) return;
    campo.value = q.slice(0, 120);
    campo.dispatchEvent(new Event('input'));
  })();
  var dialogo = $('#buscador');
  $$('[data-abrir-buscador]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (!dialogo || typeof dialogo.showModal !== 'function') return;     /* sin <dialog>: va a la página */
      ev.preventDefault();
      cerrarMenu(false);
      cargarDatosTramites(function () {});
      dialogo.showModal();
      $('[data-buscador-campo]', dialogo).focus();
    });
  });
  if (dialogo) {
    dialogo.addEventListener('click', function (ev) { if (ev.target === dialogo) dialogo.close(); });
    /* en un campo de búsqueda, Chrome gasta el primer Esc en vaciarlo: aquí Esc cierra siempre */
    dialogo.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); dialogo.close(); } });
  }

  /* ═══ filtro de «Todos los trámites» ═══ */
  $$('[data-filtro-lista]').forEach(function (caja) {
    var lista = document.getElementById(caja.getAttribute('data-filtro-lista'));
    var campo = $('input', caja), cuenta = $('[data-filtro-cuenta]', caja);
    caja.hidden = false;
    campo.addEventListener('input', function () {
      var palabras = normal(campo.value).split(/\s+/).filter(Boolean), n = 0;
      $$('li', lista).forEach(function (li) {
        var t = li.getAttribute('data-texto');
        li.hidden = !palabras.every(function (p) { return t.indexOf(p) >= 0; });
        if (!li.hidden) n++;
      });
      cuenta.textContent = palabras.length ? (n === 1 ? 'Se ve 1 trámite.' : 'Se ven ' + n + ' trámites.') : '';
      revisarIndice(lista);
    });
  });

  /* ═══ v3 · índice A–Z de «Todos los trámites»: refleja lo que deja el filtro (una letra sin
     trámites a la vista pierde el enlace y sale del orden de tabulación) y, al saltar, el foco va
     a la letra de la lista, que queda por debajo del índice fijo (scroll-margin-top) ═══ */
  function revisarIndice(lista) {
    var nav = lista && $('[data-az="' + lista.id + '"]');
    if (!nav) return;
    $$('[data-letra]', lista).forEach(function (g) {
      var hay = $$('li', g).some(function (li) { return !li.hidden; });
      g.hidden = !hay;
      var a = $('a[data-letra="' + g.getAttribute('data-letra') + '"]', nav);
      if (!a) return;
      if (hay) { a.setAttribute('href', '#' + g.getAttribute('data-letra')); a.parentNode.removeAttribute('aria-hidden'); }
      else { a.removeAttribute('href'); a.parentNode.setAttribute('aria-hidden', 'true'); }
    });
  }
  $$('[data-az]').forEach(function (nav) {
    nav.addEventListener('click', function (ev) {
      var a = ev.target.closest('a[href^="#"]');
      var destino = a && document.getElementById(a.getAttribute('href').slice(1));
      if (!destino) return;
      /* el salto lo hace el navegador (con el ancla en la dirección); después, el foco */
      setTimeout(function () { destino.focus({ preventScroll: true }); }, 0);
    });
  });

  /* ═══ v3 · índice «En esta página»: aria-current en la sección que se está leyendo.
     IntersectionObserver sobre cada h2 con umbral 0 y la franja del 30 % de arriba (memoria
     «IntersectionObserver en sección alta»: nunca un % de una sección alta); la cuenta se hace
     con la posición de los h2. Al llegar al pie, la última. Es contenido, no movimiento: también
     con movimiento reducido ═══ */
  (function () {
    var enlaces = $$('.indice__lista a[href^="#"]');
    if (!enlaces.length || !('IntersectionObserver' in window)) return;
    var titulos = [];
    enlaces.forEach(function (a) { var t = document.getElementById(a.getAttribute('href').slice(1)); if (t && titulos.indexOf(t) < 0) titulos.push(t); });
    if (!titulos.length) return;
    var pie = $('footer'), pieVisible = false;
    function marcar() {
      var limite = innerHeight * 0.3, actual = titulos[0], ultimo = titulos[titulos.length - 1];
      titulos.forEach(function (t) { if (t.getBoundingClientRect().top <= limite) actual = t; });
      if (pieVisible && ultimo.getBoundingClientRect().top < innerHeight * 0.85) actual = ultimo;
      enlaces.forEach(function (a) {
        if (a.getAttribute('href') === '#' + actual.id) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }
    /* la franja de arriba (pasar de sección) y la pantalla entera (la última, que no llega arriba) */
    var io = new IntersectionObserver(marcar, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    var io2 = new IntersectionObserver(marcar, { threshold: [0, 1] });
    titulos.forEach(function (t) { io.observe(t); io2.observe(t); });
    if (pie) new IntersectionObserver(function (e) { pieVisible = e[e.length - 1].isIntersecting; marcar(); }, { threshold: [0, .25, .5, .75, 1] }).observe(pie);
    marcar();
  })();

  /* ═══ contenedores que desbordan: focusables solo si desbordan (PLIEGO §5) ═══ */
  function revisarDesborde(el) {
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute('tabindex', '0'); else el.removeAttribute('tabindex');
  }
  $$('[data-desborda]').forEach(function (el) {
    revisarDesborde(el);
    if (window.ResizeObserver) new ResizeObserver(function () { revisarDesborde(el); }).observe(el);
  });

  /* ═══ mapa bajo clic ═══ */
  $$('[data-cargar-mapa]').forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var caja = b.closest('.mapa');
      var f = document.createElement('iframe');
      f.src = caja.getAttribute('data-mapa');
      f.title = caja.getAttribute('data-mapa-titulo') || 'Mapa';
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      caja.innerHTML = '';
      caja.classList.add('con-mapa');
      caja.appendChild(f);
    });
  });

  /* ═══ aviso de cookies ═══ */
  var cookies = $('#cookies');
  var alAceptarCookies = [];
  function cookiesVisibles() { return cookies && !cookies.hidden; }
  if (cookies) {
    if (leer(SLUG + '-cookies') !== 'ok') cookies.hidden = false;
    $('[data-aceptar-cookies]', cookies).addEventListener('click', function () {
      guardar(SLUG + '-cookies', 'ok');
      cookies.hidden = true;
      alAceptarCookies.forEach(function (fn) { fn(); });
    });
  }

  /* [MANDO DE MAQUETA] inicio */
  /* Mando de la reunión: solo con ?revision; se aparta mientras está el aviso
     de cookies. Lo borra scripts/quitar_mandos.py. */
  var mando = $('#mando');
  if (mando && html.classList.contains('en-revision')) {
    mando.hidden = cookiesVisibles();
    alAceptarCookies.push(function () { mando.hidden = false; });
    var marcar = function () {
      $$('[data-densidad]', mando).forEach(function (b) { b.setAttribute('aria-pressed', String(html.classList.contains('densidad-' + b.getAttribute('data-densidad')))); });
      var p = html.getAttribute('data-paleta') || 'a';
      $$('[data-paleta]', mando).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-paleta') === p)); });
    };
    mando.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-densidad')) {
        var d = b.getAttribute('data-densidad');
        html.classList.remove('densidad-puerta', 'densidad-sobria');
        html.classList.add('densidad-' + d);
        guardar(SLUG + '-densidad', d);
      } else if (b.hasAttribute('data-paleta')) {
        var p = b.getAttribute('data-paleta');
        if (p === 'a') html.removeAttribute('data-paleta'); else html.setAttribute('data-paleta', p);
        guardar(SLUG + '-paleta', p);
      }
      marcar();
    });
    marcar();
  }
  /* [MANDO DE MAQUETA] fin */

  /* ═══ cortina: si js/cortina.js no la ha cogido (sin GSAP, o no llegó), fuera ═══ */
  window.addEventListener('load', function () {
    if (html.classList.contains('con-cortina') && !window.__cortinaViva) {
      clearTimeout(window.__cortinaSeguro);
      html.classList.remove('con-cortina');
    }
  });

  pintarVivo();
  refrescarTablon();
  cargarHoja();
  setInterval(pintarVivo, 60000);
})();
