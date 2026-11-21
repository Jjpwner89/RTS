# RTS art briefs for Codex

Written 2026-11-18 by the Art workstream. Revision 3 (2026-11-19: section 4 rewritten for the chosen parchment-and-ink interface, with tiling textures, exact 9-slice borders and the full icon list; section 5, event pictures, and the armour-level icons added, then seven more events (tournament, scheme, pilgrims, toll, collapse, masons, foresters); section 6, Norrhold, outlaws, mercenary banners, the big moments, a title painting, cursors and captains, added; an upright phone version of the title painting and section 7, a 3D wishlist, added; section 7's animation clips requested ahead of everything else, after the creator turned down Codex's prototype bodies). Revision 4 (2026-11-21): Codex is for 2D only, so section 7 is withdrawn; the outlaws' and Norrhold's portraits and badges (6.1, 6.2) move to the front, because the game now shows them. Done so far: the lord portraits (section 1) and the house heraldry (section 2); every other brief is **ready**.

These are the only paintings the game needs. Everything else (models, terrain, effects) comes from free CC0 packs. Codex may stop being available soon, so **work in priority order** and finish each section before starting the next: a complete set of portraits is worth more than half of everything.

**Do next (2026-11-21), before anything else:** `bandits` (6.2) and `norrhold` (6.1), portrait and badge, in that order. The outlaw bands' herald card ("Outlaws on the road") and Norrhold's heralds already load `assets/art/portraits/<id>.png`, and show a grey square with a letter until it lands; the badges follow. Then carry on with section 3.

Paths here are relative to the repository root (`RTS/`). The game itself is described in [DESIGN_NOTES.md](../../DESIGN_NOTES.md), under "The full game". House data (names, traits, colours, taunts) lives in `src/world/realm.js`, owned by the Realm workstream. If a brief and that file disagree on a name or colour, the file wins.

## How to work

- Work in `assets/art/wip/<section>/` (for example `wip/portraits/`). Keep a `prompts-and-manifest.json` there with each final prompt, its output file, any reference files you attached, and a status.
- Put the picks where the game loads them. The game falls back to a plain shield or no image while a file is missing, so a file can be dropped in at any time:

  | Art | Final file | Format |
  |---|---|---|
  | Portraits | `assets/art/portraits/<id>.png` | 768×960 (4:5), opaque |
  | Heraldry | `assets/art/heraldry/<id>.png` | 512×512, transparent |
  | Map style | `assets/art/map/…` | see section 3 |
  | UI kit | `assets/art/ui/…` | see section 4 |
  | Event pictures | `assets/art/events/<id>.png` | 640×360 (16:9), opaque |
  | Moments, title, cursors, captains | `assets/art/moments/…`, `assets/art/title.png`, `assets/art/title-tall.png`, `assets/art/ui/cursors/…`, `assets/art/captains/…` | see section 6 |
  | 3D animation clips | `assets/art/3d/…` | see section 7 |

  `<id>` is `varn`, `carrow`, `stonemere`, `wyndham`, `penhallow`, `dunmore`, or `player` (with `player-f` for the second player portrait), plus `norrhold` and `bandits` from section 6.
- Make two or three takes of each image and pick the best. Keep the others in `wip/` for the creator to look at.
- Before calling an image done, look at it: hands, eyes, faces, armour straps, the shield's charge, and whether it reads at small size.
- Commit to `main` in small steps (`git pull --rebase` before every push). Don't touch any file outside `assets/art/`.

## Shared look (applies to every section)

The game is a grounded medieval strategy game: no magic, no fantasy races, roughly 13th–14th century England and northern France in feel, with invented places and houses. In the 3D game, people and buildings are low-poly, flat-shaded models with soft, clean colour (the Quaternius packs). The paintings should sit comfortably next to that. Aim for **painted, warm and readable**: a stylised digital painting with visible brushwork, simplified shapes, clear silhouettes and confident colour, rather than photoreal or gritty. Think of a strategy game's character cards, painted by one artist for the whole set.

- One consistent painting hand across a section. Every portrait must look like part of the same gallery.
- Matte materials: steel and gold catch the light, but nothing should look glossy or plastic.
- No text, letters or numbers anywhere in an image unless a brief asks for them.
- The creator dislikes wooden frames on UI buttons. Use parchment, leather, cloth and thin metal rims instead (see section 4).

---

## 1. Portraits of the lords (highest priority)

Seven portraits: six rival lords and the player's lord, plus a second player portrait (eight files in all). They appear in the diplomacy screen, in war declarations and taunts, and on the world map when you click a rival's place. They're shown at about 200×250 px and sometimes as a 64 px circle crop of the face, so **the face must sit in the upper middle of the frame and read when small**.

**Shared framing for all portraits:** head and shoulders down to mid-chest, three-quarter view, the subject looking at or just past the viewer. A softly painted background in a darkened, muted version of the house colour, with a hint of their place behind them (a hall, a wall, a field) but nothing busy. Lit from one side by warm window or fire light. The house colour shows on the clothing: a surcoat, a cloak, a hood or a banner edge. Their heraldry may appear small (a brooch, a shield rim, an embroidered badge), but it isn't required; if it appears, match section 2.

Each lord's age, look and kit below is a **proposal**. Keep the personality; the artist may change details that make a better painting.

### 1.1 `varn`: Lord Edric Varn, the raider

House colour red `#c8423a`. A lean, hard man of about forty with a weathered face, a short dark beard and an old scar through one eyebrow. He wears blackened mail with a worn red surcoat, and a fur-trimmed cloak thrown back. He's the rival who burns villages and hits supply wagons, and he enjoys it a little too much: a half-smile that doesn't reach the eyes. Smoke-hazed dusk behind him.

