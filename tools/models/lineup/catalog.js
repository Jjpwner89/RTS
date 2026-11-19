// Model catalogue shared by the gallery and the roster: loaders, fitting helpers, and every
// building, keep and soldier option, so both pages build the same models the same way.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V1 from './current/view.js';
import * as T1 from './current/townview.js';
import * as V2 from './models-v2.js';

const quat = await import('./quaternius-buildings.js').catch(() => null);

export const VC = new THREE.MeshLambertMaterial({ vertexColors: true });
export const loader = new GLTFLoader();
export const gltfCache = new Map();
// Artifacts only serve text and images, so each model ships as base64 GLB text (<name>.glb.txt).
export async function loadPacked(url) {
  const base = url.replace(/\.(gltf|glb)$/, '');
  const res = await fetch(base + '.glb.txt');
  if (!res.ok) throw new Error(`${base} (${res.status})`);
  const txt = atob(await res.text()), bytes = new Uint8Array(txt.length);
  for (let i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, base.slice(0, base.lastIndexOf('/') + 1));
}
async function packedBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  const txt = atob(await res.text()), bytes = new Uint8Array(txt.length);
  for (let i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
  return bytes.buffer;
}
const fbxCache = new Map();
// FBX models ship the same way, as base64 text (<name>.fbx.txt).
export const fbx = url => fbxCache.get(url) || fbxCache.set(url, packedBytes(url + '.txt').then(b => new FBXLoader().parse(b, ''))).get(url);
export const gltf = url => gltfCache.get(url) || gltfCache.set(url, loadPacked(url)).get(url);

// ---- helpers ----

export const box3 = new THREE.Box3(), v3 = new THREE.Vector3();
// Scale an object so its larger ground extent is `size`, then stand it on y=0 centred.
export function fit(obj, size, { by = 'xz' } = {}) {
  obj.updateMatrixWorld(true);
  box3.setFromObject(obj);
  const s = box3.getSize(v3);
  const k = size / (by === 'y' ? s.y : Math.max(s.x, s.z));
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  box3.setFromObject(obj);
  const c = box3.getCenter(v3);
  const wrap = new THREE.Group();
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box3.min.y;
  wrap.add(obj);
  return wrap;
}
export const shadowAll = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
export const meshOf = geo => { const m = new THREE.Mesh(geo, VC); m.castShadow = m.receiveShadow = true; return m; };
export function tris(o) {
  let n = 0;
  o.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry, c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += c;
  });
  return Math.round(n);
}
export const clone = async (url, size, opts) => {
  const g = await gltf(url);
  const o = fit(g.scene.clone(true), size, opts);
  shadowAll(o);
  return o;
};

// ---- building catalogues per option ----

export const FOOT = { house: 5.5, woodcutter: 6.5, quarry: 6.5, mine: 7, hunter: 6, carpenter: 7, ropemaker: 8, smelter: 6.5, bowyer: 6.5, weaponsmith: 7, barracks: 12, farm: 17, flax: 17 };
export const KK = 'assets/kaykit/';
export const KK_MAP = { house: 'building_home_A_blue', woodcutter: 'building_lumbermill_blue', mine: 'building_mine_blue', carpenter: 'building_tavern_blue', ropemaker: 'building_market_blue',
  smelter: 'building_blacksmith_blue', weaponsmith: 'building_blacksmith_blue', bowyer: 'building_archeryrange_blue', barracks: 'building_barracks_blue' };
export const KK_STANDIN = { carpenter: 'tavern', ropemaker: 'market', hunter: 'tent and props', quarry: 'rocks and cut stone', flax: 'the grain field', smelter: 'the blacksmith' };

export async function kaykitBuilding(kind, variant = 0) {
  if (kind === 'house') return clone(KK + (variant % 2 ? 'building_home_B_blue' : 'building_home_A_blue') + '.gltf', FOOT.house);
  if (KK_MAP[kind]) return clone(KK + KK_MAP[kind] + '.gltf', FOOT[kind]);
  const g = new THREE.Group();
  const add = async (name, size, x, z, ry = 0, opts) => { const o = await clone(KK + name + '.gltf', size, opts); o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); };
  if (kind === 'farm' || kind === 'flax') {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) await add('building_grain', 5.6, i * 5.6, j * 5.6);
    if (kind === 'farm') await add('building_windmill_blue', 6, 6.5, 6.5, Math.PI);
    else await add('building_well_blue', 2.5, 7, 7);
  } else if (kind === 'quarry') {
    await add('rock_single_C', 4.5, -1.2, -1.2); await add('rock_single_A', 3, 1.8, -1.8, 1);
    await add('resource_stone', 1.6, 1.5, 1.4); await add('resource_stone', 1.6, -0.6, 2.2, 1.2); await add('tent', 2.6, -2.4, 1.6);
  } else if (kind === 'hunter') {
    await add('tent', 3.6, 0, 0); await add('resource_lumber', 2.4, 2.6, 1.6, 0.4); await add('weaponrack', 1.6, -2.4, 1.5); await add('barrel', 0.9, 2.2, -1.6, 0, { by: 'y' });
  }
  return g;
}

