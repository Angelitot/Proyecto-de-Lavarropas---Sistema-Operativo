/*
 * LAVACRÁN OS — Memoria no volátil (EEPROM emulada)
 * En el lavarropas real es un chip que no se borra al cortarse la luz.
 * En el navegador usamos localStorage; si no está disponible (o en las
 * pruebas) usamos memoria común.
 * Responsable: Pareja 3 (núcleo).
 */
(function (L) {
  'use strict';

  function envolver(lectura, escritura, borrado, listar) {
    return {
      leer(clave) {
        try {
          const v = lectura(clave);
          return v == null ? null : JSON.parse(v);
        } catch (e) { return null; }
      },
      escribir(clave, valor) {
        try { escritura(clave, JSON.stringify(valor)); } catch (e) { /* memoria llena: se ignora */ }
      },
      borrar(clave) { try { borrado(clave); } catch (e) { /* nada */ } },
      borrarTodo() { try { listar().forEach(borrado); } catch (e) { /* nada */ } }
    };
  }

  /** EEPROM en memoria (se pierde al recargar). Útil para pruebas. */
  L.crearEEPROMMemoria = function () {
    const mem = {};
    return envolver(k => (k in mem ? mem[k] : null), (k, v) => { mem[k] = v; }, k => { delete mem[k]; }, () => Object.keys(mem));
  };

  /** EEPROM persistente con localStorage (sobrevive a recargar la página). */
  L.crearEEPROM = function (prefijo = 'lavacran.') {
    let ls = null;
    try {
      ls = globalThis.localStorage;
      ls.setItem(prefijo + '__prueba', '1');
      ls.removeItem(prefijo + '__prueba');
    } catch (e) { ls = null; }
    if (!ls) return L.crearEEPROMMemoria();
    return envolver(
      k => ls.getItem(prefijo + k),
      (k, v) => ls.setItem(prefijo + k, v),
      k => ls.removeItem(prefijo + k),
      () => Object.keys(ls).filter(k => k.startsWith(prefijo)).map(k => k.slice(prefijo.length))
    );
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
