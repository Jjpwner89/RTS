// Model roster: every model under consideration on one field, grouped so that options can be
// compared side by side at the same scale. Soldiers stand in pairs, one per team colour.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.21.0/meshopt_simplifier.module.js';
import * as C from './catalog.js';
import * as V1 from './current/view.js';
import * as T1 from './current/townview.js';
import * as V2 from './models-v2.js';

const $ = s => document.querySelector(s);
const TEAM = C.TEAM;
const DEG = Math.PI / 180;

// ============================================================ scene

const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9bccb');
const camera = new THREE.PerspectiveCamera(36, 1.6, 0.5, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = 1.5;
scene.add(new THREE.HemisphereLight('#e4edf5', '#5b4a33', 1.6));
const sun = new THREE.DirectionalLight('#fff0d4', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
// keep the shadow box around whatever the camera is looking at
function aimSun(t, span) {
  sun.target.position.copy(t);
  sun.position.copy(t).add(new THREE.Vector3(-0.45, 1, 0.55).multiplyScalar(span * 1.6));
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 });
  sun.shadow.camera.updateProjectionMatrix();
}
{
  const g = new THREE.PlaneGeometry(900, 900, 90, 90).rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const a = new THREE.Color('#71894b'), b = new THREE.Color('#62793f'), d = new THREE.Color('#80985a');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), n = Math.sin(x * 0.05) * Math.cos(z * 0.04) + Math.sin((x - z) * 0.09) * 0.5;
    c.copy(a).lerp(n > 0 ? d : b, Math.min(1, Math.abs(n)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, C.VC);
  m.receiveShadow = true;
  scene.add(m);
}

// ============================================================ rigged figures

// Bone names per character family: right hand, left hand, head, top of head, hips, legs.
const RIGS = {
  q18: { R: 'PalmR', L: 'PalmL', head: 'Head', top: 'Head_end', hips: 'Hips', thighR: 'UpperLegR', thighL: 'UpperLegL', shinR: 'LowerLegR', shinL: 'LowerLegL', armR: 'UpperArmR', armL: 'UpperArmL', shR: 'ShoulderR', shL: 'ShoulderL' },
  qmod: { R: 'Wrist.R', L: 'Wrist.L', foreR: 'LowerArm.R', foreL: 'LowerArm.L', head: 'Head', hips: 'Hips', thighR: 'UpperLeg.R', thighL: 'UpperLeg.L', shinR: 'LowerLeg.R', shinL: 'LowerLeg.L', armR: 'UpperArm.R', armL: 'UpperArm.L', shR: 'Shoulder.R', shL: 'Shoulder.L' },
  kay: { R: 'handslot.r', L: 'handslot.l', head: 'head', hips: 'hips', thighR: 'upperleg.r', thighL: 'upperleg.l', shinR: 'lowerleg.r', shinL: 'lowerleg.l', armR: 'upperarm.r', armL: 'upperarm.l', shR: 'upperarm.r', shL: 'upperarm.l' },
};

const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
// Turn a bone about an axis given in the model's own frame (x right-to-left, y up, z forward).
function turn(root, bone, axis, deg) {
  if (!bone) return;
  root.updateMatrixWorld(true);
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_wq);
  _q.setFromAxisAngle(AX[axis], deg * DEG);
  bone.quaternion.copy(_pq.invert().multiply(_wq.premultiply(_q)));
  root.updateMatrixWorld(true);
}

// Seated on a horse: thighs forward and apart, shins hanging down.
function seat(root, rig) {
  const b = n => byName(root, rig[n]);
  for (const [side, s] of [['R', -1], ['L', 1]]) {
    turn(root, b('thigh' + side), 'x', -50);
    turn(root, b('thigh' + side), 'z', s * 30);
    turn(root, b('shin' + side), 'x', 45);
  }
}

// Holding stances: one-pose clips made with the clip tools (assets/art/3d/wip/stance-motions.mjs, copied in by
// fetch.py). The figure keeps its Idle body and takes only the arm and finger joints of the stance's side (both
// sides for _2H), so its hands close on what they carry. Returns the grips the stances name, by hand.
const STANCES = 'assets/stances/clips-stances.glb';
const ARM_JOINT = /^(Shoulder|UpperArm|LowerArm|Wrist|Index\d|Middle\d|Ring\d|Pinky\d|Thumb\d)(R|L)$/;
async function stance(o, names) {
  const g = await C.gltf(STANCES), grips = {};
  for (const name of names) {
    const i = g.animations.findIndex(a => a.name === name);
    if (i < 0) throw new Error('no stance ' + name);
    const sides = name.endsWith('_2H') ? 'RL' : name.slice(-1);
    for (const t of g.animations[i].tracks) {
      const [node, prop] = t.name.split('.'), m = node.match(ARM_JOINT);
      if (prop === 'quaternion' && m && sides.includes(m[2])) byName(o, node)?.quaternion.fromArray(t.values, 0);
    }
    Object.assign(grips, g.parser.json.animations[i].extras?.hold);
  }
  o.updateMatrixWorld(true);
  return grips;
}

// Push each vertex of a shell out along its normal until it clears, by `gap`, every surface below it that faces
// the same way (`under`: points with their normals, flat arrays), so a coat sits outside the shirt it was grown
// from and outside the coats already on.
function clearOf(g, under, push, gap = 0.012) {
  const cell = 0.03, grid = new Map(), key = (x, y, z) => (Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791);
  for (let i = 0; i < under.p.length; i += 3) { const k = key(under.p[i], under.p[i + 1], under.p[i + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const p = g.attributes.position, nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i);
    let need = push;
    const seen = new Set();
    for (let t = 0; t <= 0.1; t += cell / 2) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const k = key(px + nx * t + a * cell, py + ny * t + b * cell, pz + nz * t + c * cell);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const j of grid.get(k) || []) {
        if (under.n[j] * nx + under.n[j + 1] * ny + under.n[j + 2] * nz < 0.5) continue;
        const dx = under.p[j] - px, dy = under.p[j + 1] - py, dz = under.p[j + 2] - pz, d = dx * nx + dy * ny + dz * nz;
        if (d <= 0 || d > 0.1) continue;
        const rx = dx - d * nx, ry = dy - d * ny, rz = dz - d * nz;
        if (rx * rx + ry * ry + rz * rz < 0.02 * 0.02) need = Math.max(need, d + gap);
      }
    }
    p.setXYZ(i, px + nx * need, py + ny * need, pz + nz * need);
  }
}
// Every vertex of a non-indexed triangle list, each with its triangle's normal.
function facing(tri) {
  const n = new Float32Array(tri.length), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < tri.length; i += 9) {
    a.fromArray(tri, i); b.fromArray(tri, i + 3); c.fromArray(tri, i + 6);
    c.sub(b); b.sub(a); b.cross(c).normalize();
    for (let j = 0; j < 9; j += 3) b.toArray(n, i + j);
  }
  return { p: Float32Array.from(tri), n };
}

// GLTFLoader strips dots from node names ('Wrist.R' becomes 'WristR'), FBXLoader keeps them.
const byName = (root, name) => root.getObjectByName(name) || root.getObjectByName(name.replace(/[[\].:/]/g, ''));

const srcCache = new Map();
async function source(kind, file) {
  const key = kind + file;
  if (!srcCache.has(key)) {
    srcCache.set(key, (async () => {
      if (kind === 'fbx') { const o = await C.fbx(file); return { root: o, clips: o.animations }; }
      const g = await C.gltf(file);
      return { root: g.scene, clips: g.animations };
    })());
  }
  return srcCache.get(key);
}

