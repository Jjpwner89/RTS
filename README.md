# RTS

An early-stage strategy game: grand-strategy progression (lord → emperor) with hand-fought real-time battles.
Goals, decisions and open questions live in [DESIGN_NOTES.md](DESIGN_NOTES.md).

## Run it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. three.js loads from a CDN, so the first load needs internet.

- `world.html`: the campaign: a world map of four places, your villages, field battles and a rival house.
- `town.html`: the village on its own: build, work, raise levies, hold off bandit raids.
- `battle.html`: the field battle test.
