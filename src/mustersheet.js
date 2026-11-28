// The Muster's two faces (specs/MUSTER.md): the sheet that raises a host, one button, and the
// host's card on a place's card and an army's on the map (how it stands, March the host, send
// its ban home, disband it). The rules are in world/muster.js.
import { hostStatus, hostsAt, hostsIn, marchPlan, marchHost, disbandHost, guardDefault, hostById,
  musterPlan, musterRows, musterHost, defaultPicks, gathers } from './world/muster.js';
import { sendBanHome, yourLevies, musterPlace, ARRIERE } from './world/arriere.js';
import { capWhy, FACTIONS } from './world/world.js';
import { ico } from './icons.js';

const num = n => Math.round(n).toLocaleString('en-GB');
const mins = s => (s < 60 ? 'under a minute' : `about ${Math.round(s / 60)} min`);
const GARRISONS = [[0, 'nobody'], [20, 'the guard'], [50, '50 men'], [100, '100 men']];
const chosen = new Map();     // host id → the garrison you chose to leave
let sure = null;              // the Disband button asked for once

// The one line that says how a host stands.
export function hostLine(w, H) {
  const S = hostStatus(w, H), at = S.at?.name || 'its muster';
  const parts = S.coming ? [`${num(S.here)} of ${num(S.here + S.coming)} at ${at}, the rest in ${mins(S.eta)}`] : S.here ? [`${num(S.here)} men at ${at}`] : [];
  for (const [p, n] of S.awayAt) parts.push(`${num(n)} wait at ${p.name}`);
  const moving = S.away - [...S.awayAt.values()].reduce((a, b) => a + b, 0);
  if (moving > 0) parts.push(`${num(moving)} on the march`);
  return parts.join(' · ');
}

// (those on the road have not started their time yet: arriere.js)
const banLine = S => (S.ban ? `${num(S.ban)} of them are the arrière-ban: ${S.banLeft === Infinity ? `they serve ${Math.round(ARRIERE.serve / 60)} min from the day they arrive` : S.banLeft > 0 ? `home in ${Math.max(1, Math.ceil(S.banLeft / 60))} min` : 'going home'}` : '');

// The cards for the selected place or army, as HTML ('' with no host there).
export function hostCards(w, it) {
  if (!it || it.house) return '';
  const place = !it.units;
  let hosts = place ? hostsAt(w, it) : it.side === 0 ? hostsIn(w, it) : [];
  if (place && it.owner === 0) hosts = [...new Set([...hosts, ...(w.hosts || []).filter(H => H.at === it.id)])];
  return hosts.map(H => {
    const S = hostStatus(w, H), ban = banLine(S);
    let march = '';
    if (place) {
      const leave = chosen.get(H.id) ?? guardDefault(H), M = marchPlan(w, H, it, leave);
      if (S.coming || M.men || M.stay) {
        const label = S.coming ? `March with the ${num(M.men)} here; the rest follow` : H.marched ? `March the host on (${num(M.men)})` : `March the host (${num(M.men)})`;
        const over = M.men > w.armyCap ? ` ${num(M.men - w.armyCap)} stay: one army of yours holds ${num(w.armyCap)}.` : '';
        march = (it.town ? `<div class="leave"><span>Leave as garrison</span>${GARRISONS.map(([n, t]) => `<button data-host="leave:${H.id}:${n}" class="${n === leave ? 'on' : ''}">${t}</button>`).join('')}</div>${M.stay ? `<p class="note">${num(M.stay)} men stay at ${it.name}.</p>` : ''}` : '')
          + `<button data-host="march:${H.id}" class="wide" ${M.ok ? '' : 'disabled'} title="${M.ok ? `Every regiment of the host here leaves as one army.${over}` : M.why}">${ico('battle')} ${label}</button>`;
      }
    }
    const asked = sure === H.id;
    return `<div class="hostcard"><h4>${ico('crown', '#8d3b16')} ${H.name}</h4><p class="status">${hostLine(w, H)}</p>${ban ? `<p class="note">${ban}</p>` : ''}`
      + (!place && it.musterFor === H.id ? '<p class="note">On its way to join. Order it elsewhere and it leaves the muster.</p>' : '')
      + march
      + (S.ban ? `<button data-host="ban:${H.id}" class="wide" title="They go home now, and their places rest before they answer again">${ico('spears')} Send the ban home</button>` : '')
      + `<button data-host="disband:${H.id}" class="wide${asked ? ' warn' : ''}" title="Levies go back to their villages as villagers, vassals' men to their lords, the ban home; armies you gathered stay armies">${asked ? 'Yes, disband the host' : 'Disband the host'}</button></div>`;
  }).join('');
}

