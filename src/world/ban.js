// The armed arrière-ban (creator, 2026-11-22: "the arrière-ban is tied to the land, so if the enemy takes
// that village the arrière-ban keeps that equipment and experience"). A place keeps a roster of armed men,
// p.ban = { units: [{ key, count, name, armour, shield, xp, battles }] }: the ban's core, given kit out of the
// village's own barracks (arm) or, for a house's or a vassal's place, out of its own stock (aiArm). A call
// (arriere.js) takes the roster first, best kit first, then fills with plain militia up to the rank's number;
// the armed men carry `home` (the place's id) and `until`, and when their time is up, or they are sent home
// hungry, they go back into the roster with what they have learned (returnToRoster). The dead are gone, kit and
// all; the kit never goes back to the racks. The roster belongs to the place, not its lord: whoever takes the
// place gets it (takePlace says so in the chronicle), and men still out serving when it falls serve out their
// time with you and then go home to it under its new lord.
import { TYPES } from '../battle.js';
import { ARRIERE } from './arriere.js';
import { canShield, outfitKit, armourWeight, GOODS, ARMOUR_NAME } from '../economy.js';

export const BATCH = 10;                                           // men armed at a time
export const KINDS = ['militia', 'spear', 'sword', 'archer', 'crossbow'];
export const TIERS = ['none', 'leather', 'mail', 'plate'];
const AI_EVERY = 60;                                               // a house arms a batch a place at most this often (seconds)

export const rosterOf = p => p.ban?.units || [];
export const armedIn = p => rosterOf(p).reduce((n, u) => n + u.count, 0);
const shieldOf = key => canShield(key);
export const kitFor = (key, tier, n = BATCH) => outfitKit(key, n, { armour: tier, shield: shieldOf(key) });
export const nameOf = (key, tier) => `${TYPES[key].name}${tier === 'none' ? '' : ` in ${ARMOUR_NAME[tier].toLowerCase()}`}`;

// A unit's record from a village regiment, for returning it to the roster.
export const fromReg = r => ({ key: r.T.key, count: r.alive, name: r.name, armour: r.armour, shield: r.shield, xp: r.xp || 0, battles: r.battles || 0, home: r.home });

// Armed men of `p` in the world now: in the roster, and out serving (armies, garrisons, village regiments).
export function banMen(w, p) {
  let n = armedIn(p);
  const mine = u => u.home === p.id;
  for (const a of w.armies) if (!a.gone) for (const u of a.units) if (mine(u)) n += u.count;
  for (const q of w.pois) {
    for (const u of q.garrison || []) if (mine(u)) n += u.count;
    for (const r of q.town?.battle.regs || []) if (r.home === p.id && !r.gone && r.side === 0) n += r.alive || 0;
  }
  return n;
}

// How many armed men a place's ban may hold: what a call would raise from it at its lord's rank.
export const capOf = (w, p, rank) => ARRIERE.per[rank] || 0;

// Can `n` men be armed as `key` in `tier` at this village, out of its barracks racks?
export function armCheck(w, p, town, key, tier, n = BATCH) {
  const per = capOf(w, p, w.rank);
  if (p.owner !== 0 || !town) return { ok: false, reason: 'Only at your own village' };
  if (!per) return { ok: false, reason: 'From the rank of Lord' };
  if (!KINDS.includes(key) || !TIERS.includes(tier)) return { ok: false, reason: 'No such kit' };
  const have = banMen(w, p);
  if (have + n > per) return { ok: false, reason: `The ban of ${p.name} holds ${per} men at most (${have} armed or out)` };
  const racks = town.buildings.filter(b => b.kind === 'barracks' && b.state === 'active');
  if (!racks.length) return { ok: false, reason: 'Needs a barracks' };
  const kit = kitFor(key, tier, n), short = Object.entries(kit).filter(([g, q]) => racks.reduce((s, b) => s + (b.store[g] || 0), 0) < q);
  if (short.length) return { ok: false, reason: `Needs ${short.map(([g, q]) => `${q} ${GOODS[g].name.toLowerCase()}`).join(', ')} on the racks`, kit, racks };
  return { ok: true, kit, racks, per, have };
}

