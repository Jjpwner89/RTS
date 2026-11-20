// Walkers take the paved roads when it pays (creator, 2026-11-20): a road counts as shorter
// by its speed, so someone going somewhere steps onto it, follows it and steps off, if that
// gets them there sooner than walking straight across; otherwise they cut across.
//
// The roads become a small graph (ends, junctions and crossings) with every distance
// between its nodes worked out once whenever a road is laid or lifted. A walker plans once
// per leg: for each road, where it would step on (the nearest point to it) and step off
// (the nearest point to where it is going), and the cheapest way between them.
import { ROAD } from './economy.js';

const MERGE = 1.5;                         // ends this close are one junction
const near = (p, a, b) => {                // the nearest point on a-b to p, and how far along
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return { x: a.x + dx * t, z: a.z + dz * t, t };
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Where segments a-b and c-d cross, as a fraction along a-b, or null.
function cross(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}

export class RoadNet {
  constructor(roads) {
    this.segs = roads.map(r => ({ a: r.a, b: r.b, nodes: [] }));
    this.nodes = [];
    const node = p => {
      let i = this.nodes.findIndex(n => dist(n, p) < MERGE);
      if (i < 0) { i = this.nodes.length; this.nodes.push({ x: p.x, z: p.z }); }
      return i;
    };
    // Every point where a walker can turn: ends, ends that meet another road along its
    // length, and crossings.
    for (const s of this.segs) for (const p of [s.a, s.b]) {
      const id = node(p);
      for (const o of this.segs) {
        const q = near(p, o.a, o.b);
        if (dist(q, p) < ROAD.width / 2) o.nodes.push({ id, t: q.t });
      }
    }
    for (let i = 0; i < this.segs.length; i++) for (let j = i + 1; j < this.segs.length; j++) {
      const s = this.segs[i], o = this.segs[j], t = cross(s.a, s.b, o.a, o.b);
      if (t === null) continue;
      const id = node({ x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t });
      s.nodes.push({ id, t });
      o.nodes.push({ id, t: near(this.nodes[id], o.a, o.b).t });
    }
    // Shortest ways between all nodes, with the next step for each.
    const N = this.nodes.length;
    this.D = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => i === j ? 0 : Infinity));
    this.next = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => j));
    for (const s of this.segs) {
      s.nodes.sort((p, q) => p.t - q.t);
      s.nodes = s.nodes.filter((n, k) => !k || n.id !== s.nodes[k - 1].id);
      for (let k = 1; k < s.nodes.length; k++) {
        const i = s.nodes[k - 1].id, j = s.nodes[k].id, d = dist(this.nodes[i], this.nodes[j]);
        if (d < this.D[i][j]) this.D[i][j] = this.D[j][i] = d;
      }
    }
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      const Dik = this.D[i][k];
      if (Dik === Infinity) continue;
      for (let j = 0; j < N; j++) if (Dik + this.D[k][j] < this.D[i][j]) { this.D[i][j] = Dik + this.D[k][j]; this.next[i][j] = this.next[i][k]; }
    }
  }

  // The waypoints from p to target by road (ending at the step-off point), or null when
  // walking straight is as quick.
  plan(p, target) {
    const straight = dist(p, target);
    if (straight < 8 || !this.segs.length) return null;
    const on = this.segs.map(s => near(p, s.a, s.b)), off = this.segs.map(s => near(target, s.a, s.b));
    let best = straight * 0.97, way = null;
    for (let i = 0; i < this.segs.length; i++) {
      const a = on[i], walkOn = dist(p, a);
      if (walkOn >= best) continue;
      for (let j = 0; j < this.segs.length; j++) {
        const b = off[j], walkOff = dist(b, target);
        if (walkOn + walkOff >= best) continue;
        // Along the road from a to b: straight along one road, or through its nodes.
        let len = i === j ? dist(a, b) : Infinity, via = null;
        for (const n of this.segs[i].nodes) for (const m of this.segs[j].nodes) {
          const l = dist(a, this.nodes[n.id]) + this.D[n.id][m.id] + dist(this.nodes[m.id], b);
          if (l < len) { len = l; via = [n.id, m.id]; }
        }
        const cost = walkOn + len / ROAD.speed + walkOff;
        if (cost < best) { best = cost; way = { a, b, via }; }
      }
    }
    if (!way) return null;
    const pts = [way.a];
    if (way.via) {
      let [n, m] = way.via;
      pts.push(this.nodes[n]);
      while (n !== m) { n = this.next[n][m]; pts.push(this.nodes[n]); }
    }
    pts.push(way.b);
    return pts.map(q => ({ x: q.x, z: q.z })).filter((q, k, l) => !k || dist(q, l[k - 1]) > 0.3);
  }
}
