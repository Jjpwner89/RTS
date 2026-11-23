// When a saved campaign can't be loaded: say so, plainly, and keep the data. Never a new campaign in its place.
// A card over the page (the campaign page does not go on loading behind it), with what can be done: take the
// data out to a file, use an earlier save or one from a file (the front page's Saved campaigns), or go back.
import { listSaves, inspect, fileName, importText, minutesIn, ago } from '../world/saveslots.js';

export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text === undefined ? {} : { textContent: text });

// slot: { status, reason, raw }  (from save.js loadSlot). Resolves never: the page stays on this card.
export function showLoadFailure(slot, { test = false } = {}) {
  const none = slot.status === 'none';
  const veil = el('div', { id: 'loadfail' });
  const card = el('div', { className: 'modal open', role: 'alertdialog' });
  card.append(el('h2', {}, none ? 'No saved campaign here' : "Your saved campaign can't be opened"));
  card.append(el('p', {}, none
    ? `This browser has no ${test ? 'test ' : ''}campaign to continue. If you cleared your browser's data, or this is a different browser or computer, a save file or an earlier save may bring it back.`
    : `The game could not load it: ${slot.reason}. Nothing has been deleted or replaced, and a new campaign has not been started.`));
  const items = el('div', { className: 'gm-items' });
  if (slot.raw) items.append(el('button', { type: 'button', onclick: () => download(`rts-damaged-save.json`, slot.raw) }, 'Save this data to a file'));
  const others = listSaves().filter(s => s.info.status === 'ok' || s.info.status === 'old');
  if (others.length) items.append(el('button', { type: 'button', onclick: () => { location.href = 'index.html#saves'; } }, `Use an earlier save (${others.length})`));
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const note = el('p', { className: 'whyline', hidden: true });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    const r = importText(await f.text());
    note.hidden = false;
    if (r.ok) { note.textContent = 'Loaded. Opening it…'; location.href = 'world.html?continue'; } else note.textContent = `${r.reason}.`;
  };
  items.append(el('button', { type: 'button', onclick: () => file.click() }, 'Load a save from a file'), el('button', { type: 'button', className: 'primary', onclick: () => { location.href = 'index.html'; } }, 'Back to the main menu'));
  card.append(items, note, file);
  veil.append(card);
  document.body.append(veil);
  document.body.classList.add('load-failed');
  return new Promise(() => {});
}
