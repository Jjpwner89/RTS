# Scouted assets, ready to wire

Free models found for things the game lacks or draws in code, picked from a lineup against what the game draws today. Nothing here is loaded by the game yet. Each group is handed to the session that owns that part of the game, which decides whether and how to wire it. The asset scout found them on 2026-11-21.

Every file is **CC0 1.0** (public domain), from a Quaternius pack released before the Quaternius Asset License of 28 August 2026, which forbids redistribution and doesn't apply retroactively. The licence of each pack is checked on its own page (linked below). The files come from two mirrors of those packs: [trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase) (its [LICENSES.md](https://github.com/trebeljahr/quaternius-showcase/blob/main/LICENSES.md) lists every pack as CC0) and [beep2bleep/FreeAssetsByKenneyNLandQuaternius](https://github.com/beep2bleep/FreeAssetsByKenneyNLandQuaternius) (the 2018 FBX packs, under Quaternius's CC0 License.txt), plus two Quaternius models from [Poly Pizza](https://poly.pizza) marked CC0 there. The game already credits Quaternius in `credits.html`, which covers these once wired.

**See them:** serve the repository and open `tools/scout/lineup.html`. Each row puts what the game draws today (red labels) beside these picks at game scale, with sizes, triangle counts and clip names. The animals play their clips. Rows the scout compared and turned down show "rejected, not packaged".

## What's here

| Folder | Files | Fills | Source pack (licence page) | Owner |
|---|---|---|---|---|
| `animals/` | `Wolf.glb`, `Husky.glb` | War dogs: `unit.wardog` is the Wolf, on its own skeleton (lineup/skin.js `WOLF`, bake.js `wolf`) | [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html), 2021 | Art (model), animations (clips) |
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

**Siege engines: nothing packaged, and nothing to package.** Correction (2026-11-21): the game's engines already are Kenney Castle Kit 2.0. The five `siege-*.glb` files in `tools/models/kenney/` match the kit's own files byte for byte (checked by md5 against Kenney's 2.0 zip, which is on [OpenGameArt](https://opengameart.org/content/castle-kit) under Kenney's own account, CC0 on the page and in the zip's `License.txt`). An earlier note here said the game used the 2017 version; that was wrong. The kit has no tent, and its `-demolished` variants of each engine are the only unused part.
- **[Ankers "Low Poly Medieval Weapons"](https://ankersassets.itch.io/low-poly-medieval-weapons)**: CC0 as stated on its page, pay what you want, FBX only, 1.5 MB. Whether it has a ballista, mangonel, ram, trebuchet and siege tower is unverified (the page shows five unnamed siege images). itch.io refuses scripted downloads (429), so it stays on the creator's manual list: open the page's `/purchase` link, choose "No thanks, just take me to the downloads", and download the zip.
- **CC-BY fallbacks**, flat colour, credit needed, on Sketchfab (downloading needs a login): iedalton [Trebuchet](https://sketchfab.com/3d-models/trebuchet-15d2af4910dd456b96bc767b91894a4c), 5k triangles, and [Siege Tower](https://sketchfab.com/3d-models/siege-tower-f2363930fd1b424ba896697528e1c82b), 11k; BlackSpire [Siege Ram](https://sketchfab.com/3d-models/siege-ram-1cc40e0101c74a8c85060fb6777f76cf), 3.8k.

Better engines than the current ones are ours to build. BRIEFS 7.3 lists them as a 3D wish, not for Codex.

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

## Fourth batch (2026-11-21): animation sets

All CC0. Not wired; for the animations session. **None of these shares the game's skeleton** (`Male_Adventurer`: Root, Body, Hips, Abdomen, Torso, Chest, Neck, Head, Shoulder/UpperArm/LowerArm/Wrist, UpperLeg/LowerLeg/Foot, PT, no toes, arms about 60° down at rest). The core chain (three spine bones, neck, head, shoulder, arm, forearm, hand, thigh, shin, foot) maps one to one, so the clips need a bone-name map and a rest-pose correction, as the women already get from the men's clips.

**Clips the game's own source file already holds but `anim.json` doesn't use:** `Male_Adventurer.source.glb` carries `HitRecieve`, `HitRecieve_2`, `Roll`, `Interact`, `Wave`, `Kick_*` and `Punch_*`. Hit reactions need no retargeting at all.

| File | What | Source (licence page) | Fills |
|---|---|---|---|
| `anims/UAL1_Standard.glb` | Universal Animation Library 1, Standard, 45 clips on a Rigify humanoid (`DEF-` bones, T-pose, toes) | Quaternius, March 2025, [page](https://quaternius.com/packs/universalanimationlibrary.html): "CC0 License"; the zip's `License.txt` (copied here as `anims/UAL_License.txt`) says CC0 1.0 | `Push_Loop` (ram or tower crews), `Fixing_Kneeling` (repair or loading), `PickUp_Table`, `Interact`, `Sitting_*`, `Death01`, `Hit_Chest`, `Hit_Head`, `Idle_Torch_Loop` |
| `anims/UAL2_Standard.glb` | Universal Animation Library 2, Standard, 42 clips on the Unreal mannequin rig (`pelvis`, `spine_01`…, `upperarm_l`, same proportions as UAL1, so one bone map serves both) | Quaternius, January 2026, [page](https://quaternius.com/packs/universalanimationlibrary2.html), same CC0 wording | `Farm_PlantSeed` (sowing), `Farm_Harvest`, `Farm_Watering`, `TreeChopping_Loop`, `Walk_Carry_Loop`, `Hit_Knockback`, `OverhandThrow`, `Idle_Shield_Loop`, `Sword_Block`, `Chest_Open` |
| `animals/Sheep_animated.glb`, `Pig_animated.glb`, `Chicken_animated.glb` | Animated livestock on a simple 16-bone rig (one bone per leg), replacing the 2018 sheep and pig, which only have Idle and Walk | Quaternius on Poly Pizza: [Sheep](https://poly.pizza/m/rgJXF570ZK), [Pig](https://poly.pizza/m/u35l6uP5vj), [Chicken](https://poly.pizza/m/Z3RCoCYss4), each CC0 1.0 | Sheep and Pig: `Idle_Eating` (grazing), `Walk`, `Run`, `Death`, `Headbutt`, `Jump`. Chicken: `Idle_Peck`, `Run`, `Death`, `Attack` |

Use the Standard builds from these files (UAL1 of March 2025, UAL2 of January 2026). The Quaternius Asset License of 28 August 2026 isn't retroactive, but the itch pages now list UAL2 v2.2 of 28 September 2026, which is after it, so don't swap newer builds in. The paid Pro and Source tiers are not used.

**Fishing, hammering, sawing and digging** exist in the free KayKit Character Animations 1.1 ([CC0](https://kaylousberg.itch.io/kaykit-character-animations), Kay Lousberg, December 2025): `Hammering`, `Sawing`, `Digging`, `Fishing_Cast/Idle/Bite/Tug/Reeling/Catch`, `Work_A–C`, `Holding_A–C`, `Sit_*`, `Hit_A/B`, `Death_A/B`. **Not packaged**: the official free zip comes only through itch's name-your-price flow, and the only copy found was on an unofficial GitHub mirror that also redistributes the paid files. Someone should fetch the official free zip by hand. KayKit's rig has 23 bones, no fingers and chibi proportions, so its arm reach needs fixing.

**No free set covers** cranking a winch, hauling a rope, loading a siege engine, scything, or a sack on the shoulder (nearest stand-ins: UAL1 `Push_Loop`, UAL2 `Walk_Carry_Loop`, KayKit `Working_*`). Those stay in code. No CC0 animated goat or CC0 four-legged siege-crew clips turned up either. CMU motion capture is free but needs heavy cleanup; last resort.

## Sixth batch (2026-11-21): light vegetation for big battles

**`vegetation/`**: the vegetation, rocks, stumps, logs and mushrooms of the [Kenney Nature Kit 2.1](https://opengameart.org/content/nature-kit), 129 flat-colour GLBs (1.5 MB), CC0 on its OpenGameArt page (Kenney's own account) and in the zip's `Kenney_NatureKit_License.txt`, released April 2020. The kit's cliffs, paths, bridges and the like are left out.

Triangles (each count read from the GLB): pines `tree_pineSmallC/D` 54, `tree_pineTallA/B` 78, `tree_pineTallC/D` 98 (the `_detailed` ones 134–170), `tree_pineRoundA–F` 170–262; round trees `tree_fat` 50, `tree_tall` 72, `tree_simple` and `tree_small` 62, `tree_default` 114, `tree_oak` 196, `tree_detailed` 402, `tree_thin` 228; `_fall` and `_dark` variants of most. Bushes `plant_bush*` 16–104, grass tufts `grass_leafs` 36, `grass` 132, `grass_large` 224, rocks `rock_*` 16–172 (the `stone_*` set of the same shapes was left out), stumps 44–120, logs 96–310, flowers and mushrooms. The lineup is in the scout's notes (`scout-shots/vegetation.jpg`).

**How they compare with Ultimate Nature** (already in `nature/`, 1.4k–3k triangles a tree): these are toy-like and flat, a different style, with a teal-green and tan palette that wants a per-tree tint, and they are 1–3 m tall natively against 2–6 m. They suit the far LOD of a tree, where the shape matters and the detail doesn't (a pine of 54–98 triangles, an oak of 50–196), rather than the near one. The kit has no willow, no birch (`tree_thin` is the nearest guess), and no dead or snowy trees.

**`vegetation/dead/`**: `Dead_Tree01.fbx` and `Dead_Tree02.fbx` (168 and 194 triangles) from Lucian Pavel's [Simple Low Poly Trees](https://opengameart.org/content/simple-low-poly-trees), CC0 on the page, 2017. FBX, so they need loading with `FBXLoader` or converting.

**No free LODs or impostors turned up.** No CC0 pack ships a ready LOD set or multi-angle tree billboards (the one with LODs, rubberduck's 2015 Free Vegetation Pack, is Blender-only and mid-poly). So the cheap route is the game's own: render a tree to a few angles once, or cross two quads, and take the Kenney shapes for the middle distance.

Looked at and not packaged: Devil's Work.shop Low Poly Forest Pack (snowy trees at 98–262 triangles; its page says CC0 but the bundled licence text is a purchaser-style licence, so it needs a human check), KayKit Spooktober dead trees (216–302, CC0), Quaternius Nature Pack Vol. 3 (2018, CC0: rocks of 28–34 triangles, bushes of 86–214, trees of 390), and Quaternius Stylized Nature MegaKit (trees of 1.6k–10k, too heavy). Itch-only packs not fetched: KayKit Forest Nature Pack (CC0), Kenney Foliage Sprites (CC0) and Klamtii Tree Sprites (licence wording not CC0).
