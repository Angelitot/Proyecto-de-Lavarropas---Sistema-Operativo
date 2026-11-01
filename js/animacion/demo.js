/*
 * LAVACRÁN — Mesa de pruebas
 *
 * Simula el mundo real alrededor del lavarropas: ropa, tapa, cortes de luz,
 * canilla, desagote y desbalance. El SO no "ve" esta mesa: se entera de todo
 * solo a través de sus sensores e interrupciones.
 *
 * Responsable: Pareja 5 (animación y demo).
 */
(function (L) {
  'use strict';

  L.PRENDAS = [
    { nombre: 'Remera', kg: 0.2, color: '#E0533F', tipo: 'remera' },
    { nombre: 'Camisa', kg: 0.3, color: '#EDEAE0', tipo: 'camisa' },
    { nombre: 'Medias', kg: 0.1, color: '#3B3B3B', tipo: 'media' },
    { nombre: 'Jean', kg: 0.8, color: '#2F4E7A', tipo: 'jean' },
    { nombre: 'Buzo', kg: 0.7, color: '#2E8C7E', tipo: 'buzo' },
    { nombre: 'Toalla', kg: 0.6, color: '#F0B14A', tipo: 'toalla' },
    { nombre: 'Sábana', kg: 0.9, color: '#9CC7E0', tipo: 'sabana' },
    { nombre: 'Campera', kg: 1.2, color: '#5B4B73', tipo: 'campera' },
    { nombre: 'Acolchado', kg: 2.5, color: '#E3D3A4', tipo: 'acolchado' }
  ];
  const CARGAS = {
    3: ['Jean', 'Buzo', 'Toalla', 'Camisa', 'Remera', 'Remera', 'Medias', 'Medias'],
    6: ['Jean', 'Jean', 'Campera', 'Buzo', 'Toalla', 'Toalla', 'Sábana', 'Remera', 'Medias', 'Medias'],
    9.5: ['Acolchado', 'Jean', 'Jean', 'Campera', 'Sábana', 'Sábana', 'Toalla', 'Toalla', 'Buzo', 'Remera', 'Remera', 'Medias']
  };

  /**
   * Arma una carga de ropa al azar (botón "Cargar al azar", pedido por el profesor).
   * Elige un peso al azar entre minKg y espacioKg (puede pasar los 10 kg) y junta
   * prendas al azar hasta llegar justo a ese peso. Como las medias pesan 0,1 kg,
   * siempre se llega exacto. Se trabaja en décimas de kg para no acumular errores.
   * @param {number} espacioKg  lo que todavía entra en el tambor
   * @param {function} azar     generador entre 0 y 1 (Math.random; en las pruebas, uno repetible)
   * @param {number} minKg      carga mínima
   * @returns {{kg: number, nombres: string[]} | null}  null si no entra nada
   */
  L.cargaAleatoria = function (espacioKg, azar = Math.random, minKg = 0.5) {
    const espacio = Math.floor(espacioKg * 10 + 1e-6);
    if (espacio < 1) return null;
    const min = Math.min(Math.max(1, Math.round(minKg * 10)), espacio);
    const objetivo = min + Math.floor(azar() * (espacio - min + 1));
    const nombres = [];
    let resto = objetivo;
    while (resto > 0) {
      const caben = L.PRENDAS.filter(p => Math.round(p.kg * 10) <= resto);
      if (!caben.length) break;
      const p = caben[Math.floor(azar() * caben.length)];
      nombres.push(p.nombre);
      resto -= Math.round(p.kg * 10);
    }
    return { kg: (objetivo - resto) / 10, nombres };
  };

  L.crearDemo = function (s, maquina, sonidos) {
    const $ = id => document.getElementById(id);
    const u = L.util;
    const D = { mensajeRopa: null, mensajeHasta: 0, duracionMs: 1199000, pendienteKg: 0 };
    const textoLleno = () => `El tambor está lleno: no entran más de ${u.kg(s.config.capacidadFisicaKg, 0)} kg.`;

    // ---------------- Ropa ----------------
    const caja = $('prendas');
    L.PRENDAS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prenda';
      b.innerHTML = `<svg viewBox="-30 -24 60 48" aria-hidden="true"></svg><span>${p.nombre}<small>${u.kg(p.kg)} kg</small></span>`;
      b.addEventListener('click', () => agregar([p.nombre]));
      caja.appendChild(b);
      // ícono: la misma silueta que se ve en el tambor
      const svgNS = 'http://www.w3.org/2000/svg';
      const tmp = document.createElementNS(svgNS, 'svg');
      tmp.innerHTML = `<path d="${formaIcono(p.tipo)}" fill="${p.color}" stroke="#2a2a2a" stroke-width="1.6" stroke-linejoin="round"/>`;
      b.querySelector('svg').append(...tmp.childNodes);
    });
    function formaIcono(tipo) { return L.FORMAS_PRENDA[tipo] || L.FORMAS_PRENDA.remera; }

    function avisoRopa(texto, ms = 3500) { D.mensajeRopa = texto; D.mensajeHasta = performance.now() + ms; }

    function puedeTocarRopa() {
      if (!s.hw.tapaAbierta || maquina.tapaCerrando()) {
        avisoRopa('Primero abre la tapa.');
        const b = $('btn-tapa');
        b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 380, iterations: 2 });
        return false;
      }
      if (Math.abs(s.hw.rpm) > 30) { avisoRopa('Espera a que el tambor se detenga.'); return false; }
      return true;
    }

    // Las prendas caen de a una; pendienteKg es lo que todavía está "en el aire".
    function agregar(nombres, cadaMs = 140) {
      if (!puedeTocarRopa()) return false;
      nombres.forEach((n, i) => {
        const def = L.PRENDAS.find(p => p.nombre === n);
        D.pendienteKg += def.kg;
        setTimeout(() => {
          D.pendienteKg = Math.max(0, Math.round((D.pendienteKg - def.kg) * 100) / 100);
          if (s.hw.tapaAbierta && !s.hw.agregarPrenda(def)) avisoRopa(textoLleno());
        }, i * cadaMs);
      });
      return true;
    }

    document.querySelectorAll('[data-carga]').forEach(b => {
      b.addEventListener('click', () => agregar(CARGAS[b.dataset.carga]));
    });
    $('btn-azar').addEventListener('click', () => {
      if (!puedeTocarRopa()) return;
      const espacio = s.hw.espacioLibreKg() - D.pendienteKg;
      const carga = L.cargaAleatoria(espacio, Math.random, s.config.cargaAleatoriaMinKg);
      if (!carga) { avisoRopa(textoLleno()); return; }
      agregar(carga.nombres, 100);
      const n = carga.nombres.length;
      const pasa = carga.kg > s.config.capacidadMaxKg
        ? ` Es más de lo que admite el lavarropas (${u.kg(s.config.capacidadMaxKg, 0)} kg).` : '';
      avisoRopa(`Al azar: ${u.kg(carga.kg)} kg en ${n} prenda${n === 1 ? '' : 's'}.${pasa}`, 6000);
    });
    $('btn-sacar').addEventListener('click', () => {
      if (!puedeTocarRopa()) return;
      if (!s.hw.quitarPrenda()) avisoRopa('El tambor ya está vacío.');
    });
    $('btn-vaciar').addEventListener('click', () => {
      if (!puedeTocarRopa()) return;
      if (!s.hw.vaciarTambor()) avisoRopa('El tambor ya está vacío.');
    });

    // ---------------- Tapa ----------------
    $('btn-tapa').addEventListener('click', () => { sonidos.desbloquear(); maquina.alternarTapa(); });

    // ---------------- Corte de luz ----------------
    const chips = document.querySelectorAll('#duraciones button');
    chips.forEach(b => b.addEventListener('click', () => {
      D.duracionMs = Number(b.dataset.ms);
      chips.forEach(c => c.setAttribute('aria-pressed', String(c === b)));
      $('btn-cortar').textContent = `Cortar la luz ${u.mmss(D.duracionMs)}`;
    }));
    $('btn-cortar').addEventListener('click', () => { sonidos.desbloquear(); s.energia.cortar(D.duracionMs); });
    $('btn-volver-luz').addEventListener('click', () => s.energia.restaurarYa());

    // ---------------- Fallas ----------------
    const chkCaliente = $('chk-caliente'), chkCanilla = $('chk-canilla'), chkDesagote = $('chk-desagote');
    chkCaliente.addEventListener('change', () => { s.hw.aguaCalienteConectada = chkCaliente.checked; });
    chkCanilla.addEventListener('change', () => { s.hw.canillaAbierta = !chkCanilla.checked; });
    chkDesagote.addEventListener('change', () => { s.hw.desagoteTapado = chkDesagote.checked; });
    $('btn-desbalance-si').addEventListener('click', () => { s.hw.provocarDesbalance(true); avisoRopa('La ropa quedó amontonada de un lado. Se va a notar al centrifugar.'); });
    $('btn-desbalance-no').addEventListener('click', () => { s.hw.provocarDesbalance(false); avisoRopa('La ropa quedó amontonada y trabada: no se va a poder equilibrar.'); });
    s.kernel.on('ciclo:fin', () => s.hw.quitarDesbalance());

    // ---------------- Memoria ----------------
    $('btn-30-lavados').addEventListener('click', () => { s.memoria.fijarLavados(s.config.lavadosParaAutolimpieza); });
    $('btn-reiniciar').addEventListener('click', () => {
      if (!globalThis.confirm('Se borran los favoritos, el contador de lavados y el programa en curso. ¿Seguir?')) return;
      L.reiniciando = true;
      s.eeprom.borrarTodo();
      location.reload();
    });

    // ---------------- Estado (4 veces por segundo) ----------------
    D.render = function () {
      const hw = s.hw, ahora = performance.now();
      const kg = hw.ropaKg(), n = hw.prendas.length;
      const base = n ? `En el tambor hay <strong>${u.kg(kg)} kg</strong> en ${n} prenda${n === 1 ? '' : 's'} (dato real del simulador).`
        : 'El tambor está vacío.';
      const extra = D.mensajeRopa && ahora < D.mensajeHasta ? ` <strong>${D.mensajeRopa}</strong>` : (!hw.tapaAbierta ? ' Abre la tapa para cargar o sacar ropa.' : '');
      const html = base + extra;
      if (D.cacheRopa !== html) { D.cacheRopa = html; $('ropa-estado').innerHTML = html; }

      const btnTapa = $('btn-tapa');
      const abierta = hw.tapaAbierta && !maquina.tapaCerrando();
      btnTapa.textContent = maquina.tapaCerrando() ? 'Cerrando…' : abierta ? 'Cerrar la tapa' : 'Abrir la tapa';
      btnTapa.setAttribute('aria-pressed', String(abierta));

      const corte = s.energia.corte;
      let luz;
      if (corte) luz = `<strong>Sin luz.</strong> Vuelve en ${u.mmss(s.energia.restanteMs())} de tiempo simulado.`;
      else if (s.energia.ultimoArranque && s.energia.ultimoArranque.durMs > 0) {
        const a = s.energia.ultimoArranque;
        luz = `Hay luz. Último corte: ${u.mmss(a.durMs)} (${a.origen}); el SO decidió: <strong>${a.decision}</strong>.`;
      } else luz = 'Hay luz.';
      if (D.cacheLuz !== luz) { D.cacheLuz = luz; $('luz-estado').innerHTML = luz; }
      $('btn-cortar').disabled = !!corte;
      $('btn-volver-luz').disabled = !corte;
      $('sin-luz').hidden = !corte;
      if (corte) $('sin-luz-reloj').textContent = u.mmss(s.energia.restanteMs());

      chkCaliente.checked = hw.aguaCalienteConectada;
      chkCanilla.checked = !hw.canillaAbierta;
      chkDesagote.checked = hw.desagoteTapado;

      const lav = s.memoria.lavados();
      const txtLav = `${lav} lavado${lav === 1 ? '' : 's'} desde la última autolimpieza${s.memoria.necesitaAutolimpieza() ? ': ya se recomienda hacerla.' : '.'}`;
      if (D.cacheLav !== txtLav) { D.cacheLav = txtLav; $('lavados-estado').textContent = txtLav; }
    };

    return D;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
