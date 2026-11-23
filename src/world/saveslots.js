// Where campaigns are kept in the browser, and how they are kept safe. No imports, so the front page can use it.
//
// The current save is `rts.campaign.save`. Under it:
//   - three rolling backups (b1 newest), made from the save about to be overwritten, at most one every
//     BACKUP_EVERY of wall-clock time, so they reach back half an hour or more;
//   - a shelf of two earlier campaigns: when a different campaign (a new game) saves over the current one,
//     the old one goes to the shelf and is never simply lost.
// A damaged or unreadable save is shelved, not overwritten. Ironman keeps no backups (a defeat ends it for good).
// Test campaigns have their own single slot and none of this.
//
// A save has a `version`; `migrate` brings an old one up to VERSION, one step at a time, and a save from a
// newer game than this one is reported as such, never read as if it were current.

export const KEY = 'rts.campaign.save';
export const TEST_KEY = 'rts.campaign.test';
export const VERSION = 1;
export const BACKUPS = [`${KEY}.b1`, `${KEY}.b2`, `${KEY}.b3`];
export const SHELF = ['rts.campaign.shelf.1', 'rts.campaign.shelf.2'];
export const BACKUP_EVERY = 10 * 60 * 1000;
export const MAX_IMPORT = 4_000_000;      // characters: a real save is 100 to 300 thousand

// One step per version: each takes a save of version n and returns one of version n + 1.
// (Nothing to migrate yet: version 1 is the only format. When VERSION goes to 2, add `1: d => ({ ...d, version: 2, ... })`
// here and a fixture of the old format to tools/fixtures/ for checks() to load.)
export const MIGRATIONS = {};
export function migrate(data) {
  let d = data;
  while (d.version < VERSION) {
    const step = MIGRATIONS[d.version];
    if (!step) throw new Error(`no way to bring a version ${d.version} save up to ${VERSION}`);
    d = step(d);
  }
  return d;
}

const lsOrNull = () => { try { return localStorage; } catch { return null; } };

// What a stored string is, without trusting it. { status: 'ok' | 'old' | 'newer' | 'damaged', ... }
export function inspect(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return { status: 'damaged', reason: 'the file is not a readable save' }; }
  if (!d || typeof d !== 'object' || !d.world || !Array.isArray(d.pois) || typeof d.seed !== 'number') return { status: 'damaged', reason: 'it is not a campaign save' };
  const v = d.version;
  const info = { version: v, savedAt: d.savedAt || 0, time: d.world.time || 0, part: d.world.part || 1, seed: d.seed, id: d.id || `seed${d.seed}`, ironman: !!d.world.options?.ironman, test: !!d.world.options?.test };
  if (v > VERSION) return { status: 'newer', ...info, reason: 'it was saved by a newer version of the game' };
  if (v < VERSION || !Number.isInteger(v)) return { status: 'old', ...info };
  return { status: 'ok', ...info };
}

const get = (s, k) => { try { return s.getItem(k); } catch { return null; } };
function put(s, k, v) {
  try { s.setItem(k, v); return true; } catch { return false; }
}

// Writes `raw` as the current save, first keeping what it replaces. { ok, reason }.
// `force`: keep what is there even when the new save is older than it (restoring, importing).
export function store(raw, { test = false, force = false, storage = lsOrNull() } = {}) {
  if (!storage) return { ok: false, reason: 'The browser would not store it' };
  if (test) return put(storage, TEST_KEY, raw) ? { ok: true } : { ok: false, reason: 'The browser would not store it' };
  const cur = get(storage, KEY);
  if (cur && cur !== raw) keepOld(storage, cur, raw, force);
  if (put(storage, KEY, raw)) return { ok: true };
  // Out of room: let go of the oldest copies first, never the current save.
  for (const k of [...SHELF.slice().reverse(), ...BACKUPS.slice().reverse()]) {
    try { storage.removeItem(k); } catch { /* nothing */ }
    if (put(storage, KEY, raw)) return { ok: true, trimmed: true };
  }
  return { ok: false, reason: 'The browser would not store it' };
}

