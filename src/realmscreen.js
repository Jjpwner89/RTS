// The realm at a glance (creator, 2026-11-20): "somewhere to manage the realm as a count or
// duke", then "look to crusader kings for this, vassal management and how to centralize
// this info" and "i should be able to send supplies from this menu". Opened from the top bar
// (or Tab) in any mode. Seven tabs:
//   Realm     the overview: what needs you, your council's counsel, vassals and houses
//   Villages  every place side by side, sortable, with what each needs
//   Supplies  send a wagon of goods between your villages, see who is short and what is on the road
//   Vassals   each vassal's opinion and its reasons, wants, power and every dealing with them
//   Council   the three seats, who sits in them and what they do
//   Houses    the great houses and your ties
//   Treasury  where the gold comes from and where it goes
// Actions here are the same ones the map panels use (world.vassalAct, supply.js sendRun).
import { FACTIONS, headcount, seenAs } from './world/world.js';
import { TAXES, armsCount, ARMS_LOAD } from './economy.js';
import { living, prisoners, holdingsOf, opinion, outlook, powerOf, factionView, arrestOdds, yourMen, seatHolder, seatPower,
  moodWord as vassalWord, TEMPERS, DUES, LEVIES, WANTS, KNACKS, SEATS, TITLES, TITLED, titleCap, titleName, duesShare, levyShare, GIFT, RECONCILE, HONOUR_EVERY, DEMAND_MIN,
  suitors, matchCost, claimant, kinWar, kingGift, KIN_WARMTH, WAR_ON_KIN, MATCH_WARM } from './world/vassals.js';
import { wagesOf, HOME_GUARD } from './world/treasury.js';
import { wage } from './world/companies.js';
import { runCheck, runLoad, runTime, sendRun, loadText, RUN_KINDS, RUN_GROUPS, wagonsOf, wagonPlan, buyWagons, runCap } from './world/supply.js';
import { alerts } from './world/alerts.js';
import { VASSAL_TRIBUTE, strengthWords } from './world/diplomacy.js';
import { ROAD_UPKEEP, decreed } from './world/decrees.js';
import { ico } from './icons.js';
import { claimOn, isGreat, CLAIM, GREAT } from './world/claims.js';
import { unlocked } from './ui/unlocks.js';

const TABS = [['realm', 'Realm'], ['villages', 'Villages'], ['supplies', 'Supplies'], ['vassals', 'Vassals'], ['council', 'Council'], ['houses', 'Houses'], ['treasury', 'Treasury']];
// Arms in a stock or a wagon load (economy.js armsCount), with the loose arrows and bolts said apart.
const armsNote = (...stocks) => {
  const loose = g => Math.floor(stocks.reduce((n, s) => n + (s?.[g] || 0), 0));
  return `Weapons and armour. A man's load of arrows or bolts (${ARMS_LOAD.arrows}) counts as one: ${loose('arrows')} arrows and ${loose('bolts')} bolts here.`;
};
const STUCK = /^(No workers|No haulers|Waiting for|Yard full|Store full|Deposit worked out|Game hunted out|No trees left|Nothing left)/;
const townMood = m => m >= 80 ? 'Joyful' : m >= 62 ? 'Content' : m >= 45 ? 'Settled' : m >= 30 ? 'Uneasy' : m >= 18 ? 'Unhappy' : 'Miserable';
const houseFeel = n => n >= 50 ? 'Friendly' : n >= 15 ? 'Warm' : n > -15 ? 'Cool' : n > -50 ? 'Hostile' : 'Bitter';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = n => Math.round(n).toLocaleString();
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const opClass = n => n >= 5 ? 'good' : n > -10 ? 'warn' : 'bad';
const shield = v => `<i class="shield" style="background:${v.color}"></i>`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = s => s[0].toUpperCase() + s.slice(1);
// A wagon tier in a few words: "twice the load, one out per village".
const loadSize = t => `${t.size === 1 ? 'the plain load' : `${t.size === 2 ? 'twice' : 'three times'} the load`}, ${t.out === 1 ? 'one' : 'two'} out per village`;

// One of your places, measured. A vassal's place is measured from its tally.
export function villageRow(w, p) {
  const t = p.town, v = p.vassal ? w.vassals.find(o => o.id === p.vassal) : null;
  if (!t) {
    const e = p.eco, s = e?.stock || {}, pop = e?.pop ?? 0;
    return { p, v, pop, food: pop ? ((s.food || 0) + (s.bread || 0)) / pop : 0, wood: s.wood || 0, stone: s.stone || 0, iron: s.iron || 0,
      arms: armsCount(s), stock: s, men: headcount(p.garrison || []), tax: 0, mood: v ? opinion(w, v).total : 0, trouble: vassalTrouble(w, v) };
  }
  const stores = t.stores();
  const meals = stores.reduce((n, b) => n + (b.store.food || 0) + (b.store.bread || 0), 0);
  const s = t.stock, rate = t.settlers();
  const stuck = t.buildings.filter(b => b.state === 'active' && STUCK.test(b.status || ''));
  const men = t.battle.regs.filter(r => r.side === 0 && !r.gone).reduce((n, r) => n + r.alive, 0) + headcount(p.garrison || []);
  const trouble = [];
  if (t.underAttack || t.hostile) trouble.push(['Under attack', 5]);
  if (t.revolt) trouble.push(['In revolt', 5]);
  if (t.starving) trouble.push(['Hungry', 4]);
  if (t.cold) trouble.push(['Cold hearths', 3]);
  if (t.mood < 30) trouble.push([townMood(t.mood), 3]);
  if (stuck.length) trouble.push([`${stuck.length} stuck: ${[...new Set(stuck.map(b => b.status.replace(/:.*/, '')))].slice(0, 2).join(', ')}`, 2]);
  if (t.population >= t.housing) trouble.push(['No room', 1]);
  return {
    p, v, t, pop: t.population, room: t.housing, newcomers: rate.rate, newWhy: rate.block, mood: t.mood,
    food: t.population ? meals / t.population : 0, wood: t.goodCount('wood').spend, stone: t.goodCount('stone').spend, iron: t.goodCount('iron').spend,
    arms: armsCount(s), stock: s, vets: t.veterans().length, men, tax: w.taxOf(p) * 60, governor: t.governor !== false, trouble,
  };
}

function vassalTrouble(w, v) {
  if (!v) return [];
  const out = [], o = outlook(w, v);
  if (v.refusing) out.push(['Refusing dues', 4]);
  if (w.faction?.members.includes(v.id)) out.push(['In a faction', 4]);
  if (v.feud) out.push(['Feuding', 2]);
  if (o.warn) out.push([o.warn, 2]);
  return out;
}

// Brings `el`'s children in line with `to`'s, changing only the text, attributes and nodes
// that differ (`el`'s own attributes are left alone). A node of another kind is replaced;
// selects and checkboxes follow their attributes, which say what is chosen.
function patch(el, to) {
  const was = [...el.childNodes], now = [...to.childNodes];
  now.forEach((n, i) => {
    const o = was[i];
    if (!o) el.appendChild(n);
    else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) el.replaceChild(n, o);
    else if (o.nodeType !== Node.ELEMENT_NODE) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; }
    else {
      const pick = o.tagName === 'SELECT' ? (n.querySelector('option[selected]') || n.querySelector('option'))?.value : null;
      for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
      for (const a of n.attributes) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
      patch(o, n);
      if (pick != null && o.value !== pick) o.value = pick;
      if (o.tagName === 'INPUT' && o.type === 'checkbox') o.checked = o.hasAttribute('checked');
    }
  });
  for (const o of was.slice(now.length)) o.remove();
}

export class RealmScreen {
  // hooks: enter(place), select(place, army or { house }), visit(place), flash(text, good).
  constructor(world, hooks) {
    this.w = world;
    this.hooks = hooks;
    this.tab = 'realm';
    this.sort = 'pop';
    this.pick = null;          // the vassal shown in full
    this.confirm = null;       // an act waiting for a second click
    this.run = { from: null, to: null, what: 'all', fam: true };
    this.armsTo = null;        // where a vassal is called to arms
    this.ledger = [];          // the purse and dues every ten seconds, for the treasury
    RealmScreen.shown = this;  // the one screen, for checks()
    this.el = document.createElement('aside');
    this.el.id = 'realm';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', e => this.click(e));
    this.el.addEventListener('change', e => this.change(e));
    // Never redrawn under a pressed button, or the press would land on a replaced one.
    this.el.addEventListener('pointerdown', () => { this.pressed = true; });
    addEventListener('pointerup', () => { this.pressed = false; });
    this.at = 0;
  }

  get open() { return !this.el.hidden; }
  show(tab, pick) { if (tab) this.tab = tab; if (pick !== undefined) this.pick = pick; this.el.hidden = false; this.at = 0; this.update(true); }
  hide() { this.el.hidden = true; this.confirm = null; }
  toggle() { if (this.open) this.hide(); else this.show(); }
  // What a dealing did: a refusal always says why (world.vassalAct warns in the console).
  say(r) { if (r?.ok) { if (r.text) this.hooks.flash?.(r.text, true); } else this.hooks.flash?.(r?.text || 'That cannot be done now.', false); }
  refuse(why) { console.warn(`[realm] ${why}`); this.hooks.flash?.(why, false); this.update(true); }

