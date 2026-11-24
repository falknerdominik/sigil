#!/usr/bin/env node
'use strict';
/**
 * Exhaustively search subsets of the original fourteen PF2e categorical fields.
 * Distinctiveness objective: MAXIMIZE the number of spells whose attribute tuple
 * occurs exactly once. Among ties, MINIMIZE the number of colliding pairs.
 *
 * Usage:
 *   npm run compile
 *   node src/tools/optimize-attributes.js [path/to/spell.json]
 *   node src/tools/optimize-attributes.js [path/to/spell.json] --json
 *
 * The identity seal (edition, name, variant) is intentionally excluded.
 */
const fs = require('node:fs');
const path = require('node:path');
const {SpellCatalog} = require('../generated/spell-catalog.cjs');

const ALL=['rank','tradition','damage','area','range','spellType','castActions',
  'defense','duration','targets','rarity','effectTrait','castTraits','heightening'];
const CORE=['rank','tradition','damage','area','range','castActions','duration'];
function* combinations(items, size, start=0, prefix=[]) {
  if (prefix.length===size) { yield prefix; return; }
  for (let i=start;i<=items.length-(size-prefix.length);i++) {
    yield* combinations(items,size,i+1,[...prefix,items[i]]);
  }
}
function measure(entries, fields) {
  const groups=new Map();
  for (const entry of entries) {
    const key=JSON.stringify(fields.map(field=>entry[field]));
    groups.set(key,(groups.get(key)||0)+1);
  }
  let singletons=0,pairs=0,ambiguous=0,collisionGroups=0,maxGroup=0;
  for (const count of groups.values()) {
    if(count===1) singletons++;
    else { ambiguous+=count; collisionGroups++; }
    pairs+=count*(count-1)/2;
    maxGroup=Math.max(maxGroup,count);
  }
  return {fields:[...fields],singletons,profiles:groups.size,ambiguous,pairs,collisionGroups,maxGroup};
}
function score(a,b) {
  return b.singletons-a.singletons || a.pairs-b.pairs ||
    b.profiles-a.profiles || a.fields.join().localeCompare(b.fields.join());
}
function best(entries, size, mandatory=[], count=5) {
  const allowed=ALL.filter(field=>!mandatory.includes(field));
  if(mandatory.length>size || size>ALL.length) throw new RangeError('Invalid subset size');
  const samples=[];
  for (const extra of combinations(allowed,size-mandatory.length)) {
    samples.push(measure(entries,[...mandatory,...extra]));
  }
  samples.sort(score);
  return {searched:samples.length,top:samples.slice(0,count)};
}
function run(file) {
  const parsed=SpellCatalog.parse(JSON.parse(fs.readFileSync(file,'utf8')));
  const entries=parsed.entries;
  return {
    source:path.basename(file),spells:entries.length,skipped:parsed.skipped,
    description:'Maximize singleton spell profiles; break ties by minimizing collisions; names/IDs/edition excluded.',
    core7:measure(entries,CORE),
    core8:best(entries,8,CORE),
    core9:best(entries,9,CORE),
    any9:best(entries,9,[]),
    full14:measure(entries,ALL)
  };
}
if (require.main===module) {
  const args=process.argv.slice(2);
  const file=path.resolve(args.find(arg=>arg!=='--json') || path.join(__dirname,'..','..','data','spell.json'));
  const report=run(file);
  if(args.includes('--json')) console.log(JSON.stringify(report,null,2));
  else {
    console.log(`${report.spells} spells from ${report.source}; ${report.skipped} skipped.`);
    console.log('Objective:',report.description);
    for (const name of ['core7','core8','core9','any9','full14']) {
      const section=report[name];
      console.log(`\n${name}${section.searched ? ` (${section.searched} combinations)` : ''}:`);
      for (const r of section.top || [section]) {
        console.log(`  ${r.singletons}/${report.spells} individually unique; `+
          `${r.profiles} profiles; ${r.ambiguous} ambiguous; ${r.pairs} colliding pairs`);
        console.log(`  ${r.fields.join(', ')}`);
      }
    }
  }
}
module.exports={ALL,CORE,combinations,measure,score,best,run};
