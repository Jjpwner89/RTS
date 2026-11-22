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
  high: { name: 'High', scale: 1.75, shadow: 4096, soft: true, post: true, ao: 0.6, msaa: 4, cover: 300, density: 1, far: 140, trees: 140 },
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
// clock: the campaign's seconds (campaign.js sets it), which turn the seasons and the day (below)
export const look = { quality: start.name, chosen: start.chosen, get q() { return QUALITY[this.quality]; }, clock: null };
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

// ---- the year and the day ----
// On the campaign's clock a year is 1200 seconds (world.js season) and a day DAY seconds. Without a clock (a
// battle on its own) nothing turns: late spring at midday, as the game always looked.
export const YEAR = 1200, DAY = 240;
// The grass's season, for the ground and the grass tufts (scenery.js): a tint and how much winter frost pales it.
export const SEASON = { uGrass: { value: new THREE.Color(1, 1, 1) }, uFrost: { value: 0 } };
// The leaves' season, for trees (terrain.js): a tint for broadleaves (pines keep theirs) and whether birches are bare.
// (step changes whenever they do)
export const year = { leaf: new THREE.Color(1, 1, 1), bare: false, step: -1 };
// at the middle of spring, summer, autumn and winter
const SEASONS = [
  { leaf: [0.92, 1.08, 0.86], grass: [0.95, 1.06, 0.92], frost: 0 },
  { leaf: [1.08, 1.02, 0.76], grass: [1.17, 1.03, 0.70], frost: 0 },
  { leaf: [1.62, 0.72, 0.36], grass: [1.12, 0.92, 0.70], frost: 0.08 },
  { leaf: [0.86, 0.88, 0.86], grass: [0.92, 0.95, 0.97], frost: 0.5 },
];
function turnYear(t) {
  const f = ((t % YEAR) + YEAR) % YEAR / YEAR, step = Math.floor(f * 240);   // a step every five seconds
  if (step === year.step) return;
  year.step = step;
  const x = f * 4 - 0.5, i = (Math.floor(x) + 4) % 4, k = x - Math.floor(x), w = k * k * (3 - 2 * k);
  const A = SEASONS[i], B = SEASONS[(i + 1) % 4], mix = (a, b) => a.map((v, j) => v + (b[j] - v) * w);
  year.leaf.setRGB(...mix(A.leaf, B.leaf));
  SEASON.uGrass.value.setRGB(...mix(A.grass, B.grass));
  SEASON.uFrost.value = A.frost + (B.frost - A.frost) * w;
  year.bare = Math.floor(f * 4) === 3;
}

