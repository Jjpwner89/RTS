// Music and sound on WebAudio. Music crossfades by mood; effects are one-shots heard
// from the camera (quieter with distance, panned left and right); ambient beds loop
// under them. A cap on voices keeps a 2,000-man battle sane. Volumes and mute live in
// a sound panel in the top bar and are remembered. Nothing plays until the first click
// or key press, as browsers require.
//
// Other files call: audio.frame(camera, cam, ctx) once a frame, audio.play(name, pos,
// scope) for an event, audio.tick(name, pos, dt, rate, scope) for steady work sounds.
// `scope` is the Battle the sound belongs to, so villages nobody is watching stay quiet.

import { look, dayOf, PARTS, DAY } from './look.js';

const ROOT = new URL('../assets/audio/', import.meta.url).href;

// Tracks per mood. Several tracks take turns; one track loops; victory and defeat play once.
const MUSIC = {
  build: ['music/build1.mp3', 'music/build2.mp3', 'music/build3.mp3', 'music/build4.mp3'],
  tense: ['music/tense.mp3'],
  battle: ['music/battle1.mp3', 'music/battle2.mp3'],
  siege: ['music/siege1.mp3', 'music/siege2.mp3'],
  victory: ['music/victory.mp3'],
  defeat: ['music/defeat.mp3'],
  map: ['music/map1.mp3', 'music/map2.mp3'],
};
const ONCE = new Set(['victory', 'defeat']);
const MUSIC_VOL = { victory: 1, defeat: 1 };

