'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const fixturePath = path.join(__dirname, 'browser-baseline.json');
const capture = process.argv.includes('--capture');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

// Restore removed diagnostic metadata only for comparison with the original fixture.
function baselineNotation(complete, visible, spell, calculation) {
  // Verify the new full-circle scale, then restore historical sweep metadata
  // so the original fixture still protects catalogue values and bit mappings.
  const legacyOrbits = orbits => orbits.map(orbit => {
    const combinations = 2 ** calculation.orbitAttributes.length;
    if (Math.abs(orbit.sweep - orbit.units * (2 * Math.PI / (combinations - 1))) > 1e-12)
      throw new Error('Orbit sweep must use the full-circle scale');
    return {...orbit, sweep:orbit.units * (2 * Math.PI / combinations)};
  });
  const attributeEncoding = (attribute, mode) => {
    const value = String(spell[attribute.id] ?? 'none');
    const bits = attribute.lookup.get(value);
    const choice = attribute.options.find(option => String(option.value) === value);
    return {
      id:attribute.id, label:attribute.label, value,
      displayValue:choice ? choice.label : value, color:attribute.color, bits,
      vertices:[...bits].flatMap((bit, vertex) => bit === '1' ? [vertex] : []),
      mode
    };
  };
  const full = {
    n:complete.vertexCount,
    layers:complete.edgeGroups.map((group, index) => ({
      ...attributeEncoding(calculation.edgeAttributes[index], 'edge'), ...group
    })),
    decorations:calculation.orbitAttributes.map(attribute => ({
      ...attributeEncoding(attribute, 'vertex'), sectionUnits:attribute.sectionUnits
    })),
    vertexArcs:legacyOrbits(complete.orbits),
    identity:{
      fields:['spell-id', calculation.constructor.decodeIdentity(complete.identityBits).variant],
      bits:complete.identityBits, byteLength:(complete.identityBits.length - 16) / 8
    },
    edgeCount:complete.edgeGroups.reduce((sum, group) => sum + group.edges.length, 0),
    decorationCount:complete.orbits.length
  };
  const {edgeGroups, orbits, ...counts} = visible;
  return {
    complete:full,
    filtered:{
      ...full, layers:edgeGroups.map((group, index) => ({...full.layers[index], ...group})),
      vertexArcs:legacyOrbits(orbits), ...counts
    }
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function catalogueBaseline(page) {
  const baseline = await page.evaluate(source => window.eval(`(() => {
    const baselineNotation = ${source};
    const records = spellPicker.searchRows.map(({entry, search}) => {
      selectedEntry = entry;
      $('spellName').value = entry.name;
      $('spellVariant').value = entry.variant;
      for (const attribute of activeAttributes) selectValue($(attribute.id), entry[attribute.id]);
      const spell = readState();
      const complete = calculation.encode(spell);
      return {
        variant: entry.variant,
        entry,
        search,
        spell,
        ...baselineNotation(complete, SpellCalculation.applyRankComplexity(complete, spell, true), spell, calculation)
      };
    });
    chooseSpell(catalogue.entries.find(entry => entry.name.toLowerCase() === 'fireball').id);
    const custom = {...readState(), name:'Baseline custom spell', variant:'baseline-custom'};
    const options = activeAttributes.map(attribute => ({
      id: attribute.id,
      options: attribute.options,
      values: attribute.options.map(option => {
        const spell = {...custom, [attribute.id]:option.value};
        const complete = calculation.encode(spell);
        return {value:option.value,
          ...baselineNotation(complete, SpellCalculation.applyRankComplexity(complete, spell, true), spell, calculation)};
      })
    }));
    return {records, options};
  })()`), baselineNotation.toString());
  assert.equal(baseline.records.length, 1400);
  const records = Object.fromEntries(baseline.records.map(record => [record.variant, digest(record)]));
  assert.equal(Object.keys(records).length, baseline.records.length, 'Catalogue variants must be unique');
  return {
    records,
    order: digest(baseline.records.map(record => record.variant)),
    options: digest(baseline.options)
  };
}

async function renderBaseline(page) {
  return page.evaluate(async () => {
    const scenarios = [
      {name:'plain-full', design:'plain', rankComplexity:false},
      {name:'constellations-filtered', design:'constellations', rankComplexity:true},
      {name:'blueprint-transformed', design:'blueprint', base:'quadratic', rotation:35, mirror:true, stretch:0.8},
      {name:'fire-ink', design:'trait-fire', handDrawnInk:true, inkOnlyLayers1And2:false, inkWobble:1, inkPressure:0.8, decorations:true, decorationSeed:123},
      {name:'tattoo-blackwork', design:'tattoo', dotStyle:'circle', vertexSize:0.5, vertexStroke:0.75}
    ];
    const result = {};
    for (const {name, ...settings} of scenarios) {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 320;
      // Keep the original pixel fixture while testing the new defaults separately.
      const renderer = new SigilDrawing.SpellDrawing({identityTickWidth:0.8, identityMarkerOpacity:1, ...settings});
      const context = canvas.getContext('2d');
      const {complete, spell} = window.eval(`(() => {
        const spell = readState();
        const complete = calculation.encode(spell);
        return {complete, spell};
      })()`);
      const visible = window.eval('SpellCalculation').applyRankComplexity(
        complete, spell, settings.rankComplexity ?? true);
      renderer.paintNotation(context, canvas.width, canvas.height, {complete, visible});
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const hash = await crypto.subtle.digest('SHA-256', pixels);
      result[name] = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return result;
  });
}

async function drawingContractTest(page) {
  const result = await page.evaluate(() => window.eval(`(() => {
    const complete = calculation.encode(currentSpell);
    const visible = SpellCalculation.applyRankComplexity(complete, currentSpell, true);
    const original = JSON.stringify({complete, visible});
    const drawing = new SigilDrawing.SpellDrawing();
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 320;
    const context = canvas.getContext('2d');
    drawing.paintNotation(context, 400, 320, {complete, visible});
    const filteredGeometry = drawing.getGeometry(400, 320, complete.identityBits, complete.edgeGroups);
    const reordered = {...visible, orbits:visible.orbits.map(({vertex,units,sweep}) =>
      ({sweep,units,vertex}))};
    drawing.paintNotation(context, 400, 320, {complete, visible:reordered});
    drawing.paintNotation(context, 400, 320, {complete, visible:complete});
    const completeGeometry = drawing.getGeometry(400, 320, complete.identityBits, complete.edgeGroups);
    return {
      unchanged: original === JSON.stringify({complete, visible}),
      geometryUnchanged: JSON.stringify(filteredGeometry) === JSON.stringify(completeGeometry)
    };
  })()`));
  assert.equal(result.unchanged, true, 'Drawing must not change its notation inputs');
  assert.equal(result.geometryUnchanged, true, 'Rank filtering must not change geometry fitting');
  const ornaments = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    return ['trait-fire', ...Object.keys(SigilConstants.THEME_PALETTES)
      .filter(design => !design.startsWith('trait-'))].map(design => {
      const drawing = new SigilDrawing.SpellDrawing({design});
      const paint = enabled => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawing.settings.cornerOrnaments = enabled;
        drawing.paintThemeBackdrop(ctx, 400, 320, {x:200, y:160}, 120);
        return ctx.getImageData(0, 0, 400, 320).data;
      };
      const on = paint(true), off = paint(false);
      let changed = 0, outsideCorners = 0;
      for (let i = 0; i < on.length; i += 4) {
        if (on.subarray(i, i + 4).some((value, channel) => value !== off[i + channel])) {
          changed++;
          const x = (i / 4) % 400, y = Math.floor(i / 4 / 400);
          if (!((x < 60 || x > 340) && (y < 60 || y > 260))) outsideCorners++;
        }
      }
      return {design, changed, outsideCorners};
    });
  });
  for (const result of ornaments) {
    assert(result.changed > 0, `${result.design} corner ornaments must toggle`);
    assert.equal(result.outsideCorners, 0, `${result.design}: only corner motifs should change`);
  }
  const opacity = await page.evaluate(() => window.eval(`(() => {
    const representation = calculation.represent(currentSpell, false);
    const original = JSON.stringify(representation);
    const context = document.createElement('canvas').getContext('2d');
    const drawing = new SigilDrawing.SpellDrawing();
    let strokes;
    drawing.strokeInk = (ctx, trace, seed) => {
      strokes.push({layer:seed >= 4000 ? 2 : seed >= 2000 ? 1 : 0, alpha:ctx.globalAlpha, width:ctx.lineWidth});
    };
    const paint = () => {
      strokes = [];
      drawing.paintNotation(context, 400, 320, representation);
      return strokes;
    };
    const defaults = paint().filter(stroke => stroke.layer === 2);
    drawing.settings.identityMarkerOpacity = 1;
    const full = paint();
    const settings = ['edgeOpacity', 'orbitOpacity', 'identityMarkerOpacity'];
    const samples = settings.flatMap((setting, layer) => [0, 0.5, 1].map(value => {
      drawing.settings[setting] = value;
      const sample = {layer, value, strokes:paint()};
      drawing.settings[setting] = 1;
      return sample;
    }));
    return {defaults, full, samples, unchanged:original === JSON.stringify(representation)};
  })()`));
  assert.equal(opacity.unchanged, true, 'Layer opacity must not change notation');
  assert(opacity.defaults.length > 0);
  assert(opacity.defaults.every(stroke => Math.abs(stroke.width - 1) < 1e-6 &&
    Math.abs(stroke.alpha - 0.45) < 1e-6), 'Default ID lines must draw at 1 px and 0.45 opacity');
  assert.deepEqual([...new Set(opacity.full.map(stroke => stroke.layer))].sort(), [0, 1, 2]);
  for (const sample of opacity.samples) {
    assert.equal(sample.strokes.length, opacity.full.length);
    sample.strokes.forEach((stroke, index) => {
      const expected = opacity.full[index].alpha * (stroke.layer === sample.layer ? sample.value : 1);
      assert(Math.abs(stroke.alpha - expected) < 1e-6,
        'Each opacity must scale only its own layer, including at zero');
    });
  }
  await assert.rejects(() => page.evaluate(() => window.eval(`(() => {
    const complete = calculation.encode(currentSpell);
    const visible = {...complete, edgeGroups:complete.edgeGroups.slice(1)};
    new SigilDrawing.SpellDrawing().paintNotation(
      document.createElement('canvas').getContext('2d'), 400, 320, {complete, visible});
  })()`)), /matching edge groups/);
  await assert.rejects(() => page.evaluate(() => window.eval(`(() => {
    const complete = calculation.encode(currentSpell);
    const edgeGroups = complete.edgeGroups.map((group, index) =>
      index ? group : {...group, edges:[...group.edges, group.edges[0]]});
    const visible = {...complete, edgeGroups};
    new SigilDrawing.SpellDrawing().paintNotation(
      document.createElement('canvas').getContext('2d'), 400, 320, {complete, visible});
  })()`)), /Visible edges/);
  await assert.rejects(() => page.evaluate(() => window.eval(`(() => {
    const complete = calculation.encode(currentSpell);
    const visible = {...complete, orbits:[complete.orbits[0], complete.orbits[0]]};
    new SigilDrawing.SpellDrawing().paintNotation(
      document.createElement('canvas').getContext('2d'), 400, 320, {complete, visible});
  })()`)), /Visible orbits/);
}

