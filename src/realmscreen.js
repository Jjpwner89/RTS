// The realm at a glance (creator, 2026-11-20): "somewhere to manage the realm as a count or
// duke", with the villages side by side to see how each is doing, the vassals and the
// great houses, and where the gold comes from and goes. Opened from the top bar (or Tab) in
// any mode. It only looks and points: each row's buttons go to the village, or select the
// place or house on the map, where the usual panels hold the actions.
import { FACTIONS, headcount } from './world/world.js';
import { GOOD_GROUPS } from './economy.js';
import { living, prisoners, holdingsOf, opinion, moodWord as vassalWord, TEMPERS, DUES, LEVIES } from './world/vassals.js';
import { elitePay } from './world/treasury.js';
import { wage } from './world/companies.js';
import { ico } from './icons.js';

const TABS = [['villages', 'Villages'], ['vassals', 'Vassals'], ['houses', 'Houses'], ['treasury', 'Treasury']];
const ARMS = GOOD_GROUPS[2][1];
const STUCK = /^(No workers|No haulers|Waiting for|Yard full|Store full|Deposit worked out|Game hunted out|No trees left|Nothing left)/;
const townMood = m => m >= 80 ? 'Joyful' : m >= 62 ? 'Content' : m >= 45 ? 'Settled' : m >= 30 ? 'Uneasy' : m >= 18 ? 'Unhappy' : 'Miserable';
const houseFeel = n => n >= 50 ? 'Friendly' : n >= 15 ? 'Warm' : n > -15 ? 'Cool' : n > -50 ? 'Hostile' : 'Bitter';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = n => Math.round(n).toLocaleString();

// One of your places, measured. Places without a running village (rare) show what is known.
export function villageRow(w, p) {
  const t = p.town, v = p.vassal ? w.vassals.find(o => o.id === p.vassal) : null;
  if (!t) return { p, v, pop: p.eco?.pop ?? 0, men: headcount(p.garrison || []), trouble: [] };
  const stores = t.stores();
  const meals = stores.reduce((n, b) => n + (b.store.food || 0) + (b.store.bread || 0), 0);
  const s = t.stock, rate = t.settlers();
  const stuck = t.buildings.filter(b => b.state === 'active' && STUCK.test(b.status || ''));
  const men = t.battle.regs.filter(r => r.side === 0 && !r.gone).reduce((n, r) => n + r.alive, 0) + headcount(p.garrison || []);
  const trouble = [];
  if (t.underAttack || t.hostile) trouble.push(['Under attack', 5]);
  if (t.revolt) trouble.push(['In revolt', 5]);
  if (t.hungry) trouble.push(['Hungry', 4]);
  if (t.cold) trouble.push(['Cold hearths', 3]);
  if (t.mood < 30) trouble.push([townMood(t.mood), 3]);
  if (stuck.length) trouble.push([`${stuck.length} stuck: ${[...new Set(stuck.map(b => b.status.replace(/:.*/, '')))].slice(0, 2).join(', ')}`, 2]);
  if (t.population >= t.housing) trouble.push(['No room', 1]);
  return {
    p, v, t, pop: t.population, room: t.housing, newcomers: rate.rate, newWhy: rate.block, mood: t.mood,
    food: t.population ? meals / t.population : 0, wood: t.free('wood'), stone: t.free('stone'), iron: s.iron || 0,
    arms: ARMS.reduce((n, g) => n + (s[g] || 0), 0), men, tax: t.population * t.taxRate * 60, governor: t.governor !== false, trouble,
  };
}

export class RealmScreen {
  // hooks: enter(place), select(place or { house }), and the world.
  constructor(world, hooks) {
    this.w = world;
    this.hooks = hooks;
    this.tab = 'villages';
    this.el = document.createElement('aside');
    this.el.id = 'realm';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', e => this.click(e));
    // Never redrawn under a pressed button, or the press would land on a replaced one.
    this.el.addEventListener('pointerdown', () => { this.pressed = true; });
    addEventListener('pointerup', () => { this.pressed = false; });
    this.at = 0;
  }

