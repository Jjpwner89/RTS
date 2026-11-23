// Animation for the baked soldiers: the clips in assets/art/3d (Quaternius rigs, see its INTEGRATION.txt) sampled into
// one table of bone matrices (assets/anim.bin, described by assets/anim.json), and the skin data each baked vertex
// needs to follow them. The game skins on the GPU (src/anim.js), so thousands of instanced soldiers can each play
// their own clip.
//
// Four skeletons: the Quaternius modular men (one skeleton shared by the adventurer, farmer and king), the women
// (the same bones in a different rest pose, so clips are retargeted onto it), the 2018 horse, and the war dog's wolf
// (Quaternius Ultimate Animated Animals, its own in-place clips: see WOLF). A fifth, the Ultimate Animated Character
// knight, only lends the men a clip (KNIGHT).
// A human has 24 bones (fingers fold into the wrist, curled round a grip) and eleven "prop" bones that carry what a
// soldier holds: right-hand weapon, bow, shield, the villagers' axe, pick, hoe, sack, hammer, saw and shovel, and the two halves of a bow's
// and a crossbow's string. Each clip decides where a prop goes or hides it (a zero matrix). Horse vertices use bone
// numbers from 128.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';

const R = window.__roster, { THREE, C } = R;
export const SLOTS = 37, HORSE = 128, FPS = 20;
export const HUMAN = ['Root', 'Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'ShoulderL', 'UpperArmL', 'LowerArmL', 'WristL',
  'ShoulderR', 'UpperArmR', 'LowerArmR', 'WristR', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR', 'FootL', 'PTL', 'FootR', 'PTR'];
export const PROP = { R: 24, BOW: 25, SHIELD: 26, AXE: 27, PICK: 28, HOE: 29, STRING_A: 30, STRING_B: 31, CSTRING_A: 32, CSTRING_B: 33, SACK: 34, HAMMER: 35, SAW: 36 };
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
const TOOLS = { Chop: 'AXE', Hoe: 'HOE', Hammer: 'HAMMER', Saw: 'SAW', Pickaxe: 'PICK' };
const TOOL_SLOTS = ['AXE', 'PICK', 'HOE', 'HAMMER', 'SAW'];

// The clips each skeleton gets. `src` names the source clip; `arm` takes the right arm from March_Upright at that
// time (a weapon held upright while standing, walking or running); `upper` lays the upper body of another clip over
// this one, frozen at a time (a lance couched at the gallop) or keeping step ('step': a load carried on the move).
// Walking and running come from the stock Walk and Run, whose strides fit the game's paces (anim.js gaitSpeed);
// March_Upright and Carry step short, so on the move they lend only their arms.
const FOOT = ['Spear_Thrust', 'Spear_Brace', 'March_Upright', 'Bow_Loose', 'Crossbow_Span', 'Shield_Block', 'Shield_Wall', 'Javelin_Throw', 'Rout', 'Cheer', 'Chop', 'Hoe', 'Carry'];
const RIDE = ['Ride_Idle', 'Ride_Trot', 'Ride_Gallop', 'Ride_Couch', 'Ride_Slash'];
const HUMAN_CLIPS = {
  Idle: { src: 'Idle', loop: true }, Stand: { src: 'Idle', loop: true, arm: 0 },
  Walk: { src: 'Walk', loop: true }, Run: { src: 'Run', loop: true }, RunArmed: { src: 'Run', loop: true, arm: 0 }, WalkArmed: { src: 'Walk', loop: true, arm: 0 },
  CarryWalk: { src: 'Walk', loop: true, upper: ['Carry', 'step'], weapon: 'Carry' }, CarryRun: { src: 'Run', loop: true, upper: ['Carry', 'step'], weapon: 'Carry' },
  // the victory march (src/parade.js): passing the gate he cheers with his weapon up, keeping step, over two strides
  CheerWalk: { src: 'Walk', loop: true, wrap: true, length: 2.6667, upper: ['Cheer', 'step'], weapon: 'Cheer' },
  // stepping back or sideways, facing on (shoved in a melee, closing up in a ring facing out): the stock runs back and
  // to each side, slowed to a walk's stride
  Step_Back: { src: 'Run_Back', loop: true, speed: 0.45 }, Step_Left: { src: 'Run_Left', loop: true, speed: 0.45 }, Step_Right: { src: 'Run_Right', loop: true, speed: 0.45 },
  // turning on the spot: standing as at rest, stepping each foot up and down in turn (`steps`, stepInPlace)
  Turn: { src: 'Idle', at: 0, loop: true, length: 1, steps: { lift: 0.09 } }, TurnArmed: { src: 'Idle', at: 0, loop: true, length: 1, steps: { lift: 0.09 }, arm: 0 },
  Step_BackArmed: { src: 'Run_Back', loop: true, speed: 0.45, arm: 0 }, Step_LeftArmed: { src: 'Run_Left', loop: true, speed: 0.45, arm: 0 }, Step_RightArmed: { src: 'Run_Right', loop: true, speed: 0.45, arm: 0 },
  Death: { src: 'Death', hold: true }, Sword_Slash: { src: 'Sword_Slash' },
  // a second death, falling forward onto his face (the knight's, KNIGHT), and two ways of taking a blow
  Death_Fwd: { src: 'Death', rig: 'knight', hold: true, weapon: 'Death' }, Hit: { src: 'HitRecieve', weapon: 'Death' }, Hit_2: { src: 'HitRecieve_2', weapon: 'Death' },
  // the villagers' work at a building site, a workshop door, a quarry or a mine (KAYKIT), each with its tool (KayKit's
  // Digging is left out: a spade at the foot of an ore rock is lost in the rock, where a pick swung at its face reads)
  // (KayKit's blow lands level, ahead at the chest: bent 35 degrees it comes down at 0.87 m, on an anvil at a
  // smithy's door or a trestle at a building site: townview.js BLOW)
  Hammer: { src: 'Hammering', rig: 'kaykit', loop: true, stoop: 35 },
  Saw: { src: 'Sawing', rig: 'kaykit', loop: true },
  // (Pickaxing's first blow lands at 0.3 s and holds there a second)
  Pickaxe: { src: 'Pickaxing', rig: 'kaykit', loop: true, events: { 'pick-contact': 0.3 } }, Work: { src: 'Working_A', rig: 'kaykit', loop: true },
};
// A rider whose horse goes down is thrown clear of it: from the seat he pitches out over its far shoulder, turning to
// fall on his back in his own Death beside it (`thrown`: where he lands, in metres off the saddle's foot, and the turn).
const RIDER_CLIPS = {
  Ride_Charge: { src: 'Ride_Gallop', loop: true, upper: ['Ride_Couch', 1], weapon: 'Ride_Couch' },
  // a rider cheers the same way, sitting his walking horse (src/parade.js)
  Ride_Cheer: { src: 'Ride_Idle', loop: true, wrap: true, length: 2.6667, upper: ['Cheer', 'step'], weapon: 'Cheer' },
  Ride_Fall: { src: 'Death', hold: true, weapon: 'Death', length: 1.2, thrown: { lead: 0.4, from: 0.35, land: [1.9, 0, 0.4], turn: -Math.PI / 2, hop: 0.45 } },
};
// The horse walks in its trot with the fore legs a quarter stride early (each hoof then comes down on its own beat,
// hind then fore on one side, then the other) and slowed; the stock walk stalls halfway through its loop. A galloping
// horse past its gallop's stride lengthens it: `swing` sweeps the legs (and the hooves, forward and back) that much
// further from where they ride on average. The stock Death only sinks and tips the horse a third of the way over, so
// `roll` turns the whole horse on over its hooves (`angle` radians about its length, through `pivot`, in metres,
// between `from` and `to` seconds) till it lies on its side.
const HORSE_FORE = ['FrontLegL', 'FrontUpLegL', 'FrontLowLegL', 'FrontFootL', 'FrontLegR', 'FrontUpLegR', 'FrontLowLegR', 'FrontFootR'];
const HORSE_LEGS = [...HORSE_FORE, 'BackLegL', 'BackUpLegL', 'BackLowLegL', 'BackFootL', 'BackLegR', 'BackUpLegR', 'BackLowLegR', 'BackFootR'];
const HORSE_CLIPS = {
  Idle: { src: 'Armature|Idle', loop: true }, Walk: { src: 'Trot', loop: true, lag: [HORSE_FORE, 0.75], speed: 0.6 },
  Trot: { src: 'Trot', loop: true }, Gallop: { src: 'Gallop', loop: true }, Gallop_Long: { src: 'Gallop', loop: true, swing: [HORSE_LEGS, 1.4] },
  Rear: { src: 'Rear' }, Death: { src: 'Armature|Death', hold: true, roll: { angle: -0.9, pivot: [0.35, 0, 0], from: 0.15, to: 1 } },
};

// The knight of Quaternius's Ultimate Animated Character pack (CC0, assets/scout/anims): the same bone names as the
// men but for its fists and body, other proportions and a T-ish rest, so its clips are carried over pose to pose:
// each bone turns in the world as the knight's does from his idle, from the man's own idle (retarget).
export const KNIGHT = { file: 'assets/anims/Quaternius_UAC_Knight_Male.gltf', names: { FistL: 'WristL', FistR: 'WristR', Body_1: 'Body' } };
// Kay Lousberg's KayKit medium rig (Character Animations 1.1, CC0, assets/scout/anims/kaykit-rig-medium), for the
// villagers' work: a short, big-headed skeleton of 21 bones under other names (one spine bone and a chest, no neck
// or shoulders, a wrist and a hand, toes), carried over pose to pose from its idle like the knight's. Its hand is
// the man's wrist, and each tool rides its hand slot (`slot`), turned to the tool's frame (bake.js tools: the haft
// along +x from the grip).
const LR = (k, v) => ({ [k + 'l']: v + 'L', [k + 'r']: v + 'R' });   // (three drops the dot in 'hand.l')
export const KAYKIT = {
  files: ['assets/anims/kaykit/Rig_Medium_Tools.glb', 'assets/anims/kaykit/Rig_Medium_General.glb'], idle: 'Idle_A',
  names: { hips: ['Hips', 'Body'], spine: 'Abdomen', chest: 'Torso', head: 'Head', ...LR('upperarm', 'UpperArm'), ...LR('lowerarm', 'LowerArm'), ...LR('hand', 'Wrist'),
    ...LR('upperleg', 'UpperLeg'), ...LR('lowerleg', 'LowerLeg'), ...LR('foot', 'Foot') },
};

// The war dog: the CC0 Quaternius wolf (assets/scout/animals/Wolf.glb, copied to the lineup by fetch.py), scaled so
// it stands `shoulder` metres at the top of its back (its armature is in centimetres, x100; the size is the rig's,
// baked into every clip's matrices). Its 46 skinned bones fold into 35 slots: each bone named in `fold` moves with
// the one it names (bones that barely turn from their parent: the front shoulder blades never do, the hind BackLeg
// under 8 degrees, and every other joint of the ears and tail).
export const WOLF = { file: 'assets/animals/Wolf.glb', shoulder: 0.75 };
const WOLF_BONES = ['Back', 'Torso', 'Torso2', 'Torso3', 'Neck1', 'Neck2', 'Neck3', 'Head', 'Ear1L', 'Ear3L', 'Ear1R', 'Ear3R',
  'FrontUpperLegL', 'FrontLowerLegL', 'FrontUpperLegR', 'FrontLowerLegR', 'BackShoulderL', 'BackUpperLegL', 'BackLowerLegL',
  'BackShoulderR', 'BackUpperLegR', 'BackLowerLegR', 'Tail1', 'Tail2', 'Tail4', 'Tail6', 'Tail8',
  'IKFrontLegL', 'FFL', 'IKFrontLegR', 'FFR', 'IKBackLegL', 'FFBL', 'IKBackLegR', 'FFBR'];
const WOLF_FOLD = { FrontShoulderL: 'Torso2', FrontShoulderR: 'Torso2', BackLegL: 'BackShoulderL', BackLegR: 'BackShoulderR',
  Ear2L: 'Ear1L', Ear4L: 'Ear3L', Ear2R: 'Ear1R', Ear4R: 'Ear3R', Tail3: 'Tail2', Tail5: 'Tail4', Tail7: 'Tail6' };
// The pack has a walk and a gallop but no trot, so the trot is the walk with the fore legs half a beat later (each
// fore paw then comes down with the hind paw across from it) and played quicker: `lag` plays those bones that share
// of the stride behind, `speed` runs the source clip that much faster. (A dog keeps pace with marching men at a trot,
// pace.js, between the walk's and the gallop's paces.) The pack's gallop is a short bounding stride (its paws sweep
// back at about 3 m/s), so it is quickened too, to cover a war dog's run (battle.js, 8 m/s) within anim.js CADENCE:
// flat out its legs turn over about five times a second. The bite lands as the lunge reaches furthest.
const FORE = ['FrontUpperLegL', 'FrontLowerLegL', 'IKFrontLegL', 'FFL', 'FrontUpperLegR', 'FrontLowerLegR', 'IKFrontLegR', 'FFR'];
const W = n => 'AnimalArmature|' + n;
const WOLF_CLIPS = {
  Idle: { src: W('Idle'), loop: true }, Walk: { src: W('Walk'), loop: true }, Trot: { src: W('Walk'), loop: true, lag: [FORE, 0.3], speed: 1.8 },
  Run: { src: W('Gallop'), loop: true, speed: 1.6 }, Rout: { src: W('Gallop'), loop: true, speed: 1.6 }, Bite: { src: W('Attack'), events: { bite: 0.37 } }, Death: { src: W('Death'), hold: true },
};

let rigs = null;
export async function load(dir = 'assets/clips/') {
  if (rigs) return rigs;
  const L = new GLTFLoader();
  const [foot, riders, horsePack, manifest, male, female, horse, wolf, knight, ...kaykit] = await Promise.all([
    L.loadAsync(dir + 'clips-foot.glb'), L.loadAsync(dir + 'clips-riders.glb'), L.loadAsync(dir + 'clips-horse.glb'),
    fetch(dir + 'clip-manifest.json').then(r => r.json()),
    C.gltf('assets/qmod/Male_Adventurer.glb'), C.gltf('assets/qmod/Female_Medieval.glb'), C.fbx('assets/q18/Horse.fbx'), C.gltf(WOLF.file), C.gltf(KNIGHT.file),
    ...KAYKIT.files.map(f => C.gltf(f)),
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
    wolf: rig('wolf', SU.clone(wolf.scene), clipsOf(wolf.animations)),
    knight: rig('knight', SU.clone(knight.scene), clipsOf(knight.animations), undefined, { names: KNIGHT.names }),
    kaykit: rig('kaykit', SU.clone(kaykit[0].scene), Object.assign({}, ...kaykit.map(g => clipsOf(g.animations))), undefined, { names: KAYKIT.names, idle: KAYKIT.idle }),
  };
  const w = rigs.wolf, k = WOLF.shoulder / withers(w);
  w.G = new THREE.Matrix4().makeScale(k, k, k); w.Ginv = w.G.clone().invert();
  rigs.female.from = rigs.male;
  return rigs;
}

function rig(name, root, clips, G = new THREE.Matrix4(), more = {}) {
  root.updateMatrixWorld(true);
  let skel = null;
  root.traverse(o => { if (o.isSkinnedMesh && !skel) skel = o.skeleton; });
  const bones = new Map(skel.bones.map(b => [b.name, b])), IB = new Map(skel.bones.map((b, i) => [b.name, skel.boneInverses[i]]));
  const slots = name === 'horse' ? skel.bones.map(b => b.name) : name === 'wolf' ? WOLF_BONES : HUMAN, fold = name === 'wolf' ? WOLF_FOLD : {};
  const rest = new Map(skel.bones.map(b => [b.name, { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(new THREE.Vector3()), local: b.quaternion.clone(), pos: b.position.clone() }]));
  return { name, root, clips, G, Ginv: G.clone().invert(), bones, IB, slots, fold, rest, mixer: new THREE.AnimationMixer(root), ...more };
}
// The top of the wolf's back in its rest pose, between its chest bones (its withers, in its own units).
function withers(r) {
  const a = r.rest.get('Torso2').p.z, b = r.rest.get('Torso3').p.z, v = new THREE.Vector3();
  let top = 0;
  r.root.traverse(n => {
    if (!n.isSkinnedMesh) return;
    const p = n.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); n.applyBoneTransform(i, v); v.applyMatrix4(n.matrixWorld); if (v.z >= a && v.z <= b) top = Math.max(top, v.y); }
  });
  if (!(top > 0)) throw new Error('wolf: could not measure the top of its back');
  return top;
}

