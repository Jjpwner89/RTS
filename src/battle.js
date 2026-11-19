// Battle simulation: regiments of individual soldiers, melee, arrows and morale;
// walls that soldiers stand on and attackers must breach; siege engines; captains.
// No rendering here; view.js and siegeview.js draw whatever this state holds.
import { rng } from './noise.js';
import { HALF, HOMES } from './terrain.js';
import { audio } from './audio.js';
import { Walls, toSegment } from './walls.js';
import { Nav } from './nav.js';

// role: what the unit is for, shown on its card. kit: goods each man needs to be raised
// (the Realm side decides where they come from). gold: the price per man for hired and
// household troops, who cost no villagers. engine: a siege engine worked by the regiment.
// look: the model to borrow until the unit has its own.
export const TYPES = {
  spear: { key: 'spear', name: 'Spearmen', role: 'Hold the line; stop horse from the front', count: 80, files: 20, spacing: 1.6, speed: 3.0, hp: 12, atk: 3, def: 5, dmg: 4, reach: 2.4, cooldown: 1.4, morale: 65, shield: true, vsMounted: 0.3, braces: true,
    kit: { spears: 1, shields: 1 } },
  sword: { key: 'sword', name: 'Swordsmen', role: 'Win the melee against other foot', count: 72, files: 18, spacing: 1.5, speed: 3.3, hp: 12, atk: 6, def: 3, dmg: 5, reach: 1.8, cooldown: 1.1, morale: 70, shield: true,
    kit: { swords: 1, shields: 1 } },
  archer: { key: 'archer', name: 'Archers', role: 'Loose fast at range; weak against armour', count: 60, files: 20, spacing: 1.7, speed: 3.3, hp: 8, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 50, range: 85, reload: 4.5, arrowDmg: 5,
    kit: { bows: 1, arrows: 10 } },
  crossbow: { key: 'crossbow', name: 'Crossbowmen', role: 'Slow, heavy bolts that punch through armour', count: 60, files: 20, spacing: 1.7, speed: 3.0, hp: 10, atk: 2, def: 3, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 55, range: 100, reload: 8, arrowDmg: 9, pierce: 0.7, look: 'archer',
    kit: { crossbows: 1, bolts: 10 } },
  lightcav: { key: 'lightcav', name: 'Light cavalry', role: 'Fast: flank, chase routers, hunt archers and engines', count: 40, files: 20, spacing: 2.4, depth: 3.2, speed: 9.5, hp: 14, atk: 4, def: 2, dmg: 4, reach: 2.3, cooldown: 1.2, morale: 60, mounted: true, charge: true, chargeMul: 1.5, look: 'cav',
    kit: { horses: 1, spears: 1 } },
  cav: { key: 'cav', name: 'Heavy cavalry', role: 'Charge into flanks and rear; avoid braced spears', count: 40, files: 20, spacing: 2.6, depth: 3.4, speed: 7.5, hp: 20, atk: 5, def: 4, dmg: 5, reach: 2.4, cooldown: 1.3, morale: 70, mounted: true, charge: true,
    kit: { horses: 1, mail: 1, swords: 1, shields: 1 } },
  maa: { key: 'maa', name: 'Men-at-arms', role: 'Armoured foot: storm walls, anchor the line', count: 60, files: 15, spacing: 1.5, speed: 2.8, hp: 18, atk: 6, def: 6, dmg: 6, reach: 2.0, cooldown: 1.3, morale: 85, shield: true, look: 'sword',
    kit: { mail: 1, swords: 1, shields: 1 } },
  knight: { key: 'knight', name: 'Knights', role: 'Elite: the charge that breaks armies', count: 24, files: 12, spacing: 2.6, depth: 3.4, speed: 7.0, hp: 30, atk: 8, def: 7, dmg: 7, reach: 2.5, cooldown: 1.2, morale: 95, mounted: true, charge: true, chargeMul: 2.5, shield: true, look: 'cav',
    kit: { horses: 1, armour: 1, lances: 1, swords: 1, shields: 1 } },
  // Villagers with spears and no armour: what a free village can turn out.
  militia: { key: 'militia', name: 'Militia', role: 'Cheap spears; break easily', count: 40, files: 14, spacing: 1.6, speed: 3.2, hp: 10, atk: 3, def: 3, dmg: 3.5, reach: 2.3, cooldown: 1.4, morale: 45, braces: true,
    kit: { spears: 1 } },
  bandit: { key: 'bandit', name: 'Bandits', role: 'Raiders', count: 20, files: 10, spacing: 1.7, speed: 3.5, hp: 10, atk: 4, def: 2, dmg: 4, reach: 1.9, cooldown: 1.2, morale: 40 },
  // Hired and household troops: paid in gold, no villagers. Mercenaries lose heart quickly when a fight goes badly.
  sellsword: { key: 'sellsword', name: 'Sellswords', role: 'Hired foot, good fighters, quick to quit', count: 60, files: 15, spacing: 1.5, speed: 3.3, hp: 14, atk: 6, def: 4, dmg: 5, reach: 1.9, cooldown: 1.1, morale: 60, shield: true, merc: true, gold: 6, look: 'sword' },
  hiredxbow: { key: 'hiredxbow', name: 'Hired crossbows', role: 'Hired crossbowmen behind big shields', count: 50, files: 17, spacing: 1.7, speed: 2.9, hp: 11, atk: 2, def: 4, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 50, range: 105, reload: 7.5, arrowDmg: 9, pierce: 0.7, shield: true, merc: true, gold: 8, look: 'crossbow' },
  household: { key: 'household', name: 'Household guard', role: "The lord's own men: steady and well armed", count: 30, files: 15, spacing: 1.5, speed: 3.2, hp: 16, atk: 7, def: 5, dmg: 6, reach: 1.9, cooldown: 1.1, morale: 95, shield: true, retinue: true, gold: 5, look: 'maa' },
  // Siege engines: the regiment is its crew; the engine goes where they push it.
  ladder: { key: 'ladder', name: 'Ladder men', role: 'Raise ladders against a wall, then climb', count: 12, files: 6, spacing: 1.7, speed: 2.9, hp: 9, atk: 3, def: 1, dmg: 3, reach: 1.8, cooldown: 1.3, morale: 45, look: 'militia',
    engine: { kind: 'ladder', per: 4, raise: 4 }, cost: { planks: 3 } },
  ram: { key: 'ram', name: 'Battering ram', role: 'Breaks gates; the roof keeps off arrows', count: 10, files: 2, spacing: 2.8, depth: 1.1, engineLen: 0.6, speed: 1.6, hp: 10, atk: 2, def: 2, dmg: 3, reach: 1.8, cooldown: 1.4, morale: 55, look: 'militia',
    engine: { kind: 'ram', hp: 700, dmg: 110, reload: 3.2, roof: 0.25 }, cost: { wood: 30, planks: 10, iron: 2 } },
  mangonel: { key: 'mangonel', name: 'Mangonel', role: 'Throws stones at walls, towers and packed men', count: 8, files: 4, spacing: 1.7, engineLen: 3.5, speed: 1.3, hp: 9, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.4, morale: 45, look: 'militia',
    engine: { kind: 'mangonel', hp: 320, range: 150, min: 25, reload: 9, dmg: 120, splash: 2.8, sdmg: 14, setup: 3, spread: 0.022 }, cost: { planks: 25, string: 6, iron: 2 } },
  trebuchet: { key: 'trebuchet', name: 'Trebuchet', role: 'Long range; smashes stone walls; must set up', count: 12, files: 4, spacing: 1.7, engineLen: 6, speed: 0.9, hp: 9, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.4, morale: 45, look: 'militia',
    engine: { kind: 'trebuchet', hp: 480, range: 250, min: 60, reload: 15, dmg: 340, splash: 3.6, sdmg: 20, setup: 12, spread: 0.014 }, cost: { wood: 40, planks: 40, string: 10, iron: 6 } },
};

// Which model each unit borrows until it has its own, in order of preference.
export function lookChain(key) {
  const chain = [key];
  let T = TYPES[key];
  if (key === 'captain') return ['captain', 'knight', 'cav'];
  while (T?.look && !chain.includes(T.look)) { chain.push(T.look); T = TYPES[T.look]; }
  return chain;
}

// Formations: spacing and depth multiply the unit's own; the rest change the fight.
export const FORMATIONS = {
  line: { name: 'Line', key: 'n', spacing: 1, depth: 1, speed: 1, def: 0, morale: 1 },
  tight: { name: 'Tight', key: 't', spacing: 0.78, depth: 0.85, speed: 0.85, def: 0.08, morale: 0.8, desc: 'Shoulder to shoulder: harder to break, slower, an easy target for arrows' },
  loose: { name: 'Loose', key: 'l', spacing: 1.75, depth: 1.5, speed: 1.1, def: -0.05, morale: 1.1, desc: 'Spread out: arrows and stones find fewer men' },
  wedge: { name: 'Wedge', key: 'v', spacing: 1, depth: 0.9, speed: 1, def: -0.03, morale: 1, charge: 1.35, desc: 'A point that drives into the enemy line: a stronger charge' },
  square: { name: 'Schiltron', key: 'x', spacing: 1.05, depth: 1, speed: 0.35, def: 0.04, morale: 0.75, desc: 'A ring facing out: no flanks to turn, spears braced all round' },
};

// Each side deploys this line; the scale setting stacks extra lines behind it.
const LAYOUT = [
  ['spear', -70, 0], ['maa', -35, 0], ['spear', 0, 0], ['sword', 35, 0], ['spear', 70, 0],
  ['archer', -30, -22], ['crossbow', 30, -22],
  ['cav', -120, -10], ['knight', 120, -10], ['lightcav', -165, -24], ['lightcav', 165, -24],
];

const CELL = 4, GSPAN = HALF + 60, GN = Math.ceil(GSPAN * 2 / CELL), COLUMN = 6, CLIMB = { tower: 2, gate: 2, ladder: 3.5 }, POUR_REACH = 3.9;
const ORDINAL = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const turnToward = (a, b, maxStep) => {
  const d = angleDiff(b, a);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
};
const live = s => s.alive && !s.gone;

// The ground's height, cached on a 1 m grid and blended between points: the terrain's
// own function is noise and costs too much to call for every soldier every step.
function cachedHeight(heightAt) {
  if (heightAt.cached) return heightAt;
  const SPAN = HALF + 60, N = SPAN * 2 + 1, grid = new Float32Array(N * N).fill(NaN);
  const at = (i, j) => {
    const k = j * N + i;
    let v = grid[k];
    if (v !== v) v = grid[k] = heightAt(i - SPAN, j - SPAN);
    return v;
  };
  const f = (x, z) => {
    const fx = x + SPAN, fz = z + SPAN;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return heightAt(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  f.cached = true;
  f.raw = heightAt;
  return f;
}

export const captainLevel = xp => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));

