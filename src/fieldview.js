// Draws what battlefield.js puts on a field: the river's water and its bridges, which
// smoke and flame while they burn and leave charred posts behind; while an army deploys,
// the ground it may deploy on; and the weather: rain falling, or fog closing in.
import * as THREE from 'three';
import { waterMaterial } from './scenery.js';

export class FieldView {
  constructor(scene, battle) {
    this.scene = scene;
    this.battle = battle;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bridges = [];
    this.zone = null;
    this.weather = 'clear';
    this.rain = null;
    const R = battle.river;
    if (!R) return;
    this.drawWater(R);
    for (const b of R.bridges) this.bridges.push(this.drawBridge(R, b));
  }

  drawZone(D) { return drawDeployZone(this.group, this.battle, D); }

  // One ribbon of water along the river, at the level the channel was cut to.
  drawWater(R) {
    const pts = [], idx = [], colors = [];
    const deep = new THREE.Color('#3f6f86'), shallow = new THREE.Color('#6f9a95');
    const step = 3, X = 390;
    let row = 0;
    for (let x = -X; x <= X; x += step, row++) {
      const z = R.zAt(x), sl = R.slope(x), n = Math.sqrt(1 + sl * sl);
      const nx = -sl / n, nz = 1 / n;          // across the river
      const y = R.raw(x, z) - 0.55;
      const ford = R.fords.some(f => Math.abs(x - f.x) < f.half);
      const c = ford ? shallow : deep;
      for (const side of [-1, 1]) {
        pts.push(x + nx * side * (R.half + 0.6), y, z + nz * side * (R.half + 0.6));
        colors.push(c.r, c.g, c.b);
      }
      if (row > 0) { const a = (row - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, waterMaterial({ opacity: 0.85 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  drawBridge(R, b) {
    const g = new THREE.Group();
    const len = (R.half + 2) * 2, wide = b.half * 2, y = R.deckY(b);
    const wood = new THREE.MeshLambertMaterial({ color: '#7a5a3a' }), dark = new THREE.MeshLambertMaterial({ color: '#4d3a28' });
    const deck = new THREE.Group();
    const planks = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.3, len), wood);
    planks.position.y = -0.15;
    deck.add(planks);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, len), dark);
      rail.position.set(s * (wide / 2 - 0.1), 0.9, 0);
      deck.add(rail);
      for (let k = -2; k <= 2; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), dark);
        post.position.set(s * (wide / 2 - 0.1), 0.45, k * len / 5);
        deck.add(post);
      }
    }
    g.add(deck);
    // Piles stand in the water and outlast a fire.
    const piles = new THREE.Group();
    for (const s of [-1, 1]) for (const k of [-0.3, 0.3]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3, 6), dark);
      p.position.set(s * (wide / 2 - 0.4), -1.5, k * len);
      piles.add(p);
    }
    g.add(piles);
    g.position.set(b.x, y, R.zAt(b.x));
    g.rotation.y = -b.angle;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    // Flames and smoke while it burns.
    const fire = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85 });
    const smokeMat = new THREE.MeshLambertMaterial({ color: '#5a5550', transparent: true, opacity: 0.5 });
    const flames = [], smoke = [];
    for (let i = 0; i < 8; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 5), flameMat);
      f.position.set((Math.random() - 0.5) * wide, 0.9, (Math.random() - 0.5) * len);
      fire.add(f); flames.push(f);
      const sm = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), smokeMat);
      sm.userData.t = Math.random();
      sm.userData.x = f.position.x; sm.userData.z = f.position.z;
      fire.add(sm); smoke.push(sm);
    }
    fire.visible = false;
    g.add(fire);
    return { b, g, deck, fire, flames, smoke, planks, wood, state: 'up' };
  }

  // Greyer sky, closer fog and duller light for the battle's weather; rain falls around
  // wherever the camera looks.
  setWeather(kind) {
    const scene = this.scene;
    if (!this.clearSky) {
      this.clearSky = { bg: scene.background, fog: scene.fog && { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far }, lights: [] };
      scene.traverse(o => { if (o.isLight) this.clearSky.lights.push([o, o.intensity]); });
    }
    const C = this.clearSky;
    const look = { clear: null, rain: { sky: '#8d969c', near: 90, far: 480, light: 0.72 }, fog: { sky: '#c4c8c4', near: 20, far: 200, light: 0.85 },
      night: { sky: '#161d2b', near: 40, far: 320, light: 0.16 } }[kind];
    const sky = look ? new THREE.Color(look.sky) : null;
    scene.background = sky || C.bg;
    if (C.fog && scene.fog) {
      scene.fog.color.copy(sky || C.fog.color);
      scene.fog.near = look ? look.near : C.fog.near;
      scene.fog.far = look ? look.far : C.fog.far;
    }
    for (const [l, i] of C.lights) l.intensity = i * (look ? look.light : 1);
    if (kind === 'rain' && !this.rain) this.rain = this.makeRain();
    if (this.rain) this.rain.visible = kind === 'rain';
    this.weather = kind;
  }

  makeRain() {
    const N = 3500, W = 180, Hh = 70;
    const pos = new Float32Array(N * 6);
    const drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { drops[i * 3] = (Math.random() - 0.5) * W; drops[i * 3 + 1] = Math.random() * Hh; drops[i * 3 + 2] = (Math.random() - 0.5) * W; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#c8d2da', transparent: true, opacity: 0.45, depthWrite: false }));
    lines.frustumCulled = false;
    const H = this.battle.heightAt;
    // Centred each frame on the ground where the camera looks.
    lines.onBeforeRender = (renderer, scene, camera) => {
      const dir = camera.getWorldDirection(new THREE.Vector3()), c = camera.position;
      const t = dir.y < -0.05 ? Math.min(400, (c.y - H(c.x, c.z)) / -dir.y) : 120;
      lines.position.set(c.x + dir.x * t, H(c.x + dir.x * t, c.z + dir.z * t), c.z + dir.z * t);
      lines.updateMatrixWorld();
    };
    lines.userData = { drops, N, Hh };
    this.group.add(lines);
    return lines;
  }

  updateRain(dt) {
    const { drops, N, Hh } = this.rain.userData, pos = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      let y = drops[i * 3 + 1] - dt * 28;
      if (y < 0) y += Hh;
      drops[i * 3 + 1] = y;
      const x = drops[i * 3], z = drops[i * 3 + 2];
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x - 0.15; pos[i * 6 + 4] = y + 1.4; pos[i * 6 + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    if (this.battle.weather !== this.weather) this.setWeather(this.battle.weather);
    if (this.rain?.visible) this.updateRain(dt);
    const D = this.battle.deploying;
    if (D && D.side === this.battle.viewer && !this.zone) this.zone = this.drawZone(D);
    if (this.zone && !D) {
      this.group.remove(this.zone);
      this.zone.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      this.zone = null;
    }
    for (const v of this.bridges) {
      const { b } = v;
      v.fire.visible = b.state === 'up' && b.burning > 0;
      if (v.fire.visible) {
        const t = this.battle.time;
        v.flames.forEach((f, i) => { f.scale.setScalar(0.7 + 0.4 * Math.abs(Math.sin(t * 7 + i * 1.7))); });
        for (const sm of v.smoke) {
          sm.userData.t = (sm.userData.t + dt * 0.35) % 1;
          const k = sm.userData.t;
          sm.position.set(sm.userData.x, 1.5 + k * 9, sm.userData.z + k * 2);
          sm.scale.setScalar(0.6 + k * 2.2);
        }
        // Charring as it goes.
        v.wood.color.setStyle('#7a5a3a').lerp(new THREE.Color('#2a2420'), 1 - Math.max(0, b.hp) / b.maxHp);
      }
      if (b.state !== v.state) {
        v.state = b.state;
        v.deck.visible = b.state === 'up';
      }
    }
  }
}

// A faint gold sheet laid over the deployment ground, with a brighter edge.
export function drawDeployZone(group, battle, D) {
  const H = (x, z) => battle.heightAt(x, z) + 0.35;
  const g = new THREE.Group();
  // The zone is laid out in its own frame (turned toward a storm's road); map it to the ground.
  const W = (lx, lz) => battle.zoneToWorld(lx, lz);
  const nx = Math.max(2, Math.ceil((D.x1 - D.x0) / 6)), nz = Math.max(2, Math.ceil((D.z1 - D.z0) / 6));
  const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const { x, z } = W(D.x0 + (pos.getX(i) + 0.5) * (D.x1 - D.x0), D.z0 + (pos.getY(i) + 0.5) * (D.z1 - D.z0));
    pos.setXYZ(i, x, H(x, z), z);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd970', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false })));
  const edge = [];
  const run = (xa, za, xb, zb) => {
    const n = Math.ceil(Math.hypot(xb - xa, zb - za) / 3);
    for (let i = 0; i < n; i++) { const { x, z } = W(xa + (xb - xa) * i / n, za + (zb - za) * i / n); edge.push(new THREE.Vector3(x, H(x, z) + 0.1, z)); }
  };
  run(D.x0, D.z0, D.x1, D.z0); run(D.x1, D.z0, D.x1, D.z1); run(D.x1, D.z1, D.x0, D.z1); run(D.x0, D.z1, D.x0, D.z0);
  g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: '#ffd970', transparent: true, opacity: 0.8, fog: false })));
  group.add(g);
  return g;
}
