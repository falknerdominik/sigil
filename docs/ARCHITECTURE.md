# Sigil architecture

## Current structure

Sigil is a browser application with no runtime dependencies. Application
logic is written in TypeScript. Build and test scripts remain JavaScript to
avoid a separate toolchain for development utilities. The entry point is
[`src/index.html`](../src/index.html); the generated
[`standalone.html`](../standalone.html) embeds the application, catalogue, and
rendered Sigil Encoding guide for direct offline use.

| Component | Current responsibility |
|---|---|
| [`data/spell.json`](../data/spell.json) | Bundled spell records and source information. |
| [`spell-catalog.ts`](../src/spell-catalog.ts) | Validates and normalizes catalogue records and assigns IDs. |
| [`constants.ts`](../src/constants.ts) | Defines ordered attributes, shared limits and theme configuration. |
| [`app.ts`](../src/app.ts) | Connects the HTML controls to editor state, the picker and the renderer. |
| [`spell-picker.ts`](../src/spell-picker.ts) | `SpellPicker` owns catalogue search, combobox state, keyboard interaction and picker listeners. Selection populates the editor through a callback. |
| [`spell-calculation.ts`](../src/spell-calculation.ts) | Browser-independent notation, identity and rank-visibility calculation. |
| [`spell-encoding.ts`](../src/spell-encoding.ts) | `SpellEncoding` class for prime sizing, rotations and binary-necklace dictionaries. |
| [`spell-drawing.ts`](../src/spell-drawing.ts) | Fits and draws complete/visible notation, delegating theme backgrounds and ink treatment. |
| [`theme-painter.ts`](../src/theme-painter.ts) | Stateless theme backgrounds, ornaments, seeded decorations and background recoloring. |
| [`ink-strokes.ts`](../src/ink-strokes.ts) | Functions for path sampling, nib pressure, dash splitting and feathered ink ribbons. |
| [`drawing-style.ts`](../src/drawing-style.ts) | Shared canvas types, drawing settings and numeric style normalization. |
| [`color.ts`](../src/color.ts) | Shared six-digit hex validation and RGB parsing; callers retain their own fallback policies. |
| [`spell-card.ts`](../src/spell-card.ts) | Lays out themed cards using the drawing class. |
| [`download.ts`](../src/download.ts) | Downloads a canvas as a PNG. |
| [`styles.css`](../src/styles.css) | Styles the editor interface. |

The current data flow is:

```text
spell.json -> embedded catalogue -> SpellCatalog -> app state
                                                       |
                          SpellCalculation -> complete / visible notation
                                                       |
                                      SpellDrawing -> preview / exports
```

### Where the layers are encoded

[`SpellCalculation.encode`](../src/spell-calculation.ts) assembles all three
layers using the ordered attribute lists in [`constants.ts`](../src/constants.ts):

| Layer | Encoding |
|---|---|
| 1 — Vertices (chords) | [`encode`](../src/spell-calculation.ts) uses `selectedVertices` to map each chord attribute's bits to vertex pairs, grouped as a `ChordGroup`. |
| 2 — Orbits | `encode` selects the orbit attributes' active vertices; [`combineOrbits`](../src/spell-calculation.ts) sums their weights into one `Orbit` per active vertex. |
| 3 — Spell Fingerprint (identity) | [`encodeIdentity`](../src/spell-calculation.ts) converts the source/variant ID to length-prefixed UTF-8 bits, not a hash of the spell contents. |

[`prepareAttributes`](../src/spell-calculation.ts) builds the value-to-bit
lookups using [`SpellEncoding`](../src/spell-encoding.ts). The class owns
the shared necklace cache and is re-exported by the calculation bundle for
browser and Node callers; no separate browser script is needed.
Its `preferredDictionary` orders patterns for relatively sparse drawings, not
for additional encoding capacity. The current eleven-vertex scheme favors four
active bits; the larger four-bit scheme favors evenly spaced bits. This is a
simple visual heuristic, not a demonstrated optimum for readability or crossings.
Uniqueness comes from the necklace dictionary itself. The preference order is
part of the option-to-bit mapping and must not change as cosmetic cleanup.
[`represent`](../src/spell-calculation.ts) returns the complete notation and
its rank-filtered view; [`paintNotation`](../src/spell-drawing.ts) draws them.

The drawing contract contains only:

- `complete`: `vertexCount`, `chords` (`ChordGroup[]`), `orbits` (`Orbit[]`)
  and `identityBits`.
- `visible`: rank-filtered `chords` and `orbits`, plus the counts and fraction
  displayed by the editor.

