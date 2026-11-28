// Building walls in a village: the Defences panel, dragging out a wall, placing towers
// and gates, and the selected stretch's state with Repair and Demolish. Walls are paid
// for from the village's stores when placed, and masons raise them on their own.
// attachSiege() wires all of this into a village screen's hooks; call update() each frame.
import { WALL_COSTS, MATERIALS } from './walls.js';
import { SiegeView } from './siegeview.js';
import { drawDeployZone } from './fieldview.js';
import { GOODS, MASONS } from './economy.js';
import { why } from './ui/why.js';
import { ico } from './icons.js';

const costText = cost => Object.entries(cost).map(([g, n]) => `${n} ${GOODS[g]?.name.toLowerCase() || g}`).join(', ');

// `does` is the line on the button, `tip` the longer tooltip, `hint` what to do once it is picked.
export const TOOLS = [
  { key: 'wall:wood', name: 'Palisade', icon: 'palisade', cost: WALL_COSTS.wood.wall, per: ' per 10 m', does: 'Quick and cheap; fire and axes get through', tip: 'Drag a line. Cheap and quick; axes and fire get through it.', hint: 'Drag a line across the ground; it is laid out in pieces and crews raise them.' },
  { key: 'wall:stone', name: 'Stone wall', icon: 'stonewall', cost: WALL_COSTS.stone.wall, per: ' per 10 m', does: 'Only rams and stone-throwers break it', tip: 'Drag a line. Only rams and stone-throwers break it.', hint: 'Drag a line across the ground; it is laid out in pieces and crews raise them.' },
  { key: 'tower:wood', name: 'Wooden tower', icon: 'woodtower', cost: WALL_COSTS.wood.tower, does: 'Archers on top shoot far', tip: 'Click on a wall or anywhere. Archers on top shoot furthest. Your men climb onto the walls by towers and gates.', hint: 'Click on a wall, or anywhere, to set a tower. Shift-click sets several.' },
  { key: 'tower:stone', name: 'Stone tower', icon: 'stonetower', cost: WALL_COSTS.stone.tower, does: 'Holds twelve archers', tip: 'Click on a wall or anywhere. Holds twelve archers.', hint: 'Click on a wall, or anywhere, to set a tower. Shift-click sets several.' },
  { key: 'gate', name: 'Gate', icon: 'gate', cost: WALL_COSTS.wood.gate, does: 'Opens for your people, shut to the foe', tip: 'Click a stretch of wall. Opens for your people, shut to the enemy until rammed or forced.', hint: 'Click a stretch of wall at least 6 m long to turn it into a gate.' },
];
const WALLS_ABOUT = 'Walls keep raiders off your stores and your people. Your men climb onto them by towers and gates. Pick a tool, then drag (walls) or click (towers, gates): crews raise it on their own.';

// Takes goods from the keep first, then the storehouses, then wherever they lie; gold
// from the purse.
export function payGoods(town, cost) {
  const holders = [town.keep, ...town.stores().filter(b => b !== town.keep), ...town.holders().filter(b => b.state !== 'site')];
  for (const [g, n] of Object.entries(cost)) {
    if (g === 'gold') { town.purse.gold -= n; continue; }
    let left = n;
    for (const b of holders) {
      if (left <= 0) break;
      const k = Math.min(left, b.store[g] || 0);
      if (k > 0) { town.put(b, g, -k); left -= k; }
    }
  }
}

