// Draws the town: the keep, buildings (as sites, standing or burned), villagers at
// work, stone and ore deposits, and the ghost of a building being placed.
import * as THREE from 'three';
import { iconImage } from './icons.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, box, cyl, SKIN, METAL, DARK, WOOD, LEATHER, STONE, STONE_DARK, THATCH, PLASTER, SIDE_COLORS, heartModel, keepTop, houseModel, keepLevelOf, poleFor } from './view.js';
import { unitModel, buildingModel, LOD, HOUSE_STYLES } from './models.js';
import { animReady, animGeometry, animMaterial, animDepthMaterial, clipOf, setClip, gaitFor } from './anim.js';
import { BUILDINGS } from './economy.js';
import { fxFor } from './fx.js';
const REBEL = new THREE.Color('#e8402c');   // villagers in revolt, so the crowd reads at a glance

// anim: the clip a baked villager plays (anim.js), from what the economy has him doing: walking, carrying, felling,
// digging or hoeing at his job, running from raiders, or standing about. `dt` is village time since the last frame.
const WORK_CLIP = { tree: 'Chop', rock: 'Mine', ore: 'Mine', field: 'Hoe' };
// A walker's gait and its pace follow how fast he really covers the ground (faster on a road: economy.js walk),
// measured from where he has got to, so his feet keep pace (anim.js gaitFor).
function villagerClip(v, dt) {
  if (dt > 0) {
    const moved = v.animX == null ? 0 : Math.hypot(v.x - v.animX, v.z - v.animZ) / dt;
    if (moved < 12) v.animV = (v.animV ?? moved) + (moved - (v.animV ?? moved)) * Math.min(1, dt * 6);   // (not a jump to a new spot)
    v.animX = v.x; v.animZ = v.z;
  }
  const work = v.state === 'work' && !v.v && (v.task?.phase === 'gather' || v.task?.phase === 'tend') && v.job?.B.gather;
  const g = v.v ? gaitFor('male', v.carry ? ['CarryWalk', 'CarryRun'] : ['Walk', 'Run'], Math.max(0.5, v.animV || v.v))
    : { name: work ? WORK_CLIP[work.node] || 'Idle' : v.state === 'build' ? 'Chop' : 'Idle', rate: 1 };
  v.animT = (v.animT ?? Math.random() * 3) + dt * g.rate;
  return clipOf('male', g.name);
}

const TIMBER = '#8a6a48', SHINGLE = '#6d5a48', ROOF_RED = '#7a4a32', CRATE_WOOD = '#a07a4a', CRATE_BAND = '#5e4228';

function roof(w, d, h, color, y) {
  const g = new THREE.ConeGeometry(1, 1, 4);
  g.rotateY(Math.PI / 4);
  g.scale(w * 0.78, h, d * 0.78);
  return part(g, color, { y: y + h / 2 });
}
const cottage = (w, d, h, wall, top, at = {}) => [
  part(box(w, h, d), wall, { ...at, y: h / 2 }),
  (() => { const r = roof(w, d, h * 0.8, top, h); r.translate(at.x || 0, 0, at.z || 0); return r; })(),
];
const field = (color, rows) => {
  const parts = [part(box(17, 0.12, 17), color, { y: 0.06 })];
  for (let i = -3; i <= 3; i++) parts.push(part(box(16, 0.2, 0.7), rows, { y: 0.1, z: i * 2.3 }));
  return parts;
};
const chimney = (x, z) => part(cyl(0.55, 0.65, 4.2, 6), STONE_DARK, { x, y: 2.6, z });

