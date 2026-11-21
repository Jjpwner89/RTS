#!/bin/sh
# runprof.sh '<query>' [maxsecs]: runs tools/perf/prof.html in a headless Chrome on the real GPU and prints prof.json.
# e.g. sh tools/perf/runprof.sh 'q=medium&freeze=1&rounds=4&secs=2&exp=old,base,m600,m300&checks=1'
# Serves the repo on 8734 and collects results on 8733 (shots on 8732) unless something already listens there.
# Other sessions share the GPU: compare experiments within one load (rounds interleave them), and read drawMs,
# the fastest frame drawn and waited for.
R=$(cd "$(dirname "$0")/../.." && pwd); T=${TMPDIR:-/tmp}/rts-perf; mkdir -p "$T/results" "$T/shots"
lsof -iTCP:8734 -sTCP:LISTEN -P >/dev/null || { (cd "$R" && python3 -m http.server 8734 --bind 127.0.0.1 >/dev/null 2>&1 &); sleep 1; }
lsof -iTCP:8733 -sTCP:LISTEN -P >/dev/null || { python3 -I "$R/tools/perf/resultsink.py" "$T/results" >/dev/null 2>&1 & sleep 1; }
lsof -iTCP:8732 -sTCP:LISTEN -P >/dev/null || { python3 -I "$R/tools/perf/shotsink.py" "$T/shots" >/dev/null 2>&1 & sleep 1; }
curl -s "http://127.0.0.1:8734/tools/perf/runprof.sh" | cmp -s - "$0" || { echo "8734 serves another folder; stop it or free the port"; exit 1; }
rm -f "$T/results/prof.json"; rm -rf "$T/chrome/Default/Cache" "$T/chrome/Default/Code Cache"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$T/chrome" --no-first-run --mute-audio --window-size=1024,768 --force-device-scale-factor=2 --enable-logging=stderr --v=0 --enable-gpu "http://127.0.0.1:8734/tools/perf/prof.html?$1" > "$T/results/chrome.log" 2>&1 &
PID=$!
for i in $(seq 1 ${2:-400}); do grep -q '"done"\|"error"' "$T/results/prof.json" 2>/dev/null && break; sleep 1; done
kill $PID 2>/dev/null; sleep 1; pkill -f "user-data-dir=$T/chrome" 2>/dev/null
cat "$T/results/prof.json"
grep CONSOLE "$T/results/chrome.log" | grep -iE "error|uncaught" | head -5
