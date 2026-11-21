// One layout for each place, shared by every view of it. A place you don't run is laid
// out from its numbers (holdings.js eco: people, buildings, walls, wealth, trade) the same
// way whether you storm it, take it, look round it or see it on the world map:
// - towns: the keep, a square with its well, market and chapel, streets along the roads
//   that come in with houses fronting them in rows, lanes off them, workshops along the
//   streets and the smelly ones at the edge, gatherers at their trees, rock and ore, and
//   strip fields in a ring outside; it grows outward as the place grows;
// - walls follow the built-up edge and the ground, with a gate wherever a road crosses and
//   towers at the corners and along long stretches;
// - castles: a curtain hugging the keep round a bailey of barracks, stables, smithy, well
//   and store, the village outside; a lord's seat is a castle in a walled town, and
//   Kingsbridge a walled city with a gate on every road.
// The layout is worked out on a throwaway copy of the place's ground (planned on the same
// Town rules a real village uses) and kept as the place's own the first time you see it
// up close (the layout rule): after that it is remembered (p.mem) and only grows.
// Every building in the tally is placed; one that truly can't be is said so, never dropped.
import { Battle } from '../battle.js';
import { Town, BUILDINGS } from '../economy.js';
import { makeHeight, plantTrees } from '../terrain.js';
import { rng } from '../noise.js';
import { MATERIALS } from '../walls.js';

const TAU = Math.PI * 2;
const KEEP_CLEAR = 17;    // the keep's model reaches about 16 m out at level 5 (economy KEEP.radius is 11)
const STREET = 3;         // half the width of a street; lanes are narrower
const LANE = 2;
const SMELLY = new Set(['tanner', 'smelter']);
const GATHER = new Set(['woodcutter', 'quarry', 'mine', 'hunter']);
const FIELDS = new Set(['farm', 'flax']);
// What stands in a castle's bailey, when the place has it.
const BAILEY = ['barracks', 'stable', 'hall', 'siegeworks', 'weaponsmith', 'armourer', 'storehouse', 'well'];
// The open square at the heart of a town, by kind: a market town's is the biggest.
const SQUARE = { village: 9, market: 16, ford: 10, mine: 8, monastery: 9, seat: 12, crown: 18, castle: 7 };
const HOUSE_STYLES = 6;   // picked per house; the views take it modulo their own count

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const hyp = Math.hypot;

// ---- the ground a place stands on ----

// The roads in, the ground and the woods of place p's own map: the same for the real
// village (world.makeTown) and for planning it here.
export function ground(p) {
  const roadAngles = p.links.map(q => Math.atan2(q.x - p.x, q.z - p.z));
  const heightAt = makeHeight(p.seed, [{ x: 0, z: 0 }]);
  // Roads in from the edge stay clear of trees so armies can march in.
  const onRoad = (x, z) => roadAngles.some(a => {
    const along = x * Math.sin(a) + z * Math.cos(a), across = x * Math.cos(a) - z * Math.sin(a);
    return along > 0 && Math.abs(across) < 7;
  });
  const trees = plantTrees(p.seed, (x, z) => Math.hypot(x, z) < 45 || onRoad(x, z), 0.5, 1500);
  return { roadAngles, heightAt, onRoad, trees };
}

// A throwaway village on place p's ground, to plan on with the real placing rules.
function site(p) {
  const g = ground(p);
  const battle = new Battle(g.heightAt, p.seed, { deploy: false, homes: [{ x: 0, z: 0 }, { x: 0, z: -225 }], disbandAtHome: [false, true] });
  const t = new Town(battle, g.heightAt, g.trees, rng(p.seed + 7), { kind: p.kind, villagers: 0, retinue: false, stock: {} });
  // (the planner places what the place has; the rank and size rules are the player's)
  Object.assign(t, { keepLevel: 5, hallRule: () => null, greatRule: () => null });
  Object.defineProperty(t, 'population', { value: 999 });
  t.roadAngles = g.roadAngles;
  return t;
}

// ---- what a place is ----

const kindOf = p => (p.kind === 'crown' ? 'crown' : p.seat !== undefined ? 'seat' : p.kind);
// Castles, seats and the royal city have a curtain round the keep.
const hasCastle = p => ['castle', 'seat', 'crown'].includes(kindOf(p));

// Whether a place stands behind walls: as remembered if it has been seen up close, else
// by its numbers, else by its kind.
export const walledPlace = p => (p.mem ? p.mem.pieces.length > 0 : p.eco?.walls ? p.eco.walls !== 'none'
  : ['castle', 'crown', 'pass', 'warcamp'].includes(p.kind) || p.seat !== undefined);
export const wallMaterial = p => {
  const m = p.mem?.pieces.find(q => !q.broken) || p.mem?.pieces[0];
  return m ? m.material : p.eco?.walls && p.eco.walls !== 'none' ? p.eco.walls
    : p.kind === 'warcamp' || (p.kind === 'village' && (p.eco?.level ?? 1) < 2) ? 'wood' : 'stone';
};

// The keep a place shows: a lord's seat one level up, a castle or the royal city a stone keep at least.
export const keepLevelFor = p => p.mem?.keepLevel || p.mem?.keepShown
  || Math.min(5, Math.max(p.kind === 'castle' || p.kind === 'crown' ? 3 : 1, (p.eco?.level ?? 1) + (p.seat !== undefined ? 1 : 0)));

// The tally a layout must show: the place's numbers, or a rough village for a place
// without them (the north's strongholds and outlaw camps).
export function tallyOf(p) {
  if (p.eco?.buildings) return { ...p.eco.buildings };
  const pop = p.eco?.pop ?? 20, n = (k, lo, hi) => Math.max(lo, Math.min(hi, Math.round(k)));
  return { house: n(pop / 5, 3, 24), farm: n(pop / 14, 1, 7), storehouse: 1, woodcutter: 1, hunter: 1 };
}

