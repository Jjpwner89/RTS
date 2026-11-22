// Events with choices, after Crusader Kings and Stronghold's village life: now and then
// something happens in one of your villages and you choose what to do about it. Each has
// a picture (assets/art/events/<id>.png, from Art), once it is painted and named in PAINTED;
// until then the box shows none, rather than asking for a file that isn't there.
//
// One every seven to twelve minutes, at a village of yours that you run (or, for the kinds
// of place in the second half of the list, any place of that kind you hold); never the same
// one twice running. Choices that cost gold say so and can't be picked without it.
import { FACTIONS, headcount } from './world.js';

// Events whose picture is in assets/art/events/. Add the id when its painting lands.
export const PAINTED = new Set([]);
const picture = id => (PAINTED.has(id) ? `assets/art/events/${id}.png` : null);

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
// Why a choice is greyed: its own reason, or the gold its label asks for.
// A choice as the box shows it: ok and why are read afresh each time (the purse may have changed
// since the event came), and a click that is no longer allowed is refused with the reason.
export const live = (w, c) => ({
  label: c.label,
  get ok() { return can(c); },
  get why() { return whyNot(c); },
  run: () => {
    if (!can(c)) { const why = whyNot(c); console.warn(`[events] refused "${c.label}": ${why}`); return { ok: false, text: `${why}.` }; }
    const out = c.run(); w.log(out); return out;
  },
});
const can = c => (typeof c.ok === 'function' ? !!c.ok() : c.ok ?? true);
const whyNot = c => {
  if (can(c)) return '';
  const why = typeof c.why === 'function' ? c.why() : c.why;
  if (why) return why;
  const cost = +(c.label.match(/\((\d+) gold/)?.[1] || 0);
  return cost > gold() ? `You have ${Math.floor(gold())} of the ${cost} gold` : 'Not possible now';
};
const food = t => t.free('food') + t.free('bread');

// What taking newcomers in would do, for the card: room, minutes of food now and after, and how many
// the larder can feed and still keep three minutes of meals in hand (playtest round 3, 2026-11-21).
const minsText = m => m < 1 ? 'under a minute' : `${Math.round(m * 10) / 10} min`;
function advice(t, n) {
  const pop = t.population, room = Math.max(0, t.housing - pop), meals = Math.max(0, Math.floor(food(t)));
  return { pop, room, meals, mins: pop ? meals / pop : 0, after: meals / (pop + n), safe: Math.max(0, Math.min(n, room, Math.floor(meals / 3) - pop)) };
}
const factsOf = (p, A) => `${p.name} has ${minsText(A.mins)} of food for ${A.pop} people and room for ${A.room} more.`;

const EVENTS = {
  harvest: {
    when: (w, p) => p.town.buildings.some(b => b.kind === 'farm' && b.state === 'active'),
    title: p => `Blight in the fields of ${p.name}`,
    text: (w, p) => `The grain at ${p.name} has blackened on the stalk. There will be little bread this season unless you do something about it.`,
    choices: (w, p) => {
      const t = p.town, share = Math.ceil(food(t) * 0.4);
      return [
        { label: `Open the granaries (${share} food)`, ok: () => food(t) > 0, why: 'Your granaries are empty', run: () => { t.spend({ food: Math.min(share, t.free('food')) }); spell(t, 4, 'fed through the blight', 300); return `${p.name} eats from your granaries.`; } },
        { label: 'Buy grain from the south (80 gold)', ok: () => gold() >= 80, run: () => { pay(80); return `Grain carts come up the road to ${p.name}.`; } },
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
        { label: 'Send for a physician (70 gold)', ok: () => gold() >= 70, run: () => { pay(70); return 'The physician bleeds and doses them, and the fever breaks.'; } },
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
      { label: `Take them into your service (120 gold)`, ok: () => gold() >= 120, run: () => {
        pay(120);
        w.spawnArmy(0, [{ key: 'knight', count: 5, name: `${e.name.split(' ').slice(-1)[0]}'s lances`, xp: 2, elite: true }], p, `${e.name}'s lances`);
        return `${e.name} kneels and swears to you. Five lances wait at ${p.name}.`;
      } },
      { label: 'Feast them and send them on (40 gold)', ok: () => gold() >= 40, run: () => {
        pay(40);
        for (const H of FACTIONS) if (H.index && w.dip?.[H.index] && !H.bandit) w.dip[H.index].opinion += 3;
        return `${e.name} rides on singing of your table. The great houses hear of it.`;
      } },
      { label: 'Send them on their way', run: () => `${e.name} rides on.` },
    ],
  },
  refugees: {
    // shares its cooldown with the homeless families of the settlers group
    when: w => (w.part === 2 || [...w.wars].length > 0) && w.time - (w.settlerSeen?.refugees?.at ?? -1e9) >= SETTLE_COOLDOWN,
    title: p => `Refugees at the gates of ${p.name}`,
    text: (w, p, e) => `${e.n} families, driven from their homes by ${w.part === 2 ? 'the northmen' : 'the fighting'}, are camped at ${p.name}'s gate with what they could carry. ${factsOf(p, advice(p.town, e.n))}`,
    choices: (w, p, e) => {
      const t = p.town, A = advice(t, e.n);
      const settle = k => () => {
        for (let i = 0; i < k; i++) t.addVillager((t.rand() - 0.5) * 12, (t.rand() - 0.5) * 12);
        spell(t, k < e.n ? -3 : -6, 'strangers in the village', 480);
        return `${k} ${k < e.n ? 'of the refugees' : 'families'} settle at ${p.name}.${k >= e.n ? ' Not everyone is glad of them.' : ''}`;
      };
      const away = { label: 'Turn them away', run: () => { spell(t, -3, 'turned the hungry away', 240); return 'The refugees trudge on down the road.'; } };
      const all = { label: `Take them in (${e.n} people${A.safe < e.n ? `; food for ${minsText(A.after)} after` : ''})`, ok: () => advice(t, e.n).room >= e.n,
        why: () => `Room for only ${advice(t, e.n).room} more: build houses first`, run: settle(e.n) };
      // The blue first button is the safe one: all of them if the village can feed and house them,
      // otherwise as many as it can, otherwise none.
      if (A.safe >= e.n) return [all, away];
      const some = { label: `Take ${A.safe} (all the village can feed and house)`, run: settle(A.safe) };
      return A.safe > 0 ? [some, away, all] : [away, all];
    },
  },
  fair: {
    when: (w, p) => p.town.population >= 20 && !p.town.hungry,
    title: p => `Midsummer fair at ${p.name}`,
    text: (w, p) => `The people of ${p.name} want a fair: tumblers, ale, a bull to bait and a pole to dance round. Someone has to pay for it.`,
    choices: (w, p) => {
      const t = p.town;
      return [
        { label: 'Pay for the fair (60 gold)', ok: () => gold() >= 60, run: () => { pay(60); spell(t, 14, 'the fair', 420); t.grief = Math.max(0, t.grief - 10); return `${p.name} dances till dawn.`; } },
        { label: 'Let them make their own fun', run: () => `${p.name} makes do.` },
      ];
    },
  },
  bandits: {
    // (not while another chief's price still holds: one payment buys peace from every band)
    when: (w, p) => !!camp(w, p) && !(w.banditPeace > w.time),
    title: () => 'A bandit chief sends word',
    text: (w, p, e) => `${e.name}, who leads the outlaws at ${camp(w, p).name}, offers terms: pay, and every band leaves your villages alone for twenty minutes. Or pay more, and they fight for you.`,
    choices: (w, p, e) => {
      const c = camp(w, p), men = headcount(c.garrison), hireAt = Math.max(160, men * 3);   // always dearer than peace
      return [
        { label: 'Pay them off (100 gold)', ok: () => gold() >= 100, run: () => { pay(100); w.banditPeace = w.time + 1200; return `${e.name}'s men will leave your lands alone for twenty minutes.`; } },
        { label: `Hire the band (${hireAt} gold)`, ok: () => gold() >= hireAt && men >= 6, why: men < 6 ? `Only ${men} of them are left: too few to hire` : null, run: () => {
          pay(hireAt);
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
  any: true,   // held at the realm's seat, whether or not it is a village you run: the purse is the realm's
  when: (w, p) => w.rank !== 'Reeve' && p === (FACTIONS[0].seat || w.home) && !!w.crown && w.time > 1800,
  title: () => 'A tournament at Kingsbridge',
  text: (w, p, e) => `Heralds cry a tournament at Kingsbridge: a purse of 200 gold, and the eyes of every great house on the lists. ${e.champ ? `Captain ${e.champ.name} asks to ride for you.` : 'You have no captain fit to ride.'}`,
  choices: (w, p, e) => {
    const joust = (who, odds, hurt) => {
      pay(50);
      if (w.rand() < odds) {
        FACTIONS[0].gold += 200;
        for (const H of FACTIONS) if (H.index && w.dip?.[H.index] && !H.bandit) w.dip[H.index].opinion += 6;
        w.spawnArmy(0, [{ key: 'knight', count: 4, name: 'Tourney knights', xp: 1, elite: true, armour: 'plate', shield: true }], FACTIONS[0].seat || p, 'Tourney knights');
        w.chron(`${who} won the tournament at Kingsbridge.`);
        return `${who} ${who === 'You' ? 'win' : 'wins'} the tournament! 200 gold, the realm's applause, and four knights who saw it ride home to serve you.`;
      }
      hurt();
      return `${who} ${who === 'You' ? 'are' : 'is'} unhorsed in the third course. The purse goes elsewhere.${who === 'You' ? ' You are bruised and cannot ride with an army for five minutes.' : ''}`;
    };
    return [
      { label: e.champ ? `Send Captain ${e.champ.name} (50 gold)` : 'No captain to send', ok: () => !!e.champ && gold() >= 50, why: e.champ ? null : 'None of your captains is free to ride',
        run: () => joust(`Captain ${e.champ.name}`, 0.25 + e.champ.level * 0.1, () => {}) },
      { label: 'Ride yourself (50 gold)', ok: () => gold() >= 50 && !(w.lordHurt > w.time) && (w.lordCaptive ?? null) === null,
        why: () => ((w.lordCaptive ?? null) !== null ? 'You are a captive' : w.lordHurt > w.time ? 'You are still hurt from the lists' : null),
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
    { label: 'Double the captain\'s pay (100 gold)', ok: () => gold() >= 100, run: () => { pay(100); return `Captain ${e.cap.name} swears never to have taken a penny. Yours, for now.`; } },
    { label: 'Take away the command', run: () => { e.army.captain = null; e.cap.army = null; e.cap.alive = false; return `Captain ${e.cap.name} is stripped of command and sent away. ${e.army.name} marches without a captain.`; } },
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
// ---- what each kind of place brings ----
// Held abbeys draw pilgrims, fords quarrel over tolls, mines fall in. These come to a
// place of the right kind that you hold, run as a village or not (`any`).
const people = p => (p.town ? p.town.population : Math.round(p.eco?.pop ?? 0));
const menAt = p => (p.town ? p.town.garrison().reduce((n, r) => n + r.alive, 0) : headcount(p.garrison));
const SAINTS = ['St Elfrida', 'St Cuthwin', 'St Botolph', 'St Hild', 'St Aldhelm', 'St Wenna'];

EVENTS.pilgrims = {
  any: true,
  when: (w, p) => p.kind === 'monastery' && !(p.pilgrims?.until > w.time),
  title: p => `Pilgrims at ${p.name}`,
  text: (w, p, e) => `Word has gone round that the bones of ${e.saint} at ${p.name} cure the falling sickness. Pilgrims are coming up every road, with coins for the relics and nowhere to sleep.`,
  choices: (w, p, e) => [
    { label: 'Build them a hostel (100 gold)', ok: () => gold() >= 100, run: () => {
      pay(100);
      p.pilgrims = { until: w.time + 1500, rate: 0.2, saint: e.saint };
      if (p.town) spell(p.town, 6, 'pilgrims in the streets', 1500);
      return `A hostel goes up at ${p.name}. Pilgrims' coins will come in for the next twenty-five minutes.`;
    } },
    { label: 'Take a tithe of their offerings', run: () => {
      FACTIONS[0].gold += 70;
      if (p.town) spell(p.town, -6, "the lord's hand in the offering box", 600);
      return `70 gold from the offering boxes of ${p.name}. The monks are not pleased.`;
    } },
    { label: 'Let them pray in peace', run: () => {
      for (const H of FACTIONS) if (H.index && w.dip?.[H.index] && !H.bandit && !H.invader) w.dip[H.index].opinion += 2;
      return `The pilgrims pray at ${p.name} and go home speaking well of you.`;
    } },
  ],
};
EVENTS.toll = {
  any: true,
  when: (w, p) => p.kind === 'ford' && !!tollHouse(w, p),
  title: p => `A quarrel at ${p.name}`,
  text: (w, p, e) => `${e.house.name}'s men have set up a toll booth on the far bank of ${p.name} and are taking coin from every cart that crosses. There are ${e.n * 2} of them, armed.`,
  choices: (w, p, e) => {
    const them = e.n * 2, mine = menAt(p);
    return [
      { label: `Drive them off (${mine} men at the ford)`, ok: () => menAt(p) > 0, why: `None of your men are at ${p.name}`, run: () => {
        if (mine * (0.6 + w.rand() * 0.8) > them) {
          FACTIONS[0].gold += 90;
          if (w.dip?.[e.house.index]) w.dip[e.house.index].opinion -= 8;
          return `Your men throw ${e.house.name}'s booth into the river and take its strongbox: 90 gold.`;
        }
        if (!p.town) for (const u of p.garrison) u.count = Math.floor(u.count * 0.85);
        else spell(p.town, -6, 'beaten at the ford', 400);
        p.garrison = (p.garrison || []).filter(u => u.count > 0);
        return `${e.house.name}'s men beat yours back across the ford. The toll stays.`;
      } },
      { label: 'Share the toll with them', run: () => {
        FACTIONS[0].gold += 35;
        if (w.dip?.[e.house.index]) w.dip[e.house.index].opinion += 8;
        return `You split the toll with ${e.house.name}: 35 gold, and a friendlier neighbour.`;
      } },
      { label: 'Let them have it', run: () => { if (p.town) spell(p.town, -4, 'a foreign toll at the ford', 600); return `${e.house.name} keeps its booth at ${p.name}.`; } },
    ];
  },
};
EVENTS.collapse = {
  any: true,
  when: (w, p) => (p.kind === 'mine' && (!p.town || p.town.buildings.some(b => b.kind === 'mine' && b.state === 'active'))) && people(p) >= 12,
  title: p => `A fall at ${p.name}`,
  text: (w, p, e) => `A gallery has fallen in at ${p.name}. ${Math.max(2, Math.round(e.n / 2))} miners are trapped behind the rock, and the timbers along the rest are groaning.`,
  choices: (w, p, e) => {
    const trapped = Math.max(2, Math.round(e.n / 2)), t = p.town;
    const hasWood = t ? t.free('wood') >= 40 : (p.eco?.stock?.wood || 0) >= 40;
    return [
      { label: hasWood ? 'Dig them out (40 wood; the mine stops a while)' : 'Dig them out (60 gold; the mine stops a while)', ok: () => (hasWood ? (t ? t.free('wood') : (p.eco?.stock?.wood || 0)) >= 40 : gold() >= 60), run: () => {
        if (hasWood) { if (t) t.spend({ wood: 40 }); else p.eco.stock.wood -= 40; } else pay(60);
        if (t) { for (const b of t.buildings) if (b.kind === 'mine' && b.state === 'active') t.setPaused(b, true); spell(t, 6, 'the miners dug out alive', 600); }
        p.mineShut = w.time + 180;
        return `Three days of digging, and every miner comes out alive. The mine at ${p.name} works again in three minutes.`;
      } },
      { label: 'Seal the gallery', run: () => {
        if (t) lose(t, trapped); else p.eco.pop = Math.max(Math.min(8, p.eco.pop), p.eco.pop - trapped);
        return `The gallery is sealed with ${trapped} men behind it. ${p.name} mourns, and the mine goes on.`;
      } },
    ];
  },
};
// A neighbouring house not at war with you, close enough to the ford to want its toll.
const tollHouse = (w, p) => FACTIONS.find(H => H.index && H.alive && !H.bandit && !H.invader && !w.atWar(0, H.index) && !w.dip?.[H.index]?.vassal
  && w.pois.some(q => q.owner === H.index && Math.hypot(q.x - p.x, q.z - p.z) < 450));

// Time for the places' own business: pilgrims' coin, mines reopening.
export function tickPlaces(w, dt) {
  for (const p of w.pois) {
    if (p.pilgrims) {
      if (p.pilgrims.until <= w.time || p.owner !== 0) delete p.pilgrims;
      else FACTIONS[0].gold += p.pilgrims.rate * dt;
    }
    if (p.mineShut && p.mineShut <= w.time) {
      delete p.mineShut;
      if (p.town) for (const b of p.town.buildings) if (b.kind === 'mine' && b.paused) p.town.setPaused(b, false);
    }
  }
}

const schemer = w => FACTIONS.find(H => H.trait === 'schemer' && H.alive && w.atWar(0, H.index));
const turncoat = w => w.armies.filter(a => a.side === 0 && !a.gone && !a.wagon && a.captain && a.lord !== 0)
  .map(a => ({ a, c: (w.captains || []).find(c => c.id === a.captain && c.alive) })).find(x => x.c);

// The bandit camp nearest a place, if it is close and still holds men.
function camp(w, p) {
  return w.pois.filter(c => c.kind === 'camp' && c.owner === w.bandits && headcount(c.garrison || []) > 0 && Math.hypot(c.x - p.x, c.z - p.z) < 500)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] || null;
}

// ---- settlers asking to stay ----
// (creator, 2026-11-20) Now and then a group turns up at one of your villages and asks to
// stay: you decide whether you can feed them. They come as working adults, and some bring
// something with them. Their own clock, sooner and more often than the other events.
const SETTLE_FIRST = 300, SETTLE_EVERY = [360, 540];
// A kind of newcomer doesn't come twice inside this (playtest, 2026-11-21: homeless families three
// times and foresters twice in fifty minutes); each kind also tells its story a few ways.
const SETTLE_COOLDOWN = 1500;
const GROUPS = {
  refugees: { n: [5, 8], title: p => `Homeless families at ${p.name}`, bring: {},
    texts: [
      (p, n) => `${n} people whose village burned in a quarrel between lords have walked to ${p.name} with nothing but a cart and a cow. They ask for a roof and work.`,
      (p, n) => `${n} people, their fields trampled by two armies that were not even fighting each other, have come to ${p.name} on foot. They would work for bread and a corner of a barn.`,
      (p, n) => `A bad harvest and a worse landlord have driven ${n} people from the hills to ${p.name}. They are thin, and willing, and ask to be taken in.`] },
  masons: { n: [3, 4], title: p => `Masons on the road to ${p.name}`, bring: { stone: 25 },
    texts: [
      (p, n) => `${n} masons, out of work since the abbey they built was finished, stop at ${p.name} with a cartload of dressed stone. They would settle, if there is bread.`,
      (p, n) => `${n} masons whose lord ran out of money halfway up a tower bring their tools and a wagon of cut stone to ${p.name}. They ask for work, and a roof over it.`,
      (p, n) => `${n} stonecutters, driven from a quarry that fell in on itself, come to ${p.name} with what stone they could carry. They would settle and cut for you.`] },
  foresters: { n: [3, 4], title: p => `Foresters at ${p.name}`, bring: { wood: 30 },
    texts: [
      (p, n) => `${n} foresters, turned out of the king's chase, come to ${p.name} hauling a sledge of seasoned timber. They ask to settle and work the woods.`,
      (p, n) => `${n} woodsmen, whose wood was sold out from under them, arrive at ${p.name} with a sledge of timber and their own axes. They would fell for you, if you will have them.`,
      (p, n) => `${n} charcoal-burners and fellers, put out when their wood was enclosed, bring seasoned timber to ${p.name}. They ask to settle at the forest's edge.`] },
};

// The blue first button is the safe one: when food or room is short, as many as the village can feed
// and house, or sending them on, comes before taking them all.
function safeFirst(choices, A, n, take) {
  if (A.safe >= n) return choices;
  const away = choices.at(-1), rest = choices.slice(0, -1);
  if (A.safe > 0) return [{ label: `Take ${A.safe} (all the village can feed and house)`, run: take(A.safe) }, away, ...rest];
  return [away, ...rest];
}

function settlerEvent(w, p, id) {
  const G = GROUPS[id], t = p.town;
  const n = G.n[0] + Math.floor(w.rand() * (G.n[1] - G.n[0] + 1));
  // a different telling from the last time this kind came
  const seen = (w.settlerSeen ??= {})[id] ??= { at: -1e9, variant: -1 };
  const variants = G.texts.map((_, i) => i).filter(i => i !== seen.variant), variant = variants[Math.floor(w.rand() * variants.length)];
  seen.at = w.time; seen.variant = variant;
  const room = () => t.housing - t.population;
  const brings = Object.entries(G.bring).map(([g, q]) => `${q} ${g}`).join(', ');
  const take = k => () => {
    for (let i = 0; i < k; i++) { const a = t.rand() * Math.PI * 2; const v = t.addVillager(Math.sin(a) * 30, Math.cos(a) * 30); v.wander = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 }; }
    for (const [g, q] of Object.entries(G.bring)) t.put(t.keep, g, q);
    return `${k} newcomers settle at ${p.name}${brings ? `, with ${brings}` : ''}.`;
  };
  const A = advice(t, n);
  const choices = [
    { label: `Take them in (${n} people${brings ? `, ${brings}` : ''}${A.safe < n && A.room >= n ? `; food for ${minsText(A.after)} after` : ''})`, ok: () => room() >= n, why: () => `Room for only ${Math.max(0, room())} more: build houses first`, run: take(n) },
    ...(id === 'refugees' ? [{ label: `Take the strongest (${Math.ceil(n / 2)} people)`, ok: () => room() >= Math.ceil(n / 2), why: () => `Room for only ${Math.max(0, room())} more: build houses first`, run: () => { spell(t, -3, 'families split at the gate', 300); return take(Math.ceil(n / 2))(); } }] : []),
    { label: 'Send them on their way', run: () => `The ${id} go on down the road.` },
  ];
  const ev = { id: `settlers-${id}`, image: picture(id), title: G.title(p),
    text: `${G.texts[variant](p, n)} ${factsOf(p, A)}${room() < n ? ' Build houses first.' : A.safe < n ? ' The larder is thin: more mouths would leave it short.' : ''}`, at: p,
    choices: safeFirst(choices, A, n, take).map(c => live(w, c)) };
  if (w.hooks.choice) w.hooks.choice(ev);
  else ev.choices.at(-1).run();
  return ev;
}

export const SETTLERS = { COOLDOWN: SETTLE_COOLDOWN, GROUPS };   // for checks()
export function tickSettlers(w, dt) {
  w.settlerClock = (w.settlerClock ?? SETTLE_FIRST) - dt;
  if (w.settlerClock > 0) return;
  w.settlerClock = SETTLE_EVERY[0] + w.rand() * (SETTLE_EVERY[1] - SETTLE_EVERY[0]);
  const places = w.pois.filter(p => p.owner === 0 && p.town && !p.town.underAttack && !p.town.hostile && !p.town.revolt && !p.town.readOnly);
  if (!places.length) return;
  const p = places[Math.floor(w.rand() * places.length)];
  const ids = Object.keys(GROUPS).filter(k => k !== w.lastSettlers && w.time - (w.settlerSeen?.[k]?.at ?? -1e9) >= SETTLE_COOLDOWN);
  if (!ids.length) return;   // every kind came lately: nobody this time
  const id = ids[Math.floor(w.rand() * ids.length)];
  w.lastSettlers = id;
  settlerEvent(w, p, id);
}

// Events keep the seasons of world time (World.season: 0 spring to 3 winter, a year of 1200 s;
// not the sky's clock, which holds still during a fight): a midsummer fair only in summer,
// blight with the grain on the stalk, tournaments and pilgrims in the open months. And no
// event comes twice in a year (round 4: fevers came again and again).
export const IN_SEASON = { fair: [1], harvest: [1, 2], tournament: [0, 1], pilgrims: [0, 1, 2] };
export const EVENT_AGAIN = 1200;
export const eventReady = (w, id) => (!IN_SEASON[id] || IN_SEASON[id].includes(w.season)) && w.time - (w.eventAt?.[id] ?? -1e9) >= EVENT_AGAIN;

export function tickEvents(w, dt) {
  tickPlaces(w, dt);
  tickSettlers(w, dt);
  w.eventClock = (w.eventClock ?? FIRST) - dt;
  if (w.eventClock > 0) return;
  w.eventClock = EVERY[0] + w.rand() * (EVERY[1] - EVERY[0]);
  const places = w.pois.filter(p => p.owner === 0 && p.town && !p.town.underAttack && !p.town.hostile && !p.town.revolt);
  const held = w.pois.filter(p => p.owner === 0 && !p.vassal && !p.falling && (p.town ? places.includes(p) : p.eco));
  const options = [];
  for (const [id, E] of Object.entries(EVENTS)) {
    if (id === w.lastEvent || !eventReady(w, id)) continue;
    for (const p of E.any ? held : places) if (E.when(w, p)) options.push([id, p]);
  }
  if (!options.length) return;
  const [id, p] = options[Math.floor(w.rand() * options.length)];
  fire(w, id, p);
}

export function fire(w, id, p) {
  const E = EVENTS[id];
  const r = () => w.rand();
  const extra = { saint: SAINTS[Math.floor(r() * SAINTS.length)], house: id === 'toll' ? tollHouse(w, p) : null, name: id === 'knight' ? KNIGHTS[Math.floor(r() * KNIGHTS.length)] : CHIEFS[Math.floor(r() * CHIEFS.length)], n: Math.round((w.part === 2 ? 10 : 5) + r() * 6) };
  if (id === 'tournament') extra.champ = (w.captains || []).filter(c => c.alive && c.side === 0 && c.captive === undefined).sort((a, b) => b.level - a.level)[0] || null;
  if (id === 'scheme') { const t = turncoat(w); Object.assign(extra, { cap: t.c, army: t.a, house: schemer(w) }); }
  w.lastEvent = id;
  (w.eventAt ??= {})[id] = w.time;
  if (id === 'refugees') ((w.settlerSeen ??= {}).refugees ??= { at: -1e9, variant: -1 }).at = w.time;
  const choices = E.choices(w, p, extra);
  const ev = { id, image: picture(id), title: E.title(p), text: E.text(w, p, extra), at: p,
    choices: choices.map(c => live(w, c)) };
  if (w.hooks.choice) w.hooks.choice(ev);
  else ev.choices.at(-1).run();   // nobody to ask: the plain choice
  return ev;
}

// The coronation at Kingsbridge (Duke batch, 2026-11-21): the crown is a moment, not a log
// line. When you are crowned, before the wall falls, you choose how the realm remembers the
// day. Each choice carries into the war in the north, and the two that cost gold cost a share
// of the treasury, since a duke's purse has nothing else that size to buy.
export function coronation(w) {
  const K = w.crown, me = FACTIONS[0], towns = w.pois.filter(p => p.owner === 0 && p.town).map(p => p.town);
  const share = (f, least) => Math.max(least, Math.round(gold() * f / 50) * 50);
  const largesse = share(0.25, 500), lists = share(0.12, 300);
  const lords = () => FACTIONS.filter(H => H.index && H.alive && !H.bandit && !H.invader && w.dip?.[H.index]);
  const how = w.victory === 'acclaim' ? 'Every great house has named you king.' : 'Kingsbridge is yours, and half the realm with it.';
  const told = text => { w.chron(text); return text; };
  const choices = [
    { label: `Largesse: scatter coin in the streets (${largesse} gold)`, ok: () => gold() >= largesse, run: () => {
      pay(largesse);
      for (const t of towns) { spell(t, 15, 'the coronation largesse', 1200); t.grief = Math.max(0, t.grief - 10); }
      for (const H of lords()) w.dip[H.index].opinion += 10;
      return told(`You were crowned at ${K.name}, and ${largesse} gold was thrown to the crowds. Every village of yours drank your health, and the great lords remembered the open hand.`);
    } },
    { label: `A crowning tournament (${lists} gold)`, ok: () => gold() >= lists, run: () => {
      pay(lists);
      const caps = (w.captains || []).filter(c => c.alive && c.side === 0 && c.captive === undefined);
      for (const c of caps) c.level += 1;
      for (const H of lords()) w.dip[H.index].opinion += 5;
      return told(`You were crowned at ${K.name}, and the lists ran for three days.${caps.length === 1 ? ' Your captain rode in them and came away a level the better.' : caps.length ? ` Your ${caps.length} captains rode in them, and each came away a level the better.` : ''} The great lords' sons rode too.`);
    } },
    { label: 'Pardons: open the gaols and forgive the outlaws', run: () => {
      for (const t of towns) { t.grief = 0; spell(t, 8, 'the coronation pardons', 900); }
      w.banditPeace = Math.max(w.banditPeace ?? 0, w.time + 2400);
      for (const H of lords()) w.dip[H.index].opinion -= 4;
      return told(`You were crowned at ${K.name}, and pardoned every outlaw and debtor in the realm. The villages blessed you; the bands stayed off your roads for forty minutes; the great lords grumbled at thieves walking free.`);
    } },
  ];
  return { id: 'coronation', image: picture('coronation'), title: `The coronation at ${K.name}`,
    text: `${how} The bells of ${K.name} ring, the archbishop waits with the oil, and the lords of the realm kneel in the nave. How will the realm remember the day?`, at: K, choices: choices.map(c => live(w, c)) };
}
