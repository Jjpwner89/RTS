// Bakes the chosen RTS models into one GLB for the game: run on roster.html?only=none, then call bakeAll().
// Soldiers split into "gear" (fixed colours) and "cloth" (team parts, stored as grey shades the game tints),
// each in a full and a light version. Buildings become one vertex-coloured mesh each.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SK from './skin.js';

const R = window.__roster, { THREE, C, MeshoptSimplifier, mergeGeometries, mergeVertices } = R;

// Which piece of a soldier a mesh belongs to: 'armour' (coats, helmets, pads), 'shield', or else the body
// with its weapons ('base').
const partOf = m => { for (let p = m; p; p = p.parent) if (p.userData.part) return p.userData.part; return 'base'; };
// Every part of a figure (or only the meshes of one piece), split by whether its material is a team colour.
// An animated figure (one baked with skin data, skin.js) keeps each vertex in its bind pose with its bone weights
// instead of where the bake posed it; the game poses it.
const figOf = m => { for (let p = m; p; p = p.parent) if (p.userData.skin) return p; return null; };
const animated = group => { let a = false; group.traverse(o => { if (o.userData.skin) a = true; }); return a; };
function split(group, want) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert(), out = { gear: [], cloth: [] }, anim = animated(group);
  group.traverse(part => {
    if (!part.isMesh || (want && partOf(part) !== want)) return;
    const src = part.geometry, g = src.index ? src.toNonIndexed() : src.clone();
    let sk = null;
    if (anim) {
      const fig = figOf(part);
      if (!fig) throw new Error(`${part.name || part.parent?.name}: not on an animated figure`);
      sk = g.attributes.bind ? { bind: g.attributes.bind.array, bones: g.attributes.bones.array, weights: g.attributes.weights.array }
        : SK.derive(fig, part, g, fig.matrixWorld.clone().invert().multiply(part.matrixWorld));
    }
    g.applyMatrix4(inv.clone().multiply(part.matrixWorld));
    const mats = [].concat(part.material), n = g.attributes.position.count;
    const groups = Array.isArray(part.material) && src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }];
    const vc = g.attributes.color, c = new THREE.Color();
    for (const gr of groups) {
      const m = mats[gr.materialIndex] || mats[0], team = m.userData.team;
      const end = Math.min(n, gr.start + gr.count), pos = [], col = [], bones = [], weights = [];
      for (let i = gr.start; i < end; i++) {
        if (team) c.setScalar(team);
        else { c.copy(m.color); if (vc) c.multiply(new THREE.Color(vc.getX(i), vc.getY(i), vc.getZ(i))); }
        if (sk) { pos.push(...sk.bind.slice(i * 3, i * 3 + 3)); bones.push(...sk.bones.slice(i * 4, i * 4 + 4)); weights.push(...sk.weights.slice(i * 4, i * 4 + 4)); }
        else pos.push(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i));
        col.push(c.r, c.g, c.b);
      }
      const y = new THREE.BufferGeometry();
      y.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      y.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      if (sk) { y.setAttribute('bones', new THREE.Float32BufferAttribute(bones, 4)); y.setAttribute('weights', new THREE.Float32BufferAttribute(weights, 4)); }
      out[team ? 'cloth' : 'gear'].push(y);
    }
  });
  return { gear: out.gear.length ? mergeGeometries(out.gear) : null, cloth: out.cloth.length ? mergeGeometries(out.cloth) : null, counts: [out.gear.length, out.cloth.length] };
}

// Indexed, with unused vertices dropped; simplified toward `tris` when given.
// Bone weights go as bytes, strongest first; a light version keeps only each vertex's two strongest bones.
function compact(geo, tris) {
  let g = mergeVertices(geo, 1e-4);
  let idx = g.index.array;
  if (tris) idx = MeshoptSimplifier.simplify(new Uint32Array(idx), new Float32Array(g.attributes.position.array), 3, Math.min(idx.length, Math.max(3, Math.round(tris) * 3)), 0.06)[0];
  const remap = new Map(), pos = [], col = [], bones = [], weights = [], P = g.attributes.position, Cc = g.attributes.color, B = g.attributes.bones, W = g.attributes.weights;
  const keep = tris ? 2 : 4;
  const index = Array.from(idx, i => {
    if (!remap.has(i)) {
      remap.set(i, remap.size); pos.push(P.getX(i), P.getY(i), P.getZ(i)); col.push(Cc.getX(i), Cc.getY(i), Cc.getZ(i));
      if (B) {
        const inf = [0, 1, 2, 3].map(j => [B.getComponent(i, j), W.getComponent(i, j)]).sort((a, b) => b[1] - a[1]).slice(0, keep);
        const sum = inf.reduce((a, x) => a + x[1], 0) || 1, w = inf.map(x => Math.round(x[1] / sum * 255));
        w[0] += 255 - w.reduce((a, b) => a + b, 0);
        for (let j = 0; j < 4; j++) { bones.push(j < keep && w[j] ? Math.round(inf[j][0]) : 0); weights.push(j < keep ? w[j] : 0); }
      }
    }
    return remap.get(i);
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // colours as bytes: a third of the space, and plenty for flat colours
  out.setAttribute('color', new THREE.Uint8BufferAttribute(col.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)), 3, true));
  if (B) { out.setAttribute('bones', new THREE.Uint8BufferAttribute(bones, 4)); out.setAttribute('weights', new THREE.Uint8BufferAttribute(weights, 4, true)); }
  out.setIndex(index);
  return out;
}
const tri = g => g.index.count / 3;

const qmod = R.FAMILIES.find(f => f.id === 'qmod');
const people = (file, opts) => R.bake('glb', 'assets/qmod/' + file + '.glb', { rig: 'qmod', team: 0, clip: 'Idle', height: 1.8, drop: n => n === 'Backpack' || n === 'Sword', tint: { Green: 'team', LightGreen: 'team2', Blue: 'team' }, skin: SK.rigOf(file), ...opts });
// The farmer's shirt and neckerchief take the team colour (or a villager's dye).
const FARMER = { Beige: 'team', Red: 'team3' };
// The game's unit keys; the four line troops are exactly the lineup's Quaternius people.
const UNITS = {
  spear: () => R.figure(qmod, 'spear', 0),
  sword: () => R.figure(qmod, 'sword', 0),
  archer: () => R.figure(qmod, 'archer', 0),
  cav: () => R.figure(qmod, 'cav', 0),
  // villagers with spears and no armour
  militia: async () => { const f = await people('Male_Farmer', { tint: FARMER, hold: ['Hold_Spear_R'] }); await R.hang(f, R.KIT.spear[0]); return f; },
  // leather and a hood, with an axe
  bandit: async () => {
    const f = await people('Male_Adventurer', { armour: R.ARMOUR.archer, hold: ['Hold_Sword_R'], trimHair: true });
    await R.hang(f, { item: R.HELM.archer[0], tint: R.HELM.archer[1], at: 'head' });
    await R.hang(f, R.KIT.villager[0]);
    return f;
  },
  villager: async () => { const f = await people('Male_Farmer', { tint: FARMER }); tools(f); return f; },
};
const LIGHT = 1500;

// [model makers placed at x, z (turned by ry, raised by y, scaled by k)], and the width in metres across the widest side
const rts = n => () => R.rtsModel(n), mvp = n => () => R.mvpModel(n);
const BUILDINGS = {
  'house.0': [[[rts('Houses_FirstAge_1_Level3')]], 6.5],
  'house.1': [[[rts('Houses_FirstAge_2_Level3')]], 6.5],
  'house.2': [[[rts('Houses_FirstAge_3_Level3')]], 6.5],
  woodcutter: [[[rts('Storage_FirstAge_Level1')], [rts('Logs'), 3.4, 2.4], [rts('Resource_PineTree_Group_Cut'), -3.5, -3.5]], 7.5],
  quarry: [[[async () => C.fit(await R.rtsModel('Resource_Rock_2'), 5)], [rts('Crate_Stack1'), 3.2, 2.6]], 7],
  mine: [[[rts('Mine')]], 7],
  hunter: [[[rts('Houses_FirstAge_3_Level1')], [rts('Barrel'), 2.6, 1.6]], 6],
  farm: [[[rts('Farm_FirstAge_Level2')], [rts('Farm_FirstAge_Level2_Wheat')]], 17],
  flax: [[[rts('Farm_FirstAge_Level1')], [rts('Farm_FirstAge_Level1_Wheat')]], 17],
  carpenter: [[[mvp('Sawmill')]], 7.5],
  ropemaker: [[[rts('Market_FirstAge_Level1')]], 8],
  smelter: [[[mvp('Blacksmith')]], 7],
  bowyer: [[[rts('Archery_FirstAge_Level1')]], 7],
  weaponsmith: [[[mvp('Blacksmith')], [mvp('Cauldron'), 4, 2]], 7.5],
  barracks: [[[rts('Barracks_FirstAge_Level2')]], 11],
  castle: [[[rts('Wonder_FirstAge_Level3')]], 30],
};

