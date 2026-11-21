# RTS roadmap

What to build next, agreed with the creator on 2026-11-19 after a review of the core loop against Total War, Stronghold, Manor Lords, Crusader Kings, Bannerlord and Stellaris. The creator approved everything here. [DESIGN_NOTES.md](DESIGN_NOTES.md) stays the home for decisions; move items there as they are built, and strike them from this file.

Each item names the workstream that owns it (see *Workstreams* in DESIGN_NOTES.md). Work runs roughly in the order below; **balance comes first**.

## 0. The early economy as a budgeting puzzle — built 2026-11-20

All 14 items are in; see "The early economy as a budget" in DESIGN_NOTES. Left for others: Art dresses the paved roads (townview) and paints the settler events (assets/art/events/refugees, masons, foresters).

## 1. Balance the base game first (Realm)

Difficulty settings come later. Now the job is one fair base game.

- In playtests the rivals are far too strong and don't play the same game as you: 300–400-man columns by minute 31 against the player's 23.
- **Rivals follow the player's rules.** Their armies grow from a real economy, villagers and kit, at a pace comparable to a player's, not from abstract rates that outgrow you.
- **Their troop production is slow**: not slower than the player, but a player who builds the economy fast, goes straight into weapons and spears and leaves no slack must be able to raise troops faster than any rival.
- **The pace is similar on both sides.** A slow or inefficient player falls behind; an efficient one pulls ahead.
- The gentler opening (20 minutes of grace, buying peace with gold) is a stopgap until this is right.
- **Decided and built (2026-11-19), the creator's answers on rivals and gold:** rivals start stronger than you (40–80 men each against your 20) and climb three stages, Settling, Expanding and Contending, moving up with time (by trait and the Rivals option) or early once you close the gap on them; they tax at your rate; and gold gets more to buy without buying power outright: elite pay, market goods at rising prices, feasts, great keeps, gold for stone walls and hired masons, scaled dowries and buying off a coalition. See "Rivals' pace and gold" in DESIGN_NOTES.
- **Done (2026-11-19):** rival places and free villages keep a real economy (buildings, goods, people, kit), places vary from poor to rich with walls to match, storms show what is really there, and spies report on a place's stores. See "Rivals grow by your rules" and "Spies" in DESIGN_NOTES. Next: watch it in real play, and check the long game (60+ minutes, conquests, sellswords; rival houses pile up gold they don't yet spend).
- **One fair economy for everyone** (creator, 2026-11-19): the same tracked economy runs a place whoever holds it, so vassal towns (§2) are built on it too.
- **A place's layout is made on your first visit and kept** (creator's rule, 2026-11-19), for vassals, the governor, conquest and town templates:
  - A place needs no real layout until you first see it; from then on its layout persists.
  - **The numbers tie**: what the map shows for a place (people, buildings, stores, garrison, level) matches the town you see when you go in. New buildings may be placed only when you next visit, but the counts, stores and troops are already right on the map.
  - **The hard case**: take a place early, build a lot by hand, hand it to a vassal or the governor, stay away a long time, then come back. Your layout is still there, the buildings you placed show the upgrades they got, and new buildings have grown around them along the streets, so a village visibly becomes a small city. Growth while you are away is kept as real buildings with places and levels, never as numbers a fresh layout would replace.
  - Built: places remember their streets and walls (1de12a9), and a stormed place is laid out from its real tally. A vassal's village is laid out on your remembered streets when you first look round it, and that layout is kept as its own, so what you saw is what you get back. What grew while you were away wears levels: workshops come back at the levels a village of its size and standing could pay for, and the keep never shrinks below its people (or when levies march out). Governed villages are real towns all along.
- Later: Gentle / Normal / Hard on New campaign (grace period and rival growth). *(Built 2026-11-19 as the Rivals option; since the stages it sets how soon houses move up them, not how strong they are.)*

## 1b. Everyday building tools and carts (Realm, town HUD)

Small, high-value fixes to everyday play (creator, 2026-11-19); they can go in early.

