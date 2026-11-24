#!/usr/bin/env node
'use strict';
// Bundle the application, rendered documentation, and shared offline catalogue.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
if (!fs.existsSync(path.join(root, 'docs/explanation.html')))
  throw new Error('Missing docs/explanation.html. Run npm run build to render and bundle Explanation.');
const documentation = read('docs/explanation.html');
if (!documentation.includes('<head>'))
  throw new Error('Invalid docs/explanation.html: expected a complete rendered HTML document.');
// Fragment links in srcdoc otherwise resolve against the parent application.
const embeddedDocumentation = documentation.replace('<head>', '<head><base href="about:srcdoc">')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
const spells = JSON.parse(read('data/spell.json'));
const embedded = '/* Embedded offline spell library: generated from data/spell.json. */\n' +
  'window.DEFAULT_SPELL_CATALOG = ' + JSON.stringify(spells).replace(/</g, '\\u003c') + ';\n';
fs.writeFileSync(path.join(root, 'data/spell-data.js'), embedded);
let html = read('src/index.html');
for (const [file, type] of [
  ['LICENSE', 'text/plain'],
  ['NOTICE.md', 'text/markdown'],
  ['docs/CREDITS.md', 'text/markdown'],
  ['LICENSES/ORC.pdf', 'application/pdf'],
]) {
  const link = `href="../${file}" download`;
  if (html.split(link).length !== 2)
    throw new Error(`Expected one download link for ${file}`);
  const contents = fs.readFileSync(path.join(root, file)).toString('base64');
  html = html.replace(link, `href="data:${type};base64,${contents}" download="${path.basename(file)}"`);
}
let frames = 0;
html = html.replace(/<iframe\b(?=[^>]*\bid="encodingFrame")[^>]*>/g, tag => {
  frames++;
  return tag.replace(/\s+src="[^"]*"/, '').replace(/>$/, () => ` srcdoc="${embeddedDocumentation}">`);
});
if (frames !== 1) throw new Error(`Expected one Explanation iframe; found ${frames}`);
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
