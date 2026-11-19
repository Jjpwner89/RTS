// What makes the ground look lived on: the painted ground shader (grass patches, bare earth,
// rock ledges, drifting cloud shadows), the river's moving water, a painted map of tracks and
// fields, and ground cover (grass that sways, wildflowers, stones, bushes). Looks only;
// nothing here changes the rules.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, rng } from './noise.js';

// Seconds, shared by every material that moves (grass, water, clouds).
export const TIME = { value: 0 };
export const tick = () => { TIME.value = performance.now() / 1000; };

const NOISE = /* glsl */`
float lh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(lh21(i), lh21(i + vec2(1, 0)), f.x), mix(lh21(i + vec2(0, 1)), lh21(i + vec2(1, 1)), f.x), f.y); }
float lfbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * lvn(p); p = p * 2.03 + 17.1; a *= .5; } return s / .9375; }
`;

// Hands the fragment shader the world position and normal.
const withWorld = sh => sh.vertexShader
  .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
  .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');

// ---- the ground ----

// land: a landMask() for tracks and fields, or null.
export function groundMaterial(land = null) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = { uTime: TIME, uMask: { value: land?.tex || null }, uExtent: { value: land?.extent || 1 },
    uHomeA: { value: new THREE.Vector2(land?.homes[0]?.x || 0, land?.homes[0]?.z || 0) },
    uHomeB: { value: new THREE.Vector2(land?.homes[1]?.x ?? 0, land?.homes[1]?.z ?? 1e5) } };
  if (land) { mat.defines = { LAND: '' }; mat.userData.mask = land.tex; }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = withWorld(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
uniform float uTime, uExtent; uniform sampler2D uMask; uniform vec2 uHomeA, uHomeB;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 col = diffuseColor.rgb;
  vec2 p = vWPos.xz;
  float near = 1. - smoothstep(60., 260., length(cameraPosition - vWPos));
  float slope = 1. - vWN.y;
  // Broad patches of lusher and drier grass, then clumps, then blades up close.
  col *= mix(vec3(.86, .95, .80), vec3(1.10, 1.03, .88), lfbm(p * .012));
  col *= .88 + .24 * lfbm(p * .09 + 3.1);
  float blades = lvn(vec2(p.x * 2.2 + lvn(p * .3) * 3., p.y * .7) * 1.6) * .6 + lvn(p * 4.3) * .4;
  col *= mix(1., .86 + .28 * blades, near);
  // Bare earth showing through in worn hollows.
  float bare = smoothstep(.63, .74, lfbm(p * .035 + 9.));
  vec3 earth = vec3(.44, .36, .25) * (.85 + .3 * lvn(p * 2.5));
  col = mix(col, earth, bare * .75 * max(0., 1. - slope * 2.));
  // Rock on the steep sides, in ledges.
  float rk = smoothstep(.16, .32, slope + (lvn(p * .2) - .5) * .12);
  float ledge = .78 + .22 * smoothstep(.2, .8, fract(vWPos.y * .45 + lvn(p * .15) * 1.5));
  col = mix(col, vec3(.52, .50, .46) * ledge * (.85 + .3 * lvn(p * 1.3)), rk);
#ifdef LAND
  vec4 mk = texture2D(uMask, p / (2. * uExtent) + .5);
  // Fields: furrows round the nearest keep; ploughed earth, ripe grain or young green.
  vec2 rel = p - (length(p - uHomeA) < length(p - uHomeB) ? uHomeA : uHomeB);
  float furrow = smoothstep(-.3, .3, sin(atan(rel.y, rel.x) * length(rel) * 2.4));
  vec3 crop = mk.b < .3 ? vec3(.36, .26, .17) : mk.b < .7 ? vec3(.66, .52, .25) : vec3(.34, .48, .19);
  crop *= (.74 + .3 * furrow) * (.9 + .2 * lvn(p * .8));
  col = mix(col, crop, smoothstep(.55, .95, mk.g));
  // Tracks: packed earth with ruts.
  float wear = smoothstep(.15, .9, mk.r + (lvn(p * .7) - .5) * .25);
  float rut = smoothstep(.75, 1., mk.r) * (.5 + .5 * sin(lvn(p * .5) * 6.));
  col = mix(col, vec3(.43, .35, .25) * (.82 + .3 * lvn(p * 3.)) * (1. - rut * .18), wear * .9);
#endif
  // Cloud shadows drift over the land.
  col *= 1. - smoothstep(.42, .68, lfbm((p + uTime * vec2(3.5, 1.2)) * .006)) * .28;
  // A warmer, slightly softer grade so the greens don't go lime.
  col = mix(vec3(dot(col, vec3(.3, .59, .11))), col, .9) * vec3(1.02, .99, .93);
  diffuseColor.rgb = col;
}`);
  };
  return mat;
}

// ---- water ----

export function waterMaterial({ opacity = 0.85 } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = withWorld(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWN; uniform float uTime;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vWPos.xz;
  float r = lvn(p * .35 + vec2(uTime * .6, uTime * .2)) * .6 + lvn(p * 1.1 - vec2(uTime * .9, 0.)) * .4;
  diffuseColor.rgb *= .85 + .3 * r;
  diffuseColor.rgb += smoothstep(.78, .9, lvn(p * 1.8 + vec2(uTime * 1.3, uTime * .4))) * .18;
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  { vec3 V = normalize(cameraPosition - vWPos); gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.78, .86, .9), pow(1. - max(V.y, 0.), 3.) * .5); }`);
  };
  return mat;
}

