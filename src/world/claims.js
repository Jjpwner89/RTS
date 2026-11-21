// Great vassals and their claims (orchestrator's ruling, 2026-11-21: King depth, great vassals
// with claims only; factions demanding another king are vassals.js). A king may raise a vassal
// to duke, the fourth title (vassals.js TITLES): a great vassal sends twice the men and pays a
// quarter more in dues, and holds a claim, a place near their lands they say is theirs by
// right: one you run yourself, or another vassal's. Grant it and they are pleased; leave it
// and it weighs on them more as time passes (vassals.js opinion). Unanswered for PRESS
// seconds, or sooner once they are angry, they press it: give way, or they take it. Another
// vassal's place they seize, and the two fall into a feud; one of yours they cannot take,
// so they turn on you, a lasting grievance that drives them toward a faction.
// The crown itself is never claimed here: that is the factions' (vassals.js claimant).
// State: v.claim = { poi, since } while it stands; v.claimAt, when the next may come.
import { FACTIONS } from './world.js';
import { living, holdingsOf, vassalOf, opinion, mark, remember, FACTION_ANGER, TEMPERS } from './vassals.js';

export const GREAT = 3;                 // TITLES index of a duke
export const CLAIM = { press: 900, again: 1800, grant: 18, rivals: -3, lost: -20, seized: -15, refused: -30, fade: 3000 };
export const isGreat = v => (v.title || 0) >= GREAT;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const signed = n => String(n).replace('-', '−');

// What a great vassal could claim, nearest their lands first: a place of yours you could give
// (not your seat, the crown city or a camp), or another vassal's, never their last: a vassal
// with no land is gone (vassals.js tickVassals).
export function claimable(w, v) {
  const mine = holdingsOf(w, v);
  if (!mine.length) return [];
  const near = p => Math.min(...mine.map(q => dist(p, q)));
  return w.pois.filter(p => p.owner === 0 && p.vassal !== v.id && p.kind !== 'camp' && p.kind !== 'crown'
    && (p.vassal ? holdingsOf(w, vassalOf(w, p) || { id: null }).length > 1 : w.canGrant(p).ok)).sort((a, b) => near(a) - near(b));
}

export const claimOn = (w, v) => (v.claim ? w.byId[v.claim.poi] : null);

// Every five seconds, from tickVassals.
export function tickClaims(w) {
  for (const v of living(w)) {
    if (!isGreat(v) || v.landless) { v.claim = null; continue; }
    const p = claimOn(w, v);
    // Theirs now, or lost to the realm: the claim is over.
    if (v.claim && (!p || p.owner !== 0 || p.vassal === v.id || (p.vassal && holdingsOf(w, vassalOf(w, p) || { id: null }).length < 2))) { v.claim = null; v.claimAt = w.time + CLAIM.again; continue; }
    if (!v.claim) {
      if (w.time < (v.claimAt ?? 0)) continue;
      const q = claimable(w, v)[0];
      if (!q) { v.claimAt = w.time + 300; continue; }
      v.claim = { poi: q.id, since: w.time };
      const held = vassalOf(w, q);
      remember(w, v, `Claimed ${q.name} by right`);
      w.log(`${v.name} claims ${q.name} by right${held ? `, though ${held.name} holds it` : ''}. Grant it in Your realm, or it will weigh on them.`, 1);
      w.hooks.herald?.({ house: { name: v.name, color: v.color }, title: 'A great vassal\'s claim', text: `${v.name} says ${q.name} is theirs by right${held ? `, and ${held.name} holds it` : ''}. Grant it and they are content; leave it, and it weighs on them more each minute, until they press it.` });
      continue;
    }
    if (!v.claim.asked && (w.time - v.claim.since > CLAIM.press || opinion(w, v).total <= FACTION_ANGER)) press(w, v, p);
  }
}

