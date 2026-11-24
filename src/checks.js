// Consistency checks (HOW_WE_BUILD.md section 4). Type checks() in the browser console on
// world.html, town.html, battle.html or muster.html: it looks over whatever is loaded and
// prints what passes and what fails. It only reads: nothing in the game is changed, and the
// save check reloads a copy of the campaign in a hidden frame, never the save slots.
//
// checks()                 everything, the asset and save checks included (a second or two)
// checks({ quick: true })  skips the asset and save checks
// checks({ quiet: true })  returns the results without printing
//
// Each page loads this with one marked line before its own script, so errors from the
// first frame on are counted. Add a check whenever you fix a bug one could have caught:
// write it with check(group, name, fn) below, fn returning a list of problems (strings) or
// { warn: [...] } for things that are suspect rather than wrong.

// ---- watching from the moment the page loads ----

// Errors, wherever they come from.
const errors = [];
const keep = text => { if (errors.length < 50) errors.push(String(text).slice(0, 300)); };
const consoleError = console.error.bind(console);
console.error = (...a) => { keep(a.map(x => x?.stack || x?.message || x).join(' ')); consoleError(...a); };
addEventListener('error', e => keep(e.message ? `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})` : `failed to load ${e.target?.src || e.target?.href || e.target?.tagName}`), true);
addEventListener('unhandledrejection', e => keep(`unhandled: ${e.reason?.stack || e.reason}`));
// Files that failed to load. The page's own resource list stops at 250 entries, so watch as they come.
const failedLoads = new Set();
try {
  new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.responseStatus >= 400) failedLoads.add(`${e.responseStatus} ${e.name.replace(location.origin, '')}`); })
    .observe({ type: 'resource', buffered: true });
} catch { /* an older browser: the list below still catches the first 250 */ }

// Who has stood in the same spot while busy, sampled every two seconds of real time and
// measured in game time (a paused game is nobody's fault).
const STUCK = 60, SAMPLE = 2000, MOVED = 3;
const stand = new WeakMap();   // villager or regiment → { x, z, since }
const watchedFrom = new WeakMap();   // battle → game time it was first sampled
// Men in a river's deep channel, the most at once per regiment: standing there (no order) or
// fighting there short of a swim, and separately on the march though their regiment isn't
// swimming (battle.js r.swim: a long detour to the crossing, about 70 m, is swum).
const wetStand = new WeakMap(), wetMarch = new WeakMap();   // regiment → { n, at, x, z }
const WET = 3;   // one or two men a step off a ford's edge for a moment aren't a regiment in the water
function sampleStuck() {
  for (const { battle, town } of scenes()) {
    const now = battle.time;
    if (!watchedFrom.has(battle) || now < watchedFrom.get(battle)) watchedFrom.set(battle, now);
    const note = (o, x, z, busy) => {
      const k = stand.get(o);
      if (!busy || !k || Math.hypot(x - k.x, z - k.z) > MOVED || now < k.since) stand.set(o, { x, z, since: now, busy });
    };
    // villagers walking somewhere (walk() sets v.v) with a job to do
    for (const v of town?.villagers || []) note(v, v.x, v.z, !v.hidden && ['haul', 'build', 'work', 'flee', 'idle'].includes(v.state) && v.v > 0 && (v.state !== 'idle' || !!v.task));
    // regiments marching to an order and not fighting
    for (const r of battle.regs) note(r, r.cx, r.cz, !r.gone && !r.routing && !!r.dest && !(r.engaged > 0));
    // men in a river's deep channel (not on a bridge's deck), routers aside
    if (battle.river) for (const r of battle.regs) {
      if (r.gone || r.routing) continue;
      let stood = 0, marched = 0;
      for (const s of r.soldiers) if (live(s) && battle.waterAt(s.x, s.z) >= 2 && !battle.river.onBridge?.(s.x, s.z)) { if ((!r.dest && !r.targetReg) || (s.target && !r.swim)) stood++; else if (!r.swim) marched++; }
      if (stood > (wetStand.get(r)?.n || 0)) wetStand.set(r, { n: stood, at: now, x: r.cx, z: r.cz });
      if (marched > (wetMarch.get(r)?.n || 0)) wetMarch.set(r, { n: marched, at: now, x: r.cx, z: r.cz });
    }
  }
}
setInterval(() => { try { sampleStuck(); } catch { /* the checks never break the game */ } }, SAMPLE);
const stuckFor = (o, battle) => { const k = stand.get(o); return k?.busy ? battle.time - k.since : 0; };

// ---- what is loaded ----

const page = location.pathname.split('/').pop() || 'index.html';

// Every running battle and village: the page's own, and on the world map every village
// that runs (held, stormed or looked round) and the field battle on screen.
function scenes() {
  const g = window.game, out = [], seen = new Set();
  const add = (battle, town, label, poi = null) => {
    if (!battle || seen.has(battle)) return;
    seen.add(battle);
    out.push({ battle, town, label, poi });
  };
  if (!g) return out;
  if (g.world) {
    const c = g.current;
    if (c?.town) add(c.town.battle, c.town, `${c.poi?.name || 'village'}${c.look ? ' (look-round)' : ''}`, c.poi);
    if (c?.battle) add(c.battle, null, 'field battle');
    for (const p of g.world.pois) if (p.town) add(p.town.battle, p.town, p.name, p);
  } else if (g.town) add(g.battle, g.town, 'village');
  else if (g.battle) add(g.battle, null, 'battle');
  return out;
}

// The village whose panels are on screen, if any.
function shownTown() {
  const g = window.game;
  return g?.world ? g.current?.town || null : g?.town || null;
}

// ---- the checks ----

const results = [];
let group = '';
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === null) return results.push({ group, name, status: 'skip', detail: [] });
    const fails = Array.isArray(r) ? r : r?.fail || [], warns = r?.warn || [];
    results.push({ group, name, status: fails.length ? 'fail' : warns.length ? 'warn' : 'pass', detail: fails.length ? fails : warns });
  } catch (e) {
    results.push({ group, name, status: 'fail', detail: [`the check itself threw: ${e.message}`] });
  }
}
const bad = n => typeof n !== 'number' || !Number.isFinite(n);
const live = s => s.alive && !s.gone;
const sample = (list, n = 6) => (list.length > n ? [...list.slice(0, n), `… and ${list.length - n} more`] : list);
const at = o => `(${Math.round(o.x)}, ${Math.round(o.z)})`;

// Stores: nothing negative or broken in any building's goods.
function storeProblems(holders, label) {
  const out = [];
  for (const b of holders) for (const part of ['store', 'incoming', 'reserved']) for (const [g, n] of Object.entries(b[part] || {})) {
    if (bad(n)) out.push(`${label}: ${b.B?.name || b.kind} ${part}.${g} is ${n}`);
    else if (n < -1e-6) out.push(`${label}: ${b.B?.name || b.kind} ${part}.${g} is ${n.toFixed(2)}`);
  }
  return out;
}

// Whether a place's numbers say it is walled. Mirrors World.storm() and campaign.js's
// warning; when the place generator gives one answer for every view, ask it instead.
let walledPlace = () => false;   // places.js, loaded with the world checks
const saysWalled = p => walledPlace(p);
const wallsOf = (battle, side) => battle.walls.pieces.filter(q => q.side === side && q.state !== 'site').length;

async function battleChecks({ battle, town, label }) {
  const regs = battle.regs.filter(r => !r.gone);
  const { ARMOUR, canShield } = await import('./battle.js');

  await check(`${label}: regiments add up`, () => {
    const out = [];
    for (const r of regs) {
      // a captain stands with his regiment but isn't one of its men
      const alive = r.soldiers.filter(s => live(s) && !s.captain).length;
      if (r.alive !== alive) out.push(`${r.name} (side ${r.side}): says ${r.alive} alive, has ${alive} soldiers standing`);
      if (r.alive < 0 || r.alive > Math.max(r.initial, r.soldiers.length)) out.push(`${r.name}: ${r.alive} alive of ${r.initial}`);
      if (!ARMOUR[r.armour]) out.push(`${r.name}: unknown armour "${r.armour}"`);
      if (r.shield && !canShield(r.T.key)) out.push(`${r.name}: a shield on ${r.T.key}, who can't carry one`);
      if (r.T.range && (bad(r.ammo) || r.ammo < 0 || r.ammo > r.maxAmmo + 1e-6)) out.push(`${r.name}: ammo ${r.ammo} of ${r.maxAmmo}`);
      if (r.engine && (bad(r.engine.hp) || r.engine.hp < 0)) out.push(`${r.name}: engine hp ${r.engine.hp}`);
      if (bad(r.morale)) out.push(`${r.name}: morale ${r.morale}`);
    }
    return sample(out);
  });

  // Each man standing has an instance in his look's meshes (view.js syncSoldiers), however late his regiment came.
  await check(`${label}: every living man on the field is drawn`, async () => {
    const view = (await import('./view.js')).viewOf.get(battle);
    if (!view) return null;
    view.syncSoldiers();   // (what the next frame does: a regiment that joined this moment is handed out first)
    const lost = {};
    for (const m of Object.values(view.meshes)) m.list.forEach((s, i) => { if (s.instance !== i) lost[s.reg.name] = (lost[s.reg.name] || 0) + 1; });
    for (const s of battle.soldiers) if (live(s) && !Object.values(view.meshes).some(m => m.list[s.instance] === s)) lost[s.reg.name] = (lost[s.reg.name] || 0) + 1;
    return sample(Object.entries(lost).map(([n, k]) => `${n}: ${k} men not drawn`));
  });

  await check(`${label}: nobody lost off the map`, () => {
    const out = [];
    for (const s of battle.soldiers) if (live(s) && (bad(s.x) || bad(s.z) || bad(s.y) || bad(s.hp))) out.push(`${s.reg.name}: a soldier at (${s.x}, ${s.z}) with ${s.hp} hp`);
    for (const r of regs) if (bad(r.cx) || bad(r.cz)) out.push(`${r.name}: centre at (${r.cx}, ${r.cz})`);
    for (const v of town?.villagers || []) if (bad(v.x) || bad(v.z)) out.push(`villager ${v.id} (${v.state}) at (${v.x}, ${v.z})`);
    return sample(out);
  });

  // A shooter shows his shot (loose, span, throw) only while he stands: one walking off mid-reload walks rather than
  // gliding in the pose (view.js soldierClip). Asked of a copy of each moving shooter, so nothing is changed.
  const anim = await import('./anim.js');
  if (anim.animReady()) await check(`${label}: nobody shoots on the move`, async () => {
    const out = [], { unitModel } = await import('./models.js'), { soldierClip } = await import('./view.js'), seen = {};
    for (const r of regs) {
      if (!r.T.range) continue;
      const info = unitModel(r.T.key)?.anim;
      if (!info || info.horse) continue;
      const shots = ['Bow_Loose', 'Crossbow_Span', 'Javelin_Throw'].map(n => anim.clipOf(info.rig, n)).filter(Boolean);
      let n = 0;
      for (const s of r.soldiers) if (live(s) && s.v >= 0.4 && shots.includes(soldierClip({ ...s }, battle, info, seen).c)) n++;
      if (n) out.push(`${r.name} (side ${r.side}): ${n} men walking or running in their shooting pose`);
    }
    return sample(out);
  });

  // The dead lie down: two seconds after he falls a man is flat, posed in the death he shows (view.js soldierClip;
  // measured: the top of the posed man under 0.9 m, and a rider's horse down too, its back under 1.2 m though it may
  // hold its head up) or toppled whole (view.js fallsInClip), never standing dead in his rest pose.
  await check(`${label}: every dead man lies down within 2 s`, async () => {
    const out = [], { unitModel } = await import('./models.js'), { lookChain } = await import('./battle.js'), { fallsInClip, soldierClip } = await import('./view.js');
    const tops = new Map(), standing = new Map(), shown = {}, H = anim.clipOf('horse', 'Death');
    const nameOf = (rig, c) => Object.entries(anim.clipNames(rig)).find(([, x]) => x.start === c?.start)?.[0];
    // the top of the posed man, and of his horse's middle (its back, not its head and neck: vertices within 0.6 m of
    // its length's middle)
    const topOf = (key, model, info, name, frame) => {
      const k = [key, name, frame].join('/');
      if (!tops.has(k)) {
        const p = anim.poseOf(model.gear, info.rig, name, 'Death', frame), B = model.gear.attributes.aBones;
        let man = -Infinity, horse = -Infinity;
        for (let i = 0; i < B.count; i++) {
          if (B.getX(i) < 128) man = Math.max(man, p[i * 3 + 1]);
          else if (Math.abs(p[i * 3 + 2]) < 0.6) horse = Math.max(horse, p[i * 3 + 1]);
        }
        tops.set(k, { man, horse });
      }
      return tops.get(k);
    };
    for (const s of battle.soldiers) {
      if (s.alive || s.gone || battle.time - (s.diedAt ?? battle.time) < 2) continue;
      const key = lookChain(s.reg.T.key).find(k => unitModel(k)), model = key && unitModel(key), info = anim.animReady() && model?.anim;
      let flat = s.fall >= 1;
      if (info && fallsInClip(info, s)) {
        const c = soldierClip(s, battle, info, shown).c, top = topOf(key, model, info, nameOf(info.rig, c), Math.min(c.frames - 1, Math.floor((battle.time - s.diedAt) * c.fps)));
        flat = top.man < 0.9 && (!info.horse || (H && top.horse < 1.2));
      }
      if (!flat) standing.set(s.reg.name, (standing.get(s.reg.name) || 0) + 1);
    }
    for (const [name, n] of standing) out.push(`${name}: ${n} dead still on their feet`);
    return sample(out);
  });

  await check(`${label}: nobody stuck for over a minute`, () => {
    const out = [];
    for (const r of regs) { const t = stuckFor(r, battle); if (t > STUCK) out.push(`${r.name} has had an order for ${Math.round(t)}s and not moved, at ${at({ x: r.cx, z: r.cz })}`); }
    for (const v of town?.villagers || []) { const t = stuckFor(v, battle); if (t > STUCK) out.push(`villager ${v.id} (${v.state}${v.task?.kind ? ', ' + v.task.kind : ''}${v.job ? ' at the ' + v.job.B.name : ''}) walking on the spot for ${Math.round(t)}s at ${at(v)}`); }
    const ran = Math.round(battle.time - (watchedFrom.get(battle) ?? battle.time));
    return out.length ? sample(out) : ran < STUCK ? { warn: [`watched for only ${ran}s of game time, so this can't see a minute's sticking yet`] } : [];
  });

  // Nobody stands or fights in a river's deep channel (battle.js keeps men from stepping or
  // being shoved off a bank, ford or bridge into it): now, and at any time since the page
  // loaded, sampled every two seconds. A bridge's deck is dry; routers run where they can; a
  // regiment caught mid-swim is swimming, not standing.
  if (battle.river) await check(`${label}: nobody standing or fighting in deep water`, () => {
    const out = [], deep = s => live(s) && battle.waterAt(s.x, s.z) >= 2 && !battle.river.onBridge?.(s.x, s.z);
    for (const r of regs) {
      if (r.routing) continue;
      const now = r.soldiers.filter(s => deep(s) && ((!r.dest && !r.targetReg) || (s.target && !r.swim))).length, k = wetStand.get(r);
      if (now) out.push(`${r.name} (side ${r.side}): ${now} of ${r.alive} men standing or fighting in deep water now, at ${at({ x: r.cx, z: r.cz })}`);
      else if (k && k.n >= WET) out.push(`${r.name} (side ${r.side}): ${k.n} men standing or fighting in deep water at ${Math.round(k.at)}s, ${at(k)}`);
    }
    return sample(out);
  });

  // Regiments cross by a ford or bridge (battle.js riverWay) unless it is a long detour and they
  // swim (r.swim): men in the deep channel on the march of a regiment that isn't swimming
  // strayed or were shoved in.
  if (battle.river) await check(`${label}: nobody in deep water on the march but a swim`, () => {
    const out = [];
    for (const r of battle.regs) {
      const k = wetMarch.get(r);
      if (k && k.n >= WET) out.push(`${r.name} (side ${r.side}): ${k.n} men in deep water at once on the march, not swimming, at ${Math.round(k.at)}s, ${at(k)}`);
    }
    return sample(out);
  });

  const solid = town ? town.buildings.filter(b => b.state === 'active' && b.B.radius) : [];
  if (town) await check(`${label}: nobody inside a building`, () => {
    const out = [];
    const inside = (o, what) => {
      for (const b of solid) {
        if (b.B.gather?.node === 'field' && o.job === b) continue;   // a farm's footprint is its field, worked by its own people
        if (Math.hypot(o.x - b.x, o.z - b.z) < b.B.radius * 0.6) { out.push(`${what} inside the ${b.B.name} at ${at(b)}`); return; }
      }
      const k = town.keep;
      if (Math.hypot(o.x - k.x, o.z - k.z) < k.B.radius * 0.6) out.push(`${what} inside the keep`);
    };
    for (const v of town.villagers) if (!v.hidden && v.state !== 'soldier') inside(v, `villager ${v.id} (${v.state})`);
    for (const r of regs) { const s = r.soldiers.find(s => live(s) && !s.perch); if (s) inside(s, r.name); }
    return sample(out);
  });

  // (2026-11-20) Walkers once followed a road into a wall and went round by the gate and back.
  if (town) await check(`${label}: no walker's road runs through a wall`, () => {
    const out = [], nav = battle.nav;
    if (!nav.any) return out;
    for (const v of town.villagers) {
      const r = v.roadWay;
      if (!r?.pts?.length || r.i >= r.pts.length) continue;
      let a = v;
      for (const b of [...r.pts.slice(r.i), { x: r.tx, z: r.tz }]) {
        if (!nav.clear(0, a.x, a.z, b.x, b.z)) { out.push(`villager ${v.id} (${v.state}) is taking a road through a wall near ${at(b)}`); break; }
        a = b;
      }
    }
    return sample(out);
  });

  if (town) await check(`${label}: villagers and levies add up`, () => {
    const out = [];
    if (town.atWork + town.underArms !== town.population) out.push(`${town.atWork} at work + ${town.underArms} under arms ≠ ${town.population} people`);
    for (const v of town.villagers) {
      if (v.state === 'soldier' && !v.soldier) out.push(`villager ${v.id} is a soldier in no regiment`);
      if (v.state === 'soldier' && v.soldier && !v.soldier.alive && !v.dead) out.push(`villager ${v.id} is a fallen soldier still counted`);
    }
    for (const b of town.buildings) {
      for (const w of b.workers || []) if (!town.villagers.includes(w)) out.push(`the ${b.B.name} at ${at(b)} lists a worker who isn't in the village`);
      if ((b.workers?.length || 0) > town.jobs(b)) out.push(`the ${b.B.name} at ${at(b)} has ${b.workers.length} workers for ${town.jobs(b)} jobs`);
    }
    for (const r of regs) {
      if (!r.levy || r.side !== 0) continue;
      const men = town.villagers.filter(v => v.soldier?.reg === r && v.soldier.alive).length;
      if (men !== r.alive) out.push(`${r.name}: ${r.alive} men standing, ${men} of them villagers`);
      // the militia learn nothing a hall would train (economy.js blooded, disband)
      if (r.T.militia && (r.xp || r.vet)) out.push(`${r.name} are militia but carry experience (xp ${r.xp}, rank ${r.vet || 0})`);
    }
    return sample(out);
  });

  // An army marching into a village forms up beside the road it came in by, each regiment on
  // its own ground (economy.js formUp): not inside another regiment, on a building, the
  // keep, a wall, a road or a lane. A Count's host of 270 men by every road, then a second
  // host after it, laid out on this village as it stands; nothing is added to it.
  if (town && !town.hostile) await check(`${label}: armies marching in form up, each regiment on its own ground`, async () => {
    const { TYPES, filesFor } = await import('./battle.js');
    const host = [['knight', 20], ['cav', 20], ['spear', 60], ['sword', 60], ['archer', 40], ['crossbow', 40], ['maa', 30]];
    const make = () => host.map(([key, count]) => ({ T: TYPES[key], name: `${count} ${TYPES[key].name.toLowerCase()}`, count, alive: count, files: filesFor(TYPES[key], count), formation: 'line', side: 0 }));
    const overlap = (a, b) => town.blockPoints(a).some(p => town.inBlock(b, p, 1)) || town.blockPoints(b).some(p => town.inBlock(a, p, 1));
    const out = [];
    for (const angle of town.roadAngles?.length ? town.roadAngles : [0]) {
      const road = `the road at ${Math.round(angle * 180 / Math.PI)}°`;
      let taken = town.takenGround([]);
      for (const n of [1, 2]) {
        const regs = make();
        town.formUp(regs, angle, 40, taken);
        const blocks = regs.map(r => town.block(r, r.dest.x, r.dest.z, r.dest.angle));
        blocks.forEach((k, i) => {
          const r = regs[i];
          if (town.groundCost(k, [], [], true) === Infinity) out.push(`host ${n} by ${road}: the ${r.name} stand on a building, the keep, a wall, a road or a lane`);
          if (taken.some(o => overlap(k, o))) out.push(`host ${n} by ${road}: the ${r.name} stand in a regiment already there`);
          for (let j = 0; j < i; j++) if (overlap(k, blocks[j])) out.push(`host ${n} by ${road}: the ${r.name} stand in the ${regs[j].name}`);
        });
        taken = taken.concat(blocks);
      }
    }
    return sample(out);
  });

  // At peace a save can be made, and a save keeps neither soldiers outside a regiment nor
  // a routing regiment (save.js snapshot): such villagers would be lost.
  if (town) await check(`${label}: at peace, every soldier villager stands in a regiment`, () => {
    if (town.underAttack || town.hostile) return null;
    const out = [];
    for (const v of town.villagers) {
      if (v.state !== 'soldier') continue;
      const r = v.soldier?.reg;
      if (!v.soldier || !live(v.soldier) || !r || r.gone) out.push(`villager ${v.id} is a soldier with no living place in a regiment`);
      else if (r.routing) out.push(`villager ${v.id} is a soldier in ${r.name}, still routing after the fight`);
    }
    return sample(out);
  });

  // Raiders on your village's own land can be seen, so they can be clicked and answered; in
  // the trees they were hidden from a retinue and a right-click alike (economy.js openGround).
  if (town) await check(`${label}: raiders on the village's land are never hidden`, () => {
    if (!town.underAttack || town.hostile) return null;
    const og = town.battle.openGround, out = [];
    if (!og) return [`no open ground is set while ${town.attackers.length} attacking band(s) are in the village`];
    for (const g of town.attackers) for (const r of g.regs) {
      if (!r.gone && r.unseen && Math.hypot(r.cx - og.x, r.cz - og.z) < og.r) out.push(`${r.name} are hidden ${Math.round(Math.hypot(r.cx - og.x, r.cz - og.z))} m from the keep`);
    }
    return out;
  });

  // The militia can only be called out while the village is attacked (townhud.js).
  if (town && town === shownTown()) await check(`${label}: no Muster or Stand down at peace`, () => {
    if (town.underAttack) return null;
    const shown = [...document.querySelectorAll('#stock [data-act="muster"], #stock [data-act="standdown"]')].filter(el => el.offsetParent !== null);
    return shown.map(el => `the "${el.firstChild?.textContent.trim()}" button shows with no attack on`);
  });

  // The stuck badges (townlabels.js): the strip's counts add up to the stuck buildings, and the badges show
  // one per stuck building until there are many.
  if (town && town === shownTown() && !town.hostile) await check(`${label}: the stuck strip counts the stuck buildings`, async () => {
    const { STUCK, AFTER, FEW, MANY } = await import('./townlabels.js');
    const stuck = [town.keep, ...town.buildings].filter(b => b.state !== 'ruined' && !b.removed && STUCK.test(b.status || '') && b.stuckSince != null && town.time - b.stuckSince >= AFTER);
    const strip = document.querySelector('.town-labels .stuck-strip'), chips = strip && !strip.hidden ? [...strip.querySelectorAll('[data-k] b')].reduce((n, e) => n + +e.textContent, 0) : 0;
    // (a building behind the camera has no badge to draw)
    const cam = window.game.stage?.camera, V = cam?.position.constructor;
    const seen = stuck.filter(b => !cam || new V(b.x, town.heightAt(b.x, b.z) + (b.B.radius || 4) * 1.4 + 3, b.z).project(cam).z <= 1);
    const badges = document.querySelectorAll('.town-labels .stuck:not(.prio)').length, out = [];
    if (chips !== (stuck.length > FEW ? stuck.length : 0)) out.push(`${stuck.length} buildings stuck, the strip counts ${chips}`);
    if (stuck.length <= MANY && badges !== seen.length) out.push(`${stuck.length} buildings stuck (${seen.length} in front of the camera), ${badges} badges`);
    if (stuck.length > MANY && badges > 1) out.push(`${stuck.length} stuck: only the badge under the pointer should show, ${badges} do`);
    return out;
  });

  if (town) await check(`${label}: nothing negative in any store`, () => {
    const out = storeProblems(town.holders(), label);
    for (const [g, n] of Object.entries(town.stock)) if (bad(n) || n < -1e-6) out.push(`stock of ${g} is ${n}`);
    if (bad(town.purse?.gold)) out.push(`purse holds ${town.purse?.gold} gold`);
    return sample(out);
  });
}

// ---- the world map ----

