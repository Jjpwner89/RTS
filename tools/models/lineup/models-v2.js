// "Handmade v2": the game's own low-poly models, rebuilt with more shape.
// Same contract as the current ones: each model is merged vertex-coloured geometry facing +z,
// soldiers and villagers split into gear (untinted) and cloth (tinted per side or per dye).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  geo.clearGroups();
  geo.scale(sx, sy, sz);
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 6) => new THREE.CylinderGeometry(r1, r2, h, s);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
const ball = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
const dome = r => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const merge = parts => mergeGeometries(parts.flat(Infinity));
// Rotate and move a finished list of parts as one piece.
const place = (parts, { x = 0, y = 0, z = 0, ry = 0 } = {}) => parts.flat(Infinity).map(g => { g.rotateY(ry); g.translate(x, y, z); return g; });

// ---- palette: earthier and a touch more varied than the first pass ----
export const C = {
  skin: '#d4a985', mail: '#7f858b', metal: '#a9aeb3', dark: '#2f2a25', hose: '#4a4036', leather: '#5e4430',
  wood: '#77583a', plank: '#b38c5c', timber: '#4b3526', plaster: '#ddd1b4', plaster2: '#cdbf9c',
  thatch: '#b8955a', thatchDark: '#957443', tile: '#94503a', slate: '#4f525a', shingle: '#5e4c3e',
  stone: '#a39d8f', stoneDark: '#7b766a', stoneLight: '#bdb7a8', glow: '#ff8a3a', hide: '#9a7652',
  wheat: '#d6b660', soil: '#7d6243', soilDark: '#664e34', flaxBlue: '#7d9fd6', leaf: '#5f7f4a', horse: '#6a4a33', horse2: '#4a3424',
  cloth: '#ffffff',
};

// ---- soldiers ----

function heater(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h * 0.35); s.lineTo(w / 2, h * 0.35); s.lineTo(w / 2, 0);
  s.quadraticCurveTo(w / 2, -h * 0.45, 0, -h * 0.65); s.quadraticCurveTo(-w / 2, -h * 0.45, -w / 2, 0); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 3 });
}

function body({ mail = true, tabard = true, hood = false } = {}) {
  const gear = [
    part(box(0.16, 0.74, 0.17), C.hose, { x: -0.11, y: 0.45 }),
    part(box(0.16, 0.74, 0.17), C.hose, { x: 0.11, y: 0.45 }),
    part(box(0.18, 0.16, 0.26), C.leather, { x: -0.11, y: 0.08, z: 0.04 }),
    part(box(0.18, 0.16, 0.26), C.leather, { x: 0.11, y: 0.08, z: 0.04 }),
    part(ball(0.135), C.skin, { y: 1.62 }),
    part(box(0.1, 0.1, 0.1), C.skin, { x: -0.33, y: 0.86, z: 0.04 }),
    part(box(0.1, 0.1, 0.1), C.skin, { x: 0.33, y: 0.86, z: 0.04 }),
    part(box(0.5, 0.08, 0.36), C.leather, { y: 0.9 }),
  ];
  const cloth = [];
  const arm = mail ? C.mail : C.cloth;
  (mail ? gear : cloth).push(
    part(box(0.13, 0.56, 0.14), arm, { x: -0.32, y: 1.18 }),
    part(box(0.13, 0.56, 0.14), arm, { x: 0.32, y: 1.18 }),
    part(cyl(0.22, 0.26, 0.42, 6), arm, { y: 1.3 }),
  );
  if (tabard) {
    cloth.push(part(box(0.44, 0.86, 0.32), C.cloth, { y: 1.06 }));   // surcoat, hem below the belt
    cloth.push(part(box(0.48, 0.3, 0.36), C.cloth, { y: 0.7 }));
  } else {
    cloth.push(part(cyl(0.23, 0.29, 0.92, 6), C.cloth, { y: 1.06 }));
  }
  if (hood) cloth.push(part(dome(0.165), C.cloth, { y: 1.64 }), part(cyl(0.2, 0.25, 0.1, 6), C.cloth, { y: 1.5 }));
  return { gear, cloth };
}

