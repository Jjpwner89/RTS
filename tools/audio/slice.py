# Cut single hits out of a multi-hit recording.
# usage: python3 slice.py SRC OUTPREFIX N MAXLEN [START END]
# Writes the N loudest hits as OUTPREFIX1.wav ... each at most MAXLEN seconds, faded out.
import subprocess, sys, wave
import numpy as np
from ffpath import FF

src, pre, n, maxlen = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
rng = [float(x) for x in sys.argv[5:7]] if len(sys.argv) > 6 else None
SR = 44100
raw = subprocess.run([FF, '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32).copy()
if rng: x = x[int(rng[0] * SR):int(rng[1] * SR)]
win = int(0.01 * SR)
env = np.array([np.abs(x[i:i + win]).max() for i in range(0, len(x) - win, win)])
floor = np.percentile(env, 30)
thr = floor + (env.max() - floor) * 0.25
# An onset: the envelope crosses the threshold after at least 80 ms below it.
onsets, quiet = [], 8
for i, e in enumerate(env):
    if e >= thr and quiet >= 8: onsets.append(i)
    quiet = quiet + 1 if e < thr else 0
print(f'{len(onsets)} onsets, keeping {min(n, len(onsets))}')
if not onsets: raise SystemExit('no hits found')
ends = onsets[1:] + [len(env)]
hits = sorted(zip(onsets, ends), key=lambda oe: -env[oe[0]:oe[1]].max())[:n]
for k, (o, e) in enumerate(sorted(hits), 1):
    a = max(0, (o - 1) * win)
    b = min(len(x), a + int(maxlen * SR), e * win)
    y = x[a:b].copy()
    f = int(len(y) * 0.3)
    y[-f:] *= np.linspace(1, 0, f, dtype=np.float32)
    path = f'{pre}{k}.wav'
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f'  {path} {len(y) / SR:.2f}s')
