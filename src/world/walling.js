// The houses raise walls by your rules (Orchestrator, 2026-11-22: places had only the walls
// they were seeded with, and no house ever raised one). A palisade where a place is threatened
// or on its border, once it has the wood to spare; stone at its seat or a rich place, once it
// has the stone and its lord the gold. They cost what yours cost (walls.js WALL_COSTS, for
// every stretch, gate and tower its layout gives it), paid from the place's own stores and,
// for stone's masons, the lord's purse; and its people build them over time, as your masons
// do. Turtlers and builders wall sooner, raiders rarely. Your governor never builds walls:
// that stays your choice.
import { FACTIONS, dist } from './world.js';
import { wallsFor, wallsUp } from './places.js';

// The chance, each time the house thinks (rivals.js THINK, 8 s), that it starts on a wall it
// can pay for.
export const KEEN = { turtler: 0.3, builder: 0.25, schemer: 0.12, merchant: 0.12, hothead: 0.05, raider: 0.03 };
// What a place keeps back for its own building (holdings.js wants 40 wood about), and its lord.
export const SPARE = { wood: 40, stone: 30, gold: 150 };
const BORDER = 400;        // another house's place this near: its border
const CREW = 25;           // a crew for every 25 people, as many as four (walls.js build)

const name = m => (m === 'stone' ? 'stone walls' : 'a palisade');

// Each time a house thinks: maybe start one wall, at most one building at a time.
export function thinkWalls(w, h, mine) {
  if (mine.some(p => p.eco?.walling) || w.rand() >= (KEEN[h.trait] ?? 0.1)) return null;
  const real = mine.filter(p => p.eco?.buildings && !p.town);
  const others = w.pois.filter(q => q.owner !== null && q.owner !== h.index && !FACTIONS[q.owner]?.bandit);
  const threatened = p => h.ai?.pressed?.includes(p.id) || others.some(q => dist(p, q) < BORDER);
  const rich = p => p === h.seat || p.eco.level >= 3 || p.eco.focus === 'trade';
  const has = (p, g, n) => (p.eco.stock[g] || 0) >= n + SPARE[g];
  // (a rough look at its stores first, so a place far short isn't laid out for nothing)
  const tries = [
    ...real.filter(p => p.eco.walls !== 'stone' && rich(p) && has(p, 'stone', 150) && h.gold >= 150 + SPARE.gold).map(p => [p, 'stone']),
    ...real.filter(p => (p.eco.walls || 'none') === 'none' && threatened(p) && has(p, 'wood', 120)).map(p => [p, 'wood']),
  ];
  // the first it can pay for in full (a seat short of stone may still raise a palisade)
  for (const [p, m] of tries) {
    const W = wallsFor(p, m), goods = Object.entries(W.cost).filter(([g]) => g !== 'gold');
    if (!W.plan.pieces.length || goods.some(([g, n]) => !has(p, g, n)) || (W.cost.gold && h.gold < W.cost.gold + SPARE.gold)) continue;
    return begin(w, h, p, m, W, goods);
  }
  return null;
}

function begin(w, h, p, m, W, goods) {
  const e = p.eco;
  for (const [g, n] of goods) e.stock[g] -= n;
  h.gold -= W.cost.gold || 0;
  e.walling = { material: m, work: W.work, done: 0, cost: W.cost };
  if (p.visible) w.log(`${h.name} is raising ${name(m)} round ${p.name}.`, 2);
  return p;
}

// Every few seconds: its people work on it while no enemy is at the gate.
export function tickWalls(w, p, dt) {
  const e = p.eco, job = e.walling;
  if (w.armies.some(a => a.at === p && !a.gone && a.side !== p.owner && w.canAttack(a.side, p))) return;
  job.done += dt * Math.max(1, Math.min(4, Math.floor(e.pop / CREW)));
  if (job.done < job.work) return;
  e.walling = null;
  wallsUp(p, job.material, wallsFor(p, job.material).plan);
  if (p.visible) w.log(`${p.name} now stands behind ${name(job.material)}.`, 2);
}

// How many of a house's places stand behind walls (the sims and checks()).
export const walledCount = (w, side) => w.pois.filter(p => p.owner === side && p.eco?.walls && p.eco.walls !== 'none').length;
