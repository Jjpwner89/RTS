# RTS design notes

The one home for this game's goals, decisions and open questions. Working title: none yet.

## What the creator wants

- Favourites: **Total War** first, then **Crusader Kings** and **Stellaris**. Closest in feel: **Stronghold / Stronghold Crusader** and **Manor Lords**, where you build and fight in one place.
- Real time preferred.
- The feeling of **building up gradually, reaching scale, then playing with that scale**.
- **Every stage keeps its own challenge**, and combat stays engaging all the way up.
- Battles use **regiments of many soldiers** that you move as blocks.
- **Routing units run home**; they don't leave the board.

## Decisions (2026-11-18)

| Topic | Decision |
|---|---|
| Setting | **Medieval**, original. Breachline's world may follow later as a spin-off, the way Total War went to Warhammer. |
| Structure | A **world map** of **points of interest (POIs)**: villages, castles, mines, fords, battlefields. Zoom into any POI to a real-time local map where you **build and fight in one place**. |
| POIs | **All POIs are equal.** Bring an army to any POI and either build there or march in and fight. |
| Who you are | A **faction**, not a dynasty of characters. |
| Length | A **long campaign** with saves. |
| Players | **Single player first.** |
| Look | **3D for now** (three.js); not final. |
| Routs | Broken units **run to the nearest friendly keep or camp and regroup**. Built into the battle test. |

## How it plays (draft)

### Two layers, one game

1. **World map (real time with pause).** Armies march between POIs, and you see territory, roads, supply and rival factions. Everything keeps moving while you are zoomed into one place.
2. **POI map (real time).** A local map in the style of Stronghold or Manor Lords: a keep, fields, workshops and walls, and the battles fought there. Zoom in and out freely; there are no separate battle screens.

### Build and fight in the same place

- **Economy at each POI:** production chains (wood, stone, food, iron → weapons → troops) with organic growth in the style of Manor Lords.
- **Soldiers come from your people** (Manor Lords): levies are villagers, so losses cost workers. Routers who make it home go back to work. Professional retinues and mercenaries cost money, not people.
- **Castles and sieges** are the decisive fights: walls, gates, towers, ladders and rams.
- **Camps:** an army can set up a fortified camp at any POI, and that becomes its home to rout to. Building it up turns it into a new holding.

### The climb

The faction grows from a single holding to a realm on the world map. Each stage widens what you hold and brings a new kind of pressure:

| Stage | Holds | Main pressure | New at this stage |
|---|---|---|---|
| Lord | 1 POI, a retinue | Bandits, a rival lord next door | Building the first village and keep |
| Baron / Count | A few POIs | Neighbouring lords, raids on outlying POIs | Several holdings, roads, a field army |
| Duke / King | A region | Rival realms, sieges, unrest | Several armies, specialised POIs |
| Emperor | Many regions | Rebellions, coalitions, an endgame crisis | Running holdings you rarely visit |

**Scale stays playable** because POIs you are not watching run on their own: they produce at abstract rates, and their fights resolve automatically unless you zoom in and take command. You can always drop into any POI and play it by hand.

## Technology

- **Browser game, plain JavaScript, no build step.** It runs anywhere and is easy to share.
- **three.js (WebGL) for 3D.** Soldiers are instanced: the battle test runs 4,700 soldiers with about 4.6 ms of simulation a tick.
- **Models:** low-poly shapes built in code for now. Free CC0 packs (Kenney, Quaternius, KayKit) are an option later, and 3D can be pre-rendered to sprites if a 2D or isometric look wins.
- **2D art from Codex:** faction heraldry, event pictures, the world-map style and UI.
- **The big technical question:** how to simulate POIs nobody is watching. They need to run cheaply and abstractly, then turn into the full simulation when you zoom in.

## Built so far

**Battle test** (`index.html`), 2026-11-18:
- 9 regiments a side (spears, swords, archers, cavalry), about 1,200 soldiers, with a keep and village at each side's end of the field.
- Total War–style orders: box select, right-click to move or attack, right-drag to draw a front line. You can pause and still give orders.
- Melee between individual soldiers; arcing arrows that can hit your own men; cavalry charges that braced spears stop from the front.
- Morale, flank and rear hits, and routs. Routers can rally once in the field; otherwise they run to their keep, regroup and come back under orders.
- Strategic zoom with banners that stay a fixed size on screen.
- URL options: `?seed=123` for a fixed map, `?scale=4` for four lines a side.

## Proposed next steps

1. **One POI you can build in:** gather wood, stone and food, put up houses, a keep and a barracks, and raise levies from your villagers. Bandits or a rival lord attack.
2. **A small world map** with a handful of POIs: march an army from one to another and zoom between the two layers.
3. **A rival AI faction** that builds and attacks.
4. Later: sieges and walls, more unit types, saves, and the full climb.

## Open questions for the creator

1. **Building placement:** free-form like Manor Lords, or a grid like Stronghold?
2. **Economy depth:** many buildings and long chains (Stronghold), or fewer and simpler (Manor Lords)?
3. **World map:** real time with pause (proposed), or turn-based between real-time POIs?
4. **The reference "Kingdoms medieval wars":** which game is it, so I can look at what it does well?

## Side project

A simpler, high-level strategy game in the vein of War of Dots or Line Battle: armies as tokens on a map, fronts and supply. It is an original design built in parallel, in `fronts/`. **This deeper game takes precedence.**

**Marchfront** (built 2026-11-18) lives in [`fronts/`](fronts/) and is playable: one map (the Sundered Vale), one AI opponent with three difficulties, pause and speed controls, and a win by taking the enemy capital. Armies claim land as they move, supply runs from the capital through held land, towns have garrisons, and terrain and digging in shape every fight. Plain JavaScript and Canvas 2D, no build step. Rules, AI, controls and test notes are in [fronts/NOTES.md](fronts/NOTES.md). Ideas from it that may carry over here: supply as connected held land, and armies painting a front as they move.