  get open() { return !this.el.hidden; }
  show(tab) { if (tab) this.tab = tab; this.el.hidden = false; this.at = 0; this.update(true); }
  hide() { this.el.hidden = true; }
  toggle() { if (this.open) this.hide(); else this.show(); }

  click(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const [act, id] = b.dataset.act.split(':');
    const w = this.w;
    if (act === 'close') return this.hide();
    if (act === 'tab') { this.tab = id; return this.update(true); }
    if (act === 'go') { this.hide(); return this.hooks.enter(w.byId[id]); }
    if (act === 'map') { this.hide(); return this.hooks.select(w.byId[id]); }
    if (act === 'house') { this.hide(); return this.hooks.select({ house: FACTIONS[+id] }); }
    if (act === 'vassal') {
      const v = w.vassals.find(o => String(o.id) === id), p = v && holdingsOf(w, v)[0];
      if (p) { this.hide(); this.hooks.select(p); }
    }
  }

  // Redrawn about once a second while open.
  update(now = false) {
    if (!this.open) return;
    const t = performance.now();
    if (!now && (t - this.at < 1000 || this.pressed)) return;
    this.at = t;
    const w = this.w;
    const tabs = TABS.map(([k, name]) => `<button data-act="tab:${k}" class="${this.tab === k ? 'on' : ''}">${name}</button>`).join('');
    const body = this.tab === 'vassals' ? this.vassals() : this.tab === 'houses' ? this.houses() : this.tab === 'treasury' ? this.treasury() : this.villages();
    const html = `<header><h2>${ico('crown', '#e8c45a')} Your realm <small>${esc(w.rank)} · ${w.pois.filter(p => p.owner === 0).length} places · ${num(FACTIONS[0].gold)} gold</small></h2>
      <nav>${tabs}</nav><button data-act="close" class="close" title="Close (Tab or Esc)">✕</button></header><div class="body">${body}</div>`;
    if (html !== this.html) {
      const scroll = this.el.querySelector('.body')?.scrollTop || 0;
      this.html = html;
      this.el.innerHTML = html;
      this.el.querySelector('.body').scrollTop = scroll;
    }
  }

  villages() {
    const w = this.w;
    const rows = w.pois.filter(p => p.owner === 0).map(p => villageRow(w, p))
      .sort((a, b) => (b.p === w.home) - (a.p === w.home) || b.pop - a.pop);
    const tot = k => rows.reduce((n, r) => n + (r[k] || 0), 0);
    const cell = r => {
      if (!r.t) return `<td colspan="8" class="dim">${r.v ? `Run by ${esc(r.v.name)}` : 'No village here'} · ${num(r.pop)} people</td>`;
      const food = r.food;
      return `<td title="${r.newcomers > 0.05 ? `About ${r.newcomers.toFixed(1)} newcomers a minute` : `No newcomers${r.newWhy ? `: ${r.newWhy}` : ''}`}">${num(r.pop)}<small>/${num(r.room)}</small>${r.newcomers > 0.05 ? ` <small class="good">+${r.newcomers.toFixed(1)}</small>` : ''}</td>
        <td class="${r.mood >= 45 ? 'good' : r.mood >= 30 ? 'warn' : 'bad'}">${townMood(r.mood)}</td>
        <td class="${food < 1 ? 'bad' : food < 3 ? 'warn' : ''}" title="Meals a head in the stores: a meal each every minute">${food.toFixed(1)}</td>
        <td>${num(r.wood)}</td><td>${num(r.stone)}</td><td>${num(r.iron)}</td><td>${num(r.arms)}</td><td>${num(r.men)}</td>`;
    };
    const tr = r => `<tr><th><b>${esc(r.p.name)}</b>${r.p === w.home ? ' <small>seat</small>' : ''}<br><small>${r.v ? `Vassal: ${esc(r.v.name)}` : r.t ? (r.governor ? 'Governor on' : 'You run it') : ''}</small></th>${cell(r)}
      <td>${r.t ? `${r.tax.toFixed(0)}` : ''}</td>
      <td class="trouble">${r.trouble.sort((a, b) => b[1] - a[1]).map(([s, l]) => `<span class="l${l}">${esc(s)}</span>`).join('') || '<span class="ok">All well</span>'}</td>
      <td class="acts">${r.t && !r.v ? `<button data-act="go:${r.p.id}">Go</button>` : ''}<button data-act="map:${r.p.id}">Map</button></td></tr>`;
    return `<table class="villages"><thead><tr><th>Place</th><th title="People / room, and newcomers a minute">People</th><th>Mood</th><th title="Meals a head in the stores">Food</th>
      <th>Wood</th><th>Stone</th><th>Iron</th><th title="Weapons and armour in store">Arms</th><th title="Soldiers in and around it">Men</th><th title="Tax gold a minute">Tax</th><th>Needs</th><th></th></tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody>
      <tfoot><tr><th>All ${rows.length}</th><td>${num(tot('pop'))}</td><td></td><td></td><td>${num(tot('wood'))}</td><td>${num(tot('stone'))}</td><td>${num(tot('iron'))}</td><td>${num(tot('arms'))}</td><td>${num(tot('men'))}</td><td>${tot('tax').toFixed(0)}</td><td></td><td></td></tr></tfoot></table>
      <p class="note">Food is meals a head in the stores; each person eats one a minute. "Stuck" buildings are waiting on workers, haulers or goods: go there to see why above them.</p>`;
  }

