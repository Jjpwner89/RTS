// Battle AI. In the field: advance as a line, then pick fights by unit type. At walls:
// attackers bring up engines and ladders and storm where the walls are weak; defenders
// man the walls, answer each ladder and sally out against engines.
// It thinks once a second, like a general sending runners rather than micromanaging.

const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cz - b.cz);
const nearest = (r, list) => list.reduce((best, o) => (!best || dist(r, o) < dist(r, best) ? o : best), null);
const usable = r => !r.gone && !r.routing && !r.regrouping;
const centroid = list => ({ cx: list.reduce((n, r) => n + r.cx, 0) / list.length, cz: list.reduce((n, r) => n + r.cz, 0) / list.length });

// hold: wait for the enemy to come within reach instead of marching out, as a garrison does.
// regs: only command these regiments (e.g. one attacking host among several).
export function thinkAI(battle, side, { hold = false, start = 8, regs = null } = {}) {
  if (battle.time < start || battle.winner !== null) return;
  const mine = (regs || battle.regs).filter(r => r.side === side && usable(r));
  if (!mine.length) return;
  const walls = battle.walls;
  if (walls.any) {
    const theirs = walls.structures().some(s => s.side !== side && s.state === 'up');
    const ours = walls.structures().some(s => s.side === side && s.state === 'up');
    if (theirs) return thinkSiegeAttack(battle, side, { regs: mine });
    if (ours) return thinkSiegeDefence(battle, side, { regs: mine });
  }
  thinkField(battle, side, mine, { hold });
}

function thinkField(battle, side, mine, { hold = false } = {}) {
  const foes = battle.regs.filter(r => r.side !== side && !r.gone);
  const standing = foes.filter(r => !r.routing && !r.regrouping);
  if (!standing.length) return;

  // Until the lines are close, march forward together and keep formation.
  const gap = Math.min(...mine.map(r => dist(r, nearest(r, standing))));
  if (gap > 75) {
    if (hold) return;
    const f = centroid(standing);
    for (const r of mine) {
      if (r.dest || r.targetReg || r.posts || r.targetWall) continue;
      const ang = Math.atan2(f.cx - r.cx, f.cz - r.cz);
      r.dest = { x: r.x + Math.sin(ang) * 30, z: r.z + Math.cos(ang) * 30, angle: ang };
    }
    return;
  }
  for (const r of mine) pickFight(battle, r, foes, standing);
}

function pickFight(battle, r, foes, standing) {
  const current = r.targetReg && !r.targetReg.gone ? r.targetReg : null;
  // Men on walls can't be reached from the ground; leave them to the bows.
  const reachable = standing.filter(o => !o.posts || r.T.range);
  if (!reachable.length) return;
  let pick;
  if (r.T.range || r.engine?.range) {
    pick = nearest(r, reachable.filter(o => o.engaged === 0)) || nearest(r, reachable);
  } else if (r.T.charge) {
    // Horse rides down routers, then hunts archers and engines, then hits whoever is busiest from the side.
    const routers = foes.filter(o => o.routing && dist(r, o) < 90);
    const soft = reachable.filter(o => o.T.range || o.engine);
    const busy = reachable.filter(o => o.engaged > 0 && !o.T.braces);
    pick = nearest(r, routers) || nearest(r, soft) || nearest(r, busy) || nearest(r, reachable);
    if (pick && pick !== current && !routers.includes(pick)) {
      battle.orderAttack([r], pick);
      if (dist(r, pick) < 70) battle.orderCharge([r]);
      return;
    }
  } else {
    pick = nearest(r, reachable);
    if (current && !current.routing && !current.posts && dist(r, current) < dist(r, pick) + 25) pick = current;
  }
  if (pick && pick !== current) battle.orderAttack([r], pick);
}

// ---- sieges ----

// The inside of a side's walls, roughly: nearer its home than its nearest wall piece.
function wallRadius(battle, side) {
  const h = battle.fortHome(side);
  let near = Infinity;
  for (const p of battle.walls.pieces) if (p.side === side) near = Math.min(near, Math.hypot(p.x - h.x, p.z - h.z));
  return near;
}
const insideOf = (battle, side, x, z) => {
  const h = battle.fortHome(side);
  return Math.hypot(x - h.x, z - h.z) < wallRadius(battle, side) - 3;
};

