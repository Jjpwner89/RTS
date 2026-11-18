// A plain battle AI: advance as a line, then pick fights by unit type.
// It thinks once a second, like a general sending runners rather than micromanaging.

export function thinkAI(battle, side) {
  if (battle.time < 8 || battle.winner !== null) return;
  const mine = battle.regs.filter(r => r.side === side && !r.gone && !r.routing);
  const foes = battle.regs.filter(r => r.side !== side && !r.gone);
  const standing = foes.filter(r => !r.routing);
  if (!mine.length || !standing.length) return;
  const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cz - b.cz);
  const nearest = (r, list) => list.reduce((best, o) => (!best || dist(r, o) < dist(r, best) ? o : best), null);

  // Until the lines are close, march forward together and keep formation.
  const gap = Math.min(...mine.map(r => dist(r, nearest(r, standing))));
  if (gap > 75) {
    const fx = standing.reduce((n, r) => n + r.cx, 0) / standing.length;
    const fz = standing.reduce((n, r) => n + r.cz, 0) / standing.length;
    for (const r of mine) {
      if (r.dest || r.targetReg) continue;
      const ang = Math.atan2(fx - r.cx, fz - r.cz);
      const dx = Math.sin(ang) * 30, dz = Math.cos(ang) * 30;
      r.dest = { x: r.x + dx, z: r.z + dz, angle: ang };
    }
    return;
  }

  for (const r of mine) {
    const current = r.targetReg && !r.targetReg.gone ? r.targetReg : null;
    let pick;
    if (r.T.range) {
      pick = nearest(r, standing.filter(o => o.engaged === 0)) || nearest(r, standing);
    } else if (r.T.charge) {
      // Horse rides down routers, then hunts archers, then hits whoever is busiest from the side.
      const routers = foes.filter(o => o.routing && dist(r, o) < 90);
      const archers = standing.filter(o => o.T.range);
      const busy = standing.filter(o => o.engaged > 0 && !o.T.braces);
      pick = nearest(r, routers) || nearest(r, archers) || nearest(r, busy) || nearest(r, standing);
    } else {
      pick = nearest(r, standing);
      if (current && !current.routing && dist(r, current) < dist(r, pick) + 25) pick = current;
    }
    if (pick && pick !== current) battle.orderAttack([r], pick);
  }
}
