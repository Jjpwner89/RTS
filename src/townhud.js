// Town panels: the stockpile, the build menu, and details of whatever is selected.
// Panels are built once per selection and then only their numbers change, so a
// button never disappears from under the cursor mid-click.
import { ELITE, HALL, GOODS, GOOD_GROUPS, BUILDINGS, BUILD_GROUPS, TEMPLATES, templateCost, KITS, ENGINES, HIRES, UPGRADES, TAXES, listCost } from './economy.js';
import { ico } from './icons.js';

const gi = g => ico(GOODS[g].icon, GOODS[g].color);
// Writes HTML only when it changed, so icons are not rebuilt every frame.
const put = (el, html) => { if (el.dataset.was !== html) { el.dataset.was = html; el.innerHTML = html; } };

const goldIco = () => ico('gold', '#e8c45a');
const moodWord = m => m >= 80 ? 'Joyful' : m >= 62 ? 'Content' : m >= 45 ? 'Settled' : m >= 30 ? 'Uneasy' : m >= 18 ? 'Unhappy' : 'Miserable';
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Build hotkeys: B, then a letter. Each building takes the first letter of its name that
// no earlier building has (C for carpenter, H for house), shown on its button.
export const BUILD_KEYS = {};
{
  const taken = new Set();
  for (const [k, B] of Object.entries(BUILDINGS)) {
    const letter = [...B.name.toLowerCase().replace(/[^a-z]/g, ''), ...'abcdefghijklmnopqrstuvwxyz'].find(c => !taken.has(c));
    taken.add(letter);
    BUILD_KEYS[letter] = k;
  }
}
const KEY_OF = Object.fromEntries(Object.entries(BUILD_KEYS).map(([c, k]) => [k, c]));
// One listener for whichever village is on screen (the last to draw its panels). It runs
// before the camera and battle keys, and takes the letter after B for itself.
let active = null, armed = false;
addEventListener('keydown', e => {
  const hud = active;
  if (!hud || hud.town.hostile || !hud.buildEl.getClientRects().length || e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'INPUT') { armed = false; return; }
  const key = e.key.toLowerCase();
  if (!armed) {
    if (key !== 'b' || e.repeat) return;
    armed = true;
    hud.buildEl.classList.add('armed');
    hud.flash('Build: press a letter');
  } else {
    armed = false;
    hud.buildEl.classList.remove('armed');
    const kind = BUILD_KEYS[key];
    if (kind) {
      hud.tab = BUILDINGS[kind].group;
      hud.hooks.startPlacing(kind);
      hud.flash(`Placing: ${BUILDINGS[kind].name}`);
    }
    if (key === 'escape') hud.flash('');
  }
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

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
    if (town.hostile) this.buildStorm();
    else {
      this.buildStock();
      this.buildMenu();
      // Clicking the alarm takes you to the attackers.
      this.stockEl.onclick = e => {
        if (e.target.closest('.raid.now')) this.hooks.findAttackers?.();
        const tax = e.target.closest('[data-tax]');
        if (tax) town.taxes = Math.max(0, Math.min(TAXES.length - 1, town.taxes + +tax.dataset.tax));
      };
    }
    this.buildEl.hidden = !!town.hostile;
    // onclick rather than addEventListener: a new village's panels replace the old handlers.
    this.infoEl.onclick = e => {
      const btn = e.target.closest('[data-act]');
      if (btn && !btn.disabled) this.act(btn.dataset.act);
    };
  }

  // While you storm a place: who holds it, how the fight goes, and a way out.
  buildStorm() {
    const h = this.town.hostile;
    this.stockEl.innerHTML = `
      <div class="people"><span>${ico('battle', '#ff8a5a')} Storming the village</span></div>
      <p class="storm" data-s="theirs"></p><p class="storm" data-s="ours"></p><p class="storm" data-s="burned"></p>
      <p class="note">Beat or rout every defender and the place is yours as it stands. Select one of their buildings to burn it: it costs them dearly even if you fall back, but you lose it too if you win.</p>
      <button data-act="pullback" class="wide"><span>Pull back</span><small>march away and keep your men</small></button>`;
    this.stockEl.style.setProperty('--hc', h.color);
    this.stockEl.onclick = e => { if (e.target.closest('[data-act="pullback"]')) this.hooks.pullBack?.(); };
    this.buildEl.innerHTML = '';
  }

  updateStorm() {
    const t = this.town, b = t.battle;
    const count = side => b.regs.filter(r => r.side === side && !r.gone && !r.routing).reduce((n, r) => n + r.alive, 0);
    const set = (k, v) => put(this.stockEl.querySelector(`[data-s="${k}"]`), v);
    set('theirs', `<b style="color:${t.hostile.color}">${t.hostile.name}</b>: ${count(1)} defenders standing`);
    set('ours', `<b>Your men</b>: ${count(0)} standing`);
    const burned = t.buildings.filter(o => o.state === 'ruined').length;
    set('burned', burned ? `${burned} of their buildings burned` : '');
  }

  buildStock() {
    this.stockEl.innerHTML = `
      <div class="people"><span data-s="pop"></span><span data-s="idle"></span></div>
      <div class="people mood"><span data-s="mood"></span><span class="tax"><button data-tax="-1" title="Lower taxes">−</button><span data-s="tax"></span><button data-tax="1" title="Raise taxes">+</button></span></div>
      <div class="people"><span data-s="gold"></span></div>
      <div class="warn" data-s="hunger"></div>
      <div class="raid" data-s="raid"></div>
      ${GOOD_GROUPS.map(([label, goods]) => `
        <h4>${label}</h4>
        <div class="goods">${goods.map(g => `<span title="${GOODS[g].name}">${gi(g)}<b data-g="${g}">0</b></span>`).join('')}</div>`).join('')}`;
    this.goodEls = [...this.stockEl.querySelectorAll('[data-g]')];
  }

  buildMenu() {
    const tabs = [...BUILD_GROUPS, 'Towns'].map(g => `<button class="tab" data-tab="${g}">${g}</button>`).join('');
    const items = Object.entries(BUILDINGS).map(([k, B]) => `
      <button class="item" data-build="${k}" data-group="${B.group}" title="${B.desc}">
        ${ico(B.icon)}<span>${B.name}</span><small>${listCost(B.cost)}</small><kbd>${KEY_OF[k].toUpperCase()}</kbd>
      </button>`).join('') + Object.entries(TEMPLATES).map(([k, T]) => `
      <button class="item" data-build="tpl:${k}" data-group="Towns" title="${T.focus}: ${T.desc}">
        ${ico(T.icon)}<span>${T.name}</span><small>${listCost(templateCost(k))}</small>
      </button>`).join('') + `<p class="locked" data-group="Towns">Town templates come with the rank of Lord.</p>`;
    this.buildEl.innerHTML = `<div class="tabs">${tabs}</div><div class="items">${items}</div><div class="hint">Click to place, and again for more · right-click or Esc to stop · <b>B</b> then a letter picks a building</div>`;
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
    if (!text) { this.toastEl.classList.remove('show'); return; }
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  update(selected, regs, placing) {
    const t = this.town, s = t.stock;
    active = this;
    if (t.hostile) { this.updateStorm(); this.updateInfo(selected, regs); return; }
    for (const el of this.goodEls) el.textContent = Math.floor(s[el.dataset.g]);
    const set = (k, v) => put(this.stockEl.querySelector(`[data-s="${k}"]`), v);
    set('pop', `${ico('people')} ${t.population} / ${t.housing}`);
    set('idle', `${t.hauling} carrying · ${t.idle} idle`);
    const m = Math.round(t.mood);
    set('mood', `<span class="${m < 30 ? 'bad' : m >= 62 ? 'good' : ''}">${moodWord(m)} (${m})</span>`);
    this.stockEl.querySelector('[data-s="mood"]').title = t.moodWhy.map(([n, w]) => `${n > 0 ? '+' : ''}${n} ${w}`).join('\n') || 'Nothing much either way';
    set('tax', TAXES[t.taxes].name);
    set('gold', `${goldIco()} ${Math.floor(t.purse.gold)} gold · taxes ${(t.population * t.taxRate * 60).toFixed(0)}/min`);
    set('hunger', t.misery > 30 ? `The village is close to revolt! Lift the mood within ${Math.max(0, Math.ceil(120 - t.misery))} s.` : t.mood < 20 ? 'The village is miserable: families are leaving.' : t.hungry ? 'Food has run out: nobody new will settle.' : t.population >= t.housing ? 'No room: build houses to grow.' : '');
    set('raid', t.underAttack ? `${ico('battle', '#ff8a5a')} Under attack! <u>Show me</u>` : t.timedRaids ? `Bandits expected in ${clock(t.raid.next)}` : 'At peace');
    this.stockEl.querySelector('.raid').classList.toggle('now', t.underAttack);

    for (const el of this.tabEls) el.classList.toggle('on', el.dataset.tab === this.tab);
    const lord = this.hooks.templates?.() ?? true, locked = this.buildEl.querySelector('.locked');
    if (locked) locked.hidden = this.tab !== 'Towns' || lord;
    for (const el of this.itemEls) {
      const tpl = el.dataset.build.startsWith('tpl:');
      el.hidden = el.dataset.group !== this.tab || (tpl && !lord);
      el.classList.toggle('poor', !t.canAfford(tpl ? templateCost(el.dataset.build.slice(4)) : BUILDINGS[el.dataset.build].cost));
      el.classList.toggle('on', placing === el.dataset.build);
    }
    this.updateInfo(selected, regs);
  }

  // ---- the details panel ----

  updateInfo(selected, regs) {
    const reg = !selected && regs.length === 1 ? regs[0] : null;
    const key = selected ? `b${selected.id || 'keep'}:${selected.state}:${selected.level || 1}` : reg ? `r${reg.id}` : '';
    this.selected = selected;
    this.reg = reg;
    if (key !== this.infoKey) {
      this.infoKey = key;
      this.infoEl.innerHTML = selected ? this.buildingHtml(selected) : reg ? this.regHtml(reg) : '';
      this.infoEl.hidden = !key;
    }
    if (!key) return;
    for (const el of this.infoEl.querySelectorAll('[data-f]')) put(el, this.field(el.dataset.f));
    for (const el of this.infoEl.querySelectorAll('[data-act]')) {
      const [ok, title] = this.allowed(el.dataset.act);
      el.disabled = !ok;
      el.title = title || '';
      if (el.dataset.act.startsWith('raise:')) el.querySelector('small').textContent = title || `${this.town.levyCheck(el.dataset.act.slice(6), selected).n} men`;
      if (el.dataset.act === 'upgrade') { const c = this.town.upgradeCheck(selected); el.hidden = !!c.done; el.querySelector('small').textContent = c.ok ? 'ready' : c.reason; }
      if (el.dataset.act.startsWith('engine:') || el.dataset.act.startsWith('hire:')) el.querySelector('small').textContent = title || 'ready';
      if (el.dataset.act.startsWith('train:')) { const c = this.town.trainCheck(el.dataset.act.slice(6), selected); el.querySelector('small').textContent = c.ok ? `${c.n} men` : c.reason; }
      if (el.dataset.act.startsWith('co:')) {
        const c = this.hooks.companies().find(o => o.id === +el.dataset.act.slice(3));
        el.querySelector('small').textContent = c ? `${c.status} · ${c.wage} gold a minute` : '';
      }
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
    const rows = [`<h3>${ico(B.icon)} ${B.name}${(b.level || 1) > 1 ? ` <small>level ${b.level}</small>` : ''}</h3>`, `<p class="status" data-f="status"></p>`];
    if (this.town.hostile) {
      rows.push(`<p data-f="hp"></p>`);
      if (b.kind === 'keep') rows.push(`<p class="note">Their keep. Beat or rout the men defending it and the place is yours.</p>`);
      else if (b.state !== 'ruined') rows.push(`<button data-act="burn" class="wide"><span>Burn it</span><small>sends your nearest free regiment with torches</small></button>`);
      return rows.join('');
    }
    if (b.kind === 'keep') {
      rows.push(`<p data-f="workers"></p><p data-f="hp"></p><p class="store" data-f="store"></p>`,
        `<p class="note">Home for 12 villagers and a store for any goods. Its two haulers, and anyone without a job, carry crates where they are needed. Villagers shelter here during raids, and broken regiments regroup here. If it falls, the town is lost.</p>`,
        `<h4>The village's mood</h4><p class="note" data-f="mood"></p>`,
        `<button data-act="governor" class="wide"><span data-f="gov"></span><small>builds houses, farms and the like while you are away</small></button>`,
        `<h4>Hire men</h4><p class="note">Paid in gold from your treasury. They cost no villagers.</p>`,
        ...HIRES.filter(h => !this.hooks.companies || h.key === 'household').map(h => `<button data-act="hire:${h.key}" class="wide"><span>${h.count} ${h.name.toLowerCase()} · ${h.gold} ${goldIco()}</span><small></small></button>`));
      // Mercenary companies (on the campaign map): a price to hire, then wages every minute.
      if (this.hooks.companies) rows.push(`<h4>Mercenary companies</h4><p class="note">A price to hire, then wages every minute. Unpaid, they desert. They never work, and a company in the village sours its mood.</p>`,
        ...this.hooks.companies().map(c => `<button data-act="co:${c.id}" class="wide"><span>${c.name[0].toUpperCase() + c.name.slice(1)}: ${c.size} ${c.unit}</span><small></small></button>`));
      return rows.join('');
    }
    if (b.state === 'site') rows.push(`<p data-f="progress"></p><p data-f="materials"></p>`);
    if (B.jobs) rows.push(`<p data-f="workers"></p>`);
    rows.push(`<p data-f="hp"></p>`);
    if (b.state === 'active' && (B.storage || B.gather || B.recipes || b.kind === 'barracks')) rows.push(`<p class="store" data-f="store"></p>`);
    if (B.storage) rows.push(`<p class="note">Haulers carry goods from here, and from the buildings nearby, to wherever they are needed. Build it close to your workshops to save them walking.</p>`);
    if (B.gather) rows.push(`<p class="note">Brings in ${Object.entries(B.gather.out).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(' and ')} each trip, and stacks it here until haulers take it away.</p>`);
    if (B.recipes) {
      rows.push(`<div class="recipes">${B.recipes.map((r, i) => `<button data-act="recipe:${i}" class="recipe"><span>${this.goodsList(r.in)} → ${r.gold ? `${r.gold} ${goldIco()}` : this.goodsList(r.out)}</span><small></small></button>`).join('')}</div>`);
      if (b.kind === 'market') rows.push(`<p class="note">Sells only what is spare: wood above ${B.recipes[0].above}, stone above ${B.recipes[1].above}, food above ${B.recipes[2].above}, and so on. The gold goes to your treasury.</p>`);
      else if (B.recipes.length > 1) rows.push(`<p class="note">Click to switch what this workshop makes. With several on, it takes turns. Build a second one to make both at full speed.</p>`);
    }
    if (B.housing) rows.push(`<p class="note">Room for ${B.housing + 3 * ((b.level || 1) - 1)} more villagers.</p>`);
    if (B.mood) rows.push(`<p class="note">Lifts the village's mood by ${B.mood}.</p>`);
    if (B.engines && b.state === 'active') {
      rows.push(`<h4>Build an engine</h4><p class="note">Materials must be carried here first. Villagers go with it as crew.</p>`);
      for (const [k, E] of Object.entries(ENGINES)) rows.push(`<button data-act="engine:${k}" class="wide"><span>${E.name} · ${E.crew} crew</span><small></small></button><p class="kit">needs ${this.goodsList(E.cost)} in this workshop</p>`);
    }
    if (b.B.hall && b.state === 'active') {
      rows.push(`<h4>Train elite men</h4><p class="note">Only veterans may train: villagers who fought as levies and came home (${this.town.veterans().length} in the village). A few at a time, for their kit, a fee and minutes of drill each. The hall keeps ${HALL.cap} men at most.</p>`);
      for (const [k, E] of Object.entries(ELITE)) rows.push(`<button data-act="train:${k}" class="wide"><span>${KITS[k].name}</span><small></small></button><p class="kit">each needs ${this.goodsList(KITS[k].kit)}, ${E.fee} ${goldIco()} and ${Math.round(E.drill / 60 * 10) / 10} min of drill</p>`);
    }
    if (b.kind === 'barracks' && b.state === 'active') {
      rows.push(`<h4>Call up a levy</h4><p class="note">Arms must be carried here first. Haulers bring them from the workshops and stores.</p>`);
      for (const [k, K] of Object.entries(KITS)) {
        if (ELITE[k]) continue;
        rows.push(`<button data-act="raise:${k}" class="wide"><span>${K.name}</span><small></small></button><p class="kit">each needs ${this.goodsList(K.kit)} in this barracks</p>`);
      }
      rows.push(`<p class="note">Men-at-arms and knights are trained in a knights' hall, from veterans.</p>`);
    }
    if (b.state === 'active' && UPGRADES[2] && b.kind !== 'well') {
      const U = UPGRADES[(b.level || 1) + 1];
      if (U) rows.push(`<button data-act="upgrade" class="wide"><span>Upgrade to level ${(b.level || 1) + 1} · ${U.gold} ${goldIco()} + ${this.goodsList(U.cost)}</span><small></small></button>`);
    }
    const buttons = [];
    if (B.jobs && b.state === 'active') buttons.push(`<button data-act="pause"></button>`);
    buttons.push(`<button data-act="demolish">${b.state === 'ruined' ? 'Clear ruin' : 'Demolish'}</button>`);
    rows.push(`<div class="row">${buttons.join('')}</div>`);
    return rows.join('');
  }

  regHtml(r) {
    const rows = [`<h3>${r.name}</h3>`, `<p data-f="men"></p>`, `<p class="status" data-f="morale"></p>`];
    const co = this.hooks.companyOf?.(r);
    if (co) rows.push(`<p class="note">A mercenary company under ${co.captain}. Wages: ${co.wage} gold a minute, from your treasury.${co.unpaid ? ' <b class="bad">They are owed pay.</b>' : ''}</p>`,
      `<button data-act="dismiss" class="wide"><span>Dismiss them</span><small>they leave your service; no refund</small></button>`);
    else if (r.elite) rows.push(`<p class="note">Trained in your knights' hall from veterans. Slow to replace: losing them hurts.</p>`,
      `<button data-act="disband" class="wide"><span>Stand them down</span><small>they go home to work; their kit goes back to the racks</small></button>`);
    else if (r.levy) rows.push(`<button data-act="disband" class="wide"><span>Disband</span><small>send them home to work</small></button>`);
    else if (r.retinue) rows.push(`<p class="note">Your own household troops. They cost no villagers.</p>`,
      `<button data-act="disband" class="wide"><span>Send them to work</span><small>kit goes to the stores</small></button>`);
    return rows.join('');
  }

  goodsList(goods) { return Object.entries(goods).map(([g, n]) => `${n} ${gi(g)}`).join(' + '); }

  field(f) {
    const b = this.selected, r = this.reg;
    if (f === 'status') return this.town.hostile ? (b.state === 'ruined' ? b.status : `Held by ${this.town.hostile.name}`) : b.state === 'ruined' ? b.status : b.kind === 'keep' ? `${this.town.population} villagers · ${b.status.toLowerCase()}` : b.status;
    if (f === 'progress') return `Built: ${Math.floor(b.progress * 100)}% · builders: ${b.builders.length}`;
    if (f === 'materials') return `Materials here: ${Object.entries(b.B.cost).map(([g, n]) => `${Math.floor(b.store[g] || 0)}/${n} ${gi(g)}`).join(' · ')}`;
    if (f === 'gov') return this.town.governor === false ? 'Governor: off' : 'Governor: on';
    if (f === 'workers') return `${b.B.haul ? 'Haulers' : 'Workers'}: ${b.workers.length} / ${this.town.jobs(b)}`;
    if (f === 'mood') return `${moodWord(this.town.mood)} (${Math.round(this.town.mood)}): ${this.town.moodWhy.map(([n, w]) => `${n > 0 ? '+' : ''}${n} ${w}`).join(', ') || 'nothing much either way'}. A happy village grows faster and pays more tax; a miserable one loses families.`;
    if (f === 'store') {
      const held = Object.entries(b.store).filter(([, n]) => n >= 1);
      return held.length ? `Holds: ${held.map(([g, n]) => `${Math.floor(n)} ${gi(g)}`).join(' · ')}` : 'Holds nothing';
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
    if (act === 'upgrade') { const c = t.upgradeCheck(this.selected); return [c.ok, c.reason]; }
    if (act.startsWith('engine:')) { const c = t.engineCheck(act.slice(7), this.selected); return [c.ok, c.reason]; }
    if (act.startsWith('hire:')) { const c = t.hireCheck(act.slice(5)); return [c.ok, c.reason]; }
    if (act.startsWith('train:')) { const c = t.trainCheck(act.slice(6), this.selected); return [c.ok, c.reason]; }
    if (act.startsWith('co:')) { const c = this.hooks.companies().find(o => o.id === +act.slice(3)); return [!!c?.ok, c?.why]; }
    return [true];
  }

  act(act) {
    const t = this.town;
    if (act === 'burn') {
      const r = t.burn(this.selected);
      this.flash(r ? `${r.name} go to burn the ${this.selected.B.name.toLowerCase()}.` : 'No regiment is free to send.');
      return;
    }
    if (act.startsWith('recipe:')) t.toggleRecipe(this.selected, +act.slice(7));
    if (act === 'pause') t.setPaused(this.selected, !this.selected.paused);
    if (act === 'demolish') { t.demolish(this.selected); this.hooks.deselect(); }
    if (act === 'disband' && t.disband(this.reg)) this.hooks.deselect();
    if (act === 'upgrade') { const r = t.upgrade(this.selected); if (!r.ok) this.flash(r.reason); }
    if (act === 'governor') t.governor = t.governor === false;
    if (act.startsWith('engine:') || act.startsWith('hire:')) {
      const res = act.startsWith('engine:') ? t.buildEngine(act.slice(7), this.selected) : t.hire(act.slice(5));
      if (!res.ok) this.flash(res.reason);
      else this.hooks.selectRegiment(res.reg);
    }
    if (act.startsWith('train:')) { const r = t.train(act.slice(6), this.selected); if (!r.ok) this.flash(r.reason); }
    if (act.startsWith('co:')) { const r = this.hooks.hireCompany(+act.slice(3)); if (!r.ok) this.flash(r.why || r.reason); }
    if (act === 'dismiss') { this.hooks.dismissCompany(this.reg); this.hooks.deselect(); }
    if (act.startsWith('raise:')) {
      const res = t.raise(act.slice(6), this.selected);
      if (!res.ok) this.flash(res.reason);
      else this.hooks.selectRegiment(res.reg);
    }
  }
}
