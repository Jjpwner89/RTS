// Draws the walls, towers, gates and ladders, siege engines and their stones, and the
// ghost of a wall being placed. Each thing looks for its baked model first (buildingModel:
// wall.stone, wall.wood, *.broken, tower.*, gate.* and gate.*.door, siege.ram,
// siege.mangonel(.arm), siege.trebuchet(.arm), siege.ladder, siege.stone) and otherwise
// uses the simple shapes below, built to the same sizes:
//   wall pieces 10 m long on x, thickness on z, outer face toward -z, base at y = 0;
//   towers centred; gates are a 10 m piece with a 5 m door; engines face +z;
//   the ladder is 8 m long along +z with its foot at the origin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, box, cyl, WOOD, DARK, STONE, STONE_DARK, METAL } from './view.js';
import { buildingModel } from './models.js';
import { MATERIALS, PIECE_MAX } from './walls.js';

const PALE = '#c9b38a', ROPE = '#b8a27a', MOSS = '#6f6a5c';

function stoneWall() {
  const M = MATERIALS.stone, parts = [part(box(10, M.walk, M.thick), STONE, { y: M.walk / 2 })];
  // Merlons along the outer edge, a low parapet on the inner.
  for (let i = 0; i < 6; i++) parts.push(part(box(1, M.height - M.walk, 0.5), STONE_DARK, { x: -4.2 + i * 1.68, y: M.walk + (M.height - M.walk) / 2, z: -M.thick / 2 + 0.25 }));
  parts.push(part(box(10, 0.5, 0.35), STONE_DARK, { y: M.walk + 0.25, z: M.thick / 2 - 0.17 }));
  return mergeGeometries(parts);
}
function woodWall() {
  const M = MATERIALS.wood, parts = [];
  for (let i = 0; i < 16; i++) {
    const h = M.height - (i % 2) * 0.3;
    parts.push(part(cyl(0.3, 0.32, h, 6), i % 3 ? WOOD : '#6a4c30', { x: -4.7 + i * 0.63, y: h / 2, z: -M.thick / 2 + 0.3 }));
  }
  parts.push(part(box(10, 0.15, M.thick - 0.4), '#8a6a48', { y: M.walk, z: 0.2 }));
  for (const x of [-4, -1.3, 1.3, 4]) parts.push(part(box(0.2, M.walk, 0.2), '#6a4c30', { x, y: M.walk / 2, z: M.thick / 2 - 0.2 }));
  return mergeGeometries(parts);
}
function rubble(material) {
  const c = material === 'stone' ? [STONE, STONE_DARK, MOSS] : [WOOD, '#6a4c30', DARK];
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const s = 0.6 + (i * 37 % 10) / 10;
    parts.push(part(box(s * 1.4, s * 0.7, s), c[i % 3], { x: -4.5 + (i * 0.7) % 9, y: s * 0.3, z: ((i * 53) % 10) / 10 * 2 - 1, ry: i }));
  }
  if (material === 'stone') parts.push(part(box(2, 1.6, 2.4), STONE, { x: -4.2, y: 0.8 }), part(box(2, 1.2, 2.4), STONE, { x: 4.2, y: 0.6 }));
  return mergeGeometries(parts);
}
function stoneTower() {
  const M = MATERIALS.stone, R = M.towerR, parts = [part(cyl(R, R * 1.06, M.towerTop, 10), STONE, { y: M.towerTop / 2 })];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    parts.push(part(box(1.1, 1.4, 0.6), STONE_DARK, { x: Math.sin(a) * (R - 0.3), y: M.towerTop + 0.7, z: Math.cos(a) * (R - 0.3), ry: a }));
  }
  return mergeGeometries(parts);
}
function woodTower() {
  const M = MATERIALS.wood, R = M.towerR, parts = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(cyl(0.3, 0.35, M.towerTop + 1.5, 6), WOOD, { x: x * (R - 0.6), y: (M.towerTop + 1.5) / 2, z: z * (R - 0.6) }));
  parts.push(part(box(R * 2, 0.3, R * 2), '#8a6a48', { y: M.towerTop }));
  parts.push(part(box(R * 2, 1.1, 0.15), '#7a5a3a', { y: M.towerTop + 0.7, z: -R + 0.1 }), part(box(R * 2, 1.1, 0.15), '#7a5a3a', { y: M.towerTop + 0.7, z: R - 0.1 }));
  parts.push(part(box(0.15, 1.1, R * 2), '#7a5a3a', { x: -R + 0.1, y: M.towerTop + 0.7 }), part(box(0.15, 1.1, R * 2), '#7a5a3a', { x: R - 0.1, y: M.towerTop + 0.7 }));
  const roof = new THREE.ConeGeometry(R * 1.25, 2.4, 4); roof.rotateY(Math.PI / 4);
  parts.push(part(roof, '#6d5a48', { y: M.towerTop + 3.4 }));
  return mergeGeometries(parts);
}
function gateFrame(material) {
  const M = MATERIALS[material], col = material === 'stone' ? STONE : WOOD, dark = material === 'stone' ? STONE_DARK : '#6a4c30';
  const h = M.height + (material === 'stone' ? 1.5 : 1);
  return mergeGeometries([
    part(box(2.6, h, M.thick + 0.8), col, { x: -3.7, y: h / 2 }),
    part(box(2.6, h, M.thick + 0.8), col, { x: 3.7, y: h / 2 }),
    part(box(5.2, h - M.walk + 0.5, M.thick), dark, { y: M.walk + (h - M.walk + 0.5) / 2 - 0.5 }),
  ]);
}
function gateDoor(material) {
  const h = MATERIALS[material].walk - 0.2;
  const parts = [part(box(5, h, 0.3), material === 'stone' ? '#5e4228' : '#6a4c30', { y: h / 2 })];
  for (const y of [0.8, h / 2, h - 0.8]) parts.push(part(box(5.05, 0.2, 0.35), METAL, { y }));
  return mergeGeometries(parts);
}
function ram() {
  const parts = [part(box(2.6, 0.25, 6), '#6a4c30', { y: 2.8, z: -3 })];
  const roof = new THREE.CylinderGeometry(1.6, 1.6, 6, 3, 1, false, 0, Math.PI * 2); roof.rotateX(Math.PI / 2); roof.rotateZ(Math.PI);
  parts.push(part(roof, '#7a5a3a', { y: 2.4, z: -3 }));
  parts.push(part(cyl(0.35, 0.35, 6.4, 8), '#5e4228', { y: 1.3, z: -2.8, rx: Math.PI / 2 }));
  parts.push(part(cyl(0.42, 0.42, 0.6, 8), METAL, { y: 1.3, z: 0.3, rx: Math.PI / 2 }));
  for (const z of [-0.5, -5.5]) for (const x of [-1.2, 1.2]) parts.push(part(cyl(0.45, 0.45, 0.25, 10), DARK, { x, y: 0.45, z, rz: Math.PI / 2 }));
  for (const z of [-0.3, -5.7]) for (const x of [-1.2, 1.2]) parts.push(part(box(0.2, 2.6, 0.2), WOOD, { x, y: 1.4, z }));
  return mergeGeometries(parts);
}
function mangonelBase() {
  const parts = [part(box(2.6, 0.4, 4), WOOD, { y: 0.6 }), part(box(0.3, 1.8, 0.3), WOOD, { x: -1, y: 1.5, z: 0.4 }), part(box(0.3, 1.8, 0.3), WOOD, { x: 1, y: 1.5, z: 0.4 }),
    part(box(2.4, 0.3, 0.3), WOOD, { y: 2.3, z: 0.4 })];
  for (const z of [-1.5, 1.5]) for (const x of [-1.35, 1.35]) parts.push(part(cyl(0.5, 0.5, 0.2, 10), DARK, { x, y: 0.5, z, rz: Math.PI / 2 }));
  return mergeGeometries(parts);
}
function mangonelArm() {
  // Pivot at the origin; the arm lies back along -z at rest and swings up over +z.
  return mergeGeometries([part(box(0.25, 0.25, 3.4), '#6a4c30', { z: -1.6 }), part(box(0.8, 0.3, 0.8), DARK, { z: -3.2, y: 0.1 })]);
}
function trebuchetBase() {
  const parts = [part(box(4, 0.5, 7), WOOD, { y: 0.25 })];
  for (const x of [-1.4, 1.4]) {
    parts.push(part(box(0.35, 7.5, 0.35), WOOD, { x, y: 3.8, z: -1.2, rx: 0.25 }));
    parts.push(part(box(0.35, 7.5, 0.35), WOOD, { x, y: 3.8, z: 1.2, rx: -0.25 }));
  }
  parts.push(part(box(3.2, 0.4, 0.4), DARK, { y: 7.2 }));
  return mergeGeometries(parts);
}
function trebuchetArm() {
  return mergeGeometries([part(box(0.35, 0.35, 11), '#6a4c30', { z: -3 }), part(box(1.6, 1.6, 1.6), STONE_DARK, { z: 2.5, y: -1 }), part(box(0.1, 0.1, 3), ROPE, { z: -8.5, y: -1.5 })]);
}
function ladder() {
  const parts = [part(box(0.12, 0.12, 8), WOOD, { x: -0.35, z: 4 }), part(box(0.12, 0.12, 8), WOOD, { x: 0.35, z: 4 })];
  for (let i = 0; i < 14; i++) parts.push(part(box(0.7, 0.07, 0.07), PALE, { z: 0.4 + i * 0.55 }));
  return mergeGeometries(parts);
}

