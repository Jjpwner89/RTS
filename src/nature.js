// Trees from CC0 packs: Quaternius Ultimate Nature (assets/scout/nature, 1.3k–3k triangles) near the camera and
// the Kenney Nature Kit (assets/scout/vegetation, 50–230) farther off. Each model becomes one geometry in the
// game's tree style (terrain.js, scenery.js treeMaterial): standing on y = 0 at the kind's height, the crown in
// grey shades that take each tree's own green (aLeaf 1), the bark in its own colour (aLeaf 0). Loaded once; if
// they can't load, terrain.js keeps the shapes it builds in code.
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
    const c = leaf ? new THREE.Color().setScalar(0.55 + 0.45 * Math.min(1, lum(o.material) / brightest)) : new THREE.Color(bark[name] || '#5b4330');
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(n).fill(leaf ? 1 : 0), 1));
    return g;
  });
  const g = mergeGeometries(geos);
  g.computeBoundingBox();
  const b = g.boundingBox, k = height / (b.max.y - b.min.y);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(k, k, k);
  g.computeBoundingSphere();
  return g;
}

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
