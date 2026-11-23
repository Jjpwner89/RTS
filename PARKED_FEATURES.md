# Parked features

Ideas the creator has set aside, not cut. Nothing here gets built without the creator's go. When one is taken up, move it to ROADMAP.md or DESIGN_NOTES.md and strike it here. When one is dropped for good, delete it.

First look: after the creator's playtest of the march C, seasons and merc ladder build (late November 2026).

## Seasons

### Campaigning season for the houses
Parked 2026-11-23. The creator: "i don't really like campaigning season at the moment, let's park that in favor of the simplified seasons... keep possible for later."
- **The idea:** houses read the calendar as a player would.
  - Their war choice (`stanceScore`, rivals.js) gets a season term: spring +0.2, summer +0.5, autumn 0, winter −0.6.
  - New great hosts muster in spring and summer unless threatened; a plan already under way finishes.
  - Norhold does the reverse: its winter raids as now, plus −0.4 in summer.
  - Bandit camps get +0.3 to raid in autumn, when the barns are full.
- **Why it might come back:** wars get a rhythm. Summer is when trouble comes, and winter is a breather to build in.
- **What it would need:** a herald that warns of the campaigning season (spring and summer lines were drafted and then softened when this was parked). The full spec is in the seasons plan, section 3 (orchestrator notes, 2026-11-23).

### A fallow winter by default
Parked as the default 2026-11-23. It is **built and playable as an option**: add `?winter=hard` to the game's address.
- **The idea:** fields lie fallow in winter, and their hands haul for the village until spring ("Fallow till spring (2 min)"). Spring sows at 0.6, summer 1.0, autumn 1.6, and the first winter runs at half. A year's food is unchanged; only the timing moves.
- **The default now:** a milder modifier on farm yield, about spring 0.9, summer 1.1, autumn 1.3, winter 0.5. The creator: "basically the season is just a modifier on farm yield."
- **The question for the playtest:** does winter feel too easy without fallow? The creator is "interested in the idea".

## Economy

### Chained hauls
Parked 2026-11-22. The creator preferred carts first: "chained hauls might get like confusing".
- **The idea:** a hauler drops goods at a halfway store, and another carries them on, so far-flung villages move goods faster.
- **What was built instead:** storehouse carts carry two crates and move 15% faster.

## Platform

### Touch controls
Parked 2026-11-23 for V1, since the creator's sister plays on a laptop. The game has no touch handlers, so phones and tablets can't play. The March buttons on place cards mean a trackpad never needs right-click.

## Later, with an API key

### A Claude director
Parked since the first design notes. Now and then, Claude reads a simple summary of the game and turns a few dials: a rival's mood, an event, an invasion's timing. Build the game so its state can be summarised and those dials exist.