async function worldChecks(w) {
  const { FACTIONS } = await import('./world/world.js');
  const { builtCount } = await import('./world/holdings.js');
  const places = await import('./world/places.js');
  walledPlace = places.walledPlace;
  group = 'World';

  // The top bar on the map shows the map's own line, not the last fight's numbers (QC audit, 2026-11-21).
  if (window.game.mode === 'world') await check('the map bar shows no battle numbers', () =>
    /men standing/.test(document.getElementById('strength')?.textContent || '') ? [`it reads "${document.getElementById('strength').textContent}"`] : []);

  // An army marches at the pace of its slowest unit's class, in every setting of the march (world/march.js): horse
  // and dogs fastest, foot slower, engines slowest; A (the game's pace until one is chosen) is one pace for all, and
  // the world's marching step uses it.
  await check('marching: an army goes at its slowest unit, horse fastest and engines slowest', async () => {
    const { MARCH, MARCH_LIVE, marchClass, marchPace, armyStep } = await import('./world/march.js');
    const out = [], foot = [{ key: 'spear', count: 40 }], horse = [{ key: 'cav', count: 20 }], dogs = [{ key: 'wardog', count: 20 }], ram = [{ key: 'ram', count: 10 }];
    for (const S of Object.values(MARCH)) {
      const f = marchPace(S, foot), h = marchPace(S, horse), e = marchPace(S, ram);
      if (!(h >= f && f >= e)) out.push(`${S.key}: horse ${h}, foot ${f}, engines ${e} are not in order`);
      if (S.key !== 'A' && !(h > f * 1.4)) out.push(`${S.key}: horse ${h} is not clearly faster than foot ${f}`);
      if (marchPace(S, [...horse, ...foot]) !== f || marchPace(S, [...foot, ...ram]) !== e || marchPace(S, [...horse, ...dogs]) !== h) out.push(`${S.key}: a mixed army is not at its slowest unit's pace`);
    }
    if (marchClass([]) !== 'foot') out.push('an army with no units is not foot');
    const a = { units: foot, side: 1 }, was = w.march;
    w.march = MARCH.B;
    if (Math.abs(armyStep(w, a) - MARCH.B.foot * (w.winter ? 0.85 : 1)) > 1e-9) out.push('armyStep does not follow the world\'s setting');
    w.march = was;
    if (w.march !== MARCH_LIVE) out.push(`the world marches on ${w.march.key}, not the chosen setting ${MARCH_LIVE.key}`);
    return out;
  });

  // Every timer that waits on marching is scaled to the pace the game runs on (world/march.js SLOW; the creator chose C
  // with the raid break-off at 30 s, 2026-11-23): partners can reach a meeting, a host's gathering and the herald's words
  // agree, a call-out of the ban leaves time in the field, carts feed an army as far as they used to, and wagons keep up.
  await check('marching: the timers that wait on it follow the pace', async () => {
    const { MARCH_LIVE, SLOW, marchPace } = await import('./world/march.js');
    const { HOST_GATHER } = await import('./world/diplomacy.js'), { MEET_WAIT } = await import('./world/rivals.js');
    const { ARRIERE } = await import('./world/arriere.js'), { CARRY, EAT } = await import('./world/supply.js'), { RELIEF } = await import('./economy.js');
    const out = [], foot = marchPace(MARCH_LIVE, [{ key: 'spear', count: 1 }]), tol = 0.98;
    if (HOST_GATHER < 120 * SLOW * tol) out.push(`the league's host gathers for ${HOST_GATHER} s: partners at 600 units need ${Math.round(600 / foot)} s and the strike window was 120 s of a 6-a-second march`);
    if (MEET_WAIT < 300 * SLOW * tol) out.push(`a meeting host waits ${MEET_WAIT} s: its partners' men at 600 units take ${Math.round(600 / foot)} s`);
    if (MEET_WAIT < 600 / foot * 1.5) out.push(`a meeting host waits ${MEET_WAIT} s, but its partners' men from 600 units take ${Math.round(600 / foot)} s to come`);
    const reach = CARRY / EAT * foot;
    if (reach < 1400) out.push(`an army's carts feed it ${Math.round(reach)} units of road; four minutes at the old pace was 1440`);
    const field = ARRIERE.serve - 2 * 400 / foot;
    if (field < 300) out.push(`a call-out of the ban lasts ${ARRIERE.serve} s, of which marching two places in and out takes ${Math.round(2 * 400 / foot)}: ${Math.round(field)} s in the field`);
    if (RELIEF.eta !== 30) out.push(`the raid break-off is ${RELIEF.eta} s, the creator's choice was 30`);
    return out;
  });

  // Winter food (seasons plan part 2, 2026-11-23): outside its own lands an army eats half again as much in winter, yours
  // and the houses' alike; in its own lands, or out of winter, nothing changes. The slow march with the snow's 0.85 still
  // gets a ram train to a place two roads off before the carts run dry.
  await check('winter: an army abroad eats half again as much, one at home does not', async () => {
    const Sup = await import('./world/supply.js'), { marchPace, MARCH_LIVE } = await import('./world/march.js');
    const out = [], was = w.time, home = w.pois.find(p => p.owner === 0 && !p.town?.hostile);
    if (!home) return ['no place of yours to test at'];
    const spot = (side, x, z) => ({ side, x, z, units: [{ key: 'spear', count: 40 }], food: 100, name: 'check host' });
    // Your army 150 units off one of your places (in your lands, not at its table), and a house's far from any road.
    const mk = () => {
      let homeA = null;
      for (let i = 0; i < 8 && !homeA; i++) {
        const t = spot(0, home.x + 150 * Math.cos(i * Math.PI / 4), home.z + 150 * Math.sin(i * Math.PI / 4));
        if (Sup.homeland(w, t) && !Sup.fedAt(w, t)) homeA = t;
      }
      return { homeA, away: spot(1, 1e5, 1e5) };
    };
    const burn = (a, winter) => {
      w.time = winter ? 900 : 100;
      const food = a.food, saved = w.armies;
      w.armies = [a];
      Sup.supplyArmies(w, 10);
      w.armies = saved;
      return (food - a.food) / (40 * 10 * Sup.EAT);
    };
    for (const winter of [false, true]) {
      const { homeA, away } = mk();
      if (!homeA) { out.push('found no spot in your lands away from the table'); continue; }
      const h = burn(homeA, winter), f = burn(away, winter);
      if (Math.abs(h - 1) > 0.01) out.push(`${winter ? 'winter' : 'summer'}: an army in its own lands burned ${h.toFixed(2)}x what it eats`);
      const want = winter ? Sup.WINTER_EAT : 1;
      if (Math.abs(f - want) > 0.01) out.push(`${winter ? 'winter' : 'summer'}: an army abroad burned ${f.toFixed(2)}x, wanted ${want}x`);
    }
    // A besieging army forages, and winter still costs it half again.
    w.time = 900;
    const sg = spot(1, 1e5, 1e5); sg.siege = true;
    const sf = burn(sg, true);
    if (Math.abs(sf - 0.25 * Sup.WINTER_EAT) > 0.01) out.push(`a besieging army abroad in winter burned ${sf.toFixed(3)}x, wanted ${0.25 * Sup.WINTER_EAT}x`);
    // foodLeft agrees with the burn, so the warnings tell the truth.
    const t = spot(1, 1e5, 1e5);
    w.time = 100; const summer = Sup.foodLeft(w, t);
    w.time = 900; const winter = Sup.foodLeft(w, t);
    if (Math.abs(summer / winter - Sup.WINTER_EAT) > 0.01) out.push(`foodLeft: ${Math.round(summer)} s in summer but ${Math.round(winter)} s in winter`);
    // A ram train marching two places (400 units) in winter arrives well before its carts are empty.
    const ram = [{ key: 'spear', count: 40 }, { key: 'ram', count: 2 }];
    const trip = 400 / (marchPace(MARCH_LIVE, ram) * 0.85), have = Sup.CARRY / (Sup.EAT * Sup.WINTER_EAT);
    if (trip > have * 0.8) out.push(`a winter ram march of two places takes ${Math.round(trip)} s; its carts last ${Math.round(have)} s abroad in winter`);
    w.time = was;
    return out;
  });

  // Every place's layout (places.js): its whole tally laid out, nothing overlapping, walls as its numbers say.
  await check('places: every layout holds its tally', () => sample(places.checkPlaces(w), 10));

  await check('places: numbers are sane', () => {
    const out = [];
    for (const p of w.pois) {
      const e = p.eco;
      if (p.owner !== null && !FACTIONS[p.owner]) out.push(`${p.name}: owned by house ${p.owner}, which doesn't exist`);
      if (e && (bad(e.pop) || e.pop < 0)) out.push(`${p.name}: ${e.pop} people`);
      for (const [g, n] of Object.entries(e?.stock || {})) if (bad(n) || n < -1e-6) out.push(`${p.name}: ${n} ${g} in store`);
      for (const [k, n] of Object.entries(e?.buildings || {})) if (bad(n) || n < 0 || n % 1) out.push(`${p.name}: ${n} × ${k}`);
      for (const u of p.garrison || []) if (bad(u.count) || u.count < 0 || u.count % 1) out.push(`${p.name}: garrison ${u.name} has ${u.count} men`);
    }
    return sample(out);
  });

  // The arrière-ban (world/arriere.js): the preview's men and price follow the rank, and a
  // levy's time home survives the trips between map, village and garrison.
  await check('the arrière-ban: preview and time home', async () => {
    const A = await import('./world/arriere.js'), { carry } = await import('./economy.js'), { mergeInto } = await import('./world/world.js');
    const out = [], P = A.arrierePlan(w, w.home), per = A.ARRIERE.per[w.rank] || 0;
    if (P.men !== per * P.places.length) out.push(`preview says ${P.men} men from ${P.places.length} places at ${per} each`);
    if (P.gold !== P.men * A.ARRIERE.gold) out.push(`preview asks ${P.gold} gold for ${P.men} men`);
    if (per && P.places.some(p => p.owner !== 0)) out.push('a place not yours would answer');
    const g = [];
    mergeInto(g, [{ key: 'militia', count: 50, name: 'test', until: 99 }, { key: 'militia', count: 10, name: 'test' }]);
    if (carry({ key: 'militia', until: 99 }).until !== 99) out.push('carry() drops the time home');
    if (g.filter(u => u.until === 99).reduce((n, u) => n + u.count, 0) !== 50) out.push('a garrison merges levies with men who stay');
    return out;
  });

  // Great vassals' claims (world/claims.js): each names a real place of yours they don't hold.
  await check('great vassals: every claim names a place of yours they do not hold', async () => (await import('./world/claims.js')).claimProblems(w));

  // Your vassals raise a host for a call as a house does (Orchestrator, 2026-11-22; World.
  // vassalDraft): their share of the people their place can spare, armed from its stores, on
  // top of their share of its guard; the banners' preview counts them and takes nothing.
  await check('vassals: a call raises their share of the people they can spare, and the preview counts them', async () => {
    const { vassalOf } = await import('./world/vassals.js'), { housing } = await import('./world/holdings.js'), { headcount } = await import('./world/world.js');
    const out = [], dest = w.home, plan = w.bannerPlan(dest);
    for (const p of w.pois.filter(p => p.vassal && p.owner === 0 && p !== dest && p.eco?.buildings)) {
      const v = vassalOf(w, p), e = p.eco, was = JSON.stringify([e.pop, e.stock, p.garrison]);
      const fresh = headcount(w.vassalDraft(v, p, true)), most = Math.round(w.vassalShare(v) * Math.max(0, e.pop - Math.max(12, housing(e) * 0.4)));
      if (JSON.stringify([e.pop, e.stock, p.garrison]) !== was) out.push(`counting ${v.name}'s men at ${p.name} took people or kit`);
      if (fresh > most) out.push(`${v.name} would raise ${fresh} at ${p.name}, more than their share ${most} of those who can be spared`);
      const row = plan.vassals.find(r => r.p === p);
      if (row && !row.refusing && row.men < fresh) out.push(`the banners' preview counts ${row.men} from ${v.name}, fewer than the ${fresh} they raise`);
    }
    return out;
  });

  // Rival hosts (world/rivals.js): no house's plan sits in muster past three minutes while
  // it could march, or while it has arms and people and raises nobody.
  await check('rival houses: no muster stalls with arms and men', async () => (await import('./world/rivals.js')).musterProblems(w));

  // A house plays by your rules (rivals.js chooseStance): a man raised is a person taken
  // from work, and its stance follows what it faces.
  await check('rival houses: raised men lower production', async () => {
    const H = await import('./world/holdings.js');
    const p = w.pois.find(p => p.owner > 0 && p.eco?.buildings && !p.vassal && p.eco.pop - 12 > 20);
    if (!p) return [];
    const run = n => {
      const q = { ...p, eco: structuredClone(p.eco) };
      const men = n ? H.arm(q.eco, n, 12).reduce((k, u) => k + u.count, 0) : 0;
      // what the hands made, leaving out the food the people eat
      const goods = () => H.worth(Object.fromEntries(Object.entries(q.eco.stock).filter(([g]) => g !== 'food' && g !== 'bread')));
      const pop = q.eco.pop, before = goods();
      H.runEconomy(q, 60);
      return { men, pop, made: goods() - before };
    };
    const a = run(0), b = run(20), out = [];
    if (b.men && Math.abs(a.pop - b.pop - b.men) > 0.01) out.push(`raising ${b.men} men left ${p.name} ${a.pop - b.pop} fewer people`);
    // (one or two men raised from a place already short of goods are noise: one mouth fewer can outweigh their work)
    if (b.men >= 5 && b.made > a.made + 1e-6) out.push(`${p.name} made more with ${b.men} men under arms (${b.made.toFixed(1)} against ${a.made.toFixed(1)})`);
    return out;
  });
  await check('rival houses: stance follows their situation', async () => {
    const R = await import('./world/rivals.js'), out = [];
    const say = (s, war) => { if ((R.stanceScore(s) > 0.5) !== war) out.push(`${s.temper} ${JSON.stringify(s)} should be ${war ? 'arming' : 'building'}`); };
    say({ temper: 'raider', wars: true, threat: true, prey: false, larder: 10, stage: 2 }, true);
    say({ temper: 'turtler', wars: false, threat: true, prey: false, larder: 10, stage: 1 }, true);
    say({ temper: 'builder', wars: false, threat: false, prey: false, larder: 1, stage: 2 }, false);
    say({ temper: 'merchant', wars: false, threat: false, prey: true, larder: 10, stage: 1 }, false);
    say({ temper: 'hothead', wars: false, threat: false, prey: true, larder: 10, stage: 1 }, true);
    // Ambition: a settled house with nothing left to take arms in time, a builder too, but not at once.
    say({ temper: 'builder', wars: false, threat: false, prey: false, larder: 1, stage: 2, ambition: R.ambitionOf('builder', 3000) }, true);
    say({ temper: 'raider', wars: false, threat: false, prey: false, larder: 1, stage: 2, ambition: R.ambitionOf('raider', 60) }, false);
    for (const h of FACTIONS) if (h.alive && h.index && !h.bandit && !h.invader && h.ai?.stance && !(h.ai.stance in R.STANCE)) out.push(`${h.name} has stance ${h.ai.stance}`);
    return out;
  });

  // Gold as a limit (Orchestrator, 2026-11-21): a glutted market pays less, and no place hoards
  // more coin than its strongbox holds.
  await check('treasury: markets glut and places keep only a strongbox', async () => {
    const E = await import('./economy.js'), { COFFER } = await import('./world/world.js'), out = [];
    // A glutted market pays less, and mends within a few minutes.
    const G = {};
    E.glut(G, 'wood', E.GLUT.half, 0);
    if (Math.abs(E.priceShare(G, 'wood', 0) - 0.5) > 1e-9) out.push(`a market that has just sold ${E.GLUT.half} wood pays ${E.priceShare(G, 'wood', 0).toFixed(2)} of the price, not half`);
    if (E.priceShare(G, 'wood', 300) !== 1) out.push('five minutes on, the glut has not mended');
    for (const p of w.pois) if (p.eco?.buildings && !p.town && (p.eco.gold || 0) > p.eco.pop * COFFER + 50) out.push(`${p.name} hoards ${Math.round(p.eco.gold)} gold, past its strongbox of ${Math.round(p.eco.pop * COFFER)}`);
    return out;
  });

  // Tax from development, not heads (creator, 2026-11-22: "think like ck2 taxes"): the starter
  // village pays 8 to 10 a minute, a built-up Lord's home 25 to 35, a built-up town of 160 with
  // a market 55 to 65; a bare village of 160 far less; each more of a kind adds half; a market
  // pays on its trade; and every village of yours pays what its buildings say.
  await check('treasury: tax comes from what a place has built, more than from its people', async () => {
    const E = await import('./economy.js'), { KINDS } = await import('./world/realm.js'), out = [];
    const rate = mood => Object.getOwnPropertyDescriptor(E.Town.prototype, 'taxRate').get.call({ taxes: 2, mood });
    const say = (what, gold, lo, hi) => { if (gold < lo || gold > hi) out.push(`${what} pays ${gold.toFixed(1)} a minute, not ${lo} to ${hi}`); };
    const LORD = [['woodcutter', 2], ['quarry', 1], ['mine', 1], ['hunter', 1], ['farm', 4], ['storehouse', 2], ['carpenter', 1], ['smelter', 1], ['weaponsmith', 1], ['mill', 1], ['bakery', 1], ['tanner', 1], ['bowyer', 1], ['market', 1], ['monastery', 1]];
    const TOWN = [['woodcutter', 3], ['quarry', 2], ['mine', 2], ['hunter', 1], ['farm', 8], ['flax', 1], ['storehouse', 3], ['carpenter', 2], ['ropemaker', 1], ['smelter', 2], ['bowyer', 1], ['tanner', 1], ['mill', 2], ['bakery', 2], ['weaponsmith', 2], ['armourer', 1], ['stable', 1], ['market', 1], ['monastery', 1]];
    say('the starter village (12 people, two houses, mood 60)', E.devTax(12, [], 1) * rate(60), 8, 10);
    say('a built-up Lord\'s home (60 people, keep 3, mood 70)', E.devTax(60, LORD, 3) * rate(70), 25, 35);
    say('a built-up town of 160 with a market (keep 4, mood 70)', E.devTax(160, TOWN, 4) * rate(70), 55, 65);
    if (!(E.devTax(160, [], 4) < E.devTax(160, TOWN, 4) * 0.6)) out.push('a bare village of 160 pays as much as a built-up one');
    if (Math.abs(E.devOf([['mill', 3]]) - 2 * E.DEV_TAX.mill) > 1e-9) out.push(`three mills add ${E.devOf([['mill', 3]])}, not twice one`);
    const p = {};
    E.noteTrade(p, 100); E.settleTrade(p, 60);
    if (!(p.tradeRate > 0)) out.push('trade done at a market leaves no trace for its dues');
    for (const q of w.pois) if (q.owner === 0 && q.town && !q.town.hostile) {
      const t = q.town, want = (E.devTax(t.population, t.devCounts(), E.keepLevel(t)) + w.duesOf(q)) / 60 * t.taxRate * KINDS[q.kind].gold;
      if (w.taxOf(q) + 1e-9 < want) out.push(`${q.name} pays ${(w.taxOf(q) * 60).toFixed(1)} a minute, under its development's ${(want * 60).toFixed(1)}`);
    }
    return out;
  });

  // A governor develops a place for tax (Orchestrator, 2026-11-22): one building every few
  // minutes from its own stores, by what is gathered there, a market only in a market town,
  // never a military one; a governed home of 160 ends near 45 a minute, under one built by hand.
  await check('governor: develops a place for tax, slowly, by what it gathers', async () => {
    const E = await import('./economy.js'), G = await import('./world/governor.js'), out = [];
    const rate = Object.getOwnPropertyDescriptor(E.Town.prototype, 'taxRate').get.call({ taxes: 2, mood: 70 });
    const GATHER = [['woodcutter', 4], ['quarry', 2], ['mine', 1], ['hunter', 2], ['farm', 10], ['storehouse', 3], ['market', 1], ['monastery', 1]];
    // A stand-in village run for two hours of governor turns: what it builds, and when.
    const stub = (kind, pop) => ({ kind, population: pop, time: 0, devCounts: E.Town.prototype.devCounts, stock: { wood: 200, ore: 80, hides: 40, food: 400, flour: 20 },
      buildings: GATHER.flatMap(([k, n]) => Array.from({ length: n }, () => ({ kind: k, state: 'active' }))) });
    const run = (kind, pop) => {
      const t = stub(kind, pop), built = [];
      for (; t.time < 7200; t.time += 15) { const k = G.develop(t); if (k) { built.push([k, t.time]); t.buildings.push({ kind: k, state: 'active' }); t.govDevAt = t.time; } }
      return { t, built };
    };
    const v = run('village', 160), m = run('market', 160);
    for (const [k, at] of [...v.built, ...m.built]) {
      if (E.BUILDINGS[k].group === 'Military' || ['weaponsmith', 'armourer', 'bowyer', 'barracks'].includes(k)) out.push(`it built a ${k}`);
      if (E.BUILDINGS[k].cost.gold) out.push(`a ${k} costs gold`);
    }
    const gaps = v.built.slice(1).map(([, at], i) => at - v.built[i][1]);
    if (gaps.some(g => g < 120)) out.push(`two buildings ${Math.min(...gaps)} s apart`);
    if (v.built.filter(([k]) => k === 'market').length) out.push('a village got a market');
    if (!m.built.length) out.push('a market town got nothing');
    const gold = E.devTax(160, v.t.devCounts(), 3) * rate;
    if (gold < 40 || gold > 50) out.push(`a governed village of 160 (keep 3) pays ${gold.toFixed(1)} a minute, not 40 to 50 (${v.built.map(b => b[0]).join(', ')})`);
    const busy = Object.assign(stub('village', 160), { time: 1000, govDevAt: 940 });
    if (G.develop(busy)) out.push('it builds again a minute after the last');
    if (!G.develop(Object.assign(busy, { govDevAt: 700 }))) out.push('it builds nothing in an undeveloped village');
    // A workshop only where it can be fed: no tannery without hunters, no more of one with nothing to work.
    const bare = stub('village', 160); bare.buildings = bare.buildings.filter(b => b.kind !== 'hunter' && b.kind !== 'mine'); bare.stock = {};
    for (let i = 0; i < 12; i++) { const k = G.develop(Object.assign(bare, { time: i * 200, govDevAt: i * 200 - 200 })); if (!k) break; if (['tanner', 'smelter'].includes(k) || bare.buildings.some(b => b.kind === k)) out.push(`with nothing to feed it, it built a ${k}`); bare.buildings.push({ kind: k, state: 'active' }); }
    for (const q of w.pois) if (q.owner === 0 && q.town && !q.town.hostile && !/^Governor: (on|off|building an? )/.test(G.govText(q.town))) out.push(`${q.name}'s keep says "${G.govText(q.town)}"`);
    return out;
  });

  // A hopeless place runs or yields and survives (creator, 2026-11-22: "they should run and
  // survive rather than all stay to get massacred"): one rule for your places, a rival's and
  // the free folk's. Played on throwaway worlds of seed 7; the houses of this one are put back.
  const scratch = async fn => {
    const { World, FACTIONS } = await import('./world/world.js'), mine = [...FACTIONS];
    try {
      const make = () => { const s = new World(7, {}, { size: 'normal', aggression: 'normal' }); s.hooks = new Proxy({ watching: () => null }, { get: (o, k) => (k in o ? o[k] : () => {}) }); s.log = () => {}; return s; };
      return await fn(make, FACTIONS);
    } finally { FACTIONS.length = 0; FACTIONS.push(...mine); }
  };
  const HOST = () => [{ key: 'spear', count: 120, name: 'Ban' }, { key: 'maa', count: 20, name: 'Guard' }, { key: 'knight', count: 20, name: 'Lances' }, { key: 'crossbow', count: 30, name: 'Crossbows' }];
  const FAIR = () => [{ key: 'spear', count: 40, name: 'Spears' }, { key: 'archer', count: 12, name: 'Bows' }];
  const village60 = (s, name) => { const p = s.pois.find(q => q.name === name); p.eco.pop = 60; p.garrison = [{ key: 'spear', count: 20, name: `${name} spears` }]; return p; };

  // Norrhold holds out longer than a house before its garrisons ask for terms (creator, 2026-11-22).
  await check('Norrhold is slower to ask for terms than a house, and its sieges take longer to starve out', async () => {
    const M = await import('./world/militia.js'), { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js'), out = [];
    if (!(M.gritOf({ invader: true }) < 1)) out.push(`Norrhold's grit is ${M.gritOf({ invader: true })}, no stubborner than a house`);
    if (M.gritOf({ bandit: true }) !== 1 || M.gritOf(null) !== 1 || M.gritOf({}) !== 1) out.push('a house, outlaws or free folk hold out differently from the rules');
    const b = new Battle(makeHeight(4), 4, { deploy: false });
    if (!b.grit || b.grit.length !== 2 || b.grit.some(x => x !== 1)) out.push('a new battle does not start both sides at a house\'s grit');
    return out;
  });

  // A place taken sees its army march in in victory (parade.js; creator, 2026-11-22: "I want them to look sick as
  // they parade in in victory"): every regiment in column, together at one pace, onto its own ground, where it opens
  // out into its line and every man cheers, all within the show (about 15 s); and an order to any regiment ends it
  // at once, that regiment keeping its order and the rest going to their ground in their own lines. A walled castle
  // and an open village, with a host of eight kinds.
  await check('victory march: a place taken sees its army march onto its ground in column, cheer, and stop at an order', () => scratch(async make => {
    const { SHOW } = await import('./parade.js'), out = [];
    const host = () => [['knight', 20], ['serjeant', 40], ['spear', 60], ['sword', 50], ['archer', 40], ['yeoman', 30], ['maa', 30], ['cav', 20]].map(([key, count]) => ({ key, count, name: key }));
    const take = (s, name) => {
      const p = s.pois.find(q => q.name === name), a = s.spawnArmy(0, host(), p.links[0], 'Victors', 'march');
      a.last = p.links[0];
      s.capture(p, a, 'yielded', []);
      return p.town.battle;
    };
    for (const name of ['Greyley Castle', 'Brackholm']) {
      const s = make(), B = take(s, name), P = B.parade;
      if (!P) { out.push(`${name}: no march`); continue; }
      const go = P.list.filter(e => e.stage === 'wait');
      if (go.length < P.list.length / 2) out.push(`${name}: only ${go.length} of ${P.list.length} regiments march`);
      for (const e of go) if (e.r.files !== e.cf || e.cf >= e.files) out.push(`${name}: the ${e.r.name} wait in ${e.r.files} files, not a column narrower than their ${e.files}`);
      P.seen = true;
      const cheered = new Set();
      let t = 0;
      for (; t < SHOW + 5 && B.parade; t += 0.25) { s.update(0.25); for (const e of go) for (const q of e.r.soldiers) if (q.cheerAt != null) cheered.add(q); }
      if (B.parade) out.push(`${name}: the march still running after ${t} s`);
      else if (t > SHOW + 0.5) out.push(`${name}: the march took ${t} s`);
      for (const e of go) {
        const r = e.r, men = r.soldiers.filter(q => q.alive && !q.gone && !q.captain);
        if (Math.hypot(r.x - e.ground.x, r.z - e.ground.z) > 3) out.push(`${name}: the ${r.name} ended ${Math.hypot(r.x - e.ground.x, r.z - e.ground.z).toFixed(1)} m from their ground`);
        if (r.files !== e.files) out.push(`${name}: the ${r.name} stand in ${r.files} files, not their ${e.files}`);
        const quiet = men.filter(q => !cheered.has(q)).length;
        if (quiet) out.push(`${name}: ${quiet} of the ${r.name} never cheered`);
      }
    }
    // an order two seconds in
    const s = make(), B = take(s, 'Brackholm'), P = B.parade;
    P.seen = true;
    for (let t = 0; t < 2; t += 0.25) s.update(0.25);
    const e0 = P.list.find(e => e.stage === 'march'), r0 = e0.r;
    B.orderMove([r0], r0.x + 30, r0.z, 0);
    const order = r0.dest;
    s.update(0.05);
    if (B.parade) out.push('an order did not end the march');
    if (r0.dest !== order) out.push(`the ${r0.name}, ordered, did not keep the order`);
    for (const e of P.list) if (e !== e0 && e.stage !== 'done') out.push(`the ${e.r.name} are still marching after the order`);
    for (const e of P.list) if (e !== e0 && (e.r.files !== e.files || (e.r.dest && Math.hypot(e.r.dest.x - e.ground.x, e.r.dest.z - e.ground.z) > 0.5))) out.push(`after the order the ${e.r.name} were not sent to their ground in their own lines`);
    return out;
  }));

  await check('militia: a place\'s people turn out when outnumbered, and stay home against hopeless odds', async () => {
    const M = await import('./world/militia.js'), E = await import('./economy.js'), out = [];
    const p = { name: 'Testby', kind: 'village', eco: { pop: 60 }, garrison: [{ key: 'spear', count: 20 }] };
    const fair = M.turnOut(p, FAIR(), null), big = M.turnOut(p, HOST(), null);
    if (fair.reduce((n, u) => n + u.count, 0) !== 60) out.push(`against a fair fight ${fair.reduce((n, u) => n + u.count, 0)} of 60 turned out`);
    if (big.length) out.push(`against a host five times its strength ${big.reduce((n, u) => n + u.count, 0)} turned out`);
    if (!M.yields(p, HOST(), null) || M.yields(p, FAIR(), null)) out.push(`yields: ${M.yields(p, HOST(), null)} to the host, ${M.yields(p, FAIR(), null)} to a fair fight`);
    // Your own village by the same test: everyone who could be called out, and its soldiers.
    const regs = units => units.map(u => ({ T: { key: u.key }, alive: u.count, side: 1 }));
    const town = g => ({ attackers: [{ mode: 'assault', regs: regs(g) }], battle: { regs: [{ T: { key: 'spear' }, alive: 20, side: 0 }] }, musterCheck: () => ({ ok: true, n: 60 }), strength: E.Town.prototype.strength });
    if (!E.Town.prototype.hopeless.call(town(HOST())) || E.Town.prototype.hopeless.call(town(FAIR()))) out.push('your village\'s hopeless() does not match the rivals\' test');
    if (!/hopeless\(\)/.test((await import('./world/governor.js')).govern.toString())) out.push('the governor musters without asking whether it is hopeless');
    return out;
  });

  await check('yield: an unwalled place yields on terms against hopeless odds, yours too, and its garrison marches out', () => scratch(async (make, FACTIONS) => {
    const { headcount } = await import('./world/world.js'), out = [];
    // You storm an unwalled rival village: it asks for terms within a second of the fight.
    for (const [label, army, want] of [['a host', HOST, true], ['a fair force', FAIR, false]]) {
      const s = make(), p = village60(s, 'Redgate');
      p.owner = 1;
      const a = s.spawnArmy(0, army(), p.links[0], 'Host', 'march'); a.last = p.links[0];
      s.storm({ kind: 'assault', army: a, poi: p, defenders: p.garrison });
      const b = p.town.battle;
      if (b.walls.structures().some(q => q.side === 1)) { out.push('Redgate is walled: pick another'); break; }
      b.beginBattle();
      for (let i = 0; i < 30 && !b.terms; i++) b.step(0.05);
      if (!!b.terms !== want) out.push(`stormed by ${label}, Redgate ${b.terms ? 'asked' : 'did not ask'} for terms`);
      if (want && b.terms) {
        b.acceptTerms();
        for (let i = 0; i < 10 && p.owner !== 0; i++) { b.step(0.05); s.checkStorm(p); }
        if (p.owner !== 0) out.push('Redgate accepted terms but is not yours');
        if (!s.armies.some(x => x.side === 1 && headcount(x.units) >= 15)) out.push('its garrison did not march out to House ' + FACTIONS[1].name);
      }
    }
    // A rival's host on a rival's village: it yields, and its garrison marches out.
    {
      const s = make(), p = village60(s, 'Hollwick');
      p.owner = 2;
      const a = s.spawnArmy(1, HOST(), p.links[0], 'Host', 'march');
      s.autoAssault(a, p);
      if (p.owner !== 1) out.push('a rival\'s host did not take Hollwick');
      if (!s.armies.some(x => x.side === 2 && headcount(x.units) >= 15)) out.push('Hollwick\'s garrison did not march out under arms');
    }
    // Your own unwalled home: its people stay in, and the yield is offered.
    {
      const s = make(), p = s.home, t = p.town;
      for (let i = 0; i < 48; i++) t.addVillager(Math.sin(i) * 10, Math.cos(i) * 10);
      const a = s.spawnArmy(1, HOST(), p.links[0], 'Host', 'march'); a.mode = 'march';
      s.attackTown(a, p, p.links[0]);
      for (let i = 0; i < 40 && !t.battle.terms; i++) s.update(0.05);
      if (t.militia.length) out.push('your home\'s people turned out against a host five times its strength');
      if (t.battle.terms?.side !== 0) out.push('your unwalled home was not offered a yield');
    }
    return out;
  }));

  await check('capture: the same share of people stay for every house, by storm or on terms, and the fled come home', () => scratch(async make => {
    const M = await import('./world/militia.js'), out = [];
    const near = (x, lo, hi, what) => { if (!(x >= lo && x <= hi)) out.push(`${what}: ${x}, not ${lo} to ${hi}`); };
    for (const how of ['storm', 'yielded']) {
      const [lo, hi] = how === 'storm' ? [40, 44] : [51, 55];
      const s = make(), p = village60(s, 'Hollwick'), q = village60(s, 'Langford');
      const a = s.spawnArmy(0, FAIR(), p.links[0], 'Host', 'march'); a.last = p.links[0];
      s.capture(p, a, how);
      near(p.town.population, lo, hi, `you take a village of 60 (${how}): it keeps`);
      q.owner = 2;
      s.tookBy(s.spawnArmy(1, FAIR(), q.links[0], 'Host', 'march'), q, how);
      near(Math.round(q.eco.pop), lo, hi, `a rival takes a village of 60 (${how}): it keeps`);
      const home = s.home;
      for (let i = home.town.population; i < 60; i++) home.town.addVillager(Math.sin(i) * 10, Math.cos(i) * 10);
      if (how === 'yielded') home.town.yieldedOurs = [];
      home.town.attackers = [{ regs: [], mode: 'assault' }];
      s.fall(home);
      near(Math.round(home.eco.pop), lo, hi, `your village of 60 falls (${how}): it keeps`);
    }
    // Those who fled come home in a few minutes while fed and safe, and not otherwise.
    const f = { fled: M.handOver(60, 'storm').away }, g = { fled: M.handOver(60, 'storm').away };
    let back = 0, none = 0;
    for (let t = 0; t < 200; t++) { back += M.driftHome(f, 1, true); none += M.driftHome(g, 1, false); }
    near(Math.round(back), 17, 18, 'in 200 s fed and safe, of 18 who fled, back');
    if (none) out.push(`${none.toFixed(1)} came home to an unsafe place`);
    for (let t = 0; t < 500; t++) M.driftHome(g, 1, false);
    if (g.fled) out.push('those who fled wait on forever');
    return out;
  }));

  // A house's lost place sends its men and some of its people to the house's nearest other
  // place (creator, 2026-11-22: "TO THEIR NEAREST FRIENDLY VILLAGE... obviously some still
  // stay"); free folk have nowhere to go, so their men stay on as its people.
  await check('flee to kin: a lost place\'s garrison and fled people go to its house\'s nearest place; free folk stay', () => scratch(async (make, FACTIONS) => {
    const { headcount } = await import('./world/world.js'), out = [];
    const near = (x, lo, hi, what) => { if (!(x >= lo && x <= hi)) out.push(`${what}: ${x}, not ${lo} to ${hi}`); };
    const MEN = () => [{ key: 'spear', count: 15, name: 'Hollwick spears' }];
    const band = (s, side) => s.armies.filter(x => x.side === side && !x.gone && x.retreating);
    // You take a house's village of 60 by storm, and a rival takes another on terms.
    for (const [label, how, take] of [['you storm', 'storm', (s, p, a) => s.capture(p, a, 'storm', MEN())], ['a rival takes on terms', 'yielded', (s, p, a) => s.tookBy(a, p, 'yielded', MEN())]]) {
      const s = make(), p = village60(s, 'Hollwick');
      p.owner = 2;
      const kin = s.kinOf(2, p);
      if (!kin || kin.owner !== 2) { out.push(`${label}: house ${FACTIONS[2].name} has no place to flee to`); continue; }
      const road = q => s.route(p, q, s.safeFor(2)).length, nearest = s.pois.filter(q => q !== p && q.owner === 2 && (q.town || q.eco)).sort((x, y) => road(x) - road(y))[0];
      if (kin !== nearest) out.push(`${label}: they flee to ${kin.name}, not the nearest by road, ${nearest.name}`);
      const before = (kin.town || kin.eco).fled?.n || 0;
      take(s, p, s.spawnArmy(label === 'you storm' ? 0 : 1, FAIR(), p.links[0], 'Host', 'march'));
      const g = band(s, 2)[0];
      if (!g || headcount(g.units) !== 15 || g.target !== kin) out.push(`${label}: its 15 spearmen ${g ? `march to ${g.target?.name} with ${headcount(g.units)}` : 'did not march'}, not to ${kin.name}`);
      else if (g.path.slice(0, -1).some(q => !s.safeFor(2)(q))) out.push(`${label}: its band's road runs through ${g.path.find(q => !s.safeFor(2)(q)).name}, an enemy's place`);
      const kept = p.town ? p.town.population : Math.round(p.eco.pop), went = Math.round((kin.town || kin.eco).fled?.n || 0) - before;
      near(kept, how === 'storm' ? 40 : 51, how === 'storm' ? 44 : 55, `${label}: of 60 it keeps`);
      near(went, how === 'storm' ? 16 : 5, how === 'storm' ? 20 : 9, `${label}: of 60, fled to ${kin.name}`);
      if ((p.town || p.eco).fled) out.push(`${label}: those who fled ${p.name} still drift back to it`);
    }
    // A free village: its men stay on as its people, and those who fled drift back.
    {
      const s = make(), p = village60(s, 'Redgate');
      p.owner = null;
      const had = s.armies.length;
      s.capture(p, s.spawnArmy(0, FAIR(), p.links[0], 'Host', 'march'), 'storm', MEN());
      if (s.armies.slice(had).some(x => x.side !== 0)) out.push('a free village\'s men marched off');
      near(p.town.population, 51, 54, 'a free village of 60 with 15 men left: it keeps');
      near(Math.round(p.town.fled?.n || 0), 21, 24, 'a free village of 60 with 15 men left: drifting back');
    }
    // Stormed by hand, its broken men run off the field toward that place.
    {
      const s = make(), p = village60(s, 'Hollwick');
      p.owner = 2;
      const kin = s.kinOf(2, p), a = s.spawnArmy(0, FAIR(), p.links[0], 'Host', 'march'); a.last = p.links[0];
      if (!kin) { out.push(`stormed, ${p.name} has no place to flee to`); return out; }
      s.storm({ kind: 'assault', army: a, poi: p, defenders: p.garrison });
      const h = p.town.battle.homes[1], want = s.angle(p, kin), d = Math.abs(Math.atan2(Math.sin(Math.atan2(h.x, h.z) - want), Math.cos(Math.atan2(h.x, h.z) - want)));
      if (d > 0.05) out.push(`stormed, ${p.name}'s broken men run ${Math.round(d * 57)}° off the way to ${kin.name}`);
    }
    // Your village falls with another of yours near: your men and those who flee go there.
    {
      const s = make(), home = s.home, t = home.town, q = village60(s, 'Hollwick');
      q.owner = 0;
      for (let i = t.population; i < 60; i++) t.addVillager(Math.sin(i) * 10, Math.cos(i) * 10);
      t.attackers = [{ regs: [], mode: 'assault' }];
      const men = headcount(t.garrison().filter(r => r.alive > 0 && !r.T.militia).map(r => ({ count: r.alive })));
      s.fall(home);
      const g = band(s, 0)[0];
      if (men && (!g || g.target !== q)) out.push(`your fallen village's ${men} men ${g ? `march to ${g.target?.name}` : 'did not march'}, not to ${q.name}`);
      near(Math.round(home.eco.pop), 40, 44, 'your village of 60 falls: it keeps');
      near(Math.round(q.eco.fled?.n || 0), 16, 20, `your village of 60 falls: fled to ${q.name}`);
      if (home.eco.fled) out.push('those who fled your fallen village drift back to it');
    }
    return out;
  }));

  // Walls count the same between the houses as against you (Orchestrator, 2026-11-22): a
  // walled place stormed with no ram, ladders or engines counts its defenders ×1.4 (autoSides),
  // in a rival's assault too, and a house reckons its targets so.
  // Lose a fight to outlaws (or the north) and the kit of your fallen is theirs: their nearest
  // place was a camp with no stores, and World.loot threw (2026-11-23, since 6b65db8).
  await check('loot: the fallen\'s kit goes to a winner\'s place with stores; a camp with none never throws', () => scratch(async (make, FACTIONS) => {
    const out = [], s = make(), men = [{ key: 'maa', count: 20, name: 'Men-at-arms' }, { key: 'spear', count: 40, name: 'Spears' }];
    const camp = s.pois.find(p => p.kind === 'camp' && p.owner === s.bandits && !p.eco?.stock);
    if (!camp) return ['no outlaw camp without stores to test'];
    const at = { x: camp.x, z: camp.z };
    try { s.loot(men, [], s.bandits, at); } catch (e) { out.push(`outlaws winning by ${camp.name}: ${e.message}`); }
    if (camp.eco?.stock) out.push(`${camp.name} was given stores`);
    // A house's camp nearest the field: the kit goes to its nearest place with stores.
    const h = FACTIONS.find(f => f.index && f.ai && s.pois.some(p => p.owner === f.index && p.eco?.stock));
    camp.owner = h.index;
    const home = s.pois.filter(p => p.owner === h.index && p.eco?.stock).sort((p, q) => Math.hypot(p.x - at.x, p.z - at.z) - Math.hypot(q.x - at.x, q.z - at.z))[0];
    const was = { ...home.eco.stock };
    let got = null;
    try { got = s.loot(men, [], h.index, at); } catch (e) { out.push(`${h.short} winning by its camp: ${e.message}`); }
    if (!got) out.push('the test kit has no armour or shields to strip');
    else for (const [g, n] of Object.entries(got)) if ((home.eco.stock[g] || 0) - (was[g] || 0) !== n) out.push(`${home.name} got ${(home.eco.stock[g] || 0) - (was[g] || 0)} ${g}, not ${n}`);
    return out;
  }));

  await check('walls count between houses as against you: ×1.4 stormed bare, none with a ram', () => scratch(async (make, FACTIONS) => {
    const { WALLED } = await import('./world/world.js'), out = [];
    const s = make(), p = s.pois.find(q => q.owner > 0 && q.eco?.buildings && !q.town && q.kind === 'village' && q.seat === undefined);
    if (!p) return ['no rival village to test'];
    const men = [{ key: 'spear', count: 40, name: 'Spears' }], ram = [...men, { key: 'ram', count: 8, name: 'Ram' }];
    p.mem = null; p.eco.walls = 'none';
    const open = s.defence(p);
    if (s.bareWalls(p, men)) out.push(`${p.name} with no walls counts as walled`);
    p.eco.walls = 'wood';
    if (!s.bareWalls(p, men) || s.bareWalls(p, ram)) out.push(`${p.name} palisaded: bare walls ${s.bareWalls(p, men)} with spears, ${s.bareWalls(p, ram)} with a ram`);
    if (Math.abs(s.defence(p) / open - WALLED) > 1e-6) out.push(`a house reckons ${p.name} palisaded at ×${(s.defence(p) / open).toFixed(2)}, not ×${WALLED}`);
    if (!/bareWalls\(p, (a\.units|all)\)/.test(s.autoAssault.toString()))   // (all: with a partner's men, rivals.js joinMarch)
      out.push('a rival\'s assault does not ask about bare walls');
    const a = s.spawnArmy(p.owner === 1 ? 2 : 1, men, p.links[0], 'Host', 'march');
    if (Math.abs(s.autoSides({ kind: 'assault', poi: p, army: a, defenders: p.garrison }).bonus / s.defenceBonus(p) - WALLED) > 1e-6) out.push('your auto-resolve does not count the palisade the same');
    return out;
  }));

  // A house's siege train is built and paid for, on your rules (Orchestrator, 2026-11-22: rams
  // came free, and only against you): a workshop at its muster, each engine for your engine's
  // cost and crew, and the walls' ×1.4 drops only once one is ready to march.
  await check('siege trains: a house builds a workshop and pays for each engine, crewed from its people; none come free', () => scratch(async (make, FACTIONS) => {
    const SG = await import('./world/siege.js'), { ENGINES, BUILDINGS } = await import('./economy.js'), { WALLED } = await import('./world/world.js'), out = [];
    const s = make(), h = FACTIONS.find(x => x.index > 0 && x.ai && !x.bandit && !x.invader && s.pois.some(p => p.owner === x.index && p.eco?.buildings && !p.town));
    const S = s.pois.find(p => p.owner === h.index && p.eco?.buildings && !p.town), T = s.pois.find(p => p.owner > 0 && p.owner !== h.index && p.eco?.buildings && !p.town);
    T.mem = null; T.eco.walls = 'wood';
    Object.assign(S.eco, { pop: 120 }); delete S.eco.buildings.siegeworks; S.eco.engines = null;
    Object.assign(S.eco.stock, { wood: 300, planks: 300, stone: 100, iron: 30, string: 30 });
    const d = s.defence(T), first = SG.siegeReady(s, h, T, S);
    if (Math.abs(first - d) > 1e-6) out.push(`with no train it reckons the palisaded ${T.name} at ${first.toFixed(0)}, not ${d.toFixed(0)} (×${WALLED})`);
    if (!S.eco.wantWorks) out.push(`${S.name} was not set to raise a siege workshop`);
    const planks0 = S.eco.stock.planks;
    for (let i = 0; i < 12 && !S.eco.buildings.siegeworks; i++) s.tickHoldings(5);
    if (!S.eco.buildings.siegeworks) return [...out, `${S.name} raised no siege workshop in a minute`];
    const before = { ...S.eco.stock }, pop0 = S.eco.pop;
    SG.siegeReady(s, h, T, S);
    if (Math.round(pop0 - S.eco.pop) !== ENGINES.ram.crew || Math.round(S.eco.crews || 0) !== ENGINES.ram.crew) out.push(`its ram took ${Math.round(pop0 - S.eco.pop)} from their work to stand by it (${S.eco.crews} crew), not ${ENGINES.ram.crew}`);
    const ram = ENGINES.ram.cost;
    if (!S.eco.engines?.ram || Object.entries(ram).some(([g, n]) => Math.abs(before[g] - S.eco.stock[g] - n) > 1e-6)) out.push(`its ram: ${JSON.stringify(S.eco.engines)}, cost ${JSON.stringify(Object.fromEntries(Object.keys(ram).map(g => [g, before[g] - S.eco.stock[g]])))}, not ${JSON.stringify(ram)}`);
    SG.siegeReady(s, h, T, S);
    if (S.eco.engines?.ladder) out.push('a second engine came in the same building turn');
    s.time += SG.ENGINE_EVERY + 1;
    const ready = SG.siegeReady(s, h, T, S);
    if (!S.eco.engines?.ladder) out.push('no ladders a building turn later');
    if (Math.abs(ready - d / WALLED) > 1e-6) out.push(`with its train it reckons ${T.name} at ${ready.toFixed(0)}, not ${(d / WALLED).toFixed(0)}`);
    const spent = h.ai.siegeSpent || {};
    if (Math.round(spent.planks || 0) !== BUILDINGS.siegeworks.cost.planks + ENGINES.ram.cost.planks + ENGINES.ladder.cost.planks) out.push(`its siege bill shows ${spent.planks} planks`);
    const pop = S.eco.pop, crews = S.eco.crews, units = SG.takeTrain(s, h, S, T), crew = units.reduce((n, u) => n + u.count, 0);
    if (units.map(u => u.key).sort().join() !== 'ladder,ram' || crew !== ENGINES.ram.crew + ENGINES.ladder.crew || crews - S.eco.crews !== crew || S.eco.pop !== pop) out.push(`the host took ${units.map(u => u.key + ' ' + u.count).join(', ')}: ${crews - S.eco.crews} of the crews standing by, ${Math.round(pop - S.eco.pop)} more of its people`);
    S.garrison.push(...units); SG.crewsHome(S);
    if (S.eco.crews !== crews || Math.round(S.eco.pop) !== Math.round(pop) || !S.eco.engines?.ram || S.garrison.some(u => ENGINES[u.key])) out.push(`home again: ${S.eco.crews} crew of ${crews}, ${Math.round(S.eco.pop)} people of ${Math.round(pop)}, engines ${JSON.stringify(S.eco.engines)}`);
    // Crews gone back to work (stores ran short): the host crews its engines from the people.
    S.eco.crews = 0;
    const pop2 = S.eco.pop, again = SG.takeTrain(s, h, S, T), crew2 = again.reduce((n, u) => n + u.count, 0);
    if (again.length !== 2 || Math.round(pop2 - S.eco.pop) !== crew2 || crew2 !== ENGINES.ram.crew + ENGINES.ladder.crew) out.push(`crews back at work: the host took ${again.map(u => u.key + ' ' + u.count).join(', ')} and ${Math.round(pop2 - S.eco.pop)} of its people`);
    // An open place wants no train; no host anywhere gets engines for nothing.
    T.eco.walls = 'none';
    if (SG.takeTrain(s, h, S, T).length) out.push('engines went against an unwalled place');
    const src = (await Promise.all(['world/diplomacy.js', 'world/rivals.js'].map(f => fetch(new URL(f, import.meta.url)).then(r => r.text())))).join('\n');
    if (/\[['"]ram['"], *\d+\]/.test(src)) out.push('a free ram is still handed out somewhere');
    return out;
  }));

  // Nobody is made up when a place changes hands (Orchestrator, 2026-11-22: "never invent
  // people"): a place of three keeps the few who stay, and a town that small, or empty, still
  // works: newcomers come, its numbers stay numbers, and its governor goes on building.
  await check('a place of 3 taken keeps only those who stay, and a town of 0 to 5 still grows and builds', () => scratch(async (make, FACTIONS) => {
    const out = [], odd = o => Object.entries(o).filter(([, v]) => typeof v === 'number' && !Number.isFinite(v)).map(([k]) => k);
    const tiny = (s, name, n) => { const p = s.pois.find(q => q.name === name); p.owner = null; p.eco.pop = n; p.garrison = []; return p; };
    // You storm it: a town of the two or three who stay, which fills and builds under the governor.
    {
      const s = make(), p = tiny(s, 'Redgate', 3);
      s.capture(p, s.spawnArmy(0, FAIR(), p.links[0], 'Host', 'march'), 'storm');
      const t = p.town, had = t.population, built = t.buildings.length;
      if (had > 3) out.push(`you take a place of 3: its town has ${had} people`);
      for (let i = 0; i < 1800; i++) s.updateTown(p, 0.5);
      if (t.population <= had) out.push(`your town of ${had}: still ${t.population} after 15 minutes (${t.settlers().block || 'no block'})`);
      if (t.buildings.length <= built && !t.govSite) out.push(`your town of ${had}: its governor built nothing in 15 minutes`);
      const bad = [...odd(t.stock), ...odd({ mood: t.mood, larder: t.larder, population: t.population, settling: t.settling })];
      if (bad.length) out.push(`your town of ${had}: ${bad.join(', ')} not a number`);
    }
    // A rival takes one of 3, and one of nobody: the few who stay, and families come.
    for (const n of [3, 0]) {
      const s = make(), p = tiny(s, 'Redgate', n);
      s.tookBy(s.spawnArmy(1, FAIR(), p.links[0], 'Host', 'march'), p, 'storm');
      const had = p.eco.pop;
      if (had > n) out.push(`a rival takes a place of ${n}: it holds ${had}`);
      for (let i = 0; i < 180; i++) s.tickHoldings(5);
      if (!(p.eco.pop > had)) out.push(`a rival's place of ${Math.round(had)}: ${Math.round(p.eco.pop * 10) / 10} after 15 minutes`);
      const bad = [...odd(p.eco), ...odd(p.eco.stock)];
      if (bad.length) out.push(`a rival's place of ${n}: ${bad.join(', ')} not a number`);
    }
    return out;
  }));

  // A house calls its arrière-ban by your rules (Orchestrator, 2026-11-22; arriere.js houseCall):
  // its rank's men a place, 3 gold a man, as many as its purse pays, home after ten minutes, and
  // not again until the countryside has rested.
  await check('arrière-ban: a house calls its countryside by your rules: its rank\'s men a place, paid, home on time', () => scratch(async (make, FACTIONS) => {
    const AR = await import('./world/arriere.js'), { headcount } = await import('./world/world.js'), out = [];
    const s = make(), h = FACTIONS.find(x => x.index > 0 && x.ai && !x.bandit && !x.invader && s.pois.filter(p => p.owner === x.index).length >= 2);
    const places = s.pois.filter(p => p.owner === h.index && p.kind !== 'camp'), dest = places[0];
    const per = AR.ARRIERE.per[AR.rankOf(places.length)], want = per * places.length;
    h.gold = 10000;
    const levy = () => s.armies.filter(a => a.side === h.index && !a.gone).reduce((n, a) => n + headcount(a.units.filter(AR.isLevy)), 0)
      + s.pois.filter(p => p.owner === h.index).reduce((n, p) => n + headcount(p.garrison.filter(AR.isLevy)), 0);
    const men = AR.houseCall(s, h, dest);
    if (men !== want) out.push(`${h.name} with ${places.length} places (${AR.rankOf(places.length)}) called ${men} men, not ${want}`);
    if (10000 - h.gold !== men * AR.ARRIERE.gold) out.push(`${men} men cost it ${10000 - h.gold} gold, not ${men * AR.ARRIERE.gold}`);
    if (levy() !== men) out.push(`${men} called, ${levy()} on the map`);
    if (AR.houseCall(s, h, dest)) out.push('it called them again while they served');
    s.time += AR.ARRIERE.serve + 1;
    AR.tickArriere(s);
    if (levy()) out.push(`${levy()} of its levies still under arms after ten minutes`);
    if (AR.houseCall(s, h, dest)) out.push('it called them again before the countryside had rested');
    // A thin purse sends fewer.
    const s2 = make(), h2 = FACTIONS[h.index];
    s2.time = 0; h2.arriere = null; h2.gold = 30;
    const few = AR.houseCall(s2, h2, s2.pois.find(p => p.owner === h2.index && p.kind !== 'camp'));
    if (few !== 10) out.push(`with 30 gold it called ${few} men, not 10`);
    return out;
  }));

  // A house at war hires companies as you may (Orchestrator, 2026-11-22: no house-only limit),
  // as many as its rank keeps, while its income still covers every wage it pays (companies.js
  // rivalHire, companyCap).
  await check('companies: a house at war hires as many as its rank keeps and its income pays the wages of, no more', () => scratch(async (make, FACTIONS) => {
    const C = await import('./world/companies.js'), { wagesOf } = await import('./world/treasury.js'), out = [];
    const s = make(), hs = FACTIONS.filter(x => x.index > 0 && x.ai && !x.bandit && !x.invader && x.trait !== 'merchant' && s.pois.some(p => p.owner === x.index));
    const h = hs[0], seat = s.pois.find(p => p.owner === h.index && p.kind !== 'camp');
    s.declareWar(h.index, hs[1].index);
    s.companies = C.makeCompanies(s);
    for (const c of s.companies) { c.home = null; c.back = 0; c.away = false; }
    h.gold = 100000;
    const mine = () => s.companies.filter(c => c.employer === h.index).length;
    for (let i = 0; i < 3; i++) C.rivalHire(s, h, seat, 0);
    if (mine()) out.push(`with no income to pay them it hired ${mine()} companies`);
    // a count's places: it may keep two
    for (const p of s.pois.filter(p => p.owner === null && p.kind !== 'camp' && p.kind !== 'crown').slice(0, Math.max(0, 5 - s.pois.filter(p => p.owner === h.index && p.kind !== 'camp').length))) s.takePlace(p, h.index);
    const { cap, rank } = C.companyCap(s, h.index);
    if (rank !== 'Count' || cap !== 2) out.push(`a house of 5 places is a ${rank} keeping ${cap} companies, not a count keeping 2`);
    C.rivalHire(s, h, seat, wagesOf(s, h.index).gold + 1);
    if (mine()) out.push('it hired past its income');
    for (let i = 0; i < 8; i++) C.rivalHire(s, h, seat, wagesOf(s, h.index).gold + 1000);
    if (mine() !== cap) out.push(`with gold and income to spare it hired ${mine()} companies, not the ${cap} its rank keeps`);
    return out;
  }));

  // Mercenaries as a ladder of quality (creator, 2026-11-23: "they should range from hired
  // bandits to knights"; the rank cap holds the rush): price and wage rise together, from
  // about 12 a man to past 60, the lances paid above your own knights; the dear ones seldom
  // on the market; so many by rank for you as for a house; a year before one let go is back.
  await check('companies: a ladder from hired bandits to lances, the dearer paid more and seldom on offer, kept by rank, a year back on the market', () => scratch(async (make, FACTIONS) => {
    const C = await import('./world/companies.js'), { ELITE } = await import('./economy.js'), { TYPES } = await import('./battle.js'), out = [];
    const s = make();
    s.companies = C.makeCompanies(s);
    const ks = Object.keys(C.GRADES).sort((a, b) => C.PRICE[a] - C.PRICE[b]), low = ks[0], top = ks.at(-1);
    for (let i = 1; i < ks.length; i++) if (C.WAGE[ks[i]] <= C.WAGE[ks[i - 1]]) out.push(`${ks[i]} cost more than ${ks[i - 1]} but are paid no more`);
    if (C.PRICE[low] > 15 || C.PRICE[top] < 60) out.push(`prices run ${C.PRICE[low]} to ${C.PRICE[top]} a man, not from about 12 to past 60`);
    if (C.WAGE[top] < ELITE.knight.pay) out.push(`${top} draw ${C.WAGE[top]} a minute, under your knights' ${ELITE.knight.pay}`);
    for (const k of ks) if (!TYPES[k]?.merc) out.push(`${k} are not a hired kind`);
    for (const k of ks) if (!s.companies.some(c => c.key === k)) out.push(`no company of ${k} on the market`);
    for (const c of s.companies) if (C.hirePrice(c) !== Math.round(c.size * C.PRICE[c.key])) out.push(`${c.name}: ${C.hirePrice(c)} gold for ${c.size} men`);
    // Three hours of the market: the cheapest about most of the time, the dearest seldom.
    const t0 = s.time, about = {}, seen = {};
    for (let t = 0; t < 10800; t += 30) {
      s.time = t0 + t;
      C.tickCompanies(s, 30);
      for (const c of s.companies) { seen[c.key] = (seen[c.key] || 0) + 1; if (s.time >= c.back) about[c.key] = (about[c.key] || 0) + 1; }
    }
    const share = k => (about[k] || 0) / seen[k];
    if (!(share(low) > 0.6 && share(top) < 0.45 && share(top) > 0.05)) out.push(`on the market ${Math.round(share(low) * 100)}% of the time for ${low}, ${Math.round(share(top) * 100)}% for ${top}`);
    s.time = t0;
    const c = s.companies[0];
    for (const o of s.companies) { o.home = null; o.back = 0; o.away = false; }
    FACTIONS[0].gold = 1e6;
    const mine = s.pois.filter(p => p.owner === 0), free = s.pois.filter(p => p.owner === null && p.kind !== 'camp' && p.kind !== 'crown');
    for (const p of mine.slice(1)) s.takePlace(p, null);
    const why = C.offer(s, c, 0);
    if (why.ok || !/Lord/.test(why.why || '')) out.push(`a reeve is offered a company: ${JSON.stringify(why)}`);
    s.takePlace(free[0], 0);   // a lord: one
    const seat = s.pois.find(p => p.owner === 0 && !p.town) || free[0];
    if (!C.offer(s, c, 0).ok) out.push(`a lord can't hire his first company: ${C.offer(s, c, 0).why}`);
    C.hire(s, c, 0, seat);
    const second = C.offer(s, s.companies[1], 0);
    if (second.ok) out.push('a lord is offered a second company');
    C.release(s, c, 'dismissed');
    const back = Math.round((c.back - s.time) / 60);
    if (back < 20) out.push(`a company let go is hiring again in ${back} minutes, not a year`);
    return out;
  }));

  // An unwatched fight costs the winner what the beaten could kill (creator, 2026-11-22: 828
  // men against about 30 lost about 100): a tiny band a few men, an even fight half its men.
  await check('auto-resolve: a win over a tiny band costs a few men, an even fight about half', () => scratch(async (make, FACTIONS) => {
    const out = [], s = make(), lost = (a, d) => {
      let n = 0, k = 0;
      for (let i = 0; i < 200; i++) {
        const r = s.resolve([{ key: 'spear', count: a, name: 'A' }], [{ key: 'spear', count: d, name: 'D' }]);
        if (r.attackerWins) { n += a - r.A.reduce((m, u) => m + u.count, 0); k++; }
      }
      return k ? n / k : NaN;
    };
    const tiny = lost(800, 30), even = lost(200, 200) / 200;
    if (!(tiny <= 10)) out.push(`800 spears beating 30 lose ${tiny.toFixed(1)} men on average`);
    if (!(even >= 0.35 && even <= 0.6)) out.push(`200 spears beating 200 lose ${Math.round(even * 100)}% of their men`);
    const o = s.autoOdds({ kind: 'field', army: { units: [{ key: 'spear', count: 800, name: 'A' }] }, defenders: [{ key: 'spear', count: 30, name: 'D' }], poi: null });
    if (Math.round(800 * o.winLoss) > 10) out.push(`the box says a win over 30 would cost about ${Math.round(800 * o.winLoss)} of 800`);
    return out;
  }));

  // A house's host gathers from every place (Orchestrator, 2026-11-22; World.keepHome): while
  // it musters, each place no foe presses keeps a skeleton guard and sends the rest.
  await check('a gathering host: a house keeps a skeleton guard where no foe presses, its usual guard where one does', () => scratch(async (make, FACTIONS) => {
    const { SKELETON } = await import('./world/world.js'), out = [];
    const s = make(), h = FACTIONS.find(x => x.index > 0 && x.ai && !x.bandit && !x.invader && s.pois.filter(p => p.owner === x.index && p.eco?.buildings).length >= 2);
    const [p, q] = s.pois.filter(x => x.owner === h.index && x.eco?.buildings), T = s.pois.find(x => x.owner !== h.index && x.eco);
    h.ai.pressed = [q.id];
    const usual = [s.keepHome(p), s.keepHome(q)];
    h.ai.plan = { phase: 'muster', staging: p, target: T, waited: 0 };
    if (s.keepHome(p) !== SKELETON + 4 * p.eco.level) out.push(`mustering, ${p.name} keeps ${s.keepHome(p)}, not a skeleton of ${SKELETON + 4 * p.eco.level}`);
    if (s.keepHome(q) !== usual[1]) out.push(`mustering, ${q.name} with a foe near keeps ${s.keepHome(q)}, not its usual ${usual[1]}`);
    h.ai.plan = { phase: 'march', staging: p, target: T };
    if (s.keepHome(p) !== usual[0]) out.push(`once the host has marched, ${p.name} keeps ${s.keepHome(p)}, not its usual ${usual[0]}`);
    return out;
  }));

  // Hosts meet in the field (Orchestrator, 2026-11-23; rivals.js meetHost): a house a foe's host
  // presses gathers where it is headed, marches out on its road with as much as it brings, and
  // the two fight where they meet; one too weak to stand stays behind its walls.
  await check('host meets host: a pressed house gathers, marches out on the foe\'s road and fights it there; a weak one stays home', () => scratch(async (make, FACTIONS) => {
    const R = await import('./world/rivals.js'), { headcount } = await import('./world/world.js'), out = [];
    const s = make(), hs = FACTIONS.filter(x => x.index > 0 && x.ai && !x.bandit && !x.invader && s.pois.some(p => p.owner === x.index && p.kind !== 'camp' && p.links.some(q => q.owner !== x.index)));
    const h = hs[0], G = s.pois.find(p => p.owner === h.index && p.kind !== 'camp' && p.links.some(q => q.owner !== h.index)), from = G.links.find(q => q.owner !== h.index);
    const o = FACTIONS.find(x => x.index > 0 && x !== h && !x.bandit && !x.invader && x.ai);
    s.declareWar(h.index, o.index);
    h.ai.stance = 'war'; h.ai.plan = null; h.ai.meet = null;
    const F = s.spawnArmy(o.index, [{ key: 'spear', count: 100, name: 'Foe spears' }], from, 'Foe host', 'march');
    s.order(F, G);
    F.x = from.x + (G.x - from.x) * 0.3; F.z = from.z + (G.z - from.z) * 0.3;
    const mine = () => s.pois.filter(p => p.owner === h.index), foes = () => s.armies.filter(a => !a.gone && a.side === o.index);
    // Too weak to stand: it stays home.
    for (const p of mine()) p.garrison = [{ key: 'spear', count: 10, name: 'Guard' }];
    h.arms = 0; for (const p of mine()) if (p.eco) p.eco.pop = 0;
    if (R.meetHost(s, h, mine(), foes(), null)) out.push('a house with 10 men a place went out to meet 100');
    // Strong enough: it gathers at the place the host is headed for, and marches out on its road.
    h.ai.meet = null;
    G.garrison = [{ key: 'spear', count: 200, name: 'Guard' }];
    const at = R.meetHost(s, h, mine(), foes(), null);
    if (at !== G) out.push(`with 200 men it gathers at ${at?.name}, not ${G.name} where the host is headed`);
    R.meetHost(s, h, mine(), foes(), null);
    const host = s.armies.find(a => !a.gone && a.side === h.index && a.meets === F.id);
    if (!host) return [...out, 'with the men gathered, no host marched out to meet it'];
    if (host.target !== from) out.push(`its host marches for ${host.target?.name}, not ${from.name} by the road the foe comes on`);
    if (headcount(host.units) + headcount(G.garrison) !== 200) out.push(`${headcount(host.units)} marched and ${headcount(G.garrison)} stayed, of 200`);
    // Where they meet they fight.
    host.x = F.x; host.z = F.z;
    s.checkMeetings();
    if (!(F.gone || F.retreating || host.gone || host.retreating)) out.push('the two hosts met on the road and did not fight');
    return out;
  }));

  // Coalitions meet as one (Orchestrator, 2026-11-23): a league partner's men wait outside the
  // leader's place, march out with its host and fight the foe's host with it, as one (World.wing);
  // a big clash near your lands is news; a host you meet in the field brings its wing, and after
  // the battle each house's share goes home (World.lend).
  await check('league meets as one: a partner\'s men join the host, both fight the foe together, the news says so, and you face the wing too', () => scratch(async (make, FACTIONS) => {
    const R = await import('./world/rivals.js'), { headcount, power } = await import('./world/world.js'), out = [];
    const s = make(), logs = [], clashes = [];
    s.log = (t, l) => logs.push([t, l]);
    s.hooks.clash = (A, nA, D, nD) => clashes.push([A.length, nA, D.length, nD]);
    const houses = FACTIONS.filter(x => x.index > 0 && x.ai && !x.bandit && !x.invader);
    const h = houses.find(x => s.pois.some(p => p.owner === x.index && p.eco && p.links.some(q => q.owner !== x.index)));
    const G = s.pois.find(p => p.owner === h.index && p.eco && p.links.some(q => q.owner !== h.index)), from = G.links.find(q => q.owner !== h.index);
    const [k, o] = houses.filter(x => x !== h);
    // k's place near the gathering, o the foe; h and k in a league against o.
    const q = s.pois.filter(p => p !== G && p !== from && p.eco && p.kind !== 'camp' && p.owner !== 0).sort((a, b) => Math.hypot(a.x - G.x, a.z - G.z) - Math.hypot(b.x - G.x, b.z - G.z))[0];
    q.owner = k.index;
    if (s.atWar(h.index, k.index)) s.makePeace(h.index, k.index);
    s.declareWar(h.index, o.index); s.declareWar(k.index, o.index);
    s.leagues = [{ target: o.index, members: [h.index, k.index], since: s.time }];
    for (const x of [h, k]) { x.ai.plan = null; x.ai.meet = null; x.ai.wing = null; x.arms = 0; }
    h.ai.stance = 'war'; k.ai.stance = 'build';
    for (const p of s.pois.filter(p => p.owner === h.index || p.owner === k.index)) { p.garrison = [{ key: 'spear', count: 10, name: 'Guard' }]; if (p.eco) p.eco.pop = 0; }
    G.garrison = [{ key: 'spear', count: 140, name: 'Guard' }];
    q.garrison = [{ key: 'spear', count: 160, name: 'Partner' }];
    const F = s.spawnArmy(o.index, [{ key: 'spear', count: 200, name: 'Foe spears' }], from, 'Foe host', 'march');
    s.order(F, G);
    F.x = from.x + (G.x - from.x) * 0.3; F.z = from.z + (G.z - from.z) * 0.3;
    const held = x => s.pois.filter(p => p.owner === x.index), foes = () => s.armies.filter(a => !a.gone && a.side === o.index);
    // Alone h could not stand against 200; with k's men it gathers.
    if (R.meetHost(s, h, held(h), foes(), null) !== G) return ['with a league partner\'s 160 near, the house did not gather to meet the foe'];
    R.meetHost(s, k, held(k), foes(), null);
    const x = s.armies.find(a => !a.gone && a.side === k.index && a.wing?.at === G.id);
    if (!x) return ['the league partner sent nobody to the gathering'];
    // It waits outside the leader's place.
    Object.assign(x, { x: G.x, z: G.z, at: G, path: [] });
    s.arrive(x, G, q);
    if (x.retreating || x.at !== G) out.push('the partner\'s men did not wait outside the leader\'s place');
    R.meetHost(s, h, held(h), foes(), null);
    const host = s.armies.find(a => !a.gone && a.side === h.index && a.meets === F.id);
    if (!host) return [...out, 'with the partner\'s men there, no host marched out'];
    if (x.meets !== F.id || x.target !== host.target) out.push('the partner\'s men did not march with the host');
    // They meet the foe together.
    F.visible = true;
    for (const a of [host, x]) { a.x = F.x; a.z = F.z; }
    const before = headcount(host.units) + headcount(x.units);
    s.checkMeetings();
    if (clashes.length !== 1 || clashes[0][0] !== 2) out.push(`the foe fought ${clashes.length} fights, with ${clashes[0]?.[0]} armies on the league's side, not one fight with both`);
    if (!(F.gone || F.retreating)) out.push(`${before} met 200 and the foe was not beaten`);
    const word = logs.find(([t]) => /^Word from the road/.test(t));
    if (!word || word[1] !== 1) out.push(`a ${before + 200}-man clash in sight is no news: ${logs.map(l => l[0]).join(' | ') || 'no log'}`);
    else if (!/the league/.test(word[0])) out.push(`the news does not name the league: ${word[0]}`);
    // You meet a host with its partner's beside it: you fight both, and after it each goes home with its share.
    for (const a of s.armies.filter(a => !a.gone && a.side !== 0)) s.removeArmy(a);
    s.declareWar(0, h.index); s.declareWar(0, k.index); s.encounter = null;
    const E = s.spawnArmy(h.index, [{ key: 'spear', count: 100, name: 'H spears' }], G, 'The H host', 'march');
    const P = s.spawnArmy(k.index, [{ key: 'spear', count: 60, name: 'K spears' }], G, 'The K host', 'march');
    const Y = s.spawnArmy(0, [{ key: 'spear', count: 300, name: 'Yours' }], G, 'Your army', 'march');
    s.checkMeetings();
    const enc = s.encounter;
    if (!enc || enc.kind !== 'field') return [...out, 'your army met a host and its partner and was not asked'];
    if (headcount(enc.defenders) !== 160) out.push(`you faced ${headcount(enc.defenders)} men, not the 160 of both hosts`);
    s.autoResolve(enc);
    const back = s.armies.find(a => !a.gone && a.side === k.index);
    if (!back || !back.retreating) out.push('after the battle the partner\'s share did not go home');
    if (E.lent) out.push('the host still holds its partner\'s men after the battle');
    return out;
  }));

  // Threat awareness (Orchestrator, 2026-11-23): a call is news to the caller's neighbours and foes,
  // you among them; a foe that reckons itself the target gathers at its place the caller could
  // reach, at peace or not; nobody answers an answer; a raided place is relieved before the band
  // comes, so it turns back; and a house raided again and again goes for the raiders' home.
  await check('threat: a call is news to neighbours and you, a foe answers at its border, a raid is relieved, repeat raiders are punished', () => scratch(async (make, FACTIONS) => {
    const T = await import('./world/threat.js'), R = await import('./world/rivals.js'), { headcount } = await import('./world/world.js'), out = [];
    const s = make(), logs = [];
    s.log = (t, l) => logs.push([t, l]);
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const houses = FACTIONS.filter(x => x.index > 0 && x.alive && x.ai && !x.bandit && !x.invader);
    const own = x => s.pois.filter(p => p.owner === x.index && p.kind !== 'camp');
    const near = (x, y) => own(x).some(p => own(y).some(q => d(p, q) < T.THREAT.border));
    let h, k;
    for (const a of houses) for (const b of houses) if (!h && a !== b && near(a, b) && own(b).length >= 2) { h = a; k = b; }
    if (!h) return ['no two houses border each other on this map'];
    for (const x of houses) { x.ai.plan = null; x.ai.meet = null; x.ai.alert = null; }
    if (!s.atWar(h.index, k.index)) s.declareWar(h.index, k.index, true);
    s.dip[h.index].opinion = -60;   // on bad terms with you
    const G = own(h).sort((a, b) => Math.min(...own(k).map(q => d(a, q))) - Math.min(...own(k).map(q => d(b, q))))[0];
    T.callHeard(s, h.index, G, { kind: 'banners', men: 120 });
    const word = logs.find(([t]) => t.startsWith(`${h.name} has called its banners at ${G.name}`));
    if (!word || word[1] !== 1) out.push(`a house on bad terms with you called its banners and you were not told: ${logs.map(l => l[0]).join(' | ') || 'no log'}`);
    const P = s.byId[k.ai.alert?.at];
    if (!P || P.owner !== k.index) return [...out, `${k.name}, at war with the caller on its border, did not answer its call`];
    // A stranger far off, at peace and with no grudge, does not stir.
    const far = houses.find(x => x !== h && x !== k && !near(x, h) && !s.atWar(x.index, h.index) && !s.fought?.[s.warKey(x.index, h.index)]);
    if (far?.ai.alert) out.push(`${far.name}, far from the caller and at peace with it, answered its call`);
    // Nobody answers an answer.
    h.ai.alert = null;
    T.callHeard(s, k.index, P, { kind: 'arriere', answer: true });
    if (h.ai.alert) out.push('a call made in answer was answered in turn');
    // It gathers at P, at peace or not: its other places keep a skeleton and send the rest there.
    const Q = own(k).find(p => p !== P && p.eco);
    if (Q) {
      Q.garrison = [{ key: 'spear', count: 120, name: 'Guard' }];
      k.ai.stance = 'build'; k.ai.alert.until = s.time + 300;
      R.houseMind(s, k);
      const col = s.armies.find(a => !a.gone && a.side === k.index && a.mode === 'column' && (a.target === P || a.path.at(-1) === P));
      if (k.ai.alert && !col && headcount(Q.garrison) > 60) out.push(`${k.name} heard the call but sent nobody from ${Q.name} to ${P.name} (${headcount(Q.garrison)} men kept)`);
    }
    // A raid on P: seen coming, the places near send relief, and the band turns back.
    for (const a of s.armies.filter(a => a.side === k.index)) s.removeArmy(a);
    k.ai.alert = null;
    const rel = own(k).filter(p => p !== P).sort((a, b) => d(a, P) - d(b, P))[0];
    rel.garrison = [{ key: 'spear', count: 200, name: 'Guard' }];
    // Each band is as far from P by road as the relief is, so the relief gets there with it.
    const r = Math.max(30, s.route(rel, P, s.roadOf(k.index)).length), ux = (rel.x - P.x) / (d(rel, P) || 1), uz = (rel.z - P.z) / (d(rel, P) || 1);
    const spawnBand = () => { const b = s.spawnArmy(h.index, [{ key: 'spear', count: 30, name: 'Raiders' }], G, `${h.short} raiders`, 'raid'); s.order(b, P); Object.assign(b, { x: P.x + ux * r, z: P.z + uz * r, path: [P] }); return b; };
    const band = spawnBand();
    if (r > T.THREAT.road) return [...out, `${rel.name} is ${Math.round(r)} by road from ${P.name}: too far to test relief`];
    T.answerRaids(s, k, q => 20);
    Object.assign(band, { x: P.x + 1, z: P.z + 1 });
    const relief = s.armies.find(a => !a.gone && a.side === k.index && a.target === P);
    if (!relief) return [...out, `a band coming at ${P.name} brought no relief from ${rel.name} with 200 men`];
    Object.assign(relief, { x: P.x + 2, z: P.z + 2, path: [P] });
    s.autoRaid(band, P);
    if (!band.retreating && !band.gone) out.push(`the band at ${P.name} saw ${headcount(relief.units)} men coming and did not turn back`);
    // Three bands from one side in a while: a host goes for the raiders' place nearest the raids.
    let punish = null;
    for (let i = 0; i < 2 && !punish; i++) { spawnBand(); punish = T.answerRaids(s, k, q => 20); }
    if (!punish || punish.side !== h.index || punish.home.owner !== h.index) out.push(`three bands from ${h.name} and ${k.name} did not resolve to punish it`);
    return out;
  }));

  // A partner's attack (Orchestrator, 2026-11-23, (ii)): a league partner's men wait at the
  // leader's muster, march with its host, and the two take the place as one.
  await check('league attacks as one: a partner\'s men wait at the muster, march with the host, and storm the place with it', () => scratch(async (make, FACTIONS) => {
    const R = await import('./world/rivals.js'), { headcount } = await import('./world/world.js'), out = [];
    const s = make();
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const houses = FACTIONS.filter(x => x.index > 0 && x.alive && x.ai && !x.bandit && !x.invader);
    const [h, k, o] = houses;
    const S = s.pois.find(p => p.owner === h.index && p.eco);
    const T = s.pois.filter(p => p.owner === o.index && p.kind !== 'camp').sort((a, b) => d(a, S) - d(b, S))[0];
    const q = s.pois.filter(p => p !== S && p !== T && p.eco && p.kind !== 'camp' && p.owner !== 0 && p.owner !== o.index).sort((a, b) => d(a, S) - d(b, S))[0];
    if (!S || !T || !q) return ['no muster, target and partner place on this map'];
    q.owner = k.index;
    for (const [x, y] of [[h, k]]) if (s.atWar(x.index, y.index)) s.makePeace(x.index, y.index);
    s.declareWar(h.index, o.index, true); s.declareWar(k.index, o.index, true);
    s.leagues = [{ target: o.index, members: [h.index, k.index], since: s.time }];
    for (const x of [h, k]) Object.assign(x.ai, { plan: null, meet: null, wing: null, joins: null });
    q.garrison = [{ key: 'spear', count: 170, name: 'Partner' }];
    T.garrison = [{ key: 'spear', count: 150, name: 'Foe' }];
    h.ai.plan = { target: T, staging: S, phase: 'muster', t: 0, waited: 0, host: null, raids: 0 };
    R.joinMarch(s, k, null);
    const x = s.armies.find(a => !a.gone && a.side === k.index && a.joins?.from === S.id);
    if (!x) return [`${k.name} sent nobody to ${h.name}'s muster against ${T.name}`];
    Object.assign(x, { x: S.x, z: S.z, at: S, path: [] });
    s.arrive(x, S, q);
    if (x.retreating || x.gone) return ['the partner\'s men did not wait at the muster'];
    // The host marches: the partner's men go with it.
    const host = s.spawnArmy(h.index, [{ key: 'spear', count: 100, name: 'Host' }], S, `The ${h.short} host`, 'assault');
    s.order(host, T);
    Object.assign(h.ai.plan, { phase: 'march', host });
    R.tendMarch(s, k);
    if (x.joins.host !== host.id || x.target !== T) return ['when the host marched, the partner\'s men did not march with it'];
    // The partner's men come first and wait; the host comes and they storm it together.
    Object.assign(x, { x: T.x, z: T.z, at: T, path: [] }); s.arrive(x, T, S);
    if (x.gone || x.retreating || T.owner !== o.index) return ['the partner\'s men, there first, did not wait for the host'];
    Object.assign(host, { x: T.x, z: T.z, at: T, path: [] }); s.arrive(host, T, S);
    if (T.owner !== h.index) out.push(`100 with a partner's 170 against 150 did not take ${T.name} (owner ${T.owner})`);
    if (x.gone || !x.retreating || headcount(x.units) >= 170) out.push(`after the storm the partner's men did not go home with their share (${headcount(x.units)} men, retreating ${x.retreating})`);
    R.tendMarch(s, k);
    return out;
  }));

  // The houses raise walls by your rules (Orchestrator, 2026-11-22): a palisade where a place is
  // threatened once it has the wood, stone at a seat with the stone and gold, at what yours cost,
  // built by its people over time; turtlers soon, raiders rarely.
  await check('walls: a house raises a palisade where threatened and stone at its seat, at your costs, over time; a raider rarely', () => scratch(async (make, FACTIONS) => {
    const WL = await import('./world/walling.js'), P = await import('./world/places.js'), out = [];
    const setUp = (s, trait) => {
      const h = FACTIONS.find(x => x.index > 0 && x.ai && !x.bandit && !x.invader && s.pois.filter(p => p.owner === x.index && p.eco?.buildings).length >= 2);
      h.trait = trait;
      const mine = s.pois.filter(p => p.owner === h.index);
      for (const q of mine) if (q.eco?.stock) Object.assign(q.eco.stock, { wood: 0, stone: 0 });
      h.seat = mine.find(q => q.eco?.buildings);
      const p = mine.find(q => q.eco?.buildings && q !== h.seat);
      p.eco.walls = 'none'; p.eco.stock.wood = 2000;
      h.ai.pressed = [p.id];
      return { h, mine, p };
    };
    // A turtler's threatened place with wood to spare: a palisade, paid as yours, built over time.
    {
      const s = make(), { h, mine, p } = setUp(s, 'turtler');
      s.rand = () => 0;
      const want = P.wallsFor(p, 'wood'), before = p.eco.stock.wood;
      WL.thinkWalls(s, h, mine);
      if (p.eco.walling?.material !== 'wood') out.push(`a turtler's threatened ${p.name} with ${before} wood did not start a palisade`);
      else {
        if (before - p.eco.stock.wood !== want.cost.wood) out.push(`its palisade cost ${before - p.eco.stock.wood} wood, not ${want.cost.wood} (WALL_COSTS for ${want.plan.pieces.length} stretches)`);
        let t = 0;
        for (; t < 3600 && p.eco.walling; t += 5) WL.tickWalls(s, p, 5);
        if (p.eco.walls !== 'wood' || !P.walledPlace(p) || !P.layoutOf(p).pieces.length) out.push(`after ${t} s ${p.name} is not walled (${p.eco.walls})`);
        else if (t < 30 || t > 900) out.push(`its palisade took ${t} s to raise`);
      }
    }
    // Stone at its seat once it has the stone and its lord the gold.
    {
      const s = make(), { h, mine } = setUp(s, 'builder'), seat = h.seat;
      s.rand = () => 0;
      Object.assign(seat.eco.stock, { stone: 5000, wood: 2000 });
      seat.eco.walls = 'wood'; h.gold = 5000;
      const want = P.wallsFor(seat, 'stone');
      WL.thinkWalls(s, h, mine);
      if (seat.eco.walling?.material !== 'stone') out.push(`a builder's seat with 5000 stone and 5000 gold did not start stone walls`);
      else if (5000 - h.gold !== (want.cost.gold || 0) || 5000 - seat.eco.stock.stone !== want.cost.stone) out.push(`its stone walls cost ${5000 - seat.eco.stock.stone} stone and ${5000 - h.gold} gold, not ${want.cost.stone} and ${want.cost.gold}`);
    }
    // A raider rarely: the same chance that sets a turtler building leaves a raider idle.
    {
      const s = make(), { h, mine, p } = setUp(s, 'raider');
      s.rand = () => 0.1;
      WL.thinkWalls(s, h, mine);
      if (p.eco.walling) out.push('a raider walled at a one-in-ten roll');
      h.trait = 'turtler';
      WL.thinkWalls(s, h, mine);
      if (!p.eco.walling) out.push('a turtler did not wall at a one-in-ten roll');
    }
    return out;
  }));

  // Trained men are never levied (creator, 2026-11-22: the banners raised "Levy men-at-arms" in
  // no armour, men never trained): one list of levy kinds for the barracks, the banner call and
  // raise(), and an old save's levied men-at-arms or knights load as plain levies.
  await check('levies: calling the banners never raises an elite or drilled kind, and no levy has one', async () => {
    const E = await import('./economy.js'), out = [];
    const trained = k => !!(E.ELITE[k] || E.DRILLED[k]);
    if (E.LEVY_KINDS.some(trained)) out.push(`the levy list holds ${E.LEVY_KINDS.filter(trained).join(', ')}`);
    // Every barracks of yours stocked with all a knight or a man-at-arms needs: the banner plan levies only plain kinds.
    const RICH = { swords: 200, shields: 200, mail: 200, armour: 200, lances: 200, horses: 200, spears: 200, bows: 200, arrows: 2000 };
    const at = w.pois.filter(p => p.owner === 0 && p.town && !p.town.hostile).flatMap(p => p.town.buildings.filter(b => b.kind === 'barracks' && b.state === 'active').map(b => [p.town, b]));
    const racks = at.map(([, b]) => b);
    const kept = racks.map(b => ({ ...b.store }));
    try {
      for (const b of racks) for (const [g, n] of Object.entries(RICH)) b.store[g] = (b.store[g] || 0) + n;
      if (racks.length) {
        const plan = w.bannerPlan(w.home), keys = plan.villages.flatMap(v => v.raise.map(l => l.key));
        if (keys.some(trained)) out.push(`the banner plan levies ${[...new Set(keys.filter(trained))].join(', ')}`);
        // (the plan may levy nobody if no village can spare twenty above its floor; the racks still answer)
        const [t, b] = at[0];
        for (const k of ['maa', 'knight', 'serjeant', 'yeoman']) if (t.levyCheck(k, b, 100).ok) out.push(`a barracks would levy ${k}`);
        if (!t.levyCheck('cav', b, 100).ok) out.push(`full racks would not levy heavy cavalry: ${t.levyCheck('cav', b, 100).reason}`);
      }
    } finally { racks.forEach((b, i) => { b.store = kept[i]; }); }
    for (const p of w.pois) if (p.town) for (const r of p.town.battle.regs) if (r.levy && !r.gone && r.alive > 0 && trained(r.T.key)) out.push(`${p.name}: ${r.name} is a levy of ${r.T.key}`);
    for (const a of w.armies) for (const u of a.units || []) if (u.levy && trained(u.key)) out.push(`${a.name}: ${u.name} is a levy of ${u.key}`);
    const P = E.plainLevy({ key: 'knight', levy: 'knight', count: 10, armour: 'plate' });
    if (P?.key !== 'cav' || P.armour !== 'plate' || P.spare.lances !== 1) out.push(`an old levy of knights becomes ${JSON.stringify(P)}`);
    if (E.plainLevy({ key: 'maa', elite: true, count: 10 })) out.push('a hall\'s men-at-arms would be made plain');
    return out;
  });

  // The household guard by rank (creator, 2026-11-22): Lord 1, Count 2, Duke 3, King 4, counted
  // across the realm, at home and in the field; one wiped out or disbanded frees its slot.
  await check('household guard: a lord keeps 1, a count 2, a duke 3, across the realm', async () => {
    const W = await import('./world/world.js'), out = [];
    const p = w.pois.find(q => q.owner === 0 && q.town && !q.town.hostile), t = p?.town;
    if (!t) return null;
    const want = W.HOUSEHOLD_CAP[w.rank] || 0, { have, cap } = w.households(0);
    if (cap !== want) out.push(`at the rank of ${w.rank} the cap is ${cap}, not ${want}`);
    if (!cap) return out;
    if (W.HOUSEHOLD_CAP.Lord !== 1 || W.HOUSEHOLD_CAP.Count !== 2 || W.HOUSEHOLD_CAP.Duke !== 3) out.push(`the caps are ${JSON.stringify(W.HOUSEHOLD_CAP)}`);
    // Fill to the cap: one regiment here, the rest in an army in the field.
    const gold = t.purse.gold, added = [], army = have < cap - 1 ? w.spawnArmy(0, Array.from({ length: cap - have - 1 }, () => ({ key: 'household', count: 30, name: 'Household guard (checks() test)' })), p, 'Household test') : null;
    try {
      t.purse.gold = 1e6;
      if (have < cap) added.push(t.battle.addRegiment(0, 'household', 0, 0, 0, { count: 30, name: 'Household guard (checks() test)' }));
      const full = t.hireCheck('household');
      if (full.ok) out.push(`with ${w.households(0).have} of ${cap} it would hire another`);
      else if (full.reason !== `A ${w.rank.toLowerCase()} keeps ${cap} household guard${cap > 1 ? 's' : ''} (you have ${cap})`) out.push(`at the cap it says "${full.reason}"`);
      // one wiped out frees its slot
      const one = added[0] || t.battle.regs.find(r => r.side === 0 && r.T.key === 'household' && !r.gone);
      if (one) {
        const alive = one.soldiers.filter(s => s.alive).map(s => { s.alive = false; return s; });
        if (!t.hireCheck('household').ok) out.push(`a household wiped out still holds its slot: "${t.hireCheck('household').reason}"`);
        for (const s of alive) s.alive = true;
      }
    } finally {
      t.purse.gold = gold;
      for (const r of added) if (!r.gone) t.battle.disband(r);
      if (army) w.removeArmy(army);
    }
    return out;
  });

  // Earned troops (creator, 2026-11-22): veterans drill at a barracks into serjeants and
  // yeomen from Lord and train at a knights' hall from Count, for real fees, and each step
  // draws more pay than the one before; the hall shows greyed at Lord.
  await check('training: drilled men and elites cost real gold, earn more pay, and wait for their rank', async () => {
    const E = await import('./economy.js'), { payOf, WAGES } = await import('./world/treasury.js'), { ahead } = await import('./ui/unlocks.js'), { TYPES } = await import('./battle.js'), out = [];
    if (E.ELITE.maa.fee < 50 || E.ELITE.knight.fee < 120) out.push(`hall fees are ${E.ELITE.maa.fee} and ${E.ELITE.knight.fee}: not real money`);
    for (const [k, D] of Object.entries(E.DRILLED)) {
      if (!TYPES[k] || !E.KITS[k]) { out.push(`${k} is drilled but has no type or kit`); continue; }
      const pay = payOf(k, TYPES[k].armour, false);
      if (!(pay > WAGES.heavy && pay < E.ELITE.maa.pay)) out.push(`${TYPES[k].name} draw ${pay} a minute, not between mail (${WAGES.heavy}) and a man-at-arms (${E.ELITE.maa.pay})`);
      if (!(D.fee > 0 && D.drill > 0)) out.push(`${TYPES[k].name} cost no fee or drill`);
    }
    if (E.trainsAt({ kind: 'barracks', B: {} })?.kinds !== E.DRILLED || E.trainsAt({ kind: 'hall', B: { hall: true } })?.kinds !== E.ELITE) out.push('a barracks or a hall trains the wrong men');
    for (const [rank, want] of [['Reeve', null], ['Lord', 'From the rank of Count'], ['Count', null]]) if ((ahead({ rank, pois: [] }, 'b:hall') ?? null) !== want) out.push(`at ${rank} the knights' hall shows ${ahead({ rank, pois: [] }, 'b:hall') ?? 'as it is'}, not ${want ?? 'as it is'}`);
    for (const p of w.pois) {
      if (p.owner !== 0 || !p.town || p.town.hostile) continue;
      for (const b of p.town.buildings) if (b.kind === 'barracks' && b.state === 'active') {
        const why = p.town.trainCheck('serjeant', b).reason;
        if ((w.rank === 'Reeve') !== (why === 'From the rank of Lord')) out.push(`${p.name}'s barracks at ${w.rank}: ${why || 'drills'}`);
      }
    }
    return out;
  });

  // Leagues on one rule for every side (Orchestrator, 2026-11-21): of two equal reasons, one
  // against you and one against a house, the nearer side is chosen, and so not always you;
  // a stronger reason beats a nearer one.
  await check('leagues: equal reasons against you and a house go to the nearer, not always to you', async () => {
    const { strongestReason } = await import('./world/diplomacy.js'), out = [];
    const you = d => ({ R: 'you', n: 2, d }), house = d => ({ R: 'house', n: 2, d });
    if (strongestReason([you(300), house(200)])?.R !== 'house') out.push('a nearer house with an equal reason lost to you');
    if (strongestReason([house(300), you(200)])?.R !== 'you') out.push('you, nearer with an equal reason, lost to a house');
    if (strongestReason([{ R: 'house', n: 3, d: 900 }, you(100)])?.R !== 'house') out.push('a claim on a far house lost to a wrong by a near you');
    return out;
  });

  // War by the odds (creator, 2026-11-21): a bold house never goes below a long shot, a cautious
  // temper wants better odds than a hot one, and no temper's line is a long shot itself.
  await check('wars: houses go to war by the odds, by temper, never on a hopeless one', async () => {
    const { ODDS } = await import('./world/rivals.js'), out = [];
    for (const [t, l] of Object.entries(ODDS.line)) if (l <= ODDS.longShot) out.push(`${t} goes to war at ${l}, a long shot`);
    if (!(ODDS.line.merchant > ODDS.line.raider && ODDS.line.turtler > ODDS.line.hothead)) out.push('a cautious temper takes worse odds than a hot one');
    if (Object.values(ODDS.bold).some(b => b > 0.2)) out.push('a temper takes long shots more often than one think in five');
    for (const c of w.calls || []) if (!FACTIONS[c.against]?.alive && c.until > w.time) out.push(`a call to arms stands against a fallen house (${c.against})`);
    return out;
  });

  // Caravans (creator, 2026-11-22: "can i unlock better caravans so i can send more goods at
  // once"): every wagon on the road holds to its caps, yours and a house's cart alike, and no
  // village has more out than its wagons allow.
  await check('supplies: a wagon carries no more than its caps, yours and a house\'s alike', async () => {
    const { RUN_GOODS, WAGONS } = await import('./world/supply.js'), out = [];
    for (let i = 1; i < WAGONS.length; i++) if (!(WAGONS[i].size > WAGONS[i - 1].size && WAGONS[i].gold > 0)) out.push(`${WAGONS[i].name} are no better than ${WAGONS[i - 1].name}, or free`);
    for (const h of FACTIONS) if (h && h.wagons != null && !(h.wagons >= 0 && h.wagons < WAGONS.length)) out.push(`${h.name} drives wagons of tier ${h.wagons}`);
    const from = new Map();
    for (const a of w.armies) {
      const W = a.wagon;
      if (a.gone || !W?.run || W.bought || W.tier == null) continue;   // one loaded before the caps keeps its load
      for (const [g, n] of Object.entries(W.goods)) if (n > (RUN_GOODS[g] ?? 0) * WAGONS[W.tier].size) out.push(`${a.name} carries ${n} ${g}, past its ${Math.floor((RUN_GOODS[g] ?? 0) * WAGONS[W.tier].size)}`);
      from.set(W.from, (from.get(W.from) || 0) + 1);
    }
    for (const [p, n] of from) if (n > WAGONS[FACTIONS[p.owner]?.wagons || 0].out) out.push(`${n} wagons out from ${p.name}`);
    return out;
  });
  // A house's carts carry food and kit; whatever they carry, you can send too.
  await check('supplies: you can send every good a house\'s cart carries', async () => {
    const { RUN_GOODS, RUN_GROUPS } = await import('./world/supply.js'), { RAISE, kitOf } = await import('./world/holdings.js'), out = [];
    const yours = new Set(Object.values(RUN_GROUPS).flat());
    for (const g of new Set(['food', 'bread', ...RAISE.flatMap(k => Object.keys(kitOf(k)))])) if (!yours.has(g)) out.push(`a house's cart carries ${g}; you can't send it`);
    for (const g of yours) if (!(RUN_GOODS[g] > 0)) out.push(`${g} has no wagon load`);
    return out;
  });

  await check('houses and armies: numbers are sane', () => {
    const out = [];
    for (const h of FACTIONS) if (h && (bad(h.gold) || h.gold < -1e-6)) out.push(`${h.name}: ${h.gold} gold`);
    for (const a of w.armies) {
      if (a.gone) continue;
      if (bad(a.x) || bad(a.z)) out.push(`${a.name}: at (${a.x}, ${a.z})`);
      for (const u of a.units) if (bad(u.count) || u.count <= 0 || u.count % 1) out.push(`${a.name}: ${u.name} has ${u.count} men`);
      if (a.food !== undefined && (bad(a.food) || a.food < -1e-6)) out.push(`${a.name}: ${a.food} food`);
    }
    return sample(out);
  });

  // The journey, batch 1 (climb session, 2026-11-21): your own lands feed your armies, the
  // banners keep to friendly roads, a free place has a price, the outlaws come in order.
  const Sup = await import('./world/supply.js'), Riv = await import('./world/rivals.js');
  group = 'Journey';
  const ours = w.armies.filter(a => a.side === 0 && !a.gone && !a.wagon);
  await check('no army of yours deserts in your own lands', () => ours.filter(a => a.food <= 0 && Sup.homeland(w, a) && a.starving >= 10).map(a => `${a.name}: starving ${Math.round(a.starving)} s near ${Sup.homeland(w, a).name}`));
  await check('banner columns march only through friendly land', () => ours.filter(a => /^Banners of /.test(a.name) || a.vassal)
    .flatMap(a => a.path.slice(0, -1).filter(q => w.canAttack(0, q)).map(q => `${a.name} would pass ${q.name}`)));
  await check("every free place's fealty has a price", () => w.pois.filter(p => p.owner === null && p.kind !== 'camp' && p.kind !== 'crown')
    .filter(p => bad(w.treatPrice(p)) || w.treatPrice(p) <= 0).map(p => `${p.name}: ${w.treatPrice(p)}`));
  // Round 2 fixes (2026-11-21): companies worn down are put to you, a broken one leaves
  // nobody behind, a house paid off stays out of a league, and no goal shown is already passed.
  const Co = await import('./world/companies.js'), Go = await import('./world/goals.js');
  await check('a company of yours worn down to a handful is put to you', () => (w.companies || []).filter(c => c.employer === 0 && c.men >= 3 && c.men < c.size * Co.WEAK && !c.askedWeak).map(c => `${c.name}: ${c.men} of ${c.size}, never asked`));
  await check('a broken or free company leaves nobody behind', () => (w.companies || []).filter(c => (c.employer === null || c.employer === undefined) && Co.menOf(w, c) > 0).map(c => `${c.name}: ${Co.menOf(w, c)} men still under its name`));
  await check('a house paid tribute is in no league against you', () => (w.coalition?.members || []).filter(h => w.dip?.[h]?.paidUntil > w.time).map(h => `${w.houses[h].name}, paid until ${Math.round(w.dip[h].paidUntil)}`));
  await check('the goal shown is not one already passed', () => Go.GOALS.slice((w.goals ?? 0) + 1).some(g => g.done(w, {})) ? [`goal ${w.goals} shown, a later one is done`] : []);
  await check('the outlaw bands come in order', () => (w.outlaws && (!Number.isInteger(w.outlaws.wave) || w.outlaws.wave < 0 || w.outlaws.wave > Riv.OUTLAWS.length)) ? [`wave ${w.outlaws.wave}`] : []);

  // Vassals and the Realm screen (Manager review, 2026-11-21).
  const V = await import('./world/vassals.js');
  group = 'Vassals';
  const kept = w.vassals.filter(v => !v.gone);
  await check('one holder per council seat', () => Object.keys(V.SEATS).map(k => [k, kept.filter(v => v.council && v.seat === k)])
    .filter(([, vs]) => vs.length > 1).map(([k, vs]) => `${V.SEATS[k].name}: ${vs.map(v => v.name).join(', ')}`));
  await check('no councillor without a seat', () => kept.filter(v => v.council ? !V.SEATS[v.seat] : v.seat).map(v => `${v.name}: council ${v.council}, seat ${v.seat}`));
  await check('no departed or imprisoned vassal keeps a seat', () => w.vassals.filter(v => (v.gone || v.prison) && (v.council || v.seat)).map(v => `${v.name}${v.gone ? ' (gone)' : ' (in prison)'}: council ${v.council}, seat ${v.seat}`));
  await check(`favours owed are ${V.FAVOURS} at most`, () => kept.filter(v => bad(v.favours || 0) || v.favours < 0 || v.favours > V.FAVOURS).map(v => `${v.name} owes ${v.favours}`));
  await check('titles are real and named', () => kept.filter(v => !Number.isInteger(v.title ?? 0) || (v.title || 0) < 0 || (v.title || 0) >= V.TITLES.length || !v.name.startsWith(`${V.titleName(v)} `))
    .map(v => `${v.name}: title ${v.title}`));
  await check("no vassal's purse below nothing", () => kept.filter(v => bad(v.gold) || v.gold < -1e-6).map(v => `${v.name}: ${v.gold} gold`));
  // Every building in a place's numbers is a real kind: a made-up 'chapel' froze the map (2026-11-21).
  const { BUILDINGS } = await import('./economy.js');
  await check("every place's building kinds are real", () => w.pois.filter(p => p.eco?.buildings).flatMap(p =>
    Object.keys(p.eco.buildings).filter(k => !BUILDINGS[k]).map(k => `${p.name}: '${k}'`)));
  // Newcomers don't repeat: no kind comes twice inside its cooldown, and nothing is asked of the real
  // world (the clock, the choice hook and the settler state are put back).
  const Ev = await import('./world/events.js');
  await check('events keep their seasons and come once a year at most', () => {
    const keep = { time: w.time, at: w.eventAt }, out = [], names = ['spring', 'summer', 'autumn', 'winter'];
    try {
      const y = Math.ceil(w.time / 1200) * 1200 + 1200;
      for (const [id, months] of Object.entries(Ev.IN_SEASON)) for (let s = 0; s < 4; s++) {
        w.time = y + s * 300 + 10; w.eventAt = {};
        if (Ev.eventReady(w, id) !== months.includes(s)) out.push(`${id} ${months.includes(s) ? "can't come" : 'can come'} in ${names[s]}`);
        w.eventAt = { [id]: w.time - Ev.EVENT_AGAIN / 2 };
        if (Ev.eventReady(w, id)) out.push(`${id} can come again ${Ev.EVENT_AGAIN / 120} min after the last`);
      }
    } finally { w.time = keep.time; w.eventAt = keep.at; }
    return out;
  });
  await check('settlers: no kind twice within 20 minutes', () => {
    if (!w.pois.some(p => p.owner === 0 && p.town && !p.town.underAttack && !p.town.hostile && !p.town.revolt && !p.town.readOnly)) return null;
    const keep = { time: w.time, clock: w.settlerClock, seen: w.settlerSeen, last: w.lastSettlers, choice: w.hooks.choice }, came = [], out = [];
    try {
      w.settlerSeen = {}; w.lastSettlers = undefined;
      w.hooks.choice = ev => came.push([ev.id.replace('settlers-', ''), w.time, w.settlerSeen[ev.id.replace('settlers-', '')].variant]);
      const t0 = w.time;
      for (let i = 0; i < 300; i++) { w.time = t0 + i * 300; w.settlerClock = 0; Ev.tickSettlers(w, 0); }
    } finally { Object.assign(w, { time: keep.time, settlerClock: keep.clock, settlerSeen: keep.seen, lastSettlers: keep.last }); w.hooks.choice = keep.choice; }
    for (let i = 0; i < came.length; i++) {
      const j = came.slice(0, i).findLastIndex(c => c[0] === came[i][0]);
      if (j >= 0 && came[i][1] - came[j][1] < 1200) out.push(`${came[i][0]} again after ${Math.round((came[i][1] - came[j][1]) / 60)} min`);
      if (j >= 0 && came[i][2] === came[j][2]) out.push(`${came[i][0]} told the same way twice`);
    }
    if (came.length < 3) out.push(`only ${came.length} came in 300 tries`);
    return out;
  });
  // Worked-out quarries and mines: nobody keeps standing at one, and Find points at a real deposit
  // (playtest round 2, 2026-11-21).
  await check('a worked-out workplace frees its workers, and Find points at a deposit still holding some', () => {
    const out = [];
    for (const p of w.pois) for (const b of p.town?.buildings || []) {
      if (b.dry && b.state === 'active' && p.town.time - b.dry > 120 && b.workers.length) out.push(`${p.name}: the ${b.kind} has been dry ${Math.round((p.town.time - b.dry) / 60)} min with ${b.workers.length} workers`);
      const next = b.state === 'active' && p.town.nextDeposit(b);
      if (next && !((next.node.standing ?? true) && (next.node.left ?? 1) > 0 && Math.hypot(next.node.x - b.x, next.node.z - b.z) >= b.B.gather.range)) out.push(`${p.name}: Find for the ${b.kind} points at an empty or reachable deposit`);
    }
    return out;
  });
  // Nobody stands stuck at a wall on their way to work (playtest round 3: builders 5 m short of a knights' hall).
  await check('no villager has stood stuck for half a minute on the way to a door', () =>
    w.pois.flatMap(p => (p.town?.villagers || []).filter(v => v.stuckK && v.stuckK.t > 30 && v.state !== 'soldier').map(v => `${p.name}: at ${Math.round(v.x)}, ${Math.round(v.z)}`)));
  // Leather armour is made at the tanner, like shields at the carpenter's, and levies wear it (creator, 2026-11-21).
  await check('leather armour: a tanner makes it, the racks take it, a levy wears it, the armourer keeps raw leather', async () => {
    const E = await import('./economy.js'), out = [];
    if (!E.BUILDINGS.tanner.recipes.some(r => r.out.leatherarmour && r.in.leather === 2 && r.keep === 60)) out.push('the tanner has no 2 leather to 1 leather armour recipe with a keep of 60');
    if (E.ARMOUR_GOOD.leather !== 'leatherarmour') out.push(`the leather level is worn from ${E.ARMOUR_GOOD.leather}`);
    if (!E.GOOD_GROUPS.find(([n]) => n === 'Arms')[1].includes('leatherarmour')) out.push('leather armour is not an arm the barracks takes');
    if (!E.BUILDINGS.armourer.recipes.every(r => r.in.leather)) out.push('the armourer lost raw leather as an input');
    const fit = E.outfit('spear', 10, g => ({ leatherarmour: 10, spears: 10 })[g] || 0);
    if (fit?.armour !== 'leather') out.push(`ten men with ten leather armour wear ${fit?.armour}`);
    const t = w.pois.find(p => p.town)?.town || window.game.town;
    if (t) {
      const c = t.levyCheck('spear', { store: { spears: 10, leatherarmour: 10 }, policy: null }, 10);
      if (!c.ok || c.fit?.armour !== 'leather') out.push(`a levy from racks with leather armour wears ${c.fit?.armour} (${c.reason || 'ok'})`);
    }
    return out;
  });
  // Household guard (creator, 2026-11-21): from Lord, a wage, and no villagers when it leaves. Disbanding gives back
  // all the kit it took (shields, armour, weapons, horses), by one shared path.
  await check('the household guard needs a Lord, draws a wage and joins no village; a disband gives back all its kit', async () => {
    const E = await import('./economy.js'), TR = await import('./world/treasury.js'), B = await import('./battle.js'), out = [];
    const p = w.pois.find(q => q.owner === 0 && q.town && !q.town.hostile), t = p?.town;
    if (!t) return null;
    if (B.TYPES.household.gold * B.TYPES.household.count < 300) out.push(`the household costs only ${B.TYPES.household.gold * B.TYPES.household.count}`);
    // (rank is read-only: the rule must agree with the rank this save holds)
    const lordly = ['Lord', 'Count', 'Duke', 'King'].includes(w.rank), refused = t.hireCheck('household').reason === 'From the rank of Lord';
    if (lordly === refused) out.push(`at the rank of ${w.rank} the household guard is ${refused ? 'refused' : 'allowed'}`);
    // the wage, and no villagers
    const before = TR.elitePay(w, 0), pop = t.population, r = t.battle.addRegiment(0, 'household', 0, 0, 0, { count: 6, name: 'Household guard (checks() test)' });
    try {
      const after = TR.elitePay(w, 0);
      if (Math.abs(after - before - 6 * E.HOUSEHOLD_PAY) > 0.01) out.push(`six household men add ${(after - before).toFixed(2)} gold a minute, not ${6 * E.HOUSEHOLD_PAY}`);
      if (!t.disband(r, true) || t.population !== pop) out.push(`a disbanded household changed the village from ${pop} to ${t.population} people`);
    } finally { if (!r.gone) t.battle.disband(r); }
    // every man in the field draws a wage (an army has no home guard), and twenty spearmen draw the foot's
    const paid0 = TR.wagesOf(w, 0), a = w.spawnArmy(0, [{ key: 'spear', count: 20, name: 'Wage test (checks())' }], p, 'Wage test');
    try {
      const now = TR.wagesOf(w, 0);
      if (Math.abs(now.gold - paid0.gold - 20 * TR.WAGES.foot) > 0.01 || now.men - paid0.men !== 20) out.push(`twenty spearmen in the field add ${(now.gold - paid0.gold).toFixed(2)} gold a minute and ${now.men - paid0.men} paid men, not ${20 * TR.WAGES.foot} and 20`);
    } finally { w.removeArmy(a); }
    // kit in = kit out, for every levy type, with and without armour and a shield
    const rack = t.armoury({ x: 0, z: 0 }), was = { ...rack.store };
    try {
      for (const key of Object.keys(E.KITS)) for (const armour of ['none', 'leather', 'mail', 'plate']) for (const shield of [false, true]) {
        const fit = { armour, shield: shield && E.canShield(key) }, n = 3;
        rack.store = {};
        const q = t.battle.addRegiment(0, key, 0, 0, 0, { count: n, name: 'checks() test levy', ...fit });
        Object.assign(q, fit); q.levy = key;
        t.disband(q, true);
        const want = E.outfitKit(key, n, fit), got = rack.store;
        for (const g of new Set([...Object.keys(want), ...Object.keys(got)])) if (Math.abs((got[g] || 0) - (want[g] || 0)) > 1e-6) out.push(`${key} in ${armour}${fit.shield ? ' with shields' : ''}: took ${want[g] || 0} ${g}, gave back ${got[g] || 0}`);
        if (!q.gone) t.battle.disband(q);
      }
    } finally { rack.store = was; }
    return out.slice(0, 8);
  });
  // Priority is one place at a time, and always a standing site or workplace (creator, 2026-11-21).
  await check('a village has at most one priority, and it is a site or a workplace', () => {
    const out = [], towns = [...w.pois.filter(p => p.town).map(p => [p.name, p.town]), ...(window.game.town ? [['this village', window.game.town]] : [])];
    for (const [name, t] of towns) {
      const flagged = t.buildings.filter(b => b.priority);
      if (flagged.length > 1) out.push(`${name}: ${flagged.length} buildings are the priority`);
      const P = t.priority;
      if (P && (P.removed || !t.buildings.includes(P) || !(P.state === 'site' || (P.state === 'active' && P.B.jobs)))) out.push(`${name}: the priority ${P.kind} is gone or not a site or workplace`);
      if (P && !P.priority) out.push(`${name}: the priority ${P.kind} is not flagged`);
    }
    return out;
  });
  // A site isn't left without builders while someone else has a job to spare (playtest round 3b:
  // a carpenter's site waited eleven minutes because every villager was busy).
  await check('no building site has waited long for builders while a hand could be spared', () =>
    w.pois.flatMap(p => (p.town?.buildings || []).filter(b => b.state === 'site' && !b.builders.length && b.lacked > 90 && !p.town.underAttack && p.town.leastNeeded(b))
      .map(b => `${p.name}: the ${b.kind} site has waited ${Math.round(b.lacked)} s`)));
  // A village with few people and little food puts them on the farms first and feeds itself within a
  // few minutes (playtest round 4: a taken village's hands all took the haulers' places, nobody worked
  // the farms, and it starved for half an hour). A throwaway village laid out so the nearest jobs are
  // not the farms; it is stepped here, never shown.
  await check('a hungry village with few hands works its farms first and is fed within five minutes', async () => {
    // (makeTown puts the town on the place it is given, so it gets a copy: the real village is left alone)
    const p = w.pois.find(q => q.owner === 0 && q.town) || w.home;
    const t = w.makeTown({ ...p, name: `${p.name} (checks() test copy)` }, { villagers: 6, retinue: false, stock: { wood: 80, stone: 20, iron: 10, food: 8 } }), out = [];
    const put = (kind, r0, n) => {
      for (let k = 0, a = 0.3; k < n && a < 60; a += 0.45) {
        for (let r = r0; r < r0 + 30; r += 5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (t.canPlace(kind, x, z, { free: true }).ok && t.place(kind, x, z, { ready: true }).ok) { k++; break; } }
      }
    };
    put('house', 20, 2); put('storehouse', 22, 1); put('carpenter', 20, 1); put('tanner', 24, 1); put('weaponsmith', 24, 1); put('smelter', 26, 1); put('farm', 55, 3);
    t.clock = () => 300;   // (a summer, whatever the campaign's clock says)
    try {
      let hungryAt = null;
      for (let s = 0; s < 600; s++) { t.battle.step(0.5); t.update(0.5); if (t.hungry && hungryAt === null) hungryAt = s / 2; }
      const farms = t.buildings.filter(b => b.kind === 'farm' && b.state === 'active');
      if (t.hungry) out.push(`still hungry after five minutes: ${t.hungerWhy().why}`);
      if (farms.length && !farms.some(b => b.workers.length)) out.push(`nobody works any of its ${farms.length} farms after five minutes`);
      if (t.openFood() > 1 && t.idle === 0 && t.population > 6) out.push(`${t.openFood()} food places stand open while every hand works elsewhere`);
    } finally { t.lost = true; }
    return out;
  });
  // The harvest rhythm (creator, 2026-11-23, economy.js WINTERS): fields work by the season but a year's crop is what it was, and a new
  // village gets through its first winter fed. Two winters to try side by side, mild (the default) and hard (a fallow winter): each is held to it.
  const winters = async fn => {
    const E = await import('./economy.js'), was = E.winterNow(), out = [];
    try { for (const k of Object.keys(E.WINTERS)) { E.setWinter(k); for (const m of await fn(k, E)) out.push(`${k} winter: ${m}`); } } finally { E.setWinter(was); }
    return out;
  };
  await check("a year's field yield is within 5% of before in each winter, and the seasons differ as they should", () => winters(async (k, E) => {
    const out = [];
    const mean = from => { let sum = 0, n = 0; for (let t = from; t < from + E.YEAR_LEN; t += 10) { sum += E.fieldShare(t); n++; } return sum / n; };
    const was = { farm: 4, flax: 3 };
    for (const b of ['farm', 'flax']) {
      const got = Object.values(E.BUILDINGS[b].gather.out)[0] * mean(E.YEAR_LEN) / was[b];
      if (Math.abs(got - 1) > 0.05) out.push(`a ${b}'s year of crops is ${Math.round(got * 100)}% of what it was, not 95 to 105%`);
    }
    if (E.fieldShare(1000) !== E.WINTERS[k].first) out.push(`the first winter's fields give ${E.fieldShare(1000)}, not ${E.WINTERS[k].first}`);
    const second = E.fieldShare(1000 + E.YEAR_LEN);
    if (k === 'hard' ? second !== 0 : !(second > 0 && second < E.fieldShare(50))) out.push(`the second winter gives ${second}`);
    if (!(E.fieldShare(1000 - 300) > E.fieldShare(400) && E.fieldShare(400) > E.fieldShare(50))) out.push('autumn does not beat summer and summer spring');
    const d = E.untilSeason(0, 3); if (d !== 900) out.push(`winter is ${d} s from the start, not 900`);
    return out;
  }));
  await check('a new village with two farms gets through its first winter fed in each winter, and says winter is coming', () => winters(async () => {
    const p = w.pois.find(q => q.owner === 0 && q.town) || w.home;
    const t = w.makeTown({ ...p, id: 'checks-winter', name: 'Wintersby' }, { villagers: 12, retinue: false, stock: { wood: 100, stone: 12, food: 60 } }), out = [];
    t.clock = () => t.time;   // its own age: spring at the start
    const put = (kind, r0, n) => { for (let k = 0, a = 0.3; k < n && a < 60; a += 0.45) for (let r = r0; r < r0 + 30; r += 5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (t.canPlace(kind, x, z, { free: true }).ok && t.place(kind, x, z, { ready: true }).ok) { k++; break; } } };
    put('house', 20, 2); put('storehouse', 22, 1); put('farm', 55, 2);
    try {
      let starving = 0, warned = false, lowest = Infinity;
      for (let s = 0; s < 2500; s++) {
        t.battle.step(0.5); t.update(0.5);
        if (t.starving) starving++;
        if (s % 20 === 0) {
          if (t.time > 800 && t.time < 900 && !warned && t.larderForecast().text) warned = /winter in/.test(t.larderForecast().text);
          if (t.time > 900 && t.time < 1200) lowest = Math.min(lowest, t.larder);
        }
      }
      if (starving) out.push(`${starving * 0.5} s of going hungry in the first year`);
      if (!warned) out.push('the forecast did not say winter was coming');
      if (!(lowest > 0.3)) out.push(`the stores fell to ${lowest.toFixed(2)} min of food in the first winter`);
    } finally { t.lost = true; }
    return out;
  }));
  await check('the second winter is lean in the mild winter and fallow in the hard: status, yield, hands and larder say so', () => winters(async k => {
    const p = w.pois.find(q => q.owner === 0 && q.town) || w.home;
    const t = w.makeTown({ ...p, id: 'checks-fallow', name: 'Fallowby' }, { villagers: 10, retinue: false, stock: { wood: 100, stone: 12, food: 200 } }), out = [];
    let now = 1200 + 600;   // the second autumn, so the farm gets its hands first; then the second winter
    t.clock = () => now;
    const put = (kind, r0, n) => { for (let k = 0, a = 0.3; k < n && a < 60; a += 0.45) for (let r = r0; r < r0 + 30; r += 5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (t.canPlace(kind, x, z, { free: true }).ok && t.place(kind, x, z, { ready: true }).ok) { k++; break; } } };
    put('house', 20, 1); put('storehouse', 22, 1); put('farm', 55, 1); put('hunter', 40, 1);
    try {
      const farm = t.buildings.find(b => b.kind === 'farm');
      if (!farm) return ['the test village has no farm'];
      let made = 0; const put0 = t.put.bind(t); t.put = (b, g, n) => { if (b === farm && g === 'food' && n > 0) made += n; return put0(b, g, n); };
      for (let s = 0; s < 120; s++) { t.battle.step(0.5); t.update(0.5); }
      if (!farm.workers.length) return ['the farm got no hands in autumn'];
      const autumn = made; made = 0; now = 1200 + 1000; farm.store.food = 0;
      for (let s = 0; s < 120; s++) { t.battle.step(0.5); t.update(0.5); }
      if (!farm.workers.length) out.push('the farm lost its hands for the winter');
      if (k === 'hard') {
        if (!/Fallow till spring \(\d+ min\)/.test(farm.status)) out.push(`a fallow farm says "${farm.status}"`);
        if (made > 0) out.push(`a fallow farm made ${made} meals`);
        if (!/^Stores: \d+ meals, enough for [\d.]+ min at \d+ mouths; the fields wake in \d+ min/.test(t.larderForecast().text)) out.push(`the forecast says "${t.larderForecast().text}"`);
      } else {
        if (/Fallow/.test(farm.status)) out.push(`a farm in a mild winter says "${farm.status}"`);
        if (!(made > 0 && made < autumn)) out.push(`a mild winter's farm made ${made} meals against ${autumn} in autumn: lean, not nothing, not plenty`);
        if (!/^Stores: \d+ meals, enough for [\d.]+ min at \d+ mouths; winter eases in \d+ min/.test(t.larderForecast().text)) out.push(`the forecast says "${t.larderForecast().text}"`);
      }
      const why = t.foodCause();
      if (!/winter/.test(why.why) || !/hunter/.test(why.fix)) out.push(`the cause of hunger in winter is "${why.why}" / "${why.fix}"`);
    } finally { t.lost = true; }
    return out;
  }));
  // A steward's foresight (holdings.js ahead, buyFood): a place sees the winter and the spring after it, and buys the food it will want.
  await check("a place sees a winter its stores won't carry, and buys food for it with the purse it has, in each winter", () => winters(async () => {
    const H = await import('./world/holdings.js'), out = [];
    const mk = (farms, stock, extra = {}) => ({ pop: 40, stock: { food: stock }, buildings: { farm: farms, house: 8, market: 1, ...extra }, glut: {} });
    const rich = H.ahead(mk(9, 3000), 0), poor = H.ahead(mk(1, 100), 0);
    if (rich.short) out.push(`a place with nine farms and 3,000 meals thinks the year will run short (low ${Math.round(rich.low)})`);
    if (!poor.short) out.push('a place with one farm and 100 meals for 40 people does not see the year run short');
    if (!(H.foodRate(mk(3, 0), 1.6) > H.foodRate(mk(3, 0), 1) && H.foodRate(mk(3, 0), 0) === 0)) out.push('fields do not bring more in autumn than summer, or bring something in winter');
    if (!(H.foodRate(mk(3, 0, { hunter: 2 }), 0) > 0)) out.push('hunters bring nothing in winter');
    const e = mk(1, 20); e.ahead = H.ahead(e, 1000);
    const purse = { gold: 500 }, got = H.buyFood(e, purse, 1000);
    if (got < 10 || purse.gold >= 500) out.push(`a short place with a market and 500 gold bought ${got} meals for ${500 - purse.gold} gold`);
    const dearer = H.buyFood(e, { gold: 500 }, 1000);
    if (dearer < 10) out.push('the second purchase failed with gold in hand');
    if (e.glut['buy:food'] === undefined) out.push('buying food left no mark on the price');
    if (H.buyFood(e, { gold: 0 }, 1000)) out.push('a place with no gold bought food');
    const full = mk(9, 3000); full.ahead = H.ahead(full, 0);
    if (H.buyFood(full, { gold: 500 }, 0)) out.push('a place with plenty bought food');
    // The people's year comes before the garrison's meals: the men eat only what is over it.
    const lean = mk(1, 100, { hunter: 1 }); lean.now = 700;
    const unfed = H.feedMen(lean, 80, 5), fat = mk(3, 3000, { hunter: 1 }); fat.now = 700;
    if (!(unfed > 70)) out.push(`80 men were fed ${Math.round(80 - unfed)} of 80 from a larder the winter will want`);
    if (H.feedMen(fat, 80, 5) > 1) out.push('80 men could not eat from a full larder');
    const noMarket = mk(1, 20, { market: 0 }); noMarket.ahead = H.ahead(noMarket, 1000);
    if (H.buyFood(noMarket, { gold: 500 }, 1000)) out.push('a place with no market bought food');
    return out;
  }));
  // The carpenter makes planks until you switch shields on (round 4), for you only: stewards' places
  // keep the shields they always made.
  await check('a new carpenter makes planks only; shields start switched off in your villages, not in stewards\'', async () => {
    const E = await import('./economy.js'), out = [];
    const rs = E.BUILDINGS.carpenter.recipes, sh = rs.findIndex(r => 'shields' in r.out);
    if (sh < 0 || rs[sh].start !== 'off') out.push('the shield recipe does not start switched off');
    if (rs[sh]?.off) out.push('the shield recipe is off for stewards too');
    const p = w.pois.find(q => q.owner === 0 && q.town) || w.home, t = w.makeTown({ ...p, name: `${p.name} (checks() test copy)` }, { villagers: 1, retinue: false });
    try {
      const made = t.place('carpenter', 25, 5, { ready: true }).building;
      if (!made.off.has(sh) || made.off.has(1 - sh)) out.push('a new carpenter does not start on planks only');
    } finally { t.lost = true; }
    return out;
  });
  // The creator's plane playtest (2026-11-22): food comes in before workshops (sites still first), a storehouse's
  // haulers have a cart, nothing is held back for building, and a market can buy. A throwaway village each time.
  const throwaway = (opts, kinds) => {
    const p = w.pois.find(q => q.owner === 0 && q.town) || w.home;
    const t = w.makeTown({ ...p, name: `${p.name} (checks() test copy)` }, { villagers: 8, retinue: false, ...opts });
    const put = (kind, r0, n) => {
      for (let k = 0, a = 0.3; k < n && a < 60; a += 0.45) {
        for (let r = r0; r < r0 + 30; r += 5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (t.canPlace(kind, x, z, { free: true }).ok && t.place(kind, x, z, { ready: true }).ok) { k++; break; } }
      }
    };
    for (const [k, r0, n] of kinds) put(k, r0, n);
    return t;
  };
  await check('haulers serve sites first, then food, then workshops; a storehouse hauler has a cart', async () => {
    const t = throwaway({ stock: { wood: 200, stone: 20, food: 0 } }, [['storehouse', 22, 1], ['farm', 40, 1], ['carpenter', 24, 1]]), out = [];
    try {
      const farm = t.buildings.find(b => b.kind === 'farm'), store = t.buildings.find(b => b.kind === 'storehouse'), v = t.villagers[0];
      if (!farm || !store) return [`the test village has no ${farm ? 'storehouse' : 'farm'}`];
      v.job = null; v.state = 'idle'; t.put(farm, 'food', 60);
      const take = (who, why) => { who.task = t.planHaul(who); const plan = who.task && { ...who.task }; t.cancelHaul(who); if (!plan) out.push(`${why}: no trip planned`); return plan; };
      const first = take(v, 'meals at the farm and a carpenter wanting wood');
      if (first && first.g !== 'food') out.push(`with meals at the farm and a carpenter wanting wood, the next crate is ${first.g}, not food`);
      const E = await import('./economy.js');
      if (first && first.n > E.crate('food')) out.push(`a villager with no cart carries ${first.n}, more than a crate`);
      const site = t.place('house', -30, 25).building;
      if (site) {
        const second = take(v, 'a house site');
        if (second && second.to !== site) out.push(`with a house site waiting, the next crate goes to a ${second.to.kind}, not the site`);
      }
      if (site) t.demolish(site);
      v.job = store;
      const cart = take(v, 'a storehouse hauler');
      if (cart && !(cart.n > E.crate('food'))) out.push(`a storehouse hauler carries ${cart.n}, no more than a crate`);
      v.job = null;
    } finally { t.lost = true; }
    return out;
  });
  await check('nothing is held back for building: no plank or wood reserve, and planks go to shields as you choose', async () => {
    const E = await import('./economy.js'), out = [];
    if ('RESERVE' in E || 'WOOD_FIRST' in E) out.push('economy.js still exports a reserve for building');
    const t = throwaway({ stock: { wood: 10, planks: 8 } }, [['carpenter', 24, 1]]);
    try {
      const b = t.buildings.find(q => q.kind === 'carpenter'), sh = b.B.recipes.findIndex(r => 'shields' in r.out);
      b.off.delete(sh);
      if (!t.wantedRecipes(b).some(r => 'shields' in r.out)) out.push('with 8 planks and shields switched on, the carpenter does not want to make shields');
      if (!t.wantedRecipes(b).some(r => 'planks' in r.out)) out.push('with 10 wood in the stores, the carpenter does not want to make planks');
    } finally { t.lost = true; }
    return out;
  });
  // A farm hand whose yard is full waits at the farm's door, not where he was put (checks() on the Duke test world:
  // one stood for good inside a woodcutter, with the farm's meals all promised to a hauler on the road).
  await check('a gatherer whose yard is full goes to wait at his door, even from inside another building', async () => {
    const t = throwaway({ stock: { wood: 50, food: 20 } }, [['woodcutter', 22, 1], ['farm', 45, 1]]), out = [];
    try {
      const cutter = t.buildings.find(b => b.kind === 'woodcutter'), farm = t.buildings.find(b => b.kind === 'farm');
      if (!cutter || !farm) return [`the test village has no ${cutter ? 'farm' : 'woodcutter'}`];
      const v = t.villagers[0];
      t.release(v);
      v.job = farm; farm.workers.push(v); v.state = 'work'; v.task = null;
      v.x = cutter.x + 0.5; v.z = cutter.z;
      t.put(farm, 'food', 40); farm.reserved.food = 40;   // a full yard, every meal promised to a hauler still on the road
      const away = () => Math.hypot(v.x - cutter.x, v.z - cutter.z);
      for (let i = 0; i < 80; i++) { t.battle.step(0.5); t.update(0.5); if (!(farm.store.food >= 30)) farm.store.food = 40; }
      if (away() < cutter.B.radius * 0.6) out.push('a farm hand with a full yard stayed inside the woodcutter he was put in');
      const d = t.door(farm, v);
      if (Math.hypot(v.x - d.x, v.z - d.z) > 8) out.push(`a farm hand with a full yard is ${Math.round(Math.hypot(v.x - d.x, v.z - d.z))} m from the farm's door after 40 s`);
    } finally { t.lost = true; }
    return out;
  });
  // Nobody stands at the heart of a building or the keep: a villager put there is set down outside it (clearVillagers).
  await check('a villager found at the heart of a building or the keep is set down outside it', async () => {
    const t = throwaway({ stock: { wood: 50, food: 20 } }, [['woodcutter', 22, 1]]), out = [];
    try {
      const cutter = t.buildings.find(b => b.kind === 'woodcutter');
      if (!cutter) return ['the test village has no woodcutter'];
      const [a, b] = t.villagers;
      a.x = cutter.x + 0.4; a.z = cutter.z - 0.3; b.x = t.keep.x + 1; b.z = t.keep.z + 1;
      t.clearVillagers();
      if (Math.hypot(a.x - cutter.x, a.z - cutter.z) < cutter.B.radius * 0.6) out.push('a villager at the heart of a woodcutter was left there');
      if (Math.hypot(b.x - t.keep.x, b.z - t.keep.z) < t.keep.B.radius * 0.6) out.push('a villager at the heart of the keep was left there');
    } finally { t.lost = true; }
    return out;
  });
  // A regiment at rest with men at the heart of a building moves to free ground (clearFromBuildings).
  await check('a regiment left standing inside a building moves out to free ground', async () => {
    const t = throwaway({ stock: { wood: 50, food: 20 } }, [['market', 30, 1]]), out = [];
    try {
      const m = t.buildings.find(b => b.kind === 'market');
      if (!m) return ['the test village has no market'];
      const [r] = t.addTroops([{ key: 'spear', count: 24, name: 'Test standers' }], 1.0);
      for (let i = 0; i < 40; i++) { t.battle.step(0.5); t.update(0.5); }   // (let it form up where it was sent)
      r.dest = null; r.destX = null;
      for (const s of r.soldiers) { s.x = m.x + (Math.random() - 0.5) * 3; s.z = m.z + (Math.random() - 0.5) * 3; }
      r.x = r.cx = m.x; r.z = r.cz = m.z;
      const inside = () => r.soldiers.filter(s => s.alive && Math.hypot(s.x - m.x, s.z - m.z) < m.B.radius * 0.6).length;
      if (inside() < 10) return [`the test could not put the men inside (${inside()})`];
      for (let i = 0; i < 160; i++) { t.battle.step(0.5); t.update(0.5); if (i % 2 === 0) t.thinkAttackers(); }
      if (inside()) out.push(`${inside()} of 24 men still stand inside the market after 80 s`);
    } finally { t.lost = true; }
    return out;
  });
  await check('a market buys what you switch on, dearer than it sells, dearer still as it buys', async () => {
    const E = await import('./economy.js'), out = [];
    const M = E.BUILDINGS.market.recipes;
    for (const r of M.filter(q => q.buy)) {
      const g = E.buyGood(r), sell = M.find(q => q.gold && E.saleGood(q) === g);
      if (!r.off) out.push(`buying ${g} starts switched on`);
      if (sell && !(r.buy / r.out[g] > 2 * sell.gold / sell.in[g])) out.push(`buying ${g} costs ${(r.buy / r.out[g]).toFixed(1)} a unit, not twice what selling pays (${(sell.gold / sell.in[g]).toFixed(1)})`);
    }
    const t = throwaway({ stock: { wood: 10, stone: 10, food: 20 } }, [['market', 24, 1], ['storehouse', 22, 1]]);
    try {
      // (its own purse: a throwaway village shares yours, and the real world's wages and taxes move that while this runs)
      t.purse = { gold: 300 };
      const m = t.buildings.find(q => q.kind === 'market'), i = M.findIndex(r => r.buy && 'wood' in r.out);
      if (!m) return ['the test village could not place a market'];
      const before = t.stock.wood;
      if (t.wantedRecipes(m).some(r => r.buy)) out.push('a market buys with nothing switched on');
      m.off.delete(i);
      const price0 = t.buyPrice(M[i]);
      // (the price is read as it goes: it mends 60 goods a minute, so once buying stops, at the keep's amount or for want of a
      // hauler, it is back to the listed price by the end)
      let peak = price0;
      for (let k = 0; k < 240; k++) { t.battle.step(0.5); t.update(0.5); peak = Math.max(peak, t.buyPrice(M[i])); }
      if (!(t.stock.wood > before)) out.push(`with buying wood on and 300 gold, wood went from ${before} to ${t.stock.wood}`);
      if (!(t.purse.gold < 300)) out.push('buying cost no gold');
      if (!(peak > price0)) out.push(`the price of wood did not rise as it was bought (${price0.toFixed(1)}, never above ${peak.toFixed(1)})`);
      t.purse.gold = 0; m.recipe = null;
      if (t.wantedRecipes(m).some(r => r.buy)) out.push('a market with no gold still wants to buy');
    } finally { t.lost = true; }
    return out;
  });
  await check('raiders are an alert at the map\'s edge, and the people are called out only within reach of the village', async () => {
    const t = throwaway({}, [['house', 20, 1]]), out = [];
    try {
      const reg = (x, z) => ({ cx: x, cz: z, gone: false, routing: false, regrouping: false, alive: 10 });
      t.attackers = [{ regs: [reg(200, 0)], mode: 'raid', leaving: false }];
      if (t.raidersNear()) out.push('raiders 200 m out count as near the village');
      t.attackers = [{ regs: [reg(t.keep.x + 40, t.keep.z)], mode: 'raid', leaving: false }];
      if (!t.raidersNear()) out.push('raiders 40 m from the keep do not count as near the village');
      t.attackers = [];
      t.hungerRun = 1;
      if (t.starving) out.push('one meal short already shows as going hungry');
      t.hungerRun = 2;
      if (!t.starving) out.push('two meals short in a row is not going hungry');
    } finally { t.attackers = []; t.lost = true; }
    return out;
  });
  // The armed arrière-ban (creator, 2026-11-22, world/ban.js): a village's ban is a roster of armed men, armed out of
  // its barracks for good, taken first at a call, and back in the roster with what they learned.
  await check('the ban is armed out of the racks for good, capped by rank, taken first at a call and returned with its experience', async () => {
    const B = await import('./world/ban.js'), { ARRIERE } = await import('./world/arriere.js'), out = [];
    const per = ARRIERE.per[w.rank] || 0;
    if (!per) return null;
    const real = w.pois.find(q => q.owner === 0 && q.town) || w.home;
    const copy = { ...real, id: 'checks-ban', name: 'Checksby', ban: undefined, town: null };
    const t = w.makeTown(copy, { villagers: 8, retinue: false });
    copy.town = t; w.byId[copy.id] = copy;
    try {
      const rack = t.place('barracks', 30, 0, { ready: true, free: true }).building;
      if (!rack) return ['could not place a barracks in the test village'];
      if (t.armBan('spear', 'leather').ok) out.push('a ban was armed with nothing on the racks');
      for (const [g, n] of Object.entries(B.kitFor('spear', 'leather', 10 * 6))) t.put(rack, g, n);
      const goods = () => Object.values(rack.store).reduce((n, x) => n + x, 0), before = goods();
      const r1 = t.armBan('spear', 'leather');
      if (!r1.ok) return [`arming a batch failed: ${r1.reason}`];
      if (before - goods() < 30) out.push(`arming ten spearmen in leather took ${before - goods()} goods off the racks, not at least 30`);
      if (B.armedIn(copy) !== 10) out.push(`after arming 10, the ban has ${B.armedIn(copy)} armed`);
      let batches = 1; while (batches < 8 && t.armBan('spear', 'leather').ok) batches++;
      if (B.banMen(w, copy) > per) out.push(`the ban holds ${B.banMen(w, copy)} armed men, over the rank's ${per}`);
      if (batches !== Math.floor(per / 10)) out.push(`${batches} batches of ten were armed at a rank that allows ${per}`);
      // A call takes the armed men first, the best kit first, marked with their home and the time they go home.
      const armed = B.armedIn(copy), until = w.time + 600, taken = B.takeRoster(copy, armed + 7, until);
      const got = taken.reduce((n, u) => n + u.count, 0);
      if (got !== armed) out.push(`a call for ${armed + 7} took ${got} of ${armed} armed men`);
      if (taken.some(u => u.home !== 'checks-ban' || u.until !== until || u.armour !== 'leather')) out.push('the men taken do not carry their home, their time and their armour');
      if (B.armedIn(copy)) out.push('the men called are still in the roster');
      // Home again: back in the roster, with experience averaged by numbers and the most battles kept.
      const half = taken.map(u => ({ ...u, count: Math.floor(u.count / 2), xp: 4, battles: 3 }));
      for (const u of half) B.returnToRoster(w, u);
      const back = B.rosterOf(copy);
      if (B.armedIn(copy) !== half.reduce((n, u) => n + u.count, 0)) out.push(`${B.armedIn(copy)} came back, not ${half.reduce((n, u) => n + u.count, 0)}`);
      if (back.some(u => Math.abs(u.xp - 4) > 0.01 || u.battles !== 3)) out.push(`the men who came home lost their experience: ${JSON.stringify(back.map(u => [u.xp, u.battles]))}`);
      if (B.returnToRoster(w, { key: 'militia', count: 5 })) out.push('plain militia (no home) went into a roster');
      // A house arms its own place's ban out of its own stock, by the same rule.
      const e = { buildings: { barracks: 1 }, stock: { spears: 30, shields: 30, mail: 30, leatherarmour: 30 } }, ph = { ...real, id: 'checks-ai', name: 'Aiby', ban: undefined };
      w.byId['checks-ai'] = ph;
      const armedAi = B.aiArm(w, ph, e, 'Lord', 100);
      if (!armedAi || B.armedIn(ph) !== 10) out.push(`a house with kit in stock armed ${B.armedIn(ph)} men`);
      else if (!(30 - e.stock.mail >= 10 || 30 - e.stock.leatherarmour >= 10)) out.push('a house armed a batch without spending its stock');
      delete w.byId['checks-ai'];
    } finally { t.lost = true; delete w.byId['checks-ban']; }
    return out;
  });
  // Raiders weigh the danger (creator, 2026-11-22, world/relief.js): help they can see, or a host closing, clearly
  // stronger than the band, and it makes off with its plunder; a band that sees nothing stays.
  await check('a raid band breaks off before a clearly stronger relief, keeps its plunder, and stays when nothing comes', async () => {
    const R = await import('./world/relief.js'), E = await import('./economy.js'), out = [];
    const p = w.pois.find(q => q.owner === 0 && q.town) || w.home;
    const t = w.makeTown({ ...p, id: 'checks-relief', name: 'Reliefby' }, { villagers: 12, retinue: false });
    try {
      const band = () => [{ key: 'bandit', count: 20, name: 'Test band' }, { key: 'bandit', count: 20, name: 'Test band' }];
      const start = () => { t.attackers = []; t.battle.regs = t.battle.regs.filter(r => r.side === 0); t.receiveAttack(band(), 1.0, { name: 'Test raiders' }); const g = t.attackers.at(-1); g.time = 5; return g; };
      let g = start();
      t.reliefComing = () => null; t.checkRelief(g);
      if (g.leaving) out.push('a band that saw nothing coming made off');
      const power = t.strength(g.regs);
      t.reliefComing = () => ({ power: power * 0.8, men: 30, places: ['X'], eta: 40 });
      t.checkRelief(g);
      if (g.leaving) out.push('a band made off before a host weaker than itself');
      t.reliefComing = () => ({ power: power * (E.RELIEF.ratio + 0.2), men: 100, places: ['X'], eta: 40 });
      t.checkRelief(g);
      if (!g.leaving || !g.brokeOff) out.push('a band did not break off before a host clearly stronger than itself');
      // Help arriving on the village's ground, in the band's sight.
      g = start(); t.reliefComing = () => null;
      const a = Math.atan2(g.entry.x, g.entry.z);
      const relief = t.addTroops([{ key: 'spear', count: 40, name: 'Test relief' }, { key: 'spear', count: 40, name: 'Test relief' }], a);
      if (!relief.every(r => r.relief)) out.push('men who came in during a raid are not marked as relief');
      t.checkRelief(g);
      if (!g.leaving) out.push('a band did not break off before strong help arriving in its sight');
      // Its plunder: what burns with a store in it goes on the band; a band wiped out gives it back to the village.
      g = start();
      const b = t.buildings.find(q => q.state === 'active' && q.B.storage) || t.place('storehouse', 40, 40, { ready: true, free: true }).building;
      b.store = { wood: 30, stone: 12 };
      t.ruin(b, g);
      if (!(g.loot?.goods.wood === 30 && g.loot.goods.stone === 12)) out.push(`a burned store's goods did not go on the band: ${JSON.stringify(g.loot)}`);
      const before = t.keep.store.wood || 0;
      for (const r of g.regs) { r.gone = true; for (const sd of r.soldiers) sd.alive = false; }
      t.updateAttacks(1);
      if ((t.keep.store.wood || 0) < before + 30) out.push('a band wiped out did not give its plunder back to the village');
      if (R.lootWords({ goods: { wood: 30 }, gold: 5 }) !== '30 wood and 5 gold') out.push(`lootWords says "${R.lootWords({ goods: { wood: 30 }, gold: 5 })}"`);
    } finally { t.lost = true; t.attackers = []; }
    return out;
  });
  await check('your party in a place it storms is warned of a host coming, once, with the choice to pull back; the host follows it home', async () => {
    const R = await import('./world/relief.js'), out = [];
    const M = await import('./world/march.js'), E = await import('./economy.js');
    // a host coming: 70% of RELIEF.eta seconds' march from the place, at the pace the game marches foot
    const near = -Math.round(E.RELIEF.eta * M.marchPace(M.MARCH_LIVE, [{ key: 'spear', count: 1 }]) * 0.7);
    const owner = 3, at = { x: 0, z: 0 };
    const place = { id: 'checks-storm', name: 'Stormby', owner, x: 0, z: 0, town: { hostile: { owner }, strength: () => 100, battle: { regs: [{ side: 0, gone: false, routing: false, alive: 60 }] } } };
    const host = { id: 901, side: owner, gone: false, wagon: false, retreating: false, halted: false, x: 0, z: near, path: [place], target: place, last: { name: 'Eldmark', x: 0, z: -300 }, units: [{ key: 'spear', count: 300, name: 'Relief' }] };
    const asked = [], pulled = [], logs = [];
    const W = { armies: [host], pois: [place], dip: [], time: 0, hooks: { choice: ev => asked.push(ev) }, log: m => logs.push(m), endStorm: (p, chose) => pulled.push([p.id, chose]) };
    R.warnRelief(W);
    if (asked.length !== 1) out.push(`${asked.length} warnings for a host of 300 against 60 men, not 1`);
    else {
      if (!/large force is coming/.test(asked[0].text) || !/Eldmark/.test(asked[0].text)) out.push(`the warning reads: ${asked[0].text}`);
      if (!asked[0].choices.some(c => /Stay/.test(c.label)) || !asked[0].choices.some(c => /Pull back/.test(c.label))) out.push('the warning does not offer both choices');
      asked[0].choices.find(c => /Pull back/.test(c.label)).run();
      if (!pulled.length) out.push('"Pull back" did not pull back');
    }
    R.warnRelief(W);
    if (asked.length !== 1) out.push('the same host was warned of twice');
    host.units = [{ key: 'spear', count: 10, name: 'Few' }];
    place.town.reliefWarned = new Set(); asked.length = 0;
    R.warnRelief(W);
    if (asked.length) out.push('a host weaker than your men raised the alarm');
    // A band reaching a place decided at once (autoRaid): it turns back from a host clearly stronger marching on it, not a weaker one.
    const band = { units: [{ key: 'bandit', count: 40, name: 'Band' }] };
    host.units = [{ key: 'spear', count: 300, name: 'Relief' }];
    if (!R.breaksOff(W, band, place)) out.push('a band did not turn back from a host of 300 marching on the place');
    host.units = [{ key: 'spear', count: 15, name: 'Few' }];
    if (R.breaksOff(W, band, place)) out.push('a band turned back from 15 men');
    host.units = [{ key: 'spear', count: 300, name: 'Relief' }];
    host.path = [{ x: 0, z: -9000 }, place];
    if (R.breaksOff(W, band, place)) out.push('a band turned back from a host half a day away');
    host.path = [place];
    // The chase: a stronger host sent after the beaten party, along a road no longer than the limit.
    const prey = { id: 7, side: 0, path: [{ x: 0, z: 200 }], target: { name: 'Home', x: 0, z: 400 }, units: [{ key: 'spear', count: 40, name: 'Yours' }] };
    const hunter = { id: 8, side: owner, gone: false, halted: false, retreating: false, wagon: false, at: place, last: place, units: [{ key: 'spear', count: 300, name: 'Hunters' }] };
    const ordered = [];
    const W2 = { route: () => ({ length: 300 }), order: (a, d) => { ordered.push([a.id, d.name]); return true; } };
    if (R.chase(W2, [hunter], prey) !== 1 || ordered[0]?.[1] !== 'Home') out.push('a stronger host did not follow the beaten party home');
    W2.route = () => ({ length: 5000 });
    hunter.chasing = null;
    if (R.chase(W2, [hunter], prey) !== 0) out.push('a host followed a party along a road far beyond the limit');
    return out;
  });
  // A match is real (marriages as ambitions, 2026-11-21): a wed vassal's house is a great house, only
  // someone who can still be wed wants one, and the price is half the dowry, to the nearest 25.
  await check('a vassal is wed only into a real great house, and the match is priced', async () => {
    const V2 = await import('./world/vassals.js'), out = [];
    for (const v of w.vassals) {
      if (v.wed && !(v.wed.house >= 1 && v.wed.house < w.bandits)) out.push(`${v.name} is wed into house ${v.wed.house}, which is not a great house`);
      if (v.want === 'marriage' && !v.wed && v.landless) out.push(`${v.name} wants a match but holds no land`);
    }
    for (const H of V2.suitors(w)) { const c = V2.matchCost(w, H.index); if (!(c >= 25) || c % 25) out.push(`a match with ${H.name} costs ${c}`); }
    return out;
  });
  // A wed vassal at war with their spouse's kin is left out of the call to arms, and said so (2026-11-21).
  await check("a vassal at war with their spouse's house sends nobody, and the call says why", async () => {
    const V2 = await import('./world/vassals.js'), out = [], dest = w.home;
    if (!dest) return null;
    const plan = w.bannerPlan(dest);
    for (const x of plan.vassals) {
      const K = V2.kinWar(w, x.v);
      if (K && !(x.refusing && x.kin === K && x.men === 0)) out.push(`${x.v.name} at war with ${K.name}, their spouse's house, is still called`);
    }
    return out;
  });
  // A faction's king is a real house at peace with you, never your vassal (a different king, 2026-11-21).
  await check("a faction's would-be king is a living house at peace with you", async () => {
    const V2 = await import('./world/vassals.js'), out = [], F = w.faction;
    if (F?.demand === 'king' && F.claimant != null) { const H = w.houses[F.claimant]; if (!H?.alive) out.push(`the faction's king, house ${F.claimant}, is gone`); }
    const mem = (F?.members || []).map(id => w.vassals.find(o => o.id === id)).filter(Boolean), c = mem.length ? V2.claimant(w, mem) : null;
    if (c && (!w.houses[c.house].alive || w.atWar(0, c.house) || w.dip[c.house].vassal)) out.push(`${w.houses[c.house].name} would be named king while at war with you, dead or your vassal`);
    return out;
  });
  // A petition you can't afford lights up when the purse fills while it waits (QC, 2026-11-21).
  // Nothing is chosen; the purse is put back.
  await check("a petition's cost is read live", () => {
    const v = kept.find(v => !v.prison && V.holdingsOf(w, v).length);
    if (!v) return null;
    const purse = w.houses[0].gold, [send] = V.petitionChoices(w, v, 'relief'), out = [];
    try {
      w.houses[0].gold = 10;
      if (send.ok || !send.label.includes('you have 10')) out.push(`at 10 gold: ok ${send.ok}, "${send.label}"`);
      w.houses[0].gold = 200;
      if (!send.ok || send.label.includes('you have')) out.push(`at 200 gold: ok ${send.ok}, "${send.label}"`);
    } finally { w.houses[0].gold = purse; }
    return out;
  });
  // The supply form sends from and to what it shows. Drives the Realm screen's own form, then
  // puts it back as it was; nothing is sent.
  const R = (await import('./realmscreen.js')).RealmScreen.shown;
  const runs = w.pois.filter(p => p.owner === 0 && p.town && !p.vassal);
  const pick = runs.find(p => p !== w.home), other = runs.find(p => p !== pick);
  await check("the supply form's ends are what it sends", () => {
    if (!R || !pick || !other) return null;
    const was = { hidden: R.el.hidden, tab: R.tab, run: { ...R.run } }, out = [];
    try {
      R.show('supplies');
      const sel = R.el.querySelector('select[data-set="from"]');
      sel.value = pick.id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const shown = R.el.querySelector('select[data-set="from"]').value, to = R.el.querySelector('select[data-set="to"]').value;
      if (w.byId[R.run.from] !== pick) out.push(`chose ${pick.name} to send from; it would send from ${w.byId[R.run.from]?.name || R.run.from}`);
      if (shown !== pick.id) out.push(`chose ${pick.name} to send from; the form shows ${w.byId[shown]?.name || shown}`);
      if (to === pick.id) out.push(`${pick.name} is both ends`);
      // "Send food" to a place picks someone else to send it.
      const b = document.createElement('button');
      b.dataset.act = `supply::${other.id}:food`;
      R.click({ target: b });
      if (w.byId[R.run.to] !== other) out.push(`"Send food" to ${other.name} would send to ${w.byId[R.run.to]?.name || R.run.to}`);
      if (R.run.from === other.id) out.push(`"Send food" to ${other.name} would send from ${other.name} too`);
    } finally {
      Object.assign(R, { tab: was.tab, run: was.run });
      if (was.hidden) R.hide(); else R.update(true);
    }
    // Redrawing in place must leave the screen itself alone (it once stripped its own id).
    if (R.el.id !== 'realm' || R.el.hidden !== was.hidden) out.push(`after a redraw the screen is id "${R.el.id}", hidden ${R.el.hidden}`);
    return out;
  });
  group = 'World';

  // There is no free wall: your own places are walled only by what is really built there
  // (the seat's seeded numbers, a kind or a layout don't apply to them), in every view that asks.
  await check('your places are walled only by what you built', async () => {
    const out = [];
    for (const p of w.pois) {
      if (p.owner !== 0) continue;
      const real = p.town ? wallsOf(p.town.battle, 0) : p.mem?.pieces.length || 0, says = walledPlace(p);
      if (says !== real > 0) out.push(`${p.name}: walledPlace says ${says ? 'walled' : 'bare'}, the town has ${real} wall pieces`);
      if (p.town && p.mem?.pieces.length) out.push(`${p.name}: remembers ${p.mem.pieces.length} wall pieces while you run it`);
    }
    return sample(out, 10);
  });

  // The map draws each place from its layout (places.js, worldview.js miniature); its numbers
  // (eco.walls) say whether it is walled. They must agree.
  await check('walled places have walls on the map', async () => {
    const view = window.game.worldView, out = [];
    const { buildingModel } = await import('./models.js');
    if (!view?.places) return null;
    const wallGeos = new Set(['wall.stone', 'wall.wood', 'gate.stone', 'gate.wood'].map(buildingModel).filter(Boolean));
    for (const p of w.pois) {
      const o = view.places.get(p);
      // (the map redraws a place when it is next on screen: one changed since isn't drawn yet)
      if (!o?.parts || !p.seen || o.look !== view.lookKey(p)) continue;
      let drawn = false;
      o.parts.traverse(m => { if (m.geometry && wallGeos.has(m.geometry)) drawn = true; });
      if (saysWalled(p) && !drawn) out.push(`${p.name} (${p.kind}${p.seat !== undefined ? ', seat' : ''}): ${p.eco?.walls || 'walled by kind'} by its numbers, no walls on the map`);
      if (!saysWalled(p) && drawn) out.push(`${p.name} (${p.kind}): no walls by its numbers, walls on the map`);
    }
    return sample(out, 10);
  });

  // A place whose numbers name a building the game doesn't have (a slip elsewhere, an old
  // save) is still drawn, less that one, and the map goes on (places.js known).
  await check("a building the game doesn't have can't stop the map", async () => {
    const view = window.game.worldView, p = w.pois.find(q => q.seen && q.eco?.buildings && !q.town);
    if (!view?.dress || !p) return null;
    // (named as a copy so the one console warning it earns reads as this check's, not a real place's)
    const copy = { ...p, name: `${p.name} (checks() test copy)`, eco: { ...p.eco, buildings: { ...p.eco.buildings, 'no such building': 1 } } };
    const { Group } = await import('three'), o = { group: new Group(), flag: new Group() };   // (drawn off the map, not added to it)
    try { view.dress(copy, o); } catch (e) { return [`${p.name} with a bogus building: the map threw ${e.message}`]; }
    return o.parts?.children.length ? [] : [`${p.name} with a bogus building: nothing drawn`];
  });

  // A place you storm or look round is built from its numbers: it should show all of them.
  // (a look-round's village isn't kept on the place, only on the screen)
  const c = window.game.current;
  const shown = [...w.pois.filter(p => p.town).map(p => [p, p.town]), ...(c?.look ? [[c.poi, c.town]] : [])];
  for (const [p, t] of shown) {
    if (!p.eco?.buildings || p.owner === 0 && !t.hostile && !t.readOnly) continue;
    const view = t.hostile ? 'storm' : t.readOnly ? 'look-round' : 'village';
    const side = t.hostile ? 1 : 0;
    group = `${p.name} (${view})`;
    await check('every building in its tally is placed', () => {
      const have = {}, out = [];
      for (const b of t.buildings) if (b.state === 'active') have[b.kind] = (have[b.kind] || 0) + 1;
      for (const [k, n] of Object.entries(p.eco.buildings)) if ((have[k] || 0) < n) out.push(`${k}: ${n} in its numbers, ${have[k] || 0} standing`);
      for (const [k, n] of Object.entries(have)) if (k !== 'house' && !p.eco.buildings[k]) out.push(`${k}: ${n} standing, none in its numbers`);
      return out.length ? [`${builtCount(p.eco)} buildings in its numbers, ${t.buildings.filter(b => b.state === 'active').length} standing`, ...sample(out, 10)] : [];
    });
    await check('walled by its numbers, walled here', () => {
      const n = wallsOf(t.battle, side), says = saysWalled(p);
      if (says && !n) return [`its numbers say ${p.eco.walls || 'walled'}; no walls here`];
      if (!says && n) return [`its numbers say no walls; ${n} wall pieces here`];
      const stone = t.battle.walls.pieces.filter(q => q.side === side && q.material === 'stone').length;
      if (p.eco.walls === 'stone' && n && !stone) return [`its numbers say stone; the walls here are timber`];
      if (p.eco.walls === 'wood' && stone) return [`its numbers say timber; ${stone} stone pieces here`];
      return [];
    });
    await check('people match its numbers', () => {
      const pop = Math.round(p.eco.pop), here = t.population + (t.hostile?.folk || []).reduce((n, u) => n + u.count, 0);
      const out = Math.abs(here - pop) > Math.max(3, pop * 0.1) ? [`${pop} people in its numbers, ${here} here${t.hostile ? ' (villagers and those turned out)' : ''}`] : [];
      return t.hostile && out.length ? { warn: out } : out;
    });
    // A vassal's village is theirs to run: on screen, nothing in the village panels acts.
    if (t.readOnly && c?.look && c.town === t) await check('a look-round offers nothing to act on', () => {
      const live = el => el && !el.disabled && el.offsetParent !== null; // drawn, whatever its hidden flag says
      const out = [];
      for (const [sel, what] of [['#stock [data-tax]', 'tax − / +'], ['#stock [data-act="muster"]', 'Muster the militia'], ['#stock [data-act="standdown"]', 'Stand the militia down'], ['#build [data-build]', 'a building to place']])
        if ([...document.querySelectorAll(sel)].some(live)) out.push(`${what} can be clicked`);
      // Orders go to the selection: nothing of theirs may be selected (QC, 2026-11-21).
      const C = c.controls, mine = t.battle.regs.filter(r => r.side === 0 && !r.gone), was = [...C.selection];
      C.setSelection(mine);
      if (C.selection.size) out.push(`${C.selection.size} of their regiments can be selected and given orders`);
      C.selection.clear(); for (const r of was) C.selection.add(r);
      return out;
    });
  }
}

// ---- a save and reload give back the same numbers ----

// Reloads a snapshot in a hidden frame with its own copy of the game's modules, so the
// live campaign (and its module-level state, like FACTIONS) is never touched.
async function saveChecks(w) {
  const { canSave, snapshot } = await import('./world/save.js');
  group = 'Save and reload';
  await check('a save reloads to the same numbers', async () => {
    const ok = canSave(w);
    if (!ok.ok) return { warn: [`can't save right now (${ok.reason}), so not checked`] };
    const before = snapshot(w);
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    const map = document.querySelector('script[type="importmap"]')?.outerHTML || '';
    frame.srcdoc = `<!doctype html><base href="${location.href}">${map}`;
    document.body.appendChild(frame);
    try {
      await new Promise(r => { frame.onload = r; });
      const url = new URL('world/save.js', import.meta.url).href;
      const S = await frame.contentWindow.eval(`import(${JSON.stringify(url)})`);
      const hooks = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => null) });
      const w2 = S.loadGame(frame.contentWindow.JSON.parse(JSON.stringify(before)), hooks);
      const after = JSON.parse(JSON.stringify(S.snapshot(w2)));
      return sample(diffSaves(before, after), 12);
    } finally { frame.remove(); }
  });
}

function diffSaves(a, b) {
  const out = [];
  const same = (what, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${what}: ${short(x)} → ${short(y)}`); };
  const short = v => { const s = JSON.stringify(v); return s && s.length > 80 ? s.slice(0, 77) + '…' : s; };
  const round = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));
  const tally = list => { const t = {}; for (const x of list) t[x] = (t[x] || 0) + 1; return t; };
  a.houses.forEach((h, i) => { const k = b.houses[i]; if (!h || !k) return; same(`${h.name} gold`, Math.round(h.gold || 0), Math.round(k.gold || 0)); });
  a.pois.forEach((p, i) => {
    const q = b.pois[i];
    if (!q) return out.push(`${p.name}: gone after reload`);
    same(`${p.name} owner`, p.owner, q.owner);
    same(`${p.name} people`, Math.round(p.eco?.pop ?? 0), Math.round(q.eco?.pop ?? 0));
    same(`${p.name} buildings`, p.eco?.buildings, q.eco?.buildings);
    same(`${p.name} walls`, p.eco?.walls, q.eco?.walls);
    same(`${p.name} garrison`, (p.garrison || []).map(u => `${u.count} ${u.key}`), (q.garrison || []).map(u => `${u.count} ${u.key}`));
  });
  same('armies', a.armies.map(x => `${x.name}: ${(x.units || []).map(u => u.count).join('+')}`), b.armies.map(x => `${x.name}: ${(x.units || []).map(u => u.count).join('+')}`));
  for (const t of a.towns) {
    const u = b.towns.find(o => o.i === t.i), name = a.pois[t.i]?.name;
    if (!u) { out.push(`${name}: its village is gone after reload`); continue; }
    same(`${name} buildings`, tally(t.buildings.map(x => `${x.kind}/${x.state}/${x.level}`)), tally(u.buildings.map(x => `${x.kind}/${x.state}/${x.level}`)));
    same(`${name} people at work`, t.people, u.people);
    same(`${name} regiments`, t.regiments.map(r => `${r.count} ${r.key} ${r.armour}`), u.regiments.map(r => `${r.count} ${r.key} ${r.armour}`));
    same(`${name} keep store`, round(t.keep.store), round(u.keep.store));
    same(`${name} walls`, t.walls.pieces.length, u.walls.pieces.length);
    same(`${name} keep level`, t.state.keepLevel, u.state.keepLevel);
    same(`${name} mood`, Math.round(t.state.mood), Math.round(u.state.mood));
  }
  return out;
}

// ---- every sound, model and icon the code names exists ----

let assetMemo = null;   // assets don't change while the page is open; check them once
async function assetChecks() {
  group = 'Assets';
  if (!assetMemo) assetMemo = findAssets();
  const found = await assetMemo;
  for (const r of found) results.push({ group, ...r });
}

async function findAssets() {
  const out = [];
  const push = (name, fails, warns = []) => out.push({ name, status: fails.length ? 'fail' : warns.length ? 'warn' : 'pass', detail: fails.length ? sample(fails, 12) : sample(warns, 12) });
  const base = new URL('../', import.meta.url).href;
  const exists = async url => { try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; } };
  const missing = async urls => (await Promise.all(urls.map(async u => ((await exists(base + u)) ? null : u)))).filter(Boolean);

  // the game's own scripts, as the page loaded them
  const scripts = [...new Set(performance.getEntriesByType('resource').map(e => e.name).filter(n => n.startsWith(base + 'src/') && n.endsWith('.js')))];
  const sources = Object.fromEntries(await Promise.all(scripts.map(async s => [s.slice(base.length), await fetch(s).then(r => r.text()).catch(() => '')])));
  delete sources['src/checks.js'];
  const all = Object.values(sources).join('\n');

  // Sounds: every file in audio.js's tables, and every sound name the code plays.
  const audioSrc = sources['src/audio.js'] || await fetch(base + 'src/audio.js').then(r => r.text()).catch(() => '');
  const files = new Set();
  for (const m of audioSrc.matchAll(/files:\s*\[([^\]]*)\]/g)) for (const f of m[1].matchAll(/'([^']+)'/g)) files.add(`assets/audio/${f[1]}.mp3`);
  for (const m of audioSrc.matchAll(/'((?:music)\/[^']+\.mp3)'/g)) files.add(`assets/audio/${m[1]}`);
  for (const m of audioSrc.matchAll(/'(amb\/[^']+)'/g)) files.add(`assets/audio/${m[1]}.mp3`);
  const names = new Set([...audioSrc.matchAll(/^\s+(\w+):\s*\{\s*files:/gm)].map(m => m[1]));
  for (const m of audioSrc.matchAll(/const (?:ALIAS|BEDS) = \{([^}]*)\}/g)) for (const k of m[1].matchAll(/(\w+):/g)) names.add(k[1]);
  const played = new Set();
  for (const m of all.matchAll(/(?:audio\.(?:play|tick)|sound\?\.|\bplay)\(\s*'(\w+)'/g)) played.add(m[1]);
  push(`sound files (${files.size})`, (await missing([...files])).map(f => `missing ${f}`));
  push(`sounds the code plays (${played.size})`, [...played].filter(n => !names.has(n)).map(n => `plays '${n}', which audio.js doesn't have`));

  // Icons: named in the code and in the game's tables.
  const icons = new Set();
  // ico('x'), ico(a ? 'x' : 'y'), icon: 'x' in the tables, iconImage('x')
  for (const m of all.matchAll(/\bico\(([^()]*?)[,)]/g)) for (const q of m[1].matchAll(/'([\w-]*\w)'/g)) icons.add(q[1]);
  for (const m of all.matchAll(/\b(?:icon:|iconImage\()\s*'([\w-]*\w)'\s*[,)}]/g)) icons.add(m[1]);
  const { ARMOUR_LEVELS, buildingModel, unitModel } = await import('./models.js');
  if (/[`']armour-/.test(all)) for (const l of ARMOUR_LEVELS) icons.add(`armour-${l}`);
  for (const el of document.querySelectorAll('.ico')) { const m = el.style.getPropertyValue('--i').match(/icons\/([\w-]+)\.svg/); if (m) icons.add(m[1]); }
  push(`icons (${icons.size})`, (await missing([...icons].map(i => `assets/icons/${i}.svg`))).map(f => `missing ${f}`));

  // Models: one for every building and every kind of soldier, or it falls back to a shape built in code.
  const { BUILDINGS } = await import('./economy.js');
  const { TYPES, lookChain } = await import('./battle.js');
  const noModel = [];
  for (const kind of Object.keys(BUILDINGS)) {
    const base = kind === 'house' ? 'house.0' : kind === 'monastery' ? 'chapel' : kind;
    // (a camp's tent is the baked soldier's tent)
    if (!buildingModel(base) && !buildingModel(kind) && !(kind === 'tent' && unitModel('tent'))) noModel.push(`building '${kind}'`);
  }
  for (const [key, T] of Object.entries(TYPES)) {
    // a kind without its own model borrows the nearest one (battle.js lookChain)
    if (T.engine ? !buildingModel('siege.' + T.engine.kind) : !lookChain(key).some(k => unitModel(k))) noModel.push(`${T.engine ? 'engine' : 'soldier'} '${key}'`);
  }
  for (const m of ['wall.stone', 'wall.wood', 'gate.stone', 'gate.wood', 'tower.stone', 'tower.wood', 'wagon']) if (!buildingModel(m)) noModel.push(`'${m}'`);
  push('models', [], noModel.map(n => `no baked model for ${n}: drawn as a shape built in code`));
  // Trees: the pack models load (nature.js), and the credits name every pack they come from.
  const { TREES, PACKS } = await import('./nature.js');
  const credits = await fetch(base + 'credits.html').then(r => r.text()).catch(() => '');
  push('tree models and their credits', Object.entries(PACKS).filter(([, name]) => !credits.includes(name)).map(([dir, name]) => `credits.html doesn't name ${name} (assets/scout/${dir})`),
    TREES ? [] : ['the tree models did not load: trees are the shapes built in code']);

  // Event pictures: every event listed as painted has its picture (world/events.js PAINTED).
  const { PAINTED } = await import('./world/events.js');
  push(`event pictures (${PAINTED.size} painted)`, (await missing([...PAINTED].map(id => `assets/art/events/${id}.png`))).map(f => `missing ${f}`));

  // Clips: the animated soldiers and villagers stand in their bind pose without assets/anim.bin, and play a wrong
  // clip if their skeleton lacks one the views ask for (view.js soldierClip, townview.js villagerClip). A gait whose
  // stride can't be measured (anim.js gaitSpeed) can't keep pace with the ground: its feet would slide.
  const { animReady, clipOf, gaitSpeed, gaitFor, rigOffset, PACE } = await import('./anim.js');
  const { ROAD } = await import('./economy.js');
  const { footGaits } = await import('./view.js');
  const { HORSE_GAITS } = await import('./view.js');
  const FOOT = ['Idle', 'Stand', 'Walk', 'Run', 'RunArmed', 'WalkArmed', 'March_Upright', 'Death', 'Death_Fwd', 'Hit', 'Hit_2', 'Step_Back', 'Step_Left', 'Step_Right', 'Step_BackArmed', 'Step_LeftArmed', 'Step_RightArmed', 'Turn', 'TurnArmed', 'Sword_Slash', 'Spear_Thrust', 'Spear_Brace', 'Rout', 'Cheer', 'CheerWalk', 'Shield_Wall'];
  const RIDE = ['Ride_Idle', 'Ride_Trot', 'Ride_Gallop', 'Ride_Charge', 'Ride_Couch', 'Ride_Fall', 'Ride_Cheer'], HORSE = ['Idle', 'Death', ...HORSE_GAITS], WORK = ['Walk', 'Run', 'CarryWalk', 'CarryRun', 'Chop', 'Hoe', 'Hammer', 'Saw', 'Pickaxe', 'Work', 'Idle'];
  const DOG = ['Idle', 'Walk', 'Trot', 'Run', 'Rout', 'Bite', 'Death'];
  const GAITS = ['Walk', 'Trot', 'Run', 'WalkArmed', 'RunArmed', 'March_Upright', 'Rout', 'CarryWalk', 'CarryRun', 'Step_Back', 'Step_Left', 'Step_Right', 'Step_BackArmed', 'Step_LeftArmed', 'Step_RightArmed'];
  const noClip = new Set();
  if (!animReady()) noClip.add('assets/anim.json or anim.bin did not load: animated soldiers are left out');
  else for (const key of [...Object.keys(TYPES), 'villager', 'captain', 'lord', 'lady']) {
    const a = unitModel(key)?.anim;
    if (!a) continue;
    for (const n of key === 'villager' ? WORK : a.horse ? RIDE : a.rig === 'wolf' ? DOG : FOOT) if (!clipOf(a.rig, n)) noClip.add(`${key}: no '${n}' clip for the ${a.rig} skeleton`);
    if (a.horse) for (const n of HORSE) if (!clipOf('horse', n)) noClip.add(`no horse '${n}' clip`);
    for (const n of a.horse ? HORSE_GAITS : GAITS) {
      const rig = a.horse ? 'horse' : a.rig;
      if (clipOf(rig, n) && !(gaitSpeed(rig, n) > 0)) noClip.add(`can't measure the ${rig} '${n}' stride: it plays at its own pace and its feet slide`);
    }
    // every pace a figure moves at has a gait that keeps up (pace.js): a man or dog on foot from a shuffle to a little
    // past his top speed (shuffling into his place included); a horse from a shuffle into its place to the charge's
    // last burst (battle.js: half again its run); a villager from a stroll to running for shelter along a road,
    // carrying or not
    const T = TYPES[key];
    const paces = (rig, gaits, lo, hi) => {
      const slide = [];
      for (let v = lo; v <= hi; v += 0.05) {
        const g = gaitFor(rig, gaits, v), feet = gaitSpeed(rig, g.name) * g.rate / v;
        if (Math.abs(feet - 1) > 0.05) slide.push(v);
      }
      if (slide.length) noClip.add(`${key}: from ${slide[0].toFixed(1)} to ${slide.at(-1).toFixed(1)} m/s no ${rig} gait keeps pace, so the feet slide`);
    };
    if (T && !a.horse) paces(a.rig, footGaits(a), 0.4, T.speed * 1.25);   // (from the 0.4 m/s a man is drawn moving at: view.js)
    // and stepping back or sideways facing on (view.js stepWay), from a shuffle to a hurried walk
    if (T && !a.horse && a.rig !== 'wolf') for (const way of ['Back', 'Left', 'Right']) paces(a.rig, footGaits(a, way), 0.4, PACE.foot * 1.6);
    if (T && a.horse) paces('horse', HORSE_GAITS, 0.4, T.speed * (T.charge ? 1.5 : 1.2));
    if (key === 'villager') for (const g of [['Walk', 'Run'], ['CarryWalk', 'CarryRun']]) paces(a.rig, g, PACE.wander, PACE.foot * 1.6 * ROAD.speed);
  }
  // A lord rides with his bannerman, a second rider in the same model posed by the same clip (bake.js split()).
  if (animReady()) for (const key of ['lord', 'lady']) {
    const m = unitModel(key);
    if (!m?.anim) { noClip.add(`${key}: not animated, so the ${key} slides over the ground`); continue; }
    const S = m.gear.attributes.aShift;
    if (!S) { noClip.add(`${key}: the model has no bannerman data (aShift), so no bannerman rides beside the lord`); continue; }
    let beside = false, other = false;
    for (let i = 0; i < S.count; i++) { if (Math.hypot(S.getX(i), S.getZ(i)) > 0.5) beside = true; if (S.getW(i)) other = true; }
    if (!beside) noClip.add(`${key}: no bannerman standing beside the lord`);
    if (other && !rigOffset()) noClip.add(`${key}: a man and a woman ride in one model but their clips are not aligned`);
  }
  push('soldier and villager clips', [...noClip]);
  if (animReady()) push('weapons held the right way round', await kitProblems([...Object.keys(TYPES), 'villager', 'captain'], unitModel));
  return out;
}

// What each soldier holds, posed in its own clips (anim.js poseOf) and measured, because the props come from models
// in packs whose axes the bake has to guess at (tools/models/lineup: roster.js HELD, skin.js). Model space: +z is
// where the man faces, +y up.
export async function kitProblems(keys, unitModel) {
  const A = await import('./anim.js'), P = A.propSlots(), bad = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.hypot(...a), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mean = vs => vs.reduce((s, v) => [s[0] + v[0] / vs.length, s[1] + v[1] / vs.length, s[2] + v[2] / vs.length], [0, 0, 0]);
  // the main axes of a cloud of points, longest first
  const axes = vs => {
    const c = mean(vs), m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const v of vs) { const d = sub(v, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j]; }
    const out = [];
    for (let k = 0; k < 3; k++) {
      let x = [1, 0.7, 0.4 + k];
      for (let it = 0; it < 60; it++) {
        for (const o of out) { const d = dot(x, o); x = sub(x, o.map(e => e * d)); }
        x = unit([dot(m[0], x), dot(m[1], x), dot(m[2], x)]);
      }
      for (const o of out) { const d = dot(x, o); x = unit(sub(x, o.map(e => e * d))); }
      out.push(x);
    }
    return { c, axes: out };
  };
  for (const key of keys) {
    const look = unitModel(key), a = look?.anim;
    if (!a) continue;
    const geos = [look.gear, look.cloth].filter(Boolean), horseClip = 'Idle';
    // the vertices each prop slot carries (whole weight on it), per geometry
    const slotOf = s => geos.map(g => { const B = g.attributes.aBones, W = g.attributes.aWeights, l = []; for (let i = 0; i < B.count; i++) if (B.getX(i) === s && W.getX(i) > 0.99) l.push(i); return l; });
    const has = s => s != null && slotOf(s).some(l => l.length);
    const posed = (clip, f, s, horse = horseClip) => {
      const out = [];
      slotOf(s).forEach((l, gi) => { if (!l.length) return; const p = A.poseOf(geos[gi], a.rig, clip, horse, f, l); for (const i of l) out.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]); });
      return out;
    };
    const at = (clip, f, s) => { const m = A.boneOf(a.rig, clip, f, s); return [m[3], m[7], m[11]]; };
    const frameAt = (clip, t) => { const c = A.clipOf(a.rig, clip); return c ? Math.max(0, Math.min(c.frames - 1, Math.round(t * c.fps))) : -1; };
    const ev = (clip, e) => A.clipOf(a.rig, clip)?.events?.[e];

    // A bow: at full draw the string runs from the tips to the draw hand, and the limbs curve back toward the archer
    // (the bow's back faces the target).
    if (a.weapon === 'bow' && ev('Bow_Loose', 'loose') != null) {
      const f = frameAt('Bow_Loose', ev('Bow_Loose', 'loose') - 0.1), grip = at('Bow_Loose', f, P.BOW), hand = at('Bow_Loose', f, P.R);
      const d = unit(sub(grip, hand)), bow = posed('Bow_Loose', f, P.BOW);
      const far = bow.map(v => len(sub(v, grip))).sort((x, y) => y - x)[Math.floor(bow.length * 0.04)];
      const tips = mean(bow.filter(v => len(sub(v, grip)) >= far));
      const lean = dot(sub(tips, grip), d);
      if (lean > -0.05) bad.push(`${key}: at full draw in Bow_Loose the bow's tips are ${lean.toFixed(2)} m toward the target from the grip: its limbs curve the wrong way (held backwards)`);
      if (!has(P.STRING_A) || !has(P.STRING_B)) bad.push(`${key}: the bowstring isn't a prop of its own (skin.js PROP.STRING_A/B), so it can't be drawn to the hand`);
      else {
        const str = [...posed('Bow_Loose', f, P.STRING_A), ...posed('Bow_Loose', f, P.STRING_B)];
        const mid = str.reduce((b, v) => (dot(v, d) < dot(b, d) ? v : b));
        const off = len(sub(mid, hand)), inside = dot(sub(mid, hand), d) > -0.06 && dot(sub(grip, mid), d) > 0;
        if (off > 0.09 || !inside) bad.push(`${key}: at full draw the bowstring's middle is ${off.toFixed(2)} m from the draw hand${inside ? '' : ', not between the grip and the hand'}`);
        const ends = str.filter(v => len(sub(v, mid)) > 0.5 * Math.max(...str.map(w => len(sub(w, mid)))));
        const loose = Math.max(...ends.map(v => Math.min(...bow.map(w => len(sub(v, w)))))) ;
        if (loose > 0.06) bad.push(`${key}: at full draw the bowstring's ends are ${loose.toFixed(2)} m off the bow's tips`);
        // after the loose, the string is straight again from tip to tip
        const r = frameAt('Bow_Loose', ev('Bow_Loose', 'loose') + 0.15), s2 = [...posed('Bow_Loose', r, P.STRING_A), ...posed('Bow_Loose', r, P.STRING_B)];
        const { c, axes: [x] } = axes(s2), bent = Math.max(...s2.map(v => { const q = sub(v, c); return len(sub(q, x.map(e => e * dot(q, x)))); }));
        if (bent > 0.03) bad.push(`${key}: after the loose the bowstring is still bent ${bent.toFixed(2)} m off straight`);
      }
    }

    // A weapon's head points where it's used: the shaft from the grip toward the bulk of the weapon.
    const USE = { spear: [['Spear_Thrust', 'thrust', 0.85], ['Spear_Brace', 'brace-held', 0.5]], lance: [['Ride_Couch', 'lance-couched', 0.85]],
      sword: [['Sword_Slash', null, -1]], axe: [['Sword_Slash', null, -1]], crossbow: [['Crossbow_Span', 'shoot', 0.85]] };
    if (key === 'javelin') USE.spear = [['Javelin_Throw', 'release-javelin', 0.3]];
    for (const [clip, e, need] of USE[a.weapon] || []) {
      if (!A.clipOf(a.rig, clip) || !has(P.R)) continue;
      const t = e ? ev(clip, e) - (e === 'release-javelin' || e === 'shoot' ? 0.05 : 0) : A.clipOf(a.rig, clip).duration * 0.5, f = frameAt(clip, t);
      const grip = at(clip, f, P.R), w = posed(clip, f, P.R), head = unit(sub(mean(w), grip));
      if (need > -1 && head[2] < need) bad.push(`${key}: in ${clip}${e ? ` at '${e}'` : ''} the ${a.weapon}'s head points ${head.map(v => v.toFixed(2)).join(', ')}, not forward`);
      if (a.weapon === 'crossbow') {
        // the prod sits across the front of the stock, its tips swept back toward the shooter
        const along = v => dot(sub(v, grip), head), side = v => len(sub(sub(v, grip), head.map(x => x * along(v))));
        const tipAt = Math.max(...w.map(side)), tips = w.filter(v => side(v) > tipAt * 0.9), front = Math.max(...w.filter(v => side(v) < 0.05).map(along));
        const back = tips.reduce((t, v) => t + along(v), 0) / tips.length, mid = Math.max(...w.filter(v => side(v) > 0.06 && side(v) < tipAt * 0.5).map(along));
        if (back > mid - 0.02) bad.push(`${key}: the crossbow's prod has its tips ${(back - mid).toFixed(2)} m ahead of its middle: it's on backwards`);
        if (front - mid > 0.2 || mid < 0.25) bad.push(`${key}: the crossbow's prod sits ${mid.toFixed(2)} m along a stock reaching ${front.toFixed(2)} m: not at its front`);
        if (!has(P.CSTRING_A) || !has(P.CSTRING_B)) bad.push(`${key}: the crossbow's string isn't a prop of its own (skin.js PROP.CSTRING_A/B), so spanning doesn't draw it back`);
        else {
          const sp = ev('Crossbow_Span', 'string-spanned'), str = t => [...posed('Crossbow_Span', frameAt('Crossbow_Span', t), P.CSTRING_A), ...posed('Crossbow_Span', frameAt('Crossbow_Span', t), P.CSTRING_B)];
          // how far the string's middle is drawn from the line between its ends
          const drawn = t => { const s = str(t), e0 = s.reduce((b, v) => (v[1] > b[1] ? v : b)), e1 = s.reduce((b, v) => (len(sub(v, e0)) > len(sub(b, e0)) ? v : b)), u = unit(sub(e1, e0));
            return Math.max(...s.map(v => { const q = sub(v, e0); return len(sub(q, u.map(x => x * dot(q, u)))); })); };
          if (drawn(sp + 0.2) < 0.15) bad.push(`${key}: once spanned the crossbow's string isn't drawn back (it lies ${drawn(sp + 0.2).toFixed(2)} m deep)`);
          if (drawn(ev('Crossbow_Span', 'shoot') + 0.1) > 0.05) bad.push(`${key}: after the shot the crossbow's string stays drawn`);
        }
      }
    }

    // A spear runs beside the shield, never through it.
    if (has(P.R) && has(P.SHIELD) && (a.weapon === 'spear' || a.weapon === 'lance')) {
      for (const clip of a.horse ? ['Ride_Idle', 'Ride_Trot', 'Ride_Couch', 'Ride_Charge'] : ['Stand', 'WalkArmed', 'March_Upright', 'Spear_Thrust', 'Spear_Brace', 'Shield_Wall']) {
        const c = A.clipOf(a.rig, clip);
        if (!c) continue;
        let worst = null;
        for (let k = 0; k < 10; k++) {
          const f = Math.round(k * (c.frames - 1) / 9), sh = posed(clip, f, P.SHIELD), sp = posed(clip, f, P.R);
          if (!sh.length || !sp.length) continue;
          const { c: sc, axes: [, , n] } = axes(sh), rad = sh.map(v => { const q = sub(v, sc); return len(sub(q, n.map(e => e * dot(q, n)))); }).sort((x, y) => x - y)[Math.floor(sh.length * 0.9)];
          const { c: pc, axes: [x] } = axes(sp), ts = sp.map(v => dot(sub(v, pc), x)), lo = Math.min(...ts), hi = Math.max(...ts);
          for (let j = 0; j <= 60; j++) {
            const p = pc.map((e, i) => e + x[i] * (lo + (hi - lo) * j / 60)), q = sub(p, sc), h = dot(q, n), r = len(sub(q, n.map(e => e * h)));
            if (Math.abs(h) < 0.04 && r < rad * 0.85) { worst = Math.round(100 * f / (c.frames - 1)); break; }
          }
          if (worst != null) break;
        }
        if (worst != null) bad.push(`${key}: in ${clip} at ${worst}% the ${a.weapon}'s shaft passes through the shield`);
      }
    }

    // A villager's tools, each shown only in its own work, and shaped for it (in the hand's frame: x along the haft).
    if (a.weapon === 'tools') {
      // goods ride in a sack over the shoulder, only while carrying (townview.js draws no crate for a baked villager)
      if (!has(P.SACK)) bad.push(`${key}: no sack to carry goods in (prop SACK)`);
      else for (const clip of ['CarryWalk', 'CarryRun', 'Walk', 'Idle', 'Chop']) {
        const m = A.clipOf(a.rig, clip) && A.boneOf(a.rig, clip, 0, P.SACK), shown = m && Math.hypot(m[0], m[1], m[2]) > 0.01;
        if (shown !== clip.startsWith('Carry')) bad.push(`${key}: the sack is ${shown ? 'shown' : 'hidden'} in ${clip}`);
      }
      for (const [slot, clip, shape] of [['AXE', 'Chop', 'axe'], ['PICK', 'Pickaxe', 'pick'], ['HOE', 'Hoe', 'hoe'], ['HAMMER', 'Hammer', 'hammer'], ['SAW', 'Saw', 'saw']]) {
        if (!has(P[slot])) { bad.push(`${key}: no ${shape} (prop ${slot})`); continue; }
        for (const other of ['Chop', 'Pickaxe', 'Hoe', 'Hammer', 'Saw', 'Work', 'Walk', 'CarryWalk', 'Idle']) {
          const m = A.clipOf(a.rig, other) && A.boneOf(a.rig, other, 0, P[slot]), shown = m && Math.hypot(m[0], m[1], m[2], m[4], m[5], m[6]) > 0.01;
          if (shown !== (other === clip)) bad.push(`${key}: the ${shape} is ${shown ? 'shown' : 'hidden'} in ${other}`);
        }
        if (shape === 'hammer' || shape === 'saw') continue;   // (the pack's hammer and a saw: no head to measure)
        const vs = [];
        slotOf(P[slot]).forEach((l, gi) => { const b = geos[gi].attributes.bind; for (const i of l) vs.push([b.getX(i), b.getY(i), b.getZ(i)]); });
        const top = Math.max(...vs.map(v => v[0])), head = vs.filter(v => v[0] > top - 0.32 && Math.hypot(v[1], v[2]) > 0.03);
        // the head's reach to each side of the haft, along the way it juts most (a pick: both ways; a blade: one)
        let best = null;
        for (let k = 0; k < 72; k++) {
          const u = [0, Math.cos(k * Math.PI / 36), Math.sin(k * Math.PI / 36)], s = head.map(v => dot(v, u)), lo = -Math.min(0, ...s), hi = Math.max(0, ...s);
          if (!best || (shape === 'pick' ? lo + hi > best.lo + best.hi : hi > best.hi)) best = { lo, hi, u };
        }
        const near = Math.min(best.lo, best.hi), farSide = Math.max(best.lo, best.hi);
        // a pick's two arms taper to points; an axe's and a hoe's blade juts to one side only
        const pointy = () => [1, -1].every(sg => { const end = head.filter(v => sg * dot(v, best.u) > (sg > 0 ? best.hi : best.lo) - 0.04); return Math.max(...end.map(v => v[0])) - Math.min(...end.map(v => v[0])) < 0.05; });
        if (shape === 'pick' ? !(near > 0.12 && pointy()) : !(farSide > 0.1 && near < 0.4 * farSide))
          bad.push(`${key}: the ${shape}'s head reaches ${best.hi.toFixed(2)} and ${best.lo.toFixed(2)} m to either side of the haft: it doesn't read as ${shape === 'axe' ? 'an axe' : 'a ' + shape}`);
        // when it strikes, the edge (or point) leads the stroke; the hoe's blade is on the soil
        const hit = { Chop: 'axe-contact', Pickaxe: 'pick-contact', Hoe: 'pull-soil' }[clip], t = ev(clip, hit);
        if (t == null) { bad.push(`${key}: ${clip} has no '${hit}' event to check the ${shape} at`); continue; }
        const f = frameAt(clip, t), now = posed(clip, f, P[slot]), lead = best.hi >= best.lo ? best.u : best.u.map(e => -e);
        const tip = lead.map(e => e * farSide), m = A.boneOf(a.rig, clip, f, P[slot]);
        const edge = unit([0, 1, 2].map(i => m[i * 4 + 1] * tip[1] + m[i * 4 + 2] * tip[2]));
        if (shape === 'hoe') {
          const low = Math.min(...now.map(v => v[1]));
          if (low < -0.04 || low > 0.06) bad.push(`${key}: at '${hit}' the hoe's blade is ${low.toFixed(2)} m ${low < 0 ? 'under' : 'above'} the soil`);
        } else {
          // (a pick has a point each way, so either may lead)
          const swing = unit(sub(mean(now), mean(posed(clip, f - 2, P[slot])))), along = shape === 'pick' ? Math.abs(dot(edge, swing)) : dot(edge, swing);
          if (along < 0.8) bad.push(`${key}: at '${hit}' the ${shape}'s ${shape === 'pick' ? 'point' : 'edge'} is ${Math.round(Math.acos(Math.max(-1, Math.min(1, along))) * 180 / Math.PI)}° off the stroke`);
        }
      }
    }

    // Nothing slung on the body stands up above the head (spare javelins, arrows in a quiver). (Men only: a dog's
    // bones aren't a man's.)
    if (a.rig !== 'male' && a.rig !== 'female') continue;
    const rest = a.horse ? 'Ride_Idle' : 'Stand', top = [];
    geos.forEach(g => {
      const B = g.attributes.aBones, W = g.attributes.aWeights, l = [];
      for (let i = 0; i < B.count; i++) if (B.getX(i) < 24) l.push(i);
      const p = A.poseOf(g, a.rig, A.clipOf(a.rig, rest) ? rest : 'Idle', horseClip, 0, l);
      for (const i of l) top.push([p[i * 3 + 1], B.getX(i) === 7 && W.getX(i) > 0.5]);
    });
    const crown = Math.max(...top.filter(([, h]) => h).map(([y]) => y)), high = Math.max(...top.filter(([, h]) => !h).map(([y]) => y));
    if (high > crown + 0.05) bad.push(`${key}: something slung on the back stands ${(high - crown).toFixed(2)} m above the head`);
  }
  return bad;
}

