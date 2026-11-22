// Battle AI. In the field: the general picks a plan for the ground and the armies (hold and
// shoot, hammer and anvil, refuse a wing, envelop), then each regiment picks its fight by
// unit type, and a beaten army withdraws behind a rearguard. At walls:
// attackers bring up engines and ladders and storm where the walls are weak; defenders
// man the walls, answer each ladder and sally out against engines.
// It thinks once a second, like a general sending runners rather than micromanaging.

import { arrowGuard, hasShield } from './battle.js';
import { value } from './economy.js';

const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cz - b.cz);
const nearest = (r, list) => list.reduce((best, o) => (!best || dist(r, o) < dist(r, best) ? o : best), null);
const usable = r => !r.gone && !r.routing && !r.regrouping;
// How much of a bow's (or bolt's) shooting would tell on a regiment: armour and shields
// turn arrows, bolts go through some of that. Bows go for the soft targets; bolts care less.
const exposed = (o, pierce) => (arrowGuard(o) + (1 - arrowGuard(o)) * pierce) * (hasShield(o) ? 1 - 0.3 * (1 - pierce) : 1);
const centroid = list => ({ cx: list.reduce((n, r) => n + r.cx, 0) / list.length, cz: list.reduce((n, r) => n + r.cz, 0) / list.length });

// hold: wait for the enemy to come within reach instead of marching out, as a garrison does.
// regs: only command these regiments (e.g. one attacking host among several).
export function thinkAI(battle, side, { hold = false, start = 8, regs = null } = {}) {
  if (battle.time < start || battle.winner !== null) return;
  // Both armies stand and watch while champions fight.
  if (battle.duel && !battle.duel.over) return;
  const mine = (regs || battle.regs).filter(r => r.side === side && usable(r));
  if (!mine.length) return;
  const walls = battle.walls;
  if (walls.any) {
    const theirs = walls.structures().some(s => s.side !== side && s.state === 'up');
    const ours = walls.structures().some(s => s.side === side && s.state === 'up');
    if (theirs) return thinkSiegeAttack(battle, side, { regs: mine });
    if (ours) return thinkSiegeDefence(battle, side, { regs: mine });
  }
  thinkField(battle, side, mine, { hold });
}

// ---- the general ----

// Each side's commander (battle.generals[side]: { name, trait } from the campaign's lord, or
// ?general= on the battle test) has a temper from his house, and each house a habit the
// player can learn to read. Cautious lords stand and wait, and leave the field early to save
// their men; rash ones come on and stay to the bitter end; cunning ones go round. A side
// with no lord is steady.
// even: the plans a house falls back on when the armies are fairly matched (odds 0.7 to
// 1.4), first that the field allows; outside that band the odds rule. A steady side with
// no house always comes on in a plain line then.
const HOUSES = {
  turtler:  { temper: 'cautious', even: ['hold'] },              // Stonemere takes the high ground and makes you come
  builder:  { temper: 'cautious', even: ['refuse'] },            // Carrow rests a wing on a wood or a river
  merchant: { temper: 'cautious', even: ['reserve', 'hold'] },   // Penhallow keeps a second line back, spends men like coin
  raider:   { temper: 'rash', even: ['hammer', 'charge'] },      // Varn swings the horse round a flank
  hothead:  { temper: 'rash', even: ['charge'] },                // Dunmore runs straight at you, horse and all
  invader:  { temper: 'rash', even: ['envelop'] },               // Norrhold spreads wide whatever the odds
  schemer:  { temper: 'cunning', even: ['woods', 'refuse'] },    // Wyndham hides men in the woods for your flank
  bandit:   { temper: 'cunning', even: ['woods', 'charge'] },
};
// bias: added to each plan's score. leave: it withdraws once fewer of its men than this share
// of those it brought still stand and the enemy has clearly more (an army breaks under half,
// battle.js checkBreak). wait: seconds it will stand on a hold before coming on anyway.
const TEMPERS = {
  steady:   { bias: {}, leave: 0.6, wait: 90 },
  cautious: { bias: { hold: 0.35, refuse: 0.25, envelop: -0.2 }, leave: 0.68, wait: 150 },
  rash:     { bias: { hold: -0.4, refuse: -0.3, hammer: 0.15, envelop: 0.35 }, leave: 0.52, wait: 40 },
  cunning:  { bias: { hammer: 0.35, refuse: 0.15 }, leave: 0.6, wait: 90 },
};
export function general(battle, side) {
  const g = battle.generals?.[side], H = HOUSES[g?.trait] || {}, temper = g?.temper || H.temper || 'steady';
  return { ...TEMPERS[temper], temper, even: H.even || (temper === 'steady' ? ['line'] : null), plain: !!g?.plain, who: g?.name || (side ? 'The enemy' : 'Your captain') };
}
const strength = list => list.reduce((n, r) => n + r.alive * value(r.T.key), 0);
const shoots = r => r.T.range && !r.engine && !r.T.javelin;

// The two armies' ground: where each stands, the way to the enemy (fwd) and across it (right),
// and how far each line reaches either side of its middle.
function frame(mine, standing) {
  const c = centroid(mine), e = centroid(standing), a = Math.atan2(e.cx - c.cx, e.cz - c.cz);
  const fwd = { x: Math.sin(a), z: Math.cos(a) }, right = { x: Math.cos(a), z: -Math.sin(a) };
  const lat = (r, o) => (r.cx - o.cx) * right.x + (r.cz - o.cz) * right.z;
  const half = (list, o) => Math.max(20, ...list.map(r => Math.abs(lat(r, o))));
  return { c, e, a, fwd, right, lat: r => lat(r, c), halfM: half(mine, c), halfE: half(standing, e) };
}
const onField = (x, z) => ({ x: Math.max(-135, Math.min(135, x)), z: Math.max(-230, Math.min(230, z)) });

// A wood or a river at the end of one wing, to rest it on: { s: ±1, what } or null.
function findAnchor(battle, F) {
  let best = null;
  for (const s of [-1, 1]) for (let j = 0; j < 4; j++) {
    const d = F.halfM + 10 + j * 12, x = F.c.cx + F.right.x * s * d, z = F.c.cz + F.right.z * s * d;
    const R = battle.river, wet = R && Math.abs(R.across(x, z)) < R.half + 12;
    const wood = battle.trees ? battle.woodAt(x, z) : 0;
    const k = wet ? 1 : wood;
    if (k > 0.4 && (!best || k > best.k)) best = { s, k, what: wet ? 'river' : 'wood' };
  }
  return best;
}

// A wood out on one flank, between the armies and short of the enemy, to hide a flanking
// party in: { x, z, s } or null.
function findCover(battle, F) {
  if (!battle.trees) return null;
  const span = Math.hypot(F.e.cx - F.c.cx, F.e.cz - F.c.cz);
  let best = null;
  for (const s of [-1, 1]) for (let t = 0.3; t <= 0.8; t += 0.1) for (let w = F.halfM * 0.6; w <= F.halfM + 60; w += 12) {
    const p = onField(F.c.cx + F.fwd.x * span * t + F.right.x * s * w, F.c.cz + F.fwd.z * span * t + F.right.z * s * w);
    if (battle.woodAt(p.x, p.z) > 0.5 && Math.hypot(p.x - F.e.cx, p.z - F.e.cz) > 50 && (!best || t > best.t)) best = { ...p, s, t };
  }
  return best;
}