// One-shots. files: variants picked at random. gap: least time between two plays of this
// name. cap: most at once of this name. pitch: random spread of playback rate.
const SOUNDS = {
  click:    { files: ['ui/click1', 'ui/click2'], vol: 0.35, gap: 0.05, cap: 2, pitch: 0.06 },
  notify:   { files: ['ui/notify'], vol: 0.45, gap: 1.2, cap: 1 },
  alert:    { files: ['ui/alert'], vol: 0.5, gap: 1.5, cap: 1 },
  chop:     { files: ['sfx/chop1', 'sfx/chop2', 'sfx/chop3', 'sfx/chop4'], vol: 0.55, gap: 0.12, cap: 4, pitch: 0.1 },
  pick:     { files: ['sfx/pick1', 'sfx/pick2'], vol: 0.45, gap: 0.15, cap: 3, pitch: 0.1 },
  hammer:   { files: ['sfx/hammer1', 'sfx/hammer2', 'sfx/hammer3', 'sfx/hammer4'], vol: 0.45, gap: 0.12, cap: 4, pitch: 0.1 },
  crate:    { files: ['sfx/crate1', 'sfx/crate2', 'sfx/crate3'], vol: 0.5, gap: 0.2, cap: 2, pitch: 0.1 },
  built:    { files: ['sfx/built'], vol: 0.7, gap: 0.5, cap: 2 },
  horn:     { files: ['sfx/horn'], vol: 0.8, gap: 4, cap: 1 },
  drums:    { files: ['sfx/drums'], vol: 0.7, gap: 4, cap: 1 },
  clash:    { files: ['sfx/clash1', 'sfx/clash2', 'sfx/clash3', 'sfx/clash4', 'sfx/clash5', 'sfx/clash6', 'sfx/hit1', 'sfx/hit2', 'sfx/hit3', 'sfx/clash7', 'sfx/clash8', 'sfx/clash9'], vol: 0.4, gap: 0.06, cap: 6, pitch: 0.15 },
  bow:      { files: ['sfx/bow1', 'sfx/bow2'], vol: 0.35, gap: 0.15, cap: 4, pitch: 0.12 },
  arrowhit: { files: ['sfx/arrowhit1', 'sfx/arrowhit2', 'sfx/arrowhit3'], vol: 0.35, gap: 0.08, cap: 4, pitch: 0.15 },
  warcry:   { files: ['sfx/warcry1', 'sfx/warcry2', 'sfx/warcry3'], vol: 0.7, gap: 2.5, cap: 2, pitch: 0.06 },
  rout:     { files: ['sfx/rout'], vol: 0.7, gap: 3, cap: 1 },
  gate:     { files: ['sfx/gate'], vol: 0.9, gap: 1, cap: 1 },
  stone:    { files: ['sfx/stone1', 'sfx/stone2'], vol: 0.8, gap: 0.3, cap: 3, pitch: 0.08 },
  burn:     { files: ['sfx/burn'], vol: 0.7, gap: 1, cap: 2 },
  // Sieges and the newer battle: oil, mines, bridges, duels, lords, terms, dogs, axes, javelins.
  oil:      { files: ['sfx/oil'], vol: 0.8, gap: 0.8, cap: 2 },
  dig:      { files: ['sfx/dig1', 'sfx/dig2'], vol: 0.5, gap: 0.5, cap: 2, pitch: 0.1 },
  collapse: { files: ['sfx/collapse'], vol: 1, gap: 2, cap: 1 },
  bridgefall: { files: ['sfx/bridgefall'], vol: 0.9, gap: 2, cap: 1 },
  dog:      { files: ['sfx/dog1', 'sfx/dog2', 'sfx/dog3'], vol: 0.55, gap: 0.35, cap: 3, pitch: 0.08 },
  javelin:  { files: ['sfx/javelin1', 'sfx/javelin2'], vol: 0.45, gap: 0.15, cap: 3, pitch: 0.1 },
  axeshield: { files: ['sfx/axeshield1', 'sfx/axeshield2'], vol: 0.5, gap: 0.08, cap: 4, pitch: 0.12 },
  neigh:    { files: ['sfx/neigh1', 'sfx/neigh2', 'sfx/neigh3', 'sfx/snort1', 'sfx/snort2'], vol: 0.6, gap: 3, cap: 1, pitch: 0.05 },
  cheer:    { files: ['sfx/cheer1', 'sfx/cheer2'], vol: 0.8, gap: 3, cap: 1 },
  gasp:     { files: ['sfx/gasp'], vol: 0.7, gap: 3, cap: 1 },
  parley:   { files: ['sfx/parley'], vol: 0.8, gap: 4, cap: 1 },
  fanfare:  { files: ['sfx/fanfare'], vol: 0.7, gap: 4, cap: 1 },
  // The realm: news, money, writs and crowds.
  coins:    { files: ['ui/coins1', 'ui/coins2'], vol: 0.55, gap: 0.4, cap: 1, pitch: 0.05 },
  scroll:   { files: ['ui/scroll1', 'ui/scroll2'], vol: 0.6, gap: 0.6, cap: 1 },
  seal:     { files: ['ui/seal'], vol: 0.7, gap: 0.6, cap: 1 },
  quill:    { files: ['ui/quill'], vol: 0.6, gap: 1, cap: 1 },
  bells:    { files: ['sfx/bells'], vol: 0.7, gap: 6, cap: 1 },
  feast:    { files: ['sfx/feast'], vol: 0.6, gap: 6, cap: 1 },
  mob:      { files: ['sfx/mob1', 'sfx/mob2'], vol: 0.7, gap: 4, cap: 1 },
  boom:     { files: ['sfx/boom'], vol: 0.85, gap: 3, cap: 1 },
  cart:     { files: ['sfx/cart'], vol: 0.5, gap: 4, cap: 1 },
  // Game feel (fx.js): an order heard, a charge, a building site passing a third of its work.
  order:    { files: ['sfx/order1', 'sfx/order2', 'sfx/order3', 'sfx/order4'], vol: 0.45, gap: 0.4, cap: 1, pitch: 0.05 },
  charge:   { files: ['sfx/charge', 'sfx/charge2'], vol: 0.7, gap: 2, cap: 1 },
  stage:    { files: ['sfx/stage'], vol: 0.55, gap: 0.5, cap: 2, pitch: 0.08 },
  // The interface: a page turning, panels opening, a new thing unlocked, a greyed button.
  tab:      { files: ['ui/tab'], vol: 0.35, gap: 0.08, cap: 1, pitch: 0.06 },
  open:     { files: ['ui/open'], vol: 0.4, gap: 0.2, cap: 1 },
  close:    { files: ['ui/close'], vol: 0.4, gap: 0.2, cap: 1 },
  unlock:   { files: ['ui/unlock'], vol: 0.5, gap: 1, cap: 1 },
  deny:     { files: ['ui/deny'], vol: 0.35, gap: 0.3, cap: 1, pitch: 0.05 },
  // The climb: ranks, titles, petitions, outlaws, fallen seats, the crown.
  rankup:   { files: ['sfx/fanfare'], vol: 0.75, gap: 6, cap: 1, then: [['horn', 0.35]] },
  title:    { files: ['sfx/fanfare'], vol: 0.6, gap: 3, cap: 1, rate: 0.92 },
  petition: { files: ['ui/petition'], vol: 0.6, gap: 1, cap: 1 },
  outlaws:  { files: ['sfx/horn'], vol: 0.55, gap: 8, cap: 1, rate: 0.7 },
  seatfalls: { files: ['sfx/seatfalls'], vol: 0.8, gap: 4, cap: 1 },
  siegeends: { files: ['sfx/parley'], vol: 0.7, gap: 4, cap: 1, then: [['cheer', 1.2]] },
  crown:    { files: ['sfx/crown'], vol: 0.9, gap: 10, cap: 1, then: [['bells', 4]] },
  // The militia turning out of the village.
  muster:   { files: ['sfx/muster'], vol: 0.7, gap: 8, cap: 1, then: [['musterfolk', 0.5]] },
  musterfolk: { files: ['sfx/musterfolk'], vol: 0.55, gap: 8, cap: 1 },
  // Engines, rams and the fallen.
  catapult: { files: ['sfx/catapult1', 'sfx/catapult2', 'sfx/catapult3'], vol: 0.8, gap: 0.4, cap: 2, pitch: 0.05 },
  ramwood:  { files: ['sfx/ramwood1', 'sfx/ramwood2', 'sfx/ramwood3', 'sfx/ramwood4'], vol: 0.6, gap: 0.5, cap: 2, pitch: 0.06 },
  death:    { files: ['sfx/death1', 'sfx/death2', 'sfx/death3', 'sfx/death4'], vol: 0.3, gap: 0.15, cap: 3, pitch: 0.1 },
  // A village going about its day: crafts, animals, the chapel bell, thunder in the rain.
  saw:      { files: ['sfx/saw'], vol: 0.4, gap: 2.5, cap: 1, pitch: 0.05 },
  smith:    { files: ['sfx/smith1', 'sfx/smith2', 'sfx/smith3', 'sfx/smith4'], vol: 0.5, gap: 0.3, cap: 2, pitch: 0.08 },
  farm:     { files: ['sfx/sheep', 'sfx/hen', 'sfx/cow', 'sfx/goat', 'sfx/pig'], vol: 0.45, gap: 4, cap: 2, pitch: 0.1 },
  rooster:  { files: ['sfx/rooster'], vol: 0.4, gap: 30, cap: 1, pitch: 0.04 },
  chapel:   { files: ['sfx/muster'], vol: 0.4, gap: 40, cap: 1 },
  owl:      { files: ['sfx/owl'], vol: 0.3, gap: 20, cap: 1, pitch: 0.04 },
  children: { files: ['sfx/children'], vol: 0.35, gap: 30, cap: 1 },
  thunder:  { files: ['sfx/thunder', 'sfx/thunder2'], vol: 0.6, gap: 20, cap: 1, pitch: 0.05 },
};
// The same blow sounds different from a dog or a Norrhold axe, and a javelin is no arrow.
const VARIANT = { clash: { wardog: 'dog', axeman: 'axeshield' }, bow: { javelin: 'javelin' } };
// Gathering sounds by the resource worked, so economy.js can pass the node kind.
const ALIAS = { tree: 'chop', rock: 'pick', ore: 'pick' };
// Looping beds, mixed by what is on screen.
const BEDS = { battlefield: 'amb/battlefield', market: 'amb/market', snow: 'amb/snow', mill: 'amb/mill', mapair: 'amb/mapair', run: 'amb/run', swim: 'amb/swim', birds: 'amb/birds', village: 'amb/village', forest: 'amb/forest', wind: 'amb/wind', din: 'amb/din', march: 'amb/march', fire: 'amb/fire',
  gallop: 'amb/gallop', mail: 'amb/mail', wade: 'amb/wade', rain: 'amb/rain', fog: 'amb/fog', night: 'amb/night', blizzard: 'amb/blizzard' };
