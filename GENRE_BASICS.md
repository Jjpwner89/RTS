# Genre basics

What players of Stronghold, Age of Empires, Total War and Manor Lords expect without thinking about it. Missing any of these reads as broken or cheap, however deep the systems underneath. See [HOW_WE_BUILD.md](HOW_WE_BUILD.md).

**Status** is filled in by the quality-check session after playing: ✅ there and good, ⚠️ there but weak (say why), ❌ missing, ❓ not checked yet. Everything starts at ❓. Keep the notes short and dated.

## Units

| Basic | Status | Notes |
|---|---|---|
| Walk, run and idle animations; feet don't skate | ❓ | Units slid with a bob until the animation wiring (2026-11-20) |
| Attack, block, hit and death animations that read at battle distance | ❓ | |
| Riders and horses walk, trot and gallop by speed | ❓ | |
| Villagers visibly do their job: chop, mine, hoe, carry, build | ❓ | |
| Corpses or a fall, not units vanishing | ❓ | |
| Units turn to face where they move and fight | ❓ | |
| Units don't overlap, clip through walls or buildings, or stand in water | ❓ | |

## Selection and orders

| Basic | Status | Notes |
|---|---|---|
| Clear selection marking (rings, banners, cards) | ❓ | |
| Hover highlight on units, buildings and places | ❓ | |
| Box select, add or remove with Shift/Cmd/Ctrl, double-click for all of a type | ❓ | Fixed 2026-11-20 (3b0afe1) |
| Orders show where they go (a move marker, a line preview) | ❓ | |
| Units acknowledge orders at once (a voice, a sound or movement within a moment) | ❓ | |
| Control groups (Ctrl+1–9) | ❓ | |
| Formations keep their shape on the march and through gaps | ❓ | |

## Buildings and the village

| Basic | Status | Notes |
|---|---|---|
| A placement ghost, green or red, with the reason it can't go there | ❓ | |
| Templates show every building's outline before you place them | ❓ | Asked of Realm 2026-11-20 |
| Construction stages: scaffold, then rising, then finished | ❓ | |
| Every building says what it's doing or why it's stuck | ❓ | Bottleneck notes 2026-11-20 |
| Worker and hauler paths look sensible, use roads, and don't get stuck | ❓ | |
| Burning, damaged and ruined states | ❓ | |
| Places look like what they are: walls where walled, castles like castles, towns with streets | ❓ | rts-places session from 2026-11-20 |

## Information and feedback

| Basic | Status | Notes |
|---|---|---|
| Tooltips on every button, good and number | ❓ | |
| Every resource shows what it is, how much, and whether it's rising or falling | ❓ | |
| Alerts for what needs you, with a way to jump there | ❓ | *Needs you* list |
| Every action has a sound; important events have a distinct one | ❓ | Second sound pass 2026-11-20 |
| Damage, morale and routs are readable without reading numbers | ❓ | |
| Victory and defeat are clear, and you know why you won or lost | ❓ | |

## Camera and comfort

| Basic | Status | Notes |
|---|---|---|
| Smooth pan, zoom and rotate; no drift after a drag | ❓ | Drift reported 2026-11-19, fix unconfirmed |
| Edge-scroll or WASD, and centring on a selection | ❓ | |
| Pause, and orders while paused | ❓ | |
| Game speed control | ❓ | Built 2026-11-20 |
| Steady frame rate in the biggest battles and towns | ❓ | |
| No layout breaking at common window sizes | ❓ | |
| Keyboard shortcuts shown on buttons | ❓ | |

## Game flow

| Basic | Status | Notes |
|---|---|---|
| A clear first goal and a gentle first 10 minutes | ❓ | |
| Saves load reliably, old saves are migrated or refused cleanly | ❓ | |
| Loading shows progress; nothing freezes for long without a sign | ❓ | |
| Settings: volume, quality, keys | ❓ | Volume only, so far |
| Help that explains each screen | ❓ | |
