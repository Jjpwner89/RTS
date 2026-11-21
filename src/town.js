// The first point of interest: a village around your keep where you build, work and
// fight on one map. URL option: ?seed=123 for a fixed map.
import { createStage } from './stage.js';
import { makeHeight, buildTerrain } from './terrain.js';
import { landMask, drawCover } from './scenery.js';
import { Battle } from './battle.js';
import { BattleView } from './view.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { Town, TEMPLATES } from './economy.js';
import { TownView } from './townview.js';
import { TownHud } from './townhud.js';
import { TownLabels } from './townlabels.js';
import { RoadView, placeRoad } from './roadview.js';
import { rng } from './noise.js';
import { audio } from './audio.js';
import { attachSiege } from './siegeui.js';

const params = new URLSearchParams(location.search);
const seed = +params.get('seed') || Math.floor(Math.random() * 1e6);

const canvas = document.getElementById('view');
const { renderer, scene, camera, placeSun } = createStage(canvas);
const labels = new TownLabels(canvas);
const heightAt = makeHeight(seed, [{ x: 0, z: 0 }]);
// A track south to where raiders come from, and the trodden ground round the keep.
const land = landMask(seed, { homes: [{ x: 0, z: 0 }], roads: [{ pts: [[0, 0], [0, -400]], width: 6 }], wear: [{ x: 0, z: 0, r: 24 }] });
const { trees } = buildTerrain(scene, heightAt, seed, { clear: (x, z) => Math.hypot(x, z) < 45, woods: 0.5, count: 1500, land });
drawCover(scene, heightAt, seed, { land, trees, avoid: (x, z) => Math.hypot(x, z) < 16 });
// Your routers run to the keep; raiders run back to their camp and leave.
const battle = new Battle(heightAt, seed, { deploy: false, homes: [{ x: 0, z: 0 }, { x: 0, z: -225 }], disbandAtHome: [false, true] });
const rand = rng(seed + 7);
const town = new Town(battle, heightAt, trees, rand, { timedRaids: true });
const view = new BattleView(scene, battle, heightAt, { capacity: 400, keeps: false });
const townView = new TownView(scene, town, heightAt, rand);
const roadView = new RoadView(scene, town, heightAt);

// Paused behind the opening help until the player presses Start.
let paused = true, speed = 1, placing = null, hoverAt = null, selected = null;
const road = { roadFrom: null };

const hooks = {
  togglePause: () => { paused = !paused; },
  setSpeed: s => { speed = s; paused = false; },
  selectionChanged: sel => { if (sel && sel.size) selected = null; },
  selectCard: (r, add) => controls.setSelection([r], add),
  focus: r => controls.focus([r]),
  startPlacing: kind => { placing = kind; road.roadFrom = null; selected = null; controls.setSelection([]); },
  place: (g, e) => {
    if (!placing) return false;
    if (!g) return true;
    if (placing === 'road') { placeRoad(town, road, g, e, townHud); return true; }
    const res = placing.startsWith('tpl:') ? town.placeTemplate(placing.slice(4), g.x, g.z) : town.place(placing, g.x, g.z);
    if (res.ok && res.message) townHud.flash(res.message);
    // The same building stays in hand, to place several; right-click or Esc ends it.
    if (!res.ok) townHud.flash(res.reason);
    return true;
  },
  cancelPlacement: () => { if (!placing) return false; if (road.roadFrom) { road.roadFrom = null; return true; } placing = null; return true; },
  findDeposit: n => { Object.assign(controls.cam, { x: n.x, z: n.z, dist: Math.min(controls.cam.dist, 70) }); townView.markDeposit(n); },
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
hooks.cancelOtherPlacing = () => { placing = null; };
const siege = attachSiege({ hooks, controls }, { scene, town, heightAt, flash: t => townHud.flash(t) });
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
      if (aiClock <= 0) { aiClock = 1; town.thinkAttackers(); }
      left -= h;
    }
  }
  if (selected && selected.removed) selected = null;
  controls.update(dt);
  placeSun(controls.cam, heightAt);
  view.update(controls.selection);
  townView.update(selected, hoverAt);
  const ghost = placing === 'road' || placing?.startsWith('tpl:') ? null : placing;
  townView.showGhost(ghost, hoverAt, ghost && hoverAt && town.canPlace(ghost, hoverAt.x, hoverAt.z).ok);
  const tpl = placing?.startsWith('tpl:') && hoverAt ? placing.slice(4) : null;
  townView.showGhosts(tpl ? town.templateGhosts(tpl, hoverAt) : [], tpl && town.templateCheck(tpl).ok);
  hud.update(controls.selection, paused, speed);
  townHud.update(selected, [...controls.selection], placing);
  roadView.update({ from: placing === 'road' ? road.roadFrom : null, at: hoverAt });
  labels.update(town, camera, { hoverAt, placing, roadFrom: road.roadFrom });
  audio.frame(camera, controls.cam, { battle, town, paused, fx: scene.userData.fx }); // audio
  siege.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
battle.step(0.001);
requestAnimationFrame(frame);

window.game = { battle, town, view, townView, controls, seed, siege };
