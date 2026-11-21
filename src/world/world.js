// The campaign map: a realm of about thirty places, the roads between them, and armies
// marching along those roads. Places you hold are full villages (economy.js) that keep
// running while you look elsewhere. Everyone else's places are holdings run on the same
// rules at a coarser grain: people grow, workshops make arms, and soldiers are raised
// from the people. The rival houses' minds are in rivals.js.
import { Battle, TYPES } from '../battle.js';
import { makeVassal, vassalOf, holdingsOf, living, mark, remember as recall, opinion, share, tickVassals, endFeud, prisoners, interact, owe, seatPower, harmWeight, levyShare, TITLED, DUES, LEVIES, RECONCILE } from './vassals.js';
import { tickCompanies, tickHousehold, companiesIn, MOOD as COMPANY_MOOD } from './companies.js';
import { assignCaptain, releaseCaptain, tickRansoms, captainOf } from './captains.js';
import { seedEconomy, runEconomy, housing, kits, arm, fromTown, burn, stores, report, worth, WEALTH } from './holdings.js';
import { Town, ELITE, HALL, gearOf, carry, armourWeight, outfit, outfitKit, ARMOUR_GOOD, baseArmour, weaponKit } from '../economy.js';
import { rng } from '../noise.js';
import { thinkAI, thinkSiegeAttack } from '../ai.js';
import { ground, layPlace, layoutOf, walledPlace, remember, grownLevels, keepLevelFor } from './places.js';
import { generateRealm, generateBeyond, KINDS, BANDITS, INVADER, REALM_RADIUS } from './realm.js';
import { thinkHouses, startHouseMinds, startMind } from './rivals.js';
import { supplyArmies, moveWagon, catchWagons, tickTrade, followCart, provision, takeFood, capacity, wound, heal, foodLeft, homeland, QUARTERED } from './supply.js';
import { govern } from './governor.js';
import { turnOut, mourn, sendHome } from './militia.js';
import { tickEvents } from './events.js';
import { payElites, tickMarkets } from './treasury.js';
import { tickWorks, cathedralRule, cathedralDone, workDone } from './works.js';
import { tickDecrees, decreeMood, decreed } from './decrees.js';
import { startDiplomacy, thinkDiplomacy, note, strengthOf, backers, grudge, tauntFor } from './diplomacy.js';

// The houses of this campaign by index (you are 0), and the bandits last. Filled in by
// the World so drawing code can look owners up without holding the world.
export const FACTIONS = [];
export const NEUTRAL = { name: 'Free folk', short: 'Free', color: '#b8ab90' };
export const ownerOf = p => (p.owner === null ? NEUTRAL : FACTIONS[p.owner]);

const VALUE = { spear: 1, sword: 1.25, archer: 0.9, cav: 2.2, militia: 0.7, bandit: 0.7,
  crossbow: 1.1, lightcav: 1.6, heavycav: 2.6, maa: 1.5, knight: 3.2 };
const value = key => TYPES[key]?.value ?? VALUE[key] ?? 1;
export const power = units => units.reduce((n, u) => n + u.count * value(u.key) * armourWeight(u), 0);
export const headcount = units => units.reduce((n, u) => n + u.count, 0);

const SPEED = 6;        // world units a second along a road
const MEET = 14;        // opposing armies this close fight
// A rival place's smithy makes kit for one man every ninety seconds (yours, run hard, make
// one every twelve), and families settle in its houses as they do in yours.
const SMITHY = 1 / 90, ARRIVALS = 1 / 18;
const LORD_HERE = 8;          // mood in the village where your lord is
const BANNER_GUARD = 20;      // men every village keeps home when the banners are called
const KNIGHT_LEVEL = 3;       // a captain of this level may be knighted with a village
const LADIES = new Set(['Ada', 'Bryony', 'Elswyth', 'Gunnora', 'Hawise', 'Joan', 'Mabel']);
const SIEGE_MEAL = 160;       // seconds a unit of food feeds one mouth in a besieged place
const STARVE = 150;           // seconds of hunger before a besieged place yields
export const GRACE = 1200;     // rival houses leave the free villages beside yours alone for twenty minutes
// Rival aggression (a campaign option): how soon the houses move up their stages (rivals.js
// STAGES), not how strong they are.
export const AGGRESSION = { gentle: { name: 'Gentle', stage: 1.35 }, normal: { name: 'Normal', stage: 1 }, fierce: { name: 'Fierce', stage: 0.7 } };
export const fierceness = w => AGGRESSION[w.options?.aggression] || AGGRESSION.normal;
export const grace = w => GRACE * fierceness(w).stage;
// Gold a person pays a second at fair taxes, yours and the rivals' alike (merchants 1.5×).
export const TAX = 0.012;
// How a house fills its racks (economy.js POLICIES): Varn raises light and fast, Stonemere
// and the rich houses armour every man they can, Dunmore and Wyndham keep the best for
// their halls.
const ARMOUR_POLICY = { raider: 'none', turtler: 'best', builder: 'best', merchant: 'best', hothead: 'elites', schemer: 'elites' };
export const armourPolicy = h => (h ? ARMOUR_POLICY[h.trait] ?? 'best' : 'best');
const SIGHT = { place: 250, army: 190 };
// The price of a free place's fealty: gold for each of its people and each man of its
// garrison, half again for a market, abbey or castle.
// What outlaws carry off when they get away from a village of yours: a share of its
// stores, and of the treasury up to a cap.
const OUTLAW_TAKE = { share: 0.35, gold: 120 };
export const TREAT = { folk: 6, man: 10, rich: ['market', 'monastery', 'castle'], richer: 1.5 };

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// What a place's stores hold when you fight in it: its real stores if it keeps them,
// else a rough guess from its size.
function storesOf(p, lvl, base = 30) {
  return p.eco?.stock ? stores(p.eco) : { wood: base + lvl * 20, stone: 10 + lvl * 10, food: 40 + lvl * 20, planks: 10 };
}

// (places are laid out by places.js: one layout for every view of a place)
export { walledPlace };

function prebuild(town, kinds, rand, near = 25) {
  for (const kind of kinds) {
    for (let tries = 0; tries < 200; tries++) {
      const a = rand() * Math.PI * 2, r = near + rand() * (95 - near);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!town.canPlace(kind, x, z, { free: true }).ok) continue;
      town.place(kind, x, z, { ready: true });
      break;
    }
  }
}

export class World {
  // hooks: watching() → the place on screen, ask(encounter), townAttacked(place, army),
  // fell(place), captured(place), ended(winner), herald({ house, title, text })
  constructor(seed, hooks, options = {}) {
    this.seed = seed;
    this.hooks = hooks;
    // Chosen when the campaign begins (index.html), kept in the save.
    this.options = { size: 'normal', aggression: 'normal', ironman: false, ...options };
    this.rand = rng(seed + 3);
    this.time = 0;
    this.events = [];
    this.armies = [];
    this.nextArmy = 1;
    this.encounter = null;
    this.winner = null;
    this.half = REALM_RADIUS + 140;

    const realm = generateRealm(seed, this.options.size);
    FACTIONS.length = 0;
    for (const h of realm.houses) FACTIONS.push({ ...h, gold: 100, arms: 0, alive: true });
    this.bandits = FACTIONS.length;
    FACTIONS.push({ ...BANDITS, index: this.bandits, gold: 0, arms: 0, alive: true });
    this.houses = FACTIONS;
    this.wars = new Set();          // "i:j" with i < j
    this.met = new Set();           // houses that have sent you word
    this.pois = realm.places.map((p, i) => ({ ...p, seed: seed + 1000 * (i + 1), garrison: [], town: null, seen: false, visible: false }));
    const byOld = new Map(realm.places.map((p, i) => [p, this.pois[i]]));
    for (const p of this.pois) p.links = p.links.map(q => byOld.get(q));
    this.roads = realm.roads.map(r => ({ a: byOld.get(r.a), b: byOld.get(r.b) }));
    this.crown = byOld.get(realm.crown);
    for (const h of FACTIONS) if (h.seat) h.seat = byOld.get(h.seat);
    this.home = FACTIONS[0].seat;
    this.byId = Object.fromEntries(this.pois.map(p => [p.id, p]));
    this.byId.ashford = this.home;

    for (const p of this.pois) {
      if (p.kind === 'camp') p.owner = this.bandits;
      // Your village starts with a couple of family houses, so it can grow from the first minute.
      if (p.owner === 0) { const t = this.makeTown(p, { kind: p.kind }); prebuild(t, ['house', 'house'], t.rand); }
      else this.seedHolding(p);
    }
    // The north, past the old wall: fixed now, opened in Part 2. `wall` is for drawing.
    this.part = 1;
    this.invader = null;
    this.beyond = generateBeyond(seed, this.pois);
    this.wall = { points: this.beyond.wall, fallen: false, breaches: [] };
    this.ecoClock = 0;
    this.spies = [];
    this.captains = [];
    this.chronicle = [];
    this.vassals = [];
    this.sightClock = 0;
    startHouseMinds(this);
    startDiplomacy(this);
    this.updateVision();
    // The opening says you are safe for now (creator, 2026-11-20).
    this.log(`The great houses are all still settling their own lands: none will march on you for a while. But outlaws haunt the woods and know what a new village keeps${this.options?.aggression === 'gentle' ? '' : ', and a band will come for your stores within the first quarter hour'}. Keep your retinue at home while you see to food, wood and homes, and when the outlaws come, select it and right-click them.`);
  }

  log(text, side = 0) { this.events.push({ time: this.time, side, text }); }
  // The campaign's own story, kept apart from the running log: only what a chronicler
  // would write down (battles, places won and lost, lords fallen, wars, crowns).
  chron(text) { (this.chronicle ||= []).push({ at: Math.round(this.time), text }); if (this.chronicle.length > 400) this.chronicle.shift(); }

  // ---- who fights whom ----

  warKey(i, j) { return i < j ? `${i}:${j}` : `${j}:${i}`; }
  atWar(i, j) {
    if (i === j || i === null || j === null) return false;
    if (i === this.bandits || j === this.bandits) return true;
    if (i === this.invader || j === this.invader) return true;
    return this.wars.has(this.warKey(i, j));
  }
  // An army of side `s` may attack place p: free villages and anyone at war with it.
  canAttack(s, p) { return p.owner !== s && (p.owner === null || this.atWar(s, p.owner)); }

  declareWar(i, j, quiet = false) {
    if (i === j || this.atWar(i, j)) return;
    this.wars.add(this.warKey(i, j));
    const a = FACTIONS[i], b = FACTIONS[j];
    if (i === 0) this.meet(j);
    if (j === 0) {
      this.meet(i);
      this.chron(`${a.name} went to war with you.`);
      if (quiet) return;
      const line = tauntFor(this, a);
      this.log(`${a.name} has declared war on you!`, 1);
      this.hooks.sound?.('boom'); // audio
      this.hooks.herald?.({ house: a, title: `${a.lord} declares war`, text: line ? `“${line}”` : '' });
    } else if (i === 0) {
      this.log(`You have declared war on ${b.name}.`);
      this.chron(`You declared war on ${b.name}.`);
    } else if (this.knows(i) || this.knows(j)) {
      this.log(`${a.name} has gone to war with ${b.name}.`, 2);
    }
  }

  makePeace(i, j) {
    if (!this.wars.delete(this.warKey(i, j))) return;
    const a = FACTIONS[i], b = FACTIONS[j];
    if (i === 0 || j === 0) { this.log(`Peace is made with ${(i === 0 ? b : a).name}.`); this.chron(`Peace was made with ${(i === 0 ? b : a).name}.`); }
    else if (this.knows(i) || this.knows(j)) this.log(`${a.name} and ${b.name} have made peace.`, 2);
    for (const army of this.armies) {
      const other = army.side === i ? j : army.side === j ? i : null;
      if (other !== null && army.target && army.target.owner === other && army.side !== 0) this.retreat(army);
    }
  }

  strength(i) { return strengthOf(this, i); }

  // You have met a house once you have seen one of its places.
  // A house you have dealt with (war, heralds, offers) is known even before you find its lands.
  knows(h) { return this.met.has(h) || this.pois.some(p => p.owner === h && p.seen); }
  meet(h) { if (h !== null && h !== undefined && h !== 0) this.met.add(h); }

  // ---- holdings you don't run by hand ----

  seedHolding(p) {
    const K = KINDS[p.kind], g = K.garrison || 1;
    const lvl = p.kind === 'crown' ? 3 : p.seat !== undefined ? 2 : 1;
    // Rival holdings and free villages keep a real economy (holdings.js); camps and the
    // north keep the old rough one.
    const tracked = p.kind !== 'camp' && !FACTIONS[p.owner]?.invader;
    p.eco = tracked ? seedEconomy(p, this.rand, { seat: p.seat !== undefined, crown: p.kind === 'crown', kindPop: K.pop })
      : { pop: Math.round((p.seat !== undefined ? 55 : 32) * K.pop + (p.kind === 'crown' ? 30 : 0)), level: lvl, arms: 0 };
    // No two places keep quite the same guard: poor ones fewer, and a rich trading town
    // trusts to its coin more than its walls.
    const guard = tracked ? WEALTH[p.eco.wealth].guard * (p.eco.focus === 'trade' ? 0.6 : p.eco.focus === 'military' ? 1.25 : 1) : 1;
    const vary = (0.7 + this.rand() * 0.6) * guard;
    const n = k => Math.round(k * g * vary);
    if (p.kind === 'camp') p.garrison = [unit('bandit', 30 + Math.floor(this.rand() * 15), `${p.name.replace(/ Camp$/, '')} outlaws`)];
    else if (FACTIONS[p.owner]?.invader) p.garrison = northGarrison(p, this.rand);
    else if (p.kind === 'crown') p.garrison = [unit('spear', 40, 'Royal guard'), unit('sword', 40, 'Royal men-at-arms'), unit('archer', 30, 'Royal archers'), unit('militia', 40, 'City watch')];
    else if (p.owner === null) p.garrison = [unit('militia', n(26), `${p.name} militia`), unit('archer', n(10), `${p.name} bowmen`)];
    else {
      const h = FACTIONS[p.owner];
      p.garrison = p.seat !== undefined
        ? [unit('spear', 16, `${h.short} spearmen`), unit('sword', 8, `${h.short} men-at-arms`), unit('archer', 8, `${h.short} archers`)]
        : [unit('spear', n(9), `${h.short} spearmen`), unit('archer', n(5), `${h.short} archers`)];
    }
  }

