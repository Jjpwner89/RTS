# RTS art briefs for Codex

Written 2026-11-18 by the Art workstream. Revision 3 (2026-11-19: section 4 rewritten for the chosen parchment-and-ink interface, with tiling textures, exact 9-slice borders and the full icon list; section 5, event pictures, and the armour-level icons added). Status of every brief: **ready**. Nothing is generated yet.

These are the only paintings the game needs. Everything else (models, terrain, effects) comes from free CC0 packs. Codex may stop being available soon, so **work in priority order** and finish each section before starting the next: a complete set of portraits is worth more than half of everything.

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

  `<id>` is `varn`, `carrow`, `stonemere`, `wyndham`, `penhallow`, `dunmore`, or `player` (with `player-f` for the second player portrait).
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

Six paintings for the choices that come up during a campaign (a blight, a fever, a wandering knight and so on). Each sits at the top of a small prompt box above the text and the choice buttons, at about 640×360 and sometimes half that on a phone. The box hides the picture while a file is missing, so each can land on its own. Do these **after the portraits and heraldry**.

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

*Design context, not for the image prompt:* these illustrate the campaign's event choices (`src/world/`, Realm workstream). Each event id matches the file name.

