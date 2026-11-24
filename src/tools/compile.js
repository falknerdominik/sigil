'use strict';

const esbuild = require('esbuild');

for (const [file, globalName] of [
  ['spell-calculation', 'SigilCalculation'],
  ['spell-drawing', 'SigilDrawing'],
  ['spell-catalog', 'SigilCatalog'],
  ['spell-card', 'SpellCard']
]) {
  const entryPoints = [`src/${file}.ts`];
  esbuild.buildSync({
    entryPoints,
    bundle:true,
    format:'iife',
    globalName,
    outfile:`src/generated/${file}.browser.js`
  });
  esbuild.buildSync({
    entryPoints,
    bundle:true,
    format:'cjs',
    platform:'node',
    outfile:`src/generated/${file}.cjs`
  });
}

for (const [file, globalName] of [
  ['constants', 'SigilConstants'],
  ['download', 'SigilDownload']
]) {
  esbuild.buildSync({
    entryPoints:[`src/${file}.ts`],
    format:'iife',
    globalName,
    outfile:`src/generated/${file}.browser.js`
  });
}

esbuild.buildSync({
  entryPoints:['src/app.ts'],
  bundle:true,
  format:'esm',
  outfile:'src/generated/app.browser.js'
});
