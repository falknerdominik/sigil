import { DRAWING_DEFAULTS, TRAIT_THEMES, THEME_PALETTES } from './constants';
import type { ChordGroup, SpellRepresentation, Orbit } from './spell-calculation';
export interface Point {
    x: number;
    y: number;
}
interface InkPoint extends Point {
    t: number;
}
interface IdentityTick {
    from: Point;
    to: Point;
    index: number;
}
type PathContext = Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'arc'>;
export type PaletteKey = 'background' | 'lines' | 'vertices';
export type ThemePalette = Record<PaletteKey, string>;
export interface DrawingSettings {
    design: string;
    style: string;
    curvature: number;
    arcSide: string;
    dotStyle: string;
    vertexSize: number;
    vertexStroke: number;
    chordOpacity: number;
    orbitOpacity: number;
    orbitWidth: number;
    orbitLineStyle: string;
    identityTickWidth: number;
    identityTickLineStyle: string;
    identityTickShape: string;
    identityDotSize: number;
    identityDotFill: string;
    identitySquareSize: number;
    identitySquareFill: string;
    identitySquareOrientation: string;
    identityPointStrokeWidth: number;
    identityMarkerOpacity: number;
    handDrawnInk: boolean;
    inkWobble: number;
    inkPressure: number;
    inkFeather: number;
    rankComplexity: boolean;
    base: string;
    polygonSides: string | number;
    baseBend: number;
    vertexLabels: string;
    rotation: number;
    stretch: number;
    mirror: boolean;
    guides: boolean;
    decorations: boolean;
    cornerOrnaments: boolean;
    decorationSeed: number;
    labels: boolean;
    themeColors: ThemePalette | null;
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
    static readonly traitThemes = TRAIT_THEMES;
    baseTheme() {
        const theme = this.settings.design;
        if (theme.startsWith('trait-')) {
            const name = Object.keys(SpellDrawing.traitThemes).find(key => 'trait-' + key.toLowerCase() === theme);
            return name ? SpellDrawing.traitThemes[name].base : 'plain';
        }
        return theme;
    }
    static readonly themePalettes = THEME_PALETTES;
    themeColor(key: PaletteKey) {
        const defaults = SpellDrawing.themePalettes[this.settings.design] || SpellDrawing.themePalettes.plain;
        const proposed = this.settings.themeColors?.[key];
        return typeof proposed === 'string' && /^#[0-9a-f]{6}$/i.test(proposed) ? proposed : defaults[key];
    }
    static rgb(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
    /** Recolor the theme's painted background without removing its texture,
     *  stars, ornaments, vignette or fine detail. No pixels change at defaults. */
    recolorBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const base = SpellDrawing.themePalettes[this.baseTheme()] || SpellDrawing.themePalettes.plain;
        const chosen = this.themeColor('background');
        if (chosen.toLowerCase() === base.background.toLowerCase())
            return;
        const original = SpellDrawing.rgb(base.background), target = SpellDrawing.rgb(chosen);
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
    paintNotation(ctx: CanvasRenderingContext2D, width: number, height: number, representation: SpellRepresentation, options: { transparentBackground?: boolean } = {}) {
        const {complete: encoded, visible} = representation;
        if (!encoded || !visible || !Number.isInteger(encoded.vertexCount) || encoded.vertexCount < 1 ||
            encoded.chords.length !== visible.chords.length) {
            throw new Error('Complete and visible notation must have matching chord groups.');
        }
        for (let i = 0; i < encoded.chords.length; i++) {
            const full = encoded.chords[i], shown = visible.chords[i];
            const edges = new Set(full.edges.map(edge => edge.join(',')));
            if (full.id !== shown.id || full.k !== shown.k ||
                full.label !== shown.label || full.color !== shown.color ||
                shown.edges.some(edge => {
                    const key = edge.join(',');
                    if (!edges.has(key)) return true;
                    edges.delete(key);
                    return false;
                })) {
                throw new Error('Visible chords must belong to complete notation.');
            }
        }
        const orbitKey = (orbit: Orbit) => JSON.stringify([orbit.vertex, orbit.units, orbit.sweep]);
        const orbits = new Set(encoded.orbits.map(orbitKey));
        if (visible.orbits.some(orbit => {
            const key = orbitKey(orbit);
            if (!orbits.has(key)) return true;
            orbits.delete(key);
            return false;
        })) {
            throw new Error('Visible orbits must belong to complete notation.');
        }
        this.drawingVertexCount = encoded.vertexCount;
        this.drawingChords = encoded.chords;
        // Clear the last fractional device-pixel row as well.
        ctx.clearRect(0, 0, width + 1, height + 1);
        // Fit using the COMPLETE encoded geometry; changing visibility must never
        // rescale a sigil (especially with deep outward-curved connections).
        const { center, radius, points, basePath, identityTicks } = this.getGeometry(width, height, encoded.identityBits, encoded.chords);
        const design = this.baseTheme();
        // A card uses the same theme texture with the sigil on top. Suppressing
        // only the backdrop keeps the ink, vertex styling and encoding identical.
        if (!options.transparentBackground) {
            this.paintThemeBackdrop(ctx, width, height, center, radius);
        }
        if (this.settings.guides)
            this.paintGuides(ctx, center, radius, points, basePath);
        if (!options.transparentBackground)
            this.recolorBackground(ctx, width, height);
        // Primary attributes draw chords; secondary attributes form orbits.
        // Resolve theme ink once, rather than rebuilding these palettes per layer.
        const palettes: Record<string, string[]> = {
            blueprint: ['#a6e5f3', '#6bc2dd', '#d3f3f4', '#88bcd5', '#97d6ca'],
            obsidian: ['#e3c48a', '#c69269', '#f0d7a4', '#a88962', '#dcb277'],
            herbarium: ['#566c53', '#83986c', '#446e67', '#7f7659', '#708a5b'],
            arcane: ['#c5b5ff', '#95b7ff', '#b5e4fd', '#e2b4f8', '#aea5ed'],
            divine: ['#a97b36', '#c6a354', '#8d7960', '#b88754', '#997a41'],
            occult: ['#e4a9d1', '#b4abe6', '#d194c6', '#e8b8ba', '#b6a0c9'],
            primal: ['#b3e4ae', '#7cc8b5', '#e5daa4', '#8bce9a', '#abdac6']
        };
        const family = palettes[design];
        const customInk = this.themeColor('lines');
        const defaultInk = SpellDrawing.themePalettes[design]?.lines;
        const hasCustomInk = customInk.toLowerCase() !== defaultInk?.toLowerCase();
        visible.chords.forEach(group => {
            ctx.save();
            ctx.strokeStyle = String(hasCustomInk ? customInk :
                (family ? family[(group.k - 1) % family.length] : customInk));
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = design === 'tattoo' ? Math.max(0.9, Math.min(1.6, radius / 150)) :
                design === 'constellations' ? Math.max(0.85, Math.min(1.3, radius / 175)) :
                design === 'blueprint' ? 1.5 : design === 'obsidian' ? 1.7 :
                    design === 'herbarium' ? 1.75 : design === 'arcane' ? 1.65 :
                        design === 'divine' ? 1.7 : design === 'occult' ? 1.45 :
                            design === 'primal' ? 1.65 : Math.max(1.8, Math.min(2.7, radius / 92));
            ctx.globalAlpha = design === 'tattoo' ? .92 : design === 'constellations' ? 0.55 :
                design === 'blueprint' ? 0.73 :
                    design === 'obsidian' ? 0.71 : design === 'herbarium' ? 0.67 :
                        design === 'arcane' ? .73 : design === 'divine' ? .74 :
                            design === 'occult' ? .61 : design === 'primal' ? .7 : .80;
            ctx.globalAlpha *= this.drawingChords.length > 8 ? .77 : 1;
            ctx.globalAlpha *= SpellDrawing.styleNumber(this.settings.chordOpacity, 1, 0, 1);
            if (design === 'constellations') {
                ctx.shadowColor = 'rgba(167,208,252,.44)';
                ctx.shadowBlur = 4;
            }
            else if (design === 'obsidian') {
                ctx.shadowColor = 'rgba(241,186,113,.40)';
                ctx.shadowBlur = 3;
            }
            else if (design === 'arcane') {
                ctx.shadowColor = 'rgba(160,135,255,.47)';
                ctx.shadowBlur = 5;
            }
            else if (design === 'divine') {
                ctx.shadowColor = 'rgba(227,174,77,.25)';
                ctx.shadowBlur = 2;
            }
            else if (design === 'occult') {
                ctx.shadowColor = 'rgba(214,122,201,.24)';
                ctx.shadowBlur = 4;
            }
            else if (design === 'primal') {
                ctx.shadowColor = 'rgba(116,205,156,.23)';
                ctx.shadowBlur = 3;
            }
            if (hasCustomInk)
                ctx.shadowColor = customInk;
            for (const [a, b] of group.edges) {
                this.strokeInk(ctx, path => this.traceConnection(path, points[a], points[b], center, a + group.k), group.k * 71 + a * 13 + b);
            }
            ctx.restore();
        });
        this.paintOrbits(ctx, center, points, radius, visible.orbits);
        this.paintNodes(ctx, points, radius, width, height);
        this.paintIdentity(ctx, identityTicks);
    }
    /** Draw the selected theme's background without encoded strokes.
     * Used by both the editor and the full-bleed spell-card export. */
    paintThemeBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, center: Point, radius: number) {
        const design = this.baseTheme();
        if (design === 'constellations')
            this.paintSky(ctx, width, height, center, radius);
        else if (design === 'blueprint')
            this.paintBlueprint(ctx, width, height, center, radius);
        else if (design === 'obsidian')
            this.paintObsidian(ctx, width, height, center, radius);
        else if (design === 'herbarium')
            this.paintHerbarium(ctx, width, height, center, radius);
        else if (design === 'arcane')
            this.paintArcane(ctx, width, height, center, radius);
        else if (design === 'divine')
            this.paintDivine(ctx, width, height, center, radius);
        else if (design === 'occult')
            this.paintOccult(ctx, width, height, center, radius);
        else if (design === 'primal')
            this.paintPrimal(ctx, width, height, center, radius);
        else if (design === 'tattoo')
            this.paintSkin(ctx, width, height);
        else
            this.paintPaper(ctx, width, height, center, radius);
        this.paintThemeAccents(ctx, width, height, center, radius);
        if (this.settings.decorations)
            this.paintDecorations(ctx, width, height);
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
                return { x: Math.sin(Math.PI * t / 2), y: Math.cos(Math.PI * t / 2) };
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
        const guidePath = Array.from({ length: steps + 1 }, (_, i) => SpellDrawing.functionBasePoint(base, i / steps, bend));
        const cumulative = [0];
        for (let i = 1; i < guidePath.length; i++) {
            const p = guidePath[i - 1], q = guidePath[i];
            cumulative.push(cumulative[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
        }
        const total = cumulative[cumulative.length - 1];
        const vertices = [];
        let segment = 1;
        for (let i = 0; i < count; i++) {
            const distance = (total * i) / (count - 1);
            while (segment < steps && cumulative[segment] < distance)
                segment++;
            const start = cumulative[segment - 1], end = cumulative[segment];
            const portion = Math.max(0, Math.min(1, (distance - start) / Math.max(1e-12, end - start)));
            const p = guidePath[segment - 1], q = guidePath[segment];
            vertices.push({ x: p.x + (q.x - p.x) * portion,
                y: p.y + (q.y - p.y) * portion });
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
            cumulative.push(cumulative[i - 1] +
                Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
        const total = cumulative[cumulative.length - 1];
        const vertices = [];
        let segment = 1;
        for (let i = 0; i < count; i++) {
            const distance = total * i / (closed ? count : count - 1);
            while (segment < cumulative.length - 1 && cumulative[segment] < distance)
                segment++;
            const t = (distance - cumulative[segment - 1]) /
                Math.max(1e-12, cumulative[segment] - cumulative[segment - 1]);
            const a = path[segment - 1], b = path[segment];
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
    getGeometry(width: number, height: number, identityBits = '', chords: ChordGroup[] = []) {
        const center = { x: width / 2, y: height / 2 };
        const degrees = Math.max(-180, Math.min(180, Number(this.settings.rotation) || 0));
        const stretch = Math.max(0.6, Math.min(1.35, Number(this.settings.stretch) || 1));
        const mirror = this.settings.mirror ? -1 : 1;
        const angle = degrees * Math.PI / 180;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const transform = (point: Point) => {
            const x = point.x * stretch * mirror;
            return { x: x * cos - point.y * sin, y: x * sin + point.y * cos };
        };
        const n = this.drawingVertexCount;
        const base = this.settings.base || 'polygon';
        const sides = Number(this.settings.polygonSides);
        const faceted = Number.isInteger(sides) && sides >= 3 && sides <= 12;
        let vertices, basePath = null;
        if (base === 'polygon') {
            const count = faceted ? sides : n;
            const corners = Array.from({ length: count }, (_, i) => {
                const a = -Math.PI / 2 + i * 2 * Math.PI / count;
                return { x: Math.cos(a), y: Math.sin(a) };
            });
            if (faceted) {
                const sampled = SpellDrawing.samplePolyline(corners, n, true);
                vertices = sampled.vertices;
                basePath = sampled.guidePath;
            }
            else {
                vertices = corners;
            }
        }
        else {
            const smooth = SpellDrawing.sampleFunctionBase(base, n, this.settings.baseBend);
            const sampled = faceted
                ? SpellDrawing.samplePolyline(SpellDrawing.sampleFunctionBase(base, sides + 1, this.settings.baseBend).vertices, n, false)
                : smooth;
            const path = sampled.guidePath;
            const xs = path.map(p => p.x), ys = path.map(p => p.y);
            const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
            const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
            const halfExtent = Math.max((Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2, 0.001);
            const normalize = (p: Point) => ({ x: (p.x - midX) / halfExtent,
                y: (p.y - midY) / halfExtent });
            vertices = sampled.vertices.map(normalize);
            basePath = path.map(normalize);
        }
        // Identity slots depend on canvas dimensions and payload length, NOT on
        // rotation/stretch. Those controls simply warp the existing tick layout.
        const referenceRadius = Math.min(width, height) * 0.39;
        const slotsPerRing = Math.max(48, Math.floor(2 * Math.PI * referenceRadius * 1.21 / 7));
        const ringCount = Math.ceil(identityBits.length / slotsPerRing);
        const relativeGap = 0.044;
        const relativeTick = 0.033;
        const identityTicks = [];
        const allBounds = (basePath || vertices).map(transform);
        let offset = 0;
        for (let ring = 0; ring < ringCount; ring++) {
            const count = Math.min(slotsPerRing, identityBits.length - offset);
            const track = this.identityTrack(basePath || vertices, count, 0.21 + ring * relativeGap, base === 'polygon');
            for (let i = 0; i < count; i++) {
                const { position, normal } = track[i];
                const from = transform(position);
                const to = transform({ x: position.x + normal.x * relativeTick,
                    y: position.y + normal.y * relativeTick });
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
                moveTo() { }, lineTo() { },
                arc(x, y, r, start, end, anticlockwise = false) {
                    const sweep = positive(anticlockwise ? start - end : end - start);
                    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
                        const distance = positive(anticlockwise ? start - a : a - start);
                        if (distance <= sweep + 1e-10) {
                            allBounds.push({ x: x + r * Math.cos(a), y: y + r * Math.sin(a) });
                        }
                    }
                }
            };
            for (const group of chords) {
                for (const [a, b] of group.edges) {
                    this.traceConnection(recorder, projectedVertices[a], projectedVertices[b], { x: 0, y: 0 }, a + group.k);
                }
            }
        }
        const maxX = Math.max(0.001, ...allBounds.map(p => Math.abs(p.x)));
        const maxY = Math.max(0.001, ...allBounds.map(p => Math.abs(p.y)));
        const padding = Math.max(27, Math.min(42, Math.min(width, height) * 0.058));
        const scale = Math.max(0.01, Math.min(Math.max(1, width / 2 - padding) / maxX, Math.max(1, height / 2 - padding) / maxY));
        const place = (p: Point) => ({ x: center.x + p.x * scale, y: center.y + p.y * scale });
        return {
            center,
            radius: scale,
            points: vertices.map(point => place(transform(point))),
            basePath: basePath?.map(point => place(transform(point))) || null,
            identityTicks: identityTicks.map(tick => ({ index: tick.index,
                from: place(tick.from), to: place(tick.to) })),
            identityLayout: { slotsPerRing, ringCount, bitCount: identityBits.length }
        };
    }
    /**
     * Convert ordinary Canvas line and true-circle arc instructions to a
     * polyline suitable for a deterministic ink-nib pass. This is a purely
     * visual approximation: the underlying exact mathematical paths and all
     * binary data remain unchanged and still drive layout fitting.
     */
    static flattenInkPath(trace: (path: PathContext) => void, step = 8) {
        const paths: Point[][] = [];
        let points: Point[] = [];
        const addLine = (x: number, y: number) => {
            const last = points.at(-1);
            if (!last) {
                points.push({ x, y });
                return;
            }
            const length = Math.hypot(x - last.x, y - last.y);
            const steps = Math.max(1, Math.ceil(length / step));
            for (let i = 1; i <= steps; i++)
                points.push({ x: last.x + (x - last.x) * i / steps, y: last.y + (y - last.y) * i / steps });
        };
        const record: PathContext = {
            moveTo(x, y) { if (points.length)
                paths.push(points); points = [{ x, y }]; },
            lineTo(x, y) { addLine(x, y); },
            arc(cx, cy, r, start, end, anticlockwise = false) {
                const tau = Math.PI * 2;
                const positive = (value: number) => ((value % tau) + tau) % tau;
                const full = Math.abs(end - start) >= tau - 1e-7;
                const sweep = full ? tau : positive(anticlockwise ? start - end : end - start);
                const p0 = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
                addLine(p0.x, p0.y);
                const steps = Math.max(2, Math.ceil(sweep * r / step));
                for (let i = 1; i <= steps; i++) {
                    const a = start + (anticlockwise ? -1 : 1) * sweep * i / steps;
                    addLine(cx + r * Math.cos(a), cy + r * Math.sin(a));
                }
            }
        };
        trace(record);
        if (points.length)
            paths.push(points);
        return paths;
    }
    /**
     * A directional calligraphy-nib profile: thick ink deposits at pen-down,
     * gradually declining to a fine pen-lift. Pressure 0 retains uniform width.
     * Progress is measured along the actual stroke length (not point index),
     * so long chords, short ID lines and circular arcs behave consistently.
     */
    static inkNibWidth(progress: number, baseWidth: number, pressure: number) {
        const p = SpellDrawing.styleNumber(pressure, 0.35, 0, 2.5);
        const t = Math.max(0, Math.min(1, progress));
        const easing = t * t * (3 - 2 * t);
        const start = 1 + 1.45 * p;
        const finish = 1 - 0.7 * Math.min(p, 1);
        return Math.max(0.15, baseWidth * (start + (finish - start) * easing));
    }
    /**
     * Preserve the Canvas dash pattern while gradually changing nib width.
     * A dash is a separate filled ribbon, but its width still comes from its
     * position within the FULL stroke, not a new 0-100% taper per dash.
     */
    static splitInkDashes(points: Point[], pattern: number[] = [], offset = 0) {
        const total = points.slice(1).reduce((length, point, i) => length + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);
        if (!total || points.length < 2)
            return [];
        let travelled = 0;
        const measured = points.map((p, i) => {
            if (i)
                travelled += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
            return { x: p.x, y: p.y, t: travelled / total };
        });
        if (!pattern?.length)
            return [measured];
        const raw = [...pattern].map(v => Math.max(0, Number(v) || 0));
        const dashes = raw.length % 2 ? [...raw, ...raw] : raw;
        const period = dashes.reduce((sum, v) => sum + v, 0);
        if (period < 1e-8)
            return [measured];
        let phase = ((offset % period) + period) % period;
        let dashIndex = 0;
        while (dashIndex < dashes.length - 1 && phase >= dashes[dashIndex]) {
            phase -= dashes[dashIndex++];
        }
        let remaining = dashes[dashIndex] - phase;
        let active: InkPoint[] = [];
        const pieces: InkPoint[][] = [];
        const flush = () => { if (active.length > 1)
            pieces.push(active); active = []; };
        const advance = () => {
            if (dashIndex % 2 === 0)
                flush();
            do {
                dashIndex = (dashIndex + 1) % dashes.length;
            } while (dashes[dashIndex] <= 1e-8);
            remaining = dashes[dashIndex];
        };
        if (remaining <= 1e-8)
            advance();
        let distance = 0;
        for (let i = 1; i < measured.length; i++) {
            const a = measured[i - 1], b = measured[i];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (!length)
                continue;
            let travelledOnSegment = 0;
            while (travelledOnSegment < length - 1e-8) {
                const step = Math.min(length - travelledOnSegment, remaining);
                const pointAt = (d: number) => ({ x: a.x + (b.x - a.x) * d / length,
                    y: a.y + (b.y - a.y) * d / length, t: (distance + d) / total });
                if (dashIndex % 2 === 0 && step > 1e-8) {
                    if (!active.length)
                        active.push(pointAt(travelledOnSegment));
                    active.push(pointAt(travelledOnSegment + step));
                }
                travelledOnSegment += step;
                remaining -= step;
                if (remaining <= 1e-8)
                    advance();
            }
            distance += length;
        }
        flush();
        return pieces;
    }
    /** Draw a continuously tapered, round-ended ink shape in a single fill. */
    static fillInkRibbon(ctx: CanvasRenderingContext2D, points: InkPoint[], baseWidth: number, pressure: number, widthFactor = 1) {
        if (points.length < 2)
            return;
        const sides = points.map((point, i) => {
            const previous = points[Math.max(0, i - 1)];
            const next = points[Math.min(points.length - 1, i + 1)];
            const dx = next.x - previous.x, dy = next.y - previous.y;
            const distance = Math.hypot(dx, dy) || 1;
            const nx = -dy / distance, ny = dx / distance;
            const r = SpellDrawing.inkNibWidth(point.t, baseWidth, pressure) * widthFactor / 2;
            return { x: point.x, y: point.y, nx, ny, r };
        });
        const first = sides[0], last = sides[sides.length - 1];
        ctx.beginPath();
        ctx.moveTo(first.x + first.nx * first.r, first.y + first.ny * first.r);
        for (let i = 1; i < sides.length; i++) {
            const s = sides[i];
            ctx.lineTo(s.x + s.nx * s.r, s.y + s.ny * s.r);
        }
        const endAngle = Math.atan2(last.ny, last.nx);
        ctx.arc(last.x, last.y, last.r, endAngle, endAngle - Math.PI, true);
        for (let i = sides.length - 2; i >= 0; i--) {
            const s = sides[i];
            ctx.lineTo(s.x - s.nx * s.r, s.y - s.ny * s.r);
        }
        const startAngle = Math.atan2(-first.ny, -first.nx);
        ctx.arc(first.x, first.y, first.r, startAngle, startAngle - Math.PI, true);
        ctx.closePath();
        ctx.fill();
    }
    /** Directionally tapered feather-and-ink rendering for every encoded stroke. */
    strokeInk(ctx: CanvasRenderingContext2D, trace: (path: PathContext) => void, seed = 0) {
        if (!this.settings.handDrawnInk) {
            ctx.beginPath();
            trace(ctx);
            ctx.stroke();
            return;
        }
        const wobble = SpellDrawing.styleNumber(this.settings.inkWobble, 1, 0, 3);
        const pressure = SpellDrawing.styleNumber(this.settings.inkPressure, .35, 0, 2.5);
        const feather = SpellDrawing.styleNumber(this.settings.inkFeather, .3, 0, 1);
        const flattened = SpellDrawing.flattenInkPath(trace);
        ctx.save();
        const originalWidth = ctx.lineWidth;
        const originalOpacity = ctx.globalAlpha;
        const pattern = typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
        ctx.fillStyle = ctx.strokeStyle;
        for (let pathIndex = 0; pathIndex < flattened.length; pathIndex++) {
            const input = flattened[pathIndex];
            if (input.length < 2)
                continue;
            const s = seed * 0.617 + pathIndex * 17.31;
            const points = input.map((p, i) => {
                const before = input[Math.max(0, i - 1)], after = input[Math.min(input.length - 1, i + 1)];
                const dx = after.x - before.x, dy = after.y - before.y;
                const d = Math.hypot(dx, dy) || 1;
                const taper = Math.min(1, i / 2, (input.length - 1 - i) / 2);
                const drift = Math.sin(i * .72 + s) * .63 + Math.cos(i * .26 + s * 1.8) * .37;
                return { x: p.x - (dy / d) * wobble * taper * drift, y: p.y + (dx / d) * wobble * taper * drift };
            });
            const pieces = SpellDrawing.splitInkDashes(points, pattern, ctx.lineDashOffset || 0);
            if (feather > 0) {
                ctx.save();
                ctx.globalAlpha = originalOpacity * (.12 + .12 * feather);
                ctx.shadowColor = String(ctx.strokeStyle);
                ctx.shadowBlur = 1 + feather * 3.8;
                for (const piece of pieces) {
                    SpellDrawing.fillInkRibbon(ctx, piece, originalWidth, pressure, 1 + feather * 1.6);
                }
                ctx.restore();
            }
            for (const piece of pieces) {
                SpellDrawing.fillInkRibbon(ctx, piece, originalWidth, pressure);
            }
        }
        ctx.restore();
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
    paintOrbits(ctx: CanvasRenderingContext2D, center: Point, points: Point[], radius: number, orbits: Orbit[]) {
        if (!orbits.length)
            return;
        const design = this.baseTheme();
        const customInk = this.themeColor('lines');
        const defaultInk = SpellDrawing.themePalettes[design]?.lines;
        const hasCustomInk = customInk.toLowerCase() !== defaultInk?.toLowerCase();
        const themedInks: Record<string, string> = {
            blueprint: '#d3f3f4', obsidian: '#f0d7a4', herbarium: '#446e67',
            arcane: '#b5e4fd', divine: '#8d7960', occult: '#d194c6', primal: '#e5daa4'
        };
        const ink = hasCustomInk ? customInk : themedInks[design] || this.themeColor('lines');
        const orbitRadius = Math.max(9.5, radius * 0.06);
        ctx.save();
        ctx.strokeStyle = ink;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.5, Math.min(3, Number(this.settings.orbitWidth) || 1.25));
        ctx.setLineDash(SpellDrawing.linePattern(this.settings.orbitLineStyle, ctx.lineWidth));
        ctx.globalAlpha = design === 'tattoo' ? .92 : design === 'constellations' ? 0.56 : design === 'blueprint' ? 0.83 : 0.76;
        ctx.globalAlpha *= SpellDrawing.styleNumber(this.settings.orbitOpacity, 1, 0, 1);
        if (design === 'constellations') {
            ctx.shadowColor = hasCustomInk ? customInk : 'rgba(167,208,252,.34)';
            ctx.shadowBlur = 3;
        }
        else if (hasCustomInk) {
            ctx.shadowColor = customInk;
            ctx.shadowBlur = 2;
        }
        for (const orbit of orbits) {
            const point = points[orbit.vertex];
            const outwardAngle = Math.atan2(point.y - center.y, point.x - center.x);
            // Always start on the same side relative to the center, independent of
            // base shape or editor rotation. The sweep carries the section mask.
            const start = outwardAngle - Math.PI / 2;
            this.strokeInk(ctx, path => path.arc(point.x, point.y, orbitRadius, start, start + orbit.sweep), 2000 + orbit.vertex * 17 + orbit.units);
        }
        ctx.restore();
    }
    identityTrack(guidePath: Point[], count: number, offset = 0.21, closed = false) {
        // Short tracks need extra samples to determine a nonzero tangent.
        const sampleCount = count === 1 ? (closed ? 3 : 2) : count === 2 && closed ? 4 : count;
        const sampled = SpellDrawing.samplePolyline(guidePath, sampleCount, closed).vertices;
        const indices = count === 1 ? [0] : count === 2 && closed ? [0, 2] : sampled.map((_, i) => i);
        return indices.map(index => {
            const position = sampled[index];
            const previous = sampled[(index - 1 + sampled.length) % sampled.length] ?? position;
            const next = sampled[(index + 1) % sampled.length] ?? position;
            const before = closed || index > 0 ? previous : position;
            const after = closed || index < sampled.length - 1 ? next : position;
            const tangent = { x: after.x - before.x, y: after.y - before.y };
            const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
            const left = { x: -tangent.y / tangentLength, y: tangent.x / tangentLength };
            const right = { x: -left.x, y: -left.y };
            const outward = ((position.x + left.x * offset) ** 2 + (position.y + left.y * offset) ** 2) >=
                ((position.x + right.x * offset) ** 2 + (position.y + right.y * offset) ** 2) ? left : right;
            const trackPosition = { x: position.x + outward.x * offset, y: position.y + outward.y * offset };
            return { position: trackPosition, normal: { x: -outward.x, y: -outward.y } };
        });
    }
    /**
     * Draw the pre-positioned Layer 3 spell-ID bits. The tick endpoints come from
     * getGeometry(), so their orientation, squeeze, and base-curve offset match the main sigil.
     */
    static identityMarkerShape(style: string, index: number) {
        if (style === 'mixed')
            return ['line', 'dot', 'square'][index % 3];
        return ['line', 'dot', 'square'].includes(style) ? style : 'line';
    }
    /** Limit editable Canvas dimensions to the same ranges as the form. */
    static styleNumber(value: unknown, defaultValue: number, min: number, max: number) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : defaultValue;
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
        const lineWidth = SpellDrawing.styleNumber(this.settings.identityTickWidth, DRAWING_DEFAULTS.identityTickWidth, 0.5, 3);
        const dotSize = SpellDrawing.styleNumber(this.settings.identityDotSize, 3.5, 1, 10);
        const squareSize = SpellDrawing.styleNumber(this.settings.identitySquareSize, 4.5, 1, 12);
        const pointStrokeWidth = SpellDrawing.styleNumber(this.settings.identityPointStrokeWidth, 1, 0.5, 3);
        const markerOpacity = SpellDrawing.styleNumber(this.settings.identityMarkerOpacity, DRAWING_DEFAULTS.identityMarkerOpacity, 0, 1);
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
            tattoo: this.themeColor('lines')
        };
        const markerInk = overridden ? ink : (inks[design] || inks.plain);
        ctx.save();
        ctx.strokeStyle = markerInk;
        ctx.fillStyle = markerInk;
        ctx.globalAlpha *= markerOpacity;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(SpellDrawing.linePattern(this.settings.identityTickLineStyle, lineWidth));
        for (const { from, to, index = 0 } of ticks) {
            const shape = SpellDrawing.identityMarkerShape(shapeSetting, index);
            if (shape === 'line') {
                this.strokeInk(ctx, path => { path.moveTo(from.x, from.y); path.lineTo(to.x, to.y); }, 4000 + index * 7);
                continue;
            }
            // Ink feathering softly affects filled / outlined ID symbols as well.
            if (this.settings.handDrawnInk) {
                ctx.shadowColor = markerInk;
                ctx.shadowBlur = 0.6 + SpellDrawing.styleNumber(this.settings.inkFeather, .3, 0, 1) * 2;
            }
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            ctx.save();
            ctx.setLineDash([]); // Dashed / dotted applies only to line markers.
            ctx.lineWidth = pointStrokeWidth;
            if (shape === 'dot') {
                ctx.beginPath();
                ctx.arc(midX, midY, dotSize / 2, 0, 2 * Math.PI);
                if (this.settings.identityDotFill === 'outline')
                    ctx.stroke();
                else
                    ctx.fill();
            }
            else {
                const orientation = this.settings.identitySquareOrientation;
                const angle = orientation === 'upright' ? 0 : orientation === 'diamond' ?
                    Math.PI / 4 : Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 4;
                ctx.translate(midX, midY);
                ctx.rotate(angle);
                if (this.settings.identitySquareFill === 'outline') {
                    ctx.strokeRect(-squareSize / 2, -squareSize / 2, squareSize, squareSize);
                }
                else {
                    ctx.fillRect(-squareSize / 2, -squareSize / 2, squareSize, squareSize);
                }
            }
            ctx.restore();
        }
        ctx.restore();
    }
    private paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, seed: number) {
        const random = SpellDrawing.seededRandom(seed);
        const count = Math.min(6000, Math.round(w * h / 180));
        ctx.save();
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++) {
            const x = random() * w, y = random() * h, r = .25 + random() * .55;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * .55, random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    paintSkin(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const ground = ctx.createLinearGradient(0, 0, w, h);
        ground.addColorStop(0, '#e7c2a8');
        ground.addColorStop(.48, '#d8ad92');
        ground.addColorStop(1, '#bf9078');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        this.paintGrain(ctx, w, h, 'rgba(87,48,37,.10)', 1010);
    }
    paintPaper(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, Math.max(w, h) * 0.82);
        ground.addColorStop(0, '#fcf9ef');
        ground.addColorStop(1, '#f0e9d8');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        this.paintGrain(ctx, w, h, 'rgba(112,82,42,.13)', 101);
        ctx.save();
        ctx.strokeStyle = 'rgba(138,100,54,.06)';
        ctx.lineWidth = .6;
        for (let y = 12; y < h; y += 9) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * .3, y - 2, w * .7, y + 2, w, y);
            ctx.stroke();
        }
        ctx.restore();
    }
    /** Stable star field: no random flicker when a control changes. */
    paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const backdrop = ctx.createLinearGradient(0, 0, w, h);
        backdrop.addColorStop(0, '#06111f');
        backdrop.addColorStop(0.54, '#0e1c35');
        backdrop.addColorStop(1, '#050b18');
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, w, h);
        const haze = ctx.createRadialGradient(center.x * 0.92, center.y * 0.87, 18, center.x * 0.92, center.y * 0.87, Math.max(w, h) * 0.67);
        haze.addColorStop(0, 'rgba(62,102,169,.32)');
        haze.addColorStop(1, 'rgba(10,25,56,0)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, w, h);
        const band = ctx.createLinearGradient(0, h, w, 0);
        band.addColorStop(0, 'rgba(119,134,196,0)');
        band.addColorStop(.4, 'rgba(119,134,196,0)');
        band.addColorStop(.5, 'rgba(119,134,196,.09)');
        band.addColorStop(.6, 'rgba(119,134,196,0)');
        band.addColorStop(1, 'rgba(119,134,196,0)');
        ctx.fillStyle = band;
        ctx.fillRect(0, 0, w, h);
        const fraction = (value: number) => value - Math.floor(value);
        const count = Math.min(540, Math.max(150, Math.round(w * h / 2400)));
        ctx.save();
        for (let i = 0; i < count; i++) {
            const x = 20 + fraction(Math.sin((i + 1) * 127.117) * 43758.5453) * Math.max(1, w - 40);
            const y = 20 + fraction(Math.sin((i + 1) * 331.331) * 19341.2197) * Math.max(1, h - 40);
            const intensity = fraction(Math.sin((i + 1) * 47.39) * 97112.37);
            const size = intensity > 0.96 ? 1.15 : intensity > 0.76 ? 0.75 : 0.43;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(225,237,255,${(0.12 + intensity * 0.46).toFixed(3)})`;
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(182,204,233,.16)';
        ctx.lineWidth = .7;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, w * .46, h * .42, -.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    /** Crisp astronomer's blueprint grid; only the rendering changes. */
    paintBlueprint(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
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
            ctx.moveTo(x + .5, 0);
            ctx.lineTo(x + .5, h);
        }
        for (let y = 0; y < h; y += step) {
            ctx.moveTo(0, y + .5);
            ctx.lineTo(w, y + .5);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(138,202,223,.17)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let x = 0; x < w; x += step * 5) {
            ctx.moveTo(x + .5, 0);
            ctx.lineTo(x + .5, h);
        }
        for (let y = 0; y < h; y += step * 5) {
            ctx.moveTo(0, y + .5);
            ctx.lineTo(w, y + .5);
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
    paintObsidian(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createRadialGradient(center.x, center.y, radius * .12, center.x, center.y, Math.max(w, h) * .81);
        ground.addColorStop(0, '#2b2928');
        ground.addColorStop(.53, '#1e2023');
        ground.addColorStop(1, '#101519');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        const light = ctx.createRadialGradient(w * .54, h * .37, 1, w * .54, h * .37, w * .60);
        light.addColorStop(0, 'rgba(176,123,66,.10)');
        light.addColorStop(1, 'rgba(176,123,66,0)');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        this.paintGrain(ctx, w, h, 'rgba(205,179,145,.08)', 404);
        const random = SpellDrawing.seededRandom(404);
        ctx.strokeStyle = 'rgba(206,161,104,.22)';
        ctx.lineWidth = .8;
        for (const side of [0, 1]) {
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) {
                const x = (side ? .94 : .06) * w + (random() - .5) * w * .06;
                const y = h * i / 12;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
    /** Botanical journal paper with quiet green ink and an archival frame. */
    paintHerbarium(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createRadialGradient(center.x, center.y, 12, center.x, center.y, Math.max(w, h) * .84);
        ground.addColorStop(0, '#f6f5e8');
        ground.addColorStop(.7, '#eaf0e2');
        ground.addColorStop(1, '#dae4d2');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(92,111,78,.065)';
        const spacing = Math.max(24, Math.min(38, Math.round(w / 28)));
        for (let y = spacing * .5; y < h; y += spacing)
            for (let x = spacing * .5; x < w; x += spacing) {
                ctx.beginPath();
                ctx.arc(x, y, .65, 0, Math.PI * 2);
                ctx.fill();
            }
        ctx.save();
        ctx.strokeStyle = 'rgba(91,117,77,.25)';
        ctx.lineWidth = .8;
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
            const x = side === 1 ? w * .12 : w * .88;
            ctx.beginPath();
            ctx.moveTo(x, h * .16);
            ctx.quadraticCurveTo(x + side * w * .035, h * .5, x, h * .84);
            ctx.stroke();
            for (let i = 0; i < 7; i++) {
                ctx.beginPath();
                ctx.ellipse(x + side * (i % 2 ? 10 : -10), h * (.22 + i * .085), 12, 3.5, side * .65, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    /** Arcane: a night-blue aether field with faint magic-circle engravings. */
    paintArcane(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createRadialGradient(center.x, center.y * .88, 10, center.x, center.y, Math.max(w, h) * .81);
        ground.addColorStop(0, '#273865');
        ground.addColorStop(.57, '#171c43');
        ground.addColorStop(1, '#090e29');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        const glimmer = ctx.createRadialGradient(center.x * .77, center.y * .78, 5, center.x * .77, center.y * .78, radius * 1.9);
        glimmer.addColorStop(0, 'rgba(110,88,217,.17)');
        glimmer.addColorStop(1, 'rgba(80,64,210,0)');
        ctx.fillStyle = glimmer;
        ctx.fillRect(0, 0, w, h);
        // Background engraving only: very low opacity and separate from binary edges.
        ctx.strokeStyle = 'rgba(170,162,244,.075)';
        ctx.lineWidth = .8;
        for (const scale of [1.2, 1.36]) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius * scale, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < 32; i++) {
            const a = 2 * Math.PI * i / 32, inner = radius * 1.225, outer = radius * 1.25;
            ctx.beginPath();
            ctx.moveTo(center.x + inner * Math.cos(a), center.y + inner * Math.sin(a));
            ctx.lineTo(center.x + outer * Math.cos(a), center.y + outer * Math.sin(a));
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(168,157,243,.19)';
        for (const scale of [1.32, 1.48]) {
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const angle = i * Math.PI / 3 - Math.PI / 2;
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
    paintDivine(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createRadialGradient(center.x, center.y, radius * .1, center.x, center.y, Math.max(w, h) * .83);
        ground.addColorStop(0, '#fffdf4');
        ground.addColorStop(.58, '#f9f1dc');
        ground.addColorStop(1, '#e8d6b0');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        const halo = ctx.createRadialGradient(center.x, center.y, radius * .66, center.x, center.y, radius * 1.54);
        halo.addColorStop(0, 'rgba(244,197,106,0)');
        halo.addColorStop(.72, 'rgba(238,192,107,.12)');
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
            const angle = i * Math.PI / 24;
            const inner = radius * 1.3, outer = radius * (i % 4 === 0 ? 1.65 : 1.48);
            ctx.beginPath();
            ctx.moveTo(center.x + inner * Math.cos(angle), center.y + inner * Math.sin(angle));
            ctx.lineTo(center.x + outer * Math.cos(angle), center.y + outer * Math.sin(angle));
            ctx.stroke();
        }
        ctx.restore();
    }
    /** Occult: inky aubergine with diffuse ether fog and smoky copper edging. */
    paintOccult(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createLinearGradient(0, 0, w, h);
        ground.addColorStop(0, '#100d1e');
        ground.addColorStop(.48, '#2a172d');
        ground.addColorStop(1, '#130f24');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        for (const [x, y, r, alpha] of [
            [w * .25, h * .22, radius * .85, .12], [w * .76, h * .57, radius * .94, .10],
            [w * .55, h * .89, radius * .7, .08]
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
            const x = w * (.35 + i * .05), y = h * .065, r = Math.min(w, h) * .009;
            ctx.beginPath();
            ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
            ctx.ellipse(x, y, Math.max(.1, r * Math.abs(i - 3) / 3), r, 0, Math.PI / 2, -Math.PI / 2, i < 3);
            ctx.stroke();
        }
        ctx.restore();
    }
    /** Primal: shaded woodland green with gentle luminous lichen and leaf flecks. */
    paintPrimal(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const ground = ctx.createRadialGradient(center.x, center.y * .86, 16, center.x, center.y, Math.max(w, h) * .84);
        ground.addColorStop(0, '#254b3d');
        ground.addColorStop(.62, '#12372e');
        ground.addColorStop(1, '#091c19');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        const fraction = (x: number) => x - Math.floor(x);
        const count = Math.min(260, Math.max(90, Math.round(w * h / 4600)));
        for (let i = 0; i < count; i++) {
            const x = 23 + fraction(Math.sin((i + 1) * 79.41) * 33193.27) * (w - 46);
            const y = 23 + fraction(Math.sin((i + 1) * 151.17) * 18743.51) * (h - 46);
            const size = .45 + fraction(Math.sin((i + 1) * 19.71) * 17211.31) * .6;
            ctx.fillStyle = 'rgba(182,229,167,.13)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(158,208,156,.20)';
        ctx.lineWidth = .8;
        for (const side of [1, -1]) {
            const x = side === 1 ? w * .06 : w * .94;
            ctx.beginPath();
            ctx.moveTo(x, h * .12);
            ctx.bezierCurveTo(x + side * w * .08, h * .35, x - side * w * .025, h * .65, x, h * .9);
            ctx.stroke();
            for (let i = 0; i < 14; i++) {
                const y = h * (.17 + i * .047), length = Math.sin(i / 14 * Math.PI) * w * .06;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x + side * length * .5, y - length * .7, x + side * length, y - length * .4);
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x - side * length * .4, y - length * .5, x - side * length * .6, y - length * .3);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    /** Small, deterministic decorative drawings. Does NOT touch the spell model. */
    static seededRandom(seed: number) {
        let state = (Number(seed) >>> 0) || 1;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
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
    paintThemeAccents(ctx: CanvasRenderingContext2D, w: number, h: number, center: Point, radius: number) {
        const theme = this.baseTheme();
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
            tattoo: ['rgba(37,36,38,.28)', 'rgba(37,36,38,.06)']
        };
        const palette = palettes[theme] || ['rgba(120,100,70,.22)', 'rgba(130,110,80,.08)'];
        const unit = Math.min(w / 900, h / 650, 1.5), pad = 42 * unit;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Atmospheric rim; only a faint edge effect inside the original canvas.
        const vignette = ctx.createRadialGradient(center.x, center.y, radius * .56, center.x, center.y, Math.max(w, h) * .76);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, ['plain', 'herbarium', 'divine', 'tattoo'].includes(theme)
            ? 'rgba(129,105,69,.050)' : 'rgba(0,0,0,.20)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        // Marginal motifs are optional and never part of the spell encoding.
        ctx.lineWidth = Math.max(.6, unit * .9);
        const corners = this.settings.cornerOrnaments
            ? [[pad, pad], [w - pad, pad], [pad, h - pad], [w - pad, h - pad]] : [];
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
            }
            else if (theme === 'blueprint') {
                ctx.moveTo(-r, r); ctx.lineTo(-r, -r); ctx.lineTo(r, -r);
                ctx.moveTo(-r * .5, 0); ctx.lineTo(r * .5, 0);
                ctx.moveTo(0, -r * .5); ctx.lineTo(0, r * .5);
            }
            else if (theme === 'obsidian' || theme === 'arcane') {
                const sides = theme === 'obsidian' ? 4 : 6;
                for (let i = 0; i <= sides; i++) {
                    const a = i * Math.PI * 2 / sides;
                    if (i === 0) ctx.moveTo(0, -r);
                    else ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
                }
            }
            else if (theme === 'occult') {
                ctx.ellipse(0, 0, r, r * .4, 0, 0, Math.PI * 2);
                ctx.moveTo(r * .25, 0);
                ctx.arc(0, 0, r * .25, 0, Math.PI * 2);
            }
            else if (theme === 'herbarium' || theme === 'primal') {
                ctx.moveTo(-r * .6, r); ctx.lineTo(r * .6, -r);
                for (let i = 0; i < (theme === 'primal' ? 5 : 2); i++) {
                    const y = -r * .6 + i * r * .3;
                    ctx.moveTo(0, y);
                    ctx.quadraticCurveTo(-r, y - r * .5, -r * .7, y);
                    ctx.moveTo(0, y);
                    ctx.quadraticCurveTo(r, y - r * .4, r * .7, y - r * .3);
                }
            }
            else if (theme === 'divine' || theme === 'constellations') {
                const rays = theme === 'divine' ? 12 : 4;
                for (let i = 0; i < rays; i++) {
                    const a = i * Math.PI * 2 / rays;
                    ctx.moveTo(Math.cos(a) * r * .4, Math.sin(a) * r * .4);
                    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
            }
            else {
                ctx.moveTo(-r, r * .4);
                ctx.bezierCurveTo(-r, -r, r, r, r, -r * .4);
            }
            ctx.stroke();
            ctx.restore();
        }
        // Additional faint design-specific accents positioned behind the sigil.
        if (theme === 'constellations') {
            const aura = ctx.createRadialGradient(center.x * .84, center.y * .74, 5, center.x * .84, center.y * .74, radius * 1.43);
            aura.addColorStop(0, 'rgba(67,137,216,.08)');
            aura.addColorStop(.65, 'rgba(32,91,173,.045)');
            aura.addColorStop(1, 'rgba(32,91,173,0)');
            ctx.fillStyle = aura;
            ctx.fillRect(0, 0, w, h);
        }
        else if (theme === 'blueprint') {
            ctx.strokeStyle = palette[0];
            ctx.globalAlpha = .6;
            for (let i = 0; i <= 12; i++) {
                const x = 35 + (w - 70) * i / 12;
                ctx.beginPath();
                ctx.moveTo(x, 23);
                ctx.lineTo(x, 23 + (i % 3 === 0 ? 9 : 4) * unit);
                ctx.moveTo(x, h - 23);
                ctx.lineTo(x, h - 23 - (i % 3 === 0 ? 9 : 4) * unit);
                ctx.stroke();
            }
        }
        else if (theme === 'divine' || theme === 'arcane' || theme === 'obsidian') {
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = Math.max(.6, unit);
            for (const m of [1.08, 1.13]) {
                ctx.beginPath();
                ctx.arc(center.x, center.y, radius * m, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        else if (theme === 'herbarium' || theme === 'primal') {
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 1;
            for (const x of [27, w - 27]) {
                ctx.beginPath();
                ctx.moveTo(x, h * .25);
                ctx.bezierCurveTo(x + (x < w / 2 ? 7 : -7), h * .42, x - (x < w / 2 ? 7 : -7), h * .6, x, h * .78);
                ctx.stroke();
            }
        }
        else if (theme === 'occult') {
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius * 1.14, -.72, 1.95);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius * 1.19, 2.35, 5.52);
            ctx.stroke();
        }
        ctx.restore();
    }
    paintDecorations(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const random = SpellDrawing.seededRandom(this.settings.decorationSeed);
        const design = this.baseTheme();
        const unit = Math.max(.45, Math.min(2.1, Math.min(w / 920, h / 650)));
        const pi2 = Math.PI * 2;
        // Keep ornaments in the perimeter. They are intentionally never connected
        // to spell vertices and never affect the reversible identity tick ring.
        const places = [
            [w * .105, h * .16], [w * .875, h * .16], [w * .105, h * .79],
            [w * .88, h * .58], [w * .45, h * .09]
        ];
        const strokeCircle = (x: number, y: number, r: number, stroke: string, alpha = 1) => {
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
            ctx.arc(x, y, Math.max(.55, r * .22), 0, pi2);
            ctx.fill();
        };
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = .8 * unit;
        if (design === 'tattoo') {
            ctx.strokeStyle = this.themeColor('lines');
            ctx.fillStyle = this.themeColor('lines');
            ctx.globalAlpha = .3;
            for (const [x, y] of places) {
                const r = (5 + random() * 5) * unit;
                ctx.beginPath();
                ctx.moveTo(x, y - r);
                ctx.lineTo(x + r * .5, y);
                ctx.lineTo(x, y + r);
                ctx.lineTo(x - r * .5, y);
                ctx.closePath();
                ctx.stroke();
                for (let i = 0; i < 12; i++) {
                    ctx.beginPath();
                    ctx.arc(x + (random() - .5) * r * 4, y + (random() - .5) * r * 4, .55 * unit, 0, pi2);
                    ctx.fill();
                }
            }
        }
        else if (design === 'plain') {
            const color = 'rgba(110,81,51,.32)';
            for (let i = 0; i < 4; i++) {
                const [x, y] = places[i];
                const r = (10 + random() * 7) * unit;
                strokeCircle(x, y, r, color, .75);
                for (let arm = 0; arm < 6; arm++) {
                    const a = pi2 * arm / 6 + random() * .19;
                    const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
                    pinStar(p.x, p.y, (1.6 + random() * 2) * unit, color);
                }
                ctx.strokeStyle = color;
                ctx.globalAlpha = .68;
                ctx.beginPath();
                ctx.arc(x, y, r * .62, 0, Math.PI * 1.3);
                ctx.stroke();
            }
            for (let i = 0; i < 8; i++) {
                const left = i % 2 === 0;
                const x = (left ? .055 : .95) * w;
                const y = (.21 + random() * .57) * h;
                const direction = left ? 1 : -1;
                ctx.strokeStyle = 'rgba(112,84,61,.17)';
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.bezierCurveTo(x + direction * 26 * unit, y - 18 * unit, x + direction * 36 * unit, y + 10 * unit, x + direction * 11 * unit, y + 18 * unit);
                ctx.stroke();
            }
        }
        else if (design === 'constellations') {
            for (let i = 0; i < 4; i++) {
                const [cx, cy] = places[i];
                const count = 4 + Math.floor(random() * 3);
                const stars = Array.from({ length: count }, () => ({
                    x: cx + (random() - .5) * Math.min(w * .11, 85 * unit),
                    y: cy + (random() - .5) * Math.min(h * .13, 80 * unit),
                    r: (1.4 + random() * 2) * unit
                }));
                ctx.globalAlpha = .40;
                ctx.strokeStyle = '#b0cdeb';
                ctx.lineWidth = .65 * unit;
                ctx.beginPath();
                stars.forEach((p, j) => j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
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
                const x = (.25 + random() * .50) * w;
                const y = (i === 0 ? .085 : .89) * h;
                const len = (26 + random() * 25) * unit;
                ctx.globalAlpha = .35;
                ctx.strokeStyle = 'rgba(193,223,255,.57)';
                ctx.lineWidth = .85 * unit;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - len, y + len * .35);
                ctx.stroke();
                pinStar(x, y, 3.2 * unit, 'rgba(214,231,255,.68)');
            }
        }
        else if (design === 'blueprint') {
            for (let i = 0; i < 4; i++) {
                const [x, y] = places[i];
                const r = (15 + random() * 12) * unit;
                ctx.lineWidth = .8 * unit;
                strokeCircle(x, y, r, 'rgba(131,207,222,.40)', .9);
                strokeCircle(x, y, r * .66, 'rgba(131,207,222,.28)', .8);
                const start = random() * pi2;
                ctx.strokeStyle = 'rgba(169,227,236,.52)';
                ctx.globalAlpha = .86;
                ctx.lineWidth = 1.25 * unit;
                ctx.beginPath();
                ctx.arc(x, y, r, start, start + Math.PI * (.4 + random() * .65));
                ctx.stroke();
                pinStar(x, y, 3.4 * unit, 'rgba(133,210,224,.42)');
            }
            ctx.globalAlpha = .6;
            ctx.lineWidth = .6 * unit;
            ctx.strokeStyle = 'rgba(135,209,222,.36)';
            for (let i = 0; i < 5; i++) {
                const x = (.24 + random() * .53) * w;
                const y = (i % 2 ? .105 : .9) * h;
                const r = (7 + random() * 8) * unit;
                ctx.beginPath();
                ctx.arc(x, y, r, Math.PI * .15, Math.PI * 1.65);
                ctx.stroke();
            }
        }
        else if (design === 'obsidian') {
            for (let i = 0; i < 4; i++) {
                const [x, y] = places[i];
                const r = (11 + random() * 7) * unit;
                strokeCircle(x, y, r, 'rgba(218,170,101,.40)', .83);
                strokeCircle(x, y, r * .32, 'rgba(218,170,101,.36)', .8);
                const petals = 8 + 2 * Math.floor(random() * 3);
                for (let j = 0; j < petals; j++) {
                    const a = pi2 * j / petals;
                    const px = x + Math.cos(a) * r * .72;
                    const py = y + Math.sin(a) * r * .72;
                    ctx.globalAlpha = .53;
                    ctx.fillStyle = 'rgba(221,170,98,.48)';
                    ctx.beginPath();
                    ctx.ellipse(px, py, 3.5 * unit, 1.2 * unit, a, 0, pi2);
                    ctx.fill();
                }
                pinStar(x, y, 2.8 * unit, 'rgba(233,183,117,.56)');
            }
            for (let i = 0; i < 5; i++) {
                const y = (.22 + random() * .58) * h;
                const x = i % 2 ? w * .956 : w * .044;
                ctx.globalAlpha = .56;
                ctx.strokeStyle = 'rgba(213,166,110,.30)';
                ctx.lineWidth = .8 * unit;
                ctx.beginPath();
                ctx.arc(x, y, (6 + random() * 6) * unit, random() * pi2, random() * pi2 + Math.PI * 1.15);
                ctx.stroke();
            }
        }
        else if (design === 'arcane') {
            // Rune wheels and small charged sparks: deterministic, never spell edges.
            for (let i = 0; i < 4; i++) {
                const [x, y] = places[i];
                const r = (14 + random() * 9) * unit;
                ctx.globalAlpha = .82;
                ctx.lineWidth = .9 * unit;
                strokeCircle(x, y, r, 'rgba(179,159,255,.40)');
                strokeCircle(x, y, r * .72, 'rgba(158,191,255,.33)');
                for (let k = 0; k < 7; k++) {
                    const a = k * pi2 / 7 + random() * .16, inn = r * .85, out = r * 1.12;
                    ctx.strokeStyle = 'rgba(190,176,255,.55)';
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * inn, y + Math.sin(a) * inn);
                    ctx.lineTo(x + Math.cos(a) * out, y + Math.sin(a) * out);
                    ctx.stroke();
                }
                pinStar(x, y, (3 + random() * 2) * unit, 'rgba(202,193,255,.77)');
            }
            for (let i = 0; i < 6; i++) {
                const x = (.24 + random() * .54) * w, y = (i % 2 ? .08 : .91) * h;
                ctx.globalAlpha = .45;
                pinStar(x, y, (2 + random() * 3) * unit, 'rgba(189,176,246,.57)');
            }
        }
        else if (design === 'divine') {
            // Sacred sun medallions and leaf-like rays, around the margins.
            for (let i = 0; i < 4; i++) {
                const [x, y] = places[i], r = (10 + random() * 10) * unit;
                ctx.lineWidth = .9 * unit;
                strokeCircle(x, y, r * .72, 'rgba(172,113,41,.39)');
                strokeCircle(x, y, r * .34, 'rgba(172,113,41,.47)');
                for (let arm = 0; arm < 12; arm++) {
                    const a = pi2 * arm / 12, inner = r * .85, outer = r * (1.18 + random() * .27);
                    ctx.strokeStyle = 'rgba(185,132,51,.55)';
                    ctx.globalAlpha = .74;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
                    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
                    ctx.stroke();
                }
                ctx.fillStyle = 'rgba(207,166,89,.38)';
                ctx.beginPath();
                ctx.arc(x, y, r * .19, 0, pi2);
                ctx.fill();
            }
            for (let i = 0; i < 5; i++) {
                const x = (.25 + random() * .51) * w, y = (i % 2 ? .10 : .87) * h;
                ctx.globalAlpha = .58;
                pinStar(x, y, (2.2 + random() * 2) * unit, 'rgba(184,135,66,.44)');
            }
        }
        else if (design === 'occult') {
            // Broken orbit rings, eyes, and wisps. Imperfect and asymmetrical.
            for (let i = 0; i < 4; i++) {
                const [x, y] = places[i], r = (12 + random() * 11) * unit;
                const turn = random() * pi2;
                ctx.globalAlpha = .65;
                ctx.strokeStyle = 'rgba(219,154,197,.50)';
                ctx.lineWidth = 1 * unit;
                ctx.beginPath();
                ctx.arc(x, y, r, turn, turn + Math.PI * (.85 + random() * .45));
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, r * .6, turn + 1, turn + Math.PI * 1.7);
                ctx.stroke();
                ctx.globalAlpha = .55;
                ctx.beginPath();
                ctx.ellipse(x, y, r * .44, r * .20, -.3, 0, pi2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(222,164,208,.59)';
                ctx.beginPath();
                ctx.arc(x, y, r * .14, 0, pi2);
                ctx.fill();
            }
            for (let i = 0; i < 7; i++) {
                const left = i % 2 === 0, x = left ? w * .061 : w * .94;
                const y = (.20 + random() * .61) * h, d = left ? 1 : -1;
                ctx.globalAlpha = .45;
                ctx.lineWidth = .7 * unit;
                ctx.strokeStyle = 'rgba(224,143,206,.42)';
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.bezierCurveTo(x + 15 * d * unit, y - 8 * unit, x + 30 * d * unit, y + 9 * unit, x + 16 * d * unit, y + 18 * unit);
                ctx.stroke();
            }
        }
        else if (design === 'primal') {
            // Tiny wandering ivy, spores and seedpods in the side margins.
            for (let side = 0; side < 2; side++) {
                const x = side === 0 ? w * .069 : w * .931, dir = side === 0 ? 1 : -1;
                const y0 = h * (.17 + random() * .05), y1 = h * (.73 + random() * .05);
                ctx.globalAlpha = .63;
                ctx.lineWidth = 1.2 * unit;
                ctx.strokeStyle = 'rgba(160,217,165,.57)';
                ctx.beginPath();
                ctx.moveTo(x, y0);
                ctx.bezierCurveTo(x + 23 * dir * unit, y0 + h * .14, x - 18 * dir * unit, y1 - h * .14, x, y1);
                ctx.stroke();
                for (let j = 0; j < 9; j++) {
                    const t = (j + .6) / 10;
                    const yy = y0 + (y1 - y0) * t, xx = x + Math.sin(t * pi2) * 8 * unit * dir;
                    const sign = (j % 2 ? 1 : -1) * dir;
                    const len = (7 + random() * 8) * unit;
                    ctx.fillStyle = 'rgba(150,212,136,.22)';
                    ctx.strokeStyle = 'rgba(153,213,153,.48)';
                    ctx.lineWidth = .7 * unit;
                    ctx.beginPath();
                    ctx.ellipse(xx + sign * len * .55, yy, len * .64, len * .23, sign * .55, 0, pi2);
                    ctx.fill();
                    ctx.stroke();
                }
            }
            for (let i = 0; i < 13; i++) {
                const x = (i % 2 ? w * .1 : w * .9) + (random() - .5) * 36 * unit;
                const y = (.12 + random() * .72) * h;
                ctx.fillStyle = 'rgba(216,240,166,.41)';
                ctx.globalAlpha = .7;
                ctx.beginPath();
                ctx.arc(x, y, (.7 + random() * 1.8) * unit, 0, pi2);
                ctx.fill();
            }
        }
        else if (design === 'herbarium') {
            // A light, ink-drawn vine down each side; leaves are tiny ellipses.
            for (let side = 0; side < 2; side++) {
                const x = side === 0 ? w * .065 : w * .935;
                const sign = side === 0 ? 1 : -1;
                const y0 = h * .18 + random() * h * .035;
                const y1 = h * .70 + random() * h * .06;
                const bend = (14 + random() * 12) * unit * sign;
                ctx.globalAlpha = .68;
                ctx.strokeStyle = 'rgba(72,112,77,.48)';
                ctx.lineWidth = 1.05 * unit;
                ctx.beginPath();
                ctx.moveTo(x, y0);
                ctx.bezierCurveTo(x + bend, y0 + h * .2, x - bend * .5, y1 - h * .18, x, y1);
                ctx.stroke();
                for (let j = 0; j < 7; j++) {
                    const t = (j + .5) / 8;
                    const yy = y0 + (y1 - y0) * t;
                    const xx = x + Math.sin(t * Math.PI * 2) * bend * .38;
                    const dir = ((j % 2) ? -1 : 1) * sign;
                    const len = (8 + random() * 8) * unit;
                    ctx.fillStyle = 'rgba(88,127,83,.25)';
                    ctx.strokeStyle = 'rgba(69,110,72,.44)';
                    ctx.globalAlpha = .72;
                    ctx.beginPath();
                    ctx.ellipse(xx + dir * len * .55, yy - 3 * unit, len * .7, 2.8 * unit, dir * (.38 + random() * .35), 0, pi2);
                    ctx.fill();
                    ctx.stroke();
                }
            }
            for (let i = 0; i < 3; i++) {
                const [cx, cy] = places[[0, 1, 2][i]];
                const r = (6 + random() * 3) * unit;
                ctx.fillStyle = 'rgba(212,188,112,.25)';
                ctx.strokeStyle = 'rgba(88,128,93,.40)';
                ctx.lineWidth = .7 * unit;
                ctx.globalAlpha = .75;
                for (let j = 0; j < 5; j++) {
                    const a = pi2 * j / 5;
                    ctx.beginPath();
                    ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * .68, r * .42, a, 0, pi2);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.arc(cx, cy, r * .44, 0, pi2);
                ctx.fillStyle = 'rgba(159,128,70,.50)';
                ctx.fill();
            }
        }
        ctx.restore();
    }
    paintGuides(ctx: CanvasRenderingContext2D, center: Point, radius: number, nodes: Point[], basePath: Point[] | null = null) {
        ctx.save();
        const design = this.baseTheme();
        ctx.strokeStyle = design === 'constellations' ? 'rgba(185,214,247,.15)' :
            design === 'blueprint' ? 'rgba(129,209,223,.2)' :
                design === 'obsidian' ? 'rgba(216,170,107,.18)' :
                    design === 'herbarium' ? 'rgba(86,113,71,.19)' :
                        design === 'arcane' ? 'rgba(192,181,255,.19)' :
                            design === 'divine' ? 'rgba(163,116,48,.19)' :
                                design === 'occult' ? 'rgba(222,157,202,.17)' :
                                    design === 'primal' ? 'rgba(168,213,170,.18)' : 'rgba(103,87,62,.19)';
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
            ctx.strokeStyle = design === 'constellations' ? 'rgba(185,214,247,.23)' :
                design === 'blueprint' ? 'rgba(129,209,223,.3)' :
                    design === 'obsidian' ? 'rgba(216,170,107,.27)' :
                        design === 'herbarium' ? 'rgba(86,113,71,.29)' :
                            design === 'arcane' ? 'rgba(192,181,255,.28)' :
                                design === 'divine' ? 'rgba(163,116,48,.28)' :
                                    design === 'occult' ? 'rgba(222,157,202,.26)' :
                                        design === 'primal' ? 'rgba(168,213,170,.29)' : 'rgba(104,82,51,.36)';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            basePath.forEach((point, i) => i
                ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }
    /** Draw real circular arcs with ctx.arc (never a Bezier approximation). */
    traceConnection(ctx: PathContext, p: Point, q: Point, spellCenter: Point, edgeIndex = 0) {
        if (this.settings.style === 'straight') {
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            return;
        }
        const dx = q.x - p.x, dy = q.y - p.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-9)
            return;
        const middle = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const normal = { x: -dy / length, y: dx / length };
        const dot = normal.x * (spellCenter.x - middle.x) +
            normal.y * (spellCenter.y - middle.y);
        // Each true circular arc is defined by its chord and sagitta; the circle
        // center is off the chord midpoint except for the centred semicircle mode.
        const inward = dot >= 0 ? 1 : -1;
        const side = this.settings.arcSide === 'outward' ? -inward :
            this.settings.arcSide === 'alternate' && edgeIndex % 2 ? -inward : inward;
        const sagitta = this.settings.style === 'centered'
            ? length / 2
            : length * Math.min(0.47, Math.max(0.05, Number(this.settings.curvature) || 0.22));
        // Exact circle geometry for a chord with length d and bulge s:
        // R = d^2/(8s) + s/2. It is safe for vertical chords as well.
        const circleRadius = length * length / (8 * sagitta) + sagitta / 2;
        const offset = sagitta - circleRadius;
        const circle = {
            x: middle.x + side * normal.x * offset,
            y: middle.y + side * normal.y * offset
        };
        const midpointOnArc = {
            x: middle.x + side * normal.x * sagitta,
            y: middle.y + side * normal.y * sagitta
        };
        const a0 = Math.atan2(p.y - circle.y, p.x - circle.x);
        const a1 = Math.atan2(q.y - circle.y, q.x - circle.x);
        const aMiddle = Math.atan2(midpointOnArc.y - circle.y, midpointOnArc.x - circle.x);
        const modTau = (angle: number) => ((angle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        const positiveSweep = modTau(a1 - a0);
        const midpointSweep = modTau(aMiddle - a0);
        const anticlockwise = midpointSweep > positiveSweep;
        ctx.arc(circle.x, circle.y, circleRadius, a0, a1, anticlockwise);
    }
    /** Each option changes the marker silhouette but not its binary data. */
    static traceNode(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, style: string) {
        ctx.beginPath();
        if (style === 'circle' || style === 'empty') {
            ctx.arc(x, y, r, 0, Math.PI * 2);
            return;
        }
        if (style === 'cross') {
            const b = r * 0.32;
            const arms = [[-b, -r], [b, -r], [b, -b], [r, -b], [r, b], [b, b],
                [b, r], [-b, r], [-b, b], [-r, b], [-r, -b], [-b, -b]];
            arms.forEach(([dx, dy], i) => i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy));
            ctx.closePath();
            return;
        }
        const vertices = style === 'star' ? 10 :
            style === 'triangle' ? 3 : style === 'hexagon' ? 6 : 4;
        const start = style === 'square' ? -Math.PI / 4 : -Math.PI / 2;
        for (let i = 0; i < vertices; i++) {
            const a = start + i * 2 * Math.PI / vertices;
            const rr = style === 'star' && i % 2 ? r * 0.45 : r;
            const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
            if (i === 0)
                ctx.moveTo(px, py);
            else
                ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    paintNodes(ctx: CanvasRenderingContext2D, points: Point[], radius: number, width: number, height: number) {
        const style = ['none', 'empty', 'circle', 'star', 'diamond', 'square',
            'triangle', 'hexagon', 'cross'].includes(this.settings.dotStyle)
            ? this.settings.dotStyle : 'circle';
        const scale = Math.max(0.5, Math.min(2.5, Number(this.settings.vertexSize) || 1));
        const base = Math.max(3.6, Math.min(5.4, radius / 50));
        const nodeRadius = (base + 1.8) * (style === 'circle' || style === 'empty' ? 1 : 1.35) * scale *
            Math.max(.67, Math.sqrt(11 / this.drawingVertexCount));
        const mean = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
        mean.x /= points.length;
        mean.y /= points.length;
        ctx.save();
        const design = this.baseTheme();
        const vertexColor = this.themeColor('vertices');
        const customVertices = vertexColor.toLowerCase() !== SpellDrawing.themePalettes[design]?.vertices.toLowerCase();
        const vertexStroke = Math.max(.5, Math.min(5, Number(this.settings.vertexStroke) || 1.5));
        const traditionMarkers: Record<string, {
            fill: string;
            outline: string;
            core: string;
            glow: string;
        }> = {
            arcane: { fill: '#1c2048', outline: '#cdc5ff', core: '#efe9ff', glow: 'rgba(157,147,255,.62)' },
            divine: { fill: '#fff8e8', outline: '#b08747', core: '#bb8739', glow: 'rgba(234,177,69,.34)' },
            occult: { fill: '#25172e', outline: '#e6b1d5', core: '#f5daef', glow: 'rgba(218,139,198,.46)' },
            primal: { fill: '#17372c', outline: '#b3dba5', core: '#e2efc2', glow: 'rgba(154,215,151,.34)' }
        };
        const labelMode = this.settings.vertexLabels !== 'none'
            ? this.settings.vertexLabels : (this.settings.labels ? 'numbers' : 'none');
        points.forEach((point, i) => {
            if (style !== 'none') {
                if (design === 'tattoo') {
                    SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius * .65, style);
                    ctx.strokeStyle = vertexColor;
                    ctx.fillStyle = vertexColor;
                    ctx.lineWidth = vertexStroke;
                    if (style !== 'empty') ctx.fill();
                    ctx.stroke();
                }
                else if (design === 'constellations') {
                    // A miniature illuminated star; size slider remains functional.
                    const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, nodeRadius * 3.4);
                    halo.addColorStop(0, 'rgba(207,234,255,.43)');
                    halo.addColorStop(.35, 'rgba(125,181,240,.13)');
                    halo.addColorStop(1, 'rgba(100,155,223,0)');
                    ctx.fillStyle = halo;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, nodeRadius * 3.4, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.save();
                    SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius * .8, style);
                    ctx.fillStyle = style === 'empty' ? '#101e34' : '#f4faff';
                    ctx.shadowColor = 'rgba(198,229,255,.95)';
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(239,248,255,.97)';
                    ctx.lineWidth = vertexStroke;
                    if (customVertices)
                        ctx.strokeStyle = vertexColor;
                    ctx.stroke();
                    if (style !== 'empty') {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, Math.max(.6, .72 * scale), 0, 2 * Math.PI);
                        ctx.fillStyle = customVertices ? vertexColor : '#ffffff';
                        ctx.fill();
                    }
                    ctx.restore();
                }
                else if (design === 'blueprint') {
                    SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius, style);
                    ctx.fillStyle = '#102b3a';
                    ctx.fill();
                    ctx.strokeStyle = '#a5e6ef';
                    ctx.lineWidth = vertexStroke;
                    if (customVertices)
                        ctx.strokeStyle = vertexColor;
                    ctx.stroke();
                    if (style !== 'empty') {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, Math.max(.8, 1.05 * scale), 0, 2 * Math.PI);
                        ctx.fillStyle = customVertices ? vertexColor : '#b5f2f5';
                        ctx.fill();
                    }
                }
                else if (design === 'obsidian') {
                    SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius * .93, style);
                    ctx.fillStyle = '#1c1f23';
                    ctx.fill();
                    ctx.strokeStyle = '#f1ca89';
                    ctx.shadowColor = 'rgba(240,186,112,.34)';
                    ctx.shadowBlur = 6;
                    ctx.lineWidth = vertexStroke;
                    if (customVertices)
                        ctx.strokeStyle = vertexColor;
                    ctx.stroke();
                    if (style !== 'empty') {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, Math.max(.65, .85 * scale), 0, Math.PI * 2);
                        ctx.fillStyle = customVertices ? vertexColor : '#e8c085';
                        ctx.fill();
                    }
                }
                else if (design === 'herbarium') {
                    SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius * .95, style);
                    ctx.fillStyle = '#ecf1e4';
                    ctx.fill();
                    ctx.strokeStyle = '#4c6652';
                    ctx.lineWidth = vertexStroke;
                    if (customVertices)
                        ctx.strokeStyle = vertexColor;
                    ctx.stroke();
                    if (style !== 'empty') {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, Math.max(.75, .9 * scale), 0, Math.PI * 2);
                        ctx.fillStyle = customVertices ? vertexColor : '#7d8c61';
                        ctx.fill();
                    }
                }
                else if (['arcane', 'divine', 'occult', 'primal'].includes(design)) {
                    const palette = traditionMarkers[design];
                    const r = nodeRadius * (design === 'arcane' ? .83 : design === 'occult' ? .82 : .9);
                    if (design !== 'divine') {
                        const light = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r * 2.8);
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
                    if (customVertices)
                        ctx.strokeStyle = vertexColor;
                    ctx.stroke();
                    if (style !== 'empty') {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, Math.max(.65, .9 * scale), 0, Math.PI * 2);
                        ctx.fillStyle = customVertices ? vertexColor : palette.core;
                        ctx.fill();
                    }
                    ctx.restore();
                }
                else {
                    SpellDrawing.traceNode(ctx, point.x, point.y, nodeRadius, style);
                    ctx.fillStyle = '#fcf9ef';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(91,74,49,.85)';
                    ctx.lineWidth = vertexStroke;
                    if (customVertices)
                        ctx.strokeStyle = vertexColor;
                    ctx.stroke();
                    if (style !== 'empty') {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, Math.max(0.8, 1.05 * scale), 0, Math.PI * 2);
                        ctx.fillStyle = customVertices ? vertexColor : '#857052';
                        ctx.fill();
                    }
                }
            }
            if (labelMode === 'numbers') {
                const vx = point.x - mean.x, vy = point.y - mean.y;
                const length = Math.max(1, Math.hypot(vx, vy));
                ctx.fillStyle = design === 'tattoo' ? vertexColor : design === 'constellations' ? '#93b0d2' :
                    design === 'blueprint' ? '#92c9d5' : design === 'obsidian' ? '#c6a276' :
                        design === 'herbarium' ? '#71826b' :
                            design === 'arcane' ? '#aaa4d9' : design === 'divine' ? '#987a49' :
                                design === 'occult' ? '#c4a1c1' : design === 'primal' ? '#a8cdb0' : '#94876b';
                ctx.font = '11px ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const offset = (style === 'none' ? 15 : nodeRadius + 15);
                ctx.fillText(String(i + 1).padStart(2, '0'), point.x + vx / length * offset, point.y + vy / length * offset);
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
    paintAttributeVertexLabels(ctx: CanvasRenderingContext2D, points: Point[], width: number, height: number) {
        const mean = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
        mean.x /= points.length;
        mean.y /= points.length;
        const isPolygon = (this.settings.base || 'polygon') === 'polygon';
        ctx.save();
        ctx.font = `${width < 620 ? '600 10px' : '600 11px'} ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.drawingChords.forEach((attribute, attributeIndex) => {
            const index = Math.round(attributeIndex * points.length / this.drawingChords.length) % points.length;
            const point = points[index];
            let nx = point.x - mean.x, ny = point.y - mean.y;
            if (!isPolygon) {
                const before = points[Math.max(0, index - 1)];
                const after = points[Math.min(points.length - 1, index + 1)];
                const tx = after.x - before.x, ty = after.y - before.y;
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
            const labelOffset = (isPolygon ? 32 : 36) +
                (this.settings.dotStyle === 'none' ? 0 :
                    Math.max(0, Number(this.settings.vertexSize || 1) - 1) * 8);
            const idealX = point.x + nx / length * labelOffset;
            const idealY = point.y + ny / length * labelOffset;
            const x = Math.min(width - margin - textWidth / 2 - pad, Math.max(margin + textWidth / 2 + pad, idealX));
            const y = Math.min(height - 72, Math.max(72, idealY));
            ctx.fillStyle = this.baseTheme() === 'tattoo' ? this.themeColor('background') :
                this.baseTheme() === 'constellations' ? 'rgba(9,23,43,.82)' :
                this.baseTheme() === 'blueprint' ? 'rgba(7,34,48,.9)' :
                    this.baseTheme() === 'obsidian' ? 'rgba(25,26,28,.91)' :
                        this.baseTheme() === 'herbarium' ? 'rgba(235,241,227,.91)' :
                            this.baseTheme() === 'arcane' ? 'rgba(17,22,52,.88)' :
                                this.baseTheme() === 'divine' ? 'rgba(252,244,227,.94)' :
                                    this.baseTheme() === 'occult' ? 'rgba(28,17,36,.91)' :
                                        this.baseTheme() === 'primal' ? 'rgba(11,37,29,.91)' :
                                            'rgba(249,245,234,.88)';
            ctx.fillRect(x - textWidth / 2 - pad, y - 9, textWidth + 2 * pad, 18);
            ctx.fillStyle = this.baseTheme() === 'tattoo' ? this.themeColor('lines') :
                this.baseTheme() === 'constellations' ? '#deebf9' :
                this.baseTheme() === 'blueprint' ? '#b6e4ec' :
                    this.baseTheme() === 'obsidian' ? '#f0c991' :
                        this.baseTheme() === 'herbarium' ? '#536c54' :
                            this.baseTheme() === 'arcane' ? '#dad4ff' :
                                this.baseTheme() === 'divine' ? '#947036' :
                                    this.baseTheme() === 'occult' ? '#f0c9e2' :
                                        this.baseTheme() === 'primal' ? '#b8d8ad' : '#76644c';
            ctx.fillText(text, x, y + 0.4);
        });
        ctx.restore();
    }
}