// ---- tracks and fields ----

// A painted map of the land, read by the ground shader: red = worn track, green = field,
// blue = its crop. homes: keeps the tracks start from (fields grow round them when `fields`).
// roads: [{ pts: [[x, z], ...], width }] to draw instead of tracks made up from the homes.
// wear: [{ x, z, r }] patches of trampled ground. river: keeps fields out of the water.
export function landMask(seed, { homes = [], roads = null, fields = false, wear = null, river = null, extent = 380, size = 2048 } = {}) {
  const rand = rng(seed * 31 + 9);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const m = size / (2 * extent);
  const P = (x, z) => [(x + extent) * m, (z + extent) * m];
  const wet = (x, z) => river && Math.abs(river.across(x, z)) < river.half + 6;

  const list = [];
  for (const h of fields ? homes : []) {
    const away = Math.sign(h.z) || 1;
    for (let i = 0; i < 14; i++) {
      const a = (rand() - 0.5) * Math.PI * 1.5, d = 48 + rand() * 50;
      const x = h.x + Math.sin(a) * d * 1.3, z = h.z + Math.cos(a) * d * away * 0.6 + away * 8;
      const w = 14 + rand() * 14, l = 24 + rand() * 22, ang = a * 0.5 + (rand() - 0.5) * 0.3, crop = Math.floor(rand() * 3);
      if (Math.abs(x) > 110 || Math.abs(z) > extent - 40 || wet(x, z)) continue;
      if (list.some(f => Math.hypot(f.x - x, f.z - z) < (f.l + l) * 0.42)) continue;
      list.push({ x, z, w, l, ang, crop });
    }
  }
  for (const f of list) {
    const [cx, cy] = P(f.x, f.z);
    g.save();
    g.translate(cx, cy);
    g.rotate(-f.ang);
    g.fillStyle = `rgb(0,255,${[40, 140, 240][f.crop]})`;
    g.fillRect(-f.w / 2 * m, -f.l / 2 * m, f.w * m, f.l * m);
    g.restore();
  }

  // Tracks in soft passes, widest and faintest first, so their edges fray.
  g.globalCompositeOperation = 'lighter';
  const track = (pts, width) => {
    g.lineCap = g.lineJoin = 'round';
    for (const [k, a] of [[1.6, 0.25], [1.15, 0.35], [0.7, 0.5]]) {
      g.strokeStyle = `rgba(255,0,0,${a})`;
      g.lineWidth = width * k * m;
      g.beginPath();
      pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.stroke();
    }
  };
  const wander = (x0, z0, x1, z1, amp, n = 24) => {
    const ph = rand() * 6, out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, side = Math.sin(t * 5 + ph) * amp * Math.sin(t * Math.PI);
      out.push([x0 + (x1 - x0) * t + side, z0 + (z1 - z0) * t]);
    }
    return out;
  };
  if (roads) for (const r of roads) track(r.pts, r.width);
  else {
    // One track from each keep to the river's crossing (or the middle), one to a flank, one away.
    const cross = river?.bridges[0] || river?.fords[0];
    for (const h of homes) {
      const mx = cross ? cross.x : (rand() - 0.5) * 60, mz = cross ? river.zAt(mx) : 0;
      track(wander(h.x, h.z, mx, mz, 12), 4.5);
      track(wander(h.x, h.z, h.x + (rand() < 0.5 ? -1 : 1) * 300, h.z * 0.6, 8), 3.5);
      track(wander(h.x, h.z, h.x, h.z + (Math.sign(h.z) || 1) * 200, 6), 4);
    }
  }
  // Trampled ground where men have camped, drilled or gathered.
  const blobs = wear || homes.flatMap(h => [0, 1, 2].map(() => ({ x: h.x + (rand() - 0.5) * 80, z: h.z * 0.7 + (rand() - 0.5) * 30, r: 10 + rand() * 12 })));
  for (const b of blobs) {
    const [px, py] = P(b.x, b.z), R = b.r * m;
    const gr = g.createRadialGradient(px, py, 0, px, py, R);
    gr.addColorStop(0, 'rgba(120,0,0,1)');
    gr.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(px, py, R, R * (0.6 + rand() * 0.4), rand() * 3, 0, 7);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  const data = g.getImageData(0, 0, size, size).data;
  return {
    tex, extent, homes, fields: list,
    // How worn, and how much field, the ground is at (x, z), 0..1.
    at(x, z) {
      const [px, py] = P(x, z);
      const i = (Math.min(size - 1, Math.max(0, py | 0)) * size + Math.min(size - 1, Math.max(0, px | 0))) * 4;
      return { wear: data[i] / 255, field: data[i + 1] / 255 };
    },
  };
}

