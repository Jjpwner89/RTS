# Genre basics

What players of Stronghold, Age of Empires, Total War and Manor Lords expect without thinking about it. Missing any of these reads as broken or cheap, however deep the systems underneath. See [HOW_WE_BUILD.md](HOW_WE_BUILD.md).

**Status** is filled in by the quality-check session after playing: ✅ there and good, ⚠️ there but weak (say why), ❌ missing, ❓ not checked yet. Everything starts at ❓. Keep the notes short and dated.

First audit, 20 Nov (quality-check session). Played: a fresh campaign's opening, the Lord test (templates, a storm of unwalled Brackholm, its capture, granting it and Cranholm Castle to a vassal and looking round both, a storm of walled Emberley), and checks() on every page. Still ❓ because they need the browser pane on screen to watch motion: animations, the first 30–40 minutes of a new campaign, battle.html's river map, and the Muster page. Screenshots are in the group's notes folder, under qc-shots/.

Second pass, 21 Nov. Played: a river battle on battle.html (seed 11), soldiers and knights marching close up, storms of Hollwick (a village) and Ashley Castle in the Lord test, and the Muster page, with checks() on each. The pane was still hidden, so I stepped time from the console and took stills: anything about motion (feet skating, how a clip plays) stays ❓.

## Units

| Basic | Status | Notes |
|---|---|---|
| Walk, run and idle animations; feet don't skate | ❓ | Units slid with a bob until the animation wiring (2026-11-20). 21 Nov: stills show spearmen in stride, spears upright, shields on; the clip follows each man's speed (march under 3.6 m/s, run above). Skating needs a visible pane |
| Attack, block, hit and death animations that read at battle distance | ❓ | |
| Riders and horses walk, trot and gallop by speed | ❓ | 21 Nov: stills show knights seated with lances, horses mid-stride; trot under 5 m/s and gallop above in the code. Needs a visible pane to judge |
| Villagers visibly do their job: chop, mine, hoe, carry, build | ❓ | |
| Corpses or a fall, not units vanishing | ❓ | |
| Units turn to face where they move and fight | ✅ | 21 Nov: a long move turns the men to march; short moves sideways, back or forward keep their facing exactly (3b0afe1). Facing in a melee not checked |
| Units don't overlap, clip through walls or buildings, or stand in water | ⚠️ | 20 Nov: villagers walked through the keep and into storehouses (checks() caught it); fixed in 88c4adc and 8526f15. 21 Nov, river map (seed 11): over about 170 s of fighting nobody stood in deep water without an order, and the fight jammed onto the bridge. But regiments far from a crossing swim the deep channel straight over (75 men in it at once) instead of marching to the ford. Battles: intended when a crossing is more than about 70 m out of the way (DESIGN_NOTES, Rivers) |

## Selection and orders

| Basic | Status | Notes |
|---|---|---|
| Clear selection marking (rings, banners, cards) | ⚠️ | 20 Nov: there's a footprint outline and a highlighted card, but both are faint at storm distance; the selected regiment's banner doesn't change |
| Hover highlight on units, buildings and places | ⚠️ | 20 Nov: on the map, only the cursor changes over a place. A place's label (the obvious target) can't be clicked or right-clicked; you must hit the small model |
| Box select, add or remove with Shift/Cmd/Ctrl, double-click for all of a type | ✅ | Fixed 2026-11-20 (3b0afe1). 20 Nov: box select picks a regiment by its banner or men in a storm. Double-click not tried |
| Orders show where they go (a move marker, a line preview) | ⚠️ | 20 Nov: in a fight, a ghost outline marks the destination. On the world map a marching army shows no route line |
| Units acknowledge orders at once (a voice, a sound or movement within a moment) | ❓ | |
| Control groups (Ctrl+1–9) | ✅ | Built 2026-11-21 (2c13600). 21 Nov: Ctrl+1 makes a group, 1 recalls it, Shift+2 adds another (keys pressed from the console). The number on the card not yet seen on screen |
| Formations keep their shape on the march and through gaps | ❓ | 21 Nov: short moves step across or back as a block (3b0afe1); regiments go into column only at a crossing. Gaps between buildings not checked |

## Buildings and the village