const v = new THREE.Vector3();
// Pose a rigged model once and bake its skinning into plain meshes, scaled to `height` metres
// with the feet on the ground, facing +z. Returns the meshes and the posed bone positions.
// `armour` is a list of layers, each a shell grown over the triangles skinned to its bones, so any body can wear a
// breastplate and a surcoat over it. A layer's colour may be 'team'.
// `hold` names holding stances for the arms; `trimHair` tucks the hair in to the skull so helmets cover it.
async function bake(kind, file, { rig, clip = 'Idle', time = 0.4, height = 1.85, drop = () => false, seated = false, team, tint = {}, flat = {}, armour, hold = [], trimHair = false }) {
  const { root, clips } = await source(kind, file);
  const o = SkeletonUtils.clone(root);
  const anim = clips.find(a => a.name === clip) || clips.find(a => a.name.endsWith('|' + clip)) || clips.find(a => a.name.includes(clip)) || clips[0];
  if (anim) { const mixer = new THREE.AnimationMixer(o); mixer.clipAction(anim).play(); mixer.update(time); }
  o.updateMatrixWorld(true);
  if (seated) seat(o, RIGS[rig]);
  const grips = hold.length ? await stance(o, hold) : {};
  // the head and everything it carries (hair, ears), measured so helmets can be fitted to it
  const headBones = new Set(), headBox = new THREE.Box3(), skull = new THREE.Box3();
  byName(o, RIGS[rig]?.head || '')?.traverse(b => headBones.add(b));
  const byMat = new Map(), layers = (armour || []).map(a => ({ ...a, tri: [], bones: new Set(a.bones.map(b => b.replace(/[[\].:/]/g, ''))) }));
  o.traverse(n => {
    if (!n.isMesh || !n.visible) return;
    for (let p = n; p; p = p.parent) if (p !== o && drop(p.name)) return;
    const geo = n.geometry, pos = geo.attributes.position, out = new Float32Array(pos.count * 3);
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, dom = new Array(pos.count);
    // hair, by material, so the skull can be measured without it
    const hair = new Uint8Array(pos.count), mats0 = [].concat(n.material);
    for (const gr of geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }]) {
      if (!/^Hair/.test((mats0[gr.materialIndex] || mats0[0]).name)) continue;
      for (let t = gr.start; t < gr.start + gr.count; t++) hair[geo.index ? geo.index.array[t] : t] = 1;
    }
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (n.isSkinnedMesh) n.applyBoneTransform(i, v);
      v.applyMatrix4(n.matrixWorld);
      out.set([v.x, v.y, v.z], i * 3);
      if (n.isSkinnedMesh && si) {
        let best = 0;
        for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, best)) best = j;
        const bone = n.skeleton.bones[si.getComponent(i, best)];
        if (headBones.has(bone)) { headBox.expandByPoint(v); if (!hair[i]) skull.expandByPoint(v); }
        dom[i] = bone.name.replace(/[[\].:/]/g, '');
      }
    }
    if (layers.length && n.isSkinnedMesh) {
      const idx = geo.index ? geo.index.array : Array.from({ length: pos.count }, (_, i) => i);
      for (const L of layers) for (let t = 0; t < idx.length; t += 3) {
        if (L.bones.has(dom[idx[t]]) && L.bones.has(dom[idx[t + 1]]) && L.bones.has(dom[idx[t + 2]])) for (let j = 0; j < 3; j++) L.tri.push(out[idx[t + j] * 3], out[idx[t + j] * 3 + 1], out[idx[t + j] * 3 + 2]);
      }
    }
    const mats = [].concat(n.material);
    // split multi-material meshes by group so each material keeps its own triangles
    const groups = Array.isArray(n.material) && geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(out, 3));
      if (geo.attributes.uv) g.setAttribute('uv', geo.attributes.uv);
      if (geo.attributes.color) g.setAttribute('color', geo.attributes.color);
      if (geo.index) g.setIndex(Array.from(geo.index.array.slice(gr.start, gr.start + gr.count)));
      else g.setIndex(Array.from({ length: gr.count }, (_, i) => gr.start + i));
      const mat = mats[gr.materialIndex] || mats[0];
      const key = mat.name + '|' + (flat[n.name] ? n.name : '');
      const list = byMat.get(key) || byMat.set(key, { mat, mesh: n.name, geos: [] }).get(key);
      list.geos.push(g.toNonIndexed());
    }
  });
  const bones = {};
  for (const [k, name] of Object.entries(RIGS[rig] || {})) {
    const b = byName(o, name);
    if (b) bones[k] = b.getWorldPosition(new THREE.Vector3());
  }
  // Each hand: its grip point and turn, and the line a held weapon runs along (from the stance, else straight out of
  // the top of the fist). Hand-local +y runs to the knuckles, -z is the palm, the right thumb is -x and the left +x.
  const hands = {};
  if (rig === 'qmod' && hold.length) for (const s of ['R', 'L']) {
    const w = byName(o, RIGS.qmod[s]), q = w.getWorldQuaternion(new THREE.Quaternion());
    const h = grips[s] || { grip: [0, 0.135, -0.035], axis: [s === 'R' ? -1 : 1, 0, 0] };
    hands[s] = { wrist: w.getWorldPosition(new THREE.Vector3()), p: w.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...h.grip).applyQuaternion(q)), q, axis: new THREE.Vector3(...h.axis).applyQuaternion(q).normalize() };
  }
  const box = new THREE.Box3();
  const parts = [...byMat.values()].map(({ mat, mesh, geos }) => {
    // keep uvs and vertex colours only where every piece has them, so the pieces merge
    const keep = ['uv', 'color'].filter(a => geos.every(x => x.attributes[a]));
    const g = mergeGeometries(geos.map(x => { const y = new THREE.BufferGeometry(); y.setAttribute('position', x.attributes.position); for (const a of keep) y.setAttribute(a, x.attributes[a]); return y; }));
    g.computeBoundingBox(); box.union(g.boundingBox);
    return { mat, mesh, g };
  });
  const k = height / (box.max.y - box.min.y), base = box.min.y;
  const toM = p => p.clone().setY(p.y - base).multiplyScalar(k);
  const group = new THREE.Group();
  let tris = 0;
  const sk = skull.isEmpty() ? null : { c: toM(skull.getCenter(new THREE.Vector3())), r: skull.getSize(new THREE.Vector3()).multiplyScalar(k * 0.5 * 1.06) };
  for (const { mat, mesh, g } of parts) {
    g.translate(0, -base, 0); g.scale(k, k, k);
    // hair outside the skull drops onto it, so a helmet sized to the head covers it
    if (trimHair && sk && /^Hair/.test(mat.name)) {
      const p = g.attributes.position, d = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        d.fromBufferAttribute(p, i).sub(sk.c);
        const e = Math.hypot(d.x / sk.r.x, d.y / sk.r.y, d.z / sk.r.z);
        if (e > 1) p.setXYZ(i, sk.c.x + d.x / e, sk.c.y + d.y / e, sk.c.z + d.z / e);
      }
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, recolour(mat, mesh, { team, tint, flat, fbx: kind === 'fbx' }));
    m.material.vertexColors = !!g.attributes.color;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    tris += g.attributes.position.count / 3;
  }
  const worn = [];   // the coats already on, outermost last
  for (const armour of layers) {
    if (!armour.tri.length) continue;
    // weld the shell so its normals are smooth, then push it out past the cloth it grew from and the coats below
    for (let i = 0; i < armour.tri.length; i += 3) { armour.tri[i + 1] -= base; for (let j = 0; j < 3; j++) armour.tri[i + j] *= k; }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(armour.tri, 3));
    g = mergeVertices(g, 1e-4); g.computeVertexNormals();
    const under = facing(armour.tri);
    for (const w of worn) { under.p = Float32Array.from([...under.p, ...w.p]); under.n = Float32Array.from([...under.n, ...w.n]); }
    clearOf(g, under, armour.push);
    g.computeVertexNormals();
    { const t = g.toNonIndexed(); worn.push(facing(Array.from(t.attributes.position.array))); }
    const p = g.attributes.position;
    const m = new THREE.Mesh(g, markTeam(new THREE.MeshStandardMaterial({ color: teamColour(armour.color, team), metalness: armour.metal ? 0.35 : 0, roughness: armour.metal ? 0.42 : 0.85, flatShading: true }), armour.color));
    m.castShadow = m.receiveShadow = true;
    m.userData.part = 'armour';   // so a bake can keep coats apart from the body (bake.js armour levels)
    group.add(m);
    tris += g.index ? g.index.count / 3 : p.count / 3;
  }
  for (const b in bones) bones[b] = toM(bones[b]);
  for (const h of Object.values(hands)) { h.p = toM(h.p); h.wrist = toM(h.wrist); }
  const head = headBox.isEmpty() ? null : new THREE.Box3(toM(headBox.min), toM(headBox.max));
  return { group, bones, hands, head, k, team, tris: Math.round(tris) };
}

// 'team' is the team colour, 'team2' a lighter cloth shade of it, 'team3' a darker felt one; anything else is a colour.
const TEAM_SHADE = { team: 1, team2: 1, team3: 0.7 };
const markTeam = (m, c) => { if (TEAM_SHADE[c]) m.userData.team = TEAM_SHADE[c]; return m; };
const teamColour = (c, team) => c === 'team' ? new THREE.Color(TEAM[team])
  : c === 'team2' ? new THREE.Color(TEAM[team]).lerp(new THREE.Color('#fff'), 0.3)
  : c === 'team3' ? new THREE.Color(TEAM[team]).lerp(new THREE.Color('#000'), 0.3) : new THREE.Color(c);