// What a held place grew into while you were away, worn onto its buildings: workshops at
// the levels a village of its size and standing could pay for (economy.js UPGRADES), and
// a keep never smaller than its people. Positions stay as remembered, or as first laid out.
export function grownLevels(town, e) {
  if (!e) return;
  const top = e.pop >= 60 && e.level >= 3 ? 3 : e.pop >= 30 && e.level >= 2 ? 2 : 1;
  for (const b of town.buildings) {
    if (b.state !== 'active' || b.kind === 'house' || b.kind === 'keep' || b.B.hall || b.B.great) continue;
    b.level = Math.max(b.level || 1, top);
  }
  const byPop = e.pop >= 150 ? 5 : e.pop >= 100 ? 4 : e.pop >= 60 ? 3 : e.pop >= 30 ? 2 : 1;
  town.keepPeak = Math.max(town.keepPeak || 1, byPop);
  // the great keep its lord paid for comes with the place (economy.js KEEP_RAISE)
  town.keepBought = Math.max(town.keepBought || 0, byPop - 3);
  if (town.keepLevel) town.keepLevel = Math.max(town.keepLevel, byPop);
}

// ---- remembering a place ----

// A place keeps its streets and walls when it changes hands: what stood is put back up
// the next time anyone fights there. Burned buildings and unfinished sites are gone.
// (`v` is the layout rule it was kept under: older ones are laid out afresh, see relayOld)
const LAYOUT = 2;
export function remember(t, side, time) {
  const W = t.battle.walls, idx = new Map();
  const nodes = W.nodes.filter(n => n.side === side).map((n, i) => {
    idx.set(n, i);
    return { x: n.x, z: n.z, tower: n.tower && n.tower.state !== 'site' ? { material: n.tower.material, broken: n.tower.state === 'broken' } : null };
  });
  const pieces = W.pieces.filter(p => p.side === side && p.state !== 'site' && idx.has(p.a) && idx.has(p.b))
    .map(p => ({ a: idx.get(p.a), b: idx.get(p.b), material: p.material, gate: p.gate, broken: p.state === 'broken' }));
  return { v: LAYOUT, at: time, keepLevel: t.keepLevel, keepPeak: t.keepPeak, keepBought: t.keepBought, centre: W.centre[side], lanes: t.lanes || [],
    buildings: t.buildings.filter(b => b.state === 'active').map(b => ({ kind: b.kind, x: b.x, z: b.z, level: b.level || 1, angle: b.angle, style: b.style })), nodes, pieces };
}

// Puts a remembered place back up for `side`. Left long enough, its holders mend the walls.
export function rebuild(town, mem, side, mended, name = 'A remembered place') {
  for (const b of mem.buildings) {
    if (!known(name, b.kind)) continue;
    const r = town.place(b.kind, b.x, b.z, { ready: true });
    if (!r.ok) continue;
    if (b.level > 1) r.building.level = b.level;
    if (b.angle !== undefined) r.building.angle = b.angle;
    if (b.style !== undefined) r.building.style = b.style;
  }
  if (mem.keepLevel) town.keepLevel = mem.keepLevel;
  if (mem.keepPeak) town.keepPeak = mem.keepPeak;
  if (mem.keepBought) town.keepBought = mem.keepBought;
  if (mem.lanes?.length) town.lanes = mem.lanes;
  if (!mem.pieces.length && !mem.nodes.some(n => n.tower)) return false;
  const W = town.battle.walls;
  const nodes = mem.nodes.map(n => W.node(n.x, n.z, side, { snap: false }));
  for (const p of mem.pieces) {
    const q = W.addPiece(nodes[p.a], nodes[p.b], side, p.material, true);
    if (p.gate) W.makeGate(q, { ready: true });
    if (p.broken && !mended) Object.assign(q, { hp: 0, state: 'broken', open: true });
  }
  mem.nodes.forEach((n, i) => {
    if (!n.tower) return;
    const r = W.placeTower(n.x, n.z, side, n.tower.material, { ready: true });
    if (r.ok && n.tower.broken && !mended) Object.assign(r.tower, { hp: 0, state: 'broken' });
  });
  W.centre[side] = mem.centre || { x: 0, z: 0 };
  W.changed();
  return true;
}

// A kind of building the game has (economy.js BUILDINGS). A tally or a memory naming one it
// hasn't (a slip elsewhere, an old save) is left out, said once per place and kind, so a bad
// number can never stop the map drawing.
const warned = new Set();
function known(name, kind) {
  if (BUILDINGS[kind]) return true;
  const key = `${name}|${kind}`;
  if (!warned.has(key)) { warned.add(key); console.warn(`places.js: ${name} names a building '${kind}' the game doesn't have; left out`); }
  return false;
}

// ---- planning ----

// Streets: polylines with a half-width and a cost (main streets cheapest, so they fill first).
// A castle's burgh (`burgh`) lives along the one road to its gate: the other roads come last.
function makeStreets(t, roads, sq, inner, rand, extra = [], burgh = false) {
  const out = [];
  const line = (a, r0, r1) => [{ x: Math.sin(a) * r0, z: Math.cos(a) * r0 }, { x: Math.sin(a) * r1, z: Math.cos(a) * r1 }];
  roads.forEach((a, i) => out.push({ pts: line(a, inner, 165), half: STREET, cost: burgh && i ? 90 : 0, main: !burgh || !i, road: true }));
  // With one road in, the street runs on through the village the other way a little.
  if (roads.length === 1) out.push({ pts: line(roads[0] + Math.PI, inner, 85), half: LANE, cost: 6 });
  // The square's edge is a street too: houses and shops face onto it.
  if (sq?.court) {
    // an abbey's cloister: a square court, its ranges built tight round all four sides
    const ux = Math.sin(sq.a), uz = Math.cos(sq.a), vx = uz, vz = -ux, pts = [];
    for (const [u, v] of [[-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]]) pts.push({ x: sq.x + (ux * u + vx * v) * sq.r, z: sq.z + (uz * u + vz * v) * sq.r });
    out.push({ pts, half: 0, cost: -12, square: true, court: true });
  } else if (sq) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; pts.push({ x: sq.x + Math.sin(a) * sq.r, z: sq.z + Math.cos(a) * sq.r }); }
    out.push({ pts, half: 0, cost: -2, square: true });
  }
  out.push(...extra);
  // Lanes off the main streets, either side, every forty metres or so.
  const mains = out.filter(s => s.main);
  for (const s of mains) {
    const a = Math.atan2(s.pts[1].x, s.pts[1].z), ux = Math.sin(a), uz = Math.cos(a);
    for (const along of [inner + 30 + rand() * 6, inner + 68 + rand() * 8, inner + 108 + rand() * 8]) {
      for (const side of [-1, 1]) {
        const o = { x: ux * along, z: uz * along }, nx = uz * side, nz = -ux * side;
        // a lane stops short of the next street, and of the square
        let len = 0;
        for (let d = 6; d <= 40; d += 2) {
          const x = o.x + nx * d, z = o.z + nz * d;
          if (out.some(m => m.road && m !== s && nearLine(x, z, m.pts) < 16) || (sq && hyp(x - sq.x, z - sq.z) < sq.r + 8)) break;
          len = d;
        }
        if (len >= 18) out.push({ pts: [o, { x: o.x + nx * len, z: o.z + nz * len }], half: LANE, cost: 10 + along * 0.05 });
      }
    }
  }
  // A ring lane joins streets that are far apart, round the old town.
  const sorted = burgh ? [] : [...roads].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length && sorted.length > 1; i++) {
    const a = sorted[i], b = sorted[(i + 1) % sorted.length], gap = ((b - a) % TAU + TAU) % TAU;
    if (gap < 1.2) continue;
    const R = inner + 46, pts = [];
    for (let k = 1; k < 10; k++) { const c = a + gap * k / 10; pts.push({ x: Math.sin(c) * R, z: Math.cos(c) * R }); }
    out.push({ pts, half: LANE, cost: 14, ring: true });
  }
  return out;
}

