// What needs you, worst first: one list on the map, after Stellaris's outliner. Each
// alert names a place or an army to look at. Worked out fresh from the world's state, so
// an alert goes away by itself when its trouble does.
//
// Levels: 5 a village of yours is being fought in or going hungry (with why: playtest, 2026-11-21), 4 enemies marching on you or a revolt,
// 3 hunger and pay, 2 grumbling, 1 good to know, 0 news (buildings finished in the last
// minute and a half; houses aren't news).
import { FACTIONS, headcount, seenAs } from './world.js';
import { foodLeft } from './supply.js';
import { living, opinion } from './vassals.js';
import { armyStep } from './march.js';
import { hostStatus } from './muster.js';

const mins = s => s < 60 ? 'under a minute' : `${Math.round(s / 60)} min`;

// Road distance still to go for an army.
function ahead(a) {
  let d = 0, x = a.x, z = a.z;
  for (const p of a.path) { d += Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z; }
  return d;
}

// Needs you is for things that need the player. A line that only nags (hands without work, a
// building standing idle) is shown once: it can be dismissed, goes by itself after a while on
// screen, and the same cause does not bring it back for NAG.rest seconds (the scout, 2026-11-28:
// "12 of 12 without work" sat there for ten minutes). `w.quiet[cause] = { at, off }` is saved.
export const NAG = { show: 120, rest: 1200 };
const resting = (w, key) => {
  const q = w.quiet?.[key];
  if (!q || w.time - q.at >= NAG.rest) return false;
  return !!q.off || w.time - q.at >= NAG.show;
};
// The map has shown it: its time on screen starts.
export function nagShown(w, key) {
  const q = (w.quiet ||= {})[key];
  if (!q || w.time - q.at >= NAG.rest) w.quiet[key] = { at: w.time };
}
export function nagDismiss(w, key) { (w.quiet ||= {})[key] = { at: w.time, off: true }; }

