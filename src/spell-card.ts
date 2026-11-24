import type { SpellDrawing } from './spell-drawing';
import type { SpellRepresentation } from './spell-calculation';
import { CARD_WIDTH } from './constants';
export interface CardSpell {
  name?: string;
  rank?: string;
  tradition?: string;
  range?: string;
  duration?: string;
  effectTrait?: string;
  damage?: string;
  area?: string;
  actions?: string;
  castActions?: string;
  castTraits?: string;
  rawAction?: string;
  traits?: string[];
  description?: string;
}
/**
 * SpellCard - one-page, theme-matched PNG cards rendered completely offline.
 * Card copy is independent of Sigil's lossless spell encoding.
 */
export const readonlyWidth = CARD_WIDTH;
export function cleanDescription(value: unknown): string {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/gi,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&nbsp;': ' ',
        })[entity.toLowerCase()] || entity,
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/(?<!\w)\*(?=\w)|(?<=\w)\*(?!\w)/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
/** Wrap without truncating descriptions or long unbroken words. */
export function wrapText(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  text: string,
  maxWidth: number,
): string[] {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    for (const char of word) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export function actionsLabel(value: unknown, rawAction = ''): string {
  const text = String(value || '').trim();
  if (/^[123] actions?$/.test(text)) return text.toUpperCase();
  if (text === 'Reaction') return 'REACTION';
  if (text === 'Free action') return 'FREE ACTION';
  if (text === '1 minute' || text === '10 minutes') return text.toUpperCase();
  const raw = String(rawAction || '').trim();
  if (/^[123]$/.test(raw)) return `${raw} ACTION${raw === '1' ? '' : 'S'}`;
  if (/^(reaction|free action|free)$/i.test(raw))
    return /reaction/i.test(raw) ? 'REACTION' : 'FREE ACTION';
  if (raw) return `CAST: ${raw.toUpperCase().slice(0, 48)}`;
  return 'CASTING TIME NOT LISTED';
}
/** These are the nine mechanics from Layers 1 and 2, not just catalogue tags. */
export function attributeValues(spell: CardSpell) {
  const clean = (value: unknown) => {
    const text = String(value ?? '').trim();
    if (!text || /^(none|not listed)$/i.test(text)) return 'None';
    return text.replace(/\+/g, ' + ');
  };
  return [
    {
      label: 'Rank',
      value: spell.rank === 'cantrip' ? 'Cantrip' : clean(spell.rank),
    },
    { label: 'Tradition', value: clean(spell.tradition) },
    { label: 'Range', value: clean(spell.range) },
    { label: 'Duration', value: clean(spell.duration) },
    { label: 'Primary trait', value: clean(spell.effectTrait) },
    { label: 'Damage', value: clean(spell.damage) },
    { label: 'Area', value: clean(spell.area) },
    {
      label: 'Casting time',
      value: actionsLabel(spell.actions ?? spell.castActions, spell.rawAction)
        .replace(/^CASTING TIME NOT LISTED$/, 'Not listed')
        .toLowerCase(),
    },
    { label: 'Casting traits', value: clean(spell.castTraits) },
  ];
}
export function rgb(hex: string) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#242a31';
  return [1, 3, 5].map((index) =>
    Number.parseInt(value.slice(index, index + 2), 16),
  );
}
export function rgba(hex: string, opacity: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${opacity})`;
}
export function palette(drawing: Pick<SpellDrawing, 'themeColor'>) {
  const background = drawing.themeColor('background');
  const accent = drawing.themeColor('lines');
  const vertex = drawing.themeColor('vertices');
  const [r, g, b] = rgb(background).map((c) => c / 255);
  const linear = [r, g, b].map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const light =
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 > 0.38;
  return {
    background,
    accent,
    vertex,
    light,
    ink: light ? '#26312f' : '#f5f2e9',
    muted: light ? 'rgba(32,47,44,.82)' : 'rgba(240,242,241,.78)',
    chipFill: light ? 'rgba(255,255,255,.64)' : 'rgba(7,18,24,.55)',
    chipBorder: rgba(accent, light ? 0.55 : 0.66),
    rule: rgba(accent, light ? 0.55 : 0.48),
  };
}
/** Word wrapping and chip rows determine the actual height; nothing is cropped. */
export function layout(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  spell: CardSpell,
  width = readonlyWidth,
) {
  const pad = 74;
  const inner = width - 2 * pad;
  const name = String(spell.name || 'Untitled spell').trim();
  let nameSize = 67;
  let titleLines: string[];
  do {
    ctx.font = `normal ${nameSize}px Georgia, 'Times New Roman', serif`;
    titleLines = wrapText(ctx, name, inner);
    if (titleLines.length <= 2 || nameSize <= 34) break;
    nameSize -= 3;
  } while (titleLines.length > 2 && nameSize >= 34);
  const titleBaseline = 119;
  const titleStep = nameSize + 11;
  const titleBottom = titleBaseline + (titleLines.length - 1) * titleStep;
  const artY = titleBottom + 33;
  const artHeight = 570;
  const attributeChips = [];
  let x = pad,
    y = artY + artHeight + 26,
    rowHeight = 0;
  const gap = 11,
    rowGap = 10;
  for (const attribute of attributeValues(spell)) {
    const label = attribute.label.toUpperCase();
    const value = attribute.value;
    ctx.font = '700 13px Arial, Helvetica, sans-serif';
    const labelWidth = ctx.measureText(label).width;
    ctx.font = '500 19px Arial, Helvetica, sans-serif';
    const valueWidth = ctx.measureText(value).width;
    const requested = Math.ceil(18 + labelWidth + 14 + valueWidth + 18);
    const chipWidth = Math.min(inner, requested);
    const wrapValue = requested > inner;
    const valueLines = wrapValue
      ? wrapText(ctx, value, Math.max(50, chipWidth - labelWidth - 50))
      : [value];
    const chipHeight = Math.max(
      45,
      wrapValue ? 30 + 25 * valueLines.length : 45,
    );
    if (x > pad && x + chipWidth > width - pad) {
      x = pad;
      y += rowHeight + rowGap;
      rowHeight = 0;
    }
    attributeChips.push({
      label,
      value,
      valueLines,
      x,
      y,
      width: chipWidth,
      height: chipHeight,
    });
    x += chipWidth + gap;
    rowHeight = Math.max(rowHeight, chipHeight);
  }
  y += rowHeight + 19;
  // Catalogue traits are distinct from the nine editor attributes.
  const traitChips = [];
  const traitTokens = [
    ...new Set(
      (spell.traits || [])
        .map((value) => String(value).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  x = pad;
  ctx.font = '600 15px Arial, Helvetica, sans-serif';
  for (const text of traitTokens) {
    const chipWidth = Math.min(
      inner,
      Math.ceil(ctx.measureText(text).width + 30),
    );
    if (x > pad && x + chipWidth > width - pad) {
      x = pad;
      y += 38;
    }
    traitChips.push({ text, x, y, width: chipWidth, height: 30 });
    x += chipWidth + 9;
  }
  if (traitChips.length) y += 39;
  const dividerY = y + 8;
  let descriptionY = dividerY + 48;
  const description =
    cleanDescription(spell.description) || 'No description provided.';
  const descriptionLines = [];
  ctx.font = '25px Arial, Helvetica, sans-serif';
  for (const paragraph of description.split('\n')) {
    if (!paragraph.trim()) {
      descriptionY += 17;
      continue;
    }
    for (const text of wrapText(ctx, paragraph, inner)) {
      descriptionLines.push({ text, y: descriptionY });
      descriptionY += 37;
    }
  }
  const height = Math.ceil(Math.max(1130, descriptionY + 74));
  return {
    width,
    height,
    pad,
    inner,
    name,
    nameSize,
    titleLines,
    titleBaseline,
    titleStep,
    artY,
    artHeight,
    attributeChips,
    traitChips,
    dividerY,
    description,
    descriptionLines,
  };
}
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke: string,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  }
}
/** Use precisely the active theme (including custom color overrides). */
export function render(
  drawing: SpellDrawing,
  representation: SpellRepresentation,
  spell: CardSpell,
) {
  const width = readonlyWidth;
  const image = document.createElement('canvas');
  image.width = width;
  let ctx = image.getContext('2d');
  if (!ctx) throw new Error('Spell card export needs Canvas 2D.');
  const plan = layout(ctx, spell, width);
  image.height = plan.height;
  // Resizing resets Canvas state.
  ctx = image.getContext('2d');
  if (!ctx) throw new Error('Spell card export needs Canvas 2D.');
  const colors = palette(drawing);
  const center = { x: width / 2, y: plan.height / 2 };
  drawing.paintThemeBackdrop(
    ctx,
    width,
    plan.height,
    center,
    Math.min(width, plan.height) * 0.39,
  );
  drawing.recolorBackground(ctx);
  // No fixed black header or white description panel; all artwork and copy
  // share the currently selected background texture and palette.
  ctx.fillStyle = colors.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `normal ${plan.nameSize}px Georgia, 'Times New Roman', serif`;
  for (let i = 0; i < plan.titleLines.length; i++)
    ctx.fillText(
      plan.titleLines[i],
      plan.pad,
      plan.titleBaseline + i * plan.titleStep,
    );
  ctx.fillStyle = colors.rule;
  ctx.fillRect(plan.pad, plan.artY - 20, plan.inner, 1.4);
  const art = document.createElement('canvas');
  art.width = plan.inner;
  art.height = plan.artHeight;
  const artCtx = art.getContext('2d');
  if (!artCtx) throw new Error('Unable to render spell sigil on card.');
  drawing.paintNotation(artCtx, art.width, art.height, representation, {
    transparentBackground: true,
  });
  ctx.drawImage(art, plan.pad, plan.artY);
  for (const chip of plan.attributeChips) {
    roundRect(
      ctx,
      chip.x,
      chip.y,
      chip.width,
      chip.height,
      10,
      colors.chipFill,
      colors.chipBorder,
    );
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.accent;
    ctx.font = '700 13px Arial, Helvetica, sans-serif';
    ctx.fillText(chip.label, chip.x + 18, chip.y + chip.height / 2);
    ctx.fillStyle = colors.ink;
    ctx.font = '500 19px Arial, Helvetica, sans-serif';
    ctx.font = '700 13px Arial, Helvetica, sans-serif';
    const labelWidth = ctx.measureText(chip.label).width;
    ctx.font = '500 19px Arial, Helvetica, sans-serif';
    const baseX = chip.x + 18 + labelWidth + 14;
    if (chip.valueLines.length === 1) {
      ctx.fillText(chip.value, baseX, chip.y + chip.height / 2);
    } else {
      chip.valueLines.forEach((line, i) =>
        ctx.fillText(
          line,
          baseX,
          chip.y +
            (chip.height - (chip.valueLines.length - 1) * 23) / 2 +
            i * 23,
        ),
      );
    }
  }
  for (const chip of plan.traitChips) {
    roundRect(
      ctx,
      chip.x,
      chip.y,
      chip.width,
      chip.height,
      15,
      colors.chipFill,
      colors.chipBorder,
    );
    ctx.fillStyle = colors.muted;
    ctx.font = '600 15px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(chip.text, chip.x + 15, chip.y + chip.height / 2);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.rule;
  ctx.fillRect(plan.pad, plan.dividerY, plan.inner, 1.4);
  ctx.fillStyle = colors.ink;
  ctx.font = '25px Arial, Helvetica, sans-serif';
  for (const line of plan.descriptionLines)
    ctx.fillText(line.text, plan.pad, line.y);
  // Keep a small Paizo attribution on exported cards. It is unobtrusive,
  // and does not cover the spell description even for tall cards.
  ctx.fillStyle = colors.muted;
  ctx.font = '14px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    'Pathfinder spell material © Paizo Inc. · Unofficial · paizo.com/licenses/communityuse',
    plan.pad,
    plan.height - 29,
  );
  return image;
}