// `scaleOf` sizes a building by another model's width, so upgrade levels keep their relative sizes.
// A recipe can also be a function that returns finished (non-indexed) geometry, for walls, engines and the like.
async function buildingGeo(recipe) {
  if (typeof recipe === 'function') return compact(await recipe());
  return compact(await flatBuilding(recipe));
}
async function flatBuilding([parts, width, scaleOf]) {
  const g = new THREE.Group();
  for (const [make, x = 0, z = 0, ry = 0, y = 0, k = 1] of parts) { const o = await make(); o.position.set(x, y, z); o.rotation.y = ry; o.scale.multiplyScalar(k); g.add(o); }
  let size = width;
  if (scaleOf) {
    // scale by the reference model, then keep that size while centring
    const ref = new THREE.Box3().setFromObject(await R.rtsModel(scaleOf)).getSize(new THREE.Vector3());
    const own = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    size = Math.max(own.x, own.z) * width / Math.max(ref.x, ref.z);
  }
  return split(C.fit(g, size)).gear;
}

// ============================================================ the full game: more units, levels, walls and engines

// ---- plain geometry helpers: non-indexed, position + colour ----
const lin = c => new THREE.Color(c);
function solid(geo, colour) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a);
  const c = lin(colour), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
  return g;
}
const block = (w, h, d, colour, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0 } = {}) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y + h / 2 * (rx || rz ? 0 : 1), z);
  return solid(g, colour);
};
const join = list => mergeGeometries(list.filter(Boolean).map(g => g.index ? g.toNonIndexed() : g));
// Keep the triangles whose centre passes `keep(x, y, z)`.
function crop(geo, keep) {
  const p = geo.attributes.position, c = geo.attributes.color, P = [], Cc = [];
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (!keep(x, y, z)) continue;
    for (let k = i; k < i + 3; k++) { P.push(p.getX(k), p.getY(k), p.getZ(k)); Cc.push(c.getX(k), c.getY(k), c.getZ(k)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  return g;
}
// Knock a model down to a ragged stump: every point above a broken line (`cut`, varying along x and z) drops onto it.
function stump(geo, cut, seed = 1) {
  const g = geo.clone(), p = g.attributes.position;
  const line = (x, z) => cut * (0.55 + 0.45 * Math.abs(Math.sin(Math.round(x * 0.9) * 12.9898 + Math.round(z * 0.9) * 78.233 + seed) * 43758.5453 % 1));
  for (let i = 0; i < p.count; i++) p.setY(i, Math.min(p.getY(i), line(p.getX(i), p.getZ(i))));
  return g;
}
const size = g => { g.computeBoundingBox(); return g.boundingBox.getSize(new THREE.Vector3()); };
// Stretch to exactly [x, y, z] metres, centred on x and z, standing on y = 0.
function fitBox(geo, [X, Y, Z]) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z);
  geo.scale(X / s.x, Y / s.y, Z / s.z);
  return geo;
}
// The average colour of the triangles a model draws with one material, for matching added parts to it.
async function packColour(name, material) {
  const o = await R.rtsModel(name);
  let c = null;
  o.traverse(m => { if (!c && m.isMesh) [].concat(m.material).forEach(x => { if (!c && x.name === material) c = x.color.clone(); }); });
  return c || lin('#888');
}
const rtsFlat = async name => split(await R.rtsModel(name)).gear;

// ---- Kenney Castle Kit (CC0): its colours come from a palette texture; read them into vertex colours ----
const palettes = new Map();
function pixels(tex) {
  if (palettes.has(tex)) return palettes.get(tex);
  const img = tex.image, cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  const out = { w: img.width, h: img.height, d: cx.getImageData(0, 0, img.width, img.height).data };
  palettes.set(tex, out);
  return out;
}
// Kenney's toy orange and blue become weathered wood and a hide roof; greys stay.
function kenneyTone(c) {
  const hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.25) return c;
  if (hsl.h > 0.5 && hsl.h < 0.75) return c.setHSL(0.08, 0.22, Math.min(0.5, hsl.l * 0.7));
  return c.setHSL(0.075, Math.min(0.45, hsl.s * 0.55), hsl.l * 0.72);
}
async function kenney(name) {
  const o = (await C.gltf('assets/kenney/' + name + '.glb')).scene.clone(true);
  o.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(), uv = g.attributes.uv, n = g.attributes.position.count, col = [], c = new THREE.Color();
    const mat = [].concat(m.material)[0], px = mat.map ? pixels(mat.map) : null;
    for (let i = 0; i < n; i++) {
      if (px && uv) {
        const x = Math.min(px.w - 1, Math.max(0, Math.floor(uv.getX(i) * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor(uv.getY(i) * px.h))), k = (y * px.w + x) * 4;
        c.setRGB(px.d[k] / 255, px.d[k + 1] / 255, px.d[k + 2] / 255, THREE.SRGBColorSpace);
      } else c.copy(mat.color);
      kenneyTone(c);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    m.geometry = g;
    m.material = new THREE.MeshLambertMaterial({ vertexColors: true });
  });
  return o;
}
// An engine with a moving arm: the frame and the arm baked apart at one scale, the arm about its own pivot.
// `length` is the size in metres along the engine's longest ground side; `turn` turns its front to +z.
async function engine(name, armNode, { length, height, turn = 0 }) {
  const o = await kenney(name);
  const g = new THREE.Group(); g.add(o); o.rotation.y = turn;
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
  const k = height ? height / s.y : length / Math.max(s.x, s.z);
  const arm = armNode && o.getObjectByName(armNode);
  // the arm keeps its place's rotation and scale, with its pivot moved to the origin
  const wm = arm ? arm.matrixWorld.clone() : null;
  if (arm) arm.parent.remove(arm);
  const place = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -b.min.y, -mid.z));
  const frame = split(g).gear.applyMatrix4(place);
  if (!arm) return { frame };
  const pivot = new THREE.Vector3().setFromMatrixPosition(wm);
  wm.setPosition(0, 0, 0);
  const holder = new THREE.Group();
  arm.matrixAutoUpdate = false; arm.matrix.copy(wm);
  holder.add(arm);
  const armGeo = split(holder).gear.applyMatrix4(new THREE.Matrix4().makeScale(k, k, k));
  const pv = pivot.sub(new THREE.Vector3(mid.x, b.min.y, mid.z)).multiplyScalar(k);
  return { frame, arm: armGeo, pivot: pv.toArray().map(v => +v.toFixed(2)) };
}

