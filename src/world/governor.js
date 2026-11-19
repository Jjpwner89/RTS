// A governor runs each village of yours that you are not watching: one building at a
// time, paid from the village's own goods, to keep it fed, housed, supplied and content.
// It never raises men, spends gold or knocks anything down. Switch it off at the keep.

const EVERY = 15;

export function govern(t, dt) {
  if (t.governor === false || t.hostile) return;
  t.govClock = (t.govClock ?? EVERY) - dt;
  if (t.govClock > 0) return;
  t.govClock = EVERY;
  if (t.underAttack || t.buildings.some(b => b.state === 'site')) return;
  const kind = wanted(t);
  if (kind && site(t, kind)) t.event(`The governor has set the villagers to build a ${kindName(t, kind)}.`);
}

function wanted(t) {
  const s = t.stock, n = k => t.buildings.filter(b => b.kind === k && b.state !== 'ruined').length;
  const meals = s.food + s.bread;
  if (t.hungry || meals < t.population) return n('farm') <= n('hunter') * 2 ? 'farm' : 'hunter';
  if (t.population >= t.housing - 2) return 'house';
  if (s.wood < 40 && n('woodcutter') < 2) return 'woodcutter';
  if (!n('storehouse') && t.buildings.length >= 6) return 'storehouse';
  if (t.mood < 50 && !n('well')) return 'well';
  if (t.population >= 25 && !n('market')) return 'market';
  if (t.population >= 30 && t.mood < 60 && !n('monastery')) return 'monastery';
  if (meals > t.population * 3 && n('farm') >= 2 && !n('mill')) return 'mill';
  if (n('mill') && !n('bakery')) return 'bakery';
  if (n('storehouse') * 12 < t.buildings.length) return 'storehouse';
  return null;
}

const kindName = (t, k) => ({ monastery: 'chapel', flax: 'flax field', hunter: "hunter's lodge" }[k] || k);

// Somewhere it can stand: houses near the keep, fields further out, the rest between.
function site(t, kind) {
  const [lo, hi] = kind === 'farm' || kind === 'flax' ? [45, 110] : kind === 'house' || kind === 'well' ? [18, 60] : [24, 90];
  for (let tries = 0; tries < 80; tries++) {
    const a = t.rand() * Math.PI * 2, r = lo + t.rand() * (hi - lo);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (t.canPlace(kind, x, z).ok) { t.place(kind, x, z); return true; }
  }
  return false;
}