// The attacking side. regs: the regiments to command. Phases: engines go first, ladders
// next; the foot wait out of bowshot until a way in exists, then go.
// prepare: still camped (a siege host building up), so only the engines work.
export function thinkSiegeAttack(battle, side, { regs = null, prepare = false } = {}) {
  const W = battle.walls, enemy = 1 - side;
  const mine = (regs || battle.regs.filter(r => r.side === side)).filter(usable);
  if (!mine.length) return;
  const home = battle.fortHome(enemy);
  const foes = battle.regs.filter(r => r.side === enemy && !r.gone);
  const standing = foes.filter(r => !r.routing && !r.regrouping);
  const army = centroid(mine);
  const pieces = W.pieces.filter(p => p.side === enemy && p.state === 'up');
  const towers = W.structures().filter(s => s.kind === 'tower' && s.side === enemy && s.state === 'up');
  const st = battle.siegeAI = battle.siegeAI || {};

  // Is there a way in? Broken stretches, a forced gate, or a ladder team on the walls.
  const open = W.pieces.some(p => p.side === enemy && (p.state === 'broken' || p.forced));
  const inside = open && battle.nav.reachable(side, army.cx, army.cz, home.x, home.z);
  const ladders = W.ladders.filter(l => l.side === side);

  // Where to break in: the stretch facing us, weighted toward the weakest.
  if (!st.breach || st.breach.state !== 'up' || st.breach.removed) {
    st.breach = W.weakest(enemy, { x: army.cx, z: army.cz });
  }
  const breach = st.breach;
  const gate = pieces.filter(p => p.gate).sort((a, b) => Math.hypot(a.x - army.cx, a.z - army.cz) - Math.hypot(b.x - army.cx, b.z - army.cz))[0];
  // Stand-off: out of bowshot from the walls, between our army and the breach.
  const target = breach || gate || { x: home.x, z: home.z };
  const tdx = army.cx - target.x, tdz = army.cz - target.z, td = Math.hypot(tdx, tdz) || 1;
  const stage = { x: target.x + tdx / td * 135, z: target.z + tdz / td * 135, angle: Math.atan2(-tdx, -tdz) };

  const engines = mine.filter(r => r.engine);
  const foot = mine.filter(r => !r.engine && !r.T.mounted && !r.T.range);
  const shooters = mine.filter(r => !r.engine && r.T.range);
  const horse = mine.filter(r => !r.engine && r.T.mounted);

  // Engines: rams on the gate, ladders against quiet stretches, throwers on towers then the breach.
  for (const r of engines) {
    const E = r.engine;
    if (E.kind === 'ram') {
      const t = gate || pieces.filter(p => p.material === 'wood').sort((a, b) => a.hp - b.hp)[0];
      if (t && r.targetWall !== t) battle.orderAttackWall([r], t, t.x, t.z);
    } else if (E.kind === 'ladder') {
      if (E.ladders.length || r.posts || prepare) continue;
      if (r.targetWall && r.targetWall.state === 'up') continue;
      const t = quietStretch(battle, enemy, army, pieces, gate);
      if (t) battle.orderAttackWall([r], t, t.x, t.z);
    } else if (E.range) {
      if (r.targetWall && r.targetWall.state === 'up' && !r.targetWall.removed && !(gate && gate.hp < gate.maxHp * 0.5 && r.targetWall !== gate)) continue;
      // Towers that cover the breach first, then the breach itself.
      // A gate already battered half down is the quickest way in.
      const weakGate = gate && gate.hp < gate.maxHp * 0.5 ? gate : null;
      const cover = breach ? towers.filter(t => Math.hypot(t.x - breach.x, t.z - breach.z) < 40) : towers;
      const t = weakGate || (E.kind === 'mangonel' && cover.sort((a, b) => a.hp - b.hp)[0]) || breach || gate;
      if (t) battle.orderAttackWall([r], t, t.x, t.z);
      else {
        const f = nearest(r, standing);
        if (f && r.targetReg !== f) battle.orderAttack([r], f);
      }
    }
  }
  if (prepare) {
    // Camped: everyone else waits at the stand-off, ready.
    for (const r of [...foot, ...shooters, ...horse]) if (!r.dest && !r.targetReg && dist(r, { cx: stage.x, cz: stage.z }) > 40) battle.orderMove([r], stage.x, stage.z, stage.angle);
    return;
  }

  // Bows: shoot the men on the walls near our ladders and breach, from just inside their range.
  for (const r of shooters) {
    if (r.targetReg && !r.targetReg.gone && r.targetReg.posts) continue;
    const onWalls = standing.filter(o => o.posts && o.T.range);
    const any = standing.filter(o => o.posts);
    const focus = ladders[0] || breach || gate;
    const pickFrom = (onWalls.length ? onWalls : any.length ? any : standing);
    const t = focus ? pickFrom.sort((a, b) => Math.hypot(a.cx - focus.x, a.cz - focus.z) - Math.hypot(b.cx - focus.x, b.cz - focus.z))[0] : nearest(r, pickFrom);
    if (t) battle.orderAttack([r], t);
  }

  if (inside) {
    // A way in: storm it. Fight whoever is on the ground; take the walls from inside via the towers.
    st.stormed = true;
    for (const r of [...foot, ...horse]) {
      if (r.posts) continue;
      const ground = standing.filter(o => !o.posts);
      const t = nearest(r, ground);
      if (t) { if (r.targetReg !== t) battle.orderAttack([r], t); continue; }
      const wallMen = standing.filter(o => o.posts && o.posts[0]);
      const w = nearest(r, wallMen);
      if (w && !r.T.mounted) { const p = w.posts[0]; battle.orderMan([r], p.perch, p.x, p.z); continue; }
      if (!r.dest && insideOf(battle, enemy, r.cx, r.cz) === false) battle.orderMove([r], home.x, home.z, Math.atan2(home.x - r.cx, home.z - r.cz));
    }
    return;
  }

  // No way in yet: foot climb any ladders that are up; the rest wait at the stand-off.
  const ladderPieces = [...new Set(ladders.map(l => l.piece))];
  let sent = 0;
  for (const r of foot) {
    if (r.posts) continue;
    if (ladderPieces.length && (r.T.key === 'maa' || r.T.key === 'sword' || r.T.key === 'sellsword' || r.T.key === 'household' || sent < 2)) {
      const l = ladders[sent % ladders.length];
      battle.orderAttackWall([r], l.piece, l.x, l.z);
      sent++;
      continue;
    }
    if (r.targetReg || r.targetWall) continue;
    if (dist(r, { cx: stage.x, cz: stage.z }) > 30 && !r.dest) battle.orderMove([r], stage.x, stage.z, stage.angle);
  }
  // Long sieges with no ram or ladder at work: hack at the gate. Stone-throwers buy
  // time but are slow, so they only make the men wait longer; a gate already
  // battered half down is worth rushing at once.
  st.waited = (st.waited || 0) + 1;
  const working = engines.some(r => r.engine.kind === 'ram') || ladders.length
    || engines.some(r => r.engine.kind === 'ladder' && !r.engine.ladders.length && r.alive >= r.engine.per);
  const throwing = engines.some(r => r.engine.range);
  const weak = gate && gate.hp < gate.maxHp * 0.35;
  if (gate && (weak || (!working && st.waited > (throwing ? 60 : 20)))) {
    for (const r of foot) if (!r.posts && r.targetWall !== gate) battle.orderAttackWall([r], gate, gate.x, gate.z);
  }
  // Horse guards the engines against sallies, else waits.
  for (const r of horse) {
    const raider = standing.find(o => !o.posts && !insideOf(battle, enemy, o.cx, o.cz) && engines.some(e => dist(e, o) < 50));
    if (raider) { if (r.targetReg !== raider) { battle.orderAttack([r], raider); battle.orderCharge([r]); } continue; }
    if (!r.dest && !r.targetReg && dist(r, { cx: stage.x, cz: stage.z }) > 40) battle.orderMove([r], stage.x - 30, stage.z, stage.angle);
  }
}

