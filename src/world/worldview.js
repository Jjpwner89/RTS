// Draws the world map: hills and woods, the roads, a small keep and houses for each
// place with its owner's flag, armies as little marching columns, and name labels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHeight, drawGround, plantTrees, drawTrees } from '../terrain.js';
import { part, box, keepModel, keepTop, keepLevelOf, poleFor, castleModel, fortModel, houseModel, SKIN, WOOD } from '../view.js';
import { unitModel, buildingModel, HOUSE_STYLES } from '../models.js';
import { ownerOf, FACTIONS, NEUTRAL, headcount } from './world.js';
import { KINDS, REALM_RADIUS } from './realm.js';
import { ico } from '../icons.js';
import { TYPES, lookChain } from '../battle.js';

// The map's half-width follows world.half, which grows when the north opens in Part 2.
export const WORLD_HALF = REALM_RADIUS + 140;

const nearSegment = (x, z, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
};

// An army on the map: its own troops in small blocks under a banner, about one figure for every ten men (at
// least one per unit, at most 48 in all). Foot stand in front, bowmen behind them, horse on the right flank,
// dogs ahead and engines in the rear. Gear keeps its colours; cloth takes the side's.
// A starving army is ragged: men missing from the ranks, the rest straggling, the banner dipped.
const FIGURES = 48;
const roleOf = T => !T ? 1 : T.engine ? 4 : T.key === 'wardog' ? 0 : T.mounted ? 3 : T.range && !T.javelin ? 2 : 1;
const lookOf = key => lookChain(key).map(unitModel).find(Boolean) || unitModel('spear');
// a count as you would guess it from a hillside
const rough = n => n < 100 ? Math.max(10, Math.round(n / 10) * 10) : Math.round(n / 50) * 50;
const armySig = units => units.filter(u => u.count > 0).map(u => `${u.key}:${Math.ceil(u.count / 10)}`).join(',');
function armyModel(units, ragged = false) {
  if (!unitModel('spear')) return null;
  const live = units.filter(u => u.count > 0), men = live.reduce((n, u) => n + u.count, 0) || 1;
  const per = Math.max(10, men / FIGURES);
  const groups = live.map(u => ({ key: u.key, T: TYPES[u.key], n: Math.max(1, Math.round(u.count / per)) }))
    .sort((a, b) => roleOf(a.T) - roleOf(b.T));
  const gear = [], cloth = [], plain = g => { const o = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(a)) o.deleteAttribute(a); return o; };
  let seed = 5, footZ = 0, horseZ = 0, footW = 0;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const place = (m, x, z, turn = 0) => {
    gear.push(plain(m.gearLight.clone().rotateY(turn).translate(x, 0, z)));
    cloth.push(plain(m.clothLight.clone().rotateY(turn).translate(x, 0, z)));
  };
  // a block of figures, its front rank at z, centred on x0; returns its depth
  const block = (m, n, x0, z, dx, dz, files) => {
    let i = 0;
    for (; i < n; i++) {
      const f = i % files, r = Math.floor(i / files), row = Math.min(files, n - r * files);
      if (ragged && i % 3 === 1) continue;
      const jx = ragged ? (rand() - 0.5) * 1.2 : 0, jz = ragged ? rand() * 1.8 : 0;
      place(m, x0 + (f - (row - 1) / 2) * dx + jx, z - r * dz - jz, ragged ? (rand() - 0.5) * 0.9 : 0);
    }
    return Math.ceil(n / files) * dz;
  };
  const foot = groups.filter(g => roleOf(g.T) === 1 || roleOf(g.T) === 2);
  for (const g of foot) footW = Math.max(footW, Math.min(6, g.n) * 1.5);
  footW = Math.max(footW, 4.5);
  for (const g of foot) footZ -= block(lookOf(g.key), g.n, 0, footZ, 1.5, 1.6, 6) + 0.8;
  const horseX = footW / 2 + 3;
  for (const g of groups.filter(g => roleOf(g.T) === 3)) horseZ -= block(lookOf(g.key), g.n, horseX, horseZ, 2.4, 3.4, 3) + 1;
  for (const g of groups.filter(g => roleOf(g.T) === 0)) block(lookOf(g.key), g.n, 0, 2, 1.4, 1.4, 6);
  // engines are drawn from the buildings file, a little smaller than in battle
  let engineZ = Math.min(footZ, horseZ) - 4;
  for (const g of groups.filter(g => roleOf(g.T) === 4)) {
    const geo = buildingModel('siege.' + g.T.engine.kind);
    if (!geo) continue;
    const e = plain(geo.clone()).scale(0.45, 0.45, 0.45).translate(0, 0, engineZ);
    gear.push(e); engineZ -= 8;
  }
  const bx = -footW / 2 - 1.5;
  const pole = part(box(0.12, 5, 0.12), WOOD, { x: bx, y: 2.5, z: 1 });
  const banner = part(box(0.06, 1.4, 1.6), '#ffffff', { x: bx, y: 4.2, z: 0.2 });
  // dipped about the foot of the pole
  if (ragged) for (const g of [pole, banner]) g.translate(-bx, 0, -1).rotateZ(0.4).translate(bx, 0, 1);
  return { gear: mergeGeometries([...gear, pole].map(plain)), cloth: mergeGeometries([...cloth, banner].map(plain)), lordAt: [bx - 4, 0, 3.5] };
}

