# Scouted assets, ready to wire

Free models found for things the game lacks or draws in code, picked from a lineup against what the game draws today. Nothing here is loaded by the game yet. Each group is handed to the session that owns that part of the game, which decides whether and how to wire it. The asset scout found them on 2026-11-21.

Every file is **CC0 1.0** (public domain), from a Quaternius pack released before the Quaternius Asset License of 28 August 2026, which forbids redistribution and doesn't apply retroactively. The licence of each pack is checked on its own page (linked below). The files come from two mirrors of those packs: [trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase) (its [LICENSES.md](https://github.com/trebeljahr/quaternius-showcase/blob/main/LICENSES.md) lists every pack as CC0) and [beep2bleep/FreeAssetsByKenneyNLandQuaternius](https://github.com/beep2bleep/FreeAssetsByKenneyNLandQuaternius) (the 2018 FBX packs, under Quaternius's CC0 License.txt), plus two Quaternius models from [Poly Pizza](https://poly.pizza) marked CC0 there. The game already credits Quaternius in `credits.html`, which covers these once wired.

**See them:** serve the repository and open `tools/scout/lineup.html`. Each row puts what the game draws today (red labels) beside these picks at game scale, with sizes, triangle counts and clip names. The animals play their clips. Rows the scout compared and turned down show "rejected, not packaged".

## What's here

| Folder | Files | Fills | Source pack (licence page) | Owner |
|---|---|---|---|---|
| `animals/` | `Wolf.glb`, `Husky.glb` | War dogs (`unit.wardog` is a posed dog of spheres and boxes, bake.js `warDog`) | [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html), 2021 | Art (model), animations (clips) |
| `animals/` | `Sheep.fbx`, `Pig.fbx` | Livestock in villages and pens (none today) | [Farm Animals](https://quaternius.com/packs/farmanimal.html), 2018: the same pack as the game's horse | Art, animations |
| `animals/` | `Cow.glb`, `Bull.glb`, `Donkey.glb`, `Deer.glb`, `Stag.glb`, `Fox.glb` | Cattle and carts' donkeys in villages; deer, stags and foxes in the woods (none today) | Ultimate Animated Animals, 2021 | Art, animations |
| `animals/` | `Chicken.glb` | Hens in yards | Quaternius on [Poly Pizza](https://poly.pizza/m/ineV9pU5VL), CC0 | Art, animations |
| `nature/` | `CommonTree_1–5`, `PineTree_1–5`, `BirchTree_1–5`, `Willow_1–3`, `CommonTree_Autumn_1–2`, `CommonTree_Dead_1–2`, `PineTree_Snow_1–3` | Trees (terrain.js `treeKinds` builds oak, pine and birch from cones and icosahedra) | [Ultimate Nature](https://quaternius.com/packs/ultimatenature.html), 2019 | rts-fidelity (terrain) |
| `nature/` | `Bush_1–2`, `BushBerries_1–2`, `Bush_Snow_1`, `Rock_1–7`, `Rock_Moss_1–3`, `Rock_Snow_1–2`, `TreeStump`, `TreeStump_Moss`, `WoodLog`, `WoodLog_Moss`, `Plant_1–2`, `Flowers` | Bushes (three icosahedra) and stones (a squashed dodecahedron) in scenery.js; stumps for felled trees | Ultimate Nature, 2019 | rts-fidelity |
| `hall/` | `Inn.glb` | The knights' hall: `checks()` warns *no baked model for building 'hall'* | [Medieval Village](https://quaternius.com/packs/medievalvillage.html), 2020: the same pack as the stable and blacksmith | Art |
| `hall/` | `Target.glb`, `TargetWithArrows.glb`, `Dummy.glb` | Training props for the hall's yard, the barracks and the archery range | [Modular Medieval Buildings](https://quaternius.com/packs/modularmedievalbuildings.html), 2017 | Art |
| `water/` | `Boat.glb`, `BoatWSail.glb`, `Viking_boat.glb` | Rowing boat or ferry at fords and the port; a sail boat; a longship for Norrhold | [Ships](https://quaternius.com/packs/ships.html), 2018 | Art |
| `water/` | `SmallBridge.glb` | A timber footbridge over a stream (the battle bridge is boxes in fieldview.js) | Quaternius on [Poly Pizza](https://poly.pizza/m/j4KsIuJYnq), CC0 | Art |
| `village/` | `Bell_Tower.glb`, `Bonfire.glb`, `Bonfire_Lit.glb`, `Fence.glb`, `Bench_1.glb`, `MarketStand_1.glb`, `MarketStand_2.glb` | Dressing for the square, abbeys, camps and pens | Medieval Village, 2020 | Art |
| `village/` | `Wheat_1–4`, `Apple_4`, `Pumpkin_4`, `Carrot_4`, `Lettuce_4` | Crops at four growth stages for fields; apple trees for orchards | [Ultimate Crops](https://quaternius.com/packs/ultimatecrops.html), 2020 | Art, rts-fidelity |

## Notes for wiring

- **Scale.** The Medieval Village pieces match the game's stable at ×2.34 of their native size, as the bake already scales that pack. The animals' armatures are at ×100 inside their GLBs; measure them with skinning (`Box3.setFromObject(o, true)`) after `updateMatrixWorld`, or they read at 1/100 of their size. In the lineup the war dogs stand 1.05 m to the ear (0.8 m at the shoulder, like the game's dog).
- **Clips.** Ultimate Animated Animals each carry 12–13 clips, among them `Walk`, `Gallop`, `Idle`, `Eating`, `Attack`, `Death` and hit reactions; they are in place. The 2018 sheep and pig carry `Idle` and `Walk` only. The chicken has 9.
- **Triangles.** The trees are 1,350–2,950 triangles each against about 100 for the code trees, and the game plants 900 or more, so they want the light versions the bake already makes (meshoptimizer) or an impostor beyond a distance. Rocks are 70–130 triangles, bushes 270–900, stumps and logs 230–610.
- **Colours.** The packs use flat material colours with no textures, which the bake turns into vertex colours like the other Quaternius models. The trees' leaves can keep a grey crown and take the game's per-tree tint, as the code trees do.
- **Turned down** (in the lineup, not packaged): the Fantasy RTS second-age barracks and archery range for the hall (their towers read as the keep's), the 2018 barns (American red barns), the Modular Medieval Buildings bridge (a gateway with chains), KayKit Medieval Hexagon bridges (hex-tile style), the sail ship (a galleon, too late), the 2017 dog and wolf (no colours, two clips), Fantasy RTS docks and the 2018 chicken coop.

## Second batch (2026-11-21): banners, camp, nobles, siege

All CC0, from [Poly Pizza](https://poly.pizza) uploads by Quaternius, Kenney and MiniPoly, each marked CC0 on its own page (linked). Comparison shots, including the CC-BY and rejected candidates, are in the scout's notes (`scout-shots/tents`, `banners`, `siege`, `nobles`).

| File | Fills | Source (licence page) | Owner |
|---|---|---|---|
| `banners/Banner_Crossbar.glb` | A war standard: a hanging cloth from a crossbar on a spear, for bannermen, lords' parties, camps and the keep (bake.js `banner()` is boxes) | Quaternius [Banner](https://poly.pizza/m/svYG8KZxjq) | Art |
| `banners/Banner_Pennant.glb`, `banners/Flag.glb` | A long swallowtail banner and a flag on a pole, for keeps, towers and the world map | Quaternius [Banner](https://poly.pizza/m/Kd94xlw5aj), [Flag](https://poly.pizza/m/FuOkF3WBrx) | Art |
| `banners/Wall_Flag.glb`, `banners/Banner_Wall.glb` | Banners hung on walls and gatehouses (house colours on a captured place) | Quaternius [Wall Flag](https://poly.pizza/m/TWDvd4qPzq), [Banner Wall](https://poly.pizza/m/dQjx8fBjIl) | Art |
| `banners/Flags_MiniPoly.glb` | Three swallowtail flags on spears with stone bases: muster points and the battle flag markers | MiniPoly [Flags](https://poly.pizza/m/ahsyGj1RmE) | Art |
| `camp/Tent_Quaternius.glb`, `camp/Tent_Kenney.glb`, `camp/Tent_Half_Kenney.glb` | Camp tents (`unit.tent` is a cone on a cylinder): the Kenney A-frame tents with timber poles read best as soldiers' tents; the cloth takes the team colour | Quaternius [Tent](https://poly.pizza/m/5Q7qIrfDxA), Kenney [Tent](https://poly.pizza/m/LrTs3hVGXv), [Tent Half](https://poly.pizza/m/eUcofH38Cq) | Art |
| `nobles/King.glb` | An animated king on foot (24 clips): the King rank, the crowning, a court | Quaternius [King](https://poly.pizza/m/I1gTjmuK2m) | Art, animations |
| `nobles/Crown.glb` | A crown prop for the King rank and the realm screen | Quaternius [Crown](https://poly.pizza/m/i0PZVuVlYv) | Art |

**Siege engines: nothing packaged yet, but two CC0 leads haven't been checked.** The free catapults on Poly Pizza (Poly/Google, CC-BY) are no better than the game's Kenney set. A later search found two candidates that may be. Neither is downloaded or lined up, because both need fetching by hand in a browser.
- **[Kenney Castle Kit 2.0](https://www.kenney.nl/assets/castle-kit)**, CC0. A full remake released 27 March 2024, while the game uses v1 from 2017. It has a covered ram, trebuchet, siege tower, ballista, broken versions and a ridge tent, in glTF. kenney.nl refuses scripted downloads.
- **[Ankers "Low Poly Medieval Weapons"](https://ankersassets.itch.io/low-poly-medieval-weapons)**, CC0 as stated on its page; pay what you want, and $0 works. It has a ballista, mangonel, covered ram, trebuchet, siege tower and tall pavise shields. FBX only.
- **CC-BY fallbacks**, flat colour, credit needed, on Sketchfab (downloading needs a login):
  - iedalton [Trebuchet](https://sketchfab.com/3d-models/trebuchet-15d2af4910dd456b96bc767b91894a4c), 5k triangles
  - iedalton [Siege Tower](https://sketchfab.com/3d-models/siege-tower-f2363930fd1b424ba896697528e1c82b), 11k triangles
  - BlackSpire [Siege Ram](https://sketchfab.com/3d-models/siege-ram-1cc40e0101c74a8c85060fb6777f76cf), 3.8k triangles

If neither CC0 pack beats the current set, the better engines are ours to build. BRIEFS 7.3 lists them as a 3D wish, not for Codex.

**The lords' parties** (bake.js `lordParty`) already outclass every free mounted-noble model found. The CC-BY carriage is a western stagecoach and was turned down.

**Pavilion tents** were not packaged. The CC0 lead is AnyRPG [Medieval Tents](https://opengameart.org/content/medieval-tents) on OpenGameArt: textured, .blend only, 5.6k triangles, not yet lined up. The CC-BY fallback is Carrigan's [General's Tent](https://sketchfab.com/3d-models/generals-tent-siege-equipment-assets-6003a17f60a04a4caa6f619edbe5e91a). The Quaternius tent above reads as a modern camping tent; the Kenney A-frames are the camp pick.

## Third batch (2026-11-21): ground textures and skies

All CC0, from [Poly Haven](https://polyhaven.com), whose [licence page](https://polyhaven.com/license) says every texture and HDRI there is CC0, with no credit needed. Each file's md5 matched the Poly Haven API. Not wired into the game. The ground is a painted shader (`groundMaterial` in `scenery.js`), so what to use is rts-fidelity's call.

**`textures/`**: 1k seamless tiles (JPEG, recompressed at quality 72 for size), named `<poly haven name>_diff.jpg`; the six with `_nor.jpg` also carry the OpenGL-convention normal map. Seamlessness was checked by tiling each 2×2.

| Use | Textures |
|---|---|
| Grass and meadow | `leafy_grass` (+nor; the green meadow), `sparse_grass` (dark), `grass_path_2` (worn, pale), `withered_grass` (dry, for late-summer and Norrhold edges) |
| Earth, fields and tracks | `farm_soil` (+nor), `farm_furrows` (ploughed rows, the fields under `LAND`), `muddy_tracks` (roads), `stony_dirt_path` (+nor), `brown_mud_leaves_01` (wet verges) |
| Forest floor | `forest_floor` (+nor), `forest_leaves_02` (autumn) |
| Rock, snow, sand, stone | `rocky_terrain`, `rock_face_03` (+nor; the steep sides), `mossy_rock`, `snow_02` (+nor; Norrhold), `coast_sand_01` (fords and shores), `cobblestone_floor_01` and `mossy_cobblestone` (village squares, bridges, keeps) |

**`sky/`**: 1k equirectangular HDRIs ("puresky": sky only, no ground clutter), `.hdr` loaded by three's `RGBELoader` and used as `scene.background` or with `PMREMGenerator` for light. The game uses flat background colours today and the camera rarely looks at the sky, so this is low value: `kloppenheim_06_puresky` (soft sun and scattered cloud), `kloofendal_overcast_puresky` (grey, for rain and fog), `belfast_sunset_puresky` (dusk), `qwantani_night_puresky` (night), `snow_field_puresky` (winter). Others looked at and not packaged: `kloofendal_48d_partly_cloudy`, `kloofendal_misty_morning`, `qwantani_dusk_2`.
