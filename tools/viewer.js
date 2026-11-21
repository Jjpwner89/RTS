// RTS viewer: what the game draws, outside the game. It imports the game's own code (models.js unitLook, the clips
// in anim.js and the battle view's soldierClip, TownView's and SiegeView's building drawing, places.js's layouts), so it
// shows exactly what a battle or a village shows. Read-only: it changes no game code and never writes saves or settings (audio.js,
// pulled in through the economy, reads its sound settings once and plays nothing here).
//   ?tab=clips|buildings|places &unit=spear &armour=plate &shield=0 &clip=Walk &move=1.6 &dark=1 &seed=1 &place=0
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { unitLook, unitModel, hasLevels, buildingModel, ARMOUR_LEVELS, HAS_SHIELD, HOUSE_STYLES } from '../src/models.js';
import { keepModel, castleModel, fortModel, SIDE_COLORS } from '../src/view.js';
import { TownView } from '../src/townview.js';
import { SiegeView } from '../src/siegeview.js';
import { BUILDINGS, UPGRADES } from '../src/economy.js';

const $ = id => document.getElementById(id), q = new URLSearchParams(location.search);
const note = text => { $('note').textContent = text; };

// ============================================================ the stage

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
$('stage').appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
$('stage').appendChild(labels.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = 1.52;
scene.add(new THREE.HemisphereLight('#fff8e8', '#6b6250', 1.5));
const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
// keep the sun's shadow box on what the tab shows
function aimSun(centre, span) {
  sun.target.position.copy(centre);
  sun.position.copy(centre).add(new THREE.Vector3(-0.5, 1, 0.6).multiplyScalar(span * 1.5));
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: span * 4 });
  sun.shadow.camera.updateProjectionMatrix();
}

// The ground: a plane with a metre grid (lines every 1 m, stronger every 5 m) that can scroll under a walking figure,
// so a foot that slides against it shows.
const GROUND = { light: { sky: '#cdd8de', ground: '#cfc8b2', fine: '#bdb49a', bold: '#9f9578' }, dark: { sky: '#20242a', ground: '#3a3d36', fine: '#5c6157', bold: '#828878' } };
const groundMat = new THREE.ShaderMaterial({
  uniforms: { base: { value: new THREE.Color() }, fine: { value: new THREE.Color() }, bold: { value: new THREE.Color() }, shift: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vXZ; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform vec3 base, fine, bold; uniform vec2 shift; varying vec2 vXZ;
    float line(vec2 p, float k){ vec2 g = abs(fract(p / k - 0.5) - 0.5) / fwidth(p / k); return 1.0 - min(min(g.x, g.y), 1.0); }
    // (each grid fades out where its lines would crowd closer than a few pixels, so the far ground doesn't shimmer)
    float fade(vec2 p, float k){ vec2 w = fwidth(p / k); return 1.0 - smoothstep(0.08, 0.3, max(w.x, w.y)); }
    void main(){ vec2 p = vXZ + shift; vec3 c = mix(base, fine, line(p, 1.0) * 0.8 * fade(p, 1.0)); c = mix(c, bold, line(p, 5.0) * fade(p, 5.0)); gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), groundMat);
scene.add(ground);
// the shadows fall on a second, see-through plane just over the grid
const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.28 }));
shade.position.y = 0.002; shade.receiveShadow = true;
scene.add(shade);
function setGround(dark) {
  const G = GROUND[dark ? 'dark' : 'light'];
  scene.background = new THREE.Color(G.sky);
  groundMat.uniforms.base.value.set(G.ground); groundMat.uniforms.fine.value.set(G.fine); groundMat.uniforms.bold.value.set(G.bold);
  document.querySelectorAll('.lab').forEach(l => l.style.opacity = dark ? 0.92 : 1);
}
function sizeGround(centre, size) {
  for (const m of [ground, shade]) { m.scale.set(size, 1, size); m.position.x = centre.x; m.position.z = centre.z; }
}
$('dark').checked = q.get('dark') === '1';
$('dark').onchange = () => setGround($('dark').checked);
setGround($('dark').checked);

const label = (text, cls = '') => { const d = document.createElement('div'); d.className = 'lab ' + cls; d.textContent = text; return new CSS2DObject(d); };

// ============================================================ tabs

const TABS = {};
let current = null;
async function show(name) {
  if (current) { TABS[current].root.visible = false; TABS[current].leave?.(); }
  current = name;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === name);
  for (const k of Object.keys(TABS)) $('bar-' + k).hidden = k !== name;
  const T = TABS[name];
  if (!T.built) { note('Building…'); await T.build(); T.built = true; }
  T.root.visible = true;
  T.enter();
}
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => !b.disabled && show(b.dataset.tab);

// ============================================================ clips on units

