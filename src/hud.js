// Regiment cards along the bottom, time controls on top, and battle messages.
import { drawIcon, SIDE_COLORS } from './view.js';
import { FORMATIONS, WEATHER } from './battle.js';

export class Hud {
  // endPanel: show the Victory / Defeat box when the battle is decided. fresh: only
  // report events from now on, for a battle that was already running.
  constructor(battle, hooks, { endPanel = true, fresh = false } = {}) {
    this.battle = battle;
    this.hooks = hooks;
    this.endPanel = endPanel;
    this.cardsEl = document.getElementById('cards');
    this.cardsEl.innerHTML = '';
    this.logEl = document.getElementById('log');
    this.seenEvents = fresh ? battle.events.length : 0;
    this.cards = [];
    this.seenRegs = 0;
    this.syncCards();
    document.getElementById('pause').onclick = () => hooks.togglePause();
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => hooks.setSpeed(+b.dataset.speed);
    document.getElementById('help-toggle').onclick = () => document.getElementById('help').classList.toggle('open');
    document.getElementById('again').onclick = () => location.reload();
    this.buildOrders();
    this.buildDeploy();
  }

  // While the army deploys: what to do, and the button that starts the battle.
  buildDeploy() {
    let el = document.getElementById('deploy');
    if (!el) { el = document.createElement('div'); el.id = 'deploy'; document.body.append(el); }
    el.innerHTML = `<b>Deploy your army</b>
      <span>Select regiments and right-click to place them anywhere on the lit ground. Set formations, hold or targets now.</span>
      <button class="go" title="Start the fight (Enter)">Begin battle</button>`;
    el.querySelector('.go').onclick = () => { this.battle.beginBattle(); if (this.paused) this.hooks.togglePause(); };
    this.deployEl = el;
  }

  // The command bar over the cards: formations, charge, hold and fire at will for the selection.
  buildOrders() {
    let el = document.getElementById('orders');
    if (!el) { el = document.createElement('div'); el.id = 'orders'; document.body.append(el); }
    const f = Object.entries(FORMATIONS).map(([k, F]) => `<button data-f="${k}" title="${F.desc || 'The standard line'} (${F.key.toUpperCase()})">${F.name}</button>`).join('');
    el.innerHTML = `<span class="group">${f}</span><span class="group">
      <button data-c="charge" title="Charge the target, or the nearest enemy ahead (C)">Charge</button>
      <button data-c="hold" title="Stand fast: fight only whoever reaches you (G)">Hold</button>
      <button data-c="fire" title="Bows loose at will at anything in range (R)">Fire at will</button>
      <button data-c="burn" title="Set the nearest bridge alight from this bank (B)">Burn bridge</button></span>`;
    el.onclick = e => {
      const btn = e.target.closest('button');
      if (!btn || !this.selection?.size) return;
      const sel = [...this.selection], b = this.battle;
      if (btn.dataset.f) b.setFormation(sel, btn.dataset.f);
      if (btn.dataset.c === 'charge') b.orderCharge(sel);
      if (btn.dataset.c === 'hold') b.setHold(sel, !sel.every(r => r.hold));
      if (btn.dataset.c === 'fire') b.setFireAtWill(sel, !sel.every(r => r.fireAtWill));
      if (btn.dataset.c === 'burn') { const br = this.bridgeFor(sel); if (br) b.orderBurnBridge(sel, br); }
    };
    this.ordersEl = el;
  }

  updateOrders(selection) {
    this.selection = selection;
    const sel = [...selection].filter(r => !r.gone);
    this.ordersEl.classList.toggle('open', sel.length > 0);
    if (!sel.length) return;
    for (const btn of this.ordersEl.querySelectorAll('[data-f]')) {
      const f = btn.dataset.f;
      btn.classList.toggle('on', sel.every(r => r.formation === f));
      btn.disabled = sel.every(r => r.T.engine || r.posts || (f === 'square' && r.T.mounted));
    }
    const on = (k, test) => { const btn = this.ordersEl.querySelector(`[data-c="${k}"]`); btn.classList.toggle('on', sel.every(test)); return btn; };
    on('charge', r => this.battle.time < r.chargeUntil).disabled = sel.every(r => r.T.range || r.T.engine);
    on('hold', r => r.hold);
    on('fire', r => r.fireAtWill).disabled = !sel.some(r => r.T.range);
    // Only shown with a standing bridge near the selection.
    const burn = on('burn', r => !!r.burnBridge);
    burn.hidden = !this.bridgeFor(sel);
  }

  bridgeFor(sel) {
    const b = this.battle;
    if (!b.river) return null;
    for (const r of sel) { const br = b.bridgeNear(r.cx, r.cz, 60); if (br && !r.T.engine) return br; }
    return null;
  }