export function infantry(key) {
  let b;
  if (key === 'spear') {
    b = body();
    b.gear.push(
      part(cyl(0.16, 0.17, 0.13, 8), C.metal, { y: 1.74 }),        // kettle hat
      part(cyl(0.27, 0.27, 0.03, 8), C.metal, { y: 1.69 }),
      part(cyl(0.024, 0.024, 3.3, 5), C.wood, { x: 0.34, y: 1.7, z: 0.3, rx: 0.18 }),
      part(cone(0.055, 0.32, 4), C.metal, { x: 0.34, y: 3.42, z: 0.62, rx: 0.18 }),
      part(cyl(0.06, 0.06, 0.06, 6), C.metal, { x: -0.36, y: 1.12, z: 0.32, rx: Math.PI / 2 }),
    );
    b.cloth.push(part(cyl(0.34, 0.34, 0.05, 10), C.cloth, { x: -0.34, y: 1.12, z: 0.27, rx: Math.PI / 2 }));
    b.gear.push(part(cyl(0.355, 0.355, 0.04, 10), C.wood, { x: -0.34, y: 1.12, z: 0.25, rx: Math.PI / 2 }));
  } else if (key === 'sword') {
    b = body();
    b.gear.push(
      part(cone(0.17, 0.3, 8), C.metal, { y: 1.83 }),              // nasal helm
      part(cyl(0.17, 0.17, 0.08, 8), C.metal, { y: 1.71 }),
      part(box(0.035, 0.16, 0.03), C.metal, { y: 1.62, z: 0.15 }),
      part(box(0.05, 0.72, 0.015), C.metal, { x: 0.36, y: 1.3, z: 0.42, rx: 0.5 }),
      part(box(0.2, 0.035, 0.05), C.dark, { x: 0.36, y: 0.97, z: 0.25, rx: 0.5 }),
    );
    b.cloth.push(part(heater(0.5, 0.7), C.cloth, { x: -0.36, y: 1.18, z: 0.24 }));
    b.gear.push(part(box(0.54, 0.05, 0.04), C.wood, { x: -0.36, y: 1.43, z: 0.26 }));
  } else if (key === 'archer') {
    b = body({ mail: false, tabard: false, hood: true });
    // a longbow held upright in the left hand, belly forward, string towards the body
    const bow = new THREE.TorusGeometry(0.78, 0.024, 3, 10, 1.7).rotateZ(-0.85);
    b.gear.push(
      part(bow, C.wood, { x: -0.36, y: 1.2, z: -0.36, ry: -Math.PI / 2 }),
      part(box(0.01, 1.17, 0.01), '#e8dcc0', { x: -0.36, y: 1.2, z: 0.154 }),
      part(cyl(0.08, 0.07, 0.62, 6), C.leather, { x: 0.14, y: 1.32, z: -0.24, rx: 0.3 }),
      ...[-0.03, 0.04, 0.1].map((dx, i) => part(box(0.03, 0.12, 0.04), '#eeeae0', { x: 0.14 + dx, y: 1.68 + i * 0.01, z: -0.33, rx: 0.3 })),
      part(box(0.42, 0.3, 0.3), C.leather, { y: 0.98 }),          // gambeson skirt edge
    );
  } else if (key === 'militia') {
    b = body({ mail: false, tabard: false });
    b.gear.push(
      part(cyl(0.12, 0.2, 0.12, 7), '#8a7550', { y: 1.76 }),
      part(cyl(0.26, 0.26, 0.03, 7), '#8a7550', { y: 1.7 }),
      part(cyl(0.024, 0.024, 2.4, 5), C.wood, { x: 0.34, y: 1.45, z: 0.25, rx: 0.15 }),
      ...[-0.06, 0, 0.06].map(dx => part(box(0.02, 0.3, 0.02), C.metal, { x: 0.34 + dx, y: 2.7, z: 0.45, rx: 0.15 })),
      part(box(0.16, 0.02, 0.02), C.metal, { x: 0.34, y: 2.56, z: 0.43 }),
    );
  } else if (key === 'bandit') {
    b = body({ mail: false, tabard: false, hood: true });
    b.gear.push(
      part(box(0.22, 0.08, 0.04), C.dark, { y: 1.58, z: 0.13 }),
      part(cyl(0.03, 0.03, 0.95, 5), C.wood, { x: 0.38, y: 1.3, z: 0.25, rx: 0.5 }),
      part(box(0.06, 0.24, 0.28), C.metal, { x: 0.38, y: 1.7, z: 0.5, rx: 0.5 }),
    );
  } else {
    b = body();
  }
  return { gear: merge(b.gear), cloth: merge(b.cloth) };
}