export let quatPieces = null;
export async function quatBuilding(kind) {
  if (!quat) return null;
  if (!quatPieces) {
    quatPieces = {};
    await Promise.all(quat.QUAT_PIECES.map(async n => { quatPieces[n] = (await gltf(`assets/quaternius/${n}.gltf`)).scene; }));
  }
  const which = kind === 'house' ? 'cottage' : kind === 'barracks' ? 'hall' : 'workshop';
  const o = fit(quat.buildQuat(which, quatPieces), FOOT[kind] * (which === 'hall' ? 1 : 1.05));
  shadowAll(o);
  return o;
}

export async function building(option, kind, variant) {
  if (option === 'current') return meshOf(kind === 'house' ? V1.houseModel() : T1.MODELS[kind]());
  if (option === 'v2') return meshOf(V2.MODELS[kind]());
  if (option === 'kaykit') return kaykitBuilding(kind, variant);
  if (option === 'quat') {
    if (kind === 'farm' || kind === 'flax') return meshOf(V2.MODELS[kind]());
    return quatBuilding(kind);
  }
}

// ---- keeps ----

export const KN = 'assets/kenney/';
export async function kenneyCastle() {
  const g = new THREE.Group(), S = 4;
  const put = async (name, x, y, z, ry = 0, s = S) => {
    const o = (await gltf(KN + name + '.glb')).scene.clone(true);
    o.scale.setScalar(s); o.position.set(x * S, y * S, z * S); o.rotation.y = ry;
    shadowAll(o); g.add(o);
    return o;
  };
  const jobs = [];
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    jobs.push(put('tower-hexagon-base', x, 0, z), put('tower-hexagon-mid', x, 1.31, z), put('tower-hexagon-mid', x, 1.77, z), put('tower-hexagon-roof', x, 2.23, z));
  }
  for (let k = -2; k <= 2; k++) {
    jobs.push(put('wall', k, 0, -3), put('wall', -3, 0, k, Math.PI / 2), put('wall', 3, 0, k, Math.PI / 2));
    if (k !== 0) jobs.push(put('wall', k, 0, 3));
  }
  jobs.push(put('gate', 0, 0, 3, Math.PI / 2));
  // the keep itself: a broad square tower in the yard
  const K = 2.3;
  jobs.push(put('tower-square-base', 0, 0, -0.6, 0, S * K), put('tower-square-roof', 0, 1.01 * K, -0.6, 0, S * K));
  jobs.push(put('flag', 0, 3.0 * K, -0.6), put('flag-pennant', -3, 3.05, -3), put('flag-pennant', 3, 3.05, -3));
  await Promise.all(jobs);
  return g;
}

export async function keep(option) {
  if (option === 'current') return meshOf(V1.keepModel());
  if (option === 'v2') return meshOf(V2.keepModel());
  if (option === 'kaykit') return clone(KK + 'building_castle_blue.gltf', 15);
  if (option === 'kenney') return kenneyCastle();
}

// ---- soldiers ----

export const TEAM = ['#3d6fd6', '#c8423a'];
export function proceduralModels(option) {
  if (option === 'current') {
    const m = {};
    for (const k of ['spear', 'sword', 'archer', 'militia', 'bandit']) m[k] = V1.infantry(k);
    m.cav = V1.cavalry();
    m.peasant = T1.peasant();
    return m;
  }
  const m = {};
  for (const k of ['spear', 'sword', 'archer', 'militia', 'bandit']) m[k] = V2.infantry(k);
  m.cav = V2.cavalry();
  m.peasant = V2.peasant();
  return m;
}
export const DYES = ['#8a6a4a', '#6f7a52', '#7a5a48', '#9a8a6a', '#5f6a7a', '#8a7a5a', '#6a5040'];

