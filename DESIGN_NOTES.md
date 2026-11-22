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
| Soldiers' look | **Quaternius modular people** with refitted knight helmets and shoulder pads, Quaternius weapons and fitted body armour. **Armour levels** (`armour: 'none' | 'leather' | 'mail' | 'plate'`, `shield: false` for none): spearmen, swordsmen, archers, crossbowmen and both horse are baked as a body with weapons plus a piece per level and a shield, put together by models.js `unitLook`. None is the team tunic and surcoat, bare-headed; leather a brown jerkin and leather cap; mail a dark mail shirt and an iron kettle hat (the type's own helm for crossbows and horse); plate bright steel to the wrists with the plate helm and shoulder pads. Bowmen keep their team-shade felt hood at every level. Without armour given, each keeps its usual look: plate for spears and swords, mail for crossbows and heavy horse, leather for archers and light horse. Icons: `armour-none`, `armour-leather`, `armour-mail`, `armour-plate`, `no-shield`. Teams show on a surcoat over the armour, painted shields and archers' hoods. A lord in the field (`unit.lord`, and `unit.lady` for a woman) rides bare-headed under a gold coronet, in bright plate and a long dark house cloak on a caparisoned horse, with a bannerman in a kettle hat carrying the house banner beside them. Kettle hats, great helms and padded coats are made too (bake.js `TRIAL`) but no soldier wears them yet. Riders sit up on the horse's back (found by a ray, not the nearest vertex) with a cloth draped over it. Norrhold's host: axemen in mail under a pale fur mantle with long axes, javelin men in a felt hood and fur with a bundle of javelins on the back, and war dogs: the Quaternius wolf, mastiff-sized (0.75 m at the shoulder), under a team cloth. On the world map an army shows its own troops, about one figure for every ten men (at most 48): foot in front, bowmen behind, horse on the right flank, dogs ahead and engines at the rear, with its lord riding at its head. A rival army shows only as much as your eyes reach: far off a dark knot of men, nearer a block the right size in its colours, close up its own troops (`a.know`). The **Muster** page (muster.html) parades every kind of soldier round a field with marching bob, sway and fluttering banners, to look over on a turning plinth or follow on the march. |
| Buildings' look | **Quaternius Ultimate Fantasy RTS.** The town-centre models read as town squares, not keeps, so they're out. A village **keep is a lord's hall that grows** in five levels (30, 60, 100 and 150 people, or a level the town sets): timber tower-house, stone-and-timber hall, great hall between stone towers, stone castle, fortress. The smallest palisaded Wonder fort is the **fort** for forts and army camps. The Wonder models are a separate castle line (wood fort → wood castle → stone castle → fortress); a lord's seat shows the one for its level. Each kind of place on the world map has its own look, and Kingsbridge is a walled city. The north's mountain gate is a walled castle with the host camped outside; war camps are stake stockades full of tents. The old wall runs across the north of the map, whole in Part 1 and broken where the war camps' roads cross in Part 2. A place you run as a real village shows that village in miniature: its keep, and its buildings where they stand. Houses pick one of three styles at random: a closed timber hut at level I, tiled houses at II and III (the pack's open-frame huts read as building sites, so they aren't used). Wooden walls are a rough palisade of uneven stakes. Workshops mix in the Quaternius Medieval Village Pack (sawmill, blacksmith), which can later serve as upgrades of the RTS buildings. Building list can change to fit good models, as long as gathering and the layered production chains stay. |
| Map look | Chosen 2026-11-19 from the "Battlefield Looks" page: all five treatments, in `src/scenery.js`. **Painted ground**: grass patches, bare earth, rock ledges and drifting cloud shadows in the ground shader; the river ripples and glints. **Ground cover**: swaying grass in clumps, wildflowers, stones and bushes, drawn only within about 270 of the camera and cleared from under buildings (about 1.5 ms a frame with 130 regiments). **Mixed woods**: broadleaf, pine and birch drawn in code (Quaternius nature models are a possible upgrade). **Lived-in land**: tracks from each keep, strip fields round keeps on battlefields, village roads, trampled ground. **Light and air**: a low warm sun from the side, film-style tone mapping, a sky gradient and a soft vignette. The war-table look (parchment and contour lines) was shown but not built; it could become the far-zoom view. |
| Interface look | Chosen 2026-11-19 from the "Interface Looks" page: **parchment and ink**, the art brief's own direction, in `src/skin.css` loaded after `style.css` on the world, battle and village pages. Parchment panels with a thin bronze rim, dark ink text and rust-red headings in IM Fell English SC, body text in Alegreya Sans; a dark leather top bar; parchment ribbon buttons; house-blue cloth for whatever is picked. Textures are code (an SVG grain plus gradients) until the painted UI kit replaces `--grain` and the gradients. Regiment cards put the name across the top so full names fit. The Muster keeps its own dark styling for now. Leather and gilt, and house cloth, were the other two options. |

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

**Raising troops.** Each soldier is one villager plus a kit: spearman = spear + shield; archer = bow + arrows; swordsman = sword + shield. Kit must be carried to the barracks before it can be issued. Disbanding returns the survivors' kit to the nearest barracks.

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

**The realm** (Realm workstream), 2026-11-19. The four-place campaign above has grown into the full map:
- A generated realm of about 30 places of six kinds, five named houses with traits and taunts, bandit camps, fog of war, and Kingsbridge, the empty royal city. Rival houses hold real villages, raid, skirmish and send siege hosts. Diplomacy covers truces, gifts, tribute, alliances, marriage and vassals; win by holding Kingsbridge and half the realm, or by enough houses backing your claim.
- **Storming a place happens in the place itself**: the place as its numbers say, laid out as below. Beat or rout every defender to take it; select any of their buildings to burn it. Its people are about the place and run for the keep when your men come near.
- **One layout per place** (2026-11-21, [src/world/places.js](src/world/places.js)): a place you don't run is laid out from its numbers (holdings.js eco) by one generator, and that layout is what you storm, take, look round, get back from a vassal and see in miniature on the world map. Towns: the keep, a square with well, market and chapel (an abbey's church on its cloister court, a market town's square biggest), streets and lanes off the roads with houses fronting them, workshops among them, tanner and smelter at the edge, gatherers at their trees, rock and ore, fields in a ring outside. Walls follow the built-up edge and the rise of the ground, with a gate on every road and towers at corners and along long runs. Castles: a curtain round a stone keep and its bailey (barracks, stables, smithy, store, well), the village outside as a burgh along the road to the gate (a small market place a little out from the gate, the street lined both sides, fields beside it); a lord's seat is a castle inside a walled town; Kingsbridge a walled city. Every building in the tally is placed; one that can't be is said so in the village and the console, never dropped. The first time you see a place up close its layout becomes its own (p.mem, the layout rule); after that it only grows. A place's yards and lanes are cleared of trees. Places remembered under the old rule are laid out anew once when a save loads (creator, 2026-11-21): owner, numbers, building levels, keep and damage carry over, and walls a player built stand as they were with the streets inside them; what can't carry over is said in the console and the log. A place's numbers' walls always match the walls that stand. `checks()` runs the layout invariants.
- **Places remember** their buildings and walls when they change hands. Lose a village and you storm your own walls to get it back; burned buildings stay burned, and broken walls stay broken unless the holders have had four minutes to mend them. An army camped at your village falls back into it to defend.
- **Part 2**: once crowned, the screen shatters, the old wall to the north falls, and the Norrhold host pours through in growing tides. The lords kneel as vassals; Norrhold can't be bargained with.
- **Food supply** (`src/world/supply.js`): a man eats one food every two minutes. Armies set out with up to four minutes of food, loaded from the village stores, and refill near their own (or a vassal's or ally's) places. Out of food, men desert. A third of the fallen in a fight are wounded: they follow the army and rejoin when it rests fed at home. From an army's panel you can send a wagon of food from your nearest village; it drives straight to the army, and enemy armies that meet it take its food.

**Villages grow up** (Realm workstream), 2026-11-19:
- **Every unit can be raised.** Barracks call up spearmen, archers, swordsmen, crossbowmen, men-at-arms, light and heavy cavalry and knights, each from its kit. New chains feed them: hunters bring hides, a tanner makes leather, an armourer makes mail (and plate, switched off by default), a stable breeds horses on grain, and the weaponsmith adds crossbows, bolts and lances (off until you switch them on).
- **Siege workshop**: materials carried there build a ladder team, a ram, a mangonel or a trebuchet, crewed by villagers.
- **Hired men** at the keep, paid in gold from your treasury: sellswords, hired crossbows and a household guard. They cost no villagers.
- **Bread**: a mill grinds grain into flour and a bakery bakes it; a loaf is a meal, so the same grain feeds more people, and bread on the table lifts the mood.
- **Mood** from 0 to 100: full larders, bread, a well, a market and a chapel raise it; hunger, crowding, high taxes, the dead and being attacked lower it. Hover the mood in the stock panel, or open the keep, for the reasons. A happy village draws newcomers faster and pays more tax; below 35 nobody new settles, and below 20 families leave.
- **Taxes** are set per village with − and + in the stock panel, from none to cruel. Gold also comes from a **market**, which sells only what is spare above a reserve (wood, stone and food on; planks, iron and swords off until you switch them on).
- **Upgrades**: any building can be raised to level 2 (40 gold, a village of 30) and level 3 (120 gold, a village of 60). Each level works faster, houses hold three more, and stores keep another hauler.
- **The governor** (`src/world/governor.js`) builds in any village of yours you are not watching: farms when food runs short, houses when it is full, woodcutters, a storehouse, then a well, market, chapel, mill and bakery. One building at a time from the village's own goods; it never raises men or spends gold. Switch it off at the keep.
- **Revolts**: a village of 15 or more kept below mood 15 for two minutes revolts. A third of its people (6–40) throw down their tools, gather by the keep in red, march out along one road to the woods, and about 25 seconds later come back that way as a raid of "Rebel peasants". The stock panel counts down beforehand, and the game won't save mid-revolt. Afterwards the rest are cowed (+15 mood), and there is no second revolt for ten minutes.
- **Watchtower** (Military): your place sees 120 further on the realm map, more at higher levels; the best three towers count, with diminishing returns.
- **Planks are kept for building**: workshops leave 25 planks alone, just as they leave 20 wood, so a carpenter no longer turns every plank into shields.

**Running the realm** (Realm workstream), 2026-11-19:
- **Saves** (`src/world/save.js`): one slot in the browser. The game saves itself every two minutes between fights; there's also a Save button. Continue on the menu (`world.html?continue`) rebuilds the map from its seed and then puts back everything that happened.
- **Armies eat** (`src/world/supply.js`): a man eats one food every two minutes, and the carts hold four minutes' worth. Armies refill near their own places (yours draw from village stores). A starving army loses its wounded first, then deserts. A third of the men lost in a fight are wounded; they walk with the army and rejoin as it rests fed. Supply wagons go from your villages to an army far from home, and enemies can catch them.
- **Call the banners** (ruling, 2026-11-21): calls your villages' spare men and your vassals' share, nothing else. Armies already in the field are never pulled in, and every village keeps its guard: its men on the walls, its militia and at least 20 men in all (the fewest whole regiments that make 20). Each barracks still raises what it can arm, keeping half its people at work. The button first shows who would come, village by village and vassal by vassal, with Call them or Not now; the call then carries out that same plan (world.js `bannerPlan`). Armies waiting at the same place can **join**.
- **Losing your seat** moves it to your biggest remaining village.
- **Rivals grow by your rules: every place keeps a real economy** (2026-11-19, [src/world/holdings.js](src/world/holdings.js)). Rival holdings and free villages are run as numbers on your own building table: so many houses, farms, workshops and stores; people who work them (seven in ten), eat a meal a minute, and settle while there is room and food; goods that pile up in its stores; and kit that turns villagers into soldiers. A steward gets four tenths of a hard-driven village's output, families come one every 30 seconds (yours: 18, or 11 in a happy village), and planks are kept back for building, as in your villages.
  - Each place builds from a plan for its trade (farming, arms, trade or timber-and-iron), one building every 40 seconds from its own goods, then a little more of its trade now and then, up to a size that fits the kind of place. Its lord takes its taxes and half of what its market sells. It fills its own garrison from its own kit and people, and its lord's field armies are armed from the stores of his places.
  - **Places vary** when the realm is made: poor (three in ten), modest or wealthy, which sets their people, buildings, stores and guard. Markets lean rich, trading towns trust coin over walls (fewer guards, rarely walled), arms towns keep more men and often a palisade, seats and castles are walled.
  - **What you see is what is there.** Storm or take a place and its town is laid out from its tally of buildings, with its walls and its whole stores; coin found in it goes to your purse. Beat off, it keeps what was not burned. A village you lose becomes a holding as it stood. Raiders take a quarter of a holding's stores.
  - Measured on seed 7 with scripted players (rival attacks on the player off): a fast Ashford raises 4.4 men a minute in minutes 10–20, until new families run short; a slow one reaches 35 men by minute 39. A rival house raises 2–4 men a minute in minutes 10–20 (about 20–30 in the first five minutes from what its stores already hold), more as it conquers: 64 to 257 men raised by minute 40. The northern host and bandit camps keep their old rough pace.
- **Building tools** (2026-11-19): a building stays in hand after you place it, for more of the same, until right-click or Esc. B then a letter picks a building with its ghost ready; each building takes the first letter of its name not already used (H house, C carpenter, W woodcutter, F farm), shown on its button.
- **Spies** (2026-11-19): select a place you have seen and send a spy (40 gold, more for seats and the royal city). He comes back after half a minute or more with a report: people, wealth, trade, walls, men, kit in store, gold, goods and buildings, as they were that day. Walls, soldiers and seats make it harder; a caught spy costs the lord's opinion of you.
- **The climb, part one** (2026-11-19, roadmap §2): reaching Lord, Count or Duke brings a herald, drums then a horn, and a line on what the rank opens.
  - **Vassals** ([src/world/vassals.js](src/world/vassals.js)), from Lord: select a village of yours (not your seat) and grant it to a new lord or one you have. He runs it on the same tracked economy as any place you don't run, keeps your layout, pays you a share of what it earns (dues) and sends a share of his men when you call the banners (levies). One opinion number, coloured, with the reasons on hover (after Crusader Kings 2): his temper, dues and levies, a council seat, one want that weighs more the longer it goes unmet, and marks that fade (gifts, wars won, a village of his lost, others' land taken back). Below −25 he pays and sends nothing until he cools. Taking a village back gives you the town as he grew it; the others take note. You may look round a vassal's village (read-only, creator's call): it is laid out from his tally on your remembered streets, that layout is kept as the place's, and the picture is thrown away when you leave. Trouble among them: two neighbours may fall into a feud (one at a time, the realm quiet for twenty minutes after each), which bleeds both villages and costs you opinion with both until you judge for one (+15 him, −20 the other) or pay 80 gold to reconcile them; vassals at −10 or worse band into one faction, which after three minutes demands light dues and levies (or its freedom, if those are light already) and rises if refused, its villages going free to be retaken by force; you can imprison a vassal (his villages return, the rest mind) and later pardon him, landless at your court until you grant him a village.
  - **Town templates**, from Lord, on the Towns tab: hamlet, market square, workshops and barracks quarter, placed in rings round the click and paid for whole, each with a larger size once the village has 50 to 70 people. **Work the land** places gatherers instead: two woodcutters, a quarry, a mine and two farms by the resources nearest the click that none of their kind already works; any with nothing to work is left out. While placing, a ghost shows every building of the template where it will go (creator, 2026-11-20), and the cursor says how many fit there; clicking builds exactly that layout (economy.js `planTemplate`). What won't fit shows too, as a red ghost at the nearest clear spot it tried (past your land if need be, or spread round the cursor as the template would lie when the ground is packed), and the cursor names it: "won't fit: storehouse, house ×2".
  - **Mercenary companies** ([src/world/companies.js](src/world/companies.js)): six named companies under captains wait at the market towns, fords and the crown, hired from your keep. A price up front, then wages each minute; behind with their pay they grumble at 45 s and desert at 150 s, often as bandits marching on your nearest place. A company in a village costs it 4 mood. Rivals hire them by the same rules and pay wages (Penhallow most readily); a rival's company can be bought away at twice the price. Broken or let go, a company regroups after ten minutes.
  - **Knights' hall and veterans**: villagers who fought as levies come home as veterans (a regiment that held the field gains experience by its kills). From Count, with a keep of level 3 or more, a knights' hall trains men-at-arms (8 gold, 45 s of drill each) and knights (20 gold, 75 s) only from veterans, six at a time, 24 men a hall. The barracks no longer trains them.