// The clips come from anim.js; until that lands, the tab says so rather than drawing nothing.
let A = null, gaitOf = null, table = null;
try {
  A = await import('../src/anim.js');
  if (!A.animReady()) throw new Error('assets/anim.json or anim.bin did not load');
  table = await (await fetch(new URL('../assets/anim.json', import.meta.url))).json();
} catch (e) {
  console.warn('Viewer: no soldier clips (src/anim.js and assets/anim.*); the Clips tab shows the units standing.', e);
  A = null;
}
try { gaitOf = (await import('../src/view.js')).soldierClip || null; } catch { gaitOf = null; }
if (A && !gaitOf) console.warn('Viewer: src/view.js does not export soldierClip, so the game-gait choice is off; pick clips by name.');

const UNITS = ['spear', 'sword', 'archer', 'crossbow', 'cav', 'lightcav', 'maa', 'knight', 'captain', 'militia', 'folk', 'javelin', 'axeman', 'bandit', 'wardog', 'villager', 'lord', 'lady'];
const clips = { root: new THREE.Group(), mesh: [], t: 0, playing: true, last: performance.now() };
TABS.clips = clips;
scene.add(clips.root);

clips.build = async () => {
  for (const k of UNITS) if (unitModel(k)) $('unit').add(new Option(k, k));
  for (const l of ARMOUR_LEVELS) $('armour').add(new Option(l, l));
  $('unit').value = q.get('unit') || 'spear';
  $('armour').value = q.get('armour') || 'plate';
  $('shield').checked = q.get('shield') !== '0';
  $('move').value = q.get('move') || 0;
  for (const id of ['unit', 'armour', 'shield', 'light']) $(id).onchange = () => { clips.figure(); };
  $('clip').onchange = () => { clips.t = 0; clips.sync(); };
  $('play').onclick = () => { clips.playing = !clips.playing; $('play').textContent = clips.playing ? 'Pause' : 'Play'; };
  $('scrub').oninput = () => { clips.playing = false; $('play').textContent = 'Play'; clips.t = +$('scrub').value * (clips.clip()?.duration || 1); };
  for (const id of ['rate', 'move']) $(id).oninput = () => clips.sync();
  clips.figure();
};