export function cavalry() {
  const H = C.horse, H2 = C.horse2;
  const gear = [
    part(cyl(0.36, 0.34, 1.55, 8), H, { y: 1.35, rx: Math.PI / 2 }),
    part(ball(0.34, 8, 6), H, { y: 1.36, z: 0.72 }),
    part(ball(0.33, 8, 6), H, { y: 1.36, z: -0.72 }),
    part(box(0.26, 0.85, 0.42), H, { y: 1.9, z: 0.98, rx: 0.55 }),
    part(box(0.24, 0.26, 0.6), H, { y: 2.22, z: 1.32, rx: 0.35 }),
    part(box(0.2, 0.2, 0.2), H2, { y: 2.12, z: 1.6, rx: 0.35 }),
    part(box(0.05, 0.16, 0.05), H, { x: -0.08, y: 2.45, z: 1.12 }),
    part(box(0.05, 0.16, 0.05), H, { x: 0.08, y: 2.45, z: 1.12 }),
    part(box(0.06, 0.7, 0.16), H2, { y: 2.05, z: 0.86, rx: 0.55 }),   // mane
    part(cyl(0.06, 0.12, 0.8, 5), H2, { y: 1.1, z: -1.05, rx: -0.4 }),  // tail
    // rider
    part(box(0.17, 0.6, 0.18), C.hose, { x: -0.36, y: 1.65, z: 0.15, rx: -0.3 }),
    part(box(0.17, 0.6, 0.18), C.hose, { x: 0.36, y: 1.65, z: 0.15, rx: -0.3 }),
    part(box(0.13, 0.52, 0.14), C.mail, { x: -0.3, y: 2.35 }),
    part(box(0.13, 0.52, 0.14), C.mail, { x: 0.3, y: 2.35, z: 0.1, rx: -0.4 }),
    part(ball(0.135), C.skin, { y: 2.78 }),
    part(cyl(0.165, 0.165, 0.3, 8), C.metal, { y: 2.84 }),            // great helm
    part(box(0.2, 0.03, 0.03), C.dark, { y: 2.84, z: 0.16 }),
    part(cyl(0.032, 0.032, 3.9, 5), C.wood, { x: 0.36, y: 2.45, z: 0.85, rx: 1.3 }),
    part(cone(0.07, 0.38, 4), C.metal, { x: 0.36, y: 2.93, z: 2.75, rx: 1.3 }),
  ];
  for (const [x, z, k] of [[-0.2, 0.68, 0.15], [0.2, 0.68, -0.1], [-0.2, -0.72, -0.12], [0.2, -0.72, 0.15]]) {
    gear.push(part(cyl(0.09, 0.06, 1.0, 5), H, { x, y: 0.62, z, rx: k }));
    gear.push(part(cyl(0.08, 0.08, 0.12, 5), C.dark, { x, y: 0.08, z: z + k * 0.5 }));
  }
  const cloth = [
    part(box(0.06, 0.62, 1.5), C.cloth, { x: -0.39, y: 1.08 }),           // caparison: two side drapes
    part(box(0.06, 0.62, 1.5), C.cloth, { x: 0.39, y: 1.08 }),
    part(box(0.72, 0.5, 0.06), C.cloth, { y: 1.2, z: -0.86 }),
    part(box(0.82, 0.16, 0.7), C.cloth, { y: 1.72, z: -0.05 }),          // saddle cloth
    part(box(0.44, 0.7, 0.3), C.cloth, { y: 2.3 }),                    // surcoat
    part(box(0.5, 0.18, 0.32), C.cloth, { y: 1.98 }),
    part(heater(0.5, 0.7), C.cloth, { x: -0.42, y: 2.25, z: 0.05, ry: -0.3 }),
    part(box(0.02, 0.22, 0.4), C.cloth, { x: 0.36, y: 2.8, z: 2.3, rx: 1.3 }),   // pennon
    part(cone(0.04, 0.3, 4), C.cloth, { y: 3.1 }),                      // crest
  ];
  return { gear: merge(gear), cloth: merge(cloth) };
}

export function peasant() {
  const b = body({ mail: false, tabard: false });
  b.cloth.push(part(dome(0.16), C.cloth, { y: 1.68 }));
  b.gear.push(part(box(0.32, 0.5, 0.05), '#d8ccb0', { y: 1.0, z: 0.18 }));   // apron
  return { gear: merge(b.gear), cloth: merge(b.cloth) };
}

// ---- buildings ----

