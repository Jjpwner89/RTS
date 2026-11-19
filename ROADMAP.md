# RTS roadmap

What to build next, agreed with the creator on 2026-11-19 after a review of the core loop against Total War, Stronghold, Manor Lords, Crusader Kings, Bannerlord and Stellaris. The creator approved everything here. [DESIGN_NOTES.md](DESIGN_NOTES.md) stays the home for decisions; move items there as they are built, and strike them from this file.

Each item names the workstream that owns it (see *Workstreams* in DESIGN_NOTES.md). Work runs roughly in the order below; **balance comes first**.

## 1. Balance the base game first (Realm)

Difficulty settings come later. Now the job is one fair base game.

- In playtests the rivals are far too strong and don't play the same game as you: 300–400-man columns by minute 31 against the player's 23.
- **Rivals follow the player's rules.** Their armies grow from a real economy, villagers and kit, at a pace comparable to a player's, not from abstract rates that outgrow you.
- **Their troop production is slow**: not slower than the player, but a player who builds the economy fast, goes straight into weapons and spears and leaves no slack must be able to raise troops faster than any rival.
- **The pace is similar on both sides.** A slow or inefficient player falls behind; an efficient one pulls ahead.
- The gentler opening (20 minutes of grace, buying peace with gold) is a stopgap until this is right.
- **First pass done (2026-11-19):** rival arms now come from a smithy at a slow, player-like pace, and from villagers; see "Rivals grow by your rules" in DESIGN_NOTES. Next: watch it in real play, and check the long game (60+ minutes, conquests, sellswords) keeps the same shape.
- Later: Gentle / Normal / Hard on New campaign (grace period and rival growth).

## 2. The climb: every rank brings new tools and new trouble (Realm)

Rank today is only a title worked out from places held. Each rank should change how you play, with a moment when you reach it: a ceremony, a new banner, the music.

| Rank | New tools | New trouble |
|---|---|---|
| Lord | **Town templates** (below); grant a village to a vassal | Your first vassal's wants |
| Count | Captains run armies you don't watch; call the banners from many villages to one muster | Vassal factions; rebellions in unhappy places |
| Duke | Bigger regiments; plan campaigns and sieges from the map | Coalitions of houses against a player who grows too strong |
| King | Royal decrees: laws on levies, taxes and the crown's peace, each with a trade-off | Great vassals with claims; then Part 2 |

### Vassals

A vassal runs a town for you: builds it up, raises troops and pays gold. But he has **his own interests**.

- **Dynamics, after Crusader Kings 3:**
  - **Opinion** of you, from gifts, honours, wars won, land taken from him, high levies and taxes, and broken promises.
  - **What he owes**: a share of his levies and taxes, which you can ask to raise (he resents it) or lower (he likes it).
  - **Ambitions**: more land, a marriage, a title, revenge on a rival vassal. Vassals can feud with each other.
  - **Factions**: unhappy vassals band together to demand lower dues, independence or a different king, and rise if refused.
  - **Rewards and punishments**: grant land, give a seat on your council, revoke a holding (others take note), imprison or pardon.
- **On screen, after Crusader Kings 2**: a plain vassal list with each lord's shield, the town he holds, his troops and gold paid, and **one opinion number** coloured green to red. Hovering it shows the reasons. A small icon marks anyone in a faction. That's all the screen needs.

### Town templates

From **Lord**, you no longer have to place every building by hand. You may keep a capital you spend time in, but you don't have to.

- A template lays out a **town centre with all the key buildings**: keep, houses, storehouses, well, market, chapel, barracks.
- **Resource buildings are placed separately**, because they depend on where the trees, rock, ore and fields are: either by hand, or a set number placed automatically near their resources to build out.
- Templates come in **sizes by population** and a **focus**:
  - **Military**: barracks, smiths, stables, walls first.
  - **Production**: workshops and the long chains.
  - **Trade**: markets, roads, storehouses, gold.
- It will take time to develop; start with one focus and one size and grow from there.

## 3. Tools for managing attention (Realm, small hooks in Battles)

"Your attention is the scarce resource" needs a triage layer.

