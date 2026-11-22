// The rival houses' minds. Each lord has a bent (raider, builder, turtler, schemer,
// merchant, hothead) that sets how soon they go to war and how they fight one.
//
// Every house climbs three stages (STAGES): Settling, when it builds up, clears outlaws and
// takes the free villages next door; Expanding, when it reaches further out, raids its
// weakest neighbour and strikes where a place is weakly held; and Contending, when it plays
// to win from where it stands: it goes for its enemies' places, joins leagues, besieges seats and
// pushes for Kingsbridge. A house moves up with time (sooner for hot-blooded lords, later
// for builders and turtlers, and by the campaign's Rivals option).
//
// A war builds up the way the creator wants: first raiding parties probe the enemy's
// villages, then the house gathers a great host at its nearest place (and the enemy
// hears of it), then the host marches with rams and ladders and lays siege.
import { FACTIONS, grace, fierceness, power, headcount, takeUnits, mergeInto, dist, recruit, roughly, unit } from './world.js';
import { protectedFrom, leagued, leagueHost, wantsBack, grudgeWeight, wouldJoin, callToArms } from './diplomacy.js';
import { rivalHire } from './companies.js';
import { standDown, keepAtWork, pressedAt } from './holdings.js';
import { houseRuns } from './supply.js';
import { TYPES } from '../battle.js';

export const STAGES = ['Settling', 'Expanding', 'Contending'];
const STAGE_AT = [1200, 2400];        // seconds into the campaign, before pace
const PACE = { hothead: 0.75, raider: 0.75, schemer: 1, merchant: 1, builder: 1.3, turtler: 1.3 };
const NEXT_DOOR = 420;                // a settling house reaches only this far by road
export const stageOf = h => (h.invader ? 2 : h.ai?.stage ?? 0);

const BENT = {
  raider:   { probe: 100, raidCd: 55,  war: 1.3, need: 1.4 },
  hothead:  { probe: 70,  raidCd: 85,  war: 1.5, need: 1.2 },
  schemer:  { probe: 160, raidCd: 110, war: 0.9, need: 1.6 },
  merchant: { probe: 170, raidCd: 125, war: 0.8, need: 1.5 },
  builder:  { probe: 240, raidCd: 160, war: 0.55, need: 1.7 },
  turtler:  { probe: 220, raidCd: 170, war: 0.5, need: 1.8 },
  invader:  { probe: 50,  raidCd: 32,  war: 2,   need: 1.15 },
};
// The north: a fresh host comes through the gate every few minutes while they hold it,
// each bigger than the last and sized against your own strength.
const TIDE = { first: 100, every: 200 };
const bent = h => BENT[h.trait] || BENT.schemer;

// Moves a house up a stage when its time comes. It never goes back down. (It used to move
// up early once you were nearly as strong as it, a rubber band, cut 2026-11-21: the creator
// wants houses to grow by the same rules as you, so a gap compounds.)
function climb(w, h) {
  const ai = h.ai;
  if (h.invader) { ai.stage = 2; return; }
  const k = (PACE[h.trait] ?? 1) * fierceness(w).stage;
  let s = w.time >= STAGE_AT[1] * k ? 2 : w.time >= STAGE_AT[0] * k ? 1 : 0;
  // A campaign saved before the stages: the house takes its stage quietly.
  if (ai.stage === undefined) { ai.stage = s; return; }
  if (s <= ai.stage) return;
  ai.stage = s;
  ai.stageAt = w.time;
  if (!w.knows(h.index)) return;
  if (s === 1) w.log(`${h.name} is reaching beyond its own lands. Its lord has an eye on the free villages further out, and on weak neighbours.`, 2);
  else {
    w.log(`${h.lord} means to win the realm. ${h.name} will reach further for its wars, and for Kingsbridge.`, 1);
    w.hooks.herald?.({ house: h, title: `${h.name} reaches for the crown`, text: `${h.lord} has stopped building and begun to conquer. Expect ${h.name} to press its wars, to look to its weaker and richer neighbours, and to make for Kingsbridge.` });
  }
}
const THINK = 8;
const SETTLED_RESERVE = 30;           // men a settling house keeps in the field at most
const GROW = [1500, 900, 240];        // seconds a house rests after taking a free village, by stage

export function startHouseMinds(w) {
  for (const h of FACTIONS) startMind(w, h);
}

export function startMind(w, h) {
  h.ai = { stage: h.invader ? 2 : 0, think: 20 + h.index * 3, plan: null, cool: h.invader ? 20 : 60, raidCd: h.invader ? 40 : 120 + w.rand() * 80, warClock: 240 + w.rand() * 240, warsSince: {}, tide: TIDE.first, wave: 0 };
}

export function thinkHouses(w, dt) {
  for (const h of FACTIONS) {
    if (h.index === 0 || !h.alive) continue;
    h.ai.think -= dt;
    if (h.ai.think > 0) continue;
    h.ai.think = THINK;
    if (h.bandit) { banditMind(w, h); outlawMind(w, h); }
    else if (h.invader) invaderMind(w, h);
    else houseMind(w, h);
  }
}

const held = (w, h) => w.pois.filter(p => p.owner === h.index);
const spareAt = (w, p) => power(p.garrison) - w.keepHome(p);

