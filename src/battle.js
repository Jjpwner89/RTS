// Battle simulation: regiments of individual soldiers, melee, arrows and morale;
// walls that soldiers stand on and attackers must breach; siege engines; captains.
// No rendering here; view.js and siegeview.js draw whatever this state holds.
import { rng } from './noise.js';
import { HALF, HOMES } from './terrain.js';
import { audio } from './audio.js';
import { Walls, toSegment } from './walls.js';
import { Nav } from './nav.js';

// role: what the unit is for, shown on its card. kit: goods each man needs to be raised
// (the Realm side decides where they come from). gold: the price per man for hired and
// household troops, who cost no villagers. engine: a siege engine worked by the regiment.
// look: the model to borrow until the unit has its own.
export const TYPES = {
  spear: { key: 'spear', armour: 'none', name: 'Spearmen', role: 'Hold the line; stop horse from the front', count: 80, files: 20, spacing: 1.6, speed: 3.0, hp: 12, atk: 3, def: 5, dmg: 4, reach: 2.4, cooldown: 1.4, morale: 65, shield: true, vsMounted: 0.3, braces: true,
    kit: { spears: 1, shields: 1 } },
  sword: { key: 'sword', armour: 'none', name: 'Swordsmen', role: 'Win the melee against other foot', count: 72, files: 18, spacing: 1.5, speed: 3.3, hp: 12, atk: 6, def: 3, dmg: 5, reach: 1.8, cooldown: 1.1, morale: 70, shield: true,
    kit: { swords: 1, shields: 1 } },
  archer: { key: 'archer', armour: 'none', name: 'Archers', role: 'Loose fast at range; weak against armour', count: 60, files: 20, spacing: 1.7, speed: 3.3, hp: 8, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 50, range: 85, reload: 4.5, arrowDmg: 5, quiver: 24,
    kit: { bows: 1, arrows: 10 } },
  crossbow: { key: 'crossbow', armour: 'none', name: 'Crossbowmen', role: 'Slow, heavy bolts that punch through armour', count: 60, files: 20, spacing: 1.7, speed: 3.0, hp: 10, atk: 2, def: 3, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 55, range: 100, reload: 8, arrowDmg: 9, pierce: 0.7, quiver: 16, look: 'archer',
    kit: { crossbows: 1, bolts: 10 } },
  lightcav: { key: 'lightcav', armour: 'none', name: 'Light cavalry', role: 'Fast: flank, chase routers, hunt archers and engines', count: 40, files: 20, spacing: 2.4, depth: 3.2, speed: 9.5, hp: 14, atk: 4, def: 2, dmg: 4, reach: 2.3, cooldown: 1.2, morale: 60, mounted: true, charge: true, chargeMul: 1.5, look: 'cav',
    kit: { horses: 1, spears: 1 } },
  cav: { key: 'cav', armour: 'mail', name: 'Heavy cavalry', role: 'Charge into flanks and rear; avoid braced spears', count: 40, files: 20, spacing: 2.6, depth: 3.4, speed: 7.5, hp: 20, atk: 5, def: 4, dmg: 5, reach: 2.4, cooldown: 1.3, morale: 70, mounted: true, charge: true,
    kit: { horses: 1, mail: 1, swords: 1, shields: 1 } },
  maa: { key: 'maa', armour: 'mail', name: 'Men-at-arms', role: 'Armoured foot: storm walls, anchor the line', count: 60, files: 15, spacing: 1.5, speed: 2.8, hp: 18, atk: 6, def: 6, dmg: 6, reach: 2.0, cooldown: 1.3, morale: 85, shield: true, look: 'sword',
    kit: { mail: 1, swords: 1, shields: 1 } },
  knight: { key: 'knight', armour: 'plate', name: 'Knights', role: 'Elite: the charge that breaks armies', count: 24, files: 12, spacing: 2.6, depth: 3.4, speed: 7.0, hp: 30, atk: 8, def: 7, dmg: 7, reach: 2.5, cooldown: 1.2, morale: 95, mounted: true, charge: true, chargeMul: 2.5, shield: true, look: 'cav',
    kit: { horses: 1, armour: 1, lances: 1, swords: 1, shields: 1 } },
  // Villagers with spears and no armour: what a free village can turn out.
  militia: { key: 'militia', armour: 'none', name: 'Militia', role: 'Cheap spears; break easily', count: 40, files: 14, spacing: 1.6, speed: 3.2, hp: 10, atk: 3, def: 3, dmg: 3.5, reach: 2.3, cooldown: 1.4, morale: 45, braces: true,
    kit: { spears: 1 } },
  bandit: { key: 'bandit', armour: 'none', name: 'Bandits', role: 'Raiders', count: 20, files: 10, spacing: 1.7, speed: 3.5, hp: 10, atk: 4, def: 2, dmg: 4, reach: 1.9, cooldown: 1.2, morale: 40 },
  // A village's whole people called out when it is attacked (economy.js muster): axes,
  // flails and pitchforks, no armour and no drill. Weaker than any levy and quick to break.
  folk: { key: 'folk', armour: 'none', name: 'Village militia', role: 'Everyone called out: improvised weapons, no armour, break easily', count: 40, files: 14, spacing: 1.7, speed: 3.2, hp: 9, atk: 2, def: 2, dmg: 3, reach: 1.8, cooldown: 1.4, morale: 35, militia: true, value: 0.35, look: 'bandit' },
  // Hired and household troops: paid in gold, no villagers. Mercenaries lose heart quickly when a fight goes badly.
  sellsword: { key: 'sellsword', armour: 'mail', name: 'Sellswords', role: 'Hired foot, good fighters, quick to quit', count: 60, files: 15, spacing: 1.5, speed: 3.3, hp: 14, atk: 6, def: 4, dmg: 5, reach: 1.9, cooldown: 1.1, morale: 60, shield: true, merc: true, gold: 6, look: 'sword' },
  hiredxbow: { key: 'hiredxbow', armour: 'leather', name: 'Hired crossbows', role: 'Hired crossbowmen behind big shields', count: 50, files: 17, spacing: 1.7, speed: 2.9, hp: 11, atk: 2, def: 4, dmg: 3, reach: 1.6, cooldown: 1.3, morale: 50, range: 105, reload: 7.5, arrowDmg: 9, pierce: 0.7, quiver: 16, shield: true, merc: true, gold: 8, look: 'crossbow' },
  // Norrhold, the north's own host for Part 2 (norrhold: true; not raised in the south).
  // Axemen with long two-handed axes and no shields, who break shield walls; javelin men
  // who throw a few heavy javelins at close range and then fight; and war dogs, fast and
  // savage, that unsettle men and run down the broken.
  axeman: { key: 'axeman', armour: 'mail', name: 'Norrhold axemen', role: 'Long axes that break shield walls; no shields of their own', count: 60, files: 15, spacing: 1.7, speed: 3.3, hp: 17, atk: 6, def: 3, dmg: 7, reach: 2.1, cooldown: 1.4, morale: 80, shieldbreak: true, norrhold: true, look: 'sword',
    kit: { axes: 1 } },
  javelin: { key: 'javelin', armour: 'none', name: 'Norrhold javelin men', role: 'A few heavy javelins at close range, then spears', count: 50, files: 17, spacing: 1.7, speed: 3.6, hp: 10, atk: 3, def: 2, dmg: 3.5, reach: 2.2, cooldown: 1.3, morale: 60, range: 38, reload: 3, arrowDmg: 8, pierce: 0.4, quiver: 4, javelin: true, norrhold: true, look: 'militia',
    kit: { javelins: 4, spears: 1 } },
  wardog: { key: 'wardog', armour: 'none', name: 'War dogs', role: 'Fast and savage: unsettle men, run down the broken', count: 24, files: 12, spacing: 1.5, depth: 1.6, speed: 8, hp: 8, atk: 5, def: 1, dmg: 3, reach: 1.4, cooldown: 0.9, morale: 50, dog: true, norrhold: true, look: 'bandit',
    kit: { dogs: 1 } },
  household: { key: 'household', armour: 'mail', name: 'Household guard', role: "The lord's own men: steady and well armed", count: 30, files: 15, spacing: 1.5, speed: 3.2, hp: 16, atk: 7, def: 5, dmg: 6, reach: 1.9, cooldown: 1.1, morale: 95, shield: true, retinue: true, gold: 5, look: 'maa' },
  // Siege engines: the regiment is its crew; the engine goes where they push it.
  ladder: { key: 'ladder', armour: 'none', name: 'Ladder men', role: 'Raise ladders against a wall, then climb', count: 12, files: 6, spacing: 1.7, speed: 2.9, hp: 9, atk: 3, def: 1, dmg: 3, reach: 1.8, cooldown: 1.3, morale: 45, look: 'militia',
    engine: { kind: 'ladder', per: 4, raise: 4 }, cost: { planks: 3 } },
  ram: { key: 'ram', armour: 'none', name: 'Battering ram', role: 'Breaks gates; the roof keeps off arrows', count: 10, files: 2, spacing: 2.8, depth: 1.1, engineLen: 0.6, speed: 1.6, hp: 10, atk: 2, def: 2, dmg: 3, reach: 1.8, cooldown: 1.4, morale: 55, look: 'militia',
    engine: { kind: 'ram', hp: 700, dmg: 110, reload: 3.2, roof: 0.25 }, cost: { wood: 30, planks: 10, iron: 2 } },
  mangonel: { key: 'mangonel', armour: 'none', name: 'Mangonel', role: 'Throws stones at walls, towers and packed men', count: 8, files: 4, spacing: 1.7, engineLen: 3.5, speed: 1.3, hp: 9, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.4, morale: 45, look: 'militia',
    engine: { kind: 'mangonel', hp: 320, range: 150, min: 25, reload: 9, dmg: 120, splash: 2.8, sdmg: 14, setup: 3, spread: 0.022 }, cost: { planks: 25, string: 6, iron: 2 } },
  trebuchet: { key: 'trebuchet', armour: 'none', name: 'Trebuchet', role: 'Long range; smashes stone walls; must set up', count: 12, files: 4, spacing: 1.7, engineLen: 6, speed: 0.9, hp: 9, atk: 2, def: 1, dmg: 3, reach: 1.6, cooldown: 1.4, morale: 45, look: 'militia',
    engine: { kind: 'trebuchet', hp: 480, range: 250, min: 60, reload: 15, dmg: 340, splash: 3.6, sdmg: 20, setup: 12, spread: 0.014 }, cost: { wood: 40, planks: 40, string: 10, iron: 6 } },
};

// Armour is worn by the regiment, apart from its type: the type sets the weapon, attack and
// nerve; the armour sets protection. def is added to the type's defence in melee; arrows is
// the share of arrows that still wound (bolts and javelins go through some of what is left);
// pace and tire slow and weary the men who wear it. A type's numbers are for its usual armour
// (armour on the type: what its kit holds, as economy.js baseArmour), so only a change from
// that moves its melee, pace and wind. kit: the good each man wears out of the racks.
export const ARMOUR = {
  none:    { name: 'No armour', def: 0, arrows: 0.9,  pace: 1,    tire: 1,    kit: {} },
  leather: { name: 'Leather',   def: 1, arrows: 0.75, pace: 1,    tire: 1.05, kit: { leather: 1 } },
  mail:    { name: 'Mail',      def: 2, arrows: 0.55, pace: 0.95, tire: 1.15, kit: { mail: 1 } },
  plate:   { name: 'Plate',     def: 4, arrows: 0.38, pace: 0.9,  tire: 1.3,  kit: { armour: 1 } },
};
export const ARMOURS = Object.keys(ARMOUR);
// Shields: the types that carry one now (shield on the type) may go with or without.
// In front they turn blows and most arrows; from the flank or rear they do nothing.
export const canShield = key => !!TYPES[key]?.shield;

// A regiment's armour and shield, read live so a refit tells at once (r.armour, r.shield;
// missing means the type's usual). Its defence, arrow guard and the pace and wind it costs
// are measured against the armour the type's numbers were set for.
const wornBy = r => ARMOUR[r.armour] || ARMOUR[r.T.armour] || ARMOUR.none;
const usual = T => ARMOUR[T.armour] || ARMOUR.none;
export const hasShield = r => r.shield !== false && !!r.T.shield;
export const defOf = r => r.T.def + wornBy(r).def - usual(r.T).def;
export const arrowGuard = r => wornBy(r).arrows;
const kitPace = r => wornBy(r).pace / usual(r.T).pace;
const kitTire = r => wornBy(r).tire / usual(r.T).tire;

// How much stronger (above 1) or weaker a regiment is for its armour and shield than its
// type usually is, for fights nobody watches: about 8% a point of defence, 10% a shield.
export function armourValue(key, armour, shield) {
  const T = TYPES[key];
  if (!T) return 1;
  const A = ARMOUR[armour] || usual(T), base = usual(T);
  const off = T.shield && shield === false ? 1 : 0;
  return Math.max(0.5, 1 + (A.def - base.def) * 0.08 + (base.arrows - A.arrows) * 0.15 - off * 0.1);
}

// Which model each unit borrows until it has its own, in order of preference.
export function lookChain(key) {
  const chain = [key];
  let T = TYPES[key];
  if (key === 'captain') return ['captain', 'knight', 'cav'];
  if (key === 'lord') return ['lord', 'captain', 'knight', 'cav'];
  if (key === 'lady') return ['lady', 'lord', 'captain', 'knight', 'cav'];
  while (T?.look && !chain.includes(T.look)) { chain.push(T.look); T = TYPES[T.look]; }
  return chain;
}

// Formations: spacing and depth multiply the unit's own; the rest change the fight.
export const FORMATIONS = {
  line: { name: 'Line', key: 'n', spacing: 1, depth: 1, speed: 1, def: 0, morale: 1 },
  tight: { name: 'Tight', key: 't', spacing: 0.78, depth: 0.85, speed: 0.85, def: 0.08, morale: 0.8, desc: 'Shoulder to shoulder: harder to break, slower, an easy target for arrows' },
  loose: { name: 'Loose', key: 'l', spacing: 1.75, depth: 1.5, speed: 1.1, def: -0.05, morale: 1.1, desc: 'Spread out: arrows and stones find fewer men' },
  wedge: { name: 'Wedge', key: 'v', spacing: 1, depth: 0.9, speed: 1, def: -0.03, morale: 1, charge: 1.35, desc: 'A point that drives into the enemy line: a stronger charge' },
  square: { name: 'Schiltron', key: 'x', spacing: 1.05, depth: 1, speed: 0.35, def: 0.04, morale: 0.75, desc: 'A ring facing out: no flanks to turn, spears braced all round' },
};

// Each side deploys this line; the scale setting stacks extra lines behind it.
const LAYOUT = [
  ['spear', -70, 0], ['maa', -35, 0], ['spear', 0, 0], ['sword', 35, 0], ['spear', 70, 0],
  ['archer', -30, -22], ['crossbow', 30, -22],
  ['cav', -120, -10], ['knight', 120, -10], ['lightcav', -165, -24], ['lightcav', 165, -24],
];
// A Norrhold host: axemen in the line, javelin men in front, dogs on the wings.
const NORRHOLD = [
  ['axeman', -70, 0], ['axeman', -25, 0], ['spear', 20, 0], ['axeman', 65, 0], ['axeman', 0, -24],
  ['javelin', -45, 14], ['javelin', 45, 14], ['archer', -40, -22], ['archer', 40, -22],
  ['wardog', -120, -6], ['wardog', 120, -6], ['lightcav', -160, -20], ['lightcav', 160, -20],
];

const CELL = 4, GSPAN = HALF + 60, GN = Math.ceil(GSPAN * 2 / CELL), CLIMB = { tower: 2, gate: 2, ladder: 3.5 }, POUR_REACH = 3.9;
const ORDINAL = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const turnToward = (a, b, maxStep) => {
  const d = angleDiff(b, a);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
};
const live = s => s.alive && !s.gone;

// sight: how far anyone sees (metres), where the weather limits it.
export const WEATHER = {
  clear: { name: 'Clear' },
  rain: { name: 'Rain', say: 'Rain: bows fall short and miss more, and the ground is heavy for horses.' },
  fog: { name: 'Fog', sight: 70, say: 'Fog: nobody can see more than 70 m.' },
  night: { name: 'Night', sight: 45, say: 'Night: nobody sees beyond 45 m, and bows miss more in the dark.' },
};
const MINE_WORK = 9000, COUNTER_WORK = 1500;   // man-seconds to dig a mine, and to break into one

// The ground's height, cached on a 1 m grid and blended between points: the terrain's
// own function is noise and costs too much to call for every soldier every step.
function cachedHeight(heightAt) {
  if (heightAt.cached) return heightAt;
  const SPAN = HALF + 60, N = SPAN * 2 + 1, grid = new Float32Array(N * N).fill(NaN);
  const at = (i, j) => {
    const k = j * N + i;
    let v = grid[k];
    if (v !== v) v = grid[k] = heightAt(i - SPAN, j - SPAN);
    return v;
  };
  const f = (x, z) => {
    const fx = x + SPAN, fz = z + SPAN;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return heightAt(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  f.cached = true;
  f.raw = heightAt;
  return f;
}

export const captainLevel = xp => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));

// Captains' traits, earned in battle (captainReport) and felt in the next ones, by the
// regiment the captain rides with. 'hated:<house>' is a grudge an enemy house holds.
export const CAPTAIN_TRAITS = {
  steady: { name: 'steady under arrows', does: 'his men shrug off arrows' },
  stubborn: { name: 'stubborn', does: 'his men hold longer' },
  skittish: { name: 'quick to fall back', does: 'his men break sooner' },
  reckless: { name: 'reckless in the charge', does: 'his charges hit harder' },
  killer: { name: 'a hard killer', does: 'his men fight a little better' },
};
export const traitName = k => k.startsWith('hated:') ? `hated by ${k.slice(6)}` : CAPTAIN_TRAITS[k]?.name || k;

// Veterans: a regiment's experience (kept on its unit spec as `xp`, carried home with the
// men) gives a rank. A battle fought and survived is worth 0.5, a win 0.5 more, killing
// well up to 1: one good battle blooded, about three seasoned, six or so a veteran.
export const VET_RANKS = ['Green', 'Blooded', 'Seasoned', 'Veteran'];
export const vetRank = xp => (xp >= 6 ? 3 : xp >= 3 ? 2 : xp >= 1 ? 1 : 0);