// How much a regiment's armour clinks on the march.
const CLINK = { none: 0, leather: 0.2, mail: 0.7, plate: 1 };
const RUN_PACE = 2.6;             // m/s: men on foot faster than this are running (a charge, a rout, a Run order)
const paceMemo = new WeakMap();

const UI = new Set(['click', 'notify', 'alert', 'tab', 'deny', 'open', 'close', 'unlock']);
const MAX_VOICES = 24;
const FADE = 2.5;               // seconds of music crossfade
const KEY = 'rts.audio';

const settings = { master: 0.8, music: 0.55, sfx: 0.8, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} };

let ctx = null, master, musicBus, sfxBus;
const buffers = new Map();      // path → AudioBuffer, or a Promise while loading
const voices = [];              // { src, gain, name, level }
const beds = {};                // name → { gain, started }
const lastPlayed = {};
const warned = new Set();         // sound names asked for that don't exist, warned once each
const dropped = {};               // plays skipped by the caps or before a file had loaded, by name (status())
let deck = null;                // the music playing: { el, gain, mood }
let mood = null, pending = null, trackTurn = {};
const ear = { x: 0, z: 0, dist: 100, rx: 1, rz: 0, scope: null, on: false };

// ---- start on the first gesture ----

function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { console.warn('[audio] this browser has no Web Audio: the game is silent'); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); return; }
  ctx = new AC();
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(ctx.destination);
  applyVolumes();
  for (const S of Object.values(SOUNDS)) for (const f of S.files) load(f);
  if (mood) { const m = mood; mood = null; setMood(m); }
}
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);
// Every button in the HUD clicks.
// Tabs, panels, greyed buttons and new unlocks have their own sounds (ui/sounds.js).
addEventListener('click', e => { if (e.target.closest?.('button:not([data-tab], #realm nav button, .close-t, #realm .close, :disabled)')) play('click'); }, true);

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
  musicBus.gain.setTargetAtTime(settings.music, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
}

