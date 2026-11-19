// Events with choices, after Crusader Kings and Stronghold's village life: now and then
// something happens in one of your villages and you choose what to do about it. Each has
// a picture (assets/art/events/<id>.png, from Art; the box shows none while it is missing).
//
// One every seven to twelve minutes, at a village of yours that you run; never the same
// one twice running. Choices that cost gold say so and can't be picked without it.
import { FACTIONS, headcount } from './world.js';

const FIRST = 420, EVERY = [420, 720];
const KNIGHTS = ['Sir Aymer de Lisle', 'Sir Bertram Wode', 'Dame Isolde Fenn', 'Sir Hugo Marlowe', 'Sir Gawain of Tarn', 'Dame Petra Hale'];
const CHIEFS = ['One-Eyed Wat', 'Red Agnes', 'Long Tom Sorrel', 'Will Scathelock', 'Black Maud'];

// A spell of better or worse feeling in a village, gone after `secs`.
function spell(t, n, text, secs) {
  const until = t.time + secs;
  (t.moodHooks ||= []).push(() => (t.time < until ? [n, text] : [0, text]));
}
// People lost: the dead are mourned.
function lose(t, n) {
  for (let i = 0; i < n; i++) {
    const v = t.villagers.find(o => o.state === 'idle') || t.villagers.find(o => o.state !== 'soldier' && o.state !== 'shelter');
    if (!v || t.population <= 6) break;
    t.release(v);
    t.villagers = t.villagers.filter(o => o !== v);
    t.grief += 4;
  }
}
const gold = () => FACTIONS[0].gold;
const pay = n => { FACTIONS[0].gold -= n; };
const food = t => t.free('food') + t.free('bread');

const EVENTS = {
  harvest: {
    when: (w, p) => p.town.buildings.some(b => b.kind === 'farm' && b.state === 'active'),
    title: p => `Blight in the fields of ${p.name}`,
    text: (w, p) => `The grain at ${p.name} has blackened on the stalk. There will be little bread this season unless you do something about it.`,
    choices: (w, p) => {
      const t = p.town, share = Math.ceil(food(t) * 0.4);
      return [
        { label: `Open the granaries (${share} food)`, ok: share > 0, run: () => { t.spend({ food: Math.min(share, t.free('food')) }); spell(t, 4, 'fed through the blight', 300); return `${p.name} eats from your granaries.`; } },
        { label: 'Buy grain from the south (80 gold)', ok: gold() >= 80, run: () => { pay(80); return `Grain carts come up the road to ${p.name}.`; } },
        { label: 'Let them tighten their belts', run: () => { spell(t, -10, 'the blight', 360); return `${p.name} goes hungry for a season.`; } },
      ];
    },
  },
  fever: {
    when: (w, p) => p.town.population >= 15,
    title: p => `A fever in ${p.name}`,
    text: (w, p) => `Three families in ${p.name} are down with a sweating fever, and it is spreading from house to house.`,
    choices: (w, p) => {
      const t = p.town, many = Math.max(2, Math.round(t.population * 0.15));
      return [
        { label: 'Send for a physician (70 gold)', ok: gold() >= 70, run: () => { pay(70); return 'The physician bleeds and doses them, and the fever breaks.'; } },
        { label: 'Shut the sick houses', run: () => { lose(t, 1); spell(t, -8, 'the sick shut away', 300); return 'The fever burns out behind closed doors. One dies.'; } },
        { label: 'Let it run its course', run: () => { lose(t, many); return `The fever runs through ${p.name}. ${many} are buried.`; } },
      ];
    },
  },
  knight: {
    when: (w, p) => w.rank !== 'Reeve' && p === (FACTIONS[0].seat || w.home),
    title: () => 'A wandering knight',
    text: (w, p, e) => `${e.name} rides into ${p.name} with a squire and four lances, looking for a lord worth serving.`,
    choices: (w, p, e) => [
      { label: `Take them into your service (120 gold)`, ok: gold() >= 120, run: () => {
        pay(120);
        w.spawnArmy(0, [{ key: 'knight', count: 5, name: `${e.name.split(' ').slice(-1)[0]}'s lances`, xp: 2, elite: true }], p, `${e.name}'s lances`);
        return `${e.name} kneels and swears to you. Five lances wait at ${p.name}.`;
      } },
      { label: 'Feast them and send them on (40 gold)', ok: gold() >= 40, run: () => {
        pay(40);
        for (const H of FACTIONS) if (H.index && w.dip?.[H.index] && !H.bandit) w.dip[H.index].opinion += 3;
        return `${e.name} rides on singing of your table. The great houses hear of it.`;
      } },
      { label: 'Send them on their way', run: () => `${e.name} rides on.` },
    ],
  },
  refugees: {
    when: w => w.part === 2 || [...w.wars].length > 0,
    title: p => `Refugees at the gates of ${p.name}`,
    text: (w, p, e) => `${e.n} families, driven from their homes by ${w.part === 2 ? 'the northmen' : 'the fighting'}, are camped at ${p.name}'s gate with what they could carry.`,
    choices: (w, p, e) => {
      const t = p.town;
      return [
        { label: `Take them in (${e.n} people)`, run: () => {
          for (let i = 0; i < e.n; i++) t.addVillager((t.rand() - 0.5) * 12, (t.rand() - 0.5) * 12);
          spell(t, -6, 'strangers in the village', 480);
          return `${e.n} families settle at ${p.name}. Not everyone is glad of them.`;
        } },
        { label: 'Turn them away', run: () => { spell(t, -3, 'turned the hungry away', 240); return 'The refugees trudge on down the road.'; } },
      ];
    },
  },
  fair: {
    when: (w, p) => p.town.population >= 20 && !p.town.hungry,
    title: p => `Midsummer fair at ${p.name}`,
    text: (w, p) => `The people of ${p.name} want a fair: tumblers, ale, a bull to bait and a pole to dance round. Someone has to pay for it.`,
    choices: (w, p) => {
      const t = p.town;
      return [
        { label: 'Pay for the fair (60 gold)', ok: gold() >= 60, run: () => { pay(60); spell(t, 14, 'the fair', 420); t.grief = Math.max(0, t.grief - 10); return `${p.name} dances till dawn.`; } },
        { label: 'Let them make their own fun', run: () => `${p.name} makes do.` },
      ];
    },
  },
  bandits: {
    when: (w, p) => !!camp(w, p),
    title: () => 'A bandit chief sends word',
    text: (w, p, e) => `${e.name}, who leads the outlaws at ${camp(w, p).name}, offers terms: pay, and his men leave your villages alone. Or pay more, and they fight for you.`,
    choices: (w, p, e) => {
      const c = camp(w, p), men = headcount(c.garrison);
      return [
        { label: 'Pay him off (100 gold)', ok: gold() >= 100, run: () => { pay(100); w.banditPeace = w.time + 1200; return `${e.name}'s men will leave your lands alone for twenty minutes.`; } },
        { label: `Hire his band (${men * 3} gold)`, ok: gold() >= men * 3 && men >= 6, run: () => {
          pay(men * 3);
          w.spawnArmy(0, c.garrison.map(u => ({ ...u, name: `${e.name}'s ${u.name.split(' ').slice(-1)[0]}` })), p, `${e.name}'s band`);
          c.garrison = [];
          return `${e.name}'s band marches into ${p.name} to take your coin.`;
        } },
        { label: 'Refuse', run: () => `${e.name} spits and goes back to the woods.` },
      ];
    },
  },
};

