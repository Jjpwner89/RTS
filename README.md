# Hearth and Host

An early-stage strategy game: grand-strategy progression (lord → emperor) with hand-fought real-time battles.
Goals, decisions and open questions live in [DESIGN_NOTES.md](DESIGN_NOTES.md). What to build next is in [ROADMAP.md](ROADMAP.md). Every session follows [HOW_WE_BUILD.md](HOW_WE_BUILD.md) and checks work against [GENRE_BASICS.md](GENRE_BASICS.md).

## Run it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. three.js is vendored in `vendor/three/` (r170, MIT); only the headings' fonts come from Google Fonts, and the game falls back to a serif without them.

- `world.html`: the campaign: a world map of four places, your villages, field battles and a rival house.
- `town.html`: the village on its own: build, work, raise levies, hold off bandit raids.
- `battle.html`: the field battle test.
- `sandbox.html`: the combat sandbox: one fight under settings A to G of how hard fighting is (battle.js `TUNING`), alone or side by side, with the numbers that tell them apart.
- `march.html`: the march sandbox: how long armies take between places under settings A to C of the march (src/world/march.js), and a raid band against the relief that answers it.

Icons are from [game-icons.net](https://game-icons.net) (CC BY 3.0); see [assets/icons/CREDITS.md](assets/icons/CREDITS.md).

## Putting it online (GitHub Pages)

Nothing is published yet. The workflow is written and waits in `tools/pages-workflow.yml` (the token the sessions push with may not create files under `.github/`); even once installed it is **inert**: it only runs when you start it by hand.
It deploys a filtered copy of the repository built by `tools/build-site.sh` (the game, its assets and the vendored three.js; not the notes,
tools, the Marchfront side project, the art in progress, the sandboxes or the scouted models nothing loads), stamped with the commit so the
front page, the game menu and every error report say which build it is. About 90 MB.

When V1 is done, the creator clicks, once:

1. Install the workflow: on github.com/Jjpwner89/RTS, **Add file → Create new file**, name it `.github/workflows/pages.yml`, paste in the contents of `tools/pages-workflow.yml`, and commit it to `main`. (Or run `gh auth refresh -s workflow` once and move the file there yourself.)
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Deploy to GitHub Pages → Run workflow** (branch `main`).
4. Wait about two minutes. The address is shown on the finished run: https://jjpwner89.github.io/RTS/ (renaming the repository changes it).

To put out a new version, run the workflow again (a page open during a deploy offers a reload within five minutes).
To take it down: Settings → Pages → Unpublish site. Players' saves live in their own browsers and are not touched either way.

Before it goes public: `credits.html` is complete for what ships (see its Icons, Type and Code sections), but check with whoever painted
the portraits, heraldry, map art and event pictures that the page says how they were made. `tools/build-site.sh` stops if `assets/` grows
something new, so it gets credited before it is published.

Try the filtered copy locally under a sub-path, as Pages serves it:

```bash
sh tools/build-site.sh /some/folder/RTS && (cd /some/folder && python3 -m http.server 8878)   # open http://localhost:8878/RTS/
```
