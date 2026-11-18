// Regiment cards along the bottom, time controls on top, and battle messages.
import { drawIcon, SIDE_COLORS } from './view.js';

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
      c.state.textContent = `${Math.max(0, r.alive)} · ${b.moraleLabel(r)}`;
      c.el.classList.toggle('selected', selection.has(r));
      c.el.classList.toggle('routing', r.routing);
      c.el.classList.toggle('regrouping', r.regrouping);
      c.el.classList.toggle('gone', r.gone);
    }
    const men = side => b.regs.filter(r => r.side === side && !r.gone && !r.routing && !r.regrouping).reduce((n, r) => n + r.alive, 0);
    document.getElementById('strength').innerHTML =
      `<b style="color:${SIDE_COLORS[0]}">${men(0)}</b> men standing &nbsp;·&nbsp; enemy <b style="color:${SIDE_COLORS[1]}">${men(1)}</b>`;
    const m = Math.floor(b.time / 60), s = Math.floor(b.time % 60);
    document.getElementById('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
    document.getElementById('pause').textContent = paused ? '▶ Resume' : '❚❚ Pause';
    document.body.classList.toggle('paused', paused);
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
