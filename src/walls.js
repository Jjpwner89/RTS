// Walls, towers and gates, placed freely as in Stronghold. A wall is a network of
// nodes joined by pieces: dragging a line makes pieces 5–10 m long, a tower sits on a
// node, and a gate is a piece with a door that opens for its owner. Every piece has
// its own hit points, so a siege breaks one stretch rather than the whole wall.
// Soldiers can stand on the walkway (see battle.js); ladders give attackers a way up.
// No rendering here; siegeview.js draws whatever this state holds.

// Sizes match the models the Art session bakes (see siegeview.js).
export const MATERIALS = {
  wood: { name: 'Palisade', thick: 1.5, height: 4.5, walk: 3.5, towerR: 3, towerTop: 6.3, towerPosts: 6, hp: 450, towerHp: 700, gateHp: 400, melee: 1, build: 8 },
  stone: { name: 'Stone wall', thick: 2.5, height: 6, walk: 5, towerR: 4, towerTop: 9.4, towerPosts: 12, hp: 2400, towerHp: 3600, gateHp: 1100, melee: 0.04, build: 20 },
};

// What each thing costs, in goods (and gold for stone: masons' wages). A wall's cost is for
// a full 10 m piece; shorter ones cost less.
export const WALL_COSTS = {
  wood: { wall: { wood: 8 }, tower: { wood: 20 }, gate: { wood: 15 } },
  stone: { wall: { stone: 20, gold: 10 }, tower: { stone: 40, wood: 10, gold: 30 }, gate: { stone: 25, wood: 15, gold: 15 } },
};

export const PIECE_MAX = 10, PIECE_MIN = 4, GATE_MIN = 6, SNAP = 3.5, POST_GAP = 1.3;

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Distance from (px, pz) to the segment a–b, and where along it (0..1) the nearest point lies.
export function toSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
}

