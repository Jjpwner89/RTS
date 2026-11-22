// Draws the battle: instanced low-poly soldiers, arrows, regiment banners and order outlines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TYPES } from './battle.js';
import { HOMES } from './terrain.js';
import { unitModel, unitLook, hasLevels, buildingModel, LOD, HOUSE_STYLES } from './models.js';
import { lookChain } from './battle.js';
import { iconImage } from './icons.js';
import { animReady, animGeometry, animMaterial, animDepthMaterial, clipOf, setClip, gaitFor, gaitSpeed, CADENCE } from './anim.js';
import { fxFor } from './fx.js';
import { SUN_DIR, NIGHT, lamps } from './look.js';

// Which look a soldier wears: his own (a captain or lord), else his regiment's kind in its armour and with or
// without shields (reg.armour: 'none' | 'leather' | 'mail' | 'plate', reg.shield: false for none).
const kitOf = r => `${r.vet || 0}|${r.armour || ''}|${r.group || ''}`;   // what its banner shows (redrawn when it changes)
const lookKey = s => s.look || (s.reg.armour || s.reg.shield === false ? `${s.reg.T.key}|${s.reg.armour || ''}|${s.reg.shield !== false}` : s.reg.T.key);

// Units without their own model or icon borrow the nearest one (battle.js lookChain).
const BUILT_IN = ['spear', 'sword', 'archer', 'cav', 'militia', 'bandit'];

export const SIDE_COLORS = ['#3d6fd6', '#c8423a'];
const WHITE = new THREE.Color('#ffffff');
const UP = new THREE.Vector3(0, 1, 0);

// Men in the far pair cast no shadow (models.js LOD.far); each gets a soft dark streak on the ground instead, so a
// line doesn't look pasted on the field: an oval reaching away from the sun about as far as his shadow would (a
// disc right under him would hide behind his own legs). One instanced flat square with a round fading alpha,
// drawn without writing depth.
// (the sun moves with the time of day, look.js: SHADE follows it each frame)
const SHADE = new THREE.Vector3();
let SHADE_LEN = 1;   // metres of shadow for each metre of height, at most three
function blobMesh(capacity) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.45, '#bbb'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

// Which view draws a battle (checks.js: every living man is drawn).
export const viewOf = new WeakMap();

// ---- what an animated soldier is doing ----

// The clip (anim.js clipOf) and moment each baked soldier shows, read from the battle: dead, striking, shooting,
// routing, cheering a win, braced, marching or standing. `info` is the model's (rig, horse, weapon, shield, rest).
// A strike or shot is lined up so the blow lands, or the arrow leaves, when the battle says it does: the clip
// winds up while the man's cooldown runs out and plays on from the moment after (battle.js marks both, `// anim:`).
// Gaits are picked and paced by how fast the man covers ground (anim.js gaitFor), so his feet keep pace with it;
// a horse's and its rider's share one clock. Also read by tools/viewer.html, with a stand-in soldier and battle.
const UPRIGHT = { spear: true, sword: true, axe: true, crossbow: true };   // carried upright on the march
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// The gaits a man (or a war dog) on foot moves in, slowest first, for gaitFor to pick from: going on, or stepping
// back or to his left or right still facing on (`way`: stepWay). Read by checks.js too.
export const footGaits = (info, way = 'On') => info.rig === 'wolf' ? ['Walk', 'Trot', 'Run'] : way !== 'On' ? ['Step_' + way + (UPRIGHT[info.weapon] ? 'Armed' : '')]
  : UPRIGHT[info.weapon] ? ['March_Upright', 'WalkArmed', 'RunArmed'] : ['Walk', 'Run'];