  vassals() {
    const w = this.w;
    if (w.rank === 'Reeve') return `<p class="note">From the rank of Lord (two places) you can give a village to a vassal: select it on the map and choose "Give it to a new vassal". They run it, pay you dues and send men to your banners.</p>`;
    const vs = living(w), jail = prisoners(w);
    if (!vs.length && !jail.length) return `<p class="note">No vassals yet. Select one of your villages on the map (not your seat) and choose "Give it to a new vassal": they run it on the same rules as you, pay you dues and send men to your banners.</p>`;
    const row = v => {
      const o = opinion(w, v), held = holdingsOf(w, v), men = held.reduce((n, p) => n + headcount(p.garrison || []), 0);
      const why = o.why.map(([n, t]) => `${n > 0 ? '+' : ''}${n} ${t}`).join('\n');
      const foe = v.feud && w.vassals.find(x => x.id === v.feud);
      const flags = [v.council ? 'On your council' : '', v.refusing ? '<b class="bad">Refusing dues</b>' : '', w.faction?.members.includes(v.id) ? '<b class="bad">In a faction</b>' : '', foe ? `<b class="warn">Feuding with ${esc(foe.name)}</b>` : ''].filter(Boolean).join(' · ');
      return `<tr><th><i class="shield" style="background:${v.color}"></i><b>${esc(v.name)}</b><br><small>${esc(TEMPERS[v.temper]?.name || '')}</small></th>
        <td title="${esc(why)}" class="${o.total >= 5 ? 'good' : o.total > -10 ? 'warn' : 'bad'}"><b>${o.total > 0 ? '+' : ''}${o.total}</b> ${vassalWord(o.total)}</td>
        <td>${v.landless ? '<span class="warn">Landless, at your court</span>' : held.map(p => esc(p.name)).join(', ')}</td><td>${num(men)}</td>
        <td>${DUES[v.dues]?.name || ''} dues · ${LEVIES[v.levy]?.name || ''} levies</td><td>${num(v.paid || 0)}</td><td>${flags}</td>
        <td class="acts">${held.length ? `<button data-act="vassal:${v.id}" title="Select their place on the map, where you can gift, seat, set dues or take it back">Deal</button>` : ''}</td></tr>`;
    };
    return `<table><thead><tr><th>Vassal</th><th title="Hover for the reasons">Opinion</th><th>Holds</th><th>Men</th><th>Terms</th><th title="Gold paid to you so far">Paid</th><th></th><th></th></tr></thead><tbody>${vs.map(row).join('')}</tbody></table>`
      + (jail.length ? `<h4>In your dungeon</h4><p>${jail.map(v => esc(v.name)).join(', ')}. Select your seat on the map to pardon them.</p>` : '')
      + `<p class="note">Opinion falls with heavy dues and levies, broken promises and feuds; gifts, council seats and victories raise it. Hover a number for the reasons. Below −25 a vassal refuses dues; a faction of unhappy vassals may rise.</p>`;
  }