// A gable roof: a solid prism filling the gable, then two overhanging slabs and a ridge.
function gableRoof(w, d, h, top, { color = C.thatch, gable = C.plaster, thick = 0.22, over = 0.4 } = {}) {
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, h); tri.closePath();
  const fill = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
  const a = Math.atan2(h, w / 2), hw = w / 2 + over, L = hw / Math.cos(a);
  const out = [part(fill, gable, { y: top, z: -d / 2 })];
  for (const s of [-1, 1]) {
    const cx = s * hw / 2, cy = top + h - hw * Math.tan(a) / 2 + thick / 2 / Math.cos(a);
    out.push(part(box(L, thick, d + over * 2), color, { x: cx, y: cy, rz: -s * a }));
  }
  out.push(part(box(thick * 1.3, thick * 1.3, d + over * 2 + 0.05), color === C.thatch ? C.thatchDark : C.timber, { y: top + h + thick * 0.55, rz: Math.PI / 4 }));
  return out;
}

// A cottage with a stone footing, framed walls, a door on +z and a gable roof along z.
function cottage({ w = 4, d = 5, h = 2.4, rh = 2.2, wall = C.plaster, roof = C.thatch, thick, frame = true, door = true,
  chimney = false, windows = true, footing = C.stoneDark } = {}) {
  const f = 0.35, top = f + h, out = [
    part(box(w + 0.2, f, d + 0.2), footing, { y: f / 2 }),
    part(box(w, h, d), wall, { y: f + h / 2 }),
    ...gableRoof(w, d, rh, top, { color: roof, gable: wall, thick: thick ?? (roof === C.thatch ? 0.4 : 0.2) }),
  ];
  if (frame) {
    const T = C.timber, t = 0.16;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push(part(box(t, h, t), T, { x: x * w / 2, y: f + h / 2, z: z * d / 2 }));
    for (const s of [-1, 1]) {
      out.push(part(box(w + 0.06, t, t), T, { y: top - t / 2, z: s * (d / 2 + 0.02) }));
      out.push(part(box(t, t, d + 0.06), T, { x: s * (w / 2 + 0.02), y: top - t / 2 }));
      out.push(part(box(t * 0.8, t * 0.8, d), T, { x: s * (w / 2 + 0.03), y: f + h * 0.5 }));
      // braces on the long sides
      const bl = Math.hypot(d / 2 - 0.2, h * 0.5);
      out.push(part(box(0.1, 0.1, bl), T, { x: s * (w / 2 + 0.04), y: f + h * 0.75, z: d / 4, rx: Math.atan2(h * 0.5, d / 2 - 0.2) }));
      out.push(part(box(0.1, 0.1, bl), T, { x: s * (w / 2 + 0.04), y: f + h * 0.75, z: -d / 4, rx: -Math.atan2(h * 0.5, d / 2 - 0.2) }));
    }
    out.push(part(box(0.12, h * 0.9, 0.08), T, { x: -0.75, y: f + h * 0.45, z: d / 2 + 0.03 }));
    out.push(part(box(0.12, h * 0.9, 0.08), T, { x: 0.75, y: f + h * 0.45, z: d / 2 + 0.03 }));
  }
  if (door) out.push(part(box(0.95, Math.min(1.7, h * 0.75), 0.1), C.dark, { y: f + Math.min(1.7, h * 0.75) / 2, z: d / 2 + 0.04 }));
  if (windows) for (const s of [-1, 1]) {
    for (const k of d > 4.5 ? [-0.25, 0.25] : [0]) {
      out.push(part(box(0.08, 0.5, 0.55), C.dark, { x: s * (w / 2 + 0.05), y: f + h * 0.6, z: k * d }));
      out.push(part(box(0.1, 0.07, 0.7), C.timber, { x: s * (w / 2 + 0.06), y: f + h * 0.6 - 0.3, z: k * d }));
    }
  }
  if (chimney) out.push(part(box(0.6, rh + 1.4, 0.6), C.stone, { x: w * 0.22, y: top + (rh + 1.4) / 2 - 0.4, z: -d * 0.28 }),
    part(box(0.75, 0.15, 0.75), C.stoneDark, { x: w * 0.22, y: top + rh + 1.0, z: -d * 0.28 }));
  return out;
}

