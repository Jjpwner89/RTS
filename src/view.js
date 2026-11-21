// Draws the battle: instanced low-poly soldiers, arrows, regiment banners and order outlines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TYPES } from './battle.js';
import { HOMES } from './terrain.js';
import { unitModel, unitLook, hasLevels, buildingModel, LOD, HOUSE_STYLES } from './models.js';
import { lookChain } from './battle.js';
import { iconImage } from './icons.js';
import { animReady, animGeometry, animMaterial, animDepthMaterial, clipOf, setClip, gaitFor } from './anim.js';

// Which look a soldier wears: his own (a captain or lord), else his regiment's kind in its armour and with or
// without shields (reg.armour: 'none' | 'leather' | 'mail' | 'plate', reg.shield: false for none).
const kitOf = r => `${r.vet || 0}|${r.armour || ''}`;
const lookKey = s => s.look || (s.reg.armour || s.reg.shield === false ? `${s.reg.T.key}|${s.reg.armour || ''}|${s.reg.shield !== false}` : s.reg.T.key);

// Units without their own model or icon borrow the nearest one (battle.js lookChain).
const BUILT_IN = ['spear', 'sword', 'archer', 'cav', 'militia', 'bandit'];

export const SIDE_COLORS = ['#3d6fd6', '#c8423a'];

// ---- what an animated soldier is doing ----