export class Battle {
  // homes: where each side's broken regiments run to. disbandAtHome: sides whose
  // routers leave the fight once they get there (raiders going back to camp).
  constructor(heightAt, seed, { scale = 1, deploy = true, homes = HOMES, disbandAtHome = [false, false] } = {}) {
    this.heightAt = cachedHeight(heightAt);
    this.rand = rng(seed + 99);
    this.time = 0;
    this.regs = [];
    this.soldiers = [];
    this.arrows = [];
    this.stones = [];
    this.gStart = new Int32Array(GN * GN + 1);
    this.gItems = [];
    this.winner = null;
    this.losses = [0, 0];
    this.events = [];          // short messages for the HUD, e.g. a regiment routing
    this.homes = homes;
    this.disbandAtHome = disbandAtHome;
    this.checkWinner = deploy;
    this.counts = [{}, {}];
    this.version = 0;          // bumped when prune() drops soldiers, so views rebuild
    this.walls = new Walls(heightAt);
    this.nav = new Nav(this.walls);
    this.walls.onBreak = s => this.onWallBreak(s);
    this.captains = [null, null];
    // Hooks for a town: structures() lists buildings engines can hit; onRuin(b) when one falls.
    this.structures = null;
    this.onRuin = null;
    this.buildingSide = 0;
    this.masons = 1;           // crews raising wall sites (a village sets this from its people)
    if (deploy) for (let side = 0; side < 2; side++) this.deploy(side, scale);
  }

  event(side, text) { this.events.push({ time: this.time, side, text }); }
  label(r) { return `${r.side ? 'Enemy ' : ''}${r.name}`; }

  // Side 0 (the player) deploys on +z facing -z; side 1 on -z facing +z.
  deploy(side, scale) {
    const dir = side === 0 ? -1 : 1;
    for (let line = 0; line < scale; line++) {
      for (const [key, x, back] of LAYOUT) {
        this.addRegiment(side, key, side === 0 ? -x : x, -dir * (70 - back + line * 50), side === 0 ? Math.PI : 0);
      }
    }
  }

  // A new regiment with its front centre at (x, z). `from` gives start positions,
  // e.g. the villagers who were just called up, who then walk into formation.
  // Counts can run well past the type's usual size; big regiments get a wider front.
  addRegiment(side, key, x, z, angle, { count, name, from } = {}) {
    const T = TYPES[key];
    count = Math.max(1, Math.round(count || T.count));
    const n = this.counts[side][key] = (this.counts[side][key] || 0) + 1;
    const files = count > T.count ? Math.min(count, Math.max(T.files, Math.round(Math.sqrt(count * T.files * T.files / T.count))))
      : Math.min(T.files, Math.max(T.engine ? 1 : 4, Math.ceil(count / 2)));
    const r = {
      id: this.regs.length, side, T, name: name || (T.engine ? `${T.name} ${n}` : `${ORDINAL(n)} ${T.name}`),
      x, z, angle, files, dest: null, targetReg: null, morale: T.morale, routing: false, routedAt: 0, rallied: false, regrouping: false,
      gone: false, disbanded: false, soldiers: [], initial: count, alive: count, engaged: 0, lag: 0,
      cx: x, cz: z, lastHit: -99, firingAt: null, fleeDir: 0,
      formation: 'line', hold: false, fireAtWill: true, chargeUntil: 0, column: false, via: null, viaCd: 0,
      posts: null, access: null, targetWall: null, captain: null, kills: 0,
      engine: T.engine ? { ...T.engine, hp: T.engine.hp || 0, maxHp: T.engine.hp || 0, cd: 2, ready: 0, ladders: [], raising: 0 } : null,
    };
    for (let i = 0; i < count; i++) {
      const s = this.makeSoldier(r, i, angle);
      const p = from?.[i] || this.slotPos(r, i);
      s.x = p.x + (this.rand() - 0.5) * 0.4;
      s.z = p.z + (this.rand() - 0.5) * 0.4;
      s.lx = s.x; s.lz = s.z;
      s.y = this.heightAt(s.x, s.z);
      r.soldiers.push(s);
      this.soldiers.push(s);
    }
    if (from) this.assignSlots(r);
    this.regs.push(r);
    return r;
  }

  makeSoldier(r, slot, angle) {
    const T = r.T;
    return {
      reg: r, slot, x: 0, z: 0, y: 0, yaw: angle, hp: T.hp, alive: true, gone: false,
      cd: this.rand() * T.cooldown, fireCd: this.rand() * (T.reload || 1), target: null, searchCd: this.rand() * 0.3,
      v: 0, vx: 0, vz: 0, phase: this.rand() * 6, fall: 0, lunge: 0, charged: false, idleFor: 0,
      jitter: (this.rand() - 0.5) * 0.5, level: 0, perch: null, climb: 0, via: null, viaCd: this.rand() * 0.4, lx: 0, lz: 0,
    };
  }

  // Send a regiment home: its living soldiers leave the battle. Returns where they stood.
  disband(r) {
    const left = [];
    for (const s of r.soldiers) {
      if (!live(s)) continue;
      left.push({ x: s.x, z: s.z });
      s.gone = true;
      s.target = null;
    }
    r.gone = true;
    r.disbanded = true;
    r.routing = r.regrouping = false;
    this.clearPosts(r);
    for (const o of this.regs) if (o.targetReg === r) o.targetReg = null;
    return left;
  }

  // A village's battle runs for the whole campaign. Men who left and bodies that have
  // lain a while are dropped so the lists stay short.
  prune() {
    const keep = this.soldiers.filter(s => !s.gone && (s.alive || this.time - s.diedAt < 90));
    if (keep.length === this.soldiers.length) return;
    this.soldiers = keep;
    this.version++;
  }

  // ---- formations ----

  // Where slot k stands, from the front centre (r.x, r.z); ranks stack behind it.
  // A schiltron is a ring around the anchor instead, each man facing out.
  slotPos(r, k) {
    const T = r.T, F = FORMATIONS[r.formation] || FORMATIONS.line;
    const sp = T.spacing * F.spacing, dp = (T.depth || T.spacing) * F.depth;
    let lx, lz, face = 0;
    if (r.formation === 'square' && !r.column) {
      const ring = this.ringSlot(r, k, sp);
      lx = ring.x; lz = ring.z; face = ring.a;
    } else if (r.formation === 'wedge' && !r.column) {
      const i = Math.floor(Math.sqrt(k)), j = k - i * i;
      lx = (j - i) * sp * 0.75; lz = -i * dp;
    } else {
      const files = Math.max(1, Math.min(r.column ? Math.min(r.files, COLUMN) : r.files, r.alive));
      const rank = Math.floor(k / files), f = k % files;
      const lastRank = Math.floor((r.alive - 1) / files);
      const inRank = rank === lastRank ? r.alive - rank * files : files;
      lx = (f - (inRank - 1) / 2) * sp;
      lz = -rank * dp;
    }
    lz -= T.engineLen || 0;
    const sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    return { x: r.x + cos * lx + sin * lz, z: r.z - sin * lx + cos * lz, face: r.angle + face };
  }

  // Concentric rings, outermost first, sized so three or four rings hold everyone.
  ringSlot(r, k, sp) {
    const n = r.alive;
    if (!r._rings || r._rings.n !== n || r._rings.sp !== sp) {
      let R = sp * 2, rings;
      for (;;) {
        rings = [];
        let total = 0;
        for (let rr = R; rr >= sp * 1.2 && rings.length < 4; rr -= sp) { const c = Math.floor(Math.PI * 2 * rr / sp); rings.push({ r: rr, c }); total += c; }
        if (total >= n) break;
        R += sp * 0.5;
      }
      r._rings = { n, sp, rings };
    }
    let i = k;
    for (const ring of r._rings.rings) {
      if (i < ring.c) {
        const a = i / ring.c * Math.PI * 2;
        return { x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r - ring.r, a };
      }
      i -= ring.c;
    }
    return { x: 0, z: 0, a: 0 };
  }

  // Frontmost soldiers take the front rank, so reforming never sends men across the block.
  assignSlots(r) {
    const list = r.soldiers.filter(s => live(s) && !s.captain);
    const sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    for (const s of list) {
      const dx = s.x - r.x, dz = s.z - r.z;
      s._f = dx * sin + dz * cos;
      s._l = dx * cos - dz * sin;
    }
    list.sort((a, b) => b._f - a._f);
    const files = Math.max(1, Math.min(r.column ? Math.min(r.files, COLUMN) : r.files, list.length));
    for (let i = 0; i < list.length; i += files) {
      const rank = list.slice(i, i + files).sort((a, b) => a._l - b._l);
      rank.forEach((s, j) => { s.slot = i + j; });
    }
    r.alive = list.length;
  }

  // ---- orders ----

  usable(r) { return !r.gone && !r.routing && !r.regrouping; }

  // The middle of a side's walls: where "inside" is. Usually its home, but a garrison
  // that flees out of the far side of its town has a home apart from its walls.
  fortHome(side) { return this.walls.centre[side] || this.homes[side]; }

  // Any new order takes a regiment off the walls and off whatever wall it was attacking.
  clearPosts(r) {
    if (r.posts) this.walls.release(r);
    r.posts = null;
    r.access = null;
    r.targetWall = null;
  }

  // Place the regiments side by side along a front line centred on (x, z), facing `angle`.
  orderMove(regs, x, z, angle, width = null) {
    regs = regs.filter(r => this.usable(r));
    if (!regs.length) return;
    for (const r of regs) this.clearPosts(r);
    const gap = 4;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    if (width) {
      const total = regs.reduce((n, r) => n + r.alive, 0);
      for (const r of regs) {
        const share = Math.max(4, (width - gap * (regs.length - 1)) * r.alive / total);
        r.files = Math.max(r.T.engine ? 1 : 4, Math.min(r.alive, Math.round(share / r.T.spacing) + 1));
      }
    }
    // Keep the regiments in their current left-to-right order relative to the new facing.
    regs.sort((a, b) => ((a.cx - x) * cos - (a.cz - z) * sin) - ((b.cx - x) * cos - (b.cz - z) * sin));
    const widths = regs.map(r => (Math.min(r.files, r.alive) - 1) * r.T.spacing + 2);
    const span = widths.reduce((a, b) => a + b, 0) + gap * (regs.length - 1);
    let lx = -span / 2;
    regs.forEach((r, i) => {
      const off = lx + widths[i] / 2;
      lx += widths[i] + gap;
      r.dest = { x: x + cos * off, z: z - sin * off, angle };
      r.targetReg = null;
      r.viaCd = 0;
      this.reform(r);
    });
  }

