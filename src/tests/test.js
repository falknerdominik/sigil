const assert = require('node:assert/strict');
const {SpellCalculation, SpellEncoding} = require('../generated/spell-calculation.cjs');
const {SpellDrawing} = require('../generated/spell-drawing.cjs');
assert.deepEqual(SpellDrawing.rgb('#Aa10Ff'), [170, 16, 255]);
const colorDrawing = new SpellDrawing({
  design:'plain',
  themeColors:{...SpellDrawing.themePalettes.plain, lines:'#abc'}
});
assert.equal(colorDrawing.themeColor('lines'), SpellDrawing.themePalettes.plain.lines,
  'Invalid custom ink must retain the selected theme default');
colorDrawing.settings.themeColors.lines = '#Aa10Ff';
assert.equal(colorDrawing.themeColor('lines'), '#Aa10Ff');
const n = 11;
const necklaces = SpellEncoding.uniqueNecklaces(n);
assert.equal(SpellEncoding.nextPrime(10), 11);
assert.equal(SpellEncoding.nextPrime(11), 11);
assert.equal(SpellEncoding.isPrime(9), false);
assert.equal(SpellEncoding.rotate('00101', -1), '10010');
assert.equal(SpellEncoding.rotate('00101', 6), '01010');
const cachedNecklaces = SpellEncoding.uniqueNecklaces(n);
cachedNecklaces.reverse();
assert.deepEqual(SpellEncoding.uniqueNecklaces(n), necklaces,
  'Callers must not be able to mutate the shared necklace cache');
assert.equal(necklaces.length, 186, 'prime-11 has exactly 186 nonconstant binary necklaces');
assert.equal(new Set(necklaces).size, 186);
for (const word of necklaces) {
  assert.equal(word.length, n);
  assert(!/^0+$|^1+$/.test(word));
  for (let shift=0;shift<n;shift++) {
    assert.equal(SpellEncoding.canonicalRotation(SpellEncoding.rotate(word, shift)),word);
    if (shift) assert.notEqual(SpellEncoding.rotate(word,shift),word);
  }
}
const edges = new Set();
for (let k=1;k<=5;k++) for (let i=0;i<n;i++) {
  const edge=[i,(i+k)%n].sort((a,b)=>a-b).join(':');
  assert(!edges.has(edge));
  edges.add(edge);
}
assert.equal(edges.size,55);

const attrs=[
  {id:'rank',label:'Rank',color:'#aaa',options:[{value:'1',label:'Rank 1'},{value:'2',label:'Rank 2'}]},
  {id:'area',label:'Area',color:'#bbb',options:[{value:'none',label:'None'},{value:'Burst',label:'Burst'}]},
  {id:'range',label:'Range',color:'#ccc',options:[{value:'Touch',label:'Touch'}]}
];
const calculation=new SpellCalculation(attrs);
const renderer=new SpellDrawing({design:'plain'});
renderer.drawingVertexCount=calculation.vertexCount;
assert.equal(calculation.vertexCount,7);
const spell={edition:'remaster',name:'Fireball',variant:'',rank:'1',area:'none',range:'Touch'};
const encoded=calculation.encode(spell);
renderer.drawingEdgeGroups=encoded.edgeGroups;
assert.equal(encoded.edgeGroups.length,3);
assert.equal(encoded.edgeGroups[1].edges.length,0);
assert(encoded.edgeGroups[0].edges.length>0);
assert.notDeepEqual(encoded.edgeGroups[0].edges,calculation.encode({...spell,rank:'2'}).edgeGroups[0].edges);
assert.throws(()=>calculation.encode({...spell,rank:'99'}));

// Feather & ink: flatten true circular geometry without changing endpoints.
const inkPaths=SpellDrawing.flattenInkPath(path=>{
  path.moveTo(0,0);path.lineTo(30,0);
  path.arc(30,10,10,-Math.PI/2,0);
});
assert.equal(inkPaths.length,1);
assert(Math.abs(inkPaths[0][0].x)<1e-9 && Math.abs(inkPaths[0][0].y)<1e-9);
assert(Math.abs(inkPaths[0].at(-1).x-40)<1e-9 && Math.abs(inkPaths[0].at(-1).y-10)<1e-9);
assert(inkPaths[0].length>7,'ink must sample smooth strokes, not merely move endpoints');
// High nib pressure deposits more ink at pen-down and steadily tapers off.
// The profile is based on arc length, not on how many points were sampled.
const taperWidths=[0,.2,.4,.6,.8,1].map(t=>SpellDrawing.inkNibWidth(t,4,1));
assert(taperWidths.every((width,i)=>i===0 || width<taperWidths[i-1]),
  'increasing stroke progress must always decrease nib thickness');
