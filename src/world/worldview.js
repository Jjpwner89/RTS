// Draws the world map: hills and woods, the roads, a small keep and houses for each
// place with its owner's flag, armies as little marching columns, and name labels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHeight, drawGround, plantTrees, drawTrees } from '../terrain.js';
import { part, box, keepModel, keepTop, castleModel, houseModel, SKIN, WOOD } from '../view.js';
import { ownerOf, FACTIONS, NEUTRAL, headcount } from './world.js';
import { KINDS, REALM_RADIUS } from './realm.js';

export const WORLD_HALF = REALM_RADIUS + 140;
const EXTENT = WORLD_HALF + 140;      // woods reach this far
const GROUND = WORLD_HALF * 2.2;      // the ground runs on past them so the edge never shows

const nearSegment = (x, z, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
};

// A column of marching men, coloured per side by tinting the white cloth.
function columnModel() {
  const parts = [];
  for (let r = 0; r < 3; r++) {
    for (let f = -1; f <= 1; f++) {
      const x = f * 2.2, z = -r * 2.6;
      parts.push(part(box(1.3, 2.2, 0.9), '#ffffff', { x, y: 1.1, z }));
      parts.push(part(box(0.7, 0.7, 0.7), SKIN, { x, y: 2.6, z }));
      parts.push(part(box(0.15, 4.2, 0.15), WOOD, { x: x + 0.8, y: 2.1, z }));
    }
  }
  parts.push(part(box(0.25, 8, 0.25), WOOD, { y: 4, z: 1.6 }));
  return mergeGeometries(parts);
}

export class WorldView {
  constructor(stage, world) {
    this.world = world;
    this.scene = stage.newScene({ fog: [1300, 3000] });
    this.heightAt = makeHeight(world.seed, world.pois.map(p => ({ x: p.x, z: p.z })));
    const h = this.heightAt;
    drawGround(this.scene, h, world.seed, { extent: GROUND, seg: 320 });
    const trees = plantTrees(world.seed, (x, z) => world.pois.some(p => Math.hypot(x - p.x, z - p.z) < 75)
      || world.roads.some(r => nearSegment(x, z, r.a, r.b) < 12), 0.52, 6500, EXTENT);
    for (const t of trees.spots) { t.k *= 1.8; t.tall *= 1.8; }
    drawTrees(this.scene, h, trees);
    for (const r of world.roads) this.scene.add(this.road(r.a, r.b));

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.places = new Map();
    // a lord's seat is a castle; a village has its keep
    const keep = keepModel(), castle = castleModel(), houses = [0, 1, 2].map(houseModel);
    for (const p of world.pois) {
      const g = new THREE.Group();
      // Seats, castles and the royal city are castles; bandit camps are small.
      const big = p.seat !== undefined || p.kind === 'castle' || p.kind === 'crown';
      const k = new THREE.Mesh(big ? castle : keep, this.mat);
      const scale = p.kind === 'crown' ? 1.7 : big ? 1.3 : p.kind === 'camp' ? 0.7 : 1.1;
      k.scale.setScalar(scale);
      g.add(k);
      const n = p.kind === 'crown' ? 12 : p.kind === 'camp' ? 0 : big ? 8 : 5;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + 0.4, r = 30 + (i % 2) * 8;
        const m = new THREE.Mesh(houses[i % 3], this.mat);
        m.position.set(Math.sin(a) * r, h(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r) - h(p.x, p.z) - 0.2, Math.cos(a) * r);
        m.rotation.y = a + Math.PI;
        m.scale.setScalar(1.6);
        g.add(m);
      }
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
      flag.position.set(4.5, scale * keepTop(k.geometry) + 4, 0);
      g.add(flag);
      g.position.set(p.x, h(p.x, p.z) - 0.5, p.z);
      g.traverse(o => { o.castShadow = o.receiveShadow = true; });
      this.scene.add(g);
      this.places.set(p, { group: g, flag, owner: undefined, label: null });
    }

