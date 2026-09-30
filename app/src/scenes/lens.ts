// `lens` (verse 2, lines 3–4) — docs/TREATMENT.md, the real device on ink:
//   "A camera on the back that only reads light": a macro on the rear camera's metal ring; hairline
//     rays stream into the lens and only in (`light in · nothing out`); the camera pulls back over the
//     frosted back as a light bar crosses it on "light".
//   "QR in, QR out, and nothing online": the device turns to its screen. The screen's own headings are
//     the sung words: "QR in" over a viewfinder scanning a code, "QR out" over the signed code it
//     shows, and on "nothing online" the status line reads `offline · no radios`.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import { DEVICE, lyricLine, qrMatrix } from './_motifs';
import { Device3D, SCREEN, orbit, type DevicePose, type V3 } from './_device3d';

const bone = (a = 1) => rgba('bone', a);
const QA = qrMatrix(21), QB = qrMatrix(33);
const TH = DEVICE.t / 2;
/** The rear camera in device space (on the back, seen from behind at top-left). */
const LENS: V3 = [-DEVICE.cam.x, DEVICE.cam.y, -TH];

function qr(c: CanvasRenderingContext2D, m: boolean[][], cx: number, cy: number, size: number, col: string, shown = 1) {
  const n = m.length, cell = size / n;
  c.fillStyle = col;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!m[y]![x] || hash(x, y, 5) > shown) continue;
    c.fillRect(cx - size / 2 + x * cell, cy - size / 2 + y * cell, cell + 0.3, cell + 0.3);
  }
}

