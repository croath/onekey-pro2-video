"""QA: vocal-stem spectrogram with the aligned word starts (green) and Whisper's (cyan, dashed).

Used to check data/lyrics.json by eye and to pick manual @line starts in analysis/sung_lyrics.txt.
Run:  analysis/.venv/bin/python analysis/qa_plot.py t0 t1   -> analysis/qa/spec_<t0>.png
"""
import glob
import json
import sys

import librosa
import librosa.display
import matplotlib
import numpy as np

matplotlib.use('Agg')
import matplotlib.pyplot as plt

t0, t1 = float(sys.argv[1]), float(sys.argv[2])
y, sr = librosa.load('analysis/stems/htdemucs_ft/track/vocals.wav', sr=16000, offset=t0, duration=t1 - t0)
S = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_fft=1024, hop_length=160, n_mels=96, fmax=3000),
                        ref=np.max)
fig, ax = plt.subplots(figsize=(24, 6))
librosa.display.specshow(S, sr=sr, hop_length=160, x_axis='time', y_axis='mel', fmax=3000, ax=ax, cmap='magma')
wh = []
for f in sorted(glob.glob('analysis/work/whisper*.json')):
    for s in json.load(open(f)):
        wh += s['words']
for w in wh:
    if t0 < w['start'] < t1:
        ax.axvline(w['start'] - t0, color='cyan', lw=1, ls='--')
        ax.text(w['start'] - t0, 2900, w['w'], color='cyan', fontsize=8, rotation=90, va='top')
for l in json.load(open('data/lyrics.json'))['lines']:
    for w in l['words']:
        if t0 < w['start'] < t1:
            ax.axvline(w['start'] - t0, color='lime', lw=1.2)
            ax.text(w['start'] - t0, 150, w['w'], color='lime', fontsize=9, rotation=90)
ticks = np.arange(0, t1 - t0, 0.5)
ax.set_xticks(ticks)
ax.set_xticklabels([f'{t0 + x:.1f}' for x in ticks], fontsize=7)
plt.tight_layout()
plt.savefig(f'analysis/qa/spec_{int(t0)}.png', dpi=80)
