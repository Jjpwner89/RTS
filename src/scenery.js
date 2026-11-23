// What makes the ground look lived on: the painted ground shader (grass patches, bare earth,
// rock ledges, drifting cloud shadows), the river's moving water, a painted map of tracks and
// fields, and ground cover (grass that sways, wildflowers, stones, bushes). Looks only;
// nothing here changes the rules.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, rng } from './noise.js';
import { SKY, SEASON, look, snowy } from './look.js';

// Seconds, shared by every material that moves (grass, water, clouds).
export const TIME = { value: 0 };
export const tick = () => { TIME.value = performance.now() / 1000; };

const NOISE = /* glsl */`
float lh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(lh21(i), lh21(i + vec2(1, 0)), f.x), mix(lh21(i + vec2(0, 1)), lh21(i + vec2(1, 1)), f.x), f.y); }
float lfbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * lvn(p); p = p * 2.03 + 17.1; a *= .5; } return s / .9375; }
vec2 lh22(vec2 p) { return vec2(lh21(p), lh21(p + 19.7)); }
// Cobbles: x = distance to the nearest joint, y = that stone's own random shade.
vec2 cobble(vec2 p) {
  vec2 i = floor(p), f = fract(p), best = vec2(0.); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = g + .15 + .7 * lh22(i + g) - f; float d = dot(o, o);
    if (d < d1) { d2 = d1; d1 = d; best = i + g; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), lh21(best + 3.7));
}
`;

// Hands the fragment shader the world position and normal.
const withWorld = sh => sh.vertexShader
  .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
  .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');

// ---- the ground ----

// Photographed ground (Poly Haven, CC0: assets/textures/CREDITS.md) used as detail: each is
// divided by its own average colour, so it adds grain and flecks without changing the palette.
const GROUND_TEX = ['grass', 'earth', 'track', 'soil', 'rock'];
let ground = null;
function linearMean(img) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data, lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4, m = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += lin(d[i + k]);
  return new THREE.Color(...m.map(v => Math.max(0.01, v / (d.length / 4))));
}
function groundTextures() {
  if (ground) return ground;
  ground = {};
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  const loader = new THREE.TextureLoader();
  for (const n of GROUND_TEX) {
    const t = ground['t' + n] = { value: blank }, m = ground['m' + n] = { value: new THREE.Color(1, 1, 1) };
    loader.load(new URL(`../assets/textures/${n}.jpg`, import.meta.url).href, tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      m.value.copy(linearMean(tex.image));
      t.value = tex;
    }, undefined, e => console.warn(`scenery: assets/textures/${n}.jpg did not load, so the ground is drawn without that detail`, e));
  }
  return ground;
}