const logPile = (n, at) => place(Array.from({ length: n }, (_, i) => {
  const row = i < 3 ? 0 : i < 5 ? 1 : 2, k = i < 3 ? i - 1 : i < 5 ? i - 3.5 : 0;
  return part(cyl(0.22, 0.22, 2.2, 7), i % 2 ? C.wood : '#86653f', { x: k * 0.44, y: 0.22 + row * 0.38, rx: Math.PI / 2 });
}), at);
const crate = (at, s = 0.6) => place([part(box(s, s, s), C.plank, {}), part(box(s + 0.04, 0.08, s + 0.04), C.timber, { y: s / 2 - 0.04 })], { ...at, y: (at.y || 0) + s / 2 });
const barrel = at => place([part(cyl(0.28, 0.28, 0.75, 8), C.wood, { y: 0.375 }), part(cyl(0.3, 0.3, 0.06, 8), C.dark, { y: 0.6 }), part(cyl(0.3, 0.3, 0.06, 8), C.dark, { y: 0.15 })], at);
const stoneBlocks = at => place([
  part(box(1.1, 0.7, 0.8), C.stoneLight, { y: 0.35 }), part(box(1.1, 0.7, 0.8), C.stone, { x: 0.05, y: 0.35, z: 0.85 }),
  part(box(1.0, 0.65, 0.8), C.stoneLight, { x: 0, y: 1.02, z: 0.4, ry: 0.2 })], at);

function fieldPlot(soil, rows, crop) {
  const out = [part(box(17, 0.14, 17), soil, { y: 0.07 })];
  for (let i = -3; i <= 3; i++) {
    out.push(part(box(15.6, 0.22, 0.6), C.soilDark, { y: 0.12, z: i * 2.3 }));
    for (let k = -7; k <= 7; k++) out.push(...crop(k * 1.05, i * 2.3 + 0.65, rows));
  }
  // a low fence on two sides
  for (let k = -8; k <= 8; k += 2) out.push(part(box(0.12, 0.8, 0.12), C.wood, { x: k, y: 0.4, z: 8.4 }), part(box(0.12, 0.8, 0.12), C.wood, { x: -8.4, y: 0.4, z: k }));
  out.push(part(box(16.8, 0.08, 0.08), C.wood, { y: 0.65, z: 8.4 }), part(box(0.08, 0.08, 16.8), C.wood, { x: -8.4, y: 0.65 }));
  return out;
}
const wheatTuft = (x, z) => [part(cone(0.32, 0.9, 4), C.wheat, { x, y: 0.55, z, ry: x })];
const flaxTuft = (x, z) => [part(cone(0.24, 0.8, 4), C.leaf, { x, y: 0.5, z, ry: x }), part(box(0.16, 0.1, 0.16), C.flaxBlue, { x, y: 0.95, z })];

