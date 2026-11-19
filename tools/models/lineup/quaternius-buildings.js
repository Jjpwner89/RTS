// Quaternius "Medieval Village MegaKit" (CC0) buildings for the RTS model-option gallery.
// Pieces live in assets/quaternius/<Name>.gltf (+ .bin and shared T_*.png textures).
//
// Kit grid, read from the glTF accessor bounds:
//  - Wall pieces span x -1..1 (2 m), stand 3 m tall (top beam to 3.123), face +z.
//    The outer plaster face is at z = 0; plaster runs inward to z = -0.2.
//  - Corner posts sit on the corner point. Floors are 2 x 2 m tiles centred on the origin.
//  - Roof_RoundTiles_AxB: A m gable span along x, B m long along z, origin at wall-top height.
//  - Roof_Front_BrickA: the gable triangle for an A m span, faces +z, origin at wall-top.
//  - Overhang_*_Short: a ground-floor wall that coves out 1 m; the upper storey stands on the
//    line z = +1. Overhang_Side_*_Short_L/R close the ends of a coved run, both storeys high.
//
// Each building is built around its own origin (centre of the footprint, ground at y = 0),
// front (door side) facing +z.

import * as THREE from 'three';

export const QUAT_PIECES = [
  // walls
  'Wall_Plaster_Straight', 'Wall_Plaster_Straight', 'Wall_Plaster_Window_Wide_Flat',
  'Wall_Plaster_Door_Flat', 'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Flat',
  'Wall_UnevenBrick_Door_Flat', 'Overhang_UnevenBrick_Short',
  'Overhang_Side_Plaster_Short_L', 'Overhang_Side_Plaster_Short_R',
  // corners, doors, windows
  'Corner_Exterior_Wood', 'Corner_Exterior_Brick', 'Door_1_Flat', 'Door_4_Flat', 'DoorFrame_Flat_WoodDark',
  'Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Open', 'WindowShutters_Wide_Flat_Closed',
  // roofs
  'Roof_RoundTiles_4x6', 'Roof_RoundTiles_8x10', 'Roof_RoundTiles_4x8', 'Roof_Front_Brick4',
  'Roof_Front_Brick6', 'Roof_Front_Brick8', 'Roof_Wooden_2x1', 'Roof_Wooden_2x1_L', 'Roof_Wooden_2x1_R',
  // floors and props
  'Floor_WoodDark', 'Prop_Chimney', 'Prop_Wagon', 'Prop_Crate', 'Prop_WoodenFence_Single',
  'Prop_Support',
];

const HALF_PI = Math.PI / 2;
const CORE_MAT = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 });

// Small helper that drops cloned kit pieces into a group.
function makeKit(pieces, group) {
  const put = (name, x, y, z, rotY = 0, scale = null) => {
    const src = pieces[name];
    if (!src) throw new Error('Quaternius piece not loaded: ' + name);
    const o = src.clone(true);
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    if (scale) o.scale.set(scale[0], scale[1], scale[2]);
    group.add(o);
    return o;
  };

  // A rectangular ring of wall pieces on the footprint x in [-W/2, W/2], z in [-D/2, D/2]
  // (outer faces on those lines). pick(side, i, n) returns a piece name (or a list of names
  // that share the wall's transform, e.g. a wall plus its window and shutters), or null.
  // Sides run left-to-right as seen from outside.
  const ring = (W, D, y, pick) => {
    const nx = Math.round(W / 2), nz = Math.round(D / 2);
    const sides = [
      ['front', nx, (i) => [-W / 2 + 1 + 2 * i, D / 2], 0],
      ['right', nz, (i) => [W / 2, D / 2 - 1 - 2 * i], HALF_PI],
      ['back', nx, (i) => [W / 2 - 1 - 2 * i, -D / 2], Math.PI],
      ['left', nz, (i) => [-W / 2, -D / 2 + 1 + 2 * i], -HALF_PI],
    ];
    for (const [side, n, at, rot] of sides) {
      for (let i = 0; i < n; i++) {
        let names = pick(side, i, n);
        if (!names) continue;
        if (!Array.isArray(names)) names = [names];
        const [x, z] = at(i);
        for (const nm of names) put(nm, x, y, z, rot);
      }
    }
  };

  // Corner posts on the four corners of a W x D footprint.
  const corners = (W, D, y, name = 'Corner_Exterior_Wood', baseRot = 0) => {
    put(name, -W / 2, y, D / 2, baseRot);
    put(name, W / 2, y, D / 2, baseRot + HALF_PI);
    put(name, W / 2, y, -D / 2, baseRot + Math.PI);
    put(name, -W / 2, y, -D / 2, baseRot - HALF_PI);
  };

  // Gable roof with its ridge along x over a W (x) x D (z) footprint, eaves at height y.
  const gableRoof = (roofName, gableName, W, D, y) => {
    put(roofName, 0, y, 0, HALF_PI);
    put(gableName, W / 2, y, 0, HALF_PI);
    put(gableName, -W / 2, y, 0, -HALF_PI);
  };

  // A dark block filling the inside of a storey, so windows and door gaps show a shadowed
  // interior instead of the grass and sky through the empty shell.
  const core = (W, D, y, h = 3) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, h, D - 0.5), CORE_MAT);
    m.position.set(0, y + h / 2, 0);
    m.name = 'interior-core';
    group.add(m);
    return m;
  };

  return { put, ring, corners, gableRoof, core };
}