async function themeTest(page) {
  const results = await page.evaluate(() => {
    const representation = window.eval('calculation.represent(currentSpell, true)');
    const original = JSON.stringify(representation);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const themes = Object.keys(SigilConstants.THEME_PALETTES).map(design => {
      const drawing = new SigilDrawing.SpellDrawing({design, decorationSeed:123});
      const paint = () => {
        drawing.paintNotation(ctx, 400, 320, representation);
        return canvas.toDataURL();
      };
      const first = paint();
      const repeated = paint();
      drawing.settings.decorations = true;
      const decorated = paint();
      const repeatedDecorations = paint();
      drawing.settings.decorationSeed++;
      const reseeded = paint();
      return {
        design, first, deterministic:first === repeated && decorated === repeatedDecorations,
        decorations:decorated !== first && decorated !== reseeded,
        geometry:drawing.getGeometry(400, 320, representation.complete.identityBits, representation.complete.edgeGroups)
      };
    });
    const drawing = new SigilDrawing.SpellDrawing({design:'tattoo'});
    const paint = transparentBackground => {
      drawing.paintNotation(ctx, 400, 320, representation, {transparentBackground});
      return canvas.toDataURL();
    };
    const skin = paint(false), transparent = paint(true);
    const pixels = ctx.getImageData(0, 0, 400, 320).data;
    let transparentPixels = 0, darkInk = 0, coloredInk = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) transparentPixels++;
      if (pixels[i + 3] > 220) {
        if (Math.max(...pixels.subarray(i, i + 3)) < 45) darkInk++;
        if (Math.max(...pixels.subarray(i, i + 3)) - Math.min(...pixels.subarray(i, i + 3)) > 5) coloredInk++;
      }
    }
    drawing.settings.themeColors = {...SigilConstants.THEME_PALETTES.tattoo, background:'#ad7960'};
    drawing.settings.decorations = true;
    drawing.settings.cornerOrnaments = false;
    const customSkin = paint(false), customTransparent = paint(true);
    const card = SpellCard.render(drawing, representation, window.eval('readCardData()'));
    return {
      themes, unchanged:original === JSON.stringify(representation),
      tattoo:{
        customSkin:skin !== customSkin, transparentUnchanged:transparent === customTransparent,
        transparentPixels, darkInk, coloredInk, cardWidth:card.width, cardHeight:card.height
      }
    };
  });
  assert.equal(results.unchanged, true, 'Themes must not mutate spell notation');
  assert.equal(new Set(results.themes.map(theme => theme.first)).size, results.themes.length,
    'Each base theme and trait palette must produce a distinct preview');
  for (const theme of results.themes) {
    assert(theme.deterministic, `${theme.design} must redraw deterministically`);
    assert(theme.decorations, `${theme.design} decorations must toggle and respond to their seed`);
    assert.deepEqual(theme.geometry, results.themes[0].geometry, `${theme.design} must preserve geometry`);
  }
  assert(results.tattoo.customSkin, 'Tattoo skin color must be customizable');
  assert(results.tattoo.transparentUnchanged, 'Transparent Tattoo must exclude skin and ornaments');
  assert(results.tattoo.transparentPixels > 400 * 320 * .8);
  assert(results.tattoo.darkInk > 100, 'Tattoo must retain dark blackwork without a glow');
  assert.equal(results.tattoo.coloredInk, 0);
  assert.equal(results.tattoo.cardWidth, 1240);
  assert(results.tattoo.cardHeight > 0);
}