function nearLine(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, hyp(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

// Spots fronting the streets for a building of radius r, cheapest first.
function frontage(streets, r, step = 2.5) {
  const out = [];
  for (const s of streets) {
    for (let i = 0; i < s.pts.length - 1; i++) {
      const a = s.pts[i], b = s.pts[i + 1], len = hyp(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      for (let d = 0; d < len; d += step) {
        const cx = a.x + ux * d, cz = a.z + uz * d;
        for (const side of s.square ? [1] : [-1, 1]) {
          // round the square they stand outside it, facing in
          let nx = uz * side, nz = -ux * side;
          if (s.court) { if (nx * (cx - s.c.x) + nz * (cz - s.c.z) < 0) { nx = -nx; nz = -nz; } }
          else if (s.square) { const k = hyp(cx - s.c.x, cz - s.c.z) || 1; nx = (cx - s.c.x) / k; nz = (cz - s.c.z) / k; }
          const off = s.half + 1.2 + r, x = cx + nx * off, z = cz + nz * off;
          out.push({ x, z, angle: Math.atan2(-nx, -nz), rank: hyp(x, z) + s.cost, street: s });
        }
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

// Plans place p: returns its layout in the remembered form (see remember) plus what could not
// be placed. Built on a throwaway village; deterministic for the same place and numbers.
// `fresh` plans it anew over what is remembered, to `tally` and `walls` ('none', 'wood' or
// 'stone') when given.
function plan(p, { fresh = false, tally = null, walls = null } = {}) {
  const t = site(p), rand = rng(p.seed + 101), kind = kindOf(p);
  const roads = t.roadAngles.length ? t.roadAngles : [0];
  const main = roads[0];
  const unplaced = [];
  const want = tally ? { ...tally } : tallyOf(p);
  for (const k of Object.keys(want)) if (!known(p.name, k)) delete want[k];
  // What is remembered stands where it stood; only what it lacks is new.
  let kept = false;
  if (p.mem && !fresh) {
    rebuild(t, p.mem, 1, false, p.name);
    kept = true;
    for (const b of p.mem.buildings) if (want[b.kind] > 0) want[b.kind]--;
  }
  const count = k => Math.max(0, want[k] || 0);
  const take = k => { if (want[k] > 0) { want[k]--; return true; } return false; };
  const steep = (x, z, r) => [[r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => Math.abs(t.heightAt(x + dx, z + dz) - t.heightAt(x, z)) > (r > 5 ? 3.5 : 2));
  // Nothing on a street or in the open square or castle yard but what belongs there.
  const zones = [];
  let streets = [];
  const clear = (x, z, r, own = null) => {
    for (const s of streets) if (s !== own && !s.square && nearLine(x, z, s.pts) < s.half + r + 0.6) return false;
    for (const zn of zones) if (zn !== own && hyp(x - zn.x, z - zn.z) < zn.r + r) return false;
    return hyp(x, z) >= KEEP_CLEAR + r;
  };
  const fits = (k, x, z, own) => t.canPlace(k, x, z, { free: true }).ok && clear(x, z, BUILDINGS[k].radius, own);
  const put = (k, x, z, angle = null) => {
    const r = t.place(k, x, z, { ready: true }), b = r.building;
    if (angle !== null) b.angle = angle;
    if (k === 'house') b.style = Math.floor(rand() * HOUSE_STYLES);
    return b;
  };
  // The best of a list of spots that fits, or null.
  const first = (k, spots, own) => spots.find(s => fits(k, s.x, s.z, own)) || null;

  // ---- the castle ----
  let curtain = 0;
  const castle = hasCastle(p) && !kept;
  if (castle) {
    // The bailey: what the place has of a castle's yard, in a ring round the keep, the
    // gate side (toward the main road) kept open.
    const yard = BAILEY.flatMap(k => Array(k === 'storehouse' || k === 'well' ? Math.min(1, count(k)) : count(k)).fill(k));
    yard.sort((a, b) => BUILDINGS[b].radius - BUILDINGS[a].radius);
    for (const k of yard) {
      const r = BUILDINGS[k].radius;
      let spot = null;
      for (let ring = KEEP_CLEAR + r + 1; ring < KEEP_CLEAR + r + 14 && !spot; ring += 3) {
        const spots = [];
        for (let i = 0; i < 36; i++) {
          const a = main + Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) / 36 * Math.PI;   // from the back round to the gate
          if (Math.abs(angDiff(a, main)) < 0.55) continue;
          spots.push({ x: Math.sin(a) * ring, z: Math.cos(a) * ring, angle: a + Math.PI });
        }
        spot = first(k, spots);
      }
      if (spot) { put(k, spot.x, spot.z, spot.angle); take(k); }
    }
    // The curtain hugs the keep and the yard, no closer than the keep's own walls allow.
    const yardB = t.buildings.filter(b => BAILEY.includes(b.kind));
    curtain = Math.max(KEEP_CLEAR + 11, ...yardB.map(b => hyp(b.x, b.z) + b.B.radius + 5));
    zones.push({ x: 0, z: 0, r: curtain + 4, castle: true });
  }
  const inner = castle ? curtain + 6 : KEEP_CLEAR;

  // ---- the square ----
  let sq = null;
  const sr = SQUARE[kind] ?? 9;
  if (sr && !kept) {
    // A market square on the main road by the keep (or the castle gate); an abbey's
    // cloister court on the quiet side, away from the roads.
    let a = main;
    if (kind === 'monastery') {
      const sorted = [...roads].sort((x, y) => x - y);
      let best = 0, gapA = main + Math.PI;
      sorted.forEach((x, i) => { const y = sorted[(i + 1) % sorted.length], g = ((y - x) % TAU + TAU) % TAU || TAU; if (g > best) { best = g; gapA = x + g / 2; } });
      a = gapA;
    }
    // (a castle's market place stands a little out from its gate)
    const d = inner + sr + (kind === 'monastery' ? 2 : kind === 'castle' ? 14 : 0);
    sq = { x: Math.sin(a) * d, z: Math.cos(a) * d, r: sr, a, court: kind === 'monastery' };
    zones.push(sq);
  }
  // A mining village has a street of its own out to the nearest ore, and lives along it.
  const extra = [], lode = kind === 'mine' && !kept ? [...t.nodes.ore].sort((a, b) => hyp(a.x, a.z) - hyp(b.x, b.z))[0] : null;
  if (lode) {
    const a = Math.atan2(lode.x, lode.z), d = hyp(lode.x, lode.z) - 16;
    if (d > inner + 12) extra.push({ pts: [{ x: Math.sin(a) * inner, z: Math.cos(a) * inner }, { x: Math.sin(a) * d, z: Math.cos(a) * d }], half: STREET, cost: -4, main: true, ore: true });
  }
  streets = makeStreets(t, roads, sq, inner, rand, extra, kind === 'castle');
  for (const s of streets) if (s.square) s.c = sq;

  // ---- round the square: well, market, chapel, cathedral, a store ----
  if (sq) {
    const dir = { x: Math.sin(sq.a), z: Math.cos(sq.a) }, perp = { x: dir.z, z: -dir.x };
    const at = (u, v) => ({ x: sq.x + dir.x * u + perp.x * v, z: sq.z + dir.z * u + perp.z * v });
    // the well and the market stalls stand in the square, either side of the street through it
    const inSquare = (k, n) => {
      const r = BUILDINGS[k].radius, v = Math.max(sr * 0.5, STREET + r + 1), spots = [];
      for (const u of [0, -0.45, 0.45, -0.8, 0.8]) for (const side of [1, -1]) spots.push(at(u * sr, side * v));
      if (kind === 'monastery') spots.unshift(at(0, 0));
      for (let i = 0; i < n; i++) {
        const s = first(k, spots, sq);
        if (!s) return;
        put(k, s.x, s.z, Math.atan2(sq.x - s.x, sq.z - s.z));
        take(k);
      }
    };
    inSquare('well', Math.min(1, count('well')));
    inSquare('market', Math.min(count('market'), sr >= 14 ? 3 : 1));
    // the chapel on the far side of the square (an abbey's church closes its cloister), a cathedral facing it
    const civic = [['monastery', 1], ['cathedral', -1]];
    for (const [k, side] of civic) {
      if (!count(k)) continue;
      const r = BUILDINGS[k].radius, spots = [];
      for (let i = 0; i < 16; i++) {
        const c = (kind === 'monastery' ? 0 : side * Math.PI / 2) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.25;
        const s = at(Math.cos(c) * (sr + r + 1.5), Math.sin(c) * (sr + r + 1.5));
        spots.push({ ...s, angle: Math.atan2(sq.x - s.x, sq.z - s.z) });
      }
      const s = first(k, spots);
      if (s) { put(k, s.x, s.z, s.angle); take(k); }
    }
  }

  // ---- along the streets: houses, workshops among them, the smelly ones at the edge ----
  // A mining village hugs its ore.
  const ore = kind === 'mine' ? t.nodes.ore : [];
  const pull = s => (ore.length ? -1.2 * Math.max(0, 90 - Math.min(...ore.map(o => hyp(o.x - s.x, o.z - s.z)))) : 0);
  const spotsFor = new Map();
  const front = r => spotsFor.get(r) || spotsFor.set(r, ore.length ? frontage(streets, r).sort((a, b) => a.rank + pull(a) - b.rank - pull(b)) : frontage(streets, r)).get(r);
  // (placing only ever adds obstacles, so a spot that once failed for a street building never fits again)
  let reach = 0;
  const onStreet = (k, edge = false) => {
    const r = BUILDINGS[k].radius, own = s => (s.street.square ? sq : null);
    let list = front(r);
    // at the edge of the town as it stands (worked out once, so they don't lead each other out along a road)
    if (edge) list = list.filter(s => !s.dead).sort((a, b) => Math.abs(hyp(a.x, a.z) - reach) - Math.abs(hyp(b.x, b.z) - reach));
    const s = list.find(s => !s.dead && (fits(k, s.x, s.z, own(s)) || (s.dead = true, false)));
    if (!s) return false;
    s.dead = true;
    put(k, s.x, s.z, s.angle);
    return true;
  };
  // gatherers first in a mining village, so the ore is theirs
  const gather = k => {
    const B = BUILDINGS[k], G = B.gather, spots = [];
    if (G.node === 'rock' || G.node === 'ore') {
      for (const n of t.nodes[G.node]) for (let i = 0; i < 16; i++) for (const d of [B.radius + 7.5, B.radius + 12, B.radius + 18]) {
        const a = i / 16 * TAU, x = n.x + Math.sin(a) * d, z = n.z + Math.cos(a) * d;
        spots.push({ x, z, angle: Math.atan2(n.x - x, n.z - z), rank: hyp(x, z) * 0.5 + d });
      }
    } else {
      for (let r = 30; r < 170; r += 6) for (let i = 0, n = Math.round(r / 3); i < n; i++) {
        const a = i / n * TAU + r * 0.13, x = Math.sin(a) * r, z = Math.cos(a) * r;
        spots.push({ x, z, angle: a + Math.PI, rank: r });
      }
    }
    spots.sort((a, b) => a.rank - b.rank);
    const s = first(k, spots);
    if (!s) return false;
    put(k, s.x, s.z, s.angle);
    return true;
  };
  const gathering = () => { for (const k of ['mine', 'quarry', 'woodcutter', 'hunter']) for (let n = count(k); n > 0; n--) if (gather(k)) take(k); else break; };
  if (kind === 'mine') gathering();

  const shops = Object.keys(want).filter(k => count(k) && !GATHER.has(k) && !FIELDS.has(k) && !SMELLY.has(k) && k !== 'house' && k !== 'mill' && k !== 'watchtower')
    .flatMap(k => Array(count(k)).fill(k));
  const houses = count('house');
  const every = Math.max(1, Math.floor(houses / (shops.length + 1)));
  for (let i = 0, s = 0; i < houses || s < shops.length; i++) {
    if (i < houses && onStreet('house')) take('house');
    if (s < shops.length && (i % every === every - 1 || i >= houses)) { const k = shops[s++]; if (onStreet(k)) take(k); }
  }
  const far = t.buildings.filter(b => !GATHER.has(b.kind) && !FIELDS.has(b.kind)).map(b => hyp(b.x, b.z)).sort((a, b) => a - b);
  reach = (far[Math.floor(far.length * 0.85)] ?? inner + 20) + 6;
  // a mining village smelts at the pithead
  if (kind === 'mine') for (const m of t.buildings.filter(b => b.kind === 'mine')) {
    if (!count('smelter')) break;
    const spots = [];
    for (let d = m.B.radius + BUILDINGS.smelter.radius + 3; d < 30; d += 3) for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, x = m.x + Math.sin(a) * d, z = m.z + Math.cos(a) * d;
      spots.push({ x, z, angle: Math.atan2(m.x - x, m.z - z), rank: d + hyp(x, z) * 0.1 });
    }
    const sp = first('smelter', spots.sort((a, b) => a.rank - b.rank));
    if (sp) { put('smelter', sp.x, sp.z, sp.angle); take('smelter'); }
  }
  for (const k of ['tanner', 'smelter', 'mill', 'watchtower']) for (let n = count(k); n > 0; n--) if (onStreet(k, true)) take(k); else break;

  // ---- walls round the town ----
  const material = walls && walls !== 'none' ? walls : wallMaterial(p);
  if (!kept && (walls ? walls !== 'none' : walledPlace(p))) {
    const W = t.battle.walls;
    if (castle) ring(t, W, roads, bearing => curtainAt(t, bearing, curtain), material, rand, { gatehouse: true });
    // a seat and the royal city: a walled town round the castle (a castle alone keeps its village outside)
    if (kind !== 'castle') {
      const core = t.buildings.filter(b => !GATHER.has(b.kind) && !FIELDS.has(b.kind));
      const least = castle ? curtain + 22 : KEEP_CLEAR + 16;
      ring(t, W, roads, bearing => edgeAt(core, bearing, least, sq), material, rand, {});
    }
    W.centre[1] = { x: 0, z: 0 };
  }

  // ---- gatherers, then fields in a ring outside ----
  if (kind !== 'mine') gathering();
  const W = t.battle.walls;
  const wallR = bearing => {
    let r = 0;
    for (const q of W.pieces) { const a = Math.atan2(q.x, q.z); if (Math.abs(angDiff(a, bearing)) < 0.25) r = Math.max(r, hyp(q.x, q.z)); }
    return r;
  };
  const coreB = t.buildings.filter(b => !GATHER.has(b.kind) && !FIELDS.has(b.kind));
  const fieldSpots = [];
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * TAU + 0.05;
    const edge = Math.max(wallR(a) + 4, edgeAt(coreB, a, KEEP_CLEAR + 8, sq));
    for (let k = 0; k < 6; k++) {
      const r = edge + 12 + k * 20;
      // behind the town, away from the road in; a castle's beside its burgh, out along the road
      fieldSpots.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, angle: a, rank: k * 1000 + Math.abs(angDiff(a, kind === 'castle' ? main : main + Math.PI)) });
    }
  }
  fieldSpots.sort((a, b) => a.rank - b.rank);
  for (const k of ['farm', 'flax']) for (let n = count(k); n > 0; n--) {
    const s = first(k, fieldSpots);
    if (!s) break;
    put(k, s.x, s.z, s.angle);
    take(k);
  }

  // ---- anything still unplaced goes wherever it fits; failing that it is said so ----
  for (const k of Object.keys(want)) {
    for (let n = count(k); n > 0; n--) {
      const B = BUILDINGS[k];
      if (!B) { unplaced.push(k); take(k); continue; }
      const spots = [];
      for (let r = KEEP_CLEAR + B.radius; r < 170; r += 4) for (let i = 0, m = Math.round(r / 2.5); i < m; i++) {
        const a = i / m * TAU; spots.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, angle: a + Math.PI });
      }
      let s = first(k, spots);
      // a gatherer with nothing in reach still stands, at the nearest open ground, and says why in the village
      if (!s && B.gather) s = spots.find(o => clear(o.x, o.z, B.radius) && !t.buildings.some(b => hyp(b.x - o.x, b.z - o.z) < b.B.radius + B.radius + 1.5)
        && !t.battle.walls.pieceAt(o.x, o.z, null, B.radius) && !steep(o.x, o.z, B.radius));
      if (s) put(k, s.x, s.z, s.angle);
      else unplaced.push(k);
      take(k);
    }
  }
  // The lanes as far as anything stands on them (an empty lane is no lane).
  if (!kept) t.lanes = streets.filter(s => (!s.road || s.ore) && !s.square).map(s => lanePart(s, t.buildings)).filter(Boolean);
  // ... and an abbey's cloister walk round its court
  const court = streets.find(s => s.court);
  if (court && !kept) t.lanes.push({ pts: court.pts.map(q => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]), width: 3 });
  const mem = remember(t, 1, 0);
  // the keep is the place's own, not the planning copy's
  Object.assign(mem, { keepLevel: p.mem?.keepLevel, keepPeak: p.mem?.keepPeak, keepBought: p.mem?.keepBought, keepShown: keepLevelFor(p) });
  return { ...mem, lanes: t.lanes || [], unplaced, deposits: worked(t) };
}

