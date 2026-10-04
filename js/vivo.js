/* vivo.js — lo que cambia solo: abierto o cerrado, el panel «Hoy», la franja
   urgente, el tablón, la línea de tiempo, el año y la agenda.

   El MISMO código pinta en dos sitios:
   - scripts/aplicar.mjs lo ejecuta en Node al generar la web, con la fecha del
     día: así la página se lee entera sin JavaScript;
   - js/main.js lo vuelve a ejecutar en el navegador con la hora real (y con lo
     que llegue de la hoja de cálculo o del tablón), porque una página generada
     el lunes no sabe que hoy es jueves.
   Solo funciones puras que devuelven HTML. Nada de DOM aquí. */
(function (raiz) {
  'use strict';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var EJEMPLO = '<span class="ejemplo">Ejemplo</span>';
  var SEDE = '<span class="sr">, se abre la sede electrónica</span>';
  function marcaEjemplo(x, clave) { return x && x.ejemplo ? ' data-dato-ejemplo="' + esc(clave) + '"' : ''; }

  /* La hora en el pueblo, no en el ordenador de quien mira. */
  function ahoraEn(zona, fecha) {
    var f = fecha || new Date();
    var partes = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: zona || 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
      .formatToParts(f).forEach(function (p) { partes[p.type] = p.value; });
    var dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var h = Number(partes.hour) % 24;
    return { iso: partes.year + '-' + partes.month + '-' + partes.day, dia: dias[partes.weekday], min: h * 60 + Number(partes.minute), anio: Number(partes.year), mes: Number(partes.month) };
  }

  function partes(iso) { var p = iso.split('-').map(Number); return { a: p[0], m: p[1], d: p[2] }; }
  function diaSemana(iso) { var p = partes(iso); return new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay(); }
  function sumarDias(iso, n) {
    var p = partes(iso); var d = new Date(Date.UTC(p.a, p.m - 1, p.d + n));
    return d.toISOString().slice(0, 10);
  }
  function fechaLarga(iso, ahora) {
    var p = partes(iso);
    var t = DIAS[diaSemana(iso)] + ' ' + p.d + ' de ' + MESES[p.m - 1];
    if (ahora && p.a !== ahora.anio) t += ' de ' + p.a;
    return t;
  }
  function fechaCorta(iso) { var p = partes(iso); return p.d + ' ' + MESES_C[p.m - 1] + ' ' + p.a; }
  function cuando(iso, ahora) {
    if (iso === ahora.iso) return 'Hoy';
    if (iso === sumarDias(ahora.iso, 1)) return 'Mañana';
    if (iso === sumarDias(ahora.iso, -1)) return 'Ayer';
    var t = fechaLarga(iso, ahora);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function hora(h) { return h ? String(h).replace(/^0(\d)/, '$1') : ''; }
  function aMin(h) { var p = h.split(':'); return Number(p[0]) * 60 + Number(p[1]); }

  /* ── abierto o cerrado, desde tramos {dias:[1..7] (1 = lunes), de, a} ── */
  function estado(tramos, ahora) {
    if (!tramos || !tramos.length) return null;
    var dia = ahora.dia === 0 ? 7 : ahora.dia;
    for (var i = 0; i < tramos.length; i++) {
      var t = tramos[i];
      if (t.dias.indexOf(dia) >= 0 && ahora.min >= aMin(t.de) && ahora.min < aMin(t.a)) {
        return { abierto: true, texto: 'Abierto ahora', detalle: 'cierra a las ' + hora(t.a) };
      }
    }
    for (var n = 0; n < 8; n++) {
      var dn = ((dia - 1 + n) % 7) + 1;
      var hoyTramos = tramos.filter(function (t) { return t.dias.indexOf(dn) >= 0 && (n > 0 || aMin(t.de) > ahora.min); })
        .sort(function (a, b) { return aMin(a.de) - aMin(b.de); });
      if (hoyTramos.length) {
        var cuandoAbre = n === 0 ? 'hoy' : n === 1 ? 'mañana' : 'el ' + DIAS[dn % 7];
        return { abierto: false, texto: 'Cerrado ahora', detalle: 'abre ' + cuandoAbre + ' a las ' + hora(hoyTramos[0].de) };
      }
    }
    return { abierto: false, texto: 'Cerrado ahora', detalle: '' };
  }
  function estadoHtml(tramos, ahora, clase) {
    var e = estado(tramos, ahora);
    if (!e) return '';
    return '<p class="' + (clase || 'estado') + ' ' + (e.abierto ? 'esta-abierto' : 'esta-cerrado') + '"><span class="estado__punto" aria-hidden="true"></span><b>' + e.texto + '</b>' + (e.detalle ? ' · ' + e.detalle : '') + '</p>';
  }

  /* ── colecciones ordenadas ── */
  function avisosVigentes(D, ahora) {
    return (D.avisos || []).filter(function (a) { return !a.oculto && (!a.caduca || a.caduca >= ahora.iso); })
      .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
  }
  /* gravedad de un aviso: «urgente» (rojo), «programado» o «informativo» (ámbar). Sin el campo,
     un aviso con `urgente: true` (los de antes) es urgente y los demás, informativos */
  var GRAVEDAD = { urgente: 'Urgente', programado: 'Programado', informativo: 'Informativo' };
  function gravedad(a) {
    var g = String((a && a.gravedad) || '').toLowerCase().trim();
    return GRAVEDAD[g] ? g : (a && a.urgente ? 'urgente' : 'informativo');
  }
  function urgentes(D, ahora) {
    return destacados(D, ahora).filter(function (a) { return gravedad(a) === 'urgente'; });
  }
  /* los de la franja de arriba: con fecha de caducidad y urgentes o programados (lo urgente, primero) */
  function destacados(D, ahora) {
    return avisosVigentes(D, ahora).filter(function (a) { return a.caduca && a.caduca >= ahora.iso && (a.urgente || gravedad(a) !== 'informativo'); })
      .sort(function (a, b) { return (gravedad(b) === 'urgente') - (gravedad(a) === 'urgente') || b.fecha.localeCompare(a.fecha); });
  }
  function eventoPendiente(e, ahora) {
    if (e.fecha > ahora.iso) return true;
    if (e.fecha < ahora.iso) return false;
    return !e.hora || aMin(e.hora) >= ahora.min - 60;      /* lo de hoy sigue «próximo» hasta una hora después de empezar */
  }
  function agendaCompleta(D) {
    return (D.agenda || []).filter(function (e) { return !e.oculto; }).slice()
      .sort(function (a, b) { return (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')); });
  }
  function proximos(D, ahora, n) {
    var lim = sumarDias(ahora.iso, 366);
    return agendaCompleta(D).filter(function (e) { return eventoPendiente(e, ahora) && e.fecha <= lim; }).slice(0, n || 99);
  }
  function pasados(D, ahora) {
    return agendaCompleta(D).filter(function (e) { return !eventoPendiente(e, ahora) && e.origen !== 'fiesta'; }).reverse();
  }
  function enlaceEvento(e, D) { return D.rutas.agenda + '#evento-' + e.id; }
  function enlaceAviso(a, D) { return D.rutas.avisos + '#aviso-' + a.id; }
  function enlaceNoticia(n, D) { return D.rutas.noticia.replace('{id}', n.id); }

  /* ── franja urgente (todas las páginas) ── */
  function franja(D, ahora) {
    var u = destacados(D, ahora)[0];
    if (!u) return '';
    /* toda la franja es un solo enlace, con el color de su gravedad: rojo solo lo urgente; lo
       programado, en ámbar. La palabra («Urgente:», «Programado:») y el icono lo dicen
       también sin color. El texto no se recorta: en móvil cabe en dos líneas (para eso está
       `titulo_corto`, si el título es largo) y «Ver aviso» se queda en la flecha. El color va en
       el envoltorio y el foco se dibuja por dentro: por fuera, el blanco caería sobre la cal */
    var g = gravedad(u), urg = g === 'urgente';
    return '<div class="franja-urgente__fondo es-' + g + '"><a class="franja-urgente__enlace" href="' + esc(enlaceAviso(u, D)) + '"' + marcaEjemplo(u, 'aviso:' + u.id) + '>' +
      '<span class="contenedor franja-urgente__dentro">' + icono(urg ? 'i-aviso' : 'i-calendario') +
      '<span class="franja-urgente__texto"><b>' + (urg ? 'Urgente' : g === 'programado' ? 'Programado' : 'Aviso') + ':</b> ' + esc(u.titulo_corto || u.titulo) +
      (u.ejemplo ? ' ' + EJEMPLO : '') + '</span>' +
      ' <span class="franja-urgente__ver"><span class="franja-urgente__ver-texto">Ver aviso</span>' + icono('i-flecha') + '</span></span></a></div>';
  }

  /* ── lo que se añadió al panel «Hoy»: farmacia de guardia, el tiempo, el próximo
     pleno, la recogida y el canal de avisos. Cada cosa sale solo si hay datos. ── */
  function normalTexto(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  function telHref(t) { var d = String(t).replace(/\D/g, ''); return 'tel:' + (d.length === 9 ? '+34' + d : d); }
  function diasEntre(a, b) { var p = partes(a), q = partes(b); return Math.round((Date.UTC(q.a, q.m - 1, q.d) - Date.UTC(p.a, p.m - 1, p.d)) / 864e5); }
  function cuandoMin(iso, ahora) {      /* «mañana», «hoy» o «el martes 6 de octubre», para ir dentro de una frase */
    if (iso === ahora.iso) return 'hoy';
    if (iso === sumarDias(ahora.iso, 1)) return 'mañana';
    return 'el ' + fechaLarga(iso, ahora);
  }
  var FUERA = '<span class="sr">, se abre otra web</span>';
  function icono(id) { return '<svg class="icono" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

  /* Farmacia de guardia. Un «día de guardia» va de la hora de cambio (09:30 si no se
     dice) a la misma hora del día siguiente: a las 9:29 del martes sigue la del lunes.
     Primero mandan las fechas sueltas (`guardias`, también desde la hoja); si ninguna
     cubre el día, la rotación (`rotacion`: inicio, cada cuántos días y el orden). */
  function farmaciaDeGuardia(F, ahora) {
    if (!F || !F.lista || !F.lista.length) return null;
    var cambio = F.cambio || '09:30';
    var dia = ahora.min >= aMin(cambio) ? ahora.iso : sumarDias(ahora.iso, -1);
    function buscar(clave) {
      var n = normalTexto(clave);
      for (var i = 0; i < F.lista.length; i++) if (F.lista[i].id === clave || normalTexto(F.lista[i].nombre) === n) return F.lista[i];
      return null;
    }
    var gs = (F.guardias || []).filter(function (g) { return g && g.desde && g.desde <= dia && (g.hasta || g.desde) >= dia && buscar(g.farmacia); })
      .sort(function (a, b) { return b.desde.localeCompare(a.desde); });     /* la más concreta (la que empieza más tarde) gana */
    if (gs.length) return { farmacia: buscar(gs[0].farmacia), hasta: sumarDias(gs[0].hasta || gs[0].desde, 1), cambio: cambio };
    var R = F.rotacion;
    if (R && R.inicio && R.orden && R.orden.length) {
      var cada = Number(R.dias) || 7, k = Math.floor(diasEntre(R.inicio, dia) / cada);
      var f = buscar(R.orden[((k % R.orden.length) + R.orden.length) % R.orden.length]);
      if (f) return { farmacia: f, hasta: sumarDias(R.inicio, (k + 1) * cada), cambio: cambio };
    }
    return null;
  }
  function filaFarmacia(D, ahora) {
    var F = D.farmacias;
    if (!F) return '';
    var g = farmaciaDeGuardia(F, ahora), of = F.oficial && F.oficial.url ? F.oficial : null;
    if (!g && !of) return '';
    var h = '<li class="hoy__fila hoy__fila--farmacia"' + (g ? marcaEjemplo(F, 'farmacia') : '') + '>' + etiquetaHoy('i-farmacia', 'Farmacia de guardia');
    if (g) {
      var f = g.farmacia;
      var donde = [f.direccion ? esc(f.direccion) + (f.localidad ? ' (' + esc(f.localidad) + ')' : '') : esc(f.localidad || ''),
        f.telefono ? '<a href="' + telHref(f.telefono) + '">' + esc(f.telefono) + '</a>' : ''].filter(Boolean).join(' · ');
      h += '<p class="hoy__valor"><b>' + esc(f.nombre) + '</b>' + (F.ejemplo ? ' ' + EJEMPLO : '') + '</p>' +
        (donde ? '<p class="hoy__nota">' + donde + '</p>' : '') +
        '<p class="hoy__nota">De guardia hasta ' + cuandoMin(g.hasta, ahora) + ' a las ' + hora(g.cambio) + '</p>' +
        (of ? '<p class="hoy__nota hoy__mas"><a href="' + esc(of.url) + '">Todas las guardias, en la web del ' + esc(of.nombre) + FUERA + '</a></p>' : '');
    } else {
      h += '<p class="hoy__valor hoy__valor--enlace"><a href="' + esc(of.url) + '">Consulte la de hoy en la web del ' + esc(of.nombre) + FUERA + '</a></p>';
    }
    return h + '</li>';
  }
  /* la cabecera de cada ficha: el icono en su círculo y lo que es («Farmacia de guardia») */
  function etiquetaHoy(id, texto) {
    return '<p class="hoy__etiqueta"><span class="hoy__icono">' + icono(id) + '</span><span class="hoy__etiqueta-texto">' + texto + '</span></p>';
  }

  /* recogida de enseres, basura, poda…: días de la semana (1 = lunes) o fechas sueltas */
  function proximaRecogida(r, ahora) {
    for (var n = 0; n < 92; n++) {
      var iso = sumarDias(ahora.iso, n), ds = diaSemana(iso) || 7;
      if ((r.dias || []).indexOf(ds) >= 0 || (r.fechas || []).indexOf(iso) >= 0) return iso;
    }
    return null;
  }
  function breveRecogida(r, ahora) {
    var iso = proximaRecogida(r, ahora);
    if (!iso && !r.como) return '';
    var cuando_ = !iso ? '' : iso === ahora.iso ? 'toca hoy' + (r.hora ? ', ' + esc(r.hora) : '') : 'la próxima, ' + esc(cuandoMin(iso, ahora));
    var como = [r.como ? esc(r.como) + (r.telefono ? ': <a href="' + telHref(r.telefono) + '">' + esc(r.telefono) + '</a>' : '') : (r.telefono ? 'Teléfono <a href="' + telHref(r.telefono) + '">' + esc(r.telefono) + '</a>' : ''),
      r.tramite ? '<a href="' + esc(r.tramite) + '">' + esc(r.tramite_texto || 'Pedirla en la sede') + (r.tramite_sr ? '<span class="sr">' + esc(r.tramite_sr) + '</span>' : '') + '</a>' : ''].filter(Boolean).join(' · ');
    return '<li class="hoy__breve' + (iso === ahora.iso ? ' es-hoy-recogida' : '') + '"' + marcaEjemplo(r, 'recogida:' + r.id) + '><b>' + esc(r.nombre) + ':</b> ' + cuando_ + (r.ejemplo ? ' ' + EJEMPLO : '') +
      (como ? '<span class="hoy__nota">' + como + '</span>' : '') + '</li>';
  }
  function proximoPleno(D, ahora) { return proximos(D, ahora).filter(function (e) { return e.tipo === 'pleno'; })[0] || null; }
  function brevePleno(D, ahora) {
    var p = proximoPleno(D, ahora);
    if (!p) return '';
    return '<li class="hoy__breve"' + marcaEjemplo(p, 'evento:' + p.id) + '><b>Próximo pleno:</b> <a href="' + esc(enlaceEvento(p, D)) + '">' + esc(cuando(p.fecha, ahora)) + (p.hora ? ', ' + hora(p.hora) : '') + '<span class="sr">, ' + esc(p.titulo) + '</span></a>' + (p.ejemplo ? ' ' + EJEMPLO : '') +
      '<span class="hoy__nota">' + esc(p.titulo) + (p.lugar ? '<span class="hoy__mas"> · ' + esc(p.lugar) + '</span>' : '') +
      (p.convocatoria ? ' · <a href="' + esc(p.convocatoria) + '">Convocatoria<span class="sr"> del pleno' + esc(p.convocatoria_sr || ', se abre otra web') + '</span></a>' : '') +
      ' · ' + icsHtml(p, D, true) + '</span></li>';
  }
  /* «Más hoy», debajo de las fichas: el tiempo, el pleno (solo el mismo día) y la recogida en
     líneas cortas, y el dato de la sede (solo en la versión sobria). Cada cosa, solo con datos.
     El próximo pleno y el canal de avisos, con su detalle, van en el lado del tablón (lado) */
  function pieHoy(D, ahora) {
    var breves = [];
    if (D.tiempo && D.tiempo.url) breves.push('<li class="hoy__breve"><b>El tiempo:</b> <a href="' + esc(D.tiempo.url) + '">previsión de AEMET para ' + esc(D.tiempo.lugar) + FUERA + '</a></li>');
    var pleno = proximoPleno(D, ahora);
    if (pleno && pleno.fecha === ahora.iso) breves.push(brevePleno(D, ahora));
    (D.recogida || []).slice(0, 2).forEach(function (r) { breves.push(breveRecogida(r, ahora)); });
    breves = breves.filter(Boolean);
    var mas = breves.length ? '<div class="hoy__mas-hoy"><p class="hoy__etiqueta hoy__etiqueta--mas">' + icono('i-mas') + 'Más hoy</p><ul class="hoy__breves">' + breves.join('') + '</ul></div>' : '';
    /* solo en la sobria: el dato en vez del dibujo */
    var sede = '<p class="hoy__sede solo-sobria">' + icono('i-sede') + '<span><b>Sede electrónica:</b> <a href="' + esc(D.rutas.tramites) + '">' + D.tramites_sede + ' trámites en la sede, las 24 horas</a></span></p>';
    return '<div class="hoy__pie' + (mas ? '' : ' solo-sobria') + '">' + mas + sede + '</div>';
  }

  /* ── «Añadir a mi calendario»: un .ics por evento (RFC 5545) ──
     aplicar.mjs escribe ics/<id>.ics con esta misma función; los eventos que llegan de
     la hoja de cálculo no tienen archivo y main.js lo genera con un Blob al pulsar. */
  var VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Madrid', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  function icsTexto(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function octetos(ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  function plegar(linea) {       /* como mucho 75 octetos por línea; se sigue con CRLF + espacio, sin partir un carácter */
    var out = [], actual = '', n = 0;
    Array.from(linea).forEach(function (ch) {
      var o = octetos(ch);
      if (n + o > 75) { out.push(actual); actual = ' '; n = 1; }
      actual += ch; n += o;
    });
    out.push(actual);
    return out.join('\r\n');
  }
  function icsFecha(iso) { return iso.replace(/-/g, ''); }
  function archivoIcs(e) { return normalTexto(e.id).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) + '.ics'; }
  function ics(e, D, sello) {
    var s = (sello || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ayuntamiento de ' + icsTexto(D.nombre) + '//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (e.hora) l = l.concat(VTIMEZONE);
    l.push('BEGIN:VEVENT', 'UID:' + archivoIcs(e).replace(/\.ics$/, '') + '@' + (D.slug || 'ayuntamiento') + '.agenda', 'DTSTAMP:' + s);
    if (e.hora) {
      var ini = aMin(e.hora), fin = e.hora_fin && aMin(e.hora_fin) > ini ? aMin(e.hora_fin) : ini + 60;
      var diaFin = sumarDias(e.fecha, Math.floor(fin / 1440)), mFin = fin % 1440;
      var hhmm = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0') + '00'; };
      l.push('DTSTART;TZID=Europe/Madrid:' + icsFecha(e.fecha) + 'T' + hhmm(ini), 'DTEND;TZID=Europe/Madrid:' + icsFecha(diaFin) + 'T' + hhmm(mFin));
    } else {
      l.push('DTSTART;VALUE=DATE:' + icsFecha(e.fecha), 'DTEND;VALUE=DATE:' + icsFecha(sumarDias(e.fecha, 1)));
    }
    l.push('SUMMARY:' + icsTexto(e.titulo));
    if (e.lugar) l.push('LOCATION:' + icsTexto(e.lugar + ', ' + D.nombre));
    var desc = [e.nota, e.convocatoria ? 'Convocatoria: ' + e.convocatoria : ''].filter(Boolean).join('\n');
    if (desc) l.push('DESCRIPTION:' + icsTexto(desc));
    if (D.web) l.push('URL:' + D.web + D.rutas.agenda + '#evento-' + encodeURIComponent(e.id));
    l.push('END:VEVENT', 'END:VCALENDAR');
    return l.map(plegar).join('\r\n') + '\r\n';
  }
  /* enlace al archivo si lo escribió aplicar.mjs; si no (viene de la hoja), un botón */
  function icsHtml(e, D, enFrase) {
    /* en el panel, corto; el nombre accesible dice siempre qué evento y que es un archivo .ics */
    var dentro = 'Añadir a mi calendario ' + (enFrase ? '<span class="sr">(archivo .ics)</span>' : '<span class="evento__ics-tipo">(archivo .ics)</span>') + '<span class="sr">: «' + esc(e.titulo) + '»</span>';
    var clase = enFrase ? 'enlace-ics' : 'evento__ics';
    var ic = enFrase ? '' : icono('i-calendario');
    return e.ics ? '<a class="' + clase + '" href="' + esc(e.ics) + '" download="' + esc(archivoIcs(e)) + '">' + ic + '<span>' + dentro + '</span></a>'
      : '<button type="button" class="' + clase + '" data-ics="' + esc(e.id) + '">' + ic + '<span>' + dentro + '</span></button>';
  }

  /* ── panel «Hoy en …» ── */
  /* «Hoy en …»: una tira a todo lo ancho bajo el hero. Cuatro fichas como un tablero (Ayuntamiento,
     farmacia de guardia, lo próximo de la agenda y el último aviso) y «Más hoy» debajo. Una ficha
     sin datos no sale y la rejilla se reparte entre las que quedan: nunca un hueco */
  function hoy(D, ahora) {
    var h = '<h2 class="hoy__titulo" id="hoy-titulo">Hoy en ' + esc(D.nombre_corto) + ' <span class="hoy__fecha">' + esc(fechaLarga(ahora.iso)) + '</span></h2><ul class="hoy__lista">';
    /* Ayuntamiento: abierto o cerrado ahora (se calcula) y el horario */
    var e = estado(D.horario.tramos, ahora);
    h += '<li class="hoy__fila hoy__fila--ayto"' + marcaEjemplo(D.horario, 'horario') + '>' + etiquetaHoy('i-reloj', 'Ayuntamiento') +
      (e ? '<p class="hoy__valor hoy__estado ' + (e.abierto ? 'esta-abierto' : 'esta-cerrado') + '"><span class="estado__punto" aria-hidden="true"></span><b>' + e.texto + '</b>' +
        (e.detalle ? '<span class="hoy__detalle"> · ' + e.detalle + '</span>' : '') + '</p>' : '') +
      '<p class="hoy__nota">' + esc(D.horario.texto) + (D.horario.ejemplo ? ' ' + EJEMPLO : '') + '</p></li>';
    /* farmacia de guardia: lo segundo que más se busca un domingo */
    h += filaFarmacia(D, ahora);
    /* agenda: 1 en la versión cargada, 3 en la sobria (CSS oculta .hoy__mas).
       Los plenos van en «Más hoy», no aquí, para no salir dos veces */
    var prox = proximos(D, ahora).filter(function (ev) { return ev.tipo !== 'pleno'; }).slice(0, 3);
    h += '<li class="hoy__fila hoy__fila--agenda">' + etiquetaHoy('i-calendario', 'Lo próximo en la agenda');
    if (!prox.length) h += '<p class="hoy__nota">No hay nada anunciado estos días.</p>';
    else {
      h += '<ul class="hoy__eventos">' + prox.map(function (ev, i) {
        return '<li class="hoy__evento' + (i ? ' hoy__mas' : '') + '"' + marcaEjemplo(ev, 'evento:' + ev.id) + '><p class="hoy__valor hoy__valor--enlace"><a href="' + esc(enlaceEvento(ev, D)) + '">' + esc(ev.titulo) + '</a>' + (ev.ejemplo ? ' ' + EJEMPLO : '') + '</p>' +
          '<p class="hoy__cuando">' + esc(cuando(ev.fecha, ahora)) + (ev.hora ? ', ' + hora(ev.hora) : '') + (ev.lugar ? ' · ' + esc(ev.lugar) : '') + '</p></li>';
      }).join('') + '</ul>';
    }
    h += '</li>';
    /* último aviso: propio (con su gravedad: rojo solo si es urgente) o del tablón oficial */
    var ult = ultimos(D, ahora)[0];
    if (ult) {
      var g = ult.oficial ? null : ult.gravedad;
      h += '<li class="hoy__fila hoy__fila--aviso' + (g ? ' es-' + g : '') + '"' + marcaEjemplo(ult, 'aviso:' + ult.id) + '>' +
        etiquetaHoy('i-tablon', 'Último aviso') + (g ? '<p class="hoy__gravedad"><span class="chip chip--' + g + '">' + GRAVEDAD[g] + '</span></p>' : '') +
        '<p class="hoy__valor hoy__valor--enlace"><a href="' + esc(ult.href) + '">' + esc(ult.titulo) + (ult.oficial ? SEDE : '') + '</a>' + (ult.ejemplo ? ' ' + EJEMPLO : '') + '</p>' +
        '<p class="hoy__cuando">' + esc(cuando(ult.fecha, ahora)) + (ult.oficial ? ' · Tablón oficial' : '') + '</p></li>';
    }
    /* v3c · transparencia (F23): «Empleo», al final y solo si hay una oferta con el plazo abierto */
    h += filaEmpleo(D, ahora);
    return h + '</ul>' + pieHoy(D, ahora);
  }

  /* ── v3b · plazos con cuenta atrás (avisos y anuncios del tablón) ──
     `plazo_inicio` y `plazo_fin` (AAAA-MM-DD, opcionales) se cuentan con la fecha de Madrid: el
     día de cierre entero es «Último día» y al día siguiente, «Plazo cerrado». Antes del inicio,
     «Abre mañana» o «Abre el …». La palabra dice el estado (no solo el color), y el lector de
     pantalla oye además la fecha exacta. `plazo_ejemplo: true` pone la etiqueta «Ejemplo» */
  function plazo(x, ahora) {
    if (!x || (!x.plazo_fin && !x.plazo_inicio)) return null;
    var hoyIso = ahora.iso, ini = x.plazo_inicio || null, fin = x.plazo_fin || null;
    if (ini && ini > hoyIso) {
      return { estado: 'abre', dias: diasEntre(hoyIso, ini), texto: ini === sumarDias(hoyIso, 1) ? 'Abre mañana' : 'Abre el ' + fechaLarga(ini, ahora), fecha: ini };
    }
    if (!fin) return { estado: 'abierto', dias: null, texto: 'Plazo abierto', fecha: null };
    if (fin < hoyIso) return { estado: 'cerrado', dias: diasEntre(fin, hoyIso), texto: 'Plazo cerrado', fecha: fin };
    var n = diasEntre(hoyIso, fin);
    return { estado: n === 0 ? 'ultimo' : 'abierto', dias: n, texto: n === 0 ? 'Último día' : n === 1 ? 'Queda 1 día' : 'Quedan ' + n + ' días', fecha: fin };
  }
  function plazoAbierto(p) { return !!p && (p.estado === 'abierto' || p.estado === 'ultimo'); }
  function chipPlazo(x, ahora, clave) {
    var p = plazo(x, ahora);
    if (!p) return '';
    var sr = p.estado === 'abre' ? '' : p.estado === 'cerrado' ? ': terminó el ' + fechaLarga(p.fecha, ahora) : p.fecha ? ', hasta el ' + fechaLarga(p.fecha, ahora) + ' incluido' : '';
    return '<span class="plazo plazo--' + p.estado + '" data-plazo="' + p.estado + '"' + (x.plazo_ejemplo ? ' data-dato-ejemplo="plazo:' + esc(clave) + '"' : '') + '>' +
      '<svg class="icono plazo__icono" aria-hidden="true"><use href="#i-reloj"/></svg><span class="plazo__texto">' + esc(p.texto) + (sr ? '<span class="sr">' + esc(sr) + '</span>' : '') + '</span>' +
      (x.plazo_ejemplo ? EJEMPLO : '') + '</span>';
  }
  /* lo publicado en las últimas 48 horas: hoy o ayer (la fecha no lleva hora) */
  function esNuevo(fecha, ahora) { var n = diasEntre(fecha, ahora.iso); return n >= 0 && n <= 1; }
  var NUEVO = '<span class="nuevo"><span class="nuevo__punto" aria-hidden="true"></span>Nuevo<span class="sr">, publicado en las últimas 48 horas</span></span>';

  /* ── v3c · transparencia (F23): empleo público ──
     El tema «Empleo» (también «Empleo público», «empleo»…: se juntan en uno para el filtro) lo pone el
     tablón (scripts/lib/tablon.mjs → motivoEmpleo, o una persona con `tema`) o el aviso propio. Su chip
     lleva el maletín además del color. La ficha «Empleo» de «Hoy» sale solo con alguna oferta con el
     plazo abierto: la que cierra antes, con su chip de plazo, y el enlace a todas (avisos.html?tema=Empleo) */
  function esEmpleo(tema) { return /^empleo\b/.test(normalTexto(tema)); }
  function temaDe(tema) { return esEmpleo(tema) ? 'Empleo' : tema; }
  function chipTema(tema) {
    return esEmpleo(tema) ? '<span class="chip chip--empleo">' + icono('i-empleo') + 'Empleo</span>' : '<span class="chip">' + esc(tema) + '</span>';
  }
  function empleosAbiertos(D, ahora) { return plazosAbiertos(D, ahora).filter(function (x) { return esEmpleo(x.f.tema); }); }
  function filaEmpleo(D, ahora) {
    var lista = empleosAbiertos(D, ahora);
    if (!lista.length) return '';
    var x = lista[0], f = x.f;
    return '<li class="hoy__fila hoy__fila--empleo"' + marcaEjemplo(f, 'aviso:' + f.id) + '>' + etiquetaHoy('i-empleo', 'Empleo') +
      '<p class="hoy__gravedad">' + chipPlazo(f, ahora, f.clave) + '</p>' +
      '<p class="hoy__valor hoy__valor--enlace"><a href="' + esc(f.href) + '">' + esc(f.titulo) + (f.oficial ? SEDE : '') + '</a>' + (f.ejemplo ? ' ' + EJEMPLO : '') + '</p>' +
      '<p class="hoy__cuando">' + (x.p.fecha ? 'Hasta el ' + esc(fechaLarga(x.p.fecha, ahora)) : 'Plazo abierto') + ' · ' + (f.oficial ? 'Tablón oficial' : 'Ayuntamiento') + '</p>' +
      '<p class="hoy__nota"><a href="' + esc(D.rutas.avisos) + '?tema=Empleo#t-tablon-todo">' + (lista.length > 1 ? 'Las ' + lista.length + ' ofertas con plazo abierto' : 'Todo el empleo') + '</a></p></li>';
  }

  /* avisos propios + anuncios del tablón oficial, lo más nuevo primero. v3b: lo que tiene el plazo
     cerrado baja de prioridad (va detrás de todo lo demás, también en el límite de la portada) */
  function ultimos(D, ahora) {
    var propios = avisosVigentes(D, ahora).map(function (a) {
      return { id: a.id, fecha: a.fecha, tema: temaDe(a.tema), titulo: a.titulo, href: enlaceAviso(a, D), ejemplo: a.ejemplo, oficial: false, gravedad: gravedad(a),
        plazo_inicio: a.plazo_inicio || null, plazo_fin: a.plazo_fin || null, plazo_ejemplo: !!a.plazo_ejemplo, clave: a.id };
    });
    var oficiales = ((D.tablon && D.tablon.entradas) || []).filter(function (t) { return !t.oculto; }).map(function (t, i) {
      return { id: 'tablon-' + i, fecha: t.fecha, tema: temaDe(t.tema), titulo: t.titulo_claro || t.titulo, href: t.url, oficial: true,
        plazo_inicio: t.plazo_inicio || null, plazo_fin: t.plazo_fin || null, plazo_ejemplo: !!t.plazo_ejemplo, clave: 'tablon-' + (t.expediente || i) };
    });
    var cerrado = function (f) { var p = plazo(f, ahora); return p && p.estado === 'cerrado' ? 1 : 0; };
    return propios.concat(oficiales).sort(function (a, b) { return cerrado(a) - cerrado(b) || b.fecha.localeCompare(a.fecha) || (a.oficial - b.oficial); });
  }

  /* ── v3b · «Plazos abiertos» (portada): lo que tiene el plazo abierto, lo que cierra antes
     primero (sin fecha de cierre, al final). Sin ninguno devuelve '' y la sección no sale ── */
  function plazosAbiertos(D, ahora) {
    return ultimos(D, ahora).map(function (f) { return { f: f, p: plazo(f, ahora) }; }).filter(function (x) { return plazoAbierto(x.p); })
      .sort(function (a, b) { return (a.p.dias == null) - (b.p.dias == null) || (a.p.dias || 0) - (b.p.dias || 0) || b.f.fecha.localeCompare(a.f.fecha); });
  }
  function plazos(D, ahora, op) {
    var lista = plazosAbiertos(D, ahora).slice(0, (op && op.limite) || 4);
    if (!lista.length) return '';
    return '<h2 class="plazos__titulo" id="t-plazos">Plazos abiertos</h2><ul class="plazos__lista">' + lista.map(function (x) {
      var f = x.f;
      return '<li class="plazos__item plazos__item--' + x.p.estado + '">' + chipPlazo(f, ahora, f.clave) +
        '<p class="plazos__nombre"><a class="plazos__enlace" href="' + esc(f.href) + '">' + esc(f.titulo) + (f.oficial ? SEDE : '') + '</a></p>' +
        '<p class="plazos__nota">' + (x.p.fecha ? 'Hasta el ' + esc(fechaLarga(x.p.fecha, ahora)) + ' · ' : '') + (f.oficial ? 'Tablón oficial' : 'Ayuntamiento') + '</p></li>';
    }).join('') + '</ul>';
  }
  /* el chip de un aviso propio (página de avisos): se repinta con la fecha real */
  function plazoAviso(D, ahora, op) {
    var a = (D.avisos || []).filter(function (x) { return x.id === op.clave; })[0];
    return a ? chipPlazo(a, ahora, a.id) : '';
  }

  /* ── tablón con filtros ── */
  function tablon(D, ahora, op) {
    op = op || {};
    var filas = ultimos(D, ahora);
    if (!filas.length) return '<p class="tablon__cuenta">Ahora mismo no hay avisos publicados.</p>';
    var limite = op.limite || filas.length;
    var temas = [];
    filas.forEach(function (f) { if (temas.indexOf(f.tema) < 0) temas.push(f.tema); });
    temas.sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var h = '<div class="filtros" role="group" aria-label="Filtrar por tema" hidden>' +
      '<button type="button" class="filtro" data-tema="" aria-pressed="true">Todos</button>' +
      temas.map(function (t) { return '<button type="button" class="filtro" data-tema="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>'; }).join('') + '</div>';
    h += '<p class="tablon__cuenta" role="status" data-limite="' + limite + '">' + (filas.length > limite ? 'Los ' + limite + ' más recientes de ' + filas.length + '.' : filas.length + ' avisos y anuncios.') + '</p>';
    h += '<ul class="tablon__lista">' + filas.map(function (f, i) {
      /* la fecha en bloque («02 / OCT», con la letra de titulares) es dibujo: la lee el <time> oculto */
      var p = partes(f.fecha);
      var bloque = '<span class="tablon__dia" aria-hidden="true"><b>' + (p.d < 10 ? '0' : '') + p.d + '</b><span>' + MESES_C[p.m - 1] + '</span>' +
        (p.a !== ahora.anio ? '<span class="tablon__anio">' + p.a + '</span>' : '') + '</span>';
      /* v3b: la franja de la izquierda dice la gravedad de un aviso propio (rojo, solo lo urgente; el
         texto «Urgente» va en la meta, así no depende del color); el punto «Nuevo» y el chip del plazo */
      var g = f.oficial ? null : f.gravedad, pz = plazo(f, ahora);
      return '<li class="tablon__fila' + (g && g !== 'informativo' ? ' es-' + g : '') + (pz && pz.estado === 'cerrado' ? ' es-cerrado' : '') + '" data-tema="' + esc(f.tema) + '"' + (i >= limite ? ' hidden' : '') + marcaEjemplo(f, 'aviso:' + f.id) + '>' +
        '<a class="tablon__enlace" href="' + esc(f.href) + '">' + bloque +
        '<span class="tablon__meta">' + (esNuevo(f.fecha, ahora) ? NUEVO : '') + chipTema(f.tema) + '<time class="sr" datetime="' + f.fecha + '">' + fechaCorta(f.fecha) + '</time>' +
        (g && g !== 'informativo' ? '<span class="chip chip--' + g + '">' + GRAVEDAD[g] + '</span>' : '') + chipPlazo(f, ahora, f.clave) +
        (f.oficial ? '<span class="tablon__origen">Tablón oficial</span>' : '<span class="tablon__origen">Ayuntamiento</span>') + '</span>' +
        '<span class="tablon__titulo">' + esc(f.titulo) + '</span>' + (f.oficial ? SEDE : '') +
        '<svg class="icono tablon__flecha" aria-hidden="true"><use href="#' + (f.oficial ? 'i-salida' : 'i-flecha') + '"/></svg></a>' +
        (f.ejemplo ? EJEMPLO : '') + '</li>';
    }).join('') + '</ul>';
    return h;
  }

  /* ── lo que viene y lo que pasó ── */
  /* «Hoy» arriba y, debajo, dos bloques: lo que viene (lo más cercano primero, solo dentro del
     horizonte de D.horizonte_dias, 60 por defecto) y lo que pasó (las últimas noticias) */
  function linea(D, ahora) {
    var dias = D.horizonte_dias || 60, tope = sumarDias(ahora.iso, dias);
    var todos = proximos(D, ahora);
    var vienen = todos.filter(function (e) { return e.fecha <= tope; }).slice(0, 3);
    var luego = todos.filter(function (e) { return e.fecha > tope; })[0];
    var pasaron = (D.noticias || []).filter(function (n) { return !n.oculto && n.fecha <= ahora.iso; })
      .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); }).slice(0, 3);
    var h = '<p class="linea__hoy"><span class="linea__marca" aria-hidden="true"><svg class="linea__arquito" viewBox="0 0 20 24"><path d="M2 23V10a8 8 0 0 1 16 0v13"/></svg></span>' +
      '<span class="linea__hoy-texto"><b>Hoy</b>, ' + esc(fechaLarga(ahora.iso)) + '</span></p>';
    h += '<div class="linea__bloques"><div class="linea__bloque linea__bloque--viene"><h3 class="linea__subtitulo">Lo que viene</h3>';
    var itemEvento = function (e) {
      return '<li class="linea__item linea__item--evento"' + marcaEjemplo(e, 'evento:' + e.id) + '>' +
        '<p class="linea__cuando"><time datetime="' + e.fecha + '">' + esc(cuando(e.fecha, ahora)) + (e.hora ? ', ' + hora(e.hora) : '') + '</time><span class="chip chip--agenda">' + (e.tipo === 'pleno' ? 'Pleno' : 'Agenda') + '</span>' + (e.ejemplo ? EJEMPLO : '') + '</p>' +
        '<div class="linea__tarjeta"><div><h4 class="linea__titulo"><a href="' + esc(enlaceEvento(e, D)) + '">' + esc(e.titulo) + '</a></h4>' +
        (e.lugar ? '<p class="linea__lugar">' + esc(e.lugar) + '</p>' : '') + '</div></div></li>';
    };
    if (vienen.length) {
      h += '<ol class="linea linea--viene">' + vienen.map(itemEvento).join('') + '</ol>';
      /* v3: con uno o dos eventos en el plazo, la columna quedaba corta junto a «Lo que pasó».
         Se completa con lo que la agenda ya tiene más adelante (datos reales, con su fecha) */
      var despues = todos.filter(function (e) { return e.fecha > tope; }).slice(0, 3 - vienen.length);
      if (despues.length) h += '<p class="linea__despues">Más adelante</p><ol class="linea linea--despues">' + despues.map(itemEvento).join('') + '</ol>';
    } else {
      /* estado vacío: lo dice, y si hay algo más adelante, cuál es */
      h += '<div class="linea__vacio"><p>No hay nada anunciado en los próximos ' + dias + ' días.</p>' +
        (luego ? '<p>Lo siguiente en la agenda: <a href="' + esc(enlaceEvento(luego, D)) + '">' + esc(luego.titulo) + '</a>, ' + esc(fechaLarga(luego.fecha, ahora)) + '.</p>' : '') + '</div>';
    }
    h += '</div><div class="linea__bloque linea__bloque--paso"><h3 class="linea__subtitulo">Lo que pasó</h3>';
    if (pasaron.length) {
      h += '<ol class="linea linea--paso">' + pasaron.map(function (n) {
        return '<li class="linea__item linea__item--noticia"' + marcaEjemplo(n, 'noticia:' + n.id) + '>' +
          '<p class="linea__cuando"><time datetime="' + n.fecha + '">' + esc(cuando(n.fecha, ahora)) + '</time><span class="chip chip--noticia">Noticia</span>' + (n.ejemplo ? EJEMPLO : '') + '</p>' +
          '<div class="linea__tarjeta">' + (n.imagen ? '<figure class="linea__foto arco-opcional"><img src="' + esc(D.rutas.media + n.imagen + '-800.jpg') + '" alt="' + esc(n.imagen_alt || '') + '" width="400" height="300" loading="lazy" decoding="async"></figure>' : '') +
          '<div><h4 class="linea__titulo"><a href="' + esc(enlaceNoticia(n, D)) + '">' + esc(n.titulo) + '</a></h4>' +
          (n.resumen ? '<p class="linea__lugar">' + esc(n.resumen) + '</p>' : '') + '</div></div></li>';
      }).join('') + '</ol>';
    } else if (pasados(D, ahora).length) {
      /* sin noticias, lo último de la agenda que ya pasó */
      h += '<ol class="linea linea--paso">' + pasados(D, ahora).slice(0, 3).map(function (e) {
        return '<li class="linea__item linea__item--noticia"' + marcaEjemplo(e, 'evento:' + e.id) + '>' +
          '<p class="linea__cuando"><time datetime="' + e.fecha + '">' + esc(cuando(e.fecha, ahora)) + '</time><span class="chip chip--noticia">Agenda</span>' + (e.ejemplo ? EJEMPLO : '') + '</p>' +
          '<div class="linea__tarjeta"><div><h4 class="linea__titulo"><a href="' + esc(enlaceEvento(e, D)) + '">' + esc(e.titulo) + '</a></h4>' +
          (e.lugar ? '<p class="linea__lugar">' + esc(e.lugar) + '</p>' : '') + '</div></div></li>';
      }).join('') + '</ol>';
    } else {
      h += '<div class="linea__vacio"><p>Todavía no hay noticias publicadas.</p></div>';
    }
    return h + '</div></div>';
  }

  /* ── el año en fiestas ── */
  /* Tira de 12 meses: los que tienen fiesta se despliegan; los vacíos ocupan poco (en escritorio,
     solo la abreviatura; el nombre entero y «sin fiestas» siguen ahí para el lector de pantalla).
     El mes en curso, con el borde de oro. Sigue siendo una lista ordenada de 12 meses */
  /* v3: si el mes en curso no tiene fiestas, su celda (la resaltada) dice cuál es la siguiente.
     Se busca hacia delante, dando la vuelta al año; null si no hay ninguna en otro mes */
  function siguienteFiesta(D, mes) {
    for (var k = 1; k < 12; k++) {
      var m = ((mes - 1 + k) % 12) + 1;
      var fs = (D.fiestas || []).filter(function (f) { return f.mes === m; });
      if (fs.length) return { fiesta: fs[0], mes: m };
    }
    return null;
  }
  function anio(D, ahora) {
    return MESES.map(function (m, i) {
      var mes = i + 1;
      var fs = (D.fiestas || []).filter(function (f) { return f.mes === mes; });
      var actual = mes === ahora.mes;
      var nombre = m.charAt(0).toUpperCase() + m.slice(1);
      var sig = actual && !fs.length ? siguienteFiesta(D, mes) : null;
      return '<li class="mes' + (fs.length ? ' con-fiesta' : ' es-vacio') + (actual ? ' es-mes-actual' : '') + '">' +
        '<p class="mes__nombre"><span class="mes__largo">' + nombre + '</span><span class="mes__corto" aria-hidden="true">' + MESES_C[i] + '</span>' +
        (actual ? ' <span class="mes__ahora">Este mes</span>' : '') + '</p>' +
        (fs.length ? '<ul class="mes__fiestas">' + fs.map(function (f) {
          return '<li><b>' + esc(f.nombre) + '</b>' + (f.mayor ? ' <span class="chip chip--mayor">Fiesta mayor</span>' : '') + '<span>' + esc(f.cuando) + '</span></li>';
        }).join('') + '</ul>' : '<p class="mes__vacio"><span class="mes__raya" aria-hidden="true"></span><span class="mes__vacio-texto">Sin fiestas señaladas' + (sig ? '.' : '') + '</span></p>' +
          (sig ? '<p class="mes__siguiente">Lo siguiente: <b>' + esc(sig.fiesta.nombre) + '</b>, ' + MESES[sig.mes - 1] + '</p>' : '')) + '</li>';
    }).join('');
  }

  /* ── al lado del tablón (portada): el canal de avisos y el próximo pleno ──
     Cada bloque solo si hay datos; sin ninguno devuelve '' y el tablón ocupa el ancho */
  function lado(D, ahora) {
    var h = '';
    var c = D.canal;
    if (c && c.url) {
      h += '<div class="lado__bloque lado__bloque--canal">' + icono('i-movil') + '<h3 class="lado__titulo">Reciba los avisos en el móvil</h3>' +
        '<p class="lado__texto">El Ayuntamiento los publica también en <a href="' + esc(c.url) + '">' + esc(c.nombre) + FUERA + '</a>.</p>' +
        (c.pasos && c.pasos.length ? '<p class="lado__subtitulo">Cómo apuntarse</p><ol class="lado__pasos">' + c.pasos.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>'
          : '<p class="lado__texto"><a href="' + esc(D.rutas.avisos) + '#t-canal">Cómo apuntarse</a></p>') + '</div>';
    }
    var p = proximoPleno(D, ahora);
    if (p) {
      h += '<div class="lado__bloque lado__bloque--pleno"' + marcaEjemplo(p, 'evento:' + p.id) + '>' + icono('i-calendario') + '<h3 class="lado__titulo">Próximo pleno</h3>' +
        '<p class="lado__fecha"><a href="' + esc(enlaceEvento(p, D)) + '">' + esc(cuando(p.fecha, ahora)) + (p.hora ? ', ' + hora(p.hora) : '') + '<span class="sr">, ' + esc(p.titulo) + '</span></a>' + (p.ejemplo ? ' ' + EJEMPLO : '') + '</p>' +
        '<p class="lado__texto">' + esc(p.titulo) + (p.lugar ? '. ' + esc(p.lugar) : '') + '</p>' +
        (p.convocatoria ? '<p class="lado__texto"><a href="' + esc(p.convocatoria) + '">Convocatoria y orden del día<span class="sr"> del pleno' + esc(p.convocatoria_sr || ', se abre otra web') + '</span></a></p>' : '') +
        '<p class="lado__accion">' + icsHtml(p, D) + '</p></div>';
    }
    return h;
  }

  /* ── página de agenda ── */
  function evento(e, D, ahora) {
    var pendiente = eventoPendiente(e, ahora);
    /* pleno: la convocatoria mientras viene; la grabación cuando ya pasó */
    var enlace = pendiente ? (e.convocatoria ? { url: e.convocatoria, texto: 'Convocatoria y orden del día', sr: e.convocatoria_sr } : null)
      : (e.grabacion ? { url: e.grabacion, texto: 'Ver la grabación', sr: e.grabacion_sr } : null);
    return '<li class="evento" id="evento-' + esc(e.id) + '"' + marcaEjemplo(e, 'evento:' + e.id) + '>' +
      '<p class="evento__fecha"><time datetime="' + e.fecha + '">' + esc(cuando(e.fecha, ahora)) + (e.hora ? ', ' + hora(e.hora) : '') + '</time>' +
      (e.origen === 'fiesta' ? '<span class="chip">Fiesta</span>' : '') + (e.tipo === 'pleno' ? '<span class="chip">Pleno</span>' : '') + (e.ejemplo ? EJEMPLO : '') + '</p>' +
      '<h3 class="evento__titulo">' + esc(e.titulo) + '</h3>' +
      (e.lugar ? '<p class="evento__lugar">' + esc(e.lugar) + '</p>' : '') + (e.nota ? '<p class="evento__nota">' + esc(e.nota) + '</p>' : '') +
      (enlace || pendiente ? '<p class="evento__acciones">' +
        (enlace ? '<a class="evento__enlace" href="' + esc(enlace.url) + '">' + esc(enlace.texto) + '<span class="sr">: ' + esc(e.titulo) + esc(enlace.sr || ', se abre otra web') + '</span></a>' : '') +
        (pendiente ? icsHtml(e, D) : '') + '</p>' : '') + '</li>';
  }
  /* v3 · el calendario del mes, a la izquierda de la lista (arriba en el móvil). Una tabla por mes,
     desde el mes en curso (o hasta 2 atrás, si «Ya pasó» enseña algo de entonces) hasta el último acto
     anunciado o, como poco, el horizonte de la agenda (D.horizonte_dias). Los días con actos enlazan a
     su acto en la lista; hoy lleva aria-current="date" y el oro de los filetes. Solo se ve el mes
     en curso: main.js enseña los botones de mes anterior y siguiente (sin JS, la lista lo tiene todo). */
  var DIAS_L = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  function claveMes(iso) { return iso.slice(0, 7); }
  function mesSiguiente(clave, n) { var a = Number(clave.slice(0, 4)), m = Number(clave.slice(5, 7)) - 1 + n; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + '-' + (m < 9 ? '0' : '') + (m + 1); }
  function nombreMes(clave) { var m = MESES[Number(clave.slice(5, 7)) - 1]; return m.charAt(0).toUpperCase() + m.slice(1) + ' de ' + clave.slice(0, 4); }
  function calendario(D, ahora, p, ya) {
    var hoyMes = claveMes(ahora.iso), enlazables = p.concat(ya), porDia = {};
    enlazables.forEach(function (e) { (porDia[e.fecha] = porDia[e.fecha] || []).push(e); });
    var desde = hoyMes, hasta = claveMes(sumarDias(ahora.iso, D.horizonte_dias || 60)), tope = mesSiguiente(hoyMes, -2);
    ya.forEach(function (e) { var k = claveMes(e.fecha); if (k < desde && k >= tope) desde = k; });
    p.forEach(function (e) { var k = claveMes(e.fecha); if (k > hasta) hasta = k; });
    var meses = [];
    for (var k = desde; k <= hasta && meses.length < 16; k = mesSiguiente(k, 1)) meses.push(k);
    var h = '<div class="calendario" data-mes-hoy="' + hoyMes + '">' +
      '<h2 class="sr" id="t-calendario">Calendario</h2>' +
      '<div class="calendario__nav" hidden><button type="button" class="calendario__paso" data-cal-paso="-1"><svg class="icono icono--volver" aria-hidden="true"><use href="#i-flecha"/></svg><span class="sr">Mes anterior</span></button>' +
      '<p class="sr" role="status" data-cal-estado></p>' +
      '<button type="button" class="calendario__paso" data-cal-paso="1"><span class="sr">Mes siguiente</span><svg class="icono" aria-hidden="true"><use href="#i-flecha"/></svg></button></div>';
    meses.forEach(function (clave) {
      var a = Number(clave.slice(0, 4)), m = Number(clave.slice(5, 7));
      var primero = clave + '-01', hueco = (diaSemana(primero) + 6) % 7, dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
      var t = '<div class="calendario__mes" data-mes="' + clave + '"' + (clave === hoyMes ? '' : ' hidden') + '><table class="calendario__tabla"><caption class="calendario__caption">' + nombreMes(clave) + '</caption><thead><tr>' +
        DIAS_L.map(function (d) { return '<th scope="col"><span aria-hidden="true">' + d.charAt(0).toUpperCase() + '</span><span class="sr">' + d + '</span></th>'; }).join('') + '</tr></thead><tbody><tr>';
      for (var i = 0; i < hueco; i++) t += '<td></td>';
      for (var d = 1; d <= dias; d++) {
        var iso = clave + '-' + (d < 10 ? '0' : '') + d, col = (hueco + d - 1) % 7, evs = porDia[iso] || [], esHoy = iso === ahora.iso;
        if (col === 0 && d > 1) t += '</tr><tr>';
        t += '<td class="calendario__celda' + (evs.length ? ' con-acto' : '') + (esHoy ? ' es-hoy' : '') + (evs.length && !eventoPendiente(evs[0], ahora) ? ' ya-paso' : '') + '"' + (esHoy ? ' aria-current="date"' : '') + '>' +
          (evs.length ? '<a class="calendario__dia" href="#evento-' + esc(evs[0].id) + '">' + d + '<span class="sr">' + (esHoy ? ', hoy' : '') + ': ' + evs.map(function (e) { return esc(e.titulo); }).join('; ') + '</span></a>'
            : '<span class="calendario__dia">' + d + (esHoy ? '<span class="sr">, hoy</span>' : '') + '</span>') + '</td>';
      }
      for (var r = (hueco + dias) % 7; r && r < 7; r++) t += '<td></td>';
      h += t + '</tr></tbody></table></div>';
    });
    return h + '<p class="calendario__leyenda" aria-hidden="true"><span class="calendario__muestra calendario__muestra--acto"></span>Con actos<span class="calendario__muestra calendario__muestra--hoy"></span>Hoy</p></div>';
  }
  function agenda(D, ahora) {
    var p = proximos(D, ahora);
    var ya = pasados(D, ahora).slice(0, 6);
    return '<div class="agenda__calendario">' + calendario(D, ahora, p, ya) + '</div><div class="agenda__lista">' +
      '<h2 class="seccion__titulo" id="t-proximo">Lo que viene</h2>' +
      (p.length ? '<ol class="eventos">' + p.map(function (e) { return evento(e, D, ahora); }).join('') + '</ol>' : '<p>No hay nada anunciado.</p>') +
      (ya.length ? '<h2 class="seccion__titulo" id="t-pasado">Ya pasó</h2><ol class="eventos eventos--pasados">' + ya.map(function (e) { return evento(e, D, ahora); }).join('') + '</ol>' : '') + '</div>';
  }

  /* ── estado de un servicio (página de teléfonos) ── */
  function servicio(D, ahora, op) {
    var s = (D.servicios || {})[op.clave];
    return s ? estadoHtml(s, ahora, 'estado estado--servicio') : '';
  }

  /* ═══ v3c · automatico ═══ */
  /* ── F16 · «Avisos del Ayuntamiento» (página de avisos), desde los datos vivos ──
     Antes era una lista fija de la plantilla: un aviso que llegaba de la hoja salía en la franja y en
     «Hoy», pero no aquí, y su enlace (avisos.html#aviso-<id>) no llevaba a ningún sitio. Ahora la pinta
     este bloque: aplicar.mjs al montar (es lo que se ve sin JavaScript) y main.js con lo de la hoja.
     Todos los avisos no ocultos, también los caducados (es el archivo), del más nuevo al más antiguo */
  function fechaTexto(iso) { var p = partes(iso); return p.d + ' de ' + MESES[p.m - 1] + ' de ' + p.a; }
  var ENLACE_RARO = /^\s*(javascript|data|vbscript):/i;
  function avisosLista(D, ahora) {
    var lista = (D.avisos || []).filter(function (a) { return !a.oculto; }).slice().sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
    if (!lista.length) return '';
    return '<ol class="avisos">' + lista.map(function (a) {
      var g = gravedad(a), pz = (a.plazo_inicio || a.plazo_fin) ? chipPlazo(a, ahora, a.id) : '';
      return '<li class="aviso aviso--' + g + (g === 'urgente' ? ' aviso--urgente' : '') + '" id="aviso-' + esc(a.id) + '"' + marcaEjemplo(a, 'aviso:' + a.id) + '>' +
        '<p class="aviso__meta">' + chipTema(a.tema) + '<time datetime="' + esc(a.fecha) + '">' + fechaTexto(a.fecha) + '</time>' +
        (g === 'urgente' ? '<span class="chip chip--urgente">Urgente</span>' : '') + (g === 'programado' ? '<span class="chip chip--programado">Programado</span>' : '') +
        /* el chip del plazo lleva su propio data-vivo: se repinta con la fecha real aunque la lista no cambie */
        (pz ? '<span class="aviso__plazo" data-vivo="plazo" data-clave="' + esc(a.id) + '">' + pz + '</span>' : '') + (a.ejemplo ? EJEMPLO : '') + '</p>' +
        '<h3 class="aviso__titulo">' + esc(a.titulo) + '</h3>' +
        (a.texto ? '<p class="aviso__texto">' + esc(a.texto) + '</p>' : '') +
        (a.enlace && !ENLACE_RARO.test(a.enlace) ? '<p><a href="' + esc(a.enlace) + '">Más información<span class="sr"> sobre ' + esc(a.titulo) + '</span></a></p>' : '') +
        '</li>';
    }).join('') + '</ol>';
  }

  /* ── F15 · la hoja de Google publicada (endpoint gviz) ──
     El MISMO código en los dos lados: js/main.js → leerHoja (el navegador, al abrir la página) y
     scripts/lib/hoja.mjs (Node, al montar la web: así lo de la hoja entra también en feed.xml, en
     agenda.ics, en los ics/<id>.ics, en la lista de avisos y cada noticia tiene su página).
     - filasHoja(txt): la respuesta de gviz → filas. Las columnas, sin tildes ni mayúsculas y con «_»
       por los espacios («Título corto» → titulo_corto); Date(…) → AAAA-MM-DD; una celda de solo hora
       (Date(1899,11,30,20,30,0)) → «20:30»; TRUE/sí → true; `estado` oculto o borrador → oculto; el
       `id` como en una dirección y, sin él, la fecha y el título.
     - sanearHoja(tipo, filas): fuera lo que no se puede enseñar (sin título o sin fecha que exista);
       lo dudoso se corrige o se quita (una gravedad mal escrita, una hora rara, un enlace que no es
       http/https), con un aviso por cada cosa. Nunca rompe: la hoja la rellena la secretaría.
     - fusionarHoja(lista, filas, agenda): la hoja manda por `id`; una fila oculta solo oculta lo que
       ya había (no se añade nada que no se va a ver). En la agenda, el .ics escrito se queda si el
       acto no ha cambiado; si cambió o es nuevo, se genera al pulsar */
  function filasHoja(txt) {
    var j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    if (!j || !j.table || !j.table.cols) throw new Error(j && j.status === 'error' ? 'la hoja contesta con un error (¿publicada? ¿la pestaña existe?)' : 'no es una respuesta de gviz');
    var cols = j.table.cols.map(function (c) { return normalTexto(c.label || c.id).replace(/\s+/g, '_'); });
    return (j.table.rows || []).map(function (fila) {
      var o = {};
      (fila.c || []).forEach(function (c, i) {
        if (!cols[i]) return;
        var v = c ? c.v : null;
        var m = typeof v === 'string' && v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+))?/);
        if (m && m[1] === '1899' && m[4] != null) v = String(m[4]).padStart(2, '0') + ':' + String(m[5]).padStart(2, '0');
        else if (m) v = m[1] + '-' + String(Number(m[2]) + 1).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        if (v === 'TRUE' || v === 'sí' || v === 'si') v = true;
        if (v === 'FALSE' || v === 'no') v = false;
        o[cols[i]] = v;
      });
      if (o.estado && /oculto|borrador/i.test(o.estado)) o.oculto = true;
      if (o.id != null && o.id !== '') o.id = normalTexto(o.id).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || null;
      if (!o.id && o.titulo && o.fecha) o.id = normalTexto(o.fecha + '-' + o.titulo).replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      return o;
    });
  }
  function fechaExiste(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var p = partes(s), d = new Date(Date.UTC(p.a, p.m - 1, p.d));
    return d.getUTCMonth() === p.m - 1 && d.getUTCDate() === p.d;
  }
  function textoHoja(v) { return v == null || typeof v === 'boolean' ? null : (String(v).trim() || null); }
  function sanearHoja(tipo, filas) {
    var avisos = [], buenas = [];
    (filas || []).forEach(function (o, i) {
      var donde = tipo + ', fila ' + (i + 2) + (textoHoja(o.titulo) ? ' («' + textoHoja(o.titulo) + '»)' : '') + ': ';
      var corrige = function (campo, valor, que) { if (textoHoja(o[campo]) && !valor) avisos.push(donde + '«' + campo + '» ' + que + '; se quita'); return valor; };
      var fechaO = function (campo) { return corrige(campo, fechaExiste(o[campo]) ? o[campo] : null, 'no es una fecha'); };
      var enlaceO = function (campo) { var t = textoHoja(o[campo]); return corrige(campo, t && /^https?:\/\/\S+$/i.test(t) ? t : null, 'no empieza por https://'); };
      var horaO = function (campo) { var t = textoHoja(o[campo]), m = t && /^(\d{1,2})[:.](\d{2})$/.exec(t); return corrige(campo, m && Number(m[1]) < 24 && Number(m[2]) < 60 ? (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2] : null, 'no es una hora («20:30»)'); };
      if (o.oculto) { if (o.id) buenas.push({ id: String(o.id), oculto: true }); return; }
      if (!textoHoja(o.titulo)) { avisos.push(donde + 'sin título; no se publica'); return; }
      if (!fechaExiste(o.fecha)) { avisos.push(donde + 'la fecha «' + (o.fecha == null ? '' : o.fecha) + '» no existe o no está escrita como fecha; no se publica'); return; }
      var x = { id: String(o.id), fecha: o.fecha, titulo: textoHoja(o.titulo), ejemplo: o.ejemplo === true, oculto: false };
      if (tipo === 'avisos') {
        var g = normalTexto(o.gravedad), gOk = Object.prototype.hasOwnProperty.call(GRAVEDAD, g);
        if (g && !gOk) avisos.push(donde + 'la gravedad «' + o.gravedad + '» no es urgente, programado ni informativo; queda como informativo');
        var ini = fechaO('plazo_inicio'), fin = fechaO('plazo_fin');
        if (ini && fin && ini > fin) { avisos.push(donde + 'el plazo empieza después de acabar; se quita'); ini = fin = null; }
        x.tema = textoHoja(o.tema) || 'Otros'; x.texto = textoHoja(o.texto); x.titulo_corto = textoHoja(o.titulo_corto); x.enlace = enlaceO('enlace');
        x.gravedad = gOk ? g : null; x.urgente = o.urgente === true; x.caduca = fechaO('caduca');
        x.plazo_inicio = ini; x.plazo_fin = fin; x.plazo_ejemplo = o.plazo_ejemplo === true && !!(ini || fin);
      } else if (tipo === 'agenda') {
        x.hora = horaO('hora'); x.hora_fin = x.hora ? horaO('hora_fin') : null; x.lugar = textoHoja(o.lugar); x.nota = textoHoja(o.nota);
        x.tipo = textoHoja(o.tipo) ? normalTexto(o.tipo) : null; x.convocatoria = enlaceO('convocatoria'); x.grabacion = enlaceO('grabacion');
      } else if (tipo === 'noticias') {
        /* el cuerpo: la columna «texto» (o «cuerpo»), un párrafo por línea. La foto no viene de la hoja:
           cada foto de la web lleva su autor y su licencia (media/creditos.json) */
        x.resumen = textoHoja(o.resumen);
        x.cuerpo = (Array.isArray(o.cuerpo) ? o.cuerpo : String(textoHoja(o.cuerpo) || textoHoja(o.texto) || '').split(/\r?\n/))
          .map(function (p) { return String(p).trim(); }).filter(Boolean);
      }
      buenas.push(x);
    });
    return { filas: buenas, avisos: avisos };
  }
  var CAMPOS_ICS = ['fecha', 'hora', 'hora_fin', 'titulo', 'lugar', 'nota', 'convocatoria'];
  function fusionarHoja(lista, filas, agenda) {
    var out = (lista || []).slice(), porId = Object.create(null);
    out.forEach(function (x, i) { porId[x.id] = i; });
    (filas || []).forEach(function (n) {
      var i = porId[n.id];
      if (n.oculto) { if (i != null) out[i] = Object.assign({}, out[i], { oculto: true }); return; }
      if (i == null) { porId[n.id] = out.length; out.push(agenda ? Object.assign({}, n, { ics: null }) : n); return; }
      var viejo = out[i], nuevo = Object.assign({}, viejo, n);
      if (agenda && CAMPOS_ICS.some(function (k) { return (viejo[k] || null) !== (n[k] || null); })) nuevo.ics = null;
      out[i] = nuevo;
    });
    return out;
  }

  var BLOQUES = { franja: franja, hoy: hoy, tablon: tablon, linea: linea, anio: anio, agenda: agenda, servicio: servicio, lado: lado, plazos: plazos, plazo: plazoAviso,
    avisos: avisosLista };   /* v3c · automatico */

  raiz.Vivo = {
    plazo: plazo, plazosAbiertos: plazosAbiertos, esNuevo: esNuevo,
    filasHoja: filasHoja, sanearHoja: sanearHoja, fusionarHoja: fusionarHoja,   /* v3c · automatico */
    esEmpleo: esEmpleo, empleosAbiertos: empleosAbiertos,   /* v3c · transparencia */
    ahoraEn: ahoraEn, estado: estado, fechaLarga: fechaLarga, fechaCorta: fechaCorta, siguienteFiesta: siguienteFiesta,
    urgentes: urgentes, destacados: destacados, gravedad: gravedad, proximos: proximos, ultimos: ultimos,
    farmaciaDeGuardia: farmaciaDeGuardia, proximaRecogida: proximaRecogida, proximoPleno: proximoPleno, ics: ics, archivoIcs: archivoIcs,
    pintar: function (nombre, D, ahora, op) { return BLOQUES[nombre](D, ahora, op || {}); },
    bloques: Object.keys(BLOQUES)
  };
})(typeof window !== 'undefined' ? window : globalThis);