- **Coalitions** (2026-11-19, roadmap §6, in [src/world/diplomacy.js](src/world/diplomacy.js)), after Europa Universalis: hold 30% of the realm (or 20% while nearly twice as strong as any house) and the houses that don't like you league together: peace among themselves, war on you, their hosts aimed at your places first. It ends when you shrink below 22%, when peace leaves one member, or after 40 minutes, with 30 minutes' rest before another. Not after the crown.
- **Grudges** (2026-11-19, roadmap §4, in [src/world/diplomacy.js](src/world/diplomacy.js)): a house remembers what you did to it, by place: taken (12, fading over an hour), burned (10), beaten in the field (5), its captain killed (4), your broken word (6, on top of the old broken-promise penalty), and its father killed (30, for good). The sum, fading, comes off its opinion; its hosts prefer places you took from it; its odds against you look half again better to a sore lord; its declarations of war quote one of its two worst grudges three times in four; the house panel lists them. Saved with the house.
- **Events with choices** (2026-11-19, roadmap §7, [src/world/events.js](src/world/events.js)): every seven to twelve minutes (the first at seven) something happens at a village you run and the prompt asks what to do, with a picture from Art when there is one. Six so far: blight, fever, a wandering knight, refugees, a fair and a bandit chief's terms. Costs are in gold, food, people and spells of better or worse mood; a choice you can't afford is greyed. With nobody to ask, the plain last choice is taken.
- **Great works** (2026-11-19): works.js. `w.works = { doing, done, cathedral, sealed, blows }` is saved; mended breaches cut the road links (`seal`) and are closed again after loading (`restoreWorks`). An army's `order` refuses a place with no road to it. The cathedral is economy.js `cathedral` (`great: true`, gated by `town.greatRule`).
- **Carts on the roads** (2026-11-19): supply.js holds all three. Food wagons (`wagon.food`) drive to an army; trade caravans (`wagon.trade`, `tickTrade`) carry gold between markets and pay both lords; supply runs (`wagon.run`, `sendRun`) carry goods and families between your villages; you ask for one from the village that needs it ("Ask Brackholm for supplies", creator 2026-11-20), and the other sends half its spare. Caravans and runs drive straight to a place (`moveCaravan`). `catchWagons` hands any cart to an enemy army that meets it, unless an escort (`army.escort`, `followCart`) holds the raider off or fights it.
- **Armour levels** (2026-11-19, creator's design): see ROADMAP, "Armour levels and regiments that grow". Realm keeps the economy side in economy.js (`ARMOURS`, `POLICIES`, `outfit`, `outfitKit`, `gearOf`, `refit`), holdings.js `arm` and world.js (`armourPolicy`, `loot`, armour in `power`). One level to a regiment; the best the racks hold enough of for every man.
- **The chronicle** (2026-11-19, wish list): `world.chron(text)` records a campaign's big moments, apart from the running log; saved with the world, at most 400 lines. The book groups them by year (1200 s) and season (300 s). It is the readable memory the Claude director will build on.
- **Needs you** (2026-11-19, roadmap §3, [src/world/alerts.js](src/world/alerts.js)): one ranked list in the map's corner, after Stellaris's outliner, worked out fresh each half second so an alert clears itself. Levels: 5 a village of yours being fought in; 4 enemy columns you can see marching on you (with the time to arrival), revolts, a starving army; 3 hunger, near-revolt, wages owed, storming, a vassal refusing; 2 grumbling; 1 an army idle away from home. Only what you can see is listed. In a village the World map button shows a count of level 3 and up. A village attack warning offers Go there, Send the nearest free army, or Stay.
- **Fights left to the captain, terms and Dunmore's challenge** (2026-11-19, using the Battles hooks): a meeting on the road offers Fight it, Leave it to the captain, or Auto-resolve. Left to him, the real battle runs unseen at three times the world's pace (ai.js `unwatched()`), heads the Needs you list, and can be taken over at any moment; saving waits until it ends. A stormed walled place may ask for terms (hungry places sooner); accepted, its men march out to their lord and you keep eight in ten of its people. Dunmore (hothead) challenges whenever he is outnumbered, to settle the battle, and otherwise half the time; a captain refuses a deciding duel while he is ahead. Survivors of a failed storm and of a lost village keep their experience.
- **Captains and lords in the field** (2026-11-19, [src/world/captains.js](src/world/captains.js)): every army of twenty or more marches under a named captain, the best idle one of its house or a new man. He rides with its biggest foot regiment in field battles, gains levels and traits there and keeps a memory list; he can fall. Joined armies keep the better captain. Your lord rides with one army you choose (from one of your places); a bad wound sends him home for ten minutes, and a fall for twenty. Rival lords ride with hosts of 120 or more (Dunmore with every host but raiders); a rival lord who falls is followed by an heir, and the house mourns fifteen minutes before it sends another host. An army carrying a lord has `a.lord` = the house's index, for the map banner.
- **Rival houses** hire 60 sellswords when they have gold over 500 and are at war, at most every five minutes.
- **Buy peace** at war for 150 gold plus a quarter of their strength (at most 1000), with a ten-minute truce.
- **Opening**: rivals leave your places, and the free villages within 260 of Ashford, alone for the first 20 minutes. A goals panel at the top left of the map (`src/world/goals.js`) leads from "go to Ashford" through work, growth, arms and a first conquest to count and crown. Each step is ticked when the realm shows it done.

**Village** (`town.html`), 2026-11-18, the first point of interest:
- A keep and 12 villagers in a clearing in the woods, with stone outcrops and ore deposits around.
- Free building placement with a green or red ghost. Gatherers must be near their resource, and a ring shows their reach. Trees are cleared where you build.
- Villagers build sites, then stay on as the first workers. Gatherers walk out to trees, rocks, ore or fields and carry the goods back. Craftsmen work at their door.
- **Hauling** (2026-11-18): goods sit where they are. Gatherers stack theirs in their own yard (30 of each, then they stop). Workshops hold their inputs and what they make. The barracks holds the arms, and levies are armed only from its racks. The keep and storehouses hold anything.
  - Haulers carry one crate at a time (10 goods, 40 arrows). The keep has 2 haulers and each storehouse 3; villagers with no job haul too.
  - Order of work: materials to building sites, then inputs to workshops, then arms to the barracks, then clearing full yards and workshops into the nearest store.
  - A worker who is stuck carries for their own building: builders fetch their materials, craftsmen fetch inputs or take away what they made, gatherers clear a full yard. This is slower than having haulers, so placement and storehouses matter.
  - Building costs are set aside when you place a site, but builders can only get as far as the materials carried there.
  - Meals come out of the keep and storehouses, not from food still lying at the farms.
  - A burned building loses everything stored in it. Villagers who flee keep their crate and drop it in the keep.
  - Carried goods show as a plain wooden crate with a glimpse of the goods over the rim; stores show stacked crates by the door. Later the crate could show its contents properly.
- All the production chains above. Each workshop's recipes are switches: turn off the ones you don't want, and with several on it takes turns. Two carpenters can split planks and shields. Planks, string and iron stop at a village-wide limit; weapons, shields and arrows have none, so switch a recipe off to stop it. Workshops stop asking for wood when the village is down to 20 not set aside for building.
- Food: villagers eat; houses add room; new families settle while there is food and room.
- Barracks: call up a levy of 5–20 villagers if their kit is in that barracks. Their deaths are villagers lost. Disband returns the survivors and their kit to work.
- **Militia** (2026-11-20, the creator's idea): while one of your villages is attacked, *Muster the militia* in the stock panel calls every villager not already under arms out as soldiers, in regiments of up to 40 (battle.js `folk`, "Village militia": hp 9, atk 2, def 2, dmg 3, morale 35, no armour, `value` 0.35; their own look: a farmer in undyed clothes with a pitchfork, the side's colour only on a sash and hat band, and a pitchfork on their banner). They form up 16 m behind your soldiers nearest the attackers (behind the keep with none standing), and their place to come back to is behind the keep. When your soldiers go for the attackers they follow in one line about 18 m behind, running to catch up when they fall further back; once those soldiers are locked in a fight they pile into it, where numbers on a flank count most (not before: alone they break at once, and their rout shakes the men beside them). When the soldiers they followed stop or fall, they go back to their place behind the keep rather than stand in the field. With nobody else standing they go at whatever comes within 70 m of the keep. Your own orders come first; in a village nobody is watching, the governor's soldiers fight by themselves but the militia keep these rules. A militia that breaks throws down its tools at once and its villagers run for the keep to shelter with the rest (no regrouping), even in the last moment of an attack. Work stops while they are out. When the attack ends (or on *Stand the militia down*, or Disband on one regiment) they go back to the jobs and sites they left. The dead are villagers lost; survivors bring home no experience, so a muster never makes veterans for the knights' hall. Militia never march out, refit or leave with a fallen village's survivors: they stay as its people. The governor calls them out only when an assault (not a raid) outnumbers the men standing. A militia that beats an attack off (the attackers killed or routed, not gone with their plunder) lifts the mood: "they defended their homes", +8 fading to nothing over five minutes. There is no cooldown and no mood cost beyond the mourning for the dead (decided by the creator, 2026-11-20).
  - **Rival and free villages muster too** (creator, 2026-11-20), by the governor's rule: only when an assault (never a raid) outnumbers the garrison, and not outlaw camps or the north's strongholds. [src/world/militia.js](src/world/militia.js) `turnOut` adds the place's whole people (`p.eco.pop`, at most 160, in units of 40) to the defence as "People of …". In a fight reckoned by numbers (rival on rival, or your auto-resolve) they count at value 0.35 a head, and half of the militia the reckoning takes off are dead, the rest scattered home. When you storm the place they stand by the keep behind the garrison, and the real dead are counted. Either way the dead come off the place's people, the survivors never join its garrison, and a yielding garrison marches out without them. So a place with few guards and many people needs a host that outnumbers both. The attack ask says so before you choose ("Outnumbered, its people will take up tools too: about 25 more"), counted by the same `turnOut`.
  - Seed-7 check with rival musters (scripted, fights auto-resolved): a passive player sees the same house stages (Expanding 15–26, Contending 30–52), 15 of 34 places free at minute 30 (14 before) and the first war at minute 40 (38); by minute 60 the houses hold 22 places (24) with about 15% fewer people, after six musters. A fast player taking a free village every seven minutes from minute 6 with a host 1.5 times garrison plus militia: every attack still wins, each host comes home with about a fifth fewer men, and the villages taken hold 9–18 people instead of 15–30, so you have 436 people at minute 50 instead of 481. The houses' places and first war (minute 10) did not move. Measured on seed 7 (Ashford with 41 villagers and the retinue of 20, against 44 bandits, the retinue sent in): alone, the retinue dies to a man and three buildings burn; with the militia the raiders rout, 18 of the retinue live and one building burns, at the cost of 26 villagers (scripted, with the first version of their orders).
  - Played by hand (2026-11-21, seed 7, a test slot; screenshots sent to the question thread). Village fight, 38 raiders against the retinue of 20 and 41 villagers, Muster clicked, retinue sent in by hand, militia following: twice the raiders routed, once at the cost of 3 villagers and 10 of the retinue, once at the cost of about 27 villagers and 4 of the retinue, one building burned each time, and "they defended their homes" fired. With 24 villagers and no orders given, the retinue and militia beat 38 raiders off at the cost of 17 villagers (the militia broke) and two buildings. Storm: 60 men at Brackholm (11 guards) met 38 defenders, 27 of them "People of Brackholm" by the keep; won for one man, leaving the village 6 people (13 without the turnout, as a stormed place keeps half its people). Auto-resolve on the same place from the ask: "The people of Brackholm have turned out to defend it", won, 9 people left. `checks({quick:true})` passed on the world page during and after a muster and after the storm, and on town.html and battle.html. Not checked by hand: a vassal's village mustering, a rival's own muster seen in its town, a siege with walls. Casualties swing widely from fight to fight (3 to 27 villagers); whether that is too costly is a question for the creator and the battles session.
  - **The cost is kept, and said plainly** (orchestrator, 2026-11-21; the creator can override): the early game is meant to be brutal, and losing villagers when you give no orders is the lesson. When your village is attacked and could muster, the attack message ends "Your people will turn out. Lead them, or lose them." Every villager who falls under arms is counted by how (economy.js `fell`): with no soldiers of yours within 30 m (*fought with no soldiers beside them*), while the militia was routing (*cut down when the militia broke*), beside your soldiers, or in a levy. When the attack ends the village says it in one line, e.g. "The fight cost 7 villagers: 4 fought with no soldiers beside them, 3 were cut down when the militia broke." With nobody watching the village, the same line goes to the world's log, after the village's name.
  - **Your soldiers at home answer raiders by themselves** (QC, seed 61, 2026-11-21): a retinue stood "Steady" at the keep for 100 s while the first outlaw band burned a house, and its militia stood idle too. Now, with no order, a melee regiment of yours at home (the retinue, a garrison, hired men; not bowmen, engines or the militia) goes for raiders within 45 m of the keep or 25 m of a standing building (economy.js `thinkDefenders`), says so once ("Your soldiers go out to drive the raiders from the village. (Hold keeps them at the keep.)"), and comes back to where it stood when the attack ends. Hold keeps it at the keep, and an order of yours comes first. The militia follow it in as they follow any soldiers. No order button is needed. Seed 61, no orders, played both bands: band 1 (13 outlaws at 6:07) met at 7:15, nothing burned, one man of the retinue lost; band 2 (18 outlaws at 13:10, all 40 villagers mustered) met at 14:59 with the militia following, nothing burned and no villager lost to the fight. Seed 7, 38 raiders, no orders, 12 runs: 13 villagers lost (11–19), one building burned, the retinue lost to a man; the cost stays brutal when the retinue is left alone against a big band.
  - **Outlying buildings are defended too** (playtester round 3b, seed 91, 2026-11-21): the soldiers' 45 m / 25 m rule fired only once a band stood at a building, 90 s into a raid; a quarry and a woodcutter burned and the band got away with 161 food, 38 wood, 13 planks and 116 gold. Now `thinkDefenders` also goes for a band within 120 m of the building it has picked (`raidTarget`, set the moment it comes in), wherever that stands, so the retinue sets out within the first seconds and meets the band at or before the sheds. Seed 91 with the gatherers' sheds put 95–115 m out (old code: set out after 63 s, the hunter's lodge burned; new: set out after 3 s, nothing burned) and six runs of an 18-man band from two entries, with and without a muster: nothing burned and no villager lost, the band beaten in about 75 s. The natural first outlaw band of seed 91 (13 men): met after 3 s, nothing burned, "11 of them fell, none of ours". The retinue meets it out in the open, as the big-band runs show it can cost the retinue (seed 7, 38 raiders, no orders: it dies to a man).
  - **The retinue is not thrown away** (the Manager, 2026-11-21; seed 7: 38 raiders killed a retinue of 20 to a man): `thinkDefenders` reckons the band's strength against yours with the sum auto-resolve uses (economy.js `power`, now shared with world.js). If your soldiers alone are weaker than the band, the whole village is called out at once ("Outnumbered: the whole village is called out."), so soldiers and people go out together, the people behind. If even the two together are under four-fifths of the band, they keep to the keep (and walls) and meet it there, not in the open, until they are on the stronger side again: "Too many to meet in the open: falling back to Ashford's keep." The same line shows under Hold, which keeps its place anyway. Both lines, and the "go out" and Hold lines, also go to the world log ("Ashford: …") when you are not in the village (`onNote`). A village nobody watches no longer hands its foot soldiers to the general AI (`thinkAI` runs ahead of the militia and a retinue so sent died to a man); only bowmen, engines and a stormed place's walls still use it. Measured on seed 7, 12 runs each, no orders, 38 raiders: villagers lost median 0 (0–3) watched and 1 (0–3) unwatched, nothing burned, the retinue keeps 3–10 of 20 (before: 13 lost, one building burned, the retinue dead). 60 raiders (8 runs): 25 villagers lost (21–30), 2–3 buildings burned, the retinue dead (old code: 23, 0–1 burned). 80 raiders (8 runs): 22 lost, 3 burned, the retinue dead (old code: 23, 3 burned). A band that large beats the village either way; falling back did not make it better. Played by hand on seed 7 with 38 raiders: nothing burned, no villager lost, the retinue 20 to 8. A second 38-raider raid straight after, with the village unwatched and the retinue down to 9: the lines reached the world log, but 26 villagers were lost and two buildings burned (the retinue and people together were weaker than the band); it is a weakened village, not the 20-man case above.
  - **Hold says so** (QC, 2026-11-21): soldiers you ordered to Hold stand and watch raiders burn the village, as ordered; with a retinue on Hold a house burned and nothing was said. Now, once per attack, the village says it: "Your retinue holds its ground (Hold) while raiders burn the house to the west." (economy.js `thinkDefenders`, `holdSaid`). Played on seed 91 with the retinue on Hold and no other order: the line came once, a house burned, the outlaws got away with 13 wood and 53 gold ("nobody fell").
  - **The outcome line reads plainly** (the same round): "(0 of them dead, none of ours)" is now "nobody fell" when it cost nothing, else "13 of them fell, 2 of ours" or "none of them fell, 3 of ours" (world.js `toll`, for a band beaten off at a village, one that got away with plunder, or one beaten in the field).
  - **A band in the woods could not be ordered at** (the same QC): raiders with 60% of their men in trees and no foe of yours within 30 m are hidden from you (battle.js `updateSight`), so their banner is not drawn, a right-click on where it was sets no target, and idle soldiers do not answer them. That is right for an ambush in the field, wrong in your own village. A new `openGround` (the keep and 100 m round it, set by `receiveAttack`) keeps raiders on the village's land seen. A check, "raiders on the village's land are never hidden", fails without it. The militia take an attack order by right-click as ever (played by hand: a band of 16 in forced woods 80 m out, militia selected, right-click on its banner, target set).
  - After review (2026-11-21, seed 7). **The 3-to-27 swing was where the militia stood.** Formed 16 m in front of the keep, they met the raiders before the retinue whenever it held back or set off late: in 8 scripted fights with no orders they were hit first every time and lost a median of 26 villagers (23–31); with the retinue sent at once they trailed it by 23–27 m and lost 12 (5–21). Combat luck adds the rest. Now they form behind the soldiers and follow 18 m behind. Medians (villagers lost, over 8 to 16 fights each, on this code before and after the latest main): retinue sent at once 3 to 5 (1–9), sent when the raiders were 60 m out 5 (2–13), the village left to its governor 2 to 5 (0–6, nothing burned), and no orders 3 to 10 (0–26): left to hold the keep, the retinue nearly always dies, and how many villagers follow it is mostly luck. The militia were never hit first. Also fixed: a militia that broke as the attack ended stayed soldiers, so a save made at once dropped them (now they are sent home on the next second's think, before anything else, and every militia is home the moment the attack ends); a governor-run village's soldier AI ordered the militia about with its own regiments; followers stacked on one spot (now one move order for all); militia whose soldiers stopped were left standing in the field. Two checks guard this: no Muster or Stand down button at peace, and every soldier villager in a living, non-routing regiment at peace (both fail on the previous code).
  - Played by hand after review (seed 7, test slot). An assault of 44 on Ashford: Muster clicked, the retinue sent in by hand, the raiders routed; the 1st militia was made to break as they did, and 17 villagers ran for the keep within a second. Saved the moment the attack ended and reloaded: 37 people before and after, the standing militia laid down their tools on load, and `checks()` passed. A raid of 38 on Ashford, mustered and then left for the world map: the governor's retinue went in 100 m out and routed them, the militia followed and never had to fight, no villagers lost, the militia home at once when it ended. In an earlier run of the same, with a retinue of 5 left from the last fight, the retinue fell and the militia (then still allowed to go at anything within 30 m of themselves) fought on 100 m out and lost 22; that is what the 70 m-from-the-keep rule and the place behind the keep fix. Storming a rival needs no save fix: its militia are a head count, and saving waits for the fight to end.
- Bandit raids from 5:00, growing with each wave (archers from wave 3). Villagers flee to the keep. Raiders burn what they reach and leave after three fires or about 2½ minutes. If the keep falls, the game is lost.
- The lord's retinue of 20 swordsmen costs no villagers. You can send it to work: the men become villagers and their 20 swords and shields go to the nearest barracks (or the keep), so a barracks can arm them again as a levy.

**Sound** (`src/audio.js`, `assets/audio/`), 2026-11-19:
- Free music and sound, all CC0 or CC-BY, about 17 MB. Every file's source, author and licence is in [assets/audio/CREDITS.md](assets/audio/CREDITS.md), shown with the Quaternius models on `credits.html` (linked from the menu, each page's help and the sound panel).
- Music crossfades by mood: building (four tracks in turn), tense when raiders or an enemy are about, battle, siege (an assault on a keep), victory and defeat stingers, and the world map. Most tracks are RandomMind's CC0 medieval series; Kevin MacLeod's CC-BY tracks fill the gaps.
- Effects are heard from the camera: quieter with distance and zoom, panned left and right. Clashes, bows and arrow hits come straight from the battle; war cries when a regiment closes, a scream when one routs; chopping, picking, hammering, crates and a finished-building chime from the village; horn and drums when raiders come or a levy is raised; fire when raiders burn a building. Beds for village, forest, wind, battle din, marching feet and fire are mixed by what is on screen.
- At most 24 sounds at once, and a few of each kind; a louder sound replaces the quietest. Villages you are not watching stay silent.
- Second pass, 2026-11-20 (about 19 MB in all): sieges sound boiling oil, sappers digging and mines collapsing, a burnt bridge falling into the river, and a parley horn when a duel or terms are offered. Duels gasp at the challenge and cheer at the deciding blow; a lord rides in to a fanfare and a neigh. Dogs bark, Norrhold axes thud on shields and javelins whoosh instead of bows. Beds for cavalry gallop, armour clinking by how heavy it is, wading at fords, and rain, fog, night and the winter blizzard. The realm: coins for hiring, buying and caravans, a cart setting out, a wax seal for decrees, a quill for spy reports, scroll for choices and works, bells for great works, the cathedral and victory, a drum boom for wars, factions and coalitions, an angry mob for revolts and unpaid mercenaries walking out, and a feast in the village. The realm's sounds go through `world.hooks.sound`, so the world files stay free of audio.
- Third pass, 2026-11-21: orders and charges are heard (grunts and armour, a yell over a crowd), blows add three more hits to the clash, a building site passing a third of its work thunks, panels turn a page and close like a book, unlocks chime, greyed buttons knock, petitions close a door. Rank-ups and titles reuse the fanfare (with the horn for a rank); the coronation is a choir swell with bells after it; a seat changing hands is a slowed bell toll under a low drum; outlaws sound a low horn, a siege's end the parley horn and a cheer; the militia's muster is a bell and a crowd. Beds: men running (the march sped up), swimming, birds over a village and a breezy map. The village has its own small sounds, placed at the building that makes them: saws at carpenters and bowyers, hammer and anvil at smiths, a mill wheel, farm animals and a rooster by day, the chapel bell, thunder in rain. Beyond a name, `audio.js` warns once on a missing file or sound, `audio.status()` counts plays dropped, and `then:` layers a sound after another. Tools to rebuild the files are in `tools/audio/` (they need ffmpeg and numpy). The `lastPlayed` default was -9 s, which silently dropped any sound with a gap over 9 s on its first play after load; it is now far in the past.
- Fourth pass, 2026-11-21: the Freesound CC0 sounds and the rest of the scout's are in. Trebuchets and catapults (the engine's own shot), a ram's strike (splintering wood over the gate), every man who falls, more sword and shield clashes, a second charge shout, more horse sounds, a pig, a second thunder. A big battle adds the battlefield loop under the din; winter marching adds snow steps; a market has its street bed; children by day. **The hour** (`hour()` in audio.js, from look.js `dayOf` on the campaign clock): crickets and an owl fade in with dusk (a distant owl calls now and then in a village), birdsong and the village bed fade out, the village goes quieter after dusk, a rooster crows once at dawn and the birds swell then. The map's night bed and the birds follow the same hour. Test pages with no campaign clock stay at noon. Left unwired because the game has no such event: ballista loading, tree falling and creaking, the well bucket, sea waves, light rain, a chainmail step. Levels are by the numbers only; nobody has listened.
- 🔊 in the top bar: master, music and effects volume and mute, remembered in the browser. Sound starts on the first click.
- Hooks in other files are one line each and marked `// audio`. `audio.status()` in the console shows what is playing.

**Battle test** (`battle.html`), 2026-11-18:
- 9 regiments a side (spears, swords, archers, cavalry), about 1,200 soldiers, with a keep and village at each side's end of the field.
- Total War–style orders: box select, right-click to move or attack, right-drag to draw a front line. You can pause and still give orders.
- Selection: a box catches a regiment by its banner or any of its men; Shift, Ctrl or ⌘ adds or takes away; a double-click selects every regiment of that kind on screen. Ctrl+1–9 makes a control group (its number shows on the cards), 1–9 selects it and twice looks at it. − / + step the game speed; the screen edge pans like WASD. A storm's deploy countdown runs in real seconds whatever the speed. At a wall or gate only the front rank strikes, so a palisade gate takes two regiments about 12 s.
- Melee between individual soldiers; arcing arrows that can hit your own men; cavalry charges that braced spears stop from the front.
- Morale, flank and rear hits, and routs. Routers can rally once in the field; otherwise they run to their keep, regroup and come back under orders.
- Strategic zoom with banners that stay a fixed size on screen.
- URL options: `?seed=123` for a fixed map, `?scale=4` for four lines a side.

**Walls, sieges and the new army** (battles workstream), 2026-11-19:
- **Walls**: palisades and stone walls, towers and gates, each stretch with its own hp. In a village the Defences panel lets you drag out a wall, click towers and gates onto it, rebuild broken stretches, cut a gate into a wall or pull a stretch down for part of its cost. Walls are paid for when placed, and masons build them over time (more masons as the village grows). Villagers and your men pass your own gates; enemies have to break in.
- **On the walls**: right-click your own wall to man it. Men climb up by towers and gates. Archers shoot further from walls and furthest from towers, merlons stop many arrows, and men on the wall beat climbers and anyone hacking at the wall below.
- **Breaking in**: rams on gates, ladders on quiet stretches (defenders push them down), mangonels and trebuchets throwing stones that also hit buildings, and axes on palisades. A gate is forced open by attackers who get inside, and retaken by its owners.
- **Orders at walls with no way in** (2026-11-21, playtest round 2): an attack on men behind shut gates, a move to a spot inside enemy walls, or a Charge all send foot to break the nearest gate they can reach first (one gate for the whole order, so nobody breaks through alone), then carry on; each says so. Charge with nobody ahead takes the nearest foe within 160 m, or says nobody is near enough. The attack prompt's blue default follows its odds (world.autoOdds): Auto-resolve when likely to win (0.65 or better), Pull back when likely to fail (under 0.35), else Storm it. An AI storm with no ram, ladders or throwers re-staffs a mine whose diggers were called off, and takes axes to a stone gate after two mines are broken into.
- **New units**: crossbowmen, light and heavy cavalry, men-at-arms, knights, sellswords and hired crossbows (paid in gold), and household men. Each has a role, the kit it needs and a cost in goods for engines.
- **Captains**: one named captain per army rides with a regiment, giving a small bonus to morale and fighting. He gains levels over battles and can fall.
- **Orders bar**: formations (line, tight, loose, wedge, schiltron) on N/T/L/V/X, Charge (C), Hold (G) and Fire at will (R).
- **AI**: attackers camp, bring up engines, ladder where the walls are thin and storm once there is a way in. Defenders man the walls facing them, answer ladders and sally against engines. Siege hosts that attack your village do the same.
- `battle.html?mode=siege` storms a stone fort; `?mode=defend` holds one. At `?scale=4`, about 5,000 soldiers run at 5–7 ms a step.

**Terrain matters in battle** (battles workstream), 2026-11-19, roadmap section 5:
- **High ground**: fighting uphill is harder and a downhill charge hits harder; archers reach up to 30% further from above and 15% less from below. A holding AI army first takes the best rise near it.
- **Woods**: copses stand in the open ground between the armies. A regiment mostly inside one, with no enemy within 30 m, is hidden from the other side until it fights or shoots; the first blows from hiding are an ambush (a morale shock and better hits). Trees slow foot, slow horse badly, break formations and blunt charges.
- **Rivers**: about half of test fields and two in five campaign field battles have one. Deep water is very slow and a bad place to fight; fords are shallow; a wooden bridge crosses dry. Regiments march to the best crossing in formation (see *Gaps* below), unless it is more than ten river-widths (about 70 m) out of their way: then they swim straight over, slowly and badly placed if caught in the water, and the regiment's card reads Swimming (the Orchestrator's ruling, 2026-11-21). To make them use a crossing, order them to it first (riverWay in battle.js). A river with no ford or bridge left is swum, and the game says so. Otherwise nobody steps or is shoved off a bank, ford or bridge into the deep channel, chasing a foe or in the crush of a fight: he slides along the bank or holds at the edge (routers aside). Orders to a spot in the water are moved onto the bank (keepDry). Burn bridge (B, or the orders bar) sets one alight from your bank; it falls in about 40 s.
- **Gaps** (decided 2026-11-20, the creator: "regiments should be more dynamic"): a regiment keeps its formation all the way to a gate, breach or bridge, never forming a column when ordered. At a gap narrower than its front, only the men who don't fit change step: the files that fit walk straight through, the outer files of that rank fall in behind them (middle men first), and the ranks behind stand in their files and step up a rank at a time. Each man past the gap steps out to the side, along the far face or bank, until his place is clear of it, so the block fills out again from the front; the front walks on only as fast as the gap lets men through. Own gates are open to their own side in the path grid (the gate posts used to close the door entirely).
- **Fatigue**: fighting, charging and running tire a regiment (about 30 s of hard fighting spends it); standing still it recovers. Tired men walk slower, hit and guard worse and charge weaker, so fresh reserves win. Cards show Tiring, Tired or Exhausted.
- **Limited arrows**: about two minutes of shooting (24 arrows, 16 bolts a man). Empty bowmen refill at camp or, slowly, on their own walls; the AI sends its empty bowmen back. Cards count arrows.
- **Deployment**: field battles and storming a fort open with time stopped and your ground lit gold; right-click sets regiments down at once anywhere on it, then Begin battle (Enter). `?deploy=0` skips it.
- **Weather**: about 60% clear, 25% rain, 15% fog, the same for both sides. Rain: bows reach a fifth less and miss more, and heavy ground slows horse. Fog: no one sees past 70 m. `?weather=` picks one in the battle test.