    this.columnGeo = columnModel();
    this.armies = new Map();
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.sin(i / 48 * Math.PI * 2), 0, Math.cos(i / 48 * Math.PI * 2)))),
      new THREE.LineBasicMaterial({ color: '#ffd970', depthTest: false, transparent: true }));
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    this.pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#ffd970', dashSize: 6, gapSize: 4, depthTest: false, transparent: true }));
    this.pathLine.renderOrder = 5;
    this.scene.add(this.ring, this.pathLine);

    this.labelsEl = document.getElementById('world-labels');
    this.labelsEl.innerHTML = '';
  }

  // A dirt track laid over the hills.
  road(a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(len / 6);
    const sx = (b.z - a.z) / len, sz = -(b.x - a.x) / len, w = 3.5;
    const pos = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const s of [-1, 1]) {
        const px = x + sx * w * s, pz = z + sz * w * s;
        pos.push(px, this.heightAt(px, pz) + 0.35, pz);
      }
    }
    const idx = [];
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#8a7552', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = true;
    return m;
  }

  label(cls) {
    const el = document.createElement('div');
    el.className = `wlabel ${cls}`;
    this.labelsEl.append(el);
    return el;
  }

  // Screen positions of everything clickable, refreshed each frame for picking.
  update(camera, selected) {
    const w = this.world, v = new THREE.Vector3();
    const rect = this.labelsEl.getBoundingClientRect();
    const toScreen = (x, y, z) => {
      v.set(x, y, z).project(camera);
      return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, behind: v.z > 1 };
    };
    this.screen = [];

    for (const [p, o] of this.places) {
      // Fog of war: places you have never seen are unknown; others show what you last saw.
      const shown = p.visible ? p.owner : p.seen ? p.known.owner : undefined;
      const own = shown === undefined ? { name: 'Unknown', color: '#8a8478' } : shown === null ? NEUTRAL : FACTIONS[shown];
      if (o.owner !== shown) { o.owner = shown; o.flag.material.color.set(own.color); }
      if (!o.label) o.label = this.label('place');
      const s = toScreen(p.x, this.heightAt(p.x, p.z) + 48, p.z);
      o.label.style.display = s.behind ? 'none' : '';
      o.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const men = p.town ? p.town.garrison().reduce((n, r) => n + r.alive, 0) : p.visible ? headcount(p.garrison) : p.known?.men;
      const alarm = p.town?.underAttack ? ' ⚔️' : '';
      const K = KINDS[p.kind];
      const html = !p.seen ? `<b style="color:${own.color}">${K.icon} ${p.name}</b><small>unexplored</small>`
        : `<b style="color:${own.color}">${K.icon} ${p.name}${alarm}</b><small>${shown === null ? `free ${K.name.toLowerCase()}` : own.name} · ${p.town ? '' : '~'}${men} men${p.visible ? '' : ' (last seen)'}</small>`;
      if (o.html !== html) { o.html = html; o.label.innerHTML = html; }
      o.label.classList.toggle('selected', selected === p);
      this.screen.push({ kind: 'place', it: p, x: s.x, y: s.y + 30, r: 46 });
    }

    for (const [a, o] of this.armies) {
      if (!a.gone) continue;
      this.scene.remove(o.mesh);
      o.mesh.material.dispose();
      o.label.remove();
      this.armies.delete(a);
    }
    for (const a of w.armies) {
      let o = this.armies.get(a);
      if (!o) {
        const mat = this.mat.clone();
        mat.color.set(FACTIONS[a.side].color).lerp(new THREE.Color('#ffffff'), 0.15);
        const mesh = new THREE.Mesh(this.columnGeo, mat);
        mesh.scale.setScalar(1.6);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.armies.set(a, o = { mesh, label: this.label(`army side${a.side ? 1 : 0}`) });
        o.label.style.borderColor = FACTIONS[a.side].color;
      }
      // Armies out of sight are hidden.
      o.mesh.visible = a.visible;
      if (!a.visible) { o.label.style.display = 'none'; continue; }
      // Waiting armies stand a little off the keep so both can be seen.
      const off = a.at && !a.path.length ? 24 : 0;
      const x = a.x + off, z = a.z + off;
      o.mesh.position.set(x, this.heightAt(x, z), z);
      o.mesh.rotation.y = a.heading;
      const s = toScreen(x, this.heightAt(x, z) + 16, z);
      o.label.style.display = s.behind ? 'none' : '';
      o.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const html = `${a.retreating ? '🏳️' : a.mode === 'raid' ? '🔥' : a.mode === 'siege' ? '🏰' : '⚔️'} ${headcount(a.units)}`;
      if (o.html !== html) { o.html = html; o.label.innerHTML = html; }
      o.label.classList.toggle('selected', selected === a);
      this.screen.push({ kind: 'army', it: a, x: s.x, y: s.y + 8, r: 30 });
    }

    // A ring under whatever is selected, and the road a selected army will take.
    const it = selected && !selected.gone ? selected : null;
    this.ring.visible = !!it;
    this.pathLine.visible = false;
    if (it) {
      const isArmy = this.armies.has(it);
      const x = isArmy && it.at && !it.path.length ? it.x + 24 : it.x, z = isArmy && it.at && !it.path.length ? it.z + 24 : it.z;
      this.ring.position.set(x, this.heightAt(x, z) + 1, z);
      this.ring.scale.setScalar(isArmy ? 16 : 60);
      if (isArmy && it.path.length) {
        const pts = [it, ...it.path].map(q => new THREE.Vector3(q.x, this.heightAt(q.x, q.z) + 2, q.z));
        this.pathLine.geometry.dispose();
        this.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        this.pathLine.computeLineDistances();
        this.pathLine.visible = true;
      }
    }
  }

  // The army or place under a screen point (canvas pixels), armies first.
  pick(x, y) {
    let best = null, bd = Infinity;
    for (const s of this.screen || []) {
      const d = Math.hypot(s.x - x, s.y - y) - (s.kind === 'army' ? 20 : 0);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  hideLabels(hidden) { this.labelsEl.hidden = hidden; }
}
