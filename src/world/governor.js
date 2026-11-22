// A governor runs each village of yours that you are not watching: one building at a
// time, paid from the village's own goods, to keep it fed, housed, supplied and content.
// It never raises men, spends gold or knocks anything down, though it will put up a
// barracks for you to call men from. The one exception is the militia: when an assault
// on the keep outnumbers the men standing, it calls the whole village out to save it.
// It also develops the place for tax, slowly (develop). Switch it off at the keep.
import { devOf } from '../economy.js';

const EVERY = 15;
// Development (Orchestrator, 2026-11-22): one building that raises the tax every few minutes,
// until its buildings bring in DEV_SHARE a head (economy.js devOf): a governed 160-person
// home ends near 45 gold a minute, one built by hand 57-62.
const DEVELOP_EVERY = 180, DEV_SHARE = 0.075;
const ESSENTIAL = new Set(['house', 'farm', 'hunter', 'woodcutter']);
// A second or third workshop only with this much of its input in the stores for each it has.
const INPUT_EACH = 30;

export function govern(t, dt) {
  if (t.governor === false || t.hostile) return;
  t.govClock = (t.govClock ?? EVERY) - dt;
  if (t.govClock > 0) return;
  t.govClock = EVERY;
  if (t.underAttack) { if (desperate(t) && t.muster().ok) t.event('The governor has called out the militia to hold the keep.', 1); return; }
  if (t.buildings.some(b => b.state === 'site')) return;
  // What it wants first; if that can't go up (a market wants planks and nobody makes them:
  // seed 7's governed Ashford built nothing from minute 20 on), the next step of its development.
  const kind = wanted(t);
  let b = kind && site(t, kind), dev = null;
  // (nothing else while hungry with food places standing open: they want hands, not buildings;
  // nor while a home or food place it wants waits on materials, which would go elsewhere)
  const wait = t.govWait || ESSENTIAL.has(kind);
  if (!b && !wait && (dev = develop(t))) b = site(t, dev);
  if (!b && !wait) { dev = null; const k = spare(t); b = k && site(t, k); }
  if (!b) return;
  t.govSite = b;
  if (dev) t.govDevAt = t.time;
  t.event(`The governor has set the villagers to build a ${kindName(t, b.kind)}${dev ? ', to raise the tax' : ''}.`);
}

// What the keep's panel says the governor is doing.
export function govText(t) {
  if (t.governor === false) return 'Governor: off';
  const b = t.govSite;
  return b && b.state === 'site' && t.buildings.includes(b) ? `Governor: building a ${kindName(t, b.kind)}` : 'Governor: on';
}

// A building that raises the tax, in the place's own way: a workshop for what is gathered
// there, a mill and bakery on its grain, a market only in a market town, then a second and
// third of the workshop with the most to work. Never a military one, never paid in gold.
export function develop(t) {
  if (t.time - (t.govDevAt ?? -Infinity) < DEVELOP_EVERY) return null;
  if (devOf(t.devCounts()) >= t.population * DEV_SHARE) return null;
  const s = t.stock, n = k => t.buildings.filter(b => b.kind === k && b.state !== 'ruined').length;
  const first = [n('woodcutter') && 'carpenter', n('mine') && 'smelter', n('hunter') && 'tanner', n('flax') && 'ropemaker',
    n('farm') >= 2 && 'mill', n('mill') && 'bakery', t.kind === 'market' && 'market'].filter(k => k && !n(k));
  if (first.length) return first[0];
  const input = { carpenter: 'wood', smelter: 'ore', tanner: 'hides', ropemaker: 'flax', mill: 'food', bakery: 'flour' };
  const more = Object.keys(input).filter(k => n(k) && n(k) < 3 && (s[input[k]] || 0) >= INPUT_EACH * n(k)).sort((a, b) => (s[input[b]] || 0) / n(b) - (s[input[a]] || 0) / n(a));
  return more[0] || null;
}

// An assault (not a raid) with more men standing than the village has under arms.
function desperate(t) {
  const standing = regs => regs.filter(r => !r.gone && !r.routing).reduce((n, r) => n + r.alive, 0);
  const foes = t.attackers.filter(g => g.mode === 'assault' && !g.leaving).flatMap(g => g.regs);
  return foes.length > 0 && standing(foes) > standing(t.garrison());
}

function wanted(t) {
  const s = t.stock, n = k => t.buildings.filter(b => b.kind === k && b.state !== 'ruined').length;
  const meals = s.food + s.bread;
  t.govWait = false;
  if (t.hungry || meals < t.population) {
    // A farm nobody can work feeds no one (playtest round 4: Pellley kept getting farms while six stood empty):
    // while places stand open the village needs hands on them, not more fields.
    const open = t.openFood();
    if (open) {
      t.govWait = true;
      if (!t.govHeld) { t.govHeld = true; t.event(`The governor is building no more farms: ${open} food place${open > 1 ? 's stand' : ' stands'} open with nobody to work ${open > 1 ? 'them' : 'it'}.`, 1); }
      return null;
    }
    t.govHeld = false;
    return n('farm') <= n('hunter') * 2 ? 'farm' : 'hunter';
  }
  if (t.population >= t.housing - 2) return 'house';
  if (s.wood < 40 && n('woodcutter') < 2) return 'woodcutter';
  if (!n('storehouse') && t.buildings.length >= 6) return 'storehouse';
  if (t.mood < 50 && !n('well')) return 'well';
  if (t.population >= 25 && !n('market')) return 'market';
  if (t.population >= 30 && t.mood < 60 && !n('monastery')) return 'monastery';
  if (meals > t.population * 3 && n('farm') >= 2 && !n('mill')) return 'mill';
  if (n('mill') && !n('bakery')) return 'bakery';
  if (n('storehouse') * 12 < t.buildings.length) return 'storehouse';
  // A barracks, so the village can be called to arms (the governor never calls it).
  if (t.population >= 40 && !n('barracks')) return 'barracks';
  return null;
}

// Hands with nothing to do: another workplace for them, taking turns (after its development).
function spare(t) {
  const n = k => t.buildings.filter(b => b.kind === k && b.state !== 'ruined').length;
  if (t.idle >= Math.max(6, t.population * 0.25)) {
    const more = [n('woodcutter') < 4 && 'woodcutter', n('quarry') < 2 && 'quarry', n('hunter') < 3 && 'hunter', 'farm'].filter(Boolean);
    return more[(t.govTurn = (t.govTurn || 0) + 1) % more.length];
  }
  return null;
}

const kindName = (t, k) => ({ monastery: 'chapel', flax: 'flax field', hunter: "hunter's lodge", tanner: 'tannery', ropemaker: 'ropewalk', carpenter: "carpenter's shop" }[k] || k);

// Somewhere it can stand: houses near the keep, fields further out, the rest between.
function site(t, kind) {
  const [lo, hi] = kind === 'farm' || kind === 'flax' ? [45, 110] : kind === 'house' || kind === 'well' ? [18, 60] : [24, 90];
  for (let tries = 0; tries < 80; tries++) {
    const a = t.rand() * Math.PI * 2, r = lo + t.rand() * (hi - lo);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (t.canPlace(kind, x, z).ok) return t.place(kind, x, z).building;
  }
  return null;
}
