# How we build

Adopted by the creator on 2026-11-20, after playing a build where features had been called done but didn't hold up: simulated cities without walls, forts that looked wrong, towns that didn't match their numbers, and units that slide instead of walk. Every session working on this game reads this file before starting and follows it.

## 1. Done means done

Before you report anything as done:

- **Play it by hand in the browser.** Scripted runs are good for balance numbers, but they don't count as testing. Take screenshots of what you checked and send them with the report.
- **Check every place the feature shows up.** A place appears in the village, when stormed, when captured, in a look-round, on the world map, in a spy report, in saves and in auto-resolve. A unit appears in battle, in a village fight, on the map and on the Muster page. Rivals and vassals use the same rules. Check each one that applies, not just the one you built for.
- **No console errors** on `world.html`, `town.html` and `battle.html`.
- **Run the consistency checks** (section 4) and say that they pass.
- **Say plainly what isn't done or wasn't checked.** "Not checked in a siege" is useful; "done" when it wasn't checked is not.

## 2. One way of doing each thing

Build a feature once and share it with every view that needs it. When the storm, the capture, the look-round and the world map each made their own version of a place, they disagreed. Before adding a second code path for something that already exists, use or extend the first one.

## 3. No silent failures

If something can't be placed, played, loaded or found, the game says so in the console (`console.warn` with what and why) and, where a player would notice, on screen. Never quietly give up after N tries, cap a count without saying so, or fall back to nothing.

## 4. Consistency checks

`checks()` in the browser console (src/checks.js, built by the quality-check session) runs a set of invariant checks on whatever is loaded and prints what fails. Every session runs it before pushing, and adds a check whenever it fixes a bug that one could have caught. Starting set:

- World-map numbers for a place (people, buildings, walls, garrison) match its town when you open it.
- Every building in a place's tally is placed in its town.
- A place whose numbers say walled has walls in every view.
- No villager or soldier stuck in the same spot with a task for over a minute; nobody standing in water or inside a building.
- Every regiment's men, armour and kit add up; nothing negative in any store.
- Every sound, model and icon that the code names exists.
- A save and reload gives back the same numbers.

## 5. A quality-check session

One session never builds features. It plays each batch by hand against this file and [GENRE_BASICS.md](GENRE_BASICS.md) before the creator is told something is ready, and sends problems to the session that owns the file. The author doesn't mark their own work.

## 6. The genre basics

[GENRE_BASICS.md](GENRE_BASICS.md) lists what players of Stronghold, Age of Empires, Total War and Manor Lords expect without thinking about it: animation, feedback, readability, comfort. Check new work against it, and keep it current when something obvious turns up missing.

## 7. Finish before widening

A feature isn't finished until it has, where it applies:

- the rules
- its look and animation
- its sound
- its UI and help text
- rivals and vassals using it
- save and load
- the consistency checks

Fewer features at once, each one whole. A half-finished feature goes on the roadmap as unfinished, not under "Built so far".

## 8. Relaying to the creator

The question-thread session that talks to the creator pulls each reported change, opens it, looks, and runs `checks()` before telling the creator it's ready. A session's report is a claim until someone else has looked.
