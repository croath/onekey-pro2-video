// `airgap` (pre-chorus) — docs/TREATMENT.md, on bone blueprint paper:
//   "Scan it, sign it, send it": a phone (right) shows a QR that assembles on eighth notes; the device
//     (left) scans it (a scan line on "Scan"), signs (a signature written inside its screen on
//     "sign"), and sends (its own QR, and a hairline that leaves the device outline, on "send").
//   "Not a single wire": a USB cable's line drawing reaches in and stops short of the device; the gap
//     is dimensioned `air gap`; on "wire" the cable is snipped and falls away.
//   "Read it before you mean it / Every word in plain type": the device comes to centre and its
//     screen types the transaction in plain words, word by word with the singing; "Confirm" lights.
// The green key stays inside the device outline throughout.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog } from '../engine/util';
import { DEVICE, devicePath, keyHead2D, lyricLine, qrMatrix } from './_motifs';

const ink = (a = 1) => rgba('ink', a);
const QR = qrMatrix(7);
const QR_OUT = qrMatrix(11);
const N = QR.length;
// the order modules land in: finders first, then hashed
const ORDER: [number, number][] = [];
{
  const all: [number, number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const finder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    all.push([x, y, finder ? -1 + hash(x, y, 2) * 0.1 : hash(x, y, 3)]);
  }
  all.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of all) ORDER.push([x, y]);
}

// the transaction the screen types (a made-up, shortened address: nothing real)
const TX: { label: string; value: string }[] = [
  { label: 'Send', value: '0.25 BTC' },
  { label: 'To', value: 'bc1q…7f3a' },
  { label: 'Network fee', value: '0.00002 BTC' },
];

function drawQR(c: CanvasRenderingContext2D, m: boolean[][], x0: number, y0: number, size: number, shown: number, col: string) {
  const n = m.length, cell = size / n;
  c.fillStyle = col;
  const cnt = Math.floor(shown * ORDER.length);
  for (let i = 0; i < cnt; i++) {
    const [x, y] = ORDER[i]!;
    if (!m[y]![x]) continue;
    c.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.3, cell + 0.3);
  }
}