- **Alerts ranked by how serious they are**, in one list (like Stellaris's outliner): sieges at the top, then raids, starving armies, revolts, finished buildings at the bottom.
- **A choice when a fight starts away from you**: take command, leave it to the captain or garrison, or send help. Time slows while you decide.
- Later: a small live view of a second fight in a corner of the screen.

## 4. Character memory (Realm; a hook for Claude)

Lords and captains remember what happened, which is where the stories come from.

- **Lords**: grudges for burned villages, sieges and broken truces; a lord who fled comes back for revenge; taunts drawn from real history ("You burned Wick. I have not forgotten").
- **Captains**: traits earned in battles they survive (steady under arrows, reckless in the charge, hated by Varn).
- **Built so Claude can connect to it later**: each character's memory is a short readable list of events, so the Claude director (parked in DESIGN_NOTES) can read it and write lines, choices and events from it.

## 5. Terrain matters in battle (Battles)

- **High ground**: uphill fighting is harder, and archers shoot further from above.
- **Woods**: hide regiments, break formations and slow cavalry; ambushes come from them.
- **Rivers, fords and bridges**: slow crossings to fight over, and bridges you can burn.
- **Fatigue and limited arrows**, so reserves and timing matter.
- **A short deployment phase** before a battle to place regiments and plan.
- Light **weather**: rain that hurts archers, fog that hides armies. Seasons stay parked.

## 6. Coalitions and rebellions (Realm)

- Houses band together against a player who grows too strong, and fall out again when the threat passes.
- Rebellions grow from low mood and from vassal factions (above).
- **Peasant revolts** (done by Realm): rebels gather in the woods and come back as a raid. The creator wants to **see them gather and walk out of the village** before they come back.

## 7. Events and onboarding (Realm; Art for pictures)

- **Events with choices**: a failed harvest, sickness, a wandering knight, refugees, a festival, a bandit chief offering terms. Each has a Codex picture, as planned.
- **Tutorial opening**: the goals panel (done; folded to the current goal) plus a short guided first village.

## 8. The wish list

All approved. Owners in brackets.

**Built on what only this game has**
- **Veterans come home** (Battles + Realm): levies who survive return with experience and make better levies next time. The dead lower the mood, and graves or a memorial stone appear (Art).
- **The land remembers** (Realm + Art): battlefields leave cairns and ruins, and places gain names ("Hollin Ford, where Varn's host broke").
- **A written chronicle** (Realm): the campaign told from its events, with named captains, lords and battles, readable as a book at the end. Feeds the Claude director later.
- **Your lord in person** (Battles + Realm): a unit on the field and on the map. A village runs better while you are there, and battles you join get a bonus.
- **Knight your captains** (Realm): give a veteran captain a village and he becomes your vassal.

**Sieges with grandeur**
- **Starve them out** (Realm + Battles): blockade instead of storming, and the place's stores run down. Uses the existing food supply.
- **Burn the fields ahead of a siege** (Realm): raiding supply weakens the target first, so skirmishing early pays.
- Tunnelling under walls, counter-tunnels, boiling oil and night sallies (Battles).
- **Surrender terms** (Realm + Battles): a garrison yields with conditions (leave free, keep the village, pay ransom).
- **Ransom** captured captains and lords (Realm).

**Rivals and drama** (Realm, Battles for the duel)
- Rivals with memory: grudges, escapes and revenge (section 4).
- **Champion duels**: Dunmore challenges you to settle a battle with a duel.
- **Tournaments at Kingsbridge** for gold, renown and recruiting knights.
- **Wyndham's schemes**: spies, a gate opened from inside, a bribed captain.

**Economy and the realm** (Realm)
- **Trade carts** between market towns; bandits raid them, and you can escort them.
- **Showpiece projects**: a cathedral, rebuilding the old north wall, the royal city.
- **Each kind of place plays differently**: abbey relics and pilgrims, toll fights at fords, mine collapses.

**Part 2** (Realm, Battles for units)
- Refugees flee south and swell your villages, with their own mood problems.
- Old rivals fight beside you as vassal armies you can call.
- Norrhold gets its own original units and tactics: different weapons, war dogs, winter raids.

**Polish and longevity**
- A builder for your house's arms and colours (Art).
- Photo mode and a cinematic camera for great sieges (Art).
- Campaign options: map size, rival aggression, ironman (Realm).
- Music and fanfares for rank-ups and ceremonies (Audio).
