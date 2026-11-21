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
| Soldiers' look | **Quaternius modular people** with refitted knight helmets and shoulder pads, Quaternius weapons and fitted body armour. **Armour levels** (`armour: 'none' | 'leather' | 'mail' | 'plate'`, `shield: false` for none): spearmen, swordsmen, archers, crossbowmen and both horse are baked as a body with weapons plus a piece per level and a shield, put together by models.js `unitLook`. None is the team tunic and surcoat, bare-headed; leather a brown jerkin and leather cap; mail a dark mail shirt and an iron kettle hat (the type's own helm for crossbows and horse); plate bright steel to the wrists with the plate helm and shoulder pads. Bowmen keep their team-shade felt hood at every level. Without armour given, each keeps its usual look: plate for spears and swords, mail for crossbows and heavy horse, leather for archers and light horse. Icons: `armour-none`, `armour-leather`, `armour-mail`, `armour-plate`, `no-shield`. Teams show on a surcoat over the armour, painted shields and archers' hoods. A lord in the field (`unit.lord`, and `unit.lady` for a woman) rides bare-headed under a gold coronet, in bright plate and a long dark house cloak on a caparisoned horse, with a bannerman in a kettle hat carrying the house banner beside them. Kettle hats, great helms and padded coats are made too (bake.js `TRIAL`) but no soldier wears them yet. Riders sit up on the horse's back (found by a ray, not the nearest vertex) with a cloth draped over it. Norrhold's host: axemen in mail under a pale fur mantle with long axes, javelin men in a felt hood and fur with a bundle of javelins on the back, and grey war dogs in spiked team collars and war-coats. On the world map an army shows its own troops, about one figure for every ten men (at most 48): foot in front, bowmen behind, horse on the right flank, dogs ahead and engines at the rear, with its lord riding at its head. A rival army shows only as much as your eyes reach: far off a dark knot of men, nearer a block the right size in its colours, close up its own troops (`a.know`). The **Muster** page (muster.html) parades every kind of soldier round a field with marching bob, sway and fluttering banners, to look over on a turning plinth or follow on the march. |
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
- **Storming a place happens in the place itself**: a real village sized to its people, with houses along the roads, workshops and farms. Castles, seats, Kingsbridge, the north's gate and its war camps have walls and a gate facing your road. Beat or rout every defender to take it; select any of their buildings to burn it.
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
- **Call the banners**: every village raises what its barracks can arm, keeps half its people at work, and sends its men to one place. Armies waiting at the same place can **join**.
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
  - **Town templates**, from Lord, on the Towns tab: hamlet, market square, workshops and barracks quarter, placed in rings round the click and paid for whole, each with a larger size once the village has 50 to 70 people. **Work the land** places gatherers instead: two woodcutters, a quarry, a mine and two farms by the resources nearest the click that none of their kind already works; any with nothing to work is left out. While placing, a ghost shows every building of the template where it will go (creator, 2026-11-20), and the cursor says how many fit there; clicking builds exactly that layout (economy.js `planTemplate`).
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
- **Militia** (2026-11-20, the creator's idea): while one of your villages is attacked, *Muster the militia* in the stock panel calls every villager not already under arms out as soldiers, in regiments of up to 40 (battle.js `folk`, "Village militia": hp 9, atk 2, def 2, dmg 3, morale 35, no armour, `value` 0.35, the bandit look of axes and hoods). They form in front of the keep, hold there until your soldiers are fighting, then pile into that fight (with nobody else standing, they go at whatever comes for the village); your own orders come first. A militia that breaks runs for the keep and shelters with the rest. Work stops while they are out. When the attack ends (or on *Stand the militia down*, or Disband on one regiment) they go back to the jobs and sites they left. The dead are villagers lost; survivors bring home no experience, so a muster never makes veterans for the knights' hall. Militia never march out, refit or leave with a fallen village's survivors: they stay as its people. The governor calls them out only when an assault (not a raid) outnumbers the men standing. A militia that beats an attack off (the attackers killed or routed, not gone with their plunder) lifts the mood: "they defended their homes", +8 fading to nothing over five minutes. There is no cooldown and no mood cost beyond the mourning for the dead (decided by the creator, 2026-11-20).
  - **Rival and free villages muster too** (creator, 2026-11-20), by the governor's rule: only when an assault (never a raid) outnumbers the garrison, and not outlaw camps or the north's strongholds. [src/world/militia.js](src/world/militia.js) `turnOut` adds the place's whole people (`p.eco.pop`, at most 160, in units of 40) to the defence as "People of …". In a fight reckoned by numbers (rival on rival, or your auto-resolve) they count at value 0.35 a head, and half of the militia the reckoning takes off are dead, the rest scattered home. When you storm the place they stand by the keep behind the garrison, and the real dead are counted. Either way the dead come off the place's people, the survivors never join its garrison, and a yielding garrison marches out without them. So a place with few guards and many people needs a host that outnumbers both.
  - Seed-7 check with rival musters (scripted, fights auto-resolved): a passive player sees the same house stages (Expanding 15–26, Contending 30–52), 15 of 34 places free at minute 30 (14 before) and the first war at minute 40 (38); by minute 60 the houses hold 22 places (24) with about 15% fewer people, after six musters. A fast player taking a free village every seven minutes from minute 6 with a host 1.5 times garrison plus militia: every attack still wins, each host comes home with about a fifth fewer men, and the villages taken hold 9–18 people instead of 15–30, so you have 436 people at minute 50 instead of 481. The houses' places and first war (minute 10) did not move. Measured on seed 7 (Ashford with 41 villagers and the retinue of 20, against 44 bandits, the retinue sent in): alone, the retinue dies to a man and three buildings burn; with the militia the raiders rout, 18 of the retinue live and one building burns, at the cost of 26 villagers.
- Bandit raids from 5:00, growing with each wave (archers from wave 3). Villagers flee to the keep. Raiders burn what they reach and leave after three fires or about 2½ minutes. If the keep falls, the game is lost.
- The lord's retinue of 20 swordsmen costs no villagers. You can send it to work: the men become villagers and their 20 swords and shields go to the nearest barracks (or the keep), so a barracks can arm them again as a levy.

**Sound** (`src/audio.js`, `assets/audio/`), 2026-11-19:
- Free music and sound, all CC0 or CC-BY, about 17 MB. Every file's source, author and licence is in [assets/audio/CREDITS.md](assets/audio/CREDITS.md), shown with the Quaternius models on `credits.html` (linked from the menu, each page's help and the sound panel).
- Music crossfades by mood: building (four tracks in turn), tense when raiders or an enemy are about, battle, siege (an assault on a keep), victory and defeat stingers, and the world map. Most tracks are RandomMind's CC0 medieval series; Kevin MacLeod's CC-BY tracks fill the gaps.
- Effects are heard from the camera: quieter with distance and zoom, panned left and right. Clashes, bows and arrow hits come straight from the battle; war cries when a regiment closes, a scream when one routs; chopping, picking, hammering, crates and a finished-building chime from the village; horn and drums when raiders come or a levy is raised; fire when raiders burn a building. Beds for village, forest, wind, battle din, marching feet and fire are mixed by what is on screen.
- At most 24 sounds at once, and a few of each kind; a louder sound replaces the quietest. Villages you are not watching stay silent.
- Second pass, 2026-11-20 (about 19 MB in all): sieges sound boiling oil, sappers digging and mines collapsing, a burnt bridge falling into the river, and a parley horn when a duel or terms are offered. Duels gasp at the challenge and cheer at the deciding blow; a lord rides in to a fanfare and a neigh. Dogs bark, Norrhold axes thud on shields and javelins whoosh instead of bows. Beds for cavalry gallop, armour clinking by how heavy it is, wading at fords, and rain, fog, night and the winter blizzard. The realm: coins for hiring, buying and caravans, a cart setting out, a wax seal for decrees, a quill for spy reports, scroll for choices and works, bells for great works, the cathedral and victory, a drum boom for wars, factions and coalitions, an angry mob for revolts and unpaid mercenaries walking out, and a feast in the village. The realm's sounds go through `world.hooks.sound`, so the world files stay free of audio.
- 🔊 in the top bar: master, music and effects volume and mute, remembered in the browser. Sound starts on the first click.
- Hooks in other files are one line each and marked `// audio`. `audio.status()` in the console shows what is playing.

