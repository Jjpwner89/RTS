// The front page's Saved campaigns: the current save, the rolling backups and the shelf of earlier campaigns,
// each to use or take out to a file, and a way to bring a save in from a file (world/saveslots.js).
import { listSaves, restore, importText, fileName, minutesIn, ago, storageKept } from '../world/saveslots.js';
import { download } from './loadfail.js';

const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text === undefined ? {} : { textContent: text });

const describe = s => {
  const i = s.info;
  if (i.status === 'damaged') return `${s.label}: can't be opened (${i.reason})`;
  if (i.status === 'newer') return `${s.label}: ${minutesIn(i.time)} in, saved by a newer version of the game`;
  return `${s.label}: ${minutesIn(i.time)} in${i.part === 2 ? ', at war with the north' : ''}${i.ironman ? ', ironman' : ''}, saved ${ago(i.savedAt)}`;
};

export function mountSaves(root) {
  const draw = async (say = '') => {
    root.replaceChildren();
    const saves = listSaves();
    if (saves.length) root.append(el('h3', {}, 'Saved campaigns'));
    const msg = el('p', { className: 'whyline', hidden: !say }, say);
    root.classList.toggle('bare', !saves.length);
    if (!saves.length) root.append(el('span', { className: 'note' }, 'Have a save file from another browser or computer? '));
    for (const s of saves) {
      const row = el('div', { className: 'saverow' });
      row.append(el('span', { className: 'grow' }, describe(s)));
      const usable = s.info.status === 'ok' || s.info.status === 'old';
      if (usable && s.label === 'Current') row.append(Object.assign(el('a', { className: 'btn', href: 'world.html?continue' }, 'Continue')));
      else if (usable) {
        const use = el('button', { type: 'button' }, 'Use this one');
        use.onclick = () => {
          if (use.dataset.sure !== '1') { use.dataset.sure = '1'; use.textContent = 'Yes: your current save is kept as a backup'; return; }
          const r = restore(s.key);
          if (r.ok) location.href = 'world.html?continue'; else draw(`${r.reason}.`);
        };
        row.append(use);
      }
      const out = el('button', { type: 'button', title: 'A copy as a file you keep' }, 'To a file');
      out.onclick = () => download(fileName(s.info), s.raw);
      row.append(out);
      root.append(row);
    }
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      const r = importText(await f.text());
      if (r.ok) location.href = 'world.html?continue'; else draw(`${r.reason}.`);
    };
    const imp = el('button', { type: 'button' }, 'Load a save from a file');
    imp.onclick = () => file.click();
    root.append(imp, file, msg);
    const kept = await storageKept();
    if (kept === false) root.append(el('p', { className: 'note' }, "Your browser may clear saved campaigns if this site is left alone for a while (Safari does after about a week). Use \"To a file\" now and then, and your campaign is safe whatever happens."));
  };
  draw();
  return { draw };
}
