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
| Soldiers' look | **Quaternius modular people** with refitted knight helmets and shoulder pads, Quaternius weapons and fitted body armour: steel plate for spears and swords, mail for cavalry, leather for archers. Teams show on a surcoat over the armour, painted shields and archers' hoods. A lord in the field (`unit.lord`, and `unit.lady` for a woman) rides bare-headed under a gold coronet, in bright plate and a long dark house cloak on a caparisoned horse, with a bannerman in a kettle hat carrying the house banner beside them. Kettle hats, great helms and padded coats are made too (bake.js `TRIAL`) but no soldier wears them yet. |
| Buildings' look | **Quaternius Ultimate Fantasy RTS.** The town-centre models read as town squares, not keeps, so they're out. A village **keep is a lord's hall that grows** in five levels (30, 60, 100 and 150 people, or a level the town sets): timber tower-house, stone-and-timber hall, great hall between stone towers, stone castle, fortress. The smallest palisaded Wonder fort is the **fort** for forts and army camps. The Wonder models are a separate castle line (wood fort → wood castle → stone castle → fortress); a lord's seat shows the one for its level. Each kind of place on the world map has its own look, and Kingsbridge is a walled city. The north's mountain gate is a walled castle with the host camped outside; war camps are stake stockades full of tents. The old wall runs across the north of the map, whole in Part 1 and broken where the war camps' roads cross in Part 2. A place you run as a real village shows that village in miniature: its keep, and its buildings where they stand. Houses pick one of three styles at random: a closed timber hut at level I, tiled houses at II and III (the pack's open-frame huts read as building sites, so they aren't used). Wooden walls are a rough palisade of uneven stakes. Workshops mix in the Quaternius Medieval Village Pack (sawmill, blacksmith), which can later serve as upgrades of the RTS buildings. Building list can change to fit good models, as long as gathering and the layered production chains stay. |

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
- Bandit raids from 5:00, growing with each wave (archers from wave 3). Villagers flee to the keep. Raiders burn what they reach and leave after three fires or about 2½ minutes. If the keep falls, the game is lost.
- The lord's retinue of 20 swordsmen costs no villagers. You can send it to work: the men become villagers and their 20 swords and shields go to the nearest barracks (or the keep), so a barracks can arm them again as a levy.

**Sound** (`src/audio.js`, `assets/audio/`), 2026-11-19:
- Free music and sound, all CC0 or CC-BY, about 17 MB. Every file's source, author and licence is in [assets/audio/CREDITS.md](assets/audio/CREDITS.md), shown with the Quaternius models on `credits.html` (linked from the menu, each page's help and the sound panel).
- Music crossfades by mood: building (four tracks in turn), tense when raiders or an enemy are about, battle, siege (an assault on a keep), victory and defeat stingers, and the world map. Most tracks are RandomMind's CC0 medieval series; Kevin MacLeod's CC-BY tracks fill the gaps.
- Effects are heard from the camera: quieter with distance and zoom, panned left and right. Clashes, bows and arrow hits come straight from the battle; war cries when a regiment closes, a scream when one routs; chopping, picking, hammering, crates and a finished-building chime from the village; horn and drums when raiders come or a levy is raised; fire when raiders burn a building. Beds for village, forest, wind, battle din, marching feet and fire are mixed by what is on screen.
- At most 24 sounds at once, and a few of each kind; a louder sound replaces the quietest. Villages you are not watching stay silent.
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
- **Rivers**: about half of test fields and two in five campaign field battles have one. Deep water is very slow and a bad place to fight; fords are shallow; a wooden bridge crosses dry. Regiments march in column to the best crossing, three abreast on a bridge. Burn bridge (B, or the orders bar) sets one alight from your bank; it falls in about 40 s.
- **Fatigue**: fighting, charging and running tire a regiment (about 30 s of hard fighting spends it); standing still it recovers. Tired men walk slower, hit and guard worse and charge weaker, so fresh reserves win. Cards show Tiring, Tired or Exhausted.
- **Limited arrows**: about two minutes of shooting (24 arrows, 16 bolts a man). Empty bowmen refill at camp or, slowly, on their own walls; the AI sends its empty bowmen back. Cards count arrows.
- **Deployment**: field battles and storming a fort open with time stopped and your ground lit gold; right-click sets regiments down at once anywhere on it, then Begin battle (Enter). `?deploy=0` skips it.
- **Weather**: about 60% clear, 25% rain, 15% fog, the same for both sides. Rain: bows reach a fifth less and miss more, and heavy ground slows horse. Fog: no one sees past 70 m. `?weather=` picks one in the battle test.

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
| Money | Gold from taxes and markets. Most things cost goods; gold comes in for upgrades, mercenaries and retinues. |
| Mood | Each village has a mood from food variety, housing, taxes and war losses; mood drives growth. |
| Rivals | Real factions on the same rules, simulated cheaply when unwatched. About six named lords with traits and taunts (builder, raider, turtler, schemer…). |
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
