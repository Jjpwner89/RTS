// Animation for the baked soldiers: the clips in assets/art/3d (Quaternius rigs, see its INTEGRATION.txt) sampled into
// one table of bone matrices (assets/anim.bin, described by assets/anim.json), and the skin data each baked vertex
// needs to follow them. The game skins on the GPU (src/anim.js), so thousands of instanced soldiers can each play
// their own clip.
//
// Four skeletons: the Quaternius modular men (one skeleton shared by the adventurer, farmer and king), the women
// (the same bones in a different rest pose, so clips are retargeted onto it), the 2018 horse, and the war dog (made
// here, its clips worked out in code: see the end).
// A human has 24 bones (fingers fold into the wrist, curled round a grip) and eleven "prop" bones that carry what a
// soldier holds: right-hand weapon, bow, shield, the villagers' axe, pick, hoe and sack, and the two halves of a bow's
// and a crossbow's string. Each clip decides where a prop goes or hides it (a zero matrix). Horse vertices use bone
// numbers from 128.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';

const R = window.__roster, { THREE, C } = R;
export const SLOTS = 35, HORSE = 128, FPS = 20;
export const HUMAN = ['Root', 'Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'ShoulderL', 'UpperArmL', 'LowerArmL', 'WristL',
  'ShoulderR', 'UpperArmR', 'LowerArmR', 'WristR', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR', 'FootL', 'PTL', 'FootR', 'PTR'];
export const PROP = { R: 24, BOW: 25, SHIELD: 26, AXE: 27, PICK: 28, HOE: 29, STRING_A: 30, STRING_B: 31, CSTRING_A: 32, CSTRING_B: 33, SACK: 34 };
// A string hangs between its weapon's tips in two halves, each hinged at its own tip, so its middle can be drawn back
// while its ends stay on the tips. `on` is the weapon's prop, `tips` where the string's ends are in that prop's frame
// (bake.js split() puts the string's vertices on these props, and stops if a baked string isn't there), `nut` where a
// spanned crossbow's string is caught.
export const STRINGS = {
  W_Bow_Wooden: { on: 'BOW', halves: ['STRING_A', 'STRING_B'], tips: [[0.68, -0.271, 0], [-0.68, -0.271, 0]] },
  crossbow: { on: 'R', halves: ['CSTRING_A', 'CSTRING_B'], tips: [[0.384, 0.291, 0], [0.384, -0.291, 0]], nut: [0.12, 0, 0] },
};
const FINGER = /^(Index|Middle|Ring|Pinky|Thumb)\d([LR])$/;
const RIGHT_ARM = ['ShoulderR', 'UpperArmR', 'LowerArmR', 'WristR'];
const UPPER = ['Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'ShoulderL', 'UpperArmL', 'LowerArmL', 'WristL', ...RIGHT_ARM];
// Where a held thing sits in the wrist's frame (INTEGRATION.txt).
const GRIP = new THREE.Vector3(0, 0.135, -0.035);
// Clips where the left hand grips the shield; in the rest it rides strapped to the forearm (as it does when the
// left hand is on a spear's shaft, so the shaft runs beside the shield, not through it).
const SHIELD_IN_HAND = new Set(['Shield_Block', 'Shield_Wall', 'Cheer']);
// How far a spearman's shield's middle keeps from the shaft (the round shield is 0.31 m across to its rim).
const SHIELD_CLEAR = 0.34;
const TOOLS = { Chop: 'AXE', Mine: 'PICK', Hoe: 'HOE' };

// The clips each skeleton gets. `src` names the source clip; `arm` takes the right arm from March_Upright at that
// time (a weapon held upright while standing, walking or running); `upper` lays the upper body of another clip over
// this one, frozen at a time (a lance couched at the gallop) or keeping step ('step': a load carried on the move).
// Walking and running come from the stock Walk and Run, whose strides fit the game's paces (anim.js gaitSpeed);
// March_Upright and Carry step short, so on the move they lend only their arms.
const FOOT = ['Spear_Thrust', 'Spear_Brace', 'March_Upright', 'Bow_Loose', 'Crossbow_Span', 'Shield_Block', 'Shield_Wall', 'Javelin_Throw', 'Rout', 'Cheer', 'Chop', 'Hoe', 'Mine', 'Carry'];
const RIDE = ['Ride_Idle', 'Ride_Trot', 'Ride_Gallop', 'Ride_Couch', 'Ride_Slash'];
const HUMAN_CLIPS = {
  Idle: { src: 'Idle', loop: true }, Stand: { src: 'Idle', loop: true, arm: 0 },
  Walk: { src: 'Walk', loop: true }, Run: { src: 'Run', loop: true }, RunArmed: { src: 'Run', loop: true, arm: 0 }, WalkArmed: { src: 'Walk', loop: true, arm: 0 },
  CarryWalk: { src: 'Walk', loop: true, upper: ['Carry', 'step'], weapon: 'Carry' }, CarryRun: { src: 'Run', loop: true, upper: ['Carry', 'step'], weapon: 'Carry' },
  Death: { src: 'Death', hold: true }, Sword_Slash: { src: 'Sword_Slash' },
};
const RIDER_CLIPS = { Ride_Charge: { src: 'Ride_Gallop', loop: true, upper: ['Ride_Couch', 1], weapon: 'Ride_Couch' } };
// (the stock walk stalls halfway through its loop, so a horse walks in a slowed trot)
const HORSE_CLIPS = { Idle: { src: 'Armature|Idle', loop: true }, Trot: { src: 'Trot', loop: true }, Gallop: { src: 'Gallop', loop: true }, Rear: { src: 'Rear' } };

let rigs = null;
export async function load(dir = 'assets/clips/') {
  if (rigs) return rigs;
  const L = new GLTFLoader();
  const [foot, riders, horsePack, manifest, male, female, horse] = await Promise.all([
    L.loadAsync(dir + 'clips-foot.glb'), L.loadAsync(dir + 'clips-riders.glb'), L.loadAsync(dir + 'clips-horse.glb'),
    fetch(dir + 'clip-manifest.json').then(r => r.json()),
    C.gltf('assets/qmod/Male_Adventurer.glb'), C.gltf('assets/qmod/Female_Medieval.glb'), C.fbx('assets/q18/Horse.fbx'),
  ]);
  const meta = Object.fromEntries(manifest.clips.map(c => [c.name, c]));
  const clipsOf = list => Object.fromEntries(list.map(a => [a.name, a]));
  const humanSrc = { ...clipsOf(male.animations), ...clipsOf(foot.animations), ...clipsOf(riders.animations) };
  const metres = horsePack.scene.getObjectByName('HorseMetres');
  metres.updateMatrix();
  rigs = {
    meta,
    male: rig('male', SU.clone(male.scene), humanSrc),
    female: rig('female', SU.clone(female.scene), humanSrc),
    horse: rig('horse', SU.clone(horse), { ...clipsOf(horse.animations), ...clipsOf(horsePack.animations) }, metres.matrix.clone()),
  };
  rigs.female.from = rigs.male;
  return rigs;
}

function rig(name, root, clips, G = new THREE.Matrix4()) {
  root.updateMatrixWorld(true);
  let skel = null;
  root.traverse(o => { if (o.isSkinnedMesh && !skel) skel = o.skeleton; });
  const bones = new Map(skel.bones.map(b => [b.name, b])), IB = new Map(skel.bones.map((b, i) => [b.name, skel.boneInverses[i]]));
  const slots = name === 'horse' ? skel.bones.map(b => b.name) : HUMAN;
  const rest = new Map(skel.bones.map(b => [b.name, { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(new THREE.Vector3()), local: b.quaternion.clone(), pos: b.position.clone() }]));
  return { name, root, clips, G, Ginv: G.clone().invert(), bones, IB, slots, rest, mixer: new THREE.AnimationMixer(root) };
}

// ---- posing ----

// Put a rig in a clip's pose at time t (seconds). A clip with `arm` or `upper` mixes in a second pose.
function sample(r, src, t) {
  const clip = r.clips[src];
  if (!clip) throw new Error(`no clip ${src} for ${r.name}`);
  r.mixer.stopAllAction();
  r.mixer.uncacheRoot(r.root);
  for (const b of r.bones.values()) { const s = r.rest.get(b.name); b.quaternion.copy(s.local); b.position.copy(s.pos); }
  const a = r.mixer.clipAction(clip);
  a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  r.mixer.setTime(Math.min(t, clip.duration));
  r.root.updateMatrixWorld(true);
}
function pose(r, def, t) {
  const base = r.from || r;
  sample(base, def.src, t);
  const over = def.arm != null ? [RIGHT_ARM, 'March_Upright', def.arm] : def.upper ? [UPPER, ...def.upper] : null;
  if (over) {
    const keep = over[0].map(n => base.bones.get(n)), held = new Map();
    sample(base, over[1], over[2] === 'step' ? t / base.clips[def.src].duration * base.clips[over[1]].duration : over[2]);
    for (const b of keep) held.set(b, b.quaternion.clone());
    sample(base, def.src, t);
    for (const [b, q] of held) b.quaternion.copy(q);
    base.root.updateMatrixWorld(true);
  }
  if (r.from) retarget(r.from, r);
}
// A woman's skeleton follows a man's: each bone turns in the world as his does from its rest, and the hips move as
// his do, scaled to her height.
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3();
function retarget(m, f) {
  const turn = new Map();
  for (const [name, b] of m.bones) turn.set(name, b.getWorldQuaternion(new THREE.Quaternion()).multiply(_q.copy(m.rest.get(name).q).invert()));
  const k = f.rest.get('Hips').p.y / m.rest.get('Hips').p.y;
  f.root.traverse(b => {
    if (!b.isBone || !turn.has(b.name)) return;
    const want = turn.get(b.name).clone().multiply(f.rest.get(b.name).q);
    b.parent.updateMatrixWorld(true);
    b.parent.getWorldQuaternion(_q2);
    b.quaternion.copy(_q2.invert().multiply(want));
    if (b.name === 'Hips') {
      const d = m.bones.get('Hips').getWorldPosition(new THREE.Vector3()).sub(m.rest.get('Hips').p).multiplyScalar(k);
      b.position.copy(b.parent.worldToLocal(_p.copy(f.rest.get('Hips').p).add(d)));
    }
    b.updateMatrixWorld(true);
  });
}

// ---- the matrices for one frame ----

const ZERO = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
const ramp = (t, a, b) => { const v = Math.min(1, Math.max(0, (t - a) / (b - a))); return v * v * (3 - 2 * v); };
const basis = (x, y) => { const bx = new THREE.Vector3(...x).normalize(), by = new THREE.Vector3(...y); by.addScaledVector(bx, -by.dot(bx)).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bx.clone().cross(by))); };
// A bone's skinning matrix: from bind space to where the clip has it, in the rig's metres.
function skinMatrix(r, name) {
  const b = r.bones.get(name);
  return new THREE.Matrix4().copy(r.G).multiply(b.matrixWorld).multiply(r.IB.get(name)).multiply(r.Ginv);
}
// A frame turned like the man's bone (the clip's frame of reference) but placed at this rig's own bone.
function boneFrame(r, name) {
  const m = (r.from || r).bones.get(name), b = r.bones.get(name);
  return new THREE.Matrix4().compose(b.getWorldPosition(new THREE.Vector3()), m.getWorldQuaternion(new THREE.Quaternion()), new THREE.Vector3(1, 1, 1));
}
function hand(r, side, axis) {
  const q = new THREE.Quaternion();
  if (axis) q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...axis).normalize());
  else if (side === 'R') q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  return boneFrame(r, 'Wrist' + side).multiply(new THREE.Matrix4().compose(GRIP, q, new THREE.Vector3(1, 1, 1)));
}
// The shield strapped to the left forearm when the hand isn't gripping it: face out and forward, top toward the elbow.
function armShield(r) {
  const s = r.rest, e = s.get('LowerArmL').p, w = s.get('WristL').p;
  const up = e.clone().sub(w).normalize(), out = new THREE.Vector3(0.6, 0, 0.8);
  out.addScaledVector(up, -out.dot(up)).normalize();
  const at = e.clone().lerp(w, 0.5).addScaledVector(out, 0.07);
  const rest = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(out, up), out, up).setPosition(at);
  const b = r.bones.get('LowerArmL');
  return b.matrixWorld.clone().multiply(new THREE.Matrix4().compose(s.get('LowerArmL').p, s.get('LowerArmL').q, new THREE.Vector3(1, 1, 1)).invert()).multiply(rest);
}