**Battle test** (`battle.html`), 2026-11-18:
- 9 regiments a side (spears, swords, archers, cavalry), about 1,200 soldiers, with a keep and village at each side's end of the field.
- Total War–style orders: box select, right-click to move or attack, right-drag to draw a front line. You can pause and still give orders.
- Melee between individual soldiers; arcing arrows that can hit your own men; cavalry charges that braced spears stop from the front.
- Morale, flank and rear hits, and routs. Routers can rally once in the field; otherwise they run to their keep, regroup and come back under orders.
- Strategic zoom with banners that stay a fixed size on screen.
- URL options: `?seed=123` for a fixed map, `?scale=4` for four lines a side.

**Walls, sieges and the new army** (battles workstream), 2026-11-19:
- **Walls**: palisades and stone walls, towers and gates, each stretch with its own hp. In a village the Defences panel lets you drag out a wall, click towers and gates onto it, rebuild broken stretches, cut a gate into a wall or pull a stretch down for part of its cost. Walls are paid for when placed, and masons build them over time (more masons as the village grows). Villagers and your men pass your own gates; enemies have to break in.
- **On the walls**: right-click your own wall to man it. Men climb up by towers and gates. Archers shoot further from walls and furthest from towers, merlons stop many arrows, and men on the wall beat climbers and anyone hacking at the wall below.
- **Breaking in**: rams on gates, ladders on quiet stretches (defenders push them down), mangonels and trebuchets throwing stones that also hit buildings, and axes on palisades. A gate is forced open by attackers who get inside, and retaken by its owners.
- **New units**: crossbowmen, light and heavy cavalry, men-at-arms, knights, sellswords and hired crossbows (paid in gold), and household men. Each has a role, the kit it needs and a cost in goods for engines.
- **Captains**: one named captain per army rides with a regiment, giving a small bonus to morale and fighting. He gains levels over battles and can fall.
- **Orders bar**: formations (line, tight, loose, wedge, schiltron) on N/T/L/V/X, Charge (C), Hold (G) and Fire at will (R).
- **AI**: attackers camp, bring up engines, ladder where the walls are thin and storm once there is a way in. Defenders man the walls facing them, answer ladders and sally against engines. Siege hosts that attack your village do the same.
- `battle.html?mode=siege` storms a stone fort; `?mode=defend` holds one. At `?scale=4`, about 5,000 soldiers run at 5–7 ms a step.

