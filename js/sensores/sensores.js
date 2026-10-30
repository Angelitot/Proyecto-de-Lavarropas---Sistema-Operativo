/*
 * LAVACRÁN OS — Sensores
 *
 * Funciones del profe que viven acá:
 *  2. Sensor automático de carga  -> pesoNetoKg() durante el pesaje
 *  3. Ajuste automático del nivel  -> nivelAuto(kg) = 20 L + 5 L por kg (25 a 70 L)
 *  8. Carga excesiva                -> revisarLimite(): 10 kg o el límite del programa
 *  +  Agregar ropa en marcha        -> método de la tapa (ver alAbrirTapa / alCerrarTapa)
 *  +  Desbalance real               -> el acelerómetro dispara la IRQ3
 *
 * Cómo se calcula la ropa agregada con la máquina funcionando:
 *   El sensor de peso (celdas de carga) mide TODO: tina + agua + ropa.
 *   Al abrir la tapa el ciclo se pausa y se cortan válvulas y bomba, así que
 *   el agua deja de cambiar. Se guarda el peso en ese instante; todo lo que
 *   aumente mientras la tapa está abierta es ropa nueva.
 *     ropa total = ropa registrada + (peso ahora - peso al abrir)
 *   Control cruzado (válido antes del primer desagote):
 *     ropa ≈ peso - tara - litros cargados   (1 L de agua ≈ 1 kg)
 *
 * Responsable: Pareja 2 (sensores y hardware).
 */