  // Cards for regiments raised since the last frame; disbanded regiments lose theirs.
  syncCards() {
    const b = this.battle;
    for (const r of b.regs.slice(this.seenRegs)) if (r.side === 0) this.cards.push(this.makeCard(r));
    this.seenRegs = b.regs.length;
    this.cards = this.cards.filter(c => {
      if (c.r.disbanded) c.el.remove();
      return !c.r.disbanded;
    });
  }

  makeCard(r) {
    const el = document.createElement('button');
    el.className = 'card';
    const icon = document.createElement('canvas');
    icon.width = icon.height = 44;
    const ctx = icon.getContext('2d');
    ctx.fillStyle = SIDE_COLORS[0];
    ctx.fillRect(0, 0, 44, 44);
    drawIcon(ctx, r.T.key, 22, 22, 30);
    el.append(icon);
    el.insertAdjacentHTML('beforeend', `
      <span class="name">${r.name}</span>
      <span class="bar strength"><i></i></span>
      <span class="bar morale"><i></i></span>
      <span class="state"></span>`);
    el.title = r.T.role || '';
    el.onclick = e => this.hooks.selectCard(r, e.shiftKey);
    el.ondblclick = () => this.hooks.focus(r);
    this.cardsEl.append(el);
    return { r, el, strength: el.querySelector('.strength i'), morale: el.querySelector('.morale i'), state: el.querySelector('.state') };
  }

  update(selection, paused, speed) {
    const b = this.battle;
    this.syncCards();
    for (const c of this.cards) {
      const r = c.r;
      c.strength.style.width = (100 * Math.max(0, r.alive) / r.initial) + '%';
      c.morale.style.width = (100 * Math.max(0, r.morale) / r.T.morale) + '%';
      const doing = b.doingLabel(r), E = r.engine;
      const extra = [b.vetLabel(r), r.gone ? '' : b.fatigueLabel(r), b.arrowsLabel(r)].filter(Boolean).map(t => ' · ' + t).join('');
      c.state.textContent = `${Math.max(0, r.alive)} · ${b.moraleLabel(r)}${doing ? ' · ' + doing : ''}${extra}${E?.maxHp && !r.gone ? ` · ${Math.max(0, Math.round(100 * E.hp / E.maxHp))}%` : ''}`;
      c.el.classList.toggle('selected', selection.has(r));
      c.el.classList.toggle('routing', r.routing);
      c.el.classList.toggle('regrouping', r.regrouping);
      c.el.classList.toggle('gone', r.gone);
    }
    this.updateOrders(selection);
    this.deployEl.classList.toggle('open', b.deploying?.side === 0);
    const men = side => b.regs.filter(r => r.side === side && !r.gone && !r.routing && !r.regrouping).reduce((n, r) => n + r.alive, 0);
    document.getElementById('strength').innerHTML =
      `<b style="color:${SIDE_COLORS[0]}">${men(0)}</b> men standing &nbsp;·&nbsp; enemy <b style="color:${SIDE_COLORS[1]}">${men(1)}</b>`
      + (b.weather && b.weather !== 'clear' ? ` &nbsp;·&nbsp; ${WEATHER[b.weather].name}` : '');
    const m = Math.floor(b.time / 60), s = Math.floor(b.time % 60);
    document.getElementById('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
    document.getElementById('pause').textContent = paused ? '▶ Resume' : '❚❚ Pause';
    document.body.classList.toggle('paused', paused);
    this.paused = paused;
    document.body.classList.toggle('deploying', !!b.deploying);
    for (const btn of document.querySelectorAll('[data-speed]')) btn.classList.toggle('on', +btn.dataset.speed === speed);

    while (this.seenEvents < b.events.length) {
      const ev = b.events[this.seenEvents++];
      const line = document.createElement('div');
      line.textContent = ev.text;
      line.className = ev.side === 0 ? 'good' : 'bad';
      if (/routing!/.test(ev.text)) line.className = ev.side === 0 ? 'bad' : 'good';
      this.logEl.prepend(line);
      while (this.logEl.children.length > 4) this.logEl.lastChild.remove();
      setTimeout(() => line.classList.add('fade'), 6000);
      setTimeout(() => line.remove(), 7000);
    }
    if (this.endPanel && b.winner !== null && !this.shownEnd) {
      this.shownEnd = true;
      const end = document.getElementById('end');
      end.querySelector('h2').textContent = b.winner === 0 ? 'Victory' : 'Defeat';
      end.querySelector('p').textContent = `Your losses: ${b.losses[0]} · Enemy losses: ${b.losses[1]} · ${document.getElementById('clock').textContent}`;
      end.classList.add('open');
    }
  }
}