// The men a house could put in the field: those its places can spare, and as many more as it
// has both kit for and people it could draft now, above the floor World.raiseFromPeople keeps.
// Kit in the stores is not men (Orchestrator, 2026-11-21: it was counted as men, so a house
// with 218 sets of kit and 63 men to spare thought it had 281).
export function fieldOf(w, h, mine = held(w, h)) {
  const spare = mine.reduce((n, p) => n + Math.max(0, spareAt(w, p)), 0);
  const draft = mine.reduce((n, p) => n + (!p.eco ? 0 : Math.max(0, p.eco.pop - (p.eco.buildings ? keepAtWork(p.eco, pressedAt(h, p)) : pressedAt(h, p) ? 12 : w.popCap(p) * 0.45))), 0);
  return spare + Math.min(Math.max(0, h.arms), draft);
}
// The men a house has tied up in the wars it is in: enemy hosts within a march of its places,
// which it must answer, and the host it is gathering against an enemy's place.
function committed(w, h, mine, B) {
  let n = 0;
  for (const a of w.armies) if (!a.gone && !a.wagon && a.side != null && a.side !== h.index && a.side !== w.bandits && w.atWar(h.index, a.side) && mine.some(p => dist(a, p) < 400)) n += headcount(a.units);
  const P = h.ai.plan, T = P?.target;
  if (T && P.phase !== 'march' && T.owner !== null && T.owner !== w.bandits) n += w.defence(T) * B.need + 20;
  return n;
}

// The house's own place nearest to `target` by road.
function nearestOwn(w, h, target) {
  let best = null, bd = Infinity;
  for (const p of held(w, h)) {
    const d = p === target ? 0 : w.route(p, target).length;
    if (d < bd) { bd = d; best = p; }
  }
  return { place: best, length: bd };
}

// Build up or arm and march (creator, 2026-11-21: "make NPCs choose between econ and war
// the same way the player does"), from what a player would read: the house's temper, the
// wars it is in, enemies near its lands, something weak in reach, and its larder. Men under
// arms are people taken from work, eat from the stores and, if elite, draw wages, so a
// house that arms grows less and one that builds is weaker in the field.
export const STANCE = { war: 'is arming', build: 'is building' };
const LEAN = { raider: 0.6, hothead: 0.5, schemer: 0.1, merchant: -0.3, builder: -0.4, turtler: -0.2, invader: 2 };
// Ambition (Orchestrator, 2026-11-21, after M&B and Pendor): a lord at peace with full stores
// and nothing left to settle goes looking for land. Past its first stage, from the moment no
// free place is in reach, nobody goes hungry and its places are manned, a house leans toward
// arming, a point every AMBITION seconds up to AMBITION_MAX: raiders and hotheads soon,
// schemers and steady turtlers later, merchants and builders slowly, but not never (even a
// thin larder's lean against war, stanceScore, is overcome in time).
const AMBITION = { raider: 300, hothead: 300, schemer: 600, turtler: 600, merchant: 1100, builder: 1100 };
const AMBITION_MAX = 2.5;
export const ambitionOf = (temper, idle) => Math.min(AMBITION_MAX, Math.max(0, idle) / (AMBITION[temper] ?? 600));
export function stanceScore({ temper, wars, threat, prey, larder, stage, ambition = 0 }) {
  return (LEAN[temper] ?? 0) + (wars ? 0.5 : 0) + (threat ? 1 : 0) + (prey ? 0.5 : 0) - (larder < 3 ? 0.8 : 0) - (stage === 0 ? 0.3 : 0) + ambition;
}
function chooseStance(w, h, B, stage, mine) {
  const wars = FACTIONS.some(o => o !== h && o.alive && !o.bandit && w.atWar(h.index, o.index));
  const threat = w.armies.some(a => !a.gone && !a.wagon && a.side !== h.index && a.side !== w.bandits && w.atWar(h.index, a.side) && mine.some(p => dist(a, p) < 300));
  // Something weak in reach: a free place or an enemy's, held by fewer than the house could put in the field.
  const field = fieldOf(w, h, mine);
  const prey = w.pois.some(p => p.owner !== h.index && p.owner !== w.bandits && (p.owner === null || w.atWar(h.index, p.owner)) && w.canAttack(h.index, p)
    && mine.some(q => dist(p, q) < 600) && w.defence(p) * B.need + 20 < field);
  const eco = mine.filter(p => p.eco?.buildings), mouths = eco.reduce((n, p) => n + p.eco.pop + headcount(p.garrison), 0);
  const larder = eco.reduce((n, p) => n + (p.eco.stock.food || 0) + (p.eco.stock.bread || 0), 0) / Math.max(1, mouths);
  // Nothing left to settle: no free place in reach it could hope to take with the men it has
  // to spare (twice them; kit in the stores is not men, and not Kingsbridge, a prize of its
  // own), nobody hungry, or stores enough to feed them, and its places at least half manned.
  const men = mine.reduce((n, p) => n + Math.max(0, spareAt(w, p)), 0);
  const free = w.pois.some(p => p.owner === null && p.kind !== 'camp' && p.kind !== 'crown' && w.canAttack(h.index, p) && mine.some(q => dist(p, q) < 600) && w.defence(p) * B.need + 20 < men * 2);
  const fed = larder >= 3 || !eco.some(p => p.eco.hungry);
  const manned = mine.reduce((n, p) => n + headcount(p.garrison), 0) >= mine.reduce((n, p) => n + w.keepHome(p), 0) * 0.5;
  const idle = stage > 0 && !free && fed && manned;
  // A hungry spell or a free place in reach wears ambition down, twice as fast as it grew.
  const since = h.ai.idleSince;
  h.ai.idleSince = idle ? since ?? w.time : since != null && since + 3 * THINK < w.time ? since + 3 * THINK : null;
  const ambition = h.ai.idleSince != null ? ambitionOf(h.trait, w.time - h.ai.idleSince) : 0;
  const score = stanceScore({ temper: h.trait, wars, threat, prey, larder, stage, ambition });
  return score > (h.ai.stance === 'war' ? 0.2 : 0.5) ? 'war' : 'build';
}

