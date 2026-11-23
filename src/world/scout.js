// What you can tell about a place you have seen but do not hold, in words: how strongly it is held, how
// long ago you saw it, and what lies within reach of it (creator, 2026-11-23: thirty raiders sent at an empty
// market town with two garrisons of a hundred next door, which they could not have known).
//
// Fog stays honest. A place in sight is read live; one out of sight is read from `p.known`, the tally taken
// the last time it was in sight (`at` is the game time of that sight), and it goes stale as the minutes pass.
// A place never seen has no report, and the neighbours named are only places you have seen yourself. Nothing
// here is read by a house's mind: houses reason from their own sight.
import { headcount } from './world.js';
import { STRENGTH_BANDS } from './diplomacy.js';

export const REACH = 400;       // world units: about a minute's march for an army (the map is ~1400 across)
export const STALE = 180;       // seconds after which what you saw "may have changed"
export const STRONG = 60;       // men at which a garrison counts as strong

export const heldWords = n => n <= 0 ? 'unguarded' : n < 10 ? 'barely held' : n < 30 ? 'lightly held' : n < STRONG ? 'held' : n < 100 ? 'strongly held' : 'very strongly held';

export function ageText(age) {
  if (age === 0) return 'in sight now';
  if (age === null) return 'seen some time ago';
  if (age < 45) return 'seen a moment ago';
  const m = Math.round(age / 60);
  return `seen ${m} min ago`;
}

// How a garrison of `men` compares with one of your armies, in the strength words.
export function against(men, army) {
  const force = headcount(army.units);
  const r = men / Math.max(1, force);
  const band = STRENGTH_BANDS.find(([top]) => r <= top)?.[1] || 'far stronger than you';
  return `${band.replace(/: you are badly outmatched$/, '').replace('than you', `than ${army.name}`)}`;
}

const seenAt = (w, p) => (p.visible ? 0 : p.known?.at === undefined ? null : Math.max(0, w.time - p.known.at));
const menOf = p => (p.visible ? headcount(p.garrison) : p.known?.men);
const ownerOf = p => (p.visible ? p.owner : p.known?.owner);

// The places the report lists beside `p`: seen, the same lord's, within REACH, holding STRONG or more
// (and visible armies of his that are near it, big enough to count). Returns { names, age } or null.
function neighbours(w, p) {
  const owner = ownerOf(p);
  const list = [];
  for (const q of w.pois) {
    if (q === p || !q.seen || q.kind === 'camp') continue;
    if (ownerOf(q) !== owner || Math.hypot(q.x - p.x, q.z - p.z) > REACH) continue;
    const men = menOf(q);
    if (men >= STRONG) list.push({ name: q.name, men, age: seenAt(w, q) });
  }
  for (const a of w.armies) {
    if (a.gone || a.wagon || a.side !== owner || !a.visible || a.know < 2 || Math.hypot(a.x - p.x, a.z - p.z) > REACH) continue;
    const men = headcount(a.units);
    if (men >= STRONG) list.push({ name: `an army of about ${men}`, men, age: 0, army: true });
  }
  if (!list.length) return null;
  const ages = list.map(o => o.age);
  return { list, age: ages.includes(null) ? null : Math.max(...ages) };
}

// null for a place you hold or have not seen. { held, near, text, stale, men, age }.
export function scoutReport(w, p, army = null) {
  if (!p || !p.seen || p.owner === 0 || p.town) return null;
  const men = menOf(p);
  if (men === undefined || men === null) return null;
  const age = seenAt(w, p), stale = age === null || age > STALE;
  const words = heldWords(men);
  const rel = army && army.units && !army.gone ? ` — ${against(men, army)}` : '';
  const held = stale ? `Was ${words} (about ${men} men), ${ageText(age)}${rel}: it may have changed` : `${words[0].toUpperCase()}${words.slice(1)} · about ${men} men · ${ageText(age)}${rel}`;
  const n = neighbours(w, p);
  let near = '';
  if (n) {
    const places = n.list.filter(o => !o.army), armies = n.list.filter(o => o.army);
    const bits = [];
    if (places.length) bits.push(`${places.length === 1 ? 'one strong garrison' : `${places.length === 2 ? 'two' : places.length} strong garrisons`}: ${places.slice(0, 3).map(o => o.name).join(', ')}${places.length > 3 ? ' and more' : ''}`);
    if (armies.length) bits.push(armies.map(o => o.name).join(' and '));
    near = `Within reach of it: ${bits.join('; ')}${n.age !== 0 ? ` (${ageText(n.age)})` : ''}`;
  } else near = 'No strong garrison within reach of it that you have seen';
  return { held, near, stale, men, age, text: `${held}. ${near}.`, short: `${words}, ${ageText(age)}${n ? `; ${n.list.length === 1 ? 'a strong force' : `${n.list.length} strong forces`} within reach` : ''}` };
}
