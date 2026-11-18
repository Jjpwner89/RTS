// Battle simulation: regiments of individual soldiers, melee, arrows and morale.
// No rendering here; view.js draws whatever this state holds.
import { rng } from './noise.js';
import { HALF } from './terrain.js';

export const TYPES = {
  spear: { key: 'spear', name: 'Spearmen', count: 80, files: 20, spacing: 1.6, speed: 3.0, hp: 12, atk: 3, def: 5, dmg: 4, reach: 2.4, cooldown: 1.4, morale: 65, shield: true, vsMounted: 0.3, braces: true },
  sword: { key: 'sword', name: 'Swordsmen', count: 72, files: 18, spacing: 1.5, speed: 3.3, hp: 12, atk: 6, def: 3, dmg: 5, reach: 1.8, cooldown: 1.1, morale: 70, shield: true },
  archer: { key: 'archer', name: 'Archers', count: 60, files: 20, spacing: 1.7, speed: 3.3, hp: 8, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 50, range: 85, reload: 4.5, arrowDmg: 5 },
  cav: { key: 'cav', name: 'Cavalry', count: 40, files: 20, spacing: 2.6, depth: 3.4, speed: 7.5, hp: 18, atk: 5, def: 3, dmg: 5, reach: 2.4, cooldown: 1.3, morale: 70, mounted: true, charge: true },
};

// Each side deploys this line; the scale setting stacks extra lines behind it.
const LAYOUT = [
  ['spear', -70, 0], ['sword', -35, 0], ['spear', 0, 0], ['sword', 35, 0], ['spear', 70, 0],
  ['archer', -30, -22], ['archer', 30, -22],
  ['cav', -120, -10], ['cav', 120, -10],
];

const CELL = 4;
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

export class Battle {
  constructor(heightAt, seed, scale = 1) {
    this.heightAt = heightAt;
    this.rand = rng(seed + 99);
    this.time = 0;
    this.regs = [];
    this.soldiers = [];
    this.arrows = [];
    this.grid = new Map();
    this.winner = null;
    this.losses = [0, 0];
    this.events = [];          // short messages for the HUD, e.g. a regiment routing
    for (let side = 0; side < 2; side++) this.deploy(side, scale);
  }

  // Side 0 (the player) deploys on +z facing -z; side 1 on -z facing +z.
  deploy(side, scale) {
    const dir = side === 0 ? -1 : 1;
    const counts = {};
    for (let line = 0; line < scale; line++) {
      for (const [key, x, back] of LAYOUT) {
        const T = TYPES[key];
        counts[key] = (counts[key] || 0) + 1;
        const z = -dir * (70 - back + line * 50);
        const r = {
          id: this.regs.length, side, T, name: `${ORDINAL(counts[key])} ${T.name}`,
          x: side === 0 ? -x : x, z, angle: side === 0 ? Math.PI : 0, files: T.files,
          dest: null, targetReg: null, morale: T.morale, routing: false, routedAt: 0, rallied: false,
          gone: false, soldiers: [], initial: T.count, alive: T.count, engaged: 0, lag: 0,
          cx: 0, cz: 0, lastHit: -99, firingAt: null, fleeDir: 0,
        };
        for (let i = 0; i < T.count; i++) {
          const s = {
            reg: r, slot: i, x: 0, z: 0, y: 0, yaw: r.angle, hp: T.hp, alive: true, gone: false,
            cd: this.rand() * T.cooldown, fireCd: this.rand() * (T.reload || 1), target: null, searchCd: this.rand() * 0.3,
            v: 0, vx: 0, vz: 0, phase: this.rand() * 6, fall: 0, lunge: 0, charged: false, idleFor: 0,
            jitter: (this.rand() - 0.5) * 0.5,
          };
          const p = this.slotPos(r, i);
          s.x = p.x + (this.rand() - 0.5) * 0.4;
          s.z = p.z + (this.rand() - 0.5) * 0.4;
          r.soldiers.push(s);
          this.soldiers.push(s);
        }
        this.regs.push(r);
      }
    }
  }

  // Front-centre of the formation sits at (r.x, r.z); ranks stack behind it.
  slotPos(r, k) {
    const T = r.T;
    const files = Math.max(1, Math.min(r.files, r.alive));
    const rank = Math.floor(k / files), f = k % files;
    const lastRank = Math.floor((r.alive - 1) / files);
    const inRank = rank === lastRank ? r.alive - rank * files : files;
    const lx = (f - (inRank - 1) / 2) * T.spacing;
    const lz = -rank * (T.depth || T.spacing);
    const sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    return { x: r.x + cos * lx + sin * lz, z: r.z - sin * lx + cos * lz };
  }

