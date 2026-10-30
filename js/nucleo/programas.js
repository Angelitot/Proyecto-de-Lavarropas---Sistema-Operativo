/*
 * LAVACRÁN OS — Programas de lavado y armado del plan de pasos
 *
 * Cada programa se convierte en una lista de pasos (el "plan"). La máquina de
 * estados (ciclo.js) ejecuta los pasos uno por uno.
 * Temperaturas: 0 = agua fría.  Centrifugado: 0 = sin centrifugado.
 *
 * Responsable: Pareja 3 (núcleo).
 */
(function (L) {
  'use strict';

  L.programas = [
    { id: 'normal', nombre: 'Normal / Algodón', corto: 'Normal', tipo: 'lavado', maxKg: 10,
      temps: [0, 30, 40, 60], tempDef: 30, rpms: [0, 400, 600, 800], rpmDef: 800,
      lavadoMin: 25, intensidad: 'normal', enjuagues: 2, enjuagueMin: 6, centrifIntermedio: true, centrifFinalMin: 7 },

    { id: 'sinteticos', nombre: 'Sintéticos', corto: 'Sintéticos', tipo: 'lavado', maxKg: 5,
      temps: [0, 30, 40], tempDef: 30, rpms: [0, 400, 600, 800], rpmDef: 600,
      lavadoMin: 18, intensidad: 'normal', enjuagues: 2, enjuagueMin: 5, centrifIntermedio: true, centrifFinalMin: 5 },

    { id: 'delicado', nombre: 'Delicado', corto: 'Delicado', tipo: 'lavado', maxKg: 3,
      temps: [0, 30], tempDef: 0, rpms: [0, 400, 600], rpmDef: 400,
      lavadoMin: 10, intensidad: 'suave', enjuagues: 2, enjuagueMin: 4, centrifIntermedio: false, centrifFinalMin: 4 },

    { id: 'pesado', nombre: 'Pesado / Toallas', corto: 'Pesado', tipo: 'lavado', maxKg: 10,
      temps: [0, 30, 40, 60], tempDef: 40, rpms: [0, 400, 600, 800], rpmDef: 800,
      lavadoMin: 32, intensidad: 'fuerte', enjuagues: 3, enjuagueMin: 6, centrifIntermedio: true, centrifFinalMin: 9 },

    { id: 'rapido', nombre: 'Rápido 30 min', corto: 'Rápido', tipo: 'lavado', maxKg: 3,
      temps: [0, 30, 40], tempDef: 0, rpms: [0, 400, 600, 800], rpmDef: 600,
      lavadoMin: 12, intensidad: 'normal', enjuagues: 1, enjuagueMin: 4, centrifIntermedio: false, centrifFinalMin: 5 },

    { id: 'vapor', nombre: 'Vapor / Higiene', corto: 'Vapor', tipo: 'lavado', maxKg: 10,
      temps: [30, 40, 60], tempDef: 40, rpms: [0, 400, 600, 800], rpmDef: 800,
      lavadoMin: 20, intensidad: 'normal', vaporMin: 12, enjuagues: 2, enjuagueMin: 6, centrifIntermedio: true, centrifFinalMin: 7 },

    { id: 'enjuague', nombre: 'Enjuague + Centrifugado', corto: 'Enjuague', tipo: 'enjuague', maxKg: 10,
      temps: [0], tempDef: 0, rpms: [0, 400, 600, 800], rpmDef: 800,
      enjuagues: 1, enjuagueMin: 6, centrifIntermedio: false, centrifFinalMin: 6 },

    { id: 'centrifugado', nombre: 'Solo centrifugado', corto: 'Centrifugado', tipo: 'centrifugado', maxKg: 10,
      temps: [0], tempDef: 0, rpms: [400, 600, 800], rpmDef: 800,
      enjuagues: 0, centrifFinalMin: 7 },

    { id: 'autolimpieza', nombre: 'Autolimpieza del tambor', corto: 'Autolimpieza', tipo: 'autolimpieza', maxKg: 0,
      temps: [60], tempDef: 60, rpms: [400], rpmDef: 400, nivelFijo: 'extra', sinEscalar: true,
      lavadoMin: 10, intensidad: 'fuerte', vaporMin: 8, enjuagues: 1, enjuagueMin: 5, centrifIntermedio: false, centrifFinalMin: 2 }
  ];

  L.programaPorId = id => L.programas.find(p => p.id === id) || null;

  /**
   * Arma la lista de pasos de un programa.
   * @param {object} prog programa
   * @param {object} sel  selección del panel {temp, nivel, rpm}
   * @param {object} opc  {sinPesaje: true} cuando ya se conoce la carga (reinicio por corte)
   */
  L.construirPlan = function (prog, sel, cfg, opc = {}) {
    const plan = [];
    const P = paso => plan.push(paso);
    const litros = prog.nivelFijo ? cfg.niveles[prog.nivelFijo]
      : (sel.nivel === 'auto' ? null : cfg.niveles[sel.nivel]);

    if (opc.desagotePrevio) P({ tipo: 'DESAGOTE', grupo: 'lavado', previo: true });
    if (!opc.sinPesaje) P({ tipo: 'PESAJE', grupo: 'lavado' });

    if (prog.tipo === 'centrifugado') {
      P({ tipo: 'DESAGOTE', grupo: 'centrifugado' });
      P({ tipo: 'CENTRIFUGADO', rpm: sel.rpm, min: prog.centrifFinalMin, final: true, grupo: 'centrifugado' });
    } else {
      if (prog.tipo !== 'enjuague') {
        P({ tipo: 'LLENADO', litros, auto: litros == null, temp: sel.temp, proposito: 'lavado', grupo: 'lavado' });
        if (sel.temp > 0) P({ tipo: 'CALENTAMIENTO', temp: sel.temp, grupo: 'lavado' });
        P({ tipo: 'LAVADO', base: prog.lavadoMin, min: prog.lavadoMin, intensidad: prog.intensidad,
          temp: sel.temp, escalar: !prog.sinEscalar, grupo: 'lavado' });
        P({ tipo: 'DESAGOTE', grupo: 'lavado' });
        if (prog.vaporMin) P({ tipo: 'VAPOR', min: prog.vaporMin, grupo: 'vapor' });
      }
      for (let i = 1; i <= prog.enjuagues; i++) {
        P({ tipo: 'LLENADO', litros, auto: litros == null, temp: 0, proposito: 'enjuague', grupo: 'enjuague' });
        P({ tipo: 'ENJUAGUE', min: prog.enjuagueMin, numero: i, de: prog.enjuagues, intensidad: 'normal', grupo: 'enjuague' });
        P({ tipo: 'DESAGOTE', grupo: 'enjuague' });
        if (i < prog.enjuagues && prog.centrifIntermedio) {
          P({ tipo: 'CENTRIFUGADO', rpm: cfg.rpmIntermedio, min: 1, final: false, grupo: 'enjuague' });
        }
      }
      P({ tipo: 'CENTRIFUGADO', rpm: sel.rpm, min: prog.centrifFinalMin, final: true, grupo: 'centrifugado' });
    }
    P({ tipo: 'FIN', grupo: 'fin' });
    return plan;
  };

  /** Nombre legible de un paso (para la pantalla y el registro). */
  L.nombrePaso = function (p) {
    if (!p) return '';
    switch (p.tipo) {
      case 'PESAJE': return 'Pesando la ropa';
      case 'LLENADO':
        if (p.proposito === 'balanceo') return `Agua para redistribuir (${p.litros} L)`;
        return `Cargando agua${p.litros ? ' (' + p.litros + ' L)' : ''}${p.proposito === 'enjuague' ? ' para enjuagar' : ''}`;
      case 'CALENTAMIENTO': return `Calentando a ${p.temp} °C`;
      case 'LAVADO': return 'Lavando';
      case 'ENJUAGUE': return p.balanceo ? 'Redistribuyendo la ropa' : `Enjuague ${p.numero} de ${p.de}`;
      case 'VAPOR': return 'Tratamiento con vapor';
      case 'DESAGOTE': return p.previo ? 'Desagotando el agua que quedó' : 'Desagotando';
      case 'CENTRIFUGADO': return p.final ? 'Centrifugado final' : 'Centrifugado intermedio';
      case 'FRENADO': return 'Frenando el tambor';
      case 'FIN': return 'Fin';
      default: return p.tipo;
    }
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