async function ornamentAndInkScopeTest(page) {
  const result = await page.evaluate(() => {
    const representation = window.eval('calculation.represent(currentSpell, false)');
    const original = JSON.stringify(representation);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const render = (settings, visible = representation.visible, transparentBackground = false) => {
      const drawing = new SigilDrawing.SpellDrawing(settings);
      drawing.paintNotation(ctx, 400, 320, {...representation, visible}, {transparentBackground});
      return canvas.toDataURL();
    };
    const themes = Object.keys(SigilConstants.THEME_PALETTES).map(design => {
      const settings = {design, cornerOrnaments:false};
      const decorated = render(settings);
      const undecorated = render({...settings, backgroundOrnaments:false});
      const base = new SigilDrawing.SpellDrawing(settings).baseTheme();
      return {
        design,
        expectedChange:!['plain', 'tattoo'].includes(base),
        changed:decorated !== undecorated,
        transparentUnchanged:render(settings, undefined, true) ===
          render({...settings, backgroundOrnaments:false}, undefined, true),
        cornersIndependent:render({...settings, backgroundOrnaments:false, cornerOrnaments:true}) !== undecorated,
        randomIndependent:render({...settings, backgroundOrnaments:false, decorations:true}) !== undecorated
      };
    });
    const {complete, visible} = representation;
    const layers = {
      edges:{...visible, orbits:[]},
      orbits:{...visible, edgeGroups:visible.edgeGroups.map(group => ({...group, edges:[]}))},
      fingerprint:{...visible, edgeGroups:visible.edgeGroups.map(group => ({...group, edges:[]})), orbits:[]}
    };
    const comparisons = [];
    for (const [layer, layerVisible] of Object.entries(layers)) {
      for (const shape of layer === 'fingerprint' ? ['line', 'dot', 'square', 'mixed'] : ['line']) {
        const settings = {
          design:'plain', identityTickShape:shape,
          edgeOpacity:layer === 'edges' ? 1 : 0,
          orbitOpacity:layer === 'orbits' ? 1 : 0,
          identityMarkerOpacity:layer === 'fingerprint' ? 1 : 0,
          handDrawnInk:true
        };
        const scoped = render(settings, layerVisible, true);
        const crisp = render({...settings, handDrawnInk:false}, layerVisible, true);
        const allInk = render({...settings, inkOnlyLayers1And2:false}, layerVisible, true);
        comparisons.push({layer, shape, matchesCrisp:scoped === crisp, matchesInk:scoped === allInk});
      }
    }
    const cardDrawing = new SigilDrawing.SpellDrawing({design:'arcane'});
    const cardData = window.eval('readCardData()');
    const cardBefore = SpellCard.render(cardDrawing, {complete, visible}, cardData).toDataURL();
    cardDrawing.settings.backgroundOrnaments = false;
    const cardAfter = SpellCard.render(cardDrawing, {complete, visible}, cardData).toDataURL();
    return {themes, comparisons, cardChanged:cardBefore !== cardAfter,
      notationUnchanged:JSON.stringify(representation) === original};
  });
  for (const theme of result.themes) {
    assert.equal(theme.changed, theme.expectedChange, `${theme.design}: toggle built-in details, not material`);
    assert(theme.transparentUnchanged, `${theme.design}: transparent export must ignore background ornaments`);
    assert(theme.cornersIndependent, `${theme.design}: corner ornaments remain independent`);
    assert(theme.randomIndependent, `${theme.design}: randomized decorations remain independent`);
  }
  for (const comparison of result.comparisons) {
    assert.equal(comparison.matchesCrisp, comparison.layer === 'fingerprint',
      `${comparison.layer}/${comparison.shape}: restrict ink to Layers 1 and 2 by default`);
    if (comparison.layer !== 'fingerprint') assert(comparison.matchesInk, 'Edges and orbits retain full ink treatment');
  }
  assert(result.cardChanged, 'Spell cards must honor the background ornament toggle');
  assert(result.notationUnchanged, 'Appearance toggles must not mutate notation');
}

async function pngDownload(page, button) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator(button).click();
  const download = await downloadPromise;
  assert.equal(await download.failure(), null);
  const bytes = fs.readFileSync(await download.path());
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const {pixels, transparentPixels, paintedPixels} = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = await crypto.subtle.digest('SHA-256', data);
    let transparentPixels = 0, paintedPixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparentPixels++;
      else paintedPixels++;
    }
    image.close();
    return {
      pixels:Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''),
      transparentPixels, paintedPixels
    };
  }, bytes.toString('base64'));
  return {
    name: download.suggestedFilename(),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    pixels, transparentPixels, paintedPixels
  };
}

async function selectTheme(page, design) {
  const group = design.startsWith('trait-') ? 'traits' :
    ['arcane', 'divine', 'occult', 'primal'].includes(design) ? 'traditions' : 'surfaces';
  await page.locator(`[data-theme-group="${group}"]`).click();
  await page.locator(`#themeChoices input[value="${design}"]`).check();
}

