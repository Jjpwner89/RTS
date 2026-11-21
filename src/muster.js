// The muster field: every kind of soldier in the game marching round a parade ground under its banner,
// to look over up close. Pick one from the list to see it turn on a plinth, or follow its regiment.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStage } from './stage.js';
import { drawGround, plantTrees, drawTrees } from './terrain.js';
import { unitModel, unitLook, hasLevels, buildingModel, ARMOUR_LEVELS, HAS_SHIELD } from './models.js';
import { ico } from './icons.js';
import { TYPES, lookChain } from './battle.js';
import { WOOD, soldierClip } from './view.js';
import { animGeometry, animMaterial, animDepthMaterial, setClip } from './anim.js';
import { PACE } from './pace.js';

const COLOURS = ['#3d6fd6', '#c8423a', '#d6a93d', '#4f8f4a', '#7a4fa8'];
const LORDS = {
  lord: { key: 'lord', name: 'Lord in the field', role: 'A great lord riding with the army in bright plate and a coronet, a bannerman beside him with the house banner' },
  lady: { key: 'lady', name: 'Lady in the field', role: 'A great lady riding with the army in bright plate and a coronet, a bannerman beside her with the house banner' },
};
// The order of march, and the heading each kind is listed under
const GROUPS = [
  ['Lords', T => LORDS[T.key]],
  ['Horse', T => T.mounted],
  ['Foot', T => !T.mounted && !T.engine && !T.range && T.key !== 'wardog'],
  ['Bows and javelins', T => T.range && !T.engine],
  ['Hounds', T => T.key === 'wardog'],
  ['Engines', T => T.engine],
];
const kinds = [...Object.values(LORDS), ...Object.values(TYPES)];
const ORDER = GROUPS.flatMap(([title, test]) => kinds.filter(test).map(T => ({ T, title })))
  .filter((e, i, all) => all.findIndex(o => o.T.key === e.T.key) === i);

// ---- the parade ground: a long oval track, the plinth in the middle ----
const L = 120, R = 38, TRACK = 2 * L + 2 * Math.PI * R;
const PLINTH = new THREE.Vector3(0, 0, 0);
function along(s) {
  s = ((s % TRACK) + TRACK) % TRACK;
  if (s < L) return { x: -L / 2 + s, z: R, tx: 1, tz: 0 };
  s -= L;
  if (s < Math.PI * R) { const a = Math.PI / 2 - s / R; return { x: L / 2 + R * Math.cos(a), z: R * Math.sin(a), tx: Math.sin(a), tz: -Math.cos(a) }; }
  s -= Math.PI * R;
  if (s < L) return { x: L / 2 - s, z: -R, tx: -1, tz: 0 };
  s -= L;
  const a = -Math.PI / 2 - s / R;
  return { x: -L / 2 + R * Math.cos(a), z: R * Math.sin(a), tx: Math.sin(a), tz: -Math.cos(a) };
}

const stage = createStage(document.getElementById('view'));
const scene = stage.scene, camera = stage.camera, flat = () => 0;
drawGround(scene, flat, 11);
const insideField = (x, z) => Math.abs(x) < L / 2 + R + 30 && Math.abs(z) < R + 30;
drawTrees(scene, flat, plantTrees(11, insideField, 0.42, 900));
scene.add(trackMesh(), plinthMesh());

const gearMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const clothMat = gearMat.clone();
const flagMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
const lookOf = key => lookChain(key).map(unitModel).find(Boolean) || unitModel('spear');