// The stone and ore its quarries and mines work (the map shows them: a pithead is its rock).
export function worked(t) {
  const pits = t.buildings.filter(b => b.kind === 'mine' || b.kind === 'quarry');
  return [...t.nodes.rock, ...t.nodes.ore].filter(n => pits.some(b => hyp(b.x - n.x, b.z - n.z) < 30))
    .map(n => ({ kind: n.kind, x: Math.round(n.x), z: Math.round(n.z) }));
}

// The part of lane s that has buildings along it, out to the last of them, as the land mask takes it.
function lanePart(s, buildings) {
  let len = 0, from = Infinity, n = 0, total = 0;
  const segs = [];
  for (let i = 0; i < s.pts.length - 1; i++) { const a = s.pts[i], b = s.pts[i + 1]; segs.push({ a, b, l: hyp(b.x - a.x, b.z - a.z), at: total }); total += segs[segs.length - 1].l; }
  for (const b of buildings) {
    for (const g of segs) {
      const dx = g.b.x - g.a.x, dz = g.b.z - g.a.z, k = Math.max(0, Math.min(1, ((b.x - g.a.x) * dx + (b.z - g.a.z) * dz) / (g.l * g.l || 1)));
      if (hyp(b.x - g.a.x - dx * k, b.z - g.a.z - dz * k) >= s.half + b.B.radius + 2.5) continue;
      len = Math.max(len, g.at + g.l * k + b.B.radius + 2);
      from = Math.min(from, g.at + g.l * k - b.B.radius - 2);
      n++;
    }
  }
  // a lane off a street starts at the street; a ring lane only runs between its houses
  if (!s.ring) from = 0;
  else if (n < 3) return null;
  if (len - from < 6) return null;
  const pts = [];
  for (const g of segs) {
    if (g.at >= len) break;
    if (g.at + g.l <= from) continue;
    pts.push(g.at < from ? { x: g.a.x + (g.b.x - g.a.x) * (from - g.at) / g.l, z: g.a.z + (g.b.z - g.a.z) * (from - g.at) / g.l } : g.a);
    if (g.at + g.l > len) { const k = (len - g.at) / g.l; pts.push({ x: g.a.x + (g.b.x - g.a.x) * k, z: g.a.z + (g.b.z - g.a.z) * k }); }
    else if (g === segs[segs.length - 1]) pts.push(g.b);
  }
  return { pts: pts.map(q => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]), width: s.half * 2 };
}