async function navigationTest(browser) {
  const context = await browser.newContext({
    offline:true, viewport:{width:1280, height:900}, reducedMotion:'reduce'
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href);
    assert.equal(await page.locator('#spellName').inputValue(), 'Scrying');
    assert.equal(await page.locator('#spellVariant').inputValue(), 'aon-1662');
    assert.equal(await page.locator('#spellTitle').textContent(), 'Scrying');
    assert.equal(await page.getByText('THE WORKBENCH', {exact:true}).count(), 0);
    const nav = page.getByRole('navigation', {name:'Editor sections'});
    assert.deepEqual(await nav.getByRole('button').allTextContents(), ['Spell', 'Style', 'Notation']);
    assert.deepEqual(await page.locator('.control-panel > section').evaluateAll(sections =>
      sections.map(section => section.id)), ['spellSection', 'designSection', 'notationSection']);
    assert.equal(await page.locator('#spellSection #spellCardDetails').count(), 1);
    assert.deepEqual(await page.locator('#designSection > details').evaluateAll(sections =>
      sections.map(section => [section.id, section.open])),
    [['visualOptionsSection', true], ['inkworkSection', true], ['transformsSection', false]]);
    for (const id of ['layer1Panel', 'moreAttributes', 'layer3Panel'])
      assert.equal(await page.locator(`#notationSection > #${id}`).count(), 1);
    assert.equal(await page.locator('.preview-toolbar #exportPng, .preview-toolbar #exportTransparentPng, .preview-toolbar #exportSpellCard').count(), 3);
    assert.equal(await page.locator('#themeChoices input').count(), 41);
    assert.equal(await page.locator('[role="tab"]').count(), 0);
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(new Set(ids).size, ids.length, 'IDs must remain unique');
    await page.evaluate(() => {
      window.navigationControls = [...document.querySelectorAll('.control-panel input[id], .control-panel select[id], .control-panel textarea[id]')];
    });

    for (const design of await page.locator('#designTheme option').evaluateAll(options => options.map(option => option.value))) {
      await selectTheme(page, design);
      assert.equal(await page.locator('#designTheme').inputValue(), design);
      assert.equal(await page.evaluate(() => window.eval('drawing.settings.design')), design);
    }
    await page.locator('#designTheme').selectOption('trait-fire', {force:true});
    assert.equal(await page.locator('#traitsCategory').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#themeChoices input[value="trait-fire"]').isChecked(), true);
    await selectTheme(page, 'plain');
    const plain = page.locator('#themeChoices input[value="plain"]');
    await plain.focus();
    await plain.press('ArrowRight');
    assert.equal(await page.locator('#designTheme').inputValue(), 'constellations');
    await page.locator('#colorLines').fill('#325c7f');
    await page.locator('#resetThemeColors').click();
    assert.equal(await page.locator('#colorLines').inputValue(), '#e4f4ff');
    await selectTheme(page, 'obsidian');

    assert.equal(await page.locator('#inkWobble').isDisabled(), true);
    assert.equal(await page.locator('#inkOnlyLayers1And2').isDisabled(), true);
    assert.equal(await page.locator('#inkOnlyLayers1And2').isChecked(), true);
    assert.equal(await page.locator('#inkWobble').inputValue(), '0.5');
    assert.equal(await page.locator('#inkWobbleValue').textContent(), '0.5 px');
    assert.equal(await page.evaluate(() => window.eval('drawing.settings.inkWobble')), 0.5);
    assert.equal(await page.locator('#inkPressure').inputValue(), '2');
    assert.equal(await page.locator('#inkPressureValue').textContent(), '200%');
    await page.locator('label[for="handDrawnInk"]').click();
    assert.equal(await page.locator('#inkWobble').isEnabled(), true);
    await page.locator('label[for="inkOnlyLayers1And2"]').click();
    assert.equal(await page.evaluate(() => window.eval('drawing.settings.inkOnlyLayers1And2')), false);
    await page.locator('label[for="handDrawnInk"]').click();
    assert.equal(await page.locator('#inkOnlyLayers1And2').isDisabled(), true);
    assert.equal(await page.locator('#inkOnlyLayers1And2').isChecked(), false);
    await page.locator('label[for="handDrawnInk"]').click();
    await page.locator('label[for="backgroundOrnaments"]').click();
    assert.equal(await page.evaluate(() => window.eval('drawing.settings.backgroundOrnaments')), false);
    await page.locator('#inkWobble').fill('1.4');
    assert.equal(await page.locator('#rerollDecorations').isDisabled(), true);
    await page.locator('label[for="decorations"]').click();
    const seed = await page.evaluate(() => window.eval('drawing.settings.decorationSeed'));
    const notation = await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)')));
    await page.locator('#rerollDecorations').click();
    assert.notEqual(await page.evaluate(() => window.eval('drawing.settings.decorationSeed')), seed);
    assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), notation);

    await page.locator('#transformsSection > summary').click();
    await page.locator('#rotation').fill('35');
    await page.locator('#stretch').fill('1.2');
    await page.locator('label[for="mirror"]').click();
    await page.locator('label[for="showGuides"]').click();
    await page.locator('#vertexLabelMode').selectOption('numbers');
    for (const id of ['layer1Panel', 'moreAttributes', 'layer3Panel']) {
      await page.locator(`#${id} > summary`).click();
    }
    await page.locator('#baseShape').selectOption('quadratic');
    assert.equal(await page.locator('#baseBend').isVisible(), true);
    await page.locator('#connectionStyle').selectOption('straight');
    assert.equal(await page.locator('#curvature').isVisible(), false);
    assert.equal(await page.locator('#arcSide').isVisible(), false);
    await page.locator('#connectionStyle').selectOption('curved');
    assert.equal(await page.locator('#curvature').isVisible(), true);
    await page.locator('#dotStyle').selectOption('none');
    assert.equal(await page.locator('#vertexSize').isDisabled(), true);
    await page.locator('#dotStyle').selectOption('diamond');
    await page.locator('#orbitWidth').fill('1.75');
    await page.locator('#identityTickShape').selectOption('mixed');
    for (const id of ['identityLineControls', 'identityDotControls', 'identitySquareControls'])
      assert.equal(await page.locator(`#${id}`).isVisible(), true);
    await page.locator('#identityDotFill').selectOption('outline');
    assert.equal(await page.locator('#identityPointStrokeWidth').isVisible(), true);
    await page.locator('#identityTickShape').selectOption('line');
    assert.equal(await page.locator('#identityPointStrokeWidth').isVisible(), false);
    await page.locator('#spellCardDetails summary').click();
    await page.locator('#cardTraits').fill('edited trait');
    await page.locator('#cardDescription').fill('Edited card description.');

    const snapshot = () => page.evaluate(() => ({
      values:window.navigationControls.map(control => [control.id, control.value, control.checked, control.disabled]),
      expanded:[...document.querySelectorAll('details')].map(element => [element.id, element.open]),
      settings:JSON.stringify(window.eval('drawing.settings')),
      notation:JSON.stringify(window.eval('calculation.encode(currentSpell)')),
      preview:document.getElementById('spellCanvas').toDataURL()
    }));
    const before = await snapshot();
    for (const name of ['Style', 'Notation', 'Spell']) {
      const link = nav.getByRole('button', {name, exact:true});
      await link.focus();
      await link.press('Enter');
      await page.waitForFunction(name =>
        document.querySelector('.jump-link[aria-current]')?.textContent === name, name);
      assert.equal(await page.evaluate(() => window.scrollY), 0, 'Desktop navigation must not scroll the page');
      assert.deepEqual(await snapshot(), before, 'Navigation must preserve all values, expansion, encoding and pixels');
      const target = await link.getAttribute('aria-controls');
      const position = await page.evaluate(id => ({
        heading:document.getElementById(id).getBoundingClientRect().top,
        nav:document.getElementById('editorNavigation').getBoundingClientRect().bottom
      }), target);
      assert(position.heading >= position.nav - 1,
        `${name} heading must clear the sticky navigation: ${JSON.stringify(position)}`);
    }
    await page.locator('#editorPanel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    await page.waitForFunction(() => document.querySelector('.jump-link[aria-current]')?.textContent === 'Notation');
    const stickyTop = await page.evaluate(() => {
      const panel = document.getElementById('editorPanel').getBoundingClientRect();
      const navigation = document.getElementById('editorNavigation');
      const nav = navigation.getBoundingClientRect();
      return {
        gap:nav.top - panel.top,
        covered:navigation.contains(document.elementFromPoint(nav.left + nav.width / 2, panel.top + 1))
      };
    });
    assert(Math.abs(stickyTop.gap) < 1, 'Sticky navigation must meet the top of the scrollable sidebar');
    assert(stickyTop.covered, 'Scrolled controls must not show through above the navigation');
    await page.locator('#editorPanel').evaluate(panel => { panel.scrollTop = 0; });
    await page.waitForFunction(() => document.querySelector('.jump-link[aria-current]')?.textContent === 'Spell');
    assert(await page.evaluate(() => window.navigationControls.every(control =>
      control.isConnected && document.getElementById(control.id) === control)), 'Controls must never be recreated');

    for (const width of [850, 390, 320]) {
      await page.setViewportSize({width, height:844});
      for (const name of ['Spell', 'Style', 'Notation']) {
        const link = nav.getByRole('button', {name, exact:true});
        await link.click();
        await page.waitForFunction(name =>
          document.querySelector('.jump-link[aria-current]')?.textContent === name, name);
        assert.equal(await page.locator('#editorPanel').evaluate(panel => panel.scrollTop), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const target = await link.getAttribute('aria-controls');
        assert(await page.evaluate(id =>
          document.getElementById(id).getBoundingClientRect().top >=
            document.getElementById('editorNavigation').getBoundingClientRect().bottom - 1, target),
        `${width}px mobile headings must clear the navigation`);
      }
      assert(await page.evaluate(() => window.scrollY > 0), 'Mobile navigation must scroll the page');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => document.querySelector('.jump-link[aria-current]')?.textContent === 'Spell');
    }
    const after = await snapshot();
    assert.deepEqual(after.values, before.values);
    assert.deepEqual(after.expanded, before.expanded);
    assert.equal(after.notation, before.notation);
    await page.setViewportSize({width:1280, height:900});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const name of ['Style', 'Notation', 'Spell']) {
      const link = nav.getByRole('button', {name, exact:true});
      await link.click();
      await page.waitForFunction(id => {
        const gap = document.getElementById(id).getBoundingClientRect().top -
          document.getElementById('editorNavigation').getBoundingClientRect().bottom;
        return gap >= 7 && gap <= 10;
      }, await link.getAttribute('aria-controls'));
      assert.equal(await link.getAttribute('aria-current'), 'location');
    }
    assert.deepEqual(errors, []);
    console.log('PASS - workbench navigation, all 41 theme radios, control retention, conditional controls and desktop/mobile scrolling.');
  } finally {
    await context.close();
  }
}