// ---- units ----
const PLATE_ALL = ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR'];
const SURCOAT = R.ARMOUR.sword[1];
const plate = (colour, bones = PLATE_ALL) => [{ ...SURCOAT, bones: ['Abdomen', 'Hips'], push: 0.025 }, { bones, push: 0.028, color: colour, metal: true }];
const teamMat = (shade = 1) => { const m = new THREE.MeshLambertMaterial({ color: '#ffffff' }); m.userData.team = shade; return m; };
// Seat a rider on the Quaternius horse; the saddle cloth (and a knight's caparison) take the team colour.
async function mount(fig, { caparison } = {}) {
  const h = await R.horse(0, { skin: !!fig.group.userData.skin });
  h.group.traverse(m => { if (m.isMesh && m.userData.saddleCloth) m.material = teamMat(1); });
  const g = new THREE.Group();
  g.add(h.group);
  fig.group.position.set(0, h.saddle.y + 0.08 - fig.bones.hips.y, h.saddle.z - fig.bones.hips.z);
  g.add(fig.group);
  if (caparison) {
    // a cloth fitted over the horse's body: its own triangles between chest and tail, pushed out and hanging a little lower
    h.group.updateMatrixWorld(true);
    const tris = [], v = new THREE.Vector3();
    h.group.traverse(m => {
      if (!m.isMesh || m.userData.saddleCloth) return;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = geo.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const t = [0, 1, 2].map(k => v.fromBufferAttribute(p, i + k).applyMatrix4(m.matrixWorld).clone());
        const cy = (t[0].y + t[1].y + t[2].y) / 3, cz = (t[0].z + t[1].z + t[2].z) / 3;
        if (cy > h.saddle.y * 0.55 && cz > h.saddle.z - 0.62 && cz < h.saddle.z + 0.72) for (const q of t) tris.push(q.x, q.y, q.z);
      }
    });
    let shell = new THREE.BufferGeometry();
    shell.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    shell = mergeVertices(shell, 1e-3); shell.computeVertexNormals();
    const p = shell.attributes.position, n = shell.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.05, p.getY(i) + n.getY(i) * 0.05 - (p.getY(i) < h.saddle.y * 0.8 ? 0.12 : 0), p.getZ(i) + n.getZ(i) * 0.05);
    const cap = new THREE.Mesh(shell, teamMat(0.85));
    h.group.add(cap);
  }
  return g;
}
// A crossbow in the right hand: a stock with the bow turned crosswise at its front. Built in the hand's prop frame
// (skin.js): the stock along +x from the grip, the bow's limbs along y, its back toward +x.
async function crossbow(fig) {
  const g = new THREE.Group();
  g.userData.prop = { slot: 'R', item: 'crossbow', canon: new THREE.Matrix4() };
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.07), new THREE.MeshLambertMaterial({ color: '#6b4a2e' }));
  stock.position.x = 0.22;
  g.add(stock);
  const bow = await R.gearModel('W_Bow_Wooden');
  bow.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(bow).getSize(new THREE.Vector3());
  bow.scale.multiplyScalar(0.62 / Math.max(s.x, s.y, s.z));
  bow.position.x = 0.5;
  g.add(bow);
  placeHeld(fig, g, 'R');
}
// Until a clip moves it, a held thing made here sits at the hand as the bake posed it (the game redraws it anyway).
function placeHeld(fig, g, at) { g.position.copy(fig.bones[at]); fig.group.add(g); }
// A villager's tools, each shown only while its work clip plays (skin.js): an axe, a pick and a hoe, held as the
// clip review holds them. (What he carries the game draws itself: a crate of the goods, in his arms.)
function tools(fig) {
  const wood = plain('#7a5a3a'), iron = plain('#8d979c');
  const tool = (slot, shaft, head, at) => {
    const g = new THREE.Group();
    g.userData.prop = { slot, item: 'tool', canon: new THREE.Matrix4() };
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, shaft, 6), wood);
    s.rotation.z = -Math.PI / 2; s.position.x = shaft * 0.15; g.add(s);
    head.position.x = at; g.add(head);
    placeHeld(fig, g, 'R');
  };
  tool('AXE', 0.85, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.28), iron), 0.55);
  tool('PICK', 0.85, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 4).rotateX(Math.PI / 2), iron), 0.55);
  tool('HOE', 1.5, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.15), iron), 1.0);
}
const plume = fig => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 5), teamMat(1));
  m.position.set(fig.head.getCenter(new THREE.Vector3()).x, fig.head.max.y + 0.2, fig.head.getCenter(new THREE.Vector3()).z - 0.03);
  m.rotation.x = -0.35;
  m.userData.attach = 'Head';
  fig.group.add(m);
};
const cape = fig => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.05), teamMat(0.8));
  const sh = fig.bones.shL.clone().add(fig.bones.shR).multiplyScalar(0.5);
  m.position.set(sh.x, sh.y - 0.38, sh.z - 0.2);
  m.rotation.x = 0.18;
  fig.group.add(m);
};
// ---- headwear and coats made here, sized to the measured head ----
const plain = c => new THREE.MeshLambertMaterial({ color: c });
const GOLD = '#d8b04a', STEEL = '#b9c0c8';
const headAt = fig => ({ c: fig.head.getCenter(new THREE.Vector3()), s: fig.head.getSize(new THREE.Vector3()), top: fig.head.max.y });
const put = (fig, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); fig.group.add(m); return m; };
// headwear moves with the head, rigidly
const hat = (...a) => { const m = put(...a); m.userData.attach = 'Head'; return m; };
// A gold circlet with five points, just above the brow.
const coronet = fig => {
  const { c, s, top } = headAt(fig), r = Math.max(s.x, s.z * 0.9) * 0.52, y = top - s.y * 0.2;
  hat(fig, new THREE.CylinderGeometry(r, r * 0.96, 0.07, 14, 1, true), plain(GOLD), c.x, y, c.z).material.side = THREE.DoubleSide;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    hat(fig, new THREE.ConeGeometry(0.028, 0.1, 4), plain(GOLD), c.x + Math.sin(a) * r, y + 0.08, c.z + Math.cos(a) * r);
  }
};
// A broad-brimmed iron hat.
const kettleHat = (fig, colour = '#8c939b') => {
  const { c, s, top } = headAt(fig), r = s.x * 0.6;
  const dome = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  hat(fig, dome, plain(colour), c.x, top - r * 0.75, c.z);
  hat(fig, new THREE.CylinderGeometry(r * 1.6, r * 1.75, 0.03, 14), plain(colour), c.x, top - r * 0.75, c.z);
};
// A flat-topped great helm over the whole head, with a dark eye slit and a cross of breaths.
const greatHelm = (fig, colour = STEEL) => {
  const { c, s, top } = headAt(fig), r = Math.max(s.x, s.z) * 0.6, h = s.y * 0.95;
  hat(fig, new THREE.CylinderGeometry(r, r * 1.04, h, 12), plain(colour), c.x, top - h / 2 + 0.03, c.z);
  hat(fig, new THREE.CylinderGeometry(r * 0.9, r, 0.04, 12), plain(colour), c.x, top + 0.04, c.z);
  hat(fig, new THREE.BoxGeometry(r * 1.5, 0.025, 0.04), plain('#1c1c1c'), c.x, top - h * 0.3, c.z + r * 0.98);
  hat(fig, new THREE.BoxGeometry(0.03, h * 0.4, 0.03), plain('#5a6068'), c.x, top - h * 0.62, c.z + r * 1.0);
};
// A quilted coat over chest, belly and upper arms.
const GAMBESON = { bones: ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR', 'Hips'], push: 0.035, color: '#b9a98a' };
// A long cloak from the shoulders: hangs to the calves standing, falls over the horse's back when riding.
const longCloak = (fig, riding) => {
  const sh = fig.bones.shL.clone().add(fig.bones.shR).multiplyScalar(0.5), w = fig.bones.shL.distanceTo(fig.bones.shR) + 0.2;
  const len = riding ? 1.3 : sh.y - 0.35;
  const geo = new THREE.CylinderGeometry(w * 0.45, w * 0.7, len, 10, 1, true, Math.PI / 2, Math.PI);
  geo.translate(0, -len / 2, 0);
  const m = put(fig, geo, teamMat(0.5), sh.x, sh.y + 0.04, sh.z - 0.04);
  m.material.side = THREE.DoubleSide;
  if (riding) { m.rotation.x = 0.5; m.position.z -= 0.1; }
};
// A house banner on a tall pole: the flag in the team colour with a pale stripe, a gold finial.
function banner(fig, { h = 3.6, at = fig.bones.R } = {}) {
  const g = new THREE.Group(), add = (geo, mat, y, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, z); g.add(m); };
  add(new THREE.CylinderGeometry(0.03, 0.035, h, 6), plain('#5a4030'), h / 2 - 0.9);
  add(new THREE.BoxGeometry(0.04, 1.2, 0.9), teamMat(1), h - 1.5, -0.47);
  add(new THREE.BoxGeometry(0.045, 0.18, 0.9), teamMat(0.55), h - 1.5, -0.47);
  add(new THREE.ConeGeometry(0.06, 0.18, 6), plain(GOLD), h - 0.82);
  g.position.copy(at); fig.group.add(g);
}