// How far out the built-up town reaches on a bearing, its buildings' far sides plus a margin.
function edgeAt(core, bearing, least, sq) {
  let r = least;
  for (const b of core) {
    const d = hyp(b.x, b.z), a = Math.atan2(b.x, b.z), w = Math.atan2(b.B.radius + 6, Math.max(1, d));
    if (Math.abs(angDiff(a, bearing)) < w + 0.12) r = Math.max(r, d + b.B.radius + 7);
  }
  if (sq) {
    const d = hyp(sq.x, sq.z), a = Math.atan2(sq.x, sq.z), w = Math.atan2(sq.r + 4, Math.max(1, d));
    if (Math.abs(angDiff(a, bearing)) < w) r = Math.max(r, d + sq.r + 8);
  }
  return r;
}
function curtainAt(t, bearing, least) {
  let r = least;
  for (const b of t.buildings) {
    if (!BAILEY.includes(b.kind)) continue;
    const d = hyp(b.x, b.z), a = Math.atan2(b.x, b.z), w = Math.atan2(b.B.radius + 3, Math.max(1, d));
    if (Math.abs(angDiff(a, bearing)) < w + 0.1) r = Math.max(r, d + b.B.radius + 4);
  }
  return r;
}

// A ring of wall round the keep: out to `reach(bearing)` and a little beyond onto higher
// ground, smoothed, straightened into runs, with a gate (between towers) where each road
// crosses and towers at the corners and along long stretches.
function ring(t, W, roads, reach, material, rand, { gatehouse = false } = {}) {
  const N = 48, M = MATERIALS[material], h = t.heightAt;
  let r = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, base = reach(a);
    // follow the ground: a few metres out onto a rise if there is one
    let best = base, bv = -Infinity;
    for (let d = 0; d <= 8; d += 2) { const v = h(Math.sin(a) * (base + d), Math.cos(a) * (base + d)) - 0.35 * d; if (v > bv) { bv = v; best = base + d; } }
    r.push(best);
  }
  // fill the hollows so the line runs on rather than zigzagging in and out
  for (let pass = 0; pass < 3; pass++) r = r.map((v, i) => Math.max(v, (r[(i + N - 1) % N] + r[(i + 1) % N]) / 2 - 1.5));
  const at = (a) => { const f = ((a / TAU) % 1 + 1) % 1 * N, i = Math.floor(f) % N, k = f - Math.floor(f); return r[i] * (1 - k) + r[(i + 1) % N] * k; };
  // straighten into runs: drop points that hardly bend the line
  let pts = r.map((v, i) => ({ a: i / N * TAU, r: v }));
  const xy = q => ({ x: Math.sin(q.a) * q.r, z: Math.cos(q.a) * q.r });
  for (let pass = 0; pass < 4; pass++) {
    const keep = [];
    for (let i = 0; i < pts.length; i++) {
      const A = xy(pts[(i + pts.length - 1) % pts.length]), B = xy(pts[i]), C = xy(pts[(i + 1) % pts.length]);
      const off = nearLine(B.x, B.z, [A, C]);
      if (i % 2 === 0 || off > 1.6 || hyp(C.x - A.x, C.z - A.z) > 34) keep.push(pts[i]); else continue;
    }
    pts = keep;
  }
  // gates: a short straight piece across each road, between two posts (towers on stone)
  const gateLen = material === 'stone' ? 11 : 9;
  const gates = roads.map(a => ({ a, r: at(a) }));
  for (const g of gates) {
    const d = gateLen / 2 / g.r, room = d + 6 / g.r;
    pts = pts.filter(q => Math.abs(angDiff(q.a, g.a)) > room);
    pts.push({ a: g.a - d, r: g.r, gate: g }, { a: g.a + d, r: g.r, gate: g });
  }
  pts.sort((x, y) => ((x.a % TAU) + TAU) % TAU - ((y.a % TAU) + TAU) % TAU);
  const older = new Set(W.nodes);
  const nodes = pts.map(q => { const p = xy(q); return { ...p, q, n: W.node(p.x, p.z, 1, { snap: false }) }; });
  const corners = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const A = nodes[i], B = nodes[(i + 1) % nodes.length];
    if (A.q.gate && B.q.gate === A.q.gate) {
      W.makeGate(W.addPiece(A.n, B.n, 1, material, true), { ready: true });
      if (material === 'stone' || gatehouse) { corners.add(A); corners.add(B); }
      continue;
    }
    // a long run in pieces of at most ten metres
    const len = hyp(B.x - A.x, B.z - A.z), n = Math.max(1, Math.ceil(len / 10));
    let prev = A.n;
    for (let k = 1; k <= n; k++) {
      const next = k === n ? B.n : W.node(A.x + (B.x - A.x) * k / n, A.z + (B.z - A.z) * k / n, 1, { snap: false });
      W.addPiece(prev, next, 1, material, true);
      prev = next;
    }
  }
  // towers flanking the gates, at the sharpest corners, and along long runs; never
  // crowded (a small curtain gets a handful, not one at every bend)
  const gap = material === 'stone' ? 20 : 26, towers = [];
  const tower = (x, z) => {
    if (towers.some(o => hyp(o.x - x, o.z - z) < gap)) return false;
    if (!W.placeTower(x, z, 1, material, { ready: true }).ok) return false;
    towers.push({ x, z });
    return true;
  };
  for (const c of corners) if (W.placeTower(c.x, c.z, 1, material, { ready: true }).ok) towers.push(c);
  const bends = [];
  for (let i = 0; i < nodes.length; i++) {
    const A = nodes[(i + nodes.length - 1) % nodes.length], B = nodes[i], C = nodes[(i + 1) % nodes.length];
    const turn = Math.abs(angDiff(Math.atan2(C.x - B.x, C.z - B.z), Math.atan2(B.x - A.x, B.z - A.z)));
    if (turn > 0.35 && !B.q.gate) bends.push({ B, turn });
  }
  bends.sort((x, y) => y.turn - x.turn);
  for (const { B } of bends) tower(B.x, B.z);
  const ringNodes = W.nodes.filter(n => !older.has(n) && n.pieces.length && !n.pieces.some(q => q.gate));
  const order = [...ringNodes].sort((x, y) => Math.atan2(x.x, x.z) - Math.atan2(y.x, y.z));
  for (const n of order) if (!towers.some(o => hyp(o.x - n.x, o.z - n.z) < gap * 1.6)) tower(n.x, n.z);
  W.changed();
}

