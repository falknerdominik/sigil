'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { SpellCalculation } = require('../generated/spell-calculation.cjs');

module.exports = async function renderCalculationExample(representation) {
  const root = path.resolve(__dirname, '../..');
  const variant = SpellCalculation.decodeIdentity(
    representation.complete.identityBits,
  ).variant;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id="figure"></canvas>');
    await page.addScriptTag({
      path: path.join(root, 'src/generated/spell-drawing.browser.js'),
    });
    const dataUrl = await page.evaluate(
      ({ representation, variant }) => {
        const figure = document.getElementById('figure');
        const width = 1440;
        const height = 880;
        figure.width = width * 2;
        figure.height = height * 2;
        const ctx = figure.getContext('2d');
        if (!ctx) throw new Error('The example picture needs Canvas 2D.');
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#172033';
        ctx.font = '600 36px sans-serif';
        ctx.fillText(`Worked example: ${variant}`, 48, 56);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#526174';
        ctx.fillText(
          'Complete notation | Rank filter off | Plain style',
          48,
          96,
        );

        const colors = {
          vertex: '#64748b',
          rank: '#1d4ed8',
          orbit: '#b45309',
          identity: '#047857',
        };
        const drawing = new SigilDrawing.SpellDrawing({
          design: 'plain',
          style: 'straight',
          dotStyle: 'circle',
          vertexSize: 0.7,
          identityMarkerOpacity: 1,
          identityTickWidth: 1.5,
          orbitWidth: 2.5,
          themeColors: {
            background: '#ffffff',
            lines: '#667085',
            vertices: '#334155',
          },
        });
        const sigil = document.createElement('canvas');
        sigil.width = 1600;
        sigil.height = 1440;
        const ink = sigil.getContext('2d');
        if (!ink) throw new Error('The sigil needs Canvas 2D.');
        ink.scale(2, 2);
        drawing.paintNotation(ink, 800, 720, representation, {
          transparentBackground: true,
        });
        const { complete } = representation;
        const geometry = drawing.getGeometry(
          800,
          720,
          complete.identityBits,
          complete.chords,
        );
        const { points, center, radius, identityTicks } = geometry;
        const rank = complete.chords.find((group) => group.id === 'rank');
        const [from, to] = rank.edges[0];
        const orbit = complete.orbits[complete.orbits.length - 1];
        const tick = identityTicks.reduce((best, candidate) =>
          candidate.from.x - candidate.from.y > best.from.x - best.from.y
            ? candidate
            : best,
        );
        ink.strokeStyle = colors.rank;
        ink.lineWidth = 5;
        ink.beginPath();
        drawing.traceConnection(
          ink,
          points[from],
          points[to],
          center,
          from + rank.k,
        );
        ink.stroke();
        drawing.settings.themeColors.lines = colors.orbit;
        drawing.paintOrbits(ink, center, points, radius, [orbit]);
        ink.strokeStyle = colors.vertex;
        ink.lineWidth = 3;
        ink.beginPath();
        ink.arc(points[from].x, points[from].y, 10, 0, 2 * Math.PI);
        ink.stroke();
        ink.strokeStyle = colors.identity;
        ink.beginPath();
        ink.moveTo(tick.from.x, tick.from.y);
        ink.lineTo(tick.to.x, tick.to.y);
        ink.stroke();

        ink.font = '20px monospace';
        ink.textAlign = 'center';
        ink.textBaseline = 'middle';
        ink.fillStyle = '#334155';
        points.forEach((point, index) => {
          const distance = Math.hypot(point.x - center.x, point.y - center.y);
          ink.fillText(
            String(index),
            point.x + ((point.x - center.x) / distance) * 24,
            point.y + ((point.y - center.y) / distance) * 24,
          );
        });
        ctx.drawImage(sigil, 48, 110, 800, 720);

        function badge(number, point, dx, dy, color) {
          const x = point.x + 48;
          const y = point.y + 110;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, 18, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 23px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(number), x + dx, y + dy);
        }

        function label(number, y, color, title, lines) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(952, y - 8, 18, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 23px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(number), 952, y - 8);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#172033';
          ctx.font = '600 28px sans-serif';
          ctx.fillText(title, 986, y);
          ctx.font = '24px sans-serif';
          ctx.fillStyle = '#526174';
          const wrapped = [];
          for (const line of lines) {
            let current = '';
            for (const word of line.split(' ')) {
              const next = current ? `${current} ${word}` : word;
              if (ctx.measureText(next).width > width - 1034) {
                wrapped.push(current);
                current = word;
              } else {
                current = next;
              }
            }
            wrapped.push(current);
          }
          wrapped.forEach((line, index) => {
            ctx.fillText(line, 986, y + 38 + index * 32);
          });
        }

        badge(1, points[from], 65, -22, colors.vertex);
        badge(
          2,
          {
            x: (points[from].x + points[to].x) / 2,
            y: (points[from].y + points[to].y) / 2,
          },
          75,
          38,
          colors.rank,
        );
        badge(3, points[orbit.vertex], -65, -25, colors.orbit);
        badge(4, tick.from, 65, -28, colors.identity);
        label(1, 230, colors.vertex, `Encoding vertex ${from}`, [
          `Editor number label: ${String(from + 1).padStart(2, '0')}`,
          'One position in each binary word.',
        ]);
        label(2, 380, colors.rank, 'Layer 1 - Rank', [
          `Connection ${from} to ${to}; step ${rank.k}.`,
          'Other primary fields use other steps.',
        ]);
        label(3, 530, colors.orbit, 'Layer 2 - Orbit', [
          `U = ${orbit.units}; sweep = ${Math.round((orbit.sweep * 180) / Math.PI)} degrees.`,
          'One arc combines the secondary bits.',
        ]);
        label(4, 680, colors.identity, 'Layer 3 - Fingerprint', [
          'Marks are 1; gaps are 0.',
          `The full ID occupies ${complete.identityBits.length} slots.`,
        ]);
        ctx.font = '22px sans-serif';
        ctx.fillText(
          `All ${representation.visible.revealCount} mechanical elements shown. Small numbers are encoding indices, not editor labels.`,
          48,
          854,
        );
        return figure.toDataURL('image/png');
      },
      { representation, variant },
    );
    const output = path.join(root, 'docs/calculation-example.png');
    fs.writeFileSync(output, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`Rendered ${path.relative(root, output)}`);
  } finally {
    await browser.close();
  }
};