  // The village of yours best able to spare `what` for `to` (most of it in store), or null.
  giver(to, what = 'all') {
    const w = this.w, dest = w.byId[to], load = p => Object.values(runLoad(p, what, false).goods).reduce((n, k) => n + k, 0);
    return w.pois.filter(p => p.owner === 0 && p.town && !p.vassal && p !== dest && runCheck(w, p, dest, what, false).ok)
      .sort((a, b) => load(b) - load(a))[0] || null;
  }

  change(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    // Place ids are strings ('p12'): kept as they are.
    if (k === 'arms') this.armsTo = val;
    else this.run[k] = val;
    this.update(true);
  }

  click(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const [act, id, x, y, z] = b.dataset.act.split(':');
    const w = this.w;
    if (act === 'close') return this.hide();
    if (act === 'tab') { this.tab = id; this.confirm = null; return this.update(true); }
    if (act === 'sort') { this.sort = id; return this.update(true); }
    if (act === 'go') { this.hide(); return this.hooks.enter(w.byId[id]); }
    if (act === 'map') { this.hide(); return this.hooks.select(w.byId[id]); }
    if (act === 'army') { const a = w.armies.find(o => o.id === +id && !o.gone); if (!a) return this.refuse('That army is no longer on the map.'); this.hide(); return this.hooks.select(a); }
    if (act === 'visit') { this.hide(); return this.hooks.visit?.(w.byId[id]); }
    if (act === 'house') { this.hide(); return this.hooks.select({ house: FACTIONS[+id] }); }
    if (act === 'hg') {
      // hg:place:house. Asks twice: a village given to a house is theirs to keep.
      const key = b.dataset.act, p = w.byId[id];
      if (this.confirm !== key) { this.confirm = key; return this.update(true); }
      this.confirm = null;
      const H = w.grantToHouse(p, +x);
      if (!H) return this.refuse(w.canGrantTo(p, +x).why || `${p?.name} cannot be given now`);
      this.hooks.flash?.(`${p.name} is now held for you by ${H.name}.`, true);
      return this.update(true);
    }
    if (act === 'pick') { this.pick = +id; this.tab = 'vassals'; this.confirm = null; return this.update(true); }
    if (act === 'supply') {
      // supply:from[:to[:what]]; with no sender (supply::to:what), the village best able to spare it.
      const R = this.run;
      if (y) R.what = y;
      if (x) R.to = x;
      R.from = id || this.giver(R.to, R.what)?.id || null;
      this.tab = 'supplies';
      return this.update(true);
    }
    if (act === 'run') {
      // run:from:to[:what:families]; from the form when no places are given.
      const R = this.run, from = w.byId[id || R.from], to = w.byId[x || R.to];
      if (!from || !to) return this.refuse(`No such village: ${!from ? id || R.from : x || R.to}.`);
      const r = sendRun(w, from, to, y || R.what, z !== undefined ? z === '1' : R.fam);
      if (!r.ok) return this.refuse(r.why);
      this.hooks.flash?.(`A wagon sets out from ${from.name} for ${to.name}: ${loadText(r.wagon.wagon)}.`, true);
      return this.update(true);
    }
    if (act === 'wagons') {
      // Better wagons for the realm, their planks and iron from the village sending, or your seat.
      const r = buyWagons(w, 0, w.byId[this.run.from]);
      if (!r.ok) return this.refuse(r.why);
      this.hooks.flash?.(`Your realm now drives ${r.next.name.toLowerCase()}: ${loadSize(r.next)}.`, true);
      return this.update(true);
    }
    if (act === 'v') {
      // v:vassal:act[:arg]. Arrests and taking land back ask twice.
      const v = w.vassals.find(o => o.id === +id);
      if (!v) return this.refuse(`No such vassal (${id}).`);
      const key = b.dataset.act;
      if ((x === 'arrest' || x === 'revoke' || x === 'marry' || x === 'claim') && this.confirm !== key) { this.confirm = key; return this.update(true); }
      this.confirm = null;
      const arg = x === 'grant' || x === 'revoke' ? w.byId[y] : x === 'arms' ? w.byId[y] : y;
      this.say(w.vassalAct(v, x, arg));
      return this.update(true);
    }
    if (act === 'cancel') { this.confirm = null; return this.update(true); }
  }

  // The purse and what vassals have paid, every ten seconds of game time, two minutes kept.
  sample() {
    const w = this.w, L = this.ledger, last = L.at(-1);
    if (last && w.time < last.t) L.length = 0;
    if (last && w.time - last.t < 10) return;
    L.push({ t: w.time, gold: FACTIONS[0].gold, paid: w.vassals.reduce((n, v) => n + (v.paid || 0), 0) });
    if (L.length > 13) L.shift();
  }
  rate(k) {
    const L = this.ledger;
    if (L.length < 3) return null;
    const a = L[0], b = L.at(-1);
    return (b[k] - a[k]) / Math.max(1, b.t - a.t) * 60;
  }

  // Redrawn about once a second while open, never while a list is dropped down.
  update(now = false) {
    this.sample();
    if (!this.open) return;
    const t = performance.now();
    if (!now && (t - this.at < 1000 || this.pressed || this.el.contains(document.activeElement) && document.activeElement.tagName === 'SELECT')) return;
    this.at = t;
    const w = this.w;
    // A tab shows once what it is about has arrived (ui/unlocks.js); one that has not is never offered.
    const shown = ([k]) => unlocked(w, `tab:${k}`);
    if (!shown([this.tab])) this.tab = 'realm';
    const tabs = TABS.filter(shown).map(([k, name]) => `<button data-act="tab:${k}" class="${this.tab === k ? 'on' : ''}">${name}${this.badge(k)}</button>`).join('');
    const body = this[`tab_${this.tab}`]?.() ?? this.tab_realm();
    const html = `<header><h2>${ico('crown', '#e8c45a')} Your realm <small>${esc(w.rank)} · ${plural(w.pois.filter(p => p.owner === 0).length, 'place')} · ${num(FACTIONS[0].gold)} gold</small></h2>
      <nav>${tabs}</nav><button data-act="close" class="close" title="Close (Tab or Esc)">✕</button></header><div class="body">${body}</div>`;
    if (html === this.html) return;
    this.html = html;
    if (!this.el.firstChild) { this.el.innerHTML = html; return; }
    // Only what changed is touched, so hover, focus, tooltips and scroll stay put.
    const next = document.createElement('aside');
    next.innerHTML = html;
    patch(this.el, next);
  }

  // A count on a tab when something there needs you.
  badge(k) {
    const w = this.w;
    let n = 0;
    if (k === 'vassals') n = living(w).filter(v => v.refusing || v.feud || w.faction?.members.includes(v.id) || outlook(w, v).warn).length;
    if (k === 'villages') n = w.pois.filter(p => p.owner === 0 && p.town && (p.town.starving || p.town.revolt || p.town.underAttack || p.town.mood < 30)).length;
    if (k === 'council') n = Object.keys(SEATS).filter(s => !seatHolder(w, s)).length && living(w).some(v => !v.council) ? 1 : 0;
    return n ? ` <b class="badge">${n}</b>` : '';
  }

  // ---- Realm: the overview ----