// A carried sack (Carry: "sack on right shoulder", the right hand at its neck): on top of the right shoulder, turned
// with the chest. Its frame: +z forward, +y up, as the man stands.
function shoulderSack(r) {
  const m = (r.from || r), turn = m.bones.get('Chest').getWorldQuaternion(new THREE.Quaternion()).multiply(m.rest.get('Chest').q.clone().invert());
  const at = r.bones.get('UpperArmR').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.02, 0.09, -0.04).applyQuaternion(turn));
  return new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1));
}

function props(r, name, def, t) {
  const meta = rigs.meta[def.weapon || def.src] || {}, w = meta.weapon || {}, out = {};
  const axis = def.arm != null ? rigs.meta.March_Upright.weapon.axis : w.bone === 'Wrist.R' ? w.axis : null;
  const none = meta.equipment && meta.equipment !== undefined;
  // right hand
  if (none || TOOLS[name]) out.R = ZERO;
  else if (w.crossbow) {
    const cb = w.crossbow, g = ramp(t, ...cb.blendToGround) * (1 - ramp(t, ...cb.blendToHeld));
    const p = r.bones.get('WristR').localToWorld(GRIP.clone()).lerp(new THREE.Vector3(...cb.grounded.grip), g);
    out.R = new THREE.Matrix4().compose(p, basis(cb.held.barrel, cb.held.bow).slerp(basis(cb.grounded.barrel, cb.grounded.bow), g), new THREE.Vector3(1, 1, 1));
  } else if (name === 'Javelin_Throw' && t >= meta.events.find(e => e.event === 'release-javelin').time) out.R = ZERO;
  else out.R = hand(r, 'R', axis);
  // left hand: the bow rides the wrist; the shield the hand or the forearm
  out.BOW = none ? ZERO : hand(r, 'L', w.bone === 'Wrist.L' ? w.axis : null);
  out.SHIELD = none ? ZERO : SHIELD_IN_HAND.has(def.src) ? hand(r, 'L', null) : armShield(r);
  // with both hands on a spear, the strapped shield stands off the shaft (the kneeling brace brings it in close)
  if (!none && /^Spear_/.test(def.src)) {
    const grip = new THREE.Vector3().setFromMatrixPosition(out.R), along = new THREE.Vector3().setFromMatrixColumn(out.R, 0).normalize();
    const c = new THREE.Vector3(0, 0.08, 0).applyMatrix4(out.SHIELD).sub(grip), off = c.clone().addScaledVector(along, -c.dot(along)), d = off.length();
    if (d < SHIELD_CLEAR) out.SHIELD = new THREE.Matrix4().makeTranslation(...off.normalize().multiplyScalar(SHIELD_CLEAR - d).toArray()).multiply(out.SHIELD);
  }
  for (const k of ['AXE', 'PICK', 'HOE']) out[k] = TOOLS[name] === k ? hand(r, 'R', axis) : ZERO;
  out.SACK = (def.weapon || def.src) === 'Carry' ? shoulderSack(r) : ZERO;
  // the strings: a bow's drawn to the right hand from the nock to the loose; a crossbow's drawn by both hands from
  // the prod up the stock while spanning, then caught on the nut until the shot; otherwise straight from tip to tip
  const ev = e => meta.events?.find(x => x.event === e)?.time;
  const bow = def.src === 'Bow_Loose' ? ramp(t, ev('nock'), ev('nock') + 0.15) * (1 - ramp(t, ev('loose'), ev('loose') + 0.03)) : 0;
  const draw = hand(r, 'R', null);
  for (const [item, S] of Object.entries(STRINGS)) {
    const m = out[S.on], live = m.determinant() !== 0, inv = live && m.clone().invert();
    const rest = new THREE.Vector3(...S.tips[0]).add(new THREE.Vector3(...S.tips[1])).multiplyScalar(0.5);
    let mid = rest;
    if (live && item !== 'crossbow' && bow > 0) mid = rest.clone().lerp(new THREE.Vector3().setFromMatrixPosition(draw).applyMatrix4(inv), bow);
    if (live && item === 'crossbow' && def.src === 'Crossbow_Span' && t >= ev('string-caught')) {
      const nut = new THREE.Vector3(...S.nut), hands = new THREE.Vector3().setFromMatrixPosition(draw).add(new THREE.Vector3().setFromMatrixPosition(hand(r, 'L', null))).multiplyScalar(0.5).applyMatrix4(inv);
      const k = t >= ev('string-spanned') ? 1 : Math.min(1, Math.max(0, (rest.x - hands.x) / (rest.x - nut.x)));
      mid = rest.clone().lerp(nut, k * (1 - ramp(t, ev('shoot'), ev('shoot') + 0.03)));
    }
    S.halves.forEach((h, i) => { out[h] = m.clone().multiply(hinge(new THREE.Vector3(...S.tips[i]), rest, mid)); });
  }
  return out;
}
// The affine map that keeps `tip` where it is and takes `from` to `to`: turned and stretched along the string.
function hinge(tip, from, to) {
  const a = from.clone().sub(tip), b = to.clone().sub(tip), u = a.clone().normalize();
  const k = b.length() / a.length() - 1, st = new THREE.Matrix4().set(
    1 + k * u.x * u.x, k * u.x * u.y, k * u.x * u.z, 0,
    k * u.y * u.x, 1 + k * u.y * u.y, k * u.y * u.z, 0,
    k * u.z * u.x, k * u.z * u.y, 1 + k * u.z * u.z, 0, 0, 0, 0, 1);
  const turn = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(u, b.normalize()));
  return new THREE.Matrix4().makeTranslation(tip.x, tip.y, tip.z).multiply(turn).multiply(st).multiply(new THREE.Matrix4().makeTranslation(-tip.x, -tip.y, -tip.z));
}