// The plan, chosen once when the enemy is first in sight, from the two armies' make-up, the
// ground and the general's temper. It is said aloud so the player can read it.
function choosePlan(battle, side, mine, standing, st, hold) {
  const g = general(battle, side);
  st.since = battle.time;
  st.full = strength(mine);
  // A garrison waits; a fight round a town, or the bench's plain side, keeps the old ways.
  if (hold || g.plain || battle.structures) { st.plan = hold ? 'garrison' : 'line'; return; }
  st.planned = true;
  const odds = st.full / Math.max(1, strength(standing));
  const share = (list, f) => strength(list.filter(f)) / Math.max(1, strength(list));
  const bows = share(mine, shoots), theirBows = share(standing, shoots);
  const horse = share(mine, r => r.T.mounted), foot = share(mine, r => !r.T.mounted && !r.engine && !shoots(r));
  const F = frame(mine, standing), rise = findHill(battle, mine, standing).rise;
  const cover = findCover(battle, F), feet = mine.filter(r => !r.engine && !shoots(r) && !r.T.mounted);
  // With no wood or river, a refused line leads with its stronger wing.
  const wingStrength = s => strength(mine.filter(r => F.lat(r) * s > 0));
  const anchor = findAnchor(battle, F) || { s: wingStrength(1) >= wingStrength(-1) ? 1 : -1, what: null };
  const score = {
    line: 0.3,
    hold: bows * 1.5 + (rise >= 3 ? 0.4 : 0) - Math.max(0, theirBows - bows) * 1.5 - (odds > 1.3 ? 0.4 : 0),
    hammer: horse >= 0.15 && foot >= 0.3 ? 0.35 + horse : -9,
    refuse: odds < 0.85 && anchor.what ? 0.45 + (0.85 - odds) : -9,
    envelop: odds >= 1.45 ? 0.5 + (odds - 1.45) : -9,
  };
  for (const k in score) score[k] += g.bias[k] || 0;
  st.plan = Object.keys(score).reduce((a, b) => (score[b] > score[a] ? b : a));
  // Fairly matched, a lord fights the way his house always does.
  const can = { hammer: score.hammer > -5, woods: !!cover, reserve: feet.length >= 3, line: true, hold: true, refuse: true, charge: true, envelop: true };
  if (odds >= 0.7 && odds < 1.4 && g.even) st.plan = g.even.find(k => can[k]) || st.plan;
  st.cover = cover;
  // The reserve: the strongest third of the foot and all the horse, kept back.
  const kept = feet.slice().sort((a, b) => b.alive - a.alive).slice(0, Math.floor(feet.length / 3));
  // The woods party: the horse, or with too few the two outermost foot on the wood's side.
  const party = horse >= 0.1 ? mine.filter(r => r.T.mounted) : feet.slice().sort((a, b) => F.lat(b) * (cover?.s || 1) - F.lat(a) * (cover?.s || 1)).slice(0, 2);
  // Who does what: the horse of a hammer, the far wing of a refused line, the outer
  // thirds of an envelopment, each going round its own side.
  const ranked = mine.filter(r => !r.engine && !shoots(r)).sort((a, b) => F.lat(a) - F.lat(b)), third = Math.floor(ranked.length / 3);
  for (const r of mine) {
    const s = F.lat(r) < 0 ? -1 : 1;
    r.aiSide = s;
    r.aiRole = st.plan === 'hammer' && r.T.mounted ? 'hammer'
      : st.plan === 'refuse' && feet.includes(r) && F.lat(r) * anchor.s < -10 ? 'refused'
      : st.plan === 'reserve' && (r.T.mounted || kept.includes(r)) ? 'reserve'
      : st.plan === 'woods' && party.includes(r) ? 'woods'
      : st.plan === 'envelop' && third && (ranked.indexOf(r) < third || ranked.indexOf(r) >= ranked.length - third) ? 'wing' : null;
  }
  const say = {
    line: `${g.who} comes straight on in a line.`,
    hold: rise >= 3 ? `${g.who} holds the rise and waits for you to come under the bows.` : `${g.who} stands to receive you and lets the bows do the work.`,
    hammer: `${g.who} sends the horse wide round the flanks while the foot come on.`,
    refuse: anchor.what ? `${g.who} rests a wing on the ${anchor.what} and holds the other back.` : `${g.who} leads with one wing and holds the other back.`,
    charge: `${g.who} comes straight at you, horse and foot together, to charge home all at once.`,
    reserve: `${g.who} keeps a second line back, to send in where you break through.`,
    woods: `${g.who} sends men off into the woods: mind your flanks.`,
    envelop: odds >= 1.45 ? `${g.who} has the numbers and spreads wide to take you in the flanks.` : `${g.who} spreads wide to take you in the flanks.`,
  }[st.plan];
  battle.event(side, say);
}

// Beaten: fewer of its men stand than its temper allows (of all it brought) and the enemy in
// sight has clearly more. It reckons as the army's breaking does (battle.js checkBreak), so a
// cautious lord leaves well before his army would break and a rash one only just.
function beaten(battle, side, mine, standing, st) {
  if (!st.planned || battle.time - st.since < 20) return false;
  const men = list => list.reduce((n, r) => n + (r.T.engine ? 0 : r.alive), 0);
  const brought = battle.regs.reduce((n, r) => n + (r.side === side && !r.T.engine ? r.initial : 0), 0);
  const ours = men(mine);
  return ours < brought * general(battle, side).leave && men(standing) > ours * 1.15;
}

// An orderly withdrawal: the steadiest foot near the enemy stay behind as a rearguard while
// the rest march for home and leave the field there in good order. Men locked in melee can't
// break away and fight on. The rearguard follows once the others are clear.
function retreat(battle, side, mine, standing, st) {
  const h = battle.homes[side], g = general(battle, side);
  if (!st.withdraw) {
    st.withdraw = { t: battle.time };
    const e = standing.length ? centroid(standing) : { cx: h.x, cz: -h.z };
    const foot = mine.filter(r => !r.engine && !shoots(r) && !r.T.mounted);
    st.rear = (foot.length ? foot : mine).reduce((b, r) => (!b || r.alive - dist(r, e) * 0.5 > b.alive - dist(b, e) * 0.5 ? r : b), null);
    battle.event(side, `${g.who} sounds the retreat; ${battle.label(st.rear)} stay behind to cover it.`);
  }
  const clear = battle.time - st.withdraw.t > 60 || mine.every(r => r === st.rear || !r.aiLeaving || !standing.length || dist(r, nearest(r, standing)) > 120);
  let k = 0;
  for (const r of mine) {
    if (Math.hypot(r.cx - h.x, r.cz - h.z) < 45 && r.aiLeaving) {
      battle.disband(r);
      battle.event(side, `${battle.label(r)} leave the field in good order.`);
      continue;
    }
    if (r.engaged > 0 && !r.T.mounted) { if (standing.length) pickFight(battle, r, standing, standing); continue; }
    if (r === st.rear && !clear) {
      const near = standing.length && nearest(r, standing);
      if (near && dist(r, near) < 40) pickFight(battle, r, standing, standing);
      else if (r.dest || r.targetReg) battle.orderHalt([r]);
      continue;
    }
    if (r.aiLeaving && r.dest) continue;
    r.aiLeaving = true;
    r.targetReg = null;
    const x = h.x + ((k++ % 5) - 2) * 18;
    battle.orderMove([r], x, h.z, Math.atan2(x - r.cx, h.z - r.cz));
    battle.hurry([r]);
  }
}

