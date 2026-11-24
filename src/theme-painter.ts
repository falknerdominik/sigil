import { TRAIT_THEMES, THEME_PALETTES } from './constants';
import { isHexColor, parseHexColor } from './color';
import type { DrawingSettings, Point, PaletteKey } from './drawing-style';
type ThemeSettings = Pick<
  DrawingSettings,
  | 'design'
  | 'themeColors'
  | 'cornerOrnaments'
  | 'decorations'
  | 'decorationSeed'
>;

export function baseTheme(settings: ThemeSettings) {
  const theme = settings.design;
  if (theme.startsWith('trait-')) {
    const name = Object.keys(TRAIT_THEMES).find(
      (key) => 'trait-' + key.toLowerCase() === theme,
    );
    return name ? TRAIT_THEMES[name].base : 'plain';
  }
  return theme;
}

export function themeColor(settings: ThemeSettings, key: PaletteKey) {
  const defaults = THEME_PALETTES[settings.design] || THEME_PALETTES.plain;
  const proposed = settings.themeColors?.[key];
  return isHexColor(proposed) ? proposed : defaults[key];
}

/** Recolor the theme's painted background without removing its texture,
 *  stars, ornaments, vignette or fine detail. No pixels change at defaults. */
export function recolorBackground(
  settings: ThemeSettings,
  ctx: CanvasRenderingContext2D,
) {
  const base = THEME_PALETTES[baseTheme(settings)] || THEME_PALETTES.plain;
  const chosen = themeColor(settings, 'background');
  if (chosen.toLowerCase() === base.background.toLowerCase()) return;
  const original = parseHexColor(base.background),
    target = parseHexColor(chosen);
  const offsets = target.map((v, i) => v - original[i]);
  // ImageData ignores the Canvas DPR transform. Read the entire physical
  // backing store, not only the top-left portion on high-density screens.
  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const data = image.data;
  // Delta blend preserves the brightness variations and theme-specific colors.
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.max(0, Math.min(255, data[i + c] + offsets[c]));
  }
  ctx.putImageData(image, 0, 0);
}

/** Draw the selected theme's background without encoded strokes.
 * Used by both the editor and the full-bleed spell-card export. */
export function paintThemeBackdrop(
  settings: ThemeSettings,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: Point,
  radius: number,
) {
  const design = baseTheme(settings);
  if (design === 'constellations') paintSky(ctx, width, height, center);
  else if (design === 'blueprint') paintBlueprint(ctx, width, height);
  else if (design === 'obsidian')
    paintObsidian(ctx, width, height, center, radius);
  else if (design === 'herbarium') paintHerbarium(ctx, width, height, center);
  else if (design === 'arcane') paintArcane(ctx, width, height, center, radius);
  else if (design === 'divine') paintDivine(ctx, width, height, center, radius);
  else if (design === 'occult') paintOccult(ctx, width, height, center, radius);
  else if (design === 'primal') paintPrimal(ctx, width, height, center);
  else if (design === 'tattoo') paintSkin(ctx, width, height);
  else paintPaper(ctx, width, height, center, radius);
  paintThemeAccents(settings, ctx, width, height, center, radius);
  if (settings.decorations) paintDecorations(settings, ctx, width, height);
}

function paintGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  seed: number,
) {
  const random = seededRandom(seed);
  const count = Math.min(6000, Math.round((w * h) / 180));
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = random() * w,
      y = random() * h,
      r = 0.25 + random() * 0.55;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintSkin(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const ground = ctx.createLinearGradient(0, 0, w, h);
  ground.addColorStop(0, '#e7c2a8');
  ground.addColorStop(0.48, '#d8ad92');
  ground.addColorStop(1, '#bf9078');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  paintGrain(ctx, w, h, 'rgba(87,48,37,.10)', 1010);
}

function paintPaper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
  radius: number,
) {
  const ground = ctx.createRadialGradient(
    center.x,
    center.y,
    radius * 0.12,
    center.x,
    center.y,
    Math.max(w, h) * 0.82,
  );
  ground.addColorStop(0, '#fcf9ef');
  ground.addColorStop(1, '#f0e9d8');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  paintGrain(ctx, w, h, 'rgba(112,82,42,.13)', 101);
  ctx.save();
  ctx.strokeStyle = 'rgba(138,100,54,.06)';
  ctx.lineWidth = 0.6;
  for (let y = 12; y < h; y += 9) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y - 2, w * 0.7, y + 2, w, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Stable star field: no random flicker when a control changes. */
function paintSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
) {
  const backdrop = ctx.createLinearGradient(0, 0, w, h);
  backdrop.addColorStop(0, '#06111f');
  backdrop.addColorStop(0.54, '#0e1c35');
  backdrop.addColorStop(1, '#050b18');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, w, h);
  const haze = ctx.createRadialGradient(
    center.x * 0.92,
    center.y * 0.87,
    18,
    center.x * 0.92,
    center.y * 0.87,
    Math.max(w, h) * 0.67,
  );
  haze.addColorStop(0, 'rgba(62,102,169,.32)');
  haze.addColorStop(1, 'rgba(10,25,56,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
  const band = ctx.createLinearGradient(0, h, w, 0);
  band.addColorStop(0, 'rgba(119,134,196,0)');
  band.addColorStop(0.4, 'rgba(119,134,196,0)');
  band.addColorStop(0.5, 'rgba(119,134,196,.09)');
  band.addColorStop(0.6, 'rgba(119,134,196,0)');
  band.addColorStop(1, 'rgba(119,134,196,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);
  const fraction = (value: number) => value - Math.floor(value);
  const count = Math.min(540, Math.max(150, Math.round((w * h) / 2400)));
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x =
      20 +
      fraction(Math.sin((i + 1) * 127.117) * 43758.5453) * Math.max(1, w - 40);
    const y =
      20 +
      fraction(Math.sin((i + 1) * 331.331) * 19341.2197) * Math.max(1, h - 40);
    const intensity = fraction(Math.sin((i + 1) * 47.39) * 97112.37);
    const size = intensity > 0.96 ? 1.15 : intensity > 0.76 ? 0.75 : 0.43;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(225,237,255,${(0.12 + intensity * 0.46).toFixed(3)})`;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(182,204,233,.16)';
  ctx.lineWidth = 0.7;
  ctx.setLineDash([2, 7]);
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, w * 0.46, h * 0.42, -0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Crisp astronomer's blueprint grid; only the rendering changes. */
function paintBlueprint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#071c29');
  bg.addColorStop(0.6, '#0c2d3e');
  bg.addColorStop(1, '#08212f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const step = 32;
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = 'rgba(138,202,223,.105)';
  ctx.beginPath();
  for (let x = 0; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(138,202,223,.17)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let x = 0; x < w; x += step * 5) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y < h; y += step * 5) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(164,224,235,.34)';
  ctx.lineWidth = 1;
  ctx.strokeRect(17.5, 17.5, w - 35, h - 35);
  ctx.strokeStyle = 'rgba(164,224,235,.38)';
  for (let y = 32; y < h - 25; y += 16) {
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(y % 32 === 0 ? 28 : 23, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** A warm black stone tablet with delicate, restrained copper engraving. */
function paintObsidian(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
  radius: number,
) {
  const ground = ctx.createRadialGradient(
    center.x,
    center.y,
    radius * 0.12,
    center.x,
    center.y,
    Math.max(w, h) * 0.81,
  );
  ground.addColorStop(0, '#2b2928');
  ground.addColorStop(0.53, '#1e2023');
  ground.addColorStop(1, '#101519');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const light = ctx.createRadialGradient(
    w * 0.54,
    h * 0.37,
    1,
    w * 0.54,
    h * 0.37,
    w * 0.6,
  );
  light.addColorStop(0, 'rgba(176,123,66,.10)');
  light.addColorStop(1, 'rgba(176,123,66,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  paintGrain(ctx, w, h, 'rgba(205,179,145,.08)', 404);
  const random = seededRandom(404);
  ctx.strokeStyle = 'rgba(206,161,104,.22)';
  ctx.lineWidth = 0.8;
  for (const side of [0, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const x = (side ? 0.94 : 0.06) * w + (random() - 0.5) * w * 0.06;
      const y = (h * i) / 12;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Botanical journal paper with quiet green ink and an archival frame. */
function paintHerbarium(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
) {
  const ground = ctx.createRadialGradient(
    center.x,
    center.y,
    12,
    center.x,
    center.y,
    Math.max(w, h) * 0.84,
  );
  ground.addColorStop(0, '#f6f5e8');
  ground.addColorStop(0.7, '#eaf0e2');
  ground.addColorStop(1, '#dae4d2');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(92,111,78,.065)';
  const spacing = Math.max(24, Math.min(38, Math.round(w / 28)));
  for (let y = spacing * 0.5; y < h; y += spacing)
    for (let x = spacing * 0.5; x < w; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.save();
  ctx.strokeStyle = 'rgba(91,117,77,.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(30, h);
  ctx.stroke();
  for (let y = 24; y < h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(36, y + 4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(91,117,77,.12)';
  for (const side of [1, -1]) {
    const x = side === 1 ? w * 0.12 : w * 0.88;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.16);
    ctx.quadraticCurveTo(x + side * w * 0.035, h * 0.5, x, h * 0.84);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(
        x + side * (i % 2 ? 10 : -10),
        h * (0.22 + i * 0.085),
        12,
        3.5,
        side * 0.65,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Arcane: a night-blue aether field with faint magic-circle engravings. */
function paintArcane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
  radius: number,
) {
  const ground = ctx.createRadialGradient(
    center.x,
    center.y * 0.88,
    10,
    center.x,
    center.y,
    Math.max(w, h) * 0.81,
  );
  ground.addColorStop(0, '#273865');
  ground.addColorStop(0.57, '#171c43');
  ground.addColorStop(1, '#090e29');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const glimmer = ctx.createRadialGradient(
    center.x * 0.77,
    center.y * 0.78,
    5,
    center.x * 0.77,
    center.y * 0.78,
    radius * 1.9,
  );
  glimmer.addColorStop(0, 'rgba(110,88,217,.17)');
  glimmer.addColorStop(1, 'rgba(80,64,210,0)');
  ctx.fillStyle = glimmer;
  ctx.fillRect(0, 0, w, h);
  // Background engraving only: very low opacity and separate from binary edges.
  ctx.strokeStyle = 'rgba(170,162,244,.075)';
  ctx.lineWidth = 0.8;
  for (const scale of [1.2, 1.36]) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 32; i++) {
    const a = (2 * Math.PI * i) / 32,
      inner = radius * 1.225,
      outer = radius * 1.25;
    ctx.beginPath();
    ctx.moveTo(center.x + inner * Math.cos(a), center.y + inner * Math.sin(a));
    ctx.lineTo(center.x + outer * Math.cos(a), center.y + outer * Math.sin(a));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(168,157,243,.19)';
  for (const scale of [1.32, 1.48]) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2;
      const x = center.x + radius * scale * Math.cos(angle);
      const y = center.y + radius * scale * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Divine: sunlit ivory, a distant gold halo and a restrained sacred border. */
function paintDivine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
  radius: number,
) {
  const ground = ctx.createRadialGradient(
    center.x,
    center.y,
    radius * 0.1,
    center.x,
    center.y,
    Math.max(w, h) * 0.83,
  );
  ground.addColorStop(0, '#fffdf4');
  ground.addColorStop(0.58, '#f9f1dc');
  ground.addColorStop(1, '#e8d6b0');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const halo = ctx.createRadialGradient(
    center.x,
    center.y,
    radius * 0.66,
    center.x,
    center.y,
    radius * 1.54,
  );
  halo.addColorStop(0, 'rgba(244,197,106,0)');
  halo.addColorStop(0.72, 'rgba(238,192,107,.12)');
  halo.addColorStop(1, 'rgba(238,192,107,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(170,118,50,.12)';
  ctx.lineWidth = 1;
  for (const r of [radius * 1.22, radius * 1.25]) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(183,139,56,.13)';
  for (let i = 0; i < 48; i++) {
    const angle = (i * Math.PI) / 24;
    const inner = radius * 1.3,
      outer = radius * (i % 4 === 0 ? 1.65 : 1.48);
    ctx.beginPath();
    ctx.moveTo(
      center.x + inner * Math.cos(angle),
      center.y + inner * Math.sin(angle),
    );
    ctx.lineTo(
      center.x + outer * Math.cos(angle),
      center.y + outer * Math.sin(angle),
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** Occult: inky aubergine with diffuse ether fog and smoky copper edging. */
function paintOccult(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
  radius: number,
) {
  const ground = ctx.createLinearGradient(0, 0, w, h);
  ground.addColorStop(0, '#100d1e');
  ground.addColorStop(0.48, '#2a172d');
  ground.addColorStop(1, '#130f24');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  for (const [x, y, r, alpha] of [
    [w * 0.25, h * 0.22, radius * 0.85, 0.12],
    [w * 0.76, h * 0.57, radius * 0.94, 0.1],
    [w * 0.55, h * 0.89, radius * 0.7, 0.08],
  ]) {
    const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
    fog.addColorStop(0, `rgba(204,121,183,${alpha})`);
    fog.addColorStop(1, 'rgba(204,121,183,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(220,172,209,.35)';
  for (let i = 0; i < 7; i++) {
    const x = w * (0.35 + i * 0.05),
      y = h * 0.065,
      r = Math.min(w, h) * 0.009;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
    ctx.ellipse(
      x,
      y,
      Math.max(0.1, (r * Math.abs(i - 3)) / 3),
      r,
      0,
      Math.PI / 2,
      -Math.PI / 2,
      i < 3,
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** Primal: shaded woodland green with gentle luminous lichen and leaf flecks. */
function paintPrimal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
) {
  const ground = ctx.createRadialGradient(
    center.x,
    center.y * 0.86,
    16,
    center.x,
    center.y,
    Math.max(w, h) * 0.84,
  );
  ground.addColorStop(0, '#254b3d');
  ground.addColorStop(0.62, '#12372e');
  ground.addColorStop(1, '#091c19');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const fraction = (x: number) => x - Math.floor(x);
  const count = Math.min(260, Math.max(90, Math.round((w * h) / 4600)));
  for (let i = 0; i < count; i++) {
    const x = 23 + fraction(Math.sin((i + 1) * 79.41) * 33193.27) * (w - 46);
    const y = 23 + fraction(Math.sin((i + 1) * 151.17) * 18743.51) * (h - 46);
    const size = 0.45 + fraction(Math.sin((i + 1) * 19.71) * 17211.31) * 0.6;
    ctx.fillStyle = 'rgba(182,229,167,.13)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(158,208,156,.20)';
  ctx.lineWidth = 0.8;
  for (const side of [1, -1]) {
    const x = side === 1 ? w * 0.06 : w * 0.94;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.12);
    ctx.bezierCurveTo(
      x + side * w * 0.08,
      h * 0.35,
      x - side * w * 0.025,
      h * 0.65,
      x,
      h * 0.9,
    );
    ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const y = h * (0.17 + i * 0.047),
        length = Math.sin((i / 14) * Math.PI) * w * 0.06;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + side * length * 0.5,
        y - length * 0.7,
        x + side * length,
        y - length * 0.4,
      );
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x - side * length * 0.4,
        y - length * 0.5,
        x - side * length * 0.6,
        y - length * 0.3,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Small, deterministic decorative drawings. Does NOT touch the spell model. */
function seededRandom(seed: number) {
  let state = Number(seed) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fixed, subtle marginal ornaments give every design its own finishing pass.
 * They are outside the encoding layer and do not alter the UBS connections.
 * Random decorations are a separate opt-in layer with their own seed.
 */
function paintThemeAccents(
  settings: ThemeSettings,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center: Point,
  radius: number,
) {
  const theme = baseTheme(settings);
  const palettes: Record<string, string[]> = {
    plain: ['rgba(116,91,57,.20)', 'rgba(155,124,78,.07)'],
    constellations: ['rgba(161,211,251,.33)', 'rgba(102,162,233,.12)'],
    blueprint: ['rgba(117,207,231,.34)', 'rgba(71,168,195,.12)'],
    obsidian: ['rgba(225,184,104,.35)', 'rgba(184,124,56,.10)'],
    herbarium: ['rgba(77,115,78,.26)', 'rgba(106,144,86,.09)'],
    arcane: ['rgba(188,171,255,.34)', 'rgba(117,106,219,.11)'],
    divine: ['rgba(186,142,69,.32)', 'rgba(232,190,103,.10)'],
    occult: ['rgba(226,157,208,.28)', 'rgba(145,83,161,.12)'],
    primal: ['rgba(156,216,165,.32)', 'rgba(84,153,113,.12)'],
    tattoo: ['rgba(37,36,38,.28)', 'rgba(37,36,38,.06)'],
  };
  const palette = palettes[theme] || [
    'rgba(120,100,70,.22)',
    'rgba(130,110,80,.08)',
  ];
  const unit = Math.min(w / 900, h / 650, 1.5),
    pad = 42 * unit;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Atmospheric rim; only a faint edge effect inside the original canvas.
  const vignette = ctx.createRadialGradient(
    center.x,
    center.y,
    radius * 0.56,
    center.x,
    center.y,
    Math.max(w, h) * 0.76,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(
    1,
    ['plain', 'herbarium', 'divine', 'tattoo'].includes(theme)
      ? 'rgba(129,105,69,.050)'
      : 'rgba(0,0,0,.20)',
  );
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  // Marginal motifs are optional and never part of the spell encoding.
  ctx.lineWidth = Math.max(0.6, unit * 0.9);
  const corners = settings.cornerOrnaments
    ? [
        [pad, pad],
        [w - pad, pad],
        [pad, h - pad],
        [w - pad, h - pad],
      ]
    : [];
  for (const [cx, cy] of corners) {
    const r = 9 * unit;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = palette[0];
    ctx.fillStyle = palette[0];
    ctx.beginPath();
    if (theme === 'tattoo') {
      for (const y of [-r, 0, r]) {
        ctx.moveTo(1.2 * unit, y);
        ctx.arc(0, y, 1.2 * unit, 0, Math.PI * 2);
      }
      ctx.fill();
    } else if (theme === 'blueprint') {
      ctx.moveTo(-r, r);
      ctx.lineTo(-r, -r);
      ctx.lineTo(r, -r);
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(r * 0.5, 0);
      ctx.moveTo(0, -r * 0.5);
      ctx.lineTo(0, r * 0.5);
    } else if (theme === 'obsidian' || theme === 'arcane') {
      const sides = theme === 'obsidian' ? 4 : 6;
      for (let i = 0; i <= sides; i++) {
        const a = (i * Math.PI * 2) / sides;
        if (i === 0) ctx.moveTo(0, -r);
        else ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
      }
    } else if (theme === 'occult') {
      ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.moveTo(r * 0.25, 0);
      ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    } else if (theme === 'herbarium' || theme === 'primal') {
      ctx.moveTo(-r * 0.6, r);
      ctx.lineTo(r * 0.6, -r);
      for (let i = 0; i < (theme === 'primal' ? 5 : 2); i++) {
        const y = -r * 0.6 + i * r * 0.3;
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(-r, y - r * 0.5, -r * 0.7, y);
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(r, y - r * 0.4, r * 0.7, y - r * 0.3);
      }
    } else if (theme === 'divine' || theme === 'constellations') {
      const rays = theme === 'divine' ? 12 : 4;
      for (let i = 0; i < rays; i++) {
        const a = (i * Math.PI * 2) / rays;
        ctx.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    } else {
      ctx.moveTo(-r, r * 0.4);
      ctx.bezierCurveTo(-r, -r, r, r, r, -r * 0.4);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Additional faint design-specific accents positioned behind the sigil.
  if (theme === 'constellations') {
    const aura = ctx.createRadialGradient(
      center.x * 0.84,
      center.y * 0.74,
      5,
      center.x * 0.84,
      center.y * 0.74,
      radius * 1.43,
    );
    aura.addColorStop(0, 'rgba(67,137,216,.08)');
    aura.addColorStop(0.65, 'rgba(32,91,173,.045)');
    aura.addColorStop(1, 'rgba(32,91,173,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);
  } else if (theme === 'blueprint') {
    ctx.strokeStyle = palette[0];
    ctx.globalAlpha = 0.6;
    for (let i = 0; i <= 12; i++) {
      const x = 35 + ((w - 70) * i) / 12;
      ctx.beginPath();
      ctx.moveTo(x, 23);
      ctx.lineTo(x, 23 + (i % 3 === 0 ? 9 : 4) * unit);
      ctx.moveTo(x, h - 23);
      ctx.lineTo(x, h - 23 - (i % 3 === 0 ? 9 : 4) * unit);
      ctx.stroke();
    }
  } else if (theme === 'divine' || theme === 'arcane' || theme === 'obsidian') {
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = Math.max(0.6, unit);
    for (const m of [1.08, 1.13]) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * m, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (theme === 'herbarium' || theme === 'primal') {
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = 1;
    for (const x of [27, w - 27]) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.25);
      ctx.bezierCurveTo(
        x + (x < w / 2 ? 7 : -7),
        h * 0.42,
        x - (x < w / 2 ? 7 : -7),
        h * 0.6,
        x,
        h * 0.78,
      );
      ctx.stroke();
    }
  } else if (theme === 'occult') {
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 1.14, -0.72, 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 1.19, 2.35, 5.52);
    ctx.stroke();
  }
  ctx.restore();
}

function paintDecorations(
  settings: ThemeSettings,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const random = seededRandom(settings.decorationSeed);
  const design = baseTheme(settings);
  const unit = Math.max(0.45, Math.min(2.1, Math.min(w / 920, h / 650)));
  const pi2 = Math.PI * 2;
  // Keep ornaments in the perimeter. They are intentionally never connected
  // to spell vertices and never affect the reversible identity tick ring.
  const places = [
    [w * 0.105, h * 0.16],
    [w * 0.875, h * 0.16],
    [w * 0.105, h * 0.79],
    [w * 0.88, h * 0.58],
    [w * 0.45, h * 0.09],
  ];
  const strokeCircle = (
    x: number,
    y: number,
    r: number,
    stroke: string,
    alpha = 1,
  ) => {
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, pi2);
    ctx.stroke();
  };
  const pinStar = (x: number, y: number, r: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.55, r * 0.22), 0, pi2);
    ctx.fill();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.8 * unit;
  if (design === 'tattoo') {
    ctx.strokeStyle = themeColor(settings, 'lines');
    ctx.fillStyle = themeColor(settings, 'lines');
    ctx.globalAlpha = 0.3;
    for (const [x, y] of places) {
      const r = (5 + random() * 5) * unit;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.5, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.5, y);
      ctx.closePath();
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(
          x + (random() - 0.5) * r * 4,
          y + (random() - 0.5) * r * 4,
          0.55 * unit,
          0,
          pi2,
        );
        ctx.fill();
      }
    }
  } else if (design === 'plain') {
    const color = 'rgba(110,81,51,.32)';
    for (let i = 0; i < 4; i++) {
      const [x, y] = places[i];
      const r = (10 + random() * 7) * unit;
      strokeCircle(x, y, r, color, 0.75);
      for (let arm = 0; arm < 6; arm++) {
        const a = (pi2 * arm) / 6 + random() * 0.19;
        const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
        pinStar(p.x, p.y, (1.6 + random() * 2) * unit, color);
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.68;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 1.3);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const left = i % 2 === 0;
      const x = (left ? 0.055 : 0.95) * w;
      const y = (0.21 + random() * 0.57) * h;
      const direction = left ? 1 : -1;
      ctx.strokeStyle = 'rgba(112,84,61,.17)';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + direction * 26 * unit,
        y - 18 * unit,
        x + direction * 36 * unit,
        y + 10 * unit,
        x + direction * 11 * unit,
        y + 18 * unit,
      );
      ctx.stroke();
    }
  } else if (design === 'constellations') {
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = places[i];
      const count = 4 + Math.floor(random() * 3);
      const stars = Array.from({ length: count }, () => ({
        x: cx + (random() - 0.5) * Math.min(w * 0.11, 85 * unit),
        y: cy + (random() - 0.5) * Math.min(h * 0.13, 80 * unit),
        r: (1.4 + random() * 2) * unit,
      }));
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#b0cdeb';
      ctx.lineWidth = 0.65 * unit;
      ctx.beginPath();
      stars.forEach((p, j) =>
        j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.stroke();
      for (const p of stars) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12 * unit);
        halo.addColorStop(0, 'rgba(198,227,255,.30)');
        halo.addColorStop(1, 'rgba(198,227,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12 * unit, 0, pi2);
        ctx.fill();
        pinStar(p.x, p.y, p.r, 'rgba(215,235,255,.76)');
      }
    }
    for (let i = 0; i < 2; i++) {
      const x = (0.25 + random() * 0.5) * w;
      const y = (i === 0 ? 0.085 : 0.89) * h;
      const len = (26 + random() * 25) * unit;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = 'rgba(193,223,255,.57)';
      ctx.lineWidth = 0.85 * unit;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y + len * 0.35);
      ctx.stroke();
      pinStar(x, y, 3.2 * unit, 'rgba(214,231,255,.68)');
    }
  } else if (design === 'blueprint') {
    for (let i = 0; i < 4; i++) {
      const [x, y] = places[i];
      const r = (15 + random() * 12) * unit;
      ctx.lineWidth = 0.8 * unit;
      strokeCircle(x, y, r, 'rgba(131,207,222,.40)', 0.9);
      strokeCircle(x, y, r * 0.66, 'rgba(131,207,222,.28)', 0.8);
      const start = random() * pi2;
      ctx.strokeStyle = 'rgba(169,227,236,.52)';
      ctx.globalAlpha = 0.86;
      ctx.lineWidth = 1.25 * unit;
      ctx.beginPath();
      ctx.arc(x, y, r, start, start + Math.PI * (0.4 + random() * 0.65));
      ctx.stroke();
      pinStar(x, y, 3.4 * unit, 'rgba(133,210,224,.42)');
    }
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.6 * unit;
    ctx.strokeStyle = 'rgba(135,209,222,.36)';
    for (let i = 0; i < 5; i++) {
      const x = (0.24 + random() * 0.53) * w;
      const y = (i % 2 ? 0.105 : 0.9) * h;
      const r = (7 + random() * 8) * unit;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 0.15, Math.PI * 1.65);
      ctx.stroke();
    }
  } else if (design === 'obsidian') {
    for (let i = 0; i < 4; i++) {
      const [x, y] = places[i];
      const r = (11 + random() * 7) * unit;
      strokeCircle(x, y, r, 'rgba(218,170,101,.40)', 0.83);
      strokeCircle(x, y, r * 0.32, 'rgba(218,170,101,.36)', 0.8);
      const petals = 8 + 2 * Math.floor(random() * 3);
      for (let j = 0; j < petals; j++) {
        const a = (pi2 * j) / petals;
        const px = x + Math.cos(a) * r * 0.72;
        const py = y + Math.sin(a) * r * 0.72;
        ctx.globalAlpha = 0.53;
        ctx.fillStyle = 'rgba(221,170,98,.48)';
        ctx.beginPath();
        ctx.ellipse(px, py, 3.5 * unit, 1.2 * unit, a, 0, pi2);
        ctx.fill();
      }
      pinStar(x, y, 2.8 * unit, 'rgba(233,183,117,.56)');
    }
    for (let i = 0; i < 5; i++) {
      const y = (0.22 + random() * 0.58) * h;
      const x = i % 2 ? w * 0.956 : w * 0.044;
      ctx.globalAlpha = 0.56;
      ctx.strokeStyle = 'rgba(213,166,110,.30)';
      ctx.lineWidth = 0.8 * unit;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        (6 + random() * 6) * unit,
        random() * pi2,
        random() * pi2 + Math.PI * 1.15,
      );
      ctx.stroke();
    }
  } else if (design === 'arcane') {
    // Rune wheels and small charged sparks: deterministic, never spell edges.
    for (let i = 0; i < 4; i++) {
      const [x, y] = places[i];
      const r = (14 + random() * 9) * unit;
      ctx.globalAlpha = 0.82;
      ctx.lineWidth = 0.9 * unit;
      strokeCircle(x, y, r, 'rgba(179,159,255,.40)');
      strokeCircle(x, y, r * 0.72, 'rgba(158,191,255,.33)');
      for (let k = 0; k < 7; k++) {
        const a = (k * pi2) / 7 + random() * 0.16,
          inn = r * 0.85,
          out = r * 1.12;
        ctx.strokeStyle = 'rgba(190,176,255,.55)';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inn, y + Math.sin(a) * inn);
        ctx.lineTo(x + Math.cos(a) * out, y + Math.sin(a) * out);
        ctx.stroke();
      }
      pinStar(x, y, (3 + random() * 2) * unit, 'rgba(202,193,255,.77)');
    }
    for (let i = 0; i < 6; i++) {
      const x = (0.24 + random() * 0.54) * w,
        y = (i % 2 ? 0.08 : 0.91) * h;
      ctx.globalAlpha = 0.45;
      pinStar(x, y, (2 + random() * 3) * unit, 'rgba(189,176,246,.57)');
    }
  } else if (design === 'divine') {
    // Sacred sun medallions and leaf-like rays, around the margins.
    for (let i = 0; i < 4; i++) {
      const [x, y] = places[i],
        r = (10 + random() * 10) * unit;
      ctx.lineWidth = 0.9 * unit;
      strokeCircle(x, y, r * 0.72, 'rgba(172,113,41,.39)');
      strokeCircle(x, y, r * 0.34, 'rgba(172,113,41,.47)');
      for (let arm = 0; arm < 12; arm++) {
        const a = (pi2 * arm) / 12,
          inner = r * 0.85,
          outer = r * (1.18 + random() * 0.27);
        ctx.strokeStyle = 'rgba(185,132,51,.55)';
        ctx.globalAlpha = 0.74;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(207,166,89,.38)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.19, 0, pi2);
      ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
      const x = (0.25 + random() * 0.51) * w,
        y = (i % 2 ? 0.1 : 0.87) * h;
      ctx.globalAlpha = 0.58;
      pinStar(x, y, (2.2 + random() * 2) * unit, 'rgba(184,135,66,.44)');
    }
  } else if (design === 'occult') {
    // Broken orbit rings, eyes, and wisps. Imperfect and asymmetrical.
    for (let i = 0; i < 4; i++) {
      const [x, y] = places[i],
        r = (12 + random() * 11) * unit;
      const turn = random() * pi2;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = 'rgba(219,154,197,.50)';
      ctx.lineWidth = 1 * unit;
      ctx.beginPath();
      ctx.arc(x, y, r, turn, turn + Math.PI * (0.85 + random() * 0.45));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, turn + 1, turn + Math.PI * 1.7);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.44, r * 0.2, -0.3, 0, pi2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(222,164,208,.59)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.14, 0, pi2);
      ctx.fill();
    }
    for (let i = 0; i < 7; i++) {
      const left = i % 2 === 0,
        x = left ? w * 0.061 : w * 0.94;
      const y = (0.2 + random() * 0.61) * h,
        d = left ? 1 : -1;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.7 * unit;
      ctx.strokeStyle = 'rgba(224,143,206,.42)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + 15 * d * unit,
        y - 8 * unit,
        x + 30 * d * unit,
        y + 9 * unit,
        x + 16 * d * unit,
        y + 18 * unit,
      );
      ctx.stroke();
    }
  } else if (design === 'primal') {
    // Tiny wandering ivy, spores and seedpods in the side margins.
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? w * 0.069 : w * 0.931,
        dir = side === 0 ? 1 : -1;
      const y0 = h * (0.17 + random() * 0.05),
        y1 = h * (0.73 + random() * 0.05);
      ctx.globalAlpha = 0.63;
      ctx.lineWidth = 1.2 * unit;
      ctx.strokeStyle = 'rgba(160,217,165,.57)';
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(
        x + 23 * dir * unit,
        y0 + h * 0.14,
        x - 18 * dir * unit,
        y1 - h * 0.14,
        x,
        y1,
      );
      ctx.stroke();
      for (let j = 0; j < 9; j++) {
        const t = (j + 0.6) / 10;
        const yy = y0 + (y1 - y0) * t,
          xx = x + Math.sin(t * pi2) * 8 * unit * dir;
        const sign = (j % 2 ? 1 : -1) * dir;
        const len = (7 + random() * 8) * unit;
        ctx.fillStyle = 'rgba(150,212,136,.22)';
        ctx.strokeStyle = 'rgba(153,213,153,.48)';
        ctx.lineWidth = 0.7 * unit;
        ctx.beginPath();
        ctx.ellipse(
          xx + sign * len * 0.55,
          yy,
          len * 0.64,
          len * 0.23,
          sign * 0.55,
          0,
          pi2,
        );
        ctx.fill();
        ctx.stroke();
      }
    }
    for (let i = 0; i < 13; i++) {
      const x = (i % 2 ? w * 0.1 : w * 0.9) + (random() - 0.5) * 36 * unit;
      const y = (0.12 + random() * 0.72) * h;
      ctx.fillStyle = 'rgba(216,240,166,.41)';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, (0.7 + random() * 1.8) * unit, 0, pi2);
      ctx.fill();
    }
  } else if (design === 'herbarium') {
    // A light, ink-drawn vine down each side; leaves are tiny ellipses.
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? w * 0.065 : w * 0.935;
      const sign = side === 0 ? 1 : -1;
      const y0 = h * 0.18 + random() * h * 0.035;
      const y1 = h * 0.7 + random() * h * 0.06;
      const bend = (14 + random() * 12) * unit * sign;
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = 'rgba(72,112,77,.48)';
      ctx.lineWidth = 1.05 * unit;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(
        x + bend,
        y0 + h * 0.2,
        x - bend * 0.5,
        y1 - h * 0.18,
        x,
        y1,
      );
      ctx.stroke();
      for (let j = 0; j < 7; j++) {
        const t = (j + 0.5) / 8;
        const yy = y0 + (y1 - y0) * t;
        const xx = x + Math.sin(t * Math.PI * 2) * bend * 0.38;
        const dir = (j % 2 ? -1 : 1) * sign;
        const len = (8 + random() * 8) * unit;
        ctx.fillStyle = 'rgba(88,127,83,.25)';
        ctx.strokeStyle = 'rgba(69,110,72,.44)';
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.ellipse(
          xx + dir * len * 0.55,
          yy - 3 * unit,
          len * 0.7,
          2.8 * unit,
          dir * (0.38 + random() * 0.35),
          0,
          pi2,
        );
        ctx.fill();
        ctx.stroke();
      }
    }
    for (let i = 0; i < 3; i++) {
      const [cx, cy] = places[[0, 1, 2][i]];
      const r = (6 + random() * 3) * unit;
      ctx.fillStyle = 'rgba(212,188,112,.25)';
      ctx.strokeStyle = 'rgba(88,128,93,.40)';
      ctx.lineWidth = 0.7 * unit;
      ctx.globalAlpha = 0.75;
      for (let j = 0; j < 5; j++) {
        const a = (pi2 * j) / 5;
        ctx.beginPath();
        ctx.ellipse(
          cx + Math.cos(a) * r,
          cy + Math.sin(a) * r,
          r * 0.68,
          r * 0.42,
          a,
          0,
          pi2,
        );
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.44, 0, pi2);
      ctx.fillStyle = 'rgba(159,128,70,.50)';
      ctx.fill();
    }
  }
  ctx.restore();
}
