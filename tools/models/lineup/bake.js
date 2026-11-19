// Bakes the chosen RTS models into one GLB for the game: run on roster.html?only=none, then call bakeAll().
// Soldiers split into "gear" (fixed colours) and "cloth" (team parts, stored as grey shades the game tints),
// each in a full and a light version. Buildings become one vertex-coloured mesh each.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const R = window.__roster, { THREE, C, MeshoptSimplifier, mergeGeometries, mergeVertices } = R;

// Every part of a figure, split by whether its material is a team colour.
function split(group) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert(), out = { gear: [], cloth: [] };
  group.traverse(part => {
    if (!part.isMesh) return;
    const src = part.geometry, g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(inv.clone().multiply(part.matrixWorld));
    const mats = [].concat(part.material), n = g.attributes.position.count;
    const groups = Array.isArray(part.material) && src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }];
    const vc = g.attributes.color, c = new THREE.Color();
    for (const gr of groups) {
      const m = mats[gr.materialIndex] || mats[0], team = m.userData.team;
      const end = Math.min(n, gr.start + gr.count), pos = [], col = [];
      for (let i = gr.start; i < end; i++) {
        if (team) c.setScalar(team);
        else { c.copy(m.color); if (vc) c.multiply(new THREE.Color(vc.getX(i), vc.getY(i), vc.getZ(i))); }
        pos.push(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i));
        col.push(c.r, c.g, c.b);
      }
      const y = new THREE.BufferGeometry();
      y.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      y.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      out[team ? 'cloth' : 'gear'].push(y);
    }
  });
  return { gear: out.gear.length ? mergeGeometries(out.gear) : null, cloth: out.cloth.length ? mergeGeometries(out.cloth) : null, counts: [out.gear.length, out.cloth.length] };
}

// Indexed, with unused vertices dropped; simplified toward `tris` when given.
function compact(geo, tris) {
  let g = mergeVertices(geo, 1e-4);
  let idx = g.index.array;
  if (tris) idx = MeshoptSimplifier.simplify(new Uint32Array(idx), new Float32Array(g.attributes.position.array), 3, Math.round(tris) * 3, 0.06)[0];
  const remap = new Map(), pos = [], col = [], P = g.attributes.position, Cc = g.attributes.color;
  const index = Array.from(idx, i => {
    if (!remap.has(i)) { remap.set(i, remap.size); pos.push(P.getX(i), P.getY(i), P.getZ(i)); col.push(Cc.getX(i), Cc.getY(i), Cc.getZ(i)); }
    return remap.get(i);
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(index);
  return out;
}
const tri = g => g.index.count / 3;

const qmod = R.FAMILIES.find(f => f.id === 'qmod');
const people = (file, opts) => R.bake('glb', 'assets/qmod/' + file + '.glb', { rig: 'qmod', team: 0, clip: 'Idle', height: 1.8, drop: n => n === 'Backpack' || n === 'Sword', tint: { Green: 'team', LightGreen: 'team2', Blue: 'team' }, ...opts });
// The farmer's shirt and neckerchief take the team colour (or a villager's dye).
const FARMER = { Beige: 'team', Red: 'team3' };
// The game's unit keys; the four line troops are exactly the lineup's Quaternius people.
const UNITS = {
  spear: () => R.figure(qmod, 'spear', 0),
  sword: () => R.figure(qmod, 'sword', 0),
  archer: () => R.figure(qmod, 'archer', 0),
  cav: () => R.figure(qmod, 'cav', 0),
  // villagers with spears and no armour
  militia: async () => { const f = await people('Male_Farmer', { tint: FARMER }); await R.hang(f, R.KIT.spear[0]); return f; },
  // leather and a hood, with an axe
  bandit: async () => {
    const f = await people('Male_Adventurer', { armour: R.ARMOUR.archer });
    await R.hang(f, { item: R.HELM.archer[0], tint: R.HELM.archer[1], at: 'head' });
    await R.hang(f, R.KIT.villager[0]);
    return f;
  },
  villager: () => people('Male_Farmer', { tint: FARMER }),
};
const LIGHT = 1500;

// [model makers placed at x, z], and the width in metres across the widest side
const rts = n => () => R.rtsModel(n), mvp = n => () => R.mvpModel(n);
const BUILDINGS = {
  'house.0': [[[rts('Houses_FirstAge_1_Level2')]], 6.5],
  'house.1': [[[rts('Houses_FirstAge_2_Level2')]], 6.5],
  'house.2': [[[rts('Houses_FirstAge_3_Level2')]], 6.5],
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
  // the keep grows through the town centre's three levels; all share level III's scale
  'keep.1': [[[rts('TownCenter_FirstAge_Level1')]], 24, 'TownCenter_FirstAge_Level3'],
  'keep.2': [[[rts('TownCenter_FirstAge_Level2')]], 24, 'TownCenter_FirstAge_Level3'],
  'keep.3': [[[rts('TownCenter_FirstAge_Level3')]], 24],
  castle: [[[rts('Wonder_FirstAge_Level3')]], 30],
};

// `scaleOf` sizes a building by another model's width, so upgrade levels keep their relative sizes.
async function buildingGeo([parts, width, scaleOf]) {
  const g = new THREE.Group();
  for (const [make, x = 0, z = 0] of parts) { const o = await make(); o.position.set(x, 0, z); g.add(o); }
  let size = width;
  if (scaleOf) {
    // scale by the reference model, then keep that size while centring
    const ref = new THREE.Box3().setFromObject(await R.rtsModel(scaleOf)).getSize(new THREE.Vector3());
    const own = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    size = Math.max(own.x, own.z) * width / Math.max(ref.x, ref.z);
  }
  const w = C.fit(g, size);
  const { gear } = split(w);
  return compact(gear);
}

export async function bakeAll() {
  await MeshoptSimplifier.ready;
  const scene = new THREE.Scene(), mat = new THREE.MeshLambertMaterial({ vertexColors: true }), report = {};
  const add = (name, geo) => { const m = new THREE.Mesh(geo, mat); m.name = name; scene.add(m); };
  for (const [key, make] of Object.entries(UNITS)) {
    const fig = await make();
    const { gear, cloth, counts } = split(fig.group);
    if (!gear || !cloth) throw new Error(`${key}: ${counts} gear/cloth pieces`);
    const full = { gear: compact(gear), cloth: compact(cloth) };
    const total = tri(full.gear) + tri(full.cloth), budget = key === 'cav' ? LIGHT * 1.6 : LIGHT;
    const light = { gear: compact(gear, budget * tri(full.gear) / total), cloth: compact(cloth, budget * tri(full.cloth) / total) };
    for (const part of ['gear', 'cloth']) { add(`unit.${key}.${part}`, full[part]); add(`unit.${key}.${part}.light`, light[part]); }
    report[key] = `${total} → ${tri(light.gear) + tri(light.cloth)}`;
  }
  for (const [name, recipe] of Object.entries(BUILDINGS)) {
    const geo = await buildingGeo(recipe);
    add('building.' + name, geo);
    report[name] = tri(geo);
  }
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const res = await fetch('/save/models.glb', { method: 'PUT', body: glb });
  return { saved: res.ok, bytes: glb.byteLength, report };
}