assert.equal(SpellDrawing.inkNibWidth(0,4,0),4);
assert.equal(SpellDrawing.inkNibWidth(1,4,0),4);
assert(SpellDrawing.inkNibWidth(0,4,.5)>4);
assert(SpellDrawing.inkNibWidth(1,4,.5)<4);
assert(SpellDrawing.inkNibWidth(0,4,1)>SpellDrawing.inkNibWidth(0,4,.5));
const sections=SpellDrawing.splitInkDashes([{x:0,y:0},{x:100,y:0}],[8,6]);
assert(sections.length>5, 'dashes should remain visible in feather-and-ink mode');
assert(sections.every(piece=>piece.length>=2 && piece.at(-1).t>=piece[0].t));
assert(sections.every((piece,i)=>i===0 || piece[0].t>sections[i-1].at(-1).t),
  'ink pressure must continue over the full path rather than resetting on each dash');
assert(Math.abs(sections[0][0].t)<1e-10);
assert(sections.at(-1).at(-1).t>0.8);
const originalEncoded=calculation.encode(spell);
Object.assign(renderer.settings,{handDrawnInk:true,inkWobble:2,inkPressure:.8,inkFeather:.9});
assert.deepEqual(calculation.encode(spell),originalEncoded,'ink effects must not change any encoding bits');
Object.assign(renderer.settings,{handDrawnInk:false});
assert.equal(Object.keys(SpellDrawing.traitThemes).length,31,
  'Every Primary Trait option, including none/Other, must have a theme');
for (const name of ['none','Fire','Water','Light','Darkness','Other']) {
  const key=`trait-${name.toLowerCase()}`;
  assert(SpellDrawing.themePalettes[key]?.background);
  assert(SpellDrawing.themePalettes[key]?.lines);
  assert(SpellDrawing.themePalettes[key]?.vertices);
}
assert(SpellDrawing.inkNibWidth(0,4,2.5) > SpellDrawing.inkNibWidth(0,4,1),
  'pressure >100% must widen the beginning of a nib stroke');
assert.equal(SpellDrawing.inkNibWidth(1,4,2.5),SpellDrawing.inkNibWidth(1,4,1),
  'pressure >100% must retain the thin pen-lift width');
console.log('PASS - deterministic ink sampling, monotonic pressure taper across dashes, and unchanged encoding.');


// Layer 3 stores the spell ID only; changing mechanics still leaves it intact.
const identity=SpellCalculation.encodeIdentity(spell);
assert.deepEqual(SpellCalculation.decodeIdentity(identity),{variant:''});
assert.equal(identity,SpellCalculation.encodeIdentity({...spell,name:'Another spell'}));
assert.notEqual(identity,SpellCalculation.encodeIdentity({...spell,variant:'Player Core / p.10'}));
assert.equal(identity,SpellCalculation.encodeIdentity({...spell,edition:'legacy'}));
const withUnicode={...spell,name:'Searing Light ✦',variant:'Book ñ § 7'};
assert.deepEqual(SpellCalculation.decodeIdentity(SpellCalculation.encodeIdentity(withUnicode)),{
  variant:withUnicode.variant
});
assert.throws(()=>SpellCalculation.decodeIdentity(identity+'0'));
assert.throws(()=>SpellCalculation.encodeIdentity({...spell,variant:'A'.repeat(200)}),/too long/);
const full=calculation.encode({...spell,name:'Different name'});
assert.equal(full.identityBits,encoded.identityBits);
assert.deepEqual(full.edgeGroups, encoded.edgeGroups);

// The circular modes always pass through the two edge endpoints.
const arcs=[];
const ctx={moveTo(){},lineTo(){},arc(...args){arcs.push(args);}};
const edgesToTest=[
  [{x:30,y:20},{x:30,y:100}],
  [{x:10,y:50},{x:90,y:50}],
  [{x:10,y:10},{x:50,y:80}]
];
renderer.settings.style='centered';
for (const [p,q] of edgesToTest) {
  renderer.traceConnection(ctx,p,q,{x:50,y:60});
  const [cx,cy,r,a0,a1]=arcs.at(-1);
  assert(Math.abs(Math.hypot(p.x-cx,p.y-cy)-r)<1e-7);
  assert(Math.abs(Math.hypot(q.x-cx,q.y-cy)-r)<1e-7);
  assert(Math.abs(Math.abs(((a1-a0)%(2*Math.PI)))-Math.PI)<1e-7);
}
renderer.settings.style='curved';
renderer.settings.curvature=0.22;
for (const direction of ['inward','outward','alternate']) {
  renderer.settings.arcSide=direction;
  const p={x:30,y:20}, q={x:30,y:100};
  renderer.traceConnection(ctx,p,q,{x:50,y:60},1);
  const [cx,cy,r]=arcs.at(-1);
  assert(Math.abs(Math.hypot(p.x-cx,p.y-cy)-r)<1e-7);
  assert(Math.abs(Math.hypot(q.x-cx,q.y-cy)-r)<1e-7);
  assert(Math.abs(cx-30)>0.01,'non-centred arc has offset circle centre');
}