// The look the game puts together for this unit, armour and shield.
clips.look = () => {
  const key = $('unit').value, levels = hasLevels(key);
  $('armour').disabled = !levels; $('shield').disabled = !levels || !HAS_SHIELD[key];
  return levels ? unitLook(key, { armour: $('armour').value, shield: $('shield').checked }) : unitModel(key);
};
clips.figure = () => {
  for (const m of clips.mesh) clips.root.remove(m);
  clips.mesh = [];
  const look = clips.look(), light = $('light').checked;
  clips.info = look?.anim || null;
  if (!look) { note(`${$('unit').value}: no baked model (the game draws a code shape)`); return; }
  const base = { gear: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), cloth: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: SIDE_COLORS[0] }) };
  for (const part of ['gear', 'cloth']) {
    const geo = look[light ? part + 'Light' : part];
    if (!geo) continue;
    // one instance of the game's animated mesh, or the posed model when there are no clips
    const animated = A && clips.info && geo.attributes.bind;
    const m = animated ? new THREE.InstancedMesh(A.animGeometry(geo, 1), A.animMaterial(base[part], { light }), 1) : new THREE.Mesh(geo, base[part]);
    if (animated) { m.setMatrixAt(0, new THREE.Matrix4()); m.customDepthMaterial = A.animDepthMaterial(light); m.frustumCulled = false; }
    m.castShadow = true;
    clips.root.add(m); clips.mesh.push(m);
  }
  // the clip list: the game's own choice first, then every clip of this skeleton
  const was = $('clip').value || q.get('clip'), sel = $('clip');
  sel.innerHTML = '';
  if (A && clips.info) {
    if (gaitOf) sel.add(new Option('Game gait (from move speed)', ''));
    for (const n of Object.keys(table.clips[clips.info.rig] || {}).sort()) sel.add(new Option(n, n));
    sel.value = [...sel.options].some(o => o.value === was) ? was : sel.options[0].value;
  } else sel.add(new Option(A ? 'posed (this model has no skeleton)' : 'posed (no clips loaded)', ''));
  sel.disabled = !A || !clips.info;
  clips.sync();
  const mounted = !!clips.info?.horse || /cav|knight|captain|lord|lady/.test($('unit').value);
  clips.frame(mounted);
};
clips.frame = mounted => {
  const target = new THREE.Vector3(0, mounted ? 1.7 : 1, mounted ? 0.3 : 0);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(-2.6, 1, 3.4).multiplyScalar(mounted ? 1.7 : 1));
  sizeGround(new THREE.Vector3(), 60); aimSun(new THREE.Vector3(), mounted ? 4 : 2.5);
};
// The clip shown now: the one picked, or the game's gait for the move speed.
clips.clip = () => A && clips.info && $('clip').value ? A.clipOf(clips.info.rig, $('clip').value) : null;
clips.sync = () => {
  $('rateOut').textContent = (+$('rate').value).toFixed(2) + '×';
  $('moveOut').textContent = (+$('move').value).toFixed(1) + ' m/s';
  const c = clips.clip();
  $('scrub').disabled = !c;
  if (!A) note(`${$('unit').value}: the clips (src/anim.js, assets/anim.*) aren't on this build yet, so the unit stands in its baked pose.`);
};
// A stand-in soldier and battle for the game's soldierClip: alive, nobody near, nothing to shoot, moving at `v`.
const standIn = { s: { reg: { T: { reach: 1 }, side: 0 }, alive: true, target: null, climb: 0, v: 0 }, b: { time: 0, winner: null }, out: {} };
clips.enter = () => { clips.frame(!!clips.info?.horse); clips.sync(); };
clips.tick = dt => {
  const rate = +$('rate').value, v = +$('move').value;
  if (clips.playing) clips.t += dt * rate;
  // the ground moves under him at his speed, as if he walked over it
  groundMat.uniforms.shift.value.y += clips.playing ? dt * rate * v : 0;
  if (!A || !clips.info) return;
  let c, t, hc = null, ht = 0;
  if ($('clip').value) {
    c = clips.clip();
    t = c ? (c.loop ? clips.t % c.duration : Math.min(clips.t, c.duration)) : 0;
    if (c && clips.playing && !c.loop && clips.t > c.duration + 0.8) clips.t = 0;   // one-shots replay after a beat
    if (clips.info.horse) { const pace = /Gallop|Charge|Couch/.test($('clip').value) ? 'Gallop' : /Trot/.test($('clip').value) ? 'Trot' : /Fall/.test($('clip').value) ? 'Death' : 'Idle'; hc = A.clipOf('horse', pace); ht = clips.t; }
    if (c) $('scrub').value = t / c.duration;
    $('scrubOut').textContent = c ? `${t.toFixed(2)} / ${c.duration.toFixed(2)} s` : '';
  } else {
    // the game's own choice: the battle view's soldierClip on a stand-in moving at the slider's speed
    standIn.b.time += clips.playing ? dt * rate : 0;
    standIn.s.v = v;
    const k = gaitOf(standIn.s, standIn.b, clips.info, standIn.out);
    c = k.c; t = k.t; hc = k.hc; ht = k.ht;
    const name = c && Object.entries(table.clips[clips.info.rig]).find(([, x]) => x.start === c.start)?.[0];
    $('scrubOut').textContent = c ? `${name} ${c.loop ? (t % c.duration).toFixed(2) : Math.min(t, c.duration).toFixed(2)} s` : '';
  }
  for (const m of clips.mesh) {
    A.setClip(m.geometry, 0, c, t);
    if (clips.info.horse) A.setClip(m.geometry, 0, hc, ht, true);
    m.geometry.attributes.aAnim.needsUpdate = true;
    if (m.geometry.attributes.aAnimH) m.geometry.attributes.aAnimH.needsUpdate = true;
  }
  // how fast its planted feet cover ground at its own pace (anim.js gaitSpeed): the move speed it plays true at
  // (only for walking gaits; a rider's is his horse's)
  const nameOf = (rig, x) => x && Object.entries(table.clips[rig] || {}).find(([, y]) => y.start === x.start)?.[0];
  const [gr, gn] = clips.info.horse ? ['horse', nameOf('horse', hc)] : [clips.info.rig, c?.loop && nameOf(clips.info.rig, c)];
  const stride = A.gaitSpeed && /Walk|Run|March|Carry|Rout|Trot|Gallop/.test(gn || '') ? A.gaitSpeed(gr, gn) : NaN;
  note(`${$('unit').value} · ${clips.info.rig}${clips.info.horse ? ' on horse' : ''} · ${$('clip').value || 'game gait'}${stride > 0 ? ` · stride covers ${stride.toFixed(2)} m/s at 1×` : ''} · drag to orbit, scroll to zoom`);
};

// ============================================================ buildings

// Every building at every level it can reach, in the game's own drawing (TownView.geo, which falls back to the level
// below and then to a code shape), then the keep, castle and fort lines, then walls, towers and gates as a siege
// draws them (SiegeView.geo). A label in red marks a piece drawn as a code shape because it has no baked model.
const bld = { root: new THREE.Group(), spots: [], names: [] };
TABS.buildings = bld;
scene.add(bld.root);
const town = { geos: {}, cached: TownView.prototype.cached, geo: TownView.prototype.geo };
const siege = { geos: {}, geo: SiegeView.prototype.geo };
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