// ---- ground cover ----

// A tuft of blades, each drawn both ways round so it never shows a dark back.
function tuftGeometry(blades, h, base) {
  const pos = [], col = [];
  const rand = rng(77 + blades);
  for (let i = 0; i < blades; i++) {
    const a = rand() * Math.PI * 2, lean = 0.15 + rand() * 0.25, w = 0.05 + rand() * 0.04, hh = h * (0.6 + rand() * 0.5);
    const ox = Math.cos(a) * 0.08, oz = Math.sin(a) * 0.08, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = ox + Math.cos(a) * lean * hh, tz = oz + Math.sin(a) * lean * hh;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, hh, tz, ox + px, 0, oz + pz, ox - px, 0, oz - pz, tx, hh, tz);
    for (let k = 0; k < 2; k++) col.push(base.r, base.g, base.b, base.r, base.g, base.b, 1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Grass takes its light from the sky, not from the faces of its blades.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  return g;
}

let swayMat = null;
function grassMaterial() {
  if (swayMat) return swayMat;
  swayMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  swayMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec4 wp = instanceMatrix * vec4(0., 0., 0., 1.);
  float s = sin(uTime * 1.7 + wp.x * .12 + wp.z * .07) * .5 + sin(uTime * 2.9 + wp.x * .31) * .2;
  transformed.x += s * .12 * position.y; transformed.z += s * .06 * position.y; }`);
  };
  return swayMat;
}

const CELL = 60;           // grass is cut into squares so far ones can be skipped
const GRASS_SEEN = 270;    // grass further than this from the camera isn't drawn

// Grass, flowers, stones and bushes over the map. avoid(x, z): no cover there (a keep, water).
// Returns { update(camera), clear(x, z, r) }; clear() takes cover off ground a building now stands on.
export function drawCover(scene, heightAt, seed, { avoid = () => false, land = null, trees = null, half = 280, tufts = 110000 } = {}) {
  const rand = rng(seed * 7 + 3);
  const slopeAt = (x, z) => { const h = heightAt(x, z); return Math.hypot(heightAt(x + 1, z) - h, heightAt(x, z + 1) - h); };
  const clearGround = (x, z) => { if (avoid(x, z)) return false; const L = land?.at(x, z); return !L || (L.wear < 0.25 && L.field < 0.4); };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const groups = [];         // every instanced mesh, with where each instance stands

  // Scatter in clumps; returns [{ x, z, k, c }].
  const scatter = (max, test, size, colour, clump = () => 1) => {
    const out = [];
    let cx = 0, cz = 0, left = 0;
    for (let tries = 0; out.length < max && tries < max * 6; tries++) {
      if (left <= 0) { cx = (rand() * 2 - 1) * half; cz = (rand() * 2 - 1) * half; left = clump(); }
      left--;
      const x = cx + (rand() - 0.5) * 1.6, z = cz + (rand() - 0.5) * 1.6;
      if (!test(x, z)) { left = 0; continue; }
      out.push({ x, z, k: size(), c: colour(x, z, new THREE.Color()) });
    }
    return out;
  };
  const build = (geo, mat, list, { shadow = false, sink = 0.05 } = {}) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, rand() * 6.28);
      s.set(it.k, it.k * (0.8 + rand() * 0.4), it.k);
      p.set(it.x, heightAt(it.x, it.z) - sink, it.z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      mesh.setColorAt(i, it.c);
    });
    mesh.count = list.length;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    groups.push({ mesh, list });
    return mesh;
  };
  // Grass and flowers go into squares of CELL metres.
  const cells = new Map();
  const cellOf = (list, key) => {
    for (const it of list) {
      const id = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL);
      let c = cells.get(id);
      if (!c) cells.set(id, c = { x: (Math.floor(it.x / CELL) + 0.5) * CELL, z: (Math.floor(it.z / CELL) + 0.5) * CELL, tuft: [], flower: [], meshes: [] });
      c[key].push(it);
    }
  };
  const lush = (x, z) => fbm(x * 0.02, z * 0.02, seed + 33, 3);
  cellOf(scatter(tufts, (x, z) => clearGround(x, z) && slopeAt(x, z) < 0.45 && rand() < 0.35 + lush(x, z) * 0.9,
    () => 0.6 + rand() * 0.8, (x, z, c) => c.setHSL(0.21 + rand() * 0.05 - lush(x, z) * 0.04, 0.4 + rand() * 0.15, 0.3 + rand() * 0.1), () => 3 + rand() * 6), 'tuft');
  const hues = [[0.13, 0.9, 0.62], [0, 0, 0.92], [0.76, 0.45, 0.62], [0.02, 0.7, 0.55]];
  cellOf(scatter(tufts / 12, (x, z) => clearGround(x, z) && fbm(x * 0.03, z * 0.03, seed + 91, 2) > 0.58,
    () => 0.6 + rand() * 0.5, (x, z, c) => c.setHSL(...hues[Math.floor(fbm(x * 0.05, z * 0.05, seed + 5, 1) * 4) % 4]), () => 2 + rand() * 5), 'flower');
  const tuftGeo = tuftGeometry(6, 0.5, new THREE.Color('#5c6650')), flowerGeo = tuftGeometry(4, 0.45, new THREE.Color('#9fb070'));
  for (const c of cells.values()) {
    if (c.tuft.length) c.meshes.push(build(tuftGeo, grassMaterial(), c.tuft));
    if (c.flower.length) c.meshes.push(build(flowerGeo, grassMaterial(), c.flower));
  }

  // Stones, more on the slopes.
  const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0).scale(1, 0.55, 0.8);
  build(stoneGeo, new THREE.MeshLambertMaterial({ flatShading: true }),
    scatter(2500, (x, z) => !avoid(x, z) && (slopeAt(x, z) > 0.2 || rand() < 0.25), () => 0.5 + rand() * rand() * 2.4, (x, z, c) => c.setHSL(0.1, 0.05 + rand() * 0.05, 0.42 + rand() * 0.15)));

  // Bushes: at the edges of woods, round fields, and here and there.
  const bushes = [];
  const bush = (x, z, k) => { if (!avoid(x, z) && Math.abs(x) < half + 60 && Math.abs(z) < half + 60) bushes.push({ x, z, k, c: new THREE.Color().setHSL(0.24 + rand() * 0.07, 0.35 + rand() * 0.15, 0.22 + rand() * 0.1) }); };
  for (const t of trees?.spots || []) if (rand() < 0.35) { const a = rand() * 6.28, d = 2 + rand() * 4; bush(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, 0.6 + rand() * 0.8); }
  for (const f of land?.fields || []) {
    const c = Math.cos(f.ang), sn = Math.sin(f.ang), P = 2 * (f.w + f.l);
    for (let i = 0; i < P / 2.2; i++) {
      if (rand() < 0.3) continue;
      const t = rand() * P;
      const [u, v] = t < f.w ? [t - f.w / 2, -f.l / 2] : t < f.w + f.l ? [f.w / 2, t - f.w - f.l / 2] : t < 2 * f.w + f.l ? [t - f.w - f.l - f.w / 2, f.l / 2] : [-f.w / 2, t - 2 * f.w - f.l - f.l / 2];
      bush(f.x + u * c + v * sn, f.z - u * sn + v * c, 0.55 + rand() * 0.4);
    }
  }
  for (let i = 0; i < 500; i++) { const x = (rand() * 2 - 1) * half, z = (rand() * 2 - 1) * half; if (clearGround(x, z)) bush(x, z, 0.6 + rand() * 1.1); }
  const bushGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.6, 0),
    new THREE.IcosahedronGeometry(0.7, 0).translate(0.7, 0.45, 0.2),
    new THREE.IcosahedronGeometry(0.65, 0).translate(-0.6, 0.4, -0.25),
  ]);
  build(bushGeo, new THREE.MeshLambertMaterial({ flatShading: true }), bushes.slice(0, 3000), { shadow: true, sink: 0.2 });

  const cover = {
    update(camera) {
      const c = camera.position;
      for (const cell of cells.values()) {
        const show = Math.hypot(cell.x - c.x, cell.z - c.z, c.y - heightAt(cell.x, cell.z)) < GRASS_SEEN + CELL * 0.7;
        for (const mesh of cell.meshes) mesh.visible = show;
      }
    },
    clear(x, z, r) {
      for (const { mesh, list } of groups) {
        let hit = false;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          if (Math.abs(it.x - x) > r || Math.abs(it.z - z) > r || Math.hypot(it.x - x, it.z - z) > r) continue;
          mesh.setMatrixAt(i, zero);
          hit = true;
        }
        if (hit) mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
  scene.userData.cover = cover;
  return cover;
}