function thinkField(battle, side, mine, { hold = false } = {}) {
  const st = (battle.fieldAI ||= [{}, {}])[side];
  // Only what it can see: regiments hidden in woods are not there for it yet.
  const foes = battle.regs.filter(r => r.side !== side && !r.gone && battle.sees(side, r));
  const standing = foes.filter(r => !r.routing && !r.regrouping);
  if (st.withdraw) return retreat(battle, side, mine, standing, st);
  if (!standing.length) {
    // Nothing in sight but the enemy is out there (in fog, say): feel forward toward their side.
    const hidden = battle.regs.some(r => r.side !== side && !r.gone && !r.routing);
    if (!hidden || hold) return;
    const h = battle.homes[1 - side];
    for (const r of mine) {
      if (r.dest || r.targetReg || r.posts || r.targetWall || Math.hypot(h.x - r.cx, h.z - r.cz) < 40) continue;
      const ang = Math.atan2(h.x - r.cx, h.z - r.cz);
      nudge(battle, r, r.x + Math.sin(ang) * 20, r.z + Math.cos(ang) * 20, ang);
      if (Math.hypot(h.x - r.cx, h.z - r.cz) > 120) battle.hurry([r]);   // walk only the last stretch blind
    }
    return;
  }
  if (!st.plan) choosePlan(battle, side, mine, standing, st, hold);
  if (beaten(battle, side, mine, standing, st)) return retreat(battle, side, mine, standing, st);
  const g = general(battle, side), F = frame(mine, standing);
  // A hold that the enemy won't come to, or that their bows are winning, is given up.
  if (st.plan === 'hold' && !mine.some(r => r.engaged > 0)
    && (battle.time - st.since > g.wait || battle.losses[side] > battle.losses[1 - side] + 15)) {
    st.plan = 'line';
    battle.event(side, `${g.who} tires of waiting and comes on.`);
  }
  const wingPoint = r => onField(F.e.cx + F.right.x * r.aiSide * (F.halfE + 25) + F.fwd.x * 15, F.e.cz + F.right.z * r.aiSide * (F.halfE + 25) + F.fwd.z * 15);

  // Until the lines are close, march forward together and keep formation.
  const gap = Math.min(...mine.map(r => dist(r, nearest(r, standing))));
  if (gap > 75) {
    if (hold || st.plan === 'garrison' || st.plan === 'hold') { takeHill(battle, side, mine, standing); return; }
    for (const r of mine) {
      if (r.posts || r.targetWall) continue;
      if (r.aiRole === 'refused') { trail(battle, r, mine, F); continue; }
      if (r.aiRole === 'hammer') { ride(battle, r, wingPoint(r)); continue; }
      if (r.aiRole === 'woods') { ride(battle, r, st.cover); continue; }
      if (r.aiRole === 'reserve') { follow(battle, r, mine, F); continue; }
      if (r.dest || r.targetReg) continue;
      // An envelopment's wings lean outward as they come on, to overlap the enemy's ends.
      const ang = Math.atan2(F.e.cx - r.cx, F.e.cz - r.cz) + (r.aiRole === 'wing' ? r.aiSide * 0.35 : 0);
      nudge(battle, r, r.x + Math.sin(ang) * 30, r.z + Math.cos(ang) * 30, Math.atan2(F.e.cx - r.cx, F.e.cz - r.cz));
      // Far apart, foot cover the empty ground at a run and walk the last 110 m up in order;
      // horse ride out ahead at speed (in a charge they keep level with the foot).
      if (gap > 110 || (r.T.mounted && st.plan !== 'charge')) battle.hurry([r]);
    }
    return;
  }
  const busy = mine.some(r => r.engaged > 0 && !r.T.mounted);
  if (busy) st.clash ??= battle.time;
  // The reserve goes in when a regiment of the line breaks or wavers, or the fighting has
  // gone on half a minute.
  if (st.plan === 'reserve' && !st.sent && (battle.regs.some(r => r.side === side && r.routing && r.aiRole !== 'reserve')
    || mine.some(r => r.aiRole !== 'reserve' && r.engaged > 0 && r.morale < r.T.morale * 0.5) || (st.clash != null && battle.time - st.clash > 30))) {
    st.sent = true;
    battle.event(side, `${g.who} sends in the reserve.`);
  }
  for (const r of mine) {
    const near = nearest(r, standing), d = dist(r, near);
    // A regiment that has had its fight for 20 s without getting anywhere (held at a ford,
    // say) gives it up for whatever is nearest, so no fresh men stand idle by the river.
    if (r.targetReg && r.engaged === 0 && !r.T.range) {
      const p = r.aiStill;
      if (!p || Math.hypot(r.cx - p.x, r.cz - p.z) > 4) r.aiStill = { x: r.cx, z: r.cz, t: battle.time };
      else if (battle.time - p.t > 20) { r.aiAvoid = { reg: r.targetReg, until: battle.time + 30 }; r.targetReg = null; r.aiStill = null; }
    }
    if (st.plan === 'hold') {
      // Each waits for the enemy to come to it: bows to their reach, foot to 40 m; the horse
      // only guard the line, riding at whoever comes near it.
      // Once the line has been locked 15 s, the foot still standing go in where it is busy.
      const committed = st.clash != null && battle.time - st.clash > 15 && !r.T.mounted;
      const reach = r.engine ? Infinity : shoots(r) ? r.T.range : r.T.mounted ? 30 : committed ? 150 : 40;
      if (d < reach || r.targetReg) pickFight(battle, r, foes, standing, { busyFirst: committed });
      continue;
    }
    if (r.aiRole === 'reserve' && !st.sent && d > 35) { follow(battle, r, mine, F); continue; }
    if (r.aiRole === 'woods' && !r.aiFree) {
      // Out of the woods once the lines are locked, onto whoever is busiest.
      if ((busy && Math.hypot(r.cx - st.cover.x, r.cz - st.cover.z) < 25) || d < 35 || (busy && battle.time - st.clash > 30)) r.aiFree = true;
      else { ride(battle, r, st.cover); continue; }
    }
    if (st.plan === 'charge' && !r.aiCharged && !shoots(r) && !r.engine && d < 60) {
      // The whole line runs the last stretch together and the horse charge home with it.
      pickFight(battle, r, foes, standing);
      battle.hurry([r]);
      if (r.T.mounted) battle.orderCharge([r]);
      r.aiCharged = true;
      continue;
    }
    // The refused wing comes in five seconds after the leading wing has struck: an echelon.
    if (r.aiRole === 'refused' && d > 45 && !r.targetReg && (st.clash == null || battle.time - st.clash < 5)) { trail(battle, r, mine, F); continue; }
    if (r.aiRole === 'hammer' && !r.aiFree) {
      const w = wingPoint(r);
      if (Math.hypot(r.cx - w.x, r.cz - w.z) < 25 || d < 35 || busy) r.aiFree = true;
      else { ride(battle, r, w); continue; }
    }
    if (r.aiRole === 'wing' && (!r.targetReg || r.targetReg.routing || r.targetReg.gone)) {
      // Go for the end of their line on its own side.
      const ends = standing.filter(o => !o.posts && dist(r, o) < 140);
      const pick = ends.reduce((b, o) => (!b || (o.cx - F.e.cx) * F.right.x * r.aiSide + (o.cz - F.e.cz) * F.right.z * r.aiSide > (b.cx - F.e.cx) * F.right.x * r.aiSide + (b.cz - F.e.cz) * F.right.z * r.aiSide ? o : b), null);
      if (pick) { battle.orderAttack([r], pick); battle.hurry([r]); continue; }
    }
    pickFight(battle, r, foes, standing, { busyFirst: ['hammer', 'woods', 'reserve'].includes(r.aiRole) });
  }
}

