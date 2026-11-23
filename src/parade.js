// The victory march (creator, 2026-11-22, after Varn's walled seat yielded and the army walked in as a blob: "I want
// them to look sick as they parade in in victory"). An army taking a place (world.js capture and treat, through
// economy.js addTroops) marches onto its ground (economy.js formUp) in good order: every regiment in column, its
// standard up, the whole host keeping its places and one steady pace, the slowest regiment's walk, MARCH metres
// in from the road's side. Each column halts on its ground facing the keep, opens out into its line, and cheers
// rank by rank with weapons raised; the army cheers aloud (audio.js), a fanfare as it sets off. It is all over in
// about SHOW seconds however big the host, since the regiments march together, not one after another.
//
// The army waits in column till the place is first on screen (BattleView.update marks it seen), or WAIT seconds.
// Any order to one of its regiments, or an enemy at the place, ends it at once for all of them. A regiment whose
// way in crosses a wall stands on its ground from the start. The state is battle.parade (null when there is none),
// not saved: a save made during the march keeps each regiment where it stands, in its own line (save.js).
import * as THREE from 'three';

export const SHOW = 15, WAIT = 60, CHEER_FOR = 2.6667;
const MARCH = 18;   // metres: how far each column marches in (about eleven seconds at a foot soldier's walk)
const live = s => s.alive && !s.gone;
const depthOf = r => r.T.depth || r.T.spacing;
// How deep a regiment stands in `files` files.
const deep = (r, files) => (Math.ceil(r.alive / files) - 1) * depthOf(r) + 1;

// Lines `regs` (just added by road at `angle`, each with its ground in r.dest from formUp) up MARCH metres out from
// their ground, waiting to march in. Each turns to face the keep: its ground is the same block, the front now its
// inner edge (formUp's lines face out along the road, ranks behind). Its column is as narrow as it can be without
// reaching the line behind it (formUp leaves a few strides between lines), at least three files. Engines and
// regiments without ground go as they would have.
export function lineUp(town, regs, angle) {
  const B = town.battle;
  regs = regs.filter(r => !r.gone && r.dest && !r.T.engine);
  if (!regs.length) return;
  // (a second body on the same road, as a bought place's garrison and the army that bought it, joins the first)
  let P = B.parade;
  if (P && (P.start != null || P.angle !== angle)) return;
  const sin = Math.sin(angle), cos = Math.cos(angle), face = angle + Math.PI;
  P ||= B.parade = { angle, sin, cos, made: B.time, start: null, seen: false, show: true, cheers: 0, at: null, list: [], pace: Infinity };
  P.pace = Math.min(P.pace, ...regs.map(r => B.gaitPace(r) * B.paceOf(r)));
  for (const r of regs) {
    const stand = r.dest, back = deep(r, r.files);
    const ground = { x: stand.x - sin * (back - 1), z: stand.z - cos * (back - 1), angle: face };
    const cf = Math.min(r.files, Math.max(3, Math.ceil(r.alive / (Math.floor((back + 4) / depthOf(r)) + 1))));
    const from = { x: ground.x + sin * MARCH, z: ground.z + cos * MARCH };
    // its way in, every few metres, clear of walls (gates included: a column doesn't march through a gatehouse)
    const clear = [0, 0.25, 0.5, 0.75, 1].every(k => !B.walls.pieceAt(from.x + (ground.x - from.x) * k, from.z + (ground.z - from.z) * k, null, 2 + (cf - 1) * r.T.spacing / 2));
    const e = { r, cf: clear ? cf : r.files, files: r.files, hurry: r.hurry, ground, want: null, stage: clear ? 'wait' : 'done', bearer: null };
    P.list.push(e);
    const p = clear ? from : ground;
    Object.assign(r, { x: p.x, z: p.z, cx: p.x, cz: p.z, angle: face, files: e.cf, dest: null, via: null });
    for (const s of r.soldiers) {
      if (!live(s) || s.captain) continue;
      const q = B.slotPos(r, s.slot);
      s.x = s.lx = q.x; s.z = s.lz = q.z; s.y = B.heightAt(s.x, s.z); s.yaw = face; s.vx = s.vz = s.v = 0;
    }
  }
  if (P.list.every(e => e.stage === 'done')) B.parade = null;
}

// Each step of the place (economy.js update).
export function stepParade(town) {
  const B = town.battle, P = B.parade;
  if (!P) return;
  if (town.underAttack || town.hostile) return endParade(B);
  if (P.list.some(e => ordered(e))) return endParade(B);
  if (P.start == null) {
    if (P.seen || B.time - P.made > WAIT) begin(B, P);
    return;
  }
  if (P.show && B.time - P.start > SHOW) P.show = false;
  for (const e of P.list) {
    if (e.stage === 'march' && !e.r.dest) { settle(B, e); hurrah(B, P, e); }
    if (P.show) for (const s of e.r.soldiers) if (s.cheerDue != null && B.time >= s.cheerDue && live(s)) { s.cheerAt = B.time; s.cheerDue = null; }
  }
  if (P.list.every(e => e.stage === 'done') && (!P.show || P.list.every(e => e.r.soldiers.every(s => s.cheerDue == null)))) B.parade = null;
}