// A supply wagon: the cart under a canvas tilt in its side's colour, with a carter walking ahead.
function wagonModel() {
  const cart = buildingModel('wagon'), u = unitModel('villager');
  if (!cart) return null;
  const plain = g => { const o = g.index ? g.toNonIndexed() : g.clone(); for (const a of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(a)) o.deleteAttribute(a); if (!o.attributes.normal) o.computeVertexNormals(); return o; };
  // the pack's cart carries a market awning on posts: keep the bed and wheels, and cover it with a canvas tilt
  const full = plain(cart);
  full.computeBoundingBox();
  const b = full.boundingBox, bed = b.min.y + (b.max.y - b.min.y) * 0.52;
  const P = full.attributes.position, keep = [];
  for (let i = 0; i < P.count; i += 3) if (Math.max(P.getY(i), P.getY(i + 1), P.getY(i + 2)) < bed) keep.push(i, i + 1, i + 2);
  const bedGeo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const A = full.attributes[name], out = new Float32Array(keep.length * 3);
    keep.forEach((v, k) => { out[k * 3] = A.getX(v); out[k * 3 + 1] = A.getY(v); out[k * 3 + 2] = A.getZ(v); });
    bedGeo.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  const w = b.max.x - b.min.x, len = b.max.z - b.min.z, r = Math.min(w, len) * 0.48;
  const tilt = new THREE.CylinderGeometry(r, r, Math.max(w, len) * 0.6, 10, 1, true, 0, Math.PI);
  tilt.rotateZ(Math.PI / 2);   // lying along x, the open half underneath
  if (len >= w) tilt.rotateY(Math.PI / 2);
  tilt.translate((b.min.x + b.max.x) / 2, bed - 0.1, (b.min.z + b.max.z) / 2 - (len >= w ? len * 0.12 : 0));
  const white = c => { const n = c.attributes.position.count; c.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3)); return c; };
  const gear = [bedGeo], cloth = [white(plain(tilt))];
  if (u) { gear.push(plain(u.gearLight.clone().translate(1.2, 0, b.max.z + 1.2))); cloth.push(plain(u.clothLight.clone().translate(1.2, 0, b.max.z + 1.2))); }
  return { gear: mergeGeometries(gear), cloth: mergeGeometries(cloth) };
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
    this.half = world.half || WORLD_HALF;
    const EXTENT = this.half + 140;       // woods reach this far
    const GROUND = this.half * 2.2;       // the ground runs on past them so the edge never shows
    drawGround(this.scene, h, world.seed, { extent: GROUND, seg: Math.round(320 * Math.min(1.6, this.half / WORLD_HALF)) });
    const wall = world.wall?.points || [], wr = wall.map(q => Math.hypot(q.x, q.z));
    const wallMin = Math.min(...wr) - 40, wallMax = Math.max(...wr) + 40;
    const nearWall = (x, z) => { const r = Math.hypot(x, z); if (!(r > wallMin && r < wallMax)) return false; for (let i = 1; i < wall.length; i++) if (nearSegment(x, z, wall[i - 1], wall[i]) < 26) return true; return false; };
    const trees = plantTrees(world.seed, (x, z) => world.pois.some(p => Math.hypot(x - p.x, z - p.z) < (p.kind === 'crown' ? 175 : 80))
      || world.roads.some(r => nearSegment(x, z, r.a, r.b) < 12) || nearWall(x, z), 0.52, Math.round(6500 * (EXTENT / (WORLD_HALF + 140)) ** 2), EXTENT);
    for (const t of trees.spots) { t.k *= 1.8; t.tall *= 1.8; }
    drawTrees(this.scene, h, trees);
    for (const r of world.roads) this.scene.add(this.road(r.a, r.b));

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.drawOldWall();
    this.places = new Map();
    for (const p of world.pois) {
      const g = new THREE.Group();
      g.position.set(p.x, h(p.x, p.z) - 0.5, p.z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
      g.add(poleFor(flag, 9, 5.5));
      this.scene.add(g);
      const o = { group: g, flag, owner: undefined, label: null, look: null, parts: null };
      this.places.set(p, o);
      this.dress(p, o);
    }
    this.fog = this.makeFog();

    this.columnGeo = columnModel();
    this.armyGeo = new Map();   // each army's figure, by its troops and whether it is ragged
    this.wagonGeo = wagonModel();
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
    if (w.wall && w.wall.fallen !== this.wallFallen) this.drawOldWall();
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
      const alarm = p.town?.underAttack ? ` ${ico('battle', '#ff8a5a')}` : '';
      const K = KINDS[p.kind];
      const html = !p.seen ? `<b style="color:${own.color}">${ico(K.icon)} ${p.name}</b><small>unexplored</small>`
        : `<b style="color:${own.color}">${ico(K.icon)} ${p.name}${alarm}</b><small>${shown === null ? `free ${K.name.toLowerCase()}` : own.name} · ${p.town ? '' : '~'}${men} men${p.visible ? '' : ' (last seen)'}</small>`;
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
        if (a.wagon && this.wagonGeo) {
          const cloth = this.mat.clone(); cloth.color.copy(colour).lerp(new THREE.Color('#e8dcc0'), 0.55);
          mesh.add(new THREE.Mesh(this.wagonGeo.gear, this.mat), new THREE.Mesh(this.wagonGeo.cloth, cloth));
          mesh.scale.setScalar(2.6);
        } else if (unitModel('spear')) {
          const cloth = this.mat.clone(); cloth.color.copy(colour);
          mesh.add(new THREE.Mesh(undefined, this.mat), new THREE.Mesh(undefined, cloth));
          mesh.userData.ranks = mesh.children.slice(0, 2);
          mesh.scale.setScalar(2.6);
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
      // A great lord riding with the army: their figure and bannerman at its head, in their house's colour.
      const lord = a.wagon ? null : a.lord ?? null;
      if (o.lord !== lord) {
        o.lord = lord;
        if (o.mesh.userData.lord) { o.mesh.remove(o.mesh.userData.lord); o.mesh.userData.lord.children[1].material.dispose(); o.mesh.userData.lord = null; }
        const L = lord !== null && o.mesh.userData.ranks && unitModel(/^Lady /.test(FACTIONS[lord]?.lord || '') ? 'lady' : 'lord');
        if (L) {
          const g = new THREE.Group(), cloth = this.mat.clone();
          cloth.color.set(FACTIONS[lord]?.color || FACTIONS[a.side].color);
          g.add(new THREE.Mesh(L.gearLight, this.mat), new THREE.Mesh(L.clothLight, cloth));
          g.position.set(...(o.lordAt || [-4, 0, 2]));
          g.traverse(m => { m.castShadow = true; });
          o.mesh.add(g);
          o.mesh.userData.lord = g;
        }
      }
      // The figure follows the army's troops as they fall, join and starve, as far as you can make them
      // out (world.updateVision): far off a dark knot of men, nearer a block the right size in its
      // colours, close up its own troops.
      const ranks = o.mesh.userData.ranks, know = a.know ?? 3, men = headcount(a.units);
      if (ranks) {
        const shown = know >= 3 ? a.units : [{ key: 'spear', count: know === 2 ? rough(men) : 40 }];
        const sig = know + ':' + armySig(shown) + (know >= 3 && a.food <= 0 ? '!' : '');
        if (o.sig !== sig) {
          o.sig = sig;
          let g = this.armyGeo.get(sig);
          if (!g) {
            // armies change often; let old figures go (three uploads any still drawn again)
            if (this.armyGeo.size > 60) { for (const old of this.armyGeo.values()) { old.gear.dispose(); old.cloth.dispose(); } this.armyGeo.clear(); }
            this.armyGeo.set(sig, g = armyModel(shown, know >= 3 && a.food <= 0));
          }
          ranks[0].geometry = g.gear; ranks[1].geometry = g.cloth;
          ranks[1].material.color.set(know > 1 ? FACTIONS[a.side].color : '#4a4640');
          if (o.mesh.userData.lord) o.mesh.userData.lord.position.set(...g.lordAt);
          o.lordAt = g.lordAt;
        }
        if (o.mesh.userData.lord) o.mesh.userData.lord.visible = know >= 2;
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
      const html = a.wagon ? `${ico('food')} ${a.wagon.food}`
        : know < 2 ? `${ico('battle')} ?`
        : `${a.lord != null ? `${ico('crown')} ` : ''}${ico(a.retreating ? 'retreat' : a.mode === 'raid' ? 'raid' : a.mode === 'siege' ? 'siege' : 'battle')} ${know < 3 ? `~${rough(men)}` : men}${a.side === 0 && a.food <= 0 ? ` ${ico('warning', '#ff8a5a')}` : ''}`;
      if (o.html !== html) { o.html = html; o.label.innerHTML = html; o.label.style.borderColor = know > 1 ? FACTIONS[a.side].color : '#8a8070'; }
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
    // A place you run as a real village looks like that village, and grows as you build.
    if (p.town) {
      const t = p.town, built = t.buildings.filter(b => b.state === 'active');
      return `town:${keepLevelOf(t)}:${built.length}:${built.reduce((n, b) => n + (b.level || 1), 0)}:${p.seen}`;
    }
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
    // tents in a loose ring, kept off the roads
    const tents = (n, r0, r1, colour = '#6b5a44', s = 1) => {
      const tent = unitModel('tent');
      if (!tent) return;
      const cloth = once('tentCloth' + colour, () => Object.assign(this.mat.clone(), { color: new THREE.Color(colour) }));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + rand() * 0.5;
        if (nearRoad(a, 0.2)) continue;
        const [x, z] = out(a, r0 + rand() * (r1 - r0));
        put(tent.gear, x, z, a, s); put(tent.cloth, x, z, a, s, cloth);
      }
    };
    let centre;
    if (p.town) {
      // the village in miniature: its keep, and its buildings where they stand, drawn closer together
      const t = p.town, k = 55 / (t.territory || 175);
      centre = put(keep(keepLevelOf(t)), 0, 0, 0, 0.75);
      for (const b of t.buildings) {
        if (b.state !== 'active') continue;
        const base = b.kind === 'house' ? `house.${(b.style || 0) % HOUSE_STYLES}` : b.kind === 'monastery' ? 'chapel' : b.kind;
        let geo = null;
        for (let l = b.level || 1; l > 1 && !geo; l--) geo = buildingModel(`${base}.${l}`);
        geo ||= b.kind === 'house' ? houseModel(b.style || 0) : buildingModel(base) || buildingModel(b.kind);
        // pushed out past the keep, so nothing hides inside it
        const a = Math.atan2(b.x, b.z), r = 20 + Math.hypot(b.x, b.z) * k;
        put(geo, Math.sin(a) * r, Math.cos(a) * r, b.angle || 0, 0.6);
      }
    } else switch (p.kind === 'pass' || p.kind === 'warcamp' ? p.kind : seat ? 'seat' : p.kind) {
      case 'pass':
        // the mountain gate: a great castle inside stone walls, the northern host camped outside
        centre = put(castleModel(4), 0, 0, 0, 1.1);
        ring(10, 30, 38, 0.3);
        this.cityWall(put, roads, 54, 'stone', 4);
        tents(14, 66, 82, '#7a7266', 1.4);
        break;
      case 'warcamp':
        // a stockade of rough stakes and timber towers, packed with the host's tents
        centre = put(fortModel(), 0, 0, 0, 0.5);
        tents(9, 18, 22, '#7a7266', 1.3);
        tents(12, 28, 34, '#7a7266', 1.3);
        this.cityWall(put, roads, 42, 'wood', 5);
        tents(8, 52, 62, '#7a7266', 1.2);
        break;
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
        tents(5, 16, 22);
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

  // A ring of walls and towers round a place, stone or timber, with a gate wherever a road comes in.
  cityWall(put, roads, R, mat = 'stone', every = 6) {
    const n = Math.round(Math.PI * 2 * R / 10), len = Math.PI * 2 * R / n;
    const gates = new Set(roads.map(r => ((Math.round(r / (Math.PI * 2) * n) % n) + n) % n));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R;
      // the outer face points away from the city
      const m = put(buildingModel(gates.has(i) ? `gate.${mat}` : `wall.${mat}`), x, z, a + Math.PI);
      if (m) m.scale.x = len / 10 * 1.02;
      if (i % every === Math.floor(every / 2)) { const b = (i + 0.5) / n * Math.PI * 2; put(buildingModel(`tower.${mat}`), Math.sin(b) * R, Math.cos(b) * R, b, 0.8); }
    }
  }

  // ---- the old wall across the north: whole in Part 1, broken where the war camps' roads cross in Part 2 ----

  drawOldWall() {
    const W = this.world.wall;
    if (this.oldWall) { this.scene.remove(this.oldWall); this.oldWall.traverse(o => o.isInstancedMesh && o.dispose()); }
    this.wallFallen = W?.fallen;
    if (!W?.points?.length) return;
    const pts = W.points, h = this.heightAt, S = 2.6, PIECE = 10 * S;
    // distance along the wall to each point, and where each breach road crosses it
    const along = [0];
    for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = along[along.length - 1];
    const at = s => {
      let i = 1;
      while (i < pts.length - 1 && along[i] < s) i++;
      const a = pts[i - 1], b = pts[i], t = (s - along[i - 1]) / ((along[i] - along[i - 1]) || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: b.x - a.x, dz: b.z - a.z };
    };
    const cuts = [];
    for (const br of W.fallen ? W.breaches : []) {
      const p = br.from, q = br.to;
      let hit = null;
      for (let i = 1; i < pts.length && !hit; i++) {
        const a = pts[i - 1], b = pts[i];
        const d = (q.x - p.x) * (b.z - a.z) - (q.z - p.z) * (b.x - a.x);
        if (!d) continue;
        const t = ((a.x - p.x) * (b.z - a.z) - (a.z - p.z) * (b.x - a.x)) / d, u = ((a.x - p.x) * (q.z - p.z) - (a.z - p.z) * (q.x - p.x)) / d;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hit = along[i - 1] + u * (along[i] - along[i - 1]);
      }
      if (hit === null) {   // no crossing found: break it nearest the breach's marker
        let best = Infinity;
        for (let s = 0; s <= total; s += 5) { const c = at(s), d = Math.hypot(c.x - br.x, c.z - br.z); if (d < best) { best = d; hit = s; } }
      }
      cuts.push(hit);
    }
    const gap = s => Math.min(Infinity, ...cuts.map(c => Math.abs(c - s)));
    const n = Math.max(1, Math.round(total / PIECE)), len = total / n;
    const lots = new Map(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const add = (name, x, z, y, yaw, sx, s) => {
      m4.compose(new THREE.Vector3(x, y, z), q4.setFromAxisAngle(up, yaw), new THREE.Vector3(sx, s, s));
      (lots.get(name) || lots.set(name, []).get(name)).push(m4.clone());
    };
    let seed = (this.world.seed || 7) % 2147483646 + 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * len, c = at(s), e0 = at(i * len), e1 = at((i + 1) * len);
      // the outer face (local -z) looks north, away from the realm
      const yaw = Math.atan2(c.x, c.z) + Math.PI;
      const y = Math.min(h(e0.x, e0.z), h(c.x, c.z), h(e1.x, e1.z)) - 0.6;
      const g = gap(s), worn = W.fallen && rand() < 0.08;
      if (g > len * 0.9) add(g < len * 2 || worn ? 'wall.stone.broken' : 'wall.stone', c.x, c.z, y, yaw, len / 10 * 1.02, S);
      if (i % 4 === 0 || i === n - 1) {
        const ts = i === n - 1 ? total : i * len, t = at(ts), tg = gap(ts);
        if (tg > len * 0.6) add(tg < len * 2.5 ? 'tower.stone.broken' : 'tower.stone', t.x, t.z, h(t.x, t.z) - 0.6, yaw, S * 0.85, S * 0.85);
      }
    }
    const group = new THREE.Group();
    for (const [name, list] of lots) {
      const geo = buildingModel(name) || buildingModel(name.replace('.broken', ''));
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, this.mat, list.length);
      list.forEach((m, k) => im.setMatrixAt(k, m));
      im.castShadow = im.receiveShadow = true;
      group.add(im);
    }
    this.oldWall = group;
    this.scene.add(group);
  }

  // ---- fog of war: a pale wash over land you have not seen, thinner over land seen before ----

  makeFog() {
    const N = 256, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const size = this.half * 2.4, seg = Math.round(150 * Math.min(1.6, this.half / WORLD_HALF));
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
