# RTS art briefs for Codex

Written 2026-11-18 by the Art workstream. Revision 2 (icons now match the game's icon file names). Status of every brief: **ready**. Nothing is generated yet.

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

  `<id>` is `varn`, `carrow`, `stonemere`, `wyndham`, `penhallow`, `dunmore`, or `player` (with `player-f` for the second player portrait).
- Make two or three takes of each image and pick the best. Keep the others in `wip/` for the creator to look at.
- Before calling an image done, look at it: hands, eyes, faces, armour straps, the shield's charge, and whether it reads at small size.
- Commit to `main` in small steps (`git pull --rebase` before every push). Don't touch any file outside `assets/art/`.

## Shared look (applies to every section)

The game is a grounded medieval strategy game: no magic, no fantasy races, roughly 13th–14th century England and northern France in feel, with invented places and houses. In the 3D game, people and buildings are low-poly, flat-shaded models with soft, clean colour (the Quaternius packs). The paintings should sit comfortably next to that. Aim for **painted, warm and readable**: a stylised digital painting with visible brushwork, simplified shapes, clear silhouettes and confident colour, rather than photoreal or gritty. Think of a strategy game's character cards, painted by one artist for the whole set.

- One consistent painting hand across a section. Every portrait must look like part of the same gallery.
- Matte materials: steel and gold catch the light, but nothing should look glossy or plastic.
- No text, letters or numbers anywhere in an image unless a brief asks for them.
- The creator dislikes wooden frames on UI buttons. Use parchment, cloth and thin metal rims instead (see section 4).

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

The game's panels and buttons are currently plain dark boxes with emoji for icons. This kit replaces them. All files are PNG with transparent backgrounds, in `assets/art/ui/`.

**Look:** warm parchment and dyed cloth with thin dark iron or bronze rims; ink-drawn and hand-coloured. **No wooden frames or planks** (the creator's explicit dislike). Buttons are parchment or cloth ribbons. All edges must survive **9-slice scaling**: keep the corners and rims inside a fixed 24 px border, with plain, stretchable centres.

### 4.1 Frames and buttons

| File | Size | Notes |
|---|---|---|
| `panel.png` | 256×256 | Parchment panel, 24 px rim; the centre is plain parchment that stretches cleanly. |
| `panel-dark.png` | 256×256 | The same panel in dark dyed leather, for the HUD bar over the 3D view. |
| `button.png` | 256×72 | Parchment ribbon button, 24 px rims at the left and right ends. |
| `button-hover.png` | 256×72 | Warmer and brighter. |
| `button-pressed.png` | 256×72 | Slightly darker, looks pushed in. |
| `button-disabled.png` | 256×72 | Faded and greyed. |
| `tab.png`, `tab-active.png` | 192×64 | Cloth tabs for the build menu groups. |
| `tooltip.png` | 128×128 | Small parchment scrap, 16 px rim. |
| `divider.png` | 512×24 | Inked flourish line. |
| `portrait-frame.png` | 320×400 | Frame for a 4:5 lord portrait: thin bronze rim with a small shield-shaped slot at the bottom centre for heraldry. Transparent window. |
| `banner-frame.png` | 256×64 | Name plate under a portrait. |

### 4.2 Icons

Each icon is **128×128** on a transparent background, saved as `assets/art/ui/icons/<name>.png`.

The game already has a stand-in set of plain silhouettes (game-icons.net) in `assets/icons/<name>.svg`. Where a painted icon replaces one of them, **use the same file name**, so the game can swap it in: arrows, barracks, battle, bows, bowyer, camp, carpenter, castle, crown, farm, feathers, flax, flaxfield, food, ford, gold, house, hunter, iron, keep, map, market, mine, monastery, ore, people, planks, quarry, raid, retreat, ropemaker, shields, siege, smelter, spears, stone, storehouse, string, swords, village, warning, weaponsmith, wood, woodcutter. Paint those first, then the extra ones listed below. Use one consistent style: an ink outline with flat hand-colouring and a soft parchment-coloured halo so it reads on both light and dark panels. Each must be recognisable at **24 px**: one object, centred, nothing else.

- **Goods:** wood (logs), stone (cut blocks), food (bread and ham), grain (sheaf), flour (sack), bread (loaf), flax (bundle), feathers, iron ore (rust-red rock), iron (bar), planks, string (coil), leather (hide), gold (coins), horses (horse head), shields (round wooden shield), bows, arrows (sheaf), spears, swords, crossbows, mail (mail shirt), plate armour (breastplate).
- **Buildings:** house, storehouse, woodcutter, quarry, mine, hunter's lodge, farm, flax field, carpenter, ropemaker, smelter, bowyer, weaponsmith, barracks, market, tanner, armourer, stable, mill, bakery, siege workshop, watchtower, wall, gate, tower, keep.
- **Units:** levy spearmen, swordsmen, archers, crossbowmen, light cavalry, heavy cavalry, men-at-arms, knights, captain (a plumed helm), ram, mangonel, trebuchet, ladder.
- **Orders:** move, attack, hold, charge, fire at will, hold fire, formation line, formation column, formation wedge, rally, disband, raise levy.
- **Realm:** population, mood (happy, content and angry faces), gold income, food supply, war (crossed swords), peace (olive branch), truce (white flag), alliance (clasped hands), marriage (two rings), tribute (coin chest), vassal (kneeling figure), crown, scout (eye), siege (catapult), fire.

*Design context, not for the image prompt:* the HUD is HTML and CSS over the 3D view (`src/hud.js`, `src/townhud.js`, `src/style.css`). Icons replace the emoji keyed in `src/economy.js`. The Art workstream wires the kit in once it lands.
