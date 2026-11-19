// The Quaternius models baked for the game (assets/models.glb, made from CC0 packs): soldiers and villagers in a
// full and a light version, and the buildings. Each soldier comes in two parts: "gear" keeps its own colours and
// "cloth" is stored in grey shades that each side's colour tints. Loaded once, before any view is built; if the
// file can't load, the views fall back to the shapes they build in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Soldiers closer to the camera than this many metres are drawn in full detail, the rest in the light version.
export const LOD = { camera: null, near: 45 };

const geos = {};
try {
  const gltf = await new GLTFLoader().loadAsync(new URL('../assets/models.glb', import.meta.url).href);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    // colours are stored as bytes; widen them to floats so the models merge with shapes built in code
    const c = o.geometry.attributes.color;
    if (c && !(c.array instanceof Float32Array)) o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(Float32Array.from(c.array, v => c.normalized ? v / 255 : v), 3));
    o.geometry.computeVertexNormals();
    geos[o.name] = o.geometry;
  });
} catch (e) {
  console.warn('Baked models did not load; using the built-in shapes.', e);
}
// The loader drops the dots from node names ('unit.spear.gear' arrives as 'unitspeargear').
const get = name => geos[name.replace(/[[\].:/]/g, '')] || null;

export function unitModel(key) {
  const gear = get(`unit.${key}.gear`), cloth = get(`unit.${key}.cloth`);
  if (!gear || !cloth) return null;
  return { gear, cloth, gearLight: get(`unit.${key}.gear.light`) || gear, clothLight: get(`unit.${key}.cloth.light`) || cloth };
}

export const buildingModel = name => get('building.' + name);
export const HOUSE_STYLES = 3;