export default class Lens extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['A camera on the back', 'QR in, QR out'].map((q) => this.ctx.lyrics.get(q));
  }

  /** The device's screen for line 2: its headings are the sung words. */
  screen(t: number, l2: Line) {
    const c = this.dev.screen.ctx;
    const sw = SCREEN.w, sh = SCREEN.h;
    const wd = (q: string, nth = 0) => l2.words.filter((w) => w.w.toLowerCase().startsWith(q))[nth]!;
    const qrIn = wd('qr', 0), qrOut = wd('qr', 1), nothing = wd('nothing');
    this.dev.screen.clear(rgba('ink'));
    // status line
    c.font = font(F.mono(500), 26);
    const off = prog(t, nothing.start - 0.05, nothing.start + 0.2);
    c.fillStyle = off > 0 ? rgba('signal', 0.4 + 0.6 * off) : bone(0.45);
    c.fillText(off > 0 ? 'offline · no radios' : 'air-gapped', 40, 62);
    const outMode = t >= qrOut.start - 0.05;
    const head = outMode ? 'QR out' : 'QR in';
    c.font = font(F.archivo(100, 800), 92);
    c.fillStyle = bone();
    c.fillText(head, 40, 190);
    const cx = sw / 2, cy = sh * 0.56, S = sw * 0.72;
    if (!outMode) {
      // viewfinder: corner brackets, the code arriving, a scan line
      c.strokeStyle = bone(0.9);
      c.lineWidth = 6;
      const h = S / 2 + 24, L = 60;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        c.beginPath();
        c.moveTo(cx + sx * h, cy + sy * (h - L)); c.lineTo(cx + sx * h, cy + sy * h); c.lineTo(cx + sx * (h - L), cy + sy * h);
        c.stroke();
      }
      const k = prog(t, qrIn.start - 0.4, qrIn.start + 0.3, ease.outCubic);
      c.globalAlpha = 0.85;
      qr(c, QA, cx, cy, S * 0.86, bone(0.85), k);
      c.globalAlpha = 1;
      const sy = cy - S / 2 + S * ((t * 1.4) % 1);
      c.fillStyle = rgba('signal', 0.9);
      c.fillRect(cx - S / 2, sy, S, 4);
    } else {
      // the signed code, on a white card
      const k = prog(t, qrOut.start - 0.05, qrOut.start + 0.25, ease.outExpo);
      c.globalAlpha = k;
      c.fillStyle = bone(0.78);
      c.beginPath(); c.roundRect(cx - S / 2 - 24, cy - S / 2 - 24, S + 48, S + 48, 24); c.fill();
      qr(c, QB, cx, cy, S, rgba('ink'), 1);
      c.globalAlpha = 1;
      c.font = font(F.mono(500), 28);
      c.fillStyle = bone(0.7 * k);
      c.fillText('signed · scan to broadcast', 40, cy + S / 2 + 90);
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const light = wd(l1, 'light');

    // ---- camera
    let pose: DevicePose;
    const back: V3 = [Math.PI, 0.06, 0];
    if (t < c2) {
      // from a macro on the lens, pulling back over the frosted glass
      const k = prog(t, this.ctx.start, c2, ease.inOutCubic);
      const p0: DevicePose = { cam: [0, 0, 1], tgt: [0, 0, 0], fov: 0.5, rot: back };
      const lw = this.dev.toWorld(p0, LENS);
      const tgt: V3 = [lerp(lw[0], 0.25, k), lerp(lw[1], 0.1, k), lerp(lw[2], 0, k)];
      pose = {
        cam: orbit(tgt, lerp(0.42, 3.9, k * k), lerp(0.28, -0.12, k), lerp(0.18, 0.05, k)), tgt, fov: 0.5, rot: back,
        sweep: lerp(1.5, -1.5, prog(t, wd(l1, 'reads').start, light.end + 0.3, ease.inOutCubic)),
      };
    } else {
      // it turns to its screen
      const turn = prog(t, c2 - 0.05, c2 + 0.9, ease.inOutCubic);
      const k = prog(t, c2, this.ctx.end);
      const tgt: V3 = [lerp(0.25, 0.75, turn), lerp(0.02, -0.08, turn), 0];
      pose = {
        cam: orbit(tgt, lerp(3.9, 4.3, turn) - 0.25 * k, lerp(-0.12, 0.05, k), 0.05), tgt, fov: 0.5,
        rot: [lerp(Math.PI, 0.2, turn), lerp(0.06, 0, turn), 0], screen: turn,
        sweep: lerp(-1.5, 1.5, turn),
      };
      this.screen(t, l2);
    }

    this.bg.clear(rgba('ink'));
    const b = this.bg.ctx;
    const g = b.createRadialGradient(W * 0.6, H / 2, 0, W * 0.6, H / 2, H * 0.8);
    g.addColorStop(0, 'rgba(24,27,25,1)');
    g.addColorStop(1, rgba('ink'));
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    comp.draw(renderer, this.dev.render(renderer, pose, t >= c2), out);

    const c = this.text.ctx;
    this.text.clear();
    if (t < c2) {
      // rays: hairline dashes streaming into the lens from off frame, in only
      const lc = this.dev.project(pose, LENS);
      const rim = this.dev.project(pose, [LENS[0] + DEVICE.cam.r, LENS[1], LENS[2]]);
      const R = Math.max(8, Math.hypot(rim.x - lc.x, rim.y - lc.y));
      const kr = prog(t, this.ctx.start, this.ctx.start + 0.4) * (1 - prog(t, lerp(this.ctx.start, c2, 0.45), lerp(this.ctx.start, c2, 0.7)));
      const n = 28;
      c.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + hash(i, 2) * 0.2;
        const far = Math.hypot(W, H);
        const x0 = lc.x + Math.cos(a) * far, y0 = lc.y + Math.sin(a) * far;
        const x1 = lc.x + Math.cos(a) * R * 1.02, y1 = lc.y + Math.sin(a) * R * 1.02;
        // dashes travel inwards
        const ph = ((t * 1.6 + hash(i, 3)) % 1);
        c.strokeStyle = bone(0.5 * kr);
        c.setLineDash([26, 60]);
        c.lineDashOffset = -ph * 86;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      }
      c.setLineDash([]);
      const only = wd(l1, 'only');
      const kl = prog(t, only.start - 0.05, only.start + 0.3, ease.outExpo) * kr;
      if (kl > 0) {
        c.font = font(F.mono(500), 28);
        c.fillStyle = bone(kl);
        c.fillText('light in · nothing out', lc.x + R + 44, lc.y + 6);
      }
      lyricLine(c, l1, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: bone(), off: bone(0.3) });
    } else {
      // the rest of line 2 lives on the screen; a small running caption keeps it readable
      const a = prog(t, c2 + 0.3, c2 + 0.8);
      lyricLine(c, l2, t, W * 0.44, H * 0.53, { family: F.archivo(100, 800), size: 54, on: bone(), off: bone(0.25), alpha: a });
    }
    void clamp;
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.4 };
  }
}
