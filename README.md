# Sigil

**Create sigils for Pathfinder spells.** Sigil is a free, offline, unofficial Pathfinder 2e spell-sigil editor. Browse **1,400 bundled spells** from Legacy and Remaster, build a custom spell, and export its sigil or a themed spell card. No account or network connection is needed.

![Fireball sigil in the Constellations theme, with rank-based filtering enabled](docs/fireball-sigil.png)

*Example: Fireball with the Constellations theme and rank-filtered view. Generated directly from the offline app; not concept art.*

## Get started

1. Open **`standalone.html`** in a modern browser. All source data and styles are embedded.
2. Search or scroll **Find a spell**, or select **Custom spell**.
3. Expand the collapsed layer panels to adjust attributes and **Visual options**. Choose a theme and optional inkwork under **Theme**.
4. Use **Export PNG** to download the current sigil at 1800 × 1500 pixels, **Transparent PNG** for the same sigil without the theme background or ornaments, or **Export Spell Card** to include the spell's text and details.

The spell-card export uses the current theme across the whole card. It includes the sigil, name, nine mechanical attributes as labeled chips, the catalogue traits, and the full description. You can edit the card traits and description under **Spell card details** without changing the encoded sigil.

## What the layers mean

| Layer | Encodes | Appearance |
|---|---|---|
| **1 · Vertices** | Rank, Tradition, Range, Duration, Primary Trait | Connections using one of five chord distances per attribute |
| **2 · Orbits** | Damage, Area, Casting time, Casting traits | One partial circle around each active vertex, with an additive sweep angle |
| **3 · Spell Fingerprint** | Source/variant ID only | Binary markers (lines, dots, squares, or mixed) along the contour |

The spell fingerprint encodes the ID, not a hash of the spell's contents. Editing mechanics or card text does not change it unless the ID changes.

Sigil uses **11 encoding vertices**, five chord families, and four additional attributes represented by vertex-centered orbits. The **Filter details by rank** setting hides some non-Rank chords and complete orbits for lower-rank spells, but never changes their stored bits or the complete Layer 3 ID. Switch it off to see full notation; the preview displays a filter counter only while some geometry is hidden.

For the mathematics, worked examples and decoding caveats, read **[How Sigil Is Calculated](docs/HOW-IT-IS-CALCULATED.qmd)**. For the codebase structure and drawing contract, see [Architecture](docs/ARCHITECTURE.md).

## Customize the appearance

- **Theme:** 10 distinct styles and 31 Primary Trait presets, each with independent editable colors. Choose manuscript parchment, a celestial atlas, drafting paper, volcanic inlay, a specimen journal, an aether lattice, illuminated ivory, lunar ritual, a fern canopy, or Tattoo blackwork. Theme selection does not change the spell's mechanical traits.
- **Tattoo:** Fine charcoal ink on subtly textured skin. Use the Background color to adjust the skin tone; **Transparent PNG** exports just the sigil, without skin or ornaments.
- **Visual options (per layer):** Layer 1 contains polygon contours, base curves, connection styles, and vertex sizing; Layers 2 and 3 contain orbit and fingerprint marker styling. Each layer has an independent 0–1 opacity control. Fingerprint line markers default to 1 px and 0.45 opacity.
- **Theme → Inkwork & Ornament:** Optional feather-and-ink strokes, a directional nib-pressure taper from 0–250%, irregularity, and feathering. **Corner ornaments** start enabled; **Randomized decorations** start disabled. Reroll changes decorations without changing the spell.
- **Theme → Layout & Guides:** Rotation, horizontal stretch, mirroring, construction guides, and vertex annotations. This section and **Inkwork & Ornament** start collapsed, as do the layer panels and their **Visual options**.
- **Light / Dark:** Changes the editor interface only, never the canvas theme or exported artwork. The preference is saved locally when browser storage is available.

The original attribute controls and source IDs remain available, and the edition selector is intentionally absent: **the spell picker contains both editions**.

## Development and verification

Sigil runs in the browser without runtime dependencies. Install development tools with `npm ci`; application code uses TypeScript. See [Architecture](docs/ARCHITECTURE.md) for the source layout. Run `npm run build` after source changes; do not edit generated files directly.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Node.js development server at `http://localhost:4173` (serves `src/index.html`) |
| `npm run compile` | Type-check and compile the TypeScript modules |
| `npm run build` | Generate `data/spell-data.js` and the offline `standalone.html` using Node.js |
| `npm test` | Run renderer, catalogue, spell-card, and calculation audit tests |
| `npm run test:browser` | Rebuild and check the offline app; compare pixels on the baseline platform |
| `npm run test:visual` | Require the controlled platform and compare rendering and export pixels |
| `npm run test:math` | Check mathematical formulas and documented caveats |
| `npm run optimize` | Analyze categorical attribute sets with Node.js |

For browser tests, run `npm ci` and `npx playwright install --only-shell chromium` first.
The pixel baseline requires the controlled environment described in
[Architecture](docs/ARCHITECTURE.md); the app itself still needs no runtime dependencies.

Source provenance is recorded in [`SPELL-SOURCES.md`](docs/SPELL-SOURCES.md) and [`CREDITS-AND-LICENSES.md`](docs/CREDITS-AND-LICENSES.md).

**Licensing note:** Sigil's source code is included, but **no standalone software license has yet been selected for it**; publishing the source does not by itself grant open-source redistribution rights. Pathfinder materials and the original guide have separate rights. Review the source-specific notices before distributing the bundled spell texts.

## Copyright and attribution

**Pathfinder spell names, rules text, and descriptions © Paizo Inc. and other applicable rightsholders.** Pathfinder is a trademark of Paizo Inc.

> Sigil uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse). We are expressly prohibited from charging you to use or access this content. Sigil is not published, endorsed, or specifically approved by Paizo. For more information about Paizo Inc. and Paizo products, visit [paizo.com](https://paizo.com).

The underlying spell-writing idea is credited to **The Gorilla of Destiny**, author of [*The Spell Writing Guide*](https://www.gorillaofdestiny.com/books-and-compendiums) and the [SpellWriting project](https://github.com/GorillaOfDestiny/SpellWriting). Sigil is not affiliated with or endorsed by the original guide's author.

Sigil is free to use; donations through [Buy me a coffee](https://www.buymeacoffee.com/dominikfalkner) are optional. See [`CREDITS-AND-LICENSES.md`](docs/CREDITS-AND-LICENSES.md) for additional copyright and licensing details.