- Keep placing and the B-letter hotkeys are built (see DESIGN_NOTES).
- **Neighbourhoods**: covered by the town templates (§2), which place a block of buildings at once.
- **Three kinds of cart on the roads**, all of which can be raided (enemy armies that meet a wagon take what it carries):
  - **Trade caravans** carry gold between market towns (the trade carts in §8). **Built (2026-11-19):** every 4–6 minutes each held market (and Kingsbridge) sends a caravan of 20 + 0.6 × its people in gold to one of its three nearest markets whose lord is not at war with its own. Arrived, the sender's lord is paid and the receiving market's lord half as much again. An enemy or outlaw army that meets it takes the gold for its house.
  - **Supply trains** feed armies (the food wagons; extend as needed).
  - **Supply runs** move goods, and ideally settlers, from one of your villages to another. Used now and then, mostly to restart a place you have just taken or that was burned. **Built (2026-11-19):** a village's panel on the map has a Supply run button for each of the four nearest villages of yours: half its spare food, bread, wood, planks, stone and iron (up to a cap of each) and four families if it has more than 20 people. One run at a time from each village. If the far village is lost on the way, the wagon turns home; a raider who meets it seizes the lot.
  - **Escorts (built):** an army of yours near one of your caravans or supply runs can Escort it and rides beside it until it arrives. A raider must get past it: one much weaker is driven off, otherwise you fight it on the road. A new order ends the escort.

## 2. The climb: every rank brings new tools and new trouble (Realm)

Rank today is only a title worked out from places held. Each rank should change how you play, with a moment when you reach it: a ceremony, a new banner, the music.

| Rank | New tools | New trouble |
|---|---|---|
| Lord | **Town templates** (below); grant a village to a vassal | Your first vassal's wants |
| Count | Captains run armies you don't watch; call the banners from many villages to one muster *(both built)* | Vassal factions; rebellions in unhappy places |
| Duke | Bigger regiments; plan campaigns and sieges from the map | Coalitions of houses against a player who grows too strong |
| King | Royal decrees: laws on levies, taxes and the crown's peace, each with a trade-off | Great vassals with claims; then Part 2 |

- **Done (2026-11-19):** rank-up moments (a herald, drums then a horn, and what the new rank opens), vassals, town templates, mercenary companies and the knights' hall, below and in DESIGN_NOTES. Still to do from the table: captains and one muster from many villages (Count), bigger regiments and campaign planning (Duke), coalitions (§6), royal decrees (King). **Royal decrees built (2026-11-19)** (decrees.js), in the realm panel once you are King: *the king's peace* (no vassal feuds, outlaws leave your places alone; vassals −5), *the great levy* (calling the banners raises down to a third of each village and vassals send half again as many; villages −8 mood, vassals −5), *the royal tithe* (a quarter more tax; villages −6 mood) and *the king's roads* (your armies and carts a fifth faster; 18 gold a minute). Any can be in force; a change stands five minutes. Captains, the banners and coalitions are built too (see their sections). **Duke built (2026-11-19):** levies come 40 men a regiment instead of 20, and a village of yours has *Gather your armies here*: every free army in the field marches there and goes inside, to march out as one host with *Muster the garrison*.

### Vassals

A vassal runs a town for you: builds it up, raises troops and pays gold. But he has **his own interests**.

- **Dynamics, after Crusader Kings 3:**
  - **Opinion** of you, from gifts, honours, wars won, land taken from him, high levies and taxes, and broken promises.
  - **What he owes**: a share of his levies and taxes, which you can ask to raise (he resents it) or lower (he likes it).
  - **Ambitions**: more land, a marriage, a title, revenge on a rival vassal. Vassals can feud with each other.
  - **Factions**: unhappy vassals band together to demand lower dues, independence or a different king, and rise if refused.
  - **Rewards and punishments**: grant land, give a seat on your council, revoke a holding (others take note), imprison or pardon.
