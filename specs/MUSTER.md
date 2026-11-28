# Spec: the Muster (one sheet, one host)

Fable, 2026-11-28. Approved by the creator ("I like this all! let's do it"). Source: IDEAS_2026-11-28.md 2.3 and 2.10; playtest items 16 and 17; the late-game scout's report.

## Why

- Raising men is four separate buttons with separate rules: Call the banners, Call the arrière-ban, Gather your armies (Duke), and a vassal's call to arms.
- The creator asked to send the ban home early and to call it from one village or from all.
- The scout saw banners arrive as 9 to 11 columns of a dozen men, each printing a line and dissolving into a garrison. The army then dissolved again into every village it took. The ban's 13 minutes went mostly on walking. No battle had 300 men a side.

The goal: **one decision ("how large a host, from where, at what price") that produces one army that stays one army.**

## What the player sees

### The Muster sheet

Opened by one button, **Muster a host**, wherever the four calls are offered now: the realm panel, a place of yours, an army of yours. It replaces the banners preview, the arrière-ban prompt and Gather your armies. Rank gates stay as they are (`src/ui/unlocks.js`): banners and the ban from Lord, gathering armies from Duke. A Reeve keeps today's "Muster the garrison".

- **Where:** the muster place, defaulting as `musterPlace(w)` does now; pick another of your places from a list.
- **Rows, each with a tick box**, its men, its cost and when it would arrive (from `route` and the march pace):
  - **This place's garrison and levies** (what "Muster the garrison" takes).
  - **Your villages' spare men** (the banners), one row per village: its number from `bannerPlan`, and whom it would leave as guard.
  - **Your vassals' shares** (the banners' vassal part), one row per vassal, with the reason when one refuses.
  - **The countryside** (the arrière-ban), one row per place, each with its own state: ready, out (home in N min), or resting (again in N min). Gold per row; food shown as a rate.
  - **Your armies in the field** (from Duke), one row per free army.
  - A **Tick all** and a **Clear** per group.
- **The foot of the sheet:** total men against the army cap ("740 of 1,000"), gold now, food a minute, and the last arrival ("all here in about 4 min"). Over the cap, it says who would stay, as `muster()` does.
- **One button: Muster.** One log line and one notice for the whole call, not one per column.

### The host

Everything raised by one Muster is **one host** with a name ("The host of Ashford") and an id.

- Columns march to the muster place as now (`stageColumns` for those with no friendly road). On arrival they go into the village as now, but they keep the host's mark.
- The muster place's card and the Needs you list show the host gathering: "The host of Ashford: 412 of 740 here, the rest in about 2 min." No per-column lines.
- **March the host** on that card takes every regiment with the host's mark out as one army, within the cap, in one click. It can be pressed before everyone is in ("March with the 412 here; the rest follow"): latecomers follow the host's road and join it (`join`), or wait at the muster if it has gone into enemy land.
- **A host stays a host.** When it takes a place and goes in, its regiments keep the mark; the new place's card offers **March the host on** and a **garrison to leave** (default: the fewest whole regiments that make the place's guard, as the banners' guard is reckoned). When it comes home to a village of yours, the same.
- **Disband the host** on its card sends each part home by its own road: levies back to their villages as villagers, vassals' men to their lords, the ban home (below), armies that were gathered stay as armies.
- A host's mark is dropped when it is disbanded or has no men left.

### The arrière-ban, per place

- **Each place has its own ban state** (`p.banUntil`, `p.banRest`, or a small object), replacing the single `w.arriere = { until, rest }`. Calling some places leaves the others ready, so bans can be rotated or called all at once.
- **The clock starts on arrival.** A place's levies serve `ARRIERE.serve` from the moment their column reaches the muster place (or its stage), or from 5 minutes after the call, whichever comes first. The place where they are called starts at once.
- **Send them home early:** from the host's card or the Muster sheet, per place or all. They go home now (`returnToRoster` for the armed), and the place's rest (`ARRIERE.rest`) starts now.
- Price, numbers by rank, the armed roster, food and the hungry rule stay as they are.
- **The houses use the same rule** (`houseBan`, `houseCall`, the league's levy): per place, clock on arrival. No rule for them that the player lacks.

## Rules that stay

- The banners' guard, the levy floor, never a trained kind, vassals who won't march on kin, friendly roads only: all as now. `bannerPlan` stays the one reckoning; the sheet reads it per village.
- Army caps by rank. Food: carts load at the muster as `muster()` does.
- `callHeard` (the houses hear of a call) fires once per Muster.
- One way of doing each thing: the old buttons and their code paths are removed, not left beside the sheet. Hotkeys that pointed at them point at the sheet.

## Saves

Saves may break (creator, 2026-11-23). Bump the save version only if loading an old save would throw; an old save's `w.arriere` may simply be dropped.

## Checks (src/checks.js, a "Muster" group)

1. The sheet's total for a selection equals what the call then raises (men, gold), for banners, the ban and a mix.
2. Every regiment and unit raised by one Muster carries one host id; March the host yields exactly one army; no column of a host dissolves without its mark.
3. After a host takes a place and goes in, March the host on yields one army of the same men less the garrison left.
4. The ban: calling place A leaves place B ready; A's clock starts on arrival (or at 5 min); sending A home early starts A's rest then; a house's `houseBan` obeys the same per-place state.
5. No path still reads or writes `w.arriere`; no button with the old acts remains (`banners`, `gather`, the arrière-ban prompt).
6. One log line and one notice per Muster.

## Done means

Played by hand at Lord, Count and Duke test worlds on a real screen (headless Chrome is fine): a mixed muster of banners, ban and vassals gathers as one host, marches as one army, takes a place, marches on, and is disbanded; the ban is rotated between two places and sent home early; a house calls its ban under the same rule (read from `window.game`). Screenshots of the sheet and the host's card at each rank. `checks()` 0 fails on lord, count, duke and king. DESIGN_NOTES updated ("The Muster"), replacing the banners and arrière-ban sections' interface notes. Say plainly what was not seen.