// A click on a host card. Returns { army } (the host marched: select it), { flash, good } or nothing.
export function hostClick(w, data, it) {
  const [act, id, arg] = data.split(':'), H = hostById(w, +id);
  if (!H) return { flash: 'That host is gone.' };
  if (act !== 'disband') sure = null;
  if (act === 'leave') { chosen.set(H.id, +arg); return {}; }
  if (act === 'march' && it && !it.units) {
    const army = marchHost(w, H.id, it, chosen.get(H.id));
    chosen.delete(H.id);
    return army ? { army } : { flash: 'None of the host can march from here now.' };
  }
  if (act === 'ban') {
    const S = hostStatus(w, H), theirs = yourLevies(w).filter(u => u.hostId === H.id);
    sendBanHome(w, [...S.banFrom].map(p => w.byId[p]).filter(Boolean), theirs);
    return {};
  }
  if (act === 'disband') {
    if (sure !== H.id) { sure = H.id; return {}; }
    sure = null;
    const r = disbandHost(w, H.id);
    return r.ok ? {} : { flash: r.why };
  }
  return {};
}

// ---- the sheet ----

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const arrives = r => (r.eta ? `${r.eta < 60 ? 'under a minute' : `${Math.round(r.eta / 60)} min`}` : 'at once');
const GROUPS = [
  ['here', 'This place', 'What stands under arms here'],
  ['villages', 'Your villages\' spare men', 'Each keeps its guard: the men on its walls, its militia and 20 men in all'],
  ['vassals', 'Your vassals\' shares', 'By the levies you ask of each'],
  ['ban', 'The countryside (arrière-ban)', `Spearmen of little heart, beyond your village people. They serve ${Math.round(ARRIERE.serve / 60)} minutes from the day they arrive; then that place rests ${ARRIERE.rest / 60}`],
  ['armies', 'Your armies in the field', 'They stay armies if the host is disbanded'],
];
// The places a host may gather at: yours, and not being fought over.
export const musterPlaces = w => w.pois.filter(p => p.owner === 0 && p.kind !== 'camp' && !p.town?.hostile && !p.town?.underAttack && !p.town?.revolt);

export class MusterSheet {
  // hooks: done(place, result) after a call, flash(text).
  constructor(world, hooks) {
    this.w = world;
    this.hooks = hooks;
    this.dest = null;
    this.picks = new Set();
    this.only = null;          // a vassal asked for from the Realm screen
    this.at = 0;
    MusterSheet.shown = this;  // the one sheet, for checks()
    this.el = document.createElement('aside');
    this.el.id = 'muster';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', e => this.click(e));
    this.el.addEventListener('change', e => this.change(e));
    // Never redrawn under a pressed button, or the press would land on a replaced one.
    this.el.addEventListener('pointerdown', () => { this.pressed = true; });
    addEventListener('pointerup', () => { this.pressed = false; });
  }

  get open() { return !this.el.hidden; }
  // Opens for `dest` (a place of yours; else the muster place as the arrière-ban picks it);
  // `vassal`: only their share ticked.
  show({ dest = null, vassal = null } = {}) {
    this.only = vassal;
    this.setDest(dest && musterPlaces(this.w).includes(dest) ? dest : musterPlace(this.w));
    this.el.hidden = false;
    this.html = null;
    this.update(true);
    this.el.querySelector('.body').scrollTop = 0;
  }
  hide() { this.el.hidden = true; }
  setDest(p) {
    this.dest = p;
    const rows = musterRows(this.w, p);
    this.picks = this.only ? new Set(rows.filter(r => r.ok && r.key === `vas:${this.only}`).map(r => r.key)) : defaultPicks(rows);
  }

  change(e) {
    const k = e.target.dataset.set;
    if (k === 'dest') this.setDest(this.w.byId[e.target.value]);
    else if (e.target.dataset.row) { if (e.target.checked) this.picks.add(e.target.dataset.row); else this.picks.delete(e.target.dataset.row); }
    e.target.blur?.();
    this.update(true);
  }

  click(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const [act, arg] = b.dataset.act.split(/:(.*)/);
    const w = this.w;
    if (act === 'close') return this.hide();
    if (act === 'all' || act === 'none') {
      for (const r of musterRows(w, this.dest).filter(r => r.group === arg)) if (act === 'all' && r.ok) this.picks.add(r.key); else this.picks.delete(r.key);
    }
    if (act === 'home') {
      const places = arg === 'all' ? musterRows(w, this.dest).filter(r => r.group === 'ban' && r.out).map(r => r.place) : [w.byId[arg]];
      sendBanHome(w, places);
    }
    if (act === 'call') {
      const dest = this.dest, r = musterHost(w, dest, this.picks);
      if (!r.ok) this.hooks.flash(r.why);
      else { this.hide(); return this.hooks.done?.(dest, r); }
    }
    this.update(true);
  }