function houseMind(w, h) {
  const mine = held(w, h);
  if (!mine.length) return;
  const B = bent(h), ai = h.ai, plan = ai.plan;
  ai.cool -= THINK;
  climb(w, h);
  const stage = stageOf(h);
  if (!h.seat || h.seat.owner !== h.index) h.seat = mine[0];
  const muster = plan?.staging?.owner === h.index ? plan.staging : h.seat;

  // Build up or arm, as you choose (chooseStance). Arming, it raises men at the muster place
  // while the people can spare them; building, it keeps a modest field reserve and sends men
  // beyond it home to work, with their weapons back in the stores.
  ai.stance = chooseStance(w, h, B, stage, mine);
  // How deep it drafts (holdings.js keepAtWork): its places with an enemy host, outlaws aside,
  // within 400 (a border alone is no danger until an army shows up, as you would read it:
  // Orchestrator, 2026-11-21); and a muster still short of what its target needs, which draws
  // deeper from the places nearest the target, as many as it is short.
  const foe = s => s != null && s !== h.index && s !== w.bandits && w.atWar(h.index, s);
  const foeHosts = w.armies.filter(a => !a.gone && !a.wagon && foe(a.side));
  ai.pressed = mine.filter(p => foeHosts.some(a => dist(p, a) < 400)).map(p => p.id);
  ai.muster = plan?.phase === 'muster' && plan.staging?.owner === h.index
    ? { at: plan.target.id, from: plan.staging.id, short: Math.max(0, Math.ceil(w.defence(plan.target) * B.need + 20 - spareAt(w, plan.staging))) } : null;
  // Its rear: places with no enemy place or army within a short march (World.keepHome).
  const foes = w.pois.filter(p => p.owner !== null && p.owner !== h.index && w.atWar(h.index, p.owner));
  const hosts = w.armies.filter(a => !a.gone && !a.wagon && a.side !== h.index && w.atWar(h.index, a.side));
  ai.rear = mine.filter(p => !foes.some(q => dist(p, q) < 400) && !hosts.some(a => dist(p, a) < 400)).map(p => p.id);
  const arming = ai.stance === 'war';
  if (h.arms >= 6 && (arming || spareAt(w, muster) < SETTLED_RESERVE) && w.raiseFromPeople(h, muster, Math.min(12, Math.floor(h.arms)))) ai.raisedAt = w.time;
  // Building with nothing planned; or places it drafted deep stand hollow, the threat gone and
  // no muster holding the men.
  const hollow = mine.some(p => p.eco?.buildings && !p.town && !pressedAt(h, p) && p.eco.pop < keepAtWork(p.eco, false) - 6);
  if ((!arming && !plan || hollow && plan?.phase !== 'muster') && muster.eco?.buildings) {
    const over = headcount(muster.garrison) - (w.keepHome(muster) + SETTLED_RESERVE);
    if (over > 0) standDown(muster.eco, muster.garrison, Math.min(over, 6), mine.filter(p => p.eco?.buildings && !p.town));
  }

  // Food, and kit for an unarmed guard, from its fullest larder to its emptiest (supply.js).
  houseRuns(w, h);

  // A rich lord at war hires a mercenary company rather than sit on his gold, and pays
  // its wages from then on (companies.js). Not while the house is still settling.
  if (!h.bandit && stage > 0 && w.time > (ai.hiredAt ?? -Infinity) + 300 && rivalHire(w, h, muster)) ai.hiredAt = w.time;

  // Send men beyond what each place keeps at home to the muster place.
  for (const p of mine) {
    if (p === muster || headcount(p.garrison) < w.keepHome(p) * (stage === 2 ? 1.1 : 1.3) + 8) continue;
    if (w.armies.some(a => a.side === h.index && a.mode === 'column' && a.last === p && !a.at)) continue;
    const extra = takeUnits(p.garrison, spareAt(w, p) - 6);
    if (!extra.length) continue;
    const col = w.spawnArmy(h.index, extra, p, `${h.short} column`, 'column');
    if (!w.order(col, muster)) { w.removeArmy(col); for (const u of extra) p.garrison.push(u); }
  }

  thinkWars(w, h, B, stage);
  if (stage > 0 && arming) warRaids(w, h, B, plan);

  // Drop a plan whose target is ours now, or no longer an enemy.
  if (plan && (plan.target.owner === h.index || !w.canAttack(h.index, plan.target))) {
    if (plan.host && !plan.host.gone && plan.host.side === h.index && !plan.host.retreating) w.retreat(plan.host);
    // A free village taken: the house settles it before reaching for the next.
    ai.cool = plan.free && plan.target.owner === h.index ? GROW[stage] * (0.8 + w.rand() * 0.4) : 40;
    ai.plan = null;
    return;
  }
  if (!ai.plan) {
    // Building, a house takes only what it can win with the men it has (free places and
    // outlaw camps); a war on a house is for when it arms.
    if (ai.cool <= 0) ai.plan = choosePlan(w, h, B, stage, arming);
    return;
  }
  runPlan(w, h, B, ai.plan);
}

