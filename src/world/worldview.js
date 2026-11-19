// Draws the world map: hills and woods, the roads, a small keep and houses for each
// place with its owner's flag, armies as little marching columns, and name labels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHeight, drawGround, plantTrees, drawTrees } from '../terrain.js';
import { part, box, keepModel, keepTop, castleModel, fortModel, houseModel, SKIN, WOOD } from '../view.js';
import { unitModel, buildingModel, HOUSE_STYLES } from '../models.js';
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

// An army on the map: a small block of soldiers under a banner. Gear keeps its colours; cloth takes the side's.
function armyModel() {
  const u = unitModel('spear');
  if (!u) return null;
  const gear = [], cloth = [];
  for (let r = 0; r < 3; r++) for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 1.5, z = -r * 1.6;
    gear.push(u.gearLight.clone().translate(x, 0, z));
    cloth.push(u.clothLight.clone().translate(x, 0, z));
  }
  const pole = part(box(0.12, 5, 0.12), WOOD, { x: -3.2, y: 2.5, z: 1 });
  const banner = part(box(0.06, 1.4, 1.6), '#ffffff', { x: -3.2, y: 4.2, z: 0.2 });
  const plain = g => { const o = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(a)) o.deleteAttribute(a); return o; };
  return { gear: mergeGeometries([...gear, pole].map(plain)), cloth: mergeGeometries([...cloth, banner].map(plain)) };
}

