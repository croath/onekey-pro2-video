// `lens` (verse 2, lines 3–4) — docs/TREATMENT.md, ink ground, optical-diagram style:
//   "A camera on the back that only reads light": the rear camera ring, big, as an aperture; rays
//     (hairlines) travel only inwards, `in only`.
//   "QR in, QR out, and nothing online": the device (left) and a phone's wireframe (right); a QR
//     crosses phone→device on the first "QR", device→phone on the second; on "nothing" a network
//     globe in the corner is labelled `offline` and never lights.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import { devicePath, keyHead2D, lyricLine, qrMatrix } from './_motifs';

const bone = (a = 1) => rgba('bone', a);
const QA = qrMatrix(21), QB = qrMatrix(33);

function qr(c: CanvasRenderingContext2D, m: boolean[][], cx: number, cy: number, size: number, col: string) {
  const n = m.length, cell = size / n;
  c.fillStyle = col;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y]![x]) c.fillRect(cx - size / 2 + x * cell, cy - size / 2 + y * cell, cell + 0.3, cell + 0.3);
}

export default class Lens extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['A camera on the back', 'QR in, QR out'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c = this.text.ctx;
    this.text.clear(rgba('ink'));
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string, nth = 0) => l.words.filter((w) => w.w.toLowerCase().startsWith(q))[nth]!;

    if (t < c2) {
      // ---- the aperture
      const cx = W * 0.36, cy = H * 0.43, R = 250;
      const open = prog(t, this.ctx.start, l1.words[1]!.start + 0.4, ease.outCubic);
      c.strokeStyle = bone(0.9);
      c.lineWidth = 1.5;
      for (const [r, a] of [[R, 0.95], [R * 0.86, 0.5], [R * 0.62, 0.9], [R * 0.5, 0.35]] as const) {
        c.globalAlpha = a;
        c.beginPath(); c.arc(cx, cy, r * lerp(0.6, 1, open), 0, TAU); c.stroke();
      }
      c.globalAlpha = 1;
      // aperture blades
      const ri = R * 0.5 * lerp(0.6, 1, open), ro = R * 0.62 * lerp(0.6, 1, open);
      c.strokeStyle = bone(0.45);
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + t * 0.2;
        c.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
        c.lineTo(cx + Math.cos(a + 0.9) * ro, cy + Math.sin(a + 0.9) * ro);
      }
      c.stroke();
      // rays, inwards only: dashes travelling from the right edge into the lens
      const only = wd(l1, 'only');
      const kr = prog(t, wd(l1, 'camera').start, only.start, ease.linear);
      const nr = 11;
      for (let i = 0; i < nr; i++) {
        const y0 = lerp(H * 0.12, H * 0.74, i / (nr - 1));
        const x0 = W + 20;
        const tx = cx + R * 0.1, ty = cy + (y0 - cy) * 0.05;
        const a = clamp(kr * 3 - i * 0.15);
        if (a <= 0) continue;
        c.strokeStyle = bone(0.55 * a);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(tx, ty); c.stroke();
        // photons: short bright dashes moving inwards
        for (let j = 0; j < 3; j++) {
          const u = ((t * 0.9 + hash(i, j) + j / 3) % 1);
          const px = lerp(x0, tx, u), py = lerp(y0, ty, u);
          const qx = lerp(x0, tx, Math.max(0, u - 0.03)), qy = lerp(y0, ty, Math.max(0, u - 0.03));
          c.strokeStyle = bone(0.95 * a);
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(qx, qy); c.lineTo(px, py); c.stroke();
        }
      }
      // `in only`
      const ki = prog(t, only.start - 0.05, only.start + 0.3, ease.outExpo);
      if (ki > 0) {
        c.globalAlpha = ki;
        c.font = font(F.mono(500), 28);
        c.fillStyle = bone();
        c.fillText('light in  →  nothing out', W * 0.62, H * 0.08 + 14);
        c.globalAlpha = 1;
      }
      // the lens core, dark, with the key's reflection
      c.fillStyle = rgba('ink2');
      c.beginPath(); c.arc(cx, cy, ri * 0.98, 0, TAU); c.fill();
      keyHead2D(c, cx, cy, 0.6, 0.7 + 0.3 * f.a.kick);
      c.font = font(F.mono(400), 20);
      c.fillStyle = bone(0.7);
      c.fillText('rear camera · QR only', cx - R, cy + R + 44);
      lyricLine(c, l1, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: bone(), off: bone(0.3) });
    } else {
      // ---- ping-pong
      const dx = W * 0.27, dy = H * 0.42, dw = 280;
      const px = W * 0.73, py = H * 0.42, pw = 260, ph = 520;
      c.strokeStyle = bone(0.95);
      c.lineWidth = 1.6;
      c.stroke(devicePath(dx, dy, dw));
      c.beginPath(); c.roundRect(px - pw / 2, py - ph / 2, pw, ph, 38); c.stroke();
      c.beginPath(); c.roundRect(px - 30, py - ph / 2 + 14, 60, 18, 9); c.stroke();
      keyHead2D(c, dx, dy - dw * 0.55, 0.5, 0.75 + 0.25 * f.a.kick);
      const q1 = wd(l2, 'qr', 0), q2 = wd(l2, 'qr', 1);
      const qs = 190;
      // QR in: phone -> device
      const k1 = prog(t, q1.start - 0.1, q1.start + 0.25, ease.inOutCubic);
      const k2 = prog(t, q2.start - 0.1, q2.start + 0.25, ease.inOutCubic);
      const arc = (k: number) => -Math.sin(k * Math.PI) * 80;
      if (t < q2.start - 0.1) {
        const x = lerp(px, dx, k1), y = lerp(py, dy, k1) + arc(k1);
        c.fillStyle = bone(); c.fillRect(x - qs / 2 - 10, y - qs / 2 - 10, qs + 20, qs + 20);
        qr(c, QA, x, y, qs, rgba('ink'));
      } else {
        // the device keeps a small copy of what it read; the signed QR travels out
        const x = lerp(dx, px, k2), y = lerp(dy, py, k2) + arc(k2);
        c.fillStyle = bone(); c.fillRect(x - qs / 2 - 10, y - qs / 2 - 10, qs + 20, qs + 20);
        qr(c, QB, x, y, qs, rgba('ink'));
      }
      c.font = font(F.mono(400), 24);
      c.fillStyle = bone(0.75);
      c.fillText('unsigned tx', px - pw / 2, py + ph / 2 + 38);
      c.fillText('signature', dx - dw / 2, dy + dw * 0.8 + 38 + 20);
      // offline globe, top right, never lit
      const nothing = wd(l2, 'nothing');
      const kg = prog(t, nothing.start - 0.05, nothing.start + 0.3, ease.outExpo);
      if (kg > 0) {
        const gx = W - 200, gy = 150, gr = 64;
        c.globalAlpha = kg;
        c.strokeStyle = rgba('graphite');
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(gx, gy, gr, 0, TAU); c.stroke();
        for (const e of [0.35, 0.7]) { c.beginPath(); c.ellipse(gx, gy, gr * e, gr, 0, 0, TAU); c.stroke(); }
        for (const yy of [-0.5, 0, 0.5]) { const w2 = Math.sqrt(1 - yy * yy) * gr; c.beginPath(); c.moveTo(gx - w2, gy + yy * gr); c.lineTo(gx + w2, gy + yy * gr); c.stroke(); }
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(gx - gr * 1.1, gy + gr * 1.1); c.lineTo(gx + gr * 1.1, gy - gr * 1.1); c.stroke();
        c.font = font(F.mono(500), 24);
        c.fillStyle = rgba('graphite');
        c.fillText('offline', gx - 44, gy + gr + 44);
        c.globalAlpha = 1;
      }
      lyricLine(c, l2, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: bone(), off: bone(0.3) });
    }

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.35, vignette: 0.35 };
  }
}