A `ChordGroup` retains its attribute ID, label, color, chord distance `k` and
vertex-pair `edges`. An `Orbit` contains its vertex, combined weight `units`
and angular `sweep`. Layer 2 weights 1, 2, 4 and 8 contribute 24, 48, 96 and
192 degrees; all four active bits at one vertex produce a complete circle.
For `k` orbit attributes, each unit is `2*pi/(2^k-1)` radians.
Prepared attribute lookups and intermediate bit words
stay inside calculation; no separate encoded orbit-attribute type is returned.
The visible view does not repeat the vertex count or identity bits.

In the standalone file the catalogue is embedded. When served over HTTP, the
app also attempts to load an adjacent `data/spell.json`. A missing file leaves
the bundled catalogue in place; invalid replacements are reported and the
bundled catalogue remains available. Skipped records are reported. Interface
mode and theme colors are stored locally when browser storage is available.

Source/variant IDs are unique within a catalogue, and picker IDs are derived
from them. Missing or colliding source IDs receive deterministic IDs based on
normalized spell data. Extra range options come from the active catalogue;
their order affects their encoded bits. See
[the calculation reference](explanation.qmd) for the formulas.

### Editor navigation

The sidebar has three scroll destinations: **Spell**, **Style**, and
**Notation**. Spell contains the picker, name and card details. Style contains
Appearance, Ink & Ornament, and Layout & Guides; Notation contains the three
independently collapsible layers. The complete Style group is reparented once
before Notation during controller setup, preserving its original controls.

The sticky workbench navigation uses buttons with `aria-current="location"`,
not tabs or routes. Above 850 px it scrolls the sidebar; at smaller widths it
scrolls the page. Destination offsets account for the sticky header. Scroll
events update the active button, and reduced-motion preferences disable smooth
scrolling. Navigation never recreates inputs or resets expanded panels.

Appearance radios are generated once from the existing `designTheme` options,
grouped as Surfaces (6), Traditions (4), and Traits (31). The hidden select keeps
its ID and remains the source of truth: radio changes dispatch its existing
change event, while theme changes and Reset synchronize the radios and category.
Category buttons only filter the visible choices; they do not select a theme.
All drawing, palette, catalogue and export logic is unchanged.

The picker owns its search index and transient open/active state. It reads the
selected catalogue entry from the controller and reports a selected ID through
a callback; it does not populate spell fields or calculate notation. The
controller's browser bundle includes this component and the shared color helper,
so no additional script tags or runtime dependencies are needed.
Empty search results clear the active-option reference rather than leaving an
ARIA reference to a removed option.

`SpellDrawing` keeps its existing painting entry points and static ink helpers
as delegates to the extracted functions. Theme and ink modules take explicit
settings rather than importing or inheriting from the drawing class.

## Build and verification

Install development dependencies with `npm ci`. Quarto CLI 1.11.9 is installed
by the devcontainer and CI using
[install-quarto.sh](../.devcontainer/install-quarto.sh); it is needed only at build
time. `npm run compile` type-checks
the calculation, drawing, catalogue and UI modules and generates JavaScript under
`src/generated/`. `npm run build` renders
[`explanation.qmd`](explanation.qmd) through `npm run build:docs`, then generates
[`data/spell-data.js`](../data/spell-data.js) and inlines scripts and CSS into
`standalone.html`. The guide is embedded in an iframe's `srcdoc` attribute,
isolating Quarto's styles and scripts from the application. Its embedded SVG
MathJax renderer needs no network access at runtime. A local base URL preserves
fragment navigation, and iframe keyboard events share the native dialog's Escape
handler. Edit source files, not generated outputs.
`npm run dev` compiles, renders the guide, and serves the project through the Node
development server; the source page loads the same generated guide by URL.
`npm test` compiles and runs the calculation, renderer, catalogue and card checks;
`npm run test:math` runs the calculation audit alone. `npm run test:browser`
rebuilds the standalone page and runs the offline browser checks. The other files under
`data/` contain analysis results and a historical control manifest, not runtime
inputs to this build.

The calculation guide's input table, numerical results, and fingerprint form the
canonical worked example read by the audit. After editing the guide, run
`npm run docs:example` to regenerate its annotated picture using Playwright
Chromium, then `npm run build:docs` to rebuild the self-contained HTML reference.
Rendering downloads the pinned MathJax library; `build` always renders before
bundling and fails if rendering fails or produces no HTML. The example is a
synthetic spell, not a published spell.

### Using calculation without a canvas

After `npm run compile`, run this example from the repository root:

```js
const { SpellCalculation } = require('./src/generated/spell-calculation.cjs');
const ids = ['rank', 'tradition', 'range', 'duration', 'effectTrait'];
const attributes = ids.map(id => ({id, options:[{value:'1', label:'1'}]}));
const spell = Object.fromEntries(ids.map(id => [id, '1']));
const calculation = new SpellCalculation(attributes);

try {
  const representation = calculation.represent(spell);
  console.log(representation.complete.vertexCount, representation.visible.revealCount);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
```