// Go to war with a neighbour now and then, more often for hot-blooded lords. Wars
// between rivals burn out after a while; wars with you last until diplomacy ends them.
function thinkWars(w, h, B, stage) {
  const ai = h.ai;
  if (h.invader) return;   // at war with everyone, always
  ai.warClock -= THINK;
  const enemies = FACTIONS.filter(o => !o.bandit && o.alive && o !== h && w.atWar(h.index, o.index));
  for (const o of enemies) {
    if (o.index === 0) continue;
    const since = ai.warsSince[o.index] ?? (ai.warsSince[o.index] = w.time);
    if (w.time - since > 900 && w.rand() < 0.04) { w.makePeace(h.index, o.index); delete ai.warsSince[o.index]; delete FACTIONS[o.index].ai.warsSince[h.index]; }
  }
  if (ai.warClock > 0 || ai.stance !== 'war') return;
  ai.warClock = (260 + w.rand() * 220) / B.war;
  // A settling house makes no wars. (An expanding one made one at a time and a contending
  // one two at most, a cap only the houses had, cut 2026-11-21: now a house in a war takes on
  // another only when it has the men for it, below.)
  if (stage === 0) return;
  // Prey (Orchestrator, 2026-11-21): the same inputs for every target, the player too: a
  // border, weakness, worth and claims, never who leads. Each neighbour's places within reach
  // of ours (further once the house contends) are weighed by the men the house could field
  // against the men and walls there, by what the place is worth, by a claim on it, and, for
  // any side, by a lord's grudge against it; a full purse draws any house, and a neighbour holding more places
  // than it does is a threat as well as a prize (the league's reason, diplomacy.js
  // leagueReason). The best place names the war.
  const mine = held(w, h), reach = stage === 2 ? 700 : 420;
  const count = i => w.pois.filter(p => p.owner === i && p.kind !== 'camp').length, own = count(h.index), bigger = {};
  const field = fieldOf(w, h, mine);
  const best = new Map();
  for (const p of w.pois) {
    const i = p.owner;
    if (i === null || i === h.index || i === w.bandits || !FACTIONS[i].alive || p.kind === 'camp' || w.atWar(h.index, i)) continue;
    if ((leagued(w, h.index) && leagued(w, i)) || (i === 0 && protectedFrom(w, 0, h.index)) || (FACTIONS[i].vassalOf === 0 && w.dip[h.index].opinion > -20)) continue;
    if (!mine.some(q => dist(p, q) < reach)) continue;
    bigger[i] ??= count(i) > own;
    const score = preyScore(w, h, B, p, field) * (1 + Math.min(0.5, grudgeWeight(w, h, i) / 40)) * (FACTIONS[i].gold > 5000 ? 1.2 : 1) * (bigger[i] ? THREAT : 1);
    if (score > (best.get(i)?.score ?? 0)) best.set(i, { i, p, score });
  }
  // The odds (creator, 2026-11-21: "declare war if it thinks it can win, but it's okay if it's
  // pretty even; aggressive at times, never suicidal"): the men it has free, its field less
  // what its wars already tie up, against what holds the place, its men and walls. It goes to
  // war where it expects to win or the odds are about even, the line set by its temper (a
  // raider takes somewhat worse than even, a merchant or turtler wants a clear edge); now and
  // then, rarely and by temper, on a long shot, but never a hopeless one. Of those, the best
  // prize names the war. The same for you as for any house.
  const free = field - committed(w, h, mine, B);
  const worth = [...best.values()].filter(o => o.score * B.war > PREY_BAR).map(o => ({ ...o, odds: oddsAt(w, free, o.p) })).sort((a, b) => b.score - a.score);
  const line = ODDS.line[h.trait] ?? 1;
  let pick = worth.find(o => o.odds >= line), kind = pick && (pick.odds >= ODDS.win ? 'win' : 'even');
  if (!pick && w.rand() < (ODDS.bold[h.trait] ?? 0.03)) { pick = worth.find(o => o.odds >= ODDS.longShot); kind = 'bold'; }
  if (pick && (kind === 'bold' || w.rand() < 0.7)) {
    w.declareWar(h.index, pick.i, false, oddsLine(h, kind, pick.odds));
    ai.warsSince[pick.i] = w.time;
    w.hooks.war?.({ by: h.index, on: pick.i, kind, odds: pick.odds, at: w.time });
    return;
  }
  if (!pick) cornered(w, h, mine, free, own, count);
}

// Odds of winning a place (thinkWars): free men against its men and walls, so 1 is even.
export const ODDS = {
  line: { raider: 0.8, hothead: 0.8, schemer: 1, merchant: 1.3, builder: 1.2, turtler: 1.3 },
  bold: { raider: 0.1, hothead: 0.12, schemer: 0.04, merchant: 0.02, builder: 0.02, turtler: 0.02 },
  win: 1.25,         // better than this, it expects to win
  longShot: 0.5,     // worse than this is hopeless, and no house goes
  hope: 0.5,         // a cornered house goes only with this much, allies counted
  call: 600,         // seconds its call to arms stands
  again: 900,        // before a cornered house calls again
};
const oddsAt = (w, free, p) => Math.max(0, free) / (w.defence(p) + 20);
const ratio = r => (r >= 1 ? `${(Math.round(r * 2) / 2).toFixed(1).replace('.0', '')} to 1` : `1 to ${(Math.round(2 / Math.max(0.01, r)) / 2).toFixed(1).replace('.0', '')}`);
function oddsLine(h, kind, r) {
  if (kind === 'win') return `${h.lord} reckons on winning, at about ${ratio(r)}.`;
  if (kind === 'even') return `${h.lord} reckons the odds about even.`;
  if (kind === 'bold') return `${h.lord} takes a long shot, at about ${ratio(r)}.`;
  return '';
}

