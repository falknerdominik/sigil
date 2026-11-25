# Source index for bundled Pathfinder spell records

This index groups the **1,400 entries** by the source label in
[`data/spell.json`](../data/spell.json).
Each original spell record retains its full `source` field (including page)
and `nethysUrl`, where available. These are provenance references, **not**
complete copyright or ORC/OGL attribution notices; review each original
source product's legal text before public distribution. See the
[release blockers](../NOTICE.md#release-blockers).

## Licensing review

The 1,400 development records use 63 distinct first publication labels before
the first `pg.` marker. All 63 have matching headings in the
[Archives of Nethys credits index](https://2e.aonprd.com/Licenses.aspx), but
its Open Game License page also lists Remaster books such as *Player Core*.
That grouping is not a license classification. The JSON has no rights fields;
21 records have multiple page markers and 12 carry a `PFS Note` in `source`.
Review those additional citations and annotations independently of the first
publication.

| Publication | Evidence checked | Distribution status |
| --- | --- | --- |
| *Stolen Fate Player's Guide* | [Paizo's original PDF](https://downloads.paizo.com/StolenFatePlayersGuide.pdf), pp. 15-16. The OGL notice designates game mechanics as Open Game Content but excludes specified Product Identity, including proper nouns. The source's exact Section 15 entries are included in [the OGL notice](../licenses/OGL-1.0a.txt). | **Not cleared as-is.** Unraveling Blast and Rewrite Possibility match the source descriptions after normalizing punctuation, case, and spacing. Invoke the Harrow matches the title and two of three paragraphs under the same comparison; it also contains a named Harrow reference that needs Product Identity review. Text matches establish provenance, not permission for an entire record. |
| *Player Core* | [Paizo's release announcement](https://paizo.com/blog/pathfinder-second-edition-remaster-project) confirms the Remaster core books' transition to ORC. The [publisher listing](https://store.paizo.com/pathfinder-player-core/) corroborates designer credits. | **Blocked.** The original Article III page, complete contributor credits, and record-level comparison are still required. |
| *Rage of Elements* | Paizo's [product gallery](https://store.paizo.com/pathfinder-rage-of-elements/) reproduces the printed credits page, including authors and additional writing, now recorded in [the ORC attribution notice](../licenses/ORC-NOTICE.txt). The separate [Remaster Core Preview](https://paizo.com/pathfinder/corepreview) is not the book's legal notice. | **Blocked.** The credits spread does not establish the book's Article III notice or what text is licensed. Check the original legal page and cited spell text before assigning rights. |

For the remaining publications, the index below is a retrieval list, not
clearance. Use the original edition's legal pages and cited spell pages
(including errata or organized-play rulings where applicable). Record each
passage's source, license and exclusions, and keep a record out of the
release when its rights cannot be established.

## Catalogue source labels

| Source as recorded | Spells |
| --- | ---: |
| Player Core | 472 |
| Secrets of Magic | 193 |
| Core Rulebook | 124 |
| Rage of Elements | 116 |
| Advanced Player's Guide | 100 |
| Dark Archive | 69 |
| Gods & Magic | 60 |
| Knights of Lastwall | 20 |
| Firebrands | 19 |
| Impossible Lands | 16 |
| Pathfinder #186: Ghost King's Rage | 12 |
| Kingmaker Companion Guide | 10 |
| World Guide | 9 |
| Pathfinder #171: Hurricane's Howl | 8 |
| Pathfinder #172: Secrets of the Temple City | 8 |
| Pathfinder #183: Field of Maidens | 8 |
| Legends | 7 |
| Pathfinder #151: The Show Must Go On | 7 |
| Pathfinder #169: Kindled Magic | 7 |
| Pathfinder #181: Zombie Feast | 7 |
| Pathfinder #156: The Apocalypse Prophet | 6 |
| Pathfinder #182: Graveclaw | 6 |
| Pathfinder #194: Cult of the Cave Worm | 6 |
| Pathfinder #147: Tomorrow Must Burn | 5 |
| Pathfinder #160: Assault on Hunting Lodge Seven | 5 |
| Pathfinder #185: A Taste of Ashes | 5 |
| Book of the Dead | 4 |
| Pathfinder #158: Sixty Feet Under | 4 |
| Pathfinder #177: Burning Tundra | 4 |
| PFS Guide | 4 |
| Wake the Dead #4 | 4 |
| Character Guide | 3 |
| Monsters of Myth | 3 |
| Pathfinder #152: Legacy of the Lost God | 3 |
| Pathfinder #154: Siege of the Dinosaurs | 3 |
| Pathfinder #155: Lord of the Black Sands | 3 |
| Pathfinder #165: Eyes of Empty Death | 3 |
| Pathfinder #166: Despair on Danger Island | 3 |
| Pathfinder #168: King of the Mountain | 3 |
| Pathfinder #175: Broken Tusk Moon | 3 |
| Pathfinder #188: They Watched the Stars | 3 |
| Stolen Fate Player's Guide | 3 |
| Abomination Vaults Hardcover | 2 |
| Pathfinder #150: Broken Promises | 2 |
| Pathfinder #161: Belly of the Black Whale | 2 |
| Pathfinder #162: Ruins of the Radiant Siege | 2 |
| Pathfinder #173: Doorway to the Red Star | 2 |
| Pathfinder #176: Lost Mammoth Valley | 2 |
| Pathfinder #195: Heavy is the Crown | 2 |
| Threshold of Knowledge | 2 |
| Wake the Dead #3 | 2 |
| Advanced Player's Guide pg. 230 2.0  
PFS Note For the purposes of Society play, the Targets entry for the claim undead oracle revelation spell is “1 mindless undead creature”, not “1 undead creature.” The intent of this change is to reduce the prevalence of domination magic on sapient creatures in Society play. | 1 |
| Gods & Magic pg. 110 2.0  
PFS Note The temporary tool spell can be used to create only simple tools, and therefore cannot create kits, which are complex objects made of multiple pieces, or objects made of any specific precious material. | 1 |
| Gods & Magic pg. 113 2.0  
PFS Note The Targets entry for withering grasp should be “1 creature or unattended object”, not “1 creature or object.” When used on an unattended object, the object takes persistent damage on your next turn. | 1 |
| Gods & Magic pg. 119 2.0  
PFS Note For the purposes of Society play, remove the final sentence of remember the lost which states “A creature that truly knows no one who died with any sort of grievance to that creature is immune to this effect.” | 1 |
| Highhelm | 1 |
| Legends pg. 32  
PFS Note Per design team clarification, an item animated by the spirit object hex uses the spellcaster’s spell DC as its AC. Its Hardness and Hit Points remain unchanged from their normal values as listed on page 577 of the Core Rulebook. | 1 |
| Legends pg. 64  
PFS Note If a target of all is one, one is all does not consent to the allocation of Hit Points resulting from this spell, they become an unwilling target and they (and their Hit Points) are removed from the spell’s effect. The spell can continue with any remaining targets. | 1 |
| Malevolence | 1 |
| Pathfinder #148: Fires of the Haunted City | 1 |
| Pathfinder #153: Life's Long Shadows | 1 |
| Pathfinder #163: Ruins of Gauntlight | 1 |
| Pathfinder #164: Hands of the Devil | 1 |
| Pathfinder #184: The Ghouls Hunger | 1 |
| Pathfinder #187: The Seventh Arch | 1 |
| Rage of Elements pg. 143  
PFS Note Any spells which require metal to function require the PC to be holding at least one chunk of that metal or an item made of that metal. | 1 |
| Rage of Elements pg. 143  
PFS Note For the purposes of the fold metal spell in Pathfinder Society play, objects which are part of a structure (such as a door, or a lock on a window) are not considered "unattended." | 1 |
| Rage of Elements pg. 143  
PFS Note Movement caused by the magnetic dominion spell is forced movement. | 1 |
| Rage of Elements pg. 144  
PFS Note Any spells which require metal to function require the PC to be holding at least one chunk of that metal or an item made of that metal. | 1 |
| Rage of Elements pg. 222  
PFS Note Remove the range from the elemental breath spell. The cone is created from the user's square. | 1 |
| Secrets of Magic pg. 134 1.1  
PFS Note The summon lesser servitor spell cannot be used to summon imps. | 1 |
| The Enmity Cycle | 1 |
| Treasure Vault | 1 |
| Wake the Dead #1 | 1 |
| Wake the Dead #2 | 1 |

**Total: 1400 records across 75 source labels.**
