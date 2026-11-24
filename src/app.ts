/* Sigil UI controller. */
'use strict';
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
type PickerOption = {
    id: string;
    label: string;
    meta: string;
};
declare const SigilCalculation: typeof import('./spell-calculation');
declare const SigilDrawing: typeof import('./spell-drawing');
declare const SigilCatalog: typeof import('./spell-catalog');
declare const SigilConstants: typeof import('./constants');
declare const SpellCard: typeof import('./spell-card');
declare const SigilDownload: typeof import('./download');
interface Window {
    DEFAULT_SPELL_CATALOG: unknown;
}
const { SPELL_ATTRIBUTES, CHORD_ATTRIBUTE_IDS, ORBIT_ATTRIBUTE_IDS,
    UI_MODE_STORAGE, COLOR_STORAGE, COLOR_IDS, COLOR_KEYS, DRAWING_CONTROLS,
    EDITOR_THEMES } = SigilConstants;
const { DESIGN_DESCRIPTIONS, DECORATION_DESCRIPTIONS, DESIGN_DEFAULTS } = EDITOR_THEMES;
const { SpellCalculation } = SigilCalculation;
const { SpellDrawing } = SigilDrawing;
const { SpellCatalog } = SigilCatalog;
const attributesFor = (attributes: UiAttribute[], ids: UiAttribute['id'][]) =>
    ids.map(id => attributes.find(attribute => attribute.id === id))
        .filter((attribute): attribute is UiAttribute => attribute !== undefined);
