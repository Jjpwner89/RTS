#!/bin/sh
# runprof.sh '<query>' [maxsecs]: runs tools/perf/prof.html in a headless Chrome on the real GPU and prints prof.json.
# e.g. sh tools/perf/runprof.sh 'q=medium&freeze=1&rounds=4&secs=2&exp=old,base,m600,m300&checks=1'
# Serves the repo on 8734 and collects results on 8733 (shots on 8732) unless something already listens there.
# Another session's sinks would swallow the results, so it refuses then: set PERF_PORT=8744 (sinks on 8743, 8742) to run apart.
# Other sessions share the GPU: compare experiments within one load (rounds interleave them), and read drawMs,
# the fastest frame drawn and waited for.
R=$(cd "$(dirname "$0")/../.." && pwd); P=${PERF_PORT:-8734}; S=$((P - 1)); H=$((P - 2))
T=${TMPDIR:-/tmp}/rts-perf; [ "$P" = 8734 ] || T=$T-$P; mkdir -p "$T/results" "$T/shots"
# exec, with the whole subshell sent to /dev/null: a shell left holding our stdout kept callers waiting to the timeout.
lsof -iTCP:$P -sTCP:LISTEN -P >/dev/null || { (cd "$R" && exec python3 -m http.server $P --bind 127.0.0.1) >/dev/null 2>&1 & sleep 1; }
lsof -iTCP:$S -sTCP:LISTEN -P >/dev/null || { python3 -I "$R/tools/perf/resultsink.py" "$T/results" $S >/dev/null 2>&1 & sleep 1; }
lsof -iTCP:$H -sTCP:LISTEN -P >/dev/null || { python3 -I "$R/tools/perf/shotsink.py" "$T/shots" $H >/dev/null 2>&1 & sleep 1; }
[ "$(lsof -a -p "$(lsof -tiTCP:$P -sTCP:LISTEN)" -d cwd -Fn | sed -n 's/^n//p')" = "$R" ] || { echo "$P serves another folder; set PERF_PORT to a free port"; exit 1; }
ps -o command= -p "$(lsof -tiTCP:$S -sTCP:LISTEN)" | grep -qF "$T/results" || { echo "$S is another session's results sink; set PERF_PORT to a free port"; exit 1; }
rm -f "$T/results/prof.json"; rm -rf "$T/chrome/Default/Cache" "$T/chrome/Default/Code Cache"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$T/chrome" --no-first-run --mute-audio --window-size=1024,768 --force-device-scale-factor=2 --enable-logging=stderr --v=0 --enable-gpu "http://127.0.0.1:$P/tools/perf/prof.html?$1&sink=$S&shots=$H" > "$T/results/chrome.log" 2>&1 &
PID=$!
for i in $(seq 1 ${2:-400}); do grep -q '"done"\|"error"' "$T/results/prof.json" 2>/dev/null && break; sleep 1; done
kill $PID 2>/dev/null; sleep 1; pkill -f "user-data-dir=$T/chrome" 2>/dev/null
cat "$T/results/prof.json"
grep CONSOLE "$T/results/chrome.log" | grep -iE "error|uncaught" | head -5