const MODELS = {
  house: () => houseModel(),
  woodcutter: () => mergeGeometries([...cottage(4, 4, 2.4, TIMBER, THATCH),
    ...[0.3, 0.3, 0.85].map((y, i) => part(cyl(0.3, 0.3, 3, 6), WOOD, { x: 3.2, y, z: [-0.35, 0.35, 0][i], rx: Math.PI / 2 }))]),
  quarry: () => mergeGeometries([...cottage(4, 3.5, 2.2, '#8a8070', SHINGLE),
    part(box(1.2, 0.8, 1.2), STONE, { x: 3, y: 0.4, z: -0.7 }), part(box(1.2, 0.8, 1.2), STONE, { x: 3, y: 0.4, z: 0.7 }),
    part(box(1.2, 0.8, 1.2), STONE_DARK, { x: 3, y: 1.2, z: 0 })]),
  mine: () => mergeGeometries([...cottage(3, 3, 2, TIMBER, SHINGLE, { x: -1.5 }),
    part(box(2.4, 2.4, 1.2), DARK, { x: 1.8, y: 1.2, z: -1 }), part(box(3, 0.4, 1.6), WOOD, { x: 1.8, y: 2.6, z: -1 }),
    part(new THREE.ConeGeometry(1.2, 1.2, 6), '#8a4a32', { x: 1.6, y: 0.6, z: 1.6 })]),
  hunter: () => mergeGeometries([...cottage(4, 4, 2.4, '#7a6040', '#5e4a32'),
    part(box(0.15, 2, 0.15), WOOD, { x: 2.8, y: 1, z: -0.9 }), part(box(0.15, 2, 0.15), WOOD, { x: 2.8, y: 1, z: 0.9 }),
    part(box(0.05, 1.2, 1.7), LEATHER, { x: 2.8, y: 1.3 })]),
  farm: () => mergeGeometries([...field('#9c8446', '#c9b066'), ...cottage(3, 3, 2, TIMBER, THATCH, { x: 6.5, z: 6.5 })]),
  flax: () => mergeGeometries([...field('#5f7f62', '#86a8d8'), ...cottage(3, 3, 2, TIMBER, THATCH, { x: 6.5, z: 6.5 })]),
  carpenter: () => mergeGeometries([...cottage(5, 4, 2.6, PLASTER, ROOF_RED),
    ...[0, 1, 2, 3].map(i => part(box(2.6, 0.12, 0.9), '#c49a62', { x: 3.6, y: 0.1 + i * 0.14, z: 0 }))]),
  ropemaker: () => mergeGeometries([...cottage(3, 8, 2, TIMBER, THATCH), part(cyl(0.6, 0.6, 0.4, 10), '#c9b98a', { x: 2.4, y: 0.2 })]),
  smelter: () => mergeGeometries([...cottage(4, 4, 2.4, STONE, '#5f4a3a'), chimney(1.2, -1),
    part(box(1, 0.6, 0.2), '#ff8a3a', { y: 0.5, z: 2.05 })]),
  bowyer: () => mergeGeometries([...cottage(4, 4, 2.4, PLASTER, SHINGLE),
    part(box(0.12, 1.8, 0.12), WOOD, { x: 2.8, y: 0.9, z: -0.8 }), part(box(0.12, 1.8, 0.12), WOOD, { x: 2.8, y: 0.9, z: 0.8 }),
    part(box(0.08, 0.08, 1.8), WOOD, { x: 2.8, y: 1.7 }),
    ...[-0.5, 0, 0.5].map(z => part(box(0.05, 1.3, 0.05), '#5a3a22', { x: 2.85, y: 1.0, z }))]),
  weaponsmith: () => mergeGeometries([...cottage(4.5, 4, 2.5, STONE_DARK, '#4a4038'), chimney(-1.3, -1),
    part(box(0.6, 0.5, 0.3), DARK, { x: 3, y: 0.55 }), part(box(0.4, 0.3, 0.4), DARK, { x: 3, y: 0.15 })]),
  storehouse: () => mergeGeometries([...cottage(7, 5, 3, TIMBER, SHINGLE),
    part(box(2.2, 2.2, 0.1), DARK, { y: 1.1, z: 2.52 }),
    ...[[-2.6, 3.4], [-1.6, 3.6], [2.4, 3.4]].map(([x, z]) => part(box(0.9, 0.7, 0.8), CRATE_WOOD, { x, y: 0.35, z })),
    part(box(0.9, 0.7, 0.8), CRATE_WOOD, { x: -2.1, y: 1.05, z: 3.5 })]),
  barracks: () => mergeGeometries([...cottage(10, 6, 3, TIMBER, ROOF_RED),
    part(cyl(0.1, 0.1, 7, 4), WOOD, { x: 4, y: 3.5, z: 4 }), part(box(0.05, 1.4, 2.2), SIDE_COLORS[0], { x: 4, y: 6.2, z: 5.1 }),
    ...[-1, 0, 1].map(i => part(cyl(0.03, 0.03, 2.6, 4), WOOD, { x: -3 + i * 0.5, y: 1.3, z: 3.4, rx: 0.15 }))]),
};