export class Battle {
  // homes: where each side's broken regiments run to. disbandAtHome: sides whose
  // routers leave the fight once they get there (raiders going back to camp).
  // hosts: which layout each side deploys ('south' or 'norrhold').
  constructor(heightAt, seed, { scale = 1, deploy = true, homes = HOMES, disbandAtHome = [false, false], hosts = ['south', 'south'] } = {}) {
    this.heightAt = cachedHeight(heightAt);
    this.rand = rng(seed + 99);
    this.time = 0;
    this.regs = [];
    this.soldiers = [];
    this.arrows = [];
    this.stones = [];
    this.gStart = new Int32Array(GN * GN + 1);
    this.gItems = [];
    this.winner = null;
    this.losses = [0, 0];
    this.lostKit = [{}, {}];   // the dead of each side by armour level, and their shields
    this.events = [];          // short messages for the HUD, e.g. a regiment routing
    this.homes = homes;
    this.disbandAtHome = disbandAtHome;
    this.checkWinner = deploy;
    this.counts = [{}, {}];
    this.version = 0;          // bumped when prune() drops soldiers, so views rebuild
    this.walls = new Walls(heightAt);
    this.nav = new Nav(this.walls);
    this.walls.onBreak = s => this.onWallBreak(s);
    this.captains = [null, null];
    this.lords = [null, null];
    // Hooks for a town: structures() lists buildings engines can hit; onRuin(b) when one falls.
    this.structures = null;
    this.onRuin = null;
    this.buildingSide = 0;
    this.masons = 1;           // crews raising wall sites (a village sets this from its people)
    this.trees = null;         // the field's trees, for woods (setWoods)
    this.woods = null;         // how wooded each 4 m cell is, 0..1
    this.viewer = 0;           // the side whose eyes the view uses: enemies it can't see are not drawn
    this.river = null;         // battlefield.js makeRiver(): water, fords and bridges
    this.weather = 'clear';    // 'clear', 'rain' or 'fog' (setWeather)
    this.weatherSaid = true;
    this.mines = [];           // mines dug under walls (orderMine), for the view and the AI
    this.duel = null;          // champions in single combat (challenge / acceptDuel)
    this.duelOffer = null;     // a challenge waiting for the player's answer
    this.pours = [];           // boiling oil poured: { x, z, y, time }, for the view
    this.hunger = [0, 0];      // 0 fed .. 1 starving (setHunger)
    this.termsAllowed = false; // a garrison may ask for terms (checkTerms)
    this.terms = null;         // { side, time } while an offer waits for an answer
    this.surrendered = null;   // the side that yielded on terms
    if (deploy) for (let side = 0; side < 2; side++) this.deploy(side, scale, hosts[side] === 'norrhold' ? NORRHOLD : LAYOUT);
  }

  event(side, text) { this.events.push({ time: this.time, side, text }); }

  // ---- woods and sight ----

  setWoods(trees) { this.trees = trees; this.woodsAt = -Infinity; }

  // ---- rivers ----

  setRiver(river) { this.river = river; }

  // 0 dry, 1 shallow, 2 deep.
  waterAt(x, z) { return this.river ? this.river.depthAt(x, z) : 0; }

  // Where a man stands: the ground, or the deck of a bridge he is on.
  groundY(x, z) {
    const b = this.river?.onBridge(x, z);
    return b ? Math.max(this.heightAt(x, z), this.river.deckY(b)) : this.heightAt(x, z);
  }

  // A regiment (or a man) bound for the far bank goes by the best ford or bridge, not through
  // deep water, unless the wade is short and the way round long: deep water counts six times over (slow going, and no place to be caught).
  riverWay(r, tx, tz) {
    const R = this.river, a = R.bank(r.x, r.z), b = R.bank(tx, tz);
    // Over: straight on out of the water before turning, so the tail doesn't wade.
    if (r.exit) {
      if (R.bank(r.exit.x, r.exit.z) === b && Math.hypot(r.exit.x - r.x, r.exit.z - r.z) > 2) return r.exit;
      r.exit = null;
    }
    if (a === b) return null;
    // A man pushed off the side of a bridge or ford into deep water steps back onto it.
    if (!r.soldiers && R.depthAt(r.x, r.z) === 2) {
      for (const c of R.crossings()) {
        const h = (c.ref.half || 3) - 0.8;
        if (Math.abs(r.x - c.x) < h + 6) return { x: Math.max(c.x - h, Math.min(c.x + h, r.x)), z: r.z + b * 0.5 };
      }
    }
    // Wading straight over is fine where the way crosses at a ford or bridge.
    const cx = r.x + (tx - r.x) * Math.abs(R.across(r.x, r.z)) / (Math.abs(R.across(r.x, r.z)) + Math.abs(R.across(tx, tz)) || 1);
    const m = r.soldiers ? 3 : 0.5;          // a regiment needs room for its files either side
    if (R.depthAt(cx - m, R.zAt(cx - m)) < 2 && R.depthAt(cx + m, R.zAt(cx + m)) < 2) return null;
    let best = null, bs = Infinity;
    for (const c of R.crossings()) {
      const p = c.end(a), q = c.end(b);
      const cost = Math.hypot(p.x - r.x, p.z - r.z) + Math.hypot(q.x - p.x, q.z - p.z) + Math.hypot(tx - q.x, tz - q.z);
      if (cost < bs) { bs = cost; best = c; }
    }
    if (!best) return null;
    if (Math.hypot(tx - r.x, tz - r.z) + R.half * 2 * 5 < bs) return null;
    // A regiment lines up on the middle of the crossing first, so its outer files don't step off.
    const tol = (best.ref.half || 3) * 0.7, lined = Math.abs(r.x - best.x) < (r.soldiers ? Math.min(tol, 1.6) : tol) && Math.abs(R.across(r.x, r.z)) < R.half + 6;
    if (!lined) return best.end(a);
    // A regiment marches its whole column clear; a man only needs to get his feet dry.
    r.exit = { x: best.x, z: R.zAt(best.x) + b * (R.half + (r.soldiers ? 16 : 3)) };
    return r.exit;
  }

  // Send regiments to set a bridge alight from their own bank.
  orderBurnBridge(regs, bridge) {
    for (const r of regs) {
      if (!this.usable(r) || r.engine || bridge.state !== 'up') continue;
      this.clearPosts(r);
      r.targetReg = null;
      r.burnBridge = bridge;
      const side = this.river.bank(r.cx, r.cz), end = { x: bridge.x, z: this.river.zAt(bridge.x) + side * (this.river.half + 5) };
      r.dest = { ...end, angle: side > 0 ? Math.PI : 0 };
    }
  }

  // The bridge nearest (x, z) within `within` m, if it still stands.
  bridgeNear(x, z, within = 40) {
    let best = null, bd = within;
    for (const b of this.river?.bridges || []) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (b.state === 'up' && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // Once a second: men at a bridge with orders to burn it set it going; it burns down in a while.
  riverTick() {
    for (const r of this.regs) {
      const b = r.burnBridge;
      if (!b) continue;
      if (r.gone || r.routing || b.state !== 'up' || r.targetReg) { r.burnBridge = null; continue; }
      if (r.engaged > 0 || Math.hypot(r.cx - b.x, r.cz - b.z) > this.river.half + 12) continue;
      b.burning = Math.max(b.burning, 1);
      b.hp -= Math.min(12, 1 + r.alive * 0.4);
    }
    for (const b of this.river?.bridges || []) {
      if (b.state !== 'up' || b.burning <= 0) continue;
      b.hp -= 2;           // once alight it keeps burning
      if (b.hp <= 0) {
        b.state = 'burnt';
        b.burning = 0;
        this.event(0, 'The bridge has burned down.');
        for (const r of this.regs) if (r.burnBridge === b) r.burnBridge = null;
      }
    }
  }

  // How wooded the ground is at (x, z): 0 open, 1 thick wood. Rebuilt now and then, as trees fall.
  woodAt(x, z) {
    if (!this.trees) return 0;
    if (this.time - this.woodsAt > 10) this.buildWoods();
    const i = Math.floor((x + GSPAN) / CELL), j = Math.floor((z + GSPAN) / CELL);
    if (i < 0 || j < 0 || i >= GN || j >= GN) return 0;
    return this.woods[j * GN + i];
  }

  buildWoods() {
    this.woodsAt = this.time;
    const w = this.woods ||= new Float32Array(GN * GN);
    w.fill(0);
    for (const t of this.trees.spots) {
      if (!t.standing) continue;
      const i = Math.floor((t.x + GSPAN) / CELL), j = Math.floor((t.z + GSPAN) / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < GN && jj < GN) w[jj * GN + ii] += di || dj ? 0.2 : 0.45;
      }
    }
    for (let k = 0; k < w.length; k++) w[k] = Math.min(1, w[k]);
  }

  // Once a second: who the enemy can see. A regiment in woods is hidden until an enemy comes
  // within 30 m, it shoots, or it fights. A regiment that was hidden strikes as an ambush.
  updateSight() {
    const all = this.regs.filter(r => !r.gone);
    for (const r of all) {
      let near = Infinity;
      for (const o of all) if (o.side !== r.side) near = Math.min(near, Math.hypot(o.cx - r.cx, o.cz - r.cz));
      let inWood = 0, n = 0;
      for (const m of r.soldiers) if (m.alive && !m.gone) { n++; if (this.woodAt(m.x, m.z) > 0.3) inWood++; }
      const cover = n > 0 && inWood >= n * 0.6 && near > 30;
      const busy = r.engaged > 0 || this.time - (r.lastShot ?? -99) < 3 || r.routing;
      // In fog or at night nobody sees far; only cover in the woods makes an ambush.
      const sight = WEATHER[this.weather].sight;
      const hidden = (cover || (sight && near > sight)) && !busy;
      if (hidden && cover) { r.hiddenAt = this.time; r.ambushed = false; }
      r.seen = !hidden;
      r.unseen = hidden && r.side !== this.viewer;
    }
  }

  // Whether `side` can see regiment o (its own always).
  sees(side, o) { return o.side === side || o.seen !== false; }

  // Light weather, the same for both sides. Rain: bows fall short, wet strings miss more,
  // and the ground is heavy, worst for horses. Fog: nobody sees far (updateSight).
  // The player is told of it once the fighting starts.
  setWeather(kind = 'clear') {
    this.weather = WEATHER[kind] ? kind : 'clear';
    this.weatherSaid = !WEATHER[this.weather].say;
    this.updateSight();
  }
  label(r) { return `${r.side ? 'Enemy ' : ''}${r.name}`; }

  // Side 0 (the player) deploys on +z facing -z; side 1 on -z facing +z.
  deploy(side, scale, layout = LAYOUT) {
    const dir = side === 0 ? -1 : 1;
    for (let line = 0; line < scale; line++) {
      for (const [key, x, back] of layout) {
        this.addRegiment(side, key, side === 0 ? -x : x, -dir * (70 - back + line * 50), side === 0 ? Math.PI : 0);
      }
    }
  }

  // A new regiment with its front centre at (x, z). `from` gives start positions,
  // e.g. the villagers who were just called up, who then walk into formation.
  // Counts can run well past the type's usual size; big regiments get a wider front.
  addRegiment(side, key, x, z, angle, { count, name, from, xp = 0, armour, shield } = {}) {
    const T = TYPES[key];
    count = Math.max(1, Math.round(count || T.count));
    const n = this.counts[side][key] = (this.counts[side][key] || 0) + 1;
    const files = count > T.count ? Math.min(count, Math.max(T.files, Math.round(Math.sqrt(count * T.files * T.files / T.count))))
      : Math.min(T.files, Math.max(T.engine ? 1 : 4, Math.ceil(count / 2)));
    const r = {
      id: this.regs.length, side, T, name: name || (T.engine ? `${T.name} ${n}` : `${ORDINAL(n)} ${T.name}`),
      x, z, angle, files, dest: null, targetReg: null, morale: T.morale, routing: false, routedAt: 0, rallied: false, regrouping: false,
      gone: false, disbanded: false, soldiers: [], initial: count, alive: count, engaged: 0, lag: 0,
      cx: x, cz: z, lastHit: -99, firingAt: null, fleeDir: 0,
      formation: 'line', hold: false, fireAtWill: true, chargeUntil: 0, column: false, via: null, viaCd: 0,
      posts: null, access: null, targetWall: null, captain: null, kills: 0, fatigue: 0, xp, vet: vetRank(xp), fought: false,
      ammo: T.range ? count * (T.quiver || 20) : 0, maxAmmo: T.range ? count * (T.quiver || 20) : 0,
      engine: T.engine ? { ...T.engine, hp: T.engine.hp || 0, maxHp: T.engine.hp || 0, cd: 2, ready: 0, ladders: [], raising: 0 } : null,
    };
    this.setArmour(r, armour, shield);
    for (let i = 0; i < count; i++) {
      const s = this.makeSoldier(r, i, angle);
      const p = from?.[i] || this.slotPos(r, i);
      s.x = p.x + (this.rand() - 0.5) * 0.4;
      s.z = p.z + (this.rand() - 0.5) * 0.4;
      s.lx = s.x; s.lz = s.z;
      s.y = this.heightAt(s.x, s.z);
      r.soldiers.push(s);
      this.soldiers.push(s);
    }
    if (from) this.assignSlots(r);
    this.regs.push(r);
    return r;
  }

  makeSoldier(r, slot, angle) {
    const T = r.T;
    return {
      reg: r, slot, x: 0, z: 0, y: 0, yaw: angle, hp: T.hp, alive: true, gone: false,
      cd: this.rand() * T.cooldown, fireCd: this.rand() * (T.reload || 1), target: null, searchCd: this.rand() * 0.3,
      v: 0, vx: 0, vz: 0, phase: this.rand() * 6, fall: 0, lunge: 0, charged: false, idleFor: 0,
      jitter: (this.rand() - 0.5) * 0.5, level: 0, perch: null, climb: 0, via: null, viaCd: this.rand() * 0.4, lx: 0, lz: 0,
    };
  }

  // Send a regiment home: its living soldiers leave the battle. Returns where they stood.
  disband(r) {
    const left = [];
    for (const s of r.soldiers) {
      if (!live(s)) continue;
      left.push({ x: s.x, z: s.z });
      s.gone = true;
      s.target = null;
    }
    r.gone = true;
    r.disbanded = true;
    r.routing = r.regrouping = false;
    this.clearPosts(r);
    for (const o of this.regs) if (o.targetReg === r) o.targetReg = null;
    return left;
  }

  // A village's battle runs for the whole campaign. Men who left and bodies that have
  // lain a while are dropped so the lists stay short.
  prune() {
    const keep = this.soldiers.filter(s => !s.gone && (s.alive || this.time - s.diedAt < 90));
    if (keep.length === this.soldiers.length) return;
    this.soldiers = keep;
    this.version++;
  }

  // ---- formations ----

  // Where slot k stands, from the front centre (r.x, r.z); ranks stack behind it.
  // A schiltron is a ring around the anchor instead, each man facing out.
  slotPos(r, k) {
    const T = r.T, F = FORMATIONS[r.formation] || FORMATIONS.line;
    const sp = T.spacing * F.spacing, dp = (T.depth || T.spacing) * F.depth;
    let lx, lz, face = 0;
    if (r.formation === 'square') {
      const ring = this.ringSlot(r, k, sp);
      lx = ring.x; lz = ring.z; face = ring.a;
    } else if (r.formation === 'wedge') {
      const i = Math.floor(Math.sqrt(k)), j = k - i * i;
      lx = (j - i) * sp * 0.75; lz = -i * dp;
    } else {
      const files = Math.max(1, Math.min(r.files, r.alive));
      const rank = Math.floor(k / files), f = k % files;
      const lastRank = Math.floor((r.alive - 1) / files);
      const inRank = rank === lastRank ? r.alive - rank * files : files;
      lx = (f - (inRank - 1) / 2) * sp;
      lz = -rank * dp;
    }
    lz -= T.engineLen || 0;
    const sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    return { x: r.x + cos * lx + sin * lz, z: r.z - sin * lx + cos * lz, face: r.angle + face };
  }

  // Concentric rings, outermost first, sized so three or four rings hold everyone.
  ringSlot(r, k, sp) {
    const n = r.alive;
    if (!r._rings || r._rings.n !== n || r._rings.sp !== sp) {
      let R = sp * 2, rings;
      for (;;) {
        rings = [];
        let total = 0;
        for (let rr = R; rr >= sp * 1.2 && rings.length < 4; rr -= sp) { const c = Math.floor(Math.PI * 2 * rr / sp); rings.push({ r: rr, c }); total += c; }
        if (total >= n) break;
        R += sp * 0.5;
      }
      r._rings = { n, sp, rings };
    }
    let i = k;
    for (const ring of r._rings.rings) {
      if (i < ring.c) {
        const a = i / ring.c * Math.PI * 2;
        return { x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r - ring.r, a };
      }
      i -= ring.c;
    }
    return { x: 0, z: 0, a: 0 };
  }

  // Frontmost soldiers take the front rank, so reforming never sends men across the block.
  assignSlots(r) {
    const list = r.soldiers.filter(s => live(s) && !s.captain);
    const sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    for (const s of list) {
      const dx = s.x - r.x, dz = s.z - r.z;
      s._f = dx * sin + dz * cos;
      s._l = dx * cos - dz * sin;
    }
    list.sort((a, b) => b._f - a._f);
    const files = Math.max(1, Math.min(r.files, list.length));
    for (let i = 0; i < list.length; i += files) {
      const rank = list.slice(i, i + files).sort((a, b) => a._l - b._l);
      rank.forEach((s, j) => { s.slot = i + j; });
    }
    r.alive = list.length;
  }

  // ---- squeezing through a gap ----
  //
  // A regiment marching through a gate, breach or bridge narrower than its front keeps its
  // formation. Only the men who meet the gap change step: the files that fit walk straight
  // through, and the outer files fall in behind them, rank by rank, the middle men first.
  // Past the gap each man goes back to his own place, so the block fills out again from
  // the front. A pinch is { key, x, z, ux, uz (the way through), tx, tz (across), len, half }.

  // Finds the gap the regiment is passing, if one is too narrow for it, and lines up its men.
  pinchFor(r) {
    const old = r.pinch;
    // Men still on their way through keep the gap they started at.
    if (old && r.soldiers.some(s => live(s) && !s.captain && s.pinchOf === old && s.pPassed !== old && this.pinchU(old, this.slotPos(r, s.slot)) > -old.len)) {
      this.pinchLanes(r, old);
      return;
    }
    const P = this.findPinch(r);
    r.pinch = P && this.pinchLanes(r, P) ? P : null;
  }

  pinchU(P, p) { return (p.x - P.x) * P.ux + (p.z - P.z) * P.uz; }
  pinchAt(P, u, v) { return { x: P.x + P.ux * u + P.tx * v, z: P.z + P.uz * u + P.tz * v }; }

  findPinch(r) {
    const A = { x: r.x, z: r.z }, C = { x: r.cx, z: r.cz }, D = r.dest, V = r.via;
    let best = null, bd = Infinity;
    // Which way a stretch of the march goes through a frame's line, if it does so within `w` of its middle.
    const through = (c, ux, uz, tx, tz, w) => {
      for (const [P, Q] of [[C, A], [A, V], [A, D]]) {
        if (!P || !Q) continue;
        const uP = (P.x - c.x) * ux + (P.z - c.z) * uz, uQ = (Q.x - c.x) * ux + (Q.z - c.z) * uz;
        if ((uP < 0) === (uQ < 0)) continue;
        const vP = (P.x - c.x) * tx + (P.z - c.z) * tz, vQ = (Q.x - c.x) * tx + (Q.z - c.z) * tz;
        if (Math.abs(vP + (vQ - vP) * uP / (uP - uQ)) < w) return uQ > uP ? 1 : -1;
      }
      return 0;
    };
    if (this.nav.any) {
      for (const p of this.walls.pieces) {
        if (!(p.state === 'broken' || (p.gate && p.state === 'up' && (p.side === r.side || p.forced)))) continue;
        const len = Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z) || 1, tx = (p.b.x - p.a.x) / len, tz = (p.b.z - p.a.z) / len;
        const ux = -tz, uz = tx, c = { x: p.x, z: p.z };
        const uA = (A.x - c.x) * ux + (A.z - c.z) * uz, vA = (A.x - c.x) * tx + (A.z - c.z) * tz;
        if (Math.abs(uA) > 30 || Math.abs(vA) > len / 2 + 25 || Math.abs(uA) >= bd) continue;
        const dir = through(c, ux, uz, tx, tz, len / 2 + 3);
        if (!dir) continue;
        // How wide the way through really is: walk the wall's line out from the middle till it is blocked.
        let lo = 0, hi = 0;
        while (lo < len / 2 + 3 && !this.nav.blockedAt(r.side, c.x - tx * (lo + 0.25), c.z - tz * (lo + 0.25))) lo += 0.25;
        while (hi < len / 2 + 3 && !this.nav.blockedAt(r.side, c.x + tx * (hi + 0.25), c.z + tz * (hi + 0.25))) hi += 0.25;
        const mid = (hi - lo) / 2;
        bd = Math.abs(uA);
        best = { key: p, x: c.x + tx * mid, z: c.z + tz * mid, ux: ux * dir, uz: uz * dir, tx: tx * dir, tz: tz * dir,
          len: p.M.thick / 2 + 1.8, half: Math.max(0.3, (lo + hi) / 2 - 0.6) };
      }
    }
    const R = this.river;
    if (R && !best) {
      for (const c of R.crossings()) {
        if (Math.abs(A.x - c.x) > c.ref.half + 10) continue;
        const z = R.zAt(c.x), k = Math.sqrt(1 + R.slope(c.x) ** 2), tx = 1 / k, tz = R.slope(c.x) / k;
        const ux = -tz, uz = tx, at = { x: c.x, z };
        if (Math.abs(R.across(A.x, A.z)) > R.half + 30) continue;
        const dir = through(at, ux, uz, tx, tz, c.ref.half + 4);
        if (!dir || Math.abs(A.x - c.x) >= bd) continue;
        bd = Math.abs(A.x - c.x);
        best = { key: c.ref, x: c.x, z, ux: ux * dir, uz: uz * dir, tx: tx * dir, tz: tz * dir, len: R.half + 3, half: c.ref.half - 1.2 };
      }
    }
    return best;
  }

