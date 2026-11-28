# Spec: wars with a shape (a war score you spend on terms)

Fable, 2026-11-28. Approved by the creator ("I like this all! let's do it"). Source: IDEAS_2026-11-28.md 2.1; playtest items 15 and 27; the late-game scout; the creator's own save.

## Why

- Dunmore took peace straight after losing one town to a house its own size. The creator: "if we are that close in power and I just took their place then they should be mad at me and not that eager to make peace."
- Varn bent the knee, handing over seven places, after the creator's captains beat its levy and its host in two defensive fights. The creator: "kind of wish I got to play out the rest of the actual war."
- On the Duke test world a house offered the knee three minutes into a war, before a blow was struck.
- Today the score is hidden (`w.dip[h].score`), kept only against the player, and peace is one yes-or-no (`act(w, h, 'peace')`: score ≥ 25, or 1.6× stronger, or liked, or a long war). Between houses, peace is a 4% roll every think after 15 minutes.

The goal: **a war is a visible tug-of-war that every battle and town moves, and that either side spends on terms. Strength alone never ends a war.**

## The war record

One record per war, for every pair at war (houses with houses too): `w.warBook[key]` with the pair, when it began, who declared, the score, and its last eight entries (`{ at, by, what, delta }`). The score runs −100 to 100 and is read from either side (`warScore(w, a, b)` is the negative of `warScore(w, b, a)`). It replaces `w.dip[h].score`.

**What moves it** (the same table for every pair; the numbers are a first setting in one exported table, `WAR_SCORE`):

| Event | For the side that did it |
|---|---|
| A place taken | +25 (a seat +40) |
| The enemy's great host beaten in the field (a host of at least a third of its field strength) | +25 |
| A lesser field fight won | +5 to +12 by size (men beaten against the loser's field strength) |
| An assault on your place thrown back | +10 |
| A raid driven off before it plundered | +5; a raid that plundered: +5 to the raider |
| A siege held on the enemy | +2 a minute while it stands |
| A captain taken +5; a lord taken +15 | |

Nothing fades with time. A house's **weariness** (below) is what makes long wars end.

## Terms

Peace is made on terms, chosen by the side that proposes. Each term needs score, and the other side must accept by the rule in the next section.

| Term | The proposer needs | What it does |
|---|---|---|
| **White peace** | −10 or better | Peace; each keeps what it took; a truce (`TRUCE`) |
| **Tribute** | 25 | White peace, plus gold: 60 + 4 × score, paid at once as far as the loser's purse goes and the rest as a due every minute for ten minutes |
| **A place** | 55 | White peace, plus one named place of the loser's that borders the winner (the proposer picks; never a seat) |
| **The knee** | 80, and the loser's seat taken or under siege, or half the places it held when the war began lost | The loser becomes the winner's vassal house (as `act(w, h, 'vassal')` does now) |

- **Return a place** is a term too: the side behind may offer back a place it took, worth 25 toward the peace it wants.
- The player's Offer peace button opens these as a short list with what each needs and whether they'd take it now, and the reason when they wouldn't ("Lord Hal wants Rookdale back first").
- **Buy peace** stays, for the side behind: its price is `peacePrice` plus 10 gold for every point of score against you.

## When a side accepts, and when it asks

One function, `wouldAccept(w, side, from, term)`, used for the player's offers, the houses' answers and house-to-house peace:

- **Weariness.** A side wearies of a war as it runs and as it bleeds: minutes at war beyond 10, plus men lost in it against the men it began with, plus an empty purse. Temper shifts it (a hothead and a raider weary slowly, a merchant and a builder fast). Weariness lowers what a side will settle for; it never moves the score.
- **A side ahead** accepts nothing less than its score buys, less its weariness.
- **A side behind** accepts the terms the score buys against it; a term dearer than the score never.
- **A fresh loss at even strength is a reason to fight on** (playtest item 15). A house that has lost a place in this war refuses white peace and tribute while it is within 0.7 to 1.4 of the other's strength, until one of: its attempt to retake that place has failed (its host or a raid on it beaten, or 8 minutes with no attempt possible), the place is offered back, or the score against it reaches 55. It says so: "Not while Rookdale flies your banner."
- **No kneeling to an army it hasn't met** (item 27). The knee is never offered or accepted unless the table's condition holds. A far weaker house (under 0.35) at 30 or more against it sues for white peace or offers tribute; it does not kneel.
- **Houses ask too.** A house ahead by 25 or more proposes its terms to the player through the existing offer card (`offerFrom`): tribute, a place, or a place back, with Accept, Refuse, and Counter (which opens the list). Refused offers rest as they do now (`offerDeclined`).
- **Between houses** the same function ends their wars: the side ahead proposes the best term it can get accepted; the roll in `thinkWars` (4% after 900 s) is removed. Kneeling between houses is NOT in this spec: their top term is a place. Say so in DESIGN_NOTES.
- The league: a member's own war record with the player follows the same rules; the league's host being beaten still breaks the league as now.

## What the player sees

- **A war bar** on the house's panel (map and Realm > Houses): the score as a tug-of-war in the two houses' colours, the last entries under it ("Rookdale taken +25", "Their raid on Stowe plundered −5"), and one line on what they'd settle for now ("They would pay tribute", "They want Rookdale back").
- **A war chip** for each war of yours beside the realm panel's houses list, with the bar in small; click opens the panel.
- **The peace list** described above, replacing the single Offer peace and Buy peace buttons.
- **Heralds and the chronicle** name the terms: "Peace with House Dunmore: they pay 180 gold and keep the truce for ten minutes."
- Every refusal says why, on screen and in the console.

## Rules that stay

- Grudges, `wantsBack`, opinion, truces, alliances, marriage ties, the league, tribute demands in peacetime: as now. A place ceded or returned by terms leaves no `took` grudge; a place taken by storm does.
- Rivals play by the player's rules: one table, one acceptance function, no special case by side.
- Old saves: saves may break (creator, 2026-11-23). An old save's `dip[h].score` seeds the record's score; nothing else is carried.

## Checks (src/checks.js, a "Wars" group)

1. Every pair at war has one record; none exists for a pair at peace; `warScore(a, b) === −warScore(b, a)`.
2. Each event in the table moves the score by its amount, for the player and for a house-against-house war (staged on a scratch world).
3. Terms: each needs its score; the knee is refused without its condition even at 100; a house within 0.7–1.4 strength that just lost a place refuses white peace and tribute, and accepts after its retake fails.
4. A house at 0.3 of your strength with no battle fought never offers the knee.
5. A house ahead by 30 proposes terms to the player; a house-against-house war ends by `wouldAccept`, never by a roll.
6. A place ceded by terms changes owner, keeps its people, and leaves no grudge.

## Done means

Played by hand on the Count and Duke test worlds on a real screen: a war in which you take one town from an even house (it refuses peace, comes back for the town, is beaten, then settles); a war won to tribute; a war won to a ceded place; a war pressed to the knee by besieging the seat; a war you are losing, ended by returning a place or paying. One house-against-house war watched to its end through `window.game`. Screenshots of the war bar, the chip and the peace list. `checks()` 0 fails on lord, count, duke and king. DESIGN_NOTES gains "Wars with a shape" with the table and the acceptance rule. Say plainly what was not seen.