// Transforms change geometry, not the physical canvas dimensions or the bits.
const geometry=renderer.getGeometry(800,600,SpellCalculation.encodeIdentity({variant:''}));
renderer.settings.rotation=45;
renderer.settings.stretch=.75;
renderer.settings.mirror=true;
const changed=renderer.getGeometry(800,600,SpellCalculation.encodeIdentity({variant:''}));
assert.notDeepEqual(geometry.points, changed.points);
assert.deepEqual(geometry.center, changed.center);
assert.equal(encoded.identityBits, calculation.encode(spell).identityBits);

// Each dot style has a Canvas path, while leaving spell encoding untouched.
const traceCtx={beginPath(){},arc(){},moveTo(){},lineTo(){},closePath(){}};
for(const style of ['circle','empty','star','diamond','square','triangle','hexagon','cross']) {
  assert.doesNotThrow(()=>SpellDrawing.traceNode(traceCtx,100,100,8,style));
}
// Function bases place all vertices on a prescribed curve at near-equal arc lengths.
for (const shape of ['semicircle', 'quarter', 'quadratic', 'cubic']) {
  const sampled = SpellDrawing.sampleFunctionBase(shape, 11, 1.15);
  assert.equal(sampled.vertices.length, 11);
  assert.equal(sampled.guidePath.length, 601);
  // Test arc-length parameterization, not Euclidean edge lengths (which
  // legitimately shrink near tight bends of a cubic).
  const pathArc=[0];
  sampled.guidePath.slice(1).forEach((point,i) => {
    const prior=sampled.guidePath[i];
    pathArc.push(pathArc.at(-1)+Math.hypot(point.x-prior.x,point.y-prior.y));
  });
  const totalArc=pathArc.at(-1);
  sampled.vertices.forEach((point,i) => {
    let closest=0, best=Infinity;
    sampled.guidePath.forEach((pathPoint,j) => {
      const d=Math.hypot(point.x-pathPoint.x,point.y-pathPoint.y);
      if (d<best){best=d;closest=j;}
    });
    assert(Math.abs(pathArc[closest] - totalArc*i/10) < totalArc/100,
      shape+' vertex '+i+' must have evenly spaced arc distance');
  });
  for (const p of sampled.vertices) assert(Number.isFinite(p.x) && Number.isFinite(p.y));
  renderer.settings.base = shape;
  renderer.settings.baseBend = 1.15;
  const geometry = renderer.getGeometry(800,600,SpellCalculation.encodeIdentity({variant:''}));
  assert.equal(geometry.points.length, calculation.vertexCount);
  assert(geometry.basePath.length > 500);
  for (const p of geometry.points) {
    assert(p.x > 23 && p.x < 777, shape + ' x stays in drawing frame');
    assert(p.y > 23 && p.y < 577, shape + ' y stays in drawing frame');
  }
}
renderer.settings.base = 'polygon';

// Different vertex styles affect only drawing. None draws no vertex;
// empty space erases the underlying edges and leaves a hollow ring.
const paintCalls = [];
const paintCtx = {
  save(){}, restore(){}, beginPath(){paintCalls.push('begin');},
  moveTo(){},lineTo(){},closePath(){},
  arc(...args){paintCalls.push(['arc',args[2]]);},
  fill(){paintCalls.push('fill');},stroke(){paintCalls.push('stroke');},
  fillText(...args){paintCalls.push(['label',args[0]])},
  fillRect(){},measureText(text){return {width:text.length*7}}
};
const points = [{x:200,y:100}, {x:300,y:200}, {x:200,y:300},
  {x:100,y:200},{x:165,y:155},{x:235,y:245},{x:100,y:100}];
