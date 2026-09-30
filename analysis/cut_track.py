"""Cut the full Suno take down to the edit -> audio/track.wav, data/lyrics.json, data/audio.json.

The full take and its analysis live in audio/full/ and data/full/ (align_lyrics.py and
analyze_audio.py write there). This script keeps the regions listed in KEEP (source
seconds; every boundary is a downbeat, so the bar grid survives the splices), joins them
with short equal-power crossfades, and remaps every timestamp in the analysis: lyrics,
beats, downbeats, sections, onsets and the 100 fps envelopes. Events inside removed
regions are dropped.

Run:  python3 analysis/cut_track.py
"""
import json

import numpy as np
import soundfile as sf

# Source regions to keep (seconds in audio/full/track.wav), all on downbeats.
# Removed: the intro's wordless chops before 10.4 (the soft opening build before them is kept,
# so the song doesn't start cold), the "Hold it, sign it, go" echo after chorus 1, most of the
# "ooh" lift before chorus 2, and the middle of the break before the outro (from 2 bars after
# chorus 2 to the last bar of the quiet breakdown). The ending runs to the end of the take: the
# last hit at ~179 s rings out by itself.
KEEP = [
    (0.000, 4.611),     # soft opening build up to the groove's first downbeat
    (10.442, 75.886),   # intro groove (4 bars) .. chorus 1 incl. its held "go"
    (79.698, 125.140),  # pickup into verse 2 .. bridge
    (128.902, 151.478), # end of the lift (pickup) .. chorus 2 .. 2 bars of its held "go" / "oh"
    (162.748, 181.200), # last bar of the breakdown, pickup, "OneKey Pro 2", outro to the end
]
# The lead vocal is faded out over these source spans (mix minus a growing share of the Demucs
# vocal stem), so the splice after them lands on the band alone instead of chopping the melody.
# The stem excerpt is committed (audio/full/vocals_<t0>-<t1>.wav, 48 kHz) since the stems
# themselves are not.
VOCAL_FADES = [(149.597, 151.478, 'audio/full/vocals_149.4-151.7.wav', 149.4)]  # a, b, stem, stem start
XFADE = 0.030  # s, at each splice
FADE_OUT = 0.3  # s, at the very end (the take has already decayed to about -46 dB)

src, sr = sf.read('audio/full/track.wav', always_2d=True)
for a, b, path, t0 in VOCAL_FADES:
    voc, vsr = sf.read(path, always_2d=True)
    assert vsr == sr
    i0, ia, ib = int(round(t0 * sr)), int(round(a * sr)), int(round(b * sr))
    g = np.cos(np.linspace(0, np.pi / 2, ib - ia))[:, None]  # vocal gain 1 -> 0
    src[ia:ib] -= (1 - g) * voc[ia - i0:ib - i0]
xf = int(XFADE * sr)
out = None
for a, b in KEEP:
    seg = src[int(round(a * sr)):int(round(b * sr))].copy()
    if out is None:
        out = seg
        continue
    # equal-power crossfade: the splice point stays at the downbeat
    h = xf // 2
    tail, head = out[-h:], seg[:h]
    ramp = np.linspace(0, 1, h)[:, None]
    out[-h:] = tail * np.cos(ramp * np.pi / 2) + head * np.sin(ramp * np.pi / 2)
    out = np.concatenate([out, seg[h:]])
n_fade = int(FADE_OUT * sr)
out[-n_fade:] *= np.linspace(1, 0, n_fade)[:, None] ** 2
sf.write('audio/track.wav', out, sr, subtype='PCM_16')
dur = len(out) / sr

offsets = []  # (src_start, src_end, dst_start)
d = 0.0
for a, b in KEEP:
    offsets.append((a, b, d))
    d += b - a - (xf // 2) / sr  # each splice overlaps the next region by half the crossfade


def remap(t):
    """Source time -> edit time, or None if t falls in a removed region."""
    for a, b, d0 in offsets:
        if a - 1e-6 <= t < b:
            return round(d0 + t - a, 3)
    return None


# ---------------------------------------------------------------- lyrics
ly = json.load(open('data/full/lyrics.json'))
lines = []
for ln in ly['lines']:
    words = []
    for w in ln['words']:
        s, e = remap(w['start']), remap(w['end'] - 1e-3)
        if s is None:
            continue
        words.append({**w, 'start': s, 'end': round(e + 1e-3, 3) if e is not None else round(s + 0.2, 3)})
    if len(words) != len(ln['words']):
        if words:
            raise SystemExit(f'cut splits a line: {ln["text"]!r}')
        continue  # the whole line was cut
    lines.append({**ln, 'start': words[0]['start'], 'end': words[-1]['end'], 'words': words})
out_ly = {**ly, 'lines': lines, 'notes': (ly.get('notes', '') + ' | Remapped to the edit by analysis/cut_track.py.').strip(' |')}
json.dump(out_ly, open('data/lyrics.json', 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- audio analysis
au = json.load(open('data/full/audio.json'))
fps = au['fps']
res = dict(au)
res['duration'] = round(dur, 3)
res['beats'] = [t for t in (remap(x) for x in au['beats']) if t is not None]
res['downbeats'] = [t for t in (remap(x) for x in au['downbeats']) if t is not None]
res['onsets'] = {k: [[remap(t), s] for t, s in v if remap(t) is not None] for k, v in au['onsets'].items()}
secs = []
for s in au['sections']:
    for a, b, d0 in offsets:
        lo, hi = max(a, s['start']), min(b, s['end'])
        if hi - lo > 0.05:
            st, en = round(d0 + lo - a, 3), round(d0 + hi - a, 3)
            if secs and secs[-1]['name'] == s['name'] and abs(secs[-1]['end'] - st) < 0.02:
                secs[-1]['end'] = en
            else:
                secs.append({'name': s['name'], 'start': st, 'end': en})
secs[-1]['end'] = round(dur, 3)
for p, q in zip(secs, secs[1:]):  # contiguous (the crossfade overlaps leave ~15 ms double-covered)
    q['start'] = p['end']
res['sections'] = secs
n = int(dur * fps) + 1
for k in ['rms', 'low', 'mid', 'high', 'vocal', 'drums', 'bass', 'other']:
    if k not in au:
        continue
    src_env = np.asarray(au[k], dtype=float)
    ts = np.arange(n) / fps
    srcs = []
    for t in ts:
        for a, b, d0 in offsets:
            if d0 - 1e-9 <= t < d0 + (b - a) + 1e-9:
                srcs.append(a + t - d0)
                break
        else:
            srcs.append(offsets[-1][1])
    res[k] = [round(float(v), 3) for v in np.interp(np.array(srcs) * fps, np.arange(len(src_env)), src_env)]
res['notes'] = (au.get('notes', '') + f' | Edit by analysis/cut_track.py: kept source regions {KEEP}, '
                f'{XFADE * 1000:.0f} ms crossfades, {FADE_OUT} s fade-out; duration {dur:.2f} s.')
json.dump(res, open('data/audio.json', 'w'))

print(f'edit: {dur:.2f} s ({int(dur // 60)}:{dur % 60:04.1f}), {len(lines)}/{len(ly["lines"])} lines kept')
for s in secs:
    print(f"  {s['name']:8s} {s['start']:7.2f} - {s['end']:7.2f}")
