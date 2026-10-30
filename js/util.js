/*
 * LAVACRÁN OS — Utilidades compartidas (formato de números y tiempos).
 */
(function (L) {
  'use strict';

  const u = {};

  u.limitar = (v, min, max) => Math.max(min, Math.min(max, v));

  /** 6.25 -> "6,3" (coma decimal, como en Paraguay) */
  u.kg = (v, dec = 1) => (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec).replace('.', ',');

  /** ms -> "mm:ss" (o "h:mm:ss" si pasa la hora) */
  u.mmss = function (ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const dd = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`;
  };

  /** ms -> "1:07" (horas:minutos, redondeando minutos hacia arriba, como un lavarropas) */
  u.hmm = function (ms) {
    const min = Math.max(0, Math.ceil(ms / 60000));
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  };

  /** Reloj del sistema -> "08:15:32" */
  u.hora = function (ms) {
    const d = new Date(ms);
    const dd = n => String(n).padStart(2, '0');
    return `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
  };

  u.copiar = obj => JSON.parse(JSON.stringify(obj));

  L.util = u;
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