renderer.settings.vertexLabels='none';
renderer.settings.dotStyle='none';
renderer.paintNodes(paintCtx,points,150,500,500);
assert.equal(paintCalls.filter(x=>x==='fill').length,0);
assert.equal(paintCalls.filter(x=>x==='stroke').length,0);
renderer.settings.dotStyle='empty';
renderer.settings.vertexSize=1;
paintCalls.length=0;
renderer.paintNodes(paintCtx,points,150,500,500);
assert.equal(paintCalls.filter(x=>x==='fill').length,points.length);
assert.equal(paintCalls.filter(x=>x==='stroke').length,points.length);
const originalNodeRadius=paintCalls.find(x=>Array.isArray(x)&&x[0]==='arc')[1];
renderer.settings.vertexSize=2;
paintCalls.length=0;
renderer.paintNodes(paintCtx,points,150,500,500);
assert(Math.abs(paintCalls.find(x=>Array.isArray(x)&&x[0]==='arc')[1]/originalNodeRadius-2)<1e-9);
renderer.settings.dotStyle='circle';
paintCalls.length=0;
renderer.paintNodes(paintCtx,points,150,500,500);
assert.equal(paintCalls.filter(x=>x==='fill').length,points.length*2);
renderer.settings.dotStyle='none';
renderer.settings.vertexLabels='attributes';
paintCalls.length=0;
renderer.paintNodes(paintCtx,points,150,500,500);
assert.equal(paintCalls.filter(x=>Array.isArray(x)&&x[0]==='label').length,attrs.length);
console.log('PASS — 186 necklaces; 55 independent edges; lossless identities; centered/non-centered arcs; polygon and four function bases; transforms; nine vertex styles; sizing; attribute labels.');

// Design themes alter only Canvas styling, never spell notation or coordinates.
renderer.settings.design='plain';
const baseEdgeGroups=calculation.encode(spell).edgeGroups;
const baseGeometry=renderer.getGeometry(800,600,SpellCalculation.encodeIdentity({variant:''})).points;
for (const theme of ['plain','constellations','blueprint']) {
  renderer.settings.design=theme;
  assert.deepEqual(calculation.encode(spell).edgeGroups,baseEdgeGroups);
  assert.deepEqual(renderer.getGeometry(800,600,SpellCalculation.encodeIdentity({variant:''})).points,baseGeometry);
}
console.log('PASS - Plain, Constellations, and Blueprint preserve geometry and binary coding.');

// Generic high-capacity mode: nine independent connection families on a 19-node base.
const expanded=Array.from({length:9},(_,i)=>({
  id:'a'+i,label:'Feature '+i,color:'#999999',
  options:[{value:'none',label:'None'},{value:'one',label:'One'},
    {value:'two',label:'Two'},{value:'three',label:'Three'}]
}));
const largeCalculation=new SpellCalculation(expanded);
const large=new SpellDrawing({style:'curved',arcSide:'alternate'});
large.drawingVertexCount=largeCalculation.vertexCount;
assert.equal(largeCalculation.vertexCount,19);
assert.equal(SpellEncoding.uniqueNecklaces(19).length,204);
const extendedSpell={edition:'remaster',name:'Extensible',variant:'source-123'};
for(const a of expanded) extendedSpell[a.id]='one';
const fullSigil=largeCalculation.encode(extendedSpell);
large.drawingEdgeGroups=fullSigil.edgeGroups;
assert.equal(fullSigil.edgeGroups.length,9);
const edgeCount=fullSigil.edgeGroups.reduce((sum,group)=>sum+group.edges.length,0);
assert.equal(new Set(fullSigil.edgeGroups.flatMap(group=>group.edges.map(pair=>
  pair.slice().sort((a,b)=>a-b).join(':')))).size,edgeCount,
  'edge families must not share edges');
