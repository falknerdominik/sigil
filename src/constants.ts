import type { DrawingSettings, ThemePalette } from './drawing-style';
export type AttributeId =
  | 'rank'
  | 'tradition'
  | 'damage'
  | 'area'
  | 'range'
  | 'castActions'
  | 'duration'
  | 'effectTrait'
  | 'castTraits';
export type Choice = {
  value: string;
  label: string;
};
export type UiAttribute = {
  id: AttributeId;
  label: string;
  color: string;
  options: Choice[];
};
export const TRADITIONS = ['Arcane', 'Divine', 'Occult', 'Primal'];
export const CAST_ACTIONS = [
  '1 action',
  '2 actions',
  '3 actions',
  'Reaction',
  'Free action',
  '1 minute',
  '10 minutes',
  'Other',
];
export const CAST_TRAITS = [
  'none',
  'Concentrate',
  'Manipulate',
  'Both',
  'Legacy components',
  'Other',
];
export const PRIMARY_TRAITS = [
  'Healing',
  'Mental',
  'Illusion',
  'Fire',
  'Cold',
  'Electricity',
  'Acid',
  'Poison',
  'Water',
  'Air',
  'Earth',
  'Plant',
  'Wood',
  'Metal',
  'Light',
  'Darkness',
  'Polymorph',
  'Teleportation',
  'Summon',
  'Force',
  'Spirit',
  'Vitality',
  'Void',
  'Incapacitation',
  'Emotion',
  'Detection',
  'Shadow',
  'Sonic',
  'Attack',
  'Other',
];
export const PRIMARY_TRAIT_PRIORITIES = /* @__PURE__ */ (() =>
  PRIMARY_TRAITS.slice(0, -1).map((trait) => trait.toLowerCase()))();
export const DAMAGE_CATEGORIES: Record<string, string> = {
  acid: 'Acid',
  bleed: 'Bleed',
  bludgeoning: 'Bludgeoning',
  cold: 'Cold',
  electricity: 'Electricity',
  fire: 'Fire',
  force: 'Force',
  mental: 'Mental',
  negative: 'Negative',
  positive: 'Positive',
  poison: 'Poison',
  piercing: 'Piercing',
  slashing: 'Slashing',
  sonic: 'Sonic',
  spirit: 'Spirit',
  vitality: 'Vitality',
  void: 'Void',
  good: 'Good',
  evil: 'Evil',
  chaotic: 'other',
  lawful: 'other',
  untyped: 'other',
};
export const REMASTER_DAMAGE_CATEGORIES: Record<string, string> = {
  Positive: 'Vitality',
  Negative: 'Void',
  Good: 'Spirit',
  Evil: 'Spirit',
};
const makeChoices = (items: string[]): Choice[] =>
  items.map((value) => ({ value, label: value }));
const choices = (items: [string, string][]): Choice[] =>
  items.map(([value, label]) => ({ value, label }));