async function smokeTest(page) {
  assert.equal(await page.locator('#catalogCount').textContent(), '1,400 spells');
  // Catalogue capture explicitly selects Fireball for the historical pixel fixtures.
  assert.equal(await page.locator('#spellName').inputValue(), 'Fireball');

  const cornerOrnaments = page.locator('#cornerOrnaments');
  assert.equal(await cornerOrnaments.isChecked(), true);
  assert.equal(await page.locator('#backgroundOrnaments').isChecked(), true);
  assert.equal(await page.locator('#inkOnlyLayers1And2').isChecked(), true);
  const originalTheme = await page.locator('#designTheme').inputValue();
  await selectTheme(page, 'trait-fire');
  const decorated = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  const encoding = await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)')));
  await page.locator('label[for="cornerOrnaments"]').click();
  assert.equal(await page.evaluate(() => window.eval('drawing.settings.cornerOrnaments')), false);
  assert.notEqual(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), decorated);
  assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), encoding);
  assert.equal(await page.locator('#decorations').isChecked(), false);
  await page.locator('label[for="cornerOrnaments"]').click();
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), decorated);
  await selectTheme(page, originalTheme);
  await page.locator('#inkworkSection > summary').click();

  for (const layer of ['layer1Panel', 'moreAttributes', 'layer3Panel']) {
    const panel = page.locator(`#${layer}`);
    assert.equal(await panel.getAttribute('open'), null);
    assert.equal(await panel.locator('.layer-panel-body').isVisible(), false);
    await panel.locator(':scope > summary').click();
    assert.equal(await panel.locator('.layer-panel-body').isVisible(), true);
  }
  const visual = page.locator('#visualOptionsSection');
  const visualSummary = visual.locator(':scope > summary');
  const visualFields = ['connectionStyle', 'orbitWidth', 'orbitLineStyle', 'identityTickShape']
    .map(id => visual.locator(`#${id}`));
  assert.equal(await visualSummary.textContent(), 'VISUAL OPTIONS');
  assert.deepEqual(await visual.getByRole('heading', {includeHidden:true}).allTextContents(),
    ['LAYER 1. EDGES', 'LAYER 2. ORBITS', 'LAYER 3. SPELL FINGERPRINT']);
  for (const field of visualFields) assert.equal(await field.isVisible(), true);
  await visualSummary.click();
  for (const field of visualFields) assert.equal(await field.isVisible(), false);
  await visualSummary.click();
  for (const field of visualFields) assert.equal(await field.isVisible(), true);
  const layout = page.locator('#transformsSection');
  assert.equal(await layout.getAttribute('open'), null);
  assert.equal(await page.locator('#rotation').isVisible(), false);
  await layout.locator('summary').click();
  assert.equal(await layout.locator('summary').textContent(), 'LAYOUT & GUIDES');
  assert.equal(await page.locator('#rotation').isVisible(), true);
  await layout.locator('summary').click();
  assert.equal(await page.locator('#rotation').isVisible(), false);
  assert.equal(await page.locator('#identityTickWidth').inputValue(), '1');
  assert.equal(await page.locator('#identityMarkerOpacity').inputValue(), '0.45');
  assert.equal(await page.evaluate(() => Boolean(
    document.getElementById('polygonSides').compareDocumentPosition(document.getElementById('baseShape')) &
      Node.DOCUMENT_POSITION_FOLLOWING)), true, 'Polygon contour must precede base curve');
  for (const id of ['edgeOpacity', 'orbitOpacity', 'identityMarkerOpacity']) {
    const control = visual.locator(`#${id}`);
    assert.equal(await control.getAttribute('min'), '0');
    assert.equal(await control.getAttribute('max'), '1');
    const initial = await control.inputValue();
    const original = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
    for (const value of ['0', '0.5', '1', initial]) {
      await control.fill(value);
      assert.equal(await page.locator(`#${id}Value`).textContent(), value);
      assert.equal(await page.evaluate(id => window.eval('drawing').settings[id], id), Number(value));
      const image = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
      if (value === initial) assert.equal(image, original);
      else assert.notEqual(image, original);
    }
  }

  // Export pixel fixtures use the original marker settings, not the new defaults.
  await page.locator('#identityTickWidth').fill('0.8');
  await page.locator('#identityMarkerOpacity').fill('1');

  const picker = page.locator('#spellPickerInput');
  await picker.focus();
  await picker.fill('Fireball');
  await picker.press('Enter');
  assert.equal(await page.locator('#spellName').inputValue(), 'Fireball');
  assert.equal(await page.locator('#spellVariant').inputValue(), 'aon-1530');

  await page.locator('#creditsOpen').click();
  assert.equal(await page.locator('#creditsDialog').isVisible(), true);
  assert.equal(await page.locator('#creditsLead').textContent(), 'Sigil is a free, unofficial Pathfinder fan project.');
  const credits = page.locator('#creditsDialog');
  assert.match(await credits.locator('#legal-credits').textContent(), /inspired Sigil's notation/);
  assert.match(await credits.locator('a[download="LICENSE"]').getAttribute('href'), /^data:text\/plain;base64,/);
  assert.match(await credits.locator('a[download="ORC.pdf"]').getAttribute('href'), /^data:application\/pdf;base64,/);
  await page.locator('#creditsClose').click();
  assert.equal(await page.locator('#creditsDialog').isVisible(), false);
  await page.evaluate(() => {
    const dialog = document.getElementById('creditsDialog');
    dialog.showModal = undefined;
    dialog.close = undefined;
  });
  await page.locator('#creditsOpen').click();
  assert.equal(await page.locator('#creditsDialog').isVisible(), true);
  await page.locator('#creditsClose').click();
  assert.equal(await page.locator('#creditsDialog').isVisible(), false);

  const filteredPreview = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  assert.equal(await page.locator('#notationMeta, #notationModeBadge').count(), 0);
  await page.locator('label[for="rankComplexity"]').click();
  assert.equal(await page.locator('#rankComplexity').isChecked(), false);
  assert.match(await page.locator('#rankViewHint').textContent(), /All details in Edges and Orbits are visible/);
  assert.notEqual(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), filteredPreview);
  await page.locator('label[for="rankComplexity"]').click();
  assert.equal(await page.locator('#rankComplexity').isChecked(), true);
  assert.match(await page.locator('#rankViewHint').textContent(), /Turn off to show all details in Edges and Orbits/);
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), filteredPreview);

  const beforeOrbitStyle = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  const orbitWidth = page.locator('#orbitWidth');
  const originalOrbitWidth = await orbitWidth.inputValue();
  const orbitStyle = page.locator('#orbitLineStyle');
  const originalOrbitStyle = await orbitStyle.inputValue();
  await orbitWidth.evaluate(control => {
    control.value = '2';
    control.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await orbitStyle.selectOption('dashed');
  assert.deepEqual(await page.evaluate(() => window.eval(
    '[drawing.settings.orbitWidth, drawing.settings.orbitLineStyle]')), [2, 'dashed']);
  assert.notEqual(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), beforeOrbitStyle);
  await orbitWidth.evaluate((control, value) => {
    control.value = value;
    control.dispatchEvent(new Event('input', {bubbles:true}));
  }, originalOrbitWidth);
  await orbitStyle.selectOption(originalOrbitStyle);
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), beforeOrbitStyle);

  const beforeMode = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  const beforeEncoding = await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)')));
  await page.locator('#uiModeToggle').click();
  assert.equal(await page.locator('html').getAttribute('data-ui-mode'), 'light');
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), beforeMode);
  assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), beforeEncoding);

  await selectTheme(page, 'plain');
  assert.notEqual(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), beforeMode);
  assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), beforeEncoding);
  await page.locator('#colorLines').fill('#325c7f');
  assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), beforeEncoding);

  const sigil = await pngDownload(page, '#exportPng');
  assert.equal(sigil.name, 'fireball.png');
  assert.equal(sigil.width, 1800);
  assert.equal(sigil.height, 1500);
  assert.equal(sigil.transparentPixels, 0, 'Normal PNG must keep its background');
  const beforeTransparent = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  const transparent = await pngDownload(page, '#exportTransparentPng');
  assert.equal(transparent.name, 'fireball-transparent.png');
  assert.equal(transparent.width, 1800);
  assert.equal(transparent.height, 1500);
  assert(transparent.transparentPixels > 1800 * 1500 * 0.8, 'Transparent PNG must omit the background');
  assert(transparent.paintedPixels > 0, 'Transparent PNG must retain the sigil');
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), beforeTransparent,
    'Transparent export must not change the preview');
  assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), beforeEncoding);

  const beforeCardEdit = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  await page.locator('#spellCardDetails summary').click();
  await page.locator('#cardTraits').fill('custom trait');
  await page.locator('#cardDescription').fill('Custom card text');
  assert.equal(await page.evaluate(() => JSON.stringify(window.eval('calculation.encode(currentSpell)'))), beforeEncoding);
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), beforeCardEdit);

  const longest = await page.evaluate(() => window.eval(`catalogue.entries.reduce((a,b) =>
    b.description.length > a.description.length ? b : a)`));
  await picker.fill(longest.name);
  await page.locator(`#spellPickerList [data-spell-id=${JSON.stringify(longest.id)}]`).click();
  assert.equal(await page.locator('#spellName').inputValue(), longest.name);
  assert.equal(digest(await page.locator('#cardDescription').inputValue()),
    digest(longest.description.replace(/\r\n?/g, '\n')), 'Longest card description must be loaded');
  const cardLayout = await page.evaluate(() => window.eval(`(() => {
    const canvas = document.createElement('canvas');
    const spell = readCardData();
    const layout = SpellCard.layout(canvas.getContext('2d'), spell);
    return {
      height:layout.height,
      chips:layout.attributeChips.length,
      lines:layout.descriptionLines.map(line => line.text),
      actual:layout.descriptionLines.map(line => line.text).join(' ').replace(/\\s+/g,' ').trim(),
      expected:SpellCard.cleanDescription(spell.description).replace(/\\s+/g,' ').trim()
    };
  })()`));
  assert.equal(cardLayout.chips, 9);
  assert.equal(digest(cardLayout.actual), digest(cardLayout.expected),
    'Long card description must not be truncated');
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    window.baselineCardText = [];
    window.restoreCardText = () => { CanvasRenderingContext2D.prototype.fillText = original; };
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.width === 1240) window.baselineCardText.push(String(text));
      return original.call(this, text, ...args);
    };
  });
  const card = await pngDownload(page, '#exportSpellCard');
  const drawnText = await page.evaluate(() => {
    window.restoreCardText();
    return window.baselineCardText;
  });
  const expectedLines = digest(cardLayout.lines);
  assert(drawnText.some((_, index) =>
    digest(drawnText.slice(index, index + cardLayout.lines.length)) === expectedLines),
  'Card export must draw the complete description');
  assert.equal(card.width, 1240);
  assert.equal(card.height, cardLayout.height);

  await picker.fill('custom spell');
  await picker.press('Enter');
  const customId = await page.locator('#spellVariant').inputValue();
  assert(customId.startsWith('custom-'));
  await page.locator('#spellName').fill('My edited spell');
  assert.equal(await page.locator('#spellVariant').inputValue(), customId);
  assert.equal(await page.locator('#spellTitle').textContent(), 'My edited spell');

  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-ui-mode'), 'light');
  assert.equal(await page.locator('#spellName').inputValue(), 'Scrying');
  await selectTheme(page, 'plain');
  assert.equal(await page.locator('#colorLines').inputValue(), '#325c7f');

  await layout.locator('summary').click();
  await page.locator('#dotStyle').selectOption('diamond');
  await page.locator('#vertexSize').fill('1.5');
  await selectTheme(page, 'blueprint');
  await selectTheme(page, 'plain');
  assert.equal(await page.locator('#dotStyle').inputValue(), 'diamond');
  assert.equal(await page.locator('#vertexSize').inputValue(), '1.5');
  await page.locator('label[for="mirror"]').click();
  await page.locator('label[for="cornerOrnaments"]').click();
  await page.locator('label[for="handDrawnInk"]').click();
  await page.locator('#inkPressure').fill('1');
  await page.locator('#resetSpell').click();
  assert.equal(await page.locator('#designTheme').inputValue(), 'constellations');
  assert.equal(await page.locator('#spellName').inputValue(), 'Scrying');
  assert.equal(await page.locator('#spellVariant').inputValue(), 'aon-1662');
  assert.equal(await page.locator('#mirror').isChecked(), false);
  assert.equal(await page.locator('#inkWobble').inputValue(), '0.5');
  assert.equal(await page.evaluate(() => window.eval('drawing.settings.inkWobble')), 0.5);
  assert.equal(await page.locator('#inkPressure').inputValue(), '2');
  assert.equal(await page.locator('#inkPressureValue').textContent(), '200%');
  assert.equal(await page.evaluate(() => window.eval('drawing.settings.inkPressure')), 2);
  assert.equal(await page.locator('#identityTickWidth').inputValue(), '1');
  assert.equal(await page.locator('#identityMarkerOpacity').inputValue(), '0.45');
  assert.equal(await cornerOrnaments.isChecked(), true);
  await selectTheme(page, 'plain');
  assert.equal(await page.locator('#colorLines').inputValue(), '#325c7f');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.restoreToBlob = () => { HTMLCanvasElement.prototype.toBlob = original; };
    HTMLCanvasElement.prototype.toBlob = callback => callback(null);
  });
  for (const id of ['exportPng', 'exportTransparentPng']) {
    await page.evaluate(() => { document.getElementById('renderError').hidden = true; });
    await page.locator(`#${id}`).click();
    await page.waitForFunction(() => !document.getElementById('renderError').hidden);
    assert.match(await page.locator('#renderError').textContent(), /PNG creation failed/);
  }
  await page.evaluate(() => window.restoreToBlob());
  await selectTheme(page, 'tattoo');
  assert.match(await page.locator('#designDescription').textContent(), /blackwork/);
  assert.equal(await page.locator('#vertexSize').inputValue(), '0.5');
  const tattooPreview = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  await page.locator('#colorBackground').fill('#ad7960');
  assert.notEqual(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), tattooPreview);
  await selectTheme(page, 'plain');
  await selectTheme(page, 'tattoo');
  assert.equal(await page.locator('#colorBackground').inputValue(), '#ad7960');
  const tattoo = await pngDownload(page, '#exportTransparentPng');
  assert(tattoo.transparentPixels > tattoo.width * tattoo.height * .8);
  assert(tattoo.paintedPixels > 0);
  await page.locator('#resetSpell').click();
  assert.equal(await page.locator('#designTheme').inputValue(), 'constellations');
  return {sigil:sigil.pixels, card:card.pixels};
}

