// The interface's own sounds, in one place (the Audio session owns audio.js and the sounds
// themselves; a name it doesn't have yet is simply silent). Delegated, so every tab, close
// button and folding heading sounds once without each screen asking:
//   tab    a build-bar or Realm tab         open / close  a panel folding out or away, a ×
//   deny   a greyed button pressed          unlock        a "New" seal's introduction appearing
// Plain button clicks keep audio.js's own 'click'. Loaded once per page from its HTML.
import { play } from '../audio.js';

const sound = name => { try { play(name); } catch { /* audio not up yet */ } };

addEventListener('click', e => {
  const t = e.target;
  if (t.closest?.('[data-tab], #realm nav button')) return sound('tab');
  if (t.closest?.('.close-t, #realm .close')) return sound('close');
  const head = t.closest?.('#alerts h4, #wpanel.is-realm > h3, #goals h4, #stock .fold, #build [data-tab].on');
  if (head) setTimeout(() => sound(head.closest('.folded, #build.folded') ? 'close' : 'open'), 0);
}, true);

// A greyed button swallows its click in some browsers; pointerdown still reaches the page.
addEventListener('pointerdown', e => { if (e.target.closest?.('button:disabled, button[aria-disabled="true"]')) sound('deny'); }, true);

// news.js raises this when an introduction first shows.
addEventListener('ui-unlock', () => sound('unlock'));