function load(path) {
  if (buffers.has(path)) return buffers.get(path);
  const p = fetch(`${ROOT}${path}.mp3`)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then(b => ctx.decodeAudioData(b))
    .then(buf => { buffers.set(path, buf); return buf; })
    .catch(e => { console.warn(`[audio] couldn't load ${ROOT}${path}.mp3: ${e}`); buffers.set(path, null); return null; });
  buffers.set(path, p);
  return p;
}
const ready = path => { const b = buffers.get(path); return b instanceof AudioBuffer ? b : null; };

// ---- music ----

// Crossfade to the mood's music. Victory and defeat finish before anything else starts.
export function setMood(m) {
  if (!MUSIC[m]) return;
  if (!ctx) { mood = m; return; }
  if (deck && ONCE.has(deck.mood) && !deck.done && !ONCE.has(m)) { pending = m; return; }
  if (m === mood && deck && !deck.done) return;
  mood = m;
  pending = null;
  startTrack(m);
}

function startTrack(m) {
  const list = MUSIC[m];
  const i = (trackTurn[m] = ((trackTurn[m] ?? Math.floor(Math.random() * list.length)) + 1) % list.length);
  const el = new Audio(`${ROOT}${list[i]}`);
  el.loop = list.length === 1 && !ONCE.has(m);
  el.crossOrigin = 'anonymous';
  const gain = ctx.createGain();
  gain.gain.value = 0;
  ctx.createMediaElementSource(el).connect(gain);
  gain.connect(musicBus);
  const d = { el, gain, mood: m, done: false };
  el.addEventListener('ended', () => {
    d.done = true;
    if (deck !== d) return;
    if (pending) { const p = pending; pending = null; mood = p; startTrack(p); }
    else if (!ONCE.has(m)) startTrack(m);       // the next track of the same mood
  });
  el.addEventListener('error', () => console.warn(`[audio] couldn't play music ${el.src}: ${el.error?.message || el.error?.code}`));
  el.play().catch(e => { if (e.name !== 'AbortError') console.warn(`[audio] music ${el.src} didn't start: ${e.message}`); });
  const t = ctx.currentTime;
  gain.gain.setTargetAtTime(MUSIC_VOL[m] ?? 0.8, t, FADE / 3);
  if (deck) {
    const old = deck;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setTargetAtTime(0, t, FADE / 3);
    setTimeout(() => { old.el.pause(); old.gain.disconnect(); }, FADE * 2000);
  }
  deck = d;
}

// ---- effects ----

// How loud a sound at pos is from the camera, and where it sits left to right.
function hear(pos) {
  const dx = pos.x - ear.x, dz = pos.z - ear.z;
  const eff = Math.hypot(dx, dz, ear.dist * 0.8);
  return { level: Math.min(1, (60 / Math.max(60, eff)) ** 1.2), pan: Math.max(-1, Math.min(1, (dx * ear.rx + dz * ear.rz) / (eff + 1))) * 0.8 };
}

// Play a named one-shot. pos {x, z} places it in the scene; leave it out for the HUD.
export function play(name, pos = null, scope = null) {
  if (!ctx || settings.muted) return;
  name = ALIAS[name] || name;
  name = VARIANT[name]?.[pos?.reg?.T?.key] || name;
  const S = SOUNDS[name];
  if (!S) { if (!warned.has(name)) { warned.add(name); console.warn(`[audio] no sound called '${name}' in audio.js`); } return; }
  if (scope && scope !== ear.scope) return;
  if (pos && !Number.isFinite(pos.x)) pos = null;
  if (pos && !ear.on) return;
  const now = ctx.currentTime;
  if (now - (lastPlayed[name] ?? -1e9) < S.gap) return;
  const h = pos ? hear(pos) : { level: 1, pan: 0 };
  const level = h.level * S.vol;
  if (level < 0.015) return;
  const buf = ready(S.files[Math.floor(Math.random() * S.files.length)]);
  if (!buf) { dropped[name] = (dropped[name] || 0) + 1; return; }   // still loading, or failed (warned in load)
  // Over the cap, a louder sound replaces the quietest; a quieter one is dropped.
  const same = voices.filter(v => v.name === name);
  if ((same.length >= (S.cap || 4) && !steal(same, level)) || (voices.length >= MAX_VOICES && !steal(voices, level))) {
    dropped[name] = (dropped[name] || 0) + 1;   // a busy mix: shown by audio.status()
    return;
  }
  lastPlayed[name] = now;
  if (!pos && !UI.has(name)) lastNews = now;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (S.rate || 1) * (1 + (Math.random() * 2 - 1) * (S.pitch || 0));
  const gain = ctx.createGain();
  gain.gain.value = level;
  let out = gain;
  if (h.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = h.pan; gain.connect(p); out = p; }
  out.connect(sfxBus);
  src.connect(gain);
  const v = { src, gain, name, level };
  voices.push(v);
  src.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); gain.disconnect(); };
  src.start();
  // A layered moment: more sounds follow this one (the crown's bells after its fanfare).
  for (const [next, after] of S.then || []) setTimeout(() => play(next, pos, scope), after * 1000);
}

