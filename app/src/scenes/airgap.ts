// `airgap` (pre-chorus) — docs/TREATMENT.md. The real device in the studio (end's light), with the
// air gap drawn as 3D hairlines; the sung words are on its screen or set in its space, never captions.
//   "Scan it, sign it, send it": over the device's shoulder, a phone stands further back on the right
//     (a hairline wireframe, its screen a QR). The device's screen carries the line itself, three rows
//     lit word by word, over what it is doing: on "Scan" light leaves the phone's QR as travelling
//     dashes and converges behind the device into its rear camera; on "sign" a signature is written
//     on the screen; on "send" the screen shows its own QR and white hairlines leave the device's
//     outline for the phone (white may cross the boundary; green never does).
//   "Not a single wire": the camera drops to the bottom edge. A USB-C cable (a wireframe tube) snakes
//     up towards the port and stops short; the gap is dimensioned `air gap` in the world; on "wire"
//     the cable is cut and its end falls away. The line is set in the world beside it.
//   "Read it before you mean it / Every word in plain type": the camera rises to the screen, three-
//     quarter and close: the review screen's heading is the sung line; the transaction types itself in
//     plain words below; the knob slides left to right on "type" ("Slide to confirm" → "Confirmed"),
//     and a signature leaves the outline as three hairlines flying off to the right, into the chorus.
// Under the whole plate a hairline floor recedes into the dark (faded out for the low bottom-edge shot).
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, glyphX } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog } from '../engine/util';
import { DEVICE, qrMatrix } from './_motifs';
import { Device3D, SCREEN, orbit, outline, type DevicePose, type V3 } from './_device3d';
import { add, camera3, fill3D, glow3D, lyric3D, mix3, mul, onPlane, path3D, plane, rrect3D, studio, text3D, toW, type Plane } from './_space';

type RGB = [number, number, number];
const QR = qrMatrix(7);
const QR_OUT = qrMatrix(11);
const N = QR.length;
const TH = DEVICE.t / 2;
/** Rear camera, device space. */
const LENS: V3 = [-DEVICE.cam.x, DEVICE.cam.y, -TH];
const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

// the transaction the screen types (a made-up, shortened address: nothing real)
const TX: { label: string; value: string }[] = [
  { label: 'Send', value: '0.25 BTC' },
  { label: 'To', value: 'bc1q…7f3a' },
  { label: 'Network fee', value: '0.00002 BTC' },
];

/** The phone: a plane in the world (centre, facing yaw), its size (world units). */
const PHONE = { c: [2.35, 0.15, -2.4] as V3, yaw: -0.55, w: 1.25, h: 2.6, r: 0.2, d: 0.14 };
const phonePl: Plane = plane(PHONE.c, PHONE.yaw);

/** A sung line as rows on the device screen (Canvas2D, screen px): unsung dim, sung bone. */
function screenLyric(c: CanvasRenderingContext2D, line: Line, t: number, rows: number[][], x: number, y: number, size: number, lead: number, alpha = 1) {
  const fam = F.archivo(100, 800);
  c.font = font(fam, size);
  rows.forEach((row, r) => {
    const txt = row.map((i) => line.words[i]!.w).join(' ');
    let ci = 0;
    for (const i of row) {
      const w = line.words[i]!;
      const i0 = txt.indexOf(w.w, ci);
      ci = i0 + w.w.length;
      const k = Lyrics.wordProgress(w, t);
      const land = k > 0 ? ease.outExpo(clamp(k * 4)) : 0;
      c.globalAlpha = alpha;
      c.fillStyle = k > 0 ? rgba('bone') : rgba('bone', 0.22);
      c.fillText(w.w, x + glyphX(txt, i0, fam, size), y + r * lead + (k > 0 ? (1 - land) * 10 : 0));
    }
  });
  c.globalAlpha = 1;
}

function drawQR(c: CanvasRenderingContext2D, m: boolean[][], x0: number, y0: number, size: number, shown: number, col: string) {
  const n = m.length, cell = size / n;
  c.fillStyle = col;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!m[y]![x] || hash(x, y, 3) > shown) continue;
    c.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.3, cell + 0.3);
  }
}

