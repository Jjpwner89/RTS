// Words over the village (creator, 2026-11-20): a building that is stuck says why above
// it ("waiting for wood", "no workers", "deposit worked out"), and the stone outcrop or
// ore deposit under the cursor says how much is left. While placing a quarry or mine, the
// deposits in its reach are summed beside the cursor. A DOM layer over the canvas; the
// 3D view itself is untouched.
import * as THREE from 'three';
import { BUILDINGS, ROAD, TEMPLATES, countList } from './economy.js';

// Statuses that mean a building wants something from you, and how long they must last
// before the label shows (so a crate on its way doesn't flicker one up).
const STUCK = /^(No workers|No haulers|Waiting for|Yard full|Store full|Deposit worked out|Game hunted out|No trees left|Nothing left)/;
const AFTER = 6;
const FEW = 3;   // more stuck buildings than this fold into one line
const SUMMARY = {};
const PRIO = {};

export class TownLabels {
  constructor(canvas) {
    this.canvas = canvas;
    this.el = document.createElement('div');
    this.el.className = 'town-labels';
    canvas.parentElement.appendChild(this.el);
    this.tags = new Map();
    this.tip = document.createElement('div');
    this.tip.className = 'town-tip';
    this.tip.hidden = true;
    this.el.appendChild(this.tip);
    this.v = new THREE.Vector3();
  }

  hide() {
    this.el.hidden = true;
  }