function trackMesh() {
  const pos = [], idx = [], W = 9, N = 240;
  for (let i = 0; i <= N; i++) {
    const p = along(i / N * TRACK);
    pos.push(p.x - p.tz * W, 0.04, p.z + p.tx * W, p.x + p.tz * W, 0.04, p.z - p.tx * W);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#8a7552', polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}
function plinthMesh() {
  const g = new THREE.Group(), stone = new THREE.MeshLambertMaterial({ color: '#a59d8c', flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 0.5, 12), stone); base.position.y = 0.25;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.4, 12), stone); top.position.y = 0.7;
  for (const m of [base, top]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  g.position.copy(PLINTH);
  return g;
}

// ---- the regiments ----
// They all march at the foot soldiers' walk (pace.js), horse and hound keeping step; an animated man's gait follows it.
const MARCH = PACE.foot;
const parade = { time: 0, winner: null }, clip = {};   // the stand-in battle soldierClip reads, and its answer
// Each regiment is a block of figures in its own instanced meshes; slots are places in the block,
// measured back from the front rank and across from the middle.
function blockSlots(files, ranks, dx, dz) {
  const out = [];
  for (let r = 0; r < ranks; r++) for (let f = 0; f < files; f++) out.push({ x: (f - (files - 1) / 2) * dx, z: -r * dz });
  return out;
}
const regiments = [];
let front = 0;
for (const { T } of ORDER) {
  const reg = { T, parts: [], s: 0, flag: null };
  // an animated soldier (models.js look.anim) marches in his clips, each man his own stand-in for the battle's
  // soldier (view.js soldierClip); the rest keep a marching bob. Both wear light models till followed (setDetail).
  const meshes = (model, slots, opts = {}) => {
    const anim = model.anim, n = slots.length;
    const m = { slots, model, ...opts, anim, gear: new THREE.InstancedMesh(model.gearLight || model, gearMat, n) };
    if (model.clothLight) m.cloth = new THREE.InstancedMesh(model.clothLight, clothMat, n);
    if (anim) {
      m.men = slots.map(() => ({ reg: { T }, v: MARCH, alive: true }));
      m.geos = { full: [animGeometry(model.gear, n), animGeometry(model.cloth, n)], light: [animGeometry(model.gearLight, n), animGeometry(model.clothLight, n)] };
    }
    for (const x of [m.gear, m.cloth]) if (x) { x.castShadow = true; x.frustumCulled = false; scene.add(x); }
    setDetail(m, false);
    reg.parts.push(m);
    return m;
  };
  let depth;
  if (LORDS[T.key]) { meshes(lookOf(T.key), [{ x: 0, z: 0 }], { gait: 'horse' }); depth = 4; }
  else if (T.engine) {
    const geo = buildingModel('siege.' + T.engine.kind);
    if (!geo) continue;
    meshes(geo, [{ x: 0, z: 0 }], { gait: 'engine', lift: T.engine.kind === 'ladder' ? 1.55 : 0 });
    const arm = buildingModel(`siege.${T.engine.kind}.arm`), at = { mangonel: { y: 0.75, z: 1.27 }, trebuchet: { y: 6.71, z: 0.88 } }[T.engine.kind];
    if (arm && at) meshes(arm, [{ x: 0, z: at.z }], { gait: 'engine', lift: at.y });
    const back = T.engine.kind === 'trebuchet' ? -5.5 : T.engine.kind === 'ladder' ? -1 : -3.4;
    const crew = T.engine.kind === 'ladder' ? [{ x: 0.9, z: -1.5 }, { x: -0.9, z: -4 }, { x: 0.9, z: -6.5 }] : blockSlots(3, 2, 1.4, 1.4).map(p => ({ x: p.x, z: p.z + back }));
    meshes(lookOf(T.key), crew, { gait: 'foot' });
    depth = 9;
  } else if (T.key === 'wardog') { meshes(lookOf(T.key), blockSlots(4, 2, 1.3, 1.6), { gait: 'dog' }); depth = 4; }
  else if (T.mounted) { meshes(lookOf(T.key), blockSlots(3, 2, 2.6, 3.6), { gait: 'horse' }); depth = 8; }
  else { meshes(lookOf(T.key), blockSlots(4, 3, 1.5, 1.7), { gait: 'foot' }); depth = 5.5; }
  // the regiment's banner, carried at its left front (a lord's bannerman carries the house banner in the model)
  if (!LORDS[T.key]) {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05, 10, 1), flagMat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.6, 6), new THREE.MeshLambertMaterial({ color: WOOD }));
    flag.castShadow = pole.castShadow = true;
    scene.add(flag, pole);
    reg.flag = { flag, pole, base: flag.geometry.attributes.position.array.slice(), x: -3.6, z: T.engine ? 2 : 1 };
  }
  reg.s = front;
  reg.depth = depth;
  front -= depth + 7;
  regiments.push(reg);
}