// One frame: SLOTS matrices as rows of a 3x4, in the rig's metres.
// a bone's matrix as the table keeps it: three rows of four
const pack = (out, i, m) => { const e = m.elements; out.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], i * 12); };
function frame(r, name, def, t) {
  pose(r, def, t);
  const out = new Float32Array(SLOTS * 12), put = (i, m) => pack(out, i, m);
  r.slots.forEach((n, i) => put(i, skinMatrix(r, n)));
  if (r.name !== 'horse') for (const [k, m] of Object.entries(props(r, name, def, t))) put(PROP[k], m);
  return out;
}

// Every clip of every rig, sampled at FPS (loops resampled to a whole number of frames).
export async function bakeClips() {
  await load();
  const humanDefs = { ...HUMAN_CLIPS, ...Object.fromEntries(FOOT.map(n => [n, { src: n, loop: !!rigs.meta[n].loop, hold: !!rigs.meta[n].hold }])) };
  const riderDefs = { ...Object.fromEntries(RIDE.map(n => [n, { src: n, loop: !!rigs.meta[n].loop, hold: !!rigs.meta[n].hold }])), ...RIDER_CLIPS };
  // (the woman's clips are the man's, in the same order, so each of hers starts a fixed number of frames after his:
  // a model with both, a lady and her bannerman, plays one clip, anim.js)
  const humans = { ...humanDefs, ...riderDefs };
  const plan = [['male', humans], ['female', humans], ['horse', HORSE_CLIPS], ['dog', DOG_CLIPS]];
  const frames = [], table = {};
  for (const [rn, defs] of plan) {
    const r = rigs[rn], made = rn === 'dog';
    table[rn] = {};
    for (const [name, def] of Object.entries(defs)) {
      const dur = made ? def.duration : r.clips[def.src]?.duration ?? (r.from || r).clips[def.src].duration;
      const n = Math.max(1, Math.round(dur * FPS)), count = def.loop ? n : n + 1;
      table[rn][name] = { start: frames.length, frames: count, fps: n / dur, duration: +dur.toFixed(4), ...(def.loop ? { loop: true } : {}), ...(def.hold ? { hold: true } : {}),
        ...(rigs.meta[def.src]?.events ? { events: Object.fromEntries(rigs.meta[def.src].events.map(e => [e.event, +e.time.toFixed(4)])) } : {}) };
      for (let i = 0; i < count; i++) frames.push(made ? dogFrame(def, i * dur / n) : frame(r, name, def, i * dur / n));
    }
  }
  const per = SLOTS * 3, rowFrames = Math.floor(2048 / per), width = per * rowFrames, height = Math.ceil(frames.length / rowFrames);
  const half = new Uint16Array(width * height * 4);
  frames.forEach((f, i) => { const at = (Math.floor(i / rowFrames) * width + (i % rowFrames) * per) * 4; for (let j = 0; j < f.length; j++) half[at + j] = THREE.DataUtils.toHalfFloat(f[j]); });
  return { json: { fps: FPS, slots: SLOTS, horse: HORSE, width, height, rowFrames, prop: PROP, clips: table }, bin: half, frames };
}