// A reserve keeps 50 m behind the rest of the line, opposite its own place in it.
function follow(battle, r, mine, F) {
  const line = mine.filter(o => o.aiRole !== 'reserve');
  if (!line.length) return;
  const c = centroid(line), x = c.cx + F.right.x * F.lat(r) - F.fwd.x * 50, z = c.cz + F.right.z * F.lat(r) - F.fwd.z * 50;
  if (r.targetReg || (r.dest ? Math.hypot(r.dest.x - x, r.dest.z - z) < 15 : Math.hypot(r.cx - x, r.cz - z) < 15)) return;
  nudge(battle, r, x, z, F.a);
}

// A refused wing keeps 40 m behind the front of the leading wing, in its own place across.
function trail(battle, r, mine, F) {
  const ahead = o => (o.cx - F.c.cx) * F.fwd.x + (o.cz - F.c.cz) * F.fwd.z, lead = mine.filter(o => o.aiRole !== 'refused');
  if (!lead.length || r.dest) return;
  const back = Math.max(...lead.map(ahead)) - 40 - ahead(r);
  if (back > 8) nudge(battle, r, r.x + F.fwd.x * back, r.z + F.fwd.z * back, F.a);
}

// Horse riding wide for the flank: at speed, and only re-ordered when the spot has moved.
function ride(battle, r, w) {
  if (r.dest && Math.hypot(r.dest.x - w.x, r.dest.z - w.z) < 15) return;
  r.targetReg = null;
  nudge(battle, r, w.x, w.z, Math.atan2(w.x - r.cx, w.z - r.cz));
  battle.hurry([r]);
}

// A step forward that isn't a full order: never to a spot in a river, where a regiment would
// halt with its men in the water. It goes on to dry ground on whichever bank the spot is
// mostly on (battle.keepDry), as a player's order does.
function nudge(battle, r, x, z, angle) {
  r.dest = { x, z, angle };
  const R = battle.river;
  if (R && !r.T.engine) battle.keepDry(r, R.bank(x, z));
}

// The best rise near the army toward the enemy, and how much higher it stands.
function findHill(battle, mine, standing) {
  const c = centroid(mine), f = centroid(standing), H = battle.heightAt;
  const toward = Math.atan2(f.cx - c.cx, f.cz - c.cz);
  let best = { x: c.cx, z: c.cz, y: H(c.cx, c.cz) };
  for (let d = 10; d <= 60; d += 10) for (let a = -1.2; a <= 1.2; a += 0.3) {
    const x = c.cx + Math.sin(toward + a) * d, z = c.cz + Math.cos(toward + a) * d, y = H(x, z);
    if (y > best.y + d * 0.02) best = { x, z, y };      // a little farther only if it is higher still
  }
  return { best, toward, c, rise: best.y - H(c.cx, c.cz) };
}

// An army told to hold first moves up onto the best rise near it, facing the enemy,
// if one is worth having: it fights downhill and its bows reach further.
function takeHill(battle, side, mine, standing) {
  const st = (battle.fieldAI ||= [{}, {}])[side];
  if (st.hill) return;
  const { best, toward, c, rise } = findHill(battle, mine, standing);
  st.hill = best;
  if (rise < 2) return;
  for (const r of mine) {
    if (r.dest || r.targetReg || r.posts || r.targetWall) continue;
    nudge(battle, r, r.x + best.x - c.cx, r.z + best.z - c.cz, toward);
  }
}

// busyFirst: going for the enemy already fighting (a hammer's blow from the flank, a reserve).
function pickFight(battle, r, foes, standing, { busyFirst = false } = {}) {

  const current = r.targetReg && !r.targetReg.gone ? r.targetReg : null;
  // Men on walls can't be reached from the ground; leave them to the bows.
  const avoid = r.aiAvoid && battle.time < r.aiAvoid.until ? r.aiAvoid.reg : null;
  const reachable = standing.filter(o => (!o.posts || r.T.range) && o !== avoid);
  if (!reachable.length) return;
  let pick;
  if (r.T.range && !r.T.javelin && r.ammo < 1) r.resupply = true;
  if (r.resupply && r.ammo >= r.maxAmmo * 0.9) r.resupply = false;
  if (r.resupply) {
    // Out of arrows: back to camp for a full quiver.
    const h = battle.fortHome(r.side);
    if (r.targetReg || (!r.dest && Math.hypot(r.cx - h.x, r.cz - h.z) > 30)) {
      r.targetReg = null;
      battle.orderMove([r], h.x, h.z * 0.92, Math.atan2(-h.x, -h.z));
    }
    return;
  } else if (r.engine?.range) {
    pick = nearest(r, reachable.filter(o => o.engaged === 0)) || nearest(r, reachable);
  } else if (r.T.range && !(r.T.javelin && r.ammo < 1)) {
    // Nearest, but worth walking a little further for men the arrows will hurt.
    const free = reachable.filter(o => o.engaged === 0), list = free.length ? free : reachable, p = r.T.pierce || 0;
    pick = list.reduce((best, o) => (!best || dist(r, o) / exposed(o, p) < dist(r, best) / exposed(best, p) ? o : best), null);
  } else if (r.T.charge) {
    // Horse rides down routers, then hunts archers and engines, then hits whoever is busiest from the side.
    const routers = foes.filter(o => o.routing && !battle.spared(o) && dist(r, o) < 90);
    const soft = reachable.filter(o => o.T.range || o.engine);
    const busy = reachable.filter(o => o.engaged > 0 && !o.T.braces);
    pick = nearest(r, routers) || (busyFirst && nearest(r, busy)) || nearest(r, soft) || nearest(r, busy) || nearest(r, reachable);
    if (pick && pick !== current && !routers.includes(pick)) {
      battle.orderAttack([r], pick);
      battle.hurry([r]);
      if (dist(r, pick) < 70) battle.orderCharge([r]);
      return;
    }
  } else {
    pick = (busyFirst && nearest(r, reachable.filter(o => o.engaged > 0))) || nearest(r, reachable);
    if (current && !current.routing && !current.posts && dist(r, current) < dist(r, pick) + 25) pick = current;
  }
  // Once it has picked its fight, it runs at it (walking pace B): only the advance walks.
  if (pick && pick !== current) { battle.orderAttack([r], pick); battle.hurry([r]); }
}

