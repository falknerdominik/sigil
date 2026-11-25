/* Sigil UI controller. */
'use strict';
import { SpellPicker } from './spell-picker';
import { isHexColor } from './color';
type SpellRepresentation = import('./spell-calculation').SpellRepresentation;
type VisibleNotation = import('./spell-calculation').VisibleNotation;
type SpellEntry = import('./spell-catalog').SpellEntry;
type ParsedCatalogue = import('./spell-catalog').ParsedCatalogue;
type ThemePalette = import('./spell-drawing').ThemePalette;
type EditorSpell = Record<string, string> & {
  edition: string;
  name: string;
  variant: string;
};
type Choice = import('./constants').Choice;
type UiAttribute = import('./constants').UiAttribute;
declare const SigilCalculation: typeof import('./spell-calculation');
declare const SigilDrawing: typeof import('./spell-drawing');
declare const SigilCatalog: typeof import('./spell-catalog');
declare const SigilConstants: typeof import('./constants');
declare const SpellCard: typeof import('./spell-card');
declare const SigilDownload: typeof import('./download');
export {};
declare global {
  interface Window {
    DEFAULT_SPELL_CATALOG: unknown;
    STANDALONE_SPELL_BUILD?: boolean;
  }
}
const {
  SPELL_ATTRIBUTES,
  EDGE_ATTRIBUTE_IDS,
  ORBIT_ATTRIBUTE_IDS,
  UI_MODE_STORAGE,
  COLOR_STORAGE,
  COLOR_IDS,
  COLOR_KEYS,
  DRAWING_CONTROLS,
  EDITOR_THEMES,
} = SigilConstants;
const { DESIGN_DESCRIPTIONS, DECORATION_DESCRIPTIONS, DESIGN_DEFAULTS } =
  EDITOR_THEMES;
const { SpellCalculation, SpellEncoding } = SigilCalculation;
const { SpellDrawing } = SigilDrawing;
const { SpellCatalog } = SigilCatalog;
const attributesFor = (attributes: UiAttribute[], ids: UiAttribute['id'][]) =>
  ids
    .map((id) => attributes.find((attribute) => attribute.id === id))
    .filter((attribute): attribute is UiAttribute => attribute !== undefined);
