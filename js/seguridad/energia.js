/*
 * LAVACRÁN OS — Corte de luz y memoria no volátil
 *
 * Regla acordada:  corte de hasta 19:59  -> continúa donde quedó
 *                  corte de 20:00 o más  -> desagota y reinicia el programa
 *
 * Cómo lo resuelve el SO:
 *  1. El detector de baja tensión dispara la NMI (interrupción no enmascarable):
 *     la ISR guarda el estado del ciclo en la EEPROM antes de quedarse sin energía.
 *  2. Además, la tarea T5 guarda un "checkpoint" cada 5 s y en cada cambio de fase.
 *  3. Al volver la luz, el SO arranca (boot), lee la EEPROM y mide cuánto duró el
 *     corte con el reloj (RTC) que tiene batería propia. Con eso decide.
 *  4. Cerrar la pestaña del navegador también cuenta como corte: al volver a abrirla
 *     se mide el tiempo real que estuvo cerrada.
 *
 * Responsable: Pareja 4 (seguridad y eventos).
 */
(function (L) {
  'use strict';

  L.crearEnergia = function (s) {
    const c = s.config, u = L.util;
    const E = { corte: null, ultimoGuardadoMs: null, ultimoArranque: null };

    /** Guarda el estado del SO en la memoria no volátil. */
    E.guardar = function (motivo) {
      if (!s.kernel.enEjecucion) return;
      const cp = {
        version: 1,
        motivo,
        relojMs: s.kernel.relojMs,
        realMs: Date.now(),
        ciclo: s.ciclo.exportar(),
        diferido: s.diferido.exportar(),
        sensores: s.sensores.exportar(),
        alarmas: s.alarmas.exportar(),
        control: s.control.exportar()
      };
      s.eeprom.escribir('checkpoint', cp);
      s.eeprom.escribir('mundo', s.hw.serializar());
      E.ultimoGuardadoMs = s.kernel.relojMs;
    };

    /** Tarea T5 (cada 5 s). */
    E.tarea = function () { E.guardar('periódico'); };

    /** ISR de la NMI. */
    E.isrFalla = function () {
      E.guardar('NMI: falla de energía');
      s.kernel.log('ENERGIA', 'Estado guardado en la memoria no volátil antes de apagarse');
    };

    /** Panel de pruebas: simula un corte de luz de cierta duración (ms simulados). */
    E.cortar = function (duracionMs) {
      if (E.corte) return false;
      s.kernel.irq('NMI', { detalle: `el corte va a durar ${u.mmss(duracionMs)}` });
      E.corte = { inicioMs: s.kernel.relojMs, duracionMs };
      s.hw.cortarEnergia();
      s.kernel.enEjecucion = false;
      s.ciclo.perderRAM();
      s.kernel.emit('energia', { hay: false, duracionMs });
      return true;
    };

    E.restanteMs = () => (E.corte ? Math.max(0, E.corte.inicioMs + E.corte.duracionMs - s.kernel.relojMs) : 0);

    /** Mientras no hay luz el kernel solo llama a esto (el mundo decide cuándo vuelve). */
    E.tickSinEnergia = function () {
      if (E.corte && s.kernel.relojMs - E.corte.inicioMs >= E.corte.duracionMs) E.restaurar();
    };

    /** Panel de pruebas: adelanta el tiempo hasta que vuelva la luz. */
    E.restaurarYa = function () {
      let guardia = 0;
      while (E.corte && guardia++ < 2e6) s.kernel.tick();
    };

    E.restaurar = function () {
      const dur = s.kernel.relojMs - E.corte.inicioMs;
      E.corte = null;
      s.hw.restaurarEnergia();
      s.kernel.enEjecucion = true;
      s.kernel.reiniciarTareas();
      E.arrancar(dur, 'volvió la luz');
      s.kernel.emit('energia', { hay: true, duracionMs: dur });
    };

    /**
     * Secuencia de arranque (boot). durCorteMs = cuánto tiempo estuvo sin energía.
     */
    E.arrancar = function (durCorteMs, origen) {
      s.kernel.log('SISTEMA', `Arranque de LAVACRÁN OS ${c.version} (${origen})`);
      s.kernel.log('SISTEMA', 'Leyendo la memoria no volátil');
      const cp = s.eeprom.leer('checkpoint');
      s.sensores.reiniciar();
      s.alarmas.importar(null);
      if (cp && cp.control) s.control.importar(cp.control);

      const estado = cp && cp.ciclo ? cp.ciclo.estado : null;
      const txt = u.mmss(durCorteMs);
      let decision = 'sin programa en curso';

      if (estado === 'PROGRAMADO' && cp.diferido) {
        decision = s.diferido.restaurar(cp.diferido, durCorteMs);
      } else if (estado === 'EN_MARCHA') {
        s.sensores.importar(cp.sensores);
        if (durCorteMs < c.corteLuzLimiteMs) {
          decision = 'continúa donde quedó';
          s.kernel.log('ENERGIA', `Corte de ${txt}: menos de 20:00, continúa donde quedó`);
          s.alarmas.importar(cp.alarmas);
          s.ciclo.restaurar(cp.ciclo);
        } else {
          decision = 'desagota y reinicia el programa';
          s.kernel.log('ENERGIA', `Corte de ${txt}: 20:00 o más, desagota y reinicia el programa desde cero`);
          s.sensores.limpiarSobrecarga();
          s.ciclo.reiniciarDesdeCero(cp.ciclo);
        }
      } else {
        s.ciclo.irAReposo();
        if (!s.control.encendido) s.ciclo.estado = 'APAGADO';
        if (durCorteMs > 0) s.kernel.log('ENERGIA', `Corte de ${txt}: no había programa en curso`);
      }

      // La tapa pudo moverse durante el corte: se vuelve a leer el interruptor
      if (s.hw.leerTapa() && s.ciclo.activo()) {
        s.ciclo.pausar('tapa');
        s.sensores.alAbrirTapa();
      }
      E.ultimoArranque = { durMs: durCorteMs, decision, origen, enMs: s.kernel.relojMs };
      E.guardar('arranque');
      return decision;
    };

    return E;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