  update(town, camera, { hoverAt = null, placing = null, roadFrom = null } = {}) {
    this.el.hidden = false;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight, seen = new Set();
    const screen = (x, y, z) => {
      this.v.set(x, y, z).project(camera);
      return this.v.z > 1 ? null : { x: (this.v.x + 1) / 2 * W, y: (1 - this.v.y) / 2 * H };
    };
    // Past a few, the tags become one line over the keep and a tag only for the building the
    // pointer rests on (QC round 2: twenty "No workers" over a freshly taken town).
    const stuck = [];
    if (!town.hostile) for (const b of [town.keep, ...town.buildings]) {
      if (b.state === 'ruined' || b.removed) continue;
      if (b === town.priority) { b.stuckSince = null; continue; }   // its flag says why (below)
      const why = STUCK.test(b.status || '') ? b.status : null;
      if (!why) { b.stuckSince = null; continue; }
      b.stuckSince ??= town.time;
      if (town.time - b.stuckSince < AFTER) continue;
      stuck.push([b, why]);
    }
    const crowded = stuck.length > FEW;
    const under = crowded && hoverAt ? stuck.map(([b]) => b).filter(b => Math.hypot(b.x - hoverAt.x, b.z - hoverAt.z) < (b.B.radius || 4) + 1.5).sort((p, q) => Math.hypot(p.x - hoverAt.x, p.z - hoverAt.z) - Math.hypot(q.x - hoverAt.x, q.z - hoverAt.z))[0] : null;
    const put = (key, text, b, cls) => {
      const p = screen(b.x, town.heightAt(b.x, b.z) + (b.B.radius || 4) * 1.4 + 3, b.z);
      if (!p) return;
      let tag = this.tags.get(key);
      if (!tag) { tag = document.createElement('div'); this.el.appendChild(tag); this.tags.set(key, tag); }
      if (tag.className !== cls) tag.className = cls;
      if (tag.textContent !== text) tag.textContent = text;
      if (key === SUMMARY) return this.sit(tag, p, W, H, seen, key);
      tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      seen.add(key);
    };
    if (!crowded) for (const [b, why] of stuck) put(b, why, b, 'stuck');
    else {
      if (under) put(under, under.status, under, 'stuck');
      const kinds = new Map();
      // The reason as the building words it ("waiting for iron ore and wood"), never cut short.
      for (const [, why] of stuck) { const k = why.toLowerCase(); kinds.set(k, (kinds.get(k) || 0) + 1); }
      const list = [...kinds].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, n]) => `${n} ${k}`).join(', ');
      put(SUMMARY, `${stuck.length} places stuck: ${list}. Point at one to see why`, town.keep, 'stuck sum');
    }
    // The one priority wears a flag with what it is doing about it (same badge as the stuck tags, in the accent colour).
    const P = town.priority;
    if (P && !P.removed && !town.hostile && town.prioText) put(PRIO, `⚑ ${town.prioText}`, P, 'stuck prio');
    for (const [b, tag] of this.tags) if (!seen.has(b)) { tag.remove(); this.tags.delete(b); }
    this.showTip(town, hoverAt, placing, screen, roadFrom);
  }

  // The one-line summary sits just under the keep, kept inside the view and clear of the top bar,
  // the stock panel, the info card and the news lines, so the whole line reads.
  sit(tag, p, W, H, seen, key) {
    const o = this.el.getBoundingClientRect(), pad = 8, w = tag.offsetWidth, h = tag.offsetHeight;
    const boxes = [...document.querySelectorAll('#top, #stock, #info, #build, #log > div, #toast.show')].filter(b => b.getClientRects().length)
      .map(b => { const r = b.getBoundingClientRect(); return { l: r.left - o.left, r: r.right - o.left, t: r.top - o.top, b: r.bottom - o.top }; });
    let x = Math.max(pad, Math.min(W - w - pad, p.x - w / 2)), y = Math.max(pad, p.y + 36);
    for (let i = 0; i < 4; i++) {
      const hit = boxes.find(b => x < b.r && x + w > b.l && y < b.b && y + h > b.t);
      if (!hit) break;
      y = hit.b + 6;   // step under it
    }
    y = Math.min(y, H - h - pad);
    tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    seen.add(key);
  }

  // What is left in the deposit under the cursor, or in reach of a quarry or mine being placed.
  showTip(town, at, placing, screen, roadFrom) {
    let text = null;
    if (at && !town.hostile) {
      const g = BUILDINGS[placing]?.gather;
      if (placing?.startsWith('tpl:')) {
        const name = placing.slice(4), T = TEMPLATES[name], plan = town.templatePreview(name, at), c = town.templateCheck(name);
        const missed = countList(plan.missed.map(s => s.B.name.toLowerCase()));
        text = `${T.name}: ${plan.length} of ${T.list.length} buildings fit here` + (missed ? ` · won't fit: ${missed}` : '') + (c.ok ? '' : ` · ${c.reason}`);
      } else if (placing === 'road') {
        if (!roadFrom) text = 'Click where the road starts';
        else if (Math.hypot(at.x - roadFrom.x, at.z - roadFrom.z) < 2) text = 'Click where it ends (Esc to stop)';
        else {
          const c = town.roadCheck(roadFrom, at), len = Math.hypot(at.x - roadFrom.x, at.z - roadFrom.z);
          text = `${Math.round(len)} m, ${town.roadCost(roadFrom, at)} stone` + (c.ok ? '' : `: ${c.reason}`);
        }
      } else if (g && (g.node === 'rock' || g.node === 'ore')) {
        const { list: near, left } = town.depositsAt(at.x, at.z, g);
        const what = g.node === 'rock' ? 'stone' : 'ore';
        text = near.length ? `In reach: ${near.length} ${g.node === 'rock' ? 'outcrop' : 'deposit'}${near.length > 1 ? 's' : ''}, ${Math.round(left)} ${what} left, and no more: ${near.length > 1 ? 'they run' : 'it runs'} out` : `No ${g.node === 'rock' ? 'stone outcrop' : 'ore deposit'} in reach`;
      } else {
        const d = [...town.nodes.rock, ...town.nodes.ore].find(n => Math.hypot(n.x - at.x, n.z - at.z) < 7);
        if (d && d.left !== undefined) {
          const what = d.kind === 'rock' ? 'Stone outcrop' : 'Ore deposit';
          text = d.left > 0 ? `${what} (${d.rich ? 'rich' : 'poor'}): ${Math.round(d.left)} of ${d.full} left` : `${what}: worked out`;
        }
      }
      // A building in hand that can't stand here says why, at the cursor (never a silent red ghost).
      if (BUILDINGS[placing]) { const c = town.canPlace(placing, at.x, at.z); if (!c.ok) text = text ? `${c.reason} · ${text}` : c.reason; }
    }
    this.tip.hidden = !text;
    if (!text) return;
    const p = screen(at.x, town.heightAt(at.x, at.z) + 2, at.z);
    if (!p) { this.tip.hidden = true; return; }
    if (this.tip.textContent !== text) this.tip.textContent = text;
    // Kept on the screen: a long tip near the right edge sits to the left of the cursor.
    const wide = this.tip.offsetWidth, x = p.x + 16 + wide > innerWidth - 8 ? Math.max(8, p.x - 16 - wide) : p.x + 16;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(p.y + 12)}px)`;
  }
}
