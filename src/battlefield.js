// What a battlefield holds besides its hills: copses of trees in the open ground between
// the armies, where regiments can hide and horse can't charge. The trees are the same
// plain spots terrain.js plants, so drawTrees() shows them and battle.setWoods() reads them.
import { rng } from './noise.js';

// rng()'s first draws barely differ for nearby seeds (fields are seeded from the clock),
// so the seed is scrambled first.
const seeded = (seed, salt) => {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return rng((h ^ (h >>> 16)) >>> 0);
};

// Adds 3–6 copses to `trees` in the middle of the field, clear of where the armies form up
// (|z| beyond about 70). avoid(x, z): true where no tree may stand (a keep, a road).
export function addCopses(trees, seed, { avoid = () => false, count = null } = {}) {
  const rand = seeded(seed, 313);
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

// ---- rivers ----

const smooth = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);

// A river across the field between the armies, from flank to flank, or null (no river).
// It runs along x, wandering a little in z. Fords are shallow stretches men can wade in
// line; elsewhere the water is deep and slow going. A wooden bridge crosses it, which
// either side can burn. chance: how often a field has a river at all.
export function makeRiver(seed, { chance = 0.5, force = false } = {}) {
  const rand = seeded(seed, 977);
  if (!force && rand() >= chance) return null;
  const z0 = (rand() * 2 - 1) * 20, A = 10 + rand() * 14, k = 0.008 + rand() * 0.008, ph = rand() * 6.3;
  const A2 = 3 + rand() * 5, k2 = 0.03 + rand() * 0.02, ph2 = rand() * 6.3;
  const zAt = x => z0 + A * Math.sin(x * k + ph) + A2 * Math.sin(x * k2 + ph2);
  const slope = x => A * k * Math.cos(x * k + ph) + A2 * k2 * Math.cos(x * k2 + ph2);
  const half = 6 + rand() * 2;
  // One or two fords, and a bridge well apart from them, all within the field.
  const spots = [];
  const pick = () => {
    for (let t = 0; t < 40; t++) {
      const x = (rand() * 2 - 1) * 110;
      if (spots.every(s => Math.abs(s - x) > 45)) { spots.push(x); return x; }
    }
    return null;
  };
  const fords = [];
  for (let i = 0, n = 1 + (rand() < 0.5 ? 1 : 0); i < n; i++) { const x = pick(); if (x !== null) fords.push({ x, z: zAt(x), half: 8 + rand() * 4 }); }
  const bridges = [];
  const bx = pick();
  if (bx !== null) bridges.push({ x: bx, z: zAt(bx), half: 4, angle: Math.atan(slope(bx)), hp: 100, maxHp: 100, state: 'up', burning: 0 });
  const river = {
    zAt, slope, half, fords, bridges, raw: null,
    // Signed distance across the river: negative on the -z bank, positive on the +z bank.
    across(x, z) { return (z - zAt(x)) / Math.sqrt(1 + slope(x) ** 2); },
    bank(x, z) { return this.across(x, z) < 0 ? -1 : 1; },
    // 0 dry (or on a standing bridge), 1 shallow (a ford, or the river's edge), 2 deep.
    depthAt(x, z) {
      const d = Math.abs(this.across(x, z));
      if (d > half) return 0;
      for (const b of bridges) if (b.state === 'up' && Math.abs(x - b.x) < b.half) return 0;
      if (fords.some(f => Math.abs(x - f.x) < f.half) || d > half - 1.2) return 1;
      return 2;
    },
    onBridge(x, z) {
      if (Math.abs(this.across(x, z)) > half + 2) return null;
      return bridges.find(b => b.state === 'up' && Math.abs(x - b.x) < b.half) || null;
    },
    // The deck's height where a man walks on a bridge (spanning bank to bank).
    deckY(b) { return Math.max(this.raw(b.x, zAt(b.x) - half - 2), this.raw(b.x, zAt(b.x) + half + 2)) + 0.25; },
    // The crossings, as points on each bank: [{ x, z: {-1: near z, 1: far z}, kind, ref }].
    crossings() {
      const out = [];
      for (const f of fords) out.push({ x: f.x, kind: 'ford', ref: f });
      for (const b of bridges) if (b.state === 'up') out.push({ x: b.x, kind: 'bridge', ref: b });
      return out.map(c => ({ ...c, end: side => ({ x: c.x, z: zAt(c.x) + side * (half + 4) }) }));
    },
  };
  return river;
}

// The ground with the river's channel cut into it: deep in the middle, a shelf at the fords.
export function carveRiver(heightAt, river) {
  if (!river) return heightAt;
  river.raw = heightAt;
  const { half, fords } = river;
  return (x, z) => {
    const h = heightAt(x, z);
    const d = Math.abs(river.across(x, z));
    if (d > half + 4) return h;
    // The banks drop to the water; the bed follows the river's centre line.
    const level = heightAt(x, river.zAt(x)) - 0.6;
    const ford = fords.some(f => Math.abs(x - f.x) < f.half + 3);
    const bed = level - (ford ? 0.5 : 1.6) * smooth(1 - d / half);
    const k = smooth((half + 4 - d) / 5);
    return h + (Math.min(h, bed) - h) * k;
  };
}
