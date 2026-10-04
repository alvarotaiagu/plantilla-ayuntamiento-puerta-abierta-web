/* escribanos.js — v3c · transparencia (F24). «Escríbanos»: consulta, sugerencia o felicitación por correo,
   sin servidor. Solo lo carga escribanos.html, detrás de js/formulario-correo.js (la validación accesible,
   el mailto y el «listo», comunes con «Avisar de un problema»). Sin JavaScript, el formulario se envía
   tal cual como mailto (enctype text/plain) y el navegador valida los obligatorios.
   Asunto: «Consulta: <su asunto>»; cuerpo: el tipo, el asunto, el mensaje y los datos de contacto que dé.
   window.Escribanos.componer(datos) devuelve { asunto, cuerpo, href, largo } (lo usa verificar.mjs). */
(function () {
  'use strict';
  var form = document.querySelector('[data-escribanos]');
  if (!form || !window.FormularioCorreo) return;
  var FC = window.FormularioCorreo, limpio = FC.limpio;
  var correo = form.getAttribute('data-correo');
  var municipio = form.getAttribute('data-municipio');

  function componer(d) {
    var asunto = d.tipo + ': ' + limpio(d.asunto).replace(/\s+/g, ' ');
    var lineas = [d.tipo + ' para el Ayuntamiento', '', 'Asunto: ' + limpio(d.asunto).replace(/\s+/g, ' '), '', 'Mensaje:', limpio(d.mensaje)];
    var datos = [['Nombre', d.nombre], ['Teléfono', d.telefono], ['Correo', d.correo]].filter(function (x) { return limpio(x[1]); });
    if (datos.length) { lineas.push('', 'Mis datos de contacto:'); datos.forEach(function (x) { lineas.push(x[0] + ': ' + limpio(x[1])); }); }
    lineas.push('', '--', 'Enviado desde «Escríbanos» de la web del Ayuntamiento de ' + municipio + '.');
    return FC.mailto(correo, asunto, lineas);
  }
  window.Escribanos = { componer: componer, LARGO_MAX: FC.LARGO_MAX };

  function leer() {
    var t = form.querySelector('input[name="tipo"]:checked');
    return { tipo: t ? t.value : '', asunto: form.asunto.value, mensaje: form.mensaje.value, nombre: form.nombre.value, telefono: form.telefono.value, correo: form.correo.value };
  }

  FC.montar({
    form: form, correo: correo, leer: leer, componer: componer,
    sel: { errores: '[data-escribanos-errores]', lista: '[data-escribanos-errores-lista]', listo: '[data-escribanos-listo]', mailto: '[data-escribanos-mailto]',
      texto: '[data-escribanos-texto]', volver: '[data-escribanos-volver]', copiar: '[data-escribanos-copiar]', copiarEstado: '[data-escribanos-copiar-estado]', avisoLargo: '[data-escribanos-largo]' },
    reglas: function (d) {
      return [
        ['tipo', form.querySelector('input[name="tipo"]'), d.tipo ? null : 'Elija si es una consulta, una sugerencia o una felicitación.'],
        ['asunto', form.asunto, limpio(d.asunto).length >= 3 ? null : 'Escriba el asunto en pocas palabras.'],
        ['mensaje', form.mensaje, limpio(d.mensaje).length >= 10 ? null : 'Escriba su mensaje, con al menos unas palabras (10 letras o más).'],
        ['telefono', form.telefono, FC.telefonoMal(d.telefono) ? 'El teléfono no parece correcto: escriba solo números, por ejemplo 600 123 456.' : null],
        ['correo', form.correo, FC.correoMal(d.correo) ? 'El correo no parece correcto: tiene que ser como nombre@ejemplo.es.' : null]
      ];
    },
    marcar: { tipo: document.getElementById('campo-tipo') },
    primero: function () { return form.querySelector('input[name="tipo"]:checked, input[name="tipo"]'); }
  });
})();
