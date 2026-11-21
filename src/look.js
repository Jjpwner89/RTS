// How the game looks as a whole, shared by every view: the quality setting, the sky, the
// sun and the haze, the weather's light, and the finishing pass every frame goes through
// (soft shadowing where things meet the ground, then the colour grade). Looks only.
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// ---- quality ----
// scale: pixel ratio cap. shadow: shadow map size (0 = no shadows). post: the finishing
// pass. ao: ambient occlusion at this fraction of the screen (0 = none). msaa: samples.
// cover: how far grass is drawn (metres), and how much of it. far: soldiers beyond this many
// metres are drawn in their far model and cast no shadow (models.js LOD). trees: trees nearer
// than this are drawn in their detailed model (nature.js TREE_LOD).
export const QUALITY = {
  low: { name: 'Low', scale: 1, shadow: 1024, soft: false, post: false, ao: 0, msaa: 0, cover: 150, density: 0.45, far: 60, trees: 40 },
  medium: { name: 'Medium', scale: 1.5, shadow: 2048, soft: true, post: true, ao: 0.5, msaa: 2, cover: 230, density: 0.8, far: 100, trees: 90 },
  high: { name: 'High', scale: 2, shadow: 4096, soft: true, post: true, ao: 0.75, msaa: 4, cover: 300, density: 1, far: 140, trees: 140 },
};
// The one place the picture setting lives: localStorage 'rts.quality' = 'low' | 'medium' | 'high'.
// Other modules read quality() and follow onQuality(); fx.js scales its effects by it.
export const QUALITY_KEY = 'rts.quality';
function startQuality() {
  const asked = new URLSearchParams(location.search).get('quality');
  if (QUALITY[asked]) return { name: asked, chosen: true };
  try {
    const s = localStorage.getItem(QUALITY_KEY) ?? localStorage.getItem('rts.look');   // (its first name, one evening)
    if (QUALITY[s]) return { name: s, chosen: true };
  } catch { /* no storage */ }
  return { name: 'medium', chosen: false };
}
const start = startQuality();
export const look = { quality: start.name, chosen: start.chosen, get q() { return QUALITY[this.quality]; } };
export const quality = () => look.quality;
const listeners = new Set();
// f(name, settings) whenever the setting changes; returns a function that stops listening.
export const onQuality = f => { listeners.add(f); return () => listeners.delete(f); };
export function setQuality(name, { save = true } = {}) {
  if (!QUALITY[name]) { console.warn(`look: no quality "${name}" (low, medium, high)`); return; }
  look.quality = name;
  if (save) { look.chosen = true; try { localStorage.setItem(QUALITY_KEY, name); } catch { /* no storage */ } }
  for (const f of listeners) f(name, look.q);
}
// Until the player picks one, a weak or software GPU starts on Low (createStage asks).
const WEAK_GPU = /SwiftShader|llvmpipe|Software|Microsoft Basic|Intel\(R\) (HD|UHD) Graphics|Mali-[GT]?[0-9]|Adreno \(TM\) [1-5]/i;
export function guessQuality(gl) {
  if (look.chosen) return;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  if (WEAK_GPU.test(gpu) || (navigator.hardwareConcurrency || 8) <= 2) {
    console.info(`look: starting on Low picture for this GPU (${gpu || 'unknown'}); the sound panel's Picture setting changes it`);
    setQuality('low', { save: false });
  }
}

// ---- palette ----
// One light for every view: a warm afternoon sun, a soft blue sky over a warm haze.
export const PALETTE = {
  zenith: new THREE.Color('#5f8fc0'), horizon: new THREE.Color('#d3dbd6'), haze: new THREE.Color('#c9d3cf'),
  sun: new THREE.Color('#ffe9cc'), sunI: 3.2, skyLight: new THREE.Color('#c4dbf2'), groundLight: new THREE.Color('#6b5c40'), hemiI: 1.1,
  exposure: 1.0,
};
// Where the sun stands: low in the south-west, for long shadows (from the target toward the sun).
export const SUN_DIR = new THREE.Vector3(200, 125, 30).normalize();

