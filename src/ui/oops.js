// When something goes wrong, the player is told and can pass it on; a browser that can't run the game is told so.
// Loaded first on every page, with no imports but the build stamp, so it works when little else does.
//
//  - An uncaught error or a rejected promise (or a script that failed to load) puts a banner at the bottom:
//    "Something went wrong. Your last save is safe." with Copy details (build, seed, minute, the last errors,
//    the save's age and size), Reload and Dismiss. It never touches the game or a save.
//  - On a game page, a browser without modules, import maps or WebGL 2 gets a plain card saying what it needs.
import { BUILD } from '../version.js';

const SAVE_KEY = 'rts.campaign.save';
const GAME_PAGES = /\/(world|town|battle|muster|sandbox)\.html$/;
const errors = [];
let banner = null, hidden = false, more = 0;

const style = `
#oops { position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 100; width: min(640px, calc(100vw - 20px)); box-sizing: border-box;
  background: #3a1d12; color: #f6e7c8; border: 1px solid #c9822e; border-radius: 8px; padding: 10px 12px; font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
#oops b { color: #ffd98a; } #oops small { display: block; opacity: .8; margin-top: 4px; word-break: break-word; }
#oops .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#oops button { font: inherit; padding: 4px 12px; color: #f6e7c8; background: #5a3320; border: 1px solid #c9822e; border-radius: 4px; cursor: pointer; }
#unsupported { position: fixed; inset: 0; z-index: 101; display: grid; place-items: center; padding: 16px; background: #241810; color: #f6e7c8; font: 16px/1.5 system-ui, sans-serif; }
#unsupported div { max-width: 440px; } #unsupported h2 { color: #ffd98a; margin: 0 0 8px; } #unsupported button { font: inherit; padding: 6px 14px; margin-top: 8px; }`;
const addStyle = () => { if (document.getElementById('oops-style')) return; const s = document.createElement('style'); s.id = 'oops-style'; s.textContent = style; document.head.append(s); };

// What the current save looks like from here, without trusting it.
function saveNote() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { at: d.savedAt || 0, kb: Math.round(raw.length / 1024), version: d.version, minute: Math.floor((d.world?.time || 0) / 60) };
  } catch { return { at: 0, kb: 0, version: '?', unreadable: true }; }
}
const agoMin = at => { const m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? 'under a minute ago' : `${m} min ago`; };

