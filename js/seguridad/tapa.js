/*
 * LAVACRÁN OS — Tapa de cierre suave (función 9)
 *
 * Reglas acordadas:
 *  - La tapa NUNCA se traba: se puede abrir y cerrar en cualquier momento.
 *  - Si se abre con el programa en marcha, el ciclo se pausa al instante
 *    (motor frena, se cierran válvulas, se apagan bomba, resistencia y vapor).
 *  - Al cerrarla, el ciclo continúa solo... salvo que la ropa agregada
 *    supere el límite (E3): ahí espera a que se retire el exceso.
 *  - El "cierre suave" es mecánico (amortiguador): el interruptor recién
 *    avisa "cerrada" cuando la tapa termina de bajar.
 *
 * El interruptor de la tapa genera la interrupción IRQ1.
 * Responsable: Pareja 4 (seguridad y eventos).
 */
(function (L) {
  'use strict';

  L.crearTapa = function (s) {
    const T = { aperturas: 0, ultimaAperturaMs: null };

    T.isr = function (d) {
      const ciclo = s.ciclo;
      if (d.abierta) {
        T.aperturas++;
        T.ultimaAperturaMs = s.kernel.relojMs;
        if (s.hw.vapor) {
          s.hw.setVapor(false);
          s.kernel.log('SEGURIDAD', 'Vapor cortado al instante: la tapa se abrió');
        }
        if (ciclo.activo()) {
          ciclo.pausar('tapa');                    // también corta el agua: así se puede medir la ropa agregada
          s.sensores.alAbrirTapa();
        } else if (ciclo.estado === 'FIN') {
          ciclo.irAReposo();
        }
      } else if (ciclo.activo()) {
        s.sensores.alCerrarTapa();
        if (s.sensores.sobrecarga.activa) {
          s.kernel.log('ALERTA', 'La tapa se cerró pero la ropa supera el límite: no continúa');
        }
        ciclo.reanudar('tapa');
      }
      s.kernel.emit('tapa', { abierta: !!d.abierta });
    };

    s.kernel.registrarIRQ('IRQ1', 'Interruptor de tapa', 1, T.isr);
    return T;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
