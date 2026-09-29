"""Soundtrack analysis -> data/audio.json (beats, downbeats, sections, onsets, envelopes).

librosa only (no neural models), so it runs anywhere pip works. Stems are approximated:
drums/bass from harmonic-percussive separation, vocal from librosa's REPET-SIM foreground
mask. Good enough to drive motion; for word timings see align_lyrics (needs models).

Run:  python3 analysis/analyze_audio.py [audio/track.wav] [--sections t1,t2,...]
"""
import json
import sys

import librosa
import numpy as np
import scipy.signal as ss

SR = 22050
FPS = 100
HOP = SR // FPS  # envelope hop: 10 ms (220.5 -> 220 samples, corrected below)

args = [a for a in sys.argv[1:] if not a.startswith('--')]
path = args[0] if args else 'audio/track.wav'
opt = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[1:] if a.startswith('--') and '=' in a}

y, _ = librosa.load(path, sr=SR, mono=True)
dur = len(y) / SR

# ---------------------------------------------------------------- beats
# Suno drifts tempo slowly, so no constant grid: DP beat tracking, then a local linear
# smooth (+-6 beats) that removes onset jitter but follows the drift.
oenv = librosa.onset.onset_strength(y=y, sr=SR, hop_length=128, aggregate=np.median)
tempo0 = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=oenv, sr=SR, hop_length=128))[0])
_, raw = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=128, start_bpm=tempo0,
                                 tightness=300, units='time', trim=False)
idx = np.arange(len(raw))
beats = np.array([np.polyval(np.polyfit(idx[max(0, i - 6):i + 7], raw[max(0, i - 6):i + 7], 1), i) for i in idx])

# ---------------------------------------------------------------- bar phase
# Downbeat = the beat phase with the largest harmonic change (chords change on the one).
hop = 512
bf = librosa.time_to_frames(beats, sr=SR, hop_length=hop)
chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=hop)
C = librosa.util.sync(chroma, bf, aggregate=np.median)
dc = np.r_[0, np.linalg.norm(np.diff(C, axis=1), axis=0)][: len(beats)]
phase = int(np.argmax([dc[p::4].mean() for p in range(4)]))
downbeats = beats[phase::4]

# ---------------------------------------------------------------- sections
# Checkerboard novelty on beat-synchronous chroma+MFCC, boundaries snapped to downbeats.
# Unlabelled until the lyrics are aligned (--sections overrides with manual times).
mfcc = librosa.feature.mfcc(y=y, sr=SR, hop_length=hop, n_mfcc=13)
M = librosa.util.sync(mfcc, bf)
F = np.vstack([librosa.util.normalize(C, axis=0), librosa.util.normalize(M, axis=1)])
S = np.corrcoef(F.T)
k = 16
g = np.outer(np.r_[-np.ones(k), np.ones(k)], np.r_[-np.ones(k), np.ones(k)])
nov = np.zeros(S.shape[0])
for i in range(k, S.shape[0] - k):
    nov[i] = -(S[i - k:i + k, i - k:i + k] * g).sum()
pk, _ = ss.find_peaks(nov, distance=12, prominence=np.std(nov) * 0.8)
if '--sections' in opt:
    bounds = [float(x) for x in opt['--sections'].split(',')]
else:
    bounds = sorted({float(downbeats[np.argmin(np.abs(downbeats - beats[min(p, len(beats) - 1)]))]) for p in pk})
edges = [0.0] + bounds + [dur]
sections = [{'name': f'part{i + 1}', 'start': round(a, 3), 'end': round(b, 3)} for i, (a, b) in enumerate(zip(edges, edges[1:])) if b > a]

# ---------------------------------------------------------------- envelopes (100 fps)
n_fft = 2048
env_hop = 220
Sx = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=env_hop))
freqs = librosa.fft_frequencies(sr=SR, n_fft=n_fft)
H, P = librosa.decompose.hpss(Sx, margin=2.0)
# vocal foreground: REPET-SIM on a coarser grid, then interpolated
Sv, _ = librosa.magphase(librosa.stft(y, n_fft=n_fft, hop_length=hop))
Sf = np.minimum(Sv, librosa.decompose.nn_filter(Sv, aggregate=np.median, metric='cosine',
                                                width=int(librosa.time_to_frames(2, sr=SR, hop_length=hop))))
