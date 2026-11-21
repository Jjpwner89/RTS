// Trees from CC0 packs: Quaternius Ultimate Nature (assets/scout/nature, 1.3k–3k triangles) near the camera and
// the Kenney Nature Kit (assets/scout/vegetation, 50–230) farther off. Each model becomes one geometry in the
// game's tree style (terrain.js, scenery.js treeMaterial): standing on y = 0 at the kind's height, the crown in
// grey shades that take each tree's own green (aLeaf 1), the bark in its own colour (aLeaf 0). Loaded once; if
// they can't load, terrain.js keeps the shapes it builds in code. (Their bushes were tried and left out: smooth
// pale domes, like beehives; Kenney's are spiky, like agaves.)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Trees nearer the camera than `near` metres are drawn in the detailed model; stage.js sets it from the quality
// setting (look.js).
export const TREE_LOD = { near: 90 };

// For each kind: its height in metres, bark colours by the pack's material name, and the models near and far.
const KINDS = {
  oak: { height: 7.6, bark: { Wood: '#5b4330', woodBark: '#5b4330' }, near: ['CommonTree_1', 'CommonTree_3', 'CommonTree_4'], far: ['tree_oak', 'tree_default'] },
  pine: { height: 7.8, bark: { Wood: '#4d3828', woodBarkDark: '#4d3828' }, near: ['PineTree_1', 'PineTree_2', 'PineTree_5'], far: ['tree_pineTallA', 'tree_pineTallC'] },
  birch: { height: 7.0, bark: { White: '#d9d4c8', Black: '#2e2a26', woodBark: '#d9d4c8' }, near: ['BirchTree_1', 'BirchTree_2', 'BirchTree_3'], far: ['tree_thin'] },
};
const LEAF = /green|leaf/i;

// Colours a geometry one colour, as leaves (aLeaf 1, tinted by each tree's own green) or bark (0).
export function paint(g, color, leaf = 1) {
  g = g.index ? g.toNonIndexed() : g;
  const k = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(n).fill(leaf), 1));
  g.deleteAttribute('uv');
  return g;
}

// A model as one non-indexed geometry with position, colour and aLeaf.
function vegetable(root, { height, bark }) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => { if (o.isMesh) parts.push(o); });
  const lum = m => { const c = m.color; return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  const brightest = Math.max(1e-4, ...parts.filter(o => LEAF.test(o.material.name)).map(o => lum(o.material)));
  const geos = parts.map(o => {
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const g = new THREE.BufferGeometry().setAttribute('position', src.attributes.position.clone());
    g.applyMatrix4(o.matrixWorld);
    const name = o.material.name.replace(/\.\d+$/, ''), leaf = LEAF.test(name);
    // a darker leaf material is a darker grey, never below 0.55 of the tree's green
    return paint(g, leaf ? new THREE.Color().setScalar(0.55 + 0.45 * Math.min(1, lum(o.material) / brightest)) : bark[name] || '#5b4330', leaf ? 1 : 0);
  });
  const g = mergeGeometries(geos);
  g.computeBoundingBox();
  const b = g.boundingBox, k = height / (b.max.y - b.min.y);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(k, k, k);
  g.computeBoundingSphere();
  return g;
}

// The packs the models come from, by their folder in assets/scout; credits.html names each (checks.js).
export const PACKS = { nature: 'Ultimate Nature', vegetation: 'Nature Kit' };

export let TREES = null;
try {
  const loader = new GLTFLoader();
  const load = async (dir, name, kind) => vegetable((await loader.loadAsync(new URL(`../assets/scout/${dir}/${name}.glb`, import.meta.url).href)).scene, kind);
  const out = {};
  await Promise.all(Object.entries(KINDS).map(async ([key, kind]) => {
    out[key] = { near: await Promise.all(kind.near.map(n => load('nature', n, kind))), far: await Promise.all(kind.far.map(n => load('vegetation', n, kind))) };
  }));
  TREES = out;
} catch (e) {
  console.warn('Tree models did not load; using the built-in shapes.', e);
}

// Things drawn in one model near the camera and another farther off (trees), each in `mat`: one instanced
// mesh per model, and before each frame through a perspective camera, once it has moved a few metres, every thing
// goes again into its near or its far model's mesh. items: [{ x, y, z, matrix (16 numbers), color, near, far
// (geometries), hidden }]; near(): the distance in metres. Returns the group of meshes and dirty(), to call after
// hiding or showing one. (scene.onBeforeRender runs before anything is drawn, so a frame sees its own placing.)
export function nearAndFar(scene, items, mat, near) {
  const group = new THREE.Group();
  const room = new Map();
  for (const a of items) for (const g of new Set([a.near, a.far])) room.set(g, (room.get(g) || 0) + 1);
  const meshes = new Map([...room].map(([geo, n]) => {
    const x = new THREE.InstancedMesh(geo, mat, n);
    x.castShadow = x.receiveShadow = true;
    x.frustumCulled = false;    // things move between meshes, so no one bounding sphere holds
    x.count = 0;
    x.setColorAt(0, new THREE.Color());
    group.add(x);
    return [geo, x];
  }));
  for (const a of items) { a.near = meshes.get(a.near); a.far = meshes.get(a.far); }
  let dirty = true, cx = 1e9, cy = 0, cz = 0, was = 0;
  const place = cam => {
    const near2 = near() ** 2;
    if (!dirty && was === near2 && (cam.x - cx) ** 2 + (cam.y - cy) ** 2 + (cam.z - cz) ** 2 < 16) return;
    dirty = false; was = near2; cx = cam.x; cy = cam.y; cz = cam.z;
    for (const x of group.children) x.count = 0;
    for (const a of items) {
      if (a.hidden) continue;
      const x = (a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2 < near2 ? a.near : a.far, i = x.count++;
      x.instanceMatrix.array.set(a.matrix, i * 16);
      x.setColorAt(i, a.color);
    }
    for (const x of group.children) { x.instanceMatrix.needsUpdate = true; x.instanceColor.needsUpdate = true; }
  };
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, ...rest) {
    before.call(this, renderer, sc, camera, ...rest);
    if (camera.isPerspectiveCamera && group.parent) place(camera.position);
  };
  scene.add(group);
  return { group, dirty: () => { dirty = true; } };
}
