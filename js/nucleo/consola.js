/*
 * LAVACRÁN — Consola del sistema operativo (lo que pasa "adentro")
 *
 *  Ciclo:        programa, carga, plan de pasos y avance
 *  Sensores:     lecturas en vivo y estado de cada actuador
 *  Planificador: tareas (prioridad, período, ejecuciones) e interrupciones
 *  Registro:     cada IRQ, cambio de estado, alerta y decisión del SO
 *
 * Responsable: Pareja 3 (núcleo).
 */
(function (L) {
  'use strict';

  const TIPOS_PASO = {
    PESAJE: 'Pesaje', LLENADO: 'Llenado', CALENTAMIENTO: 'Calentamiento', LAVADO: 'Lavado', ENJUAGUE: 'Enjuague',
    VAPOR: 'Vapor', DESAGOTE: 'Desagote', CENTRIFUGADO: 'Centrifugado', FRENADO: 'Frenado', FIN: 'Fin'
  };

  L.crearConsola = function (s) {
    const $ = id => document.getElementById(id);
    const u = L.util;
    const C = { vista: 'ciclo', firmaPlan: '', pegado: true };

    // ---------------- Pestañas ----------------
    const pestanas = ['ciclo', 'sensores', 'planificador'];
    pestanas.forEach((t, i) => {
      const b = $('tab-' + t);
      b.addEventListener('click', () => mostrar(t));
      b.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const j = (i + (e.key === 'ArrowRight' ? 1 : pestanas.length - 1)) % pestanas.length;
        mostrar(pestanas[j]);
        $('tab-' + pestanas[j]).focus();
      });
    });
    function mostrar(t) {
      C.vista = t;
      pestanas.forEach(p => {
        $('tab-' + p).setAttribute('aria-selected', String(p === t));
        $('tab-' + p).tabIndex = p === t ? 0 : -1;
        $('so-' + p).hidden = p !== t;
      });
      C.firmaPlan = '';
      C.render();
    }

    // ---------------- Registro ----------------
    const lista = $('so-registro');
    lista.addEventListener('scroll', () => { C.pegado = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 12; });
    function agregar(e) {
      const li = document.createElement('li');
      li.className = 't-' + e.tipo;
      const t = document.createElement('time'); t.textContent = u.hora(e.t);
      const tipo = document.createElement('span'); tipo.className = 'tipo'; tipo.textContent = e.tipo;
      const m = document.createElement('span'); m.textContent = e.mensaje;
      li.append(t, tipo, m);
      lista.appendChild(li);
      while (lista.children.length > 300) lista.firstChild.remove();
      if (C.pegado) lista.scrollTop = lista.scrollHeight;
    }
    s.kernel.registro.forEach(agregar);
    s.kernel.on('log', agregar);
    $('btn-limpiar-log').addEventListener('click', () => { lista.textContent = ''; });

    // ---------------- Ayudas de dibujo ----------------
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function medidor(nombre, valor, texto, max, marca, nota) {
      const pct = Math.max(0, Math.min(100, valor / max * 100));
      const m = marca != null ? `<em style="left:${Math.max(0, Math.min(100, marca / max * 100)).toFixed(1)}%"></em>` : '';
      return `<div class="medidor"><div class="medidor-cab"><span>${esc(nombre)}</span><b>${esc(texto)}</b></div>
        <div class="medidor-barra"><i style="width:${pct.toFixed(1)}%"></i>${m}</div>${nota ? `<small>${esc(nota)}</small>` : ''}</div>`;
    }

    function detallePaso(p) {
      switch (p.tipo) {
        case 'LLENADO': return p.proposito === 'balanceo' ? `${p.litros} L para redistribuir` : `${p.litros != null ? p.litros + ' L' : 'según la carga'}${p.proposito === 'lavado' && p.temp ? ', agua a ' + p.temp + ' °C' : ', agua fría'}`;
        case 'CALENTAMIENTO': return `hasta ${p.temp} °C`;
        case 'LAVADO': return `${u.kg(p.min)} min, agitación ${p.intensidad}`;
        case 'ENJUAGUE': return p.balanceo ? `redistribución ${p.balanceo} de ${s.config.maxIntentosBalanceo}` : `${p.min} min`;
        case 'VAPOR': return `${p.min} min, hasta ${s.config.tempMaxVaporC} °C`;
        case 'DESAGOTE': return p.previo ? 'agua del corte de luz' : 'bomba encendida';
        case 'CENTRIFUGADO': {
          const rpm = p.final ? (s.ciclo.sel ? s.ciclo.sel.rpm : p.rpm) : p.rpm;
          return rpm ? `${p.final ? 'final' : 'intermedio'}, ${rpm} rpm, ${p.min} min` : 'sin centrifugado';
        }
        case 'PESAJE': return 'celdas de carga, 20 s';
        case 'FRENADO': return 'espera tambor quieto';
        default: return '';
      }
    }

    function avancePaso(p) {
      const sen = s.sensores;
      switch (p.tipo) {
        case 'PESAJE': return p.estado === 'midiendo' ? (p.t || 0) / 20000 : 1;
        case 'LLENADO': return p.litros ? sen.nivelL / p.litros : 0;
        case 'CALENTAMIENTO': return sen.tempC / p.temp;
        case 'LAVADO': case 'ENJUAGUE': case 'VAPOR': return (p.t || 0) / (p.min * 60000);
        case 'DESAGOTE': return sen.nivelL < 0.5 ? 0.6 + 0.4 * (p.vacioMs || 0) / 10000 : 0.5 * Math.max(0, 1 - sen.nivelL / 70);
        case 'CENTRIFUGADO':
          if (!p.fase || p.fase === 'rampa') return 0.1 * Math.abs(sen.rpm) / Math.max(1, p.rpmEfectivo || p.rpm);
          if (p.fase === 'meseta') return 0.1 + 0.85 * (p.t || 0) / (p.min * 60000);
          return 0.97;
        default: return 0;
      }
    }

    // ---------------- Vistas ----------------
    function vistaCiclo() {
      const ci = s.ciclo;
      const caja = $('so-ciclo');
      if (!ci.activo()) {
        const ult = s.energia.ultimoArranque;
        const extra = ult && ult.durMs > 0 ? `<p class="so-subtitulo">Último arranque: ${esc(ult.origen)}, corte de ${u.mmss(ult.durMs)}, ${esc(ult.decision)}.</p>` : '';
        const firma = 'quieto:' + ci.estado + (ult ? ult.enMs : '');
        if (C.firmaPlan !== firma) {
          C.firmaPlan = firma;
          caja.innerHTML = `<p class="so-subtitulo">${ci.estado === 'PROGRAMADO' ? 'Esperando la hora del inicio diferido.' : 'No hay un programa en marcha.'}</p>
            <p style="font-size:13px;color:var(--so-suave);max-width:52ch">Cuando empiece un programa, acá aparece el plan de pasos que arma la máquina de estados y el avance de cada uno.</p>${extra}`;
        }
        return;
      }
      const firma = ci.plan.length + ':' + ci.plan.map(p => p.tipo[0] + (p.litros || '') + (p.min || '')).join('') + ':' + ci.indice;
      if (C.firmaPlan !== firma) {
        C.firmaPlan = firma;
        const filas = ci.plan.map((p, i) => `<tr class="${i < ci.indice ? 'hecho' : i === ci.indice ? 'actual' : ''}" data-i="${i}">
          <td>${i + 1}</td><td class="txt">${esc(TIPOS_PASO[p.tipo] || p.tipo)}</td><td class="txt">${esc(detallePaso(p))}</td><td class="avance">${i < ci.indice ? '✓' : ''}</td></tr>`).join('');
        caja.innerHTML = `<div class="so-datos" id="so-datos"></div>
          <table class="so-tabla"><thead><tr><th>#</th><th>Paso</th><th>Detalle</th><th>Avance</th></tr></thead><tbody>${filas}</tbody></table>`;
      }
      const sel = ci.sel;
      $('so-datos').innerHTML = [
        ['Programa', ci.programa.nombre],
        ['Ropa registrada', `${u.kg(ci.ropaKg)} kg`],
        ['Límite del programa', ci.limiteKg() === 0 ? 'tambor vacío' : `${u.kg(ci.limiteKg(), 0)} kg`],
        ['Nivel objetivo', ci.litrosObjetivo ? `${ci.litrosObjetivo} L${ci.nivelAutoActivo() ? ' (auto)' : ''}` : '—'],
        ['Temperatura', sel.temp ? `${sel.temp} °C` : 'fría'],
        ['Centrifugado', ci.rpmMaxForzado != null ? `${Math.min(sel.rpm, ci.rpmMaxForzado)} rpm (limitado)` : (sel.rpm ? `${sel.rpm} rpm` : 'sin centrifugado')],
        ['Transcurrido', u.mmss(ci.transcurridoMs())],
        ['Restante', u.mmss(ci.restanteMs())],
        ['Pausa', ci.pausas.size ? [...ci.pausas].join(', ') : 'no'],
        ['Intentos de balanceo', `${ci.intentosBalanceo} de ${s.config.maxIntentosBalanceo}`]
      ].map(([a, b]) => `<div><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('');
      const fila = $('so-ciclo').querySelector(`tr[data-i="${ci.indice}"] .avance`);
      if (fila && ci.paso) {
        const pct = Math.max(0, Math.min(1, avancePaso(ci.paso))) * 100;
        fila.innerHTML = `${pct.toFixed(0)} %<span class="barrita"><i style="width:${pct.toFixed(1)}%"></i></span>`;
      }
    }

    function vistaSensores() {
      const sen = s.sensores, hw = s.hw, ci = s.ciclo, c = s.config;
      const cruzado = sen.controlCruzadoKg();
      const real = hw.ropaKg();
      const html = [
        medidor('Peso bruto (celdas de carga)', sen.pesoKg, `${u.kg(sen.pesoKg, 2)} kg`, 110, c.taraKg, `Tara de tina y tambor: ${u.kg(c.taraKg)} kg`),
        medidor('Ropa según el SO', sen.ropaEnVivoKg(), `${u.kg(sen.ropaEnVivoKg(), 2)} kg`, 12, ci.activo() ? ci.limiteKg() : c.capacidadMaxKg,
          `Real en el simulador: ${u.kg(real, 2)} kg${cruzado != null ? `; control cruzado (peso − tara − litros): ${u.kg(cruzado, 2)} kg` : ''}`),
        medidor('Nivel de agua (presostato)', sen.nivelL, `${u.kg(sen.nivelL)} L`, 80, ci.activo() ? ci.litrosObjetivo : null,
          `Caudalímetro: ${u.kg(hw.leerCaudalimetroL(), 0)} L cargados desde que se instaló`),
        medidor('Temperatura (NTC)', sen.tempC, `${u.kg(sen.tempC)} °C`, 90, ci.activo() && ci.sel.temp ? ci.sel.temp : null),
        medidor('Velocidad del tambor (tacómetro)', Math.abs(sen.rpm), `${Math.round(Math.abs(sen.rpm))} rpm`, 850),
        medidor('Vibración (acelerómetro)', sen.vibracion, `${Math.round(sen.vibracion)}`, 100, c.vibracionUmbral, `Umbral de desbalance: ${c.vibracionUmbral}`)
      ].join('');
      const chips = [
        ['Válvula fría', hw.valvulaFria > 0], ['Válvula caliente', hw.valvulaCaliente > 0], ['Bomba', hw.bomba],
        ['Resistencia', hw.resistencia, true], ['Vapor', hw.vapor, true],
        [`Motor: ${hw.motor.modo}`, hw.motor.modo !== 'apagado'], [`Tapa ${hw.tapaAbierta ? 'abierta' : 'cerrada'}`, hw.tapaAbierta],
        [hw.energia ? 'Con energía' : 'Sin energía', hw.energia]
      ].map(([n, on, calor]) => `<span class="actuador${on ? ' on' : ''}${on && calor ? ' calor' : ''}">${esc(n)}</span>`).join('');
      $('so-sensores').innerHTML = html + `<p class="so-subtitulo">Actuadores</p><div class="actuadores">${chips}</div>`;
    }

    function vistaPlanificador() {
      const k = s.kernel;
      const tareas = k.tareas.map(t => `<tr><td>${t.id}</td><td class="txt">${esc(t.nombre)}</td><td>${t.prioridad}</td><td>${t.periodoMs >= 1000 ? t.periodoMs / 1000 + ' s' : t.periodoMs + ' ms'}</td><td>${t.ejecuciones.toLocaleString('es')}</td><td class="txt">${!k.enEjecucion ? 'sin CPU' : t.estado.toLowerCase()}</td></tr>`).join('');
      const irqs = Object.values(k.irqs).sort((a, b) => a.prioridad - b.prioridad)
        .map(e => `<tr><td>${e.num}</td><td class="txt">${esc(e.nombre)}</td><td>${e.prioridad}</td><td>${e.cuenta.toLocaleString('es')}</td><td>${e.ultimaMs != null ? u.hora(e.ultimaMs) : '—'}</td></tr>`).join('');
      $('so-planificador').innerHTML = `
        <table class="so-tabla"><thead><tr><th>Tarea</th><th>Nombre</th><th>Prior.</th><th>Período</th><th>Veces</th><th>Estado</th></tr></thead><tbody>${tareas}</tbody></table>
        <p class="so-subtitulo">Interrupciones (se atienden antes que las tareas)</p>
        <table class="so-tabla"><thead><tr><th>Línea</th><th>Dispositivo</th><th>Prior.</th><th>Veces</th><th>Última</th></tr></thead><tbody>${irqs}</tbody></table>
        <p style="font-size:12.5px;color:var(--so-suave);margin-top:10px;max-width:60ch">En cada tick de 100 ms el núcleo atiende las interrupciones pendientes y después ejecuta, de mayor a menor prioridad, las tareas cuyo período se cumplió.</p>`;
    }

    // ---------------- Cabecera ----------------
    C.render = function () {
      const ci = s.ciclo, k = s.kernel;
      const v = ci.estadoVisible();
      const chip = $('so-estado');
      const motivo = ci.motivoPausa();
      const textos = { EN_MARCHA: 'En marcha', REPOSO: 'Reposo', PROGRAMADO: 'Programado', FIN: 'Fin', APAGADO: 'Apagado', SIN_ENERGIA: 'Sin energía' };
      chip.textContent = v === 'PAUSA' ? `Pausa: ${motivo}` : (textos[v] || v);
      chip.className = 'so-estado' + (v === 'EN_MARCHA' ? ' marcha' : v === 'PAUSA' ? (motivo === 'error' || motivo === 'sobrecarga' ? ' error' : ' pausa') : v === 'SIN_ENERGIA' ? ' sinluz' : '');
      $('so-reloj').textContent = u.hora(k.relojMs);
      $('so-ticks').textContent = k.ticks.toLocaleString('es');
      $('so-paso').textContent = !k.enEjecucion ? 'CPU sin energía' : ci.activo() && ci.paso ? `${ci.indice + 1} de ${ci.plan.length}: ${L.nombrePaso(ci.paso)}` : 'sin programa';
      if (C.vista === 'ciclo') vistaCiclo();
      else if (C.vista === 'sensores') vistaSensores();
      else vistaPlanificador();
    };

    mostrar('ciclo');
    return C;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