  // How many men a holding keeps at home before sending the rest to its lord.
  keepHome(p) {
    const K = KINDS[p.kind], settling = p.owner !== null && FACTIONS[p.owner]?.ai?.stage === 0;
    return Math.round((20 + p.eco.level * 8) * (K.garrison || 1) * (p.seat !== undefined ? 1.6 : 1) * (settling ? 0.5 : 1));
  }

  popCap(p) { return p.eco.buildings ? housing(p.eco) : (25 + p.eco.level * 22) * KINDS[p.kind].pop; }

  // Every few seconds: people grow toward what the place can hold, the house collects
  // taxes and arms, and the place keeps its own garrison filled from its people.
  tickHoldings(dt) {
    for (const h of FACTIONS) if (!h.bandit && !h.invader) h.arms = 0;
    for (const p of this.pois) {
      if (p.town || !p.eco) continue;
      const K = KINDS[p.kind], e = p.eco, h = p.owner === null ? null : FACTIONS[p.owner];
      if (e.buildings) { this.tickEconomy(p, dt, K, e, h); continue; }
      // Camps and the northern host: people grow toward what the place holds, and arms
      // come at a rough rate (the north is a war machine and keeps its own pace).
      const cap = this.popCap(p);
      if (e.pop < cap) e.pop = Math.min(cap, e.pop + dt * ARRIVALS * K.pop);
      const arms = h?.invader ? dt * e.pop * 0.0011 * K.arms : dt * SMITHY * K.arms;
      if (h && !h.bandit) { h.gold += dt * e.pop * TAX * K.gold; h.arms += arms; }
      else e.arms += arms;
      const pool = h && !h.bandit ? h : e;
      const want = this.keepHome(p), have = headcount(p.garrison);
      if (have < want && pool.arms >= 3 && e.pop > 12) {
        const k = Math.min(Math.floor(pool.arms), want - have, 6);
        pool.arms -= k;
        e.pop -= k;
        const key = h?.bandit ? 'bandit' : h ? pickKind(h, this.rand(), this.time) : 'militia';
        recruit(p.garrison, key, k, h ? `${h.short} ${TYPES[key]?.name?.toLowerCase() || key}` : `${p.name} militia`);
      }
    }
  }

  // A place with a real economy (holdings.js): it works, eats, builds and arms. Its lord
  // takes the taxes and half of what its market earns; it keeps its own garrison filled
  // from its own kit and people.
  tickEconomy(p, dt, K, e, h) {
    const lvl = e.level;
    const pace = h?.trait === 'builder' ? 1.15 : h?.trait === 'raider' || h?.trait === 'hothead' ? 1.05 : 1;
    const traded = runEconomy(p, dt, { pace });
    const v = vassalOf(this, p);
    // Rival lords tax as you do at fair taxes, the merchant house half as much again; a
    // vassal at a middling mood.
    const taxes = dt * e.pop * K.gold * TAX * (v ? 0.9 : h?.trait === 'merchant' ? 1.5 : 1);
    // A vassal keeps what his village earns, less your dues.
    if (v) FACTIONS[0].gold += share(this, v, taxes + traded);
    else if (h && !h.bandit) { h.gold += taxes + traded / 2; e.gold += traded / 2; }
    else e.gold += taxes * 0.5 + traded;
    const want = this.keepHome(p), have = headcount(p.garrison);
    if (have < want) for (const u of arm(e, Math.min(6, want - have), Math.max(12, housing(e) * 0.4), v ? 'best' : armourPolicy(h)))
      recruit(p.garrison, u.key, u.count, h && !v ? `${h.short} ${TYPES[u.key].name.toLowerCase()}` : `${p.name} ${TYPES[u.key].name.toLowerCase()}`, null, gearFields(u));
    if (h && !h.bandit && !v) h.arms += kits(e);
    if (h && !h.bandit && !h.invader && !v && e.buildings.hall) this.trainHall(p, e, h, dt);
    if (e.level > lvl && p.visible) this.log(`${p.name} has grown.`, 2);
  }

  // A rival's knights' hall, on your rules (economy.js ELITE, HALL): veterans of its
  // garrison drill in batches for their kit and a fee, and march out as men-at-arms or
  // knights (Dunmore's as knights when there are horses).
  trainHall(p, e, h, dt) {
    const T = e.training;
    if (T) {
      T.left -= dt;
      if (T.left > 0) return;
      e.training = null;
      p.garrison.push({ ...unit(T.key, T.n, `${h.short} ${TYPES[T.key].name.toLowerCase()}`), xp: T.xp + 2, elite: true, armour: T.armour ?? baseArmour(T.key), shield: T.shield ?? true });
      return;
    }
    const elites = p.garrison.filter(u => u.elite).reduce((n, u) => n + u.count, 0);
    // Veterans come to the hall from any of the house's garrisons; once the house reaches
    // beyond its own lands (rivals.js STAGES) and has gold to keep them, any of its men will do.
    const held = this.pois.filter(q => q.owner === h.index && !q.town);
    const anyMan = (h.ai?.stage ?? 0) >= 1 && h.gold > 600;
    const vets = held.flatMap(q => q.garrison).filter(u => !u.elite && (anyMan || (u.xp || 0) >= HALL.veteran) && !TYPES[u.key]?.engine && u.key !== 'sellsword' && u.key !== 'hiredxbow');
    // A great house's hall keeps more men the more places it holds.
    const room = Math.round(HALL.cap * Math.max(1, held.length / 2)) - elites, have = vets.reduce((n, u) => n + u.count, 0);
    if (room <= 0 || !have) return;
    // Weapons, and mail at the least (plate if there is enough), as in your hall.
    const has = g => Math.floor(e.stock[g] || 0);
    const kitN = k => Math.min(Math.max(has('mail'), has('armour')), ...Object.entries(weaponKit(k)).map(([g, q]) => Math.floor(has(g) / q)));
    const key = h.trait === 'hothead' && kitN('knight') >= 3 ? 'knight' : 'maa';
    const n = Math.min(HALL.batch, room, have, kitN(key), Math.floor(h.gold / ELITE[key].fee));
    if (n < 3) return;
    const fit = outfit(key, n, has, 'best', true);
    if (!fit) return;
    for (const [g, q] of Object.entries(outfitKit(key, n, fit))) e.stock[g] = (e.stock[g] || 0) - q;
    h.gold -= ELITE[key].fee * n;
    let left = n, xp = 0;
    for (const u of vets.sort((x, y) => (y.xp || 0) - (x.xp || 0))) {
      const k = Math.min(left, u.count);
      u.count -= k; left -= k; xp = Math.max(xp, u.xp || 0);
      if (!left) break;
    }
    for (const q of held) q.garrison = q.garrison.filter(u => u.count > 0);
    e.training = { key, n, xp, left: ELITE[key].drill * n, ...fit };
  }

  // A house raises men for its field army at its muster place, drawing them from whichever
  // of its places has people to spare.
  raiseFromPeople(h, at, n) {
    let raised = 0;
    // Places with a real economy arm men from their own stores and people.
    for (const p of this.pois.filter(p => p.owner === h.index && p.eco?.buildings).sort((p, q) => kits(q.eco) - kits(p.eco))) {
      if (raised >= n) break;
      for (const u of arm(p.eco, Math.min(n - raised, 6), Math.max(12, housing(p.eco) * 0.45), armourPolicy(h))) {
        recruit(at.garrison, u.key, u.count, null, h, gearFields(u));
        raised += u.count;
      }
    }
    if (raised) h.arms = Math.max(0, h.arms - raised);
    while (raised < n && h.arms >= 1) {
      const from = this.pois.filter(p => p.owner === h.index && p.eco && !p.eco.buildings && p.eco.pop > this.popCap(p) * 0.45)
        .sort((p, q) => q.eco.pop / this.popCap(q) - p.eco.pop / this.popCap(p))[0];
      if (!from) break;
      const k = Math.min(n - raised, 6, Math.floor(h.arms));
      from.eco.pop -= k;
      h.arms -= k;
      recruit(at.garrison, pickKind(h, this.rand(), this.time), k, null, h);
      raised += k;
    }
    return raised;
  }

  // ---- your villages ----

  // The direction of a road leaving `p` toward `q`, as an angle on p's own village map.
  angle(p, q) { return Math.atan2(q.x - p.x, q.z - p.z); }

  makeTown(p, opts) {
    // (the same ground the place was planned on, places.js)
    const { roadAngles, heightAt, onRoad, trees } = ground(p);
    p.roadAngles = roadAngles;
    const battle = new Battle(heightAt, p.seed, { deploy: false, homes: [{ x: 0, z: 0 }, { x: 0, z: -225 }], disbandAtHome: [false, true] });
    const town = new Town(battle, heightAt, trees, rng(p.seed + 7), { kind: p.kind, ...opts });
    town.purse = FACTIONS[0];
    town.onFall = () => { p.falling = true; };
    town.rebelHouse = this.bandits;
    // A knights' hall wants the rank of Count, and its finishing is a moment.
    town.hallRule = () => ['Count', 'Duke', 'King'].includes(this.rank) ? null : 'From the rank of Count';
    town.greatRule = () => cathedralRule(this);
    // Finished buildings go on the Needs you list for a while (alerts.js).
    town.onBuilt = b => { if (p.owner === 0 && b.kind !== 'house') { (this.built ||= []).push({ p: p.id, name: b.B.name, icon: b.B.icon, at: this.time }); if (this.built.length > 12) this.built.shift(); } };
    town.levyMax = () => (['Duke', 'King'].includes(this.rank) ? 40 : 20);
    town.onMilestone = b => {
      if (p.owner !== 0) return;
      if (b?.kind === 'cathedral') return cathedralDone(this, p);
      this.log(`A knights' hall stands in ${p.name}. Your veterans may train there as men-at-arms and knights.`, 0);
      this.hooks.herald?.({ house: FACTIONS[0], title: `A knights' hall in ${p.name}`, text: 'Your veterans may train there as men-at-arms and knights: few, costly, slow to replace, and the best men in the realm.' });
      this.hooks.rankUp?.('hall');
    };
    // Hired companies stationed here weigh on the village's mood.
    // ... and your lord in person lifts it while he is there.
    town.moodHooks = [() => [companiesIn(this, town) * COMPANY_MOOD, 'sellswords in the village'], () => [this.lordAt() === p ? LORD_HERE : 0, 'the lord is here'], () => decreeMood(this), () => [town.time < (town.quarteredUntil || 0) ? QUARTERED.mood : 0, 'soldiers quartered on the farms']];
    town.onRebel = n => {
      if (p.owner !== 0) return;
      this.log(`${n} villagers of ${p.name} have risen in revolt!`, 1);
      this.hooks.sound?.('mob'); // audio
      this.hooks.herald?.({ house: FACTIONS[this.bandits], title: `${p.name} rises`, text: `Taxed and hungry and grieving, ${n} of your own people have taken up pitchforks. Put them down, then ease their lot.` });
    };
    Object.assign(p, { town, heightAt, trees, garrison: [], aiClock: 0, pruneClock: 30, onRoad });
    return town;
  }

  // ---- armies ----

  spawnArmy(side, units, at, name, mode = 'march') {
    const h = FACTIONS[side];
    const a = { id: this.nextArmy++, side, units, name: name || (side === 0 ? 'Your army' : `${h.short} host`),
      x: at.x, z: at.z, at, last: at, path: [], heading: 0, halted: false, retreating: false, mode, target: null, visible: side === 0 };
    if (mode !== 'wagon') provision(a);
    this.armies.push(a);
    if (mode !== 'wagon') assignCaptain(this, a);
    return a;
  }

  removeArmy(a) { this.armies = this.armies.filter(o => o !== a); a.gone = true; releaseCaptain(this, a); }

  // Shortest way by road from one place to another.
  // pass(p), if given, says which places on the way may be marched through.
  route(from, to, pass = null) {
    const d = new Map(this.pois.map(p => [p, Infinity])), prev = new Map();
    d.set(from, 0);
    const open = new Set(this.pois);
    while (open.size) {
      let u = null;
      for (const p of open) if (!u || d.get(p) < d.get(u)) u = p;
      open.delete(u);
      if (u === to || d.get(u) === Infinity) break;
      for (const q of u.links) {
        if (pass && q !== to && !pass(q)) continue;
        const nd = d.get(u) + dist(u, q);
        if (nd < d.get(q)) { d.set(q, nd); prev.set(q, u); }
      }
    }
    const path = [];
    for (let p = to; p && p !== from; p = prev.get(p)) path.unshift(p);
    return { path, length: d.get(to) };
  }

  // March to a place. An army out on a road turns back or carries on, whichever is shorter.
  // pass, if given, limits the places it may march through (see route).
  order(a, dest, pass = null) {
    if (a.halted || a.retreating) return false;
    a.escort = null;
    const ends = a.at ? [a.at] : [a.last, a.path[0]].filter(Boolean);
    let best = null;
    for (const e of ends) {
      const r = this.route(e, dest, pass);
      const len = dist(a, e) + r.length;
      if (!best || len < best.len) best = { len, path: e === a.at ? r.path : [e, ...r.path] };
    }
    if (!best || !best.path.length || !Number.isFinite(best.len)) return false;   // no road there (a mended wall)
    a.path = best.path;
    a.target = dest;
    a.at = null;
    return true;
  }