**Must keep:** red; reads as dangerous and practical, not a cartoon villain.

### 1.2 `carrow`: Lady Aldith Carrow, the builder

House colour gold `#d9a441`. A woman in her fifties, broad-shouldered, practical and proud, with grey-streaked hair under a simple linen wimple or veil. She wears a good wool gown in gold and brown with a ring of keys at her belt, and holds a folded plan or a mason's square. She grows big villages and fine stone castles and is slow to war, but she never forgets a slight. Behind her, pale stone and scaffolding.

**Must keep:** gold; a builder's confidence, calm and shrewd.

### 1.3 `stonemere`: Lord Osric Stonemere, the turtler

House colour slate `#6f7f8f`. An old lord of about seventy, heavy-set, with a white beard, deep-set eyes and a furred slate-grey robe over plate at the shoulders. One hand rests on a sword pommel he no longer needs to draw. He trusts walls, towers and crossbows, and wins by outwaiting everyone. Behind him, the grey stone of a great wall at evening.

**Must keep:** slate grey; old, immovable, patient.

### 1.4 `wyndham`: Lady Rohese Wyndham, the schemer

House colour purple `#7b4fa0`. A woman of about thirty-five, elegant and composed, with dark braided hair under a jewelled net and a purple velvet gown with a fine gold-thread border. A sealed letter in her fingers, and an amused, knowing look. She arranges marriages, buys loyalty and backs whoever is winning. Candlelit chamber, a tapestry behind.

**Must keep:** purple; clever, charming and slightly dangerous; not a witch, no magic.

### 1.5 `penhallow`: Lord Gervase Penhallow, the merchant

House colour green `#2f8f6a`. A well-fed, cheerful man of about fifty, clean-shaven with a heavy jaw, in a rich green houppelande with fur trim and a chain of office, rings on his fingers. A purse or a set of scales near him. He holds market towns and pays mercenaries rather than raising levies. Behind him, a busy harbour or market in soft focus.

**Must keep:** green; wealth and warmth hiding hard bargaining.

### 1.6 `dunmore`: Lord Hal Dunmore, the hothead

House colour orange `#e07a2f`. A young knight of about twenty-two, handsome and reckless, with tousled fair hair, a fresh cut on his cheek, and bright plate armour with an orange surcoat. His helm is under his arm and a lance pennon is just visible. He loves knights and cavalry, issues challenges and charges first. Bright open sky and a tourney field behind.

**Must keep:** orange; youthful bravado; the most energetic portrait of the set.

### 1.7 `player` and `player-f`: your lord

House colour blue `#3d6fd6`. The player's own lord, a newly landed holder of one village who will climb to the crown. Make two versions in the same pose and setting: `player` is a man and `player-f` a woman, both about thirty. They should be neutral enough that the player can see themselves in the role. Both wear a plain but good blue surcoat over mail, with a simple circlet or no headwear. The face is determined and open: a capable lord at the start of something. Behind them, a small timber keep on a hill at morning.

**Must keep:** blue; the most neutral, likeable portrait; morning light, the start of a story.

*Design context, not for the image prompt:* traits drive the AI (the raider raids supply, the turtler builds walls, and so on). The player's portrait shows on the campaign screen and in diplomacy.

---

## 2. Heraldry for the houses

Seven coats of arms, one per house. They appear as banners over armies and places on the world map, on soldiers' shields, beside a lord's name, and in diplomacy, often at **24–48 px**, so each must read as a single bold shape on a single bold field.

**Shared rules:**
- A heater shield shape filling the 512×512 canvas, with a transparent background. Flat, clean painted heraldry: crisp edges, a very slight painted texture and a thin darker outline. No 3D bevel and no metallic shine.
- **Two tinctures plus at most one accent.** The house colour must be the field or the dominant tincture, so the shield reads as that house's colour from across the map.
- **One simple charge**, big and centred. No mottos, crests, helms or supporters.
- Also produce a **flat banner version** of each: the same arms on a vertical rectangle, 256×384, transparent background, saved as `assets/art/heraldry/<id>-banner.png`.

| id | House | Proposed arms |
|---|---|---|
| `varn` | Varn, the raider | Red field; a black wolf's head, couped, snarling. |
| `carrow` | Carrow, the builder | Gold field; a black stone tower with three battlements. |
| `stonemere` | Stonemere, the turtler | Slate field; a white portcullis. |
| `wyndham` | Wyndham, the schemer | Purple field; a silver key, upright. |
| `penhallow` | Penhallow, the merchant | Green field; a gold ship, single mast, sail furled. |
| `dunmore` | Dunmore, the hothead | Orange field; a black horse rearing. |
| `player` | Your house | Blue field; a white chevron with a small gold star above it. |

The charges are proposals; change one if another reads better at 24 px, but keep the field colours. If a field colour has to change (say the slate looks muddy), note it in the manifest so the game's colours can match.

*Design context, not for the image prompt:* until these exist, the game draws a coloured shield with the lord's initials. The banners will be textured onto 3D flags and the world-map army markers.

---

## 3. A painted world-map style

The world map is a 3D landscape seen from above, with real hills, woods and roads, and places marked with small models. The creator wants it to feel like a **painted campaign map**: think of an illuminated or hand-coloured map spread on a table, with the 3D terrain sitting on top of it. Codex supplies the painted pieces; the game blends them in.

