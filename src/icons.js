// Icons from game-icons.net (CC BY 3.0, by Lorc, Delapouite, Faithtoken and Willdabeast),
// one silhouette per file in assets/icons. In the page they are CSS masks, so each takes
// the colour of its text; on the map they are drawn into a canvas.
//
// Every icon is fetched once as the page opens and kept in memory. Left to the stylesheet, a
// file was asked for the first time it was drawn, and one that failed then (the server away
// for a moment) stayed blank until a reload (creator, 2026-11-23: goods icons that come and go).

// Full addresses, since a url() in a CSS variable resolves against the stylesheet.
const DIR = new URL('../assets/icons/', import.meta.url).href;

// Every file in assets/icons. Add a new icon here too (checks() says so if you forget).
export const ICONS = (
  'armour-leather armour-mail armour-none armour-plate armour armourer arrows bakery barracks battle bolts bows ' +
  'bowyer bread camp caravan carpenter castle cathedral chronicle crate crossbows crown farm feathers flag flax ' +
  'flaxfield flour food ford gold hall hides horses house hunter invader iron keep lances leather mail map market ' +
  'mill mine monastery no-shield ore pass people pick planks quarry raid retreat ropemaker shields siege siegeworks ' +
  'smelter spears stable stone storehouse string stump swords tanner village wall warcamp warning watchtower ' +
  'weaponsmith well wood woodcutter'
).split(' ');

// One icon's file as a data address, asked for again until it comes. A file that is not there
// at all is said once and given up on.
export async function fetchIcon(name, { get = url => fetch(url), wait = 500, most = 10000 } = {}) {
  for (let tries = 0; ; tries++, wait = Math.min(wait * 2, most)) {
    try {
      const r = await get(`${DIR}${name}.svg`);
      if (r.status === 404) { console.warn(`icon '${name}': there is no such file in assets/icons`); return null; }
      if (!r.ok) throw new Error(`status ${r.status}`);
      const svg = await r.text();
      if (!svg.includes('<svg')) throw new Error('not an svg');
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    } catch (e) {
      if (!tries) console.warn(`icon '${name}' did not load (${e.message}); asking again until it does`);
    }
    await new Promise(ok => setTimeout(ok, wait));
  }
}

// name → its data address (once in), and name → the load under way.
const data = new Map(), loads = new Map();
const sheet = document.head.appendChild(document.createElement('style'));
sheet.dataset.icons = '';

export function loadIcon(name) {
  let load = loads.get(name);
  if (!load) {
    loads.set(name, load = fetchIcon(name).then(uri => {
      if (!uri) return null;
      data.set(name, uri);
      // Wins over the file address each icon carries inline, on those already on screen too.
      sheet.sheet.insertRule(`.ico[data-i="${name}"] { --i: url("${uri}") !important; }`, sheet.sheet.cssRules.length);
      return uri;
    }));
  }
  return load;
}
export const iconData = name => data.get(name) || null;
for (const name of ICONS) loadIcon(name);

// A label makes it an image for screen readers, and a tooltip.
export const ico = (name, color, label) => {
  loadIcon(name);
  return `<i class="ico" data-i="${name}"${label ? ` role="img" aria-label="${label}" title="${label}"` : ''} style="--i:url(${DIR}${name}.svg)${color ? `;color:${color}` : ''}"></i>`;
};

// The icon as an image for canvas textures, tinted one colour; calls back once loaded.
const cache = {};
export function iconImage(name, color, done) {
  const key = `${name}|${color}`;
  if (cache[key]?.ready) return done(cache[key].c);
  if (cache[key]) return cache[key].wait.push(done);
  const entry = cache[key] = { wait: [done] };
  loadIcon(name).then(uri => {
    if (!uri) return;
    const img = new Image();
    img.onload = () => {
      const c = entry.c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 128, 128);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 128, 128);
      entry.ready = true;
      for (const f of entry.wait) f(c);
    };
    img.onerror = () => console.warn(`icon '${name}' could not be drawn`);
    img.src = uri;
  });
}
