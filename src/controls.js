// Camera rig and mouse/keyboard orders, in the familiar battle-RTS scheme:
// left click or drag to select, right click to move or attack, right drag to set a front line.
import * as THREE from 'three';
import { pickGround, HALF } from './terrain.js';
import { FORMATIONS } from './battle.js';

// Shift, or Cmd / Ctrl, adds to the selection (or takes a regiment back out of it).
const adding = e => e.shiftKey || e.metaKey || (e.ctrlKey && !/Mac/.test(navigator.platform));

export class Controls {
  constructor(camera, dom, battle, view, heightAt, hooks) {
    Object.assign(this, { camera, dom, battle, view, heightAt, hooks });
    this.enabled = true;       // several maps can each have controls; only the one on screen listens
    this.selection = new Set();
    this.keys = new Set();
    // Start behind the player's army, looking toward the enemy.
    this.cam = { x: 0, z: 118, dist: 115, yaw: 0 };
    this.raycaster = new THREE.Raycaster();
    this.mouse = { x: 0, y: 0 };
    this.drag = null;
    this.boxEl = document.getElementById('select-box');
    this.bind();
  }

  bind() {
    const el = this.dom;
    const on = fn => e => { if (this.enabled) fn(e); };
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mousedown', on(e => this.onDown(e)));
    addEventListener('mousemove', on(e => this.onMove(e)));
    addEventListener('mouseup', on(e => this.onUp(e)));
    el.addEventListener('wheel', on(e => this.onWheel(e)), { passive: false });
    addEventListener('keydown', on(e => this.onKey(e, true)));
    addEventListener('keyup', on(e => this.onKey(e, false)));
    addEventListener('blur', () => this.keys.clear());
  }

  // ---- camera ----

