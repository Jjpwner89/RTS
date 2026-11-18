// One point of interest as a living town: buildings placed anywhere, villagers who
// build and work them, short production chains, levies raised from the villagers
// themselves, and bandit raids. Fighting is left to battle.js.

export const GOODS = {
  wood: { name: 'Wood', icon: '🪵' },
  stone: { name: 'Stone', icon: '🪨' },
  food: { name: 'Food', icon: '🍖' },
  flax: { name: 'Flax', icon: '🌿' },
  feathers: { name: 'Feathers', icon: '🪶' },
  ore: { name: 'Iron ore', icon: '⛏️' },
  planks: { name: 'Planks', icon: '🪚' },
  string: { name: 'String', icon: '🧵' },
  iron: { name: 'Iron', icon: '🔩' },
  shields: { name: 'Shields', icon: '🛡️' },
  bows: { name: 'Bows', icon: '🏹' },
  arrows: { name: 'Arrows', icon: '➶' },
  spears: { name: 'Spears', icon: '🔱' },
  swords: { name: 'Swords', icon: '🗡️' },
};
export const GOOD_GROUPS = [
  ['Raw', ['wood', 'stone', 'food', 'flax', 'feathers', 'ore']],
  ['Made', ['planks', 'string', 'iron']],
  ['Arms', ['shields', 'bows', 'arrows', 'spears', 'swords']],
];

// gather: villagers walk out to a resource and carry it back.
// recipes: villagers work at the building, turning stock into stock. Earlier recipes
// come first; `keep` stops a recipe once that much of its output is stored.
// Crafting never dips into this much building material, so construction can go on.
const RESERVE = { wood: 20, planks: 20 };
export const BUILDINGS = {
  house: { name: 'House', icon: '🏠', group: 'Homes', cost: { wood: 12 }, radius: 3.5, build: 10, housing: 6, hp: 120,
    desc: 'Room for 6 more villagers.' },
  woodcutter: { name: 'Woodcutter', icon: '🪓', group: 'Gather', cost: { wood: 10 }, radius: 3.5, build: 10, jobs: 3, hp: 120,
    gather: { node: 'tree', range: 40, need: 6, time: 5, out: { wood: 3 } }, desc: 'Fells trees for wood. Build it beside a wood.' },
  quarry: { name: 'Quarry', icon: '⚒️', group: 'Gather', cost: { wood: 12 }, radius: 3.5, build: 12, jobs: 2, hp: 120,
    gather: { node: 'rock', range: 35, need: 1, time: 8, out: { stone: 2 } }, desc: 'Cuts stone from a grey outcrop. Build it close to one.' },
  mine: { name: 'Mine', icon: '⛏️', group: 'Gather', cost: { wood: 15, stone: 5 }, radius: 3.5, build: 15, jobs: 2, hp: 150,
    gather: { node: 'ore', range: 30, need: 1, time: 9, out: { ore: 2 } }, desc: 'Digs iron ore from a rust-red deposit. Build it close to one.' },
  hunter: { name: "Hunter's lodge", icon: '🦌', group: 'Gather', cost: { wood: 10 }, radius: 3.5, build: 10, jobs: 2, hp: 120,
    gather: { node: 'tree', range: 55, need: 8, time: 10, out: { food: 3, feathers: 2 } }, desc: 'Hunts in the woods for food and feathers.' },
  farm: { name: 'Farm', icon: '🌾', group: 'Gather', cost: { wood: 12 }, radius: 9, build: 12, jobs: 2, hp: 100,
    gather: { node: 'field', time: 7, out: { food: 4 } }, desc: 'Grows grain on its own field. Needs open ground.' },
  flax: { name: 'Flax field', icon: '🌿', group: 'Gather', cost: { wood: 10 }, radius: 9, build: 10, jobs: 1, hp: 100,
    gather: { node: 'field', time: 8, out: { flax: 2 } }, desc: 'Grows flax for bowstring.' },
  carpenter: { name: 'Carpenter', icon: '🪚', group: 'Craft', cost: { wood: 15 }, radius: 3.5, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { wood: 2 }, out: { planks: 3 }, time: 7, keep: 40 }, { in: { planks: 3 }, out: { shields: 1 }, time: 9, keep: 20 }],
    desc: 'Saws wood into planks, and planks into shields.' },
  ropemaker: { name: 'Ropemaker', icon: '🧵', group: 'Craft', cost: { wood: 15 }, radius: 4, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { flax: 2 }, out: { string: 1 }, time: 7, keep: 20 }], desc: 'Twists flax into bowstring.' },
  smelter: { name: 'Smelter', icon: '🔥', group: 'Craft', cost: { wood: 10, stone: 15 }, radius: 3.5, build: 15, jobs: 1, hp: 150,
    recipes: [{ in: { ore: 2, wood: 1 }, out: { iron: 1 }, time: 9, keep: 20 }], desc: 'Smelts ore into iron, burning wood.' },
  bowyer: { name: 'Bowyer', icon: '🏹', group: 'Craft', cost: { planks: 10, stone: 5 }, radius: 3.5, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { planks: 2, string: 1 }, out: { bows: 1 }, time: 10, keep: 20 }, { in: { planks: 1, feathers: 2 }, out: { arrows: 10 }, time: 8, keep: 100 }],
    desc: 'Makes bows from planks and string, and arrows from planks and feathers.' },
  weaponsmith: { name: 'Weaponsmith', icon: '⚔️', group: 'Craft', cost: { planks: 10, stone: 15 }, radius: 3.5, build: 15, jobs: 1, hp: 150,
    recipes: [{ in: { iron: 1, planks: 1 }, out: { spears: 1 }, time: 9, keep: 20 }, { in: { iron: 2 }, out: { swords: 1 }, time: 12, keep: 20 }],
    desc: 'Fits iron heads to spear shafts, and forges swords.' },
  barracks: { name: 'Barracks', icon: '🚩', group: 'Military', cost: { planks: 20, stone: 20 }, radius: 6, build: 20, hp: 250,
    desc: 'Calls up villagers as soldiers when their kit is in stock.' },
};
export const BUILD_GROUPS = ['Homes', 'Gather', 'Craft', 'Military'];