// land: a landMask() for tracks and fields, or null.
export function groundMaterial(land = null) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = { uTime: TIME, uMask: { value: land?.tex || null }, uExtent: { value: land?.extent || 1 },
    uHomeA: { value: new THREE.Vector2(land?.homes[0]?.x || 0, land?.homes[0]?.z || 0) },
    uHomeB: { value: new THREE.Vector2(land?.homes[1]?.x ?? 0, land?.homes[1]?.z ?? 1e5) }, ...groundTextures(), ...SEASON };
  if (land) { mat.defines = { LAND: '' }; mat.userData.mask = land.tex; mat.userData.land = land; mat.userData.uniforms = uniforms; }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = withWorld(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
uniform float uTime, uExtent, uFrost, uSnow; uniform vec3 uGrass; uniform sampler2D uMask; uniform vec2 uHomeA, uHomeB;
float gGrass = 1.;   // how much of the ground here is grass, for its bump (below)
uniform sampler2D tgrass, tearth, ttrack, tsoil, trock; uniform vec3 mgrass, mearth, mtrack, msoil, mrock;
${NOISE}
// a texture's detail at p: its colour over its average, partly greyed so the palette keeps its hue
vec3 dtl(sampler2D t, vec3 m, vec2 p, float sat) { vec3 d = texture2D(t, p).rgb / m; return mix(vec3(dot(d, vec3(.3, .59, .11))), d, sat); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 col = diffuseColor.rgb;
  vec2 p = vWPos.xz;
  float near = 1. - smoothstep(60., 260., length(cameraPosition - vWPos));
  float slope = 1. - vWN.y;
  // Broad patches of lusher and drier grass, then clumps, then the grass itself: the
  // photographed grass at two sizes, so it never shows a repeat.
  col *= mix(vec3(.86, .95, .80), vec3(1.10, 1.03, .88), lfbm(p * .012));
  // and wide sweeps of meadow, lusher in the hollows, paler and drier on the rises
  col *= mix(vec3(.84, .93, .86), vec3(1.12, 1.06, .9), smoothstep(.3, .75, lfbm(p * .0035 + 41.)));
  col *= .9 + .2 * lfbm(p * .09 + 3.1);
  col *= dtl(tgrass, mgrass, p / 3.3, .6) * mix(vec3(1.), dtl(tgrass, mgrass, p / 21. + .37, .5), .6);
  // the season (look.js): spring green, summer gold, autumn rust, winter pale with frost
  col *= uGrass;
  col = mix(col, vec3(dot(col, vec3(.3, .59, .11))) * vec3(1.3, 1.34, 1.42), uFrost);
  // Bare earth showing through in worn hollows, grass breaking up its edges.
  vec3 earthD = dtl(tearth, mearth, p / 4.6, .8);
  float bare = smoothstep(.65, .82, lfbm(p * .035 + 9.) + (earthD.g - 1.) * .12);
  vec3 earth = vec3(.42, .35, .25) * earthD;
  // (seen from afar the hollows are small things: less of them on the map)
  col = mix(col, earth, bare * (.3 + .4 * near) * max(0., 1. - slope * 2.));
  // Rock on the steep sides, in ledges.
  float rk = smoothstep(.16, .32, slope + (lvn(p * .2) - .5) * .12);
  float ledge = .82 + .18 * smoothstep(.2, .8, fract(vWPos.y * .45 + lvn(p * .15) * 1.5));
  col = mix(col, vec3(.5, .49, .45) * ledge * dtl(trock, mrock, p / 11., .7), rk);
  gGrass = (1. - rk) * (1. - bare * .7);
#ifdef LAND
  vec4 mk = texture2D(uMask, p / (2. * uExtent) + .5);
  // Fields: furrows round the nearest keep; ploughed earth, ripe grain or young green.
  vec2 rel = p - (length(p - uHomeA) < length(p - uHomeB) ? uHomeA : uHomeB);
  float furrow = smoothstep(-.3, .3, sin(atan(rel.y, rel.x) * length(rel) * 2.4));
  vec3 crop = mk.b < .3 ? vec3(.36, .26, .17) : mk.b < .7 ? vec3(.66, .52, .25) : vec3(.34, .48, .19);
  crop *= (.74 + .3 * furrow) * (.9 + .2 * lvn(p * .8)) * (mk.b < .3 ? dtl(tsoil, msoil, p / 3., .6) : dtl(tgrass, mgrass, p / 2.7, .3));
  col = mix(col, crop, smoothstep(.55, .95, mk.g));
  // Tracks: packed earth with ruts.
  float wear = smoothstep(.15, .9, mk.r + (lvn(p * .7) - .5) * .25);
  float rut = smoothstep(.75, 1., mk.r) * (.5 + .5 * sin(lvn(p * .5) * 6.));
  vec3 trackCol = mix(vec3(.42, .35, .25) * earthD, vec3(.45, .37, .27) * dtl(ttrack, mtrack, p / 3.8, .7), smoothstep(.4, .85, mk.r));
  col = mix(col, trackCol * (1. - rut * .18), wear * .9);
  // Paved roads: rounded cobbles in greys and buff, dark joints, a kerb of darker setts along each edge.
  float pave = smoothstep(.5, .75, mk.b) * (1. - smoothstep(.4, .8, mk.g));
  float kerb = smoothstep(.2, .45, mk.b) * (1. - smoothstep(.55, .8, mk.b)) * (1. - smoothstep(.4, .8, mk.g));
  if (pave + kerb > .001) {
    vec2 cb = cobble(p * 2.3);
    float fine = 1. - smoothstep(30., 140., length(cameraPosition - vWPos));
    vec3 stone = mix(vec3(.50, .49, .46), vec3(.60, .55, .46), cb.y) * (.8 + .32 * cb.y);
    stone *= mix(1., .55 + .45 * smoothstep(.02, .12, cb.x), fine);
    stone *= .9 + .2 * lvn(p * .4);
    vec3 kerbs = vec3(.40, .39, .37) * (.85 + .25 * lh21(floor(p * .9)));
    col = mix(col, kerbs, kerb * .95);
    col = mix(col, stone, pave);
  }
  gGrass *= (1. - smoothstep(.55, .95, mk.g)) * (1. - wear) * max(0., 1. - pave - kerb);
  float open = (1. - wear * .85) * max(0., 1. - pave - kerb);   // tracks and roads trodden dark through the snow
#else
  float open = 1.;
#endif
  // Snow in winter (look.js uSnow): lying on level ground, thin and patchy at first and on the rises, never on the
  // steep sides or where feet and wheels keep the ground open
  if (uSnow > .001) {
    float lie = smoothstep(.3, .7, lfbm(p * .03 + 17.) * .6 + uSnow * .75) * (1. - smoothstep(.1, .24, slope)) * open;
    // a cool white, blue-grey in drifts and hollows, so it never reads as the map's warm parchment fog
    vec3 snow = mix(vec3(.66, .71, .79), vec3(.82, .85, .9), smoothstep(.25, .75, lfbm(p * .02 + 5.))) * (.95 + .07 * lvn(p * .6));
    col = mix(col, snow, lie * uSnow * .94);
    gGrass *= 1. - lie * uSnow;
  }
  // Cloud shadows drift over the land.
  col *= 1. - smoothstep(.42, .68, lfbm((p + uTime * vec2(3.5, 1.2)) * .006)) * .28;
  // A warmer, slightly softer grade so the greens don't go lime.
  col = mix(vec3(dot(col, vec3(.3, .59, .11))), col, .9) * vec3(1.02, .99, .93);
  diffuseColor.rgb = col;
}`)
      // Near the camera the grass has a little relief: the photographed grass's own light and dark as a bump.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float bnear = (1. - smoothstep(25., 110., length(cameraPosition - vWPos))) * gGrass;
  if (bnear > .01) {
    vec2 q = vWPos.xz / 3.3, e = vec2(1. / 512., 0.);
    float h0 = dot(texture2D(tgrass, q).rgb, vec3(.33)), hx = dot(texture2D(tgrass, q + e.xy).rgb, vec3(.33)), hz = dot(texture2D(tgrass, q + e.yx).rgb, vec3(.33));
    vec3 tilt = vec3(h0 - hx, 0., h0 - hz) / max(.05, dot(mgrass, vec3(.33))) * 1.6 * bnear;
    normal = normalize(normal + (viewMatrix * vec4(tilt, 0.)).xyz);
  }
}`);
  };
  return mat;
}

