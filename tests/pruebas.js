/*
 * LAVACRÁN OS — Pruebas automáticas de las reglas acordadas.
 * Se corren abriendo pruebas.html en el navegador (o con: node tests/correr-en-node.js).
 * Cada prueba arma un lavarropas nuevo, simula la situación y verifica el resultado.
 * El tiempo es simulado: una hora de lavado se prueba en milisegundos.
 */
(function (L) {
  'use strict';

  const { prueba, grupo, afirmar, cerca } = L.pruebas;
  const MIN = 60000;

  // ---------------- ayudas ----------------
  function nuevo() {
    const s = L.crearSistema({ eeprom: L.crearEEPROMMemoria(), relojInicialMs: Date.UTC(2026, 10, 2, 11, 0, 0), estricto: true });
    L.arrancarSistema(s);
    return s;
  }
  const agregar = (s, kg, nombre) => s.hw.agregarPrenda({ nombre: nombre || 'Prenda de prueba', kg, color: '#888' });
  function cargar(s, ...kgs) {
    s.hw.abrirTapa();
    kgs.forEach(kg => agregar(s, kg));
    s.hw.cerrarTapa();
  }
  function hasta(s, cond, maxMs = 4 * 60 * MIN, alPaso) {
    let t = 0;
    while (!cond() && t < maxMs) { s.kernel.tick(); t += 100; if (alPaso) alPaso(); }
    return !!cond();
  }
  const tipo = s => s.ciclo.paso && s.ciclo.paso.tipo;
  const hastaPaso = (s, t, maxMs) => hasta(s, () => tipo(s) === t, maxMs);
  function iniciar(s, programaId, cambios = {}) {
    s.control.presionar('PROGRAMA', programaId);
    Object.assign(s.control.sel, cambios);
    s.control.presionar('INICIO');
  }
  const contarLog = (s, texto) => s.kernel.registro.filter(e => e.mensaje.includes(texto)).length;

  // =====================================================================
  grupo('2 y 3 · Sensor de carga y nivel automático');

  prueba('Detecta 4 kg y fija el nivel automático en 40 L', () => {
    const s = nuevo();
    cargar(s, 2, 2);
    iniciar(s, 'normal');
    afirmar(hastaPaso(s, 'LLENADO', 2 * MIN), 'no pasó del pesaje al llenado');
    cerca(s.ciclo.ropaKg, 4, 0.05, 'kg detectados');
    afirmar(s.ciclo.paso.litros === 40, `litros planificados: ${s.ciclo.paso.litros}`);
  });

  prueba('Nivel automático: 1 kg → 25 L, 6 kg → 50 L, 10 kg → 70 L', () => {
    const s = nuevo();
    afirmar(s.sensores.nivelAuto(1) === 25, 'con 1 kg');
    afirmar(s.sensores.nivelAuto(6) === 50, 'con 6 kg');
    afirmar(s.sensores.nivelAuto(10) === 70, 'con 10 kg');
  });

  prueba('La duración del lavado se adapta: con 2 kg es más corto que con 10 kg', () => {
    const a = nuevo(); cargar(a, 2); iniciar(a, 'normal', { temp: 0 }); hastaPaso(a, 'LAVADO');
    const b = nuevo(); cargar(b, 5, 5); iniciar(b, 'normal', { temp: 0 }); hastaPaso(b, 'LAVADO');
    afirmar(a.ciclo.paso.min < b.ciclo.paso.min, `2 kg: ${a.ciclo.paso.min} min, 10 kg: ${b.ciclo.paso.min} min`);
  });

  prueba('Mientras lava, repone agua cuando la ropa la absorbe', () => {
    const s = nuevo(); cargar(s, 4, 4); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO');
    afirmar(hasta(s, () => contarLog(s, 'Ajuste automático de nivel') > 0, 10 * MIN), 'nunca repuso agua');
  });

  // =====================================================================
  grupo('8 · Kilaje y sobrecarga');

  prueba('Con 10,5 kg no arranca (E3) y sigue solo al retirar 0,5 kg', () => {
    const s = nuevo();
    cargar(s, 6, 4, 0.5);
    iniciar(s, 'normal');
    afirmar(hasta(s, () => s.alarmas.activas.E3, 2 * MIN), 'debía marcar E3');
    afirmar(s.ciclo.estadoVisible() === 'PAUSA' && s.hw.aguaLibreL === 0, 'no debe cargar agua');
    s.hw.abrirTapa(); s.avanzar(1000);
    s.hw.quitarPrenda(); s.avanzar(1500);
    afirmar(!s.alarmas.activas.E3, 'E3 debía apagarse al quitar la ropa');
    s.hw.cerrarTapa();
    afirmar(hastaPaso(s, 'LLENADO', 2 * MIN), 'debía continuar');
    cerca(s.ciclo.ropaKg, 10, 0.06, 'carga final');
  });

  prueba('Límite por programa: Rápido admite hasta 3 kg', () => {
    const s = nuevo(); cargar(s, 2, 1.5); iniciar(s, 'rapido');
    afirmar(hasta(s, () => s.alarmas.activas.E3, 2 * MIN), '3,5 kg en Rápido debía ser sobrecarga');
    afirmar(s.alarmas.activas.E3.limiteKg === 3, 'el límite informado debía ser 3 kg');
    const t = nuevo(); cargar(t, 2, 0.9); iniciar(t, 'rapido');
    afirmar(hastaPaso(t, 'LLENADO', 2 * MIN) && !t.alarmas.activas.E3, '2,9 kg en Rápido debía arrancar');
  });

  prueba('Agregar ropa en marcha sin pasar el límite: continúa y sube el nivel', () => {
    const s = nuevo(); cargar(s, 3, 3); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO'); s.avanzar(30000);
    afirmar(s.ciclo.litrosObjetivo === 50, `nivel con 6 kg: ${s.ciclo.litrosObjetivo}`);
    s.hw.abrirTapa(); s.avanzar(1500);
    agregar(s, 1); agregar(s, 1); s.avanzar(1500);
    s.hw.cerrarTapa();
    cerca(s.ciclo.ropaKg, 8, 0.06, 'carga después de agregar');
    afirmar(s.ciclo.litrosObjetivo === 60, `nivel con 8 kg: ${s.ciclo.litrosObjetivo}`);
    afirmar(!s.alarmas.activas.E3 && s.ciclo.estadoVisible() === 'EN_MARCHA', 'debía seguir lavando');
    afirmar(hasta(s, () => s.hw.aguaLibreL >= 59, 5 * MIN), 'debía reponer agua hasta 60 L');
  });

  prueba('Agregar ropa que supera los 10 kg: se detiene hasta retirar el exceso', () => {
    const s = nuevo(); cargar(s, 5, 4); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO'); s.avanzar(30000);
    s.hw.abrirTapa(); s.avanzar(1000);
    agregar(s, 1); agregar(s, 1); s.avanzar(1500);
    afirmar(s.alarmas.activas.E3, 'debía marcar E3 con la tapa abierta');
    cerca(s.sensores.sobrecarga.excesoKg, 1, 0.08, 'exceso informado');
    s.hw.cerrarTapa(); s.avanzar(5000);
    afirmar(s.ciclo.pausas.has('sobrecarga'), 'con la tapa cerrada y sobrecarga no debía continuar');
    const t0 = s.ciclo.paso.t; s.avanzar(30000);
    afirmar(s.ciclo.paso.t === t0, 'el lavado no debía avanzar');
    s.hw.abrirTapa(); s.avanzar(1000);
    s.hw.quitarPrenda(); s.avanzar(1500);
    afirmar(!s.alarmas.activas.E3, 'al quitar 1 kg debía liberarse');
    s.hw.cerrarTapa();
    afirmar(s.ciclo.estadoVisible() === 'EN_MARCHA', 'debía continuar al cerrar');
    cerca(s.ciclo.ropaKg, 10, 0.08, 'carga final');
  });

  // =====================================================================
  grupo('9 · Tapa de cierre suave (nunca se traba)');

  prueba('Abrir durante el lavado pausa al instante y al cerrar continúa', () => {
    const s = nuevo(); cargar(s, 5); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO'); s.avanzar(MIN);
    const t0 = s.ciclo.paso.t;
    s.hw.abrirTapa();
    afirmar(s.ciclo.estadoVisible() === 'PAUSA', 'debía pausar');
    afirmar(s.hw.valvulaFria + s.hw.valvulaCaliente === 0 && s.hw.motor.modo === 'apagado', 'válvulas y motor debían cortarse');
    s.avanzar(2 * MIN);
    afirmar(s.ciclo.paso.t === t0 && Math.abs(s.hw.rpm) < 1, 'en pausa no avanza y el impulsor queda quieto');
    s.hw.cerrarTapa();
    afirmar(s.ciclo.estadoVisible() === 'EN_MARCHA', 'debía continuar');
    s.avanzar(10000);
    afirmar(s.ciclo.paso.t > t0, 'el lavado debía seguir contando');
  });

  prueba('En pleno centrifugado la tapa se puede abrir: el tambor frena y pausa', () => {
    const s = nuevo(); cargar(s, 3); iniciar(s, 'centrifugado');
    afirmar(hasta(s, () => tipo(s) === 'CENTRIFUGADO' && s.ciclo.paso.fase === 'meseta', 10 * MIN), 'no llegó a 800 rpm');
    s.hw.abrirTapa();
    afirmar(s.hw.tapaAbierta && s.ciclo.estadoVisible() === 'PAUSA', 'la tapa debía abrirse y pausar');
    s.avanzar(6000);
    afirmar(Math.abs(s.hw.rpm) < 1, 'el tambor debía frenar');
    s.hw.cerrarTapa(); s.avanzar(3000);
    afirmar(s.hw.rpm > 50, 'debía volver a acelerar');
  });

  prueba('Pausa del usuario + tapa: al cerrar sigue en pausa hasta presionar Inicio', () => {
    const s = nuevo(); cargar(s, 3); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO');
    s.control.presionar('INICIO');
    afirmar(s.ciclo.pausas.has('usuario'), 'Inicio/Pausa debía pausar');
    s.hw.abrirTapa(); s.hw.cerrarTapa();
    afirmar(s.ciclo.estadoVisible() === 'PAUSA', 'debía seguir pausado por el usuario');
    s.control.presionar('INICIO');
    afirmar(s.ciclo.estadoVisible() === 'EN_MARCHA', 'Inicio debía reanudar');
  });

  // =====================================================================
  grupo('Corte de luz (hasta 19:59 continúa, desde 20:00 reinicia)');

  prueba('Corte de 19:59: continúa en el mismo paso y con el mismo avance', () => {
    const s = nuevo(); cargar(s, 5); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO'); s.avanzar(5 * MIN);
    const indice = s.ciclo.indice, t0 = s.ciclo.paso.t;
    s.energia.cortar(19 * MIN + 59 * 1000);
    afirmar(s.ciclo.estado === 'SIN_ENERGIA' && !s.kernel.enEjecucion, 'debía apagarse');
    s.energia.restaurarYa();
    afirmar(s.ciclo.estado === 'EN_MARCHA' && s.ciclo.indice === indice, 'debía retomar el mismo paso');
    cerca(s.ciclo.paso.t, t0, 1000, 'avance del lavado');
    afirmar(s.energia.ultimoArranque.decision === 'continúa donde quedó', s.energia.ultimoArranque.decision);
  });

  prueba('Corte de 20:00: desagota y reinicia el programa desde cero', () => {
    const s = nuevo(); cargar(s, 5); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO'); s.avanzar(5 * MIN);
    s.energia.cortar(20 * MIN);
    s.energia.restaurarYa();
    afirmar(s.energia.ultimoArranque.decision === 'desagota y reinicia el programa', s.energia.ultimoArranque.decision);
    afirmar(tipo(s) === 'DESAGOTE' && s.ciclo.paso.previo, 'el primer paso debía ser desagotar');
    afirmar(hastaPaso(s, 'LLENADO', 10 * MIN), 'después debía volver a cargar agua');
    afirmar(s.ciclo.desagotesHechos === 1 && s.ciclo.plan.some(p => p.tipo === 'LAVADO' && !p.iniciado), 'el lavado debía empezar de nuevo');
    cerca(s.ciclo.ropaKg, 5, 0.05, 'conserva la carga medida');
  });

  prueba('Corte durante el inicio diferido: la cuenta regresiva sigue con la batería', () => {
    const s = nuevo(); cargar(s, 3);
    s.control.presionar('PROGRAMA', 'normal');
    s.control.presionar('DIFERIDO'); s.control.presionar('DIFERIDO');
    s.control.presionar('INICIO');
    afirmar(s.ciclo.estado === 'PROGRAMADO', 'debía quedar programado');
    s.avanzar(10 * MIN);
    s.energia.cortar(15 * MIN); s.energia.restaurarYa();
    afirmar(s.ciclo.estado === 'PROGRAMADO', 'debía seguir programado');
    cerca(s.diferido.restanteMs(), 35 * MIN, 2000, 'tiempo restante');
  });

  prueba('Cerrar la página es como un corte: al volver en 5 min continúa', () => {
    const s = nuevo(); cargar(s, 4); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO'); s.avanzar(2 * MIN);
    s.energia.guardar('prueba');
    const cp = s.eeprom.leer('checkpoint'); cp.realMs = Date.now() - 5 * MIN; s.eeprom.escribir('checkpoint', cp);
    const s2 = L.crearSistema({ eeprom: s.eeprom, estricto: true });
    afirmar(L.arrancarSistema(s2) === 'continúa donde quedó', 'debía continuar');
    afirmar(tipo(s2) === 'LAVADO' && s2.hw.prendas.length === 1, 'debía retomar el lavado con la misma ropa');
    cp.realMs = Date.now() - 25 * MIN; s.eeprom.escribir('checkpoint', cp);
    const s3 = L.crearSistema({ eeprom: s.eeprom, estricto: true });
    afirmar(L.arrancarSistema(s3) === 'desagota y reinicia el programa', 'a los 25 min debía reiniciar');
  });

  // =====================================================================
  grupo('7 · Inicio diferido y memoria de programas');

  prueba('Inicio diferido de 30 min: arranca justo a la hora programada', () => {
    const s = nuevo(); cargar(s, 3);
    s.control.presionar('PROGRAMA', 'sinteticos');
    s.control.presionar('DIFERIDO');
    s.control.presionar('INICIO');
    afirmar(s.ciclo.estado === 'PROGRAMADO', 'debía quedar programado');
    s.avanzar(29 * MIN + 50 * 1000);
    afirmar(s.ciclo.estado === 'PROGRAMADO', 'no debía arrancar antes');
    s.avanzar(15 * 1000);
    afirmar(s.ciclo.estado === 'EN_MARCHA' && s.ciclo.programa.id === 'sinteticos', 'debía arrancar Sintéticos');
  });

  prueba('Memoria: guarda en M1, lo recupera y recuerda el último usado', () => {
    const s = nuevo();
    s.control.presionar('PROGRAMA', 'delicado');
    s.control.presionar('TEMPERATURA');
    s.control.presionar('MEMORIA', { n: 1, guardar: true });
    s.control.presionar('PROGRAMA', 'pesado');
    s.control.presionar('MEMORIA', { n: 1 });
    afirmar(s.control.sel.programaId === 'delicado' && s.control.sel.temp === 30, 'M1 debía traer Delicado a 30 °C');
    cargar(s, 2); s.control.presionar('INICIO'); s.avanzar(1000);
    const otro = L.crearSistema({ eeprom: s.eeprom });
    afirmar(otro.control.sel.programaId === 'delicado', 'al encender debía recordar el último usado');
  });

  prueba('El centrifugado se puede cambiar en marcha y el final usa la nueva velocidad', () => {
    const s = nuevo(); cargar(s, 3); iniciar(s, 'normal', { temp: 0, rpm: 800 });
    hastaPaso(s, 'LAVADO');
    s.control.presionar('CENTRIFUGADO'); s.control.presionar('CENTRIFUGADO');   // 800 -> sin -> 400
    afirmar(s.ciclo.sel.rpm === 400, `quedó en ${s.ciclo.sel.rpm}`);
    afirmar(hasta(s, () => tipo(s) === 'CENTRIFUGADO' && s.ciclo.paso.final && s.ciclo.paso.fase === 'meseta', 3 * 60 * MIN), 'no llegó al centrifugado final');
    cerca(s.hw.rpm, 400, 6, 'velocidad final');
  });

  // =====================================================================
  grupo('4, 5 y 6 · Vapor, lavado rápido y autolimpieza');

  prueba('Lavado rápido: con 3 kg termina en 30 minutos o menos', () => {
    const s = nuevo(); cargar(s, 3); iniciar(s, 'rapido');
    const t0 = s.kernel.relojMs;
    afirmar(hasta(s, () => s.ciclo.estado === 'FIN', 60 * MIN), 'no terminó');
    const dur = (s.kernel.relojMs - t0) / MIN;
    afirmar(dur <= 30, `duró ${dur.toFixed(1)} min`);
  });

  prueba('Vapor: al abrir la tapa el generador se apaga en el mismo instante', () => {
    const s = nuevo(); cargar(s, 4); iniciar(s, 'vapor');
    afirmar(hasta(s, () => tipo(s) === 'VAPOR' && s.hw.vapor, 3 * 60 * MIN), 'no llegó a la fase de vapor');
    s.hw.abrirTapa();
    afirmar(!s.hw.vapor, 'el vapor debía cortarse al instante');
    s.avanzar(5000);
    afirmar(!s.hw.vapor, 'no debía volver con la tapa abierta');
    s.hw.cerrarTapa(); s.avanzar(1000);
    afirmar(s.hw.vapor || s.sensores.tempC >= 74, 'al cerrar debía seguir el vapor');
  });

  prueba('Autolimpieza: con ropa no arranca; vacía sí, y reinicia el contador de 30 lavados', () => {
    const s = nuevo();
    s.memoria.fijarLavados(30);
    afirmar(s.memoria.necesitaAutolimpieza(), 'a los 30 lavados debía recomendarla');
    cargar(s, 1); iniciar(s, 'autolimpieza');
    afirmar(hasta(s, () => s.alarmas.activas.E3, 2 * MIN), 'con ropa debía avisar');
    s.hw.abrirTapa(); s.avanzar(500); s.hw.vaciarTambor(); s.avanzar(1500);
    afirmar(!s.alarmas.activas.E3, 'vacía debía liberarse');
    s.hw.cerrarTapa();
    afirmar(hasta(s, () => s.ciclo.estado === 'FIN', 3 * 60 * MIN), 'no terminó');
    afirmar(s.memoria.lavados() === 0, 'el contador debía volver a 0');
  });

  // =====================================================================
  grupo('Desbalance y errores');

  prueba('Desbalance que se corrige: redistribuye y centrifuga a 800 rpm', () => {
    const s = nuevo(); cargar(s, 5); iniciar(s, 'centrifugado');
    s.hw.provocarDesbalance(true);
    let e4 = false, maxRpm = 0;
    s.kernel.on('alarma', a => { if (a.codigo === 'E4' && a.activa) e4 = true; });
    afirmar(hasta(s, () => s.ciclo.estado === 'FIN', 60 * MIN, () => { maxRpm = Math.max(maxRpm, s.hw.rpm); }), 'no terminó');
    const intentos = contarLog(s, 'Desbalance: se redistribuye');
    afirmar(intentos >= 1 && intentos <= 3, `intentos: ${intentos}`);
    afirmar(!e4 && maxRpm > 795, `E4: ${e4}, rpm máx: ${Math.round(maxRpm)}`);
  });

  prueba('Desbalance que no se corrige: 3 intentos y centrifuga a 400 rpm (E4)', () => {
    const s = nuevo(); cargar(s, 5); iniciar(s, 'centrifugado');
    s.hw.provocarDesbalance(false);
    let e4 = false;
    s.kernel.on('alarma', a => { if (a.codigo === 'E4' && a.activa) e4 = true; });
    afirmar(hasta(s, () => s.ciclo.estado === 'FIN', 60 * MIN), 'no terminó');
    afirmar(contarLog(s, 'Desbalance: se redistribuye') === 3, 'debían ser 3 intentos');
    afirmar(e4 && s.ciclo.rpmMaxForzado === 400, 'debía limitar a 400 rpm con E4');
  });

  prueba('Falta de agua: E1 y, al abrir la canilla y presionar Inicio, sigue', () => {
    const s = nuevo(); s.hw.canillaAbierta = false;
    cargar(s, 3); iniciar(s, 'normal', { temp: 0 });
    afirmar(hasta(s, () => s.alarmas.activas.E1, 5 * MIN), 'debía marcar E1');
    afirmar(s.ciclo.pausas.has('error'), 'debía detenerse');
    s.hw.canillaAbierta = true;
    s.control.presionar('INICIO');
    afirmar(!s.alarmas.activas.E1 && hastaPaso(s, 'LAVADO', 10 * MIN), 'debía seguir hasta lavar');
  });

  prueba('Desagote tapado: E2 y, al destaparlo y presionar Inicio, sigue', () => {
    const s = nuevo(); cargar(s, 3); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO');
    s.hw.desagoteTapado = true;
    afirmar(hasta(s, () => s.alarmas.activas.E2, 60 * MIN), 'debía marcar E2');
    s.hw.desagoteTapado = false;
    s.control.presionar('INICIO');
    afirmar(hasta(s, () => tipo(s) === 'LLENADO' && s.ciclo.paso.proposito === 'enjuague', 10 * MIN), 'debía terminar de desagotar y enjuagar');
  });

  // =====================================================================
  grupo('1 · Panel, temperatura y ciclo completo');

  prueba('60 °C sin agua caliente conectada: calienta con la resistencia', () => {
    const s = nuevo(); s.hw.aguaCalienteConectada = false;
    cargar(s, 4); iniciar(s, 'normal', { temp: 60 });
    afirmar(hastaPaso(s, 'CALENTAMIENTO', 10 * MIN) && s.sensores.tempC < 30, 'el agua debía entrar fría');
    afirmar(hastaPaso(s, 'LAVADO', 3 * 60 * MIN), 'no terminó de calentar');
    afirmar(s.sensores.tempC >= 59.5, `temperatura: ${s.sensores.tempC.toFixed(1)}`);
  });

  prueba('Con agua caliente conectada, 40 °C llega casi sin usar la resistencia', () => {
    const s = nuevo(); cargar(s, 4); iniciar(s, 'normal', { temp: 40 });
    afirmar(hastaPaso(s, 'CALENTAMIENTO', 10 * MIN), 'no llegó');
    const t0 = s.kernel.relojMs;
    hastaPaso(s, 'LAVADO', 60 * MIN);
    afirmar((s.kernel.relojMs - t0) < 10 * MIN, `calentó durante ${((s.kernel.relojMs - t0) / MIN).toFixed(1)} min`);
  });

  prueba('Inicio/Pausa pausa y reanuda; mantenerlo cancela y desagota', () => {
    const s = nuevo(); cargar(s, 4); iniciar(s, 'normal', { temp: 0 });
    hastaPaso(s, 'LAVADO');
    s.control.presionar('INICIO');
    afirmar(s.ciclo.estadoVisible() === 'PAUSA', 'debía pausar');
    s.control.presionar('INICIO');
    afirmar(s.ciclo.estadoVisible() === 'EN_MARCHA', 'debía reanudar');
    s.control.presionar('CANCELAR');
    afirmar(hasta(s, () => s.ciclo.estado === 'REPOSO', 10 * MIN), 'debía volver a reposo');
    afirmar(s.hw.aguaLibreL < 0.5 && s.ciclo.resultado === 'cancelado', 'debía desagotar');
  });

  prueba('Programa Normal completo: termina, sin agua, ropa centrifugada y cuenta un lavado', () => {
    const s = nuevo(); cargar(s, 3, 3); iniciar(s, 'normal');
    const t0 = s.kernel.relojMs;
    let estimado = null;
    afirmar(hasta(s, () => s.ciclo.estado === 'FIN', 3 * 60 * MIN, () => {
      if (estimado === null && tipo(s) === 'LLENADO') estimado = s.ciclo.restanteMs();
    }), 'no terminó');
    const dur = s.kernel.relojMs - t0;
    afirmar(dur > 45 * MIN && dur < 90 * MIN, `duró ${(dur / MIN).toFixed(1)} min`);
    afirmar(Math.abs(estimado - dur) < 12 * MIN, `estimado ${(estimado / MIN).toFixed(0)} min vs real ${(dur / MIN).toFixed(0)} min`);
    afirmar(s.hw.aguaLibreL < 0.5, 'quedó agua');
    afirmar(s.hw.aguaAbsorbidaL() < 6 * 0.75, `la ropa quedó con ${s.hw.aguaAbsorbidaL().toFixed(1)} L`);
    afirmar(s.memoria.lavados() === 1, 'debía contar 1 lavado');
  });

  prueba('Apagado: no se puede apagar con un programa en marcha', () => {
    const s = nuevo(); cargar(s, 2); iniciar(s, 'normal');
    s.avanzar(5000);
    s.control.presionar('ENCENDIDO');
    afirmar(s.control.encendido && s.ciclo.activo(), 'debía seguir encendido');
  });
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
