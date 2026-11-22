// The Quaternius models baked for the game (assets/models.glb, made from CC0 packs): soldiers and villagers in a
// full and a light version, and the buildings. Each soldier comes in two parts: "gear" keeps its own colours and
// "cloth" is stored in grey shades that each side's colour tints. Loaded once, before any view is built; if the
// file can't load, the views fall back to the shapes they build in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TYPES } from './battle.js';
import { animReady, prepare } from './anim.js';

// Soldiers closer to the camera than `near` metres are drawn in full detail, those beyond `far` in the far version
// (casting no shadow), the rest in the light version. stage.js sets `far` from the quality setting (look.js).
export const LOD = { camera: null, near: 45, far: 100 };

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
    // an animated soldier is stored in its bind pose (anim.js); without the clips he can't be posed, so he's left out
    if (o.geometry.attributes._bones) {
      if (!animReady()) return;
      prepare(o.geometry, o.userData.anim);
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
// each wears its kind's usual armour. A drilled kind borrowing one of them adds its own dress over the armour
// (battle.js TYPES[key].dress: unit.<key>.<dress>). Every other soldier has one look.
export const ARMOUR_LEVELS = ['none', 'leather', 'mail', 'plate'];
export const HAS_SHIELD = { spear: true, sword: true };
// Whether a kind of soldier is baked in pieces, so it can show any armour level.
export const hasLevels = key => !!get(`unit.${key}.base.gear`);
const looks = new Map();
export function unitLook(key, { armour, shield, dress } = {}) {
  if (!hasLevels(key)) return unitModel(key);
  // without armour given, a soldier wears what his kind's kit brings (battle.js TYPES[key].armour)
  const level = ARMOUR_LEVELS.includes(armour) ? armour : ARMOUR_LEVELS.includes(TYPES[key]?.armour) ? TYPES[key].armour : 'none';
  const shielded = HAS_SHIELD[key] && shield !== false;
  const worn = dress && (get(`unit.${key}.${dress}.gear`) || get(`unit.${key}.${dress}.cloth`)) ? dress : null;
  const id = `${key}|${level}|${shielded}|${worn}`;
  if (looks.has(id)) return looks.get(id);
  const pieces = ['base', level, ...(shielded ? ['shield'] : []), ...(worn ? [worn] : [])];
  // a level ('light' or 'far') falls back to the next more detailed one the bake has
  const join = (part, level) => {
    const list = pieces.map(p => (level === 'far' && get(`unit.${key}.${p}.${part}.far`)) || (level && get(`unit.${key}.${p}.${part}.light`)) || get(`unit.${key}.${p}.${part}`)).filter(Boolean);
    return list.length === 1 ? list[0] : mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
  };
  const look = { gear: join('gear'), cloth: join('cloth'), gearLight: join('gear', 'light'), clothLight: join('cloth', 'light'), anim: get(`unit.${key}.base.gear`).userData.anim };
  const far = pieces.some(p => get(`unit.${key}.${p}.gear.far`) || get(`unit.${key}.${p}.cloth.far`));
  look.gearFar = far ? join('gear', 'far') : look.gearLight;
  look.clothFar = far ? join('cloth', 'far') : look.clothLight;
  looks.set(id, look);
  return look;
}

export function unitModel(key) {
  if (hasLevels(key)) return unitLook(key);
  const gear = get(`unit.${key}.gear`), cloth = get(`unit.${key}.cloth`);
  if (!gear || !cloth) return null;
  const gearLight = get(`unit.${key}.gear.light`) || gear, clothLight = get(`unit.${key}.cloth.light`) || cloth;
  return { gear, cloth, gearLight, clothLight, gearFar: get(`unit.${key}.gear.far`) || gearLight, clothFar: get(`unit.${key}.cloth.far`) || clothLight, anim: gear.userData.anim };
}

export const buildingModel = name => get('building.' + name);
export const HOUSE_STYLES = 3;