assert(edgeCount>9);
for(const a of expanded){
  const changed=largeCalculation.encode({...extendedSpell,[a.id]:'two'});
  assert.notDeepEqual(changed.edgeGroups.find(group=>group.id===a.id).edges,
    fullSigil.edgeGroups.find(group=>group.id===a.id).edges);
  assert.equal(changed.identityBits,fullSigil.identityBits);
}
for(const base of ['polygon','semicircle','quarter','quadratic','cubic']){
  large.settings.base=base;
  for(const facet of ['smooth','3','4','6','8','12']){
    large.settings.polygonSides=facet;
    const g=large.getGeometry(800,600,SpellCalculation.encodeIdentity({variant:''}));
    assert.equal(g.points.length,19,`${base}/${facet}: no vertices lost`);
    assert(g.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    assert(g.points.every(p=>p.x>23&&p.x<777&&p.y>23&&p.y<577),
      `${base}/${facet}: stays within drawing frame`);
    assert.deepEqual(largeCalculation.encode(extendedSpell).edgeGroups,
      fullSigil.edgeGroups,`${base}/${facet}: notational invariance`);
  }
}
for(const design of ['plain','constellations','blueprint','obsidian',
  'herbarium','arcane','divine','occult','primal','tattoo']){
  large.settings.design=design;
  assert.deepEqual(largeCalculation.encode(extendedSpell).edgeGroups,fullSigil.edgeGroups);
}
console.log('PASS - generic 9-layer capacity test (legacy mode): n=19 necklaces, five curves x six facet settings, ten themes.');

// Compact notation: 5 edge families / 11 vertices, with all secondary
// attributes combined into one decodable orbit per active vertex.
const primaryFive=Array.from({length:5},(_,i)=>({
  id:'primary'+i,label:'Primary '+i,color:'#7799bb',
  options:[{value:'none',label:'None'},{value:'one',label:'One'},{value:'two',label:'Two'}]
}));
const secondaryFour=Array.from({length:4},(_,i)=>({
  id:'secondary'+i,label:'Secondary '+i,color:'#99bbaa',
  options:[{value:'none',label:'None'},{value:'one',label:'One'},{value:'two',label:'Two'}]
}));
const compactCalculation=new SpellCalculation(primaryFive,secondaryFour);
const compactRenderer=new SpellDrawing();
compactRenderer.drawingVertexCount=compactCalculation.vertexCount;
const compactSpell={edition:'remaster',name:'Compact example',variant:'catalog-99'};
for(const attribute of [...primaryFive,...secondaryFour]) compactSpell[attribute.id]='one';
const compactEncoding=compactCalculation.encode(compactSpell);
compactRenderer.drawingEdgeGroups=compactEncoding.edgeGroups;
assert.equal(compactEncoding.vertexCount,11);
assert.deepEqual(compactEncoding.edgeGroups.map(group=>group.k),[1,2,3,4,5]);
assert.deepEqual(compactCalculation.orbitAttributes.map(attribute=>attribute.sectionUnits),[1,2,4,8]);
const radiansPerUnit=2*Math.PI/15; // 24 degrees for four secondary attributes

// All 16 subsets of the four secondary fields must map to unique orbit sweeps;
// adding the fields must be equivalent to adding their angular sections.
for(let mask=0; mask<16; mask++) {
  const selectedAttributes=compactCalculation.orbitAttributes.map((attribute,index)=>({
    ...attribute,vertices:mask&(1<<index)?[4]:[]
  }));
  const orbits=SpellCalculation.combineOrbits(11,selectedAttributes);
  assert.equal(orbits.length,mask?1:0);
  if(mask){
    assert.equal(orbits[0].vertex,4);
    assert.equal(orbits[0].units,mask);
    assert(Math.abs(orbits[0].sweep-mask*radiansPerUnit)<1e-10);
  }
  const decoded=SpellCalculation.decodeOrbitSections(mask,selectedAttributes);
  assert.deepEqual(decoded,selectedAttributes.filter((_,i)=>mask&(1<<i)).map(attribute=>attribute.id));
}
assert.throws(()=>SpellCalculation.decodeOrbitSections(16,compactCalculation.orbitAttributes));
const orbitUnits=new Array(11).fill(0);
for(const attribute of compactCalculation.orbitAttributes) {
  [...attribute.lookup.get('one')].forEach((bit,vertex)=>{
    if(bit==='1') orbitUnits[vertex]+=attribute.sectionUnits;
  });
}
assert.deepEqual(compactEncoding.orbits,
  orbitUnits.flatMap((units,vertex)=>units?[{vertex,units,sweep:units*radiansPerUnit}]:[]));

const center={x:250,y:230}, arcRadius=155;
const arcPoints=Array.from({length:11},(_,i)=>({
  x:center.x+arcRadius*Math.cos(i*Math.PI*2/11),
  y:center.y+arcRadius*Math.sin(i*Math.PI*2/11)
}));
const drawnArcs=[],arcDashes=[];
const fakeArcCtx={
  save(){},restore(){},beginPath(){},stroke(){},
  arc(...args){drawnArcs.push(args);},
  setLineDash(dashes){arcDashes.push(dashes.slice());}
};
assert.equal(compactRenderer.settings.handDrawnInk,true,'ink strokes should be enabled by default');
compactRenderer.settings.handDrawnInk=false;
compactRenderer.settings.orbitWidth=2;
compactRenderer.settings.orbitLineStyle='dashed';
compactRenderer.paintOrbits(fakeArcCtx,center,arcPoints,arcRadius,compactEncoding.orbits);
assert.equal(drawnArcs.length,compactEncoding.orbits.length,
  'exactly one orbit at each active vertex even with overlapping secondary fields');
for(let i=0;i<drawnArcs.length;i++) {
  assert(Math.abs(drawnArcs[i][4]-drawnArcs[i][3]-compactEncoding.orbits[i].sweep)<1e-8,
    'the drawn orbit has precisely the total angular sweep');
  assert(Math.abs(drawnArcs[i][4]-drawnArcs[i][3]-2*Math.PI)<1e-8,
    'all four attributes draw a complete orbit without a gap');
}
assert(arcDashes.every(dashes=>dashes.length===2), 'dashed style must reach the vertex orbit');
assert.equal(fakeArcCtx.lineWidth,2);
const dots=SpellDrawing.linePattern('dotted',1.3);
assert.equal(dots.length,2);
assert.deepEqual(SpellDrawing.linePattern('solid',1.3),[]);

// The entire length-prefixed spell ID stays intact when drawn as inward marks;
// presentation cannot change encoded values, ring slots, or bit count.
const tickOps={lines:0,dots:0,squares:0,dashes:[]}; let tickFrom=null;
const tickCtx={
  save(){},restore(){},beginPath(){},stroke(){},fill(){tickOps.dots++;},
  moveTo(x,y){tickFrom=[x,y];},lineTo(x,y){tickOps.lines++; tickOps.lastLine={from:tickFrom,to:[x,y]};},
  arc(){}, fillRect(){tickOps.squares++;}, translate(){}, rotate(){},
  setLineDash(dashes){tickOps.dashes.push(dashes.slice());}
};
compactRenderer.settings.identityTickWidth=1.6;
compactRenderer.settings.identityTickLineStyle='dotted';
compactRenderer.settings.identityTickShape='line';
const compactGeometry = compactRenderer.getGeometry(600,550,compactEncoding.identityBits);
const oneBits=compactEncoding.identityBits.split('1').length-1;
compactRenderer.paintIdentity(tickCtx,compactGeometry.identityTicks);
assert.equal(tickOps.lines,oneBits,
  'exactly one line marker must represent every identity 1-bit in line mode');
assert(tickOps.dashes.some(dashes=>dashes.length===2));
assert.equal(tickCtx.lineWidth,1.6);
for (const [shape, key] of [['dot','dots'], ['square','squares']]) {
  tickOps.lines=0; tickOps.dots=0; tickOps.squares=0;
  compactRenderer.settings.identityTickShape=shape;
  compactRenderer.paintIdentity(tickCtx,compactGeometry.identityTicks);
  assert.equal(tickOps[key],oneBits, `every 1-bit must render as a ${shape}`);
  assert.equal(shape==='dot' ? tickOps.squares : tickOps.dots,0);
  assert.equal(tickOps.lines,0);
}
tickOps.lines=0; tickOps.dots=0; tickOps.squares=0;
compactRenderer.settings.identityTickShape='mixed';
compactRenderer.paintIdentity(tickCtx,compactGeometry.identityTicks);
assert(tickOps.lines>0 && tickOps.dots>0 && tickOps.squares>0,
  'mixed Layer 3 markers must include lines, dots, and squares');
assert.equal(tickOps.lines + tickOps.dots + tickOps.squares, oneBits);
// Point-size, fill/outline, square-angle and opacity settings must really
// reach Canvas; changing their appearance must never change the spell ID bits.
const markerOps = {arcs:[], filled:0, outlines:0, squares:[], hollowSquares:[], angles:[]};
const markerCtx = {
  globalAlpha:1, save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){},
  stroke(){markerOps.outlines++;}, fill(){markerOps.filled++;},
  arc(...args){markerOps.arcs.push(args);},
  fillRect(...args){markerOps.squares.push(args);},
  strokeRect(...args){markerOps.hollowSquares.push(args);},
  translate(){}, rotate(angle){markerOps.angles.push(angle);}, setLineDash(){}
};
compactRenderer.settings.identityTickShape='dot';
compactRenderer.settings.identityDotSize=8;
compactRenderer.settings.identityDotFill='outline';
compactRenderer.settings.identityPointStrokeWidth=1.75;
compactRenderer.settings.identityMarkerOpacity=.55;
compactRenderer.paintIdentity(markerCtx,compactGeometry.identityTicks);
assert.equal(markerOps.arcs.length,oneBits);
assert(markerOps.arcs.every(args=>args[2]===4),'dot diameter must come from dot-size control');
assert.equal(markerOps.filled,0,'hollow dots must never fill');
assert.equal(markerOps.outlines,oneBits,'hollow dots must be stroked');
assert.equal(markerCtx.globalAlpha,.55,'opacity setting must reach Canvas');
assert.equal(markerCtx.lineWidth,1.75,'outline width must apply to hollow points');
markerOps.arcs.length=markerOps.squares.length=markerOps.hollowSquares.length=markerOps.angles.length=0;
markerOps.outlines=markerOps.filled=0;
compactRenderer.settings.identityTickShape='square';
compactRenderer.settings.identitySquareSize=9.5;
compactRenderer.settings.identitySquareFill='outline';
compactRenderer.settings.identitySquareOrientation='upright';
compactRenderer.paintIdentity(markerCtx,compactGeometry.identityTicks);
assert.equal(markerOps.hollowSquares.length,oneBits,'hollow square count matches 1-bits');
assert(markerOps.hollowSquares.every(args=>args[2]===9.5 && args[3]===9.5));
assert(markerOps.angles.every(angle=>angle===0),'upright orientation must be a zero-degree turn');
markerOps.hollowSquares.length=markerOps.angles.length=0;
compactRenderer.settings.identitySquareFill='filled';
compactRenderer.settings.identitySquareOrientation='diamond';
compactRenderer.paintIdentity(markerCtx,compactGeometry.identityTicks);
assert.equal(markerOps.squares.length,oneBits,'filled square count matches 1-bits');
assert(markerOps.angles.every(angle=>Math.abs(angle-Math.PI/4)<1e-12),
  'diamond rotation must be 45 degrees');
