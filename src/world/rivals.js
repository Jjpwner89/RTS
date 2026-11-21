// The rival houses' minds. Each lord has a bent (raider, builder, turtler, schemer,
// merchant, hothead) that sets how soon they go to war and how they fight one.
//
// Every house climbs three stages (STAGES): Settling, when it builds up, clears outlaws and
// takes the free villages next door; Expanding, when it reaches further out, raids its
// weakest neighbour and strikes where a place is weakly held; and Contending, when it plays
// to win from where it stands: it goes for the leader, joins coalitions, besieges seats and
// pushes for Kingsbridge. A house moves up with time (sooner for hot-blooded lords, later
// for builders and turtlers, and by the campaign's Rivals option), or early once you close
// the gap on it.
//
// A war builds up the way the creator wants: first raiding parties probe the enemy's
// villages, then the house gathers a great host at its nearest place (and the enemy
// hears of it), then the host marches with rams and ladders and lays siege.
import { FACTIONS, grace, fierceness, power, headcount, takeUnits, dist, recruit, roughly, unit } from './world.js';
import { protectedFrom, leagued, leagueHost, wantsBack, grudgeWeight } from './diplomacy.js';
import { rivalHire } from './companies.js';
import { TYPES } from '../battle.js';

export const STAGES = ['Settling', 'Expanding', 'Contending'];
const STAGE_AT = [1200, 2400];        // seconds into the campaign, before pace
const PACE = { hothead: 0.75, raider: 0.75, schemer: 1, merchant: 1, builder: 1.3, turtler: 1.3 };
const CATCH = [0.75, 1];              // your strength against theirs that moves them up early
const CATCH_FROM = 360;               // but not in the first six minutes
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