// The day, through the weather: the sun's strength (i) and colour, the sky's light (hemi) and its colour, the sky
// and haze, how high the sun (or by night the moon) stands (degrees), and how dark it is (night: lamps, torches and
// stars). Dawn and dusk are warm and low; the night is a dark moonlit blue, and regiments read by their banners,
// torches and rings (view.js), not by a bright world (lifted a little, creator 2026-11-21: "slightly brighter"). d: 0 midnight, 0.5 noon. Keys without colours keep the weather's.
// The creator's rulings: night is shorter than day (2026-11-21), and the day longer while night, dusk and dawn keep
// their length (2026-11-22). Of each DAY = 240 s, 180 s is daylight, 12 s dusk, 36 s full dark and 12 s dawn (PARTS),
// with dusk and dawn still clearly seen. The sounds of the hour follow (audio.js).
export const PARTS = { dawn: [0.075, 0.125], dusk: [0.875, 0.925] };
const MOON = { i: 0.34, sun: '#93acdf', hemi: 0.62, sky: '#5f81d0', zenith: '#09132b', horizon: '#1e2d4e', haze: '#1c2a48', elev: 42, night: 1 };
const DAYKEYS = [
  { d: 0, ...MOON },
  { d: 0.075, ...MOON },
  { d: 0.0906, i: 0.46, sun: '#c48f8a', hemi: 0.78, sky: '#7d88b6', zenith: '#1d2a52', horizon: '#9a6f78', haze: '#5a4f62', elev: 22, night: 0.7 },
  { d: 0.1094, i: 0.72, sun: '#ff9a5c', hemi: 0.74, zenith: '#5d72a4', horizon: '#f4ae7e', haze: '#d9a588', elev: 7, night: 0.15 },
  { d: 0.1313, i: 0.95, sun: '#ffd2a6', hemi: 0.94, elev: 17, night: 0 },
  { d: 0.275, i: 1, hemi: 1, elev: 28, night: 0 },
  { d: 0.5, i: 1, hemi: 1, elev: 40, night: 0 },
  { d: 0.75, i: 1, hemi: 1, elev: 26, night: 0 },
  { d: 0.8656, i: 0.95, hemi: 0.95, elev: 16, night: 0 },
  { d: 0.8844, i: 0.74, sun: '#ff8a4c', hemi: 0.74, zenith: '#53659c', horizon: '#f39a62', haze: '#d6936f', elev: 6, night: 0.15 },
  { d: 0.9063, i: 0.46, sun: '#d0787a', hemi: 0.78, sky: '#7d88b6', zenith: '#1c2550', horizon: '#93576a', haze: '#55445e', elev: 22, night: 0.7 },
  { d: 0.925, ...MOON },
  { d: 1, ...MOON },
];
// The time of day for the top bar: a little dial with the sun (by day) or the moon (by night) climbing over the
// horizon, and its name. Returns { html, name, key }; key changes when the drawing does.
const TIMES = [[PARTS.dawn[0], 'Night'], [PARTS.dawn[1], 'Dawn'], [0.4, 'Morning'], [0.6, 'Midday'], [PARTS.dusk[0], 'Afternoon'], [PARTS.dusk[1], 'Dusk'], [1.01, 'Night']];
export function dayDial(t) {
  // the sun is up from mid-dawn to mid-dusk, the moon the rest
  const rise = (PARTS.dawn[0] + PARTS.dawn[1]) / 2, set = (PARTS.dusk[0] + PARTS.dusk[1]) / 2;
  const d = dayOf(t), name = TIMES.find(([e]) => d < e)[1], up = d >= rise && d < set;
  const f = up ? (d - rise) / (set - rise) : ((d - set + 1) % 1) / (1 - set + rise), a = Math.PI * Math.min(1, Math.max(0, f));
  const x = (16 - 12 * Math.cos(a)).toFixed(1), y = (17 - 11 * Math.sin(a)).toFixed(1);
  const sky = name === 'Night' ? '#1b2547' : name === 'Dawn' || name === 'Dusk' ? '#d98a62' : '#7fb0dc';
  const disc = up ? `<circle cx="${x}" cy="${y}" r="3.4" fill="#ffd45a"/>` : `<circle cx="${x}" cy="${y}" r="3.2" fill="#e8eefc"/><circle cx="${(+x + 1.6).toFixed(1)}" cy="${(+y - 1).toFixed(1)}" r="2.6" fill="${sky}"/>`;
  const html = `<svg viewBox="0 0 32 19" width="32" height="19" aria-hidden="true"><path d="M2 17A14 14 0 0 1 30 17Z" fill="${sky}"/>${disc}<path d="M1 17.5H31" stroke="#c9b48a" stroke-width="1.2"/></svg>${name}`;
  return { html, name, key: `${name}${x}${y}` };
}