const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
function placeFigure(reg, part, slot, i, t) {
  // each figure follows the track from its own place in the column, so the block bends round the turns
  const p = along(reg.s + slot.z), yaw = Math.atan2(p.tx, p.tz);
  const nx = p.tz, nz = -p.tx;   // to the figure's right
  const phase = t * (part.gait === 'dog' ? 9 : part.gait === 'horse' ? 4.4 : 6.2) + i * 1.7 + reg.s * 0.3;
  let y = part.lift || 0, roll = 0, pitch = 0;
  if (part.anim) {
    const k = soldierClip(part.men[i], parade, part.anim, clip);
    for (const x of [part.gear, part.cloth]) if (x) { setClip(x.geometry, i, k.c, k.t); setClip(x.geometry, i, k.hc, k.ht, true); }
  } else if (part.gait === 'foot') { y += Math.abs(Math.sin(phase)) * 0.09; roll = Math.sin(phase) * 0.045; }
  else if (part.gait === 'horse') { y += Math.abs(Math.sin(phase)) * 0.12; pitch = Math.sin(phase * 2) * 0.025; roll = Math.sin(phase) * 0.02; }
  else if (part.gait === 'dog') { y += Math.abs(Math.sin(phase)) * 0.1; pitch = Math.sin(phase) * 0.06; }
  else if (part.gait === 'engine') { y += Math.abs(Math.sin(t * 2.1 + slot.z)) * 0.03; roll = Math.sin(t * 1.3 + reg.s) * 0.012; }
  dummy.position.set(p.x + nx * slot.x, y, p.z + nz * slot.x);
  dummy.rotation.set(pitch, yaw, roll, 'YXZ');
  dummy.updateMatrix();
  part.gear.setMatrixAt(i, dummy.matrix);
  part.cloth?.setMatrixAt(i, dummy.matrix);
}
function placeFlag(reg, t) {
  const F = reg.flag, p = along(reg.s + F.z), yaw = Math.atan2(p.tx, p.tz), nx = p.tz, nz = -p.tx;
  const x = p.x + nx * F.x, z = p.z + nz * F.x, bob = Math.abs(Math.sin(t * 6.2 + reg.s)) * 0.08;
  F.pole.position.set(x, 2.3 + bob, z);
  F.flag.position.set(x, 3.95 + bob, z);
  // the cloth streams back from the pole, rippling in the wind of the march
  F.flag.rotation.set(0, yaw + Math.PI / 2, 0);
  const a = F.flag.geometry.attributes.position, b = F.base;
  for (let i = 0; i < a.count; i++) {
    const u = b[i * 3] + 0.85;   // 0 at the pole
    a.setX(i, b[i * 3] + 0.85);
    a.setZ(i, Math.sin(u * 3.2 - t * 7 + reg.s) * 0.13 * u);
  }
  a.needsUpdate = true;
  F.flag.geometry.computeVertexNormals();
}

// ---- the plinth: one figure in full detail, slowly turning ----
const shown = new THREE.Group();
const kit = { armour: undefined, shield: true };   // the armour and shield shown on the plinth
shown.position.set(PLINTH.x, 0.9, PLINTH.z);
scene.add(shown);
let plinthMan = null;
function showOnPlinth(T) {
  for (const c of [...shown.children]) shown.remove(c);
  plinthMan = null;
  if (T.engine) {
    const geo = buildingModel('siege.' + T.engine.kind);
    if (geo) shown.add(new THREE.Mesh(geo, gearMat));
    const arm = buildingModel(`siege.${T.engine.kind}.arm`), at = { mangonel: { y: 0.75, z: 1.27 }, trebuchet: { y: 6.71, z: 0.88 } }[T.engine.kind];
    if (arm && at) { const m = new THREE.Mesh(arm, gearMat); m.position.set(0, at.y, at.z); shown.add(m); }
  } else {
    const M = hasLevels(T.key) ? unitLook(T.key, kit) : lookOf(T.key);
    if (M.anim) {   // he stands at ease in his clip, as on the march
      plinthMan = { man: { reg: { T }, v: 0, alive: true }, anim: M.anim, meshes: [[M.gear, gearMat], [M.cloth, clothMat]].map(([g, m]) => {
        const x = new THREE.InstancedMesh(animGeometry(g, 1), animMaterial(m), 1);
        x.customDepthMaterial = animDepthMaterial();
        shown.add(x);
        return x;
      }) };
    } else shown.add(new THREE.Mesh(M.gear, gearMat), new THREE.Mesh(M.cloth, clothMat));
  }
  shown.traverse(m => { m.castShadow = true; });
}