const SHAPES = {
  'wall.stone': stoneWall, 'wall.wood': woodWall, 'wall.stone.broken': () => rubble('stone'), 'wall.wood.broken': () => rubble('wood'),
  'tower.stone': stoneTower, 'tower.wood': woodTower, 'tower.stone.broken': () => rubble('stone'), 'tower.wood.broken': () => rubble('wood'),
  'gate.stone': () => gateFrame('stone'), 'gate.wood': () => gateFrame('wood'), 'gate.stone.door': () => gateDoor('stone'), 'gate.wood.door': () => gateDoor('wood'),
  'siege.ram': ram, 'siege.mangonel': mangonelBase, 'siege.mangonel.arm': mangonelArm, 'siege.trebuchet': trebuchetBase, 'siege.trebuchet.arm': trebuchetArm,
  'siege.ladder': ladder,
};
// Where each arm pivots on its engine. The built-in arms are made around their pivot; the baked
// ones are modelled in place on the engine, so they are shifted back by the pivot to turn about it.
const ARM_AT = { mangonel: { y: 2.3, z: 0.4 }, trebuchet: { y: 7.2, z: 0 } };
const BAKED_PIVOT = { mangonel: { y: 0.75, z: 1.27 }, trebuchet: { y: 6.71, z: 0.88 } };
const ENGINE_BACK = { ram: 0, mangonel: 1.6, trebuchet: 3 };