// Lords ride with a bannerman at their shoulder, two riders in one model, so they stay posed (not animated).
async function lordParty(body, tint) {
  const f = await people(body, { seated: true, hold: ['Hold_Sword_R'], skin: false, armour: plate('#e3e6ea', ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR']), tint: { Green: 'team', LightGreen: 'team2', Blue: 'team', ...tint } });
  coronet(f);
  longCloak(f, true);
  await R.hang(f, R.KIT.sword[0]);
  const lord = await mount(f, { caparison: true });
  const b = await people('Male_Adventurer', { seated: true, skin: false, armour: [GAMBESON, SURCOAT] });
  kettleHat(b);
  banner(b);
  const bearer = await mount(b);
  bearer.position.set(1.6, 0, -0.9);
  const g = new THREE.Group(); g.add(lord, bearer);
  return g;
}
// ---- Norrhold's host: northern, wintry ----
// A big rough-coated war dog, facing +z: grey with a pale chest, a team cloth over the shoulders and a
// spiked collar. About 0.8 m at the shoulder.
function warDog() {
  const g = new THREE.Group(), fur = plain('#5d5650'), pale = plain('#b8ae9e'), dark = plain('#2b2622');
  const add = (geo, mat, x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const ball = new THREE.IcosahedronGeometry(1, 1);
  add(ball, fur, 0, 0.62, -0.12, { sx: 0.24, sy: 0.24, sz: 0.5 });          // body
  add(ball, fur, 0, 0.68, 0.24, { sx: 0.28, sy: 0.3, sz: 0.3 });            // deep chest and shoulders
  add(ball, pale, 0, 0.58, 0.38, { sx: 0.17, sy: 0.2, sz: 0.12 });          // pale chest
  add(new THREE.CylinderGeometry(0.11, 0.15, 0.36, 7), fur, 0, 0.86, 0.46, { rx: 0.75 });   // neck
  add(new THREE.BoxGeometry(0.26, 0.24, 0.3), fur, 0, 0.98, 0.62);          // head
  add(new THREE.BoxGeometry(0.17, 0.14, 0.24), pale, 0, 0.92, 0.86);        // muzzle
  add(new THREE.BoxGeometry(0.08, 0.06, 0.05), dark, 0, 0.96, 0.98);        // nose
  for (const s of [-1, 1]) {
    add(new THREE.ConeGeometry(0.06, 0.15, 4), fur, s * 0.09, 1.15, 0.58, { rz: -s * 0.25, rx: -0.2 });   // ears
    add(new THREE.CylinderGeometry(0.06, 0.045, 0.6, 6), fur, s * 0.13, 0.3, 0.3, { rx: -0.12 });         // fore legs
    add(new THREE.CylinderGeometry(0.075, 0.045, 0.6, 6), fur, s * 0.13, 0.31, -0.45, { rx: 0.18 });      // hind legs
    for (const z of [0.34, -0.38]) add(new THREE.BoxGeometry(0.1, 0.05, 0.14), dark, s * 0.13, 0.025, z + 0.03);   // paws
  }
  add(new THREE.CylinderGeometry(0.035, 0.05, 0.45, 5), fur, 0, 0.82, -0.66, { rx: -0.9 });    // tail, carried high
  const collar = add(new THREE.TorusGeometry(0.14, 0.035, 5, 10), teamMat(0.8), 0, 0.84, 0.5, { rx: 0.75 + Math.PI / 2 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 4), plain('#9aa0a6'));
    sp.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0); sp.rotation.z = a - Math.PI / 2; collar.add(sp);
  }
  // a short war-coat over the back in the team colour
  add(new THREE.CylinderGeometry(0.29, 0.31, 0.62, 10, 1, true, -Math.PI / 2, Math.PI), teamMat(1), 0, 0.64, 0.02, { rx: Math.PI / 2, sy: 1 }).material.side = THREE.DoubleSide;
  return g;
}
// Fur over the shoulders: a pale shaggy mantle.
const FUR = { bones: ['ShoulderL', 'ShoulderR', 'Chest', 'UpperArmL', 'UpperArmR'], push: 0.07, color: '#cfc4b0' };
const MAIL = { bones: ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR', 'Hips'], push: 0.03, color: '#7d848c', metal: true };
const NORRHOLD = {
  // A long two-handed bearded axe held across the body; mail under a fur mantle; no shield.
  axeman: async () => {
    const f = await people('Male_Adventurer', { hold: ['Hold_Axe_2H'], trimHair: true, armour: [{ ...SURCOAT, bones: ['Hips'], push: 0.03 }, MAIL, FUR], tint: { Green: 'team', LightGreen: 'team2', Blue: 'team', Brown: '#4a3b2e' } });
    await R.hang(f, { item: 'Helmet2', at: 'head' });
    // the right fist at the end of the haft, the left 0.42 m up it (Hold_Axe_2H)
    await R.hang(f, { item: 'W_Axe', hand: 'R', len: 1.75, grip: 0.04, edge: [0, 0, 1] });
    return f;
  },
  // Light: a felt hood and leather, a short spear in hand and heavy javelins slung on the back.
  javelin: async () => {
    const f = await people('Male_Adventurer', { hold: ['Hold_Spear_R'], trimHair: true, armour: [{ bones: ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR'], push: 0.03, color: '#7a5a3c' }, FUR] });
    await R.hang(f, { item: R.HELM.archer[0], tint: R.HELM.archer[1], at: 'head' });
    await R.hang(f, { item: 'W_Spear', hand: 'R', len: 1.9 });
    for (const [x, t] of [[-0.04, 8], [0, 10], [0.04, 12]]) await R.hang(f, { item: 'W_Spear', at: 'chest', len: 1.45, off: [x, -0.15, -0.24], rot: [-12, 0, -t] });
    return f;
  },
  wardog: async () => warDog(),
};

// Trial pieces for the line, shown beside today's soldiers before anything changes.
const TRIAL = {
  'trial.levy': async () => { const f = await people('Male_Farmer', { tint: FARMER, armour: [GAMBESON] }); kettleHat(f); await R.hang(f, R.KIT.spear[0]); return f; },
  'trial.helm': async () => { const f = await people('Male_Adventurer', { armour: plate('#b3bac2') }); greatHelm(f); await R.fitPads(f); for (const g of R.KIT.sword) await R.hang(f, g); return f; },
  'trial.kettle': async () => { const f = await people('Male_Adventurer', { armour: R.ARMOUR.spear }); kettleHat(f); await R.fitPads(f); for (const g of R.KIT.spear) await R.hang(f, g); return f; },
};
export { TRIAL };

// ---- armour levels ----
// Spearmen, swordsmen, bowmen and horse can go to war in no armour, leather, mail or plate, and spearmen and
// swordsmen with or without a shield. Each is baked as a body with its weapons (unit.<key>.base), a piece for
// each armour level (unit.<key>.none|leather|mail|plate: the coat over the body with its surcoat, the helmet,
// plate's shoulder pads) and a shield (unit.<key>.shield); the game puts them together (models.js unitLook).
export const ARMOUR_LEVELS = ['none', 'leather', 'mail', 'plate'];
const TORSO = ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR'], ARMS = ['UpperArmL', 'UpperArmR'];
// The team coat goes on first and the armour over it, so each level shows its armour over the chest, belly and arms
// and the coat's skirt shows the side below it.
const coat = (push, bones = ['Abdomen', 'Torso', 'Hips']) => ({ bones, push, color: 'team' });
const SHELLS = {
  none: () => [coat(0.03)],
  leather: () => [coat(0.025, ['Abdomen', 'Hips']), { bones: [...TORSO, ...ARMS], push: 0.022, color: '#6b4a2e' }],
  mail: () => [coat(0.025, ['Abdomen', 'Hips']), { bones: [...TORSO, ...ARMS], push: 0.024, color: '#6e747b', metal: true }],
  // bright steel down to the wrists, so plate reads apart from mail at a distance
  plate: L => [coat(0.025, ['Abdomen', 'Hips']), { bones: [...TORSO, ...ARMS, 'LowerArmL', 'LowerArmR'], push: 0.026, color: L.steel, metal: true }],
};
// Heads by level: bare, a boiled-leather cap, an iron kettle hat (or the type's own mail helm), the type's plate helm.
const HEADS = {
  none: () => {},
  leather: f => R.hang(f, { item: 'Helmet2', tint: { Grey: '#5e4128' }, at: 'head' }),
  mail: (f, L) => L.mailHelm ? R.hang(f, { item: L.mailHelm, at: 'head' }) : kettleHat(f),
  plate: async (f, L) => { await R.hang(f, { item: L.helm, at: 'head' }); if (L.pads) await R.fitPads(f); },
};
const hood = f => R.hang(f, { item: R.HELM.archer[0], tint: R.HELM.archer[1], at: 'head' });
// `hold` names the holding stances (roster.js) that put the hands on the kit; the shield arm keeps its stance
// whether or not the shield is carried.
const LEVELLED = {
  spear: { file: 'Male_Adventurer', hold: ['Hold_Spear_R', 'Hold_Shield_L'], steel: '#c0c6cd', helm: 'Helmet2', pads: true, kit: [R.KIT.spear[0]], shield: R.KIT.spear[1], default: 'plate' },
  sword: { file: 'Male_Adventurer', hold: ['Hold_Sword_R', 'Hold_Shield_L'], tint: { Brown: '#4a3b2e' }, steel: '#b3bac2', helm: 'Helmet1', pads: true, kit: [R.KIT.sword[0]], shield: R.KIT.sword[1], default: 'plate' },
  // bowmen keep their felt hood in a dark team shade at every level, so the side still shows
  archer: { file: 'Male_Adventurer', hold: ['Hold_Bow_L'], steel: '#c0c6cd', hood: true, kit: R.KIT.archer, default: 'leather' },
  crossbow: { file: 'Male_Adventurer', hold: ['Hold_Crossbow_2H'], steel: '#c0c6cd', helm: 'Helmet2', mailHelm: 'Helmet2', kit: [], arm: crossbow, default: 'mail' },
  cav: { file: 'Male_Adventurer', hold: ['Hold_Spear_R', 'Hold_Shield_L'], mounted: true, steel: '#c3c8ce', helm: 'Helmet1', mailHelm: 'Helmet3', pads: true, kit: R.KIT.cav, default: 'mail' },
  lightcav: { file: 'Male_Adventurer', hold: ['Hold_Spear_R'], mounted: true, steel: '#c0c6cd', hood: true, kit: [R.KIT.cav[0]], default: 'leather' },
};
export { LEVELLED };
// Hang whatever `fn` adds on the figure as one piece.
async function tagged(fig, part, fn) {
  const n = fig.group.children.length;
  await fn();
  for (const c of fig.group.children.slice(n)) c.userData.part = part;
}
async function soldier(key, level) {
  const L = LEVELLED[key];
  const f = await people(L.file, { seated: !!L.mounted, hold: L.hold, trimHair: true, armour: SHELLS[level](L), ...(L.tint ? { tint: { Green: 'team', LightGreen: 'team2', Blue: 'team', ...L.tint } } : {}) });
  if (L.hood) await hood(f);
  else await tagged(f, 'armour', () => HEADS[level](f, L));
  for (const g of L.kit) await R.hang(f, g);
  if (L.arm) await L.arm(f);
  if (L.shield) await tagged(f, 'shield', () => R.hang(f, L.shield));
  return L.mounted ? mount(f) : f;
}

const Q = R.FAMILIES.find(f => f.id === 'qmod');
const MORE_UNITS = {
  // the existing heavy cavalry, now with a team saddle cloth
  cav: async () => mount(await Q.build('cav', 0)),
  crossbow: async () => {
    const f = await people('Male_Adventurer', { armour: [{ bones: ['Abdomen', 'Torso', 'Chest', 'ShoulderL', 'ShoulderR'], push: 0.024, color: '#7d848c', metal: true }, SURCOAT] });
    await R.hang(f, { item: 'Helmet2', at: 'head' });
    await crossbow(f);
    return f;
  },
  lightcav: async () => {
    const f = await people('Male_Adventurer', { seated: true, armour: R.ARMOUR.archer });
    await R.hang(f, { item: R.HELM.archer[0], tint: R.HELM.archer[1], at: 'head' });
    await R.hang(f, R.KIT.cav[0]);
    return mount(f);
  },
  maa: async () => {
    const f = await people('Male_Adventurer', { hold: ['Hold_Sword_R', 'Hold_Shield_L'], trimHair: true, armour: plate('#a9b0b8') });
    await R.hang(f, { item: 'Helmet1', at: 'head' });
    await R.fitPads(f);
    await R.hang(f, { item: 'W_Axe', hand: 'R', len: 1.2, grip: 0.12, edge: [0, 0, 1] });
    await R.hang(f, R.KIT.sword[1]);
    return f;
  },
  knight: async () => {
    const f = await people('Male_King', { seated: true, hold: ['Hold_Spear_R', 'Hold_Shield_L'], trimHair: true, armour: plate('#c3c8ce') });
    await R.hang(f, { item: 'Helmet1', at: 'head' });
    await R.fitPads(f);
    await R.hang(f, { item: 'W_Spear', hand: 'R', len: 3.9 });
    await R.hang(f, R.KIT.cav[1]);
    return mount(f, { caparison: true });
  },
  captain: async () => {
    const f = await people('Male_King', { seated: true, hold: ['Hold_Sword_R'], trimHair: true, armour: plate('#d2d5d9') });
    await R.hang(f, { item: 'Helmet3', at: 'head' });
    plume(f);
    await R.fitPads(f);
    cape(f);
    await R.hang(f, R.KIT.sword[0]);
    return mount(f, { caparison: true });
  },
  // A great lord in the field: bare-headed under a gold coronet, a long house cloak over bright plate, a full
  // caparison, and a bannerman riding at his shoulder with the house banner.
  lord: async () => lordParty('Male_King', {}),
  lady: async () => lordParty('Female_Medieval', { Black: 'team', Brown: 'team3' }),
  // a camp tent: canvas walls in the team colour under a pale roof
  tent: async () => {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 8), new THREE.MeshLambertMaterial({ color: '#e8dfc8' }));
    roof.position.y = 3.1; g.add(roof);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 2, 8, 1, true), teamMat(0.9));
    wall.position.y = 1; g.add(wall);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.6), new THREE.MeshLambertMaterial({ color: '#5a4030' }));
    pole.position.y = 2.3; g.add(pole);
    return { group: g };
  },
};
for (const k of ['knight', 'captain', 'lightcav', 'cav']) MORE_UNITS[k].heavy = true;
// one lord on a field: a richer light version, two riders and two horses
for (const k of ['lord', 'lady']) MORE_UNITS[k].budget = 6000;
Object.assign(MORE_UNITS, NORRHOLD);

// ---- buildings with levels, and the new ones ----
// the pack cart's bed is 0.86 m up; `cutAbove` drops every triangle reaching above y (its awning and posts)
const BED = 0.86;
function cutAbove(o, maxY) {
  o.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  o.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(), P = g.attributes.position, keep = [];
    for (let i = 0; i < P.count; i += 3) {
      let top = -Infinity;
      for (let k = 0; k < 3; k++) top = Math.max(top, v.fromBufferAttribute(P, i + k).applyMatrix4(m.matrixWorld).y);
      if (top < maxY) keep.push(i, i + 1, i + 2);
    }
    const out = new THREE.BufferGeometry();
    for (const [name, A] of Object.entries(g.attributes)) {
      const a = new Float32Array(keep.length * A.itemSize);
      keep.forEach((s, k) => { for (let j = 0; j < A.itemSize; j++) a[k * A.itemSize + j] = A.array[s * A.itemSize + j]; });
      out.setAttribute(name, new THREE.BufferAttribute(a, A.itemSize));
    }
    m.geometry = out;
  });
  return o;
}
const MORE_BUILDINGS = {
  // forts and army camps: the smallest palisaded Wonder fort
  fort: [[[rts('Wonder_FirstAge_Level1')]], 18],
  // A village keep is a lord's hall that grows: timber tower-house, stone-and-timber hall, great hall between stone
  // towers, then the stone castle and the fortress. (The town-centre models read as squares, not keeps.)
  'keep.1': [[[rts('TowerHouse_FirstAge')]], 16],
  'keep.2': [[[rts('TowerHouse_SecondAge')]], 18],
  'keep.3': [[[rts('Barracks_SecondAge_Level3')]], 22],
  // (no curtain walls on a village keep: walls are built separately, and a walled keep on the map read as a castle)
  'keep.4': [[[rts('Wonder_SecondAge_Level1')], [rts('WatchTower_SecondAge_Level2'), -3.36, -2.66, 0, 0, 0.85]], 24],
  'keep.5': [[[rts('Wonder_SecondAge_Level1')], [rts('WatchTower_SecondAge_Level2'), -3.36, -2.66, 0, 0, 0.85],
    [rts('WatchTower_SecondAge_Level2'), 3.36, -2.66, 0, 0, 0.85]], 26],
  // the Wonder castles: wood fort, wood castle, stone castle, fortress
  'castle.1': [[[rts('Wonder_FirstAge_Level2')]], 30, 'Wonder_FirstAge_Level3'],
  'castle.2': [[[rts('Wonder_FirstAge_Level3')]], 30],
  'castle.3': [[[rts('Wonder_SecondAge_Level2')]], 30, 'Wonder_FirstAge_Level3'],
  'castle.4': [[[rts('Wonder_SecondAge_Level3')]], 30, 'Wonder_FirstAge_Level3'],
  storehouse: [[[rts('Storage_FirstAge_Level2')]], 9],
  market: [[[rts('Market_FirstAge_Level2')]], 12],
  tanner: [[[mvp('House_2')], [mvp('Barrel'), 3.2, 1.8], [mvp('Bags'), 3.2, -1.2]], 8],
  armourer: [[[rts('Barracks_FirstAge_Level1')], [mvp('Cauldron'), 4.5, 2.5]], 8],
  stable: [[[mvp('Stable')], [mvp('Hay'), 4, 2]], 11],
  mill: [[[rts('Windmill_FirstAge')], [mvp('Bags'), 3.2, 2]], 8],
  bakery: [[[mvp('House_1')], [mvp('Bags'), 3, 2], [mvp('Barrel'), -3, 2]], 7.5],
  siegeworks: [[[rts('Storage_FirstAge_Level3')], [rts('Logs'), 5, 3], [mvp('Cart'), -5, 3.5, 0.6]], 13],
  watchtower: [[[rts('WatchTower_FirstAge_Level1')]], 4.5, 'WatchTower_FirstAge_Level2'],
  monastery: [[[rts('Temple_FirstAge_Level2')]], 18],
  // the realm's one cathedral: the pack's great stone temple, spires and all
  cathedral: [[[rts('Temple_SecondAge_Level3')]], 19],
  dock: [[[rts('Port_FirstAge_Level1')]], 12],
  wagon: [[[mvp('Cart')]], 3.6],
  // the world map's carts: a merchant's, its awning over bales, a barrel and a crate; and a supply run's, the
  // awning taken off and the bed piled with timber, a crate and stone (both the cart's 2.4 m length scaled like `wagon`)
  'wagon.trade': [[[mvp('Cart')], [mvp('Bags'), 0, 0.35, 0.3, BED], [mvp('Bags'), 0.05, 0.3, -0.4, BED + 0.2, 0.85],
    [mvp('Bags'), 0.25, 0.6, 1.2, BED, 0.8], [mvp('Barrel'), -0.3, -0.35, 0, BED], [mvp('Crate'), 0.28, -0.35, 0.3, BED]], 3.6],
  'wagon.run': [[[async () => cutAbove(await R.mvpModel('Cart'), 1)], [rts('Logs'), 0, 0.1, Math.PI / 2, BED, 0.14],
    [rts('Crate_Stack1'), 0.22, -0.6, 0.2, BED, 0.55], [mvp('Bags'), -0.15, -0.55, 0, BED + 0.2, 0.8],
    [rts('Resource_Rock_2'), -0.2, 0.75, 0, BED - 0.05, 0.1]], 3.6],
  well: [[[mvp('Well')]], 3.2],
  // a village's chapel: the timber stave temple, not the abbey's great one
  chapel: [[[rts('Temple_FirstAge_Level1')]], 11],
};
// Upgrade levels: `<kind>.2` and `<kind>.3`, each sized against its level-one model so the step up shows.
const LEVELS = {
  storehouse: ['Storage_FirstAge_Level2', 'Storage_FirstAge_Level3', 'Storage_SecondAge_Level2', 9],
  market: ['Market_FirstAge_Level2', 'Market_FirstAge_Level3', 'Market_SecondAge_Level2', 12],
  // (the stone-towered barracks is the level III keep, so the barracks stays timber)
  barracks: ['Barracks_FirstAge_Level2', 'Barracks_FirstAge_Level3', 'Barracks_SecondAge_Level1', 11],
  bowyer: ['Archery_FirstAge_Level1', 'Archery_FirstAge_Level2', 'Archery_SecondAge_Level1', 7],
  watchtower: ['WatchTower_FirstAge_Level1', 'WatchTower_FirstAge_Level2', 'WatchTower_SecondAge_Level2', 4.5],
  chapel: ['Temple_FirstAge_Level1', 'Temple_FirstAge_Level2', 'Temple_SecondAge_Level1', 11],
};
const sizedBy = (name, ref, width) => [[[rts(name)]], width, ref];
for (const [kind, [one, two, three, width]] of Object.entries(LEVELS)) {
  MORE_BUILDINGS[kind + '.2'] = sizedBy(two, one, width);
  MORE_BUILDINGS[kind + '.3'] = sizedBy(three, one, width);
}
// (the pack's first-age Level1 and Level2 houses are open frames that read as building sites, so a
// level-one house is the closed first-age hut and the two upgrades are second-age tiled houses)
for (const st of [1, 2, 3]) {
  MORE_BUILDINGS[`house.${st - 1}.2`] = sizedBy(`Houses_SecondAge_${st}_Level1`, `Houses_FirstAge_${st}_Level3`, 6.5);
  MORE_BUILDINGS[`house.${st - 1}.3`] = sizedBy(`Houses_SecondAge_${st}_Level2`, `Houses_FirstAge_${st}_Level3`, 6.5);
}
MORE_BUILDINGS['farm.2'] = [[[rts('Farm_FirstAge_Level3')], [rts('Farm_FirstAge_Level3_Wheat')]], 17, 'Farm_FirstAge_Level2'];

