// The host's card (specs/MUSTER.md), on a place's card and an army's on the map: how the host
// stands, March the host, send its ban home, disband it. The rules are in world/muster.js.
import { hostStatus, hostsAt, hostsIn, marchPlan, marchHost, disbandHost, guardDefault, hostById } from './world/muster.js';
import { sendBanHome, yourLevies } from './world/arriere.js';
import { ico } from './icons.js';

const num = n => Math.round(n).toLocaleString('en-GB');
const mins = s => (s < 60 ? 'under a minute' : `about ${Math.round(s / 60)} min`);
const GARRISONS = [[0, 'nobody'], [20, 'the guard'], [50, '50 men'], [100, '100 men']];
const chosen = new Map();     // host id → the garrison you chose to leave
let sure = null;              // the Disband button asked for once

// The one line that says how a host stands.
export function hostLine(w, H) {
  const S = hostStatus(w, H), at = S.at?.name || 'its muster';
  const parts = [S.coming ? `${num(S.here)} of ${num(S.here + S.coming)} at ${at}, the rest in ${mins(S.eta)}` : S.here ? `${num(S.here)} men at ${at}` : `Nobody left at ${at}`];
  for (const [p, n] of S.awayAt) parts.push(`${num(n)} wait at ${p.name}`);
  const moving = S.away - [...S.awayAt.values()].reduce((a, b) => a + b, 0);
  if (moving > 0) parts.push(`${num(moving)} on the march`);
  return parts.join(' · ');
}

const banLine = S => (S.ban ? `${num(S.ban)} of them are the arrière-ban: ${S.banLeft > 0 ? `home in ${Math.max(1, Math.ceil(S.banLeft / 60))} min` : 'going home'}` : '');

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
    return `<div class="hostcard"><h4>${ico('crown', '#e8c45a')} ${H.name}</h4><p class="status">${hostLine(w, H)}</p>${ban ? `<p class="note">${ban}</p>` : ''}`
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