// Materials: `tint` recolours by material name, `flat` replaces a textured mesh with plain colour.
function recolour(mat, mesh, { team, tint, flat, fbx }) {
  // the Quaternius FBX files arrive fully transparent and with their colours read too dark
  const m = Object.assign(mat.clone(), { transparent: false, opacity: 1 });
  if (fbx) m.color.convertLinearToSRGB();
  if ('shininess' in m) m.shininess = 4;
  if ('specular' in m) m.specular = new THREE.Color('#111');
  const c = flat[mesh] || tint[mat.name];
  if (c) {
    if (flat[mesh]) m.map = null;
    m.color = teamColour(c, team);
    markTeam(m, c);
  }
  return m;
}

// ---- gear: separate weapon, shield and helmet models hung on a posed figure ----

const GEAR_DIR = 'assets/q18/';
async function gearModel(name) {
  const o = (await C.fbx(GEAR_DIR + name + '.fbx')).clone(true);
  o.traverse(m => {
    if (!m.isMesh) return;
    m.material = [].concat(m.material).map(x => {
      const c = Object.assign(x.clone(), { transparent: false, opacity: 1, shininess: 6, specular: new THREE.Color('#222') });
      c.color.convertLinearToSRGB();
      return c;
    });
    if (m.material.length === 1) m.material = m.material[0];
    m.castShadow = true;
  });
  return o;
}
// Place gear in the figure's frame: `at` names a bone (or 'chest'), `off` and `rot` adjust it,
// `len` is the size in metres along its longest side, or `native` keeps the figure's own scale.
// `at: 'head'` fits a helmet over the measured head instead, with `room` to spare all round.
// On a figure with posed hands, `hand` puts the item in that fist instead: the item's origin is its grip, its +y
// runs along the hand's weapon line toward the head or point, its +x (the edge, or where an axe head juts) toward
// the knuckles, or toward `edge` (a model-space direction) when given. `grip` moves the hand to that fraction of the
// item's length from its butt, `twist` turns the item about its length, and `slide` moves it along its length in metres. `shield` straps a shield to that forearm
// instead, upright with its face toward `face` (model space; forward and a little out to that side by default),
// `flip` if the model faces the other way.
async function hang(fig, { item, at, off = [0, 0, 0], rot = [0, 0, 0], len, native, tint, room = 1.18, hand, grip, edge, twist = 0, slide = 0, shield, face, flip }) {
  const o = await gearModel(item);
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  if (at === 'head' && fig.head) {
    const hs = fig.head.getSize(new THREE.Vector3()), hc = fig.head.getCenter(new THREE.Vector3());
    // a bun or ponytail shouldn't blow the helmet up, so depth counts only up to a round head
    const k = Math.max(hs.x * room / s.x, Math.min(hs.z, hs.x * 1.15) * room / s.z);
    o.scale.multiplyScalar(k);
    if (tint) o.traverse(m => { if (m.isMesh) [].concat(m.material).forEach(x => { if (tint[x.name]) { x.color = teamColour(tint[x.name], fig.team); markTeam(x, tint[x.name]); } }); });
    // the crown sits just above the top of the head
    o.position.set(hc.x, fig.head.max.y + hs.y * 0.06 - b.max.y * k, hc.z).add(new THREE.Vector3(...off));
    fig.group.add(o);
    fig.tris += C.tris(o);
    return;
  }
  const k = native ? fig.k : len / Math.max(s.x, s.y, s.z);
  o.scale.multiplyScalar(k);
  if (tint) o.traverse(m => { if (m.isMesh) [].concat(m.material).forEach(x => { if (tint[x.name]) { x.color = teamColour(tint[x.name], fig.team); markTeam(x, tint[x.name]); } }); });
  const wrap = new THREE.Group();
  wrap.add(o);
  const H = fig.hands?.[hand || shield];
  if (H && hand) {
    const A = H.axis, E = edge ? new THREE.Vector3(...edge) : new THREE.Vector3(0, 1, 0).applyQuaternion(H.q);
    E.addScaledVector(A, -E.dot(A)).normalize();
    wrap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(E, A, new THREE.Vector3().crossVectors(E, A)));
    wrap.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(AX.y, twist * DEG));
    if (grip != null) o.position.y = -(b.min.y + grip * s.y) * k;
    wrap.position.copy(H.p).addScaledVector(A, slide);
    fig.group.add(wrap);
    fig.tris += C.tris(o);
    return wrap;
  }
  if (H && shield) {
    const out = new THREE.Vector3(...(face || [shield === 'L' ? 0.5 : -0.5, 0, 0.87])).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(out, -out.y).normalize();
    face = out;
    if (flip) o.rotation.y = Math.PI;
    o.updateMatrixWorld(true);
    // centred on the forearm a little toward the wrist, its back just off the arm
    const ob = new THREE.Box3().setFromObject(o), c = ob.getCenter(new THREE.Vector3());
    o.position.sub(new THREE.Vector3(c.x, c.y, ob.min.z));
    wrap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, face), up, face));
    wrap.position.copy(fig.bones['fore' + shield]).lerp(H.wrist, 0.6).addScaledVector(face, 0.05);
    fig.group.add(wrap);
    fig.tris += C.tris(o);
    return wrap;
  }
  const p = at === 'chest' ? fig.bones.shL.clone().add(fig.bones.shR).multiplyScalar(0.5) : at === 'helm' ? fig.bones.head.clone() : fig.bones[at].clone();
  wrap.position.copy(p).add(new THREE.Vector3(...off));
  wrap.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'YXZ');
  fig.group.add(wrap);
  fig.tris += C.tris(o);
  return wrap;
}

// Shoulder pads spread across the upper arms of a figure that isn't the knight they were made for.
async function fitPads(fig) {
  const o = await gearModel('ShoulderPads');
  o.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  const span = fig.bones.armL.distanceTo(fig.bones.armR) + 0.28;
  o.scale.multiplyScalar(span / s.x);
  const mid = fig.bones.armL.clone().add(fig.bones.armR).multiplyScalar(0.5);
  o.position.copy(mid).add(new THREE.Vector3(0, 0.07, 0));
  fig.group.add(o);
  fig.tris += C.tris(o);
}

// ============================================================ families

// Gear kits, shared by the rigged families so each shows the same equipment.
 // `hand` and `shield` place an item on figures posed in holding stances; the others use `at`, `off` and `rot`.
const KIT = {
  spear: [{ item: 'W_Spear', hand: 'R', at: 'R', len: 2.7, off: [0, -0.02, 0.04], rot: [8, 0, 0] }, { item: 'W_Shield_Round', shield: 'L', at: 'L', len: 0.62, off: [0.06, 0.22, 0.12], rot: [0, -15, 0], tint: { LightWood: 'team' } }],
  sword: [{ item: 'W_Sword', hand: 'R', at: 'R', len: 0.95, off: [0, 0, 0.02], rot: [35, 0, 0] }, { item: 'W_Shield_Heater', shield: 'L', at: 'L', len: 0.72, off: [0.06, 0.25, 0.12], rot: [0, -15, 0], tint: { LightWood: 'team' } }],
  archer: [{ item: 'W_Bow_Wooden', hand: 'L', twist: 180, at: 'L', len: 1.45, off: [0.02, 0.1, 0.06], rot: [0, -90, 0] }, { item: 'W_Arrow', at: 'chest', len: 0.75, off: [0.12, 0.05, -0.2], rot: [-150, 0, 15] }, { item: 'W_Arrow', at: 'chest', len: 0.75, off: [0.16, 0.05, -0.2], rot: [-150, 0, 22] }],
  villager: [{ item: 'W_Axe', hand: 'R', grip: 0.1, edge: [0, 0, 1], at: 'R', len: 0.8, off: [0, 0, 0.03], rot: [20, 90, 0] }],
  cav: [{ item: 'W_Spear', hand: 'R', at: 'R', len: 3.3, off: [0, 0, 0.05], rot: [55, 0, 0] }, { item: 'W_Shield_Heater_2', shield: 'L', at: 'L', len: 0.66, off: [0.08, 0.2, 0.05], rot: [0, -20, 0], tint: { LightWood: 'team' } }],
};
// Helmets per role; archers get the open helmet dyed as a felt hood in a dark team shade, which also shows their side.
const HELM = { spear: ['Helmet2'], sword: ['Helmet1'], cav: ['Helmet3'], archer: ['Helmet2', { Grey: 'team3' }] };

