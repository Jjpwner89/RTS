// Getting around walls. A 2 m grid over the map marks where each side cannot walk:
// standing walls and towers block everyone, except that a side passes its own gates
// (and its own towers' stairs). Broken stretches are open to all. Walkers go straight
// for their goal when nothing is in the way. Otherwise they head for the best opening
// (a gate of theirs, a breach, a tower's stairs or the open end of a wall) by following
// a distance field spread out from it; there are few openings, so their fields are
// made once and shared by everyone until the walls change. Connected regions of the
// grid answer whether a place can be reached at all.
import { HALF } from './terrain.js';

const CELL = 2, SPAN = HALF + 40, N = Math.ceil(SPAN * 2 / CELL);
const UNREACHED = 65535, CACHE = 48;
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Nav {
  constructor(walls) {
    this.walls = walls;
    this.blocked = [new Uint8Array(N * N), new Uint8Array(N * N)];
    this.fields = new Map();
    this.version = -1;
    this.box = null;           // bounds of everything that blocks, for quick "nothing in the way" answers
    this.regions = [new Int32Array(N * N), new Int32Array(N * N)];
    this.openings = [[], []];
    this.sync();
  }

  get any() { return !!this.box; }

  cellOf(x, z) {
    const cx = Math.floor((x + SPAN) / CELL), cz = Math.floor((z + SPAN) / CELL);
    return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx;
  }
  centre(c) { return { x: (c % N + 0.5) * CELL - SPAN, z: (Math.floor(c / N) + 0.5) * CELL - SPAN }; }

  // Rebuilds the grid when the walls have changed.
  sync() {
    if (this.version === this.walls.version) return;
    this.version = this.walls.version;
    this.fields.clear();
    for (const b of this.blocked) b.fill(0);
    let box = null;
    const grow = (x, z, r) => {
      if (!box) box = { x0: x - r, x1: x + r, z0: z - r, z1: z + r };
      else { box.x0 = Math.min(box.x0, x - r); box.x1 = Math.max(box.x1, x + r); box.z0 = Math.min(box.z0, z - r); box.z1 = Math.max(box.z1, z + r); }
    };
    for (const p of this.walls.pieces) {
      if (p.state !== 'up') continue;
      const r = p.M.thick / 2 + 0.7;
      grow(p.a.x, p.a.z, r + CELL); grow(p.b.x, p.b.z, r + CELL);
      // A gate's door is the middle half: open to its owner, shut to everyone else.
      for (let side = 0; side < 2; side++) {
        if (p.gate && (side === p.side || p.forced)) {
          this.capsule(side, p, 0, 0.25, r);
          this.capsule(side, p, 0.75, 1, r);
        } else this.capsule(side, p, 0, 1, r);
      }
    }
    for (const n of this.walls.nodes) {
      const t = n.tower;
      if (!t || t.state !== 'up') continue;
      grow(t.x, t.z, t.M.towerR + CELL);
      // Its own side uses the stairs, so for them the tower is a postern rather than a block.
      this.disc(1 - t.side, t.x, t.z, t.M.towerR + 0.7);
    }
    this.box = box;
    if (box) for (let side = 0; side < 2; side++) { this.label(side); this.findOpenings(side); }
  }

  // Connected regions of open ground, per side.
  label(side) {
    const grid = this.blocked[side], reg = this.regions[side];
    reg.fill(0);
    const q = new Int32Array(N * N);
    let id = 0;
    for (let c0 = 0; c0 < N * N; c0++) {
      if (grid[c0] || reg[c0]) continue;
      id++;
      let head = 0, tail = 0;
      q[tail++] = c0; reg[c0] = id;
      while (head < tail) {
        const c = q[head++], cx = c % N;
        if (cx > 0 && !grid[c - 1] && !reg[c - 1]) { reg[c - 1] = id; q[tail++] = c - 1; }
        if (cx < N - 1 && !grid[c + 1] && !reg[c + 1]) { reg[c + 1] = id; q[tail++] = c + 1; }
        if (c >= N && !grid[c - N] && !reg[c - N]) { reg[c - N] = id; q[tail++] = c - N; }
        if (c < N * N - N && !grid[c + N] && !reg[c + N]) { reg[c + N] = id; q[tail++] = c + N; }
      }
    }
  }

  // Places a side can pass the walls: its gates (and forced ones), breaches, its towers'
  // stairs, and the open ends of unfinished walls.
  findOpenings(side) {
    const W = this.walls, list = [];
    for (const p of W.pieces) {
      if (p.state === 'broken' || (p.gate && p.state === 'up' && (p.side === side || p.forced))) list.push({ x: p.x, z: p.z });
    }
    for (const n of W.nodes) {
      if (n.tower && n.tower.state === 'up') { if (n.tower.side === side) list.push({ x: n.x, z: n.z }); continue; }
      const up = n.pieces.filter(p => p.state === 'up');
      if (up.length !== 1) continue;
      // Round the end of a wall: just past its last node.
      const p = up[0], o = p.a === n ? p.b : p.a, dx = n.x - o.x, dz = n.z - o.z, d = Math.hypot(dx, dz) || 1;
      list.push({ x: n.x + dx / d * (p.M.thick + 2), z: n.z + dz / d * (p.M.thick + 2) });
    }
    this.openings[side] = list.map((o, i) => ({ ...o, id: i }));
  }

  regionAt(side, x, z) {
    const c = this.cellOf(x, z);
    if (c < 0) return 0;
    const reg = this.regions[side];
    if (reg[c]) return reg[c];
    const near = this.nearestFree(side, c);
    return near === null ? 0 : reg[near];
  }

  nearestFree(side, c0) {
    const grid = this.blocked[side];
    const gx = c0 % N, gz = Math.floor(c0 / N);
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = gx + dx, z = gz + dz;
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        if (!grid[z * N + x]) return z * N + x;
      }
    }
    return null;
  }

  capsule(side, p, t0, t1, r) {
    const ax = p.a.x + (p.b.x - p.a.x) * t0, az = p.a.z + (p.b.z - p.a.z) * t0;
    const bx = p.a.x + (p.b.x - p.a.x) * t1, bz = p.a.z + (p.b.z - p.a.z) * t1;
    const grid = this.blocked[side];
    const x0 = Math.min(ax, bx) - r, x1 = Math.max(ax, bx) + r, z0 = Math.min(az, bz) - r, z1 = Math.max(az, bz) + r;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    for (let z = Math.floor((z0 + SPAN) / CELL); z <= Math.floor((z1 + SPAN) / CELL); z++) {
      for (let x = Math.floor((x0 + SPAN) / CELL); x <= Math.floor((x1 + SPAN) / CELL); x++) {
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const px = (x + 0.5) * CELL - SPAN, pz = (z + 0.5) * CELL - SPAN;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
        if (Math.hypot(px - ax - dx * t, pz - az - dz * t) <= r) grid[z * N + x] = 1;
      }
    }
  }

  disc(side, x, z, r) {
    const grid = this.blocked[side];
    for (let cz = Math.floor((z - r + SPAN) / CELL); cz <= Math.floor((z + r + SPAN) / CELL); cz++) {
      for (let cx = Math.floor((x - r + SPAN) / CELL); cx <= Math.floor((x + r + SPAN) / CELL); cx++) {
        if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
        if (Math.hypot((cx + 0.5) * CELL - SPAN - x, (cz + 0.5) * CELL - SPAN - z) <= r) grid[cz * N + cx] = 1;
      }
    }
  }

  blockedAt(side, x, z) {
    if (!this.box) return false;
    const c = this.cellOf(x, z);
    return c >= 0 && this.blocked[side][c] === 1;
  }

  // Whether a straight walk from one point to another meets a wall.
  clear(side, x0, z0, x1, z1) {
    const b = this.box;
    if (!b) return true;
    if (Math.max(x0, x1) < b.x0 || Math.min(x0, x1) > b.x1 || Math.max(z0, z1) < b.z0 || Math.min(z0, z1) > b.z1) return true;
    const grid = this.blocked[side];
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 0.9);
    for (let i = 1; i <= n; i++) {
      const c = this.cellOf(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n);
      if (c >= 0 && grid[c]) return false;
    }
    return true;
  }

  // Distance (in steps) from every cell to the goal, for one side. Cached.
  field(side, tx, tz) {
    let g = this.cellOf(tx, tz);
    if (g < 0) g = this.cellOf(Math.max(-SPAN + 1, Math.min(SPAN - 1, tx)), Math.max(-SPAN + 1, Math.min(SPAN - 1, tz)));
    const key = side * N * N + g;
    let f = this.fields.get(key);
    if (f) { this.fields.delete(key); this.fields.set(key, f); return f; }
    const grid = this.blocked[side];
    f = new Uint16Array(N * N).fill(UNREACHED);
    const q = new Int32Array(N * N);
    let head = 0, tail = 0;
    // A goal inside a wall starts from the free cells around it.
    if (grid[g]) {
      const gx = g % N, gz = Math.floor(g / N);
      for (let r = 1; r < 6 && tail === 0; r++) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx, z = gz + dz;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          const c = z * N + x;
          if (!grid[c] && f[c] === UNREACHED) { f[c] = 0; q[tail++] = c; }
        }
      }
    } else { f[g] = 0; q[tail++] = g; }
    while (head < tail) {
      const c = q[head++], cx = c % N, cz = (c - cx) / N, d = f[c] + 1;
      for (let k = 0; k < 8; k++) {
        const x = cx + NB[k][0], z = cz + NB[k][1];
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const o = z * N + x;
        if (grid[o] || f[o] !== UNREACHED) continue;
        // No cutting corners past a wall.
        if (k >= 4 && (grid[cz * N + x] || grid[z * N + cx])) continue;
        f[o] = d;
        q[tail++] = o;
      }
    }
    this.fields.set(key, f);
    if (this.fields.size > CACHE) this.fields.delete(this.fields.keys().next().value);
    return f;
  }

  // The point to walk toward next, on the way from (x, z) to (tx, tz); null to go straight.
  steer(side, x, z, tx, tz) {
    this.sync();
    if (this.clear(side, x, z, tx, tz)) return null;
    const c = this.cellOf(x, z);
    if (c < 0) return null;
    const goalRegion = this.regionAt(side, tx, tz);
    // Same side of the walls but no straight line (round the outside of a ring to its
    // gate, say): walk the ground to the goal itself; no opening is needed.
    if (goalRegion && goalRegion === this.regionAt(side, x, z)) {
      const way = this.follow(side, this.field(side, tx, tz), x, z);
      if (way) return way;
    }
    // The opening that makes for the shortest walk: there along the ground, then on in a line.
    let best = null, bs = Infinity, bf = null;
    for (const o of this.openings[side]) {
      if (Math.hypot(o.x - x, o.z - z) < 2.5 && !this.clear(side, x, z, tx, tz)) continue;   // already here: it didn't help
      const f = this.field(side, o.x, o.z);
      let here = f[c];
      if (here === UNREACHED) { const n = this.nearestOpen(side, f, x, z); if (n === null) continue; here = f[n] + 1; }
      if (here === UNREACHED) continue;
      // An opening on the far side of the target's region still counts, but less.
      const beyond = Math.hypot(tx - o.x, tz - o.z) + (this.regionAt(side, o.x, o.z) && goalRegion && this.clear(side, o.x, o.z, tx, tz) ? 0 : 40);
      const sc = here * CELL + beyond;
      if (sc < bs) { bs = sc; best = o; bf = f; }
    }
    if (!best) return null;
    return this.follow(side, bf, x, z) || { x: best.x, z: best.z };
  }

  // Runs down a field from (x, z) a few cells and aims at the farthest of them still in sight.
  follow(side, f, x, z) {
    let c = this.cellOf(x, z);
    if (c < 0) return null;
    if (f[c] === UNREACHED) {
      const near = this.nearestOpen(side, f, x, z);
      return near !== null ? this.centre(near) : null;
    }
    const trail = [];
    for (let i = 0; i < 10 && f[c] > 0; i++) {
      const cx = c % N, cz = (c - cx) / N;
      let best = c;
      for (const [dx, dz] of NB) {
        const xx = cx + dx, zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= N || zz >= N) continue;
        const o = zz * N + xx;
        if (f[o] < f[best]) best = o;
      }
      if (best === c) break;
      c = best;
      trail.push(c);
    }
    for (let i = trail.length - 1; i > 0; i--) {
      const p = this.centre(trail[i]);
      if (this.clear(side, x, z, p.x, p.z)) return p;
    }
    return trail.length ? this.centre(trail[0]) : null;
  }

  nearestOpen(side, f, x, z) {
    const grid = this.blocked[side];
    const c0 = this.cellOf(x, z);
    if (c0 < 0) return null;
    const gx = c0 % N, gz = Math.floor(c0 / N);
    for (let r = 1; r < 8; r++) {
      let best = null, bd = UNREACHED;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const xx = gx + dx, zz = gz + dz;
        if (xx < 0 || zz < 0 || xx >= N || zz >= N) continue;
        const o = zz * N + xx;
        if (!grid[o] && f[o] < bd) { bd = f[o]; best = o; }
      }
      if (best !== null) return best;
    }
    return null;
  }

  // Whether a side can walk from one point to another at all, e.g. into a walled town.
  reachable(side, x, z, tx, tz) {
    this.sync();
    if (!this.box) return true;
    const a = this.regionAt(side, x, z), b = this.regionAt(side, tx, tz);
    return a !== 0 && a === b;
  }
}
