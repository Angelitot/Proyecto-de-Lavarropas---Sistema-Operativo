/*
 * LAVACRÁN OS — Panel de control: lógica de las teclas (función 1)
 *
 * Cada botón del panel genera la interrupción IRQ2 (teclado). La rutina de
 * servicio decide qué hacer según el estado del lavarropas.
 *
 *  Encendido · Perilla de programas · Temperatura · Nivel de agua ·
 *  Centrifugado (se puede cambiar en marcha) · Diferido · M1 M2 M3 ·
 *  Inicio/Pausa (mantener 2 s = cancelar)
 *
 * No toca la pantalla: solo cambia la selección y avisa por eventos. El dibujo
 * del panel está en panel.js.
 * Responsable: Pareja 1 (panel de control).
 */
(function (L) {
  'use strict';

  const NOMBRES = {
    ENCENDIDO: 'Encendido', PROGRAMA: 'Perilla', PERILLA: 'Perilla', TEMPERATURA: 'Temperatura',
    NIVEL: 'Nivel de agua', CENTRIFUGADO: 'Centrifugado', DIFERIDO: 'Diferido', MEMORIA: 'Memoria',
    INICIO: 'Inicio/Pausa', CANCELAR: 'Cancelar (Inicio mantenido)'
  };
  const ORDEN_NIVEL = ['auto', 'bajo', 'medio', 'alto', 'extra'];
  const CAMBIAN_SELECCION = ['PROGRAMA', 'PERILLA', 'TEMPERATURA', 'NIVEL', 'CENTRIFUGADO'];

  L.crearControl = function (s) {
    const c = s.config;
    let contadorAvisos = 0;

    const C = { encendido: true, sel: null, memoriaActiva: null, aviso: null };

    C.seleccionDefecto = function (id) {
      const p = L.programaPorId(id) || L.programas[0];
      return { programaId: p.id, temp: p.tempDef, nivel: p.nivelFijo || 'auto', rpm: p.rpmDef, diferidoMin: 0 };
    };

    /** Revisa que una selección guardada siga siendo válida para su programa. */
    C.normalizar = function (sel) {
      const p = sel && L.programaPorId(sel.programaId);
      if (!p) return C.seleccionDefecto('normal');
      const d = C.seleccionDefecto(p.id);
      return {
        programaId: p.id,
        temp: p.temps.includes(sel.temp) ? sel.temp : d.temp,
        nivel: p.nivelFijo || (ORDEN_NIVEL.includes(sel.nivel) ? sel.nivel : 'auto'),
        rpm: p.rpms.includes(sel.rpm) ? sel.rpm : d.rpm,
        diferidoMin: 0
      };
    };

    C.sel = C.normalizar(s.memoria.ultimo());
    C.programa = () => L.programaPorId(C.sel.programaId);

    C.avisar = function (texto) {
      C.aviso = { texto, id: ++contadorAvisos };
      s.kernel.log('PANEL', texto);
      s.kernel.emit('aviso', C.aviso);
    };

    /** Lo llama la interfaz: cada tecla es una interrupción. */
    C.presionar = function (tecla, extra) {
      const detalle = NOMBRES[tecla] + (tecla === 'PROGRAMA' && extra ? ` → ${L.programaPorId(extra).corto}`
        : tecla === 'MEMORIA' && extra ? ` M${extra.n}${extra.guardar ? ' (guardar)' : ''}` : '');
      return s.kernel.irq('IRQ2', { tecla, extra, detalle });
    };

    const editable = () => C.encendido && (s.ciclo.estado === 'REPOSO' || s.ciclo.estado === 'FIN');
    function noEditable() {
      if (s.ciclo.estado === 'PROGRAMADO') return C.avisar('Hay un inicio diferido: mantenga Inicio/Pausa para cancelarlo');
      return C.avisar('Con el programa en marcha solo se puede cambiar el centrifugado');
    }
    function prepararSeleccion() { if (s.ciclo.estado === 'FIN') s.ciclo.irAReposo(); }

    const ACCIONES = {
      ENCENDIDO() {
        if (C.encendido) {
          if (s.ciclo.activo()) return C.avisar('Para apagar, primero cancele el programa (mantener Inicio/Pausa)');
          if (s.ciclo.estado === 'PROGRAMADO') s.diferido.cancelar();
          C.encendido = false;
          s.ciclo.estado = 'APAGADO';
          s.kernel.log('PANEL', 'Lavarropas apagado');
        } else {
          C.encendido = true;
          s.ciclo.irAReposo();
          C.sel = C.normalizar(s.memoria.ultimo());
          s.kernel.log('PANEL', 'Lavarropas encendido: se recuerda el último programa usado');
          if (s.memoria.necesitaAutolimpieza()) C.avisar('Se recomienda hacer la autolimpieza del tambor');
        }
        s.energia.guardar('encendido');
      },
      PROGRAMA(id) {
        if (!editable()) return noEditable();
        prepararSeleccion();
        C.sel = C.seleccionDefecto(id);
      },
      PERILLA() {
        if (!editable()) return noEditable();
        prepararSeleccion();
        const i = L.programas.findIndex(p => p.id === C.sel.programaId);
        C.sel = C.seleccionDefecto(L.programas[(i + 1) % L.programas.length].id);
      },
      TEMPERATURA() {
        if (!editable()) return noEditable();
        const t = C.programa().temps;
        if (t.length === 1) return C.avisar('Este programa tiene la temperatura fija');
        C.sel.temp = t[(t.indexOf(C.sel.temp) + 1) % t.length];
      },
      NIVEL() {
        if (!editable()) return noEditable();
        const p = C.programa();
        if (p.nivelFijo) return C.avisar('Este programa usa siempre el nivel extra');
        if (p.tipo === 'centrifugado') return C.avisar('Este programa no carga agua');
        C.sel.nivel = ORDEN_NIVEL[(ORDEN_NIVEL.indexOf(C.sel.nivel) + 1) % ORDEN_NIVEL.length];
      },
      CENTRIFUGADO() {
        const p = C.programa();
        if (p.rpms.length === 1) return C.avisar('Este programa tiene el centrifugado fijo');
        if (s.ciclo.activo()) {
          const sel = s.ciclo.sel;
          sel.rpm = p.rpms[(p.rpms.indexOf(sel.rpm) + 1) % p.rpms.length];
          C.sel.rpm = sel.rpm;
          s.kernel.log('PANEL', `Centrifugado final cambiado en marcha: ${sel.rpm ? sel.rpm + ' rpm' : 'sin centrifugado'}`);
          return;
        }
        if (!editable()) return noEditable();
        C.sel.rpm = p.rpms[(p.rpms.indexOf(C.sel.rpm) + 1) % p.rpms.length];
      },
      DIFERIDO() {
        if (!editable()) return noEditable();
        const pasos = c.diferidoPasosMin;
        const i = pasos.indexOf(C.sel.diferidoMin);
        C.sel.diferidoMin = i === -1 ? pasos[0] : (i === pasos.length - 1 ? 0 : pasos[i + 1]);
      },
      MEMORIA(o) {
        const n = o.n;
        if (o.guardar) {
          const sel = s.ciclo.activo() ? s.ciclo.sel : C.sel;
          s.memoria.guardarFavorito(n, sel);
          C.memoriaActiva = n;
          return C.avisar(`Guardado en M${n}`);
        }
        if (!editable()) return noEditable();
        const f = s.memoria.favorito(n);
        if (!f) return C.avisar(`M${n} está vacío: mantenga el botón 1,5 s para guardar`);
        prepararSeleccion();
        C.sel = C.normalizar(f);
        C.memoriaActiva = n;
        C.avisar(`M${n} cargado: ${C.programa().nombre}`);
      },
      INICIO() {
        const ciclo = s.ciclo;
        if (ciclo.estado === 'PROGRAMADO') return s.diferido.iniciarYa();
        if (ciclo.activo()) {
          if (ciclo.cancelando) return C.avisar('Cancelando: desagotando el agua');
          if (ciclo.pausas.has('error')) { s.alarmas.reintentar(); return; }
          if (ciclo.pausas.has('usuario')) { ciclo.reanudar('usuario'); return; }
          if (ciclo.pausas.has('sobrecarga')) return C.avisar('Abra la tapa y retire ropa: la carga supera el límite');
          if (ciclo.pausas.has('tapa')) return C.avisar('Cierre la tapa para continuar');
          ciclo.pausar('usuario');
          return;
        }
        if (ciclo.estado === 'FIN') ciclo.irAReposo();
        if (ciclo.estado !== 'REPOSO') return;
        if (C.sel.diferidoMin > 0) {
          const min = C.sel.diferidoMin;
          C.sel.diferidoMin = 0;
          s.diferido.programar(min, C.sel);
          return;
        }
        ciclo.iniciar(C.sel);
      },
      CANCELAR() {
        if (s.ciclo.estado === 'PROGRAMADO') return s.diferido.cancelar();
        if (!s.ciclo.activo()) return;
        s.ciclo.cancelar();
      }
    };

    C.isr = function (d) {
      const accion = ACCIONES[d.tecla];
      if (!accion) return;
      if (!C.encendido && d.tecla !== 'ENCENDIDO') return;
      accion(d.extra);
      if (CAMBIAN_SELECCION.includes(d.tecla) && editable()) C.memoriaActiva = null;
      s.kernel.emit('panel', { tecla: d.tecla });
    };
    s.kernel.registrarIRQ('IRQ2', 'Panel de control (teclado)', 2, C.isr);

    C.exportar = () => ({ encendido: C.encendido, sel: L.util.copiar(C.sel) });
    C.importar = function (d) {
      if (!d) return;
      C.encendido = d.encendido !== false;
      C.sel = C.normalizar(d.sel);
    };

    return C;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