const compactBefore=compactCalculation.encode(compactSpell);
Object.assign(compactRenderer.settings,{orbitWidth:3,orbitLineStyle:'dotted',
  identityTickWidth:.5,identityTickShape:'square',identityTickLineStyle:'dashed',
  identityDotSize:10,identityDotFill:'filled',identitySquareSize:12,
  identitySquareFill:'outline',identitySquareOrientation:'tangent',
  identityPointStrokeWidth:3,identityMarkerOpacity:.25});
assert.deepEqual(compactCalculation.encode(compactSpell),compactBefore,
  'layer-2 and layer-3 styling must not alter the underlying encoding');

// Balanced rank reveal leaves the rank's full encoding intact, interleaves
// complete Layer 1 edges and Layer 2 orbits, and never alters identity bits.
const visibleCount=view => view.edgeGroups.reduce((sum, group) => sum + group.edges.length, 0) + view.orbits.length;
const rankEncoding={...compactBefore, edgeGroups:compactBefore.edgeGroups.map((group,index)=>
  index===0 ? {...group,id:'rank'} : group)};
const detailOrder=SpellCalculation.detailDrawOrder(rankEncoding);
assert(detailOrder.length>15);
assert(detailOrder.slice(0,5).some(item=>item.kind==='orbit'),
  'the beginning of the reveal order must contain a complete Layer 2 orbit');