  moveArmy(a, dt) {
    if (a.halted || !a.path.length) return;
    const to = a.path[0];
    const d = dist(a, to), step = SPEED * dt * (a.retreating ? 1.1 : 1) * (this.winter ? 0.85 : 1) * (a.side === 0 && decreed(this, 'roads') ? 1.2 : 1);   // snow on the roads; the king's roads
    a.heading = Math.atan2(to.x - a.x, to.z - a.z);
    if (d > step) { a.x += (to.x - a.x) / d * step; a.z += (to.z - a.z) / d * step; a.at = null; return; }
    a.x = to.x; a.z = to.z;
    const came = a.last;
    a.last = to;
    a.path.shift();
    // Marching on through friendly or peaceful places; a hostile one stops the army.
    if (a.path.length && !this.canAttack(a.side, to)) return;
    if (a.path.length && a.side !== 0 && to.owner === null && a.target !== to) return;
    a.at = to;
    this.arrive(a, to, came);
  }

  arrive(a, p, came) {
    a.path = [];
    a.retreating = false;
    // A place being stormed: your men join the fight, its own lord's men come to relieve it,
    // and anyone else waits their turn.
    if (p.town?.hostile) {
      const angle = this.angle(p, came === p ? p.links[0] : came);
      if (a.side === 0) { const c = captainOf(this, a); this.seatCaptain(p.town.battle, 0, c, p.town.addTroops(a.units, angle, { stand: 95 })); this.removeArmy(a); this.log(`${a.name} joins the attack on ${p.name}.`); }
      else if (a.side === p.owner) {
        const c = captainOf(this, a);
        this.removeArmy(a);
        p.town.receiveAttack(a.units, angle, { mode: 'assault', name: a.name, house: a.side,
          onLeave: left => { if (left.length) this.retreat(this.spawnArmy(a.side, left, p, a.name)); } });
        this.seatCaptain(p.town.battle, 1, c, p.town.lastRegs);
        this.log(`${a.name} has come to relieve ${p.name}!`, 1);
      } else this.retreat(a);
      return;
    }
    if (p.owner === a.side) {
      if (a.side !== 0) { mergeInto(p.garrison, a.units); this.removeArmy(a); }
      else if (p.town) { a.gather = null; this.enterTown(a, p, came); }
      else if (a.gather === p.id) {
        // Called to gather here: the armies already waiting take it in.
        a.gather = null;
        const o = this.armies.find(x => x !== a && x.side === 0 && !x.gone && !x.wagon && x.at === p && !x.path.length && !x.halted);
        if (o) this.join(o, a);
      }
      return;
    }
    if (!this.canAttack(a.side, p)) {
      if (a.side !== 0) this.retreat(a);
      // yours waits outside, and says why, so a march on a house at peace is never silent
      else if (p.owner !== null && FACTIONS[p.owner]) this.log(`${a.name} waits outside ${p.name}: you are at peace with ${FACTIONS[p.owner].name}. Declare war on them first to attack it.`, 1);
      return;
    }
    if (a.side === 0) { this.ask({ kind: 'assault', army: a, poi: p }); return; }
    // An army of yours waiting outside one of your villages falls back into it and
    // fights there; outside anyone else's, it meets them in the open.
    const guard = this.armies.find(o => o.side === 0 && o.at === p && !o.path.length && !o.halted);
    if (guard && p.owner === 0 && p.town) {
      const other = p.links.find(q => q !== came) || p.links[0];
      p.town.addTroops(guard.units, this.angle(p, other), { stand: 30 });
      this.removeArmy(guard);
      this.log(`${guard.name} falls back into ${p.name} to meet them.`);
    } else if (guard && this.atWar(a.side, 0)) { this.ask({ kind: 'field', army: guard, enemy: a, poi: p, then: () => this.arrive(a, p, came) }); return; }
    if (p.owner === 0 && p.town) this.attackTown(a, p, came);
    else if (a.mode === 'raid') this.autoRaid(a, p);
    else this.autoAssault(a, p);
  }

  enterTown(a, p, came) {
    heal(a);
    if (a.food > 0) p.town.put(p.town.keep, 'food', Math.floor(a.food));
    p.town.addTroops(a.units, this.angle(p, came === p ? p.links[0] : came));
    this.removeArmy(a);
    this.log(`Your army has marched into ${p.name}.`);
  }

  // Call the banners (ruling, 2026-11-21): your villages send their spare men and your
  // vassals their share, and nothing else. An army already in the field is never pulled
  // in, and every village keeps its guard: the men on its walls, its militia, and at
  // least BANNER_GUARD men in all, bows and spears first. Each barracks also raises what
  // it can arm, keeping half its people at work (a third under the levy decree).
  // bannerPlan works out who would come without moving anyone, so the call can be
  // shown before it is made; callBanners carries out that same plan.
  // Places a column may march through on its way to your banners: your own, and those of
  // anyone you are not at war with. Never through a free or enemy place, which would stop
  // it and set it on alone.
  friendlyRoad() { return q => !this.canAttack(0, q); }

  bannerPlan(dest) {
    const BEST = ['knight', 'cav', 'maa', 'crossbow', 'lightcav', 'sword', 'spear', 'archer'];
    const KEEP = ['crossbow', 'archer', 'spear', 'sword', 'maa', 'lightcav', 'cav', 'knight'];
    const rankOf = c => c.stays ? -1 : c.retinue ? 99 : KEEP.includes(c.key) ? KEEP.indexOf(c.key) : 50;
    const plan = { dest, villages: [], vassals: [], men: 0, raised: 0, from: 0, guard: BANNER_GUARD };
    for (const p of this.pois) {
      const t = p.town;
      if (p.owner !== 0 || !t || t.hostile || t.underAttack) continue;
      // Fresh levies, counted on a copy of each barracks' racks and of the free hands.
      const raise = [];
      let free = t.villagers.filter(v => v.state !== 'soldier').length;
      const floor = t.population / (decreed(this, 'levy') ? 3 : 2);
      for (const b of t.buildings) {
        if (b.kind !== 'barracks' || b.state !== 'active') continue;
        const racks = { store: { ...b.store }, policy: b.policy };
        for (const key of BEST) for (;;) {
          const c = t.levyCheck(key, racks, free);
          if (!c.ok || free - c.n < floor) break;
          for (const [g, n] of Object.entries(outfitKit(key, c.n, c.fit))) racks.store[g] = (racks.store[g] || 0) - n;
          free -= c.n;
          raise.push({ key, b, n: c.n });
        }
      }
      const men = r => r.soldiers.filter(s => s.alive && !s.gone).length;
      const all = [
        ...t.garrison().map(r => ({ reg: r, key: r.T.key, men: men(r), retinue: !!r.retinue, stays: !!(r.posts || r.T.militia || r.routing || r.regrouping) })),
        ...raise.map(l => ({ levy: l, key: l.key, men: l.n })),
      ].filter(c => c.men > 0).sort((x, y) => rankOf(x) - rankOf(y));
      const v = { p, raise, raised: raise.reduce((n, l) => n + l.n, 0), keep: 0, keptLevies: 0, send: [], men: 0, retinue: 0 };
      // The retinue is the lord's own household, not the village's guard: it always answers
      // (Manager, 2026-11-21: on the Lord test the guard of 20 kept it home, and the call
      // came back empty). The guard is made of the village's levies and garrison.
      const home = p === dest ? new Set(all) : guardOf(all.filter(c => !c.retinue), BANNER_GUARD);
      for (const c of all) {
        if (home.has(c)) { v.keep += c.men; if (c.levy) v.keptLevies += c.men; continue; }
        v.send.push(c); v.men += c.men;
        if (c.retinue) v.retinue += c.men;
      }
      if (!v.raised && !v.men) continue;
      plan.villages.push(v);
      plan.raised += v.raised;
      plan.men += v.men;
      if (v.men) plan.from++;
    }
    // Vassals send their share of their men, unless they are too aggrieved to.
    for (const p of this.pois) {
      const v = vassalOf(this, p);
      if (!v || p === dest || p.owner !== 0) continue;
      if (v.refusing) { plan.vassals.push({ v, p, men: 0, refusing: true }); continue; }
      const n = headcount(takeUnits(p.garrison.map(g => ({ ...g })), this.vassalWant(v, p)));
      if (!n) continue;
      plan.vassals.push({ v, p, men: n });
      plan.men += n;
      plan.from++;
    }
    plan.here = dest.town ? dest.town.garrison().reduce((n, r) => n + r.alive, 0) : 0;
    return plan;
  }

  callBanners(dest) {
    const plan = this.bannerPlan(dest), safe = this.friendlyRoad();
    let men = 0, from = 0;
    const cut = [], staged = [];   // [army, its village] with no friendly road to dest; names staying home
    for (const v of plan.villages) {
      const t = v.p.town;
      for (const l of v.raise) l.reg = t.raise(l.key, l.b).reg;
      const regs = v.send.map(c => c.reg || c.levy.reg).filter(r => r && !r.gone);
      if (!regs.length) continue;
      const a = this.muster(v.p, regs);
      if (!a) continue;
      a.name = `Banners of ${v.p.name}`;
      if (!this.order(a, dest, safe)) { staged.push([a, v.p]); continue; }
      men += headcount(a.units);
      from++;
    }
    // Columns with no friendly road to dest gather instead at the place of yours that most
    // of them can reach through friendly land, nearest dest: one host, not a string of
    // small ones each stopped and beaten at the first enemy place on the way.
    let stage = null, there = 0;
    if (staged.length) {
      const reach = q => staged.filter(([a]) => a.at === q || Number.isFinite(this.route(a.at, q, safe).length)).length;
      stage = this.pois.filter(q => q.owner === 0 && q !== dest && q.town && !q.town.hostile)
        .map(q => [q, reach(q), this.route(q, dest).length]).sort((x, y) => y[1] - x[1] || x[2] - y[2])[0]?.[0] || null;
      for (const [a, p] of staged) {
        if (stage && p === stage) { this.enterTown(a, p, p); there += headcount(a.units); continue; }
        if (stage && this.order(a, stage, safe)) { there += headcount(a.units); continue; }
        this.enterTown(a, p, p);
        cut.push(p.name);
      }
    }
    for (const { v, p, refusing } of plan.vassals) {
      if (refusing) { this.log(`${v.name} sends nobody from ${p.name}.`, 1); continue; }
      let n = this.vassalMen(v, p, dest);
      if (n) { men += n; from++; continue; }
      if (stage && p !== stage && (n = this.vassalMen(v, p, stage))) there += n;
    }
    if (from || !there) this.log(from ? `The banners are called: ${men} men march for ${dest.name} from ${from} place${from > 1 ? 's' : ''}, to join ${plan.here} there.` : `The banners are called, but no other place has men to spare. ${plan.here} stand ready at ${dest.name}.`);
    if (there) this.log(`No road through friendly land reaches ${dest.name} from every place: ${there} men gather at ${stage.name} instead. Muster them there and march as one host.`, 1);
    if (cut.length) this.log(`No road through friendly land joins ${cut.join(', ')} to ${stage ? stage.name : dest.name}: ${cut.length > 1 ? 'their men stay' : 'its men stay'} at home.`, 1);
    return { men, from, there, stage };
  }

  // How much of a vassal's strength at p answers a call to arms.
  vassalWant(v, p) {
    const share = levyShare(v) * (decreed(this, 'levy') ? 1.5 : 1) * (1 + seatPower(this, 'marshal'));
    return power(p.garrison) * Math.min(0.9, share);
  }

  // A vassal's share of the men at one of their places marches for dest, as an army of
  // yours that remembers whose men they are (a.vassal). Returns how many went.
  vassalMen(v, p, dest) {
    const units = takeUnits(p.garrison, this.vassalWant(v, p));
    if (!units.length) return 0;
    const a = this.spawnArmy(0, units, p, `${v.name}'s men`);
    a.vassal = v.id;
    const n = headcount(units);
    if (!this.order(a, dest, this.friendlyRoad())) { mergeInto(p.garrison, units); this.removeArmy(a); return 0; }
    v.sent += n;
    recall(this, v, `Sent ${n} men to your banners at ${dest.name}`);
    return n;
  }

  // One vassal called to arms: their share of men from every place they hold marches to
  // dest. Called again too soon they grumble, unless they want a war.
  callToArms(v, dest) {
    if (!v || v.gone || v.prison || v.landless) return { ok: false, why: 'Holds no land to raise men from' };
    if (v.refusing) return { ok: false, why: `${v.name} refuses to send anyone` };
    if (!dest || dest.owner !== 0) return { ok: false, why: 'Call them to a place of yours' };
    let men = 0;
    for (const p of holdingsOf(this, v)) if (p !== dest) men += this.vassalMen(v, p, dest);
    if (!men) return { ok: false, why: 'They have too few men to spare' };
    if (v.want !== 'glory' && this.time - (v.calledAt ?? -1e9) < 600) mark(this, v, -6, 'Called to arms again so soon', 900);
    v.calledAt = this.time;
    this.log(`${v.name} answers your call: ${men} men march for ${dest.name}.`);
    return { ok: true, men, to: dest };
  }

  // Two armies of yours waiting at the same place become one.
  join(a, b) {
    for (const u of b.units) {
      const same = a.units.find(o => o.key === u.key && o.name === u.name && sameGear(o, u));
      if (same) { same.xp = Math.round(((same.xp || 0) * same.count + (u.xp || 0) * u.count) / Math.max(1, same.count + u.count) * 10) / 10; same.count += u.count; same.battles = Math.max(same.battles || 0, u.battles || 0); } else a.units.push({ ...u });
    }
    a.wounded = [...(a.wounded || []), ...(b.wounded || [])];
    a.food = (a.food || 0) + (b.food || 0);
    // A lord rides on with the joined army; the better captain commands it.
    if (b.lord !== null && b.lord !== undefined) a.lord = b.lord;
    const ca = this.captains.find(c => c.id === a.captain), cb = this.captains.find(c => c.id === b.captain);
    if (cb && (!ca || cb.xp > ca.xp)) { if (ca) ca.army = null; a.captain = cb.id; cb.army = a.id; b.captain = null; }
    else if (!ca) assignCaptain(this, a);
    this.log(`${b.name} joins ${a.name}: ${headcount(a.units)} men.`);
    this.removeArmy(b);
  }

