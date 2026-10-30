/*
 * LAVACRÁN OS — Inicio diferido (función 7)
 *
 * "Inicia en X horas": de 30 min a 24 h. El botón Diferido suma 30 min hasta
 * las 3 h y después de a 1 h. La cuenta regresiva usa el reloj del sistema,
 * que tiene batería: si se corta la luz, la espera sigue contando.
 * Si la hora de inicio pasó durante el corte, arranca apenas vuelve la luz.
 *
 * La tarea T4 revisa cada 1 s si llegó la hora.
 * Responsable: Pareja 1 (panel de control).
 */
(function (L) {
  'use strict';

  L.crearDiferido = function (s) {
    const u = L.util;
    const D = { inicioMs: null, sel: null };

    D.activo = () => D.inicioMs != null;
    D.restanteMs = () => (D.activo() ? Math.max(0, D.inicioMs - s.kernel.relojMs) : 0);

    D.programar = function (minutos, sel) {
      D.inicioMs = s.kernel.relojMs + minutos * 60000;
      D.sel = u.copiar(sel);
      D.sel.diferidoMin = 0;
      s.ciclo.estado = 'PROGRAMADO';
      s.memoria.guardarUltimo(sel);
      s.kernel.log('ESTADO', `Inicio diferido: comienza en ${u.hmm(minutos * 60000)} h, a las ${u.hora(D.inicioMs).slice(0, 5)}`);
      s.kernel.emit('diferido', { activo: true });
      s.energia.guardar('inicio diferido');
    };

    /** Tarea T4 (cada 1 s). */
    D.tarea = function () {
      if (!D.activo() || s.ciclo.estado !== 'PROGRAMADO') return 'espera';
      if (s.kernel.relojMs >= D.inicioMs) {
        const sel = D.sel;
        D.limpiar();
        s.kernel.log('ESTADO', 'Llegó la hora programada: comienza el lavado');
        s.ciclo.iniciar(sel);
      }
    };

    D.iniciarYa = function () {
      if (!D.activo()) return;
      const sel = D.sel;
      D.limpiar();
      s.kernel.log('ESTADO', 'Inicio inmediato: se saltea la espera');
      s.ciclo.iniciar(sel);
    };

    D.cancelar = function () {
      if (!D.activo()) return;
      D.limpiar();
      if (s.ciclo.estado === 'PROGRAMADO') s.ciclo.estado = 'REPOSO';
      s.kernel.log('ESTADO', 'Inicio diferido cancelado');
      s.kernel.emit('diferido', { activo: false });
      s.energia.guardar('diferido cancelado');
    };

    D.limpiar = function () { D.inicioMs = null; D.sel = null; };

    D.exportar = () => (D.activo() ? { restanteMs: D.restanteMs(), sel: u.copiar(D.sel) } : null);

    /** Al volver la luz: el reloj con batería siguió contando durante el corte. */
    D.restaurar = function (dato, durCorteMs) {
      const resta = dato.restanteMs - durCorteMs;
      if (resta <= 0) {
        s.kernel.log('ENERGIA', 'La hora de inicio pasó durante el corte: comienza ahora');
        s.ciclo.iniciar(dato.sel);
        return 'el diferido arrancó al volver la luz';
      }
      D.inicioMs = s.kernel.relojMs + resta;
      D.sel = dato.sel;
      s.ciclo.estado = 'PROGRAMADO';
      s.kernel.log('ENERGIA', `El reloj siguió con su batería: faltan ${u.hmm(resta)} h para iniciar`);
      return 'el diferido sigue esperando';
    };

    return D;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
