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
function saysWalled(p) {
  // your own villages are walled by what you build
  if (p.town && p.owner === 0 && !p.town.hostile) return wallsOf(p.town.battle, 0) > 0;
  return walledPlace(p);
}
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
    if (b.men && b.made > a.made + 1e-6) out.push(`${p.name} made more with ${b.men} men under arms (${b.made.toFixed(1)} against ${a.made.toFixed(1)})`);
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
  const FOOT = ['Idle', 'Stand', 'Walk', 'Run', 'RunArmed', 'WalkArmed', 'March_Upright', 'Death', 'Death_Fwd', 'Hit', 'Hit_2', 'Step_Back', 'Step_Left', 'Step_Right', 'Step_BackArmed', 'Step_LeftArmed', 'Step_RightArmed', 'Turn', 'TurnArmed', 'Sword_Slash', 'Spear_Thrust', 'Spear_Brace', 'Rout', 'Cheer', 'Shield_Wall'];
  const RIDE = ['Ride_Idle', 'Ride_Trot', 'Ride_Gallop', 'Ride_Charge', 'Ride_Couch', 'Ride_Fall'], HORSE = ['Idle', 'Death', ...HORSE_GAITS], WORK = ['Walk', 'Run', 'CarryWalk', 'CarryRun', 'Chop', 'Hoe', 'Hammer', 'Saw', 'Pickaxe', 'Work', 'Idle'];
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
    const b = document.getElementById('menu-btn'), r = b?.getBoundingClientRect();
    if (!b) return ['no #menu-btn'];
    if (!b.offsetParent && getComputedStyle(b).position !== 'fixed') return ["it isn't drawn"];
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
  const sv = window.game?.world && menu.host.save;
  if (sv) await check("the campaign's unsaved state follows the menu's question", async () => {
    const { unsaved } = await import('./world/save.js');
    const want = sv.fight() || (!sv.ironman && !sv.over() && unsaved(window.game.world));
    return !!menu.plan() === !!want ? [] : [`plan() says ${menu.plan() ? 'ask' : 'no question'}, the campaign says ${want ? 'unsaved' : 'clean'}`];
  });
}

// ---- running them ----

export async function checks({ quick = false, quiet = false } = {}) {
  results.length = 0;
  const t0 = performance.now();
  pageChecks();
  await menuChecks();
  if (!window.game && !window.muster) results.push({ group: 'Page', name: 'game loaded', status: 'fail', detail: ['no window.game: the page has not finished loading, or failed to'] });
  for (const s of scenes()) { group = s.label[0].toUpperCase() + s.label.slice(1); await battleChecks(s); }
  if (window.game?.world) await worldChecks(window.game.world);
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