// Body armour per role, grown over the torso: steel plate for the line, mail for cavalry, leather for archers.
const TORSO = ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR'];
// A team surcoat goes over the belly and hips, leaving the steel showing at the chest and shoulders.
const SURCOAT = { bones: ['Abdomen', 'Torso', 'Hips'], push: 0.05, color: 'team' };
const ARMOUR = {
  spear: [{ bones: TORSO, push: 0.028, color: '#9aa2ab', metal: true }, SURCOAT],
  sword: [{ bones: TORSO, push: 0.028, color: '#b3bac2', metal: true }, SURCOAT],
  cav: [{ bones: [...TORSO, 'UpperArmL', 'UpperArmR'], push: 0.024, color: '#7d848c', metal: true }, SURCOAT],
  archer: [{ bones: TORSO, push: 0.02, color: '#6b4a2e' }],
};

// Each family builds one figure for a role and team; tris counts the figure with its gear.
const FAMILIES = [
  {
    id: 'current', name: 'Current game', lic: 'in the game now',
    note: 'The procedural soldiers the battles draw today: very light and readable from far away, but blocky up close.',
    build: async (role, team) => procedural(V1, T1, role, team),
  },
  {
    id: 'v2', name: 'Handmade v2', lic: 'drawn for this game',
    note: 'Claude’s redrawn procedural set: kettle hats, heater shields, longbows, a horse with a caparison. About 400 triangles each.',
    build: async (role, team) => procedural(V2, V2, role, team),
  },
  {
    id: 'kay', name: 'KayKit knight', lic: 'CC0',
    note: 'KayKit Adventurers, posed and baked. Chunky cartoon proportions. Weapons hang on its hand slots, so a Quaternius spear, bow and lance swap in cleanly. Cape and shield are redrawn in team colour, since the texture alone barely shows the team. Rides the Quaternius horse.',
    build: async (role, team) => {
      const who = role === 'archer' ? 'Rogue_Hooded' : role === 'villager' ? 'Barbarian' : 'Knight';
      const keepKay = { spear: ['Round_Shield'], sword: ['1H_Sword', 'Badge_Shield'], archer: [], villager: [], cav: [] }[role];
      const fig = await bake('glb', C.KC + who + '.glb', {
        rig: 'kay', team, height: 1.85, seated: role === 'cav',
        clip: role === 'sword' ? 'Blocking' : role === 'spear' ? 'Idle' : 'Idle',
        drop: n => C.WEAPON.test(n) && !keepKay.includes(n) || (role === 'archer' && n === 'Knight_Helmet'),
        flat: { Knight_Cape: 'team', Barbarian_Cape: 'team', Rogue_Cape: 'team', Round_Shield: 'team', Badge_Shield: 'team' },
      });
      const kit = { spear: [KIT.spear[0]], sword: [], archer: [KIT.archer[0], ...KIT.archer.slice(1)], villager: KIT.villager, cav: KIT.cav }[role];
      for (const g of kit) await hang(fig, g);
      return fig;
    },
  },
  {
    id: 'q18', name: 'Quaternius knight', lic: 'CC0',
    note: 'Quaternius’s animated knight (2018), only about 950 triangles. Helmets, shoulder pads and weapons are separate pieces, so every role gets its own kit: three helmets, plus the Quaternius weapons pack. The tunic takes the team colour.',
    build: async (role, team) => {
      const fig = await bake('fbx', GEAR_DIR + 'KnightCharacter.fbx', {
        rig: 'q18', team, seated: role === 'cav', clip: 'Idle', height: 1.85,
        tint: { Armor: role === 'villager' ? C.DYES[team * 3] : 'team', Boots: '#3a2a1c' }, armour: ARMOUR[role],
      });
      if (HELM[role]) await hang(fig, { item: HELM[role][0], tint: HELM[role][1], at: 'head', room: 1.12 });
      if (role !== 'villager' && role !== 'archer') await hang(fig, { item: 'ShoulderPads', at: 'chest', native: true, off: [0, 0.02, 0] });
      for (const g of KIT[role]) await hang(fig, g);
      return fig;
    },
  },
  {
    id: 'qmod', name: 'Quaternius people', lic: 'CC0',
    note: 'Quaternius’s modular men and women: realistic proportions, flat colours, 5,500 to 8,500 triangles before weapons, so the heaviest set here. Outfits mix on one skeleton and every colour is a named material, so team colours are exact. Armour comes from the knight’s helmets and the weapons pack, refitted to each figure: helmets are sized to the measured head and hair, shoulder pads to the shoulders.',
    build: async (role, team) => {
      const file = { spear: 'Male_Adventurer', sword: 'Male_Adventurer', archer: 'Male_Adventurer', villager: 'Male_Farmer', cav: 'Male_King' }[role];
      const hold = { spear: ['Hold_Spear_R', 'Hold_Shield_L'], sword: ['Hold_Sword_R', 'Hold_Shield_L'], archer: ['Hold_Bow_L'], villager: ['Hold_Sword_R'], cav: ['Hold_Spear_R', 'Hold_Shield_L'] }[role];
      const fig = await bake('glb', 'assets/qmod/' + file + '.glb', {
        rig: 'qmod', team, seated: role === 'cav', hold, trimHair: !!HELM[role], height: 1.8,
        drop: n => n === 'Backpack' || n === 'Sword',
        tint: { Green: 'team', LightGreen: 'team2', Blue: 'team' }, armour: ARMOUR[role],
      });
      if (HELM[role]) await hang(fig, { item: HELM[role][0], tint: HELM[role][1], at: 'head' });
      if (role === 'spear' || role === 'sword' || role === 'cav') await fitPads(fig);
      for (const g of KIT[role]) await hang(fig, g);
      return fig;
    },
  },
];

// The procedural sets draw one merged geometry for gear and one for team cloth.
function procedural(V, T, role, team) {
  const model = role === 'cav' ? V.cavalry() : role === 'villager' ? T.peasant() : V.infantry(role === 'archer' ? 'archer' : role);
  const group = C.instancedBlock(model, [[0, 0, 0]], team, role === 'villager');
  return { group, tris: Math.round((model.gear.attributes.position.count + model.cloth.attributes.position.count) / 3) };
}

// The Quaternius horse carries the rigged riders; the procedural sets bring their own horse.
async function horse(team) {
  const h = await bake('fbx', GEAR_DIR + 'Horse.fbx', { clip: 'Idle', height: 1.75 });
  // a saddle cloth in team colour, draped over the back and down both flanks
  const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.8, 12, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
  geo.rotateX(-Math.PI / 2);
  const cloth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: TEAM[team], side: THREE.DoubleSide }));
  cloth.userData.saddleCloth = true;
  h.saddle = saddle(h.group);
  cloth.position.set(0, h.saddle.y - 0.3, h.saddle.z);
  cloth.castShadow = true;
  h.group.add(cloth);
  return h;
}
// The top of the horse's back a little behind its middle, found by dropping a ray onto it
// (the horse is too low-poly to have a vertex just there).
function saddle(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group), mid = (box.min.z + box.max.z) / 2 - (box.max.z - box.min.z) * 0.08;
  const ray = new THREE.Raycaster(new THREE.Vector3(0, box.max.y + 1, mid), new THREE.Vector3(0, -1, 0));
  const meshes = [];
  group.traverse(m => { if (m.isMesh) { [].concat(m.material).forEach(x => { x.side = THREE.DoubleSide; }); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); meshes.push(m); } });
  const hit = ray.intersectObjects(meshes, false)[0];
  return new THREE.Vector3(0, hit ? hit.point.y : box.max.y * 0.6, mid);
}

async function figure(fam, role, team) {
  const fig = await fam.build(role, team);
  if (role !== 'cav' || fam.id === 'current' || fam.id === 'v2') return fig;
  const h = await horse(team);
  // sit the rider's hips on the saddle
  const g = new THREE.Group();
  g.add(h.group);
  fig.group.position.set(0, h.saddle.y + 0.08 - fig.bones.hips.y, h.saddle.z - fig.bones.hips.z);
  g.add(fig.group);
  return { group: g, tris: fig.tris + h.tris, horseTris: h.tris };
}

// ============================================================ buildings