- **On screen, after Crusader Kings 2**: a plain vassal list with each lord's shield, the town he holds, his troops and gold paid, and **one opinion number** coloured green to red. Hovering it shows the reasons. A small icon marks anyone in a faction. That's all the screen needs.
- **Built (2026-11-19):** grant a village (from Lord), the realm's vassal list and one opinion number with reasons on hover, a temper and one want each, dues and levies up or down, gifts, three council seats, taking a village back (the others take note), a lord too aggrieved stops paying and sending men, and each lord's short memory of what happened to him. His village runs on the tracked economy and keeps your layout.
- **Look round a vassal's village** (creator, 2026-11-19: read-only): double-click it or press *Look round* in its panel. You see it as he has grown it, people at work, but can't build, order or tax; the layout you saw is kept as the place's own.
- **Built (2026-11-19), vassal trouble:** feuds between neighbouring vassals (one at a time; both villages lose people and each minds more the longer you leave it; judge for one or pay 80 to reconcile them; they burn out after about half an hour), factions of the resentful (⚑ in the list) who after three minutes demand light dues and levies and rise if refused (their villages go free of you, to be retaken by force), imprisoning a vassal (his villages come back, the others mind) and pardoning him (landless at your court until you grant him a village).
- **Titles built (2026-11-21):** raise a vassal to baron (from count) or count (from duke), wanted as an ambition; see "Vassals, deeper" in DESIGN_NOTES.
- **Not built yet:** marriages as ambitions; a faction demanding a different king.

### Town templates

From **Lord**, you no longer have to place every building by hand. You may keep a capital you spend time in, but you don't have to.

- A template lays out a **town centre with all the key buildings**: keep, houses, storehouses, well, market, chapel, barracks.
- **Resource buildings are placed separately**, because they depend on where the trees, rock, ore and fields are: either by hand, or a set number placed automatically near their resources to build out.
- Templates come in **sizes by population** and a **focus**:
  - **Military**: barracks, smiths, stables, walls first.
  - **Production**: workshops and the long chains.
  - **Trade**: markets, roads, storehouses, gold.
- It will take time to develop; start with one focus and one size and grow from there.
- **Built (2026-11-19):** four templates in the build bar's Towns tab from Lord (hamlet, market square, workshops, barracks quarter), each placed in rings round where you click and paid for whole. Also built: a larger size of each (houses round a green at 50 people, market town and craft quarter at 60, garrison quarter at 70), and **Work the land**, which sets two woodcutters, a quarry, a mine and two farms by the woods, outcrop, ore and open ground nearest where you click, each by a resource no other of its kind works yet.

### Knights' hall (creator, 2026-11-19)

- **Built:** from Count, with a keep of level 3 or more; finishing the first one is a milestone (herald, music). Men-at-arms and knights train there now, not in the barracks: only from **veterans** (villagers who fought as levies and came home), in batches of up to 6, for their kit, a fee in gold and minutes of drill each, up to 24 men per hall. They march out a little more seasoned than the veterans they were.
- **Rivals by the same rules (2026-11-19):** a rival's grown military place (level 3, with barracks) saves its planks for a knights' hall, then adds a tanner, armourer and stable. Its hall trains men-at-arms (knights for Dunmore when there are horses and armour) from veterans of any of the house's garrisons, six at a time for kit, a fee and drill time, 24 at most; elites come from nowhere else. Fights nobody watches now teach their survivors as fought battles do. In a one-hour test each house had 3 to 6 elites, held back by iron for mail.

### Armour levels and regiments that grow (creator, 2026-11-19: "fuck yeah option 3!", "this is sick!")

A unit's **type sets its weapon**; **armour is separate**. Each regiment wears one level, the same for every man (none, leather, mail or plate), and spearmen and swordsmen may carry shields or not. A rusher raises bare spearmen cheap and fast; a player with deep chains fields armoured troops of every type. **Equipment sets protection; training sets skill and nerve**: a plate-armoured levy is hard to kill but still breaks like a levy, and knights and men-at-arms get their attack and morale from the hall and their experience. The creator's picture: start the game with a regiment, let it gain experience and be armoured up over time until it is deadly by the end, and know which of two regiments in the same gear is the stronger.