assert(detailOrder.slice(0,5).some(item=>item.kind==='edge'),
  'Layer 1 and Layer 2 geometry must be interleaved');
const cantripView=SpellCalculation.applyRankComplexity(rankEncoding, {rank:'cantrip'});
const rank5View=SpellCalculation.applyRankComplexity(rankEncoding, {rank:'5'});
const rank10View=SpellCalculation.applyRankComplexity(rankEncoding, {rank:'10'});
assert.equal(cantripView.edgeGroups[0].edges.length,rankEncoding.edgeGroups[0].edges.length,
  'the rank layer must remain fully visible at every tier');
assert(cantripView.orbits.length>0,
  'even cantrips should show some Layer 2 orbits when any are encoded');
assert(visibleCount(cantripView) < visibleCount(rank5View) && visibleCount(rank5View) < visibleCount(rank10View),
  'visible mechanical complexity must rise with rank');
assert.equal(visibleCount(rank10View), rank10View.totalRevealable,
  'top-rank spells must reveal the full mechanical drawing');
assert.deepEqual(rankEncoding.edgeGroups[0].edges,cantripView.edgeGroups[0].edges);
const fullView=SpellCalculation.applyRankComplexity(rankEncoding,{rank:'cantrip'}, false);
assert.equal(visibleCount(fullView),fullView.totalRevealable,
  'full notation must show all geometry regardless of rank');
assert.equal(SpellCalculation.applyRankComplexity(rankEncoding,{rank:'cantrip'},true).revealFraction,0.2);
assert.deepEqual(SpellCalculation.detailDrawOrder(rankEncoding),detailOrder,
  'detail order is stable and never mutates full encoding');