// Tournaments at Kingsbridge: a champion of yours rides for gold, renown and knights.
// The best captain you have (or you yourself) jousts; a good one wins more often.
EVENTS.tournament = {
  when: (w, p) => w.rank !== 'Reeve' && p === (FACTIONS[0].seat || w.home) && !!w.crown && w.time > 1800,
  title: () => 'A tournament at Kingsbridge',
  text: (w, p, e) => `Heralds cry a tournament at Kingsbridge: a purse of 200 gold, and the eyes of every great house on the lists. ${e.champ ? `Captain ${e.champ.name} asks to ride for you.` : 'You have no captain fit to ride.'}`,
  choices: (w, p, e) => {
    const joust = (who, odds, hurt) => {
      pay(50);
      if (w.rand() < odds) {
        FACTIONS[0].gold += 200;
        for (const H of FACTIONS) if (H.index && w.dip?.[H.index] && !H.bandit) w.dip[H.index].opinion += 6;
        w.spawnArmy(0, [{ key: 'knight', count: 4, name: 'Tourney knights', xp: 1, elite: true, armour: 'plate', shield: true }], p, 'Tourney knights');
        w.chron(`${who} won the tournament at Kingsbridge.`);
        return `${who} wins the tournament! 200 gold, the realm's applause, and four knights who saw it ride home to serve you.`;
      }
      hurt();
      return `${who} is unhorsed in the third course. The purse goes elsewhere.`;
    };
    return [
      { label: e.champ ? `Send Captain ${e.champ.name} (50 gold)` : 'No captain to send', ok: !!e.champ && gold() >= 50,
        run: () => joust(`Captain ${e.champ.name}`, 0.25 + e.champ.level * 0.1, () => {}) },
      { label: 'Ride yourself (50 gold)', ok: gold() >= 50 && !(w.lordHurt > w.time) && (w.lordCaptive ?? null) === null,
        run: () => joust('You', 0.45, () => { w.lordHurt = w.time + 300; }) },
      { label: 'Stay away', run: () => 'The tournament goes on without you.' },
    ];
  },
};
// Wyndham's schemes: the schemer's gold reaches one of your captains in the field.
// Ignore it, and he may march his army over to her.
EVENTS.scheme = {
  when: (w, p) => p === (FACTIONS[0].seat || w.home) && !!schemer(w) && !!turncoat(w),
  title: () => 'A whisper of treason',
  text: (w, p, e) => `Captain ${e.cap.name}, who leads ${e.army.name}, has been seen drinking with ${e.house.name}'s agents, and spending more than a captain earns.`,
  choices: (w, p, e) => [
    { label: 'Double his pay (100 gold)', ok: gold() >= 100, run: () => { pay(100); return `Captain ${e.cap.name} swears never to have taken a penny. Yours, for now.`; } },
    { label: 'Take away the command', run: () => { e.army.captain = null; e.cap.army = null; e.cap.alive = false; return `Captain ${e.cap.name} is stripped of his command and sent away. ${e.army.name} marches without a captain.`; } },
    { label: 'Ignore it', run: () => {
      if (w.rand() < 0.5 || e.army.gone) return 'Nothing comes of it.';
      e.army.side = e.house.index;
      e.army.lord = null;
      e.army.path = [];
      e.army.name = `${e.house.short} turncoats`;
      e.cap.side = e.house.index;
      w.chron(`Captain ${e.cap.name} took ${e.house.name}'s gold and marched ${e.army.name} over to them.`);
      w.log(`Captain ${e.cap.name} has gone over to ${e.house.name}, army and all!`, 1);
      return `Captain ${e.cap.name} has gone over to ${e.house.name}, and the whole army too.`;
    } },
  ],
};
const schemer = w => FACTIONS.find(H => H.trait === 'schemer' && H.alive && w.atWar(0, H.index));
const turncoat = w => w.armies.filter(a => a.side === 0 && !a.gone && !a.wagon && a.captain && a.lord !== 0)
  .map(a => ({ a, c: (w.captains || []).find(c => c.id === a.captain && c.alive) })).find(x => x.c);

