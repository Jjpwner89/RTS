// Marchfront: the simulation. Armies move, fight, hold land, take towns and draw supply from the capital.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const MF = G.MF;
  const T = MF.T;

  const C = (MF.C = {
    SPEED: 1.1,        // cells per second on open plains
    HOSTILE: 0.55,     // pace on enemy-held land
    ENGAGE: 2.8,       // armies closer than this fight
    CONTROL: 3,        // radius of land an army holds
    MAX: 100,          // largest army
    RAISE_COST: 30,
    RAISE_STR: 30,
    DPS: 0.04,         // share of its strength an army deals each second
    REINFORCE: 1.6,    // strength per second a supplied army refills
    ATTRITION: 0.5,    // strength per second an army out of supply loses
    CAPTURE: { neutral: 2, town: 4, capital: 8 }, // seconds to take a town once its garrison is beaten
    GARRISON: { neutral: 15, town: 30, capital: 70 },
    GARRISON_REGEN: 1.2,
  });

  MF.SIDES = [
    { name: 'Halvard March', short: 'Halvard', color: [47, 93, 138] },
    { name: 'Corvane Dominion', short: 'Corvane', color: [156, 58, 46] },
  ];

  const cellOf = (MF.cellOf = function (g, x, y) {
    const cx = Math.min(g.W - 1, Math.max(0, Math.floor(x)));
    const cy = Math.min(g.H - 1, Math.max(0, Math.floor(y)));
    return cy * g.W + cx;
  });

  MF.newGame = function (opts = {}) {
    const map = MF.makeMap(opts.seed ?? 7);
    const { W, H } = map;
    const owner = new Int8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        owner[i] = map.ter[i] === T.SEA ? -1 : x < W * 0.36 ? 0 : x >= W * 0.64 ? 1 : -1;
      }
    }
    const townAt = new Int16Array(W * H).fill(-1);
    const towns = map.towns.map((t, id) => {
      const cell = t.y * W + t.x;
      townAt[cell] = id;
      owner[cell] = t.side;
      return { id, name: t.name, x: t.x + 0.5, y: t.y + 0.5, cell, capital: t.capital, owner: t.side, capSide: -1, capP: 0, gar: garMax(t) };
    });
    const g = {
      map, W, H, owner, townAt, towns,
      armies: [], byId: new Map(), nextId: 1, t: 0,
      supplied: [new Uint8Array(W * H), new Uint8Array(W * H)],
      manpower: [30, 30], income: [0, 0], mult: opts.mult ?? [1, 1], ai: opts.ai ?? [false, true],
      winner: -1, rand: MF.rng(opts.simSeed ?? (Math.random() * 1e9) | 0),
      tick: 0, aiT: [0.6, 0], log: [], ownerVersion: 0,
      stats: [{ lost: 0, killed: 0, raised: 0, taken: 0 }, { lost: 0, killed: 0, raised: 0, taken: 0 }],
    };
    // Start each army a little in front of its town so both stay visible.
    for (const t of towns) if (t.owner >= 0) spawn(g, t.owner, t.x + (t.owner === 0 ? 2.5 : -2.5), t.y, t.capital ? 60 : 40);
    supplyTick(g, true);
    return g;
  };

  const garMax = (MF.garMax = (t) =>
    t.capital ? C.GARRISON.capital : (t.owner ?? t.side) < 0 ? C.GARRISON.neutral : C.GARRISON.town);

  function spawn(g, side, x, y, str) {
    const a = { id: g.nextId++, side, x, y, str, path: [], order: null, eng: [], dmg: 0, still: 10, supplied: true, repath: 0, hit: 0, dead: false };
    g.armies.push(a);
    g.byId.set(a.id, a);
    return a;
  }

  MF.passable = (g, x, y) => x >= 0 && y >= 0 && x < g.W && y < g.H && g.map.cost[cellOf(g, x, y)] !== Infinity;

  function nearestPassable(g, x, y) {
    const c = cellOf(g, x, y);
    if (g.map.cost[c] !== Infinity) return c;
    const cx = c % g.W, cy = (c / g.W) | 0;
    for (let r = 1; r < 10; r++) {
      let best = -1, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
          const j = ny * g.W + nx;
          if (g.map.cost[j] === Infinity) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = j; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  function setPath(g, a, x, y) {
    const { W, H } = g;
    const goal = nearestPassable(g, x, y);
    if (goal < 0) return false;
    const exact = goal === cellOf(g, x, y);
    const end = exact ? { x, y } : { x: (goal % W) + 0.5, y: ((goal / W) | 0) + 0.5 };
    const start = cellOf(g, a.x, a.y);
    if (start === goal) { a.path = [end]; return true; }
    const cells = MF.astar(W, H, g.map.cost, g.map.minCost, start, goal);
    if (!cells) return false;
    const pts = [];
    let pdx = 0, pdy = 0;
    for (let k = 1; k < cells.length; k++) {
      const c = cells[k], p = cells[k - 1];
      const dx = (c % W) - (p % W), dy = ((c / W) | 0) - ((p / W) | 0);
      const pt = { x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5 };
      if (k > 1 && dx === pdx && dy === pdy) pts[pts.length - 1] = pt;
      else pts.push(pt);
      pdx = dx; pdy = dy;
    }
    pts[pts.length - 1] = end;
    a.path = pts;
    return true;
  }

  MF.orderMove = function (g, a, x, y) {
    if (setPath(g, a, x, y)) a.order = { type: 'move', x, y };
  };
  MF.orderAttack = function (g, a, b) {
    a.order = { type: 'attack', id: b.id };
    a.repath = 0;
  };
  MF.orderMerge = function (g, a, b) {
    if (a === b || a.side !== b.side) return;
    a.order = { type: 'merge', id: b.id };
    a.repath = 0;
  };
  MF.orderStop = function (a) {
    a.order = null;
    a.path = [];
  };

  MF.near = function (g, side, x, y, r) {
    let s = 0;
    for (const a of g.armies) if (a.side === side && (a.x - x) ** 2 + (a.y - y) ** 2 < r * r) s += a.str;
    return s;
  };

  MF.canRaiseAt = (g, s, t) =>
    t.owner === s && !!g.supplied[s][t.cell] && g.manpower[s] >= C.RAISE_COST && MF.near(g, 1 - s, t.x, t.y, 5) === 0;

  MF.raise = function (g, s, t) {
    if (!MF.canRaiseAt(g, s, t)) return null;
    g.manpower[s] -= C.RAISE_COST;
    g.stats[s].raised++;
    return spawn(g, s, t.x + (g.rand() - 0.5) * 0.6, t.y + (g.rand() - 0.5) * 0.6, C.RAISE_STR);
  };

  MF.split = function (g, a) {
    if (a.str < 16 || a.eng.length) return null;
    const half = a.str / 2;
    let bx = a.x, by = a.y;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + 0.4;
      const nx = a.x + Math.cos(ang) * 1.4, ny = a.y + Math.sin(ang) * 1.4;
      if (MF.passable(g, nx, ny)) { bx = nx; by = ny; break; }
    }
    a.str = half;
    const b = spawn(g, a.side, bx, by, half);
    b.still = a.still;
    return b;
  };

  MF.defenseOf = function (g, b) {
    const ci = cellOf(g, b.x, b.y);
    let d = g.map.def[ci];
    if (!b.path.length) d *= 1 + 0.35 * Math.min(1, b.still / 6);
    for (const t of g.towns) {
      if (t.owner === b.side && (t.x - b.x) ** 2 + (t.y - b.y) ** 2 < 4) d *= t.capital ? 1.6 : 1.35;
    }
    return d;
  };

  MF.step = function (g, dt) {
    if (g.winner >= 0) return;
    g.t += dt;
    let A = g.armies;

    for (const a of A) {
      if (!a.order || a.order.type === 'move') continue;
      const b = g.byId.get(a.order.id);
      if (!b || b.dead) { MF.orderStop(a); continue; }
      if ((a.repath -= dt) <= 0) { a.repath = 0.8; setPath(g, a, b.x, b.y); }
    }

    for (const a of A) a.eng.length = 0;
    const E2 = C.ENGAGE * C.ENGAGE;
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        const a = A[i], b = A[j];
        if (a.side === b.side) continue;
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < E2) { a.eng.push(b); b.eng.push(a); }
      }
    }
    for (const a of A) {
      if (!a.eng.length) continue;
      const ci = cellOf(g, a.x, a.y);
      const wading = g.map.ter[ci] === T.RIVER && !g.map.road[ci];
      const atk = (C.DPS * a.str * (a.supplied ? 1 : 0.6) * (wading ? 0.75 : 1)) / a.eng.length;
      for (const b of a.eng) b.dmg += (atk * (0.85 + 0.3 * g.rand())) / MF.defenseOf(g, b);
    }
    for (const a of A) {
      if (a.dmg <= 0) continue;
      const d = Math.min(a.dmg, a.str);
      a.str -= d;
      g.stats[a.side].lost += d;
      g.stats[1 - a.side].killed += d;
      a.dmg = 0;
      a.hit = 0.25;
    }

    for (const a of A) move(g, a, dt);
    separate(g, dt);

    for (const a of A) {
      if (!a.order || a.order.type !== 'merge') continue;
      const b = g.byId.get(a.order.id);
      if (!b || b.dead || (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 2.25) continue;
      const total = a.str + b.str;
      b.str = Math.min(C.MAX, total);
      a.str = total - b.str;
      MF.orderStop(a);
    }

    for (const a of A) {
      if (a.supplied) {
        const room = C.MAX - a.str, spare = g.manpower[a.side] - C.RAISE_COST;
        if (room > 0 && spare > 0) {
          const amt = Math.min(C.REINFORCE * dt * (a.eng.length || a.siege ? 0.4 : 1), room, spare);
          a.str += amt;
          g.manpower[a.side] -= amt;
        }
      } else a.str -= C.ATTRITION * dt;
      if (a.hit > 0) a.hit -= dt;
      if (a.str < 1) a.dead = true;
    }
    if (A.some((a) => a.dead)) {
      for (const a of A) if (a.dead) g.byId.delete(a.id);
      g.armies = A = A.filter((a) => !a.dead);
    }

    paint(g);
    townTick(g, dt);
    if ((g.tick += dt) >= 0.5) { g.tick -= 0.5; supplyTick(g, false); }
    for (let s = 0; s < 2; s++) {
      if (g.ai[s] && (g.aiT[s] -= dt) <= 0) { g.aiT[s] = 1.2; MF.aiThink(g, s); }
    }
  };

  function retreating(a, nx, ny) {
    for (const b of a.eng) {
      if ((nx - b.x) ** 2 + (ny - b.y) ** 2 < (a.x - b.x) ** 2 + (a.y - b.y) ** 2 - 1e-9) return false;
    }
    return true;
  }

  function move(g, a, dt) {
    if (!a.path.length) { a.still += dt; return; }
    a.still = 0;
    const ci = cellOf(g, a.x, a.y);
    const hostile = g.owner[ci] === 1 - a.side ? C.HOSTILE : 1;
    let budget = C.SPEED * hostile * g.map.speed[ci] * (1.1 - (0.25 * a.str) / C.MAX) * dt * (a.eng.length ? 0.6 : 1);
    while (budget > 1e-6 && a.path.length) {
      const p = a.path[0];
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      const len = Math.min(d, budget);
      const nx = d > 0 ? a.x + (dx / d) * len : p.x, ny = d > 0 ? a.y + (dy / d) * len : p.y;
      if (a.eng.length && !retreating(a, nx, ny)) break;
      a.x = nx; a.y = ny;
      budget -= len;
      if (len >= d - 1e-6) a.path.shift();
    }
    if (!a.path.length && a.order && a.order.type === 'move') a.order = null;
  }

  // Friendly armies drift apart so tokens stay readable.
  function separate(g, dt) {
    const A = g.armies, R = 1.6;
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        const a = A[i], b = A[j];
        if (a.side !== b.side) continue;
        if ((a.order && a.order.id === b.id) || (b.order && b.order.id === a.id)) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d < 1e-3) { dx = g.rand() - 0.5; dy = g.rand() - 0.5; } else { dx /= d; dy /= d; }
        const push = (R - d) * dt * 1.5;
        if (MF.passable(g, a.x - dx * push, a.y - dy * push)) { a.x -= dx * push; a.y -= dy * push; }
        if (MF.passable(g, b.x + dx * push, b.y + dy * push)) { b.x += dx * push; b.y += dy * push; }
      }
    }
  }

  function paint(g) {
    const { W, H, owner, townAt } = g;
    const ter = g.map.ter, A = g.armies;
    const R = C.CONTROL, R2 = R * R, CR2 = (R + 0.5) ** 2;
    for (const a of A) {
      const x0 = Math.max(0, Math.floor(a.x - R)), x1 = Math.min(W - 1, Math.floor(a.x + R));
      const y0 = Math.max(0, Math.floor(a.y - R)), y1 = Math.min(H - 1, Math.floor(a.y + R));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          if ((cx - a.x) ** 2 + (cy - a.y) ** 2 > R2) continue;
          const i = y * W + x;
          if (owner[i] === a.side || ter[i] === T.SEA || townAt[i] >= 0) continue;
          let contested = false;
          for (const b of A) if (b.side !== a.side && (cx - b.x) ** 2 + (cy - b.y) ** 2 < CR2) { contested = true; break; }
          if (contested) continue;
          owner[i] = a.side;
          g.ownerVersion++;
        }
      }
    }
  }

  // A town's garrison fights any enemy army standing in it with no defenders near; once it is beaten the town can be taken.
  function townTick(g, dt) {
    for (const a of g.armies) a.siege = false;
    for (const t of g.towns) {
      const pres = [0, 0], near = [0, 0];
      for (const a of g.armies) {
        const d2 = (a.x - t.x) ** 2 + (a.y - t.y) ** 2;
        if (d2 < 12.25) {
          near[a.side] += a.str;
          if (d2 < 4) pres[a.side] += a.str;
        }
      }
      let s = -1;
      for (let k = 0; k < 2; k++) if (k !== t.owner && pres[k] > 0 && near[1 - k] === 0) s = k;
      t.sieged = s >= 0 && t.gar > 0;
      if (s < 0) {
        t.capP = Math.max(0, t.capP - dt * 0.5);
        if (!t.capP) t.capSide = -1;
        if (t.owner < 0 || g.supplied[t.owner][t.cell]) t.gar = Math.min(garMax(t), t.gar + C.GARRISON_REGEN * dt);
        continue;
      }
      if (t.gar > 0) {
        const wall = t.capital ? 1.6 : 1.35;
        let back = 0;
        for (const a of g.armies) {
          if (a.side !== s || (a.x - t.x) ** 2 + (a.y - t.y) ** 2 >= 4) continue;
          t.gar -= (C.DPS * a.str * (a.supplied ? 1 : 0.6) * dt) / wall;
          back += a.str;
          a.siege = true;
        }
        for (const a of g.armies) {
          if (a.side !== s || (a.x - t.x) ** 2 + (a.y - t.y) ** 2 >= 4) continue;
          const d = (C.DPS * Math.max(0, t.gar) * dt * (a.str / back)) / MF.defenseOf(g, a);
          a.str -= d;
          g.stats[s].lost += d;
          a.hit = 0.25;
        }
        if (t.gar > 0) continue;
        t.gar = 0;
      }
      if (t.capSide !== s) { t.capSide = s; t.capP = 0; }
      const need = t.owner < 0 ? C.CAPTURE.neutral : t.capital ? C.CAPTURE.capital : C.CAPTURE.town;
      t.capP += dt / need;
      if (t.capP >= 1) capture(g, t, s);
    }
  }

  function capture(g, t, s) {
    const prev = t.owner;
    t.owner = s; t.capP = 0; t.capSide = -1;
    t.gar = garMax(t) * 0.3;
    const { W, H, owner } = g;
    const tx = Math.floor(t.x), ty = Math.floor(t.y);
    for (let y = Math.max(0, ty - 2); y <= Math.min(H - 1, ty + 2); y++) {
      for (let x = Math.max(0, tx - 2); x <= Math.min(W - 1, tx + 2); x++) {
        const i = y * W + x;
        if (g.map.ter[i] !== T.SEA && (x - tx) ** 2 + (y - ty) ** 2 <= 5) owner[i] = s;
      }
    }
    g.ownerVersion++;
    g.stats[s].taken++;
    const who = MF.SIDES[s].short;
    g.log.push({ t: g.t, side: s, text: prev < 0 ? `${who} takes ${t.name}` : `${t.name} falls to ${who}` });
    if (t.capital && prev >= 0) g.winner = s;
  }

  let queue = null;
  function supplyTick(g, init) {
    const { W, H, owner, townAt } = g;
    const N = W * H, ter = g.map.ter;
    if (!queue || queue.length !== N) queue = new Int32Array(N);
    for (let s = 0; s < 2; s++) {
      const sup = g.supplied[s];
      sup.fill(0);
      let head = 0, tail = 0;
      for (const t of g.towns) if (t.capital && t.owner === s) { sup[t.cell] = 1; queue[tail++] = t.cell; }
      while (head < tail) {
        const i = queue[head++], x = i % W;
        if (x > 0 && owner[i - 1] === s && !sup[i - 1]) { sup[i - 1] = 1; queue[tail++] = i - 1; }
        if (x < W - 1 && owner[i + 1] === s && !sup[i + 1]) { sup[i + 1] = 1; queue[tail++] = i + 1; }
        if (i >= W && owner[i - W] === s && !sup[i - W]) { sup[i - W] = 1; queue[tail++] = i - W; }
        if (i < N - W && owner[i + W] === s && !sup[i + W]) { sup[i + W] = 1; queue[tail++] = i + W; }
      }
    }
    const [s0, s1] = g.supplied;
    for (const a of g.armies) {
      const sup = g.supplied[a.side], ax = Math.floor(a.x), ay = Math.floor(a.y);
      a.supplied = false;
      for (let y = ay - 1; y <= ay + 1 && !a.supplied; y++) {
        for (let x = ax - 1; x <= ax + 1; x++) {
          if (x >= 0 && y >= 0 && x < W && y < H && sup[y * W + x]) { a.supplied = true; break; }
        }
      }
    }
    if (init) return;

    // Supplied land spreads into neutral ground; cut-off land is slowly absorbed by a supplied neighbour.
    const flips = [];
    for (let i = 0; i < N; i++) {
      const o = owner[i];
      if (ter[i] === T.SEA || townAt[i] >= 0) continue;
      if (o >= 0 && g.supplied[o][i]) continue;
      const x = i % W;
      let n0 = 0, n1 = 0;
      const nb = (j) => { if (s0[j]) n0++; else if (s1[j]) n1++; };
      if (x > 0) nb(i - 1);
      if (x < W - 1) nb(i + 1);
      if (i >= W) nb(i - W);
      if (i < N - W) nb(i + W);
      let s;
      if (o < 0) {
        if (!n0 && !n1) continue;
        if (g.rand() > 0.06 * (n0 + n1)) continue;
        s = n0 && n1 ? (g.rand() * (n0 + n1) < n0 ? 0 : 1) : n0 ? 0 : 1;
      } else {
        const n = o === 0 ? n1 : n0;
        if (!n || g.rand() > 0.2) continue;
        s = 1 - o;
      }
      if (MF.near(g, 1 - s, x + 0.5, ((i / W) | 0) + 0.5, 3.5) > 0) continue;
      flips.push(i, s);
    }
    for (let k = 0; k < flips.length; k += 2) owner[flips[k]] = flips[k + 1];
    if (flips.length) g.ownerVersion++;

    for (let s = 0; s < 2; s++) {
      let inc = 0.4;
      for (const t of g.towns) if (t.owner === s && g.supplied[s][t.cell]) inc += t.capital ? 0.8 : 0.45;
      g.income[s] = inc * g.mult[s];
      g.manpower[s] += g.income[s] * 0.5;
    }
  }
})();