  // Shares the men out among the lanes the gap has room for, each lane in the order they go
  // through: front rank first, and within a rank the men nearest the middle. False if the
  // whole front fits anyway.
  pinchLanes(r, P) {
    const T = r.T, F = FORMATIONS[r.formation] || FORMATIONS.line, sp = T.spacing * F.spacing;
    const G = Math.max(1, Math.floor(2 * P.half / sp) + 1), sin = Math.sin(r.angle), cos = Math.cos(r.angle);
    const flip = cos * P.tx - sin * P.tz < 0 ? -1 : 1;
    const list = r.soldiers.filter(s => live(s) && !s.captain);
    let wide = 0;
    for (const s of list) {
      const q = this.slotPos(r, s.slot), dx = q.x - r.x, dz = q.z - r.z;
      s._l = dx * cos - dz * sin;
      s._f = dx * sin + dz * cos;
      wide = Math.max(wide, Math.abs(s._l));
    }
    if (wide <= P.half + 0.1 && P !== r.pinch) return false;
    const lanes = Array.from({ length: G }, () => []);
    for (const s of list) {
      const j = Math.max(0, Math.min(G - 1, Math.round(s._l / sp + (G - 1) / 2)));
      s.pinchOf = P;
      s.pPos = (G === 1 ? 0 : Math.max(-P.half, Math.min(P.half, (j - (G - 1) / 2) * sp))) * flip;
      s.pL = s._l * flip;                       // his file, across the gap
      s.pRank = Math.round(-s._f * 2);          // his rank, by how far back it stands
      s._k = s.pRank * 100 + Math.abs(s._l);
      lanes[j].push(s);
    }
    for (const l of lanes) l.sort((a, b) => a._k - b._k);
    P.lanes = lanes;
    P.share = Math.min(1, G / Math.max(1, Math.min(r.files, list.length)));
    return true;
  }

  // Each frame: which ranks still wait before the gap, and how many men of his own rank wait
  // ahead of each man in his lane.
  queuePinch(r) {
    const P = r.pinch, waiting = new Set();
    let left = 0;
    for (const lane of P.lanes) for (const s of lane) {
      s.pIn = false;
      if (!live(s) || s.pPassed === P) continue;
      const u = this.pinchU(P, s);
      if (u >= P.len) { s.pPassed = P; continue; }
      // Bound through: his place is in or past the gap.
      if (this.pinchU(P, this.slotPos(r, s.slot)) <= -P.len) continue;
      s.pIn = true;
      left++;
      s.pWaiting = u < -P.len + 0.3 && !s.target;
      if (s.pWaiting) waiting.add(s.pRank);
    }
    const ranks = [...waiting].sort((a, b) => a - b);
    for (const lane of P.lanes) {
      const seen = new Map();
      for (const s of lane) {
        if (!s.pIn) continue;
        s.pWait = Math.max(0, ranks.indexOf(s.pRank));
        s.pAhead = seen.get(s.pRank) || 0;
        if (s.pWaiting) seen.set(s.pRank, s.pAhead + 1);
      }
    }
    P.left = left;
    if (!left && this.pinchU(P, { x: r.cx, z: r.cz }) > 0) r.pinch = null;
  }

  // The front walks on past the gap only as fast as men come through it to fill out behind.
  pinchPace(r) {
    const P = r.pinch;
    return P.left && this.pinchU(P, r) > P.len ? Math.max(0.25, P.share) : 1;
  }

  // Where a man bound through the gap heads. The ranks behind stand in their files, a rank's
  // depth back from it for each rank still waiting in front. The front rank closes in on its
  // lanes as its turn comes, the men nearest the middle first, and each in turn walks
  // straight through. Once through he steps out to the side, along the far face of the wall
  // or the far bank, until his place has come clear of the gap; then he goes to it.
  pinchGoal(s, slot) {
    const P = s.reg.pinch;
    if (s.pinchOf !== P) return null;
    if (s.pPassed === P) {
      const su = this.pinchU(P, slot);
      if (su <= -P.len || su >= P.len + 1.5) return null;
      const p = this.pinchAt(P, P.len + 1.5, (slot.x - P.x) * P.tx + (slot.z - P.z) * P.tz);
      return { x: p.x, z: p.z, perch: null, face: slot.face };
    }
    if (!s.pIn) return null;
    const u = this.pinchU(P, s), v = (s.x - P.x) * P.tx + (s.z - P.z) * P.tz;
    const dp = (s.reg.T.depth || s.reg.T.spacing) * (FORMATIONS[s.reg.formation] || FORMATIONS.line).depth;
    const front = s.pWait === 0;
    if (u > -P.len + 0.3 || (front && s.pAhead === 0 && u > -P.len - 1.5 && Math.abs(v - s.pPos) < 0.6)) {
      const p = this.pinchAt(P, P.len + 1.5, s.pPos);
      return { x: p.x, z: p.z, perch: null };
    }
    // He starts closing in early enough to be there when his turn comes.
    const K = Math.max(1, Math.abs(s.pL - s.pPos) / (dp * 1.5));
    const lat = front ? s.pPos + (s.pL - s.pPos) * Math.min(1, s.pAhead / K) : s.pL;
    // Up to his rank's place, but no stepping back to it.
    const at = Math.min(-P.len, Math.max(u, -P.len - s.pWait * dp));
    const p = this.pinchAt(P, at, lat);
    return { x: p.x, z: p.z, perch: null, face: Math.atan2(P.ux, P.uz) };
  }

  // ---- orders ----

  usable(r) { return !r.gone && !r.routing && !r.regrouping; }

  // The middle of a side's walls: where "inside" is. Usually its home, but a garrison
  // that flees out of the far side of its town has a home apart from its walls.
  fortHome(side) { return this.walls.centre[side] || this.homes[side]; }

  // Any new order takes a regiment off the walls and off whatever wall it was attacking.
  clearPosts(r) {
    if (r.posts) this.walls.release(r);
    r.posts = null;
    r.access = null;
    r.targetWall = null;
  }

  // ---- deployment ----

  // A short deployment before a battle: time stands still while `side` places its
  // regiments anywhere on its own ground (around where they stand, short of the enemy),
  // sets formations and picks targets. beginBattle() starts the fight.
  // A storm passes its own ground instead: from `at` (the place stormed) out along the
  // road it came by (`toward`, an angle), `near` to `far` metres out and `width` either
  // side, and a `limit` of seconds after which the assault goes in anyway.
  startDeployment(side = 0, { at = null, toward = 0, near = 0, far = 0, width = 80, limit = 0 } = {}) {
    const mine = this.regs.filter(r => r.side === side && !r.gone), theirs = this.regs.filter(r => r.side !== side && !r.gone);
    if (!mine.length || !theirs.length) return;
    if (at) {
      this.deploying = { side, frame: { x: at.x, z: at.z, a: toward }, x0: -width, x1: width, z0: near, z1: far, limit, waited: 0 };
      // Stand them side by side in the middle of it, facing in.
      const mid = this.zoneToWorld(0, (near + far) / 2);
      this.orderMove(mine, mid.x, mid.z, toward + Math.PI);
      this.updateSight();
      return;
    }
    const dir = Math.sign(theirs.reduce((n, r) => n + r.z, 0) / theirs.length - mine.reduce((n, r) => n + r.z, 0) / mine.length) || -1;
    const zs = mine.map(r => r.z), xs = mine.map(r => Math.abs(r.x));
    const front = dir < 0 ? Math.min(...zs) : Math.max(...zs), back = dir < 0 ? Math.max(...zs) : Math.min(...zs);
    const foe = dir < 0 ? Math.max(...theirs.map(r => r.z)) : Math.min(...theirs.map(r => r.z));
    // Forward up to 25 m, but never past a point well short of the enemy's front.
    const fore = dir < 0 ? Math.max(front - 25, foe + 70) : Math.min(front + 25, foe - 70);
    const rear = Math.max(-HALF + 10, Math.min(HALF - 10, back - dir * 45));
    const w = Math.min(HALF - 10, Math.max(120, Math.max(...xs) + 60));
    this.deploying = { side, x0: -w, x1: w, z0: Math.min(fore, rear), z1: Math.max(fore, rear) };
    this.updateSight();
  }

  // The deployment ground's own frame: x across, z out from the place stormed (or the
  // map's own axes for a field battle).
  zoneLocal(x, z) {
    const F = this.deploying?.frame;
    if (!F) return { x, z };
    const dx = x - F.x, dz = z - F.z, c = Math.cos(F.a), s = Math.sin(F.a);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }
  zoneToWorld(lx, lz) {
    const F = this.deploying?.frame;
    if (!F) return { x: lx, z: lz };
    const c = Math.cos(F.a), s = Math.sin(F.a);
    return { x: F.x + lx * c + lz * s, z: F.z - lx * s + lz * c };
  }

  inZone(x, z) {
    const D = this.deploying;
    if (!D) return false;
    const p = this.zoneLocal(x, z);
    return p.x >= D.x0 && p.x <= D.x1 && p.z >= D.z0 && p.z <= D.z1;
  }

  beginBattle() {
    if (!this.deploying) return;
    const side = this.deploying.side;
    this.deploying = null;
    this.event(side, 'The battle begins!');
  }

  // A regiment set down at once at its destination, formed up, the whole block inside the zone.
  placeNow(r) {
    const D = this.deploying, d = r.dest;
    r.x = d.x; r.z = d.z; r.angle = d.angle;
    r.dest = null; r.via = null; r.pinch = null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const s of r.soldiers) {
      if (!live(s) || s.captain) continue;
      const q = this.slotPos(r, s.slot), p = this.zoneLocal(q.x, q.z);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const shift = (lo, hi, a, b) => hi - lo > b - a ? (a + b - lo - hi) / 2 : Math.max(0, a - lo) - Math.max(0, hi - b);
    const sx = shift(x0, x1, D.x0, D.x1), sz = shift(z0, z1, D.z0, D.z1);
    const o = this.zoneToWorld(0, 0), m = this.zoneToWorld(sx, sz);
    r.x += m.x - o.x; r.z += m.z - o.z;
    let cx = 0, cz = 0, n = 0;
    const put = (s, p) => {
      s.x = s.lx = p.x; s.z = s.lz = p.z; s.v = s.vx = s.vz = 0;
      s.y = this.river ? this.groundY(s.x, s.z) : this.heightAt(s.x, s.z);
    };
    for (const s of r.soldiers) {
      if (!live(s) || s.captain) continue;
      const p = this.slotPos(r, s.slot);
      put(s, p); s.yaw = p.face;
      cx += s.x; cz += s.z; n++;
    }
    if (n) { r.cx = cx / n; r.cz = cz / n; }
    const cap = r.soldiers.find(s => s.captain && live(s));
    if (cap) { put(cap, this.goalOf(cap)); cap.yaw = r.angle; }
  }

  // Place the regiments side by side along a front line centred on (x, z), facing `angle`.
  orderMove(regs, x, z, angle, width = null) {
    regs = regs.filter(r => this.usable(r));
    if (!regs.length) return;
    for (const r of regs) this.clearPosts(r);
    const gap = 4;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    if (width) {
      const total = regs.reduce((n, r) => n + r.alive, 0);
      for (const r of regs) {
        const share = Math.max(4, (width - gap * (regs.length - 1)) * r.alive / total);
        r.files = Math.max(r.T.engine ? 1 : 4, Math.min(r.alive, Math.round(share / r.T.spacing) + 1));
      }
    }
    // Keep the regiments in their current left-to-right order relative to the new facing.
    regs.sort((a, b) => ((a.cx - x) * cos - (a.cz - z) * sin) - ((b.cx - x) * cos - (b.cz - z) * sin));
    // Over a river, the line keeps to the bank its middle stands on (or the army does, if
    // its middle is in the water); see keepDry.
    const R = this.river, mid = R && Math.abs(R.across(x, z)) > R.half + 1 ? { x, z } : regs.length && { x: regs.reduce((n, r) => n + r.cx, 0) / regs.length, z: regs.reduce((n, r) => n + r.cz, 0) / regs.length };
    const bank = R ? R.bank(mid.x, mid.z) : 0;
    const widths = regs.map(r => (Math.min(r.files, r.alive) - 1) * r.T.spacing + 2);
    const span = widths.reduce((a, b) => a + b, 0) + gap * (regs.length - 1);
    let lx = -span / 2;
    regs.forEach((r, i) => {
      const off = lx + widths[i] / 2;
      lx += widths[i] + gap;
      r.dest = { x: x + cos * off, z: z - sin * off, angle };
      if (R && !r.T.engine) this.keepDry(r, bank);
      r.targetReg = null;
      r.viaCd = 0;
      this.reform(r);
      if (this.deploying?.side === r.side) this.placeNow(r);
    });
    if (this.deploying) this.updateSight();
  }

  // A regiment's place in a line that strays over a river: if any of its block would stand
  // in the water or across it, it steps back (or forward), square to the line, onto dry
  // ground on the line's own bank. A long line drawn along a winding river then bends
  // with the bank instead of sending a few regiments wading, or over a bridge in column.
  keepDry(r, bank) {
    const R = this.river, d = r.dest, T = r.T;
    const files = Math.max(1, Math.min(r.files, r.alive)), w = (files - 1) * T.spacing / 2 + 1.5;
    const back = (Math.ceil(r.alive / files) - 1) * (T.depth || T.spacing) + 1.5;
    const sin = Math.sin(d.angle), cos = Math.cos(d.angle);
    const dry = (x, z) => [[-w, 1.5], [w, 1.5], [-w, -back], [w, -back], [0, -back / 2]].every(([lx, lz]) => {
      const px = x + cos * lx + sin * lz, pz = z - sin * lx + cos * lz;
      return R.bank(px, pz) === bank && Math.abs(R.across(px, pz)) > R.half + 2;
    });
    if (dry(d.x, d.z)) return;
    for (let k = 2; k <= 120; k += 2) {
      for (const s of [1, -1]) {
        const nx = d.x + sin * k * s, nz = d.z + cos * k * s;
        if (dry(nx, nz)) { d.x = nx; d.z = nz; return; }
      }
    }
  }

  // Slots are assigned against the destination so each soldier walks to the nearest place.
  reform(r) {
    const { x, z, angle } = r;
    if (r.dest) { r.x = r.dest.x; r.z = r.dest.z; r.angle = r.dest.angle; }
    this.assignSlots(r);
    r.x = x; r.z = z; r.angle = angle;
  }

  // The formation outline as it will stand at its destination, for previews.
  plannedSlots(regs, x, z, angle, width) {
    const saved = regs.map(r => ({ r, dest: r.dest, files: r.files, targetReg: r.targetReg, posts: r.posts, access: r.access, targetWall: r.targetWall, slots: r.soldiers.map(s => s.slot) }));
    const claims = regs.map(r => r.posts && r.posts.map(p => [p, p.perch.claims.get(p.i)]));
    // A preview must not give up anyone's posts, so stash them first.
    for (const r of regs) r.posts = null;
    this.orderMove(regs, x, z, angle, width);
    const plan = regs.filter(r => r.dest).map(r => ({ r, ...r.dest, files: r.files }));
    saved.forEach((s, i) => {
      Object.assign(s.r, { dest: s.dest, files: s.files, targetReg: s.targetReg, posts: s.posts, access: s.access, targetWall: s.targetWall });
      s.r.soldiers.forEach((o, j) => { o.slot = s.slots[j]; });
      if (claims[i]) for (const [p, owner] of claims[i]) p.perch.claims.set(p.i, owner);
    });
    return plan;
  }

  orderAttack(regs, target) {
    for (const r of regs) {
      if (!this.usable(r) || target.side === r.side) continue;
      this.clearPosts(r);
      r.targetReg = target;
      r.dest = null;
    }
  }

  orderHalt(regs) {
    for (const r of regs) {
      if (!this.usable(r) || r.posts) continue;
      r.dest = null;
      r.targetReg = null;
      r.targetWall = null;
      r.x = r.cx; r.z = r.cz;
      this.assignSlots(r);
    }
  }

