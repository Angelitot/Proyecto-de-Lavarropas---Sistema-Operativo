/*
 * LAVACRÁN — Sonidos del panel (generados con Web Audio, sin archivos).
 * Pitido de tecla, inicio, fin de ciclo, alarma y tapa. Con botón de silencio.
 * Responsable: Pareja 5 (animación y sonido).
 */
(function (L) {
  'use strict';

  L.crearSonidos = function (eeprom) {
    let ctx = null;
    const S = { silencio: !!(eeprom && eeprom.leer('silencio')) };

    function audio() {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tono(freq, dur, desde = 0, tipo = 'sine', vol = 0.06) {
      if (S.silencio) return;
      const a = audio();
      if (!a) return;
      const t = a.currentTime + desde;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = tipo;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    S.alternar = function () {
      S.silencio = !S.silencio;
      if (eeprom) eeprom.escribir('silencio', S.silencio);
      if (!S.silencio) S.tecla();
      return S.silencio;
    };
    S.desbloquear = () => { audio(); };

    S.tecla = () => tono(1760, 0.06, 0, 'square', 0.025);
    S.guardado = () => { tono(1568, 0.08); tono(2093, 0.12, 0.09); };
    S.inicio = () => { [880, 1175, 1568].forEach((f, i) => tono(f, 0.12, i * 0.12, 'triangle', 0.07)); };
    S.fin = () => {
      [[1047, 0], [1319, 0.18], [1568, 0.36], [2093, 0.54], [1568, 0.9], [2093, 1.08]]
        .forEach(([f, d]) => tono(f, 0.22, d, 'triangle', 0.07));
    };
    S.alarma = () => { tono(2349, 0.14, 0, 'square', 0.035); tono(2349, 0.14, 0.22, 'square', 0.035); tono(2349, 0.14, 0.44, 'square', 0.035); };
    S.tapa = abierta => tono(abierta ? 660 : 520, 0.07, 0, 'sine', 0.04);
    S.apagado = () => { tono(660, 0.15, 0, 'sine', 0.05); tono(330, 0.3, 0.12, 'sine', 0.05); };
    S.arranque = () => { tono(523, 0.1, 0, 'sine', 0.05); tono(784, 0.16, 0.1, 'sine', 0.05); };

    return S;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