// ---- skin data for a baked figure ----

// Matrices for a posed bake: bind space to where each bone is now, in the rig's metres.
function poseMatrices(r, o) {
  const byName = new Map();
  o.traverse(b => { if (b.isBone) byName.set(b.name, b); });
  return r.slots.map(n => new THREE.Matrix4().copy(r.G).multiply(byName.get(n).matrixWorld).multiply(r.IB.get(n)).multiply(r.Ginv));
}
// Fingers fold into the wrist, curled as they are round the grip of a spear (right) or a shaft (left).
let fists = null;
function fistOf(r) {
  fists ??= {};
  if (!fists[r.name]) {
    fists[r.name] = {};
    for (const [side, clip] of [['R', 'March_Upright'], ['L', 'Spear_Thrust']]) {
      pose(r, { src: clip }, 0);
      const m = new Map();
      for (const name of r.bones.keys()) if (FINGER.test(name) || name === 'Wrist' + side) m.set(name, skinMatrix(r, name));
      fists[r.name][side] = m;
    }
  }
  return fists[r.name];
}

// Begun on a posed clone in roster.js bake(); collects each mesh's bind positions and weights.
export function begin(rigName, o) {
  const r = rigs[rigName], pose0 = poseMatrices(r, o), slot = new Map(r.slots.map((n, i) => [n, i]));
  const body = { pos: [], bones: [], weights: [] };
  return {
    rig: rigName,
    // `posed` holds the vertices where the bake put them (the posed clone's world space)
    mesh(n, posed) {
      const pos = n.geometry.attributes.position, si = n.geometry.attributes.skinIndex, sw = n.geometry.attributes.skinWeight;
      const bind = new Float32Array(pos.count * 3), bones = new Float32Array(pos.count * 4), weights = new Float32Array(pos.count * 4);
      const v = new THREE.Vector3(), p = new THREE.Vector3(), acc = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(n.bindMatrix).applyMatrix4(r.G);
        const names = [0, 1, 2, 3].map(j => n.skeleton.bones[si.getComponent(i, j)].name), w = [0, 1, 2, 3].map(j => sw.getComponent(i, j));
        const finger = names.find((nm, j) => w[j] > 0 && FINGER.test(nm));
        if (finger) {
          // curl the hand into a fist, then hold it rigidly on the wrist
          const side = FINGER.exec(finger)[2], fist = fistOf(r)[side];
          acc.set(0, 0, 0);
          names.forEach((nm, j) => { if (w[j] > 0) acc.addScaledVector(p.copy(v).applyMatrix4(fist.get(FINGER.test(nm) || nm === 'Wrist' + side ? nm : 'Wrist' + side)), w[j]); });
          v.copy(acc).applyMatrix4(fist.get('Wrist' + side).clone().invert());
          bones.set([slot.get('Wrist' + side), 0, 0, 0], i * 4); weights.set([1, 0, 0, 0], i * 4);
        } else {
          const sum = w.reduce((a, b) => a + b, 0) || 1;
          bones.set(names.map(nm => slot.get(nm) ?? 0), i * 4); weights.set(w.map(x => x / sum), i * 4);
        }
        bind.set([v.x, v.y, v.z], i * 3);
        p.fromArray(posed, i * 3).applyMatrix4(r.G);
        body.pos.push(p.x, p.y, p.z); body.bones.push(...bones.slice(i * 4, i * 4 + 4)); body.weights.push(...weights.slice(i * 4, i * 4 + 4));
      }
      if (rigName === 'horse') for (let i = 0; i < bones.length; i++) if (weights[i] > 0) bones[i] += HORSE;
      return { bind, bones, weights };
    },
    // the bind position for a vertex the bake has moved after posing (hair tucked under a helmet): `p` in the
    // figure's metres, `k` and `base` the bake's scale and drop
    rebind(p, bones, weights, k, base) {
      const v = new THREE.Vector3(p.x / k, p.y / k + base, p.z / k).applyMatrix4(r.G), m = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let j = 0; j < 4; j++) if (weights[j] > 0) for (let e = 0; e < 16; e++) m.elements[e] += pose0[bones[j] % HORSE].elements[e] * weights[j];
      return v.applyMatrix4(m.invert());
    },
    finish(k, base) { return { rig: rigName, G: r.G, k, base, pose0, slot, body: { pos: new Float32Array(body.pos), bones: body.bones, weights: body.weights } }; },
  };
}

