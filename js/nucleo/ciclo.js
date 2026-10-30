/*
 * LAVACRÁN OS — Máquina de estados del ciclo de lavado
 *
 * Estados generales:
 *   APAGADO · REPOSO · PROGRAMADO (inicio diferido) · EN_MARCHA · FIN · SIN_ENERGIA
 * Dentro de EN_MARCHA se ejecuta un "plan": una lista de pasos
 *   PESAJE → LLENADO → CALENTAMIENTO → LAVADO → DESAGOTE → (VAPOR) →
 *   LLENADO → ENJUAGUE → DESAGOTE → ... → CENTRIFUGADO → FIN
 * Y puede estar en PAUSA por uno o varios motivos a la vez:
 *   usuario · tapa · sobrecarga · error
 *
 * Funciones del profe que viven acá: 4 (vapor), 5 (rápido), 6 (autolimpieza)
 * y la reacción al desbalance (IRQ3).
 *
 * La tarea T3 llama a ciclo.tarea() cada 200 ms.
 * Responsable: Pareja 3 (núcleo).
 */
(function (L) {
  'use strict';

  const MIN = 60000;
  const TEXTO_PAUSA = { usuario: 'pedida desde el panel', tapa: 'tapa abierta', sobrecarga: 'sobrecarga', error: 'error' };

  L.crearCiclo = function (s) {
    const c = s.config, u = L.util;

    const ciclo = {
      estado: 'REPOSO',
      pausas: new Set(),
      plan: [],
      indice: 0,
      paso: null,
      sel: null,
      programa: null,
      ropaKg: 0,
      litrosObjetivo: 0,
      mezcla: 0,
      desagotesHechos: 0,
      litrosAlInicio: 0,
      aguaAlInicio: 0,
      intentosBalanceo: 0,
      rpmMaxForzado: null,
      cancelando: false,
      inicioMs: null,
      resultado: null
    };

    // ---------------- Consultas ----------------
    ciclo.activo = () => ciclo.estado === 'EN_MARCHA';
    ciclo.estadoVisible = () => (ciclo.activo() && ciclo.pausas.size ? 'PAUSA' : ciclo.estado);
    ciclo.motivoPausa = function () {
      for (const m of ['error', 'sobrecarga', 'tapa', 'usuario']) if (ciclo.pausas.has(m)) return m;
      return null;
    };
    ciclo.limiteKg = () => (ciclo.programa ? ciclo.programa.maxKg : c.capacidadMaxKg);
    ciclo.toleranciaKg = () => (ciclo.limiteKg() === 0 ? c.toleranciaTamborVacioKg : c.toleranciaKg);
    ciclo.nivelAutoActivo = () => !!(ciclo.sel && ciclo.sel.nivel === 'auto' && ciclo.programa && !ciclo.programa.nivelFijo);
    ciclo.transcurridoMs = () => (ciclo.inicioMs != null ? s.kernel.relojMs - ciclo.inicioMs : 0);

    /** Todo apagado (estado seguro). */
    function seguro() {
      const hw = s.hw;
      hw.setValvulas(0, 0);
      hw.setBomba(false);
      hw.setResistencia(false);
      hw.setVapor(false);
      hw.setMotor('apagado');
    }
    ciclo.estadoSeguro = seguro;

    function mezclaPara(temp) {
      if (!temp || !s.hw.aguaCalienteConectada) return 0;
      return u.limitar((temp - c.tempAguaFriaC) / (c.tempAguaCalienteC - c.tempAguaFriaC), 0, 1);
    }

    function textoSeleccion(sel) {
      const t = sel.temp ? sel.temp + ' °C' : 'agua fría';
      const n = ciclo.programa.nivelFijo ? 'nivel ' + ciclo.programa.nivelFijo : (sel.nivel === 'auto' ? 'nivel automático' : 'nivel ' + sel.nivel);
      const r = sel.rpm ? sel.rpm + ' rpm' : 'sin centrifugado';
      return `${t}, ${n}, ${r}`;
    }

    // ---------------- Inicio ----------------
    /**
     * @param {object} sel selección del panel
     * @param {object} opc {sinPesaje, kg, desagotePrevio, reinicio}
     */
    ciclo.iniciar = function (sel, opc = {}) {
      const prog = L.programaPorId(sel.programaId);
      ciclo.sel = u.copiar(sel);
      ciclo.programa = prog;
      ciclo.plan = L.construirPlan(prog, ciclo.sel, c, opc);
      ciclo.indice = 0;
      ciclo.paso = null;
      ciclo.pausas = new Set();
      ciclo.estado = 'EN_MARCHA';
      ciclo.ropaKg = opc.kg || 0;
      ciclo.desagotesHechos = 0;
      ciclo.intentosBalanceo = 0;
      ciclo.rpmMaxForzado = null;
      ciclo.cancelando = false;
      ciclo.resultado = null;
      ciclo.litrosAlInicio = s.hw.leerCaudalimetroL();
      ciclo.aguaAlInicio = s.hw.leerNivelL();
      ciclo.inicioMs = s.kernel.relojMs;
      ciclo.litrosObjetivo = 0;
      s.sensores.limpiarSobrecarga();
      s.sensores.ropaEstimadaKg = ciclo.ropaKg;
      if (!opc.reinicio) {
        s.alarmas.limpiar();
        s.memoria.guardarUltimo(sel);
      }
      if (opc.sinPesaje) ajustarPorCarga(false);
      s.kernel.log('ESTADO', `${opc.reinicio ? 'Reinicio' : 'Inicio'}: ${prog.nombre} (${textoSeleccion(ciclo.sel)})`);
      s.kernel.emit('ciclo:inicio', { programa: prog.id });
      entrar();
      if (s.hw.leerTapa()) {
        ciclo.pausar('tapa');
        s.sensores.alAbrirTapa();
        s.control.avisar('Cierre la tapa para comenzar');
      }
    };

    // ---------------- Pasos ----------------
    function entrar() {
      const p = ciclo.plan[ciclo.indice];
      ciclo.paso = p;
      if (!p.iniciado) {
        p.iniciado = true;
        p.t = 0;
        s.kernel.log('FASE', `Paso ${ciclo.indice + 1} de ${ciclo.plan.length}: ${L.nombrePaso(p)}`);
        const ej = EJ[p.tipo];
        if (ej.entrar) ej.entrar(p);
      }
      s.kernel.emit('ciclo:paso', p);
      s.energia.guardar('cambio de paso');
    }

    function siguiente() {
      ciclo.indice++;
      if (ciclo.indice < ciclo.plan.length) entrar();
    }

    /** Tarea T3 (cada 200 ms). */
    ciclo.tarea = function (dt) {
      if (!ciclo.activo()) return 'espera';
      if (ciclo.pausas.size) { seguro(); return 'espera'; }
      const p = ciclo.paso;
      const ej = EJ[p.tipo];
      if (ej.tick(p, Math.min(dt, 1000))) siguiente();
    };

    // ---------------- Pausas ----------------
    ciclo.pausar = function (motivo) {
      if (!ciclo.activo()) return;
      const nueva = !ciclo.pausas.has(motivo);
      ciclo.pausas.add(motivo);
      seguro();
      const p = ciclo.paso;
      if (p && p.tipo === 'PESAJE' && p.estado === 'midiendo') p.t = Math.min(p.t, 17000);
      if (nueva) {
        s.kernel.log('ESTADO', `Pausa: ${TEXTO_PAUSA[motivo]}`);
        s.kernel.emit('ciclo:pausa', { motivo });
      }
    };

    ciclo.reanudar = function (motivo) {
      if (!ciclo.pausas.has(motivo)) return;
      ciclo.pausas.delete(motivo);
      if (ciclo.pausas.size === 0 && ciclo.activo()) {
        const p = ciclo.paso;
        if (p && p.tipo === 'CENTRIFUGADO' && p.fase !== 'freno') p.fase = 'rampa';
        s.kernel.log('ESTADO', 'Continúa el ciclo');
      }
      s.kernel.emit('ciclo:reanuda', { motivo });
    };

    // ---------------- Cambios de carga ----------------
    /** Recalcula litros (nivel automático) y tiempos (lavado según kg). */
    function ajustarPorCarga(enMarcha) {
      const kg = ciclo.ropaKg;
      const litrosAuto = s.sensores.nivelAuto(kg);
      const f = 0.7 + 0.3 * Math.min(kg, 10) / 10;
      for (let i = ciclo.indice; i < ciclo.plan.length; i++) {
        const p = ciclo.plan[i];
        if (p.tipo === 'LLENADO' && p.auto && p.proposito !== 'balanceo') p.litros = litrosAuto;
        if (p.tipo === 'LAVADO' && p.escalar) p.min = Math.round(p.base * f * 10) / 10;
      }
      const actual = ciclo.paso;
      if (actual && ciclo.nivelAutoActivo() && ['LLENADO', 'CALENTAMIENTO', 'LAVADO', 'ENJUAGUE'].includes(actual.tipo)
        && actual.proposito !== 'balanceo' && !actual.balanceo) {
        ciclo.litrosObjetivo = litrosAuto;
      }
      if (enMarcha && ciclo.nivelAutoActivo()) s.kernel.log('SENSOR', `Nivel automático recalculado: ${litrosAuto} L para ${u.kg(kg)} kg`);
      else if (!enMarcha && ciclo.nivelAutoActivo()) s.kernel.log('SENSOR', `Nivel automático: ${litrosAuto} L para ${u.kg(kg)} kg`);
    }

    /** Los sensores confirman la carga después de cerrar la tapa. */
    ciclo.cambiarCarga = function (kg) {
      const p = ciclo.paso;
      if (p && p.tipo === 'PESAJE' && p.estado !== 'ok') {
        if (p.estado === 'sobrecarga') {
          ciclo.ropaKg = kg;
          p.estado = 'ok';
          s.kernel.log('SENSOR', `Carga corregida: ${u.kg(kg)} kg`);
          ajustarPorCarga(false);
        }
        return;
      }
      const delta = kg - ciclo.ropaKg;
      if (Math.abs(delta) < 0.05) return;
      ciclo.ropaKg = kg;
      s.kernel.log('SENSOR', `${delta > 0 ? 'Ropa agregada' : 'Ropa retirada'} durante el ciclo: ${delta > 0 ? '+' : ''}${u.kg(delta)} kg, total ${u.kg(kg)} kg`);
      ajustarPorCarga(true);
    };

    function mantenerNivel(p) {
      const hw = s.hw, nivel = s.sensores.nivelL, obj = ciclo.litrosObjetivo;
      if (!p.reponiendo && nivel < obj - c.margenReposicionL) { p.reponiendo = true; p.repDesde = nivel; }
      if (p.reponiendo) {
        if (nivel >= obj) {
          hw.setValvulas(0, 0);
          p.reponiendo = false;
          s.kernel.log('SENSOR', `Ajuste automático de nivel: +${u.kg(nivel - p.repDesde)} L (la ropa absorbió agua)`);
        } else {
          hw.setValvulas(1 - ciclo.mezcla, ciclo.mezcla);
        }
      } else {
        hw.setValvulas(0, 0);
      }
    }

    // ---------------- Ejecutores de cada tipo de paso ----------------
    const EJ = {
      PESAJE: {
        entrar(p) { p.estado = 'midiendo'; },
        tick(p, dt) {
          seguro();
          if (p.estado === 'ok') return true;
          if (p.estado === 'sobrecarga') return false;       // espera a que retiren ropa
          p.t += dt;
          if (p.t < 20000) return false;                      // 20 s para que se asiente el peso
          const kg = Math.max(0, s.sensores.pesoNetoKg());
          s.kernel.log('SENSOR', `Sensor de carga: ${u.kg(kg, 2)} kg de ropa`);
          const prog = ciclo.programa;
          if (kg < 0.1 && (prog.tipo === 'lavado' || prog.tipo === 'enjuague')) {
            s.control.avisar('No hay ropa en el tambor');
            ciclo.cancelar(true);
            return false;
          }
          s.sensores.ropaEstimadaKg = kg;
          if (kg > ciclo.limiteKg() + ciclo.toleranciaKg()) {
            p.estado = 'sobrecarga';
            s.sensores.revisarLimite(kg);
            return false;
          }
          ciclo.ropaKg = kg;
          ajustarPorCarga(false);
          p.estado = 'ok';
          return true;
        }
      },

      LLENADO: {
        entrar(p) {
          if (p.litros == null) p.litros = s.sensores.nivelAuto(ciclo.ropaKg);
          ciclo.litrosObjetivo = p.litros;
          ciclo.mezcla = mezclaPara(p.proposito === 'lavado' ? p.temp : 0);
        },
        tick(p, dt) {
          const hw = s.hw;
          hw.setBomba(false); hw.setResistencia(false); hw.setVapor(false); hw.setMotor('apagado');
          if (Math.abs(s.sensores.rpm) > 5) { hw.setValvulas(0, 0); return false; }   // espera tambor quieto
          if (s.sensores.nivelL >= p.litros) { hw.setValvulas(0, 0); return true; }
          hw.setValvulas(1 - ciclo.mezcla, ciclo.mezcla);
          p.t += dt;
          return false;
        }
      },

      CALENTAMIENTO: {
        tick(p, dt) {
          const hw = s.hw;
          hw.setValvulas(0, 0); hw.setBomba(false); hw.setVapor(false);
          hw.setMotor('agitar', 0, 'suave');
          if (s.sensores.tempC >= p.temp - 0.3) { hw.setResistencia(false); return true; }
          hw.setResistencia(true);
          p.t += dt;
          return false;
        }
      },

      LAVADO: {
        tick(p, dt) {
          const hw = s.hw;
          hw.setBomba(false); hw.setVapor(false);
          hw.setMotor('agitar', 0, p.intensidad || 'normal');
          const temp = p.tipo === 'LAVADO' ? (p.temp || 0) : 0;
          if (temp > 0) {
            const T = s.sensores.tempC;
            if (T < temp - 1) hw.setResistencia(true);
            else if (T >= temp) hw.setResistencia(false);
          } else hw.setResistencia(false);
          mantenerNivel(p);
          p.t += dt;
          if (p.t >= p.min * MIN) {
            hw.setValvulas(0, 0);
            hw.setResistencia(false);
            if (p.balanceo) s.hw.efectoRedistribucion();     // efecto físico de agitar con agua
            return true;
          }
          return false;
        }
      },

      VAPOR: {
        tick(p, dt) {
          const hw = s.hw;
          hw.setValvulas(0, 0); hw.setResistencia(false); hw.setBomba(false);
          hw.setMotor('volteo', 30);
          hw.setVapor(s.sensores.tempC < c.tempMaxVaporC);
          p.t += dt;
          if (p.t >= p.min * MIN) { hw.setVapor(false); return true; }
          return false;
        }
      },

      DESAGOTE: {
        tick(p, dt) {
          const hw = s.hw;
          hw.setValvulas(0, 0); hw.setResistencia(false); hw.setVapor(false); hw.setMotor('apagado');
          hw.setBomba(true);
          if (s.sensores.nivelL < 0.5) {
            p.vacioMs = (p.vacioMs || 0) + dt;
            if (p.vacioMs >= 10000) { hw.setBomba(false); ciclo.desagotesHechos++; return true; }
          } else p.vacioMs = 0;
          p.t += dt;
          return false;
        }
      },

      FRENADO: {
        tick() {
          seguro();
          return Math.abs(s.sensores.rpm) < 5;
        }
      },

      CENTRIFUGADO: {
        entrar(p) { p.fase = 'rampa'; },
        tick(p, dt) {
          const hw = s.hw;
          hw.setValvulas(0, 0); hw.setResistencia(false); hw.setVapor(false);
          hw.setBomba(true);
          let rpm = p.final ? ciclo.sel.rpm : Math.min(p.rpm, ciclo.sel.rpm);
          if (ciclo.rpmMaxForzado != null) rpm = Math.min(rpm, ciclo.rpmMaxForzado);
          p.rpmEfectivo = rpm;
          if (rpm <= 0) {                                       // "sin centrifugado": solo desagota
            hw.setMotor('apagado');
            p.t += dt;
            if (p.t >= 30000) { hw.setBomba(false); return true; }
            return false;
          }
          if (p.fase === 'rampa') {
            hw.setMotor('girar', rpm);
            if (s.sensores.rpm >= rpm - 5) p.fase = 'meseta';
            return false;
          }
          if (p.fase === 'meseta') {
            hw.setMotor('girar', rpm);
            p.t += dt;
            if (p.t >= p.min * MIN) p.fase = 'freno';
            return false;
          }
          hw.setMotor('apagado');                                // freno
          if (Math.abs(s.sensores.rpm) < 5) {
            hw.setBomba(false);
            ciclo.intentosBalanceo = 0;
            return true;
          }
          return false;
        }
      },

      FIN: {
        entrar() {
          seguro();
          const dur = ciclo.transcurridoMs();
          ciclo.pausas.clear();
          s.alarmas.limpiar();
          if (ciclo.cancelando) {
            ciclo.estado = 'REPOSO';
            ciclo.resultado = 'cancelado';
            s.kernel.log('ESTADO', 'Programa cancelado: el agua se desagotó, listo para usar');
          } else {
            ciclo.estado = 'FIN';
            ciclo.resultado = 'terminado';
            if (ciclo.programa.tipo === 'autolimpieza') s.memoria.reiniciarLavados();
            else s.memoria.sumarLavado();
            s.kernel.log('ESTADO', `Fin del programa en ${u.hmm(dur)} h`);
          }
          s.kernel.emit('ciclo:fin', { resultado: ciclo.resultado, durMs: dur });
        },
        tick() { return false; }
      }
    };
    EJ.ENJUAGUE = EJ.LAVADO;

    // ---------------- Desbalance (IRQ3, acelerómetro) ----------------
    ciclo.isrVibracion = function () {
      const p = ciclo.paso;
      if (!ciclo.activo() || ciclo.pausas.size || !p || p.tipo !== 'CENTRIFUGADO' || p.fase === 'freno') return;
      if (ciclo.intentosBalanceo < c.maxIntentosBalanceo) {
        const n = ++ciclo.intentosBalanceo;
        s.kernel.log('ALERTA', `Desbalance: se redistribuye la ropa (intento ${n} de ${c.maxIntentosBalanceo})`);
        s.hw.setMotor('apagado');
        const repetir = { tipo: 'CENTRIFUGADO', rpm: p.rpm, min: p.min, final: p.final, grupo: p.grupo };
        ciclo.plan.splice(ciclo.indice, 1,
          { tipo: 'FRENADO', grupo: p.grupo, balanceo: n },
          { tipo: 'LLENADO', litros: 15, auto: false, temp: 0, proposito: 'balanceo', grupo: p.grupo, balanceo: n },
          { tipo: 'ENJUAGUE', min: 0.5, intensidad: 'suave', grupo: p.grupo, balanceo: n },
          { tipo: 'DESAGOTE', grupo: p.grupo, balanceo: n },
          repetir);
        entrar();
      } else if (ciclo.rpmMaxForzado == null) {
        ciclo.rpmMaxForzado = c.rpmReducidoDesbalance;
        s.alarmas.activar('E4', { texto: `centrifugado limitado a ${c.rpmReducidoDesbalance} rpm` });
        s.kernel.log('ALERTA', `No se pudo equilibrar en ${c.maxIntentosBalanceo} intentos: centrifuga a ${c.rpmReducidoDesbalance} rpm`);
      }
    };
    s.kernel.registrarIRQ('IRQ3', 'Acelerómetro (vibración)', 3, ciclo.isrVibracion);

    // ---------------- Cancelar / reposo ----------------
    ciclo.cancelar = function (silencioso) {
      if (!ciclo.activo()) return;
      ciclo.cancelando = true;
      ['usuario', 'error', 'sobrecarga'].forEach(m => ciclo.pausas.delete(m));
      s.alarmas.limpiar();
      s.sensores.limpiarSobrecarga();
      if (!silencioso) s.kernel.log('ESTADO', 'Cancelado desde el panel: frena, desagota y vuelve a reposo');
      ciclo.plan = [{ tipo: 'FRENADO', grupo: 'fin' }, { tipo: 'DESAGOTE', grupo: 'fin' }, { tipo: 'FIN', grupo: 'fin' }];
      ciclo.indice = 0;
      entrar();
    };

    ciclo.irAReposo = function () {
      ciclo.estado = 'REPOSO';
      ciclo.plan = [];
      ciclo.indice = 0;
      ciclo.paso = null;
      ciclo.pausas = new Set();
      ciclo.cancelando = false;
    };

    // ---------------- Corte de luz ----------------
    /** Sin energía la RAM se borra: el SO "olvida" todo lo que no guardó. */
    ciclo.perderRAM = function () {
      ciclo.estado = 'SIN_ENERGIA';
      ciclo.plan = [];
      ciclo.indice = 0;
      ciclo.paso = null;
      ciclo.pausas = new Set();
      ciclo.sel = null;
      ciclo.programa = null;
      ciclo.ropaKg = 0;
      ciclo.cancelando = false;
    };

    ciclo.exportar = function () {
      return {
        estado: ciclo.estado,
        pausas: [...ciclo.pausas],
        plan: ciclo.plan,
        indice: ciclo.indice,
        sel: ciclo.sel,
        programaId: ciclo.programa ? ciclo.programa.id : null,
        ropaKg: ciclo.ropaKg,
        litrosObjetivo: ciclo.litrosObjetivo,
        mezcla: ciclo.mezcla,
        desagotesHechos: ciclo.desagotesHechos,
        litrosAlInicio: ciclo.litrosAlInicio,
        aguaAlInicio: ciclo.aguaAlInicio,
        intentosBalanceo: ciclo.intentosBalanceo,
        rpmMaxForzado: ciclo.rpmMaxForzado,
        cancelando: ciclo.cancelando,
        transcurridoMs: ciclo.transcurridoMs()
      };
    };

    /** Corte de menos de 20 min: se retoma el mismo paso con el mismo avance. */
    ciclo.restaurar = function (cp) {
      ciclo.estado = 'EN_MARCHA';
      ciclo.programa = L.programaPorId(cp.programaId);
      ciclo.sel = cp.sel;
      ciclo.plan = cp.plan;
      ciclo.indice = cp.indice;
      ciclo.pausas = new Set(cp.pausas.filter(m => m === 'usuario' || m === 'sobrecarga'));
      ['ropaKg', 'litrosObjetivo', 'mezcla', 'desagotesHechos', 'litrosAlInicio', 'aguaAlInicio',
        'intentosBalanceo', 'rpmMaxForzado', 'cancelando'].forEach(k => { ciclo[k] = cp[k]; });
      ciclo.inicioMs = s.kernel.relojMs - (cp.transcurridoMs || 0);
      const p = ciclo.plan[ciclo.indice];
      if (p.tipo === 'CENTRIFUGADO' && p.fase !== 'freno') p.fase = 'rampa';
      if (p.tipo === 'PESAJE' && p.estado === 'midiendo') p.t = 0;
      if (p.tipo === 'LAVADO' || p.tipo === 'ENJUAGUE') p.reponiendo = false;
      ciclo.paso = p;
      s.kernel.log('ESTADO', `Retoma en el paso ${ciclo.indice + 1} de ${ciclo.plan.length}: ${L.nombrePaso(p)}`);
      s.kernel.emit('ciclo:paso', p);
    };

    /** Corte de 20 min o más: desagota y arranca el programa otra vez. */
    ciclo.reiniciarDesdeCero = function (cp) {
      const kg = cp.ropaKg || 0;
      const sel = cp.sel;
      if (cp.cancelando) {                       // estaba cancelando: solo termina de desagotar
        ciclo.programa = L.programaPorId(cp.programaId);
        ciclo.sel = sel;
        ciclo.estado = 'EN_MARCHA';
        ciclo.pausas = new Set();
        ciclo.inicioMs = s.kernel.relojMs;
        ciclo.cancelar(true);
        return;
      }
      ciclo.iniciar(sel, { sinPesaje: kg > 0, kg, desagotePrevio: true, reinicio: true });
    };

    // ---------------- Estimación del tiempo restante ----------------
    function estimarPlan(plan, desde, enCurso, kg, sel) {
      let total = 0;
      let nivel = enCurso ? s.sensores.nivelL : 0;
      let temp = enCurso ? s.sensores.tempC : c.tempAguaFriaC;
      let rpm = enCurso ? Math.abs(s.sensores.rpm) : 0;
      const litrosAuto = s.sensores.nivelAuto(kg);
      const caliente = s.hw.aguaCalienteConectada;
      for (let i = desde; i < plan.length; i++) {
        const p = plan[i];
        const actual = enCurso && i === desde;
        const t = actual ? (p.t || 0) : 0;
        switch (p.tipo) {
          case 'PESAJE':
            total += actual && p.estado !== 'midiendo' ? 0 : Math.max(0, 20000 - t);
            break;
          case 'FRENADO':
            total += rpm / c.frenoRpmPorSeg * 1000;
            rpm = 0;
            break;
          case 'LLENADO': {
            const litros = p.litros != null ? p.litros : litrosAuto;
            const falta = Math.max(0, litros - nivel);
            total += falta / c.caudalEntradaLmin * MIN;
            const tEntrada = p.proposito === 'lavado' && p.temp > 0 && caliente ? Math.min(p.temp, c.tempAguaCalienteC) : c.tempAguaFriaC;
            if (litros > 0) temp = (temp * Math.min(nivel, litros) + tEntrada * falta) / litros;
            nivel = litros;
            break;
          }
          case 'CALENTAMIENTO': {
            const M = nivel + kg * (c.absorcionLporKg + 0.35) + 4;
            total += M * 4186 * Math.max(0, p.temp - temp) / c.potenciaResistenciaW * 1000;
            temp = p.temp;
            break;
          }
          case 'LAVADO': case 'ENJUAGUE': case 'VAPOR':
            total += Math.max(0, p.min * MIN - t);
            break;
          case 'DESAGOTE':
            total += nivel / c.caudalDesagoteLmin * MIN + Math.max(0, 10000 - (actual ? (p.vacioMs || 0) : 0));
            nivel = 0;
            break;
          case 'CENTRIFUGADO': {
            let r = p.final ? sel.rpm : Math.min(p.rpm, sel.rpm);
            if (enCurso && ciclo.rpmMaxForzado != null) r = Math.min(r, ciclo.rpmMaxForzado);
            if (r <= 0) { total += Math.max(0, 30000 - t); break; }
            const fase = actual ? p.fase : 'rampa';
            if (fase === 'rampa') total += Math.max(0, r - rpm) / c.rampaRpmPorSeg * 1000 + p.min * MIN + r / c.frenoRpmPorSeg * 1000;
            else if (fase === 'meseta') total += Math.max(0, p.min * MIN - t) + r / c.frenoRpmPorSeg * 1000;
            else total += rpm / c.frenoRpmPorSeg * 1000;
            rpm = 0;
            break;
          }
          default: break;
        }
      }
      return total;
    }

    ciclo.restanteMs = () => (ciclo.activo() ? estimarPlan(ciclo.plan, ciclo.indice, true, ciclo.ropaKg, ciclo.sel) : 0);

    /** Duración estimada de una selección antes de arrancar (con la carga máxima del programa). */
    ciclo.estimarSeleccionMs = function (sel) {
      const prog = L.programaPorId(sel.programaId);
      const kg = Math.min(prog.maxKg, c.capacidadMaxKg);
      const plan = L.construirPlan(prog, sel, c, {});
      const litros = s.sensores.nivelAuto(kg);
      plan.forEach(p => { if (p.tipo === 'LLENADO' && p.litros == null) p.litros = litros; });
      return estimarPlan(plan, 0, false, kg, sel);
    };

    return ciclo;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