  // Slots are assigned against the destination so each soldier walks to the nearest place.
  reform(r) {
    const { x, z, angle } = r;
    if (r.dest) { r.x = r.dest.x; r.z = r.dest.z; r.angle = r.dest.angle; }
    this.assignSlots(r);
    r.x = x; r.z = z; r.angle = angle;
  }

  // The formation outline as it will stand at its destination, for previews.
  plannedSlots(regs, x, z, angle, width) {
    const saved = regs.map(r => ({ r, dest: r.dest, files: r.files, targetReg: r.targetReg, posts: r.posts, access: r.access, targetWall: r.targetWall, slots: r.soldiers.map(s => s.slot) }));
    const claims = regs.map(r => r.posts && r.posts.map(p => [p, p.perch.claims.get(p.i)]));
    // A preview must not give up anyone's posts, so stash them first.
    for (const r of regs) r.posts = null;
    this.orderMove(regs, x, z, angle, width);
    const plan = regs.filter(r => r.dest).map(r => ({ r, ...r.dest, files: r.files }));
    saved.forEach((s, i) => {
      Object.assign(s.r, { dest: s.dest, files: s.files, targetReg: s.targetReg, posts: s.posts, access: s.access, targetWall: s.targetWall });
      s.r.soldiers.forEach((o, j) => { o.slot = s.slots[j]; });
      if (claims[i]) for (const [p, owner] of claims[i]) p.perch.claims.set(p.i, owner);
    });
    return plan;
  }

  orderAttack(regs, target) {
    for (const r of regs) {
      if (!this.usable(r) || target.side === r.side) continue;
      this.clearPosts(r);
      r.targetReg = target;
      r.dest = null;
    }
  }

  orderHalt(regs) {
    for (const r of regs) {
      if (!this.usable(r) || r.posts) continue;
      r.dest = null;
      r.targetReg = null;
      r.targetWall = null;
      r.x = r.cx; r.z = r.cz;
      this.assignSlots(r);
    }
  }

  setFormation(regs, f) {
    for (const r of regs) {
      if (!this.usable(r) || r.T.engine || r.posts) continue;
      if (f === 'square' && r.T.mounted) continue;
      if (r.formation === f) continue;
      // A schiltron forms round the middle of the block; other shapes keep the front where it was.
      if (f === 'square') { r.x = r.cx; r.z = r.cz; if (r.dest) r.dest = { ...r.dest }; }
      else if (r.formation === 'square') { r.x = r.cx + Math.sin(r.angle) * 4; r.z = r.cz + Math.cos(r.angle) * 4; }
      r.formation = f;
      r._rings = null;
      this.assignSlots(r);
    }
  }

  setHold(regs, on) { for (const r of regs) r.hold = on; }
  setFireAtWill(regs, on) { for (const r of regs) r.fireAtWill = on; }

  // Charge: at the ordered target, or the nearest enemy ahead. Horse and foot both hit harder for it.
  orderCharge(regs) {
    for (const r of regs) {
      if (!this.usable(r) || r.T.engine || r.T.range) continue;
      let t = r.targetReg && !r.targetReg.gone ? r.targetReg : null;
      if (!t) {
        let bd = 90;
        for (const o of this.regs) {
          if (o.side === r.side || o.gone || o.routing) continue;
          const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
          const ahead = Math.abs(angleDiff(Math.atan2(o.cx - r.cx, o.cz - r.cz), r.angle)) < 1.2;
          if (ahead && d < bd) { bd = d; t = o; }
        }
      }
      if (!t) continue;
      this.orderAttack([r], t);
      r.chargeUntil = this.time + 10;
      for (const s of r.soldiers) s.charged = false;
    }
  }

  // ---- walls: manning, attacking, ladders ----

  // Send regiments onto a stretch of wall (their own, or an enemy's by their ladders).
  // Each soldier takes a post along the walkway, spreading out from where you clicked.
  orderMan(regs, struct, x, z) {
    const owner = struct.side, home = this.fortHome(owner);
    let start = struct;
    for (const r of regs) {
      if (!this.usable(r) || r.T.mounted || r.T.engine) continue;
      if (start.state !== 'up') continue;
      const access = this.accessUp(r.side, start).filter(a => this.nav.reachable(r.side, r.cx, r.cz, a.ground.x, a.ground.z));
      if (!access.length) { if (r.side === 0) this.event(0, owner === r.side ? 'No tower, gate or stair leads up to that wall.' : 'Raise ladders against that wall first.'); continue; }
      this.clearPosts(r);
      r.dest = null; r.targetReg = null;
      const men = r.soldiers.filter(s => live(s) && !s.captain).length;
      const posts = this.walls.claimPosts(r, start, x, z, men, home);
      if (!posts.length) continue;
      r.access = access;
      r.x = posts.reduce((n, p) => n + p.x, 0) / posts.length;
      r.z = posts.reduce((n, p) => n + p.z, 0) / posts.length;
      const out = posts[0].perch.kind === 'tower' ? { x: posts[0].x - home.x, z: posts[0].z - home.z } : this.walls.outward(posts[0].perch, home);
      r.angle = Math.atan2(out.x, out.z) + (owner === r.side ? 0 : Math.PI);
      // The nearest soldiers take the nearest posts.
      const list = r.soldiers.filter(s => live(s) && !s.captain);
      const order = posts.map((p, i) => i);
      list.sort((a, b) => Math.hypot(a.x - posts[0].x, a.z - posts[0].z) - Math.hypot(b.x - posts[0].x, b.z - posts[0].z));
      list.forEach((s, i) => { s.slot = order[i] ?? i; });
      r.alive = list.length;
      // Several regiments sent together fill the wall one after another.
      start = posts.at(-1).perch;
      x = posts.at(-1).x; z = posts.at(-1).z;
    }
  }

  // Ways up onto the wall network that contains `struct`, for one side:
  // its own towers and gates, and its own ladders.
  accessUp(side, struct) {
    const out = [];
    const net = this.network(struct);
    for (const s of net) {
      if (s.state !== 'up') continue;
      // Any tower's stairs, from inside; an enemy's only once you are in.
      if (s.kind === 'tower') out.push({ kind: 'tower', ground: this.towerFoot(s, side), top: { x: s.x, z: s.z, perch: s } });
      if (s.side === side && s.gate) out.push({ kind: 'gate', ground: { x: s.x, z: s.z }, top: { x: s.x, z: s.z, perch: s } });
    }
    for (const l of this.walls.ladders) if (l.side === side && net.has(l.piece)) out.push({ kind: 'ladder', ladder: l, ground: l.foot, top: { x: l.x, z: l.z, perch: l.piece } });
    return out;
  }

  // Ways down from the walls for a soldier of `side`: any tower (its stairs run inside),
  // its own gates, and its own ladders (back outside).
  accessDown(side, perch) {
    const out = [];
    const net = this.network(perch);
    for (const s of net) {
      if (s.state !== 'up') continue;
      if (s.kind === 'tower') out.push({ kind: 'tower', ground: this.towerFoot(s, side), top: { x: s.x, z: s.z, perch: s } });
      if (s.side === side && s.gate) out.push({ kind: 'gate', ground: { x: s.x, z: s.z }, top: { x: s.x, z: s.z, perch: s } });
    }
    for (const l of this.walls.ladders) if (l.side === side && net.has(l.piece)) out.push({ kind: 'ladder', ladder: l, ground: l.foot, top: { x: l.x, z: l.z, perch: l.piece } });
    return out;
  }

  // Where men step on and off a tower's stairs: at its inner foot, toward its owner's home.
  towerFoot(t, side) {
    const h = this.fortHome(t.side), dx = h.x - t.x, dz = h.z - t.z, d = Math.hypot(dx, dz) || 1;
    return { x: t.x + dx / d * (t.M.towerR + 2), z: t.z + dz / d * (t.M.towerR + 2) };
  }

  // Every standing piece and tower joined to this one along the walkway.
  network(struct) {
    if (struct._net && struct._netV === this.walls.version) return struct._net;
    const seen = new Set([struct]), q = [struct];
    while (q.length) {
      const s = q.pop();
      for (const o of this.walls.neighbours(s)) if (!seen.has(o) && o.state === 'up') { seen.add(o); q.push(o); }
    }
    for (const s of seen) { s._net = seen; s._netV = this.walls.version; }
    return seen;
  }

  // Attack a wall, gate, tower or building. Engines work it; ladder men raise ladders;
  // foot soldiers climb friendly ladders nearby, or hack at it (wood and gates give way, stone barely).
  orderAttackWall(regs, struct, x, z) {
    for (const r of regs) {
      if (!this.usable(r) || struct.side === r.side) continue;
      const E = r.engine;
      if (E?.kind === 'ladder' && !E.ladders.length) {
        if (!struct.wall || struct.kind !== 'piece' || struct.gate) { if (r.side === 0) this.event(0, 'Ladders go against a stretch of wall, not a gate or tower.'); continue; }
        this.clearPosts(r); r.dest = null; r.targetReg = null;
        r.targetWall = struct; r.wallPoint = { x, z };
        continue;
      }
      if (!E && struct.wall && struct.kind === 'piece' && !r.T.mounted) {
        const ladder = this.walls.ladders.find(l => l.side === r.side && this.network(l.piece).has(struct)
          && Math.hypot(l.x - x, l.z - z) < 60);
        if (ladder) { this.orderMan([r], ladder.piece, ladder.x, ladder.z); continue; }
      }
      this.clearPosts(r);
      r.dest = null; r.targetReg = null;
      r.targetWall = struct; r.wallPoint = { x, z };
      if (E) E.ready = 0;
    }
  }

  // A point on a structure's outer face for soldier k of n to stand and strike at.
  faceSpot(r, struct, k, n) {
    const home = this.fortHome(struct.side);
    if (struct.wall && struct.kind === 'piece') {
      const out = this.walls.outward(struct, home);
      const w = struct.gate ? 0.5 : 0.8;
      const t = n <= 1 ? 0.5 : 0.5 - w / 2 + w * (k % Math.max(1, Math.floor(struct.len / 1.2))) / Math.max(1, Math.floor(struct.len / 1.2) - 1);
      const rank = Math.floor(k / Math.max(1, Math.floor(struct.len / 1.2)));
      const off = struct.M.thick / 2 + 1 + rank * 1.2;
      return { x: struct.a.x + (struct.b.x - struct.a.x) * t + out.x * off, z: struct.a.z + (struct.b.z - struct.a.z) * t + out.z * off };
    }
    const R = struct.wall ? struct.M.towerR : struct.B.radius;
    const base = Math.atan2(r.cx - struct.x, r.cz - struct.z);
    const a = base + ((k % 12) - 5.5) * 0.18, rr = R + 1.2 + Math.floor(k / 12) * 1.2;
    return { x: struct.x + Math.sin(a) * rr, z: struct.z + Math.cos(a) * rr };
  }

