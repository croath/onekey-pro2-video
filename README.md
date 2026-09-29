# OneKey Pro 2 — intro video

A code-rendered product video for OneKey Pro 2. The renderer is adapted from [croath/pdoom-video](https://github.com/croath/pdoom-video) (MIT): every frame is a deterministic function of time, so the live preview and the 1080p60 / 4K60 export are identical.

Status: scaffold. The engine works end to end with placeholder data and one starter scene; the concept and plates are being written in [`docs/TREATMENT.md`](docs/TREATMENT.md).

## Layout

- `audio/track.wav` — soundtrack (placeholder: 60 s, 120 BPM click).
- `data/audio.json` — beats, downbeats, sections, onsets, loudness envelopes (placeholder, synthetic).
- `data/lyrics.json` — captions / voice-over, word-timed (placeholder copy).
- `app/src/engine/` — renderer core (post, typography, GPU lines, timing). See [`docs/ENGINE.md`](docs/ENGINE.md).
- `app/src/scenes/` — one module per plate. `app/src/timeline.ts` — the edit.
- `app/scripts/render.ts` — offline renderer (headless Chrome → ffmpeg).
- `out/` — renders (not committed).

## Preview

```sh
cd app
bun install
bunx vite
```

Open http://localhost:5173 (space play/pause, ←/→ seek, `[`/`]` previous/next scene, `h` hide UI). `?t=10` starts at 10 s.

## Render

```sh
cd app
bun scripts/render.ts stills --t 2.8,9.5 --out ../out/wip/title    # check frames
bun scripts/render.ts video --samples auto --shutter 0.2 --out ../out/onekey-pro2.mp4
```

Needs bun, Google Chrome (or `CHROME_PATH=/path/to/chromium`) and ffmpeg with libx264.

## License

Code: MIT (see [LICENSE](LICENSE)). Fonts in `app/public/fonts/` keep their own licenses (SIL OFL; Hershey/EMS stroke fonts OFL / public domain).
