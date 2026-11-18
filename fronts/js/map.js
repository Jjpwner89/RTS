// Marchfront: the map of the Sundered Vale. Terrain, rivers, towns and roads, built from a fixed seed.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const MF = (G.MF = G.MF || {});

  MF.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function makeNoise(rand) {
    const vals = new Float32Array(256), perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) { vals[i] = rand(); perm[i] = i; }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const v = (x, y) => vals[perm[perm[x & 255] + (y & 255)]];
    const sm = (t) => t * t * (3 - 2 * t);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const u = sm(x - xi), w = sm(y - yi);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    }
    return function (x, y, oct = 4) {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { s += amp * n2(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
      return s / norm;
    };
  }

  const T = (MF.T = { SEA: 0, PLAIN: 1, FOREST: 2, HILL: 3, MOUNT: 4, RIVER: 5, FORD: 6 });
  // speed: share of open-ground pace. def: damage taken is divided by this.
  MF.TERRAIN = [
    { name: 'Sea', speed: 0, def: 1 },
    { name: 'Plains', speed: 1, def: 1 },
    { name: 'Forest', speed: 0.6, def: 1.3 },
    { name: 'Hills', speed: 0.7, def: 1.35 },
    { name: 'Mountains', speed: 0.3, def: 1.7 },
    { name: 'River', speed: 0.3, def: 0.75 },
    { name: 'Ford', speed: 0.75, def: 0.9 },
  ];
  MF.ROAD_SPEED = 1.35;

  // fx, fy are fractions of the map; each town snaps to the nearest dry, open ground.
  MF.TOWNS = [
    { name: 'Halvard', fx: 0.075, fy: 0.52, side: 0, capital: true },
    { name: 'Brenmoor', fx: 0.2, fy: 0.3, side: 0 },
    { name: 'Ostkell', fx: 0.18, fy: 0.76, side: 0 },
    { name: 'Wyther', fx: 0.3, fy: 0.54, side: 0 },
    { name: 'Corvane', fx: 0.925, fy: 0.48, side: 1, capital: true },
    { name: 'Saltreach', fx: 0.8, fy: 0.26, side: 1 },
    { name: 'Drossmere', fx: 0.82, fy: 0.72, side: 1 },
    { name: 'Iskel', fx: 0.7, fy: 0.46, side: 1 },
    { name: 'Millcross', fx: 0.41, fy: 0.32, side: -1 },
    { name: 'Fenwick', fx: 0.43, fy: 0.8, side: -1 },
    { name: 'Lowmarch', fx: 0.59, fy: 0.24, side: -1 },
    { name: 'Ashford', fx: 0.58, fy: 0.66, side: -1 },
  ];

  let buf = null;
  // A* over the grid. cost[i] is the price of entering cell i (Infinity = impassable).
  MF.astar = function (W, H, cost, minCost, start, goal) {
    const N = W * H;
    if (!buf || buf.N !== N) {
      buf = { N, g: new Float64Array(N), from: new Int32Array(N), seen: new Uint32Array(N), closed: new Uint32Array(N), stamp: 0 };
    }
    const { g, from, seen, closed } = buf;
    const stamp = ++buf.stamp;
    const gx = goal % W, gy = (goal / W) | 0;
    const hI = [], hF = [];
    const push = (i, f) => {
      let k = hI.length;
      hI.push(i); hF.push(f);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hF[p] <= f) break;
        hI[k] = hI[p]; hF[k] = hF[p]; k = p;
      }
      hI[k] = i; hF[k] = f;
    };
    const pop = () => {
      const top = hI[0];
      const li = hI.pop(), lf = hF.pop();
      const n = hI.length;
      if (n) {
        let k = 0;
        for (;;) {
          let c = 2 * k + 1;
          if (c >= n) break;
          if (c + 1 < n && hF[c + 1] < hF[c]) c++;
          if (hF[c] >= lf) break;
          hI[k] = hI[c]; hF[k] = hF[c]; k = c;
        }
        hI[k] = li; hF[k] = lf;
      }
      return top;
    };
    const h = (i) => {
      const dx = Math.abs((i % W) - gx), dy = Math.abs(((i / W) | 0) - gy);
      return (Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy)) * minCost;
    };
    g[start] = 0; seen[start] = stamp; from[start] = -1;
    push(start, h(start));
    while (hI.length) {
      const i = pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      if (i === goal) {
        const path = [];
        for (let k = i; k !== -1; k = from[k]) path.push(k);
        return path.reverse();
      }
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (cost[j] === Infinity || closed[j] === stamp) continue;
          if (dx && dy && (cost[y * W + nx] === Infinity || cost[ny * W + x] === Infinity)) continue;
          const ng = g[i] + (dx && dy ? 1.41421356 : 1) * 0.5 * (cost[i] + cost[j]);
          if (seen[j] !== stamp || ng < g[j]) {
            seen[j] = stamp; g[j] = ng; from[j] = i;
            push(j, ng + h(j));
          }
        }
      }
    }
    return null;
  };

  MF.makeMap = function (seed) {
    const W = 176, H = 110, N = W * H;
    const rand = MF.rng(seed);
    const fe = makeNoise(rand), fm = makeNoise(rand), fc = makeNoise(rand);
    const ter = new Uint8Array(N);
    const mid = W / 2;
    const riverX = (y) => mid + 5 * Math.sin(y * 0.075 + 1.3) + 2.5 * Math.sin(y * 0.19 + 0.4);

    // Blending each point with its mirror keeps the two banks roughly even without looking copied.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, mx = W - 1 - x;
        const e = 0.55 * fe(x * 0.05, y * 0.05) + 0.45 * fe(mx * 0.05, y * 0.05);
        const m = 0.55 * fm(x * 0.07, y * 0.07) + 0.45 * fm(mx * 0.07, y * 0.07);
        const coast = 4 + 8 * fc(x * 0.04, 2) + 10 * Math.exp(-(((x - mid) / 12) ** 2));
        const ridge = H - 5 - 7 * fc(x * 0.05, 9);
        const el = e + (y > ridge ? 0.3 : 0) + Math.max(0, y - H * 0.8) * 0.006;
        let t = T.PLAIN;
        if (y < coast) t = T.SEA;
        else if (el > 0.68) t = T.MOUNT;
        else if (el > 0.6) t = T.HILL;
        else if (m > 0.57) t = T.FOREST;
        ter[i] = t;
      }
    }

    const carve = (pts, r) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
        for (let s = 0; s <= steps; s++) {
          const px = x0 + ((x1 - x0) * s) / steps, py = y0 + ((y1 - y0) * s) / steps;
          for (let yy = Math.floor(py - r); yy <= Math.ceil(py + r); yy++) {
            for (let xx = Math.floor(px - r); xx <= Math.ceil(px + r); xx++) {
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              if ((xx + 0.5 - px) ** 2 + (yy + 0.5 - py) ** 2 > r * r) continue;
              const i = yy * W + xx;
              if (ter[i] !== T.SEA) ter[i] = T.RIVER;
            }
          }
        }
      }
    };
    const bez = (a, b, c) => {
      const out = [];
      for (let k = 0; k <= 30; k++) {
        const t = k / 30, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
      }
      return out;
    };
    const main = [];
    for (let y = 0; y <= H + 1; y += 2) main.push([riverX(y), y]);
    const wy = H * 0.64, ey = H * 0.36;
    const west = bez([W * 0.25, H + 1], [W * 0.33, H * 0.8], [riverX(wy), wy]);
    const east = bez([W * 0.75, H + 1], [W * 0.66, H * 0.62], [riverX(ey), ey]);
    carve(main, 1.05);
    carve(west, 0.75);
    carve(east, 0.75);
    const rivers = [{ pts: main, w: 1.9 }, { pts: west, w: 1.35 }, { pts: east, w: 1.35 }];

    // Fords: shallow crossings away from the bridges.
    const fords = [];
    const ford = (fx, fy, r) => {
      fords.push([fx, fy]);
      for (let y = Math.floor(fy - r); y <= fy + r; y++) {
        for (let x = Math.floor(fx - r - 2); x <= fx + r + 2; x++) {
          const i = y * W + x;
          if (ter[i] === T.RIVER && Math.abs(y + 0.5 - fy) <= r) ter[i] = T.FORD;
        }
      }
    };
    ford(riverX(H * 0.47), H * 0.47, 1.2);
    ford(riverX(H * 0.86), H * 0.86, 1.2);
    ford(west[15][0], west[15][1], 1.2);
    ford(east[12][0], east[12][1], 1.2);

    // Distance to water, so towns sit back from the banks.
    const wd = new Int16Array(N).fill(999);
    const q = [];
    for (let i = 0; i < N; i++) if (ter[i] === T.RIVER || ter[i] === T.FORD) { wd[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (wd[j] > wd[i] + 1) { wd[j] = wd[i] + 1; q.push(j); }
      }
    }

    const towns = MF.TOWNS.map((t) => {
      const tx = t.fx * W, ty = t.fy * H;
      let bx = Math.floor(tx), by = Math.floor(ty), bd = Infinity;
      for (let y = Math.floor(ty - 10); y <= ty + 10; y++) {
        for (let x = Math.floor(tx - 10); x <= tx + 10; x++) {
          if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
          const i = y * W + x;
          if (ter[i] === T.SEA || ter[i] === T.MOUNT || wd[i] < 4) continue;
          let sea = false;
          for (let k = -2; k <= 2 && !sea; k++) for (let l = -2; l <= 2; l++) if (ter[(y + k) * W + x + l] === T.SEA) sea = true;
          if (sea) continue;
          const d = (x + 0.5 - tx) ** 2 + (y + 0.5 - ty) ** 2;
          if (d < bd) { bd = d; bx = x; by = y; }
        }
      }
      for (let y = by - 2; y <= by + 2; y++) {
        for (let x = bx - 2; x <= bx + 2; x++) {
          const i = y * W + x, d = Math.hypot(x - bx, y - by);
          if (ter[i] === T.MOUNT) ter[i] = T.HILL;
          if (d < 1.5 && ter[i] !== T.RIVER && ter[i] !== T.FORD) ter[i] = T.PLAIN;
        }
      }
      return { name: t.name, x: bx, y: by, side: t.side, capital: !!t.capital };
    });

    // Roads: a spanning tree between towns plus a few extra links, routed over easy ground.
    const ROADCOST = [Infinity, 1, 1.8, 2.2, 5, 7, 3];
    const rc = new Float32Array(N);
    for (let i = 0; i < N; i++) rc[i] = ROADCOST[ter[i]];
    const road = new Uint8Array(N);
    const roads = [];
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const edges = [];
    const inTree = [0];
    while (inTree.length < towns.length) {
      let best = null;
      for (const a of inTree) {
        for (let b = 0; b < towns.length; b++) {
          if (inTree.includes(b)) continue;
          const d = dist(towns[a], towns[b]);
          if (!best || d < best[2]) best = [a, b, d];
        }
      }
      edges.push(best);
      inTree.push(best[1]);
    }
    towns.forEach((t, a) => {
      const order = towns.map((u, b) => [b, dist(t, u)]).filter(([b]) => b !== a).sort((p, q2) => p[1] - q2[1]);
      const [b, d] = order[1];
      if (d < 48 && !edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) edges.push([a, b, d]);
    });
    edges.sort((p, q2) => p[2] - q2[2]);
    for (const [a, b] of edges) {
      const ta = towns[a], tb = towns[b];
      const cells = MF.astar(W, H, rc, 0.5, ta.y * W + ta.x, tb.y * W + tb.x);
      if (!cells) continue;
      for (const c of cells) { road[c] = 1; rc[c] = 0.5; }
      roads.push(cells.map((c) => [(c % W) + 0.5, ((c / W) | 0) + 0.5]));
    }

    const speed = new Float32Array(N), def = new Float32Array(N), cost = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const tt = MF.TERRAIN[ter[i]];
      let s = tt.speed, d = tt.def;
      if (road[i]) {
        if (ter[i] === T.RIVER || ter[i] === T.FORD) { s = 1; d = 0.9; }
        else s = Math.max(s, MF.ROAD_SPEED * (ter[i] === T.MOUNT ? 0.6 : 1));
      }
      speed[i] = s; def[i] = d;
      cost[i] = s > 0 ? 1 / s : Infinity;
    }
    return { W, H, ter, road, speed, def, cost, minCost: 1 / MF.ROAD_SPEED, rivers, roads, fords, towns };
  };
})();