// Cornered (creator, 2026-11-21: "an AI cornered, out of options, declares war and tries to
// get allies to join it"): with no war worth making, a house squeezed by a bigger neighbour,
// one holding half as many places again on its border that has wronged it (a place taken, a
// claim) or has a host at its places, makes a desperate war on it and calls the other houses
// to arms against it (diplomacy.js callToArms, a reason formLeagues weighs). Not suicidal: only
// when its own odds, with the men of the houses that would answer, give it some hope.
function cornered(w, h, mine, free, own, count) {
  const ai = h.ai;
  if (w.time < (ai.calledAt ?? -Infinity) + ODDS.again) return false;
  const near = (i, d) => w.pois.some(p => p.owner === i && p.kind !== 'camp' && mine.some(q => dist(p, q) < d));
  const hosts = i => w.armies.some(a => a.side === i && !a.gone && !a.wagon && mine.some(p => dist(a, p) < 400));
  const R = FACTIONS.filter(o => o !== h && o.alive && !o.bandit && !o.invader && count(o.index) >= own * 1.5 && near(o.index, 420)
    && !(o.index === 0 && protectedFrom(w, 0, h.index)) && (grudgeWeight(w, h, o.index) > 0 || hosts(o.index)))
    .sort((a, b) => count(b.index) - count(a.index))[0];
  if (!R) return false;
  const target = w.pois.filter(p => p.owner === R.index && p.kind !== 'camp').sort((a, b) => Math.min(...mine.map(q => dist(a, q))) - Math.min(...mine.map(q => dist(b, q))))[0];
  const allies = FACTIONS.filter(o => o !== h && o !== R && o.alive && !o.bandit && !o.invader && o.index !== 0 && wouldJoin(w, o, R.index));
  const hope = oddsAt(w, free + allies.reduce((n, o) => n + fieldOf(w, o), 0), target);
  if (hope < ODDS.hope) return false;
  ai.calledAt = w.time;
  if (!w.atWar(h.index, R.index)) {
    w.declareWar(h.index, R.index, false, `Hard pressed by ${R.index === 0 ? 'you' : R.name}, ${h.lord} calls on the other houses to join the fight.`);
    ai.warsSince[R.index] = w.time;
  }
  callToArms(w, h, R, ODDS.call);
  w.hooks.war?.({ by: h.index, on: R.index, kind: 'cornered', odds: oddsAt(w, free, target), hope, allies: allies.length, at: w.time });
  return true;
}

// How tempting a place is: the men the house could field against what it would take to win
// it (its men and walls, as World.defence), times its worth, times a claim (a place the lord
// wants back). Worth goes with its people, who pay the taxes and fill the levies: a town of
// two hundred is worth four villages of fifty (a seat and Kingsbridge a little more).
const PREY_BAR = 0.6, THREAT = 1.6;
function preyScore(w, h, B, p, field) {
  const weak = field / (w.defence(p) * B.need + 20);
  const people = p.town ? p.town.population : p.eco?.pop ?? 0;
  const worth = Math.min(5, (people + 10) / 60) * (p.seat !== undefined ? 1.3 : 1) * (p.kind === 'crown' ? 1.5 : 1);
  return weak * worth * (wantsBack(w, h, p) ? 1.5 : 1);
}

// Raiders against an enemy the plan is not about, so a war is felt even while the house's
// host is busy elsewhere (creator, 2026-11-21: two houses at war with you from minute 24
// and 45 sent nothing, as every plan went for a free village). You first, if you are a foe.
function warRaids(w, h, B, plan) {
  const ai = h.ai, aim = plan?.target.owner;
  const foes = FACTIONS.filter(o => o !== h && o.alive && !o.bandit && o.index !== aim && w.atWar(h.index, o.index))
    .sort((a, b) => (a.index === 0 ? -1 : b.index === 0 ? 1 : 0));
  if (!foes.length) return;
  ai.warRaidCd = (ai.warRaidCd ?? B.raidCd) - THINK;
  if (ai.warRaidCd > 0) return;
  ai.warRaidCd = B.raidCd * 1.5 * (0.8 + w.rand() * 0.4);
  // From whichever place has men to spare (sendRaid finds a mark within a day's march).
  const froms = held(w, h).filter(p => spareAt(w, p) >= 28).sort((a, b) => spareAt(w, b) - spareAt(w, a));
  for (const o of foes) for (const from of froms) if (sendRaid(w, h, { target: { owner: o.index }, staging: from, raids: 0 })) return;
}