  // A duke plans campaigns from the map: every free army of yours marches to one place of
  // yours and joins into one host there (in a village, they go inside, to march out as one).
  gatherable(p) {
    return this.armies.filter(a => a.side === 0 && !a.gone && !a.wagon && !a.halted && !a.retreating && !a.siege && !a.escort && a.at !== p && a.units.length);
  }
  gatherAt(p) {
    if (!['Duke', 'King'].includes(this.rank) || p.owner !== 0) return 0;
    let n = 0;
    for (const a of this.gatherable(p)) if (this.order(a, p, this.friendlyRoad())) { a.gather = p.id; n++; }
    if (n) this.log(`${n} ${n > 1 ? 'armies march' : 'army marches'} to gather at ${p.name}.`);
    return n;
  }

  // Regiments leave a village of yours and become an army on the map.
  muster(p, regs) {
    const units = p.town.takeTroops(regs);
    if (!units.length) return null;
    const a = this.spawnArmy(0, units, p, `Army of ${p.name}`);
    // The carts are loaded from the village stores, as far as they go.
    a.food = takeFood(p.town, capacity(a));
    const mins = Math.floor(a.food / Math.max(1, headcount(units)) * 2);
    if (mins < 1) this.log(`${a.name} has mustered ${headcount(units)} men, but ${p.name} has no food to load on the carts. Your villages will feed them in your own lands; beyond them they will desert within the minute, so send a wagon after them.`, 1);
    else this.log(`${a.name} has mustered: ${headcount(units)} men, with food for ${mins} minute${mins > 1 ? 's' : ''} beyond your lands.`);
    return a;
  }

  // Back to the nearest place the army's side holds; with nowhere to go, it scatters.
  retreat(a) {
    const home = this.pois.filter(p => p.owner === a.side)
      .sort((p, q) => dist(a, p) - dist(a, q))[0];
    if (!home || !a.units.length) { this.removeArmy(a); return; }
    a.halted = false;
    if (a.at === home) { this.arrive(a, home, a.last); return; }
    a.retreating = false;
    this.order(a, home);
    a.retreating = true;
  }

  // ---- fights ----

  ask(enc) {
    this.encounter = enc;
    enc.army.halted = true;
    if (enc.enemy) enc.enemy.halted = true;
    enc.defenders = enc.kind === 'assault' ? enc.poi.garrison : enc.enemy.units;
    this.hooks.ask(enc);
  }

  // ---- sieges without storming ----
  // Starve them out: the army sits down before the place and lets hunger do the work.
  // The place eats through its stores (its people and garrison both), then goes hungry,
  // its men slipping away, until it yields whole. A relief host can break it up.
  blockade(enc) {
    const a = enc.army, p = enc.poi;
    this.encounter = null;
    a.halted = false;
    a.siege = { p: p.id, since: this.time };
    p.siegeFood ??= this.storesFor(p);
    // The race, said plainly: their stores against your carts (foraging stretches them).
    const m = t => t === Infinity ? 'as long as it takes' : `${Math.max(1, Math.round(t / 60))} min`;
    const ours = foodLeft(this, a), home = homeland(this, a);
    this.log(`${a.name} sits down before ${p.name} to starve it out. Its stores last about ${m(p.siegeFood)}; your carts, foraging, ${m(ours)}${home ? `, and then ${home.name} and your other villages feed you` : ours < p.siegeFood ? '. Send a wagon before they run out' : ''}.`, home || ours >= p.siegeFood ? 0 : 1);
    this.chron(`You laid siege to ${p.name}.`);
  }
  // Seconds a place can eat: its food and bread, for its people and its men.
  storesFor(p) {
    const e = p.eco, mouths = headcount(p.garrison) + (e?.pop ?? 20);
    const food = e?.stock ? (e.stock.food || 0) + (e.stock.bread || 0) : (e?.pop ?? 20) * 2;
    return Math.min(1200, Math.max(120, food / Math.max(1, mouths) * SIEGE_MEAL));
  }
  tickSieges(dt) {
    for (const a of this.armies) {
      if (!a.siege || a.gone) continue;
      const p = this.byId[a.siege.p];
      if (!p || p.owner === 0 || a.at !== p || a.path.length || a.retreating || p.town) { this.liftSiege(a, p); continue; }
      p.siegeFood -= dt;
      if (p.siegeFood > 0) continue;
      if (p.eco) { p.eco.hungry = true; p.eco.pop = Math.max(8, p.eco.pop * (1 - 0.004 * dt)); }
      // Hungry men slip over the wall at night.
      for (const u of p.garrison) u.count = Math.floor(u.count * (1 - 0.006 * dt));
      p.garrison = p.garrison.filter(u => u.count >= 3);
      if (-p.siegeFood > STARVE || !p.garrison.length) {
        this.log(`${p.name} is starved into surrender!`);
        this.chron(`${p.name} was starved into surrender.`);
        a.siege = null;
        delete p.siegeFood;
        if (p.eco) p.eco.hungry = false;
        this.capture(p, a);
      }
    }
  }
  liftSiege(a, p) {
    a.siege = null;
    if (p) { delete p.siegeFood; if (p.eco) p.eco.hungry = false; if (p.owner !== 0) this.log(`The siege of ${p.name} is lifted.`, 1); }
  }

  // Burn the fields: the army fires the farms and granaries round a place and stays
  // before it. The place loses most of its food and some of its people, and comes to a
  // siege or a storm already hungry. Its lord won't forget it.
  burnFields(enc) {
    const a = enc.army, p = enc.poi, e = p.eco;
    this.encounter = null;
    a.halted = false;
    if (e?.stock) { e.stock.food = Math.floor((e.stock.food || 0) * 0.3); e.stock.bread = Math.floor((e.stock.bread || 0) * 0.5); }
    if (e?.buildings) burn(e, ['farm', 'farm', 'mill']);
    if (e) e.pop = Math.max(8, e.pop * 0.9);
    if (p.siegeFood) p.siegeFood *= 0.4;
    for (const u of a.units) u.count = Math.max(1, Math.round(u.count * 0.97));
    grudge(this, p.owner, 'burned', p.name);
    this.log(`${a.name} burns the fields round ${p.name}.`);
    this.chron(`You burned the fields round ${p.name}.`);
  }

  // The player thinks better of an attack and falls back without a fight.
  // ---- treating with a free place ----
  // From Count, gold can buy a free place's fealty instead of storming it: it swears to you
  // whole, its people, stores and garrison with it. A great house's place is not for sale.
  treatPrice(p) {
    const T = TREAT, folk = p.eco?.pop ?? 20, men = headcount(p.garrison);
    return Math.round((folk * T.folk + men * T.man) * (T.rich.includes(p.kind) ? T.richer : 1) / 10) * 10;
  }
  canTreat(enc) {
    const p = enc?.poi;
    if (!p || enc.kind !== 'assault' || p.owner !== null || p.kind === 'camp' || p.kind === 'crown') return { ok: false, why: 'Only a free place will treat.' };
    if (!['Count', 'Duke', 'King'].includes(this.rank)) return { ok: false, why: 'A free place swears only to a count or better.' };
    const price = this.treatPrice(p), gold = Math.floor(FACTIONS[0].gold || 0);
    if (gold < price) return { ok: false, price, why: `They ask ${price} gold; you have ${gold}.` };
    return { ok: true, price };
  }
  treat(enc) {
    const c = this.canTreat(enc);
    if (!c.ok) { console.warn('treat refused:', c.why); return { ok: false, text: c.why }; }
    const p = enc.poi, a = enc.army;
    this.encounter = null;
    a.halted = false;
    FACTIONS[0].gold -= c.price;
    const kept = p.garrison || [];   // (makeTown clears it)
    this.takePlace(p, 0);
    const pop = p.eco?.pop ?? 20, lvl = p.eco?.level ?? 1;
    const town = this.makeTown(p, { villagers: Math.max(6, Math.min(80, Math.round(pop))), retinue: false, stock: storesOf(p, lvl) });
    layPlace(town, p, 0);
    p.mem = null;
    grownLevels(town, p.eco);
    p.eco = null;
    const angle = this.angle(p, a.last === p ? p.links[0] : a.last);
    if (kept.length) town.addTroops(kept, angle);
    town.addTroops(a.units, angle);
    this.removeArmy(a);
    const text = `${p.name} swears fealty to you for ${c.price} gold. Its people, stores and garrison are yours.`;
    this.log(text);
    this.chron(`${p.name} swore fealty to you for ${c.price} gold, and not a roof was burned.`);
    this.hooks.sound?.('seal'); // audio
    this.hooks.captured(p, null);
    return { ok: true, text };
  }

  pullBack(enc) {
    this.encounter = null;
    enc.army.halted = false;
    this.log(`${enc.army.name} pulls back from ${enc.poi.name}.`);
    this.retreat(enc.army);
  }

  // The land remembers: a cairn where a field battle was fought (worldview draws them,
  // world.cairns), and the nearest place takes its name from the first one fought by it:
  // "Hollin Ford, where Varn's host broke".
  remember(at, loser, near) {
    const host = loser.replace(/^The /, 'the ');
    (this.cairns ||= []).push({ x: Math.round(at.x), z: Math.round(at.z), at: Math.round(this.time), text: `Here ${host} broke` });
    if (this.cairns.length > 60) this.cairns.shift();
    const p = this.pois.find(q => q.name === near);
    if (p && !p.epithet) p.epithet = `where ${host} broke`;
  }

  // Half the armour and shields of the men who fell (before minus after) go to the
  // winner's nearest place: into the keep of a village you run, or a rival's stores. That
  // is how your next levy comes to wear Stonemere's mail.
  loot(before, after, side, at) {
    const count = (units, sign, into) => {
      for (const u of units) {
        const g = gearOf(u);
        if (g.armour !== 'none') into[ARMOUR_GOOD[g.armour]] = (into[ARMOUR_GOOD[g.armour]] || 0) + sign * u.count;
        if (g.shield) into.shields = (into.shields || 0) + sign * u.count;
      }
      return into;
    };
    const fell = count(after, -1, count(before, 1, {}));
    const got = Object.fromEntries(Object.entries(fell).map(([g, n]) => [g, Math.floor(n / 2)]).filter(([, n]) => n > 0));
    if (!Object.keys(got).length || side === null || side === undefined) return null;
    const near = this.pois.filter(p => p.owner === side && (side === 0 ? p.town : p.eco)).sort((p, q) => Math.hypot(p.x - at.x, p.z - at.z) - Math.hypot(q.x - at.x, q.z - at.z))[0];
    if (!near) return null;
    for (const [g, n] of Object.entries(got)) {
      if (side === 0) near.town.put(near.town.keep, g, n);
      else near.eco.stock[g] = (near.eco.stock[g] || 0) + n;
    }
    if (side === 0) this.log(`Stripped from the fallen and carried to ${near.name}: ${Object.entries(got).map(([g, n]) => `${n} ${g === 'armour' ? 'plate' : g}`).join(', ')}.`);
    return got;
  }

  // A quick sum of strength with some luck either way, for fights nobody watches.
  resolve(A, D, bonus = 1) {
    const pa = power(A) * (0.85 + this.rand() * 0.3), pd = power(D) * bonus * (0.85 + this.rand() * 0.3);
    const attackerWins = pa > pd;
    const ratio = Math.min(pa, pd) / Math.max(pa, pd, 1);
    const winLoss = 0.12 + 0.45 * ratio * ratio, loseLoss = 0.55 + 0.3 * ratio;
    // Survivors learn as in a fought battle (battle.js veterans): half a step, a whole one for a win.
    const cut = (units, f, won) => units.map(u => ({ ...u, count: Math.round(u.count * (1 - f)), xp: Math.round(((u.xp || 0) + (won ? 1 : 0.5)) * 10) / 10, battles: (u.battles || 0) + 1 }))
      .filter(u => u.count >= 3);
    return { attackerWins, A: cut(A, attackerWins ? winLoss : loseLoss, attackerWins), D: cut(D, attackerWins ? loseLoss : winLoss, !attackerWins) };
  }

  defenceBonus(p) { return 1.2 * KINDS[p.kind].defence * (p.kind === 'crown' && workDone(this, 'walls') ? 1.5 : 1); }

  // Who an auto-resolved fight sets against you: the defenders, the folk who turn out for
  // a place, and how much the place helps them. Walls stormed with no ladders, ram or
  // engines cost as dearly here as by hand (battle.js).
  autoSides(enc) {
    const p = enc.poi, walled = p && walledPlace(p);
    const bare = enc.kind === 'assault' && walled && !enc.army.units.some(u => TYPES[u.key]?.engine);
    const folk = enc.kind === 'assault' ? turnOut(p, enc.army.units, FACTIONS[p.owner]) : [];
    return { folk, D: [...enc.defenders, ...folk], bonus: enc.kind === 'assault' ? this.defenceBonus(p) * (bare ? 1.4 : 1) : 1, bare };
  }

  // What auto-resolve would likely do, without rolling: its chance of winning (resolve's
  // luck is a 0.85–1.15 roll on each side) and the share of your men a win would cost.
  autoOdds(enc) {
    const { D, bonus, bare } = this.autoSides(enc);
    const a = power(enc.army.units), d = power(D) * bonus, N = 24;
    let win = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (a * (0.85 + 0.3 * (i + 0.5) / N) > d * (0.85 + 0.3 * (j + 0.5) / N)) win++;
    const ratio = Math.min(a, d) / Math.max(a, d, 1);
    return { us: headcount(enc.army.units), them: headcount(D), chance: win / (N * N), winLoss: 0.12 + 0.45 * ratio * ratio, bare };
  }

  autoResolve(enc) {
    const p = enc.poi, { folk, D, bonus } = this.autoSides(enc);
    if (folk.length) this.log(`The people of ${p.name} have turned out to defend it.`);
    const r = this.resolve(enc.army.units, D, bonus);
    r.D = sendHome(p, folk, r.D);
    this.settle(enc, r.attackerWins, r.A, r.D);
    return r.attackerWins;
  }

