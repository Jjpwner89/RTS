// One point of interest as a living town: buildings placed anywhere, villagers who
// build and work them, short production chains, levies raised from the villagers
// themselves, and bandit raids. Fighting is left to battle.js.
//
// Goods are real and sit somewhere: in a woodcutter's yard, a workshop, the barracks,
// a storehouse or the keep. Haulers carry them about in crates, so where things are
// built matters. Workers who are stuck fetch or clear their own goods, more slowly.

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
// recipes: villagers work at the building, turning stock into stock. Each workshop can
// switch any of its recipes off; it takes turns between those left on. `keep` stops a
// recipe once that much of its output is stored. Arms have no limit: switch a recipe
// off to stop it.
// Workshops stop asking for wood once the village is down to its last, so construction can go on.
const RESERVE = { wood: 20 };
export const BUILDINGS = {
  house: { name: 'House', icon: '🏠', group: 'Village', cost: { wood: 12 }, radius: 3.5, build: 10, housing: 6, hp: 120,
    desc: 'Room for 6 more villagers.' },
  storehouse: { name: 'Storehouse', icon: '📦', group: 'Village', cost: { wood: 15 }, radius: 4.5, build: 12, jobs: 3, hp: 150,
    haul: true, storage: true, desc: 'Holds any goods. Its three haulers carry goods between the buildings around it.' },
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
    recipes: [{ in: { wood: 2 }, out: { planks: 3 }, time: 7, keep: 40 }, { in: { planks: 2 }, out: { shields: 1 }, time: 6 }],
    desc: 'Saws wood into planks, and planks into shields.' },
  ropemaker: { name: 'Ropemaker', icon: '🧵', group: 'Craft', cost: { wood: 15 }, radius: 4, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { flax: 2 }, out: { string: 1 }, time: 7, keep: 20 }], desc: 'Twists flax into bowstring.' },
  smelter: { name: 'Smelter', icon: '🔥', group: 'Craft', cost: { wood: 10, stone: 15 }, radius: 3.5, build: 15, jobs: 1, hp: 150,
    recipes: [{ in: { ore: 2, wood: 1 }, out: { iron: 1 }, time: 9, keep: 20 }], desc: 'Smelts ore into iron, burning wood.' },
  bowyer: { name: 'Bowyer', icon: '🏹', group: 'Craft', cost: { planks: 10, stone: 5 }, radius: 3.5, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { planks: 2, string: 1 }, out: { bows: 1 }, time: 10 }, { in: { planks: 1, feathers: 2 }, out: { arrows: 10 }, time: 8 }],
    desc: 'Makes bows from planks and string, and arrows from planks and feathers.' },
  weaponsmith: { name: 'Weaponsmith', icon: '⚔️', group: 'Craft', cost: { planks: 10, stone: 15 }, radius: 3.5, build: 15, jobs: 1, hp: 150,
    recipes: [{ in: { iron: 1, planks: 1 }, out: { spears: 1 }, time: 9 }, { in: { iron: 2 }, out: { swords: 1 }, time: 12 }],
    desc: 'Fits iron heads to spear shafts, and forges swords.' },
  barracks: { name: 'Barracks', icon: '🚩', group: 'Military', cost: { planks: 20, stone: 20 }, radius: 6, build: 20, hp: 250,
    desc: 'Holds the arms, and calls up villagers as soldiers when their kit is here.' },
};
export const BUILD_GROUPS = ['Village', 'Gather', 'Craft', 'Military'];

// What each villager needs to become a soldier of that type.
export const KITS = {
  spear: { name: 'Spearmen', kit: { spears: 1, shields: 1 } },
  archer: { name: 'Archers', kit: { bows: 1, arrows: 10 } },
  sword: { name: 'Swordsmen', kit: { swords: 1, shields: 1 } },
};

const KEEP = { name: 'Keep', icon: '🏰', radius: 11, housing: 12, hp: 1500, jobs: 2, haul: true, storage: true };
const LEVY_MAX = 20, LEVY_MIN = 5;
const WALK = 3.4;