// Which way a man steps against his facing, from how he moves (battle.js vx, vz): 'On', 'Back', 'Left' or 'Right'.
// He keeps the way he was stepping until he moves 15 degrees past its boundary, so a man jostled on one doesn't
// flicker between them.
const KEEP = 0.26;
export function stepWay(s) {
  const a = moveAngle(s), A = Math.abs(a), w = s.way || 'On';
  const side = w === 'Left' || w === 'Right', on = Math.PI / 4 + (w === 'On' ? KEEP : side ? -KEEP : 0), back = 3 * Math.PI / 4 + (w === 'Back' ? -KEEP : side ? KEEP : 0);
  return A < on ? 'On' : A > back ? 'Back' : a > 0 ? 'Left' : 'Right';
}
// Which way a figure moves against his facing, in radians: 0 straight on, +pi/2 to his left (the figure's +x).
const moveAngle = s => !s.vx && !s.vz ? 0 : wrap(Math.atan2(s.vx, s.vz) - s.yaw);
const wrap = a => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
// Where each way of stepping goes (moveAngle), so the body can be turned to step exactly the way he moves.
const WAY_AT = { On: 0, Left: Math.PI / 2, Right: -Math.PI / 2, Back: Math.PI };
const TURN_RATE = 2.4, DRIFT = 0.3;   // how fast a man at rest turns his body as he steps round, or shifts his feet a little, in radians a second (pickClip)
// where his right and left feet stand in the Turn clip, against his middle, in metres (x to his left, z on)
const TURN_FEET = [[-0.07, 0.32], [0.185, -0.09]];
// The figure is drawn turned `s.lean` from his facing (update()): on the move, by what's left between the way he
// moves and the way his clip steps, so his planted feet don't skate sideways; eased there and back as he moves and stops.
// At rest he is drawn facing `s.faceAt` (pickClip), and stepping round on the spot he turns on his planted foot, so he
// is drawn shifted (`s.shiftX`, `s.shiftZ`) from where he stands, and eased back after.
export function soldierClip(s, b, info, out) {
  s.leanTo = 0; s.atRest = false;
  const drawn = s.drawn ?? s.yaw + (s.lean || 0), k = pickClip(s, b, info, out);
  // (anything else he does, a step round cut short by a blow or a shot included, takes up from the way he is drawn
  // facing the next time he comes to rest)
  if (!s.atRest) { s.turnT = s.faceAt = null; s.lean = (s.lean || 0) + wrap(s.leanTo - (s.lean || 0)) * Math.min(1, (s.animDt || 0) * 8); }
  if (s.turnT != null) {
    // the planted foot (his right while the left is up, the first half of each second) stays where it is on the ground
    const [x, z] = TURN_FEET[s.turnT % 1 < 0.5 ? 0 : 1], now = s.yaw + s.lean;
    const at = a => [x * Math.cos(a) + z * Math.sin(a), z * Math.cos(a) - x * Math.sin(a)], [x0, z0] = at(drawn), [x1, z1] = at(now);
    s.shiftX = (s.shiftX || 0) + x0 - x1;
    s.shiftZ = (s.shiftZ || 0) + z0 - z1;
  } else if (s.shiftX || s.shiftZ) {
    const e = Math.max(0, 1 - (s.animDt || 0) * (s.atRest ? 0.7 : 4)); s.shiftX *= e; s.shiftZ *= e;
  }
  s.drawn = s.yaw + s.lean;
  return k;
}
// Whether a dead man goes down in his skeleton's Death clip (a rider thrown as his horse falls in its own); without
// one he topples whole (update()).
export const fallsInClip = (info, s) => !s.alive && (info.horse ? !!clipOf('horse', 'Death') && !!clipOf(info.rig, 'Ride_Fall') : !!clipOf(info.rig, 'Death'));
// The horse's gaits, slowest first: its walk, trot and gallop, and past the gallop's stride a longer one (a light
// horseman's charge). Read by checks.js too.
export const HORSE_GAITS = ['Walk', 'Trot', 'Gallop', 'Gallop_Long'];
// What the rider does in each of his horse's gaits (he sits a walk still, and rides the long gallop as the gallop).
const RIDE_IN = { Idle: 'Ride_Idle', Walk: 'Ride_Idle', Trot: 'Ride_Trot', Gallop: 'Ride_Gallop', Gallop_Long: 'Ride_Gallop' };
function pickClip(s, b, info, out) {
  const r = s.reg, T = r.T, now = b.time, rig = info.rig;
  const dt = s.animDt = clamp(now - (s.animAt ?? now), 0, 0.5);   // (a frame at 4x is up to 0.4 s of battle: main.js)
  s.animAt = now;
  s.animT ??= Math.random() * 3;
  out.hc = null; out.ht = 0;
  const show = (name, t) => { out.c = clipOf(rig, name) || clipOf(rig, info.rest); out.t = t; return out; };
  const gait = name => { s.animT += dt; return show(name, s.animT); };
  // on the move: the slowest of `gaits` that keeps up, at the pace that matches the ground. Across a switch he keeps
  // the gait he is in a little longer either way (a walk hurried or a run slowed by up to 8%), so a man moving at
  // the switch doesn't flicker; and he keeps his place in the stride from one gait to the next.
  const pace = (gaits, v = s.v) => {
    let g = gaitFor(rig, gaits, v);
    if (g.name !== s.gait && gaits.includes(s.gait) && [gaitFor(rig, gaits, v * 0.92).name, gaitFor(rig, gaits, v * 1.08).name].includes(s.gait)) {
      g = { name: s.gait, rate: clamp(v / gaitSpeed(rig, s.gait), CADENCE.lo, CADENCE.max) };
    }
    const c = clipOf(rig, g.name);
    s.gait = g.name;
    s.stride = ((s.stride ?? Math.random()) + dt * g.rate / (c?.duration || 1)) % 1;
    return show(g.name, s.stride * (c?.duration || 1));
  };
  // a one-off action timed on an event of its clip: `since` the battle did it, or `left` until it does
  const timed = (name, ev, since, left) => {
    const c = clipOf(rig, name);
    if (!c) return null;
    const at = c.events?.[ev] ?? c.duration / 2;
    if (since < c.duration - at) return show(name, at + since);
    if (left != null && left < at) return show(name, at - left);
    return null;
  };
  const close = s.target && Math.hypot(s.target.x - s.x, s.target.z - s.z) < T.reach * 1.2;

  if (info.horse) {
    if (!s.alive) {
      // the horse falls on its side and throws him clear; with no such clips he goes down with it whole (update())
      if (!fallsInClip(info, s)) { out.hc = clipOf('horse', 'Idle'); return show('Ride_Idle', 0); }
      out.hc = clipOf('horse', 'Death'); out.ht = now - (s.diedAt ?? now);
      return show('Ride_Fall', out.ht);
    }
    // a horse pushed back walks backwards (its walk played back), turned so it backs the way it goes; otherwise it
    // turns its body the way it goes, unless shoved more than a little aside
    const a = moveAngle(s), backing = s.v >= 0.4 && Math.abs(a) > 2 * Math.PI / 3 && !!clipOf('horse', 'Walk');
    const g = s.v < 0.4 ? { name: 'Idle', rate: 1 } : gaitFor('horse', backing ? ['Walk'] : HORSE_GAITS.filter(n => clipOf('horse', n)), s.v), pace = g.name;
    if (backing) s.leanTo = wrap(a - Math.PI);
    else if (s.v >= 0.4 && Math.abs(a) < Math.PI / 3) s.leanTo = a;
    s.animT += dt * g.rate * (backing ? -1 : 1);
    out.hc = clipOf('horse', pace); out.ht = s.animT;
    const lance = info.weapon === 'lance';
    if (close && lance) { s.couchAt ??= now; return show('Ride_Couch', now - s.couchAt); }
    s.couchAt = null;
    if (!lance) { const k = timed('Ride_Slash', 'sword-contact', now - (s.struckAt ?? -99), close ? s.cd : null); if (k) return k; }
    // the lance comes down for the charge: galloping at a foe with the charge still in him, or ordered to
    if (lance && /^Gallop/.test(pace) && ((T.charge && !s.charged && s.target) || now < r.chargeUntil)) return show('Ride_Charge', s.animT);
    return show(RIDE_IN[pace], s.animT);
  }

  // a man dies falling back or pitching forward on his face, each his own way
  if (!s.alive) { s.death ??= Math.random() < 0.5 && clipOf(rig, 'Death_Fwd') ? 'Death_Fwd' : 'Death'; return show(s.death, now - (s.diedAt ?? now)); }
  // a blow, or the wind-up to one (only standing: a man still closing in strides on, and his blow comes as it lands)
  const strike = rig === 'wolf' ? ['Bite', 'bite'] : info.weapon === 'spear' ? ['Spear_Thrust', 'thrust'] : ['Sword_Slash', 'strike'];
  let k = timed(...strike, now - (s.struckAt ?? -99), close && s.v < 0.4 ? s.cd : null);
  if (k) return k;
  // a blow taken standing: he flinches (on the move he keeps his stride, and only flashes: fx.js)
  const flinch = (s.hurtAt * 7 | 0) % 2 ? 'Hit_2' : 'Hit';
  if (s.v < 0.4 && now - (s.hurtAt ?? -99) < (clipOf(rig, flinch)?.duration ?? 0)) return show(flinch, now - s.hurtAt);
  // a shot: bows, crossbows and javelins each their own way, only while he stands: a man walking off mid-reload
  // walks (the battle's reload runs on), and takes up the shot again once he stops (on his feet from 0.4 m/s,
  // still again under 0.2, so a shuffle in the ranks doesn't flicker)
  s.afoot = s.v >= 0.4 || (s.afoot && s.v >= 0.2);
  if (T.range && !s.afoot) {
    const shot = T.javelin ? ['Javelin_Throw', 'release-javelin'] : info.weapon === 'crossbow' ? ['Crossbow_Span', 'shoot'] : ['Bow_Loose', 'loose'];
    const loosing = !s.target && r.ammo >= 1 && now - (r.lastShot ?? -99) < T.reload * 1.5;
    k = timed(...shot, now - (s.shotAt ?? -99), loosing ? s.fireCd : null);
    if (k) return k;
  }
  if (r.routing) { if (s.v >= 0.4) s.leanTo = moveAngle(s); return pace(['Rout']); }   // (he turns and runs whichever way he flees)
  if (b.winner === r.side) { s.animT += dt; return show('Cheer', s.animT % 2.6); }
  if (s.v >= 0.4 || s.climb > 0) {
    // (a climber keeps stepping up his ladder however slowly he rises; a man shoved back or sideways, or closing up
    // in a ring that faces out, steps that way facing on)
    s.way = s.climb > 0 ? 'On' : stepWay(s);
    const way = clipOf(rig, footGaits(info, s.way)[0]) ? s.way : 'On', lean = wrap(moveAngle(s) - WAY_AT[way]);
    if (!s.climb && Math.abs(lean) < Math.PI / 3) s.leanTo = lean;
    return pace(footGaits(info, way), s.climb > 0 ? Math.max(s.v, 0.8) : s.v);
  }
  // standing: spears brace against what's coming, shields close up in a tight line
  const braced = T.braces && info.weapon === 'spear' && (r.formation === 'square' || r.hold || r.engaged > 0);
  if (braced) { s.braceAt ??= now; return show('Spear_Brace', now - s.braceAt); }
  s.braceAt = null;
  if (info.shield && r.formation === 'tight') return gait('Shield_Wall');
  // at rest his body follows his facing slowly, shifting his feet; when it swings round more than 30 degrees he steps
  // round on the spot, a foot every half second, his body coming round with his steps, until he faces it as a foot
  // comes down
  s.atRest = true;
  s.faceAt ??= wrap(s.drawn ?? s.yaw);
  const turn = UPRIGHT[info.weapon] ? 'TurnArmed' : 'Turn', off = wrap(s.yaw - s.faceAt), was = s.turnT;
  if (was == null && Math.abs(off) > 0.5 && clipOf(rig, turn)) s.turnT = 0.5;
  const rate = s.turnT != null ? TURN_RATE : DRIFT;
  s.faceAt = wrap(s.faceAt + clamp(off, -rate * dt, rate * dt));
  s.lean = wrap(s.faceAt - s.yaw);
  if (s.turnT == null) return gait(info.rest);
  s.turnT += dt;
  if (was != null && (s.turnT * 2 | 0) > (was * 2 | 0) && Math.abs(s.lean) < 0.05) { s.turnT = null; return gait(info.rest); }
  return show(turn, s.turnT);
}