  // The outcome of a fight the player was in, fought or auto-resolved.
  settle(enc, won, mine, theirs) {
    this.encounter = null;
    const a = enc.army;
    // Whoever holds the field strips the fallen of the armour and shields they can use.
    const foe = enc.kind === 'assault' ? enc.defenders : enc.enemy.units;
    this.loot(won ? foe : a.units, won ? theirs : mine, won ? 0 : enc.kind === 'assault' ? enc.poi.owner : enc.enemy.side, enc.poi || a);
    a.halted = false;
    const before = a.units;
    a.units = mine;
    wound(a, before);
    const was = enc.poi ? enc.poi.name : 'the road';
    if (enc.kind === 'assault') {
      const p = enc.poi;
      if (won) { this.log(`You have taken ${p.name}!`); this.capture(p, a); }
      else { p.garrison = theirs; this.log(`The attack on ${p.name} failed.`, 1); note(this, p.owner, 'lostField'); this.retreat(a); }
    } else {
      const e = enc.enemy;
      e.halted = false;
      const theirsBefore = e.units;
      e.units = theirs;
      wound(e, theirsBefore);
      note(this, e.side, won ? 'wonField' : 'lostField');
      if (won) grudge(this, e.side, 'beaten', enc.poi?.name || this.pois.reduce((b, p) => Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(b.x - a.x, b.z - a.z) ? p : b).name);
      const cap = this.captains.find(c => c.id === a.captain && c.alive), field = enc.poi?.name || this.pois.reduce((b, p) => Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(b.x - a.x, b.z - a.z) ? p : b).name;
      const them = e.name.replace(/^The /, 'the ');
      this.chron(won ? `${cap ? `Captain ${cap.name}` : 'Your army'} beat ${them} near ${field}.` : `${e.name} beat ${cap ? `Captain ${cap.name}` : 'your army'} near ${field}.`);
      this.remember(a, won ? e.name : 'your army', field);
      if (won) {
        // An outlaw band met in the open gets the same word as one beaten off a village.
        const dead = headcount(theirsBefore) - headcount(theirs), lost = headcount(before) - headcount(mine);
        this.log(e.outlaws ? `The outlaws are beaten off at ${was}: ${dead} dead, ${lost ? `${lost} of ours` : 'none of ours'}.` : `${e.name} was beaten at ${was}.`);
        this.retreat(e);
        if (!a.units.length) this.removeArmy(a);
      } else {
        this.log(`Your army was beaten at ${was}.`, 1);
        this.retreat(a);
        if (!e.units.length) this.removeArmy(e);
        else enc.then?.();
      }
    }
    this.checkEnd();
  }

  // Coin found in a place you take goes to your purse.
  plunder(p) {
    const g = Math.round(p.eco?.gold || 0);
    if (g < 1) return;
    FACTIONS[0].gold += g;
    this.log(`You found ${g} gold in ${p.name}.`);
  }

  capture(p, a) {
    const was = p.owner;
    note(this, was, 'tookPlace');
    grudge(this, was, 'took', p.name);
    this.takePlace(p, 0);
    const pop = p.eco?.pop ?? 20;
    const lvl = p.eco?.level ?? 1;
    const town = this.makeTown(p, { villagers: Math.max(6, Math.min(40, Math.round(pop * 0.5))), retinue: false,
      stock: storesOf(p, lvl, 60) });
    layPlace(town, p, 0);
    p.mem = null;
    grownLevels(town, p.eco);
    this.plunder(p);
    p.eco = null;
    town.addTroops(a.units, this.angle(p, a.last === p ? p.links[0] : a.last));
    this.removeArmy(a);
    this.hooks.captured(p, was);
    this.checkBroken(was);
  }

  // A place changes hands. Seats move to the house's next-best place when lost.
  takePlace(p, owner) {
    const was = p.owner;
    p.owner = owner;
    p.free = null;
    const who = i => (i === null ? 'the free folk' : i === this.bandits ? 'outlaws' : FACTIONS[i]?.name);
    if (owner === 0 && was !== 0) this.chron(`You took ${p.name} from ${who(was)}.`);
    else if (was === 0) this.chron(`${p.name} was lost to ${who(owner)}.`);
    const v = vassalOf(this, p);
    if (v) {
      p.vassal = null;
      recall(this, v, `Lost ${p.name} to ${FACTIONS[owner]?.name || 'free folk'}`);
      this.log(`${v.name} has lost ${p.name}.`, 1);
      for (const o of living(this)) if (o !== v) mark(this, o, -8, `You let ${p.name} fall`, 1200);
    }
    if (owner === 0 && was !== null && was !== 0) for (const o of living(this)) {
      mark(this, o, 4, 'Your victories', 900);
      // Those whose men are in the field with you share the glory.
      if (this.armies.some(a => a.vassal === o.id && !a.gone)) { o.glory = this.time; mark(this, o, 6, `Fought beside you for ${p.name}`, 1800); recall(this, o, `Fought beside you when you took ${p.name}`); }
    }
    if (was !== null && FACTIONS[was]?.seat === p) {
      // (its castle stays standing when the seat moves on: the place keeps the layout it has)
      if (!p.mem && !p.town) p.mem = { ...layoutOf(p), at: this.time };
      // (you fall back to a village you run yourself, the biggest first)
      const size = q => q.town ? 1000 + q.town.population : q.eco?.pop ?? 0;
      const next = this.pois.filter(q => q.owner === was).sort((q, r) => size(r) - size(q))[0];
      FACTIONS[was].seat = next || null;
      if (next) next.seat = was;
      delete p.seat;
      if (was === 0) {
        if (next) { this.home = next; this.log(`You have lost ${p.name}. Your seat is now ${next.name}.`, 1); }
      } else if (next && (p.visible || this.knows(was))) this.log(`${FACTIONS[was].name} has lost its seat and fallen back to ${next.name}.`, 2);
    }
    // A lord with no seat makes his seat of the first place he takes.
    if (owner === 0 && (!FACTIONS[0].seat || FACTIONS[0].seat.owner !== 0)) { FACTIONS[0].seat = p; p.seat = 0; this.home = p; }
  }

  // A house with no places left is broken; its armies scatter.
  checkBroken(h) {
    if (h === null || h === undefined || h === 0 || h === this.bandits) return;
    const H = FACTIONS[h];
    if (!H.alive || this.pois.some(p => p.owner === h)) return;
    H.alive = false;
    for (const a of [...this.armies]) if (a.side === h) this.removeArmy(a);
    for (const k of [...this.wars]) if (k.split(':').map(Number).includes(h)) this.wars.delete(k);
    this.log(`${H.name} is broken. ${H.lord} has fled the realm.`, 0);
    this.hooks.herald?.({ house: H, title: `${H.name} is broken`, text: `${H.lord} has fled the realm.` });
  }

  // ---- storming a place ----
  // You fight for a place in the place itself: it is laid out as a real village with
  // what its people have built, its garrison holds the keep, and your army marches in by
  // the road it came on. Win and it is yours as it stands, less whatever you burned.

  storm(enc) {
    const p = enc.poi, a = enc.army, owner = p.owner;
    this.encounter = null;
    a.halted = false;
    const lvl = p.eco?.level ?? 1, pop = p.eco?.pop ?? 20;
    // Outnumbered, the place's people take up tools too and stand by the keep (militia.js).
    const folk = turnOut(p, a.units, FACTIONS[owner]);
    const defenders = [...p.garrison, ...folk];
    if (folk.length) this.log(`The people of ${p.name} have turned out to defend it.`);
    const town = this.makeTown(p, { kind: p.kind, villagers: 0, retinue: false, stock: storesOf(p, lvl) });
    const came = this.angle(p, a.last && a.last !== p ? a.last : p.links[0]);
    // It stands as it was laid out (places.js): castles, lords' seats and Kingsbridge behind
    // their walls, with a gate on every road. Walls broken in a storm stay broken a while.
    const walledR = layPlace(town, p, 1, { mended: !p.mem || this.time - p.mem.at > 240 });
    p.mem = null;
    // its numbers' walls are the walls that stand (remembered ones may be a lord's own work)
    const stood = town.battle.walls.pieces.find(q => q.side === 1);
    if (p.eco?.walls) p.eco.walls = stood ? stood.material : 'none';
    const walled = walledR > 0;
    town.keepLevel = town.keepLevel || keepLevelFor(p);
    const H = owner === null ? NEUTRAL : FACTIONS[owner];
    town.hostile = { owner, pop, eco: p.eco, color: H.color, name: H.name, army: a.name, entry: came, folk, where: p.name };
    town.flagColor = H.color;
    town.holdKeep(defenders, came, { house: owner ?? 1 });
    // Its people are about the place, all but those who turned out to fight.
    town.townsfolk(Math.max(0, Math.min(80, Math.round(pop - folk.reduce((n, u) => n + u.count, 0)))));
    this.seatCaptain(town.battle, 0, captainOf(this, a), town.addTroops(a.units, came, { stand: 100 }));
    // The army forms up out of bowshot on the road it came by, then goes in (battle.js).
    // (a great town's walls run far out: the army still forms up on the map)
    const R = walled ? walledR : 16, far = Math.min(R + 140, 205);
    town.battle.startDeployment(0, { at: { x: 0, z: 0 }, toward: came, near: Math.min(R + 70, far - 45), far, width: 80, limit: 90 });
    // A beaten garrison may ask for terms (battle.js); a hungry place asks sooner. Yielding,
    // its men march out under arms to their lord, and the place is yours whole: no more
    // burning, and more of its people stay.
    const b = town.battle;
    b.termsAllowed = true;
    if (p.eco?.hungry) b.setHunger(1, 0.5);
    const yieldTo = b.acceptTerms.bind(b);
    b.acceptTerms = () => {
      if (b.terms?.side === 1 && town.hostile) town.hostile.yielded = b.regs.filter(r => r.side === 1 && !r.gone && r.alive > 0 && !r.T.militia).map(r => ({ ...unit(r.T.key, r.alive, r.name), ...carry(r) }));
      yieldTo();
    };
    // Or they buy their way out: their lord pays a ransom for the men, and resents it.
    const H2 = owner !== null && !FACTIONS[owner]?.bandit && !FACTIONS[owner]?.invader ? FACTIONS[owner] : null;
    b.termsExtra = T => {
      if (T.side !== 1 || !H2) return null;
      const men = b.regs.filter(r => r.side === 1 && !r.gone && r.alive > 0).reduce((n, r) => n + r.alive, 0);
      const price = Math.min(Math.floor(H2.gold), 40 + 4 * men);
      if (price < 30) return null;
      return { label: `Let them go for a ransom (${price} gold)`, run: () => {
        H2.gold -= price; FACTIONS[0].gold += price;
        if (this.dip[owner]) this.dip[owner].opinion -= 5;
        this.log(`${H2.lord} pays ${price} gold to see the garrison of ${p.name} home.`);
        this.chron(`The garrison of ${p.name} was ransomed by ${H2.name} for ${price} gold.`);
        b.acceptTerms();
      } };
    };
    this.removeArmy(a);
    this.log(`${a.name} is storming ${p.name}.`);
  }

  // Called each step while a place is being stormed: is it won or lost yet?
  checkStorm(p) {
    const t = p.town, b = t.battle;
    const standing = r => !r.gone && !r.routing;
    const ours = b.regs.filter(r => r.side === 0 && standing(r));
    const theirs = t.attackers.flatMap(g => g.regs).filter(standing);
    if (!theirs.length) this.wonStorm(p);
    else if (!ours.length) this.endStorm(p, false);
  }

  wonStorm(p) {
    const t = p.town, h = t.hostile, was = h.owner;
    note(this, was, 'tookPlace');
    grudge(this, was, 'took', p.name);
    if (t.buildings.some(o => o.state === 'ruined')) grudge(this, was, 'burned', p.name);
    this.takePlace(p, 0);
    if (h.folk?.length) h.pop = Math.max(5, h.pop - Math.max(0, h.folk.reduce((n, u) => n + u.count, 0) - folkLeft(t.battle)));
    t.claim({ villagers: Math.max(6, Math.min(40, Math.round(h.pop * (h.yielded ? 0.8 : 0.5)))) });
    t.flagColor = null;
    p.eco = h.eco;
    this.plunder(p);
    p.eco = null;
    p.garrison = [];
    // The village's own fighting goes on: no winner, no more terms.
    Object.assign(t.battle, { winner: null, surrendered: null, terms: null, termsAllowed: false });
    if (h.yielded) {
      const men = h.yielded.filter(u => u.count >= 3);
      if (was !== null && FACTIONS[was]?.alive && men.length) this.retreat(this.spawnArmy(was, men, p, `${FACTIONS[was].short} garrison`));
      this.log(`${p.name} yields on terms; its garrison marches out under arms.`);
    }
    this.log(`You have taken ${p.name}!`);
    this.hooks.stormEnded?.(p, true);
    this.hooks.captured(p, was);
    this.checkBroken(was);
    this.checkEnd();
  }

  // The attack is beaten off, or you call it off: the place goes back to its owner as a
  // holding, poorer for whatever burned, and your survivors fall back.
  endStorm(p, chose) {
    const t = p.town, h = t.hostile, b = t.battle;
    const left = r => r.soldiers.filter(s => s.alive && !s.gone).length;
    const mine = b.regs.filter(r => r.side === 0 && !r.gone)
      .map(r => ({ key: r.T.key, count: left(r), name: r.name, levy: r.levy || null, retinue: !!r.retinue, xp: r.xp || 0, elite: !!r.elite, ...carry(r) })).filter(u => u.count >= 3);
    const theirs = b.regs.filter(r => r.side === 1 && !r.gone && !r.T.militia).map(r => ({ ...unit(r.T.key, left(r), r.name), ...carry(r) })).filter(u => u.count >= 3);
    const ruins = t.buildings.filter(o => o.state === 'ruined'), burned = ruins.length;
    p.mem = remember(t, 1, this.time);
    p.town = null;
    p.garrison = theirs;
    p.eco = h.eco || { pop: h.pop, level: 1, arms: 0 };
    if (h.folk?.length) mourn(p, h.folk, folkLeft(b));
    if (burned) {
      p.eco.pop *= Math.max(0.4, 1 - burned * 0.1);
      if (p.eco.buildings) burn(p.eco, ruins.map(o => o.kind));
      else p.eco.level = Math.max(1, p.eco.level - Math.floor(burned / 3));
    }
    if (!chose) note(this, h.owner, 'lostField');
    if (burned) grudge(this, h.owner, 'burned', p.name);
    const fire = burned ? `, leaving ${burned} of its buildings in ashes` : '';
    this.log(chose ? `You pull back from ${p.name}${fire}.` : `The attack on ${p.name} has failed${fire}.`, chose ? 0 : 1);
    if (mine.length) {
      const back = this.spawnArmy(0, mine, p, h.army);
      back.wounded = b.regs.filter(r => r.side === 0 && r.initial > left(r))
        .map(r => ({ key: r.T.key, name: r.name, levy: r.levy || null, retinue: !!r.retinue, count: Math.round((r.initial - left(r)) * 0.35), ...carry(r) })).filter(u => u.count > 0);
      this.retreat(back);
    }
    this.hooks.stormEnded?.(p, false, chose);
    this.checkEnd();
  }

