/*
 * LAVACRÁN OS — Configuración general
 * Valores acordados en el cuestionario (prototipo 1). Si el profe pide otros
 * números, se cambian SOLO acá y todo el sistema se adapta.
 * Responsable: integrador del grupo.
 */
(function (L) {
  'use strict';

  L.config = {
    version: '1.0.0',
    modelo: 'LAVACRÁN',
    marca: 'Alacrán Group',

    // ---- Carga (kilaje) ----
    capacidadMaxKg: 10.0,        // máximo general de ropa seca
    toleranciaKg: 0.05,          // margen del sensor antes de declarar sobrecarga
    toleranciaTamborVacioKg: 0.3,// autolimpieza: se acepta hasta 300 g (ej. una media olvidada)
    taraKg: 18.0,                // peso de tina + tambor vacíos sobre las celdas de carga

    // ---- Agua ----
    niveles: { bajo: 25, medio: 40, alto: 55, extra: 70 },   // litros
    nivelAuto: { baseL: 20, porKgL: 5, minL: 25, maxL: 70 },  // auto = 20 L + 5 L por kg
    margenReposicionL: 3,        // si la ropa absorbe y baja 3 L, repone
    caudalEntradaLmin: 15,
    caudalDesagoteLmin: 25,
    tempAguaFriaC: 22,
    tempAguaCalienteC: 55,       // agua caliente de red (si está conectada)
    tempAmbienteC: 24,
    potenciaResistenciaW: 2000,
    potenciaVaporW: 2000,
    tempMaxVaporC: 75,
    absorcionLporKg: 1.6,        // agua que retiene 1 kg de ropa empapada

    // ---- Centrifugado ----
    rpmIntermedio: 400,
    rampaRpmPorSeg: 60,
    frenoRpmPorSeg: 150,

    // ---- Seguridad ----
    corteLuzLimiteMs: 20 * 60 * 1000,   // hasta 19:59 continúa; desde 20:00 reinicia
    vibracionUmbral: 50,                // 0-100 (acelerómetro)
    maxIntentosBalanceo: 3,
    rpmReducidoDesbalance: 400,
    timeoutLlenadoMs: 90 * 1000,        // E1 si en 90 s no sube el nivel
    timeoutDesagoteMs: 90 * 1000,       // E2 si en 90 s no baja el nivel

    // ---- Memoria ----
    lavadosParaAutolimpieza: 30,
    cantidadFavoritos: 3,

    // ---- Inicio diferido ("Inicia en X horas") ----
    diferidoPasosMin: [30, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 540, 600,
      660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200, 1260, 1320, 1380, 1440],

    // ---- Sistema ----
    tickMs: 100,                        // un tick del reloj del SO = 100 ms
    checkpointCadaMs: 5000              // guardado periódico en memoria no volátil
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