  setFormation(regs, f) {
    for (const r of regs) {
      if (!this.usable(r) || r.T.engine || r.posts) continue;
      if (f === 'square' && r.T.mounted) continue;
      if (r.formation === f) continue;
      // A schiltron forms round the middle of the block; other shapes keep the front where it was.
      if (f === 'square') { r.x = r.cx; r.z = r.cz; if (r.dest) r.dest = { ...r.dest }; }
      else if (r.formation === 'square') { r.x = r.cx + Math.sin(r.angle) * 4; r.z = r.cz + Math.cos(r.angle) * 4; }
      r.formation = f;
      r._rings = null;
      this.assignSlots(r);
    }
  }

  setHold(regs, on) { for (const r of regs) r.hold = on; }
  setFireAtWill(regs, on) { for (const r of regs) r.fireAtWill = on; }

  // Charge: at the ordered target, or the nearest enemy ahead. Horse and foot both hit harder for it.
  orderCharge(regs) {
    for (const r of regs) {
      if (!this.usable(r) || r.T.engine || this.shoots(r)) continue;
      let t = r.targetReg && !r.targetReg.gone ? r.targetReg : null;
      if (!t) {
        let bd = 90;
        for (const o of this.regs) {
          if (o.side === r.side || o.gone || o.routing) continue;
          const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
          const ahead = Math.abs(angleDiff(Math.atan2(o.cx - r.cx, o.cz - r.cz), r.angle)) < 1.2;
          if (ahead && d < bd) { bd = d; t = o; }
        }
      }
      if (!t) continue;
      this.orderAttack([r], t);
      r.chargeUntil = this.time + 10;
      r.charges = (r.charges || 0) + 1;
      for (const s of r.soldiers) s.charged = false;
    }
  }

  // ---- walls: manning, attacking, ladders ----

  // Send regiments onto a stretch of wall (their own, or an enemy's by their ladders).
  // Each soldier takes a post along the walkway, spreading out from where you clicked.
  orderMan(regs, struct, x, z) {
    const owner = struct.side, home = this.fortHome(owner);
    let start = struct;
    for (const r of regs) {
      if (!this.usable(r) || r.T.mounted || r.T.engine) continue;
      if (start.state !== 'up') continue;
      const access = this.accessUp(r.side, start).filter(a => this.nav.reachable(r.side, r.cx, r.cz, a.ground.x, a.ground.z));
      if (!access.length) { if (r.side === 0) this.event(0, owner === r.side ? 'No tower, gate or stair leads up to that wall.' : 'Raise ladders against that wall first.'); continue; }
      this.clearPosts(r);
      r.dest = null; r.targetReg = null;
      const men = r.soldiers.filter(s => live(s) && !s.captain).length;
      const posts = this.walls.claimPosts(r, start, x, z, men, home);
      if (!posts.length) continue;
      r.access = access;
      r.x = posts.reduce((n, p) => n + p.x, 0) / posts.length;
      r.z = posts.reduce((n, p) => n + p.z, 0) / posts.length;
      const out = posts[0].perch.kind === 'tower' ? { x: posts[0].x - home.x, z: posts[0].z - home.z } : this.walls.outward(posts[0].perch, home);
      r.angle = Math.atan2(out.x, out.z) + (owner === r.side ? 0 : Math.PI);
      // The nearest soldiers take the nearest posts.
      const list = r.soldiers.filter(s => live(s) && !s.captain);
      const order = posts.map((p, i) => i);
      list.sort((a, b) => Math.hypot(a.x - posts[0].x, a.z - posts[0].z) - Math.hypot(b.x - posts[0].x, b.z - posts[0].z));
      list.forEach((s, i) => { s.slot = order[i] ?? i; });
      r.alive = list.length;
      // Several regiments sent together fill the wall one after another.
      start = posts.at(-1).perch;
      x = posts.at(-1).x; z = posts.at(-1).z;
    }
  }

  // Ways up onto the wall network that contains `struct`, for one side:
  // its own towers and gates, and its own ladders.
  accessUp(side, struct) {
    const out = [];
    const net = this.network(struct);
    for (const s of net) {
      if (s.state !== 'up') continue;
      // Any tower's stairs, from inside; an enemy's only once you are in.
      if (s.kind === 'tower') out.push({ kind: 'tower', ground: this.towerFoot(s, side), top: { x: s.x, z: s.z, perch: s } });
      if (s.side === side && s.gate) out.push({ kind: 'gate', ground: { x: s.x, z: s.z }, top: { x: s.x, z: s.z, perch: s } });
    }
    for (const l of this.walls.ladders) if (l.side === side && net.has(l.piece)) out.push({ kind: 'ladder', ladder: l, ground: l.foot, top: { x: l.x, z: l.z, perch: l.piece } });
    return out;
  }

  // Ways down from the walls for a soldier of `side`: any tower (its stairs run inside),
  // its own gates, and its own ladders (back outside).
  accessDown(side, perch) {
    const out = [];
    const net = this.network(perch);
    for (const s of net) {
      if (s.state !== 'up') continue;
      if (s.kind === 'tower') out.push({ kind: 'tower', ground: this.towerFoot(s, side), top: { x: s.x, z: s.z, perch: s } });
      if (s.side === side && s.gate) out.push({ kind: 'gate', ground: { x: s.x, z: s.z }, top: { x: s.x, z: s.z, perch: s } });
    }
    for (const l of this.walls.ladders) if (l.side === side && net.has(l.piece)) out.push({ kind: 'ladder', ladder: l, ground: l.foot, top: { x: l.x, z: l.z, perch: l.piece } });
    return out;
  }

  // Where men step on and off a tower's stairs: at its inner foot, toward its owner's home.
  towerFoot(t, side) {
    const h = this.fortHome(t.side), dx = h.x - t.x, dz = h.z - t.z, d = Math.hypot(dx, dz) || 1;
    return { x: t.x + dx / d * (t.M.towerR + 2), z: t.z + dz / d * (t.M.towerR + 2) };
  }

  // Every standing piece and tower joined to this one along the walkway.
  network(struct) {
    if (struct._net && struct._netV === this.walls.version) return struct._net;
    const seen = new Set([struct]), q = [struct];
    while (q.length) {
      const s = q.pop();
      for (const o of this.walls.neighbours(s)) if (!seen.has(o) && o.state === 'up') { seen.add(o); q.push(o); }
    }
    for (const s of seen) { s._net = seen; s._netV = this.walls.version; }
    return seen;
  }

  // Attack a wall, gate, tower or building. Engines work it; ladder men raise ladders;
  // foot soldiers climb friendly ladders nearby, or hack at it (wood and gates give way, stone barely).
  orderAttackWall(regs, struct, x, z) {
    for (const r of regs) {
      if (!this.usable(r) || struct.side === r.side) continue;
      const E = r.engine;
      if (E?.kind === 'ladder' && !E.ladders.length) {
        if (!struct.wall || struct.kind !== 'piece' || struct.gate) { if (r.side === 0) this.event(0, 'Ladders go against a stretch of wall, not a gate or tower.'); continue; }
        this.clearPosts(r); r.dest = null; r.targetReg = null;
        r.targetWall = struct; r.wallPoint = { x, z };
        continue;
      }
      if (!E && struct.wall && struct.kind === 'piece' && !r.T.mounted) {
        const ladder = this.walls.ladders.find(l => l.side === r.side && this.network(l.piece).has(struct)
          && Math.hypot(l.x - x, l.z - z) < 60);
        if (ladder) { this.orderMan([r], ladder.piece, ladder.x, ladder.z); continue; }
        // Swords barely mark stone: say so once, the first time men are sent at it bare-handed.
        if (r.side === 0 && struct.M.melee < 0.1 && !this.saidStone) { this.saidStone = true; this.event(0, 'Swords do little against stone. Raise ladders, bring a ram, or break it with stones first.'); }
      }
      this.clearPosts(r);
      r.dest = null; r.targetReg = null;
      r.targetWall = struct; r.wallPoint = { x, z };
      if (E) E.ready = 0;
    }
  }

  // A point on a structure's outer face for soldier k of n to stand and strike at.
  faceSpot(r, struct, k, n) {
    const home = this.fortHome(struct.side);
    if (struct.wall && struct.kind === 'piece') {
      const out = this.walls.outward(struct, home);
      const w = struct.gate ? 0.5 : 0.8;
      const t = n <= 1 ? 0.5 : 0.5 - w / 2 + w * (k % Math.max(1, Math.floor(struct.len / 1.2))) / Math.max(1, Math.floor(struct.len / 1.2) - 1);
      const rank = Math.floor(k / Math.max(1, Math.floor(struct.len / 1.2)));
      const off = struct.M.thick / 2 + 1 + rank * 1.2;
      return { x: struct.a.x + (struct.b.x - struct.a.x) * t + out.x * off, z: struct.a.z + (struct.b.z - struct.a.z) * t + out.z * off };
    }
    const R = struct.wall ? struct.M.towerR : struct.B.radius;
    const base = Math.atan2(r.cx - struct.x, r.cz - struct.z);
    const a = base + ((k % 12) - 5.5) * 0.18, rr = R + 1.2 + Math.floor(k / 12) * 1.2;
    return { x: struct.x + Math.sin(a) * rr, z: struct.z + Math.cos(a) * rr };
  }

  structGone(s) { return !s || s.removed || s.state === 'broken' || s.state === 'ruined' || (!s.wall && s.hp <= 0); }

  hitStructure(s, dmg, kind) {
    if (s.wall) return this.walls.damage(s, dmg, kind);
    // A town building: stone and rams knock it about; swords do little.
    if (s.state === 'ruined' || s.removed) return false;
    s.hp -= dmg * (kind === 'melee' ? 0.3 : 0.6);
    if (s.hp <= 0) { s.hp = 0; this.onRuin?.(s); return true; }
    return false;
  }

  onWallBreak(s) {
    const what = s.kind === 'tower' ? 'tower' : s.gate ? 'gate' : 'wall';
    this.event(s.side, `${s.side === 0 ? 'Our' : 'The enemy'} ${what} has been broken!`);
    audio.play('gate', s, this); // audio
    // Men on it come down with it.
    for (const o of this.soldiers) {
      if (!live(o) || o.perch !== s) continue;
      o.level = 0; o.perch = null; o.climb = 0; o.route = null;
      o.y = this.heightAt(o.x, o.z);
      this.hurt(o, 5);
    }
    // Regiments posted along it look for posts again, or stand down where they are.
    for (const r of this.regs) {
      if (!r.posts || !r.posts.some(p => p.perch === s)) continue;
      const keep = r.posts.find(p => p.perch !== s && p.perch.state === 'up');
      if (keep) this.orderMan([r], keep.perch, keep.x, keep.z);
      else { this.clearPosts(r); r.x = r.cx; r.z = r.cz; this.assignSlots(r); }
    }
  }

  // ---- siege extras: boiling oil, mines, terms, hunger ----