// ---- how orders play out, in a battle of their own (nothing on the page is touched) ----

// An attack on the last few men of a regiment, split by a river: one stands on our bank by the
// water, two on the far bank. The attack goes for the man it can get at, not round by a ford
// for the regiment's middle in the water (creator, 2026-11-21: the men stood and never closed).
async function orderChecks() {
  group = 'Orders';
  await check('an attack on 3 men split by a river closes on the one this side within 40 s', async () => {
    const { Battle } = await import('./battle.js'), { makeRiver, carveRiver } = await import('./battlefield.js'), { makeHeight } = await import('./terrain.js');
    const river = makeRiver(5, { force: true }), b = new Battle(carveRiver(makeHeight(5), river), 5, { deploy: false });
    b.setRiver(river);
    const x0 = -35, n = 1 / Math.sqrt(1 + river.slope(x0) ** 2);
    const spot = (along, across) => ({ x: x0 + along - across * river.slope(x0) * n, z: river.zAt(x0) + across * n });
    const half = river.half, us = spot(-10, half + 55), them = spot(2, half + 2);
    const A = b.addRegiment(0, 'spear', us.x, us.z, Math.atan2(them.x - us.x, them.z - us.z));
    const E = b.addRegiment(1, 'spear', them.x, them.z, 0, { count: 3 });
    const where = [spot(0, half + 1.5), spot(2, -half - 2), spot(4, -half - 2)], men = E.soldiers.filter(o => !o.captain);
    const pin = () => men.forEach((o, i) => { if (o.alive) { o.x = where[i].x; o.z = where[i].z; } });
    pin();
    b.orderAttack([A], E);
    let closest = Infinity;
    for (let t = 0; t < 40 && men[0].alive; t += 0.05) {
      b.step(0.05); pin();
      for (const o of A.soldiers) if (live(o)) closest = Math.min(closest, Math.hypot(o.x - men[0].x, o.z - men[0].z));
    }
    return men[0].alive && closest > 4 ? [`after 40 s the nearest of ${A.name} is still ${Math.round(closest)} m from the man on their bank (heading for ${A.dest ? at(A.dest) : 'nowhere'}${A.via ? ', by ' + at(A.via) : ''})`] : [];
  });

  // A regiment sent at a much smaller band swarms it (battle.js swarmFoe): it wraps round the
  // band, rather than hold its slots while the few men nearest do the fighting (creator,
  // 2026-11-22: "only like 4 guys attacked"). Not a ball, though: no more than `crowd` (3) men go for one foe, so the
  // regiment closes round the band and keeps its ranks rather than converging on a point and popping out all at once
  // when it falls (creator, plane playtest, 2026-11-22), so half, not 70%, are close or striking at any time.
  await check('60 spears sent at 8 bandits swarm them: half close in or strike within 8 s, and the band breaks', async () => {
    const { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js');
    const out = [];
    for (const d of [15, 40]) {
      const b = new Battle(makeHeight(4), 4, { deploy: false });
      const A = b.addRegiment(0, 'spear', 0, d, Math.PI, { count: 60 }), E = b.addRegiment(1, 'bandit', 0, 0, 0, { count: 8 });
      b.orderAttack([A], E);
      const man = s => live(s) && !s.captain;
      let contact = null, best = 0, broke = null;
      for (let t = 0; t < 40 && broke === null; t += 0.05) {
        b.step(0.05);
        const es = E.soldiers.filter(man), ms = A.soldiers.filter(man);
        const near = s => es.some(e => Math.hypot(e.x - s.x, e.z - s.z) < 6);
        if (contact === null && ms.some(s => es.some(e => Math.hypot(e.x - s.x, e.z - s.z) < A.T.reach + 1))) contact = t;
        if (contact !== null && t - contact <= 8) best = Math.max(best, ms.filter(s => near(s) || b.time - (s.struckAt ?? -9) < 1.5).length / ms.length);
        if (E.routing || E.alive === 0) broke = t;
      }
      if (contact === null) { out.push(`from ${d} m the spears never reached the bandits in 40 s`); continue; }
      if (best < 0.5) out.push(`from ${d} m at most ${Math.round(best * 100)}% of the spears closed in on the bandits or struck within 8 s of the first blow`);
      if (broke === null || broke - contact > 15) out.push(`from ${d} m the bandits still stood ${Math.round(40 - contact)} s after the first blow`);
    }
    return out;
  });

  // ... and the whole regiment closes on a tougher small band: not a drip of men stepping one by
  // one into dead men's slots while the rest wait (creator, 2026-11-22: "they just ran up two at a
  // time after the last group got killed").
  // (Not 80%: with `crowd` men to a foe (F: two) not every one of 60 can be on a band of 12, so what is asked is that at
  // least as many as may be on them are close or striking, up to 60%: 24 of 60, 30 of 80.)
  await check('a regiment fighting a tougher small band has as many as may be on it close or striking while the band stands', async () => {
    const { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js');
    const out = [];
    for (const [key, n, foe, fn] of [['spear', 60, 'maa', 12], ['spear', 80, 'household', 15]]) {
      const b = new Battle(makeHeight(4), 4, { deploy: false });
      const need = Math.min(0.6, b.tuning.crowd * fn / n);
      const A = b.addRegiment(0, key, 0, 35, Math.PI, { count: n }), E = b.addRegiment(1, foe, 0, 0, 0, { count: fn });
      b.orderAttack([A], E); b.orderAttack([E], A);
      const man = s => live(s) && !s.captain;
      let contact = null, low = 1, at = 0;
      for (let t = 0; t < 60 && !E.routing && E.alive > 0 && !A.routing; t += 0.05) {
        b.step(0.05);
        const es = E.soldiers.filter(man), ms = A.soldiers.filter(man);
        if (contact === null && ms.some(s => es.some(e => Math.hypot(e.x - s.x, e.z - s.z) < A.T.reach + 1))) contact = t;
        if (contact === null || t - contact < 3) continue;
        const share = ms.filter(s => es.some(e => Math.hypot(e.x - s.x, e.z - s.z) < 6) || b.time - (s.struckAt ?? -9) < 1.5).length / ms.length;
        if (share < low) { low = share; at = t - contact; }
      }
      if (contact === null) out.push(`${n} ${key}s never reached ${fn} ${foe}`);
      else if (low < need) out.push(`${n} ${key}s against ${fn} ${foe}: only ${Math.round(low * 100)}% of them in the fight ${Math.round(at)} s after the first blow (${Math.round(need * 100)}% asked), the band still standing`);
    }
    return out;
  });

  // An attack on a routing foe is a chase by the whole regiment (battle.js swarmFoe): horse ride
  // the routers down; foot that can't catch them give up and say so; and village folk who have
  // thrown down their arms are let go, with the reason on the card (creator, 2026-11-22: "only two
  // guys chased when given the order").
  await check('an attack on routers is a chase by the whole regiment, given up when outrun; spared folk are let go', async () => {
    const { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js');
    const out = [], man = s => live(s) && !s.captain;
    const field = (key, n, foe, fn, d) => {
      const b = new Battle(makeHeight(4), 4, { deploy: false });
      const A = b.addRegiment(0, key, 0, d, Math.PI, { count: n }), E = b.addRegiment(1, foe, 0, 0, 0, { count: fn });
      b.startRout(E); b.orderAttack([A], E);
      return { b, A, E };
    };
    {
      const { b, A, E } = field('cav', 40, 'spear', 20, 30);
      let most = 0;
      for (let t = 0; t < 20; t += 0.05) {
        b.step(0.05);
        if (t < 5) { const es = E.soldiers.filter(man), ms = A.soldiers.filter(man); most = Math.max(most, ms.filter(s => s.target?.reg === E || es.some(e => Math.hypot(e.x - s.x, e.z - s.z) < 6)).length / ms.length); }
      }
      if (most < 0.7) out.push(`40 horse sent after 20 routing spearmen: at most ${Math.round(most * 100)}% of them went after the routers in 5 s`);
      if (E.alive > 10) out.push(`40 horse sent after 20 routing spearmen cut down only ${20 - E.alive} in 20 s`);
    }
    {
      const { b, A, E } = field('spear', 60, 'bandit', 15, 20);
      let said = null;
      for (let t = 0; t < 40 && said === null; t += 0.05) { b.step(0.05); if (A.targetReg !== E) said = b.doingLabel(A); }
      if (said === null) out.push('60 spearmen were still chasing 15 routing bandits, faster than them, 40 s on');
      else if (said !== "They've outrun us") out.push(`60 spearmen stopped chasing faster bandits with "${said}" on their card, not "They've outrun us"`);
    }
    {
      const { b, A } = field('spear', 60, 'folk', 20, 20);
      b.step(0.05);
      if (A.targetReg) out.push('an attack on routing village folk stands');
      else if (b.doingLabel(A) !== "They've thrown down their arms; we let them go") out.push(`an attack on routing village folk was dropped with "${b.doingLabel(A)}" on the card`);
    }
    return out;
  });

  // ... and against a line about as wide as its own, a regiment fights as a line: nobody leaves
  // his place to swarm (the rear ranks step into the gaps, as before).
  await check('60 spears against 60 spears fight as lines: nobody swarms', async () => {
    const { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js');
    const b = new Battle(makeHeight(4), 4, { deploy: false });
    const A = b.addRegiment(0, 'spear', 0, 30, Math.PI, { count: 60 }), E = b.addRegiment(1, 'spear', 0, 0, 0, { count: 60 });
    b.orderAttack([A], E); b.orderAttack([E], A);
    let swarmed = 0, fought = false;
    for (let t = 0; t < 20; t += 0.05) {
      b.step(0.05);
      swarmed = Math.max(swarmed, [...A.soldiers, ...E.soldiers].filter(s => live(s) && s.swarm).length);
      fought ||= A.engaged > 0;
    }
    if (!fought) return ['the two lines never came to blows, so nothing was tested'];
    return swarmed ? [`${swarmed} men left the line to swarm a line as wide as their own`] : [];
  });

  // Villagers who break are let go (battle.js spared): no man stays locked on one, no regiment
  // keeps an attack on them, and nobody is cut down after the rout.
  await check('routing village militia are let go: no man or regiment stays on them, none die after', async () => {
    const { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js');
    const b = new Battle(makeHeight(4), 4, { deploy: false });
    const F = b.addRegiment(1, 'folk', 0, 0, 0, { count: 30 }), A = b.addRegiment(0, 'knight', 0, 12, Math.PI, { count: 12 });
    b.orderAttack([A], F);
    for (let t = 0; t < 8 && !A.soldiers.some(s => s.target?.reg === F); t += 0.05) b.step(0.05);
    if (!A.soldiers.some(s => s.target?.reg === F)) return ['the knights never came to blows with the militia, so nothing was tested'];
    b.startRout(F);
    b.step(0.05);
    const out = [], left = F.alive;
    if (A.targetReg === F) out.push(`${A.name} keep their attack on the routing militia`);
    const locked = A.soldiers.filter(s => live(s) && s.target?.reg === F).length;
    if (locked) out.push(`${locked} of ${A.name} stay locked on routing militiamen`);
    b.orderAttack([A], F);
    for (let t = 0; t < 10; t += 0.05) b.step(0.05);
    if (A.targetReg === F) out.push(`${A.name}, sent at the routing militia, still go after them 10 s later`);
    if (F.alive < left) out.push(`${left - F.alive} militiamen cut down after they broke`);
    return out;
  });

  // Down to the militia against a much stronger enemy, they break and live (battle.js checkHeart);
  // beside a garrison still standing, or in a fair fight, they keep the usual morale.
  await check('militia left alone against twice their worth break within 5 s, not beside a garrison or in a fair fight', async () => {
    const { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js');
    const out = [];
    for (const [foe, n, breaks] of [['knight', 24, true], ['spear', 8, false]]) {
      const b = new Battle(makeHeight(6), 6, { deploy: false });
      const F = b.addRegiment(1, 'folk', 0, -80, 0, { count: 40 }), G = b.addRegiment(1, 'spear', 20, -80, 0, { count: 30 });
      b.addRegiment(0, foe, 0, 80, Math.PI, { count: n });
      for (let t = 0; t < 3; t += 0.05) b.step(0.05);
      if (F.routing) out.push(`the militia broke beside a standing garrison, against ${n} ${foe}s`);
      b.startRout(G);
      let at = null;
      for (let t = 0; t < 6 && at === null; t += 0.05) { b.step(0.05); if (F.routing) at = t; }
      if (breaks && at === null) out.push(`the militia, alone against ${n} ${foe}s, still stand 6 s after the garrison broke`);
      if (!breaks && at !== null) out.push(`the militia broke ${at.toFixed(1)} s after the garrison, in a fair fight against ${n} ${foe}s`);
    }
    return out;
  });

  // Regiments that join a fight late (reinforcements, a muster, a host's later regiments) are drawn, in a look
  // already on the field (its meshes grow: view.js grow) as in a new one.
  await check('every man of regiments that join mid-fight is drawn', async () => {
    const THREE = await import('three'), { Battle } = await import('./battle.js'), { makeHeight } = await import('./terrain.js'), { BattleView } = await import('./view.js');
    const b = new Battle(makeHeight(3), 3, { deploy: false }), scene = new THREE.Scene();
    b.addRegiment(0, 'spear', 0, 40, Math.PI, { count: 40 });
    const view = new BattleView(scene, b, b.heightAt, { keeps: false });
    view.update(new Set());
    for (let i = 0; i < 4; i++) b.addRegiment(0, i < 3 ? 'spear' : 'serjeant', (i - 1.5) * 30, 80, Math.PI, { count: 60 });
    b.step(0.05);
    view.update(new Set());
    const drawn = new Set(Object.values(view.meshes).flatMap(m => m.list)), out = [];
    for (const r of b.regs) { const n = r.soldiers.filter(s => live(s) && !drawn.has(s)).length; if (n) out.push(`${r.name}: ${n} of ${r.alive} men not drawn`); }
    return out;
  });

  // Men inside the enemy's walls (over the ladders) sent at a foe outside: they make for a gate,
  // throw it open from within and go out to him, rather than stand with "can't find a way"
  // (QC, 2026-11-21: a storm of Aldbury Abbey).
  await check('men inside enemy walls sent at a foe outside throw a gate open within 60 s, unwarned', async () => {
    const { Battle } = await import('./battle.js'), { buildFort } = await import('./walls.js'), { makeHeight } = await import('./terrain.js');
    const b = new Battle(makeHeight(3), 3, { deploy: false });
    buildFort(b.walls, 1, 0, -120, 44, { material: 'stone', sides: 6, gateAngle: 0 });
    const A = b.addRegiment(0, 'sword', 4, -116, 0), E = b.addRegiment(1, 'maa', 0, -200, 0);
    E.hold = true;
    const said = [], warn = console.warn;
    console.warn = (...a) => { said.push(a.join(' ')); };
    try {
      b.step(0.05);
      b.orderAttack([A], E);
      for (let t = 0; t < 60 && !b.walls.pieces.some(p => p.forced); t += 0.05) b.step(0.05);
    } finally { console.warn = warn; }
    const out = [];
    if (said.length) out.push(`warned: ${said[0]}`);
    if (!b.walls.pieces.some(p => p.forced)) out.push(`no gate thrown open in 60 s: ${A.name} at ${at({ x: A.cx, z: A.cz })}, heading for ${A.dest ? at(A.dest) : 'nowhere'}, after ${A.after?.name || 'nobody'}`);
    return out;
  });
}

// ---- the page as a whole ----

function pageChecks() {
  group = 'Page';
  const failed = [...failedLoads, ...performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400).map(e => `${e.responseStatus} ${e.name.replace(location.origin, '')}`)];
  results.push({ group, name: 'no console errors', status: errors.length ? 'fail' : 'pass', detail: sample(errors, 8) });
  results.push({ group, name: 'every file loaded', status: failed.length ? 'fail' : 'pass', detail: sample([...new Set(failed)], 8) });
  // small windows shrink the panels (style.css): the top bar must still fit without scrolling
  const top = document.getElementById('top'), wide = top && top.offsetParent ? top.scrollWidth - top.clientWidth : 0;
  // a hidden or background tab lays nothing out (the bar or the window measures 0 wide): that can't be measured, so it warns rather than fails
  const blind = top && top.offsetParent && (document.hidden || !top.clientWidth || !innerWidth);
  results.push({ group, name: 'the top bar fits the window', status: blind ? 'warn' : wide > 1 ? 'fail' : 'pass', detail: blind ? ["can't measure: page hidden"] : wide > 1 ? [`${wide}px of it scrolls out of sight at ${innerWidth}×${innerHeight}`] : [] });
  // GENRE_BASICS: a greyed button says why. A choice box that doesn't fails; elsewhere it warns for now.
  const mute = [...document.querySelectorAll('button:disabled')].filter(b => b.offsetParent && !b.title && !b.dataset.why && !b.closest('[title]') && b.textContent.trim())
    .map(b => `${b.closest('[id]')?.id || 'page'}: "${b.textContent.trim().slice(0, 40)}"`);
  const boxed = mute.filter(m => m.startsWith('prompt:'));
  results.push({ group, name: 'greyed buttons say why', status: boxed.length ? 'fail' : mute.length ? 'warn' : 'pass', detail: sample(boxed.length ? boxed : mute, 8) });
}

// ---- the game menu (ui/menu.js) ----

// It opens and shuts again (the game back as it was), and Quit asks only when something would be
// lost: stub hosts stand in for the campaign's save state so each case can be tried.
async function menuChecks() {
  const { menu } = await import('./ui/menu.js');
  group = 'Menu';
  await check('a menu button is on screen', () => {
    const b = document.getElementById('menu-btn');
    if (!b) return ['no #menu-btn'];
    const cs = getComputedStyle(b);
    if (cs.display === 'none' || cs.visibility === 'hidden') return [`it is ${cs.display === 'none' ? 'display: none' : 'hidden'}`];
    // A hidden pane (a 0px window) lays nothing out: the button is there and drawn, the rest can't be measured.
    if (!innerWidth || !innerHeight || document.hidden && !b.getClientRects().length) return { warn: ["can't measure: the window has no size"] };
    const r = b.getBoundingClientRect();
    if (!r.width || r.left < -1 || r.right > innerWidth + 1) return [`it sits at ${Math.round(r.left)}–${Math.round(r.right)} in a ${innerWidth}px window`];
    return r.width < 18 || r.height < 20 ? [`${Math.round(r.width)}×${Math.round(r.height)}px is too small to touch`] : [];
  });
  await check('the menu opens, pauses the game and shuts, leaving it as it was', () => {
    const real = menu.host, was = real.pause?.get(), out = [];
    menu.open();
    const veil = document.getElementById('menu-veil');
    if (!menu.isOpen || !veil?.classList.contains('open') || !document.getElementById('gm-resume')) out.push("it didn't open with Resume in it");
    if (real.pause && real.pause.get() !== true) out.push("it didn't pause the game");
    const quit = document.getElementById('gm-quit');
    if (!quit) out.push('no Quit to main menu');
    if (real.save && !real.save.ironman && !document.getElementById('gm-save')) out.push('no Save');
    if (real.save?.ironman && document.getElementById('gm-save')) out.push('Save shown in ironman');
    menu.close();
    if (menu.isOpen || veil.classList.contains('open')) out.push("it didn't shut");
    if (real.pause && real.pause.get() !== was) out.push(`the game was ${was ? 'paused' : 'running'} and is now ${real.pause.get() ? 'paused' : 'running'}`);
    return out;
  });
  await check('Quit asks only when something would be lost, and says what', () => {
    const real = menu.host, out = [];
    const sv = o => ({ ironman: false, test: false, can: () => ({ ok: true }), run: () => ({ ok: true }), unsaved: () => false, last: () => Date.now() - 180000, fight: () => null, over: () => false, ...o });
    const ask = (what, o, want, find) => {
      menu.use({ ...real, save: sv(o) });
      const p = menu.plan();
      if (want === null ? p !== null : !p || (find && !find.test(p.text))) out.push(`${what}: ${p ? `"${p.text}"` : 'no question'}, wanted ${want === null ? 'none' : find}`);
      return p;
    };
    try {
      menu.use({ ...real, save: undefined });
      if (menu.plan() !== null) out.push('a page with nothing to save asks');
      ask('nothing unsaved', {}, null);
      ask('unsaved progress', { unsaved: () => true }, 1, /Progress since your last save \(3 min ago\) will be lost/);
      ask('never saved', { unsaved: () => true, last: () => null }, 1, /not been saved yet/);
      ask('ironman', { ironman: true, unsaved: () => true }, null);
      ask('the campaign is over', { unsaved: () => true, over: () => true }, null);
      const f = ask('a battle in progress', { fight: () => 'battle', unsaved: () => true, can: () => ({ ok: false, reason: 'Finish the fight first' }) }, 1, /battle in progress will be lost.*Progress since your last save/);
      if (f?.canSave) out.push('a battle offers Save and quit');
      const f2 = ask('a battle with nothing unsaved', { fight: () => 'battle' }, 1, /battle in progress will be lost/);
      if (f2 && /Progress since/.test(f2.text)) out.push('a battle with nothing unsaved also talks of lost progress');
      ask('a battle in ironman', { ironman: true, fight: () => 'battle' }, 1, /battle in progress will be lost/);
      const b = ask('a village fought over', { unsaved: () => true, can: () => ({ ok: false, reason: 'A village is being fought over' }) }, 1, /can't be saved right now: a village is being fought over/);
      if (b?.canSave) out.push("Save and quit is offered when saving isn't possible");
    } finally { menu.use(real); }
    return out;
  });
  await check('a closed tab asks too, when something would be lost', () => {
    const real = menu.host, out = [];
    const sv = o => ({ ironman: false, test: false, can: () => ({ ok: true }), run: () => ({ ok: true }), unsaved: () => false, last: () => null, fight: () => null, over: () => false, ...o });
    try {
      menu.use({ ...real, save: sv({ unsaved: () => true }) });
      if (!menu.warnsOnUnload()) out.push('no warning with unsaved progress');
      menu.use({ ...real, save: sv({}) });
      if (menu.warnsOnUnload()) out.push('a warning with nothing to lose');
      menu.use({ ...real, save: sv({ unsaved: () => true, test: true }) });
      if (menu.warnsOnUnload()) out.push('a warning in a test campaign');
      menu.use({ ...real, save: sv({ ironman: true, unsaved: () => true }) });
      if (menu.warnsOnUnload()) out.push('a warning in ironman');
    } finally { menu.use(real); }
    return out;
  });
  // Walls: the one shared Defences panel is in the page with all its tools whenever a village of yours is on screen
  // (it was lost with the old build bar when a second village was entered, and the Walls tab came up empty).
  const bar = document.getElementById('build');
  if (bar && bar.getClientRects().length && !document.body.classList.contains('readonly')) await check('the Walls tab holds its tools', () => {
    const panels = document.querySelectorAll('#defences'), tools = document.querySelectorAll('#defences [data-tool]').length;
    if (panels.length !== 1) return [`${panels.length} Defences panels in the page`];
    if (tools < 5) return [`${tools} wall tools in it, not 5`];
    return bar.querySelector('[data-tab="Walls"]') ? [] : ['no Walls tab'];
  });
  const sv = window.game?.world && menu.host.save;
  if (sv) await check("the campaign's unsaved state follows the menu's question", async () => {
    const { unsaved } = await import('./world/save.js');
    const want = sv.fight() || (!sv.ironman && !sv.over() && unsaved(window.game.world));
    return !!menu.plan() === !!want ? [] : [`plan() says ${menu.plan() ? 'ask' : 'no question'}, the campaign says ${want ? 'unsaved' : 'clean'}`];
  });
}

// ---- houses sworn to you ----

// A house that has bent the knee lights the map and can be looked round like a knight's village, and the
// Realm screen lists it (world.sworn / overseer, realmscreen houseVassals).
async function houseChecks(w) {
  const { FACTIONS } = await import('./world/world.js');
  const sworn = FACTIONS.filter(h => w.sworn(h.index));
  group = 'Sworn houses';
  await check('a sworn house lights its places and its armies', () => {
    if (!sworn.length) return null;
    const out = [];
    for (const h of sworn) {
      const dark = w.pois.filter(p => p.owner === h.index && !p.visible).map(p => p.name);
      if (dark.length) out.push(`${h.name}: ${dark.length} of its places are in the fog (${dark.slice(0, 3).join(', ')})`);
      const hidden = w.armies.filter(a => a.side === h.index && !a.gone && !a.visible).length;
      if (hidden) out.push(`${h.name}: ${hidden} of its armies are out of sight`);
    }
    return out;
  });
  await check("a sworn house's places can be looked round, and are not yours to run", () => {
    if (!sworn.length) return null;
    const out = [];
    for (const h of sworn) for (const p of w.pois.filter(q => q.owner === h.index && q.eco && !q.town)) if (w.overseer(p)?.index !== h.index) out.push(`${p.name} (${h.name}) can't be looked round`);
    for (const p of w.pois.filter(q => q.owner !== 0 && q.eco && !q.town && !sworn.some(h => h.index === q.owner))) if (w.overseer(p)) out.push(`${p.name} can be looked round though its owner is not sworn to you`);
    return sample(out, 6);
  });
  await check('the Realm screen lists each sworn house with its terms and a way in', async () => {
    if (!sworn.length) return null;
    const { RealmScreen } = await import('./realmscreen.js');
    const html = RealmScreen.prototype.houseVassals.call({ w });
    const out = [];
    for (const h of sworn) {
      if (!html.includes(h.name)) out.push(`${h.name} is not listed`);
      const p = w.pois.find(q => q.owner === h.index && q.eco && !q.town);
      if (p && !html.includes(`data-act="visit:${p.id}"`)) out.push(`no Look round for ${p.name}`);
    }
    if (!/gold a minute/.test(html)) out.push('the terms are not stated');
    return out;
  });
  await check('a village of yours can be given to a sworn house, and to no other', async () => {
    const mine = w.pois.filter(p => p.owner === 0 && p.town && p !== w.home && w.canGrant(p).ok);
    const loose = FACTIONS.find(h => h.index && !h.bandit && !h.invader && !w.sworn(h.index));
    const out = [];
    if (loose && mine[0] && w.canGrantTo(mine[0], loose.index).ok) out.push(`${loose.name} is not sworn, and can be given ${mine[0].name}`);
    if (!sworn.length || !mine.length) return out.length ? out : null;
    const { RealmScreen } = await import('./realmscreen.js');
    const html = RealmScreen.prototype.houseVassals.call({ w });
    for (const h of sworn) {
      if (!w.canGrantTo(mine[0], h.index).ok) out.push(`${h.name} is sworn but cannot be given ${mine[0].name}: ${w.canGrantTo(mine[0], h.index).why}`);
      if (!html.includes(`data-act="hg:${mine[0].id}:${h.index}"`)) out.push(`the Realm screen offers no way to give ${mine[0].name} to ${h.name}`);
    }
    return out;
  });
}

// Saves that cannot be lost (world/saveslots.js): tried on a stand-in browser store, so the real one is untouched.
async function slotChecks(w) {
  const S = await import('./world/saveslots.js');
  group = 'Saves that cannot be lost';
  const fake = (limit = Infinity) => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { const used = [...m].reduce((n, [a, b]) => n + (a === k ? 0 : b.length), 0); if (used + v.length > limit) throw new Error('quota'); m.set(k, v); }, removeItem: k => m.delete(k) }; };
  const save = (id, time, at, o = {}) => JSON.stringify({ version: S.VERSION, id, seed: 1, savedAt: at, world: { time, options: o }, pois: [] });
  const MIN = 60000, T0 = 1e12;
  const times = st => S.listSaves(st).map(s => `${s.key.replace('rts.campaign.', '')}@${s.info.time}`);
  await check('a new campaign puts the old one on the shelf, and a different one after it', () => {
    const st = fake(), out = [];
    S.store(save('a', 100, T0), { storage: st }); S.store(save('b', 5, T0 + MIN), { storage: st });
    if (!st.m.get(S.SHELF[0])?.includes('"id":"a"')) out.push(`campaign a is not on the shelf: ${times(st)}`);
    S.store(save('c', 5, T0 + 2 * MIN), { storage: st });
    if (!st.m.get(S.SHELF[0])?.includes('"id":"b"') || !st.m.get(S.SHELF[1])?.includes('"id":"a"')) out.push(`the shelf does not hold b then a: ${times(st)}`);
    if (!st.m.get(S.KEY).includes('"id":"c"')) out.push('the new campaign is not the current one');
    return out;
  });
  await check('backups: three of them, each at least ten minutes older than the last, current untouched', () => {
    const st = fake(), out = [];
    for (let i = 0; i < 40; i++) S.store(save('a', i * 120, T0 + i * 2 * MIN), { storage: st });   // 80 minutes of saves every 2
    const b = S.BACKUPS.map(k => st.m.get(k)).filter(Boolean).map(r => JSON.parse(r).savedAt);
    if (b.length !== 3) out.push(`${b.length} backups, not 3`);
    for (let i = 1; i < b.length; i++) if (b[i - 1] - b[i] < 10 * MIN) out.push(`backup ${i} and ${i + 1} are only ${(b[i - 1] - b[i]) / MIN} min apart`);
    if (JSON.parse(st.m.get(S.KEY)).savedAt !== T0 + 39 * 2 * MIN) out.push('the current save is not the latest');
    if (st.m.has(S.SHELF[0])) out.push('the same campaign went on the shelf');
    return out;
  });
  await check('a damaged save is shelved, never written over', () => {
    const st = fake(); st.setItem(S.KEY, '{broken'); S.store(save('a', 1, T0), { storage: st });
    return st.m.get(S.SHELF[0]) === '{broken' ? [] : ['the damaged data is gone'];
  });
  await check('ironman keeps no copies of itself', () => {
    const st = fake(); for (let i = 0; i < 12; i++) S.store(save('i', i, T0 + i * 11 * MIN, { ironman: true }), { storage: st });
    return S.BACKUPS.some(k => st.m.has(k)) ? ['an ironman campaign has backups'] : [];
  });
  await check('restoring and importing keep what they replace, even an older save of the same campaign', () => {
    const st = fake(), out = [];
    S.store(save('a', 600, T0 + 20 * MIN), { storage: st });
    S.store(save('a', 700, T0 + 22 * MIN), { storage: st }); S.store(save('a', 800, T0 + 40 * MIN), { storage: st });
    const older = st.m.get(S.BACKUPS[0]);
    const r = S.restore(S.BACKUPS[0], st);
    if (!r.ok) out.push(`restore failed: ${r.reason}`);
    if (JSON.parse(st.m.get(S.KEY)).world.time !== JSON.parse(older).world.time) out.push('the restored save is not current');
    if (!S.listSaves(st).some(s => s.key !== S.KEY && s.info.time === 800)) out.push('the save it replaced (800) is nowhere');
    const imp = S.importText(save('z', 9, T0 + 50 * MIN), st);
    if (!imp.ok) out.push(`import failed: ${imp.reason}`);
    if (!S.listSaves(st).some(s => s.key !== S.KEY && s.info.id === 'a')) out.push('importing lost the campaign it replaced');
    return out;
  });
  await check('a full browser lets go of the oldest copies and keeps the current save', () => {
    const one = save('a', 1, T0).length, st = fake(one * 3 + 10), out = [];
    for (let i = 0; i < 6; i++) S.store(save('a', i, T0 + i * 11 * MIN), { storage: st });
    if (JSON.parse(st.m.get(S.KEY) || '{}').world?.time !== 5) out.push('the newest save was not kept');
    return out;
  });
  await check('a file that is not a save, a newer save and a test campaign are refused', () => {
    const st = fake(), out = [];
    for (const [what, text] of [['junk', 'hello'], ['a different JSON', '{"a":1}'], ['too big', 'x'.repeat(S.MAX_IMPORT + 1)], ['newer', save('n', 1, T0).replace('"version":1', '"version":99')], ['a test campaign', save('t', 1, T0, { test: true })]])
      if (S.importText(text, st).ok) out.push(`${what} was accepted`);
    if (st.m.size) out.push('a refused file left something in the store');
    return out;
  });
  await check('a save from an earlier build still loads (tools/fixtures/save-v1.json)', async () => {
    const text = await fetch(new URL('../tools/fixtures/save-v1.json', import.meta.url)).then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))).catch(e => ({ err: e.message }));
    if (text.err) return { warn: [`fixture not fetched (${text.err})`] };
    const i = S.inspect(text);
    if (i.status !== 'ok' && i.status !== 'old') return [`the fixture reads as ${i.status}: ${i.reason}`];
    const data = S.migrate(JSON.parse(text));
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    const map = document.querySelector('script[type="importmap"]')?.outerHTML || '';
    frame.srcdoc = `<!doctype html><base href="${location.href}">${map}`;
    document.body.appendChild(frame);
    try {
      await new Promise(r => { frame.onload = r; });
      const url = new URL('world/save.js', import.meta.url).href;
      const SV = await frame.contentWindow.eval(`import(${JSON.stringify(url)})`);
      const hooks = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => null) });
      const w2 = SV.loadGame(frame.contentWindow.JSON.parse(JSON.stringify(data)), hooks);
      return w2.pois.length === data.pois.length ? [] : [`${w2.pois.length} places after loading, ${data.pois.length} in the file`];
    } catch (e) { return [`it would not load: ${e.message}`]; } finally { frame.remove(); }
  });
  await check('the save in this browser can be opened', () => {
    if (w.options?.test) return null;
    let raw = null; try { raw = localStorage.getItem(S.KEY); } catch { return null; }
    if (!raw) return null;
    const i = S.inspect(raw);
    return i.status === 'ok' || i.status === 'old' ? [] : [`the current save reads as ${i.status}: ${i.reason}`];
  });
}