export function details() {
  const w = window.game?.world, s = saveNote();
  const lines = [
    'RTS error report',
    `Build: ${BUILD.sha}${BUILD.at ? ` (${BUILD.at})` : ''}`,
    `Page: ${location.pathname.split('/').pop()}${location.search}`,
    `Browser: ${navigator.userAgent}`,
    `Screen: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    w ? `Campaign: seed ${w.seed}, id ${w.campaignId || '?'}, minute ${Math.floor(w.time / 60)}, rank ${w.rank}, ${w.pois.filter(p => p.owner === 0).length} places` : 'Campaign: none loaded on this page',
    s ? `Last save: ${s.at ? agoMin(s.at) : 'unknown time'}, ${s.kb} KB, version ${s.version}, minute ${s.minute}${s.unreadable ? ' (unreadable)' : ''}` : 'Last save: none in this browser',
    '',
    `Errors (last ${Math.min(5, errors.length)} of ${errors.length}):`,
    ...errors.slice(-5).flatMap((e, i) => [`${i + 1}. ${e.msg}`, ...(e.stack ? e.stack.split('\n').slice(0, 5).map(l => `   ${l.trim()}`) : [])]),
  ];
  return lines.join('\n');
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}

function render() {
  if (hidden) return;
  addStyle();
  if (!banner) { banner = document.createElement('div'); banner.id = 'oops'; banner.setAttribute('role', 'alert'); document.body.append(banner); }
  const s = saveNote();
  const safe = !s ? 'Nothing is saved in this browser yet: save if you can, then reload.' : s.unreadable ? 'The saved data could not be read, but nothing has been deleted.' : `Your last save (${agoMin(s.at)}) is safe.`;
  const last = errors.at(-1);
  banner.replaceChildren();
  const text = document.createElement('div');
  text.innerHTML = `<b>Something went wrong.</b> ${safe}`;
  const small = document.createElement('small');
  small.textContent = `${last.msg}${more ? ` (and ${more} more)` : ''}`;
  text.append(small);
  const row = document.createElement('div'); row.className = 'row';
  const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; row.append(b); return b; };
  const cp = mk('Copy details', async () => {
    const text = details();
    if (await copy(text)) { cp.textContent = 'Copied: send it to whoever made the game'; return; }
    // The browser would not let the page copy: show the report to select and copy by hand.
    cp.textContent = 'Select all of this and copy it';
    if (!banner.querySelector('textarea')) { const t = Object.assign(document.createElement('textarea'), { value: text, readOnly: true, rows: 8 }); t.style.cssText = 'width:100%;margin-top:8px;box-sizing:border-box;font:12px monospace'; banner.append(t); t.focus(); t.select(); }
  });
  mk('Reload the page', () => location.reload());
  mk('Dismiss', () => { hidden = true; banner.remove(); banner = null; });
  banner.append(text, row);
}

function note(msg, stack) {
  if (!msg || /ResizeObserver loop/.test(msg)) return;
  const prev = errors.at(-1);
  if (prev && prev.msg === msg) { more++; return; }
  if (errors.length) more++;
  errors.push({ msg: String(msg).slice(0, 300), stack: stack ? String(stack).slice(0, 1200) : '' });
  hidden = false;   // dismissing hides this one; a different error speaks up again
  if (document.body) render(); else addEventListener('DOMContentLoaded', render, { once: true });
}

addEventListener('error', e => {
  const t = e.target;
  if (t && t !== window && t.tagName) {
    // A script or stylesheet of ours that failed to load; a missing picture or sound is not a reason to stop the player.
    if (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && t.rel === 'stylesheet' && !/fonts\.googleapis/.test(t.href))) note(`Could not load ${(t.src || t.href || '').split('/').slice(-2).join('/')}`);
    return;
  }
  // Cross-origin noise and browser extensions say "Script error." with no file: not ours.
  if (!e.message || e.message === 'Script error.' || (e.filename && !e.filename.startsWith(location.origin))) return;
  note(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`, e.error?.stack);
}, true);
addEventListener('unhandledrejection', e => {
  const r = e.reason;
  note(`${r?.message || r}`, r?.stack);
});

// ---- a browser that can't run it ----
export function supportProblem() {
  const lacks = [];
  if (!('noModule' in HTMLScriptElement.prototype)) lacks.push('JavaScript modules');
  else if (!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))) lacks.push('import maps (Safari 16.4 or newer, Chrome 89, Firefox 108)');
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) lacks.push('WebGL 2 graphics (they may be turned off in the browser settings)');
    else gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { lacks.push('WebGL 2 graphics'); }
  return lacks;
}
function checkSupport() {
  if (!GAME_PAGES.test(location.pathname)) return;
  const lacks = supportProblem();
  if (!lacks.length) return;
  addStyle();
  const v = document.createElement('div'); v.id = 'unsupported';
  const card = document.createElement('div');
  card.innerHTML = '<h2>This browser can\'t run the game</h2><p>It needs a recent Chrome, Edge, Firefox or Safari (16.4 or newer), with graphics turned on. This browser is missing:</p><ul></ul><p>You can try anyway, but it may not work.</p>';
  for (const l of lacks) { const li = document.createElement('li'); li.textContent = l; card.querySelector('ul').append(li); }
  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Try anyway'; b.onclick = () => v.remove();
  const back = Object.assign(document.createElement('a'), { href: 'index.html', textContent: ' Back to the main menu', style: 'color:#ffd98a;margin-left:12px' });
  card.append(b, back); v.append(card);
  document.body.append(v);
}
if (document.body) checkSupport(); else addEventListener('DOMContentLoaded', checkSupport, { once: true });

window.oops = { details, errors, supportProblem, show: note };
