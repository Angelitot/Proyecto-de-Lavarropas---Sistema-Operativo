/*
 * LAVACRÁN OS — Armado del sistema
 *
 * Crea todos los módulos, registra las interrupciones y las tareas del
 * planificador. Lo usan tanto la página (main.js) como las pruebas.
 *
 *  Interrupciones (menor número = más urgente)
 *    NMI   Falla de energía (no enmascarable)      -> energia.isrFalla
 *    IRQ0  Temporizador del sistema (cada 100 ms)  -> cuenta los ticks
 *    IRQ1  Interruptor de tapa                     -> tapa.isr
 *    IRQ2  Panel de control (teclado)              -> control.isr
 *    IRQ3  Acelerómetro (vibración)                -> ciclo.isrVibracion
 *
 *  Tareas (prioridad fija, período)
 *    T1 Sensores               1   100 ms
 *    T2 Supervisor de fallas   2   1 s
 *    T3 Control del ciclo      3   200 ms
 *    T4 Inicio diferido        4   1 s
 *    T5 Memoria no volátil     5   5 s
 *
 * Responsable: Pareja 3 (núcleo).
 */
(function (L) {
  'use strict';

  L.crearSistema = function (opc = {}) {
    const s = { config: L.config };
    s.eeprom = opc.eeprom || L.crearEEPROM();
    s.kernel = L.crearKernel(s, opc);
    s.hw = L.crearPlanta(s);
    s.memoria = L.crearMemoria(s);
    s.sensores = L.crearSensores(s);
    s.alarmas = L.crearAlarmas(s);
    s.ciclo = L.crearCiclo(s);          // registra IRQ3
    s.diferido = L.crearDiferido(s);
    s.tapa = L.crearTapa(s);            // registra IRQ1
    s.energia = L.crearEnergia(s);
    s.control = L.crearControl(s);      // registra IRQ2

    const k = s.kernel;
    k.registrarIRQ('NMI', 'Falla de energía', -1, s.energia.isrFalla);
    k.registrarIRQ('IRQ0', 'Temporizador del sistema', 0, null, { silenciosa: true });

    k.crearTarea('T1', 'Sensores', 1, 100, s.sensores.tarea);
    k.crearTarea('T2', 'Supervisor de fallas', 2, 1000, s.alarmas.tarea);
    k.crearTarea('T3', 'Control del ciclo', 3, 200, s.ciclo.tarea);
    k.crearTarea('T4', 'Inicio diferido', 4, 1000, s.diferido.tarea);
    k.crearTarea('T5', 'Memoria no volátil', 5, s.config.checkpointCadaMs, s.energia.tarea);

    s.sensores.leer();
    s.avanzar = ms => k.avanzar(ms);
    return s;
  };

  /** Arranque normal o recuperación (si había un programa guardado). */
  L.arrancarSistema = function (s, opc = {}) {
    const cp = s.eeprom.leer('checkpoint');
    const mundo = s.eeprom.leer('mundo');
    if (mundo) s.hw.cargar(mundo);
    if (cp && opc.recuperar !== false) {
      const durMs = Math.max(0, Date.now() - (cp.realMs || Date.now()));
      return s.energia.arrancar(durMs, 'se abrió la página');
    }
    s.kernel.log('SISTEMA', `Arranque de LAVACRÁN OS ${s.config.version}`);
    s.kernel.log('SISTEMA', 'Memoria no volátil vacía: estado de fábrica');
    s.ciclo.irAReposo();
    s.energia.guardar('arranque');
    return 'arranque limpio';
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