// ---- the shared layout ----

const cache = new WeakMap();
const signature = p => JSON.stringify([p.kind, p.seat !== undefined, tallyOf(p), p.eco?.walls ?? null, p.eco?.level ?? null, p.mem?.at ?? null, p.mem?.buildings.length ?? null]);

// Place p's layout: remembered, or planned from its numbers. Cached until its numbers change.
export function layoutOf(p) {
  const sig = signature(p), c = cache.get(p);
  if (c && c.sig === sig) return c.plan;
  const t0 = performance.now();
  let L;
  try { L = plan(p); } catch (e) {
    // (said once, as an error, and drawn bare until its numbers change, rather than stopping every frame)
    console.error(`places.js: ${p.name} could not be laid out`, e);
    L = { buildings: [], nodes: [], pieces: [], lanes: [], deposits: [], unplaced: [], keepShown: keepLevelFor(p) };
  }
  L.ms = performance.now() - t0;
  cache.set(p, { sig, plan: L });
  if (L.unplaced.length) console.warn(`places.js: ${p.name} has no room for ${L.unplaced.join(', ')}`);
  return L;
}

// Lays place p out in `town` for `side` (1 for a place you are storming, 0 for one you hold
// or look round). Its walls stand as they were left; broken stretches are mended once its
// holders have had the time (`mended`). Returns how far out its walls run (0 for none).
export function layPlace(town, p, side, { mended = true } = {}) {
  const L = layoutOf(p);
  rebuild(town, L, side, mended, p.name);
  town.lanes = L.lanes;
  // its yards and lanes are clear of trees (a building fells only those it stands on)
  const yards = town.buildings.filter(b => !GATHER.has(b.kind) && !FIELDS.has(b.kind));
  const lanes = L.lanes.map(l => ({ pts: l.pts.map(([x, z]) => ({ x, z })), w: l.width / 2 + 1.5 }));
  for (const t of town.nodes.tree) {
    if (t.standing && (yards.some(b => hyp(b.x - t.x, b.z - t.z) < b.B.radius + 5) || lanes.some(l => nearLine(t.x, t.z, l.pts) < l.w))) town.trees.fell(t);
  }
  // its keep is the one the place shows on the map: a castle's stays a castle's whoever holds it
  if (!town.keepLevel && L.keepShown) {
    town.keepPeak = Math.max(town.keepPeak || 1, L.keepShown);
    town.keepBought = Math.max(town.keepBought || 0, L.keepShown - 3);
  }
  if (L.unplaced.length) town.event(`No room was found in ${p.name} for: ${L.unplaced.join(', ')}.`, side);
  const mine = town.battle.walls.pieces.filter(q => q.side === side);
  return mine.length ? Math.max(...mine.map(q => hyp(q.x, q.z))) : 0;
}

