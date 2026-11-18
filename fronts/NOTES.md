# Marchfront

A small, high-level real-time strategy game, built alongside the main RTS and kept lean on purpose. Armies are tokens on one map; you drag them about, they fight where they meet, and land, terrain and supply decide the war. It belongs to the same family as War of Dots and Line Battle, but its map, rules and look are its own.

**Play:** serve the `fronts/` folder over HTTP and open `index.html` (plain scripts, no build step, no CDN):

```bash
python3 -m http.server 8000
```

## The setting

**The Sundered Vale.** The river Sunder runs north into a bay and splits the vale. The **Halvard March** (blue, the player) holds the west, the **Corvane Dominion** (red, the AI) the east. Four free towns lie between. The sea closes the north, mountains close the south, and each bank has a tributary of its own. Roads link the towns; where a road crosses a river there is a bridge, and there are four fords besides.

## Rules

- **Armies** have a strength of up to 100. Big armies march a little slower. Drag one onto a friend to merge, or split it in two.
- **Land.** An army claims the ground within 3 cells of it, unless an enemy army is close enough to contest it. Supplied land also spreads slowly into neutral ground. Moving through enemy-held land is about half as fast.
- **Supply** runs from your capital through connected land you hold. Supplied armies refill from manpower; cut-off armies lose strength, hit 40% softer, and the cut-off land is slowly absorbed by the enemy. Encirclement is the main way to win a front.
- **Combat.** Enemy armies within 2.8 cells fight. Each side deals 4% of its strength a second, split between its foes, divided by the target's defence. An army in battle can only move away from its foes.
- **Defence** multiplies: plains 1, forest 1.3, hills 1.35, mountains 1.7, a river 0.75 (a bridge or ford 0.9), up to ×1.35 for digging in after six still seconds, and ×1.35 by a friendly town (×1.6 by the capital). Wading armies also hit 25% softer.
- **Towns** have garrisons (15 free, 30 held, 70 at a capital) that fight anyone besieging them, and refill when supplied. Once the garrison is beaten and no defender is near, the town falls after a few seconds (8 for a capital).
- **Manpower.** Income is 0.4 a second, +0.45 for each supplied town and +0.8 for the capital. Raising an army costs 30 and gives a 30-strength army at a supplied town with no enemy near. Manpower above 30 refills your armies, so you are always choosing between new armies and full ones.
- **Win** by taking the enemy capital; lose if yours falls.
- **Difficulty** scales the AI's manpower income: Easy ×0.75, Normal ×1, Hard ×1.3.

## The AI

Every 1.2 seconds it raises armies (only once its armies are mostly full, or its reserve is large) at the town nearest danger or the front. It then scores targets (free and enemy towns, its own threatened towns, raiders in its land) by value, distance and how much strength each needs, and shares out its armies greedily. It gathers short of a strong target until enough friends have joined, pulls badly outmatched armies back to a safe town, and folds weak armies into friends. It is good at raiding round a careless front and taking an empty capital.

## Controls

Drag from an army to move it, onto an enemy to attack, onto a friend to merge. Drag on the map to box-select (Shift adds). Right-click sends the selection. Shift-drag or **L** spreads the selection along a drawn line. **R** raise, **S** split, **H** hold, **A** select all, **Space** pause (orders still work), **1 2 3** speed, scroll to zoom, middle-drag or arrows to pan.

## Code

- `js/map.js`: seeded terrain, rivers, fords, town placement, roads, A*.
- `js/sim.js`: armies, combat, land, supply, garrisons, manpower, win check. Pure logic, no DOM.
- `js/ai.js`: the opponent.
- `js/render.js`: the ink-and-wash map, territory wash, front line, towns, tokens.
- `js/main.js`: input, HUD, title and end screens, game loop (20 Hz fixed step).

`?watch` makes the AI play both sides (`&speed=8`, `&mult=1.3` optional). With the same code, AI-vs-AI games run 4 to 10 game minutes. Because it is a mirror match, the side whose AI thinks slightly later wins most of them; that does not matter against a human.

## Tested (2026-11-18)

- Won a full game against the first AI through the UI (7:06 game time). It fielded swarms of 30-strength armies that never refilled; fixed by making it raise only when its armies are mostly full.
- Lost a full game against the fixed AI (6:25): it raided round my push, cut Iskel off and took an empty Halvard. A besieging army was refilling at full rate; sieges now count as battle for refills.
- A naive "stack everything and march at the nearest town" script loses to the AI on every difficulty.

## Ideas, not built

Fog of war, generals with traits, more maps or a seeded map option, naval landings, a proper retreat/rout state, sound, pinch-zoom for phones.