  houses() {
    const w = this.w;
    const list = FACTIONS.slice(1, w.bandits).filter(h => w.knows(h.index));
    if (!list.length) return '<p class="note">You have met no great house yet: explore to find their lands.</p>';
    const row = h => {
      const d = w.dip[h.index], war = w.atWar(0, h.index);
      const tie = !h.alive ? 'Broken' : d.vassal ? 'Your vassal' : d.married ? 'Married' : d.allied ? 'Allied' : war ? (w.coalition?.members.includes(h.index) ? 'At war (coalition)' : 'At war') : 'At peace';
      return `<tr><th><i class="shield" style="background:${h.color}"></i><b>${esc(h.lord)}</b><br><small>${esc(h.name)}</small></th>
        <td class="${war ? 'bad' : ''}">${tie}</td><td>${houseFeel(d.opinion)} (${Math.round(d.opinion)})</td>
        <td>${w.pois.filter(p => p.owner === h.index).length}</td><td>${num(w.strength(h.index))}</td><td>${num(h.gold || 0)}</td>
        <td class="acts">${h.alive ? `<button data-act="house:${h.index}" title="Gifts, peace, alliance and marriage">Deal</button>` : ''}</td></tr>`;
    };
    return `<table><thead><tr><th>House</th><th>Tie</th><th>Feeling</th><th>Places</th><th>Strength</th><th>Gold</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>
      <p class="note">Your strength: ${num(w.strength(0))}. Click Deal to send gifts, make peace, ally or marry into a house.</p>`;
  }

  treasury() {
    const w = this.w;
    const towns = w.pois.filter(p => p.owner === 0 && p.town && !p.vassal);
    const taxes = towns.reduce((n, p) => n + p.town.population * p.town.taxRate * 60, 0);
    const elites = elitePay(w, 0);
    const hired = (w.companies || []).filter(c => c.employer === 0 && !c.gone);
    const wages = hired.reduce((n, c) => n + wage(c), 0);
    const paid = living(w).reduce((n, v) => n + (v.paid || 0), 0);
    const net = taxes - elites - wages;
    return `<table class="money"><tbody>
      <tr><th>Taxes from ${towns.length} village${towns.length === 1 ? '' : 's'}</th><td class="good">+${taxes.toFixed(0)} a minute</td></tr>
      <tr><th>Knights' and men-at-arms' pay</th><td class="${elites ? 'bad' : 'dim'}">${elites >= 0.5 ? `−${elites.toFixed(0)} a minute` : 'none'}</td></tr>
      <tr><th>Sellsword wages (${hired.length} compan${hired.length === 1 ? 'y' : 'ies'})</th><td class="${wages ? 'bad' : 'dim'}">${wages >= 0.5 ? `−${wages.toFixed(0)} a minute` : 'none'}</td></tr>
      <tr class="sum"><th>Net</th><td class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(0)} a minute</td></tr>
      <tr><th>Vassal dues paid so far</th><td>${num(paid)}</td></tr>
      <tr><th>In the purse</th><td>${num(FACTIONS[0].gold)}</td></tr>
      </tbody></table>
      <p class="note">Vassals pay their dues as their places earn, on top of this. Taxes rise with people and the tax rate (set in each village); a content village pays more. Gold also buys market goods, feasts, great keeps, stone walls and peace.</p>`;
  }
}
