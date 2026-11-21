// Game feel: small, cheap effects that make every action read without numbers. One Fx per
// scene (fxFor), fed by the views once a frame:
//   BattleView: fx.battle(battle, view, selection): blows, falls, arrows, dust, routs, stones,
//               falling walls, a morale bar under each banner, a pulse on new selections, shake
//   Controls:   fx.ordered(kind, regs, target): a marker and a path where an order sends men
//   TownView:   fx.town(town, meshes): scaffolds, building dust, fire and smoke on damage, ruins
//               that smoulder, chimney smoke
// Particles live in fixed pools of instanced meshes, are only made near the camera, and run on
// game time (they hold still while paused); markers and shake run on real time. The quality
// setting (localStorage 'rts.quality': low, medium or high; setFxQuality) scales them all.
//
// For audio.js, which reads state rather than hooking: fx.fires lists the village's burning buildings and fresh
// ruins each frame ({ x, z, level } with level 0–1), and fx.warSmoke the map's places under attack or siege ({ x, z }).
import * as THREE from 'three';
import { LOD } from './models.js';
import { audio } from './audio.js';

// ---- quality ----

const QUALITY = {
  low:    { cap: 500,  rate: 0.3, trails: false, chimneys: false, blood: false, shake: 0.5 },
  medium: { cap: 1400, rate: 0.6, trails: true,  chimneys: true,  blood: true,  shake: 1 },
  high:   { cap: 3000, rate: 1,   trails: true,  chimneys: true,  blood: true,  shake: 1 },
};
let level = 'high';
try { if (QUALITY[localStorage.getItem('rts.quality')]) level = localStorage.getItem('rts.quality'); } catch {}
let Q = QUALITY[level];
export const fxQuality = () => level;
export function setFxQuality(q) {
  if (!QUALITY[q]) { console.warn(`fx: no quality called "${q}"; keeping ${level}`); return; }
  level = q; Q = QUALITY[q];
  try { localStorage.setItem('rts.quality', q); } catch {}
}

// ---- shared bits ----

const rnd = (a, b) => a + Math.random() * (b - a);
// What fx last saw of a soldier, kept on him under symbols (left out of saves and JSON).
const HP = Symbol('fx.hp'), ALIVE = Symbol('fx.alive'), STRUCK = Symbol('fx.struck');
const camPos = () => LOD.camera?.position;
// Distance from the camera on the ground plane; effects too far to see are not made.
function far(x, z, R) {
  const c = camPos();
  if (!c) return false;
  const dx = x - c.x, dz = z - c.z;
  return dx * dx + dz * dz > R * R;
}

// A material whose instances each carry their own fade (aAlpha).
function fading(Base, opts) {
  const m = new Base({ transparent: true, depthWrite: false, ...opts });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>');
  };
  return m;
}

// ---- particles ----

// A pool of particles drawn as one instanced mesh. Each lives `life` seconds: it moves with
// its velocity, falls with `grav`, slows with `drag`, grows from s0 to s1 and fades in and out.
// A full pool skips new particles (said once in the console).
const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 's0', 's1', 'a0', 'grav', 'drag', 'sy', 'r', 'g', 'b', 'fade'];
class Pool {
  constructor(scene, name, geo, mat, cap) {
    this.name = name;
    this.cap = cap;
    this.n = 0;
    for (const f of FIELDS) this[f] = new Float32Array(cap);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const m = this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 3;
    scene.add(m);
  }

  // o: { x, y, z, vx, vy, vz, life, s0, s1, a, grav, drag, sy, color: THREE.Color, fade }
  add(x, y, z, vx, vy, vz, life, s0, s1, a, color, grav = 0, drag = 0, sy = 1, fade = 1) {
    const cap = Math.min(this.cap, Q.cap);
    if (this.n >= cap) {
      if (!this.saidFull) { this.saidFull = true; console.info(`fx: the ${this.name} pool is full (${cap} at ${level} quality); extra ones are skipped`); }
      return;
    }
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.sy[i] = sy; this.fade[i] = fade;
    this.r[i] = color.r; this.g[i] = color.g; this.b[i] = color.b;
  }

  kill(i) {
    const j = --this.n;
    if (i !== j) for (const f of FIELDS) this[f][i] = this[f][j];
  }

