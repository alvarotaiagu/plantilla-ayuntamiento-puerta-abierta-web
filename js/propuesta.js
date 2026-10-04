/* propuesta.js — el comparador antes / después de «La propuesta» (v3b · servicio).
   Un input range de verdad: flechas, Inicio, Fin, Re Pág y Av Pág los da el navegador, y el
   lector de pantalla oye el aria-valuetext. Sin este archivo, las dos capturas salen una debajo
   de otra (css/propuesta.css) y el control no aparece. */
(function () {
  var cajas = document.querySelectorAll('[data-comparador]');
  Array.prototype.forEach.call(cajas, function (c) {
    var rango = c.querySelector('input[type="range"]'), marco = c.querySelector('.comparador__marco'), control = c.querySelector('[data-comparador-control]');
    if (!rango || !marco || !control) return;
    function texto(v) {
      if (v <= 0) return 'Solo la propuesta';
      if (v >= 100) return 'Solo la web actual';
      if (v === 50) return 'Mitad y mitad';
      return v + ' % de la web actual a la izquierda, ' + (100 - v) + ' % de la propuesta a la derecha';
    }
    function poner() {
      var v = Math.max(0, Math.min(100, Number(rango.value) || 0));
      marco.style.setProperty('--corte', v + '%');
      rango.setAttribute('aria-valuetext', texto(v));
    }
    control.hidden = false;
    c.classList.add('comparador--activo');
    rango.addEventListener('input', poner);
    poner();
  });
})();