  // A walled village of yours that cannot hold may yield on terms: its men march out under
  // arms to your nearest place, and the village passes whole to the attacker, its people
  // spared (rather than storm and sack).
  allowYield(p) {
    const t = p.town, b = t.battle;
    if (b.yieldWired) return;
    b.yieldWired = true;
    b.termsAllowed = true;
    const yieldTo = b.acceptTerms.bind(b);
    b.acceptTerms = () => {
      if (b.terms?.side === 0 && !t.hostile && p.owner === 0) {
        t.yieldedOurs = t.garrison().filter(r => r.alive > 0 && !r.T.militia)
          .map(r => ({ key: r.T.key, count: r.alive, name: r.name, xp: r.xp || 0, elite: !!r.elite, ...carry(r) }));
        yieldTo();
        t.lost = true;
        this.chron(`${p.name} yielded on terms.`);
        p.falling = true;
        return;
      }
      yieldTo();
    };
  }

  // An army's captain rides into a fight in a village with its biggest foot regiment.
  seatCaptain(battle, side, c, regs) {
    if (!c || !regs?.length) return;
    const foot = regs.filter(r => !r.T.range && !r.T.engine).sort((x, y) => y.alive - x.alive);
    battle.setCaptain(side, c, foot[0] || regs[0]);
  }