  step(dt) {
    const M = this.mesh.instanceMatrix.array, C = this.mesh.instanceColor.array, A = this.alpha.array;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); i--; continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vz[i] *= k;
      this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      const s = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      const o = i * 16;
      M[o] = s; M[o + 5] = s * this.sy[i]; M[o + 10] = s;
      M[o + 12] = this.x[i]; M[o + 13] = this.y[i]; M[o + 14] = this.z[i];
      C[i * 3] = this.r[i]; C[i * 3 + 1] = this.g[i]; C[i * 3 + 2] = this.b[i];
      A[i] = this.a0[i] * Math.min(1, t * 8) * Math.pow(1 - t, this.fade[i]);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

const COL = {
  dust: new THREE.Color('#b8a888'), mud: new THREE.Color('#7a6a52'), wet: new THREE.Color('#8a8070'),
  spark: new THREE.Color('#ffe2a0'), blood: new THREE.Color('#5e1410'), cloth: new THREE.Color('#9a8a70'),
  smoke: new THREE.Color('#5a5550'), soot: new THREE.Color('#38342f'), chimney: new THREE.Color('#d6d2ca'),
  flame: new THREE.Color('#ff8a2a'), ember: new THREE.Color('#ffc060'), wood: new THREE.Color('#8a6a48'),
  stone: new THREE.Color('#8c8478'), white: new THREE.Color('#ffffff'), gold: new THREE.Color('#ffd34a'),
  warsmoke: new THREE.Color('#4a4642'),
};

// ---- markers on the ground (real time) ----

const RING = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
// An arrowhead flat on the ground, pointing along +z.
const CHEVRON = (() => {
  const sh = new THREE.Shape([new THREE.Vector2(0, 0.55), new THREE.Vector2(0.6, -0.35), new THREE.Vector2(0, -0.05), new THREE.Vector2(-0.6, -0.35)]);
  return new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2);
})();
const MARK = { move: '#ffd970', attack: '#ff5a4a', select: '#ffffff', charge: '#ffa040', wall: '#9fd0ff', built: '#ffd970' };

// ---- morale under the banners ----

// Five steps from steady (four green pips) to breaking (one red), drawn once and shared.
const PIPS = [];
function pipTexture(n) {
  if (PIPS[n]) return PIPS[n];
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  const colour = ['#c8382c', '#c8382c', '#e0902c', '#d8c840', '#5ec85a'][n];
  g.fillStyle = 'rgba(20,16,12,0.7)';
  g.beginPath(); g.roundRect(1, 2, 62, 12, 4); g.fill();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i < n ? colour : 'rgba(255,255,255,0.12)';
    g.beginPath(); g.roundRect(5 + i * 14.5, 5, 11, 6, 2); g.fill();
  }
  const t = PIPS[n] = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pipsOf = f => f > 0.7 ? 4 : f > 0.45 ? 3 : f > 0.25 ? 2 : 1;

// ---- the effects for one scene ----

export function fxFor(scene, heightAt) {
  return scene.userData.fx ||= new Fx(scene, heightAt);
}

const CHIMNEYS = new Set(['house', 'smelter', 'weaponsmith', 'armourer', 'bakery', 'tanner', 'hall']);

