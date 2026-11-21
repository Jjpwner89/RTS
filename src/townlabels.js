// Over the village (creator, 2026-11-20, then 2026-11-22: "it shouldn't dominate the screen,
// show it with icons"): a building that is stuck wears a small round badge (the good it waits
// for, a person, an empty pick, bow or stump, a full crate) and says why in words on hover;
// past a few, a strip of icon counts by the stock panel stands in for them. The stone outcrop or
// ore deposit under the cursor says how much is left. While placing a quarry or mine, the
// deposits in its reach are summed beside the cursor. A DOM layer over the canvas; the
// 3D view itself is untouched.
import * as THREE from 'three';
import { BUILDINGS, GOODS, ROAD, TEMPLATES, countList } from './economy.js';
import { ico } from './icons.js';

// Statuses that mean a building wants something from you, and how long they must last
// before the label shows (so a crate on its way doesn't flicker one up).
export const STUCK = /^(No workers|No haulers|Waiting for|Yard full|Store full|Deposit worked out|Game hunted out|No trees left|Nothing left)/;
export const AFTER = 6;
export const FEW = 3;    // more stuck buildings than this get the icon strip
const PRIO = {};
export const MANY = 8;   // more than this and the badges go, but for the one under the pointer
const BY_NAME = Object.fromEntries(Object.entries(GOODS).map(([k, g]) => [g.name.toLowerCase(), k]));

// What a status means as a badge: its kind (the strip counts by it), the icon, and whether nothing
// can be made until you act (red) or it only waits (muted).
export function stuckKind(status) {
  if (/^(No workers|No haulers|Waiting for workers)/.test(status)) return { key: 'workers', icon: 'people', bad: true };
  if (/^Deposit worked out|^Nothing left/.test(status)) return { key: 'pick', icon: 'pick', bad: true };
  if (/^Game hunted out/.test(status)) return { key: 'game', icon: 'bows', bad: true };
  if (/^No trees left/.test(status)) return { key: 'trees', icon: 'stump', bad: true };
  if (/^(Yard|Store) full/.test(status)) return { key: 'full', icon: 'crate' };
  const g = BY_NAME[(status.match(/^Waiting for ([^,]*?)(?: and |$)/)?.[1] || '')];
  return g ? { key: g, icon: GOODS[g].icon } : { key: 'materials', icon: 'warning' };
}

// One badge style for everything that flags a building (stuck, and the Priority flag).
export const badge = (k, text) => `<span class="tbadge${k.bad ? ' bad' : ''}${k.prio ? ' prio' : ''}" title="${text}">${ico(k.icon)}</span>`;

