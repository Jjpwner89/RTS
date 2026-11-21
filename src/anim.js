// Soldier animation: the baked soldiers (models.js) play clips on the GPU, so every instanced soldier can do his own
// thing. assets/anim.bin holds every clip of every skeleton as bone matrices, one row of three texels per bone per
// frame, at about 20 frames a second; assets/anim.json says where each clip starts (tools/models/lineup/skin.js
// makes both). A baked vertex keeps its bind position and up to four bone weights; each instance names the clip
// frame it shows, and the shader blends those bones. Horse vertices (bones from 128) follow a second clip, so a
// rider and his horse move to their own clips.
import * as THREE from 'three';

let table = null, data = null, texture = null;
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
} catch (e) {
  console.warn('Soldier animations did not load; soldiers stand still.', e);
}
export const animReady = () => !!table;

// A clip of a skeleton ('male', 'female', 'horse'): { start, frames, fps, duration, loop?, hold?, events? }.
export const clipOf = (rig, name) => table?.clips[rig]?.[name] || null;

// ---- the pose on the CPU, for whoever draws a soldier standing still ----

const _m = new Float32Array(12);
function boneAt(frame, bone, out) {
  const row = Math.floor(frame / table.rowFrames), at = (row * table.width + (frame - row * table.rowFrames) * table.slots * 3 + bone * 3) * 4;
  for (let i = 0; i < 12; i++) out[i] = data[at + i];
  return out;
}
// Positions for a baked geometry posed at a clip's frame (the rider's clip for people, the horse's for the horse).
export function poseOf(geo, rig, name, horseName = 'Idle', frame = 0) {
  const bind = geo.attributes.bind, B = geo.attributes.aBones, W = geo.attributes.aWeights, out = new Float32Array(bind.count * 3);
  const human = clipOf(rig, name), horse = clipOf('horse', horseName);
  for (let i = 0; i < bind.count; i++) {
    const x = bind.getX(i), y = bind.getY(i), z = bind.getZ(i);
    let px = 0, py = 0, pz = 0;
    for (let k = 0; k < 4; k++) {
      const w = W.getComponent(i, k);
      if (!w) continue;
      let b = B.getComponent(i, k), c = human;
      if (b >= table.horse) { b -= table.horse; c = horse; }
      const m = boneAt(c.start + Math.min(frame, c.frames - 1), b, _m);
      px += w * (m[0] * x + m[1] * y + m[2] * z + m[3]);
      py += w * (m[4] * x + m[5] * y + m[6] * z + m[7]);
      pz += w * (m[8] * x + m[9] * y + m[10] * z + m[11]);
    }
    out[i * 3] = px; out[i * 3 + 1] = py; out[i * 3 + 2] = pz;
  }
  return out;
}

// Ready a baked geometry from models.glb: its stored positions are the bind pose; keep them (and their normals) for
// the shader, and pose `position` in the figure's standing clip for anything drawn without animation.
export function prepare(geo, info) {
  geo.setAttribute('aBones', geo.attributes._bones);
  geo.setAttribute('aWeights', geo.attributes._weights);
  geo.deleteAttribute('_bones'); geo.deleteAttribute('_weights');
  const bind = geo.attributes.position;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', bind);
  g.setIndex(geo.index);
  g.computeVertexNormals();
  geo.setAttribute('bind', bind);
  geo.setAttribute('bindNormal', g.attributes.normal);
  geo.setAttribute('position', new THREE.BufferAttribute(poseOf(geo, info.rig, info.rest), 3));
  geo.userData.anim = info;
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
      .replace('#include <begin_vertex>', 'vec3 transformed = (animM * vec4(bind, 1.0)).xyz;');
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
