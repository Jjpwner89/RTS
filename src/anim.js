// Soldier animation: the baked soldiers (models.js) play clips on the GPU, so every instanced soldier can do his own
// thing. assets/anim.bin holds every clip of every skeleton as bone matrices, one row of three texels per bone per
// frame, at about 20 frames a second; assets/anim.json says where each clip starts (tools/models/lineup/skin.js
// makes both). A baked vertex keeps its bind position and up to four bone weights; each instance names the clip
// frame it shows, and the shader blends those bones. Horse vertices (bones from 128) follow a second clip, so a
// rider and his horse move to their own clips. A model with a second rider (a lord's bannerman) gives each vertex a
// shift: where it stands off in the model, and whether it follows the other human skeleton (bake.js split()).
import * as THREE from 'three';

let table = null, data = null, texture = null, rigStep = 0;
try {
  const [json, bin] = await Promise.all([
    fetch(new URL('../assets/anim.json', import.meta.url)).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(new URL('../assets/anim.bin', import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)),
  ]);
  const half = new Uint16Array(bin);
  table = json;
  texture = new THREE.DataTexture(half, json.width, json.height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  data = new Float32Array(half.length);
  for (let i = 0; i < half.length; i++) data[i] = THREE.DataUtils.fromHalfFloat(half[i]);
  // a woman's clips are a man's, in the same order: each starts this many frames after his (skin.js bakeClips)
  const steps = new Set(Object.entries(json.clips.male).map(([n, c]) => json.clips.female?.[n]?.start - c.start));
  if (steps.size === 1 && [...steps][0] > 0) rigStep = [...steps][0];
  else console.warn('anim.json: the woman\'s clips do not follow the man\'s one for one, so a man and a woman in one model (a lady and her bannerman) cannot share a clip; the second rider will be posed wrong.', [...steps]);
} catch (e) {
  console.warn('Soldier animations did not load; soldiers stand still.', e);
}
export const animReady = () => !!table;

// A clip of a skeleton ('male', 'female', 'horse', 'wolf'): { start, frames, fps, duration, loop?, hold?, events? }.
export const clipOf = (rig, name) => table?.clips[rig]?.[name] || null;
// How many frames a woman's clip starts after the man's of the same name (0: they are not aligned).
export const rigOffset = () => rigStep;

// ---- the pose on the CPU, for whoever draws a soldier standing still ----

const _m = new Float32Array(12);
function boneAt(frame, bone, out) {
  const row = Math.floor(frame / table.rowFrames), at = (row * table.width + (frame - row * table.rowFrames) * table.slots * 3 + bone * 3) * 4;
  for (let i = 0; i < 12; i++) out[i] = data[at + i];
  return out;
}
// The bone numbers of the props a soldier holds (skin.js PROP: 'R', 'BOW', 'SHIELD', ...).
export const propSlots = () => table?.prop || {};
// Where a clip has one bone (or prop slot) at a frame: a 3x4 matrix, rows first.
export const boneOf = (rig, name, frame, bone) => { const c = clipOf(rig, name); return boneAt(c.start + Math.min(frame, c.frames - 1), bone, new Float32Array(12)); };
// Positions for a baked geometry posed at a clip's frame (the rider's clip for people, the horse's for the horse);
// `only` poses just those vertices (the rest of `out` stays zero).
export function poseOf(geo, rig, name, horseName = 'Idle', frame = 0, only = null) {
  const bind = geo.attributes.bind, B = geo.attributes.aBones, W = geo.attributes.aWeights, S = geo.attributes.aShift, out = new Float32Array(bind.count * 3);
  const human = clipOf(rig, name), horse = clipOf('horse', horseName);
  for (let n = only ? only.length : bind.count, j = 0; j < n; j++) {
    const i = only ? only[j] : j;
    const x = bind.getX(i), y = bind.getY(i), z = bind.getZ(i), other = S.getW(i) * rigStep;
    let px = S.getX(i), py = S.getY(i), pz = S.getZ(i);
    for (let k = 0; k < 4; k++) {
      const w = W.getComponent(i, k);
      if (!w) continue;
      let b = B.getComponent(i, k), c = human, at = other;
      if (b >= table.horse) { b -= table.horse; c = horse; at = 0; }
      const m = boneAt(c.start + at + Math.min(frame, c.frames - 1), b, _m);
      px += w * (m[0] * x + m[1] * y + m[2] * z + m[3]);
      py += w * (m[4] * x + m[5] * y + m[6] * z + m[7]);
      pz += w * (m[8] * x + m[9] * y + m[10] * z + m[11]);
    }
    out[i * 3] = px; out[i * 3 + 1] = py; out[i * 3 + 2] = pz;
  }
  return out;
}

// ---- gaits: how fast each clip's feet cover the ground ----

// A looping gait's own speed, in metres a second: how fast a planted foot (or hoof) slides back when the clip plays
// at its natural pace. Measured once from the first baked figure of each skeleton (the horse's from a rider's
// horse), so a clip that changes needs no number changed anywhere.
const measureOn = {}, speeds = {};
export function gaitSpeed(rig, name) {
  const key = rig + '/' + name;
  if (key in speeds) return speeds[key];
  const geo = measureOn[rig], horse = rig === 'horse', c = clipOf(rig, name);
  let v = NaN;
  if (geo && c?.loop) {
    const rest = geo.attributes.position, B = geo.attributes.aBones;
    let lo = Infinity;
    for (let i = 0; i < rest.count; i++) if ((B.getX(i) >= table.horse) === horse) lo = Math.min(lo, rest.getY(i));
    // the soles: the lowest part of the figure, near its middle (not a spear butt or a shield's rim)
    const feet = [];
    for (let i = 0; i < rest.count; i++) if ((B.getX(i) >= table.horse) === horse && rest.getY(i) < lo + 0.12 && (horse || Math.abs(rest.getX(i)) < 0.35)) feet.push(i);
    const poses = [];
    for (let f = 0; f < c.frames; f++) poses.push(horse ? poseOf(geo, geo.userData.anim.rig, 'Ride_Idle', name, f, feet) : poseOf(geo, rig, name, 'Idle', f, feet));
    const vs = [];
    for (const i of feet) {
      const ys = poses.map(p => p[i * 3 + 1]), low = Math.min(...ys);
      if (Math.max(...ys) - low < 0.06) continue;   // never lifts: not a foot
      for (let f = 0; f < c.frames; f++) {
        const a = poses[f], b = poses[(f + 1) % c.frames];
        if (a[i * 3 + 1] < low + 0.012 && b[i * 3 + 1] < low + 0.012) vs.push((a[i * 3 + 2] - b[i * 3 + 2]) * c.fps);
      }
    }
    vs.sort((x, y) => x - y);
    v = vs.length ? vs[vs.length >> 1] : NaN;
  }
  if (!(v > 0.2)) console.warn(`anim: can't measure how fast the ${rig} ${name} clip walks${geo ? '' : ' (no baked figure of that skeleton)'}; it plays at its own pace`);
  return speeds[key] = v > 0.2 ? v : NaN;
}
// How fast figures walk (pace B): the one table, kept three-free in pace.js for the game logic.
export { PACE, walkSpeed } from './pace.js';
// The range of paces a gait may play at before the next one takes over (and, past the fastest, the most it is
// hurried before the feet slide). Only the slowest gait ever plays below about 0.7 (the next one takes over at
// `hi` of the last), so `lo` is how slowly a man may shuffle into his place in slow steps rather than slide.
export const CADENCE = { lo: 0.3, hi: 1.6, max: 2.2 };
// Which of `gaits` (slowest first) to show at ground speed v, and how fast to play it so the feet keep pace: the
// slowest that keeps up without hurrying past `hi`. { name, rate }, rate 1 being the clip's own pace.
export function gaitFor(rig, gaits, v, hi = CADENCE.hi) {
  let name = gaits[gaits.length - 1], speed = gaitSpeed(rig, name);
  for (const g of gaits) { const s = gaitSpeed(rig, g); if (v / s <= hi) { name = g; speed = s; break; } }
  const rate = speed > 0 ? Math.max(CADENCE.lo, Math.min(CADENCE.max, v / speed)) : 1;
  return { name, rate };
}

// (one figure in a model: no shift. All such geometries share one buffer of zeros, as long as the longest.)
let still = null;
const noShift = n => still?.count >= n ? still : (still = new THREE.BufferAttribute(new Float32Array(n * 4), 4));
// Ready a baked geometry from models.glb: its stored positions are the bind pose; keep them (and their normals) for
// the shader, and pose `position` in the figure's standing clip for anything drawn without animation.
export function prepare(geo, info) {
  geo.setAttribute('aBones', geo.attributes._bones);
  geo.setAttribute('aWeights', geo.attributes._weights);
  geo.deleteAttribute('_bones'); geo.deleteAttribute('_weights');
  geo.setAttribute('aShift', geo.attributes._shift || noShift(geo.attributes.position.count));
  geo.deleteAttribute('_shift');
  const bind = geo.attributes.position;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', bind);
  g.setIndex(geo.index);
  g.computeVertexNormals();
  geo.setAttribute('bind', bind);
  geo.setAttribute('bindNormal', g.attributes.normal);
  geo.setAttribute('position', new THREE.BufferAttribute(poseOf(geo, info.rig, info.rest), 3));
  geo.userData.anim = info;
  if (info.horse) measureOn.horse ??= geo;   // (a rider's own feet sit in the stirrups: men are measured on foot)
  else measureOn[info.rig] ??= geo;
}

// ---- the shader ----

// A copy of `base` that skins each vertex by its instance's clip frame. Full detail blends four bones and eases
// between frames; the light version (far from the camera) takes two bones and the nearest frame.
const cache = new Map();
export function animMaterial(base, { light = false } = {}) {
  const key = base.uuid + light;
  if (cache.has(key)) return cache.get(key);
  const m = base.clone();
  patch(m, light);
  cache.set(key, m);
  return m;
}
// The same skinning for the shadow pass.
const depth = {};
export function animDepthMaterial(light = false) {
  if (depth[light]) return depth[light];
  const m = depth[light] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patch(m, light);
  return m;
}
function patch(m, light) {
  const T = table;
  m.onBeforeCompile = shader => {
    shader.uniforms.animTex = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2D animTex;
attribute vec3 bind;
attribute vec3 bindNormal;
attribute vec4 aBones;
attribute vec4 aWeights;
attribute vec4 aShift;   // a second rider's place in the model (xyz), and the human skeleton he follows (w)
attribute vec4 aAnim;    // this instance's clip: first frame, frames (negative: holds at the end), frame now
attribute vec4 aAnimH;   // and its horse's
mat4 animBone(float frame, float bone) {
  int f = int(frame), row = f / ${T.rowFrames}, x = (f - row * ${T.rowFrames}) * ${T.slots * 3} + int(bone) * 3;
  vec4 a = texelFetch(animTex, ivec2(x, row), 0), b = texelFetch(animTex, ivec2(x + 1, row), 0), c = texelFetch(animTex, ivec2(x + 2, row), 0);
  return mat4(a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0);
}
mat4 animSkin() {
  bool horse = aBones.x >= ${T.horse}.0;
  vec4 clip = horse ? aAnimH : aAnim;
  if (!horse) clip.x += aShift.w * ${rigStep}.0;
  vec4 bones = horse ? aBones - ${T.horse}.0 : aBones;
  // (a time at the very end of a loop can round up to its length: wrap it, never read the next clip)
  float n = max(abs(clip.y), 1.0), f0 = floor(clip.z), t = clip.z - f0;
  f0 = clip.y > 0.0 ? mod(f0, n) : min(f0, n - 1.0);
  float f1 = clip.y > 0.0 ? mod(f0 + 1.0, n) : min(f0 + 1.0, n - 1.0);
  mat4 m = mat4(0.0);
  for (int k = 0; k < ${light ? 2 : 4}; k++) {
    float w = aWeights[k];
    if (w <= 0.0) continue;
    mat4 b = animBone(clip.x + f0, bones[k]);
    ${light ? '' : 'b += (animBone(clip.x + f1, bones[k]) - b) * t;'}
    m += w * b;
  }
  return m;
}`)
      .replace('void main() {', 'void main() {\n  mat4 animM = animSkin();')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = mat3(animM) * bindNormal;')
      .replace('#include <begin_vertex>', 'vec3 transformed = (animM * vec4(bind, 1.0)).xyz + aShift.xyz;');
  };
  m.customProgramCacheKey = () => 'anim' + light;
}

// ---- per instance ----

// A geometry for one instanced mesh: shares the baked one's buffers and adds this mesh's clip per instance.
export function animGeometry(geo, capacity) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  g.setIndex(geo.index);
  g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
  for (const k of ['aAnim', 'aAnimH']) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
  return g;
}
// Show clip `c` (clipOf) at `t` seconds on instance i of an animGeometry: `horse` sets the horse's clip.
export function setClip(geo, i, c, t, horse = false) {
  const a = geo.attributes[horse ? 'aAnimH' : 'aAnim'];
  if (!c) { a.setXYZW(i, 0, 1, 0, 0); return; }
  const f = c.loop ? ((t * c.fps) % c.frames + c.frames) % c.frames : Math.min(Math.max(0, t * c.fps), c.frames - 1);
  a.setXYZW(i, c.start, c.loop ? c.frames : -c.frames, f, 0);
}
