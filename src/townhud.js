// Town panels: the stockpile, the build menu, and details of whatever is selected.
// Panels are built once per selection and then only their numbers change, so a
// button never disappears from under the cursor mid-click.
import { GOODS, GOOD_GROUPS, BUILDINGS, BUILD_GROUPS, KITS, listCost } from './economy.js';

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class TownHud {
  constructor(town, hooks) {
    this.town = town;
    this.hooks = hooks;
    this.stockEl = document.getElementById('stock');
    this.buildEl = document.getElementById('build');
    this.infoEl = document.getElementById('info');
    this.toastEl = document.getElementById('toast');
    this.tab = 'Village';
    this.infoKey = null;
    this.buildStock();
    this.buildMenu();
    // onclick rather than addEventListener: a new village's panels replace the old handlers.
    this.infoEl.onclick = e => {
      const btn = e.target.closest('[data-act]');
      if (btn && !btn.disabled) this.act(btn.dataset.act);
    };
  }

  buildStock() {
    this.stockEl.innerHTML = `
      <div class="people"><span data-s="pop"></span><span data-s="idle"></span></div>
      <div class="warn" data-s="hunger"></div>
      <div class="raid" data-s="raid"></div>
      ${GOOD_GROUPS.map(([label, goods]) => `
        <h4>${label}</h4>
        <div class="goods">${goods.map(g => `<span title="${GOODS[g].name}"><i>${GOODS[g].icon}</i><b data-g="${g}">0</b></span>`).join('')}</div>`).join('')}`;
    this.goodEls = [...this.stockEl.querySelectorAll('[data-g]')];
  }

  buildMenu() {
    const tabs = BUILD_GROUPS.map(g => `<button class="tab" data-tab="${g}">${g}</button>`).join('');
    const items = Object.entries(BUILDINGS).map(([k, B]) => `
      <button class="item" data-build="${k}" data-group="${B.group}" title="${B.desc}">
        <i>${B.icon}</i><span>${B.name}</span><small>${listCost(B.cost)}</small>
      </button>`).join('');
    this.buildEl.innerHTML = `<div class="tabs">${tabs}</div><div class="items">${items}</div><div class="hint">Shift-click to place several · right-click or Esc to stop</div>`;
    this.buildEl.onclick = e => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; return; }
      const item = e.target.closest('[data-build]');
      if (item) this.hooks.startPlacing(item.dataset.build);
    };
    this.itemEls = [...this.buildEl.querySelectorAll('[data-build]')];
    this.tabEls = [...this.buildEl.querySelectorAll('[data-tab]')];
  }

  flash(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  update(selected, regs, placing) {
    const t = this.town, s = t.stock;
    for (const el of this.goodEls) el.textContent = Math.floor(s[el.dataset.g]);
    const set = (k, v) => { this.stockEl.querySelector(`[data-s="${k}"]`).textContent = v; };
    set('pop', `👥 ${t.population} / ${t.housing}`);
    set('idle', `${t.hauling} carrying · ${t.idle} idle`);
    set('hunger', t.hungry ? 'Food has run out: nobody new will settle.' : t.population >= t.housing ? 'No room: build houses to grow.' : '');
    set('raid', t.underAttack ? '⚔️ Under attack!' : t.timedRaids ? `Bandits expected in ${clock(t.raid.next)}` : 'At peace');
    this.stockEl.querySelector('.raid').classList.toggle('now', t.underAttack);

    for (const el of this.tabEls) el.classList.toggle('on', el.dataset.tab === this.tab);
    for (const el of this.itemEls) {
      el.hidden = el.dataset.group !== this.tab;
      el.classList.toggle('poor', !t.canAfford(BUILDINGS[el.dataset.build].cost));
      el.classList.toggle('on', placing === el.dataset.build);
    }
    this.updateInfo(selected, regs);
  }

  // ---- the details panel ----

  updateInfo(selected, regs) {
    const reg = !selected && regs.length === 1 ? regs[0] : null;
    const key = selected ? `b${selected.id || 'keep'}:${selected.state}` : reg ? `r${reg.id}` : '';
    this.selected = selected;
    this.reg = reg;
    if (key !== this.infoKey) {
      this.infoKey = key;
      this.infoEl.innerHTML = selected ? this.buildingHtml(selected) : reg ? this.regHtml(reg) : '';
      this.infoEl.hidden = !key;
    }
    if (!key) return;
    for (const el of this.infoEl.querySelectorAll('[data-f]')) el.textContent = this.field(el.dataset.f);
    for (const el of this.infoEl.querySelectorAll('[data-act]')) {
      const [ok, title] = this.allowed(el.dataset.act);
      el.disabled = !ok;
      el.title = title || '';
      if (el.dataset.act.startsWith('raise:')) el.querySelector('small').textContent = title || `${this.town.levyCheck(el.dataset.act.slice(6), selected).n} men`;
      if (el.dataset.act === 'pause') el.textContent = selected.paused ? 'Resume work' : 'Pause work';
      if (el.dataset.act.startsWith('recipe:')) {
        const off = selected.off.has(+el.dataset.act.slice(7));
        el.classList.toggle('on', !off);
        el.querySelector('small').textContent = off ? 'off' : 'on';
      }
    }
  }

  buildingHtml(b) {
    const B = b.B;
    const rows = [`<h3><i>${B.icon}</i> ${B.name}</h3>`, `<p class="status" data-f="status"></p>`];
    if (b.kind === 'keep') {
      rows.push(`<p data-f="workers"></p><p data-f="hp"></p><p class="store" data-f="store"></p>`,
        `<p class="note">Home for 12 villagers and a store for any goods. Its two haulers, and anyone without a job, carry crates where they are needed. Villagers shelter here during raids, and broken regiments regroup here. If it falls, the town is lost.</p>`);
      return rows.join('');
    }
    if (b.state === 'site') rows.push(`<p data-f="progress"></p><p data-f="materials"></p>`);
    if (B.jobs) rows.push(`<p data-f="workers"></p>`);
    rows.push(`<p data-f="hp"></p>`);
    if (b.state === 'active' && (B.storage || B.gather || B.recipes || b.kind === 'barracks')) rows.push(`<p class="store" data-f="store"></p>`);
    if (B.storage) rows.push(`<p class="note">Haulers carry goods from here, and from the buildings nearby, to wherever they are needed. Build it close to your workshops to save them walking.</p>`);
    if (B.gather) rows.push(`<p class="note">Brings in ${Object.entries(B.gather.out).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(' and ')} each trip, and stacks it here until haulers take it away.</p>`);
    if (B.recipes) {
      rows.push(`<div class="recipes">${B.recipes.map((r, i) => `<button data-act="recipe:${i}" class="recipe"><span>${this.goodsList(r.in)} → ${this.goodsList(r.out)}</span><small></small></button>`).join('')}</div>`);
      if (B.recipes.length > 1) rows.push(`<p class="note">Click to switch what this workshop makes. With several on, it takes turns. Build a second one to make both at full speed.</p>`);
    }
    if (B.housing) rows.push(`<p class="note">Room for ${B.housing} more villagers.</p>`);
    if (b.kind === 'barracks' && b.state === 'active') {
      rows.push(`<h4>Call up a levy</h4><p class="note">Arms must be carried here first. Haulers bring them from the workshops and stores.</p>`);
      for (const [k, K] of Object.entries(KITS)) {
        rows.push(`<button data-act="raise:${k}" class="wide"><span>${K.name}</span><small></small></button><p class="kit">each needs ${this.goodsList(K.kit)} in this barracks</p>`);
      }
    }
    const buttons = [];
    if (B.jobs && b.state === 'active') buttons.push(`<button data-act="pause"></button>`);
    buttons.push(`<button data-act="demolish">${b.state === 'ruined' ? 'Clear ruin' : 'Demolish'}</button>`);
    rows.push(`<div class="row">${buttons.join('')}</div>`);
    return rows.join('');
  }

  regHtml(r) {
    const rows = [`<h3>${r.name}</h3>`, `<p data-f="men"></p>`, `<p class="status" data-f="morale"></p>`];
    if (r.levy) rows.push(`<button data-act="disband" class="wide"><span>Disband</span><small>send them home to work</small></button>`);
    else if (r.retinue) rows.push(`<p class="note">Your own household troops. They cost no villagers.</p>`,
      `<button data-act="disband" class="wide"><span>Send them to work</span><small>kit goes to the stores</small></button>`);
    return rows.join('');
  }

  goodsList(goods) { return Object.entries(goods).map(([g, n]) => `${n} ${GOODS[g].icon}`).join(' + '); }

  field(f) {
    const b = this.selected, r = this.reg;
    if (f === 'status') return b.state === 'ruined' ? 'Burned by raiders' : b.kind === 'keep' ? `${this.town.population} villagers · ${b.status.toLowerCase()}` : b.status;
    if (f === 'progress') return `Built: ${Math.floor(b.progress * 100)}% · builders: ${b.builders.length}`;
    if (f === 'materials') return `Materials here: ${Object.entries(b.B.cost).map(([g, n]) => `${Math.floor(b.store[g] || 0)}/${n} ${GOODS[g].icon}`).join(' · ')}`;
    if (f === 'workers') return `${b.B.haul ? 'Haulers' : 'Workers'}: ${b.workers.length} / ${b.B.jobs}`;
    if (f === 'store') {
      const held = Object.entries(b.store).filter(([, n]) => n >= 1);
      return held.length ? `Holds: ${held.map(([g, n]) => `${Math.floor(n)} ${GOODS[g].icon}`).join(' · ')}` : 'Holds nothing';
    }
    if (f === 'hp') return `Condition: ${Math.ceil(b.hp)} / ${b.B.hp}`;
    if (f === 'men') return `${r.alive} men${r.levy ? ' (villagers)' : ''}`;
    if (f === 'morale') return this.hooks.moraleLabel(r);
    return '';
  }

  allowed(act) {
    const t = this.town;
    if (act.startsWith('raise:')) { const c = t.levyCheck(act.slice(6), this.selected); return [c.ok, c.reason]; }
    if (act === 'disband') return this.reg && !this.reg.routing ? [true] : [false, 'They are fleeing'];
    return [true];
  }

  act(act) {
    const t = this.town;
    if (act.startsWith('recipe:')) t.toggleRecipe(this.selected, +act.slice(7));
    if (act === 'pause') t.setPaused(this.selected, !this.selected.paused);
    if (act === 'demolish') { t.demolish(this.selected); this.hooks.deselect(); }
    if (act === 'disband' && t.disband(this.reg)) this.hooks.deselect();
    if (act.startsWith('raise:')) {
      const res = t.raise(act.slice(6), this.selected);
      if (!res.ok) this.flash(res.reason);
      else this.hooks.selectRegiment(res.reg);
    }
  }
}
