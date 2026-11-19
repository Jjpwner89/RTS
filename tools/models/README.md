# Model tools

`assets/models.glb` is baked from free CC0 Quaternius packs by the tools here. Nothing in this folder runs in the game.

- **Soldiers and villagers:** Quaternius modular men and women, posed once and baked. The gear comes from the Quaternius knight (helmets, shoulder pads) and medieval weapons packs. Body armour and the team surcoat are shells grown over each figure's torso. Each unit is split into *gear* (fixed colours) and *cloth* (grey shades that the game tints with the side's colour). Each also has a light version simplified to about 1,500 triangles with meshoptimizer; the game draws the light one away from the camera.
- **Units:** spear, sword, archer, heavy cavalry (`cav`), crossbow, light cavalry (`lightcav`), men-at-arms (`maa`), mounted knight, mounted captain, militia, bandit and villager, plus a camp `tent`. Riders sit on the Quaternius horse; saddle cloths, knights' caparisons (a cloth shell fitted to the horse's body), the captain's cape and plume take the team colour.
- **Buildings:** Quaternius Ultimate Fantasy RTS (houses in three styles, farm, mine, market, archery range, barracks, storehouse, watchtower, windmill, temple, port and others). Upgrade levels are `<kind>.2` and `<kind>.3` (houses: `house.<style>.2`). The town-centre line is the village keep (`keep.1`–`keep.5`); its first model is the `fort`, for forts and camps. The Wonder line is `castle.1`–`castle.4` (wood fort, wood castle, stone castle, fortress). Quaternius Medieval Village Pack supplies the sawmill, blacksmith, stable, tanner, bakery and props, including the supply `wagon`.
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

It writes `/tmp/out/models.glb`; copy that to `assets/models.glb`. Change what goes in it in `lineup/bake.js` (`UNITS`, `BUILDINGS` and the full-game additions after them). `bakeAll(/^unit\.knight$/)` bakes just the matching models and returns them without saving, for a quick look.

`fetch.py` only gets the packs the bake uses. The full lineup page also compares KayKit, Kenney and other Quaternius sets; those come from kaylousberg.com, kenney.nl and quaternius.com.

## Licences

All the models used are CC0 (public domain): Quaternius (quaternius.com), the 2018 packs and the Ultimate Fantasy RTS and Medieval Village packs, and Kenney's Castle Kit (kenney.nl), whose siege engines are kept in `kenney/`. Credit is not required, but given here. Quaternius's newer packs (from November 2026) use a different licence that forbids redistributing the files, so don't add those.
