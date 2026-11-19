// The Quaternius models baked for the game (assets/models.glb, made from CC0 packs): soldiers and villagers in a
// full and a light version, and the buildings. Each soldier comes in two parts: "gear" keeps its own colours and
// "cloth" is stored in grey shades that each side's colour tints. Loaded once, before any view is built; if the
// file can't load, the views fall back to the shapes they build in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Soldiers closer to the camera than this many metres are drawn in full detail, the rest in the light version.
export const LOD = { camera: null, near: 45 };

const geos = {};
try {
  const gltf = await new GLTFLoader().loadAsync(new URL('../assets/models.glb', import.meta.url).href);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    // colours are stored as bytes; widen them to floats so the models merge with shapes built in code
    const c = o.geometry.attributes.color;
    // (they arrive interleaved, padded to four bytes, so read them vertex by vertex)
    if (c && !(c.array instanceof Float32Array)) {
      const f = new Float32Array(c.count * 3);
      for (let i = 0; i < c.count; i++) { f[i * 3] = c.getX(i); f[i * 3 + 1] = c.getY(i); f[i * 3 + 2] = c.getZ(i); }
      o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(f, 3));
    }
    o.geometry.computeVertexNormals();
    geos[o.name] = o.geometry;
  });
} catch (e) {
  console.warn('Baked models did not load; using the built-in shapes.', e);
}
// The loader drops the dots from node names ('unit.spear.gear' arrives as 'unitspeargear').
const get = name => geos[name.replace(/[[\].:/]/g, '')] || null;

// A soldier's look. Spearmen, swordsmen, bowmen and horse come in pieces (a body with its weapons, a piece per
// armour level, a shield) and are put together here for the armour and shield a regiment has; without them,
// each takes its usual look (ARMOUR_DEFAULT). Every other soldier has one look.
export const ARMOUR_LEVELS = ['none', 'leather', 'mail', 'plate'];
export const ARMOUR_DEFAULT = { spear: 'plate', sword: 'plate', archer: 'leather', crossbow: 'mail', cav: 'mail', lightcav: 'leather' };
export const HAS_SHIELD = { spear: true, sword: true };
const looks = new Map();
export function unitLook(key, { armour, shield } = {}) {
  if (!get(`unit.${key}.base.gear`)) return unitModel(key);
  const level = ARMOUR_LEVELS.includes(armour) ? armour : ARMOUR_DEFAULT[key] || 'plate';
  const shielded = HAS_SHIELD[key] && shield !== false;
  const id = `${key}|${level}|${shielded}`;
  if (looks.has(id)) return looks.get(id);
  const pieces = ['base', level, ...(shielded ? ['shield'] : [])];
  const join = (part, light) => {
    const list = pieces.map(p => (light && get(`unit.${key}.${p}.${part}.light`)) || get(`unit.${key}.${p}.${part}`)).filter(Boolean);
    return list.length === 1 ? list[0] : mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
  };
  const look = { gear: join('gear'), cloth: join('cloth'), gearLight: join('gear', true), clothLight: join('cloth', true) };
  looks.set(id, look);
  return look;
}

export function unitModel(key) {
  if (get(`unit.${key}.base.gear`)) return unitLook(key);
  const gear = get(`unit.${key}.gear`), cloth = get(`unit.${key}.cloth`);
  if (!gear || !cloth) return null;
  return { gear, cloth, gearLight: get(`unit.${key}.gear.light`) || gear, clothLight: get(`unit.${key}.cloth.light`) || cloth };
}

export const buildingModel = name => get('building.' + name);
export const HOUSE_STYLES = 3;