// ---- places remembered under the old rule ----

// A place remembered before this generator (saves from before 21 Nov 2026) is laid out
// afresh, once, when the save loads. It keeps its owner, its numbers (people, stock and
// tally: these aren't touched), its buildings' levels, its keep, and its damage: a stretch
// of wall broken then is broken in the new wall on that side. Walls a player built (anything
// but the old six- or eight-sided fort a storm put up) stand as they were, with the
// streets inside them. What can't be carried over is said, in the console and the log.
export function relayOld(w) {
  const said = [];
  for (const p of w.pois) {
    const old = p.mem;
    if (!old) continue;
    // (kept under this rule already, before it was marked; or a village in hand)
    const lost = old.v >= LAYOUT || old.lanes || p.town ? [] : relayOne(p, old);
    p.mem.v = LAYOUT;
    // its numbers' walls are the walls that stand
    const m = p.mem.pieces.find(q => !q.broken) || p.mem.pieces[0];
    if (p.eco?.walls) p.eco.walls = m ? m.material : 'none';
    cache.delete(p);
    for (const what of lost) {
      const text = `${p.name}, laid out anew: ${what}.`;
      console.warn(`places.js: ${text}`);
      w.log(text);
      said.push(text);
    }
  }
  return said;
}

function relayOne(p, old) {
  const lost = [], c = old.centre || { x: 0, z: 0 };
  const bearing = q => Math.atan2(q.x - c.x, q.z - c.z);
  // the old storm's fort: a hexagon at 24 m (an octagon at 30 m round Kingsbridge), its
  // corners on the circle and the runs between them inside it
  const fort = old.pieces.length > 0 && [24, 30].some(R => old.nodes.every(n => {
    const d = hyp(n.x - c.x, n.z - c.z);
    return d > R * 0.86 - 1 && d < R + 1;
  }));
  if (old.pieces.length && !fort) {
    old.lanes = [];
    console.info(`places.js: ${p.name} keeps its hand-built walls and the streets inside them`);
    return lost;
  }
  // its tally: its numbers, or what stood if it has none
  let tally = null;
  if (!p.eco?.buildings) {
    tally = {};
    for (const b of old.buildings) if (BUILDINGS[b.kind]) tally[b.kind] = (tally[b.kind] || 0) + 1;
      else lost.push(`no ${b.kind} is built any more`);
  }
  const was = old.pieces.find(q => !q.broken) || old.pieces[0];
  const walls = was ? was.material : null;
  const L = plan(p, { fresh: true, tally, walls });
  for (const k of L.unplaced) lost.push(`no room for its ${k}`);
  // levels go to the buildings of each kind nearest the keep, the best first
  const levels = {};
  for (const b of old.buildings) (levels[b.kind] ||= []).push(b.level || 1);
  for (const [k, ls] of Object.entries(levels)) {
    ls.sort((a, b) => b - a);
    const now = L.buildings.filter(b => b.kind === k).sort((a, b) => hyp(a.x, a.z) - hyp(b.x, b.z));
    now.forEach((b, i) => { if (ls[i] > 1) b.level = ls[i]; });
    const unmatched = ls.slice(now.length).filter(l => l > 1).length;
    if (unmatched) lost.push(`${unmatched} raised ${k}${unmatched > 1 ? 's' : ''} no longer stand${unmatched > 1 ? '' : 's'}`);
  }
  // damage: the new wall is broken where the old one was, by bearing from the keep
  const spans = old.pieces.filter(q => q.broken).map(q => {
    const a = bearing(old.nodes[q.a]), b = bearing(old.nodes[q.b]), mid = a + angDiff(b, a) / 2;
    return { mid, half: Math.abs(angDiff(b, a)) / 2 + 0.05, hit: false };
  });
  for (const q of L.pieces) {
    const a = L.nodes[q.a], b = L.nodes[q.b], m = Math.atan2((a.x + b.x) / 2, (a.z + b.z) / 2);
    const s = spans.find(o => Math.abs(angDiff(m, o.mid)) < o.half);
    if (s) { q.broken = true; s.hit = true; }
  }
  const missed = spans.filter(s => !s.hit).length;
  if (missed) lost.push(`${missed} broken stretch${missed > 1 ? 'es' : ''} of wall had no new wall to fall on`);
  const towers = L.nodes.filter(n => n.tower);
  for (const o of old.nodes.filter(n => n.tower?.broken)) {
    const ob = bearing(o), t = towers.filter(n => !n.tower.broken).sort((x, y) => Math.abs(angDiff(Math.atan2(x.x, x.z), ob)) - Math.abs(angDiff(Math.atan2(y.x, y.z), ob)))[0];
    if (t && Math.abs(angDiff(Math.atan2(t.x, t.z), ob)) < 0.5) t.tower.broken = true;
    else lost.push('a broken tower had no new tower to stand for it');
  }
  const { unplaced, ms, ...mem } = L;
  p.mem = { ...mem, at: old.at, v: LAYOUT };
  return lost;
}

