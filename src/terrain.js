// Heightfield battlefield: one height function shared by the mesh, units and mouse picking.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, rng } from './noise.js';
import { groundMaterial, treeMaterial, tick } from './scenery.js';

export const HALF = 250;          // playable area is -HALF..HALF on x and z
const EXTENT = 380;               // mesh reaches past the edge so fog hides the border

// Each side's keep. Broken regiments run back here and regroup instead of leaving the map.
export const HOMES = [{ x: 0, z: 205 }, { x: 0, z: -205 }];

export function makeHeight(seed, flats = HOMES) {
  const raw = (x, z) => {
    const broad = fbm(x * 0.006, z * 0.006, seed, 4);
    const detail = fbm(x * 0.03, z * 0.03, seed + 7, 2);
    // Keep a gentle valley along the middle so the armies meet on fairly open ground.
    const valley = 0.55 + 0.45 * Math.min(1, Math.abs(z) / 140);
    return (broad - 0.45) * 34 * valley + (detail - 0.5) * 1.6;
  };
  // Level ground for each keep and its village.
  const pads = flats.map(h => ({ ...h, y: raw(h.x, h.z) }));
  return (x, z) => {
    let y = raw(x, z);
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= 70) continue;
      const k = d < 35 ? 1 : 1 - (d - 35) / 35;
      y += (p.y - y) * k * k * (3 - 2 * k);
    }
    return y;
  };
}

// clear(x, z): where no trees may grow. woods: 0..1, lower means more forest.
// Returns the ground mesh and the trees, which can be felled one by one.
export function buildTerrain(scene, heightAt, seed, { clear = (x, z) => Math.abs(x) < 120 && Math.abs(z) < 250, woods = 0.56, count = 900, land = null } = {}) {
  const mesh = drawGround(scene, heightAt, seed, { land });
  const trees = plantTrees(seed, clear, woods, count);
  drawTrees(scene, heightAt, trees);
  return { mesh, trees };
}

// tint(x, z): 0..1, how much bare dirt shows there, e.g. along a road.
// land: tracks and fields painted on by scenery.js landMask().
export function drawGround(scene, heightAt, seed, { extent = EXTENT, seg = 220, tint = null, land = null } = {}) {
  const geo = new THREE.PlaneGeometry(extent * 2, extent * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#5f8540'), dry = new THREE.Color('#9b935c');
  const dirt = new THREE.Color('#7d6a4a'), rock = new THREE.Color('#8a8578');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const slope = Math.hypot(heightAt(x + 1, z) - h, heightAt(x, z + 1) - h);
    const patch = fbm(x * 0.02, z * 0.02, seed + 33, 3);
    c.copy(grass).lerp(dry, Math.max(0, Math.min(1, (patch - 0.45) * 2.5)));
    if (h > 9) c.lerp(dirt, Math.min(1, (h - 9) / 10));
    if (slope > 0.55) c.lerp(rock, Math.min(1, (slope - 0.55) * 2));
    if (tint) c.lerp(dirt, tint(x, z) * 0.75);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, groundMaterial(land));
  mesh.receiveShadow = true;
  // The ground is drawn every frame: it keeps the clock for grass, water and clouds,
  // and tells the ground cover where the camera is.
  mesh.onBeforeRender = (renderer, sc, camera) => { tick(); sc.userData.cover?.update(camera); };
  scene.add(mesh);
  return mesh;
}

// Woods gather in patches and stay off the open ground where the armies deploy.
// The trees are plain data, so a village keeps its felled trees while nobody is
// looking at it; drawTrees() puts them in a scene whenever it is shown.
export function plantTrees(seed, clear, woods, count, extent = EXTENT) {
  const rand = rng(seed + 5);
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 25; tries++) {
    const x = (rand() * 2 - 1) * (extent - 10), z = (rand() * 2 - 1) * (extent - 10);
    if (fbm(x * 0.012, z * 0.012, seed + 71, 3) < woods) continue;
    if (clear(x, z)) continue;
    const k = 0.7 + rand() * 0.6;
    spots.push({ x, z, i: spots.length, standing: true, k, tall: k * (0.9 + rand() * 0.3), hue: 0.27 + rand() * 0.06, light: 0.22 + rand() * 0.08 });
  }
  return {
    spots,
    onFell: null,
    fell(spot) {
      spot.standing = false;
      this.onFell?.(spot);
    },
  };
}