// ---- camera, picking and the list ----
const controls = new OrbitControls(camera, stage.renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 3; controls.maxDistance = 320;
camera.position.set(-30, 45, 105);
controls.target.set(0, 0, 0);
controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
let mode = 'field', picked = null, followed = null;
const fly = { from: null, to: null, t: 1 };
function flyTo(target, offset) {
  fly.from = { target: controls.target.clone(), cam: camera.position.clone() };
  fly.to = { target: target.clone(), cam: target.clone().add(offset) };
  fly.t = 0;
}

const list = document.getElementById('troops'), card = document.getElementById('card');
let lastGroup = null;
for (const { T, title } of ORDER) {
  if (!regiments.some(r => r.T === T)) continue;
  if (title !== lastGroup) { lastGroup = title; list.insertAdjacentHTML('beforeend', `<h4>${title}</h4>`); }
  const b = document.createElement('button');
  b.dataset.key = T.key;
  b.innerHTML = `<b>${T.name}</b><small>${T.role || ''}</small>`;
  b.onclick = () => pick(T);
  list.append(b);
}
const stat = (label, v) => v === undefined ? '' : `<span><small>${label}</small><b>${v}</b></span>`;
function pick(T) {
  picked = T; followed = null; mode = 'plinth';
  for (const b of list.querySelectorAll('button')) b.classList.toggle('on', b.dataset.key === T.key);
  const tall = T.engine?.kind === 'trebuchet' ? 9 : T.mounted || LORDS[T.key] ? 2.6 : T.engine ? 3.5 : 1.3;
  // on a narrow screen the card covers the lower half, so the figure is framed higher up
  const low = innerWidth < 700 ? tall * 0.55 : 0;
  flyTo(new THREE.Vector3(PLINTH.x, 0.9 + tall * 0.75 - low, PLINTH.z), new THREE.Vector3(tall * 1.5 + 0.6, tall * 0.35 + 0.3, tall * 2.3 + 1));
  controls.autoRotate = false;
  card.hidden = false;
  card.innerHTML = `<h3>${T.name}</h3><p>${T.role || ''}</p>` + (LORDS[T.key] ? '' : `<div class="stats">${stat('Men', T.count)}${stat('Health', T.hp)}${stat('Attack', T.atk)}${stat('Defence', T.def)}${stat('Speed', T.speed)}${stat('Range', T.range)}${stat('Morale', T.morale)}</div>`)
    + (hasLevels(T.key) ? `<div class="kit">${ARMOUR_LEVELS.map(l => `<button data-armour="${l}" title="${l === 'none' ? 'No armour' : l[0].toUpperCase() + l.slice(1)}">${ico('armour-' + l)}</button>`).join('')}${HAS_SHIELD[T.key] ? `<button data-shield title="Shields">${ico('shields')}</button>` : ''}</div>` : '')
    + `<div class="acts"><button data-act="follow">Follow on the march</button><button data-act="field">The whole field</button></div>`;
  // try the kind in each armour, with and without shields
  kit.armour = T.armour; kit.shield = true;
  const mark = () => {
    for (const b of card.querySelectorAll('[data-armour]')) b.classList.toggle('on', b.dataset.armour === kit.armour);
    const sb = card.querySelector('[data-shield]');
    if (sb) { sb.classList.toggle('on', kit.shield); sb.innerHTML = ico(kit.shield ? 'shields' : 'no-shield'); }
  };
  for (const b of card.querySelectorAll('[data-armour]')) b.onclick = () => { kit.armour = b.dataset.armour; mark(); showOnPlinth(T); };
  const sb = card.querySelector('[data-shield]');
  if (sb) sb.onclick = () => { kit.shield = !kit.shield; mark(); showOnPlinth(T); };
  mark();
  showOnPlinth(T);
  card.querySelector('[data-act="follow"]').onclick = () => follow(regiments.find(r => r.T === T));
  card.querySelector('[data-act="field"]').onclick = overview;
}
function follow(reg) {
  mode = 'follow'; followed = reg;
  for (const r of regiments) for (const part of r.parts) setDetail(part, r === reg);
  const p = along(reg.s - reg.depth / 2);
  const big = reg.T.engine ? 14 : reg.T.mounted ? 11 : 9;
  flyTo(new THREE.Vector3(p.x, 1.5, p.z), new THREE.Vector3(p.tz * big + p.tx * big * 0.6, big * 0.55, -p.tx * big + p.tz * big * 0.6));
}
// the regiment you follow wears its full-detail models; the rest keep the light ones
function setDetail(part, full) {
  if (part.anim) {
    [part.gear, part.cloth].forEach((x, k) => {
      x.geometry = part.geos[full ? 'full' : 'light'][k];
      x.material = animMaterial(k ? clothMat : gearMat, { light: !full });
      x.customDepthMaterial = animDepthMaterial(!full);
    });
    return;
  }
  if (!part.model.gearLight) return;
  part.gear.geometry = full ? part.model.gear : part.model.gearLight;
  if (part.cloth) part.cloth.geometry = full ? part.model.cloth : part.model.clothLight;
}
function overview() {
  mode = 'field'; followed = null; picked = null; card.hidden = true;
  for (const r of regiments) for (const part of r.parts) setDetail(part, false);
  for (const b of list.querySelectorAll('button')) b.classList.remove('on');
  flyTo(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-30, 45, 105));
  controls.autoRotate = true;
}
document.getElementById('field').onclick = overview;
document.getElementById('menu-toggle').onclick = () => document.body.classList.toggle('list-open');