// ---- checking ----

// Invariants for every place: run checkPlaces(game.world) in the console. Returns the problems.
export function checkPlaces(w) {
  const out = [];
  for (const p of w.pois) {
    if (p.town && p.owner === 0 && !p.town.hostile) continue;   // your own villages are what you built
    if (!p.eco?.buildings && !p.mem) continue;
    const L = layoutOf(p), have = {};
    for (const b of L.buildings) have[b.kind] = (have[b.kind] || 0) + 1;
    const want = tallyOf(p);
    for (const [k, n] of Object.entries(want)) if ((have[k] || 0) < n) out.push(`${p.name}: ${k} ${have[k] || 0} of ${n} laid out`);
    if (L.unplaced.length) out.push(`${p.name}: no room for ${L.unplaced.join(', ')}`);
    if (walledPlace(p) !== L.pieces.length > 0) out.push(`${p.name}: walled by its numbers ${walledPlace(p)}, ${L.pieces.length} wall pieces laid out`);
    // what is remembered standing and what its numbers say agree (the map and the realm go by both)
    if (p.mem && p.eco?.walls && (p.eco.walls !== 'none') !== p.mem.pieces.length > 0)
      out.push(`${p.name}: its numbers say ${p.eco.walls} walls, ${p.mem.pieces.length} wall pieces remembered`);
    if (p.mem && p.mem.v !== LAYOUT) out.push(`${p.name}: remembered under an old layout rule`);
    const mat = wallMaterial(p);
    if (L.pieces.length && L.pieces.some(q => q.material !== mat)) out.push(`${p.name}: walls should be ${mat}`);
    // a town in hand (stormed or looked round) shows exactly its layout
    if (p.town && (p.town.hostile || p.town.readOnly)) {
      const there = {};
      for (const b of p.town.buildings) there[b.kind] = (there[b.kind] || 0) + 1;
      for (const [k, n] of Object.entries(have)) if ((there[k] || 0) !== n) out.push(`${p.name}: ${k} ${n} in its layout, ${there[k] || 0} in the town`);
    }
    // nothing overlaps
    for (let i = 0; i < L.buildings.length; i++) for (let j = i + 1; j < L.buildings.length; j++) {
      const a = L.buildings[i], b = L.buildings[j], d = hyp(a.x - b.x, a.z - b.z);
      if (d < BUILDINGS[a.kind].radius + BUILDINGS[b.kind].radius) out.push(`${p.name}: ${a.kind} and ${b.kind} overlap`);
    }
  }
  return out;
}
