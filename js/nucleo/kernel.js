/*
 * LAVACRÁN OS — Núcleo (kernel)
 *
 * Lo mínimo que tiene cualquier sistema operativo embebido:
 *  - Reloj del sistema (RTC) que avanza de a "ticks" de 100 ms.
 *  - Controlador de interrupciones: cada dispositivo (tapa, panel, acelerómetro,
 *    falla de energía) pide una IRQ y el núcleo ejecuta su rutina de servicio
 *    (ISR) según la prioridad.
 *  - Planificador de tareas por prioridades fijas (estilo RTOS): en cada tick
 *    ejecuta, de mayor a menor prioridad, las tareas cuyo período se cumplió.
 *  - Bus de eventos para que la interfaz se entere de lo que pasa.
 *  - Registro (log) de todo lo anterior.
 *
 * Responsable: Pareja 3 (núcleo).
 */
(function (L) {
  'use strict';

  L.crearKernel = function (s, opc = {}) {
    const cfg = s.config;
    let contadorLog = 0;

    const k = {
      relojMs: opc.relojInicialMs != null ? opc.relojInicialMs : Math.floor(Date.now() / 1000) * 1000,
      ticks: 0,
      enEjecucion: true,     // false mientras dura un corte de luz (la CPU no tiene energía)
      estricto: !!opc.estricto,
      tareas: [],
      irqs: {},
      pendientes: [],
      atendiendo: false,
      registro: [],
      oyentes: {}
    };

    // ---------- Bus de eventos ----------
    k.on = function (evento, fn) {
      (k.oyentes[evento] = k.oyentes[evento] || []).push(fn);
      return () => { k.oyentes[evento] = k.oyentes[evento].filter(f => f !== fn); };
    };
    k.emit = function (evento, datos) {
      (k.oyentes[evento] || []).slice().forEach(fn => fn(datos));
      (k.oyentes['*'] || []).slice().forEach(fn => fn(evento, datos));
    };

    // ---------- Registro ----------
    k.log = function (tipo, mensaje) {
      const entrada = { id: ++contadorLog, t: k.relojMs, tipo, mensaje };
      k.registro.push(entrada);
      if (k.registro.length > 500) k.registro.shift();
      k.emit('log', entrada);
      return entrada;
    };

    // ---------- Interrupciones ----------
    /**
     * Registra una línea de interrupción.
     * @param {string} num  'NMI', 'IRQ0', 'IRQ1'...
     * @param {number} prioridad  menor número = más urgente (NMI = -1)
     * @param {function} isr  rutina de servicio
     */
    k.registrarIRQ = function (num, nombre, prioridad, isr, o = {}) {
      k.irqs[num] = { num, nombre, prioridad, isr, cuenta: 0, ultimaMs: null, perdidas: 0, silenciosa: !!o.silenciosa };
    };

    /** Un dispositivo pide atención. Si la CPU está sin energía, solo pasa la NMI. */
    k.irq = function (num, datos = {}) {
      const e = k.irqs[num];
      if (!e) return false;
      if (!k.enEjecucion && num !== 'NMI') { e.perdidas++; return false; }
      k.pendientes.push({ num, datos });
      if (!k.atendiendo) atender();
      return true;
    };

    function atender() {
      k.atendiendo = true;
      try {
        while (k.pendientes.length) {
          k.pendientes.sort((a, b) => k.irqs[a.num].prioridad - k.irqs[b.num].prioridad);
          const p = k.pendientes.shift();
          const e = k.irqs[p.num];
          e.cuenta++;
          e.ultimaMs = k.relojMs;
          if (!e.silenciosa) k.log('IRQ', `${p.num} ${e.nombre}${p.datos.detalle ? ': ' + p.datos.detalle : ''}`);
          if (!e.isr) continue;
          try { e.isr(p.datos); } catch (err) {
            k.log('ERROR', `Falla en la rutina de ${p.num}: ${err.message}`);
            if (k.estricto) throw err;
          }
        }
      } finally {
        k.atendiendo = false;
      }
    }

    // ---------- Planificador ----------
    k.crearTarea = function (id, nombre, prioridad, periodoMs, fn) {
      const t = { id, nombre, prioridad, periodoMs, fn, ultimaMs: null, ejecuciones: 0, estado: 'LISTA' };
      k.tareas.push(t);
      k.tareas.sort((a, b) => a.prioridad - b.prioridad);
      return t;
    };

    /** Después de un corte de luz las tareas arrancan de nuevo sin "deber" tiempo. */
    k.reiniciarTareas = function () { k.tareas.forEach(t => { t.ultimaMs = null; t.estado = 'LISTA'; }); };

    /** Un tick del reloj: avanza el mundo físico, atiende el timer y ejecuta tareas. */
    k.tick = function () {
      const dt = cfg.tickMs;
      k.relojMs += dt;
      k.ticks++;
      s.hw.actualizar(dt);                       // el lavarropas físico sigue existiendo
      if (!k.enEjecucion) {                      // sin energía: la CPU no ejecuta nada
        s.energia.tickSinEnergia();
        return;
      }
      if (k.irqs.IRQ0) { k.irqs.IRQ0.cuenta++; k.irqs.IRQ0.ultimaMs = k.relojMs; }
      for (const t of k.tareas) {
        if (!k.enEjecucion) break;               // una tarea pudo provocar un corte
        if (t.ultimaMs === null || k.relojMs - t.ultimaMs >= t.periodoMs) {
          const dtTarea = t.ultimaMs === null ? t.periodoMs : k.relojMs - t.ultimaMs;
          t.ultimaMs = k.relojMs;
          t.ejecuciones++;
          t.estado = 'EJECUTANDO';
          let r;
          try { r = t.fn(dtTarea); } catch (err) {
            k.log('ERROR', `Falla en la tarea ${t.id}: ${err.message}`);
            if (k.estricto) throw err;
          }
          t.estado = r === 'espera' ? 'EN ESPERA' : 'LISTA';
        }
      }
    };

    /** Avanza el reloj una cantidad de milisegundos simulados. */
    k.avanzar = function (ms) {
      const n = Math.round(ms / cfg.tickMs);
      for (let i = 0; i < n; i++) k.tick();
    };

    return k;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