  // A rival marches on one of your villages: the fight happens there, in the village itself.
  attackTown(a, p, came) {
    const t = p.town, H = FACTIONS[a.side], c = captainOf(this, a);
    if (!H.bandit) this.meet(a.side);
    this.removeArmy(a);
    this.allowYield(p);
    t.receiveAttack(a.units, this.angle(p, came), {
      mode: a.mode === 'march' ? 'assault' : a.mode, name: a.name, house: a.side,
      onLeave: (survivors, gotAway, dead = {}) => {
        if (t.fallenSaid && this.hooks.watching() !== p) this.log(`${p.name}: ${t.fallenSaid}`, 1);
        // How a band's raid ended, said where you are: in the village if you are watching it
        // (QC, 2026-11-21: a band beaten off left only "1 battle" on the card).
        const say = (text, bad) => { if (this.hooks.watching() === p) t.event(text, bad ? 1 : 0); else this.log(text, bad ? 1 : 0); };
        const ours = dead.ours ? `${dead.ours} of ours` : 'none of ours';
        if (H.bandit && p.owner === 0 && !t.lost && !gotAway) say(`The outlaws are beaten off at ${p.name}: ${dead.theirs || 0} dead, ${ours}.`);
        if (t.lost || !survivors.length) return;
        // Outlaws who get away take a share of the stores and the purse with them.
        if (gotAway && H.bandit && p.owner === 0) {
          const took = t.rob(OUTLAW_TAKE.share), gold = Math.min(OUTLAW_TAKE.gold, Math.floor((FACTIONS[0].gold || 0) * OUTLAW_TAKE.share));
          FACTIONS[0].gold -= gold;
          const list = [...Object.entries(took).filter(([, n]) => n > 0).map(([g, n]) => `${n} ${g}`), gold ? `${gold} gold` : null].filter(Boolean);
          const and = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0];
          if (list.length) say(`The outlaws got away from ${p.name} with ${and(list)} (${dead.theirs || 0} of them dead, ${ours}).`, true);
        }
        const back = this.spawnArmy(a.side, survivors, p, a.name);
        this.retreat(back);
      },
    });
    this.seatCaptain(t.battle, 1, c, t.lastRegs);
    // The village's own message says it when you are there to see it.
    if (this.hooks.watching() !== p) {
      this.log(a.mode === 'raid' ? `${H.short} raiders have reached ${p.name}!`
        : a.mode === 'siege' ? `${a.name} has laid siege to ${p.name}!` : `${a.name} is attacking ${p.name}!`, 1);
    }
    this.hooks.townAttacked(p, a);
  }

  autoAssault(a, p) {
    const was = p.owner, H = FACTIONS[a.side];
    // Its people turn out if the keep itself is in danger (militia.js).
    const folk = turnOut(p, a.units, FACTIONS[p.owner]);
    const r = this.resolve(a.units, [...p.garrison, ...folk], this.defenceBonus(p));
    r.D = sendHome(p, folk, r.D);
    a.units = r.A;
    if (r.attackerWins) {
      this.takePlace(p, a.side);
      p.garrison = r.A;
      if (p.eco) {
        p.eco.pop *= 0.8;
        if (p.eco.gold) { H.gold += p.eco.gold * 0.8; p.eco.gold *= 0.2; }
      }
      this.removeArmy(a);
      if (p.visible || was === 0 || (H.invader && was !== null)) this.log(`${H.name} has taken ${p.name}.`, was === 0 || H.invader ? 1 : 2);
      this.checkBroken(was);
      this.checkEnd();
    } else {
      p.garrison = r.D;
      this.retreat(a);
    }
  }

  // Raiders on a holding: if they beat the guard, they burn and steal, then go home.
  autoRaid(a, p) {
    const r = this.resolve(a.units, p.garrison, this.defenceBonus(p) * 0.9);
    a.units = r.A;
    if (r.attackerWins) {
      p.garrison = r.D;
      if (p.eco) {
        const loss = p.eco.pop * 0.18;
        p.eco.pop -= loss;
        if (p.eco.stock) for (const g of Object.keys(p.eco.stock)) p.eco.stock[g] *= 0.75;
        if (p.owner !== null && FACTIONS[p.owner]) FACTIONS[p.owner].gold = Math.max(0, FACTIONS[p.owner].gold - loss * 2);
        FACTIONS[a.side].gold += loss * 2;
      }
      if (p.visible) this.log(`${FACTIONS[a.side].short} raiders burned the edges of ${p.name}.`, p.owner === 0 ? 1 : 2);
      const v = vassalOf(this, p);
      if (v) { mark(this, v, -6, 'Raided while you looked on', 600); recall(this, v, `${p.name} was raided by ${FACTIONS[a.side].name}`); }
    } else p.garrison = r.D;
    this.retreat(a);
  }

  // The keep has fallen: the place goes to the attacker, and your survivors make for home.
  fall(p) {
    const t = p.town;
    p.falling = false;
    const alive = r => r.soldiers.filter(s => s.alive).length;
    const groups = t.attackers.filter(g => g.regs.some(r => !r.disbanded && alive(r) > 0));
    const side = groups[0]?.house ?? 1;
    note(this, side, 'lostPlace');
    const theirs = groups.flatMap(g => g.regs).filter(r => !r.disbanded && alive(r) > 0)
      .map(r => ({ ...unit(r.T.key, alive(r), r.name), ...carry(r) }));
    // The militia are the village's own people: they stay with it, under the new lord.
    const ours = t.yieldedOurs || t.garrison().filter(r => alive(r) > 0 && !r.T.militia)
      .map(r => ({ key: r.T.key, count: alive(r), name: r.name, levy: r.levy || null, retinue: !!r.retinue, xp: r.xp || 0, elite: !!r.elite, ...carry(r) }));
    for (const r of t.militia) for (const s of r.soldiers) if (s.alive && s.villager) s.villager.state = 'idle';
    const pop = t.villagers.filter(v => v.state !== 'soldier').length;
    this.takePlace(p, side);
    p.mem = remember(t, 0, this.time);
    // The north and outlaws keep their rough reckoning; a house runs what it took.
    const eco = FACTIONS[side].invader || FACTIONS[side].bandit ? { pop: Math.max(10, pop * 0.7), level: 1, arms: 0 } : fromTown(t);
    Object.assign(p, { town: null, garrison: theirs.length ? theirs : [unit('spear', 10, `${FACTIONS[side].short} spearmen`)], eco });
    this.log(`${p.name} has fallen to ${FACTIONS[side].name}.`, 1);
    if (ours.length) this.retreat(this.spawnArmy(0, ours, p, t.yieldedOurs ? `Garrison of ${p.name}` : `Survivors of ${p.name}`));
    this.hooks.fell(p);
    this.checkEnd();
  }

  checkMeetings() {
    for (const a of this.armies) {
      if (a.halted || a.retreating || a.gone || a.wagon) continue;
      for (const e of this.armies) {
        if (e === a || e.wagon || e.side <= a.side || e.halted || e.retreating || e.gone || !this.atWar(a.side, e.side)) continue;
        if (dist(a, e) >= MEET) continue;
        if (a.side === 0) {
          if (!this.encounter) { this.ask({ kind: 'field', army: a, enemy: e, poi: a.at || e.at }); return; }
          continue;
        }
        this.clash(a, e);
      }
    }
  }

  // Two rival armies meet on the road; nobody is watching, so it is settled by numbers.
  clash(a, e) {
    const r = this.resolve(a.units, e.units);
    const was = [a.units, e.units];
    a.units = r.A;
    e.units = r.D;
    wound(a, was[0]);
    wound(e, was[1]);
    const [win, lose] = r.attackerWins ? [a, e] : [e, a];
    if (a.visible || e.visible) this.log(`${win.name} beat ${lose.name} on the road.`, 2);
    if (lose.units.length) this.retreat(lose); else this.removeArmy(lose);
    if (!win.units.length) this.removeArmy(win);
  }

  // ---- what you can see ----

  updateVision() {
    const eyes = [
      ...this.pois.filter(p => p.owner === 0).map(p => ({ x: p.x, z: p.z, r: SIGHT.place + lookouts(p) })),
      ...this.armies.filter(a => a.side === 0).map(a => ({ x: a.x, z: a.z, r: SIGHT.army })),
    ];
    const sees = o => eyes.some(e => dist(e, o) < e.r);
    for (const p of this.pois) {
      p.visible = p.owner === 0 || sees(p);
      if (p.visible) {
        p.seen = true;
        p.known = { owner: p.owner, men: p.town ? null : headcount(p.garrison), level: p.eco?.level ?? null };
      }
    }
    // How much you can make out: far off, only that an army is there (1); nearer, how big it is (2);
    // close, which troops (3).
    const know = o => eyes.reduce((k, e) => { const f = dist(e, o) / e.r; return Math.max(k, f < 0.45 ? 3 : f < 0.75 ? 2 : f < 1 ? 1 : 0); }, 0);
    for (const a of this.armies) { a.know = a.side === 0 ? 3 : know(a); a.visible = a.know > 0; }
  }

  // ---- the end ----

  // Each rank brings new tools and new trouble, with a moment when you reach it.
  checkRank() {
    const ORDER = ['Reeve', 'Lord', 'Count', 'Duke', 'King'], now = ORDER.indexOf(this.rank);
    const seen = ORDER.indexOf(this.rankSeen || 'Reeve');
    if (now <= seen) return;
    this.rankSeen = this.rank;
    const R = RANKS[this.rank];
    if (!R) return;
    this.log(`You are now ${R.title}. ${R.tools}`, 0);
    this.chron(`You were acknowledged ${R.title}.`);
    this.hooks.herald?.({ house: FACTIONS[0], title: `You are ${R.title}`, text: `${R.tools} ${R.trouble}` });
    this.hooks.rankUp?.(this.rank);
  }

  // Your rank follows how much of the realm you hold.
  // The year runs twenty minutes: spring, summer, autumn and winter, five minutes each.
  get season() { return Math.floor((this.time % 1200) / 300); }
  get winter() { return this.season === 3; }

  get rank() {
    const n = this.pois.filter(p => p.owner === 0).length;
    if (this.crowned) return 'King';
    return n >= 11 ? 'Duke' : n >= 5 ? 'Count' : n >= 2 ? 'Lord' : 'Reeve';
  }

  checkEnd() {
    if (this.winner !== null) return;
    if (this.part === 2) {
      // Part 2 ends when the north is driven out, or when you have nothing left.
      if (!this.pois.some(p => p.owner === this.invader) && !this.armies.some(a => a.side === this.invader)) { this.winner = 0; this.victory = 'north'; this.chron('The host of Norrhold was driven back through the wall, and the realm was safe.'); }
      else if (!this.pois.some(p => p.owner === 0) && !this.armies.some(a => a.side === 0 && !a.wagon)) this.winner = 1;
      if (this.winner !== null) this.hooks.ended(this.winner);
      return;
    }
    // Crowned by the sword (Kingsbridge and half the realm, counting the places of houses
    // that back you) or by acclaim (every great house still standing backs your claim).
    const real = this.pois.filter(p => p.kind !== 'camp');
    const B = new Set(backers(this).map(h => h.index));
    const mine = real.filter(p => p.owner === 0 || B.has(p.owner)).length;
    const rivals = FACTIONS.slice(1, this.bandits).filter(h => h.alive);
    if (this.crown.owner === 0 && mine >= real.length / 2) { this.crowned = true; this.winner = 0; this.victory = 'sword'; }
    // A palace at Kingsbridge, yours, means one great house may hold out.
    else if (!rivals.length || rivals.filter(h => !B.has(h.index)).length <= (workDone(this, 'palace') && this.crown.owner === 0 && rivals.length >= 2 ? 1 : 0)) { this.crowned = true; this.winner = 0; this.victory = rivals.length ? 'acclaim' : 'sword'; }
    else if (!this.pois.some(p => p.owner === 0) && !this.armies.some(a => a.side === 0 && !a.wagon)) this.winner = 1;
    if (this.crowned && this.winner === 0) this.chron(this.victory === 'acclaim' ? 'Every great house named you king, and you were crowned at Kingsbridge.' : 'Kingsbridge was yours and the realm knelt: you were crowned.');
    if (this.winner !== null) this.hooks.ended(this.winner);
  }

  // ---- Part 2: the wall falls ----
  // You are crowned. Every great house left kneels to you, their wars are ended, and the
  // old wall in the north comes down: a new land opens beyond it, and a host with it.
  beginPart2() {
    if (this.part === 2) return;
    this.part = 2;
    this.chron('The old wall in the north fell, and the host of Norrhold came through it.');
    this.winner = null;
    this.wars.clear();
    for (const H of FACTIONS.slice(1, this.bandits)) {
      if (!H.alive) continue;
      const d = this.dip[H.index];
      Object.assign(d, { vassal: true, backs: true, truceUntil: Infinity, opinion: Math.max(d.opinion, 40) });
      H.vassalOf = 0;
      this.meet(H.index);
    }
    // The host of the north.
    const inv = { ...INVADER, index: FACTIONS.length, gold: 2000, arms: 400, alive: true };
    FACTIONS.push(inv);
    this.invader = inv.index;
    this.dip.push({ opinion: -100, gift: 0, truceUntil: 0, allied: false, married: false, backs: false, vassal: false, broken: 0, score: 0, warSince: 0, offerCd: Infinity });
    // Its land joins the map.
    const B = this.beyond, start = this.pois.length;
    const added = B.places.map((p, i) => ({ ...p, owner: inv.index, seed: this.seed + 1000 * (start + i + 1), garrison: [], town: null, seen: false, visible: false }));
    const byOld = new Map(B.places.map((p, i) => [p, added[i]]));
    for (const p of added) p.links = p.links.map(q => byOld.get(q));
    for (const r of B.roads) this.roads.push({ a: byOld.get(r.a), b: byOld.get(r.b) });
    for (const { from, to } of B.breaches) {
      const a = byOld.get(from);
      a.links.push(to); to.links.push(a);
      this.roads.push({ a, b: to });
      this.wall.breaches.push({ x: (a.x + to.x) / 2, z: (a.z + to.z) / 2, from: a, to });
      a.seen = true;   // you can see the camps through the gaps
    }
    this.wall.fallen = true;
    for (const p of added) { this.pois.push(p); this.byId[p.id] = p; }
    const pass = byOld.get(B.pass);
    pass.seat = inv.index;
    inv.seat = pass;
    for (const p of added) this.seedHolding(p);
    this.half = Math.max(this.half, ...added.map(p => Math.max(Math.abs(p.x), Math.abs(p.z)) + 140));
    startMind(this, inv);
    this.updateVision();
    for (const p of added) if (p.seen) p.known = { owner: p.owner, men: headcount(p.garrison), level: p.eco?.level ?? null };
    this.log('The old wall has fallen. The north is coming.', 1);
    this.hooks.herald?.({ house: inv, title: 'The wall has fallen', text: `“${inv.taunts[0]}” ${inv.lord} brings his host down through the north. Drive them back through ${pass.name}, or lose all you have built.` });
  }

  // ---- time ----

  update(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    for (const p of this.pois) if (p.town) this.updateTown(p, dt);
    for (const a of [...this.armies]) if (!a.gone) { if (a.wagon) moveWagon(this, a, dt); else if (a.escort) followCart(this, a); else this.moveArmy(a, dt); }
    this.checkMeetings();
    this.supplyClock = (this.supplyClock || 0) - dt;
    if (this.supplyClock <= 0) { this.supplyClock = 1; supplyArmies(this, 1); catchWagons(this, MEET); }
    this.ecoClock -= dt;
    if (this.ecoClock <= 0) { this.ecoClock = 5; this.tickHoldings(5); this.collectTaxes(5); this.tickSpies(); tickVassals(this, 5); tickCompanies(this, 5); tickHousehold(this); payElites(this, 5); tickMarkets(this, 5); tickEvents(this, 5); tickTrade(this, 5); tickWorks(this, 5); tickDecrees(this, 5); this.tickSieges(5); if (Math.floor(this.time) % 30 < 5) tickRansoms(this); this.checkRank(); }
    this.sightClock -= dt;
    if (this.sightClock <= 0) { this.sightClock = 0.5; this.updateVision(); }
    thinkHouses(this, dt);
    thinkDiplomacy(this, dt);
  }

  // ---- vassals ----
  // From the rank of Lord you may give a village to a vassal, who runs it on the same rules
  // as every place you don't run yourself. Its streets and walls are remembered, so if you
  // take it back you find it as you left it, with whatever the vassal built since.

  canGrant(p) {
    if (p.owner !== 0 || !p.town) return { ok: false, why: 'Not a village of yours' };
    if (this.rank === 'Reeve') return { ok: false, why: 'From the rank of Lord' };
    if (p === this.home || FACTIONS[0].seat === p) return { ok: false, why: 'Your seat stays yours' };
    if (p.town.hostile || p.town.underAttack || p.town.revolt) return { ok: false, why: 'Not while it is fighting' };
    const foe = this.armies.find(a => a.target === p && a.side !== 0 && !a.wagon && !a.gone && this.atWar(0, a.side));
    return { ok: true, warn: foe ? `${foe.name} is marching on ${p.name}: a new lord's household may not hold it` : null };
  }

  // Where your lord is: with the army he rides with, if it waits at one of your places;
  // at your seat if he rides with none; nowhere while he is on the road.
  lordAt() {
    if (this.lordCaptive !== undefined && this.lordCaptive !== null) return null;
    const a = this.armies.find(o => o.lord === 0 && !o.gone);
    if (!a) return FACTIONS[0].seat || this.home;
    return !a.path.length && a.at?.owner === 0 ? a.at : null;
  }

  // A captain of yours who has served well can be given a village and made a vassal.
  knightable() { return (this.captains || []).filter(c => c.alive && c.side === 0 && c.level >= KNIGHT_LEVEL); }
  knight(p, c) {
    if (!c || !this.knightable().includes(c) || !this.canGrant(p).ok) return null;
    const army = this.armies.find(a => a.captain === c.id);
    if (army) army.captain = null;
    c.alive = false;
    c.knighted = true;
    c.army = null;
    const v = this.grant(p, null);
    if (!v) return null;
    v.name = `${LADIES.has(c.name.split(' ')[0]) ? 'Dame' : 'Sir'} ${c.name}`;
    v.temper = 'loyal';
    v.memory = [...c.memory.slice(-10), ...v.memory.map(m => ({ ...m, text: m.text }))];
    mark(this, v, 15, 'Knighted by you', Infinity);
    recall(this, v, 'Knighted by you after years in your service');
    this.log(`Captain ${c.name} kneels and rises ${v.name}, lord of ${p.name} under you.`);
    this.chron(`Captain ${c.name} was knighted and given ${p.name}.`);
    return v;
  }

  // Gives village p to vassal v, or to a new one.
  grant(p, v = null) {
    if (!this.canGrant(p).ok) return null;
    const t = p.town;
    const men = t.garrison().filter(r => r.alive > 0).map(r => ({ ...unit(r.T.key, r.alive, r.name), ...carry(r) }));
    const people = t.villagers.filter(o => o.state !== 'soldier').length;
    p.mem = remember(t, 0, this.time);
    const eco = fromTown(t, { kept: 1 });
    eco.pop = Math.max(10, people);
    Object.assign(p, { town: null, garrison: men, eco });
    if (v) {
      if (v.landless) { v.landless = false; mark(this, v, 10, 'Given land again', 2400); }
      mark(this, v, 12, `Given ${p.name}`, Infinity);
      recall(this, v, `Given ${p.name} by you`);
    } else v = makeVassal(this, p);
    p.vassal = v.id;
    // A vassal comes with a household to hold the place, however few you left there.
    const need = Math.min(30, 12 + Math.round(eco.pop / 8)) - headcount(men);
    if (need > 0) p.garrison.push(unit('spear', need, `Household of ${v.name.split(' ').at(-1)}`));
    this.log(`You have given ${p.name} to ${v.name}.`);
    this.hooks.granted?.(p, v);
    return v;
  }

  // Takes a village back from its vassal. It stands as you left it, with what the vassal
  // built since laid out around your streets. The other vassals take note.
  revoke(p, quiet = false) {
    const v = vassalOf(this, p);
    if (!v || p.owner !== 0) return false;
    const e = p.eco, men = p.garrison;
    const town = this.makeTown(p, { villagers: Math.max(6, Math.min(80, Math.round(e.pop))), retinue: false, stock: stores(e) });
    layPlace(town, p, 0);
    p.mem = null;
    grownLevels(town, e);
    p.eco = null;
    p.vassal = null;
    if (men.length) town.addTroops(men, this.angle(p, p.links[0]));
    recall(this, v, `${p.name} was taken back by you`);
    if (quiet) return true;
    const left = !holdingsOf(this, v).length;
    if (left) { v.gone = true; v.council = false; v.seat = null; recall(this, v, 'Left your service, landless'); }
    else mark(this, v, -30, `You took ${p.name} back`, 2400);
    for (const o of living(this)) if (o !== v) mark(this, o, -12 * harmWeight(v), `You took ${p.name} from ${v.name}`, 1800);
    this.log(`You have taken ${p.name} back from ${v.name}.${left ? ` It was all they held: ${v.name} has left your service for good.` : ''}`, 1);
    return true;
  }

  // A look round a vassal's village, read-only: laid out from his tally on your
  // remembered streets, and that layout kept as the place's own (the layout rule), so
  // what you saw is what you get back if you ever take it back. The village itself goes on
  // being run as numbers; the town returned here is a picture of it, thrown away after.
  viewTown(p) {
    const v = vassalOf(this, p), e = p.eco;
    if (!v || !e || p.town) return null;
    const keep = { town: p.town, heightAt: p.heightAt, trees: p.trees, garrison: p.garrison, aiClock: p.aiClock, pruneClock: p.pruneClock, onRoad: p.onRoad };
    const town = this.makeTown(p, { villagers: Math.max(6, Math.min(80, Math.round(e.pop))), retinue: false, stock: stores(e) });
    const look = { town, heightAt: p.heightAt, trees: p.trees, onRoad: p.onRoad };
    Object.assign(p, keep);
    layPlace(town, p, 0);
    grownLevels(town, e);
    p.mem = remember(town, 0, this.time);
    if (keep.garrison.length) town.addTroops(keep.garrison.map(u => ({ ...u })), this.angle(p, p.links[0]));
    Object.assign(town, { readOnly: v, purse: { gold: Math.round(v.gold) }, flagColor: v.color, event: () => {},
      onFall: () => {}, onRebel: () => {}, onMilestone: () => {}, hallRule: () => 'Not your village', greatRule: () => 'Not your village' });
    return look;
  }

  // What you can do for or to a vassal, from the place panel.
  // arg: a place (grant, revoke, arms) or a council seat (seat); see vassals.js interact.
  // Every dealing with a vassal, from the map panel and the Realm screen. A refusal always
  // says why, on screen (the caller shows .text) and in the console.
  vassalAct(v, act, arg) {
    const r = this.dealWith(v, act, arg);
    if (!r.ok) console.warn(`[vassals] ${v?.name || 'no vassal'}, ${act}: ${r.text}`);
    return r;
  }

  dealWith(v, act, arg) {
    if (!v || v.gone) return { ok: false, text: 'They are no longer your vassal' };
    const me = FACTIONS[0];
    const done = interact(this, v, act, arg);
    if (done) return done;
    if (act === 'dues+' || act === 'dues-' || act === 'levy+' || act === 'levy-') {
      const k = act.startsWith('dues') ? 'dues' : 'levy', up = act.endsWith('+');
      const was = v[k];
      v[k] = Math.max(0, Math.min(2, v[k] + (up ? 1 : -1)));
      if (v[k] === was) return { ok: false, text: `${k === 'dues' ? 'Dues' : 'Levies'} are as ${up ? 'heavy' : 'light'} as they go` };
      // Raising what they owe stings for a while on top of the standing grievance, unless
      // they owe you a favour.
      let text;
      if (up && v.favours > 0) { v.favours--; text = `${v.name} accepts it: they owed you.`; }
      else if (up) mark(this, v, -6, 'You raised what is owed', 900);
      recall(this, v, `${k === 'dues' ? 'Dues' : 'Levies'} set to ${(k === 'dues' ? DUES : LEVIES)[v[k]].name.toLowerCase()}`);
      return { ok: true, text };
    }
    // Their feud: side with one, or pay them both to make peace.
    const foe = v.feud && this.vassals.find(o => o.id === v.feud);
    if (act === 'judge' && foe) {
      mark(this, v, 15, `You judged for them against ${foe.name}`, 2400);
      mark(this, foe, -20, `You judged for ${v.name} against them`, 2400);
      recall(this, v, `You judged their feud with ${foe.name} in their favour`);
      recall(this, foe, `You judged their feud with ${v.name} against them`);
      endFeud(this, v, foe);
      owe(this, v, `judging their feud with ${foe.name} for them`);
      return { ok: true, text: `You judge for ${v.name}. ${foe.name} goes home angry.` };
    }
    if (act === 'reconcile' && foe) {
      if (me.gold < RECONCILE) return { ok: false, text: `Needs ${RECONCILE} gold` };
      me.gold -= RECONCILE;
      for (const [a, b] of [[v, foe], [foe, v]]) { mark(this, a, 5, `You made their peace with ${b.name}`, 1200); recall(this, a, `Reconciled with ${b.name} at your table`); }
      endFeud(this, v, foe);
      return { ok: true, text: `${v.name} and ${foe.name} shake hands at your table.` };
    }
    if (act === 'judge' || act === 'reconcile') return { ok: false, text: `${v.name} has no feud to settle` };
    return { ok: false, text: `No such dealing: ${act}` };
  }

  // Out of your dungeon, landless and grateful, until you give them a village.
  pardon(v) {
    if (!v?.prison) return false;
    v.prison = false;
    v.landless = true;
    v.marks = v.marks.filter(m => m.n > 0);
    mark(this, v, 25, 'Pardoned by you', 3600);
    recall(this, v, 'Pardoned and let out of your dungeon');
    for (const o of living(this)) if (o !== v) mark(this, o, 5, `You pardoned ${v.name}`, 1200);
    this.log(`You pardon ${v.name}, who waits at your court for land.`);
    return true;
  }

  // The faction's demand, answered. Yes: light dues and levies for every member (or, if
  // they already pay light, nothing more can be given and they go free). No: they rise,
  // and their villages declare themselves free of you.
  factionAnswer(yes) {
    const F = this.faction;
    if (!F) return;
    const vs = F.members.map(id => this.vassals.find(o => o.id === id)).filter(v => v && !v.gone && !v.prison);
    this.faction = null;
    if (yes && F.demand === 'dues') {
      for (const v of vs) { v.dues = 0; v.levy = 0; v.refusing = false; mark(this, v, 10, 'You gave in to the faction', 2400); recall(this, v, 'Won light dues from you with the faction'); }
      this.log(`You give way: ${vs.map(v => v.name).join(', ')} pay light dues and send light levies.`, 1);
      return;
    }
    for (const v of vs) {
      for (const p of holdingsOf(this, v)) {
        // A titled lord who rises draws twice the men to their banner (vassals.js TITLED).
        if (!yes && v.title) for (const u of p.garrison || []) u.count *= TITLED.faction;
        p.vassal = null; p.owner = null; p.free = v.name;
      }
      v.gone = true; v.council = false; v.seat = null;
      v.rebel = !yes;
      recall(this, v, yes ? 'Released from your service' : 'Rose against you');
    }
    for (const o of living(this)) mark(this, o, yes ? -5 : 8, yes ? 'You let the faction go' : 'Stood by you when others rose', 2400);
    this.log(yes ? `${vs.map(v => v.name).join(', ')} hold their villages free of you now.` : `${vs.map(v => v.name).join(', ')} have risen against you! Their villages are free of you; take them back by force.`, 1);
    this.chron(yes ? `${vs.map(v => v.name).join(', ')} were let go from your service.` : `${vs.map(v => v.name).join(', ')} rose against you.`);
    if (!yes) this.hooks.herald?.({ house: { name: vs[0]?.name || 'Your vassals', color: vs[0]?.color || '#8a6a3a' }, title: 'Your vassals rise', text: `${vs.map(v => v.name).join(', ')} refuse you as their lord. Their villages stand against you now.` });
  }

  // ---- spies ----
  // A spy walks in as a pedlar and comes back with what the place holds: its people,
  // buildings, stores and garrison, as they were that day. Walls and soldiers make it
  // harder; a spy who is caught angers the lord whose place it is.

  spyCost(p) { return 40 + (p.seat !== undefined ? 30 : 0) + (p.kind === 'crown' ? 60 : 0); }
  spyRisk(p) {
    const w = p.eco?.walls;
    return Math.min(0.6, 0.12 + (w === 'stone' ? 0.15 : w === 'wood' ? 0.06 : 0) + (p.eco?.focus === 'military' ? 0.08 : 0) + (p.seat !== undefined ? 0.1 : 0));
  }
  canSpy(p) {
    if (!p.seen || p.owner === 0 || p.town || !p.eco?.buildings) return { ok: false, why: 'Nothing to spy on there' };
    if (this.spies.some(s => s.at === p.id)) return { ok: false, why: 'A spy is on the way' };
    if (FACTIONS[0].gold < this.spyCost(p)) return { ok: false, why: `Needs ${this.spyCost(p)} gold` };
    return { ok: true };
  }
  sendSpy(p) {
    if (!this.canSpy(p).ok) return false;
    FACTIONS[0].gold -= this.spyCost(p);
    const from = this.home && this.home.owner === 0 ? this.home : p;
    const secs = 25 + Math.hypot(p.x - from.x, p.z - from.z) * 0.25;
    this.spies.push({ at: p.id, back: this.time + secs });
    this.log(`A spy sets out for ${p.name} dressed as a pedlar: expect word in about ${Math.max(1, Math.round(secs / 60))} minute${secs >= 90 ? 's' : ''}.`);
    return true;
  }
  tickSpies() {
    for (const s of this.spies.filter(s => s.back <= this.time)) {
      this.spies.splice(this.spies.indexOf(s), 1);
      const p = this.byId[s.at];
      if (!p || !p.eco?.buildings || p.owner === 0) continue;
      if (this.rand() < this.spyRisk(p)) {
        this.log(`Your spy was caught in ${p.name}.`, 1);
        if (p.owner !== null && this.dip?.[p.owner]) { this.dip[p.owner].opinion -= 10; this.meet(p.owner); }
        continue;
      }
      p.intel = report(p, this.time);
      const r = p.intel, rich = ['poor', 'modest', 'rich'][r.wealth];
      this.hooks.sound?.('quill'); // audio
      this.log(`Your spy is back from ${p.name}: a ${rich} place, stores worth about ${worth(r.stock, r.gold)} gold, ${r.men} men.`);
    }
  }

  // Your taxes: every villager pays a little, more in market towns and fords; vassals
  // send a share of theirs.
  // Tax gold a second from one of the villages you run: the tithe and your steward add to it.
  taxOf(p) {
    const t = p.town;
    return t ? t.population * t.taxRate * KINDS[p.kind].gold * (decreed(this, 'tithe') ? 1.25 : 1) * (1 + seatPower(this, 'steward')) : 0;
  }

  collectTaxes(dt) {
    const me = FACTIONS[0];
    for (const p of this.pois) if (p.owner === 0 && p.town && !p.town.hostile) me.gold += dt * this.taxOf(p);
    for (const h of FACTIONS) if (this.dip?.[h.index]?.vassal && h.alive) { const n = Math.min(h.gold, dt * 0.6); h.gold -= n; me.gold += n; }
  }

  updateTown(p, dt) {
    const t = p.town, b = t.battle;
    b.step(dt);
    t.update(dt);
    p.aiClock -= dt;
    if (p.aiClock <= 0) {
      p.aiClock = 1;
      t.thinkAttackers();
      // With nobody watching, the garrison turns out against attackers by itself.
      if (t.underAttack && this.hooks.watching() !== p) {
        if (t.hostile && b.walls.structures().some(s => s.side === 1 && s.state === 'up')) thinkSiegeAttack(b, 0);
        // (not the militia: they keep their own rules, economy.js thinkMilitia)
        else thinkAI(b, 0, { start: 0, regs: b.regs.filter(r => !r.T.militia) });
      }
    }
    p.pruneClock -= dt;
    if (p.pruneClock <= 0) { p.pruneClock = 30; b.prune(); }
    if (p.owner === 0 && this.hooks.watching() !== p) govern(t, dt);
    if (p.falling) this.fall(p);
    if (t.hostile) this.checkStorm(p);
  }

  // How hard a place would be to take, in the same units as power().
  defence(p) {
    if (!p.town) return power(p.garrison) * this.defenceBonus(p);
    const regs = p.town.garrison();
    return regs.reduce((n, r) => n + r.alive * value(r.T.key), 0) + 25 + p.town.population * 0.3;
  }
}

