#!/bin/sh
# Writes the commit and date into src/version.js of a site folder (default: this checkout). The Pages deploy runs it on
# its copy (sh tools/stamp.sh _site); it is never committed.
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:-$root}"
sha=$(cd "$root" && git rev-parse --short HEAD 2>/dev/null || echo dev)
at=$(date -u +%Y-%m-%d)
cat > "$dest/src/version.js" <<JS
// Stamped by tools/stamp.sh at deploy time.
export const BUILD = { sha: '$sha', at: '$at' };
JS
echo "stamped $dest/src/version.js: $sha $at"