| Basic | Status | Notes |
|---|---|---|
| A placement ghost, green or red, with the reason it can't go there | ✅ | 20 Nov: a single building shows a green or red ghost with the reason; templates show green ghosts (the red ones for what won't fit are in Realm's screenshots; I didn't see them myself) |
| Templates show every building's outline before you place them | ✅ | Asked of Realm 2026-11-20. 20 Nov: Workshop yard showed all 6 ghosts and "6 of 6 fit"; the second yard on the same spot moved itself to clear ground |
| Construction stages: scaffold, then rising, then finished | ❓ | |
| Every building says what it's doing or why it's stuck | ❓ | Bottleneck notes 2026-11-20 |
| Worker and hauler paths look sensible, use roads, and don't get stuck | ⚠️ | 20 Nov: 12 template sites were hauled and built in about 2 game minutes. Walk-throughs fixed in 8526f15; roads through gates not played |
| Burning, damaged and ruined states | ❓ | |
| Places look like what they are: walls where walled, castles like castles, towns with streets | ⚠️ | rts-places session from 2026-11-20. 20 Nov: walls now match the numbers on the map, in storms and in look-rounds (b8f93e9). 21 Nov, after places.js (ddec890, d3f733c): storms of Hollwick and Ashley Castle placed every building in the tally; Ashley has a level-3 stone keep inside a 26-piece stone curtain; anything that can't be placed is now said. Streets not yet seen on screen, small places still read sparse (Coldden has 8 houses), and the Brackholm road house not rechecked |

## Information and feedback

| Basic | Status | Notes |
|---|---|---|
| Tooltips on every button, good and number | ❓ | |
| Every resource shows what it is, how much, and whether it's rising or falling | ❓ | |
| Alerts for what needs you, with a way to jump there | ⚠️ | *Needs you* list. 20 Nov: *Needs you* lists the right things, but events still pop up as modals the moment a fight ends (masons straight after taking Brackholm) |
| Every action has a sound; important events have a distinct one | ❓ | Second sound pass 2026-11-20 |
| Damage, morale and routs are readable without reading numbers | ❓ | |
| Victory and defeat are clear, and you know why you won or lost | ⚠️ | 20 Nov: "You have taken Brackholm" and the gold toast are clear. A storm without engines warns you first now, then costs 13 of 31 men in about 20 s with no defender lost |

## Camera and comfort

| Basic | Status | Notes |
|---|---|---|
| Smooth pan, zoom and rotate; no drift after a drag | ❓ | Drift reported 2026-11-19, fix unconfirmed. 20 Nov: world drag pans directly with no momentum in the code; the map moved between my screenshots twice, but the pane was hidden, so not confirmed |
| Edge-scroll or WASD, and centring on a selection | ⚠️ | 20 Nov: WASD, arrows, Q/E and F to centre work; there's no edge-scroll, and in a village or battle left-drag selects, so only the keys pan. Edge-scroll added in battles and villages 2026-11-21 (2c13600), not yet tried |
| Pause, and orders while paused | ✅ | 20 Nov: Pause in the top bar and on Space; "Paused: you can still build and give orders" |
| Game speed control | ✅ | Built 2026-11-20. 20 Nov: ½× to 4× in the top bar, and 1/2/3 keys. The deploy countdown runs at game speed, so at 4× a storm starts before you've read the deploy panel. The countdown runs in real seconds since 2c13600; speed moved to − and + (21 Nov: + steps it up) |
| Steady frame rate in the biggest battles and towns | ❓ | |
| No layout breaking at common window sizes | ⚠️ | 20 Nov: at 800×600 the left stock panel, the build menu and the Defences panel cover half the village, and toasts stack over each other at the top. The toast now sits above the panels (8526f15) |
| Keyboard shortcuts shown on buttons | ✅ | 20 Nov: build buttons show their letter key. 21 Nov: the battle orders bar shows them too (Line N, Tight T … Dig mine U, 2c13600) |

## Game flow

| Basic | Status | Notes |
|---|---|---|
| A clear first goal and a gentle first 10 minutes | ❓ | |
| Saves load reliably, old saves are migrated or refused cleanly | ⚠️ | 20 Nov: checks() reloads a snapshot in a hidden frame and compares the numbers: it passes on a fresh campaign, the Lord test and after a capture. Old saves are not checked |
| Loading shows progress; nothing freezes for long without a sign | ❓ | |
| Settings: volume, quality, keys | ⚠️ | Volume only, so far |
| Help that explains each screen | ❓ | |