// Both editions use five chord attributes and four orbit attributes.
const fieldIDs = SPELL_ATTRIBUTES.map(attribute => attribute.id);
function $(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing UI element: ${id}`);
    return element;
}
function elementOf<T extends HTMLElement>(id: string, type: { new(): T }): T {
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
function dialog(id: string): HTMLElement & Partial<Pick<HTMLDialogElement, 'showModal' | 'close'>> {
    const element = $(id);
    if (element.tagName !== 'DIALOG')
        throw new TypeError(`Unexpected UI element type: ${id}`);
    return element;
}
function drawingControl(id: string): HTMLInputElement | HTMLSelectElement {
    const element = $(id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
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
    button('uiModeToggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
    button('uiModeToggle').setAttribute('title', `Switch to ${light ? 'dark' : 'light'} mode`);
    if (persist) {
        try {
            localStorage.setItem(UI_MODE_STORAGE, light ? 'light' : 'dark');
        }
        catch (error) {
            console.warn('Unable to save interface mode:', error);
        }
    }
}
let initialUiMode = 'dark';
try {
    initialUiMode = localStorage.getItem(UI_MODE_STORAGE) === 'light' ? 'light' : 'dark';
}
catch (error) {
    console.warn('Unable to load interface mode:', error);
}
setInterfaceMode(initialUiMode, false);
button('uiModeToggle').addEventListener('click', () => setInterfaceMode(document.documentElement.dataset.uiMode === 'light' ? 'dark' : 'light'));
const canvas = canvasElement('spellCanvas');
const calculation = new SpellCalculation(
    attributesFor(SPELL_ATTRIBUTES, CHORD_ATTRIBUTE_IDS), attributesFor(SPELL_ATTRIBUTES, ORBIT_ATTRIBUTE_IDS));
const drawing = new SpellDrawing();
let currentSpell: EditorSpell = {edition:'pf2e', name:'Untitled spell', variant:''};
let activeAttributes = SPELL_ATTRIBUTES;
let catalogue = SpellCatalog.parse(window.DEFAULT_SPELL_CATALOG);
let selectedEntry: SpellEntry | null = null;
let spellRows: {
    entry: SpellEntry;
    search: string;
}[] = [];
let pickerOpen = false;
let pickerOptions: PickerOption[] = [];
let pickerActive = -1;
// Search and browsing include every bundled record, across both editions.
// Themes change rendering only: the 5 main edge layers, 4 vertex-decoration layers, and the Layer 3 spell-ID ticks stay independent.
const FACTORY_COLORS = SpellDrawing.themePalettes;
function loadColors() {
    let saved: unknown = {};
    try {
        saved = JSON.parse(localStorage.getItem(COLOR_STORAGE) || '{}');
    }
    catch (error) {
        console.warn('Unable to load theme colors:', error);
    }
    const preferences: Record<string, ThemePalette> = {};
    for (const [theme, colors] of Object.entries(FACTORY_COLORS)) {
        const palette = { ...colors };
        const stored = saved && typeof saved === 'object' && theme in saved
            ? Reflect.get(saved, theme) : undefined;
        for (const key of COLOR_KEYS) {
            const value = stored && typeof stored === 'object' ? Reflect.get(stored, key) : undefined;
            if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
                palette[key] = value;
        }
        preferences[theme] = palette;
    }
    return preferences;
}
let colorPreferences = loadColors();
function refreshColorControls() {
    for (const key of COLOR_KEYS)
        input(COLOR_IDS[key]).value = colorPreferences[currentDesign][key];
}
function saveColors() {
    try {
        localStorage.setItem(COLOR_STORAGE, JSON.stringify(colorPreferences));
    }
    catch (error) {
        console.warn('Unable to save theme colors:', error);
    }
}
const initialDesign = select('designTheme').value;
const freshDesignPreferences = () => Object.fromEntries(Object.entries(DESIGN_DEFAULTS).map(([key, values]) => [key, { ...values }]));
let currentDesign = initialDesign;
let designPreferences = freshDesignPreferences();
// Read reset values from the initial form rather than duplicating them here.
// All of these controls affect Canvas presentation, never the binary notation.
const initialDrawingValues = Object.fromEntries(DRAWING_CONTROLS.map(id => {
    const control = drawingControl(id);
    return [id, control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control.value];
}));
function resetDrawingControls() {
    for (const [id, value] of Object.entries(initialDrawingValues)) {
        const control = drawingControl(id);
        if (control instanceof HTMLInputElement && control.type === 'checkbox' && typeof value === 'boolean')
            control.checked = value;
        else if (typeof value === 'string')
            control.value = value;
    }
}
function switchDesign(next: string) {
    if (!DESIGN_DEFAULTS[next])
        return;
    designPreferences[currentDesign] = {
        dotStyle: select('dotStyle').value, vertexSize: input('vertexSize').value,
        vertexStroke: input('vertexStroke').value, decorations: input('decorations').checked,
        decorationSeed: designPreferences[currentDesign].decorationSeed
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
    const attrs = SPELL_ATTRIBUTES.map(attribute => ({ ...attribute, options: attribute.options.map(o => ({ ...o })) }));
    const range = attrs.find(a => a.id === 'range');
    if (!range)
        throw new Error('Missing range attribute');
    const existing = new Set(range.options.map(opt => opt.value));
    const observed = [...new Set(entries.map(entry => entry.range))].filter(v => v && !existing.has(v));
    observed.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const capacity = SpellCalculation.uniqueNecklaces(SpellCalculation.nextPrime(2 * CHORD_ATTRIBUTE_IDS.length + 1)).length;
    // Refuse a catalogue we cannot faithfully represent instead of silently
    // falling back to "other" for arbitrary explicit range values.
    if (range.options.length + observed.length > capacity) {
        throw new Error(`Too many distinct ranges in library (max ${capacity - range.options.length} custom ranges).`);
    }
    for (const value of observed)
        range.options.push({ value, label: value });
    return attrs;
}
function selectValue(select: HTMLSelectElement, value: string) {
    if (Array.from(select.options).some(o => o.value === String(value))) {
        select.value = String(value);
    }
    else {
        select.value = Array.from(select.options).some(o => o.value === 'other') ? 'other' :
            Array.from(select.options).some(o => o.value === 'none') ? 'none' : select.options[0]?.value ?? '';
    }
}
function readState(): EditorSpell {
    const spell: EditorSpell = { edition: selectedEntry?.edition || 'both',
        name: input('spellName').value.trim() || 'Untitled spell', variant: input('spellVariant').value.trim() };
    for (const id of fieldIDs)
        spell[id] = select(id).value;
    return spell;
}
function paint(context: CanvasRenderingContext2D, width: number, height: number,
    representation = calculation.represent(currentSpell, drawing.settings.rankComplexity)) {
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
    $('renderError').textContent = error instanceof Error ? error.message : String(error);
    $('renderError').hidden = false;
}
function updateNotationInfo(visible: VisibleNotation = calculation.represent(currentSpell, drawing.settings.rankComplexity).visible) {
    // Count complete Layer 1 chords and Layer 2 orbits, including Rank connections.
    const filtered = visible.revealCount < visible.totalRevealable;
    $('notationMeta').hidden = !filtered;
    $('notationModeBadge').textContent = filtered
        ? `Visualization is filtered (${visible.revealCount}/${visible.totalRevealable} elements)` : '';
    const rankMeta = $('rankRevealBadge').parentElement;
    if (!rankMeta)
        throw new Error('Missing rank reveal container');
    rankMeta.hidden = !filtered;
    $('rankRevealBadge').textContent = filtered
        ? `${Math.round(visible.revealFraction * 100)}% optional detail` : '';
    $('rankRevealHelp').textContent = filtered
        ? `${visible.optionalVisible} of ${visible.optionalTotal} non-Rank elements shown.` : '';
    $('rankViewHint').textContent = filtered
        ? 'Turn off to show every chord and orbit. The ID stays complete.'
        : 'All chords and orbits are visible. The ID stays complete.';
}
function render() {
    const spell = readState();
    try {
        const representation = calculation.represent(spell, drawing.settings.rankComplexity);
        currentSpell = { ...spell };
        draw(representation);
        $('renderError').hidden = true;
        button('exportPng').disabled = false;
        button('exportTransparentPng').disabled = false;
        button('exportSpellCard').disabled = false;
        $('spellTitle').textContent = spell.name;
        updateNotationInfo(representation.visible);
    }
    catch (error) {
        showRenderError(error);
        button('exportPng').disabled = true;
        button('exportTransparentPng').disabled = true;
        button('exportSpellCard').disabled = true;
    }
}
function entryLabel(entry: SpellEntry) {
    const rank = entry.rank === 'cantrip' ? 'cantrip' : `rank ${entry.rank}`;
    return `${entry.name} | ${rank}${entry.source ? ' | ' + entry.source : ''}`;
}
/**
 * The spell library is one accessible combobox. Search is case-insensitive
 * across names, ranks, traditions, traits, and other catalogue fields.
 * Every matching record is present and scrollable; the catalogue is not truncated.
 */
function pickerSelectionLabel() {
    return selectedEntry?.name || '✦ Custom spell';
}
function closeSpellPicker() {
    pickerOpen = false;
    pickerOptions = [];
    pickerActive = -1;
    $('spellPickerList').hidden = true;
    input('spellPickerInput').setAttribute('aria-expanded', 'false');
    button('spellPickerToggle').setAttribute('aria-expanded', 'false');
    $('spellPickerList').replaceChildren();
    input('spellPickerInput').removeAttribute('aria-activedescendant');
    input('spellPickerInput').value = pickerSelectionLabel();
    $('spellPickerStatus').textContent = '';
}
function movePickerActive(index: number) {
    if (!pickerOptions.length)
        return;
    pickerActive = (index + pickerOptions.length) % pickerOptions.length;
    const items = $('spellPickerList').querySelectorAll('[role="option"]');
    items.forEach((item, i) => item.classList.toggle('is-active', i === pickerActive));
    const active = items[pickerActive];
    input('spellPickerInput').setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
}
function openSpellPicker(query = '', focusSelected = false) {
    pickerOpen = true;
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const matching = spellRows.filter(row => terms.every(term => row.search.includes(term)));
    const canChooseCustom = !terms.length || terms.every(term => 'custom spell'.includes(term));
    const visible = matching;
    pickerOptions = [...(canChooseCustom ? [{ id: 'custom', label: '✦ Custom spell', meta: 'New spell' }] : []),
        ...visible.map(row => ({ id: row.entry.id, label: row.entry.name,
            meta: `${row.entry.edition === 'both' ? 'Both editions' : row.entry.edition === 'legacy' ? 'Legacy' : 'Remaster'} | ${entryLabel(row.entry).split(' | ').slice(1).join(' | ')}` }))];
    const menu = $('spellPickerList');
    const fragment = document.createDocumentFragment();
    pickerOptions.forEach((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'spell-picker-option';
        item.id = `spell-picker-option-${index}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(selectedEntry ? selectedEntry.id === option.id : option.id === 'custom'));
        item.dataset.spellId = option.id;
        const name = document.createElement('span');
        name.textContent = option.label;
        const meta = document.createElement('span');
        meta.className = 'spell-option-meta';
        meta.textContent = option.meta;
        item.append(name, meta);
        fragment.appendChild(item);
    });
    if (!pickerOptions.length) {
        const empty = document.createElement('div');
        empty.className = 'spell-picker-empty';
        empty.textContent = 'No matching spells. Try a shorter search.';
        fragment.appendChild(empty);
    }
    menu.replaceChildren(fragment);
    menu.hidden = false;
    input('spellPickerInput').setAttribute('aria-expanded', 'true');
    button('spellPickerToggle').setAttribute('aria-expanded', 'true');
    $('spellPickerStatus').textContent = `${matching.length.toLocaleString()} match${matching.length === 1 ? '' : 'es'}`;
    let active = 0;
    if (focusSelected && selectedEntry) {
        const selectedId = selectedEntry.id;
        const selectedIndex = pickerOptions.findIndex(option => option.id === selectedId);
        if (selectedIndex >= 0)
            active = selectedIndex;
    }
    pickerActive = -1;
    if (pickerOptions.length)
        movePickerActive(active);
}
function pickSpellOption(id: string) {
    closeSpellPicker(); // Avoid rebuilding the menu during selection.
    if (id === 'custom')
        startCustomSpell();
    else
        chooseSpell(id);
}
function refreshSpellChoices() {
    const available = catalogue.entries;
    spellRows = available.map(entry => ({ entry, search: [entry.name, entry.rank,
            entry.rank === 'cantrip' ? 'cantrip' : `rank ${entry.rank}`,
            entry.source, entry.edition === 'both' ? 'both remaster legacy' : entry.edition,
            entry.category, entry.tradition, entry.damage, entry.range,
            ...(entry.traits || []), ...(entry.traditions || []), ...fieldIDs.map(id => entry[id])]
            .filter(Boolean).join(' ').toLocaleLowerCase() }));
    $('catalogCount').textContent = `${available.length.toLocaleString()} spells`;
    if (pickerOpen)
        openSpellPicker('');
    else
        input('spellPickerInput').value = pickerSelectionLabel();
}
function chooseSpell(id: string) {
    const entry = catalogue.entries.find(e => e.id === id);
    if (!entry)
        return false;
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
    if (window.crypto?.randomUUID)
        return `custom-${window.crypto.randomUUID()}`;
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
    input('spellPickerInput').value = pickerSelectionLabel();
    render();
}
/** Always load a single, stable attribute dictionary for the full catalogue. */
function loadAllSpells(keepSelection = false) {
    const oldEntry = keepSelection ? selectedEntry?.id : null;
    activeAttributes = attributesForDataset(catalogue.entries);
    for (const attribute of activeAttributes)
        replaceOptions(select(attribute.id), attribute.options);
    calculation.setChordAttributes(attributesFor(activeAttributes, CHORD_ATTRIBUTE_IDS));
    calculation.setOrbitAttributes(attributesFor(activeAttributes, ORBIT_ATTRIBUTE_IDS));
    const preferred = catalogue.entries.find(entry => entry.id === oldEntry) ||
        catalogue.entries.find(entry => entry.name.toLowerCase() === 'fireball') || catalogue.entries[0];
    if (preferred)
        chooseSpell(preferred.id);
    else
        startCustomSpell();
}
function setCatalogue(parsed: ParsedCatalogue) {
    // Check capacity before changing the active library.
    attributesForDataset(parsed.entries);
    catalogue = parsed;
    loadAllSpells(true);
}
async function loadNeighborCatalog() {
    // The offline standalone already embeds all spells. On a web server, an
    // adjacent spell.json can replace it without affecting the editor's UI.
    if (location.protocol === 'file:')
        return;
    try {
        const response = await fetch('../data/spell.json', { cache: 'no-store' });
        if (response.status === 404)
            return;
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const parsed = SpellCatalog.parse(await response.json());
        setCatalogue(parsed);
        if (parsed.skipped) {
            $('catalogError').textContent = `Loaded the adjacent catalogue. Skipped ${parsed.skipped} invalid or non-spell ${parsed.skipped === 1 ? 'record' : 'records'}.`;
            $('catalogError').hidden = false;
            console.warn($('catalogError').textContent);
        }
        else {
            $('catalogError').hidden = true;
        }
    }
    catch (error) {
        console.error('Unable to load adjacent spell catalogue:', error);
        $('catalogError').textContent = `Could not load the adjacent spell catalogue; using the bundled catalogue. ${error instanceof Error ? error.message : String(error)}`;
        $('catalogError').hidden = false;
    }
}
function updateCanvasOptions() {
    const base = select('baseShape').value;
    const style = select('connectionStyle').value;
    $('baseBendRow').hidden = !['quadratic', 'cubic'].includes(base);
    $('baseBendValue').textContent = `${Math.round(Number(input('baseBend').value) * 100)}%`;
    $('vertexSizeValue').textContent = `${Math.round(Number(input('vertexSize').value) * 100)}%`;
    $('vertexStrokeValue').textContent = `${Number(input('vertexStroke').value)} px`;
    $('orbitWidthValue').textContent = `${Number(input('orbitWidth').value)} px`;
    $('identityTickWidthValue').textContent = `${Number(input('identityTickWidth').value)} px`;
    $('identityDotSizeValue').textContent = `${Number(input('identityDotSize').value)} px`;
    $('identitySquareSizeValue').textContent = `${Number(input('identitySquareSize').value)} px`;
    $('identityPointStrokeWidthValue').textContent = `${Number(input('identityPointStrokeWidth').value)} px`;
    for (const id of ['chordOpacity', 'orbitOpacity', 'identityMarkerOpacity'])
        $(`${id}Value`).textContent = input(id).value;
    $('inkWobbleValue').textContent = `${Number(input('inkWobble').value).toFixed(1)} px`;
    $('inkPressureValue').textContent = `${Math.round(Number(input('inkPressure').value) * 100)}%`;
    $('inkFeatherValue').textContent = `${Math.round(Number(input('inkFeather').value) * 100)}%`;
    for (const id of ['inkWobble', 'inkPressure', 'inkFeather'])
        input(id).disabled = !input('handDrawnInk').checked;
    $('handInkParameters').classList.toggle('is-off', !input('handDrawnInk').checked);
    const markerShape = select('identityTickShape').value;
    const lineVisible = markerShape === 'line' || markerShape === 'mixed';
    const dotVisible = markerShape === 'dot' || markerShape === 'mixed';
    const squareVisible = markerShape === 'square' || markerShape === 'mixed';
    $('identityLineControls').hidden = !lineVisible;
    $('identityDotControls').hidden = !dotVisible;
    $('identitySquareControls').hidden = !squareVisible;
    $('identityPointStrokeRow').hidden = !(dotVisible && select('identityDotFill').value === 'outline') &&
        !(squareVisible && select('identitySquareFill').value === 'outline');
    input('vertexSize').disabled = select('dotStyle').value === 'none';
    input('vertexStroke').disabled = select('dotStyle').value === 'none';
    $('curvatureRow').hidden = style !== 'curved';
    $('arcSideRow').hidden = style === 'straight';
    $('curvatureValue').textContent = `${Math.round(Number(input('curvature').value) * 100)}%`;
    $('rotationValue').textContent = `${input('rotation').value}°`;
    $('stretchValue').textContent = `${Math.round(Number(input('stretch').value) * 100)}%`;
    $('designDescription').textContent = DESIGN_DESCRIPTIONS[select('designTheme').value];
    $('decorationDescription').textContent = DECORATION_DESCRIPTIONS[select('designTheme').value];
    button('rerollDecorations').disabled = !input('decorations').checked;
    Object.assign(drawing.settings, {
        design: select('designTheme').value, decorations: input('decorations').checked,
        cornerOrnaments: input('cornerOrnaments').checked,
        themeColors: { ...colorPreferences[currentDesign] },
        decorationSeed: designPreferences[currentDesign].decorationSeed,
        handDrawnInk: input('handDrawnInk').checked,
        inkWobble: Number(input('inkWobble').value),
        inkPressure: Number(input('inkPressure').value),
        inkFeather: Number(input('inkFeather').value),
        style, base, polygonSides: select('polygonSides').value, baseBend: Number(input('baseBend').value),
        curvature: Number(input('curvature').value), arcSide: select('arcSide').value,
        dotStyle: select('dotStyle').value, vertexSize: Number(input('vertexSize').value),
        vertexStroke: Number(input('vertexStroke').value),
        chordOpacity: Number(input('chordOpacity').value),
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
        stretch: Number(input('stretch').value), mirror: input('mirror').checked,
        rankComplexity: input('rankComplexity').checked,
        guides: input('showGuides').checked, vertexLabels: select('vertexLabelMode').value, labels: false
    });
    draw();
    try {
        updateNotationInfo();
    }
    catch (_) { /* Invalid edit is reported in render(). */ }
}
const pickerInput = input('spellPickerInput');
pickerInput.addEventListener('focus', () => { pickerInput.select(); openSpellPicker('', true); });
pickerInput.addEventListener('input', () => openSpellPicker(pickerInput.value));
pickerInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!pickerOpen)
            openSpellPicker('', true);
        else
            movePickerActive(pickerActive + (event.key === 'ArrowDown' ? 1 : -1));
    }
    else if (event.key === 'Enter' && pickerOpen) {
        event.preventDefault();
        if (pickerActive >= 0)
            pickSpellOption(pickerOptions[pickerActive].id);
    }
    else if (event.key === 'Escape' && pickerOpen) {
        event.preventDefault();
        closeSpellPicker();
    }
    else if (event.key === 'Tab')
        closeSpellPicker();
});
button('spellPickerToggle').addEventListener('click', () => {
    if (pickerOpen)
        closeSpellPicker();
    else {
        pickerInput.focus();
        openSpellPicker('', true);
    }
});
$('spellPickerList').addEventListener('mousedown', event => event.preventDefault());
$('spellPickerList').addEventListener('click', event => {
    const item = event.target instanceof Element ? event.target.closest('[data-spell-id]') : null;
    if (item instanceof HTMLElement && item.dataset.spellId)
        pickSpellOption(item.dataset.spellId);
});
$('spellPicker').addEventListener('focusout', event => {
    if (!(event.relatedTarget instanceof Node) || !$('spellPicker').contains(event.relatedTarget))
        closeSpellPicker();
});
document.addEventListener('pointerdown', event => {
    if (pickerOpen && (!(event.target instanceof Node) || !$('spellPicker').contains(event.target)))
        closeSpellPicker();
});
[input('spellName'), input('spellVariant'), ...fieldIDs.map(select)].forEach(input => {
    const event = input.tagName === 'INPUT' ? 'input' : 'change';
    input.addEventListener(event, markCustom);
});
select('designTheme').addEventListener('change', () => switchDesign(select('designTheme').value));
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
    if (!input('decorations').checked)
        return;
    const old = designPreferences[currentDesign].decorationSeed;
    let value;
    if (window.crypto?.getRandomValues) {
        const bytes = new Uint32Array(1);
        window.crypto.getRandomValues(bytes);
        value = bytes[0] >>> 0;
    }
    else
        value = (Math.random() * 0x100000000) >>> 0;
    designPreferences[currentDesign].decorationSeed = value === old ? (value + 1) >>> 0 : value;
    updateCanvasOptions();
});
// Selects and checkboxes change once; sliders redraw while the thumb moves.
for (const id of DRAWING_CONTROLS) {
    const control = drawingControl(id);
    control.addEventListener(control.type === 'range' ? 'input' : 'change', updateCanvasOptions);
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
// Credits open locally; all external attribution and support links are optional.
const creditsDialog = dialog('creditsDialog');
button('creditsOpen').addEventListener('click', () => {
    if (typeof creditsDialog.showModal === 'function')
        creditsDialog.showModal();
    else
        creditsDialog.setAttribute('open', '');
});
button('creditsClose').addEventListener('click', () => {
    if (typeof creditsDialog.close === 'function')
        creditsDialog.close();
    else
        creditsDialog.removeAttribute('open');
});
creditsDialog.addEventListener('click', event => {
    if (event.target === creditsDialog && typeof creditsDialog.close === 'function')
        creditsDialog.close();
});
for (const id of ['exportPng', 'exportTransparentPng']) {
    button(id).addEventListener('click', async () => {
        try {
            const image = document.createElement('canvas');
            image.width = 1800;
            image.height = 1500;
            const context = image.getContext('2d');
            if (!context) throw new Error('PNG export needs Canvas 2D.');
            const transparentBackground = id === 'exportTransparentPng';
            const representation = calculation.represent(currentSpell, drawing.settings.rankComplexity);
            drawing.paintNotation(context, image.width, image.height, representation, {transparentBackground});
            const name = readState().name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'spell-circle';
            await SigilDownload.downloadPng(image, `${name}${transparentBackground ? '-transparent' : ''}.png`);
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
        traits: input('cardTraits').value.split(',').map(value => value.trim()).filter(Boolean),
        description: textarea('cardDescription').value,
        source: selectedEntry?.source || ''
    };
}
button('exportSpellCard').addEventListener('click', async () => {
    try {
        const representation = calculation.represent(currentSpell, drawing.settings.rankComplexity);
        const card = readCardData();
        const image = SpellCard.render(drawing, representation, card);
        const name = card.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'spell';
        await SigilDownload.downloadPng(image, `${name}-spell-card.png`);
    }
    catch (error) {
        showRenderError(error);
    }
});
refreshColorControls();
loadAllSpells();
updateCanvasOptions();
loadNeighborCatalog();
if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => draw()).observe(canvas);
}
else {
    window.addEventListener('resize', () => draw());
}
window.addEventListener('load', () => draw());
