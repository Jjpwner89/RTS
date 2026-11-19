// What a battlefield holds besides its hills: copses of trees in the open ground between
// the armies, where regiments can hide and horse can't charge. The trees are the same
// plain spots terrain.js plants, so drawTrees() shows them and battle.setWoods() reads them.
import { rng } from './noise.js';

// Adds 3–6 copses to `trees` in the middle of the field, clear of where the armies form up
// (|z| beyond about 70). avoid(x, z): true where no tree may stand (a keep, a road).
export function addCopses(trees, seed, { avoid = () => false, count = null } = {}) {
  const rand = rng(seed + 313);
  const n = count ?? 3 + Math.floor(rand() * 4);
  const spots = trees.spots;
  for (let c = 0; c < n; c++) {
    // Most copses stand in no-man's land; some on a flank.
    const flank = rand() < 0.4;
    const cx = flank ? (rand() < 0.5 ? -1 : 1) * (70 + rand() * 45) : (rand() * 2 - 1) * 90;
    const cz = (rand() * 2 - 1) * (flank ? 45 : 35);
    const R = 11 + rand() * 9;
    const want = Math.round(R * R / 4.5);
    for (let i = 0, tries = 0; i < want && tries < want * 6; tries++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * R;
      // Ragged edges: the outer ring is thinner.
      if (d > R * 0.7 && rand() < 0.5) continue;
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (avoid(x, z)) continue;
      const k = 0.7 + rand() * 0.6;
      spots.push({ x, z, i: spots.length, standing: true, k, tall: k * (0.9 + rand() * 0.3), hue: 0.25 + rand() * 0.07, light: 0.2 + rand() * 0.08 });
      i++;
    }
  }
  return trees;
}