// The interface's chimes stay few (the creator, 2026-11-24: "max 5", after some 30 of the same chime
// in a row): news and new things sound at most five times in any minute, and an introduction that
// hides and shows again chimes only the first time.
async function chimeChecks() {
  group = 'Sound';
  await check('chimes: at most five in any minute, then one again once the oldest is a minute old', async () => {
    const { chimeRoom } = await import('./audio.js'), times = [], out = [];
    const rang = [];
    for (let i = 0; i < 30; i++) rang.push(chimeRoom(times, 100 + i * 1.2));   // 30 lines of news, 1.2 s apart
    const n = rang.filter(Boolean).length;
    if (n !== 5) out.push(`${n} of 30 chimes in 36 s sounded, not 5`);
    if (!chimeRoom(times, 161)) out.push('no chime a minute after the first');
    return out;
  });
  await check('chimes: a new thing\'s introduction chimes once, however often it hides and shows', async () => {
    const src = (await (await fetch(new URL('./ui/news.js', import.meta.url))).text());
    return /if \(!chimed\.has\(key\)\) \{ chimed\.add\(key\); dispatchEvent\(new Event\('ui-unlock'\)\)/.test(src) ? [] : ['news.js raises ui-unlock every time the line shows again'];
  });
}

// When something breaks, the player is told and can pass it on (ui/oops.js); the menu has a Controls screen and a build stamp.
async function oopsChecks() {
  const { menu } = await import('./ui/menu.js');
  const { BUILD } = await import('./version.js');
  group = 'Errors, support and controls';
  await check('an error report names the build, the page, the campaign and the errors', () => {
    const o = window.oops;
    if (!o) return ['ui/oops.js is not loaded on this page'];
    const text = o.details();
    const out = [];
    for (const want of ['Build:', 'Page:', 'Browser:', 'Campaign:', 'Last save:', 'Errors']) if (!text.includes(want)) out.push(`the report has no "${want}" line`);
    if (!text.includes(BUILD.sha)) out.push('the build stamp is not in it');
    return out;
  });
  await check('a failure puts up a banner with Copy, Reload and Dismiss, and Dismiss takes it away', () => {
    const o = window.oops;
    if (!o) return null;
    const before = o.errors.length;
    o.show('checks(): a made-up error to see the banner');
    const b = document.getElementById('oops'), out = [];
    if (!b) return ['no banner after an error'];
    for (const word of ['Copy details', 'Reload', 'Dismiss']) if (!b.textContent.includes(word)) out.push(`the banner lacks "${word}"`);
    [...b.querySelectorAll('button')].find(x => /Dismiss/.test(x.textContent))?.click();
    o.errors.length = before;
    if (document.getElementById('oops')) out.push('Dismiss did not remove it');
    return out;
  });
  await check('this browser meets what the game needs (modules, import maps, WebGL 2)', () => (window.oops?.supportProblem().map(l => `missing: ${l}`) || null));
  await check('the menu has Controls (listing this page\'s keys) and the build stamp', () => {
    const out = [];
    const wasOpen = menu.isOpen;
    menu.open();
    const card = document.getElementById('gamemenu');
    if (!/build /i.test(card.textContent)) out.push('no build line in the menu');
    const c = document.getElementById('gm-controls');
    if (!c) out.push('no Controls button');
    else {
      c.click();
      const t = document.getElementById('gamemenu').textContent;
      for (const want of ['Space', 'Esc']) if (!t.includes(want)) out.push(`Controls does not mention ${want}`);
      document.getElementById('gm-back')?.click();
      if (menu.view !== 'main') out.push('Back does not return to the menu');
    }
    if (!wasOpen) menu.close();
    return out;
  });
  await check('the sound panel is called Sound and picture, and has a Picture row', () => {
    const t = document.getElementById('sound-toggle');
    if (!t) return null;
    const out = [];
    if (!/picture/i.test(t.title)) out.push(`the button says "${t.title}"`);
    if (!document.getElementById('picture') && !window.game) return out;   // (the row is added a moment after load)
    return out;
  });
}

// The first hour: what a new player is shown (campaign.js goalNudge, marchButtons; the Start here card).
async function firstHourChecks(w) {
  const g = window.game;
  group = 'First hour';
  await check('a place you have seen has a March button for your nearest army, one you have not seen has none', () => {
    if (!g?.marchButtons || g.mode !== 'world') return null;
    const mine = w.armies.some(a => a.side === 0 && !a.gone && !a.wagon && a.units);
    const out = [];
    const seen = w.pois.find(p => p.seen && p.owner !== 0), unseen = w.pois.find(p => !p.seen);
    if (unseen && g.marchButtons(unseen)) out.push(`${unseen.name} was never seen but offers a March button`);
    if (seen && mine && !/data-act="march:/.test(g.marchButtons(seen))) out.push(`${seen.name} offers no March button though you have an army`);
    if (seen && !mine && g.marchButtons(seen)) out.push('a March button with no army to send');
    return out.length || seen || unseen ? out : null;
  });
  await check('on the first goals, something on screen glows', async () => {
    if (g?.mode !== 'world' || w.goals > 1 || w.part === 2 || !w.home?.town) return null;
    await new Promise(r => setTimeout(r, 300));
    return document.querySelector('.goal-pulse') ? [] : ['the next step (go to Ashford, then build) shows no glow'];
  });
  await check('the Start here card is shut once you have played, and the help can always be opened', () => {
    const card = document.getElementById('starthere');
    if (!card) return null;
    const out = [];
    let started = null; try { started = localStorage.getItem('rts.started'); } catch { return null; }
    if (card.classList.contains('open') && started && !w.options?.test) out.push('the Start here card is open in a browser that has already started a campaign');
    if (!document.getElementById('help-toggle')) out.push('no How to play button');
    return out;
  });
}

// The season in the top bar, and a herald at each turn of it (ui/seasonring.js, world.js seasonStep).
async function seasonChecks(w) {
  const { seasonOf, leftText, updateSeasonRing } = await import('./ui/seasonring.js');
  const { World, SEASON_NEWS } = await import('./world/world.js');
  group = 'Seasons';
  await check('the seasons turn every five minutes: spring, summer, autumn, winter, spring', () => {
    const out = [], at = (t, name, left) => { const s = seasonOf(t); if (s.name !== name) out.push(`at ${t}s it is ${s.name}, not ${name}`); if (left !== undefined && Math.round(s.left) !== left) out.push(`at ${t}s ${Math.round(s.left)}s are left, not ${left}`); };
    at(0, 'Spring', 300); at(299, 'Spring', 1); at(300, 'Summer', 300); at(599, 'Summer'); at(600, 'Autumn'); at(899, 'Autumn'); at(900, 'Winter'); at(1199, 'Winter'); at(1200, 'Spring'); at(1500, 'Summer');
    if (!/^2 min left, then autumn$/.test(leftText(seasonOf(600 - 120)))) out.push(`hover text reads "${leftText(seasonOf(480))}"`);
    if (!/^under a minute left/.test(leftText(seasonOf(580)))) out.push('the last minute is not "under a minute left"');
    return out;
  });
  await check('the clock has a season ring that names the season and the time left', () => {
    const g = window.game;
    if (!g || g.mode !== 'world') return null;
    // (Frames draw the ring; a hidden pane has none, so draw it as a frame would, for the world's time now.)
    const clock = document.getElementById('clock'), out = [];
    if (!clock) return ['no clock'];
    updateSeasonRing(clock, w.time);
    const el = document.getElementById('seasonring');
    if (!el) return ['no season ring beside the clock'];
    const name = ['Spring', 'Summer', 'Autumn', 'Winter'][w.season];
    if (!el.title.startsWith(`${name}:`) || !/left/.test(el.title)) out.push(`the ring says "${el.title}" in ${name}`);
    if (el.querySelectorAll('[data-q]').length !== 4) out.push('the ring is not four quarters');
    return out;
  });
  await check('a herald marks the turn into spring, summer and autumn, and winter, once each, never at the start of a game or a load', () => {
    const told = [], fake = (part = 1) => ({ time: 0, part, hooks: { herald: m => told.push(m) }, get season() { return Math.floor((this.time % 1200) / 300); }, seasonStep: World.prototype.seasonStep });
    const out = [], step = (f, t) => { f.time = t; f.seasonStep(); };
    const f = fake();
    step(f, 10); if (told.length) out.push('announced a season at the start');
    step(f, 20); step(f, 299); if (told.length) out.push('announced within a season');
    step(f, 300); if (told.at(-1)?.title !== 'Summer') out.push('no Summer herald at 300 s');
    step(f, 310); step(f, 599); if (told.length !== 1) out.push('Summer announced more than once');
    step(f, 600); step(f, 900); step(f, 1200);
    if (told.map(m => m.title).join() !== 'Summer,Autumn,Winter,Spring') out.push(`the turns were announced as ${told.map(m => m.title).join()}`);
    const plan = { Spring: 'The fields are sown. The roads dry.', Summer: 'Long days in the fields. The crops are coming on.', Autumn: 'Harvest. The barns fill; lay in stores for winter.' };
    for (const [title, text] of Object.entries(plan)) if (SEASON_NEWS.find(n => n[0] === title)?.[1] !== text) out.push(`${title}'s line is not the agreed one`);
    const g = fake(2); step(g, 10); step(g, 900); if (told.filter(m => m.title === 'Winter').length !== 1) out.push('in Part 2 winter is announced here as well as by the north');
    return out;
  });
}

// A place you have seen but do not hold is described in words from what you saw, never from what is there now
// (world/scout.js).
async function scoutChecks(w) {
  const { scoutReport, ageText, heldWords, STALE } = await import('./world/scout.js');
  group = 'Scout reports';
  const seen = w.pois.filter(p => p.seen && p.owner !== 0 && !p.town && p.kind !== 'camp');
  await check('a place you have not seen has no report, and neither has one you hold', () => {
    const out = [];
    for (const p of w.pois) {
      const r = scoutReport(w, p);
      if (!p.seen && r) out.push(`${p.name} was never seen but has a report`);
      if (p.owner === 0 && r) out.push(`${p.name} is yours but has a report`);
    }
    return out;
  });
  await check('a place out of sight is described from the sighting, not from what is there now', () => {
    const dark = seen.filter(p => !p.visible && p.known);
    if (!dark.length) return null;
    const out = [];
    for (const p of dark) {
      const r = scoutReport(w, p);
      if (!r) { out.push(`${p.name}: no report though you saw it`); continue; }
      if (r.men !== p.known.men) out.push(`${p.name}: says ${r.men} men, the sighting said ${p.known.men}`);
      if (!r.held.includes(`about ${p.known.men} men`)) out.push(`${p.name}: "${r.held}" does not give the seen count`);
    }
    return sample(out, 5);
  });
  await check('the places named beside it are places you have seen', () => {
    const out = [];
    for (const p of seen) {
      const r = scoutReport(w, p);
      if (!r) continue;
      for (const q of w.pois) if (q !== p && !q.seen && r.near.includes(q.name)) out.push(`${p.name} names ${q.name}, which you have never seen`);
    }
    return sample(out, 5);
  });
  await check('what you saw long ago says so, and is worded as past', () => {
    const p = seen.find(q => q.known);
    if (!p) return null;
    const vis = p.visible, at = p.known.at;
    const out = [];
    try {
      p.visible = false; p.known.at = w.time - 7 * 60;
      const r = scoutReport(w, p);
      if (!r.stale) out.push('seven minutes on is not stale');
      if (!/seen 7 min ago/.test(r.held)) out.push(`no age in "${r.held}"`);
      if (!/^Was /.test(r.held) || !/may have changed/.test(r.held)) out.push(`not worded as past: "${r.held}"`);
      p.known.at = w.time - 20;
      const f = scoutReport(w, p);
      if (f.stale) out.push('twenty seconds on is stale');
      p.visible = true;
      if (!/in sight now/.test(scoutReport(w, p).held)) out.push('a place in sight does not say so');
    } finally { p.visible = vis; if (at === undefined) delete p.known.at; else p.known.at = at; }
    return out;
  });
  await check('no place label says undefined, NaN or null', () => {
    const bad = [...document.querySelectorAll('.wlabel.place')].map(e => e.textContent).filter(t => /undefined|NaN|\bnull\b/.test(t));
    return sample(bad, 4);
  });
  await check('the words climb with the garrison', () => {
    const order = [0, 5, 20, 45, 80, 150].map(heldWords);
    return new Set(order).size === order.length ? [] : [`not six different words for six sizes: ${order.join(' / ')}`];
  });
}

// What a tribute demand and the Houses table say about a house's strength, and ceremonies at normal speed.
async function wordsChecks(w) {
  const { strengthWords } = await import('./world/diplomacy.js');
  const { FACTIONS } = await import('./world/world.js');
  group = 'Strength words and ceremonies';
  await check("a house's strength is told in words, from the same sums as the demand test", () => {
    const want = [[0.3, 'far weaker'], [0.6, 'weaker than you'], [1, 'about your match'], [1.5, 'a little stronger'], [2, 'stronger than you'], [4, 'far stronger'], [9, 'badly outmatched']];
    const out = [];
    for (const [r, word] of want) {
      const got = strengthWords({ strength: i => (i === 0 ? 100 : r * 100) }, 1);
      if (!got.includes(word)) out.push(`at ${r}× your strength it says "${got}", not "${word}"`);
    }
    return out;
  });
  await check('the Houses tab puts the same words beside each strength', async () => {
    const known = FACTIONS.slice(1, w.bandits).filter(h => h.alive && w.knows(h.index));
    if (!known.length) return null;
    const { RealmScreen } = await import('./realmscreen.js');
    const html = RealmScreen.prototype.tab_houses.call({ w });
    return known.filter(h => !html.includes(strengthWords(w, h.index))).map(h => `${h.name}: no "${strengthWords(w, h.index)}"`);
  });
  await check('a ceremony plays at normal speed, and the speed you chose comes back', async () => {
    const g = window.game, four = document.querySelector('[data-speed="4"]');
    if (!g?.ceremony || !four || g.mode !== 'world') return null;
    const was = document.querySelector('[data-speed].on'), wasPaused = document.body.classList.contains('paused');
    four.click();
    // A ceremony already under way (a rank-up just after load) holds 1× for up to 8 s: step it out by hand; if the
    // speed is still not back after ten seconds of frames, that is the bug itself (a ceremony that never ends).
    for (let i = 0; i < 100 && g.pace() !== 4; i++) g.ceremonyStep(0.1);
    if (g.pace() !== 4) { (was || document.querySelector('[data-speed="1"]')).click(); if (wasPaused) document.getElementById('pause')?.click(); return [`speed 4 is still running at ${g.pace()}× ten seconds on: a ceremony that never lets go of the speed`]; }
    const out = [];
    if (g.pace() !== 4) out.push(`speed 4 runs at ${g.pace()}`);
    g.ceremony(150);
    if (g.pace() !== 1) out.push(`a ceremony runs at ${g.pace()}×, not 1×`);
    // Frames drain a ceremony (a slow or hidden tab draws few), so step the frame clock by hand: the rule is
    // under test, not the frame rate. Ten seconds of 0.1 s frames is more than any ceremony.
    for (let i = 0; i < 100 && g.pace() === 1; i++) g.ceremonyStep(0.1);
    if (g.pace() !== 4) out.push(`after the ceremony the speed is ${g.pace()}, not the 4 you chose`);
    (was || document.querySelector('[data-speed="1"]')).click();
    if (wasPaused) document.getElementById('pause')?.click();
    return out;
  });
}

// ---- running them ----

export async function checks({ quick = false, quiet = false } = {}) {
  results.length = 0;
  const t0 = performance.now();
  pageChecks();
  await menuChecks();
  await oopsChecks();
  await chimeChecks();
  if (!window.game && !window.muster) results.push({ group: 'Page', name: 'game loaded', status: 'fail', detail: ['no window.game: the page has not finished loading, or failed to'] });
  for (const s of scenes()) { group = s.label[0].toUpperCase() + s.label.slice(1); await battleChecks(s); }
  if (window.game?.world) await worldChecks(window.game.world);
  if (window.game?.world?.sworn) await houseChecks(window.game.world);
  if (window.game?.world?.sworn) await wordsChecks(window.game.world);
  if (window.game?.world?.pois) await scoutChecks(window.game.world);
  if (window.game?.world?.pois) await seasonChecks(window.game.world);
  if (window.game?.world?.pois) await firstHourChecks(window.game.world);
  if (window.game?.world?.pois && !quick) await slotChecks(window.game.world);
  if (page === 'battle.html') await orderChecks();
  if (!quick) {
    await assetChecks();
    if (window.game?.world) await saveChecks(window.game.world);
  }
  const n = s => results.filter(r => r.status === s).length;
  const summary = { page, pass: n('pass'), fail: n('fail'), warn: n('warn'), skip: n('skip'), ms: Math.round(performance.now() - t0), results: results.slice() };
  if (!quiet) print(summary);
  return summary;
}

const MARK = { pass: '✅', fail: '❌', warn: '⚠️', skip: '·' };
function print(s) {
  const head = `checks() on ${s.page}: ${s.fail ? `${s.fail} failed` : 'all passed'}${s.warn ? `, ${s.warn} to look at` : ''} (${s.pass} passed${s.skip ? `, ${s.skip} not run` : ''}, ${s.ms} ms)`;
  console.log(`%c${head}`, `font-weight:bold;color:${s.fail ? '#c0392b' : s.warn ? '#b9770e' : '#1e8449'}`);
  let last = null;
  for (const r of s.results) {
    if (r.group !== last) { console.log(`%c${r.group}`, 'font-weight:bold'); last = r.group; }
    const line = `  ${MARK[r.status]} ${r.name}`;
    if (r.detail.length && r.status !== 'pass') { console.groupCollapsed(line); for (const d of r.detail) console.log(d); console.groupEnd(); }
    else console.log(line);
  }
}

window.checks = checks;
checks.diffSaves = diffSaves;   // for testing the save check itself
checks.sample = sampleStuck;     // when stepping game time from the console, call this every few game seconds so the sticking check sees it