// Instanced blocks, built the way the battle view builds them: gear plus team-tinted cloth.
export function instancedBlock(model, spots, team, dye) {
  const g = new THREE.Group();
  const gear = new THREE.InstancedMesh(model.gear, VC, spots.length), cloth = new THREE.InstancedMesh(model.cloth, VC, spots.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  spots.forEach(([x, z, yaw], i) => {
    d.position.set(x, 0, z); d.rotation.set(0, yaw, 0); d.updateMatrix();
    gear.setMatrixAt(i, d.matrix); cloth.setMatrixAt(i, d.matrix);
    c.set(dye ? DYES[i % DYES.length] : TEAM[team]).multiplyScalar(0.85 + Math.random() * 0.3);
    cloth.setColorAt(i, c);
    gear.setColorAt(i, c.setScalar(0.92 + Math.random() * 0.16));
  });
  for (const m of [gear, cloth]) { m.castShadow = true; g.add(m); }
  return g;
}

export const KC = 'assets/kaychar/';
export const KAY = {
  spear: ['Knight', ['1H_Sword', 'Round_Shield']], sword: ['Knight', ['1H_Sword', 'Badge_Shield']], cav: ['Knight', ['2H_Sword']],
  archer: ['Rogue_Hooded', ['2H_Crossbow']], militia: ['Barbarian', ['1H_Axe', 'Barbarian_Round_Shield']], bandit: ['Rogue_Hooded', ['Knife', 'Knife_Offhand']],
  peasant: ['Barbarian', ['Mug']],
};
export const WEAPON = /Sword|Shield|Axe|Crossbow|Knife|Throwable|Mug|Dagger|Staff|Wand|Book/;
// A rigged KayKit character is too heavy to draw thousands of times, so pose it once, bake the
// skinning into plain geometry and instance that, as the battles would have to.
export const baked = new Map();
export async function bakeKay(key) {
  if (baked.has(key)) return baked.get(key);
  const [who, keepParts] = KAY[key];
  const src = await gltf(KC + who + '.glb');
  const o = SkeletonUtils.clone(src.scene);
  const pose = src.animations.find(a => a.name === (key === 'archer' ? '2H_Ranged_Aiming' : key === 'spear' || key === 'sword' ? 'Blocking' : 'Idle')) || src.animations[0];
  const mixer = new THREE.AnimationMixer(o);
  mixer.clipAction(pose).play();
  mixer.update(0.4);
  o.updateMatrixWorld(true);
  const byMat = new Map(), v = new THREE.Vector3();
  o.traverse(n => {
    if (!n.isMesh) return;
    let hidden = false;
    for (let p = n; p; p = p.parent) if (WEAPON.test(p.name) && !keepParts.includes(p.name)) hidden = true;
    if (hidden || !n.visible) return;
    const geo = n.geometry, pos = geo.attributes.position, out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (n.isSkinnedMesh) n.applyBoneTransform(i, v);
      v.applyMatrix4(n.matrixWorld);
      out.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.setAttribute('uv', geo.attributes.uv.clone());
    if (geo.index) g.setIndex(geo.index.clone());
    const list = byMat.get(n.material) || byMat.set(n.material, []).get(n.material);
    list.push(g.index ? g.toNonIndexed() : g);
  });
  const parts = [...byMat.entries()].map(([mat, geos]) => { const g = mergeGeometries(geos); g.computeVertexNormals(); return { mat, g }; });
  // stand on the ground at about 1.85 m tall
  box3.makeEmpty();
  for (const p of parts) { p.g.computeBoundingBox(); box3.union(p.g.boundingBox); }
  const k = 1.85 / (box3.max.y - box3.min.y);
  for (const p of parts) { p.g.translate(0, -box3.min.y, 0); p.g.scale(k, k, k); }
  const res = { parts, tris: parts.reduce((n, p) => n + p.g.attributes.position.count / 3, 0) };
  baked.set(key, res);
  return res;
}
export async function kayBlock(key, spots, team) {
  const { parts } = await bakeKay(key);
  const g = new THREE.Group(), d = new THREE.Object3D();
  for (const { mat, g: geo } of parts) {
    const m = new THREE.InstancedMesh(geo, team === 1 ? Object.assign(mat.clone(), { color: new THREE.Color('#ffa898') }) : mat, spots.length);
    spots.forEach(([x, z, yaw], i) => { d.position.set(x, 0, z); d.rotation.set(0, yaw, 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
