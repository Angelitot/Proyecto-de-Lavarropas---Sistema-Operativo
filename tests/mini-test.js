/*
 * Mini framework de pruebas (sin instalar nada).
 *   L.pruebas.prueba('nombre', () => { ... afirmar(...) ... })
 */
(function (L) {
  'use strict';

  const T = { lista: [] };

  T.prueba = (nombre, fn, grupo) => T.lista.push({ nombre, fn, grupo: grupo || T.grupoActual || 'General' });
  T.grupo = nombre => { T.grupoActual = nombre; };

  T.afirmar = function (condicion, mensaje) {
    if (!condicion) throw new Error(mensaje || 'la condición no se cumplió');
  };

  T.cerca = function (valor, esperado, tolerancia, mensaje) {
    if (!(Math.abs(valor - esperado) <= tolerancia)) {
      throw new Error(`${mensaje ? mensaje + ': ' : ''}se esperaba ${esperado} ± ${tolerancia} y dio ${Math.round(valor * 1000) / 1000}`);
    }
  };

  T.correr = function (alTerminarUna) {
    const resultados = [];
    for (const p of T.lista) {
      const inicio = Date.now();
      let r;
      try {
        p.fn();
        r = { nombre: p.nombre, grupo: p.grupo, ok: true, ms: Date.now() - inicio };
      } catch (e) {
        r = { nombre: p.nombre, grupo: p.grupo, ok: false, error: e.message, ms: Date.now() - inicio };
      }
      resultados.push(r);
      if (alTerminarUna) alTerminarUna(r);
    }
    return resultados;
  };

  L.pruebas = T;
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