// ---- water ----

// Moving water: ripples that catch the sky (reflected by angle, more toward the horizon),
// the sun glinting off them, the colour deepening away from the banks, and foam along them.
// The mesh's uv.x runs 0..1 from bank to bank, where it has one (fieldview.js).
export function waterMaterial({ opacity = 0.85 } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide });
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: TIME }, SKY);
    sh.vertexShader = withWorld(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN; uniform float uTime, uSunI; uniform vec3 uZenith, uHorizon, uSunDir, uSunCol;
${NOISE}
float wv(vec2 p) { return lvn(p * .45 + vec2(uTime * .55, uTime * .18)) * .6 + lvn(p * 1.3 - vec2(uTime * .8, -uTime * .1)) * .3 + lvn(p * 3.1 + vec2(uTime * 1.4, 0.)) * .1; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 wp = vWPos.xz;
float e = .25, w0 = wv(wp);
vec3 wn = normalize(vec3((w0 - wv(wp + vec2(e, 0.))) * 1.6, 1., (w0 - wv(wp + vec2(0., e))) * 1.6));
float bank = 1.;
#ifdef USE_UV
bank = min(vUv.x, 1. - vUv.x) * 2.;
#endif
// deeper toward the middle, lighter and greener at the edges
diffuseColor.rgb *= mix(vec3(1.15, 1.25, 1.1), vec3(.6, .74, .84), smoothstep(0., .6, bank));
diffuseColor.rgb *= .9 + .2 * w0;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
{
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = .04 + .96 * pow(1. - max(dot(V, wn), 0.), 5.);
  vec3 R = reflect(-V, wn);
  vec3 sky = mix(uHorizon, uZenith, pow(max(R.y, 0.), .6));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, sky * .9, clamp(fres * 1.1 + .05, 0., .7));
  gl_FragColor.rgb += uSunCol * uSunI * (pow(max(dot(R, uSunDir), 0.), 180.) * 2.5 + pow(max(dot(R, uSunDir), 0.), 24.) * .12);
  float foam = 0.;
  #ifdef USE_UV
  foam = smoothstep(.16, .0, min(vUv.x, 1. - vUv.x) + (lvn(wp * 1.7 + uTime * vec2(.6, .1)) - .5) * .08) * .55;
  #endif
  foam += smoothstep(.83, .95, lvn(wp * 1.9 + vec2(uTime * 1.2, uTime * .3))) * .12;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.86, .9, .9) * (.6 + .4 * uSunI), foam);
  gl_FragColor.a = max(gl_FragColor.a, foam);
}`);
  };
  return mat;
}

// ---- tracks and fields ----

// A painted map of the land, read by the ground shader: red = worn track, green = field,
// blue = its crop. homes: keeps the tracks start from (fields grow round them when `fields`).
// roads: [{ pts: [[x, z], ...], width, paved }] to draw instead of tracks made up from the homes; a paved
// road is also painted crisply in blue (stone, with a fainter blue edge for the kerbs) over its worn track.
// wear: [{ x, z, r }] patches of trampled ground. river: keeps fields out of the water.
// paved: [{ pts, width }] stone roads laid on top, whatever the tracks are (a village's own roads).
// `redraw(paved)` paints the same land again with a new set of those.
export function landMask(seed, opts = {}) {
  const { homes = [], roads = null, fields = false, wear = null, river = null, extent = 380, size = 2048 } = opts;
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
  const paved = (pts, width) => {
    g.lineCap = g.lineJoin = 'round';
    for (const [k, c] of [[1, 'rgb(0,0,100)'], [0.8, 'rgb(0,0,155)']]) {
      g.strokeStyle = c;
      g.lineWidth = width * k * m;
      g.beginPath();
      pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.stroke();
    }
  };
  if (roads) for (const r of roads) { track(r.pts, r.width); if (r.paved) paved(r.pts, r.width); }
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
  // The village's own stone roads, over whatever tracks there are.
  for (const r of opts.paved || []) { track(r.pts, r.width * 0.8); paved(r.pts, r.width); }
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
    redraw: paved => landMask(seed, { ...opts, paved }),
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
    Object.assign(sh.uniforms, SEASON);
    // the grass's season, as on the ground
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGrass; uniform float uFrost, uSnow;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= uGrass;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.3, .59, .11))) * vec3(1.3, 1.34, 1.42), uFrost);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.82, .85, .89), uSnow * .55);   // tufts poking through the snow, dusted`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec4 wp = instanceMatrix * vec4(0., 0., 0., 1.);
  float s = sin(uTime * 1.7 + wp.x * .12 + wp.z * .07) * .5 + sin(uTime * 2.9 + wp.x * .31) * .2;
  transformed.x += s * .12 * position.y; transformed.z += s * .06 * position.y; }`);
  };
  return swayMat;
}

// Trees: shaded darker toward the trunk and the underside of the crown (light gets in from
// above), and their crowns lean a little in the wind, each tree in its own time.
let treeMat = null;
export function treeMaterial() {
  if (treeMat) return treeMat;
  treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // (snow on the crowns in winter: snowy(), below)
  treeMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vUp;\nattribute float aLeaf;')
      // each tree's own green tints its leaves (aLeaf 1), not its bark
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.xyz = mix(color.xyz, vColor.xyz, aLeaf);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vUp = position.y;
{ vec4 wp = instanceMatrix * vec4(0., 0., 0., 1.);
  float h = max(0., position.y - 2.2);
  float s = sin(uTime * 1.1 + wp.x * .07 + wp.z * .05) * .6 + sin(uTime * 2.3 + wp.x * .19) * .25;
  transformed.x += s * .045 * h; transformed.z += s * .025 * h; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUp;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= mix(.62, 1.04, smoothstep(2.4, 6.8, vUp));`);
  };
  return snowy(treeMat, { amount: 0.85 });
}

