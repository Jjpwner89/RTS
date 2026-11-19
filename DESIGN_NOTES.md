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
| Soldiers | **Levies are your villagers.** Losses cost workers, and survivors go back to work when disbanded. |
| Unwatched POIs | Run on their own at abstract rates and switch to the full simulation when you zoom in. |
| Building placement | **Free-form**, as in Age of Empires: put a building anywhere sensible, near the resource it uses. |
| Economy | **Simple, but with a few layers** from raw input to finished goods (see below). |
| World map | **Real time with pause.** |
| Reference | *Medieval Kingdom Wars* (grand strategy with castle building and real-time battles) is the closest existing game. |
| Soldiers' look | **Quaternius modular people** with refitted knight helmets and shoulder pads, Quaternius weapons and fitted body armour: steel plate for spears and swords, mail for cavalry, leather for archers. Teams show on a surcoat over the armour, painted shields and archers' hoods. |
| Buildings' look | **Quaternius Ultimate Fantasy RTS.** The keep is its town centre, growing through levels I–III with the village (30 and 60 people). The Wonder models are a separate castle line (fort → castle → stone castle → fortress); a lord's seat shows the wooden castle. Houses pick one of three styles at random. Workshops mix in the Quaternius Medieval Village Pack (sawmill, blacksmith), which can later serve as upgrades of the RTS buildings. Building list can change to fit good models, as long as gathering and the layered production chains stay. |

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

## Production chains (draft)

Every finished good takes two or three steps, with one or two inputs at each step. That gives enough layers to plan around without becoming a spreadsheet.

| Goods | Made at | From |
|---|---|---|
| Wood | Woodcutter (near trees) | trees |
| Stone | Quarry (near rock) | rock outcrops |
| Iron ore | Mine (near a deposit) | ore deposits |
| Food, feathers | Hunter (near woods) | game |
| Food | Farm | fields |
| Flax | Flax field | fields |
| Planks | Carpenter | wood |
| Shields | Carpenter | planks |
| String | Ropemaker | flax |
| Iron | Smelter | ore + wood |
| Bows | Bowyer | planks + string |
| Arrows | Bowyer | planks + feathers |
| Spears | Weaponsmith | iron + planks |
| Swords | Weaponsmith | iron |

**Raising troops.** Each soldier is one villager plus a kit: spearman = spear + shield; archer = bow + arrows; swordsman = sword + shield. Disbanding returns the survivors' kit to the stockpile.

Later: leather and armour (hunter hides → tanner → armourer), horses (stable) for cavalry, bread (farm → mill → bakery), siege engines.

## Technology

- **Browser game, plain JavaScript, no build step.** It runs anywhere and is easy to share.
- **three.js (WebGL) for 3D.** Soldiers are instanced: the battle test runs 4,700 soldiers with about 4.6 ms of simulation a tick.
- **Models:** baked from free CC0 Quaternius packs into `assets/models.glb` (3.7 MB); the shapes built in code remain as a fallback if it fails to load. Each soldier has a light version of about 1,500 triangles (full ones are 11,000 to 17,500), and only soldiers near the camera are drawn in full; that ran 1,000 soldiers in about 13 ms a frame and 4,000 in about 19 ms on the creator's Mac. How they are made, and how to rebuild them, is in [tools/models/README.md](tools/models/README.md).
- **2D art from Codex:** faction heraldry, event pictures, the world-map style and UI.
- **The big technical question:** how to simulate POIs nobody is watching. They need to run cheaply and abstractly, then turn into the full simulation when you zoom in.

## Built so far

`index.html` is a menu that leads to every prototype.