const swatches = document.getElementById('colours');
COLOURS.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = c; b.title = 'Wear this colour';
  // (animated men wear copies of the cloth made for their clips: dye those too)
  b.onclick = () => { for (const m of [clothMat, animMaterial(clothMat), animMaterial(clothMat, { light: true }), flagMat]) m.color.set(c); for (const x of swatches.children) x.classList.toggle('on', x === b); };
  swatches.append(b);
  if (!i) b.onclick();
});

// ---- the loop ----
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  t += dt;
  parade.time = t;
  for (const reg of regiments) {
    reg.s += MARCH * dt;
    reg.parts.forEach(part => {
      part.slots.forEach((slot, i) => placeFigure(reg, part, slot, i, t));
      for (const x of [part.gear, part.cloth]) if (x) {
        x.instanceMatrix.needsUpdate = true;
        if (part.anim) x.geometry.attributes.aAnim.needsUpdate = x.geometry.attributes.aAnimH.needsUpdate = true;
      }
    });
    if (reg.flag) placeFlag(reg, t);
  }
  shown.rotation.y += dt * 0.35;
  if (plinthMan) {
    const k = soldierClip(plinthMan.man, parade, plinthMan.anim, clip);
    for (const x of plinthMan.meshes) { setClip(x.geometry, 0, k.c, k.t); setClip(x.geometry, 0, k.hc, k.ht, true); x.geometry.attributes.aAnim.needsUpdate = x.geometry.attributes.aAnimH.needsUpdate = true; }
  }
  if (fly.t < 1) {
    fly.t = Math.min(1, fly.t + dt / 1.4);
    const k = fly.t * fly.t * (3 - 2 * fly.t);
    controls.target.lerpVectors(fly.from.target, fly.to.target, k);
    camera.position.lerpVectors(fly.from.cam, fly.to.cam, k);
  } else if (mode === 'follow' && followed) {
    // keep the camera where you left it relative to the regiment as it marches on
    const p = along(followed.s - followed.depth / 2), to = new THREE.Vector3(p.x, 1.5, p.z), d = to.clone().sub(controls.target);
    controls.target.add(d); camera.position.add(d);
  }
  controls.update();
  const c = controls.target;
  stage.placeSun({ x: c.x, z: c.z, dist: camera.position.distanceTo(c) }, flat, 200);
  stage.renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.muster = { scene, camera, controls, regiments, pick, follow, overview, stage };
