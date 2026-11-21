# Make a seamless loop for a bed: take [start, start+len+xfade] and fold the tail over the head.
# usage: python3 loop.py SRC OUT.wav START LEN XFADE
# A layered bed is made by passing several SRCs joined by ',': each is looped to LEN and
# laid over the others at staggered offsets, like many feet out of step.
import subprocess, sys, wave
import numpy as np
from ffpath import FF

SR = 44100
srcs, out = sys.argv[1].split(','), sys.argv[2]
start, L, X = (float(v) for v in sys.argv[3:6])

def pcm(src):
    raw = subprocess.run([FF, '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()

def loop(x):
    n, x_n = int(L * SR), int(X * SR)
    seg = x[int(start * SR):int(start * SR) + n + x_n]
    if len(seg) < n + x_n:
        raise SystemExit(f'source too short for a {L}+{X} s loop from {start} s ({len(x) / SR:.1f} s long)')
    body, tail = seg[:n].copy(), seg[n:]
    ramp = np.linspace(0, 1, x_n, dtype=np.float32)
    # Equal-power crossfade: the tail fades out over the head as the head fades in.
    body[:x_n] = body[:x_n] * np.sqrt(ramp) + tail * np.sqrt(1 - ramp)
    return body

mix = None
for i, s in enumerate(srcs):
    y = loop(pcm(s))
    y = np.roll(y, int(i * len(y) / len(srcs)))
    mix = y if mix is None else mix + y
mix /= max(1e-6, np.abs(mix).max()) / 0.9
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f'{out} {len(mix) / SR:.1f}s')
