// The first steps of a campaign, one at a time: from a reeve with one village to a count.
// Each goal is ticked when the realm shows it done, and stays ticked. `w.goals` counts how
// many are done, and is saved with the campaign.

const mine = w => w.pois.filter(p => p.owner === 0);
const towns = w => mine(w).filter(p => p.town).map(p => p.town);
const has = (w, kind) => towns(w).some(t => t.buildings.some(b => b.kind === kind && b.state === 'active'));

export const GOALS = [
  { text: 'Go to Ashford: double-click it on the map.', tip: 'M brings you back here.', done: (w, s) => s.visited },
  { text: 'Put the people to work: build a woodcutter and a farm.', tip: 'Build menu, bottom left of the village.', done: w => has(w, 'woodcutter') && has(w, 'farm') },
  { text: 'Grow Ashford to 30 people.', tip: 'Houses make room; full larders and low taxes draw families.', done: w => towns(w).some(t => t.population >= 30) },
  { text: 'Arm them: build a barracks and raise men.', tip: 'Weapons must be hauled to the barracks first.', done: w => has(w, 'barracks') && (w.armies.some(a => a.side === 0 && !a.wagon) || towns(w).some(t => t.battle.regs.some(r => r.side === 0 && r.levy && !r.gone))) },
  { text: 'March out and take a free village.', tip: 'Muster from the map, then right-click a village to march there.', done: w => mine(w).length >= 2 },
  { text: 'Become a count: hold five places.', tip: 'Rival houses will notice you now. Make friends, or walls.', done: w => mine(w).length >= 5 },
  { text: 'Take the crown: hold Kingsbridge and half the realm, or win every house to your claim.', tip: '', done: w => !!w.crowned },
];

// Ticks off what is done; returns the goals finished just now.
export function updateGoals(w, seen) {
  w.goals = w.goals ?? 0;
  const now = [];
  while (w.goals < GOALS.length && GOALS[w.goals].done(w, seen)) now.push(GOALS[w.goals++]);
  return now;
}