/** Slide to confirm: the knob slides left to right (`slide`); "Confirmed" once it lands. */
function slider(c: CanvasRenderingContext2D, slide: number, pad: number) {
  const sw = SCREEN.w, sh = SCREEN.h;
  const tw = sw - 2 * pad, th = 104, ty = sh - pad - th - 10, r = th / 2;
  const kx = pad + r + (tw - th) * slide;
  c.fillStyle = 'rgba(38,42,39,1)';
  c.beginPath(); c.roundRect(pad, ty, tw, th, r); c.fill();
  if (slide > 0) {
    c.fillStyle = rgba('signal', 0.35 + 0.65 * (slide >= 1 ? 1 : 0));
    c.beginPath(); c.roundRect(pad, ty, kx - pad + r, th, r); c.fill();
  }
  c.font = font(F.archivo(100, 700), 36);
  const label = slide >= 1 ? 'Confirmed' : 'Slide to confirm';
  const lw = c.measureText(label).width;
  c.fillStyle = slide >= 1 ? rgba('ink') : rgba('ash', 0.9 * (1 - slide));
  c.fillText(label, pad + (tw - lw) / 2 + (slide >= 1 ? 0 : r * 0.6), ty + th / 2 + 13);
  c.fillStyle = slide >= 1 ? rgba('ink') : rgba('bone');
  c.beginPath(); c.arc(kx, ty + r, r - 10, 0, Math.PI * 2); c.fill();
  c.strokeStyle = slide >= 1 ? rgba('signal') : rgba('ink');
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  if (slide >= 1) { c.moveTo(kx - 16, ty + r + 2); c.lineTo(kx - 4, ty + r + 14); c.lineTo(kx + 18, ty + r - 12); }
  else { c.moveTo(kx - 6, ty + r - 14); c.lineTo(kx + 8, ty + r); c.lineTo(kx - 6, ty + r + 14); }
  c.stroke();
  c.lineCap = 'butt';
}

/** Blend two poses (camera, target, fov, device placement). */
function blend(a: DevicePose, b: DevicePose, k: number): DevicePose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const r = (x: V3 | undefined, y: V3 | undefined) => mix3(x ?? [0, 0, 0], y ?? [0, 0, 0], k);
  return { ...b, cam: r(a.cam, b.cam), tgt: r(a.tgt, b.tgt), fov: lerp(a.fov, b.fov, k), pos: r(a.pos, b.pos), rot: r(a.rot, b.rot) };
}

