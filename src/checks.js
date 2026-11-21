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

  await check(`${label}: nobody lost off the map`, () => {
    const out = [];
    for (const s of battle.soldiers) if (live(s) && (bad(s.x) || bad(s.z) || bad(s.y) || bad(s.hp))) out.push(`${s.reg.name}: a soldier at (${s.x}, ${s.z}) with ${s.hp} hp`);
    for (const r of regs) if (bad(r.cx) || bad(r.cz)) out.push(`${r.name}: centre at (${r.cx}, ${r.cz})`);
    for (const v of town?.villagers || []) if (bad(v.x) || bad(v.z)) out.push(`villager ${v.id} (${v.state}) at (${v.x}, ${v.z})`);
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

  // The militia can only be called out while the village is attacked (townhud.js).
  if (town && town === shownTown()) await check(`${label}: no Muster or Stand down at peace`, () => {
    if (town.underAttack) return null;
    const shown = [...document.querySelectorAll('#stock [data-act="muster"], #stock [data-act="standdown"]')].filter(el => el.offsetParent !== null);
    return shown.map(el => `the "${el.firstChild?.textContent.trim()}" button shows with no attack on`);
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
    const copy = { ...p, eco: { ...p.eco, buildings: { ...p.eco.buildings, 'no such building': 1 } } };
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

  // Event pictures: every event listed as painted has its picture (world/events.js PAINTED).
  const { PAINTED } = await import('./world/events.js');
  push(`event pictures (${PAINTED.size} painted)`, (await missing([...PAINTED].map(id => `assets/art/events/${id}.png`))).map(f => `missing ${f}`));

  // Clips: the animated soldiers and villagers stand in their bind pose without assets/anim.bin, and play a wrong
  // clip if their skeleton lacks one the views ask for (view.js soldierClip, townview.js villagerClip). A gait whose
  // stride can't be measured (anim.js gaitSpeed) can't keep pace with the ground: its feet would slide.
  const { animReady, clipOf, gaitSpeed, gaitFor, rigOffset, PACE, walkSpeed } = await import('./anim.js');
  const { ROAD } = await import('./economy.js');
  const { footGaits } = await import('./view.js');
  const FOOT = ['Idle', 'Stand', 'Walk', 'Run', 'RunArmed', 'WalkArmed', 'March_Upright', 'Death', 'Sword_Slash', 'Spear_Thrust', 'Spear_Brace', 'Rout', 'Cheer', 'Shield_Wall'];
  const RIDE = ['Ride_Idle', 'Ride_Trot', 'Ride_Gallop', 'Ride_Charge', 'Ride_Couch'], HORSE = ['Idle', 'Trot', 'Gallop'], WORK = ['Walk', 'Run', 'CarryWalk', 'CarryRun', 'Chop', 'Mine', 'Hoe', 'Idle'];
  const DOG = ['Idle', 'Walk', 'Trot', 'Run', 'Rout', 'Bite', 'Death'];
  const GAITS = ['Walk', 'Trot', 'Run', 'WalkArmed', 'RunArmed', 'March_Upright', 'Rout', 'CarryWalk', 'CarryRun'], HORSE_GAITS = ['Trot', 'Gallop'];
  const noClip = new Set();
  if (!animReady()) noClip.add('assets/anim.json or anim.bin did not load: animated soldiers are left out');
  else for (const key of [...Object.keys(TYPES), 'villager', 'captain', 'lord', 'lady']) {
    const a = unitModel(key)?.anim;
    if (!a) continue;
    for (const n of key === 'villager' ? WORK : a.horse ? RIDE : a.rig === 'dog' ? DOG : FOOT) if (!clipOf(a.rig, n)) noClip.add(`${key}: no '${n}' clip for the ${a.rig} skeleton`);
    if (a.horse) for (const n of HORSE) if (!clipOf('horse', n)) noClip.add(`no horse '${n}' clip`);
    for (const n of a.horse ? HORSE_GAITS : GAITS) {
      const rig = a.horse ? 'horse' : a.rig;
      if (clipOf(rig, n) && !(gaitSpeed(rig, n) > 0)) noClip.add(`can't measure the ${rig} '${n}' stride: it plays at its own pace and its feet slide`);
    }
    // every pace a figure moves at has a gait that keeps up (pace.js): a man or dog on foot from a shuffle to a little
    // past his top speed; a horse from its walk to a little past its run (not the charge's last burst); a villager
    // from a stroll to running for shelter along a road, carrying or not
    const T = TYPES[key];
    const paces = (rig, gaits, lo, hi) => {
      const slide = [];
      for (let v = lo; v <= hi; v += 0.05) {
        const g = gaitFor(rig, gaits, v), feet = gaitSpeed(rig, g.name) * g.rate / v;
        if (Math.abs(feet - 1) > 0.05) slide.push(v);
      }
      if (slide.length) noClip.add(`${key}: from ${slide[0].toFixed(1)} to ${slide.at(-1).toFixed(1)} m/s no ${rig} gait keeps pace, so the feet slide`);
    };
    if (T && !a.horse) paces(a.rig, footGaits(a), 0.8, T.speed * 1.25);
    if (T && a.horse) paces('horse', HORSE_GAITS, walkSpeed(T), T.speed * 1.2);
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
  return out;
}

// ---- the page as a whole ----

function pageChecks() {
  group = 'Page';
  const failed = [...failedLoads, ...performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400).map(e => `${e.responseStatus} ${e.name.replace(location.origin, '')}`)];
  results.push({ group, name: 'no console errors', status: errors.length ? 'fail' : 'pass', detail: sample(errors, 8) });
  results.push({ group, name: 'every file loaded', status: failed.length ? 'fail' : 'pass', detail: sample([...new Set(failed)], 8) });
  // small windows shrink the panels (style.css): the top bar must still fit without scrolling
  const top = document.getElementById('top'), wide = top && top.offsetParent ? top.scrollWidth - top.clientWidth : 0;
  results.push({ group, name: 'the top bar fits the window', status: wide > 1 ? 'fail' : 'pass', detail: wide > 1 ? [`${wide}px of it scrolls out of sight at ${innerWidth}×${innerHeight}`] : [] });
  // GENRE_BASICS: a greyed button says why. A choice box that doesn't fails; elsewhere it warns for now.
  const mute = [...document.querySelectorAll('button:disabled')].filter(b => b.offsetParent && !b.title && !b.dataset.why && !b.closest('[title]') && b.textContent.trim())
    .map(b => `${b.closest('[id]')?.id || 'page'}: "${b.textContent.trim().slice(0, 40)}"`);
  const boxed = mute.filter(m => m.startsWith('prompt:'));
  results.push({ group, name: 'greyed buttons say why', status: boxed.length ? 'fail' : mute.length ? 'warn' : 'pass', detail: sample(boxed.length ? boxed : mute, 8) });
}

// ---- running them ----

export async function checks({ quick = false, quiet = false } = {}) {
  results.length = 0;
  const t0 = performance.now();
  pageChecks();
  if (!window.game && !window.muster) results.push({ group: 'Page', name: 'game loaded', status: 'fail', detail: ['no window.game: the page has not finished loading, or failed to'] });
  for (const s of scenes()) { group = s.label[0].toUpperCase() + s.label.slice(1); await battleChecks(s); }
  if (window.game?.world) await worldChecks(window.game.world);
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
