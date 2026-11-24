#!/usr/bin/env node
'use strict';
// Generate an offline page and the shared embedded catalogue using Node.js only.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const spells = JSON.parse(read('data/spell.json'));
const embedded = '/* Embedded offline spell library: generated from data/spell.json. */\n' +
  'window.DEFAULT_SPELL_CATALOG = ' + JSON.stringify(spells).replace(/</g, '\\u003c') + ';\n';
fs.writeFileSync(path.join(root, 'data/spell-data.js'), embedded);
let html = read('src/index.html');
let replacements = 0;
html = html.replace(/<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="styles\.css")[^>]*>/g, () => {
  replacements++;
  return `<style>\n${read('src/styles.css').replace(/<\/style/gi, '<\\/style')}\n</style>`;
});
if (replacements !== 1) throw new Error(`Expected one stylesheet link; found ${replacements}`);
for (const [url, file] of [
  ['generated/spell-calculation.browser.js', 'src/generated/spell-calculation.browser.js'],
  ['generated/spell-drawing.browser.js', 'src/generated/spell-drawing.browser.js'],
  ['generated/spell-catalog.browser.js', 'src/generated/spell-catalog.browser.js'],
  ['../data/spell-data.js', 'data/spell-data.js'],
  ['generated/spell-card.browser.js', 'src/generated/spell-card.browser.js'],
  ['generated/constants.browser.js', 'src/generated/constants.browser.js'],
  ['generated/download.browser.js', 'src/generated/download.browser.js'],
  ['generated/app.browser.js', 'src/generated/app.browser.js'],
]) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<script\\b(?=[^>]*\\bsrc="' + escaped + '")[^>]*><\\/script>', 'g');
  let count = 0;
  html = html.replace(re, () => {
    count++;
    return `<script>\n${read(file).replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });
  if (count !== 1) throw new Error(`Expected one script include for ${url}; found ${count}`);
}
fs.writeFileSync(path.join(root, 'standalone.html'), html);
console.log(`Generated standalone.html with ${spells.length} spell entries`);