// Two-toned peasants, built like the soldiers so they share a scale. The baked villager replaces them when loaded.
function peasant() {
  const gear = mergeGeometries([
    part(box(0.17, 0.8, 0.18), DARK, { x: -0.12, y: 0.4 }),
    part(box(0.17, 0.8, 0.18), DARK, { x: 0.12, y: 0.4 }),
    part(new THREE.SphereGeometry(0.15, 7, 5), SKIN, { y: 1.65 }),
  ]);
  const cloth = mergeGeometries([
    part(box(0.5, 0.75, 0.32), '#ffffff', { y: 1.13 }),
    part(box(0.13, 0.58, 0.14), '#ffffff', { x: -0.33, y: 1.15 }),
    part(box(0.13, 0.58, 0.14), '#ffffff', { x: 0.33, y: 1.15 }),
    part(new THREE.SphereGeometry(0.165, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', { y: 1.69 }),
  ]);
  return { gear, cloth };
}
const DYES = ['#8a6a4a', '#6f7a52', '#7a5a48', '#9a8a6a', '#5f6a7a', '#8a7a5a', '#6a5040'];
// What shows over the rim of a crate.
const CARRY = { wood: '#7a5a3a', stone: '#9a968e', food: '#a8463a', flax: '#7f9f5a', feathers: '#eeeae0', ore: '#8a4a32',
  planks: '#c49a62', string: '#d8cca0', iron: '#5a5e66', shields: '#8a5a3a', bows: '#5a3a22', arrows: '#d8c8a0', spears: '#9a9ca4', swords: '#b8bcc4' };

// A plain wooden crate with dark bands, carried in both hands or stacked by a door.
function crateModel() {
  return mergeGeometries([
    part(box(0.62, 0.42, 0.46), CRATE_WOOD, { y: 0.21 }),
    part(box(0.66, 0.07, 0.5), CRATE_BAND, { y: 0.05 }),
    part(box(0.66, 0.07, 0.5), CRATE_BAND, { y: 0.39 }),
    part(box(0.07, 0.44, 0.5), CRATE_BAND, { y: 0.21 }),
  ]);
}

export function deposit(kind, rand) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.IcosahedronGeometry(1.4 + rand() * 1.8, 0);
    g.scale(1, 0.6 + rand() * 0.5, 1);
    const color = kind === 'ore' ? (i % 2 ? '#8a4a32' : '#6e5e56') : (i % 2 ? STONE : STONE_DARK);
    parts.push(part(g, color, { x: (rand() - 0.5) * 6, y: 0.6, z: (rand() - 0.5) * 6, ry: rand() * 3 }));
  }
  return mergeGeometries(parts);
}

function iconTexture(icon, warn) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(64, 64, 55, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24, 20, 16, 0.78)';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = warn ? '#ff9a4a' : 'rgba(224, 194, 122, 0.7)';
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  iconImage(icon, warn ? '#ffb27a' : '#f0dca8', img => { ctx.drawImage(img, 30, 30, 68, 68); tex.needsUpdate = true; });
  return tex;
}