  structGone(s) { return !s || s.removed || s.state === 'broken' || s.state === 'ruined' || (!s.wall && s.hp <= 0); }

  hitStructure(s, dmg, kind) {
    if (s.wall) return this.walls.damage(s, dmg, kind);
    // A town building: stone and rams knock it about; swords do little.
    if (s.state === 'ruined' || s.removed) return false;
    s.hp -= dmg * (kind === 'melee' ? 0.3 : 0.6);
    if (s.hp <= 0) { s.hp = 0; this.onRuin?.(s); return true; }
    return false;
  }

  onWallBreak(s) {
    const what = s.kind === 'tower' ? 'tower' : s.gate ? 'gate' : 'wall';
    this.event(s.side, `${s.side === 0 ? 'Our' : 'The enemy'} ${what} has been broken!`);
    audio.play('gate', s, this); // audio
    // Men on it come down with it.
    for (const o of this.soldiers) {
      if (!live(o) || o.perch !== s) continue;
      o.level = 0; o.perch = null; o.climb = 0; o.route = null;
      o.y = this.heightAt(o.x, o.z);
      this.hurt(o, 5);
    }
    // Regiments posted along it look for posts again, or stand down where they are.
    for (const r of this.regs) {
      if (!r.posts || !r.posts.some(p => p.perch === s)) continue;
      const keep = r.posts.find(p => p.perch !== s && p.perch.state === 'up');
      if (keep) this.orderMan([r], keep.perch, keep.x, keep.z);
      else { this.clearPosts(r); r.x = r.cx; r.z = r.cz; this.assignSlots(r); }
    }
  }

  // ---- captains ----

  // A named captain rides with one regiment (the army's own). Plain data, so armies can save it:
  // { name, level, xp, alive, battles }. He is one more soldier in that regiment, hard to kill.
  setCaptain(side, captain, reg) {
    if (!captain || !captain.alive || !reg || reg.gone) return null;
    const s = this.makeSoldier(reg, -1, reg.angle);
    s.captain = captain;
    s.look = 'captain';
    s.hp = 40 + captain.level * 4;
    s.x = reg.cx - Math.sin(reg.angle) * 6; s.z = reg.cz - Math.cos(reg.angle) * 6;
    s.lx = s.x; s.lz = s.z; s.y = this.heightAt(s.x, s.z);
    reg.soldiers.push(s);
    this.soldiers.push(s);
    reg.captain = captain;
    this.captains[side] = { captain, reg, soldier: s, startXp: captain.xp, died: false };
    return s;
  }

  // Morale and fighting help from a living captain within reach of a regiment.
  captainBonus(r) {
    const c = this.captains[r.side];
    if (!c || c.died || !c.captain.alive) return 0;
    const s = c.soldier;
    if (r === c.reg) return c.captain.level;
    return Math.hypot(s.x - r.cx, s.z - r.cz) < 50 ? c.captain.level * 0.5 : 0;
  }

  captainDied(c) {
    c.died = true;
    c.captain.alive = false;
    this.event(c.reg.side, `${c.reg.side ? 'The enemy captain' : 'Our captain'}, ${c.captain.name}, has fallen!`);
    for (const r of this.regs) if (r.side === c.reg.side && this.usable(r)) r.morale -= 12;
    for (const r of this.regs) if (r.side !== c.reg.side && this.usable(r)) r.morale = Math.min(r.T.morale + 10, r.morale + 6);
    c.reg.captain = null;
  }

  // What a battle did for a side's captain: xp from the enemies killed, more for a win.
  // Call once when the battle ends; it updates the captain object in place.
  captainReport(side) {
    const c = this.captains[side];
    if (!c) return null;
    const won = this.winner === side;
    const gained = c.died ? 0 : Math.round(this.losses[1 - side] * 0.5 + (won ? 40 : 10));
    const before = c.captain.level;
    if (!c.died) {
      c.captain.xp += gained;
      c.captain.level = captainLevel(c.captain.xp);
      c.captain.battles = (c.captain.battles || 0) + 1;
    }
    return { captain: c.captain, gained, died: c.died, levelled: c.captain.level > before };
  }

  // ---- simulation ----

  step(dt) {
    if (this.winner !== null) dt *= 0.3;
    this.time += dt;
    if (this.walls.sites) this.walls.build(dt, this.masons);
    this.nav.sync();
    this.buildGrid();
    for (const r of this.regs) this.updateRegiment(r, dt);
    for (const r of this.regs) { r.engaged = 0; r._lagSum = 0; r._lagN = 0; }
    for (const s of this.soldiers) if (live(s)) this.updateSoldier(s, dt);
    else if (!s.alive && s.fall < 1) s.fall = Math.min(1, s.fall + dt * 2.5);
    this.separate();
    if (this.walls.any) this.constrain();
    for (const r of this.regs) {
      r.lag = r._lagN ? r._lagSum / r._lagN : 0;
      this.updateMorale(r, dt);
      if (r.T.range) this.updateArchers(r, dt);
      if (r.engine && !r.gone) this.updateEngine(r, dt);
    }
    this.updateArrows(dt);
    this.updateStones(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      this.checkVictory();
      if (this.walls.any) this.wallsTick();
    }
  }

