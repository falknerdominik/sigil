# Historical nine-chord-layer optimization: exhaustive search

> **Historical analysis, not the current catalogue or drawing layout.** These results use the earlier 1,403-record catalogue and nine-*chord*-layer experiment. The current catalogue has 1,400 records; rerun the optimizer for current results. For the shipped notation, see [the calculation reference](HOW-IT-IS-CALCULATED.qmd).

## Objective and constraints

The historical `spell.json` had 1,403 PF2e spell records. The experiment allowed **no more than nine independent categorical connection layers** and required these seven mechanics:

1. `rank` — spell rank / cantrip
2. `tradition` — exact subset of Arcane, Divine, Occult, Primal
3. `damage` — damage type
4. `area` — area shape
5. `range` — range category
6. `castActions` — casting time
7. `duration` — duration category

The program compared every possible two-field addition from the seven other existing metadata fields (`spellType`, `defense`, `targets`, `rarity`, `effectTrait`, `castTraits`, `heightening`): **21 combinations**. It also compared all **2,002** unrestricted nine-of-fourteen combinations.

The optimization metric is the number of spell rows with a signature *not shared by any other row* ("individually unique" or singleton profiles); ties are broken by the fewest colliding unordered pairs. The signature is an ordered tuple of categorical values, *excluding spell name, edition, ID, or description*. The experiment therefore measures **mechanical distinctiveness**, not identity-seal uniqueness.

## Results on the supplied 1,403 spells

| Sigil fields | Individually unique spells | Distinct profiles | Spells sharing a profile | Colliding pairs |
|---|---:|---:|---:|---:|
| Original seven, original `multiple` tradition encoding | 925 | 1,102 | 478 | 547 |
| Seven with exact tradition subsets | 1,098 | 1,222 | 305 | 307 |
| Best eight with exact traditions (+ `heightening`) | 1,215 | 1,294 | 188 | 170 |
| Best nine subject to seven required fields (+ `effectTrait`, `castTraits`) | **1,288** | **1,338** | **115** | **87** |
| Nine: seven required + `castTraits`, `heightening` (runner-up) | 1,287 | 1,340 | 116 | 76 |
| Best nine with no mandatory fields | 1,332 | 1,362 | 71 | 55 |
| All original 14 fields, now with exact traditions | 1,352 | 1,374 | 51 | 38 |

The chosen nine-field signature individually distinguishes **91.8%** of the catalogue and produces **1,338 distinct profiles**. Its runner-up has one fewer individually unique spell but fewer colliding pairs, so it could be preferred if collision-pair minimization matters more than singleton maximization.

The unconstrained nine-field optimum omits `damage`, `area` and `range`, so it violates the requested mechanics constraint. It is **not** the recommended glyph vocabulary.

### Why exact traditions matter

The earlier `SpellCatalog.tradition()` returned `multiple` for every spell with two, three or four traditions. The revised code returns **one categorical value describing the exact subset**, for example `Arcane+Primal` or `Arcane+Divine+Occult`, using *one layer* either way. For the selected nine fields this raises the singleton count from **1,237** to **1,288**, with no new layer.

## Previously recommended order of nine connection layers (historical)

| k | Attribute | Meaning |
|---:|---|---|
| 1 | `rank` | Cantrip or ranks 1–10 |
| 2 | `tradition` | Exact combination of the four traditions |
| 3 | `damage` | Damage category / none / mixed |
| 4 | `area` | Shape: cone, burst, line, etc. |
| 5 | `range` | Range / touch / self / none |
| 6 | `castActions` | Action count, reaction, time |
| 7 | `duration` | Instant, sustained, rounds, etc. |
| 8 | `effectTrait` | Primary thematic trait |
| 9 | `castTraits` | Manipulate, Concentrate, both, legacy components |

`spellType`, `defense`, `targets`, `rarity`, and `heightening` **remain available as parsed data**, but are not rendered as independent connection layers. The historical catalogue included three content-duplicate pairs (Light, Invisibility and Clairvoyance); the current catalogue removes one record from each pair. The current editor accepts both legacy and remaster damage categories.

## Exact uniqueness still requires the identity seal

No evaluated nine-field set yields a unique categorical tuple for all 1,403 spells. **Even all 14 fields collide** on some entries: for example, spells with very similar mechanics can share identical categorical attributes. **Historical note:** an older prototype encoded `['pf2e', edition, name, variant]` in its identity seal. The **current renderer** instead stores the length-prefixed payload `['spell-id', variant]` in Layer 3. Distinct source IDs distinguish the bundled records, while custom spells can collide if their IDs are reused.

In the **historical nine-chord-layer experiment**, using nine families required **19 vertices** (`nextPrime(2×9+1)`) and 204 canonical four-stroke necklaces. **The current shipped renderer does not use this layout:** it uses five chord families on 11 vertices, four weighted orbit attributes, and a separate spell-ID marker layer.

## Reproduce the search

```bash
npm test
npm run optimize
# Or: npm run optimize -- /path/to/another-spell.json
npm run compile
node src/tools/optimize-attributes.js --json > optimization-results.json
```

The script enumerates combinations directly from `SpellCatalog.parse()`, so it also works on other supported PF2e JSON catalogues. The optimum depends on the supplied data and the chosen seven required fields, not on an abstract guarantee for future spells or custom spells.