// How dark it is, 0 by day to 1 at night: lamps and torches light, stars come out (lamps(), siegeview.js torches).
export const NIGHT = { value: 0 };
const AZIMUTH = Math.atan2(SUN_DIR.z, SUN_DIR.x), tmp = new THREE.Color();
// the campaign starts in the morning, and noon falls 30 s in
export const dayOf = t => ((t / DAY + 0.375) % 1 + 1) % 1;
function turnDay(s, t) {
  const L = s.userData.look, d = dayOf(t), step = Math.floor(d * 1200);
  if (step === L.dayStep && L.dayWeather === L.weather) return;
  L.dayStep = step; L.dayWeather = L.weather;
  const j = DAYKEYS.findIndex(k => k.d > d), A = DAYKEYS[j - 1], B = DAYKEYS[j], k = (d - A.d) / (B.d - A.d), w = k * k * (3 - 2 * k);
  const num = key => A[key] + (B[key] - A[key]) * w;
  // a colour from the keys, each falling back to the weather's own; a dull sky takes only some of the day's colour
  const B0 = L.base, wc = L.weather === 'clear' ? 1 : 0.8;
  const col = (key, out, base) => out.copy(tmp.set(A[key] || base).lerp(new THREE.Color(B[key] || base), w)).lerp(base, 1 - wc);
  // A battlefield's night keeps a brighter moon (playtest round 4: men vanished), still dark-skied and blue, so
  // every regiment and its side can be told apart (fieldview.js marks a battle's scene).
  const moon = L.battle ? num('night') * wc : 0;
  L.sun.intensity = B0.sunI * (num('i') + 0.33 * moon);
  col('sun', L.sun.color, B0.sun);
  L.hemi.intensity = B0.hemiI * (num('hemi') + 0.45 * moon);
  col('sky', L.hemi.color, PALETTE.skyLight);
  const u = L.sky.material.uniforms;
  col('zenith', u.uZenith.value, B0.zenith);
  col('horizon', u.uHorizon.value, B0.horizon);
  col('haze', s.fog.color, B0.haze);
  s.background.copy(u.uHorizon.value);
  L.night = u.uNight.value = num('night') * wc;
  u.uSunCol.value.copy(L.sun.color).multiplyScalar(L.weather === 'clear' ? 1 : 0.35);
  const e = THREE.MathUtils.degToRad(num('elev'));
  SUN_DIR.set(Math.cos(AZIMUTH) * Math.cos(e), Math.sin(e), Math.sin(AZIMUTH) * Math.cos(e));
  u.uSun.value.copy(SUN_DIR); SKY.uSunDir.value.copy(SUN_DIR);
}

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
uniform vec3 uZenith, uHorizon, uSun, uSunCol; uniform float uCloud, uTime, uNight;
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
  vec3 cloud = mix(uHorizon * 1.05, vec3(1. - uNight * .82), .5 + .5 * pow(s, 3.)) * (1. - uCloud * .35);
  // stars by night, behind the clouds
  vec2 sp = d.xz / (d.y + .3) * 140.;
  col += uNight * step(.992, h(floor(sp))) * smoothstep(.04, .3, d.y) * (1. - c) * (.35 + .5 * h(floor(sp) + 3.));
  col = mix(col, cloud, c * (.55 + uCloud * .4));
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SKY_TIME = { value: 0 };
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uZenith: { value: PALETTE.zenith.clone() }, uHorizon: { value: PALETTE.horizon.clone() }, uSun: { value: SUN_DIR.clone() },
      uSunCol: { value: PALETTE.sun.clone() }, uCloud: { value: WEATHER.clear.cloud }, uTime: SKY_TIME, uNight: { value: 0 } },
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
  const t = look.clock?.();
  if (t != null) turnYear(t);
  if (L.weather === 'night') {
    L.night = L.sky.material.uniforms.uNight.value = 1;
    // a night-weather battle gets the same moon boost turnDay gives a campaign night, on top of its own darkness
    if (L.battle) { L.sun.intensity = L.base.sunI + PALETTE.sunI * 0.33; L.hemi.intensity = L.base.hemiI + PALETTE.hemiI * 0.45; }
  } else if (t != null) turnDay(s, t);
  else L.night = L.sky.material.uniforms.uNight.value = 0;
  NIGHT.value = L.night;
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
  // what the day turns from (turnDay); a night's weather is its own night and the day leaves it be
  L.base = { sunI: L.sun.intensity, sun: L.sun.color.clone(), hemiI: L.hemi.intensity, zenith: u.uZenith.value.clone(), horizon: u.uHorizon.value.clone(), haze: s.fog.color.clone() };
  L.dayStep = -1;
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
// ---- lamps ----
// Warm lights that come on as night falls (NIGHT): lit windows and hearths in villages, fires in camps, torches
// carried by regiments. Each is a glow facing the camera, a bright core in a soft halo, drawn a little toward the
// camera (push, metres) so a lamp set inside a house shows on the wall you see. They come on one by one late in
// dusk, small and dim while any light is left in the sky, and grow to full only in the last of it (creator,
// 2026-11-22: dusk was hard to see for all the torches; QC: still blobs at NIGHT 0.85); they flicker. Cheap: one draw for all of a view's lamps, and none by day.
const LAMP_VS = /* glsl */`
attribute float aSize, aPush, aSeed;
uniform float uNight, uTime, uH;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  mv.xyz += normalize(-mv.xyz) * aPush;
  gl_Position = projectionMatrix * mv;
  float dark = smoothstep(.85, 1., uNight);
  gl_PointSize = min(320., aSize * (.4 + .6 * dark) * projectionMatrix[1][1] * uH * .5 / -mv.z);
  float flick = .86 + .14 * sin(uTime * (6. + aSeed * 5.) + aSeed * 40.) * sin(uTime * 2.3 + aSeed * 17.);
  vA = smoothstep(.45 + aSeed * .4, .6 + aSeed * .4, uNight) * (.35 + .65 * dark) * flick;
}`;
const LAMP_FS = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2. - 1.;
  float r2 = dot(q, q);
  if (r2 > 1. || vA < .01) discard;
  gl_FragColor = vec4(uColor * vA * (exp(-r2 * 30.) * 2.2 + exp(-r2 * 5.) * .3) * (1. - r2), 1.);
}`;
const lampSize = new THREE.Vector2();
// Adds a set of lamps to a scene; set(list) places them: [{ x, y, z, size (metres across, 6), push (0) }].
export function lamps(scene, color = '#ffa04a') {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT, uTime: SKY_TIME, uH: { value: 800 }, uColor: { value: new THREE.Color(color).multiplyScalar(2.2) } },
    vertexShader: LAMP_VS, fragmentShader: LAMP_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  points.visible = false;
  points.onBeforeRender = r => { mat.uniforms.uH.value = r.getDrawingBufferSize(lampSize).y; };
  scene.add(points);
  let n = 0;
  // shown only after dark (checked each frame by the scene's own drawing)
  const was = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) { was.apply(this, a); points.visible = n > 0 && NIGHT.value > 0.45; };
  return {
    points,
    set(list) {
      n = list.length;
      const pos = new Float32Array(n * 3), size = new Float32Array(n), push = new Float32Array(n), seed = new Float32Array(n);
      list.forEach((l, i) => {
        pos.set([l.x, l.y, l.z], i * 3); size[i] = l.size ?? 6; push[i] = l.push ?? 0;
        seed[i] = (Math.sin(l.x * 12.9898 + l.z * 78.233) * 43758.5453 % 1 + 1) % 1;
      });
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aPush', new THREE.BufferAttribute(push, 1));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    },
    // moves lamp i (for lamps that follow something), then update() once all are moved
    move(i, x, y, z) { geo.attributes.position?.array.set([x, y, z], i * 3); },
    update() { if (geo.attributes.position) geo.attributes.position.needsUpdate = true; },
  };
}

// Warm pools of torchlight on the ground (regiments by night, view.js): set([{ x, z, radius }]) each frame. Each pool
// is a small grid laid on the ground (heightAt) and added to what is there, faint at its edge, fading in with the
// lamps as night falls.
const POOL_VS = /* glsl */`
attribute float aR;
varying float vR;
void main() { vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const POOL_FS = /* glsl */`
uniform vec3 uColor;
uniform float uNight;
varying float vR;
void main() {
  float a = smoothstep(.45, .6, uNight) * (.35 + .65 * smoothstep(.85, 1., uNight)), f = 1. - clamp(vR, 0., 1.);
  gl_FragColor = vec4(uColor * a * f * f, 1.);
}`;
export function torchPools(scene, heightAt, color = '#ff9a4a') {
  const N = 7, geo = new THREE.BufferGeometry();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT, uColor: { value: new THREE.Color(color).multiplyScalar(0.22) } },
    vertexShader: POOL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.visible = false;
  scene.add(mesh);
  let room = 0, pos, rr;
  // one grid's triangles, repeated for each pool
  const cell = [];
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) { const a = i * N + j; cell.push(a, a + 1, a + N, a + 1, a + N + 1, a + N); }
  return {
    mesh,
    set(list) {
      mesh.visible = list.length > 0 && NIGHT.value > 0.45;
      if (!mesh.visible) return;
      if (list.length > room) {
        room = Math.max(list.length, room * 2, 8);
        pos = new Float32Array(room * N * N * 3); rr = new Float32Array(room * N * N);
        const idx = new Uint32Array(room * cell.length);
        for (let p = 0; p < room; p++) cell.forEach((v, k) => { idx[p * cell.length + k] = v + p * N * N; });
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aR', new THREE.BufferAttribute(rr, 1));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      list.forEach((l, p) => {
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const u = i / (N - 1) * 2 - 1, v = j / (N - 1) * 2 - 1, x = l.x + u * l.radius, z = l.z + v * l.radius, k = p * N * N + i * N + j;
          pos[k * 3] = x; pos[k * 3 + 1] = heightAt(x, z) + 0.15; pos[k * 3 + 2] = z;
          rr[k] = Math.hypot(u, v);
        }
      });
      geo.setDrawRange(0, list.length * cell.length);
      geo.attributes.position.needsUpdate = geo.attributes.aR.needsUpdate = true;
    },
  };
}

if (typeof window !== 'undefined') window.look = { bench, quality, setQuality, setWeather, look, QUALITY, GRADE, PALETTE, SEASON, year, dayOf, NIGHT };
