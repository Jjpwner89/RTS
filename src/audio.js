// Music and sound on WebAudio. Music crossfades by mood; effects are one-shots heard
// from the camera (quieter with distance, panned left and right); ambient beds loop
// under them. A cap on voices keeps a 2,000-man battle sane. Volumes and mute live in
// a sound panel in the top bar and are remembered. Nothing plays until the first click
// or key press, as browsers require.
//
// Other files call: audio.frame(camera, cam, ctx) once a frame, audio.play(name, pos,
// scope) for an event, audio.tick(name, pos, dt, rate, scope) for steady work sounds.
// `scope` is the Battle the sound belongs to, so villages nobody is watching stay quiet.

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
  clash:    { files: ['sfx/clash1', 'sfx/clash2', 'sfx/clash3', 'sfx/clash4', 'sfx/clash5', 'sfx/clash6'], vol: 0.4, gap: 0.06, cap: 6, pitch: 0.15 },
  bow:      { files: ['sfx/bow1', 'sfx/bow2'], vol: 0.35, gap: 0.15, cap: 4, pitch: 0.12 },
  arrowhit: { files: ['sfx/arrowhit1', 'sfx/arrowhit2', 'sfx/arrowhit3'], vol: 0.35, gap: 0.08, cap: 4, pitch: 0.15 },
  warcry:   { files: ['sfx/warcry1', 'sfx/warcry2', 'sfx/warcry3'], vol: 0.7, gap: 2.5, cap: 2, pitch: 0.06 },
  rout:     { files: ['sfx/rout'], vol: 0.7, gap: 3, cap: 1 },
  gate:     { files: ['sfx/gate'], vol: 0.9, gap: 1, cap: 1 },
  stone:    { files: ['sfx/stone1', 'sfx/stone2'], vol: 0.8, gap: 0.3, cap: 3, pitch: 0.08 },
  burn:     { files: ['sfx/burn'], vol: 0.7, gap: 1, cap: 2 },
};
// Gathering sounds by the resource worked, so economy.js can pass the node kind.
const ALIAS = { tree: 'chop', rock: 'pick', ore: 'pick' };
// Looping beds, mixed by what is on screen.
const BEDS = { village: 'amb/village', forest: 'amb/forest', wind: 'amb/wind', din: 'amb/din', march: 'amb/march', fire: 'amb/fire' };

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
let deck = null;                // the music playing: { el, gain, mood }
let mood = null, pending = null, trackTurn = {};
const ear = { x: 0, z: 0, dist: 100, rx: 1, rz: 0, scope: null, on: false };

// ---- start on the first gesture ----

function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
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
addEventListener('click', e => { if (e.target.closest?.('button')) play('click'); }, true);

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
    .catch(() => { buffers.set(path, null); return null; });
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
  el.play().catch(() => {});
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
  const S = SOUNDS[name];
  if (!S) return;
  if (scope && scope !== ear.scope) return;
  if (pos && !ear.on) return;
  const now = ctx.currentTime;
  if (now - (lastPlayed[name] ?? -9) < S.gap) return;
  const h = pos ? hear(pos) : { level: 1, pan: 0 };
  const level = h.level * S.vol;
  if (level < 0.015) return;
  const buf = ready(S.files[Math.floor(Math.random() * S.files.length)]);
  if (!buf) return;
  // Over the cap, a louder sound replaces the quietest; a quieter one is dropped.
  const same = voices.filter(v => v.name === name);
  if (same.length >= (S.cap || 4) && !steal(same, level)) return;
  if (voices.length >= MAX_VOICES && !steal(voices, level)) return;
  lastPlayed[name] = now;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (S.pitch) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * S.pitch;
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
const burnedAt = new WeakMap();    // building → when it was first seen burned
let calmFor = 0, fightMood = null, lastNow = 0, seenLog = new WeakMap();

