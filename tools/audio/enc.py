# Encode picked sounds into the game's folder (assets/audio).
# usage: python3 enc.py plan.json OUTROOT
# plan: [{out: "sfx/chop1", src, kind: "sfx"|"bed"|"music", trim: [a,b], fadein: s, fadeout: s, gain: dB}]
#   sfx:   one-shots, mono 44.1 kHz 80 kb/s, peak-normalised to -1 dB (plus gain)
#   bed:   looping ambience, mono 32 kHz 48 kb/s, loudness-normalised to -20 LUFS (plus gain)
#   music: stereo 44.1 kHz 64 kb/s, loudness-normalised to -17 LUFS
# Needs ffmpeg: set FFMPEG, or install imageio-ffmpeg, or have ffmpeg on the PATH.
import json, re, subprocess, sys, os
from ffpath import FF

plan, root = json.load(open(sys.argv[1])), sys.argv[2]

def probe(src, pre, af):
    r = subprocess.run([FF, '-hide_banner', '-nostats'] + pre + ['-i', src, '-af', af, '-f', 'null', '-'], capture_output=True, text=True)
    return r.stderr

def peak(src, pre):
    m = re.search(r'max_volume: (-?[\d.]+) dB', probe(src, pre, 'volumedetect'))
    return float(m.group(1)) if m else 0.0

def duration(src):
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe(src, [], 'anull'))
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None

for it in plan:
    out = os.path.join(root, it['out'] + '.mp3')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pre, length = [], duration(it['src'])
    if it.get('trim'):
        a, b = it['trim']
        b = min(b, length) if length else b
        pre = ['-ss', str(a), '-to', str(b)]
        length = b - a
    kind, af = it['kind'], []
    if kind == 'music':
        af.append('loudnorm=I=-17:TP=-1.5:LRA=11')
        args = ['-ac', '2', '-ar', '44100', '-b:a', '64k']
    elif kind == 'bed':
        af.append('loudnorm=I=-20:TP=-2:LRA=11')
        if it.get('gain'): af.append(f"volume={it['gain']}dB")
        args = ['-ac', '1', '-ar', '32000', '-b:a', '48k']
    else:
        g = -1.0 - peak(it['src'], pre) + it.get('gain', 0)
        af.append(f'volume={g:.2f}dB')
        args = ['-ac', '1', '-ar', '44100', '-b:a', '80k']
    if it.get('fadein'):
        af.append(f"afade=t=in:d={it['fadein']}")
    if it.get('fadeout') and length:
        d = min(it['fadeout'], length)
        af.append(f"afade=t=out:st={length - d:.2f}:d={d}")
    cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y'] + pre + ['-i', it['src'], '-af', ','.join(af), '-map_metadata', '-1', '-vn'] + args + [out]
    subprocess.run(cmd, check=True)
    print(f"{os.path.getsize(out) // 1024:6d} KB  {it['out']}")
