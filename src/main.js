// Battle test: wires the terrain, simulation, view, controls and HUD together.
// URL options: ?seed=123 for a fixed map, ?scale=3 to stack more regiments per side.
import { createStage } from './stage.js';
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
const { renderer, scene, camera, placeSun } = createStage(canvas);

const heightAt = makeHeight(seed);
buildTerrain(scene, heightAt, seed);
const battle = new Battle(heightAt, seed, { scale });
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
  placeSun(controls.cam, heightAt);
  view.update(controls.selection);
  hud.update(controls.selection, paused, speed);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// One step settles every regiment's centre before the first frame is drawn.
battle.step(0.001);
requestAnimationFrame(frame);

window.game = { battle, view, controls, seed, scale };
