// The first steps of a campaign, one at a time: from a reeve with one village to a count.
// Each goal is ticked when the realm shows it done, and stays ticked. `w.goals` counts how
// many are done, and is saved with the campaign.

const mine = w => w.pois.filter(p => p.owner === 0);
const towns = w => mine(w).filter(p => p.town).map(p => p.town);
const has = (w, kind) => towns(w).some(t => t.buildings.some(b => b.kind === kind && b.state === 'active'));
// The opening tells you when you are safe (creator, 2026-11-20): while every great house is
// still settling its own lands, nobody will march on you.
import { FACTIONS } from './world.js';
import { stageOf } from './rivals.js';
const calm = w => FACTIONS.filter(h => h.index && h.alive && !h.bandit && !h.invader).every(h => stageOf(h) === 0)
  ? ' The great houses are all still settling their own lands: nobody will march on you yet.' : ' Some great house is reaching beyond its own lands now: keep men at home.';

export const GOALS = [
  { text: 'Go to Ashford: double-click it on the map.', tip: 'M brings you back here.', done: (w, s) => s.visited },
  { text: 'Feed your people: build a woodcutter and a farm.', tip: w => `Food comes first: the larder lasts a few minutes, game near the village runs out, and a farm's first crop takes time to come in. A hunter's lodge feeds them meanwhile. Wood is short: choose between woodcutters, houses and farms.${calm(w)}`, done: w => has(w, 'woodcutter') && has(w, 'farm') },
  { text: 'Grow Ashford to 30 people.', tip: w => `Newcomers come for spare food, a good mood and the village's name (a well, a market, a chapel, safe roads); houses only make room, and their hearths burn wood.${calm(w)}`, done: w => towns(w).some(t => t.population >= 30) },
  { text: 'Arm them: build a barracks and raise men.', tip: 'Weapons must be hauled to the barracks first. Gold hires sellswords at the keep.', done: w => has(w, 'barracks') && (w.armies.some(a => a.side === 0 && !a.wagon) || towns(w).some(t => t.battle.regs.some(r => r.side === 0 && r.levy && !r.gone))) },
  { text: 'March out and take a free village.', tip: 'Muster from the map, then right-click a village to march there.', done: w => mine(w).length >= 2 },
  { text: 'Become a count: hold five places.', tip: 'Rival houses will notice you now. Keep men at home, make friends, or build walls.', done: w => mine(w).length >= 5 },
  { text: 'Take the crown: hold Kingsbridge and half the realm, or win every house to your claim.', tip: '', done: w => !!w.crowned },
];

// Ticks off what is done; returns the goals finished just now.
export function updateGoals(w, seen) {
  w.goals = w.goals ?? 0;
  const now = [];
  while (w.goals < GOALS.length) {
    if (GOALS[w.goals].done(w, seen)) { now.push(GOALS[w.goals++]); continue; }
    // Already past it: a later goal is done (a test campaign, or a lord who took a village
    // before raising a levy). The ones skipped are ticked quietly; the later one is told.
    const later = GOALS.findIndex((g, i) => i > w.goals && g.done(w, seen));
    if (later < 0) break;
    w.goals = later;
  }
  return now;
}