**Terrain matters in battle** (battles workstream), 2026-11-19, roadmap section 5:
- **High ground**: fighting uphill is harder and a downhill charge hits harder; archers reach up to 30% further from above and 15% less from below. A holding AI army first takes the best rise near it.
- **Woods**: copses stand in the open ground between the armies. A regiment mostly inside one, with no enemy within 30 m, is hidden from the other side until it fights or shoots; the first blows from hiding are an ambush (a morale shock and better hits). Trees slow foot, slow horse badly, break formations and blunt charges.
- **Rivers**: about half of test fields and two in five campaign field battles have one. Deep water is very slow and a bad place to fight; fords are shallow; a wooden bridge crosses dry. Regiments march to the best crossing in formation (see *Gaps* below). Burn bridge (B, or the orders bar) sets one alight from your bank; it falls in about 40 s.
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
- While you command a fight in a village, events, news and houses' proposals wait; alarms and road encounters still come. Houses' proposals are at least two minutes apart across the realm; one house demands tribute at most every 30 minutes, and never within 15 minutes of making peace with you.
- A new vassal brings a household (12 men, plus one for every eight people, up to 30) when you leave too few to hold the place, and the grant buttons warn when an enemy is already marching on it.
- Governors put up a barracks from 40 people (they still never raise men), and find work for idle hands: woodcutters, a quarry, hunters, then farms.
- Shields stop at 60 in store by default; other arms have no limit.
- Hiring a bandit band always costs more than paying it off. A company is offered at the wage it will draw once hired at full strength.
- A place's name label on the map can be clicked and right-clicked like the place. A drag whose mouseup is swallowed no longer leaves the map following the mouse.
- The Storm prompt warns when the place is walled and the army brings no ladders, ram or engines.
- In a storm, ladders, rams and engines ordered onto an enemy wall go for the wall, even with its defenders standing on it.

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
- **Food first**: hunting grounds are 40 m cells (`GAME`); each hunt takes 12% of a cell, which breeds back over about 25 minutes, so the game near the village runs out. A hunter says how much game is in reach. A new farm brings in its first crop after 2½ minutes (flax 2), with its workers tending the field meanwhile; a farm yields 3 food a trip.
- **People are the limit**: newcomers settle while the larder holds more than a meal a head (full speed at four), the village is content and its name is good (`settleRate`): about 1.2 a minute at best, as working adults. Houses only set the room. The stock panel says how fast newcomers come, or why none do, and hovering says why.
- **Name** (`REPUTE`): a chapel +0.4, a market +0.25, a well +0.15, ten quiet minutes +0.2; a raid in the last five minutes −0.4, cold hearths −0.3.
- **Firewood**: every hearth (the keep and each house) burns 1.5 wood a minute. Without it the hearths go cold: −12 mood and a worse name.
- **Settlers asking to stay** (events.js): from minute 5, then every 6–9 minutes, refugees (5–8; or take the strongest half, −3 mood), masons (3–4, with 25 stone) or foresters (3–4, with 30 wood). Only with room for them.
- **Upgrades add work places** (`UPGRADES`, `SPEED`): level 2 (15 stone, 10 planks) and level 3 (100 gold, 10 iron, 10 planks). Jobs grow with the level (two and three times the places; haulers one more a level), and each level works faster (×1.15, ×1.3), so a level 2 woodcutter out-produces two level 1s. Houses and wells don't upgrade. − / + on a building sets how many work there.
- **Paved roads** (`ROAD`, roadview.js): pick Paved road on the Village tab, click where it starts and where it ends; it carries on from there until Esc. 3 m wide, 1 stone per 3 m, up to 40 m a stretch, inside your land and clear of buildings. Anyone walking on it goes 1.5× as fast, and walkers seek roads out (roadnet.js, creator 2026-11-20): a road counts as shorter by its speed, so a walker steps onto it, follows it through junctions and crossings and steps off when that beats walking straight, and otherwise cuts across. The road network and its distances are worked out when a road is laid or lifted; each walker plans once a leg (about 0.2 ms with 48 stretches). In a test, haulers between a woodcutter and the keep walked a road laid 7 m off their straight line. Shift-click lifts a road for half its stone. The look is a plain stone strip for Art to dress (townview is Art's).
- **Deposits run out**: stone outcrops hold 500 (rich) or 220 (poor), ore deposits 320 or 140; about a third are rich (most, in mining villages). Hovering one says what is left; placing a quarry or mine says what is in reach. A worked-out deposit is gone.
- **Smarter hauling** (creator's playtest, 2026-11-20): a building site short of a fraction (firewood leaves broken logs in store, and a crate can come up short) still gets its last crate; it used to wait for ever at "9/10". Only food and bread are carried to the stores as they come, for the meals; other goods stay in the yard where they were made until it is 60% full (the creator: haul "unless they are in danger of filling up"). Workshops, building sites, the hearths' firewood and the cost of new buildings all draw straight from yards, never from building sites. The town panel says "without a job" rather than "idle": people without a job carry crates.
- **Bottlenecks** (townlabels.js): a building stuck for six seconds says why above it ("No workers", "Waiting for planks", "Game hunted out"…).
- **Speed**: ½×, 1×, 2×, 4×.
- **A safe opening**: the first log line says the great houses are still settling their own lands, and the goals say while every house is still settling (nobody will march on you yet) and warn when one starts reaching out.
- **Rivals on the same rules** (holdings.js): their hunters thin the game, their hearths burn wood (a cold place builds a woodcutter first), and they grow by `settleRate` at a steward's middling mood (52) and the same name.
- **Openings tried** (scripted, Ashford, seed 7): a balanced plan (woodcutter, farm and hunter first, houses as room runs short) went from 12 to 42 people in 20 minutes; houses only starved by minute 5 and stalled at 14.
- **Seed-7 check after the change** (same scripted runs as in "Rivals' pace and gold"): the rivals' pace barely moved. A passive player: 14 of 34 places free at minute 30, houses Expanding at 20–30 and Contending at 35–55, the first war at minute 38; no rival place ran out of firewood, and rival places held 130–260 people a house by minute 55. A fast player (a village every seven minutes from minute 6): you pass every house by minute 20, Penhallow and Varn declare war at 12 and 17, and Varn gathers a host at 57.

## Test campaigns (built 2026-11-20)

The creator tests by playing the campaign and wanted a save at each rank to try templates and diplomacy. The title page's **Test campaigns** card offers Lord, Count and Duke (testsaves.js). Each is made fresh rather than stored, so it never goes stale when the save format changes: a seed-7 campaign is played forward quietly (fights reckoned, settlers taken in, the governor running Ashford), taking a village every few minutes, then topped up and loaded through the normal save path.

- **Lord**: 2 places at minute 10, 800 gold, Ashford at 35 people. About 3 s to prepare.
- **Count**: 5 places at minute 24, 2,000+ gold, Ashford at 60 (the 60-person templates open). About 13 s. In the check, every house was Contending and Varn at war with you.
- **Duke**: 11 places at minute 42, 4,000+ gold (about 20,000 with the coin of the places taken), Ashford at 80 (every template open). About 40 s. Every house was at war with you, for testing peace, dowries and buying off a coalition.
- Ashford gets building stock for templates (250 wood, 200 stone, 80 planks, 30 iron) and finished houses to make room for the people.
- Test campaigns save to their own slot (`rts.campaign.test`, chosen by `options.test`), so the real campaign is never overwritten; **Continue test** on the title page picks the test one up.

## The Realm screen (built 2026-11-20)

The creator, on growing past a lord: "somewhere to manage the realm as a count / duke… where do i go for vassal management… maybe centralized econ panel too so i can see how my villages are performing." The **Realm** button on the top bar (or Tab, on the map and in a village) opens one screen over everything (realmscreen.js), redrawn once a second:

- **Villages**: every place you hold, one row each: people / room and newcomers a minute, mood, food as meals a head, wood, stone, iron, arms, soldiers, tax a minute, and what needs you. Needs flags the trouble worst first (under attack, revolt, hunger, cold hearths, low mood, buildings stuck and why, no room); a vassal's place shows who runs it. **Go** enters the village, **Map** shows it on the map with its panel open. A totals row sums the realm.
- **Vassals**: each lord, their opinion (hover for the reasons), holdings, men, dues and levies, what they have paid, and flags (council, refusing, feud, landless). **Deal** opens their holding's panel, where dues, gifts and the council are set as before.
- **Houses**: each great house, your tie (war or coalition war, peace, alliance, marriage, or sworn to you), their feeling, places, strength and gold. **Deal** opens their diplomacy panel.
- **Treasury**: taxes in, knights' and sellswords' pay out, the net a minute, vassal dues so far, and the purse.

The screen reports and points; the deciding still happens in the panels it opens, so there is one place for each choice.
