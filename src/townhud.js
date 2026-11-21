// Town panels: the stockpile, the build menu, and details of whatever is selected.
// Panels are built once per selection and then only their numbers change, so a
// button never disappears from under the cursor mid-click.
import { ROAD, ELITE, HALL, GOODS, GOOD_GROUPS, BUILDINGS, BUILD_GROUPS, TEMPLATES, templateCost, KITS, ENGINES, HIRES, UPGRADES, TAXES, listCost, POLICIES, ARMOUR_NAME, ARMOUR_GOOD, gearOf, FEAST, KEEP_RAISE } from './economy.js';
// A regiment's armour in a few words: "Mail, shields".
const gearText = g => `${ARMOUR_NAME[g.armour]}${g.shield ? ', shields' : ''}`;
import { ico } from './icons.js';
import { watch } from './ui/news.js';

// Folds and the "about" notes are the player's choice, kept between visits and sessions.
const pref = (k, d) => { try { const v = localStorage.getItem(`rts.ui.${k}`); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(`rts.ui.${k}`, v ? '1' : '0'); } catch {} };
// Small windows start with the stores folded to a strip, to leave the village in view.
const small = () => innerWidth < 1100 || innerHeight < 720;
// Goods always worth a cell; the rest show once there is some, or a building here makes or uses them.
const BASIC = new Set(['wood', 'stone', 'food']);
// What each build tab holds, for its tooltip.
const TAB_TIPS = { Village: 'Houses, stores, the market and the church', Gather: 'Wood, stone, ore, food and flax', Craft: 'Workshops: planks, iron, bread, arms and armour (leather armour at the tanner, mail and plate at the armourer)', Military: 'Barracks, stables, siege workshop and watchtowers', Walls: 'Palisades, towers, gates and stone walls', Towns: 'Town templates: a whole quarter laid out at once' };
const CLOSE = '<button class="close-t" title="Close" data-key="Esc">×</button>';

const gi = g => ico(GOODS[g].icon, GOODS[g].color);
// Writes HTML only when it changed, so icons are not rebuilt every frame.
const put = (el, html) => { if (el.dataset.was !== html) { el.dataset.was = html; el.innerHTML = html; } };

const goldIco = () => ico('gold', '#e8c45a');
const moodWord = m => m >= 80 ? 'Joyful' : m >= 62 ? 'Content' : m >= 45 ? 'Settled' : m >= 30 ? 'Uneasy' : m >= 18 ? 'Unhappy' : 'Miserable';
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// What draws newcomers, in a sentence.
const settlerWhy = (t, d) => {
  const food = d.food >= 1 ? 'plenty of food to spare' : d.food > 0 ? 'a little food to spare' : 'no food to spare';
  const name = d.why.length ? d.why.map(([n, w]) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}% ${w}`).join(', ') : 'nothing known of it yet';
  return `${d.rate > 0.05 ? `About ${d.rate.toFixed(1)} a minute` : `None now${d.block ? `: ${d.block}` : ''}`}. Food: ${food} (${t.larder.toFixed(1)} meals a head). Mood: ${moodWord(t.mood).toLowerCase()}. The village's name: ${name}. Houses only make room; newcomers come for food, mood and name, as working adults.`;
};