function crosses(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

const scaleCost = (cost, k) => Object.fromEntries(Object.entries(cost).map(([g, n]) => [g, Math.max(1, Math.ceil(n * k))]));
export const addCost = (a, b) => { const c = { ...a }; for (const [g, n] of Object.entries(b)) c[g] = (c[g] || 0) + n; return c; };

export class Walls {
  constructor(heightAt) {
    this.heightAt = heightAt;
    this.nodes = [];
    this.pieces = [];
    this.ladders = [];
    this.version = 0;          // bumped whenever what blocks movement changes
    this.nextId = 1;
    this.onBreak = null;       // battle.js hears about pieces and towers that fall
    this.centre = [null, null]; // the middle of each side's walls; battle.homes when unset
  }

  get any() { return this.pieces.length > 0 || this.nodes.some(n => n.tower); }
  get sites() { return this.pieces.some(p => p.state === 'site') || this.nodes.some(n => n.tower?.state === 'site'); }
  changed() { this.version++; }

  // A taken place: every wall of `from` becomes `to`'s as it stands, broken stretches
  // included. Ladders come down, forced gates shut, and nobody keeps a post on them.
  // Regiments still manning them should be released first (battle.clearPosts).
  changeSide(from, to) {
    for (const n of this.nodes) if (n.side === from) { n.side = to; if (n.tower) { n.tower.side = to; n.tower.claims.clear(); } }
    for (const p of this.pieces) if (p.side === from) { p.side = to; p.forced = false; p.claims.clear(); }
    if (this.centre[from]) { this.centre[to] = this.centre[from]; this.centre[from] = null; }
    this.ladders = [];
    this.changed();
  }

  // ---- building ----

  node(x, z, side, { snap = true } = {}) {
    if (snap) {
      let best = null, bd = SNAP;
      for (const n of this.nodes) if (n.side === side && dist(n.x, n.z, x, z) < bd) { bd = dist(n.x, n.z, x, z); best = n; }
      if (best) return best;
    }
    const n = { id: this.nextId++, x, z, side, tower: null, pieces: [] };
    this.nodes.push(n);
    return n;
  }

  // Where a dragged line will put its pieces, before anything is built.
  planLine(ax, az, bx, bz, side) {
    const a = this.snapPoint(ax, az, side), b = this.snapPoint(bx, bz, side);
    const len = dist(a.x, a.z, b.x, b.z);
    const n = Math.max(1, Math.ceil(len / PIECE_MAX));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n });
    return { a, b, len, pts, pieceLen: len / n };
  }

  snapPoint(x, z, side) {
    let best = { x, z }, bd = SNAP;
    for (const n of this.nodes) if (n.side === side && dist(n.x, n.z, x, z) < bd) { bd = dist(n.x, n.z, x, z); best = { x: n.x, z: n.z, node: n }; }
    return best;
  }

  lineCost(plan, material) {
    return scaleCost(WALL_COSTS[material].wall, plan.len / PIECE_MAX);
  }

  // avoid(x, z, r): true where something else stands (buildings, the keep), supplied by the caller.
  canPlaceLine(ax, az, bx, bz, side, material, { avoid = null, afford = null } = {}) {
    const plan = this.planLine(ax, az, bx, bz, side);
    if (plan.len < PIECE_MIN) return { ok: false, reason: 'Drag a longer line', plan };
    const cost = this.lineCost(plan, material);
    if (afford && !afford(cost)) return { ok: false, reason: 'Not enough goods', plan, cost };
    for (const p of this.pieces) {
      const shared = [p.a, p.b].some(n => n === plan.a.node || n === plan.b.node);
      if (!shared && crosses(plan.a, plan.b, p.a, p.b)) return { ok: false, reason: 'Crosses another wall', plan, cost };
    }
    if (avoid) {
      const M = MATERIALS[material];
      for (let i = 0; i <= 20; i++) {
        const x = plan.a.x + (plan.b.x - plan.a.x) * i / 20, z = plan.a.z + (plan.b.z - plan.a.z) * i / 20;
        if (avoid(x, z, M.thick / 2 + 1)) return { ok: false, reason: 'Something is in the way', plan, cost };
      }
    }
    for (let i = 0; i < plan.pts.length - 1; i++) {
      const p = plan.pts[i], q = plan.pts[i + 1];
      if (Math.abs(this.heightAt(p.x, p.z) - this.heightAt(q.x, q.z)) > 5) return { ok: false, reason: 'Ground too steep', plan, cost };
    }
    return { ok: true, plan, cost };
  }

  // Lays the pieces along a line. ready: built at once (a fort that is already there).
  placeLine(ax, az, bx, bz, side, material, { ready = false, avoid = null, afford = null } = {}) {
    const check = this.canPlaceLine(ax, az, bx, bz, side, material, { avoid, afford });
    if (!check.ok) return check;
    const { plan } = check;
    const made = [];
    let prev = plan.a.node || this.node(plan.a.x, plan.a.z, side);
    for (let i = 1; i < plan.pts.length; i++) {
      const p = plan.pts[i];
      const next = i === plan.pts.length - 1 && plan.b.node ? plan.b.node : this.node(p.x, p.z, side, { snap: i === plan.pts.length - 1 });
      if (next === prev) continue;
      made.push(this.addPiece(prev, next, side, material, ready));
      prev = next;
    }
    this.changed();
    return { ok: true, pieces: made, cost: check.cost };
  }

  addPiece(a, b, side, material, ready) {
    const M = MATERIALS[material];
    const len = dist(a.x, a.z, b.x, b.z);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const base = Math.min(this.heightAt(a.x, a.z), this.heightAt(mx, mz), this.heightAt(b.x, b.z));
    const p = {
      id: this.nextId++, kind: 'piece', wall: true, a, b, side, material, M, len, x: mx, z: mz, base,
      angle: Math.atan2(b.x - a.x, b.z - a.z), gate: false, open: false,
      hp: ready ? M.hp * len / PIECE_MAX : 1, maxHp: M.hp * len / PIECE_MAX,
      state: ready ? 'up' : 'site', progress: ready ? 1 : 0, claims: new Map(),
    };
    a.pieces.push(p); b.pieces.push(p);
    this.pieces.push(p);
    return p;
  }

  // A tower on a node (a wall's end or joint) or anywhere along a wall, which splits it there.
  canPlaceTower(x, z, side, material, { avoid = null, afford = null } = {}) {
    const cost = WALL_COSTS[material].tower;
    if (afford && !afford(cost)) return { ok: false, reason: 'Not enough goods', cost };
    const at = this.towerSpot(x, z, side);
    if (at.node?.tower) return { ok: false, reason: 'There is a tower here already', cost };
    const R = MATERIALS[material].towerR;
    for (const n of this.nodes) if (n.tower && n !== at.node && dist(n.x, n.z, at.x, at.z) < R + n.tower.M.towerR + 2) return { ok: false, reason: 'Too close to another tower', cost };
    if (!at.node && !at.piece && avoid && avoid(at.x, at.z, R + 1)) return { ok: false, reason: 'Something is in the way', cost };
    if (at.piece?.gate) return { ok: false, reason: 'Not on a gate', cost };
    return { ok: true, cost, at };
  }

  towerSpot(x, z, side) {
    const s = this.snapPoint(x, z, side);
    if (s.node) return s;
    const hit = this.pieceAt(x, z, side, 3);
    if (hit) {
      const p = hit.piece, t = Math.max(0.2, Math.min(0.8, hit.t));
      return { x: p.a.x + (p.b.x - p.a.x) * t, z: p.a.z + (p.b.z - p.a.z) * t, piece: p };
    }
    return { x, z };
  }

  placeTower(x, z, side, material, { ready = false, avoid = null, afford = null } = {}) {
    const check = this.canPlaceTower(x, z, side, material, { avoid, afford });
    if (!check.ok) return check;
    const { at } = check;
    let n = at.node;
    if (!n && at.piece) n = this.split(at.piece, at.x, at.z);
    if (!n) n = this.node(at.x, at.z, side, { snap: false });
    const M = MATERIALS[material];
    n.tower = { kind: 'tower', wall: true, node: n, side, material, M, x: n.x, z: n.z, base: this.heightAt(n.x, n.z),
      hp: ready ? M.towerHp : 1, maxHp: M.towerHp, state: ready ? 'up' : 'site', progress: ready ? 1 : 0, claims: new Map() };
    this.changed();
    return { ok: true, tower: n.tower, cost: check.cost };
  }

  // Cuts a piece in two at a point, joined by a new node.
  split(p, x, z) {
    const n = this.node(x, z, p.side, { snap: false });
    this.removePiece(p);
    const k = p.hp / p.maxHp;
    for (const [a, b] of [[p.a, n], [n, p.b]]) {
      const q = this.addPiece(a, b, p.side, p.material, p.state === 'up');
      q.state = p.state; q.progress = p.progress; q.hp = q.maxHp * k;
    }
    return n;
  }

  removePiece(p) {
    this.pieces = this.pieces.filter(o => o !== p);
    p.a.pieces = p.a.pieces.filter(o => o !== p);
    p.b.pieces = p.b.pieces.filter(o => o !== p);
    p.removed = true;
  }

  canMakeGate(p, { afford = null } = {}) {
    if (!p || p.removed) return { ok: false, reason: 'Click on a wall' };
    const cost = WALL_COSTS[p.material].gate;
    if (p.gate) return { ok: false, reason: 'Already a gate', cost };
    if (p.len < GATE_MIN) return { ok: false, reason: 'This stretch is too short for a gate', cost };
    if (afford && !afford(cost)) return { ok: false, reason: 'Not enough goods', cost };
    return { ok: true, cost };
  }

  // A gate replaces one piece of wall: a door in the middle half that its owner passes through.
  makeGate(p, { ready = false, afford = null } = {}) {
    const check = this.canMakeGate(p, { afford });
    if (!check.ok) return check;
    p.gate = true;
    p.maxHp = p.M.gateHp * p.len / PIECE_MAX;
    if (ready) { p.hp = p.maxHp; p.state = 'up'; p.progress = 1; }
    else { p.state = 'site'; p.progress = 0; p.hp = 1; }
    this.changed();
    return { ok: true, piece: p, cost: check.cost };
  }

  // Pulls down a piece or tower. Returns half its cost if it was standing.
  demolish(s) {
    if (s.kind === 'tower') { s.node.tower = null; s.removed = true; }
    else this.removePiece(s);
    this.nodes = this.nodes.filter(n => n.tower || n.pieces.length);
    this.ladders = this.ladders.filter(l => !l.piece.removed);
    this.changed();
  }

  // A broken piece or tower can be built again from scratch.
  repairCost(s) { return s.kind === 'tower' ? WALL_COSTS[s.material].tower : this.pieceCost(s); }
  pieceCost(p) {
    const c = scaleCost(WALL_COSTS[p.material].wall, p.len / PIECE_MAX);
    return p.gate ? addCost(c, WALL_COSTS[p.material].gate) : c;
  }
  repair(s) {
    if (s.state !== 'broken') return false;
    s.state = 'site'; s.progress = 0; s.hp = 1; s.open = false;
    this.changed();
    return true;
  }

  // Building sites rise on their own: `crews` of masons work the oldest sites at once,
  // a 10 m stretch of palisade taking one crew about 8 s and of stone 20 s. Returns what was finished.
  build(dt, crews = 1) {
    const done = [];
    const sites = this.structures().filter(s => s.state === 'site').sort((a, b) => a.id - b.id).slice(0, Math.max(1, Math.round(crews)));
    for (const s of sites) {
      const len = s.kind === 'tower' ? 14 : Math.max(4, s.len);
      s.progress = Math.min(1, s.progress + dt * PIECE_MAX / (s.M.build * len));
      s.hp = Math.max(s.hp, s.maxHp * s.progress);
      if (s.progress >= 1) { s.state = 'up'; s.hp = s.maxHp; done.push(s); }
    }
    if (done.length) this.changed();
    return done;
  }

  // ---- damage ----

  structures() { return [...this.pieces, ...this.nodes.filter(n => n.tower).map(n => n.tower)]; }

  // kind: 'melee' (axes and swords, which barely scratch stone), 'ram' or 'stone' (thrown).
  damage(s, dmg, kind = 'stone') {
    if (s.state === 'broken' || s.removed) return false;
    let k = 1;
    if (kind === 'melee') k = s.gate ? (s.material === 'stone' ? 0.25 : 1) : s.M.melee;
    if (kind === 'ram') k = s.gate ? 1 : s.material === 'stone' ? 0.25 : 0.8;
    if (kind === 'stone' && s.gate) k = 0.7;
    s.hp -= dmg * k;
    s.lastHit = performance.now();
    if (s.hp > 0) return false;
    s.hp = 0;
    s.state = 'broken';
    s.open = true;
    for (const l of this.ladders) if (l.piece === s) l.down = true;
    this.ladders = this.ladders.filter(l => !l.down);
    this.changed();
    this.onBreak?.(s);
    return true;
  }

  // ---- finding things ----

  pieceAt(x, z, side = null, within = 2.5) {
    let best = null;
    for (const p of this.pieces) {
      if (side !== null && p.side !== side) continue;
      const h = toSegment(x, z, p.a.x, p.a.z, p.b.x, p.b.z);
      if (h.d < p.M.thick / 2 + within && (!best || h.d < best.d)) best = { piece: p, ...h };
    }
    return best;
  }

  towerAt(x, z, side = null, within = 1.5) {
    for (const n of this.nodes) if (n.tower && (side === null || n.side === side) && dist(n.x, n.z, x, z) < n.tower.M.towerR + within) return n.tower;
    return null;
  }

  // Whatever wall thing is under a point: a tower first, then a piece.
  structureAt(x, z, side = null) {
    return this.towerAt(x, z, side) || this.pieceAt(x, z, side)?.piece || null;
  }

  // Which side of a piece is "outside": away from its owner's home.
  outward(p, home) {
    const nx = Math.cos(p.angle), nz = -Math.sin(p.angle);    // a normal to the piece
    const s = (home.x - p.x) * nx + (home.z - p.z) * nz;
    return s > 0 ? { x: -nx, z: -nz } : { x: nx, z: nz };
  }

  // Where soldiers stand on top: the walkway's height at a point on a piece, or a tower's top.
  walkY(perch, x, z) {
    if (!perch) return this.heightAt(x, z);
    if (perch.kind === 'tower') return perch.base + perch.M.towerTop;
    return perch.base + perch.M.walk;
  }

  // ---- posts on the walls ----
  // Each piece has room for a row (or two, on stone) of soldiers every 1.3 m; each tower a few on top.
  // Regiments claim posts outward from where they were sent, along standing pieces and towers.

  postsOf(s, home) {
    if (s._posts && s._postsV === this.version) return s._posts;
    const list = [];
    if (s.kind === 'tower') {
      const k = s.M.towerPosts, R = s.M.towerR - 1;
      for (let i = 0; i < k; i++) {
        const a = i / k * Math.PI * 2, r = i % 2 ? R : R * 0.45;
        list.push({ x: s.x + Math.sin(a) * r, z: s.z + Math.cos(a) * r, perch: s, i });
      }
    } else {
      const out = this.outward(s, home);
      const rows = s.M.thick >= 2.5 ? [0.45, -0.45] : [0.2];
      const n = Math.max(1, Math.floor(s.len / POST_GAP));
      for (const off of rows) for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const lo = (s.gate ? 1 : 0);
        list.push({ x: s.a.x + (s.b.x - s.a.x) * t + out.x * off * s.M.thick, z: s.a.z + (s.b.z - s.a.z) * t + out.z * off * s.M.thick, perch: s, i: list.length, t, front: off > 0, lo });
      }
    }
    s._posts = list; s._postsV = this.version;
    return list;
  }

  // Claims up to `count` free posts nearest (along the wall) to where the order was given.
  claimPosts(reg, start, x, z, count, home) {
    this.release(reg);
    const posts = [];
    const seen = new Set([start]);
    // Breadth-first along standing pieces and towers, nearest to the click first.
    let frontier = [start];
    while (frontier.length && posts.length < count) {
      const free = [];
      for (const s of frontier) for (const p of this.postsOf(s, home)) if (!s.claims.has(p.i)) free.push(p);
      free.sort((a, b) => (b.front - a.front) * 40 + dist(a.x, a.z, x, z) - dist(b.x, b.z, x, z));
      for (const p of free) {
        if (posts.length >= count) break;
        p.perch.claims.set(p.i, reg);
        posts.push(p);
      }
      const next = [];
      for (const s of frontier) for (const o of this.neighbours(s)) if (!seen.has(o) && o.state === 'up') { seen.add(o); next.push(o); }
      next.sort((a, b) => dist(a.x, a.z, x, z) - dist(b.x, b.z, x, z));
      frontier = next;
    }
    reg.posts = posts;
    return posts;
  }

  release(reg) {
    for (const p of reg.posts || []) if (p.perch.claims.get(p.i) === reg) p.perch.claims.delete(p.i);
    reg.posts = null;
  }

  // Pieces and towers that touch this one on the walkway.
  neighbours(s) {
    if (s.kind === 'tower') return s.node.pieces;
    const out = [];
    for (const n of [s.a, s.b]) {
      if (n.tower) out.push(n.tower);
      else for (const p of n.pieces) if (p !== s) out.push(p);
    }
    return out;
  }

  // A walking route along the walkway from one perch to another, as points to walk through,
  // or null when the way is cut (a broken piece in between).
  route(from, fx, fz, to, tx, tz) {
    if (from === to) return [{ x: tx, z: tz, perch: to }];
    // Dijkstra over perches; small networks, so a plain array scan is fine.
    const d = new Map([[from, 0]]), prev = new Map(), done = new Set();
    const at = s => s.kind === 'tower' ? s : s;
    const centre = s => ({ x: s.x, z: s.z });
    for (;;) {
      let cur = null, cd = Infinity;
      for (const [s, v] of d) if (!done.has(s) && v < cd) { cd = v; cur = s; }
      if (!cur || cur === to) break;
      done.add(cur);
      for (const o of this.neighbours(cur)) {
        if (o.state !== 'up' && o !== to) continue;
        const c1 = centre(at(cur)), c2 = centre(o);
        const nd = cd + dist(c1.x, c1.z, c2.x, c2.z);
        if (nd < (d.get(o) ?? Infinity)) { d.set(o, nd); prev.set(o, cur); }
      }
    }
    if (!prev.has(to)) return null;
    const chain = [to];
    while (chain[0] !== from) chain.unshift(prev.get(chain[0]));
    // Walk through the joints between perches, then to the target point.
    const pts = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const j = this.joint(chain[i], chain[i + 1]);
      pts.push({ x: j.x, z: j.z, perch: chain[i + 1] });
    }
    pts.push({ x: tx, z: tz, perch: to });
    return pts;
  }

  joint(a, b) {
    if (a.kind === 'tower') return a.node;
    if (b.kind === 'tower') return b.node;
    return a.a === b.a || a.a === b.b ? a.a : a.b;
  }

  // Keeps a point on a perch's walkway: within the wall's thickness and between its ends.
  clampTo(perch, x, z) {
    if (perch.kind === 'tower') {
      const R = perch.M.towerR - 0.4, dx = x - perch.x, dz = z - perch.z, d = Math.hypot(dx, dz);
      return d <= R ? { x, z } : { x: perch.x + dx / d * R, z: perch.z + dz / d * R };
    }
    const p = perch, ux = (p.b.x - p.a.x) / p.len, uz = (p.b.z - p.a.z) / p.len;
    let along = (x - p.a.x) * ux + (z - p.a.z) * uz;
    let side = (x - p.a.x) * uz - (z - p.a.z) * ux;
    along = Math.max(-0.5, Math.min(p.len + 0.5, along));
    const half = Math.max(0.2, p.M.thick / 2 - 0.25);
    side = Math.max(-half, Math.min(half, side));
    return { x: p.a.x + ux * along + uz * side, z: p.a.z + uz * along - ux * side };
  }

  // ---- ladders ----

  // A ladder against the outer face of a piece, at the point nearest (x, z).
  raiseLadder(p, x, z, side, home) {
    if (p.state !== 'up' || p.gate) return null;
    const h = toSegment(x, z, p.a.x, p.a.z, p.b.x, p.b.z);
    const t = Math.max(0.15, Math.min(0.85, h.t));
    const out = this.outward(p, home);
    const cx = p.a.x + (p.b.x - p.a.x) * t, cz = p.a.z + (p.b.z - p.a.z) * t;
    const off = p.M.thick / 2 + 1.8;
    const l = { id: this.nextId++, piece: p, side, x: cx, z: cz, foot: { x: cx + out.x * off, z: cz + out.z * off }, out, hp: 60, raisedAt: 0, down: false };
    this.ladders.push(l);
    return l;
  }

  pushDown(l) {
    l.down = true;
    this.ladders = this.ladders.filter(o => o !== l);
  }

  // ---- for auto-resolve and AI ----

  // A rough measure of how much the walls of one side are worth to its defenders.
  defenceValue(side) {
    let v = 0;
    for (const s of this.structures()) if (s.side === side && s.state === 'up') v += s.hp / (s.kind === 'tower' ? 600 : 400);
    return v;
  }

  // The weakest standing stretch, by hit points left (gates count double as targets).
  weakest(side, near = null) {
    let best = null, bs = Infinity;
    for (const p of this.pieces) {
      if (p.side !== side || p.state !== 'up') continue;
      const score = p.hp * (p.gate ? 0.5 : 1) + (near ? dist(p.x, p.z, near.x, near.z) * 8 : 0);
      if (score < bs) { bs = score; best = p; }
    }
    return best;
  }
}

