# OneKey Pro 2 intro video

Code-rendered product video (TypeScript + three.js, bun + Vite). The engine comes from croath/pdoom-video; every frame is a pure function of time, so the browser preview and the offline export match.

Read before any work:
- `docs/TREATMENT.md` — the concept, style rules and per-plate brief. It is the spec: follow it, and when a decision changes, update it (add a line under 修订记录).
- `docs/ENGINE.md` — the engine and scene API and the rules for scene authors.
- `docs/SONG.md` — the soundtrack: lyrics, Suno prompt, song structure.

NDA: `assets/reference/` holds photos of an unreleased device. Use them only as modelling reference; never render, embed, upload or publish them, and never make this repository public.

Workflow:
- One scene per file in `app/src/scenes/`; the edit lives in `app/src/timeline.ts`. Anchor times to caption lines and the beat grid, never hard-coded seconds.
- Check your work by rendering stills and LOOKING at them: `cd app && bun scripts/render.ts stills --t 2.8,9.5 --only <id> --out ../out/wip/<id>`, then Read the PNGs. In a cloud container prefix with `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Typecheck: `cd app && bunx tsc --noEmit -p tsconfig.json`.
- The soundtrack is the 2:22.8 edit: `audio/track.wav`, `data/lyrics.json` (word timings), `data/audio.json` (beats, sections, onsets, envelopes), all produced by `analysis/cut_track.py` from the full take in `audio/full/` + `data/full/`. Re-run it after changing the cut or the full-take analysis; never hand-edit `data/*.json`.