// Weather: how each kind changes the sky, the haze and the light (fieldview.js sets it on a field).
const WEATHER = {
  clear: { light: 1, hemi: 1, cloud: 0.35, near: 260, far: 720, grade: 0 },   // colours from PALETTE
  rain: { zenith: '#6c7780', horizon: '#9aa3a6', haze: '#8f989b', light: 0.58, hemi: 0.95, cloud: 0.95, near: 80, far: 470, sunTint: '#dfe6ea', grade: 0.6 },
  fog: { zenith: '#aab3b2', horizon: '#c4c9c4', haze: '#c4c9c4', light: 0.55, hemi: 1.1, cloud: 0.7, near: 15, far: 210, sunTint: '#f3ecdf', grade: 0.4 },
  night: { zenith: '#0b1222', horizon: '#1c2738', haze: '#182233', light: 0.12, hemi: 0.3, cloud: 0.4, near: 40, far: 330, sunTint: '#9fb4dd', grade: 0.8 },
};

// ---- the sky ----
// A dome round the camera: blue overhead fading to the haze at the horizon, a glow round
// the sun, and slow clouds. Its horizon is the fog's colour, so the land fades into it.
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uZenith, uHorizon, uSun, uSunCol; uniform float uCloud, uTime;
varying vec3 vDir;
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.07 + 11.3; a *= .5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.);
  vec3 col = mix(uHorizon, uZenith, pow(up, .55));
  // below the horizon: the haze, a touch darker
  col = mix(col, uHorizon * .92, smoothstep(0., -.08, d.y));
  float s = max(dot(d, uSun), 0.);
  col += uSunCol * (pow(s, 6.) * .22 + pow(s, 64.) * .35 + smoothstep(.9994, .9997, s) * 2.);
  // clouds on a high flat ceiling, thinning toward the horizon
  vec2 cp = d.xz / max(d.y + .12, .05) * 1.6 + uTime * vec2(.006, .002);
  float c = smoothstep(.55 - uCloud * .35, .9, fbm(cp)) * smoothstep(0., .25, d.y);
  vec3 cloud = mix(uHorizon * 1.05, vec3(1.), .5 + .5 * pow(s, 3.)) * (1. - uCloud * .35);
  col = mix(col, cloud, c * (.55 + uCloud * .4));
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SKY_TIME = { value: 0 };
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uZenith: { value: PALETTE.zenith.clone() }, uHorizon: { value: PALETTE.horizon.clone() }, uSun: { value: SUN_DIR.clone() },
      uSunCol: { value: PALETTE.sun.clone() }, uCloud: { value: WEATHER.clear.cloud }, uTime: SKY_TIME },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  // Follows the camera, so it is always the far backdrop.
  dome.onBeforeRender = (r, s, camera) => { dome.position.copy(camera.position); dome.updateMatrixWorld(); SKY_TIME.value = performance.now() / 1000; };
  dome.userData.sky = true;
  return dome;
}

// The sky of whatever scene is being drawn, for materials that reflect it (water).
export const SKY = { uZenith: { value: PALETTE.zenith.clone() }, uHorizon: { value: PALETTE.horizon.clone() },
  uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: PALETTE.sun.clone() }, uSunI: { value: 1 } };
export function prepare(s) {
  const L = s.userData.look;
  if (!L) return;
  const u = L.sky.material.uniforms;
  SKY.uZenith.value.copy(u.uZenith.value); SKY.uHorizon.value.copy(u.uHorizon.value);
  SKY.uSunCol.value.copy(L.sun.color); SKY.uSunI.value = L.sun.intensity / PALETTE.sunI;
}

// Gives a new scene the shared sky, haze and light. Returns the sun.
export function lightScene(s, { fog = [WEATHER.clear.near, WEATHER.clear.far] } = {}) {
  s.background = PALETTE.horizon.clone();
  s.fog = new THREE.Fog(PALETTE.haze.clone(), ...fog);
  const hemi = new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, PALETTE.hemiI);
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunI);
  sun.castShadow = look.q.shadow > 0;
  sun.shadow.mapSize.set(look.q.shadow || 512, look.q.shadow || 512);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  const sky = skyDome();
  s.add(hemi, sun, sun.target, sky);
  s.userData.sun = sun;
  s.userData.look = { hemi, sun, sky, fogFar: fog[1], fogNear: fog[0], weather: 'clear', grade: 0 };
  setWeather(s, 'clear');
  return sun;
}