// ---- fights nobody is watching ----

// A fight left to each side's captain (or its garrison), run in slices so the game never
// stalls: call run(ms) once a frame with a time budget; it returns true once the battle is
// decided or `limit` seconds have passed. It is the same battle, so the player can take
// command at any moment and carry on from where it stands. hold[side]: that side waits
// for the enemy to come (a garrison in the open). Deployment is skipped, challenges are
// taken up and terms accepted, as captains would.
export function unwatched(battle, { hold = [false, false], limit = 600, dt = 0.05 } = {}) {
  if (battle.deploying) battle.beginBattle();
  battle.checkWinner = true;
  const end = battle.time + limit;
  let clock = 0;
  return {
    run(ms = 6) {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        if (battle.winner !== null || battle.time >= end) return true;
        battle.step(dt);
        clock -= dt;
        if (clock > 0) continue;
        clock = 1;
        if (battle.duelOffer) battle.acceptDuel();
        if (battle.terms) battle.acceptTerms();
        for (const side of [0, 1]) thinkAI(battle, side, { start: 0, hold: hold[side] });
      }
      return battle.winner !== null || battle.time >= end;
    },
  };
}

// ---- sieges ----

// How far a side's walls reach from its home: its farthest wall piece (Infinity with none).
function wallRadius(battle, side) {
  const h = battle.fortHome(side);
  let far = -Infinity;
  for (const p of battle.walls.pieces) if (p.side === side) far = Math.max(far, Math.hypot(p.x - h.x, p.z - h.z));
  return far === -Infinity ? Infinity : far;
}
// Inside a side's walls: nearer its home than the outermost wall (broken or not) on the way
// out toward (x, z). Walls needn't be round: a town wall can run far out on one side and close
// in on the other, with a castle's curtain inside it. Where the line out finds a gap, the
// outermost piece within about 15° of it stands for the wall there.
const insideOf = (battle, side, x, z) => {
  const h = battle.fortHome(side), dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
  if (d < 1) return true;
  const ux = dx / d, uz = dz / d;
  let out = -Infinity, near = -Infinity, any = false;
  for (const p of battle.walls.pieces) {
    if (p.side !== side) continue;
    any = true;
    // where the ray from home through (x, z) crosses the piece, if it does
    const ax = p.a.x - h.x, az = p.a.z - h.z, ex = p.b.x - p.a.x, ez = p.b.z - p.a.z;
    const den = ux * ez - uz * ex;
    if (Math.abs(den) > 1e-9) {
      const t = (ax * ez - az * ex) / den, u = (ax * uz - az * ux) / den;
      if (t > 0 && u >= -0.02 && u <= 1.02) { out = Math.max(out, t); continue; }
    }
    const px = p.x - h.x, pz = p.z - h.z, r = Math.hypot(px, pz);
    if ((px * ux + pz * uz) / (r || 1) > 0.966) near = Math.max(near, r);
  }
  if (!any) return true;
  const wall = out > -Infinity ? out : near > -Infinity ? near : wallRadius(battle, side);
  return d < wall - 3;
};