// A column of marching men, coloured per side by tinting the white cloth (used when the baked models are missing).
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
    const trees = plantTrees(world.seed, (x, z) => world.pois.some(p => Math.hypot(x - p.x, z - p.z) < (p.kind === 'crown' ? 175 : 80))
      || world.roads.some(r => nearSegment(x, z, r.a, r.b) < 12), 0.52, 6500, EXTENT);
    for (const t of trees.spots) { t.k *= 1.8; t.tall *= 1.8; }
    drawTrees(this.scene, h, trees);
    for (const r of world.roads) this.scene.add(this.road(r.a, r.b));

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.places = new Map();
    for (const p of world.pois) {
      const g = new THREE.Group();
      g.position.set(p.x, h(p.x, p.z) - 0.5, p.z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
      g.add(flag);
      this.scene.add(g);
      const o = { group: g, flag, owner: undefined, label: null, look: null, parts: null };
      this.places.set(p, o);
      this.dress(p, o);
    }
    this.fog = this.makeFog();

    this.columnGeo = columnModel();
    this.armyGeo = armyModel();
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
    this.updateFog();

    for (const [p, o] of this.places) {
      if (o.look !== this.lookKey(p)) this.dress(p, o);
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
      o.mesh.traverse(m => { if (m.isMesh && m.material !== this.mat) m.material.dispose(); });
      o.label.remove();
      this.armies.delete(a);
    }
    for (const a of w.armies) {
      let o = this.armies.get(a);
      if (!o) {
        const colour = new THREE.Color(FACTIONS[a.side].color);
        const mesh = new THREE.Group();
        if (this.armyGeo) {
          const cloth = this.mat.clone(); cloth.color.copy(colour);
          mesh.add(new THREE.Mesh(this.armyGeo.gear, this.mat), new THREE.Mesh(this.armyGeo.cloth, cloth));
          mesh.scale.setScalar(2.6);
          // a siege train follows an army laying siege
          const engine = buildingModel('siege.trebuchet');
          if (engine) { const t = new THREE.Mesh(engine, this.mat); t.position.set(7, 0, -6); t.scale.setScalar(0.45); t.visible = false; mesh.add(t); mesh.userData.engine = t; }
        } else {
          const mat = this.mat.clone();
          mat.color.copy(colour).lerp(new THREE.Color('#ffffff'), 0.15);
          mesh.add(new THREE.Mesh(this.columnGeo, mat));
          mesh.scale.setScalar(1.6);
        }
        mesh.traverse(m => { m.castShadow = true; });
        this.scene.add(mesh);
        this.armies.set(a, o = { mesh, label: this.label(`army side${a.side ? 1 : 0}`) });
        o.label.style.borderColor = FACTIONS[a.side].color;
      }
      if (o.mesh.userData.engine) o.mesh.userData.engine.visible = a.mode === 'siege';
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

  // ---- places: each kind has its own look, and it grows with the place's level ----

  lookKey(p) {
    const level = Math.max(1, Math.min(4, (p.visible ? p.eco?.level : p.known?.level) || p.known?.level || 1));
    return `${p.kind}:${p.seat !== undefined}:${level}:${p.seen}`;
  }

  dress(p, o) {
    o.look = this.lookKey(p);
    const level = +o.look.split(':')[2], seat = p.seat !== undefined, h = this.heightAt;
    if (o.parts) o.group.remove(o.parts);
    const S = 1.5, g = new THREE.Group();
    g.scale.setScalar(S);
    o.parts = g;
    o.group.add(g);
    // Places you have never seen show nothing under the fog.
    g.visible = p.seen;
    const base = h(p.x, p.z) - 0.5;
    let seed = (p.seed || 7) % 2147483646 + 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const put = (geo, x = 0, z = 0, ry = 0, s = 1, mat = this.mat) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, (h(p.x + x * S, p.z + z * S) - 0.5 - base) / S - 0.15, z);
      m.rotation.y = ry;
      m.scale.setScalar(s);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const cache = this.geoCache || (this.geoCache = new Map());
    const once = (key, make) => cache.get(key) || cache.set(key, make()).get(key);
    const keep = l => once('keep' + l, () => keepModel({ palisade: false, level: l }));
    const house = () => { const st = Math.floor(rand() * HOUSE_STYLES); return (level >= 4 && buildingModel(`house.${st}.3`)) || (level >= 3 && buildingModel(`house.${st}.2`)) || houseModel(st); };
    // roads leaving this place, as angles
    const roads = this.world.roads.map(r => Math.hypot(r.a.x - p.x, r.a.z - p.z) < 1 ? r.b : Math.hypot(r.b.x - p.x, r.b.z - p.z) < 1 ? r.a : null)
      .filter(Boolean).map(q => Math.atan2(q.x - p.x, q.z - p.z));
    const nearRoad = (a, by = 0.28) => roads.some(r => Math.abs(Math.atan2(Math.sin(a - r), Math.cos(a - r))) < by);
    const ring = (n, r0, r1, a0 = 0.4, avoid = []) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * Math.PI * 2, r = i % 2 ? r1 : r0;
        if (nearRoad(a, 0.16) || avoid.some(b => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.5)) continue;
        put(house(), Math.sin(a) * r, Math.cos(a) * r, a + Math.PI);
      }
    };
    const out = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
    let centre;
    switch (seat ? 'seat' : p.kind) {
      case 'crown':
        centre = put(castleModel(4), 0, 0, 0, 1.2);
        put(buildingModel('market.3'), ...out(2.4, 30), 2.4);
        put(buildingModel('monastery'), ...out(4.2, 33), 4.2 + Math.PI, 0.8);
        ring(14, 30, 38, 0.2, [2.4, 4.2]);
        ring(16, 46, 52, 0.5);
        this.cityWall(put, roads, 62);
        ring(10, 72, 80, 0.1);
        break;
      case 'seat':
        centre = put(castleModel(Math.min(4, level)), 0, 0, 0, 1);
        ring(6 + level * 2, 30, 38);
        break;
      case 'castle':
        centre = put(castleModel(Math.min(4, level + 1)), 0, 0, 0, 0.95);
        ring(5, 30, 36);
        break;
      case 'market':
        centre = put(keep(level), 0, 0, 0, 0.75);
        put(buildingModel(level >= 3 ? 'market.3' : level >= 2 ? 'market.2' : 'market'), ...out(1.2, 27), 1.2);
        put(buildingModel('storehouse'), ...out(-1.4, 26), -1.4 + Math.PI);
        ring(6 + level * 2, 38, 46, 0.3);
        break;
      case 'mine':
        centre = put(keep(level), 0, 0, 0, 0.7);
        put(buildingModel('mine'), ...out(1.9, 30), 1.9 + Math.PI);
        put(buildingModel('quarry'), ...out(-2.2, 30), -2.2 + Math.PI);
        put(buildingModel('smelter'), ...out(0.6, 28), 0.6 + Math.PI);
        ring(3 + level * 2, 24, 30, 0.2, [1.9, -2.2, 0.6]);
        break;
      case 'ford': {
        centre = put(keep(level), 0, 0, 0, 0.8);
        ring(4 + level * 2, 26, 34, 0.5);
        // the toll gate across the road
        const a = roads[0] ?? 0, [gx, gz] = out(a, 46), tx = Math.cos(a), tz = -Math.sin(a);
        put(buildingModel('gate.wood'), gx, gz, a + Math.PI);
        put(buildingModel('tower.wood'), gx + tx * 7, gz + tz * 7, a, 0.6);
        put(buildingModel('tower.wood'), gx - tx * 7, gz - tz * 7, a, 0.6);
        break;
      }
      case 'monastery':
        centre = put(buildingModel('monastery') || keep(level), 0, 0, 0, 1);
        put(buildingModel('well'), ...out(0.9, 20), 0);
        put(buildingModel('farm'), ...out(3.5, 40), 3.5);
        ring(2 + level, 30, 34, 1.6);
        break;
      case 'camp': {
        // bandits: rough tents round a fort-like stockade
        centre = put(fortModel(), 0, 0, 0, 0.45);
        const tent = unitModel('tent'), cloth = this.campCloth || (this.campCloth = Object.assign(this.mat.clone(), { color: new THREE.Color('#6b5a44') }));
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2 + rand(), [x, z] = out(a, 16 + rand() * 6);
          if (tent) { put(tent.gear, x, z, a); put(tent.cloth, x, z, a, 1, cloth); }
        }
        break;
      }
      default:
        centre = put(keep(level), 0, 0, 0, 1);
        ring(4 + level * 2, 28, 36);
        put(buildingModel('farm'), ...out(2.8, 52), 2.8);
    }
    // the flag flies over the centre
    if (centre) o.flag.position.set(4.5, S * centre.scale.x * keepTop(centre.geometry) + 4, 0);
  }

  // A ring of stone walls and towers round the royal city, with a gate wherever a road comes in.
  cityWall(put, roads, R) {
    const n = Math.round(Math.PI * 2 * R / 10), len = Math.PI * 2 * R / n;
    const gates = new Set(roads.map(r => ((Math.round(r / (Math.PI * 2) * n) % n) + n) % n));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R;
      // the outer face points away from the city
      const m = put(buildingModel(gates.has(i) ? 'gate.stone' : 'wall.stone'), x, z, a + Math.PI);
      if (m) m.scale.x = len / 10 * 1.02;
      if (i % 6 === 3) { const b = (i + 0.5) / n * Math.PI * 2; put(buildingModel('tower.stone'), Math.sin(b) * R, Math.cos(b) * R, b, 0.8); }
    }
  }

  // ---- fog of war: a pale wash over land you have not seen, thinner over land seen before ----

  makeFog() {
    const N = 256, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const size = WORLD_HALF * 2.4, seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    // draped over the hills, a little above them
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)) + 2.5);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    return { cv, ctx: cv.getContext('2d'), tex, N, size, key: '' };
  }

  updateFog() {
    const f = this.fog, w = this.world;
    // only redraw when what you can see has changed
    const key = w.pois.map(p => (p.visible ? 2 : p.seen ? 1 : 0)).join('') + w.armies.filter(a => a.side === 0).map(a => `${Math.round(a.x / 15)},${Math.round(a.z / 15)}`).join(';');
    if (key === f.key) return;
    f.key = key;
    const { ctx, N, size } = f, k = N / size, at = v => (v + size / 2) * k;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, N, N);
    ctx.fillStyle = 'rgba(214, 206, 186, 0.93)';
    ctx.fillRect(0, 0, N, N);
    ctx.globalCompositeOperation = 'destination-out';
    const clear = (x, z, r, alpha) => {
      const g = ctx.createRadialGradient(at(x), at(z), r * k * 0.55, at(x), at(z), r * k);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(at(x), at(z), r * k, 0, Math.PI * 2); ctx.fill();
    };
    // sight as in world.js: 250 round your places, 190 round your armies
    for (const p of w.pois) if (p.seen && !p.visible) clear(p.x, p.z, 170, 0.6);
    for (const p of w.pois) if (p.owner === 0) clear(p.x, p.z, 250, 1);
    for (const a of w.armies) if (a.side === 0) clear(a.x, a.z, 190, 1);
    f.tex.needsUpdate = true;
  }

  hideLabels(hidden) { this.labelsEl.hidden = hidden; }
}
