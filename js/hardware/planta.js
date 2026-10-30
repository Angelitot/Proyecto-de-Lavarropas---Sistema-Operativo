/*
 * LAVACRÁN — Hardware simulado ("la planta")
 *
 * Representa el lavarropas físico: agua, ropa, temperatura, motor, válvulas,
 * bomba, resistencia, generador de vapor y los sensores. El sistema operativo
 * NO toca estas variables directamente: lee sensores (leer*) y da órdenes a
 * los actuadores (set*), igual que haría con el hardware real.
 *
 * Las funciones "del mundo" (abrir la tapa, agregar ropa, cortar la luz,
 * cerrar la canilla...) las usa el panel de pruebas para simular situaciones.
 *
 * Responsable: Pareja 2 (sensores y hardware).
 */
(function (L) {
  'use strict';

  L.crearPlanta = function (s) {
    const c = s.config;

    const hw = {
      energia: true,
      tapaAbierta: false,
      prendas: [],                 // { id, nombre, kg, color, tipo, aguaL }
      aguaLibreL: 0,               // agua suelta en la tina (la que mide el presostato)
      tempC: c.tempAmbienteC,
      rpm: 0,                      // + horario, - antihorario
      motor: { modo: 'apagado', rpmObjetivo: 0, intensidad: 'normal' },
      agitT: 0,
      valvulaFria: 0,
      valvulaCaliente: 0,
      bomba: false,
      resistencia: false,
      vapor: false,
      // condiciones del mundo (panel de pruebas)
      canillaAbierta: true,
      aguaCalienteConectada: true,
      desagoteTapado: false,
      desbalance: { severidad: 0, corregible: true },
      // medidores
      caudalimetroL: 0,
      desagotadoL: 0,
      flujoEntradaLmin: 0,
      flujoSalidaLmin: 0,
      tempEntradaC: c.tempAguaFriaC,
      vibracion: 0,
      semilla: 20261030,
      sigId: 1
    };

    // Generador pseudoaleatorio (repetible, para que las pruebas den siempre igual)
    function azar() {
      hw.semilla = (hw.semilla * 1664525 + 1013904223) % 4294967296;
      return hw.semilla / 4294967296;
    }

    hw.ropaKg = () => hw.prendas.reduce((a, p) => a + p.kg, 0);
    hw.aguaAbsorbidaL = () => hw.prendas.reduce((a, p) => a + p.aguaL, 0);
    const masaTermica = () => hw.aguaLibreL + hw.aguaAbsorbidaL() + hw.ropaKg() * 0.35 + 4;

    // ------------------------------------------------------------------
    // Física (se llama en cada tick del reloj, con o sin energía)
    // ------------------------------------------------------------------
    hw.actualizar = function (dtMs) {
      const dt = dtMs / 1000;
      if (!hw.energia) apagarActuadores();

      actualizarMotor(dt);

      // Entrada de agua
      let entra = 0;
      const fria = hw.valvulaFria;
      const caliente = hw.aguaCalienteConectada ? hw.valvulaCaliente : 0;
      if (hw.canillaAbierta && fria + caliente > 0) {
        entra = c.caudalEntradaLmin / 60 * dt * Math.min(1, fria + caliente);
        hw.tempEntradaC = (fria * c.tempAguaFriaC + caliente * c.tempAguaCalienteC) / (fria + caliente);
        const M = masaTermica();
        hw.tempC = (hw.tempC * M + hw.tempEntradaC * entra) / (M + entra);
        hw.aguaLibreL += entra;
        hw.caudalimetroL += entra;
      }
      hw.flujoEntradaLmin = entra / dt * 60;

      // Desagote
      let sale = 0;
      if (hw.bomba && !hw.desagoteTapado) {
        sale = Math.min(hw.aguaLibreL, c.caudalDesagoteLmin / 60 * dt);
        hw.aguaLibreL -= sale;
        hw.desagotadoL += sale;
      }
      hw.flujoSalidaLmin = sale / dt * 60;

      // La ropa absorbe agua al agitarse y la suelta al centrifugar
      const agitando = hw.motor.modo === 'agitar' || hw.motor.modo === 'volteo';
      if (agitando && hw.aguaLibreL > 0.5) absorber(dt);
      if (Math.abs(hw.rpm) > 150) extraer(dt);

      // Calor: resistencia, vapor y pérdidas al ambiente
      let potencia = 0;
      if (hw.resistencia && hw.aguaLibreL > 5) potencia += c.potenciaResistenciaW;
      if (hw.vapor && hw.tempC < c.tempMaxVaporC + 3) potencia += c.potenciaVaporW;
      hw.tempC += potencia * dt / (masaTermica() * 4186);
      hw.tempC -= (hw.tempC - c.tempAmbienteC) * 0.003 / 60 * dt;

      // Vibración (acelerómetro): crece con el cuadrado de la velocidad si hay desbalance
      const fr = Math.abs(hw.rpm) / 800;
      let vib = hw.motor.modo === 'agitar' ? 3 + Math.min(4, hw.ropaKg() * 0.3) : fr * 8;
      vib += hw.desbalance.severidad * 160 * fr * fr;
      hw.vibracion = Math.min(100, vib);
    };

    function apagarActuadores() {
      hw.valvulaFria = 0; hw.valvulaCaliente = 0;
      hw.bomba = false; hw.resistencia = false; hw.vapor = false;
      hw.motor.modo = 'apagado'; hw.motor.rpmObjetivo = 0;
    }

    function actualizarMotor(dt) {
      const m = hw.motor;
      if (m.modo === 'girar') {
        const obj = m.rpmObjetivo;
        if (hw.rpm < obj) hw.rpm = Math.min(obj, hw.rpm + c.rampaRpmPorSeg * dt);
        else hw.rpm = Math.max(obj, hw.rpm - c.frenoRpmPorSeg * dt);
      } else if (m.modo === 'agitar' || m.modo === 'volteo') {
        // patrón del impulsor: 1,6 s en un sentido, pausa, 1,6 s en el otro, pausa
        hw.agitT = (hw.agitT + dt) % 4;
        const vel = m.modo === 'volteo' ? 30 : ({ suave: 90, normal: 130, fuerte: 160 }[m.intensidad] || 130);
        let obj = 0;
        if (hw.agitT < 1.6) obj = vel;
        else if (hw.agitT >= 2 && hw.agitT < 3.6) obj = -vel;
        const paso = 400 * dt;
        hw.rpm += Math.max(-paso, Math.min(paso, obj - hw.rpm));
      } else {
        // apagado: freno del motor (o inercia si no hay energía)
        const freno = (hw.energia ? c.frenoRpmPorSeg : 80) * dt;
        hw.rpm = Math.abs(hw.rpm) <= freno ? 0 : hw.rpm - Math.sign(hw.rpm) * freno;
      }
    }

    function absorber(dt) {
      const k = Math.min(1, dt / 40);              // tarda ~40 s en empaparse
      for (const p of hw.prendas) {
        const falta = p.kg * c.absorcionLporKg - p.aguaL;
        if (falta <= 0) continue;
        const toma = Math.min(hw.aguaLibreL, falta * k);
        p.aguaL += toma;
        hw.aguaLibreL -= toma;
        if (hw.aguaLibreL <= 0) break;
      }
    }

    function extraer(dt) {
      const rpm = Math.abs(hw.rpm);
      const residual = c.absorcionLporKg - 1.0 * Math.min(1, (rpm - 150) / 650);   // L por kg que quedan
      const k = Math.min(1, dt / 20);
      for (const p of hw.prendas) {
        const objetivo = p.kg * residual;
        if (p.aguaL > objetivo) {
          const suelta = (p.aguaL - objetivo) * k;
          p.aguaL -= suelta;
          hw.aguaLibreL += suelta;
        }
      }
    }

    // ------------------------------------------------------------------
    // Sensores (lo único que el SO puede "ver")
    // ------------------------------------------------------------------
    hw.leerPesoKg = () => c.taraKg + hw.ropaKg() + hw.aguaLibreL + hw.aguaAbsorbidaL()
      + (azar() - 0.5) * 0.02 + (azar() - 0.5) * hw.vibracion * 0.001;
    hw.leerNivelL = () => Math.max(0, hw.aguaLibreL + (hw.aguaLibreL > 0.05 ? (azar() - 0.5) * 0.1 : 0));
    hw.leerTempC = () => hw.tempC + (azar() - 0.5) * 0.1;
    hw.leerVibracion = () => hw.vibracion;
    hw.leerRpm = () => hw.rpm;
    hw.leerTapa = () => hw.tapaAbierta;
    hw.leerCaudalimetroL = () => hw.caudalimetroL;

    // ------------------------------------------------------------------
    // Actuadores (órdenes del SO). Sin energía no responden.
    // ------------------------------------------------------------------
    hw.setValvulas = function (fria, caliente) {
      if (!hw.energia) return;
      hw.valvulaFria = fria; hw.valvulaCaliente = caliente;
    };
    hw.setBomba = on => { hw.bomba = hw.energia && !!on; };
    hw.setResistencia = on => { hw.resistencia = hw.energia && !!on; };
    hw.setVapor = on => { hw.vapor = hw.energia && !!on; };
    hw.setMotor = function (modo, rpmObjetivo = 0, intensidad = 'normal') {
      if (!hw.energia) return;
      hw.motor.modo = modo; hw.motor.rpmObjetivo = rpmObjetivo; hw.motor.intensidad = intensidad;
    };

    // ------------------------------------------------------------------
    // Acciones del mundo real (las usa el panel de pruebas)
    // ------------------------------------------------------------------
    hw.abrirTapa = function () {
      if (hw.tapaAbierta) return;
      hw.tapaAbierta = true;
      s.kernel.irq('IRQ1', { abierta: true, detalle: 'tapa abierta' });
    };
    hw.cerrarTapa = function () {
      if (!hw.tapaAbierta) return;
      hw.tapaAbierta = false;
      s.kernel.irq('IRQ1', { abierta: false, detalle: 'tapa cerrada' });
    };
    /** Solo se puede meter ropa con la tapa abierta. */
    hw.agregarPrenda = function (p) {
      if (!hw.tapaAbierta) return null;
      const prenda = { id: hw.sigId++, nombre: p.nombre, kg: p.kg, color: p.color || '#8aa', tipo: p.tipo || 'remera', aguaL: 0 };
      hw.prendas.push(prenda);
      return prenda;
    };
    /** Saca una prenda (la última, o la indicada). Se lleva el agua que absorbió. */
    hw.quitarPrenda = function (id) {
      if (!hw.tapaAbierta || !hw.prendas.length) return null;
      const i = id == null ? hw.prendas.length - 1 : hw.prendas.findIndex(p => p.id === id);
      if (i < 0) return null;
      return hw.prendas.splice(i, 1)[0];
    };
    hw.vaciarTambor = function () {
      if (!hw.tapaAbierta) return 0;
      const n = hw.prendas.length;
      hw.prendas = [];
      return n;
    };
    hw.provocarDesbalance = function (corregible) {
      hw.desbalance = { severidad: 1, corregible: !!corregible };
    };
    hw.quitarDesbalance = function () { hw.desbalance = { severidad: 0, corregible: true }; };
    /** Efecto físico de agitar la ropa en agua: se reacomoda (si se puede). */
    hw.efectoRedistribucion = function () {
      if (hw.desbalance.severidad > 0 && hw.desbalance.corregible) {
        hw.desbalance.severidad *= 0.35;
        if (hw.desbalance.severidad < 0.05) hw.desbalance.severidad = 0;
      }
    };
    hw.cortarEnergia = function () { hw.energia = false; apagarActuadores(); };
    hw.restaurarEnergia = function () { hw.energia = true; };

    // ------------------------------------------------------------------
    // Persistencia del "mundo" (para que recargar la página sea como un corte)
    // ------------------------------------------------------------------
    const CAMPOS = ['tapaAbierta', 'prendas', 'aguaLibreL', 'tempC', 'canillaAbierta', 'aguaCalienteConectada',
      'desagoteTapado', 'desbalance', 'caudalimetroL', 'desagotadoL', 'sigId'];
    hw.serializar = function () {
      const o = {};
      CAMPOS.forEach(k => { o[k] = hw[k]; });
      return JSON.parse(JSON.stringify(o));
    };
    hw.cargar = function (o) {
      if (!o) return;
      CAMPOS.forEach(k => { if (o[k] !== undefined) hw[k] = o[k]; });
    };

    return hw;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