const RTS = 'assets/qrts/';
// Quaternius Fantasy RTS: the nearest building for each of the game's, ≈ marks a stand-in.
const RTS_MAP = {
  house: ['Houses_FirstAge_1_Level2'], woodcutter: ['Storage_FirstAge_Level1', '≈'], quarry: ['Resource_Rock_1', '≈'], mine: ['Mine'],
  hunter: ['Houses_FirstAge_3_Level2', '≈'], carpenter: ['Storage_FirstAge_Level2', '≈'], ropemaker: ['Market_FirstAge_Level1', '≈'],
  smelter: ['Houses_FirstAge_2_Level2', '≈'], bowyer: ['Archery_FirstAge_Level1'], weaponsmith: ['Barracks_FirstAge_Level1', '≈'],
  barracks: ['Barracks_FirstAge_Level2'], farm: ['Farm_FirstAge_Level2'],
};
// One scale per pack, set by a reference house, so upgrade levels and buildings keep their relative sizes.
const packScale = new Map();
async function packModel(dir, ref, refWidth, name) {
  if (!packScale.has(dir)) {
    const s = new THREE.Box3().setFromObject((await C.gltf(dir + ref + '.gltf')).scene).getSize(new THREE.Vector3());
    packScale.set(dir, refWidth / Math.max(s.x, s.z));
  }
  const o = (await C.gltf(dir + name + '.gltf')).scene.clone(true);
  o.scale.setScalar(packScale.get(dir));
  const wrap = new THREE.Group();
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -b.min.y, -c.z);
  wrap.add(o);
  C.shadowAll(wrap);
  return wrap;
}
const rtsModel = name => packModel(RTS, 'Houses_FirstAge_1_Level1', 5, name);
// The older Quaternius Medieval Village pack is drawn larger, so its smallest house is set to the RTS house's width.
const MVP = 'assets/qmvp/';
const mvpModel = name => packModel(MVP, 'House_4', 5.5, name);
async function rtsBuilding(kind) {
  const [name] = RTS_MAP[kind];
  const g = await rtsModel(name);
  if (kind === 'farm') { const w = await rtsModel('Farm_FirstAge_Level2_Wheat'); g.add(w); }
  if (kind === 'quarry') { const c = await rtsModel('Crate_Stack1'); c.position.set(2.2, 0, 1.5); g.add(c); }
  if (kind === 'woodcutter') { const l = await rtsModel('Logs'); l.position.set(2.6, 0, 1.8); g.add(l); }
  return g;
}

const BUILD_FAMILIES = [
  { id: 'current', name: 'Current game', make: k => C.building('current', k, 0) },
  { id: 'v2', name: 'Handmade v2', make: k => C.building('v2', k, 0) },
  { id: 'kaykit', name: 'KayKit Hexagon', make: k => C.building('kaykit', k, 0), standin: C.KK_STANDIN },
  { id: 'quat', name: 'Quaternius Village', make: k => C.building('quat', k, 0) },
  { id: 'rts', name: 'Quaternius Fantasy RTS', make: rtsBuilding, standin: Object.fromEntries(Object.entries(RTS_MAP).filter(([, v]) => v[1]).map(([k]) => [k, 'nearest match'])) },
];
const KINDS = ['house', 'woodcutter', 'quarry', 'mine', 'hunter', 'carpenter', 'ropemaker', 'smelter', 'bowyer', 'weaponsmith', 'barracks', 'farm'];
const KIND_NAMES = { house: 'House', woodcutter: 'Woodcutter', quarry: 'Quarry', mine: 'Mine', hunter: 'Hunter', carpenter: 'Carpenter', ropemaker: 'Ropemaker', smelter: 'Smelter', bowyer: 'Bowyer', weaponsmith: 'Weaponsmith', barracks: 'Barracks', farm: 'Farm' };

const KEEPS = [
  { name: 'Current keep', make: () => C.keep('current') },
  { name: 'Handmade v2 keep', make: () => C.keep('v2') },
  { name: 'KayKit castle', make: () => C.keep('kaykit') },
  { name: 'Kenney castle', make: () => C.keep('kenney') },
  { name: 'Fantasy RTS town centre I', make: () => rtsModel('TownCenter_FirstAge_Level1') },
  { name: 'Town centre II', make: () => rtsModel('TownCenter_FirstAge_Level2') },
  { name: 'Town centre III', make: () => rtsModel('TownCenter_FirstAge_Level3') },
  { name: 'Town centre, second age', make: () => rtsModel('TownCenter_SecondAge_Level3') },
  { name: 'Wonder: wood fort', make: () => rtsModel('Wonder_FirstAge_Level2') },
  { name: 'Wonder: wood castle', make: () => rtsModel('Wonder_FirstAge_Level3') },
  { name: 'Wonder: stone castle', make: () => rtsModel('Wonder_SecondAge_Level2') },
  { name: 'Wonder: fortress', make: () => rtsModel('Wonder_SecondAge_Level3') },
];

// Economy chains: what each pack offers for gathering, refining and making, without forcing the game's current list.
// Each cell is [model maker, note]; a '≈' note marks a building borrowed for a job it wasn't made for.
const CHAIN = [
  ['gather', 'Wood'], ['gather', 'Stone'], ['gather', 'Ore'], ['gather', 'Food'],
  ['refine', 'Planks'], ['refine', 'Iron'], ['refine', 'Flour'],
  ['make', 'Weapons'], ['make', 'Bows'], ['make', 'Horses'],
];
const withProps = (main, props) => async () => {
  const g = await main();
  for (const [make, x, z] of props) { const o = await make(); o.position.set(x, 0, z); g.add(o); }
  return g;
};
const rts = n => () => rtsModel(n), mvp = n => () => mvpModel(n), kk = k => () => C.building('kaykit', k, 0);
const ECONOMY = [
  { name: 'Fantasy RTS', cells: [
    [withProps(rts('Storage_FirstAge_Level1'), [[rts('Logs'), 3.4, 2.4], [rts('Resource_PineTree_Group_Cut'), -4, -4]]), '≈'],
    [withProps(async () => C.fit(await rtsModel('Resource_Rock_2'), 5), [[rts('Crate_Stack1'), 3.2, 2.6]]), '≈'], [rts('Mine')],
    [withProps(rts('Farm_FirstAge_Level2'), [[rts('Farm_FirstAge_Level2_Wheat'), 0, 0]])],
    [rts('Storage_FirstAge_Level2'), '≈'], [rts('Houses_FirstAge_2_Level2'), '≈'], [rts('Windmill_FirstAge')],
    [rts('Barracks_FirstAge_Level1'), '≈'], [rts('Archery_FirstAge_Level1')], null] },
  { name: 'Medieval Village pack', cells: [
    null, null, null, null,
    [mvp('Sawmill')], [mvp('Blacksmith')], [mvp('Mill')],
    [withProps(mvp('Blacksmith'), [[mvp('Cauldron'), 4, 2]])], null, [mvp('Stable')]] },
  { name: 'KayKit Hexagon', cells: [
    [kk('woodcutter')], [kk('quarry'), '≈'], [kk('mine')], [kk('farm')],
    [kk('carpenter'), '≈'], [kk('smelter')], [() => C.clone(C.KK + 'building_windmill_blue.gltf', 6.5)],
    [kk('weaponsmith')], [kk('bowyer')], null] },
  { name: 'Mixed: RTS + Village', cells: [
    [withProps(rts('Storage_FirstAge_Level1'), [[rts('Logs'), 3.4, 2.4], [rts('Resource_PineTree_Group_Cut'), -4, -4]]), '≈'],
    [withProps(async () => C.fit(await rtsModel('Resource_Rock_2'), 5), [[rts('Crate_Stack1'), 3.2, 2.6]]), '≈'], [rts('Mine')],
    [withProps(rts('Farm_FirstAge_Level2'), [[rts('Farm_FirstAge_Level2_Wheat'), 0, 0]])],
    [mvp('Sawmill')], [mvp('Blacksmith')], [rts('Windmill_FirstAge')],
    [withProps(mvp('Blacksmith'), [[mvp('Cauldron'), 4, 2]])], [rts('Archery_FirstAge_Level1')], [mvp('Stable')]] },
];

// The whole Fantasy RTS pack: every building at each level, first age then second age.
const LEVELLED = [
  ['Houses, style 1', 'Houses_%_1_Level#'], ['Houses, style 2', 'Houses_%_2_Level#'], ['Houses, style 3', 'Houses_%_3_Level#'],
  ['Town centre', 'TownCenter_%_Level#'], ['Barracks', 'Barracks_%_Level#'], ['Archery range', 'Archery_%_Level#'],
  ['Market', 'Market_%_Level#'], ['Storage', 'Storage_%_Level#'], ['Temple', 'Temple_%_Level#'],
  ['Watchtower', 'WatchTower_%_Level#'], ['Farm', 'Farm_%_Level#'], ['Port', 'Port_%_Level#'], ['Wonder', 'Wonder_%_Level#'],
];
const LEVEL_COLS = ['First age', 'II', 'III', 'Second age', 'II', 'III'];
const levelName = (pat, j) => pat.replace('%', j < 3 ? 'FirstAge' : 'SecondAge').replace('#', j % 3 + 1);
// [label, model] for the pieces that come in one level only
const SINGLES = [
  ['Mine', 'Mine'], ['Windmill', 'Windmill_FirstAge'], ['Windmill, 2nd age', 'Windmill_SecondAge'], ['Tower house', 'TowerHouse_FirstAge'],
  ['Tower house, 2nd age', 'TowerHouse_SecondAge'], ['Dock', 'Dock_FirstAge'], ['Gate', 'WallTowers_Door_FirstAge'], ['Gate, 2nd age', 'WallTowers_Door_SecondAge'],
  ['Wall towers', 'WallTowers_FirstAge'], ['Wall', 'Wall_FirstAge'], ['Wall, 2nd age', 'Wall_SecondAge'], ['Wonder walls', 'WonderWalls_FirstAge'],
];

