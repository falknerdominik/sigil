import { parseHexColor } from './color';
import * as ThemePainter from './theme-painter';
import {
  flattenInkPath,
  inkNibWidth,
  splitInkDashes,
  fillInkRibbon,
  strokeInk,
} from './ink-strokes';
import { styleNumber } from './drawing-style';
import type {
  DrawingSettings,
  Point,
  PaletteKey,
  PathContext,
} from './drawing-style';
export type {
  DrawingSettings,
  Point,
  PaletteKey,
  ThemePalette,
} from './drawing-style';
import { DRAWING_DEFAULTS, TRAIT_THEMES, THEME_PALETTES } from './constants';
import type {
  ChordGroup,
  SpellRepresentation,
  Orbit,
} from './spell-calculation';
interface IdentityTick {
  from: Point;
  to: Point;
  index: number;
}
/** Canvas drawing and theme implementation. It consumes calculated notation. */
export class SpellDrawing {
  settings: DrawingSettings;
  drawingVertexCount: number;
  drawingChords: ChordGroup[];
  constructor(options: Partial<DrawingSettings> = {}) {
    this.settings = { ...DRAWING_DEFAULTS, ...options };
    this.drawingVertexCount = 0;
    this.drawingChords = [];
  }

  static rgb = parseHexColor;
  static styleNumber = styleNumber;
  static flattenInkPath = flattenInkPath;
  static inkNibWidth = inkNibWidth;
  static splitInkDashes = splitInkDashes;
  static fillInkRibbon = fillInkRibbon;
  baseTheme() {
    return ThemePainter.baseTheme(this.settings);
  }
  themeColor(key: PaletteKey) {
    return ThemePainter.themeColor(this.settings, key);
  }
  recolorBackground(ctx: CanvasRenderingContext2D) {
    ThemePainter.recolorBackground(this.settings, ctx);
  }
  paintThemeBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    center: Point,
    radius: number,
  ) {
    ThemePainter.paintThemeBackdrop(
      this.settings,
      ctx,
      width,
      height,
      center,
      radius,
    );
  }
  strokeInk(
    ctx: CanvasRenderingContext2D,
    trace: (path: PathContext) => void,
    seed = 0,
  ) {
    strokeInk(ctx, trace, this.settings, seed);
  }

  static readonly traitThemes = TRAIT_THEMES;
  static readonly themePalettes = THEME_PALETTES;
  paintNotation(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    representation: SpellRepresentation,
    options: { transparentBackground?: boolean } = {},
  ) {
    const { complete: encoded, visible } = representation;
    if (
      !encoded ||
      !visible ||
      !Number.isInteger(encoded.vertexCount) ||
      encoded.vertexCount < 1 ||
      encoded.chords.length !== visible.chords.length
    ) {
      throw new Error(
        'Complete and visible notation must have matching chord groups.',
      );
    }
    for (let i = 0; i < encoded.chords.length; i++) {
      const full = encoded.chords[i],
        shown = visible.chords[i];
      const edges = new Set(full.edges.map((edge) => edge.join(',')));
      if (
        full.id !== shown.id ||
        full.k !== shown.k ||
        full.label !== shown.label ||
        full.color !== shown.color ||
        shown.edges.some((edge) => {
          const key = edge.join(',');
          if (!edges.has(key)) return true;
          edges.delete(key);
          return false;
        })
      ) {
        throw new Error('Visible chords must belong to complete notation.');
      }
    }
    const orbitKey = (orbit: Orbit) =>
      JSON.stringify([orbit.vertex, orbit.units, orbit.sweep]);
    const orbits = new Set(encoded.orbits.map(orbitKey));
    if (
      visible.orbits.some((orbit) => {
        const key = orbitKey(orbit);
        if (!orbits.has(key)) return true;
        orbits.delete(key);
        return false;
      })
    ) {
      throw new Error('Visible orbits must belong to complete notation.');
    }
    this.drawingVertexCount = encoded.vertexCount;
    this.drawingChords = encoded.chords;
    // Clear the last fractional device-pixel row as well.
    ctx.clearRect(0, 0, width + 1, height + 1);
    // Fit using the COMPLETE encoded geometry; changing visibility must never
    // rescale a sigil (especially with deep outward-curved connections).
    const { center, radius, points, basePath, identityTicks } =
      this.getGeometry(width, height, encoded.identityBits, encoded.chords);
    const design = this.baseTheme();
    // A card uses the same theme texture with the sigil on top. Suppressing
    // only the backdrop keeps the ink, vertex styling and encoding identical.
    if (!options.transparentBackground) {
      this.paintThemeBackdrop(ctx, width, height, center, radius);
    }
    if (this.settings.guides)
      this.paintGuides(ctx, center, radius, points, basePath);
    if (!options.transparentBackground) this.recolorBackground(ctx);
    // Primary attributes draw chords; secondary attributes form orbits.
    // Resolve theme ink once, rather than rebuilding these palettes per layer.
    const palettes: Record<string, string[]> = {
      blueprint: ['#a6e5f3', '#6bc2dd', '#d3f3f4', '#88bcd5', '#97d6ca'],
      obsidian: ['#e3c48a', '#c69269', '#f0d7a4', '#a88962', '#dcb277'],
      herbarium: ['#566c53', '#83986c', '#446e67', '#7f7659', '#708a5b'],
      arcane: ['#c5b5ff', '#95b7ff', '#b5e4fd', '#e2b4f8', '#aea5ed'],
      divine: ['#a97b36', '#c6a354', '#8d7960', '#b88754', '#997a41'],
      occult: ['#e4a9d1', '#b4abe6', '#d194c6', '#e8b8ba', '#b6a0c9'],
      primal: ['#b3e4ae', '#7cc8b5', '#e5daa4', '#8bce9a', '#abdac6'],
    };
    const family = palettes[design];
    const customInk = this.themeColor('lines');
    const defaultInk = SpellDrawing.themePalettes[design]?.lines;
    const hasCustomInk = customInk.toLowerCase() !== defaultInk?.toLowerCase();
    visible.chords.forEach((group) => {
      ctx.save();
      ctx.strokeStyle = String(
        hasCustomInk
          ? customInk
          : family
            ? family[(group.k - 1) % family.length]
            : customInk,
      );
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth =
        design === 'tattoo'
          ? Math.max(0.9, Math.min(1.6, radius / 150))
          : design === 'constellations'
            ? Math.max(0.85, Math.min(1.3, radius / 175))
            : design === 'blueprint'
              ? 1.5
              : design === 'obsidian'
                ? 1.7
                : design === 'herbarium'
                  ? 1.75
                  : design === 'arcane'
                    ? 1.65
                    : design === 'divine'
                      ? 1.7
                      : design === 'occult'
                        ? 1.45
                        : design === 'primal'
                          ? 1.65
                          : Math.max(1.8, Math.min(2.7, radius / 92));
      ctx.globalAlpha =
        design === 'tattoo'
          ? 0.92
          : design === 'constellations'
            ? 0.55
            : design === 'blueprint'
              ? 0.73
              : design === 'obsidian'
                ? 0.71
                : design === 'herbarium'
                  ? 0.67
                  : design === 'arcane'
                    ? 0.73
                    : design === 'divine'
                      ? 0.74
                      : design === 'occult'
                        ? 0.61
                        : design === 'primal'
                          ? 0.7
                          : 0.8;
      ctx.globalAlpha *= this.drawingChords.length > 8 ? 0.77 : 1;
      ctx.globalAlpha *= SpellDrawing.styleNumber(
        this.settings.chordOpacity,
        1,
        0,
        1,
      );
      if (design === 'constellations') {
        ctx.shadowColor = 'rgba(167,208,252,.44)';
        ctx.shadowBlur = 4;
      } else if (design === 'obsidian') {
        ctx.shadowColor = 'rgba(241,186,113,.40)';
        ctx.shadowBlur = 3;
      } else if (design === 'arcane') {
        ctx.shadowColor = 'rgba(160,135,255,.47)';
        ctx.shadowBlur = 5;
      } else if (design === 'divine') {
        ctx.shadowColor = 'rgba(227,174,77,.25)';
        ctx.shadowBlur = 2;
      } else if (design === 'occult') {
        ctx.shadowColor = 'rgba(214,122,201,.24)';
        ctx.shadowBlur = 4;
      } else if (design === 'primal') {
        ctx.shadowColor = 'rgba(116,205,156,.23)';
        ctx.shadowBlur = 3;
      }
      if (hasCustomInk) ctx.shadowColor = customInk;
      for (const [a, b] of group.edges) {
        this.strokeInk(
          ctx,
          (path) =>
            this.traceConnection(
              path,
              points[a],
              points[b],
              center,
              a + group.k,
            ),
          group.k * 71 + a * 13 + b,
        );
      }
      ctx.restore();
    });
    this.paintOrbits(ctx, center, points, radius, visible.orbits);
    this.paintNodes(ctx, points, radius, width, height);
    this.paintIdentity(ctx, identityTicks);
  }
  /**
   * Base curves from section 2.3.3 of the guide. Values are local coordinates;
   * translation, scaling, mirroring and rotation are applied afterwards.
   *
   * The two polynomial bases are specific, legible examples of the general
   * y = ax^2 + bx + c and y = ax^3 + bx^2 + cx + d families. "bend" adjusts
   * their amplitude without changing the stored binary connections.
   */
  static functionBasePoint(base: string, t: number, bend = 1): Point {
    if (!['semicircle', 'quarter', 'quadratic', 'cubic'].includes(base)) {
      throw new RangeError('Unknown function base: ' + base);
    }
    if (!Number.isFinite(t) || t < 0 || t > 1) {
      throw new RangeError('Function parameter t must be in [0, 1].');
    }
    const x = 2 * t - 1;
    const amplitude = Math.min(1.6, Math.max(0.6, Number(bend) || 1));
    switch (base) {
      case 'semicircle': // x^2 + y^2 = 1, upper half
        return { x: -Math.cos(Math.PI * t), y: -Math.sin(Math.PI * t) };
      case 'quarter': // x^2 + y^2 = 1, one quarter arc
        return {
          x: Math.sin((Math.PI * t) / 2),
          y: Math.cos((Math.PI * t) / 2),
        };
      case 'quadratic': // y = a(1-x^2): symmetrical, inverted parabola
        return { x, y: 1.35 * amplitude * (1 - x * x) };
      case 'cubic': // y = a(x^3 - 0.87x): S-shaped cubic
        return { x, y: 1.8 * amplitude * (x * x * x - 0.87 * x) };
    }
    throw new RangeError('Unknown function base: ' + base);
  }
  /**
   * Arc-length sampling makes all 11 nodes readable even on the steep ends
   * of the parabola/cubic. The guidePath uses dense true function samples.
   */
  static sampleFunctionBase(base: string, count: number, bend = 1) {
    if (!Number.isInteger(count) || count < 2) {
      throw new RangeError('A function base requires at least two vertices.');
    }
    const steps = 600;
    const guidePath = Array.from({ length: steps + 1 }, (_, i) =>
      SpellDrawing.functionBasePoint(base, i / steps, bend),
    );
    const cumulative = [0];
    for (let i = 1; i < guidePath.length; i++) {
      const p = guidePath[i - 1],
        q = guidePath[i];
      cumulative.push(cumulative[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
    }
    const total = cumulative[cumulative.length - 1];
    const vertices = [];
    let segment = 1;
    for (let i = 0; i < count; i++) {
      const distance = (total * i) / (count - 1);
      while (segment < steps && cumulative[segment] < distance) segment++;
      const start = cumulative[segment - 1],
        end = cumulative[segment];
      const portion = Math.max(
        0,
        Math.min(1, (distance - start) / Math.max(1e-12, end - start)),
      );
      const p = guidePath[segment - 1],
        q = guidePath[segment];
      vertices.push({
        x: p.x + (q.x - p.x) * portion,
        y: p.y + (q.y - p.y) * portion,
      });
    }
    return { vertices, guidePath };
  }
  /**
   * Sample a faceted contour by actual distance along its straight edges.
   * Closed polygons keep n encoding nodes even when there are six corners.
   * For an open function curve, facets approximate its sampled shape.
   */
  static samplePolyline(corners: Point[], count: number, closed = false) {
    if (!Array.isArray(corners) || corners.length < 2 || count < 2)
      throw new RangeError('A polygon contour requires at least two corners.');
    const path = closed ? [...corners, corners[0]] : corners;
    const cumulative = [0];
    for (let i = 1; i < path.length; i++)
      cumulative.push(
        cumulative[i - 1] +
          Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y),
      );
    const total = cumulative[cumulative.length - 1];
    const vertices = [];
    let segment = 1;
    for (let i = 0; i < count; i++) {
      const distance = (total * i) / (closed ? count : count - 1);
      while (segment < cumulative.length - 1 && cumulative[segment] < distance)
        segment++;
      const t =
        (distance - cumulative[segment - 1]) /
        Math.max(1e-12, cumulative[segment] - cumulative[segment - 1]);
      const a = path[segment - 1],
        b = path[segment];
      vertices.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return { vertices, guidePath: path };
  }
  /**
   * Lay out every encoded layer together and fit it into the available canvas.
   * Chords, vertex orbits, and identity ticks share the same affine transform.
   * The Layer 3 spell-ID ticks contribute to the fit bounds so they cannot be clipped
   * when rotated, mirrored, or horizontally stretched.
   */
  getGeometry(
    width: number,
    height: number,
    identityBits = '',
    chords: ChordGroup[] = [],
  ) {
    const center = { x: width / 2, y: height / 2 };
    const degrees = Math.max(
      -180,
      Math.min(180, Number(this.settings.rotation) || 0),
    );
    const stretch = Math.max(
      0.6,
      Math.min(1.35, Number(this.settings.stretch) || 1),
    );
    const mirror = this.settings.mirror ? -1 : 1;
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const transform = (point: Point) => {
      const x = point.x * stretch * mirror;
      return { x: x * cos - point.y * sin, y: x * sin + point.y * cos };
    };
    const n = this.drawingVertexCount;
    const base = this.settings.base || 'polygon';
    const sides = Number(this.settings.polygonSides);
    const faceted = Number.isInteger(sides) && sides >= 3 && sides <= 12;
    let vertices,
      basePath = null;
    if (base === 'polygon') {
      const count = faceted ? sides : n;
      const corners = Array.from({ length: count }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        return { x: Math.cos(a), y: Math.sin(a) };
      });
      if (faceted) {
        const sampled = SpellDrawing.samplePolyline(corners, n, true);
        vertices = sampled.vertices;
        basePath = sampled.guidePath;
      } else {
        vertices = corners;
      }
    } else {
      const smooth = SpellDrawing.sampleFunctionBase(
        base,
        n,
        this.settings.baseBend,
      );
      const sampled = faceted
        ? SpellDrawing.samplePolyline(
            SpellDrawing.sampleFunctionBase(
              base,
              sides + 1,
              this.settings.baseBend,
            ).vertices,
            n,
            false,
          )
        : smooth;
      const path = sampled.guidePath;
      const xs = path.map((p) => p.x),
        ys = path.map((p) => p.y);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const halfExtent = Math.max(
        (Math.max(...xs) - Math.min(...xs)) / 2,
        (Math.max(...ys) - Math.min(...ys)) / 2,
        0.001,
      );
      const normalize = (p: Point) => ({
        x: (p.x - midX) / halfExtent,
        y: (p.y - midY) / halfExtent,
      });
      vertices = sampled.vertices.map(normalize);
      basePath = path.map(normalize);
    }
    // Identity slots depend on canvas dimensions and payload length, NOT on
    // rotation/stretch. Those controls simply warp the existing tick layout.
    const referenceRadius = Math.min(width, height) * 0.39;
    const slotsPerRing = Math.max(
      48,
      Math.floor((2 * Math.PI * referenceRadius * 1.21) / 7),
    );
    const ringCount = Math.ceil(identityBits.length / slotsPerRing);
    const relativeGap = 0.044;
    const relativeTick = 0.033;
    const identityTicks = [];
    const allBounds = (basePath || vertices).map(transform);
    let offset = 0;
    for (let ring = 0; ring < ringCount; ring++) {
      const count = Math.min(slotsPerRing, identityBits.length - offset);
      const track = this.identityTrack(
        basePath || vertices,
        count,
        0.21 + ring * relativeGap,
        base === 'polygon',
      );
      for (let i = 0; i < count; i++) {
        const { position, normal } = track[i];
        const from = transform(position);
        const to = transform({
          x: position.x + normal.x * relativeTick,
          y: position.y + normal.y * relativeTick,
        });
        // Fit the complete track, even where bits are zero, to keep the
        // border stable when switching between different identity values.
        allBounds.push(from, to);
        if (identityBits[offset + i] === '1') {
          identityTicks.push({ index: offset + i, from, to });
        }
      }
      offset += count;
    }
    // Curved chords can bulge beyond their endpoints, especially with a large
    // outward arc depth. Include their exact cardinal-point extrema in the fit
    // rather than clipping the drawing at the canvas edge.
    if (chords.length && this.settings.style !== 'straight') {
      const projectedVertices = vertices.map(transform);
      const tau = 2 * Math.PI;
      const positive = (value: number) => ((value % tau) + tau) % tau;
      const recorder: PathContext = {
        moveTo() {},
        lineTo() {},
        arc(x, y, r, start, end, anticlockwise = false) {
          const sweep = positive(anticlockwise ? start - end : end - start);
          for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
            const distance = positive(anticlockwise ? start - a : a - start);
            if (distance <= sweep + 1e-10) {
              allBounds.push({
                x: x + r * Math.cos(a),
                y: y + r * Math.sin(a),
              });
            }
          }
        },
      };
      for (const group of chords) {
        for (const [a, b] of group.edges) {
          this.traceConnection(
            recorder,
            projectedVertices[a],
            projectedVertices[b],
            { x: 0, y: 0 },
            a + group.k,
          );
        }
      }
    }
    const maxX = Math.max(0.001, ...allBounds.map((p) => Math.abs(p.x)));
    const maxY = Math.max(0.001, ...allBounds.map((p) => Math.abs(p.y)));
    const padding = Math.max(27, Math.min(42, Math.min(width, height) * 0.058));
    const scale = Math.max(
      0.01,
      Math.min(
        Math.max(1, width / 2 - padding) / maxX,
        Math.max(1, height / 2 - padding) / maxY,
      ),
    );
    const place = (p: Point) => ({
      x: center.x + p.x * scale,
      y: center.y + p.y * scale,
    });
    return {
      center,
      radius: scale,
      points: vertices.map((point) => place(transform(point))),
      basePath: basePath?.map((point) => place(transform(point))) || null,
      identityTicks: identityTicks.map((tick) => ({
        index: tick.index,
        from: place(tick.from),
        to: place(tick.to),
      })),
      identityLayout: {
        slotsPerRing,
        ringCount,
        bitCount: identityBits.length,
      },
    };
  }
  /** Canvas dash lengths shared by Layer 2 orbits and Layer 3 ID ticks. */
  static linePattern(style: string, width: number) {
    if (style === 'dashed')
      return [Math.max(1.5, width * 2.3), Math.max(1.5, width * 1.8)];
    if (style === 'dotted')
      return [Math.max(0.25, width * 0.25), Math.max(1.8, width * 2.2)];
    return [];
  }
  /** Draw one orbit at every active vertex. */
  paintOrbits(
    ctx: CanvasRenderingContext2D,
    center: Point,
    points: Point[],
    radius: number,
    orbits: Orbit[],
  ) {
    if (!orbits.length) return;
    const design = this.baseTheme();
    const customInk = this.themeColor('lines');
    const defaultInk = SpellDrawing.themePalettes[design]?.lines;
    const hasCustomInk = customInk.toLowerCase() !== defaultInk?.toLowerCase();
    const themedInks: Record<string, string> = {
      blueprint: '#d3f3f4',
      obsidian: '#f0d7a4',
      herbarium: '#446e67',
      arcane: '#b5e4fd',
      divine: '#8d7960',
      occult: '#d194c6',
      primal: '#e5daa4',
    };
    const ink = hasCustomInk
      ? customInk
      : themedInks[design] || this.themeColor('lines');
    const orbitRadius = Math.max(9.5, radius * 0.06);
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(
      0.5,
      Math.min(3, Number(this.settings.orbitWidth) || 1.25),
    );
    ctx.setLineDash(
      SpellDrawing.linePattern(this.settings.orbitLineStyle, ctx.lineWidth),
    );
    ctx.globalAlpha =
      design === 'tattoo'
        ? 0.92
        : design === 'constellations'
          ? 0.56
          : design === 'blueprint'
            ? 0.83
            : 0.76;
    ctx.globalAlpha *= SpellDrawing.styleNumber(
      this.settings.orbitOpacity,
      1,
      0,
      1,
    );
    if (design === 'constellations') {
      ctx.shadowColor = hasCustomInk ? customInk : 'rgba(167,208,252,.34)';
      ctx.shadowBlur = 3;
    } else if (hasCustomInk) {
      ctx.shadowColor = customInk;
      ctx.shadowBlur = 2;
    }
    for (const orbit of orbits) {
      const point = points[orbit.vertex];
      const outwardAngle = Math.atan2(point.y - center.y, point.x - center.x);
      // Always start on the same side relative to the center, independent of
      // base shape or editor rotation. The sweep carries the section mask.
      const start = outwardAngle - Math.PI / 2;
      this.strokeInk(
        ctx,
        (path) =>
          path.arc(point.x, point.y, orbitRadius, start, start + orbit.sweep),
        2000 + orbit.vertex * 17 + orbit.units,
      );
    }
    ctx.restore();
  }
  identityTrack(
    guidePath: Point[],
    count: number,
    offset = 0.21,
    closed = false,
  ) {
    // Short tracks need extra samples to determine a nonzero tangent.
    const sampleCount =
      count === 1 ? (closed ? 3 : 2) : count === 2 && closed ? 4 : count;
    const sampled = SpellDrawing.samplePolyline(
      guidePath,
      sampleCount,
      closed,
    ).vertices;
    const indices =
      count === 1
        ? [0]
        : count === 2 && closed
          ? [0, 2]
          : sampled.map((_, i) => i);
    return indices.map((index) => {
      const position = sampled[index];
      const previous =
        sampled[(index - 1 + sampled.length) % sampled.length] ?? position;
      const next = sampled[(index + 1) % sampled.length] ?? position;
      const before = closed || index > 0 ? previous : position;
      const after = closed || index < sampled.length - 1 ? next : position;
      const tangent = { x: after.x - before.x, y: after.y - before.y };
      const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
      const left = {
        x: -tangent.y / tangentLength,
        y: tangent.x / tangentLength,
      };
      const right = { x: -left.x, y: -left.y };
      const outward =
        (position.x + left.x * offset) ** 2 +
          (position.y + left.y * offset) ** 2 >=
        (position.x + right.x * offset) ** 2 +
          (position.y + right.y * offset) ** 2
          ? left
          : right;
      const trackPosition = {
        x: position.x + outward.x * offset,
        y: position.y + outward.y * offset,
      };
      return {
        position: trackPosition,
        normal: { x: -outward.x, y: -outward.y },
      };
    });
  }
  /**
   * Draw the pre-positioned Layer 3 spell-ID bits. The tick endpoints come from
   * getGeometry(), so their orientation, squeeze, and base-curve offset match the main sigil.
   */
  static identityMarkerShape(style: string, index: number) {
    if (style === 'mixed') return ['line', 'dot', 'square'][index % 3];
    return ['line', 'dot', 'square'].includes(style) ? style : 'line';
  }
  /**
   * Paint one visible marker for every Layer 3 1-bit. A zero bit remains blank.
   * The Mixed variant uses the original bit index for a stable shape choice;
   * changing any styling never changes bit positions, values, or reading order.
   */
  paintIdentity(ctx: CanvasRenderingContext2D, ticks: IdentityTick[]) {
    const design = this.baseTheme();
    const ink = this.themeColor('lines');
    const defaultInk = SpellDrawing.themePalettes[design]?.lines;
    const overridden = ink.toLowerCase() !== defaultInk?.toLowerCase();
    const lineWidth = SpellDrawing.styleNumber(
      this.settings.identityTickWidth,
      DRAWING_DEFAULTS.identityTickWidth,
      0.5,
      3,
    );
    const dotSize = SpellDrawing.styleNumber(
      this.settings.identityDotSize,
      3.5,
      1,
      10,
    );
    const squareSize = SpellDrawing.styleNumber(
      this.settings.identitySquareSize,
      4.5,
      1,
      12,
    );
    const pointStrokeWidth = SpellDrawing.styleNumber(
      this.settings.identityPointStrokeWidth,
      1,
      0.5,
      3,
    );
    const markerOpacity = SpellDrawing.styleNumber(
      this.settings.identityMarkerOpacity,
      DRAWING_DEFAULTS.identityMarkerOpacity,
      0,
      1,
    );
    const shapeSetting = this.settings.identityTickShape || 'line';
    const inks: Record<string, string> = {
      plain: 'rgba(102,88,67,.62)',
      constellations: 'rgba(203,226,255,.70)',
      blueprint: 'rgba(144,210,227,.72)',
      obsidian: 'rgba(228,188,125,.74)',
      herbarium: 'rgba(82,107,77,.78)',
      arcane: 'rgba(205,194,255,.82)',
      divine: 'rgba(131,91,42,.80)',
      occult: 'rgba(238,195,225,.84)',
      primal: 'rgba(182,230,179,.82)',
      tattoo: this.themeColor('lines'),
    };
    const markerInk = overridden ? ink : inks[design] || inks.plain;
    ctx.save();
    ctx.strokeStyle = markerInk;
    ctx.fillStyle = markerInk;
    ctx.globalAlpha *= markerOpacity;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(
      SpellDrawing.linePattern(this.settings.identityTickLineStyle, lineWidth),
    );
    for (const { from, to, index = 0 } of ticks) {
      const shape = SpellDrawing.identityMarkerShape(shapeSetting, index);
      if (shape === 'line') {
        this.strokeInk(
          ctx,
          (path) => {
            path.moveTo(from.x, from.y);
            path.lineTo(to.x, to.y);
          },
          4000 + index * 7,
        );
        continue;
      }
      // Ink feathering softly affects filled / outlined ID symbols as well.
      if (this.settings.handDrawnInk) {
        ctx.shadowColor = markerInk;
        ctx.shadowBlur =
          0.6 +
          SpellDrawing.styleNumber(this.settings.inkFeather, 0.3, 0, 1) * 2;
      }
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      ctx.save();
      ctx.setLineDash([]); // Dashed / dotted applies only to line markers.
      ctx.lineWidth = pointStrokeWidth;
      if (shape === 'dot') {
        ctx.beginPath();
        ctx.arc(midX, midY, dotSize / 2, 0, 2 * Math.PI);
        if (this.settings.identityDotFill === 'outline') ctx.stroke();
        else ctx.fill();
      } else {
        const orientation = this.settings.identitySquareOrientation;
        const angle =
          orientation === 'upright'
            ? 0
            : orientation === 'diamond'
              ? Math.PI / 4
              : Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 4;
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        if (this.settings.identitySquareFill === 'outline') {
          ctx.strokeRect(
            -squareSize / 2,
            -squareSize / 2,
            squareSize,
            squareSize,
          );
        } else {
          ctx.fillRect(
            -squareSize / 2,
            -squareSize / 2,
            squareSize,
            squareSize,
          );
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
  paintGuides(
    ctx: CanvasRenderingContext2D,
    center: Point,
    radius: number,
    nodes: Point[],
    basePath: Point[] | null = null,
  ) {
    ctx.save();
    const design = this.baseTheme();
    ctx.strokeStyle =
      design === 'constellations'
        ? 'rgba(185,214,247,.15)'
        : design === 'blueprint'
          ? 'rgba(129,209,223,.2)'
          : design === 'obsidian'
            ? 'rgba(216,170,107,.18)'
            : design === 'herbarium'
              ? 'rgba(86,113,71,.19)'
              : design === 'arcane'
                ? 'rgba(192,181,255,.19)'
                : design === 'divine'
                  ? 'rgba(163,116,48,.19)'
                  : design === 'occult'
                    ? 'rgba(222,157,202,.17)'
                    : design === 'primal'
                      ? 'rgba(168,213,170,.18)'
                      : 'rgba(103,87,62,.19)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    for (const r of [radius * 0.48, radius * 0.76, radius]) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([2, 8]);
    nodes.forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    if (basePath) {
      // Guide-only visualization of the exact sampled base function.
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle =
        design === 'constellations'
          ? 'rgba(185,214,247,.23)'
          : design === 'blueprint'
            ? 'rgba(129,209,223,.3)'
            : design === 'obsidian'
              ? 'rgba(216,170,107,.27)'
              : design === 'herbarium'
                ? 'rgba(86,113,71,.29)'
                : design === 'arcane'
                  ? 'rgba(192,181,255,.28)'
                  : design === 'divine'
                    ? 'rgba(163,116,48,.28)'
                    : design === 'occult'
                      ? 'rgba(222,157,202,.26)'
                      : design === 'primal'
                        ? 'rgba(168,213,170,.29)'
                        : 'rgba(104,82,51,.36)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      basePath.forEach((point, i) =>
        i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
  /** Draw real circular arcs with ctx.arc (never a Bezier approximation). */
  traceConnection(
    ctx: PathContext,
    p: Point,
    q: Point,
    spellCenter: Point,
    edgeIndex = 0,
  ) {
    if (this.settings.style === 'straight') {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      return;
    }
    const dx = q.x - p.x,
      dy = q.y - p.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return;
    const middle = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const normal = { x: -dy / length, y: dx / length };
    const dot =
      normal.x * (spellCenter.x - middle.x) +
      normal.y * (spellCenter.y - middle.y);
    // Each true circular arc is defined by its chord and sagitta; the circle
    // center is off the chord midpoint except for the centred semicircle mode.
    const inward = dot >= 0 ? 1 : -1;
    const side =
      this.settings.arcSide === 'outward'
        ? -inward
        : this.settings.arcSide === 'alternate' && edgeIndex % 2
          ? -inward
          : inward;
    const sagitta =
      this.settings.style === 'centered'
        ? length / 2
        : length *
          Math.min(
            0.47,
            Math.max(0.05, Number(this.settings.curvature) || 0.22),
          );
    // Exact circle geometry for a chord with length d and bulge s:
    // R = d^2/(8s) + s/2. It is safe for vertical chords as well.
    const circleRadius = (length * length) / (8 * sagitta) + sagitta / 2;
    const offset = sagitta - circleRadius;
    const circle = {
      x: middle.x + side * normal.x * offset,
      y: middle.y + side * normal.y * offset,
    };
    const midpointOnArc = {
      x: middle.x + side * normal.x * sagitta,
      y: middle.y + side * normal.y * sagitta,
    };
    const a0 = Math.atan2(p.y - circle.y, p.x - circle.x);
    const a1 = Math.atan2(q.y - circle.y, q.x - circle.x);
    const aMiddle = Math.atan2(
      midpointOnArc.y - circle.y,
      midpointOnArc.x - circle.x,
    );
    const modTau = (angle: number) =>
      ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const positiveSweep = modTau(a1 - a0);
    const midpointSweep = modTau(aMiddle - a0);
    const anticlockwise = midpointSweep > positiveSweep;
    ctx.arc(circle.x, circle.y, circleRadius, a0, a1, anticlockwise);
  }
  /** Each option changes the marker silhouette but not its binary data. */
  static traceNode(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    style: string,
  ) {
    ctx.beginPath();
    if (style === 'circle' || style === 'empty') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return;
    }
    if (style === 'cross') {
      const b = r * 0.32;
      const arms = [
        [-b, -r],
        [b, -r],
        [b, -b],
        [r, -b],
        [r, b],
        [b, b],
        [b, r],
        [-b, r],
        [-b, b],
        [-r, b],
        [-r, -b],
        [-b, -b],
      ];
      arms.forEach(([dx, dy], i) =>
        i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy),
      );
      ctx.closePath();
      return;
    }
    const vertices =
      style === 'star'
        ? 10
        : style === 'triangle'
          ? 3
          : style === 'hexagon'
            ? 6
            : 4;
    const start = style === 'square' ? -Math.PI / 4 : -Math.PI / 2;
    for (let i = 0; i < vertices; i++) {
      const a = start + (i * 2 * Math.PI) / vertices;
      const rr = style === 'star' && i % 2 ? r * 0.45 : r;
      const px = x + Math.cos(a) * rr,
        py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  paintNodes(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    radius: number,
    width: number,
    height: number,
  ) {
    const style = [
      'none',
      'empty',
      'circle',
      'star',
      'diamond',
      'square',
      'triangle',
      'hexagon',
      'cross',
    ].includes(this.settings.dotStyle)
      ? this.settings.dotStyle
      : 'circle';
    const scale = Math.max(
      0.5,
      Math.min(2.5, Number(this.settings.vertexSize) || 1),
    );
    const base = Math.max(3.6, Math.min(5.4, radius / 50));
    const nodeRadius =
      (base + 1.8) *
      (style === 'circle' || style === 'empty' ? 1 : 1.35) *
      scale *
      Math.max(0.67, Math.sqrt(11 / this.drawingVertexCount));
    const mean = points.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 },
    );
    mean.x /= points.length;
    mean.y /= points.length;
    ctx.save();
    const design = this.baseTheme();
    const vertexColor = this.themeColor('vertices');
    const customVertices =
      vertexColor.toLowerCase() !==
      SpellDrawing.themePalettes[design]?.vertices.toLowerCase();
    const vertexStroke = Math.max(
      0.5,
      Math.min(5, Number(this.settings.vertexStroke) || 1.5),
    );
    const traditionMarkers: Record<
      string,
      {
        fill: string;
        outline: string;
        core: string;
        glow: string;
      }
    > = {
      arcane: {
        fill: '#1c2048',
        outline: '#cdc5ff',
        core: '#efe9ff',
        glow: 'rgba(157,147,255,.62)',
      },
      divine: {
        fill: '#fff8e8',
        outline: '#b08747',
        core: '#bb8739',
        glow: 'rgba(234,177,69,.34)',
      },
      occult: {
        fill: '#25172e',
        outline: '#e6b1d5',
        core: '#f5daef',
        glow: 'rgba(218,139,198,.46)',
      },
      primal: {
        fill: '#17372c',
        outline: '#b3dba5',
        core: '#e2efc2',
        glow: 'rgba(154,215,151,.34)',
      },
    };
    const labelMode =
      this.settings.vertexLabels !== 'none'
        ? this.settings.vertexLabels
        : this.settings.labels
          ? 'numbers'
          : 'none';
    points.forEach((point, i) => {
      if (style !== 'none') {
        if (design === 'tattoo') {
          SpellDrawing.traceNode(
            ctx,
            point.x,
            point.y,
            nodeRadius * 0.65,
            style,
          );
          ctx.strokeStyle = vertexColor;
          ctx.fillStyle = vertexColor;
          ctx.lineWidth = vertexStroke;
          if (style !== 'empty') ctx.fill();
          ctx.stroke();
        } else if (design === 'constellations') {
          // A miniature illuminated star; size slider remains functional.
          const halo = ctx.createRadialGradient(
            point.x,
            point.y,
            0,
            point.x,
            point.y,
            nodeRadius * 3.4,
          );
          halo.addColorStop(0, 'rgba(207,234,255,.43)');
          halo.addColorStop(0.35, 'rgba(125,181,240,.13)');
          halo.addColorStop(1, 'rgba(100,155,223,0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(point.x, point.y, nodeRadius * 3.4, 0, 2 * Math.PI);
          ctx.fill();
          ctx.save();
          SpellDrawing.traceNode(
            ctx,
            point.x,
            point.y,
            nodeRadius * 0.8,
            style,
          );
          ctx.fillStyle = style === 'empty' ? '#101e34' : '#f4faff';
          ctx.shadowColor = 'rgba(198,229,255,.95)';
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.strokeStyle = 'rgba(239,248,255,.97)';
          ctx.lineWidth = vertexStroke;
          if (customVertices) ctx.strokeStyle = vertexColor;
          ctx.stroke();
          if (style !== 'empty') {
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              Math.max(0.6, 0.72 * scale),
              0,
              2 * Math.PI,
            );
            ctx.fillStyle = customVertices ? vertexColor : '#ffffff';
            ctx.fill();
          }
          ctx.restore();
        } else if (design === 'blueprint') {
          SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius, style);
          ctx.fillStyle = '#102b3a';
          ctx.fill();
          ctx.strokeStyle = '#a5e6ef';
          ctx.lineWidth = vertexStroke;
          if (customVertices) ctx.strokeStyle = vertexColor;
          ctx.stroke();
          if (style !== 'empty') {
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              Math.max(0.8, 1.05 * scale),
              0,
              2 * Math.PI,
            );
            ctx.fillStyle = customVertices ? vertexColor : '#b5f2f5';
            ctx.fill();
          }
        } else if (design === 'obsidian') {
          SpellDrawing.traceNode(
            ctx,
            point.x,
            point.y,
            nodeRadius * 0.93,
            style,
          );
          ctx.fillStyle = '#1c1f23';
          ctx.fill();
          ctx.strokeStyle = '#f1ca89';
          ctx.shadowColor = 'rgba(240,186,112,.34)';
          ctx.shadowBlur = 6;
          ctx.lineWidth = vertexStroke;
          if (customVertices) ctx.strokeStyle = vertexColor;
          ctx.stroke();
          if (style !== 'empty') {
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              Math.max(0.65, 0.85 * scale),
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = customVertices ? vertexColor : '#e8c085';
            ctx.fill();
          }
        } else if (design === 'herbarium') {
          SpellDrawing.traceNode(
            ctx,
            point.x,
            point.y,
            nodeRadius * 0.95,
            style,
          );
          ctx.fillStyle = '#ecf1e4';
          ctx.fill();
          ctx.strokeStyle = '#4c6652';
          ctx.lineWidth = vertexStroke;
          if (customVertices) ctx.strokeStyle = vertexColor;
          ctx.stroke();
          if (style !== 'empty') {
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              Math.max(0.75, 0.9 * scale),
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = customVertices ? vertexColor : '#7d8c61';
            ctx.fill();
          }
        } else if (['arcane', 'divine', 'occult', 'primal'].includes(design)) {
          const palette = traditionMarkers[design];
          const r =
            nodeRadius *
            (design === 'arcane' ? 0.83 : design === 'occult' ? 0.82 : 0.9);
          if (design !== 'divine') {
            const light = ctx.createRadialGradient(
              point.x,
              point.y,
              0,
              point.x,
              point.y,
              r * 2.8,
            );
            light.addColorStop(0, palette.glow);
            light.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = light;
            ctx.beginPath();
            ctx.arc(point.x, point.y, r * 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.save();
          SpellDrawing.traceNode(ctx, point.x, point.y, r, style);
          ctx.fillStyle = palette.fill;
          ctx.fill();
          ctx.strokeStyle = palette.outline;
          ctx.lineWidth = vertexStroke;
          ctx.shadowColor = palette.glow;
          ctx.shadowBlur = design === 'divine' ? 3 : 7;
          if (customVertices) ctx.strokeStyle = vertexColor;
          ctx.stroke();
          if (style !== 'empty') {
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              Math.max(0.65, 0.9 * scale),
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = customVertices ? vertexColor : palette.core;
            ctx.fill();
          }
          ctx.restore();
        } else {
          SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius, style);
          ctx.fillStyle = '#fcf9ef';
          ctx.fill();
          ctx.strokeStyle = 'rgba(91,74,49,.85)';
          ctx.lineWidth = vertexStroke;
          if (customVertices) ctx.strokeStyle = vertexColor;
          ctx.stroke();
          if (style !== 'empty') {
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              Math.max(0.8, 1.05 * scale),
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = customVertices ? vertexColor : '#857052';
            ctx.fill();
          }
        }
      }
      if (labelMode === 'numbers') {
        const vx = point.x - mean.x,
          vy = point.y - mean.y;
        const length = Math.max(1, Math.hypot(vx, vy));
        ctx.fillStyle =
          design === 'tattoo'
            ? vertexColor
            : design === 'constellations'
              ? '#93b0d2'
              : design === 'blueprint'
                ? '#92c9d5'
                : design === 'obsidian'
                  ? '#c6a276'
                  : design === 'herbarium'
                    ? '#71826b'
                    : design === 'arcane'
                      ? '#aaa4d9'
                      : design === 'divine'
                        ? '#987a49'
                        : design === 'occult'
                          ? '#c4a1c1'
                          : design === 'primal'
                            ? '#a8cdb0'
                            : '#94876b';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const offset = style === 'none' ? 15 : nodeRadius + 15;
        ctx.fillText(
          String(i + 1).padStart(2, '0'),
          point.x + (vx / length) * offset,
          point.y + (vy / length) * offset,
        );
      }
    });
    ctx.restore();
    if (this.settings.vertexLabels === 'attributes') {
      this.paintAttributeVertexLabels(ctx, points, width, height);
    }
  }
  /**
   * Optional attribute names at evenly spaced reference vertices.
   * This is purely a reading aid: UBS attributes are encoded by k (chord
   * distance), not by owning a vertex. Remaining vertices stay unlabelled.
   */
  paintAttributeVertexLabels(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    width: number,
    height: number,
  ) {
    const mean = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), {
      x: 0,
      y: 0,
    });
    mean.x /= points.length;
    mean.y /= points.length;
    const isPolygon = (this.settings.base || 'polygon') === 'polygon';
    ctx.save();
    ctx.font = `${width < 620 ? '600 10px' : '600 11px'} ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawingChords.forEach((attribute, attributeIndex) => {
      const index =
        Math.round(
          (attributeIndex * points.length) / this.drawingChords.length,
        ) % points.length;
      const point = points[index];
      let nx = point.x - mean.x,
        ny = point.y - mean.y;
      if (!isPolygon) {
        const before = points[Math.max(0, index - 1)];
        const after = points[Math.min(points.length - 1, index + 1)];
        const tx = after.x - before.x,
          ty = after.y - before.y;
        // Place the annotation on the outer normal of the open curve.
        nx = -ty;
        ny = tx;
        if (nx * (point.x - mean.x) + ny * (point.y - mean.y) < 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      const length = Math.max(1, Math.hypot(nx, ny));
      const text = String(attribute.label);
      const textWidth = ctx.measureText(text).width;
      const margin = 34;
      const pad = 5;
      const labelOffset =
        (isPolygon ? 32 : 36) +
        (this.settings.dotStyle === 'none'
          ? 0
          : Math.max(0, Number(this.settings.vertexSize || 1) - 1) * 8);
      const idealX = point.x + (nx / length) * labelOffset;
      const idealY = point.y + (ny / length) * labelOffset;
      const x = Math.min(
        width - margin - textWidth / 2 - pad,
        Math.max(margin + textWidth / 2 + pad, idealX),
      );
      const y = Math.min(height - 72, Math.max(72, idealY));
      ctx.fillStyle =
        this.baseTheme() === 'tattoo'
          ? this.themeColor('background')
          : this.baseTheme() === 'constellations'
            ? 'rgba(9,23,43,.82)'
            : this.baseTheme() === 'blueprint'
              ? 'rgba(7,34,48,.9)'
              : this.baseTheme() === 'obsidian'
                ? 'rgba(25,26,28,.91)'
                : this.baseTheme() === 'herbarium'
                  ? 'rgba(235,241,227,.91)'
                  : this.baseTheme() === 'arcane'
                    ? 'rgba(17,22,52,.88)'
                    : this.baseTheme() === 'divine'
                      ? 'rgba(252,244,227,.94)'
                      : this.baseTheme() === 'occult'
                        ? 'rgba(28,17,36,.91)'
                        : this.baseTheme() === 'primal'
                          ? 'rgba(11,37,29,.91)'
                          : 'rgba(249,245,234,.88)';
      ctx.fillRect(x - textWidth / 2 - pad, y - 9, textWidth + 2 * pad, 18);
      ctx.fillStyle =
        this.baseTheme() === 'tattoo'
          ? this.themeColor('lines')
          : this.baseTheme() === 'constellations'
            ? '#deebf9'
            : this.baseTheme() === 'blueprint'
              ? '#b6e4ec'
              : this.baseTheme() === 'obsidian'
                ? '#f0c991'
                : this.baseTheme() === 'herbarium'
                  ? '#536c54'
                  : this.baseTheme() === 'arcane'
                    ? '#dad4ff'
                    : this.baseTheme() === 'divine'
                      ? '#947036'
                      : this.baseTheme() === 'occult'
                        ? '#f0c9e2'
                        : this.baseTheme() === 'primal'
                          ? '#b8d8ad'
                          : '#76644c';
      ctx.fillText(text, x, y + 0.4);
    });
    ctx.restore();
  }
}