// What a house goes for next. Settling: free villages next door and outlaw camps, and only
// raids on an enemy. Expanding: free villages further out, and an enemy's place only where
// it is weakly held. Contending: anything, an enemy's places and Kingsbridge first.
function choosePlan(w, h, B, stage, arming = true) {
  const options = [], ours = w.strength(h.index);
  let skirmish = null;
  for (const p of w.pois) {
    if (!w.canAttack(h.index, p) || h.ai.passed?.[p.id] > w.time) continue;
    const enemy = p.owner !== null && p.owner !== w.bandits;
    if (enemy && !arming) continue;
    if (p.owner === 0 && stage === 0) { if (!protectedFrom(w, 0, h.index)) skirmish ??= p; continue; }
    // The free villages around your start are yours to win first, for the first twenty
    // minutes. Kept when the rubber bands were cut (Orchestrator, 2026-11-21): it is a fixed
    // opening, the same every game, not something that adapts to how you are doing, and the
    // sims put the point of no return at minute 20 to 30, so without it there is no climb.
    if (p.owner === null && w.time < grace(w) && w.byId.ashford && dist(p, w.byId.ashford) < 260) continue;
    const from = nearestOwn(w, h, p);
    if (!from.place || from.length > (stage === 0 && p.owner === null ? NEXT_DOOR : 900)) continue;
    const def = w.defence(p);
    if (enemy && stage === 0) { if (!skirmish || from.length < 600) skirmish = p; continue; }
    if (enemy && stage === 1 && (def > ours * 0.25 || p.seat !== undefined || p.kind === 'crown')) { skirmish ??= p; continue; }
    // Free villages and bandit camps are easy pickings; enemy places are a war aim.
    let prize = p.kind === 'crown' ? (stage === 2 ? 0.45 : 0.7) : p.seat !== undefined ? 0.8 : 1;
    if (h.invader && p.owner === 0) prize *= 0.6;   // the north comes for the king first
    if (p.owner === 0 && leagued(w, h.index)) prize *= 0.7;   // a coalition is about you
    if (wantsBack(w, h, p)) prize *= 0.6;    // and a lord wants back what was taken from him
    if (enemy && stage === 2) prize *= 0.6;   // a war is fought for, yours or a house's
    options.push({ p, staging: from.place, score: (def + from.length * 0.15) * prize });
  }
  // Nothing to take: a house at war with a place it can't yet take only skirmishes there.
  if (!options.length) {
    if (!skirmish) return null;
    const from = nearestOwn(w, h, skirmish);
    return from.place ? { target: skirmish, staging: from.place, phase: 'probe', t: B.probe, waited: 0, host: null, raids: 0, skirmish: true } : null;
  }
  options.sort((a, b) => a.score - b.score);
  const o = options[0];
  const war = o.p.owner !== null && o.p.owner !== w.bandits;
  return { target: o.p, staging: o.staging, phase: war ? 'probe' : 'muster', t: war ? B.probe : 0, waited: 0, host: null, raids: 0, free: o.p.owner === null };
}

function runPlan(w, h, B, plan) {
  const ai = h.ai, T = plan.target;
  if (plan.phase === 'probe') {
    plan.t -= THINK;
    ai.raidCd -= THINK;
    if (ai.raidCd <= 0) {
      ai.raidCd = B.raidCd * (0.8 + w.rand() * 0.4);
      sendRaid(w, h, plan);
    }
    if (plan.t <= 0) {
      // A skirmish ends with its raids: the house thinks again.
      if (plan.skirmish) { ai.plan = null; ai.cool = 60; return; }
      plan.phase = 'muster';
      plan.staging = nearestOwn(w, h, T).place || h.seat;
      if (T.owner === 0 && !(leagued(w, h.index) && leagueHost(w))) {
        w.log(`Scouts report that ${h.lord} is gathering a host at ${plan.staging.name}. They mean to march on ${T.name}.`, 1);
        w.meet(h.index);
        w.hooks.herald?.({ house: h, title: `${h.name} gathers a host`, text: `At ${plan.staging.name}, against ${T.name}. Strike their raiders and their muster before it marches, or make ready your walls.` });
      }
    }
    return;
  }
  if (plan.phase === 'muster') {
    plan.waited += THINK;
    // Raiders keep the enemy busy while the host gathers, but less often.
    ai.raidCd -= THINK * 0.5;
    if (ai.raidCd <= 0 && T.owner !== null && T.owner !== w.bandits) { ai.raidCd = B.raidCd * 1.5; sendRaid(w, h, plan); }
    const S = plan.staging;
    if (!S || S.owner !== h.index) { plan.staging = nearestOwn(w, h, T).place; return; }
    // A house in a league against you sends its men to the league's one host, not its own.
    if (T.owner === 0 && leagued(w, h.index) && leagueHost(w)) return;
    const need = w.defence(T) * B.need + 20, spare = spareAt(w, S);
    // A house whose lord has just fallen mourns before it marches again (world/captains.js).
    const ready = (h.mourning ?? 0) < w.time && (spare >= need || (plan.waited > 420 && spare >= w.defence(T) * 1.1));
    plan.seen = { ready, at: w.time };   // what it saw at this think (musterProblems)
    if (!ready) {
      // Given up: it looks elsewhere for a while, not straight back at the same place.
      if (plan.waited > 600) { (h.ai.passed ||= {})[T.id] = w.time + 900; h.ai.plan = null; h.ai.cool = 90; }
      return;
    }
    // A contending house marches with most of what it has, not just enough to win: its
    // hosts are the realm's danger (creator, 2026-11-21: hosts of 20 men).
    const want = stageOf(h) === 2 ? Math.max(need * 1.15, spare * 0.75) : need * 1.15;
    // Men it can't take out or a host with no road: it looks elsewhere, as when it gives up.
    const pass = () => { (h.ai.passed ||= {})[T.id] = w.time + 900; h.ai.plan = null; h.ai.cool = 90; };
    const units = takeUnits(S.garrison, Math.min(spare, want));
    if (!units.length) { pass(); return; }
    const besiege = T.owner === 0;
    if (besiege) for (const [key, count] of siegeTrain(w, h)) units.push({ key, count, name: `${h.short} ${TYPES[key].name.toLowerCase()}` });
    const host = w.spawnArmy(h.index, units, S, `The ${h.short} host`, besiege ? 'siege' : 'assault');
    // No road after all: the men go back into the garrison (they used to vanish with the host).
    if (!w.order(host, T)) { w.removeArmy(host); mergeInto(S.garrison, host.units.filter(u => !TYPES[u.key]?.engine)); pass(); return; }
    plan.phase = 'march';
    plan.host = host;
    // Word of a host on the march: as big as rumour makes it, not the true count.
    if (T.owner === 0 || S.visible) w.log(`${host.name} marches from ${S.name} on ${T.name}: about ${roughly(headcount(host.units))} men, they say.`, T.owner === 0 ? 1 : 2);
    return;
  }
  if (plan.phase === 'march') {
    if (plan.host.gone || plan.host.retreating || (plan.host.at && plan.host.at !== T)) {
      h.ai.plan = null;
      h.ai.cool = 120;
    }
  }
}

