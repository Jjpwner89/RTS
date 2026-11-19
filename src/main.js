// Battle test: wires the terrain, simulation, view, controls and HUD together.
// URL options: ?seed=123 for a fixed map, ?scale=3 to stack more regiments per side,
// ?mode=siege to storm a walled fort with engines, ?mode=defend to hold one.
import * as THREE from 'three';
import { createStage } from './stage.js';
import { makeHeight, buildTerrain } from './terrain.js';
import { Battle } from './battle.js';
import { BattleView, keepModel } from './view.js';
import { SiegeView } from './siegeview.js';
import { buildFort } from './walls.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { thinkAI } from './ai.js';
import { audio } from './audio.js';
import { makeCaptain } from './captains.js';
import { rng } from './noise.js';

const params = new URLSearchParams(location.search);
const seed = +params.get('seed') || Math.floor(Math.random() * 1e6);
const scale = Math.max(1, Math.min(8, +params.get('scale') || 1));
const mode = ['siege', 'defend'].includes(params.get('mode')) ? params.get('mode') : 'field';

// In a siege the fort stands where the defenders' keep would be.
const FORT = { siege: { side: 1, x: 0, z: -120 }, defend: { side: 0, x: 0, z: 110 } }[mode];
const homes = mode === 'siege' ? [{ x: 0, z: 225 }, { x: 0, z: -120 }] : mode === 'defend' ? [{ x: 0, z: 110 }, { x: 0, z: -225 }] : undefined;

const canvas = document.getElementById('view');
const { renderer, scene, camera, placeSun } = createStage(canvas);

const heightAt = makeHeight(seed, homes || undefined);
buildTerrain(scene, heightAt, seed, FORT ? { clear: (x, z) => Math.abs(x) < 150 && Math.abs(z) < 250 } : undefined);
const battle = new Battle(heightAt, seed, { scale, deploy: mode === 'field', ...(homes ? { homes } : {}) });
const view = new BattleView(scene, battle, heightAt, { keeps: mode === 'field' });
const siegeView = new SiegeView(scene, battle, heightAt);
const rand = rng(seed + 5);

// A list of [key, x, back, count?] from a front centre, facing `angle`.
function deployArmy(side, list, cx, cz, angle) {
  const sin = Math.sin(angle), cos = Math.cos(angle);
  return list.map(([key, x, back, count]) => battle.addRegiment(side, key, cx + cos * x - sin * back, cz - sin * x - cos * back, angle, { count }));
}

if (FORT) {
  buildFort(battle.walls, FORT.side, FORT.x, FORT.z, 44, { material: 'stone', sides: 6, gateAngle: FORT.side === 1 ? 0 : Math.PI });
  const keep = new THREE.Mesh(keepModel(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  keep.position.set(FORT.x, heightAt(FORT.x, FORT.z) - 0.5, FORT.z);
  keep.scale.setScalar(0.7);
  keep.castShadow = keep.receiveShadow = true;
  scene.add(keep);
  // Defenders start inside, facing the gate; attackers form up out of bowshot.
  const out = FORT.side === 1 ? 1 : -1;       // +z for a fort in the north
  const inFace = FORT.side === 1 ? 0 : Math.PI;
  const def = deployArmy(FORT.side, [
    ['archer', -12, 0, 50], ['archer', 12, 0, 50], ['crossbow', 0, 6, 40],
    ['spear', -14, 14, 60], ['maa', 14, 14, 50], ['sword', 0, 22, 60], ['lightcav', 0, -14, 24],
  ], FORT.x, FORT.z + out * 18, inFace);
  const attSide = 1 - FORT.side, attZ = FORT.z + out * 175, attFace = FORT.side === 1 ? Math.PI : 0;
  const att = deployArmy(attSide, [
    ['ram', 0, -10], ['ladder', -36, -8], ['ladder', 36, -8], ['ladder', -60, -8],
    ['maa', -30, 0], ['sword', 0, 0], ['maa', 30, 0], ['spear', -60, 0], ['sellsword', 60, 0],
    ['archer', -30, 18], ['crossbow', 30, 18], ['hiredxbow', 0, 18],
    ['mangonel', -45, 36], ['mangonel', 45, 36], ['trebuchet', 0, 46],
    ['knight', -100, 10], ['cav', 100, 10], ['lightcav', 130, 20],
  ], 0, attZ, attFace);
  battle.setCaptain(attSide, makeCaptain(rand, { level: 2 }), att.find(r => r.T.key === 'knight'));
  battle.setCaptain(FORT.side, makeCaptain(rand, { level: 2 }), def.find(r => r.T.key === 'maa'));
  battle.checkWinner = true;
} else {
  for (let side = 0; side < 2; side++) {
    const reg = battle.regs.find(r => r.side === side && r.T.key === 'knight') || battle.regs.find(r => r.side === side && r.T.mounted);
    battle.setCaptain(side, makeCaptain(rand), reg);
  }
}

let paused = mode !== 'field', speed = 1;
const hooks = {
  togglePause: () => { paused = !paused; },
  setSpeed: s => { speed = s; paused = false; },
  selectionChanged: () => {},
  selectCard: (r, add) => controls.setSelection([r], add),
  focus: r => controls.focus([r]),
};
const controls = new Controls(camera, canvas, battle, view, heightAt, hooks);
if (FORT) Object.assign(controls.cam, FORT.side === 1 ? { x: 0, z: 110, dist: 150 } : { x: 0, z: 175, dist: 160 });
const hud = new Hud(battle, hooks);
document.querySelector('.title').textContent = { field: 'Battle test', siege: 'Siege: storm the fort', defend: 'Siege: hold the fort' }[mode];
for (const a of document.querySelectorAll('[data-mode]')) a.classList.toggle('on', a.dataset.mode === mode);
if (paused) document.getElementById('help').classList.add('open');

let last = performance.now(), aiClock = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    let left = dt * speed;
    while (left > 1e-4) {
      const h = Math.min(0.05, left);
      battle.step(h);
      aiClock -= h;
      if (aiClock <= 0) { aiClock = 1; thinkAI(battle, 1, { start: FORT ? 0 : 8 }); }
      left -= h;
    }
  }
  controls.update(dt);
  placeSun(controls.cam, heightAt);
  view.update(controls.selection);
  siegeView.update(dt);
  hud.update(controls.selection, paused, speed);
  audio.frame(camera, controls.cam, { battle, field: true, siege: mode !== 'field', paused }); // audio
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// One step settles every regiment's centre before the first frame is drawn.
battle.step(0.001);
requestAnimationFrame(frame);

window.game = { battle, view, siegeView, controls, seed, scale, mode, thinkAI };