// ---- walls, towers and gates, to the battle's measurements (length on x, outer face toward -z) ----
async function wallParts() {
  if (wallParts.done) return wallParts.done;
  const stone = await packColour('Wall_SecondAge', 'Stone_Light'), stoneDark = await packColour('Wall_SecondAge', 'Stone');
  const wood = await packColour('Wall_FirstAge', 'Wood'), iron = lin('#3b3f45');
  return (wallParts.done = { stone, stoneDark, wood, iron });
}
// merlons along the outer edge of a wall top
const merlons = (len, y, z, colour, { w = 0.8, h = 1, d = 0.45, step = 1.6 } = {}) => {
  const out = [], n = Math.round(len / step);
  for (let i = 0; i < n; i++) out.push(block(w, h, d, colour, -len / 2 + step * (i + 0.5), y, z));
  return out;
};
const rubble = (len, depth, colour, seed = 1) => {
  let r = seed; const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < 26; i++) {
    const s = 0.5 + rand() * 1.1;
    out.push(block(s, s * 0.7, s, colour, (rand() - 0.5) * len, 0, (rand() - 0.5) * depth * 1.6, { ry: rand() * 3 }));
  }
  return out;
};
async function stoneWall() {
  const { stone } = await wallParts();
  const body = fitBox(await rtsFlat('Wall_SecondAge'), [10, 5, 2.5]);
  return join([body, ...merlons(10, 5, -1.02, stone)]);
}
// A rough palisade: pointed stakes of uneven height, thickness and lean, lashed to a rail, with a plank fighting deck
// behind at 3.5 m on posts and braces. `from`..`to` limits it along x (for the gate's two sides).
function seeded(seed) { let r = seed; return () => (r = (r * 16807) % 2147483647) / 2147483647; }
// `broken` snaps most of them off short, splintered rather than pointed.
async function stakes(from, to, seed, { z = -0.5, base = 4.1, spread = 0.75, broken = false } = {}) {
  const { wood } = await wallParts(), rand = seeded(seed), out = [];
  const tones = [wood, wood.clone().multiplyScalar(0.78), wood.clone().multiplyScalar(0.62), wood.clone().lerp(lin('#9a8466'), 0.35)];
  for (let x = from + 0.25; x < to - 0.1; x += 0.46 + rand() * 0.1) {
    const r = 0.2 + rand() * 0.09, tone = tones[Math.floor(rand() * tones.length)];
    const snapped = broken && rand() < 0.85, h = snapped ? 0.5 + rand() * 1.1 : base + rand() * spread;
    const log = new THREE.CylinderGeometry(r * 0.92, r, h, 6); log.translate(0, h / 2, 0);
    const tip = snapped ? new THREE.ConeGeometry(r * 0.9, 0.3, 3) : new THREE.ConeGeometry(r * 0.92, 0.45 + rand() * 0.25, 6);
    tip.translate(0, h + (snapped ? 0.1 : 0.22), 0);
    const g = join([solid(log, tone), solid(tip, tone.clone().multiplyScalar(0.92))]);
    g.rotateZ((rand() - 0.5) * 0.09); g.rotateX((rand() - 0.5) * 0.07);
    g.translate(x, -0.25, z + (rand() - 0.5) * 0.12);
    out.push(g);
  }
  return out;
}
async function deck(from, to, { y = 3.5, z0 = -0.2, z1 = 0.75 } = {}) {
  const { wood } = await wallParts(), plank = wood.clone().multiplyScalar(0.88), dark = wood.clone().multiplyScalar(0.6), out = [];
  const w = z1 - z0, n = 4;
  for (let i = 0; i < n; i++) out.push(block(to - from, 0.12, w / n - 0.03, i % 2 ? plank : plank.clone().multiplyScalar(0.93), (from + to) / 2, y - 0.12, z0 + w / n * (i + 0.5)));
  out.push(block(to - from, 0.16, 0.14, dark, (from + to) / 2, 2.6, -0.3));   // the rail the stakes are lashed to
  for (let x = from + 1; x < to; x += 2.6) {
    out.push(block(0.2, y - 0.12, 0.2, dark, x, 0, z1 - 0.1));
    out.push(block(0.12, 1.9, 0.12, dark, x, 1.2, (z0 + z1) / 2, { rx: 0.62 }));
  }
  return out;
}
async function woodWall(seed = 11) {
  return join([...await stakes(-5, 5, seed), ...await deck(-5, 5)]);
}
// A timber tower to go with the palisade: corner logs, braces, a platform at 6.3 m behind a stake parapet, a shingle roof.
async function woodTower(seed = 17) {
  const { wood } = await wallParts(), dark = wood.clone().multiplyScalar(0.62), R = 3, top = 6.3, out = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const log = new THREE.CylinderGeometry(0.26, 0.3, top + 3.2, 6); log.translate(x * (R - 0.35), (top + 3.2) / 2, z * (R - 0.35));
    out.push(solid(log, dark));
  }
  // cross braces on each side, and a skirt of stakes round the bottom
  for (const t of [0.72, -0.72]) for (const e of [-1, 1]) {
    out.push(block(0.14, 6.6, 0.14, dark, 0, 3.1, e * (R - 0.35), { rz: t }));
    out.push(block(0.14, 6.6, 0.14, dark, e * (R - 0.35), 3.1, 0, { rx: t }));
  }
  out.push(block(R * 2 + 0.3, 0.2, R * 2 + 0.3, wood.clone().multiplyScalar(0.85), 0, top - 0.2, 0));
  for (let side = 0; side < 4; side++) {
    const g = join(await stakes(-R, R, seed + side, { z: 0, base: 1.1, spread: 0.3 }));
    g.translate(0, top, -R + 0.15); g.rotateY(side * Math.PI / 2);
    out.push(g);
    const skirt = join(await stakes(-R + 0.3, R - 0.3, seed + 9 + side, { z: 0, base: 2, spread: 0.6 }));
    skirt.translate(0, 0, -R + 0.3); skirt.rotateY(side * Math.PI / 2);
    out.push(skirt);
  }
  const roof = new THREE.ConeGeometry(R * 1.35, 2.6, 4); roof.rotateY(Math.PI / 4); roof.translate(0, top + 3.2 + 1.2, 0);
  out.push(solid(roof, lin('#6d5a48')));
  return join(out);
}
// a tower cut from the end of the pack's walled pair of towers
async function towerFrom(name, dims) {
  const g = await rtsFlat(name), s = size(g);
  g.computeBoundingBox();
  const maxX = g.boundingBox.max.x, cut = maxX - s.z * 1.15;
  return unflag(fitBox(crop(g, x => x > cut), dims));
}
// Take off the pack's red pennant (and its pole above the cloth), which reads as an enemy's mark.
function unflag(g) {
  const p = g.attributes.position, c = g.attributes.color;
  const red = i => c.getX(i) > c.getY(i) * 2 && c.getX(i) > c.getZ(i) * 2;
  let low = Infinity;
  for (let i = 0; i < p.count; i++) if (red(i)) low = Math.min(low, p.getY(i));
  if (low === Infinity) return g;
  const keep = new Set();
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    if (!red(i) && y < low) keep.add(i);
  }
  let k = 0;
  return crop(g, () => keep.has((k++) * 3));
}
async function gate(kind) {
  const { stone, stoneDark, wood } = await wallParts();
  if (kind === 'stone') {
    const side = async x => { const g = fitBox(await rtsFlat('Wall_SecondAge'), [2.5, 5, 2.5]); g.translate(x, 0, 0); return g; };
    return join([await side(-3.75), await side(3.75),
      block(1, 6.2, 2.9, stoneDark, -2.9, 0, 0), block(1, 6.2, 2.9, stoneDark, 2.9, 0, 0),
      block(5, 1.1, 2.5, stone, 0, 3.9, 0), ...merlons(10, 5, -1.02, stone)]);
  }
  // the palisade either side, two tall gate posts and a beam, and the deck carried over the gateway
  const dark = wood.clone().multiplyScalar(0.6);
  const post = x => { const g = new THREE.CylinderGeometry(0.34, 0.38, 5.4, 6); g.translate(x, 2.7, -0.5); return solid(g, dark); };
  return join([...await stakes(-5, -2.7, 23), ...await stakes(2.7, 5, 29), post(-2.65), post(2.65),
    block(6.2, 0.4, 0.5, dark, 0, 4.9, -0.5), ...await deck(-5, 5)]);
}
// Door leaves fill the opening under the deck (wood, 3.3 m) or the lintel (stone, 3.8 m).
async function door(kind) {
  const { wood, iron } = await wallParts(), h = kind === 'stone' ? 3.8 : 3.3;
  const plank = wood.clone().multiplyScalar(kind === 'stone' ? 0.6 : 0.8);
  const leaf = x => [block(2.45, h, 0.22, plank, x, 0, 0), ...[0.6, h / 2, h - 0.6].map(y => block(2.3, 0.18, 0.26, iron, x, y - 0.09, 0)),
    block(0.14, h * 0.9, 0.26, plank.clone().multiplyScalar(0.8), x, h / 2, 0.02, { rz: x < 0 ? 0.5 : -0.5 })];
  return join([...leaf(-1.25), ...leaf(1.25)]);
}
// What is left of a fallen tower or gate: a stump and a spill of rubble.
async function brokenTower(kind) {
  const { stone, stoneDark, wood } = await wallParts();
  if (kind === 'stone') return join([stump(crop(await towerFrom('WallTowers_SecondAge', [8, 11, 8]), (x, y) => y < 7), 3.6, 5), ...rubble(8, 8, stone, 13).slice(0, 18), ...rubble(7, 7, stoneDark, 19).slice(0, 10)]);
  const out = [];
  for (let side = 0; side < 4; side++) {
    const g = join(await stakes(-2.7, 2.7, 26 + side, { z: 0, broken: true })); g.translate(0, 0, -2.7); g.rotateY(side * Math.PI / 2); out.push(g);
  }
  return join([...out, ...rubble(6, 6, wood.clone().multiplyScalar(0.7), 21).slice(0, 14)]);
}
async function brokenGate(kind) {
  const { stone, stoneDark, wood } = await wallParts();
  if (kind === 'wood') return join([...await stakes(-5, -2.4, 23, { broken: true }), ...await stakes(2.4, 5, 29, { broken: true }), ...rubble(10, 1.5, wood.clone().multiplyScalar(0.7), 31).slice(0, 18)]);
  return join([stump(await gate(kind), 2.6, 9), ...rubble(10, kind === 'stone' ? 2.5 : 1.5, kind === 'stone' ? stone : wood.clone().multiplyScalar(0.7), 31).slice(0, 18)]);
}
const ENGINES = {};
async function engines() {
  if (ENGINES.done) return ENGINES;
  ENGINES.ram = await engine('siege-ram', null, { length: 6, turn: -Math.PI / 2 });
  ENGINES.mangonel = await engine('siege-catapult', 'catapult', { length: 4, turn: -Math.PI / 2 });
  ENGINES.trebuchet = await engine('siege-trebuchet', 'arm', { height: 9, turn: -Math.PI / 2 });
  ENGINES.tower = await engine('siege-tower', null, { height: 10, turn: -Math.PI / 2 });
  ENGINES.done = true;
  return ENGINES;
}
function ladder() {
  const wood = lin('#7a5a3a'), out = [block(0.12, 0.1, 8, wood, -0.36, 0, 4), block(0.12, 0.1, 8, wood, 0.36, 0, 4)];
  for (let z = 0.4; z < 8; z += 0.45) out.push(block(0.72, 0.06, 0.07, wood, 0, 0.02, z));
  return join(out);
}
Object.assign(MORE_BUILDINGS, {
  'wall.stone': stoneWall,
  'wall.wood': woodWall,
  'wall.stone.broken': async () => { const { stone, stoneDark } = await wallParts(); return join([stump(await stoneWall(), 2.2, 3), ...rubble(10, 2.5, stone, 3), ...rubble(9, 2.5, stoneDark, 7).slice(0, 12)]); },
  'wall.wood.broken': async () => { const { wood } = await wallParts(); return join([...await stakes(-5, 5, 11, { broken: true }), ...rubble(10, 1.5, wood.clone().multiplyScalar(0.75), 5).slice(0, 16)]); },
  'tower.stone': () => towerFrom('WallTowers_SecondAge', [8, 11, 8]),
  'tower.wood': () => woodTower(),
  'tower.stone.broken': () => brokenTower('stone'),
  'tower.wood.broken': () => brokenTower('wood'),
  'gate.stone.broken': () => brokenGate('stone'),
  'gate.wood.broken': () => brokenGate('wood'),
  'gate.stone': () => gate('stone'),
  'gate.wood': () => gate('wood'),
  'gate.stone.door': () => door('stone'),
  'gate.wood.door': () => door('wood'),
  'siege.ram': async () => (await engines()).ram.frame,
  'siege.mangonel': async () => (await engines()).mangonel.frame,
  'siege.mangonel.arm': async () => (await engines()).mangonel.arm,
  'siege.trebuchet': async () => (await engines()).trebuchet.frame,
  'siege.trebuchet.arm': async () => (await engines()).trebuchet.arm,
  'siege.tower': async () => (await engines()).tower.frame,
  'siege.ladder': async () => ladder(),
  'siege.stone': async () => solid(new THREE.IcosahedronGeometry(0.3, 0), '#8a857a'),
});
Object.assign(UNITS, MORE_UNITS);
for (const k of Object.keys(LEVELLED)) delete UNITS[k];   // baked in pieces instead (armour levels)
Object.assign(BUILDINGS, MORE_BUILDINGS);
export const pivots = async () => { const e = await engines(); return { mangonel: e.mangonel.pivot, trebuchet: e.trebuchet.pivot }; };