fg = librosa.util.softmask(Sv - Sf, 10 * Sf, power=2) * Sv
vband = (freqs > 250) & (freqs < 4000)
vocal_c = np.sqrt((fg[vband] ** 2).mean(0))

t_env = np.arange(int(dur * FPS) + 1) / FPS
t_stft = librosa.frames_to_time(np.arange(Sx.shape[1]), sr=SR, hop_length=env_hop)
t_voc = librosa.frames_to_time(np.arange(len(vocal_c)), sr=SR, hop_length=hop)


def band(X, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return np.sqrt((X[m] ** 2).mean(0))


def finish(x, t):
    x = np.interp(t_env, t, x)
    # one-pole smoothing: 10 ms attack, 90 ms release
    a_att, a_rel = np.exp(-1 / (0.010 * FPS)), np.exp(-1 / (0.090 * FPS))
    out = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        a = a_att if v > s else a_rel
        s = a * s + (1 - a) * v
        out[i] = s
    p = np.percentile(out, 99) or 1.0
    return [round(float(v), 3) for v in np.clip(out / p, 0, 1)]


env = {
    'rms': finish(np.sqrt((Sx ** 2).mean(0)), t_stft),
    'low': finish(band(Sx, 0, 150), t_stft),
    'mid': finish(band(Sx, 150, 2000), t_stft),
    'high': finish(band(Sx, 4000, SR / 2), t_stft),
    'drums': finish(np.sqrt((P ** 2).mean(0)), t_stft),
    'bass': finish(band(H, 0, 150), t_stft),
    'vocal': finish(vocal_c, t_voc),
    'other': finish(band(H, 150, 4000), t_stft),
}

# ---------------------------------------------------------------- onsets [time, strength]


def onsets_of(x, t, min_gap, pct):
    d = np.maximum(0, np.diff(x, prepend=x[0]))
    d = d / (np.percentile(d, 99.5) or 1)
    pk, _ = ss.find_peaks(d, distance=max(1, int(min_gap * FPS)), height=np.percentile(d, pct))
    return [[round(float(t[i]), 3), round(float(min(1, d[i])), 3)] for i in pk]


kick = onsets_of(band(P, 30, 120), t_stft, 0.18, 97)
snare = onsets_of(band(P, 1500, 5000), t_stft, 0.18, 97)
hat_all = onsets_of(band(P, 7000, SR / 2), t_stft, 0.08, 95)
near = lambda ts, L, w: any(abs(ts - o[0]) < w for o in L)
hat = [h for h in hat_all if not near(h[0], snare, 0.04) and not near(h[0], kick, 0.03)]
vocal_on = onsets_of(vocal_c, t_voc, 0.09, 90)

bpm = 60 / float(np.median(np.diff(beats)))
out = {
    'duration': round(dur, 3),
    'bpm': round(bpm, 3),
    'beat_period': round(60 / bpm, 5),
    'time_signature': 4,
    'beats': [round(float(b), 3) for b in beats],
    'downbeats': [round(float(b), 3) for b in downbeats],
    'sections': sections,
    'fps': FPS,
    **env,
    'onsets': {'kick': kick, 'snare': snare, 'hat': hat, 'vocal': vocal_on},
    'notes': (f'librosa analysis of {path}. Tempo drifts (median {bpm:.2f} BPM); beats from DP tracking, '
              f'locally smoothed (+-6 beats). Downbeat phase from harmonic change (beat index {phase} mod 4). '
              'Sections are unlabelled novelty boundaries snapped to downbeats until lyrics are aligned. '
              'Envelopes: 100 fps, one-pole 10/90 ms, each /99th percentile. Stems approximated '
              '(HPSS for drums/bass, REPET-SIM foreground for vocal).'),
}
json.dump(out, open('data/audio.json', 'w'))
print(f'duration {dur:.1f}s, {len(beats)} beats, median {bpm:.2f} BPM, downbeat phase {phase}, '
      f'{len(downbeats)} bars, {len(sections)} sections, kicks {len(kick)} snares {len(snare)} hats {len(hat)} vocal {len(vocal_on)}')
for s in sections:
    print(f"  {s['name']}: {s['start']:.1f}-{s['end']:.1f}")
