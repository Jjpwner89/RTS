// Marchfront: input, HUD and the game loop.
(function () {
  'use strict';
  const MF = window.MF;
  const C = MF.C;
  const $ = (id) => document.getElementById(id);
  const cv = $('map');
  const ctx = cv.getContext('2d');
  const params = new URLSearchParams(location.search);
  const watch = params.has('watch');

  let g = null, terrain = null, overlay = null;
  let live = false, speed = 1, paused = true, acc = 0, last = performance.now(), overlayT = 0, logSeen = 0, ended = false;
  const v = { dpr: 1, z: 1, cx: 0, cy: 0, scale: 1, ox: 0, oy: 0 };
  const sel = new Set();
  const ui = { drag: null, raising: false, line: false };
  const st = { v, sel, ui };
  MF.ui = st; // for debugging from the console

  function start(mult) {
    g = MF.newGame({ mult: [watch ? mult : 1, mult], ai: watch ? [true, true] : [false, true] });
    terrain = MF.buildTerrain(g.map);
    overlay = new MF.Overlay(g);
    overlay.update(g);
    Object.assign(st, { g, terrain, overlay });
    v.z = 1; v.cx = g.W / 2; v.cy = g.H / 2;
    sel.clear();
    acc = 0; logSeen = 0; ended = false;
    $('log').innerHTML = '';
    $('screen').hidden = true;
    setSpeed(watch ? Number(params.get('speed') || 4) : 1);
    paused = false;
    live = true;
    syncPause();
    resize();
  }

  // ---- view ----
  function resize() {
    v.dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(innerWidth * v.dpr);
    cv.height = Math.round(innerHeight * v.dpr);
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    layout();
  }
  function layout() {
    if (!g) return;
    const top = $('hud').offsetHeight, bottom = $('bar').offsetHeight;
    const aw = innerWidth, ah = innerHeight - top - bottom;
    const base = Math.min(aw / g.W, ah / g.H);
    v.scale = base * v.z;
    const halfW = aw / v.scale / 2, halfH = ah / v.scale / 2;
    v.cx = halfW >= g.W / 2 ? g.W / 2 : Math.max(halfW, Math.min(g.W - halfW, v.cx));
    v.cy = halfH >= g.H / 2 ? g.H / 2 : Math.max(halfH, Math.min(g.H - halfH, v.cy));
    v.ox = aw / 2 - v.cx * v.scale;
    v.oy = top + ah / 2 - v.cy * v.scale;
  }
  const toWorld = (px, py) => ({ x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale });

  function armyAt(px, py, side) {
    let best = null, bd = Infinity;
    for (const a of g.armies) {
      if (side !== undefined && a.side !== side) continue;
      const d = Math.hypot(v.ox + a.x * v.scale - px, v.oy + a.y * v.scale - py);
      if (d < MF.armyRadius(v, a) + 5 && d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function townAt(px, py) {
    for (const t of g.towns) if (Math.hypot(v.ox + t.x * v.scale - px, v.oy + t.y * v.scale - py) < Math.max(14, v.scale * 2)) return t;
    return null;
  }

  // ---- orders ----
  function orderTo(units, px, py, anchor) {
    const w = toWorld(px, py);
    const foe = armyAt(px, py, 1);
    const friend = armyAt(px, py, 0);
    for (const a of units) {
      if (foe) MF.orderAttack(g, a, foe);
      else if (friend && !units.includes(friend)) MF.orderMerge(g, a, friend);
      else {
        let ox = 0, oy = 0;
        if (units.length > 1 && anchor) {
          ox = a.x - anchor.x; oy = a.y - anchor.y;
          const d = Math.hypot(ox, oy);
          if (d > 6) { ox *= 6 / d; oy *= 6 / d; }
        }
        MF.orderMove(g, a, w.x + ox, w.y + oy);
      }
    }
  }

  // Spread the selected armies along a drawn line, keeping their left-to-right order.
  function orderLine(pts) {
    const units = [...sel].filter((a) => !a.dead);
    if (!units.length || pts.length < 2) return;
    const w = pts.map((p) => toWorld(p.x, p.y));
    const seg = [0];
    for (let i = 1; i < w.length; i++) seg.push(seg[i - 1] + Math.hypot(w[i].x - w[i - 1].x, w[i].y - w[i - 1].y));
    const total = seg[seg.length - 1];
    const at = (s) => {
      let i = 1;
      while (i < seg.length - 1 && seg[i] < s) i++;
      const f = (s - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]);
      return { x: w[i - 1].x + (w[i].x - w[i - 1].x) * f, y: w[i - 1].y + (w[i].y - w[i - 1].y) * f };
    };
    const dx = w[w.length - 1].x - w[0].x, dy = w[w.length - 1].y - w[0].y;
    units.sort((a, b) => a.x * dx + a.y * dy - (b.x * dx + b.y * dy));
    units.forEach((a, k) => {
      const p = at(((k + 0.5) / units.length) * total);
      MF.orderMove(g, a, p.x, p.y);
    });
  }

  function raiseAt(t) {
    if (t && MF.raise(g, 0, t)) { ui.raising = false; syncButtons(); return true; }
    return false;
  }
  function toggleRaise() {
    if (g.manpower[0] < C.RAISE_COST) { ui.raising = false; syncButtons(); return; }
    const ok = g.towns.filter((t) => MF.canRaiseAt(g, 0, t));
    if (ok.length === 1) raiseAt(ok[0]);
    else ui.raising = !ui.raising && ok.length > 0;
    syncButtons();
  }
  function splitSelected() {
    for (const a of [...sel]) {
      const b = MF.split(g, a);
      if (b) sel.add(b);
    }
  }
  function holdSelected() {
    for (const a of sel) MF.orderStop(a);
  }

  // ---- input ----
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    if (!live || g.winner >= 0) return;
    cv.setPointerCapture(e.pointerId);
    const p = { x: e.offsetX, y: e.offsetY };
    if (e.button === 1) { ui.drag = { kind: 'pan', sx: p.x, sy: p.y, cx: v.cx, cy: v.cy, cur: p, moved: true }; return; }
    if (e.button === 2) {
      const units = [...sel];
      if (units.length) orderTo(units, p.x, p.y, null);
      return;
    }
    if (ui.raising) {
      const t = townAt(p.x, p.y);
      if (!raiseAt(t)) { ui.raising = false; syncButtons(); }
      return;
    }
    const hit = armyAt(p.x, p.y, 0);
    if ((ui.line || e.shiftKey) && sel.size && !hit) { ui.drag = { kind: 'line', pts: [p], cur: p, moved: false }; return; }
    if (hit) ui.drag = { kind: 'army', army: hit, sx: p.x, sy: p.y, cur: p, moved: false, shift: e.shiftKey };
    else ui.drag = { kind: 'box', sx: p.x, sy: p.y, cur: p, moved: false, shift: e.shiftKey };
  });
  cv.addEventListener('pointermove', (e) => {
    const d = ui.drag;
    if (!d) return;
    const p = { x: e.offsetX, y: e.offsetY };
    d.cur = p;
    if (d.kind === 'pan') {
      v.cx = d.cx - (p.x - d.sx) / v.scale;
      v.cy = d.cy - (p.y - d.sy) / v.scale;
      layout();
      return;
    }
    if (d.kind === 'line') {
      const q = d.pts[d.pts.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) > 8) d.pts.push(p);
      d.moved = d.pts.length > 2;
      return;
    }
    if (Math.hypot(p.x - d.sx, p.y - d.sy) > 7) d.moved = true;
    if (d.kind === 'army') d.hover = armyAt(p.x, p.y, 1) || (() => { const f = armyAt(p.x, p.y, 0); return f && f !== d.army ? f : null; })();
  });
  cv.addEventListener('pointerup', (e) => {
    const d = ui.drag;
    ui.drag = null;
    if (!d || !g) return;
    const p = { x: e.offsetX, y: e.offsetY };
    if (d.sx !== undefined && Math.hypot(p.x - d.sx, p.y - d.sy) > 7) d.moved = true;
    if (d.kind === 'army') {
      const a = d.army;
      if (!d.moved) {
        if (d.shift) { if (sel.has(a)) sel.delete(a); else sel.add(a); }
        else { sel.clear(); sel.add(a); }
        return;
      }
      if (!sel.has(a)) { sel.clear(); sel.add(a); }
      orderTo([...sel], p.x, p.y, a);
    } else if (d.kind === 'box') {
      if (!d.shift) sel.clear();
      if (!d.moved) return;
      const x0 = Math.min(d.sx, p.x), x1 = Math.max(d.sx, p.x), y0 = Math.min(d.sy, p.y), y1 = Math.max(d.sy, p.y);
      for (const a of g.armies) {
        const ax = v.ox + a.x * v.scale, ay = v.oy + a.y * v.scale;
        if (a.side === 0 && ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) sel.add(a);
      }
    } else if (d.kind === 'line') {
      d.pts.push(p);
      orderLine(d.pts);
      ui.line = false;
      syncButtons();
    }
  });
  cv.addEventListener('wheel', (e) => {
    if (!g) return;
    e.preventDefault();
    const before = toWorld(e.offsetX, e.offsetY);
    v.z = Math.max(1, Math.min(5, v.z * Math.exp(-e.deltaY * 0.0015)));
    layout();
    const after = toWorld(e.offsetX, e.offsetY);
    v.cx += before.x - after.x;
    v.cy += before.y - after.y;
    layout();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!live || e.metaKey || e.ctrlKey) {
      if (live && (e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); togglePause(); }
    else if (k === '1' || k === '2' || k === '3') setSpeed([1, 2, 4][Number(k) - 1]);
    else if (k === 'r') toggleRaise();
    else if (k === 's') splitSelected();
    else if (k === 'h') holdSelected();
    else if (k === 'l') { ui.line = !ui.line; syncButtons(); }
    else if (k === 'a') selectAll();
    else if (k === 'escape') { sel.clear(); ui.raising = false; ui.line = false; syncButtons(); }
    else if (k.startsWith('arrow')) {
      const step = 40 / v.scale;
      if (k === 'arrowleft') v.cx -= step;
      if (k === 'arrowright') v.cx += step;
      if (k === 'arrowup') v.cy -= step;
      if (k === 'arrowdown') v.cy += step;
      layout();
    }
  });
  function selectAll() {
    sel.clear();
    for (const a of g.armies) if (a.side === 0) sel.add(a);
  }

  // ---- HUD ----
  function setSpeed(s) {
    speed = s;
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === s));
  }
  function togglePause() { if (!live || g.winner >= 0) return; paused = !paused; syncPause(); }
  function syncPause() {
    $('pause').textContent = paused ? '▶' : '❚❚';
    $('pause').classList.toggle('on', paused);
    $('pausedTag').hidden = !paused || !g || g.winner >= 0;
  }
  function syncButtons() {
    $('raise').classList.toggle('on', ui.raising);
    $('line').classList.toggle('on', ui.line);
  }
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  $('pause').addEventListener('click', togglePause);
  $('raise').addEventListener('click', () => g && toggleRaise());
  $('split').addEventListener('click', () => g && splitSelected());
  $('hold').addEventListener('click', () => g && holdSelected());
  $('line').addEventListener('click', () => { ui.line = !ui.line; syncButtons(); });
  $('help').addEventListener('click', () => $('howto').classList.toggle('open'));

  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function realmLine(s) {
    const towns = g.towns.filter((t) => t.owner === s).length;
    const armies = g.armies.filter((a) => a.side === s);
    const str = armies.reduce((n, a) => n + a.str, 0);
    return `<span title="Towns held">⌂ ${towns}</span><span title="Armies in the field and their total strength">⚔ ${armies.length} · ${Math.round(str)}</span>`;
  }
  function hud() {
    $('clock').textContent = fmtTime(g.t);
    $('you').innerHTML = realmLine(0) + `<span title="Manpower in reserve and income per second">⚑ ${Math.floor(g.manpower[0])} <small>+${g.income[0].toFixed(1)}/s</small></span>`;
    $('foe').innerHTML = realmLine(1);
    const canRaise = g.manpower[0] >= C.RAISE_COST && g.towns.some((t) => MF.canRaiseAt(g, 0, t));
    $('raise').disabled = !canRaise;
    if (!canRaise && ui.raising) { ui.raising = false; syncButtons(); }
    for (const a of sel) if (a.dead) sel.delete(a);
    const info = $('info');
    if (!sel.size) {
      info.innerHTML = ui.raising ? 'Click a glowing town to raise an army there.' : ui.line ? 'Draw a line on the map; the selected armies spread along it.' : 'Drag from an army to send it. Drag across the map to select several.';
    } else if (sel.size === 1) {
      const a = [...sel][0];
      const ci = MF.cellOf(g, a.x, a.y);
      const ter = MF.TERRAIN[g.map.ter[ci]].name + (g.map.road[ci] ? ', road' : '');
      const state = a.eng.length ? '<b class="warn">In battle</b>' : a.siege ? '<b class="warn">Besieging</b>' : a.path.length ? 'Marching' : a.still > 6 ? 'Dug in' : 'Holding';
      info.innerHTML = `Army of ${Math.round(a.str)} · ${ter} · ${state} · ${a.supplied ? 'Supplied' : '<b class="warn">Out of supply</b>'} · defence ×${MF.defenseOf(g, a).toFixed(2)}`;
    } else {
      const list = [...sel];
      info.innerHTML = `${list.length} armies · ${Math.round(list.reduce((n, a) => n + a.str, 0))} strength`;
    }
    while (logSeen < g.log.length) {
      const ev = g.log[logSeen++];
      const el = document.createElement('div');
      el.className = 'ev s' + ev.side;
      el.textContent = `${fmtTime(ev.t)}  ${ev.text}`;
      $('log').prepend(el);
      while ($('log').children.length > 6) $('log').lastChild.remove();
    }
  }

  function showEnd() {
    ended = true;
    sel.clear();
    syncPause();
    const won = g.winner === 0;
    const s = g.stats;
    $('screen').hidden = false;
    $('screen').innerHTML = `
      <div class="card">
        <h1>${won ? 'Victory' : 'Defeat'}</h1>
        <p class="sub">${won ? 'Corvane has fallen. The Sundered Vale answers to the March.' : 'Halvard has fallen. The Dominion holds the vale.'}</p>
        <table>
          <tr><th></th><th>Halvard</th><th>Corvane</th></tr>
          <tr><td>Towns taken</td><td>${s[0].taken}</td><td>${s[1].taken}</td></tr>
          <tr><td>Armies raised</td><td>${s[0].raised}</td><td>${s[1].raised}</td></tr>
          <tr><td>Strength lost</td><td>${Math.round(s[0].lost)}</td><td>${Math.round(s[1].lost)}</td></tr>
        </table>
        <p class="sub">Time ${fmtTime(g.t)}</p>
        <button id="again">Play again</button>
      </div>`;
    $('again').addEventListener('click', showStart);
  }

  function showStart() {
    live = false;
    $('screen').hidden = false;
    $('screen').innerHTML = `
      <div class="card">
        <h1>Marchfront</h1>
        <p class="sub">The Sundered Vale</p>
        <p>The river Sunder splits the vale. West of it, the <b class="s0">Halvard March</b>; east, the <b class="s1">Corvane Dominion</b>. Between them lie four free towns and a lot of open ground.</p>
        <ul>
          <li><b>Drag</b> from one of your armies to send it. Drop on an enemy to attack, on a friend to merge.</li>
          <li>Armies <b>claim the land</b> around them. Land joined to your capital is <b>supplied</b>: armies there refill, armies cut off wither.</li>
          <li>Forest, hills and towns help defenders; armies that stand still <b>dig in</b>. Rivers are slow and weak to fight from, except at bridges and fords.</li>
          <li>Towns give manpower. <b>Raise</b> new armies with it, or let it refill the ones you have.</li>
          <li><b>Take Corvane</b> to win. Lose Halvard and the war is over.</li>
        </ul>
        <div class="diff">
          <button data-mult="0.75">Easy</button><button data-mult="1" class="on">Normal</button><button data-mult="1.3">Hard</button>
        </div>
      </div>`;
    $('screen').querySelectorAll('[data-mult]').forEach((b) => b.addEventListener('click', () => start(Number(b.dataset.mult))));
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (g) {
      if (!paused && g.winner < 0) {
        acc += dt * speed;
        let n = 0;
        while (acc >= 0.05 && n++ < 24) { MF.step(g, 0.05); acc -= 0.05; }
      }
      if ((overlayT -= dt) <= 0) { overlayT = 0.15; overlay.update(g); hud(); }
      MF.draw(ctx, st);
      if (g.winner >= 0 && !ended) { hud(); showEnd(); }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  if (watch) start(Number(params.get('mult') || 1));
  else {
    // Show the vale behind the title card.
    g = MF.newGame({ ai: [false, false] });
    terrain = MF.buildTerrain(g.map);
    overlay = new MF.Overlay(g);
    overlay.update(g);
    Object.assign(st, { g, terrain, overlay });
    v.cx = g.W / 2; v.cy = g.H / 2;
    layout();
    showStart();
  }
  requestAnimationFrame(frame);
})();
