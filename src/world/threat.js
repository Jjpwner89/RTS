// Threat awareness, one rule for every side (Orchestrator, 2026-11-23; creator: "that's kind of
// how you avoid one-sided battles"). A banner call is news: anyone calling its banners or its
// arrière-ban, or a house gathering a host, is heard by the sides that border it, are at war
// with it or on bad terms with it, you among them (far strangers hear nothing). A house that
// hears a call and reckons it the likely target calls its own men to the place of its the
// caller could reach soonest (houseMind, h.ai.alert); a call made in answer is heard too, but
// nobody answers an answer. And a raided place is relieved: its neighbours send what they can
// spare above a skeleton before the band arrives, so the band sees them coming and turns back
// (relief.js breaksOff); a house raided again and again by the same side goes for the raiders'
// home with a host.
import { FACTIONS, headcount, power, takeUnits, mergeInto, dist, roughly } from './world.js';
import { grudgeWeight } from './diplomacy.js';
import { RELIEF } from './relief.js';
import { SLOW } from './march.js';

export const THREAT = {
  border: 420,                      // places this near are neighbours (as thinkWars' reach)
  reach: 900,                       // a call this far by road from a place of yours threatens it
  alert: Math.round(200 * SLOW),    // seconds a house stays gathered after the last call it heard
  again: 240,                       // seconds before the same caller is news again
  bad: -20,                         // a house's opinion of you below this is bad terms
  raids: 3, span: 1200,             // this many bands from one side in this long: it punishes
  sight: 500,                       // a band this far by road from its mark is seen coming
  road: 500,                        // places this far by road from the mark may send relief
  lead: 60,                         // and only those that would be there by when the band is, or soon after
};

const placesOf = (w, i) => w.pois.filter(p => p.owner === i && p.kind !== 'camp' && !p.falling);
const borders = (w, i, j) => { const B = placesOf(w, j); return placesOf(w, i).some(p => B.some(q => dist(p, q) < THREAT.border)); };
// Bad terms: a grudge either way between houses; for you, a house thinking ill of you.
function bad(w, i, j) {
  if (i === 0 || j === 0) { const k = i || j; return (w.dip?.[k]?.opinion ?? 0) < THREAT.bad || grudgeWeight(w, FACTIONS[k], 0) > 0; }
  return grudgeWeight(w, FACTIONS[i], j) > 0 || grudgeWeight(w, FACTIONS[j], i) > 0;
}
const fought = (w, i, j) => w.fought?.[w.warKey(i, j)] != null;
const hostile = (w, i, j) => w.atWar(i, j) || bad(w, i, j) || fought(w, i, j);
const listens = h => h.alive && !h.bandit && !h.invader;

// A side's place a call at `at` threatens: its nearest, if the caller's host could reach it.
function threatened(w, i, at) {
  const near = placesOf(w, i).filter(p => dist(p, at) < THREAT.reach).sort((p, q) => dist(p, at) - dist(q, at));
  for (const p of near.slice(0, 3)) if (w.route(at, p).length <= THREAT.reach) return p;
  return null;
}

// `by` calls its men to `at` (kind 'banners', 'arriere' or 'host'; answer: in answer to another's
// call; men: about how many; told: you have had word of it already). Each side that hears it is
// told; a house that reckons itself the target answers. True if you heard it (so the caller's own
// word of it can stay quiet).
export function callHeard(w, by, at, { kind = 'banners', answer = false, men = 0, told = false } = {}) {
  if (!at || by == null || FACTIONS[by]?.bandit) return false;
  const B = FACTIONS[by];
  const heard = (w.heard ||= {}), key = `${by}`;
  let you = false;
  // You, if you border the caller, are at war with it or on bad terms with it.
  if (by !== 0 && (borders(w, 0, by) || w.atWar(0, by) || bad(w, 0, by))) {
    you = true;
    if (w.time - (heard[key] ?? -Infinity) >= THREAT.again) {
      heard[key] = w.time;
      w.meet(by);
      const about = men ? `: about ${roughly(men)} men${kind === 'arriere' ? ' of the countryside' : ''}` : '';
      if (!told) w.log(kind === 'arriere' ? `${B.name} has called its arrière-ban to ${at.name}${about}.` : `${B.name} has called its banners at ${at.name}${about}.`, 1);
    }
  }
  w.hooks.threat?.({ kind: 'call', by, at: at.id, how: kind, answer, time: w.time });
  if (answer) return you;
  // The houses. A house reckons itself the target if it is at war with the caller; or, on bad
  // terms or with a war between them before, when the caller is at war with nobody near it.
  // Either way only on the caller's border, and only where its host could reach.
  const near = FACTIONS.filter(o => o !== B && o.index !== 0 && listens(o) && (borders(w, o.index, by) || w.atWar(o.index, by) || bad(w, o.index, by)));
  const busy = FACTIONS.some(o => o !== B && listens(o) && w.atWar(by, o.index) && borders(w, o.index, by));
  for (const H of near) {
    const ai = H.ai;
    if (!ai || !borders(w, H.index, by)) continue;
    if (!(w.atWar(H.index, by) || (!busy && hostile(w, H.index, by)))) continue;
    const p = threatened(w, H.index, at);
    if (!p) continue;
    const fresh = !(ai.alert && ai.alert.by === by && ai.alert.until > w.time);
    ai.alert = { by, at: p.id, until: w.time + THREAT.alert };
    if (!fresh) continue;
    w.hooks.threat?.({ kind: 'answer', by, on: H.index, at: p.id, time: w.time });
    if (by === 0) w.log(`${H.name} hears of your call and gathers its men at ${p.name}.`, 1);
    else if (p.visible || w.knows(H.index)) w.log(`${H.name} hears ${B.name} is arming, and gathers its men at ${p.name}.`, 2);
  }
  return you;
}

