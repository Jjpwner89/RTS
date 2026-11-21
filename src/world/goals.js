// The first steps of a campaign, one at a time: from a reeve with one village to a count.
// Each goal is ticked when the realm shows it done, and stays ticked. `w.goals` counts how
// many are done, and is saved with the campaign.

const mine = w => w.pois.filter(p => p.owner === 0);
const towns = w => mine(w).filter(p => p.town).map(p => p.town);
const has = (w, kind) => towns(w).some(t => t.buildings.some(b => b.kind === kind && b.state === 'active'));
// The opening tells you when you are safe (creator, 2026-11-20): while every great house is
// still settling its own lands, none of them will march on you. The outlaw bands will
// (QC, 2026-11-21: the tips said nobody would), so while one is still to come, say so and
// say what to do.
import { FACTIONS } from './world.js';
import { stageOf, OUTLAWS } from './rivals.js';
const bands = w => w.options?.aggression !== 'gentle' && (w.outlaws?.wave ?? 0) < OUTLAWS.length
  ? ' Outlaw bands will come for your stores, though: keep your retinue at home, and when a band reaches the village, select the retinue and right-click the outlaws.' : '';
const calm = w => (FACTIONS.filter(h => h.index && h.alive && !h.bandit && !h.invader).every(h => stageOf(h) === 0)
  ? ' The great houses are all still settling their own lands: none will march on you yet.' : ' Some great house is reaching beyond its own lands now: keep men at home.') + bands(w);

export const GOALS = [
  { text: 'Go to Ashford: double-click it on the map.', tip: 'M brings you back here.', done: (w, s) => s.visited },
  { text: 'Feed your people: build a woodcutter and a farm.', tip: w => `Food comes first: the larder lasts a few minutes, game near the village runs out, and a farm's first crop takes time to come in. A hunter's lodge feeds them meanwhile. Wood is short: choose between woodcutters, houses and farms.${calm(w)}`, done: w => has(w, 'woodcutter') && has(w, 'farm') },
  { text: 'Grow Ashford to 30 people.', tip: w => `Newcomers come for spare food, a good mood and the village's name (a well, a market, a chapel, safe roads); houses only make room, and their hearths burn wood.${calm(w)}`, done: w => towns(w).some(t => t.population >= 30) },
  { text: 'Arm them: build a barracks and raise men.', tip: 'Weapons must be hauled to the barracks first. Gold hires sellswords at the keep.', done: w => has(w, 'barracks') && (w.armies.some(a => a.side === 0 && !a.wagon) || towns(w).some(t => t.battle.regs.some(r => r.side === 0 && r.levy && !r.gone))) },
  { text: 'March out and take a free village.', tip: 'Muster from the map, then right-click a village to march there.', done: w => mine(w).length >= 2 },
  { text: 'Become a count: hold five places.', tip: 'Rival houses will notice you now. Keep men at home, make friends, or build walls.', done: w => mine(w).length >= 5 },
  { text: 'Take the crown: hold Kingsbridge and half the realm, or win every house to your claim.', tip: '', done: w => !!w.crowned },
];

// Ticks off what is done; returns the goal to announce, if any (at most one).
// The goal shown is always the first one not passed: past the furthest one done, so a
// lord who took a village before raising a levy skips "Arm them" (Manager, 2026-11-21:
// the Count test save toasted "Feed your people" twice, with two different next goals).
// Only the furthest goal finished is told; the ones it passes are ticked quietly. A world
// with no goals counted yet (a new or test campaign, an old save) is set quietly, without
// a toast for everything it already holds.
export function updateGoals(w, seen) {
  const quiet = w.goals === undefined, from = w.goals ?? 0;
  let last = -1;
  for (let i = from; i < GOALS.length; i++) if (GOALS[i].done(w, seen)) last = i;
  w.goals = Math.max(from, last + 1);
  return last >= from && !quiet ? [GOALS[last]] : [];
}
