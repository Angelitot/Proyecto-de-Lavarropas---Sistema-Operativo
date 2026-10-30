/*
 * LAVACRÁN OS — Memoria de programas
 *
 *  - 3 favoritos (M1, M2, M3): tocar = cargar, mantener 1,5 s = guardar.
 *  - Recuerda el último programa usado (al encender lo deja seleccionado).
 *  - Cuenta los lavados para recomendar la autolimpieza cada 30.
 *
 * Todo se guarda en la memoria no volátil (no se pierde con un corte de luz).
 * Responsable: Pareja 1 (panel de control).
 */
(function (L) {
  'use strict';

  L.crearMemoria = function (s) {
    const e = s.eeprom;
    const M = {};
    const limpia = sel => ({ programaId: sel.programaId, temp: sel.temp, nivel: sel.nivel, rpm: sel.rpm });

    M.favorito = n => e.leer('favorito' + n);
    M.guardarFavorito = function (n, sel) {
      e.escribir('favorito' + n, limpia(sel));
      s.kernel.log('PANEL', `Configuración guardada en M${n}`);
    };

    M.ultimo = () => e.leer('ultimo');
    M.guardarUltimo = sel => e.escribir('ultimo', limpia(sel));

    M.lavados = () => e.leer('lavados') || 0;
    M.sumarLavado = function () { const n = M.lavados() + 1; e.escribir('lavados', n); return n; };
    M.reiniciarLavados = () => e.escribir('lavados', 0);
    M.fijarLavados = n => e.escribir('lavados', n);
    M.necesitaAutolimpieza = () => M.lavados() >= s.config.lavadosParaAutolimpieza;

    return M;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