// ---------------------------------------------------------------- cottage
// 6 x 4 m, one storey, plaster and timber, door and two shuttered windows on the front,
// tiled gable roof (ridge along the long side), brick chimney on the back slope.
function cottage(pieces) {
  const g = new THREE.Group();
  g.name = 'quat-cottage';
  const k = makeKit(pieces, g);
  const W = 6, D = 4, H = 3;
  const win = ['Wall_Plaster_Window_Wide_Flat', 'Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Open'];
  k.ring(W, D, 0, (side, i) => {
    if (side === 'front') return i === 1 ? ['Wall_Plaster_Door_Flat', 'DoorFrame_Flat_WoodDark'] : win;
    if (side === 'back') return i === 1 ? ['Wall_Plaster_Window_Wide_Flat', 'Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Closed'] : 'Wall_Plaster_Straight';
    return i === 0 ? 'Wall_Plaster_Straight' : 'Wall_Plaster_Straight';
  });
  k.put('Door_1_Flat', -0.535, 0, D / 2 - 0.1, 0);
  k.core(W, D, 0);
  k.corners(W, D, 0);
  k.gableRoof('Roof_RoundTiles_4x6', 'Roof_Front_Brick4', W, D, H);
  k.put('Prop_Chimney', 1.8, 4.6, 0.8, 0);
  // small fenced garden against the left gable
  k.put('Prop_WoodenFence_Single', -W / 2 - 1, 0, D / 2 - 0.1, 0);
  k.put('Prop_WoodenFence_Single', -W / 2 - 2, 0, 1, HALF_PI);
  k.put('Prop_WoodenFence_Single', -W / 2 - 2, 0, -1, HALF_PI);
  k.put('Prop_WoodenFence_Single', -W / 2 - 1, 0, -D / 2 + 0.1, 0);
  return g;
}

// ---------------------------------------------------------------- workshop
// 8 x 4 m rubble-brick shop with a wide double-doored cart bay, a timber lean-to on the
// right gable sheltering crates, and a hand wagon out front. Stands in for carpenter,
// smith and similar trades.
function workshop(pieces) {
  const g = new THREE.Group();
  g.name = 'quat-workshop';
  const k = makeKit(pieces, g);
  const W = 8, D = 4, H = 3;
  const BAY = 1;   // front segment index of the cart bay
  k.ring(W, D, 0, (side, i) => {
    if (side === 'front') {
      if (i === BAY) return null;
      return i === 3 ? 'Wall_UnevenBrick_Straight' : ['Wall_UnevenBrick_Window_Wide_Flat', 'Window_Wide_Flat1'];
    }
    if (side === 'back') return i === 2 ? ['Wall_UnevenBrick_Window_Wide_Flat', 'Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Closed'] : 'Wall_UnevenBrick_Straight';
    return 'Wall_UnevenBrick_Straight';
  });
  // cart bay: two posts, a lintel, a strip of wall above and a pair of tall plank doors
  const cx = -W / 2 + 1 + 2 * BAY, fz = D / 2;
  k.put('Corner_Exterior_Wood', cx - 1, 0, fz);
  k.put('Corner_Exterior_Wood', cx + 1, 0, fz);
  k.put('Corner_Exterior_Wood', cx + 1.06, 2.5, fz, 0, [1, 0.707, 1]).rotation.z = HALF_PI;
  k.put('Wall_UnevenBrick_Straight', cx, 2.5, fz, 0, [1, 0.2, 1]);
  k.put('Door_4_Flat', cx - 0.98, 0, fz - 0.06, 0, [0.9, 1.17, 1]);
  k.put('Door_4_Flat', cx + 0.98, 0, fz - 0.06, 0, [-0.9, 1.17, 1]);
  k.corners(W, D, 0, 'Corner_Exterior_Brick');
  k.core(W, D, 0);
  k.gableRoof('Roof_RoundTiles_4x8', 'Roof_Front_Brick4', W, D, H);
  k.put('Prop_Chimney', -2.6, 4.6, 0.8, 0);
  // lean-to against the right gable wall, high edge under the main roof's rake
  const lx = W / 2;
  k.put('Roof_Wooden_2x1_L', lx + 1.52, 1.96, -1, -HALF_PI);
  k.put('Roof_Wooden_2x1_R', lx + 1.52, 1.96, 1, -HALF_PI);
  k.put('Corner_Exterior_Wood', lx + 1.4, 0, 1.95, 0, [1, 0.62, 1]);
  k.put('Corner_Exterior_Wood', lx + 1.4, 0, -1.95, 0, [1, 0.62, 1]);
  // props
  k.put('Prop_Crate', lx + 0.75, 0, 1.15, 0.08);
  k.put('Prop_Crate', lx + 0.75, 0, -0.1, -0.06);
  k.put('Prop_Crate', lx + 0.72, 1.06, 0.6, 0.35, [0.8, 0.8, 0.8]);
  k.put('Prop_Crate', 2.2, 0, fz + 1.1, 0.4, [0.85, 0.85, 0.85]);
  k.put('Prop_Wagon', -W / 2 - 0.6, 0, fz + 1.2, -2.3);
  return g;
}