function steal(list, level) {
  let q = null;
  for (const v of list) if (!q || v.level < q.level) q = v;
  if (!q || q.level >= level) return false;
  q.level = -1;
  q.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  try { q.src.stop(ctx.currentTime + 0.08); } catch {}
  voices.splice(voices.indexOf(q), 1);
  return true;
}

// A steady sound at a rate per second, for work that goes on (chopping, hammering).
export function tick(name, pos, dt, rate, scope) {
  if (ctx && Math.random() < rate * dt) play(name, pos, scope);
}

// ---- the hour ----

// The campaign's day (look.js dayOf: 0 midnight, 0.5 noon) as sound: dark is 1 at night and fades
// through dusk and dawn (look.js PARTS); dawn peaks as the birds start up. With no
// campaign clock (the test pages) it is always noon.
function hour() {
  const t = look.clock?.();
  if (t == null) return { dark: 0, dawn: 0, day: 0 };
  const d = dayOf(t), ramp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const dark = d < 0.5 ? 1 - ramp(...PARTS.dawn, d) : ramp(...PARTS.dusk, d);
  const dawn = Math.sin(Math.PI * ramp(PARTS.dawn[0], PARTS.dawn[0] + 30 / DAY, d)) ** 2 * (d < 0.5 ? 1 : 0);
  return { dark, dawn, d, day: Math.floor(t / DAY + 0.375) };
}

// ---- ambient beds ----