The TypeScript module exports the input and representation types. Unknown
attribute values and invalid identity payloads throw errors. The representation
contains both complete notation and a rank-filtered view.

### Drawing calculated notation

The drawing module does not calculate spell attributes. After `npm run compile`,
import `SpellDrawing` from `src/generated/spell-drawing.cjs` in Node, or use
`SigilDrawing.SpellDrawing` after loading the generated browser script.
Given a Canvas 2D context and a representation from `SpellCalculation`:

```js
const drawing = new SpellDrawing({design: 'plain'});
drawing.paintNotation(context, width, height, representation);
```

The renderer fits using complete notation and paints the visible subset. It
does not mutate the representation and throws if visible chord groups or
orbits are inconsistent with the complete geometry. Identity is supplied only
once and is never filtered. The caller handles the error and owns canvas creation and
downloads. The UI controller supplies the same notation and drawing options
for the preview, normal PNG, transparent PNG and spell-card exports.
Each layer's visual options include a 0–1 opacity multiplier; 0 hides its
encoded strokes and 1 preserves the theme's original opacity. Encoding and
geometry fitting are unaffected.
Layers 1–3, their visual options, Ink & Ornament and Layout & Guides are
collapsed initially. The latter two sections belong to Style.
Layer 3 defaults to 1 px line markers and a 0.45 opacity multiplier.
Style's Ink & Ornament section has a Corner ornaments toggle (on by
default), independent of randomized decorations. It controls the fixed corner
motifs in the preview, normal PNG and spell-card exports, leaving the background
and encoding intact. Transparent PNG excludes the backdrop and its ornaments
regardless of these toggles.
The Background ornaments toggle (on by default) separately controls built-in
engravings, frames, celestial curves and botanical margins. Theme gradients,
grain, grids and ambient textures remain; corner and randomized ornaments
retain their own switches. The same settings apply to previews and spell cards.
Only Layers 1 and 2, on by default, restricts feather-and-ink treatment to
vertex connections and orbit strokes. All Layer 3 marker shapes stay crisp.
Its checked state is retained while Feather & ink strokes is disabled.
Ten base themes supply distinct materials and marginal motifs; the 31 trait
presets still inherit their base theme. Texture and randomized ornament are
deterministic. Tattoo uses fine charcoal ink, nodes without opaque background
fills, and subtle skin grain; its skin tone uses the existing background
color control. Transparent PNG omits materials and ornaments.

### Browser baseline

Install development dependencies with `npm ci`, then install the pinned
browser with `npx playwright install --only-shell chromium`. Run `npm run test:browser`.
The tests open the generated standalone page using `file:` with networking
disabled and exercise the editor and exports. A loopback-only server checks
adjacent catalogue replacement and errors.

[`browser-baseline.json`](../src/tests/browser-baseline.json) records SHA-256
hashes for each spell's normalized record, search text, editor state, complete
notation and rank-filtered notation. It also hashes catalogue order and every
custom attribute option. Before hashing, object keys are sorted recursively, array order is
preserved, and the result is serialized as UTF-8 JSON. Descriptions are
covered by their record hash, not duplicated in the fixture. The test
reads the app's internal state. A test-only adapter reconstructs removed
diagnostic fields in the original fixture shape. It verifies the current
full-circle orbit scale before restoring historical sweep metadata for catalogue
hashing, preserving checks of the original bit mappings, chords, orbit units,
identity bits and visibility counts. Keep that adapter
out of the application and retain the same baseline when contracts change.

Five rendering cases (including Tattoo) and the normal sigil and spell-card PNG
downloads hash raw RGBA pixels, not PNG bytes. Separate checks cover transparent
export alpha, deterministic theme rendering, decoration seeds, skin colors and
unchanged notation and geometry across all base themes and trait presets.
Navigation checks cover all theme radios, keyboard interaction, retained control
nodes and state, conditional settings, and sidebar/page scrolling at desktop,
850 px, 390 px and 320 px widths.
The pixel baseline was captured on Debian 12, Linux arm64 with Playwright's Chromium 159.0.8154.6,
software rendering, `en-US` locale and device scale factor 1. Pixel checks
require the same browser and platform; differences in system fonts or graphics
libraries can also affect them. On another platform `npm run test:browser`
reports that pixel comparisons were skipped but still runs the other checks.
Use `npm run test:visual` to require the controlled environment and pixel checks.

To deliberately capture a new baseline after reviewing an intentional behavior
change, run `npm run build` followed by
`node src/tests/browser-test.js --capture` in that controlled environment.
Review the fixture changes; do not recapture merely to make a test pass.

Licensing and catalogue rights remain unresolved; see
[credits and licenses](CREDITS-AND-LICENSES.md).