**Campaign** (`world.html`), 2026-11-18, the first playtest of the world map:
- Four places joined by roads. Your seat, Ashford, is in the south and House Varn's seat, Blackmoor, in the north. Between them are two free villages, Hollin and Stowe, each defended by about 40 militia and bowmen.
- Real time with pause on the map too. Click to select, right-click a place to march there, and double-click one of your villages to go into it. **M** returns to the map.
- Your villages are the full village game and keep running while you are away. Muster the garrison from the map, or select regiments in a village and press *March out*. An army that marches into one of your villages joins its garrison, and levies become that village's villagers.
- Attacking a place, or meeting an enemy army, asks you to fight it out (a field battle with your army and theirs; defenders of a place hold near its keep) or auto-resolve. Losers fall back to their nearest holding. A captured free village keeps its people and a few buildings.
- House Varn is abstract for now: a garrison at Blackmoor that grows over time, faster for each village it holds. It sends one expedition at a time. It takes the free villages first, leaves yours alone for six minutes, then raids or assaults whichever of your villages is weakest. Attacks on your villages happen inside the village, coming in by the road from the attacker's side. If you are away, the garrison fights on its own. If a keep falls, the village goes to Varn and your survivors run home.
- Take Blackmoor to win; lose every village and army to lose.
- The timed bandit raids are gone from the campaign; they stay in the standalone village as practice.

**Village** (`town.html`), 2026-11-18, the first point of interest:
- A keep and 12 villagers in a clearing in the woods, with stone outcrops and ore deposits around.
- Free building placement with a green or red ghost. Gatherers must be near their resource, and a ring shows their reach. Trees are cleared where you build.
- Villagers build sites, then stay on as the first workers. Gatherers walk out to trees, rocks, ore or fields and carry the goods back. Craftsmen work at their door.
- All the production chains above. Each workshop's recipes are switches: turn off the ones you don't want, and with several on it takes turns. Two carpenters can split planks and shields. Planks, string and iron stop at a stock limit; weapons, shields and arrows have none, so switch a recipe off to stop it. Crafting never burns the last 20 wood, so construction can go on.
- Food: villagers eat; houses add room; new families settle while there is food and room.
- Barracks: call up a levy of 5–20 villagers if their kit is in stock. Their deaths are villagers lost. Disband returns the survivors and their kit to work.
- Bandit raids from 5:00, growing with each wave (archers from wave 3). Villagers flee to the keep. Raiders burn what they reach and leave after three fires or about 2½ minutes. If the keep falls, the game is lost.
- The lord's retinue of 20 swordsmen costs no villagers. You can send it to work: the men become villagers and their 20 swords and shields go to the stores, so a barracks can arm them again as a levy.

**Battle test** (`battle.html`), 2026-11-18:
- 9 regiments a side (spears, swords, archers, cavalry), about 1,200 soldiers, with a keep and village at each side's end of the field.
- Total War–style orders: box select, right-click to move or attack, right-drag to draw a front line. You can pause and still give orders.
- Melee between individual soldiers; arcing arrows that can hit your own men; cavalry charges that braced spears stop from the front.
- Morale, flank and rear hits, and routs. Routers can rally once in the field; otherwise they run to their keep, regroup and come back under orders.
- Strategic zoom with banners that stay a fixed size on screen.
- URL options: `?seed=123` for a fixed map, `?scale=4` for four lines a side.

## Proposed next steps

1. **Play the campaign and tune it**: when House Varn moves, how big its armies are, and how fast your villages can answer.
2. **More factions and diplomacy**, as the creator asked: several houses, peace, alliances and tribute.
3. **A rival that builds**: Varn's villages becoming real towns instead of a growing number.
4. Later: sieges and walls, supply on the march, more unit types, saves, and the full climb.

## Open questions for the creator

- **Archery range or barracks?** For now the bowyer uses the Fantasy RTS archery range and the barracks its barracks.

## Side project

A simpler, high-level strategy game in the vein of War of Dots or Line Battle: armies as tokens on a map, fronts and supply. It is an original design built in parallel, in `fronts/`. **This deeper game takes precedence.**

**Marchfront** (built 2026-11-18) lives in [`fronts/`](fronts/) and is playable: one map (the Sundered Vale), one AI opponent with three difficulties, pause and speed controls, and a win by taking the enemy capital. Armies claim land as they move, supply runs from the capital through held land, towns have garrisons, and terrain and digging in shape every fight. Plain JavaScript and Canvas 2D, no build step. Rules, AI, controls and test notes are in [fronts/NOTES.md](fronts/NOTES.md). Ideas from it that may carry over here: supply as connected held land, and armies painting a front as they move.
