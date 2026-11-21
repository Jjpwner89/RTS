# Model tools

`assets/models.glb` is baked from free CC0 Quaternius packs by the tools here. Nothing in this folder runs in the game.

- **Soldiers and villagers:** Quaternius modular men and women, posed once and baked. The body keeps the pack's Idle pose; the arms take a *holding stance* (`assets/art/3d/clips-stances.glb`, made by `assets/art/3d/wip/stance-motions.mjs` with the clip tools), so the hands close on the kit. Weapons hang from the fist's grip, with the shaft along the stance's grip line and the edge forward. Shields are strapped to the left forearm and face forward, angled a little out. The gear comes from the Quaternius knight (helmets, shoulder pads) and medieval weapons packs. The team coat and body armour are shells grown over each figure's torso; each shell is pushed out until it clears the shirt and the coats under it, with the armour over the coat and the coat's skirt showing below. Hair is tucked in to the skull so helmets cover it. Each unit is split into *gear* (fixed colours) and *cloth* (grey shades that the game tints with the side's colour). Each also has a light version simplified to about 1,500 triangles with meshoptimizer; the game draws the light one away from the camera.
- **Animation:** the soldiers, riders, their horses and the villagers move in the clips in `assets/art/3d` (`clips-foot.glb`, `clips-riders.glb`, `clips-horse.glb`, listed in `wip/clip-manifest.json`). `lineup/skin.js` samples every clip into one table of bone matrices, `assets/anim.bin` (described by `assets/anim.json`), and gives each baked vertex its bind position and up to four bone weights (two in the light version). The game skins them on the GPU (`src/anim.js`), so every instanced man plays his own clip. Weapons, shields, bows and the villagers' tools are "props" that each clip places at its own grip, or hides. The lords' parties stay posed. Women are retargeted from the men's clips. The horse's stock walk stalls halfway, so horses walk in a slowed trot. Gaits are chosen and paced by ground speed so feet don't skate: `src/anim.js` measures each walking clip's stride from the clip itself (`gaitSpeed`), and `gaitFor` picks the slowest gait that keeps up. Walking and running use the stock Walk and Run legs (`WalkArmed`, `RunArmed`, `CarryWalk` and `CarryRun` add the upright weapon or the load), because March_Upright and Carry step too short for the game's paces.
- **Units:** spear, sword, archer, heavy cavalry (`cav`), crossbow, light cavalry (`lightcav`), men-at-arms (`maa`), mounted knight, mounted captain, militia, the village militia (`folk`: a farmer in undyed clothes with a pitchfork made in code, the team colour on a sash and hat band), bandit and villager, plus a camp `tent`. Riders sit on the Quaternius horse; saddle cloths, knights' caparisons (a cloth shell fitted to the horse's body), the captain's cape and plume take the team colour.
- **Buildings:** Quaternius Ultimate Fantasy RTS (houses in three styles, farm, mine, market, archery range, barracks, storehouse, watchtower, windmill, temple, port and others). Upgrade levels are `<kind>.2` and `<kind>.3` (houses: `house.<style>.2`). The village keep (`keep.1`–`keep.5`) is a hall that grows: TowerHouse first and second age, the second-age barracks with its three towers, then the second age's great stone keep with one tower and then two, with no curtain walls (walls are built separately). The smallest Wonder is the `fort`, for forts and camps. The Wonder line is `castle.1`–`castle.4` (wood fort, wood castle, stone castle, fortress). Quaternius Medieval Village Pack supplies the sawmill, blacksmith, stable, tanner, bakery and props, including the supply `wagon` and the world map's merchant cart (`wagon.trade`) and loaded supply cart (`wagon.run`). The `cathedral` is the pack's great stone temple.
- **Walls and sieges:** `wall.stone`, `wall.wood`, their `.broken` rubble, `tower.stone`, `tower.wood`, `gate.stone` and `gate.wood` with separate `.door` leaves, all to the battle's measurements (10 m pieces along x, outer face toward −z). The walls stretch the Fantasy RTS walls and add merlons and walkways. Siege engines are the Kenney Castle Kit's (`siege.ram`, `siege.mangonel`, `siege.trebuchet`, `siege.tower`), recoloured from its toy orange and blue to wood and hide, with the throwing arms as separate `.arm` pieces. `siege.ladder` and `siege.stone` are drawn in code.

`lineup/` is the comparison page used to choose these models (the "RTS Model Lineup" artifact). `lineup/current/` is a copy of the game's procedural models from before the switch, so the page can still compare against them.

## Rebuild the models