// Three kinds of tree, low-poly like the buildings: broadleaf, pine and birch. Crowns are
// drawn in greys and take each tree's own green.
let KINDS = null;
function treeKinds() {
  if (KINDS) return KINDS;
  const paint = (g, color) => {
    g = g.index ? g.toNonIndexed() : g;
    const k = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) a.set([k.r, k.g, k.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const trunk = (r, h, color) => paint(new THREE.CylinderGeometry(r * 0.7, r, h, 6).translate(0, h / 2, 0), color);
  const blob = (r, x, y, z, grey) => paint(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), grey);
  return KINDS = {
    oak: mergeGeometries([trunk(0.35, 3.4, '#5b4330'), blob(2.4, 0, 4.8, 0, '#ffffff'), blob(1.8, 1.5, 4.0, 0.5, '#e6e6e6'), blob(1.7, -1.3, 4.2, -0.6, '#d8d8d8'), blob(1.5, 0.2, 6.2, 0.3, '#f4f4f4')]),
    pine: mergeGeometries([trunk(0.28, 2.2, '#4d3828'),
      paint(new THREE.ConeGeometry(2.3, 3.2, 7).translate(0, 3.4, 0), '#d0d0d0'),
      paint(new THREE.ConeGeometry(1.8, 2.8, 7).translate(0, 5.0, 0), '#e4e4e4'),
      paint(new THREE.ConeGeometry(1.2, 2.4, 7).translate(0, 6.5, 0), '#f6f6f6')]),
    birch: mergeGeometries([trunk(0.18, 4.6, '#d9d4c8'), paint(new THREE.IcosahedronGeometry(1.4, 0).scale(1, 1.4, 1).translate(0, 5.2, 0), '#ffffff'), blob(1.0, 0.8, 4.3, 0.3, '#e0e0e0')]),
  };
}
const TONES = { oak: [0.29, 0.36, 0.21], pine: [0.38, 0.32, 0.18], birch: [0.23, 0.38, 0.33] };

// Pines gather in their own stands, birches at the edges of broadleaf woods.
function kindOf(t) {
  const r = fbm(t.x * 0.008, t.z * 0.008, 17, 2) + (t.hue - 0.3) * 3;
  return r > 0.58 ? 'pine' : r < 0.38 && t.light < 0.27 ? 'birch' : 'oak';
}

export function drawTrees(scene, heightAt, trees) {
  const { spots } = trees;
  const kinds = treeKinds();
  const mat = treeMaterial();
  const group = new THREE.Group();
  const lists = { oak: [], pine: [], birch: [] };
  for (const t of spots) lists[kindOf(t)].push(t);
  const slot = new Map();    // tree -> [mesh, index]
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const tint = new THREE.Color();
  for (const [kind, list] of Object.entries(lists)) {
    const mesh = new THREE.InstancedMesh(kinds[kind], mat, Math.max(1, list.length));
    const [h, sa, l] = TONES[kind];
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.x * 12.9898 + t.z * 78.233);
      s.set(t.k, t.tall, t.k);
      p.set(t.x, heightAt(t.x, t.z) - 0.2, t.z);
      mesh.setMatrixAt(i, t.standing ? m.compose(p, q, s) : zero);
      mesh.setColorAt(i, tint.setHSL(h + (t.hue - 0.29) * 0.8, sa + (t.light - 0.26) * 1.2, l + (t.light - 0.26) * 0.9));
      slot.set(t, [mesh, i]);
    });
    mesh.count = list.length;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  trees.onFell = spot => {
    const [mesh, i] = slot.get(spot) || [];
    if (!mesh) return;
    mesh.setMatrixAt(i, zero);
    mesh.instanceMatrix.needsUpdate = true;
  };
  scene.add(group);
  return group;
}

// March a ray across the heightfield; cheaper than raycasting the mesh on every mouse move.
export function pickGround(ray, heightAt) {
  const o = ray.origin, d = ray.direction;
  let t = 0, step = 4, prev = null;
  for (let i = 0; i < 600; i++) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < heightAt(x, z)) {
      if (prev === null) return null;
      let lo = prev, hi = t;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        const mx = o.x + d.x * mid, my = o.y + d.y * mid, mz = o.z + d.z * mid;
        if (my < heightAt(mx, mz)) hi = mid; else lo = mid;
      }
      return new THREE.Vector3(o.x + d.x * hi, 0, o.z + d.z * hi);
    }
    prev = t;
    t += step;
    step = Math.min(12, step * 1.04);
  }
  return null;
}
