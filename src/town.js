// The first point of interest: a village around your keep where you build, work and
// fight on one map. URL option: ?seed=123 for a fixed map.
import { createStage } from './stage.js';
import { makeHeight, buildTerrain } from './terrain.js';
import { Battle } from './battle.js';
import { BattleView } from './view.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { Town } from './economy.js';
import { TownView } from './townview.js';
import { TownHud } from './townhud.js';
import { rng } from './noise.js';

const params = new URLSearchParams(location.search);
const seed = +params.get('seed') || Math.floor(Math.random() * 1e6);

const canvas = document.getElementById('view');
const { renderer, scene, camera, placeSun } = createStage(canvas);
const heightAt = makeHeight(seed, [{ x: 0, z: 0 }]);
const { trees } = buildTerrain(scene, heightAt, seed, { clear: (x, z) => Math.hypot(x, z) < 45, woods: 0.5, count: 1500 });
// Your routers run to the keep; raiders run back to their camp and leave.
const battle = new Battle(heightAt, seed, { deploy: false, homes: [{ x: 0, z: 0 }, { x: 0, z: -225 }], disbandAtHome: [false, true] });
const rand = rng(seed + 7);
const town = new Town(battle, heightAt, trees, rand);
const view = new BattleView(scene, battle, heightAt, { capacity: 400, keeps: false });
const townView = new TownView(scene, town, heightAt, rand);

// Paused behind the opening help until the player presses Start.
let paused = true, speed = 1, placing = null, hoverAt = null, selected = null;

const hooks = {
  togglePause: () => { paused = !paused; },
  setSpeed: s => { speed = s; paused = false; },
  selectionChanged: sel => { if (sel && sel.size) selected = null; },
  selectCard: (r, add) => controls.setSelection([r], add),
  focus: r => controls.focus([r]),
  startPlacing: kind => { placing = kind; selected = null; controls.setSelection([]); },
  place: (g, e) => {
    if (!placing) return false;
    if (!g) return true;
    const res = town.place(placing, g.x, g.z);
    if (!res.ok) townHud.flash(res.reason);
    else if (!e.shiftKey) placing = null;
    return true;
  },
  cancelPlacement: () => { if (!placing) return false; placing = null; return true; },
  hover: g => { hoverAt = g; },
  pickBuilding: g => { selected = g ? townView.buildingAt(g) : null; return !!selected; },
  deselect: () => { selected = null; controls.setSelection([]); },
  selectRegiment: r => { selected = null; controls.setSelection([r]); },
  moraleLabel: r => battle.moraleLabel(r),
};
const controls = new Controls(camera, canvas, battle, view, heightAt, hooks);
Object.assign(controls.cam, { x: 0, z: 40, dist: 120 });
const hud = new Hud(battle, hooks);
const townHud = new TownHud(town, hooks);
document.getElementById('help-close').onclick = () => { document.getElementById('help').classList.remove('open'); paused = false; };

let last = performance.now(), aiClock = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    let left = dt * speed;
    while (left > 1e-4) {
      const h = Math.min(0.05, left);
      battle.step(h);
      town.update(h);
      aiClock -= h;
      if (aiClock <= 0) { aiClock = 1; town.thinkRaiders(); }
      left -= h;
    }
  }
  if (selected && selected.removed) selected = null;
  controls.update(dt);
  placeSun(controls.cam, heightAt);
  view.update(controls.selection);
  townView.update(selected);
  townView.showGhost(placing, hoverAt, placing && hoverAt && town.canPlace(placing, hoverAt.x, hoverAt.z).ok);
  hud.update(controls.selection, paused, speed);
  townHud.update(selected, [...controls.selection], placing);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
battle.step(0.001);
requestAnimationFrame(frame);

window.game = { battle, town, view, townView, controls, seed };