// ---- soldier models, built from primitives facing +z ----

export function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (r1, r2, h, s = 6) => new THREE.CylinderGeometry(r1, r2, h, s);

export const SKIN = '#d6ad88', METAL = '#a3a8ad', DARK = '#3b3631', WOOD = '#7a5a3a', LEATHER = '#5e4632', HORSE = '#6b4a32';
const CLOTH = '#ffffff';  // tinted per instance with the side's colour

function infantry(key) {
  const gear = [
    part(box(0.17, 0.8, 0.18), DARK, { x: -0.12, y: 0.4 }),
    part(box(0.17, 0.8, 0.18), DARK, { x: 0.12, y: 0.4 }),
    part(new THREE.SphereGeometry(0.15, 7, 5), SKIN, { y: 1.65 }),
  ];
  const cloth = [
    part(box(0.5, 0.72, 0.3), CLOTH, { y: 1.15 }),
    part(box(0.13, 0.6, 0.14), CLOTH, { x: -0.33, y: 1.15 }),
    part(box(0.13, 0.6, 0.14), CLOTH, { x: 0.33, y: 1.15 }),
  ];
  if (key === 'archer' || key === 'bandit' || key === 'militia') {
    cloth.push(part(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), CLOTH, { y: 1.67 }));
  }
  if (key === 'archer') {
    gear.push(part(box(0.04, 1.3, 0.05), WOOD, { x: -0.36, y: 1.25, z: 0.28 }));
    gear.push(part(box(0.12, 0.5, 0.12), LEATHER, { x: 0.15, y: 1.35, z: -0.22, rx: 0.3 }));
  } else if (key === 'bandit') {
    gear.push(part(cyl(0.035, 0.035, 0.9, 4), WOOD, { x: 0.38, y: 1.3, z: 0.25, rx: 0.5 }));
    gear.push(part(box(0.06, 0.22, 0.26), METAL, { x: 0.38, y: 1.68, z: 0.48, rx: 0.5 }));
  } else if (key !== 'militia') {
    gear.push(part(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), METAL, { y: 1.68 }));
  }
  if (key === 'spear' || key === 'militia') {
    gear.push(part(cyl(0.03, 0.03, 3.4, 4), WOOD, { x: 0.36, y: 1.7, z: 0.35, rx: 0.22 }));
    gear.push(part(new THREE.ConeGeometry(0.06, 0.3, 4), METAL, { x: 0.36, y: 3.4, z: 0.73, rx: 0.22 }));
  }
  if (key === 'spear') {
    cloth.push(part(box(0.55, 0.78, 0.06), CLOTH, { x: -0.3, y: 1.12, z: 0.26 }));
  }
  if (key === 'sword') {
    gear.push(part(box(0.06, 0.85, 0.04), METAL, { x: 0.38, y: 1.3, z: 0.3, rx: 0.4 }));
    cloth.push(part(cyl(0.33, 0.33, 0.05, 10), CLOTH, { x: -0.33, y: 1.15, z: 0.24, rx: Math.PI / 2 }));
  }
  return { gear: mergeGeometries(gear), cloth: mergeGeometries(cloth) };
}

function cavalry() {
  const gear = [
    part(box(0.6, 0.7, 1.9), HORSE, { y: 1.3 }),
    part(box(0.3, 0.85, 0.36), HORSE, { y: 1.8, z: 0.9, rx: 0.5 }),
    part(box(0.26, 0.3, 0.62), HORSE, { y: 2.15, z: 1.2, rx: 0.2 }),
    part(new THREE.SphereGeometry(0.15, 7, 5), SKIN, { y: 2.62 }),
    part(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), METAL, { y: 2.65 }),
    part(cyl(0.035, 0.035, 3.8, 4), WOOD, { x: 0.36, y: 2.25, z: 0.9, rx: 1.25 }),
    part(new THREE.ConeGeometry(0.07, 0.35, 4), METAL, { x: 0.36, y: 2.9, z: 2.75, rx: 1.25 }),
  ];
  for (const [x, z] of [[-0.2, 0.72], [0.2, 0.72], [-0.2, -0.72], [0.2, -0.72]]) {
    gear.push(part(box(0.14, 1.0, 0.16), HORSE, { x, y: 0.5, z }));
  }
  const cloth = [
    part(box(0.68, 0.42, 1.72), CLOTH, { y: 1.08 }),
    part(box(0.46, 0.68, 0.3), CLOTH, { y: 2.12 }),
    part(box(0.16, 0.6, 0.18), CLOTH, { x: -0.36, y: 1.75 }),
    part(box(0.16, 0.6, 0.18), CLOTH, { x: 0.36, y: 1.75 }),
  ];
  return { gear: mergeGeometries(gear), cloth: mergeGeometries(cloth) };
}

// ---- each side's keep and the village around it ----

export const STONE = '#9b968a', STONE_DARK = '#7d786d', THATCH = '#b8955a', PLASTER = '#d8ccb0';

// Baked models carry only position and colour; give them the attributes the built shapes have, so the two merge.
function asPart(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(a)) g.deleteAttribute(a);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const stripped = g => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(a)) g.deleteAttribute(a); return g; };