  tab_realm() {
    const w = this.w;
    const towns = w.pois.filter(p => p.owner === 0);
    const people = towns.reduce((n, p) => n + (p.town ? p.town.population : p.eco?.pop || 0), 0);
    const vmen = living(w).reduce((n, v) => n + powerOf(w, v).men, 0);
    const money = this.money();
    const rivals = FACTIONS.slice(1, w.bandits).filter(h => h.alive);
    const top = rivals.sort((a, b) => w.strength(b.index) - w.strength(a.index))[0];
    const tile = (label, value, sub = '', cls = '') => `<div class="tile ${cls}"><small>${label}</small><b>${value}</b><small>${sub}</small></div>`;
    const tiles = `<div class="tiles">${tile('Places', towns.length, `${towns.filter(p => p.vassal).length} held by vassals`)}
      ${tile('People', num(people), 'in all your places')}
      ${tile('Soldiers', num(yourMen(w) + vmen), vmen ? `${num(vmen)} of them vassals' men` : 'under your banners')}
      ${tile('Gold a minute', signed(money.net), money.observed !== null ? `${signed(money.observed)} seen in the purse` : 'planned', money.net >= 0 ? 'good' : 'bad')}
      ${tile('Strength', num(w.strength(0)), top ? `${esc(top.short || top.name)}: ${num(w.strength(top.index))}` : 'no rival left')}</div>`;

    const needs = alerts(w).filter(a => a.level >= 2).sort((a, b) => b.level - a.level).slice(0, 7);
    const go = at => !at ? '' : at.vassal && at.owner === 0 ? `<button data-act="pick:${at.vassal}">Deal</button><button data-act="map:${at.id}">Map</button>` : at.units ? `<button data-act="army:${at.id}">Find</button>` : at.town && !at.vassal ? `<button data-act="go:${at.id}">Go</button><button data-act="map:${at.id}">Map</button>` : `<button data-act="map:${at.id}">Map</button>`;
    const needBox = `<section class="box"><h4>${ico('warning')} Needs you</h4>${needs.length ? needs.map(a => `<div class="line"><span class="lvl l${a.level}"></span><span class="grow">${esc(a.text)}</span><span class="acts">${go(a.at)}</span></div>`).join('') : '<p class="ok">Nothing pressing. The realm is quiet.</p>'}</section>`;

    const counsel = `<section class="box"><h4>${ico('chronicle')} Your council advises</h4>${this.counsel().map(c => this.counselLine(c)).join('')}<p class="note"><button data-act="tab:council">See the council</button></p></section>`;

    const vs = living(w).filter(v => !v.landless), fv = factionView(w);
    const groups = {};
    for (const v of vs) { const k = vassalWord(opinion(w, v).total); groups[k] = (groups[k] || 0) + 1; }
    const order = ['Devoted', 'Loyal', 'Content', 'Wary', 'Resentful', 'Defiant'];
    const vbox = `<section class="box"><h4>${ico('crown')} Vassals</h4>${!vs.length ? `<p class="note">${w.rank === 'Reeve' ? 'From the rank of Lord you can give villages to vassals.' : 'None yet: select one of your villages on the map and give it to a vassal.'}</p>`
      : `<p>${order.filter(k => groups[k]).map(k => `<span class="chip ${k === 'Devoted' || k === 'Loyal' || k === 'Content' ? 'good' : k === 'Wary' ? 'warn' : 'bad'}">${groups[k]} ${k.toLowerCase()}</span>`).join(' ')}</p>`
        + this.factionLine(fv)
        + vs.map(v => [v, outlook(w, v)]).sort((a, b) => a[1].now - b[1].now).slice(0, 6).map(([v, o]) => `<div class="line">${shield(v)}<span class="grow">${esc(v.name)}<br><small>${v.refusing ? '<b class="bad">Refuses dues and men</b>' : o.warn ? `<b class="warn">${esc(o.warn)}</b>` : `${WANTS[v.want]?.met(w, v) ? 'Has' : 'Wants'} ${esc(WANTS[v.want]?.text || '')}`}</small></span><span class="${opClass(o.now)}">${signed(o.now)} ${vassalWord(o.now)}</span><span class="acts"><button data-act="pick:${v.id}">Deal</button></span></div>`).join('')
        + (vs.length > 6 ? `<p class="note"><button data-act="tab:vassals">All ${vs.length} vassals</button></p>` : '')}${this.houseVassals(true)}</section>`;

    const met = FACTIONS.slice(1, w.bandits).filter(h => h.alive && w.knows(h.index));
    const war = met.filter(h => w.atWar(0, h.index)), friends = met.filter(h => w.dip[h.index].allied || w.dip[h.index].married || w.dip[h.index].vassal);
    const hbox = `<section class="box"><h4>${ico('castle')} Great houses</h4>${!met.length ? '<p class="note">You have met no great house yet.</p>'
      : `<p>${war.length ? `<b class="bad">At war with ${war.map(h => esc(h.short || h.name)).join(', ')}</b>` : 'At peace with every house you know.'}${w.coalition?.members.length ? ` <span class="chip bad">a coalition of ${w.coalition.members.length} stands against you</span>` : ''}</p>`
        + (friends.length ? `<p>Friends: ${friends.map(h => esc(h.short || h.name)).join(', ')}</p>` : '')
        + met.map(h => `<div class="line">${shield(h)}<span class="grow">${esc(h.lord)} <small>${esc(h.name)}</small></span><span class="${w.atWar(0, h.index) ? 'bad' : opClass(w.dip[h.index].opinion)}">${houseFeel(w.dip[h.index].opinion)}</span><span class="acts"><button data-act="house:${h.index}">Deal</button></span></div>`).join('')}</section>`;

    const rows = towns.filter(p => p.town && !p.vassal).map(p => villageRow(w, p));
    const worst = [...rows].sort((a, b) => a.mood - b.mood).filter((r, i) => i === 0 || r.mood < 45).slice(0, 2), hungry = [...rows].sort((a, b) => a.food - b.food)[0];
    const vilbox = `<section class="box"><h4>${ico('village')} Villages</h4>${rows.length ? `<p>${num(rows.reduce((n, r) => n + r.pop, 0))} people in ${plural(rows.length, 'village')} you run, paying ${num(rows.reduce((n, r) => n + r.tax, 0))} gold a minute.</p>`
      + worst.map(r => `<div class="line"><span class="grow">Least content: <b>${esc(r.p.name)}</b></span><span class="${r.mood >= 45 ? 'good' : r.mood >= 30 ? 'warn' : 'bad'}">${townMood(r.mood)} (${Math.round(r.mood)})</span></div>`).join('')
      + (hungry ? `<div class="line"><span class="grow">Shortest of food: <b>${esc(hungry.p.name)}</b></span><span class="${hungry.food < 3 ? 'bad' : ''}">${Math.round(hungry.food)} min</span><span class="acts"><button data-act="supply::${hungry.p.id}:food">Send food</button></span></div>` : '') : '<p class="note">You run no village yourself.</p>'}<p class="note"><button data-act="tab:villages">All villages</button></p></section>`;

    return tiles + `<div class="boxes">${needBox}${unlocked(w, 'tab:council') ? counsel : ''}${vbox}${vilbox}${unlocked(w, 'tab:houses') ? hbox : ''}</div>`;
  }

  factionLine(fv) {
    if (fv.F && fv.members.length) {
      const risk = fv.men / Math.max(1, fv.yours), king = fv.members.length >= 2 && claimant(this.w, fv.members), K = king && FACTIONS[king.house];
      return `<div class="faction"><b class="bad">⚑ A faction against you</b>: ${fv.members.map(v => esc(v.name)).join(', ')}.
        ${fv.members.length < 2 ? 'Alone for now; it needs a second to make a demand.' : fv.demandIn !== null ? `They will make their demand in ${clock(fv.demandIn)}.` : 'They have made their demand.'}
        ${K ? `<b class="warn">They would have ${esc(K.lord)} of ${esc(K.name)} for king</b> (${esc(king.why)}).<br>Give way: light dues and levies, ${esc(K.name)} your ally, about ${kingGift(this.w)} gold to it, no place lost.<br>Refuse: they rise, their villages go over to ${esc(K.name)}, which goes to war on you.` : ''}
        Their men: ${num(fv.men)}${fv.members.some(v => v.title) ? ' (a titled lord\'s count double)' : ''} against your ${num(fv.yours)} (${risk > 0.6 ? '<b class="bad">a grave threat</b>' : risk > 0.25 ? '<b class="warn">a real threat</b>' : 'a small threat'}).
        <small>Win members back with gifts, honours and what they want, or arrest the worst of them.</small></div>`;
    }
    if (fv.close.length >= 2) return `<div class="faction"><b class="warn">Discontent</b>: ${fv.close.map(v => esc(v.name)).join(', ')} are near to banding together (opinion −10 or worse makes a faction).</div>`;
    return '';
  }

  // ---- the council's counsel: one line from each seat ----

  counsel() {
    const w = this.w;
    const out = [];
    const rows = w.pois.filter(p => p.owner === 0 && p.town && !p.vassal).map(p => villageRow(w, p));
    // The steward: food and building goods short anywhere, and the coffers.
    {
      let text = null, btn = null;
      const short = rows.filter(r => r.food < 3 || r.t.starving).sort((a, b) => a.food - b.food)[0];
      const cold = rows.filter(r => r.t.cold || r.wood < 10).sort((a, b) => a.wood - b.wood)[0];
      if (short) {
        const g = this.giver(short.p.id, 'food');
        text = `${short.p.name} has food for ${Math.round(short.food)} minutes${g ? `; ${g.name} can spare some.` : ', and no village can spare any. Build farms or buy grain.'}`;
        if (g) btn = [`run:${g.id}:${short.p.id}:food:0`, `Send food from ${g.name}`];
      } else if (cold) {
        const g = this.giver(cold.p.id, 'build');
        text = `${cold.p.name} is short of wood${cold.t.cold ? ' and its hearths are cold' : ''}${g ? `; ${g.name} can spare some.` : '.'}`;
        if (g) btn = [`run:${g.id}:${cold.p.id}:build:0`, `Send goods from ${g.name}`];
      } else {
        const m = this.money();
        text = m.net >= 0 ? `The stores hold and the coffers fill: ${signed(m.net)} gold a minute.` : `We pay out more than we take in: ${signed(m.net)} gold a minute. Raise taxes, or let some knights or sellswords go.`;
      }
      out.push({ seat: 'steward', text, btn });
    }
    // The marshal: who marches on us, or how we stand.
    {
      const threat = w.armies.filter(a => !a.gone && a.side !== 0 && !a.wagon && a.visible && !a.retreating && a.target?.owner === 0)
        .sort((a, b) => headcount(b.units) - headcount(a.units))[0];
      let text, btn = null;
      if (threat) {
        const S = seenAs(threat), to = threat.target, ours = to.town ? to.town.garrison().reduce((n, r) => n + r.alive, 0) : headcount(to.garrison || []);
        text = `${S.name}${S.men ? ` (${S.men} men)` : ''} marches on ${to.name}, where we have ${ours} men.`;
        btn = [`map:${to.id}`, `Look at ${to.name}`];
      } else {
        const top = FACTIONS.slice(1, w.bandits).filter(h => h.alive && w.knows(h.index)).sort((a, b) => w.strength(b.index) - w.strength(a.index))[0];
        text = `No foe marches on us. ${num(yourMen(w))} men stand under your banners${top ? `; ${top.name}, the strongest house we know, is ${w.strength(top.index) > w.strength(0) ? 'stronger than us' : 'weaker than us'}` : ''}.`;
        // Raids grow with the realm: a wall is the cheap answer, and the one thing the player may not have found.
        const bare = rows.filter(r => !r.t.battle.walls.any);
        if (bare.length && rows.length) text += ` ${bare.length === rows.length ? 'No village of ours has a wall' : bare.length === 1 ? `${bare[0].p.name} has no wall` : `${bare.length} of our villages have no wall`}: the Walls tab in a village builds palisades, towers and gates.`;
      }
      out.push({ seat: 'marshal', text, btn });
    }
    // The envoy: a house turning against us, or one ready to be a friend.
    {
      const met = FACTIONS.slice(1, w.bandits).filter(h => h.alive && w.knows(h.index));
      const sour = met.filter(h => !w.atWar(0, h.index) && w.dip[h.index].opinion < -15).sort((a, b) => w.dip[a.index].opinion - w.dip[b.index].opinion)[0];
      const warm = met.filter(h => !w.atWar(0, h.index) && !w.dip[h.index].allied && !w.dip[h.index].married && !w.dip[h.index].vassal && w.dip[h.index].opinion >= 20).sort((a, b) => w.dip[b.index].opinion - w.dip[a.index].opinion)[0];
      const war = met.filter(h => w.atWar(0, h.index));
      let text, btn = null;
      if (sour) { text = `${sour.lord} of ${sour.name} grows ${houseFeel(w.dip[sour.index].opinion).toLowerCase()} toward us. A gift would cool them.`; btn = [`house:${sour.index}`, `Deal with ${sour.short || sour.name}`]; }
      else if (warm) { text = `${warm.lord} is warm toward us (${Math.round(w.dip[warm.index].opinion)}): an alliance or a marriage may be had.`; btn = [`house:${warm.index}`, `Deal with ${warm.short || warm.name}`]; }
      else if (war.length) { text = `We are at war with ${war.map(h => h.name).join(', ')}. Peace can be bought when they tire of it.`; btn = [`house:${war[0].index}`, `Deal with ${war[0].short || war[0].name}`]; }
      else text = met.length ? 'The houses are quiet toward us.' : 'We have met no great house yet.';
      out.push({ seat: 'envoy', text, btn });
    }
    return out;
  }

  counselLine(c) {
    const w = this.w, S = SEATS[c.seat], v = seatHolder(w, c.seat);
    if (!v) return `<div class="line counsel dim"><b>${S.name}</b><span class="grow">The seat is empty: ${c.seat === 'steward' ? 'nobody counts the stores for you' : c.seat === 'marshal' ? 'nobody watches the roads for you' : 'nobody listens at the houses\' doors'}.</span></div>`;
    return `<div class="line counsel"><b>${S.name}</b><span class="grow">${esc(c.text)} <small>— ${esc(v.name)}</small></span>${c.btn ? `<span class="acts"><button data-act="${c.btn[0]}">${esc(c.btn[1])}</button></span>` : ''}</div>`;
  }

  // ---- Villages ----

  tab_villages() {
    const w = this.w;
    const rows = w.pois.filter(p => p.owner === 0).map(p => villageRow(w, p));
    const by = { name: r => r.p.name, pop: r => -r.pop, mood: r => r.t ? r.mood : 999, food: r => r.food, tax: r => -r.tax, men: r => -r.men, vets: r => -(r.vets || 0), needs: r => -Math.max(0, ...r.trouble.map(t => t[1])) }[this.sort] || (r => -r.pop);
    rows.sort((a, b) => (b.p === w.home) - (a.p === w.home) || (!!a.v - !!b.v) || (by(a) < by(b) ? -1 : by(a) > by(b) ? 1 : 0));
    const tot = k => rows.filter(r => r.t).reduce((n, r) => n + (r[k] || 0), 0);
    const head = (k, label, tip = '') => `<th title="${tip}">${k ? `<button class="sort${this.sort === k ? ' on' : ''}" data-act="sort:${k}">${label}</button>` : label}</th>`;
    const runs = rows.filter(r => r.t && !r.v);
    const tr = r => {
      const T = r.trouble.sort((a, b) => b[1] - a[1]).map(([s, l]) => `<span class="l${l}">${esc(s)}</span>`).join('') || '<span class="ok">All well</span>';
      const who = r.v ? `Held by ${esc(r.v.name)}` : r.p === w.home ? 'Your seat' : r.governor ? 'Governor on' : 'You run it';
      const room = r.t ? `<div class="bar" title="${r.pop} of ${r.room} homes filled"><i style="width:${Math.min(100, r.pop / Math.max(1, r.room) * 100)}%"></i></div>` : '';
      const mood = r.t ? `<td class="${r.mood >= 45 ? 'good' : r.mood >= 30 ? 'warn' : 'bad'}">${townMood(r.mood)} <small>${Math.round(r.mood)}</small></td>`
        : `<td class="${opClass(r.mood)}" title="The vassal's opinion of you">${r.v ? `${signed(r.mood)} ${vassalWord(r.mood)}` : ''}</td>`;
      return `<tr class="${r.v ? 'vas' : ''}"><th>${r.v ? shield(r.v) : ''}<b>${esc(r.p.name)}</b><br><small>${who}</small></th>
        <td title="${r.t ? (r.newcomers > 0.05 ? `About ${r.newcomers.toFixed(1)} newcomers a minute` : `No newcomers${r.newWhy ? `: ${r.newWhy}` : ''}`) : ''}">${num(r.pop)}${r.t ? `<small>/${num(r.room)}</small>${r.newcomers > 0.05 ? ` <small class="good">+${r.newcomers.toFixed(1)}</small>` : ''}` : ''}${room}</td>
        ${mood}
        <td class="${r.food < 1 ? 'bad' : r.food < 3 ? 'warn' : ''}" title="Food in the stores lasts this long: each person eats once a minute${r.t?.yardMeals() ? `. ${r.t.yardMeals()} more meals lie at the farms` : ''}">${Math.round(r.food)} min</td>
        <td class="goods">${ico('wood')}${num(r.wood)} ${ico('stone')}${num(r.stone)} ${ico('iron')}${num(r.iron)} <span title="${armsNote(r.stock)}">${ico('swords')}${num(r.arms)}</span></td>
        <td>${num(r.men)}</td><td>${r.vets === undefined ? '' : num(r.vets)}</td><td>${r.t ? r.tax.toFixed(0) : r.v ? '<small>dues</small>' : ''}</td>
        <td class="trouble">${T}</td>
        <td class="acts">${r.t && !r.v ? `<button data-act="go:${r.p.id}">Go</button>` : ''}${r.v ? `<button data-act="pick:${r.v.id}">Vassal</button>` : ''}<button data-act="map:${r.p.id}">Map</button>${r.t && !r.v && runs.length > 1 ? `<button data-act="supply:${r.p.id}" title="Send a wagon of goods from ${esc(r.p.name)} to another village">Send</button>` : ''}</td></tr>`;
    };
    return `<table class="villages"><thead><tr>${head('name', 'Place')}${head('pop', 'People', 'People / homes, and newcomers a minute')}${head('mood', 'Mood')}${head('food', 'Food', 'How long the stores feed everyone')}
      <th title="Wood, stone and iron free in store; weapons and armour">Goods</th>${head('men', 'Men', 'Soldiers in and around it')}${head('vets', 'Veterans', 'Villagers at home who have fought as levies: they can drill or train as elite men')}${head('tax', 'Tax', 'Tax gold a minute')}${head('needs', 'Needs')}<th></th></tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody>
      <tfoot><tr><th>${plural(runs.length, 'village')} you run</th><td>${num(tot('pop'))}</td><td></td><td></td><td class="goods">${ico('wood')}${num(tot('wood'))} ${ico('stone')}${num(tot('stone'))} ${ico('iron')}${num(tot('iron'))} <span title="${armsNote(...rows.filter(r => r.t).map(r => r.stock))}">${ico('swords')}${num(tot('arms'))}</span></td><td>${num(tot('men'))}</td><td>${num(tot('vets'))}</td><td>${tot('tax').toFixed(0)}</td><td></td><td></td></tr></tfoot></table>
      <p class="note">Click a column to sort. Food is how long the stores feed everyone. "Stuck" buildings wait on workers, haulers or goods: go there to see why above them. A vassal's place shows its tally and the vassal's opinion of you.</p>`;
  }

  // ---- Supplies ----

  tab_supplies() {
    const w = this.w;
    const runs = w.pois.filter(p => p.owner === 0 && p.town && !p.vassal);
    if (runs.length < 2) return '<p class="note">Supplies go between villages you run. Once you hold two, you can send a wagon of food, building goods and a few families from one to the other here.</p>';
    const R = this.run;
    if (!runs.some(p => p.id === R.from)) R.from = (w.home?.town && w.home.id !== R.to ? w.home : runs.find(p => p.id !== R.to)).id;
    if (!runs.some(p => p.id === R.to) || R.to === R.from) R.to = runs.find(p => p.id !== R.from).id;
    const from = w.byId[R.from], to = w.byId[R.to];
    const opts = (sel, skip) => runs.filter(p => p.id !== skip).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    const c = runCheck(w, from, to, R.what, R.fam);
    const form = `<section class="box supply"><h4>${ico('caravan')} Send a wagon</h4>
      <div class="form"><label>From <select data-set="from">${opts(R.from)}</select></label><span class="arrow">→</span>
      <label>To <select data-set="to">${opts(R.to, R.from)}</select></label>
      <label>Carry <select data-set="what">${Object.entries(RUN_KINDS).map(([k, n]) => `<option value="${k}" ${k === R.what ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-set="fam" ${R.fam ? 'checked' : ''}> and four families, if it can spare them</label></div>
      <p class="${c.ok ? '' : 'warn'}">${c.ok ? `It would carry ${loadText(c.load)}: about ${clock(c.eta)} on the road.` : esc(c.why)}</p>
      <button data-act="run" class="on" ${c.ok ? '' : 'disabled'}>${ico('caravan')} Send the wagon</button>
      <p class="note">A village sends half of what it has spare of each good, and keeps the rest. ${wagonsOf(0).out > 1 ? 'Two wagons' : 'One wagon'} out from a village at once. A raider who meets it on the road takes the lot; one of your armies can ride with it.</p></section>`;
    // Better wagons, bought once for the whole realm, as a keep is raised.
    const tier = wagonsOf(0), plan = wagonPlan(w, 0, from), nx = plan.next;
    const wagons = `<section class="box"><h4>${ico('caravan')} Wagons</h4><p>Your realm drives <b>${esc(tier.name.toLowerCase())}</b>: ${loadSize(tier)}.</p>
      ${nx ? `<button data-act="wagons" ${plan.ok ? '' : 'disabled'} title="${esc(plan.ok ? `Planks and iron from ${plan.src.name}` : plan.why)}">${ico('caravan')} Buy ${esc(nx.name.toLowerCase())}: ${nx.gold} gold, ${nx.planks} planks, ${nx.iron} iron</button>
      <p class="${plan.ok ? 'note' : 'warn'}">${plan.ok ? `${cap(loadSize(nx))}. The planks and iron come from ${esc(plan.src.name)}.` : esc(plan.why)}</p>` : '<p class="note">These are the best wagons there are.</p>'}
      <p class="note">A bigger load tempts raiders more.</p></section>`;

    const rows = runs.map(p => villageRow(w, p));
    const short = [];
    for (const r of rows) {
      if (r.food < 4) short.push([r, 'food', `Food for ${Math.round(r.food)} min`]);
      if (r.wood < 20 || r.t.cold) short.push([r, 'build', r.t.cold ? 'Cold hearths' : `Only ${num(r.wood)} wood`]);
    }
    const shortBox = `<section class="box"><h4>${ico('warning')} Short of</h4>${short.length ? short.map(([r, what, why]) => {
      const g = this.giver(r.p.id, what);
      const coming = w.armies.some(a => a.wagon?.run && a.wagon.to === r.p && !a.gone);
      return `<div class="line"><b>${esc(r.p.name)}</b><span class="grow warn">${why}${coming ? ' <small class="good">· a wagon is on its way</small>' : ''}</span><span class="acts">${g ? `<button data-act="run:${g.id}:${r.p.id}:${what}:0">Send ${what === 'food' ? 'food' : 'goods'} from ${esc(g.name)}</button>` : '<small>nobody can spare any</small>'}</span></div>`;
    }).join('') : '<p class="ok">Every village has food and wood enough.</p>'}</section>`;

    const carts = w.armies.filter(a => a.wagon?.run && a.side === 0 && !a.gone);
    const road = `<section class="box"><h4>${ico('map')} On the road</h4>${carts.length ? carts.map(a => {
      const W = a.wagon, left = runTime(w, a, W.to);
      const guard = w.armies.find(o => o.escort === a.id && !o.gone);
      return `<div class="line"><span class="grow"><b>${esc(W.from.name)} → ${esc(W.to.name)}</b>: ${loadText(W)}<br><small>${W.bought ? 'Bought at market' : 'Supply run'} · ${clock(left)} to go${guard ? ` · guarded by ${esc(guard.name)}` : ' · unguarded'}</small></span><span class="acts"><button data-act="army:${a.id}">Find</button></span></div>`;
    }).join('') : '<p class="note">No wagons on the road.</p>'}</section>`;

    const spare = `<section class="box wide"><h4>What each village can spare</h4><table><thead><tr><th>Village</th>${[['Food', 'food'], ['Wood', 'wood'], ['Planks', 'planks'], ['Stone', 'stone'], ['Ore', 'ore'], ['Iron', 'iron']].map(([h, g]) => `<th title="A wagon takes at most ${runCap(0, g)}">${h}</th>`).join('')}<th title="Flax, hides, feathers, string, leather and flour">Other crafting</th><th title="A wagon takes arms for at most ${runCap(0, 'spears')} men">Arms</th><th title="A wagon takes four families">Families</th><th></th></tr></thead><tbody>${runs.map(p => {
      const L = runLoad(p), A = runLoad(p, 'arms'), n = g => L.goods[g] || 0;
      const other = RUN_GROUPS.craft.filter(g => g !== 'ore' && g !== 'iron').reduce((k, g) => k + n(g), 0), busy = w.armies.filter(a => a.wagon?.run && !a.wagon.bought && a.wagon.from === p && !a.gone).length >= tier.out;
      return `<tr><th><b>${esc(p.name)}</b></th><td>${n('food') + n('bread')}</td><td>${n('wood')}</td><td>${n('planks')}</td><td>${n('stone')}</td><td>${n('ore')}</td><td>${n('iron')}</td><td>${other}</td><td title="${armsNote(A.goods)}">${armsCount(A.goods)}</td><td>${L.people || '<small>none</small>'}</td>
        <td class="acts">${busy ? '<small>wagon out</small>' : `<button data-act="supply:${p.id}">Send from here</button>`}</td></tr>`;
    }).join('')}</tbody></table><p class="note">A wagon takes half of what a village has spare, up to a limit on each good (hover a heading).</p></section>`;
    return `<div class="boxes">${form}${wagons}${shortBox}${road}</div>${spare}`;
  }

  // ---- Vassals ----

  // Great houses that have bent the knee: the same list as your knights, with their terms and a look round each
  // place (world.overseer / campaign.visitVassal: read-only, the way a knight's village is shown).
  houseVassals(compact = false) {
    const w = this.w, hs = FACTIONS.filter(h => w.sworn(h.index));
    if (!hs.length) return '';
    const rows = hs.map(h => {
      const places = w.pois.filter(p => p.owner === h.index).sort((a, b) => (b === h.seat) - (a === h.seat));
      const men = places.reduce((n, p) => n + (p.town ? p.town.garrison().reduce((k, r) => k + r.alive, 0) : headcount(p.garrison || [])), 0)
        + w.armies.filter(a => a.side === h.index && !a.gone).reduce((n, a) => n + headcount(a.units), 0);
      const terms = `Peace with you · ${VASSAL_TRIBUTE} gold a minute while its coffers last${h.gold > 0 ? ` (${Math.round(h.gold)} in them)` : ' (empty now)'} · backs your claim · its places and armies light your map`;
      const look = places.slice(0, compact ? 2 : 6).map(p => `<button data-act="visit:${p.id}" title="Look round ${esc(p.name)}: you can look, not build or give orders">${ico('village')} ${esc(p.name)}</button>`).join('');
      // Land: a village of yours may be given to a house that has sworn to you, as to a knight.
      const gives = compact || w.rank === 'Reeve' ? [] : w.pois.filter(p => p.owner === 0 && p.town && p !== w.home && w.canGrantTo(p, h.index).ok);
      const give = gives.length ? `<br><span class="acts-row"><small>Give them a village:</small> ${gives.map(p => {
        const key = `hg:${p.id}:${h.index}`;
        return this.confirm === key
          ? `<span class="warn">${esc(p.name)} becomes ${esc(h.short)}'s to hold (+20 with them). They keep it if they ever break faith.</span> <button data-act="${key}" class="warn">Yes, give it</button><button data-act="cancel">No</button>`
          : `<button data-act="${key}" title="${esc(w.canGrantTo(p, h.index).warn)}">${ico('crown')} ${esc(p.name)}</button>`;
      }).join('')}</span>` : '';
      return `<div class="line house"><span class="grow"><b style="color:${h.color}">${esc(h.name)}</b> <span class="chip good">sworn to you</span><br><small>${esc(h.lord)} · ${places.length} place${places.length === 1 ? '' : 's'} · ${num(men)} men</small>${compact ? '' : `<br><small>${terms}</small>`}${give}</span>
        <span class="acts">${look}<button data-act="house:${h.index}" title="Their lord, and everything you can do with them">Deal</button></span></div>`;
    }).join('');
    return `<section class="box${compact ? '' : ' wide'}"><h4>${ico('castle')} ${compact ? 'Houses sworn to you' : 'Houses sworn to you, with their terms'}</h4>${rows}</section>`;
  }

  tab_vassals() {
    const w = this.w;
    if (w.rank === 'Reeve') return `<p class="note">From the rank of Lord (two places) you can give a village to a vassal: select it on the map and choose "Give it to a new vassal". They run it, pay you dues and send men to your banners.</p>`;
    const vs = living(w), jail = prisoners(w);
    if (!vs.length && !jail.length) return `${this.houseVassals()}<p class="note">${w.sworn && FACTIONS.some(h => w.sworn(h.index)) ? 'No knights hold villages for you yet. ' : ''}No vassals yet. Select one of your villages on the map (not your seat) and choose "Give it to a new vassal": they run it on the same rules as you, pay you dues and send men to your banners. Captains who have served well can be knighted and given one.</p>`;
    const all = [...vs, ...jail];
    if (!all.some(v => v.id === this.pick)) this.pick = (vs.map(v => [v, opinion(w, v).total]).sort((a, b) => a[1] - b[1])[0]?.[0] || all[0]).id;
    const card = v => {
      const o = v.prison ? null : outlook(w, v), held = holdingsOf(w, v);
      const trend = !o || Math.abs(o.trend) < 2 ? '' : o.trend > 0 ? `<small class="good" title="In five minutes: ${signed(o.soon)}">▲</small>` : `<small class="bad" title="In five minutes: ${signed(o.soon)}">▼</small>`;
      const sub = v.prison ? 'In your dungeon' : v.landless ? 'Landless, at your court' : held.map(p => p.name).join(', ');
      const flags = v.prison ? '' : [v.council ? `<span class="chip">${SEATS[v.seat]?.name || 'Council'}</span>` : '', v.refusing ? '<span class="chip bad">refusing</span>' : '', w.faction?.members.includes(v.id) ? '<span class="chip bad">⚑ faction</span>' : '', v.feud ? '<span class="chip warn">feud</span>' : '', o.warn ? '<span class="chip warn">!</span>' : ''].join('');
      return `<div class="vcard${v.id === this.pick ? ' on' : ''}" data-act="pick:${v.id}">${shield(v)}<span class="grow"><b>${esc(v.name)}</b><br><small>${esc(sub)}</small><br>${flags}</span>
        ${o ? `<span class="op ${opClass(o.now)}">${signed(o.now)}${trend}<small>${vassalWord(o.now)}</small></span>` : ''}</div>`;
    };
    const fv = factionView(w);
    const top = this.factionLine(fv);
    const v = all.find(o => o.id === this.pick);
    return `${top}${this.houseVassals()}<div class="split"><div class="vlist">${vs.map(card).join('')}${jail.length ? `<h4>In your dungeon</h4>${jail.map(card).join('')}` : ''}</div>
      <div class="vdetail">${v.prison ? this.prisoner(v) : this.vassal(v)}</div></div>`;
  }

  vassal(v) {
    const w = this.w, T = TEMPERS[v.temper], o = opinion(w, v), ahead = outlook(w, v), pw = powerOf(w, v), held = holdingsOf(w, v);
    const me = FACTIONS[0], want = WANTS[v.want], met = want?.met(w, v);
    // ok: true, or the reason it can't be done, which a greyed button shows instead of its tip.
    const btn = (act, label, ok = true, tip = '', cls = '') => `<button data-act="v:${v.id}:${act}" ${ok === true ? '' : 'disabled'} title="${esc(ok === true || !ok ? tip : ok)}" class="${cls}">${label}</button>`;
    const sure = act => this.confirm === `v:${v.id}:${act}`;
    const reasons = o.why.map(([n, t]) => `<div class="${n > 0 ? 'good' : 'bad'}"><b>${signed(n)}</b> ${esc(t)}</div>`).join('');
    const share = pw.share >= 0.4 ? '<b class="bad">bold enough to think themselves your equal</b>' : pw.share >= 0.2 ? 'a real force beside yours' : 'small beside yours';

    // Land: grant one of your villages, or take one back.
    const grants = w.pois.filter(p => p.owner === 0 && p.town && p !== w.home && w.canGrant(p).ok);
    const land = `${held.map(p => `<div class="line"><span class="grow">${ico('village')} <b>${esc(p.name)}</b> <small>${Math.round(p.eco?.pop || 0)} people · ${headcount(p.garrison || [])} men</small></span><span class="acts">
        <button data-act="visit:${p.id}" title="Look round it: you can look, not build or give orders">Look round</button>
        ${sure(`revoke:${p.id}`) ? `${held.length > 1 ? '' : `<span class="warn">All they hold: ${esc(v.name)} leaves your service for good.</span> `}${btn(`revoke:${p.id}`, 'Yes, take it back', true, '', 'warn')}<button data-act="cancel">No</button>` : btn(`revoke:${p.id}`, 'Take it back', true, held.length > 1 ? `You get ${p.name} back as it stands. ${v.name} and every other vassal will remember it (−30 and −12).` : `You get ${p.name} back as it stands. It is all ${v.name} holds: they leave your service for good, and every other vassal minds it (−12).`, 'warn')}</span></div>`).join('')}
      ${grants.length ? `<div class="acts-row"><small>Grant them:</small> ${grants.map(p => btn(`grant:${p.id}`, `${ico('crown')} ${esc(p.name)}`, true, w.canGrant(p).warn || `${p.name} goes to ${v.name} to run for you`)).join('')}</div>` : ''}`;

    // Council.
    const seats = Object.entries(SEATS).map(([k, S]) => {
      const h = seatHolder(w, k);
      if (h === v) return '';
      return btn(`seat:${k}`, `${S.name}${S.knack === v.knack ? ' ★' : ''}`, true, `${S.does(S.knack === v.knack ? S.full : S.half)}${h ? `. Puts ${h.name} off the council (−10 with them).` : ''}`);
    }).join('');
    const council = v.council ? `<p>Sits on your council as <b>${SEATS[v.seat]?.name || 'councillor'}</b>: ${SEATS[v.seat] ? SEATS[v.seat].does(seatPower(w, v.seat)) : ''}${v.refusing ? ' <b class="bad">(does nothing while refusing you)</b>' : ''}.</p><div class="acts-row">${seats ? `<small>Move to:</small> ${seats}` : ''} ${btn('unseat', 'Put off the council', true, 'They will mind it (−10)')}</div>`
      : `<div class="acts-row"><small>Seat them as:</small> ${seats}</div><p class="note">★ suits their knack: the seat does its full work. A seat pleases them (+15).</p>`;

    // Arms: where they are called to.
    const places = w.pois.filter(p => p.owner === 0 && p.town && !p.vassal);
    if (!places.some(p => p.id === this.armsTo)) this.armsTo = (w.home?.town ? w.home : places[0])?.id;
    const odds = arrestOdds(w, v), demand = Math.floor((v.gold || 0) / 2);
    const honourWait = Math.max(0, (v.honoured ?? -1e9) + HONOUR_EVERY - w.time);
    const foe = v.feud && w.vassals.find(x => x.id === v.feud);
    return `<div class="vhead">${shield(v)}<div class="grow"><h3>${esc(v.name)}</h3><small>${cap(T.name)}: ${esc(T.about)} Has ${KNACKS[v.knack]?.name || 'no special knack'}. Your vassal for ${clock(w.time - v.since)}.</small></div>
        <div class="op big ${opClass(o.total)}">${signed(o.total)}<small>${vassalWord(o.total)}</small></div></div>
      ${ahead.warn ? `<p class="warnline">⚠ ${esc(ahead.warn)} (${signed(ahead.soon)} then).</p>` : Math.abs(ahead.trend) >= 2 ? `<p class="note">In five minutes: ${signed(ahead.soon)} (${vassalWord(ahead.soon).toLowerCase()}).</p>` : ''}
      ${v.refusing ? '<p class="warnline">⚠ Too aggrieved to pay you dues or send men. They pay again once their opinion rises above −17.</p>' : ''}
      <div class="cols"><section><h4>Why they feel so</h4><div class="reasons">${reasons || '<div class="dim">Nothing either way</div>'}</div></section>
      <section><h4>What they want</h4>${want ? `<p class="${met ? 'good' : 'warn'}">${met ? `Has ${want.text}` : `Wants ${want.text}`}${met ? '' : ` <small>(for ${clock(w.time - v.wantSince)})</small>`}</p><p class="note">${met ? 'Met for long enough, they will be grateful and want something new.' : `${esc(want.how)}.`}</p>` : ''}
        <h4>Their power</h4><p>${num(pw.men)} men · ${num(pw.people)} people · ${num(pw.gold)} gold in their purse<br><small>Their men are ${share} (${Math.round(pw.share * 100)}% of yours).</small></p>
        <p>Paid you ${num(v.paid || 0)} gold, sent ${num(v.sent || 0)} men.${v.favours ? ` <b class="good">Owes you ${plural(v.favours, 'favour')}</b>: a demand or harder terms will pass without bad blood.` : ''}</p></section></div>
      <h4>Terms</h4><div class="terms"><span>Dues</span>${btn('dues-', '−', v.dues > 0 || 'Dues are as light as they go', 'Lighter dues please them')}<b title="${v.title >= GREAT ? 'A quarter more, for a great vassal' : v.title ? 'A quarter less, for their title' : ''}">${DUES[v.dues].name} (${Math.round(duesShare(v) * 100)}%)</b>${btn('dues+', '+', v.dues < 2 || 'Dues are as heavy as they go', v.favours ? 'They owe you: no bad blood' : 'Heavier dues anger them')}
        <span>Levies</span>${btn('levy-', '−', v.levy > 0 || 'Levies are as light as they go', 'Lighter levies please them')}<b title="${v.title >= GREAT ? 'Twice over, for a great vassal' : v.title ? 'Half again, for their title' : ''}">${LEVIES[v.levy].name} (${Math.round(Math.min(0.9, levyShare(v)) * 100)}%)</b>${btn('levy+', '+', v.levy < 2 || 'Levies are as heavy as they go', v.favours ? 'They owe you: no bad blood' : 'Heavier levies anger them')}</div>
      <h4>Favour</h4><div class="acts-row">${btn('gift', `${ico('gold', '#e8c45a')} Gift (${GIFT} gold)`, me.gold >= GIFT || `Needs ${GIFT} gold; you have ${num(Math.floor(me.gold))}`, `+15${T.dues ? ' (more for the greedy)' : ''}, fading over 15 minutes`)}
        ${btn('honour', `${ico('crown')} Honour before your court${honourWait ? ` (${Math.ceil(honourWait / 60)} min)` : ''}`, !honourWait || `Honoured lately: again in ${Math.ceil(honourWait / 60)} min`, `Free. +8${T.honour ? ' (twice that for the proud)' : ''}; the proud among the others mind being passed over (−3)`)}
        ${this.titleButton(v, btn)}</div>
      ${this.claimRow(v, btn)}
      ${this.matchRow(v, btn)}
      <h4>Council</h4>${council}
      <h4>Land</h4>${land || '<p class="note">They hold nothing.</p>'}
      <h4>Demands</h4><div class="acts-row">${btn('demand', `${ico('gold', '#e8c45a')} Demand ${demand} gold`, demand >= DEMAND_MIN || `Their purse holds too little to ask for (${num(Math.floor(v.gold || 0))} gold; at least ${DEMAND_MIN * 2} needed)`, v.favours ? 'They owe you: they pay without bad blood' : `Half their purse. −15${T.dues ? ' (more for the greedy)' : ''}; refused if they are resentful`)}
        <label>Call to arms at <select data-set="arms">${places.map(p => `<option value="${p.id}" ${p.id === this.armsTo ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        ${btn(`arms:${this.armsTo}`, `${ico('spears')} Call to arms`, v.refusing ? `${v.name} refuses to send anyone` : kinWar(w, v) ? `${v.name} won't march against their spouse's kin, ${kinWar(w, v).name}` : v.landless ? 'They hold no land to raise men from' : !places.length ? 'You run no village to call them to' : true, `Their share of men (${LEVIES[v.levy].name.toLowerCase()} levies${seatPower(w, 'marshal') ? ', more with your marshal' : ''}) marches there. ${v.want === 'glory' ? 'They want a war: they come gladly.' : 'Called again within ten minutes, they grumble (−6).'} Taking a rival's place while their men are out wins them glory.`)}</div>
      ${foe ? `<h4>Their feud</h4><p class="warn">Feuding with ${esc(foe.name)}: both their villages bleed people, and both mind that you do nothing.</p><div class="acts-row">${btn('judge', `Judge for ${esc(v.name)}`, true, `+15 with them, −20 with ${foe.name}; they owe you a favour`)}<button data-act="v:${foe.id}:judge" title="+15 with ${esc(foe.name)}, −20 with ${esc(v.name)}">Judge for ${esc(foe.name)}</button>${btn('reconcile', `${ico('gold', '#e8c45a')} Reconcile them (${RECONCILE})`, me.gold >= RECONCILE || `Needs ${RECONCILE} gold; you have ${num(Math.floor(me.gold))}`, 'Both a little pleased')}</div>` : ''}
      <h4>Justice</h4><div class="acts-row">${sure('arrest') ? `<span class="warn">${odds ? `About ${Math.round(odds * 100)}% they flee to their men and rise.` : 'They will come quietly.'} Every other vassal will mind it (−10).</span> ${btn('arrest', 'Yes, arrest them', true, '', 'warn')}<button data-act="cancel">No</button>`
        : btn('arrest', 'Arrest them', true, `Every village they hold comes back to you and they go to your dungeon. ${odds ? `Defiant: about ${Math.round(odds * 100)}% they flee and rise instead.` : 'They are not defiant: they will come quietly.'}`, 'warn')}</div>
      ${v.memory?.length ? `<h4>They remember</h4><div class="memory">${v.memory.slice(-6).reverse().map(m => `<div><small>${clock(m.at)}</small> ${esc(m.text)}</div>`).join('')}</div>` : ''}`;
  }

  // Arrange a match into a great house: you pay half the dowry; the house warms to you while their kin
  // is a content vassal, and the vassal minds a war on it.
  matchRow(v, btn) {
    const w = this.w, me = FACTIONS[0];
    if (v.wed) {
      const H = FACTIONS[v.wed.house];
      return `<p class="${v.wed.broken ? 'bad' : 'good'}">${v.wed.broken ? `Was wed into ${esc(H.name)}, which is broken.` : `Wed into ${esc(H.name)}: ${esc(H.lord)} thinks better of you while they are content with you; they mind it (${WAR_ON_KIN}), will not march against it, and rise with it if already sour with you, should you go to war on it.`}</p>`;
    }
    if (v.landless) return '';
    const sureMatch = i => this.confirm === `v:${v.id}:marry:${i}`;
    const list = suitors(w), warm = FACTIONS.slice(1, w.bandits).filter(H => H.alive && w.knows(H.index) && !w.atWar(0, H.index)).length;
    const tip = `Wed into the house: +6 for good with them, a favour owed, and ${KIN_WARMTH} warmer from the house while they are content; they mind it (${WAR_ON_KIN}) and will not march against it if you go to war on it; one already sour with you rises with it. The proud and ambitious among the rest mind it (−3). You pay half the dowry.`;
    return `<h4>A match</h4><div class="acts-row">${list.length ? list.map(H => sureMatch(H.index) ? `<span class="warn">${esc(v.name)} will not march against ${esc(H.name)}, their spouse's house, if you go to war with it (−15 with them), and a vassal already sour with you rises with it. ${matchCost(w, H.index)} gold, half the dowry.</span> ${btn(`marry:${H.index}`, 'Yes, arrange the match', true, '', 'warn')}<button data-act="cancel">No</button>`
        : btn(`marry:${H.index}`, `${ico('crown')} Wed into ${esc(H.name)} (${matchCost(w, H.index)} gold)`, me.gold >= matchCost(w, H.index) || `Needs ${matchCost(w, H.index)} gold; you have ${num(Math.floor(me.gold))}`, tip)).join('')
      : btn('marry', `${ico('crown')} Arrange a match`, warm ? `No house likes you well enough yet (it takes ${MATCH_WARM}): send gifts` : 'You have met no house at peace with you', tip)}</div>`;
  }

  // A great vassal's claim (world/claims.js): what they say is theirs, and the grant.
  claimRow(v, btn) {
    const w = this.w, p = claimOn(w, v);
    if (!isGreat(v) || !p) return '';
    const held = w.vassals.find(o => o.id === p.vassal), sure = this.confirm === `v:${v.id}:claim`;
    const cost = held ? `${esc(held.name)} loses it and minds it (−${-CLAIM.lost})` : 'you no longer run it yourself';
    const left = Math.max(0, Math.ceil((v.claim.since + CLAIM.press - w.time) / 60));
    return `<h4>Their claim</h4><p class="warn">Claims ${esc(p.name)} by right${held ? `, held by ${esc(held.name)}` : ''}, ${w.time - v.claim.since < 60 ? 'a claim only just made' : `for ${clock(w.time - v.claim.since)}`}. It weighs on them more each minute${v.claim.asked ? '' : `; within ${left} min, or sooner if they turn angry, they press it`}.</p>`
      + `<div class="acts-row">${sure ? `<span class="warn">${esc(p.name)} becomes theirs (+${CLAIM.grant}); ${cost}.</span> ${btn('claim', 'Yes, grant it', true, '', 'warn')}<button data-act="cancel">No</button>`
        : btn('claim', `${ico('crown')} Grant ${esc(p.name)}`, true, `+${CLAIM.grant} with them; ${cost}; the proud and ambitious among the rest mind it (−${-CLAIM.rivals}).`)}</div>`;
  }

  // Raise them a title: one below your own rank, kept for good.
  titleButton(v, btn) {
    const w = this.w, k = (v.title || 0) + 1, cap = titleCap(w), T = TEMPERS[v.temper];
    if (k >= TITLES.length) return '';
    const name = titleName(v, k), seat = holdingsOf(w, v)[0];
    const why = v.landless ? 'They hold no land to take a title from' : k > cap ? `From the rank of ${TITLES[k].from.toLowerCase()} you can make ${TITLES[k].name.toLowerCase()}s` : '';
    const trade = k === GREAT ? ' A duke is a great vassal: twice the men when called and a quarter more in dues, but they claim a place near their lands as theirs by right, and press it if you leave it.' : v.title ? '' : ` A titled vassal sends ${Math.round((TITLED.levy - 1) * 100)}% more men when called but pays ${Math.round((1 - TITLED.dues) * 100)}% less in dues; in a faction against you their men count double, and every vassal minds harm done to them half again as much.`;
    return btn('title', `${ico('crown')} Make them ${name}${seat ? ` of ${esc(seat.name)}` : ''}`, why || true, `Free, and for good: +${10 * (T.honour || 1)}${T.honour ? ' (the proud twice over)' : ''}; the proud and ambitious among the rest mind it (−4).${trade}`);
  }

  prisoner(v) {
    const T = TEMPERS[v.temper];
    return `<div class="vhead">${shield(v)}<div class="grow"><h3>${esc(v.name)}</h3><small>${cap(T.name)}: ${esc(T.about)} In your dungeon.</small></div></div>
      <p>Pardoned, they come out grateful (+25) and landless, and wait at your court for a village; the others think better of you (+5). Banished, they leave the realm for good, and the others mind it a little (−4).</p>
      <div class="acts-row"><button data-act="v:${v.id}:pardon">Pardon them</button><button data-act="v:${v.id}:banish" class="warn">Banish them</button></div>
      ${v.memory?.length ? `<h4>They remember</h4><div class="memory">${v.memory.slice(-6).reverse().map(m => `<div><small>${clock(m.at)}</small> ${esc(m.text)}</div>`).join('')}</div>` : ''}`;
  }

  // ---- Council ----

  tab_council() {
    const w = this.w, vs = living(w);
    const seat = ([k, S]) => {
      const v = seatHolder(w, k), n = seatPower(w, k);
      const cands = vs.filter(o => o !== v).sort((a, b) => (b.knack === S.knack) - (a.knack === S.knack) || opinion(w, b).total - opinion(w, a).total);
      return `<section class="box seat"><h4>${S.name}</h4><p class="dim">${S.does(S.full)} with one who has ${KNACKS[S.knack].name}; half that with anyone else.</p>
        ${v ? `<div class="line">${shield(v)}<span class="grow"><b>${esc(v.name)}</b><br><small>${v.knack === S.knack ? `★ Has ${KNACKS[v.knack].name}` : `Has ${KNACKS[v.knack]?.name || 'no knack'}: does it by half`}</small></span><span class="acts"><button data-act="pick:${v.id}">Deal</button></span></div>
          <p class="${n ? 'good' : 'bad'}">Now: ${n ? S.does(n) : 'nothing, while they refuse you'}.</p>` : '<p class="warn">Empty.</p>'}
        ${cands.length ? `<div class="acts-row"><small>${v ? 'Replace with' : 'Seat'}:</small> ${cands.slice(0, 5).map(o => `<button data-act="v:${o.id}:seat:${k}" title="${esc(o.name)}: ${esc(KNACKS[o.knack]?.name || '')}${o.council ? `, moving from ${SEATS[o.seat]?.name || 'another seat'}` : ''}">${esc(o.name)}${o.knack === S.knack ? ' ★' : ''}</button>`).join('')}</div>` : ''}</section>`;
    };
    return `<div class="boxes">${Object.entries(SEATS).map(seat).join('')}</div>
      <section class="box wide"><h4>${ico('chronicle')} Counsel</h4>${this.counsel().map(c => this.counselLine(c)).join('')}</section>
      <p class="note">Any vassal can sit on your council, the landless at your court too. A seat pleases them (+15, twice that for the proud) and a seat that suits their knack pleases them more (+5). Putting one off the council stings (−10).${vs.length ? '' : ' You have no vassals to seat yet.'}</p>`;
  }

  // ---- Houses ----

  tab_houses() {
    const w = this.w;
    const list = FACTIONS.slice(1, w.bandits).filter(h => w.knows(h.index));
    if (!list.length) return '<p class="note">You have met no great house yet: explore to find their lands.</p>';
    const row = h => {
      const d = w.dip[h.index], war = w.atWar(0, h.index);
      const tie = !h.alive ? 'Broken' : d.vassal ? 'Your vassal' : d.married ? 'Married' : d.allied ? 'Allied' : war ? (w.coalition?.members.includes(h.index) ? 'At war (coalition)' : 'At war') : 'At peace';
      return `<tr><th>${shield(h)}<b>${esc(h.lord)}</b><br><small>${esc(h.name)}</small></th>
        <td class="${war ? 'bad' : ''}">${tie}</td><td class="${opClass(d.opinion)}">${houseFeel(d.opinion)} (${Math.round(d.opinion)})</td>
        <td>${w.pois.filter(p => p.owner === h.index).length}</td><td>${num(w.strength(h.index))}${h.alive ? `<br><small>${strengthWords(w, h.index)}</small>` : ''}</td><td>${num(h.gold || 0)}</td>
        <td class="acts">${h.alive ? `<button data-act="house:${h.index}" title="Gifts, peace, alliance and marriage">Deal</button>` : ''}</td></tr>`;
    };
    const envoy = seatPower(w, 'envoy');
    return `<table><thead><tr><th>House</th><th>Tie</th><th>Feeling</th><th>Places</th><th>Strength</th><th>Gold</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>
      <p class="note">Your strength: ${num(w.strength(0))}. ${envoy ? `Your envoy makes every house think ${envoy} better of you.` : 'An envoy on your council would make every house think better of you.'} Click Deal to send gifts, make peace, ally or marry into a house.</p>`;
  }

  // ---- Treasury ----

  money() {
    const w = this.w;
    const towns = w.pois.filter(p => p.owner === 0 && p.town && !p.vassal && !p.town.hostile);
    const taxes = towns.reduce((n, p) => n + w.taxOf(p) * 60, 0);
    const pay = wagesOf(w, 0), elites = pay.gold, paidMen = pay.men;
    const hired = (w.companies || []).filter(c => c.employer === 0 && !c.gone);
    const wages = hired.reduce((n, c) => n + wage(c), 0);
    const roads = decreed(w, 'roads') ? ROAD_UPKEEP * 60 : 0;
    const tribute = FACTIONS.filter(h => w.dip?.[h.index]?.vassal && h.alive && h.gold > 0).length * 36;
    const dues = this.rate('paid');
    const net = taxes + tribute + (dues || 0) - elites - wages - roads;
    return { towns, taxes, elites, paidMen, hired, wages, roads, tribute, dues, net, observed: this.rate('gold') };
  }

  tab_treasury() {
    const w = this.w, m = this.money();
    const line = (label, n, sub = '') => `<tr><th>${label}${sub ? `<br><small>${sub}</small>` : ''}</th><td class="${n > 0.5 ? 'good' : n < -0.5 ? 'bad' : 'dim'}">${Math.abs(n) >= 0.5 ? `${signed(n)} a minute` : 'none'}</td></tr>`;
    const steward = seatPower(w, 'steward');
    const byTown = m.towns.map(p => [p, w.taxOf(p) * 60]).sort((a, b) => b[1] - a[1]);
    const vg = living(w).reduce((n, v) => n + (v.gold || 0), 0);
    const lasts = m.net < -0.5 ? FACTIONS[0].gold / -m.net : null;
    return `<div class="boxes"><section class="box"><h4>${ico('gold', '#e8c45a')} Comes in</h4><table class="money"><tbody>
        ${line(`Taxes from ${plural(m.towns.length, 'village')}`, m.taxes, [decreed(w, 'tithe') ? 'the royal tithe adds a quarter' : '', steward ? `your steward adds ${Math.round(steward * 100)}%` : 'no steward on your council'].filter(Boolean).join(' · '))}
        ${line('Vassals\' dues', m.dues ?? 0, m.dues === null ? 'measuring…' : 'as paid over the last two minutes')}
        ${m.tribute ? line('Tribute from vassal houses', m.tribute) : ''}
      </tbody></table></section>
      <section class="box"><h4>Goes out</h4><table class="money"><tbody>
        ${line(`Soldiers' wages (${num(m.paidMen)} men)`, -m.elites, `every man beyond ${HOME_GUARD} home guard a place, wherever he stands`)}
        ${line(`Sellsword wages (${plural(m.hired.length, 'company', 'companies')})`, -m.wages)}
        ${m.roads ? line("Wardens of the king's roads", -m.roads) : ''}
      </tbody></table></section>
      <section class="box"><h4>The purse</h4><table class="money"><tbody>
        <tr class="sum"><th>Net, as planned</th><td class="${m.net >= 0 ? 'good' : 'bad'}">${signed(m.net)} a minute</td></tr>
        <tr><th>Seen in the purse<br><small>the last two minutes, with markets, caravans and what you spent</small></th><td>${m.observed === null ? 'measuring…' : `${signed(m.observed)} a minute`}</td></tr>
        <tr><th>In the purse</th><td>${num(FACTIONS[0].gold)}${lasts ? ` <small class="bad">lasts about ${Math.round(lasts)} min</small>` : ''}</td></tr>
        <tr><th>In your vassals' purses<br><small>you can demand half of each</small></th><td>${num(vg)}</td></tr>
      </tbody></table></section></div>
      <section class="box wide"><h4>Taxes by village</h4><table><tbody>${byTown.map(([p, n]) => `<tr><th>${esc(p.name)}<br><small>${p.town.population} people · ${TAXES[p.town.taxes]?.name || ''}</small></th><td><div class="bar"><i style="width:${byTown[0][1] ? n / byTown[0][1] * 100 : 0}%"></i></div></td><td>${n.toFixed(0)} a minute</td><td class="acts"><button data-act="go:${p.id}">Go</button></td></tr>`).join('') || '<tr><td class="dim">You run no village yourself.</td></tr>'}</tbody></table>
      <p class="note">Taxes rise with people and the tax rate (set in each village's stock panel); a content village pays more. Gold also comes from markets selling spare goods and from caravans, and buys market goods, feasts, great keeps, stone walls and peace.</p></section>`;
  }
}