// Sets a scene's sky, haze and light for the weather: 'clear', 'rain', 'fog' or 'night'.
export function setWeather(s, kind) {
  const L = s.userData.look;
  const W = WEATHER[kind];
  if (!L) { console.warn('look: setWeather on a scene lightScene() did not light'); return; }
  if (!W) { console.warn(`look: no weather "${kind}"; clear instead`); return setWeather(s, 'clear'); }
  const P = PALETTE, u = L.sky.material.uniforms, clear = kind === 'clear';
  u.uZenith.value.set(clear ? P.zenith : W.zenith); u.uHorizon.value.set(clear ? P.horizon : W.horizon); u.uCloud.value = W.cloud;
  u.uSunCol.value.set(clear ? P.sun : W.sunTint).multiplyScalar(clear ? 1 : 0.35);
  s.background.set(clear ? P.horizon : W.horizon);
  s.fog.color.set(clear ? P.haze : W.haze);
  // a clear day keeps the scene's own haze distance (the world map sees further)
  s.fog.near = kind === 'clear' ? L.fogNear : W.near;
  s.fog.far = kind === 'clear' ? L.fogFar : Math.min(L.fogFar, W.far);
  L.sun.intensity = PALETTE.sunI * W.light;
  L.sun.color.set(clear ? P.sun : W.sunTint);
  L.hemi.intensity = PALETTE.hemiI * W.hemi;
  L.hemi.color.set(P.skyLight); L.hemi.groundColor.set(P.groundLight);
  L.weather = kind;
  L.grade = W.grade;
}

// ---- the finishing pass ----
// The frame is drawn into a buffer, then: ambient occlusion (darkening where things meet,
// so buildings, trees and men sit on the ground), tone mapping, and the colour grade.
const POST_FS = /* glsl */`
uniform sampler2D tColor, tAO, tDepth; uniform float uAO, uNear, uFar, uExposure, uDull, uCurve, uSat; uniform vec2 uRes; uniform vec3 uWarm, uCool, uTint;
varying vec2 vUv;
float lin(float d) { float z = d * 2. - 1.; return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 i = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
  const mat3 o = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
  c *= uExposure / .6; c = i * c; c = RRTAndODTFit(c); c = o * c; return clamp(c, 0., 1.);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  #ifdef AO
  float d = lin(texture2D(tDepth, vUv).x);
  float ao = texture2D(tAO, vUv).r;
  c *= mix(1., ao, uAO * (1. - smoothstep(180., 520., d)));
  #endif
  c = srgb(aces(c));
  // the grade: a gentle S-curve, warm highlights, slightly cool shadows, a little less green
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(c, c * c * (3. - 2. * c), uCurve);
  c += uWarm * smoothstep(.45, 1., l) + uCool * (1. - smoothstep(0., .4, l));
  c = mix(vec3(l), c, uSat - uDull * .3);
  c *= uTint;
  c += (rnd(vUv * uRes) - .5) / 255.;   // no banding in the sky
  gl_FragColor = vec4(c, 1.);
}`;

// The grade, shared by every view (tunable from the console: look.GRADE.uSat.value = 1.1).
export const GRADE = { uCurve: { value: 0.18 }, uSat: { value: 0.95 }, uWarm: { value: new THREE.Vector3(0.02, 0.008, -0.02) },
  uCool: { value: new THREE.Vector3(-0.01, 0.0, 0.018) }, uTint: { value: new THREE.Vector3(1.0, 0.99, 0.985) } };

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = new THREE.Vector2();
    this.target = null;
    this.ao = null;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tAO: { value: null }, tDepth: { value: null }, uAO: { value: 0.9 }, uNear: { value: 1 }, uFar: { value: 2000 },
        uExposure: { value: PALETTE.exposure }, uDull: { value: 0 }, uRes: { value: new THREE.Vector2() }, ...GRADE },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: POST_FS, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
  }

  // Makes (or remakes) the buffers for this size and quality.
  setup(w, h, q) {
    const key = `${w}x${h}:${q.msaa}:${q.ao}`;
    if (this.key === key) return;
    this.key = key;
    this.target?.dispose();
    this.ao?.dispose();
    this.ao = null;
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa, depthTexture: depth });
    if (q.ao > 0) {
      const aw = Math.max(1, Math.round(w * q.ao)), ah = Math.max(1, Math.round(h * q.ao));
      // Normals come from the depth buffer: the men's walking shader moves them, so a
      // separate normal pass would draw them in the wrong pose.
      this.ao = new GTAOPass(null, new THREE.PerspectiveCamera(), aw, ah);
      this.ao.setGBuffer(depth);
      this.ao.output = GTAOPass.OUTPUT.Off;
      this.ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 2.5, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.mat.defines.AO = '';
    } else delete this.mat.defines.AO;
    this.mat.needsUpdate = true;
    this.mat.uniforms.tColor.value = this.target.texture;
    this.mat.uniforms.tDepth.value = depth;
    this.mat.uniforms.tAO.value = this.ao ? this.ao.gtaoMap : null;
    this.mat.uniforms.uRes.value.set(w, h);
  }

  render(draw, scene, camera, q) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    this.setup(this.size.x, this.size.y, q);
    const was = r.getRenderTarget();
    r.setRenderTarget(this.target);
    draw(scene, camera);
    if (this.ao) {
      if (this.ao.camera !== camera) { this.ao.camera = camera; this.ao.setSize(this.ao.width, this.ao.height); }
      this.ao.render(r, null, this.target);
    }
    const u = this.mat.uniforms;
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uDull.value = scene.userData.look?.grade || 0;
    r.setRenderTarget(was);
    draw(this.scene, this.camera);
  }

  dispose() { this.target?.dispose(); this.ao?.dispose(); this.key = null; }
}

