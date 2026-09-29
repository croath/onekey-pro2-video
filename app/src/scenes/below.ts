// `below` (verse 1, lines 5–6) — docs/TREATMENT.md:
//   "Quiet by design, no edges to show": the front, screen off; a white hairline traces the outline
//     — the first appearance of the BOUNDARY motif — and a `boundary` callout lands on "edges".
//   "Everything that matters stays down below": hard cut to bone blueprint paper; the camera sinks
//     through the device one layer per bar (cover glass, display, mainboard, shield) down to one small
//     cell, the secure element, where the green key sits: `private key · never leaves`.
//   The key stays at frame centre for the hand-off to `airgap`.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog } from '../engine/util';
import { DEVICE, devicePath, devicePerimeter, keyHead2D, lyricLine } from './_motifs';

const CX = W / 2, CY = H * 0.44;
const DW = 400; // device width in px at scale 1 (same on paper as on the black front)

/** The layers the camera sinks through, at depth z (the outline at z=1 is the device itself). */
const LAYERS = [
  { z: 1, name: '01  cover glass', kind: 'glass' },
  { z: 2, name: '02  display', kind: 'display' },
  { z: 3, name: '03  mainboard', kind: 'board' },
  { z: 4, name: '04  shield', kind: 'shield' },
] as const;
const SE_Z = 5; // the secure element's cell
const SE_W = 0.34; // its size in device widths