// Props: the Quaternius weapons pack, and the RTS pack's resources and clutter.
const PROPS = [
  ['W_Spear', 2.7], ['W_Sword', 0.95], ['W_Axe', 0.8], ['W_Bow_Wooden', 1.45], ['W_Bow_Wooden2', 1.45], ['W_Shield_Round', 0.62], ['W_Shield_Round_2', 0.62],
  ['W_Shield_Heater', 0.72], ['W_Shield_Heater_2', 0.72], ['W_Hammer_Small', 0.6], ['Helmet1', 0.4], ['Helmet2', 0.4], ['Helmet3', 0.4], ['ShoulderPads', 0.6],
];
// [model, size in metres across its widest side]
const RTS_PROPS = [['Logs', 2.2], ['Crate_Stack1', 1.5], ['Barrel', 0.7], ['Resource_Rock_1', 2.4], ['Resource_Gold_1', 2], ['Resource_PineTree_Group', 5], ['Resource_Tree_Group', 5]];

// ============================================================ layout

const ROLES = [['villager', 'Villager'], ['spear', 'Spearman'], ['sword', 'Swordsman'], ['archer', 'Archer'], ['cav', 'Cavalry']];
const ROLE_X = { villager: -10, spear: -6, sword: -2, archer: 2, cav: 7.5 };
const SECTIONS = {
  units: { title: 'Soldiers and villagers', cam: [-1.5, 17, 15], at: [-1.5, 0, -9.5], span: 26 },
  closeup: { title: 'Close-up: swapped gear', cam: [-1.5, 5.4, -9.4], at: [-1.5, 0.5, -18], span: 18, labels: 'units' },
  buildings: { title: 'Buildings', cam: [0, 150, -30], at: [0, 0, -106], span: 110 },
  keeps: { title: 'Keeps and castles', cam: [0, 190, -88], at: [0, 0, -236], span: 130 },
  economy: { title: 'Economy chains', cam: [-190, 140, -100], at: [-190, 0, -222], span: 120 },
  upgrades: { title: 'Fantasy RTS, whole pack', cam: [185, 230, -70], at: [185, 0, -255], span: 150 },
  reg_q18: { title: 'Regiments: knight', cam: [-107, 22, -8], at: [-135, 0, 25], span: 45, labels: 'regiments' },
  reg_qmod: { title: 'Regiments: people', cam: [-32, 22, -8], at: [-60, 0, 25], span: 45, labels: 'regiments' },
  battle: { title: 'Battle test', cam: [-30, 30, 120], at: [0, 0, 165], span: 60 },
  props: { title: 'Weapons and props', cam: [29, 9, 9], at: [29, 0.4, -3], span: 16 },
};
const labels = [];
const label = (sec, text, pos, cls = '') => labels.push({ sec, text, pos: new THREE.Vector3(...pos), cls });
const notes = [];
const place = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o); return o; };

async function buildUnits() {
  const rowZ = i => -i * 5;
  for (const [role, name] of ROLES) label('units', name, [ROLE_X[role], 0, -23.6], 'col');
  for (let i = 0; i < FAMILIES.length; i++) {
    const fam = FAMILIES[i], z = rowZ(i);
    const tri = {};
    for (const [role] of ROLES) {
      const gap = role === 'cav' ? 1.25 : 0.62;
      for (const team of [0, 1]) {
        try {
          const f = await figure(fam, role, team);
          place(f.group, ROLE_X[role] + (team ? gap : -gap), z, team ? -0.25 : 0.25);
          tri[role] = f.tris;
        } catch (e) { console.error(fam.id, role, e); tri[role] = 'failed'; }
      }
      setProgress();
    }
    label('units', fam.name, [-11.6, 0, z], 'row');
    notes.push({ sec: 'Soldiers', name: fam.name, lic: fam.lic, note: fam.note, tris: tri });
  }
}

async function buildBuildings() {
  const x0 = -(KINDS.length - 1) * 6, z0 = -64;
  KINDS.forEach((k, j) => label('buildings', KIND_NAMES[k], [x0 + j * 12, 0, z0 + 8], 'col'));
  for (let i = 0; i < BUILD_FAMILIES.length; i++) {
    const fam = BUILD_FAMILIES[i], z = z0 - i * 20;
    label('buildings', fam.name, [x0 - 6.5, 0, z], 'row');
    for (let j = 0; j < KINDS.length; j++) {
      const kind = KINDS[j];
      try {
        const o = await fam.make(kind);
        if (o) {
          if (fam.id === 'rts' && kind !== 'farm') o.scale.multiplyScalar(C.FOOT[kind] / 5.6);
          place(o, x0 + j * 12, z, 0.35);
          if (fam.standin?.[kind]) label('buildings', '≈', [x0 + j * 12 + 4.5, 0, z + 4.5], 'small');
        }
      } catch (e) { console.error(fam.id, kind, e); }
      setProgress();
    }
  }
}

async function buildKeeps() {
  // two rows of four: the game's and the kits' keeps, then the Fantasy RTS town centre by level
  for (let i = 0; i < KEEPS.length; i++) {
    const x = ((i % 4) - 1.5) * 46, z = -192 - Math.floor(i / 4) * 44;
    try {
      const o = await KEEPS[i].make();
      if (i >= 4) o.scale.multiplyScalar(2.4);
      place(o, x, z, 0.3);
      label('keeps', KEEPS[i].name, [x, 0, z + 15], 'col');
    } catch (e) { console.error('keep', i, e); }
    setProgress();
  }
}

async function buildUpgrades() {
  const x0 = 120, z0 = -180, dx = 17, dz = 17;
  LEVEL_COLS.forEach((t, j) => label('upgrades', t, [x0 + j * dx, 0, z0 + 10], 'col'));
  for (let i = 0; i < LEVELLED.length; i++) {
    const [name, pat] = LEVELLED[i], z = z0 - i * dz;
    label('upgrades', name, [x0 - 8, 0, z], 'row');
    for (let j = 0; j < 6; j++) {
      const file = levelName(pat, j);
      try {
        const o = await rtsModel(file);
        if (name === 'Farm') o.add(await rtsModel(file + '_Wheat'));
        place(o, x0 + j * dx, z, 0.35);
      } catch (e) { console.error(file, e); }
      setProgress();
    }
  }
  // single pieces in two columns to the right of the grid
  label('upgrades', 'One level only', [x0 + 7.35 * dx, 0, z0 + 13], 'col');
  for (let i = 0; i < SINGLES.length; i++) {
    const [name, file] = SINGLES[i], x = x0 + (6.6 + (i % 2) * 1.5) * dx, z = z0 - Math.floor(i / 2) * dz;
    try { place(await rtsModel(file), x, z, 0.35); label('upgrades', name, [x, 0, z + 7], 'small'); } catch (e) { console.error(file, e); }
    setProgress();
  }
}

// ---- regiments: blocks of one figure drawn many times, as the battles will draw them ----

// Draw a figure once per position with one instanced mesh per part, so a block costs a few draw calls.
function regiment(fig, spots) {
  const block = new THREE.Group(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  fig.group.updateMatrixWorld(true);
  const inv = fig.group.matrixWorld.clone().invert();
  fig.group.traverse(part => {
    if (!part.isMesh) return;
    const local = inv.clone().multiply(part.matrixWorld);
    const inst = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
    spots.forEach(([x, z, ry], i) => inst.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(AX.y, ry), one).multiply(local)));
    inst.castShadow = inst.receiveShadow = true;
    block.add(inst);
  });
  return block;
}
// Ranks and files facing +z, with a little jitter so the block doesn't look stamped.
function formation(files, ranks, gapX, gapZ, seed) {
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280 - 0.5);
  const out = [];
  for (let i = 0; i < ranks; i++) for (let j = 0; j < files; j++)
    out.push([(j - (files - 1) / 2) * gapX + rnd() * 0.12, -i * gapZ + rnd() * 0.12, rnd() * 0.14]);
  return out;
}
// [role, files, ranks, gap across, gap back]
const REGIMENTS = [['spear', 8, 4, 0.8, 0.95], ['sword', 8, 4, 0.85, 1.0], ['archer', 7, 3, 0.95, 1.1], ['cav', 5, 2, 1.5, 3.0]];
const REG_FAMS = ['q18', 'qmod'];
const REG_NAMES = { q18: 'Quaternius knight', qmod: 'Quaternius people' };

