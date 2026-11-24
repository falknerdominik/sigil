#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/explanation.html');

fs.rmSync(output, {force:true});
const result = spawnSync('quarto', [
  'render', 'docs/explanation.qmd',
  '--embed-resources',
  '--fail-if-warnings',
  '--metadata', 'self-contained-math:true',
  '--mathjax=https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg-full.js',
], {cwd:root, stdio:'inherit'});
if (result.error) {
  throw new Error('Cannot render Explanation. Install Quarto using .devcontainer/install-quarto.sh or rebuild the devcontainer, and ensure quarto is on PATH.', {cause:result.error});
}
if (result.status !== 0)
  throw new Error(`Quarto failed to render Explanation (exit ${result.status}, signal ${result.signal}).`);
if (!fs.existsSync(output) || !fs.statSync(output).isFile() || !fs.statSync(output).size)
  throw new Error('Quarto did not produce docs/explanation.html; refusing to bundle missing documentation.');