async function encodingDialogTest(page) {
  const preview = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  assert.equal(await page.locator('#layer1Panel > summary').textContent(), 'LAYER 1. EDGES');
  assert.equal(await page.locator('label[for="dotStyle"]').textContent(), 'Vertex style');
  const opener = page.getByRole('button', {name:'Explanation', exact:true});
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', {name:'Explanation', exact:true});
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true);
  assert.equal(await dialog.getByRole('heading', {name:'Explanation', exact:true}).count(), 0);
  assert.equal(await page.locator('#encodingClose').evaluate(element => element === document.activeElement), true);
  const embedded = await page.locator('#encodingFrame').getAttribute('srcdoc');
  assert.notEqual(embedded, null);
  assert.equal(digest(embedded.replace('<base href="about:srcdoc">', '')),
    digest(fs.readFileSync(path.join(root, 'docs/explanation.html'), 'utf8')),
    'Embedding must preserve the rendered documentation byte-for-byte');
  const guide = page.frameLocator('#encodingFrame');
  await guide.locator('mjx-container[display="true"]').first().waitFor();
  assert.equal(await guide.getByRole('heading', {name:'Explanation', exact:true}).count(), 1);
  assert.equal(await guide.getByRole('heading', {name:/^Verification\b/}).count(), 0);
  assert.equal(await guide.getByRole('heading', {name:/^Layer 1 - Edges\b/}).count(), 1);
  assert.equal(await guide.locator('mjx-container[display="true"]').count(), 7);
  assert.equal(await guide.locator('[data-mml-node="merror"], mjx-merror').count(), 0);
  assert.equal(await page.evaluate(() => typeof window.MathJax), 'undefined');
  assert.equal(await guide.locator('#fig-calculation-example img').evaluate(image =>
    image.complete && image.naturalWidth > 0), true);

  await guide.locator('#TOC a[href="#worked-example"]').click();
  assert.equal(await page.locator('#encodingFrame').evaluate(frame =>
    frame.contentWindow.location.hash), '#worked-example');
  await guide.locator('a.quarto-xref[href="#eq-vertex-count"]').first().click();
  assert.equal(await page.locator('#encodingFrame').evaluate(frame =>
    frame.contentWindow.location.hash), '#eq-vertex-count');
  const details = guide.locator('details');
  assert.equal(await details.evaluate(element => element.open), false);
  await details.locator('summary').click();
  assert.equal(await details.evaluate(element => element.open), true);
  assert.equal(await guide.locator('#worked-example-fingerprint').isVisible(), true);
  await page.emulateMedia({media:'print'});
  assert.equal(await guide.locator('#TOC').evaluate(element =>
    getComputedStyle(element).display), 'none');
  await page.emulateMedia({media:'screen'});
  await details.locator('summary').press('Escape');
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await opener.evaluate(element => element === document.activeElement), true);
  await opener.click();
  assert.equal(await dialog.isVisible(), true);
  await page.locator('#encodingClose').click();
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), preview);
}