export function unit(key, count, name) { return { key, count, name }; }

// A stormed place's militia still alive, run off or not.
const folkLeft = b => b.regs.filter(r => r.side === 1 && r.T.militia).reduce((n, r) => n + r.soldiers.filter(s => s.alive).length, 0);

// An army as you can make it out (updateVision's a.know): its name and size close up, its
// name and a rough size in the middle distance, at the edge only that an army is there.
export const roughly = n => (n < 100 ? Math.max(10, Math.round(n / 10) * 10) : Math.round(n / 50) * 50);
export function seenAs(a) {
  const know = a.side === 0 ? 3 : a.know ?? 3, men = headcount(a.units);
  return { know, name: know >= 2 ? a.name : 'An army', men: know >= 3 ? `${men}` : know === 2 ? `about ${roughly(men)}` : '' };
}

// What each rank brings (the crown has its own moment).
const RANKS = {
  Lord: { title: 'a lord', tools: 'You may give villages to vassals to run for you, lay out whole quarters from town templates, and call the banners.',
    trouble: 'Vassals have minds of their own: watch what they think of you.' },
  Count: { title: 'a count', tools: 'Your villages with a strong keep may raise a knights\' hall for elite men.',
    trouble: 'The great houses take you seriously now, and a slighted vassal may stop paying.' },
  Duke: { title: 'a duke', tools: 'Half the realm looks to you; the crown is within reach.',
    trouble: 'Every house measures itself against you now.' },
};

// The north fights in great numbers, with heavy foot and horse when the battle code has them.
function northGarrison(p, rand) {
  const k = { pass: 3.2, warcamp: 2.2, castle: 1.6 }[p.kind] || 0.8;
  const n = x => Math.round(x * k * (0.8 + rand() * 0.4));
  const heavy = TYPES.maa ? 'maa' : 'sword', horse = TYPES.lightcav ? 'lightcav' : 'cav';
  return [unit('spear', n(60), 'Northern spears'), unit(heavy, n(40), 'Northern axemen'), unit('archer', n(30), 'Northern bows'), unit(horse, n(16), 'Northern riders')];
}

// What a house's workshops turn out, by its lord's bent.
function pickKind(h, r, time) {
  const has = k => !!TYPES[k];
  const late = time > 900;
  const mix = {
    raider: ['spear', 'archer', has('lightcav') ? 'lightcav' : 'cav', 'sword'],
    builder: ['spear', 'archer', 'spear', 'sword'],
    turtler: ['spear', has('crossbow') ? 'crossbow' : 'archer', 'archer', 'spear'],
    schemer: ['spear', 'archer', 'sword', 'spear'],
    // Men-at-arms and knights come only from a knights' hall, for every house (trainHall).
    merchant: ['spear', has('crossbow') ? 'crossbow' : 'archer', 'sword', 'sword'],
    hothead: ['spear', 'cav', 'cav', 'sword'],
  }[h.trait] || ['spear', 'archer', 'sword', 'spear'];
  const k = mix[Math.floor(r * mix.length)];
  return k === 'cav' && !late && h.trait !== 'hothead' && h.trait !== 'raider' ? 'spear' : k;
}

// Folds arriving units into a garrison, filling regiments of the same kind first.
// How much further a place of yours sees for its watchtowers (only the best three count).
function lookouts(p) {
  if (!p.town) return 0;
  return p.town.buildings.filter(b => b.kind === 'watchtower' && b.state === 'active')
    .map(b => b.B.sight * (1 + 0.3 * ((b.level || 1) - 1))).sort((a, b) => b - a).slice(0, 3)
    .reduce((n, r, i) => n + r / (i + 1), 0);
}

// Men in different armour stay in different regiments (one level to a regiment).
const sameGear = (a, b) => { const x = gearOf(a), y = gearOf(b); return x.armour === y.armour && x.shield === y.shield; };
const gearFields = u => ({ ...(u.armour !== undefined || u.shield !== undefined ? gearOf(u) : {}), ...(u.battles ? { battles: u.battles } : {}), ...(u.xp ? { xp: u.xp } : {}), ...(u.elite ? { elite: true } : {}) });

export function mergeInto(garrison, units) {
  for (const u of units) recruit(garrison, u.key, u.count, u.name, null, gearFields(u));
}

export function recruit(garrison, key, n, name, house, gear = {}) {
  const size = TYPES[key]?.count || 40;
  const like = { key, ...gear };
  while (n > 0) {
    let g = garrison.find(u => u.key === key && u.count < size && sameGear(u, like) && !!u.elite === !!gear.elite);
    if (!g) garrison.push(g = { ...unit(key, 0, name || `${house ? house.short + ' ' : ''}${(TYPES[key]?.name || key).toLowerCase()}`), ...gear, xp: 0 });
    const k = Math.min(n, size - g.count);
    if (gear.battles) g.battles = Math.max(g.battles || 0, gear.battles);
    // Fresh men dilute a regiment's experience; veterans joining raise it.
    if (gear.xp || g.xp) g.xp = Math.round(((g.xp || 0) * g.count + (gear.xp || 0) * k) / Math.max(1, g.count + k) * 10) / 10;
    g.count += k;
    n -= k;
  }
}

// Takes roughly `want` strength out of a garrison, a slice of each regiment.
// The regiments a village keeps as its guard when the banners are called: those that
// must stay (on the walls, militia, broken), then the fewest extra men that make up
// `guard`, regiments being sent whole. `all` comes sorted best-to-keep first (bows and
// spears before horse); a large garrison simply keeps in that order.
function guardOf(all, guard) {
  const keep = new Set(all.filter(c => c.stays));
  let need = guard - [...keep].reduce((n, c) => n + c.men, 0);
  const rest = all.filter(c => !c.stays);
  if (need <= 0) return keep;
  if (rest.length > 12) { for (const c of rest) if (need > 0) { keep.add(c); need -= c.men; } return keep; }
  let best = null, bestMen = Infinity;
  for (let m = 1; m < 1 << rest.length; m++) {
    let men = 0;
    for (let i = 0; i < rest.length; i++) if (m & 1 << i) men += rest[i].men;
    if (men >= need && men < bestMen) { best = m; bestMen = men; }
  }
  rest.forEach((c, i) => { if (best === null || best & 1 << i) keep.add(c); });
  return keep;
}

export function takeUnits(garrison, want) {
  const total = power(garrison);
  if (want <= 0 || total <= 0) return [];
  const f = Math.min(1, want / total);
  const out = [];
  for (const g of garrison) {
    const k = Math.round(g.count * f);
    if (k < 3) continue;
    g.count -= k;
    out.push({ ...unit(g.key, k, g.name), ...gearFields(g) });
  }
  for (let i = garrison.length - 1; i >= 0; i--) if (garrison[i].count < 3) garrison.splice(i, 1);
  return out;
}
