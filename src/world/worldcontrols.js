// The world map camera and mouse: click an army or place to select it, right-click
// a place to send the selected army there, double-click one of your villages to enter.
import { WORLD_HALF } from './worldview.js';

export class WorldControls {
  constructor(camera, dom, view, hooks) {
    Object.assign(this, { camera, dom, view, hooks });
    this.enabled = false;
    this.keys = new Set();
    this.cam = { x: 0, z: 260, dist: 520, yaw: 0 };
    this.drag = null;
    const on = fn => e => { if (this.enabled) fn(e); };
    dom.addEventListener('mousedown', on(e => this.onDown(e)));
    addEventListener('mousemove', on(e => this.onMove(e)));
    addEventListener('mouseup', on(e => this.onUp(e)));
    dom.addEventListener('dblclick', on(e => this.onDouble(e)));
    dom.addEventListener('wheel', on(e => this.onWheel(e)), { passive: false });
    addEventListener('keydown', on(e => this.onKey(e, true)));
    addEventListener('keyup', on(e => this.onKey(e, false)));
    addEventListener('blur', () => this.keys.clear());
  }

  update(dt) {
    const c = this.cam, k = this.keys, pan = c.dist * 0.9 * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    if (k.has('w') || k.has('arrowup')) { c.x += fx * pan; c.z += fz * pan; }
    if (k.has('s') || k.has('arrowdown')) { c.x -= fx * pan; c.z -= fz * pan; }
    if (k.has('a') || k.has('arrowleft')) { c.x -= rx * pan; c.z -= rz * pan; }
    if (k.has('d') || k.has('arrowright')) { c.x += rx * pan; c.z += rz * pan; }
    if (k.has('q')) c.yaw += dt * 1.6;
    if (k.has('e')) c.yaw -= dt * 1.6;
    c.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, c.x));
    c.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, c.z));
    const t = (c.dist - 80) / (900 - 80);
    const pitch = 0.5 + t * 0.6;
    const h = this.view.heightAt, ty = h(c.x, c.z), cp = Math.cos(pitch) * c.dist;
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp, ty + Math.sin(pitch) * c.dist, c.z + Math.cos(c.yaw) * cp);
    const ground = h(this.camera.position.x, this.camera.position.z) + 5;
    if (this.camera.position.y < ground) this.camera.position.y = ground;
    this.camera.lookAt(c.x, ty, c.z);
  }

  lookAt(p) { this.cam.x = p.x; this.cam.z = p.z + 60; }

  local(e) { const r = this.dom.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  onWheel(e) {
    e.preventDefault();
    this.cam.dist = Math.max(80, Math.min(900, this.cam.dist * Math.pow(1.0015, e.deltaY)));
  }

  onKey(e, down) {
    const key = e.key.toLowerCase();
    if (down) this.keys.add(key); else this.keys.delete(key);
    if (!down) return;
    if (key === ' ') { e.preventDefault(); this.hooks.togglePause(); }
    if (key === 'escape') this.hooks.select(null);
    if (['1', '2', '3'].includes(key)) this.hooks.setSpeed([1, 2, 4][+key - 1]);
  }

  onDown(e) {
    // Left drag pans the map, middle drag turns it; a click without moving selects.
    if (e.button === 0) this.drag = { kind: 'pan', x: e.clientX, y: e.clientY, cx: this.cam.x, cz: this.cam.z, moved: false };
    if (e.button === 1) { e.preventDefault(); this.drag = { kind: 'rotate', x: e.clientX, yaw: this.cam.yaw, moved: true }; }
    if (e.button === 2) {
      const hit = this.view.pick(...this.local(e));
      if (hit && hit.kind === 'place') this.hooks.order(hit.it);
    }
  }

  onMove(e) {
    const d = this.drag;
    if (!d) {
      const hit = e.target === this.dom ? this.view.pick(...this.local(e)) : null;
      this.dom.style.cursor = hit ? 'pointer' : 'default';
      return;
    }
    if (d.kind === 'rotate') { this.cam.yaw = d.yaw - (e.clientX - d.x) * 0.006; return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 5) d.moved = true;
    if (!d.moved) return;
    const k = this.cam.dist / 700, c = this.cam;
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    c.x = d.cx - (rx * dx - fx * dy) * k;
    c.z = d.cz - (rz * dx - fz * dy) * k;
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || e.button !== 0) return;
    const hit = this.view.pick(...this.local(e));
    this.hooks.select(hit ? hit.it : null);
  }

  onDouble(e) {
    const hit = this.view.pick(...this.local(e));
    if (hit && hit.kind === 'place') this.hooks.enter(hit.it);
  }
}