assert.deepEqual(compactBefore,compactCalculation.encode(compactSpell),
  'render-only reveal must never alter the spell encoding');
for(const attr of secondaryFour){
  const next=compactCalculation.encode({...compactSpell,[attr.id]:'two'});
  assert.notDeepEqual(next.orbits,compactBefore.orbits);
  assert.deepEqual(next.edgeGroups,compactBefore.edgeGroups);
  assert.equal(next.identityBits,compactBefore.identityBits);
}
console.log('PASS - compact five-plus-four layout; 16 unique orbit combinations; one orbit per active vertex; configurable Layer 2/3 styling; unchanged spell-ID marks.');

const shortTrackBits=SpellCalculation.encodeIdentity({variant:'demo1'});
for (const base of ['polygon','semicircle']) {
  for (const [size,slots] of [[414,175],[411,174]]) {
    Object.assign(compactRenderer.settings,{base,polygonSides:'smooth',stretch:1,rotation:0,mirror:false});
    const geometry=compactRenderer.getGeometry(size,size,shortTrackBits);
    assert.equal(geometry.identityLayout.slotsPerRing,slots);
    const last=geometry.identityTicks.at(-1);
    assert.equal(last.index,shortTrackBits.length-1);
    assert(Math.hypot(last.to.x-last.from.x,last.to.y-last.from.y)>0,
      `${base}: final identity marker must have a direction`);
  }
}

// Identity ticks share the edge transform and are fitted with the base shape.
// They keep their binary order, even while being squashed, mirrored, or rotated.
const identityBits = compactEncoding.identityBits;
const viewport = {width:760,height:620};
const variants = [
  {base:'polygon',polygonSides:'smooth',stretch:1,rotation:0,mirror:false},
  {base:'polygon',polygonSides:'smooth',stretch:0.6,rotation:0,mirror:false},
  {base:'polygon',polygonSides:'5',stretch:1.35,rotation:75,mirror:true},
  {base:'polygon',polygonSides:'3',stretch:0.6,rotation:-150,mirror:false},
  {base:'semicircle',polygonSides:'smooth',stretch:1.35,rotation:120,mirror:false},
  {base:'quarter',polygonSides:'smooth',stretch:0.6,rotation:-90,mirror:true},
  {base:'quadratic',polygonSides:'smooth',stretch:1.35,rotation:145,mirror:true},
  {base:'cubic',polygonSides:'smooth',stretch:0.6,rotation:-65,mirror:false}
];
const layouts = variants.map(settings => {
  Object.assign(compactRenderer.settings,settings);
  const geometry=compactRenderer.getGeometry(viewport.width,viewport.height,identityBits);
  assert.equal(geometry.identityLayout.bitCount,identityBits.length);
  assert.equal(geometry.identityTicks.length,identityBits.split('1').length-1);
  assert.deepEqual(geometry.identityTicks.map(tick=>tick.index),
    compactGeometry.identityTicks.map(tick=>tick.index),'bit order is unchanged');
  for (const point of [...geometry.points,...geometry.identityTicks.flatMap(t=>[t.from,t.to])]) {
    assert(point.x >= 25 && point.x <= viewport.width - 25,
      `x clipped in ${JSON.stringify(settings)}: ${point.x}`);
    assert(point.y >= 25 && point.y <= viewport.height - 25,
      `y clipped in ${JSON.stringify(settings)}: ${point.y}`);
  }
  for (const tick of geometry.identityTicks) {
    const towardsCenter=(tick.to.x-tick.from.x)*(geometry.center.x-tick.from.x)+
      (tick.to.y-tick.from.y)*(geometry.center.y-tick.from.y);
    assert(towardsCenter > 0, 'ticks point inward after transform');
  }
  assert.equal(compactCalculation.encode(compactSpell).identityBits, identityBits);
  return geometry;
});
const xExtent=g=>Math.max(...g.identityTicks.map(t=>Math.abs(t.from.x-g.center.x)));
assert(xExtent(layouts[1]) < xExtent(layouts[0]) * .8,
  'identity rings must compress horizontally when stretch is reduced');
const direction=g=>Math.atan2(g.identityTicks[0].from.y-g.center.y,
  g.identityTicks[0].from.x-g.center.x);
const angleDiff=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
assert(angleDiff(direction(layouts[0]), direction(layouts[2])) > .25,
  'identity ticks must rotate/mirror with main geometry');
console.log('PASS - Layer 3 tick path scales, rotates, mirrors, follows base families, and preserves bit order.');

