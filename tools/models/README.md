# Model tools

`assets/models.glb` is baked from free CC0 Quaternius packs by the tools here. Nothing in this folder runs in the game.

- **Soldiers and villagers:** Quaternius modular men and women, posed once and baked. The gear comes from the Quaternius knight (helmets, shoulder pads) and medieval weapons packs. Body armour and the team surcoat are shells grown over each figure's torso. Each unit is split into *gear* (fixed colours) and *cloth* (grey shades that the game tints with the side's colour). Each also has a light version simplified to about 1,500 triangles with meshoptimizer; the game draws the light one away from the camera.
- **Buildings:** Quaternius Ultimate Fantasy RTS (houses in three styles, the town centre at levels I–III as the keep, the wooden castle for lords' seats, farm, mine, market, archery range, barracks and others). Quaternius Medieval Village Pack supplies the sawmill (carpenter) and blacksmith (smelter, weaponsmith).

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

It writes `/tmp/out/models.glb`; copy that to `assets/models.glb`. Change what goes in it in `lineup/bake.js` (`UNITS` and `BUILDINGS`).

`fetch.py` only gets the packs the bake uses. The full lineup page also compares KayKit, Kenney and other Quaternius sets; those come from kaylousberg.com, kenney.nl and quaternius.com.

## Licences

All the models used are CC0 (public domain): Quaternius (quaternius.com), the 2018 packs and the Ultimate Fantasy RTS and Medieval Village packs. Credit is not required, but given here. Quaternius's newer packs (from November 2026) use a different licence that forbids redistributing the files, so don't add those.