// Puts `n` men into a roster: the same kind and kit merge, and experience is averaged by numbers.
function enrol(p, u) {
  const list = (p.ban ??= { units: [] }).units;
  let g = list.find(o => o.key === u.key && o.armour === u.armour && !!o.shield === !!u.shield);
  if (!g) list.push(g = { key: u.key, count: 0, name: u.name, armour: u.armour, shield: !!u.shield, xp: 0, battles: 0 });
  const k = g.count + u.count;
  g.xp = k ? Math.round((g.xp * g.count + (u.xp || 0) * u.count) / k * 100) / 100 : 0;
  g.battles = Math.max(g.battles || 0, u.battles || 0);
  g.count = k;
}

// Arms a batch at a village: the kit leaves the racks for good and goes to the ban's men.
export function arm(w, p, town, key, tier, n = BATCH) {
  const c = armCheck(w, p, town, key, tier, n);
  if (!c.ok) return c;
  for (const [g, q] of Object.entries(c.kit)) {
    let left = q;
    for (const b of c.racks) { const k = Math.min(left, Math.floor(b.store[g] || 0)); if (k > 0) { town.put(b, g, -k); left -= k; } }
  }
  enrol(p, { key, count: n, name: `Armed ban of ${p.name}`, armour: tier, shield: shieldOf(key), xp: 0, battles: 0 });
  town.event(`${n} men of the ban of ${p.name} are armed as ${nameOf(key, tier).toLowerCase()}: the kit stays with the village's men.`);
  return { ok: true };
}

// What the village's ban is, in a line, and its best men's rank.
export function describe(w, p) {
  const list = rosterOf(p), per = capOf(w, p, w.rank), out = banMen(w, p) - armedIn(p);
  const xp = list.length ? list.reduce((s, u) => s + u.xp * u.count, 0) / armedIn(p) : 0;
  return { per, armed: armedIn(p), out, units: list, xp };
}

// A call's men from `p`: the roster first, the best kit first, up to `n`; they leave the roster while
// out. Marked with the place (home) and the time they go home (until).
export function takeRoster(p, n, until) {
  const list = rosterOf(p).filter(u => u.count > 0).sort((a, b) => armourWeight(b) - armourWeight(a));
  const out = [];
  for (const u of list) {
    const k = Math.min(n, u.count);
    if (k <= 0) break;
    u.count -= k; n -= k;
    out.push({ key: u.key, count: k, name: u.name, armour: u.armour, shield: u.shield, xp: u.xp, battles: u.battles, until, home: p.id });
  }
  if (p.ban) p.ban.units = p.ban.units.filter(u => u.count > 0);
  return out;
}

// A unit that came from a roster, home again: back into it, with its experience.
export function returnToRoster(w, u) {
  if (u.home === undefined || !(u.count > 0)) return false;
  const p = w.byId[u.home];
  if (!p) return false;
  enrol(p, u);
  return true;
}

// ---- the house's side ----
// A house's place with a barracks, and a vassal's, arms its own ban out of its own stock, by the same
// rule: a batch of ten at a time, the best kit it has a full batch of, never more than its rank's number,
// no more than once a minute, and only once its garrison is full.
export function aiArm(w, p, e, rank, dt) {
  const per = ARRIERE.per[rank] || 0;
  e.banClock = (e.banClock ?? AI_EVERY) - dt;
  if (!per || e.banClock > 0 || !e.buildings?.barracks) return false;
  e.banClock = AI_EVERY;
  if (banMen(w, p) + BATCH > per) return false;
  const has = g => Math.floor(e.stock?.[g] || 0);
  for (const tier of ['plate', 'mail', 'leather']) for (const key of ['sword', 'spear', 'archer']) {
    const kit = kitFor(key, tier);
    if (!Object.entries(kit).every(([g, q]) => has(g) >= q)) continue;
    for (const [g, q] of Object.entries(kit)) e.stock[g] -= q;
    enrol(p, { key, count: BATCH, name: `Armed ban of ${p.name}`, armour: tier, shield: shieldOf(key), xp: 0, battles: 0 });
    return true;
  }
  return false;
}