export default class Below extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['Quiet by design', 'Everything that matters'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const cB = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const c = this.text.ctx;

    if (f.t < cB) {
      // ---------------------------------------------------------------- the front, screen off
      this.text.clear(rgba('ink'));
      const dev = devicePath(CX, CY, DW);
      const h = DW * DEVICE.h;
      // black glass: a faint vertical sheen and one soft diagonal reflection that drifts with time
      const g = c.createLinearGradient(CX - DW / 2, CY - h / 2, CX + DW / 2, CY + h / 2);
      const s = 0.3 + 0.1 * prog(f.t, this.ctx.start, cB);
      g.addColorStop(0, rgba('ink2', 1));
      g.addColorStop(clamp(s - 0.08), rgba('ink2', 1));
      g.addColorStop(s, 'rgba(38,42,39,1)');
      g.addColorStop(clamp(s + 0.1), rgba('ink2', 1));
      g.addColorStop(1, 'rgba(12,13,12,1)');
      c.fillStyle = g;
      c.fill(dev);
      // the frame, barely there
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(60,64,61,1)';
      c.stroke(dev);

      // the boundary: a white hairline traces the outline from "Quiet" to "show"
      const w0 = l1.words[0]!, wEnd = l1.words[l1.words.length - 1]!;
      const k = prog(f.t, w0.start, wEnd.end, ease.inOutCubic);
      if (k > 0) {
        const P = devicePerimeter(DW);
        c.save();
        c.setLineDash([P * k, P * 2]);
        c.lineWidth = 1.6;
        c.strokeStyle = rgba('bone', 0.95);
        c.stroke(dev);
        c.restore();
      }
      // callout on "edges"
      const edges = l1.words.find((w) => w.w.startsWith('edges'))!;
      const kc = prog(f.t, edges.start - 0.05, edges.start + 0.4, ease.outExpo);
      if (kc > 0) {
        const ax = CX + DW / 2, ay = CY - h * 0.18, bx = ax + lerp(0, 150, kc);
        c.strokeStyle = rgba('bone', 0.8);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(ax + 8, ay); c.lineTo(bx, ay); c.stroke();
        c.fillStyle = rgba('bone', 0.9 * kc);
        c.beginPath(); c.arc(ax, ay, 3, 0, Math.PI * 2); c.fill();
        c.font = font(F.mono(400), 22);
        c.fillText('boundary', bx + 14, ay + 7);
      }
      // the key, idling inside
      keyHead2D(c, CX, CY, 0.55, 0.55 + 0.35 * f.a.kick);

      lyricLine(c, l1, f.t, 120, H - 110, { family: F.archivo(100, 800), size: 72, on: rgba('bone'), off: rgba('bone', 0.3) });
      comp.draw(renderer, this.text.upload(), out);
      return { bloom: 0.45, vignette: 0.4 };
    }

    // ---------------------------------------------------------------- blueprint: sinking through the layers
    this.text.clear(rgba('bone'));
    const b = f.bar - audio.barAt(cB);
    // one layer per bar, each step landing just after the downbeat; the last step settles on the cell
    const steps = [1, 1, 1, 1.5];
    let d = 0;
    steps.forEach((inc, i) => (d += inc * prog(b, i + 0.8 - 0.35, i + 0.8 + 0.3, ease.inOutCubic)));
    
    // paper grid
    c.strokeStyle = rgba('ash', 0.18);
    c.lineWidth = 1;
    const gs = 48;
    c.beginPath();
    for (let x = (CX % gs); x < W; x += gs) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = (CY % gs); y < H; y += gs) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();

    const ink = (a: number) => rgba('ink', a);
    // far to near so near layers draw on top
    for (let i = LAYERS.length - 1; i >= 0; i--) {
      const Ly = LAYERS[i]!;
      const dz = Ly.z - d;
      if (dz <= 0.08) continue;
      const s = 1 / dz;
      const a = clamp((4.5 - s) / 2.5) * clamp(s * 3); // fade as it rushes past, and in the far distance
      if (a <= 0.01) continue;
      const w = DW * s;
      const p = devicePath(CX, CY, w);
      const hh = w * DEVICE.h;
      c.save();
      c.globalAlpha = a;
      c.lineWidth = 1.5;
      c.strokeStyle = ink(0.9);
      c.stroke(p);
      c.clip(p);
      c.lineWidth = 1;
      if (Ly.kind === 'display') {
        c.strokeStyle = ink(0.16);
        const st = 16 * s;
        c.beginPath();
        for (let x = CX - w / 2; x < CX + w / 2; x += st) { c.moveTo(x, CY - hh / 2); c.lineTo(x, CY + hh / 2); }
        for (let y = CY - hh / 2; y < CY + hh / 2; y += st) { c.moveTo(CX - w / 2, y); c.lineTo(CX + w / 2, y); }
        c.stroke();
      } else if (Ly.kind === 'board') {
        // orthogonal traces, deterministic
        c.strokeStyle = ink(0.55);
        for (let n = 0; n < 42; n++) {
          let x = CX + (hash(n, 3) - 0.5) * w * 0.9, y = CY + (hash(n, 4) - 0.5) * hh * 0.9;
          c.beginPath(); c.moveTo(x, y);
          for (let k = 0; k < 3; k++) {
            if ((n + k) % 2) x += (hash(n, k, 5) - 0.5) * w * 0.5; else y += (hash(n, k, 6) - 0.5) * hh * 0.4;
            c.lineTo(x, y);
          }
          c.stroke();
          c.fillStyle = ink(0.7);
          c.beginPath(); c.arc(x, y, 2.2 * Math.sqrt(s), 0, Math.PI * 2); c.fill();
        }
        // a few chips
        for (let n = 0; n < 5; n++) {
          const cw = w * (0.12 + 0.1 * hash(n, 7)), ch = cw * (0.6 + 0.5 * hash(n, 8));
          const x = CX + (hash(n, 9) - 0.5) * w * 0.6, y = CY + (hash(n, 10) - 0.5) * hh * 0.7;
          c.fillStyle = rgba('bone');
          c.fillRect(x - cw / 2, y - ch / 2, cw, ch);
          c.strokeStyle = ink(0.8);
          c.strokeRect(x - cw / 2, y - ch / 2, cw, ch);
        }
      } else if (Ly.kind === 'shield') {
        c.strokeStyle = ink(0.22);
        const st = 22 * s;
        c.beginPath();
        for (let x = -hh; x < w + hh; x += st) { c.moveTo(CX - w / 2 + x, CY - hh / 2); c.lineTo(CX - w / 2 + x - hh, CY + hh / 2); }
        c.stroke();
        // the window in the shield the camera falls through
        const sw = w * SE_W * 1.5;
        c.fillStyle = rgba('bone');
        c.fillRect(CX - sw / 2, CY - sw / 2, sw, sw);
        c.strokeStyle = ink(0.8);
        c.strokeRect(CX - sw / 2, CY - sw / 2, sw, sw);
      }
      c.restore();
      // layer label, outside the clip, at the top-left corner
      c.globalAlpha = a * clamp((s - 0.55) / 0.2); // only the layers near us are labelled
      c.fillStyle = ink(0.85);
      c.font = font(F.mono(400), 20);
      c.fillText(Ly.name, CX - w / 2, CY - hh / 2 - 14);
      c.globalAlpha = 1;
    }

    // the secure element cell with the key inside
    {
      const dz = SE_Z - d, s = 1 / Math.max(dz, 0.3);
      const a = clamp(s * 3);
      const w = DW * SE_W * s;
      c.globalAlpha = a;
      c.fillStyle = rgba('bone');
      c.fillRect(CX - w / 2, CY - w / 2, w, w);
      c.lineWidth = 1.5;
      c.strokeStyle = ink(0.95);
      c.strokeRect(CX - w / 2, CY - w / 2, w, w);
      // pins
      c.lineWidth = 1;
      const np = 7;
      c.beginPath();
      for (let i = 0; i < np; i++) {
        const u = -w / 2 + (w * (i + 0.5)) / np, L = w * 0.08;
        c.moveTo(CX + u, CY - w / 2); c.lineTo(CX + u, CY - w / 2 - L);
        c.moveTo(CX + u, CY + w / 2); c.lineTo(CX + u, CY + w / 2 + L);
        c.moveTo(CX - w / 2, CY + u); c.lineTo(CX - w / 2 - L, CY + u);
        c.moveTo(CX + w / 2, CY + u); c.lineTo(CX + w / 2 + L, CY + u);
      }
      c.stroke();
      c.fillStyle = ink(0.8);
      c.font = font(F.mono(500), Math.max(10, 0.11 * w));
      c.fillText('SE', CX - w / 2 + 0.07 * w, CY - w / 2 + 0.17 * w);
      c.globalAlpha = 1;
      // the key: green only here, inside the cell
      const kk = 0.7 + 0.3 * f.a.kick;
      keyHead2D(c, CX, CY, lerp(0.6, 2.2, clamp(s / 2)), kk * a);
      keyHead2D(c, CX, CY, lerp(0.25, 0.8, clamp(s / 2)), kk * a);
      // callout once the cell has arrived
      const kc = prog(b, 3.95, 4.3, ease.outExpo);
      if (kc > 0) {
        const ax = CX + w / 2 + w * 0.1, ay = CY - w * 0.3, bx = ax + 170 * kc;
        c.strokeStyle = ink(0.85);
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, ay); c.stroke();
        c.fillStyle = ink(0.9 * kc);
        c.font = font(F.mono(500), 24);
        c.fillText('private key · never leaves', bx + 14, ay + 8);
      }
    }

    lyricLine(c, l2, f.t, 120, H - 110, { family: F.archivo(100, 800), size: 72, on: rgba('ink'), off: rgba('ink', 0.28) });
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.12, vignette: 0.18, halation: 0 };
  }
}