export function alerts(w) {
  const out = [];
  const add = (level, text, at, icon, find, nag) => out.push({ level, text, at, icon, find, nag });

  for (const p of w.pois) {
    const t = p.town;
    if (p.owner !== 0 || !t) continue;
    if (t.underAttack) {
      const n = t.attackers.reduce((k, g) => k + g.regs.reduce((j, r) => j + (r.gone ? 0 : r.alive), 0), 0);
      add(5, `${p.name} is under attack${n ? ` by ${n} men` : ''}`, p, 'siege');
    }
    if (t.revolt) add(4, `${p.name} is in revolt`, p, 'warning');
    else if (t.misery > 30) add(3, `${p.name} is close to revolt (mood ${Math.round(t.mood)})`, p, 'people');
    if (t.starving) { const h = t.hungerWhy(); add(5, `${p.name} is going hungry: ${h.why}. ${h.fix[0].toUpperCase()}${h.fix.slice(1)}`, p, 'food'); }
    else {
      // Food seen coming up short, early, with the cause and the fix (playtest round 3).
      const fo = t.foodOutlook();
      if (fo) add(fo.level, `${p.name}: ${fo.text}. ${fo.fix[0].toUpperCase()}${fo.fix.slice(1)}`, p, 'food');
    }
    const wo = t.woodOutlook();
    if (wo) add(3, `${p.name}: ${wo.text}. ${wo.fix[0].toUpperCase()}${wo.fix.slice(1)}`, p, 'warning');
    const jo = !t.underAttack && !t.hostile && t.jobsOutlook();
    if (jo && !resting(w, `jobs:${p.id}`)) add(2, `${p.name}: ${jo.text}`, p, 'people', null, [`jobs:${p.id}`]);
    const dry = t.buildings.filter(b => b.dry && b.state === 'active' && !resting(w, `dry:${p.id}:${b.id}`));
    if (dry.length) {
      // Click to go to the nearest deposit nobody is working, when there is one.
      const next = dry.map(b => t.nextDeposit(b)).filter(Boolean).sort((a, b) => a.m - b.m)[0];
      add(2, `${p.name}: ${dry.length > 1 ? `${dry.length} workplaces stand` : `the ${dry[0].B.name.toLowerCase()} stands`} idle, worked out${next ? `: the next deposit is ${next.m} m ${next.to} (click to look)` : `: ${dry.some(b => /^(rock|ore)$/.test(b.B.gather?.node)) ? 'no other deposit left; ' : ''}move or pull down`}`, p, 'warning', next && next.node, dry.map(b => `dry:${p.id}:${b.id}`));
    }
  }

  // Enemy columns you can see, marching on a place of yours.
  for (const a of w.armies) {
    // (the first winter's outlaws are announced as they set out, so they are listed from then, seen or not)
    if (a.gone || a.side === 0 || a.wagon || !(a.visible || a.outlaws) || a.retreating) continue;
    const to = a.target;
    if (!to || to.owner !== 0) continue;
    const eta = ahead(a) / armyStep(w, a);
    const raid = a.mode === 'raid' || FACTIONS[a.side]?.bandit;
    // (the outlaws' number was said as they set out, so it is said here too)
    const S = a.outlaws ? { name: 'Outlaws', men: headcount(a.units) } : seenAs(a);
    add(4, `${S.name}${S.men ? ` (${S.men})` : ''} ${raid ? 'raiding toward' : 'marching on'} ${to.name}, ${mins(eta)} away`, a, raid ? 'raid' : 'invader');
  }

  // A host still gathering (specs/MUSTER.md): one line, not one a column.
  for (const H of w.hosts || []) {
    const S = hostStatus(w, H);
    if (S.coming && S.at) add(1, `${H.name}: ${S.here} of ${S.here + S.coming} here, the rest in ${S.eta < 60 ? 'under a minute' : `about ${mins(S.eta)}`}`, S.at, 'crown');
  }

  // Your own armies: storming, hungry.
  for (const p of w.pois) if (p.town?.hostile) add(3, `Your men are storming ${p.name}`, p, 'castle');
  for (const a of w.armies) {
    if (a.gone || a.side !== 0 || a.wagon) continue;
    const left = foodLeft(w, a);
    if (left <= 0) add(4, `${a.name} is starving: men are deserting`, a, 'food');
    else if (left < 120) add(3, `${a.name} has food for ${mins(left)}`, a, 'food');
  }

  for (const c of w.companies || []) {
    if (c.employer !== 0 || !c.unpaid) continue;
    add(c.grumbled ? 3 : 2, `${c.name[0].toUpperCase()}${c.name.slice(1)} are owed wages`, null, 'gold');
  }

  for (const v of living(w)) {
    const held = w.pois.find(p => p.vassal === v.id);
    if (v.landless) { add(1, `${v.name} waits at your court for land`, null, 'crown'); continue; }
    const foe = v.feud && w.vassals.find(o => o.id === v.feud);
    if (foe && v.id < foe.id) add(2, `${v.name} and ${foe.name} are feuding`, held, 'crown');
    if (v.refusing) add(3, `${v.name} refuses dues and men`, held, 'crown');
    else if (opinion(w, v).total <= -10) add(2, `${v.name} is resentful`, held, 'crown');
  }

  if (w.coalition?.members.length) add(3, `${w.coalition.members.length} houses are leagued against you: ${w.coalition.members.map(h => FACTIONS[h].short).join(', ')}`, null, 'invader');
  if (w.faction?.members.length >= 2) add(3, `${w.faction.members.length} vassals have formed a faction against you`, null, 'warning');

  // Good to know: an army of yours standing idle away from home.
  for (const a of w.armies) {
    if (a.gone || a.side !== 0 || a.wagon || a.musterFor || a.parted || a.path.length || !a.at || a.at.owner === 0) continue;
    if (a.siege) { const p = w.byId[a.siege.p]; add(1, `${a.name} besieges ${a.at.name}${p?.siegeFood <= 0 ? ': it is starving' : ''}`, a, 'siege'); continue; }
    add(1, `${a.name} waits for orders at ${a.at.name}`, a, 'map');
  }

  const fresh = new Map();
  for (const b of w.built || []) if (w.time - b.at < 90) (fresh.get(b.p) || fresh.set(b.p, []).get(b.p)).push(b);
  for (const [id, list] of fresh) {
    const p = w.byId[id];
    if (p?.owner === 0) add(0, list.length > 1 ? `${list.length} buildings finished at ${p.name}` : `${list[0].name} finished at ${p.name}`, p, list.at(-1).icon);
  }
  return out.sort((x, y) => y.level - x.level);
}

export const LEVEL_COLOR = ['', '#c9bfa8', '#e8c45a', '#e8904a', '#ff7a5a', '#ff4a3a'];
