const assert=require('node:assert/strict');
const SpellCard=require('../generated/spell-card.cjs');
assert.deepEqual(SpellCard.rgb('#Aa10Ff'), [170, 16, 255]);
assert.deepEqual(SpellCard.rgb('#abc'), [36, 42, 49],
  'Cards must retain their own fallback for invalid colors');
assert.equal(SpellCard.rgba('not-a-color', 0.5), 'rgba(36,42,49,0.5)');
const {SpellCatalog}=require('../generated/spell-catalog.cjs');
const spellRows=require('../../data/spell.json');
const catalogue=SpellCatalog.parse(spellRows).entries;
assert.equal(catalogue.length,spellRows.length);
for(let i=0;i<catalogue.length;i++){
  assert.equal(catalogue[i].description,String(spellRows[i].description||'').trim(),
    `description must be preserved verbatim in ${catalogue[i].name}`);
  assert(catalogue[i].description,`missing description for ${catalogue[i].name}`);
  assert.deepEqual(catalogue[i].traits,spellRows[i].traits.map(x=>x.toLowerCase()));
}
for(const [actions, expected] of [
  ['1 action','1 ACTION'],['2 actions','2 ACTIONS'],['3 actions','3 ACTIONS'],
  ['Reaction','REACTION'],['Free action','FREE ACTION']
]) assert.equal(SpellCard.actionsLabel(actions),expected);
assert.equal(SpellCard.actionsLabel('Other','3'),'3 ACTIONS');
assert.equal(SpellCard.actionsLabel('Other',''),'CASTING TIME NOT LISTED');
assert.equal(SpellCard.cleanDescription('**Critical Success**\n\n- 2d6 damage'),
  'Critical Success\n\n- 2d6 damage');
const ctx={font:'25px Arial',measureText(text){
  const size=Number.parseInt(this.font.match(/(\d+)px/)?.[1]||'25',10);
  return {width:[...String(text)].length*size*.52};
}};
const normal=catalogue.find(spell=>spell.name==='Fireball');
const largest=catalogue.reduce((best,spell)=>
  spell.description.length>best.description.length?spell:best);
const labels=['Rank','Tradition','Range','Duration','Primary trait','Damage',
  'Area','Casting time','Casting traits'];
for(const entry of [normal,largest]){
  const layout=SpellCard.layout(ctx,{...entry,actions:entry.castActions});
  assert.equal(layout.width,1240);
  assert(layout.height>=1100&&layout.height<15000,`${entry.name}: card fits Canvas limits`);
  assert.deepEqual(layout.attributeChips.map(chip=>chip.label),labels.map(label=>label.toUpperCase()));
  assert(layout.attributeChips.every(chip=>chip.value&&chip.width>0&&chip.height>0),
    'all mechanics are present as fully labelled chips');
  assert(layout.descriptionLines.every(line=>line.y<layout.height-55),
    'no description line may be clipped');
  const actual=layout.descriptionLines.map(line=>line.text).join(' ').replace(/\s+/g,' ').trim();
  const expected=SpellCard.cleanDescription(entry.description).replace(/\s+/g,' ').trim();
  assert.equal(actual,expected,`all words of ${entry.name} must fit without truncation`);
  assert(layout.dividerY<layout.descriptionLines[0].y);
  assert(!('descTitleY' in layout),'the description heading was removed');
}
// Every bundled entry must fit in the themed card without clipping a chip.
for(const entry of catalogue){
  const plan=SpellCard.layout(ctx,{...entry,actions:entry.castActions});
  assert(plan.height<16000,`${entry.name}: card exceeds a safe Canvas height`);
  for(const chip of [...plan.attributeChips,...plan.traitChips]){
    assert(chip.x>=plan.pad&&chip.x+chip.width<=plan.width-plan.pad+0.01,
      `${entry.name}: chip extends beyond the horizontal margins`);
    assert(chip.y+chip.height<plan.dividerY,
      `${entry.name}: chip overlaps the description`);
  }
}
const tiny=SpellCard.layout(ctx,{name:'My own spell',rank:'1',actions:'1 action',
  traits:[],description:''});
assert(tiny.description.includes('No description provided'));
const longTitle=SpellCard.layout(ctx,{name:'A mythical incantation with a very long extraordinary magical name',
  rank:'9',actions:'2 actions',traits:['fire'],description:'Works.'});
assert(longTitle.titleLines.length>=1&&longTitle.titleLines.length<=2);
assert.equal(SpellCard.attributeValues({rank:'cantrip',tradition:'Arcane+Primal',
  actions:'2 actions'}).length,9);
assert.equal(SpellCard.attributeValues({rank:'cantrip'})[0].value,'Cantrip');
assert.equal(SpellCard.attributeValues({tradition:'Arcane+Primal'})[1].value,'Arcane + Primal');
const mockArtist={themeColor:key=>({background:'#0e1c35',lines:'#e4f4ff',vertices:'#f4faff'})[key]};
assert.equal(SpellCard.palette(mockArtist).light,false);
mockArtist.themeColor=key=>({background:'#f4eedf',lines:'#735a40',vertices:'#857052'})[key];
assert.equal(SpellCard.palette(mockArtist).light,true);
console.log(`PASS - all ${catalogue.length} full descriptions, 9 attribute chips, automatic wrapping, themed card palette and no description heading.`);