bld.build = async () => {
  const rows = [];
  // the village's buildings: houses in their three styles, then every other kind at levels 1 to 3
  rows.push({ title: 'Houses', items: Array.from({ length: HOUSE_STYLES }, (_, s) => ({ name: `House, style ${s + 1}`, geo: town.geo('house', s, 1), baked: !!buildingModel('house.' + s) })) });
  const kinds = Object.keys(BUILDINGS).filter(k => k !== 'house');
  for (const k of kinds) {
    const B = BUILDINGS[k], levels = B.hall || B.great ? 1 : UPGRADES.length - 1;
    const base = k === 'monastery' ? 'chapel' : k === 'cathedral' && !buildingModel('cathedral') ? 'monastery' : k;
    rows.push({ title: B.name, items: Array.from({ length: levels }, (_, i) => {
      const l = i + 1, own = buildingModel(l > 1 ? `${base}.${l}` : base), any = [...Array(l)].some((_, j) => buildingModel(j ? `${base}.${j + 1}` : base));
      return { name: `${B.name}${levels > 1 ? ' · level ' + l : ''}${l > 1 && !own && any ? ' (as level below)' : ''}`, geo: town.geo(k, 0, l), baked: any || !!buildingModel(k) };
    }) });
  }
  // the lord's seat
  rows.push({ title: 'Keep', items: [1, 2, 3, 4, 5].map(l => ({ name: `Keep · level ${l}`, geo: keepModel({ palisade: false, level: l }), baked: !!buildingModel('keep.' + l) })) });
  rows.push({ title: 'Castle', items: [1, 2, 3, 4].map(l => ({ name: `Castle · level ${l}`, geo: castleModel(l), baked: !!buildingModel('castle.' + l) })).concat([{ name: 'Fort', geo: fortModel(), baked: !!buildingModel('fort') }]) });
  // walls, towers and gates, standing and broken, in wood and stone
  for (const m of ['wood', 'stone']) {
    const W = m === 'wood' ? 'Wooden' : 'Stone';
    rows.push({ title: `${W} walls`, items: [
      ['wall', 'Wall'], ['wall', 'Wall, broken', '.broken'], ['tower', 'Tower'], ['tower', 'Tower, broken', '.broken'],
      ['gate', 'Gate', '', true], ['gate', 'Gate, broken', '.broken']].map(([p, n, end = '', door]) => {
      const name = `${p}.${m}${end}`, g = siege.geo(name);
      return { name: `${W} ${n.toLowerCase()}`, geo: g, door: door ? siege.geo(`gate.${m}.door`) : null, baked: !!buildingModel(name) };
    }) });
  }
  rows.push({ title: 'Siege engines and carts', items: ['siege.ram', 'siege.mangonel', 'siege.trebuchet', 'siege.tower', 'siege.ladder', 'wagon', 'wagon.trade', 'wagon.run']
    .map(n => ({ name: n, geo: buildingModel(n) || siege.geo(n), arm: buildingModel(n + '.arm'), baked: !!buildingModel(n) })) });

  // lay the rows out front to back, each row's pieces left to right with room between, the rows in a few columns
  // so the whole set is about as deep as it is wide
  const missing = [], gap = 4;
  for (const row of rows) {
    row.items = row.items.filter(it => { if (!it.geo) missing.push(it.name); return !!it.geo; });
    row.sizes = row.items.map(it => { it.geo.computeBoundingBox(); return it.geo.boundingBox.getSize(new THREE.Vector3()); });
    row.depth = Math.max(...row.sizes.map(s => s.z), 4);
    row.width = row.sizes.reduce((a, s) => a + s.x + gap, 0);
  }
  const colW = Math.max(...rows.map(r => r.width)) + 24, total = rows.reduce((a, r) => a + r.depth + 10, 0);
  const cols = Math.max(1, Math.round(Math.sqrt(total / colW))), perCol = total / cols;
  let z = 0, col = 0, widest = 0, deepest = 0;
  for (const row of rows) {
    if (z > 0 && z + row.depth / 2 > perCol && col < cols - 1) { col++; z = 0; }
    const items = row.items, sizes = row.sizes, depth = row.depth, x0 = col * colW;
    let x = x0;
    const head = label(row.title, 'head'); head.position.set(x0 - 6, 0.5, z + depth / 2); bld.root.add(head);
    items.forEach((it, i) => {
      const s = sizes[i], g = it.geo, b = g.boundingBox, c = b.getCenter(new THREE.Vector3());
      const hold = new THREE.Group();
      hold.position.set(x + s.x / 2 - c.x, -b.min.y, z + depth / 2 - c.z);
      const mesh = new THREE.Mesh(g, MAT); mesh.castShadow = mesh.receiveShadow = true; hold.add(mesh);
      for (const extra of [it.door, it.arm]) if (extra) { const e = new THREE.Mesh(extra, MAT); e.castShadow = true; hold.add(e); }
      bld.root.add(hold);
      const l = label(it.name + (it.baked ? '' : ' · code shape'), it.baked ? '' : 'flag');
      l.position.set(x + s.x / 2, Math.max(s.y, 2) + 1.2, z + depth / 2);
      bld.root.add(l); bld.names.push(l);
      bld.spots.push({ name: `${row.title}: ${it.name}`, at: new THREE.Vector3(x + s.x / 2, s.y / 2, z + depth / 2), size: Math.max(s.x, s.y, s.z) });
      x += s.x + gap;
    });
    widest = Math.max(widest, x);
    z += depth + 10;
    deepest = Math.max(deepest, z);
  }
  z = deepest;
  if (missing.length) console.warn('Viewer: nothing to draw for', missing);
  bld.centre = new THREE.Vector3(widest / 2, 0, z / 2);
  bld.span = Math.max(widest, z);
  bld.missing = missing;
  const sel = $('goto');
  sel.add(new Option('Everything', ''));
  bld.spots.forEach((s, i) => sel.add(new Option(s.name, i)));
  sel.onchange = () => bld.look(sel.value === '' ? null : bld.spots[+sel.value]);
};
// Row titles always show; each piece's name only from close enough to read it among its neighbours.
bld.tick = () => {
  const on = $('labels').checked, p = new THREE.Vector3();
  bld.root.traverse(o => { if (o.isCSS2DObject) o.visible = on && (!bld.names.includes(o) || o.getWorldPosition(p).distanceTo(camera.position) < 140); });
};
bld.look = spot => {
  if (!spot) {
    controls.target.copy(bld.centre);
    camera.position.copy(bld.centre).add(new THREE.Vector3(0, 0.8, 0.6).multiplyScalar(bld.span * 1.15));
  } else {
    controls.target.copy(spot.at);
    camera.position.copy(spot.at).add(new THREE.Vector3(-0.6, 0.45, 0.9).multiplyScalar(spot.size * 1.6 + 4));
  }
};
bld.enter = () => {
  sizeGround(bld.centre, bld.span * 2 + 80);
  aimSun(bld.centre, bld.span * 0.75);
  groundMat.uniforms.shift.value.set(0, 0);
  bld.look(null);
  note(`${bld.spots.length} pieces${bld.missing.length ? ` · nothing to draw for: ${bld.missing.join(', ')}` : ''} · red labels have no baked model · drag to orbit, right-drag to pan`);
};