function circle(radius, color, opacity) {
  const pts = [];
  for (let i = 0; i < 64; i++) pts.push(new THREE.Vector3(Math.sin(i / 64 * Math.PI * 2) * radius, 0, Math.cos(i / 64 * Math.PI * 2) * radius));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  line.renderOrder = 4;
  return line;
}

export class TownView {
  constructor(scene, town, heightAt, rand) {
    Object.assign(this, { scene, town, heightAt });
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.siteMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55 });
    this.ruinMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: '#3a3430' });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#7fe08a', transparent: true, opacity: 0.45, depthWrite: false });
    this.missMat = new THREE.MeshBasicMaterial({ color: '#ff6a5a', transparent: true, opacity: 0.45, depthWrite: false });
    this.geos = {};
    this.meshes = new Map();
    this.icons = {};

    // the keep grows through five levels with the village; see wantedKeepLevel()
    this.keepLevel = this.wantedKeepLevel();
    const keepGeo = heartModel(town.kind, this.keepLevel);
    const keep = this.keep = new THREE.Mesh(keepGeo, this.mat);
    keep.position.set(0, heightAt(0, 0) - 0.5, 0);
    keep.castShadow = keep.receiveShadow = true;
    scene.add(keep);
    // Ground cover (scenery.js) comes off ground that something stands on.
    this.cover = scene.userData.cover;
    this.cover?.clear(0, 0, 16);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshLambertMaterial({ color: SIDE_COLORS[0], side: THREE.DoubleSide }));
    flag.position.set(2, heightAt(0, 0) + keepTop(keepGeo) + 2.5, 0);
    this.flag = poleFor(flag, 4, 2.4);
    scene.add(flag);

    for (const kind of ['rock', 'ore']) {
      for (const n of town.nodes[kind]) {
        const m = new THREE.Mesh(deposit(kind, rand), this.mat);
        m.position.set(n.x, heightAt(n.x, n.z) - 0.4, n.z);
        this.cover?.clear(n.x, n.z, 3.5);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
    }

    // Villagers: a full and a light pair when the baked villager loaded, handed out by distance each frame.
    const baked = unitModel('villager'), p = baked || peasant();
    // anim: a baked villager plays clips; each instance carries its own
    const anim = this.anim = baked?.anim && animReady() ? baked.anim : null;
    const folk = (geo, light = false) => {
      const m = new THREE.InstancedMesh(anim ? animGeometry(geo, 600) : geo, anim ? animMaterial(this.mat, { light }) : this.mat, 600);
      if (anim) m.customDepthMaterial = animDepthMaterial(light);
      return m;
    };
    this.people = {
      gear: folk(p.gear),
      cloth: folk(p.cloth),
      crate: new THREE.InstancedMesh(crateModel(), this.mat, 600),
      carry: new THREE.InstancedMesh(new THREE.BoxGeometry(0.54, 0.08, 0.38), new THREE.MeshLambertMaterial(), 600),
    };
    if (baked) {
      this.people.gearLight = folk(baked.gearLight, true);
      this.people.clothLight = folk(baked.clothLight, true);
    }
    // each villager keeps one dye for life
    this.dyes = Array.from({ length: 600 }, (_, i) => new THREE.Color(DYES[i % DYES.length]).multiplyScalar(0.85 + rand() * 0.3));
    this.skins = Array.from({ length: 600 }, () => new THREE.Color().setScalar(0.9 + rand() * 0.2));
    // Crates stacked outside buildings, one for each ten goods held there.
    this.piles = new THREE.InstancedMesh(crateModel(), this.mat, 1200);
    this.piles.frustumCulled = false;
    this.piles.castShadow = this.piles.receiveShadow = true;
    this.piles.count = 0;
    scene.add(this.piles);
    const c = new THREE.Color();
    for (let i = 0; i < 600; i++) {
      this.people.cloth.setColorAt(i, this.dyes[i]);
      this.people.gear.setColorAt(i, this.skins[i]);
      this.people.gearLight?.setColorAt(i, this.skins[i]);
      this.people.clothLight?.setColorAt(i, this.dyes[i]);
      this.people.carry.setColorAt(i, c.set('#ffffff'));
    }
    for (const m of Object.values(this.people)) { m.frustumCulled = false; m.castShadow = true; m.count = 0; scene.add(m); }
    this.dummy = new THREE.Object3D();

    this.ghost = null;
    this.ghostRange = circle(1, '#ffffff', 0.5);
    this.territoryRing = circle(town.territory, '#ffd970', 0.35);
    this.territoryRing.position.y = heightAt(0, 0) + 1;
    this.selectRing = circle(1, '#ffd970', 0.9);
    for (const o of [this.ghostRange, this.territoryRing, this.selectRing]) { o.visible = false; scene.add(o); }
  }

  // The keep's level: see keepLevelOf.
  wantedKeepLevel() { return keepLevelOf(this.town); }

  // Houses come in three styles, picked per building. Buildings with upgrade levels (b.level 2 or 3) have a model for
  // each; a level without one keeps the one below.
  geo(kind, style = 0, level = 1) {
    // (a village's chapel is the monastery kind, drawn as the smaller timber chapel)
    const base = kind === 'house' ? `house.${style % HOUSE_STYLES}` : kind === 'monastery' ? 'chapel' : kind === 'cathedral' && !buildingModel('cathedral') ? 'monastery' : kind;
    for (let l = level; l > 1; l--) if (buildingModel(`${base}.${l}`)) return this.cached(`${base}.${l}`, () => buildingModel(`${base}.${l}`));
    return this.cached(base, () => (kind === 'house' ? houseModel(style) : buildingModel(base) || buildingModel(kind)) || (MODELS[kind] || MODELS.storehouse)());
  }
  cached(key, make) { return this.geos[key] || (this.geos[key] = make()); }

  icon(b, warn) {
    const key = b.kind + (warn ? '!' : '');
    return this.icons[key] || (this.icons[key] = iconTexture(b.B.icon, warn));
  }

  // Show where a building would go: green if it fits, red if not.
  showGhost(kind, at, ok) {
    if (!kind || !at) {
      if (this.ghost) this.ghost.visible = false;
      this.ghostRange.visible = this.territoryRing.visible = false;
      return;
    }
    if (!this.ghost || this.ghost.userData.kind !== kind) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = new THREE.Mesh(this.geo(kind), this.ghostMat);
      this.ghost.userData.kind = kind;
      this.scene.add(this.ghost);
    }
    this.ghost.visible = true;
    this.ghost.position.set(at.x, this.heightAt(at.x, at.z), at.z);
    this.ghost.rotation.y = Math.atan2(-at.x, -at.z);
    this.ghostMat.color.set(ok ? '#7fe08a' : '#ff6a5a');
    const g = BUILDINGS[kind].gather;
    this.ghostRange.visible = !!(g && g.range);
    if (g && g.range) {
      this.ghostRange.scale.setScalar(g.range);
      this.ghostRange.position.set(at.x, this.heightAt(at.x, at.z) + 0.8, at.z);
    }
    this.territoryRing.visible = true;
  }

  // A whole template's layout while it is being placed: one ghost for every building, in
  // the colour of whether it can be laid down now.
  showGhosts(list, ok) {
    this.ghosts ??= [];
    while (this.ghosts.length < list.length) {
      const m = new THREE.Mesh(undefined, this.ghostMat);
      this.scene.add(m);
      this.ghosts.push(m);
    }
    this.ghosts.forEach((m, i) => {
      const s = list[i];
      m.visible = !!s;
      if (!s) return;
      if (m.userData.kind !== s.kind) { m.geometry = this.geo(s.kind); m.userData.kind = s.kind; }
      m.material = s.miss ? this.missMat : this.ghostMat;
      m.position.set(s.x, this.heightAt(s.x, s.z), s.z);
      m.rotation.y = Math.atan2(-s.x, -s.z);
    });
    if (!list.length) return;
    this.ghostMat.color.set(ok ? '#7fe08a' : '#ff6a5a');
    this.territoryRing.visible = true;
  }

  update(selected) {
    const town = this.town;
    // While you storm a place its defenders wear their house's colour.
    if (town.battle) town.battle.sideColors = town.hostile ? [SIDE_COLORS[0], town.hostile.color] : null;
    // A place being stormed flies its owner's colours until it is yours.
    const flag = town.flagColor || SIDE_COLORS[0];
    if (flag !== this.flagShown) { this.flagShown = flag; this.flag.material.color.set(flag); }
    const level = this.wantedKeepLevel();
    if (level !== this.keepLevel) {
      this.keepLevel = level;
      this.keep.geometry = heartModel(town.kind, level);
      this.flag.position.y = this.heightAt(0, 0) + keepTop(this.keep.geometry) + 2.5;
    }
    for (const [b, o] of this.meshes) {
      if (!b.removed) continue;
      this.scene.remove(o.mesh, o.icon);
      this.meshes.delete(b);
    }
    for (const b of town.buildings) {
      let o = this.meshes.get(b);
      if (!o) {
        b.style ??= Math.floor(this.town.rand ? this.town.rand() * HOUSE_STYLES : Math.random() * HOUSE_STYLES);
        const mesh = new THREE.Mesh(this.geo(b.kind, b.style, b.level), this.siteMat);
        mesh.position.set(b.x, this.heightAt(b.x, b.z) - 0.1, b.z);
        mesh.rotation.y = b.angle;
        mesh.castShadow = mesh.receiveShadow = true;
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, transparent: true }));
        icon.scale.set(0.028, 0.028, 1);
        icon.renderOrder = 9;
        icon.position.set(b.x, this.heightAt(b.x, b.z) + (b.B.radius > 5 ? 6 : 7.5), b.z);
        this.scene.add(mesh, icon);
        this.meshes.set(b, o = { mesh, icon, state: null, warn: null, level: b.level || 1 });
        this.cover?.clear(b.x, b.z, b.B.radius + 1);
      }
      if ((b.level || 1) !== o.level) { o.level = b.level || 1; o.mesh.geometry = this.geo(b.kind, b.style, o.level); }
      if (b.state === 'site') o.mesh.scale.y = Math.max(0.08, b.progress);
      if (o.state !== b.state) {
        o.state = b.state;
        o.mesh.material = b.state === 'site' ? this.siteMat : b.state === 'ruined' ? this.ruinMat : this.mat;
        o.mesh.scale.y = b.state === 'ruined' ? 0.3 : b.state === 'site' ? o.mesh.scale.y : 1;
      }
      const warn = b.state === 'active' && /^(No workers|Waiting|Nothing)/.test(b.status);
      if (o.warn !== warn || !o.icon.material.map) {
        o.warn = warn;
        o.icon.material.map = this.icon(b, warn);
        o.icon.material.needsUpdate = true;
      }
      o.icon.material.opacity = b.state === 'active' ? 1 : 0.55;
    }

    this.selectRing.visible = !!selected;
    if (selected) {
      this.selectRing.scale.setScalar(selected.B.radius + 2);
      this.selectRing.position.set(selected.x, this.heightAt(selected.x, selected.z) + 0.5, selected.z);
    }

    // Villagers: a gentle bob when walking, a working rhythm when at a task. Rebels wear red.
    const d = this.dummy, P = this.people, c = this.color || (this.color = new THREE.Color());
    const cam = LOD.camera?.position, near2 = LOD.near * LOD.near;
    let n = 0, nl = 0, k = 0;
    const dt = Math.min(0.5, Math.max(0, town.time - (this.animAt ?? town.time)));   // anim (a frame at 4x is up to 0.4 s: town.js)
    this.animAt = town.time;
    for (const v of town.villagers) {
      if (v.hidden || v.state === 'soldier' || n + nl >= 600) continue;
      const bob = this.anim ? 0 : Math.abs(Math.sin(v.phase)) * 0.1;
      const clip = this.anim && villagerClip(v, dt);   // anim
      d.position.set(v.x, v.y + bob, v.z);
      d.rotation.set(0, v.yaw, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      if (P.gearLight && cam && d.position.distanceToSquared(cam) > near2) {
        const i = v.id % 600;
        P.gearLight.setMatrixAt(nl, d.matrix);
        P.clothLight.setMatrixAt(nl, d.matrix);
        P.clothLight.setColorAt(nl, v.state === 'rebel' ? REBEL : this.dyes[i]);
        P.gearLight.setColorAt(nl, this.skins[i]);
        if (clip) for (const m of [P.gearLight, P.clothLight]) setClip(m.geometry, nl, clip, v.animT);   // anim
        nl++;
      } else {
        const i = v.id % 600;
        P.gear.setMatrixAt(n, d.matrix);
        P.cloth.setMatrixAt(n, d.matrix);
        P.cloth.setColorAt(n, v.state === 'rebel' ? REBEL : this.dyes[i]);
        P.gear.setColorAt(n, this.skins[i]);
        if (clip) for (const m of [P.gear, P.cloth]) setClip(m.geometry, n, clip, v.animT);   // anim
        n++;
      }
      // Anything carried goes in a crate held in front, its contents showing over the rim.
      if (v.carry) {
        d.position.set(v.x + Math.sin(v.yaw) * 0.42, v.y + bob + 0.92, v.z + Math.cos(v.yaw) * 0.42);
        d.updateMatrix();
        P.crate.setMatrixAt(k, d.matrix);
        d.position.y += 0.4;
        d.updateMatrix();
        P.carry.setMatrixAt(k, d.matrix);
        P.carry.setColorAt(k, c.set(CARRY[v.carry] || '#ffffff'));
        k++;
      }
    }
    P.gear.count = P.cloth.count = n;
    if (P.gearLight) P.gearLight.count = P.clothLight.count = nl;
    P.crate.count = P.carry.count = k;
    this.updatePiles();
    fxFor(this.scene, this.heightAt).town(town, this.meshes);   // fx: scaffolds, dust, fire and smoke, chimneys
    for (const m of Object.values(P)) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (m.geometry.attributes.aAnim) m.geometry.attributes.aAnim.needsUpdate = true;   // anim
    }
  }

  updatePiles() {
    const d = this.dummy, town = this.town;
    let k = 0;
    for (const b of [town.keep, ...town.buildings]) {
      if (b.state !== 'active' || !b.store) continue;
      const total = Object.values(b.store).reduce((n, x) => n + x, 0);
      const max = b === town.keep ? 24 : b.B.storage ? 18 : 9;
      const count = Math.min(max, Math.ceil(total / 10 - 0.05));
      // Stacked beside the door, three to a row and up to three high.
      const a = b === town.keep ? 0.5 : b.angle, side = a + Math.PI / 2;
      const r = b === town.keep ? 13.5 : b.B.radius + 1.6;
      for (let i = 0; i < count && k < 1200; i++) {
        const col = i % 3, row = Math.floor(i / 3) % 2, level = Math.floor(i / 6);
        const off = 1.6 + col * 0.7, out = r + row * 0.55;
        const x = b.x + Math.sin(a) * out + Math.sin(side) * off, z = b.z + Math.cos(a) * out + Math.cos(side) * off;
        d.position.set(x, this.heightAt(x, z) + level * 0.44, z);
        d.rotation.set(0, a, 0);
        d.scale.setScalar(1.15);
        d.updateMatrix();
        this.piles.setMatrixAt(k++, d.matrix);
      }
    }
    d.scale.setScalar(1);
    this.piles.count = k;
    this.piles.instanceMatrix.needsUpdate = true;
  }

  buildingAt(p) {
    let best = null, bd = Infinity;
    for (const b of [...this.town.buildings, this.town.keep]) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < b.B.radius + 1.5 && d < bd) { bd = d; best = b; }
    }
    return best;
  }
}