// What the game needs to animate a figure, saved with each of its meshes: the skeleton, whether it rides, the clip
// it stands in when nothing moves it, and what it holds (so the game picks the clips that suit the weapon).
const WEAPONS = { W_Spear: 'spear', W_Sword: 'sword', W_Axe: 'axe', crossbow: 'crossbow' };
function animInfo(group) {
  const rigs = new Set(), held = {};
  group.traverse(o => { if (o.userData.skin) rigs.add(o.userData.skin.rig); if (o.userData.prop) held[o.userData.prop.slot] = o.userData.prop.item; });
  if (!rigs.size) return null;
  const horse = rigs.has('horse'), weapon = WEAPONS[held.R] && (horse && held.R === 'W_Spear' ? 'lance' : WEAPONS[held.R]);
  return { rig: [...rigs].find(r => r !== 'horse'), horse, weapon: weapon || (held.BOW ? 'bow' : held.AXE ? 'tools' : null), shield: !!held.SHIELD, rest: horse ? 'Ride_Idle' : weapon ? 'Stand' : 'Idle' };
}

// The clip table the game plays the animated soldiers from (skin.js): assets/anim.json and assets/anim.bin.
export async function bakeAnim() {
  const { json, bin } = await SK.bakeClips();
  const a = await fetch('/save/anim.bin', { method: 'PUT', body: bin }), b = await fetch('/save/anim.json', { method: 'PUT', body: JSON.stringify(json) });
  return { saved: a.ok && b.ok, bytes: bin.byteLength, frames: json.height * json.rowFrames };
}

