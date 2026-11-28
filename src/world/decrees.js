// Royal decrees: laws a king lays on the whole realm, each with a price. From the crowning.
// Any of them can be in force at once; a decree once changed stands five minutes before it
// can be changed again. State: w.decrees = { on: { key: true }, at: { key: time } }.
import { FACTIONS } from './world.js';

export const DECREES = {
  peace: { name: "The king's peace", icon: 'crown',
    good: 'Your vassals may not feud, and outlaws keep away from your places.',
    bad: 'Vassals resent having their swords bound (−5 opinion).' },
  levy: { name: 'The great levy', icon: 'spears',
    good: 'A muster raises men down to a third of each village, not half, and vassals send half again as many.',
    bad: 'Every village of yours grumbles (−8 mood), and vassals like it no better (−5 opinion).' },
  tithe: { name: 'The royal tithe', icon: 'gold',
    good: 'A quarter more gold from the taxes of every village you run.',
    bad: 'Every village of yours grumbles (−6 mood).' },
  roads: { name: "The king's roads", icon: 'map',
    good: 'Your armies and carts march a fifth faster.',
    bad: 'Road wardens cost 18 gold a minute.' },
};
const STAND = 300;
export const ROAD_UPKEEP = 0.3;    // gold a second

const state = w => (w.decrees ??= { on: {}, at: {} });
export const decreed = (w, k) => !!w.decrees?.on?.[k];
export const canDecree = w => w.rank === 'King';

export function decreeCheck(w, k) {
  if (!canDecree(w)) return { ok: false, why: 'Only a king can lay down the law for the realm' };
  const s = state(w), left = (s.at[k] ?? -Infinity) + STAND - w.time;
  if (left > 0) return { ok: false, why: `The law has stood only a little while (${Math.ceil(left / 60)} min)` };
  return { ok: true };
}
export function toggleDecree(w, k) {
  const c = decreeCheck(w, k);
  if (!c.ok) return c;
  const s = state(w), D = DECREES[k], on = !s.on[k];
  s.on[k] = on;
  s.at[k] = w.time;
  w.hooks.sound?.('seal'); // audio
  w.log(on ? `By your decree: ${D.name.toLowerCase()}.` : `You lift ${D.name.toLowerCase()}.`);
  w.chron(on ? `The king decreed ${D.name.toLowerCase()}.` : `The king lifted ${D.name.toLowerCase()}.`);
  if (on && k === 'peace') for (const v of w.vassals || []) if (v.feud) v.feud = null;
  return { ok: true, on };
}

export function tickDecrees(w, dt) {
  if (decreed(w, 'roads')) FACTIONS[0].gold = Math.max(0, FACTIONS[0].gold - ROAD_UPKEEP * dt);
}

// A village's grumbling at the realm's laws (a town mood hook).
export function decreeMood(w) {
  const n = (decreed(w, 'levy') ? -8 : 0) + (decreed(w, 'tithe') ? -6 : 0);
  return [n, decreed(w, 'levy') && decreed(w, 'tithe') ? 'the great levy and the royal tithe' : decreed(w, 'levy') ? 'the great levy' : 'the royal tithe'];
}
// Lines for a vassal's opinion of you.
export function decreeOpinion(w) {
  const out = [];
  if (decreed(w, 'peace')) out.push(["The king's peace binds their swords", -5]);
  if (decreed(w, 'levy')) out.push(['The great levy', -5]);
  return out;
}