// The attacking side. regs: the regiments to command. Phases: engines go first, ladders
// next; the foot wait out of bowshot until a way in exists, then go.
// prepare: still camped (a siege host building up), so only the engines work.
export function thinkSiegeAttack(battle, side, { regs = null, prepare = false } = {}) {
  const W = battle.walls, enemy = 1 - side;
  const mine = (regs || battle.regs.filter(r => r.side === side)).filter(usable);
  if (!mine.length) return;
  // A storm under the walls' bows is no place to stroll: whatever it was told last time, at a run.
  battle.hurry(mine);
  const home = battle.fortHome(enemy);
  const foes = battle.regs.filter(r => r.side === enemy && !r.gone);
  const standing = foes.filter(r => !r.routing && !r.regrouping);
  const army = centroid(mine);
  const pieces = W.pieces.filter(p => p.side === enemy && p.state === 'up');
  const towers = W.structures().filter(s => s.kind === 'tower' && s.side === enemy && s.state === 'up');
  const st = battle.siegeAI = battle.siegeAI || {};

  // Is there a way in? Broken stretches, a forced gate, or a ladder team on the walls.
  const open = W.pieces.some(p => p.side === enemy && (p.state === 'broken' || p.forced));
  const inside = open && battle.nav.reachable(side, army.cx, army.cz, home.x, home.z);
  const ladders = W.ladders.filter(l => l.side === side);

  // Where to break in: the stretch facing us, weighted toward the weakest.
  if (!st.breach || st.breach.state !== 'up' || st.breach.removed) {
    st.breach = W.weakest(enemy, { x: army.cx, z: army.cz });
  }
  const breach = st.breach;
  const gate = pieces.filter(p => p.gate).sort((a, b) => Math.hypot(a.x - army.cx, a.z - army.cz) - Math.hypot(b.x - army.cx, b.z - army.cz))[0];
  // Stand-off: out of bowshot from the walls, between our army and the breach.
  const target = breach || gate || { x: home.x, z: home.z };
  const tdx = army.cx - target.x, tdz = army.cz - target.z, td = Math.hypot(tdx, tdz) || 1;
  const stage = { x: target.x + tdx / td * 135, z: target.z + tdz / td * 135, angle: Math.atan2(-tdx, -tdz) };

  // Drawn off from a gate the axes couldn't break (below): out of bowshot, to starve them out.
  if (st.drawnOff) {
    for (const r of mine) if (!r.posts && !r.targetReg && !r.dest && dist(r, { cx: stage.x, cz: stage.z }) > 40) battle.orderMove([r], stage.x, stage.z, stage.angle);
    return;
  }

  const engines = mine.filter(r => r.engine);
  const foot = mine.filter(r => !r.engine && !r.T.mounted && !r.T.range);
  const shooters = mine.filter(r => !r.engine && r.T.range);
  const horse = mine.filter(r => !r.engine && r.T.mounted);

  // Engines: rams on the gate, ladders against quiet stretches, throwers on towers then the breach.
  for (const r of engines) {
    const E = r.engine;
    if (E.kind === 'ram') {
      const t = gate || pieces.filter(p => p.material === 'wood').sort((a, b) => a.hp - b.hp)[0];
      if (t && r.targetWall !== t) battle.orderAttackWall([r], t, t.x, t.z);
    } else if (E.kind === 'ladder') {
      if (E.ladders.length || r.posts || prepare) continue;
      if (r.targetWall && r.targetWall.state === 'up') continue;
      const t = quietStretch(battle, enemy, army, pieces, gate);
      if (t) battle.orderAttackWall([r], t, t.x, t.z);
    } else if (E.range) {
      if (r.targetWall && r.targetWall.state === 'up' && !r.targetWall.removed && !(gate && gate.hp < gate.maxHp * 0.5 && r.targetWall !== gate)) continue;
      // Towers that cover the breach first, then the breach itself.
      // A gate already battered half down is the quickest way in.
      const weakGate = gate && gate.hp < gate.maxHp * 0.5 ? gate : null;
      const cover = breach ? towers.filter(t => Math.hypot(t.x - breach.x, t.z - breach.z) < 40) : towers;
      const t = weakGate || (E.kind === 'mangonel' && cover.sort((a, b) => a.hp - b.hp)[0]) || breach || gate;
      if (t) battle.orderAttackWall([r], t, t.x, t.z);
      else {
        const f = nearest(r, standing);
        if (f && r.targetReg !== f) battle.orderAttack([r], f);
      }
    }
  }
  // A mine under a stone stretch, one at a time, when there is foot to spare: slow, but it
  // brings the wall down. The defenders may hear it and dig it out.
  // With nothing else left to make a way in (the ram lost, no ladders, no throwers), any foot
  // dig, and a stretch whose mine the defenders broke into is dug again (Ashley Castle stood
  // ten minutes once its ram fell at the stone gate).
  const rams = engines.some(r => r.engine.kind === 'ram');
  const climbing = ladders.length || engines.some(r => r.engine.kind === 'ladder' && !r.engine.ladders.length && r.alive >= r.engine.per);
  const throwing = engines.some(r => r.engine.range);
  const stuck = !rams && !climbing && !throwing;
  if (!prepare && !inside && (foot.length >= 3 || stuck && foot.length) && !battle.mines.some(m => m.side === side && !m.done && !m.lost)) {
    const mined = st.mined ||= [];
    const byNear = [...pieces].sort((a, b) => Math.hypot(a.x - army.cx, a.z - army.cz) - Math.hypot(b.x - army.cx, b.z - army.cz));
    const can = p => p && p.material === 'stone' && !p.gate && p.len > 5;
    const lost = p => battle.mines.some(m => m.side === side && m.piece === p && m.lost);
    const stone = [breach, ...byNear].find(p => can(p) && !mined.includes(p)) || (stuck && [breach, ...byNear].find(p => can(p) && lost(p)));
    const digger = stone && (foot.find(r => !r.posts && !r.targetWall && (r.T.key === 'militia' || r.T.key === 'spear')) || foot.find(r => !r.posts && !r.targetWall));
    if (digger) { battle.orderMine([digger], stone); st.mined.push(stone); }
  }
  // A mine whose diggers were called off (a sally, a rout) is dug on by someone else; it used
  // to lie untouched at 0% while no new one could start.
  const unmanned = battle.mines.find(m => m.side === side && !m.done && !m.lost && !battle.regs.some(r => r.mine === m && !r.gone));
  if (!prepare && !inside && unmanned) {
    const digger = foot.find(r => !r.posts && !r.targetWall && !r.targetReg && !r.mine && (r.T.key === 'militia' || r.T.key === 'spear')) || foot.find(r => !r.posts && !r.targetWall && !r.targetReg && !r.mine);
    if (digger) battle.orderMine([digger], unmanned.piece);
  }
  if (prepare) {
    // Camped: everyone else waits at the stand-off, ready.
    for (const r of [...foot, ...shooters, ...horse]) if (!r.dest && !r.targetReg && dist(r, { cx: stage.x, cz: stage.z }) > 40) battle.orderMove([r], stage.x, stage.z, stage.angle);
    return;
  }

  // Bows: shoot the men on the walls near our ladders and breach, from just inside their range.
  for (const r of shooters) {
    if (r.targetReg && !r.targetReg.gone && r.targetReg.posts) continue;
    const onWalls = standing.filter(o => o.posts && o.T.range);
    const any = standing.filter(o => o.posts);
    const focus = ladders[0] || breach || gate;
    const pickFrom = (onWalls.length ? onWalls : any.length ? any : standing);
    const t = focus ? pickFrom.sort((a, b) => Math.hypot(a.cx - focus.x, a.cz - focus.z) - Math.hypot(b.cx - focus.x, b.cz - focus.z))[0] : nearest(r, pickFrom);
    if (t) battle.orderAttack([r], t);
  }

  if (inside) {
    // A way in: storm it. Fight whoever is on the ground; take the walls from inside via the towers.
    st.stormed = true;
    for (const r of [...foot, ...horse]) {
      if (r.posts) continue;
      const ground = standing.filter(o => !o.posts);
      const t = nearest(r, ground);
      if (t) { if (r.targetReg !== t) battle.orderAttack([r], t); continue; }
      const wallMen = standing.filter(o => o.posts && o.posts[0]);
      const w = nearest(r, wallMen);
      if (w && !r.T.mounted) { const p = w.posts[0]; battle.orderMan([r], p.perch, p.x, p.z); continue; }
      if (!r.dest && insideOf(battle, enemy, r.cx, r.cz) === false) battle.orderMove([r], home.x, home.z, Math.atan2(home.x - r.cx, home.z - r.cz));
    }
    return;
  }

  // No way in yet: foot climb any ladders that are up; the rest wait at the stand-off.
  // While ladders are carried up, two regiments follow close behind to hold them and climb.
  const ladderPieces = [...new Set(ladders.map(l => l.piece))];
  const carried = engines.filter(r => r.engine.kind === 'ladder' && r.targetWall && !r.engine.ladders.length && r.wallPoint);
  let sent = 0, follow = ladderPieces.length ? 0 : 2;
  for (const r of foot) {
    if (r.posts || r.mine) continue;
    if (follow > 0 && carried.length && carried.some(c => dist(c, { cx: c.wallPoint.x, cz: c.wallPoint.z }) < 45) && !r.targetWall && !r.targetReg) {
      const c = carried[follow % carried.length], w = c.wallPoint, home = battle.fortHome(enemy);
      const out = Math.atan2(w.x - home.x, w.z - home.z);
      const spot = { x: w.x + Math.sin(out) * 16, z: w.z + Math.cos(out) * 16 };
      if (Math.hypot(r.cx - spot.x, r.cz - spot.z) > 6 && (!r.dest || Math.hypot(r.dest.x - spot.x, r.dest.z - spot.z) > 6)) battle.orderMove([r], spot.x, spot.z, out + Math.PI);
      follow--;
      continue;
    }
    if (ladderPieces.length && (r.T.key === 'maa' || r.T.key === 'sword' || r.T.key === 'sellsword' || r.T.key === 'household' || r.armour === 'mail' || r.armour === 'plate' || sent < 2)) {
      const l = ladders[sent % ladders.length];
      battle.orderAttackWall([r], l.piece, l.x, l.z);
      sent++;
      continue;
    }
    if (r.targetReg || r.targetWall) continue;
    if (dist(r, { cx: stage.x, cz: stage.z }) > 30 && !r.dest) battle.orderMove([r], stage.x, stage.z, stage.angle);
  }
  // Long sieges with no ram or ladder at work: hack at the gate. Stone-throwers buy
  // time but are slow, so they only make the men wait longer; a gate already
  // battered half down is worth rushing at once.
  st.waited = (st.waited || 0) + 1;
  // Engines that have had two minutes and got nowhere stop holding the men back.
  const working = ladders.length || st.waited < 120 && (rams || climbing && !ladders.length);
  const weak = gate && gate.hp < gate.maxHp * 0.35;
  // Not by hand at a stone gate that still stands while anything else could make a way in:
  // swords barely mark it, and the men die under it. With nothing else left and no mine to dig,
  // the axes are all there is; standing out of bowshot for ever is worse.
  // Two mines broken into is a pattern, not bad luck: the men not digging take the axes too.
  const digging = battle.mines.some(m => m.side === side && !m.done && !m.lost);
  const lostMines = battle.mines.filter(m => m.side === side && m.lost).length;
  const lastResort = stuck && st.waited > 60 && (!digging || lostMines >= 2);
  if (gate && (weak || (!working && st.waited > (throwing ? 60 : 20) && (gate.material !== 'stone' || lastResort)))) {
    if (gate.material === 'stone' && !weak && !st.axes) { st.axes = true; battle.event(side, side ? 'With no ram left, the enemy set about the stone gate with axes.' : 'With no ram left, our men set about the stone gate with axes.'); }
    for (const r of foot) if (!r.posts && !r.mine && r.targetWall !== gate) battle.orderAttackWall([r], gate, gate.x, gate.z);
    // Half a minute on the axes shows how it goes. If the gate wouldn't fall for three minutes more at that rate,
    // bleeding under it is worse than a blockade: draw off out of bowshot and starve them out.
    // (timed from when the first of them is at it, not from the order: the walk up isn't the axes' fault)
    if (st.axes && gate.material === 'stone' && (st.axeFrom || foot.some(r => r.targetWall === gate && Math.hypot(r.cx - gate.x, r.cz - gate.z) < 15))) {
      st.axeFrom ??= { t: battle.time, hp: gate.hp };
      const took = battle.time - st.axeFrom.t, rate = (st.axeFrom.hp - gate.hp) / Math.max(1, took);
      if (took > 30 && gate.hp > rate * 180) {
        st.drawnOff = true;
        for (const r of mine) if (!r.posts) { r.mine = null; battle.orderMove([r], stage.x, stage.z, stage.angle); }
        battle.event(side, side ? 'The stone gate holds against the axes: the enemy draw off out of bowshot to starve the garrison out.' : 'The stone gate holds against our axes: we draw off out of bowshot to starve them out.');
      }
    }
  } else if (stuck && !digging && !st.warned && !battle.regs.some(r => r.side === side && !r.gone && !r.engine && !r.T.mounted && !r.T.range)) {
    // No foot left at all (routed men may rally) and nothing else to break in with: say so, once.
    st.warned = true;
    console.warn('thinkSiegeAttack: no ram, ladder, thrower, mine or foot left to make a way in');
    battle.event(side, side ? 'The enemy has nothing left to break the walls with.' : 'We have nothing left to break the walls with.');
  }
  // Horse guards the engines against sallies, else waits.
  for (const r of horse) {
    const raider = standing.find(o => !o.posts && !insideOf(battle, enemy, o.cx, o.cz) && engines.some(e => dist(e, o) < 50));
    if (raider) { if (r.targetReg !== raider) { battle.orderAttack([r], raider); battle.orderCharge([r]); } continue; }
    if (!r.dest && !r.targetReg && dist(r, { cx: stage.x, cz: stage.z }) > 40) battle.orderMove([r], stage.x - 30, stage.z, stage.angle);
  }
}