export class SiegeView {
  constructor(scene, battle, heightAt) {
    this.scene = scene;
    this.battle = battle;
    this.heightAt = heightAt;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.siteMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.45 });
    this.geos = {};
    this.group = new THREE.Group();
    scene.add(this.group);
    this.version = -1;
    this.items = new Map();       // structure -> mesh(es)
    this.engines = new Map();     // regiment -> mesh group
    this.ladderMeshes = new Map();
    this.ghost = new THREE.Group();
    scene.add(this.ghost);
    this.ghostMats = [true, false].map(ok => new THREE.MeshBasicMaterial({ color: ok ? '#7fe08a' : '#ff6a5a', transparent: true, opacity: 0.45, depthWrite: false }));
    this.highlight = null;
    const stoneGeo = buildingModel('siege.stone') || new THREE.IcosahedronGeometry(0.45, 0);
    this.stoneMesh = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ color: '#8d877b', flatShading: true }), 200);
    this.stoneMesh.count = 0; this.stoneMesh.frustumCulled = false;
    scene.add(this.stoneMesh);
    this.dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#b5a98f', transparent: true, opacity: 0.45, depthWrite: false }), 60);
    this.dust.count = 0; this.dust.frustumCulled = false;
    scene.add(this.dust);
    this.dummy = new THREE.Object3D();
    this.dummy.rotation.order = 'YXZ';
  }

  geo(name) {
    if (!(name in this.geos)) this.geos[name] = buildingModel(name) || SHAPES[name]?.() || null;
    return this.geos[name];
  }

  mesh(name, mat = this.mat) {
    const g = this.geo(name);
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // Rebuild the wall meshes when the walls change; they change rarely.
  syncWalls() {
    const W = this.battle.walls;
    if (W.version === this.version) return;
    this.version = W.version;
    for (const o of this.items.values()) this.group.remove(o.root);
    this.items.clear();
    for (const p of W.pieces) {
      const root = new THREE.Group();
      const name = p.state === 'broken' ? `${p.gate ? 'gate' : 'wall'}.${p.material}.broken` : `${p.gate ? 'gate' : 'wall'}.${p.material}`;
      const body = this.mesh(this.geos[name] === null ? `wall.${p.material}.broken` : name, p.state === 'site' ? this.siteMat : this.mat)
        || this.mesh(`wall.${p.material}${p.state === 'broken' ? '.broken' : ''}`);
      if (body) root.add(body);
      let door = null;
      if (p.gate && p.state !== 'broken') { door = this.mesh(`gate.${p.material}.door`); if (door) root.add(door); }
      root.position.set(p.x, p.base, p.z);
      const home = this.battle.fortHome(p.side);
      const out = W.outward(p, home);
      let yaw = p.angle - Math.PI / 2;
      // Local -z must point outward.
      if (-Math.sin(yaw) * out.x - Math.cos(yaw) * out.z < 0) yaw += Math.PI;
      root.rotation.y = yaw;
      root.scale.set(p.len / PIECE_MAX, p.state === 'site' ? 0.15 + 0.85 * p.progress : 1, 1);
      this.group.add(root);
      this.items.set(p, { root, door, open: 0 });
    }
    for (const n of W.nodes) {
      const t = n.tower;
      if (!t) continue;
      const name = `tower.${t.material}${t.state === 'broken' ? '.broken' : ''}`;
      const root = new THREE.Group();
      const body = this.mesh(name, t.state === 'site' ? this.siteMat : this.mat);
      if (body) root.add(body);
      root.position.set(t.x, t.base, t.z);
      root.scale.y = t.state === 'site' ? 0.15 + 0.85 * t.progress : 1;
      this.group.add(root);
      this.items.set(t, { root });
    }
  }

  update(dt = 1 / 60) {
    const b = this.battle, W = b.walls;
    // Sites grow as they are built; redraw now and then while any are going up.
    if (W.pieces.some(p => p.state === 'site') && Math.floor(b.time * 2) !== this.siteTick) { this.siteTick = Math.floor(b.time * 2); this.version = -1; }
    this.syncWalls();
    this.updateGates(dt);
    this.updateLadders();
    this.updateEngines();
    this.updateStones();
  }

  // Doors swing up for their own men, and stay open once forced.
  updateGates(dt) {
    const b = this.battle;
    for (const [p, it] of this.items) {
      if (!it.door) continue;
      let want = p.forced ? 1 : 0;
      if (!want) b.forNear(p.x, p.z, 9, s => { if (s.reg.side === p.side && s.level === 0 && Math.hypot(s.x - p.x, s.z - p.z) < 9) want = 1; });
      it.open += (want - it.open) * Math.min(1, dt * 3);
      it.door.position.y = it.open * (p.M.walk - 0.6);
      it.door.scale.y = 1 - it.open * 0.85;
    }
  }

  updateLadders() {
    const W = this.battle.walls, seen = new Set();
    for (const l of W.ladders) {
      seen.add(l);
      let m = this.ladderMeshes.get(l);
      if (!m) {
        m = this.mesh('siege.ladder');
        if (!m) continue;
        m.rotation.order = 'YXZ';
        this.group.add(m);
        this.ladderMeshes.set(l, m);
        const fy = this.heightAt(l.foot.x, l.foot.z), ty = l.piece.base + l.piece.M.height + 0.3;
        const dx = l.x - l.foot.x, dz = l.z - l.foot.z, hor = Math.hypot(dx, dz);
        // Lean against the outer face: the top rests a little short of the walkway's middle.
        const len = Math.hypot(hor * 0.7, ty - fy);
        m.position.set(l.foot.x, fy, l.foot.z);
        m.rotation.y = Math.atan2(dx, dz);
        m.rotation.x = -Math.atan2(ty - fy, hor * 0.7);
        m.scale.set(1, 1, len / 8);
      }
    }
    for (const [l, m] of this.ladderMeshes) if (!seen.has(l)) { this.group.remove(m); this.ladderMeshes.delete(l); }
  }

  updateEngines() {
    const b = this.battle, seen = new Set();
    for (const r of b.regs) {
      if (!r.engine || r.gone && !r.engine.wrecked) continue;
      const kind = r.engine.kind;
      seen.add(r);
      let e = this.engines.get(r);
      if (!e) {
        const root = new THREE.Group();
        root.rotation.order = 'YXZ';
        let arm = null;
        if (kind === 'ladder') {
          // Ladders carried shoulder-high until they go up.
          for (let i = 0; i < Math.max(1, Math.round(r.initial / r.engine.per)); i++) {
            const l = this.mesh('siege.ladder');
            if (l) { l.rotation.x = 0; l.position.set((i - 1) * 2.2, 1.5, -6.5); root.add(l); }
          }
        } else {
          const body = this.mesh(`siege.${kind}`);
          if (body) root.add(body);
          if (ARM_AT[kind] && !buildingModel(`siege.${kind}`) || buildingModel(`siege.${kind}.arm`)) {
            const m = this.mesh(`siege.${kind}.arm`);
            if (m) {
              const baked = !!buildingModel(`siege.${kind}.arm`), at = baked ? BAKED_PIVOT[kind] : ARM_AT[kind];
              arm = new THREE.Group();
              arm.position.set(0, at.y, at.z);
              if (baked) m.position.set(0, -at.y, -at.z);
              arm.add(m);
              root.add(arm);
            }
          }
        }
        this.group.add(root);
        e = { root, arm, kind };
        this.engines.set(r, e);
      }
      const E = r.engine;
      // The engine sits where its crew push it: at the front of the regiment's block.
      const back = ENGINE_BACK[kind] || 0;
      const x = r.x - Math.sin(r.angle) * back, z = r.z - Math.cos(r.angle) * back;
      e.root.position.set(x, this.heightAt(x, z), z);
      e.root.rotation.y = r.angle;
      if (kind === 'ladder') e.root.visible = !E.ladders.length && !r.gone;
      if (E.wrecked) { e.root.rotation.z = 0.35; e.root.position.y -= 0.4; }
      const since = b.time - (E.swing ?? -99);
      if (kind === 'ram' && e.root.children[0]) e.root.children[0].position.z = since < 0.6 ? Math.sin(since / 0.6 * Math.PI) * 0.8 : 0;
      if (e.arm) {
        const fire = since < 0.5 ? since / 0.5 : since < 3 ? 1 - (since - 0.5) / 2.5 : 0;
        e.arm.rotation.x = fire * (kind === 'trebuchet' ? 2.2 : 1.5);
      }
    }
    for (const [r, e] of this.engines) if (!seen.has(r)) { this.group.remove(e.root); this.engines.delete(r); }
  }

  updateStones() {
    const b = this.battle, d = this.dummy;
    let n = 0;
    for (const s of b.stones) {
      if (n >= 200) break;
      const k = s.t / s.T;
      d.position.set(s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k + 4 * s.h * k * (1 - k), s.z0 + (s.z1 - s.z0) * k);
      d.rotation.set(k * 6, k * 4, 0);
      d.scale.setScalar(s.kind === 'trebuchet' ? 1.5 : 1);
      d.updateMatrix();
      this.stoneMesh.setMatrixAt(n++, d.matrix);
    }
    this.stoneMesh.count = n;
    this.stoneMesh.instanceMatrix.needsUpdate = true;
    let m = 0;
    for (const p of b.impacts || []) {
      const age = b.time - p.time;
      if (age > 1.6 || age < 0 || m >= 60) continue;
      d.position.set(p.x, this.heightAt(p.x, p.z) + 0.5 + age, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar((p.big ? 3 : 2) * (0.5 + age) * (1 - age / 1.8));
      d.updateMatrix();
      this.dust.setMatrixAt(m++, d.matrix);
    }
    this.dust.count = m;
    this.dust.instanceMatrix.needsUpdate = true;
  }

  // The ghost of a wall, tower or gate about to be placed. plan: { kind, ok, pts | x,z | piece, material }.
  showPlan(plan) {
    for (const c of this.ghost.children) c.geometry.dispose();
    this.ghost.clear();
    if (!plan) return;
    const mat = this.ghostMats[plan.ok ? 0 : 1], M = MATERIALS[plan.material || 'wood'];
    if (plan.kind === 'line' && plan.pts?.length > 1) {
      for (let i = 0; i < plan.pts.length - 1; i++) {
        const a = plan.pts[i], c = plan.pts[i + 1], len = Math.hypot(c.x - a.x, c.z - a.z);
        const g = new THREE.BoxGeometry(len, M.height, M.thick);
        const m = new THREE.Mesh(g, mat);
        const x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
        m.position.set(x, this.heightAt(x, z) + M.height / 2, z);
        m.rotation.y = Math.atan2(c.x - a.x, c.z - a.z) - Math.PI / 2;
        this.ghost.add(m);
      }
    } else if (plan.kind === 'tower') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(M.towerR, M.towerR, M.towerTop + 1, 10), mat);
      m.position.set(plan.x, this.heightAt(plan.x, plan.z) + (M.towerTop + 1) / 2, plan.z);
      this.ghost.add(m);
    } else if ((plan.kind === 'gate' || plan.kind === 'select') && plan.piece) {
      const p = plan.piece;
      const tall = p.kind === 'tower' ? p.M.towerTop + 1.5 : p.M.height + 0.6;
      const g = p.kind === 'tower' ? new THREE.CylinderGeometry(p.M.towerR + 0.4, p.M.towerR + 0.4, tall, 10) : new THREE.BoxGeometry(p.len + 0.4, tall, p.M.thick + 0.6);
      const m = new THREE.Mesh(g, plan.kind === 'select' ? new THREE.MeshBasicMaterial({ color: '#ffd970', transparent: true, opacity: 0.25, depthWrite: false }) : mat);
      m.position.set(p.x, p.base + tall / 2, p.z);
      if (p.kind !== 'tower') m.rotation.y = p.angle - Math.PI / 2;
      this.ghost.add(m);
    }
  }
}