// ---- the picture setting ----
// A row in the sound panel (audio.js puts it in the top bar): Picture Low / Medium / High.
function pictureRow() {
  const pan = document.getElementById('sound-panel');
  if (!pan) return false;
  if (pan.querySelector('#picture')) return true;
  const row = document.createElement('label');
  row.innerHTML = `Picture <select id="picture" title="Lower it if the game stutters">${Object.entries(QUALITY).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select>`;
  const sel = row.querySelector('select');
  sel.value = look.quality;
  sel.style.cssText = 'font: inherit; color: var(--ink); background: rgba(0,0,0,.25); border: 1px solid var(--edge); border-radius: 5px; padding: 2px 4px;';
  sel.onchange = () => setQuality(sel.value);
  onQuality(name => { sel.value = name; });
  pan.insertBefore(row, pan.querySelector('.row'));
  return true;
}
// Called by createStage(); the sound panel appears once the page has loaded.
export function mountPicture(tries = 0) {
  if (pictureRow()) return;
  if (tries > 40) { console.warn('look: no sound panel to put the Picture setting in, so it can only be set with ?quality=low|medium|high'); return; }
  setTimeout(() => mountPicture(tries + 1), 250);
}

// ---- measuring ----
// await look.bench() in the console: what drawing a frame costs, for each quality in turn,
// several rounds interleaved so a busy machine skews them all alike. gpuMs is the GPU's own
// time (a timer query); cpuMs what the draw calls cost the main thread. A hidden page's
// frame rate means nothing, so this times the frames themselves.
export async function bench({ n = 12, rounds = 3, qualities = [look.quality] } = {}) {
  const st = window.stage, r = st.renderer, gl = r.getContext(), was = look.quality;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) console.warn('look.bench: no GPU timer queries here; gpuMs left out');
  const gpu = Object.fromEntries(qualities.map(q => [q, []])), cpu = Object.fromEntries(qualities.map(q => [q, []])), info = {};
  // (a message, not a timer: a hidden page's timers are slowed to a crawl)
  const wait = () => new Promise(res => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0); });
  r.info.autoReset = false;
  for (let k = 0; k < rounds; k++) for (const q of qualities) {
    if (look.quality !== q) setQuality(q);
    r.render(st.current(), st.camera);   // warm up after a change
    for (let i = 0; i < n; i++) {
      const query = ext && gl.createQuery();
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      const t = performance.now();
      r.render(st.current(), st.camera);
      cpu[q].push(performance.now() - t);
      if (query) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        const until = performance.now() + 3000;
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < until) await wait();
        if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu[q].push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(query);
      }
    }
    r.info.reset();
    r.render(st.current(), st.camera);
    info[q] = { calls: r.info.render.calls, triangles: r.info.render.triangles, pixels: `${r.domElement.width}x${r.domElement.height}` };
  }
  r.info.autoReset = true;
  if (look.quality !== was) setQuality(was);
  const med = a => a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(2) : null;
  const p90 = a => a.length ? +[...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)].toFixed(2) : null;
  const out = {};
  // the quickest frames are the nearest to what the GPU costs when nothing else is using it
  const low = a => a.length ? +Math.min(...a).toFixed(2) : null;
  for (const q of qualities) out[q] = { gpuMinMs: low(gpu[q]), gpuMs: med(gpu[q]), gpuP90Ms: p90(gpu[q]), cpuMs: med(cpu[q]), ...info[q] };
  return out;
}
if (typeof window !== 'undefined') window.look = { bench, quality, setQuality, setWeather, look, QUALITY, GRADE, PALETTE };
