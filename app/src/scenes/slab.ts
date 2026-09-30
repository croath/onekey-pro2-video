// `slab` (verse 1, lines 1–4) — docs/TREATMENT.md: the device's first full appearance, rendered
// procedurally (raymarched SDF) from the proportions in _motifs DEVICE; one shot per lyric line:
//   1 "Glass on the front and glass on the back": front three-quarter, a highlight sweeps the
//     black glass; on "back" the slab flips 180° about its long axis.
//   2 "A ribbon of metal, graphite and black": macro along the metal frame; antenna breaks pass.
//   3 "Thin as a card, it slips out of sight": straight on the back, a bank card's outline slides over
//     it (the same footprint); after "card" the slab turns side-on, a thin bar (6.2 mm); on "out" it slides away.
//   4 "One little key mark catching the light": the back, head-on; a light sweeps the frosted
//     glass and the "1O" mark glints green on "light".
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { DEVICE } from './_motifs';
import { Device3D, type DevicePose } from './_device3d';

/** Shot 3 (the card comparison) camera: straight on, long lens; px per device unit at the slab. */
const SIDE = { cy: -0.25, dist: 11.5, fov: 0.22 };
const SIDE_PPU = H / 2 / Math.tan(SIDE.fov / 2) / SIDE.dist;
/** ISO/IEC 7810 ID-1 card in device units (device width 53.1 mm). */
const CARD = { w: 53.98 / 53.1, h: 85.6 / 53.1, r: 3.18 / 53.1 };

type Shot = { cam: [number, number, number]; tgt: [number, number, number]; fov: number; theta: number; slideX: number; sweep: number; glint: number };