// What each villager needs to become a soldier of that type.
export const KITS = {
  spear: { name: 'Spearmen', kit: { spears: 1, shields: 1 } },
  archer: { name: 'Archers', kit: { bows: 1, arrows: 10 } },
  sword: { name: 'Swordsmen', kit: { swords: 1, shields: 1 } },
};

const KEEP = { name: 'Keep', icon: '🏰', radius: 11, housing: 12, hp: 1500 };
const LEVY_MAX = 20, LEVY_MIN = 5;
const WALK = 3.4;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const listCost = cost => Object.entries(cost).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(', ');
export { listCost };

export class Town {
  constructor(battle, heightAt, trees, rand) {
    this.battle = battle;
    this.heightAt = heightAt;
    this.rand = rand;
    this.keep = { kind: 'keep', B: KEEP, x: 0, z: 0, hp: KEEP.hp, state: 'active', workers: [] };
    this.stock = Object.fromEntries(Object.keys(GOODS).map(g => [g, 0]));
    Object.assign(this.stock, { wood: 140, stone: 40, food: 80, planks: 20 });
    this.buildings = [];
    this.villagers = [];
    this.trees = trees;
    this.nodes = { tree: trees.spots, rock: [], ore: [] };
    this.territory = 175;
    this.time = 0;
    this.nextMeal = 30;
    this.nextArrival = 20;
    this.hungry = false;
    this.raid = { next: 300, wave: 0, active: false, repelled: 0, time: 0, burned: 0, leaving: false };
    this.lost = false;
    this.placeDeposits();
    for (let i = 0; i < 12; i++) {
      const a = this.rand() * Math.PI * 2;
      this.addVillager(Math.sin(a) * 16, Math.cos(a) * 16);
    }
    // The lord's own men: professionals, not villagers, so they cost no workers.
    const ret = battle.addRegiment(0, 'sword', 0, -24, Math.PI, { count: 20, name: "Lord's retinue" });
    ret.retinue = true;
  }

  event(text, side = 0) { this.battle.events.push({ time: this.battle.time, side, text }); }