function setBed(name, level) {
  if (!ctx) return;
  let b = beds[name];
  if (!b) {
    if (level <= 0.001) return;
    b = beds[name] = { gain: ctx.createGain(), started: false };
    b.gain.gain.value = 0;
    b.gain.connect(sfxBus);
  }
  if (!b.started) {
    const buf = ready(BEDS[name]);
    if (!buf) { load(BEDS[name]); return; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(b.gain);
    src.start(0, Math.random() * buf.duration);
    b.started = true;
  }
  b.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
}

// ---- once a frame ----

const announced = new WeakSet();     // battles whose victory or defeat has been played
const wasEngaged = new WeakMap();
let calmFor = 0, fightMood = null, lastNow = 0, seenLog = new WeakMap(), lastNews = -9;

// camera: the three.js camera; cam: the controls' { x, z, dist, yaw }. ctx: what is on
// screen: { map: true } for the world map, { battle, town } for a village, { battle,
// field: true, siege } for a field battle. paused quietens the fighting beds.
export function frame(camera, cam, scene = {}) {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (lastNow || now));
  lastNow = now;
  if (cam) Object.assign(ear, { x: cam.x, z: cam.z, dist: cam.dist, rx: Math.cos(cam.yaw || 0), rz: -Math.sin(cam.yaw || 0) });
  const { battle = null, town = null, map = false, paused = false, log = null, world = null } = scene;
  ear.scope = battle;
  ear.on = !map;
  if (log) chimeLog(log);
  if (!ctx) {
    mood = map ? 'map' : town ? 'build' : 'tense';
    if (battle) battleNews(battle, dt);   // keep track, so the click that starts sound can still sound the horn
    return;
  }
  const winter = !!world?.winter;
  if (map) {
    setMood('map');
    // Open country: a soft breeze with birds, or the winter wind; smoke over a place at war is heard as a low din.
    const { dark } = hour();
    for (const n in BEDS) setBed(n, n === 'wind' ? (winter ? 0.1 : 0.2) : n === 'mapair' ? (winter ? 0.1 : 0.4 * (1 - 0.5 * dark)) : n === 'night' ? (winter ? 0.05 : 0.2) * dark : n === 'blizzard' ? (winter ? 0.3 : 0) : n === 'din' ? Math.min(0.25, warSmoke(scene.fx) * 0.12) : 0);
    return;
  }
  if (battle) battleNews(battle, dt);

  // How much fighting and marching the camera can hear.
  let din = 0, march = 0, run = 0, gallop = 0, mail = 0, wade = 0, swim = 0, fighting = false;
  for (const r of battle ? battle.regs : []) {
    if (r.gone) continue;
    const at = { x: r.cx, z: r.cz }, heard = hear(at).level;
    // Ground speed from the centre's last move, in game time: running men sound like it.
    const last = paceMemo.get(r), gt = battle.time;
    if (!last || gt - last.t > 0.25) {
      if (last && gt > last.t) r._audioPace = Math.hypot(r.cx - last.x, r.cz - last.z) / (gt - last.t);
      paceMemo.set(r, { x: r.cx, z: r.cz, t: gt });
    }
    if (r.engaged > 0) {
      fighting = true;
      din += Math.min(r.engaged, 60) * heard;
      if (!wasEngaged.get(r) && !r.T.range && !r.routing && r.T.key !== 'wardog') play('warcry', at, battle);
    } else if (r.dest || r.routing) {
      const n = r.alive * heard, deep = battle.waterAt?.(r.cx, r.cz) || 0;
      if (r.T.mounted) gallop += n; else if ((r._audioPace || 0) > RUN_PACE || r.routing) run += n; else march += n;
      mail += n * (CLINK[r.armour || r.T.armour] || 0);
      if (r.swim && deep > 1) swim += n; else if (deep > 0) wade += n;
    }
    if (r.T.key === 'wardog' && (r.dest || r.engaged > 0)) tick('dog', at, dt, 1.5, battle);
    wasEngaged.set(r, r.engaged > 0);
  }
  const attackers = town?.attackers?.length > 0;
  const assault = scene.siege || town?.attackers?.some(g => g.mode === 'assault' || g.mode === 'siege');
  // Arrows in the air and stones landing count as fighting for the music, if not the din.
  const active = fighting || battle?.arrows?.length > 0 || !!battle?.impacts?.some(i => battle.time - i.time < 10);
  calmFor = active ? 0 : calmFor + dt;

  if (battle && battle.winner !== null && !announced.has(battle) && (scene.field || town)) {
    announced.add(battle);
    setMood(battle.winner === 0 ? 'victory' : 'defeat');
  } else if (active) fightMood = assault ? 'siege' : 'battle';
  if (fightMood && (active || calmFor < 8)) setMood(fightMood);    // the fight music lingers a little
  else { fightMood = null; setMood(town ? (attackers ? 'tense' : 'build') : 'tense'); }

  const q = paused ? 0 : 1;
  setBed('din', q * Math.min(0.9, din / 50));
  setBed('march', q * Math.min(0.6, march / 150));
  setBed('snow', winter ? q * Math.min(0.4, (march + run) / 150) : 0);
  setBed('battlefield', q * Math.min(0.3, Math.max(0, din - 30) / 250));
  setBed('gallop', q * Math.min(0.7, gallop / 60));
  setBed('mail', q * Math.min(0.5, mail / 120));
  setBed('run', q * Math.min(0.55, run / 100));
  setBed('wade', q * Math.min(0.7, wade / 60));
  setBed('swim', q * Math.min(0.6, swim / 50));
  // Weather and the hour: rain, fog and night hush the birds; winter brings its wind.
  const sky = battle?.weather || 'clear', near = Math.min(1, 140 / Math.max(60, ear.dist));
  const hush = sky === 'clear' ? 1 : 0.35;
  setBed('rain', sky === 'rain' ? 0.5 : 0);
  setBed('fog', sky === 'fog' ? 0.35 : 0);
  const hr = hour();
  setBed('night', Math.max(sky === 'night' ? 0.45 : 0, (winter ? 0.08 : 0.28) * hr.dark));
  setBed('blizzard', winter ? (town ? 0.15 : 0.3) : 0);
  // Day birds over a village in the warm seasons, hushed by weather, war and winter.
  setBed('birds', town && !winter && sky === 'clear' && !attackers ? 0.3 * near * (1 - hr.dark) * (1 + 0.6 * hr.dawn) : 0);
  setBed('village', town ? (attackers ? 0.15 : 0.4) * near * (sky === 'night' ? 0.3 : 1 - 0.55 * hr.dark) : 0);
  setBed('forest', (town ? 0.3 : 0.12) * hush * (winter ? 0.3 : 1));
  setBed('wind', (town ? 0.08 + 0.15 * (1 - near) : 0.3) * (winter ? 0.5 : 1));
  let fires = 0;
  // fx.js lists what burns in a village: a hurt building by its damage, a fresh ruin fading (level 1 to 0).
  for (const f of scene.fx?.fires || []) fires += hear(f).level * f.level;
  for (const b of battle?.river?.bridges || []) if (b.burning > 0) fires += hear(b).level;
  setBed('fire', Math.min(0.6, fires * 0.5));
  village(town, sky, winter, !!attackers, dt, battle, hr);
}

