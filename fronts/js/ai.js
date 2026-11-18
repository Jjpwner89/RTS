// Marchfront: the computer opponent. Raises armies where they are needed, then shares them out
// between towns to take, towns to defend and raiders to hunt, gathering before a strong target.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const MF = G.MF;
  const C = MF.C;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function goTo(g, a, x, y) {
    if (a.order && a.order.type === 'move' && Math.hypot(a.order.x - x, a.order.y - y) < 2.5) return;
    if (!a.order && Math.hypot(a.x - x, a.y - y) < 1.5) return;
    MF.orderMove(g, a, x, y);
  }

  function safeTown(g, s, a) {
    let best = null, bd = Infinity;
    for (const t of g.towns) {
      if (t.owner !== s || !g.supplied[s][t.cell]) continue;
      if (MF.near(g, 1 - s, t.x, t.y, 8) > MF.near(g, s, t.x, t.y, 8)) continue;
      const d = dist(a, t);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  MF.aiThink = function (g, s) {
    const e = 1 - s;
    const home = g.towns.find((t) => t.capital && t.owner === s);
    if (!home) return;
    const mine = g.armies.filter((a) => a.side === s);
    const foes = g.armies.filter((a) => a.side === e);

    // Raise new armies, nearest the danger or the front. Manpower above one levy refills
    // existing armies, so only raise once they are mostly full or the reserve is large.
    const fill = () => mine.reduce((n, a) => n + a.str, 0) / Math.max(1, mine.length);
    while (g.manpower[s] >= C.RAISE_COST && (mine.length < 4 || fill() >= 75 || g.manpower[s] >= 90)) {
      let best = null, bs = -Infinity;
      for (const t of g.towns) {
        if (!MF.canRaiseAt(g, s, t)) continue;
        let fd = 60;
        for (const f of foes) fd = Math.min(fd, dist(f, t));
        const sc = MF.near(g, e, t.x, t.y, 18) * 2 - fd * 0.5 + (t.capital ? 4 : 0);
        if (sc > bs) { bs = sc; best = t; }
      }
      if (!best) break;
      mine.push(MF.raise(g, s, best));
    }

    const targets = [];
    for (const t of g.towns) {
      if (t.owner === s) {
        const threat = MF.near(g, e, t.x, t.y, 14);
        if (threat > 0) targets.push({ key: 'd' + t.id, x: t.x, y: t.y, value: t.capital ? 12 : 5, need: threat * 1.2, kind: 'defend' });
        else if (t.capital) targets.push({ key: 'g' + t.id, x: t.x, y: t.y, value: 1.2, need: 30, kind: 'defend' });
      } else {
        const guard = MF.near(g, e, t.x, t.y, 8);
        const value = t.owner < 0 ? 6 : t.capital ? 7 : 4.5;
        targets.push({ key: 't' + t.id, x: t.x, y: t.y, value, need: guard * (t.owner === e ? 1.8 : 1.3) + t.gar * 1.2 + 10, kind: 'take' });
      }
    }
    for (const f of foes) {
      const inOurLand = g.owner[MF.cellOf(g, f.x, f.y)] === s;
      if (inOurLand || MF.near(g, s, f.x, f.y, 10) > 0) {
        targets.push({ key: 'a' + f.id, x: f.x, y: f.y, value: inOurLand ? 5 : 3, need: MF.near(g, e, f.x, f.y, 6) * 1.3, kind: 'hunt', army: f });
      }
    }

    const free = [];
    for (const a of mine) {
      if (a.eng.length) {
        const ours = MF.near(g, s, a.x, a.y, 6), theirs = MF.near(g, e, a.x, a.y, 6);
        if (theirs > ours * 1.8 && a.str < 60) {
          const t = safeTown(g, s, a);
          if (t && dist(a, t) > 2) { a.aiKey = null; goTo(g, a, t.x, t.y); }
        }
        continue;
      }
      if (!a.supplied && a.str < 30) {
        const t = safeTown(g, s, a);
        if (t) { a.aiKey = null; goTo(g, a, t.x, t.y); continue; }
      }
      if (a.str < 22) {
        // Too weak to act alone: fold into the nearest friend or wait to refill.
        let friend = null, fd = 18;
        for (const b of mine) if (b !== a && b.str + a.str <= C.MAX + 10 && dist(a, b) < fd) { fd = dist(a, b); friend = b; }
        if (friend && !(a.order && a.order.id === friend.id)) MF.orderMerge(g, a, friend);
        continue;
      }
      free.push(a);
    }

    const assigned = new Map();
    const plan = [];
    while (free.length && targets.length) {
      let bi = -1, bt = null, bs = -Infinity;
      free.forEach((a, i) => {
        for (const t of targets) {
          const have = assigned.get(t) || 0;
          const sat = Math.min(1.5, (have + a.str) / Math.max(1, t.need));
          let sc = (t.value * (have >= t.need ? 0.25 : 1) * (0.4 + sat)) / (1 + dist(a, t) / 22);
          if (a.aiKey === t.key) sc *= 1.3;
          if (sc > bs) { bs = sc; bi = i; bt = t; }
        }
      });
      const a = free.splice(bi, 1)[0];
      assigned.set(bt, (assigned.get(bt) || 0) + a.str);
      plan.push([a, bt]);
    }

    for (const [a, t] of plan) {
      a.aiKey = t.key;
      if (t.kind === 'hunt') {
        if (!(a.order && a.order.type === 'attack' && a.order.id === t.army.id)) MF.orderAttack(g, a, t.army);
        continue;
      }
      if (t.kind === 'take' && assigned.get(t) < t.need * 0.8 && dist(a, t) > 12) {
        // Gather short of a strong target until enough friends have joined.
        const dx = home.x - t.x, dy = home.y - t.y, d = Math.hypot(dx, dy) || 1;
        goTo(g, a, t.x + (dx / d) * 12, t.y + (dy / d) * 12);
        continue;
      }
      goTo(g, a, t.x, t.y);
    }
  };
})();