export default class Slab extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    const ly = this.ctx.lyrics;
    this.L = ['Glass on the front', 'A ribbon of metal', 'Thin as a card', 'One little key mark'].map((q) => ly.get(q));
  }

  /** Start of shot i: the beat at/before its line's first word (the timeline's cut rule). */
  cutAt(i: number) {
    const au = this.ctx.audio;
    if (i === 0) return this.ctx.start;
    return au.timeOfBeat(Math.floor(au.beatAt(this.L[i]!.words[0]!.start + 0.02)));
  }

  shot(t: number): { i: number; s: Shot } {
    const [l1, l2, l3, l4] = this.L as [Line, Line, Line, Line];
    const c1 = this.cutAt(1), c2 = this.cutAt(2), c3 = this.cutAt(3);
    const word = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    if (t < c1) {
      const back = word(l1, 'back').start;
      const k = prog(t, this.ctx.start, c1);
      const flip = prog(t, back - 0.05, back + 0.55, ease.outExpo);
      const yaw = lerp(0.42, 0.3, k), dist = lerp(4.6, 4.2, k);
      return { i: 0, s: {
        cam: [Math.sin(yaw) * dist, 0.45, Math.cos(yaw) * dist], tgt: [0, -0.22, 0], fov: 0.62,
        theta: flip * Math.PI, slideX: 0,
        // the highlight crosses the glass while "Glass on the front" is sung
        sweep: lerp(-1.6, 1.6, prog(t, l1.words[0]!.start, word(l1, 'front').end, ease.inOutCubic)), glint: 0,
      } };
    }
    if (t < c2) {
      // macro along the right edge (seen from behind after the flip), travelling up the frame
      const k = prog(t, c1, c2, ease.inOutQuad);
      const y = lerp(-0.55, 0.45, k);
      return { i: 1, s: {
        cam: [-0.78, y - 0.42, 0.3], tgt: [-0.5, y + 0.2, 0.0], fov: 0.55,
        theta: Math.PI, slideX: 0, sweep: lerp(-1.2, 1.2, k), glint: 0,
      } };
    }
    if (t < c3) {
      // straight on the back, long lens: a bank card's outline slides over it (same footprint); on
      // "it" the slab turns side-on and reads as a thin bar (6.2 mm); it slides out of frame on "out"
      const out = word(l3, 'out').start;
      const turn = Math.min(word(l3, 'it').start, word(l3, 'card').start + 0.75);
      const sx = lerp(0, -3.2, prog(t, out - 0.05, word(l3, 'sight').end + 0.1, ease.inCubic));
      return { i: 2, s: {
        cam: [0, SIDE.cy, SIDE.dist], tgt: [0, SIDE.cy, 0], fov: SIDE.fov,
        theta: lerp(Math.PI, Math.PI * 0.5, prog(t, turn - 0.12, turn + 0.45, ease.inOutCubic)), slideX: sx, sweep: -2, glint: 0,
      } };
    }
    // the back, head-on and slightly high; the light sweeps across on "catching the light"
    const light = word(l4, 'light');
    const k = prog(t, c3, this.ctx.end);
    return { i: 3, s: {
      cam: [0.12, lerp(0.45, 0.3, k), lerp(4.4, 4.0, k)], tgt: [0, -0.2, 0], fov: 0.62,
      theta: Math.PI, slideX: 0,
      sweep: lerp(1.8, -1.8, prog(t, word(l4, 'catching').start, light.end + 0.2, ease.inOutCubic)),
      glint: Math.exp(-Math.max(0, t - light.start) / 0.6) * (t >= light.start ? 1 : prog(t, light.start - 0.12, light.start)),
    } };
  }

  /** Shot 3 overlay: the bank card's outline over the slab, then the 6.2 mm dimension once side-on. */
  cardOverlay(c: CanvasRenderingContext2D, t: number) {
    const l3 = this.L[2]!;
    const word = (q: string) => l3.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const card = word('card'), turn = Math.min(word('it').start, card.start + 0.75), out = word('out').start;
    const cx = W / 2, cy = H / 2 - (0 - SIDE.cy) * SIDE_PPU; // the slab's centre on screen
    const ww = CARD.w * SIDE_PPU, hh = CARD.h * SIDE_PPU;
    c.font = font(F.mono(400), 22);
    // the card slides in from the left and settles over the slab, then fades as the slab turns
    const kIn = prog(t, card.start - 0.15, card.start + 0.45, ease.outExpo);
    const kOut = 1 - prog(t, turn - 0.1, turn + 0.25);
    const a = kIn * kOut;
    if (a > 0) {
      const x = lerp(cx - W * 0.4, cx, kIn);
      c.globalAlpha = a;
      c.strokeStyle = rgba('bone', 0.9);
      c.lineWidth = 1.5;
      c.setLineDash([10, 7]);
      c.beginPath();
      c.roundRect(x - ww / 2, cy - hh / 2, ww, hh, CARD.r * SIDE_PPU);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = rgba('bone', 0.85);
      c.fillText('bank card   85.6 × 54.0 mm', x + ww / 2 + 28, cy - hh / 2 + 18);
      c.fillStyle = rgba('bone', 0.55);
      c.fillText('OneKey Pro 2   84.9 × 53.1 mm', x + ww / 2 + 28, cy - hh / 2 + 50);
      c.globalAlpha = 1;
    }
    // side-on: the thickness, as a dimension line above the bar
    const kD = prog(t, turn + 0.3, turn + 0.55, ease.outCubic) * (1 - prog(t, out + 0.05, out + 0.25));
    if (kD > 0) {
      const half = (DEVICE.t / 2) * SIDE_PPU, y = cy - (DEVICE.h / 2) * SIDE_PPU - 34;
      c.globalAlpha = kD;
      c.strokeStyle = rgba('bone', 0.9);
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(cx - half, y - 10); c.lineTo(cx - half, y + 10);
      c.moveTo(cx + half, y - 10); c.lineTo(cx + half, y + 10);
      c.moveTo(cx - half - 40, y); c.lineTo(cx - half, y);
      c.moveTo(cx + half + 40, y); c.lineTo(cx + half, y);
      c.stroke();
      c.fillStyle = rgba('bone', 0.95);
      c.fillText('6.2 mm', cx + half + 52, y + 7);
      c.globalAlpha = 1;
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const { i, s } = this.shot(f.t);
    // ink with a faint pool of light behind the device
    const b = this.bg.ctx;
    this.bg.clear(rgba('ink'));
    const g = b.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.9);
    g.addColorStop(0, 'rgba(26,29,27,1)');
    g.addColorStop(1, rgba('ink'));
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    const pose: DevicePose = {
      cam: s.cam, tgt: s.tgt, fov: s.fov, rot: [s.theta, 0, 0], pos: [s.slideX, 0, 0],
      sweep: s.sweep, glint: s.glint, gain: i === 1 ? 0.55 : 1, // the macro sits right under the softbox
    };
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    // ---- lyric: one line per shot, set in Archivo, sung words in bone, the rest dim
    const c = this.text.ctx;
    this.text.clear();
    const line = this.L[i]!;
    const fam = F.archivo(100, 800);
    const size = 78;
    const lay = layout(line.text, fam, size);
    const x0 = 120, y0 = H - 150;
    c.font = font(fam, size);
    let ci = 0;
    for (const w of line.words) {
      const k = Lyrics.wordProgress(w, f.t);
      const early = prog(f.t, w.start - 0.4, w.start);
      const i0 = line.text.indexOf(w.w, ci);
      ci = i0 + w.w.length;
      const g = lay.glyphs[i0];
      if (!g) continue;
      c.fillStyle = rgba('bone', k > 0 ? 1 : 0.18 + 0.17 * early);
      c.fillText(w.w, x0 + g.x, y0 - (1 - ease.outExpo(clamp(k * 4))) * 10 * (k > 0 ? 1 : 0));
    }
    if (i === 2) this.cardOverlay(c, f.t);
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.4 };
  }
}