**Wish-list battles** (battles workstream), 2026-11-19:
- **Veterans**: regiments carry `xp` and a rank (Green, Blooded, Seasoned, Veteran): one good battle bloods men, about three season them. Each rank hits a little better, holds longer and tires slower. Campaign armies keep it between battles.
- **Your lord in person**: `setLord()` puts a lord (or a lady, with her own model) in the field. His army fights and holds a little better, more so near him; if he falls, every regiment is shaken.
- **Sieges**: men on gates and towers pour boiling oil; foot dig mines (U) that bring a stretch down, and defenders who hear one counter-mine it; night (`?weather=night`) hides armies past 45 m and emboldens sallies; a beaten garrison asks for terms; a starving one (`setHunger`) breaks sooner. The siege AI digs and counter-mines too.
- **Champion duels**: a challenge you can accept or refuse; lords, captains or a champion fight in the open while the armies watch, and the result shakes or lifts each army, or settles the battle.
- **Norrhold's host** for Part 2: axemen who break shield walls, javelin men with four heavy javelins, and war dogs. About even with an equal southern host. `?enemy=norrhold`.
- **For Realm**: `unwatched()` runs a fight under its captain or garrison in slices; captains earn traits in battle (steady under arrows, stubborn, reckless in the charge, a hard killer, quick to fall back, hated by a house) and keep a memory list.

## The full game (decided 2026-11-18)

The creator answered the big design questions for building the full game in one long push. These answers lead; anything left open is Claude's call.

### The hook

**One living realm.** Every village is a real place that keeps running whether you watch it or not, every soldier is one of its villagers, and the map, the town and the battle are one game with no loading screens. Only the place you are looking at is drawn; the rest run as cheap simulation. **Your attention is the scarce resource**: while you hold Ashford's walls by hand, your other villages carry on without you.

Second: **sieges with grandeur**. Wars build up: scouts and raiding parties first, skirmishes over villages and supply, and then the great army arrives and lays siege. Skirmishing early should pay (weaken their supply, kill their raiders, burn their camp) so the siege is not just a wall of men.

Third: **named rival lords** with traits and taunts.

### The feeling to build toward

**From village mayor to king.** You start hands-on, like Age of Empires: placing every hut in one clearing and arming your first 30–50 spearmen. You finish as a king: your people strong and wealthy, a city you built, armies in the thousands, and your enemies beaten. Each step up must feel bigger and crunchier, never just more clicking.

**The scale ladder.** Every rank changes what you handle by hand and how big things get:

| Rank | You hold | Your armies | What you do by hand |
|---|---|---|---|
| Reeve | One village | 30–50 men, a few regiments | Place every building, raise each levy |
| Lord | 2–4 places | 100–200 | Your seat by hand; other villages run themselves; the first wars |
| Count | 5–10 | Several hundred, a captain per army | Order levies raised across villages in one go; field armies |
| Duke | 10–20 | 1,000+, bigger regiments | Plan campaigns and sieges; zoom in for the battles that matter |
| King | Most of the realm | Thousands, several armies | Command the realm; the city is your showpiece |

The tools grow with the rank: regiments get bigger, levies can be called from many villages at once to a muster point, captains run armies you don't watch, and the battle view draws thousands (full detail near the camera only).

**Part 2.** Uniting the realm is not the end. The victory screen cracks and falls apart: the land beyond the edge of the map opens, and a great foreign power invades. Part 2 is a war, not a unification. The invaders can't be bargained with (no diplomacy), they raid hard and bring huge hosts, and you meet them with everything you built.

### Decisions

| Topic | Decision |
|---|---|
| Campaign | One map of 25–40 places, 4–6 rival houses, 6–15 hours. A sandbox with a light tutorial opening. |
| Winning | Be crowned: hold the royal seat and most of the realm, **or win by diplomacy** when enough houses back your claim (friendship, a marriage alliance, or being far stronger and liked). |
| Ending | After the victory screen, pressing Next shatters it and Part 2 begins (see above). |
| Tone | Grounded medieval, stylised look, no magic. |
| Sieges | Stronghold style: free-placed walls, towers and gates; ladders, rams, catapults and trebuchets; defenders fight from the walls. The pack's first keep model reads as a fort, not your main keep. |
| Supply | Simple: armies carry **food**. Wagons bring more from your villages; starving armies desert. Wounded men recover with food and rest. |
| Money | Gold from taxes and markets. Most things cost goods; gold comes in for upgrades, mercenaries, retinues, elite pay, market goods, feasts, great keeps, stone walls and masons, and diplomacy. Nothing buys power directly (no buying men from free villages, faster building or bribed garrisons). |
| Mood | Each village has a mood from food variety, housing, taxes and war losses; mood drives growth. |
| Rivals | Real factions on the same rules (taxes included), simulated cheaply when unwatched. About six named lords with traits and taunts (builder, raider, turtler, schemer…). Stronger than you at the start, then three stages: Settling, Expanding, Contending (see below). |
| Diplomacy | War, truce, peace, alliance, tribute, vassals and **marriage alliances**. |
| Threats | Bandit camps early, rebellions when mood is low, the invasion at the end. |
| Fog of war | Yes, on the world map and in towns. Scouts and watchtowers reveal. |
| Places | About six kinds, each with a speciality: village, castle, mine, ford, monastery, market town. Army camps can grow into holdings. |
| Chains | Add gold and markets, leather and armour, horses, bread and a siege workshop. Elite units take long chains: ore → iron → mail → armour for knights. |
| Upgrades | Buildings level up with the village's population and gold. |
| Unwatched villages | No standing orders: a governor quietly keeps producing and building sensibly. |
| Battles | Levy spears, swordsmen, archers, crossbows, light and heavy cavalry, men-at-arms, knights, siege engines; retinues and mercenaries as elites. One named captain per army who levels up and can die. Formations, charge, hold, fire at will. Up to about 2,000 on screen. Ways to queue and raise troops at scale. |
| Art | The Quaternius picks everywhere; Codex for portraits, heraldry, a painted world map and UI while it is available. |
| Audio | Free music and sound (CC0 or attribution) with a credits screen. |
| Platform | Desktop browser. Not shareable yet (no GitHub Pages). |
| Spending | Never spend money. Free assets may be downloaded freely. |
| Testing | Other Claude models do quick playtests and give their thoughts; no big balance sweeps. |
| Parked | Seasons and winter. A **Claude director**: later, with an API key, Claude occasionally reads a simplified summary of the game and turns a few dials (a rival's mood, an event, an invasion's timing). Build the game so its state can be summarised and those dials exist. |

### Workstreams and who owns which files

Several sessions build this at once. Each owns its files; small hooks into another's file are fine, but keep them small and pull before pushing. Everyone commits to `main` in small, playable steps.

