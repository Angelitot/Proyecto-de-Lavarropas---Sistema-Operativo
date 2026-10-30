/*
 * LAVACRÁN OS — Alarmas y códigos de error
 *
 *  E1  Falta de agua      (detiene)  las válvulas abren pero el nivel no sube en 90 s
 *  E2  Desagote tapado    (detiene)  la bomba funciona pero el nivel no baja en 90 s
 *  E3  Sobrecarga         (detiene)  la ropa supera el límite del programa
 *  E4  Desbalance         (aviso)    no se pudo equilibrar: centrifuga a 400 rpm
 *
 * La tarea T2 (supervisor) vigila E1 y E2. E3 la activa el módulo de sensores
 * y E4 la máquina de estados después de 3 intentos de redistribuir la ropa.
 *
 * Responsable: Pareja 4 (seguridad y eventos).
 */
(function (L) {
  'use strict';

  L.CODIGOS_ERROR = {
    E1: { titulo: 'Falta de agua', accion: 'Revise que la canilla esté abierta y la manguera sin dobleces. Después presione Inicio.', detiene: true },
    E2: { titulo: 'Desagote tapado', accion: 'Revise la manguera y el filtro de desagote. Después presione Inicio.', detiene: true },
    E3: { titulo: 'Sobrecarga', accion: 'Abra la tapa y retire ropa. Al cerrar, el lavado continúa solo.', detiene: true },
    E4: { titulo: 'Desbalance', accion: 'No se pudo equilibrar la carga: el centrifugado se hace más lento.', detiene: false }
  };

  L.crearAlarmas = function (s) {
    const c = s.config;
    const A = {
      activas: {},
      sup: { llenadoMs: 0, nivelIniLlenado: 0, desagoteMs: 0, nivelIniDesagote: 0 }
    };

    A.activar = function (cod, datos = {}) {
      const ya = A.activas[cod];
      A.activas[cod] = Object.assign({ codigo: cod, desdeMs: ya ? ya.desdeMs : s.kernel.relojMs }, L.CODIGOS_ERROR[cod], datos);
      if (ya) return;
      s.kernel.log('ALERTA', `${cod} ${L.CODIGOS_ERROR[cod].titulo}${datos.texto ? ': ' + datos.texto : ''}`);
      if (cod === 'E1' || cod === 'E2') s.ciclo.pausar('error');
      s.kernel.emit('alarma', { codigo: cod, activa: true });
    };

    A.actualizar = function (cod, datos) { if (A.activas[cod]) Object.assign(A.activas[cod], datos); };

    A.desactivar = function (cod) {
      if (!A.activas[cod]) return;
      delete A.activas[cod];
      s.kernel.emit('alarma', { codigo: cod, activa: false });
    };

    A.limpiar = function (codigos) { (codigos || Object.keys(A.activas)).forEach(A.desactivar); };

    /** La alarma que se muestra en pantalla (la más grave primero). */
    A.principal = () => ['E1', 'E2', 'E3', 'E4'].map(k => A.activas[k]).find(Boolean) || null;
    A.sonando = () => Object.values(A.activas).some(a => a.detiene);

    /** El usuario solucionó el problema y presiona Inicio. */
    A.reintentar = function () {
      const habia = A.activas.E1 || A.activas.E2;
      A.desactivar('E1');
      A.desactivar('E2');
      A.sup.llenadoMs = 0;
      A.sup.desagoteMs = 0;
      if (habia) {
        s.kernel.log('ESTADO', 'Reintento pedido desde el panel');
        s.ciclo.reanudar('error');
      }
      return !!habia;
    };

    // ---------------- Tarea T2: supervisor de fallas (cada 1 s) ----------------
    A.tarea = function (dt) {
      const ciclo = s.ciclo, hw = s.hw, sup = A.sup;
      if (!ciclo.activo() || ciclo.pausas.size > 0) { sup.llenadoMs = 0; sup.desagoteMs = 0; return 'espera'; }
      const nivel = s.sensores.nivelL;

      if (hw.valvulaFria + hw.valvulaCaliente > 0) {
        if (sup.llenadoMs === 0) sup.nivelIniLlenado = nivel;
        sup.llenadoMs += dt;
        if (sup.llenadoMs >= c.timeoutLlenadoMs) {
          if (nivel - sup.nivelIniLlenado < 1) A.activar('E1', { texto: 'las válvulas están abiertas y el nivel no sube' });
          sup.llenadoMs = 0;
        }
      } else sup.llenadoMs = 0;

      if (hw.bomba && nivel > 3) {
        if (sup.desagoteMs === 0) sup.nivelIniDesagote = nivel;
        sup.desagoteMs += dt;
        if (sup.desagoteMs >= c.timeoutDesagoteMs) {
          if (sup.nivelIniDesagote - nivel < 1) A.activar('E2', { texto: 'la bomba funciona y el nivel no baja' });
          sup.desagoteMs = 0;
        }
      } else sup.desagoteMs = 0;
    };

    A.exportar = () => L.util.copiar(A.activas);
    /** Al volver la luz, E1 y E2 se vuelven a comprobar desde cero. */
    A.importar = function (d) {
      A.activas = {};
      if (!d) return;
      ['E3', 'E4'].forEach(k => { if (d[k]) A.activas[k] = d[k]; });
    };

    return A;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
