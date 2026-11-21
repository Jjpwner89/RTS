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