// A stretch for ladders: facing us, not a gate, with the fewest defenders on it.
function quietStretch(battle, enemy, army, pieces, gate) {
  const near = pieces.filter(p => !p.gate && p.len > 5);
  if (!near.length) return null;
  const d0 = Math.min(...near.map(p => Math.hypot(p.x - army.cx, p.z - army.cz)));
  const facing = near.filter(p => Math.hypot(p.x - army.cx, p.z - army.cz) < d0 + 40);
  const defenders = p => {
    let n = 0;
    battle.forNear(p.x, p.z, 12, s => { if (s.reg.side === enemy && s.level === 1) n++; });
    return n;
  };
  const taken = new Set(battle.regs.filter(r => r.engine?.kind === 'ladder' && r.targetWall).map(r => r.targetWall));
  return facing.map(p => ({ p, score: defenders(p) * 3 + (taken.has(p) ? 30 : 0) + (gate ? Math.max(0, 25 - Math.hypot(p.x - gate.x, p.z - gate.z)) : 0) + Math.random() * 6 }))
    .sort((a, b) => a.score - b.score)[0].p;
}

// The defending side: bows on the walls and towers facing the enemy, melee on the walls
// near them and in reserve inside the gate; every ladder answered; engines sallied against.
export function thinkSiegeDefence(battle, side, { regs = null } = {}) {
  const W = battle.walls, enemy = 1 - side;
  const mine = (regs || battle.regs.filter(r => r.side === side)).filter(usable);
  const foes = battle.regs.filter(r => r.side === enemy && usable(r));
  if (!mine.length || !foes.length) return;
  const home = battle.fortHome(side);
  const st = battle.defenceAI = battle.defenceAI || {};
  const front = centroid(foes);
  const structs = W.structures().filter(s => s.side === side && s.state === 'up');
  if (!structs.length) return thinkField(battle, side, mine);
  const byNear = (x, z) => [...structs].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const facing = byNear(front.cx, front.cz);

  // Enemies already inside: fight them on the ground.
  const within = foes.filter(o => !o.posts && insideOf(battle, side, o.cx, o.cz));
  const onWalls = foes.filter(o => o.posts);
  const ladders = W.ladders.filter(l => l.side === enemy);

  const shooters = mine.filter(r => r.T.range && !r.engine);
  const melee = mine.filter(r => !r.T.range && !r.engine && !r.T.mounted);
  const horse = mine.filter(r => r.T.mounted);
  const engines = mine.filter(r => r.engine);

  // Bows to the walls facing the enemy, towers first.
  const free = shooters.filter(r => !r.posts);
  if (free.length) {
    const t = facing.find(s => s.kind === 'tower') || facing[0];
    battle.orderMan(free, t, t.x, t.z);
  }
  for (const r of engines) {
    if (r.engine.range && !r.targetReg) { const f = nearest(r, foes.filter(o => o.engine) ) || nearest(r, foes); if (f) battle.orderAttack([r], f); }
  }

  // Melee: enemies inside come first; then each ladder; then half on the walls, half in reserve.
  const reserve = [];
  for (const r of melee) {
    if (within.length) {
      const t = nearest(r, within);
      if (r.targetReg !== t) { if (r.posts) battle.clearPosts(r); battle.orderAttack([r], t); }
      continue;
    }
    reserve.push(r);
  }
  if (within.length) { for (const r of horse) { const t = nearest(r, within); if (t && r.targetReg !== t) battle.orderAttack([r], t); } return; }

  // A man on the walls for every ladder, and a regiment to every stretch the enemy holds.
  const threats = [...ladders.map(l => ({ x: l.x, z: l.z, perch: l.piece })), ...onWalls.map(o => o.posts[0] && { x: o.posts[0].x, z: o.posts[0].z, perch: o.posts[0].perch }).filter(Boolean)];
  for (const t of threats) {
    const covered = mine.some(r => r.posts && !r.T.range && r.posts.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 12));
    if (covered) continue;
    const r = reserve.filter(o => !o.posts).sort((a, b) => Math.hypot(a.cx - t.x, a.cz - t.z) - Math.hypot(b.cx - t.x, b.cz - t.z))[0]
      || reserve.filter(o => o.posts && !o.posts.some(p => threats.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 12)))[0];
    if (r && t.perch.state === 'up') { battle.orderMan([r], t.perch, t.x, t.z); reserve.splice(reserve.indexOf(r), 1); }
  }
  // Breaches: block them from inside with whoever is left in reserve.
  const broken = W.pieces.filter(p => p.side === side && (p.state === 'broken' || p.forced));
  for (const p of broken) {
    const blockers = mine.filter(r => !r.posts && r.dest && Math.hypot(r.dest.x - p.x, r.dest.z - p.z) < 15);
    if (blockers.length) continue;
    const r = reserve.find(o => !o.posts) || reserve[0];
    if (!r) break;
    const dx = home.x - p.x, dz = home.z - p.z, d = Math.hypot(dx, dz) || 1;
    battle.orderMove([r], p.x + dx / d * 8, p.z + dz / d * 8, Math.atan2(-dx, -dz));
    reserve.splice(reserve.indexOf(r), 1);
  }
  // Keep half the reserve on the walls facing the enemy, the rest inside the nearest gate.
  const gate = W.pieces.filter(p => p.side === side && p.gate && p.state === 'up').sort((a, b) => Math.hypot(a.x - front.cx, a.z - front.cz) - Math.hypot(b.x - front.cx, b.z - front.cz))[0];
  reserve.forEach((r, i) => {
    if (r.posts || r.dest || r.targetReg) return;
    if (i % 2 === 0) {
      const t = facing.find(s => s.kind === 'piece') || facing[0];
      battle.orderMan([r], t, t.x, t.z);
    } else if (gate) {
      const dx = home.x - gate.x, dz = home.z - gate.z, d = Math.hypot(dx, dz) || 1;
      battle.orderMove([r], gate.x + dx / d * 14, gate.z + dz / d * 14, Math.atan2(-dx, -dz));
    }
  });

  // Sally: horse (or spare foot) out of the gate against an engine with few guards near it.
  const raiders = horse.length ? horse : [];
  const engs = foes.filter(o => o.engine && !o.engine.wrecked);
  const target = engs.find(e => {
    let guards = 0;
    for (const o of foes) if (!o.engine && dist(o, e) < 35) guards += o.alive;
    return guards < e.alive * 2 && Math.hypot(e.cx - home.x, e.cz - home.z) < wallRadius(battle, side) + 160;
  });
  for (const r of raiders) {
    if (target && gate) {
      if (r.targetReg !== target) { battle.orderAttack([r], target); battle.orderCharge([r]); st.sally = battle.time; }
    } else if (r.targetReg && !insideOf(battle, side, r.cx, r.cz) && (!target || battle.time - (st.sally || 0) > 60)) {
      // Back inside once the work is done.
      battle.orderMove([r], home.x, home.z + (side === 0 ? 1 : -1) * 10, 0);
    }
  }
}

// For a village under attack: the hosts flagged ai = 'siege' work the walls; once they
// are inside, the town's own raid and assault logic takes them back. Call once a second.
export function thinkTownSiege(town) {
  const b = town.battle, W = b.walls;
  if (!W.structures().some(s => s.side === 0 && s.state === 'up')) {
    for (const g of town.attackers) for (const r of g.regs) if (r.ai === 'siege' && !r.engine) r.ai = null;
    return;
  }
  for (const g of town.attackers) {
    if (g.leaving) continue;
    const regs = g.regs.filter(r => usable(r));
    if (!regs.length) continue;
    const army = centroid(regs);
    const inside = W.pieces.some(p => p.side === 0 && (p.state === 'broken' || p.forced)) && b.nav.reachable(1, army.cx, army.cz, 0, 0);
    // Engines always stay under siege orders; the rest until there is a way in.
    for (const r of regs) r.ai = r.engine || !inside ? 'siege' : null;
    const siege = regs.filter(r => r.ai === 'siege');
    if (siege.length) thinkSiegeAttack(b, 1, { regs: siege, prepare: g.mode === 'siege' });
  }
}