// ============================================================ places

// Every kind of place at every wealth, wall and size the game makes, laid out by places.js exactly as you find it when
// you storm it: the world's own seeding (World.seedHolding), grown on the holdings' own rules (runEconomy), a town made
// on the place's own ground (World.makeTown), layPlace into it, and drawn with the game's ground, trees, TownView and
// SiegeView. Nothing here plans a building; the tally panel sets what the place's numbers ask for beside what was laid
// out and what stands in the town, and checkPlaces' problems in red.
const pl = { root: new THREE.Group(), specs: [], at: -1, names: [], checked: new Map() };
TABS.places = pl;
scene.add(pl.root);
let P = null;   // the game's world code, loaded with the tab
const SIZES = [['new', 0], ['15 min on', 15], ['an hour on', 60]];
const WEALTHS = ['poor', 'modest', 'wealthy'], WALLS = { none: 'no walls', wood: 'timber walls', stone: 'stone walls' };
// What the game makes: the realm's kinds, lords' seats on a village or a castle, Kingsbridge, the outlaws' camps, and
// the north (the host's places keep a rough economy, so their size is their people).
const KIND_LIST = [
  { kind: 'village', title: 'Village' }, { kind: 'mine', title: 'Mining village' }, { kind: 'ford', title: 'Ford' },
  { kind: 'monastery', title: 'Abbey' }, { kind: 'market', title: 'Market town' },
  { kind: 'village', seat: true, title: "Lord's seat (village)" }, { kind: 'castle', seat: true, title: "Lord's seat (castle)" },
  { kind: 'castle', title: 'Castle' }, { kind: 'crown', title: 'Kingsbridge' }, { kind: 'camp', title: 'Bandit camp' },
  { kind: 'pass', north: true, title: 'Mountain gate (north)' }, { kind: 'warcamp', north: true, title: 'War camp (north)' },
  { kind: 'village', north: true, title: 'Northern village' }, { kind: 'mine', north: true, title: 'Northern mining village' },
  { kind: 'castle', north: true, title: 'Northern hold' }, { kind: 'market', north: true, title: 'Northern market' },
];