// The village's own small sounds: a mill's wheel, animals about the farms, the chapel bell
// by day, thunder when it rains. Each is placed at the building it comes from.
let farmT = 8, bellT = 25, thunderT = 20, kidsT = 30, owlT = 15, crowedDay = -1;
function village(town, sky, winter, attackers, dt, battle, hr) {
  const sites = kind => (town?.buildings || []).filter(b => b.kind === kind && b.state === 'active');
  let mill = 0;
  for (const b of sites('mill')) if (b.workers?.length) mill = Math.max(mill, hear(b).level);
  setBed('mill', attackers ? 0 : Math.min(0.35, mill * 0.5 * (1 - 0.5 * hr.dark)));
  let market = 0;
  for (const b of sites('market')) market = Math.max(market, hear(b).level);
  setBed('market', attackers || winter && hr.dark > 0 ? 0 : Math.min(0.25, market * 0.4) * (1 - hr.dark) ** 2);
  if (sky === 'rain' && (town || battle)) { thunderT -= dt; if (thunderT < 0) { thunderT = 25 + Math.random() * 45; play('thunder'); } }
  if (!town || attackers) return;
  const day = (sky === 'clear' || sky === 'rain') && hr.dark < 0.5;
  farmT -= dt; bellT -= dt; kidsT -= dt; owlT -= dt;
  const spot = () => { const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 40; return { x: ear.x + Math.cos(a) * r, z: ear.z + Math.sin(a) * r }; };
  // Dawn: one rooster as the light comes; night: an owl now and then, out in the dark.
  if (hr.dawn > 0.2 && crowedDay !== hr.day && !winter) { crowedDay = hr.day; const farms = sites('farm'); play('rooster', farms.length ? farms[Math.floor(Math.random() * farms.length)] : spot(), battle); }
  if (owlT < 0) { owlT = 25 + Math.random() * 30; if (hr.dark > 0.7 && !winter) play('owl', spot(), battle); }
  if (kidsT < 0) { kidsT = 35 + Math.random() * 40; const homes = sites('house'); if (day && homes.length) play('children', homes[Math.floor(Math.random() * homes.length)], battle); }
  if (farmT < 0) {
    farmT = 9 + Math.random() * 16;
    const farms = sites('farm');
    if (farms.length && day && !winter && sky === 'clear') play(Math.random() < 0.15 ? 'rooster' : 'farm', farms[Math.floor(Math.random() * farms.length)], battle);
  }
  if (bellT < 0) {
    bellT = 70 + Math.random() * 50;
    const chapels = [...sites('monastery'), ...sites('cathedral')];
    if (chapels.length && day) play('chapel', chapels[Math.floor(Math.random() * chapels.length)], battle);
  }
}

// Places at war that the map camera can hear: each smoking place (fx.warSmoke) adds a little
// distant din, more the nearer it is to where the camera looks.
function warSmoke(fx) {
  let n = 0;
  for (const p of fx?.warSmoke || []) n += hear(p).level;
  return n;
}

// What changed in a battle since the last frame, heard from its state: oil poured, mines
// dug, fired or broken into, a challenge, a duel and its end, a lord riding in or falling,
// a garrison asking terms, the deployment ending, a bridge burned down.
const news = new WeakMap();
function battleNews(b, dt) {
  let M = news.get(b);
  if (!M) news.set(b, M = { pour: b.time, mines: new Map(), lords: [null, null], fallen: [false, false],
    offer: b.duelOffer, duel: b.duel, terms: b.terms, deploying: !!b.deploying, bridges: new Set() });
  for (const p of b.pours || []) if (p.time > M.pour) { M.pour = p.time; play('oil', p, b); }
  for (const m of b.mines || []) {
    const was = M.mines.get(m) ?? { progress: m.progress, end: m.done || m.lost };
    if (!was.end && m.progress > was.progress) play('dig', m, b);
    if (!was.end && (m.done || m.lost)) { was.end = true; play('collapse', m.done ? m.piece : { x: m.ix, z: m.iz }, b); }
    was.progress = m.progress;
    M.mines.set(m, was);
  }
  if (b.duelOffer && b.duelOffer !== M.offer) play('parley', null, b);
  M.offer = b.duelOffer;
  if (b.duel && b.duel !== M.duel) { M.duel = b.duel; M.duelOver = false; play('gasp', b.duel, b); }
  if (b.duel?.over && !M.duelOver) { M.duelOver = true; play('cheer', b.duel, b); }
  for (const side of [0, 1]) {
    const L = b.lords?.[side];
    if (L && L !== M.lords[side]) { play('fanfare', L.soldier, b); play('neigh', L.soldier, b); }
    if (L?.died && !M.fallen[side]) play('gasp', L.soldier, b);
    M.lords[side] = L;
    M.fallen[side] = !!L?.died;
  }
  if (b.terms && b.terms !== M.terms) play('parley', null, b);
  M.terms = b.terms;
  if (M.deploying && !b.deploying) { play('horn', null, b); play('drums', null, b); }
  M.deploying = !!b.deploying;
  for (const br of b.river?.bridges || []) if (br.state === 'burnt' && !M.bridges.has(br)) { M.bridges.add(br); play('bridgefall', br, b); }
}