function push(storage, keys, raw) {
  for (let i = keys.length - 1; i > 0; i--) { const v = get(storage, keys[i - 1]); if (v !== null) put(storage, keys[i], v); }
  put(storage, keys[0], raw);
}

function keepOld(storage, cur, next, force) {
  const c = inspect(cur), n = inspect(next);
  if (c.status === 'damaged') return push(storage, SHELF, cur);      // kept for rescue, never overwritten
  if (n.status === 'damaged') return;
  if (c.id !== n.id) return push(storage, SHELF, cur);               // a different campaign: shelved
  if (c.ironman || n.ironman) return;                                 // ironman keeps no copies
  const last = inspect(get(storage, BACKUPS[0]) || '');
  const gap = last.savedAt ? c.savedAt - last.savedAt : Infinity;   // (what is being kept is the older save: space those)
  if (force || gap >= BACKUP_EVERY || last.id !== c.id) push(storage, BACKUPS, cur);
}

// Every slot that holds something, newest campaign first: [{ key, label, info, raw }]
export function listSaves(storage = lsOrNull()) {
  if (!storage) return [];
  const out = [];
  const add = (key, label) => { const raw = get(storage, key); if (raw) out.push({ key, label, info: inspect(raw), raw }); };
  add(KEY, 'Current');
  BACKUPS.forEach((k, i) => add(k, `Backup ${i + 1}`));
  SHELF.forEach((k, i) => add(k, i ? 'An earlier campaign' : 'The campaign before'));
  return out;
}

// Makes the save in slot `key` the current one, keeping the one it replaces.
export function restore(key, storage = lsOrNull()) {
  const raw = storage && get(storage, key);
  if (!raw) return { ok: false, reason: 'That save is gone' };
  const i = inspect(raw);
  if (i.status === 'damaged' || i.status === 'newer') return { ok: false, reason: `It can't be used: ${i.reason}` };
  const r = store(raw, { force: true, storage });
  // A campaign brought back off the shelf is no longer on it (the one it replaced took its place there).
  if (r.ok && SHELF.includes(key)) { const k = SHELF.find(o => get(storage, o) === raw); if (k) { try { storage.removeItem(k); } catch { /* nothing */ } } }
  return r;
}

// A save from a file. Checks it first; the current save is kept like any other.
export function importText(text, storage = lsOrNull()) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT) return { ok: false, reason: 'That file is too big to be a save' };
  const i = inspect(text);
  if (i.status === 'damaged') return { ok: false, reason: `That file can't be used: ${i.reason}` };
  if (i.status === 'newer') return { ok: false, reason: 'That save is from a newer version of the game. Open the newer game to use it' };
  if (i.test) return { ok: false, reason: 'That is a test campaign, not a save' };
  const r = store(text, { force: true, storage });
  return r.ok ? { ok: true, info: i } : r;
}

export function fileName(info) {
  const when = info.savedAt ? new Date(info.savedAt).toISOString().slice(0, 16).replace(/[T:]/g, '-') : 'undated';
  return `rts-save-${when}-${Math.floor(info.time / 60)}min.json`;
}

// Ask the browser not to clear the saves when it is short of room or the site is left alone (once).
let asked = false;
export async function keepStorage() {
  if (asked) return null;
  asked = true;
  try { return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false; } catch { return null; }
}
export async function storageKept() { try { return !!(await navigator.storage?.persisted?.()); } catch { return null; } }

export const minutesIn = t => { const m = Math.floor(t / 60); return `${m >= 60 ? `${Math.floor(m / 60)}h ` : ''}${m % 60}m`; };
export function ago(at, now = Date.now()) {
  if (!at) return 'at an unknown time';
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return 'under a minute ago';
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}