1. **Style frame** (`assets/art/map/style-frame.png`, 1920×1080). A painting of how the world map should look at its middle zoom: a stretch of countryside with rolling hills, woods drawn as clustered tree-tops, a river with a ford, roads, three or four places (a village, a castle, a monastery) as small painted buildings, and two armies as small banner-topped columns. Seen from high and at an angle, with soft hand-coloured map tones (greens, ochres, soft blues), gentle ink edges and a hint of parchment showing through at the edges. No labels. This is the reference for everything below and for the creator's approval.
2. **Ground textures**, each 1024×1024 and **seamlessly tileable**, in the style frame's palette, with no shadows baked in, and viewed straight down:
   - `ground-grass.png`: painted meadow with soft variation
   - `ground-field.png`: ploughed and sown strips
   - `ground-forest-floor.png`: dark under-tree ground
   - `ground-rock.png`: hill rock and scree
   - `ground-dirt.png`: road and bare earth
   - `ground-water.png`: river and lake surface with painted ripples
3. **Parchment edge** (`map/parchment-edge.png`, 2048×2048, transparent centre). A torn and aged parchment border that frames the world map as if it were a sheet on a table. The centre is fully transparent; only the outer 10% or so is painted.
4. **Fog of war** (`map/fog.png`, 1024×1024, tileable, greyscale with alpha). Soft painted cloud and parchment wash for unexplored land, like the blank, lightly sketched part of an old map. It must tile seamlessly; the game uses it as a mask and tints it.
5. **Place markers**, one per kind of place, each 256×256 with a transparent background. A small painted icon of the building seen from slightly above, in the style frame's look, readable at 32 px. These are used when the map is zoomed far out:
   - `place-village.png`
   - `place-castle.png`
   - `place-mine.png`: a mine entrance in a hillside
   - `place-ford.png`: a shallow river crossing with stepping stones and a post
   - `place-monastery.png`: a small church and cloister
   - `place-market-town.png`: a walled town with a market cross
   - `place-camp.png`: an army camp of tents behind a ditch and stakes
   - `place-bandits.png`: a rough camp of lean-tos around a fire

*Design context, not for the image prompt:* the map is 3D (three.js). The textures will be splatted onto the terrain by height and slope, and the markers swap in for the 3D models when you zoom far out. Places come in six kinds, each with a speciality, and armies can turn a camp into a holding.

---

## 4. A parchment UI kit and icons

The creator chose the interface look on 2026-11-19: **parchment and ink**. The game already wears it, drawn with code (a noise grain and gradients in `src/skin.css`). This kit replaces those stand-ins with painted art. Screenshots of the game as it looks now are in `assets/art/refs/ui/` (`now-world.jpg`, `now-village.jpg`, `now-battle.jpg`); attach them as references, and match their colours, so the painted kit feels like a richer version of what is already there rather than a new look.

