// The game menu: one for every page (world, village, battle, muster). A Menu button in the
// top bar and Esc (when Esc has nothing else to close or cancel) open it; opening it pauses
// the game. Resume, Save, Sound, Quit to the main menu. Quit asks only when something would
// be lost: progress since the last save, or a battle in progress inside the campaign.
//
// The page loads this file first (so its key listener comes before the game's) and then calls
//   menu.use({ pause: { get, set }, save: { ... } })
// with what it knows: how to pause, and, for the campaign only, how saving stands
// (ironman, can(), run(), unsaved(), last(), fight(), over(), test). A page that gives
// nothing (village, battle, muster) has nothing to lose, so Quit just goes.
//
// Esc: the game's own jobs for it (cancel a placement, close the Realm screen, clear the
// selection, ...) mark the keydown with `e.escUsed = true`; the menu opens on an Esc that
// nobody used. Checks and tests can drive it through window.gameMenu.
import { why } from './why.js';
import { controlsFor } from './controlslist.js';
import { BUILD } from '../version.js';

const MENU_PAGE = 'index.html';
let host = {};
let isOpen = false, view = 'main', wasPaused = null, leaving = false, returnFocus = null;
let btn = null, veil = null, card = null;

const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text === undefined ? {} : { textContent: text });

// "3 min ago" for a save made at wall-clock time `at`
function ago(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'under a minute ago';
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// What Quit has to ask, or null when nothing would be lost.
function plan() {
  const sv = host.save;
  if (!sv || sv.over?.()) return null;
  const fight = sv.fight?.() || null;
  let dirty = true;
  try { dirty = sv.unsaved(); } catch { /* a snapshot that won't build counts as unsaved */ }
  const lost = !sv.ironman && dirty;                       // ironman saves itself
  if (!fight && !lost) return null;
  const can = sv.can();
  const last = sv.last();
  const since = last == null ? 'This campaign has not been saved yet: all of it will be lost.' : `Progress since your last save (${ago(last)}) will be lost.`;
  let text;
  if (fight) text = `The battle in progress will be lost.${lost ? ` ${since}` : ''} Saving waits until the battle ends.`;
  else text = `${since}${can.ok ? '' : ` It can't be saved right now: ${can.reason.toLowerCase()}.`}`;
  return { fight, lost, text, canSave: !fight && can.ok };
}

function leave() { leaving = true; location.href = MENU_PAGE; }

function saveNow() {
  const r = host.save.run();
  return r?.ok !== false ? { ok: true } : { ok: false, reason: r.reason || "It couldn't be saved" };
}

function button(label, onclick, { primary = false, id, title } = {}) {
  const b = el('button', { type: 'button', onclick }, label);
  if (id) b.id = id;
  if (title) b.title = title;
  if (primary) b.classList.add('primary');
  return b;
}

function render(focus) {
  card.replaceChildren();
  const sv = host.save;
  if (view === 'confirm') {
    const p = plan() || { text: '', canSave: false };
    card.append(el('h2', {}, p.fight ? 'Leave the battle?' : 'Leave the game?'), el('p', { className: 'gm-text' }, p.text));
    const items = el('div', { className: 'gm-items' });
    const warn = el('p', { className: 'whyline', hidden: true });
    if (p.canSave) items.append(button('Save and quit', () => {
      const r = saveNow();
      if (r.ok) leave(); else { warn.textContent = `${r.reason}.`; warn.hidden = false; }
    }, { primary: true, id: 'gm-save-quit' }));
    items.append(button('Quit without saving', leave, { id: 'gm-quit-anyway' }), button('Cancel', () => { view = 'main'; render('#gm-resume'); }, { id: 'gm-cancel', primary: !p.canSave }));
    card.append(items, warn);
    (card.querySelector(focus || (p.canSave ? '#gm-save-quit' : '#gm-cancel')))?.focus();
    return;
  }
  if (view === 'controls') {
    card.append(el('h2', {}, 'Controls'));
    const list = el('div', { className: 'gm-controls' });
    controlsFor().forEach(([title, rows], i) => {
      const sec = el('details', { open: i === 0 }); sec.append(el('summary', {}, title));
      for (const [keys, what] of rows) { const r = el('div', { className: 'gm-row' }); r.append(el('kbd', {}, keys), el('span', {}, what)); sec.append(r); }
      list.append(sec);
    });
    card.append(list, el('div', { className: 'gm-items' }));
    card.lastChild.append(button('Back', () => { view = 'main'; render('#gm-resume'); }, { id: 'gm-back', primary: true }));
    card.querySelector('#gm-back').focus();
    return;
  }
  card.append(el('h2', {}, 'Game menu'));
  if (sv) {
    const last = sv.last();
    card.append(el('p', { className: 'gm-text', id: 'gm-state' }, sv.ironman ? 'Ironman: the campaign saves itself, and no save button is needed.'
      : last == null ? 'Not saved yet.' : `Last saved ${ago(last)}.${sv.test ? ' (A test campaign, in its own slot.)' : ''}`));
  }
  const items = el('div', { className: 'gm-items' });
  items.append(button('Resume', close, { primary: true, id: 'gm-resume', title: 'Back to the game' }));
  if (sv && !sv.ironman) {
    const b = button('Save', () => {
      const r = saveNow();
      card.querySelector('#gm-state').textContent = r.ok ? 'Saved just now.' : `${r.reason}.`;
      if (r.ok) host.flash?.('Saved. Continue from the menu any time.', true);
    }, { id: 'gm-save', title: 'Save the campaign now. It also saves itself every two minutes, between fights' });
    why(b, sv.over?.() ? 'The campaign is over' : sv.fight?.() ? 'Saving waits until the battle ends' : sv.can().ok ? '' : sv.can().reason);
    items.append(b);
  }
  if (sv?.exportFile) items.append(button('Save to a file', () => {
    const r = sv.exportFile();
    card.querySelector('#gm-state').textContent = r.ok ? (r.live ? 'Saved to a file, from now.' : `Saved to a file, from your last save (${ago(r.info.savedAt)}).`) : `${r.reason}.`;
  }, { id: 'gm-export', title: 'A copy of the campaign as a file you keep: for safety, or to carry it to another browser' }));
  items.append(button('Controls', () => { view = 'controls'; render(); }, { id: 'gm-controls', title: 'Every key and mouse button' }));
  if (document.getElementById('sound-toggle')) items.append(button('Sound and picture', () => document.getElementById('sound-toggle').click(), { id: 'gm-sound', title: 'Volume for the music and effects, and how detailed the picture is' }));
  items.append(button('Quit to main menu', () => { if (plan()) { view = 'confirm'; render(); } else leave(); }, { id: 'gm-quit', title: 'Back to the main menu' }));
  card.append(items);
  card.append(el('p', { className: 'gm-build' }, `Hearth and Host · build ${BUILD.sha}${BUILD.at ? `, ${BUILD.at}` : ''}`));
  card.querySelector(focus || '#gm-resume')?.focus();
}

function openMenu() {
  if (isOpen) return;
  isOpen = true; view = 'main';
  returnFocus = document.activeElement;
  wasPaused = host.pause ? host.pause.get() : null;
  host.pause?.set(true);
  render();
  veil.classList.add('open'); card.classList.add('open');
  document.body.classList.add('menu-open');
  btn?.setAttribute('aria-expanded', 'true');
}

function close() {
  if (!isOpen) return;
  isOpen = false;
  veil.classList.remove('open'); card.classList.remove('open');
  document.body.classList.remove('menu-open');
  btn?.setAttribute('aria-expanded', 'false');
  if (host.pause && wasPaused === false) host.pause.set(false);   // back to how it was
  // A button that keeps focus would be pressed again by Space's key-up, as the toolbar's do.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  returnFocus = null;
}

// Something the player has to answer (an event card, the end screen) is not for Esc to cover.
const answering = () => {
  const end = document.getElementById('end');
  return !!document.querySelector('.modal.open') || (!!end && !end.hidden && getComputedStyle(end).display !== 'none');
};

function build() {
  if (btn) return;
  btn = el('button', { type: 'button', id: 'menu-btn', title: 'Game menu: resume, save, sound, quit to the main menu', onclick: () => { btn.blur(); isOpen ? close() : openMenu(); } });
  btn.dataset.key = 'Esc';
  btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  btn.append(el('span', { className: 'ico-menu', ariaHidden: 'true' }, '☰'), el('span', { className: 'lbl' }, ' Menu'));
  const bar = document.getElementById('top') || document.getElementById('muster-top');
  if (bar) bar.prepend(btn); else { btn.classList.add('float'); document.body.append(btn); }
  veil = el('div', { id: 'menu-veil' });
  card = el('div', { id: 'gamemenu', className: 'modal', role: 'dialog' });
  card.setAttribute('aria-modal', 'true');
  veil.append(card);
  veil.addEventListener('pointerdown', e => { if (e.target === veil) { e.preventDefault(); if (view === 'confirm') { view = 'main'; render('#gm-resume'); } else close(); } });
  document.body.append(veil);
}

// Captured on the window and registered before the game's own listeners: while the menu is
// open the game hears no keys at all (Tab, Space and Enter still work on the menu's buttons).
addEventListener('keydown', e => {
  if (isOpen) {
    if (e.key === 'Escape') { e.preventDefault(); if (view === 'confirm' || view === 'controls') { view = 'main'; render('#gm-resume'); } else close(); }
    else if (e.key === 'Tab') {
      const bs = [...card.querySelectorAll('button:not(:disabled)')];
      if (bs.length) { const i = bs.indexOf(document.activeElement); const n = bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length]; e.preventDefault(); n.focus(); }
    }
    e.stopImmediatePropagation();
    return;
  }
  if (e.key !== 'Escape' || e.repeat || e.target.closest?.('input, select, textarea')) return;
  // After the game's own handlers have had their say.
  setTimeout(() => { if (!e.escUsed && !e.defaultPrevented && !isOpen && !answering()) { build(); openMenu(); } });
}, true);

// A closed tab or a reload asks too, when there is something to lose. Not in a test campaign,
// and not under automation (webdriver or headless Chrome: its beforeunload dialog would stop
// a headless run from ever leaving the page).
const warnsOnUnload = () => !leaving && !host.save?.test && !!plan();
const automated = () => navigator.webdriver || /Headless/i.test(navigator.userAgent);
addEventListener('beforeunload', e => {
  if (automated() || !warnsOnUnload()) return;
  e.preventDefault();
  e.returnValue = '';
});

export const menu = {
  use(h) { host = h || {}; build(); return menu; },
  open: () => { build(); openMenu(); },
  close,
  plan,
  warnsOnUnload,
  get isOpen() { return isOpen; },
  get view() { return view; },
  get host() { return host; },
  // for tests: leave without asking, and without the unload warning
  mute() { leaving = true; },
};
window.gameMenu = menu;
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', build); else build();
export default menu;
