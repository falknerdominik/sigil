import { styleNumber } from './drawing-style';
import type { DrawingSettings, Point, PathContext } from './drawing-style';
interface InkPoint extends Point {
  t: number;
}
type InkSettings = Pick<
  DrawingSettings,
  'handDrawnInk' | 'inkWobble' | 'inkPressure' | 'inkFeather'
>;
/**
 * Convert ordinary Canvas line and true-circle arc instructions to a
 * polyline suitable for a deterministic ink-nib pass. This is a purely
 * visual approximation: the underlying exact mathematical paths and all
 * binary data remain unchanged and still drive layout fitting.
 */
export function flattenInkPath(trace: (path: PathContext) => void, step = 8) {
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
      points.push({
        x: last.x + ((x - last.x) * i) / steps,
        y: last.y + ((y - last.y) * i) / steps,
      });
  };
  const record: PathContext = {
    moveTo(x, y) {
      if (points.length) paths.push(points);
      points = [{ x, y }];
    },
    lineTo(x, y) {
      addLine(x, y);
    },
    arc(cx, cy, r, start, end, anticlockwise = false) {
      const tau = Math.PI * 2;
      const positive = (value: number) => ((value % tau) + tau) % tau;
      const full = Math.abs(end - start) >= tau - 1e-7;
      const sweep = full
        ? tau
        : positive(anticlockwise ? start - end : end - start);
      const p0 = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
      addLine(p0.x, p0.y);
      const steps = Math.max(2, Math.ceil((sweep * r) / step));
      for (let i = 1; i <= steps; i++) {
        const a = start + ((anticlockwise ? -1 : 1) * sweep * i) / steps;
        addLine(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
    },
  };
  trace(record);
  if (points.length) paths.push(points);
  return paths;
}

/**
 * A directional calligraphy-nib profile: thick ink deposits at pen-down,
 * gradually declining to a fine pen-lift. Pressure 0 retains uniform width.
 * Progress is measured along the actual stroke length (not point index),
 * so long chords, short ID lines and circular arcs behave consistently.
 */
export function inkNibWidth(
  progress: number,
  baseWidth: number,
  pressure: number,
) {
  const p = styleNumber(pressure, 0.35, 0, 2.5);
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
export function splitInkDashes(
  points: Point[],
  pattern: number[] = [],
  offset = 0,
) {
  const total = points
    .slice(1)
    .reduce(
      (length, point, i) =>
        length + Math.hypot(point.x - points[i].x, point.y - points[i].y),
      0,
    );
  if (!total || points.length < 2) return [];
  let travelled = 0;
  const measured = points.map((p, i) => {
    if (i)
      travelled += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    return { x: p.x, y: p.y, t: travelled / total };
  });
  if (!pattern?.length) return [measured];
  const raw = [...pattern].map((v) => Math.max(0, Number(v) || 0));
  const dashes = raw.length % 2 ? [...raw, ...raw] : raw;
  const period = dashes.reduce((sum, v) => sum + v, 0);
  if (period < 1e-8) return [measured];
  let phase = ((offset % period) + period) % period;
  let dashIndex = 0;
  while (dashIndex < dashes.length - 1 && phase >= dashes[dashIndex]) {
    phase -= dashes[dashIndex++];
  }
  let remaining = dashes[dashIndex] - phase;
  let active: InkPoint[] = [];
  const pieces: InkPoint[][] = [];
  const flush = () => {
    if (active.length > 1) pieces.push(active);
    active = [];
  };
  const advance = () => {
    if (dashIndex % 2 === 0) flush();
    do {
      dashIndex = (dashIndex + 1) % dashes.length;
    } while (dashes[dashIndex] <= 1e-8);
    remaining = dashes[dashIndex];
  };
  if (remaining <= 1e-8) advance();
  let distance = 0;
  for (let i = 1; i < measured.length; i++) {
    const a = measured[i - 1],
      b = measured[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    let travelledOnSegment = 0;
    while (travelledOnSegment < length - 1e-8) {
      const step = Math.min(length - travelledOnSegment, remaining);
      const pointAt = (d: number) => ({
        x: a.x + ((b.x - a.x) * d) / length,
        y: a.y + ((b.y - a.y) * d) / length,
        t: (distance + d) / total,
      });
      if (dashIndex % 2 === 0 && step > 1e-8) {
        if (!active.length) active.push(pointAt(travelledOnSegment));
        active.push(pointAt(travelledOnSegment + step));
      }
      travelledOnSegment += step;
      remaining -= step;
      if (remaining <= 1e-8) advance();
    }
    distance += length;
  }
  flush();
  return pieces;
}

/** Draw a continuously tapered, round-ended ink shape in a single fill. */
export function fillInkRibbon(
  ctx: CanvasRenderingContext2D,
  points: InkPoint[],
  baseWidth: number,
  pressure: number,
  widthFactor = 1,
) {
  if (points.length < 2) return;
  const sides = points.map((point, i) => {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - previous.x,
      dy = next.y - previous.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = -dy / distance,
      ny = dx / distance;
    const r = (inkNibWidth(point.t, baseWidth, pressure) * widthFactor) / 2;
    return { x: point.x, y: point.y, nx, ny, r };
  });
  const first = sides[0],
    last = sides[sides.length - 1];
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
export function strokeInk(
  ctx: CanvasRenderingContext2D,
  trace: (path: PathContext) => void,
  settings: InkSettings,
  seed = 0,
) {
  if (!settings.handDrawnInk) {
    ctx.beginPath();
    trace(ctx);
    ctx.stroke();
    return;
  }
  const wobble = styleNumber(settings.inkWobble, 0.5, 0, 3);
  const pressure = styleNumber(settings.inkPressure, 0.35, 0, 2.5);
  const feather = styleNumber(settings.inkFeather, 0.3, 0, 1);
  const flattened = flattenInkPath(trace);
  ctx.save();
  const originalWidth = ctx.lineWidth;
  const originalOpacity = ctx.globalAlpha;
  const pattern =
    typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
  ctx.fillStyle = ctx.strokeStyle;
  for (let pathIndex = 0; pathIndex < flattened.length; pathIndex++) {
    const input = flattened[pathIndex];
    if (input.length < 2) continue;
    const s = seed * 0.617 + pathIndex * 17.31;
    const points = input.map((p, i) => {
      const before = input[Math.max(0, i - 1)],
        after = input[Math.min(input.length - 1, i + 1)];
      const dx = after.x - before.x,
        dy = after.y - before.y;
      const d = Math.hypot(dx, dy) || 1;
      const taper = Math.min(1, i / 2, (input.length - 1 - i) / 2);
      const drift =
        Math.sin(i * 0.72 + s) * 0.63 + Math.cos(i * 0.26 + s * 1.8) * 0.37;
      return {
        x: p.x - (dy / d) * wobble * taper * drift,
        y: p.y + (dx / d) * wobble * taper * drift,
      };
    });
    const pieces = splitInkDashes(points, pattern, ctx.lineDashOffset || 0);
    if (feather > 0) {
      ctx.save();
      ctx.globalAlpha = originalOpacity * (0.12 + 0.12 * feather);
      ctx.shadowColor = String(ctx.strokeStyle);
      ctx.shadowBlur = 1 + feather * 3.8;
      for (const piece of pieces) {
        fillInkRibbon(ctx, piece, originalWidth, pressure, 1 + feather * 1.6);
      }
      ctx.restore();
    }
    for (const piece of pieces) {
      fillInkRibbon(ctx, piece, originalWidth, pressure);
    }
  }
  ctx.restore();
}
