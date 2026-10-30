/*
 * LAVACRÁN — Panel de control en pantalla (función 1)
 *
 * Dibuja la perilla con los 9 programas, la pantalla LCD y las teclas.
 * Cada tecla llama a s.control.presionar(...), que genera la IRQ2.
 * Mantener M1/M2/M3 1,5 s guarda; mantener Inicio/Pausa 2 s cancela.
 *
 * Responsable: Pareja 1 (panel de control).
 */
(function (L) {
  'use strict';

  const ICONOS = {
    tapa: '<svg viewBox="0 0 24 24"><path d="M3 20h18M5 20V12M19 20v-8M5 12l13-7"/></svg>',
    vapor: '<svg viewBox="0 0 24 24"><path d="M7 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M17 20c-2-3 2-5 0-8s2-5 0-8"/></svg>',
    diferido: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
    silencio: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6"/></svg>',
    limpieza: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M18 2v3M16.5 3.5h3"/></svg>'
  };
  const ORDEN_FASES = ['lavado', 'vapor', 'enjuague', 'centrifugado'];
  const TEXTO_NIVEL = { auto: 'AUTO', bajo: '25 L', medio: '40 L', alto: '55 L', extra: '70 L' };

  L.crearPanel = function (s, sonidos) {
    const $ = id => document.getElementById(id);
    const u = L.util;
    const P = { aviso: null, avisoHasta: 0, resaltes: {}, ultima: null, cache: {} };

    // ---------------- Perilla ----------------
    const zona = $('perilla-etiquetas');
    const cara = document.querySelector('.perilla-cara');
    const CX = 150, CY = 104, R = 74;
    const botones = L.programas.map((p, i) => {
      const ang = -135 + i * 33.75;
      const rad = ang * Math.PI / 180;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prog' + (ang < -12 ? ' izq' : ang > 12 ? ' der' : '');
      b.style.left = (CX + R * Math.sin(rad)).toFixed(1) + 'px';
      b.style.top = (CY - R * Math.cos(rad)).toFixed(1) + 'px';
      b.innerHTML = `<i></i><span>${p.corto}</span>`;
      b.setAttribute('aria-pressed', 'false');
      b.title = p.nombre;
      b.addEventListener('click', () => tecla('PROGRAMA', p.id));
      zona.appendChild(b);
      return b;
    });
    const perilla = $('perilla');
    perilla.addEventListener('click', () => tecla('PERILLA'));
    perilla.addEventListener('wheel', e => {
      e.preventDefault();
      mover(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    perilla.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); mover(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); mover(-1); }
    });
    function mover(paso) {
      const i = L.programas.findIndex(p => p.id === s.control.sel.programaId);
      const n = L.programas.length;
      tecla('PROGRAMA', L.programas[(i + paso + n) % n].id);
    }

    // ---------------- Teclas ----------------
    function tecla(nombre, extra) {
      sonidos.desbloquear();
      if (s.kernel.enEjecucion && (s.control.encendido || nombre === 'ENCENDIDO')) sonidos.tecla();
      s.control.presionar(nombre, extra);
      const campo = { TEMPERATURA: 'lcd-temp', NIVEL: 'lcd-nivel', CENTRIFUGADO: 'lcd-rpm' }[nombre];
      if (campo) P.resaltes[campo] = performance.now() + 900;
    }
    P.tecla = tecla;

    document.querySelectorAll('[data-tecla]').forEach(b => {
      b.addEventListener('click', () => tecla(b.dataset.tecla));
    });

    function conMantener(boton, msMantener, alTocar, alMantener) {
      let timer = null, mantuvo = false;
      boton.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        mantuvo = false;
        boton.classList.add('manteniendo');
        timer = setTimeout(() => {
          mantuvo = true;
          boton.classList.remove('manteniendo');
          alMantener();
        }, msMantener);
      });
      const soltar = () => { clearTimeout(timer); boton.classList.remove('manteniendo'); };
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => boton.addEventListener(ev, soltar));
      boton.addEventListener('click', e => {
        if (mantuvo) { mantuvo = false; return; }
        if (e.shiftKey) alMantener(); else alTocar();
      });
      boton.addEventListener('contextmenu', e => e.preventDefault());
    }

    document.querySelectorAll('[data-memoria]').forEach(b => {
      const n = Number(b.dataset.memoria);
      b.title = 'Tocar para cargar. Mantener 1,5 s (o Shift + clic) para guardar.';
      conMantener(b, 1500, () => tecla('MEMORIA', { n }), () => { tecla('MEMORIA', { n, guardar: true }); sonidos.guardado(); });
    });

    conMantener($('tecla-inicio'), 2000, () => tecla('INICIO'), () => tecla('CANCELAR'));
    $('tecla-inicio').title = 'Tocar para iniciar o pausar. Mantener 2 s (o Shift + clic) para cancelar.';

    $('tecla-sonido').addEventListener('click', () => { sonidos.desbloquear(); sonidos.alternar(); });

    s.kernel.on('aviso', a => { P.aviso = a.texto; P.avisoHasta = performance.now() + 2800; });

    // ---------------- Modelo de la pantalla ----------------
    P.pantalla = function (ahora) {
      const ciclo = s.ciclo, ctrl = s.control, est = ciclo.estado;
      const activo = ciclo.activo();
      const sel = activo ? ciclo.sel : ctrl.sel;
      const prog = activo ? ciclo.programa : L.programaPorId(sel.programaId);
      const r = {
        programaId: prog.id,
        apagada: !s.kernel.enEjecucion || est === 'APAGADO' || est === 'SIN_ENERGIA',
        programa: prog.nombre.toUpperCase(),
        tiempo: '', etiqueta: '', parpadea: false,
        temp: sel.temp ? sel.temp + '°' : 'FRÍA',
        agua: 'AGUA', nivel: '', rpm: '', kg: '--',
        fase: null, fasesHechas: [], tieneVapor: !!prog.vaporMin,
        mensaje: '', tipoMensaje: '',
        iconos: []
      };
      // nivel
      const auto = prog.nivelFijo ? false : sel.nivel === 'auto';
      r.agua = auto ? 'AGUA AUTO' : 'AGUA';
      if (prog.tipo === 'centrifugado') r.nivel = '--';
      else if (activo && auto && ciclo.ropaKg > 0) r.nivel = s.sensores.nivelAuto(ciclo.ropaKg) + ' L';
      else r.nivel = prog.nivelFijo ? TEXTO_NIVEL[prog.nivelFijo] : TEXTO_NIVEL[sel.nivel];
      // centrifugado
      let rpm = sel.rpm;
      if (activo && ciclo.rpmMaxForzado != null) rpm = Math.min(rpm, ciclo.rpmMaxForzado);
      r.rpm = rpm ? String(rpm) : 'SIN';
      // carga
      const paso = ciclo.paso;
      if (activo) {
        if (paso && paso.tipo === 'PESAJE' && paso.estado === 'midiendo') r.kg = '…';
        else r.kg = u.kg(s.sensores.ropaEnVivoKg());
      }

      // tiempo
      const alarma = s.alarmas.principal();
      if (est === 'PROGRAMADO') {
        r.tiempo = u.hmm(s.diferido.restanteMs()); r.etiqueta = 'inicia en';
      } else if (activo) {
        if (alarma && alarma.detiene) { r.tiempo = alarma.codigo; r.etiqueta = alarma.titulo.toLowerCase(); r.parpadea = true; }
        else { r.tiempo = u.hmm(ciclo.restanteMs()); r.etiqueta = ciclo.cancelando ? 'cancelando' : 'restante'; r.parpadea = ciclo.pausas.size > 0; }
      } else if (est === 'FIN') {
        r.tiempo = 'FIN'; r.etiqueta = 'terminado';
      } else if (ctrl.sel.diferidoMin > 0) {
        r.tiempo = u.hmm(ctrl.sel.diferidoMin * 60000); r.etiqueta = 'inicia en';
      } else {
        r.tiempo = u.hmm(ciclo.estimarSeleccionMs(ctrl.sel)); r.etiqueta = 'estimado';
      }

      // fases
      if (activo && paso) {
        const fases = ORDEN_FASES.filter(f => f !== 'vapor' || r.tieneVapor);
        const g = paso.grupo === 'fin' ? null : paso.grupo;
        r.fase = g;
        if (g) r.fasesHechas = fases.slice(0, fases.indexOf(g));
      } else if (est === 'FIN') {
        r.fasesHechas = ORDEN_FASES.slice();
      }

      // mensaje (lo más importante primero)
      const motivo = ciclo.motivoPausa();
      if (alarma && activo) {
        r.mensaje = `${alarma.codigo} ${alarma.titulo}: ${alarma.texto || alarma.accion}`;
        r.tipoMensaje = alarma.detiene ? 'error' : 'alerta';
      } else if (motivo === 'tapa') {
        r.mensaje = 'Tapa abierta: en pausa. Al cerrarla sigue sola'; r.tipoMensaje = 'alerta';
      } else if (motivo === 'usuario') {
        r.mensaje = 'En pausa: presione Inicio para seguir'; r.tipoMensaje = 'alerta';
      } else if (P.aviso && ahora < P.avisoHasta) {
        r.mensaje = P.aviso; r.tipoMensaje = 'alerta';
      } else if (activo && paso) {
        r.mensaje = paso.balanceo && paso.tipo === 'ENJUAGUE'
          ? `Redistribuyendo la ropa (${paso.balanceo} de ${s.config.maxIntentosBalanceo})`
          : L.nombrePaso(paso);
        if (paso.tipo === 'CALENTAMIENTO') r.mensaje += ` (${u.kg(s.sensores.tempC)} °C)`;
        if (paso.tipo === 'CENTRIFUGADO') r.mensaje += ` a ${Math.round(Math.abs(s.sensores.rpm))} rpm`;
      } else if (est === 'PROGRAMADO') {
        r.mensaje = `Comienza a las ${u.hora(s.diferido.inicioMs).slice(0, 5)}`;
      } else if (est === 'FIN') {
        r.mensaje = 'Lavado terminado. Puede abrir la tapa';
      } else if (s.memoria.necesitaAutolimpieza()) {
        r.mensaje = 'Se recomienda la autolimpieza del tambor'; r.tipoMensaje = 'alerta';
      } else if (ciclo.resultado === 'cancelado') {
        r.mensaje = 'Programa cancelado';
      } else {
        r.mensaje = s.hw.tapaAbierta ? 'Tapa abierta' : 'Listo: elija programa y presione Inicio';
      }
      r.mensaje = r.mensaje.toUpperCase();

      // íconos
      if (s.hw.tapaAbierta) r.iconos.push('tapa');
      if (s.hw.vapor || (paso && paso.tipo === 'VAPOR')) r.iconos.push('vapor');
      if (est === 'PROGRAMADO' || ctrl.sel.diferidoMin > 0) r.iconos.push('diferido');
      if (ctrl.memoriaActiva) r.iconos.push('M' + ctrl.memoriaActiva);
      if (sonidos.silencio) r.iconos.push('silencio');
      if (s.memoria.necesitaAutolimpieza()) r.iconos.push('limpieza');
      return r;
    };

    // ---------------- Dibujo ----------------
    const lcd = $('lcd');
    function poner(id, texto) {
      if (P.cache[id] === texto) return;
      P.cache[id] = texto;
      $(id).textContent = texto;
    }

    P.render = function (ahora) {
      const r = P.pantalla(ahora);
      P.ultima = r;
      lcd.classList.toggle('apagada', r.apagada);
      poner('lcd-programa', r.programa);
      poner('lcd-tiempo', r.tiempo);
      poner('lcd-tiempo-etq', r.etiqueta);
      poner('lcd-temp', r.temp);
      poner('lcd-nivel', r.nivel);
      poner('lcd-rpm', r.rpm);
      poner('lcd-kg', r.kg);
      poner('lcd-mensaje', r.mensaje);
      const etqAgua = lcd.querySelector('.lcd-params div:nth-child(2) small');
      if (etqAgua.textContent !== r.agua) etqAgua.textContent = r.agua;
      $('lcd-tiempo').classList.toggle('parpadea', r.parpadea);
      const msg = $('lcd-mensaje');
      msg.classList.toggle('alerta', r.tipoMensaje === 'alerta');
      msg.classList.toggle('error', r.tipoMensaje === 'error');
      ['lcd-temp', 'lcd-nivel', 'lcd-rpm'].forEach(id => $(id).classList.toggle('resalta', (P.resaltes[id] || 0) > ahora));

      const iconos = r.iconos.map(i => (ICONOS[i] ? ICONOS[i] : `<b>${i}</b>`)).join('');
      if (P.cache.iconos !== iconos) { P.cache.iconos = iconos; $('lcd-iconos').innerHTML = iconos; }

      document.querySelectorAll('#lcd-fases span').forEach(sp => {
        const f = sp.dataset.fase;
        sp.classList.toggle('oculta', f === 'vapor' && !r.tieneVapor);
        sp.classList.toggle('actual', f === r.fase);
        sp.classList.toggle('hecha', r.fasesHechas.includes(f));
      });

      // perilla y etiquetas
      const idx = L.programas.findIndex(p => p.id === r.programaId);
      const giro = (-135 + idx * 33.75).toFixed(2);
      if (P.cache.giro !== giro) { P.cache.giro = giro; cara.style.transform = `rotate(${giro}deg)`; }
      botones.forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx && !r.apagada)));

      // LEDs de teclas
      const ctrl = s.control;
      $('tecla-diferido').classList.toggle('activa', !r.apagada && (s.ciclo.estado === 'PROGRAMADO' || ctrl.sel.diferidoMin > 0));
      document.querySelectorAll('[data-memoria]').forEach(b => b.classList.toggle('activa', !r.apagada && ctrl.memoriaActiva === Number(b.dataset.memoria)));
      $('tecla-sonido').classList.toggle('activa', !sonidos.silencio);
      ['TEMPERATURA', 'NIVEL', 'CENTRIFUGADO'].forEach(t => {
        const id = { TEMPERATURA: 'lcd-temp', NIVEL: 'lcd-nivel', CENTRIFUGADO: 'lcd-rpm' }[t];
        document.querySelector(`[data-tecla="${t}"]`).classList.toggle('activa', (P.resaltes[id] || 0) > ahora);
      });
      document.querySelector('.tecla-encendido').classList.toggle('encendido', !r.apagada);
      return r;
    };

    return P;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