const CELL = 60;           // grass is cut into squares so far ones can be skipped
// How far grass is drawn from the camera, and how much of it, follow the picture setting (look.js).

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
    mesh.count = mesh.userData.full = list.length;
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
    scatter(2500, (x, z) => !avoid(x, z) && (slopeAt(x, z) > 0.2 || rand() < 0.25), () => 0.5 + rand() * rand() * 2.4, (x, z, c) => c.setHSL(0.1, 0.05 + rand() * 0.05, 0.3 + rand() * 0.12)));

  // Bushes: at the edges of woods, round fields, and here and there.
  const bushes = [];
  const bush = (x, z, k) => { if (!avoid(x, z) && Math.abs(x) < half + 60 && Math.abs(z) < half + 60) bushes.push({ x, z, k, c: new THREE.Color().setHSL(0.25 + rand() * 0.07, 0.28 + rand() * 0.12, 0.17 + rand() * 0.08) }); };
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
      const c = camera.position, { cover: seen, density } = look.q;
      // Less grass on a lower setting: each square draws the first part of its list.
      if (density !== this.density) {
        this.density = density;
        for (const cell of cells.values()) for (const mesh of cell.meshes) mesh.count = Math.ceil(mesh.userData.full * density);
      }
      for (const cell of cells.values()) {
        const show = Math.hypot(cell.x - c.x, cell.z - c.z, c.y - heightAt(cell.x, cell.z)) < seen + CELL * 0.7;
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
