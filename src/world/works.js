// Great works: the showpieces a rising lord builds for the realm to see. Three kinds:
//  - a cathedral, a real building in one of your villages (economy.js `cathedral`), one in
//    the realm, from the rank of Count; finished, it is a moment, and every house and vassal
//    thinks better of you;
//  - the royal city restored, in three stages once you hold Kingsbridge: its walls, its
//    great market, its palace;
//  - in Part 2, the old north wall rebuilt across a breach, closing that road from the war
//    camp behind it. The north batters at a closed stretch and may break it again.
// The realm's works (not the cathedral) go one at a time, paid in gold up front, and need the
// place to stay yours while they are built. State: w.works = { doing, done, cathedral, sealed }.
import { FACTIONS, headcount, power } from './world.js';

const ORDER = ['Reeve', 'Lord', 'Count', 'Duke', 'King'];
const atLeast = (w, rank) => ORDER.indexOf(w.rank) >= ORDER.indexOf(rank);

export const WORKS = {
  walls: { name: 'Mend the city walls', gold: 400, secs: 240, rank: 'Lord', icon: 'wall',
    about: 'Masons close the old gaps. Kingsbridge holds half again as well against any attack, whoever holds it.',
    done: 'The walls of Kingsbridge stand whole again.' },
  market: { name: 'Reopen the great market', gold: 500, secs: 240, rank: 'Lord', after: 'walls', icon: 'market',
    about: 'Merchants come back to the river: gold every minute to whoever holds the city, and its caravans carry twice as much.',
    done: 'The great market of Kingsbridge is open again.' },
  palace: { name: 'Raise the palace', gold: 900, secs: 360, rank: 'Duke', after: 'market', icon: 'crown',
    about: 'A royal court again. Your vassals are proud to serve, and one great house fewer need back your claim to be crowned by acclaim.',
    done: 'A palace stands in Kingsbridge, and a court gathers in it.' },
};
export const SEAL = { name: 'Rebuild the old wall', gold: 500, secs: 300, icon: 'wall',
  about: 'Close the breach with stone. The war camp behind it has no road south until the north breaks it again.' };

export const MARKET_GOLD = 0.6;     // gold a second the reopened market pays whoever holds the city
const BATTER = 300;                 // how often the north tries a closed stretch
const BATTER_POWER = 260;           // and how strong the camp behind it must be
const BLOWS = 3;                    // good blows before the mended stretch falls (about half land)

const state = w => (w.works ??= { doing: null, done: {}, cathedral: null, sealed: [] });
export const workDone = (w, k) => !!w.works?.done?.[k];

// ---- what can be started ----

// The works open at a place right now, with whether each can start (and why not).
export function worksAt(w, p) {
  const s = state(w), out = [];
  if (p.kind === 'crown' && p.owner === 0) {
    for (const [k, W] of Object.entries(WORKS)) {
      if (s.done[k]) continue;
      if (W.after && !s.done[W.after]) continue;
      out.push({ key: k, W, ...check(w, p, W) });
    }
  }
  if (w.part === 2) for (const br of breachesAt(w, p)) out.push({ key: `seal:${w.wall.breaches.indexOf(br)}`, W: SEAL, br, ...check(w, p, SEAL) });
  return out;
}
// Breaches whose south end is this place of yours, still open.
export const breachesAt = (w, p) => p.owner === 0 ? (w.wall?.breaches || []).filter(br => br.to === p && !br.sealed) : [];

function check(w, p, W) {
  const s = state(w);
  if (s.doing) return { ok: false, why: `Your masons are busy: ${s.doing.name.toLowerCase()} at ${w.byId[s.doing.p]?.name}` };
  if (W.rank && !atLeast(w, W.rank)) return { ok: false, why: `From the rank of ${W.rank}` };
  if (FACTIONS[0].gold < W.gold) return { ok: false, why: `Needs ${W.gold} gold` };
  if (p.town?.underAttack || p.falling) return { ok: false, why: `${p.name} is being fought over` };
  return { ok: true };
}

export function startWork(w, p, key) {
  const o = worksAt(w, p).find(x => x.key === key);
  if (!o) return { ok: false, why: 'Not here' };
  if (!o.ok) return o;
  FACTIONS[0].gold -= o.W.gold;
  state(w).doing = { key, p: p.id, left: o.W.secs, of: o.W.secs, name: o.W.name };
  w.log(`Work begins at ${p.name}: ${o.W.name.toLowerCase()}.`);
  w.hooks.sound?.('scroll'); // audio
  return { ok: true };
}

// ---- time ----

export function tickWorks(w, dt) {
  const s = state(w), d = s.doing;
  if (d) {
    const p = w.byId[d.p];
    if (!p || p.owner !== 0) {
      w.log(`${p?.name || 'The place'} is lost, and the work there stops. The gold is gone.`, 1);
      s.doing = null;
    } else if ((d.left -= dt) <= 0) {
      s.doing = null;
      finish(w, p, d.key);
    }
  }
  // The reopened market pays whoever holds the city.
  if (s.done.market) {
    const c = w.crown, h = c && c.owner !== null ? FACTIONS[c.owner] : null;
    if (h && !h.bandit) h.gold += MARKET_GOLD * dt;
  }
  batter(w, dt);
}