async function replacementCatalogueTest(browser) {
  let replacement = 'invalid';
  const server = http.createServer((request, response) => {
    if (request.url === '/standalone.html') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      fs.createReadStream(path.join(root, 'standalone.html')).pipe(response);
    } else if (request.url === '/data/spell.json') {
      if (replacement === 'missing') return response.writeHead(404).end();
      response.setHeader('Content-Type', 'application/json');
      const entries = [{name:'Imported spell', id:'imported', rank:1}];
      if (replacement === 'mixed') entries.push({name:'Not a spell', type:'weapon'});
      response.end(replacement === 'invalid' ? '{' : JSON.stringify(entries));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const url = `http://127.0.0.1:${server.address().port}/standalone.html`;
      await page.goto(url);
      await page.locator('#catalogError').waitFor({state:'visible'});
      assert.match(await page.locator('#catalogError').textContent(), /using the bundled catalogue/);
      assert.equal(await page.locator('#catalogCount').textContent(), '1,400 spells');

      replacement = 'valid';
      await page.reload();
      await page.waitForFunction(() => document.getElementById('catalogCount').textContent === '1 spells');
      assert.equal(await page.locator('#spellName').inputValue(), 'Imported spell');
      assert.equal(await page.locator('#catalogError').isHidden(), true);

      replacement = 'mixed';
      await page.reload();
      await page.locator('#catalogError').waitFor({state:'visible'});
      assert.match(await page.locator('#catalogError').textContent(), /Skipped 1 invalid or non-spell record/);
      assert.equal(await page.locator('#spellName').inputValue(), 'Imported spell');

      replacement = 'missing';
      const response = page.waitForResponse(result => result.url().endsWith('/data/spell.json'));
      await page.reload();
      assert.equal((await response).status(), 404);
      assert.equal(await page.locator('#catalogCount').textContent(), '1,400 spells');
      assert.equal(await page.locator('#catalogError').isHidden(), true);
    } finally {
      await context.close();
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function unavailableStorageTest(browser) {
  const context = await browser.newContext({offline:true});
  try {
    const page = await context.newPage();
    const warnings = [];
    page.on('console', message => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Storage unavailable', 'SecurityError'); }
      });
    });
    await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href);
    assert.equal(await page.locator('#catalogCount').textContent(), '1,400 spells');
    await page.locator('#uiModeToggle').click();
    await page.locator('#colorLines').fill('#325c7f');
    for (const text of ['Unable to load interface mode', 'Unable to load theme colors',
      'Unable to save interface mode', 'Unable to save theme colors']) {
      assert(warnings.some(warning => warning.includes(text)), `Missing warning: ${text}`);
    }
  } finally {
    await context.close();
  }
}

async function pickerInteractionTest(page) {
  const input = page.locator('#spellPickerInput');
  const list = page.locator('#spellPickerList');
  const name = await page.locator('#spellName').inputValue();
  const preview = await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL());
  await input.focus();
  assert.equal(await list.locator('[role="option"]').count(), 1401,
    'Browsing must include every spell plus the custom option');
  await input.fill('sigil-no-matching-spell-987654321');
  assert.equal(await list.locator('[role="option"]').count(), 0);
  assert.equal(await input.getAttribute('aria-activedescendant'), null,
    'An empty result must not reference an option removed from the DOM');
  await input.press('ArrowDown');
  await input.press('Enter');
  assert.equal(await page.locator('#spellName').inputValue(), name);
  await input.press('Escape');
  assert.equal(await list.isHidden(), true);
  assert.equal(await input.inputValue(), name);
  await input.fill('fire');
  const options = list.locator('[role="option"]');
  assert(await options.count() > 1, 'Keyboard wrapping needs multiple results');
  const first = await options.first().getAttribute('id');
  const last = await options.last().getAttribute('id');
  await input.press('ArrowUp');
  assert.equal(await input.getAttribute('aria-activedescendant'), last);
  await input.press('ArrowDown');
  assert.equal(await input.getAttribute('aria-activedescendant'), first);
  await input.press('Tab');
  assert.equal(await list.isHidden(), true);
  assert.equal(await input.inputValue(), name);
  await input.focus();
  await page.locator('#spellCanvas').click({position:{x:10, y:10}});
  assert.equal(await list.isHidden(), true);
  assert.equal(await page.locator('#spellCanvas').evaluate(canvas => canvas.toDataURL()), preview,
    'Browsing, cancelling and empty results must not change the spell');
}