export class Fx {
  constructor(scene, heightAt) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.puffs = new Pool(scene, 'dust and smoke', new THREE.IcosahedronGeometry(1, 1), fading(THREE.MeshLambertMaterial), 3000);   // smooth: soft billows, not rocks
    this.glow = new Pool(scene, 'spark and flame', new THREE.OctahedronGeometry(1, 0), fading(THREE.MeshBasicMaterial, { blending: THREE.AdditiveBlending }), 1500);
    this.bits = new Pool(scene, 'debris', new THREE.BoxGeometry(1, 1, 1), fading(THREE.MeshLambertMaterial, { flatShading: true }), 600);
    // arrow trails: one faint streak behind each arrow in flight
    this.trails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#f2ead8', transparent: true, opacity: 0.22, depthWrite: false }), 1500);
    this.trails.count = 0;
    this.trails.frustumCulled = false;
    scene.add(this.trails);
    // scaffolds round building sites
    this.poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#7a5a3a', flatShading: true }), 800);
    this.poles.count = 0;
    this.poles.frustumCulled = false;
    this.poles.castShadow = true;
    scene.add(this.poles);
    this.rings = [];
    this.paths = [];
    // the arrowheads that flow along each order's path
    this.chev = new THREE.InstancedMesh(CHEVRON.clone(), fading(THREE.MeshBasicMaterial, { depthTest: false, side: THREE.DoubleSide }), 400);
    this.chevAlpha = new THREE.InstancedBufferAttribute(new Float32Array(400), 1);
    this.chev.geometry.setAttribute('aAlpha', this.chevAlpha);
    this.chev.setColorAt(0, COL.white);
    this.chev.count = 0;
    this.chev.renderOrder = 6;
    this.chev.frustumCulled = false;
    scene.add(this.chev);
    this.pips = new Map();        // regiment → its morale sprite
    this.lastArrows = [];
    this.seenImpacts = new WeakSet();
    this.walls = new WeakMap();   // wall piece → state seen
    this.sites = new WeakMap();   // building → { state, ruinedAt }
    this.prevSel = new Set();
    this.trauma = 0;
    this.dummy = new THREE.Object3D();
    this.real = performance.now();
    this.clock = null;
  }

  // ---- once a frame ----

  // Advance particles by game time `now` (seconds), markers and shake by real time.
  tick(now) {
    const dt = this.clock == null ? 0 : Math.max(0, Math.min(0.25, now - this.clock));
    this.clock = now;
    const t = performance.now(), real = Math.min(0.1, (t - this.real) / 1000);
    this.real = t;
    if (dt > 0) { this.puffs.step(dt); this.glow.step(dt); this.bits.step(dt); }
    this.stepMarkers(real);
    this.applyShake(real);
    return dt;
  }

  // ---- battles ----

  battle(b, view, selection) {
    if (b.version !== this.version) { this.version = b.version; this.lastArrows = []; }
    this.scope = b;   // the battle sounds belong to, so villages nobody watches stay quiet
    const dt = this.tick(b.time);
    this.scanSoldiers(b, dt);
    this.arrows(b);
    this.impacts(b);
    this.wallsFall(b);
    this.morale(b, view);
    this.selectionPulse(selection);
    this.victory(b, view);
  }

  // The moment a battle is won: gold sparks fountain from the winners' banners and rings ripple under them.
  victory(b, view) {
    if (b.winner == null || this.wonSeen === b) return;
    this.wonSeen = b;
    for (const bn of view.banners || []) {
      const r = bn.r;
      if (r.side !== b.winner || r.gone || r.routing) continue;
      this.ring(r.side === 0 ? 'built' : view.sideColor?.(r.side) || 'attack', r.cx, r.cz, this.width(r) * 1.2, { follow: r, life: 1.6, from: 0.3 });
      if (far(r.cx, r.cz, 300)) continue;
      const p = bn.sprite.position;
      for (let i = 0; i < 18 * Q.rate + 4; i++) this.glow.add(p.x + rnd(-1, 1), p.y, p.z + rnd(-1, 1), rnd(-2, 2), rnd(5, 9), rnd(-2, 2), rnd(1, 1.8), 0.22, 0.05, 1, COL.gold, 6, 0.6);
    }
  }

  // How brightly a soldier flashes from a blow just taken (0 to 1); view.js tints him by it.
  flash(s, time) {
    const at = s[STRUCK];
    if (at == null) return 0;
    const k = 1 - (time - at) / 0.18;
    return k > 0 ? k : 0;
  }

  scanSoldiers(b, dt) {
    const rain = b.weather === 'rain', dustCol = rain ? COL.wet : COL.dust;
    let hits = 0, hx = 0, hz = 0;
    for (const s of b.soldiers) {
      if (s.gone) continue;
      if (s[HP] === undefined) { s[HP] = s.hp; s[ALIVE] = s.alive; continue; }
      if (s.alive && s.hp < s[HP] - 0.01) { this.hit(s, b); hits++; hx += s.x; hz += s.z; }
      if (!s.alive && s[ALIVE]) this.fall(s, dustCol);
      s[HP] = s.hp; s[ALIVE] = s.alive;
      // Running men and galloping horses kick up dust; a rout leaves a cloud.
      if (dt > 0 && s.alive && s.v > (s.reg.T.mounted ? 4 : 3.2)) {
        const rate = (s.reg.T.mounted ? 1.4 : 0.35) * (s.reg.routing ? 3 : 1) * (rain ? 0.3 : 1) * Q.rate;
        if (Math.random() < rate * dt && !far(s.x, s.z, 170)) {
          const big = s.reg.routing ? 1.6 : s.reg.T.mounted ? 1.3 : 1;
          this.puffs.add(s.x - Math.sin(s.yaw) * 0.6, (s.y ?? this.heightAt(s.x, s.z)) + 0.3, s.z - Math.cos(s.yaw) * 0.6,
            rnd(-0.3, 0.3), rnd(0.4, 0.9), rnd(-0.3, 0.3), rnd(1, 1.6) * big, 0.3 * big, 1.3 * big, 0.38, dustCol, 0, 0.8, 0.7);
        }
      }
    }
    // A charge striking home all at once shakes the ground a little.
    if (hits >= 10) this.shake(Math.min(0.35, hits * 0.012), hx / hits, hz / hits);
  }

  hit(s, b) {
    s[STRUCK] = b.time;
    if (far(s.x, s.z, 110) || Math.random() > 0.35 + 0.65 * Q.rate) return;
    const y = (s.y ?? this.heightAt(s.x, s.z)) + (s.reg.T.mounted ? 2 : 1.25);
    const metal = ['mail', 'plate'].includes(s.reg.armour) || s.reg.T.mounted;
    if (metal) {
      for (let i = 0; i < 4; i++) this.glow.add(s.x, y, s.z, rnd(-3, 3), rnd(1.5, 4), rnd(-3, 3), rnd(0.18, 0.32), 0.07, 0.02, 1, COL.spark, 12, 1);
    } else {
      for (let i = 0; i < 2; i++) this.puffs.add(s.x, y, s.z, rnd(-0.6, 0.6), rnd(0.2, 0.8), rnd(-0.6, 0.6), 0.5, 0.12, 0.35, 0.5, COL.cloth, 0, 2);
    }
    if (Q.blood) for (let i = 0; i < 2; i++) this.bits.add(s.x, y - 0.2, s.z, rnd(-1.2, 1.2), rnd(0.5, 2), rnd(-1.2, 1.2), 0.45, 0.07, 0.05, 0.9, COL.blood, 10, 0);
  }

  // A man falls: a puff of dust where he lands (a horse throws up more).
  fall(s, dustCol) {
    if (far(s.x, s.z, 160)) return;
    const mounted = s.reg.T.mounted, n = Math.ceil((mounted ? 5 : 3) * Q.rate), big = mounted ? 1.6 : 1;
    const y = (s.y ?? this.heightAt(s.x, s.z)) + 0.2;
    for (let i = 0; i < n; i++) this.puffs.add(s.x + rnd(-0.5, 0.5), y, s.z + rnd(-0.5, 0.5), rnd(-0.8, 0.8), rnd(0.3, 0.8), rnd(-0.8, 0.8), rnd(0.9, 1.4), 0.3 * big, 1.2 * big, 0.45, dustCol, 0, 1.5, 0.6);
  }

  // Arrows trail a faint streak; one that lands in the ground throws up a little dirt.
  arrows(b) {
    const T = this.trails, d = this.dummy, z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
    const live = new Set(b.arrows);
    for (const a of this.lastArrows) {
      if (live.has(a) || a.t < a.T * 0.9) continue;
      if (far(a.x1, a.z1, 120) || Math.random() > Q.rate) continue;
      this.puffs.add(a.x1, this.heightAt(a.x1, a.z1) + 0.1, a.z1, rnd(-0.3, 0.3), rnd(0.5, 1), rnd(-0.3, 0.3), 0.6, 0.1, 0.45, 0.5, COL.mud, 1, 2);
    }
    this.lastArrows = b.arrows.slice();
    let n = 0;
    if (Q.trails) {
      const at = (a, k, out) => out.set(a.x0 + (a.x1 - a.x0) * k, a.y0 + (a.y1 - a.y0) * k + 4 * a.h * k * (1 - k), a.z0 + (a.z1 - a.z0) * k);
      const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
      for (const a of b.arrows) {
        if (n >= 1500) break;
        const k = a.t / a.T;
        at(a, k, p1);
        if (far(p1.x, p1.z, 150)) continue;
        at(a, Math.max(0, k - 0.12), p0);
        let len = p0.distanceTo(p1);
        if (len > 4.5) { p0.lerp(p1, 1 - 4.5 / len); len = 4.5; }   // a short streak, not a line across the sky
        if (len < 0.2) continue;
        dir.subVectors(p1, p0).normalize();
        d.position.addVectors(p0, p1).multiplyScalar(0.5);
        d.quaternion.setFromUnitVectors(z, dir);
        d.scale.set(a.javelin ? 0.08 : 0.04, a.javelin ? 0.08 : 0.04, len);
        d.updateMatrix();
        T.setMatrixAt(n++, d.matrix);
      }
    }
    T.count = n;
    T.instanceMatrix.needsUpdate = true;
  }

  // Engine stones that land: a burst of earth and stone, and the ground shakes near them.
  impacts(b) {
    const list = b.impacts || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (b.time - p.time > 1) break;    // the list only grows; the new ones are at the end
      if (this.seenImpacts.has(p)) continue;
      this.seenImpacts.add(p);
      const big = p.big ? 1.5 : 1, y = this.heightAt(p.x, p.z);
      this.shake(0.28 * big, p.x, p.z);
      if (far(p.x, p.z, 220)) continue;
      for (let i = 0; i < 10 * Q.rate + 3; i++) this.puffs.add(p.x + rnd(-1, 1), y + 0.5, p.z + rnd(-1, 1), rnd(-2.5, 2.5) * big, rnd(1, 3), rnd(-2.5, 2.5) * big, rnd(1.4, 2.4), 0.8 * big, 3 * big, 0.55, COL.dust, 0.6, 1.6, 0.8);
      for (let i = 0; i < 8 * Q.rate + 2; i++) { const s = rnd(0.15, 0.35); this.bits.add(p.x, y + 0.6, p.z, rnd(-5, 5), rnd(4, 9), rnd(-5, 5), rnd(1, 1.6), s, s, 1, COL.stone, 18, 0.2, 1, 0.3); }
    }
  }

  // A wall, tower or gate that breaks comes down in a cloud, and the ground shakes.
  wallsFall(b) {
    const W = b.walls;
    if (!W?.any || (this.wallTick = (this.wallTick || 0) + 1) % 4) return;   // every fourth frame is soon enough
    for (const s of W.structures()) {
      const was = this.walls.get(s);
      this.walls.set(s, s.state);
      if (was === undefined || was === s.state || (s.state !== 'broken' && s.state !== 'ruined')) continue;
      this.collapse(s.x, s.z, s.kind === 'tower' ? 1.4 : 1.1);
    }
  }

  collapse(x, z, big = 1) {
    this.shake(0.5 * big, x, z);
    if (far(x, z, 260)) return;
    const y = this.heightAt(x, z);
    for (let i = 0; i < 16 * Q.rate + 4; i++) this.puffs.add(x + rnd(-3, 3) * big, y + rnd(0.5, 4), z + rnd(-3, 3) * big, rnd(-2, 2), rnd(0.5, 2), rnd(-2, 2), rnd(2, 3.5), 1.2 * big, 4.5 * big, 0.6, COL.dust, 0.2, 1, 0.8);
    for (let i = 0; i < 12 * Q.rate + 3; i++) { const s = rnd(0.25, 0.6) * big; this.bits.add(x + rnd(-2, 2), y + rnd(2, 5), z + rnd(-2, 2), rnd(-4, 4), rnd(2, 6), rnd(-4, 4), rnd(1.2, 2), s, s, 1, Math.random() < 0.5 ? COL.stone : COL.wood, 16, 0.2, 1, 0.3); }
  }

  // A small bar of pips under each banner: four green when steady, down to one red when about to break;
  // a wavering banner dips, a routing one leans hard (its blinking is view.js's).
  morale(b, view) {
    const seen = new Set();
    for (const bn of view.banners || []) {
      const r = bn.r;
      if (!bn.sprite.visible) continue;
      seen.add(r);
      let s = this.pips.get(r);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, transparent: true }));
        s.scale.set(0.026, 0.0065, 1);
        s.center.set(0.5, 1.15);
        s.renderOrder = 10;
        this.scene.add(s);
        this.pips.set(r, s);
      }
      const f = Math.max(0, r.morale / (r.T.morale || 100));
      const n = r.routing ? 0 : pipsOf(f);
      s.visible = !r.routing && !r.T.engine;
      if (s.userData.n !== n && n) { s.userData.n = n; s.material.map = pipTexture(n); s.material.needsUpdate = true; }
      s.position.copy(bn.sprite.position);
      const lean = r.routing ? 0.55 : f < 0.45 ? (0.45 - f) * 0.6 * (0.8 + 0.2 * Math.sin(b.time * 3 + r.cx)) : 0;
      bn.sprite.material.rotation = r.side === 0 ? lean : -lean;
    }
    for (const [r, s] of this.pips) if (!seen.has(r)) s.visible = false;
  }

  // A regiment just selected gets a quick white ring under it.
  selectionPulse(selection) {
    if (!selection) return;
    for (const r of selection) if (!this.prevSel.has(r) && !r.gone) this.ring('select', r.cx, r.cz, this.width(r), { follow: r, life: 0.5, from: 0.6 });
    this.prevSel = new Set(selection);
  }

  width(r) {
    const f = Math.max(1, Math.min(r.files, r.alive));
    return Math.max(3, Math.min(14, (f - 1) / 2 * r.T.spacing + 2));
  }

  // ---- orders (from controls.js) ----

  // kind: move, attack, charge, wall. For a move the regiments' new destinations are already set.
  ordered(kind, regs, target = null) {
    for (const r of regs) {
      if (r.gone) continue;
      if (kind === 'move' && r.dest) {
        this.ring('move', r.dest.x, r.dest.z, this.width(r), { life: 0.9, from: 1.4 });
        this.ring('move', r.dest.x, r.dest.z, this.width(r) * 0.6, { life: 0.7, from: 0.2, delay: 0.12 });
        this.path(r, r.dest.x, r.dest.z, MARK.move);
      } else if (kind === 'charge') {
        this.ring('charge', r.cx, r.cz, this.width(r), { follow: r, life: 0.6, from: 0.5 });
      } else if (kind === 'wall' && target) {
        this.path(r, target.x, target.z, MARK.wall);
      }
    }
    if (kind === 'attack' && target) {
      this.ring('attack', target.cx, target.cz, this.width(target) * 1.1, { follow: target, life: 1, from: 1.6 });
      for (const r of regs) if (!r.gone) this.path(r, target.cx, target.cz, MARK.attack, target);
    }
    if (kind === 'wall' && target) this.ring('wall', target.x, target.z, 4, { life: 0.9, from: 1.6 });
    // One acknowledgement per order, heard from where the men are going.
    const live = regs.filter(r => !r.gone);
    if (!live.length) return;
    const at = kind === 'attack' && target ? { x: target.cx, z: target.cz } : kind === 'wall' && target ? target
      : kind === 'move' ? { x: live.reduce((n, r) => n + (r.dest?.x ?? r.cx), 0) / live.length, z: live.reduce((n, r) => n + (r.dest?.z ?? r.cz), 0) / live.length }
      : { x: live.reduce((n, r) => n + r.cx, 0) / live.length, z: live.reduce((n, r) => n + r.cz, 0) / live.length };
    audio.play(kind === 'charge' ? 'charge' : 'order', at, this.scope); // audio
  }

  // An expanding, fading ring flat on the ground. opts: follow (a regiment), life, from (start scale), delay.
  ring(kind, x, z, radius, { follow = null, life = 0.8, from = 1, delay = 0 } = {}) {
    let m = this.rings.find(o => !o.visible);
    if (!m) {
      if (this.rings.length >= 40) return;
      m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      m.renderOrder = 6;
      this.scene.add(m);
      this.rings.push(m);
    }
    m.material.color.set(MARK[kind] || kind);   // a kind of mark, or a colour of its own
    m.userData = { x, z, radius, follow, life, from, age: -delay };
    m.visible = true;
    m.material.opacity = 0;
  }

  // Arrowheads flowing from a regiment to where it is going, fading out; they follow the regiment (and its target).
  path(r, x, z, color, target = null) {
    if (this.paths.length >= 40) this.paths.shift();
    this.paths.push({ r, x, z, target, color: new THREE.Color(color), age: 0, life: 1.8 });
  }

  stepMarkers(dt) {
    const H = this.heightAt;
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData;
      u.age += dt;
      if (u.age < 0) continue;
      const t = u.age / u.life;
      if (t >= 1 || u.follow?.gone) { m.visible = false; continue; }
      const x = u.follow ? u.follow.cx : u.x, z = u.follow ? u.follow.cz : u.z;
      m.position.set(x, H(x, z) + 0.4, z);
      m.scale.setScalar(u.radius * (u.from + (1 - u.from) * (1 - (1 - t) ** 3)));
      m.material.opacity = 0.9 * Math.min(1, t * 6) * (1 - t);
    }
    const C = this.chev, d = this.dummy;
    let n = 0;
    this.paths = this.paths.filter(u => (u.age += dt) < u.life && !u.r.gone && !(u.target && u.target.gone));
    for (const u of this.paths) {
      const t = u.age / u.life;
      const x0 = u.r.cx, z0 = u.r.cz, x1 = u.target ? u.target.cx : u.x, z1 = u.target ? u.target.cz : u.z;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 6) continue;
      const yaw = Math.atan2(x1 - x0, z1 - z0), step = Math.max(3.5, len / 16), flow = (u.age * 6) % step;
      for (let k = step * 0.6 + flow; k < len - step * 0.4 && n < 400; k += step) {
        const x = x0 + (x1 - x0) * k / len, z = z0 + (z1 - z0) * k / len;
        d.position.set(x, H(x, z) + 0.5, z);
        d.rotation.set(0, yaw, 0);
        d.scale.setScalar(Math.min(3.2, 1.6 + len / 90));
        d.updateMatrix();
        C.setMatrixAt(n, d.matrix);
        C.setColorAt(n, u.color);
        this.chevAlpha.array[n++] = 0.85 * Math.min(1, t * 8) * (1 - t * t) * Math.min(1, (k / len) * 4);
      }
    }
    C.count = n;
    C.instanceMatrix.needsUpdate = true;
    if (C.instanceColor) C.instanceColor.needsUpdate = true;
    this.chevAlpha.needsUpdate = true;
  }

  // ---- camera shake ----

  // power 0–1 at the spot; it fades with distance from the camera's view and adds up to a cap.
  shake(power, x, z) {
    const c = camPos();
    if (!c) return;
    const d = Math.hypot(x - c.x, z - c.z);
    const k = Math.max(0, 1 - d / 260);
    this.trauma = Math.min(1, this.trauma + power * k * k * Q.shake);
  }

  applyShake(dt) {
    if (this.trauma <= 0.001) { this.trauma = 0; return; }
    const cam = LOD.camera;
    if (!cam) return;
    const t = this.real / 1000, a = this.trauma * this.trauma * 0.5;
    cam.position.x += Math.sin(t * 61) * a;
    cam.position.y += Math.sin(t * 47 + 1.3) * a * 0.8;
    cam.position.z += Math.sin(t * 53 + 2.1) * a;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
  }

  // ---- the world map (from worldview.js) ----

  // Smoke over places under attack or siege, dust where armies meet, a plume in the new owner's colour
  // when a place changes hands, dust where a battle's cairn is raised, and a ring where you send an army.
  // Nothing here flickers or glows: the map is read alongside panels, so it only drifts and fades.
  world(w, colourOf) {
    const dt = this.tick(w.time);
    const first = !this.worldSeen;
    this.worldSeen = true;
    this.owners ??= new Map();
    this.cairnsSeen ??= new WeakSet();
    this.armyDest ??= new WeakMap();
    const H = this.heightAt;
    const besieged = new Set();
    this.warSmoke = [];
    for (const a of w.armies) {
      if (a.gone || a.wagon) continue;
      if (a.siege) besieged.add(a.siege.p);
      if (a.at && a.at.owner !== a.side && (a.mode === 'siege' || a.mode === 'raid')) besieged.add(a.at.id);
      // Your army sent somewhere: a ring where it is going.
      const end = a.path?.length ? a.path[a.path.length - 1] : null;
      const was = this.armyDest.get(a);
      this.armyDest.set(a, end);
      if (!first && a.side === 0 && end && end !== was && (!was || Math.hypot(end.x - was.x, end.z - was.z) > 1)) this.ring('move', end.x, end.z, 26, { life: 1.1, from: 1.6 });
    }
    for (const p of w.pois) {
      const shown = p.visible ? p.owner : p.seen ? p.known?.owner : undefined;
      const was = this.owners.get(p);
      this.owners.set(p, shown);
      const y = H(p.x, p.z);
      if (!first && was !== undefined && shown !== undefined && was !== shown) {
        const colour = new THREE.Color(colourOf(shown)).lerp(COL.white, 0.45);   // a pale tint of their colour
        this.ring(colourOf(shown), p.x, p.z, 60, { life: 2, from: 0.2 });
        for (let i = 0; i < 14 * Q.rate + 4; i++) this.puffs.add(p.x + rnd(-10, 10), y + rnd(10, 20), p.z + rnd(-10, 10), rnd(-2, 2), rnd(4, 7), rnd(-2, 2), rnd(3, 4.5), 3, 10, 0.4, colour, 0, 0.5, 1, 1.4);
      }
      const fighting = p.visible && (p.town?.underAttack || besieged.has(p.id));
      if (fighting) this.warSmoke.push({ x: p.x, z: p.z });   // for audio.js
      if (dt <= 0 || far(p.x, p.z, 1100)) continue;
      // Battle smoke: a dark column over a place being stormed, raided or starved.
      if (fighting) {
        if (Math.random() < dt * 5 * Q.rate + dt) {
          this.puffs.add(p.x + rnd(-14, 14), y + rnd(8, 18), p.z + rnd(-14, 14), rnd(1, 3), rnd(5, 9), rnd(-1, 1), rnd(6, 9), 4, 16, 0.6, COL.warsmoke, -0.3, 0.1, 1, 1.3);
        }
      }
    }
    // Armies met in the field: dust rising between them while you choose.
    const enc = w.encounter;
    if (enc && dt > 0) {
      const at = enc.poi && enc.kind === 'assault' ? enc.poi : enc.enemy ? { x: (enc.army.x + enc.enemy.x) / 2, z: (enc.army.z + enc.enemy.z) / 2 } : enc.army;
      if (at && !far(at.x, at.z, 1100)) {
        const y = H(at.x, at.z);
        if (Math.random() < dt * 6 * Q.rate + dt) this.puffs.add(at.x + rnd(-12, 12), y + 2, at.z + rnd(-12, 12), rnd(-2, 2), rnd(2, 4), rnd(-2, 2), rnd(3, 5), 3, 11, 0.5, COL.dust, 0, 0.6, 0.8);
      }
    }
    // A cairn newly raised where a field battle was fought.
    for (const c of w.cairns || []) {
      if (this.cairnsSeen.has(c)) continue;
      this.cairnsSeen.add(c);
      if (first) continue;
      this.dustRing(c.x, H(c.x, c.z), c.z, 14, 4);
      this.ring('#d8d0c0', c.x, c.z, 40, { life: 1.6, from: 0.2 });
    }
  }

  // ---- the village (from townview.js) ----

  // meshes: TownView's map of building → { mesh }, to find each building's height.
  town(town, meshes) {
    const first = !this.townSeen;
    this.townSeen = true;
    const dt = this.townClock == null ? 0 : Math.max(0, Math.min(0.5, town.time - this.townClock));
    this.townClock = town.time;
    const d = this.dummy;
    let np = 0;
    this.fires = [];
    for (const b of town.buildings) {
      if (b.removed) continue;
      const o = meshes.get(b);
      if (!o) continue;
      const g = o.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const top = g.boundingBox.max.y, R = b.B.radius || 4, y = this.heightAt(b.x, b.z);
      let m = this.sites.get(b);
      if (!m) {
        this.sites.set(b, m = { state: b.state, ruinedAt: b.state === 'ruined' ? town.time - 999 : null, stage: Math.floor((b.progress || 0) * 3) });
        if (!first && b.state === 'site') this.dustRing(b.x, y, b.z, R, 0.8);
      }
      if (m.state !== b.state) {
        if (b.state === 'active' && m.state === 'site') { this.dustRing(b.x, y, b.z, R, 1.2); this.ring('built', b.x, b.z, R + 2, { life: 1.1, from: 0.5 }); }
        if (b.state === 'ruined') { m.ruinedAt = town.time; this.collapse(b.x, b.z, Math.min(1.6, R / 4)); }
        m.state = b.state;
      }
      const near = !far(b.x, b.z, 200);
      // A third of the work done, then two thirds: a puff of dust and a sound for each stage.
      if (b.state === 'site') {
        const stage = Math.floor((b.progress || 0) * 3);
        if (stage > m.stage && stage < 3) {
          if (near) this.dustRing(b.x, y, b.z, R * 0.8, 0.6);
          audio.play('stage', b, town.battle); // audio
        }
        m.stage = stage;
      }
      // A site: a scaffold of poles and rails rising with the work, and dust while men build.
      if (b.state === 'site' && np < 780) {
        const h = Math.max(1.2, top * Math.min(1, b.progress + 0.25)) + 0.6, c = R * 0.72;
        const sin = Math.sin(b.angle || 0), cos = Math.cos(b.angle || 0);
        const corner = (lx, lz) => [b.x + cos * lx + sin * lz, b.z - sin * lx + cos * lz];
        for (const [lx, lz] of [[-c, -c], [c, -c], [c, c], [-c, c]]) {
          const [x, z] = corner(lx, lz);
          d.position.set(x, y + h / 2, z); d.rotation.set(0, b.angle || 0, 0); d.scale.set(0.16, h, 0.16); d.updateMatrix();
          this.poles.setMatrixAt(np++, d.matrix);
        }
        for (const ry of [0.45, 0.9]) {
          const hy = y + Math.max(0.8, top * Math.min(1, b.progress + 0.25) * ry);
          for (let s = 0; s < 4; s++) {
            const a = (b.angle || 0) + s * Math.PI / 2, [x, z] = corner(Math.sin(s * Math.PI / 2) * c, Math.cos(s * Math.PI / 2) * c);
            d.position.set(x, hy, z); d.rotation.set(0, a, 0); d.scale.set(c * 2, 0.12, 0.12); d.updateMatrix();
            this.poles.setMatrixAt(np++, d.matrix);
          }
        }
        if (near && b.builders?.length && Math.random() < dt * 1.5 * Q.rate) {
          const a = Math.random() * Math.PI * 2;
          this.puffs.add(b.x + Math.sin(a) * R * 0.8, y + 0.3, b.z + Math.cos(a) * R * 0.8, rnd(-0.4, 0.4), rnd(0.3, 0.8), rnd(-0.4, 0.4), 1.3, 0.3, 1.2, 0.4, COL.dust, 0, 0.8, 0.7);
        }
      }
      // What is burning, for audio.js (near or far, paused or not).
      const hurt = b.state === 'active' && b.B.hp ? 1 - b.hp / b.B.hp : 0, burnt = b.state === 'ruined' && m.ruinedAt != null ? town.time - m.ruinedAt : 99;
      if (hurt > 0.3) this.fires.push({ x: b.x, z: b.z, level: hurt });
      else if (burnt < 25) this.fires.push({ x: b.x, z: b.z, level: 1 - burnt / 25 });
      if (!near || dt <= 0) continue;
      const roof = y + top * 0.95;
      // Damage: smoke from a hurt building, fire once it is badly hurt.
      if (b.state === 'active' && b.B.hp && b.hp < b.B.hp) {
        const dmg = 1 - b.hp / b.B.hp;
        if (Math.random() < dt * 4 * dmg * Q.rate) this.smoke(b.x + rnd(-R, R) * 0.4, roof, b.z + rnd(-R, R) * 0.4, COL.smoke, 1.2);
        if (dmg > 0.3) this.flames(b.x, roof - top * 0.3, b.z, R * 0.5, dt * 10 * dmg);
      }
      // A ruin smoulders for a minute and a half.
      if (b.state === 'ruined' && m.ruinedAt != null) {
        const age = town.time - m.ruinedAt;
        if (age < 90 && Math.random() < dt * 2.5 * (1 - age / 90) * Q.rate) this.smoke(b.x + rnd(-R, R) * 0.4, y + 1, b.z + rnd(-R, R) * 0.4, COL.soot, 1.4);
        if (age < 25) this.flames(b.x, y + 0.6, b.z, R * 0.5, dt * 6 * (1 - age / 25));
      }
      // Chimney smoke from homes and hearths.
      if (Q.chimneys && b.state === 'active' && CHIMNEYS.has(b.kind) && !far(b.x, b.z, 170) && Math.random() < dt * 2.2) {
        this.smoke(b.x + rnd(-0.6, 0.6), roof, b.z + rnd(-0.6, 0.6), COL.chimney, 0.8);
      }
    }
    this.poles.count = np;
    this.poles.instanceMatrix.needsUpdate = true;
  }

  dustRing(x, y, z, R, big = 1) {
    const n = Math.ceil((10 + R) * Q.rate) + 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      this.puffs.add(x + Math.sin(a) * R, y + 0.4, z + Math.cos(a) * R, Math.sin(a) * 1.6, rnd(0.3, 1), Math.cos(a) * 1.6, rnd(1.2, 2), 0.6 * big, 2.2 * big, 0.5, COL.dust, 0, 1.2, 0.7);
    }
  }

  smoke(x, y, z, color, big = 1) {
    this.puffs.add(x, y, z, rnd(0.2, 0.6), rnd(0.9, 1.5), rnd(-0.2, 0.2), rnd(4, 6) * big, 0.4 * big, 2.4 * big, color === COL.chimney ? 0.62 : 0.6, color, -0.05, 0.15, 1, 1.4);
  }

  // `count` flames on average this frame, licking up over a patch of radius R.
  flames(x, y, z, R, count) {
    let n = Math.floor(count) + (Math.random() < count % 1 ? 1 : 0);
    while (n-- > 0) {
      this.glow.add(x + rnd(-R, R), y + rnd(0, 1), z + rnd(-R, R), rnd(-0.3, 0.3), rnd(1.5, 3), rnd(-0.3, 0.3), rnd(0.4, 0.8), rnd(0.8, 1.4), 0.15, 0.9, Math.random() < 0.3 ? COL.ember : COL.flame, -1, 0.5, 1.8);
    }
  }
}