// Build hotkeys: B, then a letter. Each building takes the first letter of its name that
// no earlier building has (C for carpenter, H for house), shown on its button.
export const BUILD_KEYS = {};
{
  const taken = new Set();
  for (const [k, B] of Object.entries(BUILDINGS)) {
    if (B.camp) continue;   // (found in the north's camps, never built)
    const letter = [...B.name.toLowerCase().replace(/[^a-z]/g, ''), ...'abcdefghijklmnopqrstuvwxyz'].find(c => !taken.has(c));
    taken.add(letter);
    BUILD_KEYS[letter] = k;
  }
  // Paved roads, from the Village tab, if a letter is left over.
  const r = [...'roadpaved', ...'abcdefghijklmnopqrstuvwxyz'].find(c => !taken.has(c));
  if (r) BUILD_KEYS[r] = 'road';
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
      hud.tab = BUILDINGS[kind]?.group || 'Village';
      hud.hooks.startPlacing(kind);
      hud.flash(`Placing: ${BUILDINGS[kind]?.name || 'Paved road'}`);
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
    // What this rank may see (ui/unlocks.js); the village page on its own sees everything.
    this.can = key => this.hooks.unlocked ? this.hooks.unlocked(key) : true;
    if (town.hostile) this.buildStorm();
    else {
      this.buildStock();
      this.buildMenu();
      // Clicking the alarm takes you to the attackers.
      this.stockEl.onclick = e => {
        if (e.target.closest('.fold')) { this.fold(!this.stockEl.classList.contains('folded')); setPref('stock-folded', this.stockEl.classList.contains('folded')); return; }
        // A vassal's village is theirs to run: you may look, not act (creator's call, 2026-11-19).
        if (town.readOnly) return;
        if (e.target.closest('.raid.now')) this.hooks.findAttackers?.();
        // Everyone out: the whole village turns militia while it is attacked.
        if (e.target.closest('[data-act="muster"]')) { const r = town.muster(); if (!r.ok) this.flash(r.reason); }
        if (e.target.closest('[data-act="standdown"]')) town.standDown();
        const tax = e.target.closest('[data-tax]');
        if (tax) town.taxes = Math.max(0, Math.min(TAXES.length - 1, town.taxes + +tax.dataset.tax));
      };
    }
    this.buildEl.hidden = !!town.hostile || !!town.readOnly;
    // onclick rather than addEventListener: a new village's panels replace the old handlers.
    this.infoEl.classList.toggle('about', pref('about', false));
    this.infoEl.onclick = e => {
      if (e.target.closest('.close-t')) { this.hooks.deselect?.(); return; }
      if (e.target.closest('.about-t')) { const on = !this.infoEl.classList.contains('about'); this.infoEl.classList.toggle('about', on); setPref('about', on); return; }
      const btn = e.target.closest('[data-act]');
      if (btn && !btn.disabled) this.act(btn.dataset.act);
    };
  }

  // While you storm a place: who holds it, how the fight goes, and a way out.
  buildStorm() {
    const h = this.town.hostile;
    this.stockEl.innerHTML = `
      <div class="people"><span>${ico('battle', '#ff8a5a')} Storming ${h.where || 'the village'}</span></div>
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
    // A look-round's taxes are the vassal's to set: no − / + there.
    const lever = (d, title, mark) => this.town.readOnly ? '' : `<button data-tax="${d}" title="${title}">${mark}</button>`;
    this.stockEl.innerHTML = `
      <div class="people"><span data-s="pop"></span><span data-s="idle"></span><button class="fold" title="Fold the stores to one strip, to see more of the village"></button></div>
      <div class="people mood"><span data-s="mood"></span><span class="tax">${lever(-1, 'Lower taxes', '−')}<span data-s="tax"></span>${lever(1, 'Raise taxes', '+')}</span></div>
      <div class="people"><span data-s="gold"></span></div>
      <div class="people"><span data-s="settlers"></span></div>
      <div class="warn" data-s="hunger"></div>
      <div class="raid" data-s="raid"></div>
      <button data-act="muster" class="wide muster" hidden><span>Muster the militia</span><small></small></button>
      <button data-act="standdown" class="wide muster" hidden><span>Stand the militia down</span><small>back to their work</small></button>
      ${GOOD_GROUPS.map(([label, goods]) => `
        <h4 data-grp="${label}">${label}</h4>
        <div class="goods" data-grp="${label}">${goods.map(g => `<span title="${GOODS[g].name}" data-cell="${g}" hidden>${gi(g)}<b data-g="${g}">0</b><i class="trend" data-trend="${g}"></i></span>`).join('')}</div>`).join('')}`;
    this.goodEls = [...this.stockEl.querySelectorAll('[data-g]')];
    this.trendEls = new Map([...this.stockEl.querySelectorAll('[data-trend]')].map(e => [e.dataset.trend, e]));
    this.hist = null;
    this.cellEls = [...this.stockEl.querySelectorAll('[data-cell]')];
    this.grpEls = [...this.stockEl.querySelectorAll('[data-grp]')];
    this.fold(pref('stock-folded', small()));
  }

  buildMenu() {
    // Walls holds the defences panel (siegeui.js), docked here rather than a panel of its own.
    const tabs = [...BUILD_GROUPS, 'Walls', 'Towns'].map(g => `<button class="tab" data-tab="${g}" title="${TAB_TIPS[g] || g}">${g}</button>`).join('');
    const items = Object.entries(BUILDINGS).filter(([, B]) => !B.camp).map(([k, B]) => `
      <button class="item" data-build="${k}" data-group="${B.group}" title="${B.desc}">
        ${ico(B.icon)}<span>${B.name}</span><small>${listCost(B.cost)}</small><kbd>${KEY_OF[k].toUpperCase()}</kbd>
      </button>`).join('') + `
      <button class="item" data-build="road" data-group="Village" title="Stone paving between two points: everyone walking on it goes half as fast again. Click where it starts, then where it ends; it carries on from there. Shift-click a road to lift it (half the stone back).">
        ${ico('stone', '#bdb8ad')}<span>Paved road</span><small>1 stone per ${ROAD.perStone} m</small>${KEY_OF.road ? `<kbd>${KEY_OF.road.toUpperCase()}</kbd>` : ''}
      </button>` + Object.entries(TEMPLATES).map(([k, T]) => `
      <button class="item" data-build="tpl:${k}" data-group="Towns" title="${T.focus}: ${T.desc}">
        ${ico(T.icon)}<span>${T.name}</span><small>${listCost(templateCost(k))}</small>
      </button>`).join('');
    this.buildEl.innerHTML = `<div class="tabs">${tabs}</div><div class="items">${items}</div><div class="walls"></div><div class="hint"><kbd>B</kbd> + letter picks · click to place, again for more · <kbd>Esc</kbd> stops</div>`;
    this.wallsEl = this.buildEl.querySelector('.walls');
    this.buildEl.classList.toggle('folded', pref('build-folded', false));
    this.buildEl.onclick = e => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        // The open tab again folds the bar to its tabs, to see more of the village.
        const fold = tab.dataset.tab === this.tab && !this.buildEl.classList.contains('folded');
        this.buildEl.classList.toggle('folded', fold);
        setPref('build-folded', fold);
        this.tab = tab.dataset.tab;
        return;
      }
      const item = e.target.closest('[data-build]');
      if (item) this.hooks.startPlacing(item.dataset.build);
    };
    this.itemEls = [...this.buildEl.querySelectorAll('[data-build]')];
    this.tabEls = [...this.buildEl.querySelectorAll('[data-tab]')];
    // Where each new thing lives, for its introduction (ui/news.js): the button if it is on
    // the open tab, else the tab it is on.
    const at = (sel, tab) => () => { const el = this.buildEl.querySelector(sel); return el && !el.hidden ? el : [this.buildEl.querySelector(`[data-tab="${tab}"]`), true]; };
    watch('towns', () => this.buildEl.querySelector('[data-tab="Towns"]'));
    watch('b:hall', at('[data-build="hall"]', 'Military'));
    watch('b:cathedral', at('[data-build="cathedral"]', 'Village'));
  }

  // The stores folded to one strip: people, gold and the goods in hand, nothing else.
  fold(on) {
    this.stockEl.classList.toggle('folded', on);
    const b = this.stockEl.querySelector('.fold');
    if (b) { b.textContent = on ? '▸' : '▾'; b.title = on ? 'Show the stores in full: mood, taxes, newcomers and every good' : 'Fold the stores to one strip, to see more of the village'; }
  }

  // The left column: the stores above the build bar, never under it. The stores scroll if
  // the window is too short for both (checked a few times a second, not every frame).
  fitColumn() {
    if ((this.fitTick = (this.fitTick || 0) + 1) % 10) return;
    const z = parseFloat(getComputedStyle(this.stockEl).zoom) || 1, top = this.stockEl.getBoundingClientRect().top;
    const floor = this.buildEl.hidden ? innerHeight - 12 : this.buildEl.getBoundingClientRect().top - 8;
    const h = `${Math.max(60, Math.floor((floor - top) / z))}px`;
    if (this.stockEl.style.maxHeight !== h) this.stockEl.style.maxHeight = h;
  }

  // A good earns a cell once there is some, or once a building here gathers, makes or uses
  // it; a group's heading shows with its first cell. Worked out again when buildings change.
  showGoods() {
    const t = this.town, key = t.buildings.length + ':' + t.buildings.filter(b => b.state === 'active').length;
    const want = new Set(BASIC);
    for (const g of Object.keys(t.stock)) if (t.stock[g] >= 1) want.add(g);
    if (key !== this.goodsKey) {
      this.goodsKey = key;
      const uses = this.uses = new Set();
      for (const b of t.buildings) {
        if (b.state === 'ruined') continue;
        for (const g of Object.keys(b.B.gather?.out || {})) uses.add(g);
        for (const r of b.B.recipes || []) for (const g of [...Object.keys(r.in || {}), ...Object.keys(r.out || {})]) uses.add(g);
      }
    }
    for (const g of this.uses) want.add(g);
    for (const el of this.cellEls) el.hidden = !want.has(el.dataset.cell);
    const live = new Set(this.cellEls.filter(c => !c.hidden).map(c => c.parentElement.dataset.grp));
    for (const el of this.grpEls) el.hidden = !live.has(el.dataset.grp);
  }

  // Each good's change over the last minute or so, a minute's worth, so a delivery doesn't flicker it:
  // ▲3 or ▼3 beside the count. Food that is falling with under three minutes in store turns red.
  trends() {
    const t = this.town, s = t.stock, now = t.time;
    if (!this.hist || this.hist.town !== t) this.hist = { town: t, at: -99, rows: [] };
    const h = this.hist;
    if (now < h.at) { h.rows = []; h.at = -99; }   // the clock went back: a new game
    if (now - h.at >= 5) { h.at = now; h.rows.push({ now, v: { ...s } }); while (h.rows.length > 2 && now - h.rows[1].now >= 75) h.rows.shift(); }
    const ref = h.rows[0], span = ref ? now - ref.now : 0;
    for (const [g, el] of this.trendEls) {
      let text = '', cls = '', per = 0;
      if (span >= 30 && !el.parentElement.hidden) {
        per = (s[g] - ref.v[g]) * 60 / span;
        const n = Math.round(per);
        if (Math.abs(per) >= 0.5 && n) {
          text = `${n > 0 ? '▲' : '▼'}${Math.abs(n)}`;
          cls = n > 0 ? 'up' : g === 'food' && s[g] / -per < 3 ? 'down low' : 'down';
        }
      }
      if (el.textContent !== text) el.textContent = text;
      if (el.className !== `trend ${cls}`) el.className = `trend ${cls}`;
      const cell = el.parentElement, tip = text ? `${GOODS[g].name}: ${text.startsWith('▲') ? 'rising' : 'falling'} by about ${text.slice(1).split(' ')[0]} a minute over the last minute${cls.includes('low') ? `; at that rate the stores last about ${Math.max(1, Math.floor(s[g] / -per))} min` : ''}` : '';
      if ((cell.dataset.tip || '') !== tip) { if (tip) cell.dataset.tip = tip; else delete cell.dataset.tip; }
    }
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
    this.showGoods();
    this.trends();
    this.fitColumn();
    const set = (k, v) => put(this.stockEl.querySelector(`[data-s="${k}"]`), v);
    const armed = t.underArms;
    set('pop', `${ico('people')} ${t.population} / ${t.housing}${armed ? ` <small>(${armed} under arms)</small>` : ''}`);
    set('idle', `${t.hauling} carrying · ${t.idle} without a job`);
    const m = Math.round(t.mood);
    set('mood', `<span class="${m < 30 ? 'bad' : m >= 62 ? 'good' : ''}">${moodWord(m)} (${m})</span>`);
    this.stockEl.querySelector('[data-s="mood"]').title = t.moodWhy.map(([n, w]) => `${n > 0 ? '+' : ''}${n} ${w}`).join('\n') || 'Nothing much either way';
    set('tax', t.readOnly ? `${TAXES[t.taxes].name}, set by ${t.readOnly.name}` : TAXES[t.taxes].name);
    set('gold', `${goldIco()} ${Math.floor(t.purse.gold)} gold · taxes ${(t.population * t.taxRate * 60).toFixed(0)}/min`);
    const draw = t.settlers();
    set('settlers', `Newcomers: ${draw.rate > 0.05 ? `about ${draw.rate.toFixed(1)} a minute` : `none (${draw.block || 'the village is unhappy'})`}`);
    this.stockEl.querySelector('[data-s="settlers"]').title = settlerWhy(t, draw);
    set('hunger', t.misery > 30 ? `The village is close to revolt! Lift the mood within ${Math.max(0, Math.ceil(120 - t.misery))} s.` : t.mood < 20 ? 'The village is miserable: families are leaving.' : t.hungry ? 'Food has run out: nobody new will settle.' : t.coldNow ? `The hearths are cold: ${Math.round(t.hearthWood())} wood in the stores, ${Math.ceil(t.hearths * 1.5 / 2)} needed. Woodcutters and haulers need hands.` : t.population >= t.housing ? 'No room: build houses to grow.' : '');
    set('raid', t.underAttack ? `${ico('battle', '#ff8a5a')} Under attack! <u>Show me</u>` : t.timedRaids ? `Bandits expected in ${clock(t.raid.next)}` : 'At peace');
    this.stockEl.querySelector('.raid').classList.toggle('now', t.underAttack);
    const mb = this.stockEl.querySelector('[data-act="muster"]'), sb = this.stockEl.querySelector('[data-act="standdown"]');
    const mc = t.underAttack && !t.readOnly ? t.musterCheck() : null, out = t.militia.length;
    mb.hidden = !mc || (!mc.ok && out > 0);
    if (mc) { mb.disabled = !mc.ok; put(mb.querySelector('small'), mc.ok ? `all ${mc.n} villagers: weak, but every one counts; work stops` : mc.reason); }
    sb.hidden = !out || t.readOnly;

    // Tabs and buildings your rank can't use yet aren't shown at all (DESIGN_NOTES).
    const lord = this.can('towns') && (this.hooks.templates?.() ?? true);
    const shown = el => el.dataset.build.startsWith('tpl:') ? lord : this.can(`b:${el.dataset.build}`);
    if (this.tab === 'Towns' && !lord) this.tab = 'Village';
    const folded = this.buildEl.classList.contains('folded');
    for (const el of this.tabEls) {
      el.classList.toggle('on', el.dataset.tab === this.tab && !folded);
      el.hidden = el.dataset.tab === 'Towns' && !lord;
      const tip = `${TAB_TIPS[el.dataset.tab] || el.dataset.tab}${el.dataset.tab === this.tab && !folded ? '. Click again to fold the bar away' : ''}`;
      if (el.title && el.title !== tip) el.title = tip;
    }
    // The bar keeps the height of its fullest tab, so buttons never move under the cursor.
    const per = {};
    for (const el of this.itemEls) if (shown(el)) per[el.dataset.group] = (per[el.dataset.group] || 0) + 1;
    this.buildEl.style.setProperty('--rows', Math.max(2, ...Object.values(per).map(n => Math.ceil(n / 3))));
    const walls = this.tab === 'Walls', def = document.getElementById('defences');
    if (def && def.parentElement !== this.wallsEl) this.wallsEl.append(def);
    this.buildEl.classList.toggle('walls-on', walls);
    this.buildEl.classList.toggle('no-masons', !this.can('masons'));
    for (const el of this.itemEls) {
      const tpl = el.dataset.build.startsWith('tpl:');
      el.hidden = el.dataset.group !== this.tab || !shown(el);
      const T = tpl && TEMPLATES[el.dataset.build.slice(4)], small = T?.at && t.population < T.at;
      el.classList.toggle('poor', small || !t.canAfford(tpl ? templateCost(el.dataset.build.slice(4)) : BUILDINGS[el.dataset.build]?.cost || { stone: 1 }));
      const tip = T && `${T.focus}: ${T.desc}${T.at ? `\nFor a village of ${T.at} people or more${small ? ` (you have ${t.population})` : ''}.` : ''}`;
      if (T && el.title !== tip) el.title = tip;
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
      if (el.dataset.act.startsWith('raise:')) { const c = this.town.levyCheck(el.dataset.act.slice(6), selected); el.querySelector('small').textContent = title || `${c.n} men · ${gearText(c.fit)}`; }
      if (el.dataset.act.startsWith('policy:')) { el.disabled = false; el.classList.toggle('on', (selected.policy || 'best') === el.dataset.act.slice(7)); }
      if (el.dataset.act === 'refit') { const c = this.town.refitCheck(reg); el.querySelector('small').textContent = c.ok ? `at the ${c.rack.B.name.toLowerCase()}: ${gearText(c.fit)}` : c.reason; }
      if (el.dataset.act === 'upgrade') { const c = this.town.upgradeCheck(selected); el.hidden = !!c.done; el.querySelector('small').textContent = c.ok ? 'ready' : c.reason; }
      if (el.dataset.act.startsWith('engine:') || el.dataset.act.startsWith('hire:')) el.querySelector('small').textContent = title || 'ready';
      if (el.dataset.act.startsWith('train:')) { const c = this.town.trainCheck(el.dataset.act.slice(6), selected); el.querySelector('small').textContent = c.ok ? `${c.n} men` : c.reason; }
      if (el.dataset.act.startsWith('co:')) {
        const c = this.hooks.companies().find(o => o.id === +el.dataset.act.slice(3));
        el.querySelector('small').textContent = c ? `${c.status} · ${c.wage} gold a minute` : '';
      }
      if (el.dataset.act === 'feast') { const c = this.town.feastCheck(); el.querySelector('small').textContent = c.ok ? `${c.gold} gold: the mood +${FEAST.mood} for ${FEAST.secs / 60} minutes` : c.reason; }
      if (el.dataset.act === 'keepraise') { const c = this.town.keepRaiseCheck(); el.hidden = !!c.done; if (c.K) el.querySelector('small').textContent = c.ok ? `${c.K.gold} gold + ${listCost(c.K.cost)}: homes for ${c.K.housing}, the mood +${c.K.mood}` : c.reason; }
      if (el.dataset.act === 'pause') el.textContent = selected.paused ? 'Resume work' : 'Pause work';
      if (el.dataset.act === 'priority') {
        el.textContent = selected.priority ? 'Priority: on' : 'Make it the priority';
        el.classList.toggle('on', !!selected.priority);
        el.title = selected.priority ? 'Click to clear. Only one place at a time is the priority.' : selected.state === 'site' ? 'Up to four builders come first, borrowed from the jobs the village misses least, and its materials are hauled first. Clears the old priority.' : 'Workers fill this place first, and its goods are hauled first. Clears the old priority.';
      }
      if (el.dataset.act.startsWith('recipe:')) {
        const off = selected.off.has(+el.dataset.act.slice(7));
        el.classList.toggle('on', !off);
        el.querySelector('small').textContent = off ? 'off' : 'on';
      }
    }
  }

  buildingHtml(b) {
    const B = b.B;
    const rows = [`<h3>${ico(B.icon)} ${B.name}${(b.level || 1) > 1 ? ` <small>level ${b.level}</small>` : ''}<button class="about-t" title="What this building does: show or hide the notes">?</button>${CLOSE}</h3>`, `<p class="status" data-f="status"></p>`];
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
        `<h4>Newcomers</h4><p class="note" data-f="settlers"></p>`,
        `<button data-act="governor" class="wide"><span data-f="gov"></span><small>builds houses, farms and the like while you are away</small></button>`,
        `<h4>Spend gold</h4>`,
        `<button data-act="feast" class="wide"><span>Hold a feast</span><small></small></button>`,
        ...(this.can('greatkeep') ? [`<button data-act="keepraise" class="wide"><span data-f="keepraise"></span><small></small></button>`] : []),
        `<h4>Hire men</h4><p class="note">Paid in gold from your treasury. They cost no villagers.</p>`,
        ...HIRES.filter(h => !this.hooks.companies || h.key === 'household').map(h => `<button data-act="hire:${h.key}" class="wide"><span>${h.count} ${h.name.toLowerCase()} · ${h.gold} ${goldIco()}</span><small></small></button>`));
      // Mercenary companies (on the campaign map): a price to hire, then wages every minute.
      if (this.hooks.companies && this.can('companies') && this.hooks.companies().length) rows.push(`<h4>Mercenary companies</h4><p class="note">A price to hire, then wages every minute. Unpaid, they desert. They never work, and a company in the village sours its mood.</p>`,
        ...this.hooks.companies().map(c => `<button data-act="co:${c.id}" class="wide"><span>${c.name[0].toUpperCase() + c.name.slice(1)}: ${c.size} ${c.unit}</span><small></small></button>`));
      return rows.join('');
    }
    if (b.state === 'site') rows.push(`<p data-f="progress"></p><p data-f="materials"></p>`);
    if (B.jobs) rows.push(`<p class="staff" data-f="workers"></p>`, ...(b.state === 'active' ? [`<div class="row staff"><button data-act="staff:-1" title="Fewer workers here">−</button><span>workers wanted</span><button data-act="staff:1" title="More workers here">+</button></div>`] : []));
    if (B.gather?.game && b.state === 'active') rows.push(`<p data-f="game"></p>`);
    if (B.gather && (B.gather.node === 'rock' || B.gather.node === 'ore') && b.state === 'active') rows.push(`<p data-f="deposit"></p>`);
    rows.push(`<p data-f="hp"></p>`);
    if (b.state === 'active' && (B.storage || B.gather || B.recipes || b.kind === 'barracks')) rows.push(`<p class="store" data-f="store"></p>`);
    if (B.storage) rows.push(`<p class="note">Haulers carry goods from here, and from the buildings nearby, to wherever they are needed. Build it close to your workshops to save them walking.</p>`);
    if (B.gather) rows.push(`<p class="note">Brings in ${Object.entries(B.gather.out).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(' and ')} each trip, and stacks it here until haulers take it away.</p>`);
    if (B.recipes) {
      rows.push(`<div class="recipes">${B.recipes.map((r, i) => `<button data-act="recipe:${i}" class="recipe"><span>${this.goodsList(r.in)} → ${r.gold ? `${r.gold} ${goldIco()}` : this.goodsList(r.out)}</span><small></small></button>`).join('')}</div>`);
      if (b.kind === 'market') rows.push(`<p class="note">Sells only what is spare: wood above ${B.recipes[0].above}, stone above ${B.recipes[1].above}, food above ${B.recipes[2].above}, and so on. The gold goes to your treasury.</p>`);
      else if (B.recipes.length > 1) rows.push(`<p class="note">Click to switch what this workshop makes. With several on, it takes turns. Build a second one to make both at full speed.</p>`);
    }
    if (B.housing) rows.push(`<p class="note">Room for ${B.housing + 3 * ((b.level || 1) - 1)} more villagers. Its hearth burns a little wood. Houses only make room: newcomers come for spare food, a good mood and the village's name.</p>`);
    if (B.mood) rows.push(`<p class="note">Lifts the village's mood by ${B.mood}.</p>`);
    if (B.engines && b.state === 'active') {
      rows.push(`<h4>Build an engine</h4><p class="note">Materials must be carried here first. Villagers go with it as crew.</p>`);
      for (const [k, E] of Object.entries(ENGINES)) rows.push(`<button data-act="engine:${k}" class="wide"><span>${E.name} · ${E.crew} crew</span><small></small></button><p class="kit">needs ${this.goodsList(E.cost)} in this workshop</p>`);
    }
    if (b.B.hall && b.state === 'active') {
      rows.push(`<h4>Train elite men</h4><p class="note">Only veterans may train: villagers who fought as levies and came home (${this.town.veterans().length} in the village). A few at a time, for their kit, a fee and minutes of drill each. The hall keeps ${HALL.cap} men at most.${this.hooks.companies ? ` On campaign they draw pay from your treasury: ${ELITE.maa.pay} gold a minute for a man-at-arms, ${ELITE.knight.pay} for a knight.` : ''}</p>`);
      for (const [k, E] of Object.entries(ELITE)) rows.push(`<button data-act="train:${k}" class="wide"><span>${KITS[k].name}</span><small></small></button><p class="kit">each needs ${this.goodsList(KITS[k].kit)}, ${E.fee} ${goldIco()} and ${Math.round(E.drill / 60 * 10) / 10} min of drill</p>`);
    }
    if (b.kind === 'barracks' && b.state === 'active') {
      rows.push(`<h4>Call up a levy</h4><p class="note">Arms must be carried here first. Haulers bring them from the workshops and stores.</p>`);
      rows.push(`<p class="kit" data-f="racks"></p>`);
      rows.push(`<p class="note">Armour from the racks:</p><div class="row policy">${Object.entries(POLICIES).map(([k, P]) => `<button data-act="policy:${k}" title="${P.about}">${P.name}</button>`).join('')}</div>`);
      for (const [k, K] of Object.entries(KITS)) {
        if (ELITE[k]) continue;
        rows.push(`<button data-act="raise:${k}" class="wide"><span>${K.name}</span><small></small></button><p class="kit">each needs ${this.goodsList(K.kit)} in this barracks, and wears what the racks allow</p>`);
      }
      rows.push(`<p class="note">Men-at-arms and knights are trained in a knights' hall, from veterans.</p>`);
    }
    if (b.state === 'active' && UPGRADES[2] && b.kind !== 'well' && b.kind !== 'house' && !B.camp) {
      const U = UPGRADES[(b.level || 1) + 1], next = (b.level || 1) + 1;
      const gain = B.haul ? 'one more hauler' : B.jobs ? `work for ${B.jobs * next}, a little faster` : B.mood ? 'lifts the mood more' : 'sturdier';
      if (U) rows.push(`<button data-act="upgrade" class="wide"><span>Upgrade to level ${next} · ${U.gold ? `${U.gold} ${goldIco()} + ` : ''}${this.goodsList(U.cost)}</span><small></small></button><p class="kit">${gain}</p>`);
    }
    const buttons = [];
    if (b.state === 'site' || (b.state === 'active' && B.jobs)) buttons.push(`<button data-act="priority"></button>`);
    if (B.jobs && b.state === 'active') buttons.push(`<button data-act="pause"></button>`);
    if (b.state === 'active' && (B.gather?.node === 'rock' || B.gather?.node === 'ore')) buttons.push(`<button data-act="find" title="Look at the nearest deposit nobody is working">Find a deposit</button>`);
    buttons.push(`<button data-act="demolish">${b.state === 'ruined' ? 'Clear ruin' : 'Demolish'}</button>`);
    rows.push(`<div class="row">${buttons.join('')}</div>`);
    return rows.join('');
  }

  regHtml(r) {
    const rows = [`<h3>${r.name}${CLOSE}</h3>`, `<p data-f="men"></p>`, `<p data-f="gear"></p>`, `<p class="status" data-f="morale"></p>`];
    if ((r.levy || r.elite) && !r.T.engine && !r.T.militia) rows.push(`<button data-act="refit" class="wide"><span>Refit</span><small></small></button>`);
    const co = this.hooks.companyOf?.(r);
    if (co) rows.push(`<p class="note">A mercenary company under ${co.captain}. Wages: ${co.wage} gold a minute, from your treasury.${co.unpaid ? ' <b class="bad">They are owed pay.</b>' : ''}</p>`,
      `<button data-act="dismiss" class="wide"><span>Dismiss them</span><small>they leave your service; no refund</small></button>`);
    else if (r.elite) rows.push(`<p class="note">Trained in your knights' hall from veterans. Slow to replace: losing them hurts.${this.hooks.companies ? ` Pay: ${Math.round(r.alive * (ELITE[r.T.key]?.pay ?? ELITE.maa.pay) * 10) / 10} gold a minute.` : ''}</p>`,
      `<button data-act="disband" class="wide"><span>Stand them down</span><small>they go home to work; their kit goes back to the racks</small></button>`);
    else if (r.levy) rows.push(`<button data-act="disband" class="wide"><span>Disband</span><small>send them home to work</small></button>`);
    else if (r.retinue) rows.push(`<p class="note">Your own household troops. They cost no villagers.</p>`,
      `<button data-act="disband" class="wide"><span>Send them to work</span><small>kit goes to the stores</small></button>`);
    return rows.join('');
  }

  goodsList(goods) { return Object.entries(goods).map(([g, n]) => `${n} ${gi(g)}`).join(' + '); }

  field(f) {
    const b = this.selected, r = this.reg;
    if (f === 'status') return this.town.hostile ? (b.state === 'ruined' ? b.status : `Held by ${this.town.hostile.name}`) : b.state === 'ruined' ? b.status : b.kind === 'keep' ? `${this.town.peopleText()} · ${b.status.toLowerCase()}` : b.priority && this.town.prioText ? `${this.town.prioText}${b.status && !/^(Waiting for builders|Under construction)/.test(b.status) ? ` · ${b.status.toLowerCase()}` : ''}` : b.status;
    if (f === 'progress') return `Built: ${Math.floor(b.progress * 100)}% · builders: ${b.builders.length}`;
    if (f === 'materials') return `Materials here: ${Object.entries(b.B.cost).map(([g, n]) => `${Math.floor(b.store[g] || 0)}/${n} ${gi(g)}`).join(' · ')}`;
    if (f === 'keepraise') { const K = KEEP_RAISE[this.town.keepBought || 0]; return K ? `Raise a ${K.name}` : ''; }
    if (f === 'gov') return this.town.governor === false ? 'Governor: off' : 'Governor: on';
    if (f === 'workers') {
      const t = this.town, want = t.staffed(b), room = t.jobs(b);
      return `${b.B.haul ? 'Haulers' : 'Workers'}: ${b.workers.length} of ${want} wanted${want < room ? ` (room for ${room})` : ''}`;
    }
    if (f === 'game') { const g = this.town.gameNear(b); return `Game in reach: ${g > 0.66 ? 'plenty' : g > 0.33 ? 'thinning' : g > 0.12 ? 'scarce' : 'hunted out'} (${Math.round(g * 100)}%). It breeds back over about 25 minutes.`; }
    if (f === 'deposit') {
      const g = b.B.gather, near = this.town.nodes[g.node].filter(n => Math.hypot(n.x - b.x, n.z - b.z) < g.range);
      const left = near.reduce((n, d) => n + Math.max(0, d.left ?? 0), 0), next = left > 0 ? null : this.town.nextDeposit(b);
      return `Left in reach: ${Math.round(left)} ${g.node === 'rock' ? 'stone' : 'ore'} in ${near.filter(d => (d.left ?? 1) > 0).length} ${g.node === 'rock' ? 'outcrop' : 'deposit'}(s). ${left > 0 ? 'It runs out. ' : `Worked out.${next ? ` The next deposit is ${next.m} m ${next.to}.` : ' No other deposit is left in your land.'} `}Mines sharing a deposit strip it faster.`;
    }
    if (f === 'settlers') return settlerWhy(this.town, this.town.settlers());
    if (f === 'mood') return `${moodWord(this.town.mood)} (${Math.round(this.town.mood)}): ${this.town.moodWhy.map(([n, w]) => `${n > 0 ? '+' : ''}${n} ${w}`).join(', ') || 'nothing much either way'}. A happy village grows faster and pays more tax; a miserable one loses families.`;
    if (f === 'racks') {
      const n = this.town.levyMax?.() || 20;
      return `Armour in the racks, for a levy of ${n}: ${['leather', 'mail', 'plate'].map(l => `${GOODS[ARMOUR_GOOD[l]].name} ${Math.min(n, Math.floor(b.store[ARMOUR_GOOD[l]] || 0))}/${n}`).join(' · ')}`;
    }
    if (f === 'store') {
      const held = Object.entries(b.store).filter(([, n]) => n >= 1);
      return held.length ? `Holds: ${held.map(([g, n]) => `${Math.floor(n)} ${gi(g)}`).join(' · ')}` : 'Holds nothing';
    }
    if (f === 'hp') return `Condition: ${Math.ceil(b.hp)} / ${b.B.hp}`;
    if (f === 'men') return `${r.alive} men${r.levy ? ' (villagers)' : r.until ? ' (arrière-ban: home after ten minutes)' : ''}`;
    if (f === 'gear') return r.T.engine ? '' : `${gearText(gearOf(r))}${r.battles ? ` · ${r.battles} battle${r.battles > 1 ? 's' : ''}` : ''}`;
    if (f === 'morale') return this.hooks.moraleLabel(r);
    return '';
  }

  allowed(act) {
    const t = this.town;
    if (t.readOnly) return [false, `${t.readOnly.name}'s to decide`];
    if (act.startsWith('raise:')) { const c = t.levyCheck(act.slice(6), this.selected); return [c.ok, c.reason]; }
    if (act === 'refit') { const c = t.refitCheck(this.reg); return [c.ok, c.reason]; }
    if (act === 'disband') return this.reg && !this.reg.routing ? [true] : [false, 'They are fleeing'];
    if (act === 'upgrade') { const c = t.upgradeCheck(this.selected); return [c.ok, c.reason]; }
    if (act === 'find') return this.town.nextDeposit(this.selected) ? [true] : [false, 'No other deposit is left in your land'];
    if (act === 'staff:-1') return t.staffed(this.selected) > 0 ? [true] : [false, 'Nobody works here'];
    if (act === 'staff:1') return t.staffed(this.selected) < t.jobs(this.selected) ? [true] : [false, 'Every place is wanted; upgrade for more'];
    if (act.startsWith('engine:')) { const c = t.engineCheck(act.slice(7), this.selected); return [c.ok, c.reason]; }
    if (act.startsWith('hire:')) { const c = t.hireCheck(act.slice(5)); return [c.ok, c.reason]; }
    if (act.startsWith('train:')) { const c = t.trainCheck(act.slice(6), this.selected); return [c.ok, c.reason]; }
    if (act.startsWith('co:')) { const c = this.hooks.companies().find(o => o.id === +act.slice(3)); return [!!c?.ok, c?.why]; }
    if (act === 'feast') { const c = t.feastCheck(); return [c.ok, c.reason]; }
    if (act === 'keepraise') { const c = t.keepRaiseCheck(); return [c.ok, c.reason]; }
    return [true];
  }

  act(act) {
    const t = this.town;
    if (t.readOnly) return;
    if (act === 'burn') {
      const r = t.burn(this.selected);
      this.flash(r ? `${r.name} go to burn the ${this.selected.B.name.toLowerCase()}.` : 'No regiment is free to send.');
      return;
    }
    if (act.startsWith('recipe:')) t.toggleRecipe(this.selected, +act.slice(7));
    if (act === 'pause') t.setPaused(this.selected, !this.selected.paused);
    if (act === 'priority') { t.setPriority(this.selected); t.prioText = t.prioNote(); }
    if (act.startsWith('staff:')) t.setStaff(this.selected, t.staffed(this.selected) + +act.slice(6));
    if (act === 'find') {
      const n = t.nextDeposit(this.selected);
      if (n) { this.hooks.findDeposit?.(n.node); this.flash(`Nearest unworked ${n.node.kind === 'rock' ? 'outcrop' : 'deposit'}: ${n.m} m to the ${n.to}. Build a ${this.selected.B.name.toLowerCase()} beside it.`); }
    }
    if (act === 'demolish') { t.demolish(this.selected); this.hooks.deselect(); }
    if (act === 'disband' && t.disband(this.reg)) this.hooks.deselect();
    if (act.startsWith('policy:')) this.selected.policy = act.slice(7);
    if (act === 'refit') { const r = t.refit(this.reg); if (!r.ok) this.flash(r.reason); }
    if (act === 'upgrade') { const r = t.upgrade(this.selected); if (!r.ok) this.flash(r.reason); }
    if (act === 'governor') t.governor = t.governor === false;
    if (act === 'feast') { const r = t.feast(); if (!r.ok) this.flash(r.reason); }
    if (act === 'keepraise') { const r = t.raiseKeep(); if (!r.ok) this.flash(r.reason); }
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
