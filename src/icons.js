// Icons from game-icons.net (CC BY 3.0, by Lorc, Delapouite, Faithtoken and Willdabeast),
// one silhouette per file in assets/icons. In the page they are CSS masks, so each takes
// the colour of its text; on the map they are drawn into a canvas.

// Full addresses, since a url() in a CSS variable resolves against the stylesheet.
const DIR = new URL('../assets/icons/', import.meta.url).href;

// A label makes it an image for screen readers, and a tooltip.
export const ico = (name, color, label) =>
  `<i class="ico"${label ? ` role="img" aria-label="${label}" title="${label}"` : ''} style="--i:url(${DIR}${name}.svg)${color ? `;color:${color}` : ''}"></i>`;

// The icon as an image for canvas textures, tinted one colour; calls back once loaded.
const cache = {};
export function iconImage(name, color, done) {
  const key = `${name}|${color}`;
  if (cache[key]?.ready) return done(cache[key].c);
  if (cache[key]) return cache[key].wait.push(done);
  const entry = cache[key] = { wait: [done] };
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
  img.src = `${DIR}${name}.svg`;
}