export const MODELS = {
  house: () => merge(cottage({ w: 4, d: 5, chimney: true })),
  woodcutter: () => merge([
    cottage({ w: 3.6, d: 4, h: 2.2, wall: C.plank, roof: C.shingle, frame: false, rh: 1.8 }),
    logPile(6, { x: 2.9, z: 0.2, ry: 0.1 }),
    part(cyl(0.4, 0.45, 0.55, 8), C.wood, { x: -0.8, y: 0.28, z: 3 }),
    part(cyl(0.025, 0.025, 0.8, 4), C.wood, { x: -0.7, y: 0.75, z: 3, rz: 0.5 }),
    part(box(0.05, 0.2, 0.26), C.metal, { x: -0.85, y: 0.6, z: 3, rz: 0.5 }),
  ]),
  quarry: () => merge([
    cottage({ w: 3.4, d: 3.4, h: 2.1, wall: C.stoneLight, roof: C.shingle, frame: false, rh: 1.6, windows: false }),
    stoneBlocks({ x: 2.6, z: -0.6 }),
    part(box(0.18, 3.4, 0.18), C.wood, { x: 2.3, y: 1.6, z: 2.0, rz: 0.25 }), part(box(0.18, 3.4, 0.18), C.wood, { x: 3.7, y: 1.6, z: 2.0, rz: -0.25 }),
    part(box(1.5, 0.15, 0.15), C.wood, { x: 3, y: 3.2, z: 2.0 }), part(box(0.02, 1.6, 0.02), '#d8ccb0', { x: 3, y: 2.4, z: 2.0 }),
    part(box(0.7, 0.5, 0.5), C.stone, { x: 3, y: 1.35, z: 2.0 }),
  ]),
  mine: () => merge([
    part(new THREE.IcosahedronGeometry(2.6, 0), C.stoneDark, { x: 1.4, y: 0.8, z: -1, sy: 0.75 }),
    part(new THREE.IcosahedronGeometry(1.6, 0), C.stone, { x: -0.3, y: 0.6, z: -1.8, sy: 0.7 }),
    part(box(1.6, 1.9, 0.6), C.dark, { x: 1.2, y: 0.95, z: 1.15 }),
    part(box(0.22, 2.2, 0.22), C.timber, { x: 0.35, y: 1.1, z: 1.5 }), part(box(0.22, 2.2, 0.22), C.timber, { x: 2.05, y: 1.1, z: 1.5 }),
    part(box(2.2, 0.26, 0.3), C.timber, { x: 1.2, y: 2.25, z: 1.5 }),
    part(box(0.12, 0.06, 2.4), C.metal, { x: 0.9, y: 0.03, z: 2.6 }), part(box(0.12, 0.06, 2.4), C.metal, { x: 1.5, y: 0.03, z: 2.6 }),
    part(box(0.75, 0.45, 0.9), C.wood, { x: 1.2, y: 0.38, z: 2.9 }), part(box(0.6, 0.2, 0.75), '#8a4a32', { x: 1.2, y: 0.65, z: 2.9 }),
    part(cone(0.9, 0.8, 6), '#8a4a32', { x: -1.8, y: 0.4, z: 1.6 }),
    cottage({ w: 2.4, d: 2.4, h: 1.8, wall: C.plank, roof: C.shingle, frame: false, rh: 1.3, windows: false }).map(g => g.translate(-1.6, 0, -0.4) && g),
  ]),
  hunter: () => merge([
    cottage({ w: 3.6, d: 4, h: 2.2, wall: '#7c6244', roof: C.thatchDark, frame: false, rh: 2.0 }),
    part(box(0.14, 2.0, 0.14), C.wood, { x: 2.6, y: 1.0, z: -0.9 }), part(box(0.14, 2.0, 0.14), C.wood, { x: 2.6, y: 1.0, z: 0.9 }),
    part(box(0.1, 0.1, 2.0), C.wood, { x: 2.6, y: 1.9 }), part(box(0.05, 1.1, 0.8), C.hide, { x: 2.6, y: 1.3, z: -0.4 }), part(box(0.05, 1.0, 0.7), '#b08a62', { x: 2.6, y: 1.35, z: 0.45 }),
    part(box(0.6, 0.06, 0.06), '#e8dcc0', { y: 2.5, z: 2.05, rz: 0.4 }), part(box(0.6, 0.06, 0.06), '#e8dcc0', { y: 2.5, z: 2.05, rz: -0.4 }),
  ]),
  farm: () => merge([fieldPlot(C.soil, 0, wheatTuft), place(cottage({ w: 3.2, d: 3.6, h: 2.0, chimney: true }), { x: 6.3, z: 6.3, ry: Math.PI }),
    part(cone(0.9, 1.6, 7), C.thatch, { x: 3.8, y: 0.8, z: 7.0 })]),
  flax: () => merge([fieldPlot('#6a7a52', 0, flaxTuft), place(cottage({ w: 3.0, d: 3.2, h: 1.9 }), { x: 6.4, z: 6.4, ry: Math.PI })]),
  carpenter: () => merge([
    cottage({ w: 4.4, d: 4, h: 2.4, roof: C.tile, chimney: false }),
    part(box(0.14, 2.2, 0.14), C.timber, { x: 3.8, y: 1.1, z: -1.4 }), part(box(0.14, 2.2, 0.14), C.timber, { x: 3.8, y: 1.1, z: 1.4 }),
    part(box(1.8, 0.12, 3.4), C.tile, { x: 3.0, y: 2.25, rz: -0.25 }),
    ...[0, 1, 2, 3].map(i => part(box(2.6, 0.1, 0.4), C.plank, { x: 3.0, y: 0.08 + i * 0.12, z: 0.8 - (i % 2) * 0.05 })),
    part(box(1.0, 0.1, 0.25), C.wood, { x: 3.1, y: 0.7, z: -0.6 }), part(box(0.08, 0.6, 0.08), C.wood, { x: 2.75, y: 0.35, z: -0.6, rz: 0.2 }), part(box(0.08, 0.6, 0.08), C.wood, { x: 3.45, y: 0.35, z: -0.6, rz: -0.2 }),
  ]),
  ropemaker: () => merge([
    cottage({ w: 3, d: 8, h: 1.9, roof: C.thatch, rh: 1.6, door: true }),
    ...[-2.5, 0, 2.5].map(z => part(box(0.12, 1.2, 0.12), C.wood, { x: 2.4, y: 0.6, z })),
    part(box(0.03, 0.03, 5.2), '#c9b98a', { x: 2.4, y: 1.0 }), part(box(0.03, 0.03, 5.2), '#c9b98a', { x: 2.4, y: 0.85 }),
    part(cyl(0.55, 0.55, 0.4, 10), '#c9b98a', { x: 2.4, y: 0.2, z: 3.4 }),
  ]),
  smelter: () => merge([
    cottage({ w: 3.8, d: 3.8, h: 2.2, wall: C.stone, roof: C.slate, frame: false, footing: C.stoneDark, windows: false }),
    part(cyl(0.9, 1.3, 2.8, 8), C.stoneDark, { x: 2.8, y: 1.4, z: 0.6 }),
    part(cyl(0.55, 0.75, 1.6, 8), C.stone, { x: 2.8, y: 3.4, z: 0.6 }),
    part(box(0.6, 0.55, 0.3), C.glow, { x: 2.8, y: 0.5, z: 1.75 }),
    part(cone(0.8, 0.6, 6), C.dark, { x: 1.6, y: 0.3, z: 2.4 }),
  ]),
  bowyer: () => merge([
    cottage({ w: 4, d: 4, h: 2.3, roof: C.shingle }),
    part(box(0.12, 1.8, 0.12), C.wood, { x: 2.7, y: 0.9, z: -0.8 }), part(box(0.12, 1.8, 0.12), C.wood, { x: 2.7, y: 0.9, z: 0.8 }),
    part(box(0.08, 0.08, 1.8), C.wood, { x: 2.7, y: 1.7 }),
    ...[-0.5, 0, 0.5].map(z => part(new THREE.TorusGeometry(0.65, 0.025, 3, 8, 1.7), '#5a3a22', { x: 2.75, y: 1.0, z, ry: Math.PI / 2, rz: Math.PI / 2 - 0.85 })),
    part(cyl(0.45, 0.45, 0.25, 10), '#c9b98a', { x: -1.2, y: 0.9, z: 3.4, rx: Math.PI / 2 }), part(cyl(0.25, 0.25, 0.27, 10), '#b04a3a', { x: -1.2, y: 0.9, z: 3.4, rx: Math.PI / 2 }),
    part(box(0.08, 0.9, 0.08), C.wood, { x: -1.2, y: 0.45, z: 3.25 }),
  ]),
  weaponsmith: () => merge([
    cottage({ w: 4.4, d: 4, h: 2.4, wall: C.stoneDark, roof: C.slate, chimney: true, frame: false }),
    part(box(0.14, 2.2, 0.14), C.timber, { x: 3.6, y: 1.1, z: -1.4 }), part(box(0.14, 2.2, 0.14), C.timber, { x: 3.6, y: 1.1, z: 1.4 }),
    part(box(1.6, 0.12, 3.4), C.slate, { x: 2.9, y: 2.25, rz: -0.25 }),
    part(box(0.5, 0.45, 0.4), C.wood, { x: 3, y: 0.22 }), part(box(0.7, 0.28, 0.3), C.dark, { x: 3, y: 0.58 }), part(cone(0.12, 0.3, 4), C.dark, { x: 3.45, y: 0.58, rz: -Math.PI / 2 }),
    part(box(1.0, 0.8, 1.0), C.stone, { x: 2.8, y: 0.4, z: -1.0 }), part(box(0.5, 0.15, 0.5), C.glow, { x: 2.8, y: 0.82, z: -1.0 }),
    part(cyl(0.4, 0.4, 0.14, 10), C.stoneLight, { x: 2.6, y: 0.55, z: 1.2, rz: Math.PI / 2 }),
  ]),
  barracks: () => merge([
    cottage({ w: 6, d: 10, h: 2.8, wall: C.plaster2, roof: C.tile, chimney: true, rh: 2.6 }).map(g => g.rotateY(Math.PI / 2) && g),
    ...Array.from({ length: 13 }, (_, i) => part(cyl(0.16, 0.16, 1.6, 5), C.wood, { x: -4.8 + i * 0.8, y: 0.8, z: 5.6 })),
    part(box(0.14, 1.6, 0.14), C.wood, { x: -4.8, y: 0.8, z: 4.2 }), part(box(0.14, 1.6, 0.14), C.wood, { x: 4.8, y: 0.8, z: 4.2 }),
    part(cyl(0.1, 0.1, 7, 5), C.wood, { x: 4.6, y: 3.5, z: 4.6 }), part(box(0.05, 1.5, 2.3), '#3d6fd6', { x: 4.6, y: 6.2, z: 5.75 }),
    // training dummy and weapon rack
    part(box(0.12, 1.6, 0.12), C.wood, { x: -2.5, y: 0.8, z: 4.1 }), part(box(0.9, 0.12, 0.12), C.wood, { x: -2.5, y: 1.25, z: 4.1 }), part(ball(0.28), C.thatch, { x: -2.5, y: 1.75, z: 4.1 }),
    part(box(1.8, 0.1, 0.1), C.wood, { x: 1.2, y: 1.2, z: 3.45 }),
    ...[-0.6, -0.2, 0.2, 0.6, 1.0].map(dx => part(cyl(0.025, 0.025, 2.4, 4), C.wood, { x: 1.0 + dx, y: 1.2, z: 3.55, rx: 0.12 })),
  ]),
};

