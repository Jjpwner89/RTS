// Marchfront: drawing. The terrain is painted once as an ink-and-wash map; territory, towns and armies go on top each frame.
(function () {
  'use strict';
  const MF = window.MF;
  const T = MF.T;
  const K = 8; // terrain texture pixels per cell

  const BASE = {
    [T.SEA]: [112, 146, 164],
    [T.PLAIN]: [221, 210, 170],
    [T.FOREST]: [168, 178, 122],
    [T.HILL]: [205, 187, 140],
    [T.MOUNT]: [172, 160, 140],
    [T.RIVER]: [200, 200, 165],
    [T.FORD]: [200, 200, 165],
  };

  function chaikin(pts, n) {
    for (let k = 0; k < n; k++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  function stroke(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * K, pts[0][1] * K);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * K, pts[i][1] * K);
    ctx.stroke();
  }

  MF.buildTerrain = function (map) {
    const { W, H, ter } = map;
    const rand = MF.rng(99);
    const small = document.createElement('canvas');
    small.width = W; small.height = H;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const c = BASE[ter[i]], j = (rand() - 0.5) * 10;
      img.data[i * 4] = c[0] + j; img.data[i * 4 + 1] = c[1] + j; img.data[i * 4 + 2] = c[2] + j * 0.6; img.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);

    const cv = document.createElement('canvas');
    cv.width = W * K; cv.height = H * K;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, W * K, H * K);

    // Paper grain.
    for (let n = 0; n < 9000; n++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(60,45,25,0.07)' : 'rgba(255,250,235,0.08)';
      ctx.fillRect(rand() * W * K, rand() * H * K, 1 + rand() * 2, 1 + rand() * 2);
    }

    // Shoreline ripples.
    ctx.strokeStyle = 'rgba(235,240,235,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < W * H; i++) {
      if (ter[i] !== T.SEA || rand() > 0.12) continue;
      const x = (i % W) * K, y = ((i / W) | 0) * K;
      ctx.beginPath();
      ctx.moveTo(x, y + 4); ctx.quadraticCurveTo(x + 3, y + 1, x + 6, y + 4);
      ctx.stroke();
    }

    for (let i = 0; i < W * H; i++) {
      const x = (i % W + 0.5) * K, y = (((i / W) | 0) + 0.5) * K;
      if (ter[i] === T.HILL && rand() < 0.3) {
        ctx.strokeStyle = 'rgba(110,85,50,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y + 3, 4.5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (ter[i] === T.MOUNT && rand() < 0.45) {
        const s = 6 + rand() * 4;
        ctx.fillStyle = 'rgba(236,230,215,0.9)';
        ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s * 0.8); ctx.lineTo(x + s, y + s * 0.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(95,82,68,0.55)';
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x + s, y + s * 0.6); ctx.lineTo(x + s * 0.15, y + s * 0.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(70,58,45,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s * 0.8); ctx.lineTo(x + s, y + s * 0.6); ctx.stroke();
      } else if (ter[i] === T.FOREST) {
        for (let k = 0; k < 2; k++) {
          if (rand() < 0.35) continue;
          const tx = x + (rand() - 0.5) * K, ty = y + (rand() - 0.5) * K, r = 2.2 + rand() * 1.4;
          ctx.fillStyle = 'rgba(70,92,52,0.85)';
          ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(120,140,80,0.8)';
          ctx.beginPath(); ctx.arc(tx - r * 0.3, ty - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of map.rivers) {
      const pts = chaikin(r.pts, 3);
      ctx.strokeStyle = '#5d87a1'; ctx.lineWidth = r.w * K; stroke(ctx, pts);
      ctx.strokeStyle = '#86abc0'; ctx.lineWidth = r.w * K * 0.4; stroke(ctx, pts);
    }
    for (const [fx, fy] of map.fords) {
      ctx.fillStyle = 'rgba(214,205,170,0.95)';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath(); ctx.arc(fx * K + k * 3.6, fy * K + (k % 2) * 2, 2.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const road of map.roads) {
      const pts = chaikin(road, 2);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(240,228,190,0.8)'; ctx.lineWidth = 4; stroke(ctx, pts);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(120,88,52,0.85)'; ctx.lineWidth = 1.6; stroke(ctx, pts);
    }
    ctx.setLineDash([]);
    for (let i = 0; i < W * H; i++) {
      if (!map.road[i] || ter[i] !== T.RIVER) continue;
      const x = (i % W + 0.5) * K, y = (((i / W) | 0) + 0.5) * K;
      ctx.fillStyle = '#7a5a38';
      ctx.fillRect(x - 4.5, y - 4.5, 9, 9);
      ctx.fillStyle = '#c9a774';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }

    // Vignette to frame the vale.
    const grad = ctx.createRadialGradient(W * K / 2, H * K / 2, H * K * 0.4, W * K / 2, H * K / 2, W * K * 0.62);
    grad.addColorStop(0, 'rgba(60,40,20,0)');
    grad.addColorStop(1, 'rgba(60,40,20,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W * K, H * K);
    return cv;
  };

  // Territory, drawn at one pixel per cell and scaled up smoothly so borders look washed in.
  MF.Overlay = class {
    constructor(g) {
      this.cv = document.createElement('canvas');
      this.cv.width = g.W; this.cv.height = g.H;
      this.ctx = this.cv.getContext('2d');
      this.img = this.ctx.createImageData(g.W, g.H);
      this.front = [];
      this.version = -1;
    }
    update(g) {
      const { W, H, owner } = g, d = this.img.data, N = W * H;
      const front = (this.front = []);
      for (let i = 0; i < N; i++) {
        const o = owner[i], k = i * 4;
        if (o < 0) { d[k + 3] = 0; continue; }
        const x = i % W, y = (i / W) | 0;
        const c = MF.SIDES[o].color;
        let border = false;
        const edge = (j, x0, y0, x1, y1) => {
          if (owner[j] === o || g.map.ter[j] === T.SEA) return;
          border = true;
          if (o === 0 && owner[j] === 1) front.push(x0, y0, x1, y1);
        };
        if (x < W - 1) edge(i + 1, x + 1, y, x + 1, y + 1);
        if (x > 0) edge(i - 1, x, y, x, y + 1);
        if (y < H - 1) edge(i + W, x, y + 1, x + 1, y + 1);
        if (y > 0) edge(i - W, x, y, x + 1, y);
        const sup = g.supplied[o][i];
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
        d[k + 3] = border ? 150 : sup ? 72 : (x + y) % 4 < 2 ? 120 : 30;
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  MF.rgb = rgb;
  MF.armyRadius = (v, a) => Math.max(9, v.scale * 1.15) * (0.72 + 0.42 * Math.sqrt(a.str / MF.C.MAX));

  MF.draw = function (ctx, st) {
    const { g, v, terrain, overlay, sel, ui } = st;
    const cw = ctx.canvas.width / v.dpr, ch = ctx.canvas.height / v.dpr;
    const sx = (x) => v.ox + x * v.scale, sy = (y) => v.oy + y * v.scale;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = '#231f1a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(terrain, v.ox, v.oy, g.W * v.scale, g.H * v.scale);
    ctx.drawImage(overlay.cv, v.ox, v.oy, g.W * v.scale, g.H * v.scale);

    // The front line between the two realms.
    const f = overlay.front;
    ctx.strokeStyle = 'rgba(40,24,16,0.75)';
    ctx.lineWidth = Math.max(1.5, v.scale * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < f.length; k += 4) { ctx.moveTo(sx(f[k]), sy(f[k + 1])); ctx.lineTo(sx(f[k + 2]), sy(f[k + 3])); }
    ctx.stroke();

    // Towns.
    const fontPx = Math.max(10, Math.min(15, v.scale * 1.5));
    for (const t of g.towns) {
      const x = sx(t.x), y = sy(t.y), s = Math.max(6, v.scale * (t.capital ? 1.25 : 0.95));
      const col = t.owner < 0 ? [150, 142, 124] : MF.SIDES[t.owner].color;
      if (ui.raising && MF.canRaiseAt(g, 0, t)) {
        ctx.strokeStyle = `rgba(250,220,120,${0.6 + 0.4 * Math.sin(performance.now() / 150)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, s * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,20,10,0.35)';
      ctx.beginPath(); ctx.arc(x + 1.5, y + 2, s * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(col);
      ctx.strokeStyle = '#2a1f14';
      ctx.lineWidth = 1.5;
      if (t.capital) {
        // A keep: walls with three towers.
        ctx.beginPath();
        ctx.moveTo(x - s, y + s * 0.8);
        ctx.lineTo(x - s, y - s * 0.7); ctx.lineTo(x - s * 0.55, y - s * 0.7); ctx.lineTo(x - s * 0.55, y - s * 0.3);
        ctx.lineTo(x - s * 0.25, y - s * 0.3); ctx.lineTo(x - s * 0.25, y - s * 1.05); ctx.lineTo(x + s * 0.25, y - s * 1.05);
        ctx.lineTo(x + s * 0.25, y - s * 0.3); ctx.lineTo(x + s * 0.55, y - s * 0.3); ctx.lineTo(x + s * 0.55, y - s * 0.7);
        ctx.lineTo(x + s, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a1f14';
        ctx.fillRect(x - s * 0.18, y + s * 0.25, s * 0.36, s * 0.55);
      } else {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.8, y + s * 0.7); ctx.lineTo(x - s * 0.8, y - s * 0.1); ctx.lineTo(x, y - s * 0.85);
        ctx.lineTo(x + s * 0.8, y - s * 0.1); ctx.lineTo(x + s * 0.8, y + s * 0.7); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      const gm = MF.garMax(t);
      if (t.gar < gm - 0.5 || t.sieged) {
        // Garrison strength.
        const bw = s * 2.2, bx = x - bw / 2, by = y - s * 1.35 - 5;
        ctx.fillStyle = 'rgba(30,20,10,0.75)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
        ctx.fillStyle = t.sieged ? '#f0a030' : '#efe4c8';
        ctx.fillRect(bx, by, bw * Math.max(0, t.gar / gm), 3);
      }
      if (t.capSide >= 0 && t.capP > 0) {
        ctx.strokeStyle = rgb(MF.SIDES[t.capSide].color);
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x, y, s * 1.6, -Math.PI / 2, -Math.PI / 2 + t.capP * Math.PI * 2); ctx.stroke();
      }
      ctx.font = `${t.capital ? 'bold ' : ''}${fontPx}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(245,236,210,0.85)';
      ctx.strokeText(t.name, x, y + s * 1.05 + 2);
      ctx.fillStyle = '#2a1f14';
      ctx.fillText(t.name, x, y + s * 1.05 + 2);
    }

    // Planned routes for your own armies.
    for (const a of g.armies) {
      if (a.side !== 0 || !a.path.length) continue;
      const on = sel.has(a);
      ctx.strokeStyle = on ? 'rgba(255,240,190,0.95)' : 'rgba(40,60,90,0.45)';
      ctx.lineWidth = on ? 2 : 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      for (const p of a.path) ctx.lineTo(sx(p.x), sy(p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      const e = a.path[a.path.length - 1];
      ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), 3, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }

    // Clashes.
    const now = performance.now();
    for (const a of g.armies) {
      for (const b of a.eng) {
        if (a.id > b.id) continue;
        const mx = sx((a.x + b.x) / 2), my = sy((a.y + b.y) / 2);
        ctx.strokeStyle = `rgba(255,${180 + 60 * Math.sin(now / 90 + a.id)},90,0.9)`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const ang = now / 300 + k * 2.1 + a.id;
          const r = 3 + 3 * Math.abs(Math.sin(now / 120 + k));
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(ang) * r, my + Math.sin(ang) * r); ctx.stroke();
        }
      }
    }

    // Armies.
    for (const a of g.armies) {
      const x = sx(a.x), y = sy(a.y), r = MF.armyRadius(v, a);
      const col = MF.SIDES[a.side].color;
      ctx.fillStyle = 'rgba(20,12,6,0.4)';
      ctx.beginPath(); ctx.arc(x + 1.5, y + 2.5, r, 0, Math.PI * 2); ctx.fill();
      if (sel.has(a)) {
        ctx.strokeStyle = '#ffe9a0';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      if (!a.path.length && a.still > 3) {
        // Dug in: a ring of stakes.
        const n = 10, k = Math.min(1, (a.still - 3) / 3);
        ctx.strokeStyle = 'rgba(60,40,20,0.85)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < n * k; i++) {
          const ang = (i / n) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ang) * (r + 1), y + Math.sin(ang) * (r + 1));
          ctx.lineTo(x + Math.cos(ang) * (r + 4), y + Math.sin(ang) * (r + 4));
          ctx.stroke();
        }
      }
      ctx.fillStyle = a.hit > 0 ? rgb([Math.min(255, col[0] + 80), col[1] + 30, col[2] + 30]) : rgb(col);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(245,236,210,0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r - 1.6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#1d140c';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (!a.supplied) {
        ctx.strokeStyle = '#f0a030';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#fbf4e2';
      ctx.font = `bold ${Math.round(r * 0.95)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(a.str), x, y + 0.5);
    }

    // Order being drawn.
    const d = ui.drag;
    if (d && d.moved && d.kind === 'army') {
      const x0 = sx(d.army.x), y0 = sy(d.army.y), x1 = d.cur.x, y1 = d.cur.y;
      const tgt = d.hover;
      ctx.strokeStyle = tgt && tgt.side === 1 ? '#e05a3a' : tgt ? '#9fd0ff' : '#ffe9a0';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(ang - 0.45) * 12, y1 - Math.sin(ang - 0.45) * 12);
      ctx.lineTo(x1 - Math.cos(ang + 0.45) * 12, y1 - Math.sin(ang + 0.45) * 12);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    } else if (d && d.moved && d.kind === 'box') {
      ctx.strokeStyle = 'rgba(255,233,160,0.9)';
      ctx.fillStyle = 'rgba(255,233,160,0.12)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, Math.min(d.sx, d.cur.x), Math.min(d.sy, d.cur.y), Math.abs(d.cur.x - d.sx), Math.abs(d.cur.y - d.sy), 3);
      ctx.fill(); ctx.stroke();
    } else if (d && d.kind === 'line' && d.pts.length > 1) {
      ctx.strokeStyle = '#ffe9a0';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(d.pts[0].x, d.pts[0].y);
      for (const p of d.pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
})();