function finish(w, p, key) {
  const s = state(w);
  if (key.startsWith('seal:')) {
    const br = w.wall.breaches[+key.slice(5)];
    seal(w, br);
    s.sealed.push(+key.slice(5));
    w.log(`The old wall is whole again at ${p.name}. No road runs south from ${br.from.name} now.`);
    w.chron(`You rebuilt the old wall above ${p.name}, shutting the road from ${br.from.name}.`);
    w.hooks.herald?.({ house: FACTIONS[0], title: 'The wall is mended', text: `Stone fills the gap above ${p.name}. The war camp at ${br.from.name} has no road south until the north breaks through again.` });
    return;
  }
  const W = WORKS[key];
  s.done[key] = true;
  w.hooks.sound?.('bells'); // audio
  w.log(W.done);
  w.chron(W.done);
  w.hooks.herald?.({ house: FACTIONS[0], title: W.name.replace(/^(Mend|Reopen|Raise) the /, (m, v) => ({ Mend: 'Mended: the ', Reopen: 'Reopened: the ', Raise: 'Raised: the ' }[v])), text: `${W.done} ${W.about}` });
  if (key === 'palace') w.checkEnd?.();
}

// ---- the north wall ----

export function seal(w, br) {
  br.sealed = true;
  const a = br.from, b = br.to;
  a.links = a.links.filter(q => q !== b);
  b.links = b.links.filter(q => q !== a);
  w.wall.sealedCount = (w.wall.sealedCount || 0) + 1;
}
function unseal(w, br) {
  br.sealed = false;
  br.from.links.push(br.to); br.to.links.push(br.from);
  w.wall.sealedCount = Math.max(0, (w.wall.sealedCount || 1) - 1);
  const s = state(w), i = w.wall.breaches.indexOf(br);
  s.sealed = s.sealed.filter(x => x !== i);
}
// After loading: the map is rebuilt from its seed, so close the stretches again.
export function restoreWorks(w) {
  const s = state(w);
  for (const i of s.sealed || []) { const br = w.wall?.breaches?.[i]; if (br && !br.sealed) seal(w, br); }
}

// The north hammers at a closed stretch while a strong host waits in the camp behind it.
function batter(w, dt) {
  if (w.part !== 2 || w.invader === null || w.invader === undefined) return;
  const h = FACTIONS[w.invader];
  if (!h?.alive) return;
  const blows = (state(w).blows ??= {});   // kept in the save, unlike the breaches
  w.wall.breaches.forEach((br, i) => {
    if (!br.sealed || br.from.owner !== w.invader) return;
    br.batter = (br.batter ?? BATTER) - dt;
    if (br.batter > 0) return;
    br.batter = BATTER;
    if (power(br.from.garrison) < BATTER_POWER || w.rand() > 0.5) return;
    blows[i] = (blows[i] || 0) + 1;
    const left = BLOWS - blows[i];
    if (left > 0) { w.log(`The north is battering at the mended wall above ${br.to.name} (${left} more blow${left > 1 ? 's' : ''} and it falls).`, 1); return; }
    delete blows[i];
    unseal(w, br);
    w.log(`The north has broken the old wall above ${br.to.name} again! The road from ${br.from.name} is open.`, 1);
    w.chron(`The north broke the mended wall above ${br.to.name}.`);
    w.hooks.herald?.({ house: h, title: 'The wall is breached', text: `${headcount(br.from.garrison)} men from ${br.from.name} tore down the new stone above ${br.to.name}. Mend it again, or meet them on the road.` });
  });
}

// ---- the cathedral ----

// Who may lay a cathedral's first stone (town.greatRule): one in the realm, from Count.
export function cathedralRule(w) {
  if (!atLeast(w, 'Count')) return 'From the rank of Count';
  const s = state(w);
  if (s.cathedral && w.byId[s.cathedral]?.owner === 0) return 'Your realm has its cathedral';
  if (w.pois.some(p => p.owner === 0 && p.town?.buildings.some(b => b.kind === 'cathedral' && b.state !== 'ruined'))) return 'Your realm has its cathedral';
  return null;
}
// Its finishing: every house and every vassal thinks better of you.
export function cathedralDone(w, p) {
  const s = state(w);
  if (s.cathedral === p.id) return;
  s.cathedral = p.id;
  w.dip.forEach((d, i) => { if (d && i > 0 && i !== w.bandits && i !== w.invader) d.opinion = Math.min(100, d.opinion + 10); });
  w.hooks.sound?.('bells'); // audio
  w.log(`The cathedral at ${p.name} is consecrated. Every lord in the realm hears of it.`);
  w.chron(`The cathedral at ${p.name} was consecrated.`);
  w.hooks.herald?.({ house: FACTIONS[0], title: `A cathedral at ${p.name}`, text: 'Bells ring across the realm. Every great house thinks better of you, your vassals are proud to serve, and the village round it is the happiest in your lands.' });
}
// Standing lines for a vassal's opinion of you.
export function worksPride(w) {
  const s = w.works;
  if (!s) return [];
  const out = [];
  if (s.cathedral && w.byId[s.cathedral]?.owner === 0) out.push(['A cathedral in your lands', 5]);
  if (s.done.palace && w.crown?.owner === 0) out.push(['Your palace at Kingsbridge', 5]);
  return out;
}
