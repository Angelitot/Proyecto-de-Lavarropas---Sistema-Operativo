/*
 * Corre las pruebas sin navegador:   node tests/correr-en-node.js
 * (Es opcional: pruebas.html hace lo mismo en el navegador.)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ARCHIVOS = [
  'js/config.js', 'js/util.js',
  'js/nucleo/eeprom.js', 'js/nucleo/kernel.js', 'js/nucleo/programas.js',
  'js/hardware/planta.js', 'js/sensores/sensores.js',
  'js/seguridad/alarmas.js', 'js/seguridad/tapa.js', 'js/seguridad/energia.js',
  'js/panel/memoria.js', 'js/panel/diferido.js', 'js/panel/control.js',
  'js/nucleo/ciclo.js', 'js/nucleo/sistema.js',
  'js/animacion/demo.js',
  'tests/mini-test.js', 'tests/pruebas.js'
];

for (const a of ARCHIVOS) vm.runInThisContext(fs.readFileSync(path.join(raiz, a), 'utf8'), { filename: a });

let grupoAnterior = '';
const resultados = globalThis.LAVACRAN.pruebas.correr(r => {
  if (r.grupo !== grupoAnterior) { console.log('\n' + r.grupo); grupoAnterior = r.grupo; }
  console.log(`  ${r.ok ? '✔' : '✘'} ${r.nombre} (${r.ms} ms)${r.ok ? '' : '\n      → ' + r.error}`);
});
const fallas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallas} de ${resultados.length} pruebas pasaron.`);
process.exit(fallas ? 1 : 0);
