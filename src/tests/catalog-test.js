const assert=require('node:assert/strict');
const fs=require('node:fs');
const {SpellCatalog}=require('../generated/spell-catalog.cjs');
const {SpellCalculation}=require('../generated/spell-calculation.cjs');
const spellRows=JSON.parse(fs.readFileSync(__dirname+'/../../data/spell.json','utf-8'));
const demo=SpellCatalog.parse(spellRows);
assert.equal(demo.entries.length,1400,'deduplicated spell list is bundled');
assert.equal(demo.skipped,0);
assert.equal(demo.entries[0].name,'Ancient Dust');
assert.equal(demo.entries[0].rank,'cantrip');
assert.equal(demo.entries[0].area,'Cone');
assert.equal(demo.entries[0].tradition,'Arcane+Divine');
assert.equal(demo.entries.find(e=>e.name==='Caustic Blast').damage,'Acid');
assert.equal(demo.entries.find(e=>e.name==='Fireball').rank,'3');
for (const [name,variant] of [['Light','aon-171'],['Invisibility','aon-164'],['Clairvoyance','aon-40']]) {
  const matches=demo.entries.filter(entry=>entry.name===name);
  assert.equal(matches.length,1,`${name} should appear once`);
  assert.equal(matches[0].variant,variant,`${name} should retain its source ID`);
}
const seals=new Set();
for (const [index,entry] of demo.entries.entries()) {
  const sourceId=new URL(spellRows[index].nethysUrl).searchParams.get('ID');
  assert.equal(entry.variant,`aon-${sourceId}`,'bundled source IDs must remain unchanged');
  const identity=SpellCalculation.encodeIdentity({...entry,edition:entry.edition==='both'?'remaster':entry.edition});
  assert(!seals.has(identity),'every library row has a distinct identity');
  seals.add(identity);
  assert.equal(SpellCalculation.decodeIdentity(identity).variant,entry.variant);
}
const aon=SpellCatalog.parse([
  {nethysUrl:'https://2e.aonprd.com/Spells.aspx?ID=1461',name:'Caustic Blast',type:'Cantrip',level:1,
    traditions:['arcane','primal'],traits:['acid','cantrip'],area:'5-foot burst',range:'30 feet'},
  {nethysUrl:'https://2e.aonprd.com/Spells.aspx?ID=864',name:'Approximate',type:'Cantrip',level:1,
    'legacy content':'  ', traditions:['arcane','primal'], area:'1 cubic foot',range:'10 feet'}
]);
assert.equal(aon.entries[0].rank,'cantrip');
assert.equal(aon.entries[0].variant,'aon-1461');
assert.equal(aon.entries[0].damage,'Acid');
assert.equal(aon.entries[0].tradition,'Arcane+Primal');
assert.equal(aon.entries[1].edition,'legacy');
const foundry=SpellCatalog.parse({items:[
  {_id:'abcdef0123456789',name:'Example Spark',type:'spell',system:{level:{value:2},traits:{value:['fire'],traditions:['arcane','primal']},
    damage:{a:{type:'fire',formula:'2d6'}},range:{value:'40 feet'},area:{type:'cone',value:10}}},
  {name:'Nonspell sword',type:'weapon',system:{price:{value:2}}}
]});
assert.equal(foundry.entries.length,1);
assert.equal(foundry.skipped,1);
assert.equal(foundry.entries[0].rank,'2');
assert.equal(foundry.entries[0].damage,'Fire');
assert.equal(foundry.entries[0].area,'Cone');
assert.equal(foundry.entries[0].range,'40 feet');
assert.equal(foundry.entries[0].tradition,'Arcane+Primal');
const dup=SpellCatalog.parse({spells:[
  {name:'Same',id:'id',rank:2},{name:'Same',id:'id',rank:2},
  {name:'Same',id:'id',rank:2,edition:'legacy'}
]});
assert.equal(new Set(dup.entries.map(e=>e.variant)).size,3);
assert.equal(new Set(dup.entries.map(e=>e.id)).size,3);
assert.equal(new Set(dup.entries.map(e=>SpellCalculation.encodeIdentity(e))).size,3);

const imported=[
  {name:'Alpha',id:'shared',rank:1},
  {name:'Beta',id:'shared',rank:2},
  {name:'Gamma',rank:3},
  {name:'Delta',id:'independent',rank:4}
];
const ids=rows=>Object.fromEntries(SpellCatalog.parse(rows).entries.map(e=>[e.name,[e.id,e.variant]]));
const initial=ids(imported);
assert.deepEqual(ids([...imported].reverse()),initial,'IDs must not depend on row order');
const withUnrelated=ids([...imported,{name:'Other',id:'other',rank:1}]);
for (const name of Object.keys(initial)) assert.deepEqual(withUnrelated[name],initial[name]);
const withoutUnrelated=ids(imported.filter(row=>row.name!=='Delta'));
for (const name of ['Alpha','Beta','Gamma']) assert.deepEqual(withoutUnrelated[name],initial[name]);
assert.equal(initial.Delta[1],'independent','unique supplied IDs should be preserved');
assert(initial.Gamma[1].startsWith('spell-'),'missing IDs should use a content-derived fallback');
assert.equal(SpellCatalog.parse([{name:'Empty variant',variant:'',sourceId:'available',rank:1}])
  .entries[0].variant,'available');