// ---- posing ----

// Put a rig in a clip's pose at time t (seconds). A clip with `arm` or `upper` mixes in a second pose.
function sample(r, src, t) {
  const clip = r.clips[src];
  if (!clip) throw new Error(`no clip ${src} for ${r.name}`);
  if (r.root.userData.thrown) { r.root.position.set(0, 0, 0); r.root.quaternion.identity(); r.root.userData.thrown = false; }   // (thrown())
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
  t *= def.speed || 1;
  if (def.thrown) return thrown(r, def, t);
  const mean = def.swing && meanPose(base, def.src);
  if (def.rig) {
    // another skeleton's clip: the man stands in his idle, then each bone it shares turns as that one does
    const src = rigs[def.rig], from = idleOf(src), to = idleOf(base);
    sample(src, def.src, t);
    sample(base, 'Idle', 0);
    retarget(src, base, { names: src.names, from, to, feet: true, plant: def.rig === 'kaykit' });
    if (def.stoop) stoop(base, def.stoop);
    if (r.from) retarget(r.from, r);
    return;
  }
  // (a clip held at one moment of its source, as the turn holds the idle; `wrap`: a loop longer than its source,
  // the source played round again)
  const at = def.at ?? (def.wrap ? t % base.clips[def.src].duration : t);
  sample(base, def.src, at);
  const over = def.arm != null ? [RIGHT_ARM, 'March_Upright', def.arm] : def.upper ? [UPPER, ...def.upper] : null;
  if (over) {
    const keep = over[0].map(n => base.bones.get(n)), held = new Map();
    sample(base, over[1], over[2] === 'step' ? t / (def.length ?? base.clips[def.src].duration) * base.clips[over[1]].duration : over[2]);
    for (const b of keep) held.set(b, b.quaternion.clone());
    sample(base, def.src, at);
    for (const [b, q] of held) b.quaternion.copy(q);
    base.root.updateMatrixWorld(true);
  }
  if (def.lag) {
    const [names, share] = def.lag, D = base.clips[def.src].duration, held = new Map();
    sample(base, def.src, ((t - share * D) % D + D) % D);
    for (const n of names) { const b = base.bones.get(n); held.set(b, [b.quaternion.clone(), b.position.clone()]); }
    sample(base, def.src, t);
    for (const [b, [q, p]] of held) { b.quaternion.copy(q); b.position.copy(p); }
    base.root.updateMatrixWorld(true);
  }
  if (def.swing) {
    // each bone turned k times as far from its average turn, a hoof's place k times as far forward or back of its
    // average (along the figure's length, so planted hooves stay on the ground)
    const [names, k] = def.swing;
    for (const n of names) {
      const b = base.bones.get(n), m = mean.get(n), d = _q.copy(m.q).invert().multiply(b.quaternion);
      if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
      const a = 2 * Math.acos(Math.min(1, d.w)), s = Math.sqrt(1 - d.w * d.w);
      if (s > 1e-6) b.quaternion.copy(m.q).multiply(_q2.setFromAxisAngle(_p.set(d.x / s, d.y / s, d.z / s), a * k));
    }
    base.root.updateMatrixWorld(true);
    for (const n of names) {
      const b = base.bones.get(n), m = mean.get(n);
      if (!m.world) continue;
      const w = b.getWorldPosition(new THREE.Vector3());
      w.z = m.world.z + (w.z - m.world.z) * k;
      b.position.copy(b.parent.worldToLocal(w));
      b.updateMatrixWorld(true);
    }
    base.root.updateMatrixWorld(true);
  }
  if (def.steps) stepInPlace(base, def.steps, t / (def.length || 1));
  if (r.from) retarget(r.from, r);
}
// Each foot in turn lifted `lift` metres and set down where it was, over the first half of its own half of the loop
// (`u` 0 to 1 through it). (The men's feet hang from the root, apart from their legs: both are moved.)
function stepInPlace(r, { lift }, u) {
  for (const [side, off] of [['L', 0], ['R', 0.5]]) {
    const k = ((u + off) % 1) * 2, h = k < 1 ? lift * Math.sin(Math.PI * k) : 0;
    if (h > 0) reachFoot(r, side, r.bones.get('Foot' + side).getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, h, 0)));
  }
}
// Put a foot at `target` in the world: the hip, knee and foot solved as two bones, the knee bending the way it bends
// now (forward, at rest).
function reachFoot(r, side, target) {
  const up = r.bones.get('UpperLeg' + side), low = r.bones.get('LowerLeg' + side), foot = r.bones.get('Foot' + side);
  const hip = up.getWorldPosition(new THREE.Vector3()), knee = low.getWorldPosition(new THREE.Vector3()), end = foot.getWorldPosition(new THREE.Vector3());
  const endOnShin = low.worldToLocal(end.clone()), L1 = hip.distanceTo(knee), L2 = knee.distanceTo(end);
  const to = target.clone().sub(hip), d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, to.length()));
  const axis = to.normalize(), bend = knee.clone().sub(hip);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1);
  bend.normalize();
  const a = (L1 * L1 + d * d - L2 * L2) / (2 * d), newKnee = hip.clone().addScaledVector(axis, a).addScaledVector(bend, Math.sqrt(Math.max(0, L1 * L1 - a * a)));
  aim(up, knee.clone().sub(hip), newKnee.clone().sub(hip));
  aim(low, low.localToWorld(endOnShin.clone()).sub(newKnee), target.clone().sub(newKnee));
  foot.position.copy(foot.parent.worldToLocal(target));
  foot.updateMatrixWorld(true);
}
// The body above the hips bent forward `deg` degrees, about the man's side to side axis (he faces +z).
function stoop(r, deg) {
  const b = r.bones.get('Abdomen'), turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg * Math.PI / 180);
  b.quaternion.copy(b.parent.getWorldQuaternion(_q2).invert().multiply(turn.multiply(b.getWorldQuaternion(new THREE.Quaternion()))));
  b.updateMatrixWorld(true);
}
// Turn a bone in the world so that direction `from` (from its origin) points along `to`.
function aim(b, from, to) {
  const turn = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()), want = turn.multiply(b.getWorldQuaternion(new THREE.Quaternion()));
  b.quaternion.copy(b.parent.getWorldQuaternion(_q2).invert().multiply(want));
  b.updateMatrixWorld(true);
}
// Each bone's average turn over a looping clip (and, for bones the clip moves about, its average place in the world).
const means = new Map();
function meanPose(r, src) {
  const key = r.name + '/' + src;
  if (means.has(key)) return means.get(key);
  const D = r.clips[src].duration, N = 24, acc = new Map();
  for (let i = 0; i < N; i++) {
    sample(r, src, i * D / N);
    for (const [n, b] of r.bones) {
      const a = acc.get(n) || { q: new THREE.Vector4(), p: new THREE.Vector3(), first: b.quaternion.clone(), moves: false };
      const s = a.first.dot(b.quaternion) < 0 ? -1 : 1;
      a.q.x += s * b.quaternion.x; a.q.y += s * b.quaternion.y; a.q.z += s * b.quaternion.z; a.q.w += s * b.quaternion.w;
      a.p.add(b.getWorldPosition(new THREE.Vector3()).divideScalar(N));
      if (b.position.distanceTo(r.rest.get(n).pos) > 1e-4) a.moves = true;
      acc.set(n, a);
    }
  }
  const out = new Map();
  for (const [n, a] of acc) { const v = a.q.normalize(); out.set(n, { q: new THREE.Quaternion(v.x, v.y, v.z, v.w), world: a.moves ? a.p : null }); }
  means.set(key, out);
  return out;
}
// A rig's pose in its idle's first frame: each bone's world turn, and where its hips are (retarget's reference).
const idles = new Map();
function idleOf(r) {
  if (!idles.has(r.name)) {
    sample(r, r.idle || 'Idle', 0);
    idles.set(r.name, new Map([...r.bones].map(([n, b]) => [n, { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(new THREE.Vector3()) }])));
  }
  return idles.get(r.name);
}
// A rider thrown as his horse goes down (RIDER_CLIPS Ride_Fall): for `lead` seconds he leaves the seat, every bone
// turning from its seated pose toward his Death already falling (`from` seconds in) as the figure rises in an arc of
// `hop` metres and turns by `turn`, landing `land` metres off; then he plays the rest of the Death from there. The figure is moved whole (its
// root), so the woman's retarget and the props follow.
function thrown(r, def, t) {
  const base = r.from || r, T = def.thrown, k = ramp(t, 0, T.lead), at = T.from + Math.max(0, t - T.lead);
  sample(base, 'Ride_Idle', 0);
  const seat = new Map([...base.bones].map(([n, b]) => [n, [b.quaternion.clone(), b.position.clone()]]));
  sample(base, def.src, at);
  for (const [n, b] of base.bones) {
    const [q, p] = seat.get(n);
    b.quaternion.copy(q.slerp(b.quaternion, k));
    b.position.copy(p.lerp(b.position, k));
  }
  const g = Math.min(1, t / T.lead);
  base.root.position.set(T.land[0] * k, T.land[1] * k + T.hop * Math.sin(Math.PI * g) * (1 - k * 0.5), T.land[2] * k);
  base.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), T.turn * k);
  base.root.userData.thrown = true;
  base.root.updateMatrixWorld(true);
  if (r.from) retarget(r.from, r);
}
// A woman's skeleton follows a man's: each bone turns in the world as his does from its rest, and the hips move as
// his do, scaled to her height. `from` and `to` set other reference poses than the rests (the knight's idle and the
// man's), and `names` the bones of `m` known by other names on `f`. Both skeletons' feet hang from the root (they are
// IK targets), so with `feet` each foot is put back at the end of its shin, as it is in `to`, and the body (which the
// legs hang from) moves with the hips. With `plant` each foot goes instead where `m`'s does, scaled as the hips are,
// and the leg reaches it, so a foot planted in the source stays planted (KayKit's legs are shorter for their height:
// turned alone, a sawyer's back foot slid 18 cm).
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3();
function retarget(m, f, { names = {}, from = m.rest, to = f.rest, feet = false, plant = false } = {}) {
  const turn = new Map();
  for (const [name, b] of m.bones) if (from.has(name)) for (const n of [].concat(names[name] || name)) turn.set(n, b.getWorldQuaternion(new THREE.Quaternion()).multiply(_q.copy(from.get(name).q).invert()));
  const hips = Object.keys(names).find(n => [].concat(names[n]).includes('Hips')) || 'Hips', k = to.get('Hips').p.y / from.get(hips).p.y;
  f.root.traverse(b => {
    if (!b.isBone || !turn.has(b.name)) return;
    const want = turn.get(b.name).clone().multiply(to.get(b.name).q);
    b.parent.updateMatrixWorld(true);
    b.parent.getWorldQuaternion(_q2);
    b.quaternion.copy(_q2.invert().multiply(want));
    if (b.name === 'Hips' || (feet && b.name === 'Body')) {
      const d = m.bones.get(hips).getWorldPosition(new THREE.Vector3()).sub(from.get(hips).p).multiplyScalar(k);
      b.position.copy(b.parent.worldToLocal(_p.copy(to.get(b.name).p).add(d)));
    }
    b.updateMatrixWorld(true);
  });
  if (feet) for (const side of ['L', 'R']) {
    const foot = f.bones.get('Foot' + side), shin = f.bones.get('LowerLeg' + side), s0 = to.get('LowerLeg' + side);
    const at = to.get('Foot' + side).p.clone().sub(s0.p).applyQuaternion(_q.copy(s0.q).invert()).applyQuaternion(shin.getWorldQuaternion(_q2)).add(shin.getWorldPosition(_p));
    foot.position.copy(foot.parent.worldToLocal(at));
    foot.updateMatrixWorld(true);
    if (!plant) continue;
    const src = Object.keys(names).find(n => [].concat(names[n]).includes('Foot' + side)) || 'Foot' + side;
    reachFoot(f, side, m.bones.get(src).getWorldPosition(new THREE.Vector3()).sub(from.get(src).p).multiplyScalar(k).add(to.get('Foot' + side).p));
  }
}