// camera: the three.js camera; cam: the controls' { x, z, dist, yaw }. ctx: what is on
// screen: { map: true } for the world map, { battle, town } for a village, { battle,
// field: true, siege } for a field battle. paused quietens the fighting beds.
export function frame(camera, cam, scene = {}) {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (lastNow || now));
  lastNow = now;
  if (cam) Object.assign(ear, { x: cam.x, z: cam.z, dist: cam.dist, rx: Math.cos(cam.yaw || 0), rz: -Math.sin(cam.yaw || 0) });
  const { battle = null, town = null, map = false, paused = false, log = null } = scene;
  ear.scope = battle;
  ear.on = !map;
  if (log) chimeLog(log);
  if (!ctx) {
    mood = map ? 'map' : town ? 'build' : 'tense';
    return;
  }
  if (map) {
    setMood('map');
    for (const n in BEDS) setBed(n, n === 'wind' ? 0.25 : 0);
    return;
  }

  // How much fighting and marching the camera can hear.
  let din = 0, march = 0, fighting = false;
  for (const r of battle ? battle.regs : []) {
    if (r.gone) continue;
    const at = { x: r.cx, z: r.cz };
    if (r.engaged > 0) {
      fighting = true;
      din += Math.min(r.engaged, 60) * hear(at).level;
      if (!wasEngaged.get(r) && !r.T.range && !r.routing) play('warcry', at, battle);
    } else if (r.dest || r.routing) march += r.alive * hear(at).level;
    wasEngaged.set(r, r.engaged > 0);
  }
  const attackers = town?.attackers?.length > 0;
  const assault = scene.siege || town?.attackers?.some(g => g.mode === 'assault');
  calmFor = fighting ? 0 : calmFor + dt;

  if (battle && battle.winner !== null && !announced.has(battle) && (scene.field || town)) {
    announced.add(battle);
    setMood(battle.winner === 0 ? 'victory' : 'defeat');
  } else if (fighting) fightMood = assault ? 'siege' : 'battle';
  if (fighting || calmFor < 8) { if (fightMood) setMood(fightMood); }
  else { fightMood = null; setMood(town ? (attackers ? 'tense' : 'build') : 'tense'); }

  const q = paused ? 0 : 1;
  setBed('din', q * Math.min(0.9, din / 50));
  setBed('march', q * Math.min(0.6, march / 150));
  const near = Math.min(1, 140 / Math.max(60, ear.dist));
  setBed('village', town ? (attackers ? 0.15 : 0.4) * near : 0);
  setBed('forest', town ? 0.3 : 0.12);
  setBed('wind', town ? 0.08 + 0.15 * (1 - near) : 0.3);
  let fires = 0;
  for (const b of town?.buildings || []) {
    if (b.state !== 'ruined') continue;
    if (!burnedAt.has(b)) burnedAt.set(b, now);
    if (now - burnedAt.get(b) < 60) fires += hear(b).level;
  }
  setBed('fire', Math.min(0.6, fires * 0.5));
}

// A chime for new lines in the world log: good news or bad.
function chimeLog(log) {
  const seen = seenLog.get(log) ?? log.length;
  for (let i = seen; i < log.length; i++) play(log[i].side === 0 ? 'notify' : 'alert');
  seenLog.set(log, log.length);
}

// ---- the sound panel in the top bar ----

function panel() {
  const top = document.getElementById('top');
  if (!top || document.getElementById('sound')) return;
  const style = document.createElement('style');
  style.textContent = `
    #sound-panel { position: fixed; z-index: 60; width: 220px; padding: 10px 12px;
      background: rgba(26, 22, 18, 0.95); border: 1px solid rgba(224, 194, 122, 0.35); border-radius: 8px; color: #efe6d2; font-size: 13px; }
    #sound-panel[hidden] { display: none; }
    #sound-panel label { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 8px; margin: 4px 0; }
    #sound-panel input[type=range] { width: 100%; accent-color: #ffd970; }
    #sound-panel .row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
    #sound-panel a { color: #ffd970; }`;
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
  return { state: ctx?.state ?? 'waiting for a click', mood, track: deck?.el.src.split('/').pop(), voices: voices.map(v => v.name),
    beds: Object.fromEntries(Object.entries(beds).map(([n, b]) => [n, +b.gain.gain.value.toFixed(2)])) };
}

export const audio = { play, tick, setMood, frame, settings, status };
export default audio;