- **Built (Realm, 2026-11-19):** kit is weapons plus optional shields plus optional armour (economy.js `outfit`, `outfitKit`; regiments and unit entries carry `armour` and `shield`). Each barracks has a rule for its racks: *best available*, *keep the best for elites* (levies get leather at most) or *none*. Raising takes one level for the whole regiment, the best the racks hold enough of for every man. Disbanding returns weapons, armour and shields to the racks. Plate is made by default now (armourer: mail, iron and leather). Elites from the hall wear mail at least, plate if there is enough for the batch. **Refit**: a regiment of yours swaps up its armour and shields at the nearest barracks, keeping its men, name and experience. The armour of the dead is lost, or half of it **looted by whoever holds the field** and carried to their nearest place. Rival houses arm by their own rule (Varn none, Stonemere, Carrow and Penhallow best, Dunmore and Wyndham keep the best for their halls), as do vassals and tracked villages; auto-resolve weighs armour (leather +10%, mail +22%, plate +38%, no shield −7%, against each type's usual kit); spy reports show the piles of mail. Men in different armour stay in different regiments.
- **Battles:** armour and shield stats in battle.js; rank and armour shown side by side on the card and banner, with a short service record; replacements dilute a regiment's experience.
- **Art:** looks for each level (models.js `unitLook(key, { armour, shield })`) and icons `armour-none`, `armour-leather`, `armour-mail`, `armour-plate`, `no-shield`.
- **Service record:** a battle count for now (`battles` on regiments and unit entries, kept through the map, saves and merges; Battles shows it on the card). The list of places held and stormed waits for the chronicle.
- **Deferred, not planned (creator, 2026-11-19):** a muster roll keeping a stood-down regiment's identity. A regiment never broken up already keeps its experience, and re-raised veterans average theirs back.

### Mercenary companies (creator, 2026-11-19)

- **Built:** six named companies with captains, waiting at the market towns, fords and the crown. A price to hire, then wages every minute from the treasury; unpaid they grumble, then desert, and many take to the roads as bandits. Each company stationed in a village costs it 4 mood ("sellswords in the village"). Rivals hire them on the same terms (Penhallow, the merchant house, most readily, even at peace) and pay wages too, and you can outbid a rival at twice the price. The household guard stays a one-off purchase.
- Unit stats are Battles' to change; companies use the existing sellsword and hired crossbow stats.

## 3. Tools for managing attention (Realm, small hooks in Battles)

"Your attention is the scarce resource" needs a triage layer.

- **Alerts ranked by how serious they are**, in one list (like Stellaris's outliner): sieges at the top, then raids, starving armies, revolts, finished buildings at the bottom.
- **A choice when a fight starts away from you**: take command, leave it to the captain or garrison, or send help. Time slows while you decide. **Built (2026-11-19):** when two armies meet on the road you can *Leave it to the captain*: the battle is fought for real by both captains (ai.js `unwatched()`), three times as fast as the world, while you carry on. It heads the Needs you list with both sides' men standing; click it to take command where it stands. One such fight at a time; storming a place still goes into the place or auto-resolves.
- Later: a small live view of a second fight in a corner of the screen. *(Built 2026-11-19, see below.)*
- **Built (2026-11-19):** the *Needs you* list in the map's bottom-left corner, worst first: a village of yours being fought in; enemy columns you can see marching on your places, with how far off they are; revolts; hungry villages and armies; wages owed; storming in progress; aggrieved vassals; and, last, armies of yours idle away from home. Click one to look at it. In a village, the World map button carries a count of the serious ones in the worst one's colour. When a village is attacked the warning (time stopped, as with every prompt) now also offers to send the nearest free army to its relief. Finished buildings built (2026-11-19): they show for a minute and a half at the bottom of the list, in green (houses aren't news). Captains now ride into fights inside villages too (yours when you storm or join an attack, a rival's when it storms your village or relieves its own). The live corner view is built too: while a captain fights for you, the bottom-right corner shows the battle as it goes, with both sides' numbers; click it to take command.

## 4. Character memory (Realm; a hook for Claude)

Lords and captains remember what happened, which is where the stories come from.

- **Lords**: grudges for burned villages, sieges and broken truces; a lord who fled comes back for revenge; taunts drawn from real history ("You burned Wick. I have not forgotten"). **Built (2026-11-19):** each house keeps up to ten grudges against you (a place taken, a place burned, a field battle lost, a captain killed, a broken word, and for an heir his father's death, which never fades). They weigh on its opinion as they fade, its hosts go first for places you took from it, a sore lord fancies his chances against you more, its war heralds quote them ("You burned Wick. I have not forgotten."), and its panel lists what it holds against you.
- **Captains**: traits earned in battles they survive (steady under arrows, reckless in the charge, hated by Varn). *(Battle side done: `captainReport()` gives traits and memory lines.)* **Built (2026-11-19):** every army of 20 or more marches under a named captain (src/world/captains.js), yours and the rivals'; he rides into its field battles, levels up, earns traits, keeps a memory (hover his line) and can fall; between musters he waits for the next army.
- **Built so Claude can connect to it later**: each character's memory is a short readable list of events, so the Claude director (parked in DESIGN_NOTES) can read it and write lines, choices and events from it.

## 5. Terrain matters in battle (Battles)

Done 2026-11-19: high ground, woods, rivers and bridges, fatigue and arrows, deployment, rain and fog. See "Terrain matters in battle" in DESIGN_NOTES. Seasons stay parked.

## 6. Coalitions and rebellions (Realm)

- Houses band together against a player who grows too strong, and fall out again when the threat passes. **Built 2026-11-19:** from 20 minutes in and until you are crowned, once you hold 30% of the realm's places (or 20% with nearly twice the strongest house's men), every house that isn't allied, married, your vassal or backing you, and doesn't like you much, makes peace with the others and declares war on you under one herald. Members dislike you more and aim their hosts at your places first. It breaks up when you fall under 22% and stop out-muscling them, when it shrinks to one house (each peace you make takes one out), or after 40 minutes; another can't form for 30 more.
- Rebellions grow from low mood and from vassal factions (above). *Faction risings built 2026-11-19.*
- **Peasant revolts** (done by Realm): rebels gather in the woods and come back as a raid. The creator wants to **see them gather and walk out of the village** before they come back. *Built: rebels in red gather by the keep for a quarter-minute, march out along a road, and come back that way.*

## 7. Events and onboarding (Realm; Art for pictures)

- **Events with choices**: a failed harvest, sickness, a wandering knight, refugees, a festival, a bandit chief offering terms. Each has a Codex picture, as planned. **Built (2026-11-19)** in src/world/events.js: one every seven to twelve minutes at a village you run, never the same twice running. Blight (open the granaries, buy grain, or go hungry), fever (a physician, shut the sick houses, or let it run), a wandering knight (hire his five lances, feast him for the houses' good opinion, or send him on), refugees (take in five to eleven families who bring their own grumbling, more in Part 2), a midsummer fair (pay for good cheer), and a bandit chief (pay him to spare your villages for twenty minutes, hire his band, or refuse). Pictures asked of Art at assets/art/events/<id>.png; the box shows none until they land, and each id goes into `PAINTED` in events.js when its picture does (so the game never asks for a missing file).
- **Tutorial opening**: the goals panel (done; folded to the current goal) plus a short guided first village.

## 8. The wish list

All approved. Owners in brackets.

**Built on what only this game has**
- **Veterans come home** (Battles + Realm): levies who survive return with experience and make better levies next time. *(Battle side done: ranks from `xp`; the village side is Realm's.)* The dead lower the mood, and graves or a memorial stone appear (Art).
- **The land remembers** (Realm + Art): battlefields leave cairns and ruins, and places gain names ("Hollin Ford, where Varn's host broke"). **Realm side built (2026-11-19):** every field battle of yours leaves a cairn in `world.cairns` ({x, z, at, text: "Here the Varn host broke"}), and the nearest place takes its name from the first one (`p.epithet`, shown in its panel: "Ashford, where the Varn host broke"). Art draws the cairns on the map.
- **A written chronicle** (Realm): the campaign told from its events, with named captains, lords and battles, readable as a book at the end. Feeds the Claude director later. **Built (2026-11-19):** `world.chronicle` keeps what a chronicler would write down (places won and lost, field battles with your captain's name, wars, peace, alliances, marriages, houses kneeling, coalitions, vassals rising, lords fallen, knightings, ranks, the crown, the wall, the north driven out). *Read the chronicle* in the realm panel, and on every end screen, opens it as a book: a chapter a year (twenty minutes), each line under its season.
- **Your lord in person** (Battles + Realm): a unit on the field and on the map. A village runs better while you are there, and battles you join get a bonus. *(Battle side done: `setLord()`.)* **Built (2026-11-19):** *Ride with this army* from one of your places; you take the field with it (a wound sends you home to mend for ten minutes). Rival lords ride with their great hosts, Dunmore with every host; a fallen rival lord's heir takes over and the house mourns before it marches again. **Also built:** the village where your lord is (the seat when he rides with no army, or the place of yours where his army waits) gets +8 mood, "the lord is here".
- **Knight your captains** (Realm): give a veteran captain a village and he becomes your vassal. **Built (2026-11-19):** a captain of yours at level 3 or more appears among the grant buttons of a village you can give; he leaves his army and becomes a loyal vassal (Sir or Dame), keeping his memories.

**Sieges with grandeur**
- **Starve them out** (Realm + Battles): blockade instead of storming, and the place's stores run down. Uses the existing food supply. *(Battle side done: `setHunger()`.)* **Built (2026-11-19):** *Starve them out* in the attack prompt. The army sits before the place; its stores feed its people and garrison for a while (food and bread, two to twenty minutes), then it starves, its men slipping away, and after two and a half minutes of hunger it yields whole. Moving the army, losing it or a relief host lifts the siege. Your army eats while it waits, so send wagons.
- **Burn the fields ahead of a siege** (Realm): raiding supply weakens the target first, so skirmishing early pays. **Built (2026-11-19):** *Burn the fields* in the attack prompt: the place loses seven tenths of its food, half its bread, two farms and a mill, and a tenth of its people; the army loses a few men and stays before it, ready to besiege or storm. The lord holds it against you.
- ~~Tunnelling under walls, counter-tunnels, boiling oil and night sallies (Battles).~~ Done 2026-11-19.
- **Surrender terms** (Realm + Battles): a garrison yields with conditions (leave free, keep the village, pay ransom). **Built (2026-11-19) for storming:** a walled place you storm may ask for terms (sooner if it is hungry). Accept, and its garrison marches out under arms to its lord's nearest place, while you take the place whole, keeping eight in ten of its people instead of half. **Ransom and your own yielding built (2026-11-19):** a house's garrison asking for terms can also be let go for a ransom its lord pays (40 + 4 a man, up to what the house has; it costs you 5 of its opinion), a third button on the terms box (`battle.termsExtra`, hud.js). A walled village of yours that cannot hold may now yield on terms: its men march out under arms to your nearest place and the village passes whole, its people spared. Not yet: keeping the village for a vassal.
- **Ransom** captured captains and lords (Realm). **Built (2026-11-19):** after a field battle you fought or left to a captain, the beaten side's captain is taken one time in three, and a lord wounded on the losing side always is (yours too). Every four minutes the house offers gold for its own (60 + 45 a level for a captain, 350 for a lord) or asks it for yours; refuse and it asks again. A prisoner lord can't ride with his hosts; while you are held you can't ride at all.

**Rivals and drama** (Realm, Battles for the duel)
- Rivals with memory: grudges, escapes and revenge (section 4).
- **Champion duels**: Dunmore challenges you to settle a battle with a duel. **Built (2026-11-19):** Lord Hal Dunmore, a hothead, challenges in field battles: always when outnumbered (to settle the battle), otherwise one time in two (for honour). You answer in the field; a captain left in command takes up an honour duel but won't stake a battle he is winning.
- **Tournaments at Kingsbridge** for gold, renown and recruiting knights. **Built (2026-11-19)** as an event at your seat from Lord: send your best captain or ride yourself for 50 gold; a win brings 200 gold, every house's good opinion and four knights who ride home to serve you; a fall costs the entry (and you a few minutes mending).
- **Wyndham's schemes**: a gate opened from inside, a bribed captain, built on the spies in §1. **Built (2026-11-19), the bribed captain:** while a scheming house is at war with you, an event warns that one of your captains in the field is taking its gold; pay double, take away the command, or ignore it and risk the army marching over to them. The gate opened from inside waits on Battles.

**Economy and the realm** (Realm)
- **Trade carts** between market towns; bandits raid them, and you can escort them (see the carts in §1b). **Built (2026-11-19).**
- **Showpiece projects**: a cathedral, rebuilding the old north wall, the royal city. **Built (2026-11-19)** in works.js:
  - **Cathedral**: a town building (stone 300, planks 120, iron 20; four minutes' building), one in your realm, from the rank of Count in a village of 100 people. Mood +25 in its village. Consecrated, it is a herald and a chronicle line; every great house thinks 10 better of you, and vassals +5 while it stands in your lands. Drawn as the abbey until Art makes a cathedral model.
  - **The royal city**, once Kingsbridge is yours, in three stages paid in gold, one after another: mend the walls (400 gold, 4 min: Kingsbridge defends at ×1.5, whoever holds it), reopen the great market (500, 4 min: 0.6 gold a second to whoever holds it, and its caravans carry double), raise the palace (900, 6 min, from Duke: vassals +5, and one great house may hold out when you are crowned by acclaim).
  - **The old north wall** (Part 2): at a place of yours just south of a breach, rebuild the wall (500 gold, 5 min). The road from the war camp behind it is shut, so its hosts must go round. While a strong host waits in that camp it batters the stretch every five minutes; about half the blows land, and three bring it down again, each with a warning.
  - Great works go one at a time (the cathedral apart), paid up front, and stop if the place is lost. The place panel shows them under Great works.
- **Each kind of place plays differently**: abbey relics and pilgrims, toll fights at fords, mine collapses. **Built (2026-11-19)** as events (events.js) that come to any place of that kind you hold yourself, run as a village or not: **pilgrims** at an abbey (a hostel for 100 gold brings 0.2 gold a second for 25 minutes; or tithe them for 70 gold and annoy the monks; or let them pray and every house thinks a little better of you); a **toll quarrel** at a ford with a neighbouring house at peace (drive its 10–22 men off with the ford's own men for 90 gold and its anger, share the toll for 35 gold and its goodwill, or let it be); a **fall** at a mine (dig the miners out for 40 wood or 60 gold and lose the mine for three minutes, or seal the gallery and lose them). Pictures wanted: `pilgrims`, `toll`, `collapse`.

**Part 2** (Realm, Battles for units)
- Refugees flee south and swell your villages, with their own mood problems. *Built as the refugees event, more often and in bigger numbers in Part 2.*
- Old rivals fight beside you as vassal armies you can call. **Built (2026-11-19):** a house sworn to you (every house after the crowning, or one that bent the knee) has *Call their host to war* in its panel. It sends half the men of its places, under its own banner, against the nearest place held by an enemy you share (in Part 2, the north), once every ten minutes. Each call cools them a little (−2, or −5 if they are not warm to you), and a house below −10 won't answer.
- Norrhold gets its own original units and tactics: different weapons, war dogs, winter raids. *(Units done: axemen, javelin men, war dogs, and a Norrhold host; winter raids are Realm's.)* **Winter raids built (2026-11-19):** the year has seasons (five minutes each; the top bar shows the season). In winter every army marches 15% slower in the snow, and in Part 2 the north announces winter and sends a band of war dogs and javelin men (20 to 60) every two or so minutes from its place nearest your lands. A snowy look for the map in winter would help; not done.

**Polish and longevity**
- A builder for your house's arms and colours (Art).
- Photo mode and a cinematic camera for great sieges (Art).
- Campaign options: map size, rival aggression, ironman (Realm). **Built (2026-11-19):** chosen on the title page under New campaign and kept in the save (`world.options`). Realm: Small (3 rival houses, 24 places, 2 outlaw camps), Normal (5, 34, 3; the same maps as before for a seed) or Large (all 6, 42, 4), all on the same map with places closer together as it grows. Rivals: Gentle, Normal or Fierce sets how soon the houses move up their stages (1.35×, 1×, 0.7× the time; see "Rivals' pace and gold" in DESIGN_NOTES); the north is the same in all. Ironman: no Save button, the campaign saves itself every 45 seconds of play between fights, and a defeat deletes the save. (Leaving in the middle of a fight still goes back to the last save before it.)
- Music and fanfares for rank-ups and ceremonies (Audio).
- **Tidy the soldier, rider and horse animations** (Art). The clips (`assets/art/3d/clips-*.glb`, pushed 2026-11-19) are good enough to wire in, but the creator wants them adjusted later.