// ---- the matrices for one frame ----

const ZERO = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
const ramp = (t, a, b) => { const v = Math.min(1, Math.max(0, (t - a) / (b - a))); return v * v * (3 - 2 * v); };
const basis = (x, y) => { const bx = new THREE.Vector3(...x).normalize(), by = new THREE.Vector3(...y); by.addScaledVector(bx, -by.dot(bx)).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bx.clone().cross(by))); };
// A bone's skinning matrix: from bind space to where the clip has it, in the rig's metres (then moved by `post`).
function skinMatrix(r, name, post = null) {
  const b = r.bones.get(name), m = new THREE.Matrix4().copy(r.G).multiply(b.matrixWorld).multiply(r.IB.get(name)).multiply(r.Ginv);
  return post ? m.premultiply(post) : m;
}
// The whole figure turned `angle` about its length through `pivot`, eased in from `from` to `to` (HORSE_CLIPS roll).
function rollAt({ angle, pivot, from, to }, t) {
  const [x, y, z] = pivot;
  return new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(angle * ramp(t, from, to))).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
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
// A tool in a KayKit work clip (bake.js tools: the haft along the frame's +x from the grip, the face or teeth toward
// +z). A hammer sits in the right grip and turns as KayKit's right hand slot does (its +y along the haft, its +x the
// frame's -y); a pick's haft runs from the left grip, at its foot, on through the right, the head beyond it; a saw's
// blade points from the right grip ahead of him and down, along the stroke, its teeth below.
const SLOT_TOOL = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1)));
const HELD_AS = { Hammer: 'slot', Saw: 'ahead', Pickaxe: 'hands' };
function kayTool(r, name) {
  const how = HELD_AS[name], grip = side => new THREE.Vector3().setFromMatrixPosition(hand(r, side, null));
  const at = grip(how === 'hands' ? 'L' : 'R');
  if (how === 'slot') return new THREE.Matrix4().compose(at, rigs.kaykit.root.getObjectByName('handslotr').getWorldQuaternion(new THREE.Quaternion()).multiply(SLOT_TOOL), new THREE.Vector3(1, 1, 1));
  const x = how === 'hands' ? grip('R').sub(at).normalize() : new THREE.Vector3(0, -0.5, 1).normalize();
  const z = new THREE.Vector3(0, -1, 0).addScaledVector(x, x.y).normalize();   // (down, square to the haft)
  if (how === 'hands') z.set(1, 0, 0).cross(x).normalize();   // (the points in the swing's plane, square to his shoulders)
  return new THREE.Matrix4().makeBasis(x, z.clone().cross(x), z).setPosition(at);
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
  for (const k of TOOL_SLOTS) out[k] = TOOLS[name] !== k ? ZERO : def.rig === 'kaykit' ? kayTool(r, name) : hand(r, 'R', axis);
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
  const post = def.roll ? rollAt(def.roll, t) : null;
  r.slots.forEach((n, i) => put(i, skinMatrix(r, n, post)));
  if (r.name === 'male' || r.name === 'female') for (const [k, m] of Object.entries(props(r, name, def, t))) put(PROP[k], m);
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
  const plan = [['male', humans], ['female', humans], ['horse', HORSE_CLIPS], ['wolf', WOLF_CLIPS]];
  const frames = [], table = {};
  for (const [rn, defs] of plan) {
    const r = rigs[rn];
    table[rn] = {};
    for (const [name, def] of Object.entries(defs)) {
      const src = def.rig ? rigs[def.rig] : r.clips[def.src] ? r : r.from || r;
      const dur = def.length ?? src.clips[def.src].duration / (def.speed || 1);
      // (a quickened clip keeps its source's frames, so its pose doesn't coarsen)
      const n = Math.max(1, Math.round(dur * (def.speed || 1) * FPS)), count = def.loop ? n : n + 1;
      const events = def.events || (rigs.meta[def.src]?.events && Object.fromEntries(rigs.meta[def.src].events.map(e => [e.event, +e.time.toFixed(4)])));
      table[rn][name] = { start: frames.length, frames: count, fps: n / dur, duration: +dur.toFixed(4), ...(def.loop ? { loop: true } : {}), ...(def.hold ? { hold: true } : {}), ...(events ? { events } : {}) };
      for (let i = 0; i < count; i++) frames.push(frame(r, name, def, i * dur / n));
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
  for (const [n, into] of Object.entries(r.fold)) slot.set(n, slot.get(into));
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
          const sum = w.reduce((a, b) => a + b, 0) || 1, lost = names.find((nm, j) => w[j] > 0 && !slot.has(nm));
          if (lost) throw new Error(`${rigName}: ${n.name} is skinned to bone ${lost}, which has no slot (skin.js)`);
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