  // Grey stone outcrops and rust-red ore deposits, out in the open around the keep.
  placeDeposits() {
    const put = (kind, n, min, max) => {
      for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
        const a = this.rand() * Math.PI * 2, r = min + this.rand() * (max - min);
        const p = { kind, x: Math.sin(a) * r, z: Math.cos(a) * r };
        if ([...this.nodes.rock, ...this.nodes.ore].some(o => dist(o, p) < 40)) continue;
        for (const t of this.nodes.tree) if (t.standing && dist(t, p) < 9) this.trees.fell(t);
        this.nodes[kind].push(p);
        k++;
      }
    };
    put('rock', 5, 55, 150);
    put('ore', 3, 80, 160);
  }

  addVillager(x, z) {
    const v = { id: this.villagers.length, x, z, y: this.heightAt(x, z), yaw: 0, v: 0, phase: this.rand() * 6,
      state: 'idle', job: null, task: null, carry: null, hidden: false, soldier: null, wander: null, checkCd: this.rand() };
    this.villagers.push(v);
    return v;
  }

  get housing() { return KEEP.housing + this.buildings.filter(b => b.state === 'active' && b.B.housing).reduce((n, b) => n + b.B.housing, 0); }
  get population() { return this.villagers.length; }
  get idle() { return this.villagers.filter(v => v.state === 'idle').length; }

  // ---- placing buildings ----

  canAfford(cost) { return Object.entries(cost).every(([g, n]) => this.stock[g] >= n); }

  canPlace(kind, x, z) {
    const B = BUILDINGS[kind], p = { x, z };
    if (!this.canAfford(B.cost)) return { ok: false, reason: `Needs ${listCost(B.cost)}` };
    if (Math.hypot(x, z) > this.territory) return { ok: false, reason: 'Outside your land' };
    if (Math.hypot(x, z) < KEEP.radius + B.radius + 3) return { ok: false, reason: 'Too close to the keep' };
    for (const b of this.buildings) if (dist(b, p) < b.B.radius + B.radius + 1.5) return { ok: false, reason: 'Something is in the way' };
    for (const n of [...this.nodes.rock, ...this.nodes.ore]) if (dist(n, p) < B.radius + 6) return { ok: false, reason: 'Something is in the way' };
    const h = this.heightAt(x, z), r = B.radius;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (Math.abs(this.heightAt(x + dx, z + dz) - h) > (r > 5 ? 3.5 : 2)) return { ok: false, reason: 'Ground too steep' };
    }
    const g = B.gather;
    if (g && g.node !== 'field') {
      const near = this.nodes[g.node].filter(n => (n.standing ?? true) && dist(n, p) < g.range && dist(n, p) > B.radius + 1).length;
      if (near < g.need) return { ok: false, reason: g.node === 'tree' ? 'Needs woods nearby' : g.node === 'rock' ? 'Needs a stone outcrop nearby' : 'Needs an ore deposit nearby' };
    }
    return { ok: true };
  }

  place(kind, x, z) {
    const check = this.canPlace(kind, x, z);
    if (!check.ok) return check;
    const B = BUILDINGS[kind];
    for (const [g, n] of Object.entries(B.cost)) this.stock[g] -= n;
    for (const t of this.nodes.tree) if (t.standing && Math.hypot(t.x - x, t.z - z) < B.radius + 2) this.trees.fell(t);
    const b = { id: this.buildings.length + 1, kind, B, x, z, angle: Math.atan2(-x, -z), state: 'site', progress: 0,
      hp: B.hp, workers: [], builders: [], paused: false, recipe: null, timer: 0, status: 'Waiting for builders' };
    this.buildings.push(b);
    return { ok: true, building: b };
  }

  demolish(b) {
    for (const v of [...b.workers, ...b.builders]) this.release(v);
    // Half the cost comes back if it was standing; a ruin returns nothing.
    if (b.state !== 'ruined') for (const [g, n] of Object.entries(b.B.cost)) this.stock[g] += Math.floor(n / 2);
    this.buildings = this.buildings.filter(o => o !== b);
    b.removed = true;
  }

  setPaused(b, paused) {
    b.paused = paused;
    if (paused) for (const v of [...b.workers]) this.release(v);
  }

  release(v) {
    if (v.job) v.job.workers = v.job.workers.filter(o => o !== v);
    for (const b of this.buildings) b.builders = b.builders.filter(o => o !== v);
    v.job = null;
    v.task = null;
    v.carry = null;
    if (v.state !== 'soldier' && v.state !== 'shelter' && v.state !== 'flee') v.state = 'idle';
  }

  // ---- levies ----

  levyCheck(key) {
    const kit = KITS[key].kit;
    const byKit = Math.min(...Object.entries(kit).map(([g, n]) => Math.floor(this.stock[g] / n)));
    const free = this.villagers.filter(v => v.state !== 'soldier').length;
    const n = Math.min(LEVY_MAX, byKit, free);
    const reason = byKit < LEVY_MIN ? `Needs kit for ${LEVY_MIN}: ${listCost(Object.fromEntries(Object.entries(kit).map(([g, k]) => [g, k * LEVY_MIN])))}`
      : free < LEVY_MIN ? `Needs ${LEVY_MIN} villagers` : null;
    return { n, ok: !reason, reason };
  }

  raise(key, barracks) {
    const check = this.levyCheck(key);
    if (!check.ok) return check;
    // Idle villagers answer first, then gatherers, then craftsmen; the nearest first within each.
    const rank = v => (v.state === 'idle' ? 0 : v.job && v.job.B.gather ? 1 : 2) * 1000 + dist(v, barracks);
    const men = this.villagers.filter(v => v.state !== 'soldier').sort((a, b) => rank(a) - rank(b)).slice(0, check.n);
    for (const [g, n] of Object.entries(KITS[key].kit)) this.stock[g] -= n * men.length;
    const out = Math.atan2(barracks.x, barracks.z);
    const fx = barracks.x + Math.sin(out) * 16, fz = barracks.z + Math.cos(out) * 16;
    for (const v of men) { this.release(v); v.hidden = false; }
    const r = this.battle.addRegiment(0, key, fx, fz, out, { count: men.length, from: men, name: `Levy ${KITS[key].name.toLowerCase()}` });
    r.levy = key;
    r.soldiers.forEach((s, i) => { men[i].state = 'soldier'; men[i].soldier = s; s.villager = men[i]; });
    this.event(`${men.length} villagers took up ${KITS[key].name.toLowerCase() === 'archers' ? 'bows' : 'arms'}.`);
    return { ok: true, reg: r };
  }

  // Survivors hand back their kit and go home to work.
  disband(r) {
    if (!r.levy || r.gone || r.routing) return false;
    for (const s of r.soldiers) {
      if (!s.alive || s.gone || !s.villager) continue;
      const v = s.villager;
      Object.assign(v, { x: s.x, z: s.z, state: 'idle', soldier: null });
      for (const [g, n] of Object.entries(KITS[r.levy].kit)) this.stock[g] += n;
    }
    this.battle.disband(r);
    this.event(`${r.name} went home to work.`);
    return true;
  }

  // ---- simulation ----

  update(dt) {
    if (this.lost) return;
    this.time += dt;
    for (const v of this.villagers) this.updateVillager(v, dt);
    for (const b of this.buildings) if (b.state === 'active') this.updateBuilding(b, dt);
    this.updatePeople(dt);
    this.updateRaids(dt);
  }

  nearestEnemy(p, radius) {
    let best = null, bd = radius * radius;
    this.battle.forNear(p.x, p.z, radius, s => {
      if (s.reg.side === 0) return;
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  walk(v, tx, tz, dt, speed = WALK) {
    const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { v.v = 0; return true; }
    const step = Math.min(d, speed * dt);
    v.x += dx / d * step; v.z += dz / d * step;
    v.y = this.heightAt(v.x, v.z);
    v.yaw = Math.atan2(dx, dz);
    v.v = speed;
    v.phase += step * 2.2;
    return false;
  }

  updateVillager(v, dt) {
    if (v.state === 'soldier') {
      // A levy who falls in battle is a villager lost.
      if (!v.soldier.alive) { v.dead = true; this.release(v); }
      return;
    }
    v.v = 0;
    v.checkCd -= dt;
    if (v.checkCd <= 0) {
      v.checkCd = 0.6;
      if (v.state === 'shelter') {
        const safeHome = !this.nearestEnemy(this.keep, 70);
        const work = v.job || this.keep;
        if (safeHome && !this.nearestEnemy(work, 45)) { v.state = v.job ? 'work' : 'idle'; v.hidden = false; v.task = null; }
      } else if (this.nearestEnemy(v, 28)) {
        v.state = 'flee';
        v.carry = null;
      } else if (v.state === 'idle') {
        this.findWork(v);
      }
    }
    if (v.state === 'flee') {
      if (this.walk(v, this.keep.x + (this.rand() - 0.5) * 4, this.keep.z + (this.rand() - 0.5) * 4, dt, WALK * 1.5)) { v.state = 'shelter'; v.hidden = true; }
      return;
    }
    if (v.state === 'shelter') return;
    if (v.state === 'idle') {
      if (!v.wander || this.walk(v, v.wander.x, v.wander.z, dt, WALK * 0.5)) {
        const a = this.rand() * Math.PI * 2, r = 13 + this.rand() * 8;
        v.wander = this.rand() < 0.02 || !v.wander ? { x: Math.sin(a) * r, z: Math.cos(a) * r } : v.wander;
      }
      return;
    }
    if (v.state === 'build') return this.doBuild(v, dt);
    if (v.state === 'work') return v.job.B.gather ? this.doGather(v, dt) : this.doCraft(v, dt);
  }

  // Sites get builders first, then empty workplaces fill, nearest first.
  findWork(v) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.state === 'site' && b.builders.length < 2) {
        const d = dist(v, b) - 1000;
        if (d < bd) { bd = d; best = b; }
      }
    }
    if (best) { best.builders.push(v); v.state = 'build'; v.job = null; v.site = best; return; }
    for (const b of this.buildings) {
      if (b.state !== 'active' || b.paused || !b.B.jobs || b.workers.length >= b.B.jobs) continue;
      const d = dist(v, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.workers.push(v); v.job = best; v.state = 'work'; v.task = null; }
  }

  doBuild(v, dt) {
    const b = v.site;
    if (!b || b.removed || b.state !== 'site') { this.release(v); return; }
    const a = Math.atan2(v.x - b.x, v.z - b.z);
    if (!this.walk(v, b.x + Math.sin(a) * (b.B.radius + 0.8), b.z + Math.cos(a) * (b.B.radius + 0.8), dt)) return;
    v.yaw = Math.atan2(b.x - v.x, b.z - v.z);
    v.phase += dt * 6;
    b.progress += dt / b.B.build;
    b.status = 'Under construction';
    if (b.progress >= 1) {
      b.progress = 1;
      b.state = 'active';
      b.status = b.B.jobs ? 'Waiting for workers' : '';
      const crew = b.builders;
      b.builders = [];
      for (const o of crew) { o.state = 'idle'; o.site = null; }
      // Builders stay on as the first workers.
      for (const o of crew) if (b.B.jobs && b.workers.length < b.B.jobs) { b.workers.push(o); o.job = b; o.state = 'work'; o.task = null; }
      this.event(`${b.B.name} finished.`);
    }
  }

  doGather(v, dt) {
    const b = v.job, g = b.B.gather;
    if (!v.task) v.task = { phase: 'out' };
    const t = v.task;
    if (t.phase === 'out') {
      if (!t.spot) t.spot = this.pickSpot(b);
      if (!t.spot) { b.status = 'Nothing left to gather'; return; }
      if (this.walk(v, t.spot.x, t.spot.z, dt)) { t.phase = 'gather'; t.timer = g.time; }
    } else if (t.phase === 'gather') {
      t.timer -= dt;
      v.phase += dt * 5;
      b.status = 'Working';
      if (t.timer <= 0) { t.phase = 'back'; v.carry = Object.keys(g.out)[0]; }
    } else if (this.walk(v, b.x + Math.sin(b.angle) * (b.B.radius + 1), b.z + Math.cos(b.angle) * (b.B.radius + 1), dt)) {
      for (const [k, n] of Object.entries(g.out)) this.stock[k] += n;
      v.carry = null;
      v.task = { phase: 'out' };
    }
  }

  pickSpot(b) {
    const g = b.B.gather;
    if (g.node === 'field') {
      const a = this.rand() * Math.PI * 2, r = this.rand() * (b.B.radius - 2);
      return { x: b.x + Math.sin(a) * r, z: b.z + Math.cos(a) * r };
    }
    // A random choice among the closest few, so workers spread out.
    const near = this.nodes[g.node].filter(n => (n.standing ?? true) && dist(n, b) < g.range)
      .sort((p, q) => dist(p, b) - dist(q, b)).slice(0, 6);
    if (!near.length) return null;
    const n = near[Math.floor(this.rand() * near.length)];
    const a = this.rand() * Math.PI * 2, off = g.node === 'tree' ? 1.6 : 4.5;
    return { x: n.x + Math.sin(a) * off, z: n.z + Math.cos(a) * off };
  }

  doCraft(v, dt) {
    const b = v.job;
    const door = { x: b.x + Math.sin(b.angle) * (b.B.radius + 1), z: b.z + Math.cos(b.angle) * (b.B.radius + 1) };
    if (!this.walk(v, door.x, door.z, dt)) return;
    v.yaw = b.angle + Math.PI;
    if (b.workers[0] !== v) return;           // one craftsman sets the pace
    if (b.recipe) {
      b.timer -= dt;
      v.phase += dt * 4;
      if (b.timer <= 0) {
        for (const [k, n] of Object.entries(b.recipe.out)) this.stock[k] += n;
        b.recipe = null;
      }
      return;
    }
    // The first recipe still below its stock target whose inputs are in, leaving the reserve.
    const wanted = b.B.recipes.filter(r => Object.entries(r.out).every(([k]) => this.stock[k] < r.keep));
    const ready = wanted.find(r => Object.entries(r.in).every(([k, n]) => this.stock[k] - n >= (RESERVE[k] || 0)));
    if (ready) {
      for (const [k, n] of Object.entries(ready.in)) this.stock[k] -= n;
      b.recipe = ready;
      b.timer = ready.time;
      b.status = `Making ${GOODS[Object.keys(ready.out)[0]].name.toLowerCase()}`;
    } else if (wanted.length) {
      const missing = Object.keys(wanted[0].in).filter(k => this.stock[k] - wanted[0].in[k] < (RESERVE[k] || 0));
      b.status = `Waiting for ${missing.map(k => GOODS[k].name.toLowerCase()).join(' and ')}`;
    } else {
      b.status = 'Stores are full';
    }
  }

  updateBuilding(b, dt) {
    if (!b.B.jobs) return;
    if (b.paused) b.status = 'Paused';
    else if (!b.workers.length) b.status = 'No workers';
    // Damage mends slowly once the raiders are gone.
    if (b.hp < b.B.hp && !this.nearestEnemy(b, 40)) b.hp = Math.min(b.B.hp, b.hp + dt * 2);
  }

  // Meals, newcomers and the dead.
  updatePeople(dt) {
    if (this.villagers.some(v => v.dead)) this.villagers = this.villagers.filter(v => !v.dead);
    this.nextMeal -= dt;
    if (this.nextMeal <= 0) {
      this.nextMeal = 30;
      const need = Math.ceil(this.population / 2);
      this.hungry = this.stock.food < need;
      this.stock.food = Math.max(0, this.stock.food - need);
      if (this.hungry) this.event('The village is going hungry. Nobody new will settle.', 1);
    }
    this.nextArrival -= dt;
    if (this.nextArrival <= 0) {
      this.nextArrival = 18;
      if (!this.hungry && this.population < this.housing && !this.raid.active) {
        const a = this.rand() * Math.PI * 2;
        const v = this.addVillager(Math.sin(a) * 120, Math.cos(a) * 120);
        v.wander = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 };
        this.event('A new family has settled in the village.');
      }
    }
    if (this.keep.hp < KEEP.hp && !this.nearestEnemy(this.keep, 50)) this.keep.hp = Math.min(KEEP.hp, this.keep.hp + dt * 5);
  }

  // ---- raids ----

  updateRaids(dt) {
    const b = this.battle;
    const raiders = b.regs.filter(r => r.side === 1 && !r.gone);
    if (this.raid.active && !raiders.length) {
      this.raid.active = false;
      this.raid.repelled++;
      this.event('The raiders are gone. The village breathes again.');
    }
    if (!this.raid.active) {
      this.raid.next -= dt;
      if (this.raid.next <= 0) this.startRaid();
      return;
    }
    // Raiders take what they can and go: after a few fires, or once they have lingered.
    this.raid.time += dt;
    if (!this.raid.leaving && (this.raid.burned >= 3 || this.raid.time > 150)) {
      this.raid.leaving = true;
      this.event('The raiders are making off with their plunder.');
    }
    // Raiders not fighting set fire to whatever they stand beside.
    for (const r of raiders) {
      if (this.raid.leaving) continue;
      if (r.routing || r.regrouping || !r.raidTarget || r.engaged > 0) continue;
      const t = r.raidTarget;
      if (t.removed || t.state === 'ruined') { r.raidTarget = null; continue; }
      if (Math.hypot(r.cx - t.x, r.cz - t.z) > t.B.radius + 9) continue;
      t.hp -= dt * r.alive * 0.35;
      if (t.hp <= 0) this.ruin(t);
    }
  }

  ruin(t) {
    t.hp = 0;
    if (t === this.keep) {
      this.lost = true;
      this.battle.winner = 1;
      this.event('The keep has fallen.', 1);
      return;
    }
    t.state = 'ruined';
    t.status = 'Burned by raiders';
    this.raid.burned++;
    for (const v of [...t.workers, ...t.builders]) this.release(v);
    this.event(`Raiders burned the ${t.B.name.toLowerCase()}!`, 1);
  }

  startRaid() {
    const b = this.battle, w = ++this.raid.wave;
    Object.assign(this.raid, { active: true, time: 0, burned: 0, leaving: false });
    this.raid.next = Math.max(150, 260 - w * 15);
    const a = this.rand() * Math.PI * 2;
    const camp = { x: Math.sin(a) * 225, z: Math.cos(a) * 225 };
    b.homes[1] = camp;
    const face = Math.atan2(-camp.x, -camp.z);
    let men = 10 + w * 6;
    const bands = [];
    while (men > 0) { bands.push(Math.min(20, men)); men -= 20; }
    bands.forEach((n, i) => {
      const off = (i - (bands.length - 1) / 2) * 26;
      b.addRegiment(1, 'bandit', camp.x + Math.cos(face) * off, camp.z - Math.sin(face) * off, face, { count: n, name: 'Bandit band' });
    });
    if (w >= 3) b.addRegiment(1, 'archer', camp.x - Math.sin(face) * 15, camp.z - Math.cos(face) * 15, face, { count: 8 + w * 2, name: 'Bandit archers' });
    const dirName = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(camp.x, -camp.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
    this.event(`Bandits are coming from the ${dirName}!`, 1);
  }

  // Raiders fight soldiers who come near; otherwise they make for the nearest building.
  thinkRaiders() {
    const b = this.battle;
    const defenders = b.regs.filter(r => r.side === 0 && !r.gone && !r.routing && !r.regrouping);
    const targets = [...this.buildings.filter(o => o.state !== 'ruined'), this.keep];
    for (const r of b.regs) {
      if (r.side !== 1 || r.gone || r.routing || r.regrouping) continue;
      if (this.raid.leaving) {
        // Head back to camp and melt away; only men who are caught still fight.
        const home = b.homes[1];
        r.targetReg = null;
        r.dest = { x: home.x, z: home.z, angle: Math.atan2(home.x - r.cx, home.z - r.cz) };
        if (Math.hypot(home.x - r.cx, home.z - r.cz) < 20) b.disband(r);
        continue;
      }
      const near = defenders.filter(d => Math.hypot(d.cx - r.cx, d.cz - r.cz) < (r.T.range ? r.T.range : 45))
        .sort((p, q) => Math.hypot(p.cx - r.cx, p.cz - r.cz) - Math.hypot(q.cx - r.cx, q.cz - r.cz))[0];
      if (near) { if (r.targetReg !== near) b.orderAttack([r], near); continue; }
      if (r.targetReg) continue;
      if (!r.raidTarget || r.raidTarget.state === 'ruined' || r.raidTarget.removed) {
        r.raidTarget = targets.sort((p, q) => Math.hypot(p.x - r.cx, p.z - r.cz) - Math.hypot(q.x - r.cx, q.z - r.cz))[0];
      }
      const t = r.raidTarget;
      const a = Math.atan2(t.x - r.cx, t.z - r.cz);
      const stand = t.B.radius + 4;
      const dx = t.x - Math.sin(a) * stand, dz = t.z - Math.cos(a) * stand;
      if (!r.dest || Math.hypot(r.dest.x - dx, r.dest.z - dz) > 3) r.dest = { x: dx, z: dz, angle: a };
    }
  }
}