async function buildRegiments() {
  // each set gets a field: blue on the near side facing red across a gap
  const xs = [-135, -60], widths = REGIMENTS.map(([, f, , gx]) => f * gx);
  for (let fi = 0; fi < REG_FAMS.length; fi++) {
    const fam = FAMILIES.find(f => f.id === REG_FAMS[fi]), cx = xs[fi];
    label('regiments', REG_NAMES[fam.id] + ': blue faces red', [cx, 0, 42], 'col');
    for (const team of [0, 1]) {
      let x = cx - (widths.reduce((a, b) => a + b, 0) + 3 * (REGIMENTS.length - 1)) / 2;
      for (const [role, files, ranks, gx, gz] of REGIMENTS) {
        const w = files * gx;
        try {
          const fig = await figure(fam, role, team);
          const spots = formation(files, ranks, gx, gz, 7 + files * 13 + team).map(([px, pz, ry]) => team ? [-px, -pz, ry + Math.PI] : [px, pz, ry]);
          place(regiment(fig, spots), x + w / 2, team ? 32 : 18);
          if (!team) label('regiments', ROLES.find(r => r[0] === role)[1], [x + w / 2, 0, 18 + 2.2], 'small');
        } catch (e) { console.error('regiment', fam.id, role, e); }
        x += w + 3;
        setProgress();
      }
    }
  }
}

// ---- light versions: one merged, simplified mesh per figure, for soldiers away from the camera ----

