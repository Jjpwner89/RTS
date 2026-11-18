# RTS design notes

The one home for this game's goals, decisions and open questions. Working title: none yet.

## What the creator wants

- Favourites: **Total War** first, then **Crusader Kings** and **Stellaris**.
- Real time preferred; a mix with turn-based layers is fine.
- The feeling of **building up gradually, reaching scale, then playing with that scale**: minor lord → duke → king → emperor, or one world → a few colonies → a galaxy.
- **Every rank keeps its own challenge**, and combat stays engaging all the way up.
- Battles use **regiments of many soldiers** that you move around the field as blocks.
- The setting may become Breachline's world. That is decided later.

## Proposed pillars (draft, pending the creator's answers below)

1. **The ladder.** Each title widens what you rule *and changes what you personally do*. The lord leads a few retinue units by hand; the emperor sets fronts and goals and picks who commands.
2. **You can always take the field.** Any battle can be fought by hand in real time, in the Total War style, or left to a commander or auto-resolve. Scale never takes combat away.
3. **What you outgrow becomes a character.** Work you stop doing by hand passes to vassals with names, traits and ambitions (Crusader Kings). They make scale manageable, and they become the next rank's challenge: loyalty, rivalry, succession, rebellion.
4. **One continuous world, real time with pause.** Zoom smoothly from a regiment up to the realm map, as in Supreme Commander or Stellaris; no separate loading screens between map and battle.

### A challenge for every rank (sketch)

| Rank | You command | Main threats | What is new |
|---|---|---|---|
| Lord | 1–3 retinue units, a village | Bandits, a rival lord, raids | Hand-fought skirmishes, the first keep |
| Duke | 5–12 regiments, vassal lords | Neighbours, sieges, a disloyal vassal | Levies, castles, marriage |
| King | Several armies under generals | Rival kingdoms, succession crises | Laws, delegated armies, wars over claims |
| Emperor | Fronts and theatres | Internal factions, an endgame crisis | Provinces governed by others, grand campaigns |

## Technology (proposed)

- **Browser game, plain JavaScript, no build step**, like Breachline: it runs anywhere and is easy to share.
- **three.js (WebGL) for real 3D.** Soldiers are instanced, so thousands are cheap. The battle test draws 4,700 soldiers with the simulation at about 4.6 ms a tick.
- **Models:** low-poly figures built in code for now. Later, CC0 model packs (Kenney, Quaternius, KayKit) that are free to use, plus pre-rendering 3D to sprites if a 2D/isometric look wins.
- **2D art from Codex** where it shines: character portraits, heraldry, event illustrations and UI. The 3D world itself does not need generated images.
- The world/campaign layer still needs a design. A hex or province map is the likely start.

## Battle test (built 2026-11-18)

`index.html` runs a field battle: 9 regiments a side (spears, swords, archers, cavalry), about 1,200 soldiers in all.
- Total War–style controls: box select, right click to move or attack, right drag to draw a front line (its length sets the width), pause with orders.
- Individual soldiers fight in melee; archers shoot arcing arrows with friendly fire; cavalry charges, and braced spears stop a charge from the front.
- Morale: casualties, flank and rear hits and nearby routs break units. Routing units can rally once.
- Strategic zoom: banners keep a fixed size on screen, so the whole field reads from above.
- A simple AI advances in line, then picks fights by unit type.
- URL options: `?seed=123` for a fixed map, `?scale=4` for four lines a side.

Next battle work, once the questions are answered: terrain effects (hills, woods), generals, unit stats tuned with real play, and sound.

## Open questions for the creator

1. **Setting:** medieval, Breachline fantasy, historical, or sci-fi?
2. **Time model:** a real-time-with-pause world map plus real-time battles (proposed), or a turn-based campaign plus real-time battles like Total War?
3. **Who are you:** a dynasty of characters who age and die (Crusader Kings), or an undying faction (Stellaris)?
4. **Length of a run:** an evening, a weekend, or a long campaign with saves?
5. **Players:** single player first, or play against the siblings?
6. **Look:** real 3D (this test), or 2D/isometric sprites?

## Side project

A simpler, high-level strategy game in the vein of War of Dots or Line Battle: armies as tokens on a map, fronts and supply. It is an original design, built in parallel. **This deeper game takes precedence.**