// A bare place as the realm makes one, on seed `seed`, with `roads` roads out to its neighbours.
function bare(K, i, base) {
  const r = P.rng(base * 7 + i * 131), n = K.kind === 'crown' ? 5 : 2 + Math.floor(r() * 3), turn = r() * Math.PI * 2;
  const links = Array.from({ length: n }, (_, j) => { const a = turn + (j + (r() - 0.5) * 0.5) / n * Math.PI * 2; return { x: Math.sin(a) * 300, z: Math.cos(a) * 300 }; });
  const p = { id: 'v' + i, name: K.title, kind: K.kind, owner: K.north ? P.invader : null, x: 0, z: 0, links, seed: base + 1000 * (i + 1), garrison: [], town: null, seen: true, visible: false };
  if (K.seat) p.seat = 1;
  return p;
}
// The world's seeding for place p with its own rand on `k`: the same call a new campaign makes.
const seedWith = (p, k) => { P.World.prototype.seedHolding.call({ rand: P.rng(p.seed * 3 + k * 7919) }, p); return p.eco; };

// The list: for each kind, the first seeds that give each wealth and walls the game makes it with (a kind it never makes
// poor, or never walls, simply has no such entry), at each size.
pl.list = base => {
  const specs = [];
  KIND_LIST.forEach((K, ki) => {
    const probe = bare(K, ki, base), found = new Map();
    for (let k = 0; k < 300; k++) {
      const e = seedWith(probe, k), key = e.buildings ? `${e.wealth}:${e.walls}` : 'rough';
      if (!found.has(key)) found.set(key, k);
    }
    const sizes = found.has('rough') ? [['new', 0], ['grown full', -1]] : SIZES;
    for (const [key, k] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
      const [w, walls] = key.split(':');
      for (const [size, minutes] of sizes) {
        const what = key === 'rough' ? size : `${WEALTHS[w]}, ${WALLS[walls]}, ${size}`;
        specs.push({ K, ki, k, minutes, group: K.title, name: `${K.title} · ${what}` });
      }
    }
  });
  return specs;
};
// Place `spec` at seed `base`, seeded and grown.
pl.make = (spec, base) => {
  const p = bare(spec.K, spec.ki, base);
  seedWith(p, spec.k);
  if (p.eco.buildings) for (let t = 0; t < spec.minutes * 60; t += 5) P.runEconomy(p, 5);   // the holdings' clock: every 5 s
  else if (spec.minutes < 0) p.eco.pop = P.World.prototype.popCap.call({}, p);              // as many people as it holds
  return p;
};

pl.build = async () => {
  const [world, holdings, places, realm, noise, terrain, scenery] = await Promise.all(['../src/world/world.js', '../src/world/holdings.js',
    '../src/world/places.js', '../src/world/realm.js', '../src/noise.js', '../src/terrain.js', '../src/scenery.js'].map(u => import(u)));
  P = { ...world, ...holdings, ...places, ...realm, ...noise, ...terrain, ...scenery };
  // the north's places belong to its host, as when it comes over the wall (this page's own copy of the houses)
  if (!P.FACTIONS.some(h => h.invader)) P.FACTIONS.push({ ...P.INVADER, index: P.FACTIONS.length, gold: 0, arms: 0, alive: true });
  P.invader = P.FACTIONS.findIndex(h => h.invader);
  $('pseed').value = q.get('seed') || 1;
  $('pgoto').onchange = () => pl.show(+$('pgoto').value);
  $('pprev').onclick = () => pl.show((pl.at - 1 + pl.specs.length) % pl.specs.length);
  $('pnextp').onclick = () => pl.show((pl.at + 1) % pl.specs.length);
  $('pseed').onchange = () => pl.reseed(Math.max(1, Math.round(+$('pseed').value) || 1));
  $('pnext').onclick = () => pl.reseed(Math.max(1, Math.round(+$('pseed').value) || 1) + 1);
  $('ppanel').onchange = () => { $('panel').hidden = !$('ppanel').checked; };
  $('pnames').onchange = () => pl.tick();
  pl.reseed(+$('pseed').value, +(q.get('place') || 0));
};
pl.reseed = (base, at = pl.at < 0 ? 0 : pl.at) => {
  pl.base = base;
  $('pseed').value = base;
  const specs = pl.list(base);
  Object.assign(pl, { specs, checked: new Map() });
  const sel = $('pgoto');
  sel.innerHTML = '';
  let g = null;
  specs.forEach((s, i) => {
    if (!g || g.label !== s.group) { g = document.createElement('optgroup'); g.label = s.group; sel.append(g); }
    g.append(new Option(s.name.slice(s.group.length + 3), i));
  });
  pl.show(Math.min(at, specs.length - 1));
  pl.checkAll();
};
// What is wrong with place p's layout: checkPlaces, and for a place it leaves out (one without numbers of its own: the
// camps and the north, laid out from tallyOf's rough village) the same count of its tally against its layout.
pl.check = p => {
  const L = P.layoutOf(p), problems = P.checkPlaces({ pois: [p] });
  if (!p.eco?.buildings) {
    const have = {};
    for (const b of L.buildings) have[b.kind] = (have[b.kind] || 0) + 1;
    for (const [k, n] of Object.entries(P.tallyOf(p))) if ((have[k] || 0) < n) problems.push(`${p.name}: ${k} ${have[k] || 0} of ${n} laid out`);
    if (L.unplaced.length) problems.push(`${p.name}: no room for ${L.unplaced.join(', ')}`);
  }
  return { problems, unplaced: L.unplaced };
};
// The check on every place of the list, a few at a time, for the panel's list.
pl.checkAll = () => {
  const base = pl.base;
  let i = 0;
  const step = () => {
    if (pl.base !== base) return;
    const t0 = performance.now();
    while (i < pl.specs.length && performance.now() - t0 < 30) {
      if (!pl.checked.has(i)) pl.checked.set(i, pl.check(pl.make(pl.specs[i], base)));
      i++;
    }
    pl.panel();
    if (i < pl.specs.length) setTimeout(step, 0);
    else { const bad = [...pl.checked.values()].filter(c => c.problems.length).length; if (current === 'places') pl.status(bad); }
  };
  step();
};