// Rams and ladders for any siege; engines for great houses later on.
function siegeTrain(w, h) {
  const out = [];
  if (TYPES.ram) out.push(['ram', 8]);
  if (TYPES.ladder) out.push(['ladder', 12]);
  if (w.time > 1500 && TYPES.mangonel) out.push(['mangonel', 6]);
  if (w.time > 2400 && TYPES.trebuchet && (h.trait === 'turtler' || h.trait === 'builder')) out.push(['trebuchet', 8]);
  return out;
}

// A small party to burn and steal from one of the enemy's places near the target.
function sendRaid(w, h, plan) {
  const from = plan.staging && plan.staging.owner === h.index ? plan.staging : nearestOwn(w, h, plan.target).place;
  if (!from) return;
  const foe = plan.target.owner;
  const marks = w.pois.filter(p => p.owner === foe && (p !== plan.target || w.rand() < 0.4) && w.route(from, p).length < 800);
  if (!marks.length) return;
  const mark = marks[Math.floor(w.rand() * marks.length)];
  const spare = spareAt(w, from);
  const size = Math.min(spare * 0.5, w.defence(mark) * 0.55 + 12);
  if (size < 14) return;
  const units = takeUnits(from.garrison, size);
  if (!units.length) return;
  const a = w.spawnArmy(h.index, units, from, `${h.short} raiders`, 'raid');
  if (!w.order(a, mark)) { w.removeArmy(a); for (const u of units) from.garrison.push(u); return; }
  plan.raids++;
  if (foe === 0) w.log(`${h.short} raiders are on the road toward ${mark.name}: about ${headcount(units)} men.`, 1);
  return true;
}

// For checks(): a house that has sat in muster for three minutes and, at its last think, saw
// it could march and did not; or that has kit and people and raises nobody.
export function musterProblems(w) {
  const out = [];
  for (const h of FACTIONS) {
    const P = h.ai?.plan;
    if (!h.alive || h.index === 0 || h.bandit || P?.phase !== 'muster' || P.waited <= 180 || !P.staging || P.staging.owner !== h.index) continue;
    if (P.target.owner === 0 && leagued(w, h.index) && leagueHost(w)) continue;
    // Judged on what the house saw at its last think, not now: men can reach the muster
    // between thinks (every 8 s), and it marches at the next (seed 21, minute 49).
    if (P.seen?.ready) out.push(`${h.name} saw it could march on ${P.target.name} at its last think and did not (waited ${P.waited} s)`);
    const people = w.pois.some(p => p.owner === h.index && p.eco?.buildings && p.eco.pop - keepAtWork(p.eco, pressedAt(h, p)) >= 6);   // as World.raiseFromPeople keeps
    if (h.ai.stance === 'war' && h.arms >= 12 && people && w.time - (h.ai.raisedAt ?? -Infinity) > 60) out.push(`${h.name} has ${Math.round(h.arms)} arms and people to spare, and raised nobody for ${P.target.name}`);
  }
  return out;
}

// Winter: the north raids hardest in the snow. Each winter is announced; while it lasts,
// the north sends fast bands of war dogs and javelin men at your nearer places every two or
// so minutes. They are men taken from the northern place nearest your lands.
const WINTER_RAID = [100, 160];
function winterRaids(w, h) {
  const ai = h.ai;
  if (!w.winter) return;
  const year = Math.floor(w.time / 1200);
  if (ai.winterYear !== year) {
    ai.winterYear = year;
    ai.winterCd = 30;
    w.log('Winter has come. The north raids hardest in the snow.', 1);
    w.chron('Winter came, and the north raided in the snow.');
    w.hooks.herald?.({ house: h, title: 'Winter', text: 'Snow lies on the roads and every army marches slower. Norrhold loves the cold: its war dogs and javelin men will come raiding out of the camps until the thaw.' });
  }
  ai.winterCd -= THINK;
  if (ai.winterCd > 0) return;
  ai.winterCd = WINTER_RAID[0] + w.rand() * (WINTER_RAID[1] - WINTER_RAID[0]);
  // From whichever northern place lies nearest your lands with men to spare.
  const near = held(w, h).filter(p => headcount(p.garrison) >= 40 && p.kind !== 'pass')
    .map(p => ({ p, marks: w.pois.filter(q => q.owner === 0 && w.route(p, q).length < 1400) })).filter(o => o.marks.length)
    .sort((a, b) => b.marks.length - a.marks.length);
  const o = near[0];
  if (!o) return;
  const camp = o.p, mark = o.marks[Math.floor(w.rand() * o.marks.length)];
  const n = Math.min(60, Math.max(20, Math.round(headcount(camp.garrison) * 0.2)));
  takeUnits(camp.garrison, n * 0.9);   // the place's men go out as the raiders
  const dogs = Math.round(n * 0.4);
  const a = w.spawnArmy(h.index, [{ key: TYPES.wardog ? 'wardog' : 'lightcav', count: dogs, name: 'War dogs' }, { key: TYPES.javelin ? 'javelin' : 'archer', count: n - dogs, name: 'Northern javelin men' }], camp, 'Winter raiders', 'raid');
  if (!w.order(a, mark)) { w.removeArmy(a); return; }
  w.log(`Winter raiders from ${camp.name} are coming for ${mark.name}: about ${roughly(n)} dogs and men.`, 1);
}

