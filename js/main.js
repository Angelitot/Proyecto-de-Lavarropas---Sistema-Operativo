/*
 * LAVACRÁN — Arranque de la página
 * Crea el sistema, recupera el estado (si la página se cerró a mitad de un
 * lavado cuenta como corte de luz), conecta la interfaz y corre el reloj.
 * Responsable: integrador del grupo.
 */
(function (L) {
  'use strict';

  const $ = id => document.getElementById(id);
  const s = L.crearSistema();
  L.sistema = s;                                   // para curiosear desde la consola del navegador
  L.arrancarSistema(s);

  const sonidos = L.crearSonidos(s.eeprom);
  const maquina = L.crearLavarropas(s, $('lavarropas'));
  const panel = L.crearPanel(s, sonidos);
  const consola = L.crearConsola(s);
  const demo = L.crearDemo(s, maquina, sonidos);

  // ---------------- Velocidad de la simulación ----------------
  let velocidad = Number(s.eeprom.leer('velocidad')) || 60;
  const botonesVel = document.querySelectorAll('#velocidades button');
  function fijarVelocidad(v) {
    velocidad = v;
    s.eeprom.escribir('velocidad', v);
    botonesVel.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.vel) === v)));
  }
  botonesVel.forEach(b => b.addEventListener('click', () => fijarVelocidad(Number(b.dataset.vel))));
  fijarVelocidad(velocidad);

  $('btn-adelantar').addEventListener('click', () => {
    const ci = s.ciclo;
    if (s.energia.corte) { s.energia.restaurarYa(); return; }
    if (ci.estado === 'PROGRAMADO') {
      s.kernel.log('SISTEMA', 'Simulación: el reloj se adelanta hasta la hora programada');
      s.diferido.inicioMs = s.kernel.relojMs;
      s.kernel.avanzar(1000);
      return;
    }
    if (!ci.activo()) { s.control.avisar('No hay un programa en marcha'); return; }
    if (ci.pausas.size) { s.control.avisar('El ciclo está en pausa: no hay nada que adelantar'); return; }
    const paso = ci.paso;
    let n = 0;
    while (ci.activo() && ci.paso === paso && !ci.pausas.size && n < 120000) { s.kernel.tick(); n++; }
    s.kernel.log('SISTEMA', `Simulación: se adelantaron ${L.util.mmss(n * s.config.tickMs)} hasta el paso siguiente`);
  });

  // ---------------- Vista por dentro ----------------
  const chkRayos = $('chk-rayos');
  chkRayos.checked = s.eeprom.leer('rayos') !== false;
  maquina.setRayos(chkRayos.checked);
  chkRayos.addEventListener('change', () => { maquina.setRayos(chkRayos.checked); s.eeprom.escribir('rayos', chkRayos.checked); });

  // ---------------- Sonidos de eventos ----------------
  s.kernel.on('ciclo:inicio', () => sonidos.inicio());
  s.kernel.on('ciclo:fin', e => { if (e.resultado === 'terminado') sonidos.fin(); });
  s.kernel.on('tapa', e => sonidos.tapa(e.abierta));
  s.kernel.on('energia', e => (e.hay ? sonidos.arranque() : sonidos.apagado()));
  document.addEventListener('pointerdown', () => sonidos.desbloquear(), { once: true });

  // ---------------- Reloj de la página ----------------
  let ultimo = performance.now(), acumulado = 0, ultimoPanel = 0, ultimaVista = 0, ultimaAlarma = 0;
  function cuadro(ahora) {
    const dtReal = Math.min(0.25, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    acumulado += dtReal * 1000 * velocidad;
    const tick = s.config.tickMs;
    let n = 0;
    while (acumulado >= tick && n < 5000) { s.kernel.tick(); acumulado -= tick; n++; }
    if (n >= 5000) acumulado = 0;

    if (ahora - ultimoPanel > 90 || !panel.ultima) { panel.render(ahora); ultimoPanel = ahora; }
    maquina.render(dtReal, ahora / 1000, panel.ultima);
    if (ahora - ultimaVista > 250) { consola.render(); demo.render(); ultimaVista = ahora; }
    if (s.alarmas.sonando() && s.kernel.enEjecucion && ahora - ultimaAlarma > 2600) { sonidos.alarma(); ultimaAlarma = ahora; }
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);

  // Cerrar la pestaña es como cortar la luz: se guarda el estado
  addEventListener('pagehide', () => { if (!L.reiniciando) s.energia.guardar('se cerró la página'); });
})(globalThis.LAVACRAN);