// The clip (anim.js clipOf) and moment each baked soldier shows, read from the battle: dead, striking, shooting,
// routing, cheering a win, braced, marching or standing. `info` is the model's (rig, horse, weapon, shield, rest).
// A strike or shot is lined up so the blow lands, or the arrow leaves, when the battle says it does: the clip
// winds up while the man's cooldown runs out and plays on from the moment after (battle.js marks both, `// anim:`).
// Gaits are picked and paced by how fast the man covers ground (anim.js gaitFor), so his feet keep pace with it;
// a horse's and its rider's share one clock. Also read by tools/viewer.html, with a stand-in soldier and battle.
const UPRIGHT = { spear: true, sword: true, axe: true, crossbow: true };   // carried upright on the march
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HORSE_TROT = 2.4;   // the stock trot steps short: a horse trots a little quicker than its clip before it gallops
export function soldierClip(s, b, info, out) {
  const r = s.reg, T = r.T, now = b.time, rig = info.rig;
  const dt = clamp(now - (s.animAt ?? now), 0, 0.5);   // (a frame at 4x is up to 0.4 s of battle: main.js)
  s.animAt = now;
  s.animT ??= Math.random() * 3;
  out.hc = null; out.ht = 0;
  const show = (name, t) => { out.c = clipOf(rig, name) || clipOf(rig, info.rest); out.t = t; return out; };
  const gait = name => { s.animT += dt; return show(name, s.animT); };
  // on the move: the slowest of `gaits` that keeps up, at the pace that matches the ground
  const pace = (gaits, v = s.v) => { const g = gaitFor(rig, gaits, v); s.animT += dt * g.rate; return show(g.name, s.animT); };
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
    if (!s.alive) { out.hc = clipOf('horse', 'Idle'); return show('Ride_Idle', 0); }   // he goes down with his horse
    const g = s.v < 0.4 ? { name: 'Idle', rate: 1 } : gaitFor('horse', ['Trot', 'Gallop'], s.v, HORSE_TROT), pace = g.name;
    s.animT += dt * g.rate;
    out.hc = clipOf('horse', pace); out.ht = s.animT;
    const lance = info.weapon === 'lance';
    if (close && lance) { s.couchAt ??= now; return show('Ride_Couch', now - s.couchAt); }
    s.couchAt = null;
    if (!lance) { const k = timed('Ride_Slash', 'sword-contact', now - (s.struckAt ?? -99), close ? s.cd : null); if (k) return k; }
    // the lance comes down for the charge: galloping at a foe with the charge still in him, or ordered to
    if (lance && pace === 'Gallop' && ((T.charge && !s.charged && s.target) || now < r.chargeUntil)) return show('Ride_Charge', s.animT);
    return show('Ride_' + pace, s.animT);
  }

  if (!s.alive) return show('Death', now - (s.diedAt ?? now));
  // a blow, or the wind-up to one
  const strike = info.weapon === 'spear' ? ['Spear_Thrust', 'thrust'] : ['Sword_Slash', 'strike'];
  let k = timed(...strike, now - (s.struckAt ?? -99), close ? s.cd : null);
  if (k) return k;
  // a shot: bows, crossbows and javelins each their own way
  if (T.range) {
    const shot = T.javelin ? ['Javelin_Throw', 'release-javelin'] : info.weapon === 'crossbow' ? ['Crossbow_Span', 'shoot'] : ['Bow_Loose', 'loose'];
    const loosing = !s.target && r.ammo >= 1 && now - (r.lastShot ?? -99) < T.reload * 1.5;
    k = timed(...shot, now - (s.shotAt ?? -99), loosing ? s.fireCd : null);
    if (k) return k;
  }
  if (r.routing) return pace(['Rout']);
  if (b.winner === r.side) { s.animT += dt; return show('Cheer', s.animT % 2.6); }
  if (s.v >= 0.4 || s.climb > 0) {
    // (a climber keeps stepping up his ladder however slowly he rises)
    return pace(UPRIGHT[info.weapon] ? ['March_Upright', 'WalkArmed', 'RunArmed'] : ['Walk', 'Run'], Math.max(s.v, 0.8));
  }
  // standing: spears brace against what's coming, shields close up in a tight line
  const braced = T.braces && info.weapon === 'spear' && (r.formation === 'square' || r.hold || r.engaged > 0);
  if (braced) { s.braceAt ??= now; return show('Spear_Brace', now - s.braceAt); }
  s.braceAt = null;
  if (info.shield && r.formation === 'tight') return gait('Shield_Wall');
  return gait(info.rest);
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
export const fortModel = () => buildingModel('fort') || keepModel({ palisade: false, level: 1 });
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
  key = lookChain(key).find(k => BUILT_IN.includes(k)) || key;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 32, s / 32);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  if (key === 'militia') {
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
  ctx.fill();
  ctx.lineWidth = selected ? 6 : 3;
  ctx.strokeStyle = selected ? '#ffd970' : 'rgba(20,16,12,0.85)';
  ctx.stroke();
  drawIcon(ctx, key, 32, 34, 34);
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
    this.seenSoldiers = 0;
    this.version = battle.version;
    this.banners = [];
    this.syncSoldiers();
    this.buildArrows();
    this.syncBanners();
    if (keeps) buildKeeps(scene, heightAt);
    this.outlines = new THREE.Group();
    scene.add(this.outlines);
    this.preview = [];
  }

  // One pair of instanced meshes per unit type, made the first time that type appears.
  // Regiments raised later take the next free instances.
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
      if (m.list.length >= m.gear.instanceMatrix.count) continue;   // out of room: not drawn
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
  }

  // A side's colour: the battle can set its own (`battle.sideColors`), so a house's defenders wear the house colour.
  sideColor(side) { return this.battle.sideColors?.[side] || SIDE_COLORS[side]; }

  // Baked soldiers get a full and a light pair; each frame, the ones near the camera go in the full pair.
  makeMeshes(look, capacity) {
    const [key, armour, shield] = look.split('|'), chain = lookChain(key);
    // a kind that borrows another's model (sellswords wear the swordsman) still shows its own armour and shield
    const baked = chain.map(k => look.includes('|') && hasLevels(k) ? unitLook(k, { armour: armour || undefined, shield: shield !== 'false' }) : unitModel(k)).find(Boolean);
    const builtIn = chain.find(k => BUILT_IN.includes(k)) || key;
    const model = baked || (builtIn === 'cav' ? cavalry() : infantry(builtIn));
    // a soldier baked with a skeleton plays clips (anim.js): each instance gets its own clip and moment
    const anim = baked?.anim && animReady() ? baked.anim : null;
    const inst = (geo, light = false) => {
      const m = new THREE.InstancedMesh(anim ? animGeometry(geo, capacity) : geo, anim ? animMaterial(this.mat, { light }) : this.mat, capacity);
      if (anim) m.customDepthMaterial = animDepthMaterial(light);
      m.setColorAt(0, this.tint.setScalar(1));
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      return m;
    };
    const m = { gear: inst(model.gear), cloth: inst(model.cloth), list: [], darkened: new Set(), anim };
    if (baked) m.light = { gear: inst(baked.gearLight, true), cloth: inst(baked.clothLight, true) };
    m.all = [m.gear, m.cloth, ...(m.light ? [m.light.gear, m.light.cloth] : [])];
    return m;
  }

  // Place one soldier in the full or the light pair, darkened once he lies dead.
  drawDetailed(m, s, counts, cam) {
    const near = !cam || this.dummy.position.distanceToSquared(cam) < LOD.near * LOD.near;
    const pair = near ? m : m.light, i = near ? counts.full++ : counts.light++;
    const dead = !s.alive && s.fall >= 1;
    pair.gear.setMatrixAt(i, this.dummy.matrix);
    pair.cloth.setMatrixAt(i, this.dummy.matrix);
    if (m.anim) {
      const k = soldierClip(s, this.battle, m.anim, this.clip);
      for (const g of [pair.gear.geometry, pair.cloth.geometry]) { setClip(g, i, k.c, k.t); setClip(g, i, k.hc, k.ht, true); }
    }
    pair.cloth.setColorAt(i, dead ? this.shade.copy(s.tint).multiplyScalar(0.55) : s.tint);
    pair.gear.setColorAt(i, dead ? this.shade.copy(s.gearTint).multiplyScalar(0.6) : s.gearTint);
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
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[0], sizeAttenuation: false, depthTest: false, transparent: true }));
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
    for (const key in this.meshes) {
      const m = this.meshes[key], { gear, cloth, list, darkened } = m;
      const counts = { full: 0, light: 0 };
      for (const s of list) {
        if (m.light && s.gone) continue;
        if (!m.light && !s.alive && s.fall >= 1 && darkened.has(s)) continue;   // corpses stay put
        if (s.gone || s.reg.unseen) {     // unseen: hidden from you in the woods (battle.updateSight)
          d.position.set(0, -50, 0); d.scale.setScalar(0.001);
        } else {
          // an animated soldier steps, strikes and falls in his clips; a rider still topples with his horse
          const mounted = s.reg.T.mounted, still = !!m.anim;
          const walking = s.v > 0.4 && s.alive && !still;
          const bob = walking ? Math.abs(Math.sin(s.phase)) * (mounted ? 0.18 : 0.1) : 0;
          const fwd = still ? 0 : s.lunge * 0.35, fall = still && !mounted ? 0 : s.fall;
          d.position.set(s.x + Math.sin(s.yaw) * fwd, s.y + bob - fall * 0.15, s.z + Math.cos(s.yaw) * fwd);
          d.rotation.set(-fall * Math.PI / 2 * (mounted ? 0 : 1), s.yaw, mounted ? fall * Math.PI / 2 : 0);
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
        for (const x of m.all) {
          x.instanceMatrix.needsUpdate = true;
          if (x.instanceColor) x.instanceColor.needsUpdate = true;
          if (m.anim) x.geometry.attributes.aAnim.needsUpdate = x.geometry.attributes.aAnimH.needsUpdate = true;
        }
      } else gear.instanceMatrix.needsUpdate = cloth.instanceMatrix.needsUpdate = true;
    }

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
        bn.sprite.scale.set(sel ? 0.038 : 0.032, sel ? 0.0475 : 0.04, 1);
      }
      bn.sprite.material.opacity = r.routing ? 0.45 + 0.3 * Math.sin(b.time * 6) : 1;
    }
    this.drawOutlines(selection);
  }

  // Rectangles on the ground: where selected regiments stand, and where they are heading.
  drawOutlines(selection) {
    for (const o of this.outlines.children) { o.geometry.dispose(); o.material.dispose(); }
    this.outlines.clear();
    for (const r of selection) {
      if (r.gone || r.routing) continue;
      this.addRect(r, r.x, r.z, r.angle, r.files, r.side === 0 ? '#ffd970' : '#ff7a6a', 1);
      if (r.dest && !r.targetReg) this.addRect(r, r.dest.x, r.dest.z, r.dest.angle, r.files, '#9fe6a0', 0.7);
      if (r.targetReg && !r.targetReg.gone) this.addLine(r.cx, r.cz, r.targetReg.cx, r.targetReg.cz, '#ff5a4a');
    }
    for (const p of this.preview) this.addRect(p.r, p.x, p.z, p.angle, p.files, '#ffffff', 0.85);
  }

  addRect(r, x, z, angle, files, color, opacity) {
    const T = r.T;
    const f = Math.max(1, Math.min(files, r.alive));
    const ranks = Math.ceil(r.alive / f);
    const hw = (f - 1) / 2 * T.spacing + 1, back = (ranks - 1) * (T.depth || T.spacing) + 1;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const corners = [[-hw, 1], [hw, 1], [hw, -back], [-hw, -back]];
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      for (let k = 0; k < 8; k++) {
        const lx = ax + (bx - ax) * k / 8, lz = az + (bz - az) * k / 8;
        const wx = x + cos * lx + sin * lz, wz = z - sin * lx + cos * lz;
        pts.push(new THREE.Vector3(wx, this.heightAt(wx, wz) + 0.35, wz));
      }
    }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
    line.renderOrder = 5;
    this.outlines.add(line);
  }

  addLine(x0, z0, x1, z1, color) {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const x = x0 + (x1 - x0) * k / 16, z = z0 + (z1 - z0) * k / 16;
      pts.push(new THREE.Vector3(x, this.heightAt(x, z) + 0.6, z));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false }));
    line.renderOrder = 5;
    this.outlines.add(line);
  }
}