  // Frontmost soldiers take the front rank, so reforming never sends men across the block.
  assignSlots(r) {
    const list = r.soldiers.filter(s => s.alive && !s.gone);
    const sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    for (const s of list) {
      const dx = s.x - r.x, dz = s.z - r.z;
      s._f = dx * sin + dz * cos;
      s._l = dx * cos - dz * sin;
    }
    list.sort((a, b) => b._f - a._f);
    const files = Math.max(1, Math.min(r.files, list.length));
    for (let i = 0; i < list.length; i += files) {
      const rank = list.slice(i, i + files).sort((a, b) => a._l - b._l);
      rank.forEach((s, j) => { s.slot = i + j; });
    }
    r.alive = list.length;
  }

  // ---- orders ----

  // Place the regiments side by side along a front line centred on (x, z), facing `angle`.
  orderMove(regs, x, z, angle, width = null) {
    regs = regs.filter(r => !r.gone && !r.routing);
    if (!regs.length) return;
    const gap = 4;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    if (width) {
      const total = regs.reduce((n, r) => n + r.alive, 0);
      for (const r of regs) {
        const share = Math.max(4, (width - gap * (regs.length - 1)) * r.alive / total);
        r.files = Math.max(4, Math.min(r.alive, Math.round(share / r.T.spacing) + 1));
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
    const saved = regs.map(r => ({ r, dest: r.dest, files: r.files, targetReg: r.targetReg, slots: r.soldiers.map(s => s.slot) }));
    this.orderMove(regs, x, z, angle, width);
    const plan = regs.filter(r => r.dest).map(r => ({ r, ...r.dest, files: r.files }));
    for (const s of saved) {
      s.r.dest = s.dest; s.r.files = s.files; s.r.targetReg = s.targetReg;
      s.r.soldiers.forEach((o, i) => { o.slot = s.slots[i]; });
    }
    return plan;
  }

  orderAttack(regs, target) {
    for (const r of regs) {
      if (r.gone || r.routing || target.side === r.side) continue;
      r.targetReg = target;
      r.dest = null;
    }
  }

  orderHalt(regs) {
    for (const r of regs) {
      if (r.gone || r.routing) continue;
      r.dest = null;
      r.targetReg = null;
      r.x = r.cx; r.z = r.cz;
      this.assignSlots(r);
    }
  }

  // ---- simulation ----

  step(dt) {
    if (this.winner !== null) dt *= 0.3;
    this.time += dt;
    this.buildGrid();
    for (const r of this.regs) this.updateRegiment(r, dt);
    for (const r of this.regs) { r.engaged = 0; r._lagSum = 0; r._lagN = 0; }
    for (const s of this.soldiers) if (s.alive && !s.gone) this.updateSoldier(s, dt);
    else if (!s.alive && s.fall < 1) s.fall = Math.min(1, s.fall + dt * 2.5);
    this.separate();
    for (const r of this.regs) {
      r.lag = r._lagN ? r._lagSum / r._lagN : 0;
      this.updateMorale(r, dt);
      if (r.T.range) this.updateArchers(r, dt);
    }
    this.updateArrows(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.checkVictory();
  }

  buildGrid() {
    for (const a of this.grid.values()) a.length = 0;
    for (const s of this.soldiers) {
      if (!s.alive || s.gone) continue;
      const k = this.key(s.x, s.z);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(s);
    }
  }

  key(x, z) { return (Math.floor(x / CELL) + 512) * 2048 + (Math.floor(z / CELL) + 512); }

  forNear(x, z, radius, fn) {
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.grid.get((cx + 512) * 2048 + (cz + 512));
      if (a) for (const s of a) fn(s);
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

  updateRegiment(r, dt) {
    if (r.gone) return;
    let sx = 0, sz = 0, n = 0;
    for (const s of r.soldiers) if (s.alive && !s.gone) { sx += s.x; sz += s.z; n++; }
    if (n === 0) { r.gone = true; r.routing = false; return; }
    r.cx = sx / n; r.cz = sz / n;
    if (r.routing) { r.alive = n; this.updateRout(r); return; }
    const T = r.T;

    if (r.targetReg) {
      const t = r.targetReg;
      if (t.gone) { r.targetReg = null; r.x = r.cx; r.z = r.cz; this.assignSlots(r); }
      else {
        const dx = t.cx - r.cx, dz = t.cz - r.cz, d = Math.hypot(dx, dz) || 1;
        const ang = Math.atan2(dx, dz);
        if (T.range && d <= T.range * 0.9) r.dest = null;
        else if (T.range) r.dest = { x: t.cx - dx / d * T.range * 0.8, z: t.cz - dz / d * T.range * 0.8, angle: ang };
        else r.dest = { x: t.cx, z: t.cz, angle: ang };
        if (!r.dest) r.angle = turnToward(r.angle, ang, dt * 1.2);
      }
    }

    if (r.engaged > 0 && !T.range) {
      // Locked in melee: let the anchor settle where the fighting is.
      const k = Math.min(1, dt * 0.4);
      r.x += (r.cx - r.x) * k;
      r.z += (r.cz - r.z) * k;
    } else if (r.dest) {
      const dx = r.dest.x - r.x, dz = r.dest.z - r.z, d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const want = d > 12 ? Math.atan2(dx, dz) : r.dest.angle;
        const turn = Math.abs(angleDiff(want, r.angle));
        r.angle = turnToward(r.angle, want, dt * (T.mounted ? 1.6 : 1.0));
        // Wheel before marching off, and wait for stragglers.
        const pace = T.speed * (turn > 1.2 ? 0.25 : 1) * (r.lag > 4 ? 0.45 : 1) * (r.targetReg && d < 25 ? 1.35 : 1);
        const stepLen = Math.min(d, pace * dt);
        r.x += dx / d * stepLen;
        r.z += dz / d * stepLen;
      } else {
        r.angle = turnToward(r.angle, r.dest.angle, dt * 1.2);
        if (!r.targetReg && Math.abs(angleDiff(r.angle, r.dest.angle)) < 0.01) r.dest = null;
      }
    }
  }

  updateSoldier(s, dt) {
    const r = s.reg, T = r.T;
    s.lunge = Math.max(0, s.lunge - dt * 3);
    s.cd -= dt;
    const px = s.x, pz = s.z;

    if (r.routing) {
      const dir = r.fleeDir + s.jitter;
      s.x += Math.sin(dir) * T.speed * 1.3 * dt;
      s.z += Math.cos(dir) * T.speed * 1.3 * dt;
      s.yaw = turnToward(s.yaw, dir, dt * 6);
      s.target = null;
      if (Math.abs(s.x) > HALF + 15 || Math.abs(s.z) > HALF + 15) s.gone = true;
    } else {
      s.searchCd -= dt;
      const engageR = T.range ? 2.5 : r.targetReg ? 9 : 4.5;
      if (s.target && (!s.target.alive || s.target.gone || (s.target.x - s.x) ** 2 + (s.target.z - s.z) ** 2 > (engageR + 2) ** 2)) s.target = null;
      if (s.searchCd <= 0) {
        s.searchCd = 0.25 + this.rand() * 0.15;
        const near = this.nearestEnemy(s, engageR);
        if (near) s.target = near;
      }
      if (s.target) {
        r.engaged++;
        s.idleFor = 0;
        const t = s.target, dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz);
        const charging = T.charge && !s.charged;
        if (d > T.reach * 0.85) this.moveToward(s, t.x, t.z, T.speed * (charging ? 1.5 : 1.15), dt);
        s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt * 8);
        if (d <= T.reach && s.cd <= 0) {
          s.cd = T.cooldown * (0.8 + this.rand() * 0.4);
          this.strike(s, t);
        }
      } else {
        s.idleFor += dt;
        if (s.idleFor > 3) s.charged = false;
        const p = this.slotPos(r, s.slot);
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        r._lagSum += d; r._lagN++;
        if (d > 0.15) this.moveToward(s, p.x, p.z, T.speed * (d > 2 ? 1.35 : 1.08), dt);
        if (d < 0.8) s.yaw = turnToward(s.yaw, r.angle, dt * 4);
      }
    }
    s.vx = (s.x - px) / dt; s.vz = (s.z - pz) / dt;
    s.v = Math.hypot(s.vx, s.vz);
    s.y = this.heightAt(s.x, s.z);
    s.phase += s.v * dt * 2.2;
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
  separate() {
    for (const s of this.soldiers) {
      if (!s.alive || s.gone) continue;
      const rs = s.reg.T.mounted ? 1.1 : 0.55;
      this.forNear(s.x, s.z, 2.4, o => {
        if (o === s) return;
        const ro = o.reg.T.mounted ? 1.1 : 0.55;
        const dx = s.x - o.x, dz = s.z - o.z, d2 = dx * dx + dz * dz, min = rs + ro;
        if (d2 >= min * min || d2 === 0) return;
        const d = Math.sqrt(d2), push = (min - d) * 0.25;
        // Horses shove infantry aside more than the other way round.
        const w = s.reg.T.mounted && !o.reg.T.mounted ? 0.3 : !s.reg.T.mounted && o.reg.T.mounted ? 1.7 : 1;
        s.x += dx / d * push * w;
        s.z += dz / d * push * w;
      });
    }
  }

  // Which way the blow lands on the target's formation: 0 front, 1 flank, 2 rear.
  flankOf(attX, attZ, t) {
    const rel = Math.abs(angleDiff(Math.atan2(attX - t.x, attZ - t.z), t.reg.angle));
    return rel > 2.2 ? 2 : rel > 1.1 ? 1 : 0;
  }

  strike(s, t) {
    const A = s.reg.T, D = t.reg.T, tr = t.reg;
    s.lunge = 1;
    let flank = tr.routing ? 0 : this.flankOf(s.x, s.z, t);
    let chance = 0.42 + (A.atk - D.def) * 0.05;
    if (tr.routing) chance += 0.35;
    chance += [0, 0.15, 0.3][flank];
    if (D.mounted && A.vsMounted) chance += A.vsMounted;
    if (D.shield && flank === 0) chance -= 0.05;
    let dmg = A.dmg;
    if (A.charge && !s.charged && s.v > A.speed * 0.7) {
      s.charged = true;
      if (D.braces && flank === 0 && !tr.routing) {
        chance -= 0.1;
        this.hurt(s, 4);                       // riding onto braced spears
      } else {
        chance += 0.35;
        dmg *= 2;
        tr.morale -= 0.8;
        const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz) || 1;
        t.x += dx / d * 1.5; t.z += dz / d * 1.5;
      }
    }
    if (this.rand() < Math.max(0.05, Math.min(0.95, chance))) {
      tr.lastHit = this.time;
      tr.morale -= [0, 0.3, 0.6][flank];
      this.hurt(t, dmg);
    }
  }

  hurt(t, dmg) {
    if (!t.alive) return;
    t.hp -= dmg;
    if (t.hp <= 0) this.kill(t);
  }

  kill(t) {
    const r = t.reg;
    t.alive = false;
    t.fall = 0.001;
    t.target = null;
    this.losses[r.side]++;
    r.morale -= 60 / r.initial;
    if (!r.routing) {
      // The rearmost man steps forward into the gap.
      let back = null;
      for (const o of r.soldiers) if (o.alive && !o.gone && o.slot > t.slot && (!back || o.slot > back.slot)) back = o;
      if (back) back.slot = t.slot;
    }
    r.alive--;
  }

  updateMorale(r, dt) {
    if (r.gone || r.routing) return;
    const T = r.T;
    if (r.engaged > 0 && r.alive < r.initial * 0.5) r.morale -= 1.2 * dt;
    if (r.engaged === 0 && this.time - r.lastHit > 4) r.morale = Math.min(T.morale, r.morale + 2 * dt);
    if (r.morale <= 0) this.startRout(r);
  }

  startRout(r) {
    r.routing = true;
    r.routedAt = this.time;
    r.dest = null;
    r.targetReg = null;
    r.morale = 0;
    for (const s of r.soldiers) s.target = null;
    this.events.push({ time: this.time, side: r.side, text: `${r.side ? 'Enemy ' : ''}${r.name} are routing!` });
    for (const o of this.regs) {
      if (o === r || o.gone || o.routing) continue;
      const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
      if (o.side === r.side && d < 50) o.morale -= 8;
      if (o.side !== r.side && d < 60) o.morale = Math.min(o.T.morale + 10, o.morale + 5);
    }
    for (const o of this.regs) if (o.targetReg === r && o.T.range) o.targetReg = null;
    this.updateRout(r);
  }

  updateRout(r) {
    // Run from the nearest enemy, bending toward home.
    let nearest = null, nd = Infinity;
    for (const o of this.regs) {
      if (o.side === r.side || o.gone || o.routing) continue;
      const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
      if (d < nd) { nd = d; nearest = o; }
    }
    const home = r.side === 0 ? 0 : Math.PI;
    let dir = home;
    if (nearest && nd < 80) {
      const away = Math.atan2(r.cx - nearest.cx, r.cz - nearest.cz);
      dir = away + angleDiff(home, away) * 0.4;
    }
    r.fleeDir = dir;
    if (!r.rallied && this.time - r.routedAt > 12 && nd > 45 && r.alive >= r.initial * 0.25) {
      r.routing = false;
      r.rallied = true;
      r.morale = 30;
      r.x = r.cx; r.z = r.cz;
      r.angle = nearest ? Math.atan2(nearest.cx - r.cx, nearest.cz - r.cz) : r.angle;
      this.assignSlots(r);
      this.events.push({ time: this.time, side: r.side, text: `${r.side ? 'Enemy ' : ''}${r.name} have rallied.` });
    }
  }

  updateArchers(r, dt) {
    r.firingAt = null;
    if (r.gone || r.routing || r.engaged > 0) return;
    const T = r.T;
    let tgt = null;
    const dist = o => Math.hypot(o.cx - r.cx, o.cz - r.cz);
    if (r.targetReg && !r.targetReg.gone) {
      if (dist(r.targetReg) <= T.range) tgt = r.targetReg;
    } else if (!r.dest) {
      // Loose at will: the nearest enemy in range, sparing anyone already in melee with friends.
      let bd = T.range;
      for (const o of this.regs) {
        if (o.side === r.side || o.gone || o.engaged > 0) continue;
        const d = dist(o);
        if (d < bd) { bd = d; tgt = o; }
      }
    }
    if (!tgt) return;
    r.firingAt = tgt;
    r.angle = turnToward(r.angle, Math.atan2(tgt.cx - r.cx, tgt.cz - r.cz), dt * 1.5);
    for (const s of r.soldiers) {
      if (!s.alive || s.gone || s.target) continue;
      s.fireCd -= dt;
      if (s.fireCd > 0) continue;
      s.fireCd = T.reload * (0.75 + this.rand() * 0.5);
      this.loose(s, tgt);
    }
  }

  loose(s, tgtReg) {
    let o = null;
    for (let i = 0; i < 6 && !o; i++) {
      const c = tgtReg.soldiers[Math.floor(this.rand() * tgtReg.soldiers.length)];
      if (c.alive && !c.gone) o = c;
    }
    if (!o) return;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d > s.reg.T.range * 1.15) return;
    const T = 0.6 + d / 48;
    const spread = 0.8 + d * 0.025;
    const x1 = o.x + o.vx * T + (this.rand() - 0.5) * 2 * spread;
    const z1 = o.z + o.vz * T + (this.rand() - 0.5) * 2 * spread;
    s.yaw = Math.atan2(o.x - s.x, o.z - s.z);
    s.lunge = 0.6;
    this.arrows.push({
      x0: s.x, y0: s.y + 1.6, z0: s.z, x1, z1, y1: this.heightAt(x1, z1) + 0.9,
      t: 0, T, h: 2 + d * 0.16, dmg: s.reg.T.arrowDmg,
    });
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
      const D = hit.reg.T;
      let chance = 0.7 - D.def * 0.04;
      if (D.shield && !hit.reg.routing && this.flankOf(a.x0, a.z0, hit) === 0) chance *= 0.55;
      if (this.rand() < chance) {
        hit.reg.morale -= 0.25;
        hit.reg.lastHit = this.time;
        this.hurt(hit, a.dmg);
      }
    }
    this.arrows.length = w;
  }

  checkVictory() {
    if (this.winner !== null) return;
    for (let side = 0; side < 2; side++) {
      const standing = this.regs.some(r => r.side === side && !r.gone && !r.routing);
      if (!standing) {
        this.winner = 1 - side;
        this.events.push({ time: this.time, side: this.winner, text: this.winner === 0 ? 'Victory: the enemy army has broken.' : 'Defeat: your army has broken.' });
        return;
      }
    }
  }

  moraleLabel(r) {
    if (r.gone) return r.soldiers.some(s => s.alive) ? 'Fled' : 'Destroyed';
    if (r.routing) return 'Routing';
    const m = r.morale / r.T.morale;
    return m > 0.75 ? 'Steady' : m > 0.4 ? 'Shaken' : 'Wavering';
  }
}