// A stretch for ladders: facing us, not a gate, with the fewest defenders on it.
function quietStretch(battle, enemy, army, pieces, gate) {
  const near = pieces.filter(p => !p.gate && p.len > 5);
  if (!near.length) return null;
  const d0 = Math.min(...near.map(p => Math.hypot(p.x - army.cx, p.z - army.cz)));
  const facing = near.filter(p => Math.hypot(p.x - army.cx, p.z - army.cz) < d0 + 40);
  const defenders = p => {
    let n = 0;
    battle.forNear(p.x, p.z, 12, s => { if (s.reg.side === enemy && s.level === 1) n++; });
    return n;
  };
  const taken = new Set(battle.regs.filter(r => r.engine?.kind === 'ladder' && r.targetWall).map(r => r.targetWall));
  return facing.map(p => ({ p, score: defenders(p) * 3 + (taken.has(p) ? 30 : 0) + (gate ? Math.max(0, 25 - Math.hypot(p.x - gate.x, p.z - gate.z)) : 0) + Math.random() * 6 }))
    .sort((a, b) => a.score - b.score)[0].p;
}

// The defending side: bows on the walls and towers facing the enemy, melee on the walls
// near them and in reserve inside the gate; every ladder answered; engines sallied against.
export function thinkSiegeDefence(battle, side, { regs = null } = {}) {
  const W = battle.walls, enemy = 1 - side;
  const mine = (regs || battle.regs.filter(r => r.side === side)).filter(usable);
  const foes = battle.regs.filter(r => r.side === enemy && usable(r));
  if (!mine.length || !foes.length) return;
  const home = battle.fortHome(side);
  const st = battle.defenceAI = battle.defenceAI || {};
  const front = centroid(foes);
  const structs = W.structures().filter(s => s.side === side && s.state === 'up');
  if (!structs.length) return thinkField(battle, side, mine);
  const byNear = (x, z) => [...structs].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const facing = byNear(front.cx, front.cz);

  // Enemies already inside: fight them on the ground.
  const within = foes.filter(o => !o.posts && insideOf(battle, side, o.cx, o.cz));
  const onWalls = foes.filter(o => o.posts);
  const ladders = W.ladders.filter(l => l.side === enemy);

  const shooters = mine.filter(r => r.T.range && !r.engine);
  const melee = mine.filter(r => !r.T.range && !r.engine && !r.T.mounted);
  const horse = mine.filter(r => r.T.mounted);
  const engines = mine.filter(r => r.engine);

  // Bows to the walls facing the enemy, towers first.
  const free = shooters.filter(r => !r.posts);
  if (free.length) {
    const t = facing.find(s => s.kind === 'tower') || facing[0];
    battle.orderMan(free, t, t.x, t.z);
  }
  for (const r of engines) {
    if (r.engine.range && !r.targetReg) { const f = nearest(r, foes.filter(o => o.engine) ) || nearest(r, foes); if (f) battle.orderAttack([r], f); }
  }

  // Melee: enemies inside come first; then each ladder; then half on the walls, half in reserve.
  const reserve = [];
  for (const r of melee) {
    if (within.length) {
      const t = nearest(r, within);
      if (r.targetReg !== t) { if (r.posts) battle.clearPosts(r); battle.orderAttack([r], t); }
      continue;
    }
    if (!r.mine) reserve.push(r);
  }
  if (within.length) { for (const r of horse) { const t = nearest(r, within); if (t && r.targetReg !== t) battle.orderAttack([r], t); } return; }

  // A mine heard under the walls: men from the reserve dig it out from inside.
  const heard = battle.heardMine(side, front.cx, front.cz);
  if (heard && !mine.some(r => r.mine === heard)) {
    const r = reserve.filter(o => !o.posts).sort((a, b) => Math.hypot(a.cx - heard.ix, a.cz - heard.iz) - Math.hypot(b.cx - heard.ix, b.cz - heard.iz))[0] || reserve[0];
    if (r) { battle.orderCounterMine([r], heard); reserve.splice(reserve.indexOf(r), 1); }
  }

  // A man on the walls for every ladder, and a regiment to every stretch the enemy holds.
  const threats = [...ladders.map(l => ({ x: l.x, z: l.z, perch: l.piece })), ...onWalls.map(o => o.posts[0] && { x: o.posts[0].x, z: o.posts[0].z, perch: o.posts[0].perch }).filter(Boolean)];
  for (const t of threats) {
    const covered = mine.some(r => r.posts && !r.T.range && r.posts.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 12));
    if (covered) continue;
    const r = reserve.filter(o => !o.posts).sort((a, b) => Math.hypot(a.cx - t.x, a.cz - t.z) - Math.hypot(b.cx - t.x, b.cz - t.z))[0]
      || reserve.filter(o => o.posts && !o.posts.some(p => threats.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 12)))[0];
    if (r && t.perch.state === 'up') { battle.orderMan([r], t.perch, t.x, t.z); reserve.splice(reserve.indexOf(r), 1); }
  }
  // Breaches: block them from inside with whoever is left in reserve.
  const broken = W.pieces.filter(p => p.side === side && (p.state === 'broken' || p.forced));
  for (const p of broken) {
    const blockers = mine.filter(r => !r.posts && r.dest && Math.hypot(r.dest.x - p.x, r.dest.z - p.z) < 15);
    if (blockers.length) continue;
    const r = reserve.find(o => !o.posts) || reserve[0];
    if (!r) break;
    const dx = home.x - p.x, dz = home.z - p.z, d = Math.hypot(dx, dz) || 1;
    battle.orderMove([r], p.x + dx / d * 8, p.z + dz / d * 8, Math.atan2(-dx, -dz));
    reserve.splice(reserve.indexOf(r), 1);
  }
  // Keep half the reserve on the walls facing the enemy, the rest inside the nearest gate.
  const gate = W.pieces.filter(p => p.side === side && p.gate && p.state === 'up').sort((a, b) => Math.hypot(a.x - front.cx, a.z - front.cz) - Math.hypot(b.x - front.cx, b.z - front.cz))[0];
  reserve.forEach((r, i) => {
    if (r.posts || r.dest || r.targetReg || r.mine) return;
    if (i % 2 === 0) {
      const t = facing.find(s => s.kind === 'piece') || facing[0];
      battle.orderMan([r], t, t.x, t.z);
    } else if (gate) {
      const dx = home.x - gate.x, dz = home.z - gate.z, d = Math.hypot(dx, dz) || 1;
      battle.orderMove([r], gate.x + dx / d * 14, gate.z + dz / d * 14, Math.atan2(-dx, -dz));
    }
  });

  // Sally: horse out of the gate against an engine with few guards near it. At night,
  // unseen until close, they dare more, and spare foot go too.
  const night = battle.weather === 'night';
  const raiders = horse.length ? horse : night ? reserve.filter(r => !r.posts).slice(0, 1) : [];
  const engs = foes.filter(o => o.engine && !o.engine.wrecked);
  const target = engs.find(e => {
    let guards = 0;
    for (const o of foes) if (!o.engine && dist(o, e) < 35) guards += o.alive;
    return guards < e.alive * (night ? 5 : 2) && Math.hypot(e.cx - home.x, e.cz - home.z) < wallRadius(battle, side) + (night ? 220 : 160);
  });
  for (const r of raiders) {
    if (target && gate) {
      if (r.targetReg !== target) { battle.orderAttack([r], target); battle.orderCharge([r]); st.sally = battle.time; }
    } else if (r.targetReg && !insideOf(battle, side, r.cx, r.cz) && (!target || battle.time - (st.sally || 0) > 60)) {
      // Back inside once the work is done.
      battle.orderMove([r], home.x, home.z + (side === 0 ? 1 : -1) * 10, 0);
    }
  }
}