export function attachSiege(b, { scene, town, heightAt, flash }) {
  const battle = town.battle, W = battle.walls;
  if (!battle.trees && town.trees) battle.setWoods(town.trees);   // the village's woods hide men too
  const view = new SiegeView(scene, battle, heightAt);
  const ui = { tool: null, drag: null, hover: null, selected: null, view };
  const afford = cost => { const { gold = 0, ...goods } = cost; return town.purse.gold >= gold && town.canAfford(goods); };
  // What a greyed tool or a refused wall lacks, in the stores panel's figures (economy.js shortText).
  const lacking = cost => { const { gold = 0, ...goods } = cost;
    return [town.shortText(goods), town.purse.gold < gold ? `Needs ${gold} gold (you have ${Math.floor(town.purse.gold)})` : ''].filter(Boolean).join('. '); };
  const refuse = res => flash(res.reason === 'Not enough goods' && res.cost && lacking(res.cost) || res.reason);
  // Walls keep clear of the keep, buildings and deposits, and stay on your land.
  const avoid = (x, z, r) => {
    if (Math.hypot(x, z) > town.territory) return true;
    if (Math.hypot(x, z) < 11 + r + 3) return true;
    for (const o of town.buildings) if (Math.hypot(o.x - x, o.z - z) < o.B.radius + r + 0.5) return true;
    for (const n of [...town.nodes.rock, ...town.nodes.ore]) if (Math.hypot(n.x - x, n.z - z) < r + 3) return true;
    return false;
  };

  // ---- the panel ----
  // One panel on the page, shared by every village: it belongs to whichever is on screen.
  let el = document.getElementById('defences');
  if (!el) { el = document.createElement('aside'); el.id = 'defences'; document.body.append(el); }
  let selEl = null, hintEl = null;
  const bindPanel = () => {
  el.owner = ui;
  selKey = null;
  el.innerHTML = `<h4>Defences</h4><div class="items">${TOOLS.map(t => `
    <button data-tool="${t.key}" title="${t.tip}">${ico(t.icon)}${t.name}<small>${costText(t.cost)}${t.per || ''}</small><small class="does">${t.does}</small></button>`).join('')}</div>
    <button data-act="masons" class="masons" title="For ${Math.round(MASONS.secs / 60)} minutes: twice the crews on new and broken walls, and damaged walls and towers mended while no one is fighting">${ico('pick')}Hire masons<small>${MASONS.gold} gold</small></button>
    <p class="walls-hint"></p>
    <div class="sel" hidden></div>`;
  selEl = el.querySelector('.sel');
  hintEl = el.querySelector('.walls-hint');
  el.onclick = e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.tool) {
      const t = btn.dataset.tool;
      ui.tool = ui.tool === t ? null : t;
      ui.selected = null;
      b.hooks.cancelOtherPlacing?.();
      b.controls.setSelection([]);
      return;
    }
    if (btn.dataset.act === 'masons') { const r = town.hireMasons(); if (!r.ok) flash(r.reason); return; }
    const s = ui.selected;
    if (!s) return;
    if (btn.dataset.act === 'repair') {
      const cost = W.repairCost(s);
      if (!afford(cost)) { flash(lacking(cost)); return; }
      payGoods(town, cost); W.repair(s);
    }
    if (btn.dataset.act === 'demolish') {
      // Half the cost back for a standing stretch, all of it for one not yet begun.
      const cost = s.kind === 'tower' ? WALL_COSTS[s.material].tower : W.pieceCost(s);
      const back = s.state === 'up' ? 0.5 : s.state === 'site' ? 1 - s.progress : 0;
      for (const [g, n] of Object.entries(cost)) if (Math.floor(n * back) > 0) { if (g === 'gold') town.purse.gold += Math.floor(n * back); else town.put(town.keep, g, Math.floor(n * back)); }
      W.demolish(s);
      ui.selected = null;
    }
    if (btn.dataset.act === 'gate') {
      const res = W.makeGate(s, { afford });
      if (!res.ok) refuse(res); else payGoods(town, res.cost);
    }
    selKey = null;
  };
  };
  let selKey = null;
  function showSelected() {
    const s = ui.selected;
    if (s && s.removed) ui.selected = null;
    const key = ui.selected ? `${ui.selected.id}:${ui.selected.state}:${ui.selected.gate}:${Math.round(ui.selected.hp / ui.selected.maxHp * 20)}:${Math.round(ui.selected.progress * 10)}` : '';
    if (key === selKey) return;
    selKey = key;
    selEl.hidden = !ui.selected;
    if (!ui.selected) return;
    const what = s.kind === 'tower' ? (s.material === 'stone' ? 'Stone tower' : 'Wooden tower') : s.gate ? `${s.material === 'stone' ? 'Stone' : 'Wooden'} gate` : MATERIALS[s.material].name;
    const state = s.state === 'site' ? `Being built: ${Math.round(s.progress * 100)}%` : s.state === 'broken' ? 'Broken' : `${Math.round(s.hp)} / ${Math.round(s.maxHp)}`;
    selEl.innerHTML = `<b>${what}</b> · ${state}<div class="row">
      ${s.state === 'broken' ? `<button data-act="repair" title="${costText(W.repairCost(s))}">Rebuild</button>` : ''}
      ${s.kind === 'piece' && !s.gate && s.state === 'up' && s.len >= 6 ? `<button data-act="gate" title="${costText(WALL_COSTS[s.material].gate)}">Make a gate</button>` : ''}
      <button data-act="demolish">Pull down</button></div>`;
  }

  // ---- placing ----
  const hooks = b.hooks, old = { ...hooks };
  const material = () => ui.tool?.split(':')[1] || 'wood';
  hooks.dragPlacing = () => ui.tool?.startsWith('wall:');
  hooks.dragMove = (start, g) => { ui.drag = start && g ? { start, end: g } : null; };
  hooks.dragEnd = (start, g, e) => {
    ui.drag = null;
    if (!start || !g) return;
    const res = W.placeLine(start.x, start.z, g.x, g.z, 0, material(), { avoid, afford });
    if (!res.ok) { refuse(res); return; }
    payGoods(town, res.cost);     // walls go up in runs, so the tool stays until Esc
  };
  hooks.place = (g, e) => {
    if (!ui.tool || town.hostile) return old.place?.(g, e) || false;
    if (!g) return true;
    if (ui.tool.startsWith('tower:')) {
      const res = W.placeTower(g.x, g.z, 0, material(), { avoid, afford });
      if (!res.ok) refuse(res); else { payGoods(town, res.cost); if (!e.shiftKey) ui.tool = null; }
    } else if (ui.tool === 'gate') {
      const hit = W.pieceAt(g.x, g.z, 0, 3);
      const res = W.makeGate(hit?.piece, { afford });
      if (!res.ok) refuse(res); else { payGoods(town, res.cost); if (!e.shiftKey) ui.tool = null; }
    }
    return true;
  };
  hooks.cancelPlacement = () => {
    if (ui.tool) { ui.tool = null; ui.drag = null; return true; }
    return old.cancelPlacement?.() || false;
  };
  hooks.hover = g => { ui.hover = g; old.hover?.(g); };
  hooks.pickBuilding = g => {
    const s = g && !town.hostile && (W.towerAt(g.x, g.z, 0, 0.5) || W.pieceAt(g.x, g.z, 0, 0.5)?.piece);
    if (s) { ui.selected = s; old.deselect?.(); return true; }
    ui.selected = null;
    return old.pickBuilding?.(g) || false;
  };
  hooks.startPlacing = kind => { ui.tool = null; ui.selected = null; old.startPlacing?.(kind); };

  ui.update = dt => {
    if (el.owner !== ui) bindPanel();
    view.update(dt);
    // The lit ground an army storming this place may form up on before it goes in.
    if (battle.deploying?.side === 0 && !ui.zone) ui.zone = drawDeployZone(scene, battle, battle.deploying);
    if (ui.zone && !battle.deploying) {
      scene.remove(ui.zone);
      ui.zone.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      ui.zone = null;
    }
    // While storming someone else's place there is nothing of ours to build.
    el.hidden = !!town.hostile;
    document.body.classList.toggle('has-defences', !town.hostile);   // the cards make room for it
    if (town.hostile) { ui.tool = null; ui.selected = null; view.showPlan(null); return; }
    for (const btn of el.querySelectorAll('[data-tool]')) {
      btn.classList.toggle('on', btn.dataset.tool === ui.tool);
      const t = TOOLS.find(o => o.key === btn.dataset.tool);
      why(btn, afford(t.cost) ? '' : lacking(t.cost));
    }
    const mb = el.querySelector('[data-act="masons"]');
    if (mb) { const c = town.masonsCheck(); mb.disabled = !c.ok; const txt = c.ok ? `${MASONS.gold} gold` : c.reason; if (mb.lastChild.textContent !== txt) mb.lastChild.textContent = txt; }
    showSelected();
    const hint = (TOOLS.find(o => o.key === ui.tool)?.hint || WALLS_ABOUT) + (ui.tool ? ' Esc stops.' : '');
    if (hintEl.textContent !== hint) hintEl.textContent = hint;
    let plan = null;
    if (ui.tool?.startsWith('wall:') && ui.drag) {
      const c = W.canPlaceLine(ui.drag.start.x, ui.drag.start.z, ui.drag.end.x, ui.drag.end.z, 0, material(), { avoid, afford });
      plan = { kind: 'line', ok: c.ok, pts: c.plan.pts, material: material() };
    } else if (ui.tool?.startsWith('tower:') && ui.hover) {
      const c = W.canPlaceTower(ui.hover.x, ui.hover.z, 0, material(), { avoid, afford });
      const at = W.towerSpot(ui.hover.x, ui.hover.z, 0);
      plan = { kind: 'tower', ok: c.ok, x: at.x, z: at.z, material: material() };
    } else if (ui.tool === 'gate' && ui.hover) {
      const hit = W.pieceAt(ui.hover.x, ui.hover.z, 0, 3);
      if (hit) plan = { kind: 'gate', ok: W.canMakeGate(hit.piece, { afford }).ok, piece: hit.piece };
    } else if (ui.selected) plan = { kind: 'select', ok: true, piece: ui.selected };
    view.showPlan(plan);
  };
  b.siege = ui;
  bindPanel();   // built now, not on the first frame: a page that has not drawn yet still has its tools
  return ui;
}