// Skin data for a mesh hung on a figure after the bake (armour shells, helmets, weapons): in bake.js split().
// `fig` is the figure's group (userData.skin from begin().finish), `toFig` takes the mesh's vertices into its frame.
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
export function derive(fig, mesh, geo, toFig) {
  const sk = fig.userData.skin, n = geo.attributes.position.count;
  const bind = new Float32Array(n * 3), bones = new Float32Array(n * 4), weights = new Float32Array(n * 4);
  let prop = null, attach = null, wrap = null;
  for (let p = mesh; p && p !== fig; p = p.parent) { if (p.userData.prop && !prop) { prop = p.userData.prop; wrap = p; } if (p.userData.attach && !attach) attach = p.userData.attach; }
  const toWrap = wrap && new THREE.Matrix4().copy(wrap.matrixWorld).invert().multiply(mesh.matrixWorld);
  const toSkin = v => v.applyMatrix4(toFig).divideScalar(sk.k).add(_v.set(0, sk.base, 0)).applyMatrix4(sk.G);
  const given = geo.attributes.bones, gw = geo.attributes.weights;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(geo.attributes.position, i);
    let b, w;
    if (prop) {
      v.applyMatrix4(toWrap).applyMatrix4(prop.canon);
      b = [PROP[prop.slot], 0, 0, 0]; w = [1, 0, 0, 0];
    } else {
      toSkin(v);
      if (attach) { b = [sk.slot.get(attach), 0, 0, 0]; w = [1, 0, 0, 0]; }
      else if (given) { b = [0, 1, 2, 3].map(j => given.getComponent(i, j)); w = [0, 1, 2, 3].map(j => gw.getComponent(i, j)); }
      else { const j = nearest(sk.body, v); b = sk.body.bones.slice(j * 4, j * 4 + 4); w = sk.body.weights.slice(j * 4, j * 4 + 4); }
      // undo the pose the bake left it in
      _m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let j = 0; j < 4; j++) if (w[j] > 0) for (let e = 0; e < 16; e++) _m.elements[e] += sk.pose0[b[j]].elements[e] * w[j];
      v.applyMatrix4(_m.invert());
    }
    bind.set([v.x, v.y, v.z], i * 3); bones.set(b, i * 4); weights.set(w, i * 4);
  }
  if (sk.rig === 'horse') for (let i = 0; i < bones.length; i++) if (weights[i] > 0) bones[i] += HORSE;
  return { bind, bones, weights };
}
// How far a step from world point `from` to `to` moves a figure's vertices in its skin space (a rider set beside
// another in one model, bake.js split()).
export function skinStep(fig, from, to) {
  const sk = fig.userData.skin, inv = fig.matrixWorld.clone().invert();
  const f = v => v.clone().applyMatrix4(inv).divideScalar(sk.k).add(_v.set(0, sk.base, 0)).applyMatrix4(sk.G);
  return f(to).sub(f(from));
}
function nearest(body, v) {
  let best = 0, bd = Infinity;
  const p = body.pos;
  for (let i = 0; i < p.length; i += 3) { const d = (p[i] - v.x) ** 2 + (p[i + 1] - v.y) ** 2 + (p[i + 2] - v.z) ** 2; if (d < bd) { bd = d; best = i / 3; } }
  return best;
}
// The rig a Quaternius person is baked on.
export const rigOf = file => /Female/.test(file) ? 'female' : 'male';