// The place a house is gathered at against a call it heard, while that holds (houseMind).
export function alertAt(w, h) {
  const A = h.ai?.alert;
  if (!A) return null;
  const p = w.byId[A.at];
  if (A.until <= w.time || !p || p.owner !== h.index || !FACTIONS[A.by]?.alive) { h.ai.alert = null; return null; }
  return p;
}

// ---- raids ----
// The bands making for a house's places: an enemy's, or outlaws'.
// Its mark is the first of the house's places on its road (it raids the first it comes to), and
// `left` its road there.
const bandsOn = (w, h) => w.armies.filter(a => !a.gone && !a.wagon && !a.retreating && a.mode === 'raid' && a.side !== h.index
  && (a.side === w.bandits || w.atWar(h.index, a.side))).map(a => {
  let left = 0, at = a;
  for (const q of a.path) { left += Math.hypot(q.x - at.x, q.z - at.z); at = q; if (q.owner === h.index) return { band: a, p: q, left }; }
  return null;
}).filter(Boolean);

// Send relief to `p` against `band` from the house's places within `road` of it (skeleton: what
// each keeps at home), up to RELIEF.ratio times the band and a little, with what is already on
// its way; the nearest send first. Returns the men sent.
export function sendRelief(w, h, p, band, road = THREAT.road, skeleton = q => w.keepHome(q)) {
  const ai = h.ai, sent = (ai.relieved ||= {});
  const want = power(band.units) * RELIEF.ratio * 1.2;
  let have = 0, men = 0;
  for (const a of w.armies) if (!a.gone && a.side === h.index && (a.target === p || a.path.at(-1) === p) && !a.retreating) have += power(a.units);
  const froms = placesOf(w, h.index).filter(q => q !== p && dist(q, p) < road)
    .map(q => ({ q, r: w.route(q, p, w.roadOf(h.index)).length })).filter(o => o.r <= road).sort((a, b) => a.r - b.r);
  for (const { q } of froms) {
    if (have >= want) break;
    const spare = power(q.garrison) - skeleton(q);
    if (spare < 10) continue;
    const units = takeUnits(q.garrison, Math.min(spare, want - have));
    if (!units.length) continue;
    const a = w.spawnArmy(h.index, units, q, `${h.short} relief from ${q.name}`, 'march');
    if (!w.order(a, p, w.roadOf(h.index))) { w.removeArmy(a); mergeInto(q.garrison, units); continue; }
    have += power(units); men += headcount(units);
  }
  if (men && !sent[band.id]) {
    sent[band.id] = w.time;
    w.hooks.threat?.({ kind: 'relief', by: band.side, on: h.index, at: p.id, men, time: w.time });
    if (band.side === 0) w.log(`${h.name} sends about ${roughly(men)} men to relieve ${p.name} from your raiders.`, 1);
    else if (p.visible) w.log(`${h.name} sends about ${roughly(men)} men to relieve ${p.name}.`, 2);
  }
  return men;
}

// Every think (houseMind): relief for each band seen coming; a band's coming counts against its
// side. Returns the side that has raided THREAT.raids times in THREAT.span, and its place
// nearest the raids, for a host to punish it; or null.
export function answerRaids(w, h, skeleton) {
  const ai = h.ai, by = (ai.raidedBy ||= {}), seen = (ai.bandsSeen ||= {});
  let punish = null;
  for (const { band, p, left } of bandsOn(w, h)) {
    if (left > THREAT.sight) continue;
    if (!seen[band.id]) {
      seen[band.id] = w.time;
      const list = (by[band.side] = (by[band.side] || []).filter(t => w.time - t < THREAT.span));
      list.push(w.time);
      // Its home: the raiders' place nearest the one they raid.
      const home = w.pois.filter(q => q.owner === band.side && !q.falling && w.canAttack(h.index, q)).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (list.length >= THREAT.raids && home) punish = { side: band.side, home };
    }
    sendRelief(w, h, p, band, Math.min(THREAT.road, left + THREAT.lead), skeleton);
  }
  for (const id of Object.keys(seen)) if (w.time - seen[id] > THREAT.span) { delete seen[id]; delete ai.relieved?.[id]; }
  return punish;
}