  update(now = false) {
    if (!this.open) return;
    const t = performance.now();
    if (!now && (t - this.at < 1000 || this.pressed || this.el.contains(document.activeElement) && document.activeElement.tagName === 'SELECT')) return;
    this.at = t;
    const w = this.w;
    if (!musterPlaces(w).includes(this.dest)) {
      const next = musterPlace(w);
      if (!musterPlaces(w).includes(next)) { this.hooks.flash('No place of yours can gather a host just now.'); return this.hide(); }
      this.setDest(next);
    }
    const html = this.draw();
    if (html === this.html) return;
    this.html = html;
    const top = this.el.querySelector('.body')?.scrollTop || 0;
    this.el.innerHTML = html;
    this.el.querySelector('.body').scrollTop = top;
  }

  draw() {
    const w = this.w, P = musterPlan(w, this.dest, this.picks), H = P.host;
    const places = musterPlaces(w).sort((a, b) => (b === this.dest) - (a === this.dest) || a.name.localeCompare(b.name));
    const row = r => {
      const on = r.ok && this.picks.has(r.key);
      let state = r.ok ? arrives(r) : `<span class="dim">${esc(r.why)}</span>`;
      if (r.group === 'ban') {
        state = r.state === 'ready' ? (r.ok ? `ready · ${arrives(r)}` : `<span class="dim">${esc(r.why)}</span>`) : `<span class="warn">${esc(r.why)}</span>`;
        if (r.out) state += ` <button data-act="home:${r.place.id}" title="Your ${num(r.out)} men of its countryside go home now, and it rests ${ARRIERE.rest / 60} minutes before it answers again">Send home</button>`;
      }
      return `<tr class="${r.ok ? '' : 'off'}"><td><label><input type="checkbox" data-row="${r.key}" ${on ? 'checked' : ''} ${r.ok ? '' : 'disabled'}><span>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span></label></td>`
        + `<td class="n">${num(r.men)}</td><td class="n">${r.group === 'ban' ? `${num(r.gold)} gold<small>${num(r.food)} food a min</small>` : ''}</td><td>${state}</td></tr>`;
    };
    const groups = GROUPS.map(([g, title, about]) => {
      if (g === 'armies' && !gathers(w)) return '';
      const rows = P.rows.filter(r => r.group === g).sort((a, b) => (b.place === this.dest) - (a.place === this.dest) || a.eta - b.eta);
      if (!rows.length) return g === 'here' ? '' : `<section><h4>${title}</h4><p class="note">${g === 'vassals' ? 'No vassal of yours holds a village elsewhere.' : g === 'armies' ? 'No army of yours is free to come.' : 'Nobody to call.'}</p></section>`;
      const outs = g === 'ban' ? rows.filter(r => r.out).length : 0;
      const sum = rows.filter(r => r.ok && this.picks.has(r.key)).reduce((n, r) => n + r.men, 0);
      return `<section><h4>${title} <small>${sum ? `${num(sum)} ticked` : ''}</small><span class="acts">${rows.length > 1 ? `<button data-act="all:${g}">Tick all</button><button data-act="none:${g}">Clear</button>` : ''}${outs ? '<button data-act="home:all">Send all home</button>' : ''}</span></h4>`
        + `<p class="note">${about}.</p><table><tbody>${rows.map(row).join('')}</tbody></table></section>`;
    }).join('');
    const stage = [...new Set(P.picked.filter(r => r.to && r.to !== this.dest).map(r => r.to.name))];
    const foot = [`<b class="${P.over ? 'warn' : ''}">${num(P.total)} of ${num(P.cap)} men</b>${H && P.total > P.men ? ` <small>(${num(P.total - P.men)} of them the host's already)</small>` : ''}`,
      `<b>${num(P.gold)} gold</b> <small>(you have ${num(Math.floor(FACTIONS[0].gold))})</small>`,
      P.food ? `the host eats ${num(P.food)} food a minute` : '',
      P.picked.length ? (P.eta >= 30 ? `all in ${P.eta < 60 ? 'under a minute' : `about ${Math.round(P.eta / 60)} min`}` : 'all in at once') : ''].filter(Boolean).join(' · ');
    return `<header><h2>${ico('crown', '#8d3b16')} Muster a host</h2>
      <label class="where">at <select data-set="dest">${places.map(p => `<option value="${p.id}" ${p === this.dest ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <button data-act="close" class="close" title="Close (Esc)">✕</button></header>
      <div class="body">${H ? `<p class="note">This adds to ${esc(H.name.replace(/^The/, 'the'))}: ${esc(hostLine(w, H))}.</p>` : ''}${groups}</div>
      <footer><div class="totals"><p>${foot}</p>${P.over ? `<p class="warn">${num(P.over)} would stay at ${esc(this.dest.name)} when it marches. ${esc(capWhy(w.rank))}</p>` : ''}${stage.length ? `<p class="warn">Some gather at ${esc(stage.join(' and '))}: no friendly road to ${esc(this.dest.name)}.</p>` : ''}${!P.ok ? `<p class="dim">${esc(P.why)}.</p>` : ''}</div>
      <button data-act="call" class="go" ${P.ok ? '' : `disabled title="${esc(P.why)}"`}>${ico('battle')} Muster</button></footer>`;
  }
}
