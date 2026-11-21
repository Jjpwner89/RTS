// Soldier inspector: shows the baked soldiers from a models.glb exactly as the game puts them together
// (src/models.js unitLook: body with weapons + one armour level + shield), in four fixed views, with
// close-ups on the hands and head. Read-only; touches no game state.
//   ?unit=sword&armour=plate&shield=0&focus=hands&light=1&file=/tmp-out/models.glb
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LEVELS = ['none', 'leather', 'mail', 'plate'];
const q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setScissorTest(true);
$('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e3dfd1');
scene.add(new THREE.HemisphereLight('#fff8e8', '#6b6250', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(3, 6, 4); scene.add(sun);
const grid = new THREE.GridHelper(6, 24, '#b9b29c', '#cfc9b4'); scene.add(grid);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
// front, right side, left side, three-quarter right (the model faces +z, its right hand at -x)
const VIEWS = [['Front', [0, 0, 1]], ['Right side', [-1, 0, 0]], ['Left side', [1, 0, 0]], ['Three-quarter right', [-0.7, 0.35, 0.7]]];
const labels = VIEWS.map(([name]) => { const d = document.createElement('div'); d.className = 'label'; d.textContent = name; $('stage').appendChild(d); return d; });

let geos = {}, holder = new THREE.Group(), bounds = new THREE.Box3();
scene.add(holder);
const get = name => geos[name.replace(/[[\].:/]/g, '')] || null;
const keys = () => [...new Set(Object.keys(geos).filter(n => n.startsWith('unit')).map(n => n.match(/^unit([a-z]+?)(base|none|leather|mail|plate|shield)?(gear|cloth)/)?.[1]).filter(Boolean))].sort();

async function load(file) {
  const gltf = await new GLTFLoader().loadAsync(file);
  geos = {};
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const c = o.geometry.attributes.color;
    if (c && !(c.array instanceof Float32Array)) {
      const f = new Float32Array(c.count * 3);
      for (let i = 0; i < c.count; i++) { f[i * 3] = c.getX(i); f[i * 3 + 1] = c.getY(i); f[i * 3 + 2] = c.getZ(i); }
      o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(f, 3));
    }
    o.geometry.computeVertexNormals();
    geos[o.name] = o.geometry;
  });
  const sel = $('unit'), was = sel.value || q.get('unit');
  sel.innerHTML = '';
  for (const k of keys()) sel.add(new Option(k, k));
  if (was && keys().includes(was)) sel.value = was;
}

// The same assembly as src/models.js unitLook.
function look() {
  const key = $('unit').value, light = $('light').checked, levelled = !!get(`unit.${key}.base.gear`);
  $('armour').disabled = !levelled;
  const pieces = levelled ? ['base', $('armour').value, ...($('shield').checked ? ['shield'] : [])] : [null];
  const join = part => {
    const list = pieces.map(p => { const n = p ? `unit.${key}.${p}.${part}` : `unit.${key}.${part}`; return (light && get(n + '.light')) || get(n); }).filter(Boolean);
    return list.length ? (list.length === 1 ? list[0] : mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g))) : null;
  };
  return { gear: join('gear'), cloth: join('cloth') };
}

function build() {
  holder.clear();
  const { gear, cloth } = look();
  if (gear) holder.add(new THREE.Mesh(gear, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  if (cloth) holder.add(new THREE.Mesh(cloth, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: $('team').value })));
  bounds = new THREE.Box3().setFromObject(holder);
  $('info').textContent = `${$('unit').value} · ${[gear, cloth].filter(Boolean).reduce((n, g) => n + (g.index ? g.index.count : g.attributes.position.count) / 3, 0).toFixed(0)} triangles · ${$('file').value}`;
  draw();
}

// What each close-up frames, in model space: centre and half-height.
function frame() {
  const b = bounds.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.9, 0.5)) : bounds;
  const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), f = $('focus').value;
  if (f === 'head') {
    // the head is the top of the figure's middle column (weapons are held off to the sides); riders sit higher
    const p = new THREE.Vector3(), mounted = size.z > 1.2, [lo, hi] = mounted ? [2, 2.9] : [1.3, 2], head = new THREE.Box3();
    holder.traverse(m => { if (!m.isMesh) return; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i); if (Math.abs(p.x) < 0.12 && p.y > lo && p.y < hi) head.expandByPoint(p); } });
    if (!head.isEmpty()) return { c: new THREE.Vector3(0, head.max.y - 0.16, head.getCenter(p).z), h: 0.3 };
  }
  if (f === 'hands') return { c: new THREE.Vector3(0, 1.05, 0.15), h: 0.62 };
  return { c, h: Math.max(size.y, size.x * 0.8) * 0.58 };
}

function draw() {
  const w = innerWidth, h = innerHeight - $('stage').offsetTop;
  renderer.setSize(w, h);
  const cw = w / 2, ch = h / 2, { c, h: half } = frame();
  VIEWS.forEach(([, dir], i) => {
    const x = (i % 2) * cw, y = i < 2 ? ch : 0;
    renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
    camera.aspect = cw / ch;
    const dist = half / Math.tan(camera.fov * Math.PI / 360) * 1.15;
    camera.position.copy(c).addScaledVector(new THREE.Vector3(...dir).normalize(), dist);
    camera.lookAt(c); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    Object.assign(labels[i].style, { left: x + 8 + 'px', top: (h - y - ch) + 6 + 'px' });
  });
}

for (const l of LEVELS) $('armour').add(new Option(l, l));
$('armour').value = q.get('armour') || 'plate';
$('shield').checked = q.get('shield') !== '0';
$('light').checked = q.get('light') === '1';
if (q.get('focus')) $('focus').value = q.get('focus');
if (q.get('file')) $('file').add(new Option(q.get('file'), q.get('file'), true, true));
for (const id of ['unit', 'armour', 'shield', 'light', 'focus', 'team']) $(id).onchange = build;
$('file').onchange = async () => { await load($('file').value); build(); };
addEventListener('resize', draw);
await load($('file').value);
build();
window.inspect = { build, draw, set(o) { for (const [k, v] of Object.entries(o)) { const e = $(k); if (e.type === 'checkbox') e.checked = !!v; else e.value = v; } build(); }, keys, holder };
