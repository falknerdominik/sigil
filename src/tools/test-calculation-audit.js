'use strict';
/** Independent cross-checks for the calculation reference and its example. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  SpellCalculation,
  SpellEncoding,
} = require('../generated/spell-calculation.cjs');
const { SpellDrawing } = require('../generated/spell-drawing.cjs');
const root = path.resolve(__dirname, '..', '..');
const calculation = fs.readFileSync(
  path.join(root, 'docs', 'explanation.qmd'),
  'utf8',
);
assert.match(calculation, /^[\x00-\x7F]*$/, 'The guide source must be ASCII');
const exampleInput = calculation.match(
  /<!-- worked-example-input -->\r?\n([\s\S]*?)\r?\n<!-- \/worked-example-input -->/,
);
assert(
  exampleInput,
  'The guide must contain its machine-readable worked example',
);
const exampleResults = calculation.match(
  /<!-- worked-example-results -->\r?\n([\s\S]*?)\r?\n<!-- \/worked-example-results -->/,
);
assert(
  exampleResults,
  'The guide must contain its worked-example results table',
);
const expectedResults = Object.fromEntries(
  exampleResults[1]
    .trim()
    .split(/\r?\n/)
    .slice(2)
    .map((row) => {
      const cells = row.match(/^\| ([^|]+?) \| `([^`]+)` \|$/);
      assert(cells, `Invalid worked-example result row: ${row}`);
      return [cells[1], JSON.parse(cells[2])];
    }),
);
const value = (name) => ({ value: name, label: name });
const p = [
  { id: 'rank', options: ['cantrip', '1', '2', '3'].map(value) },
  { id: 'tradition', options: ['none', 'Arcane', 'Primal'].map(value) },
  { id: 'range', options: ['none', 'Touch', '30 feet'].map(value) },
  { id: 'duration', options: ['none', 'Instant', '1 minute'].map(value) },
  { id: 'effectTrait', options: ['none', 'Fire', 'Healing'].map(value) },
];
const s = [
  { id: 'damage', options: ['none', 'Fire'].map(value) },
  { id: 'area', options: ['none', 'Burst'].map(value) },
  { id: 'castActions', options: ['none', '2 actions'].map(value) },
  { id: 'castTraits', options: ['none', 'Both'].map(value) },
];
const renderer = new SpellCalculation(p, s);
const drawing = new SpellDrawing();
drawing.drawingVertexCount = renderer.vertexCount;
assert.equal(renderer.vertexCount, 11);
assert.equal(renderer.edgeAttributes.length, 5);
assert.deepEqual(
  renderer.edgeAttributes.map((a) => a.k),
  [1, 2, 3, 4, 5],
);
assert.equal(renderer.orbitAttributes.length, 4);
assert.deepEqual(
  renderer.orbitAttributes.map((a) => a.sectionUnits),
  [1, 2, 4, 8],
);
const necklaces = SpellEncoding.uniqueNecklaces(11);
assert.equal(necklaces.length, (2 ** 11 - 2) / 11);
for (const word of necklaces)
  assert.equal(SpellEncoding.canonicalRotation(word), word);
const dictionary = SpellEncoding.preferredDictionary(11);
assert.equal(dictionary.length, 186);
const weight = (b) => [...b].filter((bit) => bit === '1').length;
for (let i = 1; i < dictionary.length; i++) {
  const a = dictionary[i - 1],
    b = dictionary[i];
  assert(Math.abs(weight(a) - 4) <= Math.abs(weight(b) - 4));
  if (Math.abs(weight(a) - 4) === Math.abs(weight(b) - 4)) assert(a < b);
}
for (const attribute of [
  ...renderer.edgeAttributes,
  ...renderer.orbitAttributes,
]) {
  const options = attribute.options.filter((opt) => opt.value !== 'none');
  options.forEach((option, q) => {
    // The attribute-offset term in the renderer is 11*(attribute index)
    // and cancels mod 11. Check the simplified formula independently.
    assert.equal(
      attribute.lookup.get(option.value),
      SpellEncoding.rotate(dictionary[q], (7 * q + 3) % 11),
    );
  });
  if (attribute.options.some((opt) => opt.value === 'none')) {
    assert.equal(attribute.lookup.get('none'), '0'.repeat(11));
  }
}
// Every undirected connection belongs to exactly one of the five families.
const edges = new Set();
for (let k = 1; k <= 5; k++)
  for (let i = 0; i < 11; i++) {
    const a = Math.min(i, (i + k) % 11),
      b = Math.max(i, (i + k) % 11);
    const key = `${a}/${b}`;
    assert(!edges.has(key), `duplicate edge ${key}`);
    edges.add(key);
  }
assert.equal(edges.size, 55);
// All 16 combinations of Layer 2 bits are uniquely encoded as one orbit.
for (let mask = 0; mask < 16; mask++) {
  const selected = s.map((a, j) => ({
    id: a.id,
    sectionUnits: 2 ** j,
    vertices: mask & (2 ** j) ? [0] : [],
  }));
  const orbits = SpellCalculation.combineOrbits(1, selected);
  assert.equal(orbits.length, mask === 0 ? 0 : 1);
  if (mask) {
    assert.equal(orbits[0].units, mask);
    assert(Math.abs((orbits[0].sweep * 180) / Math.PI - mask * 24) < 1e-10);
  }
  const decoded = SpellCalculation.decodeOrbitSections(mask, selected);
  assert.deepEqual(
    decoded,
    selected.filter((x) => mask & x.sectionUnits).map((x) => x.id),
  );
}
const spell = {
  name: 'Math test',
  variant: 'book-ñ-§',
  rank: '3',
  tradition: 'Arcane',
  range: 'Touch',
  duration: 'Instant',
  effectTrait: 'Fire',
  damage: 'Fire',
  area: 'Burst',
  castActions: '2 actions',
  castTraits: 'Both',
};
const full = renderer.encode(spell);
const constantsContext = {};
vm.runInNewContext(
  fs.readFileSync(
    path.join(root, 'src/generated/constants.browser.js'),
    'utf8',
  ),
  constantsContext,
);
const { SPELL_ATTRIBUTES, EDGE_ATTRIBUTE_IDS, ORBIT_ATTRIBUTE_IDS } =
  JSON.parse(JSON.stringify(constantsContext.SigilConstants));
const guideCalculation = new SpellCalculation(
  EDGE_ATTRIBUTE_IDS.map((id) =>
    SPELL_ATTRIBUTES.find((attribute) => attribute.id === id),
  ),
  ORBIT_ATTRIBUTE_IDS.map((id) =>
    SPELL_ATTRIBUTES.find((attribute) => attribute.id === id),
  ),
);
const guideAttributes = [
  ...guideCalculation.edgeAttributes,
  ...guideCalculation.orbitAttributes,
];
const exampleFields = new Map(
  guideAttributes.map((attribute) => [attribute.label, attribute.id]),
);
exampleFields.set('Source / variant ID', 'variant');
const guideSpell = {};
for (const row of exampleInput[1].trim().split(/\r?\n/).slice(2)) {
  const cells = row.match(/^\| ([^|]+?) \| ([^|]+?) \|$/);
  assert(cells, `Invalid worked-example input row: ${row}`);
  const id = exampleFields.get(cells[1]);
  assert(id, `Unknown worked-example field: ${cells[1]}`);
  assert(
    !Object.hasOwn(guideSpell, id),
    `Duplicate worked-example field: ${id}`,
  );
  guideSpell[id] = cells[2];
}
const guideNotation = guideCalculation.encode(guideSpell);
assert.deepEqual(
  Object.keys(guideSpell).sort(),
  [...guideAttributes.map((attribute) => attribute.id), 'variant'].sort(),
);
for (const attribute of guideAttributes) {
  const selected = guideSpell[attribute.id];
  const bits = attribute.lookup.get(selected);
  assert.equal(
    bits,
    expectedResults[selected === 'none' ? 'None bits' : 'Non-none bits'],
  );
  if (selected === 'none')
    assert.equal(bits, '0'.repeat(guideNotation.vertexCount));
}
const guideVisible = SpellCalculation.applyRankComplexity(
  guideNotation,
  guideSpell,
);
const guideRank = guideNotation.edgeGroups.find((group) => group.id === 'rank');
const guidePayloadBytes = new TextEncoder().encode(
  JSON.stringify(['spell-id', guideSpell.variant]),
).length;
const guideDamage = guideCalculation.orbitAttributes.find(
  (attribute) => attribute.id === 'damage',
);
const guideOptionIndex = guideDamage.options
  .filter((option) => option.value !== 'none')
  .findIndex((option) => option.value === guideSpell.damage);
const guideDictionaryEntry = SpellEncoding.preferredDictionary(
  guideNotation.vertexCount,
)[guideOptionIndex];
const guideRotation = (7 * guideOptionIndex + 3) % guideNotation.vertexCount;
assert.equal(
  SpellEncoding.rotate(guideDictionaryEntry, guideRotation),
  guideDamage.lookup.get(guideSpell.damage),
);
const actualResults = {
  'Option index (Acid)': guideOptionIndex,
  'Dictionary entry': guideDictionaryEntry,
  'Left rotation': guideRotation,
  'Non-none bits': guideCalculation.edgeAttributes[0].lookup.get(
    guideSpell.rank,
  ),
  'None bits': guideCalculation.orbitAttributes
    .find((attribute) => guideSpell[attribute.id] === 'none')
    .lookup.get('none'),
  'Active vertices': guideNotation.orbits.map((orbit) => orbit.vertex),
  'Rank edges': guideRank.edges.length,
  'Other edges': guideNotation.edgeGroups
    .filter((group) => group.id !== 'rank')
    .reduce((sum, group) => sum + group.edges.length, 0),
  Orbits: guideNotation.orbits.length,
  'Orbit units': guideNotation.orbits.map((orbit) => orbit.units),
  'Orbit sweeps (degrees)': guideNotation.orbits.map(
    (orbit) => (orbit.sweep * 180) / Math.PI,
  ),
  'Fingerprint payload bytes': guidePayloadBytes,
  'Fingerprint bits': guideNotation.identityBits.length,
  'Optional elements': guideVisible.optionalTotal,
  'Optional elements shown': guideVisible.optionalVisible,
  'Visible mechanical elements': guideVisible.revealCount,
  'Total mechanical elements': guideVisible.totalRevealable,
};
assert.deepEqual(
  Object.keys(actualResults).sort(),
  Object.keys(expectedResults).sort(),
);
for (const [property, actual] of Object.entries(actualResults)) {
  if (property === 'Orbit sweeps (degrees)') {
    assert.equal(actual.length, expectedResults[property].length);
    actual.forEach((sweep, index) =>
      assert(Math.abs(sweep - expectedResults[property][index]) < 1e-10),
    );
  } else {
    assert.deepEqual(
      actual,
      expectedResults[property],
      `Documented example: ${property}`,
    );
  }
}
assert.deepEqual(
  guideRank.edges,
  expectedResults['Active vertices'].map((vertex) => [
    vertex,
    (vertex + guideRank.k) % guideNotation.vertexCount,
  ]),
);
assert.equal(guideNotation.identityBits.length, 16 + 8 * guidePayloadBytes);
assert.equal(
  SpellCalculation.decodeIdentity(guideNotation.identityBits).variant,
  guideSpell.variant,
);
const exampleFingerprint = calculation.match(
  /```\{\.text #worked-example-fingerprint\}\r?\n([\s\S]*?)\r?\n```/,
);
assert(
  exampleFingerprint,
  'The guide must show its worked-example fingerprint bits',
);
assert.match(exampleFingerprint[1], /^[01\s]+$/);
assert.equal(
  exampleFingerprint[1].replace(/\s/g, ''),
  guideNotation.identityBits,
  'Documented fingerprint bits must match the encoded example',
);
const identityBits = full.identityBits;
const byteLength = new TextEncoder().encode(
  JSON.stringify(['spell-id', spell.variant]),
).length;
assert.equal(identityBits.length, 16 + 8 * byteLength);
assert.equal(
  SpellCalculation.decodeIdentity(identityBits).variant,
  spell.variant,
);
const geometry = drawing.getGeometry(800, 600, identityBits, full.edgeGroups);
const expectedSlots = Math.max(
  48,
  Math.floor((2 * Math.PI * (0.39 * 600) * 1.21) / 7),
);
assert.equal(geometry.identityLayout.slotsPerRing, expectedSlots);
assert.equal(
  geometry.identityLayout.ringCount,
  Math.ceil(identityBits.length / expectedSlots),
);
for (const [rank, f] of [
  ['cantrip', 0.2],
  ['1', 0.4],
  ['3', 0.4],
  ['4', 0.6],
  ['6', 0.6],
  ['7', 0.8],
  ['8', 0.8],
  ['9', 1],
  ['10', 1],
]) {
  assert.equal(SpellCalculation.rankRevealFraction(rank), f);
  const ranked = SpellCalculation.applyRankComplexity(
    full,
    { ...spell, rank },
    true,
  );
  assert.equal(ranked.optionalVisible, Math.ceil(ranked.optionalTotal * f));
  assert.deepEqual(ranked.edgeGroups[0].edges, full.edgeGroups[0].edges);
  assert.equal(
    ranked.revealCount,
    full.edgeGroups[0].edges.length + ranked.optionalVisible,
  );
  assert.deepEqual(renderer.encode(spell), full);
}
drawing.settings.style = 'curved';
drawing.settings.curvature = 0.22;
const arcs = [];
drawing.traceConnection(
  {
    arc(...args) {
      arcs.push(args);
    },
    moveTo() {},
    lineTo() {},
  },
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 5 },
);
const [cx, cy, r] = arcs[0];
const d = 10,
  sagitta = 0.22 * d;
assert(Math.abs(r - ((d * d) / (8 * sagitta) + sagitta / 2)) < 1e-10);
assert(Math.abs(Math.hypot(cx, cy) - r) < 1e-10);
assert(Math.abs(Math.hypot(10 - cx, -cy) - r) < 1e-10);
for (const pressure of [0, 0.35, 1, 2.5])
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const eased = 3 * t * t - 2 * t * t * t;
    const expected = Math.max(
      0.15,
      (1 - eased) * 4 * (1 + 1.45 * pressure) +
        eased * 4 * (1 - 0.7 * Math.min(pressure, 1)),
    );
    assert(
      Math.abs(SpellDrawing.inkNibWidth(t, 4, pressure) - expected) < 1e-10,
    );
  }
// Check the calculation reference and README illustration.
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert.match(readme, /!\[[^\]]+\]\(docs\/fireball-sigil\.png\)/);
const image = fs.readFileSync(path.join(root, 'docs', 'fireball-sigil.png'));
assert.equal(
  image.toString('hex', 0, 8),
  '89504e470d0a1a0a',
  'README illustration must be a real PNG',
);
assert(
  readme.indexOf('## Licensing and credits') >
    readme.indexOf('## Development and verification'),
);
if (process.argv.includes('--render-example')) {
  require('./render-calculation-example')({
    complete: guideNotation,
    visible: SpellCalculation.applyRankComplexity(
      guideNotation,
      guideSpell,
      false,
    ),
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  assert.match(calculation, /!\[[^\]]+\]\(calculation-example\.png\)/);
  const exampleImage = fs.readFileSync(
    path.join(root, 'docs', 'calculation-example.png'),
  );
  assert.equal(exampleImage.toString('hex', 0, 8), '89504e470d0a1a0a');
}
console.log(
  'PASS - 11 vertices; 55 edges; 186 necklaces; option rotations; all 16 orbit masks; ID UTF-8; paths; rank tiers; nib profile; worked-example trace; guide and README images.',
);
