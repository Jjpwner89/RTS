// What a wheel event means, so the game can be played on a trackpad (the first-session scout,
// 2026-11-28). A mouse wheel zooms, as it always has. A pinch arrives as a wheel with ctrlKey:
// it zooms. A two-finger swipe pans: sideways movement, or the small or fractional steps a
// trackpad sends. "Two-finger swipe: pans / zooms" in Controls is for whoever the guess gets
// wrong; it is kept with the other settings. Every camera asks here (controls.js,
// world/worldcontrols.js).
const KEY = 'rts.swipe';
export const swipeMode = () => { try { return localStorage.getItem(KEY) === 'zoom' ? 'zoom' : 'pan'; } catch { return 'pan'; } };
export const setSwipeMode = mode => { try { localStorage.setItem(KEY, mode === 'zoom' ? 'zoom' : 'pan'); } catch { /* private mode: not kept */ } };

// One notch of a mouse wheel on a Mac, in Chrome and Safari.
const MAC_NOTCH = 4.000244140625;

// Whether one event looks like a finger on a trackpad. (deltaMode is read first: Firefox then
// reports a mouse wheel in lines.)
export function looksLikeSwipe(e) {
  if (e.deltaMode) return false;                          // steps of lines or pages: a wheel
  if (e.deltaX) return true;                              // sideways
  const y = Math.abs(e.deltaY), w = Math.abs(e.wheelDeltaY || 0);
  if (w && w % 120 === 0) return false;                   // whole notches of a wheel
  if (y && Math.abs(y / MAC_NOTCH - Math.round(y / MAC_NOTCH)) < 1e-6) return false;
  if (w && e.wheelDeltaY === -3 * e.deltaY) return true;  // how Chrome and Safari report a trackpad
  return !Number.isInteger(e.deltaY) || y < 40;
}

// 'pinch', 'pan' or 'zoom'. A gesture keeps what it started as: a swipe that gathers speed sends
// steps as big as a wheel's. `state` is one pointer's memory (the checks use their own).
const own = { at: -1e9, swipe: false };
export function wheelMeaning(e, state = own, mode = swipeMode()) {
  if (e.ctrlKey) return 'pinch';
  const now = e.timeStamp ?? performance.now();
  const swipe = (state.swipe && !e.deltaMode && now >= state.at && now - state.at < 160) || looksLikeSwipe(e);
  state.at = now;
  state.swipe = swipe;
  return swipe && mode === 'pan' ? 'pan' : 'zoom';
}

// How much a zoom or a pinch multiplies the camera's distance. A pinch sends small steps, so each
// counts for more; Ctrl held over a mouse wheel is capped to about a notch and a half.
export const zoomStep = (e, kind) => kind === 'pinch'
  ? Math.pow(1.01, Math.max(-25, Math.min(25, e.deltaY)))
  : Math.pow(1.0015, e.deltaY);

// A swipe moves a camera rig {x, z, yaw} the way the page would scroll: fingers' sideways travel
// across the view, up and down toward and away from you. `k` is ground per pixel.
export function swipePan(c, e, k) {
  const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  c.x += (rx * e.deltaX - fx * e.deltaY) * k;
  c.z += (rz * e.deltaX - fz * e.deltaY) * k;
}