(function (L) {
  'use strict';

  L.crearSensores = function (s) {
    const c = s.config, u = L.util;
    const promedio = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

    const S = {
      muestras: [],
      pesoKg: c.taraKg,          // peso bruto filtrado (promedio móvil de 1 s)
      pesoCrudoKg: c.taraKg,
      nivelL: 0,
      tempC: c.tempAmbienteC,
      vibracion: 0,
      rpm: 0,
      ropaEstimadaKg: 0,         // lo que el SO cree que hay en el tambor
      tapa: { abierta: false, pesoAlAbrirKg: null, agregadoKg: 0 },
      sobrecarga: { activa: false, estimadaKg: 0, limiteKg: c.capacidadMaxKg, excesoKg: 0 },
      vibAlta: false
    };

    /** Lee todos los sensores y filtra el peso (el sensor es ruidoso). */
    S.leer = function () {
      S.pesoCrudoKg = s.hw.leerPesoKg();
      S.muestras.push(S.pesoCrudoKg);
      if (S.muestras.length > 10) S.muestras.shift();
      S.pesoKg = promedio(S.muestras);
      S.nivelL = s.hw.leerNivelL();
      S.tempC = s.hw.leerTempC();
      S.vibracion = s.hw.leerVibracion();
      S.rpm = s.hw.leerRpm();
    };

    S.pesoNetoKg = () => S.pesoKg - c.taraKg;

    /** Función 3: litros según la carga. */
    S.nivelAuto = function (kg) {
      const n = c.nivelAuto;
      return Math.round(u.limitar(n.baseL + n.porKgL * kg, n.minL, n.maxL));
    };

    /** Control cruzado: solo vale si todavía no se desagotó nada en este ciclo. */
    S.controlCruzadoKg = function () {
      const ci = s.ciclo;
      if (!ci.activo() || ci.desagotesHechos > 0 || ci.aguaAlInicio > 0.5) return null;
      const litros = s.hw.leerCaudalimetroL() - ci.litrosAlInicio;
      return S.pesoKg - c.taraKg - litros;
    };

    /** ¿El SO ya sabe cuánta ropa hay? (antes de terminar el pesaje, no) */
    function cargaConocida() {
      const p = s.ciclo.paso;
      return !(p && p.tipo === 'PESAJE' && p.estado === 'midiendo');
    }

    // ---------------- Tarea T1 (cada 100 ms) ----------------
    S.tarea = function () {
      S.leer();
      const ciclo = s.ciclo;

      // Ropa agregada o retirada con la tapa abierta
      if (S.tapa.abierta && S.tapa.pesoAlAbrirKg != null && ciclo.activo() && cargaConocida()) {
        S.tapa.agregadoKg = S.pesoKg - S.tapa.pesoAlAbrirKg;
        S.revisarLimite(S.ropaEstimadaKg + S.tapa.agregadoKg);
      }

      // Desbalance durante el centrifugado -> IRQ3
      const p = ciclo.paso;
      const centrifugando = ciclo.activo() && ciclo.pausas.size === 0 && p && p.tipo === 'CENTRIFUGADO' && p.fase !== 'freno';
      if (centrifugando && Math.abs(S.rpm) > 100 && S.vibracion > c.vibracionUmbral) {
        if (!S.vibAlta) {
          S.vibAlta = true;
          s.kernel.irq('IRQ3', { vibracion: Math.round(S.vibracion), detalle: `vibración ${Math.round(S.vibracion)} (umbral ${c.vibracionUmbral})` });
        }
      } else if (S.vibracion < c.vibracionUmbral * 0.6) {
        S.vibAlta = false;
      }
    };

    // ---------------- Carga y sobrecarga ----------------
    S.revisarLimite = function (estimadaKg) {
      const lim = s.ciclo.limiteKg();
      const tol = s.ciclo.toleranciaKg();
      const o = S.sobrecarga;
      o.estimadaKg = estimadaKg;
      o.limiteKg = lim;
      o.excesoKg = Math.max(0, estimadaKg - lim);
      if (estimadaKg > lim + tol) {
        const texto = lim === 0 ? `hay ${u.kg(estimadaKg)} kg y la autolimpieza es con el tambor vacío`
          : `retire ${u.kg(o.excesoKg)} kg (${u.kg(estimadaKg)} de ${u.kg(lim, 0)} kg)`;
        if (!o.activa) {
          o.activa = true;
          s.ciclo.pausar('sobrecarga');
          s.alarmas.activar('E3', { texto, excesoKg: o.excesoKg, limiteKg: lim, estimadaKg });
        } else {
          s.alarmas.actualizar('E3', { texto, excesoKg: o.excesoKg, estimadaKg });
        }
      } else if (o.activa) {
        o.activa = false;
        s.alarmas.desactivar('E3');
        s.kernel.log('SENSOR', `Carga dentro del límite: ${u.kg(estimadaKg)} kg${S.tapa.abierta ? '. Cierre la tapa para continuar' : ''}`);
        s.ciclo.reanudar('sobrecarga');
      }
      return !o.activa;
    };

    S.limpiarSobrecarga = function () {
      S.sobrecarga.activa = false;
      S.sobrecarga.excesoKg = 0;
    };

    /** Lo llama la ISR de la tapa (IRQ1) DESPUÉS de pausar: el agua ya está cortada. */
    S.alAbrirTapa = function () {
      S.tapa.abierta = true;
      S.tapa.pesoAlAbrirKg = s.hw.leerPesoKg();
      S.tapa.agregadoKg = 0;
      S.muestras = [S.tapa.pesoAlAbrirKg];
      S.pesoKg = S.tapa.pesoAlAbrirKg;
    };

    /** Lo llama la ISR de la tapa al cerrarse. Confirma cuánta ropa quedó adentro. */
    S.alCerrarTapa = function () {
      if (S.tapa.pesoAlAbrirKg != null && s.ciclo.activo() && cargaConocida()) {
        const agregado = s.hw.leerPesoKg() - S.tapa.pesoAlAbrirKg;
        S.ropaEstimadaKg = Math.max(0, S.ropaEstimadaKg + agregado);
        if (S.revisarLimite(S.ropaEstimadaKg)) s.ciclo.cambiarCarga(S.ropaEstimadaKg);
      }
      S.tapa.abierta = false;
      S.tapa.pesoAlAbrirKg = null;
      S.tapa.agregadoKg = 0;
    };

    /** Estimación en vivo (para la pantalla y la consola). */
    S.ropaEnVivoKg = function () {
      if (S.tapa.abierta && S.tapa.pesoAlAbrirKg != null && s.ciclo.activo() && cargaConocida()) {
        return Math.max(0, S.ropaEstimadaKg + S.tapa.agregadoKg);
      }
      return S.ropaEstimadaKg;
    };

    // ---------------- Arranque y memoria no volátil ----------------
    S.reiniciar = function () {
      S.muestras = [];
      S.leer();
      S.tapa = { abierta: false, pesoAlAbrirKg: null, agregadoKg: 0 };
      S.sobrecarga = { activa: false, estimadaKg: 0, limiteKg: c.capacidadMaxKg, excesoKg: 0 };
      S.vibAlta = false;
    };
    S.exportar = () => ({ ropaEstimadaKg: S.ropaEstimadaKg, sobrecarga: u.copiar(S.sobrecarga) });
    S.importar = function (d) {
      if (!d) return;
      S.ropaEstimadaKg = d.ropaEstimadaKg || 0;
      if (d.sobrecarga) S.sobrecarga = d.sobrecarga;
    };

    return S;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