// The keep is the Fantasy RTS town centre, at `level` 1 to 5; a village's keep grows as it does.
export function keepModel({ palisade = true, level = 2 } = {}) {
  const baked = buildingModel('keep.' + level);
  if (baked) {
    const parts = [asPart(baked)];
    for (let i = 0; palisade && i < 64; i++) {
      const a = i / 64 * Math.PI * 2;
      if (Math.cos(a) > 0.97) continue;
      parts.push(stripped(part(cyl(0.35, 0.35, 4, 5), WOOD, { x: Math.sin(a) * 30, y: 2, z: Math.cos(a) * 30 })));
    }
    return mergeGeometries(parts);
  }
  const parts = [
    part(box(14, 16, 14), STONE, { y: 8 }),
    part(box(2, 4, 0.6), DARK, { y: 2, z: 7.1 }),
  ];
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    parts.push(part(cyl(2.6, 3, 20, 8), STONE_DARK, { x, y: 10, z }));
    parts.push(part(new THREE.ConeGeometry(3.2, 4, 8), '#5f4a3a', { x, y: 22, z }));
  }
  for (let i = 0; i < 4; i++) {
    for (let k = -2; k <= 2; k++) {
      const along = k * 2.6;
      const [x, z] = [[along, -7], [along, 7], [-7, along], [7, along]][i];
      parts.push(part(box(1.2, 1.4, 1.2), STONE, { x, y: 16.7, z }));
    }
  }
  // A ring of palisade stakes around keep and village.
  for (let i = 0; palisade && i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    if (Math.cos(a) > 0.97) continue;   // a gate facing the field
    parts.push(part(cyl(0.35, 0.35, 4, 5), WOOD, { x: Math.sin(a) * 30, y: 2, z: Math.cos(a) * 30 }));
  }
  parts.push(part(cyl(0.12, 0.12, 8, 4), WOOD, { y: 20 }));
  return mergeGeometries(parts);
}

// A flag with its pole: the pole hangs from the flag's left edge down `drop` metres below it, into the roof.
export function poleFor(flag, w, h, drop = 3) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.02, w * 0.02, h + drop + 0.4), new THREE.MeshLambertMaterial({ color: '#5a4030' }));
  pole.position.set(-w / 2, (0.4 - drop) / 2, 0);
  flag.add(pole);
  return flag;
}

// A village keep's level, 1 to 5: the level the town sets (town.keepLevel), or else by population (30, 60, 100, 150).
// A keep never shrinks back: when levies march out and the head count drops, it stays at the highest level reached.
export function keepLevelOf(town) {
  if (town.keepLevel) return Math.max(1, Math.min(5, town.keepLevel));
  const n = town.population;
  town.keepPeak = Math.max(town.keepPeak || 1, n >= 150 ? 5 : n >= 100 ? 4 : n >= 60 ? 3 : n >= 30 ? 2 : 1);
  // past level 3 only as far as the keep has been raised for gold (economy.js KEEP_RAISE)
  return Math.min(3 + (town.keepBought || 0), town.keepPeak);
}

// The lord's seat on the world map: the wooden castle.
// `level` 1 to 4: wood fort, wood castle, stone castle, fortress.
export const castleModel = (level = 2) => buildingModel('castle.' + level) || buildingModel('castle') || keepModel();
// A fort: forts and army camps.
// What stands at a place's heart: its keep, or at an abbey the abbey church, which is its
// store and its last stand as a keep is.
// A war camp's is its timber fort.
export const heartModel = (kind, level) => (kind === 'monastery' && buildingModel('monastery')) || (kind === 'warcamp' && fortModel()) || keepModel({ palisade: false, level });
export const fortModel = () => buildingModel('fort') || keepModel({ palisade: false, level: 1 });
// The northern host's camp (economy.js camp buildings): the baked soldier's tent in grey
// canvas, and a horse line of stakes and a rope with hay at the ends.
const CANVAS = '#9a9284', camp = {};
export const campModel = kind => (kind in camp ? camp[kind] : (camp[kind] = makeCamp(kind)));
function makeCamp(kind) {
  if (kind === 'tent') {
    const T = unitModel('tent');
    if (!T) return mergeGeometries([part(new THREE.ConeGeometry(2.3, 3, 8), CANVAS, { y: 1.5 }), part(cyl(0.08, 0.08, 3.6, 4), WOOD, { y: 1.8 })]);
    const cloth = asPart(T.cloth), c = cloth.attributes.color, k = new THREE.Color(CANVAS);
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k.r, c.getY(i) * k.g, c.getZ(i) * k.b);
    return mergeGeometries([asPart(T.gear), cloth]);
  }
  if (kind === 'picket') {
    const parts = [];
    for (let x = -3.6; x <= 3.7; x += 1.8) parts.push(part(cyl(0.09, 0.11, 1.5, 5), WOOD, { x, y: 0.75 }));
    parts.push(part(box(7.4, 0.06, 0.06), '#c8b890', { y: 1.3 }));
    for (const x of [-4.4, 4.4]) parts.push(part(new THREE.ConeGeometry(0.9, 1, 7), THATCH, { x, y: 0.5, z: 1.2 }));
    parts.push(part(box(2, 0.5, 0.7), WOOD, { y: 0.25, z: -1.6 }));
    return mergeGeometries(parts);
  }
  return null;
}
// Houses come in three styles; `style` picks one.
export function houseModel(style = 0) {
  const baked = buildingModel('house.' + (style % HOUSE_STYLES));
  if (baked) return baked;
  return mergeGeometries([
    part(box(4, 2.6, 5), PLASTER, { y: 1.3 }),
    part(new THREE.ConeGeometry(3.6, 2.4, 4), THATCH, { y: 3.8, ry: Math.PI / 4 }),
  ]);
}

// Height of the keep's roof, so its flag flies just above it.
export function keepTop(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox.max.y;
}

function buildKeeps(scene, heightAt) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const keep = keepModel(), houses = [0, 1, 2].map(houseModel);
  HOMES.forEach((h, side) => {
    const y = heightAt(h.x, h.z);
    const facing = side === 0 ? Math.PI : 0;
    const k = new THREE.Mesh(keep, mat);
    k.position.set(h.x, y - 0.5, h.z);
    k.rotation.y = facing;
    k.castShadow = k.receiveShadow = true;
    scene.add(k);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshLambertMaterial({ color: SIDE_COLORS[side], side: THREE.DoubleSide }));
    flag.position.set(h.x + 2, y + keepTop(keep) + 2.5, h.z);
    scene.add(poleFor(flag, 4, 2.4));
    for (let i = 0; i < 9; i++) {
      const a = facing + Math.PI + (i - 4) * 0.42, r = 19 + (i % 2) * 4;
      const m = new THREE.Mesh(houses[(i * 7 + side) % 3], mat);
      const x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
      m.position.set(x, heightAt(x, z) - 0.2, z);
      m.rotation.y = a;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  });
}

// ---- regiment icons, shared by banners and HUD cards ----