**Look:** aged parchment, dark tooled leather and dyed cloth, with thin bronze rims edged by a fine dark line. Ink-drawn and hand-coloured. Matte, warm, slightly worn, never glossy. **No wood, planks or wooden frames** (the creator's explicit dislike). No text, letters or numbers on any piece.

**Palette** (take these from the screenshots too):

| Material | Colours |
|---|---|
| Parchment | light #f3e8c9 in the middle, through #e6d4a6, to #d2b77e at the edges |
| Bronze rim | #b89559, with a fine dark outer line #4a3018 |
| Ink | #2b1d0e for text, #8d3b16 rust red for headings |
| Leather (top bar) | #4b3220 to #2f1e12, with a thin gilt line rgba(214, 170, 96) just inside the edge |
| House-blue cloth (anything selected) | #3a64b0 to #24447f |

All files are PNG with transparent backgrounds, in `assets/art/ui/`. **Paint everything at the size given, which is two to three times the size it shows in the game**, so it stays crisp on sharp screens.

### 4.1 Surfaces (do these first)

Many panels are odd shapes and sizes, so the game fills most of them with a tiling texture and draws the rim separately. These two textures alone would change every screen.

| File | Size | Notes |
|---|---|---|
| `parchment-tile.png` | 512×512 | **Seamlessly tileable**, opaque. Plain parchment: fibres, faint mottling and a few soft stains, even in tone so it can repeat across a large panel without visible seams or a pattern. No edges, no darkening at the sides. |
| `leather-tile.png` | 512×512 | **Seamlessly tileable**, opaque. Dark brown leather with fine grain and faint tooling marks, even in tone. |
| `cloth-tile.png` | 256×256 | **Seamlessly tileable**, opaque. House-blue wool with a visible weave, for selected buttons and items. |

### 4.2 Frames and buttons (9-slice)

Each of these is cut into nine pieces by the game: the four corners stay fixed, the edges stretch along their length and the centre stretches both ways. So **keep every corner and rim inside the border width given, and make the edges and centre plain enough to stretch** (no motifs along the edges, no detail in the centre).

| File | Size | Border | Notes |
|---|---|---|---|
| `panel.png` | 256×256 | 24 px | Parchment panel with the thin bronze rim and dark outer line; the edges darken slightly and look a little worn. Corners may carry a small bronze corner-piece. Centre plain parchment. |
| `bar.png` | 512×80 | 32 px left and right, 16 px top and bottom | The top bar: a strip of dark leather with the gilt line inside the edge and small bronze end-caps. Stretches sideways only. |
| `button.png` | 192×64 | 20 px | Parchment ribbon button: slightly raised, light top edge, thin bronze-brown border. Plain centre. |
| `button-hover.png` | 192×64 | 20 px | The same, a little warmer and brighter. |
| `button-pressed.png` | 192×64 | 20 px | The same, a little darker and looking pushed in. |
| `button-on.png` | 192×64 | 20 px | The same shape in house-blue cloth with a darker blue border, for whatever is selected (a speed, a building, a formation). |
| `button-disabled.png` | 192×64 | 20 px | Faded, greyer parchment. |
| `label.png` | 192×64 | 16 px | A small parchment plate for place names on the world map and the regiment cards in battle. Lighter rim than the panel, so many of them on screen don't feel heavy. |
| `tooltip.png` | 128×128 | 16 px | A small parchment scrap with a soft torn edge. |

### 4.3 Small pieces

| File | Size | Notes |
|---|---|---|
| `divider.png` | 512×24 | A thin inked flourish line, rust-red and dark ink, that sits under panel headings. Plain enough in the middle to stretch. |
| `corner.png` | 64×64 | One bronze corner ornament (top left; the game mirrors it), for the large panels such as the village and keep pages. |
| `key.png` | 48×48 | A tiny parchment key-cap with a bronze rim, behind the shortcut letters on build buttons. 12 px border. |
| `portrait-frame.png` | 320×400 | Frame for a 4:5 lord portrait: thin bronze rim with a small shield-shaped slot at the bottom centre for heraldry. Transparent window. |
| `banner-frame.png` | 256×64 | A parchment name plate under a portrait. |

### 4.4 Icons

Each icon is **128×128** on a transparent background, saved as `assets/art/ui/icons/<name>.png`. They sit on parchment, so: an **ink outline with flat hand-colouring** in the palette above, with no halo needed. Each must be recognisable at **20 px**: one object, centred, nothing else. One consistent hand across the whole set.

The game already uses plain silhouettes for these names, in `assets/icons/<name>.svg`; use the **same file names** so the painted ones swap straight in. Paint them in this order:

1. **Shown on every screen:** people, gold, food, wood, stone, crown, battle, warning, village, watchtower.
2. **Goods:** planks, ore, iron, flax, string, feathers, hides, leather, bread, flour, horses, shields, bows, arrows, bolts, crossbows, spears, lances, swords, mail, armour.
3. **Buildings:** house, storehouse, well, woodcutter, quarry, mine, hunter, farm, flaxfield, mill, bakery, carpenter, ropemaker, tanner, smelter, bowyer, weaponsmith, armourer, stable, barracks, market, monastery, hall, keep, castle, siegeworks.
4. **World map:** map, camp, warcamp, ford, pass, raid, retreat, invader, siege.
5. **Armour levels,** for regiment cards and banners: armour-none (a plain belted tunic), armour-leather (a laced leather jerkin), armour-mail (a mail shirt), armour-plate (a breastplate with shoulder plates), no-shield (a shield struck through).

Then, if there is time, these new ones: the orders (move, attack, hold, charge, fire at will, hold fire, line, column, wedge, schiltron, rally, disband), and the realm (mood happy, mood content, mood angry, war as crossed swords, peace as an olive branch, truce as a white flag, alliance as clasped hands, tribute as a coin chest, vassal as a kneeling figure, scout as an eye, fire).

*Design context, not for the image prompt:* the HUD is HTML and CSS over the 3D view. `src/skin.css` holds the whole parchment look as CSS variables (`--grain`, `--surface`, `--bar-surface`, `--btn`, `--btn-on` and so on); the tiles go into those, and the frames go in as `border-image` with the borders above drawn at about half size. Icons are drawn by `ico()` in `src/icons.js` as one-colour CSS masks today; painted icons need it to use the PNG as a plain image when one exists. The regiment-card unit icons are drawn on a canvas in `src/view.js` (`drawIcon`) and are not part of this kit. The Art workstream wires the kit in once it lands.

---

## 5. Event pictures

Thirteen paintings for the choices that come up during a campaign (a blight, a fever, a wandering knight and so on). Each sits at the top of a small prompt box above the text and the choice buttons, at about 640×360 and sometimes half that on a phone. The box hides the picture while a file is missing, so each can land on its own. Do these **after the portraits and heraldry**.

**Shared framing:** landscape, 640×360, opaque. One clear scene with one focal group in the middle third, readable at half size. Same painting hand and finish as the portraits (section 1), so the prompt box feels like part of the same game. A low-poly countryside of timber villages, stone keeps, fields and woods, about the 13th century. People are ordinary and grounded: no heroes posing, no magic. No text, banners with writing, or numbers. Keep the edges calm, since the text box sits right below.

### 5.1 `harvest`: blight in the fields

Late summer. A village's grain strips have gone patchy and grey-brown with rot among the gold. Two or three villagers stand at the field's edge, one crouched holding a blackened ear of wheat, the others looking on with worry. Thatched cottages and a timber barn behind, an overcast sky.

**Must keep:** the spoiled crop is the subject; worry, not horror.

### 5.2 `fever`: sickness in a village

A quiet village lane at dusk. A door marked with a simple chalk cross, a woman in a linen headcloth carrying a water jug toward it, and a monk or healer with a satchel speaking to a man at the threshold. Smoke from a few chimneys, lamplight in one window. Nothing graphic: illness is shown by the hush and the care, not by bodies.

**Must keep:** tender and sombre; no corpses, sores or skulls.

### 5.3 `knight`: a wandering knight

A knight errant arriving on a road toward a village gate in morning light. He rides a tall horse in a plain faded caparison, in mail with a worn surcoat, his helm hanging at the saddle. A young squire walks beside him leading a packhorse with two or three lances. Villagers glance up from their work. His colours are muted and undyed (greys, browns, a faded green), so he reads as belonging to no great house.

**Must keep:** a capable stranger offering service; not one of the houses' colours.

### 5.4 `refugees`: families at the gate

A small crowd of families gathered at a village's timber gate: carts piled with bundles, a cow on a rope, children holding hands, an old man leaning on a staff. Two of the village's spearmen stand at the gate, unsure. In the far distance, a thin column of smoke where these people came from.

**Must keep:** need and uncertainty; the choice to take them in or turn them away should feel real.

### 5.5 `fair`: a midsummer fair

A bright midsummer day in a meadow outside a village. Striped stalls, bunting, a maypole with ribbons, jugglers, a pie seller, children running, a few merchants with carts. The village keep is visible on a rise behind.

**Must keep:** the happiest picture of the set; warm sunlight and colour, everyday joy.

### 5.6 `bandits`: a bandit chief sends terms

A rough clearing at the edge of a wood. A scarred bandit chief in mismatched armour sits on a tree stump, holding out a rolled message to a nervous village messenger who stands before him, cap in hand. Five or six armed outlaws lounge around a fire behind, with stolen goods piled under a lean-to.

**Must keep:** menace through posture and setting, not violence; the chief is clearly the one setting terms.

### 5.7 `tournament`: a joust at Kingsbridge

A bright spring day outside the royal city's walls. Two mounted knights in full harness charge at each other along a wooden tilt barrier, lances lowered, one in blue and one in red caparisons. Behind them, timber stands hung with the coloured cloths and shields of many houses, crowded with townsfolk and nobles; Kingsbridge's stone walls and towers beyond.

**Must keep:** the moment just before the lances meet; festive and grand, the one cheerful crowd scene in the set.

### 5.8 `scheme`: a captain takes a purse

Night, inside a soldier's tent lit by a single lantern. A hard-faced captain in mail sits at a camp table with a map on it, and accepts a heavy purse from a cloaked visitor whose face is half hidden by a hood, a purple cloak just visible at the edge. A sword and helmet rest beside the table; the tent flap is closed.

**Must keep:** secrecy and betrayal through the lantern light and the hidden face; quiet, not theatrical.

### 5.9 `pilgrims`: pilgrims at the shrine

A sunny morning before a stone abbey church. A line of pilgrims in plain travelling cloaks and broad hats, with staffs and scallop-shell badges, queue toward the open door, where two monks in dark habits welcome them; within, candlelight on a gilded relic shrine. A few have come a long way: a man on crutches, a family with children, an old woman helped along.

**Must keep:** hopeful and devout; the shrine's warm light at the door is the focal point.

### 5.10 `toll`: a toll on the ford

A shallow river ford in a valley. A rough timber toll booth on the bank and a heavy chain stretched across the water on posts. Armed men in a rival lord's colours (orange and black) stand at the chain and stop an ox cart of grain, one holding out his palm, while the carter argues and his wife watches from the cart.

**Must keep:** petty extortion, not violence; the chain across the water reads at once.

### 5.11 `collapse`: a mine has fallen in

A timbered mine entrance in a rocky hillside, at dusk. Grey dust pours out of the dark mouth. Miners with lanterns and ropes haul at fallen timbers and stones to dig through, others pass buckets of rubble back, and women from the village wait anxiously nearby.

**Must keep:** urgency and rescue; the dust and lantern light, not injuries.

### 5.12 `masons`: masons on the road

A country road toward a timber village in soft afternoon light. Three or four stonemasons in dusty work tunics and leather aprons walk beside an ox cart loaded with pale dressed stone blocks, their mallets, chisels and a long measuring rod bundled on top. One older mason with a grey beard points ahead at the village. Far behind them on a hill, a newly finished abbey tower.

**Must keep:** skilled, hopeful working men looking for a new place; the cartload of cut stone reads at once.

### 5.13 `foresters`: foresters with their timber

The edge of a deep wood in the early morning, mist between the trees. Three or four foresters in green-brown hoods and rough wool, axes on their shoulders, haul a wooden sledge stacked with seasoned logs out of the trees toward a village's fields. One has a hunting dog at heel; a woman carries a bundle and a small child. A royal hunting lodge's fence is just visible deep in the wood behind them.

**Must keep:** sturdy, weathered people of the woods asking for a home; the sledge of timber is the focal point.

*Design context, not for the image prompt:* these illustrate the campaign's event choices (`src/world/`, Realm workstream). Each event id matches the file name.


---

## 6. Norrhold, outlaws, the big moments and the finishing touches

Six smaller sets that fill the last gaps. Do them **after sections 1–5**, in the order given here. Every piece stands on its own, so stop wherever time runs out.

### 6.1 `norrhold`: King Askar of Norrhold (portrait and arms)

The enemy of Part 2: a king from beyond the old wall in the north, who comes down with hosts in their thousands once the player is crowned. He can't be bargained with. His heralds' messages show his portrait, so it appears as soon as the file lands.

**Portrait** (`assets/art/portraits/norrhold.png`, framed exactly like section 1). House colour pale ice blue `#9cc3dc`. A big, calm man of about fifty with a grey-blond beard in two short braids, a broad weathered face and pale eyes. A plain iron crown, heavy mail under a fur mantle with a pale blue-grey cloak. Grounded northern kit of the 12th–13th century, not a fantasy barbarian: no horned helmets, no skulls, no bare chests. Behind him, a snowy mountain pass at dusk with the campfires of a great host strung down the slope. He looks at the viewer with complete certainty, not anger.

**Must keep:** ice blue; the most frightening portrait in the set through stillness and scale, not snarling.

**Arms** (`assets/art/heraldry/norrhold.png` and `norrhold-banner.png`, by section 2's rules): pale ice-blue field; a black raven with wings spread.

### 6.2 `bandits`: the outlaws (portrait and badge)

**Portrait** (`assets/art/portraits/bandits.png`, framed like section 1). One bandit chief stands for all of them: a lean, sharp-eyed woman or man of about thirty-five in a mismatched brigandine and a stolen, too-fine cloak, hood half down, a knife at the belt. Drab brown and green, house colour `#5a5048`. A dark wood and a cooking fire behind. Sly and confident, not grotesque. This should look like the same chief as the event picture in 5.6 if that one is already made.

**Badge** (`assets/art/heraldry/bandits.png` and `bandits-banner.png`): not proper heraldry. Rough undyed brown cloth with two crossed white daggers, crudely daubed in paint. The banner version is a torn, ragged strip.

### 6.3 Banners for the mercenary companies

Six companies of sellswords hire themselves out at the market towns. Each gets a **banner only** (256×384, transparent background), saved as `assets/art/heraldry/company-<id>.png`. Unlike the houses' banners, these are **swallow-tailed, patched and battle-worn**, so a hired company reads as hired at a glance. The same rules for shapes and colours as section 2 apply: one bold charge, readable at 24 px.

| id | Company | Proposed banner |
|---|---|---|
| `grey` | the Grey Company | Grey field; a white sword, point down. |
| `lanterns` | the Black Lanterns | Black field; a gold lantern. |
| `hounds` | the Red Hounds | Dark brick-red field; a white running hound. |
| `salt` | the Salt Brothers | Sea grey-blue field; a white saltire (a diagonal cross). |
| `ash` | the White Ash Company | White field; a black ash tree. |
| `ninefold` | the Ninefold | Black field; nine gold coins, set three, three, two, one. |

### 6.4 The big moments

Seven paintings for the campaign's turning points, shown above the text in the result box (and, for the Part 2 opening, full screen). Each is **1280×720, opaque**, saved as `assets/art/moments/<id>.png`. Same painting hand as the portraits and events, but wider and grander: these are the pictures the player remembers. Keep the bottom quarter calm, since text and a button sit over or below it. No text.

| id | When it shows | Scene |
|---|---|---|
| `crowned` | You win Part 1 | The player's lord, in blue, kneeling to be crowned in a great stone hall at Kingsbridge, lit by high windows. The six rival lords' colours hang as banners along the walls. Solemn and golden. |
| `invasion` | Part 2 begins | The old stone wall across the northern hills, breached and falling in a long section, under a dark sky. Through the gap, an endless column of the Norrhold host with ice-blue banners and war dogs, pouring south toward the viewer. The scale is the point. |
| `north-broken` | You win Part 2 | Dawn after the last battle at the northern gate. The blue banner of the player's house planted on a hill, tired soldiers of every house below it, and the Norrhold host falling back through the mountain pass in the far distance. Earned, quiet triumph. |
| `defeat` | You lose the campaign | A burned keep on a hill at dusk, smoke rising, the blue banner torn and lying in the mud in the foreground. Grief, not gore. |
| `battle-won` | You win a battle | A field after a battle in late afternoon light: the blue banner held high, soldiers raising weapons, the enemy routing over a far rise. |
| `battle-lost` | You lose a battle | Soldiers in blue falling back in good order through rain across a ford, carrying their wounded, the banner still up. Hard, not hopeless. |
| `storm-failed` | An attack on a stronghold fails | A stone gatehouse still standing, a broken ladder and a battering ram abandoned before it, attackers falling back under arrows. Shown from the attackers' side. |

**Must keep:** grounded and human throughout; the crowning and the invasion are the two most important.

### 6.5 Title painting

`assets/art/title.png`, **1920×1080, opaque**, for the title screen and loading screens. A wide view over the realm in late golden afternoon: rolling green countryside with strip fields, a river with a stone bridge and a walled town (Kingsbridge) on its far bank, timber villages and a castle on a hill. In the middle distance, a column of soldiers under a blue banner marches along the road. Far to the north, faint on the horizon, a long old wall across the hills under a darkening sky, a hint of what is coming. **Keep the left third quiet** (sky and soft hills), because the game's name and menu sit there. No text, no logo.

Also make `assets/art/title-tall.png`, **1080×1920, opaque**, for phones held upright (the creator's family plays on phones). The same scene and light, recomposed rather than cropped: the castle, river and marching column in the lower half, the far wall and darkening sky above them, and **the top third quiet**, because the name and menu sit there on a phone.

### 6.6 Mouse cursors

Six cursors in the style of the section 4 icons (ink outline, flat hand-colouring), but each with a **thin light parchment outline** so it reads over grass, snow and dark woods. Paint each at 64×64 and also save a sharp 32×32 version (the game uses 32 px). Transparent background, saved as `assets/art/ui/cursors/<name>.png` and `<name>-32.png`. Note the **hotspot** (the exact pixel that clicks) for each in the manifest.

| name | Look | Hotspot |
|---|---|---|
| `pointer` | A steel gauntlet with the index finger pointing up-left. | The fingertip. |
| `select` | The same gauntlet, its cuff in house blue, for when it is over your own soldiers. | The fingertip. |
| `move` | A small blue pennant on a short staff, planted. | The foot of the staff. |
| `attack` | A sword pointing up-left, with a touch of red on the blade. | The sword's point. |
| `build` | A mason's hammer. | The hammer's head. |
| `blocked` | A red circle with a slash. | The centre. |

### 6.7 Captains

The named captains who lead every army (and the wandering knights from 5.3) have names, levels and traits but no faces. Paint **ten generic portraits** that the game can hand out, saved as `assets/art/captains/captain-01.png` to `captain-10.png`, at 384×480 (4:5), framed like section 1 but smaller in ambition. They must be **free of any house colour**: browns, greys, undyed wool and steel, so any house can use them. A muted brown-grey background with no setting.

Mix them: ages from about twenty-five to sixty; three of the ten women; two in plate, four in mail, two in leather and padded coats, two in hoods or mail coifs; one or two with grey hair, one with an eyepatch or old scar. Every one a working soldier who looks capable, not a hero or a lord.

*Design context, not for the image prompt:* only the Norrhold and bandit portraits show up on their own (the game already looks for `portraits/<house id>.png`). The rest needs a small hookup once the files land: house heraldry and company banners onto flags and labels, the moments into the result box (`showResult` in `src/campaign.js`, and the shattered victory screen that opens Part 2 can break the `crowned` painting instead of a screenshot), the title painting into a title screen the game doesn't have yet, cursors through CSS `cursor`, and captain faces assigned by captain id in `src/world/captains.js`.


---

## 7. 3D: animation clips for the soldiers

**Status: withdrawn (2026-11-21). Don't make any of this section.** The creator decided Codex is for 2D art only (event pictures, icons, portraits); the game's models and animation come from CC0 finds and its own rig tools. The rest of this section is kept for the record.

*Earlier status: 7.1 and 7.2 were requested (2026-11-19), ahead of anything left in sections 1–6.* The creator looked at Codex's prototype soldiers (`assets/codex-prototypes/`, the asset workshop) and decided **not** to use them: the game keeps its Quaternius soldiers. So no more bodies or soldier models. What they want instead is animation for the soldiers the game already has: make every clip on the game's current Quaternius bodies and rig, and **don't rig, animate or build on the prototype bodies**.

**Do one test clip first** (7.1's `Spear_Thrust`), commit it, and carry on with the rest. The Art workstream checks the test in the game and will write into this section if anything about the rig or format needs to change. The rig's source is already in `assets/art/3d/wip/Male_Adventurer.source.glb` (the women, `Female/Medieval.glb`, share the same rig), and the horse for 7.1's riding clips and 7.2 is `assets/art/3d/wip/Horse.source.fbx` (CC0, Quaternius 2018 Farm Animals).

### Format for everything in this section

- glTF 2.0 binary (`.glb`), Y up, metres, facing +z, origin on the ground at the model's centre. No textures: flat colours on a few named materials, flat-shaded, matching the Quaternius look.
- Cloth that should take the house colour goes on materials named `cloth` in mid greys; the game tints those. Everything else (wood, steel, leather, skin) keeps its own colour.
- Work in `assets/art/3d/wip/` and put finished files in `assets/art/3d/`. Nothing in the game loads that folder directly: the Art workstream bakes picks into `assets/models.glb`, so don't touch that file.

### 7.1 Medieval animation clips (most wanted)

Our soldiers are the Quaternius modular men and women (CC0 Ultimate Modular Characters; `tools/models/fetch.py` has the exact files, for example `Male/Adventurer.glb`). They share one rig under `CharacterArmature`: Root, Hips, Abdomen, Torso, Chest, Neck, Head, Shoulder/UpperArm/LowerArm/Wrist and fingers `.L` and `.R`, UpperLeg/LowerLeg/Foot `.L` and `.R`, and the leg targets `PT.L` and `PT.R`. Make the clips **on that rig, with those exact bone names**, so they drop straight onto every soldier. Deliver them as one `.glb` holding the armature and the clips (the mesh is optional), saved as `assets/art/3d/clips-foot.glb` and `clips-riders.glb`.

The rig already has Idle, Idle_Sword, Walk, Run, Run_Back/Left/Right, Sword_Slash, Punch, Kick, Roll, HitRecieve, Death, Interact and Wave, and some gun clips. **Don't remake those.** What's missing is everything medieval:

| Clip | Loop? | What it shows |
|---|---|---|
| `Spear_Thrust` | no, about 0.8 s | Two hands on a long spear, step in and thrust at chest height, back to guard. |
| `Spear_Brace` | hold | Drop to one knee, butt of the spear grounded behind the back foot, point angled up at a horse's chest. |
| `March_Upright` | yes | A steady walk with the weapon held upright in the right hand (spear, bill or sword at the shoulder). |
| `Bow_Loose` | no, about 1.6 s | Nock, draw to the cheek, loose, follow through, reach for the next arrow. Bow in the left hand. |
| `Crossbow_Span` | no, about 3 s | Crossbow nose down, foot in the stirrup, pull the string back with both hands, lay a bolt, raise and shoot. |
| `Shield_Block` | no, about 0.6 s | Shield arm (left) comes up and braces, the body leans into it. |
| `Shield_Wall` | yes | Crouched a little behind a raised shield, weapon held ready over its rim, small shifts of weight. |
| `Javelin_Throw` | no, about 1 s | Run-up step and an overarm throw. |
| `Rout` | yes | Running away in panic: looking back over the shoulder, arms loose, the weapon dropped. |
| `Cheer` | no, about 1.5 s | Weapon raised high, a shout. |
| `Chop`, `Hoe`, `Mine`, `Carry` | yes | Villagers at work: an axe at a log, a hoe in a field, a pick at rock, a sack on the shoulder. |
| `Ride_Idle`, `Ride_Trot`, `Ride_Gallop` | yes | Seated on the Quaternius horse (from the same CC0 2018 Farm Animals pack), legs astride, the body following the horse's gait. |
| `Ride_Couch`, `Ride_Slash` | no | Lance couched under the right arm for the charge; a downward sword cut from the saddle. |

Rules for the clips: 30 frames per second; loops start and end on the same pose; **in place**, with no root motion (the game moves the men); hands where a weapon held in `Wrist.R` (and the bow or shield in `Wrist.L`) would sit naturally.

**Must keep:** the exact bone names; in place; grounded and weighty, not the springy game-y look.

### 7.2 The horse

The Quaternius horse has Idle, Walk, WalkSlow, Run, Jump and Death. Wanted on its rig, in the same rules: `Gallop` (a full charge, faster and lower than Run), `Rear`, and `Trot`. Save as `assets/art/3d/clips-horse.glb`.

### 7.3 Models (on hold)

Not requested yet: only if the creator asks for them after 7.1 and 7.2 are in. Keep each under the triangle budget given, in the Quaternius style: chunky, simple, flat colours.

| File | Budget | What it is |
|---|---|---|
| `siege-ram.glb`, `siege-mangonel.glb`, `siege-trebuchet.glb`, `siege-tower.glb` | 3,000 each | Siege engines to replace the borrowed Kenney ones, which look like toys. Weathered timber, rope, iron fittings, hide roofs. The throwing arms (and the tower's drawbridge) as **separate nodes named `arm`** and `door`, pivot at the axle or hinge. |
| `pavise.glb` | 300 | A tall crossbowman's standing shield with a prop at the back. The front face a plain `cloth` panel for the house colour. |
| `shields.glb` | 300 each | A heater shield and a kite shield with a flat face in `cloth`, a round northern shield with a boss, as separate nodes. |
| `norrhold-gear.glb` | 400 each | For Norrhold's army (6.1): a spangenhelm with a nose guard, a fur mantle that fits over the modular men's shoulders, a bearded axe, as separate nodes. |
| `banner-pole.glb` | 200 | A tall pole with a crossbar and a plain `cloth` banner hanging from it (the game swaps in the arms). |

*Design context:* the soldiers are baked from posed, still models, so on the battlefield they only bob. The Art workstream will bake the clips (with the rig's own Walk and Run) into the game's soldiers. These clips are what make a spear wall brace, archers draw and a broken regiment run.

---

## 8. The climb and the realm: more moments

Added 2026-11-21 by the asset scout. Status: **ready**. Work this section after section 6.4, in the order of the table. The rank-ups and the knights' hall already have a moment in the game (`world.js` `checkRank` and `rankUp('hall')`: a herald, drums and a horn) but no picture; the vassal and faction scenes come up in the Realm screen. The Realm workstream shows each one once its file is in place, as with the events.

Same format and rules as 6.4: **1280×720, opaque**, saved as `assets/art/moments/<id>.png`; the same painting hand as the portraits, events and moments; the bottom quarter calm for text and a button; no text. The player's house is blue (`#3d6fd6`, `SIDE_COLORS` in `src/view.js`; house colours in `src/world/realm.js`); rivals and vassals in their own colours where a scene names them, otherwise in browns, greens and greys.

| id | When it shows | Scene |
|---|---|---|
| `rank-lord` | You become a Lord | A modest timber hall in a village. The player's reeve, in blue, takes an oath with one hand on a book before an old priest, while a handful of villagers and two spearmen watch from the doorway. Morning light, small and earnest. |
| `rank-count` | You become a Count | An outdoor muster in a meadow: the player's lord on horseback in blue, many small banners of the villages the house holds gathered behind, levies in rows. A herald with a horn alongside. Bright, growing confidence. |
| `rank-duke` | You become a Duke | A stone hall with a long table. The player's lord at its head in a rich blue cloak, captains and vassal lords in their own colours along both sides, a great map of the realm spread across the wood. Candle and window light, power and weight. |
| `rank-king` | You become King | Not the crowning (that is `crowned`, 6.4): the new king on the walls of Kingsbridge at dusk, seen from behind, looking out over the river city and its lights, a blue royal standard snapping overhead. Alone, the cost of it. |
| `knights-hall` | Your first knights' hall is finished | A long timber-and-stone hall with a red tiled roof and a training yard before it: straw targets, a wooden pell, a quintain. Veterans in mail, newly knighted, kneel in a row while an older knight in blue walks the line. |
| `investiture` | You raise a vassal to baron or count | Inside the player's hall, a vassal lord (any of the vassal colours, not blue) kneels as the player's lord places a gold chain of office round his neck. A clerk with a charter and wax seal beside them. |
| `feud` | Two of your vassals start a feud | A burned barn and a broken fence between two fields at dawn; on each side a small group of armed men under different coloured pennons, glaring across the ditch. Bitter, local, petty. |
| `faction-rises` | A faction of vassals rises against you | Night, a rough camp in a wood. Three vassal lords in different colours stand round a fire, hands joined over a sword laid on a drum, their men's tents behind. Conspiratorial, firelit. |

**Must keep:** grounded and human, like 6.4. The player may be a lord or a lady (`player` and `player-f` portraits): paint the rank-ups with the player seen from behind or at a distance, so either reads. The four rank-ups should read as one rising sequence, from a village oath to a lonely king, so paint them in order and compare them side by side.