function makeTraditionChoices(): Choice[] {
  const choices: Choice[] = [];
  for (let count = 1; count <= TRADITIONS.length; count++) {
    for (let mask = 1; mask < 1 << TRADITIONS.length; mask++) {
      const names = TRADITIONS.filter((_, i) => mask & (1 << i));
      if (names.length === count)
        choices.push({ value: names.join('+'), label: names.join(' + ') });
    }
  }
  return choices;
}
// Pure initializers let each browser bundle omit unrelated configuration.
const traditionChoices = /* @__PURE__ */ makeTraditionChoices();
export const SPELL_ATTRIBUTES: UiAttribute[] = /* @__PURE__ */ (() => [
  {
    id: 'rank',
    label: 'Spell rank',
    color: '#67584b',
    options: choices([
      ['cantrip', 'Cantrip (auto-heightens)'],
      ...Array.from({ length: 10 }, (_, i): [string, string] => [
        String(i + 1),
        `Rank ${i + 1}`,
      ]),
    ]),
  },
  {
    id: 'tradition',
    label: 'Tradition',
    color: '#6d726f',
    options: [
      { value: 'none', label: 'None / focus / ritual' },
      ...traditionChoices,
      { value: 'multiple', label: 'Multiple (unspecified)' },
    ],
  },
  {
    id: 'damage',
    label: 'Damage type',
    color: '#716459',
    options: [
      { value: 'none', label: 'None / not recorded' },
      ...makeChoices([
        'Acid',
        'Bleed',
        'Bludgeoning',
        'Cold',
        'Electricity',
        'Fire',
        'Force',
        'Mental',
        'Piercing',
        'Poison',
        'Slashing',
        'Sonic',
        'Spirit',
        'Vitality',
        'Void',
        'Good',
        'Evil',
        'Positive',
        'Negative',
      ]),
      { value: 'multiple', label: 'Mixed / multiple types' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'area',
    label: 'Area shape',
    color: '#60716d',
    options: [
      { value: 'none', label: 'None / targeted' },
      ...makeChoices([
        'Burst',
        'Cone',
        'Cylinder',
        'Emanation',
        'Line',
        'Wall',
      ]),
      { value: 'multiple', label: 'Multiple / variable' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'range',
    label: 'Range category',
    color: '#837966',
    options: [
      { value: 'none', label: 'Not listed' },
      ...makeChoices([
        'Self',
        'Touch',
        '5 feet',
        '10 feet',
        '15 feet',
        '20 feet',
        '30 feet',
        '40 feet',
        '60 feet',
        '80 feet',
        '100 feet',
        '120 feet',
        '150 feet',
        '200 feet',
        '300 feet',
        '500 feet',
        '1000 feet',
        '1 mile',
        'Unlimited',
      ]),
      { value: 'variable', label: 'Variable / special' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'castActions',
    label: 'Casting time',
    color: '#8791a0',
    options: makeChoices(CAST_ACTIONS),
  },
  {
    id: 'duration',
    label: 'Duration',
    color: '#779398',
    options: makeChoices([
      'Instant',
      '1 round',
      '1 minute',
      '10 minutes',
      '1 hour',
      '1 day+',
      'Sustained',
      'Until preparations',
      'Variable',
      'Other',
    ]),
  },
  {
    id: 'effectTrait',
    label: 'Primary trait',
    color: '#769b88',
    options: [
      { value: 'none', label: 'No selected trait' },
      ...makeChoices(PRIMARY_TRAITS),
    ],
  },
  {
    id: 'castTraits',
    label: 'Casting traits',
    color: '#8794a4',
    options: [
      { value: 'none', label: 'None / unspecified' },
      ...makeChoices(CAST_TRAITS.slice(1)),
    ],
  },
])();
export const EDGE_ATTRIBUTE_IDS: AttributeId[] = [
  'rank',
  'tradition',
  'range',
  'duration',
  'effectTrait',
];
export const ORBIT_ATTRIBUTE_IDS: AttributeId[] = [
  'damage',
  'area',
  'castActions',
  'castTraits',
];
export const IDENTITY_TAG = 'spell-id';
export const MAX_IDENTITY_BYTES = 192;
export const MAX_VARIANT_LENGTH = 70;
export const MAX_CATALOGUE_SIZE = 20000;
export const CARD_WIDTH = 1240;
export const UI_MODE_STORAGE = 'sigil-interface-mode-v1';
export const COLOR_STORAGE = 'sigil-color-palettes-v1';
export const COLOR_IDS: Record<keyof ThemePalette, string> = {
  background: 'colorBackground',
  lines: 'colorLines',
  vertices: 'colorVertices',
};
export const COLOR_KEYS: (keyof ThemePalette)[] = [
  'background',
  'lines',
  'vertices',
];
export const DRAWING_CONTROLS = [
  'baseShape',
  'polygonSides',
  'baseBend',
  'connectionStyle',
  'dotStyle',
  'vertexSize',
  'vertexStroke',
  'curvature',
  'arcSide',
  'edgeOpacity',
  'orbitOpacity',
  'orbitWidth',
  'orbitLineStyle',
  'identityTickWidth',
  'identityTickShape',
  'identityTickLineStyle',
  'identityDotSize',
  'identityDotFill',
  'identitySquareSize',
  'identitySquareFill',
  'identitySquareOrientation',
  'identityPointStrokeWidth',
  'identityMarkerOpacity',
  'rotation',
  'stretch',
  'handDrawnInk',
  'inkOnlyLayers1And2',
  'inkWobble',
  'inkPressure',
  'inkFeather',
  'mirror',
  'rankComplexity',
  'showGuides',
  'vertexLabelMode',
  'cornerOrnaments',
  'backgroundOrnaments',
];
export const DRAWING_DEFAULTS: DrawingSettings = {
  design: 'constellations',
  style: 'curved',
  curvature: 0.22,
  arcSide: 'alternate',
  dotStyle: 'star',
  vertexSize: 0.7,
  vertexStroke: 1,
  edgeOpacity: 1,
  orbitOpacity: 1,
  orbitWidth: 1.25,
  orbitLineStyle: 'solid',
  identityTickWidth: 1,
  identityTickLineStyle: 'solid',
  identityTickShape: 'line',
  identityDotSize: 3.5,
  identityDotFill: 'filled',
  identitySquareSize: 4.5,
  identitySquareFill: 'filled',
  identitySquareOrientation: 'tangent',
  identityPointStrokeWidth: 1,
  identityMarkerOpacity: 0.45,
  handDrawnInk: false,
  inkOnlyLayers1And2: true,
  inkWobble: 0.5,
  inkPressure: 2,
  inkFeather: 0.3,
  rankComplexity: true,
  base: 'polygon',
  polygonSides: 'smooth',
  baseBend: 1,
  vertexLabels: 'none',
  rotation: 0,
  stretch: 1,
  mirror: false,
  guides: false,
  decorations: false,
  cornerOrnaments: true,
  backgroundOrnaments: true,
  decorationSeed: 101,
  labels: false,
  themeColors: null,
};
export interface TraitTheme extends ThemePalette {
  base: string;
  description: string;
  seed: number;
}
export const TRAIT_THEMES: Record<string, TraitTheme> = /* @__PURE__ */ (() =>
  Object.fromEntries(
    [
      ['none', 'plain', '#e7e3d9', '#5c6664', '#8a8574', 'Neutral parchment.'],
      [
        'Healing',
        'divine',
        '#eff3df',
        '#307b68',
        '#7bb59c',
        'Soft green and restorative light.',
      ],
      [
        'Mental',
        'occult',
        '#231f3c',
        '#c0abf1',
        '#edd8ff',
        'Violet ink and quiet ripples.',
      ],
      [
        'Illusion',
        'occult',
        '#281b3b',
        '#ec9af9',
        '#b4e6f8',
        'Prismatic veils.',
      ],
      [
        'Fire',
        'obsidian',
        '#341c18',
        '#ffaf6a',
        '#ffe2ab',
        'Ember ink on charred stone.',
      ],
      [
        'Cold',
        'blueprint',
        '#102b44',
        '#a7eaff',
        '#d4f8ff',
        'Frost and blue glass.',
      ],
      [
        'Electricity',
        'arcane',
        '#1e2440',
        '#fce67a',
        '#b0e5ff',
        'Charged gold traces.',
      ],
      ['Acid', 'primal', '#192e19', '#b4ec65', '#dffa9c', 'Caustic green ink.'],
      [
        'Poison',
        'herbarium',
        '#e1e9d5',
        '#506e40',
        '#82a85c',
        'Toxic botanical stains.',
      ],
      [
        'Water',
        'primal',
        '#0e3543',
        '#78dfdd',
        '#b8f6ee',
        'Sea-blue currents.',
      ],
      [
        'Air',
        'constellations',
        '#173449',
        '#b8e5eb',
        '#effcfa',
        'Pale air on deep blue.',
      ],
      [
        'Earth',
        'obsidian',
        '#30291e',
        '#dcb987',
        '#f3dcab',
        'Stone and ochre.',
      ],
      [
        'Plant',
        'herbarium',
        '#e2efdb',
        '#478056',
        '#8cb98b',
        'Living leaf green.',
      ],
      [
        'Wood',
        'herbarium',
        '#efe6d8',
        '#906d43',
        '#baa078',
        'Bark and warm sap.',
      ],
      [
        'Metal',
        'obsidian',
        '#202a33',
        '#bbd2e0',
        '#f0f9ff',
        'Steel engraving.',
      ],
      ['Light', 'divine', '#fff5db', '#b8872f', '#d3ac6b', 'Golden light.'],
      [
        'Darkness',
        'occult',
        '#171326',
        '#aa96cf',
        '#d4c6ec',
        'Velvet shadows.',
      ],
      [
        'Polymorph',
        'arcane',
        '#20283a',
        '#7ee5bc',
        '#dbb8f9',
        'Changing teal and violet.',
      ],
      [
        'Teleportation',
        'arcane',
        '#142a43',
        '#8bbdff',
        '#d5e6ff',
        'Blue spatial folds.',
      ],
      ['Summon', 'occult', '#30263b', '#f1c596', '#f4e2ce', 'Ritual amber.'],
      [
        'Force',
        'blueprint',
        '#12243e',
        '#82b6ff',
        '#deeaff',
        'Dense cobalt lines.',
      ],
      [
        'Spirit',
        'divine',
        '#f4eaf4',
        '#9569a4',
        '#c3a0ca',
        'Soft spirit lilac.',
      ],
      [
        'Vitality',
        'divine',
        '#fbebdf',
        '#bc6775',
        '#e4a3a2',
        'Warm rose-gold energy.',
      ],
      ['Void', 'occult', '#141b25', '#98a9b5', '#d4dae0', 'Ash and emptiness.'],
      [
        'Incapacitation',
        'obsidian',
        '#302020',
        '#e38e7a',
        '#ffbbab',
        'Dark crimson restraint.',
      ],
      [
        'Emotion',
        'occult',
        '#392034',
        '#ffa1b8',
        '#ffcfda',
        'Warm rose and magenta.',
      ],
      [
        'Detection',
        'blueprint',
        '#15343b',
        '#9cd5a5',
        '#d7fae0',
        'Fine green tracery.',
      ],
      ['Shadow', 'occult', '#1d1e2d', '#8c9ebd', '#c2c8de', 'Dusky blue-grey.'],
      [
        'Sonic',
        'blueprint',
        '#1f2045',
        '#c4b2ff',
        '#e6dcff',
        'Violet resonance.',
      ],
      [
        'Attack',
        'obsidian',
        '#301b1e',
        '#f08b86',
        '#ffccac',
        'Hot red etching.',
      ],
      ['Other', 'plain', '#eae5db', '#745d76', '#aa92a8', 'Mauve parchment.'],
    ].map(([name, base, background, lines, vertices, description], i) => [
      name,
      { base, background, lines, vertices, description, seed: 1101 + i * 137 },
    ]),
  ))();
export const THEME_PALETTES: Record<string, ThemePalette> =
  /* @__PURE__ */ (() => ({
    plain: { background: '#f4eedf', lines: '#735a40', vertices: '#857052' },
    constellations: {
      background: '#0e1c35',
      lines: '#e4f4ff',
      vertices: '#f4faff',
    },
    blueprint: { background: '#0c2d3e', lines: '#a6e5f3', vertices: '#a5e6ef' },
    obsidian: { background: '#1e2023', lines: '#e3c48a', vertices: '#f1ca89' },
    herbarium: { background: '#eaf0e2', lines: '#566c53', vertices: '#4c6652' },
    arcane: { background: '#171c43', lines: '#c5b5ff', vertices: '#cdc5ff' },
    divine: { background: '#f9f1dc', lines: '#a97b36', vertices: '#b08747' },
    occult: { background: '#2a172d', lines: '#e4a9d1', vertices: '#e6b1d5' },
    primal: { background: '#12372e', lines: '#b3e4ae', vertices: '#b3dba5' },
    tattoo: { background: '#d8ad92', lines: '#252426', vertices: '#252426' },
    ...Object.fromEntries(
      Object.entries(TRAIT_THEMES).map(([name, preset]) => [
        `trait-${name.toLowerCase()}`,
        {
          background: preset.background,
          lines: preset.lines,
          vertices: preset.vertices,
        },
      ]),
    ),
  }))();
export type DesignPreference = {
  dotStyle: string;
  vertexSize: string;
  vertexStroke: string;
  decorations: boolean;
  decorationSeed: number;
};
function editorThemes() {
  const DESIGN_DESCRIPTIONS: Record<string, string> = {
    plain:
      'Sepia manuscript ink on fibrous parchment with a quiet, unframed margin.',
    constellations:
      'A silver star chart with a sweeping galactic haze and celestial coordinates.',
    blueprint:
      'Cyan technical ink on a measured drafting grid with edge rulers.',
    obsidian: 'Copper and gold inlay on fractured, matte volcanic stone.',
    herbarium:
      'Olive specimen ink on a stitched botanical journal with pressed leaves.',
    arcane: 'Violet light suspended inside a geometric aether lattice.',
    divine:
      'Gilded ivory with a radiant sunburst, like an illuminated manuscript.',
    occult:
      'Rose-silver ritual ink, lunar phases and smoke on deep plum velvet.',
    primal: 'Living green ink inside a canopy of ferns and drifting spores.',
    tattoo:
      'Fine blackwork on subtly textured skin. Change Background for a different skin tone; Transparent PNG exports ink only.',
  };
  const DECORATION_DESCRIPTIONS: Record<string, string> = {
    plain: 'Marginal rosettes and delicate ink curls.',
    constellations: 'Extra star clusters, light trails, and asterisms.',
    blueprint: 'Compass dials, faint orbital arcs, and calibration marks.',
    obsidian: '',
    herbarium: 'Pressed leaves, slender stems, and little flowers.',
    arcane: 'Rune wheels, tiny charge sparks, and aether marks.',
    divine: 'Golden sun medallions and celestial rays.',
    occult: 'Broken orbital rings, ritual eyes, and spectral wisps.',
    primal: 'Ivy tendrils, floating spores, and small seedpods.',
    tattoo: 'Fine dotwork diamonds and sparse ornamental stippling.',
  };
  const DESIGN_DEFAULTS: Record<string, DesignPreference> = {
    plain: {
      dotStyle: 'circle',
      vertexSize: '1',
      vertexStroke: '1.5',
      decorations: false,
      decorationSeed: 101,
    },
    constellations: {
      dotStyle: 'star',
      vertexSize: '0.7',
      vertexStroke: '1',
      decorations: false,
      decorationSeed: 202,
    },
    blueprint: {
      dotStyle: 'empty',
      vertexSize: '0.9',
      vertexStroke: '1.5',
      decorations: false,
      decorationSeed: 303,
    },
    obsidian: {
      dotStyle: 'diamond',
      vertexSize: '0.85',
      vertexStroke: '1.25',
      decorations: false,
      decorationSeed: 404,
    },
    herbarium: {
      dotStyle: 'circle',
      vertexSize: '0.9',
      vertexStroke: '1.25',
      decorations: false,
      decorationSeed: 505,
    },
    arcane: {
      dotStyle: 'star',
      vertexSize: '0.82',
      vertexStroke: '1.25',
      decorations: false,
      decorationSeed: 606,
    },
    divine: {
      dotStyle: 'diamond',
      vertexSize: '1',
      vertexStroke: '1.5',
      decorations: false,
      decorationSeed: 707,
    },
    occult: {
      dotStyle: 'star',
      vertexSize: '0.75',
      vertexStroke: '1',
      decorations: false,
      decorationSeed: 808,
    },
    primal: {
      dotStyle: 'hexagon',
      vertexSize: '0.92',
      vertexStroke: '1.25',
      decorations: false,
      decorationSeed: 909,
    },
    tattoo: {
      dotStyle: 'circle',
      vertexSize: '0.5',
      vertexStroke: '0.75',
      decorations: false,
      decorationSeed: 1010,
    },
  };
  for (const [trait, preset] of Object.entries(TRAIT_THEMES)) {
    const key = `trait-${trait.toLowerCase()}`;
    DESIGN_DESCRIPTIONS[key] = preset.description;
    DECORATION_DESCRIPTIONS[key] = DECORATION_DESCRIPTIONS[preset.base];
    DESIGN_DEFAULTS[key] = {
      ...DESIGN_DEFAULTS[preset.base],
      decorationSeed: preset.seed,
    };
  }
  return { DESIGN_DESCRIPTIONS, DECORATION_DESCRIPTIONS, DESIGN_DEFAULTS };
}
export const EDITOR_THEMES = /* @__PURE__ */ editorThemes();