export function drawIcon(ctx, key, cx, cy, s) {
  key = lookChain(key).find(k => BUILT_IN.includes(k) || k === 'folk') || key;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 32, s / 32);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  if (key === 'folk') {
    // a pitchfork
    ctx.moveTo(0, 14); ctx.lineTo(0, -4); ctx.moveTo(-6, -4); ctx.lineTo(6, -4);
    for (const x of [-6, 0, 6]) { ctx.moveTo(x, -4); ctx.lineTo(x, -14); }
    ctx.stroke();
  } else if (key === 'militia') {
    ctx.moveTo(0, 14); ctx.lineTo(0, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-4, -7); ctx.lineTo(4, -7); ctx.fill();
  } else if (key === 'spear') {
    ctx.moveTo(-8, 13); ctx.lineTo(-8, -9); ctx.moveTo(8, 13); ctx.lineTo(8, -9); ctx.stroke();
    for (const x of [-8, 8]) { ctx.beginPath(); ctx.moveTo(x, -15); ctx.lineTo(x - 4, -7); ctx.lineTo(x + 4, -7); ctx.fill(); }
  } else if (key === 'sword') {
    ctx.moveTo(-11, 11); ctx.lineTo(11, -11); ctx.moveTo(11, 11); ctx.lineTo(-11, -11);
    ctx.moveTo(-11, 3); ctx.lineTo(-3, 11); ctx.moveTo(11, 3); ctx.lineTo(3, 11); ctx.stroke();
  } else if (key === 'archer') {
    ctx.arc(-4, 0, 13, -1.2, 1.2); ctx.moveTo(-4 + 13 * Math.cos(-1.2), 13 * Math.sin(-1.2));
    ctx.lineTo(-4 + 13 * Math.cos(1.2), 13 * Math.sin(1.2)); ctx.moveTo(-12, 0); ctx.lineTo(14, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(10, -4); ctx.lineTo(10, 4); ctx.fill();
  } else if (key === 'bandit') {
    ctx.moveTo(-10, 13); ctx.lineTo(8, -9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -15); ctx.quadraticCurveTo(16, -12, 14, 2); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill();
  } else if (key === 'cav') {
    ctx.moveTo(-12, 12); ctx.lineTo(-6, -2); ctx.lineTo(-2, -12); ctx.lineTo(6, -8); ctx.lineTo(12, 0);
    ctx.lineTo(8, 3); ctx.lineTo(2, -2); ctx.lineTo(4, 12); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// A regiment's banner: its kind's icon on the side's colour, and in its top corner a dark badge with its rank
// as gold chevrons (r.vet: none for green men) beside its armour, as on its card, so two regiments in the
// same gear are told apart.
function bannerTexture(colour, key, selected, r = {}) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 80;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(6, 6); ctx.lineTo(58, 6); ctx.lineTo(58, 50); ctx.lineTo(32, 74); ctx.lineTo(6, 50); ctx.closePath();
  ctx.fillStyle = colour;
  if (selected) { ctx.shadowColor = '#ffd970'; ctx.shadowBlur = 9; }   // chosen: it glows gold
  ctx.fill();
  ctx.lineWidth = selected ? 6 : 3;
  ctx.strokeStyle = selected ? '#ffd970' : 'rgba(20,16,12,0.85)';
  ctx.stroke();
  ctx.shadowBlur = 0;
  drawIcon(ctx, key, 32, 34, 34);
  // its control group (controls.js: Ctrl + a number), in a chip at the top left
  if (r.group) {
    ctx.beginPath(); ctx.arc(13, 13, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,16,12,0.9)'; ctx.fill();
    ctx.fillStyle = '#f2ead8'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(r.group), 13, 14);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const vet = Math.min(3, r.vet || 0), armour = r.armour && r.armour !== 'none' ? r.armour : null;
  if (!vet && !armour) return tex;
  const right = 62, left = right - (armour ? 24 : 0) - (vet ? 16 : 0) - 2;
  ctx.beginPath(); ctx.roundRect(left, 2, right - left, 24, 12);
  ctx.fillStyle = 'rgba(20,16,12,0.9)'; ctx.fill();
  if (vet) {
    ctx.strokeStyle = '#e8c45a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const x = left + 10, top = 14 - vet * 2.6;
    for (let i = 0; i < vet; i++) { const y = top + i * 5.2; ctx.beginPath(); ctx.moveTo(x - 5, y + 3); ctx.lineTo(x, y - 1); ctx.lineTo(x + 5, y + 3); ctx.stroke(); }
  }
  if (armour) iconImage('armour-' + armour, '#f2ead8', img => { ctx.drawImage(img, right - 22, 4, 19, 19); tex.needsUpdate = true; });
  return tex;
}

// ---- the view ----

export class BattleView {
  // capacity: soldiers of each type to make room for, beyond those already on the field.
  constructor(scene, battle, heightAt, { capacity = 0, keeps = true } = {}) {
    this.scene = scene;
    this.battle = battle;
    this.heightAt = heightAt;
    this.dummy = new THREE.Object3D();
    this.dummy.rotation.order = 'YXZ';
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.tint = new THREE.Color();
    this.shade = new THREE.Color();
    this.clip = {};   // soldierClip's answer, reused
    this.base = SIDE_COLORS.map(c => new THREE.Color(c));
    this.capacity = capacity;
    this.meshes = {};
    viewOf.set(battle, this);
    this.blobs = blobMesh(Math.max(capacity, battle.soldiers.length) + 256);
    this.blobQ = new THREE.Quaternion(); this.blobS = new THREE.Vector3(); this.blobP = new THREE.Vector3(); this.blobM = new THREE.Matrix4();
    scene.add(this.blobs);
    this.seenSoldiers = 0;
    this.version = battle.version;
    this.banners = [];
    this.syncSoldiers();
    this.buildArrows();
    this.syncBanners();
    this.torches = lamps(scene, '#ffb25e');   // by night each regiment carries a torch by its banner
    this.torchCount = 0;
    if (keeps) buildKeeps(scene, heightAt);
    this.outlines = new THREE.Group();
    scene.add(this.outlines);
    this.preview = [];
    this.fx = fxFor(scene, heightAt);   // fx: hits, dust, order markers, morale bars, shake (fx.js)
  }

  // One pair of instanced meshes per unit type, made the first time that type appears.
  // Regiments raised later take the next free instances; a look out of room grows (grow) so every man is drawn.
  syncSoldiers() {
    const b = this.battle;
    if (this.version !== b.version) {
      // The battle dropped soldiers: hand out the instances again from the start.
      this.version = b.version;
      this.seenSoldiers = 0;
      for (const m of Object.values(this.meshes)) { m.list.length = 0; m.darkened.clear(); for (const x of m.all) x.count = 0; }
    }
    for (let i = this.seenSoldiers; i < b.soldiers.length; i++) {
      const s = b.soldiers[i], key = lookKey(s);
      let m = this.meshes[key];
      if (!m) m = this.meshes[key] = this.makeMeshes(key, Math.max(this.capacity, b.soldiers.filter(o => lookKey(o) === key).length));
      if (m.list.length >= m.gear.instanceMatrix.count && !this.grow(m, key)) continue;
      s.instance = m.list.length;
      m.list.push(s);
      // A little variation in each man's dye keeps the blocks from looking printed.
      s.tint = new THREE.Color(this.sideColor(s.reg.side)).multiplyScalar(0.85 + Math.random() * 0.3);
      s.gearTint = new THREE.Color().setScalar(0.9 + Math.random() * 0.2);
      if (m.light) continue;   // detailed soldiers are handed out each frame instead
      m.cloth.setColorAt(s.instance, s.tint);
      m.gear.setColorAt(s.instance, s.gearTint);
      m.cloth.count = m.gear.count = m.list.length;
      m.cloth.instanceColor.needsUpdate = m.gear.instanceColor.needsUpdate = true;
    }
    this.seenSoldiers = b.soldiers.length;
    // far men's shadow blobs: room for every man
    if (this.blobs.instanceMatrix.count < b.soldiers.length) this.blobs = this.regrow(this.blobs, b.soldiers.length + 256);
  }

  // A look out of room (men joining mid-fight: reinforcements, a muster, a host's later regiments) doubles its
  // instances; whatever stops that is said once, not passed over.
  grow(m, key) {
    try {
      const n = m.gear.instanceMatrix.count * 2;
      for (const pair of [m, m.light, m.far]) if (pair) { pair.gear = this.regrow(pair.gear, n, !!m.anim); pair.cloth = this.regrow(pair.cloth, n, !!m.anim); }
      m.all = [m.gear, m.cloth, ...(m.light ? [m.light.gear, m.light.cloth, m.far.gear, m.far.cloth] : [])];
      return true;
    } catch (e) {
      if (!this.growFailed) console.warn(`Could not make room for more men in '${key}': the newest aren't drawn.`, e);
      this.growFailed = true;
      return false;
    }
  }
  // An instanced mesh made again at `capacity`, keeping its geometry, materials (no new shaders) and what it holds.
  regrow(x, capacity, anim = false) {
    const y = new THREE.InstancedMesh(anim ? animGeometry(x.geometry, capacity) : x.geometry, x.material, capacity);
    if (anim) for (const k of ['aAnim', 'aAnimH']) y.geometry.attributes[k].array.set(x.geometry.attributes[k].array);
    y.customDepthMaterial = x.customDepthMaterial;
    y.castShadow = x.castShadow;
    y.frustumCulled = false;
    y.renderOrder = x.renderOrder;
    y.count = x.count;
    y.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    y.instanceMatrix.array.set(x.instanceMatrix.array);
    if (x.instanceColor) { y.setColorAt(0, this.tint.setScalar(1)); y.instanceColor.array.set(x.instanceColor.array); }
    this.scene.remove(x);
    this.scene.add(y);
    x.dispose();
    // the old clip buffers go with it; the model's own attributes stay, shared with the new one
    if (anim) { const g = x.geometry; for (const k of Object.keys(g.attributes)) if (k !== 'aAnim' && k !== 'aAnimH') g.deleteAttribute(k); g.setIndex(null); g.dispose(); }
    return y;
  }

  // A side's colour: the battle can set its own (`battle.sideColors`), so a house's defenders wear the house colour.
  sideColor(side) { return this.battle.sideColors?.[side] || SIDE_COLORS[side]; }

  // Baked soldiers get a full, a light and a far pair; each frame, the ones near the camera go in the full pair and
  // the distant ones in the far pair, which casts no shadow.
  makeMeshes(look, capacity) {
    const [key, armour, shield] = look.split('|'), chain = lookChain(key);
    // a kind that borrows another's model (sellswords wear the swordsman) still shows its own armour and shield, and
    // a drilled kind its own dress over them (serjeants a tabard)
    const dress = TYPES[key]?.dress, levels = look.includes('|') || dress;
    const baked = chain.map(k => levels && hasLevels(k) ? unitLook(k, { armour: armour || undefined, shield: shield !== 'false', dress }) : unitModel(k)).find(Boolean);
    const builtIn = chain.find(k => BUILT_IN.includes(k)) || key;
    const model = baked || (builtIn === 'cav' ? cavalry() : infantry(builtIn));
    // a soldier baked with a skeleton plays clips (anim.js): each instance gets its own clip and moment
    const anim = baked?.anim && animReady() ? baked.anim : null;
    const inst = (geo, light = false, shadow = true) => {
      const m = new THREE.InstancedMesh(anim ? animGeometry(geo, capacity) : geo, anim ? animMaterial(this.mat, { light }) : this.mat, capacity);
      if (anim) m.customDepthMaterial = animDepthMaterial(light);
      m.setColorAt(0, this.tint.setScalar(1));
      m.count = 0;
      m.castShadow = shadow;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      return m;
    };
    const m = { gear: inst(model.gear), cloth: inst(model.cloth), list: [], darkened: new Set(), anim };
    if (baked) {
      m.light = { gear: inst(baked.gearLight, true), cloth: inst(baked.clothLight, true) };
      m.far = { gear: inst(baked.gearFar, true, false), cloth: inst(baked.clothFar, true, false) };
    }
    m.all = [m.gear, m.cloth, ...(m.light ? [m.light.gear, m.light.cloth, m.far.gear, m.far.cloth] : [])];
    return m;
  }

  // Place one soldier in the full, the light or the far pair, darkened once he lies dead.
  drawDetailed(m, s, counts, cam) {
    const d2 = cam ? this.dummy.position.distanceToSquared(cam) : 0;
    const pair = d2 < LOD.near * LOD.near ? m : d2 < LOD.far * LOD.far ? m.light : m.far;
    if (pair === m.far && !s.gone && !s.reg.unseen && this.blobs.count < this.blobs.instanceMatrix.count) {
      // a man standing 1.8 m, a rider 2.6 m, both lower once fallen
      const len = (s.reg.T.mounted ? 2.6 : 1.8) * (s.alive ? 1 : 0.3) * SHADE_LEN, out = len * 0.45;
      this.blobQ.setFromAxisAngle(UP, Math.atan2(SHADE.x, SHADE.z));
      this.blobS.set(s.reg.T.mounted ? 1.5 : 0.9, 1, len + 0.6);
      this.blobs.setMatrixAt(this.blobs.count++, this.blobM.compose(this.blobP.set(s.x + SHADE.x * out, s.y + 0.05, s.z + SHADE.z * out), this.blobQ, this.blobS));
    }
    const i = pair === m ? counts.full++ : pair === m.light ? counts.light++ : counts.far++;
    const dead = !s.alive && s.fall >= 1;
    pair.gear.setMatrixAt(i, this.dummy.matrix);
    pair.cloth.setMatrixAt(i, this.dummy.matrix);
    if (m.anim) {
      const k = soldierClip(s, this.battle, m.anim, this.clip);
      for (const g of [pair.gear.geometry, pair.cloth.geometry]) { setClip(g, i, k.c, k.t); setClip(g, i, k.hc, k.ht, true); }
    }
    const hit = dead ? 0 : this.fx.flash(s, this.battle.time);   // fx: a man struck flashes pale for a moment
    pair.cloth.setColorAt(i, dead ? this.shade.copy(s.tint).multiplyScalar(0.55) : hit ? this.shade.copy(s.tint).lerp(WHITE, hit * 0.75) : s.tint);
    pair.gear.setColorAt(i, dead ? this.shade.copy(s.gearTint).multiplyScalar(0.6) : hit ? this.shade.copy(s.gearTint).lerp(WHITE, hit * 0.6) : s.gearTint);
  }

  buildArrows() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 1.1);
    this.arrowMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#2b2119' }), 4000);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.count = 0;
    this.scene.add(this.arrowMesh);
    // Javelins: a heavier, longer shaft with an iron head at the front.
    const jav = mergeGeometries([part(box(0.09, 0.09, 1.9), '#5e4228', { z: -0.1 }), part(new THREE.ConeGeometry(0.07, 0.3, 4).rotateX(Math.PI / 2), METAL, { z: 0.95 })]);
    this.javelinMesh = new THREE.InstancedMesh(jav, new THREE.MeshBasicMaterial({ vertexColors: true }), 600);
    this.javelinMesh.frustumCulled = false;
    this.javelinMesh.count = 0;
    this.scene.add(this.javelinMesh);
    // A champions' duel: a ring of trampled ground with each side's standards planted round it.
    this.duelRing = this.makeDuelRing();
  }

  makeDuelRing() {
    const g = new THREE.Group(), R = 13;
    const ground = new THREE.Mesh(new THREE.RingGeometry(R - 0.6, R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d8c89a', transparent: true, opacity: 0.5, depthWrite: false }));
    g.add(ground);
    g.userData.posts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * Math.PI * 2;
      const post = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 4.2, 6), new THREE.MeshLambertMaterial({ color: '#5a4030' }));
      pole.position.y = 2.1;
      post.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.7), new THREE.MeshLambertMaterial());
      flag.position.set(0, 3.55, -0.35);
      post.add(flag);
      post.userData = { a, flag };
      g.add(post);
      g.userData.posts.push(post);
    }
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  // The ring stands while the champions fight and for a few seconds after.
  updateDuelRing() {
    const D = this.battle.duel, g = this.duelRing;
    g.visible = !!D && (!D.over || this.battle.time - (D.end ??= this.battle.time) < 6);
    if (!g.visible) return;
    const H = this.heightAt;
    // The trampled band follows the ground, laid once for each duel.
    if (g.userData.duel !== D) {
      g.userData.duel = D;
      const p = g.children[0].geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, H(D.x + p.getX(i), D.z + p.getZ(i)) + 0.2);
      p.needsUpdate = true;
      g.children[0].geometry.computeBoundingSphere();
      g.children[0].position.set(D.x, 0, D.z);
    }
    // Each side's standards stand on the half of the ring toward its own army.
    const own = this.battle.regs.filter(r => r.side === 0 && !r.gone);
    const toward = Math.atan2(own.reduce((n, r) => n + r.cx, 0) / (own.length || 1) - D.x, own.reduce((n, r) => n + r.cz, 0) / (own.length || 1) - D.z);
    for (const p of g.userData.posts) {
      const a = p.userData.a + toward, x = D.x + Math.sin(a) * 13, z = D.z + Math.cos(a) * 13;
      p.position.set(x, H(x, z), z);
      p.rotation.y = a + Math.PI / 2;
      p.userData.flag.material.color.set(this.sideColor(Math.cos(p.userData.a) > 0 ? 0 : 1));
    }
  }

  syncBanners() {
    for (const r of this.battle.regs.slice(this.banners.length)) {
      const tex = this.bannerTextures(r);
      // (no haze on a banner: at night it would sink into the dark)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[0], sizeAttenuation: false, depthTest: false, transparent: true, fog: false }));
      sprite.scale.set(0.032, 0.04, 1);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      this.banners.push({ r, sprite, tex, selected: false, kit: kitOf(r) });
    }
  }

  bannerTextures(r) { return [false, true].map(sel => bannerTexture(this.sideColor(r.side), r.T.key, sel, r)); }

  bannerPos(r) {
    return new THREE.Vector3(r.cx, this.heightAt(r.cx, r.cz) + (r.T.mounted ? 7 : 6), r.cz);
  }

  update(selection) {
    const d = this.dummy, b = this.battle;
    this.syncSoldiers();
    this.syncBanners();
    const cam = LOD.camera?.position;
    this.blobs.count = 0;
    SHADE.set(-SUN_DIR.x, 0, -SUN_DIR.z).normalize();
    SHADE_LEN = Math.min(3, 1 / Math.tan(Math.asin(SUN_DIR.y)));
    for (const key in this.meshes) {
      const m = this.meshes[key], { gear, cloth, list, darkened } = m;
      const counts = { full: 0, light: 0, far: 0 };
      for (const s of list) {
        if (m.light && s.gone) continue;
        if (!m.light && !s.alive && s.fall >= 1 && darkened.has(s)) continue;   // corpses stay put
        if (s.gone || s.reg.unseen) {     // unseen: hidden from you in the woods (battle.updateSight)
          d.position.set(0, -50, 0); d.scale.setScalar(0.001);
        } else {
          // an animated soldier steps, strikes and falls in his clips; a rider still topples with his horse, and a man
          // whose skeleton has no Death clip topples whole rather than stand dead in his rest pose
          const mounted = s.reg.T.mounted, still = !!m.anim && (s.alive || fallsInClip(m.anim, s));
          const walking = s.v > 0.4 && s.alive && !still;
          const bob = walking ? Math.abs(Math.sin(s.phase)) * (mounted ? 0.18 : 0.1) : 0;
          const fwd = still ? 0 : s.lunge * 0.35, fall = still ? 0 : s.fall;
          d.position.set(s.x + (s.shiftX || 0) + Math.sin(s.yaw) * fwd, s.y + bob - fall * 0.15, s.z + (s.shiftZ || 0) + Math.cos(s.yaw) * fwd);
          d.rotation.set(-fall * Math.PI / 2 * (mounted ? 0 : 1), s.yaw + (s.lean || 0), mounted ? fall * Math.PI / 2 : 0);
          d.scale.setScalar(1);
        }
        d.updateMatrix();
        if (m.light) { this.drawDetailed(m, s, counts, cam); continue; }
        gear.setMatrixAt(s.instance, d.matrix);
        cloth.setMatrixAt(s.instance, d.matrix);
        if (!s.alive && s.fall >= 1) {
          const c = new THREE.Color();
          cloth.getColorAt(s.instance, c); cloth.setColorAt(s.instance, c.multiplyScalar(0.55));
          gear.getColorAt(s.instance, c); gear.setColorAt(s.instance, c.multiplyScalar(0.6));
          cloth.instanceColor.needsUpdate = gear.instanceColor.needsUpdate = true;
          darkened.add(s);
        }
      }
      if (m.light) {
        gear.count = cloth.count = counts.full;
        m.light.gear.count = m.light.cloth.count = counts.light;
        m.far.gear.count = m.far.cloth.count = counts.far;
        for (const x of m.all) {
          x.instanceMatrix.needsUpdate = true;
          if (x.instanceColor) x.instanceColor.needsUpdate = true;
          if (m.anim) x.geometry.attributes.aAnim.needsUpdate = x.geometry.attributes.aAnimH.needsUpdate = true;
        }
      } else gear.instanceMatrix.needsUpdate = cloth.instanceMatrix.needsUpdate = true;
    }

    this.blobs.instanceMatrix.needsUpdate = true;
    // Arrows fly a simple arc from bow to landing point.
    const q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
    let n = 0, nj = 0;
    for (const a of b.arrows) {
      if (n >= 4000) break;
      const t = a.t / a.T, t2 = Math.min(1, t + 0.02);
      const px = (k) => [a.x0 + (a.x1 - a.x0) * k, a.y0 + (a.y1 - a.y0) * k + 4 * a.h * k * (1 - k), a.z0 + (a.z1 - a.z0) * k];
      const p1 = px(t), p2 = px(t2);
      dir.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]).normalize();
      q.setFromUnitVectors(z, dir);
      d.position.set(...p1); d.quaternion.copy(q); d.scale.setScalar(1);
      d.updateMatrix();
      if (a.javelin) { if (nj < 600) this.javelinMesh.setMatrixAt(nj++, d.matrix); }
      else this.arrowMesh.setMatrixAt(n++, d.matrix);
      d.rotation.set(0, 0, 0);
    }
    this.arrowMesh.count = n;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.javelinMesh.count = nj;
    this.javelinMesh.instanceMatrix.needsUpdate = true;
    this.updateDuelRing();

    for (const bn of this.banners) {
      const r = bn.r;
      bn.sprite.visible = !r.gone && !r.unseen;
      if (!bn.sprite.visible) continue;
      bn.sprite.position.copy(this.bannerPos(r));
      const sel = selection.has(r);
      // a regiment's rank can rise after a fight, or its gear change: redraw its banner
      if (bn.kit !== kitOf(r)) {
        bn.kit = kitOf(r);
        for (const t of bn.tex) t.dispose();
        bn.tex = this.bannerTextures(r);
        bn.sprite.material.map = bn.tex[bn.selected ? 1 : 0];
      }
      if (sel !== bn.selected) {
        bn.selected = sel;
        bn.sprite.material.map = bn.tex[sel ? 1 : 0];
        bn.sprite.scale.set(sel ? 0.046 : 0.032, sel ? 0.0575 : 0.04, 1);
      }
      bn.sprite.material.opacity = r.routing ? 0.45 + 0.3 * Math.sin(b.time * 6) : 1;
    }
    if (NIGHT.value > 0.15) this.carryTorches();
    this.drawOutlines(selection);
    this.fx.battle(b, this, selection);   // fx
  }

  // A torch beside each regiment's banner, so a regiment reads by night (none for the gone or unseen).
  carryTorches() {
    const T = this.torches;
    if (this.torchCount !== this.banners.length) {
      this.torchCount = this.banners.length;
      T.set(this.banners.map(() => ({ x: 0, y: -1e4, z: 0, size: 9 })));
    }
    this.banners.forEach((bn, i) => {
      const r = bn.r, p = bn.sprite.position;
      if (r.gone || r.unseen) T.move(i, 0, -1e4, 0);
      else T.move(i, p.x + 1.2, p.y - 3.2, p.z);
    });
    T.update();
  }

  // Marks on the ground: where selected regiments stand, where they are heading, and whom they attack. Each is a
  // band, not a line (WebGL lines are a pixel thin), with a faint fill for a footprint; bands widen with the
  // camera's distance, so they read from a storm's height.
  drawOutlines(selection) {
    for (const o of this.outlines.children) o.geometry.dispose();
    this.outlines.clear();
    const cam = LOD.camera?.position;
    this.markWidth = r => Math.max(0.3, Math.min(3.6, (cam ? cam.distanceTo(new THREE.Vector3(r.cx ?? r.x, 0, r.cz ?? r.z)) : 60) * 0.009));
    for (const r of selection) {
      if (r.gone || r.routing) continue;
      this.addRect(r, r.x, r.z, r.angle, r.files, r.side === 0 ? '#ffd970' : '#ff7a6a', 1);
      if (r.dest && !r.targetReg) this.addRect(r, r.dest.x, r.dest.z, r.dest.angle, r.files, '#9fe6a0', 0.8);
      if (r.targetReg && !r.targetReg.gone) this.addLine(r, r.cx, r.cz, r.targetReg.cx, r.targetReg.cz, '#ff5a4a');
    }
    for (const p of this.preview) this.addRect(p.r, p.x, p.z, p.angle, p.files, '#ffffff', 0.85);
  }
  // one material per colour and strength, kept (the marks are redrawn every frame)
  markMaterial(color, opacity) {
    const key = color + opacity;
    this.markMats ??= new Map();
    if (!this.markMats.has(key)) this.markMats.set(key, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    return this.markMats.get(key);
  }
  // A flat band through ground points [x, z] (closed: back round to the first), `w` wide, lying on the ground.
  addBand(pts, w, closed, material) {
    const n = pts.length, pos = new Float32Array(n * 6), idx = [];
    pts.forEach(([x, z], i) => {
      const a = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len * w / 2, nz = (b[0] - a[0]) / len * w / 2;
      pos.set([x + nx, this.heightAt(x + nx, z + nz) + 0.35, z + nz, x - nx, this.heightAt(x - nx, z - nz) + 0.35, z - nz], i * 6);
    });
    for (let i = 0; i < (closed ? n : n - 1); i++) { const j = (i + 1) % n; idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, material);
    m.renderOrder = 5;
    this.outlines.add(m);
  }

  addRect(r, x, z, angle, files, color, opacity) {
    const T = r.T;
    const f = Math.max(1, Math.min(files, r.alive));
    const ranks = Math.ceil(r.alive / f);
    const hw = (f - 1) / 2 * T.spacing + 1, back = (ranks - 1) * (T.depth || T.spacing) + 1;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const corners = [[-hw, 1], [hw, 1], [hw, -back], [-hw, -back]];
    const at = (lx, lz) => [x + cos * lx + sin * lz, z - sin * lx + cos * lz];
    // the border: a band round the footprint, the corners sampled close so it bends over the ground
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      for (let k = 0; k < 8; k++) pts.push(at(ax + (bx - ax) * k / 8, az + (bz - az) * k / 8));
    }
    // a dark casing under the coloured band, so it reads on pale hazed ground from a storm's height
    this.addBand(pts, this.markWidth(r) * 1.9, true, this.markMaterial('#2a1a0c', 0.55 * opacity));
    this.addBand(pts, this.markWidth(r), true, this.markMaterial(color, opacity));
    // the fill: a faint wash over the footprint, in strips across it
    const rows = 6, fill = [], idx = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= 4; i++) {
      const [wx, wz] = at(-hw + 2 * hw * i / 4, 1 - (1 + back) * j / rows);
      fill.push(wx, this.heightAt(wx, wz) + 0.3, wz);
      if (i && j) { const q = j * 5 + i; idx.push(q - 6, q - 1, q - 5, q - 1, q, q - 5); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, this.markMaterial(color, opacity * 0.26));
    m.renderOrder = 4;
    this.outlines.add(m);
  }

  addLine(r, x0, z0, x1, z1, color) {
    const pts = [];
    for (let k = 0; k <= 16; k++) pts.push([x0 + (x1 - x0) * k / 16, z0 + (z1 - z0) * k / 16]);
    this.addBand(pts, this.markWidth(r) * 0.8, false, this.markMaterial(color, 0.8));
  }
}