  // Men up on a gate or tower pour boiling oil on whoever is at its foot, every 20 s:
  // a scald that gets under a ram's roof and shakes the men it falls on.
  pourOil() {
    const manned = new Map();
    for (const s of this.soldiers) {
      const p = s.perch;
      if (!live(s) || s.level !== 1 || !p || p.side !== s.reg.side || p.state !== 'up' || !(p.gate || p.kind === 'tower')) continue;
      manned.set(p, s.reg.side);
    }
    for (const [p, side] of manned) {
      if (this.time < (p.oilAt || 0)) continue;
      const home = this.fortHome(side), out = Math.hypot(p.x - home.x, p.z - home.z);
      let at = null, bd = Infinity;
      this.forNear(p.x, p.z, 7, o => {
        if (o.reg.side === side || o.level !== 0 || o.climb > 0) return;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < 7 && Math.hypot(o.x - home.x, o.z - home.z) > out - 1 && d < bd) { bd = d; at = o; }
      });
      if (!at) continue;
      p.oilAt = this.time + 20;
      const x = at.x, z = at.z, shaken = new Set();
      this.forNear(x, z, 3.5, o => {
        if (o.reg.side === side || o.level !== 0 || Math.hypot(o.x - x, o.z - z) > 3.2) return;
        shaken.add(o.reg);
        this.hurt(o, 9, null);
      });
      for (const r of shaken) { r.morale -= 6; if (r.engine?.maxHp) r.engine.hp -= 40; }
      this.pours.push({ x, z, y: this.heightAt(x, z), time: this.time });
      if (this.pours.length > 20) this.pours.shift();
      if (!(this.oiled ||= [false, false])[side]) { this.oiled[side] = true; this.event(side, side ? 'Boiling oil pours down from the walls!' : 'Our men pour boiling oil on the attackers!'); }
    }
  }

  // Attackers dig under a stretch of wall from a sap 45 m out; when the mine is done the
  // stretch and its neighbours come down. A third of the way in, the defenders hear it and
  // can dig a counter-mine from inside to break into it first.
  orderMine(regs, piece) {
    regs = regs.filter(r => this.usable(r) && !r.engine && !r.T.mounted && r.side !== piece.side);
    if (!regs.length || piece.state !== 'up' || !piece.wall) return null;
    const side = regs[0].side;
    let m = this.mines.find(m => m.piece === piece && m.side === side && !m.done && !m.lost);
    const home = this.fortHome(piece.side), dx = piece.x - home.x, dz = piece.z - home.z, d = Math.hypot(dx, dz) || 1;
    if (!m) {
      m = { side, piece, x: piece.x + dx / d * 45, z: piece.z + dz / d * 45, ix: piece.x - dx / d * 10, iz: piece.z - dz / d * 10, progress: 0, counter: 0, heard: false, done: false, lost: false };
      this.mines.push(m);
      this.event(side, side ? 'The enemy is digging somewhere outside the walls.' : 'Our men start digging a mine.');
    }
    this.orderMove(regs, m.x, m.z, Math.atan2(-dx, -dz));
    for (const r of regs) { r.mine = m; r.mineAt = r.dest && { x: r.dest.x, z: r.dest.z }; }
    return m;
  }

  // Defenders dig toward a mine they have heard, from inside the wall.
  orderCounterMine(regs, m) {
    regs = regs.filter(r => this.usable(r) && !r.engine && !r.T.mounted && r.side !== m.side);
    if (!regs.length || m.done || m.lost) return;
    this.orderMove(regs, m.ix, m.iz, Math.atan2(m.x - m.ix, m.z - m.iz));
    for (const r of regs) { r.mine = m; r.mineAt = r.dest && { x: r.dest.x, z: r.dest.z }; }
  }

  // The nearest mine `side` has heard under its own walls.
  heardMine(side, x = 0, z = 0) {
    let best = null, bd = Infinity;
    for (const m of this.mines) {
      if (m.side === side || !m.heard || m.done || m.lost) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  minesTick() {
    if (!this.mines.length) return;
    const work = new Map(), counter = new Map();
    for (const r of this.regs) {
      const m = r.mine;
      if (!m) continue;
      if (m.done || m.lost || !this.usable(r) || r.targetReg || r.posts || r.targetWall) { r.mine = null; continue; }
      // Each regiment works from its own place along the sap (where it was sent).
      const own = m.side === r.side, at = r.mineAt || (own ? m : { x: m.ix, z: m.iz });
      if (r.dest && Math.hypot(r.dest.x - at.x, r.dest.z - at.z) > 3) { r.mine = null; continue; }
      if (r.dest || r.engaged > 0 || Math.hypot(r.x - at.x, r.z - at.z) > 6) continue;
      (own ? work : counter).set(m, ((own ? work : counter).get(m) || 0) + r.alive);
    }
    for (const m of this.mines) {
      if (m.done || m.lost) continue;
      if (m.piece.state !== 'up') { m.lost = true; continue; }
      m.progress = Math.min(1, m.progress + (work.get(m) || 0) / MINE_WORK);
      if (m.heard) m.counter += counter.get(m) || 0;
      if (!m.heard && m.progress > 0.35) {
        m.heard = true;
        this.event(1 - m.side, m.side ? 'Digging is heard under our wall! Send men to counter-mine (U).' : 'The defenders have heard our mine.');
      }
      if (m.counter >= COUNTER_WORK) {
        // The counter-miners break in: a fight in the dark, and the mine is lost.
        m.lost = true;
        const miners = this.regs.filter(r => r.mine === m && r.side === m.side);
        for (const r of miners) {
          let n = Math.ceil(r.alive * 0.25);
          for (const s of r.soldiers) if (n > 0 && live(s) && !s.captain) { this.kill(s); n--; }
          r.morale -= 15; r.mine = null;
        }
        for (const r of this.regs) if (r.mine === m) r.mine = null;
        this.event(1 - m.side, m.side ? 'Our counter-miners broke into the mine and collapsed it!' : 'They broke into our mine; it is lost.');
        continue;
      }
      if (m.progress >= 1) {
        m.done = true;
        const near = this.walls.structures().filter(s => s.side === m.piece.side && s.state === 'up' && Math.hypot(s.x - m.piece.x, s.z - m.piece.z) < 9);
        for (const s of near) this.walls.damage(s, s.hp + 1e4, 'stone');
        for (const r of this.regs) if (r.mine === m) r.mine = null;
        this.event(m.side, m.side ? 'A mine is fired under our wall: it comes down!' : 'Our mine is fired: the wall comes down!');
      }
    }
  }

  // A starving garrison: lower spirits and men who tire fast. h 0 (fed) .. 1 (starving).
  setHunger(side, h) {
    this.hunger[side] = Math.max(0, Math.min(1, h));
    if (h >= 0.3) this.event(side, side ? 'The garrison is starving.' : 'Our men are starving.');
  }

  // A garrison (the side with walls) that can't win asks for terms: few men left against
  // many with the walls breached, or hunger. Only where termsAllowed. onTerms(offer) lets
  // the campaign attach conditions; the player answers with acceptTerms or refuseTerms.
  checkTerms() {
    if (this.terms || this.winner !== null || this.surrendered !== null) return;
    for (const side of [0, 1]) {
      if (!this.walls.structures().some(s => s.side === side)) continue;
      if (this.time < ((this.termsWait ||= [0, 0])[side])) continue;
      const men = k => this.regs.filter(r => r.side === k && this.usable(r)).reduce((n, r) => n + r.alive, 0);
      const mine = men(side), theirs = men(1 - side);
      if (!theirs || !mine) continue;
      const breached = this.walls.pieces.some(p => p.side === side && (p.state === 'broken' || p.forced));
      const h = this.hunger[side], odds = mine / theirs;
      if (odds < 0.2 + h * 0.4 && (breached || h >= 0.5 || odds < 0.1)) {
        this.terms = { side, time: this.time };
        this.event(side, side ? 'The garrison asks for terms.' : 'Our garrison cannot hold: we could yield on terms.');
        this.onTerms?.(this.terms);
        return;
      }
    }
  }

  // The garrison yields and marches out; the battle is won by the other side.
  acceptTerms() {
    const T = this.terms;
    if (!T) return;
    this.terms = null;
    this.surrendered = T.side;
    for (const r of this.regs) if (r.side === T.side && !r.gone) this.disband(r);
    this.winner = 1 - T.side;
    this.event(this.winner, T.side ? 'The garrison yields and marches out.' : 'Our garrison yields and marches out.');
  }

  // Fight on: the garrison takes heart from defiance; no new offer for 90 s.
  refuseTerms() {
    const T = this.terms;
    if (!T) return;
    this.terms = null;
    (this.termsWait ||= [0, 0])[T.side] = this.time + 90;
    for (const r of this.regs) if (r.side === T.side && this.usable(r)) r.morale += 10;
  }

  // ---- captains ----

  // A named captain rides with one regiment (the army's own). Plain data, so armies can save it:
  // { name, level, xp, alive, battles }. He is one more soldier in that regiment, hard to kill.
  setCaptain(side, captain, reg) {
    if (!captain || !captain.alive || !reg || reg.gone) return null;
    const s = this.makeSoldier(reg, -1, reg.angle);
    s.captain = captain;
    s.look = 'captain';
    s.hp = 40 + captain.level * 4;
    s.x = reg.cx - Math.sin(reg.angle) * 6; s.z = reg.cz - Math.cos(reg.angle) * 6;
    s.lx = s.x; s.lz = s.z; s.y = this.heightAt(s.x, s.z);
    reg.soldiers.push(s);
    this.soldiers.push(s);
    reg.captain = captain;
    this.captains[side] = { captain, reg, soldier: s, startXp: captain.xp, died: false };
    return s;
  }

  // Morale and fighting help from a living captain within reach of a regiment.
  captainBonus(r) {
    const c = this.captains[r.side];
    if (!c || c.died || !c.captain.alive) return 0;
    const s = c.soldier;
    if (r === c.reg) return c.captain.level;
    return Math.hypot(s.x - r.cx, s.z - r.cz) < 50 ? c.captain.level * 0.5 : 0;
  }

  captainDied(c) {
    c.died = true;
    c.captain.alive = false;
    this.event(c.reg.side, `${c.reg.side ? 'The enemy captain' : 'Our captain'}, ${c.captain.name}, has fallen!`);
    for (const r of this.regs) if (r.side === c.reg.side && this.usable(r)) r.morale -= 12;
    for (const r of this.regs) if (r.side !== c.reg.side && this.usable(r)) r.morale = Math.min(r.T.morale + 10, r.morale + 6);
    c.reg.captain = null;
  }

  // ---- champion duels ----

  // One side's champion challenges the other to single combat before or during a battle
  // (Dunmore's challenge). champion: { name, level }. The player answers acceptDuel() or
  // refuseDuel(); a challenge from the player is taken up at once. decides: the duel
  // settles the whole battle.
  challenge(side, champion, { decides = false } = {}) {
    if (this.duel || this.winner !== null) return;
    this.duelOffer = { side, champion, decides };
    this.event(0, side ? `${champion.name} challenges you to single combat${decides ? ' to settle the battle' : ''}!` : `${champion.name} challenges the enemy to single combat.`);
    if (side === 0) this.acceptDuel();
  }

  // Who fights for a side: its lord, else its captain, else a champion stepping out of
  // its best foot regiment. Their hurt is real, and so is a fall.
  champion(side, data) {
    const L = this.lords[side], C = this.captains[side];
    if (L && !L.died && live(L.soldier)) return L.soldier;
    if (C && !C.died && live(C.soldier)) return C.soldier;
    const reg = this.regs.filter(r => r.side === side && this.usable(r) && !r.engine && !r.T.range && !r.posts)
      .sort((a, b) => (b.T.atk + defOf(b) + b.vet * 2) - (a.T.atk + defOf(a) + a.vet * 2))[0];
    if (!reg) return null;
    const lvl = data?.level || 2;
    const s = this.makeSoldier(reg, -1, reg.angle);
    s.captain = { name: data?.name || (side ? 'The enemy champion' : 'Our champion'), level: lvl, alive: true, champion: true };
    s.look = 'captain';
    s.hp = 40 + lvl * 6;
    const g = this.goalOf(s);
    s.x = s.lx = g.x; s.z = s.lz = g.z; s.y = this.heightAt(s.x, s.z);
    reg.soldiers.push(s);
    this.soldiers.push(s);
    return s;
  }

  acceptDuel() {
    const O = this.duelOffer;
    if (!O) return;
    this.duelOffer = null;
    const ch = [0, 1].map(side => this.champion(side, side === O.side ? O.champion : null));
    if (!ch[0] || !ch[1]) return;
    const c = side => { const m = this.regs.filter(r => r.side === side && !r.gone); return { x: m.reduce((n, r) => n + r.cx, 0) / m.length, z: m.reduce((n, r) => n + r.cz, 0) / m.length }; };
    const a = c(0), b = c(1);
    this.duel = { a: ch[0], b: ch[1], x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, decides: O.decides, over: false, winner: null, start: this.time };
    // Both come to it whole: hurt counts by skill alone.
    for (const s of ch) { s.duel = this.duel; s.target = null; s.hp = 40 + this.duelLevel(s) * 6; }
    this.event(0, 'The champions ride out; both armies stand and watch.');
  }

  // Refused: the challengers jeer and take heart; the refusers lose a little.
  refuseDuel() {
    const O = this.duelOffer;
    if (!O) return;
    this.duelOffer = null;
    for (const r of this.regs) if (this.usable(r)) r.morale += r.side === O.side ? 6 : -6;
    this.event(0, O.side ? 'You refuse the challenge; the enemy jeers.' : 'The enemy refuses the challenge.');
  }

  duelLevel(c) { return c.captain?.level ?? (c.lordOf !== undefined ? 3 : 2); }

  // A champion walks to the middle, then fights the other one.
  duelStep(s, dt) {
    const D = s.duel, o = D.a === s ? D.b : D.a, side = s.reg.side;
    s.lunge = Math.max(0, s.lunge - dt * 3);
    if (!live(o) || D.over) { s.duel = null; return; }
    const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz) || 1;
    const met = Math.hypot(D.a.x - D.b.x, D.a.z - D.b.z) < 12;
    const spot = met ? { x: o.x - dx / d * 1.8, z: o.z - dz / d * 1.8 } : { x: D.x, z: D.z + (s.z > D.z ? 4 : -4) };
    if (Math.hypot(spot.x - s.x, spot.z - s.z) > 0.3) this.groundMove(s, spot.x, spot.z, s.reg.T.speed * (met ? 1 : 1.2), dt);
    s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt * 6);
    if (!met || d > 2.6 || s.cd > 0) return;
    // Champion against champion: only their own skill counts (a lord is level 3 unless given one).
    const lvl = c => this.duelLevel(c);
    s.cd = 1.2 * (0.8 + this.rand() * 0.4);
    s.lunge = 1;
    s.struckAt = this.time; // anim
    if (this.rand() < 0.5 + (lvl(s) - lvl(o)) * 0.06) {
      audio.play('clash', s, this); // audio
      this.hurt(o, 5 + lvl(s));
    }
  }

  duelTick() {
    const D = this.duel, a = live(D.a), b = live(D.b);
    if (a && b) return;
    D.over = true;
    const won = a ? D.a : D.b, lost = a ? D.b : D.a;
    D.winner = won.reg.side;
    won.duel = null;
    for (const r of this.regs) if (this.usable(r)) r.morale += r.side === D.winner ? 15 : -20;
    this.event(D.winner, `${won.captain?.name || 'The champion'} has won the duel!`);
    if (lost.captain?.champion) lost.captain.alive = false;
    if (D.decides) {
      this.winner = D.winner;
      this.event(D.winner, D.winner === 0 ? 'Victory: the duel settles the battle.' : 'Defeat: the duel settles the battle.');
    }
  }

  // ---- your lord in person ----

  // A side's lord rides with a regiment (usually his household). While he lives every
  // regiment of his fights a little better and holds a little longer, more so near him;
  // if he falls the whole army is shaken. lord: plain data, { name, alive }.
  setLord(side, lord, reg) {
    if (!lord || lord.alive === false || !reg || reg.gone) return null;
    const s = this.makeSoldier(reg, -1, reg.angle);
    s.captain = lord;                  // rides apart from the ranks, like a captain
    s.lordOf = side;
    // A woman lord (lady: true, or a name starting "Lady") has her own model.
    s.look = lord.lady || /^Lady\b/.test(lord.name || '') ? 'lady' : 'lord';
    s.hp = 70;
    // Behind the last rank, where the lord and the bannerman beside him show clearly.
    const g = this.goalOf(s);
    s.x = s.lx = g.x; s.z = s.lz = g.z; s.y = this.heightAt(s.x, s.z);
    reg.soldiers.push(s);
    this.soldiers.push(s);
    this.lords[side] = { lord, reg, soldier: s, died: false };
    this.event(side, side ? `${lord.name} rides with the enemy.` : `${lord.name} takes the field.`);
    return s;
  }

  // 0 with no lord in the field, 1 for his army, 2 within 60 m of him.
  lordBonus(r) {
    const L = this.lords[r.side];
    if (!L || L.died) return 0;
    const s = L.soldier;
    return Math.hypot(s.x - r.cx, s.z - r.cz) < 60 ? 2 : 1;
  }

  lordDied(L) {
    L.died = true;
    L.lord.alive = false;
    const side = L.reg.side;
    this.event(side, side ? `The enemy lord, ${L.lord.name}, has fallen!` : `${L.lord.name} has fallen!`);
    for (const r of this.regs) if (r.side === side && this.usable(r)) r.morale -= 20;
    for (const r of this.regs) if (r.side !== side && this.usable(r)) r.morale = Math.min(r.T.morale + 10, r.morale + 8);
  }

  // After a battle: whether a side's lord came through it. Call once when it ends.
  lordReport(side) {
    const L = this.lords[side];
    if (!L) return null;
    const s = L.soldier;
    return { lord: L.lord, died: L.died, wounded: !L.died && s.hp < 35, won: this.winner === side };
  }

  // After a battle: each regiment's experience to carry home on its unit spec as `xp`.
  // Men who fought and lived learn; a win teaches more; so does killing well (vetRank).
  veterans(side) {
    const won = this.winner === side;
    return this.regs.filter(r => r.side === side && !r.T.engine).map(r => {
      const gained = r.fought && r.alive > 0 ? 0.5 + (won ? 0.5 : 0) + Math.min(1, r.kills / Math.max(1, r.initial)) : 0;
      const xp = Math.round((r.xp + gained) * 10) / 10;
      return { reg: r, spec: r.spec, alive: r.alive, xp, gained, rank: vetRank(xp), promoted: vetRank(xp) > r.vet, armour: r.armour, shield: r.shield };
    });
  }

  // The armour the side's dead lay down in, for whoever holds the field to strip:
  // { none, leather, mail, plate, shields } counts (levels with no dead left out).
  lostArmour(side) { return { ...this.lostKit[side] }; }

  // A trait of the captain riding with this regiment (CAPTAIN_TRAITS).
  hasTrait(r, key) {
    const c = this.captains[r.side];
    return !!c && !c.died && c.reg === r && !!c.captain.traits?.includes(key);
  }

  // What a battle did for a side's captain: xp from the enemies killed, more for a win;
  // perhaps a new trait from how his own regiment fared (one a battle at most); and a line
  // in his memory ({ at, text }, as vassals keep theirs). Call once when the battle ends;
  // it updates the captain object in place. where: the battle's name for the memory
  // ("Hollin Ford"); foe: the enemy house's name, for a grudge; at: the campaign clock.
  captainReport(side, { where = null, foe = null, at = 0 } = {}) {
    const c = this.captains[side];
    if (!c) return null;
    const C = c.captain, r = c.reg, won = this.winner === side;
    const gained = c.died ? 0 : Math.round(this.losses[1 - side] * 0.5 + (won ? 40 : 10));
    const before = C.level;
    let trait = null;
    if (!c.died) {
      C.xp += gained;
      C.level = captainLevel(C.xp);
      C.battles = (C.battles || 0) + 1;
      C.traits ||= [];
      const enemyChief = this.captains[1 - side]?.died || this.lords[1 - side]?.died;
      const earned = [
        [foe ? `hated:${foe}` : null, won && foe && enemyChief],
        ['steady', (r.arrowHits || 0) >= 25 && !r.routedOnce],
        ['stubborn', !r.routedOnce && r.alive < r.initial * 0.5 && r.fought],
        ['reckless', (r.charges || 0) >= 2 || (r.braced || 0) >= 3],
        ['killer', r.kills >= r.initial * 0.8],
        ['skittish', r.routedOnce && !won],
      ].find(([k, yes]) => k && yes && !C.traits.includes(k) && !(k === 'skittish' && C.traits.includes('stubborn')) && !(k === 'stubborn' && C.traits.includes('skittish')));
      if (earned) { trait = earned[0]; C.traits.push(trait); }
    }
    const place = where ? ` at ${where}` : '';
    const text = c.died ? `Fell${place}.`
      : `${won ? 'Won' : this.surrendered === side ? 'Yielded' : 'Lost'}${place}${trait ? `; ${traitName(trait)}` : ''}.`;
    (C.memory ||= []).push({ at, text });
    if (C.memory.length > 20) C.memory.shift();
    return { captain: C, gained, died: c.died, levelled: C.level > before, trait, traitName: trait && traitName(trait) };
  }

  // ---- simulation ----

  step(dt) {
    // Time stands still while an army deploys (a storm's men only so long, then they go in).
    if (this.deploying) {
      const D = this.deploying;
      if (D.limit && (D.waited += dt) >= D.limit) this.beginBattle();
      return;
    }
    if (!this.weatherSaid) { this.weatherSaid = true; this.event(0, WEATHER[this.weather].say); }
    if (this.winner !== null) dt *= 0.3;
    this.time += dt;
    if (this.walls.sites) this.walls.build(dt, this.masons);
    this.nav.sync();
    this.buildGrid();
    for (const r of this.regs) this.updateRegiment(r, dt);
    for (const r of this.regs) { r.engaged = 0; r._lagSum = 0; r._lagN = 0; if (r.pinch) this.queuePinch(r); }
    for (const s of this.soldiers) if (live(s)) this.updateSoldier(s, dt);
    else if (!s.alive && s.fall < 1) s.fall = Math.min(1, s.fall + dt * 2.5);
    this.separate();
    if (this.walls.any) this.constrain();
    for (const r of this.regs) {
      r.lag = r._lagN ? r._lagSum / r._lagN : 0;
      this.updateMorale(r, dt);
      this.updateFatigue(r, dt);
      if (r.T.range) this.updateArchers(r, dt);
      if (r.engine && !r.gone) this.updateEngine(r, dt);
    }
    this.updateArrows(dt);
    this.updateStones(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      this.checkVictory();
      this.updateSight();
      if (this.river) this.riverTick();
      this.answerFoes();
      if (this.duel && !this.duel.over) this.duelTick();
      if (this.walls.any) this.wallsTick();
    }
  }

  // Soldiers sorted into 4 m cells (a counting sort into flat arrays), for finding who is near.
  buildGrid() {
    const start = this.gStart, list = this.soldiers;
    start.fill(0);
    const cells = this._cells && this._cells.length >= list.length ? this._cells : (this._cells = new Int32Array(list.length * 2 + 64));
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.alive || s.gone) { cells[i] = -1; continue; }
      const c = this.cell(s.x, s.z);
      cells[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < GN * GN; c++) start[c + 1] += start[c];
    const fill = this._fill && this._fill.length === start.length ? this._fill : (this._fill = new Int32Array(start.length));
    fill.set(start);
    const items = this.gItems;
    items.length = start[GN * GN];
    for (let i = 0; i < list.length; i++) if (cells[i] >= 0) items[fill[cells[i]]++] = list[i];
  }

  cell(x, z) {
    const cx = Math.max(0, Math.min(GN - 1, Math.floor((x + GSPAN) / CELL))), cz = Math.max(0, Math.min(GN - 1, Math.floor((z + GSPAN) / CELL)));
    return cz * GN + cx;
  }

  forNear(x, z, radius, fn) {
    const x0 = Math.max(0, Math.floor((x - radius + GSPAN) / CELL)), x1 = Math.min(GN - 1, Math.floor((x + radius + GSPAN) / CELL));
    const z0 = Math.max(0, Math.floor((z - radius + GSPAN) / CELL)), z1 = Math.min(GN - 1, Math.floor((z + radius + GSPAN) / CELL));
    const start = this.gStart, items = this.gItems;
    for (let cz = z0; cz <= z1; cz++) for (let c = cz * GN + x0, e = cz * GN + x1; c <= e; c++) {
      for (let i = start[c], n = start[c + 1]; i < n; i++) fn(items[i]);
    }
  }

  nearestEnemy(s, radius) {
    let best = null, bestD = radius * radius;
    this.forNear(s.x, s.z, radius, o => {
      if (o.reg.side === s.reg.side) return;
      const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2;
      if (d < bestD) { bestD = d; best = o; }
    });
    return best;
  }

  // Who a soldier can come to blows with. On the ground: men on the ground, with no wall between.
  // On the wall: men on the walkway, climbers on ladders, and anyone at the foot of the wall.
  findTarget(s, radius) {
    let best = null, bestD = radius * radius, low = null, lowD = POUR_REACH * POUR_REACH;
    const up = s.level === 1;
    this.forNear(s.x, s.z, radius, o => {
      if (o.reg.side === s.reg.side) return;
      const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2;
      if (up) {
        if (o.level === 1 && !o.climb) { if (d < bestD) { bestD = d; best = o; } }
        else if (d < lowD) { lowD = d; low = o; }
        return;
      }
      if (o.level === 1 || o.climb) return;
      if (d < bestD) { bestD = d; best = o; }
    });
    if (best && !up && this.nav.any && !this.nav.clear(s.reg.side, s.x, s.z, best.x, best.z)) best = null;
    return best || low;
  }

  updateRegiment(r, dt) {
    if (r.gone) return;
    let sx = 0, sz = 0, n = 0;
    for (const s of r.soldiers) if (live(s) && !s.captain) { sx += s.x; sz += s.z; n++; }
    if (n === 0) {
      r.gone = true; r.routing = false;
      this.clearPosts(r);
      for (const s of r.soldiers) if (s.captain && live(s)) { s.gone = true; }
      return;
    }
    r.cx = sx / n; r.cz = sz / n;
    if (r.routing) { r.alive = n; this.updateRout(r); return; }
    const T = r.T, F = FORMATIONS[r.formation] || FORMATIONS.line;
    if (r.posts) return;

    if (r.targetWall) this.aimAtWall(r, dt);
    else if (r.targetReg) {
      const t = r.targetReg;
      if (t.gone) { r.targetReg = null; r.x = r.cx; r.z = r.cz; this.assignSlots(r); }
      else {
        const dx = t.cx - r.cx, dz = t.cz - r.cz, d = Math.hypot(dx, dz) || 1;
        const ang = Math.atan2(dx, dz);
        const range = this.shoots(r) ? T.range : r.engine?.range;
        if (range && d <= range * 0.9 && d >= (r.engine?.min || 0)) r.dest = null;
        else if (range) r.dest = { x: t.cx - dx / d * range * 0.8, z: t.cz - dz / d * range * 0.8, angle: ang };
        else r.dest = { x: t.cx, z: t.cz, angle: ang };
        if (!r.dest) r.angle = turnToward(r.angle, ang, dt * 1.2);
      }
    }

    if (r.engaged > 0 && !this.shoots(r) && !r.hold && !r.engine) {
      // Locked in melee: let the anchor settle where the fighting is.
      const k = Math.min(1, dt * 0.4);
      r.x += (r.cx - r.x) * k;
      r.z += (r.cz - r.z) * k;
    } else if (r.dest) {
      let tx = r.dest.x, tz = r.dest.z;
      // Round the walls: steer for the next point on the way. The regiment keeps its
      // formation; at a gate, breach or bridge too narrow for it, only the files that don't
      // fit squeeze in behind the others (see pinchFor).
      if (this.nav.any || this.river) {
        r.viaCd -= dt;
        if (r.viaCd <= 0) {
          r.viaCd = 0.5;
          r.via = (this.nav.any ? this.nav.steer(r.side, r.x, r.z, tx, tz) : null) || (this.river ? this.riverWay(r, tx, tz) : null);
          if (!T.engine) this.pinchFor(r);
        }
        if (r.via) {
          tx = r.via.x; tz = r.via.z;
          if (Math.hypot(tx - r.x, tz - r.z) < 1.5) r.viaCd = 0;
        }
      }
      const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
      const left = Math.hypot(r.dest.x - r.x, r.dest.z - r.z);
      if (d > 0.4) {
        // A short shift of a line that will face the same way at the end: the men step
        // across (or back) in formation, a little slower, rather than wheeling to march off
        // and wheeling back again on arrival.
        const shuffle = left < 40 && !r.via && !r.pinch && !r.targetReg && !r.targetWall && Math.abs(angleDiff(r.dest.angle, r.angle)) < 0.6;
        const want = shuffle ? r.dest.angle : left > 12 || r.via ? Math.atan2(dx, dz) : r.dest.angle;
        let turn = Math.abs(angleDiff(want, r.angle));
        // Foot ordered back the way they face about-face where they stand, rather than
        // wheeling the whole block round: the rear rank becomes the front.
        if (turn > 2.2 && !T.mounted && !T.engine && !r.pinch && r.formation !== 'square') {
          const files = Math.max(1, Math.min(r.files, r.alive)), D = (Math.ceil(r.alive / files) - 1) * (T.depth || T.spacing) * F.depth;
          r.x -= Math.sin(r.angle) * D; r.z -= Math.cos(r.angle) * D;
          r.angle = want; turn = 0;
          this.assignSlots(r);
        }
        r.angle = turnToward(r.angle, want, dt * (T.mounted ? 1.6 : T.engine ? 0.5 : 1.0));
        // Wheel before marching off, and wait for stragglers.
        const sideways = shuffle ? Math.abs(angleDiff(Math.atan2(dx, dz), r.angle)) : 0;
        const pace = T.speed * F.speed * (turn > 1.2 ? 0.25 : 1) * (r.lag > 4 ? 0.45 : 1) * (sideways > 2 ? 0.6 : sideways > 0.6 ? 0.75 : 1)
          * (r.pinch ? this.pinchPace(r) : 1)
          * (r.targetReg && left < 25 ? 1.35 : 1) * (this.time < r.chargeUntil ? 1.25 : 1) * (r.engine && !this.crewed(r) ? 0 : 1) * this.paceOf(r);
        const stepLen = Math.min(d, pace * dt);
        const nx = r.x + dx / d * stepLen, nz = r.z + dz / d * stepLen;
        // Never march the anchor into a wall; one already stuck in one (or an engine
        // left without its crew) falls back to where its men are. The last few metres to
        // a wall it is attacking are allowed: a ram or ladder has to touch it.
        const walled = this.nav.any && !(r.targetWall && left < 4);
        if (walled && this.nav.blockedAt(r.side, r.x, r.z) || (r.engine && !this.crewed(r))) {
          const k = Math.min(1, dt * 0.8);
          r.x += (r.cx - r.x) * k; r.z += (r.cz - r.z) * k; r.viaCd = 0;
        } else if (!(walled && this.nav.blockedAt(r.side, nx, nz))) { r.x = nx; r.z = nz; }
        else r.viaCd = 0;
      } else if (!r.via) {
        r.angle = turnToward(r.angle, r.dest.angle, dt * 1.2);
        if (!r.targetReg && !r.targetWall && Math.abs(angleDiff(r.angle, r.dest.angle)) < 0.01) {
          r.dest = null;
        }
      }
    }
  }

  // Engines (and soldiers attacking a structure) move up to it: rams and hackers to its face,
  // throwing engines to within range.
  aimAtWall(r, dt) {
    const s = r.targetWall, E = r.engine;
    if (this.structGone(s) || (E?.kind === 'ladder' && E.ladders.length)) { r.targetWall = null; r.dest = null; return; }
    const p = s.wall && s.kind === 'piece' ? (() => {
      const h = toSegment(r.wallPoint?.x ?? r.cx, r.wallPoint?.z ?? r.cz, s.a.x, s.a.z, s.b.x, s.b.z);
      const t = s.gate ? 0.5 : Math.max(0.2, Math.min(0.8, h.t));
      return { x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t };
    })() : { x: s.x, z: s.z };
    const dx = p.x - r.cx, dz = p.z - r.cz, d = Math.hypot(dx, dz) || 1, ang = Math.atan2(dx, dz);
    if (E && E.range) {
      if (d > E.range * 0.92) { r.dest = { x: p.x - dx / d * E.range * 0.82, z: p.z - dz / d * E.range * 0.82, angle: ang }; E.ready = 0; }
      else if (d < E.min) { r.dest = { x: p.x - dx / d * E.min * 1.4, z: p.z - dz / d * E.min * 1.4, angle: ang }; E.ready = 0; }
      else { r.dest = null; r.angle = turnToward(r.angle, ang, dt * 0.6); }
      return;
    }
    // Rams, ladders and foot go to the outer face.
    let fx = p.x, fz = p.z, face = ang;
    if (s.wall && s.kind === 'piece') {
      const out = this.walls.outward(s, this.fortHome(s.side));
      const off = s.M.thick / 2 + (E?.kind === 'ram' ? 0.6 : 2.2);
      fx = p.x + out.x * off; fz = p.z + out.z * off; face = Math.atan2(-out.x, -out.z);
    } else {
      const R = s.wall ? s.M.towerR : s.B.radius;
      fx = p.x - dx / d * (R + 1); fz = p.z - dz / d * (R + 1);
    }
    if (E?.kind === 'ram' || E?.kind === 'ladder') {
      if (Math.hypot(r.x - fx, r.z - fz) > 1.2) {
        if (!r.dest || Math.hypot(r.dest.x - fx, r.dest.z - fz) > 1) r.dest = { x: fx, z: fz, angle: face };
      } else { r.dest = null; r.angle = turnToward(r.angle, face, dt * 0.8); }
    } else if (Math.hypot(r.cx - fx, r.cz - fz) > 12) {
      if (!r.dest || Math.hypot(r.dest.x - fx, r.dest.z - fz) > 2) r.dest = { x: fx, z: fz, angle: face };
    } else r.dest = null;
  }

  // An engine works only while some of its crew are at it.
  crewed(r) {
    let n = 0;
    for (const s of r.soldiers) if (live(s) && Math.hypot(s.x - r.x, s.z - r.z) < 12) n++;
    return n >= Math.max(1, Math.ceil(r.initial * 0.25));
  }

  updateEngine(r, dt) {
    const E = r.engine;
    if (r.routing || r.regrouping) return;
    if (E.maxHp && E.hp <= 0) return;
    const crew = r.soldiers.filter(live).length;
    const work = Math.min(1, crew / (r.initial * 0.6));
    if (E.kind === 'ladder') {
      const s = r.targetWall;
      if (!s || E.ladders.length) return;
      if (!r.dest && Math.hypot(r.cx - r.x, r.cz - r.z) < 4 && !this.structGone(s)) {
        E.raising += dt * work;
        if (E.raising >= E.raise) this.raiseLadders(r, s);
      }
      return;
    }
    E.cd -= dt * work;
    const moving = !!r.dest;
    if (moving) { E.ready = 0; return; }
    E.ready += dt;
    if (E.kind === 'ram') {
      const s = r.targetWall;
      if (!s || this.structGone(s) || E.cd > 0) return;
      E.cd = E.reload;
      E.swing = this.time;
      audio.play('gate', s, this); // audio: the ram strikes
      if (this.hitStructure(s, E.dmg, 'ram')) { r.targetWall = null; this.event(r.side, `${this.label(r)} broke through!`); }
      return;
    }
    // Throwing engines: at the structure ordered, or at a regiment.
    if (E.ready < E.setup || E.cd > 0) return;
    let aim = null, struct = null;
    if (r.targetWall && !this.structGone(r.targetWall)) {
      struct = r.targetWall;
      aim = struct.wall && struct.kind === 'piece' ? (() => {
        const h = toSegment(r.wallPoint?.x ?? r.cx, r.wallPoint?.z ?? r.cz, struct.a.x, struct.a.z, struct.b.x, struct.b.z);
        const t = Math.max(0.15, Math.min(0.85, h.t));
        return { x: struct.a.x + (struct.b.x - struct.a.x) * t, z: struct.a.z + (struct.b.z - struct.a.z) * t };
      })() : { x: struct.x, z: struct.z };
    } else if (r.targetReg && !r.targetReg.gone) aim = { x: r.targetReg.cx, z: r.targetReg.cz };
    if (!aim) return;
    const d = Math.hypot(aim.x - r.x, aim.z - r.z);
    if (d > E.range * 1.05 || d < E.min * 0.9) return;
    E.cd = E.reload;
    E.swing = this.time;
    const spread = 1 + d * E.spread;
    const x1 = aim.x + (this.rand() - 0.5) * 2 * spread, z1 = aim.z + (this.rand() - 0.5) * 2 * spread;
    const y0 = this.heightAt(r.x, r.z) + (E.kind === 'trebuchet' ? 9 : 4);
    this.stones.push({ x0: r.x, y0, z0: r.z, x1, z1, y1: this.heightAt(x1, z1), t: 0, T: 1.6 + d / 55, h: 8 + d * 0.22, side: r.side, E, struct, kind: E.kind });
  }

  raiseLadders(r, s) {
    const E = r.engine, home = this.fortHome(s.side);
    const n = Math.max(1, Math.round(r.initial / E.per));
    const pt = r.wallPoint || { x: r.cx, z: r.cz };
    const h = toSegment(pt.x, pt.z, s.a.x, s.a.z, s.b.x, s.b.z);
    // Spread along this piece and the ones beside it.
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 3.5;
      let t = h.t + off / s.len, piece = s;
      if (t < 0.1 || t > 0.9) {
        const nb = this.walls.neighbours(s).find(o => o.kind === 'piece' && !o.gate && o.state === 'up' && (t < 0.1 ? (o.a === s.a || o.b === s.a) : (o.a === s.b || o.b === s.b)));
        if (!nb) continue;
        piece = nb;
        const x = s.a.x + (s.b.x - s.a.x) * t, z = s.a.z + (s.b.z - s.a.z) * t;
        const l = this.walls.raiseLadder(piece, x, z, r.side, home);
        if (l) { l.raisedAt = this.time; E.ladders.push(l); }
        continue;
      }
      const l = this.walls.raiseLadder(piece, s.a.x + (s.b.x - s.a.x) * t, s.a.z + (s.b.z - s.a.z) * t, r.side, home);
      if (l) { l.raisedAt = this.time; E.ladders.push(l); }
    }
    r.targetWall = null;
    r.dest = null;
    this.event(r.side, `${this.label(r)} have raised ${E.ladders.length} ladder${E.ladders.length === 1 ? '' : 's'}!`);
    // Then up they go themselves.
    if (E.ladders.length) this.orderMan([r], E.ladders[0].piece, E.ladders[0].x, E.ladders[0].z);
  }

  updateStones(dt) {
    let w = 0;
    for (const st of this.stones) {
      st.t += dt;
      if (st.t < st.T) { this.stones[w++] = st; continue; }
      const E = st.E;
      // Walls and towers in the way take the blow; a miss lands among whoever is there.
      const hitWall = this.walls.structureAt(st.x1, st.z1, 1 - st.side);
      if (hitWall) this.hitStructure(hitWall, E.dmg, 'stone');
      else if (this.structures) {
        for (const b of this.structures()) {
          if (b.state === 'ruined' || b.removed || (b.side ?? this.buildingSide) === st.side) continue;
          if (Math.hypot(b.x - st.x1, b.z - st.z1) < (b.B?.radius || 4) + 1) { this.hitStructure(b, E.dmg, 'stone'); break; }
        }
      }
      this.forNear(st.x1, st.z1, E.splash, o => {
        const d = Math.hypot(o.x - st.x1, o.z - st.z1);
        if (d > E.splash) return;
        this.hurt(o, E.sdmg * (1 - d / E.splash * 0.6));
        o.reg.morale -= 0.6;
        o.reg.lastHit = this.time;
        if (o.reg.engine?.maxHp && d < 3) o.reg.engine.hp -= E.dmg * 0.4;
      });
      this.impacts = this.impacts || [];
      this.impacts.push({ x: st.x1, z: st.z1, time: this.time, big: E.kind === 'trebuchet' });
      if (this.impacts.length > 40) this.impacts.shift();
      audio.play('stone', { x: st.x1, z: st.z1 }, this); // audio
    }
    this.stones.length = w;
    for (const r of this.regs) {
      const E = r.engine;
      if (E?.maxHp && E.hp <= 0 && !E.wrecked) {
        E.wrecked = true;
        r.targetWall = null; r.dest = null;
        this.event(r.side, `${this.label(r)} has been wrecked!`);
        this.startRout(r);
      }
    }
  }

  // Once a second: ladders pushed down, gates forced from inside, the walls' own business.
  wallsTick() {
    const W = this.walls;
    this.pourOil();
    this.minesTick();
    if (this.termsAllowed) this.checkTerms();
    for (const l of [...W.ladders]) {
      if (l.piece.state !== 'up') { W.pushDown(l); continue; }
      let def = 0, att = 0, climbing = 0, below = 0;
      this.forNear(l.x, l.z, 4, o => {
        if (Math.hypot(o.x - l.x, o.z - l.z) > 3.5) return;
        if (o.level === 1 && o.reg.side !== l.side) def++;
        if (o.level === 1 && o.reg.side === l.side) att++;
      });
      this.forNear(l.foot.x, l.foot.z, 5, o => { if (o.level === 0 && !o.climb && o.reg.side === l.side && !o.reg.routing) below++; });
      for (const o of this.soldiers) if (o.climbVia === l && o.climb > 0) climbing++;
      // Defenders shove an unheld ladder away from the wall; men at its foot, waiting to
      // climb, hold it against the wall and make that much harder.
      if (def > 0 && att === 0 && this.time - l.raisedAt > 5 && this.rand() < Math.min(0.5, 0.1 * def) * (climbing ? 0.5 : 1) * (below ? 0.25 : 1)) {
        W.pushDown(l);
        this.event(l.piece.side, `${l.piece.side === 0 ? 'Our men' : 'The defenders'} pushed a ladder off the wall!`);
        for (const o of this.soldiers) if (o.climbVia === l && o.climb > 0) this.fallFrom(o, 7);
      }
    }
    // A gate is thrown open when attackers stand inside it and no defender is near.
    for (const p of W.pieces) {
      if (!p.gate || p.state !== 'up') continue;
      const home = this.fortHome(p.side), out = W.outward(p, home);
      let inside = 0, owners = 0;
      this.forNear(p.x, p.z, 12, o => {
        if (o.level !== 0 || Math.hypot(o.x - p.x, o.z - p.z) > 12) return;
        if (o.reg.side === p.side) owners++;
        else if ((o.x - p.x) * out.x + (o.z - p.z) * out.z < -1) inside++;
      });
      if (!p.forced && inside >= 3 && owners === 0) {
        p.forcing = (p.forcing || 0) + 1;
        if (p.forcing >= 4) { p.forced = true; p.forcing = 0; W.changed(); this.event(p.side, p.side === 0 ? 'The enemy has thrown our gate open!' : 'Our men have thrown the gate open!'); }
      } else if (p.forced && owners >= 3 && inside === 0) {
        p.forcing = (p.forcing || 0) + 1;
        if (p.forcing >= 5) { p.forced = false; p.forcing = 0; W.changed(); this.event(p.side, p.side === 0 ? 'We have shut the gate again.' : 'The enemy has shut the gate again.'); }
      } else p.forcing = 0;
    }
  }

  fallFrom(s, dmg) {
    s.climb = 0; s.climbVia = null; s.level = 0; s.perch = null; s.route = null;
    if (s.climbFrom) { s.x = s.climbFrom.x; s.z = s.climbFrom.z; }
    s.y = this.heightAt(s.x, s.z);
    this.hurt(s, dmg);
  }

  // Where this soldier is trying to be, when not fighting: { x, z, perch } (perch null: the ground).
  goalOf(s) {
    const r = s.reg;
    if (s.captain) {
      // The captain rides just behind his regiment's middle.
      const d = r.posts ? 10 : (Math.ceil(r.alive / Math.max(1, r.files)) * (r.T.depth || r.T.spacing)) / 2 + 4;
      const side = s.lordOf !== undefined ? 5 : 0;   // a lord (and bannerman) rides beside the captain
      return { x: r.cx - Math.sin(r.angle) * d + Math.cos(r.angle) * side, z: r.cz - Math.cos(r.angle) * d - Math.sin(r.angle) * side, perch: null };
    }
    if (r.posts) {
      const p = r.posts[s.slot];
      if (p && p.perch.state === 'up') return p;
      const a = r.access?.[0];
      return a ? { x: a.ground.x + s.jitter * 6, z: a.ground.z - s.jitter * 6, perch: null } : { x: s.x, z: s.z, perch: null };
    }
    if (r.targetWall && !r.engine && !this.structGone(r.targetWall)) {
      const p = this.faceSpot(r, r.targetWall, s.slot, r.alive);
      return { x: p.x, z: p.z, perch: null, strike: r.targetWall };
    }
    const p = this.slotPos(r, s.slot);
    return (r.pinch && this.pinchGoal(s, p)) || { x: p.x, z: p.z, perch: null, face: p.face };
  }

  updateSoldier(s, dt) {
    const r = s.reg, T = r.T;
    s.lunge = Math.max(0, s.lunge - dt * 3);
    s.cd -= dt;
    const px = s.x, pz = s.z;
    s.lx = px; s.lz = pz;

    if (s.climb > 0) this.climbStep(s, dt);
    else if (s.duel) this.duelStep(s, dt);
    else if (r.routing) {
      s.target = null;
      if (this.walls.any) {
        const h = this.homes[r.side];
        this.travel(s, { x: h.x + s.jitter * 20, z: h.z, perch: null }, T.speed * 1.3, dt);
      } else {
        const dir = r.fleeDir + s.jitter;
        s.x += Math.sin(dir) * T.speed * 1.3 * dt;
        s.z += Math.cos(dir) * T.speed * 1.3 * dt;
        s.yaw = turnToward(s.yaw, dir, dt * 6);
      }
      s.x = Math.max(-HALF, Math.min(HALF, s.x));
      s.z = Math.max(-HALF, Math.min(HALF, s.z));
    } else {
      s.searchCd -= dt;
      // Men holding their ground only fight whoever reaches them.
      const engageR = this.shoots(r) ? 2.5 : r.hold || r.posts ? (s.level === 1 ? 3 : 2.8) : r.targetReg ? 9 : 4.5;
      if (s.target && (!live(s.target) || (s.target.x - s.x) ** 2 + (s.target.z - s.z) ** 2 > (engageR + 2) ** 2
        || (s.level === 0 && (s.target.level === 1 || s.target.climb)))) s.target = null;
      if (s.searchCd <= 0) {
        s.searchCd = 0.25 + this.rand() * 0.15;
        const near = this.findTarget(s, Math.max(engageR, s.level === 1 ? POUR_REACH : 0));
        if (near) s.target = near;
        else if (s.target && s.level === 1 && s.target.level !== 1) s.target = null;
      }
      if (s.target) {
        r.engaged++;
        s.idleFor = 0;
        const t = s.target, dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz);
        const below = s.level === 1 && (t.level !== 1 || t.climb > 0);
        const reach = below ? POUR_REACH : T.reach;
        const charging = (T.charge && !s.charged) || this.time < r.chargeUntil;
        if (!below && d > T.reach * 0.85) {
          const sp = T.speed * (charging ? 1.5 : 1.15);
          if (s.level === 1) { this.moveToward(s, t.x, t.z, sp, dt); this.keepOnWall(s); }
          else this.groundMove(s, t.x, t.z, sp, dt);
        }
        s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt * 8);
        if (d <= reach && s.cd <= 0) {
          s.cd = T.cooldown * (0.8 + this.rand() * 0.4);
          this.strike(s, t);
        }
      } else {
        s.idleFor += dt;
        if (s.idleFor > 3) s.charged = false;
        const goal = this.goalOf(s);
        const d = Math.hypot(goal.x - s.x, goal.z - s.z);
        const onGoal = (goal.perch || null) === (s.perch || null) || (goal.perch && s.level === 1 && s.perch === goal.perch);
        if (onGoal) { r._lagSum += d; r._lagN++; }
        else { r._lagSum += 6; r._lagN++; }
        if (!onGoal || d > 0.15) this.travel(s, goal, T.speed * (d > 2 || !onGoal ? 1.35 : 1.08) * (FORMATIONS[r.formation]?.speed || 1), dt);
        if (onGoal && d < 0.8) {
          const face = goal.face ?? (r.posts ? r.angle : r.angle);
          s.yaw = turnToward(s.yaw, face, dt * 4);
        }
        // Men at a wall's face hack at it.
        if (goal.strike && d < 1.6 && s.cd <= 0) {
          s.cd = T.cooldown * (0.8 + this.rand() * 0.4);
          s.lunge = 1;
          s.struckAt = this.time; // anim
          s.yaw = turnToward(s.yaw, Math.atan2(goal.strike.x - s.x, goal.strike.z - s.z), 1);
          if (this.hitStructure(goal.strike, T.dmg, 'melee')) { r.targetWall = null; this.event(r.side, `${this.label(r)} broke through!`); }
          r.engaged++;
        }
      }
    }
    s.vx = (s.x - px) / dt; s.vz = (s.z - pz) / dt;
    s.v = Math.hypot(s.vx, s.vz);
    if (s.climb <= 0) s.y = s.level === 1 ? this.walls.walkY(s.perch, s.x, s.z) : this.river ? this.groundY(s.x, s.z) : this.heightAt(s.x, s.z);
    s.phase += s.v * dt * 2.2;
  }

  // Getting somewhere, on the ground or along the walls, climbing up or down on the way.
  travel(s, goal, speed, dt) {
    const want = goal.perch || null;
    if (s.level === 0) {
      if (!want) { this.groundMove(s, goal.x, goal.z, speed, dt); return; }
      // Up onto the wall: the best way up for this goal.
      const a = this.pickAccess(s, s.reg.access && s.reg.posts ? s.reg.access : this.accessUp(s.reg.side, want), goal);
      if (!a) return;
      const d = Math.hypot(a.ground.x - s.x, a.ground.z - s.z);
      if (d > 1.4) { this.groundMove(s, a.ground.x, a.ground.z, speed, dt); return; }
      this.startClimb(s, a, true);
      return;
    }
    // On the wall.
    if (want) {
      if (s.routeGoal !== goal || s.routeV !== this.walls.version) {
        s.route = this.walls.route(s.perch, s.x, s.z, want, goal.x, goal.z);
        s.routeGoal = goal; s.routeV = this.walls.version;
      }
      this.walkRoute(s, speed, dt);
      return;
    }
    // Down to the ground: the nearest way down that leads toward the goal.
    if (!s.down || !s.downGoal || Math.hypot(s.downGoal.x - goal.x, s.downGoal.z - goal.z) > 6 || s.downV !== this.walls.version || this.time > s.downAt + 4) {
      const list = this.accessDown(s.reg.side, s.perch);
      let best = null, bs = Infinity;
      for (const a of list) {
        const sc = Math.hypot(a.top.x - s.x, a.top.z - s.z) + Math.hypot(a.ground.x - goal.x, a.ground.z - goal.z)
          + (this.nav.reachable(s.reg.side, a.ground.x, a.ground.z, goal.x, goal.z) ? 0 : 1000);
        if (sc < bs) { bs = sc; best = a; }
      }
      s.down = best; s.downGoal = goal; s.downV = this.walls.version; s.downAt = this.time;
      s.route = best ? this.walls.route(s.perch, s.x, s.z, best.top.perch, best.top.x, best.top.z) : null;
      s.routeGoal = null;
    }
    const a = s.down;
    if (!a) return;
    if (Math.hypot(a.top.x - s.x, a.top.z - s.z) < 0.9) { this.startClimb(s, a, false); return; }
    this.walkRoute(s, speed, dt);
  }

  pickAccess(s, list, goal) {
    let best = null, bs = Infinity;
    for (const a of list) {
      if (a.ladder && (a.ladder.down || !this.walls.ladders.includes(a.ladder))) continue;
      const sc = Math.hypot(a.ground.x - s.x, a.ground.z - s.z) + Math.hypot(a.top.x - goal.x, a.top.z - goal.z) * 0.6;
      if (sc < bs) { bs = sc; best = a; }
    }
    return best;
  }

  startClimb(s, a, up) {
    const W = this.walls;
    const time = CLIMB[a.kind] * (up ? 1 : 0.7);
    const top = { x: a.top.x, z: a.top.z, y: W.walkY(a.top.perch, a.top.x, a.top.z), perch: a.top.perch };
    const ground = { x: a.ground.x, z: a.ground.z, y: this.heightAt(a.ground.x, a.ground.z) };
    s.climbFrom = up ? ground : top;
    s.climbTo = up ? top : ground;
    s.climbUp = up;
    s.climbDur = time;
    s.climb = time;
    s.climbVia = a.ladder || null;
    s.target = null;
    s.down = null;
  }

  climbStep(s, dt) {
    if (s.climbVia && (s.climbVia.down || !this.walls.ladders.includes(s.climbVia))) { this.fallFrom(s, 6); return; }
    const to = s.climbTo, from = s.climbFrom;
    if (to.perch && to.perch.state !== 'up') { this.fallFrom(s, 4); return; }
    s.climb -= dt;
    const k = 1 - Math.max(0, s.climb) / s.climbDur;
    s.x = from.x + (to.x - from.x) * k; s.z = from.z + (to.z - from.z) * k;
    s.y = from.y + (to.y - from.y) * k;
    s.yaw = Math.atan2(to.x - from.x, to.z - from.z) || s.yaw;
    if (s.climb > 0) return;
    s.climb = 0; s.climbVia = null;
    s.level = s.climbUp ? 1 : 0;
    s.perch = s.climbUp ? to.perch : null;
    s.route = null; s.routeGoal = null; s.via = null; s.viaCd = 0;
  }

  walkRoute(s, speed, dt) {
    const route = s.route;
    if (!route || !route.length) return;
    const p = route[0];
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < 0.35 && route.length > 1) { s.perch = p.perch; route.shift(); return; }
    if (route.length === 1 && d < 0.4) s.perch = p.perch;
    this.moveToward(s, p.x, p.z, speed, dt);
    if (d < 1.2) s.perch = p.perch;
  }

  // On the ground, round the walls when they are in the way.
  groundMove(s, tx, tz, speed, dt) {
    if (this.nav.any || this.river) {
      s.viaCd -= dt;
      if (s.viaCd <= 0 || (s.via && Math.hypot(s.via.x - s.x, s.via.z - s.z) < 0.8)) {
        s.viaCd = 0.35 + this.rand() * 0.25;
        s.via = (this.nav.any ? this.nav.steer(s.reg.side, s.x, s.z, tx, tz) : null) || (this.river ? this.riverWay(s, tx, tz) : null);
      }
      if (s.via) { tx = s.via.x; tz = s.via.z; }
    }
    this.moveToward(s, tx, tz, speed, dt);
  }

  // For anyone walking about who is not a soldier (villagers): the point to head for next on
  // the way to (tx, tz), round the walls. Remembers its choice on the walker for a moment.
  steerWalker(w, side, tx, tz, dt) {
    if (!this.nav.any) return { x: tx, z: tz };
    w.navCd = (w.navCd || 0) - dt;
    if (w.navCd <= 0 || (w.navVia && Math.hypot(w.navVia.x - w.x, w.navVia.z - w.z) < 0.8)) {
      w.navCd = 0.5;
      w.navVia = this.nav.steer(side, w.x, w.z, tx, tz);
    }
    return w.navVia || { x: tx, z: tz };
  }

  // A soldier on the wall stays on its walkway; stepping off the end of a piece takes him onto the next.
  keepOnWall(s) {
    if (!s.perch) return;
    const W = this.walls;
    let best = s.perch, p = W.clampTo(s.perch, s.x, s.z), bd = Math.hypot(p.x - s.x, p.z - s.z);
    if (bd > 0.05) {
      for (const o of W.neighbours(s.perch)) {
        if (o.state !== 'up') continue;
        const q = W.clampTo(o, s.x, s.z), d = Math.hypot(q.x - s.x, q.z - s.z);
        if (d < bd) { bd = d; best = o; p = q; }
      }
    }
    s.perch = best;
    s.x = p.x; s.z = p.z;
  }

  moveToward(s, tx, tz, speed, dt) {
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    if (s.level === 0 && !s.climb) speed *= this.groundPace(s, dx / d, dz / d);
    speed *= this.paceOf(s.reg);
    const stepLen = Math.min(d, speed * dt);
    s.x += dx / d * stepLen;
    s.z += dz / d * stepLen;
    if (d > 0.3) s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt * 6);
  }

  // How fast the ground lets a man walk in direction (ux, uz): slower uphill, a little
  // quicker down. Horses feel the slope more.
  groundPace(s, ux, uz) {
    const grade = (this.heightAt(s.x + ux * 1.5, s.z + uz * 1.5) - this.heightAt(s.x, s.z)) / 1.5;
    const k = s.reg.T.mounted ? 1.6 : 1.1;
    const wood = this.trees ? this.woodAt(s.x, s.z) * (s.reg.T.mounted ? 0.5 : 0.3) : 0;
    const water = this.river ? [1, 0.6, 0.35][this.river.depthAt(s.x, s.z)] : 1;
    if (this.river?.onBridge(s.x, s.z)) return 1;
    const mud = this.weather === 'rain' ? (s.reg.T.mounted ? 0.88 : 0.95) : 1;
    return Math.max(0.55, Math.min(1.15, 1 - grade * k)) * (1 - wood) * water * mud;
  }

  // Fatigue, 0 (fresh) to 1 (spent): fighting, charging and running wear men out; a
  // march wears them a little; standing still they get their breath back. Same for both sides.
  updateFatigue(r, dt) {
    if (r.gone || r.engine) return;
    const T = r.T, n = Math.max(1, r.alive);
    // About 30 s of hard fighting spends a regiment; a long march tells too.
    let gain = Math.min(1, r.engaged / n * 1.5) * (T.mounted ? 0.04 : 0.033);
    if (this.time < r.chargeUntil) gain += 0.03;
    if (r.routing) gain += 0.01;
    else if (r.dest) gain += (T.mounted ? 0.004 : 0.0025) * (r.targetReg ? 1.6 : 1);
    if (this.time - (r.lastShot ?? -99) < 2) gain += 0.004;
    if (r.engaged > 0 || this.time - (r.lastShot ?? -99) < 2) r.fought = true;
    if (gain === 0) r.fatigue = Math.max(0, r.fatigue - 0.012 * dt);
    else r.fatigue = Math.min(1, r.fatigue + gain * dt * kitTire(r) * (1 - r.vet * 0.08) * (1 + this.hunger[r.side] * 0.8));
  }

  // How much a regiment's tiredness and armour slow it.
  paceOf(r) { return (1 - (r.fatigue || 0) * 0.3) * kitPace(r); }

  // Put a regiment in an armour level (none, leather, mail, plate) and with or without shields;
  // left out, it wears what its type usually does. Changing r.armour or r.shield later works too.
  setArmour(r, armour, shield) {
    r.armour = ARMOUR[armour] ? armour : r.T.armour || 'none';
    r.shield = (shield ?? true) && canShield(r.T.key);
  }

  vetLabel(r) { return r.vet ? VET_RANKS[r.vet] : ''; }

  fatigueLabel(r) {
    const f = r.fatigue || 0;
    return f < 0.3 ? '' : f < 0.6 ? 'Tiring' : f < 0.85 ? 'Tired' : 'Exhausted';
  }

  // Bowmen get more arrows back at their own camp, or from the stores behind their own walls.
  restock(r, dt) {
    if (r.ammo >= r.maxAmmo || r.T.javelin) return;
    const h = this.fortHome(r.side);
    const own = r.posts && r.posts[0]?.perch.side === r.side;
    const home = Math.hypot(r.cx - h.x, r.cz - h.z) < 45;
    if (!own && !home) return;
    const was = r.ammo;
    r.ammo = Math.min(r.maxAmmo, r.ammo + r.maxAmmo * (home ? 0.04 : 0.012) * dt);
    if (was < 1 && r.ammo >= 1 && home) this.event(r.side, `${this.label(r)} have fresh arrows.`);
  }

  arrowsLabel(r) {
    if (!r.T.range || r.gone) return '';
    const each = r.ammo / Math.max(1, r.alive), what = r.T.javelin ? 'javelins' : 'arrows';
    return each < 1 ? `Out of ${what}` : `${Math.floor(each)} ${what}`;
  }

  // Still a shooting regiment: javelin men who have thrown theirs fight as foot.
  shoots(r) { return !!r.T.range && !(r.T.javelin && r.ammo < 1); }

  // How steeply a stands above b, from -1 to 1: a grade of 1 in 5 counts fully. For men
  // at close quarters, where a metre or two apart the height itself hardly differs.
  downhill(a, b) {
    const d = Math.max(1, Math.hypot(a.x - b.x, a.z - b.z));
    return Math.max(-1, Math.min(1, (this.heightAt(a.x, a.z) - this.heightAt(b.x, b.z)) / d / 0.2));
  }

  // Height advantage of a over b, from -1 (well below) to 1 (well above): 6 m counts as fully.
  above(a, b) {
    const dh = this.heightAt(a.x, a.z) - this.heightAt(b.x, b.z);
    return Math.max(-1, Math.min(1, dh / 6));
  }

  // Soldiers keep a little room; friend and foe alike, so battle lines press rather than merge.
  // Men on the wall only jostle men on the wall.
  separate() {
    const start = this.gStart, items = this.gItems;
    for (const s of this.soldiers) {
      if (!live(s) || s.climb > 0) continue;
      const sm = s.reg.T.mounted, rs = sm ? 1.1 : 0.55, lvl = s.level;
      const x0 = Math.max(0, Math.floor((s.x - 2.4 + GSPAN) / CELL)), x1 = Math.min(GN - 1, Math.floor((s.x + 2.4 + GSPAN) / CELL));
      const z0 = Math.max(0, Math.floor((s.z - 2.4 + GSPAN) / CELL)), z1 = Math.min(GN - 1, Math.floor((s.z + 2.4 + GSPAN) / CELL));
      for (let cz = z0; cz <= z1; cz++) for (let c = cz * GN + x0, e = cz * GN + x1; c <= e; c++) {
        for (let i = start[c], n = start[c + 1]; i < n; i++) {
          const o = items[i];
          if (o === s || o.level !== lvl || o.climb > 0) continue;
          const om = o.reg.T.mounted, min = rs + (om ? 1.1 : 0.55);
          const dx = s.x - o.x, dz = s.z - o.z, d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2), push = (min - d) * (lvl === 1 ? 0.15 : 0.25);
          // Horses shove infantry aside more than the other way round.
          const w = sm && !om ? 0.3 : !sm && om ? 1.7 : 1;
          s.x += dx / d * push * w;
          s.z += dz / d * push * w;
        }
      }
    }
  }

  // Nobody walks through a wall; men on the walkway stay on it.
  constrain() {
    const nav = this.nav;
    for (const s of this.soldiers) {
      if (!live(s) || s.climb > 0) continue;
      if (s.level === 1) { this.keepOnWall(s); s.y = this.walls.walkY(s.perch, s.x, s.z); continue; }
      const side = s.reg.side;
      if (nav.blockedAt(side, s.x, s.z) && !nav.blockedAt(side, s.lx, s.lz)) {
        // Slide along the wall rather than stop dead.
        if (!nav.blockedAt(side, s.x, s.lz)) s.z = s.lz;
        else if (!nav.blockedAt(side, s.lx, s.z)) s.x = s.lx;
        else { s.x = s.lx; s.z = s.lz; }
      }
    }
  }

  // Which way the blow lands on the target's formation: 0 front, 1 flank, 2 rear.
  // A schiltron and men on a wall have no flanks to turn.
  flankOf(attX, attZ, t) {
    if (t.reg.formation === 'square' || t.level === 1) return 0;
    const rel = Math.abs(angleDiff(Math.atan2(attX - t.x, attZ - t.z), t.reg.angle));
    return rel > 2.2 ? 2 : rel > 1.1 ? 1 : 0;
  }

  strike(s, t) {
    const A = s.reg.T, D = t.reg.T, tr = t.reg, ar = s.reg;
    const FA = FORMATIONS[ar.formation] || FORMATIONS.line, FD = FORMATIONS[tr.formation] || FORMATIONS.line;
    s.lunge = 1;
    s.struckAt = this.time; // anim
    // Among trees no formation holds together and no charge gathers pace.
    // Water does the same, and men standing in it fight badly.
    const wetA = this.river ? this.river.depthAt(s.x, s.z) : 0, wetD = this.river ? this.river.depthAt(t.x, t.z) : 0;
    const wood = Math.max(this.trees ? Math.max(this.woodAt(t.x, t.z), this.woodAt(s.x, s.z)) : 0, Math.max(wetA, wetD) * 0.4);
    let flank = tr.routing ? 0 : this.flankOf(s.x, s.z, t);
    let chance = 0.42 + (A.atk - defOf(tr)) * 0.05 - FD.def * (1 - wood) + this.captainBonus(ar) * 0.015 + (wetD - wetA) * 0.07;
    // Tired arms strike slower and guard worse.
    chance += (tr.fatigue || 0) * 0.03 - (ar.fatigue || 0) * 0.06;
    // Old soldiers fight better, and better still with their lord in the field.
    chance += (ar.vet - tr.vet) * 0.025 + this.lordBonus(ar) * 0.01 + (this.hasTrait(ar, 'killer') ? 0.02 : 0);
    // Out of hiding: the first blows of an ambush shake the men they fall on.
    if (!ar.ambushed && this.time - (ar.hiddenAt ?? -99) < 6 && ar.side !== tr.side) {
      ar.ambushed = true;
      tr.morale -= 12;
      chance += 0.1;
      this.event(tr.side, `${tr.name} is ambushed!`);
      this.event(ar.side, `${ar.name} springs an ambush!`);
    }
    if (tr.routing) chance += 0.35;
    chance += [0, 0.15, 0.3][flank];
    if (D.mounted && A.vsMounted) chance += A.vsMounted;
    if (hasShield(tr) && flank === 0) chance -= A.shieldbreak ? -0.05 : 0.05;   // long axes hook shields aside
    if (A.dog) { tr.morale -= 0.4; if (tr.routing) chance += 0.15; }
    // From the walkway, men strike down at climbers and those at the foot of the wall.
    // Most of all at a man on a ladder; the men at the foot can at least raise a shield.
    if (s.level === 1 && (t.level !== 1 || t.climb > 0)) chance += t.climb > 0 ? 0.25 : 0.1;
    if (t.climb > 0) chance += 0.15;
    // Fighting up a slope is hard work; down it, men put their weight behind each blow.
    const slope = s.level === 0 && t.level === 0 ? this.downhill(s, t) : 0;
    chance += slope * 0.08;
    let dmg = A.dmg;
    const braced = (D.braces && (flank === 0 || tr.formation === 'square')) && !tr.routing;
    if (A.charge && !s.charged && s.v > A.speed * 0.7) {
      s.charged = true;
      if (braced) {
        chance -= 0.1;
        this.hurt(s, 4);                       // riding onto braced spears
        ar.braced = (ar.braced || 0) + 1;
      } else {
        const full = (A.chargeMul || 2) * (FA.charge || 1) * (1 + Math.max(0, slope) * 0.3) * (1 - (ar.fatigue || 0) * 0.4) * (this.hasTrait(ar, 'reckless') ? 1.15 : 1);
        const mul = 1 + (full - 1) * (1 - wood * 0.8);
        chance += 0.35 * (1 - wood * 0.7);
        dmg *= mul;
        tr.morale -= 0.8 * (FA.charge || 1) * (1 - wood * 0.7);
        if (wood < 0.5) {
          const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz) || 1;
          t.x += dx / d * 1.5; t.z += dz / d * 1.5;
        }
      }
    } else if (!A.charge && this.time < ar.chargeUntil && !s.charged) {
      // Foot charging in: one hard first blow.
      s.charged = true;
      chance += 0.15;
      dmg *= 1.5 * (FA.charge || 1);
      tr.morale -= 0.3;
    }
    if (this.rand() < Math.max(0.05, Math.min(0.95, chance))) {
      tr.lastHit = this.time;
      tr.morale -= [0, 0.3, 0.6][flank] * FD.morale;
      audio.play('clash', s, this); // audio
      // Hacking at an engine's crew wrecks the engine too.
      if (tr.engine?.maxHp) tr.engine.hp -= dmg * 2;
      this.hurt(t, dmg, ar);
    }
  }

  hurt(t, dmg, by = null) {
    if (!t.alive) return;
    t.hp -= dmg;
    if (t.hp <= 0) this.kill(t, by);
  }

  kill(t, by = null) {
    const r = t.reg;
    t.alive = false;
    t.diedAt = this.time;
    t.fall = 0.001;
    t.target = null;
    if (t.captain) {
      const c = this.captains[r.side], L = this.lords[r.side];
      if (c && c.soldier === t) this.captainDied(c);
      if (L && L.soldier === t) this.lordDied(L);
      return;
    }
    this.losses[r.side]++;
    const lost = this.lostKit[r.side];
    lost[r.armour] = (lost[r.armour] || 0) + 1;
    if (hasShield(r)) lost.shields = (lost.shields || 0) + 1;
    if (by) by.kills++;
    const F = FORMATIONS[r.formation] || FORMATIONS.line;
    r.morale -= 60 / r.initial * F.morale * (1 - Math.min(0.3, this.captainBonus(r) * 0.03));
    if (!r.routing) {
      // The rearmost man steps forward into the gap.
      let back = null;
      for (const o of r.soldiers) if (live(o) && !o.captain && o.slot > t.slot && (!back || o.slot > back.slot)) back = o;
      if (back) back.slot = t.slot;
    }
    r.alive--;
  }

  updateMorale(r, dt) {
    if (r.gone || r.routing) return;
    const T = r.T;
    const top = T.morale * (1 + r.vet * 0.06) * (1 - this.hunger[r.side] * 0.3) + this.captainBonus(r) * 2 + this.lordBonus(r) * 4
      + (this.hasTrait(r, 'stubborn') ? 8 : 0) - (this.hasTrait(r, 'skittish') ? 8 : 0);
    if (r.regrouping) {
      r.morale += 3 * dt;
      if (r.morale >= T.morale * 0.6) {
        r.regrouping = false;
        this.event(r.side, `${this.label(r)} have regrouped at the keep.`);
      }
      return;
    }
    if (r.engaged > 0 && r.alive < r.initial * 0.5) r.morale -= 1.2 * dt * (T.merc ? 1.6 : 1);
    if (T.merc && r.alive < r.initial * 0.6) r.morale -= 0.4 * dt;
    // Men on their own walls take heart from them.
    const walled = r.posts && r.posts[0]?.perch.side === r.side;
    if (r.engaged === 0 && this.time - r.lastHit > 4) r.morale = Math.min(top, r.morale + 2 * dt);
    else if (walled) r.morale = Math.min(top, r.morale + 0.5 * dt);
    if (r.morale <= 0) this.startRout(r);
  }

  startRout(r) {
    r.routedOnce = true;
    r.routing = true;
    r.routedAt = this.time;
    r.dest = null;
    r.targetReg = null;
    r.morale = 0;
    this.clearPosts(r);
    r.pinch = null;
    for (const s of r.soldiers) { s.target = null; s.down = null; }
    this.event(r.side, `${this.label(r)} are routing!`);
    audio.play('rout', { x: r.cx, z: r.cz }, this); // audio
    for (const o of this.regs) {
      if (o === r || o.gone || o.routing) continue;
      const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
      if (o.side === r.side && d < 50) o.morale -= 8 * (FORMATIONS[o.formation]?.morale || 1);
      if (o.side !== r.side && d < 60) o.morale = Math.min(o.T.morale + 10, o.morale + 5);
    }
    for (const o of this.regs) if (o.targetReg === r && o.T.range) o.targetReg = null;
    this.updateRout(r);
  }

  updateRout(r) {
    // Run for the keep, swerving away from any enemy close behind.
    let nearest = null, nd = Infinity;
    for (const o of this.regs) {
      if (o.side === r.side || o.gone || o.routing) continue;
      const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
      if (d < nd) { nd = d; nearest = o; }
    }
    const h = this.homes[r.side];
    const home = Math.atan2(h.x - r.cx, h.z - r.cz);
    let dir = home;
    if (nearest && nd < 30) {
      const away = Math.atan2(r.cx - nearest.cx, r.cz - nearest.cz);
      dir = away + angleDiff(home, away) * 0.6;
    }
    r.fleeDir = dir;
    if (Math.hypot(h.x - r.cx, h.z - r.cz) < 45) { this.regroup(r); return; }
    if (!r.rallied && this.time - r.routedAt > 12 && nd > 45 && r.alive >= r.initial * 0.25 && !r.engine?.wrecked) {
      r.routing = false;
      r.rallied = true;
      r.morale = 30;
      r.x = r.cx; r.z = r.cz;
      r.angle = nearest ? Math.atan2(nearest.cx - r.cx, nearest.cz - r.cz) : r.angle;
      this.assignSlots(r);
      this.event(r.side, `${this.label(r)} have rallied.`);
    }
  }

  // Safe at the keep: form up in front of it and recover before taking orders again.
  regroup(r) {
    if (this.disbandAtHome[r.side]) {
      this.disband(r);
      this.event(r.side, `${this.label(r)} have fled the field.`);
      return;
    }
    const h = this.homes[r.side], toField = r.side === 0 ? -1 : 1;
    const k = this.regs.filter(o => o.side === r.side && o.regrouping).length;
    r.routing = false;
    r.regrouping = true;
    r.x = r.cx; r.z = r.cz;
    const angle = r.side === 0 ? Math.PI : 0;
    r.dest = { x: h.x + ((k % 4) - 1.5) * 42, z: h.z + toField * (40 + Math.floor(k / 4) * 24), angle };
    if (this.walls.any) {
      // Inside the walls, form up close round the keep instead.
      r.dest = { x: h.x + ((k % 4) - 1.5) * 14, z: h.z + toField * (14 + Math.floor(k / 4) * 10), angle };
    }
    this.reform(r);
    // (a village's militia don't regroup: the village sends them home to shelter, economy.js hide)
    if (!(r.T.militia && r.levy)) this.event(r.side, `${this.label(r)} reached the keep and are regrouping.`);
  }

  // How far this regiment's bows reach: further from a wall, furthest from a tower.
  rangeOf(r) {
    const T = r.T, wet = this.weather === 'rain' ? (T.pierce ? 0.9 : 0.8) : 1;
    if (!r.posts) return T.range * wet;
    const towers = r.posts.filter(p => p.perch.kind === 'tower').length;
    return T.range * wet * (towers > r.posts.length / 2 ? 1.5 : 1.3);
  }

  updateArchers(r, dt) {
    r.firingAt = null;
    if (r.gone || r.routing || (r.engaged > 0 && !r.posts)) return;
    this.restock(r, dt);
    if (r.ammo < 1) return;
    const T = r.T, base = this.rangeOf(r);
    let tgt = null;
    const dist = o => Math.hypot(o.cx - r.cx, o.cz - r.cz);
    // Shooting down from a hill carries further; shooting up falls short.
    const reach = o => {
      if (r.posts) return base;
      const up = this.above({ x: r.cx, z: r.cz }, { x: o.cx, z: o.cz });
      return base * (1 + up * (up > 0 ? 0.3 : 0.15));
    };
    let range = base;
    if (r.targetReg && !r.targetReg.gone) {
      range = reach(r.targetReg);
      if (dist(r.targetReg) <= range && this.sees(r.side, r.targetReg)) tgt = r.targetReg;
    } else if (!r.dest && r.fireAtWill) {
      // Loose at will: the nearest enemy in range, sparing anyone already in melee with friends.
      // From a wall, engines and ladder men come first.
      let bd = Infinity;
      for (const o of this.regs) {
        if (o.side === r.side || o.gone || (o.engaged > 0 && !o.posts) || !this.sees(r.side, o)) continue;
        const d = dist(o), R = reach(o);
        if (d > R) continue;
        const score = d / R * (r.posts && o.engine ? 0.6 : 1);
        if (score < bd) { bd = score; tgt = o; range = R; }
      }
    }
    if (!tgt) return;
    r.firingAt = tgt;
    if (!r.posts) r.angle = turnToward(r.angle, Math.atan2(tgt.cx - r.cx, tgt.cz - r.cz), dt * 1.5);
    for (const s of r.soldiers) {
      if (!live(s) || s.target || s.climb > 0 || s.captain) continue;
      // Men still climbing to their posts don't shoot yet.
      if (r.posts && s.level !== 1) continue;
      s.fireCd -= dt;
      if (s.fireCd > 0) continue;
      s.fireCd = T.reload * (0.75 + this.rand() * 0.5);
      r.lastShot = this.time;
      this.loose(s, tgt, range);
      if (--r.ammo < 1) { if (!r.T.javelin) this.event(r.side, `${this.label(r)} are out of arrows.`); break; }
    }
  }

  loose(s, tgtReg, range) {
    let o = null;
    for (let i = 0; i < 6 && !o; i++) {
      const c = tgtReg.soldiers[Math.floor(this.rand() * tgtReg.soldiers.length)];
      if (live(c)) o = c;
    }
    if (!o) return;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d > range * 1.15) return;
    const T = 0.6 + d / 48;
    const spread = 0.8 + d * 0.025 * (s.reg.T.pierce ? 0.8 : 1);
    const x1 = o.x + o.vx * T + (this.rand() - 0.5) * 2 * spread;
    const z1 = o.z + o.vz * T + (this.rand() - 0.5) * 2 * spread;
    s.yaw = Math.atan2(o.x - s.x, o.z - s.z);
    s.lunge = 0.6;
    s.shotAt = this.time; // anim
    this.arrows.push({
      x0: s.x, y0: s.y + 1.6, z0: s.z, x1, z1, y1: (o.level === 1 ? o.y : this.heightAt(x1, z1)) + 0.9,
      t: 0, T, h: 2 + d * (s.reg.T.pierce ? 0.08 : 0.16), dmg: s.reg.T.arrowDmg, pierce: s.reg.T.pierce || 0, side: s.reg.side, from: s.reg,
      bolt: !!s.reg.T.pierce && !s.reg.T.javelin, javelin: !!s.reg.T.javelin,
    });
    audio.play('bow', s, this); // audio
  }

  updateArrows(dt) {
    let w = 0;
    for (const a of this.arrows) {
      a.t += dt;
      if (a.t < a.T) { this.arrows[w++] = a; continue; }
      let hit = null, hd = Infinity;
      this.forNear(a.x1, a.z1, 1.5, o => {
        const d = (o.x - a.x1) ** 2 + (o.z - a.z1) ** 2;
        const rad = o.reg.T.mounted ? 1.3 : 0.75;
        if (d < rad * rad && d < hd) { hd = d; hit = o; }
      });
      if (!hit) continue;
      const pierce = a.pierce || 0, guard = arrowGuard(hit.reg);
      // Armour stops a share of arrows; bolts and javelins punch through much of it.
      let chance = 0.68 * (guard + (1 - guard) * pierce);
      if (hasShield(hit.reg) && !hit.reg.routing && this.flankOf(a.x0, a.z0, hit) === 0) chance *= 1 - 0.45 * (1 - pierce);
      // Merlons cover men on a wall; a ram's roof covers its crew.
      if (hit.level === 1 && hit.perch) chance *= hit.perch.material === 'stone' ? 0.45 : 0.7;
      if (hit.reg.engine?.roof && !hit.reg.routing) chance *= hit.reg.engine.roof;
      // Ladders carried overhead are a roof of sorts for the men under them.
      if (hit.reg.engine?.kind === 'ladder' && hit.reg.targetWall && !hit.reg.routing) chance *= 0.25;
      if (this.weather === 'rain') chance *= pierce ? 0.9 : 0.75;
      if (this.weather === 'night') chance *= 0.8;
      // Miners at work are under the cover of their sap.
      if (hit.reg.mine && !hit.reg.dest) chance *= 0.3;
      if (this.rand() < chance) {
        hit.reg.morale -= this.hasTrait(hit.reg, 'steady') ? 0.12 : 0.25;
        hit.reg.arrowHits = (hit.reg.arrowHits || 0) + 1;
        audio.play('arrowhit', hit, this); // audio
        hit.reg.lastHit = this.time;
        hit.reg.shotBy = a.from;
        this.hurt(hit, a.dmg, a.from);
      }
    }
    this.arrows.length = w;
  }

  // Melee regiments left standing with no orders don't stand and take it: they go for
  // a foe who comes within 25 m, or for the bowmen shooting them from up to 60 m.
  // Hold, the walls, engines and the siege AI's men keep to what they were doing.
  answerFoes() {
    for (const r of this.regs) {
      if (!this.usable(r) || this.shoots(r) || r.engine || r.hold || r.posts || r.dest || r.targetReg || r.targetWall || r.burnTarget || r.ai === 'siege') continue;
      const ok = o => o.side !== r.side && this.usable(o) && !o.posts && !o.gone && o.alive > 0 && this.sees(r.side, o)
        && (!this.nav.any || this.nav.reachable(r.side, r.cx, r.cz, o.cx, o.cz));
      let best = null, bd = 25;
      for (const o of this.regs) {
        if (!ok(o)) continue;
        const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
        if (d < bd) { bd = d; best = o; }
      }
      const shooter = r.shotBy;
      if (!best && shooter && this.time - r.lastHit < 3 && ok(shooter) && Math.hypot(shooter.cx - r.cx, shooter.cz - r.cz) < 60) best = shooter;
      if (best) this.orderAttack([r], best);
    }
  }

  checkVictory() {
    if (this.winner !== null || !this.checkWinner) return;
    for (let side = 0; side < 2; side++) {
      const standing = this.regs.some(r => r.side === side && !r.gone && !r.routing && !r.regrouping);
      if (!standing) {
        this.winner = 1 - side;
        this.event(this.winner, this.winner === 0 ? 'Victory: the enemy army has broken.' : 'Defeat: your army has broken.');
        return;
      }
    }
  }

  moraleLabel(r) {
    if (r.gone) return r.engine?.wrecked ? 'Wrecked' : r.soldiers.some(s => s.alive) ? 'Fled' : 'Destroyed';
    if (r.routing) return 'Routing';
    if (r.regrouping) return 'Regrouping';
    const m = r.morale / r.T.morale;
    return m > 0.75 ? 'Steady' : m > 0.4 ? 'Shaken' : 'Wavering';
  }

  // What a regiment is up to, for its card.
  doingLabel(r) {
    if (r.gone || r.routing || r.regrouping) return '';
    const E = r.engine;
    if (E?.kind === 'ladder' && r.targetWall) return E.raising > 0 ? 'Raising ladders' : 'Carrying ladders';
    if (E && r.targetWall) return r.dest ? 'Moving up' : E.ready < (E.setup || 0) ? 'Setting up' : 'Battering';
    if (r.posts) return r.posts[0]?.perch.side === r.side ? 'On the walls' : 'Storming the walls';
    if (r.targetWall) return 'Attacking the wall';
    if (r.burnBridge) return 'Burning the bridge';
    if (r.mine && !r.mine.done && !r.mine.lost) return r.mine.side === r.side ? `Digging a mine ${Math.floor(r.mine.progress * 100)}%` : 'Counter-mining';
    if (r.seen === false) return 'Hidden in the woods';
    if (r.hold) return 'Holding';
    return '';
  }
}