// Moves a house up a stage when its time comes, or once you are nearly as strong as it is.
// It never goes back down.
function climb(w, h) {
  const ai = h.ai;
  if (h.invader) { ai.stage = 2; return; }
  const k = (PACE[h.trait] ?? 1) * fierceness(w).stage;
  let s = w.time >= STAGE_AT[1] * k ? 2 : w.time >= STAGE_AT[0] * k ? 1 : 0;
  if (w.time > CATCH_FROM) {
    const ratio = w.strength(0) / Math.max(1, w.strength(h.index));
    if (ratio >= CATCH[1]) s = 2;
    else if (ratio >= CATCH[0]) s = Math.max(s, 1);
  }
  // A campaign saved before the stages: the house takes its stage quietly.
  if (ai.stage === undefined) { ai.stage = s; return; }
  if (s <= ai.stage) return;
  ai.stage = s;
  ai.stageAt = w.time;
  if (!w.knows(h.index)) return;
  if (s === 1) w.log(`${h.name} is reaching beyond its own lands. Its lord has an eye on the free villages further out, and on weak neighbours.`, 2);
  else {
    w.log(`${h.lord} means to win the realm. ${h.name} will go for whoever leads, and for Kingsbridge.`, 1);
    w.hooks.herald?.({ house: h, title: `${h.name} reaches for the crown`, text: `${h.lord} has stopped building and started conquering. From now on ${h.name} goes for whoever leads the realm, joins any league against them, and pushes for Kingsbridge.` });
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

// The house's own place nearest to `target` by road.
function nearestOwn(w, h, target) {
  let best = null, bd = Infinity;
  for (const p of held(w, h)) {
    const d = p === target ? 0 : w.route(p, target).length;
    if (d < bd) { bd = d; best = p; }
  }
  return { place: best, length: bd };
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

  // Raise men for the field at the muster place, while the people can spare them.
  // A settling house keeps a modest field reserve; later it raises all it can.
  if (h.arms >= 6 && (stage > 0 || spareAt(w, muster) < SETTLED_RESERVE)) w.raiseFromPeople(h, muster, Math.min(12, Math.floor(h.arms)));

  // A rich lord at war hires a mercenary company rather than sit on his gold, and pays
  // its wages from then on (companies.js). Not while the house is still settling.
  if (!h.bandit && stage > 0 && w.time > (ai.hiredAt ?? -Infinity) + 300 && rivalHire(w, h, muster)) ai.hiredAt = w.time;

  // Send men beyond what each place keeps at home to the muster place.
  for (const p of mine) {
    if (p === muster || headcount(p.garrison) < w.keepHome(p) * 1.3 + 8) continue;
    if (w.armies.some(a => a.side === h.index && a.mode === 'column' && a.last === p && !a.at)) continue;
    const extra = takeUnits(p.garrison, spareAt(w, p) - 6);
    if (!extra.length) continue;
    const col = w.spawnArmy(h.index, extra, p, `${h.short} column`, 'column');
    if (!w.order(col, muster)) { w.removeArmy(col); for (const u of extra) p.garrison.push(u); }
  }

  thinkWars(w, h, B, stage);

  // Drop a plan whose target is ours now, or no longer an enemy.
  if (plan && (plan.target.owner === h.index || !w.canAttack(h.index, plan.target))) {
    if (plan.host && !plan.host.gone && plan.host.side === h.index && !plan.host.retreating) w.retreat(plan.host);
    // A free village taken: the house settles it before reaching for the next.
    ai.cool = plan.free && plan.target.owner === h.index ? GROW[stage] * (0.8 + w.rand() * 0.4) : 40;
    ai.plan = null;
    return;
  }
  if (!ai.plan) {
    if (ai.cool <= 0) ai.plan = choosePlan(w, h, B, stage);
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
  if (ai.warClock > 0) return;
  ai.warClock = (260 + w.rand() * 220) / B.war;
  // A settling house makes no wars; an expanding one one at a time.
  if (stage === 0) return;
  if (enemies.length >= (stage === 1 ? 1 : B.war > 1.2 ? 2 : 1)) return;
  // Neighbours: houses holding a place within a short march of one of ours.
  const mine = held(w, h);
  const near = new Map();
  for (const p of w.pois) {
    if (p.owner === null || p.owner === h.index || p.owner === w.bandits || !FACTIONS[p.owner].alive) continue;
    const d = Math.min(...mine.map(q => dist(p, q)));
    if (d < 420) near.set(p.owner, Math.min(near.get(p.owner) ?? Infinity, d));
  }
  const strength = i => w.strength(i);
  const ours = strength(h.index), lead = leader(w, h);
  const choices = [...near.keys()].filter(i => !w.atWar(h.index, i) && !(leagued(w, h.index) && leagued(w, i)) && (i !== 0 || !protectedFrom(w, 0, h.index))
    && !(FACTIONS[i].vassalOf === 0 && w.dip[h.index].opinion > -20))
    // A lord with a grudge against you fancies his chances more than he should; a
    // contending one goes for whoever leads.
    .map(i => ({ i, odds: ours / Math.max(1, strength(i)) * (i === 0 ? 1 + Math.min(0.5, grudgeWeight(w, h) / 40) : 1) * (stage === 2 && i === lead ? 1.6 : 1) }))
    .sort((a, b) => b.odds - a.odds);
  const pick = choices[0];
  if (pick && pick.odds * B.war > 0.9 && w.rand() < 0.7) {
    w.declareWar(h.index, pick.i);
    ai.warsSince[pick.i] = w.time;
  }
}

// The strongest side in the realm other than this house: you, or another house.
function leader(w, h) {
  let best = null, bs = -1;
  for (const o of FACTIONS) {
    if (o === h || !o.alive || o.bandit || o.invader) continue;
    const s = w.strength(o.index);
    if (s > bs) { bs = s; best = o.index; }
  }
  return best;
}

// What a house goes for next. Settling: free villages next door and outlaw camps, and only
// raids on an enemy. Expanding: free villages further out, and an enemy's place only where
// it is weakly held. Contending: anything, the leader's places and Kingsbridge first.
function choosePlan(w, h, B, stage) {
  const options = [], ours = w.strength(h.index), lead = stage === 2 ? leader(w, h) : null;
  let skirmish = null;
  for (const p of w.pois) {
    if (!w.canAttack(h.index, p)) continue;
    const enemy = p.owner !== null && p.owner !== w.bandits;
    if (p.owner === 0 && stage === 0) { if (!protectedFrom(w, 0, h.index)) skirmish ??= p; continue; }
    // the free villages around your start are yours to win first
    if (p.owner === null && w.time < grace(w) && w.byId.ashford && dist(p, w.byId.ashford) < 260) continue;
    const from = nearestOwn(w, h, p);
    if (!from.place || from.length > (stage === 0 && p.owner === null ? NEXT_DOOR : 900)) continue;
    const def = w.defence(p);
    if (enemy && stage === 0) { if (!skirmish || from.length < 600) skirmish = p; continue; }
    if (enemy && stage === 1 && (def > ours * 0.25 || p.seat !== undefined || p.kind === 'crown')) { skirmish ??= p; continue; }
    // Free villages and bandit camps are easy pickings; enemy places are a war aim.
    let prize = p.kind === 'crown' ? (stage === 2 ? 0.45 : 0.7) : p.seat !== undefined ? 0.8 : 1;
    if (lead !== null && p.owner === lead) prize *= 0.7;   // the leader's lands
    if (h.invader && p.owner === 0) prize *= 0.6;   // the north comes for the king first
    if (p.owner === 0 && leagued(w, h.index)) prize *= 0.7;   // a coalition is about you
    if (p.owner === 0 && wantsBack(w, h, p)) prize *= 0.6;    // and a lord wants back what you took
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
    if (!ready) {
      if (plan.waited > 720) { h.ai.plan = null; h.ai.cool = 90; }
      return;
    }
    const units = takeUnits(S.garrison, Math.min(spare, need * 1.15));
    if (!units.length) return;
    const besiege = T.owner === 0;
    if (besiege) for (const [key, count] of siegeTrain(w, h)) units.push({ key, count, name: `${h.short} ${TYPES[key].name.toLowerCase()}` });
    const host = w.spawnArmy(h.index, units, S, `The ${h.short} host`, besiege ? 'siege' : 'assault');
    if (!w.order(host, T)) { w.removeArmy(host); return; }
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
