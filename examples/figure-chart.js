// Figure chart: the construction stages of one pose (top row) and finished poses (bottom row).
// Top: 1 gesture · 2 blobs (head small, ribcage medium, pelvis large, limbs in two sections) · 3 form (one light) ·
//      4 skin (colour zones, warm knees/hands, occlusion) · 5 accents (face planes, hair, highlights).
// Bottom: stand · hand on hip · arms up · reach · walk (profile) · sit (profile) · from behind.
import { Painting, paintFigure, POSES } from 'painter';
export const meta = { duration: 4 };

export default function ({ aspect, seed }) {
  const p = new Painting({ aspect, seed, ground: '#a99c88', look: { vignette: 0.1 } });
  p.duration = 4;
  const A = aspect, H = 0.4;
  const hiker = { skin: '#c48f6c', outfit: { top: '#5d7186', sleeves: 0.35, bottom: '#6b5a44', legs: 0.32, shoes: '#3a2f2a' }, hair: { style: 'long', color: '#4a3324', length: 0.16 }, body: 'female' };
  const L1 = p.layer('stages', { depth: 0.5 });
  for (let s = 1; s <= 5; s++) paintFigure(L1, { ...hiker, x: A * (s - 0.5) / 5.4 + 0.05, base: 0.47, height: H, pose: POSES.contrapposto('r'), turn: 0.15, stages: s, detail: 0.9 });
  const L2 = p.layer('poses', { depth: 0.5 });
  const man = { skin: '#9a6a4f', outfit: { top: '#8a3b2e', sleeves: 0.3, bottom: '#2f3b4f', legs: 1 }, hair: { style: 'short', color: '#1d1714' }, body: 'male' };
  const row = [
    { ...man, pose: POSES.stand() },
    { ...hiker, pose: POSES.handOnHip('l'), turn: -0.2 },
    { ...man, pose: POSES.armsUp(), outfit: { bottom: '#2f3b4f', legs: 1 } },
    { ...hiker, pose: POSES.reach('r'), turn: 0.1 },
    { ...man, pose: POSES.walk(0.9), turn: 1 },
    { ...hiker, pose: POSES.sit(), turn: 1 },
    { ...hiker, pose: POSES.contrapposto('l'), back: true, outfit: { top: '#e8e2d4', sleeves: 0.15, bottom: '#6b5a44', legs: 0.55, dress: true } },
  ];
  row.forEach((f, i) => paintFigure(L2, { ...f, x: A * (i + 0.5) / 7, base: 0.97, height: H, detail: 0.9 }));
  p.timelapse({ start: 0, end: 3 });
  return p;
}
