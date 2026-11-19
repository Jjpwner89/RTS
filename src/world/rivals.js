// The rival houses' minds. Each lord has a bent (raider, builder, turtler, schemer,
// merchant, hothead) that sets how soon they go to war and how they fight one.
//
// A war builds up the way the creator wants: first raiding parties probe the enemy's
// villages, then the house gathers a great host at its nearest place (and the enemy
// hears of it), then the host marches with rams and ladders and lays siege.
import { FACTIONS, GRACE, power, headcount, takeUnits, dist, recruit } from './world.js';
import { protectedFrom } from './diplomacy.js';
import { TYPES } from '../battle.js';

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
const THINK = 8;

export function startHouseMinds(w) {
  for (const h of FACTIONS) startMind(w, h);
}

export function startMind(w, h) {
  h.ai = { think: 20 + h.index * 3, plan: null, cool: h.invader ? 20 : 60, raidCd: h.invader ? 40 : 120 + w.rand() * 80, warClock: 240 + w.rand() * 240, warsSince: {}, tide: TIDE.first, wave: 0 };
}

export function thinkHouses(w, dt) {
  for (const h of FACTIONS) {
    if (h.index === 0 || !h.alive) continue;
    h.ai.think -= dt;
    if (h.ai.think > 0) continue;
    h.ai.think = THINK;
    if (h.bandit) banditMind(w, h);
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
  const B = BENT[h.trait] || BENT.schemer, ai = h.ai, plan = ai.plan;
  ai.cool -= THINK;
  if (!h.seat || h.seat.owner !== h.index) h.seat = mine[0];
  const muster = plan?.staging?.owner === h.index ? plan.staging : h.seat;

  // Raise men for the field at the muster place, while the people can spare them.
  if (h.arms >= 6) w.raiseFromPeople(h, muster, Math.min(12, Math.floor(h.arms)));

  // Send men beyond what each place keeps at home to the muster place.
  for (const p of mine) {
    if (p === muster || headcount(p.garrison) < w.keepHome(p) * 1.3 + 8) continue;
    if (w.armies.some(a => a.side === h.index && a.mode === 'column' && a.last === p && !a.at)) continue;
    const extra = takeUnits(p.garrison, spareAt(w, p) - 6);
    if (!extra.length) continue;
    const col = w.spawnArmy(h.index, extra, p, `${h.short} column`, 'column');
    if (!w.order(col, muster)) { w.removeArmy(col); for (const u of extra) p.garrison.push(u); }
  }

  thinkWars(w, h, B);

  // Drop a plan whose target is ours now, or no longer an enemy.
  if (plan && (plan.target.owner === h.index || !w.canAttack(h.index, plan.target))) {
    if (plan.host && !plan.host.gone && plan.host.side === h.index && !plan.host.retreating) w.retreat(plan.host);
    ai.plan = null;
    ai.cool = 40;
    return;
  }
  if (!ai.plan) {
    if (ai.cool <= 0) ai.plan = choosePlan(w, h, B);
    return;
  }
  runPlan(w, h, B, ai.plan);
}

// Go to war with a neighbour now and then, more often for hot-blooded lords. Wars
// between rivals burn out after a while; wars with you last until diplomacy ends them.
function thinkWars(w, h, B) {
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
  if (enemies.length >= (B.war > 1.2 ? 2 : 1)) return;
  // Neighbours: houses holding a place within a short march of one of ours.
  const mine = held(w, h);
  const near = new Map();
  for (const p of w.pois) {
    if (p.owner === null || p.owner === h.index || p.owner === w.bandits || !FACTIONS[p.owner].alive) continue;
    const d = Math.min(...mine.map(q => dist(p, q)));
    if (d < 420) near.set(p.owner, Math.min(near.get(p.owner) ?? Infinity, d));
  }
  const strength = i => w.strength(i);
  const ours = strength(h.index);
  const choices = [...near.keys()].filter(i => !w.atWar(h.index, i) && (i !== 0 || (w.time > GRACE && !protectedFrom(w, 0, h.index)))
    && !(FACTIONS[i].vassalOf === 0 && w.dip[h.index].opinion > -20))
    .map(i => ({ i, odds: ours / Math.max(1, strength(i)) }))
    .sort((a, b) => b.odds - a.odds);
  const pick = choices[0];
  if (pick && pick.odds * B.war > 0.9 && w.rand() < 0.7) {
    w.declareWar(h.index, pick.i);
    ai.warsSince[pick.i] = w.time;
  }
}

function choosePlan(w, h, B) {
  const options = [];
  for (const p of w.pois) {
    if (!w.canAttack(h.index, p)) continue;
    if (p.owner === 0 && w.time < GRACE) continue;
    const from = nearestOwn(w, h, p);
    if (!from.place || from.length > 900) continue;
    const def = w.defence(p);
    // Free villages and bandit camps are easy pickings; enemy places are a war aim.
    let prize = p.kind === 'crown' ? 0.7 : p.seat !== undefined ? 0.8 : 1;
    if (h.invader && p.owner === 0) prize *= 0.6;   // the north comes for the king first
    options.push({ p, staging: from.place, score: (def + from.length * 0.15) * prize });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.score - b.score);
  const o = options[0];
  const war = o.p.owner !== null && o.p.owner !== w.bandits;
  return { target: o.p, staging: o.staging, phase: war ? 'probe' : 'muster', t: war ? B.probe : 0, waited: 0, host: null, raids: 0 };
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
      plan.phase = 'muster';
      plan.staging = nearestOwn(w, h, T).place || h.seat;
      if (T.owner === 0) {
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
    const need = w.defence(T) * B.need + 20, spare = spareAt(w, S);
    const ready = spare >= need || (plan.waited > 420 && spare >= w.defence(T) * 1.1);
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
    if (T.owner === 0 || S.visible) w.log(`${host.name} marches from ${S.name} on ${T.name}: ${headcount(host.units)} men.`, T.owner === 0 ? 1 : 2);
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
  // The gate sends its men on to the war camps, and the camps make war like any house.
  houseMind(w, h);
}

// Outlaws in their camps raid whatever is near, yours included once you are settled.
function banditMind(w, h) {
  for (const camp of held(w, h)) {
    camp.raidCd = (camp.raidCd ?? 150 + w.rand() * 120) - THINK;
    if (camp.raidCd > 0 || headcount(camp.garrison) < 30) continue;
    camp.raidCd = 170 + w.rand() * 130;
    const marks = w.pois.filter(p => p !== camp && p.kind !== 'camp' && p.kind !== 'crown'
      && (p.owner !== 0 || w.time > 200) && w.route(camp, p).length < 520);
    if (!marks.length) continue;
    const mark = marks.sort((p, q) => w.defence(p) - w.defence(q))[Math.floor(w.rand() * Math.min(3, marks.length))];
    const units = takeUnits(camp.garrison, power(camp.garrison) * 0.6);
    if (!units.length) continue;
    const a = w.spawnArmy(h.index, units, camp, 'Bandit raiders', 'raid');
    if (!w.order(a, mark)) { w.removeArmy(a); continue; }
    if (mark.owner === 0) w.log(`Outlaws from ${camp.name} are heading for ${mark.name}!`, 1);
  }
}