// Both editions use five edge attributes and four orbit attributes.
const fieldIDs = SPELL_ATTRIBUTES.map((attribute) => attribute.id);
function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element;
}
function elementOf<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const element = $(id);
  if (!(element instanceof type))
    throw new TypeError(`Unexpected UI element type: ${id}`);
  return element;
}
const input = (id: string) => elementOf(id, HTMLInputElement);
const select = (id: string) => elementOf(id, HTMLSelectElement);
const button = (id: string) => elementOf(id, HTMLButtonElement);
const textarea = (id: string) => elementOf(id, HTMLTextAreaElement);
const canvasElement = (id: string) => elementOf(id, HTMLCanvasElement);
const editorPanel = $('editorPanel');
const editorNavigation = $('editorNavigation');
const editorLinks = Array.from(
  editorNavigation.querySelectorAll<HTMLButtonElement>('[data-scroll-target]'),
);
const editorSections = editorLinks.map((link) =>
  $(link.dataset.scrollTarget || ''),
);
// Move the complete Style group once; existing inputs and listeners stay intact.
$('notationSection').before($('designSection'));
const mobileEditor = window.matchMedia('(max-width:850px)');
function setEditorSection(section: HTMLElement) {
  for (const [index, link] of editorLinks.entries()) {
    const active = editorSections[index] === section;
    link.classList.toggle('is-current', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
function updateEditorSection() {
  const marker = editorNavigation.getBoundingClientRect().bottom + 12;
  let active = editorSections[0];
  for (const section of editorSections) {
    if (section.getBoundingClientRect().top <= marker) active = section;
  }
  if (
    !mobileEditor.matches &&
    editorPanel.scrollTop > 0 &&
    editorPanel.scrollHeight -
      editorPanel.clientHeight -
      editorPanel.scrollTop <
      2
  )
    active = editorSections[editorSections.length - 1];
  setEditorSection(active);
}
let editorScrollFrame = 0;
function scheduleEditorSection() {
  cancelAnimationFrame(editorScrollFrame);
  editorScrollFrame = requestAnimationFrame(updateEditorSection);
}
for (const [index, link] of editorLinks.entries()) {
  link.addEventListener('click', () => {
    const section = editorSections[index];
    const offset = editorNavigation.offsetHeight + 8;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? 'instant'
      : 'smooth';
    setEditorSection(section);
    if (mobileEditor.matches)
      window.scrollTo({
        top: window.scrollY + section.getBoundingClientRect().top - offset,
        behavior,
      });
    else
      editorPanel.scrollTo({
        top:
          editorPanel.scrollTop +
          section.getBoundingClientRect().top -
          editorNavigation.getBoundingClientRect().top -
          offset,
        behavior,
      });
  });
}
editorPanel.addEventListener('scroll', scheduleEditorSection, {
  passive: true,
});
window.addEventListener('scroll', scheduleEditorSection, { passive: true });
window.addEventListener('resize', scheduleEditorSection);
editorPanel.addEventListener('toggle', scheduleEditorSection, true);
function dialog(
  id: string,
): HTMLElement & Partial<Pick<HTMLDialogElement, 'showModal' | 'close'>> {
  const element = $(id);
  if (element.tagName !== 'DIALOG')
    throw new TypeError(`Unexpected UI element type: ${id}`);
  return element;
}
function drawingControl(id: string): HTMLInputElement | HTMLSelectElement {
  const element = $(id);
  if (!(
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement
  )) {
    throw new TypeError(`Expected drawing control: ${id}`);
  }
  return element;
}
// UI appearance is independent of the sigil's visual theme and exports.
function setInterfaceMode(mode: string, persist = true) {
  const light = mode === 'light';
  document.documentElement.dataset.uiMode = light ? 'light' : 'dark';
  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (!(colorScheme instanceof HTMLMetaElement))
    throw new Error('Missing color-scheme metadata');
  colorScheme.content = light ? 'light' : 'dark';
  $('uiModeIcon').textContent = light ? '☾' : '☼';
  $('uiModeLabel').textContent = light ? 'Dark mode' : 'Light mode';
  button('uiModeToggle').setAttribute(
    'aria-label',
    `Switch to ${light ? 'dark' : 'light'} mode`,
  );
  button('uiModeToggle').setAttribute(
    'title',
    `Switch to ${light ? 'dark' : 'light'} mode`,
  );
  if (persist) {
    try {
      localStorage.setItem(UI_MODE_STORAGE, light ? 'light' : 'dark');
    } catch (error) {
      console.warn('Unable to save interface mode:', error);
    }
  }
}
let initialUiMode = 'dark';
try {
  initialUiMode =
    localStorage.getItem(UI_MODE_STORAGE) === 'light' ? 'light' : 'dark';
} catch (error) {
  console.warn('Unable to load interface mode:', error);
}
setInterfaceMode(initialUiMode, false);
button('uiModeToggle').addEventListener('click', () =>
  setInterfaceMode(
    document.documentElement.dataset.uiMode === 'light' ? 'dark' : 'light',
  ),
);
const canvas = canvasElement('spellCanvas');
const calculation = new SpellCalculation(
  attributesFor(SPELL_ATTRIBUTES, EDGE_ATTRIBUTE_IDS),
  attributesFor(SPELL_ATTRIBUTES, ORBIT_ATTRIBUTE_IDS),
);
const drawing = new SpellDrawing();
let currentSpell: EditorSpell = {
  edition: 'pf2e',
  name: 'Untitled spell',
  variant: '',
};
let activeAttributes = SPELL_ATTRIBUTES;
let catalogue = SpellCatalog.parse(window.DEFAULT_SPELL_CATALOG);
let selectedEntry: SpellEntry | null = null;
const spellPicker = new SpellPicker(
  {
    root: $('spellPicker'),
    input: input('spellPickerInput'),
    toggle: button('spellPickerToggle'),
    list: $('spellPickerList'),
    status: $('spellPickerStatus'),
  },
  fieldIDs,
  () => selectedEntry,
  (id) => {
    if (id === 'custom') startCustomSpell();
    else chooseSpell(id);
  },
);
function refreshSpellChoices() {
  $('catalogCount').textContent =
    `${catalogue.entries.length.toLocaleString()} spells`;
  spellPicker.refresh(catalogue.entries);
}
// Search and browsing include every bundled record, across both editions.
// Themes change rendering only: the 5 main edge layers, 4 vertex-decoration layers, and the Layer 3 spell-ID ticks stay independent.
const FACTORY_COLORS = SpellDrawing.themePalettes;
function loadColors() {
  let saved: unknown = {};
  try {
    saved = JSON.parse(localStorage.getItem(COLOR_STORAGE) || '{}');
  } catch (error) {
    console.warn('Unable to load theme colors:', error);
  }
  const preferences: Record<string, ThemePalette> = {};
  for (const [theme, colors] of Object.entries(FACTORY_COLORS)) {
    const palette = { ...colors };
    const stored =
      saved && typeof saved === 'object' && theme in saved
        ? Reflect.get(saved, theme)
        : undefined;
    for (const key of COLOR_KEYS) {
      const value =
        stored && typeof stored === 'object'
          ? Reflect.get(stored, key)
          : undefined;
      if (isHexColor(value)) palette[key] = value;
    }
    preferences[theme] = palette;
  }
  return preferences;
}
const colorPreferences = loadColors();
function refreshColorControls() {
  for (const key of COLOR_KEYS)
    input(COLOR_IDS[key]).value = colorPreferences[currentDesign][key];
  syncThemeSelector();
}
function saveColors() {
  try {
    localStorage.setItem(COLOR_STORAGE, JSON.stringify(colorPreferences));
  } catch (error) {
    console.warn('Unable to save theme colors:', error);
  }
}
const initialDesign = select('designTheme').value;
const freshDesignPreferences = () =>
  Object.fromEntries(
    Object.entries(DESIGN_DEFAULTS).map(([key, values]) => [
      key,
      { ...values },
    ]),
  );
let currentDesign = initialDesign;
let designPreferences = freshDesignPreferences();
const themeGroups = {
  surfaces: $('surfacesThemes'),
  traditions: $('traditionsThemes'),
  traits: $('traitsThemes'),
};
function themeGroupFor(option: HTMLOptionElement) {
  return option.value.startsWith('trait-')
    ? 'traits'
    : option.parentElement instanceof HTMLOptGroupElement
      ? 'traditions'
      : 'surfaces';
}
function showThemeGroup(group: keyof typeof themeGroups) {
  for (const [name, choices] of Object.entries(themeGroups)) {
    choices.hidden = name !== group;
    button(`${name}Category`).setAttribute(
      'aria-pressed',
      String(name === group),
    );
  }
}
const themeRadios = Array.from(select('designTheme').options).map((option) => {
  const group = themeGroupFor(option);
  const label = document.createElement('label');
  label.className = 'theme-choice';
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'visibleThemeChoice';
  radio.value = option.value;
  radio.setAttribute('aria-label', option.text);
  const swatch = document.createElement('span');
  swatch.className = 'theme-choice-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  swatch.style.setProperty(
    '--swatch-bg',
    FACTORY_COLORS[option.value].background,
  );
  swatch.style.setProperty('--swatch-line', FACTORY_COLORS[option.value].lines);
  const title = document.createElement('span');
  title.className = 'theme-choice-label';
  title.textContent = option.text.split(' - ')[0];
  label.append(radio, swatch, title);
  themeGroups[group].append(label);
  return radio;
});
function syncThemeSelector() {
  const source = select('designTheme');
  for (const radio of themeRadios) radio.checked = radio.value === source.value;
  showThemeGroup(themeGroupFor(source.selectedOptions[0]));
}
for (const group of ['surfaces', 'traditions', 'traits'] as const)
  button(`${group}Category`).addEventListener('click', () =>
    showThemeGroup(group),
  );
$('themeChoices').addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.checked) {
    const source = select('designTheme');
    source.value = event.target.value;
    source.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
// Read reset values from the initial form rather than duplicating them here.
// All of these controls affect Canvas presentation, never the binary notation.
const initialDrawingValues = Object.fromEntries(
  DRAWING_CONTROLS.map((id) => {
    const control = drawingControl(id);
    return [
      id,
      control instanceof HTMLInputElement && control.type === 'checkbox'
        ? control.checked
        : control.value,
    ];
  }),
);
function resetDrawingControls() {
  for (const [id, value] of Object.entries(initialDrawingValues)) {
    const control = drawingControl(id);
    if (
      control instanceof HTMLInputElement &&
      control.type === 'checkbox' &&
      typeof value === 'boolean'
    )
      control.checked = value;
    else if (typeof value === 'string') control.value = value;
  }
}
function switchDesign(next: string) {
  if (!DESIGN_DEFAULTS[next]) return;
  designPreferences[currentDesign] = {
    dotStyle: select('dotStyle').value,
    vertexSize: input('vertexSize').value,
    vertexStroke: input('vertexStroke').value,
    decorations: input('decorations').checked,
    decorationSeed: designPreferences[currentDesign].decorationSeed,
  };
  currentDesign = next;
  refreshColorControls();
  const preference = designPreferences[next];
  select('dotStyle').value = preference.dotStyle;
  input('vertexSize').value = preference.vertexSize;
  input('vertexStroke').value = preference.vertexStroke;
  input('decorations').checked = preference.decorations;
  updateCanvasOptions();
}
function replaceOptions(select: HTMLSelectElement, items: Choice[]) {
  select.replaceChildren();
  for (const item of items) {
    const option = document.createElement('option');
    option.value = String(item.value);
    option.textContent = String(item.label);
    select.appendChild(option);
  }
}
/** Extra range values are ordered once for the whole catalogue, not per
 * edition. A shared spell therefore keeps its range symbol after switching. */
function attributesForDataset(entries: SpellEntry[]): UiAttribute[] {
  const attrs = SPELL_ATTRIBUTES.map((attribute) => ({
    ...attribute,
    options: attribute.options.map((o) => ({ ...o })),
  }));
  const range = attrs.find((a) => a.id === 'range');
  if (!range) throw new Error('Missing range attribute');
  const existing = new Set(range.options.map((opt) => opt.value));
  const observed = [...new Set(entries.map((entry) => entry.range))].filter(
    (v) => v && !existing.has(v),
  );
  observed.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const capacity = SpellEncoding.uniqueNecklaces(
    SpellEncoding.nextPrime(2 * EDGE_ATTRIBUTE_IDS.length + 1),
  ).length;
  // Refuse a catalogue we cannot faithfully represent instead of silently
  // falling back to "other" for arbitrary explicit range values.
  if (range.options.length + observed.length > capacity) {
    throw new Error(
      `Too many distinct ranges in library (max ${capacity - range.options.length} custom ranges).`,
    );
  }
  for (const value of observed) range.options.push({ value, label: value });
  return attrs;
}
function selectValue(select: HTMLSelectElement, value: string) {
  if (Array.from(select.options).some((o) => o.value === String(value))) {
    select.value = String(value);
  } else {
    select.value = Array.from(select.options).some((o) => o.value === 'other')
      ? 'other'
      : Array.from(select.options).some((o) => o.value === 'none')
        ? 'none'
        : (select.options[0]?.value ?? '');
  }
}
function readState(): EditorSpell {
  const spell: EditorSpell = {
    edition: selectedEntry?.edition || 'both',
    name: input('spellName').value.trim() || 'Untitled spell',
    variant: input('spellVariant').value.trim(),
  };
  for (const id of fieldIDs) spell[id] = select(id).value;
  return spell;
}
function paint(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  representation = calculation.represent(
    currentSpell,
    drawing.settings.rankComplexity,
  ),
) {
  drawing.paintNotation(context, width, height, representation);
}
function draw(representation?: SpellRepresentation) {
  if (!canvas.isConnected) return;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const physicalWidth = Math.round(width * dpr);
  const physicalHeight = Math.round(height * dpr);
  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D Canvas is not available.');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(context, width, height, representation);
}
function showRenderError(error: unknown) {
  $('renderError').textContent =
    error instanceof Error ? error.message : String(error);
  $('renderError').hidden = false;
}
function updateNotationInfo(
  visible: VisibleNotation = calculation.represent(
    currentSpell,
    drawing.settings.rankComplexity,
  ).visible,
) {
  const filtered = visible.revealCount < visible.totalRevealable;
  const rankMeta = $('rankRevealBadge').parentElement;
  if (!rankMeta) throw new Error('Missing rank reveal container');
  rankMeta.hidden = !filtered;
  $('rankRevealBadge').textContent = filtered
    ? `${Math.round(visible.revealFraction * 100)}% optional detail`
    : '';
  $('rankRevealHelp').textContent = filtered
    ? `${visible.optionalVisible} of ${visible.optionalTotal} non-Rank elements shown.`
    : '';
  $('rankViewHint').textContent = filtered
    ? 'Turn off to show all details in Edges and Orbits. The ID stays complete.'
    : 'All details in Edges and Orbits are visible. The ID stays complete.';
}
function render() {
  const spell = readState();
  try {
    const representation = calculation.represent(
      spell,
      drawing.settings.rankComplexity,
    );
    currentSpell = { ...spell };
    draw(representation);
    $('renderError').hidden = true;
    button('exportPng').disabled = false;
    button('exportTransparentPng').disabled = false;
    button('exportSpellCard').disabled = false;
    $('spellTitle').textContent = spell.name;
    updateNotationInfo(representation.visible);
  } catch (error) {
    showRenderError(error);
    button('exportPng').disabled = true;
    button('exportTransparentPng').disabled = true;
    button('exportSpellCard').disabled = true;
  }
}
function chooseSpell(id: string) {
  const entry = catalogue.entries.find((e) => e.id === id);
  if (!entry) return false;
  selectedEntry = entry;
  input('spellName').value = entry.name;
  input('spellVariant').value = entry.variant;
  input('cardTraits').value = (entry.traits || []).join(', ');
  textarea('cardDescription').value = entry.description || '';
  for (const attr of activeAttributes)
    selectValue(select(attr.id), entry[attr.id]);
  refreshSpellChoices();
  render();
  return true;
}
function newCustomId() {
  // The ID is stable for this custom spell once generated; edits never reroll it.
  if (window.crypto?.randomUUID) return `custom-${window.crypto.randomUUID()}`;
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
function startCustomSpell() {
  selectedEntry = null;
  input('spellName').value = 'My spell';
  input('spellVariant').value = newCustomId();
  input('cardTraits').value = '';
  textarea('cardDescription').value = '';
  refreshSpellChoices();
  render();
}
function markCustom() {
  selectedEntry = null;
  spellPicker.refreshSelection();
  render();
}
/** Always load a single, stable attribute dictionary for the full catalogue. */
function loadAllSpells(keepSelection = false) {
  const oldEntry = keepSelection ? selectedEntry?.id : null;
  activeAttributes = attributesForDataset(catalogue.entries);
  for (const attribute of activeAttributes)
    replaceOptions(select(attribute.id), attribute.options);
  calculation.setEdgeAttributes(
    attributesFor(activeAttributes, EDGE_ATTRIBUTE_IDS),
  );
  calculation.setOrbitAttributes(
    attributesFor(activeAttributes, ORBIT_ATTRIBUTE_IDS),
  );
  const preferred =
    catalogue.entries.find((entry) => entry.id === oldEntry) ||
    catalogue.entries.find((entry) => entry.name.toLowerCase() === 'scrying') ||
    catalogue.entries[0];
  if (preferred) chooseSpell(preferred.id);
  else startCustomSpell();
}
function setCatalogue(parsed: ParsedCatalogue) {
  // Check capacity before changing the active library.
  attributesForDataset(parsed.entries);
  catalogue = parsed;
  loadAllSpells(true);
}
async function loadNeighborCatalog() {
  // Only HTTP development builds permit replacing the embedded catalogue automatically.
  if (window.STANDALONE_SPELL_BUILD || location.protocol === 'file:') return;
  try {
    const response = await fetch('../data/spell.json', { cache: 'no-store' });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = SpellCatalog.parse(await response.json());
    setCatalogue(parsed);
    if (parsed.skipped) {
      $('catalogError').textContent =
        `Loaded the adjacent catalogue. Skipped ${parsed.skipped} invalid or non-spell ${parsed.skipped === 1 ? 'record' : 'records'}.`;
      $('catalogError').hidden = false;
      console.warn($('catalogError').textContent);
    } else {
      $('catalogError').hidden = true;
    }
  } catch (error) {
    console.error('Unable to load adjacent spell catalogue:', error);
    $('catalogError').textContent =
      `Could not load the adjacent spell catalogue; using the bundled catalogue. ${error instanceof Error ? error.message : String(error)}`;
    $('catalogError').hidden = false;
  }
}
function updateCanvasOptions() {
  const base = select('baseShape').value;
  const style = select('connectionStyle').value;
  $('baseBendRow').hidden = !['quadratic', 'cubic'].includes(base);
  $('baseBendValue').textContent =
    `${Math.round(Number(input('baseBend').value) * 100)}%`;
  $('vertexSizeValue').textContent =
    `${Math.round(Number(input('vertexSize').value) * 100)}%`;
  $('vertexStrokeValue').textContent =
    `${Number(input('vertexStroke').value)} px`;
  $('orbitWidthValue').textContent = `${Number(input('orbitWidth').value)} px`;
  $('identityTickWidthValue').textContent =
    `${Number(input('identityTickWidth').value)} px`;
  $('identityDotSizeValue').textContent =
    `${Number(input('identityDotSize').value)} px`;
  $('identitySquareSizeValue').textContent =
    `${Number(input('identitySquareSize').value)} px`;
  $('identityPointStrokeWidthValue').textContent =
    `${Number(input('identityPointStrokeWidth').value)} px`;
  for (const id of ['edgeOpacity', 'orbitOpacity', 'identityMarkerOpacity'])
    $(`${id}Value`).textContent = input(id).value;
  $('inkWobbleValue').textContent =
    `${Number(input('inkWobble').value).toFixed(1)} px`;
  $('inkPressureValue').textContent =
    `${Math.round(Number(input('inkPressure').value) * 100)}%`;
  $('inkFeatherValue').textContent =
    `${Math.round(Number(input('inkFeather').value) * 100)}%`;
  for (const id of [
    'inkOnlyLayers1And2',
    'inkWobble',
    'inkPressure',
    'inkFeather',
  ])
    input(id).disabled = !input('handDrawnInk').checked;
  $('handInkParameters').classList.toggle(
    'is-off',
    !input('handDrawnInk').checked,
  );
  const markerShape = select('identityTickShape').value;
  const lineVisible = markerShape === 'line' || markerShape === 'mixed';
  const dotVisible = markerShape === 'dot' || markerShape === 'mixed';
  const squareVisible = markerShape === 'square' || markerShape === 'mixed';
  $('identityLineControls').hidden = !lineVisible;
  $('identityDotControls').hidden = !dotVisible;
  $('identitySquareControls').hidden = !squareVisible;
  $('identityPointStrokeRow').hidden =
    !(dotVisible && select('identityDotFill').value === 'outline') &&
    !(squareVisible && select('identitySquareFill').value === 'outline');
  input('vertexSize').disabled = select('dotStyle').value === 'none';
  input('vertexStroke').disabled = select('dotStyle').value === 'none';
  $('curvatureRow').hidden = style !== 'curved';
  $('arcSideRow').hidden = style === 'straight';
  $('curvatureValue').textContent =
    `${Math.round(Number(input('curvature').value) * 100)}%`;
  $('rotationValue').textContent = `${input('rotation').value}°`;
  $('stretchValue').textContent =
    `${Math.round(Number(input('stretch').value) * 100)}%`;
  $('designDescription').textContent =
    DESIGN_DESCRIPTIONS[select('designTheme').value];
  $('decorationDescription').textContent =
    DECORATION_DESCRIPTIONS[select('designTheme').value];
  $('decorationDescription').hidden = !$('decorationDescription').textContent;
  button('rerollDecorations').disabled = !input('decorations').checked;
  Object.assign(drawing.settings, {
    design: select('designTheme').value,
    decorations: input('decorations').checked,
    cornerOrnaments: input('cornerOrnaments').checked,
    backgroundOrnaments: input('backgroundOrnaments').checked,
    themeColors: { ...colorPreferences[currentDesign] },
    decorationSeed: designPreferences[currentDesign].decorationSeed,
    handDrawnInk: input('handDrawnInk').checked,
    inkOnlyLayers1And2: input('inkOnlyLayers1And2').checked,
    inkWobble: Number(input('inkWobble').value),
    inkPressure: Number(input('inkPressure').value),
    inkFeather: Number(input('inkFeather').value),
    style,
    base,
    polygonSides: select('polygonSides').value,
    baseBend: Number(input('baseBend').value),
    curvature: Number(input('curvature').value),
    arcSide: select('arcSide').value,
    dotStyle: select('dotStyle').value,
    vertexSize: Number(input('vertexSize').value),
    vertexStroke: Number(input('vertexStroke').value),
    edgeOpacity: Number(input('edgeOpacity').value),
    orbitOpacity: Number(input('orbitOpacity').value),
    orbitWidth: Number(input('orbitWidth').value),
    orbitLineStyle: select('orbitLineStyle').value,
    identityTickWidth: Number(input('identityTickWidth').value),
    identityTickShape: select('identityTickShape').value,
    identityTickLineStyle: select('identityTickLineStyle').value,
    identityDotSize: Number(input('identityDotSize').value),
    identityDotFill: select('identityDotFill').value,
    identitySquareSize: Number(input('identitySquareSize').value),
    identitySquareFill: select('identitySquareFill').value,
    identitySquareOrientation: select('identitySquareOrientation').value,
    identityPointStrokeWidth: Number(input('identityPointStrokeWidth').value),
    identityMarkerOpacity: Number(input('identityMarkerOpacity').value),
    rotation: Number(input('rotation').value),
    stretch: Number(input('stretch').value),
    mirror: input('mirror').checked,
    rankComplexity: input('rankComplexity').checked,
    guides: input('showGuides').checked,
    vertexLabels: select('vertexLabelMode').value,
    labels: false,
  });
  draw();
  try {
    updateNotationInfo();
  } catch {
    /* Invalid edit is reported in render(). */
  }
}
[input('spellName'), input('spellVariant'), ...fieldIDs.map(select)].forEach(
  (input) => {
    const event = input.tagName === 'INPUT' ? 'input' : 'change';
    input.addEventListener(event, markCustom);
  },
);
select('designTheme').addEventListener('change', () =>
  switchDesign(select('designTheme').value),
);
for (const key of COLOR_KEYS) {
  const control = input(COLOR_IDS[key]);
  control.addEventListener('input', () => {
    colorPreferences[currentDesign][key] = control.value;
    saveColors();
    updateCanvasOptions();
  });
}
button('resetThemeColors').addEventListener('click', () => {
  colorPreferences[currentDesign] = { ...FACTORY_COLORS[currentDesign] };
  refreshColorControls();
  saveColors();
  updateCanvasOptions();
});
input('decorations').addEventListener('change', updateCanvasOptions);
button('rerollDecorations').addEventListener('click', () => {
  if (!input('decorations').checked) return;
  const old = designPreferences[currentDesign].decorationSeed;
  let value;
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint32Array(1);
    window.crypto.getRandomValues(bytes);
    value = bytes[0] >>> 0;
  } else value = (Math.random() * 0x100000000) >>> 0;
  designPreferences[currentDesign].decorationSeed =
    value === old ? (value + 1) >>> 0 : value;
  updateCanvasOptions();
});
// Selects and checkboxes change once; sliders redraw while the thumb moves.
for (const id of DRAWING_CONTROLS) {
  const control = drawingControl(id);
  control.addEventListener(
    control.type === 'range' ? 'input' : 'change',
    updateCanvasOptions,
  );
}
button('resetSpell').addEventListener('click', () => {
  designPreferences = freshDesignPreferences();
  currentDesign = initialDesign;
  select('designTheme').value = currentDesign;
  input('decorations').checked = designPreferences[currentDesign].decorations;
  resetDrawingControls();
  // The main Reset restores the example and drawing defaults, but does not
  // delete saved color palettes. Each palette has its own explicit reset.
  refreshColorControls();
  updateCanvasOptions();
  loadAllSpells();
});
for (const name of ['credits', 'encoding']) {
  const panel = dialog(`${name}Dialog`);
  const opener = button(`${name}Open`);
  const close = () => {
    if (typeof panel.close === 'function') panel.close();
    else panel.removeAttribute('open');
    opener.focus();
  };
  const onEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  opener.addEventListener('click', () => {
    if (typeof panel.showModal === 'function') panel.showModal();
    else panel.setAttribute('open', '');
  });
  button(`${name}Close`).addEventListener('click', close);
  panel.addEventListener('keydown', onEscape);
  panel.addEventListener('click', (event) => {
    if (event.target === panel) close();
  });
  const frame = panel.querySelector('iframe');
  if (frame) {
    frame.addEventListener('load', () => {
      const content = frame.contentDocument;
      if (!content) throw new Error('Explanation must load a local document.');
      content.addEventListener('keydown', onEscape);
      for (const link of Array.from(
        content.querySelectorAll<HTMLAnchorElement>('a[href]'),
      )) {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#')) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      }
    });
  }
}
for (const id of ['exportPng', 'exportTransparentPng']) {
  button(id).addEventListener('click', async () => {
    try {
      const image = document.createElement('canvas');
      image.width = 1800;
      image.height = 1500;
      const context = image.getContext('2d');
      if (!context) throw new Error('PNG export needs Canvas 2D.');
      const transparentBackground = id === 'exportTransparentPng';
      const representation = calculation.represent(
        currentSpell,
        drawing.settings.rankComplexity,
      );
      drawing.paintNotation(
        context,
        image.width,
        image.height,
        representation,
        { transparentBackground },
      );
      const name =
        readState()
          .name.toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-') || 'spell-circle';
      await SigilDownload.downloadPng(
        image,
        `${name}${transparentBackground ? '-transparent' : ''}.png`,
      );
    } catch (error) {
      showRenderError(error);
    }
  });
}
// Card-only text is editable without changing the mechanical spell encoding.
function readCardData() {
  const spell = readState();
  return {
    ...spell, // Include all nine fields for readable attribute chips.
    actions: spell.castActions,
    rawAction: selectedEntry?.rawAction || '',
    traits: input('cardTraits')
      .value.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    description: textarea('cardDescription').value,
    source: selectedEntry?.source || '',
  };
}
button('exportSpellCard').addEventListener('click', async () => {
  try {
    const representation = calculation.represent(
      currentSpell,
      drawing.settings.rankComplexity,
    );
    const card = readCardData();
    const image = SpellCard.render(drawing, representation, card);
    const name =
      card.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'spell';
    await SigilDownload.downloadPng(image, `${name}-spell-card.png`);
  } catch (error) {
    showRenderError(error);
  }
});
refreshColorControls();
loadAllSpells();
updateCanvasOptions();
loadNeighborCatalog();
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => draw()).observe(canvas);
} else {
  window.addEventListener('resize', () => draw());
}
window.addEventListener('load', () => draw());
