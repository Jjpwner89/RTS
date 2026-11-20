// Paved roads on the village ground (economy.js ROAD), and a ghost of the stretch being laid.
// The roads are cobbles painted into the ground itself (scenery.js landMask `paved`): when the
// town's roads change, the village's land mask is painted again with them and handed to the
// ground shader, and the grass and pebbles come off the stones. Where the ground has no land
// mask, they fall back to flat stone strips.
import * as THREE from 'three';
import { ROAD } from './economy.js';

const STEP = 1.5;

export class RoadView {
  constructor(scene, town, heightAt) {
    this.scene = scene;
    this.town = town;
    this.heightAt = heightAt;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.ghostOk = new THREE.MeshBasicMaterial({ color: 0xbfe6a0, transparent: true, opacity: 0.5, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff8a7a, transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = null;
    this.ghost = null;
    this.version = -1;
  }

  // A strip along a-b, lifted a hand's breadth off the ground, with round ends.
  strip(a, b, lift = 0.08, w = ROAD.width / 2) {
    const pos = [], idx = [];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let i = 0; i <= n; i++) {
      const x = a.x + dx * i / n, z = a.z + dz * i / n;
      for (const s of [-1, 1]) { const px = x + nx * w * s, pz = z + nz * w * s; pos.push(px, this.heightAt(px, pz) + lift, pz); }
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    for (const c of [a, b]) {
      const base = pos.length / 3;
      pos.push(c.x, this.heightAt(c.x, c.z) + lift, c.z);
      for (let j = 0; j <= 12; j++) { const t = j / 12 * Math.PI * 2, px = c.x + Math.sin(t) * w, pz = c.z + Math.cos(t) * w; pos.push(px, this.heightAt(px, pz) + lift, pz); }
      for (let j = 0; j < 12; j++) idx.push(base, base + 1 + j, base + 2 + j);
    }
    return { pos, idx };
  }

  geometry(list, lift) {
    const pos = [], idx = [];
    for (const r of list) {
      const s = this.strip(r.a, r.b, lift), off = pos.length / 3;
      pos.push(...s.pos);
      for (const i of s.idx) idx.push(i + off);
    }
    // Every triangle wound to face up, so it is lit from above.
    for (let t = 0; t < idx.length; t += 3) {
      const [i, j, k] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      if ((pos[j + 2] - pos[i + 2]) * (pos[k] - pos[i]) - (pos[j] - pos[i]) * (pos[k + 2] - pos[i + 2]) < 0) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // The village ground's material, when it is painted from a land mask.
  ground() {
    if (this.groundMat === undefined) {
      this.groundMat = null;
      this.scene.traverse(o => { if (!this.groundMat && o.isMesh && o.material?.userData?.land) this.groundMat = o.material; });
    }
    return this.groundMat;
  }

  // Paint the roads into the ground: the land again with the town's roads laid in cobbles.
  paint() {
    const mat = this.ground(), ud = mat.userData;
    const next = ud.land.redraw(this.town.roads.map(r => ({ pts: [[r.a.x, r.a.z], [r.b.x, r.b.z]], width: ROAD.width })));
    if (ud.land !== ud.first) ud.land.tex.dispose();
    ud.first ??= ud.land;
    ud.land = next;
    ud.mask = next.tex;
    ud.uniforms.uMask.value = next.tex;
    const cover = this.scene.userData.cover;
    this.cleared ??= new WeakSet();
    for (const r of this.town.roads) {
      if (this.cleared.has(r)) continue;
      this.cleared.add(r);
      const len = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z), n = Math.max(1, Math.ceil(len / 1.5));
      for (let i = 0; i <= n; i++) cover?.clear(r.a.x + (r.b.x - r.a.x) * i / n, r.a.z + (r.b.z - r.a.z) * i / n, ROAD.width * 0.6 + 0.3);
    }
  }

  // from: the first point of a stretch being laid; at: the cursor.
  update({ from = null, at = null } = {}) {
    if (this.version !== this.town.roadsVersion) {
      this.version = this.town.roadsVersion;
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
      if (this.ground()) this.paint();
      else if (this.town.roads.length) {
        this.mesh = new THREE.Mesh(this.geometry(this.town.roads, 0.08), this.mat);
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
      }
    }
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost.geometry.dispose(); this.ghost = null; }
    if (from && at && Math.hypot(at.x - from.x, at.z - from.z) > 0.5) {
      const ok = this.town.roadCheck(from, at).ok;
      this.ghost = new THREE.Mesh(this.geometry([{ a: from, b: at }], 0.15), ok ? this.ghostOk : this.ghostBad);
      this.scene.add(this.ghost);
    }
  }
}

// Laying a paved road: a click starts a stretch, the next lays it and starts the next from
// there. Shift-click lifts the road under the cursor.
export function placeRoad(town, st, g, e, hud) {
  if (e?.shiftKey) { if (!town.liftRoad(g)) hud.flash('No road there to lift'); st.roadFrom = null; return; }
  if (!st.roadFrom) { st.roadFrom = { x: g.x, z: g.z }; return; }
  const r = town.layRoad(st.roadFrom, g);
  if (!r.ok) { hud.flash(r.reason); return; }
  st.roadFrom = { x: g.x, z: g.z };
}
