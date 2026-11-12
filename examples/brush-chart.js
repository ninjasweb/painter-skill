// Brush chart: every preset, loaded → dry, plus pigment mixes. A calibration target for the engine.
import { Painting, BRUSH, mix, pigment, mixOk, shift } from 'painter';
export const meta = { duration: 4 };
export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#b8946a' });
  p.duration = 4;
  const l = p.layer('chart');
  const names = Object.keys(BRUSH);
  names.forEach((n, i) => {
    const y = 0.07 + i * 0.088;
    const c = mix({ ultramarine: 2, burntUmber: 1, titaniumWhite: i % 2 ? 2 : 0.4 });
    l.stroke({ brush: n, p0: [0.06, y], p2: [0.62, y + 0.01], p1: [0.34, y - 0.03], width: 0.05, color: c, color2: shift(c, 0.12), mix2: 0.3 });
    l.stroke({ brush: n, x: 0.78, y, angle: 0.1, length: 0.22, width: 0.05, color: pigment('cadmiumOrange'), dry: 0.6 });
    l.stroke({ brush: n, x: 1.0, y, angle: -0.2, length: 0.12, width: 0.03, color: pigment('titaniumWhite'), thick: 1 });
  });
  const greens = [mix({ ultramarine: 1, cadmiumLemon: 1 }), mix({ ultramarine: 2, transYellowOxide: 2 }), mix({ phthaloGreen: 1, transRedOxide: 1 }), mix({ prussianBlue: 1, sapGreen: 1, burntUmber: 0.5 }), mix({ phthaloGreen: 1, cadmiumYellow: 2, titaniumWhite: 1 })];
  greens.forEach((g, i) => l.scatter({ bounds: [1.2 + i * 0.11, 0.08, 1.3 + i * 0.11, 0.45], spacing: 0.02, brush: 'dab', color: g, width: 0.03, length: 0.04, angle: (x, y, r) => r() * 6 }));
  l.scatter({ bounds: [1.2, 0.55, 1.72, 0.95], spacing: 0.012, brush: 'flat', width: 0.035, length: 0.07, jitter: 0.5,
    color: (x, y) => mixOk('#f2b24a', '#3b2a6b', (y - 0.55) / 0.4), angle: 0, thick: (x, y) => 1 - (y - 0.55) / 0.4 });
  p.timelapse({ start: 0, end: 3 });
  return p;
}
