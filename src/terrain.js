// Heightfield battlefield: one height function shared by the mesh, units and mouse picking.
import * as THREE from 'three';
import { fbm, rng } from './noise.js';

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
export function buildTerrain(scene, heightAt, seed, { clear = (x, z) => Math.abs(x) < 120 && Math.abs(z) < 250, woods = 0.56, count = 900 } = {}) {
  const seg = 220;
  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#6f8f45'), dry = new THREE.Color('#a39a5c');
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
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  const trees = buildTrees(heightAt, seed, clear, woods, count);
  scene.add(trees.group);
  return { mesh, trees };
}

// Woods gather in patches and stay off the open ground where the armies deploy.
function buildTrees(heightAt, seed, clear, woods, count) {
  const rand = rng(seed + 5);
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 5).translate(0, 1, 0);
  const crown = new THREE.ConeGeometry(2.2, 6, 6).translate(0, 4.6, 0);
  const group = new THREE.Group();
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 25; tries++) {
    const x = (rand() * 2 - 1) * (EXTENT - 10), z = (rand() * 2 - 1) * (EXTENT - 10);
    if (fbm(x * 0.012, z * 0.012, seed + 71, 3) < woods) continue;
    if (clear(x, z)) continue;
    spots.push([x, z, 0.7 + rand() * 0.6]);
  }
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#5a4430' }), spots.length);
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: '#3f5f34' }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  spots.forEach(([x, z, k], i) => {
    p.set(x, heightAt(x, z) - 0.2, z);
    s.set(k, k * (0.9 + rand() * 0.3), k);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, tint.setHSL(0.27 + rand() * 0.06, 0.35, 0.22 + rand() * 0.08));
  });
  for (const mesh of [trunks, crowns]) { mesh.castShadow = true; group.add(mesh); }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    spots: spots.map(([x, z], i) => ({ x, z, i, standing: true })),
    fell(spot) {
      spot.standing = false;
      trunks.setMatrixAt(spot.i, zero);
      crowns.setMatrixAt(spot.i, zero);
      trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    },
  };
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