// A crate holds 10 of most goods; a yard or workshop holds 30 of each before it stops
// for haulers. Arrows are light and go four times as far.
const CRATE = 10, HOLD = 30, BULK = { arrows: 4 };
const crate = g => CRATE * (BULK[g] || 1);
const holdOf = g => HOLD * (BULK[g] || 1);
const ARMS = GOOD_GROUPS[2][1];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gone = b => b.removed || b.state === 'ruined';
const compass = p => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(p.x, -p.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
const listCost = cost => Object.entries(cost).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(', ');
export { listCost };

export class Town {
  // timedRaids: bandits turn up on their own (the standalone village); on the world
  // map, attackers are real armies instead.
  constructor(battle, heightAt, trees, rand, { timedRaids = false, villagers = 12, retinue = true, stock = null } = {}) {
    this.battle = battle;
    this.heightAt = heightAt;
    this.rand = rand;
    this.keep = { kind: 'keep', B: KEEP, x: 0, z: 0, angle: 0, hp: KEEP.hp, state: 'active', workers: [], status: '',
      store: { ...(stock || { wood: 140, stone: 40, food: 80, planks: 20 }) }, incoming: {}, reserved: {} };
    this.stockCache = null;
    this.buildings = [];
    this.villagers = [];
    this.trees = trees;
    this.nodes = { tree: trees.spots, rock: [], ore: [] };
    this.territory = 175;
    this.time = 0;
    this.nextMeal = 30;
    this.nextArrival = 20;
    this.hungry = false;
    this.timedRaids = timedRaids;
    this.raid = { next: 300, wave: 0 };
    this.attackers = [];
    this.lost = false;
    this.placeDeposits();
    for (let i = 0; i < villagers; i++) {
      const a = this.rand() * Math.PI * 2;
      this.addVillager(Math.sin(a) * 16, Math.cos(a) * 16);
    }
    // The lord's own men: professionals, not villagers, so they cost no workers.
    if (retinue) {
      const ret = battle.addRegiment(0, 'sword', 0, -24, Math.PI, { count: 20, name: "Lord's retinue" });
      ret.retinue = true;
    }
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
      state: 'idle', job: null, task: null, carry: null, load: null, hidden: false, soldier: null, wander: null, checkCd: this.rand() };
    this.villagers.push(v);
    return v;
  }

  get housing() { return KEEP.housing + this.buildings.filter(b => b.state === 'active' && b.B.housing).reduce((n, b) => n + b.B.housing, 0); }
  get population() { return this.villagers.length; }
  get idle() { return this.villagers.filter(v => v.state === 'idle' || v.state === 'haul').length; }
  get hauling() { return this.villagers.filter(v => v.task?.kind === 'haul').length; }

  // ---- where goods are ----

  // Everything that can hold goods: the keep and every standing building or site.
  holders() { return [this.keep, ...this.buildings.filter(b => b.state !== 'ruined')]; }
  stores() { return this.holders().filter(b => b.B.storage && b.state === 'active'); }

  put(b, g, n) {
    b.store[g] = (b.store[g] || 0) + n;
    if (b.store[g] <= 1e-6) delete b.store[g];
    this.stockCache = null;
  }

  // The village's goods wherever they are, crates on the road included. Materials
  // already delivered to a building site are spent.
  get stock() {
    if (this.stockCache) return this.stockCache;
    const s = Object.fromEntries(Object.keys(GOODS).map(g => [g, 0]));
    for (const b of this.holders()) if (b.state === 'active') for (const g in b.store) s[g] += b.store[g];
    for (const v of this.villagers) if (v.load) s[v.load.g] += v.load.n;
    return (this.stockCache = s);
  }

  // What is still to come for building sites, and so not free for anything else.
  owed(g) {
    let n = 0;
    for (const b of this.buildings) if (b.state === 'site') n += Math.max(0, (b.B.cost[g] || 0) - (b.store[g] || 0));
    return n;
  }
  free(g) { return this.stock[g] - this.owed(g); }

  // How much of each good a building is asking for, as a total it wants to hold.
  wants(b) {
    if (b.state === 'site') return b.B.cost;
    if (b.state !== 'active' || b.paused) return {};
    if (b.kind === 'barracks') return Object.fromEntries(ARMS.map(g => [g, Infinity]));
    if (!b.B.recipes) return {};
    const w = {};
    for (const r of this.wantedRecipes(b)) {
      for (const [g, n] of Object.entries(r.in)) {
        if (this.free(g) < (RESERVE[g] || 0)) continue;
        w[g] = Math.max(w[g] || 0, n * 3);
      }
    }
    return w;
  }

  // Recipes switched on that the village still wants and the workshop has room for.
  wantedRecipes(b) {
    return b.B.recipes.filter((r, i) => !b.off.has(i)
      && Object.keys(r.out).every(k => this.stock[k] < (r.keep ?? Infinity) && (b.store[k] || 0) < holdOf(k)));
  }

  // What may be carried away from a building. Workshops keep what they need themselves;
  // the barracks keeps its arms.
  spare(b, g, wants) {
    if (b.state !== 'active' || b.kind === 'barracks' || !(b.B.storage || b.B.gather || b.B.recipes)) return 0;
    const own = b.B.recipes ? (wants.get(b)[g] || 0) : 0;
    return Math.max(0, (b.store[g] || 0) - own - (b.reserved[g] || 0));
  }

  // Whether a delivery of this good belongs here.
  takes(b, g) {
    if (gone(b)) return false;
    if (b.state === 'site' || b.B.storage) return true;
    if (b.kind === 'barracks') return ARMS.includes(g);
    return !!b.B.recipes?.some(r => g in r.in || g in r.out);
  }

  nearestStore(p, except = null) {
    let best = this.keep, bd = Infinity;
    for (const b of this.stores()) if (b !== except && dist(b, p) < bd) { bd = dist(b, p); best = b; }
    return best;
  }

  // Where arms go when nobody is carrying them: the nearest barracks, or the stores.
  armoury(p) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) if (b.kind === 'barracks' && b.state === 'active' && dist(b, p) < bd) { bd = dist(b, p); best = b; }
    return best || this.nearestStore(p);
  }

  door(b, v) {
    if (b === this.keep) { const a = Math.atan2(v.x, v.z); return { x: Math.sin(a) * (KEEP.radius + 1), z: Math.cos(a) * (KEEP.radius + 1) }; }
    return { x: b.x + Math.sin(b.angle) * (b.B.radius + 1), z: b.z + Math.cos(b.angle) * (b.B.radius + 1) };
  }

  // ---- hauling ----
  // The best crate for a villager to carry next. Building sites are served first, then
  // workshops, then arms for the barracks; then full yards and workshops are cleared
  // into the nearest store. `only` keeps a worker to jobs for their own building.
  planHaul(v, only = null) {
    const holders = this.holders();
    const wants = new Map(holders.map(b => [b, this.wants(b)]));
    const stores = this.stores();
    let best = null, bs = Infinity;
    const consider = (from, to, g, n, rank) => {
      if (n < 1) return;
      const s = rank * 150 + dist(v, from) + dist(from, to);
      if (s < bs) { bs = s; best = { from, to, g, n: Math.min(Math.floor(n), crate(g)) }; }
    };
    for (const to of holders) {
      const w = wants.get(to);
      const rank = to.state === 'site' ? 0 : to.kind === 'barracks' ? 2 : 1;
      for (const g in w) {
        const need = w[g] - (to.store[g] || 0) - (to.incoming[g] || 0);
        if (need < 1) continue;
        for (const from of holders) {
          if (from === to || (only && only !== to && only !== from)) continue;
          consider(from, to, g, Math.min(need, this.spare(from, g, wants)), rank);
        }
      }
    }
    const barracks = this.buildings.some(b => b.kind === 'barracks' && b.state === 'active');
    for (const from of holders) {
      if (from.B.storage || (only && only !== from)) continue;
      for (const g in from.store) {
        if (barracks && ARMS.includes(g)) continue;
        const n = this.spare(from, g, wants);
        if (!only && n < Math.min(crate(g), 5 * (BULK[g] || 1))) continue;
        let to = null, bd = Infinity;
        for (const s of stores) if (dist(s, from) < bd) { bd = dist(s, from); to = s; }
        consider(from, to || this.keep, g, n, 3);
      }
    }
    if (!best) return null;
    best.from.reserved[best.g] = (best.from.reserved[best.g] || 0) + best.n;
    best.to.incoming[best.g] = (best.to.incoming[best.g] || 0) + best.n;
    return { kind: 'haul', phase: 'fetch', ...best };
  }

  doHaul(v, dt) {
    const t = v.task;
    if (t.phase === 'fetch') {
      if (gone(t.from)) { this.cancelHaul(v); return true; }
      const d = this.door(t.from, v);
      if (!this.walk(v, d.x, d.z, dt)) return false;
      t.from.reserved[t.g] -= t.n;
      const n = Math.min(t.n, t.from.store[t.g] || 0);
      t.to.incoming[t.g] -= t.n - n;
      if (n < 1) { t.to.incoming[t.g] -= n; v.task = null; return true; }
      this.put(t.from, t.g, -n);
      t.n = n;
      v.load = { g: t.g, n };
      v.carry = t.g;
      t.phase = 'deliver';
      return false;
    }
    // A building that burned or no longer wants it: take the crate to the nearest store.
    if (!this.takes(t.to, t.g)) {
      t.to.incoming[t.g] -= t.n;
      t.to = this.nearestStore(v, t.from);
      t.to.incoming[t.g] = (t.to.incoming[t.g] || 0) + t.n;
    }
    const d = this.door(t.to, v);
    if (!this.walk(v, d.x, d.z, dt)) return false;
    this.put(t.to, t.g, t.n);
    t.to.incoming[t.g] -= t.n;
    v.load = null;
    v.carry = null;
    v.task = null;
    return true;
  }

  // Drops a planned trip. A crate already picked up is set down in the nearest store.
  cancelHaul(v) {
    const t = v.task;
    if (t?.kind === 'haul') {
      if (t.phase === 'fetch') t.from.reserved[t.g] -= t.n;
      t.to.incoming[t.g] -= t.n;
    }
    if (v.load) this.put(this.nearestStore(v), v.load.g, v.load.n);
    v.load = null;
    v.carry = null;
    v.task = null;
  }

  // Haulers at the keep and storehouses take crate after crate, and wait by the door
  // when there is nothing to carry.
  doHaulJob(v, dt) {
    if (v.task) { this.doHaul(v, dt); return; }
    v.waitCd = (v.waitCd || 0) - dt;
    if (v.waitCd <= 0) {
      v.waitCd = 1;
      v.task = this.planHaul(v);
      if (v.task) return;
    }
    const d = this.door(v.job, v);
    this.walk(v, d.x, d.z, dt);
  }

  // ---- placing buildings ----

  canAfford(cost) { return Object.entries(cost).every(([g, n]) => this.free(g) >= n); }

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

  // The cost is set aside at once, and carried to the site before builders can finish.
  // `ready` puts up a finished building for free (villages that start with some).
  place(kind, x, z, { ready = false } = {}) {
    const check = ready ? { ok: true } : this.canPlace(kind, x, z);
    if (!check.ok) return check;
    const B = BUILDINGS[kind];
    for (const t of this.nodes.tree) if (t.standing && Math.hypot(t.x - x, t.z - z) < B.radius + 2) this.trees.fell(t);
    const b = { id: this.buildings.length + 1, kind, B, x, z, angle: Math.atan2(-x, -z), state: 'site', progress: 0,
      hp: B.hp, workers: [], builders: [], paused: false, recipe: null, timer: 0, status: 'Waiting for builders',
      off: new Set(), turn: 0, store: {}, incoming: {}, reserved: {} };
    if (ready) Object.assign(b, { state: 'active', progress: 1, status: B.jobs ? 'Waiting for workers' : '' });
    this.buildings.push(b);
    this.stockCache = null;
    return { ok: true, building: b };
  }

  demolish(b) {
    for (const v of [...b.workers, ...b.builders]) this.release(v);
    // What it held goes to the nearest store, with half the cost if it was standing
    // (all of what reached a site). A ruin returns nothing.
    if (b.state !== 'ruined') {
      const to = this.nearestStore(b, b);
      if (b.state === 'active') for (const [g, n] of Object.entries(b.B.cost)) this.put(to, g, Math.floor(n / 2));
      for (const [g, n] of Object.entries(b.store)) this.put(to, g, n);
    }
    b.store = {};
    this.buildings = this.buildings.filter(o => o !== b);
    b.removed = true;
    this.stockCache = null;
  }

  // Switches one of a workshop's recipes on or off.
  toggleRecipe(b, i) {
    if (b.off.has(i)) b.off.delete(i); else b.off.add(i);
  }

  setPaused(b, paused) {
    b.paused = paused;
    if (paused) for (const v of [...b.workers]) this.release(v);
  }

  release(v) {
    if (v.job) v.job.workers = v.job.workers.filter(o => o !== v);
    for (const b of this.buildings) b.builders = b.builders.filter(o => o !== v);
    this.cancelHaul(v);
    v.job = null;
    v.site = null;
    if (v.state !== 'soldier' && v.state !== 'shelter' && v.state !== 'flee') v.state = 'idle';
  }

  // ---- levies ----

  // Kit is taken from this barracks' own racks, so it has to be carried there first.
  levyCheck(key, barracks) {
    const kit = KITS[key].kit, have = g => Math.floor(barracks.store[g] || 0);
    const byKit = Math.min(...Object.entries(kit).map(([g, n]) => Math.floor(have(g) / n)));
    const free = this.villagers.filter(v => v.state !== 'soldier').length;
    const n = Math.min(LEVY_MAX, byKit, free);
    const short = Object.entries(kit).filter(([g, k]) => have(g) < k * LEVY_MIN)
      .map(([g, k]) => `${k * LEVY_MIN} ${GOODS[g].name.toLowerCase()} here (has ${have(g)})`);
    const reason = byKit < LEVY_MIN ? `Needs ${short.join(' and ')}`
      : free < LEVY_MIN ? `Needs ${LEVY_MIN} villagers` : null;
    return { n, ok: !reason, reason };
  }

  raise(key, barracks) {
    const check = this.levyCheck(key, barracks);
    if (!check.ok) return check;
    // Idle villagers answer first, then gatherers, then craftsmen; the nearest first within each.
    const rank = v => (v.state === 'idle' ? 0 : v.job && v.job.B.gather ? 1 : 2) * 1000 + dist(v, barracks);
    const men = this.villagers.filter(v => v.state !== 'soldier').sort((a, b) => rank(a) - rank(b)).slice(0, check.n);
    for (const [g, n] of Object.entries(KITS[key].kit)) this.put(barracks, g, -n * men.length);
    const out = Math.atan2(barracks.x, barracks.z);
    const fx = barracks.x + Math.sin(out) * 16, fz = barracks.z + Math.cos(out) * 16;
    for (const v of men) { this.release(v); v.hidden = false; }
    const r = this.battle.addRegiment(0, key, fx, fz, out, { count: men.length, from: men, name: `Levy ${KITS[key].name.toLowerCase()}` });
    r.levy = key;
    r.soldiers.forEach((s, i) => { men[i].state = 'soldier'; men[i].soldier = s; s.villager = men[i]; });
    this.event(`${men.length} villagers took up ${KITS[key].name.toLowerCase() === 'archers' ? 'bows' : 'arms'}.`);
    return { ok: true, reg: r };
  }

  // Survivors hand back their kit at the nearest barracks and go home to work. The
  // lord's retinue can be sent to work too: each man becomes a villager and racks a
  // sword and a shield, so the barracks can arm them again later.
  disband(r) {
    if (r.gone || r.routing) return false;
    const rack = this.armoury({ x: r.cx, z: r.cz });
    if (r.retinue) {
      let n = 0;
      for (const s of r.soldiers) {
        if (!s.alive || s.gone) continue;
        this.addVillager(s.x, s.z);
        for (const [g, k] of Object.entries(KITS.sword.kit)) this.put(rack, g, k);
        n++;
      }
      this.battle.disband(r);
      this.event(`The lord's retinue hung up their swords: ${n} new villagers.`);
      return true;
    }
    if (!r.levy) return false;
    for (const s of r.soldiers) {
      if (!s.alive || s.gone || !s.villager) continue;
      const v = s.villager;
      Object.assign(v, { x: s.x, z: s.z, state: 'idle', soldier: null });
      for (const [g, n] of Object.entries(KITS[r.levy].kit)) this.put(rack, g, n);
    }
    this.battle.disband(r);
    this.event(`${r.name} went home to work.`);
    return true;
  }

  // ---- simulation ----

  update(dt) {
    if (this.lost) return;
    this.time += dt;
    this.stockCache = null;
    for (const v of this.villagers) this.updateVillager(v, dt);
    for (const b of this.buildings) if (b.state === 'active') this.updateBuilding(b, dt);
    this.updatePeople(dt);
    this.updateAttacks(dt);
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
        // Run for the keep, still holding any crate; the trip itself is off.
        const load = v.load;
        v.load = null;
        this.cancelHaul(v);
        v.load = load;
        v.carry = load ? load.g : null;
        v.state = 'flee';
      } else if (v.state === 'idle') {
        this.findWork(v);
        // Villagers with no job carry goods.
        if (v.state === 'idle' && (v.task = this.planHaul(v))) v.state = 'haul';
      }
    }
    if (v.state === 'flee') {
      if (this.walk(v, this.keep.x + (this.rand() - 0.5) * 4, this.keep.z + (this.rand() - 0.5) * 4, dt, WALK * 1.5)) {
        v.state = 'shelter';
        v.hidden = true;
        if (v.load) this.put(this.keep, v.load.g, v.load.n);
        v.load = null;
        v.carry = null;
      }
      return;
    }
    if (v.state === 'shelter') return;
    if (v.state === 'haul') { if (this.doHaul(v, dt) && !v.task) v.state = 'idle'; return; }
    if (v.state === 'idle') {
      if (!v.wander || this.walk(v, v.wander.x, v.wander.z, dt, WALK * 0.5)) {
        const a = this.rand() * Math.PI * 2, r = 13 + this.rand() * 8;
        v.wander = this.rand() < 0.02 || !v.wander ? { x: Math.sin(a) * r, z: Math.cos(a) * r } : v.wander;
      }
      return;
    }
    if (v.state === 'build') return this.doBuild(v, dt);
    if (v.state === 'work') return v.job.B.haul ? this.doHaulJob(v, dt) : v.job.B.gather ? this.doGather(v, dt) : this.doCraft(v, dt);
  }

  // A worker who is stuck carries a crate for their own building, then gets back to it.
  selfHaul(v, dt) {
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return true; }
    v.waitCd = (v.waitCd || 0) - dt;
    if (v.waitCd > 0) return false;
    v.waitCd = 1;
    v.task = this.planHaul(v, v.job || v.site);
    return !!v.task;
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
    for (const b of [this.keep, ...this.buildings]) {
      if (b.state !== 'active' || b.paused || !b.B.jobs || b.workers.length >= b.B.jobs) continue;
      const d = dist(v, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.workers.push(v); v.job = best; v.state = 'work'; v.task = null; }
  }

  // Builders can only get as far as the materials on site allow. When more are needed
  // and nobody is bringing them, they fetch them themselves.
  delivered(b) {
    const cost = Object.entries(b.B.cost), all = cost.reduce((n, [, k]) => n + k, 0);
    return cost.reduce((n, [g, k]) => n + Math.min(k, b.store[g] || 0), 0) / all;
  }

  doBuild(v, dt) {
    const b = v.site;
    if (!b || b.removed || b.state !== 'site') { this.release(v); return; }
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    const ready = this.delivered(b);
    if (b.progress >= ready - 1e-6) {
      const short = Object.entries(b.B.cost).filter(([g, k]) => (b.store[g] || 0) + (b.incoming[g] || 0) < k);
      if (short.length && this.selfHaul(v, dt)) return;
      b.status = short.length ? `Waiting for ${short.map(([g]) => GOODS[g].name.toLowerCase()).join(' and ')}` : 'Materials on the way';
    }
    const a = Math.atan2(v.x - b.x, v.z - b.z);
    if (!this.walk(v, b.x + Math.sin(a) * (b.B.radius + 0.8), b.z + Math.cos(a) * (b.B.radius + 0.8), dt)) return;
    v.yaw = Math.atan2(b.x - v.x, b.z - v.z);
    if (b.progress >= ready - 1e-6) return;
    v.phase += dt * 6;
    b.progress = Math.min(ready, b.progress + dt / b.B.build);
    b.status = 'Under construction';
    if (b.progress >= 1 - 1e-6) {
      b.progress = 1;
      b.store = {};
      this.stockCache = null;
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
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    // A full yard stops work until haulers clear it; meanwhile the workers carry crates off themselves.
    if (!v.task && Object.keys(g.out).some(k => (b.store[k] || 0) >= holdOf(k))) {
      if (!this.selfHaul(v, dt)) b.status = 'Yard full: needs haulers';
      return;
    }
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
      for (const [k, n] of Object.entries(g.out)) this.put(b, k, n);
      v.carry = null;
      v.task = null;
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
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    const door = this.door(b, v);
    if (!this.walk(v, door.x, door.z, dt)) return;
    v.yaw = b.angle + Math.PI;
    if (b.workers[0] !== v) return;           // one craftsman sets the pace
    if (b.recipe) {
      b.timer -= dt;
      v.phase += dt * 4;
      if (b.timer <= 0) {
        for (const [k, n] of Object.entries(b.recipe.out)) this.put(b, k, n);
        b.recipe = null;
      }
      return;
    }
    // Take turns among the recipes switched on that the village still wants and whose
    // inputs are here in the workshop.
    const list = b.B.recipes;
    const wanted = this.wantedRecipes(b);
    const can = r => Object.entries(r.in).every(([k, n]) => (b.store[k] || 0) >= n);
    let ready = null;
    for (let k = 0; k < list.length && !ready; k++) {
      const i = (b.turn + k) % list.length;
      if (wanted.includes(list[i]) && can(list[i])) { ready = list[i]; b.turn = i + 1; }
    }
    if (ready) {
      for (const [k, n] of Object.entries(ready.in)) this.put(b, k, -n);
      b.recipe = ready;
      b.timer = ready.time;
      b.status = `Making ${GOODS[Object.keys(ready.out)[0]].name.toLowerCase()}`;
      return;
    }
    if (b.off.size === list.length) { b.status = 'Nothing switched on'; return; }
    // Stuck: fetch the inputs or clear the finished goods by hand.
    const full = list.some((r, i) => !b.off.has(i) && Object.keys(r.out).some(k => (b.store[k] || 0) >= holdOf(k)));
    if (wanted.length) {
      const missing = Object.keys(wanted[0].in).filter(k => (b.store[k] || 0) < wanted[0].in[k]);
      b.status = `Waiting for ${missing.map(k => GOODS[k].name.toLowerCase()).join(' and ')}`;
    } else {
      b.status = full ? 'Store full: needs haulers' : 'Village has enough';
    }
    this.selfHaul(v, dt);
  }

  updateBuilding(b, dt) {
    if (!b.B.jobs) return;
    if (b.paused) b.status = 'Paused';
    else if (!b.workers.length) b.status = 'No workers';
    else if (b.B.haul) b.status = this.haulStatus(b);
    // Damage mends slowly once the raiders are gone.
    if (b.hp < b.B.hp && !this.nearestEnemy(b, 40)) b.hp = Math.min(b.B.hp, b.hp + dt * 2);
  }

  haulStatus(b) {
    const busy = b.workers.filter(v => v.task?.kind === 'haul').length;
    return busy ? `${busy} carrying goods` : 'Haulers waiting for work';
  }

  // Meals, newcomers and the dead.
  updatePeople(dt) {
    if (this.villagers.some(v => v.dead)) this.villagers = this.villagers.filter(v => !v.dead);
    this.nextMeal -= dt;
    if (this.nextMeal <= 0) {
      this.nextMeal = 30;
      // Meals come out of the keep and storehouses, not food still lying at the farms.
      let need = Math.ceil(this.population / 2);
      const stores = this.stores();
      this.hungry = stores.reduce((n, b) => n + (b.store.food || 0), 0) < need;
      for (const b of stores) {
        const n = Math.min(need, b.store.food || 0);
        if (n > 0) { this.put(b, 'food', -n); need -= n; }
      }
      if (this.hungry) this.event('The village is going hungry. Nobody new will settle.', 1);
    }
    this.nextArrival -= dt;
    if (this.nextArrival <= 0) {
      this.nextArrival = 18;
      if (!this.hungry && this.population < this.housing && !this.underAttack) {
        const a = this.rand() * Math.PI * 2;
        const v = this.addVillager(Math.sin(a) * 120, Math.cos(a) * 120);
        v.wander = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 };
        this.event('A new family has settled in the village.');
      }
    }
    this.keep.status = this.keep.workers.length ? this.haulStatus(this.keep) : 'No haulers';
    if (this.keep.hp < KEEP.hp && !this.nearestEnemy(this.keep, 50)) this.keep.hp = Math.min(KEEP.hp, this.keep.hp + dt * 5);
  }

  // ---- attackers ----
  // Enemy regiments in the village come in groups. A raid burns a few buildings and
  // leaves by the road it came in on; an assault fights on until the keep falls.

  get underAttack() { return this.attackers.length > 0; }

  edgePoint(angle) { return { x: Math.sin(angle) * 215, z: Math.cos(angle) * 215 }; }

  receiveAttack(specs, angle, { mode = 'raid', name = 'Raiders', onLeave = null } = {}) {
    const b = this.battle, entry = this.edgePoint(angle);
    b.homes[1] = entry;
    const face = Math.atan2(-entry.x, -entry.z);
    const regs = specs.map((sp, i) => {
      const off = (i - (specs.length - 1) / 2) * 30;
      return b.addRegiment(1, sp.key, entry.x + Math.cos(face) * off, entry.z - Math.sin(face) * off, face, { count: sp.count, name: sp.name });
    });
    this.attackers.push({ regs, mode, entry, time: 0, burned: 0, leaving: false, onLeave });
    this.event(`${name} ${mode === 'raid' ? 'are raiding' : 'are attacking'} the village from the ${compass(entry)}!`, 1);
  }

  updateAttacks(dt) {
    for (const g of [...this.attackers]) {
      const live = g.regs.filter(r => !r.gone);
      if (!live.length) { this.endAttack(g); continue; }
      g.time += dt;
      if (g.mode === 'raid' && !g.leaving && (g.burned >= 3 || g.time > 150)) {
        g.leaving = true;
        this.event('The raiders are making off with their plunder.');
      }
      if (g.leaving) continue;
      // Attackers not fighting set fire to whatever they stand beside.
      for (const r of live) {
        if (r.routing || r.regrouping || !r.raidTarget || r.engaged > 0) continue;
        const t = r.raidTarget;
        if (t.removed || t.state === 'ruined') { r.raidTarget = null; continue; }
        if (Math.hypot(r.cx - t.x, r.cz - t.z) > t.B.radius + 9) continue;
        t.hp -= dt * r.alive * 0.35;
        if (t.hp <= 0) this.ruin(t, g);
      }
    }
    if (this.timedRaids && !this.underAttack) {
      this.raid.next -= dt;
      if (this.raid.next <= 0) this.startRaid();
    }
  }

  endAttack(g) {
    this.attackers = this.attackers.filter(o => o !== g);
    const survivors = g.regs.map(r => ({ key: r.T.key, name: r.name, count: r.soldiers.filter(s => s.alive).length })).filter(sp => sp.count > 0);
    if (!this.lost) this.event('The attackers are gone. The village breathes again.');
    g.onLeave?.(survivors);
  }

  ruin(t, g) {
    t.hp = 0;
    if (t === this.keep) {
      this.lost = true;
      this.event('The keep has fallen.', 1);
      if (this.onFall) this.onFall(); else this.battle.winner = 1;
      return;
    }
    t.state = 'ruined';
    t.status = 'Burned by raiders';
    if (g) g.burned++;
    for (const v of [...t.workers, ...t.builders]) this.release(v);
    // Whatever was kept there is carried off or lost in the fire.
    const lost = Object.values(t.store).reduce((n, k) => n + k, 0);
    t.store = {};
    this.stockCache = null;
    this.event(`Raiders burned the ${t.B.name.toLowerCase()}${lost >= 1 ? ` and took ${Math.floor(lost)} goods` : ''}!`, 1);
  }

  // Practice raids for the standalone village, from bandits who come out of nowhere.
  startRaid() {
    const w = ++this.raid.wave;
    this.raid.next = Math.max(150, 260 - w * 15);
    let men = 10 + w * 6;
    const specs = [];
    while (men > 0) { specs.push({ key: 'bandit', count: Math.min(20, men), name: 'Bandit band' }); men -= 20; }
    if (w >= 3) specs.push({ key: 'archer', count: 8 + w * 2, name: 'Bandit archers' });
    this.receiveAttack(specs, this.rand() * Math.PI * 2, { name: 'Bandits' });
  }

  // Attackers fight soldiers who come near; otherwise they make for the nearest building.
  thinkAttackers() {
    const b = this.battle;
    const defenders = b.regs.filter(r => r.side === 0 && !r.gone && !r.routing && !r.regrouping);
    const targets = [...this.buildings.filter(o => o.state !== 'ruined'), this.keep];
    for (const g of this.attackers) {
      for (const r of g.regs) {
        if (r.gone || r.routing || r.regrouping) continue;
        if (g.leaving) {
          // Back down the road and away; only men who are caught still fight.
          r.targetReg = null;
          r.dest = { x: g.entry.x, z: g.entry.z, angle: Math.atan2(g.entry.x - r.cx, g.entry.z - r.cz) };
          if (Math.hypot(g.entry.x - r.cx, g.entry.z - r.cz) < 20) b.disband(r);
          continue;
        }
        const near = defenders.filter(d => Math.hypot(d.cx - r.cx, d.cz - r.cz) < (r.T.range ? r.T.range : 45))
          .sort((p, q) => Math.hypot(p.cx - r.cx, p.cz - r.cz) - Math.hypot(q.cx - r.cx, q.cz - r.cz))[0];
        if (near) { if (r.targetReg !== near) b.orderAttack([r], near); continue; }
        if (r.targetReg) continue;
        if (!r.raidTarget || r.raidTarget.state === 'ruined' || r.raidTarget.removed) {
          // An assault goes for the keep; raiders for whatever is closest.
          r.raidTarget = g.mode === 'assault' ? this.keep
            : targets.sort((p, q) => Math.hypot(p.x - r.cx, p.z - r.cz) - Math.hypot(q.x - r.cx, q.z - r.cz))[0];
        }
        const t = r.raidTarget;
        const a = Math.atan2(t.x - r.cx, t.z - r.cz);
        const stand = t.B.radius + 4;
        const dx = t.x - Math.sin(a) * stand, dz = t.z - Math.cos(a) * stand;
        if (!r.dest || Math.hypot(r.dest.x - dx, r.dest.z - dz) > 3) r.dest = { x: dx, z: dz, angle: a };
      }
    }
  }

  // ---- troops coming and going on the world map ----

  // Regiments arriving by road march in from the edge. Levies bring their villagers.
  addTroops(specs, angle) {
    const entry = this.edgePoint(angle);
    const face = Math.atan2(-entry.x, -entry.z);
    for (const sp of specs) {
      const from = [];
      for (let i = 0; i < sp.count; i++) from.push({ x: entry.x + (this.rand() - 0.5) * 14, z: entry.z + (this.rand() - 0.5) * 14 });
      const r = this.battle.addRegiment(0, sp.key, entry.x, entry.z, face, { count: sp.count, name: sp.name, from });
      r.levy = sp.levy || null;
      r.retinue = !!sp.retinue;
      if (r.levy) {
        r.soldiers.forEach(s => {
          const v = this.addVillager(s.x, s.z);
          v.state = 'soldier'; v.soldier = s; s.villager = v;
        });
      }
      const stand = { x: Math.sin(angle) * 40, z: Math.cos(angle) * 40 };
      r.dest = { x: stand.x, z: stand.z, angle: Math.atan2(stand.x, stand.z) };
    }
  }

  // Regiments leaving for the world map. Levies take their villagers with them.
  takeTroops(regs) {
    const specs = [];
    for (const r of regs) {
      if (r.side !== 0 || r.gone || r.routing) continue;
      const men = r.soldiers.filter(s => s.alive && !s.gone);
      const gone = new Set(men.map(s => s.villager).filter(Boolean));
      this.villagers = this.villagers.filter(v => !gone.has(v));
      this.battle.disband(r);
      specs.push({ key: r.T.key, count: men.length, name: r.name, levy: r.levy || null, retinue: !!r.retinue });
    }
    return specs;
  }

  garrison() { return this.battle.regs.filter(r => r.side === 0 && !r.gone); }
}