// They will wait no longer: give way, or they take it.
function press(w, v, p) {
  v.claim.asked = true;
  const held = vassalOf(w, p);
  w.hooks.offer?.({ house: { alive: true, name: v.name }, title: `${v.name} presses their claim`,
    text: `${v.name} will wait no longer for ${p.name}.\n\nGive way: it is theirs, and they are pleased (+${CLAIM.grant})${held ? `; ${held.name} loses it and minds it (${signed(CLAIM.lost)})` : ''}.\n\nRefuse: ${held ? `they take it by force from ${held.name}, who minds that you let them (${signed(CLAIM.seized)}), and the two fall into a feud` : `they cannot take it from you, and they do not forget it (${signed(CLAIM.refused)}): enough to drive them toward a faction against you`}.`,
    accept: () => grantClaim(w, v), decline: () => refuseClaim(w, v) });
}

// Give them the place they claim.
export function grantClaim(w, v) {
  const p = claimOn(w, v);
  if (!p || p.owner !== 0) { v.claim = null; return { ok: false, text: 'That claim has lapsed' }; }
  const held = vassalOf(w, p);
  if (held) {
    if (held.feud === v.id) return { ok: false, text: `Not while ${held.name} and ${v.name} are feuding` };
    p.vassal = v.id;
    mark(w, held, CLAIM.lost, `You gave ${p.name} to ${v.name}`, CLAIM.fade);
    remember(w, held, `Lost ${p.name} to ${v.name}'s claim`);
  } else if (!w.grant(p, v)) return { ok: false, text: w.canGrant(p).why || `${p.name} cannot be given now` };
  done(w, v);
  mark(w, v, CLAIM.grant, `Granted their claim to ${p.name}`, CLAIM.fade);
  for (const o of living(w)) if (o !== v && o !== held && (TEMPERS[o.temper].honour || TEMPERS[o.temper].want)) mark(w, o, CLAIM.rivals, `You gave ${v.name} ${p.name}`, 900);
  remember(w, v, `Granted ${p.name} by right`);
  w.log(`You grant ${v.name}'s claim: ${p.name} is theirs.`, 1);
  w.chron(`${v.name}'s claim to ${p.name} was granted.`);
  return { ok: true, text: `${v.name} takes ${p.name}, and thanks you.` };
}

// Refused to their face: a vassal's place they seize, one of yours they hold against you.
export function refuseClaim(w, v) {
  const p = claimOn(w, v);
  if (!p) { v.claim = null; return; }
  const held = vassalOf(w, p);
  done(w, v);
  if (held) {
    p.vassal = v.id;
    mark(w, held, CLAIM.seized, `You let ${v.name} take ${p.name}`, CLAIM.fade);
    for (const [a, b] of [[v, held], [held, v]]) { a.feud = b.id; a.feudSince = w.time; }
    remember(w, held, `${v.name} took ${p.name} by force`);
    remember(w, v, `Took ${p.name} from ${held.name} by force`);
    w.log(`${v.name} takes ${p.name} from ${held.name} by force. The two are feuding.`, 1);
    w.chron(`${v.name} seized ${p.name} from ${held.name}.`);
    return;
  }
  mark(w, v, CLAIM.refused, `Refused their claim to ${p.name}`, CLAIM.fade);
  remember(w, v, `Refused ${p.name}, theirs by right`);
  w.log(`You refuse ${v.name} ${p.name}. They will not forget it.`, 1);
}

function done(w, v) { v.claim = null; v.claimAt = w.time + CLAIM.again; }

// For the opinion list: an unanswered claim weighs more as it goes on, as a want does.
export const claimWeight = (w, v, at) => (v.claim ? -Math.min(12, (at - v.claim.since) / 75) : 0);

// For checks(): every claim names a real place of yours the claimant doesn't hold.
export function claimProblems(w) {
  const out = [];
  for (const v of living(w)) {
    if (!v.claim) continue;
    const p = w.byId[v.claim.poi];
    if (!p) out.push(`${v.name} claims a place that doesn't exist (${v.claim.poi})`);
    else if (p.vassal === v.id) out.push(`${v.name} claims ${p.name}, which they already hold`);
    else if (p.owner !== 0) out.push(`${v.name} claims ${p.name}, which is ${p.owner === null ? 'free' : FACTIONS[p.owner].name + "'s"}`);
    if (!isGreat(v)) out.push(`${v.name} holds a claim without being a great vassal`);
  }
  return out;
}