From this folder, with a scratch copy of `lineup/` outside Documents (macOS won't let Python serve from Documents):

```bash
cp -R lineup /tmp/lineup && python3 fetch.py /tmp/lineup && python3 pack.py /tmp/lineup
mkdir -p /tmp/out && python3 saveserver.py /tmp/lineup /tmp/out 8852
```

Open http://localhost:8852/roster.html?only=none and run this in the browser console:

```js
(await import('/bake.js')).bakeAll()
```

It writes `/tmp/out/models.glb`, `anim.bin` and `anim.json`; copy all three to `assets/`. The three must come from the same bake: a model's bone numbers only mean something in its own clip table. Change what goes in it in `lineup/bake.js` (`UNITS`, `BUILDINGS` and the full-game additions after them). `bakeAll(/^unit\.knight$/)` bakes just the matching models and returns them without saving, for a quick look.

To change only the soldiers, bake `bakeAll(/^unit\./)` and swap its `unit.*` meshes into the existing `assets/models.glb`, so the buildings stay byte for byte. `bakeAll` with a pattern returns the scene without saving; export it in the console (`new GLTFExporter().parseAsync(scene, { binary: true })`, PUT to `/save/part.glb`), then `python3 swap.py ../../assets/models.glb /tmp/out/part.glb unit.folk.` replaces or adds the models named `unit.folk.*` and copies every other one unchanged. Only the soldiers' meshes change this way, so `anim.bin` and `anim.json` stay as they are. After changing the stances, rerun `assets/art/3d/wip/make-clips.mjs` and `fetch.py`, then `pack.py`.

## Viewer

`tools/viewer.html` shows what the game draws, outside the game. It imports the game's own code, so what it shows is what a battle or a village shows. It changes no game code and writes no saves or settings. Serve the repository and open `tools/viewer.html`; it has an orbit camera on every tab, and a light or dark ground (on Places, where the ground is the game's own, the toggle only changes the sky).

- **Clips on units:** pick any unit, armour level and shield, full or light version, and play any clip of its skeleton on the game's GPU-skinned mesh (`src/anim.js`). Play, pause, scrub, and a speed slider. The *move* slider scrolls the metre grid under the man at that speed, so a sliding foot shows. *Game gait* lets the battle view's `soldierClip` pick idle, walk, march or run and pace it for that speed, as in battle (a rider's horse trots or gallops). For a walking clip the note gives how fast its planted feet cover ground at 1× (`gaitSpeed`).
- **Buildings:** every building at every level it can reach, drawn by `TownView.geo` (which falls back to the level below, then to a code shape), then the keep, castle and fort lines, then walls, towers and gates in wood and stone, standing and broken, as a siege draws them (`SiegeView.geo`), and the siege engines and carts. Red labels mark pieces with no baked model. *Go to* jumps the camera to one piece.
- **Places:** every kind of place the game makes (villages, mining villages, fords, abbeys, market towns, lords' seats on a village or a castle, castles, Kingsbridge, bandit camps, and the north's mountain gate, war camps, villages, holds and markets), at each wealth and walls the game seeds it with, new, 15 minutes on and an hour on (the camps and the north: new and grown full). Each comes through the game's own path: `World.seedHolding` seeds its numbers, `runEconomy` grows them, `World.makeTown` and `places.js` `layPlace` lay it into a town as a storm does, and it is drawn with the game's ground, roads, trees, `TownView` and `SiegeView`. The tally panel sets the place's numbers (`tallyOf`) beside what was laid out (`layoutOf`) and what stands in the town, with `checkPlaces`' problems in red, and lists every place at the seed with its check (the camps and the north, which `checkPlaces` leaves out, get the same tally-against-layout count). *Go to*, ‹ › and the list step through them; *Next seed* lays them all out again on new ground.

`?tab=clips|buildings|places&unit=spear&armour=plate&shield=0&clip=Walk&move=1.6&dark=1&seed=1&place=0` opens it on a given view.

## Soldier inspector

`inspect.html` shows the soldiers in a models.glb put together exactly as the game does (`src/models.js` `unitLook`): any unit, armour level, with or without shield, full or light version, in four fixed views, with close-ups on the hands or the head. It reads nothing from the game and writes nothing. Serve the repository and open `tools/models/inspect.html`; `?unit=maa&armour=plate&shield=0&focus=hands&file=<another models.glb>` picks what it shows, and `window.inspect.set({...})` changes it from the console.

`fetch.py` only gets the packs the bake uses. The full lineup page also compares KayKit, Kenney and other Quaternius sets; those come from kaylousberg.com, kenney.nl and quaternius.com.

## Licences

All the models used are CC0 (public domain): Quaternius (quaternius.com), the 2018 packs and the Ultimate Fantasy RTS and Medieval Village packs, and Kenney's Castle Kit (kenney.nl), whose siege engines are kept in `kenney/`. Credit is not required, but given here. Quaternius's newer packs (from November 2026) use a different licence that forbids redistributing the files, so don't add those.