// The bandit camp nearest a place, if it is close and still holds men.
function camp(w, p) {
  return w.pois.filter(c => c.kind === 'camp' && c.owner === w.bandits && headcount(c.garrison || []) > 0 && Math.hypot(c.x - p.x, c.z - p.z) < 500)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] || null;
}

export function tickEvents(w, dt) {
  w.eventClock = (w.eventClock ?? FIRST) - dt;
  if (w.eventClock > 0) return;
  w.eventClock = EVERY[0] + w.rand() * (EVERY[1] - EVERY[0]);
  const places = w.pois.filter(p => p.owner === 0 && p.town && !p.town.underAttack && !p.town.hostile && !p.town.revolt);
  const options = [];
  for (const [id, E] of Object.entries(EVENTS)) {
    if (id === w.lastEvent) continue;
    for (const p of places) if (E.when(w, p)) options.push([id, p]);
  }
  if (!options.length) return;
  const [id, p] = options[Math.floor(w.rand() * options.length)];
  fire(w, id, p);
}

export function fire(w, id, p) {
  const E = EVENTS[id];
  const r = () => w.rand();
  const extra = { name: id === 'knight' ? KNIGHTS[Math.floor(r() * KNIGHTS.length)] : CHIEFS[Math.floor(r() * CHIEFS.length)], n: Math.round((w.part === 2 ? 10 : 5) + r() * 6) };
  if (id === 'tournament') extra.champ = (w.captains || []).filter(c => c.alive && c.side === 0 && c.captive === undefined).sort((a, b) => b.level - a.level)[0] || null;
  if (id === 'scheme') { const t = turncoat(w); Object.assign(extra, { cap: t.c, army: t.a, house: schemer(w) }); }
  w.lastEvent = id;
  const choices = E.choices(w, p, extra);
  const ev = { id, image: `assets/art/events/${id}.png`, title: E.title(p), text: E.text(w, p, extra), at: p,
    choices: choices.map(c => ({ label: c.label, ok: c.ok ?? true, run: () => { if (!(c.ok ?? true)) return null; const out = c.run(); w.log(out); return out; } })) };
  if (w.hooks.choice) w.hooks.choice(ev);
  else ev.choices.at(-1).run();   // nobody to ask: the plain choice
  return ev;
}