// Off together at one pace: each regiment walks the slowest one's walk.
function begin(B, P) {
  P.start = B.time;
  for (const e of P.list) {
    const r = e.r;
    if (e.stage !== 'wait') continue;
    r.hurry = (r.hurry || 1) * P.pace / (B.gaitPace(r) * B.paceOf(r));
    r.dest = e.want = { ...e.ground };
    e.stage = 'march';
  }
}

// An order to the regiment, or anything else that moved it, since the parade sent it (a regiment that has just
// reached where it was sent has its dest cleared by the battle: that is no order).
function ordered(e) {
  const r = e.r;
  if (e.stage === 'done') return false;
  if (r.gone || r.routing || r.targetReg || r.targetWall) return true;
  if (r.dest === e.want) return false;
  return !(r.dest === null && e.want && Math.hypot(r.x - e.want.x, r.z - e.want.z) < 3);
}

// On its ground: the column opens out into its line.
function settle(B, e) {
  const r = e.r;
  e.stage = 'done';
  if (r.files === e.cf) r.files = e.files;
  r.hurry = e.hurry;
  if (!r.gone) B.assignSlots(r);
}

// Ended early: an order, an enemy at the place. A regiment that was given an order keeps it; the rest go straight
// to their ground, in their own lines.
export function endParade(B) {
  const P = B.parade;
  if (!P) return;
  B.parade = null;
  for (const e of P.list) {
    for (const s of e.r.soldiers) s.cheerDue = null;
    if (e.stage === 'done') continue;
    const r = e.r, mine = !ordered(e);
    settle(B, e);
    if (mine && !r.gone) r.dest = { ...e.ground };
  }
}

// Halted on its ground, a regiment cheers from its front rank back, a rank every fifth of a second, while the show
// lasts: each man raises his weapon (view.js reads s.cheerAt), and the cry goes up (audio.js reads P.cheers).
function hurrah(B, P, e) {
  if (!P.show) return;
  const men = e.r.soldiers.filter(s => live(s) && !s.captain);
  if (!men.length) return;
  P.cheers++; P.at = { x: e.r.x, z: e.r.z };
  const files = Math.max(1, Math.min(e.r.files, men.length));
  for (const s of men) s.cheerDue = B.time + Math.floor(s.slot / files) * 0.2 + Math.random() * 0.25;
}

// ---- standards ----

// Each regiment's standard, carried beside the man at the middle of its front rank: a pole with a crossbar and its
// banner hanging from it (the same banner as over its regiment: view.js bannerTexture), swinging as he walks. Up
// while the show lasts (P.show).
// (larger than life, as the banners over the regiments are, to read at the distance you watch from)
const POLE = new THREE.CylinderGeometry(0.05, 0.06, 6, 6).translate(0, 3, 0);
const BAR = new THREE.BoxGeometry(1.7, 0.07, 0.07).translate(0, 5.8, 0);
const CLOTH = new THREE.PlaneGeometry(1.5, 1.875).translate(0, -0.9375, 0);
const WOOD = new THREE.MeshLambertMaterial({ color: '#5a4030' });

export class Standards {
  constructor(scene, view) {
    this.scene = scene;
    this.view = view;
    this.up = new Map();   // parade entry → its standard
  }

  update(b) {
    const P = b.parade, want = new Set(P?.show ? P.list.filter(e => !e.r.gone) : []);
    for (const [e, g] of this.up) if (!want.has(e)) { this.scene.remove(g); g.userData.cloth.material.map.dispose(); g.userData.cloth.material.dispose(); this.up.delete(e); }
    for (const e of want) {
      let g = this.up.get(e);
      if (!g) {
        g = new THREE.Group();
        g.add(new THREE.Mesh(POLE, WOOD), new THREE.Mesh(BAR, WOOD));
        const cloth = new THREE.Mesh(CLOTH, new THREE.MeshLambertMaterial({ map: this.view.bannerTextures(e.r)[0], alphaTest: 0.5, side: THREE.DoubleSide }));
        cloth.position.y = 5.78;
        g.add(cloth);
        g.userData = { cloth, phase: Math.random() * 6 };
        this.scene.add(g);
        this.up.set(e, g);
      }
      const r = e.r;
      if (!e.bearer || !live(e.bearer)) {
        const men = r.soldiers.filter(s => live(s) && !s.captain);
        e.bearer = men.find(s => s.slot === Math.floor(Math.min(r.files, men.length) / 2)) || men[0];
      }
      const s = e.bearer;
      if (!s) { g.visible = false; continue; }
      g.visible = true;
      // in his right hand (the figure's -x), a little ahead; a rider's higher
      const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw), walking = s.v > 0.4;
      g.position.set(s.x - cos * 0.32 + sin * 0.15, s.y + (r.T.mounted ? 1.25 : 0.35) + (walking ? Math.abs(Math.sin(s.phase)) * 0.06 : 0), s.z + sin * 0.32 + cos * 0.15);
      // its bar along the march, so the banner shows broadside to the road's sides (where you watch it from),
      // swinging a little on its bar as he walks
      g.rotation.y = s.yaw + Math.PI / 2;
      const t = b.time * 2.2 + g.userData.phase;
      g.userData.cloth.rotation.x = Math.sin(t) * (walking ? 0.12 : 0.05);
    }
  }
}
