// A governor runs each village of yours that you are not watching: one building at a
// time, paid from the village's own goods, to keep it fed, housed, supplied and content.
// It never raises men, spends gold or knocks anything down, though it will put up a
// barracks for you to call men from. The one exception is the militia: when an assault
// on the keep outnumbers the men standing, it calls the whole village out to save it.
// Switch it off at the keep.

const EVERY = 15;

export function govern(t, dt) {
  if (t.governor === false || t.hostile) return;
  t.govClock = (t.govClock ?? EVERY) - dt;
  if (t.govClock > 0) return;
  t.govClock = EVERY;
  if (t.underAttack) { if (desperate(t) && t.muster().ok) t.event('The governor has called out the militia to hold the keep.', 1); return; }
  if (t.buildings.some(b => b.state === 'site')) return;
  const kind = wanted(t);
  if (kind && site(t, kind)) t.event(`The governor has set the villagers to build a ${kindName(t, kind)}.`);
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
  if (t.hungry || meals < t.population) {
    // A farm nobody can work feeds no one (playtest round 4: Pellley kept getting farms while six stood empty):
    // while places stand open the village needs hands on them, not more fields.
    const open = t.openFood();
    if (open) {
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
  // Hands with nothing to do: another workplace for them, taking turns.
  if (t.idle >= Math.max(6, t.population * 0.25)) {
    const more = [n('woodcutter') < 4 && 'woodcutter', n('quarry') < 2 && 'quarry', n('hunter') < 3 && 'hunter', 'farm'].filter(Boolean);
    return more[(t.govTurn = (t.govTurn || 0) + 1) % more.length];
  }
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