export default class Airgap extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  back = new LineBatch(20000, { screen2D: false, blend: 'add' });
  front = new LineBatch(20000, { screen2D: false, blend: 'add' });
  L: Line[] = [];
  outl = outline(128, 0.03);
  /** how much of the frame is the low bottom-edge set-up (the floor would sit at eye level) */
  wB = 0;

  override init() {
    this.L = ['Scan it', 'Not a single wire', 'Read it before', 'Every word in plain'].map((q) => this.ctx.lyrics.get(q));
  }

  cutAt(l: Line) {
    const au = this.ctx.audio;
    return au.timeOfBeat(Math.floor(au.beatAt(l.words[0]!.start + 0.02)));
  }

  /** The camera: three set-ups joined by moves on the cuts between lines. */
  pose(t: number): DevicePose {
    const [, l2, l3] = this.L as [Line, Line, Line, Line];
    const c2 = this.cutAt(l2), c3 = this.cutAt(l3), t0 = this.ctx.start, t1 = this.ctx.end;
    const kA = prog(t, t0, c2);
    const TA: V3 = [0.95, 0.05, -0.9];
    const A: DevicePose = {
      cam: orbit(TA, lerp(4.8, 4.4, kA), lerp(-0.2, -0.3, kA), 0.06), tgt: TA, fov: 0.55,
      pos: [0, 0, 0], rot: [-0.32, 0, 0],
    };
    const kB = prog(t, c2, c3);
    const TB: V3 = [0.12, -1.02, 0];
    const B: DevicePose = {
      cam: orbit(TB, lerp(2.9, 2.6, kB), lerp(0.42, 0.34, kB), lerp(-0.1, -0.05, kB)), tgt: TB, fov: 0.55,
      pos: [0, 0, 0], rot: [-0.32, 0, 0],
    };
    const kC = prog(t, c3, t1, ease.inOutQuad);
    const TC: V3 = [-0.28, 0.0, 0];
    const C: DevicePose = {
      cam: orbit(TC, lerp(3.35, 3.05, kC), lerp(-0.12, -0.2, kC), lerp(0.05, 0.02, kC)), tgt: TC, fov: 0.6,
      pos: [0, 0, 0], rot: [-0.3, 0, 0],
    };
    const mAB = prog(t, c2 - 0.3, c2 + 0.45, ease.inOutCubic);
    const mBC = prog(t, c3 - 0.3, c3 + 0.5, ease.inOutCubic);
    this.wB = mAB * (1 - mBC);
    return blend(blend(A, B, mAB), C, mBC);
  }

  /** The device's screen: the line of the moment on top, the work below. */
  screen(t: number) {
    const [l1, , l3, l4] = this.L as [Line, Line, Line, Line];
    const c = this.dev.screen.ctx;
    const sw = SCREEN.w, sh = SCREEN.h, pad = 44;
    this.dev.screen.clear(rgba('ink'));
    const c3 = this.cutAt(l3);
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    if (t < c3) {
      // three rows: Scan it, / sign it, / send it
      screenLyric(c, l1, t, [[0, 1], [2, 3], [4, 5]], pad, 120, 80, 88);
      const sign = wd(l1, 'sign'), send = wd(l1, 'send');
      const top = 400, S = sw - 2 * pad - 60, cx = sw / 2, cy = top + S / 2;
      const mode = t < sign.start - 0.05 ? 0 : t < send.start - 0.05 ? 1 : 2;
      if (mode === 0) {
        // viewfinder: brackets, the phone's code arriving, a green scan line (the key's colour stays inside)
        c.strokeStyle = rgba('bone', 0.85);
        c.lineWidth = 6;
        const h = S / 2, Lb = 56;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          c.beginPath();
          c.moveTo(cx + sx * h, cy + sy * (h - Lb)); c.lineTo(cx + sx * h, cy + sy * h); c.lineTo(cx + sx * (h - Lb), cy + sy * h);
          c.stroke();
        }
        const k = prog(t, l1.words[0]!.start - 0.1, l1.words[1]!.end, ease.outCubic);
        drawQR(c, QR, cx - S * 0.4, cy - S * 0.4, S * 0.8, k, rgba('bone', 0.8));
        c.fillStyle = rgba('signal', 0.9);
        c.fillRect(cx - h, cy - h + S * ((t * 1.6) % 1), S, 4);
      } else if (mode === 1) {
        // a signature, written in a white hairline
        const k = prog(t, sign.start - 0.05, sign.end + 0.2, ease.inOutCubic);
        c.strokeStyle = rgba('bone', 0.95);
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.beginPath();
        const n = 120, x0 = pad + 20, x1 = sw - pad - 20;
        for (let i = 0; i <= n * k; i++) {
          const u = i / n;
          const x = lerp(x0, x1, u) + Math.sin(u * 31) * 18;
          const y = cy + Math.sin(u * 17 + 1) * 70 * (1 - u * 0.5) + Math.cos(u * 43) * 18;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
        c.lineCap = 'butt';
        c.font = font(F.mono(400), 26);
        c.fillStyle = rgba('ash', 0.9);
        c.fillText('signed on device', pad, sh - 70);
      } else {
        // its own QR: the signature, to be scanned back
        const k = prog(t, send.start - 0.05, send.start + 0.25, ease.outExpo);
        c.globalAlpha = k;
        c.fillStyle = rgba('bone', 0.9);
        c.beginPath(); c.roundRect(cx - S / 2, cy - S / 2, S, S, 22); c.fill();
        c.globalAlpha = 1;
        drawQR(c, QR_OUT, cx - S * 0.42, cy - S * 0.42, S * 0.84, k, rgba('ink'));
      }
      return;
    }
    // ---- review: the heading is the sung line; the transaction in plain words; slide to confirm
    const c4 = this.cutAt(l4);
    const x4 = prog(t, c4 - 0.15, c4 + 0.15);
    if (x4 < 1) screenLyric(c, l3, t, [[0, 1, 2], [3, 4, 5]], pad, 110, 60, 70, 1 - x4);
    if (x4 > 0) screenLyric(c, l4, t, [[0, 1, 2], [3, 4]], pad, 110, 60, 70, x4);
    const words = [...l3.words, ...l4.words];
    let sung = 0;
    for (const w of words) sung += Lyrics.wordProgress(w, t) > 0 ? 1 : 0;
    const frac = sung / words.length;
    c.fillStyle = 'rgba(60,64,61,1)';
    c.fillRect(pad, 222, sw - 2 * pad, 2);
    for (let r = 0; r < TX.length; r++) {
      const k = clamp(frac * (TX.length + 0.6) - r);
      if (k <= 0) continue;
      const y = 300 + r * 140;
      c.font = font(F.mono(400), 28);
      c.fillStyle = rgba('ash', 0.9);
      c.fillText(TX[r]!.label, pad, y);
      const v = TX[r]!.value;
      c.font = font(F.mono(500), 50);
      c.fillStyle = rgba('bone');
      c.fillText(v.slice(0, Math.ceil(v.length * k)), pad, y + 58);
    }
    const type = wd(l4, 'type');
    slider(c, prog(t, type.start - 0.45, type.start + 0.05, ease.inOutCubic), pad);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const [l1, l2, l3, l4] = this.L as [Line, Line, Line, Line];
    const t = f.t;
    const c2 = this.cutAt(l2), c3 = this.cutAt(l3);
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const pose = this.pose(t);
    const cam = camera3(pose);
    this.screen(t);
    pose.screen = 1;
    const bone = LIN.bone;

    // ---- ground (+ the phone's QR, which sits behind the device)
    const b = this.bg.ctx;
    const gc = this.dev.project(pose, [0, 0, 0]);
    studio(b, gc.x + 120, gc.y);
    const phoneA = 1 - prog(t, c2 + 0.1, c2 + 0.5);
    const scan = wd(l1, 'scan'), send = wd(l1, 'send');
    if (phoneA > 0) {
      // the phone's QR assembles on eighth notes up to "Scan"
      const au = this.ctx.audio;
      const b0 = au.beatAt(this.ctx.start), bS = au.beatAt(scan.start);
      const eighths = Math.max(1, Math.round((bS - b0) * 2));
      const shown = clamp(Math.floor((f.beat - b0) * 2 + 1e-4) / eighths + 0.15);
      const qs = PHONE.w * 0.72, cell = qs / N;
      b.fillStyle = rgba('bone', 0.85 * phoneA);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!QR[y]![x] || hash(x, y, 3) > shown) continue;
        const u = -qs / 2 + x * cell, v = qs / 2 - y * cell + 0.15;
        fill3D(b, pose, [onPlane(phonePl, u, v, 0.01), onPlane(phonePl, u + cell, v, 0.01), onPlane(phonePl, u + cell, v - cell, 0.01), onPlane(phonePl, u, v - cell, 0.01)]);
      }
      // after "send": the phone got it
      const got = prog(t, send.end + 0.1, send.end + 0.3);
      if (got > 0) {
        b.fillStyle = rgba('bone', got * phoneA);
        text3D(b, pose, 'received · broadcast', F.mono(500), 0.075, phonePl, -qs / 2, 0.01);
      }
    }
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });

    // ---- lines behind the device
    const B = this.back;
    B.clear();
    // a hairline floor under the whole plate, fading into the dark
    if (this.wB < 1) {
      const y = -DEVICE.h / 2 - 0.45, a0 = 0.16 * (1 - this.wB);
      for (let i = -12; i <= 12; i++) {
        for (let j = 0; j < 20; j++) {
          const z0 = 2.5 - j * 0.5, z1 = z0 - 0.5, x = i * 0.5;
          const fa = a0 * Math.exp(-(Math.abs(x - 0.6) / 4 + Math.abs(z0 + 1) / 4));
          B.seg(x, y, z0, x, y, z1, 1, ...sc(bone, fa), 1);
          B.seg(x, y, z0, x + 0.5, y, z0, 1, ...sc(bone, fa), 1);
        }
      }
    }
    if (phoneA > 0) {
      // the phone as a wireframe slab
      const fr = rrect3D(phonePl, 0, 0, PHONE.w, PHONE.h, PHONE.r, 8, 0);
      const bk = rrect3D(phonePl, 0, 0, PHONE.w, PHONE.h, PHONE.r, 8, -PHONE.d);
      const scr = rrect3D(phonePl, 0, 0, PHONE.w - 0.1, PHONE.h - 0.1, PHONE.r - 0.05, 8, 0.004);
      const a = 0.75 * phoneA;
      path3D(B, fr, 0, 1, 1.4, sc(bone, a), 1, true);
      path3D(B, bk, 0, 1, 1.0, sc(bone, a * 0.45), 1, true);
      path3D(B, scr, 0, 1, 1.0, sc(bone, a * 0.4), 1, true);
      for (const i of [0, 9, 18, 27]) B.seg(...fr[i]!, ...bk[i]!, 1.0, ...sc(bone, a * 0.45), 1);
      // "Scan": light leaves the code and travels into the rear camera (behind the device)
      const ks = prog(t, scan.start - 0.25, scan.start) * (1 - prog(t, wd(l1, 'sign').start, send.start));
      if (ks > 0) {
        const lens = this.dev.toWorld(pose, LENS);
        const qs = PHONE.w * 0.72;
        for (let i = 0; i < 90; i++) {
          const src = onPlane(phonePl, (hash(i, 1) - 0.5) * qs, (hash(i, 2) - 0.5) * qs + 0.15, 0.02);
          const dir = mix3(src, lens, 1);
          for (let d = 0; d < 3; d++) {
            const u = ((t * 0.9 + hash(i, 3) + d / 3) % 1);
            const p0 = mix3(src, dir, u), p1 = mix3(src, dir, Math.min(1, u + 0.07));
            const a2 = ks * 0.9 * Math.sin(Math.PI * u);
            B.seg(...p0, ...p1, 1.1, ...sc(bone, a2 * 1.3), 1);
          }
          B.seg(...src, ...lens, 0.8, ...sc(bone, ks * 0.07), 1);
        }
      }
    }
    if (B.count) B.render(renderer, out, cam);
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    // ---- lines in front
    const Fr = this.front;
    Fr.clear();
    const outl = toW(this.dev, pose, this.outl);
    // "send": white hairlines leave the outline's right side for the phone
    const kS = prog(t, send.start, send.end + 0.4, ease.inOutCubic) * phoneA;
    if (kS > 0) {
      const qs = PHONE.w * 0.72;
      for (let i = 0; i < 24; i++) {
        const a = outl[Math.floor(hash(i, 4) * 26)]!; // along the right-hand side
        const dst = onPlane(phonePl, (hash(i, 5) - 0.5) * qs, (hash(i, 6) - 0.5) * qs + 0.15, 0.02);
        const e = clamp(kS * 1.4 - hash(i, 7) * 0.4);
        if (e <= 0) continue;
        const p = mix3(a, dst, e);
        Fr.seg(...a, ...p, 1.2, ...sc(bone, 1.1), 1);
        if (e < 1) glow3D(Fr, p, 1.6, bone, 0.6);
      }
    }
    // ---- "Not a single wire": the cable
    let gapTxt: V3 | null = null;
    if (t >= c2 - 0.3 && t < c3 + 0.4) {
      gapTxt = this.cable(Fr, t, pose, l2);
    }
    // ---- the review: after "type", a signature leaves the outline, three hairlines off to the right
    const type = wd(l4, 'type');
    const ko = prog(t, type.start + 0.1, this.ctx.end + 0.1, ease.inCubic);
    const kb = prog(t, type.start - 0.2, type.start + 0.5, ease.inOutCubic);
    if (t >= c3 && kb > 0) {
      // the boundary lights round the device as it confirms
      path3D(Fr, outl, 0, kb, 1.4, sc(bone, 0.9 * (1 - ko * 0.5)), 1, true);
    }
    if (ko > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.dev.toWorld(pose, [DEVICE.w / 2 + 0.03, 0.25 - i * 0.18, 0]);
        const far: V3 = add(a, [6, 0.4 - i * 0.15, 1.5]);
        const e = clamp(ko * 1.3 - i * 0.12);
        const p = mix3(a, far, e);
        const tail = mix3(a, far, Math.max(0, e - 0.35));
        Fr.seg(...tail, ...p, 1.6, ...sc(bone, 1.3), 1);
        glow3D(Fr, p, 2, bone, 0.9);
      }
    }
    if (Fr.count) Fr.render(renderer, out, cam);

    // ---- type in the world
    const c = this.text.ctx;
    this.text.clear();
    const fam = F.archivo(100, 800);
    if (t >= c2 - 0.3 && t < c3 + 0.4) {
      const a = prog(t, c2 - 0.2, c2 + 0.3) * (1 - prog(t, c3, c3 + 0.35));
      lyric3D(c, pose, l2, t, plane([-0.22, -1.2, 0.3], 0.3), { family: fam, size: 0.16, on: rgba('bone'), off: rgba('bone', 0.2), align: 'right', rows: [2], leading: 0.2, alpha: a });
      if (gapTxt) {
        const kg = prog(t, wd(l2, 'single').start - 0.05, wd(l2, 'single').start + 0.3, ease.outExpo) * a;
        c.fillStyle = rgba('bone', 0.9 * kg);
        text3D(c, pose, 'air gap', F.mono(500), 0.075, plane(gapTxt, 0.1));
        c.fillStyle = rgba('bone', 0.5 * kg);
        text3D(c, pose, 'no USB · no Bluetooth', F.mono(400), 0.045, plane(add(gapTxt, [0, -0.085, 0]), 0.1));
      }
    }
    comp.draw(renderer, this.text.upload(), out);
    void mul;
    return { bloom: 0.45, vignette: 0.42 };
  }

  /** The USB-C cable reaching up towards the port, stopping short, cut on "wire". Returns where the
   * `air gap` label goes (world). */
  cable(Fr: LineBatch, t: number, pose: DevicePose, l2: Line): V3 {
    const wd = (q: string) => l2.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const nt = wd('not'), sing = wd('single'), wire = wd('wire');
    const reach = prog(t, nt.start - 0.35, nt.end + 0.3, ease.outCubic);
    const snip = prog(t, wire.start, wire.start + 0.6, ease.inCubic);
    const fade = 1 - prog(t, this.cutAt(this.L[2]!) - 0.1, this.cutAt(this.L[2]!) + 0.3);
    const bone = LIN.bone;
    const gap = 0.3;
    const port = this.dev.toWorld(pose, [0, -DEVICE.h / 2, 0]);
    const tipY = port[1] - gap - (1 - reach) * 1.6;
    // the cable's centreline: from off frame lower right, curving up into the port's axis
    const P = (u: number): V3 => {
      const s = 1 - u;
      return [port[0] + 1.9 * s * s, tipY - 0.2 - 1.8 * s * s * (1 - s * 0.3), port[2] + 0.5 * s * s];
    };
    const R = 0.04, cutU = 0.72;
    const tube = (u0: number, u1: number, off: V3, a: number) => {
      const n = 26;
      const ring = (u: number): V3[] => {
        const p = P(u), q = P(Math.min(1, u + 0.01)), d0 = P(Math.max(0, u - 0.01));
        const tng = [q[0] - d0[0], q[1] - d0[1], q[2] - d0[2]] as V3;
        const tl = Math.hypot(...tng) || 1;
        const tt: V3 = [tng[0] / tl, tng[1] / tl, tng[2] / tl];
        // a frame about the tangent
        const ax: V3 = Math.abs(tt[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const n1: V3 = [tt[1] * ax[2] - tt[2] * ax[1], tt[2] * ax[0] - tt[0] * ax[2], tt[0] * ax[1] - tt[1] * ax[0]];
        const nl = Math.hypot(...n1) || 1;
        const nn: V3 = [n1[0] / nl, n1[1] / nl, n1[2] / nl];
        const bb: V3 = [tt[1] * nn[2] - tt[2] * nn[1], tt[2] * nn[0] - tt[0] * nn[2], tt[0] * nn[1] - tt[1] * nn[0]];
        return Array.from({ length: 6 }, (_, k) => {
          const th = (k / 6) * Math.PI * 2;
          return add(add(p, off), add(mul(nn, Math.cos(th) * R), mul(bb, Math.sin(th) * R)));
        });
      };
      let prev = ring(u0);
      for (let i = 1; i <= n; i++) {
        const cur = ring(lerp(u0, u1, i / n));
        for (let k = 0; k < 6; k++) Fr.seg(...prev[k]!, ...cur[k]!, 1.0, ...sc(bone, a * (k % 3 === 0 ? 0.9 : 0.45)), 1);
        if (i % 3 === 0) for (let k = 0; k < 6; k++) Fr.seg(...cur[k]!, ...cur[(k + 1) % 6]!, 0.9, ...sc(bone, a * 0.35), 1);
        prev = cur;
      }
    };
    const fall: V3 = [0.15 * snip, -2.2 * snip * snip, 0];
    if (snip <= 0) tube(0, 1, [0, 0, 0], 0.85 * fade);
    else {
      tube(0, cutU - 0.02, [0, -0.25 * snip, 0], 0.85 * fade * (1 - snip * 0.5));
      tube(cutU + 0.02, 1, fall, 0.85 * fade * (1 - snip));
    }
    // the connector: a small rounded slab at the tip, pointing up into the port
    const tip = add(P(1), snip > 0 ? fall : [0, 0, 0]);
    const cp = plane(add(tip, [0, 0.11, 0]), -0.32);
    const ca = 0.9 * fade * (1 - snip);
    if (ca > 0) {
      path3D(Fr, rrect3D(cp, 0, 0, 0.13, 0.2, 0.03, 4, 0.03), 0, 1, 1.2, sc(bone, ca), 1, true);
      path3D(Fr, rrect3D(cp, 0, 0, 0.13, 0.2, 0.03, 4, -0.03), 0, 1, 1.0, sc(bone, ca * 0.5), 1, true);
      path3D(Fr, rrect3D(cp, 0, 0.14, 0.08, 0.09, 0.02, 4, 0), 0, 1, 1.0, sc(bone, ca * 0.8), 1, true);
    }
    // the gap, dimensioned, on "single"
    const kg = prog(t, sing.start - 0.05, sing.start + 0.3, ease.outExpo) * fade;
    const x = port[0] + 0.32;
    const y0 = port[1] - 0.02, y1 = P(1)[1] + 0.3;
    if (kg > 0) {
      const a = 0.85 * kg;
      Fr.seg(x - 0.05, y0, port[2], x + 0.05, y0, port[2], 1.1, ...sc(bone, a), 1);
      Fr.seg(x - 0.05, y1, port[2], x + 0.05, y1, port[2], 1.1, ...sc(bone, a), 1);
      Fr.seg(x, y0, port[2], x, lerp(y0, y1, kg), port[2], 1.1, ...sc(bone, a), 1);
    }
    // the cut mark
    if (snip > 0 && snip < 1) {
      const p = add(P(cutU), [0, -0.25 * snip, 0]);
      const a = 1 - snip, s = 0.09;
      Fr.seg(p[0] - s, p[1] - s, p[2], p[0] + s, p[1] + s, p[2], 1.6, ...sc(bone, 1.2 * a), 1);
      Fr.seg(p[0] + s, p[1] - s, p[2], p[0] - s, p[1] + s, p[2], 1.6, ...sc(bone, 1.2 * a), 1);
    }
    return [x + 0.08, (y0 + y1) / 2 - 0.03, port[2]];
  }
}