async function standaloneCatalogueTest(browser) {
  const file = path.join(root, 'standalone.html');
  const server = http.createServer((request, response) => {
    if (request.url !== '/standalone.html') return response.writeHead(404).end();
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const hosted = `http://127.0.0.1:${server.address().port}/standalone.html`;
  try {
    await checkPage(pathToFileURL(file).href, true);
    await checkPage(hosted, false);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log('PASS - the full standalone catalogue works over HTTP and offline, with card export and the guide.');

  async function checkPage(url, offline) {
    const context = await browser.newContext({offline, locale:'en-US'});
    try {
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/^https?:/.test(request.url())) requests.push(request.url());
      });
      await page.goto(url);
      assert.equal(await page.locator('#catalogCount').textContent(), '1,400 spells');
      assert.equal(await page.locator('#spellName').inputValue(), 'Scrying');
      await page.locator('#spellPickerInput').fill('Fireball');
      await page.locator('#spellPickerList [data-spell-id]').first().click();
      assert.equal(await page.locator('#spellName').inputValue(), 'Fireball');
      await pngDownload(page, '#exportSpellCard');
      await page.locator('#spellPickerInput').fill('custom spell');
      await page.locator('#spellPickerInput').press('Enter');
      assert.match(await page.locator('#spellVariant').inputValue(), /^custom-/);
      await page.locator('#encodingOpen').click();
      await page.frameLocator('#encodingFrame')
        .getByRole('heading', {name:'Explanation', exact:true}).waitFor();
      await page.frameLocator('#encodingFrame').locator('mjx-container[display="true"]').first().waitFor();
      await page.locator('#encodingClose').click();
      await page.locator('#creditsOpen').click();
      const legal = page.getByRole('region', {name:'Legal & Licenses'});
      const community = fs.readFileSync(path.join(root, 'licenses/COMMUNITY-USE.txt'), 'utf8');
      assert.equal(await legal.locator('.credits-policy-notice').textContent(), community.split(/\r?\n\r?\n/)[0]);
      assert.equal(await legal.getByRole('link', {name:'Dominik Falkner'}).isVisible(), true);
      for (const file of ['NOTICE.txt','COMMUNITY-USE.txt','OGL-1.0a.txt','ORC-LICENSE.txt','ORC-NOTICE.txt','ORC.pdf','THIRD-PARTY.txt']) {
        const href = await legal.locator(`a[download="${file}"]`).getAttribute('href');
        assert.match(href, /^data:(?:text\/plain|application\/pdf);base64,/);
        assert.deepEqual(Buffer.from(href.split(',')[1], 'base64'), fs.readFileSync(path.join(root, 'licenses', file)), file);
      }
      if (offline) {
        await legal.getByText('Project credits', {exact:true}).click();
        const preview = page.locator('#legal-credits');
        assert.equal(await preview.locator('a:not([href^="#"]):not([href^="https://"])').count(), 0);
        await preview.getByRole('link', {name:'third-party licenses'}).click();
        const thirdParty = legal.locator('#legal-third-party');
        await thirdParty.waitFor();
        const thirdPartySource = thirdParty.getByRole('link', {name:'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/LICENSE'});
        assert.equal(await thirdPartySource.getAttribute('target'), '_blank');
        await legal.getByText('Community Use policy references', {exact:true}).click();
        assert.equal(await legal.getByText(community.split(/\r?\n\r?\n/)[0], {exact:true}).count(), 1);
        assert.equal(await legal.locator('#legal-community').getByRole('link', {name:'https://paizo.com/licenses/communityuse', exact:true}).isVisible(), true);
        await legal.getByText('ORC notice and attributions', {exact:true}).click();
        const download = page.waitForEvent('download');
        await legal.getByRole('link', {name:'Download the ORC notice and attributions'}).click();
        const result = await download;
        assert.equal(result.suggestedFilename(), 'ORC-NOTICE.txt');
        assert.equal(await result.failure(), null);
      }
      assert.deepEqual(errors, [], 'The standalone app must load without browser errors');
      assert.deepEqual(requests, url === hosted ? [hosted] : [],
        'The standalone must not fetch an adjacent catalogue or require network assets');
    } finally {
      await context.close();
    }
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,
    args:['--disable-gpu']
  });
  try {
    await standaloneCatalogueTest(browser);
    await navigationTest(browser);
    const context = await browser.newContext({
      offline:true,
      viewport:{width:1280, height:900},
      deviceScaleFactor:1,
      locale:'en-US'
    });
    try {
      const page = await context.newPage();
      const errors = [];
      const networkRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
      });
      await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href);
      assert.equal(new URL(page.url()).protocol, 'file:');
      await encodingDialogTest(page);
      await pickerInteractionTest(page);
      const catalogue = await catalogueBaseline(page);
      const render = {
        platform:process.platform,
        arch:process.arch,
        browser:browser.version(),
        scenarios:await renderBaseline(page)
      };
      await drawingContractTest(page);
      await themeTest(page);
      await ornamentAndInkScopeTest(page);

      let expected;
      let matchingRenderEnvironment = true;
      if (!capture) {
        expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        assert.deepEqual(Object.keys(catalogue.records).sort(), Object.keys(expected.catalogue.records).sort(),
          'Catalogue variants changed');
        for (const [variant, hash] of Object.entries(catalogue.records)) {
          assert.equal(hash, expected.catalogue.records[variant], `Baseline changed for ${variant}`);
        }
        assert.equal(catalogue.order, expected.catalogue.order, 'Catalogue picker order changed');
        assert.equal(catalogue.options, expected.catalogue.options, 'Custom attribute options changed');
        matchingRenderEnvironment = render.platform === expected.render.platform &&
          render.arch === expected.render.arch && render.browser === expected.render.browser;
        if (matchingRenderEnvironment) {
          assert.deepEqual(render.scenarios, expected.render.scenarios, 'Rendering pixels changed');
        } else if (process.argv.includes('--require-render-baseline')) {
          throw new Error('Rendering baseline requires the documented controlled browser environment');
        } else {
          console.warn('Rendering pixel baselines skipped: use the documented controlled environment.');
        }
      }

      const exports = await smokeTest(page);
      if (expected && matchingRenderEnvironment) {
        assert.deepEqual(exports, expected.render.exports, 'Exported PNG pixels changed');
      }
      const mobileContext = await browser.newContext({
        offline:true,
        viewport:{width:390, height:844},
        deviceScaleFactor:1,
        locale:'en-US',
        isMobile:true,
        hasTouch:true
      });
      try {
        const mobile = await mobileContext.newPage();
        mobile.on('pageerror', error => errors.push(error.message));
        mobile.on('request', request => {
          if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
        });
        await mobile.goto(pathToFileURL(path.join(root, 'standalone.html')).href);
        assert(await mobile.locator('#spellCanvas').isVisible(), 'Canvas must remain visible on mobile');
        assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
          'Mobile layout must not overflow horizontally');
        await mobile.locator('#encodingOpen').tap();
        await mobile.frameLocator('#encodingFrame').locator('mjx-container[display="true"]').first().waitFor();
        assert.equal(await mobile.locator('#encodingDialog').evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth &&
            bounds.top >= 0 && bounds.bottom <= innerHeight;
        }), true, 'Documentation dialog must fit the mobile viewport');
        await mobile.locator('#encodingClose').tap();
        await mobile.locator('#spellPickerInput').fill('Light');
        await mobile.locator('#spellPickerList [data-spell-id="entry-aon-171"]').tap();
        assert.equal(await mobile.locator('#spellName').inputValue(), 'Light');
        await mobile.locator('#uiModeToggle').tap();
        assert.equal(await mobile.locator('html').getAttribute('data-ui-mode'), 'light');
      } finally {
        await mobileContext.close();
      }
      assert.deepEqual(networkRequests, [], 'Standalone use must not make network requests');
      assert.deepEqual(errors, [], 'Browser errors must not be ignored');
      await replacementCatalogueTest(browser);
      await unavailableStorageTest(browser);
      if (capture) {
        render.exports = exports;
        fs.writeFileSync(fixturePath, JSON.stringify({catalogue, render}, null, 2) + '\n');
        console.log(`Captured baseline for ${Object.keys(catalogue.records).length} spells.`);
      }
      console.log('PASS - offline catalogue and encoding guide, rendering, keyboard, mobile, preferences and PNG exports.');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
