// People in a painted landscape, placed with perspective. Photos: refs/hiker.jpg ("Hiking in the Dolomites", Unsplash,
// CC0) painted with paintPerson; the walker's pose read from "Woman walking on a sand beach" (Unsplash, CC0).
// Render a still with --params '{"guides":true}' to see the horizon, the ground grid and each figure's eye line.
// One camera: horizon = the far shore (y 0.525), camera 1.35 m above the shore (the same relative
// height as the photos of both people were taken from, so they don't look pasted in), 40° lens. Everything is placed
// with stand()/rowToward(): the shore and the path recede to one vanishing point on the horizon, the posts shrink
// with real 4 m spacing, both people are sized by where their feet touch the ground, and the horizon crosses both of
// them at the same fraction of their height (Caillebotte). The far walker gets atmospheric haze.
import { Painting, loadReference, loadPerson, paintFrom, paintPerson, paintHills, paintGrass, paintFigure, poseJoints, setView, stand, rowToward, perspectiveGuides,
  distanceAt, hazeColor, key, ease, mix, tone } from 'painter';
export const meta = { duration: 16, fps: 30 };

export default async function ({ aspect, seed, guides = false }) {
  const p = new Painting({ aspect, seed, ground: '#b9a184' });
  p.duration = 16;
  const A = aspect;
  const [lake, hiker, walkerInfo] = await Promise.all([loadReference('refs/mountain-lake.jpg'), loadPerson('refs/hiker.jpg'),
    fetch('/scene/refs/walker.person.json').then((r) => r.json())]);
  const view = setView(p, { horizon: 0.525, eye: 1.35, fov: 40, air: '#a9b2c9', visibility: 120 });
  paintFrom(p.layer('lake', { depth: 0.35 }), lake, { focal: [A * 0.42, 0.42], chroma: 0.85, each: (s, i) => { if (i.y > 0.53) { s.shimmer = 0.08; s.sway = 0.001; } } });

  // the shore: a straight edge on flat ground → a straight line to its vanishing point on the horizon. Right of the
  // vanishing point the meadow simply continues to the horizon. Marks shrink and colours haze with distance.
  p.phase('foreground');
  const VP = [A * 0.78, view.horizon];
  const lineY = (x0, y0) => (x) => y0 + (x - x0) * (VP[1] - y0) / (VP[0] - x0);       // canvas line through (x0, y0) and VP
  const shoreL = lineY(A * 0.4, 1.06), pathL = lineY(A * 0.63, 1.06), pathR = lineY(A * 0.76, 1.06);
  const shore = (x) => (x < VP[0] ? shoreL(x) : view.horizon + 0.002);
  const grass = tone(mix({ ultramarine: 1, transYellowOxide: 3 }), 0.36), grassLit = tone(mix({ yellowOchre: 2, transYellowOxide: 1, titaniumWhite: 1 }), 0.58);
  const dirt = tone(mix({ burntSienna: 1, yellowOchre: 1, titaniumWhite: 1 }), 0.55);
  const near = (y) => Math.max(0, (y - view.horizon) / (1 - view.horizon));            // 0 at the horizon … 1 at the bottom edge
  const hz = (c, y) => hazeColor(c, 1 - Math.exp(-distanceAt(p, Math.max(y, view.horizon + 0.003)) / view.visibility), view.air);
  const land = p.layer('shore', { depth: 0.8 });
  land.scatter({ bounds: [A * 0.38, view.horizon, A + 0.08, 1.08], spacing: 0.007, order: 'down', brush: 'flat',
    mask: (x, y) => (y > shore(x) ? 1 : 0), angle: 0, jitter: 0.2, thick: 0.25, pickup: 0.1,
    color: (x, y, r) => hz(mix([[grass, 1], [grassLit, 0.4 + 0.5 * r()]]), y), width: (x, y) => 0.004 + 0.03 * near(y), length: (x, y) => 0.01 + 0.07 * near(y) });
  land.scatter({ bounds: [A * 0.5, view.horizon, A + 0.08, 1.08], spacing: 0.006, order: 'down', brush: 'flat', mask: (x, y) => (y > pathL(x) && y < pathR(x) ? 1 : 0),
    color: (x, y) => hz(dirt, y), width: (x, y) => 0.003 + 0.025 * near(y), length: (x, y) => 0.008 + 0.06 * near(y), angle: 0, jitter: 0.12, thick: 0.35 });
  paintGrass(p.layer('grass-near', { depth: 0.95 }), { bounds: [A * 0.42, 0.84, A + 0.08, 1.06], mask: (x, y) => (y > shore(x) + 0.01 && !(y > pathL(x) && y < pathR(x)) ? 1 : 0),
    dark: grass, light: grassLit, blade: 0.045, density: 0.6 });
  paintGrass(p.layer('grass-mid', { depth: 0.85 }), { bounds: [A * 0.5, 0.66, A + 0.08, 0.84], mask: (x, y) => (y > shore(x) + 0.005 && !(y > pathL(x) && y < pathR(x)) ? 1 : 0),
    dark: hz(grass, 0.7), light: hz(grassLit, 0.7), blade: 0.018, width: 0.0022, density: 0.5 });

  // fence posts along the path, 4 m apart, 1.1 m tall: foreshortening comes from the real spacing
  const posts = p.layer('posts', { depth: 0.85 });
  for (const s of rowToward(p, { from: [pathR(0.9) < 0.9 ? A * 0.8 : A * 0.8, 0.9], vp: VP, count: 10, spacing: 4, meters: 1.1 }))
    posts.stroke({ brush: 'round', p0: [s.x, s.base], p2: [s.x, s.base - s.height], width: s.height * 0.08, color: hazeColor(tone(mix({ burntUmber: 1, ultramarine: 1 }), 0.25), s.haze, view.air), thick: 0.4, taper: [1, 0.9] });

  // the far walker: mannequin with a real walking pose, ~20 m along the path, hazed
  p.phase('figures');
  const wy = view.horizon + view.f * view.eye / 22, wx = VP[0] + (A * 0.695 - VP[0]) * (wy - VP[1]) / (1.06 - VP[1]);   // on the middle of the path
  const W = stand(p, { x: wx, feet: wy, meters: 1.65, name: 'walker' });
  paintFigure(p.layer('walker', { depth: W.depth }), { joints: poseJoints(walkerInfo, { x: W.x, base: W.base, height: W.height, body: 'female', flip: true }), back: true,
    skin: '#c99272', outfit: { top: '#2b2f3a', sleeves: 0.4, bottom: '#2b2f3a', legs: 0.35, dress: true, shoes: false }, hair: { style: 'long', color: '#3a2a20', length: 0.12 },
    light: [-0.85, -0.5], ambient: '#7f95b8', lightColor: '#ffe2b8', detail: 0.4, haze: W.haze, air: W.air });

  // the hiker, ~6 m away on the grass by the water, painted from his photo
  const hy = 0.78, H = stand(p, { x: A * 0.665, feet: hy, meters: 1.78, name: 'hiker' });
  paintPerson(p.layer('hiker', { depth: H.depth }), hiker, { ...H, detail: 1, harmonize: { light: '#ffd9a8', shadow: '#5f6f94', amount: 0.3 } });

  if (guides) perspectiveGuides(p);
  p.timelapse({ start: 0.3, end: 10, weights: { foreground: 1.2 } });
  p.camera = (t) => ({ zoom: key(t, [[p.livingStart, 1], [p.endTime, 1.04]], ease.inOut) });
  p.wind = (t) => ({ strength: key(t, [[0, 0], [p.livingStart, 0.2], [p.livingStart + 2, 1]]) });
  return p;
}