| Workstream | Owns |
|---|---|
| **Realm** (world, rivals, diplomacy, supply, villages' economy, campaign UI) | `src/world/world.js`, new `src/world/*` logic files, `src/economy.js`, `src/townhud.js`, `src/campaign.js`, `world.html` |
| **Battles and sieges** (walls, gates, towers, siege engines, new units, captains, formations) | `src/battle.js`, `src/ai.js`, `src/controls.js`, `src/hud.js`, new siege and wall files, `battle.html` |
| **Art** (models, the look, Codex briefs) | `assets/`, `tools/`, `src/models.js`, `src/view.js`, `src/townview.js`, `src/world/worldview.js`, `src/stage.js`, `src/terrain.js` |
| **Audio** | `src/audio.js`, `assets/audio/`, the credits screen |

### Order of work (Realm)

1. A generated realm of 25–40 places of six kinds, 4–6 houses with named lords, fog of war.
2. Rival houses that hold real villages and wage wars that build up: scouts, raids, skirmishes, then a siege army.
3. Diplomacy with relations, marriage and the diplomatic win; the shattering ending and invasion.
4. Food supply, wagons, desertion and wounded.
5. Village mood, gold, markets, the new chains, building levels and the governor.
6. Saves, the tutorial opening, and Claude playtests after each step.

## Side project

A simpler, high-level strategy game in the vein of War of Dots or Line Battle: armies as tokens on a map, fronts and supply. It is an original design built in parallel, in `fronts/`. **This deeper game takes precedence.**

**Marchfront** (built 2026-11-18) lives in [`fronts/`](fronts/) and is playable: one map (the Sundered Vale), one AI opponent with three difficulties, pause and speed controls, and a win by taking the enemy capital. Armies claim land as they move, supply runs from the capital through held land, towns have garrisons, and terrain and digging in shape every fight. Plain JavaScript and Canvas 2D, no build step. Rules, AI, controls and test notes are in [fronts/NOTES.md](fronts/NOTES.md). Ideas from it that may carry over here: supply as connected held land, and armies painting a front as they move.

## Playtest fixes (2026-11-19, from the full seed-7 campaign)

- Levies are still villagers, but the headers now say so: "17 at work · 76 under arms", and the world panel counts soldiers with how many of them are levies. A keep never shrinks back when levies march out (town.keepPeak).
- Mustering a garrison with no spare food is a loud warning, and the Muster button says how long the food will last.
- While you command a fight (in a village or in the field) and for five seconds after it ends, events, news and houses' proposals wait; alarms and road encounters still come (2026-11-21: a capture is no longer buried under the next event). Houses' proposals are at least two minutes apart across the realm; one house demands tribute at most every 30 minutes, and never within 15 minutes of making peace with you.
- A new vassal brings a household (12 men, plus one for every eight people, up to 30) when you leave too few to hold the place, and the grant buttons warn when an enemy is already marching on it.
- Governors put up a barracks from 40 people (they still never raise men), and find work for idle hands: woodcutters, a quarry, hunters, then farms.
- Shields stop at 60 in store by default; other arms have no limit.
- Hiring a bandit band always costs more than paying it off. A company is offered at the wage it will draw once hired at full strength.
- A place's name label on the map can be clicked and right-clicked like the place; the label you point at wins over a neighbour's model nearer the cursor (2026-11-21). A drag whose mouseup is swallowed no longer leaves the map following the mouse.
- Messages have two places, each said once (2026-11-21): the line at the top is news (the chronicle's latest), the toast at the bottom answers what you just clicked. A news line the toast is already saying is left out. Finished goals wait out a fight and its calm like events, then come one at a time (Orchestrator, 2026-11-21). The map's top bar never keeps a fight's "men standing" line once you are back on the map (a check in checks() watches for it).
- Small windows (QC, 2026-11-21): below 1200×720 the panels shrink to 85% and the top bar packs tighter, below 800×600 to 70% (CSS zoom, one rule in style.css); the 3D view and its labels keep their size so clicks land where you point. When the panels shrink the top bar packs tighter (the battle numbers wrap, help shows as "?") and the battle's deploy bar wraps under it. checks() fails if the top bar has to scroll.
- Playtest round 1 fixes (Orchestrator's list, 2026-11-21): Space pauses and resumes even after a toolbar button was clicked (the focused button no longer presses itself again). A building in hand that can't stand where the cursor is says why beside the cursor. A quarry, mine or lodge with nothing left to work frees its workers to find other work, says so once, and reads "worked out: move it or pull it down"; nobody is sent back until there is something to work (game breeds back). In Needs you a hungry village is at the top, with why: mouths against working food places, and how many are worked out or unmanned.
- The Storm prompt warns when the place is walled and the army brings no ladders, ram or engines.
- In a storm, ladders, rams and engines ordered onto an enemy wall go for the wall, even with its defenders standing on it.

## Walking pace (decided 2026-11-21: "B: walk and run")

The creator chose option B after seeing all three in the viewer. It replaces option A (units jogging at the game's paces).
- **Walk by default.** Normal movement is a walk, about 1.5–1.8 m/s for villagers and for soldiers in formation, so the walk clips plant their feet.
- **When units run.** Running is for charging, fleeing and routing, and for a Run order: double-click a move target, or the Run toggle on the orders bar (with its key shown). Running tires a regiment through the existing fatigue rule.
- **Roads.** Roads keep their speed bonus: villagers on a paved road walk briskly or jog, so roads matter more.
- **One place.** The paces live in anim.js and Art's pace table, and gaits still come from measured strides.
- **Tempo doesn't halve.**
  - The economy keeps its 2.5-minute farm timing and growth targets by adjusting work and carry amounts, not walking speed.
  - **As built** (economy.js, 2026-11-21): villagers walk at 1.6 m/s instead of 3.4, so each trip brings back more. A trip yields wood 4 (was 2), stone 3 in 6 s (2 in 8), ore 4 in 8 s (2 in 9), a hunt 6 food, 4 feathers and 2 hides (3, 2, 1) and takes 24% of a patch's game (12%), a farm 4 food in 8 s (3 in 10), flax 3 (2). A hauler's crate holds 20 (10). Measured on a scripted 25-minute opening, seeds 7 and 3, against the old walk: each worker brings in 98–100% of the old wood, 105% of the food from farms, 94–108% from hunting, 87–101% of the stone and 104% of the ore; the village reaches 40–42 people (42 before), with the same wood (987–1189 against 1032–1206), stone and ore. Rivals' and stewards' places count no walking, so they keep the old yields (holdings.js `OLD_YIELD`): ten minutes of six places on seed 7 match the old build to the unit.
  - Battles re-checks march-to-contact times and the storm countdown.
  - World-map travel times don't change; only the figures' animation follows.
- **Battles, as built** (battle.js `running` / `gaitPace`, 2026-11-21): a regiment walks at its pace-table walk (1.6 m/s on foot until Art's pace.js lands) and runs at its full speed when it's told to Run (the Run toggle, Z), when the order was a double right-click (that order only; the next plain order walks), and when it charges, routs or closes within 30 m of the regiment it's attacking. Men behind their place still catch up faster. Running costs the old march fatigue; walking costs almost none. The AI runs its attacks, its advance from beyond 110 m, its horse, a fog feel-forward far from the enemy, and a storm. Tempo against the old jog (AI on both sides): open field, first contact 18.5 s against 18; fog, the same; storm, the first blow on the gate at 17 s and first contact 24.6 s against 24.7, half the army fighting at 53 s against 41. The storm countdown is real seconds whatever the speed and doesn't change.
- **Done means** the village, a field battle, a storm and Muster are played by hand in a visible pane, with no skating at ½×, 1× and 4×, and checks() clean.

## Rivals' pace and gold (decided 2026-11-19)

The creator: rivals start stronger than you but take a slow road to conquest, and grow more aggressive until they play to win from where they stand; you close the gap, then get attacked. Gold should matter, but nothing should buy power outright.

- **Start**: each house begins with 40–80 men against your 20 (seats 32, other places about 14; down from 120–145). A settling house keeps half the usual men at home and at most about 30 in the field.
- **Stages** (rivals.js `STAGES`, `climb`), per house, never going back:
  - **Settling** (to about minute 20): builds up, clears outlaw camps, takes one free village next door (within a short march), declares no wars, and hires no companies. If already at war with you it only raids.
  - **Expanding** (to about minute 40): free villages further out, one every fifteen minutes or so; one war at a time, on the weakest neighbour; an enemy's place only where it is weakly held (a quarter of the house's strength), never a seat or Kingsbridge. Elsewhere it skirmishes with raiders.
  - **Contending** (from about minute 40): the old full behaviour, plus it goes for whoever leads the realm (you or a house), pushes for Kingsbridge, and only contending houses join a coalition against you.
- **Pace**: Dunmore and Varn move up a quarter sooner, Carrow and Stonemere 30% later. The title page's Rivals option scales the stages (Gentle 1.35×, Fierce 0.7×) and no longer changes how often houses raid or how big their hosts are.
- **Your growth moves them up**: after the first six minutes, a house whose strength you reach three quarters of moves to Expanding, and one you match moves to Contending. A fast player draws the fight sooner; a slow one gets more time but falls behind.
- **Rival tax**: rivals tax as you do at fair taxes (0.012 gold a person a second; merchants 1.5×), and the northern host too. The 0.004 rate is gone.
- **Gold sinks** (all on the campaign):
  - **Elite pay** (treasury.js): men-at-arms 0.6 gold a man a minute, knights 1.5, wherever they stand, for you and the rivals alike. Unpaid for 45 s they grumble; after 150 s a company stands down every 30 s, the smallest first. A rival house drills any of its men in its hall (not only veterans) once it is expanding and has 600 gold, and its hall holds 24 elites for every two places it holds.
  - **Market goods** (treasury.js `WARES`): a market town you hold or are at peace with sells 10 iron (80), 5 horses (150), 40 grain (60), 5 mail (160) or 5 swords (70). Each lot you buy there raises its price by 15%, settling back about 9% of the base a minute. A cart takes the goods to your nearest village and can be robbed. Rival houses buy there too, for their own stores, at the going price.
  - **Feasts** (economy.js `FEAST`): 2 gold a villager (at least 60) for +15 mood for five minutes, once every ten minutes.
  - **Great keeps** (economy.js `KEEP_RAISE`): the keep grows to level 3 with the village; level 4 (100 people, 500 gold, 80 stone, 30 planks) and 5 (150 people, 1,200 gold, 160 stone, 40 planks, 10 iron) are raised for gold, each with homes for 10 and +4 mood. Older saves keep the keeps they had; a captured place keeps its lord's.
  - **Stone walls cost gold** (walls.js `WALL_COSTS`): 10 gold a stretch, 30 a tower, 15 a gate, for the masons. **Hired masons** (80 gold, three minutes; Defences panel) double the crews and mend damaged walls and towers while no one is fighting.
  - **Diplomacy**: a marriage dowry grows with the house's strength (150 plus half its strength, to the nearest 50), and goes to the bride's house. A coalition can be bought off whole for three quarters of what buying peace from each member would cost, with the usual truce.
- **Seed-7 check (scripted runs, rival attacks resolved automatically)**:
  - Start: each house 52–63 men (strength 63–93) against your 20 (54).
  - A passive player (only the governor in Ashford): 13–14 of 34 places still free or outlaw-held at minute 30 (the old playtest had 6 by minute 37). Houses reach Expanding at 15–30 minutes and Contending at 37–60; the first war on you came at minute 40–51 and the first host at 55. Rival treasuries stood at 3–7k by minute 60 (the merchant house 13.5k), each house's elites drawing 22–28 gold a minute.
  - A fast scripted player (a free village every seven minutes from minute 6, with 20 men each): you pass every house by minute 15–20, so they move up early (Expanding by minute 10, Contending by 10–30); Varn declared war at minute 15, Penhallow at 38, and Varn gathered a host against you at 44. With a village every four minutes, every house was at war with you by minute 40 and hosts marched on your places from minute 50.
  - Still open: rival gold still builds up slowly (taxes at your rate outrun what they spend), and in the fast run the houses mostly skirmished you rather than send hosts until you held a large share of the realm.

## The early economy as a budget (built 2026-11-20)

The creator, after playing: the opening ran in a straight line to weapons and nothing pushed back. Now it is a budget of wood and people between woodcutters, houses, farms and new capability. The 14 approved items, as built (economy.js unless named):

- **Start** (`START_STOCK`): 60 wood, 12 stone, 60 food, 12 people (was 140 wood).
- **Food first**: hunting grounds are 40 m cells (`GAME`); each hunt takes 24% of a cell (12% before pace B, when a hunt brought back half as much), which breeds back over about 25 minutes, so the game near the village runs out. A hunter says how much game is in reach. A new farm brings in its first crop after 2½ minutes (flax 2), with its workers tending the field meanwhile; a farm yields 4 food a trip (3 before pace B).
- **People are the limit**: newcomers settle while the larder holds more than a meal a head (full speed at four), the village is content and its name is good (`settleRate`): about 1.2 a minute at best, as working adults. Houses only set the room. The stock panel says how fast newcomers come, or why none do, and hovering says why.
- **Name** (`REPUTE`): a chapel +0.4, a market +0.25, a well +0.15, ten quiet minutes +0.2; a raid in the last five minutes −0.4, cold hearths −0.3.
- **Firewood**: every hearth (the keep and each house) burns 1.5 wood a minute. Without it the hearths go cold: −12 mood and a worse name.
- **Settlers asking to stay** (events.js): from minute 5, then every 6–9 minutes, refugees (5–8; or take the strongest half, −3 mood), masons (3–4, with 25 stone) or foresters (3–4, with 30 wood). Only with room for them.
- **Upgrades add work places** (`UPGRADES`, `SPEED`): level 2 (15 stone, 10 planks) and level 3 (100 gold, 10 iron, 10 planks). Jobs grow with the level (two and three times the places; haulers one more a level), and each level works faster (×1.15, ×1.3), so a level 2 woodcutter out-produces two level 1s. Houses and wells don't upgrade. − / + on a building sets how many work there.
- **Paved roads** (`ROAD`, roadview.js): pick Paved road on the Village tab, click where it starts and where it ends; it carries on from there until Esc. 3 m wide, 1 stone per 3 m, up to 40 m a stretch, inside your land and clear of buildings. Anyone walking on it goes 1.5× as fast, and walkers seek roads out (roadnet.js, creator 2026-11-20): a road counts as shorter by its speed, so a walker steps onto it, follows it through junctions and crossings and steps off when that beats walking straight, and otherwise cuts across. The road network and its distances are worked out when a road is laid or lifted; each walker plans once a leg (about 0.2 ms with 48 stretches). In a test, haulers between a woodcutter and the keep walked a road laid 7 m off their straight line. Shift-click lifts a road for half its stone. The look is a plain stone strip for Art to dress (townview is Art's).
- **Deposits run out**: stone outcrops hold 500 (rich) or 220 (poor), ore deposits 320 or 140; about a third are rich (most, in mining villages). Hovering one says what is left; placing a quarry or mine says what is in reach. A worked-out deposit is gone.
- **Smarter hauling** (creator's playtest, 2026-11-20): a building site short of a fraction (firewood leaves broken logs in store, and a crate can come up short) still gets its last crate; it used to wait for ever at "9/10". Only food and bread are carried to the stores as they come, for the meals; other goods stay in the yard where they were made until it is 60% full (the creator: haul "unless they are in danger of filling up"). Workshops, building sites, the hearths' firewood and the cost of new buildings all draw straight from yards, never from building sites. The town panel says "without a job" rather than "idle": people without a job carry crates. A part-crate for a site is carried even when the store has less than a whole one. Walkers leave a road that runs through a wall (not a gate) and go the plain way: following it meant walking to the wall, round by the gate and back to the road. Checked with roads, without, and with a walled ring and one gate: every trip finished, none stood still. Walkers also step round any building in their way (economy.js `around`) rather than through it, the keep included; a farm's field is walked round too, except by its own workers. Two checks guard this (checks.js): no walker's road runs through a wall, and nobody inside a building.
- **Bottlenecks** (townlabels.js): a building stuck for six seconds says why above it ("No workers", "Waiting for planks", "Game hunted out"…).
- **Speed**: ½×, 1×, 2×, 4×.
- **A safe opening**: the first log line says the great houses are still settling their own lands, and the goals say while every house is still settling (nobody will march on you yet) and warn when one starts reaching out.
- **Rivals on the same rules** (holdings.js): their hunters thin the game, their hearths burn wood (a cold place builds a woodcutter first), and they grow by `settleRate` at a steward's middling mood (52) and the same name.
- **Openings tried** (scripted, Ashford, seed 7): a balanced plan (woodcutter, farm and hunter first, houses as room runs short) went from 12 to 42 people in 20 minutes; houses only starved by minute 5 and stalled at 14.
- **Seed-7 check after the change** (same scripted runs as in "Rivals' pace and gold"): the rivals' pace barely moved. A passive player: 14 of 34 places free at minute 30, houses Expanding at 20–30 and Contending at 35–55, the first war at minute 38; no rival place ran out of firewood, and rival places held 130–260 people a house by minute 55. A fast player (a village every seven minutes from minute 6): you pass every house by minute 20, Penhallow and Varn declare war at 12 and 17, and Varn gathers a host at 57.
- **A site doesn't wait for idle hands forever** (playtest round 3b, seed 91: a carpenter's site stood 6:34 to 13:00 because every villager had a job): after `BUILDER_WAIT` (30 s) with no builder, the site takes one from the job the village misses least (`leastNeeded`): a workshop that is waiting or has enough, then a spare hauler, a second woodcutter, any other workshop or gatherer, and a farmer or hunter last. Never the last farmer, hunter, woodcutter or hauler, nobody while food is short, nothing under attack. The site says so ("Under construction: builders taken from the storehouse", and one event), and the worker goes back to their old job when the site is done (if a place there is still free; otherwise they look for work as usual). Bench (Ashford, seed 91, balanced opening): 27 people at minute 15 against 28 without it, one hand taken.
- **The household guard is a lord's, and a drain** (creator, 2026-11-21: the first conquest is all home-grown troops; bought early for 150 gold it crushed the bandits, then became 30 free villagers): it unlocks at **Lord** (`town.householdRule`, greyed "From the rank of Lord" before), costs **300 gold** for 30 (`TYPES.household.gold` 10 a man, double), and draws a **wage of 0.4 gold a man a minute** (`HOUSEHOLD_PAY`, 12 a minute for 30, a little under a sellsword's 0.5) from the treasury like elite men (world/treasury.js `payElites`: unpaid, they grumble and then stand down). It **cannot be disbanded into villagers**: dismissing them, or "Let them go" when they are worn down, sends them away, nobody joins the village, and their kit leaves with them, as with mercenaries. The lord's own starting retinue is home-grown and may still go back to work. Rivals do not hire household guards, so there is nothing to change for them. `checks()`: Lord-only, the wage, no villagers from a disband.
- **Gear comes back on every disband** (creator bug: "sometimes the shields and armour of troops don't get folded into stores"): the retinue branch racked only a sword per man, so shields, armour and horses were lost; the arrière-ban's end (`world/arriere.js`) dropped the regiment without racking anything. Now ONE path, `Town.disband`, racks `rackKit(r)` = `outfitKit(key, 1, gearOf(r))` (weapons, armour level, shield, horse) for every living man of a levy, an elite company or the retinue; the arrière-ban calls it. Dead men's kit is lost, as before. `checks()`: for every levy type, every armour level, with and without shields, kit out equals kit in.
- **Priority** (creator, 2026-11-21: "priority should be very simple"): one toggle, *Make it the priority*, on the card of any site or workplace; one priority per village, and setting a new one clears the old (so does finishing it or pulling it down). A prioritised **site** is first in `findWork` and takes up to 4 builders (idle hands first, then one more borrowed every 5 s through `leastNeeded`, so never the last farmer, hunter, woodcutter or hauler), and its materials are hauled first (`planHaul` rank −1). A prioritised **workplace** fills first and has its goods hauled first. Feedback is only a flag over the building (the same badge as the stuck tags, class `stuck prio`, gold border; it replaces a stuck tag on that building) and the card's status line: "Priority: 3 builders, more coming", or why it waits (`prioNote`): "no stone", "way blocked", "every hand needed", "fully staffed", "paused", "deposit worked out". Not saved with the village. Nothing in it makes the economy easier: it only reorders the same hands and crates.
- **Leather armour** (creator, 2026-11-21: "should work similar to shields... more basic and easy to access"): a new good, *Leather armour*, made at the **tanner** from 2 leather (keep 60, like shields), taken by the barracks like any arm. `ARMOUR_GOOD.leather` is now `leatherarmour`; raw leather stays the armourer's input for mail and plate. At Reeve, a hunter and a tanner are enough for a leather levy. A leather armour is 4 hides, where one leather was 2 before, so it costs more raw material, not less. The barracks card shows "Armour in the racks, for a levy of 20: Leather armour 12/20 · Mail 0/20 · Plate armour 0/20", and the Craft tab's tooltip names it. Old saves: raw leather in a barracks' racks becomes leather armour one for one on load (`save.js`); regiments already wearing leather are untouched. The men who fall drop leather armour like the rest. `checks()`: the tanner recipe, the racks, a levy wearing it, the armourer keeping raw leather.

### Rival hosts that march (2026-11-21, creator: "i should feel pressure by this point (minute 100)")
At minute 107 on the creator's save no army was on the map, four houses sat in muster for 3–5 minutes and their arms piled up to 400–666. A seed-7 sim (passive player) showed the same, for four reasons, each fixed in `rivals.js` and `World.raiseFromPeople`:
- **Kit and people in different places.** `h.arms` is the kit in a house's stores, not men waiting. A seat held hundreds of kits and too few people to arm (Coldden: 476 kits, 37 people against a floor of 41), and the market towns held people and no weapons, so nobody was raised. A house now carries its kit to its people: a place with people to spare arms from another place's stores. Arms still pile up later, once a house has drained its places down to the 45% floor (people, not kit, are then the limit).
- **Muster gave up and chose the same place again.** After 600 s with too few men, a house now passes over that target for 15 minutes (`ai.passed`) and looks elsewhere.
- **Hosts were sized only to win.** A contending house marches with three quarters of its spare men, never fewer than the need. Its places keep 10% over their home guard before they send men to the muster, not 30%.
- **War with you was never felt.** A house raided only the target of its plan, and every plan went for a free village. Now a house arming for war also raids any enemy its plan is not about, you first, from whichever place has men to spare (`warRaids`). A contending house at war with you rates your places a war aim (×0.6), looks 700 away for you rather than 420, and a purse over 5,000 draws it (×1.2). Nothing holds the houses back: the creator's ruling (2026-11-21) is no AI-only caps, ramps or throttles. Their armies are limited by what limits yours (people taken from work, kit made, food), and if it swings too hard, the economics get fixed, not a cap added. The 75 s raid gap, the cap of two houses at war with you and the 10-man raid minimum, all in the first version, are gone. So is the rubber band that moved a house up a stage early once you were nearly as strong as it (`CATCH`): stages now come by time alone. If the strongest league member has no road to your best place, the next strongest leads the host; if none has a road, the league tries again later instead of every tick.

### Houses choose between building and war, on your rules (2026-11-21, creator: "make NPCs choose between econ and war the same way the player does")
- **A man raised is a person taken from work.** It already was: `arm()` takes him from the place's people, who do the work (`runEconomy`) and pay the taxes. Kit comes from the stores the place's own chain makes (iron, smith, tanner, carpenter), spent per man by the kit table. Elites and sellswords already draw wages (`payElites`, companies.js).
- **Men eat.** A house's garrison now eats from its place's stores at a villager's rate (`feedMen`), and those it cannot feed go home to their fields, six every five seconds. Its armies at home eat from that place's stores, as yours do from your village's (supply.js); before, they ate for free.
- **Each think, a stance** (`chooseStance`, shown in the house's panel as "Varn is arming" or "Carrow is building"). It scores the house's temper (raider +0.6, hothead +0.5, schemer +0.1, merchant −0.3, builder −0.4, turtler −0.2), a war it is in (+0.5), enemies within 300 of its lands (+1), something weak in reach (+0.5), a larder under three meals a mouth (−0.8) and settling (−0.3). Over 0.5 it arms, and once arming it stays armed down to 0.2.
- **Arming:** it raises men from its people, declares wars, raids, plans against houses, and strips its rear places (no enemy within 400) to half their home guard, as you would.
- **Building:** it keeps a field reserve of 30 at its muster place, sends men beyond that home to work with their weapons back in the stores, and goes only for free places and outlaw camps it can take with the men it has.
- Old saves load as they are: `h.arms` was always the kit in the stores, worked out again each tick, so there is no bank to carry over. The stance is worked out at the first think.
- **Seed runs to minute 120, normal.** The passive bot does nothing at all; the engaged bot is a proxy (Ashford's regiments kept at 30 + 1.5 a minute, other places at 30, a free place taken every 10 minutes from minute 12, but no field army, no retaking and no diplomacy).
  - Passive, seed 7: raided from minute 17, no soldiers left from minute 80, at war with Varn and Wyndham, and Varn's host is mustering on Ashford at 120. It survives, in clear danger.
  - Passive, seed 21: a Wyndham host besieges Ashford at minute 65, and it is knocked out at 69.
  - Passive, seed 91: a Stonemere host besieges Ashford at minute 76, and it is knocked out at 80.
  - Engaged, seed 7: 7 places at minute 70. All five houses league against you at 72 (a host of about 950, 691 of them levies), and 3 places are left at 120.
  - Engaged, seed 91: 7 places at minute 70. The league forms at 62, Stonemere takes five places from minute 75, and 2 are left at 120.
  - No muster stall at any minute in any run. Houses end with 3–14 places and 50–670 men.
  - The engaged proxy does not show whether an engaged player holds: it never fights in the field. The league's levies were free (60 a place at no gold). By the Orchestrator's ruling they are now each member's own arrière-ban (see "The arrière-ban").
  - After cutting `CATCH` (898083c), seed 21 passive falls at minute 105, not 69. Dunmore and Penhallow gather against Ashford from minute 57, and a Penhallow host of about 80 marches from Fenworth at 100, lays siege at 101 and takes Ashford at 105. A ramp, not a freak: Ashford had 1 soldier from minute 90, and four of the five houses were arming.
- `checks()`: 'rival houses: raised men lower production' (a rival place that raises 20 men makes less in a minute: Redham, 54 down to 15), and 'rival houses: stance follows their situation' (the score's answers for five sample situations, and every house's stance a known one).
- `checks()`: 'rival houses: no muster stalls with arms and men'. A plan in muster over 180 s fails it if the house could march, or if it has kit and people and has raised nobody for a minute.
- Free villages do grow (seed 7, minute 105: levels 2–4, 17–105 buildings), but they stop at their caps. Two the same size, like Garton and Iveden on the creator's save, have both reached their caps.

### A ramp without rubber bands (2026-11-21, creator: "if you fall too far behind you won't be able to catch up")
Rival houses grow by your rules, so a gap compounds. Nothing in this section adapts to how you are doing.
- **Leagues form on real reasons** (diplomacy.js `leagueReason`, `leagueReady`). A house joins one only if the side it leagues against borders it (a place within 420), has warred on or wronged it, or holds a place it claims. It must also be arming and able to pay its own arrière-ban (`banCost`). There is no "you hold 30% of the realm" trigger any more, and no "you no longer frighten them" end: a league ends when it falls below two members, wears out (40 minutes) or loses its host. Peace, marriage, alliance, vassalage or tribute keep a house out, as before.
- **The same against a house.** When two or more houses have a reason against another, they make peace among themselves and go to war on it together (`thinkRivalLeagues`, `w.leagues`, saved). There is no single host: each marches its own. A house is in one league at a time.
- **Cut:** the ×1.6 war odds and ×0.7 prize against whoever leads. War choice now comes from odds, borders, grudges, temper and a full purse, the same for every target, and any enemy's places are a war aim (×0.6) to a contending house. **Kept:** the 20-minute grace on the free villages around your start, a fixed opening that is the same every game (the comment in `choosePlan` says why).
- **Free villages grow** (holdings.js `clear`). A place at its building limit clears new ground for 60 wood and 30 stone, if fed: 2 more buildings and room for 6 more people, up to twice its starting land. Its limits are now land and food, not a number fixed at the start. Seed 21, minute 120: two free castles had cleared up to their limit (20 to 40 and 23 to 47 buildings), with 10–12 people against room for 120–141. The houses had taken every other free place.
- **Sims to minute 120, normal.** The engaged bot now marches a real field army (half of Ashford's men) every 10 minutes on a free or enemy place it outnumbers, but it still gets free garrison top-ups.
  - Passive, seed 7: Varn and Penhallow league against you at minute 98 with a host of about 450 (390 levies paid), and Ashford falls at 101.
  - Passive, seed 21: no soldiers left, Wyndham raiders at Ashford from minute 92, at war with Varn and Wyndham. Alive at 120, in clear danger. Varn and Wyndham were leagued against Penhallow, so they had no league free for you.
  - Passive, seed 91: a Varn host lays siege at minute 63, Varn and Stonemere league the same minute (host about 400), and Ashford falls at 67.
  - Engaged, seed 7: 3 places and 333 men at minute 120, more men than any house (Wyndham, the biggest, has 9 places and 275). Never leagued against. Its attacks on walled Cranholm Castle failed until minute 108.
  - Engaged, seed 21: 6 places and 341 men by minute 80, 371 at 100, never attacked. Rows after about minute 95 were spoiled by the page's own campaign rewiring the house table, so the sims now run on muster.html.
  - Engaged, seed 91: Varn and Stonemere league against you at minute 37 (host about 350). Ravenham changes hands four times, and the bot ends with 5 places and 509 men, the most men in the realm. The league's second host at minute 49 had no levies: its members' countryside was resting.
  - Leagues are 2 houses each, as the Orchestrator expected. There is one muster-stall minute in seed 21 passive, not yet looked into.

### Houses have ambition (2026-11-21, Orchestrator: lords at peace with nothing left to settle go looking for land)
- **Ambition** (rivals.js `chooseStance`, `ambitionOf`). Past its first stage, a house counts the time from when it has nothing left to settle: no free place in reach that it could take with twice its spare men (kit in the stores is not men, and Kingsbridge doesn't count), nobody hungry (or a larder of 3), and its places at least half manned. The longer that lasts, the more it leans toward arming: a point every 300 s for raiders and hotheads, 600 s for schemers and steady turtlers, and 1,100 s for merchants and builders, up to 2.5. That is enough for even a builder with a thin larder to arm in about half an hour. A hungry spell or a free place coming into reach wears ambition down twice as fast as it grew.
- **Prey** (`thinkWars`, `preyScore`). The same inputs for every target, the player too. Each neighbour's places within reach (420, or 700 once a house contends, for everyone; before, 700 applied to you alone) are scored by weakness, worth, threat, claims, grudges and purse:
  - Weakness: the spare men the house could field against the place's men and walls.
  - Worth: its people, (people + 10) / 60 up to 5, ×1.3 for a seat and ×1.5 for Kingsbridge.
  - A claim (a place the lord wants back) ×1.5, and for you a lord's grudge.
  - A full purse ×1.2.
  - A neighbour holding more places than the house ×1.6, as a threat.

  The best place names the war if its score × the temper's war factor beats 0.6.
- **League reasons, tightened** (diplomacy.js `leagueReason`). A border counts only when the side over it holds more places than the house (the one that borders and threatens). A war counts only when the other side started it: `w.warBy`, saved, records who declared. Houses that declared on a weak player no longer league up on that war alone (seed 21 passive had a coalition at minute 33 and fell at 39 before this).
- **Muster fix.** A house that saw it could march but couldn't take a single man out, or had no road, now passes that target for 15 minutes instead of retrying every think (seed 21: Dunmore on near-empty Dunden, four stall minutes).
- **Sims to minute 120, seeds 7, 21 and 91.** Three bots: *passive*; *peaceful* (the old engaged bot: 30 men in every place, a field army on free or enemy places, never declares war; its army now carries food, and it skips a place it failed to take twice); and *fighter* (the same, but with nothing to take it declares on the house whose place it can beat nearest).

  | Seed | Passive | Peaceful | Fighter |
  |---|---|---|---|
  | 7 | Varn at war from 13; falls at 113 | no war on you; 2 places, 277 men | as peaceful (never found a house to declare on) |
  | 21 | Wyndham at war from 13, Varn from 23; falls at 68 | no war on you; 6 places, 515 men | declared on Wyndham at 117; 6 places, 566 men |
  | 91 | Varn at war from 60; alive at 120 with 13 men | Varn at war from 95; 6 places, 516 men | as peaceful |

  - Houses now arm once settled and fight each other all game.
  - Leagues against a house formed 2–5 times a run, including against the runaway Penhallow (seed 7 at 115, 21 at 82, 91 at 70).
  - No league formed against you in any run.
  - No muster stalls.
- **The gap left.** By these inputs the peaceful bot is the hardest target in reach, so it is picked last. Its places hold 30+ men, and towns count their people as defenders. Rival places stand at 0–40 men because rival villages sit at 20–30% of their room: food doesn't move between a house's places, garrisons eat the rest, and stood-down men overfill one village while another holds 8,000 food. Scores at seed 21, minute 113: a Dunmore village 7.1, the player's best 4.3. Making the player a natural target needs either houses whose places are manned (the economics) or a looser bot.

### Every soldier is paid; the arrière-ban gathers near the front; events keep the seasons (2026-11-21, Orchestrator, after round 4)
- **Wages** (world/treasury.js `wagesOf`, `payElites`). In round 4 the player sat on 6,000–14,000 idle gold. Now, in each place, the first 12 men (`HOME_GUARD`, cheapest first) are its home guard and draw nothing. Every other soldier draws gold every minute, wherever he stands, for rivals as for you:
  - Levies (militia): 0.2.
  - Trained foot: 0.3.
  - Mail or horse: 0.35.
  - Household: 0.4, unchanged.
  - Sellswords hired at the keep: their company rate, 0.5 to 0.6.
  - Men-at-arms 0.6 and knights 1.5, unchanged.
  - (All scaled by 1.8 the same day: see "Wages scaled" below.)

  Not paid by this: a hired company (it is paid by companies.js), the arrière-ban (paid up front), the village militia called out to fight, and engines. An army has no home guard. Unpaid men grumble after 45 s, then a company at a time stands down from 150 s, as the elite did before. The realm's treasury shows "Soldiers' wages (N men)", and the top bar says "your soldiers draw N a minute".
- **The share it takes.** Count test save at minute 24: 78 men paid, 23 a minute of 139 tax. In the sims the peaceful bot's wages run at a fifth to a half of its tax: 133 of 683 (seed 21), 122 of 272 (seed 7) and 176 of 335 (seed 91) at minute 120, with 20,000–47,000 gold still banked. The tax grows with the people far faster than an army's wages. With the household's 12 a minute kept as the dearest native wage, gold does not become the limit on army size; the Orchestrator has the question. Rival houses take in about 70–90 a minute and pay 10–90, and none ran short in nine runs.
- **The arrière-ban gathers near the front** (arriere.js `musterPlace`). With no place picked, it is called to the place of yours nearest your biggest army in the field. With none out, it goes to the place nearest an enemy, a place or an army (outlaws are not a front). At peace it goes to your seat. The overview button names the place.
- **Events keep the seasons** (events.js `IN_SEASON`, `eventReady`), by world time (`World.season`), not the sky's clock:
  - The midsummer fair comes in summer only.
  - Blight comes in summer or autumn.
  - Tournaments come in spring or summer; pilgrims in spring to autumn.
  - No event comes twice in a year (`EVENT_AGAIN`, `w.eventAt`, saved). Round 4 had fevers again and again.

### A house's economy on your rules; wages scaled; leagues the same for every side (2026-11-21, Orchestrator)
- **Carts between a house's places** (supply.js `houseRuns`, `HOUSE_RUN`). Once a minute each house looks over its places with a real economy. The one with the fewest minutes of food (under 3, or hungry) gets a cart from the one with the most (over 6), carrying up to 600 food: enough for 8 minutes there, while the sender keeps 4. A minute's food is one a head, people and garrison alike. With nobody hungry, a place short of its guard that has people to arm and no kit gets weapons for up to 30 men from the place with the most kit to spare. Carts are wagon armies of the house (`wagon.run` with `house: true`). They drive straight at the road's real speed, at most two out per house and one per place, and an enemy army that meets one takes its food. Their panel note says what they are. Before this, Hollbury held 8,600 food while Millbury starved; now hungry places are fed within a few minutes.
- **The people eat first** (holdings.js `feedMen`, `PEOPLE_FIRST`). A garrison eats only what is left once one meal for the people is kept back, as your villages keep one back when an army draws on them. A garrison that can't be fed stands down.
- **Men stood down go home** (holdings.js `standDown`). Men go back to the house's places that gave them (`e.raised`, men given and not yet back), most owed first, as far as each has room. Any left over stay where they stand. Before, every one went into the muster village.
- **A house keeps its people working** (holdings.js `AT_WORK`). A house's place arms men for its guard only down to 60% of its homes, and for the field army down to 65% (it was 40% and 45%). It also builds a house once its people reach 65% of its homes, ahead of them as you would, instead of waiting until it was nearly full. A vassal's place, being yours, still keeps 40%.
- **How full rival places run.** Before (seed 21, minute 80), people filled 39–46% of their homes and 20–25% of the land they could clear (`maxPop`). Now, across nine runs at minute 80, they fill 52–77% of their homes (mostly 57–65%) and 31–48% of their land. The land can't fill further because a place's building slots (`maxBuilt`, at most twice its start) fill with farms and workshops before houses. Men under arms per house stay about where they were: 63–311 at minute 80.
- **Wages** were first scaled by 1.8; the next ruling ("gold as a real limit, judged by outcome") took them to 2.5 (see the section below).

- **Leagues on one rule** (diplomacy.js `leagueReason`, `strongestReason`, `formLeagues`).
  - Grudges and claims now count against houses as against you. A house that takes another's place leaves a "took" grudge against the taker (World.takePlace, `grudge(..., by)`, saved in the house's grudges; one without `by` is against you, so old saves load). A house's claim, its grudge factor in choosing a war, and its wish to take back what was taken now work against any side.
  - The reasons rank: a war the other side started (4) > a claim (3) > a wrong (2) > a bigger neighbour on the border (1). Each free house that is arming and can pay joins against the side its strongest reason names, and of equal reasons the nearer side. Anyone two or more houses choose is leagued against. A house whose choice found no partner tries its next reason.
  - You are not weighed first. Leagues against houses form even while one is against you, from the houses not in it.
  - Peace, marriage, alliance and tribute still keep a house out of a league against you. The herald's quarrel lines are unchanged.
  - checks(): "leagues: equal reasons against you and a house go to the nearer, not always to you".
- **The climb's wording** (rivals.js `climb`). A house contending for the crown "looks further afield for weak or rich neighbours to make war on, presses the wars it has, and pushes for Kingsbridge", in place of "goes for whoever leads", which stopped being true with the leagues' ruling.
- **Sims** (seeds 7, 21, 91, to minute 120, after all the above):
  - Passive: alive on all three to minute 120 (before, seed 21 fell at minute 99). First war on it at minutes 22, 27 and 108.
  - Peaceful: no war on seeds 7 and 21; war at minute 59 on seed 91 (48 before).
  - Fighter: the same as peaceful, because its declare path still never fires (a known sim bug, skipped by ruling).
  - Leagues: house-against-house leagues formed in every run (two to four), none against you.

### Gold as a real limit (2026-11-21, Orchestrator: judged by outcome, both levers)
The target is that a peaceful player banks a few thousand by minute 120, not 14,000–47,000, and that an engaged player fielding a Count-sized army runs near break-even. Rivals follow the same rules, and none may go broke on its home guard alone.
- **Where the gold came from.** The sims' gold ledger (by the function that moved it) for the peaceful bot, minutes 0–120, under the 1.8 wages:

  | Seed | Tax | Plunder | Workshops | Caravans | Wages | Banked |
  |---|---|---|---|---|---|---|
  | 7 | 15,400 | 6,600 | 6,700 | 0 | −13,400 | 14,600 |
  | 21 | 33,300 | 11,700 | 11,100 | 2,000 | −12,900 | 44,800 |
  | 91 | 18,400 | 9,900 | 4,200 | 0 | −12,900 | 19,200 |

- **A strongbox, not a treasury** (World.tickEconomy, `COFFER` = 5 gold a head). A place keeps at most 5 gold a head of its people. A house's place sends the rest to its lord, and a free place spends it. Before, a market town banked half its trade all game: one taken at minute 88 held 7,050 gold. Plunder over 120 minutes fell to 0.8k–1.7k.
- **A keep's reach** (economy.js `KEEP_REACH`, `taxedHeads`, `Town.taxed`). A keep taxes in full only as far as it reaches, and each head beyond pays a third (`BEYOND_REACH`). Reach by keep level: 20, 40, 60, 90, 130. So a village that has outgrown its keep pays less a head until a greater keep is raised (500 and 1,200 gold), which makes those raises pay. A house's place uses its own level. Its effect on rival places is small, because few of them outgrow their level. The town panel's tax and the Realm screen use it.
- **Wages ×2.5** (in the same order, for you and the houses). Gold a man a minute:

  | Levy | Foot | Mail or horse | Household | Sellsword | Crossbowman | Man-at-arms | Knight |
  |---|---|---|---|---|---|---|---|
  | 0.5 | 0.75 | 0.9 | 1 (30 for 30) | 1.25 | 1.5 | 1.5 | 3.75 |

  The 12 free home guard per place stay.
- **Outcome** (seeds 7, 21, 91, to minute 120). Wage share is wages over tax.

  | Run | Banked at 60 | Wage share at 60 | Banked at 120 | Wage share at 120 | First war on you |
  |---|---|---|---|---|---|
  | Passive 7 | 1,488 | 9% | 4,703 | 4% | 22 |
  | Passive 21 | 1,724 | 0% | 5,025 | 0% | 27 |
  | Passive 91 | 1,594 | 8% | 4,715 | 7% | 35 |
  | Peaceful 7 | 1,313 | 114% | 1,917 | 151% | 28 |
  | Peaceful 21 | 4,694 | 58% | 29,763 | 62% | 99 |
  | Peaceful 91 | 135 | 134% | 3,133 | 121% | 98 |

  - On seeds 7 and 91 the peaceful bot's ~300 men at minute 80 run near break-even (wages 196 and 213 against tax 131 and 176, plus workshops). Its army is then held by its purse: men stood down unpaid 30 and 57 times, and the bot tops them up for free.
  - Seed 21 still banks 29,800. That realm holds four market towns: a market's tax counts double (realm.js KINDS), and its workshops' sales brought 13,700 by minute 120. The levers for the Orchestrator: a market's tax at 1.5 instead of 2, or sale prices that fall as a market sells more.
  - The passive player banks 4,700–5,000 by minute 120 and pays 0–5 a minute from its home guard. No house went broke: the poorest hover at 300–500 gold, paying wages above their free guard.
- checks(): "treasury: a keep taxes in full only as far as it reaches, and places keep only a strongbox".

### Markets that fill, and the passive player in danger again (2026-11-21, Orchestrator's ruling (b), then (a))
- **Sale prices fall as a market sells** (economy.js `GLUT`, `priceShare`, `glut`). Each good a place sells adds to its glut, which drains at 60 a minute. A sale brings `1 / (1 + glut / 120)` of its price: half after 120 sold, back to full a few minutes after selling stops. Below 35% of the price, the workshop holds the goods back rather than sell. The same rule applies to your market workshops (Town.doCraft), a house's trade (holdings.js runEconomy) and caravans (supply.js moveCaravan, by the gold the market pays). So trading across several markets pays, and one town can't absorb everything. The town panel shows the price a sale brings now, and the market note says why.
- **Market tax ×1.5** (realm.js KINDS, was 2). With (b) alone, seed 21's peaceful player still banked 26,100 by minute 120, from four market towns.
- **The draft floor below the homes** (holdings.js `AT_WORK` guard 0.45, field 0.5; `HOMES_AHEAD` 0.65). A house built its next home once its people filled 65% of the homes, and drafted no one below 65%. So every new home raised the floor with it, and almost no one was drafted after the opening. At minute 110 on seed 7, Varn had 143 men and 580 sets of kit in its stores, its places at 60–65% of their homes. It had marched on the passive player's seat once (minute 84) and given up after 10 minutes without the men. Homes still go up at 65%; men may now be drafted down to half.
- **Outcome** (seeds 7, 21, 91, to minute 120; wage share is wages over tax, and over all income in brackets):

  | Run | Banked 60 / 90 / 120 | Wage share 60 / 90 / 120 | First war on you | Fell |
  |---|---|---|---|---|
  | Passive 7 | n/a | n/a | 14 | 58 |
  | Passive 21 | 990 at 60 | 14% at 60 | 14 | 66 |
  | Passive 91 | 1,632 / 3,129 / 4,982 | 12% / 9% / 6% | 15 | alive |
  | Engaged 7 | 607 / 454 / 0 | 116% / 122% / 126% (89% / 96% / 101%) | none | alive |
  | Engaged 21 | 221 / 4,349 / 10,928 | 107% / 85% / 78% (97% / 65% / 60%) | none | alive |
  | Engaged 91 | 42 / 920 / 803 | 119% / 114% / 125% (102% / 90% / 96%) | none | alive |

  - Passive at minute 110: it fell on seeds 7 and 21. On seed 91 it holds its seat with 10 men, at war with Varn, but no enemy army or place is within 400. Varn there is poor (4 places, 101 men, 1,424 gold) and the strong houses are far off.
  - The engaged bot fields 190 men at 60, 280–350 at 90 and 400–490 at 120. On seeds 7 and 91 it runs at break-even from minute 60 and is held by its purse: men stood down unpaid 36–58 times. Seed 21 banks 10,900 by minute 120 from four market towns.
  - No house declared war on the engaged bot by minute 120 (before: minutes 28, 99 and 98). The sims' "peaceful" bot is this engaged bot (30 men a place, a field army that marches).
- **The opening still holds.** With the draft fix, Varn (a raider) declares on the passive player at minutes 13.7–14.8, when it reaches its second stage. But no house army comes within 150 of Ashford before minute 28 (Wyndham's raiders on seed 21), minute 30 (Varn's raiders on seed 7), or by minute 30 at all on seed 91. Before minute 20 only outlaws raid Ashford, at minutes 5–7 and 13–15.
- **Why no house makes war on the engaged player** (rivals.js thinkWars, the two nearest houses, seeds 7, 21 and 91). A war needs score × the temper's war factor > 0.6, so the bar is 0.46 for a raider and 0.75 for a merchant.
  - At minute 60, on seeds 21 and 91, it is honest deterrence. The player scores 0.07–0.46, below the bar, because the houses field 8–58 men against defences of 70–212 (weak 0.03–0.46).
  - At minute 60 on seed 7, and at minute 90 on every seed, the player is above the bar for every one of these houses (1.25–4.54). Two things keep them off:
    - Every house is at its limit of wars: one at a time, two for a raider or hothead past its first stage. Each is at war with other houses, wars the leagues feed. On seed 7 at minute 90, Penhallow is building, not arming.
    - When a war ends, thinkWars takes the best place of any neighbour. Another house's nearly empty place scores 3.5–9.8 (defence 0–32), against 1.2–4.5 for the player's.
  - Grudges, claims and a full purse play no part: their factors are 1 throughout (the player stays under 5,000 gold). The bigger-neighbour factor (×1.6) applies once: Varn on seed 21 at minute 90, with 2 places to the player's 4.
  - Note: `field` counts a house's kit in store (`h.arms`) as men, in thinkWars and chooseStance. Varn's 281 at minute 90 on seed 7 includes 218 sets of kit. (Fixed below.)

### No war cap for the houses; kit is not men (2026-11-21, Orchestrator's rulings)
- **The war cap is cut** (rivals.js thinkWars). A house used to make one war at a time, or two for a raider or hothead past its first stage. That was a count only the houses had; you have no such limit. Now a house already at war takes on another only when its free men beat the new target's defence by its temper's margin (defence × `need` + 20, as a host must before it marches). Free men are its field less what its wars tie up: enemy hosts within 400 of its places, and the host it is gathering against an enemy's place (`committed`). The target is still the best by preyScore. A settling house still makes no wars.
- **Kit is not men** (rivals.js `fieldOf`, used by thinkWars and chooseStance). A house's field is the men its places can spare, plus its kit only as far as it has people it could draft now, above the floor World.raiseFromPeople keeps. Fields fell from 140–280 (mostly kit) to 7–160 at minute 90.
- **Outcome** (seeds 7, 21, 91, to minute 120):

  | Run | First war on you | Banked 60 / 90 / 120 | Fell |
  |---|---|---|---|
  | Engaged 7 | none | 384 / 417 / 5 | alive |
  | Engaged 21 | none | 755 / 6,165 / 16,580 | alive |
  | Engaged 91 | none | 116 / 1,505 / 1,783 | alive |
  | Passive 7 | Varn 13, Wyndham 27 | n/a | 50 |
  | Passive 21 | Varn 13, Wyndham 25 | 1,006 at 60 | 61 |
  | Passive 91 | Varn 15 | 1,651 / 2,736 at 60 / 90 | 94 |

  - Seed 21's engaged bot banked more this run (16,600 against 10,900): it holds the same four places, two of them market towns, and its tax was 24,800 by minute 120 against 20,100.
  - **What keeps the houses off the engaged player now:**
    - Seed 7 at minute 60: Varn has only 15 men to spare and three wars, so you score 0.16 against its bar of 0.46. Penhallow is building.
    - Seed 7 at minute 90: Varn's best target is you (1.21, over its bar), but its free men are 20 (77 in the field, 57 tied up in its two wars) against the 159 that Brackholm needs. The new test holds it back. The other houses score you 0.03–0.43, under their bars, or are building.
    - Seed 91 at minute 90: Varn (0.95) and Penhallow (1.66, with 157 free against 139 needed) rate you over their bars. But Stonemere's nearly empty Redholm (needs 33–34) scores higher for both (2.11 and 3.80), and Stonemere scores you 0.73 against its bar of 1.20.
  - So it is honest: houses with few men to spare, other prey that is easier, and once a house's free men against your defences.
- checks(): Lord 71/0, Count 90/0, King 126/0.

### How deep a house drafts: a judgement, not a floor (2026-11-21, Orchestrator's ruling (c), after the Manager)
- **Why.** You may levy any villager who isn't a soldier, limited only by kit, LEVY_MAX a call and wages. Your soldiers who march out leave the villager list (Town.takeTroops), freeing homes and paying no tax, exactly as a house's drafted men do. So the fixed AT_WORK floor was a limit only the houses had.
- **The rule** (holdings.js `keepAtWork`; rivals.js houseMind sets `h.ai.deep`). A house that is building and at peace, with no enemy host near, keeps its workers: half its homes for the field army and 45% for its guard, as before. A house that is arming, at war with anyone (outlaws aside), or has an enemy host within 400 of its places drafts down to the last 12 people, for as long as that lasts. Once it is over it stops arming, and its men beyond the reserve stand down to work (standDown). World.raiseFromPeople, the guard's arming, `fieldOf` and the muster-stall check all use it, so the war test sees the same numbers.
- **Outcome** (seeds 7, 21, 91, to minute 120):

  | Run | First war on you | Banked 60 / 90 / 120 | Fell |
  |---|---|---|---|
  | Engaged 7 | none | 1,157 / 3,243 / 5,298 | alive |
  | Engaged 21 | none | 1,017 / 4,473 / 10,739 | alive |
  | Engaged 91 | none | 0 / 0 / 0 | alive |
  | Passive 7 | Varn 13, Wyndham 60 | 1,381 / 2,650 | 95 |
  | Passive 21 | Varn 13, Wyndham 57 | 1,507 at 60 | 73 |
  | Passive 91 | Varn 15, Penhallow 113 | 1,630 / 3,198 / 5,066 | alive |

  - Engaged 91 held 2 places this run, not 3. Its wages (344 a minute) outran its tax (196), so it ran at 0 gold; the bot tops up its men for free.
  - Passive 91 is alive at minute 120 with its seat and 16 men. Varn is at war with it but poor, and nothing came near.
  - **House fullness at minute 80** (homes / land, %):
    - Engaged 7: 42/27, 46/27, 16/8, 49/21, 36/21.
    - Engaged 21: 39/23, 27/18, 39/19, 19/11, 18/10.
    - Engaged 91: 43/32, 13/7, 21/8, 47/28, 38/26.
    - Passive 7: 41/25, 38/23, 30/17, 19/10, 42/24.
    - Passive 91: 43/31, 17/7, 14/8, 32/15, 55/36.
    - Almost every house is arming or at war with another house for most of the game, so it drafts deep most of the time: 13–55% of its homes, against 41–57% under the fixed floor.
- **Narrowed** (Orchestrator: "peacetime" means no threat near, not no war anywhere). Drafting deep is decided place by place (holdings.js `pressedAt`, rivals.js houseMind `h.ai.pressed`).
  - A place drafts down to the last 12 only with an enemy host or enemy place, outlaws aside, within 400 of it.
  - A muster still short of what its target needs (`h.ai.muster`) also drafts deep, as many as it is short. It draws from the house's places within 400 of where it gathers, nearest the target first. A muster that can never fill (Carrow's, 460–540 short) hollowed out every place for its 10 minutes before this limit.
  - Arming, or a war far off, keeps the half-homes floor.
  - Men beyond the reserve stand down to work whenever a place is hollow with its threat gone and no muster holding them (before, only when the house had no plan at all).
- **Outcome** (seeds 7, 21, 91, to minute 120; wage share is wages over all income):

  | Run | First war on you | Banked 60 / 90 / 120 | Wage share to 120 | Fell |
  |---|---|---|---|---|
  | Engaged 7 | none | 642 / 1,298 / 4 | 101% | alive |
  | Engaged 21 | Dunmore 106 | 899 / 4,557 / 9,747 | 63% | alive |
  | Engaged 91 | none | 482 / 1,909 / 2,077 | 90% | alive |
  | Passive 7 | Varn 13, Wyndham 24 | n/a | n/a | 56 |
  | Passive 21 | Varn 26, Wyndham 47 | n/a | n/a | 56 |
  | Passive 91 | Varn 63 | 1,639 / 3,133 / 4,777 | 7% | alive |

  - Passive 91 at minute 110 holds its seat, at war with Varn alone, with no enemy army or place within 400 and no league. Varn there is small and poor: 2 places, 86 men and 515 gold at minute 80, beaten down by its neighbours. Penhallow, the strong house (10 places, 7,390 gold), is not at war with it.
  - **House fullness at minute 80** (homes %, the house's places with buildings):
    - Engaged 7: 22, 31, 43, 27, 38.
    - Engaged 21: 32, 46, 23, 34, 20.
    - Engaged 91: 33, 25, 50, 14, 36.
    - Passive 91: 45, 36, 51, 36, 55.
    - On seed 7 at minute 80, places with no threat near ran at 40–60% (a few at 14–21% where a muster that could not fill drew on them). Places on a front ran at 8–46%. On a crowded map most houses have several places within 400 of an enemy's.
    - The house figures also count places newly taken, whose people are few.
- checks(): Lord 71/0, Count 90/0, King 126/0.
- **Only a host is a threat** (Orchestrator, the last drafting step). An enemy place within 400 no longer counts; only an enemy host does, outlaws aside. A border alone isn't danger until an army shows up, as a player reads it. So a front sits half full and must surge when a host appears. A short muster still drafts deep as before.
  - Passive seed 91 is accepted as losing: 1 place against Penhallow's 10 by minute 120 can't be caught up.

  | Run | First war on you | Banked 60 / 90 / 120 | Wage share to 120 | Fell |
  |---|---|---|---|---|
  | Engaged 7 | none | 662 / 876 / 0 | 102% | alive |
  | Engaged 21 | Penhallow 117 | 499 / 3,407 / 5,747 | 74% | alive |
  | Engaged 91 | Varn 99, Penhallow 118 | 482 / 1,219 / 1,266 | 94% | alive |
  | Passive 7 | Varn 13, Wyndham 24 | 512 at 60 | n/a | 60 |
  | Passive 21 | Varn 26, Wyndham 44 | 1,347 at 60 | n/a | 60 |
  | Passive 91 | Varn 61 | 1,659 / 3,168 / 4,924 | 8% | alive |

  - **House fullness at minute 80** (homes %):
    - Engaged 7: 38, 32, 34, 44, 49.
    - Engaged 21: 30, 44, 25, 40, 27.
    - Engaged 91: 44, 38, 38, 22, 48.
    - Passive 91: 47, 39, 15, 39, 50.
    - Mostly 30–49%, up from 14–55% (mostly about 30%).
  - checks(): Lord 71/0, Count 90/0, King 126/0.

- **War by the odds** (creator's ruling, 2026-11-21: "the AI should declare war if it thinks it can win. But it's okay for the AI to declare war if it's pretty even... It shouldn't try to do a suicidal war"). rivals.js thinkWars still finds prey by preyScore over PREY_BAR, then weighs the house's free men (fieldOf less what it has committed) against the target's defence + 20: the odds (`ODDS`, `oddsAt`). The same for you as for any house.
  - **The line by temper:** raider and hothead go at 0.8 (somewhat worse than even), schemer at 1, builder at 1.2, merchant and turtler at 1.3 (a clear edge). At 1.25 or better the house reckons on winning; below that, about even.
  - **Bold:** with no target over its line, a house rarely takes a long shot by temper (hothead 12%, raider 10%, schemer 4%, others 2% a think), and only at 0.5 or better: never a hopeless one.
  - **Cornered:** a house with no good war, squeezed by one at least 1.5× its places that borders it and either holds a grudge from it or has a host near its places, counts its own free men plus those of every house that would join a league against the squeezer (diplomacy.js `wouldJoin`). With hope of 0.5 or better it declares on the squeezer and calls the houses to arms (`callToArms`, 10 minutes; once in 15). A call is a reason to league (leagueReason, weighed as a grudge), so formLeagues can take it up.
  - The war line says what the house saw: "reckons on winning, at about 2 to 1", "reckons the odds about even", "takes a long shot", "Hard pressed by ..., ... calls on the other houses to join the fight." It goes in the log and, for war on you, the herald.
  - Wars on a passive player still come mostly from a refused tribute demand (diplomacy.js `TRIBUTE`: a raider or schemer house at 1.8× your strength asks, and half of refusals mean war). The war from a refused tribute, either way round, now carries the same odds line (rivals.js `oddsOn`: free men against your nearest place), so every war reads as a choice (Orchestrator, 2026-11-21).
  - **Seeds 7/21/91 to minute 120.** Wars declared through thinkWars: 57 to win, 21 about even, 1 bold, 7 cornered (leagues followed some calls, e.g. seed 91 passive at 65: Varn and Carrow against Penhallow).

  | Run | First war on you | Banked 60 / 90 / 120 | Wage share to 120 | Fell |
  |---|---|---|---|---|
  | Engaged 7 | none | 720 / 844 / 0 | 101% | alive |
  | Engaged 21 | Stonemere 108 (to win, about 2 to 1), Penhallow 109 | 1,326 / 8,280 / 22,164 | 54% | alive |
  | Engaged 91 | none | 588 / 1,561 / 1,710 | 92% | alive |
  | Passive 7 | Varn 13, Wyndham 25 (tribute refused) | n/a | n/a | 55 |
  | Passive 21 | Varn 24, Wyndham 77 (tribute refused) | n/a | n/a | 106 |
  | Passive 91 | Varn 63 (tribute refused) | n/a | n/a | alive |

  - Engaged 21 banks 22k by 120, over the "about 20k" bar: 6 places and their market towns (tax 29.7k, workshops 7.9k, wages −18.9k).
  - checks(): Lord 72/0, Count 91/0, King 127/0.

## Test campaigns (built 2026-11-20)

The creator tests by playing the campaign and wanted a save at each rank to try templates and diplomacy. The title page's **Test campaigns** card offers Lord, Count and Duke (testsaves.js). Each is made fresh rather than stored, so it never goes stale when the save format changes: a seed-7 campaign is played forward quietly (fights reckoned, settlers taken in, the governor running Ashford), taking a village every few minutes, then topped up and loaded through the normal save path.

- **Lord**: 2 places at minute 10, 800 gold, Ashford at 35 people. About 3 s to prepare.
- **Count**: 5 places at minute 24, 2,000+ gold, Ashford at 60 (the 60-person templates open). About 13 s. In the check, every house was Contending and Varn at war with you.
- **King** (?test=king): the Duke save, crowned at Kingsbridge and carried into Part 2 (decrees, every house a vassal, the wall fallen). checks(): 111 pass, 0 fail.
- **Duke**: 11 places at minute 42, 4,000+ gold (about 20,000 with the coin of the places taken), Ashford at 80 (every template open). About 40 s. Every house was at war with you, for testing peace, dowries and buying off a coalition.
- Ashford gets building stock for templates (250 wood, 200 stone, 80 planks, 30 iron) and finished houses to make room for the people.
- Test campaigns save to their own slot (`rts.campaign.test`, chosen by `options.test`), so the real campaign is never overwritten; **Continue test** on the title page picks the test one up.

- Every place you hold, not just Ashford, starts with half the building stock, 20 people and a settled mood (Orchestrator, 2026-11-21: the Lord test's Cranholm Castle had 11 people and 1 food, so templates there looked broken).

## The Realm screen (built 2026-11-20, deepened the same day)

The creator, on growing past a lord: "somewhere to manage the realm as a count / duke… where do i go for vassal management… maybe centralized econ panel too so i can see how my villages are performing." Then, after the first version: "The realm info could be better, look to crusader kings for this, vassal management and how to centralize this info", and "i should be able to send supplies from this menu." The **Realm** button on the top bar (or Tab, on the map and in a village) opens one screen over everything (realmscreen.js), redrawn once a second (never while a list is dropped down). Seven tabs; a red count on a tab says how many things there need you:

- **Realm** (the overview): tiles for places, people, soldiers (with the vassals' share), gold a minute and strength against the strongest house; **Needs you** (the alerts list, with Go, Map, Find or Deal); **Your council advises** (one line from each seat, with a button that acts on it: the steward's food run, the marshal's threatened place, the envoy's house); the **vassals** by mood with any faction, who is about to turn and what each wants; the least content and hungriest villages; the great houses and any coalition.
- **Villages**: every place one row, sortable by clicking a column (people, mood, food, men, tax, needs). People shows homes filled as a bar and newcomers a minute; food is **minutes** the stores feed everyone; goods as icons (wood, stone, iron, arms); tax with the tithe and steward included. A vassal's place shows its tally and the vassal's opinion of you. **Send** opens Supplies from that village.
- **Supplies**: pick from, to, what to carry (food and building goods, food only, or building goods only) and whether four families go; it says what the wagon would carry and how long it takes, and sends it. **Short of** lists villages low on food or wood with a one-click run from the village with the most to spare (and says when a wagon is already coming). **On the road** lists wagons with what they carry, time left and any guard. A table shows what each village can spare. The rule stays half of what is spare, one wagon out per village; a wagon now carries up to 120 food, 60 bread, 80 wood, 30 planks, 60 stone and 20 iron (was 40/20/40/20/30/10, which fed a village of sixty for under a minute).
- **Vassals**: a list (opinion, a ▲/▼ for where it is heading, seat and trouble chips) beside one vassal in full: temper and knack; opinion with **every reason shown**, and where it will be in five minutes with a warning when they are about to stop paying or join a faction; what they want and how to give it; their power; what they have paid and sent and any favours owed; and every dealing (see "Vassals, deeper" below). A faction banner across the top gives its members, their men against yours and when they will make their demand, or warns when two are close to banding together.
- **Council**: the three seats, who sits there, what each does now, and candidates with the right knack starred; the council's counsel.
- **Houses**: each great house, your tie, their feeling, places, strength and gold; Deal opens their diplomacy panel.
- **Treasury**: what comes in (taxes, with what the tithe and steward add; vassals' dues as paid over the last two minutes; tribute from vassal houses), what goes out (elite pay, sellsword wages, road wardens), the net as planned and as **seen in the purse** over the last two minutes, how long the purse lasts if the net is negative, the gold in your vassals' purses, and taxes village by village.

The vassal list on the map's realm panel opens the Vassals tab; a vassal's place panel keeps dues, levies, gift, honour and the feud, and has "Deal with them in the Realm screen" for the rest.

## Vassals, deeper (built 2026-11-20)

After Crusader Kings' ideas (one place to see each vassal's opinion and its reasons, what they want, their power, a council, interactions and clear warnings), made the RTS's own in [src/world/vassals.js](src/world/vassals.js):

- **Knacks and the council.** Each vassal has a knack: a head for figures, a soldier's eye or a smooth tongue. The council has three seats: **Steward** (+10% taxes from the villages you run), **Marshal** (vassals send 25% more men when called) and **Envoy** (every great house's opinion of you drifts 8 higher). Each works in full for a holder with its knack and by half otherwise; a councillor refusing you does nothing. A seat pleases (+15, twice for the proud), a seat that suits their knack +5 more, and being put off −10. The landless at your court can sit too. Old saves give each vassal a knack and their old seat a name.
- **Wants change.** Six wants: a second village, a council seat, lighter dues, peace with the great houses (only your own wars count now), a war to win glory in, and a gift of gold. Each says how to give it. Met for 15 minutes, a want is a debt paid: +8 for 40 minutes, and they come to want something else.
- **New reasons in their opinion**: the proud and the ambitious envy a peer who holds more villages (−6); a vassal whose men reach 40% of yours thinks themselves your equal (−8).
- **Looking ahead.** `outlook()` works their opinion out five minutes on (marks fading, unmet wants and feuds growing) and warns when they will stop paying (below −25) or be ripe for a faction (−10). The Realm screen shows the trend and the warning.
- **Favours.** A good turn earns a favour (at most two): granting them land, judging their feud for them, pardoning them, a gift when they want gold, help in a lean year. A favour is spent on a demand for gold or on raising their dues or levies, which then pass without bad blood.
- **Dealings**: gift (100 gold; worth half again to the greedy); **honour before your court** (free, once every ten minutes each; +8, twice for the proud, and the proud among the rest −3); dues and levies; seat, move or unseat on the council; **grant** any of your villages or **take one back** (asks twice); look round their village; **demand gold** (half their purse, at least 30; −15, half again for the greedy; refused at −10 or worse unless they owe you); **call to arms** (their levy share from every place they hold marches to a place of yours you pick; called again within ten minutes they grumble −6, unless they want glory); judge their feud for either side or reconcile; **arrest** (asks twice; one who still pays comes quietly; a defiant one, below −25, may flee to their men and rise, at their men against the men at your seat, 10–80%, and their villages go free; every other vassal −10 either way); and for prisoners, pardon or **banish** (gone for good, the rest −4).
- **Glory.** Vassals' men out under your banners march as an army that remembers whose they are (`army.vassal`); taking a rival's place while it is out wins that vassal glory (+6, and meets the want).
- **Petitions.** Every 10–15 minutes one of your vassals (not one refusing you, nor one given land in the last three minutes) comes to your seat: help in a lean year (60 gold: +12 and a favour, or −8), leave to build a chapel, market or well from their own purse (+6 or −6), to carry your banner (+10, the proud and ambitious among the rest −4, or −5), or, from a devoted and well-off vassal, a gift of gold (take it, +3; or send it back, +10). Its picture will be `assets/art/events/petition.png` once painted and named in events.js `PAINTED`.
- **Fixed**: the herald for a vassals' feud, a vassal rising and a faction rising had no house to show and threw, jamming every herald after it; a herald now takes a vassal's name and colour. Vassal text no longer assumes "he"; new vassals don't share a first name with a living one.
- **Look, don't act** (2026-11-21, QC): in a vassal's village none of their regiments can be selected, so none takes an order (controls.js `watchOnly`, from the page's readonly mark); the stock panel has no tax − / +, Muster or Stand down and there is no build bar; the tax reads "Fair taxes, set by Sir …". Kept to the creator's read-only call; to change how a vassal runs it, deal with them in the Realm screen. `checks()` fails a look-round with anything on screen to click. On the world map a vassal's place reads "Sir …'s · sworn to you", not "Your house".
- **QC fixes** (2026-11-21): a greyed button in the vassal view says why it is off instead of its usual tip; a petition choice you can't afford says so on its face ("Send 60 gold (you have 10)") and looks greyed even as the first choice; taking back a vassal's only village says afterwards, in the toast and the log, that they have left for good; the departed and imprisoned give up their council seat at once (`checks()`: none keeps one).
- **Review fixes** (2026-11-21, Manager): the Supplies form sends from and to what it shows (place ids stay strings), and "Send food", counsel and "Short of" all pick the sender the same way (`giver`: the village of yours with most of it to spare). The Realm screen updates only what changed each second, so hover, focus, tooltips and scroll stay put. Every refused dealing says why on screen and in the console (`world.vassalAct`), and so does a petition whose terms no longer hold when chosen: gold is checked again then, so no purse goes below nothing. Road times and wagon loads come from supply.js (`runTime`, `runLoad`, `RUN_GOODS`). Taking back a vassal's only village says plainly they leave your service. `checks()` gained a Vassals group: one holder per seat, no councillor without a seat, favours ≤ 2, no purse below nothing, and the supply form's ends are what it sends.
- **Titles** (2026-11-21, roadmap "titles as ambitions"): raise a vassal one step at a time, always below your own rank: Sir or Lady to **Baron or Baroness** once you are count, then to **Count or Countess** once you are duke. Free and for good: +10 (+20 for the proud); the proud and ambitious among the rest −4 for fifteen minutes. **A real trade** (orchestrator's ruling, 2026-11-21, after Mount & Blade's fiefs: you make someone powerful who can later turn on you): a titled vassal sends half again as many men when called (Fair levies 45% → 68%, at most 90% of a garrison) but pays a quarter less in dues (Fair 30% → 22%); in a faction against you their men count double, and if it rises their villages stand against you with twice the garrison; every vassal minds harm done to a titled one half again as much (taking their land −18 instead of −12, arresting them −15 instead of −10). The raise button's tooltip spells out the trade before you click; the Terms show the shares as they are. A new want, *a higher title*, comes up only when you could give it. The name changes everywhere (map label, heralds, chronicle). `checks()`: titles are real and match the name. Numbers in vassals.js `TITLED`.
- **Marriages** (2026-11-21, roadmap "marriages as ambitions"): a new want, *a marriage into a great house*, picked only while some house you have met, at peace with you and warm (10 or more), would take a match. Arrange it from the vassal's Favour area: *Wed into House X (N gold)*, N half that house's dowry (`matchCost`, to the nearest 25); the gold goes to the house. They get +6 for good and the want's +10, owe you a favour, and the proud and ambitious among the rest mind it (−3 for fifteen minutes). The house likes you 8 more at once and **6 more for as long as their kin is a content landed vassal of yours** (`kinWarmth`, at most two vassals, so +12; it enters the house's drift target in diplomacy.js). **The price** (sharpened by the orchestrator's ruling, 2026-11-21: a sharper bind, never a surprise): while you are at war with their spouse's house they mind it (−15, "At war with House X, their spouse's house"), **they won't march against it** (`kinWar`: left out of Call the banners and Call to arms, said in the preview "Sir X won't march against their spouse's kin, House Y" and on the greyed button), and **a vassal already sour with you rises with that house**: if their opinion *without* the war on their kin (`baseOpinion`) is −10 or worse, they take the house's side, and their villages go over to it at once (their men double if titled, the others who stood by you +8, a herald and the chronicle say so). The match alone never does this, and the Realm screen warns beforehand ("Will rise with House X while you are at war with it"). The match button asks twice, and the second prompt spells all of this out. If the house is broken they grieve (−6 for half an hour) and the match is spent. A vassal weds once. `checks()`: a wed vassal's house is a real great house, and prices are whole 25s. Numbers in vassals.js (`KIN_WARMTH`, `WAR_ON_KIN`, `MATCH_WARM`).
- **A faction demanding a different king** (2026-11-21, roadmap "a faction demanding a different king"): when a faction of two or more makes its demand, it may name a king instead of asking for dues or freedom (`claimant` in vassals.js). The king is **the great house one of its members is wed into** (so a match is a risk as well as a gift), or, once you are a duke and the faction's men are 30% of yours (titled lords count double), the strongest house they know; always a house you are at peace with that is not your vassal. The Realm screen's faction banner names the king they would pick before they ask. **Give way** (what it costs is the orchestrator's ruling, 2026-11-21): the faction keeps its villages and pays light dues and levies, that house becomes your ally (so you cannot war on it without betraying it), and you send it a one-time gift of about 15% of your purse (`kingGift`: at least 100, to the nearest 50, never more than you have). No place is ever lost by giving way. The prompt sets both choices side by side: what giving way costs, and what refusing risks (how many villages and men go over, and the war). **Refuse:** they rise and their villages go over to that house (not free folk), which goes to war on you; the others who stood by you are pleased (+8). `world.factionAnswer`; checks(): a faction's would-be king is a living house at peace with you.
- **Test campaigns**: Count has one vassal, Duke three (the furthest plain villages, the first as steward), so the Vassals and Council tabs have someone in them.

### Great vassals and their claims (2026-11-21, the climb's King depth)

- **How a vassal becomes one.** A king raises a vassal to **Duke**, the fourth title in TITLES (`from: 'King'`), with the same raise button. Nobody is made a duke on their own.
- **The trade.** A great vassal sends twice the men and pays a quarter more in dues (vassals.js `GREATED`), the reverse of a lesser title, which pays a quarter less. The cost is a claim (world/claims.js).
- **The claim.** A great vassal claims the place nearest their lands that they say is theirs by right. It can be one you run yourself (not your seat, the crown city or a camp) or another vassal's, but never a vassal's last place, since a vassal with no land is gone.
  - The claim shows in the vassal panel as "Their claim", with a grant that asks twice.
  - Unanswered, it weighs like a want: up to −12 over 15 minutes (`claimWeight`, one line in opinion()).
- **Grant it.** The place is theirs (+18, fading over 50 minutes). A vassal who held it minds it (−20), and the proud and ambitious among the rest mind it a little (−3).
- **The press.** After 15 minutes unanswered, or sooner once they are angry (opinion −10 or lower), they press it with a give-way-or-refuse ask. Refused:
  - **A vassal's place:** they seize it. The holder minds that you let them (−15), and the two fall into a feud (the existing feud rules).
  - **One of yours:** they cannot take it, and they do not forget it (−30, fading over 50 minutes). On a content vassal that is enough to push them toward the faction rules (vassals.js tickFaction), which handle any rising.
- **After a claim ends** (granted, refused or lapsed), the next comes 30 minutes later.
- **Never the crown.** A vassal claiming another king is the factions' (`claimant`).
- **Measured on the King save:**
  - The biggest vassal, raised three times, became Duke of Elmmere. Their dues share went to 37.5%, their levy share to 90% (the cap), and they claimed Oakley.
  - Granted: their opinion rose from 70 to 100, the cap.
  - Refused at the press, for a place of yours: 70 to 40.
  - Refused for Hollwick, held by Lady Edith Stour: they seized it and the two feud.
- **checks():** King 116/0, Duke 116/0, Count 80/0, with a new check that every claim names a place of yours the claimant doesn't hold.

## An interface that grows with rank (UI session, 2026-11-21)

The north star asks for an interface that *enables* depth rather than suffering from it. The audit (group notes, `ui-audit-2026-11-21.md`, with screenshots) found the opposite at the start: a Reeve with one village sees 24 goods (all 12 arms at 0), the Cathedral, Knights' hall, stone walls, masons, mercenary companies, a great keep and a seven-tab Realm screen with empty council seats, while the panels cover about 45% of a 1280×800 village and all of a 527×549 one. The fix is the Mount & Blade climb applied to the screen: **you see what your rank can use, and each new tool arrives with a one-line introduction.**

### Rules

1. **Shown when usable.** A panel, tab, button or good appears when its mechanic arrives: by rank where the rules gate by rank (templates at Lord, the knights' hall and cathedral at Count, gathering armies at Duke, decrees at King), by event where they gate by event (the first house met, the first vassal, the first sellsword company seen, the first plank or weapon in store). One table, `src/ui/unlocks.js`, says what appears when and its introduction line; every screen asks it, so nothing is gated twice in two ways.
2. **Greyed means "not yet, and here is why".** Anything shown but not possible now (too few planks, too few people) is dimmed with the reason in its tooltip. Things your rank can't use yet aren't shown greyed; they aren't shown.
3. **New things say so, once.** When something unlocks it wears a small red "New" seal and a one-line callout beside it ("New: town templates lay out a whole quarter at once. Towns tab."); using it or clicking the callout dismisses it. The seen list is saved with the campaign (`world.uiSeen`), so a reload doesn't repeat them and a new campaign starts fresh. A rank-up herald lists what arrived; the callouts show where it is.
4. **The 3D view comes first.** Every docked panel folds to its header with one click (the fold is remembered); the stock panel folds to a single strip of the goods that matter. Panels never overlap each other: the left column (stock over build) shares its height, and the build bar keeps one height whatever the tab. Below 1100×720, panels start folded except the one you're using; below 800×600 the top bar shows icons with their names in tooltips.
5. **One visual language.** Parchment panels with a bronze rim, the dark leather top bar, parchment ribbon buttons (never wooden frames), house-blue cloth only for what is chosen or the one primary action, ink colours from the tokens in skin.css (good, bad and warn chosen to read on parchment). One tooltip, styled as a parchment slip with the hotkey shown, on every button, good and number. Type: 11/13/15/18 px; spacing 4/8/12/16. Hover darkens and warms; disabled is 45% with no blue.
6. **Hotkeys on the face.** Every button with a key shows it (Space, M, Tab, − / +, B then a letter, the order keys).

### What each rank sees

| Rank | Arrives (with its introduction) |
|---|---|
| Reeve (1 place) | The village: stock strip (raw goods; *made* and *arms* rows appear with the first of them), build bar (Village, Gather, Craft, Military, Walls), the keep, regiments. Map: goals, your realm, Needs you. No Realm button: one village is the whole realm. |
| Lord (2+) | **Realm screen** (Realm, Villages, Supplies, Treasury); **Towns tab**; grant to a vassal; call the banners; hire masons; raise a great keep. **Vassals** tab with the first vassal, **Houses** with the first house met. |
| Count (5+) | **Council** tab; knights' hall and cathedral; captains running armies. |
| Duke (11+) | Gather your armies; bigger regiments. |
| King | Royal decrees. |

### Batches (one screen finished before the next)

1. **Village HUD**: the unlocks table and New callouts; the stock strip that folds; one-height build bar with Defences as its Walls tab; the keep panel trimmed (prose behind "more"); styled tooltips; top-bar hotkeys; small-window layout; parchment-legible colours in these panels.
2. **World map**: goals that end, a message lane that never covers labels or panels, the realm panel by rank, Needs you only for what needs you, event cards whose greyed choice looks greyed, place labels told apart from UI.
3. **Battle**: cards with labelled bars and a clear selection, orders bar that fits, deploy bar and messages apart.
4. **Realm screen frame**: tabs by rank and event (contents stay the vassals session's). *Built 2026-11-22:* the Vassals tab arrives with the first vassal, Houses with the first house met, Council at Count (the overview's council and houses boxes with them); Treasury, Villages and Supplies come with the screen at Lord. Each new tab wears the "New" seal and gets its one-line slip inside the Realm screen (with the screen shut, the Realm button stands in). Duke's *Gather your armies here* and King's decrees are introduced the same way. The frame is sized in its own zoomed units, and the map's panels step aside while it is open (skin.css).
5. **Menus**: the title page and loading screen in the game's look, help per screen instead of one wall, the Muster in parchment.

## Game feel (fx.js, rts-feel session, 2026-11-21)

One effects module, `src/fx.js`, one Fx per scene (`fxFor`), fed by the views with one-line hooks: BattleView (every battle, village fight and storm), Controls (orders), TownView and WorldView. It reads state by diffing, so the simulation files stay untouched. Particles are pooled instanced meshes made only near the camera, on game time (they freeze while paused); markers and shake run on real time. `localStorage['rts.quality']` (low, medium, high; `setFxQuality`) scales counts, trails, chimneys, blood and shake.

- **Orders**: a ring where a move goes and arrowheads flowing along the path; a red ring on an attack's target; a ring on a charge; a white pulse under a newly selected regiment. No order bark yet (no voice files).
- **Combat**: a man struck flashes pale; sparks off mail and horses, a cloth puff and a few small dark drops otherwise; dust where a man falls; short streaks behind arrows and dirt where they land; dust behind running men and horses, a cloud behind a rout; a morale bar of pips under every banner, and banners that dip when wavering and lean hard in a rout; stones and falling walls throw dust and debris and shake the camera a little; gold sparks from the winners' banners when a battle is won.
- **Village**: scaffolds round sites that rise with the work, dust while men build and a burst when done; smoke from damaged buildings and flames once badly hurt; a ruin collapses in dust and smoulders for 90 s; chimney smoke from homes and hearths.
- **World map**: a smoke column over places being stormed, raided or starved; dust where armies meet; a pale plume in the new owner's colour when a place changes hands; dust at a new battle cairn; a ring where you send an army. Nothing on the map glows or flickers, since it is read alongside panels (Manager, 2026-11-21).
- **Quality**: fx reads `quality()` and follows `onQuality()` from src/look.js (low, medium, high; the Picture row in the sound panel). Medium is the default, so its counts are tuned to still read well.

## Day and night (creator's ruling, 2026-11-21)

On the campaign clock a day is 150 seconds (look.js `DAY`), and the same day lights the world map, villages and battles. The creator liked the first night (c79c14e) but ruled that **"night should not last as long as day"**: of each day about **60% is day, 8% dusk, 24% full dark and 8% dawn** (look.js `PARTS`), with dusk and dawn still clearly seen. At 1x that is about 90 s of day, 12 s each of dusk and dawn, and 36 s of night; at 4x a night lasts about 9 s. Night is a dark moonlit blue with stars. Regiments read by a torch beside each banner, by their banners and by their rings, not by a bright world. Windows light in villages and on the map, and wall torches light, through dusk; they go out through dawn. The sun and moon dial by the clock, and the sounds of the hour (audio.js `hour`), follow the same parts.

## The journey, rank by rank (climb session, 2026-11-21)

Played by hand on 2026-11-21: a new campaign to Lord (33 min), then the Lord, Count and Duke test saves. Full notes are in the group notes, `climb-playtest-2026-11-21.md`, and `player-round1-summary.md` agrees with them. What the climb felt like:

- **Reeve:** nothing threatens you for twenty minutes. Minutes 2–11 are spent waiting for wood. Sending the retinue to work costs nothing, because nobody comes.
- **Lord:** gold piles up (1,700 by minute 30) with nothing to buy.
- **Count:**
  - Calling the banners from a village with no food starved 13 men to 3 between two of my own villages.
  - A blockade starved my own 88 men to nothing in three minutes, while the place I besieged still had food.
- **Duke:**
  - The banners took the shortest roads through enemy places and attacked them piecemeal: 108 of 296 men reached the muster.
  - Each free place's villagers cost a third of a 100-man army.
  - The treasury reached 40,000 gold with nothing to buy.
  - The crown is a count of places, not a moment.

The common fault: **each rank adds tools but doesn't take away the old chores.** Your own logistics punish you hardest, and both the very start and the very top are flat. The journey below fixes that, rank by rank. For each rank it gives a sharp struggle, the tools that relieve the rank before, new trouble, and a moment of spectacle.

| Rank | The struggle | Tools that relieve the old loop | New trouble | Spectacle |
|---|---|---|---|---|
| **Reeve** (1 place) | **Outlaws come for your stores** from about minute 5. The retinue is the only real defence, so sending it to work becomes a gamble. | The retinue, the militia, the first barracks. | Two outlaw bands in the first quarter hour, sized to your men and stores. | The first band seen off: the retinue comes back blooded. |
| **Lord** (2–4) | Two villages to feed and guard, the camps' raiders, the first house you meet. | **Your own lands feed your armies**: no deserting between your own villages. Supply runs and town templates. | Your first vassal's wants; tribute demands. | The herald and the Lord's fanfare. |
| **Count** (5–10) | The houses take notice; walled places to take. | **Treat with a free place**: gold buys its fealty without a storm (the treasury's first big use, and the village keeps its people). **The banners march only through friendly land.** **Besiegers forage**, so a blockade is a real choice. Captains, the knights' hall. | Factions and rebellions; relief hosts at your sieges. | The knights' hall milestone. |
| **Duke** (11+) | A coalition of every house; half the realm to hold for the crown. | Gather your armies, 40-man regiments. Treating with free places is now worth its price. | The coalition raises one host that marches on your best place; break it and the league is broken. | **The coronation at Kingsbridge**: an event card with a choice (largesse, a tournament, pardons). |
| **King** | The north: Part 2, the wall falls. | Royal decrees. | Great vassals with claims; the host of Norrhold. | The wall falling (built). |

### Batch 1: the Reeve opening and the logistics traps (built 2026-11-21)

- **Outlaws on the roads** (rivals.js `outlawMind`). Twice in the first quarter hour, a band of outlaws comes for your home village:
  - **When:** the first at about minute 5–6, the second at about 12–14.
  - **Size:** 8 men, plus your strength under arms and a share of your stores, at most 18. A fat, well-guarded village draws a bigger band.
  - **Fighting them:** it is a normal raid on the village, so the attack prompt and the militia apply.
  - **If they get away**, they carry off 35% of the village's food, bread, wood, planks and iron, and up to 120 gold from the treasury (economy.js `rob`, world.js `OUTLAW_TAKE`).
  - **Played on seed 7:**
    - With the retinue at home, the first band (14 men) broke at once. One retinue man fell, and the retinue came out blooded.
    - With the retinue sent to work, the first band (10 men) burned two houses and got away with 82 food, 43 wood and 105 gold. The second (17 men, at minute 13) took 140 food, 43 wood and 120 gold.
  - **Exceptions:** they don't come in a Gentle game, while the outlaws are paid off, or under the king's peace.
  - The opening message now warns of them.
  - **Why:** the creator's "brutal early". It makes the retinue a real choice: twenty swords or twenty more workers.
- **Your own lands feed your armies** (supply.js). An army within 220 paces of a place of yours (or a vassal's or ally's; `HOMELAND`, about 40 seconds' march) does not desert.
  - Its carts refill from the nearest village of yours that has food to spare.
  - If none has, the army lives off the farms round about: the nearest village loses a little mood ("soldiers quartered on the farms") instead of men.
  - Out beyond your lands, the old rules stand: carts, wagons, and desertion when the food runs out.
- **Besiegers forage.** An army blockading a place eats at a quarter of the usual rate, living off the fields round it.
  - The blockade message now gives the race: how long your carts last against the place's stores.
  - Starving a place out is now a choice you can win, not a trap.
- **The banners march through friendly land** (world.js `route(from, to, pass)`).
  - Each column called to a muster takes the shortest road through your own, your vassals', your allies' and peaceful places.
  - Columns with no such road to the muster gather instead at the place of yours that most of them can reach through friendly land, nearest the muster. You muster them there and march as one host. A column that can reach neither stays home, and the call names it.
  - Before, columns blundered into enemy places one at a time and were thrown back piecemeal.
  - **In the Duke test save:** Kingsbridge sits among enemy and free places. Before, nine columns set out for it and 108 of 296 men arrived. Now 176 men gather at Cranholm Castle as one host, and three villages cut off beyond enemy land are named.
- **Treat with a free place** (Count and above). The attack prompt on a free place offers *Treat with them* for gold. The price is 6 gold a villager and 10 a man of the garrison, half again for a market, abbey or castle.
  - Paid, the place swears to you whole: its people, stores and garrison stay.
  - It is the treasury's first real use, and the answer to "storming a village kills its people" from player round 1.
  - Rival houses' places can't be bought this way: their lords would never sell.
  - **In the Count test save:** prices run from 320 gold (Redgate, 4 men) to 1,710 (Ashley Castle), against a 3,800-gold treasury. Redgate swore for 320 and kept all 47 of its people. Before, a storm cost a free place half its people.
- **The blockade, played** (Count test save): Brackholm's 144 men sat down before Varn's Emberley, whose stores were to last 20 minutes against 14 minutes of carts.
  - One wagon kept the army fed.
  - Varn sent three relief columns, and each was fought off in the field.
  - Emberley starved into surrender at minute 49.
  - Before, the same blockade starved the besiegers in three minutes.

### Round 2 fixes on the climb (2026-11-21, from the playtester's seed-61 round)

- **Tribute buys what it says.** Before, the demands cost 500 gold in 22 minutes, and Varn declared war seven minutes after being paid.
  - A house's demand now says "Paying buys 20 minutes of peace with …".
  - Paid, the house keeps a 20-minute truce. Its war choice already respects truces, and no league against you takes it in while the truce lasts (`dip.paidUntil`).
  - No house demands within 10 minutes of another's demand (`w.tributeAt`).
  - One payment to an outlaw chief now buys peace from every band for 20 minutes, and no other chief asks while it holds.
  - Numbers in diplomacy.js `TRIBUTE`.
- **Goals never lag behind.** A goal is ticked quietly when a later one is already done. The Lord test save showed "Arm them" with 56 men and a castle; now it shows "Become a count". (`goals.js updateGoals`)
- **The attack prompt gives the odds**: "Your 36 against about 90. Auto-resolve: all but certain to fail."
  - `world.autoOdds` works out auto-resolve's real chance from the same power roll it uses (a 0.85–1.15 roll on each side), with the folk who turn out and the walls. It also gives what a win would cost.
  - Checked against a real auto-resolve on the Lord test save: 36 against 90, predicted certain to fail, and it failed.
- **The spy can be followed.** The target's map label reads "your spy · back in 2:14", the place panel shows the same countdown, and the send message gives the minutes to expect.
- **Worn-down companies are put to you.** When a hired company falls below a quarter of its size, its captain asks: fill the ranks (the hiring price for the missing men), let them go, or keep them. Before, the Black Lanterns sat at 10 men on full wages. A company that breaks up below 3 men takes its last stragglers with it, so no "Grey Company: 1" is left under a dead name. (companies.js `askWeak`, `refillPrice`)
- `checks()` Journey group adds four checks:
  - no company of yours stays worn down without being asked;
  - a broken or free company leaves nobody behind;
  - no house paid tribute is in a league;
  - no goal shown has already been passed.

### Round 3 fixes on the climb (2026-11-21, QC and the Manager)

- **Marching on a house at peace asks first.** Before, an army sent to Coldden sat silently ("Waiting at Coldden").
  - Ordering an army onto a place of a great house you are at peace with now opens "March on Coldden?". It says the place's owner, that you must declare war first, and what war costs (`diplomacy.js warCost`):
    - any truce or paid-for peace broken, and that every house will think less of you;
    - any marriage or alliance betrayed;
    - a sworn house lost, or a house's backing of your claim lost;
    - which of your allies and vassal houses will join you;
    - their men against yours.
  - The choices are "Declare war and march", "March there in peace" and "Stay".
  - An army already waiting outside gets "Attack Coldden?" with "Declare war and attack", which goes straight to the assault prompt. Ordering it onto the place again after war is declared some other way also attacks.
  - An army that does arrive at peace logs "Fourth host waits outside Coldden: you are at peace with House Dunmore. Declare war on them first to attack it."
  - The map hint reads "March on X: H is at peace with you, so you will be asked to declare war".
- **Each rank's test save carries what the rank opens** (`testsaves.js`):
  - Every rank gets a barracks in Ashford, with 24 spears and shields and 12 bows and 120 arrows in its racks.
  - Count and Duke also get a knights' hall at keep level 3, 12 veterans, and mail, plate, swords, lances and horses for a batch of men-at-arms or knights.
  - The test save starts on its rank's goal.
  - Checked results:
    - Count: the banners raise 24 levies, and the hall trained 6 knights in 7.5 minutes.
    - Duke: 48 levies raised and 163 men answering, with three vassals sending 16 each.
- **"0 levies" from the banners was right, not a bug.** Levies are raised only where an active barracks has kit in its racks, and the old test saves had none. Even now, the Lord save (one village besides the castle) sends no one: Ashford's 20-man guard keeps its 12 levies and the retinue home.

### Round 4 fixes on the climb (2026-11-21, QC and the Manager)

- **Goals never lag or repeat** (`goals.js updateGoals`):
  - The goal shown is always the first one not passed: past the furthest goal done.
  - Each tick announces at most one goal, the furthest one finished.
  - A world with no goals counted yet (a new or test campaign, an old save) is set quietly, without a toast for everything it already holds.
  - Before, the Count save toasted "Feed your people" twice, and the Lord save showed goal 0.
- **The retinue always answers the banners.** It is the lord's household, not the village's guard. The guard of 20 is made of the village's levies and garrison only. On the Lord save the 19-man retinue now marches and Ashford keeps its 12 levies.
  - The preview says who stays and why: "Ashford raises 12 fresh levies and sends 19 (your retinue); it keeps its 12 levies as its guard."
- **The bands are warned of and answered plainly:**
  - The help page, the opening message and the first goals' tips say a band will come and what to do: keep the retinue home, and right-click the outlaws with it.
  - Band sizes are exact ("18 men"), not "about 20".
  - A beaten band says "The outlaws are beaten off at Ashford: 13 dead, none of ours." A band that gets away says what it took, with the dead. Both lines go to the village if you are watching it, and to the map log otherwise.
  - The bandit chief's portrait (assets/art/portraits/bandits.png) is queued with Art for Codex.
- **A worn-down household guard is put to you.** Below a quarter of its 30 men in one of your villages, you choose: fill the ranks (5 gold a man), send them to work as villagers, or keep them. (`companies.js tickHousehold`; asked once, saved on the regiment.)
- **No wagon, in your own lands, is no alarm.** The army card says the farms round the nearest place will feed the men, instead of "No village has food to send".
- **The Count and Duke saves' hall kit sits in the hall**, where the banners cannot arm levies with it. After calling the banners on Count, the hall can still train both men-at-arms and knights.

### The Duke batch (built 2026-11-21)

- **One league host** (diplomacy.js `raiseHost`, `tickHost`). When a coalition forms, every member sends two men in five from each of its places to one host. It gathers at the leader's place nearest your best place (your seat, else your biggest village), with rams, ladders and mangonels.
  - It waits there two minutes, which is your chance to strike it, then marches on that place. A herald names its size, muster and target.
  - While the host lives, no member musters a host of its own against you; their raids go on.
  - **The host beaten means the league is broken.** Every member makes peace with ten minutes' truce, and a herald says so. That covers a host routed in the field and a host beaten off at your walls. A host that takes the place it went for (or one on its road) stands there as its garrison, and the league gathers another five minutes later.
  - Buying the league off, or the league ending in the old ways (members leave, you stop frightening them, forty minutes pass), sends its host home.
  - On the Duke test save, forcing a league: 156 men from five houses gather at Market Brambury against Ashford.
- **The coronation at Kingsbridge** (events.js `coronation`). Crowned by sword or by acclaim, you get an event card before the victory card. It offers three ways to mark the day, and each carries into the war in the north:
  - **Largesse:** a quarter of the treasury (at least 500). Every village gets +15 mood for twenty minutes and less grief; every great house +10.
  - **A crowning tournament:** an eighth of the treasury (at least 300). Each of your captains gains a level; every great house +5.
  - **Pardons:** free. Grief is wiped in every village (+8 mood), the outlaws keep off your roads for forty minutes, and the great lords grumble (−4).
  - The choice is written in the chronicle and on the victory card. The card plays 'fanfare' for now; the Audio session's 'crown' can replace it (`// audio: crown`). A seat changing hands plays 'horn' in place of its 'seatfalls'. The 'unlock' sound is already raised by ui/sounds.js.
- **Gold sinks for a duke.** The Duke test save holds 22,000 gold, and a house's peace cost 200.
  - A lord's price for peace now adds a twentieth of your purse beyond 2,000 (capped at 4,000). On the Duke save that is 1,200–1,250 a house, and 4,550 to buy off a five-house league.
  - A free place's fealty costs 1.6 times as much from a duke as from a count (TREAT.duke): Elmmere 1,280, Keldale Abbey 1,730.
  - The palace at Kingsbridge costs 4,000 instead of 900.
- **Goals for Count and Duke** (goals.js): "Become a duke: hold eleven places" (its tip names treating, the banners and siege engines), then "Take Kingsbridge" (its tip warns of the league's host), then the crown.

### Army caps by rank (2026-11-21, ROADMAP "Caps that grow toward it")

- One army of yours holds at most **Reeve 150, Lord 300, Count 600, Duke 1,000, King 1,200** men (world.js `ARMY_CAP`). The battle bench holds 1,276 men at 11 ms on Medium (fidelity 2730ca4). A duke's 1,000 leaves room on the field for the host he meets, and a king fields it all.
- Mustering takes regiments in order until the next would pass the cap. The rest stay, and the log says how many and why.
- Joining two armies moves men up to the cap. The rest stay an army of their own, with their share of the food.
- The army card reads "240 of 600 men", with the reason in its tooltip. The muster button's tooltip says how many march and how many stay. The join buttons say how many fit. The March out button turns amber when the chosen regiments pass the cap.
- Not capped: two of your armies storming the same place, and your village's own defenders.
- **The economy can't fill the cap yet.** On the Duke test save (11 places, about 400 people in your villages), a duke can raise about 400 men at most:
  - the banners: 147, plus 22 already at the muster place;
  - three vassals: 48;
  - every sellsword company in the realm together: about 180.
  So the rank caps are headroom until a bigger source of men lands. That source is now the arrière-ban, below.

### The arrière-ban (built 2026-11-21, orchestrator's ruling)

- **What it is.** From the rank of Lord, every place you hold, a vassal's too, calls up men from its countryside, beyond its village people. No villager is taken. **Lord 30 a place, Count 45, Duke and King 60** (world/arriere.js `ARRIERE`).
- **Its own order.** "Call the arrière-ban" sits under "Call the banners", on the realm panel and on each of your places. It asks first and shows the cost: "Call the arrière-ban: 660 men, 1,980 gold, 330 food a minute, 10 minutes".
- **The cost.**
  - Gold to call: 3 a man.
  - Food to keep: they eat like any army (supply.js), loading carts from their own place's stores. Inside a village they eat from its stores, since a village feeds only its own people. A village with no food to spare sends a regiment of them home hungry.
- **Mass, not quality.** They are militia spears: no armour, morale 45, weaker than spearmen.
- **Ten minutes.** They serve ten minutes, then go home. After that the countryside rests five minutes before it answers again.
  - Each unit carries its own time home (`u.until`, `r.until` in a village). It survives joins, garrisons, field fights, wounds and saves, through `carry()` and `gearFields`.
  - Garrisons never merge levies with men who stay.
  - A village under attack keeps its levies until the fight ends.
- **The march.** The levies march by friendly roads. Columns with no such road gather where the banners would (`World.stageColumns`, now shared with callBanners).
- **The league uses it too, on your rules** (Orchestrator, 2026-11-21: no free men). Each member calls its own arrière-ban (`houseBan`): its rank's levy from each of its places (rank by places held, `rankOf`, the same as yours), 3 gold a man from its purse, ten minutes of food taken from its stores, and not again until its countryside has rested. A house that cannot pay sends fewer. The whole host stays within one duke's army (1,000 with engines), as yours does. These levies serve from the muster for two minutes plus ten. Engaged-bot sims, league host at minute 62: seed 91, 741 paid levies against 767 under the old free rule; seed 7, 729 against 755. The purses pay for nearly all of it (1,300–5,200 gold left a house), so the duke cap, not the gold, is what binds.
- **Measured on the Duke save:**
  - 11 places, 660 levies, 1,980 gold.
  - With the banners, 494 men stood at Ashford and 244 at Kingsbridge, the staging place. That is 738 men, plus about 180 sellswords, so about 920 against the 1,000 cap.
  - The league host came to 1,226 before its cap: 168 from garrisons, 1,032 levies and 26 engine crew. It is now capped at 1,000.
- **Open:**
  - A duke's 1,000 against a league host of 1,000 puts about 2,000 men on one field. That is past the 1,276-man battle bench, so it is for fidelity and QC to measure.
  - If the league's strongest house has no road to your best place, `raiseHost` raises nothing. That rule is older than the arrière-ban.
  - The prompt has not been seen by eye: the pane was hidden.

### Hungry villages and the carpenter (round 4 fixes, 2026-11-21, playtest seed 105)

- **The carpenter's shields start switched off in your villages** (recipe flag `start: 'off'`, economy.js `place`). It makes planks only until you switch shields on in its panel; stewards' places keep the shields they always made (`off` would have stopped them too). The shields were eating planks, and so wood, with nothing saying so. Saves keep their own switches, so the creator's campaign is untouched.
- **A village says when building is held up** (`woodOutlook`). Two ticks of the meal clock (a minute) with a site "Waiting for wood/planks": one event in five minutes and a Needs-you line (level 3) naming the cause (no woodcutter, woodcutters with nobody at them, a workshop making something from it, or the cutters not keeping up) and the fix.
- **Why a taken village starved (found by capturing five rival places on seed 105 with few people and little food: two never recovered in thirty minutes).** Not a food-carrying problem. Villagers took the nearest open job, so a handful of people filled the keep's and storehouse's hauler places and the nearby workshops, and nobody was left for the farms. The haulers had nothing to haul, nothing grew, the stores stayed empty, so the village stayed hungry, and a hungry village takes no newcomers. A village never takes food from another and never moves people; only armies' carts do (supply.js).
- **The fix is job order, not aid.** A village with under three minutes of food in its stores (`foodShort`) fills farms and lodges first, then everything else nearest first; haulers only as many as the meals lying at the farms call for (one at least, more as the farms get hands: `foodHands`, `foodRank`). Every six seconds, with a farm or lodge going empty and nobody idle, a hand comes off the job the village misses least (haulers beyond the yard, idle workshops, the rest; never the last hauler, the last woodcutter or the priority) and goes to the food (`updateFoodHands`), said once: "Food is short: hands are taken off the storehouse to work the farms." Same five villages: all five fed within five minutes, the worst hungry for about a minute.
- **The governor builds no farm while food places stand empty** (a farm with nobody to work it feeds no one); it says so once ("building no more farms: N food places stand open").
- **No silent starving.** `foodCause()` names what is wrong in one place (nothing growing; nobody at the farms; meals piling at the farms; first crop coming; farms with no hands; too few farms) and the early warning, the hungry alert, the panel line and the Realm screen all use it. "Food has run out" in the panel no longer hides that meals lie at the farms.
- Not built, on purpose: food carts between your villages. It would loosen the economy's balancing act; see QUESTIONS.md.
- checks(): "a hungry village with few hands works its farms first and is fed within five minutes" (a throwaway village laid out so the nearest jobs are not the farms; hungry for ever before the fix), "a new carpenter makes planks only".
