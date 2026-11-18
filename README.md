# RTS

An early-stage strategy game: grand-strategy progression (lord → emperor) with hand-fought real-time battles.
Goals, decisions and open questions live in [DESIGN_NOTES.md](DESIGN_NOTES.md).

## Run it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. three.js loads from a CDN, so the first load needs internet.

- `town.html`: the village: build, work, raise levies, hold off raids.
- `battle.html`: the field battle test.