// ---- the war dog ----
// The dog (bake.js warDog) is rigid pieces, each hung on one of these bones, and every clip turns them about their
// joints: no source clips, so they are worked out here. In the dog's own metres, facing +z, left at +x.
export const DOG = ['Body', 'Head', 'Tail', 'LegFL', 'LegFR', 'LegHL', 'LegHR'];
const JOINT = { Body: [0, 0.62, 0], Head: [0, 0.8, 0.42], Tail: [0, 0.78, -0.56], LegFL: [0.13, 0.6, 0.27], LegFR: [-0.13, 0.6, 0.27], LegHL: [0.13, 0.6, -0.4], LegHR: [-0.13, 0.6, -0.4] };
// The skin a dog's figure carries into the bake (derive()): its space is the dog's, every piece on one bone.
export function dogSkin() {
  return { rig: 'dog', G: new THREE.Matrix4(), k: 1, base: 0, pose0: Array.from({ length: SLOTS }, () => new THREE.Matrix4()), slot: new Map(DOG.map((n, i) => [n, i])) };
}
// A gait: how long a stride takes, the share of it each paw is down, how far a leg swings each way (radians) and how
// much it folds as it comes forward, when each leg's stance starts, and how the body rises and pitches. A planted paw
// slides back at about 1 m/s walking, 1.9 trotting and 4.5 running (anim.js gaitSpeed measures it), so with each
// played a little faster or slower every pace from a stroll to a flat-out charge has a gait whose feet keep up.
const DOG_GAITS = {
  Walk: { duty: 0.62, swing: 0.32, fold: 0.2, at: { LegHL: 0, LegFL: 0.25, LegHR: 0.5, LegFR: 0.75 }, rise: 0.012, pitch: 0.02, beats: 2 },
  Trot: { duty: 0.5, swing: 0.4, fold: 0.25, at: { LegFL: 0, LegHR: 0, LegFR: 0.5, LegHL: 0.5 }, rise: 0.02, pitch: 0.03, beats: 2 },
  Run: { duty: 0.38, swing: 0.6, fold: 0.32, at: { LegFL: 0, LegFR: 0.1, LegHR: 0.5, LegHL: 0.6 }, rise: 0.03, pitch: 0.09, beats: 1 },
};
const DOG_CLIPS = {
  Idle: { duration: 2.4, loop: true }, Walk: { duration: 0.62, loop: true, gait: 'Walk' }, Trot: { duration: 0.5, loop: true, gait: 'Trot' }, Run: { duration: 0.4, loop: true, gait: 'Run' },
  Rout: { duration: 0.4, loop: true, gait: 'Run', tail: -0.6 }, Bite: { duration: 0.7 }, Death: { duration: 0.9, hold: true },
};
const about = (j, m) => new THREE.Matrix4().makeTranslation(...j).multiply(m).multiply(new THREE.Matrix4().makeTranslation(-j[0], -j[1], -j[2]));
const rotX = a => new THREE.Matrix4().makeRotationX(a), rotY = a => new THREE.Matrix4().makeRotationY(a), rotZ = a => new THREE.Matrix4().makeRotationZ(a);
const ease = x => x * x * (3 - 2 * x);
// One leg at u through its stride (0: the paw comes down ahead): back along the ground, then folded and forward.
function legAt(g, u) {
  if (u < g.duty) return { a: -g.swing + 2 * g.swing * u / g.duty, fold: 0 };
  const s = (u - g.duty) / (1 - g.duty);
  return { a: g.swing - 2 * g.swing * ease(s), fold: g.fold * Math.sin(Math.PI * s) };
}
function dogFrame(def, t) {
  const D = def.duration, x = t / D, TAU = Math.PI * 2;
  let body = new THREE.Matrix4(), nod = 0, look = 0, wag = 0, lift = def.tail ?? 0;
  const legs = Object.fromEntries(DOG.slice(3).map(n => [n, { a: 0, fold: 0 }]));
  if (def.gait) {
    const g = DOG_GAITS[def.gait], pitch = g.pitch * Math.sin(TAU * x + 0.6);
    body = new THREE.Matrix4().makeTranslation(0, g.rise * Math.sin(TAU * g.beats * x), 0).multiply(about(JOINT.Body, rotX(pitch)));
    for (const n in legs) legs[n] = legAt(g, (x - g.at[n] + 1) % 1);
    nod = -pitch * 0.8; wag = (def.tail ? 0.15 : 0.25) * Math.sin(TAU * x);
  } else if (def === DOG_CLIPS.Idle) {   // breathing, looking about, the tail going
    body = new THREE.Matrix4().makeTranslation(0, 0.006 * Math.sin(TAU * 2 * x), 0);
    look = 0.3 * Math.sin(TAU * x); nod = 0.06 * Math.sin(TAU * 2 * x); wag = 0.3 * Math.sin(TAU * 4 * x);
  } else if (def === DOG_CLIPS.Bite) {   // a lunge: hind legs drive, the head snaps down and in at the middle
    const e = Math.sin(Math.PI * x);
    body = new THREE.Matrix4().makeTranslation(0, 0.04 * e, 0.3 * e).multiply(about(JOINT.Body, rotX(-0.12 * e)));
    legs.LegHL.a = legs.LegHR.a = 0.35 * e; legs.LegFL.a = legs.LegFR.a = -0.45 * e; legs.LegFL.fold = legs.LegFR.fold = 0.2 * e;
    nod = -0.35 * Math.sin(TAU * x); wag = 0.2 * e;   // (head up as it springs, down as it lands)
  } else {   // Death: over onto its left side, legs gone slack
    const e = ease(Math.min(1, x * 1.2));
    body = about([0.28, 0, 0], rotZ(-(Math.PI / 2 - 0.12) * e));
    for (const n in legs) legs[n] = { a: (n[3] === 'F' ? -0.25 : 0.3) * e, fold: 0.1 * e };
    nod = 0.35 * e; lift = -0.4 * e;
  }
  const out = new Float32Array(SLOTS * 12), on = m => body.clone().multiply(m);
  pack(out, 0, body);
  pack(out, 1, on(about(JOINT.Head, rotY(look).multiply(rotX(nod)))));
  pack(out, 2, on(about(JOINT.Tail, rotY(wag).multiply(rotX(lift)))));
  DOG.slice(3).forEach((n, i) => pack(out, 3 + i, on(about(JOINT[n], rotX(legs[n].a).multiply(new THREE.Matrix4().makeScale(1, 1 - legs[n].fold, 1))))));
  return out;
}
