/*
 * LAVACRÁN — Dibujo y animación del lavarropas (SVG)
 *
 * Todo lo que se mueve sale del estado del hardware simulado (s.hw):
 * nivel y temperatura del agua, velocidad del motor, válvulas, bomba,
 * resistencia, vapor, vibración y la ropa que hay en el tambor.
 * La animación usa tiempo real (no el simulado) para que se vea fluida
 * aunque la simulación vaya a x60.
 *
 * "Ver por dentro" vuelve transparente el gabinete y muestra tina, motor,
 * bomba, resistencia y sensores con sus lecturas.
 *
 * Responsable: Pareja 5 (animación y sonido).
 */
(function (L) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const CX = 300, BOCA_Y = 316, PISO_Y = 606, RX = 150, RY = 59;
  const ALTO_TAMBOR = PISO_Y - BOCA_Y;           // 290 px
  const PX_POR_LITRO = 230 / 70;
  const TAPA_ABIERTA = 66;                        // grados

  // Siluetas de prendas (centradas en 0,0; ~40 px de ancho)
  const FORMAS = {
    remera: 'M-18,-13 L-8,-18 Q0,-12 8,-18 L18,-13 L23,-3 L14,0 L14,17 L-14,17 L-14,0 L-23,-3 Z',
    camisa: 'M-17,-14 L-7,-18 L0,-10 L7,-18 L17,-14 L22,-2 L14,1 L14,18 L-14,18 L-14,1 L-22,-2 Z',
    jean: 'M-12,-18 L12,-18 L15,18 L4,18 L0,-1 L-4,18 L-15,18 Z',
    buzo: 'M-16,-14 L-7,-18 Q0,-13 7,-18 L16,-14 L26,10 L19,13 L13,-1 L13,18 L-13,18 L-13,-1 L-19,13 L-26,10 Z',
    toalla: 'M-20,-12 Q0,-16 20,-12 L20,13 Q0,9 -20,13 Z',
    sabana: 'M-24,-12 Q-12,-17 0,-12 T24,-12 L24,12 Q12,17 0,12 T-24,12 Z',
    campera: 'M-17,-15 L-6,-19 L0,-13 L6,-19 L17,-15 L26,12 L18,14 L13,0 L13,19 L-13,19 L-13,0 L-18,14 L-26,12 Z',
    acolchado: 'M-26,-15 Q0,-20 26,-15 Q30,0 26,15 Q0,20 -26,15 Q-30,0 -26,-15 Z',
    media: 'M-5,-16 L5,-16 L5,6 Q5,14 -4,15 L-12,15 Q-15,10 -10,7 L-5,5 Z'
  };
  L.FORMAS_PRENDA = FORMAS;
  const DETALLES = {
    camisa: 'M0,-10 L0,16',
    jean: 'M-12,-12 L12,-12',
    toalla: 'M-20,7 Q0,3 20,7 M-20,9 Q0,5 20,9',
    campera: 'M0,-13 L0,19',
    acolchado: 'M-18,-8 Q0,-11 18,-8 M-18,0 L18,0 M-18,8 Q0,11 18,8',
    sabana: 'M-16,-4 Q0,-8 16,-4'
  };

  function el(tag, attrs, padre) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(e);
    return e;
  }
  const mezclar = (a, b, t) => a + (b - a) * t;
  function colorMezcla(c1, c2, t) {
    const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const [a, b] = [h(c1), h(c2)];
    return '#' + a.map((v, i) => Math.round(mezclar(v, b[i], t)).toString(16).padStart(2, '0')).join('');
  }
  function oscurecer(hex, f) {
    const v = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f));
    return '#' + v.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
  }

  // ------------------------------------------------------------------
  // SVG estático
  // ------------------------------------------------------------------
  const PLANTILLA = `
  <defs>
    <linearGradient id="g-esmalte" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E9EDEF"/><stop offset=".18" stop-color="#FFFFFF"/><stop offset=".82" stop-color="#FAFBFB"/><stop offset="1" stop-color="#DCE2E5"/>
    </linearGradient>
    <linearGradient id="g-cubierta" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E6EBED"/><stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
    <linearGradient id="g-respaldo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4E9EB"/>
    </linearGradient>
    <linearGradient id="g-acero" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9AA6AC"/><stop offset=".25" stop-color="#E3E8EA"/><stop offset=".5" stop-color="#B9C3C8"/><stop offset=".75" stop-color="#E9EDEF"/><stop offset="1" stop-color="#97A3A9"/>
    </linearGradient>
    <linearGradient id="g-aro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C9D1D5"/><stop offset=".5" stop-color="#F1F4F5"/><stop offset="1" stop-color="#D5DCDF"/>
    </linearGradient>
    <linearGradient id="g-agua" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5AA9EA" stop-opacity=".62"/><stop offset="1" stop-color="#2367B5" stop-opacity=".78"/>
    </linearGradient>
    <linearGradient id="g-brillo-vidrio" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".5" stop-color="#fff" stop-opacity=".38"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".7" stop-color="#fff" stop-opacity=".18"/><stop offset=".76" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <pattern id="p-perforado" width="14" height="12" patternUnits="userSpaceOnUse">
      <rect width="14" height="12" fill="#CDD5D9"/>
      <circle cx="3.5" cy="3" r="1.4" fill="#8E9AA0"/><circle cx="10.5" cy="9" r="1.4" fill="#8E9AA0"/>
    </pattern>
    <radialGradient id="g-interior" cx=".5" cy=".35" r=".75">
      <stop offset="0" stop-color="#E6EBEE"/><stop offset="1" stop-color="#8F9BA1"/>
    </radialGradient>
    <filter id="f-brillo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="f-vapor" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="c-tambor"><path d="M150,316 L150,606 A150,59 0 0,0 450,606 L450,316 A150,59 0 0,0 150,316 Z"/></clipPath>
  </defs>

  <ellipse cx="300" cy="764" rx="262" ry="13" fill="#000" opacity=".13"/>

  <!-- canillas, mangueras y desagüe (fijos, no vibran) -->
  <g id="instalacion">
    <rect x="536" y="92" width="64" height="44" rx="6" fill="#DDE3E6" stroke="#B9C3C8"/>
    <path id="manguera-fria" d="M494,246 C540,246 556,200 556,136" fill="none" stroke="#3E79B8" stroke-width="7" stroke-linecap="round"/>
    <path id="flujo-fria" d="M494,246 C540,246 556,200 556,136" fill="none" stroke="#A8D8FF" stroke-width="3" stroke-dasharray="6 9" stroke-linecap="round" opacity="0"/>
    <path id="manguera-caliente" d="M498,238 C556,238 584,196 584,136" fill="none" stroke="#C4473F" stroke-width="7" stroke-linecap="round"/>
    <path id="flujo-caliente" d="M498,238 C556,238 584,196 584,136" fill="none" stroke="#FFC2B3" stroke-width="3" stroke-dasharray="6 9" stroke-linecap="round" opacity="0"/>
    <g id="canilla-fria" transform="translate(556,122)">
      <circle r="9" fill="#9AA6AC"/><rect id="manija-fria" x="-10" y="-17" width="20" height="6" rx="3" fill="#2F6FB5"/>
    </g>
    <g id="canilla-caliente" transform="translate(584,122)">
      <circle r="9" fill="#9AA6AC"/><rect id="manija-caliente" x="-10" y="-17" width="20" height="6" rx="3" fill="#C23B33"/>
    </g>
    <g id="aviso-canilla" opacity="0"><circle cx="570" cy="80" r="10" fill="#B81C0E"/><path d="M565,75 L575,85 M575,75 L565,85" stroke="#fff" stroke-width="2.5"/></g>
    <path d="M470,708 C530,708 548,712 560,728 S580,752 578,770" fill="none" stroke="#56636A" stroke-width="10" stroke-linecap="round"/>
    <path id="flujo-desagote" d="M470,708 C530,708 548,712 560,728 S580,752 578,770" fill="none" stroke="#7FC1FF" stroke-width="4" stroke-dasharray="7 9" stroke-linecap="round" opacity="0"/>
    <rect x="562" y="768" width="32" height="7" rx="2" fill="#7D888E"/>
    <g id="aviso-desagote" opacity="0"><rect x="570" y="756" width="16" height="12" rx="3" fill="#222"/><circle cx="592" cy="748" r="9" fill="#B81C0E"/><path d="M588,744 L596,752 M596,744 L588,752" stroke="#fff" stroke-width="2.4"/></g>
  </g>

  <g id="cuerpo">
    <!-- respaldo con mini panel (refleja el panel de control) -->
    <path d="M110,138 L490,138 L502,150 L98,150 Z" fill="#F3F5F6" stroke="#C9D0D4"/>
    <path d="M98,150 L502,150 L502,232 L98,232 Z" fill="url(#g-respaldo)" stroke="#C9D0D4"/>
    <g id="mini-panel">
      <circle cx="172" cy="191" r="27" fill="#E3E8EA" stroke="#C3CBD0"/>
      <g id="mini-perilla" transform="rotate(0 172 191)"><circle cx="172" cy="191" r="19" fill="#F7F9FA" stroke="#B8C1C6"/><rect x="170" y="174" width="4" height="12" rx="2" fill="#B81C0E"/></g>
      <rect x="244" y="166" width="132" height="50" rx="7" fill="#0A191E" stroke="#2D3438" stroke-width="2"/>
      <text id="mini-tiempo" x="310" y="200" text-anchor="middle" font-family="Share Tech Mono, monospace" font-size="26" fill="#8BF0FF">1:09</text>
      <circle id="mini-led-marcha" cx="388" cy="176" r="3.5" fill="#B9C3C8"/>
      <circle id="mini-led-alarma" cx="388" cy="188" r="3.5" fill="#B9C3C8"/>
      <g fill="#E9EDEF" stroke="#BCC5CA"><rect x="400" y="170" width="22" height="12" rx="3"/><rect x="426" y="170" width="22" height="12" rx="3"/><rect x="452" y="170" width="22" height="12" rx="3"/><rect x="400" y="188" width="22" height="12" rx="3"/><rect x="426" y="188" width="22" height="12" rx="3"/><rect x="452" y="188" width="22" height="12" rx="3"/></g>
      <rect x="402" y="206" width="72" height="14" rx="7" fill="#B81C0E"/>
    </g>

    <!-- interior: se ve por la boca del tambor o por el gabinete en modo "por dentro" -->
    <g id="interior">
      <g class="solo-rayos">
        <path d="M132,316 L132,626 A168,66 0 0,0 468,626 L468,316" fill="#A9B6BD" fill-opacity=".18" stroke="#8C99A0" stroke-width="2"/>
        <line x1="112" y1="412" x2="146" y2="612" stroke="#7D888E" stroke-width="3"/>
        <line x1="488" y1="412" x2="454" y2="612" stroke="#7D888E" stroke-width="3"/>
        <rect x="100" y="404" width="24" height="14" rx="3" fill="#E8B34A" stroke="#9A7426"/>
        <rect x="476" y="404" width="24" height="14" rx="3" fill="#E8B34A" stroke="#9A7426"/>
        <rect x="104" y="548" width="26" height="20" rx="4" fill="#5E6E78"/>
        <path d="M130,558 C150,560 148,640 172,648" fill="none" stroke="#5E6E78" stroke-width="2.5"/>
        <rect x="118" y="420" width="38" height="26" rx="5" fill="#8C99A0" stroke="#5E6E78"/>
        <path d="M156,433 C190,433 200,262 236,262" fill="none" stroke="#9AA6AC" stroke-width="3"/>
        <rect x="462" y="466" width="16" height="16" rx="3" fill="#2F3D46" stroke="#19232A"/>
        <rect x="426" y="236" width="44" height="14" rx="4" fill="#7D888E"/>
        <path d="M424,672 C430,690 440,696 452,700" fill="none" stroke="#6C7980" stroke-width="5"/>
      </g>
      <path d="M150,316 L150,606 A150,59 0 0,0 450,606 L450,316 A150,59 0 0,0 150,316 Z" fill="url(#p-perforado)"/>
      <path d="M150,316 L150,606 A150,59 0 0,0 450,606 L450,316 A150,59 0 0,0 150,316 Z" fill="url(#g-interior)" opacity=".55"/>
      <ellipse cx="300" cy="606" rx="150" ry="59" fill="#AEB8BE"/>
      <g id="impulsor">
        <ellipse cx="300" cy="600" rx="114" ry="44" fill="#D9DFE2" stroke="#9AA6AC"/>
        <g id="aletas" stroke="#8E9AA0" stroke-width="5" stroke-linecap="round"></g>
        <ellipse cx="300" cy="600" rx="24" ry="9.5" fill="#B9C3C8" stroke="#8E9AA0"/>
      </g>
      <g clip-path="url(#c-tambor)">
        <g id="ropa-bajo"></g>
        <path id="agua" d="" fill="url(#g-agua)"/>
        <ellipse id="agua-superficie" cx="300" cy="500" rx="148" ry="57" fill="#9CD2FA" fill-opacity=".55" stroke="#E6F5FF" stroke-opacity=".7" stroke-width="1.5"/>
        <path id="ondas" d="" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.6"/>
        <g id="burbujas"></g>
        <g id="ropa-sobre"></g>
        <g id="vapor" filter="url(#f-vapor)"></g>
        <path id="chorro" d="" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="10 7" opacity="0"/>
      </g>
      <g class="solo-rayos">
        <path d="M150,316 L150,606 A150,59 0 0,0 450,606 L450,316" fill="none" stroke="#93A0A7" stroke-width="2"/>
        <path id="resistencia" d="" fill="none" stroke="#9AA3A8" stroke-width="4" stroke-linecap="round"/>
        <path id="resistencia-brillo" d="" fill="none" stroke="#FF6A2B" stroke-width="9" stroke-linecap="round" filter="url(#f-brillo)" opacity="0"/>
        <line x1="300" y1="664" x2="300" y2="690" stroke="#6C7980" stroke-width="6"/>
        <rect x="262" y="686" width="76" height="30" rx="7" fill="#46535B"/>
        <g id="polea" transform="rotate(0 300 701)"><circle cx="300" cy="701" r="11" fill="#9AA6AC"/><path d="M300,691 L300,711 M290,701 L310,701" stroke="#46535B" stroke-width="3"/></g>
        <g id="bomba" transform="rotate(0 456 704)"><circle cx="456" cy="704" r="13" fill="#5E6E78"/><path d="M456,693 L456,715 M445,704 L467,704" stroke="#C6CDD1" stroke-width="2.5"/></g>
        <circle id="ntc" cx="420" cy="646" r="5" fill="#E8B34A" stroke="#9A7426"/>
      </g>
    </g>

    <!-- gabinete -->
    <g id="gabinete">
      <path id="frente" d="M70,400 L530,400 L530,732 Q530,748 514,748 L86,748 Q70,748 70,732 Z" fill="url(#g-esmalte)" stroke="#BAC3C8" stroke-width="1.5"/>
      <g id="frente-detalles">
        <text x="300" y="462" text-anchor="middle" font-family="Zilla Slab, Rockwell, Georgia, serif" font-weight="700" font-size="38" fill="#B81C0E" letter-spacing="1">LAVACRÁN</text>
        <text x="300" y="484" text-anchor="middle" font-family="Zilla Slab, Rockwell, Georgia, serif" font-weight="600" font-size="12.5" fill="#141410" letter-spacing="4">ALACRÁN GROUP</text>
        <rect x="236" y="500" width="128" height="24" rx="12" fill="none" stroke="#141410" stroke-width="1.4"/>
        <text x="300" y="516" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="600" font-size="12" fill="#141410">10 kg · vapor</text>
        <rect x="82" y="710" width="436" height="30" rx="7" fill="#DDE3E6"/>
        <g stroke="#B9C3C8" stroke-width="2" stroke-linecap="round"><line x1="150" y1="719" x2="450" y2="719"/><line x1="150" y1="726" x2="450" y2="726"/><line x1="150" y1="733" x2="450" y2="733"/></g>
      </g>
      <rect x="92" y="746" width="36" height="13" rx="3" fill="#56636A"/>
      <rect x="472" y="746" width="36" height="13" rx="3" fill="#56636A"/>
      <path d="M98,232 L502,232 L530,400 L70,400 Z M128,316 a172,69 0 1,0 344,0 a172,69 0 1,0 -344,0 Z" fill="url(#g-cubierta)" fill-rule="evenodd" stroke="#C3CBD0" stroke-width="1.5"/>
      <path d="M128,316 a172,69 0 1,0 344,0 a172,69 0 1,0 -344,0 Z M150,316 a150,59 0 1,0 300,0 a150,59 0 1,0 -300,0 Z" fill="url(#g-aro)" fill-rule="evenodd" stroke="#AEB8BD"/>
      <rect x="66" y="396" width="468" height="10" rx="5" fill="#F6F8F9" stroke="#C3CBD0"/>
      <rect x="318" y="250" width="40" height="8" rx="4" fill="#C3CBD0"/>
    </g>

    <!-- lecturas de sensores (solo por dentro) -->
    <g id="etiquetas" class="solo-rayos" font-family="Archivo, sans-serif" font-size="11.5" font-weight="600" fill="#1D2327" stroke="#FBFBF9" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">
      <text x="130" y="417" text-anchor="start" id="et-peso">Celdas de carga</text>
      <text x="96" y="584" id="et-nivel">Presostato</text>
      <text x="96" y="464" id="et-vapor">Generador de vapor</text>
      <text x="486" y="462" text-anchor="end" id="et-vib">Acelerómetro</text>
      <text x="432" y="640" id="et-ntc" text-anchor="start">NTC</text>
      <text x="300" y="736" text-anchor="middle" id="et-motor">Motor</text>
      <text x="478" y="728" id="et-bomba" text-anchor="start">Bomba</text>
      <text x="300" y="648" text-anchor="middle" id="et-resistencia">Resistencia</text>
      <text x="597" y="272" text-anchor="end" id="et-valvulas">Válvulas</text>
    </g>

    <!-- tapa de vidrio con cierre suave -->
    <g id="tapa" class="clic" role="button" aria-label="Abrir o cerrar la tapa">
      <polygon id="tapa-marco" points="" fill="rgba(42,66,78,.30)" stroke="#EEF2F3" stroke-width="12" stroke-linejoin="round"/>
      <polygon id="tapa-borde" points="" fill="none" stroke="#A6B1B7" stroke-width="1.5" stroke-linejoin="round"/>
      <polygon id="tapa-brillo" points="" fill="url(#g-brillo-vidrio)"/>
      <rect id="tapa-manija" x="270" y="388" width="60" height="9" rx="4.5" fill="#56636A"/>
    </g>

    <!-- ropa que entra o sale por arriba (delante de la tapa abierta) -->
    <g id="caida"></g>
  </g>`;

  L.crearLavarropas = function (s, svg) {
    svg.innerHTML = PLANTILLA;
    const $ = id => svg.getElementById ? svg.getElementById(id) : svg.querySelector('#' + id);
    const q = {
      cuerpo: $('cuerpo'), frente: $('frente'), frenteDetalles: $('frente-detalles'),
      agua: $('agua'), superficie: $('agua-superficie'), ondas: $('ondas'), burbujas: $('burbujas'),
      ropaBajo: $('ropa-bajo'), ropaSobre: $('ropa-sobre'), caida: $('caida'), vapor: $('vapor'), chorro: $('chorro'),
      aletas: $('aletas'), resistencia: $('resistencia'), resistenciaBrillo: $('resistencia-brillo'),
      polea: $('polea'), bomba: $('bomba'),
      flujoFria: $('flujo-fria'), flujoCaliente: $('flujo-caliente'), flujoDesagote: $('flujo-desagote'),
      mangueraCaliente: $('manguera-caliente'), manijaFria: $('manija-fria'), manijaCaliente: $('manija-caliente'),
      canillaCaliente: $('canilla-caliente'), avisoCanilla: $('aviso-canilla'), avisoDesagote: $('aviso-desagote'),
      tapa: $('tapa'), tapaMarco: $('tapa-marco'), tapaBorde: $('tapa-borde'), tapaBrillo: $('tapa-brillo'), tapaManija: $('tapa-manija'),
      miniPerilla: $('mini-perilla'), miniTiempo: $('mini-tiempo'), miniLedMarcha: $('mini-led-marcha'), miniLedAlarma: $('mini-led-alarma'),
      et: {
        peso: $('et-peso'), nivel: $('et-nivel'), vapor: $('et-vapor'), vib: $('et-vib'), ntc: $('et-ntc'),
        motor: $('et-motor'), bomba: $('et-bomba'), resistencia: $('et-resistencia'), valvulas: $('et-valvulas')
      }
    };
    const soloRayos = Array.from(svg.querySelectorAll('.solo-rayos'));
    const reducirMovimiento = globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Resistencia en zigzag
    let dRes = 'M222,664';
    for (let i = 0; i < 8; i++) dRes += ` q10,${i % 2 ? 10 : -10} 20,0`;
    q.resistencia.setAttribute('d', dRes);
    q.resistenciaBrillo.setAttribute('d', dRes);

    // Aletas del impulsor
    const aletas = [];
    for (let i = 0; i < 6; i++) aletas.push(el('line', {}, q.aletas));

    // Burbujas y vapor
    const burbujas = [];
    for (let i = 0; i < 18; i++) {
      burbujas.push({ e: el('circle', { r: 2, fill: '#FFFFFF', 'fill-opacity': '.85', stroke: '#CFEAFF', 'stroke-width': '.8' }, q.burbujas), a: Math.random() * Math.PI * 2, u: Math.random(), f: 0.6 + Math.random() * 1.2, r: 1.5 + Math.random() * 3.2 });
    }
    const vapores = [];
    for (let i = 0; i < 12; i++) vapores.push({ e: el('circle', { r: 10, fill: '#FFFFFF', opacity: 0 }, q.vapor), o: i / 12, dx: (Math.random() - 0.5) * 160 });

    const V = {
      rayos: true,
      tapa: { ang: 0, desde: 0, hasta: 0, t: 0, dur: 0, tipo: null, cerrarAlFinal: false },
      prendas: new Map(),
      tiempo: 0,
      angImpulsor: 0, angPolea: 0, angBomba: 0, angGrupo: 0,
      flujoOffset: 0,
      ordenAnterior: ''
    };

    // ------------------------------------------------------------------
    // Tapa
    // ------------------------------------------------------------------
    function dibujarTapa(angGrados) {
      const f = angGrados * Math.PI / 180;
      const y = 244 + 148 * Math.cos(f) - 276 * Math.sin(f);
      const xl = 126 - 22 * Math.cos(f), xr = 474 + 22 * Math.cos(f);
      const pts = `126,244 474,244 ${xr.toFixed(1)},${y.toFixed(1)} ${xl.toFixed(1)},${y.toFixed(1)}`;
      q.tapaMarco.setAttribute('points', pts);
      q.tapaBorde.setAttribute('points', pts);
      const k = 0.1;
      const bp = `${mezclar(126, xl, k) + 12},${mezclar(244, y, k)} ${mezclar(474, xr, k) - 12},${mezclar(244, y, k)} ${mezclar(474, xr, 0.92) - 12},${mezclar(244, y, 0.92)} ${mezclar(126, xl, 0.92) + 12},${mezclar(244, y, 0.92)}`;
      q.tapaBrillo.setAttribute('points', bp);
      q.tapaManija.setAttribute('y', (y - 4.5).toFixed(1));
      q.tapaManija.setAttribute('height', Math.max(3, 9 * Math.cos(f) + 3).toFixed(1));
      // abierta: el vidrio se ve más claro (lo vemos de canto)
      q.tapaMarco.setAttribute('fill', `rgba(42,66,78,${(0.30 - 0.12 * Math.sin(f)).toFixed(3)})`);
    }

    function animarTapa(hasta, dur, tipo, cerrarAlFinal) {
      const t = V.tapa;
      t.desde = t.ang; t.hasta = hasta; t.t = 0; t.dur = dur; t.tipo = tipo; t.cerrarAlFinal = !!cerrarAlFinal;
    }

    /** Pide abrir o cerrar la tapa (como si el usuario la moviera). */
    V.alternarTapa = function () {
      if (s.hw.tapaAbierta && V.tapa.hasta !== 0) V.cerrarTapa();
      else V.abrirTapa();
    };
    V.abrirTapa = function () {
      if (!s.hw.tapaAbierta) s.hw.abrirTapa();            // el interruptor detecta apenas se levanta
      animarTapa(TAPA_ABIERTA, 0.45, 'abrir');
    };
    V.cerrarTapa = function () {
      if (!s.hw.tapaAbierta) return;
      animarTapa(0, 1.7, 'cierre-suave', true);              // el interruptor recién avisa al tocar el marco
    };
    V.tapaCerrando = () => V.tapa.tipo === 'cierre-suave';

    function avanzarTapa(dt) {
      const t = V.tapa;
      if (!t.tipo) {
        // sincroniza si el estado cambió por fuera (pruebas, recuperación)
        if (s.hw.tapaAbierta && t.ang === 0) animarTapa(TAPA_ABIERTA, 0.45, 'abrir');
        else if (!s.hw.tapaAbierta && t.ang > 0) animarTapa(0, 0.9, 'cerrar');
        else return;
      }
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      let e;
      if (t.tipo === 'cierre-suave') {
        // cae rápido hasta ~25° y el amortiguador la frena hasta cerrar despacio
        e = p < 0.35 ? 0.66 * Math.pow(p / 0.35, 2) : 0.66 + 0.34 * (1 - Math.pow(1 - (p - 0.35) / 0.65, 3));
      } else {
        e = 1 - Math.pow(1 - p, 3);
      }
      t.ang = mezclar(t.desde, t.hasta, e);
      if (p >= 1) {
        t.ang = t.hasta;
        const cerrar = t.cerrarAlFinal;
        t.tipo = null; t.cerrarAlFinal = false;
        if (cerrar) s.hw.cerrarTapa();
      }
    }

    // ------------------------------------------------------------------
    // Ropa
    // ------------------------------------------------------------------
    function crearPrendaVisual(p, i) {
      const g = el('g', { class: 'prenda-svg' });
      const forma = FORMAS[p.tipo] || FORMAS.remera;
      el('path', { d: forma, fill: p.color, stroke: oscurecer(p.color, 0.62), 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g);
      if (DETALLES[p.tipo]) el('path', { d: DETALLES[p.tipo], fill: 'none', stroke: oscurecer(p.color, 0.55), 'stroke-width': 1.3, opacity: 0.8 }, g);
      const semilla = (p.id * 0.618034) % 1;
      return {
        g, id: p.id, semilla, i,
        th: semilla * Math.PI * 2, r: 0.25 + 0.5 * ((p.id * 0.3819) % 1), z: 1.7,
        rot: semilla * 360, escala: 0.85 + 0.5 * Math.sqrt(p.kg), saliendo: false, capa: null
      };
    }

    function sincronizarPrendas() {
      const vivas = new Set();
      s.hw.prendas.forEach((p, i) => {
        vivas.add(p.id);
        if (!V.prendas.has(p.id)) V.prendas.set(p.id, crearPrendaVisual(p, i));
        else V.prendas.get(p.id).i = i;
      });
      V.prendas.forEach(v => { if (!vivas.has(v.id) && !v.saliendo) v.saliendo = true; });
    }

    function proyectar(th, r, z) {
      return { x: CX + r * 138 * Math.cos(th), y: PISO_Y - z * ALTO_TAMBOR + r * 52 * Math.sin(th) };
    }

    function moverCapa(v, capa) {
      if (v.capa !== capa) { capa.appendChild(v.g); v.capa = capa; }
    }

    function animarRopa(dt, t, est) {
      const hw = s.hw;
      const fraccionAgua = hw.aguaLibreL / 70;
      const nivelZ = hw.aguaLibreL * PX_POR_LITRO / ALTO_TAMBOR;
      const rpm = hw.rpm, absr = Math.abs(rpm);
      const modo = hw.motor.modo;
      const centrifuga = absr > 120 && modo !== 'agitar' && modo !== 'volteo';
      const agita = modo === 'agitar';
      const volteo = modo === 'volteo';
      const amontonada = hw.desbalance.severidad > 0.15;
      const intensidad = { suave: 0.55, normal: 0.85, fuerte: 1.15 }[hw.motor.intensidad] || 0.85;
      const kSuave = 1 - Math.exp(-dt * 3.2);
      const sentido = Math.sin(t * 2 * Math.PI / 2.4);
      const mov = reducirMovimiento ? 0.35 : 1;
      V.angGrupo += (centrifuga ? Math.sign(rpm) * Math.min(absr, 800) / 800 * Math.PI * 2 * 1.3 : 0) * dt * mov;

      const lista = Array.from(V.prendas.values());
      lista.forEach(v => {
        let rT = v.r, zT = v.z;
        if (v.saliendo) {
          zT = 1.9;
          v.z += (zT - v.z) * (1 - Math.exp(-dt * 2.6));
          if (v.z > 1.75) { v.g.remove(); V.prendas.delete(v.id); return; }
        } else if (centrifuga) {
          rT = 0.93;
          zT = 0.12 + 0.72 * ((v.semilla * 7.31) % 1);
          if (amontonada) v.th = V.angGrupo + (v.semilla - 0.5) * 0.7;
          else v.th += Math.sign(rpm) * Math.min(absr, 800) / 800 * Math.PI * 2 * 1.3 * dt * mov;
          v.rot += Math.sign(rpm) * 120 * dt * mov;
        } else if (agita) {
          const fuerza = (fraccionAgua > 0.05 ? 1 : 0.35) * intensidad;
          v.th += sentido * fuerza * 1.1 * dt * mov;
          rT = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.9 + v.semilla * 6.2));
          zT = fraccionAgua > 0.05
            ? Math.max(0.08, nivelZ * (0.6 + 0.42 * (0.5 + 0.5 * Math.sin(t * 1.5 + v.semilla * 9))))
            : 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.2 + v.semilla * 5));
          v.rot += sentido * 40 * fuerza * dt * mov;
        } else if (volteo) {
          v.th += 0.7 * Math.sign(Math.sin(t * 2 * Math.PI / 5)) * dt * mov;
          rT = 0.6;
          zT = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.1 + v.semilla * 4));
          v.rot += 15 * dt * mov;
        } else if (fraccionAgua > 0.08) {
          v.th += 0.05 * dt;
          zT = Math.max(0.06, nivelZ * (0.7 + 0.3 * v.semilla));
        } else {
          zT = 0.035 + (v.i % 5) * 0.05;
          rT = 0.2 + 0.6 * ((v.id * 0.3819) % 1);
        }
        if (!v.saliendo) {
          v.r += (rT - v.r) * kSuave;
          const kz = v.z > 1.02 ? 1 - Math.exp(-dt * 4.5) : kSuave;      // caída al cargar
          v.z += (zT - v.z) * kz;
        }
        const p = proyectar(v.th, v.r, v.z);
        const persp = 1 + 0.08 * Math.sin(v.th);
        v.g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${(v.rot % 360).toFixed(1)}) scale(${(v.escala * persp).toFixed(3)})`);
        v.prof = Math.sin(v.th);
        v.sobreAgua = v.z > nivelZ - 0.02;
        if (v.z > 1.02 || v.saliendo) moverCapa(v, q.caida);
        else moverCapa(v, v.sobreAgua ? q.ropaSobre : q.ropaBajo);
      });

      // orden de dibujo: atrás primero
      const orden = Array.from(V.prendas.values()).filter(v => v.capa !== q.caida).sort((a, b) => a.prof - b.prof);
      const firma = orden.map(v => v.id + (v.sobreAgua ? 's' : 'b')).join(',');
      if (firma !== V.ordenAnterior) {
        orden.forEach(v => v.capa.appendChild(v.g));
        V.ordenAnterior = firma;
      }
      return est;
    }

    // ------------------------------------------------------------------
    // Cuadro a cuadro
    // ------------------------------------------------------------------
    V.render = function (dt, t, pantalla) {
      V.tiempo = t;
      const hw = s.hw, ciclo = s.ciclo;
      const mov = reducirMovimiento ? 0.35 : 1;
      avanzarTapa(dt);
      dibujarTapa(V.tapa.ang);
      sincronizarPrendas();

      // Agua
      const litros = hw.aguaLibreL;
      const ys = PISO_Y - litros * PX_POR_LITRO;
      const hayAgua = litros > 0.3;
      const agitando = hw.motor.modo === 'agitar' && Math.abs(hw.rpm) > 3;
      const ola = agitando ? 5 * Math.sin(t * 2 * Math.PI / 1.2) * mov : 0;
      q.agua.setAttribute('d', hayAgua
        ? `M152,${ys.toFixed(1)} L152,606 A148,57 0 0,0 448,606 L448,${ys.toFixed(1)} A148,57 0 0,1 152,${ys.toFixed(1)} Z` : '');
      q.superficie.setAttribute('cy', (ys + ola * 0.3).toFixed(1));
      q.superficie.setAttribute('ry', (57 + ola).toFixed(1));
      q.superficie.style.display = hayAgua ? '' : 'none';
      const calor = Math.max(0, Math.min(1, (hw.tempC - 26) / 40));
      q.superficie.setAttribute('fill', colorMezcla('#9CD2FA', '#C9E3F2', calor));
      if (agitando && hayAgua) {
        const a = 7 * mov;
        let d = '';
        for (let k = -1; k <= 1; k += 2) {
          const yo = ys + k * 14;
          d += `M${CX - 110},${yo.toFixed(1)} `;
          for (let x = -110; x <= 110; x += 22) d += `L${(CX + x).toFixed(1)},${(yo + a * Math.sin(x / 22 + t * 6 * k)).toFixed(1)} `;
        }
        q.ondas.setAttribute('d', d);
      } else q.ondas.setAttribute('d', '');

      // Burbujas (lavado con jabón)
      const paso = ciclo.paso;
      const conEspuma = hayAgua && litros > 8 && paso && (paso.tipo === 'LAVADO' || paso.tipo === 'CALENTAMIENTO' || (paso.tipo === 'ENJUAGUE' && !paso.balanceo));
      const cuantas = !conEspuma ? 0 : paso.tipo === 'ENJUAGUE' ? 5 : 18;
      burbujas.forEach((b, i) => {
        if (i >= cuantas) { b.e.setAttribute('r', 0); return; }
        const sube = ((t * b.f + b.u) % 1);
        const x = CX + Math.cos(b.a + t * 0.2) * 132 * Math.sqrt(b.u);
        const y = ys + Math.sin(b.a + t * 0.2) * 50 * Math.sqrt(b.u) - sube * 10;
        b.e.setAttribute('cx', x.toFixed(1)); b.e.setAttribute('cy', y.toFixed(1));
        b.e.setAttribute('r', (b.r * (1 - sube * 0.4)).toFixed(2));
        b.e.setAttribute('fill-opacity', (0.9 - sube * 0.6).toFixed(2));
      });

      // Vapor
      const vaporFuerte = hw.vapor;
      const vaporSuave = !vaporFuerte && hw.tempC > 52 && (hayAgua || hw.aguaAbsorbidaL() > 1);
      vapores.forEach((v, i) => {
        if (!vaporFuerte && !(vaporSuave && i < 4)) { v.e.setAttribute('opacity', 0); return; }
        const p = ((t / (vaporFuerte ? 2.6 : 4) + v.o) % 1);
        const x = CX + v.dx * p * 0.6 + Math.sin(t + i) * 10;
        const y = (vaporFuerte ? 590 : ys) - p * (vaporFuerte ? 300 : 120);
        v.e.setAttribute('cx', x.toFixed(1)); v.e.setAttribute('cy', y.toFixed(1));
        v.e.setAttribute('r', (10 + p * 26).toFixed(1));
        const op = Math.sin(p * Math.PI) * (vaporFuerte ? 0.7 : 0.28);
        v.e.setAttribute('opacity', op.toFixed(2));
      });

      // Chorro de entrada
      const entra = hw.flujoEntradaLmin > 0.5;
      if (entra) {
        const mezcla = hw.valvulaCaliente / Math.max(0.001, hw.valvulaFria + hw.valvulaCaliente);
        q.chorro.setAttribute('stroke', colorMezcla('#8CCBFF', '#FFA07F', hw.aguaCalienteConectada ? mezcla : 0));
        const fin = hayAgua ? ys : PISO_Y - 10;
        q.chorro.setAttribute('d', `M338,262 C344,${(262 + fin) / 2} 332,${fin - 20} 336,${fin}`);
        q.chorro.setAttribute('opacity', 0.9);
      } else q.chorro.setAttribute('opacity', 0);

      // Impulsor, motor y bomba
      const rpmVisual = Math.sign(hw.rpm) * Math.min(Math.abs(hw.rpm), 800) / 800 * 360 * 1.3;
      V.angImpulsor += (hw.motor.modo === 'agitar' ? hw.rpm / 130 * 140 : rpmVisual) * dt * mov;
      for (let i = 0; i < 6; i++) {
        const a = (V.angImpulsor + i * 60) * Math.PI / 180;
        aletas[i].setAttribute('x1', (CX + 26 * Math.cos(a)).toFixed(1));
        aletas[i].setAttribute('y1', (600 + 10 * Math.sin(a)).toFixed(1));
        aletas[i].setAttribute('x2', (CX + 104 * Math.cos(a)).toFixed(1));
        aletas[i].setAttribute('y2', (600 + 40 * Math.sin(a)).toFixed(1));
      }
      V.angPolea += hw.rpm * 2.2 * dt * mov;
      q.polea.setAttribute('transform', `rotate(${(V.angPolea % 360).toFixed(1)} 300 701)`);
      if (hw.bomba) V.angBomba += 900 * dt * mov;
      q.bomba.setAttribute('transform', `rotate(${(V.angBomba % 360).toFixed(1)} 456 704)`);

      // Resistencia
      q.resistencia.setAttribute('stroke', hw.resistencia ? '#FF6A2B' : '#9AA3A8');
      q.resistenciaBrillo.setAttribute('opacity', hw.resistencia ? (0.55 + 0.25 * Math.sin(t * 5)).toFixed(2) : 0);

      // Mangueras y canillas
      V.flujoOffset -= 60 * dt;
      const fria = hw.valvulaFria > 0 && hw.canillaAbierta && hw.energia;
      const caliente = hw.valvulaCaliente > 0 && hw.canillaAbierta && hw.aguaCalienteConectada && hw.energia;
      q.flujoFria.setAttribute('opacity', fria ? 1 : 0);
      q.flujoCaliente.setAttribute('opacity', caliente ? 1 : 0);
      q.flujoFria.setAttribute('stroke-dashoffset', V.flujoOffset.toFixed(1));
      q.flujoCaliente.setAttribute('stroke-dashoffset', V.flujoOffset.toFixed(1));
      const sale = hw.flujoSalidaLmin > 0.5;
      q.flujoDesagote.setAttribute('opacity', sale ? 1 : 0);
      q.flujoDesagote.setAttribute('stroke-dashoffset', V.flujoOffset.toFixed(1));
      q.manijaFria.setAttribute('transform', hw.canillaAbierta ? '' : 'rotate(90 0 -14)');
      q.manijaCaliente.setAttribute('transform', hw.canillaAbierta ? '' : 'rotate(90 0 -14)');
      q.avisoCanilla.setAttribute('opacity', hw.canillaAbierta ? 0 : 1);
      q.mangueraCaliente.setAttribute('stroke-dasharray', hw.aguaCalienteConectada ? '' : '4 6');
      q.mangueraCaliente.setAttribute('opacity', hw.aguaCalienteConectada ? 1 : 0.45);
      q.canillaCaliente.setAttribute('opacity', hw.aguaCalienteConectada ? 1 : 0.4);
      q.avisoDesagote.setAttribute('opacity', hw.desagoteTapado ? 1 : 0);

      // Ropa
      animarRopa(dt, t);

      // Vibración: todo el lavarropas tiembla
      let temblor = 0;
      if (!reducirMovimiento) {
        if (Math.abs(hw.rpm) > 100 && hw.motor.modo !== 'agitar') temblor = hw.vibracion / 100 * 4.5;
        else if (agitando) temblor = 0.35;
      }
      q.cuerpo.setAttribute('transform', temblor
        ? `translate(${((Math.random() - 0.5) * temblor).toFixed(2)},${((Math.random() - 0.5) * temblor * 0.6).toFixed(2)})` : '');

      // Mini panel del respaldo (espejo del panel de control)
      if (pantalla) {
        const idx = L.programas.findIndex(p => p.id === pantalla.programaId);
        q.miniPerilla.setAttribute('transform', `rotate(${(-135 + idx * 33.75).toFixed(1)} 172 191)`);
        q.miniTiempo.textContent = pantalla.apagada ? '' : pantalla.tiempo;
        q.miniLedMarcha.setAttribute('fill', ciclo.estadoVisible() === 'EN_MARCHA' ? '#1AA35A' : '#B9C3C8');
        q.miniLedAlarma.setAttribute('fill', s.alarmas.sonando() && Math.sin(t * 8) > 0 ? '#E0301E' : '#B9C3C8');
      }

      // Etiquetas de sensores
      if (V.rayos) {
        const u = L.util;
        q.et.peso.textContent = `Celdas de carga: ${u.kg(s.sensores.pesoKg)} kg`;
        q.et.nivel.textContent = `Presostato: ${u.kg(s.sensores.nivelL)} L`;
        q.et.vapor.textContent = hw.vapor ? 'Generador de vapor: encendido' : 'Generador de vapor';
        q.et.vib.textContent = `Acelerómetro: ${Math.round(s.sensores.vibracion)}`;
        q.et.ntc.textContent = `NTC: ${u.kg(s.sensores.tempC)} °C`;
        q.et.motor.textContent = `Motor: ${Math.round(Math.abs(hw.rpm))} rpm`;
        q.et.bomba.textContent = hw.bomba ? 'Bomba: encendida' : 'Bomba';
        q.et.resistencia.textContent = hw.resistencia ? 'Resistencia: calentando' : 'Resistencia';
        q.et.valvulas.textContent = (hw.valvulaFria + hw.valvulaCaliente) > 0 ? 'Válvulas: abiertas' : 'Válvulas';
      }
    };

    V.setRayos = function (on) {
      V.rayos = !!on;
      q.frente.setAttribute('fill-opacity', on ? 0.16 : 1);
      q.frenteDetalles.setAttribute('opacity', on ? 0.14 : 1);
      soloRayos.forEach(g => { g.style.display = on ? '' : 'none'; });
    };

    // clic sobre la tapa
    q.tapa.addEventListener('click', () => V.alternarTapa());
    V.setRayos(true);
    dibujarTapa(0);
    return V;
  };
})(globalThis.LAVACRAN = globalThis.LAVACRAN || {});