// `only` (a RegExp on 'unit.<key>' or 'building.<name>') bakes a subset for a quick look, without saving.
export async function bakeAll(only) {
  await MeshoptSimplifier.ready;
  const scene = new THREE.Scene(), mat = new THREE.MeshLambertMaterial({ vertexColors: true }), report = {};
  let info = null;
  const add = (name, geo) => { const m = new THREE.Mesh(geo, mat); m.name = name; if (info) m.userData.anim = info; scene.add(m); };
  for (const [key, make] of Object.entries(UNITS)) {
    if (only && !only.test('unit.' + key)) continue;
    const fig = await make();
    info = animInfo(fig.isObject3D ? fig : fig.group);
    const { gear, cloth, counts } = split(fig.isObject3D ? fig : fig.group);
    if (!gear || !cloth) throw new Error(`${key}: ${counts} gear/cloth pieces`);
    const full = { gear: compact(gear), cloth: compact(cloth) };
    const total = tri(full.gear) + tri(full.cloth), budget = make.budget || (make.heavy ? LIGHT * 1.6 : LIGHT);
    const light = { gear: compact(gear, budget * tri(full.gear) / total), cloth: compact(cloth, budget * tri(full.cloth) / total) };
    for (const part of ['gear', 'cloth']) { add(`unit.${key}.${part}`, full[part]); add(`unit.${key}.${part}.light`, light[part]); }
    report[key] = `${total} → ${tri(light.gear) + tri(light.cloth)}`;
  }
  for (const [key, L] of Object.entries(LEVELLED)) {
    if (only && !only.test('unit.' + key)) continue;
    const pieces = {};
    for (const level of ARMOUR_LEVELS) {
      const fig = await soldier(key, level), g = fig.isObject3D ? fig : fig.group;
      if (level === 'none') info = animInfo(g);
      if (level === 'none') { pieces.base = split(g, 'base'); if (L.shield) pieces.shield = split(g, 'shield'); }
      pieces[level] = split(g, 'armour');
    }
    const full = {};
    for (const [p, { gear, cloth }] of Object.entries(pieces)) full[p] = { gear: gear && compact(gear), cloth: cloth && compact(cloth) };
    const tris = p => (full[p].gear ? tri(full[p].gear) : 0) + (full[p].cloth ? tri(full[p].cloth) : 0);
    // the light version keeps the whole default soldier within the usual budget
    const k = (L.mounted ? LIGHT * 1.6 : LIGHT) / (tris('base') + tris(L.default) + (L.shield ? tris('shield') : 0));
    for (const [p, { gear, cloth }] of Object.entries(pieces)) for (const [part, geo] of [['gear', gear], ['cloth', cloth]]) {
      if (!geo) continue;
      add(`unit.${key}.${p}.${part}`, full[p][part]);
      add(`unit.${key}.${p}.${part}.light`, compact(geo, Math.max(4, tri(full[p][part]) * k)));
    }
    report[key] = Object.keys(pieces).map(p => `${p} ${tris(p)}`).join(', ');
  }
  info = null;
  for (const [name, recipe] of Object.entries(BUILDINGS)) {
    if (only && !only.test('building.' + name)) continue;
    const geo = await buildingGeo(recipe);
    add('building.' + name, geo);
    report[name] = tri(geo);
  }
  if (only) return { scene, report };
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const res = await fetch('/save/models.glb', { method: 'PUT', body: glb });
  return { saved: res.ok, bytes: glb.byteLength, report, anim: await bakeAnim() };
}