// ---------------------------------------------------------------- hall
// Two storeys. Ground floor 10 x 6 m in rubble brick; the plaster-and-timber upper floor
// jetties out 1 m over the front and back (10 x 8 m), under a big tiled gable roof.
function hall(pieces) {
  const g = new THREE.Group();
  g.name = 'quat-hall';
  const k = makeKit(pieces, g);
  const W = 10, D = 6, H = 3;
  const Du = D + 2;   // upper floor depth after the 1 m jetty front and back
  // ground floor: coved overhang walls front and back, door in the middle of the front
  k.ring(W, D, 0, (side, i, n) => {
    if (side === 'front') return i === 2 ? ['Wall_UnevenBrick_Door_Flat', 'DoorFrame_Flat_WoodDark'] : 'Overhang_UnevenBrick_Short';
    if (side === 'back') return 'Overhang_UnevenBrick_Short';
    return i === 1 ? ['Wall_UnevenBrick_Window_Wide_Flat', 'Window_Wide_Flat1'] : 'Wall_UnevenBrick_Straight';
  });
  k.put('Door_4_Flat', -0.535, 0, D / 2 - 0.1, 0);
  // close the ends of the coved runs (both storeys high)
  k.put('Overhang_Side_Plaster_Short_L', -W / 2 + 1, 0, D / 2, 0);
  k.put('Overhang_Side_Plaster_Short_R', W / 2 - 1, 0, D / 2, 0);
  k.put('Overhang_Side_Plaster_Short_L', W / 2 - 1, 0, -D / 2, Math.PI);
  k.put('Overhang_Side_Plaster_Short_R', -W / 2 + 1, 0, -D / 2, Math.PI);
  // porch floor over the door where the cove is missing
  k.put('Floor_WoodDark', 0, H, D / 2 + 0.5, 0, [1, 1, 0.5]);
  k.put('Prop_Support', -0.9, 0, D / 2, 0, [1, 1, 0.55]);
  k.put('Prop_Support', 0.9, 0, D / 2, 0, [1, 1, 0.55]);
  // upper floor: front/back walls on the jettied line, side walls on the ground line
  const win = ['Wall_Plaster_Window_Wide_Flat', 'Window_Wide_Flat1', 'WindowShutters_Wide_Flat_Open'];
  k.ring(W, Du, H, (side, i, n) => {
    if (side === 'front' || side === 'back') return i % 2 === 1 ? win : 'Wall_Plaster_Straight';
    return null;
  });
  k.ring(W, D, H, (side, i) => {
    if (side === 'left' || side === 'right') return i === 1 ? win : 'Wall_Plaster_Straight';
    return null;
  });
  k.corners(W, D, 0);
  k.corners(W, Du, H);
  k.core(W, D, 0);
  k.core(W, Du, H + 0.05, 2.9);
  k.gableRoof('Roof_RoundTiles_8x10', 'Roof_Front_Brick8', W, Du, 2 * H);
  k.put('Prop_Chimney', 2.6, 9.4, 1.2, 0, [1.1, 1.1, 1.1]);
  return g;
}

const BUILDERS = { cottage, workshop, hall };

export function buildQuat(kind, pieces) {
  const fn = BUILDERS[kind];
  if (!fn) throw new Error('Unknown Quaternius building: ' + kind);
  const g = fn(pieces);
  g.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return g;
}