const reserved=initial.Alpha[1];
const withReserved=SpellCatalog.parse([...imported,{name:'Reserved',id:reserved,rank:1}]).entries;
assert.equal(withReserved.find(e=>e.name==='Reserved').variant,reserved);
assert.equal(new Set(withReserved.map(e=>e.variant)).size,withReserved.length);

const longId='\u754c'.repeat(70);
const longIds=SpellCatalog.parse([
  {name:'Long A',id:longId,rank:1},{name:'Long B',id:longId,rank:1}
]).entries;
assert.equal(new Set(longIds.map(e=>e.variant)).size,2);
for (const entry of longIds) {
  assert(entry.variant.length<=70);
  const encoded=SpellCalculation.encodeIdentity(entry);
  assert(encoded.length<=16+8*192);
  assert.equal(SpellCalculation.decodeIdentity(encoded).variant,entry.variant);
}
const prefix='x'.repeat(70);
const truncated=[
  {name:'Same name',id:prefix+'A',rank:1},
  {name:'Same name',id:prefix+'B',rank:1}
];
const forward=SpellCatalog.parse(truncated).entries;
const reversed=SpellCatalog.parse([...truncated].reverse()).entries;
assert.notEqual(forward[0].variant,forward[1].variant);
assert.equal(forward[0].variant,reversed[1].variant);
assert.equal(forward[1].variant,reversed[0].variant);
assert.throws(()=>SpellCatalog.parse({foo:'bar'}),/JSON array/);
assert.throws(()=>SpellCatalog.parse([]),/No valid spells/);
assert.throws(()=>SpellCatalog.parse('{'),SyntaxError);
assert.throws(()=>SpellCatalog.parse([{name:'Malformed',rank:1,damage:[null]}]),/Invalid damage entry/);
console.log(`PASS - ${demo.entries.length} supplied spells, unique IDs, AoN-style schema, Foundry schema, duplicates, validation`);

// New catalogue fields come from the actual supplied PF2e spell metadata.
const fb=demo.entries.find(e=>e.name==='Fireball'&&e.edition==='remaster');
assert.equal(fb.castActions,'2 actions');
assert.equal(fb.defense,'Reflex');
assert.equal(fb.rarity,'Common');
assert.equal(fb.effectTrait,'Fire');
assert.equal(fb.castTraits,'Both');
assert.equal(fb.heightening,'+1');
assert.equal(fb.spellType,'Spell');
const counts=new Map();
for(const e of demo.entries) for(const key of ['spellType','castActions','defense',
  'duration','targets','rarity','effectTrait','castTraits','heightening']){
  assert(typeof e[key]==='string',key+' is missing for '+e.name);
  counts.set(key,(counts.get(key)||0)+1);
}
assert.equal(counts.get('rarity'),demo.entries.length);
console.log('PASS - Nine added PF2e metadata categories populated for all catalogue entries.');

// Multi-tradition combinations stay distinct but occupy just ONE encoded layer.
const combinations=SpellCatalog.parse([
  {name:'Tradition A',rank:2,traditions:['primal','arcane']},
  {name:'Tradition B',rank:2,traditions:['divine','arcane']},
  {name:'Tradition C',rank:2,traditions:['arcane','primal','arcane']},
  {name:'Tradition D',rank:2,tradition:'multiple'}
]).entries;
assert.equal(combinations[0].tradition,'Arcane+Primal');
assert.equal(combinations[1].tradition,'Arcane+Divine');
assert.equal(combinations[2].tradition,'Arcane+Primal');
assert.equal(combinations[3].tradition,'multiple');
console.log('PASS - Exact tradition subsets preserve distinctions without adding a glyph attribute.');

// The editor's own nine-field JSON must survive import without losing any
// already-normalized values (particularly time, damage and trait selections).
const compact=SpellCatalog.parse([{
  name:'Nine field example',edition:'remaster',sourceId:'compact-17',type:'spell',
  rank:'4',tradition:'Arcane+Primal',damage:'multiple',area:'Burst',
  range:'90 feet',castActions:'3 actions',duration:'Sustained',
  effectTrait:'Fire',castTraits:'Both'
}]).entries[0];
for(const [id,expected] of Object.entries({
  rank:'4',tradition:'Arcane+Primal',damage:'multiple',area:'Burst',range:'90 feet',
  castActions:'3 actions',duration:'Sustained',effectTrait:'Fire',castTraits:'Both'
})) assert.equal(compact[id],expected,`compact JSON must preserve ${id}`);
assert.equal(compact.variant,'compact-17');
assert.deepEqual(SpellCalculation.decodeIdentity(SpellCalculation.encodeIdentity(compact)),{variant:'compact-17'});
console.log('PASS - Nine categorical values and the Layer 3 spell ID survive normalized JSON re-import.');
