# Sigil

Offline Pathfinder 2e spell-sigil editor built with TypeScript and Canvas 2D.
Includes 1,400 spells, custom spell editing, and PNG, transparent PNG, and
spell-card exports. No runtime dependencies or network connection are required.

Open [standalone.html](standalone.html) in a browser. See
[Sigil Encoding](docs/explanation.qmd) for the notation, mathematics, and worked
examples ([rendered HTML](docs/explanation.html)).

![Fireball sigil in the Constellations theme](docs/fireball-sigil.png)

## Development and verification

Use Node.js 22 (22.13 or newer) or 24+.

```sh
npm ci
npm run dev
```

The development server runs at http://localhost:4173. Before submitting changes:

```sh
npm run format
npm run check
npm run build
```

`check` runs type checking, ESLint, Prettier verification, and automated tests.
`build` regenerates the embedded catalogue and standalone application; do not
edit generated files directly.

For browser tests, install Chromium with
`npx playwright install --only-shell chromium`, then run `npm run test:browser`.
See [Architecture](docs/ARCHITECTURE.md) for module contracts, controlled pixel
tests, and documentation-build instructions.

For GitHub Pages, select GitHub Actions as the publishing source. The
[workflow](.github/workflows/pages.yml) verifies, builds, and deploys `main`.

## AI use

Implementation was AI-assisted, primarily using GPT-6.1 Sol and DeepSeek V4,
especially for drawing code and HTML. The concept, mathematics, and notation
extensions are human-designed. Notation-generation code was written manually
and/or reviewed by humans.

## Copyright and attribution

Pathfinder content © Paizo Inc. and other credited rightsholders. Sigil is
unofficial and is not endorsed by Paizo or The Gorilla of Destiny, whose
Spell Writing Guide inspired the notation. Code licensing and catalogue
redistribution rights remain unresolved. See
[Credits and licenses](docs/CREDITS-AND-LICENSES.md) and the
[source index](docs/SPELL-SOURCES.md).
