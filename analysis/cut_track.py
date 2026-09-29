"""Remove a span of bars from the soundtrack and shift the word timings to match.

  analysis/.venv/bin/python analysis/cut_track.py --cut=147.716,162.748

Both cut points should be downbeats (data/audio.json) a whole number of bars apart, so the groove
and the phrase grid carry on. Each is snapped to the nearest kick onset within 60 ms and the join
is an equal-power crossfade just before that transient. Writes new files and leaves the originals
alone: audio/track_cut.wav, the Demucs vocal stem as vocals_cut.wav (if present) and
data/lyrics_cut.json (words inside the removed span are an error). Then:
  python3 analysis/analyze_audio.py audio/track_cut.wav --out=data/audio_cut.json ...
To adopt the edit, move the _cut files over the originals.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

opt = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[1:] if a.startswith('--') and '=' in a}
a, b = (float(x) for x in opt['--cut'].split(','))
XF = 0.02  # crossfade, s
PRE = 0.005  # cut this long before the transient

kicks = [k[0] for k in json.load(open('data/audio.json'))['onsets']['kick']]
snap = lambda t: min(kicks, key=lambda k: abs(k - t)) if min(abs(k - t) for k in kicks) < 0.06 else t
a, b = snap(a) - PRE, snap(b) - PRE
removed = b - a
print(f'cut {a:.3f} -> {b:.3f} ({removed:.3f} s)')


def cut(path, out):
    x, sr = sf.read(path, always_2d=True)
    ia, ib, n = int(round(a * sr)), int(round(b * sr)), int(XF * sr)
    ramp = np.sin(np.linspace(0, np.pi / 2, n))[:, None]
    join = x[ia:ia + n] * ramp[::-1] + x[ib:ib + n] * ramp
    y = np.concatenate([x[:ia], join, x[ib + n:]])
    sf.write(out, y, sr, subtype=sf.info(path).subtype)
    print(f'{out}: {len(x) / sr:.3f} -> {len(y) / sr:.3f} s')


cut('audio/track.wav', 'audio/track_cut.wav')
stem = 'analysis/stems/htdemucs_ft/track/vocals.wav'
if os.path.exists(stem):
    cut(stem, stem.replace('vocals.wav', 'vocals_cut.wav'))

ly = json.load(open('data/lyrics.json'))
for line in ly['lines']:
    for o in [line] + line['words']:
        for k in ('start', 'end'):
            if a < o[k] < b:
                sys.exit(f'lyric inside the cut: {line["text"]} @ {o[k]}')
            if o[k] >= b:
                o[k] = round(o[k] - removed, 3)
ly['notes'] += f' Track edited: {removed:.3f} s removed at {a:.3f} (analysis/cut_track.py); times are for the edited track.'
json.dump(ly, open('data/lyrics_cut.json', 'w'), indent=1)
print(f'shift times after {b:.3f} by -{removed:.3f}')