// A chime for new lines in the world log: good news or bad. News that just made its own
// sound (coins, bells, a war drum) needs no chime as well.
function chimeLog(log) {
  const seen = seenLog.get(log) ?? log.length;
  const quiet = ctx && ctx.currentTime - lastNews < 0.5;
  for (let i = seen; i < log.length; i++) if (!quiet) play(log[i].side === 0 ? 'notify' : 'alert');
  seenLog.set(log, log.length);
}

// ---- the sound panel in the top bar ----

function panel() {
  const top = document.getElementById('top');
  if (!top || document.getElementById('sound')) return;
  const style = document.createElement('style');
  style.textContent = `
    #sound-panel { position: fixed; z-index: 60; width: 220px; padding: 10px 12px;
      background: var(--panel); border: 1px solid var(--edge); border-radius: 8px; color: var(--ink); font-size: 13px; }
    #sound-panel[hidden] { display: none; }
    #sound-panel label { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 8px; margin: 4px 0; }
    #sound-panel input[type=range] { width: 100%; accent-color: var(--gold); }
    #sound-panel .row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
    #sound-panel a { color: var(--gold); }`;
  document.head.append(style);
  const wrap = document.createElement('span');
  wrap.id = 'sound';
  wrap.innerHTML = `<button id="sound-toggle" title="Sound" aria-label="Sound"></button>
    <div id="sound-panel" hidden>
      <label>Master <input type="range" min="0" max="1" step="0.05" data-k="master"></label>
      <label>Music <input type="range" min="0" max="1" step="0.05" data-k="music"></label>
      <label>Effects <input type="range" min="0" max="1" step="0.05" data-k="sfx"></label>
      <div class="row"><button id="sound-mute"></button><a href="credits.html" target="_blank">Credits</a></div>
    </div>`;
  const help = document.getElementById('help-toggle');
  if (help) top.insertBefore(wrap, help); else top.append(wrap);
  const pan = wrap.querySelector('#sound-panel'), toggle = wrap.querySelector('#sound-toggle'), mute = wrap.querySelector('#sound-mute');
  // The panel lives in the body: the top bar clips and transforms what hangs out of it.
  document.body.append(pan);
  const show = () => {
    toggle.textContent = settings.muted ? '🔇' : '🔊';
    mute.textContent = settings.muted ? 'Unmute' : 'Mute';
  };
  for (const input of pan.querySelectorAll('input')) {
    input.value = settings[input.dataset.k];
    input.oninput = () => { settings[input.dataset.k] = +input.value; save(); applyVolumes(); };
  }
  // Keys typed over the panel stay out of the game's camera and hotkeys.
  pan.addEventListener('keydown', e => e.stopPropagation());
  toggle.onclick = () => {
    const r = toggle.getBoundingClientRect();
    pan.style.top = `${r.bottom + 6}px`;
    pan.style.left = `${Math.max(8, Math.min(innerWidth - 252, r.right - 244))}px`;
    pan.hidden = !pan.hidden;
  };
  mute.onclick = () => { settings.muted = !settings.muted; save(); applyVolumes(); show(); };
  addEventListener('pointerdown', e => { if (!wrap.contains(e.target) && !pan.contains(e.target)) pan.hidden = true; });
  show();
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', panel); else panel();

// For checking from the console: what is playing now.
export function status() {
  return { state: ctx?.state ?? 'waiting for a click', mood, track: deck?.el.src.split('/').pop(), voices: voices.map(v => v.name), dropped: { ...dropped },
    beds: Object.fromEntries(Object.entries(beds).map(([n, b]) => [n, +b.gain.gain.value.toFixed(2)])) };
}

export const audio = { play, tick, setMood, frame, settings, status };
export default audio;