export default class Airgap extends Scene {
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    this.L = ['Scan it', 'Not a single wire', 'Read it before', 'Every word in plain'].map((q) => this.ctx.lyrics.get(q));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2, l3, l4] = this.L as [Line, Line, Line, Line];
    const t = f.t;
    const cutAt = (l: Line) => audio.timeOfBeat(Math.floor(audio.beatAt(l.words[0]!.start + 0.02)));
    const c2 = cutAt(l2), c3 = cutAt(l3);
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const c = this.text.ctx;
    this.text.clear(rgba('bone'));

    // paper grid
    c.strokeStyle = rgba('ash', 0.18);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x < W; x += 48) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = 12; y < H; y += 48) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();

    // ---- the device: left third, then (lines 3–4) to centre and larger
    const toC = prog(t, c3 - 0.1, c3 + 0.45, ease.inOutCubic);
    const dx = lerp(W * 0.3, W * 0.5, toC), dy = lerp(H * 0.43, H * 0.43, toC), dw = lerp(330, 430, toC);
    const dh = dw * DEVICE.h;
    const dev = devicePath(dx, dy, dw);
    c.fillStyle = rgba('bone');
    c.fill(dev);
    // the screen (inset), dark once it has something to say
    const inset = dw * 0.06;
    const scr = devicePath(dx, dy, dw - 2 * inset);
    const sh = (dw - 2 * inset) * DEVICE.h;
    const sx0 = dx - (dw - 2 * inset) / 2, sy0 = dy - sh / 2;
    c.fillStyle = rgba('ink2', 1);
    c.fill(scr);
    c.lineWidth = 1.6;
    c.strokeStyle = ink(0.95);
    c.stroke(dev);

    // ---- the phone (lines 1–2), right
    const phoneA = 1 - prog(t, c3 - 0.1, c3 + 0.3);
    const px = W * 0.72, py = H * 0.43, pw = 300, ph = 600;
    if (phoneA > 0) {
      c.globalAlpha = phoneA;
      c.strokeStyle = ink(0.95);
      c.lineWidth = 1.6;
      c.beginPath(); c.roundRect(px - pw / 2, py - ph / 2, pw, ph, 44); c.stroke();
      c.beginPath(); c.roundRect(px - 36, py - ph / 2 + 16, 72, 20, 10); c.stroke();
      c.font = font(F.mono(400), 20);
      c.fillStyle = ink(0.75);
      c.fillText('wallet app · unsigned tx', px - pw / 2, py - ph / 2 - 16);
      // QR assembling on eighth notes from the scene start to "Scan"
      const b0 = audio.beatAt(this.ctx.start), bS = audio.beatAt(l1.words[0]!.start);
      const eighths = Math.max(1, Math.round((bS - b0) * 2));
      const shown = Math.min(1, Math.floor((f.beat - b0) * 2 + 1e-4) / eighths + 0.12);
      const qs = pw * 0.78;
      drawQR(c, QR, px - qs / 2, py - qs / 2, qs, clamp(shown), ink(0.92));
      // "Scan": a scan line runs down the QR, from the device's camera
      const scan = prog(t, l1.words[0]!.start - 0.05, l1.words[1]!.end, ease.inOutCubic);
      if (scan > 0 && scan < 1) {
        const y = py - qs / 2 + qs * scan;
        c.strokeStyle = ink(0.9);
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(px - qs / 2 - 14, y); c.lineTo(px + qs / 2 + 14, y); c.stroke();
        // the beam: two hairlines from the device edge to the scan line
        c.lineWidth = 1;
        c.setLineDash([6, 6]);
        c.beginPath();
        c.moveTo(dx + dw / 2, dy - dh * 0.3); c.lineTo(px - qs / 2 - 14, y);
        c.stroke();
        c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }

    // ---- inside the screen (clip)
    c.save();
    c.clip(scr);
    const sign = wd(l1, 'sign'), send = wd(l1, 'send');
    if (t < c3) {
      // "sign": a signature written across the screen in a white hairline
      const k = prog(t, sign.start - 0.05, sign.end + 0.15, ease.inOutCubic);
      if (k > 0) {
        c.strokeStyle = rgba('bone', 0.95);
        c.lineWidth = 2;
        c.beginPath();
        const n = 90, x0 = dx - dw * 0.3, x1 = dx + dw * 0.3;
        for (let i = 0; i <= n * k; i++) {
          const u = i / n;
          const x = lerp(x0, x1, u) + Math.sin(u * 31) * 10;
          const y = dy + Math.sin(u * 17 + 1) * 26 * (1 - u * 0.5) + Math.cos(u * 43) * 8;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
      // "send": the device's own QR (the signature) appears
      const ks = prog(t, send.start - 0.05, send.start + 0.2);
      if (ks > 0) {
        const qs = dw * 0.62;
        c.fillStyle = rgba('bone');
        c.globalAlpha = ks;
        c.fillRect(dx - qs / 2 - 10, dy - qs / 2 - 10, qs + 20, qs + 20);
        c.globalAlpha = 1;
        drawQR(c, QR_OUT, dx - qs / 2, dy - qs / 2, qs, ks, ink(0.95));
      }
    } else {
      // plain-type transaction, word by word with lines 3–4
      const words = [...l3.words, ...l4.words];
      let sung = 0;
      for (const w of words) sung += Lyrics.wordProgress(w, t) > 0 ? 1 : 0;
      const frac = sung / words.length;
      const rows = TX.length;
      const pad = 26;
      c.font = font(F.mono(400), 20);
      c.fillStyle = rgba('ash', 0.8);
      c.fillText('Review transaction', sx0 + pad, sy0 + pad + 58);
      for (let r = 0; r < rows; r++) {
        const k = clamp(frac * (rows + 0.6) - r); // each row types as its share of words is sung
        if (k <= 0) continue;
        const y = sy0 + 150 + r * 108;
        c.font = font(F.mono(400), 22);
        c.fillStyle = rgba('ash', 0.85);
        c.fillText(TX[r]!.label, sx0 + pad, y);
        const v = TX[r]!.value;
        c.font = font(F.mono(500), 40);
        c.fillStyle = rgba('bone');
        c.fillText(v.slice(0, Math.ceil(v.length * k)), sx0 + pad, y + 42);
      }
      // "Confirm" lights on "type"
      const type = wd(l4, 'type');
      const kc = prog(t, type.start, type.start + 0.25, ease.outCubic);
      const bw = dw - 2 * inset - 2 * pad, bh = 64, by = sy0 + sh - pad - bh;
      c.strokeStyle = rgba('graphite', 1);
      c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(sx0 + pad, by, bw, bh, 32); c.stroke();
      if (kc > 0) {
        c.globalAlpha = kc;
        c.fillStyle = rgba('signal');
        c.beginPath(); c.roundRect(sx0 + pad, by, bw, bh, 32); c.fill();
        c.globalAlpha = 1;
      }
      c.font = font(F.archivo(100, 700), 28);
      c.fillStyle = kc > 0.5 ? ink() : rgba('ash', 0.9);
      const tw = c.measureText('Confirm').width;
      c.fillText('Confirm', sx0 + pad + (bw - tw) / 2, by + 42);
    }
    c.restore();

    // ---- "send": a hairline leaves the device outline and crosses to the phone (white may cross; green never)
    if (t < c2 + 0.5) {
      const k = prog(t, send.start, send.end + 0.35, ease.inOutCubic);
      const kf = 1 - prog(t, c2, c2 + 0.5);
      if (k > 0 && kf > 0) {
        const ax = dx + dw / 2, ay = dy, bx = px - pw / 2, by = py;
        c.globalAlpha = kf;
        c.strokeStyle = ink(0.9);
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(lerp(ax, bx, k), lerp(ay, by, k)); c.stroke();
        c.globalAlpha = 1;
      }
    }

    // ---- "Not a single wire": a USB-C cable reaches up to the device's bottom edge and stops short
    if (t >= c2 - 0.2 && t < c3 + 0.2) {
      const nt = wd(l2, 'not'), sing = wd(l2, 'single'), wire = wd(l2, 'wire');
      const reach = prog(t, nt.start - 0.2, nt.end + 0.35, ease.outCubic);
      const snip = prog(t, wire.start, wire.start + 0.5, ease.inCubic);
      const fade = 1 - prog(t, c3 - 0.1, c3 + 0.2);
      const gap = 90;
      const tipY = dy + dh / 2 + gap; // connector tip stops here
      const P = (u: number) => {
        // from off-frame right, running in low above the caption, then turning up into the device's axis
        const e = 1 - Math.pow(1 - u, 3);
        return { x: lerp(W + 40, dx, e), y: tipY + 60 + 40 * Math.pow(1 - u, 0.6) };
      };
      const conL = 70, conW = 34;
      const drawCable = (u0: number, u1: number, dy2: number) => {
        c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i <= 40; i++) {
          const p = P(lerp(u0, u1, i / 40));
          if (i === 0) c.moveTo(p.x, p.y + dy2); else c.lineTo(p.x, p.y + dy2);
        }
        c.strokeStyle = ink(0.95); c.lineWidth = 18; c.stroke();
        c.strokeStyle = rgba('bone'); c.lineWidth = 15; c.stroke();
        c.lineCap = 'butt';
      };
      c.globalAlpha = fade;
      const cutU = 0.55;
      // the part below the cut retracts; the part near the device drops away
      const tipOff = (1 - reach) * 500;
      if (snip <= 0) drawCable(0, 1, tipOff);
      else {
        drawCable(0, cutU - 0.03 - 0.1 * snip, tipOff + snip * 120);
        c.globalAlpha = fade * (1 - snip);
        drawCable(cutU + 0.03, 1, tipOff + snip * snip * 500);
      }
      // connector
      {
        const drop = snip * snip * 500;
        c.globalAlpha = fade * (1 - snip);
        const p = P(1);
        const y = p.y - 60 + tipOff + drop;
        c.fillStyle = rgba('bone');
        c.strokeStyle = ink(0.95);
        c.lineWidth = 1.6;
        c.beginPath(); c.roundRect(p.x - conW / 2, y - 10, conW, conL, 6); c.fill(); c.stroke();
        c.beginPath(); c.roundRect(p.x - conW * 0.32, y - 10 - 26, conW * 0.64, 28, 5); c.stroke();
      }
      c.globalAlpha = fade;
      // the gap, dimensioned, on "single"
      const kg = prog(t, sing.start - 0.05, sing.start + 0.3, ease.outExpo);
      if (kg > 0) {
        const x = dx + 60, y0 = dy + dh / 2 + 6, y1 = tipY - 38;
        c.globalAlpha = fade * kg;
        c.strokeStyle = ink(0.85);
        c.lineWidth = 1.2;
        c.setLineDash([5, 5]);
        c.beginPath(); c.moveTo(dx, y0); c.lineTo(dx, y1); c.stroke();
        c.setLineDash([]);
        c.beginPath();
        c.moveTo(x - 8, y0); c.lineTo(x + 8, y0);
        c.moveTo(x - 8, y1); c.lineTo(x + 8, y1);
        c.moveTo(x, y0); c.lineTo(x, y1);
        c.stroke();
        c.font = font(F.mono(500), 24);
        c.fillStyle = ink(0.9);
        c.fillText('air gap', x + 18, (y0 + y1) / 2 + 8);
      }
      // the snip mark
      if (snip > 0 && snip < 1) {
        const p = P(cutU);
        c.globalAlpha = fade * (1 - snip);
        c.strokeStyle = ink(1);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(p.x - 26, p.y + tipOff - 26); c.lineTo(p.x + 26, p.y + tipOff + 26);
        c.moveTo(p.x + 26, p.y + tipOff - 26); c.lineTo(p.x - 26, p.y + tipOff + 26);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    // ---- the key: green, inside the outline (top of the screen area, above the content)
    keyHead2D(c, dx, sy0 + 24, 0.5, 0.75 + 0.25 * f.a.kick);

    // ---- the sung line
    const line = t < c2 ? l1 : t < c3 ? l2 : t < cutAt(l4) ? l3 : l4;
    lyricLine(c, line, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: ink(), off: ink(0.28) });

    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.12, vignette: 0.18, halation: 0 };
  }
}