// A ring of walls around (cx, cz): `sides` straight runs with a tower at each corner
// and a gate facing `gateAngle`. Used for forts in the battle test and for castles.
export function buildFort(walls, side, cx, cz, radius, { material = 'stone', sides = 6, gateAngle = 0, towers = true } = {}) {
  walls.centre[side] = { x: cx, z: cz };
  const corners = [];
  for (let i = 0; i < sides; i++) {
    const a = gateAngle + Math.PI / sides + i / sides * Math.PI * 2;
    corners.push({ x: cx + Math.sin(a) * radius, z: cz + Math.cos(a) * radius });
  }
  for (let i = 0; i < sides; i++) {
    const p = corners[i], q = corners[(i + 1) % sides];
    walls.placeLine(p.x, p.z, q.x, q.z, side, material, { ready: true });
  }
  if (towers) for (const c of corners) walls.placeTower(c.x, c.z, side, material, { ready: true });
  // The gate: the piece crossing the gate's bearing.
  const gx = cx + Math.sin(gateAngle) * radius * Math.cos(Math.PI / sides), gz = cz + Math.cos(gateAngle) * radius * Math.cos(Math.PI / sides);
  const hit = walls.pieceAt(gx, gz, side, 6);
  if (hit) walls.makeGate(hit.piece, { ready: true });
  return walls;
}
