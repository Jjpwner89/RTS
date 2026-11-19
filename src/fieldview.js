// Draws what battlefield.js puts on a field: the river's water and its bridges, which
// smoke and flame while they burn and leave charred posts behind.
import * as THREE from 'three';

export class FieldView {
  constructor(scene, battle) {
    this.scene = scene;
    this.battle = battle;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bridges = [];
    const R = battle.river;
    if (!R) return;
    this.drawWater(R);
    for (const b of R.bridges) this.bridges.push(this.drawBridge(R, b));
  }

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
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
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

  update(dt) {
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