  update(dt) {
    const c = this.cam;
    const pan = c.dist * 0.9 * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) { c.x += fx * pan; c.z += fz * pan; }
    if (k.has('s') || k.has('arrowdown')) { c.x -= fx * pan; c.z -= fz * pan; }
    if (k.has('a') || k.has('arrowleft')) { c.x -= rx * pan; c.z -= rz * pan; }
    if (k.has('d') || k.has('arrowright')) { c.x += rx * pan; c.z += rz * pan; }
    if (k.has('q')) c.yaw += dt * 1.6;
    if (k.has('e')) c.yaw -= dt * 1.6;
    c.x = Math.max(-HALF - 40, Math.min(HALF + 40, c.x));
    c.z = Math.max(-HALF - 40, Math.min(HALF + 40, c.z));
    // Low and raking up close, near top-down when zoomed out to read the whole field.
    const t = (c.dist - 18) / (420 - 18);
    const pitch = 0.32 + t * 0.85;
    const ty = this.heightAt(c.x, c.z);
    const cp = Math.cos(pitch) * c.dist;
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp, ty + Math.sin(pitch) * c.dist, c.z + Math.cos(c.yaw) * cp);
    const ground = this.heightAt(this.camera.position.x, this.camera.position.z) + 3;
    if (this.camera.position.y < ground) this.camera.position.y = ground;
    this.camera.lookAt(c.x, ty + 1.5, c.z);
  }

  focus(regs) {
    const list = [...regs].filter(r => !r.gone);
    if (!list.length) return;
    this.cam.x = list.reduce((n, r) => n + r.cx, 0) / list.length;
    this.cam.z = list.reduce((n, r) => n + r.cz, 0) / list.length;
    this.cam.dist = Math.min(this.cam.dist, 90);
  }

  onWheel(e) {
    e.preventDefault();
    const c = this.cam, before = c.dist;
    c.dist = Math.max(18, Math.min(420, c.dist * Math.pow(1.0015, e.deltaY)));
    // Zoom in toward whatever is under the cursor.
    if (c.dist < before) {
      const g = this.groundAt(e.clientX, e.clientY);
      if (g) { const f = 1 - c.dist / before; c.x += (g.x - c.x) * f; c.z += (g.z - c.z) * f; }
    }
  }

  onKey(e, down) {
    if (e.target.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (down) this.keys.add(key); else this.keys.delete(key);
    if (!down) return;
    if (key === 'enter' && this.battle.deploying) { document.querySelector('#deploy .go')?.click(); return; }
    if (key === ' ') { e.preventDefault(); this.hooks.togglePause(); }
    if (key === 'h') this.battle.orderHalt([...this.selection]);
    if (key === 'f') this.focus(this.selection);
    if (key === 'escape') document.body.classList.remove('mining');
    if (key === 'escape' && !this.hooks.cancelPlacement?.()) this.setSelection([]);
    if (key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this.keys.delete('a');
      this.setSelection(this.battle.regs.filter(r => r.side === 0 && !r.gone));
    }
    if (['1', '2', '3'].includes(key)) this.hooks.setSpeed([1, 2, 4][+key - 1]);
    if (!e.metaKey && !e.ctrlKey) this.command(key);
  }

  // Battle commands for the selected regiments: formations, charge, hold, fire at will.
  command(key) {
    const sel = [...this.selection], b = this.battle;
    if (!sel.length) return false;
    const f = Object.entries(FORMATIONS).find(([, F]) => F.key === key);
    if (f) b.setFormation(sel, f[0]);
    else if (key === 'c') b.orderCharge(sel);
    else if (key === 'g') b.setHold(sel, !sel.every(r => r.hold));
    else if (key === 'r') b.setFireAtWill(sel, !sel.every(r => r.fireAtWill));
    else if (key === 'u' && b.walls.any) {
      const m = b.heardMine(0, sel[0].cx, sel[0].cz);
      if (m) b.orderCounterMine(sel, m);
      else document.body.classList.toggle('mining');
    }
    else if (key === 'b' && b.river) {
      const br = sel.map(r => b.bridgeNear(r.cx, r.cz, 60)).find(Boolean);
      if (!br) return false;
      b.orderBurnBridge(sel, br);
    }
    else return false;
    this.hooks.commandsChanged?.();
    return true;
  }

  // ---- picking ----

  rayAt(x, y) {
    const rect = this.dom.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), this.camera);
    return this.raycaster.ray;
  }

  groundAt(x, y) {
    const g = pickGround(this.rayAt(x, y), this.heightAt);
    if (g) g.y = this.heightAt(g.x, g.z);
    return g;
  }

  // The wall, tower or gate under the cursor, if the ray meets one before the ground.
  structAt(x, y) {
    const W = this.battle.walls;
    if (!W.any) return null;
    const ray = this.rayAt(x, y), p = ray.origin.clone(), dir = ray.direction;
    for (let t = 0; t < 900; t += 0.6) {
      p.copy(ray.origin).addScaledVector(dir, t);
      const ground = this.heightAt(p.x, p.z);
      if (p.y < ground) return null;
      if (p.y > ground + 14) continue;
      const s = W.towerAt(p.x, p.z, null, 0) || W.pieceAt(p.x, p.z, null, 0)?.piece;
      if (!s) continue;
      const top = s.kind === 'tower' ? s.base + s.M.towerTop + 1.5 : s.base + (s.state === 'broken' ? 1.5 : s.M.height);
      if (p.y <= top) return { struct: s, x: p.x, z: p.z };
    }
    return null;
  }

  toScreen(v) {
    const rect = this.dom.getBoundingClientRect();
    const p = v.clone().project(this.camera);
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, behind: p.z > 1 };
  }

  // Banners are easiest to hit when zoomed out; soldiers when zoomed in.
  regAt(x, y) {
    let best = null, bd = 22 * 22;
    for (const r of this.battle.regs) {
      if (r.gone) continue;
      const p = this.toScreen(this.view.bannerPos(r));
      if (p.behind) continue;
      const d = (p.x - x) ** 2 + (p.y - 14 - y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    if (best) return best;
    const g = this.groundAt(x, y);
    if (!g) return null;
    let near = null, nd = 3 * 3;
    for (const s of this.battle.soldiers) {
      if (!s.alive || s.gone) continue;
      const d = (s.x - g.x) ** 2 + (s.z - g.z) ** 2;
      if (d < nd) { nd = d; near = s; }
    }
    return near && near.reg;
  }

  onScreen(v) {
    const p = this.toScreen(v), rect = this.dom.getBoundingClientRect();
    return !p.behind && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
  }

  setSelection(regs, add = false) {
    if (!add) this.selection.clear();
    for (const r of regs) if (r.side === 0 && !r.gone) this.selection.add(r);
    this.hooks.selectionChanged(this.selection);
  }

  // ---- mouse ----

  // Optional hooks for maps with buildings: place(ground) while placing,
  // cancelPlacement(), hover(ground), pickBuilding(ground).
  onDown(e) {
    if (e.button === 2 && this.hooks.cancelPlacement?.()) { this.drag = null; return; }
    if (e.button === 0 && this.hooks.dragPlacing?.()) { this.drag = { kind: 'place', x: e.clientX, y: e.clientY, start: this.groundAt(e.clientX, e.clientY), moved: false }; return; }
    if (e.button === 0) this.drag = { kind: 'select', x: e.clientX, y: e.clientY, moved: false };
    if (e.button === 2) this.drag = { kind: 'order', x: e.clientX, y: e.clientY, start: this.groundAt(e.clientX, e.clientY), moved: false };
    if (e.button === 1) { e.preventDefault(); this.drag = { kind: 'rotate', x: e.clientX, y: e.clientY, yaw: this.cam.yaw }; }
  }

  onMove(e) {
    this.mouse = { x: e.clientX, y: e.clientY };
    const d = this.drag;
    if (!d && e.target === this.dom) this.hooks.hover?.(this.groundAt(e.clientX, e.clientY));
    if (!d) {
      const hover = e.target === this.dom ? this.regAt(e.clientX, e.clientY) : null;
      this.dom.style.cursor = hover && hover.side === 1 && this.selection.size ? 'crosshair' : hover && hover.side === 0 ? 'pointer' : 'default';
      return;
    }
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    if (d.kind === 'place') this.hooks.dragMove?.(d.start, this.groundAt(e.clientX, e.clientY));
    if (d.kind === 'rotate') this.cam.yaw = d.yaw - (e.clientX - d.x) * 0.006;
    if (d.kind === 'select' && d.moved) {
      const b = this.boxEl.style;
      b.display = 'block';
      b.left = Math.min(d.x, e.clientX) + 'px'; b.top = Math.min(d.y, e.clientY) + 'px';
      b.width = Math.abs(e.clientX - d.x) + 'px'; b.height = Math.abs(e.clientY - d.y) + 'px';
    }
    if (d.kind === 'order' && d.moved && d.start && this.selection.size) {
      const g = this.groundAt(e.clientX, e.clientY);
      if (g) {
        const line = this.lineOrder(d.start, g);
        this.view.preview = line ? this.battle.plannedSlots([...this.selection], ...line) : [];
      }
    }
  }

  // A right drag from A to B draws the front. Dragging left to right on screen faces away from the camera;
  // dragging right to left turns the line to face you.
  lineOrder(a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 4) return null;
    const angle = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    return [(a.x + b.x) / 2, (a.z + b.z) / 2, angle, len];
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'place') { this.hooks.dragEnd?.(d.start, this.groundAt(e.clientX, e.clientY), e); return; }
    if (d.kind === 'select') {
      this.boxEl.style.display = 'none';
      if (d.moved) {
        const x0 = Math.min(d.x, e.clientX), x1 = Math.max(d.x, e.clientX);
        const y0 = Math.min(d.y, e.clientY), y1 = Math.max(d.y, e.clientY);
        // A regiment is caught if its banner or any of its men are inside the box, not only
        // its middle: a long line needs only part of it boxed.
        const inBox = v => { const p = this.toScreen(v); return !p.behind && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1; };
        const v = new THREE.Vector3();
        const inside = this.battle.regs.filter(r => {
          if (r.side !== 0 || r.gone) return false;
          if (inBox(this.view.bannerPos(r)) || inBox(v.set(r.cx, this.heightAt(r.cx, r.cz), r.cz))) return true;
          return r.soldiers.some(s => s.alive && !s.gone && inBox(v.set(s.x, s.y ?? this.heightAt(s.x, s.z), s.z)));
        });
        this.setSelection(inside, adding(e));
      } else {
        if (this.hooks.place?.(this.groundAt(e.clientX, e.clientY), e)) return;
        const r = this.regAt(e.clientX, e.clientY);
        if (!r && this.hooks.pickBuilding?.(this.groundAt(e.clientX, e.clientY))) { this.setSelection([]); return; }
        // A second click on the same regiment straight after: all of its kind in view.
        const now = performance.now(), again = r && r === this.lastClick?.r && now - this.lastClick.t < 350;
        this.lastClick = { r, t: now };
        if (again && r.side === 0) { this.setSelection(this.battle.regs.filter(o => o.side === 0 && !o.gone && o.T.key === r.T.key && !this.toScreen(this.view.bannerPos(o)).behind && this.onScreen(this.view.bannerPos(o))), adding(e)); return; }
        if (r && r.side === 0 && adding(e) && this.selection.has(r)) { this.selection.delete(r); this.hooks.selectionChanged(this.selection); }
        else this.setSelection(r && r.side === 0 ? [r] : [], adding(e));
      }
    }
    if (d.kind === 'order') {
      this.view.preview = [];
      const sel = [...this.selection];
      if (!sel.length) return;
      const end = this.groundAt(e.clientX, e.clientY);
      if (d.moved && d.start && end) {
        const line = this.lineOrder(d.start, end);
        if (line) { this.battle.orderMove(sel, ...line); return; }
      }
      // Ladders, rams and engines go for an enemy wall even with its defenders standing on it.
      const hit = !d.moved && this.structAt(e.clientX, e.clientY);
      const target = hit && hit.struct.side !== 0 && sel.every(r => r.T.engine) ? null : this.regAt(e.clientX, e.clientY);
      if (target && target.side === 1) { this.battle.orderAttack(sel, target); return; }
      // Onto your own wall, or against the enemy's.
      const mining = document.body.classList.contains('mining');
      document.body.classList.remove('mining');
      if (hit && mining && hit.struct.side !== 0) { this.battle.orderMine(sel, hit.struct); return; }
      if (hit) {
        if (hit.struct.side === 0) this.battle.orderMan(sel, hit.struct, hit.x, hit.z);
        else this.battle.orderAttackWall(sel, hit.struct, hit.x, hit.z);
        return;
      }
      if (!end) return;
      // A plain click keeps the current frontages and faces along the direction of travel.
      const cx = sel.reduce((n, r) => n + r.cx, 0) / sel.length, cz = sel.reduce((n, r) => n + r.cz, 0) / sel.length;
      const far = Math.hypot(end.x - cx, end.z - cz) > 6;
      const angle = far ? Math.atan2(end.x - cx, end.z - cz) : sel[0].angle;
      this.battle.orderMove(sel, end.x, end.z, angle);
    }
  }
}
