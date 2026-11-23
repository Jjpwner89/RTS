#!/bin/sh
# Writes the commit and date into src/version.js. Run by the deploy on its copy of the site, never committed:
#   sh tools/stamp.sh
cd "$(dirname "$0")/.." || exit 1
sha=$(git rev-parse --short HEAD 2>/dev/null || echo dev)
at=$(date -u +%Y-%m-%d)
cat > src/version.js <<JS
// Stamped by tools/stamp.sh at deploy time.
export const BUILD = { sha: '$sha', at: '$at' };
JS
echo "stamped $sha $at"
