#!/bin/sh
# Builds the folder Pages serves: a filtered copy of the game, stamped with the commit.
#   sh tools/build-site.sh _site
# Left out: notes (*.md, except the credits files the credits page reads), tools/, fronts/ (Marchfront), .github/, .git/,
# the art in progress and references, the dev-only pages (combat sandbox, march sandbox), and the scouted models and
# sounds nothing loads yet (assets/scout keeps only the folders the code names). Everything the game loads is kept.
# It stops, asking for the credits to be looked at, if assets/ grows something new at the top.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-_site}"
cd "$root"

known="anim.bin anim.json art audio icons models.glb scout textures"
for f in assets/*; do
  case " $known " in *" $(basename "$f") "*) ;; *) echo "assets/$(basename "$f") is new: add it to credits.html (and to 'known' in tools/build-site.sh) before it is published" >&2; exit 1 ;; esac
done

# scout folders the code loads (nature.js and any other that names assets/scout/<folder>)
scout=$(grep -rhoE "assets/scout/[a-z]+" src | sed 's#assets/scout/##' | sort -u)
filters=""
for d in $scout; do filters="$filters --include=assets/scout/$d/***"; done

rm -rf "$out"
mkdir -p "$out"
# shellcheck disable=SC2086
rsync -a \
  --exclude='.git' --exclude='.github' --exclude='.DS_Store' \
  --include='assets/audio/CREDITS.md' --include='assets/textures/CREDITS.md' --include='assets/icons/CREDITS.md' \
  $filters --exclude='assets/scout/*' \
  --exclude='*.md' \
  --exclude='tools' --exclude='fronts' \
  --exclude='assets/art/wip' --exclude='assets/art/refs' \
  --exclude='sandbox.html' --exclude='march.html' --exclude='_site' \
  ./ "$out"/
sh tools/stamp.sh "$out"
touch "$out/.nojekyll"
du -sh "$out" | cut -f1 | sed 's/^/site size: /'
echo "scout folders shipped: $scout"
