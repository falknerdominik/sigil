#!/usr/bin/env node
'use strict';
// Bundle the application, rendered documentation, and shared offline catalogue.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const args = process.argv.slice(2);
const publicBuild = args.length === 1 && args[0] === '--public';
if (args.length && !publicBuild)
  throw new Error('Usage: node src/tools/build-standalone.js [--public]');
if (!fs.existsSync(path.join(root, 'docs/explanation.html')))
  throw new Error('Missing docs/explanation.html. Run npm run build to render and bundle Explanation.');
const documentation = read('docs/explanation.html');
if (!documentation.includes('<head>'))
  throw new Error('Invalid docs/explanation.html: expected a complete rendered HTML document.');
// Fragment links in srcdoc otherwise resolve against the parent application.
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');
const embeddedDocumentation = escapeHtml(documentation.replace('<head>', '<head><base href="about:srcdoc">'))
  .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
const catalogue = publicBuild ? 'data/sample-spells.json' : 'data/spell.json';
const spells = JSON.parse(read(catalogue));
const embedded = `/* Embedded offline spell library: generated from ${catalogue}. */\n` +
  'window.DEFAULT_SPELL_CATALOG = ' + JSON.stringify(spells).replace(/</g, '\\u003c') + ';\n' +
  (publicBuild ? 'window.PUBLIC_SPELL_BUILD = true;\n' : '');
if (!publicBuild) fs.writeFileSync(path.join(root, 'data/spell-data.js'), embedded);
let html = read('src/index.html');
const noticeSlot = '<div id="creditsNotices"></div>';
if (html.split(noticeSlot).length !== 2)
  throw new Error('Expected one inline licensing notice slot');
const notice = read('licenses/NOTICE.txt').trim().split(/\r?\n\r?\n/);
const [communityDisclaimer] = read('licenses/COMMUNITY-USE.txt').trim().split(/\r?\n\r?\n/);
html = html.replace(noticeSlot, () => '<div id="creditsNotices">' +
  notice.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('') +
  `<p class="credits-policy-notice">${escapeHtml(communityDisclaimer)}</p></div>`);
const legalDocuments = new Map([
  ['LICENSE', 'legal-gpl'],
  ['NOTICE.md', 'legal-distribution'],
  ['docs/CREDITS.md', 'legal-credits'],
  ['licenses/NOTICE.txt', 'legal-copyright'],
  ['licenses/COMMUNITY-USE.txt', 'legal-community'],
  ['licenses/OGL-1.0a.txt', 'legal-ogl'],
  ['licenses/ORC-LICENSE.txt', 'legal-orc'],
  ['licenses/ORC-NOTICE.txt', 'legal-orc-notice'],
  ['licenses/THIRD-PARTY.txt', 'legal-third-party'],
]);
function legalPreview(file) {
  const contents = read(file);
  if (!file.endsWith('.md')) return `<pre>${escapeHtml(contents)}</pre>`;
  const markdown = contents.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (link, label, href) => {
    if (/^https?:\/\//.test(href)) return `[${label} (online)](${href})`;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), href));
    const target = legalDocuments.get(resolved);
    if (target) return `[${label}](#${target})`;
    if (['docs/SPELL-SOURCES.md', 'data/spell.json', 'data/sample-spells.json'].includes(resolved))
      return `${label} (source repository only)`;
    throw new Error(`Unknown legal preview link: ${file} -> ${href}`);
  });
  const result = spawnSync('quarto', ['pandoc', '--from=markdown-smart', '--to=html', '--wrap=none', '--fail-if-warnings'],
    {input:markdown, encoding:'utf8'});
  if (result.error) throw new Error(`Cannot render ${file} with Quarto Pandoc`, {cause:result.error});
  if (result.status !== 0 || !result.stdout.trim())
    throw new Error(`Cannot render ${file} with Quarto Pandoc: ${result.stderr}`);
  return result.stdout;
}
for (const [file, id] of legalDocuments) {
  const slot = `<div id="${id}"></div>`;
  if (html.split(slot).length !== 2) throw new Error(`Expected one legal preview slot for ${file}`);
  html = html.replace(slot, () => `<div id="${id}">${legalPreview(file)}</div>`);
}
for (const [file, type] of [
  ['LICENSE', 'text/plain'],
  ['NOTICE.md', 'text/markdown'],
  ['docs/CREDITS.md', 'text/markdown'],
  ['licenses/NOTICE.txt', 'text/plain'],
  ['licenses/COMMUNITY-USE.txt', 'text/plain'],
  ['licenses/OGL-1.0a.txt', 'text/plain'],
  ['licenses/ORC-LICENSE.txt', 'text/plain'],
  ['licenses/ORC-NOTICE.txt', 'text/plain'],
  ['licenses/THIRD-PARTY.txt', 'text/plain'],
  ['licenses/ORC.pdf', 'application/pdf'],
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
    const script = file === 'data/spell-data.js' ? embedded : read(file);
    return `<script>\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });
  if (count !== 1) throw new Error(`Expected one script include for ${url}; found ${count}`);
}
const output = publicBuild ? '_site/standalone.html' : 'standalone.html';
if (publicBuild) fs.mkdirSync(path.join(root, '_site'), {recursive:true});
fs.writeFileSync(path.join(root, output), html);
console.log(`Generated ${output} with ${spells.length} spell entries from ${catalogue}`);