// Clear what the last place drew (its ground, trees, buildings and walls are its own; the baked models are shared and
// come back on their next use).
pl.clear = () => {
  pl.root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [o.material].flat()) if (m) {
      m.map?.dispose();
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) u.value.dispose();   // the ground's painted land
      m.dispose?.();
    }
  });
  pl.root.clear();
  pl.names = [];
};
pl.show = i => {
  pl.at = i;
  $('pgoto').value = i;
  const spec = pl.specs[i], p = pl.make(spec, pl.base);
  pl.clear();
  // as World.storm lays a place out: a town on its own ground, layPlace for the side storming it, its keep as shown
  const t0 = performance.now();
  const town = P.World.prototype.makeTown.call({ bandits: null, rank: null, hooks: {}, time: 0 }, p, { kind: p.kind, villagers: 0, retinue: false, stock: {} });
  const walledR = P.layPlace(town, p, 1);
  town.keepLevel = town.keepLevel || P.keepLevelFor(p);
  town.hostile = { owner: p.owner, pop: p.eco.pop, eco: p.eco, color: P.ownerOf(p).color, name: P.ownerOf(p).name, where: p.name };
  town.flagColor = P.ownerOf(p).color;
  const ms = performance.now() - t0, L = P.layoutOf(p), { problems } = pl.check(p);
  pl.checked.set(i, { problems, unplaced: L.unplaced });
  // drawn as the game draws a village: its roads and lanes worn into the ground, trees, the town and its walls
  const g = pl.root, heightAt = p.heightAt;
  const roads = (p.roadAngles || []).map(a => ({ pts: [[0, 0], [Math.sin(a) * 400, Math.cos(a) * 400]], width: 6 })).concat(town.lanes || []);
  P.drawGround(g, heightAt, p.seed, { land: P.landMask(p.seed, { homes: [{ x: 0, z: 0 }], roads, wear: [{ x: 0, z: 0, r: 24 }] }) });
  P.drawTrees(g, heightAt, p.trees);
  const tv = new TownView(g, town, heightAt, P.rng(p.seed + 11));
  tv.update(null);
  for (const o of tv.meshes.values()) o.icon.visible = false;   // (the village's status icons are for running it)
  const sv = new SiegeView(g, town.battle, heightAt);
  sv.syncWalls();
  // names over the buildings, for reading the layout
  for (const b of town.buildings) {
    const l = label(`${b.B.name}${(b.level || 1) > 1 ? ' ' + b.level : ''}`);
    l.position.set(b.x, heightAt(b.x, b.z) + 7, b.z);
    g.add(l); pl.names.push(l);
  }
  const reach = Math.max(walledR, ...town.buildings.map(b => Math.hypot(b.x, b.z) + b.B.radius), 40);
  pl.view = { p, town, L, ms, problems, reach, h0: heightAt(0, 0), walls: town.battle.walls };
  pl.look();
  pl.panel();
  pl.tick();
  pl.status();
};
pl.look = () => {
  const { reach, h0 } = pl.view;
  // (the target a little to the right, so the place sits clear of the tally panel)
  const right = $('ppanel').checked ? reach * 0.35 : 0;
  controls.target.set(right * 0.85, h0, right * 0.5);
  camera.position.copy(controls.target).add(new THREE.Vector3(-0.45, 0.8, 0.75).multiplyScalar(reach * 1.85));
  aimSun(new THREE.Vector3(0, h0, 0), reach + 20);
};
pl.status = (bad = [...pl.checked.values()].filter(c => c.problems.length).length) => {
  const v = pl.view;
  note(`${pl.at + 1} of ${pl.specs.length} · ${v.town.buildings.length} buildings, ${v.walls.pieces.length} wall pieces · laid out and built in ${v.ms.toFixed(0)} ms`
    + ` · checked ${pl.checked.size} of ${pl.specs.length}${bad ? `, ${bad} with problems (red in the list)` : ', no problems'} · drag to orbit, right-drag to pan`);
};
pl.tick = () => {
  const on = $('pnames').checked, w = new THREE.Vector3();
  for (const l of pl.names) l.visible = on && l.getWorldPosition(w).distanceTo(camera.position) < 160;
};

