// The steps of a campaign, one at a time: from a reeve with one village to the crown.
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
import { BUILDINGS, listCost, makerText } from '../economy.js';
const bands = w => w.options?.aggression !== 'gentle' && (w.outlaws?.wave ?? 0) < OUTLAWS.length
  ? ' Outlaw bands will come for your stores, though: keep your retinue at home, and when a band reaches the village, select the retinue and right-click the outlaws.' : '';
const calm = w => (FACTIONS.filter(h => h.index && h.alive && !h.bandit && !h.invader).every(h => stageOf(h) === 0)
  ? ' The great houses are all still settling their own lands: none will march on you yet.' : ' Some great house is reaching beyond its own lands now: keep men at home.') + bands(w);

// The next concrete step of a goal, for the line on the village screen (the scout, 2026-11-28:
// the Goals panel is on the world map only, and almost all of the early play is in the village).
// Read from the village as it stands; `t` is your home village.
const built = (t, kind) => t?.buildings.find(b => b.kind === kind && b.state !== 'ruined');
const toBuild = (t, kind) => {
  const B = BUILDINGS[kind], b = built(t, kind), name = B.name.toLowerCase();
  if (b) return b.state === 'site' ? `The ${name} is going up` : null;
  return `Build a ${name} (${B.group} tab, ${listCost(B.cost)})`;
};
const held = (w, n) => `${mine(w).length} of ${n} places: march on the next from the World map (M)`;
const arm = (w, t) => {
  if (!t) return 'Build a barracks in one of your villages';
  const rack = t.buildings.find(b => b.kind === 'barracks' && b.state === 'active');
  if (!rack) {
    if (built(t, 'barracks')) return 'The barracks is going up';
    // what its cost still lacks, and the building that makes it
    for (const [g, n] of Object.entries(BUILDINGS.barracks.cost)) {
      if (t.free(g) >= n) continue;
      const kind = g === 'planks' ? 'carpenter' : g === 'stone' ? 'quarry' : null;
      return (kind && toBuild(t, kind)) || `Saving ${g} for a barracks: ${Math.max(0, Math.floor(t.free(g)))} of ${n}`;
    }
    return toBuild(t, 'barracks');
  }
  const check = t.levyCheck('spear', rack);
  return check.ok ? 'Select the barracks and call up spearmen' : `Arms for the barracks (${makerText('spears')})`;
};

export const GOALS = [
  { text: 'Go to Ashford: double-click it on the map.', short: 'Go to Ashford', next: () => 'Double-click it on the World map (M)', tip: 'M brings you back here.', done: (w, s) => s.visited },
  { text: 'Feed your people: build a woodcutter and a farm.', short: 'Feed your people', next: (w, t) => toBuild(t, 'woodcutter') || toBuild(t, 'farm') || 'Both are up', tip: w => `Food comes first: the larder lasts a few minutes, game near the village runs out, and a farm's first crop takes time to come in. A hunter's lodge feeds them meanwhile. Wood is short: choose between woodcutters, houses and farms.${calm(w)}`, done: w => has(w, 'woodcutter') && has(w, 'farm') },
  { text: 'Grow Ashford to 30 people.', short: 'Grow to 30 people', next: (w, t) => {
    if (!t) return null;
    const n = `${t.population} of 30`, d = t.settlers();
    if (t.housing < 30 && t.population >= t.housing - 1) return `${n}: ${t.buildings.some(b => b.kind === 'house' && b.state === 'site') ? 'a house is going up' : `build a house (Village tab, ${listCost(BUILDINGS.house.cost)})`}`;
    return `${n}: ${d.limit ? d.limit.why[0].toLowerCase() + d.limit.why.slice(1) : 'newcomers are on their way'}`;
  }, tip: w => `Newcomers come for spare food, a good mood and the village's name (a well, a market, a chapel, safe roads); houses only make room, and their hearths burn wood.${calm(w)}`, done: w => towns(w).some(t => t.population >= 30) },
  { text: 'Arm them: build a barracks and raise men.', short: 'Arm your people', next: arm, tip: w => `Weapons must be hauled to the barracks first.${w.rank === 'Reeve' ? '' : ' Gold hires sellswords at the keep.'} A palisade from the Walls tab (build bar, in a village) slows raiders until your men are ready.`, done: w => has(w, 'barracks') && (w.armies.some(a => a.side === 0 && !a.wagon) || towns(w).some(t => t.battle.regs.some(r => r.side === 0 && r.levy && !r.gone))) },
  { text: 'March out and take a free village.', short: 'Take a free village', next: w => w.armies.some(a => a.side === 0 && !a.gone && !a.wagon) ? 'On the World map (M), click a free village and press March' : 'Select your men here and press March out', tip: 'Muster from the map, then click a village and press March on its card (or right-click it).', done: w => mine(w).length >= 2 },
  { text: 'Become a count: hold five places.', short: 'Hold five places', next: w => held(w, 5), tip: 'Rival houses will notice you now. Keep men at home, make friends, or build walls (the Walls tab in a village: palisades, towers and gates).', done: w => mine(w).length >= 5 },
  // Count and Duke (Duke batch, 2026-11-21): the climb's last steps name the rank's tools.
  { text: 'Become a duke: hold eleven places.', short: 'Hold eleven places', next: w => held(w, 11), tip: "Gold wins free places now: march an army up to one and choose Treat with them. Call your banners to gather your vassals' men, and bring rams and ladders to walled places.", done: w => mine(w).length >= 11 || !!w.crowned },
  { text: 'Take Kingsbridge, the old royal city.', short: 'Take Kingsbridge', next: () => 'March on it from the World map (M), with rams or ladders', tip: 'Hold this much and the great houses league against you and raise one host between them: break it and the league is broken. Kingsbridge has the strongest walls in the realm.', done: w => w.crown?.owner === 0 || !!w.crowned },
  { text: 'Take the crown: hold Kingsbridge and half the realm, or win every house to your claim.', short: 'Take the crown', next: () => 'Hold Kingsbridge and half the realm, or win every house', tip: '', done: w => !!w.crowned },
];

// Ticks off what is done; returns the goal to announce, if any (at most one).
// The goal shown is always the first one not passed: past the furthest one done, so a
// lord who took a village before raising a levy skips "Arm them" (Manager, 2026-11-21:
// the Count test save toasted "Feed your people" twice, with two different next goals).
// Only the furthest goal finished is told; the ones it passes are ticked quietly. A world
// with no goals counted yet (a new or test campaign, an old save) is set quietly, without
// a toast for everything it already holds.
export function goalNow(w) {
  const g = GOALS[w.goals ?? 0];
  if (!g || w.part === 2) return null;
  return { title: g.short, next: g.next(w, w.home?.town) || '' };
}

export function updateGoals(w, seen) {
  const quiet = w.goals === undefined, from = w.goals ?? 0;
  let last = -1;
  for (let i = from; i < GOALS.length; i++) if (GOALS[i].done(w, seen)) last = i;
  w.goals = Math.max(from, last + 1);
  return last >= from && !quiet ? [GOALS[last]] : [];
}
