// Battle test: wires the terrain, simulation, view, controls and HUD together.
// URL options: ?seed=123 for a fixed map, ?scale=3 to stack more regiments per side.
import * as THREE from 'three';
import { makeHeight, buildTerrain } from './terrain.js';
import { Battle } from './battle.js';
import { BattleView } from './view.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { thinkAI } from './ai.js';

const params = new URLSearchParams(location.search);
const seed = +params.get('seed') || Math.floor(Math.random() * 1e6);
const scale = Math.max(1, Math.min(8, +params.get('scale') || 1));

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sky = new THREE.Color('#b9cbd6');
scene.background = sky;
scene.fog = new THREE.Fog(sky, 300, 760);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);

scene.add(new THREE.HemisphereLight('#dfe9f2', '#5a5236', 1.6));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const heightAt = makeHeight(seed);
buildTerrain(scene, heightAt, seed);
const battle = new Battle(heightAt, seed, scale);
const view = new BattleView(scene, battle, heightAt);

let paused = false, speed = 1;
const hooks = {
  togglePause: () => { paused = !paused; },
  setSpeed: s => { speed = s; paused = false; },
  selectionChanged: () => {},
  selectCard: (r, add) => controls.setSelection([r], add),
  focus: r => controls.focus([r]),
};
const controls = new Controls(camera, canvas, battle, view, heightAt, hooks);
const hud = new Hud(battle, hooks);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// The shadow box follows the camera so shadows stay sharp at every zoom.
function placeSun() {
  const c = controls.cam, size = Math.min(260, Math.max(50, c.dist * 0.9));
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -size; cam.right = cam.top = size;
  cam.near = 1; cam.far = 600;
  cam.updateProjectionMatrix();
  sun.target.position.set(c.x, heightAt(c.x, c.z), c.z);
  sun.position.set(c.x + 120, 220, c.z + 80);
}

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
      if (aiClock <= 0) { aiClock = 1; thinkAI(battle, 1); }
      left -= h;
    }
  }
  controls.update(dt);
  placeSun();
  view.update(controls.selection);
  hud.update(controls.selection, paused, speed);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// One step settles every regiment's centre before the first frame is drawn.
battle.step(0.001);
requestAnimationFrame(frame);

window.game = { battle, view, controls, seed, scale };