// The panel: this place's numbers, its tally beside its layout and the town, what checkPlaces says, then every place.
pl.panel = () => {
  const v = pl.view;
  if (!v) return;
  const { p, town, L } = v, e = p.eco, want = P.tallyOf(p), laid = {}, built = {};
  for (const b of L.buildings) laid[b.kind] = (laid[b.kind] || 0) + 1;
  for (const b of town.buildings) if (b.state === 'active') built[b.kind] = (built[b.kind] || 0) + 1;
  const kinds = [...new Set([...Object.keys(want), ...Object.keys(laid), ...Object.keys(built)])].sort((a, b) => (want[b] || 0) - (want[a] || 0) || a.localeCompare(b));
  const W = v.walls, towers = W.nodes.filter(n => n.tower).length, gates = W.pieces.filter(q => q.gate).length;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const rows = kinds.map(k => {
    const bad = (laid[k] || 0) < (want[k] || 0) || (built[k] || 0) !== (laid[k] || 0);
    return `<tr class="${bad ? 'bad' : ''}"><td>${esc(BUILDINGS[k]?.name || k)}</td><td>${want[k] || 0}</td><td>${laid[k] || 0}</td><td>${built[k] || 0}</td></tr>`;
  }).join('');
  const total = o => Object.values(o).reduce((a, n) => a + n, 0);
  const all = pl.specs.map((s, i) => {
    const c = pl.checked.get(i), bad = c?.problems.length;
    return `<tr data-i="${i}" class="${bad ? 'bad' : ''}${i === pl.at ? ' on' : ''}"><td>${esc(s.name)}</td><td>${c ? (bad ? `${bad} problem${bad > 1 ? 's' : ''}` : 'ok') : '…'}</td></tr>`;
  }).join('');
  $('panel').innerHTML = `<h2>${esc(pl.specs[pl.at].name)}</h2>
    <div class="muted">seed ${p.seed} · ${p.links.length} roads in · ${e.buildings ? `${Math.round(e.pop)} people, level ${e.level}, ${WEALTHS[e.wealth]}, ${P.FOCUS_NAMES[e.focus]}, walls by its numbers: ${e.walls}` : `${Math.round(e.pop)} people (a rough economy: the tally is worked from its people)`}
    · keep level ${town.keepLevel} · ${W.pieces.length} wall pieces, ${towers} towers, ${gates} gates${W.pieces.length ? ` (${[...new Set(W.pieces.map(q => q.material))].join(', ')})` : ''}</div>
    <h3>Tally</h3><table><tr><th>building</th><th>its numbers</th><th>laid out</th><th>in the town</th></tr>${rows}
    <tr><th>all</th><th>${total(want)}</th><th>${total(laid)}</th><th>${total(built)}</th></tr></table>
    <h3>Problems${p.eco.buildings ? ' (checkPlaces)' : ' (its tally against its layout)'}</h3>${v.problems.length ? `<ul>${v.problems.map(x => `<li class="bad">${esc(x)}</li>`).join('')}</ul>` : '<div>No problems.</div>'}
    ${L.unplaced.length ? `<div class="bad">No room for: ${esc(L.unplaced.join(', '))}</div>` : ''}
    <h3>Every place at seed ${pl.base} (${pl.checked.size} of ${pl.specs.length} checked)</h3><table class="all">${all}</table>`;
  for (const tr of $('panel').querySelectorAll('tr[data-i]')) tr.onclick = () => pl.show(+tr.dataset.i);
};
pl.enter = () => {
  ground.visible = shade.visible = false;
  $('panel').hidden = !$('ppanel').checked;
  if (pl.view) { pl.look(); pl.status(); }
};
pl.leave = () => { ground.visible = shade.visible = true; $('panel').hidden = true; };

// ============================================================ run

function resize() {
  const w = innerWidth, h = innerHeight - $('stage').getBoundingClientRect().top;
  renderer.setSize(w, h); labels.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (current === 'clips') clips.tick(dt);
  if (current === 'buildings') bld.tick();
  if (current === 'places') pl.tick();
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
await show(q.get('tab') in TABS ? q.get('tab') : 'clips');
resize();
window.viewer = { show, clips, bld, pl, camera, controls, scene };