// For a village under attack: the hosts flagged ai = 'siege' work the walls; once they
// are inside, the town's own raid and assault logic takes them back. Call once a second.
export function thinkTownSiege(town) {
  const b = town.battle, W = b.walls;
  // Every defender dead or gone and an assault still at the walls: the last of the people open the
  // gates. Without this a host with no way through stone walls stood outside for good, the place
  // empty and never taken (the league host at Ashley Castle: its ram lost, 1,000 s idle). Once a second.
  const assault = town.attackers.some(g => !g.leaving && (g.mode === 'assault' || g.mode === 'siege') && g.regs.some(r => usable(r)));
  if (assault && !town.lost && !b.regs.some(r => r.side === 0 && !r.gone && r.alive > 0)) {
    town.emptyFor = (town.emptyFor || 0) + 1;
    if (town.emptyFor >= 15) { town.event('Nobody is left to hold the walls: the gates are opened to the enemy.', 1); town.ruin(town.keep); return; }
  } else town.emptyFor = 0;
  if (!W.structures().some(s => s.side === 0 && s.state === 'up')) {
    for (const g of town.attackers) for (const r of g.regs) if (r.ai === 'siege' && !r.engine) r.ai = null;
    return;
  }
  for (const g of town.attackers) {
    if (g.leaving) continue;
    const regs = g.regs.filter(r => usable(r));
    if (!regs.length) continue;
    // Engines always stay under siege orders; the rest until there is a way in, each for itself:
    // a regiment still shut out while the rest are through keeps working the walls.
    const open = W.pieces.some(p => p.side === 0 && (p.state === 'broken' || p.forced));
    for (const r of regs) r.ai = r.engine || !(open && b.nav.reachable(1, r.cx, r.cz, 0, 0)) ? 'siege' : null;
    const siege = regs.filter(r => r.ai === 'siege');
    if (siege.length) thinkSiegeAttack(b, 1, { regs: siege, prepare: g.mode === 'siege' });
  }
}