  // Soldiers sorted into 4 m cells (a counting sort into flat arrays), for finding who is near.
  buildGrid() {
    const start = this.gStart, list = this.soldiers;
    start.fill(0);
    const cells = this._cells && this._cells.length >= list.length ? this._cells : (this._cells = new Int32Array(list.length * 2 + 64));
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.alive || s.gone) { cells[i] = -1; continue; }
      const c = this.cell(s.x, s.z);
      cells[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < GN * GN; c++) start[c + 1] += start[c];
    const fill = this._fill && this._fill.length === start.length ? this._fill : (this._fill = new Int32Array(start.length));
    fill.set(start);
    const items = this.gItems;
    items.length = start[GN * GN];
    for (let i = 0; i < list.length; i++) if (cells[i] >= 0) items[fill[cells[i]]++] = list[i];
  }

  cell(x, z) {
    const cx = Math.max(0, Math.min(GN - 1, Math.floor((x + GSPAN) / CELL))), cz = Math.max(0, Math.min(GN - 1, Math.floor((z + GSPAN) / CELL)));
    return cz * GN + cx;
  }

  forNear(x, z, radius, fn) {
    const x0 = Math.max(0, Math.floor((x - radius + GSPAN) / CELL)), x1 = Math.min(GN - 1, Math.floor((x + radius + GSPAN) / CELL));
    const z0 = Math.max(0, Math.floor((z - radius + GSPAN) / CELL)), z1 = Math.min(GN - 1, Math.floor((z + radius + GSPAN) / CELL));
    const start = this.gStart, items = this.gItems;
    for (let cz = z0; cz <= z1; cz++) for (let c = cz * GN + x0, e = cz * GN + x1; c <= e; c++) {
      for (let i = start[c], n = start[c + 1]; i < n; i++) fn(items[i]);
    }
  }

  nearestEnemy(s, radius) {
    let best = null, bestD = radius * radius;
    this.forNear(s.x, s.z, radius, o => {
      if (o.reg.side === s.reg.side) return;
      const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2;
      if (d < bestD) { bestD = d; best = o; }
    });
    return best;
  }

  // Who a soldier can come to blows with. On the ground: men on the ground, with no wall between.
  // On the wall: men on the walkway, climbers on ladders, and anyone at the foot of the wall.
  findTarget(s, radius) {
    let best = null, bestD = radius * radius, low = null, lowD = POUR_REACH * POUR_REACH;
    const up = s.level === 1;
    this.forNear(s.x, s.z, radius, o => {
      if (o.reg.side === s.reg.side) return;
      const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2;
      if (up) {
        if (o.level === 1 && !o.climb) { if (d < bestD) { bestD = d; best = o; } }
        else if (d < lowD) { lowD = d; low = o; }
        return;
      }
      if (o.level === 1 || o.climb) return;
      if (d < bestD) { bestD = d; best = o; }
    });
    if (best && !up && this.nav.any && !this.nav.clear(s.reg.side, s.x, s.z, best.x, best.z)) best = null;
    return best || low;
  }

  updateRegiment(r, dt) {
    if (r.gone) return;
    let sx = 0, sz = 0, n = 0;
    for (const s of r.soldiers) if (live(s) && !s.captain) { sx += s.x; sz += s.z; n++; }
    if (n === 0) {
      r.gone = true; r.routing = false;
      this.clearPosts(r);
      for (const s of r.soldiers) if (s.captain && live(s)) { s.gone = true; }
      return;
    }
    r.cx = sx / n; r.cz = sz / n;
    if (r.routing) { r.alive = n; this.updateRout(r); return; }
    const T = r.T, F = FORMATIONS[r.formation] || FORMATIONS.line;
    if (r.posts) return;

    if (r.targetWall) this.aimAtWall(r, dt);
    else if (r.targetReg) {
      const t = r.targetReg;
      if (t.gone) { r.targetReg = null; r.x = r.cx; r.z = r.cz; this.assignSlots(r); }
      else {
        const dx = t.cx - r.cx, dz = t.cz - r.cz, d = Math.hypot(dx, dz) || 1;
        const ang = Math.atan2(dx, dz);
        const range = T.range || r.engine?.range;
        if (range && d <= range * 0.9 && d >= (r.engine?.min || 0)) r.dest = null;
        else if (range) r.dest = { x: t.cx - dx / d * range * 0.8, z: t.cz - dz / d * range * 0.8, angle: ang };
        else r.dest = { x: t.cx, z: t.cz, angle: ang };
        if (!r.dest) r.angle = turnToward(r.angle, ang, dt * 1.2);
      }
    }

    if (r.engaged > 0 && !T.range && !r.hold && !r.engine) {
      // Locked in melee: let the anchor settle where the fighting is.
      const k = Math.min(1, dt * 0.4);
      r.x += (r.cx - r.x) * k;
      r.z += (r.cz - r.z) * k;
    } else if (r.dest) {
      let tx = r.dest.x, tz = r.dest.z;
      // Round the walls: steer for the next point on the way, marching in a narrow column.
      if (this.nav.any) {
        r.viaCd -= dt;
        if (r.viaCd <= 0) {
          r.viaCd = 0.5;
          r.via = this.nav.steer(r.side, r.x, r.z, tx, tz);
          const col = !!r.via || (r.column && r.lag > 3);
          if (col !== r.column && !T.engine) { r.column = col; this.assignSlots(r); }
        }
        if (r.via) {
          tx = r.via.x; tz = r.via.z;
          if (Math.hypot(tx - r.x, tz - r.z) < 1.5) r.viaCd = 0;
        }
      }
      const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
      const left = Math.hypot(r.dest.x - r.x, r.dest.z - r.z);
      if (d > 0.4) {
        const want = left > 12 || r.via ? Math.atan2(dx, dz) : r.dest.angle;
        const turn = Math.abs(angleDiff(want, r.angle));
        r.angle = turnToward(r.angle, want, dt * (T.mounted ? 1.6 : T.engine ? 0.5 : 1.0));
        // Wheel before marching off, and wait for stragglers.
        const pace = T.speed * F.speed * (turn > 1.2 ? 0.25 : 1) * (r.lag > 4 ? 0.45 : 1)
          * (r.targetReg && left < 25 ? 1.35 : 1) * (this.time < r.chargeUntil ? 1.25 : 1) * (r.engine && !this.crewed(r) ? 0 : 1);
        const stepLen = Math.min(d, pace * dt);
        r.x += dx / d * stepLen;
        r.z += dz / d * stepLen;
      } else if (!r.via) {
        r.angle = turnToward(r.angle, r.dest.angle, dt * 1.2);
        if (!r.targetReg && !r.targetWall && Math.abs(angleDiff(r.angle, r.dest.angle)) < 0.01) {
          r.dest = null;
          if (r.column) { r.column = false; this.assignSlots(r); }
        }
      }
    }
  }

  // Engines (and soldiers attacking a structure) move up to it: rams and hackers to its face,
  // throwing engines to within range.
  aimAtWall(r, dt) {
    const s = r.targetWall, E = r.engine;
    if (this.structGone(s) || (E?.kind === 'ladder' && E.ladders.length)) { r.targetWall = null; r.dest = null; return; }
    const p = s.wall && s.kind === 'piece' ? (() => {
      const h = toSegment(r.wallPoint?.x ?? r.cx, r.wallPoint?.z ?? r.cz, s.a.x, s.a.z, s.b.x, s.b.z);
      const t = s.gate ? 0.5 : Math.max(0.2, Math.min(0.8, h.t));
      return { x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t };
    })() : { x: s.x, z: s.z };
    const dx = p.x - r.cx, dz = p.z - r.cz, d = Math.hypot(dx, dz) || 1, ang = Math.atan2(dx, dz);
    if (E && E.range) {
      if (d > E.range * 0.92) { r.dest = { x: p.x - dx / d * E.range * 0.82, z: p.z - dz / d * E.range * 0.82, angle: ang }; E.ready = 0; }
      else if (d < E.min) { r.dest = { x: p.x - dx / d * E.min * 1.4, z: p.z - dz / d * E.min * 1.4, angle: ang }; E.ready = 0; }
      else { r.dest = null; r.angle = turnToward(r.angle, ang, dt * 0.6); }
      return;
    }
    // Rams, ladders and foot go to the outer face.
    let fx = p.x, fz = p.z, face = ang;
    if (s.wall && s.kind === 'piece') {
      const out = this.walls.outward(s, this.fortHome(s.side));
      const off = s.M.thick / 2 + (E?.kind === 'ram' ? 0.6 : 2.2);
      fx = p.x + out.x * off; fz = p.z + out.z * off; face = Math.atan2(-out.x, -out.z);
    } else {
      const R = s.wall ? s.M.towerR : s.B.radius;
      fx = p.x - dx / d * (R + 1); fz = p.z - dz / d * (R + 1);
    }
    if (E?.kind === 'ram' || E?.kind === 'ladder') {
      if (Math.hypot(r.x - fx, r.z - fz) > 1.2) {
        if (!r.dest || Math.hypot(r.dest.x - fx, r.dest.z - fz) > 1) r.dest = { x: fx, z: fz, angle: face };
      } else { r.dest = null; r.angle = turnToward(r.angle, face, dt * 0.8); }
    } else if (Math.hypot(r.cx - fx, r.cz - fz) > 12) {
      if (!r.dest || Math.hypot(r.dest.x - fx, r.dest.z - fz) > 2) r.dest = { x: fx, z: fz, angle: face };
    } else r.dest = null;
  }

  // An engine works only while some of its crew are at it.
  crewed(r) {
    let n = 0;
    for (const s of r.soldiers) if (live(s) && Math.hypot(s.x - r.x, s.z - r.z) < 12) n++;
    return n >= Math.max(1, Math.ceil(r.initial * 0.25));
  }

  updateEngine(r, dt) {
    const E = r.engine;
    if (r.routing || r.regrouping) return;
    if (E.maxHp && E.hp <= 0) return;
    const crew = r.soldiers.filter(live).length;
    const work = Math.min(1, crew / (r.initial * 0.6));
    if (E.kind === 'ladder') {
      const s = r.targetWall;
      if (!s || E.ladders.length) return;
      if (!r.dest && Math.hypot(r.cx - r.x, r.cz - r.z) < 4 && !this.structGone(s)) {
        E.raising += dt * work;
        if (E.raising >= E.raise) this.raiseLadders(r, s);
      }
      return;
    }
    E.cd -= dt * work;
    const moving = !!r.dest;
    if (moving) { E.ready = 0; return; }
    E.ready += dt;
    if (E.kind === 'ram') {
      const s = r.targetWall;
      if (!s || this.structGone(s) || E.cd > 0) return;
      E.cd = E.reload;
      E.swing = this.time;
      audio.play('gate', s, this); // audio: the ram strikes
      if (this.hitStructure(s, E.dmg, 'ram')) { r.targetWall = null; this.event(r.side, `${this.label(r)} broke through!`); }
      return;
    }
    // Throwing engines: at the structure ordered, or at a regiment.
    if (E.ready < E.setup || E.cd > 0) return;
    let aim = null, struct = null;
    if (r.targetWall && !this.structGone(r.targetWall)) {
      struct = r.targetWall;
      aim = struct.wall && struct.kind === 'piece' ? (() => {
        const h = toSegment(r.wallPoint?.x ?? r.cx, r.wallPoint?.z ?? r.cz, struct.a.x, struct.a.z, struct.b.x, struct.b.z);
        const t = Math.max(0.15, Math.min(0.85, h.t));
        return { x: struct.a.x + (struct.b.x - struct.a.x) * t, z: struct.a.z + (struct.b.z - struct.a.z) * t };
      })() : { x: struct.x, z: struct.z };
    } else if (r.targetReg && !r.targetReg.gone) aim = { x: r.targetReg.cx, z: r.targetReg.cz };
    if (!aim) return;
    const d = Math.hypot(aim.x - r.x, aim.z - r.z);
    if (d > E.range * 1.05 || d < E.min * 0.9) return;
    E.cd = E.reload;
    E.swing = this.time;
    const spread = 1 + d * E.spread;
    const x1 = aim.x + (this.rand() - 0.5) * 2 * spread, z1 = aim.z + (this.rand() - 0.5) * 2 * spread;
    const y0 = this.heightAt(r.x, r.z) + (E.kind === 'trebuchet' ? 9 : 4);
    this.stones.push({ x0: r.x, y0, z0: r.z, x1, z1, y1: this.heightAt(x1, z1), t: 0, T: 1.6 + d / 55, h: 8 + d * 0.22, side: r.side, E, struct, kind: E.kind });
  }

  raiseLadders(r, s) {
    const E = r.engine, home = this.fortHome(s.side);
    const n = Math.max(1, Math.round(r.initial / E.per));
    const pt = r.wallPoint || { x: r.cx, z: r.cz };
    const h = toSegment(pt.x, pt.z, s.a.x, s.a.z, s.b.x, s.b.z);
    // Spread along this piece and the ones beside it.
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 3.5;
      let t = h.t + off / s.len, piece = s;
      if (t < 0.1 || t > 0.9) {
        const nb = this.walls.neighbours(s).find(o => o.kind === 'piece' && !o.gate && o.state === 'up' && (t < 0.1 ? (o.a === s.a || o.b === s.a) : (o.a === s.b || o.b === s.b)));
        if (!nb) continue;
        piece = nb;
        const x = s.a.x + (s.b.x - s.a.x) * t, z = s.a.z + (s.b.z - s.a.z) * t;
        const l = this.walls.raiseLadder(piece, x, z, r.side, home);
        if (l) { l.raisedAt = this.time; E.ladders.push(l); }
        continue;
      }
      const l = this.walls.raiseLadder(piece, s.a.x + (s.b.x - s.a.x) * t, s.a.z + (s.b.z - s.a.z) * t, r.side, home);
      if (l) { l.raisedAt = this.time; E.ladders.push(l); }
    }
    r.targetWall = null;
    r.dest = null;
    this.event(r.side, `${this.label(r)} have raised ${E.ladders.length} ladder${E.ladders.length === 1 ? '' : 's'}!`);
    // Then up they go themselves.
    if (E.ladders.length) this.orderMan([r], E.ladders[0].piece, E.ladders[0].x, E.ladders[0].z);
  }

  updateStones(dt) {
    let w = 0;
    for (const st of this.stones) {
      st.t += dt;
      if (st.t < st.T) { this.stones[w++] = st; continue; }
      const E = st.E;
      // Walls and towers in the way take the blow; a miss lands among whoever is there.
      const hitWall = this.walls.structureAt(st.x1, st.z1, 1 - st.side);
      if (hitWall) this.hitStructure(hitWall, E.dmg, 'stone');
      else if (this.structures) {
        for (const b of this.structures()) {
          if (b.state === 'ruined' || b.removed || (b.side ?? this.buildingSide) === st.side) continue;
          if (Math.hypot(b.x - st.x1, b.z - st.z1) < (b.B?.radius || 4) + 1) { this.hitStructure(b, E.dmg, 'stone'); break; }
        }
      }
      this.forNear(st.x1, st.z1, E.splash, o => {
        const d = Math.hypot(o.x - st.x1, o.z - st.z1);
        if (d > E.splash) return;
        this.hurt(o, E.sdmg * (1 - d / E.splash * 0.6));
        o.reg.morale -= 0.6;
        o.reg.lastHit = this.time;
        if (o.reg.engine?.maxHp && d < 3) o.reg.engine.hp -= E.dmg * 0.4;
      });
      this.impacts = this.impacts || [];
      this.impacts.push({ x: st.x1, z: st.z1, time: this.time, big: E.kind === 'trebuchet' });
      if (this.impacts.length > 40) this.impacts.shift();
      audio.play('stone', { x: st.x1, z: st.z1 }, this); // audio
    }
    this.stones.length = w;
    for (const r of this.regs) {
      const E = r.engine;
      if (E?.maxHp && E.hp <= 0 && !E.wrecked) {
        E.wrecked = true;
        r.targetWall = null; r.dest = null;
        this.event(r.side, `${this.label(r)} has been wrecked!`);
        this.startRout(r);
      }
    }
  }

  // Once a second: ladders pushed down, gates forced from inside, the walls' own business.
  wallsTick() {
    const W = this.walls;
    for (const l of [...W.ladders]) {
      if (l.piece.state !== 'up') { W.pushDown(l); continue; }
      let def = 0, att = 0, climbing = 0;
      this.forNear(l.x, l.z, 4, o => {
        if (Math.hypot(o.x - l.x, o.z - l.z) > 3.5) return;
        if (o.level === 1 && o.reg.side !== l.side) def++;
        if (o.level === 1 && o.reg.side === l.side) att++;
      });
      for (const o of this.soldiers) if (o.climbVia === l && o.climb > 0) climbing++;
      // Defenders shove an unheld ladder away from the wall.
      if (def > 0 && att === 0 && this.time - l.raisedAt > 3 && this.rand() < Math.min(0.5, 0.1 * def) * (climbing ? 0.5 : 1)) {
        W.pushDown(l);
        this.event(l.piece.side, `${l.piece.side === 0 ? 'Our men' : 'The defenders'} pushed a ladder off the wall!`);
        for (const o of this.soldiers) if (o.climbVia === l && o.climb > 0) this.fallFrom(o, 7);
      }
    }
    // A gate is thrown open when attackers stand inside it and no defender is near.
    for (const p of W.pieces) {
      if (!p.gate || p.state !== 'up') continue;
      const home = this.fortHome(p.side), out = W.outward(p, home);
      let inside = 0, owners = 0;
      this.forNear(p.x, p.z, 12, o => {
        if (o.level !== 0 || Math.hypot(o.x - p.x, o.z - p.z) > 12) return;
        if (o.reg.side === p.side) owners++;
        else if ((o.x - p.x) * out.x + (o.z - p.z) * out.z < -1) inside++;
      });
      if (!p.forced && inside >= 3 && owners === 0) {
        p.forcing = (p.forcing || 0) + 1;
        if (p.forcing >= 4) { p.forced = true; p.forcing = 0; W.changed(); this.event(p.side, p.side === 0 ? 'The enemy has thrown our gate open!' : 'Our men have thrown the gate open!'); }
      } else if (p.forced && owners >= 3 && inside === 0) {
        p.forcing = (p.forcing || 0) + 1;
        if (p.forcing >= 5) { p.forced = false; p.forcing = 0; W.changed(); this.event(p.side, p.side === 0 ? 'We have shut the gate again.' : 'The enemy has shut the gate again.'); }
      } else p.forcing = 0;
    }
  }

  fallFrom(s, dmg) {
    s.climb = 0; s.climbVia = null; s.level = 0; s.perch = null; s.route = null;
    if (s.climbFrom) { s.x = s.climbFrom.x; s.z = s.climbFrom.z; }
    s.y = this.heightAt(s.x, s.z);
    this.hurt(s, dmg);
  }

  // Where this soldier is trying to be, when not fighting: { x, z, perch } (perch null: the ground).
  goalOf(s) {
    const r = s.reg;
    if (s.captain) {
      // The captain rides just behind his regiment's middle.
      const d = r.posts ? 10 : (Math.ceil(r.alive / Math.max(1, r.files)) * (r.T.depth || r.T.spacing)) / 2 + 4;
      return { x: r.cx - Math.sin(r.angle) * d, z: r.cz - Math.cos(r.angle) * d, perch: null };
    }
    if (r.posts) {
      const p = r.posts[s.slot];
      if (p && p.perch.state === 'up') return p;
      const a = r.access?.[0];
      return a ? { x: a.ground.x + s.jitter * 6, z: a.ground.z - s.jitter * 6, perch: null } : { x: s.x, z: s.z, perch: null };
    }
    if (r.targetWall && !r.engine && !this.structGone(r.targetWall)) {
      const p = this.faceSpot(r, r.targetWall, s.slot, r.alive);
      return { x: p.x, z: p.z, perch: null, strike: r.targetWall };
    }
    const p = this.slotPos(r, s.slot);
    return { x: p.x, z: p.z, perch: null, face: p.face };
  }

  updateSoldier(s, dt) {
    const r = s.reg, T = r.T;
    s.lunge = Math.max(0, s.lunge - dt * 3);
    s.cd -= dt;
    const px = s.x, pz = s.z;
    s.lx = px; s.lz = pz;

    if (s.climb > 0) this.climbStep(s, dt);
    else if (r.routing) {
      s.target = null;
      if (this.walls.any) {
        const h = this.homes[r.side];
        this.travel(s, { x: h.x + s.jitter * 20, z: h.z, perch: null }, T.speed * 1.3, dt);
      } else {
        const dir = r.fleeDir + s.jitter;
        s.x += Math.sin(dir) * T.speed * 1.3 * dt;
        s.z += Math.cos(dir) * T.speed * 1.3 * dt;
        s.yaw = turnToward(s.yaw, dir, dt * 6);
      }
      s.x = Math.max(-HALF, Math.min(HALF, s.x));
      s.z = Math.max(-HALF, Math.min(HALF, s.z));
    } else {
      s.searchCd -= dt;
      // Men holding their ground only fight whoever reaches them.
      const engageR = T.range ? 2.5 : r.hold || r.posts ? (s.level === 1 ? 3 : 2.8) : r.targetReg ? 9 : 4.5;
      if (s.target && (!live(s.target) || (s.target.x - s.x) ** 2 + (s.target.z - s.z) ** 2 > (engageR + 2) ** 2
        || (s.level === 0 && (s.target.level === 1 || s.target.climb)))) s.target = null;
      if (s.searchCd <= 0) {
        s.searchCd = 0.25 + this.rand() * 0.15;
        const near = this.findTarget(s, Math.max(engageR, s.level === 1 ? POUR_REACH : 0));
        if (near) s.target = near;
        else if (s.target && s.level === 1 && s.target.level !== 1) s.target = null;
      }
      if (s.target) {
        r.engaged++;
        s.idleFor = 0;
        const t = s.target, dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz);
        const below = s.level === 1 && (t.level !== 1 || t.climb > 0);
        const reach = below ? POUR_REACH : T.reach;
        const charging = (T.charge && !s.charged) || this.time < r.chargeUntil;
        if (!below && d > T.reach * 0.85) {
          const sp = T.speed * (charging ? 1.5 : 1.15);
          if (s.level === 1) { this.moveToward(s, t.x, t.z, sp, dt); this.keepOnWall(s); }
          else this.groundMove(s, t.x, t.z, sp, dt);
        }
        s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt * 8);
        if (d <= reach && s.cd <= 0) {
          s.cd = T.cooldown * (0.8 + this.rand() * 0.4);
          this.strike(s, t);
        }
      } else {
        s.idleFor += dt;
        if (s.idleFor > 3) s.charged = false;
        const goal = this.goalOf(s);
        const d = Math.hypot(goal.x - s.x, goal.z - s.z);
        const onGoal = (goal.perch || null) === (s.perch || null) || (goal.perch && s.level === 1 && s.perch === goal.perch);
        if (onGoal) { r._lagSum += d; r._lagN++; }
        else { r._lagSum += 6; r._lagN++; }
        if (!onGoal || d > 0.15) this.travel(s, goal, T.speed * (d > 2 || !onGoal ? 1.35 : 1.08) * (FORMATIONS[r.formation]?.speed || 1), dt);
        if (onGoal && d < 0.8) {
          const face = goal.face ?? (r.posts ? r.angle : r.angle);
          s.yaw = turnToward(s.yaw, face, dt * 4);
        }
        // Men at a wall's face hack at it.
        if (goal.strike && d < 1.6 && s.cd <= 0) {
          s.cd = T.cooldown * (0.8 + this.rand() * 0.4);
          s.lunge = 1;
          s.yaw = turnToward(s.yaw, Math.atan2(goal.strike.x - s.x, goal.strike.z - s.z), 1);
          if (this.hitStructure(goal.strike, T.dmg, 'melee')) { r.targetWall = null; this.event(r.side, `${this.label(r)} broke through!`); }
          r.engaged++;
        }
      }
    }
    s.vx = (s.x - px) / dt; s.vz = (s.z - pz) / dt;
    s.v = Math.hypot(s.vx, s.vz);
    if (s.climb <= 0) s.y = s.level === 1 ? this.walls.walkY(s.perch, s.x, s.z) : this.heightAt(s.x, s.z);
    s.phase += s.v * dt * 2.2;
  }

  // Getting somewhere, on the ground or along the walls, climbing up or down on the way.
  travel(s, goal, speed, dt) {
    const want = goal.perch || null;
    if (s.level === 0) {
      if (!want) { this.groundMove(s, goal.x, goal.z, speed, dt); return; }
      // Up onto the wall: the best way up for this goal.
      const a = this.pickAccess(s, s.reg.access && s.reg.posts ? s.reg.access : this.accessUp(s.reg.side, want), goal);
      if (!a) return;
      const d = Math.hypot(a.ground.x - s.x, a.ground.z - s.z);
      if (d > 1.4) { this.groundMove(s, a.ground.x, a.ground.z, speed, dt); return; }
      this.startClimb(s, a, true);
      return;
    }
    // On the wall.
    if (want) {
      if (s.routeGoal !== goal || s.routeV !== this.walls.version) {
        s.route = this.walls.route(s.perch, s.x, s.z, want, goal.x, goal.z);
        s.routeGoal = goal; s.routeV = this.walls.version;
      }
      this.walkRoute(s, speed, dt);
      return;
    }
    // Down to the ground: the nearest way down that leads toward the goal.
    if (!s.down || !s.downGoal || Math.hypot(s.downGoal.x - goal.x, s.downGoal.z - goal.z) > 6 || s.downV !== this.walls.version || this.time > s.downAt + 4) {
      const list = this.accessDown(s.reg.side, s.perch);
      let best = null, bs = Infinity;
      for (const a of list) {
        const sc = Math.hypot(a.top.x - s.x, a.top.z - s.z) + Math.hypot(a.ground.x - goal.x, a.ground.z - goal.z)
          + (this.nav.reachable(s.reg.side, a.ground.x, a.ground.z, goal.x, goal.z) ? 0 : 1000);
        if (sc < bs) { bs = sc; best = a; }
      }
      s.down = best; s.downGoal = goal; s.downV = this.walls.version; s.downAt = this.time;
      s.route = best ? this.walls.route(s.perch, s.x, s.z, best.top.perch, best.top.x, best.top.z) : null;
      s.routeGoal = null;
    }
    const a = s.down;
    if (!a) return;
    if (Math.hypot(a.top.x - s.x, a.top.z - s.z) < 0.9) { this.startClimb(s, a, false); return; }
    this.walkRoute(s, speed, dt);
  }

  pickAccess(s, list, goal) {
    let best = null, bs = Infinity;
    for (const a of list) {
      if (a.ladder && (a.ladder.down || !this.walls.ladders.includes(a.ladder))) continue;
      const sc = Math.hypot(a.ground.x - s.x, a.ground.z - s.z) + Math.hypot(a.top.x - goal.x, a.top.z - goal.z) * 0.6;
      if (sc < bs) { bs = sc; best = a; }
    }
    return best;
  }

  startClimb(s, a, up) {
    const W = this.walls;
    const time = CLIMB[a.kind] * (up ? 1 : 0.7);
    const top = { x: a.top.x, z: a.top.z, y: W.walkY(a.top.perch, a.top.x, a.top.z), perch: a.top.perch };
    const ground = { x: a.ground.x, z: a.ground.z, y: this.heightAt(a.ground.x, a.ground.z) };
    s.climbFrom = up ? ground : top;
    s.climbTo = up ? top : ground;
    s.climbUp = up;
    s.climbDur = time;
    s.climb = time;
    s.climbVia = a.ladder || null;
    s.target = null;
    s.down = null;
  }

  climbStep(s, dt) {
    if (s.climbVia && (s.climbVia.down || !this.walls.ladders.includes(s.climbVia))) { this.fallFrom(s, 6); return; }
    const to = s.climbTo, from = s.climbFrom;
    if (to.perch && to.perch.state !== 'up') { this.fallFrom(s, 4); return; }
    s.climb -= dt;
    const k = 1 - Math.max(0, s.climb) / s.climbDur;
    s.x = from.x + (to.x - from.x) * k; s.z = from.z + (to.z - from.z) * k;
    s.y = from.y + (to.y - from.y) * k;
    s.yaw = Math.atan2(to.x - from.x, to.z - from.z) || s.yaw;
    if (s.climb > 0) return;
    s.climb = 0; s.climbVia = null;
    s.level = s.climbUp ? 1 : 0;
    s.perch = s.climbUp ? to.perch : null;
    s.route = null; s.routeGoal = null; s.via = null; s.viaCd = 0;
  }

  walkRoute(s, speed, dt) {
    const route = s.route;
    if (!route || !route.length) return;
    const p = route[0];
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < 0.35 && route.length > 1) { s.perch = p.perch; route.shift(); return; }
    if (route.length === 1 && d < 0.4) s.perch = p.perch;
    this.moveToward(s, p.x, p.z, speed, dt);
    if (d < 1.2) s.perch = p.perch;
  }

  // On the ground, round the walls when they are in the way.
  groundMove(s, tx, tz, speed, dt) {
    if (this.nav.any) {
      s.viaCd -= dt;
      if (s.viaCd <= 0 || (s.via && Math.hypot(s.via.x - s.x, s.via.z - s.z) < 0.8)) {
        s.viaCd = 0.35 + this.rand() * 0.25;
        s.via = this.nav.steer(s.reg.side, s.x, s.z, tx, tz);
      }
      if (s.via) { tx = s.via.x; tz = s.via.z; }
    }
    this.moveToward(s, tx, tz, speed, dt);
  }

  // For anyone walking about who is not a soldier (villagers): the point to head for next on
  // the way to (tx, tz), round the walls. Remembers its choice on the walker for a moment.
  steerWalker(w, side, tx, tz, dt) {
    if (!this.nav.any) return { x: tx, z: tz };
    w.navCd = (w.navCd || 0) - dt;
    if (w.navCd <= 0 || (w.navVia && Math.hypot(w.navVia.x - w.x, w.navVia.z - w.z) < 0.8)) {
      w.navCd = 0.5;
      w.navVia = this.nav.steer(side, w.x, w.z, tx, tz);
    }
    return w.navVia || { x: tx, z: tz };
  }

  // A soldier on the wall stays on its walkway; stepping off the end of a piece takes him onto the next.
  keepOnWall(s) {
    if (!s.perch) return;
    const W = this.walls;
    let best = s.perch, p = W.clampTo(s.perch, s.x, s.z), bd = Math.hypot(p.x - s.x, p.z - s.z);
    if (bd > 0.05) {
      for (const o of W.neighbours(s.perch)) {
        if (o.state !== 'up') continue;
        const q = W.clampTo(o, s.x, s.z), d = Math.hypot(q.x - s.x, q.z - s.z);
        if (d < bd) { bd = d; best = o; p = q; }
      }
    }
    s.perch = best;
    s.x = p.x; s.z = p.z;
  }

  moveToward(s, tx, tz, speed, dt) {
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const stepLen = Math.min(d, speed * dt);
    s.x += dx / d * stepLen;
    s.z += dz / d * stepLen;
    if (d > 0.3) s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt * 6);
  }

  // Soldiers keep a little room; friend and foe alike, so battle lines press rather than merge.
  // Men on the wall only jostle men on the wall.
  separate() {
    const start = this.gStart, items = this.gItems;
    for (const s of this.soldiers) {
      if (!live(s) || s.climb > 0) continue;
      const sm = s.reg.T.mounted, rs = sm ? 1.1 : 0.55, lvl = s.level;
      const x0 = Math.max(0, Math.floor((s.x - 2.4 + GSPAN) / CELL)), x1 = Math.min(GN - 1, Math.floor((s.x + 2.4 + GSPAN) / CELL));
      const z0 = Math.max(0, Math.floor((s.z - 2.4 + GSPAN) / CELL)), z1 = Math.min(GN - 1, Math.floor((s.z + 2.4 + GSPAN) / CELL));
      for (let cz = z0; cz <= z1; cz++) for (let c = cz * GN + x0, e = cz * GN + x1; c <= e; c++) {
        for (let i = start[c], n = start[c + 1]; i < n; i++) {
          const o = items[i];
          if (o === s || o.level !== lvl || o.climb > 0) continue;
          const om = o.reg.T.mounted, min = rs + (om ? 1.1 : 0.55);
          const dx = s.x - o.x, dz = s.z - o.z, d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2), push = (min - d) * (lvl === 1 ? 0.15 : 0.25);
          // Horses shove infantry aside more than the other way round.
          const w = sm && !om ? 0.3 : !sm && om ? 1.7 : 1;
          s.x += dx / d * push * w;
          s.z += dz / d * push * w;
        }
      }
    }
  }

  // Nobody walks through a wall; men on the walkway stay on it.
  constrain() {
    const nav = this.nav;
    for (const s of this.soldiers) {
      if (!live(s) || s.climb > 0) continue;
      if (s.level === 1) { this.keepOnWall(s); s.y = this.walls.walkY(s.perch, s.x, s.z); continue; }
      const side = s.reg.side;
      if (nav.blockedAt(side, s.x, s.z) && !nav.blockedAt(side, s.lx, s.lz)) {
        // Slide along the wall rather than stop dead.
        if (!nav.blockedAt(side, s.x, s.lz)) s.z = s.lz;
        else if (!nav.blockedAt(side, s.lx, s.z)) s.x = s.lx;
        else { s.x = s.lx; s.z = s.lz; }
      }
    }
  }

  // Which way the blow lands on the target's formation: 0 front, 1 flank, 2 rear.
  // A schiltron and men on a wall have no flanks to turn.
  flankOf(attX, attZ, t) {
    if (t.reg.formation === 'square' || t.level === 1) return 0;
    const rel = Math.abs(angleDiff(Math.atan2(attX - t.x, attZ - t.z), t.reg.angle));
    return rel > 2.2 ? 2 : rel > 1.1 ? 1 : 0;
  }

  strike(s, t) {
    const A = s.reg.T, D = t.reg.T, tr = t.reg, ar = s.reg;
    const FA = FORMATIONS[ar.formation] || FORMATIONS.line, FD = FORMATIONS[tr.formation] || FORMATIONS.line;
    s.lunge = 1;
    let flank = tr.routing ? 0 : this.flankOf(s.x, s.z, t);
    let chance = 0.42 + (A.atk - D.def) * 0.05 - FD.def + this.captainBonus(ar) * 0.015;
    if (tr.routing) chance += 0.35;
    chance += [0, 0.15, 0.3][flank];
    if (D.mounted && A.vsMounted) chance += A.vsMounted;
    if (D.shield && flank === 0) chance -= 0.05;
    // From the walkway, men strike down at climbers and those at the foot of the wall.
    if (s.level === 1 && (t.level !== 1 || t.climb > 0)) chance += 0.25;
    if (t.climb > 0) chance += 0.15;
    let dmg = A.dmg;
    const braced = (D.braces && (flank === 0 || tr.formation === 'square')) && !tr.routing;
    if (A.charge && !s.charged && s.v > A.speed * 0.7) {
      s.charged = true;
      if (braced) {
        chance -= 0.1;
        this.hurt(s, 4);                       // riding onto braced spears
      } else {
        const mul = (A.chargeMul || 2) * (FA.charge || 1);
        chance += 0.35;
        dmg *= mul;
        tr.morale -= 0.8 * (FA.charge || 1);
        const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz) || 1;
        t.x += dx / d * 1.5; t.z += dz / d * 1.5;
      }
    } else if (!A.charge && this.time < ar.chargeUntil && !s.charged) {
      // Foot charging in: one hard first blow.
      s.charged = true;
      chance += 0.15;
      dmg *= 1.5 * (FA.charge || 1);
      tr.morale -= 0.3;
    }
    if (this.rand() < Math.max(0.05, Math.min(0.95, chance))) {
      tr.lastHit = this.time;
      tr.morale -= [0, 0.3, 0.6][flank] * FD.morale;
      audio.play('clash', s, this); // audio
      // Hacking at an engine's crew wrecks the engine too.
      if (tr.engine?.maxHp) tr.engine.hp -= dmg * 2;
      this.hurt(t, dmg, ar);
    }
  }

  hurt(t, dmg, by = null) {
    if (!t.alive) return;
    t.hp -= dmg;
    if (t.hp <= 0) this.kill(t, by);
  }

  kill(t, by = null) {
    const r = t.reg;
    t.alive = false;
    t.diedAt = this.time;
    t.fall = 0.001;
    t.target = null;
    if (t.captain) {
      const c = this.captains[r.side];
      if (c && c.soldier === t) this.captainDied(c);
      return;
    }
    this.losses[r.side]++;
    if (by) by.kills++;
    const F = FORMATIONS[r.formation] || FORMATIONS.line;
    r.morale -= 60 / r.initial * F.morale * (1 - Math.min(0.3, this.captainBonus(r) * 0.03));
    if (!r.routing) {
      // The rearmost man steps forward into the gap.
      let back = null;
      for (const o of r.soldiers) if (live(o) && !o.captain && o.slot > t.slot && (!back || o.slot > back.slot)) back = o;
      if (back) back.slot = t.slot;
    }
    r.alive--;
  }

  updateMorale(r, dt) {
    if (r.gone || r.routing) return;
    const T = r.T;
    const top = T.morale + this.captainBonus(r) * 2;
    if (r.regrouping) {
      r.morale += 3 * dt;
      if (r.morale >= T.morale * 0.6) {
        r.regrouping = false;
        this.event(r.side, `${this.label(r)} have regrouped at the keep.`);
      }
      return;
    }
    if (r.engaged > 0 && r.alive < r.initial * 0.5) r.morale -= 1.2 * dt * (T.merc ? 1.6 : 1);
    if (T.merc && r.alive < r.initial * 0.6) r.morale -= 0.4 * dt;
    // Men on their own walls take heart from them.
    const walled = r.posts && r.posts[0]?.perch.side === r.side;
    if (r.engaged === 0 && this.time - r.lastHit > 4) r.morale = Math.min(top, r.morale + 2 * dt);
    else if (walled) r.morale = Math.min(top, r.morale + 0.5 * dt);
    if (r.morale <= 0) this.startRout(r);
  }

  startRout(r) {
    r.routing = true;
    r.routedAt = this.time;
    r.dest = null;
    r.targetReg = null;
    r.morale = 0;
    this.clearPosts(r);
    if (r.column) { r.column = false; }
    for (const s of r.soldiers) { s.target = null; s.down = null; }
    this.event(r.side, `${this.label(r)} are routing!`);
    audio.play('rout', { x: r.cx, z: r.cz }, this); // audio
    for (const o of this.regs) {
      if (o === r || o.gone || o.routing) continue;
      const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
      if (o.side === r.side && d < 50) o.morale -= 8 * (FORMATIONS[o.formation]?.morale || 1);
      if (o.side !== r.side && d < 60) o.morale = Math.min(o.T.morale + 10, o.morale + 5);
    }
    for (const o of this.regs) if (o.targetReg === r && o.T.range) o.targetReg = null;
    this.updateRout(r);
  }

  updateRout(r) {
    // Run for the keep, swerving away from any enemy close behind.
    let nearest = null, nd = Infinity;
    for (const o of this.regs) {
      if (o.side === r.side || o.gone || o.routing) continue;
      const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
      if (d < nd) { nd = d; nearest = o; }
    }
    const h = this.homes[r.side];
    const home = Math.atan2(h.x - r.cx, h.z - r.cz);
    let dir = home;
    if (nearest && nd < 30) {
      const away = Math.atan2(r.cx - nearest.cx, r.cz - nearest.cz);
      dir = away + angleDiff(home, away) * 0.6;
    }
    r.fleeDir = dir;
    if (Math.hypot(h.x - r.cx, h.z - r.cz) < 45) { this.regroup(r); return; }
    if (!r.rallied && this.time - r.routedAt > 12 && nd > 45 && r.alive >= r.initial * 0.25 && !r.engine?.wrecked) {
      r.routing = false;
      r.rallied = true;
      r.morale = 30;
      r.x = r.cx; r.z = r.cz;
      r.angle = nearest ? Math.atan2(nearest.cx - r.cx, nearest.cz - r.cz) : r.angle;
      this.assignSlots(r);
      this.event(r.side, `${this.label(r)} have rallied.`);
    }
  }

  // Safe at the keep: form up in front of it and recover before taking orders again.
  regroup(r) {
    if (this.disbandAtHome[r.side]) {
      this.disband(r);
      this.event(r.side, `${this.label(r)} have fled the field.`);
      return;
    }
    const h = this.homes[r.side], toField = r.side === 0 ? -1 : 1;
    const k = this.regs.filter(o => o.side === r.side && o.regrouping).length;
    r.routing = false;
    r.regrouping = true;
    r.x = r.cx; r.z = r.cz;
    const angle = r.side === 0 ? Math.PI : 0;
    r.dest = { x: h.x + ((k % 4) - 1.5) * 42, z: h.z + toField * (40 + Math.floor(k / 4) * 24), angle };
    if (this.walls.any) {
      // Inside the walls, form up close round the keep instead.
      r.dest = { x: h.x + ((k % 4) - 1.5) * 14, z: h.z + toField * (14 + Math.floor(k / 4) * 10), angle };
    }
    this.reform(r);
    this.event(r.side, `${this.label(r)} reached the keep and are regrouping.`);
  }

  // How far this regiment's bows reach: further from a wall, furthest from a tower.
  rangeOf(r) {
    const T = r.T;
    if (!r.posts) return T.range;
    const towers = r.posts.filter(p => p.perch.kind === 'tower').length;
    return T.range * (towers > r.posts.length / 2 ? 1.5 : 1.3);
  }

  updateArchers(r, dt) {
    r.firingAt = null;
    if (r.gone || r.routing || (r.engaged > 0 && !r.posts)) return;
    const T = r.T, range = this.rangeOf(r);
    let tgt = null;
    const dist = o => Math.hypot(o.cx - r.cx, o.cz - r.cz);
    if (r.targetReg && !r.targetReg.gone) {
      if (dist(r.targetReg) <= range) tgt = r.targetReg;
    } else if (!r.dest && r.fireAtWill) {
      // Loose at will: the nearest enemy in range, sparing anyone already in melee with friends.
      // From a wall, engines and ladder men come first.
      let bd = range;
      for (const o of this.regs) {
        if (o.side === r.side || o.gone || (o.engaged > 0 && !o.posts)) continue;
        const d = dist(o) * (r.posts && o.engine ? 0.6 : 1);
        if (d < bd) { bd = d; tgt = o; }
      }
    }
    if (!tgt) return;
    r.firingAt = tgt;
    if (!r.posts) r.angle = turnToward(r.angle, Math.atan2(tgt.cx - r.cx, tgt.cz - r.cz), dt * 1.5);
    for (const s of r.soldiers) {
      if (!live(s) || s.target || s.climb > 0 || s.captain) continue;
      // Men still climbing to their posts don't shoot yet.
      if (r.posts && s.level !== 1) continue;
      s.fireCd -= dt;
      if (s.fireCd > 0) continue;
      s.fireCd = T.reload * (0.75 + this.rand() * 0.5);
      this.loose(s, tgt, range);
    }
  }

  loose(s, tgtReg, range) {
    let o = null;
    for (let i = 0; i < 6 && !o; i++) {
      const c = tgtReg.soldiers[Math.floor(this.rand() * tgtReg.soldiers.length)];
      if (live(c)) o = c;
    }
    if (!o) return;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d > range * 1.15) return;
    const T = 0.6 + d / 48;
    const spread = 0.8 + d * 0.025 * (s.reg.T.pierce ? 0.8 : 1);
    const x1 = o.x + o.vx * T + (this.rand() - 0.5) * 2 * spread;
    const z1 = o.z + o.vz * T + (this.rand() - 0.5) * 2 * spread;
    s.yaw = Math.atan2(o.x - s.x, o.z - s.z);
    s.lunge = 0.6;
    this.arrows.push({
      x0: s.x, y0: s.y + 1.6, z0: s.z, x1, z1, y1: (o.level === 1 ? o.y : this.heightAt(x1, z1)) + 0.9,
      t: 0, T, h: 2 + d * (s.reg.T.pierce ? 0.08 : 0.16), dmg: s.reg.T.arrowDmg, pierce: s.reg.T.pierce || 0, side: s.reg.side,
      bolt: !!s.reg.T.pierce,
    });
    audio.play('bow', s, this); // audio
  }

  updateArrows(dt) {
    let w = 0;
    for (const a of this.arrows) {
      a.t += dt;
      if (a.t < a.T) { this.arrows[w++] = a; continue; }
      let hit = null, hd = Infinity;
      this.forNear(a.x1, a.z1, 1.5, o => {
        const d = (o.x - a.x1) ** 2 + (o.z - a.z1) ** 2;
        const rad = o.reg.T.mounted ? 1.3 : 0.75;
        if (d < rad * rad && d < hd) { hd = d; hit = o; }
      });
      if (!hit) continue;
      const D = hit.reg.T, pierce = a.pierce || 0;
      let chance = 0.7 - D.def * 0.04 * (1 - pierce);
      if (D.shield && !hit.reg.routing && this.flankOf(a.x0, a.z0, hit) === 0) chance *= 1 - 0.45 * (1 - pierce);
      // Merlons cover men on a wall; a ram's roof covers its crew.
      if (hit.level === 1 && hit.perch) chance *= hit.perch.material === 'stone' ? 0.45 : 0.7;
      if (hit.reg.engine?.roof && !hit.reg.routing) chance *= hit.reg.engine.roof;
      if (this.rand() < chance) {
        hit.reg.morale -= 0.25;
        audio.play('arrowhit', hit, this); // audio
        hit.reg.lastHit = this.time;
        this.hurt(hit, a.dmg);
      }
    }
    this.arrows.length = w;
  }

  checkVictory() {
    if (this.winner !== null || !this.checkWinner) return;
    for (let side = 0; side < 2; side++) {
      const standing = this.regs.some(r => r.side === side && !r.gone && !r.routing && !r.regrouping);
      if (!standing) {
        this.winner = 1 - side;
        this.event(this.winner, this.winner === 0 ? 'Victory: the enemy army has broken.' : 'Defeat: your army has broken.');
        return;
      }
    }
  }

  moraleLabel(r) {
    if (r.gone) return r.engine?.wrecked ? 'Wrecked' : r.soldiers.some(s => s.alive) ? 'Fled' : 'Destroyed';
    if (r.routing) return 'Routing';
    if (r.regrouping) return 'Regrouping';
    const m = r.morale / r.T.morale;
    return m > 0.75 ? 'Steady' : m > 0.4 ? 'Shaken' : 'Wavering';
  }

  // What a regiment is up to, for its card.
  doingLabel(r) {
    if (r.gone || r.routing || r.regrouping) return '';
    const E = r.engine;
    if (E?.kind === 'ladder' && r.targetWall) return E.raising > 0 ? 'Raising ladders' : 'Carrying ladders';
    if (E && r.targetWall) return r.dest ? 'Moving up' : E.ready < (E.setup || 0) ? 'Setting up' : 'Battering';
    if (r.posts) return r.posts[0]?.perch.side === r.side ? 'On the walls' : 'Storming the walls';
    if (r.targetWall) return 'Attacking the wall';
    if (r.hold) return 'Holding';
    return '';
  }
}