// Every part of a figure in one geometry, its material colours written into the vertices.
function flatten(fig) {
  fig.group.updateMatrixWorld(true);
  const inv = fig.group.matrixWorld.clone().invert(), out = [];
  fig.group.traverse(part => {
    if (!part.isMesh) return;
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    g.applyMatrix4(inv.clone().multiply(part.matrixWorld));
    const mats = [].concat(part.material), n = g.attributes.position.count, col = new Float32Array(n * 3);
    // non-indexed groups count vertices, so each vertex takes its group's material colour
    const groups = Array.isArray(part.material) && part.geometry.groups.length ? part.geometry.groups : [{ start: 0, count: n, materialIndex: 0 }];
    const vc = g.attributes.color, c = new THREE.Color();
    for (const gr of groups) for (let i = gr.start; i < Math.min(n, gr.start + gr.count); i++) {
      c.copy((mats[gr.materialIndex] || mats[0]).color);
      if (vc) c.multiply(new THREE.Color(vc.getX(i), vc.getY(i), vc.getZ(i)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const y = new THREE.BufferGeometry();
    y.setAttribute('position', g.attributes.position);
    y.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push(y);
  });
  return mergeGeometries(out);
}
// Simplify toward `tris` triangles; colour borders stay where they are, so faces and tabards keep their shape.
function lighten(geo, tris) {
  const g = mergeVertices(geo, 1e-4);
  const [idx] = MeshoptSimplifier.simplify(new Uint32Array(g.index.array), new Float32Array(g.attributes.position.array), 3, tris * 3, 0.06);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}
const LIGHT_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---- battle test: a thousand soldiers or more, with a frame-rate meter ----

const BATTLE = { at: new THREE.Vector3(0, 0, 165), group: null, types: [], count: 1000, mode: 'auto', shadows: true, light: 1500, near: 28 };
// shares of each side's soldiers, and their block layout: [role, share, files, gap across, gap back]
const BATTLE_MIX = [['spear', 0.35, 16, 0.8, 0.95], ['sword', 0.3, 14, 0.85, 1.0], ['archer', 0.25, 14, 0.95, 1.1], ['cav', 0.1, 8, 1.5, 3.0]];

async function battleTypes() {
  if (BATTLE.types.length) return;
  await MeshoptSimplifier.ready;
  const fam = FAMILIES.find(f => f.id === 'qmod');
  for (const team of [0, 1]) for (const [role] of BATTLE_MIX) {
    const fig = await figure(fam, role, team);
    const full = flatten(fig);
    const light = lighten(full, role === 'cav' ? BATTLE.light * 1.6 : BATTLE.light);
    full.computeVertexNormals();
    BATTLE.types.push({ team, role, fig, full, light, fullTris: Math.round(full.attributes.position.count / 3), lightTris: Math.round(light.attributes.position.count / 3) });
  }
}
// Lay out both armies for the chosen size, each type drawn by a full and a light instanced mesh.
function battleArmies() {
  if (BATTLE.group) { scene.remove(BATTLE.group); BATTLE.group.traverse(o => o.isInstancedMesh && o.dispose()); }
  const group = BATTLE.group = new THREE.Group();
  group.position.copy(BATTLE.at);
  for (const t of BATTLE.types) {
    const [, share, files, gx, gz] = BATTLE_MIX.find(m => m[0] === t.role);
    const n = Math.max(files, Math.round(BATTLE.count / 2 * share));
    const ranks = Math.ceil(n / files), x0 = { spear: -22, sword: -6, archer: 9, cav: 25 }[t.role];
    t.spots = formation(files, ranks, gx, gz, 11 + files).slice(0, n).map(([px, pz, ry]) => t.team
      ? Object.assign(new THREE.Vector3(x0 - px, 0, -pz + 10), { ry: ry + Math.PI })
      : Object.assign(new THREE.Vector3(x0 + px, 0, pz - 10), { ry }));
    // the full mesh keeps each part's material; the light one is a single coloured mesh
    t.parts = [];
    t.fig.group.updateMatrixWorld(true);
    const inv = t.fig.group.matrixWorld.clone().invert();
    t.fig.group.traverse(part => {
      if (!part.isMesh) return;
      const im = new THREE.InstancedMesh(part.geometry, part.material, n);
      im.userData.local = inv.clone().multiply(part.matrixWorld);
      im.frustumCulled = false;
      group.add(im); t.parts.push(im);
    });
    t.lightMesh = new THREE.InstancedMesh(t.light, LIGHT_MAT, n);
    t.lightMesh.frustumCulled = false;
    group.add(t.lightMesh);
  }
  group.traverse(o => { if (o.isInstancedMesh) o.castShadow = o.receiveShadow = BATTLE.shadows; });
  scene.add(group);
  battleLOD(true);
}
// Each soldier near the camera goes in the full meshes, the rest in the light one.
const _m = new THREE.Matrix4(), _r = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _w = new THREE.Vector3();
let lodTick = 0;
function battleLOD(force) {
  if (!BATTLE.group || (!force && ++lodTick % 6)) return;
  for (const t of BATTLE.types) {
    let nf = 0, nl = 0;
    for (const p of t.spots) {
      const near = BATTLE.mode === 'full' || (BATTLE.mode === 'auto' && _w.copy(p).add(BATTLE.at).distanceTo(camera.position) < BATTLE.near);
      _m.compose(p, _r.setFromAxisAngle(AX.y, p.ry), _one);
      if (near) { for (const im of t.parts) im.setMatrixAt(nf, _m.clone().multiply(im.userData.local)); nf++; }
      else t.lightMesh.setMatrixAt(nl++, _m);
    }
    for (const im of t.parts) { im.count = nf; im.instanceMatrix.needsUpdate = true; }
    t.lightMesh.count = nl; t.lightMesh.instanceMatrix.needsUpdate = true;
  }
}
let battleBuilt = false;
async function enterBattle() {
  const others = scene.children.filter(o => !baseKids.has(o) && o !== BATTLE.group);
  others.forEach(o => (o.visible = false));
  $('#battleui').hidden = false;
  if (!battleBuilt) {
    battleBuilt = true;
    $('#progress').textContent = 'Building the armies…';
    await battleTypes();
    battleArmies();
    $('#progress').textContent = '';
    renderBattleUI();
  }
  BATTLE.group.visible = true;
}
function leaveBattle() {
  scene.children.forEach(o => { if (!baseKids.has(o)) o.visible = o !== BATTLE.group; });
  $('#battleui').hidden = true;
}
function renderBattleUI() {
  const t = BATTLE.types.filter(x => x.team === 0);
  const opt = (k, v, text) => `<button data-k="${k}" data-v="${v}" class="${BATTLE[k] === v ? 'on' : ''}">${text}</button>`;
  $('#battleui .opts').innerHTML =
    `<div><span>Soldiers</span>${[500, 1000, 2000, 4000].map(n => opt('count', n, n.toLocaleString())).join('')}</div>` +
    `<div><span>Detail</span>${opt('mode', 'auto', 'Full near camera')}${opt('mode', 'light', 'All light')}${opt('mode', 'full', 'All full')}</div>` +
    `<div><span>Shadows</span>${opt('shadows', true, 'On')}${opt('shadows', false, 'Off')}</div>`;
  $('#battleui .tris').textContent = 'Triangles per soldier, full → light: ' + t.map(x => `${ROLES.find(r => r[0] === x.role)[1]} ${x.fullTris.toLocaleString()} → ${x.lightTris.toLocaleString()}`).join(' · ');
}
let fpsFrames = 0, fpsT = performance.now();
function battleMeter() {
  if (active !== 'battle' || !BATTLE.group) return;
  battleLOD();
  fpsFrames++;
  const now = performance.now();
  if (now - fpsT > 1000) {
    const fps = fpsFrames * 1000 / (now - fpsT);
    $('#battleui .fps').textContent = `${Math.round(fps)} fps · ${(renderer.info.render.triangles / 1e6).toFixed(2)} M triangles · ${renderer.info.render.calls} draw calls`;
    fpsFrames = 0; fpsT = now;
  }
}

async function buildEconomy() {
  const x0 = -255, z0 = -190, dx = 17, dz = 20;
  const stage = { gather: 'Gather', refine: 'Refine', make: 'Make' };
  CHAIN.forEach(([st, name], j) => {
    label('economy', name, [x0 + j * dx, 0, z0 + 10], 'col');
    if (j === 0 || CHAIN[j - 1][0] !== st) label('economy', stage[st] + ' →', [x0 + j * dx - 4, 0, z0 + 15], 'small');
  });
  for (let i = 0; i < ECONOMY.length; i++) {
    const row = ECONOMY[i], z = z0 - i * dz;
    label('economy', row.name, [x0 - 8, 0, z], 'row');
    for (let j = 0; j < CHAIN.length; j++) {
      const cell = row.cells[j], x = x0 + j * dx;
      if (!cell) { label('economy', 'none', [x, 0, z], 'small'); setProgress(); continue; }
      try {
        place(await cell[0](), x, z, 0.35);
        if (cell[1]) label('economy', cell[1], [x + 5, 0, z + 5], 'small');
      } catch (e) { console.error(row.name, CHAIN[j][1], e); }
      setProgress();
    }
  }
}

async function buildProps() {
  const x0 = 21;
  for (let i = 0; i < PROPS.length; i++) {
    const [item, len] = PROPS[i];
    const o = await gearModel(item);
    const w = C.fit(o, len, { by: item.startsWith('Helmet') || item === 'ShoulderPads' ? 'xz' : 'y' });
    C.shadowAll(w);
    place(w, x0 + (i % 7) * 1.7, -(Math.floor(i / 7)) * 2.4, 0.4);
    label('props', item.replace('W_', '').replace(/_/g, ' '), [x0 + (i % 7) * 1.7, 0, -(Math.floor(i / 7)) * 2.4 + 0.7], 'small');
    setProgress();
  }
  let x = x0 - 1;
  for (const [name, size] of RTS_PROPS) {
    const o = C.fit(await rtsModel(name), size);
    x += size / 2;
    place(o, x, -6.5, 0.4);
    label('props', name.replace('Resource_', '').replace(/_/g, ' '), [x, 0, -6.5 + size / 2 + 0.5], 'small');
    x += size / 2 + 0.6;
    setProgress();
  }
}

// ============================================================ page

let done = 0, total = REG_FAMS.length * 2 * REGIMENTS.length + FAMILIES.length * ROLES.length + BUILD_FAMILIES.length * KINDS.length + KEEPS.length + ECONOMY.length * CHAIN.length + LEVELLED.length * 6 + SINGLES.length + PROPS.length + RTS_PROPS.length;
function setProgress() {
  done++;
  $('#progress').textContent = done >= total ? '' : `Loading models… ${Math.round(done / total * 100)}%`;
}

let active = 'units';
const labelLayer = $('#labels');
function renderLabels() {
  labelLayer.innerHTML = labels.map((l, i) => `<span class="lab ${l.cls}" data-i="${i}" hidden>${l.text}</span>`).join('');
}
const _p = new THREE.Vector3();
function placeLabels() {
  const els = labelLayer.children, w = canvas.clientWidth, h = canvas.clientHeight;
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i], el = els[i];
    if (!el) continue;
    const show = l.sec === (SECTIONS[active].labels || active) && _p.copy(l.pos).project(camera).z < 1;
    el.hidden = !show;
    // row labels end at their point, so they sit to the left of the row they name
    if (show) el.style.transform = `translate(${(_p.x + 1) / 2 * w}px, ${(1 - _p.y) / 2 * h}px) translate(${l.cls === 'row' ? '-100%' : '-50%'}, -50%)`;
  }
}

function go(id, instant) {
  if (active === 'battle' && id !== 'battle') leaveBattle();
  active = id;
  if (id === 'battle') enterBattle();
  const s = SECTIONS[id];
  // pull back on narrow screens so the whole group still fits across
  const at = new THREE.Vector3(...s.at), to = new THREE.Vector3(...s.cam).sub(at).multiplyScalar(Math.min(2.4, Math.max(1, 1.75 / camera.aspect))).add(at);
  aimSun(at, s.span);
  document.querySelectorAll('#sections button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  if (instant) { camera.position.copy(to); controls.target.copy(at); return; }
  const from = camera.position.clone(), fromT = controls.target.clone(), t0 = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / 900), e = t * t * (3 - 2 * t);
    camera.position.lerpVectors(from, to, e); controls.target.lerpVectors(fromT, at, e);
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}
$('#sections').innerHTML = Object.entries(SECTIONS).map(([id, s]) => `<button data-id="${id}">${s.title}</button>`).join('');
$('#sections').addEventListener('click', e => { const id = e.target.dataset?.id; if (id) go(id); });

function renderNotes() {
  const fmt = n => (typeof n === 'number' ? n.toLocaleString() : n || '–');
  $('#notes').innerHTML = `<table><thead><tr><th>Soldier set</th><th>Licence</th>${ROLES.map(([, n]) => `<th>${n}</th>`).join('')}<th></th></tr></thead><tbody>${
    notes.map(n => `<tr><td><b>${n.name}</b></td><td>${n.lic}</td>${ROLES.map(([r]) => `<td class="num">${fmt(n.tris[r])}</td>`).join('')}<td class="note">${n.note}</td></tr>`).join('')
  }</tbody></table><p class="hint">Numbers are triangles per figure, including its weapons (and horse, for cavalry). The battles draw thousands of soldiers at once, so lighter is better.</p>`;
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
go('units', true);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); placeLabels(); battleMeter(); });
$('#battleui').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  const k = b.dataset.k, v = k === 'count' ? +b.dataset.v : k === 'shadows' ? b.dataset.v === 'true' : b.dataset.v;
  BATTLE[k] = v;
  if (k === 'count') battleArmies();
  else if (k === 'shadows') { renderer.shadowMap.enabled = v; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)); }); }
  else battleLOD(true);
  renderBattleUI();
});

// ?only=units (or another section) builds just that group, which is quicker while adjusting it
const baseKids = new Set(scene.children);
const only = new URLSearchParams(location.search).get('only');
const want = id => !only || only === id;
if (want('units')) { await buildUnits(); renderLabels(); renderNotes(); }
if (want('reg_q18') || want('reg_qmod') || only === 'regiments') { await buildRegiments(); renderLabels(); }
if (want('props')) await buildProps();
if (want('buildings')) await buildBuildings();
if (want('keeps')) await buildKeeps();
if (want('economy')) await buildEconomy();
if (want('upgrades')) await buildUpgrades();
renderLabels();
$('#progress').textContent = '';
window.__roster = { THREE, C, MeshoptSimplifier, mergeGeometries, mergeVertices, FAMILIES, KIT, HELM, ARMOUR, figure, horse, fitPads, rtsModel, mvpModel, flatten, lighten, teamColour, renderer, scene, camera, shot: () => { controls.update(); renderer.render(scene, camera); placeLabels(); }, controls, go, FAMILIES, figure, bake, hang, labels };