export function houseModel() { return MODELS.house(); }

// The lord's keep: a battered plinth, a square tower with string course and merlons, round
// corner turrets with conical slate caps, a forebuilding over the door, and (optionally) a
// palisade of sharpened stakes with a gatehouse facing the field.
export function keepModel({ palisade = true } = {}) {
  const S = C.stone, SD = C.stoneDark, out = [
    part(cyl(10.6, 11.4, 2.2, 4), SD, { y: 1.1, ry: Math.PI / 4 }),
    part(box(13, 15, 13), S, { y: 9.5 }),
    part(box(13.4, 0.5, 13.4), SD, { y: 9 }),
    part(box(13.4, 0.6, 13.4), SD, { y: 17 }),
    part(box(4.5, 6, 4), S, { y: 4.5, z: 7.8 }),                       // forebuilding
    part(box(2.2, 3.2, 0.3), C.dark, { y: 3.3, z: 9.85 }),
    ...gableRoof(4.5, 4, 2, 7.5, { color: C.slate, gable: S, thick: 0.25, over: 0.3 }).map(g => g.translate(0, 0, 7.8) && g),
    part(box(6.5, 1.2, 4), SD, { y: 0.6, z: 11.5 }),                    // steps
  ];
  for (let i = 0; i < 4; i++) for (let k = -2; k <= 2; k++) {
    const along = k * 2.6, [x, z] = [[along, -6.3], [along, 6.3], [-6.3, along], [6.3, along]][i];
    out.push(part(box(1.1, 1.3, 1.1), S, { x, y: 17.9, z }));
    if (Math.abs(k) < 2) {   // arrow slits on two levels
      const [sx, sz] = [[along, -6.52], [along, 6.52], [-6.52, along], [6.52, along]][i];
      out.push(part(box(i < 2 ? 0.3 : 0.08, 1.2, i < 2 ? 0.08 : 0.3), C.dark, { x: sx, y: 12.5, z: sz }));
      if (k === 0) out.push(part(box(i < 2 ? 0.3 : 0.08, 1.0, i < 2 ? 0.08 : 0.3), C.dark, { x: sx, y: 14.8, z: sz }));
    }
  }
  for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
    out.push(part(cyl(2.3, 2.7, 20, 10), SD, { x, y: 10, z }));
    out.push(part(cyl(2.6, 2.6, 0.5, 10), S, { x, y: 20.1, z }));
    out.push(part(cone(2.9, 5, 10), C.slate, { x, y: 22.8, z }));
  }
  out.push(part(cyl(0.12, 0.12, 9, 4), C.wood, { y: 22 }));
  if (palisade) {
    for (let i = 0; i < 110; i++) {
      const a = i / 110 * Math.PI * 2;
      if (Math.cos(a) > 0.975) continue;
      const h = 3.6 + ((i * 37) % 7) * 0.12;
      out.push(part(cyl(0.32, 0.32, h, 5), i % 3 ? C.wood : '#6a4d33', { x: Math.sin(a) * 30, y: h / 2, z: Math.cos(a) * 30 }));
      out.push(part(cone(0.32, 0.6, 5), C.wood, { x: Math.sin(a) * 30, y: h + 0.3, z: Math.cos(a) * 30 }));
    }
    for (const s of [-1, 1]) {   // gatehouse towers
      const x = s * 3.2, z = 29.8;
      out.push(part(box(2.6, 6.5, 2.6), C.wood, { x, y: 3.25, z }), part(box(3.2, 0.3, 3.2), C.timber, { x, y: 6.6, z }));
      out.push(...gableRoof(3.2, 3.2, 1.5, 6.6, { color: C.shingle, gable: C.wood, thick: 0.18, over: 0.25 }).map(g => g.translate(x, 0, z) && g));
    }
    out.push(part(box(4, 0.5, 0.6), C.timber, { y: 4.6, z: 29.8 }));
  }
  return merge(out);
}