function invaderMind(w, h) {
  const ai = h.ai;
  const gate = w.pois.find(p => p.kind === 'pass' && p.owner === h.index);
  if (gate) {
    ai.tide -= THINK;
    if (ai.tide <= 0) {
      ai.wave++;
      ai.tide = TIDE.every;
      const n = Math.round(Math.min(2400, Math.max(160, w.strength(0) * (0.3 + 0.07 * ai.wave))));
      const heavy = TYPES.maa ? 'maa' : 'sword', horse = TYPES.knight && ai.wave >= 4 ? 'knight' : TYPES.lightcav ? 'lightcav' : 'cav';
      for (const [key, share, name] of [['spear', 0.38, 'Northern spears'], [heavy, 0.27, 'Northern axemen'], ['archer', 0.2, 'Northern bows'], [horse, 0.15, 'Northern riders']]) {
        let left = Math.round(n * share);
        while (left > 0) { const k = Math.min(160, left); recruit(gate.garrison, key, k, name); left -= k; }
      }
      if (ai.wave === 1 || ai.wave % 3 === 0) {
        w.log(`Another host comes down through ${gate.name}: some ${n} men.`, 1);
        w.hooks.herald?.({ house: h, title: ai.wave === 1 ? 'The host comes on' : 'More come through the gate', text: `Some ${n} men march down through ${gate.name}. While the north holds the gate, they will keep coming.` });
      }
    }
  }
  winterRaids(w, h);
  // The gate sends its men on to the war camps, and the camps make war like any house.
  houseMind(w, h);
}

// The first winter's outlaws: twice in the first quarter hour a small band comes out of
// the woods for the stores of your home village. Its size follows what is worth taking
// and what guards it, so the retinue at home turns it, and a retinue sent to work leaves
// the militia to hold (or not). Not in a gentle game, nor while outlaws are paid off or
// the king's peace holds.
export const OUTLAWS = [{ at: 300, spread: 60, men: 8 }, { at: 720, spread: 120, men: 12 }];
const OUTLAW_MAX = 18;
function outlawMind(w, h) {
  // (a save from before the outlaws, or a test campaign, skips the bands whose time is past)
  const o = w.outlaws ??= { wave: (i => i < 0 ? OUTLAWS.length : i)(OUTLAWS.findIndex(W => w.time < W.at + W.spread)), at: null };
  if (o.wave >= OUTLAWS.length || w.options?.aggression === 'gentle') return;
  const W = OUTLAWS[o.wave];
  o.at ??= W.at + w.rand() * W.spread;
  if (w.time < o.at) return;
  const home = w.home;
  o.wave++;
  o.at = null;
  if (!home || home.owner !== 0 || !home.town || home.town.underAttack || w.banditPeace > w.time || w.decrees?.on?.peace) return;
  const t = home.town;
  const armed = t.garrison().reduce((n, r) => n + r.alive, 0);
  const worth = ['food', 'wood', 'gold'].reduce((n, g) => n + Math.max(0, +t.free?.(g) || 0), 0) + (FACTIONS[0].gold || 0);
  const n = Math.min(OUTLAW_MAX, Math.round(W.men + armed * 0.2 + worth / 150));
  // They come down the road from the woods, a minute or so out.
  const from = home.links[Math.floor(w.rand() * home.links.length)];
  if (!from) return;
  const a = w.spawnArmy(h.index, [unit('bandit', n, 'Outlaws of the greenwood')], home, 'Outlaws', 'raid');
  const d = dist(home, from), k = Math.min(1, 300 / Math.max(1, d));
  Object.assign(a, { x: home.x + (from.x - home.x) * k, z: home.z + (from.z - home.z) * k, at: null, last: from, path: [home], target: home, outlaws: true });
  const first = o.wave === 1;
  // a band is small enough to count: its true size (QC, 2026-11-21: "about 20" for 15)
  w.log(`Outlaws out of the greenwood are on the road to ${home.name}: ${n} men, come for your stores.${armed ? ' Order your retinue at them when they reach the village.' : ' Nobody in the village is under arms.'}`, 1);
  w.hooks.sound?.('outlaws'); // audio: outlaws on the road
  if (first) w.hooks.herald?.({ house: h, title: 'Outlaws on the road', text: `A band of ${n} outlaws is coming for ${home.name}'s stores. Keep your retinue at home: when the band reaches the village, select the retinue and right-click the outlaws to fight them, or call your people out to meet them. Beaten off, they take nothing; let them be, and they leave with a share of the stores and the purse.` });
}

// Outlaws in their camps raid whatever is near, yours included once you are settled.
function banditMind(w, h) {
  for (const camp of held(w, h)) {
    camp.raidCd = (camp.raidCd ?? 150 + w.rand() * 120) - THINK;
    if (camp.raidCd > 0 || headcount(camp.garrison) < 30) continue;
    camp.raidCd = 170 + w.rand() * 130;
    const marks = w.pois.filter(p => p !== camp && p.kind !== 'camp' && p.kind !== 'crown'
      && (p.owner !== 0 || (w.time > 200 && !(w.banditPeace > w.time) && !w.decrees?.on?.peace)) && w.route(camp, p).length < 520);
    if (!marks.length) continue;
    const mark = marks.sort((p, q) => w.defence(p) - w.defence(q))[Math.floor(w.rand() * Math.min(3, marks.length))];
    const units = takeUnits(camp.garrison, power(camp.garrison) * 0.6);
    if (!units.length) continue;
    const a = w.spawnArmy(h.index, units, camp, 'Bandit raiders', 'raid');
    if (!w.order(a, mark)) { w.removeArmy(a); continue; }
    if (mark.owner === 0) w.log(`Outlaws from ${camp.name} are heading for ${mark.name}!`, 1);
  }
}