// The boxes of the panels a badge must not sit over (client pixels).
function panelBoxes() {
  const out = [];
  for (const n of document.querySelectorAll('#top, #stock, #info, #build, #orders, #cards, #defences, #log > div, #toast.show, .modal.open, #realm:not([hidden]), #help.open')) {
    if (!n.getClientRects().length) continue;
    const r = n.getBoundingClientRect();
    out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, owner: n });
  }
  return out;
}

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
    this.strip = document.createElement('div');
    this.strip.className = 'stuck-strip';
    this.strip.hidden = true;
    this.el.appendChild(this.strip);
    this.turn = {};   // per kind: which building the next click on its icon looks at
    this.strip.addEventListener('click', e => {
      const k = e.target.closest('[data-k]')?.dataset.k, list = this.groups?.get(k);
      if (!list) return;
      const b = list[(this.turn[k] = ((this.turn[k] ?? -1) + 1) % list.length)];
      this.go?.(b);
    });
  }

  hide() {
    this.el.hidden = true;
  }

  update(town, camera, { hoverAt = null, placing = null, roadFrom = null, go = null } = {}) {
    this.el.hidden = false;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight, seen = new Set();
    const screen = (x, y, z) => {
      this.v.set(x, y, z).project(camera);
      return this.v.z > 1 ? null : { x: (this.v.x + 1) / 2 * W, y: (1 - this.v.y) / 2 * H };
    };
    // (QC round 2: twenty "No workers" over a freshly taken town.)
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
    this.go = go;
    for (const b of [town.keep, ...town.buildings]) b.badged = false;
    const groups = new Map();
    for (const [b, why] of stuck) {
      b.badged = true;
      const k = stuckKind(why);
      if (!groups.has(k.key)) groups.set(k.key, Object.assign([], { kind: k }));
      groups.get(k.key).push(b);
    }
    this.groups = groups;
    // Past a few badges only the one under the pointer shows; the strip carries the rest.
    const crowded = stuck.length > MANY;
    const under = crowded ? this.held && stuck.find(([b]) => b === this.held)?.[0] || (hoverAt && stuck.map(([b]) => b).filter(b => Math.hypot(b.x - hoverAt.x, b.z - hoverAt.z) < (b.B.radius || 4) + 1.5).sort((p, q) => Math.hypot(p.x - hoverAt.x, p.z - hoverAt.z) - Math.hypot(q.x - hoverAt.x, q.z - hoverAt.z))[0]) : null;
    const shown = stuck.filter(([b]) => !crowded || b === under).map(([b, why]) => [b, b, badge(stuckKind(why), why), 'stuck']);
    // The one priority wears a flag in the same round badge, in the accent colour; its words are on hover.
    const P = town.priority;
    if (P && !P.removed && !town.hostile && town.prioText) shown.push([PRIO, P, badge({ icon: 'flag', prio: true }, `⚑ ${town.prioText}`), 'stuck prio']);
    for (const [key, b, html, cls] of shown) {
      const p = screen(b.x, town.heightAt(b.x, b.z) + (b.B.radius || 4) * 1.4 + 3, b.z);
      if (!p) continue;
      let tag = this.tags.get(key);
      if (!tag) {
        tag = document.createElement('div');
        tag.addEventListener('mouseenter', () => { this.held = b; });
        tag.addEventListener('mouseleave', () => { if (this.held === b) this.held = null; });
        tag.addEventListener('click', () => this.go?.(b));
        this.el.appendChild(tag); this.tags.set(key, tag);
      }
      if (tag.dataset.html !== html) { tag.dataset.html = html; tag.innerHTML = html; }
      // Compared apart from 'shy', which the loop below owns: resetting it each frame restarted its fade, so a hidden badge never faded out.
      if (tag.dataset.cls !== cls) { tag.dataset.cls = cls; tag.className = cls + (tag.classList.contains('shy') ? ' shy' : ''); }
      tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      seen.add(key);
    }
    for (const [b, tag] of this.tags) if (!seen.has(b)) { tag.remove(); this.tags.delete(b); }
    // A badge under a panel, card or news line is hidden rather than drawn over it.
    const boxes = panelBoxes();
    for (const tag of this.tags.values()) {
      const r = tag.getBoundingClientRect(), hit = boxes.some(q => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
      tag.classList.toggle('shy', hit);
    }
    this.showStrip(stuck.length > FEW ? groups : null, boxes);
    this.showTip(town, hoverAt, placing, screen, roadFrom);
  }

  // The strip: one icon and a count per kind of trouble, red ones first, under the stock panel (or the
  // top bar when that is folded away). A click looks at the next building of that kind.
  showStrip(groups, boxes = []) {
    const el = this.strip;
    el.hidden = !groups;
    if (!groups) return;
    const list = [...groups].sort((p, q) => !!q[1].kind.bad - !!p[1].kind.bad || q[1].length - p[1].length);
    const html = list.map(([k, g]) => `<button class="tbadge chip${g.kind.bad ? ' bad' : ''}" data-k="${k}" title="${g.length} ${g.length > 1 ? 'places' : 'place'}: ${[...new Set(g.map(b => b.status.toLowerCase()))].slice(0, 2).join('; ')}. Click to look at ${g.length > 1 ? 'each' : 'it'}">${ico(g.kind.icon)}<b>${g.length}</b></button>`).join('');
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    const o = this.el.getBoundingClientRect(), rect = id => { const n = document.getElementById(id); return n && n.getClientRects().length ? n.getBoundingClientRect() : null; };
    const s = rect('stock'), t = rect('top'), bd = rect('build');
    el.style.maxWidth = Math.max(120, (s ? s.width : 200)) + 'px';
    const w = el.offsetWidth, h = el.offsetHeight;
    // Under the stock panel, else beside it, else above the build panel: the first spot that covers nothing.
    const spots = [[s ? s.left : 8, (s ? s.bottom : t ? t.bottom : 0) + 6], s && [s.right + 6, s.top], bd && [bd.left, bd.top - h - 6]].filter(Boolean);
    const free = ([x, y]) => x >= 0 && y >= 0 && x + w <= innerWidth && y + h <= innerHeight && !boxes.some(q => x < q.right && x + w > q.left && y < q.bottom && y + h > q.top);
    const [x, y] = spots.find(free) || spots[0];
    el.style.transform = `translate(${Math.round(x - o.left)}px, ${Math.round(y - o.top)}px)`;
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
