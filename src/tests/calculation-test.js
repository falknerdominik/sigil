'use strict';

const assert = require('node:assert/strict');
const { SpellCalculation } = require('../generated/spell-calculation.cjs');

const option = value => ({value, label:value});
const primary = ['rank', 'tradition', 'range', 'duration', 'effectTrait']
  .map(id => ({id, options:[option('one'), option('two')]}));
const secondary = ['damage', 'area', 'castActions', 'castTraits']
  .map(id => ({id, options:[option('one'), option('two')]}));
const calculation = new SpellCalculation(primary, secondary);
const spell = Object.fromEntries([...primary, ...secondary].map(attribute => [attribute.id, 'one']));
spell.rank = 'one';
spell.variant = 'demo-1';

const notation = calculation.encode(spell);
assert.deepEqual(Object.keys(notation).sort(),
  ['vertexCount','edgeGroups','orbits','identityBits'].sort());
const representation = calculation.represent(spell, false);
assert.deepEqual(representation.complete, notation);
assert.equal(representation.visible.revealCount, representation.visible.totalRevealable);
assert.equal(notation.vertexCount, 11);
assert.equal(notation.edgeGroups.reduce((sum, group) => sum + group.edges.length, 0), 20);
assert.deepEqual(Object.keys(notation.edgeGroups[0]).sort(), ['id','label','color','k','edges'].sort());
assert.equal(notation.orbits.length, 4);
assert(notation.orbits.every(orbit => orbit.units === 15 && orbit.sweep === 2 * Math.PI));
for (const count of [1, 2, 4, 8]) {
  const attributes = Array.from({length:count}, (_, index) => ({
    sectionUnits:2 ** index, vertices:[0]
  }));
  const [orbit] = SpellCalculation.combineOrbits(1, attributes);
  assert.equal(orbit.units, 2 ** count - 1);
  assert(Math.abs(orbit.sweep - 2 * Math.PI) < 1e-12,
    'All attributes at a vertex must always complete a circle');
}
const orbitDetail = SpellCalculation.detailDrawOrder(notation).find(item => item.kind === 'orbit');
assert.deepEqual(Object.keys(orbitDetail).sort(), ['kind', 'orbit']);
assert(notation.orbits.includes(orbitDetail.orbit));
assert.equal(notation.identityBits.length, 184);
assert.deepEqual(SpellCalculation.decodeIdentity(notation.identityBits), {variant:'demo-1'});

const original = structuredClone(notation);
const visible = SpellCalculation.applyRankComplexity(notation, {rank:'cantrip'}, true);
assert.deepEqual(notation, original, 'Filtering must not modify complete notation');
assert.equal(visible.revealCount, 8);
assert.equal(visible.totalRevealable, 24);
assert.deepEqual(Object.keys(visible).sort(),
  ['edgeGroups','orbits','revealFraction','optionalVisible','optionalTotal','revealCount','totalRevealable'].sort());
assert.deepEqual(visible.edgeGroups[0].edges, notation.edgeGroups[0].edges);
assert.equal(SpellCalculation.applyRankComplexity(notation, spell, false).revealCount, 24);

assert.throws(() => calculation.encode({...spell, range:'unknown'}), /Unknown range value/);
assert.throws(() => calculation.encode({...spell, damage:'unknown'}), /Unknown damage value/);
const empty = calculation.represent({variant:'empty'});
assert(empty.complete.edgeGroups.every(group => group.edges.length === 0));
assert.deepEqual(empty.complete.orbits, []);
assert.equal(empty.visible.revealCount, 0);
assert.equal(empty.visible.totalRevealable, 0);
assert.deepEqual(new SpellCalculation(primary).encode(spell).orbits, []);
assert.throws(() => SpellCalculation.decodeIdentity(notation.identityBits + '0'), /Invalid identity length/);
const unicode = SpellCalculation.encodeIdentity({variant:'book-ñ-§'});
assert.deepEqual(SpellCalculation.decodeIdentity(unicode), {variant:'book-ñ-§'});
assert.throws(() => SpellCalculation.encodeIdentity({variant:'x'.repeat(200)}), /too long/);

const sixth = {id:'extra', options:[option('one')]};
calculation.setEdgeAttributes([...primary, sixth]);
const updated = calculation.encode({...spell, extra:'one'});
assert.equal(updated.vertexCount, 13);
assert(calculation.orbitAttributes.every(attribute => attribute.lookup.get('one').length === 13),
  'Changing the vertex count must rebuild secondary dictionaries');
assert(updated.orbits.some(orbit => orbit.vertex >= 11),
  'Rebuilt orbit dictionaries must reach the new vertices');
console.log('PASS - independent calculation, rank filtering, errors and identity round trips.');
